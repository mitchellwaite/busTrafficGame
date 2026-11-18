# Bus Traffic

Browser puzzle game for PC and iOS Safari: tap buses out of a jammed lot into parking spots, where passengers from a loop board them by colour. Vanilla JS ES modules + Canvas 2D, no dependencies, no build step.

- Spec: `PLAN.md`. It is the source of truth for rules, data contract, difficulty and art. Update it when you change any of those.
- Tests: `npm test` (Node 24's built-in `node --test`). `test/levels.test.js` generates levels 1–300 and requires each to take under 100 ms.
- Git: commits go on `main`, which tracks `origin` (github.com:mitchellwaite/busTrafficGame). Commit and push only when asked.

## Architecture

- `src/sim.js`: pure rules. Every action settles instantly and returns events in causal order. Outcomes must never depend on timing. The generator proves each level winnable by replaying taps instantly, so keep the rules timing-free.
- `src/game.js`: the level screen. `play(events)` schedules the events on an animation timeline that catches up to the sim.
  - `now` is visual time; it speeds up when more than 15 s of animation is queued.
  - `clock` is play time and drives the 10 s out-of-space countdown. Frame `dt` is capped, so a hidden tab pauses the game.
- Boarding: the rules board every matching passenger on the loop at once. On screen, a passenger only leaves through the gate at the bottom centre. Within one run of boardings, `board()` reassigns passengers among same-colour buses so the leftmost fills first, keeping each bus's count from the rules.
- `src/geometry.js`: the lot is free-form, measured in units (1 unit = a bus width). A bus is `{x, y, a}`: centre, plus heading in degrees clockwise from up, in 45° steps. Lengths are 10/20/40 seats = 1/2/3 units. The sim (lanes), the generator (placement) and the game (hit-test, drawing) all share this module's maths.
- `src/generator.js`: `generateLevel(n)` is deterministic (seeded by n). Any change to the generator, `config.js` or the rules changes every level. Saves only store level numbers, so they survive.
- `src/config.js`: bus sizes, spots, loop capacity and the difficulty bands (lot size, bus count, diagonal share, queue noise).
- `src/art.js`: candy drawing, pre-rendered into cached canvases. Every input that changes a sprite's look must be part of its cache key.
- Layout is a fixed design space 720 px wide; the height is at least 1280 and follows the screen. Positions are constants at the top of `game.js`. The DOM UI in `#stage` (`index.html`, `style.css`) is scaled with the canvas.
- Saves: `localStorage` key `busTraffic.save` holds `{unlocked, current, coins}`. Keep that format compatible.
- `art-preview.html` is a dev-only art sheet.

## Checking changes in the in-app browser

- The user often already runs a server on port 8000, which serves the working tree. Navigate to http://localhost:8000 before starting the `game` preview config.
- A hidden browser pane runs no animation frames. Drive frames by hand from JS:

  ```js
  window.__fake = performance.now(); performance.now = () => window.__fake
  window.__cbs = []; window.requestAnimationFrame = (cb) => (window.__cbs.push(cb), 1)
  window.__pump = (sec) => { for (let i = 0; i < sec * 60; i++) { __fake += 1000 / 60; const c = __cbs; __cbs = []; c.forEach((f) => f(__fake)) } }
  ```

  Take one screenshot first, so the pending real frame hands over to the shim.
- `window.__bt` exposes `game` and `level`.
- After editing modules, re-fetch them with `fetch(url, {cache: 'reload'})` before reloading. Otherwise cached old modules mix with new ones and the page fails to load.
- Remove any test save (`localStorage.removeItem('busTraffic.save')`) and reset the viewport when done.

## When you finish a change

End your closing message with the command to start the game server and the link to open, so the user can play-test it themselves:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. The command must be run from the project folder. If the browser shows a blank page after an update, a hard refresh (Ctrl+Shift+R) clears the old cached scripts.
