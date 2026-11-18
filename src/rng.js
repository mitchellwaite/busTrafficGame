// mulberry32: tiny seeded PRNG, returns floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Integer in [lo, hi], inclusive.
export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]

// In-place Fisher-Yates; returns arr.
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
