# ✕ ~~You read the book.~~  ✓ The book reads you.

**The Book That Reads You** is a storybook that reads its reader first.

Look into your webcam. The book studies your face: your glasses, your hair, the logo on your hoodie, the earring you forgot you were wearing, and how you're feeling right now. Then it writes a short story where **you** are the hero, every one of those details matters to the plot, and the whole emotional arc follows your mood. It reads the story aloud to you, page by page.

*Edinburgh AI Hackathon 2026: Flip the Script*

## The flip

For as long as books have existed, the deal has been the same: **you read the book.** The book is fixed; you adapt to it. Every reader of a story gets the same words, the same hero, the same ending.

We turned that around. **The book reads you**, and it's never the same book twice:

- **It looks before it writes.** The story is built from what the book actually sees, not from a form you fill in.
- **Your mood is the plot's engine.** Smiling? You get a bright adventure where your joy is literally a superpower. A bit low today? The book doesn't tell you to cheer up. It writes something gentle, where your quiet heart notices what everyone else missed, and ends somewhere warm. Calm and thoughtful? You become the cool head who solves the puzzle.
- **The small things are the story.** Your star earring catches the moonlight at the crucial moment. The logo on your hoodie matches a symbol on the treasure map. Your raised eyebrow is how you spot the lie.

It's for anyone, but especially readers who never saw themselves in a book: it's hard to put down a story where the hero has *your* glasses.

## How it works

```
 Browser                                  Backend (Node + Express)               Nebius AI Studio
 ───────                                  ────────────────────────               ────────────────
 Name + genre
 Camera: face tracking, auto-capture ──▶  POST /scan
   • full photo + 1080p face close-up      validate, then 3 vision models ─────▶ Kimi K3 (reads details)
   • measured expression (smile, brows…)   in parallel, cross-checked     ─────▶ Gemma 3, MiniCPM-V (check)
 "What the book saw"              ◀──────  features + mood
                                  ──────▶  POST /story ──────────────────────▶ Qwen3 235B (writes)
 The book: page turns, highlights,◀──────  title + 5-6 pages
 read-aloud
```

1. **Framing and capture (in the browser).** MediaPipe **Face Landmarker** tracks 478 face points live. It waits until exactly one face is centred, close enough, well lit and still for a second, then counts down 3-2-1 and takes **one** photo.
2. **A sharper look.** Alongside the full photo, it cuts a head-and-shoulders close-up from the camera's full 1080p frame, so small details are actually readable. It also sends measured expression values (smile, brow raise, eye squint…) taken from the tracker's 52 facial blendshapes and averaged over the last few frames.
3. **Reading the reader.** **Kimi K3** describes glasses, hair, expression, clothing and up to 8 small, specific details. **Gemma 3** and **MiniCPM-V** look at the same photo at the same time; a small detail is only kept if a second model also saw it. That stops the book inventing a necklace you aren't wearing. The measured expression decides the mood.
4. **Writing the story.** **Qwen3 235B** writes 5-6 short pages in your chosen genre, with your mood setting the arc and two random story "sparks" so no two books are the same. Every detail it saw must appear, and at least two must drive the plot.
5. **The book.** Page turns, your features glowing in the text where they appear, browser text-to-speech that reads each page and turns to the next, and save as PDF.

Eight genres: Adventure, Fantasy, Sci-Fi, Mystery, Thriller, Horror, Comedy, Fairy Tale. Horror and thriller stay safe for all ages: dread and tension, never gore.

All AI runs on **[Nebius AI Studio](https://studio.nebius.com)**. Four different open models, each doing the job it's best at.

## Privacy by design

A camera pointed at your face has to earn trust, so these are hard rules in code, not just promises:

- **One photo, used once, never stored.** The photo lives in memory for a single request. It is never written to disk, never logged, and the camera switches off the moment it's taken.
- **It never guesses who you are.** The book describes only what you're wearing and doing. It never mentions or guesses race, skin colour, age, gender, weight, health or attractiveness.
- **Belt and braces.** AI models don't always follow instructions (in testing, one described a "peach coloured face"), so every phrase passes a filter that drops anything about skin, ethnicity, age, body, gender, looks, health or other people in the frame.
- **No invented features.** Small details need agreement from a second model, and the story isn't allowed to add features you don't have.
- **Safe inputs.** Names and features are cleaned before they reach a prompt, so they can't be used to trick the AI.
- **Rate-limited**, so a stuck page can't run up the bill.

## Run it

You need **Node 22+** and a Nebius AI Studio API key.

```bash
# Backend (port 8000)
cd backend
npm install
npm run setup     # paste your Nebius key; saved to backend/.env, which is gitignored
npm start         # or: npm run mock   (fake data, no key needed)
```

```bash
# Frontend (port 5173), in a second terminal
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in Chrome or Safari and allow the camera. No camera? Use **"Use a test photo"**.

## Project layout

| | |
|---|---|
| [`backend/`](backend/) | Express API: `POST /scan`, `POST /story`. Full API docs in [backend/README.md](backend/README.md) |
| `backend/prompts.js` | Everything the models are told: scan rules, mood arcs, genres |
| `backend/validate.js` | Input checks, sensitive-content filter, cross-model agreement, mood from measurements |
| [`frontend/`](frontend/) | React + Vite app |
| `frontend/src/screens/Camera.jsx` | Face Landmarker framing, auto-capture, face close-up, expression measurement |
| `frontend/src/screens/Book.jsx` | Page turns, feature highlighting, read-aloud |

## Team

- **Stefan**: backend, AI pipeline, prompts, privacy
- **Bradley**: frontend and design
