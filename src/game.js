// Level screen (PLAN.md §3-§5): layout, input/hit-test, VIP pick mode and animation.
// The sim settles instantly; play() schedules its events on a timeline and the visuals catch up to the sim state.
import { createGame, tap, useVip, vipAvailable, expire, DIRS } from './sim.js'
import { generateLevel } from './generator.js'
import { drawBackground, drawLot, drawLoop, loopPoint, drawSpot, drawBus, drawPeep, drawSparkle } from './art.js'

const $ = (id) => document.getElementById(id)
const cv = $('cv'), ctx = cv.getContext('2d'), overlay = $('overlay'), vipBtn = $('vip')

// Design space: 720 wide; height H >= 1280 follows the screen aspect and the extra goes to the lot.
const W = 720, ROAD = 40, LOT_TOP = 628, TRACK = 46, PEEP_R = 16
const LOOP = { x: 40, y: 124, w: 640, h: 240 }
const SPOT_Y = 424, SPOT_W = 76, SPOT_H = 112, SPOT_CY = SPOT_Y + SPOT_H / 2, LANE_Y = 402
const PARK_W = 36, PARK_LEN = { 2: 64, 3: 84, 4: 100 }
const ENTRY = [[-30, 112], [W + 30, 112]]
const ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }
const WALK = 0.7, HOP = 0.38, SPARK = 0.6, COUNTDOWN = 10
const spotX = (i) => 66 + 84 * i
const clamp01 = (u) => Math.min(1, Math.max(0, u))

const view = { s: 1, ox: 0, oy: 0, H: 1280, dpr: 1, w: 0, h: 0 }
// now = visual time (drives all animation), clock = play time (drives the stuck countdown), real = last frame's wall time.
let hooks, level = null, game = null, lot, cell, now = 0, clock = 0, real = 0, animEnd = 0
let vis, peeps, sparks, timers, slotFree, spotFree, side, picking, stuckAt, hint, gained

window.__bt = { get game() { return game }, get level() { return level } }

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
  slotFree = []
  spotFree = []
  side = 0
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

function layout() {
  const { cols, rows } = level.grid, top = LOT_TOP + ROAD, h = view.H - 16 - ROAD - top
  cell = Math.floor(Math.min((W - 20 - 2 * ROAD) / cols, h / rows, 120))
  lot = { x: Math.round((W - cols * cell) / 2), y: Math.round(top + (h - rows * cell) / 2), w: cols * cell, h: rows * cell }
}

function lotPose(b) {
  const [dx, dy] = DIRS[b.dir], k = (b.length - 1) / 2
  return { x: lot.x + (b.col + 0.5 - dx * k) * cell, y: lot.y + (b.row + 0.5 - dy * k) * cell, a: ANGLE[b.dir] }
}

// Straight out of the lot onto the road centreline, round the ring to the top road, then up into the spot.
function parkPath(b, spot) {
  const p = lotPose(b), L = lot.x - ROAD / 2, R = lot.x + lot.w + ROAD / 2, T = lot.y - ROAD / 2, B = lot.y + lot.h + ROAD / 2
  const sx = spotX(spot), pts = [[p.x, p.y]]
  if (b.dir === 'left') pts.push([L, p.y], [L, T])
  else if (b.dir === 'right') pts.push([R, p.y], [R, T])
  else if (b.dir === 'down') {
    const e = Math.abs(p.x - L) + Math.abs(sx - L) < Math.abs(p.x - R) + Math.abs(sx - R) ? L : R
    pts.push([p.x, B], [e, B], [e, T])
  } else pts.push([p.x, T])
  pts.push([sx, T], [sx, SPOT_CY])
  return pts
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

const slotPos = (s) => loopPoint(LOOP, s / game.loop.length + now * 0.006) // slow cosmetic circulation

// ---------- events -> timeline ----------

function play(events) {
  // Big chains get tighter staggers and faster walks/hops so they stay within a few seconds.
  const T = now, gap = Math.min(0.08, Math.max(0.015, 2 / events.length)), f = Math.min(1, Math.max(0.5, 60 / events.length))
  let enterAt = T, end = T
  for (const e of events) {
    const v = vis[e.bus], b = game.buses[e.bus]
    if (e.type === 'bounce') {
      v.bounce = { t: T, d: e.freeCells * cell + 12, dur: 0.09 + 0.05 * e.freeCells }
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
      const t = Math.max(enterAt, slotFree[e.slot] || 0)
      enterAt += gap
      peeps.set(e.passenger, { color: e.color, slot: e.slot, t, w: WALK * f, side: (side ^= 1) })
      end = Math.max(end, t + WALK * f)
    } else if (e.type === 'board') {
      const p = peeps.get(e.passenger), t = Math.max(v.ready, p.t + p.w, (v.lastBoard || 0) + Math.min(gap, 1.2 / b.size))
      p.hop = { t, d: HOP * f, spot: e.spot }
      v.lastBoard = slotFree[p.slot] = t
      v.landings.push(t + HOP * f)
      end = Math.max(end, t + HOP * f)
    } else if (e.type === 'depart') {
      const t = Math.max(...v.landings) + 0.15, path = departPath(e.spot)
      v.depart = { t, path, len: pathLen(path), dur: 0.8 }
      spotFree[e.spot] = t + 0.3
      end = Math.max(end, t + 0.8)
    } else timers.push({ at: end + 0.2, type: e.type }) // won | lost | stuck: once everything before it has landed
  }
  animEnd = Math.max(animEnd, end)
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
  } else events = tap(game, id)
  if (game.status === 'won' && gained === null) gained = hooks.win(level.level)
  play(events)
}

// Nearest lot bus whose cells are within a padding of the point; null if none or it is mid-bounce.
function hit(x, y) {
  let best = null, bd = cell * 0.3
  for (const b of game.buses) {
    if (b.state !== 'lot') continue
    const p = lotPose(b), [dx, dy] = DIRS[b.dir]
    const d = Math.hypot(Math.max(0, Math.abs(x - p.x) - ((dx ? b.length : 1) * cell) / 2), Math.max(0, Math.abs(y - p.y) - ((dy ? b.length : 1) * cell) / 2))
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
  // Visual time runs faster while more than 3 s of animation is queued, so fast tapping never leaves the board far behind.
  now += dt * (1 + Math.max(0, animEnd - now - 3))
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
  text($('banner'), stuckAt !== null ? `Out of space! Use a power-up: ${Math.max(0, Math.ceil(stuckAt - clock))}` : '')
  text($('hint'), picking ? 'Tap a bus to send it to VIP' : hint ? 'Tap a bus to drive it out!' : '')
}

// ---------- drawing ----------

function drawLevel() {
  ctx.beginPath()
  ctx.rect(0, 0, W, view.H)
  ctx.clip()
  drawLoop(ctx, LOOP, TRACK)
  drawPeeps(false)
  drawLot(ctx, lot, level.grid.cols, level.grid.rows, ROAD)
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
  const w = cell - 12, len = b.length * cell - 12, plen = PARK_LEN[b.length]
  const seats = () => `${v.landings.filter((t) => t <= now).length}/${b.size}`
  if (ph === 'parked') return drawBus(ctx, spotX(v.spot), SPOT_CY, PARK_W, plen, 0, b.color, seats())
  if (ph === 'leave') {
    const m = v.depart, u = clamp01((now - m.t) / m.dur), p = pose(m.path, m.len * u * u)
    return drawBus(ctx, p.x, p.y, PARK_W, plen, p.a, b.color, `${b.size}/${b.size}`)
  }
  if (ph === 'drive') {
    const m = v.move, el = now - m.t, tw = el < m.tHold ? el : Math.max(m.tHold, el - m.hold)
    const d = m.len * (1 - (1 - clamp01(tw / m.dur)) ** 2), p = pose(m.path, d)
    const k = 1 + (PARK_W / w - 1) * clamp01(d / m.first), fade = clamp01((d - m.len + m.last) / m.last)
    // shrink to parked width on the way out of the lot, cross-fade to the parked sprite on the way into the spot
    scaled(p.x, p.y, k, 1 - fade, () => drawBus(ctx, 0, 0, w, len, p.a, b.color, b.size))
    if (fade > 0) scaled(p.x, p.y, 1, fade, () => drawBus(ctx, 0, 0, PARK_W, plen, p.a, b.color, seats()))
    return
  }
  if (ph === 'vanish') return scaled(v.tp.x, v.tp.y, 1 - (now - v.tp.t) / 0.25, 1, () => drawBus(ctx, 0, 0, w, len, v.tp.a, b.color, b.size))
  if (ph === 'appear') {
    const u = clamp01((now - v.tp.appear) / 0.25) - 1 // ease-out-back pop
    return scaled(spotX(v.spot), SPOT_CY, 1 + 2.7 * u ** 3 + 1.7 * u ** 2, 1, () => drawBus(ctx, 0, 0, PARK_W, plen, 0, b.color, seats()))
  }
  const p = lotPose(b), [dx, dy] = DIRS[b.dir]
  let off = 0, a = p.a
  if (v.bounce) {
    const u = (now - v.bounce.t) / v.bounce.dur, r = u - 1
    off = v.bounce.d * (u < 1 ? u * u : u < 2 ? 1 - r * (2 - r) : 0)
  }
  const wt = now - (v.wobble ?? -9)
  if (wt >= 0 && wt < 0.45) a += 0.09 * Math.sin(wt * 40) * (1 - wt / 0.45)
  if (picking) {
    const hw = ((dx ? b.length : 1) * cell) / 2 - 8, hh = ((dy ? b.length : 1) * cell) / 2 - 8
    ctx.fillStyle = ctx.strokeStyle = `rgba(255,210,63,${0.6 + 0.3 * Math.sin(now * 7)})`
    ctx.lineWidth = 12
    ctx.lineJoin = 'round' // rounded halo without roundRect (iOS 15)
    ctx.strokeRect(p.x - hw, p.y - hh, 2 * hw, 2 * hh)
    ctx.fillRect(p.x - hw, p.y - hh, 2 * hw, 2 * hh)
  }
  drawBus(ctx, p.x + dx * off, p.y + dy * off, w, len, a, b.color, b.size)
}

// Loop and walking-in peeps (hopping=false) or peeps hopping into buses (hopping=true), lower ones on top.
function drawPeeps(hopping) {
  const list = []
  for (const [id, p] of peeps) {
    if (now < p.t) continue
    const h = p.hop && now >= p.hop.t ? (now - p.hop.t) / p.hop.d : -1
    if (h >= 1) peeps.delete(id)
    if (h >= 1 || h >= 0 !== hopping) continue
    if (hopping) {
      p.from ??= slotPos(p.slot)
      const tx = spotX(p.hop.spot)
      list.push([p.from.x + (tx - p.from.x) * h, p.from.y + (SPOT_CY - p.from.y) * h - Math.sin(h * Math.PI) * 90, 1 - 0.45 * h, p.color])
      continue
    }
    const s = slotPos(p.slot), u = (now - p.t) / p.w
    if (u >= 1) list.push([s.x, s.y, 1, p.color])
    else {
      const [ex, ey] = ENTRY[p.side], e = u * (2 - u)
      list.push([ex + (s.x - ex) * e, ey + (s.y - ey) * e - Math.abs(Math.sin(u * 12)) * 8, 1, p.color])
    }
  }
  list.sort((a, b) => a[1] - b[1])
  for (const [x, y, k, c] of list) k === 1 ? drawPeep(ctx, x, y, PEEP_R, c) : scaled(x, y, k, 1, () => drawPeep(ctx, 0, 0, PEEP_R, c))
}
