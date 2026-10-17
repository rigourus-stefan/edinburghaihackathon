// VALIDATE: checks and cleans everything coming in from the browser or back from an AI model.
//   parseImage / parseHeroName / parseGenre -> is the input safe and sensible?
//   SENSITIVE + safePhrase                  -> privacy filter: drops skin, age, gender, looks...
//   agreedExtras                            -> anti-hallucination: keep a detail only if 2 models saw it
//   moodFromMeasured                        -> mood from the face tracker's numbers
// Anything that fails throws an HttpError, which server.js turns into { detail } JSON.

const MOODS = ['happy', 'sad', 'neutral']
const GENRES = ['adventure', 'fantasy', 'scifi', 'mystery', 'thriller', 'horror', 'comedy', 'fairytale']
// Older names still accepted, so earlier versions of the frontend keep working.
const GENRE_ALIASES = { space: 'scifi', 'sci-fi': 'scifi', 'science fiction': 'scifi', detective: 'mystery', suspense: 'thriller', 'fairy tale': 'fairytale' }

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // decoded size; a 768px JPEG is ~100 KB
const MIN_IMAGE_BYTES = 2 * 1024

export class HttpError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
  }
}

const EMPTY = new Set(['', 'none', 'null', 'n/a', 'no', 'no glasses', 'not visible', 'unknown'])

/** A short single-line phrase, or null. Strips anything that could smuggle instructions into a prompt. */
function cleanPhrase(value, max = 80) {
  if (typeof value !== 'string') return null
  const v = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // control chars, incl. newlines
    .replace(/[{}<>`"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return EMPTY.has(v.toLowerCase()) ? null : v
}

/**
 * Accepts a base64 JPEG/PNG, with or without a data: URL prefix.
 * Returns { base64, mime } ready to forward to the vision model.
 */
export function parseImage(image) {
  if (typeof image !== 'string' || !image) throw new HttpError(400, 'Send the photo as "image": a base64 JPEG.')

  let base64 = image
  let mime = null
  const match = image.match(/^data:(image\/[a-z+.-]+);base64,/i)
  if (match) {
    mime = match[1].toLowerCase()
    base64 = image.slice(match[0].length)
  }
  base64 = base64.replace(/\s/g, '')

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpError(400, 'The photo is not valid base64.')
  const bytes = Math.floor((base64.length * 3) / 4)
  if (bytes < MIN_IMAGE_BYTES) throw new HttpError(400, 'The photo is empty or too small. Please try again.')
  if (bytes > MAX_IMAGE_BYTES) throw new HttpError(413, 'The photo is too big. Resize it to about 768px wide.')

  // Trust the file's magic bytes over whatever the prefix claims.
  if (base64.startsWith('/9j/')) mime = 'image/jpeg'
  else if (base64.startsWith('iVBORw0KGgo')) mime = 'image/png'
  else if (base64.startsWith('UklGR')) mime = 'image/webp'
  else throw new HttpError(415, 'The photo must be a JPEG, PNG or WebP.')

  return { base64, mime }
}

/** Hero names: letters (any language), spaces, hyphens, apostrophes and dots. */
export function parseHeroName(value) {
  const name = (typeof value === 'string' ? value : '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3) // real names are short; long "names" are usually prompt tricks
    .join(' ')
    .slice(0, 30)
    .trim()
    .replace(/(^|\s)\p{Ll}/gu, (c) => c.toUpperCase()) // "stefan" -> "Stefan"
  if (!name) throw new HttpError(400, 'The hero needs a name (letters only).')
  return name
}

export function parseGenre(value) {
  if (value === undefined || value === null || value === '') return 'adventure'
  const name = String(value).toLowerCase().trim()
  const genre = GENRE_ALIASES[name] ?? name
  if (!GENRES.includes(genre)) throw new HttpError(400, `Genre must be one of: ${GENRES.join(', ')}.`)
  return genre
}

export function parseMood(value) {
  const mood = String(value ?? '').toLowerCase().trim()
  return MOODS.includes(mood) ? mood : 'neutral'
}

// The vision prompt forbids describing these, but models don't always listen
// (e.g. one returned "peach coloured face"). Any phrase that touches them is dropped.
const SENSITIVE = new RegExp(
  [
    'skin', 'complexion', 'skin[- ]?tone', 'tan(ned)?', 'pale', 'freckl\\w*', // skin
    '(face|cheeks?|lips?)\\b.*\\b(colou?r(ed)?|peach|pink|brown|black|white|beige|tan|olive|pale|dark|light|fair|rosy)',
    '(peach|pink|brown|black|white|beige|olive|pale|dark|light|fair|rosy)[- ]?(colou?red)?\\s+(face|cheeks?|lips?)',
    'race', 'racial', 'ethnic\\w*', 'asian', 'african', 'caucasian', 'latin[oax]', 'hispanic', // ethnicity
    'old', 'young', 'aged?', 'elderly', 'teen\\w*', 'kid', 'child', 'baby', 'wrinkl\\w*', 'grey-haired', // age
    'fat', 'thin', 'skinny', 'slim', 'chubby', 'overweight', 'heavy', 'weight', 'body', // body
    'male', 'female', 'man', 'woman', 'boy', 'girl', 'gender', 'masculine', 'feminine', // gender
    'pretty', 'ugly', 'beautiful', 'handsome', 'cute', 'attractive', 'gorgeous', // looks
    'sick', 'ill', 'disabled', 'disability', 'scar', 'acne', 'pimples?', 'tired-looking', // health
    'people', 'persons?', 'someone', 'somebody', 'crowd', 'faces', 'friends?', 'others', 'audience', // other people
  ]
    .map((w) => `\\b${w}\\b`)
    .join('|'),
  'i',
)

/** A cleaned phrase, or null if it's empty or describes something the book must never mention. */
function safePhrase(value) {
  const v = cleanPhrase(value)
  return v && SENSITIVE.test(v) ? null : v
}

/** Normalises a features object, whether it came from the browser or from the vision model. */
export function parseFeatures(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(400, 'Send "features" as the object returned by /scan.')
  }
  const extras = [...new Set((Array.isArray(raw.extras) ? raw.extras : []).map(safePhrase).filter(Boolean))].slice(0, 8)
  return {
    glasses: safePhrase(raw.glasses),
    hair: safePhrase(raw.hair),
    expression: safePhrase(raw.expression),
    clothing: safePhrase(raw.clothing),
    extras,
    mood: parseMood(raw.mood),
  }
}

export function hasAnyFeature(f) {
  return Boolean(f.glasses || f.hair || f.expression || f.clothing || f.extras.length)
}

/** Pull the first JSON object out of a model reply (handles ``` fences and chatter). */
export function extractJson(text) {
  const match = (text ?? '').match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON object in reply')
  return JSON.parse(match[0])
}

/** Validates the story model's JSON. Throws if it isn't usable. */
export function parseStory(raw) {
  const title = cleanPhrase(raw?.title, 100)
  const pages = (Array.isArray(raw?.pages) ? raw.pages : [])
    .map((p) =>
      String(p ?? '')
        .replace(/\\n|\n/g, ' ') // a line break written as the characters "\n", or a real one
        .replace(/\s{2,}/g, ' ')
        .replace(/\(\s*\d+\s*words?\s*\)/gi, '') // models sometimes add "(42 words)"
        .replace(/^\s*(page\s*\d+\s*[:.-]\s*)/i, '')
        .trim()
        .slice(0, 600),
    )
    .filter(Boolean)
    .slice(0, 6)
  if (!title) throw new Error('story has no title')
  if (pages.length < 3) throw new Error(`story has only ${pages.length} pages`)
  return { title, pages }
}

// Words that don't identify *what* an extra is, so they're ignored when matching.
const DESCRIPTIVE = new Set([
  'a', 'an', 'the', 'and', 'with', 'on', 'in', 'of', 'around', 'round', 'his', 'her', 'their', 'small', 'large', 'big',
  'little', 'thin', 'thick', 'long', 'short', 'light', 'dark', 'bright', 'pale', 'black', 'white', 'grey', 'gray',
  'silver', 'gold', 'golden', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'beige', 'navy',
  'colourful', 'colorful', 'striped', 'plain', 'simple', 'neck', 'head', 'ear', 'ears', 'wearing', 'worn',
])

/** The words that say what an extra *is*: "thin silver chain" -> ["chain"]. */
function itemWords(phrase) {
  return phrase.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/)
    .filter((w) => w.length > 2 && !DESCRIPTIVE.has(w))
    .map((w) => w.replace(/(es|s)$/, ''))
}

/**
 * Keeps only the extras that a second, independent model also saw.
 * Two different models rarely invent the same thing, so this removes most made-up details.
 */
export function agreedExtras(primary, ...checks) {
  const seen = new Set(checks.flat().flatMap(itemWords))
  return primary.filter((e) => itemWords(e).some((w) => seen.has(w)))
}

// ---------- expression measurements from the browser's face tracker ----------
// MediaPipe Face Landmarker blendshapes, already averaged left/right by the frontend. Each is 0..1.
const MEASURES = {
  smile: 'smile', mouthOpen: 'mouth open', frown: 'mouth corners down', browRaise: 'eyebrows raised',
  browInnerUp: 'inner eyebrows lifted', browDown: 'eyebrows lowered', eyeSquint: 'eyes squinting',
  eyeWide: 'eyes wide', cheekRaise: 'cheeks raised', lipPress: 'lips pressed', pucker: 'lips puckered',
}

/** Cleans the optional `measured` object: known keys only, numbers clamped to 0..1. Returns null if absent. */
export function parseMeasured(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  for (const key of Object.keys(MEASURES)) {
    const v = Number(raw[key])
    if (Number.isFinite(v)) out[key] = Math.min(1, Math.max(0, Math.round(v * 100) / 100))
  }
  return Object.keys(out).length ? out : null
}

/** "smile 0.82, eyebrows raised 0.10, ..." for the vision prompt. */
export function describeMeasured(m) {
  return Object.entries(m).map(([k, v]) => `${MEASURES[k]} ${v.toFixed(2)}`).join(', ')
}

/**
 * Mood from the measurements, or null when they don't clearly say.
 * A real smile reads ~0.4-0.9; a sad face shows lifted inner brows or turned-down mouth with no smile.
 */
export function moodFromMeasured(m) {
  if (!m) return null
  const smile = m.smile ?? 0
  if (smile >= 0.4) return 'happy'
  if (smile < 0.12 && ((m.frown ?? 0) >= 0.2 || (m.browInnerUp ?? 0) >= 0.35)) return 'sad'
  if (smile < 0.12) return 'neutral'
  return null // a slight smile: let the vision model decide
}
