import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCourse, makeLevel, specFor, newBike, step, rider, readAhead, simulate, bestRide, stars,
  heightAt, slopeAt, contactAt, grounded, G, WHEEL, BASE, VMAX, DRIVE, GRIP, HARD, STEP, FLIP_BONUS,
} from '../games/trial-bike/engine.js';

const idle = { gas: false, brake: false, lean: 0 };
const ride = (course, B, input, seconds) => {
  let res = null;
  for (let k = 0; k < Math.round(seconds * 60) && !res; k++) res = step(course, B, input, 1 / 60);
  return res;
};
// A long flat course with nothing on it, for the physics.
const flat = () => {
  const course = makeCourse(1);
  course.heights = course.heights.map(() => 0);
  course.minY = course.maxY = 0;
  course.flags = [];
  return course;
};

test('the ground is a sampled profile: heights interpolate and a wheel finds where it touches', () => {
  const course = makeCourse(3);
  course.heights = course.heights.map((_, i) => (i % 2 ? 1 : 0));
  assert.equal(heightAt(course, 0.05), 0.5);
  assert.equal(slopeAt(course, 0.1), 0, 'the slope across a peak is level');
  const c = contactAt(course, 0.1, 1 + WHEEL - 0.02);
  assert.ok(c && Math.abs(c.depth - 0.02) < 1e-9, `touching the peak: ${JSON.stringify(c)}`);
  assert.equal(contactAt(course, 0.1, 1 + WHEEL + 0.01), null, 'just above it: no contact');
  const wall = contactAt(course, 0.1 - WHEEL + 0.05, 0.5);
  assert.ok(wall && wall.nx < 0 && Math.abs(wall.ny) < 0.5, 'against the side of the peak the normal points out of it');
});

test('a bike stands on its wheels, drives forward and brakes to a stop', () => {
  const course = flat();
  const B = newBike(course);
  ride(course, B, idle, 1);
  assert.ok(grounded(B) && Math.abs(B.vx) < 0.05 && Math.abs(B.angle) < 0.03, `settled: vx=${B.vx} angle=${B.angle}`);
  const y0 = B.y;
  ride(course, B, { gas: true }, 3);
  assert.ok(B.vx > 8, `gets going: ${B.vx}`);
  assert.ok(B.vx < VMAX, 'but not past the top speed');
  assert.ok(Math.abs(B.y - y0) < 0.05, 'and stays on the ground');
  assert.ok(B.spin > 20, 'the rear wheel turns');
  ride(course, B, { brake: true }, 3);
  assert.ok(Math.abs(B.vx) < 0.1, `brakes to a stop: ${B.vx}`);
  assert.equal(B.crashed, false);
});

test('hard on the gas lifts the front wheel; leaning forward brings it down', () => {
  const course = flat();
  const B = newBike(course);
  ride(course, B, idle, 1);
  ride(course, B, { gas: true, lean: 1 }, 0.3);
  assert.ok(B.front === null && B.rear !== null, 'a wheelie: only the rear wheel on the ground');
  assert.ok(B.angle > 0.25, `nose up: ${B.angle}`);
  let t = 0;
  while (B.front === null && t < 3) {
    ride(course, B, { gas: true, lean: -1 }, 0.1);
    t += 0.1;
  }
  assert.ok(B.front !== null && t < 1.5, `front wheel back down after ${t.toFixed(1)} s`);
  assert.ok(DRIVE > GRIP * G / 2, 'the engine can spin the rear wheel');
});

test('in the air the bike falls under gravity and the rider can pitch it', () => {
  const course = flat();
  const B = newBike(course);
  B.y += 10;
  ride(course, B, { lean: -1 }, 0.5);
  assert.ok(Math.abs(B.vy + G * 0.5) < 0.1, `falling: vy=${B.vy}`);
  assert.ok(B.angle < -0.3, `nose down from leaning forward: ${B.angle}`);
  assert.ok(!grounded(B));
});

test('coming down on the helmet is a crash; so is falling out of the world', () => {
  const course = flat();
  const B = newBike(course);
  B.y += 3;
  B.angle = Math.PI; // upside down
  const res = ride(course, B, idle, 3);
  assert.equal(res.kind, 'crash');
  assert.equal(B.crashed, true);
  assert.equal(step(course, B, { gas: true }, 1 / 60), null, 'a crashed bike takes no input');
  assert.equal(B.gas, false, 'the throttle is ignored');
  const y = B.y;
  ride(course, B, { gas: true }, 0.5);
  assert.notEqual(B.y, y, 'but it keeps tumbling');
  const B2 = newBike(course);
  B2.y = course.minY - 10;
  assert.equal(ride(course, B2, idle, 1).reason, 'Fell');
});

test('checkpoints are passed in order and the bike restarts at the last one', () => {
  const level = makeLevel(6);
  assert.ok(level.flags.length >= 1);
  const B = newBike(level);
  assert.equal(B.flag, -1);
  B.x = level.flags[0] + 0.5;
  step(level, B, idle, 1 / 60);
  assert.equal(B.flag, 0);
  const again = newBike(level, level.flags[0]);
  assert.equal(again.flag, 0);
  ride(level, again, idle, 1);
  assert.ok(grounded(again) && !again.crashed, 'standing on the flag');
});

test('crossing the finish line ends the ride with a time, and stars go by par and crashes', () => {
  const course = flat();
  course.finish = 20;
  const B = newBike(course);
  const res = ride(course, B, { gas: true }, 20);
  assert.equal(res.kind, 'finished');
  assert.ok(res.time > 1 && res.time < 10, `time ${res.time}`);
  assert.equal(B.finished, true);
  const level = { par: 30 };
  assert.equal(stars(level, 28, 0), 3);
  assert.equal(stars(level, 31, 0), 2);
  assert.equal(stars(level, 28, 1), 2);
  assert.equal(stars(level, 28, 2), 1);
  assert.equal(stars(level, 50, 0), 1);
});

test('the same course number builds the same course everywhere', () => {
  const a = makeCourse(7);
  const b = makeCourse(7);
  assert.deepEqual(a.heights, b.heights);
  assert.deepEqual(a.features, b.features);
  assert.notDeepEqual(makeCourse(7, 1).heights, a.heights, 'a re-roll is a different course');
  const x = simulate(a, 0.6);
  const y = simulate(b, 0.6);
  assert.equal(x.time, y.time, 'and the same ride on it');
});

test('every course is ridable (the computer rider finishes it) and gets longer and harder', () => {
  for (const n of [1, 2, 3, 5, 8, 11, 12, 15, 18, 22, 30]) {
    const level = makeLevel(n);
    assert.ok(level.checked, `course ${n} checked`);
    const run = bestRide(level);
    assert.equal(run.kind, 'finished', `course ${n} finished`);
    assert.ok(level.par >= run.time && level.par < run.time + 1.5, `par ${level.par} is the rider's time ${run.time}`);
    assert.ok(level.ghost.length > 50 && level.ghost.at(-1)[0] > level.finish - 2, 'the par ride is kept for the ghost');
  }
  const s3 = specFor(3);
  const s20 = specFor(20);
  assert.ok(s20.length > s3.length && s20.features > s3.features && s20.hill > s3.hill);
  assert.ok(!s3.gap && !s3.step && s20.gap && s20.step, 'gaps and ledges come later');
  assert.ok(makeLevel(20).par > makeLevel(3).par);
});

test('course 1 is hills and one small jump; logs, climbs, drops, ledges, cliffs and gaps arrive over the next four; then set pieces', () => {
  const kinds = (n) => makeCourse(n).features.map((f) => f.kind);
  assert.deepEqual(kinds(1), ['hill', 'jump', 'hill', 'hill']);
  const first = {};
  for (let n = 1; n <= 8; n++) for (const k of kinds(n)) first[k] ??= n;
  for (let a = 0; a < 12; a++) {
    // Whatever's new on a course is there on every re-roll of it, too.
    assert.ok(makeCourse(3, a).features.some((f) => f.kind === 'drop'), `course 3 attempt ${a} has its drop`);
    assert.ok(makeCourse(5, a).features.some((f) => f.kind === 'gap' && !f.set), `course 5 attempt ${a} has its gap`);
  }
  delete first.down; // (the slope that closes a set piece)
  assert.deepEqual(first, { hill: 1, jump: 1, log: 2, climb: 2, drop: 3, step: 4, cliff: 4, gap: 5 });
  // From course 3 every course has a set piece, packed close, with a flag just before it.
  const setOf = (level) => level.features.filter((f) => f.set).map((f) => f.kind).join('+');
  for (const n of [3, 4, 5, 6, 7, 12]) {
    const level = makeCourse(n);
    const set = level.features.filter((f) => f.set);
    assert.ok(set.length >= 1, `course ${n} has a set piece`);
    assert.ok(level.flags.some((x) => x < set[0].x0 && x > set[0].x0 - 12), 'with a flag at its start');
    const after = level.features.filter((f) => !f.set && f.x0 > set.at(-1).x1).length;
    assert.ok(after >= 2, `course ${n}: ${after} obstacles after the set piece -- it isn't the ending`);
    if (n > 3) assert.notEqual(setOf(level), setOf(makeCourse(n - 1)), `course ${n} has a different set piece from course ${n - 1}`);
  }
  assert.ok(specFor(1).combo === 0 && specFor(10).combo > specFor(3).combo, 'obstacles come closer together as courses go on');
});

test('the rider reads the ground ahead: a log is a wall, a lip is an edge, a pit is a gap', () => {
  const level = makeCourse(12);
  const log = level.features.find((f) => f.kind === 'log');
  const gap = level.features.find((f) => f.kind === 'gap');
  const jump = level.features.find((f) => f.kind === 'jump');
  assert.ok(log && gap && jump, 'course 12 has them all');
  const B = newBike(level, log.x0 - 3);
  const r = readAhead(level, B);
  assert.ok(r.wall > 2 && r.wall < 4 && r.wallH > 0.2, JSON.stringify(r));
  const B2 = newBike(level, gap.x0 - 3);
  const r2 = readAhead(level, B2);
  assert.ok(r2.gap > 1 && r2.edge > 2 && r2.edge < 4, JSON.stringify(r2));
  const B3 = newBike(level, jump.x0 - 1);
  const r3 = readAhead(level, B3);
  assert.ok(r3.gap === 0 && r3.edge > 1, JSON.stringify(r3));
  // On the start it sees nothing but the first obstacle, far off.
  const r4 = readAhead(level, newBike(level));
  assert.ok(r4.wall > 5 && r4.edge > 5 && !r4.pit);
  assert.ok(rider(level, newBike(level)).gas, 'and opens the throttle');
});

test('a fall onto the front wheel pitched down is a crash; the same fall on the rear wheel is a landing', () => {
  const course = flat();
  const drop = (angle, lean, height = 3) => {
    const B = newBike(course);
    B.y += height;
    B.angle = angle;
    const res = ride(course, B, { lean }, 2);
    return { res, B };
  };
  // Held nose-down all the way: a crash. Let go and the bike rights itself.
  const nose = drop(-0.6, -1, 3.5);
  assert.equal(nose.res?.reason, 'Nose first');
  const righted = drop(-0.6, 0, 3.5);
  assert.ok(!righted.res || righted.res.kind !== 'crash', `let go, it levels: ${righted.res?.reason ?? 'rode on'}`);
  const tail = drop(0.3, 0);
  assert.ok(!tail.res || tail.res.kind !== 'crash', `rear wheel first: ${tail.res?.reason ?? 'rode on'}`);
  const B = newBike(course);
  B.y += 8;
  assert.equal(ride(course, B, idle, 3).reason, 'Hard landing', 'too far, any way up');
  assert.ok(HARD.flat > HARD.nose);
});

test('a climb is long and steep but never over 35 degrees; a cliff is sheer and lands on the flat', () => {
  const level = makeLevel(15); // (as played, re-rolls and all)
  const climb = level.features.find((f) => f.kind === 'climb' && !f.set);
  const cliff = level.features.find((f) => f.kind === 'cliff' && !f.set);
  assert.ok(climb && cliff, 'course 15 has both');
  let steepest = 0;
  let top = -Infinity;
  for (let x = climb.x0; x <= climb.x1; x += STEP) {
    steepest = Math.max(steepest, Math.abs(Math.atan(slopeAt(level, x))));
    top = Math.max(top, heightAt(level, x));
  }
  assert.ok(top - heightAt(level, climb.x0) > 3, 'a real climb');
  assert.ok(steepest < (37 * Math.PI) / 180, `steepest ${(steepest * 180) / Math.PI}°`);
  const fall = heightAt(level, cliff.x0) - heightAt(level, cliff.x1 + 0.5);
  assert.ok(fall > 2 && fall < 4, `cliff of ${fall} m`);
  // And no hill on any early course, as played, is steeper than it says.
  for (const n of [4, 9, 15, 23]) {
    const L = makeLevel(n);
    let worst = 0;
    for (const f of L.features) {
      if (f.kind !== 'hill') continue;
      for (let x = f.x0; x <= f.x1; x += STEP) worst = Math.max(worst, Math.abs(Math.atan(slopeAt(L, x))));
    }
    assert.ok(worst < (37 * Math.PI) / 180, `course ${n}: steepest hill ${((worst * 180) / Math.PI).toFixed(1)}°`);
  }
  assert.equal(bestRide(level).kind, 'finished', 'the computer rider manages them');
});

test('a full turn off a kicker, landed, is a flip; a turn held into the ground is a crash, not a trick', () => {
  // A 1.8 m kicker on flat ground, like the game builds them.
  const course = flat();
  const h = 1.8;
  const up = h * 2.6;
  course.heights = course.heights.map((_, i) => {
    const d = i * STEP - 20;
    return d < 0 || d > up ? 0 : h * (d / up) ** 1.5;
  });
  course.maxY = h;
  // Ride at it on the gas; off the lip, lean back for two thirds of a
  // second, then let go. That's a backflip, landed, and ridden away from.
  const B = newBike(course);
  let air = 0;
  let trick = null;
  let res = null;
  for (let k = 0; k < 60 * 12 && !res && !trick; k++) {
    const flying = !grounded(B);
    air = flying ? air + 1 / 60 : 0;
    res = step(course, B, { gas: !flying, lean: flying && air < 0.65 ? 1 : 0 }, 1 / 60);
    trick = B.trick;
  }
  assert.ok(trick && trick.flips === 1 && trick.back, `landed a backflip: ${JSON.stringify(trick)} ${JSON.stringify(res)}`);
  assert.equal(ride(course, B, { gas: true }, 2), null, 'and rides away');
  assert.ok(B.vx > 3 && !B.crashed);
  // Half a turn held into the ground is a crash, and no trick.
  const C = newBike(course);
  C.y += 3;
  C.omega = 2;
  const out = ride(course, C, { lean: 0.4 }, 3);
  assert.equal(out.kind, 'crash');
  assert.equal(C.trick, null);
  assert.ok(FLIP_BONUS > 0);
});

test('riding flat out into a ledge without lifting the front is a crash or a stall', () => {
  const level = makeCourse(11);
  const ledge = level.features.find((f) => f.kind === 'step');
  const B = newBike(level, ledge.x0 - 12);
  const res = ride(level, B, { gas: true, lean: -0.3 }, 6);
  assert.ok((res && res.kind === 'crash') || B.x < ledge.x1, `stopped by the ledge: ${res?.kind} at ${B.x}`);
});
