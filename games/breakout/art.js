// Card illustration for the arcade hub: a wall of bricks, ball and paddle.
import { ROW_STYLE } from './engine.js';

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
  g.addColorStop(0, '#0d1033');
  g.addColorStop(1, '#1a1446');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const cols = 12;
  const gap = 3;
  const bw = (W - 16 - gap * (cols - 1)) / cols;
  const bh = 9;
  for (let row = 0; row < 8; row++) {
    for (let c = 0; c < cols; c++) {
      if ((row === 1 && (c === 4 || c === 5)) || (row === 0 && c > 2 && c < 8)) continue;
      ctx.fillStyle = ROW_STYLE[row].color;
      ctx.fillRect(8 + c * (bw + gap), 14 + (7 - row) * (bh + gap), bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(8 + c * (bw + gap) + 2, 14 + (7 - row) * (bh + gap) + 1.5, bw - 4, 2);
    }
  }
  // Ball heading up from the paddle towards the gap, with a short trail.
  const wallBottom = 14 + 8 * (bh + gap);
  const bx = W * 0.47;
  const by = Math.min(H - 30, wallBottom + 10);
  for (let k = 1; k <= 5; k++) {
    ctx.fillStyle = `rgba(255,255,255,${0.1 * (6 - k)})`;
    ctx.beginPath();
    ctx.arc(bx - k * 7, by + k * 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ff6b81';
  ctx.beginPath();
  ctx.roundRect?.(W * 0.3, H - 16, 70, 9, 4.5);
  ctx.fill();
}
