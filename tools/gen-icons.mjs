// Renders icons/icon.svg to the PNG sizes browsers and iOS want, using the
// Chromium that ships with Playwright.  node tools/gen-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const targets = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  // Maskable: full-bleed background, artwork inside the 80% safe zone.
  ['maskable-512.png', 512, 0.12],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, inset] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const pad = Math.round(size * inset);
  const fullBleed = inset > 0 || name.startsWith('apple');
  await page.setContent(`<html><body style="margin:0;background:${fullBleed ? '#232650' : 'transparent'}">
    <div style="padding:${pad}px;width:${size}px;height:${size}px;box-sizing:border-box">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:100%;height:100%;display:block">
    </div></body></html>`);
  await page.screenshot({
    path: new URL(`../icons/${name}`, import.meta.url).pathname,
    omitBackground: !fullBleed,
  });
  console.log('wrote', name);
}
await browser.close();
