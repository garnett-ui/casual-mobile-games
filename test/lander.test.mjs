import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeLevel, makeTerrain, newLander, step, simulate, heightAt, scoreLanding,
  G, SAFE, ROT_ACCEL, HOLD_BAND,
} from '../games/lander/engine.js';

const idle = { thrust: false, left: false, right: false };
const fly = (level, L, input, seconds) => {
  let res = null;
  for (let t = 0; t < seconds && !res; t += 1 / 120) res = step(level, L, input, 1 / 120);
  return res;
};
// Put the lander in free flight high above the start pad.
const airborne = (level) => {
  const L = newLander(level, 200);
  L.landed = null;
  L.y += 200;
  return L;
};

test('falls under lunar gravity, and the main engine climbs once fuel is light enough', () => {
  const level = makeTerrain(1);
  const L = airborne(level);
  fly(level, L, idle, 1);
  assert.ok(Math.abs(L.vy + G) < 0.02, `vy after 1 s = ${L.vy}`);
  const L2 = airborne(level);
  fly(level, L2, { thrust: true }, 2);
  assert.ok(L2.vy > 0, 'thrust beats gravity');
  assert.ok(L2.fuel < 200, 'and burns fuel');
});

test('side thrusters change the spin rate, not the angle directly (rotational inertia)', () => {
  const level = makeTerrain(1);
  const L = airborne(level);
  fly(level, L, { right: true }, 0.5);
  const w = L.omega;
  assert.ok(Math.abs(w - ROT_ACCEL * 0.5) < 0.01);
  // Let go: a fast spin keeps going...
  fly(level, L, idle, 0.5);
  assert.ok(Math.abs(L.omega - w) < 1e-9, 'keeps spinning');
  // ...until countered. Then attitude hold mops up the small remainder.
  fly(level, L, { left: true }, 0.45);
  assert.ok(Math.abs(L.omega) < HOLD_BAND);
  fly(level, L, idle, 1.5);
  assert.equal(L.omega, 0, 'small residual spin is held to zero');
});

test('running out of fuel cuts the engines', () => {
  const level = makeTerrain(1);
  const L = airborne(level);
  L.fuel = 0.5;
  fly(level, L, { thrust: true }, 2);
  assert.equal(L.fuel, 0);
  assert.equal(L.thrusting, false);
});

test('a gentle landing on the base scores; hard, tilted or fast ones crash', () => {
  const level = makeTerrain(2);
  const land = (vy, vx = 0, angle = 0) => {
    const L = newLander(level, 100);
    L.landed = null;
    L.x = (level.base.x0 + level.base.x1) / 2;
    L.y = level.base.y + 0.05;
    L.vy = -vy;
    L.vx = vx;
    L.angle = angle;
    return fly(level, L, idle, 1);
  };
  const soft = land(0.4);
  assert.equal(soft.kind, 'landed');
  assert.ok(soft.score.total > 700 && soft.score.stars === 3, JSON.stringify(soft.score));
  const firm = land(1.9, 0.8);
  assert.equal(firm.kind, 'landed');
  assert.ok(firm.score.total < soft.score.total);
  assert.equal(land(SAFE.vy + 1).kind, 'crash');
  assert.equal(land(0.5, SAFE.vx + 0.5).kind, 'crash');
  assert.equal(land(0.5, 0, SAFE.angle + 0.1).kind, 'crash');
});

test('touching down safely away from the base is not a win, and you can lift off again', () => {
  const level = makeTerrain(1);
  const L = newLander(level, 100);
  assert.equal(L.landed, 'start');
  fly(level, L, { thrust: true }, 1);
  assert.equal(L.landed, null, 'lifted off');
  const res = fly(level, L, idle, 10);
  assert.equal(res.kind, 'touchdown');
  assert.equal(res.where, 'start');
});

test('every mission is flyable (autopilot lands it) and gets harder', () => {
  let prevMargin = Infinity;
  for (const n of [1, 2, 3, 5, 8, 12, 16, 20]) {
    const level = makeLevel(n);
    assert.ok(level.checked, `mission ${n} checked`);
    const run = simulate(level, level.fuel);
    assert.equal(run.kind, 'landed', `mission ${n} landable with its fuel`);
    const margin = level.fuel / simulate(level).used; // vs the generator's reference run
    assert.ok(margin <= prevMargin + 0.05, `fuel margin shrinks (${n}: ${margin.toFixed(2)})`);
    prevMargin = margin;
  }
  const a = makeTerrain(2);
  const b = makeTerrain(14);
  assert.ok(b.width > a.width && b.base.x1 - b.base.x0 < a.base.x1 - a.base.x0);
  assert.ok(Math.max(...b.terrain) > Math.max(...a.terrain));
  assert.ok(heightAt(a, a.base.x0 + 1) === a.base.y, 'base pad is flat');
  assert.ok(scoreLanding);
});
