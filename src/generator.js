import { mulberry32, randInt, pick, shuffle } from './rng.js'
import { SIZE_LENGTH, SPOTS, LOOP_CAPACITY, MAX_COLORS, difficulty } from './config.js'
import { createGame, tap } from './sim.js'
import { hitDistance, overlaps, inside } from './geometry.js'

const AXIS = [0, 90, 180, 270], DIAG = [45, 135, 225, 315]
const GAP = 0.08 // least clearance between bus bodies, in lot units

// Deterministic: the same n always gives the same (deep-equal) level, verified winnable by tap only.
export function generateLevel(n) {
  const d = difficulty(n)
  let noise = d.noise
  for (let attempt = 0, fails = 0; ; attempt++) {
    const rng = mulberry32(n * 1000 + attempt)
    const placed = place(d, rng)
    if (!placed) continue
    const { buses, out } = placed
    const solution = removalOrder(out, rng)
    const palette = shuffle(rng, [...Array(MAX_COLORS).keys()]).slice(0, d.colors)
    shuffle(rng, buses.map((_, i) => palette[i % d.colors])).forEach((c, i) => (buses[i].color = c))
    const keyed = []
    for (const id of solution) for (let k = 0; k < buses[id].size; k++) keyed.push([keyed.length + rng() * noise, buses[id].color])
    const level = {
      level: n,
      lot: { w: d.w, h: d.h },
      buses,
      queue: keyed.sort((a, b) => a[0] - b[0]).map((e) => e[1]),
      loopCapacity: LOOP_CAPACITY,
      spots: [...SPOTS],
      solution,
    }
    if (wins(level)) return level
    if (++fails % 3 === 0) noise *= 0.7
  }
}

// Random non-overlapping buses with centres on a half-unit lattice, each rejected if it would close a cycle
// in the block graph. out[i] = the buses in bus i's way, which must leave before it can.
// A lot too full for the next bus is kept if it already has the band's minimum.
function place(d, rng) {
  const buses = [], out = []
  for (let i = 0, count = randInt(rng, ...d.buses); i < count; i++) {
    for (let t = 0; ; t++) {
      if (t === 200) return i >= d.buses[0] ? { buses, out } : null
      const size = pick(rng, d.sizes)
      const a = pick(rng, rng() < d.diag ? DIAG : AXIS)
      const bus = { id: i, color: 0, size, length: SIZE_LENGTH[size], x: randInt(rng, 1, 2 * d.w - 1) / 2, y: randInt(rng, 1, 2 * d.h - 1) / 2, a }
      if (!inside(bus, d.w, d.h) || buses.some((b) => overlaps(b, bus, GAP))) continue
      // Adding a bus never changes the lanes among the others, so only a path from its blockers back to it can loop.
      const ahead = buses.filter((b) => hitDistance(bus, b) < Infinity).map((b) => b.id)
      const behind = new Set(buses.filter((b) => hitDistance(b, bus) < Infinity).map((b) => b.id))
      if (reaches(out, ahead, behind)) continue
      buses.push(bus)
      out.push(ahead)
      for (const j of behind) out[j].push(i)
      break
    }
  }
  return { buses, out }
}

// True if any of `targets` can be reached from `from` along out edges.
function reaches(out, from, targets) {
  const seen = new Set(), stack = [...from]
  while (stack.length) {
    const j = stack.pop()
    if (targets.has(j)) return true
    if (seen.has(j)) continue
    seen.add(j)
    stack.push(...out[j])
  }
  return false
}

// A random order that only ever removes a bus whose way is clear (the graph is acyclic by construction).
function removalOrder(out, rng) {
  const left = new Set(out.keys()), order = []
  while (left.size) {
    const id = pick(rng, [...left].filter((i) => out[i].every((j) => !left.has(j))))
    order.push(id)
    left.delete(id)
  }
  return order
}

function wins(level) {
  const { game } = createGame(level)
  for (const id of level.solution) tap(game, id)
  return game.status === 'won'
}
