# 📖 The Book That Reads You

> You've always read books. This one reads you.

A web app that scans your face, notices what it can see (glasses, hair, expression, clothes) and reads your **mood** (happy, sad or calm). Then it writes a short story where you are the hero. Your mood shapes the whole story:

- **Happy:** a bright, bouncy adventure where your joy is a real superpower.
- **A little sad:** a gentle story that notices the feeling, doesn't tell you to cheer up, and ends warm and hopeful.
- **Calm:** a clever puzzle story where your steady focus is the key.

Every feature it saw matters to the plot, glows in the text, and the book reads itself aloud.

**Privacy:** one photo, used once, never stored. It describes only visible, neutral features and never guesses age, race, gender, weight, health or attractiveness.

## Run it

You need Node 20+ and a Nebius AI Studio API key.

```bash
# 1. Backend (port 8000)
cd backend
npm install
echo "NEBIUS_API_KEY=your-key-here" > .env
npm start            # or: npm run mock   (fake data, no key needed)

# 2. Frontend (port 5173), in a second terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and allow the camera.

No camera? Use **"Use a test photo"** on the camera screen.

## How it works

| Step | Where | What |
|------|-------|------|
| Face framing + auto-capture | `frontend/src/screens/Camera.jsx` | MediaPipe Face Detector checks there's one face, centred, close enough, well lit, and holding still for 1 s. Then a 3-2-1 countdown takes one photo, resized to 768 px JPEG. The camera turns off straight away. |
| `POST /scan` | `backend/server.js` | Vision model (`google/gemma-3-27b-it`) returns `{ glasses, hair, expression, clothing, extras, mood }`. |
| What the book saw | `frontend/src/screens/Saw.jsx` | Features appear one by one while the story is written in the background. |
| `POST /story` | `backend/server.js` | Text model (`Qwen/Qwen3-235B-A22B-Instruct-2507`) writes 5 pages. The mood picks the emotional arc, and random "sparks" make each story different. |
| Book + read-aloud | `frontend/src/screens/Book.jsx`, `useSpeech.js` | Page-turn animation, feature highlighting, browser SpeechSynthesis with auto page-turn, and print-to-PDF. |

Swap models with `VISION_MODEL` / `STORY_MODEL` in `backend/.env`.

## API contract

```
POST /scan   { "image": "<base64 JPEG>" }
          -> { "features": { "glasses", "hair", "expression", "clothing", "extras": [], "mood": "happy|sad|neutral" } }

POST /story  { "heroName": "Mia", "genre": "adventure|space|fantasy|mystery", "features": { ... } }
          -> { "title": "...", "pages": ["...", "..."], "mood": "..." }
```
