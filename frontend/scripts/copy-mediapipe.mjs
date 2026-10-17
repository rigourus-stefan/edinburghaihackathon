// Copies MediaPipe's wasm runtime into public/ so face detection works offline.
import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('public/mediapipe', { recursive: true })
cpSync('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true })
console.log('Copied MediaPipe wasm to public/mediapipe')
