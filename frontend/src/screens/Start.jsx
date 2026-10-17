// START SCREEN: the title, your name and the genre picker.

import { useState } from 'react'

const GENRES = [
  { id: 'adventure', label: 'Adventure' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'scifi', label: 'Sci-Fi' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'horror', label: 'Horror' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'fairytale', label: 'Fairy Tale' },
]

export default function Start({ initialName, initialGenre, onStart }) {
  const [name, setName] = useState(initialName)
  const [genre, setGenre] = useState(initialGenre)
  const ready = name.trim().length > 0

  return (
    <form
      className="card start"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onStart(name.trim(), genre)
      }}
    >
      <div className="book-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6.2C9.4 4.5 6.5 4.3 3.5 5v13.2c3-.7 5.9-.5 8.5 1.2 2.6-1.7 5.5-1.9 8.5-1.2V5c-3-.7-5.9-.5-8.5 1.2Z" />
          <path d="M12 6.2v13.2" />
        </svg>
      </div>
      <h1 className="hero-title">
        <span className="title-old">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          <s>You read the book.</s>
        </span>
        <span className="title-new">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          <span>The book reads you.</span>
        </span>
      </h1>

      <label className="field">
        <span>What's the hero's name?</span>
        <input
          autoFocus
          value={name}
          maxLength={30}
          placeholder="Type your name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <fieldset className="genres">
        <legend>Pick your kind of story</legend>
        {GENRES.map((g) => (
          <button
            type="button"
            key={g.id}
            className={`genre ${genre === g.id ? 'selected' : ''}`}
            aria-pressed={genre === g.id}
            onClick={() => setGenre(g.id)}
          >
            {g.label}
          </button>
        ))}
      </fieldset>

      <button className="primary big" disabled={!ready}>
        Let the book read me
      </button>
    </form>
  )
}
