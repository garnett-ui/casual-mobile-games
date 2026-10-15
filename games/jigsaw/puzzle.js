// Jigsaw geometry: grid sizing and classic tab-and-blank piece outlines.
// Pure functions (no DOM), so they can be tested in Node.
import { rng } from '../../js/lib/random.js';

export const TAB = 0.3; // how far a tab sticks out, as a fraction of piece size

// Choose rows x cols near `target` pieces with pieces as square as possible
// for an image of the given aspect ratio (width / height).
export function gridFor(target, aspect) {
  let best = null;
  for (let cols = 2; cols <= 40; cols++) {
    const rows = Math.max(2, Math.round(cols / aspect));
    const n = rows * cols;
    const pieceAspect = (aspect * rows) / cols; // piece width / height
    const score = Math.abs(n - target) / target + Math.abs(Math.log(pieceAspect)) * 0.8;
    if (!best || score < best.score) best = { rows, cols, score };
  }
  return { rows: best.rows, cols: best.cols };
}

// Every internal edge gets a tab poking one way or the other, plus a little
// jitter so pieces don't all look alike. Edges are shared, so neighbours fit.
// h[r][c]: edge below row r at column c (r < rows-1); v[r][c]: edge right of col c.
export function makeEdges(rows, cols, seed) {
  const r = rng(seed);
  const edge = () => ({ dir: r() < 0.5 ? 1 : -1, shift: (r() - 0.5) * 0.12, size: 0.9 + r() * 0.2 });
  const h = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, edge));
  const v = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, edge));
  return { h, v };
}

// The four sides of piece (row, col), each null (flat border) or a tab spec
// with dir +1 = sticks out, -1 = cut in. Order: top, right, bottom, left.
export function pieceSides(edges, rows, cols, row, col) {
  // The neighbour traces a shared edge the other way round, so its knob
  // offset is mirrored too -- otherwise knob and hole don't line up.
  const flip = (e) => e && { ...e, dir: -e.dir, shift: -e.shift };
  return [
    row > 0 ? flip(edges.h[row - 1][col]) : null,
    col < cols - 1 ? edges.v[row][col] : null,
    row < rows - 1 ? edges.h[row][col] : null,
    col > 0 ? flip(edges.v[row][col - 1]) : null,
  ];
}

export function isEdgePiece(rows, cols, row, col) {
  return row === 0 || col === 0 || row === rows - 1 || col === cols - 1;
}

// Trace a piece outline of size w x h (top-left at 0,0) into a path-like
// object (CanvasRenderingContext2D or Path2D), going clockwise.
export function tracePiece(path, w, h, sides) {
  const corners = [[0, 0], [w, 0], [w, h], [0, h]];
  path.moveTo(0, 0);
  for (let k = 0; k < 4; k++) {
    const [x0, y0] = corners[k];
    const [x1, y1] = corners[(k + 1) % 4];
    traceEdge(path, x0, y0, x1, y1, sides[k], Math.min(w, h));
  }
  path.closePath();
}

// One side: straight, or with a rounded knob on a narrow neck. Coordinates
// are (along the side, out from the piece), scaled by the shorter piece side.
export function traceEdge(path, x0, y0, x1, y1, tab, size) {
  if (!tab) {
    path.lineTo(x1, y1);
    return;
  }
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  // Outward normal for a clockwise outline in screen coordinates.
  const nx = uy * tab.dir;
  const ny = -ux * tab.dir;
  const s = (size / len) * tab.size; // knob scale relative to this side
  const c = 0.5 + tab.shift;
  const P = (a, b) => [x0 + ux * len * a + nx * len * b, y0 + uy * len * a + ny * len * b];
  const knob = [
    [[c - 0.15 * s, 0]],
    [[c - 0.08 * s, 0], [c - 0.06 * s, 0.06 * s], [c - 0.1 * s, 0.12 * s]],
    [[c - 0.16 * s, 0.22 * s], [c - 0.1 * s, TAB * s], [c, TAB * s]],
    [[c + 0.1 * s, TAB * s], [c + 0.16 * s, 0.22 * s], [c + 0.1 * s, 0.12 * s]],
    [[c + 0.06 * s, 0.06 * s], [c + 0.08 * s, 0], [c + 0.15 * s, 0]],
  ];
  const [l0] = knob[0];
  path.lineTo(...P(...l0));
  for (const seg of knob.slice(1)) path.bezierCurveTo(...P(...seg[0]), ...P(...seg[1]), ...P(...seg[2]));
  path.lineTo(x1, y1);
}
