// Card illustration for the arcade hub: a corner of Benji's Town in 3D -- a
// street with a crosswalk, a house with its bin out, trees, and the garbage
// truck and the mail van on their way.
import * as I from './iso.js';

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
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#a9dcff');
  sky.addColorStop(1, '#e4f6ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const view = new I.View();
  Object.assign(view, { x: 2, y: 2, k: Math.min(W / 5, H / 2.6), ox: W / 2, oy: H * 0.55 });
  // A block of town: grass, and a street across and one down, with their
  // sidewalks.
  I.rect(g, view, -1, -1, 5, 5, '#8fd16a');
  I.rect(g, view, -1, 1.82, 5, 3.18, '#e1e4e9');
  I.rect(g, view, 1.82, -1, 3.18, 5, '#e1e4e9');
  I.rect(g, view, -1, 2, 5, 3, '#5d6470');
  I.rect(g, view, 2, -1, 3, 5, '#5d6470');
  for (let q = 0; q < 5; q++) I.rect(g, view, 1.6, 2.06 + q * 0.2, 1.9, 2.16 + q * 0.2, '#f8f9fa');
  for (let u = -1; u < 2; u += 0.32) I.rect(g, view, u, 2.475, u + 0.18, 2.525, '#f8f9fa');
  const things = [
    I.house(1.5, 1.4, Math.PI / 2, '#ffd166'),
    I.bin(1.5, 1.85),
    I.tree(0.3, 0.6),
    I.tree(3.6, 0.7, 0.9),
    I.tree(3.7, 3.8, 1),
    I.house(1.4, 3.7, -Math.PI / 2, '#4cc9f0'),
    I.vehicle('garbage', 0.6, 2.67, 0),
    I.vehicle('mail', 2.33, 0.9, Math.PI / 2),
  ];
  for (const m of things.sort((a, b) => view.depth(a.x, a.y) - view.depth(b.x, b.y))) I.paint(g, view, m.parts);
  return rect;
}
