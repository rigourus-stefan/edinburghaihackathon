import { useState } from 'react'
import { scanFace, writeStory } from './api'
import Start from './screens/Start'
import Camera from './screens/Camera'
import Scanning from './screens/Scanning'
import Saw from './screens/Saw'
import Book from './screens/Book'

// Screens: start -> camera -> scanning -> saw -> book
export default function App() {
  const [screen, setScreen] = useState('start')
  const [heroName, setHeroName] = useState('')
  const [genre, setGenre] = useState('adventure')
  const [photo, setPhoto] = useState(null)
  const [features, setFeatures] = useState(null)
  const [story, setStory] = useState(null)
  const [storyError, setStoryError] = useState(null)
  const [error, setError] = useState(null)

  function startWriting(f) {
    setStory(null)
    setStoryError(null)
    writeStory(heroName, genre, f)
      .then(setStory)
      .catch((e) => setStoryError(e.message))
  }

  function begin(name, g) {
    setHeroName(name)
    setGenre(g)
    setError(null)
    setScreen('camera')
  }

  async function onCaptured(image) {
    setPhoto(image)
    setError(null)
    setScreen('scanning')
    try {
      const f = await scanFace(image)
      setFeatures(f)
      // Start writing while the child watches "what the book saw": it hides the wait.
      startWriting(f)
      setScreen('saw')
    } catch (e) {
      setError(e.message)
      setScreen('camera')
    } finally {
      setPhoto(null) // one photo, used once: forget it as soon as the scan is done
    }
  }

  function restart() {
    window.speechSynthesis?.cancel()
    setFeatures(null)
    setStory(null)
    setError(null)
    setScreen('start')
  }

  const mood = story?.mood ?? (screen === 'saw' || screen === 'book' ? features?.mood : null) ?? 'none'

  return (
    <div className={`app mood-${mood}`}>
      <div className="stars" aria-hidden />
      <main className="stage">
        {screen === 'start' && <Start initialName={heroName} initialGenre={genre} onStart={begin} />}
        {screen === 'camera' && (
          <Camera heroName={heroName} error={error} onCapture={onCaptured} onBack={() => setScreen('start')} />
        )}
        {screen === 'scanning' && <Scanning photo={photo} />}
        {screen === 'saw' && features && (
          <Saw
            heroName={heroName}
            features={features}
            story={story}
            storyError={storyError}
            onOpen={() => setScreen('book')}
            onRetry={() => startWriting(features)}
            onRetake={() => setScreen('camera')}
          />
        )}
        {screen === 'book' && story && features && (
          <Book
            story={story}
            features={features}
            onNewStory={() => {
              startWriting(features)
              setScreen('saw')
            }}
            onRestart={restart}
          />
        )}
      </main>
      <footer className="privacy-footer">
        🔒 One photo, used once, never stored. The book never guesses age, race, gender, weight or health.
      </footer>
    </div>
  )
}
