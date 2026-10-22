import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Solver, goalOf, isSolvable, scramble, shuffle, apply, neighbours } from '../games/fifteen/solver.js';
import { rng } from '../js/lib/random.js';

const reaches = (solver, board, path) => {
  let s = board;
  const nb = neighbours(solver.w, solver.h);
  for (const c of path) {
    assert.ok(nb[s.indexOf(0)].includes(c), 'a legal move');
    s = apply(s, c);
  }
  return s.join() === solver.goal.join();
};

test('small boards: a table of every position -- half of them reachable, the farthest as far as known', () => {
  // (The farthest positions: 21 moves on 2x3, 36 on 2x4, 31 on 3x3.)
  for (const [w, h, far] of [[3, 2, 21], [4, 2, 36], [3, 3, 31]]) {
    const s = new Solver(w, h);
    const t = s.table();
    let reached = 0;
    let most = 0;
    for (const d of t) if (d !== 255) (reached++, (most = Math.max(most, d)));
    assert.equal(reached, t.length / 2, `${w}x${h}: half`);
    assert.equal(most, far, `${w}x${h}: farthest`);
  }
});

test('solvable: the parity rule agrees with the table, for every 3x3 arrangement tried', () => {
  const s = new Solver(3, 3);
  const r = rng(1);
  for (let k = 0; k < 2000; k++) {
    const board = goalOf(3, 3);
    for (let i = board.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [board[i], board[j]] = [board[j], board[i]];
    }
    assert.equal(isSolvable(board, s.goal, 3), s.table()[s.rank(board)] !== 255);
  }
  // ...and for 4x4: the famous 14-15 swap can't be done.
  const loyd = goalOf(4, 4);
  [loyd[13], loyd[14]] = [loyd[14], loyd[13]];
  assert.equal(isSolvable(loyd, goalOf(4, 4), 4), false);
  assert.equal(isSolvable(goalOf(4, 4), goalOf(4, 4), 4), true);
});

test('scrambles and shuffles are always solvable', () => {
  const r = rng(2);
  for (const [w, h] of [[3, 3], [4, 3], [4, 4], [5, 5]]) {
    const goal = goalOf(w, h);
    for (let k = 0; k < 200; k++) {
      assert.ok(isSolvable(scramble(goal, w, h, 1 + Math.floor(r() * 80), r), goal, w));
      assert.ok(isSolvable(shuffle(goal, w, r), goal, w));
    }
  }
});

test('the search finds the same distances as the table (3x3, searched)', () => {
  const s = new Solver(3, 3);
  const r = rng(3);
  // A searching solver for 3x3, as if it were too big for a table.
  const searcher = new Solver(3, 3);
  searcher.groups = () => [[1, 2, 3, 4], [5, 6, 7, 8]];
  for (let k = 0; k < 150; k++) {
    const board = shuffle(s.goal, 3, r);
    const path = searcher.search(board, Infinity);
    assert.equal(path.length, s.distance(board));
    assert.ok(reaches(s, board, path));
    assert.ok(searcher.estimate(board) <= path.length, 'never overestimates');
  }
});

test('3x4: exact by search, the line it gives solves it, the estimate never over', () => {
  const s = new Solver(4, 3);
  const r = rng(4);
  for (let k = 0; k < 30; k++) {
    const board = shuffle(s.goal, 4, r);
    const path = s.solve(board);
    assert.ok(reaches(s, board, path));
    assert.ok(s.estimate(board) <= path.length);
    assert.equal(path.length % 2, s.estimate(board) % 2, 'same parity as the bound');
  }
});

test('4x4: known optimal solutions (Korf\'s instances)', () => {
  // (Korf 1985: goal with the gap top left; instances 1 and 2 -- 57 and 55
  // moves -- plus easier ones made by scrambling.)
  const korf = Array.from({ length: 16 }, (_, i) => i);
  const s = new Solver(4, 4, korf);
  for (const [board, d] of [
    [[14, 13, 15, 7, 11, 12, 9, 5, 6, 0, 2, 1, 4, 8, 10, 3], 57],
    [[13, 5, 4, 10, 9, 12, 8, 14, 2, 3, 7, 1, 0, 15, 11, 6], 55],
  ]) {
    const path = s.solve(board);
    assert.equal(path.length, d);
    assert.ok(reaches(s, board, path));
  }
});

test('following a game: every move one more or one less; the moves are the distance plus two for every wrong way', () => {
  const r = rng(5);
  for (const [w, h, depth] of [[3, 3, 40], [4, 3, 30], [4, 4, 30]]) {
    const s = new Solver(w, h);
    const start = scramble(s.goal, w, h, depth, r);
    // A wandering player: mostly the best move, sometimes a random one.
    const moves = [];
    let board = start;
    const nb = neighbours(w, h);
    for (let k = 0; k < 300 && board.join() !== s.goal.join(); k++) {
      const m = r() < 0.75 ? s.hint(board) : nb[board.indexOf(0)][Math.floor(r() * nb[board.indexOf(0)].length)];
      moves.push(m);
      board = apply(board, m);
    }
    assert.equal(board.join(), s.goal.join(), `${w}x${h} solved`);
    const ds = s.walk(start, moves);
    assert.equal(ds.length, moves.length + 1);
    assert.equal(ds.at(-1), 0);
    let up = 0;
    for (let i = 1; i < ds.length; i++) {
      assert.equal(Math.abs(ds[i] - ds[i - 1]), 1, `${w}x${h} move ${i}`);
      if (ds[i] > ds[i - 1]) up++;
    }
    assert.equal(moves.length, ds[0] + 2 * up);
    // The line kept along the way is always a best one.
    const t = s.track(start);
    for (const m of moves.slice(0, 60)) {
      t.move(m);
      assert.equal(t.line.length, t.d);
      assert.ok(reaches(s, t.board, t.line));
    }
    // ...and each, exactly.
    for (let i = 0, b = start; i < ds.length; i += 7) {
      assert.equal(ds[i], s.distance(b), `${w}x${h} after ${i}`);
      for (let j = i; j < i + 7 && j < moves.length; j++) b = apply(b, moves[j]);
    }
  }
});

// ------------------------------------------------------------- levels

const { makeLevel, levelPlan, starsFor, review } = await import('../games/fifteen/levels.js');

test('levels: the same every time, always solvable, small ones exactly as far as planned', () => {
  for (let n = 1; n <= 40; n++) {
    const a = makeLevel(n);
    assert.deepEqual(makeLevel(n), a, `level ${n} the same`);
    const [w, h, , how] = levelPlan(n);
    assert.equal(a.w, w);
    assert.equal(a.h, h);
    assert.ok(isSolvable(a.board, goalOf(w, h), w), `level ${n} solvable`);
    assert.notEqual(a.board.join(), goalOf(w, h).join(), `level ${n} not solved already`);
    if (w * h <= 9) assert.equal(new Solver(w, h).distance(a.board), how, `level ${n} at distance ${how}`);
  }
});

test('score: wrong-way moves and stars; the walk reviewed', () => {
  assert.equal(starsFor(20, 0), 3);
  assert.equal(starsFor(20, 4), 3);
  assert.equal(starsFor(20, 5), 2);
  assert.equal(starsFor(20, 20), 2);
  assert.equal(starsFor(20, 21), 1);
  assert.equal(starsFor(20, 0, true), 2, 'a hint takes the third');
  // 5 to go; two wrong ways, back, then straight home.
  const r = review([5, 4, 5, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(r, { best: 5, moves: 9, wrong: 2, climb: 2, climbAt: 2, finish: 6, top: 6 });
  assert.equal(r.moves, r.best + 2 * r.wrong);
});

test('levels: every board size starts with plain numbers, and only then has pictures and sequences', () => {
  const seen = new Map(); // size -> has it had a picture or sequence yet
  for (let n = 1; n <= 25; n++) {
    const [w, h, kind] = levelPlan(n);
    const size = `${w}x${h}`;
    if (!seen.has(size)) assert.equal(kind, 'numbers', `level ${n}: ${size} opens with numbers`);
    if (kind !== 'numbers') seen.set(size, true);
    else assert.ok(!seen.get(size), `level ${n}: numbers on ${size} after its patterns`);
    if (!seen.has(size)) seen.set(size, false);
  }
});
