// Tangram solver: one way (or more) of making a silhouette from the seven
// pieces, for designing figures (tools/tangram-figures.mjs) and testing.
//
// The silhouette is a union of non-overlapping polygons, in the units of
// model.js (small triangle legs 1, total area 8). Pieces turn in 45° steps,
// so a figure can mix pieces at 45° to each other.
//
// How: the topmost-leftmost point not yet covered is always a corner of the
// silhouette or of a piece already placed, and the piece that covers the
// space just below it must have its own topmost-leftmost corner there. So
// try each piece left, in each of its turns, with that corner there; keep it
// if it fits (points spread through it are inside the silhouette and in no
// other piece), and carry on.
import { SET, outline, inside, area } from './model.js';

const EPS = 1e-6;

function distSeg(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

// Points spread through a piece (not on its edges), and just inside each
// corner.
function probes(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const out = [];
  const st = 0.09;
  for (let x = Math.min(...xs) + 0.013; x < Math.max(...xs); x += st) {
    for (let y = Math.min(...ys) + 0.017; y < Math.max(...ys); y += st) {
      if (inside(pts, x, y) && pts.every((a, i) => distSeg(x, y, a, pts[(i + 1) % pts.length]) > 0.015)) out.push([x, y]);
    }
  }
  const cx = xs.reduce((a, b) => a + b) / xs.length;
  const cy = ys.reduce((a, b) => a + b) / ys.length;
  for (const [x, y] of pts) for (const t of [0.03, 0.1]) out.push([x + (cx - x) * t, y + (cy - y) * t]);
  return out;
}

// Every distinct turn (and, for the parallelogram, flip) of each piece, as
// an outline relative to its topmost-leftmost corner.
const first = (pts) => pts.reduce((b, p) => (p[1] < b[1] - EPS || (Math.abs(p[1] - b[1]) < EPS && p[0] < b[0]) ? p : b));
const ORIENTS = [];
for (const t of new Set(SET)) {
  const seen = new Set();
  for (const flip of t === 'P' ? [0, 1] : [0]) {
    for (let rot = 0; rot < 8; rot++) {
      const o = outline(t, rot, flip);
      const f = first(o);
      const rel = o.map(([x, y]) => [x - f[0], y - f[1]]);
      const key = rel.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).sort().join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      ORIENTS.push({ t, rot, flip, rel, probes: probes(rel) });
    }
  }
}

// Up to `limit` ways of making the silhouette: each a list of { t, rot,
// flip, pts }. [] if there's none (or the area isn't 8).
export function solve(polys, { limit = 1 } = {}) {
  const total = polys.reduce((a, p) => a + area(p), 0);
  if (Math.abs(total - 8) > 1e-6) return [];
  const inSil = (x, y) => polys.some((p) => inside(p, x, y));
  const placed = [];
  const left = {};
  for (const t of SET) left[t] = (left[t] || 0) + 1;
  const sols = [];
  const verts = polys.flat();
  // Directions just below a point (offset, so as never to run along an edge).
  const dirs = [];
  for (let k = 0; k < 16; k++) {
    const a = ((k + 0.5) / 16) * Math.PI;
    dirs.push([Math.cos(a), Math.sin(a)]);
  }
  const free = (x, y) => inSil(x, y) && !placed.some((p) => inside(p.pts, x, y));
  function corner() {
    const cand = verts.concat(placed.flatMap((p) => p.pts));
    cand.sort((a, b) => (Math.abs(a[1] - b[1]) > EPS ? a[1] - b[1] : a[0] - b[0]));
    return cand.find((v) => dirs.some(([dx, dy]) => free(v[0] + dx * 0.004, v[1] + dy * 0.004))) || null;
  }
  function rec() {
    const c = corner();
    if (!c) {
      sols.push(placed.map((p) => ({ ...p })));
      return sols.length >= limit;
    }
    for (const o of ORIENTS) {
      if (!left[o.t]) continue;
      if (!o.probes.every(([x, y]) => free(x + c[0], y + c[1]))) continue;
      left[o.t]--;
      placed.push({ t: o.t, rot: o.rot, flip: o.flip, pts: o.rel.map(([x, y]) => [x + c[0], y + c[1]]) });
      if (rec()) return true;
      placed.pop();
      left[o.t]++;
    }
    return false;
  }
  rec();
  return sols;
}
