import { useEffect, useRef, useState } from 'react'
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

const STEADY_MS = 1000 // face must hold still this long before the countdown
const COUNT_MS = 900 // length of each 3-2-1 step
const MAX_MOVE = 0.035 // how far the face centre may drift between frames (share of frame width)
const CAPTURE_WIDTH = 768

/** Draws a source (video or image) onto a canvas ~768px wide and returns a JPEG data URL. */
function toJpeg(source, srcWidth, srcHeight) {
  const scale = Math.min(1, CAPTURE_WIDTH / srcWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(srcWidth * scale)
  canvas.height = Math.round(srcHeight * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
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

async function createDetector() {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe')
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.6,
  })
  try {
    return await FaceDetector.createFromOptions(fileset, options('GPU'))
  } catch {
    return FaceDetector.createFromOptions(fileset, options('CPU'))
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

  useEffect(() => {
    let cancelled = false
    let stream = null
    let detector = null
    let raf = 0
    const lightCanvas = Object.assign(document.createElement('canvas'), { width: 24, height: 24 })
    const s = { steadySince: null, countdownStart: null, last: null, frame: 0, dark: false, hint: '', count: null, ok: false }

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
      const image = toJpeg(video, video.videoWidth, video.videoHeight)
      stop() // camera off the moment the photo is taken
      setPhoto(image)
      setStatus('captured')
    }
    captureRef.current = capture

    function tick() {
      if (cancelled) return
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      if (!detector || !video || video.readyState < 2) return

      const now = performance.now()
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (s.frame++ % 10 === 0) s.dark = brightness(video, lightCanvas) < 45

      const faces = detector.detectForVideo(video, now).detections
      let problem = null
      let centre = null
      if (s.dark) problem = "It's a bit too dark. Find some light!"
      else if (faces.length === 0) problem = 'Look at the book so it can see you'
      else if (faces.length > 1) problem = 'Only one face please'
      else {
        const b = faces[0].boundingBox
        centre = { x: (b.originX + b.width / 2) / vw, y: (b.originY + b.height / 2) / vh }
        const size = b.width / vw
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
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
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
        detector = await createDetector()
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
    }
  }, [session])

  function loadTestPhoto(file) {
    if (!file) return
    const img = new Image()
    img.onload = () => {
      onCapture(toJpeg(img, img.naturalWidth, img.naturalHeight))
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
          <img className="viewport" src={photo} alt="The photo the book will read" />
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
