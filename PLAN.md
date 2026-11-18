# Bus Traffic: implementation plan (v1)

Browser puzzle game. You tap colour-coded buses to drive them out of a jammed parking lot into a few parking spots. Passengers circling on a loop board buses of their colour, and full buses leave. You win by clearing every bus. You lose when the spots are full and nobody can board.

"Bus Traffic" is a placeholder name.

---

## 1. Scope

**In v1:**
- A level select screen (the home screen) and the level screen, with win/lose overlays.
- Endless generated levels with rising difficulty; every level is verified solvable.
- A VIP power-up, which is free for now.
- Coins: 50 per completed level, shown on every screen.
- Saved progress (unlocked level, current level, coins).
- Candy-style procedural graphics.
- Mouse + touch, on desktop browsers and iOS Safari.

**Out of v1 (named so nothing creeps in):**
- Spending coins (on the VIP power-up or on unlocking spots). The data is already shaped for both.
- Sound/music, diagonal buses, undo/hints, settings, offline/PWA, analytics.
- A tutorial beyond a one-line "Tap a bus" hint on level 1.

## 2. Tech choices

- **Plain HTML + Canvas 2D + vanilla JavaScript ES modules.** No framework, no build step, no runtime dependencies. One canvas for the board. Plain DOM buttons for menus, overlays and the HUD, which are easy to make accessible and stay crisp on every screen.
- **All art drawn in code** (gradients, rounded shapes, gloss highlights). No image assets to produce or license.
- **Node's built-in test runner** (`node --test`, Node 24 is installed) for rules, progress and level verification. No test library.
- Serve locally with `python -m http.server 8000` (ES modules don't load from `file://`).

## 3. Screens (portrait, design space 720 × 1280, scaled to fit)

**Every screen** has a coin counter (🪙 150) pinned top-right.

**Level select (home)**
```
┌───────────────────────────────┐
│ Bus Traffic           🪙 150  │
│                               │
│      ◀        12        ▶     │  big level number; ◀ = previous level (hidden at 1)
│                               │  ▶ = next level, shown locked/disabled if not unlocked yet
│          [  PLAY  ]           │
└───────────────────────────────┘
```

**Level screen**
```
┌───────────────────────────────┐
│ ⌂  ↻     Level 12     🪙 150  │  HUD: home, restart, level, coins
│ ╲ feeder           feeder ╱ │  walled paths from off-screen top-left / top-right join the loop's ends
│  ═╭───────────────────────╮═  │
│   │  passenger loop (30)  │   │  walled candy track; 30 peeps circulate, more walk in as room frees
│   ╰──────────╡gate╞───────╯   │  passengers leave only through the gate at bottom centre to board
│ [VIP][ 1 ][ 2 ][ 3 ][ 4 ][🔒][🔒][🔒] │  8 spots: VIP, 4 open, 3 locked
│ ═══════════ road ═════════════ │
│ ║ ┌───────────────────────┐ ║ │
│ ║ │      parking lot      │ ║ │  3×3 up to 9×11 units, zoomed to fit; buses face 8 directions
│ ║ └───────────────────────┘ ║ │  road on all sides
│ ═══════════════════════════════ │
│           [★ VIP]             │  power-up bar under the lot
└───────────────────────────────┘
```

**Overlays:**
- Win: "Level complete! +50 🪙" (no coin line on a replay) → **Next** / **Home**.
- Lose → **Restart** / **Home**.
- Stuck: a non-blocking countdown banner above the lot, so you can still tap VIP and a bus.

On a wide PC window the portrait board stays centred and the side background fills the rest.

## 4. Game rules (exact, because the solver, tests and game all run this same code)

**Lot.** A free-form area measured in units (1 unit = one bus width), with no grid. Each bus has a centre point and a heading in 45° steps, so later levels mix in diagonal buses, and a length set by its size: **10 seats = 1 unit, 20 = 2 units, 40 = 3 units**. Lots get more units across as the bus count grows, and the screen zooms the lot out to fit.

**Tap a bus.** Its lane is the strip one bus wide straight ahead of its nose. It is blocked by any lot bus whose body reaches into that strip, and it bounces off the nearest one.
- If the lane is clear, the bus drives out onto the road and into the free open spot that was **emptied longest ago** (never-used spots first, left to right), so quick taps spread along the row instead of queueing for a spot that is still emptying on screen. Normal driving never uses the VIP spot or the locked spots.
- If another bus is in the lane, the tapped bus drives up to it, bounces off, and returns to where it started. Nothing else changes.
- Taps on a bus that is mid-bounce are ignored.

**VIP power-up.**
1. Tap the **VIP button**. The game enters "pick a bus" mode: lot buses glow and a hint reads "Tap a bus to send it to VIP". Tapping the button again cancels.
2. Tap **any** bus still in the lot, even a blocked one. It teleports into the VIP spot with a sparkle and boards like any parked bus. Removing it can also free other buses' lanes.
3. The power-up can be used whenever the VIP spot is empty. It's free for now; later it will cost coins. The button is disabled while the VIP spot is occupied.

**Passengers.** Each level has an ordered queue of passengers. For each colour, the passenger count equals the total seats of that colour's buses. Up to **30** are on the loop at once. The rest wait off-screen and walk in along the top-left and top-right feeder paths whenever room frees, stepping onto the loop as their empty slot passes the end of the path (which path is purely visual).

**Boarding.** The loop circulates (one lap ≈ 5 s), and passengers leave it only through the gate at bottom centre. Every passenger reaches the gate within one lap, so the rules engine boards any matching passenger on the loop at once and only the animation waits for the gate. A passenger boards a parked, not-full bus of its colour. That includes a bus in the VIP spot. If two buses of that colour are parked, the **leftmost** fills first (VIP counts as leftmost); on screen, whoever reaches the gate first takes the leftmost one that is in its spot.

A parked bus shows the seats it still has to fill; the number disappears at 0 and the bus leaves.

**Departing.** A full bus drives off the side of the screen and is done. Its spot frees up.

**Settle.** After every tap or VIP use, the rules repeat (stream in → board → depart) until nothing changes. Then:
- **Win** if every bus is gone.
- **Stuck** if all 4 open spots are full. Settling already did every boarding that could happen.
  - If a power-up can still be used (today that means the VIP spot is empty), status becomes `stuck`. A **10-second countdown** starts ("Out of space! Use a power-up: 10…") and the VIP button pulses.
    - If a power-up is used in time and that un-sticks the game, play continues.
    - If it is used and the game is still stuck, the countdown restarts.
    - If time runs out, it's **game over**.
  - If no power-up can be used (the VIP spot is occupied), it's **game over** at once. A countdown with nothing to press would just be a wait.
  - The countdown is a real-time UI timer in `game.js`, not part of the rules, so levels stay deterministic. When it expires, `game.js` calls `expire(game)`, which sets `lost`.

**Key design decision.** The rules settle instantly on each action, and the animation plays catch-up. Timing therefore never affects the outcome, only the order of actions. That makes the game fully deterministic, so verifying a level means replaying a tap sequence through the real game code.

## 5. Data contract (shared by all modules and subagents)

```js
// generateLevel(n) → Level   (src/generator.js)
{
  level: 7,
  lot: { w: 6, h: 8 },                     // lot units; y grows downward
  buses: [ { id: 0, color: 2, size: 20, length: 2,
             x: 1.5, y: 4, a: 45 } ],      // centre (x,y); heading a in degrees clockwise from up
  queue: [2, 0, 1, 1, ...],                // passenger colours in arrival order
  loopCapacity: 30,
  spots: ['vip','open','open','open','open','locked','locked','locked'], // visual order L→R
  solution: [3, 0, 5, ...]                 // bus ids, a tap-only order proven to win
}

// src/sim.js (pure, no DOM)
createGame(level) → { game, events }       // events = initial loop fill
tap(game, busId)    → events[]
useVip(game, busId) → events[]             // no-op [] unless VIP spot empty and bus in lot
laneCheck(game, busId) → { clear: true } | { clear: false, blocker, free } // free = units it can drive first
vipAvailable(game)  → boolean
expire(game)        → events[]             // stuck → lost (countdown ran out)
game.status         // 'playing' | 'stuck' | 'won' | 'lost'   (stuck = only a power-up can help)

// Events, consumed by the renderer in order:
{ type: 'bounce',   bus, blocker, free }
{ type: 'park',     bus, spot }            // spot = index into spots[]
{ type: 'teleport', bus, spot }            // VIP
{ type: 'enter',    passenger, color, slot } // passenger = queue index, slot = loop slot 0..29
{ type: 'board',    passenger, bus, spot }
{ type: 'depart',   bus, spot }
{ type: 'won' } | { type: 'lost' } | { type: 'stuck' }

// src/progress.js (pure + localStorage wrapper)
load() → { unlocked: 1, current: 1, coins: 0 }   // defaults when nothing saved
save(p)
applyWin(p, n) → p'   // coins += 50 only if n === unlocked (first completion); unlocked = max(unlocked, n+1); current = n+1
```

The coins features later only need to change `spots` from `'locked'` to `'open'` and add a cost check in `vipAvailable`.

## 6. Level generation and verification

`generateLevel(n)` is deterministic: the same level number always gives the same level (seeded RNG, mulberry32).

1. Read the parameters from `difficulty(n)` (see §7).
2. **Place buses** at random centres on a half-unit lattice, with random headings and sizes, no overlaps and inside the lot (`src/geometry.js` has the rectangle maths). Reject a bus if it would close a cycle in the "blocks" graph (A waits on B while B waits on A). Removing buses only ever clears lanes, so an acyclic layout stays solvable for the lot part forever. If the lot fills up before the target count, keep it once it has the band's minimum.
3. **Assign colours**, balanced, with every colour used at least once.
4. **Build a witness tap order**: repeatedly pick a random bus whose lane is currently clear.
5. **Build the passenger queue** from the witness: each bus's passengers in witness order, then jittered (each passenger's sort key = position + random × `noise`). More noise means the stream lines up less well with the lot, which forces the player to buffer buses in spots, and that is the main difficulty lever.
6. **Verify** by replaying the witness through `sim.js` using **normal taps only, no VIP**. It must end in `won`. So every level is winnable with the 4 open spots alone, and VIP is a genuine bonus, which matters once it costs coins. If verification fails, retry with the next seed. After a few failures, lower the noise.
7. Return the level with `solution` = the witness.

**Tests** (`npm test`):
- Rules: bounce; park uses open spots only; boarding cap; leftmost-first; depart frees the spot; win.
- Geometry: straight, offset, diagonal and behind-the-bus lane cases; overlap and bounds.
- VIP:
  - It can teleport a blocked bus, and the bus boards.
  - It can't be used while the VIP spot is occupied.
  - The game goes `stuck` (not `lost`) when the open spots are full and VIP is empty.
  - The game goes `lost` when VIP is occupied too.
  - `expire` turns `stuck` into `lost`.
- Progress: defaults; unlock and +50 coins on first completion; replaying an old level gives no coins and doesn't move `unlocked` backwards; a corrupt save falls back to defaults.
- `levels.test.js`: levels 1–300 each generate deterministically and pass sanity checks (in bounds, no overlap, seats per colour = passengers per colour, acyclic). Each replays `solution` to `won` and generates in well under 100 ms.

## 7. Difficulty curve (starting values, tuned in one function in `config.js`)

| Levels | Colours | Buses | Sizes | Lot (units) | Diagonal | Queue noise |
|---|---|---|---|---|---|---|
| 1–2 | 2 | 3–4 | 10, 20 | 3×3 | – | low |
| 3–5 | 3 | 5–7 | 10, 20 | 3×4 | – | low |
| 6–10 | 4 | 8–12 | + 40 | 4×6 | – | medium |
| 11–20 | 5 | 12–18 | all | 6×6 | 10% | medium |
| 21–35 | 6 | 16–24 | all | 6×8 | 20% | high |
| 36–60 | 7 | 22–30 | all | 7×9 | 25% | high |
| 61–100 | 8 | 28–36 | all | 8×10 | 30% | high |
| 101+ | 8 | 34–42 | all | 9×11 | 35% | high |

Generated levels are proven solvable. Whether they feel fun is something only playtesting will show, and you'll tune it by editing this table.

## 8. Candy art style (`src/art.js`, pure drawing functions)

- **Palette (8)**, each colour with a matching shape symbol for colour-blind players:

  | Colour | Hex | Symbol |
  |---|---|---|
  | cherry | `#FF4D6D` | heart |
  | tangerine | `#FF9F1C` | circle |
  | lemon | `#FFD23F` | star |
  | lime | `#7BD389` | triangle |
  | sky | `#4CC9F0` | square |
  | grape | `#9B5DE5` | diamond |
  | bubblegum | `#F15BB5` | flower |
  | teal | `#00BBA7` | cross |

- **Buses (top-down):**
  - Rounded body with a vertical gradient (light → base → dark) and a darker 3 px outline.
  - A white gloss strip, glossy windows along the sides, a windscreen at the nose and a soft drop shadow.
  - A roof badge with the colour symbol and seats (`20`). 1-unit buses show the symbol only, nudged to the rear so the windscreen shows which way they face. Parked buses get a larger badge with the seats still to fill.
- **Passengers ("peeps"):** gumdrop body + round head in their colour, a gloss dot, and the colour symbol on the belly.
- **Spots:** rounded pads with white dashed lines. VIP is gold with a star and a "VIP" label. Locked spots are grey with a padlock.
- **VIP button:** a gold candy pill with a star. It pulses when stuck and is greyed out when the VIP spot is occupied.
- **Coin:** a gold glossy disc, used in the coin counter on every screen.
- **Loop:** jelly-style rounded track with a candy-stripe edge. **Road:** soft lavender-grey. **Background:** pastel gradient with faint polka dots.
- **Teleport:** a sparkle burst at the old position and at the VIP spot.
- **Drawing conventions:**
  - Every bus is drawn nose-up, centred on (0,0); the caller translates/rotates.
  - Parked buses are drawn at a fixed size to fit the spot row.

Colours are passed around as **palette indices** (0–7) everywhere. The sim only ever sees numbers.

```js
// src/art.js: pure Canvas 2D, no game state, no imports from other src files
export const PALETTE                     // [{ name, hex, symbol }] × 8, in the table order above
drawBackground(ctx, w, h)
drawLot(ctx, rect, road)                // rect = {x,y,w,h} of the lot; road = road width drawn around it
drawLoop(ctx, rect, track, feeders)     // the walled passenger track, gate at bottom centre, feeder paths
loopPoint(rect, t) → {x, y}             // point on the track centreline, t in [0,1); used to place peeps
drawSpot(ctx, x, y, w, h, type)         // 'open' | 'vip' | 'locked'; (x,y) = top-left
drawBus(ctx, x, y, w, len, angle, color, label) // centre (x,y); angle radians, 0 = nose up, clockwise;
                                        // the roof badge (symbol + label) stays upright at any angle; label null = no badge
drawBadge(ctx, x, y, size, color, label) // a badge on its own
drawPeep(ctx, x, y, r, color)
drawSymbol(ctx, x, y, r, color)         // the colour's shape symbol
drawSparkle(ctx, x, y, t)               // t = 0..1 animation progress
drawCoin(ctx, x, y, r)
coinDataURL(px) → string                // for the DOM coin counter
```

The VIP button, coin counter and menus are DOM elements styled in `style.css` with the same candy look; they are not canvas art.

## 9. PC + iOS specifics

- **Input and display:**
  - A viewport meta with `viewport-fit=cover` and zoom disabled.
  - `touch-action: none` and no text selection or callouts, so taps never zoom or scroll.
  - Layout uses `100dvh` and safe-area insets for the HUD.
  - Pointer Events handle mouse and touch alike. Hit boxes are padded so small buses are easy to tap with a thumb.
  - The canvas backing store is sized to `devicePixelRatio` (capped at 2) and redone on resize/orientation change.
- **Saving:**
  - `localStorage`, which has no expiry date. The save key is `busTraffic.save` and holds `{unlocked, current, coins}`. Reads and writes are wrapped in try/catch, because private mode can throw; the game still runs without saving.
  - On start the game calls `navigator.storage.persist()` to ask the browser not to clear it.
- **iOS caveat:** Safari deletes *all* script-written site storage (localStorage included) after 7 days of Safari use without the site being opened. **Adding the game to the Home Screen avoids that rule.** The page includes `apple-mobile-web-app-capable` and an icon, so it then runs fullscreen like an app. Truly permanent saves on a plain Safari tab would need a server-side account, which is out of scope for v1.

## 10. Files

```
index.html          shell + DOM screens/overlays (level select, HUD, win/lose)
style.css
package.json        { "type": "module", scripts: test, start }
src/rng.js          seeded RNG
src/config.js       sizes→lengths, spot layout, loop capacity, difficulty(n)
src/geometry.js     bus rectangles: lanes, overlap, bounds (pure)
src/sim.js          rules (pure), incl. VIP
src/generator.js    generateLevel(n) + verification
src/progress.js     save/load/applyWin
src/art.js          palette + candy drawing functions
src/game.js         level screen: layout, input/hit-test, VIP pick mode, animation from events
src/main.js         boot, screen switching (level select ↔ level), coin counter
test/sim.test.js
test/geometry.test.js
test/progress.test.js
test/levels.test.js
art-preview.html    dev-only sheet of every art piece (delete any time)
```

## 11. How the subagents will be coordinated

| Phase | Who | Work | Done when |
|---|---|---|---|
| 0 | me | `git init`, `package.json`, commit this plan | the repo exists. Every later phase is its own commit, so you can review diffs |
| 1a | **Logic agent** | `rng`, `config`, `sim` (incl. VIP), `generator`, `progress`, tests | `npm test` is green; levels 1–300 are verified |
| 1b | **Art agent** (parallel with 1a, separate files) | `art.js` + `art-preview.html` | the preview sheet renders every piece with no console errors |
| 2 | **Integration agent** (after 1a + 1b) | `index.html`, `style.css`, `game.js`, `main.js` | level select → play → win (coins +50, next unlocked) / lose → restart/home all work with mouse and with touch at 375×812; VIP pick mode works; progress survives a reload |
| 3 | me | Run tests; play levels 1–5 in the in-app browser at desktop and iPhone viewport sizes; use VIP; force a loss; check level-select arrows, coins and reload persistence; fix small issues or send them back to the integration agent | verified end to end; commit; I report back to you |

Each agent gets this file as its spec plus a narrow brief: its files only, the §5 contract, and its done-criteria.

**Testing on your iPhone:** run `python -m http.server 8000` on the PC, then open `http://<PC-IP>:8000` on the phone over the same Wi-Fi (allow it through Windows Firewall when asked). Saves are per address, so progress made at a LAN address won't carry over to a later hosted URL. GitHub Pages works if you want a stable public URL.

## 12. Decisions

All settled:
- Boarding: matching passengers board as they pass the gate at the bottom centre of the loop.
- Directions: 8 headings in 45° steps; diagonal buses from level 11.
- Lengths: 10/20/40 seats = 1/2/3 units, on a free-form lot that zooms to fit.
- Colour-blind symbols: on.
- Loop: 30 on screen, fed by two paths from off-screen.
- VIP: a power-up only.
- Coins: 50, first completion of a level only.
- Out of space: a 10 s countdown to use a power-up; game over at once if none can be used.
- Saves: localStorage.
- Name: "Bus Traffic" (placeholder).
