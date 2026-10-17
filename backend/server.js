// The Book That Reads You — backend.
//
// POST /scan   photo -> visible features + mood   (vision model)
// POST /story  name + genre + features -> story   (text model)
//
// Privacy: the photo lives only in memory for the duration of one request.
// It is never written to disk and never logged.

import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import { scanPrompt, storyPrompt } from './prompts.js'
import { MOCK_FEATURES, mockStory } from './mock.js'
import { rateLimit } from './rateLimit.js'
import {
  HttpError, agreedExtras, describeMeasured, extractJson, hasAnyFeature, moodFromMeasured, parseFeatures, parseGenre,
  parseHeroName, parseImage, parseMeasured, parseMood, parseStory,
} from './validate.js'

const MOCK = process.env.MOCK === '1'
const PORT = Number(process.env.PORT ?? 8000)
// The main model reads the fine details (Kimi K3 thinks before answering, so it guesses less).
// The check models look at the same photo in parallel; a small detail is kept only if one of them saw it too.
const VISION_MODEL = process.env.VISION_MODEL || 'moonshotai/Kimi-K3'
const CHECK_MODELS = process.env.VISION_CHECK_MODELS === 'off'
  ? []
  : (process.env.VISION_CHECK_MODELS || 'google/gemma-3-27b-it,openbmb/MiniCPM-V-4_5').split(',').map((m) => m.trim()).filter(Boolean)
const STORY_MODEL = process.env.STORY_MODEL || 'Qwen/Qwen3-235B-A22B-Instruct-2507'
const API_KEY = process.env.NEBIUS_API_KEY?.trim()

if (!MOCK && (!API_KEY || API_KEY.startsWith('your-'))) {
  console.error(`
  ✋ No Nebius API key found.

  Set one up (takes 30 seconds):
    npm run setup          asks for your key and saves it to backend/.env

  Or copy the template by hand:
    cp .env.example .env   then paste your key into .env

  No key at all? Run with fake data instead:
    npm run mock
`)
  process.exit(1)
}

const client = MOCK
  ? null
  : new OpenAI({
      baseURL: 'https://api.tokenfactory.nebius.com/v1/',
      apiKey: API_KEY,
      maxRetries: 2, // retries 429s, 5xx and network errors with backoff
    })

const FALLBACK = {
  glasses: null,
  hair: 'hair that catches the light',
  expression: 'a curious look',
  clothing: 'a favourite top',
  extras: [],
  mood: 'neutral',
}

const app = express()
app.set('trust proxy', 'loopback') // correct req.ip behind a local proxy (e.g. Vite's /api proxy)
app.disable('x-powered-by')
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }))
app.use(express.json({ limit: '14mb' })) // two images of up to 5 MB each, as base64

const limit = rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_PER_MIN ?? 20) })

// Express 5 forwards rejected promises from async handlers to the error handler below.

app.post('/scan', limit, async (req, res) => {
  if (MOCK) {
    const mood = parseMood(req.query.mood ?? 'happy')
    return res.json({ features: MOCK_FEATURES[mood] })
  }

  // `image`: the full photo. `face` (optional): a sharp close-up of the face from the camera's full resolution.
  // `measured` (optional): expression numbers from the browser's face tracker.
  let images = [parseImage(req.body?.image)]
  if (req.body?.face) images.push(parseImage(req.body.face))
  const measured = parseMeasured(req.body?.measured)
  req.body = null

  const prompt = scanPrompt({ closeUp: images.length > 1, measured: measured && describeMeasured(measured) })
  const content = [
    { type: 'text', text: prompt },
    ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } })),
  ]
  const look = (model, timeout, extra = {}) =>
    client.chat.completions
      .create({ model, temperature: 0, max_tokens: 4000, messages: [{ role: 'user', content }], ...extra }, { timeout })
      .then((reply) => extractJson(reply.choices[0]?.message?.content))

  // All models look at the same photo at the same time, so the checks add no wait.
  const [main, ...checks] = await Promise.allSettled([
    // Kimi K3 with thinking off: ~1 s instead of ~4 s, and in testing it caught the same details with less filler.
    look(VISION_MODEL, 30_000, VISION_MODEL.startsWith('moonshotai/') ? { thinking: { type: 'disabled' } } : {}),
    ...CHECK_MODELS.map((m) => look(m, 20_000)),
  ])
  content.length = 0 // drop our references to the photos as soon as we're done
  images = null

  if (main.status === 'rejected') {
    const e = main.reason
    if (e instanceof OpenAI.AuthenticationError) throw e // a bad key should be loud, not hidden
    // Model, timeout or parse failure: still give the reader a story.
    console.warn(`/scan fell back to generic features: ${e.name}: ${e.message}`)
    return res.json({ features: FALLBACK, fallback: true })
  }

  const raw = main.value
  if (raw?.noFace) throw new HttpError(422, "The book couldn't see a face. Look straight at the camera and try again.")
  const features = parseFeatures(raw)

  // Keep only small details at least one check model also saw. If every check failed, keep none
  // rather than risk a made-up one.
  if (CHECK_MODELS.length) {
    const seen = checks.filter((c) => c.status === 'fulfilled' && c.value && !c.value.noFace).map((c) => parseFeatures(c.value).extras)
    if (!seen.length) console.warn('/scan: every check model failed, dropping small details')
    features.extras = agreedExtras(features.extras, ...seen)
  }

  // The face tracker's numbers beat a guess from a still photo.
  features.mood = moodFromMeasured(measured) ?? features.mood

  res.json(hasAnyFeature(features) ? { features } : { features: FALLBACK, fallback: true })
})

app.post('/story', limit, async (req, res) => {
  const name = parseHeroName(req.body?.heroName)
  const genre = parseGenre(req.body?.genre)
  const features = parseFeatures(req.body?.features)

  if (MOCK) return res.json(mockStory(name, req.query.mood ? parseMood(req.query.mood) : features.mood))

  const prompt = storyPrompt(name, genre, features)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const reply = await client.chat.completions.create(
        { model: STORY_MODEL, temperature: 1.0, max_tokens: 1400, messages: [{ role: 'user', content: prompt }] },
        { timeout: 30_000 },
      )
      const story = parseStory(extractJson(reply.choices[0]?.message?.content))
      return res.json({ ...story, mood: features.mood })
    } catch (e) {
      if (e instanceof OpenAI.APIError && e.status === 401) throw e
      console.warn(`/story attempt ${attempt} failed: ${e.name}: ${e.message}`)
    }
  }
  throw new HttpError(502, "The book couldn't finish the story. Please try again.")
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, mock: MOCK, vision: VISION_MODEL, visionChecks: CHECK_MODELS, story: STORY_MODEL })
})

app.use((_req, res) => res.status(404).json({ detail: 'Not found. Try POST /scan or POST /story.' }))

// One error shape for everything: { detail: "message a kid could read" }
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ detail: err.message })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ detail: 'The request body is not valid JSON.' })
  if (err.type === 'entity.too.large') return res.status(413).json({ detail: 'The photo is too big. Resize it to about 768px wide.' })
  if (err instanceof OpenAI.APIError && err.status === 401) {
    console.error('Nebius rejected the API key. Run `npm run setup` to set a new one.')
    return res.status(500).json({ detail: 'The book’s API key is not working. Ask the team to check backend/.env.' })
  }
  console.error(`Unexpected error: ${err.name}: ${err.message}`) // never log the request body (it holds the photo)
  res.status(500).json({ detail: 'Something went wrong inside the book. Please try again.' })
})

app.listen(PORT, () => {
  console.log(`📖 Book backend on http://localhost:${PORT}${MOCK ? ' (MOCK mode: fake data, no API calls)' : ''}`)
})
