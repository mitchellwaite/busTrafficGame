// Keeps the game up to date, above all a copy added to the iPhone Home Screen: iOS resumes it without reloading, and
// GitHub Pages lets browsers reuse files for 10 minutes. On launch and whenever the page comes back to the
// foreground, this asks the server for every file again. If any changed, the new copies are now in the browser cache
// and the page reloads: at once on the home screen, or when the player next goes back to it, never mid-level.
// A plain script rather than a module, so it still runs if a half-updated set of modules fails to load.
;(() => {
  // Every file the game loads (test/update.test.js keeps this list complete).
  const FILES = ['index.html', 'style.css', 'update.js', 'src/art.js', 'src/config.js', 'src/game.js', 'src/generator.js',
    'src/geometry.js', 'src/main.js', 'src/progress.js', 'src/rng.js', 'src/sim.js', 'src/sound.js']
  const KEY = 'busTraffic.build' // fingerprint of the files last seen; separate from the save
  let last = 0, pending = false

  async function check() {
    if (Date.now() - last < 10000) return // launch fires both pageshow and visibilitychange
    last = Date.now()
    let texts
    try {
      // no-cache: the browser asks the server; a changed file replaces the cached copy, an unchanged one costs a 304
      texts = await Promise.all(FILES.map(async (f) => {
        const res = await fetch(f, { cache: 'no-cache' })
        if (!res.ok) throw new Error(f)
        return res.text()
      }))
    } catch {
      return // offline or mid-deploy: try again next time
    }
    let h = 2166136261 // FNV-1a over every file
    for (const t of texts) for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619)
    const build = String(h >>> 0)
    let seen
    try {
      seen = localStorage.getItem(KEY)
      localStorage.setItem(KEY, build)
      if (localStorage.getItem(KEY) !== build) return
    } catch {
      return // no storage: never reload, or every launch would look like an update
    }
    if (seen === null || seen === build) return // first run, or nothing new
    pending = true
    reloadIfHome()
  }

  function reloadIfHome() {
    const level = document.getElementById('level')
    if (pending && level?.hidden !== false) location.reload() // on the home screen (or the game never started)
  }

  addEventListener('pageshow', check)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  addEventListener('DOMContentLoaded', () => {
    const level = document.getElementById('level')
    if (level) new MutationObserver(reloadIfHome).observe(level, { attributes: true, attributeFilter: ['hidden'] })
  })
})()
