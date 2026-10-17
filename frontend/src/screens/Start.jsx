import { useState } from 'react'

const GENRES = [
  { id: 'adventure', label: 'Adventure', icon: '🗺️' },
  { id: 'space', label: 'Space', icon: '🚀' },
  { id: 'fantasy', label: 'Fantasy', icon: '🐉' },
  { id: 'mystery', label: 'Mystery', icon: '🔍' },
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
      <div className="book-icon" aria-hidden>📖</div>
      <h1>The Book That Reads You</h1>
      <p className="tagline">
        You've always read books. This one reads <em>you</em>.
      </p>

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
            <span className="genre-icon">{g.icon}</span>
            {g.label}
          </button>
        ))}
      </fieldset>

      <button className="primary big" disabled={!ready}>
        Let the book read me →
      </button>
    </form>
  )
}
