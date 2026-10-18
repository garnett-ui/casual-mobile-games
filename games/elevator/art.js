// Card illustration for the arcade hub: the tower crowned like the Empire
// State Building, two lift shafts with a car and lit floors, and 8-bit
// people waiting by the call buttons.
import { drawSprite } from './play.js';

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
  sky.addColorStop(0, '#5a9bd8');
  sky.addColorStop(1, '#cfe6fa');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const bx = W * 0.1;
  const bw = W * 0.8;
  const cx = bx + bw / 2;
  const floors = 5;
  const crown = H * 0.34;
  const rowH = (H - crown) / floors;
  // The crown: setbacks, the mast, the antenna.
  const stone = '#ddd3bf';
  let y = crown;
  for (const [w, h] of [[0.78, 0.18], [0.56, 0.16], [0.38, 0.15], [0.12, 0.14], [0.07, 0.12]]) {
    ctx.fillStyle = stone;
    ctx.fillRect(cx - (bw * w) / 2, y - crown * h, bw * w, crown * h);
    ctx.fillStyle = '#b8ab92';
    ctx.fillRect(cx - (bw * w) / 2, y - crown * h, bw * w, 1.5);
    y -= crown * h;
  }
  ctx.strokeStyle = '#7d7d7d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, 3);
  ctx.stroke();
  ctx.fillStyle = '#ff2d2d';
  ctx.beginPath();
  ctx.arc(cx, 4, 2, 0, Math.PI * 2);
  ctx.fill();
  // Floors and shafts.
  ctx.fillStyle = '#e9e0cc';
  ctx.fillRect(bx, crown, bw, rowH * floors);
  const sw = bw * 0.2;
  const shafts = [bx + bw - 2 * sw - 8, bx + bw - sw - 3];
  for (let f = 0; f < floors; f++) {
    ctx.fillStyle = '#b7a684';
    ctx.fillRect(bx, crown + f * rowH + rowH - 1.5, bw, 1.5);
    ctx.fillStyle = '#c9a54b';
    ctx.fillRect(shafts[0] - 9, crown + f * rowH + rowH * 0.25, 5, rowH * 0.5);
  }
  shafts.forEach((x, i) => {
    ctx.fillStyle = '#3b3f4a';
    ctx.fillRect(x, crown, sw, rowH * floors);
    for (const f of i ? [0, 3] : [1]) {
      ctx.fillStyle = 'rgba(255,196,50,0.4)';
      ctx.fillRect(x + 2, crown + f * rowH + 2, sw - 4, rowH - 4);
      ctx.strokeStyle = '#ffd23f';
      ctx.strokeRect(x + 2.5, crown + f * rowH + 2.5, sw - 5, rowH - 5);
    }
    const cy = crown + (i ? 2 : 3.4) * rowH;
    ctx.fillStyle = '#d9dde4';
    ctx.fillRect(x + 3, cy + 1, sw - 6, rowH - 3);
    ctx.fillStyle = '#a7afbd';
    ctx.fillRect(x + 5, cy + 3, sw - 10, rowH - 6);
  });
  // People by the call buttons.
  const px = Math.max(1, Math.floor((rowH * 0.75) / 12));
  const crowd = [[4, 3], [2, 2], [1, 1]];
  let id = 0;
  for (const [f, n] of crowd) {
    for (let k = 0; k < n; k++) {
      const look = [id * 3 + 1, id * 5 + 2, id * 7 + 3, id * 2 + 1];
      drawSprite(ctx, look, shafts[0] - 14 - (k + 1) * (px * 8 + 2), crown + f * rowH + rowH - 2, px, 'stand');
      id++;
    }
  }
  return rect;
}
