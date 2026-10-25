import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pour, goalMet, solve, explore, makeLevel, starsFor, targetSteps, goalText } from '../games/water/model.js';
import { vessel } from '../games/water/shapes.js';

test('a pour moves water until the source is empty or the target is full', () => {
  assert.deepEqual(pour([8, 5, 3], [8, 0, 0], 0, 1).state, [3, 5, 0]);
  assert.deepEqual(pour([8, 5, 3], [3, 5, 0], 1, 2).state, [3, 2, 3]);
  assert.equal(pour([8, 5, 3], [0, 5, 3], 0, 1), null, 'nothing to pour');
  assert.equal(pour([8, 5, 3], [3, 5, 0], 0, 1), null, 'nowhere to put it');
});

test('the classic 8-5-3 puzzle: 4 in some jug takes 6 pours; 4-4-0 takes 7', () => {
  assert.equal(solve([8, 5, 3], [8, 0, 0], { kind: 'any', amount: 4 }).length, 6);
  const split = solve([8, 5, 3], [8, 0, 0], { kind: 'split', marks: [[0, 4], [1, 4], [2, 0]] });
  assert.equal(split.length, 7);
  // Replaying the moves really gets there.
  let s = [8, 0, 0];
  for (const [i, j] of split) s = pour([8, 5, 3], s, i, j).state;
  assert.deepEqual(s, [4, 4, 0]);
});

test('water is conserved: every reachable state has the same total', () => {
  const { states } = explore([12, 7, 5, 2], [12, 0, 0, 0]);
  assert.ok(states.length > 20);
  assert.ok(states.every((s) => s.reduce((a, b) => a + b) === 12));
});

test('every level is solvable in exactly its par, not already solved, and gets harder', () => {
  let longest = 0;
  for (let n = 1; n <= 60; n++) {
    const l = makeLevel(n);
    assert.ok(!goalMet(l.goal, l.start), `level ${n} not solved at the start`);
    const sol = solve(l.caps, l.start, l.goal);
    assert.ok(sol, `level ${n} solvable`);
    assert.equal(sol.length, l.par, `level ${n} par`);
    assert.ok(l.caps.every((c, i) => l.start[i] <= c));
    assert.ok(goalText(l).length > 5);
    if (n > 30) longest = Math.max(longest, l.par);
    assert.ok(l.par >= 2, `level ${n} takes more than one pour`);
    // Some first pour is a wrong turn: it's never just one obvious move.
    const firsts = [];
    for (let i = 0; i < l.caps.length; i++) for (let j = 0; j < l.caps.length; j++) {
      const m = pour(l.caps, l.start, i, j);
      if (m) firsts.push(solve(l.caps, m.state, l.goal)?.length ?? Infinity);
    }
    assert.ok(firsts.length >= 2 && firsts.some((d) => d >= l.par), `level ${n} has a real choice`);
  }
  assert.ok(longest >= targetSteps(30)[0], `later levels are long (${longest})`);
  assert.deepEqual(makeLevel(17), makeLevel(17), 'same level every time');
  assert.equal(makeLevel(1).caps.length, 3);
  assert.ok(makeLevel(40).caps.length >= 3);
});

test('stars: par or better for three', () => {
  assert.equal(starsFor(6, 6), 3);
  assert.equal(starsFor(8, 6), 2);
  assert.equal(starsFor(20, 6), 1);
});

test('graduations follow the glass: equal steps up a cylinder, crowded in a flask bulb', () => {
  const cyl = vessel('cylinder', 10);
  for (let u = 1; u <= 10; u++) assert.ok(Math.abs(cyl.level(u) - u / 10) < 0.01);
  const flask = vessel('flask', 10);
  const low = flask.level(2) - flask.level(1);
  const high = flask.level(10) - flask.level(9);
  assert.ok(high > 3 * low, 'the narrow neck takes far more height per unit');
  for (const shape of ['cylinder', 'beaker', 'flask', 'round', 'bottle', 'cone']) {
    const v = vessel(shape, 7);
    assert.equal(v.level(0), 0);
    assert.ok(Math.abs(v.level(7) - 1) < 1e-9);
    for (let u = 1; u <= 7; u++) assert.ok(v.level(u) > v.level(u - 1), `${shape} rises`);
  }
});

test('early levels know where the amount should end up (shown as a gold line)', async () => {
  const { endsIn, GUIDED_UNTIL } = await import('../games/water/model.js');
  for (let n = 1; n <= GUIDED_UNTIL; n++) {
    const l = makeLevel(n);
    if (l.goal.kind !== 'any') continue;
    assert.ok(l.target >= 0, `level ${n} has a target beaker`);
    // Following a shortest solution really ends with the amount there.
    let s = l.start;
    for (const [i, j] of solve(l.caps, l.start, l.goal)) s = pour(l.caps, s, i, j).state;
    assert.equal(s[l.target], l.goal.amount);
    assert.equal(endsIn(l.caps, l.start, l.goal), l.target);
  }
});

test('the solution-space map: every state reachable and every pour between them, on a lattice -- each pour a straight line, as long as the amount, along one of six directions (three beakers, flat) or twelve (four, in 3D)', async () => {
  const { spaceGraph, layout } = await import('../games/water/space.js');
  const { explore, makeLevel, solve } = await import('../games/water/model.js');
  const seen = { hex: 0, '3d': 0 };
  for (let n = 1; n <= 40; n++) {
    const level = makeLevel(n);
    const g = spaceGraph(level.caps, level.start, level.goal);
    // The same states the generator explores; the goal among them, as far
    // as par; and every pour from every one of them.
    const { dist } = explore(level.caps, level.start);
    assert.equal(g.nodes.length, dist.size, `level ${n}: all reachable`);
    const nearest = Math.min(...g.nodes.filter((s) => s.goal).map((s) => s.d));
    assert.equal(nearest, level.par, `level ${n}: goal ${level.par} pours away`);
    assert.equal(solve(level.caps, level.start, level.goal).length, nearest);
    const k = level.caps.length;
    let pours = 0;
    for (const { s } of g.nodes) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j && s[i] > 0 && s[j] < level.caps[j]) pours++;
    assert.equal(g.edges.length, pours, `level ${n}: every pour, cross-connected`);
    const { kind, pts } = layout(level.caps, g);
    seen[kind]++;
    assert.deepEqual(pts[0], [0, 0, 0], 'the start at the origin');
    // Each pour i -> j: always the same direction, t times as far.
    const dirs = new Map();
    for (const e of g.edges) {
      const d = [0, 1, 2].map((c) => (pts[e.b][c] - pts[e.a][c]) / e.t);
      const was = dirs.get(`${e.i}${e.j}`);
      if (was) assert.ok(d.every((v, c) => Math.abs(v - was[c]) < 1e-9), 'a straight line along its direction');
      else dirs.set(`${e.i}${e.j}`, d);
    }
    if (kind === 'hex') {
      for (const d of dirs.values()) {
        assert.ok(Math.abs(Math.hypot(...d) - Math.sqrt(3)) < 1e-9 && d[2] === 0);
        const ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
        assert.ok(Math.abs(Math.round(ang / 60) * 60 - ang) < 1e-6, `one of six directions (${ang})`);
      }
    }
    if (k === 4) {
      assert.equal(kind, '3d');
      const at = new Set(pts.map((p) => p.map((v) => v.toFixed(6)).join()));
      assert.equal(at.size, pts.length, 'no two states in the same place');
    }
  }
  assert.ok(seen.hex >= 10 && seen['3d'] >= 3, JSON.stringify(seen));
});
