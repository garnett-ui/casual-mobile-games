// Card illustration for the arcade hub: a half-done jigsaw.
import { sampleImage } from './samples.js';
import { tracePiece, pieceSides, makeEdges } from './puzzle.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  ctx.fillStyle = '#1c2a3a';
  ctx.fillRect(0, 0, W, H);
  const rows = 4;
  const cols = 7;
  const bw = W * 0.72;
  const bh = H * 0.8;
  const bx = W * 0.06;
  const by = H * 0.1;
  const pw = bw / cols;
  const ph = bh / rows;
  const img = sampleImage('sample:balloons', 800, 600);
  const edges = makeEdges(rows, cols, 5);
  ctx.fillStyle = '#2b3a50';
  ctx.fillRect(bx, by, bw, bh);
  const draw = (row, col, x, y, rot = 0) => {
    const path = new Path2D();
    tracePiece(path, pw, ph, pieceSides(edges, rows, cols, row, col));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.shadowColor = 'transparent';
    ctx.clip(path);
    ctx.drawImage(img, -col * pw, -row * ph, bw, bh);
    ctx.restore();
  };
  // Most of the picture is done; a few pieces still lie to the side.
  const missing = new Set(['0,5', '0,6', '1,6', '2,4', '3,6', '2,6', '1,5']);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (!missing.has(`${r},${c}`)) draw(r, c, bx + c * pw, by + r * ph);
  }
  draw(1, 6, W * 0.82, H * 0.08, 0.3);
  draw(2, 4, W * 0.86, H * 0.42, -0.25);
  draw(0, 5, W * 0.8, H * 0.68, 0.15);
}
