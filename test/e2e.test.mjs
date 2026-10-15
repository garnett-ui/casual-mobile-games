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

test('updates: progress on the home screen only, Update installs the newest, nothing switches by itself', { skip: !chromium, timeout: 90000 }, async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const { version } = JSON.parse(await rf(new URL('../package.json', import.meta.url), 'utf8'));
  const manifest = await rf(new URL('../sw-manifest.js', import.meta.url), 'utf8');
  const swSource = await rf(new URL('../sw.js', import.meta.url), 'utf8');
  const overrides = new Map();
  const delays = new Map();
  const server = await serve(overrides, delays);
  // "Deploy" a new version: same files, new precache manifest and worker.
  const deploy = (v) => {
    overrides.set('/sw-manifest.js', manifest
      .replace(/"appVersion": "[^"]+"/, `"appVersion": "${v}"`)
      .replace(/"version": "[^"]+"/, `"version": "deploy-${v}"`));
    overrides.set('/sw.js', `${swSource}\n// deploy ${v}\n`);
  };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const base = `http://localhost:${server.address().port}/`;
    await page.goto(base);
    assert.match(await page.locator('.hub-foot .version').textContent(), new RegExp(`^v${version.replace(/\./g, '\\.')}`));
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      }
    });
    const active = () => page.evaluate(() => new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(e.data);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION', client: 'test' }, [ch.port2]);
    }));
    const waiting = () => page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg.waiting) return null;
      return new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data);
        reg.waiting.postMessage({ type: 'GET_VERSION', client: 'test' }, [ch.port2]);
      });
    });
    const bar = page.locator('.update-bar');

    // 1. Version 99 downloads (slowly) with a progress bar on the home screen.
    deploy('99.0.0');
    delays.set('/games/tap-maze/model.js', 2500);
    await page.locator('.hub-foot .version').click();
    await page.locator('.update-bar[data-state=downloading] .progress-fill').waitFor({ timeout: 20000 });
    assert.match(await bar.textContent(), /Downloading update v99\.0\.0/);
    assert.match(await bar.textContent(), new RegExp(`You have v${version.replace(/\./g, '\\.')} · \\d+ of \\d+ files`));
    // ...but never over a game.
    await page.locator('[data-game=breakout]').click();
    await page.locator('.bo-choice').first().waitFor();
    assert.equal(await bar.count(), 0, 'no update bar inside a game');
    await page.locator('[data-act=home]').click();
    await page.locator('.update-bar[data-state=ready]').waitFor({ timeout: 20000 });
    assert.match(await bar.textContent(), /Version 99\.0\.0 is ready/);
    assert.equal(await page.locator('.update-bar .install-now').textContent(), 'Update to v99.0.0');
    assert.doesNotMatch(await bar.textContent(), /install/i);
    delays.clear();

    // 2. A newer version arrives while 99 is waiting. Update must install the
    //    newest one (this used to do nothing).
    deploy('100.0.0');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    for (let k = 0; k < 100 && (await waiting()) !== '100.0.0'; k++) await page.waitForTimeout(200);
    assert.equal(await waiting(), '100.0.0');
    await Promise.all([page.waitForEvent('load'), page.locator('.update-bar .install-now').click()]);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert.equal(await active(), '100.0.0');

    // 3. A version that downloads while you play never interrupts the game,
    //    and restarting the app doesn't switch either: it waits on the home
    //    screen for you to tap Update.
    await page.locator('[data-game=breakout]').click();
    await page.locator('.bo-choice').first().waitFor();
    await page.evaluate(() => (window.__stillHere = true));
    deploy('101.0.0');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    for (let k = 0; k < 100 && (await waiting()) !== '101.0.0'; k++) await page.waitForTimeout(200);
    assert.equal(await waiting(), '101.0.0');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__stillHere), true, 'the game was not reloaded');
    assert.equal(await page.locator('.update-bar').count(), 0);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForTimeout(800);
    assert.equal(await active(), '100.0.0', 'restarting did not switch versions');
    await page.goto(base);
    await page.locator('.update-bar[data-state=ready]').waitFor({ timeout: 20000 });
    assert.equal(await page.locator('.update-bar .install-now').textContent(), 'Update to v101.0.0');
    await Promise.all([page.waitForEvent('load'), page.locator('.update-bar .install-now').click()]);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert.equal(await active(), '101.0.0');
  } finally {
    await browser.close();
    server.close();
  }
});

test('breakout: locks orientation where possible, pauses on rotation where not', { skip: !chromium, timeout: 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const url = `http://localhost:${server.address().port}/#/breakout`;
    const errors = [];

    // A phone that allows locking: record what we lock to.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__locks = [];
      screen.orientation.lock = async (kind) => window.__locks.push(kind);
      screen.orientation.unlock = () => window.__locks.push('unlock');
    });
    await page.goto(url);
    await page.locator('.bo-choice[data-kind=landscape]').click();
    await page.waitForFunction(() => window.__breakout);
    assert.deepEqual(await page.evaluate(() => window.__locks), ['landscape']);
    // The lock turns the screen sideways.
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal(await page.evaluate(() => window.__breakout.game.L.cols), 14);
    // The paddle sits high enough to leave thumb room (~1.3 cm) below it.
    const gap = async (p) => p.evaluate(() => {
      const b = window.__breakout;
      const r = b.canvas.getBoundingClientRect();
      const bottom = r.top + b.oy + (b.game.paddle.y + b.game.paddle.h) * b.scale;
      return window.innerHeight - bottom;
    });
    await page.waitForFunction(() => {
      const b = window.__breakout;
      const r = b.canvas.getBoundingClientRect();
      return window.innerHeight - (r.top + b.oy + (b.game.paddle.y + b.game.paddle.h) * b.scale) >= 49;
    }, null, { timeout: 5000 }).catch(() => {});
    assert.ok(await gap(page) >= 49, `room below paddle: ${await gap(page)}px`);
    // Play a little on autopilot: bricks break and the score goes up.
    await page.evaluate(() => (window.__breakout.autopilot = true));
    await page.waitForFunction(() => window.__breakout.game.score > 0, null, { timeout: 20000 });
    assert.ok(Number(await page.locator('[data-score]').textContent()) > 0);
    // Leaving the game releases the lock.
    await page.locator('[data-act=menu]').click();
    assert.equal(await page.evaluate(() => window.__locks.at(-1)), 'unlock');
    await page.close();

    // A phone that can't lock (like iOS): rotating mid-game pauses it.
    const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.addInitScript(() => {
      screen.orientation.lock = () => Promise.reject(new Error('NotSupportedError'));
    });
    await p2.goto(url);
    await p2.locator('.bo-choice[data-kind=portrait]').click();
    await p2.waitForFunction(() => window.__breakout);
    await p2.evaluate(() => (window.__breakout.autopilot = true));
    await p2.waitForTimeout(500);
    await p2.setViewportSize({ width: 844, height: 390 });
    await p2.locator('.bo-overlay:not([hidden])').waitFor();
    assert.match(await p2.locator('.bo-overlay').textContent(), /Turn your phone back to portrait/);
    assert.equal(await p2.evaluate(() => window.__breakout.paused), true);
    const frozen = await p2.evaluate(() => ({ ...window.__breakout.game.ball }));
    await p2.waitForTimeout(300);
    assert.deepEqual(await p2.evaluate(() => ({ ...window.__breakout.game.ball })), frozen, 'ball frozen while paused');
    // Turn back: tap to carry on.
    await p2.setViewportSize({ width: 390, height: 844 });
    await p2.waitForFunction(() => document.querySelector('.bo-overlay').textContent.includes('Tap to continue'));
    await p2.locator('.bo-overlay').click();
    assert.equal(await p2.evaluate(() => window.__breakout.paused), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('lunar lander: thrust button lifts off, a landing scores, a crash explodes', { skip: !chromium, timeout: 90000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.locator('[data-game=lander]').click();
    await page.locator('.lvl[data-n="1"]').click();
    await page.waitForFunction(() => window.__lander);

    // Hold THRUST with a real pointer: the lander leaves the pad.
    const btn = await page.locator('.ll-thrust').boundingBox();
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => window.__lander.L.landed === null && window.__lander.L.y > window.__lander.level.startPad.y + 2);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__lander.input.thrust), false, 'releasing stops the engine');

    // Climb hard: the view keeps the lander below the instrument panel.
    const hidden = await page.evaluate(async () => {
      const p = window.__lander;
      p.L.fuel = p.L.fuelMax;
      p.timeScale = 4;
      p.input.thrust = true;
      let worst = Infinity;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const cam = p.camera();
        const top = p.cssH - (p.L.y + 5.2 - cam.bottom) * cam.scale;
        worst = Math.min(worst, top - p.panelBottom);
      }
      p.input.thrust = false;
      return worst;
    });
    assert.ok(hidden >= 0, `lander stays clear of the panel (${hidden.toFixed(1)} px)`);

    // Let the autopilot fly the rest, fast-forwarded. Top the tank back up
    // first: on a slow test machine the button may have been held a long
    // time, and this test is about landing, not fuel.
    await page.evaluate(async () => {
      const m = await import('/games/lander/engine.js');
      const p = window.__lander;
      p.L.fuel = p.L.fuelMax;
      p.timeScale = 6;
      p.pilot = m.autopilot;
    });
    await page.locator('.dialog:not([hidden])').waitFor({ timeout: 60000 });
    assert.match(await page.locator('.dialog h3').textContent(), /landed|landing|piece/i);
    assert.ok(await page.locator('.dialog .ll-score').count());
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:lander:progress')));
    assert.equal(saved.unlocked, 2);

    // Fly again and crash on purpose.
    await page.evaluate(() => (window.__lander.pilot = null));
    await page.locator('[data-act=replay]').click();
    await page.evaluate(() => {
      const p = window.__lander;
      p.L.landed = null;
      p.L.y += 60;
      p.L.vy = -20;
    });
    await page.waitForFunction(() => window.__lander.L.crashed);
    assert.ok(await page.evaluate(() => window.__lander.debris.length > 5 && window.__lander.particles.length > 20), 'fireball and wreckage');
    await page.locator('.dialog:not([hidden])').waitFor({ timeout: 10000 });
    assert.match(await page.locator('.dialog h3').textContent(), /Crashed/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('jigsaw: pick a photo, it is saved, pieces snap into place, progress resumes', { skip: !chromium, timeout: 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A test "photo": render a colourful picture to PNG.
    const shot = await browser.newPage({ viewport: { width: 640, height: 480 } });
    await shot.setContent('<body style="margin:0;background:linear-gradient(45deg,#f72585,#4361ee,#4cc9f0)"><h1 style="font:80px sans-serif;color:#fff;margin:150px 60px">Hello!</h1></body>');
    const png = await shot.screenshot();
    await shot.close();

    await page.goto(`http://localhost:${server.address().port}/`);
    await page.locator('[data-game=jigsaw]').click();
    await page.locator('.jg-sizes button[data-n="24"]').click();
    await page.locator('input[data-src=gallery]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => window.__jigsaw && window.__jigsaw.pieces.length > 0);
    const n = await page.evaluate(() => window.__jigsaw.pieces.length);
    assert.ok(n >= 20 && n <= 30, `about 24 pieces (${n})`);

    // Pieces start scrambled and turned.
    const turned = await page.evaluate(() => window.__jigsaw.pieces.filter((p) => p.rot !== 0).length);
    assert.ok(turned > n / 2, `most pieces start turned (${turned}/${n})`);

    // A turned piece dropped on its spot doesn't fit; tapping turns it, and
    // once it's the right way up it snaps in.
    const geo = () => page.evaluate(() => {
      const p = window.__jigsaw;
      const piece = p.pieces.find((q) => q.rot !== 0 && !q.placed);
      const idx = p.pieces.indexOf(piece);
      p.order = [...p.order.filter((i) => i !== idx), idx]; // on top
      const at = p.pos(piece);
      const home = p.home(piece);
      const r = p.canvas.getBoundingClientRect();
      return { idx, rot: piece.rot, from: [r.left + at.x + p.pw / 2, r.top + at.y + p.ph / 2], to: [r.left + home.x + p.pw / 2 + 4, r.top + home.y + p.ph / 2 - 3] };
    });
    const drag = await geo();
    await page.mouse.move(...drag.from);
    await page.mouse.down();
    await page.mouse.move(...drag.to, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('[data-placed]').textContent(), '0', 'turned piece does not fit');
    for (let k = drag.rot; k < 4; k++) {
      await page.mouse.click(...drag.to);
      await page.waitForTimeout(80);
    }
    assert.equal(await page.locator('[data-placed]').textContent(), '1');
    assert.equal(await page.evaluate((i) => window.__jigsaw.pieces[i].placed, drag.idx), true);

    // Two neighbours put together away from their spot (turned the same
    // way) lock into one piece...
    const pair = await page.evaluate(() => {
      const p = window.__jigsaw;
      const a = p.pieces.find((q) => !q.placed && q.col + 1 < p.cols && !p.at(q.row, q.col + 1).placed);
      const b = p.at(a.row, a.col + 1);
      for (const q of [a, b]) {
        q.rot = q.turn = 1;
        p.renderPiece(q);
      }
      p.setCentre(a, p.W * 0.35, p.H * 0.25);
      const want = p.beside(a, b);
      p.setCentre(b, want.x + 50, want.y + 60);
      const ia = p.pieces.indexOf(a);
      const ib = p.pieces.indexOf(b);
      p.order = [...p.order.filter((i) => i !== ia && i !== ib), ia, ib];
      p.dirty = true;
      const r = p.canvas.getBoundingClientRect();
      const cb = p.centre(b);
      return { ia, ib, from: [r.left + cb.x, r.top + cb.y], to: [r.left + want.x + 5, r.top + want.y - 4] };
    });
    await page.mouse.move(...pair.from);
    await page.mouse.down();
    await page.mouse.move(...pair.to, { steps: 8 });
    await page.mouse.up();
    const grouped = await page.evaluate(({ ia, ib }) => {
      const p = window.__jigsaw;
      return p.pieces[ia].group !== 0 && p.pieces[ia].group === p.pieces[ib].group;
    }, pair);
    assert.equal(grouped, true, 'locked together');
    // ...and then drag as one.
    const grab = await page.evaluate(({ ia }) => {
      const p = window.__jigsaw;
      const r = p.canvas.getBoundingClientRect();
      const c = p.centre(p.pieces[ia]);
      return [r.left + c.x, r.top + c.y];
    }, pair);
    await page.mouse.move(...grab);
    await page.mouse.down();
    await page.mouse.move(grab[0] + 40, grab[1] + 30, { steps: 6 });
    await page.mouse.up();
    const together = await page.evaluate(({ ia, ib }) => {
      const p = window.__jigsaw;
      const a = p.pieces[ia];
      const b = p.pieces[ib];
      const want = p.beside(a, b);
      const c = p.centre(b);
      return Math.hypot(c.x - want.x, c.y - want.y);
    }, pair);
    assert.ok(together < 0.5, `still locked together after the drag (${together})`);

    // Pinch with two fingers to zoom the table.
    const box = await page.locator('.jg-screen canvas').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const at = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(30) });
    for (const d of [45, 60, 75, 90]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const zoom = await page.evaluate(() => window.__jigsaw.view.s);
    assert.ok(zoom > 2.5 && zoom < 3.5, `zoomed in about 3x (${zoom})`);
    // ...and back out.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(90) });
    for (const d of [60, 40, 25]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => window.__jigsaw.view.s), 1);

    // The clock only counts time you're actually at it: it pauses after
    // 30 seconds without a touch.
    const paused = await page.evaluate(async () => {
      const p = window.__jigsaw;
      p.lastTouch = performance.now() - 31000;
      const t0 = p.time();
      await new Promise((r) => setTimeout(r, 400));
      const still = p.time() === t0 && p.idle();
      p.touch();
      await new Promise((r) => setTimeout(r, 400));
      return still && p.time() > t0;
    });
    assert.equal(paused, true);

    // The picture is hidden; Peek shows it only while held.
    const peekBox = await page.locator('[data-act=peek]').boundingBox();
    await page.mouse.move(peekBox.x + peekBox.width / 2, peekBox.y + peekBox.height / 2);
    await page.mouse.down();
    assert.equal(await page.evaluate(() => window.__jigsaw.peek), true);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__jigsaw.peek), false);

    // Leave and come back: the photo is saved and the puzzle can be continued.
    await page.locator('[data-act=menu]').click();
    await page.locator('[data-list=photos] .jg-tile').first().waitFor();
    assert.equal(await page.locator('[data-list=photos] .jg-tile').count(), 1);
    await page.locator('.jg-continue button').click();
    await page.waitForFunction(() => window.__jigsaw && window.__jigsaw.placedCount() === 1);

    // Finish it.
    await page.evaluate(() => {
      const p = window.__jigsaw;
      for (const piece of p.pieces) if (!piece.placed) p.place(piece);
    });
    await page.locator('.dialog:not([hidden])').waitFor();
    assert.match(await page.locator('.dialog h3').textContent(), /Puzzle complete/);
    assert.equal(await page.locator('.dialog .jg-chart path').count(), 2, 'a chart of progress over time');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('night driver: two thumbs at once, a fork read right, a wrong turn, game over', { skip: !chromium, timeout: 120000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.locator('[data-game=night-driver]').click();
    await page.locator('.dialog [data-act=start]').click();

    // Right thumb holds GAS while the left thumb drags the wheel: real
    // multi-touch, through the browser's touch input.
    const gas = await page.locator('.nd-gas').boundingBox();
    const wheel = await page.locator('.nd-steer').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const g = { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 };
    const w = { x: wheel.x + wheel.width / 2, y: wheel.y + wheel.height / 2, id: 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [g] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [g, w] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [g, { ...w, x: w.x + i * 12 }] });
    }
    const held = await page.evaluate(() => ({ ...window.__nightDriver.input }));
    assert.equal(held.gas, true);
    assert.ok(held.steer > 0.5, `steering right (${held.steer})`);
    await page.waitForFunction(() => window.__nightDriver.car.v > 3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => !window.__nightDriver.input.gas && window.__nightDriver.input.steer === 0);

    // Let it drive itself (fast) to the first fork: it reads the sign right.
    await page.evaluate(() => {
      const p = window.__nightDriver;
      p.car.time = 900;
      p.car.x = p.road.center(p.car.z);
      p.autopilot = true;
      p.timeScale = 6;
    });
    await page.waitForFunction(() => window.__nightDriver.road.forks[0]?.side, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__nightDriver.road.forks[0].side === window.__nightDriver.road.forks[0].safe), true);
    assert.equal(await page.evaluate(() => window.__nightDriver.car.goodCalls), 1);

    // Now take the wrong road: it ends in the hazard the sign warned of.
    const hazard = await page.evaluate(() => {
      const p = window.__nightDriver;
      p.pilotOpts = { wrong: true, speed: 25 }; // (too slow to jump a drawbridge)
      p.road.extend(p.car.z + 6000);
      return p.road.forks[1].hazard;
    });
    await page.waitForFunction(() => window.__nightDriver.car.crashes > 0, null, { timeout: 60000 });
    const { CRASH_LINES } = await import('../games/night-driver/signs.js');
    // (After a fall, the line shows once you hit the bottom.)
    await page.waitForFunction((t) => window.__nightDriver.message?.title === t, CRASH_LINES[hazard][0], { timeout: 30000 });

    // Out of time: coast to a stop and see the score.
    await page.evaluate(() => {
      const p = window.__nightDriver;
      p.autopilot = false;
      p.car.time = 0.5;
    });
    await page.locator('.dialog:not([hidden]) [data-act=again]').waitFor({ timeout: 60000 });
    assert.match(await page.locator('.dialog p').textContent(), /Score \d+/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('car jam: sending a car at a granny costs 2 moves', { skip: !chromium, timeout: 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${server.address().port}/#/car-jam/1`);
    await page.waitForFunction(() => window.__carJamPlay);
    await page.evaluate(async () => {
      const p = window.__carJamPlay;
      const { solve } = await import('/games/car-jam/model.js');
      // Make a granny step out in front of every car that leaves the lot.
      let once = true;
      const real = p.mergeBlocked.bind(p);
      p.mergeBlocked = (car) => (once ? ((once = false), 'granny') : real(car));
      const sol = solve(p.m, p.pos, 40000);
      for (const mv of sol.moves) {
        p.tryMove(mv.car, mv.sign);
        if (p.cars[mv.car].mode === 'exit') break;
      }
    });
    await page.waitForFunction(() => window.__carJamPlay.scares === 1);
    assert.equal((await page.locator('[data-penalty]').textContent()).trim(), '+2');
  } finally {
    await browser.close();
    server.close();
  }
});

test('about box: the version history, newest first', { skip: !chromium, timeout: 60000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const { readFile: rf } = await import('node:fs/promises');
    const { version } = JSON.parse(await rf(new URL('../package.json', import.meta.url), 'utf8'));
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.locator('[data-act=about]').click();
    const heads = await page.locator('.about-ver h5').allTextContents();
    assert.match(heads[0], new RegExp(`^v${version.replace(/\./g, '\\.')}`));
    assert.match(heads[0], /you have this/);
    assert.equal(heads.at(-1), 'v1.0.0');
    assert.ok(heads.length > 20);
    await page.locator('.about [data-act=close]').click();
    assert.equal(await page.locator('.about').count(), 0);
  } finally {
    await browser.close();
    server.close();
  }
});
