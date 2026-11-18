const KEY = 'busTraffic.save'
const int = (v, min) => Number.isInteger(v) && v >= min

// storage falls back to localStorage inside the try, because merely touching localStorage can throw
// (blocked storage); the game then runs without saving.
export function load(storage) {
  try {
    const p = JSON.parse((storage ?? globalThis.localStorage).getItem(KEY))
    if (int(p.unlocked, 1) && int(p.current, 1) && p.current <= p.unlocked && int(p.coins, 0))
      return { unlocked: p.unlocked, current: p.current, coins: p.coins }
  } catch {}
  return { unlocked: 1, current: 1, coins: 0 }
}

export function save(p, storage) {
  try {
    ;(storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify({ unlocked: p.unlocked, current: p.current, coins: p.coins }))
  } catch {}
}

// +50 coins only on the first completion (n === unlocked); never moves unlocked backwards.
export const applyWin = (p, n) => ({
  unlocked: Math.max(p.unlocked, n + 1),
  current: n + 1,
  coins: p.coins + (n === p.unlocked ? 50 : 0),
})
