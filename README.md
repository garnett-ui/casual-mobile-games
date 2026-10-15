# Pocket Arcade

An installable, offline-first collection of casual games for phones and
tablets. No accounts, no ads, no network needed after the first visit: open
the site once, add it to your home screen, and play anywhere.

## Games

### Car Jam

A top-down parking-lot puzzle. The lot is jammed full of cars; swipe a car
(or tap it to drive forwards) and it drives until it hits something. If the
way is clear it pulls out onto the ring road and heads for an exit. Clear every
car to win.

- **60 campaign levels** that grow from a 3×3 tutorial to packed 8×10 lots,
  then **endless bonus levels** generated on the device.
- **Grannies** cross the street at the crosswalks. Cars wait for them (and they
  let you know about it).
- **Cones, trees, barriers and bollards** that never move, **trucks** that take
  three spaces, and **hedges** along the lot edge that cars can't drive through.
- **Stars** for matching par (the fewest possible moves, computed by the
  solver), plus **Undo**, **Restart** and a **Hint** button that always knows
  the best next move.

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

- `npm run levels`: regenerate `games/car-jam/levels.js` from the difficulty
  tiers in `games/car-jam/tiers.js`. Every level is verified solvable and its
  par is the solver's optimum.
- `npm run icons`: re-render the PNG app icons from `icons/icon.svg`.

### Layout

```
index.html, css/, js/       app shell: hub, routing, audio, settings, install
js/games.js                 registry of games
games/car-jam/model.js      rules, solver, level generator (pure, shared with Node)
games/car-jam/play.js       simulation, input, rendering for a level
games/car-jam/draw.js       vector sprites (cars, grannies, obstacles)
games/car-jam/index.js      level select, HUD, win dialog
sw.js, sw-manifest.js       offline support
tools/                      level, icon and service-worker generators
test/                       node:test unit + Playwright end-to-end tests
```

### Adding a game

Create `games/<id>/index.js` exporting `mount(element, ctx, route)` that
returns `{ route(sub), destroy() }`, add an entry to `js/games.js`, and run
`npm run build`.

### Deployment

`.github/workflows/ci.yml` runs the tests on every push and, on the default
branch, publishes the site to GitHub Pages (Settings → Pages → Source:
**GitHub Actions**).
