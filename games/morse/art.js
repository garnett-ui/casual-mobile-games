// Card illustration for the arcade hub: Scrabble-like tiles raining down on
// green felt -- one face down and sounding -- with their codes.
import { CODE } from './code.js';

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
  g.addColorStop(0, '#14513c');
  g.addColorStop(1, '#0a2a20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const s = Math.min(H * 0.3, W / 9);
  const tile = (x, y, ch, back = false) => {
    ctx.fillStyle = back ? '#6e4a24' : '#b8955c';
    ctx.beginPath();
    ctx.roundRect(x, y + 3, s, s, s * 0.12);
    ctx.fill();
    ctx.fillStyle = back ? '#a8743f' : '#f4e4c1';
    ctx.beginPath();
    ctx.roundRect(x, y, s, s - 2, s * 0.12);
    ctx.fill();
    if (back) return;
    ctx.fillStyle = '#3b2a1a';
    ctx.font = `900 ${Math.round(s * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x + s / 2, y + s * 0.42);
    const u = s / 22;
    const code = CODE[ch];
    let w = -u;
    for (const c of code) w += (c === '.' ? u : 3 * u) + u;
    let cx = x + s / 2 - w / 2;
    ctx.fillStyle = '#7a5a3a';
    for (const c of code) {
      const d = c === '.' ? u : 3 * u;
      ctx.beginPath();
      ctx.roundRect(cx, y + s * 0.78, d, u, u / 2);
      ctx.fill();
      cx += d + u;
    }
  };
  // The stacks along the bottom.
  const cols = Math.floor(W / (s * 1.06));
  const x0 = (W - cols * s * 1.06) / 2;
  const piles = [2, 1, 0, 2, 1, 2, 1, 2, 0, 1, 2];
  const word = 'SOSMORSECODEPARISETAN';
  let k = 0;
  for (let c = 0; c < cols; c++) {
    for (let j = 0; j < piles[c % piles.length]; j++) tile(x0 + c * s * 1.06, H - (j + 1) * s - 4, word[k++ % word.length]);
  }
  // Falling: one face down, sounding (rings round it), one face up.
  const fx = x0 + 2 * s * 1.06;
  const fy = H * 0.16;
  ctx.strokeStyle = 'rgba(255,214,90,0.8)';
  ctx.lineWidth = 2;
  for (let r = 1; r <= 3; r++) {
    ctx.globalAlpha = 1 - r * 0.25;
    ctx.beginPath();
    ctx.roundRect(fx - r * 5, fy - r * 5, s + r * 10, s + r * 10, s * 0.2 + r * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  tile(fx, fy, '', true);
  ctx.fillStyle = '#ffe9b0';
  ctx.font = `900 ${Math.round(s * 0.42)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('· · ·  − − −  · · ·', fx + s * 1.5, fy + s / 2);
  return rect;
}
