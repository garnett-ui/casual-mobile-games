// Tangram: the seven classic pieces, the figures to make with them, and the
// geometry for telling when a figure is made.
//
// Units: the small triangle's legs are 1, so the seven pieces make a square
// of side 2√2 (area 8). Pieces turn in 45° steps; only the parallelogram can
// usefully be turned over.

export const H = Math.SQRT1_2;

// Each piece's outline unturned, vertex 0 first.
export const SHAPES = {
  L: [[0, 0], [2, 0], [0, 2]], // large triangle
  M: [[0, 0], [2, 0], [1, 1]], // medium triangle
  S: [[0, 0], [1, 0], [0, 1]], // small triangle
  Q: [[0, 0], [1, 0], [1, 1], [0, 1]], // square
  P: [[0, 0], [1, 0], [2, 1], [1, 1]], // parallelogram
};
// The set, in the order the game keeps them.
export const SET = ['L', 'L', 'M', 'S', 'S', 'Q', 'P'];

// Piece t's outline turned rot × 45° clockwise (mirrored first if flip),
// with vertex 0 at (x, y).
export function outline(t, rot, flip, x = 0, y = 0) {
  const a = (rot * Math.PI) / 4;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return SHAPES[t].map(([px, py]) => {
    const qx = flip ? -px : px;
    return [x + qx * c - py * s, y + qx * s + py * c];
  });
}

export const centroid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

// A piece as the game holds it -- { t, rot, flip, x, y }, (x, y) its centre
// -- as an outline.
export function shape({ t, rot, flip, x, y }) {
  const o = outline(t, rot, flip);
  const [cx, cy] = centroid(o);
  return o.map(([px, py]) => [px - cx + x, py - cy + y]);
}

// Turned over, left to right (about its centre).
export const flipped = (p) => ({ ...p, flip: p.flip ? 0 : 1, rot: (8 - p.rot) % 8 });

// The figures, from simple to hard: each is one way of making it, as
// [piece, turn, flip, x, y] with (x, y) where the piece's vertex 0 goes.
// (Made with tools in the session notes: a tiling solver checked each one.)
export const FIGURES = [
  { name: 'House', pieces: [
    ['L', 4, 0, 2, 2],
    ['L', 6, 0, 2, 2],
    ['M', 0, 0, 1, 2],
    ['S', 6, 0, 1, 3],
    ['S', 4, 0, 3, 4],
    ['Q', 0, 0, 1, 3],
    ['P', 2, 0, 3, 2],
  ] },
  { name: 'Sailboat', pieces: [
    ['L', 6, 0, 3, 2],
    ['L', 6, 0, 2, 3],
    ['M', 2, 0, 2, 1],
    ['S', 2, 0, 4, 2],
    ['S', 0, 0, 5, 2],
    ['Q', 0, 0, 4, 2],
    ['P', 0, 0, 0, 2],
  ] },
  { name: 'Rocket', pieces: [
    ['L', 0, 0, 1, 1],
    ['L', 4, 0, 3, 3],
    ['M', 4, 0, 3, 1],
    ['S', 4, 0, 1, 4],
    ['S', 6, 0, 2, 4],
    ['Q', 0, 0, 1, 3],
    ['P', 0, 0, 2, 3],
  ] },
  { name: 'Cat', pieces: [
    ['L', 0, 0, H, 3 * H],
    ['L', 4, 0, 2 + H, 2 + 3 * H],
    ['M', 7, 0, H, 3 * H],
    ['S', 3, 0, H, H],
    ['S', 7, 0, H, H],
    ['Q', 1, 0, H, H],
    ['P', 2, 0, 3 + H, 3 * H],
  ] },
  { name: 'Rabbit', pieces: [
    ['L', 0, 0, H, 4 * H],
    ['L', 4, 0, 2 + H, 2 + 4 * H],
    ['M', 7, 0, H, 4 * H],
    ['S', 7, 0, H, 2 * H],
    ['S', 3, 0, 2 + 2 * H, 2 + 3 * H],
    ['Q', 1, 0, H, 2 * H],
    ['P', 3, 1, 0, 3 * H],
  ] },
  { name: 'Swan', pieces: [
    ['L', 1, 0, 2 * H, 4 * H],
    ['L', 5, 0, 4 * H, 6 * H],
    ['M', 7, 0, 4 * H, 4 * H],
    ['S', 4, 0, 1 + 2 * H, 4 * H],
    ['S', 1, 0, 1 + H, H],
    ['Q', 1, 0, 1 + 2 * H, 0],
    ['P', 3, 1, 1 + 2 * H, 4 * H],
  ] },
  { name: 'Rectangle', pieces: [
    ['L', 0, 0, 0, 0],
    ['L', 4, 0, 2, 2],
    ['M', 0, 0, 2, 0],
    ['S', 6, 0, 2, 1],
    ['S', 4, 0, 4, 2],
    ['Q', 0, 0, 2, 1],
    ['P', 2, 0, 4, 0],
  ] },
  { name: 'Runner', pieces: [
    ['L', 0, 0, 4 * H, 1],
    ['L', 5, 0, 2 * H, 3 + 2 * H],
    ['M', 5, 0, 6 * H, 3 + 2 * H],
    ['S', 0, 0, 2 + 4 * H, 1],
    ['S', 0, 0, 6 * H, 3 + 2 * H],
    ['Q', 0, 0, 0.5 + 4 * H, 0],
    ['P', 0, 1, 4 * H, 1],
  ] },
  { name: 'Parallelogram', pieces: [
    ['L', 2, 0, 2, 0],
    ['L', 0, 0, 2, 0],
    ['M', 4, 0, 5, 1],
    ['S', 4, 0, 3, 2],
    ['S', 6, 0, 4, 2],
    ['Q', 0, 0, 3, 1],
    ['P', 0, 0, 4, 1],
  ] },
  { name: 'Trapezoid', pieces: [
    ['L', 4, 0, 2, 2],
    ['L', 0, 0, 2, 0],
    ['M', 4, 0, 5, 1],
    ['S', 4, 0, 3, 2],
    ['S', 6, 0, 4, 2],
    ['Q', 0, 0, 3, 1],
    ['P', 0, 0, 4, 1],
  ] },
  { name: 'Triangle', pieces: [
    ['L', 5, 0, 2 * H, 2 * H],
    ['L', 7, 0, 2 * H, 2 * H],
    ['M', 3, 0, 6 * H, 0],
    ['S', 5, 0, 7 * H, H],
    ['S', 3, 0, 6 * H, 2 * H],
    ['Q', 1, 0, 6 * H, 0],
    ['P', 3, 1, 4 * H, 4 * H],
  ] },
  { name: 'Square', pieces: [
    ['L', 5, 0, 2 * H, 2 * H],
    ['L', 3, 0, 2 * H, 2 * H],
    ['M', 7, 0, 2 * H, 4 * H],
    ['S', 7, 0, 3 * H, H],
    ['S', 1, 0, 2 * H, 2 * H],
    ['Q', 1, 0, 3 * H, H],
    ['P', 3, 0, 3 * H, 3 * H],
  ] },
];

export function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export const area = (pts) => Math.abs(pts.reduce((a, [x, y], i) => {
  const [u, v] = pts[(i + 1) % pts.length];
  return a + x * v - u * y;
}, 0)) / 2;

const near = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
// Two outlines the same (in any vertex order).
export const same = (a, b, tol = 0.02) => a.length === b.length && a.every((p) => b.some((q) => near(p, q, tol)));

// Figure n (from 1): its pieces where they go ("slots"), the silhouette's
// size, its corners (every piece corner: what pieces snap to) and points
// spread over it (for checking it's covered).
export function figure(n) {
  const def = FIGURES[n - 1];
  const slots = def.pieces.map(([t, rot, flip, x, y]) => {
    const [cx, cy] = centroid(outline(t, rot, flip, x, y));
    return { t, rot, flip, x: cx, y: cy };
  });
  const polys = slots.map(shape);
  const all = polys.flat();
  const w = Math.max(...all.map((p) => p[0]));
  const h = Math.max(...all.map((p) => p[1]));
  const verts = [];
  for (const p of all) if (!verts.some((v) => near(v, p, 1e-6))) verts.push(p);
  const samples = [];
  const st = 0.06;
  for (let x = 0.011; x < w; x += st) {
    for (let y = 0.017; y < h; y += st) if (polys.some((p) => inside(p, x, y))) samples.push([x, y]);
  }
  return { n, name: def.name, slots, polys, w, h, verts, samples };
}

// The share of the silhouette the pieces cover. (They have its area between
// them, so once they cover it they can't be sticking out anywhere.)
export function coverage(fig, pieces) {
  const polys = pieces.map((p) => (Array.isArray(p) ? p : shape(p)));
  let n = 0;
  for (const [x, y] of fig.samples) if (polys.some((p) => inside(p, x, y))) n++;
  return n / fig.samples.length;
}
export const solved = (fig, pieces) => coverage(fig, pieces) > 0.985;

// The nudge that puts one of a piece's corners on the nearest of these
// points, if one is within tol; else null.
export function snap(pts, anchors, tol) {
  let best = null;
  let d = tol;
  for (const p of pts) {
    for (const a of anchors) {
      const e = Math.hypot(a[0] - p[0], a[1] - p[1]);
      if (e < d) {
        d = e;
        best = [a[0] - p[0], a[1] - p[1]];
      }
    }
  }
  return best;
}

// Where the pieces wait at the start: laid out in two rows, three, or two
// columns (in SET order). Positions are centres within a box of size w × h.
function lay(items) {
  const out = items.map(([t, rot, flip, bx, by]) => {
    const o = outline(t, rot, flip);
    const mx = Math.min(...o.map((p) => p[0]));
    const my = Math.min(...o.map((p) => p[1]));
    const [cx, cy] = centroid(o);
    return { t, rot, flip, x: bx + cx - mx, y: by + cy - my };
  });
  const pts = out.flatMap(shape);
  return { pieces: out, w: Math.max(...pts.map((p) => p[0])), h: Math.max(...pts.map((p) => p[1])) };
}
export const TRAY = {
  rows: lay([['L', 0, 0, 0, 0], ['L', 2, 0, 2.5, 0], ['M', 0, 0, 5, 0.5], ['S', 0, 0, 0.5, 2.5], ['S', 2, 0, 2, 2.5], ['Q', 0, 0, 3.5, 2.5], ['P', 0, 0, 5, 2.5]]),
  grid: lay([['L', 0, 0, 0, 0], ['L', 2, 0, 2.5, 0], ['M', 0, 0, 0, 2.5], ['S', 0, 0, 0.25, 4], ['S', 2, 0, 1.75, 4], ['Q', 0, 0, 3.25, 4], ['P', 0, 0, 2.5, 2.5]]),
  cols: lay([['L', 0, 0, 0, 0], ['L', 6, 0, 0, 2.5], ['M', 2, 0, 0.5, 5], ['S', 0, 0, 2.5, 0.5], ['S', 6, 0, 2.5, 2], ['Q', 0, 0, 2.5, 3.5], ['P', 2, 0, 2.5, 5]]),
};

export const starsFor = (hints) => (hints === 0 ? 3 : hints <= 2 ? 2 : 1);
