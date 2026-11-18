// Lot geometry in lot units (1 unit = one bus width; x right, y down). A bus is a rectangle centred on
// (x, y) facing heading `a` in degrees clockwise from up (0 up, 90 right, 45 up-right, ...).
import { BUS_W, BUS_PAD } from './config.js'

export const heading = (a) => [Math.sin((a * Math.PI) / 180), -Math.cos((a * Math.PI) / 180)]

// Body corners, as drawn: BUS_W wide, length - BUS_PAD long.
export function corners(b) {
  const [dx, dy] = heading(b.a), hl = (b.length - BUS_PAD) / 2, hw = BUS_W / 2
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) => [b.x + dx * u - dy * v, b.y + dy * u + dx * v])
}

const radius = (b) => Math.hypot(BUS_W, b.length - BUS_PAD) / 2

// Keep the part of a polygon (in a bus's frame: [ahead, across]) with s * across <= h.
function clip(poly, s, h) {
  const out = []
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], fp = s * p[1] - h, fq = s * q[1] - h
    if (fp <= 0) out.push(p)
    if (fp * fq < 0) out.push([p[0] + ((q[0] - p[0]) * fp) / (fp - fq), p[1] + ((q[1] - p[1]) * fp) / (fp - fq)])
  })
  return out
}

// How far bus b can drive straight ahead before its body touches o's: Infinity if o is not in its way.
// Bodies never overlap, so the part of o inside b's lane lies wholly ahead of b or wholly behind it.
export function hitDistance(b, o) {
  const [dx, dy] = heading(b.a), hw = BUS_W / 2 - 1e-6
  if (Math.abs((o.y - b.y) * dx - (o.x - b.x) * dy) > hw + radius(o)) return Infinity // quick miss: o's circle is off the lane
  let poly = corners(o).map(([x, y]) => [(x - b.x) * dx + (y - b.y) * dy, (y - b.y) * dx - (x - b.x) * dy])
  poly = clip(clip(poly, 1, hw), -1, hw)
  if (!poly.length) return Infinity
  const near = Math.min(...poly.map((p) => p[0]))
  return near < 0 ? Infinity : Math.max(0, near - (b.length - BUS_PAD) / 2)
}

// Separating-axis test with a clearance: true if the bodies come closer than `gap`.
export function overlaps(a, b, gap = 0) {
  if (Math.hypot(a.x - b.x, a.y - b.y) > radius(a) + radius(b) + gap) return false
  const ca = corners(a), cb = corners(b)
  for (const r of [a, b]) {
    const [dx, dy] = heading(r.a)
    for (const [ax, ay] of [[dx, dy], [-dy, dx]]) {
      const pa = ca.map(([x, y]) => x * ax + y * ay), pb = cb.map(([x, y]) => x * ax + y * ay)
      if (Math.max(...pa) + gap <= Math.min(...pb) || Math.max(...pb) + gap <= Math.min(...pa)) return false
    }
  }
  return true
}

export const inside = (b, w, h) => corners(b).every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h)
