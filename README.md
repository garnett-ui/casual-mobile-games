# Pocket Arcade

An installable, offline-first collection of casual games for phones and
tablets. No accounts, no ads, no network needed after the first visit: open
the site once, add it to your home screen, and play anywhere.

## Games

### Car Jam

A top-down parking-lot puzzle. The lot is jammed full of cars and hedged in,
with only a few gates out to the ring road. Swipe a car (or tap it to drive
forwards) and it drives until it hits something; a car can only leave if it
lines up with a gate and its way there is clear, so you have to shuffle cars
out of each other's way to get everyone out. Clear every car to win.

- **Endless levels, generated on the device from a seed.** Level *n* is the
  same lot for everyone, and each level is a little tougher than the last,
  forever: the lot grows from a 3×3 tutorial to a packed 9×11 (the most that
  fits a phone), gates get scarcer (under a third of the edge is open on big
  lots), and every level from 3 on needs at least one car moved aside, rising
  to several. The generator searches harder for tough layouts the further you
  get.
- **Grannies** cross the street at the crosswalks. Cars wait for them (and they
  let you know about it).
- **Cones, trees, barriers and bollards** that never move, and **trucks** that
  take three spaces.
- **Stars** for matching par (the fewest possible moves, computed by the
  solver), plus **Undo**, **Restart** and a **Hint** button that always knows
  the best next move.

### Tap Maze

A board packed with non-crossing lines, each ending in an arrowhead. Tap an
arrow (or swipe it the way it points) and it slithers along its own line and
off the board, but only if nothing lies between its head and the edge. Tap a
blocked arrow and it bumps and bounces back, costing one of your three hearts.
Clear every arrow to win; hearts left are your stars.

- **Endless seeded mazes**: boards grow to 10×14, lines get longer and
  twistier, and the chain of arrows blocking other arrows gets deeper level by
  level. Every maze is checked to be clearable.
- **Hint** shows an arrow that is free to go; **Restart** resets the hearts.

### Breakout

The arcade classic. Pick **portrait** (8 columns) or **landscape** (14 columns,
like the 1976 original) before you play; once a game starts the screen
orientation is locked (Android Chrome: installed app, or fullscreen in a tab).
Where it can't be locked (iOS), turning the phone pauses the game until you
turn it back. Drag anywhere to move the paddle, tap to launch.

- Classic rules: rows score 1/3/5/7 from the bottom, the ball speeds up after
  4 and 12 hits and on reaching the orange and red rows, and the paddle
  shrinks once the ball breaks through to the back wall. Three balls, a bonus
  ball for each wall cleared.
- Endless walls: later walls are faster, vary their pattern, and add tough
  (multi-hit) and steel (unbreakable) bricks. Best score is kept per
  orientation.
- Square-wave sound effects for wall bounces, the paddle, and bricks (pitch
  rises with the row).

### Lunar Lander

Lift off from the launch pad, fly over the mountains and set down gently on
the base before the fuel runs out. Hold **THRUST** for the main engine and the
two rotate buttons for the side thrusters (arrow keys / WASD / space work too).

- Realistic momentum and rotational inertia under lunar gravity (1.62 m/s²):
  the side thrusters change the spin rate, so you counter-fire to stop; spins
  under 4°/s are cancelled by an automatic attitude hold. The main engine gets
  punchier as fuel burns off.
- Green-phosphor instrument panel: altitude, horizontal/vertical velocity and
  acceleration, attitude and spin rate, fuel, distance to base, an attitude
  ball and a velocity box, with LOW FUEL / SINK RATE / DRIFT warnings.
- Scored on touchdown speed, drift, tilt, centring and fuel left. Too hard,
  too fast sideways, too tilted, or a hull strike: fireball and wreckage.
- Scenery from Apollo 8's *Earthrise* photo: the Earth hangs over the far
  lunar horizon, and the ground you fly over is the photo's surface.
- Endless missions: every one is test-flown by an autopilot when generated,
  so it is always possible; fuel is what it needed plus a margin that shrinks
  from 2× to 1.25×, while mountains rise and the base narrows.

### Night Driver

The 1976 Atari arcade racer: at night, all you see of the road is the white
posts along each side. Your left thumb drags the steering wheel and your right
thumb holds **GAS** and **BRAKE**. Both work at once (multi-touch); on a
keyboard, use the arrows or WASD.

- Seven-segment LED score, time and speed (mph). The clock runs down; every
  3 km adds time, a little less each time.
- Bends tighten the further you go, so the sharpest ones need the brake. Hit a
  post and you stop and lose time.
- After the opening stretch the road starts to fork. A green overhead sign (with
  a copy at the top of the screen) says where each branch goes, in jokes and
  riddles: *FREE EGGS → take the EGGS-IT*, *EXIT 404: road not found*, *What
  has a bed but never sleeps?* One branch ends in a hazard, drawn
  realistically: a brick wall, a road on fire, a bridge that's out, the Grand
  Canyon (you fall in), a boiling volcano (you fall in), or a road washed
  away. Brake to a stop in time and you're sent back to the right road.
- The drawbridge is a gamble: both leaves are up, and at 70 mph or more you
  jump the river for +1000. Any slower and you're swimming.
- It starts out looking like the 1976 screen (big posts, steep arcade
  perspective) and eases into ordinary perspective before the first sign.
- No 3D engine: it's a hand-written perspective projection on a 2D canvas,
  with particle flames, smoke and embers, and short animated falls.

### Jigsaw

Turn your own photos into jigsaw puzzles. **Choose photo** opens the photo
picker and **Take photo** the camera; the picture is scaled to at most 2048 px
and saved on the device in IndexedDB (nothing is uploaded), so it's there for
future puzzles. Two built-in pictures are included too.

- About 100 pieces by default (24 / 48 / 100 / 150 / 200), with the grid fitted
  to the photo so pieces are near-square, and classic tab-and-blank shapes.
- The picture fills as much of the screen as possible with a border on every
  side; loose pieces start scattered around it and turned every which way.
  Tap a piece to turn it a quarter; drag it near its spot, the right way up,
  and it snaps in. Pieces sit on an oak table, lit from the top left, and
  cast shadows on it.
- The picture stays hidden until the puzzle is done: hold the eye button to
  see it in a pop-up. Also: show edge pieces only, and scatter. The puzzle in
  progress is saved for later.

## Installing on a device

- **iPhone / iPad (Safari):** open the site, tap **Share**, then **Add to
  Home Screen**.
- **Android (Chrome):** open the site and tap **Install** on the banner (or
  ⋮ menu → **Install app**).

Progress is saved on the device.

## Development

There is no build step: the app is plain HTML, CSS and ES modules, drawn on a
canvas with no image or sound assets.

```sh
npm install           # dev dependency: Playwright for the browser tests
npm start             # serve at http://localhost:8080
npm test              # unit tests + headless-browser play-through + offline check
```

After changing any app file, run `npm run build` to refresh the generated
files (`sw-manifest.js` and `js/version.js`); the tests fail if they are stale.

### Versions and updates

The app version is `version` in `package.json` (semver: minor for new games
and features, patch for fixes), shown at the bottom of the home screen and
recorded in `CHANGELOG.md`. Bump it, add a changelog entry and run
`npm run build` for each release. Installed apps check for a new version when
they come back to the foreground (and hourly), then show a prompt naming the
new version; **Update** installs it and reloads.

Other scripts:

- Levels come from `games/car-jam/levels.js`: `specFor(n)` is the difficulty
  curve and `makeLevel(n)` builds level *n* from `seedFor(n)`. Every level is
  verified solvable and its par is the solver's optimum. Bump `GEN_VERSION`
  when generation changes so levels cached on devices are rebuilt.
- `npm run icons`: re-render the PNG app icons from `icons/icon.svg`.

### Layout

```
index.html, css/, js/       app shell: hub, routing, audio, settings, install
js/games.js                 registry of games
games/car-jam/model.js      rules, solver, level generator (pure, shared with Node)
games/car-jam/levels.js     seeded difficulty curve; worker.js builds levels off-thread
games/car-jam/play.js       simulation, input, rendering for a level
games/car-jam/draw.js       vector sprites (cars, grannies, obstacles)
games/car-jam/index.js      level select, HUD, win dialog
games/tap-maze/             Tap Maze: model.js (rules, generator), levels.js,
                            play.js, draw.js, index.js, worker.js
games/breakout/             Breakout: engine.js (physics, rules), play.js, index.js
games/lander/               Lunar Lander: engine.js (physics, terrain, autopilot), play.js
games/night-driver/         Night Driver: engine.js (road, car, forks; runs in Node), play.js (view), signs.js
games/jigsaw/               Jigsaw: puzzle.js (grid, piece shapes), play.js, samples.js
js/lib/photos.js            the player's photos, stored on the device (IndexedDB)
js/lib/orientation.js       orientation lock with fallback
js/lib/campaign.js          shared level select, progress and dialogs
js/lib/level-source.js      builds levels in a worker, prefetches and caches
sw.js, sw-manifest.js       offline support
tools/                      icon and service-worker generators
test/                       node:test unit + Playwright end-to-end tests
```

### Adding a game

Create `games/<id>/index.js` exporting `mount(element, ctx, route)` that
returns `{ route(sub), destroy() }`, add an entry to `js/games.js`, and run
`npm run build`.

### Analytics

`js/lib/analytics.js` reports to Google Analytics 4 (the mckoss.com property,
`G-GBPSK1HQ34`). Events are queued on the device and sent whenever it is
online, so play while offline is uploaded on the next connection (tagged with
`queued_minutes`). Events: `page_view`, `app_open` (installed vs browser),
`app_installed`, `level_start`, `level_complete` (with `stars`) and
`level_fail`, each with `game` and `level`. Nothing is sent from localhost.

### Deployment

The app is a static site hosted on GitHub Pages. `.github/workflows/ci.yml`
runs the tests on every push and, on `main`, publishes the site to Pages at
https://mckoss.com/casual-mobile-games/. One-time setup: Settings → Pages → Source: **GitHub Actions**.

## License

[MIT](LICENSE). The Lunar Lander scenery is cut from *Earthrise* (Apollo 8,
AS08-14-2383, NASA), which is in the public domain.
