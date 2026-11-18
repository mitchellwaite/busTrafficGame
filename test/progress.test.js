import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, save, applyWin } from '../src/progress.js'

const KEY = 'busTraffic.save'
const fake = (value) => {
  const m = new Map(value === undefined ? [] : [[KEY, value]])
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }
}
const DEFAULTS = { unlocked: 1, current: 1, coins: 0 }

test('defaults when nothing is saved or storage is unusable', () => {
  assert.deepEqual(load(fake()), DEFAULTS)
  assert.deepEqual(load({ getItem: () => { throw new Error('private mode') } }), DEFAULTS)
  assert.deepEqual(load(), DEFAULTS) // Node has no localStorage
  assert.doesNotThrow(() => save(DEFAULTS, { setItem: () => { throw new Error('quota') } }))
})

test('save then load round-trips', () => {
  const s = fake()
  save({ unlocked: 7, current: 4, coins: 300 }, s)
  assert.deepEqual(JSON.parse(s.m.get(KEY)), { unlocked: 7, current: 4, coins: 300 })
  assert.deepEqual(load(s), { unlocked: 7, current: 4, coins: 300 })
})

test('first completion unlocks the next level and pays 50 coins', () => {
  const p = { unlocked: 3, current: 3, coins: 100 }
  assert.deepEqual(applyWin(p, 3), { unlocked: 4, current: 4, coins: 150 })
  assert.deepEqual(p, { unlocked: 3, current: 3, coins: 100 }) // input untouched
})

test('replaying an old level pays nothing and keeps unlocked', () => {
  assert.deepEqual(applyWin({ unlocked: 5, current: 2, coins: 200 }, 2), { unlocked: 5, current: 3, coins: 200 })
})

test('a corrupt save falls back to defaults', () => {
  for (const bad of ['not json', 'null', '42', '{}', '{"unlocked":"3","current":1,"coins":0}',
    '{"unlocked":0,"current":1,"coins":0}', '{"unlocked":2,"current":3,"coins":0}', '{"unlocked":2,"current":1,"coins":-5}'])
    assert.deepEqual(load(fake(bad)), DEFAULTS, bad)
})
