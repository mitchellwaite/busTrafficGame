import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateLevel } from '../src/generator.js'
import { createGame, tap, laneCheck } from '../src/sim.js'
import { overlaps, inside } from '../src/geometry.js'
import { SIZE_LENGTH, SPOTS, LOOP_CAPACITY, MAX_COLORS } from '../src/config.js'

const N = 300
const times = []
const levels = []
for (let n = 1; n <= N; n++) {
  const t = performance.now()
  levels.push(generateLevel(n))
  times.push(performance.now() - t)
}

test('levels are deterministic', () => {
  levels.forEach((L, i) => assert.deepEqual(generateLevel(i + 1), L, `level ${i + 1}`))
})

test('levels generate in well under 100 ms', () => {
  const max = Math.max(...times)
  assert.ok(max < 100, `slowest took ${max.toFixed(1)} ms`)
})

test('levels are well-formed, in bounds and overlap-free', () => {
  for (const L of levels) {
    const { w, h } = L.lot
    assert.ok(w <= 11 && h <= 12, `level ${L.level} lot`)
    assert.equal(L.loopCapacity, LOOP_CAPACITY)
    assert.deepEqual(L.spots, SPOTS)
    L.buses.forEach((b, i) => {
      assert.equal(b.id, i)
      assert.equal(b.length, SIZE_LENGTH[b.size])
      assert.ok(Number.isInteger(b.color) && b.color >= 0 && b.color < MAX_COLORS)
      assert.ok(b.a % 45 === 0, `level ${L.level} bus ${i} heading`)
      assert.ok(inside(b, w, h), `level ${L.level} bus ${i} out of bounds`)
      L.buses.slice(0, i).forEach((o) => assert.ok(!overlaps(o, b), `level ${L.level} buses ${o.id} and ${i} overlap`))
    })
  }
})

test('lots grow with the bus count, and diagonal buses appear from level 11', () => {
  const at = (n) => levels[n - 1]
  assert.ok(at(300).buses.length > 2 * at(5).buses.length && at(300).lot.w > at(5).lot.w)
  assert.ok(levels.slice(0, 10).every((L) => L.buses.every((b) => b.a % 90 === 0)))
  assert.ok(levels.slice(10).some((L) => L.buses.some((b) => b.a % 90 !== 0)))
})

test('seats per colour equal passengers per colour', () => {
  for (const L of levels) {
    const seats = Array(MAX_COLORS).fill(0)
    const pax = Array(MAX_COLORS).fill(0)
    for (const b of L.buses) seats[b.color] += b.size
    for (const c of L.queue) pax[c]++
    assert.deepEqual(pax, seats, `level ${L.level}`)
  }
})

test('block graphs are acyclic', () => {
  for (const L of levels) {
    const { game } = createGame(L)
    for (let left = L.buses.length; left > 0; left--) {
      const free = game.buses.find((b) => b.state === 'lot' && laneCheck(game, b.id).clear)
      assert.ok(free, `level ${L.level} has a cycle`)
      free.state = 'gone' // test-only shortcut: lift it out of the lot
    }
  }
})

test('each solution wins with taps only (no VIP)', () => {
  for (const L of levels) {
    assert.deepEqual([...L.solution].sort((a, b) => a - b), L.buses.map((b) => b.id), `level ${L.level}`)
    const { game } = createGame(L)
    for (const id of L.solution) assert.equal(tap(game, id)[0]?.type, 'park', `level ${L.level} bus ${id}`)
    assert.equal(game.status, 'won', `level ${L.level}`)
  }
})

test('from level 11 the solution needs buffering: some bus waits in a spot', () => {
  for (const L of levels.slice(10)) {
    const { game } = createGame(L)
    let peak = 0
    for (const id of L.solution) {
      tap(game, id)
      peak = Math.max(peak, game.buses.filter((b) => b.state === 'parked').length)
    }
    assert.ok(peak >= 1, `level ${L.level} peak ${peak}`)
  }
})
