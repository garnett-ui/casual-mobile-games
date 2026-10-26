// Card illustration for the arcade hub: the seven pieces drifting apart
// from their square, beside a cat made of them.
import { figure, shape } from './model.js';
import { COLORS } from './play.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  g.fillStyle = '#f3ead7';
  g.fillRect(0, 0, W, H);
  const fill = (pts, x0, y0, s, color) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x0 + x * s, y0 + y * s) : g.moveTo(x0 + x * s, y0 + y * s)));
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  // The cat, in silhouette.
  const cat = figure(4);
  const s1 = (H * 0.78) / cat.h;
  for (const p of cat.polys) fill(p, W * 0.66, H * 0.11, s1, '#2b2d42');
  // The square, coming apart: each piece pushed out from the middle.
  const sq = figure(12);
  const s2 = (H * 0.62) / sq.h;
  const c = sq.w / 2;
  sq.slots.forEach((slot, i) => {
    const p = { ...slot, x: slot.x + (slot.x - c) * 0.22, y: slot.y + (slot.y - c) * 0.22 };
    const pts = shape(p);
    fill(pts, W * 0.12, H * 0.16, s2, COLORS[i]);
    g.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    g.lineWidth = 1;
    g.stroke();
  });
  return rect;
}
