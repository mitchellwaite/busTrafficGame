// Candy-style procedural art (PLAN.md §8). Pure Canvas 2D, no game state.
// Touches `document` only inside draw calls, never at import time.

export const PALETTE = [
  { name: 'cherry', hex: '#FF4D6D', symbol: 'heart' },
  { name: 'tangerine', hex: '#FF9F1C', symbol: 'circle' },
  { name: 'lemon', hex: '#FFD23F', symbol: 'star' },
  { name: 'lime', hex: '#7BD389', symbol: 'triangle' },
  { name: 'sky', hex: '#4CC9F0', symbol: 'square' },
  { name: 'grape', hex: '#9B5DE5', symbol: 'diamond' },
  { name: 'bubblegum', hex: '#F15BB5', symbol: 'flower' },
  { name: 'teal', hex: '#00BBA7', symbol: 'cross' },
];

const TAU = Math.PI * 2;
const FONT = "ui-rounded, 'Arial Rounded MT Bold', Nunito, system-ui, sans-serif";
const INK = '#3B2B5B';
const SHADOW = 'rgba(60,30,100,';

// t > 0 mixes toward white, t < 0 toward black.
function mix(hex, t) {
  const n = parseInt(hex.slice(1), 16), m = t > 0 ? 255 : 0, a = Math.abs(t);
  const c = (v) => Math.round(v + (m - v) * a);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
const TONES = PALETTE.map(({ hex }) => ({
  hi: mix(hex, 0.7), light: mix(hex, 0.4), base: hex, dark: mix(hex, -0.18), line: mix(hex, -0.45),
}));

// Rounded-rect subpath (no beginPath, so several can share one fill).
function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function vgrad(g, y0, y1, ...cols) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), c));
  return gr;
}

// Device px per user unit, in quarter steps so a fixed DPR/fit-scale gives stable cache keys.
function scaleOf(ctx) {
  const m = ctx.getTransform();
  return Math.ceil(Math.hypot(m.a, m.b) * 4) / 4 || 1;
}

// Everything costly is pre-rendered once and then blitted. make() → [bx, by, bw, bh, draw(g, s)]:
// a box in the caller's user units and a function drawing into it.
function render(s, make) {
  const [bx, by, bw, bh, draw] = make();
  const c = document.createElement('canvas');
  c.width = Math.ceil(bw * s);
  c.height = Math.ceil(bh * s);
  const g = c.getContext('2d');
  g.scale(s, s);
  g.translate(-bx, -by);
  draw(g, s);
  return { c, bx, by, bw: c.width / s, bh: c.height / s };
}
const blit = (ctx, sp) => ctx.drawImage(sp.c, sp.bx, sp.by, sp.bw, sp.bh);
const free = (sp) => { sp.c.width = 0; }; // iOS Safari frees canvas memory late unless the backing store is shrunk

// Small sprites (buses, badges, peeps, spots): LRU keyed by look + size + scale.
const cache = new Map();
function sprite(ctx, key, make) {
  const s = scaleOf(ctx), k = key + '@' + s;
  let sp = cache.get(k);
  if (sp) cache.delete(k);
  else sp = render(s, make);
  cache.set(k, sp);
  if (cache.size > 400) {
    const [k0, old] = cache.entries().next().value;
    cache.delete(k0);
    free(old);
  }
  blit(ctx, sp);
}

// Big static surfaces (background, lot, loop): one live canvas per slot, as the game draws one of each.
const layers = {};
function layer(ctx, slot, key, make) {
  const s = scaleOf(ctx), k = key + '@' + s;
  let sp = layers[slot];
  if (sp?.k !== k) {
    if (sp) free(sp);
    sp = layers[slot] = { ...render(s, make), k };
  }
  blit(ctx, sp);
}

// ---------- symbols ----------

function symbolPath(g, kind, r) {
  g.beginPath();
  if (kind === 'heart') {
    g.moveTo(0, r * 0.82);
    g.bezierCurveTo(-r * 1.35, -r * 0.15, -r * 0.75, -r * 1.3, 0, -r * 0.58);
    g.bezierCurveTo(r * 0.75, -r * 1.3, r * 1.35, -r * 0.15, 0, r * 0.82);
  } else if (kind === 'circle') g.arc(0, 0, r * 0.85, 0, TAU);
  else if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2, d = i % 2 ? r * 0.46 : r * 1.05;
      g.lineTo(Math.cos(a) * d, Math.sin(a) * d + r * 0.08);
    }
  } else if (kind === 'triangle') {
    g.moveTo(0, -r * 0.9);
    g.lineTo(r * 0.95, r * 0.75);
    g.lineTo(-r * 0.95, r * 0.75);
  } else if (kind === 'square') rr(g, -r * 0.74, -r * 0.74, r * 1.48, r * 1.48, r * 0.2);
  else if (kind === 'diamond') {
    g.moveTo(0, -r);
    g.lineTo(r * 0.78, 0);
    g.lineTo(0, r);
    g.lineTo(-r * 0.78, 0);
  } else if (kind === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5 - Math.PI / 2, px = Math.cos(a) * r * 0.5, py = Math.sin(a) * r * 0.5;
      g.moveTo(px + r * 0.44, py);
      g.arc(px, py, r * 0.44, 0, TAU);
    }
  } else if (kind === 'cross') {
    const a = r * 0.32, b = r * 0.9;
    [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]]
      .forEach(([px, py]) => g.lineTo(px, py));
  }
  g.closePath();
}

// Outline is stroked first at double width so the fill hides its inner half (clean union for the flower).
export function drawSymbol(ctx, x, y, r, color) {
  const T = TONES[color], kind = PALETTE[color].symbol;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  symbolPath(ctx, kind, r);
  ctx.lineWidth = r * 0.3;
  ctx.strokeStyle = T.line;
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, -r, r, T.light, T.base, T.dark);
  ctx.fill();
  ctx.clip();
  if (kind === 'flower') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, TAU);
    ctx.fillStyle = '#FFF1A6';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.5, r * 0.5, r * 0.26, -0.5, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  ctx.restore();
}

// ---------- buses ----------

function busShadow(W, L) {
  const b = W * 0.14, p = Math.ceil(b * 2.5);
  return [-W / 2 - p, -L / 2 - p, W + 2 * p, L + 2 * p, (g, s) => {
    g.shadowColor = SHADOW + '0.4)';
    g.shadowBlur = b * s; // shadowBlur ignores the transform
    g.fillStyle = SHADOW + '0.3)';
    g.beginPath();
    rr(g, -W / 2 + 1, -L / 2 + 1, W - 2, L - 2, W * 0.3);
    g.fill();
  }];
}

function busBody(W, L, T) {
  return [-W / 2 - 1, -L / 2 - 1, W + 2, L + 2, (g) => {
    const u = W, t = -L / 2, b = L / 2, lw = Math.min(3, Math.max(1.5, W / 16));
    g.lineJoin = 'round';
    // body: vertical candy gradient + side shading for a rounded roof edge
    g.beginPath();
    rr(g, -W / 2 + lw / 2, t + lw / 2, W - lw, L - lw, u * 0.3);
    g.fillStyle = vgrad(g, t, b, T.light, T.base, T.dark);
    g.fill();
    const side = g.createLinearGradient(-W / 2, 0, W / 2, 0);
    side.addColorStop(0, 'rgba(255,255,255,0.3)');
    side.addColorStop(0.22, 'rgba(255,255,255,0)');
    side.addColorStop(0.78, 'rgba(40,0,60,0)');
    side.addColorStop(1, 'rgba(40,0,60,0.2)');
    g.fillStyle = side;
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = T.line;
    g.stroke();
    // glass: windscreen at the nose, side windows, rear window
    const ws = [-u * 0.35, t + u * 0.12, u * 0.7, u * 0.28, u * 0.13];
    const y0 = t + u * 0.5, y1 = b - u * 0.22;
    const n = Math.max(1, Math.round((y1 - y0) / (u * 0.46))), step = (y1 - y0) / n;
    g.beginPath();
    rr(g, ...ws);
    rr(g, -u * 0.24, b - u * 0.13, u * 0.48, u * 0.06, u * 0.03);
    for (let i = 0; i < n; i++) {
      rr(g, -u * 0.425, y0 + i * step, u * 0.125, step - u * 0.07, u * 0.05);
      rr(g, u * 0.3, y0 + i * step, u * 0.125, step - u * 0.07, u * 0.05);
    }
    g.fillStyle = vgrad(g, ws[1], ws[1] + ws[3], '#8FB0F5', '#4558A8', '#34418A');
    g.fill();
    g.lineWidth = lw * 0.4;
    g.stroke();
    g.save();
    g.beginPath();
    rr(g, ...ws);
    g.clip();
    g.beginPath();
    g.moveTo(-u * 0.12, t);
    g.lineTo(u * 0.04, t);
    g.lineTo(-u * 0.2, t + u * 0.5);
    g.lineTo(-u * 0.36, t + u * 0.5);
    g.moveTo(u * 0.1, t);
    g.lineTo(u * 0.15, t);
    g.lineTo(-u * 0.09, t + u * 0.5);
    g.lineTo(-u * 0.14, t + u * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fill();
    g.restore();
    // roof panel + lengthwise gloss strip
    g.beginPath();
    rr(g, -u * 0.25, t + u * 0.5, u * 0.5, L - u * 0.72, u * 0.16);
    g.fillStyle = vgrad(g, t, b, T.hi, T.light, T.base);
    g.fill();
    g.lineWidth = lw * 0.5;
    g.strokeStyle = T.dark;
    g.stroke();
    g.beginPath();
    rr(g, -u * 0.19, t + u * 0.58, u * 0.07, L - u * 0.9, u * 0.035);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.fill();
    // nose gloss
    g.beginPath();
    g.ellipse(-u * 0.22, t + u * 0.06, u * 0.12, u * 0.03, -0.2, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fill();
  }];
}

// Upright badge sized to fit a ~W×W square, so it stays inside the bus at any angle.
function badge(mctx, W, color, label) {
  mctx.font = `800 100px ${FONT}`;
  const k = label ? mctx.measureText(label).width / 100 : 0, max = W * 0.88;
  let h = W * 0.42, f = h * 0.66, sr = h * 0.3, pad = h * 0.2, gap = h * 0.14;
  let bw = label ? 2 * pad + 2 * sr + gap + k * f : h, bh = h, stacked = false;
  if (bw > max) { // long labels like "12/20": symbol above text
    stacked = true;
    f = Math.min(W * 0.3, (max - W * 0.12) / k);
    sr = W * 0.13;
    bw = Math.max(2 * sr, k * f) + W * 0.12;
    bh = W * 0.1 + 2 * sr + f * 0.95;
  }
  const m = 3;
  return [-bw / 2 - m, -bh / 2 - m, bw + 2 * m, bh + 2 * m, (g, s) => {
    g.beginPath();
    rr(g, -bw / 2, -bh / 2, bw, bh, stacked ? W * 0.14 : bh / 2);
    g.shadowColor = 'rgba(40,20,70,0.35)';
    g.shadowBlur = 2 * s;
    g.shadowOffsetY = s;
    g.fillStyle = vgrad(g, -bh / 2, bh / 2, '#FFFFFF', '#EEE8F7');
    g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = Math.max(1, W * 0.03);
    g.strokeStyle = TONES[color].line;
    g.stroke();
    g.font = `800 ${f}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = INK;
    if (stacked) {
      drawSymbol(g, 0, -bh / 2 + W * 0.05 + sr, sr, color);
      g.fillText(label, 0, bh / 2 - W * 0.05 - f * 0.42);
    } else if (!label) drawSymbol(g, 0, 0, sr * 1.2, color);
    else {
      const x0 = -bw / 2 + pad + sr;
      drawSymbol(g, x0, 0, sr, color);
      g.fillText(label, x0 + sr + gap + (k * f) / 2, f * 0.05);
    }
  }];
}

const LIFT = 0.1; // bus shadow drop, × width; always straight down on screen, whatever the heading

// Shadow + body pre-turned by q quarter turns, so cardinal buses blit without rotation.
function busTurned(W, L, T, q) {
  const sh = busShadow(W, L), body = busBody(W, L, T), p = -sh[0] - W / 2;
  const hx = (q % 2 ? L : W) / 2 + p, hy = (q % 2 ? W : L) / 2 + p;
  return [-hx, -hy, 2 * hx, 2 * hy + W * LIFT, (g, s) => {
    g.save();
    g.translate(0, W * LIFT);
    g.rotate((q * Math.PI) / 2);
    sh[4](g, s);
    g.restore();
    g.rotate((q * Math.PI) / 2);
    body[4](g, s);
  }];
}

export function drawBus(ctx, x, y, w, len, angle, color, label) {
  const W = Math.max(4, Math.round(w)), L = Math.max(4, Math.round(len)), T = TONES[color];
  const text = label == null ? '' : String(label), q = Math.round(angle / (Math.PI / 2));
  ctx.save();
  ctx.translate(x, y);
  // Rotated drawImage is ~15× slower than an axis-aligned one (measured), and most buses sit at 0/90/180/270.
  if (Math.abs(angle - (q * Math.PI) / 2) < 1e-4) sprite(ctx, `bq${color},${W},${L},${q & 3}`, () => busTurned(W, L, T, q & 3));
  else {
    ctx.save();
    ctx.translate(0, W * LIFT);
    ctx.rotate(angle);
    sprite(ctx, `bs${W},${L}`, () => busShadow(W, L));
    ctx.restore();
    ctx.save();
    ctx.rotate(angle);
    sprite(ctx, `bb${color},${W},${L}`, () => busBody(W, L, T));
    ctx.restore();
  }
  // label null: no badge. On short buses, nudge the badge toward the rear so the windscreen (the facing) stays clear.
  const back = L < 1.5 * W ? W * 0.12 : 0;
  ctx.translate(-Math.sin(angle) * back, Math.cos(angle) * back);
  if (label !== null) sprite(ctx, `bg${color},${W},${text}`, () => badge(ctx, W, color, text));
  ctx.restore();
}

// A bus badge on its own, sized for a size × size square: symbol plus label, or the symbol alone.
export function drawBadge(ctx, x, y, size, color, label) {
  const W = Math.max(4, Math.round(size)), text = String(label);
  ctx.save();
  ctx.translate(x, y);
  sprite(ctx, `bg${color},${W},${text}`, () => badge(ctx, W, color, text));
  ctx.restore();
}

// ---------- passengers ----------

function peep(r, color) {
  const T = TONES[color], p = r * 1.2;
  return [-p, -p, 2 * p, 2 * p, (g) => {
    const lw = Math.max(1, r * 0.09);
    g.lineJoin = 'round';
    g.beginPath();
    g.ellipse(0, r * 0.95, r * 0.7, r * 0.2, 0, 0, TAU);
    g.fillStyle = SHADOW + '0.22)';
    g.fill();
    // gumdrop body
    g.beginPath();
    g.moveTo(-r * 0.66, r * 0.72);
    g.bezierCurveTo(-r * 0.72, r * 0.02, -r * 0.42, -r * 0.32, 0, -r * 0.32);
    g.bezierCurveTo(r * 0.42, -r * 0.32, r * 0.72, r * 0.02, r * 0.66, r * 0.72);
    g.quadraticCurveTo(r * 0.64, r * 0.94, r * 0.4, r * 0.94);
    g.lineTo(-r * 0.4, r * 0.94);
    g.quadraticCurveTo(-r * 0.64, r * 0.94, -r * 0.66, r * 0.72);
    g.fillStyle = vgrad(g, -r * 0.32, r * 0.94, T.light, T.base, T.dark);
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = T.line;
    g.stroke();
    g.beginPath();
    g.ellipse(-r * 0.4, r * 0.18, r * 0.08, r * 0.24, 0.2, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fill();
    // belly symbol: white with the colour's outline, readable on every colour
    g.save();
    g.translate(0, r * 0.42);
    symbolPath(g, PALETTE[color].symbol, r * 0.3);
    g.lineWidth = r * 0.12;
    g.stroke();
    g.fillStyle = '#fff';
    g.fill();
    g.restore();
    // head
    g.beginPath();
    g.arc(0, -r * 0.54, r * 0.42, 0, TAU);
    g.fillStyle = vgrad(g, -r * 0.96, -r * 0.12, T.hi, T.light, T.base);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(-r * 0.15, -r * 0.5, r * 0.065, 0, TAU);
    g.moveTo(r * 0.15 + r * 0.065, -r * 0.5);
    g.arc(r * 0.15, -r * 0.5, r * 0.065, 0, TAU);
    g.fillStyle = INK;
    g.fill();
    g.beginPath();
    g.ellipse(-r * 0.16, -r * 0.74, r * 0.13, r * 0.075, -0.5, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fill();
  }];
}

export function drawPeep(ctx, x, y, r, color) {
  const R = Math.max(2, Math.round(r * 2) / 2);
  ctx.save();
  ctx.translate(x, y);
  sprite(ctx, `pp${color},${R}`, () => peep(R, color));
  ctx.restore();
}

// ---------- board: background, lot, loop, spots ----------

export function drawBackground(ctx, w, h) {
  layer(ctx, 'bg', w + ',' + h, () => [0, 0, w, h, (g) => {
    g.fillStyle = vgrad(g, 0, h, '#FFE3F0', '#F1E6FF', '#DCF1FF');
    g.fillRect(0, 0, w, h);
    g.beginPath();
    for (let y = 14, row = 0; y < h + 28; y += 28, row++) {
      for (let x = row % 2 ? 42 : 14; x < w + 28; x += 56) {
        g.moveTo(x + 5.5, y);
        g.arc(x, y, 5.5, 0, TAU);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fill();
  }]);
}

export function drawLot(ctx, rect, road) {
  const { x, y, w, h } = rect, p = road + 4;
  layer(ctx, 'lot', [x, y, w, h, road].join(), () => [x - p, y - p, w + 2 * p, h + 2 * p + 8, (g) => lotArt(g, rect, road)]);
}

function lotArt(ctx, rect, road) {
  const { x, y, w, h } = rect, R = road, ro = R + 14;
  ctx.save();
  ctx.beginPath();
  rr(ctx, x - R, y - R + 8, w + 2 * R, h + 2 * R, ro);
  ctx.fillStyle = SHADOW + '0.16)';
  ctx.fill();
  // road
  ctx.beginPath();
  rr(ctx, x - R, y - R, w + 2 * R, h + 2 * R, ro);
  ctx.fillStyle = vgrad(ctx, y - R, y + h + R, '#C6C0DD', '#ACA5C9');
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#9890BB';
  ctx.stroke();
  ctx.beginPath();
  rr(ctx, x - R + 3, y - R + 3, w + 2 * R - 6, h + 2 * R - 6, ro - 3);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.stroke();
  ctx.beginPath();
  rr(ctx, x - R / 2, y - R / 2, w + R, h + R, ro - R / 2);
  ctx.setLineDash([R * 0.4, R * 0.35]);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, R * 0.08);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  ctx.setLineDash([]);
  // lot surface with a white curb
  ctx.beginPath();
  rr(ctx, x, y, w, h, 14);
  ctx.fillStyle = vgrad(ctx, y, y + h, '#F5F1FC', '#E3DBF3');
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.restore();
}

// Stadium subpath, starting at the left end of the top straight.
function stadium(g, x, y, w, h) {
  const r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x + r, y + h);
  g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  g.closePath();
}

const WALL = ['#6A3DB0', '#8E5BD8', '#BE9BF7']; // outline, base, light stripe

// The loop: a jelly track walled on both edges, a gold-posted gate in the outer wall at bottom centre
// (where passengers leave to board), and a walled feeder path per entry in `feeders`
// (polylines from off-screen that end on the track centreline).
export function drawLoop(ctx, rect, track, feeders = []) {
  const { x, y, w, h } = rect, p = track / 2 + track * 0.26 + 8;
  let x0 = x - p, y0 = y - p, x1 = x + w + p, y1 = y + h + p + 8;
  for (const [fx, fy] of feeders.flat()) {
    x0 = Math.min(x0, fx - p); y0 = Math.min(y0, fy - p); x1 = Math.max(x1, fx + p); y1 = Math.max(y1, fy + p + 8);
  }
  layer(ctx, 'loop', [x, y, w, h, track, feeders.flat(2)].join(), () => [x0, y0, x1 - x0, y1 - y0, (g) => loopArt(g, rect, track, feeders)]);
}

function loopArt(ctx, rect, track, feeders) {
  const { x, y, w, h } = rect, e = Math.max(3, track * 0.15), jelly = track - 2 * e, wall = track * 0.26;
  const ring = (d) => stadium(ctx, x - d, y - d, w + 2 * d, h + 2 * d);
  ctx.save();
  for (const f of feeders) feederArt(ctx, f, track, e, wall);
  // soft shadow: two wide translucent strokes, shifted down
  ring(0);
  ctx.translate(0, 6);
  ctx.strokeStyle = SHADOW + '0.08)';
  ctx.lineWidth = track + 2 * wall + 8;
  ctx.stroke();
  ctx.lineWidth = track + 2 * wall;
  ctx.stroke();
  ctx.translate(0, -6);
  ring(-track / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();
  // candy walls: outline, base, light centre stripe
  for (const d of [track / 2 + wall / 2, -track / 2 - wall / 2]) {
    ring(d);
    [[wall + 3, WALL[0]], [wall, WALL[1]], [wall * 0.4, WALL[2]]].forEach(([lw, c]) => {
      ctx.lineWidth = lw;
      ctx.strokeStyle = c;
      ctx.stroke();
    });
  }
  // candy-stripe rims: white, then pink dashes sized to tile the ring with no seam
  for (const d of [track / 2 - e / 2, e / 2 - track / 2]) {
    ring(d);
    ctx.lineWidth = e;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    const P = 2 * (w - h) + Math.PI * (h + 2 * d), n = Math.max(1, Math.round(P / (e * 2.6)));
    ctx.setLineDash([P / n / 2, P / n / 2]);
    ctx.strokeStyle = '#FF7AAE';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // jelly band: base, soft core, gloss line toward the outer edge
  ring(0);
  ctx.lineWidth = jelly;
  ctx.strokeStyle = '#A9EBDD';
  ctx.stroke();
  ctx.lineWidth = jelly * 0.55;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ring(jelly * 0.3);
  ctx.lineWidth = Math.max(1.5, track * 0.06);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E0558E';
  for (const d of [track / 2, -track / 2, jelly / 2, -jelly / 2]) {
    ring(d);
    ctx.stroke();
  }
  // Openings in the outer rim and wall. Local frame: +x points out of the loop, the rect spans rim to wall.
  const open = (px, py, out, hw, fill) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(out);
    ctx.beginPath();
    ctx.rect(track / 2 - e - 4, -hw, e + wall + 9, 2 * hw);
    fill();
    ctx.restore();
  };
  // feeder mouths: repaint the feeder over the loop's rim and wall
  for (const f of feeders) {
    const [ax, ay] = f.at(-2), [bx, by] = f.at(-1);
    open(bx, by, Math.atan2(ay - by, ax - bx), track / 2, () => {
      ctx.clip();
      ctx.rotate(-Math.atan2(ay - by, ax - bx));
      ctx.translate(-bx, -by);
      feederArt(ctx, f, track, e, wall);
    });
  }
  // the gate at bottom centre, with gold posts
  const gx = x + w / 2, gy = y + h, hw = track * 0.45, wy = gy + track / 2 + wall / 2;
  ctx.globalCompositeOperation = 'destination-out';
  open(gx, gy, Math.PI / 2, hw, () => ctx.fill());
  ctx.globalCompositeOperation = 'source-over';
  for (const px of [gx - hw, gx + hw]) {
    ctx.beginPath();
    ctx.arc(px, wy, wall * 0.8, 0, TAU);
    ctx.fillStyle = '#FFC233';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#C17C00';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px - wall * 0.25, wy - wall * 0.25, wall * 0.3, 0, TAU);
    ctx.fillStyle = '#FFF3A6';
    ctx.fill();
  }
  ctx.restore();
}

// A walled feeder path along a polyline, drawn as stacked strokes so it matches the loop's layers.
function feederArt(ctx, pts, track, e, wall) {
  const jelly = track - 2 * e;
  ctx.save();
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.lineJoin = 'round';
  ctx.translate(0, 6);
  ctx.lineWidth = track + 2 * wall;
  ctx.strokeStyle = SHADOW + '0.08)';
  ctx.stroke();
  ctx.translate(0, -6);
  // wall (light stripe = base, light, base bands), outlined rims, jelly
  const layers = [
    [track + 2 * wall + 3, WALL[0]], [track + 2 * wall, WALL[1]], [track + wall * 1.4, WALL[2]], [track + wall * 0.6, WALL[1]],
    [track + 3, '#E0558E'], [track, '#FFFFFF'], [track, '#FF7AAE', [e * 1.3, e * 1.3]],
    [jelly + 3, '#E0558E'], [jelly, '#A9EBDD'], [jelly * 0.55, 'rgba(255,255,255,0.35)'],
  ];
  for (const [lw, c, dash] of layers) {
    ctx.setLineDash(dash || []);
    ctx.lineWidth = lw;
    ctx.strokeStyle = c;
    ctx.stroke();
  }
  ctx.restore();
}

// Point on the stadium centreline; t=0 top-centre, clockwise, uniform in arc length.
export function loopPoint(rect, t) {
  const R = rect.h / 2, S = Math.max(0, rect.w - rect.h), A = Math.PI * R;
  const xl = rect.x + R, xr = xl + S, cy = rect.y + R;
  let d = (((t % 1) + 1) % 1) * (2 * S + 2 * A);
  if (d < S / 2) return { x: xl + S / 2 + d, y: rect.y };
  d -= S / 2;
  if (d < A) return { x: xr + R * Math.sin(d / R), y: cy - R * Math.cos(d / R) };
  d -= A;
  if (d < S) return { x: xr - d, y: rect.y + rect.h };
  d -= S;
  if (d < A) return { x: xl - R * Math.sin(d / R), y: cy + R * Math.cos(d / R) };
  return { x: xl + d - A, y: rect.y };
}

const SPOT = {
  open: ['#F1ECFA', '#D7CEEC', '#ACA0CF'],
  vip: ['#FFF3A6', '#FFC233', '#C98400'],
  locked: ['#E2E2E9', '#B7B7C5', '#8C8CA0'],
};

export function drawSpot(ctx, x, y, w, h, type) {
  ctx.save();
  ctx.translate(x, y);
  sprite(ctx, `sp${type},${w},${h}`, () => [-2, -2, w + 4, h + 4 + Math.min(w, h) * 0.06, (g) => spotArt(g, 0, 0, w, h, type)]);
  ctx.restore();
}

function spotArt(ctx, x, y, w, h, type) {
  const [c0, c1, line] = SPOT[type] || SPOT.open, m = Math.min(w, h), r = m * 0.2, cx = w / 2, cy = h / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  rr(ctx, 0, m * 0.06, w, h, r);
  ctx.fillStyle = SHADOW + '0.18)';
  ctx.fill();
  ctx.beginPath();
  rr(ctx, 0, 0, w, h, r);
  ctx.fillStyle = vgrad(ctx, 0, h, c0, c1);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, m * 0.035);
  ctx.strokeStyle = line;
  ctx.stroke();
  ctx.beginPath();
  rr(ctx, m * 0.1, m * 0.05, w - m * 0.2, m * 0.12, m * 0.06);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  if (type !== 'locked') {
    ctx.beginPath();
    rr(ctx, m * 0.12, m * 0.12, w - m * 0.24, h - m * 0.24, r * 0.6);
    ctx.setLineDash([m * 0.09, m * 0.08]);
    ctx.lineWidth = Math.max(1.5, m * 0.045);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (type === 'vip') {
    ctx.save();
    ctx.translate(cx, cy - m * 0.14);
    symbolPath(ctx, 'star', m * 0.24);
    ctx.lineWidth = m * 0.07;
    ctx.strokeStyle = line;
    ctx.stroke();
    ctx.fillStyle = vgrad(ctx, -m * 0.24, m * 0.24, '#FFFFFF', '#FFF0A0');
    ctx.fill();
    ctx.restore();
    ctx.font = `800 ${m * 0.24}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = m * 0.07;
    ctx.strokeStyle = line;
    ctx.strokeText('VIP', cx, cy + m * 0.26);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('VIP', cx, cy + m * 0.26);
  } else if (type === 'locked') {
    const sr = m * 0.13, top = cy - m * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx - sr, top + m * 0.04);
    ctx.lineTo(cx - sr, top - m * 0.06);
    ctx.arc(cx, top - m * 0.06, sr, Math.PI, 0);
    ctx.lineTo(cx + sr, top + m * 0.04);
    ctx.lineWidth = m * 0.07;
    ctx.strokeStyle = '#6F6F84';
    ctx.stroke();
    ctx.beginPath();
    rr(ctx, cx - m * 0.22, top, m * 0.44, m * 0.32, m * 0.08);
    ctx.fillStyle = vgrad(ctx, top, top + m * 0.32, '#A9A9BC', '#7C7C92');
    ctx.fill();
    ctx.lineWidth = Math.max(1, m * 0.03);
    ctx.strokeStyle = '#5E5E72';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, top + m * 0.13, m * 0.045, 0, TAU);
    rr(ctx, cx - m * 0.02, top + m * 0.13, m * 0.04, m * 0.1, m * 0.02);
    ctx.fillStyle = '#4A4A5E';
    ctx.fill();
    ctx.beginPath();
    rr(ctx, cx - m * 0.17, top + m * 0.03, m * 0.12, m * 0.04, m * 0.02);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }
  ctx.restore();
}

// ---------- effects + coin ----------

const SPARK = ['#FFFFFF', '#FFD23F', '#F15BB5', '#4CC9F0'];

// Burst of radius ~56 px around (x,y); scale the ctx for other sizes. Invisible at t >= 1.
export function drawSparkle(ctx, x, y, t) {
  if (!(t >= 0 && t < 1)) return;
  const R = 56, e = 1 - (1 - t) ** 3, fade = 1 - t;
  ctx.save();
  ctx.translate(x, y);
  const fr = R * (0.3 + 0.5 * e), gr = ctx.createRadialGradient(0, 0, 0, 0, 0, fr);
  gr.addColorStop(0, `rgba(255,255,255,${fade})`);
  gr.addColorStop(0.45, `rgba(255,226,120,${0.7 * fade * fade})`);
  gr.addColorStop(1, 'rgba(255,226,120,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, 0, fr, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = fade;
  ctx.lineWidth = 1 + 5 * fade;
  ctx.strokeStyle = '#FFD23F';
  ctx.beginPath();
  ctx.arc(0, 0, R * e, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(201,132,0,0.6)';
  twinkle(ctx, 0, 0, t * 2, R * 0.5 * (1 - t) ** 2, '#FFFFFF');
  const pop = Math.sin(Math.PI * Math.sqrt(t)); // grows fast, shrinks slowly
  for (let i = 0; i < 12; i++) {
    const big = i % 2 === 0, a = (i * TAU) / 12 + t * (big ? 0.9 : -0.6);
    const d = R * (big ? 0.2 + 0.8 * e : 0.1 + 0.55 * e);
    twinkle(ctx, Math.cos(a) * d, Math.sin(a) * d, t * 3 + i, R * (big ? 0.2 : 0.11) * pop, SPARK[(i >> 1) % 4]);
  }
  ctx.restore();
}

// Four-point star, filled and outlined with the ctx's current stroke.
function twinkle(ctx, x, y, rot, s, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawCoin(ctx, x, y, r) {
  const lw = Math.max(1, r * 0.08);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r - lw / 2, 0, TAU);
  ctx.fillStyle = vgrad(ctx, -r, r, '#FFF29E', '#FFC61F', '#DB8D00');
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = '#A86400';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 0, TAU);
  ctx.fillStyle = vgrad(ctx, -r * 0.7, r * 0.7, '#E89A00', '#FFCF3D', '#FFE57A');
  ctx.fill();
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = 'rgba(168,100,0,0.55)';
  ctx.stroke();
  symbolPath(ctx, 'star', r * 0.42);
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = '#C07A00';
  ctx.stroke();
  ctx.fillStyle = vgrad(ctx, -r * 0.42, r * 0.42, '#FFF8CC', '#FFCB2E');
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.44, r * 0.3, r * 0.14, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fill();
  ctx.restore();
}

// px = image size in device pixels (pass CSS size × devicePixelRatio for a crisp counter).
export function coinDataURL(px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  drawCoin(c.getContext('2d'), px / 2, px / 2, px / 2);
  return c.toDataURL();
}
