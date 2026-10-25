import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeLevel, makeTerrain, newLander, step, simulate, heightAt, scoreLanding, missionKind, planRoute, inRock, underRock,
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
  // Let go: a fast spin keeps going, just as it was...
  fly(level, L, idle, 0.5);
  assert.ok(Math.abs(L.omega - w) < 1e-9, 'keeps spinning');
  // ...until countered.
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

test('from mission 27: switchbacks and zigzags join in, and the caves, tunnels and shafts keep getting tighter', async () => {
  const { bestFlight } = await import('../games/lander/pilot.js');
  assert.deepEqual([27, 28, 29, 31, 32].map(missionKind), ['switchback', 'tunnel', 'shaft', 'zigzag', 'cave']);
  // The switchback: the route goes down, along, down again and back --
  // turning back on itself under the rock.
  const sb = makeLevel(27);
  const xs = sb.keys.map((k) => k.x);
  const ys = sb.keys.map((k) => k.y);
  assert.ok(xs[2] > xs[1] && xs[4] < xs[3], 'along the gallery, then back under it');
  assert.ok(ys[1] < ys[0] && ys[3] < ys[2], 'two drops');
  for (const k of sb.keys.slice(1)) assert.ok(underRock(sb, k.x, k.y + HEIGHT) > 0 && !inRock(sb, k.x, k.y) && !inRock(sb, k.x, k.y + HEIGHT));
  // The zigzag: up and down more than the plain tunnel's one gentle hump.
  const zz = makeLevel(31);
  const inner = zz.keys.filter((k) => k.direct).map((k) => k.y);
  let turns = 0;
  for (let i = 2; i < inner.length; i++) if ((inner[i] - inner[i - 1]) * (inner[i - 1] - inner[i - 2]) < 0) turns++;
  assert.ok(turns >= 2, `${turns} turns`);
  // Tighter: a lower tunnel and a narrower shaft than the time before.
  const gap = (level) => Math.min(...level.rocks[0].lo.map((lo, k) => lo - heightAt(level, level.rocks[0].x0 + k * level.step)).filter((d) => d > 0));
  assert.ok(gap(makeTerrain(32)) < gap(makeTerrain(23)) && gap(makeTerrain(34)) < gap(makeTerrain(24)), 'lower');
  const shaftWidth = (level) => level.rocks[1].x0 - level.rocks[0].x1;
  assert.ok(shaftWidth(makeTerrain(35)) < shaftWidth(makeTerrain(25)), 'narrower');
  // All flyable, by the careful pilot and the fast one.
  for (const n of [27, 28, 29, 31, 33]) {
    const level = makeLevel(n);
    assert.ok(level.checked, `mission ${n} checked`);
    assert.equal(bestFlight(level)?.res.kind, 'landed', `mission ${n}: the fastest flight lands`);
  }
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

test('show me (and the route shown): the autopilot’s fastest flight -- a curve, at full push, landing safely', async () => {
  const { bestFlight, flyPlan } = await import('../games/lander/pilot.js');
  for (const n of [1, 3, 5, 8, 11, 12, 13, 17, 20, 25]) {
    const level = makeLevel(n);
    const best = bestFlight(level);
    assert.equal(best?.res.kind, 'landed', `mission ${n} lands`);
    assert.ok(best.res.score.total > 600, `mission ${n} scores ${best.res.score.total}`);
    // Far quicker than the careful pilot that sizes the fuel, with the
    // level's own fuel, and about as quick as planned.
    const careful = simulate(level, level.fuel);
    assert.ok(best.time < careful.time * 0.8, `mission ${n}: ${best.time.toFixed(0)} s vs ${careful.time.toFixed(0)} s`);
    assert.ok(best.time < best.plan.time * 1.1 + 5, `mission ${n} flown as planned`);
    // The same flight every time (Show me replays it step for step).
    const again = flyPlan(level, best.plan);
    assert.deepEqual(again.path, best.path);
    // Over open ground, not a climb, a traverse and a descent: rarely level,
    // rarely straight up or down. (Caves and tunnels are level inside.)
    if (level.rocks.length) continue;
    const open = best.path.slice(8, -24);
    let square = 0;
    for (let i = 1; i < open.length; i++) {
      const a = Math.atan2(Math.abs(open[i][1] - open[i - 1][1]), Math.abs(open[i][0] - open[i - 1][0]));
      if (a < 0.03 || a > Math.PI / 2 - 0.03) square++;
    }
    assert.ok(square <= open.length * 0.2, `mission ${n}: ${square} of ${open.length} legs level or upright`);
  }
  // Mostly at the engine's full push.
  assert.equal(bestFlight(makeLevel(7)).push, 1);
});

test('side thrusters are balanced: equal bursts left and right cancel exactly (assist off)', () => {
  const level = makeLevel(1);
  for (const [first, second] of [['right', 'left'], ['left', 'right']]) {
    for (const secs of [0.2, 0.5, 1.5]) {
      const L = airborne(level);
      fly(level, L, { [first]: true }, secs);
      assert.ok(Math.abs(L.omega) > 0.015, 'spinning');
      fly(level, L, { [second]: true }, secs);
      assert.ok(Math.abs(L.omega) < 1e-9, `${first} then ${second}, ${secs}s each: ${L.omega}`);
    }
  }
});

test('side thrusters (the same for you and the autopilots): a quick tap is a touch of 1.3°/s; only spins under 2°/s ebb away (assist off)', async () => {
  const { SPIN_FADE } = await import('../games/lander/engine.js');
  const level = makeLevel(1);
  const deg = Math.PI / 180;
  // A tenth-of-a-second tap: 1.3°/s; a second's hold, 13°/s.
  const L = airborne(level);
  fly(level, L, { right: true }, 0.1);
  assert.ok(Math.abs(L.omega - 1.3 * deg) < 0.15 * deg, `${(L.omega / deg).toFixed(2)}°/s`); // (to a physics step)
  const H = airborne(level);
  fly(level, H, { right: true }, 1);
  assert.ok(Math.abs(H.omega - 13 * deg) < 0.25 * deg, `${(H.omega / deg).toFixed(2)}°/s`);
  // The tap ebbs away to a stop, a nudge of under 2 degrees.
  const a0 = L.angle;
  const w = L.omega;
  fly(level, L, {}, 4);
  assert.equal(L.omega, 0);
  assert.ok(Math.abs(L.angle - a0 - w ** 2 / (2 * SPIN_FADE)) < 0.02 * deg);
  assert.ok(L.angle - a0 < 2 * deg);
  // Equal taps left and right cancel exactly.
  for (const tap of [0.05, 0.1, 0.3, 0.8]) {
    const T = airborne(level);
    fly(level, T, { left: true }, tap);
    fly(level, T, { right: true }, tap);
    assert.ok(Math.abs(T.omega) < 1e-9, `${tap}s each`);
  }
  // A spin of 2°/s or more doesn't fade at all.
  for (const rate of [2, 4, 20]) {
    const F = airborne(level);
    F.omega = rate * deg;
    fly(level, F, {}, 2);
    assert.ok(Math.abs(F.omega - rate * deg) < 1e-9, `${rate}°/s`);
  }
  assert.ok(Math.abs(ROT_ACCEL - 13 * deg) < 1e-12);
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

test('Apollo 11: the computer flies down from orbit through High Gate to Low Gate -- and on into West crater', async () => {
  const { makeApollo, startApollo, computer, handedOver, GATES, FUEL_SPARE, PDI } = await import('../games/lander/apollo.js');
  const { hoverSeconds, MOON_R } = await import('../games/lander/engine.js');
  const level = makeApollo();
  const { XC, XS } = level.apollo;
  // In orbit, the Moon's curve all but cancels its gravity.
  assert.ok(Math.abs(PDI.vx ** 2 / MOON_R - G) < 0.05);
  const L = startApollo(level);
  assert.ok(!handedOver('low', L) && !handedOver('high', L) && handedOver('pdi', L));
  const at = {};
  let res = null;
  for (let t = 0; t < 1500 && !res; t += 1 / 60) {
    res = step(level, L, computer(level, L), 1 / 60);
    if (!at[L.prog]) at[L.prog] = { alt: L.y - heightAt(level, L.x), x: L.x, vx: L.vx, t: L.t, fuel: L.fuel };
  }
  // Each gate reached about as aimed, on time (Eagle's took 12 1/2 minutes).
  assert.ok(Math.abs(at[64].alt - GATES.high.alt) < 300 && Math.abs(at[64].vx - GATES.high.vx) < 20, JSON.stringify(at[64]));
  assert.ok(Math.abs(at[66].alt - GATES.low.alt) < 40 && Math.abs(at[66].x - (XC + GATES.low.dx)) < 150, JSON.stringify(at[66]));
  assert.ok(at[66].t > 600 && at[66].t < 900, `${at[66].t} s`);
  assert.ok(Math.abs(at[66].fuel - FUEL_SPARE) < 10, `${at[66].fuel} left at Low Gate`);
  // Left alone, it sets down among the boulders: a crash.
  assert.equal(res.kind, 'crash');
  assert.ok(Math.abs(L.x - XC) < 160);
  // A pilot who takes over at Low Gate and flies on to the clear ground
  // beyond lands -- with fuel to spare, though not much.
  const P = startApollo(level);
  while (P.prog < 66) step(level, P, computer(level, P), 1 / 120);
  assert.ok(hoverSeconds(level, P) > 90 && hoverSeconds(level, P) < 160);
  let out = null;
  for (let t = 0; t < 400 && (!out || out.kind === 'touchdown'); t += 1 / 120) {
    const alt = P.y - heightAt(level, P.x);
    const dx = XS - P.x;
    const vxW = Math.max(-15, Math.min(22, dx * 0.06));
    const vyW = Math.abs(dx) > 120 ? Math.max(-4, Math.min(3, (40 - alt) * 0.3)) : -Math.max(0.6, Math.min(4, alt * 0.08));
    const fx = (vxW - P.vx) * 0.25;
    const fy = (vyW - P.vy) * 1.2 + G;
    const d = Math.atan2(fx, fy) - P.angle;
    const om = Math.sign(d) * Math.min(1.4, Math.abs(d) * 4, Math.sqrt(2 * ROT_ACCEL * 0.8 * Math.abs(d)));
    const push = level.thrust / (1 + 0.5 * (P.fuel / P.fuelMax));
    P.duty = (P.duty || 0) + Math.min(1, Math.max(0, fx * Math.sin(P.angle) + fy * Math.cos(P.angle)) / push);
    const thrust = P.duty >= 1;
    if (thrust) P.duty -= 1;
    out = step(level, P, { thrust, left: om - P.omega < -0.01, right: om - P.omega > 0.01, hold: false }, 1 / 120);
  }
  assert.equal(out.kind, 'landed', JSON.stringify(out));
  assert.ok(Math.abs(P.x - XS) < 60);
  const left = hoverSeconds(level, P);
  assert.ok(left > 10 && left < 90, `${left.toFixed(0)} s of hover left`);
});

test('attitude hold (Apollo 11’s assist): a turn button turns the lander, building up to a steady rate; let go and the lean holds', async () => {
  const { HOLD_RATE } = await import('../games/lander/engine.js');
  const level = makeTerrain(1);
  const L = airborne(level);
  fly(level, L, { right: true, hold: true }, 0.5);
  assert.ok(Math.abs(L.omega - ROT_ACCEL * 0.5) < 0.01, 'building at the thrusters’ strength');
  fly(level, L, { right: true, hold: true }, 6);
  assert.ok(Math.abs(L.omega - HOLD_RATE) < 1e-9, 'up to the steady rate');
  const lean = L.angle;
  fly(level, L, { hold: true }, 2);
  assert.ok(Math.abs(L.angle - lean) < 0.005 && L.omega === 0, 'held');
});
