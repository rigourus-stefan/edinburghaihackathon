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

const MOCK = process.env.MOCK === '1'
const PORT = Number(process.env.PORT ?? 8000)
const VISION_MODEL = process.env.VISION_MODEL ?? 'google/gemma-3-27b-it'
const STORY_MODEL = process.env.STORY_MODEL ?? 'Qwen/Qwen3-235B-A22B-Instruct-2507'

if (!MOCK && !process.env.NEBIUS_API_KEY) {
  console.error('Missing NEBIUS_API_KEY. Put it in backend/.env, or run `npm run mock`.')
  process.exit(1)
}

const client = MOCK
  ? null
  : new OpenAI({ baseURL: 'https://api.tokenfactory.nebius.com/v1/', apiKey: process.env.NEBIUS_API_KEY })

const MOODS = ['happy', 'sad', 'neutral']
const GENRES = ['adventure', 'space', 'fantasy', 'mystery']

const app = express()
app.use(cors())
app.use(express.json({ limit: '8mb' }))

// ---------- helpers ----------

/** Pull the first JSON object out of a model reply (handles ``` fences and chatter). */
function extractJson(text) {
  const match = (text ?? '').match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON object in reply')
  return JSON.parse(match[0])
}

const EMPTY = new Set(['', 'none', 'null', 'n/a', 'no glasses', 'not visible'])

function clean(value) {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return EMPTY.has(v.toLowerCase()) ? null : v.slice(0, 80)
}

const FALLBACK = {
  glasses: null,
  hair: 'hair that catches the light',
  expression: 'a curious look',
  clothing: 'a favourite top',
  extras: [],
  mood: 'neutral',
}

// ---------- /scan ----------

const SCAN_PROMPT = `You are the eyes of a magical storybook for children. Look at the photo of the person and describe ONLY what is plainly visible, in short, kind, concrete phrases a child would recognise (3-7 words each).

Return ONLY a JSON object, no other text:
{
  "glasses": "describe their glasses, or null if they wear none",
  "hair": "colour, length and style, e.g. 'short curly brown hair', or a hat if hair is hidden",
  "expression": "their facial expression right now, e.g. 'big toothy grin', 'small shy smile', 'thoughtful frown', 'droopy, tired eyes'",
  "clothing": "the most visible clothing item with its colour, e.g. 'green zip-up hoodie'",
  "extras": ["up to 3 other visible things: accessories, headphones, earrings, freckles, a cap, something interesting in the background"],
  "mood": "exactly one of: happy, sad, neutral — read it honestly from the facial expression"
}

Strict rules:
- NEVER mention or guess race, ethnicity, skin colour, age, weight, body size, health, disability, gender or attractiveness.
- No judgements about looks. Describe, don't rate.
- If something is not visible, use null (or an empty list for extras).`

app.post('/scan', async (req, res) => {
  if (MOCK) {
    return res.json({
      features: {
        glasses: 'round black glasses',
        hair: 'short curly brown hair',
        expression: 'big grin',
        clothing: 'green hoodie',
        extras: ['headphones round neck'],
        mood: 'happy',
      },
    })
  }

  let image = String(req.body?.image ?? '')
  if (image.startsWith('data:')) image = image.slice(image.indexOf(',') + 1)
  if (image.length < 1000) return res.status(400).json({ detail: 'The photo was empty. Please try again.' })

  let raw
  try {
    const reply = await client.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.2,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: SCAN_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
        ],
      }],
    })
    raw = extractJson(reply.choices[0].message.content)
  } catch (e) {
    // Model or parse failure: still give the kid a story.
    console.warn(`/scan fell back to generic features: ${e.name}`)
    return res.json({ features: FALLBACK })
  } finally {
    image = null // drop our reference to the photo as soon as we're done
    req.body = null
  }

  const mood = String(raw.mood ?? 'neutral').toLowerCase().trim()
  const features = {
    glasses: clean(raw.glasses),
    hair: clean(raw.hair),
    expression: clean(raw.expression),
    clothing: clean(raw.clothing),
    extras: (Array.isArray(raw.extras) ? raw.extras : []).map(clean).filter(Boolean).slice(0, 3),
    mood: MOODS.includes(mood) ? mood : 'neutral',
  }
  const anything = features.glasses || features.hair || features.expression || features.clothing
  res.json({ features: anything ? features : FALLBACK })
})

// ---------- /story ----------

// How the hero's real face right now shapes the story's emotional arc.
const MOOD_ARCS = {
  happy:
    "The hero is beaming. Their joy is contagious and is literally a power in this world: " +
    'it lights dark places, wakes sleeping things, or makes grumpy creatures laugh. ' +
    'Build a bright, bouncy, funny adventure where that happiness is what saves the day. ' +
    'Give it real stakes so the joy has something to push against.',
  sad:
    'The hero looks a little sad today. Do NOT pretend they are happy and do not tell them to cheer up. ' +
    'Start the story by gently noticing the feeling (the sky in this world has gone grey too, or a creature ' +
    "is also missing something). Let the hero's quiet, feeling heart be what lets them notice or understand " +
    'something everyone else missed. Give it a warm, tender, hopeful ending: not everything is fixed, ' +
    'but the hero is not alone, and the world is a little brighter because of them.',
  neutral:
    'The hero has a calm, steady, thoughtful face. They are the cool head in a chaotic world: ' +
    'while everyone else panics, they watch, think and notice. Build a clever, curious story with a ' +
    "satisfying puzzle or surprise, where the hero's calm focus is the key. End with a small, delightful twist.",
}

const GENRE_FLAVOUR = {
  adventure: 'a wild-places adventure: jungles, cliffs, hidden maps, rope bridges, treasure',
  space: 'a space adventure: starships, odd planets, friendly aliens, comets, zero gravity',
  fantasy: 'a fantasy tale: dragons, enchanted forests, talking animals, spells, castles',
  mystery: 'a mystery: a puzzling disappearance, clues, secret passages, a surprising culprit',
}

// Random sparks so two scans of the same face never produce the same story.
const SPARKS = [
  'a sidekick who only speaks in rhymes', 'a map that redraws itself', 'a door in an impossible place',
  'a creature made of something unexpected (jelly, music, fog, buttons)', 'a villain who is secretly lonely',
  'weather that behaves like a living animal', 'an object that remembers everything it has seen',
  'a ticking deadline: something must happen before sunset', 'a tiny thing that turns out to be enormous',
  'a library where the books argue with each other', 'a shadow that wanders off on its own',
  'a train that only runs on Tuesdays', 'a moon that has lost its glow', 'a lighthouse with no sea',
  'an upside-down town', 'a whispering key', 'a backwards-running clock', 'a garden that grows sounds',
]

function pickSparks(n) {
  return [...SPARKS].sort(() => Math.random() - 0.5).slice(0, n)
}

function describe(f) {
  const parts = []
  if (f.glasses) parts.push(`glasses: ${f.glasses}`)
  if (f.hair) parts.push(`hair: ${f.hair}`)
  if (f.expression) parts.push(`expression: ${f.expression}`)
  if (f.clothing) parts.push(`clothing: ${f.clothing}`)
  for (const e of f.extras ?? []) parts.push(`extra: ${e}`)
  return parts
}

app.post('/story', async (req, res) => {
  const name = String(req.body?.heroName ?? '').trim().slice(0, 40)
  if (!name) return res.status(400).json({ detail: 'The hero needs a name.' })
  const genre = GENRES.includes(req.body?.genre) ? req.body.genre : 'adventure'
  const f = req.body?.features ?? FALLBACK
  const mood = MOODS.includes(f.mood) ? f.mood : 'neutral'

  if (MOCK) {
    return res.json({
      mood,
      title: `${name} and the Lost Comet`,
      pages: [
        `${name} pushed up their round black glasses and squinted at the sky. One star was blinking strangely.`,
        `"That's not a star," said ${name}, with a big grin. "That's a comet, and it's lost!"`,
        `Pulling the green hoodie tight against the cold of space, ${name} steered the rocket towards it.`,
        `The comet was shy, but ${name}'s headphones played a tune it loved, and it followed them all the way home.`,
      ],
    })
  }

  const [spark1, spark2] = pickSparks(2)
  const prompt = `Write a short, original children's story (ages 6-11) starring a real child named ${name}.
The magical book has just looked at ${name}'s face, and the story is built from exactly what it saw.

Genre: ${GENRE_FLAVOUR[genre]}

What the book saw:
${describe(f).map((p) => `- ${p}`).join('\n')}

The hero's mood right now is "${mood}". This shapes the whole emotional arc:
${MOOD_ARCS[mood]}

Creative sparks to weave in (make them your own, surprise the reader): ${spark1}; ${spark2}.

Rules:
- EVERY item in "what the book saw" must matter to the plot, not just be mentioned. The glasses help spot a hidden clue; the hoodie's pocket holds exactly the right thing; the curly hair hides a tiny friend. Use the exact words from the list at least once each so the reader recognises themself.
- Features are strengths and superpowers. Never make a joke at the expense of how someone looks.
- Be genuinely inventive: fresh names, vivid sensory details, one moment of real surprise. Avoid clichés like "once upon a time" and "it was all a dream".
- Never assume ${name}'s gender: no he/she/him/her/boy/girl for the hero. Use their name, or "they".
- 5 pages. Each page is 2-4 SHORT sentences and at most 55 words, simple words a young reader can read aloud. Use ${name}'s name often.
- Give it a short, catchy title that includes ${name}.
- Do not write word counts or page numbers in the text.

Return ONLY JSON, no other text:
{"title": "...", "pages": ["...", "...", "...", "...", "..."]}`

  try {
    const reply = await client.chat.completions.create({
      model: STORY_MODEL,
      temperature: 1.0,
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const data = extractJson(reply.choices[0].message.content)
    const pages = (data.pages ?? [])
      .map((p) => String(p).replace(/\(\s*\d+\s*words?\s*\)/gi, '').trim()) // models sometimes add "(42 words)"
      .filter(Boolean)
      .slice(0, 6)
    if (pages.length < 3) throw new Error('too few pages')
    res.json({ title: String(data.title).trim().slice(0, 100), pages, mood })
  } catch (e) {
    console.error(`/story failed: ${e.name}: ${e.message}`)
    res.status(502).json({ detail: "The book couldn't finish the story. Please try again." })
  }
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, mock: MOCK, vision: VISION_MODEL, story: STORY_MODEL })
})

app.listen(PORT, () => {
  console.log(`📖 Book backend on http://localhost:${PORT}${MOCK ? ' (MOCK mode)' : ''}`)
})
