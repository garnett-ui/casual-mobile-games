// Card illustration for the arcade hub: a little jammed lot.
import { drawCar, drawGranny, CAR_COLORS } from './draw.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const T = H / 3.2;
  ctx.fillStyle = '#676c7a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.setLineDash([T * 0.18, T * 0.12]);
  ctx.beginPath();
  for (let x = T; x < W; x += T) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = T; y < H; y += T) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const cars = [
    [1, 0.5, 0, 2], [3, 0.5, Math.PI / 2, 2], [2, 2.5, Math.PI, 2],
    [4.5, 2, 0, 3], [0, 2.1, -Math.PI / 2, 2], [5.6, 0.6, Math.PI / 2, 2], [7, 1.6, 0, 2],
  ];
  cars.forEach(([x, y, a, len], k) => {
    ctx.save();
    ctx.translate(x * T + T * 0.5, y * T);
    ctx.rotate(a);
    drawCar(ctx, T, len, CAR_COLORS[k % CAR_COLORS.length]);
    ctx.restore();
  });
  ctx.save();
  ctx.translate(W - T * 0.75, H - T * 0.45);
  ctx.scale(-1.1, 1.1);
  drawGranny(ctx, T, 0.6, false);
  ctx.restore();
}
