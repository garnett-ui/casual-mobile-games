// Drawing helpers for Tap Maze arrows (used by the game and the hub card).

export const COLORS = [
  '#ef476f', '#f78c3b', '#ffc43d', '#1b9e77', '#118ab2',
  '#7b5cff', '#f15bb5', '#00b4d8', '#43aa8b', '#e76f51',
];

// A track is a list of points one cell apart (tail first, then on past the
// head). The arrow covers arc length [s, s + len - 1] of it.
export function pointAt(track, u) {
  const max = track.length - 1;
  u = Math.max(0, Math.min(max, u));
  const i = Math.min(max - 1, Math.floor(u));
  const f = u - i;
  const [x0, y0] = track[i];
  const [x1, y1] = track[i + 1];
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, x1 - x0, y1 - y0];
}

export function arrowPoints(track, s, len) {
  const end = s + len - 1;
  const pts = [pointAt(track, s)];
  for (let k = Math.floor(s) + 1; k < end; k++) pts.push(track[k]);
  pts.push(pointAt(track, end));
  return pts;
}

// Stroke an arrow through pts (in cells) with its head at the last point.
export function drawArrow(ctx, T, pts, color, opts = {}) {
  const head = pts[pts.length - 1];
  const [hx, hy, dx, dy] = head.length > 2 ? head : [...head, 1, 0];
  const width = T * 0.3;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * T, pts[0][1] * T);
    for (let k = 1; k < pts.length - 1; k++) ctx.lineTo(pts[k][0] * T, pts[k][1] * T);
    ctx.lineTo((hx - dx * 0.12) * T, (hy - dy * 0.12) * T);
  };
  const tri = (grow = 0) => {
    const tip = 0.36 + grow;
    const back = 0.16 + grow;
    const half = 0.3 + grow;
    ctx.beginPath();
    ctx.moveTo((hx + dx * tip) * T, (hy + dy * tip) * T);
    ctx.lineTo((hx - dx * back - dy * half) * T, (hy - dy * back + dx * half) * T);
    ctx.lineTo((hx - dx * back + dy * half) * T, (hy - dy * back - dx * half) * T);
    ctx.closePath();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opts.glow) {
    ctx.strokeStyle = 'rgba(255,240,140,0.95)';
    ctx.fillStyle = 'rgba(255,240,140,0.95)';
    ctx.lineWidth = width + T * 0.22;
    path();
    ctx.stroke();
    tri(0.1);
    ctx.fill();
  }
  // Soft shadow
  ctx.save();
  ctx.translate(T * 0.04, T * 0.07);
  ctx.strokeStyle = 'rgba(30,20,60,0.2)';
  ctx.fillStyle = 'rgba(30,20,60,0.2)';
  ctx.lineWidth = width;
  path();
  ctx.stroke();
  tri();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  path();
  ctx.stroke();
  tri();
  ctx.fill();
  // Tail dot
  ctx.beginPath();
  ctx.arc(pts[0][0] * T, pts[0][1] * T, width * 0.62, 0, Math.PI * 2);
  ctx.fill();
}
