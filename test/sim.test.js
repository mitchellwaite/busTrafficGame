import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, tap, useVip, laneCheck, vipAvailable, expire } from '../src/sim.js'
import { SIZE_LENGTH, SPOTS } from '../src/config.js'

const bus = (color, col, row, dir, size = 10) => ({ color, size, length: SIZE_LENGTH[size], col, row, dir })
const rep = (color, k) => Array(k).fill(color)
// Buses facing up with their nose on row 0 never block each other.
const row = (colors) => colors.map((c, i) => bus(c, i, 0, 'up'))
const make = (buses, queue, { cols = 8, rows = 4, loopCapacity = 50 } = {}) =>
  createGame({ level: 0, grid: { cols, rows }, buses: buses.map((b, id) => ({ id, ...b })), queue, loopCapacity, spots: [...SPOTS], solution: [] })
const types = (events) => events.map((e) => e.type)
const runs = (events) => types(events).reduce((acc, t) => (acc.at(-1)?.[0] === t ? acc.at(-1)[1]++ : acc.push([t, 1]), acc), [])

// Bus 0 (nose up at col 0) is blocked by bus 1 lying across row 0; bus 1 drives right, clear.
const blocked = (queue = []) => make([bus(0, 0, 2, 'up'), bus(1, 1, 0, 'right')], queue, { cols: 3, rows: 4 })

test('createGame streams the queue into the loop', () => {
  const { game, events } = make(row([0]), rep(0, 60), { loopCapacity: 50 })
  assert.equal(game.status, 'playing')
  assert.equal(events.length, 50)
  assert.deepEqual(events[3], { type: 'enter', passenger: 3, color: 0, slot: 3 })
  assert.equal(game.queueIndex, 50)
})

test('a blocked bus bounces and nothing changes', () => {
  const { game } = blocked()
  assert.deepEqual(laneCheck(game, 0), { clear: false, blocker: 1, freeCells: 1 })
  assert.deepEqual(tap(game, 0), [{ type: 'bounce', bus: 0, blocker: 1, freeCells: 1 }])
  assert.equal(game.buses[0].state, 'lot')
  assert.ok(game.spots.every((s) => s.bus === null))
  assert.deepEqual(tap(game, 1), [{ type: 'park', bus: 1, spot: 1 }])
  assert.deepEqual(laneCheck(game, 0), { clear: true })
  assert.deepEqual(tap(game, 0), [{ type: 'park', bus: 0, spot: 2 }])
})

test('parking uses the first free open spot, never VIP or locked', () => {
  const { game } = make(row([0, 1, 2, 3, 4]), [])
  assert.deepEqual([0, 1, 2, 3].map((id) => tap(game, id)[0].spot), [1, 2, 3, 4])
  assert.deepEqual(game.spots.map((s) => s.bus), [null, 0, 1, 2, 3, null, null, null])
  assert.deepEqual(tap(game, 1), []) // not in the lot
})

test('a bus boards only up to its seats, then departs; all gone wins', () => {
  const { game } = make([bus(0, 0, 0, 'up', 20)], rep(0, 25))
  const ev = tap(game, 0)
  assert.deepEqual(runs(ev), [['park', 1], ['board', 20], ['depart', 1], ['won', 1]])
  assert.equal(game.loop.filter((p) => p !== null).length, 5)
  assert.equal(game.status, 'won')
  assert.equal(game.buses[0].state, 'gone')
  assert.deepEqual(tap(game, 0), [])
})

test('earliest-parked bus fills first; departing frees the spot; events in causal order', () => {
  // 0 blue, 1 red A, 2 red B, 3 green, 4 yellow. Loop holds 10.
  const { game } = make(row([0, 1, 1, 2, 3]), [...rep(2, 10), ...rep(0, 10), ...rep(3, 10), ...rep(1, 20)], { loopCapacity: 10 })
  tap(game, 0) // blue -> spot 1
  tap(game, 1) // red A -> spot 2
  const ev = tap(game, 3) // green -> spot 3, boards, leaves; blue arrives, bus 0 leaves; yellow arrives
  assert.deepEqual(runs(ev), [['park', 1], ['board', 10], ['depart', 1], ['enter', 10], ['board', 10], ['depart', 1], ['enter', 10]])
  assert.ok(ev.slice(1, 11).every((e) => e.bus === 3 && e.spot === 3))
  assert.deepEqual(ev[11], { type: 'depart', bus: 3, spot: 3 })
  assert.deepEqual(game.spots.map((s) => s.bus).slice(0, 5), [null, null, 1, null, null])
  assert.deepEqual(tap(game, 2), [{ type: 'park', bus: 2, spot: 1 }]) // red B takes freed spot 1
  const end = tap(game, 4) // yellow -> spot 3; then 20 red arrive
  assert.equal(end[0].spot, 3)
  const red = end.filter((e) => e.type === 'board' && e.bus !== 4)
  assert.deepEqual(red.map((e) => e.bus), [...rep(1, 10), ...rep(2, 10)]) // A (spot 2) before B (spot 1)
  assert.equal(end.at(-1).type, 'won')
})

test('VIP teleports a blocked bus, which boards and departs', () => {
  const { game } = blocked(rep(0, 10))
  assert.equal(vipAvailable(game), true)
  const ev = useVip(game, 0)
  assert.deepEqual(ev[0], { type: 'teleport', bus: 0, spot: 0 })
  assert.deepEqual(runs(ev), [['teleport', 1], ['board', 10], ['depart', 1]])
  assert.ok(ev.slice(1, 11).every((e) => e.bus === 0 && e.spot === 0))
  assert.equal(game.spots[0].bus, null)
})

test('VIP removing a bus frees the lane behind it', () => {
  const { game } = blocked()
  useVip(game, 1)
  assert.deepEqual(laneCheck(game, 0), { clear: true })
})

test('VIP cannot be used while its spot is occupied', () => {
  const { game } = blocked()
  useVip(game, 1) // nobody boards, so bus 1 stays in VIP
  assert.equal(vipAvailable(game), false)
  assert.deepEqual(useVip(game, 0), [])
  assert.equal(game.buses[0].state, 'lot')
})

// Six buses colours 0..5; the loop (10) fills with colour 5, so buses 0..3 just wait.
const stuckGame = (queue = [...rep(5, 10), ...[0, 1, 2, 3, 4].flatMap((c) => rep(c, 10))]) => {
  const { game } = make(row([0, 1, 2, 3, 4, 5, 6].slice(0, new Set(queue).size)), queue, { loopCapacity: 10 })
  ;[0, 1, 2].forEach((id) => tap(game, id))
  return { game, ev: tap(game, 3) }
}

test('open spots full with VIP free goes stuck, not lost', () => {
  const { game, ev } = stuckGame()
  assert.deepEqual(ev.at(-1), { type: 'stuck' })
  assert.equal(game.status, 'stuck')
  assert.equal(vipAvailable(game), true)
  assert.deepEqual(tap(game, 4), [])
})

test('using VIP while stuck can un-stick the game', () => {
  const { game } = stuckGame()
  const ev = useVip(game, 5) // colour 5 boards, then the waiting buses fill one by one
  assert.equal(ev.at(-1).type, 'enter')
  assert.equal(game.status, 'playing')
})

test('using VIP while stuck that leaves it stuck re-emits stuck', () => {
  // Colour 6 arrives after colour 5, and bus 6 is still in the lot.
  const { game } = stuckGame([...rep(5, 10), ...rep(6, 10), ...[0, 1, 2, 3, 4].flatMap((c) => rep(c, 10))])
  assert.deepEqual(useVip(game, 5).at(-1), { type: 'stuck' })
  assert.equal(game.status, 'stuck')
})

test('open spots full with VIP occupied is lost at once', () => {
  const { game } = stuckGame()
  assert.deepEqual(useVip(game, 4).at(-1), { type: 'lost' })
  assert.equal(game.status, 'lost')
  const fresh = make(row([0, 1, 2, 3, 4]), rep(5, 10)).game
  useVip(fresh, 4)
  ;[0, 1, 2].forEach((id) => tap(fresh, id))
  assert.deepEqual(tap(fresh, 3).at(-1), { type: 'lost' })
  assert.equal(vipAvailable(fresh), false)
})

test('expire turns stuck into lost and is a no-op otherwise', () => {
  const { game } = stuckGame()
  assert.deepEqual(expire(game), [{ type: 'lost' }])
  assert.equal(game.status, 'lost')
  assert.equal(vipAvailable(game), false)
  assert.deepEqual(expire(game), [])
  const playing = make(row([0]), []).game
  assert.deepEqual(expire(playing), [])
  assert.equal(playing.status, 'playing')
})
