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

function serve() {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
