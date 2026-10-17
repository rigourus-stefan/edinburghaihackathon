// Talks to the backend through Vite's /api proxy (see vite.config.js).
//
// Features shape: { glasses, hair, expression, clothing, extras: [], mood: 'happy' | 'sad' | 'neutral' }
// Story shape:    { title, pages: [], mood }

async function post(path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Can't reach the book's server. Is the backend running?")
  }
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => null)
    throw new Error(typeof detail === 'string' ? detail : `Something went wrong (${res.status}).`)
  }
  return res.json()
}

/**
 * Sends the one photo: the full frame, a sharp face close-up and the measured expression.
 * The backend uses them once and never stores them.
 */
export function scanFace({ image, face, measured }) {
  return post('/scan', { image, face, measured }).then((r) => r.features)
}

export function writeStory(heroName, genre, features) {
  return post('/story', { heroName, genre, features })
}

/** The features as a labelled list, in the order the book "reveals" them. */
export function featureList(f) {
  const items = []
  if (f.glasses) items.push({ label: 'Glasses', value: f.glasses, icon: '👓' })
  if (f.hair) items.push({ label: 'Hair', value: f.hair, icon: '💇' })
  if (f.expression) items.push({ label: 'Expression', value: f.expression, icon: { happy: '😄', sad: '😢' }[f.mood] ?? '😐' })
  if (f.clothing) items.push({ label: 'Clothes', value: f.clothing, icon: '👕' })
  for (const e of f.extras ?? []) items.push({ label: 'Detail', value: e, icon: '✨' })
  return items
}

export const MOOD_INFO = {
  happy: { icon: '☀️', label: 'Happy', line: 'Your smile is going to power this story.' },
  sad: { icon: '🌧️', label: 'A little sad', line: "That's okay. This story will be gentle, and you won't be alone in it." },
  neutral: { icon: '🌙', label: 'Calm and thoughtful', line: 'A cool head like yours is perfect for solving puzzles.' },
}
