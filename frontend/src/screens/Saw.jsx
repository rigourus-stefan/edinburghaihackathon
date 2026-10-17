// "WHAT THE BOOK SAW" SCREEN: reveals each feature from the face scan one by one,
// then the mood. The story is already being written in the background while this plays.

import { useEffect, useState } from 'react'
import { featureList, MOOD_INFO } from '../api'

const REVEAL_MS = 650

export default function Saw({ heroName, features, story, storyError, onOpen, onRetry, onRetake }) {
  const items = featureList(features)
  const mood = MOOD_INFO[features.mood] ?? MOOD_INFO.neutral
  const [shown, setShown] = useState(0)
  const done = shown > items.length // all features + the mood card are visible

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 500 : REVEAL_MS)
    return () => clearTimeout(t)
  }, [shown, done])

  return (
    <div className="card saw">
      <p className="eyebrow">The book has read you</p>
      <h2>Here's what the book saw, {heroName}</h2>

      <ul className="features">
        {items.slice(0, shown).map((it, i) => (
          <li key={i} className="feature">
            <span>
              <span className="feature-label">{it.label}</span>
              <span className="feature-value">{it.value}</span>
            </span>
          </li>
        ))}
      </ul>

      {shown > items.length && (
        <div className={`mood-card mood-${features.mood}`}>
          <div>
            <span className="feature-label">Today you look</span>
            <strong>{mood.label}</strong>
            <p>{mood.line}</p>
          </div>
        </div>
      )}

      <div className="saw-actions">
        {!done ? (
          <p className="muted pulse">Reading…</p>
        ) : storyError ? (
          <>
            <p className="error">{storyError}</p>
            <button className="primary" onClick={onRetry}>Try writing it again</button>
          </>
        ) : story ? (
          <button className="primary big glow" onClick={onOpen}>Open my book</button>
        ) : (
          <p className="writing">
            The book is writing your story…
          </p>
        )}
        {done && <button className="link" onClick={onRetake}>That's not right, scan me again</button>}
      </div>
    </div>
  )
}
