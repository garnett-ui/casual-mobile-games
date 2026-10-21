import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCourse, makeLevel, specFor, newBike, step, rider, readAhead, simulate, bestRide, stars,
  heightAt, slopeAt, contactAt, grounded, G, WHEEL, BASE, VMAX, DRIVE, GRIP,
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
  assert.equal(B.gas, false);
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
  }
  const s3 = specFor(3);
  const s20 = specFor(20);
  assert.ok(s20.length > s3.length && s20.features > s3.features && s20.hill > s3.hill);
  assert.ok(!s3.gap && !s3.step && s20.gap && s20.step, 'gaps and ledges come later');
  assert.ok(makeLevel(20).par > makeLevel(3).par);
});

test('course 1 is rolling hills; jumps, logs, drops, ledges and gaps come in that order', () => {
  const kinds = (n) => new Set(makeCourse(n).features.map((f) => f.kind));
  assert.deepEqual([...kinds(1)], ['hill']);
  const first = {};
  for (let n = 1; n <= 14; n++) for (const k of kinds(n)) first[k] ??= n;
  assert.ok(first.hill < first.jump && first.jump < first.log && first.log < first.drop && first.drop <= first.step && first.step < first.gap, JSON.stringify(first));
});

test('the rider reads the ground ahead: a log is a wall, a lip is an edge, a pit is a gap', () => {
  const level = makeCourse(13);
  const log = level.features.find((f) => f.kind === 'log');
  const gap = level.features.find((f) => f.kind === 'gap');
  const jump = level.features.find((f) => f.kind === 'jump');
  assert.ok(log && gap && jump, 'course 13 has them all');
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

test('riding flat out into a ledge without lifting the front is a crash or a stall', () => {
  const level = makeCourse(10);
  const ledge = level.features.find((f) => f.kind === 'step');
  const B = newBike(level, ledge.x0 - 12);
  const res = ride(level, B, { gas: true, lean: -0.3 }, 6);
  assert.ok((res && res.kind === 'crash') || B.x < ledge.x1, `stopped by the ledge: ${res?.kind} at ${B.x}`);
});
