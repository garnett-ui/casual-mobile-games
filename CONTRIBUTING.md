# Contributing

Pull requests are welcome: new games, or fixes to the ones here. Each one is
reviewed and merged by hand.

## How a pull request gets in

1. **Start from the latest `main`**, on a branch of your own (in a fork is
   fine).
2. **Keep it to one thing**: one new game, or one fix.
3. **If `main` moves on before it's merged, rebase onto it** (`git fetch
   upstream && git rebase upstream/main`), don't merge `main` in. Then run
   `npm run build` again: `sw-manifest.js` is generated from every file, so
   it always needs remaking after a rebase rather than merging by hand.
4. **`npm test` must pass**, locally and in CI (the "Test and deploy"
   check runs on every pull request). A pull request can only be merged when
   it is up to date with `main` and the check is green.
5. It's **squash-merged** onto `main`: one commit, so write the pull
   request's title and description the way you'd want that commit to read.
6. **Don't bump the version or edit `CHANGELOG.md`**: every pull request
   would conflict over them. The version bump and changelog entry are added
   on `main` after the merge.

## Adding a game

A game is a folder under `games/<id>/` and an entry in `js/games.js`:

- `index.js` exports `mount(root, ctx, route)`: it draws into `root`, uses
  the `ctx` the app passes (sound, haptics, saving, navigation -- see
  `ctxFor` in `js/app.js`), and returns `{ route, destroy }`.
- `art.js` exports `paint(canvas)`: the picture on the game's card on the
  home screen. It must cope with being painted before the card is laid out
  (zero size).
- Keep the rules and physics in a module with no DOM (like
  `games/lander/engine.js` or `games/morse/code.js`), so they can be tested
  in Node.
- Levels come from a seed (`js/lib/random.js`), so level *n* is the same on
  every device. Most games use the shared level select and dialogs in
  `js/lib/campaign.js`.
- Add tests in `test/<id>.test.mjs` (node:test), and a play-through in
  `test/e2e.test.mjs` if you can (Playwright, headless Chromium).
- Add a section for the game to `DESIGN.md`: how it's meant to play, and
  why. The principles at the top of that file apply to every game:
  offline-first, phone-first, no ads or accounts.
- Everything under `games/` is cached for offline play automatically once
  you run `npm run build`. Keep downloads small: draw on a canvas, and
  synthesise sound where you can (recorded audio and images are fine where
  they make a game better).

## Checking your work

```sh
npm install     # Playwright, for the browser tests
npm start       # http://localhost:8080
npm run build   # after changing any file: refreshes sw-manifest.js
npm test        # everything CI runs
```
