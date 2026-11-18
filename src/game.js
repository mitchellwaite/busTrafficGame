// Level screen (PLAN.md §3-§5): layout, input/hit-test, VIP pick mode and animation.
// The sim settles instantly; play() schedules its events on a timeline and the visuals catch up to the sim state.
import { createGame, tap, useVip, vipAvailable, expire } from './sim.js'
import { heading } from './geometry.js'
import { BUS_W, BUS_PAD } from './config.js'
import { generateLevel } from './generator.js'
import { drawBackground, drawLot, drawLoop, loopPoint, drawSpot, drawBus, drawBadge, drawPeep, drawSparkle } from './art.js'

const $ = (id) => document.getElementById(id)
const cv = $('cv'), ctx = cv.getContext('2d'), overlay = $('overlay'), vipBtn = $('vip')

// Design space: 720 wide; height H >= 1280 follows the screen aspect and the extra goes to the lot.
// BAR = room kept under the lot for the power-up buttons (#powerups).
const W = 720, ROAD = 40, LOT_TOP = 536, BAR = 110, TRACK = 46, PEEP_R = 16
const LOOP = { x: 155, y: 136, w: 410, h: 200 } // centreline ~1048 px: 30 passengers sit ~35 px apart
const SPOT_Y = 412, SPOT_W = 76, SPOT_H = 112, SPOT_CY = SPOT_Y + SPOT_H / 2, LANE_Y = 392
const PARK_W = 48, PARK_LEN = { 1: 56, 2: 82, 3: 106 }, BADGE = 64 // parked bus size by length in lot units; its badge
// Boarding: OUT s to step down through the gate to EXIT_Y (clear of the wall), then a HOP s leap into the bus whose
// arc is low enough that it never rises back over the wall.
const OUT = 0.12, HOP = 0.38, SPARK = 0.6, COUNTDOWN = 10
const LAP = 5 // seconds per lap of the loop; passengers walk the feeders at the same pace
const GATE = 0.5, GATE_PT = loopPoint(LOOP, GATE), EXIT_Y = GATE_PT.y + 52 // loop param of the boarding gate (bottom centre)
const spotX = (i) => 66 + 84 * i
const clamp01 = (u) => Math.min(1, Math.max(0, u))
const frac = (u) => u - Math.floor(u)

const view = { s: 1, ox: 0, oy: 0, H: 1280, dpr: 1, w: 0, h: 0 }
// now = visual time (drives all animation), clock = play time (drives the stuck countdown), real = last frame's wall time.
let hooks, level = null, game = null, lot, cell, now = 0, clock = 0, real = 0, animEnd = 0
let vis, peeps, sparks, timers, free, joinAt, armStart, spotFree, picking, stuckAt, hint, gained

window.__bt = { get game() { return game }, get level() { return level }, get joinAt() { return joinAt }, get now() { return now } } // for testing

export function init(h) {
  hooks = h
  fit()
  addEventListener('resize', fit)
  addEventListener('orientationchange', fit)
  cv.addEventListener('pointerdown', onDown)
  $('homeBtn').onclick = () => hooks.home()
  $('restartBtn').onclick = () => start(level.level)
  $('ovB').onclick = () => hooks.home()
  vipBtn.onclick = () => (picking = !picking)
  now = clock = real = performance.now() / 1000
  requestAnimationFrame(frame)
}

export function start(n) {
  level = generateLevel(n)
  const r = createGame(level)
  game = r.game
  vis = game.buses.map(() => ({ landings: [] }))
  peeps = new Map()
  sparks = []
  timers = []
  free = game.loop.map(() => 0) // per place on the loop: when it is free to take, Infinity while taken
  joinAt = [] // per passenger: when it steps from its arm onto the loop
  armStart = [0, 0] // per arm: no passenger before this one is still drawn there
  spotFree = []
  picking = false
  stuckAt = null
  gained = null
  hint = n === 1
  animEnd = now
  $('levelLabel').textContent = 'Level ' + n
  overlay.hidden = true
  layout()
  play(r.events)
}

export function stop() {
  game = level = null
  overlay.hidden = true
}

// ---------- layout ----------

function fit() {
  const r = $('safe').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1)
  const H = Math.max(1280, Math.round((W * r.height) / r.width)), s = Math.min(r.width / W, r.height / H)
  const px = (v) => Math.round(v * dpr) / dpr
  Object.assign(view, { dpr, H, s, w: cv.clientWidth, h: cv.clientHeight, ox: px(r.left + (r.width - W * s) / 2), oy: px(r.top + (r.height - H * s) / 2) })
  cv.width = Math.round(view.w * dpr)
  cv.height = Math.round(view.h * dpr)
  $('stage').style.height = H + 'px'
  $('stage').style.transform = `translate(${view.ox}px,${view.oy}px) scale(${s})`
  if (level) layout()
}

// The lot zooms to fit its area: lots with more buses are more units across, so each unit gets fewer px.
function layout() {
  const { w, h } = level.lot, top = LOT_TOP + ROAD, room = view.H - BAR - ROAD - top
  cell = Math.floor(Math.min((W - 20 - 2 * ROAD) / w, room / h, 120))
  lot = { x: Math.round((W - w * cell) / 2), y: Math.round(top + (room - h * cell) / 2), w: w * cell, h: h * cell }
}

const lotPose = (b) => ({ x: lot.x + b.x * cell, y: lot.y + b.y * cell, a: (b.a * Math.PI) / 180 })

// Straight ahead out of the lot onto the road centreline, the short way round the ring to the top road, then up into the spot.
function parkPath(b, spot) {
  const p = lotPose(b), [dx, dy] = heading(b.a)
  const L = lot.x - ROAD / 2, R = lot.x + lot.w + ROAD / 2, T = lot.y - ROAD / 2, B = lot.y + lot.h + ROAD / 2
  const reach = (d, lo, hi, from) => (d > 1e-9 ? (hi - from) / d : d < -1e-9 ? (lo - from) / d : Infinity)
  const k = Math.min(reach(dx, L, R, p.x), reach(dy, T, B, p.y)), out = [p.x + dx * k, p.y + dy * k], to = [spotX(spot), T]
  // ring positions, measured clockwise from the top-left corner
  const Wr = R - L, Hr = B - T, P = 2 * (Wr + Hr), near = (u, v) => Math.abs(u - v) < 1e-6
  const pos = ([x, y]) => (near(y, T) ? x - L : near(x, R) ? Wr + y - T : near(y, B) ? Wr + Hr + R - x : 2 * Wr + Hr + B - y)
  const cw = frac((pos(to) - pos(out)) / P) * P, dir = cw <= P / 2 ? 1 : -1, len = dir > 0 ? cw : P - cw
  const turns = [[L, T, 0], [R, T, Wr], [R, B, Wr + Hr], [L, B, 2 * Wr + Hr]]
    .map(([x, y, at]) => [x, y, frac((dir * (at - pos(out))) / P) * P])
    .filter(([, , d]) => d > 1e-6 && d < len - 1e-6)
    .sort((m, n) => m[2] - n[2])
    .map(([x, y]) => [x, y])
  return [[p.x, p.y], out, ...turns, to, [to[0], SPOT_CY]]
}

// Pull forward (up) out of the spot into the lane above the spots, then off the nearest side.
const departPath = (spot) => [[spotX(spot), SPOT_CY], [spotX(spot), LANE_Y], [spotX(spot) < W / 2 ? -100 : W + 100, LANE_Y]]

const pathLen = (pts) => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0)

function along(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0)
    if (d <= l || i === pts.length - 1) {
      const u = l ? clamp01(d / l) : 1
      return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]
    }
    d -= l
  }
}

// Heading from points a little behind and ahead, so corners turn smoothly.
function pose(pts, d) {
  const [x, y] = along(pts, d), [x0, y0] = along(pts, d - 16), [x1, y1] = along(pts, d + 16)
  return { x, y, a: Math.atan2(x1 - x0, y0 - y1) }
}

// Arms: queue paths from off-screen top-left / top-right, down the sides and into the loop's left / right ends
// (loop params 0.75 / 0.25). Passengers wait on them GAP apart, the front one WAIT back from the loop's centreline
// (clear of the riders); moving up one place takes STEP and stepping onto the loop JOIN_T.
const bez = (a, c, b) => Array.from({ length: 13 }, (_, i) => [0, 1].map((k) => (1 - i / 12) ** 2 * a[k] + 2 * (i / 12) * (1 - i / 12) * c[k] + (i / 12) ** 2 * b[k]))
const toward = (b, a, r) => [0, 1].map((k) => b[k] + ((a[k] - b[k]) * r) / Math.hypot(a[0] - b[0], a[1] - b[1]))
// Polyline with each inner corner rounded off by a quadratic curve.
const rounded = (pts, r) => [pts[0], ...pts.slice(1, -1).flatMap((b, i) => bez(toward(b, pts[i], r), b, toward(b, pts[i + 2], r))), pts.at(-1)]
// STEP + JOIN_T stays under LAP / 30 (a place passes every ~0.17 s) so an arm can fill consecutive free places.
const MID = LOOP.y + LOOP.h / 2, GAP = 34, STEP = 0.1, JOIN_T = 0.06, WAIT = 36
const ARM = [[-60, 135], [52, 135], [52, MID], [LOOP.x, MID]]
const FEEDERS = [rounded(ARM, 40), rounded(ARM.map(([x, y]) => [W - x, y]), 40)]
const ARMS = FEEDERS.map((pts, i) => ({ pts, len: pathLen(pts), at: i ? 0.25 : 0.75 }))
// Which arm a passenger queues on (0 left, 1 right); each arm is one continuous line streaming in from off-screen.
// The first loopful alternates so the loop fills fast from both. After that the left arm holds the first half of the
// queue and the right arm the rest; passengers step on in queue order, so the left arm is empty before anyone on the
// right steps on.
const armOf = (id) => {
  const cap = game.loop.length
  return id < cap ? id % 2 : +(id >= cap + Math.ceil((game.passengers.length - cap) / 2))
}
const prevOnArm = (side, id) => {
  let j = id - 1
  while (j >= 0 && armOf(j) !== side) j--
  return j
}

const slotPos = (s) => loopPoint(LOOP, s / game.loop.length + now / LAP)
// Earliest time >= t0 at which slot s is at loop param `at`.
const nextAt = (s, at, t0) => t0 + frac(at - s / game.loop.length - t0 / LAP) * LAP

// ---------- events -> timeline ----------

function play(events) {
  const T = now
  let end = T, run = []
  for (const e of events) {
    if (e.type === 'board') {
      run.push(e)
      continue
    }
    if (run.length) [end, run] = [Math.max(end, board(run)), []]
    const v = vis[e.bus], b = game.buses[e.bus]
    if (e.type === 'bounce') {
      v.bounce = { t: T, d: e.free * cell + 2, dur: 0.09 + 0.05 * e.free }
      vis[e.blocker].wobble = T + v.bounce.dur
    } else if (e.type === 'park') {
      const path = parkPath(b, e.spot), len = pathLen(path), last = path.at(-2)[1] - SPOT_CY
      const dur = Math.min(1.3, Math.max(0.6, len / 1100)), hold = Math.max(0, (spotFree[e.spot] || 0) - T - dur)
      // ease-out drive; tHold = when it reaches the road under the spot, where it waits if the spot is still visually busy
      v.move = { t: T, path, len, dur, hold, last, first: pathLen(path.slice(0, 2)), tHold: dur * (1 - Math.sqrt(last / len)) }
      v.spot = e.spot
      end = Math.max(end, (v.ready = T + dur + hold))
    } else if (e.type === 'teleport') {
      const p = lotPose(b), appear = Math.max(T + 0.3, spotFree[e.spot] || 0)
      v.tp = { t: T, appear, ...p }
      v.spot = e.spot
      sparks.push({ x: p.x, y: p.y, t: T }, { x: spotX(e.spot), y: SPOT_CY, t: appear - 0.1 })
      end = Math.max(end, (v.ready = appear + 0.25))
    } else if (e.type === 'enter') {
      // In queue order, once at the front of its arm, a passenger steps onto the first free place on the loop that
      // passes the arm's end. Places on screen are not the rules' slots: only the count matters to the rules, and a
      // passenger needs a place only until it boards.
      const side = armOf(e.passenger), arm = ARMS[side]
      const ahead = joinAt[prevOnArm(side, e.passenger)] ?? -Infinity
      const ready = Math.max(T, joinAt[e.passenger - 1] ?? -Infinity, ahead + STEP + JOIN_T)
      let slot = -1, join = Infinity
      free.forEach((f, k) => {
        const t = f < Infinity ? nextAt(k, arm.at, Math.max(ready, f)) : Infinity
        if (t < join) [slot, join] = [k, t]
      })
      free[slot] = Infinity
      joinAt[e.passenger] = join
      peeps.set(e.passenger, { color: e.color, slot, join })
      end = Math.max(end, join)
    } else if (e.type === 'depart') {
      const t = Math.max(...v.landings) + 0.15, path = departPath(e.spot)
      v.depart = { t, path, len: pathLen(path), dur: 0.8 }
      spotFree[e.spot] = t + 0.3
      end = Math.max(end, t + 0.8)
    } else timers.push({ at: Math.max(end, animEnd) + 0.2, type: e.type }) // won | lost | stuck: once every bus, from this tap or earlier ones, has finished
  }
  if (run.length) end = Math.max(end, board(run))
  animEnd = Math.max(animEnd, end)
}

// A run of boardings. The rules board at once and fix how many seats each bus fills; on screen a passenger
// leaves only through the gate, and whoever reaches it first takes the leftmost bus of its colour that is in
// its spot with seats left in this run. Returns when the last one lands.
function board(run) {
  let end = 0
  const groups = new Map()
  for (const e of run) {
    const c = game.buses[e.bus].color
    if (!groups.has(c)) groups.set(c, { pax: [], seats: new Map() })
    const g = groups.get(c)
    g.pax.push(peeps.get(e.passenger))
    g.seats.set(e.bus, (g.seats.get(e.bus) || 0) + 1)
  }
  for (const { pax, seats } of groups.values()) {
    while (pax.length) {
      const open = [...seats.keys()].filter((id) => seats.get(id) > 0), ready = Math.min(...open.map((id) => vis[id].ready))
      let p = null, t = Infinity
      for (const q of pax) {
        const tq = nextAt(q.slot, GATE, Math.max(q.join, ready))
        if (tq < t) [p, t] = [q, tq]
      }
      const id = open.filter((i) => vis[i].ready <= t).sort((m, n) => vis[m].spot - vis[n].spot)[0]
      seats.set(id, seats.get(id) - 1)
      pax.splice(pax.indexOf(p), 1)
      p.hop = { t, spot: vis[id].spot }
      free[p.slot] = t
      vis[id].landings.push(t + OUT + HOP)
      end = Math.max(end, t + OUT + HOP)
    }
  }
  return end
}

// ---------- input ----------

function onDown(e) {
  e.preventDefault()
  if (!game || !overlay.hidden) return
  const id = hit((e.clientX - view.ox) / view.s, (e.clientY - view.oy) / view.s)
  if (id === null) return
  hint = false
  let events
  if (picking) {
    picking = false
    events = useVip(game, id)
    if (events.length) stuckAt = null // a re-emitted 'stuck' restarts the countdown when it plays
  } else if (!spotOpen()) {
    vis[id].wobble = now // every spot is taken on screen: the bus shakes instead of driving off
    return
  } else events = tap(game, id)
  if (game.status === 'won' && gained === null) gained = hooks.win(level.level)
  play(events)
}

// An open spot that is empty on screen too. The rules free a spot as soon as its bus fills, before it drives off.
const spotOpen = () => game.spots.some((s, i) => s.type === 'open' && s.bus === null && (spotFree[i] || 0) <= now)

// Nearest lot bus whose body is within a padding (at least 12 CSS px) of the point; null if none or it is mid-bounce.
function hit(x, y) {
  let best = null, bd = Math.max(cell * 0.3, 12 / view.s)
  for (const b of game.buses) {
    if (b.state !== 'lot') continue
    const p = lotPose(b), [dx, dy] = heading(b.a), u = (x - p.x) * dx + (y - p.y) * dy, v = (y - p.y) * dx - (x - p.x) * dy
    const d = Math.hypot(Math.max(0, Math.abs(u) - ((b.length - BUS_PAD) * cell) / 2), Math.max(0, Math.abs(v) - (BUS_W * cell) / 2))
    if (d < bd) [best, bd] = [b, d]
  }
  const bo = best && vis[best.id].bounce
  return !best || (bo && now < bo.t + 2 * bo.dur) ? null : best.id
}

// ---------- frame ----------

function frame() {
  requestAnimationFrame(frame)
  // dt is capped so a backgrounded tab (no frames) pauses animation and the countdown instead of expiring it.
  const t = performance.now() / 1000, dt = Math.min(0.1, t - real)
  real = t
  clock += dt
  // Visual time speeds up while more than 15 s of animation is queued, so fast tapping never leaves the board far behind.
  now += dt * (1 + Math.max(0, animEnd - now - 15) / 5)
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
  drawBackground(ctx, view.w, view.h)
  if (!game) return
  tick()
  ctx.save()
  ctx.translate(view.ox, view.oy)
  ctx.scale(view.s, view.s)
  drawLevel()
  ctx.restore()
  dom()
}

function tick() {
  for (const tm of timers) {
    if (tm.at > now) continue
    if (tm.type === 'stuck' && game.status === 'stuck') stuckAt = clock + COUNTDOWN
    if (tm.type === 'won' || tm.type === 'lost') showEnd(tm.type === 'won')
  }
  timers = timers.filter((tm) => tm.at > now)
  if (game.status !== 'stuck') stuckAt = null
  else if (stuckAt !== null && clock >= stuckAt) {
    expire(game)
    showEnd(false)
  }
}

function showEnd(win) {
  picking = false
  stuckAt = null
  $('ovTitle').textContent = win ? 'Level complete!' : 'Out of space!'
  $('ovCoins').hidden = !(win && gained)
  const a = $('ovA')
  a.textContent = win ? 'Next' : 'Restart'
  a.onclick = win ? () => hooks.next() : () => start(level.level)
  overlay.hidden = false
  hooks.coins()
}

const text = (el, t) => el.textContent !== t && (el.textContent = t)

function dom() {
  const ok = overlay.hidden && vipAvailable(game)
  if (!ok) picking = false
  vipBtn.disabled = !ok
  vipBtn.classList.toggle('pulse', stuckAt !== null)
  vipBtn.classList.toggle('on', picking)
  text($('banner'), stuckAt !== null ? `Out of space!\nUse a power-up: ${Math.max(0, Math.ceil(stuckAt - clock - 1e-6))}` : '')
  text($('hint'), picking ? 'Pick a bus for VIP' : hint ? 'Tap a bus to drive it out!' : '')
}

// ---------- drawing ----------

function drawLevel() {
  ctx.beginPath()
  ctx.rect(0, 0, W, view.H)
  ctx.clip()
  drawLoop(ctx, LOOP, TRACK, FEEDERS)
  drawPeeps(false)
  drawLot(ctx, lot, ROAD)
  game.spots.forEach((sp, i) => drawSpot(ctx, spotX(i) - SPOT_W / 2, SPOT_Y, SPOT_W, SPOT_H, sp.type))
  const phases = vis.map(phase), layerOf = (ph) => (ph === 'lot' ? 0 : ph === 'parked' ? 1 : 2)
  for (const layer of [0, 1, 2]) game.buses.forEach((b, i) => phases[i] && layerOf(phases[i]) === layer && drawOne(b, vis[i], phases[i]))
  drawPeeps(true)
  sparks = sparks.filter((sp) => now < sp.t + SPARK)
  for (const sp of sparks) if (now >= sp.t) drawSparkle(ctx, sp.x, sp.y, (now - sp.t) / SPARK)
}

function phase(v) {
  if (v.depart && now >= v.depart.t) return now < v.depart.t + v.depart.dur ? 'leave' : null
  if (v.move) return now < v.ready ? 'drive' : 'parked'
  if (v.tp) return now < v.tp.t + 0.25 ? 'vanish' : now < v.tp.appear ? null : now < v.ready ? 'appear' : 'parked'
  return 'lot'
}

function scaled(x, y, k, alpha, draw) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  ctx.globalAlpha = alpha
  draw()
  ctx.restore()
}

function drawOne(b, v, ph) {
  const w = BUS_W * cell, len = (b.length - BUS_PAD) * cell, plen = PARK_LEN[b.length]
  // seats still to fill before it leaves; blank once full
  const seats = () => b.size - v.landings.filter((t) => t <= now).length || ''
  // Parked-size buses carry a big badge (seats still to fill) so the count reads on a phone.
  const parked = (x, y, a, label) => {
    drawBus(ctx, x, y, PARK_W, plen, a, b.color, null)
    drawBadge(ctx, x, y, BADGE, b.color, label)
  }
  if (ph === 'parked') return parked(spotX(v.spot), SPOT_CY, 0, seats())
  if (ph === 'leave') {
    const m = v.depart, u = clamp01((now - m.t) / m.dur), p = pose(m.path, m.len * u * u)
    return parked(p.x, p.y, p.a, '')
  }
  if (ph === 'drive') {
    const m = v.move, el = now - m.t, tw = el < m.tHold ? el : Math.max(m.tHold, el - m.hold)
    const d = m.len * (1 - (1 - clamp01(tw / m.dur)) ** 2), p = pose(m.path, d)
    const k = 1 + (PARK_W / w - 1) * clamp01(d / m.first), fade = clamp01((d - m.len + m.last) / m.last)
    // shrink to parked width on the way out of the lot, cross-fade to the parked sprite on the way into the spot
    scaled(p.x, p.y, k, 1 - fade, () => drawBus(ctx, 0, 0, w, len, p.a, b.color, ''))
    if (fade > 0) scaled(p.x, p.y, 1, fade, () => parked(0, 0, p.a, seats()))
    return
  }
  if (ph === 'vanish') return scaled(v.tp.x, v.tp.y, 1 - (now - v.tp.t) / 0.25, 1, () => drawBus(ctx, 0, 0, w, len, v.tp.a, b.color, ''))
  if (ph === 'appear') {
    const u = clamp01((now - v.tp.appear) / 0.25) - 1 // ease-out-back pop
    return scaled(spotX(v.spot), SPOT_CY, 1 + 2.7 * u ** 3 + 1.7 * u ** 2, 1, () => parked(0, 0, 0, seats()))
  }
  const p = lotPose(b), [dx, dy] = heading(b.a)
  let off = 0, a = p.a
  if (v.bounce) {
    const u = (now - v.bounce.t) / v.bounce.dur, r = u - 1
    off = v.bounce.d * (u < 1 ? u * u : u < 2 ? 1 - r * (2 - r) : 0)
  }
  const wt = now - (v.wobble ?? -9)
  if (wt >= 0 && wt < 0.45) a += 0.09 * Math.sin(wt * 40) * (1 - wt / 0.45)
  if (picking) {
    const hw = w / 2 - 2, hl = len / 2 - 2
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.a)
    ctx.fillStyle = ctx.strokeStyle = `rgba(255,210,63,${0.6 + 0.3 * Math.sin(now * 7)})`
    ctx.lineWidth = 12
    ctx.lineJoin = 'round' // rounded halo without roundRect (iOS 15)
    ctx.strokeRect(-hw, -hl, 2 * hw, 2 * hl)
    ctx.fillRect(-hw, -hl, 2 * hw, 2 * hl)
    ctx.restore()
  }
  drawBus(ctx, p.x + dx * off, p.y + dy * off, w, len, a, b.color, '')
}

// The upcoming queue on each arm: everyone not yet on the loop, including passengers the rules have not let in yet,
// packed GAP apart back from the waiting spot. The front one steps from there onto its place over JOIN_T; then its
// gap closes over STEP and the line moves up.
function armPeeps() {
  const list = [], q = game.passengers
  ARMS.forEach((arm, side) => {
    for (let id = armStart[side], d = WAIT; id < q.length && d <= arm.len; id++) {
      const j = armOf(id) === side ? joinAt[id] ?? Infinity : -Infinity
      if (j + STEP <= now) {
        if (id === armStart[side]) armStart[side]++
        continue
      }
      if (now < j) {
        const [x, y] = along(arm.pts, arm.len - d), u = (now - j + JOIN_T) / JOIN_T
        if (u > 0) {
          const s = slotPos(peeps.get(id).slot)
          list.push([x + (s.x - x) * u, y + (s.y - y) * u, 1, q[id]])
        } else list.push([x, y - Math.abs(Math.sin(((d - WAIT) * Math.PI) / GAP)) * 4, 1, q[id]]) // a hop per place moved up
      }
      d += now < j ? GAP : GAP * (1 - (now - j) / STEP)
    }
  })
  return list
}

// Peeps on the arms and the loop (hopping=false) or hopping from the gate into buses (hopping=true), lower ones on top.
function drawPeeps(hopping) {
  const list = hopping ? [] : armPeeps()
  for (const [id, p] of peeps) {
    const h = p.hop && now >= p.hop.t ? (now - p.hop.t) / (OUT + HOP) : -1
    if (h >= 1) peeps.delete(id)
    if (h >= 1 || h >= 0 !== hopping) continue
    if (hopping) {
      const e = now - p.hop.t, u = clamp01((e - OUT) / HOP), tx = spotX(p.hop.spot)
      if (e < OUT) list.push([GATE_PT.x, GATE_PT.y + ((EXIT_Y - GATE_PT.y) * e) / OUT, 1, p.color])
      else list.push([GATE_PT.x + (tx - GATE_PT.x) * u, EXIT_Y + (SPOT_CY - EXIT_Y) * u - Math.sin(u * Math.PI) * 22, 1 - 0.45 * u, p.color])
      continue
    }
    if (now < p.join) continue // still on its arm
    const s = slotPos(p.slot)
    list.push([s.x, s.y, 1, p.color])
  }
  list.sort((a, b) => a[1] - b[1])
  for (const [x, y, k, c] of list) k === 1 ? drawPeep(ctx, x, y, PEEP_R, c) : scaled(x, y, k, 1, () => drawPeep(ctx, 0, 0, PEEP_R, c))
}
