// Card illustration for the arcade hub: posts curving off into the dark, a
// green sign, and a red LED score.
import { drawPanel } from './play.js';
import { drawDigits } from './segments.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const hor = H * 0.38;
  const f = W * 0.6;
  // A left-hand bend, lined with posts coming in at the bottom corners.
  const drop = ((H * 0.83 - hor) * ((f * 5.7) / (W / 2))) / f;
  for (let d = 150; d >= 4; d -= 10) {
    const bend = -0.0022 * d * d;
    for (const s of [-1, 1]) {
      const x = W / 2 + (f * (bend + s * 5.7 - 0.5)) / d;
      const y = hor + (f * drop) / d;
      const w = Math.max(1.2, (f * 0.24) / d);
      const h = Math.max(1.2, (f * 0.36) / d);
      ctx.globalAlpha = Math.min(1, 1.2 - d / 200);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
    }
  }
  ctx.globalAlpha = 1;
  drawPanel(ctx, W * 0.53, H * 0.12, W * 0.36, W * 0.16, ['GRAND CANYON', 'Scenic drop 1 mi'], 1, 1);
  drawDigits(ctx, '1976', 10, 10, Math.min(22, H * 0.12));
  // The hood
  ctx.fillStyle = '#060608';
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-5, H + 5);
  ctx.lineTo(-5, H * 0.93);
  ctx.quadraticCurveTo(W * 0.1, H * 0.84, W / 2, H * 0.83);
  ctx.quadraticCurveTo(W * 0.9, H * 0.84, W + 5, H * 0.93);
  ctx.lineTo(W + 5, H + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  return rect;
}
