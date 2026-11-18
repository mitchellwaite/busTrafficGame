# Bus Traffic

A small, candy-coloured puzzle game for the browser, on PC and iPhone. Tap buses to get them out of a jammed parking lot, park them, and let the passengers circling the loop climb aboard. No ads, no accounts, no downloads.

I built this with AI because i was tired of the constant ads in all the bus games on the app store

**Play it:** https://mitchellwaite.github.io/busTrafficGame/ (once GitHub Pages is switched on for this repo), or run it locally (see below).

## How to play

- **Tap a bus** to drive it straight ahead out of the lot and into the next free parking spot. If another bus is in the way, it bumps into it, bounces back and buzzes.
- **Passengers** walk in along the two arms at the top and ride around the loop. When one passes the gate at the bottom, it hops into a parked bus of its own colour. If two buses of that colour are parked, the leftmost fills first.
- **Full buses drive off** and free their spot. Each bus shows how many seats it still has to fill.
- **Clear every bus to win.** Small buses seat 4, medium 6 and large 10.
- **Out of space:** when every open spot holds a bus that is still waiting, you have 10 seconds to use a power-up. If you can't afford one, the level is over.

Every colour also has its own symbol, so the game works for colour-blind players too.

## Power-ups

You earn **50 coins** the first time you clear each level.

| Power-up | Cost | What it does |
|---|---|---|
| ★ VIP | 25 | Pick any bus, even a blocked one, and it teleports to the gold VIP spot. |
| Unlock a spot | 50 | Tap one of the three locked spots to open it for the rest of the level. |
| ✨ Fill | 75 | Every parked bus fills at once: matching passengers fly straight in from the queue and the loop. |

The **»** button at the top runs the animation at double speed.

## Levels

Levels are generated, so they never run out. They start with a handful of buses in two colours and grow to 40-odd buses in eight colours, with diagonal parking from level 11. Every level is checked before you see it: the generator replays a winning sequence of plain taps, with no power-ups, so every level can be beaten without spending coins. From level 11 a level must also make you park at least one bus and wait, so there is something to plan.

Your progress (unlocked levels, current level and coins) is saved in the browser.

## Running it locally

There is no build step and nothing to install. Browsers won't load the game's JavaScript modules straight from disk, so serve the folder:

```bash
python serve.py
```

Then open http://localhost:8000. `serve.py` is Python's built-in web server, set up so browsers always fetch the latest scripts after an edit instead of a stale cached copy. Other devices on the same Wi-Fi, like a phone, can open `http://<your-PC's-IP>:8000`.

For testing, type `setCoins(500)` in the browser console to set your coin count.

## How it's built

- Plain HTML, Canvas 2D and JavaScript modules. No frameworks and no dependencies.
- All the art is drawn in code, and the sounds are generated with the Web Audio API, so there are no image or audio files.
- The game rules (`src/sim.js`) are separate from the animation (`src/game.js`) and never depend on timing, so a level plays out the same however fast you tap.

| File | Role |
|---|---|
| `src/sim.js` | Game rules |
| `src/generator.js`, `src/config.js` | Level generation and difficulty |
| `src/game.js` | The level screen: input, layout and animation |
| `src/art.js`, `src/sound.js` | Drawing and sound effects |
| `src/main.js`, `src/progress.js` | Menus, coins and saved progress |

Tests use Node's built-in test runner (Node 24):

```bash
npm test
```

They cover the rules, saved progress and the lot geometry, and generate levels 1 to 300 to check that each one is valid and winnable.

[PLAN.md](PLAN.md) is the full design spec, and [CLAUDE.md](CLAUDE.md) holds notes for working on the code with Claude Code.
