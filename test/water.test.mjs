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
  }
  assert.ok(longest >= targetSteps(30)[0], `later levels are long (${longest})`);
  assert.deepEqual(makeLevel(17), makeLevel(17), 'same level every time');
  assert.equal(makeLevel(1).caps.length, 2);
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
