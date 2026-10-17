// Fixed responses for MOCK=1, so the frontend can be built without an API key.
// Pick the mood with ?mood=happy|sad|neutral on either endpoint.

export const MOCK_FEATURES = {
  happy: {
    glasses: 'round black glasses',
    hair: 'short curly brown hair',
    expression: 'big toothy grin',
    clothing: 'green hoodie',
    extras: ['headphones round neck'],
    mood: 'happy',
  },
  sad: {
    glasses: null,
    hair: 'long straight black hair',
    expression: 'droopy, tired eyes',
    clothing: 'blue raincoat',
    extras: ['silver star earrings', 'yellow umbrella'],
    mood: 'sad',
  },
  neutral: {
    glasses: 'thin silver glasses',
    hair: 'red hair in a ponytail',
    expression: 'calm, steady look',
    clothing: 'yellow striped jumper',
    extras: [],
    mood: 'neutral',
  },
}

export function mockStory(name, mood) {
  const stories = {
    happy: {
      title: `${name} and the Giggling Comet`,
      pages: [
        `${name} pushed up their round black glasses and grinned a big toothy grin. A comet was zigzagging across the sky, giggling.`,
        `"It's lost!" said ${name}. The short curly brown hair bounced as ${name} jumped into the rocket.`,
        `Out in space, ${name}'s headphones picked up a tiny tune. It was the comet, humming to find its way home.`,
        `${name} hummed back, loud and happy. The comet laughed so hard it turned gold and followed the rocket.`,
        `Back home, ${name} zipped up the green hoodie and waved. Now, every night, one star giggles just for ${name}.`,
      ],
    },
    sad: {
      title: `${name} and the Grey Lighthouse`,
      pages: [
        `The sky had gone grey, just like ${name}'s droopy, tired eyes. ${name} pulled the blue raincoat tight and walked to the old lighthouse.`,
        `Its light had gone out. "I know how that feels," ${name} whispered. The silver star earrings glinted in the dark.`,
        `A small seal was waiting on the rocks. It had lost its way, and nobody else had noticed.`,
        `${name} held up an earring. The tiny star caught the moonlight and shone a path across the water.`,
        `The seal swam home. The lighthouse flickered back on, just a little. ${name} smiled and shook out the yellow umbrella. Nobody was alone tonight.`,
      ],
    },
    neutral: {
      title: `${name} and the Upside-Down Library`,
      pages: [
        `Everyone in the library was panicking. The books had flipped upside down! ${name} just watched, with a calm, steady look.`,
        `${name} adjusted their thin silver glasses. One book was the right way up. That was the clue.`,
        `Inside it, a tiny note: "Pull the ponytail." ${name} laughed and gave their red ponytail a tug. Nothing happened.`,
        `Then ${name} saw it: the yellow striped jumper matched the stripes on a secret shelf. ${name} pulled it.`,
        `Click! Every book flipped back. The librarian bowed. "Only a calm reader could have solved it, ${name}."`,
      ],
    },
  }
  return { ...stories[mood], mood }
}

// ---------- Backup story ----------
// Used only if every story model fails or is too slow, so a live demo always ends with a book.
// Built from the reader's real scan, so it still uses their name, genre, mood and details.

const WORLDS = {
  adventure: ['the Lost Map', 'a jungle of rope bridges and hidden treasure'],
  fantasy: ['the Whispering Forest', 'a forest where the trees whispered spells'],
  scifi: ['the Sleepy Moon', 'a starship drifting past a moon that had lost its glow'],
  mystery: ['the Missing Secret', 'a library where a secret had gone missing'],
  thriller: ['the Ticking Clock', 'a city racing a clock that was ticking far too fast'],
  horror: ['the Whispering Lighthouse', 'a creaky lighthouse full of whispers'],
  comedy: ['the Backwards Town', 'a town where everything went hilariously backwards'],
  fairytale: ['the Seventh Hill', 'a kingdom beyond the seventh hill'],
}

const ENDINGS = {
  happy: (name) => `${name} laughed, and the whole world lit up. It turned out joy was the strongest magic of all.`,
  sad: (name) => `Not everything was fixed, but ${name} wasn't alone any more. The sky was a little brighter, because of ${name}.`,
  neutral: (name) => `${name} smiled quietly. While everyone else had panicked, ${name} had simply watched, and noticed, and solved it.`,
}

export function backupStory(name, genre, f) {
  const [place, world] = WORLDS[genre] ?? WORLDS.adventure
  const [d1, d2] = f.extras
  const pages = [
    `${name} had always read books. But today, a book read ${name}, and opened onto ${world}.`,
    f.glasses
      ? `${name} pushed up their ${f.glasses} and spotted it at once: a clue nobody else had seen.`
      : `${name} looked closely and spotted it at once: a clue nobody else had seen.`,
    `${f.hair ? `With ${f.hair} blowing in the wind` : 'Taking a deep breath'}, ${name} followed the clue${f.expression ? `, wearing a ${f.expression}` : ''}.`,
    `${f.clothing ? `Tucked inside ${name}'s ${f.clothing} was exactly what they needed.` : `${name} found exactly what they needed.`}${d1 ? ` Even the ${d1} turned out to matter.` : ''}`,
    `${d2 ? `At the last moment, the ${d2} caught the light and showed the way. ` : ''}${ENDINGS[f.mood] ? ENDINGS[f.mood](name) : ENDINGS.neutral(name)}`,
  ]
  return { title: `${name} and ${place}`, pages, mood: f.mood, fallback: true }
}
