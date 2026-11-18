import { mulberry32, randInt, pick, shuffle } from './rng.js'
import { SIZE_LENGTH, SPOTS, LOOP_CAPACITY, MAX_COLORS, difficulty } from './config.js'
import { createGame, tap, busCells, DIRS } from './sim.js'

const DIR_NAMES = Object.keys(DIRS)

// Deterministic: the same n always gives the same (deep-equal) level, verified winnable by tap only.
export function generateLevel(n) {
  const d = difficulty(n)
  let noise = d.noise
  for (let attempt = 0, fails = 0; ; attempt++) {
    const rng = mulberry32(n * 1000 + attempt)
    const buses = place(d, rng)
    if (!buses) continue
    const solution = removalOrder(buses, d.cols, d.rows, rng)
    const palette = shuffle(rng, [...Array(MAX_COLORS).keys()]).slice(0, d.colors)
    shuffle(rng, buses.map((_, i) => palette[i % d.colors])).forEach((c, i) => (buses[i].color = c))
    const keyed = []
    for (const id of solution) for (let k = 0; k < buses[id].size; k++) keyed.push([keyed.length + rng() * noise, buses[id].color])
    const level = {
      level: n,
      grid: { cols: d.cols, rows: d.rows },
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

// Random non-overlapping buses, each one rejected if it would close a cycle in the block graph.
function place(d, rng) {
  const buses = []
  const taken = new Set()
  for (let i = 0, count = randInt(rng, ...d.buses); i < count; i++) {
    for (let t = 0; ; t++) {
      if (t === 60) return null
      const size = pick(rng, d.sizes)
      const bus = { id: i, color: 0, size, length: SIZE_LENGTH[size], col: randInt(rng, 0, d.cols - 1), row: randInt(rng, 0, d.rows - 1), dir: pick(rng, DIR_NAMES) }
      const cells = busCells(bus).map(([c, r]) => (c < 0 || r < 0 || c >= d.cols || r >= d.rows ? -1 : r * d.cols + c))
      if (cells.some((k) => k < 0 || taken.has(k))) continue
      buses.push(bus)
      if (removalOrder(buses, d.cols, d.rows)) {
        cells.forEach((k) => taken.add(k))
        break
      }
      buses.pop()
    }
  }
  return buses
}

// A random order that only ever removes a bus whose lane is clear, or null if the block graph has a cycle.
function removalOrder(buses, cols, rows, rng = () => 0) {
  const at = new Map()
  for (const b of buses) for (const [c, r] of busCells(b)) at.set(r * cols + c, b.id)
  const blockers = buses.map((b) => {
    const s = []
    const [dx, dy] = DIRS[b.dir]
    for (let c = b.col + dx, r = b.row + dy; c >= 0 && c < cols && r >= 0 && r < rows; c += dx, r += dy)
      if (at.has(r * cols + c)) s.push(at.get(r * cols + c))
    return s
  })
  const left = new Set(buses.map((b) => b.id))
  const order = []
  while (left.size) {
    const ready = [...left].filter((i) => blockers[i].every((j) => !left.has(j)))
    if (!ready.length) return null
    const id = pick(rng, ready)
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
