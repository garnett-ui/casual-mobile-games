// Card illustration for the arcade hub: a little tangle of arrows.
import { drawArrow, COLORS } from './draw.js';

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
  g.addColorStop(0, '#3b2f8f');
  g.addColorStop(1, '#5b3fa8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const T = H / 4.4;
  ctx.save();
  ctx.translate(W / 2 - T * 4, T * 0.2);
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.roundRect?.(-T * 0.2, -T * 0.05, T * 8.4, T * 4.1, T * 0.3);
  ctx.fill();
  const lines = [
    [[0, 0], [1, 0], [2, 0], [2, 1]],
    [[0, 3], [0, 2], [0, 1]],
    [[1, 1], [1, 2], [2, 2], [3, 2]],
    [[3, 0], [4, 0], [5, 0]],
    [[3, 1], [4, 1], [4, 2], [4, 3]],
    [[1, 3], [2, 3], [3, 3]],
    [[7, 3], [6, 3], [5, 3], [5, 2], [5, 1], [6, 1]],
    [[7, 0], [6, 0]],
    [[6, 2], [7, 2], [7, 1]],
  ];
  lines.forEach((cells, k) => {
    const pts = cells.map(([x, y]) => [x + 0.5, y + 0.5]);
    const [ax, ay] = pts[pts.length - 2];
    const [bx, by] = pts[pts.length - 1];
    pts[pts.length - 1] = [bx, by, bx - ax, by - ay];
    drawArrow(ctx, T, pts, COLORS[(k * 3) % COLORS.length]);
  });
  ctx.restore();
}
