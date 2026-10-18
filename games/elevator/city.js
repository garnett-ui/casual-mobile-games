// Ambience, on a big screen: the city either side of the game's buildings.
// Just scenery -- nothing to tap, no lifts -- windows lighting up and going
// dark through the day (more at night), and now and then someone passing
// behind a lit window.

import { rng } from '../../js/lib/random.js';

const STONE = ['#8d8a99', '#a49a8c', '#7d8794', '#9b8577', '#6f7b86', '#b0a796'];

// Buildings to fill each [x0, x1] stretch of street (y is the street).
export function cityscape(stretches, street, H) {
  const r = rng(7);
  const city = [];
  for (const [a, b] of stretches) {
    if (b - a < 30) continue;
    let x = a + 4;
    while (x < b - 24) {
      const w = Math.min(b - 4 - x, 50 + r() * 90);
      if (w < 24) break;
      const h = street * (0.25 + r() * 0.55);
      const win = Math.max(6, Math.min(12, w / 8));
      city.push({ x, w, h, top: street - h, street, H, colour: STONE[Math.floor(r() * STONE.length)], win, seed: Math.floor(r() * 1e6) });
      x += w + 6 + r() * 14;
    }
  }
  return city;
}

// A repeatable "random" number in 0..1 for these integers.
function hash(...ns) {
  let h = 2166136261;
  for (const n of ns) h = Math.imul(h ^ (n | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function drawCity(ctx, city, mins, time) {
  if (!city?.length) return;
  // How many windows are lit: a few by day, most at dusk, fewer late.
  const lit = mins < 7.5 * 60 ? 0.35 : mins < 17 * 60 ? 0.15 : mins < 19 * 60 ? 0.5 : 0.6;
  const dark = Math.min(1, Math.max(0, (mins - 18.5 * 60) / 60));
  for (const b of city) {
    // The ground and pavement in front.
    ctx.fillStyle = '#6b5641';
    ctx.fillRect(b.x - 6, b.street, b.w + 26, b.H - b.street);
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(b.x - 6, b.street - 3, b.w + 26, 4);
    // The building, a little hazy (it's further off).
    ctx.fillStyle = b.colour;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(b.x, b.top, b.w, b.h - 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x, b.top, b.w, 3);
    ctx.globalAlpha = 1;
    // Windows.
    const cols = Math.max(1, Math.floor((b.w - b.win) / (b.win * 1.8)));
    const rows = Math.max(1, Math.floor((b.h - b.win * 2) / (b.win * 2)));
    const gx = (b.w - cols * b.win) / (cols + 1);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = b.x + gx + i * (b.win + gx);
        const y = b.top + b.win + j * b.win * 2;
        // Each window on or off for a while, then maybe changing.
        const period = 25 + hash(b.seed, i, j) * 60; // minutes of the day
        const on = hash(b.seed, i, j, Math.floor((mins + hash(b.seed, j, i) * period) / period)) < lit;
        ctx.fillStyle = on ? '#ffd98a' : dark > 0 ? `rgba(30,36,60,${0.5 + 0.5 * dark})` : 'rgba(150,190,220,0.75)';
        ctx.fillRect(x, y, b.win, b.win * 1.2);
        // Someone passing behind a lit window, now and then.
        if (on && hash(b.seed, i, j, 7) < 0.25) {
          const u = (time * 0.15 + hash(b.seed, j, i, 3)) % 1.6;
          if (u < 1) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, b.win, b.win * 1.2);
            ctx.clip();
            const px = x - b.win * 0.4 + u * b.win * 1.6;
            ctx.fillStyle = 'rgba(60,40,30,0.75)';
            ctx.beginPath();
            ctx.arc(px, y + b.win * 0.5, b.win * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(px - b.win * 0.22, y + b.win * 0.68, b.win * 0.44, b.win * 0.6);
            ctx.restore();
          }
        }
      }
    }
  }
}
