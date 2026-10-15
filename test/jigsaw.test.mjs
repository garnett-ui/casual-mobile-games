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
