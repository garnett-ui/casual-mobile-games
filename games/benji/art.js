// Card illustration for the arcade hub: a corner of Benji's Town -- a
// street, a house with its bin out, and the garbage truck on its way.
import * as D from './draw.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  if (W <= 0 || H <= 0) return rect;
  const s = Math.min(H / 2.6, W / 4);
  D.grass(g, W, H);
  // A street across, and one down.
  const ry = H * 0.62;
  g.fillStyle = '#5d6470';
  g.fillRect(0, ry - s / 2, W, s);
  g.fillRect(W * 0.72 - s / 2, 0, s, H);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = Math.max(1.5, s * 0.05);
  g.setLineDash([s * 0.22, s * 0.18]);
  g.beginPath();
  g.moveTo(0, ry);
  g.lineTo(W, ry);
  g.stroke();
  g.setLineDash([]);
  D.tree(g, W * 0.12, H * 0.22, s);
  D.house(g, W * 0.38, ry - s * 0.95, s * 1.1, '#ffd166');
  D.bin(g, W * 0.5, ry - s * 0.6, s * 1.1);
  D.tree(g, W * 0.9, H * 0.2, s * 0.8);
  D.vehicle(g, 'garbage', W * 0.2, ry, s * 1.1, 1, 0);
  D.vehicle(g, 'mail', W * 0.72, H * 0.24, s * 0.9, -1, 0);
  return rect;
}
