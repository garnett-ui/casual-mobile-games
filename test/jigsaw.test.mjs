import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridFor, makeEdges, pieceSides, tracePiece, isEdgePiece } from '../games/jigsaw/puzzle.js';

test('about 100 pieces, as square as possible, for any photo shape', () => {
  for (const aspect of [4 / 3, 3 / 4, 16 / 9, 9 / 16, 1, 9 / 19.5, 3 / 2]) {
    const { rows, cols } = gridFor(100, aspect);
    const n = rows * cols;
    assert.ok(n >= 85 && n <= 115, `${aspect}: ${rows}x${cols}=${n}`);
    const pieceAspect = (aspect * rows) / cols;
    assert.ok(pieceAspect > 0.8 && pieceAspect < 1.25, `piece aspect ${pieceAspect}`);
  }
  const small = gridFor(24, 4 / 3);
  assert.ok(small.rows * small.cols >= 20 && small.rows * small.cols <= 30);
});

test('neighbouring pieces fit: a tab on one side is a hole on the other', () => {
  const rows = 5;
  const cols = 6;
  const edges = makeEdges(rows, cols, 42);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [top, right, bottom, left] = pieceSides(edges, rows, cols, r, c);
      assert.equal(top === null, r === 0);
      assert.equal(left === null, c === 0);
      assert.equal(bottom === null, r === rows - 1);
      assert.equal(right === null, c === cols - 1);
      if (right) assert.equal(right.dir, -pieceSides(edges, rows, cols, r, c + 1)[3].dir);
      if (bottom) assert.equal(bottom.dir, -pieceSides(edges, rows, cols, r + 1, c)[0].dir);
      assert.equal(isEdgePiece(rows, cols, r, c), r === 0 || c === 0 || r === rows - 1 || c === cols - 1);
    }
  }
});

test('piece outlines are closed and stay near their cell', () => {
  const edges = makeEdges(3, 3, 7);
  const pts = [];
  const rec = {
    moveTo: (x, y) => pts.push([x, y]),
    lineTo: (x, y) => pts.push([x, y]),
    bezierCurveTo: (a, b, c, d, x, y) => pts.push([a, b], [c, d], [x, y]),
    closePath: () => pts.push('close'),
  };
  tracePiece(rec, 100, 80, pieceSides(edges, 3, 3, 1, 1));
  assert.equal(pts.at(-1), 'close');
  const xy = pts.filter(Array.isArray);
  assert.deepEqual(xy[0], [0, 0]);
  for (const [x, y] of xy) {
    assert.ok(x > -40 && x < 140 && y > -40 && y < 120, `point ${x},${y} near the cell`);
  }
  // A middle piece has a tab or hole on all four sides: the outline leaves the box.
  assert.ok(xy.some(([x, y]) => x < 0 || x > 100 || y < 0 || y > 80 || (x > 5 && x < 95 && y > 5 && y < 75)));
});

test('a knob and the hole it fits trace exactly the same curve', async () => {
  const { traceEdge } = await import('../games/jigsaw/puzzle.js');
  const rows = 4;
  const cols = 5;
  const edges = makeEdges(rows, cols, 7);
  const points = (fn) => {
    const pts = [];
    const rec = { lineTo: (...a) => pts.push(a), bezierCurveTo: (...a) => { for (let i = 0; i < 6; i += 2) pts.push(a.slice(i, i + 2)); } };
    fn(rec);
    return pts.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort();
  };
  const w = 30;
  const h = 40;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      // Right side of (r, c), top to bottom; left side of (r, c+1), bottom to top.
      const right = pieceSides(edges, rows, cols, r, c)[1];
      const left = pieceSides(edges, rows, cols, r, c + 1)[3];
      assert.deepEqual(
        points((p) => traceEdge(p, w, 0, w, h, right, w)).filter((s) => s !== `${w.toFixed(6)},${h.toFixed(6)}`),
        points((p) => traceEdge(p, w, h, w, 0, left, w)).filter((s) => s !== `${w.toFixed(6)},${(0).toFixed(6)}`),
      );
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const bottom = pieceSides(edges, rows, cols, r, c)[2];
      const top = pieceSides(edges, rows, cols, r + 1, c)[0];
      assert.deepEqual(
        points((p) => traceEdge(p, w, h, 0, h, bottom, w)).filter((s) => s !== `${(0).toFixed(6)},${h.toFixed(6)}`),
        points((p) => traceEdge(p, 0, h, w, h, top, w)).filter((s) => s !== `${w.toFixed(6)},${h.toFixed(6)}`),
      );
    }
  }
});
