// BOOK SCREEN: the story as a real open book that reads itself aloud.
// - Desktop: two facing pages (a spread); the right page flips over the spine to turn.
// - Phone: one page at a time.
// - First spread: the book's handwritten notes about you (what it saw) facing the title page.
// highlightTerms() works out which words came from the face scan; <Highlighted> makes them glow,
// with a hover label saying which scan feature each one came from.

import { useEffect, useMemo, useState } from 'react'
import { featureList, MOOD_INFO } from '../api'
import useSpeech from '../useSpeech'

const FLIP_MS = 850 // how long a page takes to turn

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

/** True when the screen is wide enough for two facing pages. */
function useWide() {
  const query = '(min-width: 760px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

/** The book's pages in order: its notes about you, the title, the story, "The End". */
function buildLeaves(story) {
  const leaves = [{ kind: 'notes' }, { kind: 'title' }]
  story.pages.forEach((text, i) => leaves.push({ kind: 'story', text, n: i + 1 }))
  leaves.push({ kind: 'end' })
  if (leaves.length % 2) leaves.push({ kind: 'blank' }) // a spread always has two sides
  return leaves
}

export default function Book({ story, features, heroName, onNewStory, onRestart }) {
  const terms = useMemo(() => highlightTerms(features), [features])
  const leaves = useMemo(() => buildLeaves(story), [story])
  const seen = featureList(features)
  const mood = MOOD_INFO[story.mood] ?? MOOD_INFO.neutral
  const wide = useWide()
  const [reading, setReading] = useState(0) // the leaf being read (and shown)
  const [flip, setFlip] = useState(null) // { from, to } spreads while a page is turning
  const [playing, setPlaying] = useState(true)
  const { supported, speak, stop } = useSpeech()

  const spread = Math.floor(reading / 2)
  const lastSpread = leaves.length / 2 - 1

  /** Move to a leaf. On desktop, changing spread turns the page. */
  function goTo(leaf) {
    if (leaf < 0 || leaf >= leaves.length || flip) return
    const next = Math.floor(leaf / 2)
    if (wide && next !== spread) setFlip({ from: spread, to: next })
    setReading(leaf)
  }
  const step = (dir) => goTo(wide ? (spread + dir) * 2 : reading + dir)

  useEffect(() => {
    if (!flip) return
    const t = setTimeout(() => setFlip(null), FLIP_MS)
    return () => clearTimeout(t)
  }, [flip])

  // What the voice says for each leaf.
  function spoken(leaf) {
    if (leaf.kind === 'notes') {
      return `Dear ${heroName}. I looked at you, and here is what I saw: ${seen.map((s) => s.value).join('. ')}. ` +
        `Today you seem ${mood.label.toLowerCase()}. So I wrote you this story.`
    }
    if (leaf.kind === 'title') return story.title
    if (leaf.kind === 'story') return leaf.text
    if (leaf.kind === 'end') return 'The end.'
    return ''
  }

  // Read the open page aloud, then move on to the next one (turning the page when needed).
  useEffect(() => {
    if (!playing || !supported) return stop()
    const text = spoken(leaves[reading])
    const next = () => (reading < leaves.length - 1 ? setTimeout(() => goTo(reading + 1), 600) : setPlaying(false))
    if (!text) { next(); return }
    speak(text, next)
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, playing, supported])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function renderLeaf(index, side) {
    const leaf = leaves[index]
    const active = index === reading && playing ? ' reading' : ''
    if (!leaf) return <div className={`leaf ${side}`} />
    const number = leaf.n && <span className="page-number">{leaf.n}</span>
    return (
      <div className={`leaf ${side}${active}`}>
        {leaf.kind === 'notes' && (
          <div className="notes">
            <p className="dear">Dear {heroName},</p>
            <p>I looked at you, and here is what I saw:</p>
            <ul>
              {seen.map((it, i) => (
                <li key={i}><span>{it.label}</span>{it.value}</li>
              ))}
            </ul>
            <p>Today you seem <strong>{mood.label.toLowerCase()}</strong>. So I wrote you this story.</p>
            <p className="signature">The Book</p>
          </div>
        )}
        {leaf.kind === 'title' && (
          <div className="title-page">
            <p className="eyebrow">A story for {heroName}</p>
            <h1>{story.title}</h1>
            <p className="muted">Written by the book that read you</p>
            <p className="scan-count">
              Built from <strong>{new Set([...terms.values()]).size} things</strong> the book saw in your face scan
            </p>
          </div>
        )}
        {leaf.kind === 'story' && (
          <p className="story-text"><Highlighted text={leaf.text} terms={terms} /></p>
        )}
        {leaf.kind === 'end' && <p className="the-end">The End</p>}
        {number}
      </div>
    )
  }

  // Which leaves sit on the left and right, and the one turning over the spine.
  let left, right, turning
  if (flip && flip.to > flip.from) {
    left = flip.from * 2
    right = flip.to * 2 + 1
    turning = { dir: 'next', front: [flip.from * 2 + 1, 'right'], back: [flip.to * 2, 'left'] }
  } else if (flip) {
    left = flip.to * 2
    right = flip.from * 2 + 1
    turning = { dir: 'prev', front: [flip.from * 2, 'left'], back: [flip.to * 2 + 1, 'right'] }
  } else {
    left = spread * 2
    right = spread * 2 + 1
  }

  const current = leaves[reading]
  const position =
    current.kind === 'notes' ? "The book's notes" :
    current.kind === 'title' ? 'Title' :
    current.kind === 'story' ? `Page ${current.n} of ${story.pages.length}` : 'The End'
  const atStart = wide ? spread === 0 : reading === 0
  const atEnd = wide ? spread === lastSpread : reading === leaves.length - 1

  return (
    <div className="book-wrap">
      {wide ? (
        <div className="book open">
          <div className="spread">
            {renderLeaf(left, 'left')}
            {renderLeaf(right, 'right')}
            {turning && (
              <div className={`turning ${turning.dir}`}>
                <div className="face front">{renderLeaf(...turning.front)}</div>
                <div className="face back">{renderLeaf(...turning.back)}</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="book single">
          <div key={reading} className="single-page">{renderLeaf(reading, 'right')}</div>
        </div>
      )}

      <p className="scan-legend">
        <mark className="feat">Highlighted words</mark> come from your face scan. Hover one to see what the book saw.
      </p>

      <div className="book-controls">
        <button className="round" onClick={() => step(-1)} disabled={atStart || !!flip} aria-label="Previous page">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        {supported && (
          <button className="primary" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Read to me'}
          </button>
        )}
        <span className="page-count">{position}</span>
        <button className="round" onClick={() => step(1)} disabled={atEnd || !!flip} aria-label="Next page">
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
