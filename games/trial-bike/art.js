// Card illustration for the arcade hub: the bike mid-jump over a dirt ramp,
// nose up, with the hills behind -- or, for an hour after the bike has
// flown over the cow on a tenth course, the cow herself, looking up.
import { paintBike, paintCow } from './play.js';
import { load } from '../../js/lib/storage.js';

const HOUR = 60 * 60 * 1000;

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#79c3ff');
  sky.addColorStop(0.8, '#d8ecff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Far hills.
  ctx.fillStyle = '#a9c9a0';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, H * 0.62 - 18 * Math.sin(x / 70) - 10 * Math.sin(x / 31 + 1));
  ctx.lineTo(W, H);
  ctx.fill();
  // The ground: a ramp up to a lip at a third of the way, then flat.
  const ground = (x) => {
    const lip = W * 0.38;
    if (x < lip - 70) return H * 0.82;
    if (x < lip) return H * 0.82 - 34 * (1 - Math.cos(((x - lip + 70) / 70) * Math.PI)) / 2;
    return H * 0.82;
  };
  ctx.fillStyle = '#8a5a2b';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, ground(x));
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.strokeStyle = '#5a9e3a';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, ground(x));
  ctx.stroke();
  // A flag, and the bike in the air past the lip (or the cow on the level
  // beyond it).
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.86, H * 0.82);
  ctx.lineTo(W * 0.86, H * 0.4);
  ctx.stroke();
  ctx.fillStyle = '#ffb703';
  ctx.beginPath();
  ctx.moveTo(W * 0.86, H * 0.4);
  ctx.lineTo(W * 0.86 + 22, H * 0.46);
  ctx.lineTo(W * 0.86, H * 0.52);
  ctx.fill();
  const scale = Math.min(48, H * 0.3);
  ctx.save();
  if (Date.now() - load('trial-bike:cow', 0) < HOUR) {
    ctx.translate(W * 0.6, H * 0.82);
    ctx.scale(scale * 1.3, -scale * 1.3);
    paintCow(ctx, 0, 1);
  } else {
    ctx.translate(W * 0.55, H * 0.42);
    ctx.rotate(-0.42);
    ctx.scale(scale, -scale);
    paintBike(ctx, { angle: 0, spin: 0.4 }, 0.6);
  }
  ctx.restore();
  return rect;
}
