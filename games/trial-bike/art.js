// Card illustration for the arcade hub: golden hour over the meadow, the
// bike flying nose-up off a kicker with a flare bursting behind it -- and,
// for an hour after the bike has flown over the cow on a tenth course, the
// cow herself under it, looking up.
import { paintBike, paintCow } from './play.js';
import { load } from '../../js/lib/storage.js';

const HOUR = 60 * 60 * 1000;
// The game's own golden-hour grading: sky top to horizon, the sun, the far
// and near hills, the dirt and its grass.
const SKY = ['#2b2f66', '#d97a4a'];
const SUN = '#ff9a3c';
const HILLS = ['#4f7a68', '#355f45'];
const DIRT = ['#5a3820', '#2c1a0e'];
const GRASS = '#4f8f2a';
const FLARE = ['#e63946', '#ffb347'];

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const cow = Date.now() - load('trial-bike:cow', 0) < HOUR;

  // Sky, a low sun with its glow, and two ranges of hills in haze.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, SKY[0]);
  sky.addColorStop(0.85, SKY[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.78, H * 0.38, 4, W * 0.78, H * 0.38, H * 0.45);
  glow.addColorStop(0, 'rgba(255,154,60,.55)');
  glow.addColorStop(1, 'rgba(255,154,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = SUN;
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.38, H * 0.07, 0, Math.PI * 2);
  ctx.fill();
  const hills = (colour, base, amp, freq, phase) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) ctx.lineTo(x, base - amp * (0.6 * Math.sin(x / freq + phase) + 0.4 * Math.sin(x / (freq * 0.43) + 1)));
    ctx.lineTo(W, H);
    ctx.fill();
  };
  hills(HILLS[0], H * 0.66, 14, 60, 0);
  hills(HILLS[1], H * 0.74, 10, 38, 2);

  // The ground: a kicker a third of the way along, flat beyond it.
  const lip = W * 0.36;
  const ground = (x) => {
    if (x < lip - 64) return H * 0.84;
    if (x < lip) return H * 0.84 - 30 * ((x - lip + 64) / 64) ** 1.5;
    return H * 0.84;
  };
  const dirt = ctx.createLinearGradient(0, H * 0.7, 0, H);
  dirt.addColorStop(0, DIRT[0]);
  dirt.addColorStop(1, DIRT[1]);
  ctx.fillStyle = dirt;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, ground(x));
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.strokeStyle = GRASS;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, ground(x));
  ctx.stroke();
  // The flag by the finish.
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.88, H * 0.84);
  ctx.lineTo(W * 0.88, H * 0.46);
  ctx.stroke();
  ctx.fillStyle = FLARE[1];
  ctx.beginPath();
  ctx.moveTo(W * 0.88, H * 0.46);
  ctx.lineTo(W * 0.88 + 20, H * 0.52);
  ctx.lineTo(W * 0.88, H * 0.58);
  ctx.fill();

  const scale = Math.min(46, H * 0.29);
  // A flare bursting behind the bike, then the bike itself, nose up at the
  // top of its flight -- over the cow, grazing where it will come down, on
  // the hour she's earned.
  const bx = W * 0.5;
  const by = H * 0.4;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const len = H * (0.08 + 0.05 * (i % 3));
    ctx.strokeStyle = FLARE[i % 2];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 40 + Math.cos(a) * len * 0.4, by - 20 + Math.sin(a) * len * 0.4);
    ctx.lineTo(bx + 40 + Math.cos(a) * len, by - 20 + Math.sin(a) * len);
    ctx.stroke();
  }
  if (cow) {
    ctx.save();
    ctx.translate(W * 0.71, H * 0.84);
    ctx.scale(scale * 0.68, -scale * 0.68);
    paintCow(ctx, 0, 1);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(-0.5);
  ctx.scale(scale, -scale);
  paintBike(ctx, { angle: 0, spin: 0.4 }, 0.7);
  ctx.restore();
  // The game's vignette, so the card sits with the screens behind it.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  return rect;
}
