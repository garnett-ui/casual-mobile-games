import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard, blocker, analyze, headDir } from '../games/tap-maze/model.js';
import { makeLevel, specFor } from '../games/tap-maze/levels.js';

test('an arrow with a clear path ahead is free; one with a line in the way is not', () => {
  // Arrow 0 points right along row 0; arrow 1 is a vertical line in column 2.
  const board = buildBoard({ w: 4, h: 3, arrows: [[[0, 0], [1, 0]], [[2, 2], [2, 1], [2, 0]]] });
  const alive = [true, true];
  assert.deepEqual(blocker(board, alive, 0), { by: 1, clear: 0 });
  assert.equal(blocker(board, alive, 1).by, -1, 'arrow 1 points up off the board');
  // Once arrow 1 leaves, arrow 0 can go.
  assert.equal(blocker(board, [true, false], 0).by, -1);
  const res = analyze(board);
  assert.equal(res.solvable, true);
  assert.equal(res.waves, 2);
});

test('only what lies ahead of the head matters, not the rest of the line', () => {
  // A long line whose body passes beside another arrow still leaves freely.
  const board = buildBoard({ w: 3, h: 3, arrows: [[[0, 2], [0, 1], [0, 0], [1, 0], [2, 0]], [[1, 2], [1, 1]]] });
  assert.equal(blocker(board, [true, true], 0).by, -1);
  assert.equal(blocker(board, [true, true], 1).by, 0, 'arrow 1 points up into arrow 0');
});

test('deadlocked arrows are detected as unsolvable', () => {
  // Two arrows in one row pointing at each other.
  const board = buildBoard({ w: 4, h: 1, arrows: [[[0, 0], [1, 0]], [[3, 0], [2, 0]]] });
  assert.equal(analyze(board).solvable, false);
});

test('generated mazes are solvable, gap-free lines, and never self-blocking', () => {
  for (const n of [1, 2, 3, 5, 10, 20, 40]) {
    const level = makeLevel(n);
    const board = buildBoard(level);
    assert.equal(analyze(board).solvable, true, `level ${n} solvable`);
    const seen = new Set();
    for (const path of level.arrows) {
      assert.ok(path.length >= 2);
      for (let k = 0; k < path.length; k++) {
        const [x, y] = path[k];
        assert.ok(x >= 0 && y >= 0 && x < level.w && y < level.h);
        assert.ok(!seen.has(`${x},${y}`), `level ${n}: lines never cross`);
        seen.add(`${x},${y}`);
        if (k) assert.equal(Math.abs(x - path[k - 1][0]) + Math.abs(y - path[k - 1][1]), 1, 'cells adjacent');
      }
      const [dx, dy] = headDir(path);
      assert.equal(Math.abs(dx) + Math.abs(dy), 1);
    }
  }
});

test('same level number, same maze', () => {
  assert.deepEqual(makeLevel(17), makeLevel(17));
  assert.notDeepEqual(makeLevel(17), makeLevel(18));
});

test('mazes get bigger and deeper as levels go on, without limit', () => {
  let prev = specFor(4);
  for (let n = 5; n <= 3000; n++) {
    const s = specFor(n);
    assert.ok(s.w * s.h >= prev.w * prev.h && s.waves[0] >= prev.waves[0] && s.climb >= prev.climb, `level ${n}`);
    prev = s;
  }
  const depth = (n) => analyze(buildBoard(makeLevel(n))).waves;
  assert.ok(depth(5) < depth(30) && depth(30) < depth(60), `${depth(5)} < ${depth(30)} < ${depth(60)}`);
});
