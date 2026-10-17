# 📖 Backend: The Book That Reads You

A small Node + Express server with two endpoints:

- `POST /scan` looks at one photo and returns what it sees, plus the reader's mood.
- `POST /story` writes a 5-page story starring the reader. The mood shapes the story.

## 1. Set up (once)

You need **Node 22+**.

```bash
cd backend
npm install
npm run setup      # paste your Nebius API key when asked
```

`npm run setup` checks your key with Nebius and saves it to `backend/.env`. That file is in `.gitignore`, so **everyone uses their own key and nobody's key gets committed.**

Prefer doing it by hand? Copy the template and paste your key in:

```bash
cp .env.example .env
```

Get a key at [studio.nebius.com](https://studio.nebius.com) → API keys.

## 2. Run

```bash
npm start          # real AI, uses your key
npm run dev        # same, restarts when you edit a file
npm run mock       # fake data, no key needed, instant replies
```

The server runs on **http://localhost:8000**. Check it's up: http://localhost:8000/health

> **Frontend teammates:** use `npm run mock` while building screens. It's free and instant, and `?mood=happy|sad|neutral` lets you try all three moods.

## 3. API

All requests and responses are JSON. CORS is open, so you can call it straight from the browser.

### `POST /scan`

Send **one** photo: a base64 JPEG, PNG or WebP, ideally about 768 px wide (around 100 KB). A plain base64 string or a `data:image/jpeg;base64,...` URL both work, so `canvas.toDataURL('image/jpeg', 0.85)` can be sent as-is.

```json
{ "image": "data:image/jpeg;base64,/9j/4AAQ..." }
```

Response:

```json
{
  "features": {
    "glasses": "round black glasses",
    "hair": "short curly brown hair",
    "expression": "big toothy grin",
    "clothing": "green hoodie",
    "extras": ["headphones round neck"],
    "mood": "happy"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `glasses`, `hair`, `expression`, `clothing` | string or `null` | `null` when not visible (e.g. no glasses) |
| `extras` | string[] | 0 to 3 other things it noticed. Often empty: an extra is only kept if two different AI models both saw it, so the book doesn't invent things like a chain you aren't wearing. |
| `mood` | `"happy"` \| `"sad"` \| `"neutral"` | Read from the facial expression. Drives the story's tone. |
| `fallback` | `true` (optional) | The AI had trouble, so these are generic features. Still fine to make a story from. |

Takes about 1 to 2 seconds.

### `POST /story`

Send the hero's name, a genre and the **whole `features` object exactly as `/scan` returned it**.

```json
{
  "heroName": "Mia",
  "genre": "space",
  "features": { "glasses": "round black glasses", "hair": "...", "expression": "...", "clothing": "...", "extras": [], "mood": "happy" }
}
```

`genre` is one of `adventure`, `space`, `fantasy`, `mystery` (defaults to `adventure`).

Response:

```json
{
  "title": "Mia and the Giggling Comet",
  "pages": ["Page 1 text...", "Page 2 text...", "...5 pages"],
  "mood": "happy"
}
```

Takes about **8 to 12 seconds**. Tip: call `/story` as soon as `/scan` returns, and show the "what the book saw" screen while you wait.

How the mood changes the story:

- **happy:** bright and funny, and the hero's joy saves the day.
- **sad:** gentle. It notices the feeling, never says "cheer up", and has a warm, hopeful ending.
- **neutral:** calm and clever, a puzzle the hero solves by staying cool.

Every feature it saw becomes part of the plot, using the same words, so you can highlight them in the text.

### Errors

Every error has the same shape, with a message you can show on screen as it is:

```json
{ "detail": "The book couldn't see a face. Look straight at the camera and try again." }
```

| Status | When |
|---|---|
| 400 | Missing or invalid input (no image, no name, bad genre, bad JSON) |
| 413 | Photo over 5 MB, so resize it before sending |
| 415 | Not a JPEG, PNG or WebP |
| 422 | `/scan` found no face in the photo |
| 429 | Too many requests (20 per minute per device). See the `Retry-After` header. |
| 502 | The AI couldn't write a story, even after retrying. Try again. |
| 500 | Something else, such as a bad API key. Check the server's terminal. |

### Example (browser)

```js
const API = 'http://localhost:8000'

async function post(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail)
  return data
}

const image = canvas.toDataURL('image/jpeg', 0.85)
const { features } = await post('/scan', { image })
const story = await post('/story', { heroName: 'Mia', genre: 'space', features })
```

### Example (terminal)

```bash
curl -X POST 'localhost:8000/scan?mood=sad' -H 'Content-Type: application/json' -d '{}'   # mock mode
```

## Privacy

- The photo stays in memory for one request only. It is never saved to disk and never logged.
- The vision prompt only describes visible, neutral things. It never guesses race, age, gender, weight, health or attractiveness.
- Models don't always follow that, so every phrase also goes through a filter that drops anything about skin or face colour, ethnicity, age, body, gender, looks, health or other people in the photo.
- Names and features are cleaned before they go into the story prompt, so they can't be used to trick the AI.

## Settings

Optional, in `backend/.env` (see `.env.example`):

| Variable | Default |
|---|---|
| `PORT` | `8000` |
| `VISION_MODEL` | `google/gemma-3-27b-it` |
| `VISION_CHECK_MODEL` | `openbmb/MiniCPM-V-4_5`: second opinion on extras, or `off` |
| `STORY_MODEL` | `Qwen/Qwen3-235B-A22B-Instruct-2507` |
| `RATE_LIMIT_PER_MIN` | `20` |
| `CORS_ORIGIN` | any origin. Comma-separate to restrict, e.g. `http://localhost:5173`. |

## Files

| File | What's in it |
|---|---|
| `server.js` | Routes, error handling, calls to the AI |
| `prompts.js` | What the AI is told. **Tune the stories here.** |
| `validate.js` | Checks and cleans all input and AI output |
| `mock.js` | Fake responses for `npm run mock` |
| `rateLimit.js` | Per-device request limit |
| `setup.js` | `npm run setup` |
