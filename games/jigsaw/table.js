// The table the puzzle sits on: light oak planks, drawn once per screen size.
// Grain is long wavy strokes plus the arched "cathedral" figure of flat-sawn
// boards, lit from the top left like the pieces.
import { rng } from '../../js/lib/random.js';

export function woodTable(W, H, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * dpr);
  c.height = Math.ceil(H * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const r = rng(20261015);
  const plankH = Math.max(80, Math.min(W, H) / 3.4);
  for (let y0 = -r() * plankH; y0 < H; y0 += plankH) {
    // Boards butt end to end at random places along each row.
    for (let x0 = -r() * W * 0.8; x0 < W; ) {
      const len = W * (0.7 + r() * 0.9);
      board(g, r, x0, y0, len, plankH);
      x0 += len;
    }
  }
  // Light from the top left, falling off across the table.
  const light = g.createRadialGradient(W * 0.15, H * 0.05, 0, W * 0.15, H * 0.05, Math.hypot(W, H));
  light.addColorStop(0, 'rgba(255,246,228,0.16)');
  light.addColorStop(1, 'rgba(70,38,8,0.2)');
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);
  return c;
}

function board(g, r, x0, y0, w, h) {
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  const tone = 0.92 + r() * 0.14;
  const rgb = (cr, cg, cb, a) => `rgba(${Math.round(cr * tone)},${Math.round(cg * tone)},${Math.round(cb * tone)},${a})`;
  g.fillStyle = rgb(214, 178, 130, 1);
  g.fillRect(x0, y0, w, h);
  // Straight grain
  const lines = Math.round(h / 2.4);
  const phase = r() * 100;
  for (let i = 0; i < lines; i++) {
    const y = y0 + ((i + r() * 0.8) * h) / lines;
    const dark = r() < 0.3;
    g.strokeStyle = dark ? rgb(120, 78, 38, 0.1 + r() * 0.14) : rgb(150, 105, 60, 0.05 + r() * 0.1);
    g.lineWidth = dark ? 0.6 + r() * 1.2 : 0.4 + r() * 0.8;
    g.beginPath();
    for (let x = x0 - 8; x <= x0 + w + 8; x += 10) {
      const wob = Math.sin((x - x0) * 0.0035 + phase + i * 0.04) * h * 0.06 + Math.sin(x * 0.011 + i * 0.7) * 0.8;
      if (x === x0 - 8) g.moveTo(x, y + wob);
      else g.lineTo(x, y + wob);
    }
    g.stroke();
  }
  // Cathedral figure: nested arches
  if (r() < 0.75) {
    const cx = x0 + w * (0.25 + r() * 0.5);
    const cy = y0 + h * (0.55 + r() * 0.5);
    const n = 6 + Math.floor(r() * 6);
    for (let j = 1; j <= n; j++) {
      g.strokeStyle = rgb(125, 82, 40, 0.07 + r() * 0.08);
      g.lineWidth = 0.8 + r() * 1.6;
      g.beginPath();
      g.ellipse(cx, cy, w * 0.05 * j + 6, h * 0.075 * j, 0, Math.PI * 1.04, Math.PI * 1.96);
      g.stroke();
    }
  }
  // Pores: short dark flecks
  for (let k = 0; k < (w * h) / 220; k++) {
    g.fillStyle = rgb(110, 70, 35, 0.08 + r() * 0.1);
    g.fillRect(x0 + r() * w, y0 + r() * h, 2 + r() * 5, 0.6);
  }
  g.restore();
  // Seams: a dark gap with a lit lip on the far side.
  g.fillStyle = 'rgba(70,40,12,0.5)';
  g.fillRect(x0, y0 + h - 1, w, 1);
  g.fillRect(x0 + w - 1, y0, 1, h);
  g.fillStyle = 'rgba(255,240,210,0.25)';
  g.fillRect(x0, y0 + h, w, 1);
}
