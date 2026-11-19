import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, tap, nextSpot, useVip, unlockSpot, fillParked, laneCheck, vipAvailable, unlockAvailable, fillAvailable, expire } from '../src/sim.js'
import { SPOTS } from '../src/config.js'

// Rules tests: any seat count, and every bus is 1 unit long so the geometry stays simple.
const bus = (color, x, y, a = 0, size = 10) => ({ color, size, length: 1, x, y, a })
const rep = (color, k) => Array(k).fill(color)
// 1-unit buses side by side along the top, facing up, never block each other.
const row = (colors) => colors.map((c, i) => bus(c, i + 0.5, 0.5))
const make = (buses, queue, { w = 8, h = 4, loopCapacity = 50, spots = SPOTS } = {}) =>
  createGame({ level: 0, lot: { w, h }, buses: buses.map((b, id) => ({ id, ...b })), queue, loopCapacity, spots: [...spots], solution: [] })
const types = (events) => events.map((e) => e.type)
const runs = (events) => types(events).reduce((acc, t) => (acc.at(-1)?.[0] === t ? acc.at(-1)[1]++ : acc.push([t, 1]), acc), [])

// Bus 0 (facing up, two units down) is blocked by bus 1 at the top facing right; bus 1 is clear.
const blocked = (queue = []) => make([bus(0, 0.5, 2.5), bus(1, 0.5, 0.5, 90)], queue, { w: 3, h: 4 })

test('createGame streams the queue into the loop', () => {
  const { game, events } = make(row([0]), rep(0, 60), { loopCapacity: 50 })
  assert.equal(game.status, 'playing')
  assert.equal(events.length, 50)
  assert.deepEqual(events[3], { type: 'enter', passenger: 3, color: 0, slot: 3 })
  assert.equal(game.queueIndex, 50)
})

test('a blocked bus bounces and nothing changes', () => {
  const { game } = blocked()
  const lane = laneCheck(game, 0)
  assert.deepEqual([lane.clear, lane.blocker], [false, 1])
  assert.ok(Math.abs(lane.free - 1.16) < 1e-9, `free ${lane.free}`) // body gap: 2 units apart minus two half-bodies
  assert.deepEqual(tap(game, 0), [{ type: 'bounce', bus: 0, blocker: 1, free: lane.free }])
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

test('the screen can pick the spot: any free open spot, or nothing happens', () => {
  const { game } = make(row([0, 1, 2]), [])
  assert.equal(nextSpot(game, (i) => i !== 1), 2) // spot 1 still emptying on screen
  assert.deepEqual(tap(game, 0, 3), [{ type: 'park', bus: 0, spot: 3 }])
  for (const spot of [0, 3, 5, -1]) assert.deepEqual(tap(game, 1, spot), []) // VIP, taken, locked, none
  assert.equal(game.buses[1].state, 'lot')
  assert.deepEqual(tap(game, 1), [{ type: 'park', bus: 1, spot: 1 }])
})

test('a bus takes the leftmost free spot, even one that just emptied', () => {
  const { game } = make(row([0, 1, 2, 3, 4]), [0, 1, 2, 3, 4].flatMap((c) => rep(c, 10)))
  assert.deepEqual([0, 1, 2, 3, 4].map((id) => tap(game, id)[0].spot), [1, 1, 1, 1, 1])
  assert.equal(game.status, 'won')
})

test('a bus boards only up to its seats, then departs; all gone wins', () => {
  const { game } = make([bus(0, 0.5, 1, 0, 20)], rep(0, 25))
  const ev = tap(game, 0)
  assert.deepEqual(runs(ev), [['park', 1], ['board', 20], ['depart', 1], ['won', 1]])
  assert.equal(game.loop.filter((p) => p !== null).length, 5)
  assert.equal(game.status, 'won')
  assert.equal(game.buses[0].state, 'gone')
  assert.deepEqual(tap(game, 0), [])
})

test('departing frees the spot; events in causal order', () => {
  // 0 blue, 1 red A, 2 red B, 3 green, 4 yellow. Loop holds 10.
  const { game } = make(row([0, 1, 1, 2, 3]), [...rep(2, 10), ...rep(0, 10), ...rep(3, 10), ...rep(1, 20)], { loopCapacity: 10 })
  tap(game, 0) // blue -> spot 1
  tap(game, 1) // red A -> spot 2
  const ev = tap(game, 3) // green -> spot 3, boards, leaves; blue arrives, bus 0 leaves; yellow arrives
  assert.deepEqual(runs(ev), [['park', 1], ['board', 10], ['depart', 1], ['enter', 10], ['board', 10], ['depart', 1], ['enter', 10]])
  assert.ok(ev.slice(1, 11).every((e) => e.bus === 3 && e.spot === 3))
  assert.deepEqual(ev[11], { type: 'depart', bus: 3, spot: 3 })
  assert.deepEqual(game.spots.map((s) => s.bus).slice(0, 5), [null, null, 1, null, null])
  assert.deepEqual(tap(game, 2), [{ type: 'park', bus: 2, spot: 1 }]) // red B takes the leftmost free spot
  const end = tap(game, 4) // yellow -> spot 3, now the leftmost free; then 20 red arrive
  assert.equal(end[0].spot, 3)
  const red = end.filter((e) => e.type === 'board' && e.bus !== 4)
  assert.deepEqual(red.map((e) => e.bus), [...rep(2, 10), ...rep(1, 10)]) // B (spot 1) before A (spot 2)
  assert.equal(end.at(-1).type, 'won')
})

test('passengers board the leftmost bus of their colour, not the first parked', () => {
  const { game } = make(row([1, 1, 2]), [...rep(2, 10), ...rep(1, 10)], { loopCapacity: 10 })
  tap(game, 0) // red A -> spot 1; the loop is all green, so nobody boards
  useVip(game, 1) // red B -> VIP spot 0, left of A
  const ev = tap(game, 2) // green boards and leaves; 10 red arrive and fill B
  assert.deepEqual(ev.filter((e) => e.type === 'board' && e.bus !== 2).map((e) => e.bus), rep(1, 10))
  assert.equal(game.buses[0].filled, 0)
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
const stuckGame = (queue = [...rep(5, 10), ...[0, 1, 2, 3, 4].flatMap((c) => rep(c, 10))], spots = SPOTS) => {
  const { game } = make(row([0, 1, 2, 3, 4, 5, 6].slice(0, new Set(queue).size)), queue, { loopCapacity: 10, spots })
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

test('open spots full stays stuck with VIP occupied and no locked spot: Fill can still help', () => {
  const { game } = stuckGame(undefined, SPOTS.filter((t) => t !== 'locked'))
  assert.deepEqual(useVip(game, 4).at(-1), { type: 'stuck' })
  assert.deepEqual([vipAvailable(game), unlockAvailable(game), fillAvailable(game)], [false, false, true])
})

test('unlocking opens the chosen locked spot, un-sticks the game and runs out', () => {
  const { game } = stuckGame()
  assert.deepEqual(unlockSpot(game, 6), [{ type: 'unlock', spot: 6 }])
  assert.equal(game.status, 'playing')
  assert.deepEqual(tap(game, 4), [{ type: 'park', bus: 4, spot: 6 }, { type: 'stuck' }]) // full again
  assert.deepEqual([1, 6, 99].map((s) => unlockSpot(game, s)), [[], [], []]) // not locked
  assert.deepEqual([unlockSpot(game, 7), unlockSpot(game, 5)].map((ev) => ev[0].spot), [7, 5])
  assert.deepEqual(game.spots.map((s) => s.type), ['vip', ...rep('open', 7)])
  assert.equal(unlockAvailable(game), false)
})

test('fill boards parked buses straight from the queue; those passengers never enter the loop', () => {
  const { game } = stuckGame() // loop: 10 of colour 5; buses 0-3 parked; queue: 10 each of colours 0-4 (ids 10-59)
  assert.equal(fillAvailable(game), true)
  const ev = fillParked(game)
  assert.deepEqual(runs(ev), [['fill', 40], ['depart', 4]])
  assert.deepEqual(ev.filter((e) => e.bus === 0 && e.type === 'fill').map((e) => e.passenger), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  assert.equal(game.status, 'playing')
  assert.equal(fillAvailable(game), false) // nothing parked
  assert.deepEqual(fillParked(game), [])
  const entered = tap(game, 5).filter((e) => e.type === 'enter').map((e) => e.passenger) // colour 5 boards, the loop refills
  assert.deepEqual(entered, [50, 51, 52, 53, 54, 55, 56, 57, 58, 59]) // 10-49 were skipped
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
