import { useEffect, useMemo, useState } from 'react'
import { MOOD_INFO } from '../api'
import useSpeech from '../useSpeech'

const SKIP_WORDS = new Set(['look', 'eyes', 'face', 'smile', 'top', 'shirt', 'with', 'round', 'neck', 'background'])

/** Words/phrases to make glow: each full feature phrase, plus its key noun as a fallback. */
function highlightTerms(f) {
  const phrases = [f.glasses, f.hair, f.expression, f.clothing, ...(f.extras ?? [])].filter(Boolean)
  const terms = new Set()
  for (const p of phrases) {
    terms.add(p.toLowerCase())
    const words = p.toLowerCase().replace(/[^a-z\s-]/g, '').split(/\s+/)
    const key = [...words].reverse().find((w) => w.length > 3 && !SKIP_WORDS.has(w))
    if (key) terms.add(key)
  }
  return [...terms].sort((a, b) => b.length - a.length)
}

function Highlighted({ text, terms }) {
  if (!terms.length) return text
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="feat">{part}</mark> : part,
  )
}

export default function Book({ story, features, onNewStory, onRestart }) {
  const terms = useMemo(() => highlightTerms(features), [features])
  const mood = MOOD_INFO[story.mood] ?? MOOD_INFO.neutral
  const last = story.pages.length // page 0 is the title page
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState('next')
  const [playing, setPlaying] = useState(true)
  const { supported, speak, stop } = useSpeech()

  function go(to) {
    if (to < 0 || to > last) return
    setDir(to > page ? 'next' : 'prev')
    setPage(to)
  }

  // Read the open page aloud, then turn to the next one.
  useEffect(() => {
    if (!playing || !supported) return stop()
    const text = page === 0 ? story.title : story.pages[page - 1]
    speak(text, () => {
      if (page < last) setTimeout(() => go(page + 1), 700)
      else setPlaying(false)
    })
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, playing, supported])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(page + 1)
      if (e.key === 'ArrowLeft') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="book-wrap">
      <div className="book">
        <div key={page} className={`page turn-${dir}`}>
          {page === 0 ? (
            <div className="title-page">
              <span className="title-mood">{mood.icon}</span>
              <h1>{story.title}</h1>
              <p className="muted">A story written by the book that read you</p>
            </div>
          ) : (
            <>
              <p className="story-text">
                <Highlighted text={story.pages[page - 1]} terms={terms} />
              </p>
              <span className="page-number">{page}</span>
            </>
          )}
        </div>
      </div>

      <div className="book-controls">
        <button className="round" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        {supported && (
          <button className="primary" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Read to me'}
          </button>
        )}
        <span className="page-count">{page === 0 ? 'Title' : `Page ${page} of ${last}`}</span>
        <button className="round" onClick={() => go(page + 1)} disabled={page === last} aria-label="Next page">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div className="row small book-actions">
        <button className="link" onClick={() => window.print()}>Save as PDF</button>
        <button className="link" onClick={() => { stop(); onNewStory() }}>Write me another story</button>
        <button className="link" onClick={onRestart}>New reader</button>
      </div>

      {/* Print view: the whole story on paper. */}
      <section className="print-only">
        <h1>{story.title}</h1>
        {story.pages.map((p, i) => (
          <p key={i}><Highlighted text={p} terms={terms} /></p>
        ))}
        <footer>Written by The Book That Reads You</footer>
      </section>
    </div>
  )
}
