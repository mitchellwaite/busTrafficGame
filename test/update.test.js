import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// update.js only notices a new version in the files it fingerprints, so it must list every file the game loads.
test('update.js checks every file the game loads', () => {
  const src = readFileSync(new URL('../update.js', import.meta.url), 'utf8')
  const listed = JSON.parse(src.match(/const FILES = (\[[^\]]*\])/)[1].replaceAll("'", '"'))
  const modules = readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f)
  assert.deepEqual([...listed].sort(), ['index.html', 'style.css', 'update.js', ...modules].sort())
})
