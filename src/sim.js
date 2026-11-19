/**
 * Bus Traffic rules (PLAN.md §4). Pure: no DOM, no randomness, no clock.
 * Every action settles instantly and returns the events it caused, in causal order.
 *
 * Game state, safe to read for drawing (change it only through the exported actions):
 * {
 *   level,        // the Level it was created from (never modified)
 *   status,       // 'playing' | 'stuck' | 'won' | 'lost'
 *   buses: [{     // same order and ids as level.buses
 *     id, color, size, length, x, y, a,  // copied from the level; centre and heading, see geometry.js
 *     state,      // 'lot' | 'parked' | 'gone'
 *     spot,       // index into spots while parked, else null
 *     filled,     // passengers on board, 0..size
 *   }],
 *   spots: [{ type, bus }], // type 'vip' | 'open' | 'locked' (unlockSpot opens one); bus = id or null
 *   loop,         // loopCapacity slots, each a passenger id or null
 *   queueIndex,   // next passenger id to enter (ids in skip are passed over)
 *   skip,         // Set of queued passenger ids the Fill power-up already put on a bus
 *   passengers,   // passenger id (= queue index) -> colour; this is level.queue
 * }
 */

import { hitDistance } from './geometry.js'

export function createGame(level) {
  const game = {
    level,
    status: 'playing',
    buses: level.buses.map((b) => ({ ...b, state: 'lot', spot: null, filled: 0 })),
    spots: level.spots.map((type) => ({ type, bus: null })),
    loop: Array(level.loopCapacity).fill(null),
    queueIndex: 0,
    skip: new Set(),
    passengers: level.queue,
  }
  const events = []
  settle(game, events)
  return { game, events }
}

// spot: which free open spot the bus drives to (game.js picks one that is empty on screen); default nextSpot.
export function tap(game, busId, spot = nextSpot(game)) {
  const bus = game.buses[busId]
  if (game.status !== 'playing' || bus?.state !== 'lot' || game.spots[spot]?.type !== 'open' || game.spots[spot].bus !== null) return []
  const lane = laneCheck(game, busId)
  if (!lane.clear) return [{ type: 'bounce', bus: busId, blocker: lane.blocker, free: lane.free }]
  return arrive(game, bus, spot, 'park')
}

// The leftmost free open spot, or -1; only spots where usable(i) holds. game.js passes usable = "empty on screen too".
export function nextSpot(game, usable = () => true) {
  return game.spots.findIndex((s, i) => s.type === 'open' && s.bus === null && usable(i))
}

export function useVip(game, busId) {
  const bus = game.buses[busId]
  if (!vipAvailable(game) || bus?.state !== 'lot') return []
  return arrive(game, bus, game.spots.findIndex((s) => s.type === 'vip'), 'teleport')
}

// Extra-spot power-up: opens this locked spot for the rest of this game.
export function unlockSpot(game, spot) {
  if (!live(game) || game.spots[spot]?.type !== 'locked') return []
  game.spots[spot].type = 'open'
  const events = [{ type: 'unlock', spot }]
  settle(game, events)
  return events
}

// Fill power-up: every parked bus takes its missing passengers straight from the queue, in queue order, leftmost
// bus first. (Matching passengers on the loop have already boarded.) Each colour has exactly as many passengers as
// seats, so every parked bus fills and departs.
export function fillParked(game) {
  if (!fillAvailable(game)) return []
  const events = []
  const parked = game.buses.filter((b) => b.state === 'parked').sort((a, b) => a.spot - b.spot)
  for (let p = game.queueIndex; p < game.passengers.length; p++) {
    const bus = !game.skip.has(p) && parked.find((b) => b.color === game.passengers[p] && b.filled < b.size)
    if (!bus) continue
    bus.filled++
    game.skip.add(p)
    events.push({ type: 'fill', passenger: p, bus: bus.id, spot: bus.spot })
  }
  settle(game, events)
  return events
}

// The first lot bus in this bus's way and how far it can drive before touching it (lot units).
export function laneCheck(game, busId) {
  const bus = game.buses[busId]
  let blocker = null, free = Infinity
  for (const b of game.buses) {
    const d = b.state === 'lot' && b !== bus ? hitDistance(bus, b) : Infinity
    if (d < free) [blocker, free] = [b.id, d]
  }
  return blocker === null ? { clear: true } : { clear: false, blocker, free }
}

// Power-ups can be used while playing or stuck. Coins are not the rules' business: game.js checks the cost.
const live = (game) => game.status === 'playing' || game.status === 'stuck'
export const vipAvailable = (game) => live(game) && vipFree(game)
export const unlockAvailable = (game) => live(game) && game.spots.some((s) => s.type === 'locked')
export const fillAvailable = (game) => live(game) && game.buses.some((b) => b.state === 'parked' && b.filled < b.size)

export function expire(game) {
  if (game.status !== 'stuck') return []
  game.status = 'lost'
  return [{ type: 'lost' }]
}

const vipFree = (game) => game.spots.some((s) => s.type === 'vip' && s.bus === null)

function arrive(game, bus, spot, type) {
  bus.state = 'parked'
  bus.spot = spot
  game.spots[spot].bus = bus.id
  const events = [{ type, bus: bus.id, spot }]
  settle(game, events)
  return events
}

// Stream in -> board -> depart until stable, then set status. Re-emits 'stuck' after a VIP use that
// leaves the game stuck, so the countdown can restart. A full row is only ever 'stuck', never 'lost': it is full of
// parked buses waiting for passengers, so the Fill power-up can always clear it. Only expire() loses.
function settle(game, events) {
  const { loop, passengers } = game
  for (let changed = true; changed; ) {
    changed = false
    for (let s = 0; s < loop.length; s++) {
      if (loop[s] !== null) continue
      while (game.skip.has(game.queueIndex)) game.queueIndex++
      if (game.queueIndex >= passengers.length) break
      const p = game.queueIndex++
      loop[s] = p
      events.push({ type: 'enter', passenger: p, color: passengers[p], slot: s })
      changed = true
    }
    // Passengers prefer the leftmost bus of their colour (spots are numbered left to right, VIP first).
    const parked = game.buses.filter((b) => b.state === 'parked').sort((a, b) => a.spot - b.spot)
    loop.forEach((p, s) => {
      const bus = p !== null && parked.find((b) => b.color === passengers[p] && b.filled < b.size)
      if (!bus) return
      bus.filled++
      loop[s] = null
      events.push({ type: 'board', passenger: p, bus: bus.id, spot: bus.spot })
      changed = true
    })
    for (const b of parked) {
      if (b.filled < b.size) continue
      events.push({ type: 'depart', bus: b.id, spot: b.spot })
      game.spots[b.spot].bus = null
      b.state = 'gone'
      b.spot = null
      changed = true
    }
  }
  game.status = game.buses.every((b) => b.state === 'gone')
    ? 'won'
    : game.spots.every((s) => s.type !== 'open' || s.bus !== null)
      ? 'stuck'
      : 'playing'
  if (game.status !== 'playing') events.push({ type: game.status })
}
