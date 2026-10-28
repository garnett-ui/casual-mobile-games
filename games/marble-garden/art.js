// Card illustration for the arcade hub: a sunny lawn with a sandy path
// curving across it, a chain of marbles rolling along, and the gnome on his
// toadstool with a marble in his hands, a dotted line showing where it
// will go.
import { paintMarble, paintGnome, MARBLES } from './play.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const r = H * 0.07; // a marble's radius

  // The lawn, in stripes.
  ctx.fillStyle = '#8fd16a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (let y = 0; y < H; y += H * 0.16) ctx.fillRect(0, y, W, H * 0.08);
  // The path: a curve in from the top right, round the bottom and off to
  // the left.
  const way = () => {
    ctx.beginPath();
    ctx.moveTo(W * 1.05, H * 0.1);
    ctx.bezierCurveTo(W * 0.75, H * 0.12, W * 0.95, H * 0.95, W * 0.5, H * 0.92);
    ctx.bezierCurveTo(W * 0.2, H * 0.9, W * 0.08, H * 0.6, W * -0.05, H * 0.55);
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#c9b07a';
  ctx.lineWidth = r * 2.9;
  way();
  ctx.stroke();
  ctx.strokeStyle = '#ecd9a6';
  ctx.lineWidth = r * 2.5;
  way();
  ctx.stroke();
  // Marbles along it (the curve sampled by hand).
  const at = (t) => {
    // Two Béziers, t from 0 to 2.
    const b = (p0, p1, p2, p3, u) => (1 - u) ** 3 * p0 + 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u * u * p2 + u ** 3 * p3;
    if (t < 1) return [b(W * 1.05, W * 0.75, W * 0.95, W * 0.5, t), b(H * 0.1, H * 0.12, H * 0.95, H * 0.92, t)];
    const u = t - 1;
    return [b(W * 0.5, W * 0.2, W * 0.08, W * -0.05, u), b(H * 0.92, H * 0.9, H * 0.6, H * 0.55, u)];
  };
  const colours = [2, 2, 0, 1, 1, 3, 4, 4, 0, 3, 2];
  colours.forEach((c, k) => {
    const [x, y] = at(0.14 + k * 0.155);
    ctx.save();
    ctx.translate(x, y);
    paintMarble(ctx, MARBLES[c], r * 0.95);
    ctx.restore();
  });
  // The gnome, up and to the left, aiming at the chain, the guide dotted.
  const gx = W * 0.36;
  const gy = H * 0.42;
  const aim = Math.atan2(at(0.6)[0] - gx, gy - at(0.6)[1]);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.setLineDash([r * 0.3, r * 0.6]);
  ctx.beginPath();
  ctx.moveTo(gx + Math.sin(aim) * r * 2.6, gy - Math.cos(aim) * r * 2.6);
  ctx.lineTo(gx + Math.sin(aim) * r * 7, gy - Math.cos(aim) * r * 7);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(gx, gy);
  paintGnome(ctx, r * 0.9, aim, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(gx + Math.sin(aim) * r * 1.2, gy - Math.cos(aim) * r * 1.2);
  paintMarble(ctx, MARBLES[1], r * 0.9);
  ctx.restore();
}
