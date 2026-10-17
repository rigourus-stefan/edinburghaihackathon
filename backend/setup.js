// `npm run setup`: asks for your Nebius API key, checks it works, and saves it to backend/.env.
// The key stays on your machine: .env is gitignored.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import OpenAI from 'openai'

const ENV = new URL('./.env', import.meta.url)
const EXAMPLE = new URL('./.env.example', import.meta.url)

const rl = createInterface({ input: process.stdin, output: process.stdout })
const lines = rl[Symbol.asyncIterator]() // buffers answers, so piped input works too
async function ask(question) {
  process.stdout.write(question)
  return (await lines.next()).value ?? ''
}
console.log('\n📖 The Book That Reads You: backend setup\n')

const existing = existsSync(ENV) ? readFileSync(ENV, 'utf8') : ''
if (/^NEBIUS_API_KEY=(?!your-).+/m.test(existing)) {
  const answer = await ask('backend/.env already has a key. Replace it? (y/N) ')
  if (!/^y/i.test(answer.trim())) {
    console.log('Kept your existing key. Start the server with: npm start')
    rl.close()
    process.exit(0)
  }
}

const key = (await ask('Paste your Nebius API key: ')).trim().replace(/^["']|["']$/g, '')
rl.close()
if (!key) {
  console.error('No key entered. Nothing changed.')
  process.exit(1)
}

process.stdout.write('Checking the key with Nebius… ')
try {
  const client = new OpenAI({ baseURL: 'https://api.tokenfactory.nebius.com/v1/', apiKey: key, timeout: 15_000 })
  await client.models.list()
  console.log('✅ it works.')
} catch (e) {
  console.log(`❌ ${e.status === 401 ? 'Nebius rejected that key.' : `couldn't check it (${e.message}).`}`)
  console.log('Saving it anyway. Run `npm run setup` again to change it.')
}

// Keep any other settings already in .env (or the template's comments), and swap in the key.
const base = existing || (existsSync(EXAMPLE) ? readFileSync(EXAMPLE, 'utf8') : '')
const line = `NEBIUS_API_KEY=${key}`
const env = /^NEBIUS_API_KEY=.*$/m.test(base) ? base.replace(/^NEBIUS_API_KEY=.*$/m, line) : `${line}\n${base}`
writeFileSync(ENV, env, { mode: 0o600 })

console.log('\nSaved to backend/.env (gitignored, never committed).')
console.log('Start the server with: npm start\n')
