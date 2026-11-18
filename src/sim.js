/**
 * Bus Traffic rules (PLAN.md §4). Pure: no DOM, no randomness, no clock.
 * Every action settles instantly and returns the events it caused, in causal order.
 *
 * Game state, safe to read for drawing (change it only through the exported actions):
 * {
 *   level,        // the Level it was created from (never modified)
 *   status,       // 'playing' | 'stuck' | 'won' | 'lost'
 *   buses: [{     // same order and ids as level.buses
 *     id, color, size, length, col, row, dir,  // copied from the level; (col,row) = nose cell
 *     state,      // 'lot' | 'parked' | 'gone'
 *     spot,       // index into spots while parked, else null
 *     filled,     // passengers on board, 0..size
 *     parkedAt,   // park order (lower boards first), null while in the lot
 *   }],
 *   spots: [{ type, bus }], // type 'vip' | 'open' | 'locked'; bus = id or null
 *   loop,         // loopCapacity slots, each a passenger id or null
 *   queueIndex,   // next passenger id to enter; passengers.length - queueIndex still wait off-screen
 *   passengers,   // passenger id (= queue index) -> colour; this is level.queue
 * }
 */

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

// Cells a bus covers, nose first.
export const busCells = (b) =>
  Array.from({ length: b.length }, (_, k) => [b.col - DIRS[b.dir][0] * k, b.row - DIRS[b.dir][1] * k])

export function createGame(level) {
  const game = {
    level,
    status: 'playing',
    buses: level.buses.map((b) => ({ ...b, state: 'lot', spot: null, filled: 0, parkedAt: null })),
    spots: level.spots.map((type) => ({ type, bus: null })),
    loop: Array(level.loopCapacity).fill(null),
    queueIndex: 0,
    passengers: level.queue,
  }
  const events = []
  settle(game, events)
  return { game, events }
}

export function tap(game, busId) {
  const bus = game.buses[busId]
  if (game.status !== 'playing' || bus?.state !== 'lot') return []
  const lane = laneCheck(game, busId)
  if (!lane.clear) return [{ type: 'bounce', bus: busId, blocker: lane.blocker, freeCells: lane.freeCells }]
  // 'playing' guarantees a free open spot.
  return arrive(game, bus, game.spots.findIndex((s) => s.type === 'open' && s.bus === null), 'park')
}

export function useVip(game, busId) {
  const bus = game.buses[busId]
  if (!vipAvailable(game) || bus?.state !== 'lot') return []
  return arrive(game, bus, game.spots.findIndex((s) => s.type === 'vip'), 'teleport')
}

export function laneCheck(game, busId) {
  const { cols, rows } = game.level.grid
  const at = new Map()
  for (const b of game.buses) if (b.state === 'lot') for (const [c, r] of busCells(b)) at.set(r * cols + c, b.id)
  const bus = game.buses[busId]
  const [dx, dy] = DIRS[bus.dir]
  for (let c = bus.col + dx, r = bus.row + dy, free = 0; c >= 0 && c < cols && r >= 0 && r < rows; c += dx, r += dy, free++)
    if (at.has(r * cols + c)) return { clear: false, blocker: at.get(r * cols + c), freeCells: free }
  return { clear: true }
}

export const vipAvailable = (game) => (game.status === 'playing' || game.status === 'stuck') && vipFree(game)

export function expire(game) {
  if (game.status !== 'stuck') return []
  game.status = 'lost'
  return [{ type: 'lost' }]
}

const vipFree = (game) => game.spots.some((s) => s.type === 'vip' && s.bus === null)

function arrive(game, bus, spot, type) {
  // Buses never return to the lot, so this count only grows.
  bus.parkedAt = game.buses.filter((b) => b.state !== 'lot').length
  bus.state = 'parked'
  bus.spot = spot
  game.spots[spot].bus = bus.id
  const events = [{ type, bus: bus.id, spot }]
  settle(game, events)
  return events
}

// Stream in -> board -> depart until stable, then set status. Re-emits 'stuck' after a VIP use that
// leaves the game stuck, so the countdown can restart.
function settle(game, events) {
  const { loop, passengers } = game
  for (let changed = true; changed; ) {
    changed = false
    for (let s = 0; s < loop.length && game.queueIndex < passengers.length; s++) {
      if (loop[s] !== null) continue
      const p = game.queueIndex++
      loop[s] = p
      events.push({ type: 'enter', passenger: p, color: passengers[p], slot: s })
      changed = true
    }
    const parked = game.buses.filter((b) => b.state === 'parked').sort((a, b) => a.parkedAt - b.parkedAt)
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
      ? vipFree(game) ? 'stuck' : 'lost'
      : 'playing'
  if (game.status !== 'playing') events.push({ type: game.status })
}
