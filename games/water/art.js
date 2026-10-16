// Card illustration for the arcade hub: Professor Fizz and his glassware.
import { vessel } from './shapes.js';
import { drawProfessor } from './professor.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16303f');
  g.addColorStop(1, '#22495c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const bench = H * 0.82;
  ctx.fillStyle = '#9aa5ad';
  ctx.fillRect(0, bench, W, H - bench);
  const items = [['flask', 8, 5, 0.42], ['cylinder', 5, 4, 0.62], ['round', 3, 1, 0.8]];
  for (const [shape, cap, fill, fx] of items) {
    const v = vessel(shape, cap);
    const h = H * 0.62 * (shape === 'cylinder' ? 1 : 0.8);
    const w = h * v.aspect;
    const x = W * fx;
    const pts = v.outline().map(([px, py]) => [x + px * w, bench - py * h]);
    const path = new Path2D();
    pts.forEach(([px, py], k) => (k ? path.lineTo(px, py) : path.moveTo(px, py)));
    path.closePath();
    ctx.save();
    ctx.clip(path);
    const wg = ctx.createLinearGradient(0, bench - h, 0, bench);
    wg.addColorStop(0, 'rgba(90,200,250,0.9)');
    wg.addColorStop(1, 'rgba(30,110,210,0.95)');
    ctx.fillStyle = wg;
    ctx.fillRect(x - w, bench - v.level(fill) * h, 2 * w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(235,248,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    for (let u = 1; u < cap; u++) {
      const y = bench - v.level(u) * h;
      const e = (v.width(v.level(u)) * w) / 2 - 2;
      ctx.beginPath();
      ctx.moveTo(x + e - 6, y);
      ctx.lineTo(x + e, y);
      ctx.stroke();
    }
  }
  drawProfessor(ctx, W * 0.17, bench + 2, H * 0.72, { t: 0.5, talk: 0.6, look: 1, mood: 'happy' });
  return rect;
}
