// Bus length in lot units (1 unit = one bus width). The drawn and colliding body is BUS_W wide and
// length - BUS_PAD long, which leaves a small gap between buses side by side or end to end.
export const SIZE_LENGTH = { 10: 1, 20: 2, 40: 3 }
export const BUS_W = 0.84
export const BUS_PAD = 0.16
export const SPOTS = ['vip', 'open', 'open', 'open', 'open', 'locked', 'locked', 'locked']
export const LOOP_CAPACITY = 30
export const MAX_COLORS = 8

// Level parameters (PLAN.md §7). buses = [min, max]; sizes = pick list (repeat a size to weight it);
// w × h = lot size in units (it grows with the bus count and the lot zooms out to fit the screen);
// diag = share of buses parked at 45°; noise = how far (in passengers) each passenger may drift later in the queue.
const BANDS = [
  [2, { colors: 2, buses: [3, 4], sizes: [10, 20], w: 3, h: 3, diag: 0, noise: 0 }],
  [5, { colors: 3, buses: [5, 7], sizes: [10, 20], w: 3, h: 4, diag: 0, noise: 20 }],
  [10, { colors: 4, buses: [8, 12], sizes: [10, 20, 40], w: 4, h: 6, diag: 0, noise: 120 }],
  [20, { colors: 5, buses: [12, 18], sizes: [10, 20, 40], w: 6, h: 6, diag: 0.1, noise: 160 }],
  [35, { colors: 6, buses: [16, 24], sizes: [10, 20, 40], w: 6, h: 8, diag: 0.2, noise: 220 }],
  [60, { colors: 7, buses: [22, 30], sizes: [10, 20, 40], w: 7, h: 9, diag: 0.25, noise: 260 }],
  [100, { colors: 8, buses: [28, 36], sizes: [10, 20, 40], w: 8, h: 10, diag: 0.3, noise: 260 }],
  [Infinity, { colors: 8, buses: [34, 42], sizes: [10, 20, 40], w: 9, h: 11, diag: 0.35, noise: 280 }],
]

export const difficulty = (n) => ({ ...BANDS.find(([max]) => n <= max)[1] })
