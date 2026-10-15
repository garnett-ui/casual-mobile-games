import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, occupancy, slide, solve, obviouslyStuck, generateLevel, randomLayout, rng, FENCE, EMPTY } from '../games/car-jam/model.js';
import LEVELS from '../games/car-jam/levels.js';
import { LEVEL_COUNT, tierFor } from '../games/car-jam/tiers.js';

test('a car with a clear path drives out of the lot', () => {
  const m = buildModel({ w: 4, h: 1, cars: [[1, 0, 2, 'E']] });
  const r = slide(m, occupancy(m, m.start), m.start, 0, 1);
  assert.equal(r.exit, true);
  assert.equal(r.edge, 'E');
  assert.equal(r.to, -1);
});

test('a car stops when it reaches another car', () => {
  // Horizontal car at x=0..1 in row 1, vertical car blocking column 3.
  const m = buildModel({ w: 5, h: 3, cars: [[0, 1, 2, 'E'], [3, 0, 2, 'S']] });
  const r = slide(m, occupancy(m, m.start), m.start, 0, 1);
  assert.equal(r.exit, false);
  assert.equal(r.to, 1);
  assert.equal(r.dist, 1);
  assert.equal(r.blocker, 1);
});

test('a blocked car does not move at all', () => {
  const m = buildModel({ w: 4, h: 1, cars: [[0, 0, 2, 'E'], [2, 0, 2, 'E']] });
  const r = slide(m, occupancy(m, m.start), m.start, 0, 1);
  assert.equal(r.dist, 0);
  assert.equal(r.blocker, 1);
});

test('hedges stop cars at the lot edge', () => {
  const m = buildModel({ w: 4, h: 1, cars: [[0, 0, 2, 'E']], fence: { E: [0] } });
  const r = slide(m, occupancy(m, m.start), m.start, 0, 1);
  assert.equal(r.exit, false);
  assert.equal(r.to, 2);
  assert.equal(r.blocker, FENCE);
});

test('obstacles block cars', () => {
  const m = buildModel({ w: 4, h: 1, cars: [[0, 0, 2, 'E']], obs: [[3, 0, 'cone']] });
  const r = slide(m, occupancy(m, m.start), m.start, 0, 1);
  assert.equal(r.to, 1);
  assert.equal(occupancy(m, m.start)[2], EMPTY);
});

// Plain breadth-first search over every move, no shortcuts: the reference
// the real solver's exit-draining optimisation must agree with.
function naiveShortest(m) {
  const key = (p) => p.join(',');
  let frontier = [m.start.slice()];
  const seen = new Set([key(m.start)]);
  for (let depth = 0; frontier.length && depth < 60; depth++) {
    const next = [];
    for (const pos of frontier) {
      if (pos.every((v) => v < 0)) return depth;
      const occ = occupancy(m, pos);
      for (let i = 0; i < pos.length; i++) {
        if (pos[i] < 0) continue;
        for (const sign of [1, -1]) {
          const r = slide(m, occ, pos, i, sign);
          if (r.dist === 0) continue;
          const np = pos.slice();
          np[i] = r.to;
          if (!seen.has(key(np))) {
            seen.add(key(np));
            next.push(np);
          }
        }
      }
    }
    frontier = next;
  }
  return null;
}

test('solver matches exhaustive search on small random lots', () => {
  const r = rng(99);
  for (let k = 0; k < 400; k++) {
    const level = randomLayout(r, { w: 5, h: 5, obstacles: 2, fenceRate: 0.3, truckRate: 0.2, density: 0.8 });
    const m = buildModel(level);
    const fast = solve(m, m.start);
    const slow = naiveShortest(m);
    assert.equal(fast ? fast.total : null, slow, JSON.stringify(level));
  }
});

test('solver handles lots where a car must first be moved aside', () => {
  const m = buildModel({
    w: 4, h: 4,
    cars: [[2, 0, 2, 'S'], [0, 2, 2, 'N'], [0, 0, 2, 'W'], [1, 3, 2, 'E']],
    obs: [[3, 2, 'tree'], [3, 1, 'cone']],
    fence: { N: [1, 2], E: [2, 3], S: [0, 1], W: [0, 1] },
  });
  const sol = solve(m, m.start);
  assert.equal(sol.shuffles, 1);
  assert.equal(sol.total, 5);
  assert.equal(naiveShortest(m), 5);
});

test('obviously unsolvable layouts are detected', () => {
  const m = buildModel({ w: 3, h: 1, cars: [[0, 0, 2, 'E']], fence: { E: [0], W: [0] } });
  assert.equal(obviouslyStuck(m), true);
  assert.equal(solve(m, m.start), null);
});

test(`campaign has ${LEVEL_COUNT} valid, solvable levels with the right par`, () => {
  assert.equal(LEVELS.length, LEVEL_COUNT);
  LEVELS.forEach((level, k) => {
    const m = buildModel(level);
    const seen = new Set();
    const mark = (x, y) => {
      assert.ok(x >= 0 && y >= 0 && x < level.w && y < level.h, `level ${k + 1}: in bounds`);
      assert.ok(!seen.has(`${x},${y}`), `level ${k + 1}: no overlap at ${x},${y}`);
      seen.add(`${x},${y}`);
    };
    for (const [x, y] of level.obs) mark(x, y);
    for (const c of m.cars) for (let i = 0; i < c.len; i++) mark(c.horiz ? c.x + i : c.x, c.horiz ? c.y : c.y + i);
    const sol = solve(m, m.start);
    assert.ok(sol, `level ${k + 1} solvable`);
    assert.equal(sol.total, level.par, `level ${k + 1} par`);
  });
});

test('levels get bigger as the campaign goes on', () => {
  const area = (l) => l.w * l.h;
  assert.ok(area(LEVELS[0]) < area(LEVELS[19]));
  assert.ok(area(LEVELS[19]) < area(LEVELS[LEVEL_COUNT - 1]));
});

test('bonus level generation is deterministic and solvable', () => {
  const tier = tierFor(LEVEL_COUNT + 5);
  const a = generateLevel(1234, tier.spec, 40);
  const b = generateLevel(1234, tier.spec, 40);
  assert.deepEqual(a, b);
  const m = buildModel(a);
  assert.equal(solve(m, m.start).total, a.par);
});
