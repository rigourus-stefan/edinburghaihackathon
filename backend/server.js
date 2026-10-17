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
import { SCAN_PROMPT, storyPrompt } from './prompts.js'
import { MOCK_FEATURES, mockStory } from './mock.js'
import { rateLimit } from './rateLimit.js'
import {
  HttpError, agreedExtras, extractJson, hasAnyFeature, parseFeatures, parseGenre, parseHeroName, parseImage, parseMood, parseStory,
} from './validate.js'

const MOCK = process.env.MOCK === '1'
const PORT = Number(process.env.PORT ?? 8000)
const VISION_MODEL = process.env.VISION_MODEL || 'google/gemma-3-27b-it'
const STORY_MODEL = process.env.STORY_MODEL || 'Qwen/Qwen3-235B-A22B-Instruct-2507'
// A second, different vision model double-checks the extras. Set VISION_CHECK_MODEL=off to skip it.
const CHECK_MODEL = process.env.VISION_CHECK_MODEL === 'off' ? null : process.env.VISION_CHECK_MODEL || 'openbmb/MiniCPM-V-4_5'
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
app.use(express.json({ limit: '7mb' })) // a 5 MB image is ~6.7 MB as base64

const limit = rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_PER_MIN ?? 20) })

// Express 5 forwards rejected promises from async handlers to the error handler below.

app.post('/scan', limit, async (req, res) => {
  if (MOCK) {
    const mood = parseMood(req.query.mood ?? 'happy')
    return res.json({ features: MOCK_FEATURES[mood] })
  }

  let image = parseImage(req.body?.image)
  const look = (model) =>
    client.chat.completions
      .create(
        {
          model,
          temperature: 0,
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: SCAN_PROMPT },
              { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
            ],
          }],
        },
        { timeout: 20_000 },
      )
      .then((reply) => extractJson(reply.choices[0]?.message?.content))

  // Both models look at the same photo at the same time, so the check adds no wait.
  const [main, check] = await Promise.allSettled([look(VISION_MODEL), CHECK_MODEL ? look(CHECK_MODEL) : null])
  image = null // drop our reference to the photo as soon as we're done
  req.body = null

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

  // Keep only extras the second model also saw. If the check failed, keep none rather than risk a made-up one.
  if (CHECK_MODEL) {
    const checked = check.status === 'fulfilled' && check.value && !check.value.noFace ? parseFeatures(check.value).extras : []
    if (check.status === 'rejected') console.warn(`/scan check model failed, dropping extras: ${check.reason?.message}`)
    features.extras = agreedExtras(features.extras, checked)
  }

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
        { model: STORY_MODEL, temperature: 1.0, max_tokens: 900, messages: [{ role: 'user', content: prompt }] },
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
  res.json({ ok: true, mock: MOCK, vision: VISION_MODEL, visionCheck: CHECK_MODEL, story: STORY_MODEL })
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
