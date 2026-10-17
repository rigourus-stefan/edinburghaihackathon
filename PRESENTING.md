# Presenting: "if they ask X, show Y"

## The 30-second pitch

> You've always read books. **We flipped it: the book reads you.**
> It looks at your face (glasses, hair, the logo on your hoodie, your expression), works out your mood, and writes a story where you're the hero. Every detail it saw is in the plot, highlighted, and it reads the story aloud.
> One photo, used once, never stored.

## Demo order (2 minutes)

1. **Start screen.** Point at the title: ✕ ~~You read the book.~~ ✓ The book reads you. *"That's the flip."*
2. Type the judge's name, pick a genre, click **Let the book read me**.
3. **Camera.** Show the hints ("Move a little closer"), then the 3-2-1 auto-capture. *"It only takes one photo, then the camera turns off."*
4. **What the book saw.** Features appear one by one, then the mood. *"This is the book reading you."*
5. **Open the book.** Title page says *"Built from N things the book saw in your face scan."*
6. **Page 1.** Point at the **highlighted words**, hover one: *"From your face scan · Clothes: navy blue hoodie."* Let it read aloud.

Backup if the camera fails: **"Use a test photo"** on the camera screen.

---

## If the marker asks… → show this

### "Where does it use the face scan?"
| Show | What to say |
|---|---|
| [Camera.jsx L150 `tick()`](frontend/src/screens/Camera.jsx#L150) | Face tracking runs ~60× a second in the browser and checks one face, centred, close, bright, still. |
| [Camera.jsx L73 `makeShot()`](frontend/src/screens/Camera.jsx#L73) | On capture it builds the full photo, a sharp 1080p face close-up and expression numbers. |
| [server.js L98](backend/server.js#L98) | The backend sends the photo to 3 vision models at the same time. |
| [Book.jsx L22 `highlightTerms()`](frontend/src/screens/Book.jsx#L22) | Finds the scanned features in the story and highlights them, with a hover label. |

### "How does it read my mood?"
| Show | What to say |
|---|---|
| [Camera.jsx L52 `readExpression()`](frontend/src/screens/Camera.jsx#L52) | The face tracker measures smile, brow raise and eye squint as numbers from 0 to 1. |
| [validate.js L219 `moodFromMeasured()`](backend/validate.js#L219) | Smile ≥ 0.4 → happy. No smile plus lifted inner brows or a turned-down mouth → sad. Measured, not guessed. |
| [prompts.js L44 `MOOD_ARCS`](backend/prompts.js#L44) | The mood changes the whole story: happy = joy is a superpower, sad = gentle and hopeful, calm = solves the puzzle. |

### "How do you stop the AI making things up?"
| Show | What to say |
|---|---|
| [validate.js L186 `agreedExtras()`](backend/validate.js#L186) | A small detail is only kept if a **second** AI model also saw it. It stopped a "silver chain" the person wasn't wearing. |
| [server.js L123](backend/server.js#L123) | Where that check is applied. |
| [prompts.js L124](backend/prompts.js#L124) | The story may not invent features of the reader or assume their gender. |

### "What about privacy? It's a camera on my face."
| Show | What to say |
|---|---|
| [Camera.jsx L144](frontend/src/screens/Camera.jsx#L144) | The camera switches off the moment the photo is taken. |
| [App.jsx L54](frontend/src/App.jsx#L54) | The browser forgets the photo as soon as the scan is done. |
| [server.js L103](backend/server.js#L103) | The server drops the photo after one request. It is never saved or logged. |
| [prompts.js L34](backend/prompts.js#L34) | The AI is told never to mention race, skin colour, age, gender, weight, health or looks. |
| [validate.js L98 `SENSITIVE`](backend/validate.js#L98) | **And** a hard filter in code removes it if the AI slips. It once said "peach coloured face", and this filter now catches it. |

### "Which AI do you use, and why?"
| Show | What to say |
|---|---|
| [server.js L24-L28](backend/server.js#L24) | All on **Nebius AI Studio**. Kimi K3 reads the details (about 1 s), Gemma 3 and MiniCPM-V double-check them, Qwen3 235B writes the story. |
| [prompts.js L11 `scanPrompt()`](backend/prompts.js#L11) | What the vision models are asked to look for. |
| [prompts.js L101 `storyPrompt()`](backend/prompts.js#L101) | How name, genre, features and mood become the story. |

### "How does the story use the details?"
| Show | What to say |
|---|---|
| [prompts.js L118](backend/prompts.js#L118) | Every detail must appear, and at least two must drive the plot (the hair clip fits the keyhole). |
| [prompts.js L76 `SPARKS`](backend/prompts.js#L76) | Two random story ideas each time, so no two books are the same. |
| [prompts.js L64 `GENRE_FLAVOUR`](backend/prompts.js#L64) | The 8 genres. Horror and thriller stay safe: dread and tension, never gore. |

### "How does the read-aloud work?"
| Show | What to say |
|---|---|
| [useSpeech.js L15](frontend/src/useSpeech.js#L15) | The browser's built-in voice. No extra service. |
| [Book.jsx L84](frontend/src/screens/Book.jsx#L84) | Reads the page, then turns to the next one by itself. |

### "How is it built? What's the architecture?"
| Show | What to say |
|---|---|
| [README.md](README.md) | The diagram: React frontend → Node backend → Nebius models. |
| [App.jsx L1](frontend/src/App.jsx#L1) | The frontend's brain: which screen is showing, and moving between them. |
| [server.js L74](backend/server.js#L74) and [L132](backend/server.js#L132) | The whole backend is two endpoints: `POST /scan` and `POST /story`. |
| [vite.config.js L8](frontend/vite.config.js#L8) | The browser only talks to our server, never to the AI directly, so the API key stays secret. |

### "What if someone abuses it, or the AI breaks?"
| Show | What to say |
|---|---|
| [validate.js L41 `parseImage()`](backend/validate.js#L41) | It checks the photo really is an image, by its file bytes, and under 5 MB. |
| [validate.js L68 `parseHeroName()`](backend/validate.js#L68) | Names are cleaned so nobody can type instructions to the AI. |
| [server.js L70](backend/server.js#L70) | Rate limit: 20 requests a minute per device. |
| [server.js L140](backend/server.js#L140) | If the story comes back broken, it retries once. |
| [server.js L162](backend/server.js#L162) | Every error becomes a friendly message, never a crash. |

### "Can I run it?"
[README.md → Run it](README.md#run-it): `npm run setup`, `npm start`, `npm run dev`. No key? Use `npm run mock`.

---

## Numbers to quote
- **1** photo, used once, never stored
- **478** face points tracked live; **52** expression measurements
- **3** vision models cross-check every scan in about **2 seconds**
- Up to **8** small details per scan
- **8** genres × **3** moods × random sparks, so no two stories are the same

## Be honest about limits (judges like this)
- Mood is happy / sad / calm only. Real feelings are richer.
- Lighting matters: a dim room means fewer details.
- Read-aloud uses the browser's voice, so it sounds different on each computer.
