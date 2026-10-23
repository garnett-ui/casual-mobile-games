import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeLevel, makeTerrain, newLander, step, simulate, heightAt, scoreLanding, missionKind, planRoute, inRock,
  G, SAFE, ROT_ACCEL, HEIGHT,
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
  // ...until countered; whatever's left (under 1.5°/s) fades, halving
  // every second (assist off).
  fly(level, L, { left: true }, 0.49);
  const rest = L.omega;
  assert.ok(rest > 0 && rest < ROT_ACCEL * 0.03, `a little left over (${rest})`);
  fly(level, L, idle, 1);
  assert.ok(Math.abs(L.omega / rest - 0.5) < 0.02, `halved in a second (${L.omega / rest})`);
  fly(level, L, idle, 1);
  assert.ok(Math.abs(L.omega / rest - 0.25) < 0.02, 'and again');
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
  // Touching down with the engine still firing: it's shut off on landing.
  const L = newLander(level, 100);
  L.landed = null;
  L.x = (level.base.x0 + level.base.x1) / 2;
  L.y = level.base.y + 0.01;
  L.vy = -1;
  const res = step(level, L, { thrust: true }, 1 / 60);
  assert.equal(res.kind, 'landed');
  assert.equal(L.thrusting, false, 'engine off once landed');
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
  for (const n of [1, 2, 3, 5, 8, 11, 12, 13, 16, 20]) {
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

test('mission 1 is a short hop over flat ground; mountains come later', async () => {
  const one = makeTerrain(1);
  const hop = (one.base.x0 + one.base.x1) / 2 - (one.startPad.x0 + one.startPad.x1) / 2;
  assert.ok(hop >= 20 && hop <= 40, `hop ${hop}`);
  assert.ok(Math.max(...one.terrain) - Math.min(...one.terrain) < 8, 'flat');
  const two = makeTerrain(2);
  assert.ok(Math.max(...two.terrain) - two.startPad.y < 10, 'mission 2: still no hills');
  const six = makeTerrain(6);
  assert.ok(Math.max(...six.terrain) - six.startPad.y > 60, 'mission 6: a real hill');
});

test('the early missions differ in shape: high and low bases, ranges, false valleys', () => {
  const kinds = new Set();
  for (let n = 1; n <= 10; n++) kinds.add(missionKind(n));
  assert.ok(kinds.size >= 7, [...kinds].join(' '));
  const down = makeTerrain(4);
  assert.ok(down.startPad.y - down.base.y > 25, 'mission 4: the base is well below the start');
  const mesa = makeTerrain(6);
  assert.ok(mesa.base.y - mesa.startPad.y > 40, 'mission 6: the base is up on a mesa');
  const crater = makeTerrain(10);
  assert.ok(crater.startPad.y - crater.base.y > 40, 'mission 10: the base is down in a crater');
  // A range has dips between its peaks lower than the plain around them.
  const range = makeTerrain(8);
  const mid = range.terrain.slice(20, -20);
  assert.ok(Math.min(...mid) < range.startPad.y - 10, 'mission 8: false valleys');
});

test('from mission 11: a cave, a tunnel and a shaft, flown through by the route, rock overhead', () => {
  assert.deepEqual([11, 12, 13, 14, 15].map(missionKind).slice(0, 3), ['cave', 'tunnel', 'shaft']);
  for (const n of [11, 12, 13, 17]) {
    const level = makeTerrain(n);
    assert.ok(level.rocks.length, `mission ${n} has overhanging rock`);
    // The planned route passes under rock somewhere.
    const plan = planRoute(level);
    let under = false;
    for (let k = 1; k < plan.length; k++) {
      for (let u = 0; u <= 1; u += 0.05) {
        const x = plan[k - 1].x + (plan[k].x - plan[k - 1].x) * u;
        const y = plan[k - 1].y + (plan[k].y - plan[k - 1].y) * u;
        // Down below the rock, within its span: inside the cave, tunnel or cavern.
        const r0 = Math.min(...level.rocks.map((p) => p.x0));
        const r1 = Math.max(...level.rocks.map((p) => p.x1));
        if (x > r0 && x < r1 && y < Math.min(...level.rocks.flatMap((p) => p.lo))) under = true;
        assert.ok(!inRock(level, x, y) && !inRock(level, x, y + HEIGHT), `route clear of rock (mission ${n})`);
      }
    }
    assert.ok(under, `mission ${n}: the route goes in under the rock`);
  }
  // Later ones are tighter.
  const room = (level) => {
    const p = level.rocks[0];
    return Math.min(...p.lo.map((lo, k) => lo - heightAt(level, p.x0 + k * level.step)).filter((d) => d > 0));
  };
  assert.ok(room(makeTerrain(23)) < room(makeTerrain(11)), 'caves get lower');
  // Fly up into the cave roof: a crash.
  const cave = makeTerrain(11);
  const L = newLander(cave, 100);
  L.landed = null;
  L.x = (cave.base.x0 + cave.base.x1) / 2;
  L.y = cave.base.y + 4;
  const res = fly(cave, L, { thrust: true }, 10);
  assert.equal(res.kind, 'crash');
  assert.match(res.reason, /rock/);
});

test('stability assist: rotation is a spring -- held, it settles at 20°; let go, it springs back', async () => {
  const { ASSIST_TILT } = await import('../games/lander/engine.js');
  const level = makeTerrain(1);
  const L = airborne(level);
  let most = 0;
  for (let t = 0; t < 4; t += 1 / 120) {
    step(level, L, { right: true, assist: true }, 1 / 120);
    most = Math.max(most, Math.abs(L.angle));
  }
  const deg = (a) => ((a * 180) / Math.PI).toFixed(1);
  assert.ok(Math.abs(L.angle - ASSIST_TILT) < 0.01, `settles at 20° (${deg(L.angle)}°)`);
  assert.ok(most < (22 * Math.PI) / 180, `barely overshoots, never near 45° (max ${deg(most)}°)`);
  fly(level, L, { assist: true }, 1.2);
  assert.ok(Math.abs(L.angle) < (2 * Math.PI) / 180, `back near level within ~1 s (${deg(L.angle)}°)`);
  fly(level, L, { assist: true }, 2);
  assert.ok(Math.abs(L.angle) < 0.01 && Math.abs(L.omega) < 0.01, 'level again');
});

test('stability assist: sideways drift dies away once level (but not without assist)', () => {
  const level = makeTerrain(1);
  const drift = (assist) => {
    const L = airborne(level);
    L.vx = 4;
    fly(level, L, { assist }, 5);
    return Math.abs(L.vx);
  };
  assert.ok(drift(true) < 0.3, `damped (${drift(true).toFixed(2)} m/s left)`);
  assert.ok(Math.abs(drift(false) - 4) < 0.01, 'coasts on without assist');
});

test('show me: the autopilot picks the way of flying that scores best, and lands', async () => {
  const { bestTilt, autopilot } = await import('../games/lander/engine.js');
  for (const n of [3, 11]) {
    const level = makeLevel(n);
    const tilt = bestTilt(level);
    assert.ok(tilt >= 15 && tilt <= 35, `mission ${n}: ${tilt}°`);
    const L = newLander(level, level.fuel);
    let res = null;
    for (let t = 0; t < 900 && (!res || res.kind === 'touchdown'); t += 1 / 120) res = step(level, L, autopilot(level, L, tilt), 1 / 120);
    assert.equal(res.kind, 'landed', `mission ${n}`);
    assert.ok(res.score.total > 700, `mission ${n} scores ${res.score.total}`);
  }
});

test('side thrusters are balanced: equal bursts left and right cancel exactly (assist off)', () => {
  const level = makeLevel(1);
  for (const [first, second] of [['right', 'left'], ['left', 'right']]) {
    for (const secs of [0.2, 0.5, 1.5]) {
      const L = airborne(level);
      fly(level, L, { [first]: true }, secs);
      assert.ok(Math.abs(L.omega) > 0.05, 'spinning');
      fly(level, L, { [second]: true }, secs);
      assert.ok(Math.abs(L.omega) < 1e-9, `${first} then ${second}, ${secs}s each: ${L.omega}`);
    }
  }
});

test('small spins fade (under 1.5°/s, halving every second); faster ones keep going; taps nudge the way they point (assist off)', () => {
  const level = makeLevel(1);
  const deg = Math.PI / 180;
  // Faster than 1.5°/s: no fade.
  const fast = airborne(level);
  fast.omega = 2 * deg;
  fly(level, fast, {}, 3);
  assert.ok(Math.abs(fast.omega - 2 * deg) < 1e-12);
  // One small tap: a nudge the way it points, then it coasts to a stop.
  for (const tap of [1 / 60, 0.04]) {
    const L = airborne(level);
    L.angle = 3 * deg;
    L.omega = 0;
    fly(level, L, { left: true }, tap);
    const w = -L.omega;
    fly(level, L, {}, 12);
    assert.ok(Math.abs(L.omega) < 0.01 * deg, `stopped (${L.omega / deg}°/s)`);
    // (The coast: w / ln 2 degrees, all told.)
    assert.ok(Math.abs(3 * deg - L.angle - w / Math.LN2) < 0.05 * deg, `a nudge left of ${((3 * deg - L.angle) / deg).toFixed(2)}°`);
  }
  // A quick tap left then right: still a nudge left, and nearly still.
  for (const [tap, gap] of [[0.03, 0.1], [0.05, 0.2]]) {
    const L = airborne(level);
    L.angle = 3 * deg;
    L.omega = 0;
    fly(level, L, { left: true }, tap);
    fly(level, L, {}, gap);
    fly(level, L, { right: true }, tap);
    assert.ok(Math.abs(L.omega) < 0.2 * deg, `nearly still (${(L.omega / deg).toFixed(2)}°/s)`);
    fly(level, L, {}, 12);
    assert.ok(L.angle < 3 * deg, 'the lean came down');
    assert.ok(Math.abs(L.omega) < 0.01 * deg);
  }
});

test('clearance: the nearest surface in any direction -- the walls of a shaft, not just the floor far below', async () => {
  const { clearance, topAt } = await import('../games/lander/engine.js');
  const level = makeLevel(25);
  assert.equal(missionKind(25), 'shaft');
  // Halfway down the shaft (its centre: where the rock either side is
  // furthest), the floor far below, the walls close beside.
  const shaft = level.rocks[0].x1 + 1;
  const wall = level.rocks[1].x0;
  const x = (shaft + wall) / 2;
  const y = (level.base.y + topAt(level, x - 30)) / 2;
  const below = y - heightAt(level, x);
  const near = clearance(level, x, y);
  assert.ok(below > 40, `well above the floor (${below.toFixed(0)} m)`);
  assert.ok(near < 12, `but walls close by (${near.toFixed(1)} m)`);
  // Out in the open, it's just the height above the ground.
  const open = makeLevel(1);
  const h = heightAt(open, 100);
  assert.ok(Math.abs(clearance(open, 100, h + 30) - 30) < 3);
});

test('down a shaft the far hills are hidden (they would look like ground just below); out in the open they show', async () => {
  const { underRock } = await import('../games/lander/engine.js');
  const level = makeLevel(25);
  const x = (level.rocks[0].x1 + 1 + level.rocks[1].x0) / 2;
  const top = Math.max(...level.rocks[0].hi);
  assert.ok(underRock(level, x, (level.base.y + top) / 2) > 15, 'halfway down: well below the rim');
  assert.equal(underRock(level, x, top + 10), 0, 'above the rim');
  const open = makeLevel(1);
  assert.equal(underRock(open, 100, heightAt(open, 100) + 5), 0);
});
