import { useCallback, useEffect, useRef, useState } from 'react'

// Warm, clear storytelling voices, best first. Falls back to any English voice.
const PREFERRED = ['Samantha', 'Karen', 'Moira', 'Serena', 'Google UK English Female', 'Microsoft Libby', 'Microsoft Aria', 'Daniel', 'Google US English']

function pickVoice(voices) {
  for (const name of PREFERRED) {
    const v = voices.find((v) => v.name.includes(name))
    if (v) return v
  }
  return voices.find((v) => v.lang?.startsWith('en')) ?? voices[0] ?? null
}

/** Read-aloud with the browser's built-in SpeechSynthesis. */
export default function useSpeech() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  const [voice, setVoice] = useState(null)
  const token = useRef(0) // ignores 'end' events from utterances we cancelled

  useEffect(() => {
    if (!synth) return
    const load = () => setVoice(pickVoice(synth.getVoices()))
    load()
    synth.addEventListener('voiceschanged', load)
    return () => {
      synth.removeEventListener('voiceschanged', load)
      synth.cancel()
    }
  }, [synth])

  const stop = useCallback(() => {
    token.current++
    synth?.cancel()
  }, [synth])

  const speak = useCallback(
    (text, onDone) => {
      if (!synth) return
      stop()
      const id = token.current
      const u = new SpeechSynthesisUtterance(text)
      if (voice) u.voice = voice
      u.rate = 0.92
      u.pitch = 1.05
      u.onend = () => id === token.current && onDone?.()
      synth.speak(u)
    },
    [synth, voice, stop],
  )

  return { supported: !!synth, speak, stop }
}
