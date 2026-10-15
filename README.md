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

After changing any app file, run `npm run build` to refresh the service
worker's precache list (`sw-manifest.js`); the tests fail if it is stale.

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

### Deployment

The app is a static site hosted on GitHub Pages. `.github/workflows/ci.yml`
runs the tests on every push and, on `main`, publishes the site to Pages at
https://mckoss.com/casual-mobile-games/. One-time setup: Settings → Pages → Source: **GitHub Actions**.

## License

[MIT](LICENSE)
