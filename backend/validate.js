// Checks and cleans everything that comes in from the browser or back from a model.
// Anything that fails throws an HttpError, which server.js turns into { detail } JSON.

export const MOODS = ['happy', 'sad', 'neutral']
export const GENRES = ['adventure', 'space', 'fantasy', 'mystery']

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
export function cleanPhrase(value, max = 80) {
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
  if (!name) throw new HttpError(400, 'The hero needs a name (letters only).')
  return name
}

export function parseGenre(value) {
  if (value === undefined || value === null || value === '') return 'adventure'
  const genre = String(value).toLowerCase().trim()
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
  ]
    .map((w) => `\\b${w}\\b`)
    .join('|'),
  'i',
)

/** A cleaned phrase, or null if it's empty or describes something the book must never mention. */
export function safePhrase(value) {
  const v = cleanPhrase(value)
  return v && SENSITIVE.test(v) ? null : v
}

/** Normalises a features object, whether it came from the browser or from the vision model. */
export function parseFeatures(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(400, 'Send "features" as the object returned by /scan.')
  }
  const extras = (Array.isArray(raw.extras) ? raw.extras : []).map(safePhrase).filter(Boolean).slice(0, 3)
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
