export const SIZE_LENGTH = { 10: 2, 20: 3, 40: 4 }
export const SPOTS = ['vip', 'open', 'open', 'open', 'open', 'locked', 'locked', 'locked']
export const LOOP_CAPACITY = 50
export const MAX_COLORS = 8

// Level parameters (PLAN.md §7). buses = [min, max]; sizes = pick list (repeat a size to weight it);
// noise = how far (in passengers) each passenger may drift later in the queue.
const BANDS = [
  [2, { colors: 2, buses: [3, 4], sizes: [10, 20], cols: 5, rows: 6, noise: 0 }],
  [5, { colors: 3, buses: [5, 7], sizes: [10, 20], cols: 5, rows: 7, noise: 20 }],
  [10, { colors: 4, buses: [8, 12], sizes: [10, 20, 40], cols: 6, rows: 8, noise: 120 }],
  [20, { colors: 5, buses: [12, 18], sizes: [10, 20, 40], cols: 7, rows: 9, noise: 160 }],
  [35, { colors: 6, buses: [16, 24], sizes: [10, 20, 40], cols: 8, rows: 10, noise: 220 }],
  [Infinity, { colors: 7, buses: [20, 26], sizes: [10, 20, 40], cols: 8, rows: 10, noise: 260 }],
]

export function difficulty(n) {
  const d = { ...BANDS.find(([max]) => n <= max)[1] }
  if (n > 60) d.colors = 8
  return d
}
