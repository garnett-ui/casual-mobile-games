// Browser smoke test: serves the app, plays real levels with swipe gestures
// in headless Chromium (phone viewport), and checks for runtime errors.
// Skips itself when Playwright isn't installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  chromium = null;
}

const root = new URL('..', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

// overrides: path -> body served instead of the file (to fake a new deploy).
// delays: path -> milliseconds to hold the response (to watch progress).
function serve(overrides = new Map(), delays = new Map()) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (delays.has(path)) await new Promise((r) => setTimeout(r, delays.get(path)));
    if (overrides.has(path)) {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      return res.end(overrides.get(path));
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

// Swipe a car with the mouse (pointer events) in the given direction.
async function swipe(page, car, sign) {
  const pt = await page.evaluate(([i, s]) => {
    const p = window.__carJamPlay;
    const c = p.cars[i];
    const [x, y] = p.carCenter(c);
    const r = p.canvas.getBoundingClientRect();
    const sx = r.left + p.ox + x * p.T;
    const sy = r.top + p.oy + y * p.T;
    const d = p.T * 0.9 * s;
    return { sx, sy, ex: c.horiz ? sx + d : sx, ey: c.horiz ? sy : sy + d };
  }, [car, sign]);
  await page.mouse.move(pt.sx, pt.sy);
  await page.mouse.down();
  await page.mouse.move((pt.sx + pt.ex) / 2, (pt.sy + pt.ey) / 2, { steps: 2 });
  await page.mouse.move(pt.ex, pt.ey, { steps: 2 });
  await page.mouse.up();
}

// Play the current level by following the built-in hints.
async function solveWithHints(page) {
  for (let guard = 0; guard < 200; guard++) {
    if (await page.locator('.dialog:not([hidden])').count()) return true;
    const hint = await page.evaluate(() => {
      const p = window.__carJamPlay;
      if (p.pos.every((v) => v < 0)) return 'wait';
      p.showHint();
      const h = p.hint;
      if (!h) return null;
      // Wait for the car to come to rest before swiping it.
      return p.cars[h.car].mode === 'lot' ? { car: h.car, sign: h.sign } : 'wait';
    });
    assert.ok(hint, 'hint available');
    if (hint !== 'wait') {
      const before = await page.evaluate(() => window.__carJamPlay.moves);
      await swipe(page, hint.car, hint.sign);
      const after = await page.evaluate(() => window.__carJamPlay.moves);
      if (process.env.E2E_DEBUG) console.log(JSON.stringify(hint), before, after);
    }
    await page.waitForTimeout(hint === 'wait' ? 250 : 120);
  }
  return false;
}

test('hub loads, a level can be played to the win screen', { skip: !chromium, timeout: 120000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.locator('[data-game=car-jam]').click();
    await page.locator('.lvl[data-n="1"]').click();
    await page.waitForFunction(() => window.__carJamPlay);

    assert.ok(await solveWithHints(page), 'level 1 solved');
    assert.match(await page.locator('.dialog h3').textContent(), /!/);
    const moves = Number(await page.locator('[data-moves]').textContent());
    const par = await page.evaluate(() => window.__carJamPlay.level.par);
    assert.equal(moves, par, 'hints give a par solution');

    // On to level 2 via the dialog; progress is saved.
    await page.locator('[data-act=next]').click();
    await page.waitForFunction(() => location.hash === '#/car-jam/2');
    assert.ok(await solveWithHints(page), 'level 2 solved');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:car-jam:progress')));
    assert.equal(saved.unlocked, 3);
    assert.equal(saved.stars['1'], 3);

    // A bigger level with grannies, hedges and trucks runs cleanly too.
    await page.evaluate(() => localStorage.setItem('pocket-arcade:car-jam:progress', JSON.stringify({ unlocked: 25, stars: {} })));
    await page.goto(`http://localhost:${server.address().port}/#/car-jam/22`);
    await page.reload();
    await page.waitForFunction(() => window.__carJamPlay && location.hash === '#/car-jam/22');
    assert.ok(await solveWithHints(page), 'level 22 solved');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('after the first visit the app works fully offline', { skip: !chromium, timeout: 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = `http://localhost:${server.address().port}/`;
    await page.goto(url);
    // Wait for the service worker to finish precaching and take control.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      }
    });
    await context.setOffline(true);
    server.close();
    await page.reload();
    await page.locator('[data-game=car-jam]').click();
    await page.locator('.lvl[data-n="1"]').click();
    await page.waitForFunction(() => window.__carJamPlay && window.__carJamPlay.cars.length > 0);
    assert.equal(await page.locator('canvas.board').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

// Tap the middle of an arrow's tail cell in Tap Maze.
async function tapArrow(page, i) {
  const pt = await page.evaluate((i) => {
    const p = window.__tapMazePlay;
    const [x, y] = p.board.arrows[i].cells[0];
    const r = p.canvas.getBoundingClientRect();
    return { x: r.left + p.ox + (x + 0.5) * p.T, y: r.top + p.oy + (y + 0.5) * p.T };
  }, i);
  await page.mouse.click(pt.x, pt.y);
}

test('tap maze: blocked arrows cost a heart, clearing the board wins', { skip: !chromium, timeout: 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.locator('[data-game=tap-maze]').click();
    await page.locator('.lvl[data-n="1"]').click();
    await page.waitForFunction(() => window.__tapMazePlay);

    // Find an arrow that is blocked right now and tap it.
    const blocked = await page.evaluate(() => {
      const p = window.__tapMazePlay;
      for (let i = 0; i < p.alive.length; i++) {
        const ray = [];
        const { cells, dir } = p.board.arrows[i];
        let [x, y] = cells[cells.length - 1];
        for (x += dir[0], y += dir[1]; x >= 0 && y >= 0 && x < p.board.w && y < p.board.h; x += dir[0], y += dir[1]) ray.push(p.board.occ[y * p.board.w + x]);
        if (ray.some((j) => j >= 0 && j !== i)) return i;
      }
      return -1;
    });
    assert.ok(blocked >= 0, 'level 1 starts with a blocked arrow');
    await tapArrow(page, blocked);
    await page.waitForFunction(() => window.__tapMazePlay.hearts === 2 && window.__tapMazePlay.anims.size === 0);
    assert.equal(await page.locator('.hearts svg.lost').count(), 1, 'a bump costs a heart');
    assert.equal(await page.evaluate(() => window.__tapMazePlay.alive.filter(Boolean).length),
      await page.evaluate(() => window.__tapMazePlay.alive.length), 'blocked arrow stays');

    // Now clear the board using the hint each time.
    for (let guard = 0; guard < 200; guard++) {
      if (await page.locator('.dialog:not([hidden])').count()) break;
      const next = await page.evaluate(() => {
        const p = window.__tapMazePlay;
        if (p.anims.size || p.alive.every((a) => !a)) return -1;
        p.showHint();
        return p.hint ? p.hint.i : -1;
      });
      if (next >= 0) await tapArrow(page, next);
      await page.waitForTimeout(150);
    }
    await page.locator('.dialog:not([hidden])').waitFor();
    assert.equal(await page.locator('.dialog .stars i.on').count(), 2, 'stars = hearts left');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:tap-maze:progress')));
    assert.equal(saved.unlocked, 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('analytics events recorded offline are sent once back online', { skip: !chromium, timeout: 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Stand-in for gtag.js so the test never talks to Google.
    let gtagLoads = 0;
    await context.route('https://www.googletagmanager.com/**', (route) => {
      gtagLoads++;
      route.fulfill({ contentType: 'text/javascript', body: 'window.__gtagLoaded = true;' });
    });
    const page = await context.newPage();
    const url = `http://localhost:${server.address().port}/`;
    // First visit installs the offline cache.
    await page.goto(url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      }
      localStorage.setItem('pocket-arcade:analytics-test', 'true');
    });
    // Later the app is opened and played with no connection.
    await context.setOffline(true);
    await page.reload();
    await page.locator('[data-game=car-jam]').click();
    await page.locator('.lvl[data-n="1"]').click();
    await page.waitForFunction(() => window.__carJamPlay);
    const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:analytics-queue')).map((e) => e.name));
    assert.ok(queued.includes('level_start'), `queued while offline: ${queued}`);

    await context.setOffline(false);
    await page.waitForFunction(() => window.__gtagLoaded &&
      JSON.parse(localStorage.getItem('pocket-arcade:analytics-queue')).length === 0);
    const sent = await page.evaluate(() => window.dataLayer.filter((a) => a[0] === 'event').map((a) => [a[1], a[2]]));
    const names = sent.map(([n]) => n);
    assert.ok(names.includes('app_open') && names.includes('level_start') && names.includes('page_view'), names.join());
    assert.equal(sent.find(([n]) => n === 'level_start')[1].game, 'car-jam');
    assert.ok(gtagLoads >= 1);
  } finally {
    await browser.close();
    server.close();
  }
});

test('home screen shows the version; a new deploy prompts the installed app to update', { skip: !chromium, timeout: 60000 }, async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const { version } = JSON.parse(await rf(new URL('../package.json', import.meta.url), 'utf8'));
  const overrides = new Map();
  const delays = new Map();
  const server = await serve(overrides, delays);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${server.address().port}/`);
    assert.equal(await page.locator('.hub-foot .version').textContent(), `v${version}`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      }
    });

    // "Deploy" version 99.0.0: same files, new precache manifest.
    const manifest = await rf(new URL('../sw-manifest.js', import.meta.url), 'utf8');
    overrides.set('/sw-manifest.js', manifest
      .replace(/"appVersion": "[^"]+"/, '"appVersion": "99.0.0"')
      .replace(/"version": "[^"]+"/, '"version": "test-new-deploy"'));
    overrides.set('/sw.js', (await rf(new URL('../sw.js', import.meta.url), 'utf8')) + '\n// new deploy\n');
    // Hold back one file so the download is still in progress when we look.
    delays.set('/games/tap-maze/model.js', 2500);
    // Coming back to the app triggers an update check.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const bar = page.locator('.update-bar');
    await page.locator('.update-bar[data-state=downloading] .progress-fill').waitFor({ timeout: 20000 });
    assert.match(await bar.textContent(), /Downloading version 99\.0\.0/);
    assert.match(await bar.textContent(), /\d+ of \d+ files/);
    const width = await page.locator('.update-bar .progress-fill').evaluate((el) => parseFloat(el.style.width));
    assert.ok(width > 0 && width < 100, `progress part-way: ${width}%`);
    // Then it turns into the Update prompt.
    await page.locator('.update-bar[data-state=ready]').waitFor({ timeout: 20000 });
    assert.match(await bar.textContent(), /New version 99\.0\.0/);
    assert.match(await bar.textContent(), new RegExp(`You have v${version.replace(/\./g, '\\.')}`));

    // Update installs it and reloads into the new version.
    await Promise.all([page.waitForEvent('load'), bar.locator('.install-now').click()]);
    const active = await page.evaluate(() => new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(e.data);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    }));
    assert.equal(active, '99.0.0');
  } finally {
    await browser.close();
    server.close();
  }
});
