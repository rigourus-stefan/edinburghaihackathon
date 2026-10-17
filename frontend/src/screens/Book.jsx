// BOOK SCREEN: shows the story page by page and reads it aloud.
// highlightTerms() works out which words came from the face scan; <Highlighted> makes them glow,
// with a hover label saying which scan feature each one came from.

import { useEffect, useMemo, useState } from 'react'
import useSpeech from '../useSpeech'

// Words too generic to highlight on their own (a "treasure chest" isn't from the scan).
const SKIP_WORDS = new Set(['look', 'face', 'top', 'shirt', 'round', 'neck', 'background', 'them', 'side', 'left', 'right',
  'chest', 'ear', 'ears', 'head', 'eyes', 'hand', 'line', 'shape', 'front', 'back', 'one', 'two'])
const FILLER = new Set(['a', 'an', 'the', 'and', 'of', 'very', 'slightly'])

// "hair with a yellow clip on the side" -> parts: "hair", "a yellow clip", "the side".
const JOINERS = /\s(?:on|with|from|behind|in|by|near|at|around|over|under|hanging|that|which|and)\s/

/**
 * Words and phrases from the face scan to highlight in the story, each mapped to where it came from.
 * For "tiny yellow star stud earring" that's the full phrase, every word pair ("yellow star",
 * "star stud", "stud earring") and the thing itself ("earring"), so the story's wording is
 * caught even when it shortens the phrase.
 */
function highlightTerms(f) {
  const sources = [
    ['Glasses', f.glasses], ['Hair', f.hair], ['Expression', f.expression], ['Clothes', f.clothing],
    ...(f.extras ?? []).map((e) => ['Detail', e]),
  ].filter(([, phrase]) => phrase)
  const terms = new Map()
  const add = (term, source) => { if (!terms.has(term)) terms.set(term, source) }
  for (const [label, phrase] of sources) {
    const source = `${label}: ${phrase}`
    add(phrase.toLowerCase(), source)
    for (const part of phrase.toLowerCase().split(JOINERS)) {
      const words = part.replace(/[^a-z\s-]/g, '').split(/\s+/).filter((w) => w && !FILLER.has(w))
      for (let i = 0; i < words.length - 1; i++) {
        if (!(SKIP_WORDS.has(words[i]) && SKIP_WORDS.has(words[i + 1]))) add(`${words[i]} ${words[i + 1]}`, source)
      }
      const noun = words.at(-1)
      if (noun && noun.length > 3 && !SKIP_WORDS.has(noun)) add(noun, source)
    }
  }
  return terms
}

function Highlighted({ text, terms }) {
  if (!terms.size) return text
  const keys = [...terms.keys()].sort((a, b) => b.length - a.length) // longest match wins
  const escaped = keys.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi'))
  // Which scan features a highlight came from (a joined highlight can hold more than one).
  const sourcesOf = (part) => {
    const lower = part.toLowerCase()
    return [...new Set(keys.filter((k) => lower.includes(k)).map((k) => terms.get(k)))].join(' · ')
  }
  // Join neighbouring matches ("navy blue" + " " + "hoodie") into one highlight.
  for (let i = 1; i + 2 < parts.length; i += 2) {
    if (/^\s+$/.test(parts[i + 1])) {
      parts.splice(i, 3, parts[i] + parts[i + 1] + parts[i + 2])
      i -= 2
    }
  }
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="feat" title={`From your face scan · ${sourcesOf(part)}`}>{part}</mark>
    ) : (
      part
    ),
  )
}

export default function Book({ story, features, onNewStory, onRestart }) {
  const terms = useMemo(() => highlightTerms(features), [features])
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
              <h1>{story.title}</h1>
              <p className="muted">A story written by the book that read you</p>
              <p className="scan-count">
                Built from <strong>{new Set([...terms.values()]).size} things</strong> the book saw in your face scan
              </p>
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

      <p className="scan-legend">
        <mark className="feat">Highlighted words</mark> come from your face scan. Hover one to see what the book saw.
      </p>

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
