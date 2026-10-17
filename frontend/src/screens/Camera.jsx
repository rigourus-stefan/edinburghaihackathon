import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const STEADY_MS = 1000 // face must hold still this long before the countdown
const COUNT_MS = 900 // length of each 3-2-1 step
const MAX_MOVE = 0.035 // how far the face centre may drift between frames (share of frame width)
const FULL_WIDTH = 768 // the whole photo: enough for clothes and background
const FACE_MAX = 1024 // the face close-up, cut from the camera's full resolution for small details
const EXPRESSION_FRAMES = 12 // expression is averaged over the last ~0.4 s, so a blink doesn't count

/** Draws part of a source (video or image) onto a canvas and returns a JPEG data URL. */
function toJpeg(source, sx, sy, sw, sh, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  canvas.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Bounding box of the face landmarks, in 0..1 image coordinates. */
function faceBox(landmarks) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const p of landmarks) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return { x0, y0, x1, y1 }
}

/** Close-up of head and shoulders: the face box widened for ears and hair, extended up and down to the collar. */
function faceCrop(source, w, h, landmarks) {
  const b = faceBox(landmarks)
  const bw = (b.x1 - b.x0) * w
  const bh = (b.y1 - b.y0) * h
  const cx = ((b.x0 + b.x1) / 2) * w
  const left = Math.max(0, cx - bw * 0.95)
  const right = Math.min(w, cx + bw * 0.95)
  const top = Math.max(0, b.y0 * h - bh * 0.55)
  const bottom = Math.min(h, b.y1 * h + bh * 0.75)
  return toJpeg(source, left, top, right - left, bottom - top, FACE_MAX, 0.9)
}

/** MediaPipe blendshapes -> the expression numbers the backend understands (each 0..1). */
function readExpression(categories) {
  if (!categories) return null
  const g = Object.fromEntries(categories.map((c) => [c.categoryName, c.score]))
  const both = (name) => ((g[`${name}Left`] ?? 0) + (g[`${name}Right`] ?? 0)) / 2
  return {
    smile: both('mouthSmile'), mouthOpen: g.jawOpen ?? 0, frown: both('mouthFrown'),
    browRaise: both('browOuterUp'), browInnerUp: g.browInnerUp ?? 0, browDown: both('browDown'),
    eyeSquint: both('eyeSquint'), eyeWide: both('eyeWide'), cheekRaise: both('cheekSquint'),
    lipPress: both('mouthPress'), pucker: g.mouthPucker ?? 0,
  }
}

function averageExpression(frames) {
  const valid = frames.filter(Boolean)
  if (!valid.length) return undefined
  const out = {}
  for (const key of Object.keys(valid[0])) out[key] = valid.reduce((sum, f) => sum + f[key], 0) / valid.length
  return out
}

/** Everything sent to /scan: the full photo, plus a sharp face close-up and expression numbers when a face was found. */
function makeShot(source, w, h, landmarks, measured) {
  return {
    image: toJpeg(source, 0, 0, w, h, FULL_WIDTH, 0.85),
    face: landmarks ? faceCrop(source, w, h, landmarks) : undefined,
    measured,
  }
}

/** Average brightness 0-255 of a tiny downscaled copy of the frame. */
function brightness(video, canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  return sum / (data.length / 4)
}

// Face Landmarker: 478 face points (for framing and the close-up) plus 52 expression measurements.
async function createDetector() {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe')
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numFaces: 2, // so we can say "only one face please"
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.6,
  })
  try {
    return await FaceLandmarker.createFromOptions(fileset, options('GPU'))
  } catch {
    return FaceLandmarker.createFromOptions(fileset, options('CPU'))
  }
}

export default function Camera({ heroName, error, onCapture, onBack }) {
  const videoRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | live | denied | captured
  const [hint, setHint] = useState('Waking up the camera…')
  const [aligned, setAligned] = useState(false)
  const [count, setCount] = useState(null)
  const [detectorFailed, setDetectorFailed] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [session, setSession] = useState(0) // bump to restart the camera (retake)
  const captureRef = useRef(null)
  const detectorRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let stream = null
    let detector = null
    let raf = 0
    const lightCanvas = Object.assign(document.createElement('canvas'), { width: 24, height: 24 })
    const s = { steadySince: null, countdownStart: null, last: null, frame: 0, dark: false, hint: '', count: null, ok: false, landmarks: null, expressions: [] }

    const show = (h, c, ok) => {
      if (h !== s.hint) setHint((s.hint = h))
      if (c !== s.count) setCount((s.count = c))
      if (ok !== s.ok) setAligned((s.ok = ok))
    }

    function stop() {
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
    }

    function capture() {
      const video = videoRef.current
      if (!video?.videoWidth) return
      const shot = makeShot(video, video.videoWidth, video.videoHeight, s.landmarks, averageExpression(s.expressions))
      stop() // camera off the moment the photo is taken
      setPhoto(shot)
      setStatus('captured')
    }
    captureRef.current = capture

    function tick() {
      if (cancelled) return
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      if (!detector || !video || video.readyState < 2) return

      const now = performance.now()
      if (s.frame++ % 10 === 0) s.dark = brightness(video, lightCanvas) < 45

      const result = detector.detectForVideo(video, now)
      const faces = result.faceLandmarks
      s.landmarks = faces.length === 1 ? faces[0] : null
      s.expressions = [...s.expressions, faces.length === 1 ? readExpression(result.faceBlendshapes[0]?.categories) : null].slice(-EXPRESSION_FRAMES)
      let problem = null
      let centre = null
      if (s.dark) problem = "It's a bit too dark. Find some light!"
      else if (faces.length === 0) problem = 'Look at the book so it can see you'
      else if (faces.length > 1) problem = 'Only one face please'
      else {
        const b = faceBox(faces[0])
        centre = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
        const size = b.x1 - b.x0
        if (size < 0.2) problem = 'Move a little closer'
        else if (size > 0.62) problem = 'Move back a little'
        else if (Math.abs(centre.x - 0.5) > 0.15 || Math.abs(centre.y - 0.5) > 0.2) problem = 'Move your face into the oval'
      }

      if (problem) {
        s.steadySince = s.countdownStart = null
        s.last = centre
        return show(problem, null, false)
      }

      const moved = s.last ? Math.hypot(centre.x - s.last.x, centre.y - s.last.y) : 1
      s.last = centre
      if (moved > MAX_MOVE) {
        s.steadySince = now
        s.countdownStart = null
      }
      s.steadySince ??= now

      if (s.countdownStart === null && now - s.steadySince >= STEADY_MS) s.countdownStart = now
      if (s.countdownStart === null) return show('Perfect! Hold still…', null, true)

      const n = 3 - Math.floor((now - s.countdownStart) / COUNT_MS)
      if (n <= 0) return capture()
      show('Smile, or don\'t. The book reads it all!', n, true)
    }

    async function start() {
      setStatus('starting')
      setPhoto(null)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, // full HD for the close-up
          audio: false,
        })
      } catch {
        if (!cancelled) setStatus('denied')
        return
      }
      if (cancelled) return stop()
      const video = videoRef.current
      video.srcObject = stream
      await video.play().catch(() => {})
      setStatus('live')
      setHint('Getting the book ready to read you…')

      try {
        detector = detectorRef.current = await createDetector()
      } catch (e) {
        console.warn('Face detector failed to load', e)
        if (!cancelled) {
          setDetectorFailed(true)
          setHint('Press the button when your face is in the oval')
        }
        return
      }
      if (!cancelled) tick()
    }

    start()
    return () => {
      cancelled = true
      stop()
      detector?.close()
      detectorRef.current = null
    }
  }, [session])

  // An uploaded photo gets the same treatment as the camera: face close-up and expression, if a face is found.
  function loadTestPhoto(file) {
    if (!file) return
    const img = new Image()
    img.onload = async () => {
      let landmarks = null
      let measured
      let detector = detectorRef.current
      const own = !detector
      try {
        detector ??= await createDetector()
        const result = detector.detectForVideo(img, performance.now())
        if (result.faceLandmarks.length === 1) {
          landmarks = result.faceLandmarks[0]
          measured = readExpression(result.faceBlendshapes[0]?.categories) ?? undefined
        }
      } catch (e) {
        console.warn('Could not find a face in the test photo', e)
      } finally {
        if (own) detector?.close()
      }
      onCapture(makeShot(img, img.naturalWidth, img.naturalHeight, landmarks, measured))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }

  const testPhotoButton = (
    <label className="link file">
      Use a test photo
      <input type="file" accept="image/*" onChange={(e) => loadTestPhoto(e.target.files?.[0])} />
    </label>
  )

  return (
    <div className="card camera">
      <div className="camera-head">
          <button className="link" onClick={onBack}>Back</button>
        <h2>Hello, {heroName}! Let the book see you.</h2>
      </div>

      {error && <p className="error">{error}</p>}

      {status === 'denied' ? (
        <div className="denied">
          <p>
            The book needs your camera to read you. Please allow camera access in your browser, then try again.
          </p>
          <div className="row">
            <button className="primary" onClick={() => setSession((n) => n + 1)}>Try again</button>
            {testPhotoButton}
          </div>
        </div>
      ) : status === 'captured' && photo ? (
        <div className="review">
          <img className="viewport" src={photo.image} alt="The photo the book will read" />
          <div className="row">
            <button className="secondary" onClick={() => setSession((n) => n + 1)}>Retake photo</button>
            <button className="primary big" onClick={() => onCapture(photo)}>Read me</button>
          </div>
        </div>
      ) : (
        <>
          <div className={`viewport live ${aligned ? 'aligned' : ''}`}>
            <video ref={videoRef} playsInline muted />
            <svg className="guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <defs>
                <mask id="hole">
                  <rect width="100" height="100" fill="white" />
                  <ellipse cx="50" cy="48" rx="19" ry="34" fill="black" />
                </mask>
              </defs>
              <rect width="100" height="100" mask="url(#hole)" className="dim" />
              <ellipse cx="50" cy="48" rx="19" ry="34" className="oval" vectorEffect="non-scaling-stroke" />
            </svg>
            {count !== null && <div key={count} className="countdown">{count}</div>}
          </div>
          <p className={`hint ${aligned ? 'good' : ''}`} aria-live="polite">{hint}</p>
          <div className="row small">
            {(detectorFailed || status === 'live') && (
              <button className={detectorFailed ? 'primary' : 'link'} onClick={() => captureRef.current?.()}>
                Take photo now
              </button>
            )}
            {testPhotoButton}
          </div>
        </>
      )}

      <p className="privacy">One photo, used once, never stored.</p>
    </div>
  )
}
