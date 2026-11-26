# AERIS Ridge Runner

[![AERIS Ridge Runner — best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/Erwinsays12/makefun-flight-game/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/Erwinsays12/makefun-flight-game/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

An original bush-pilot flight game, entered in the [best flight game bounty on make.fun](https://make.fun/c/best-flight-game-20261126-0057).

You fly the Kestrel K-7, a small prop plane, out of a mountain valley airfield. Take off from runway 09, thread the glowing rings down the valley, mind your fuel and your airframe — then bring her home and grease the landing for the bonus.

## How to play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static server — `node serve.ts` serves it at http://localhost:8080). No network, no accounts, no build step.

| Key | Action |
| --- | --- |
| W / S | Pitch up / down |
| A / D | Bank & turn |
| Shift / Ctrl | Throttle up / down |
| Space | Airbrake |
| F | Flaps (slower, steadier landings) |
| G | Landing gear |
| C | Chase / cockpit view |
| Drag mouse | Look around |
| P | Pause · R restart · M sound · 1/2/3 pick a mission |

Stall below 58 kt. Each ring pays 500 points and tops up fuel. Land soft and centred on the runway for up to 1,500 points, plus time and fuel bonuses when the course is complete.

## Three missions

- **Dawn Valley** (Easy) — a gentle morning loop down the valley and home.
- **Canyon Rush** (Medium) — low, fast and tight along the river bends.
- **Storm Ridge** (Hard) — over the eastern ridge in a crosswind, with gusts.

## What is inside

- `game/index.html` — the game page and the lit instrument HUD.
- `game/src/` — the game's own source, one job per file: `terrain.js` (seeded valley, river, runway, trees, clouds), `aircraft.js` (the Kestrel, built from primitives), `flight.js` (arcade flight model: throttle, lift, stall, fuel, damage), `missions.js` (the three courses), `hud.js` (instruments + moving map), `audio.js` (synthesised engine, wind and chimes), `input.js`, `shots.js` (deterministic screenshot scenes), `main.js` (loop, cameras, screens).
- `game/vendor/three.module.min.js` — three.js, vendored.
- `screenshots/` — four real renders of the game, taken in a browser.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.

## License

MIT — see [LICENSE](LICENSE).
