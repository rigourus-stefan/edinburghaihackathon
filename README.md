# 📖 The Book That Reads You

> You've always read books. This one reads you.

A web app that scans your face, notices what it can see (glasses, hair, expression, clothes) and reads your **mood** (happy, sad or calm). Then it writes a short story where you are the hero, and your mood shapes the whole story.

**Privacy:** one photo, used once, never stored. It never guesses age, race, gender, weight, health or attractiveness.

## Repo layout

| Folder | What | Owner |
|---|---|---|
| [`backend/`](backend/) | Node + Express API: `POST /scan` and `POST /story` | @stefan |
| `frontend/` | Camera, screens, book view and read-aloud | teammate |

## Quick start (backend)

```bash
cd backend
npm install
npm run setup    # paste your own Nebius API key; it's saved to backend/.env, which is gitignored
npm start        # http://localhost:8000
```

No key? Run `npm run mock` for fake data.

The full API contract, with examples and error codes, is in [backend/README.md](backend/README.md).
