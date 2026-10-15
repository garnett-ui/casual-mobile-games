// Renders icons/icon.svg to the PNG icons browsers, Android and iOS want,
// using the Chromium that ships with Playwright:  npm run icons
//
// The SVG has a background <rect id="bg"> and the artwork in <g id="art">.
// Variants:
//   any      rounded-square icon as drawn (Android launcher, browsers)
//   square   full-bleed square, art slightly smaller (iOS rounds it itself)
//   maskable full-bleed square, art inside the central safe zone so Android's
//            circle / squircle masks never clip it
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8');

function variant(kind) {
  if (kind === 'any') return svg;
  const scale = kind === 'maskable' ? 0.84 : 0.92;
  const shift = (512 * (1 - scale)) / 2;
  return svg
    .replace(/(<rect id="bg"[^>]*?) rx="\d+"/, '$1')
    .replace('<g id="art">', `<g id="art" transform="translate(${shift} ${shift}) scale(${scale})">`);
}

const targets = [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['favicon-32.png', 32, 'any'],
  ['apple-touch-icon.png', 180, 'square'],
  ['maskable-192.png', 192, 'maskable'],
  ['maskable-512.png', 512, 'maskable'],
];

writeFileSync(new URL('../icons/icon-maskable.svg', import.meta.url), variant('maskable'));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, kind] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const data = Buffer.from(variant(kind)).toString('base64');
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${data}" style="width:${size}px;height:${size}px;display:block">
    </body></html>`);
  await page.screenshot({ path: new URL(`../icons/${name}`, import.meta.url).pathname, omitBackground: true });
  console.log('wrote', name);
}
await browser.close();
