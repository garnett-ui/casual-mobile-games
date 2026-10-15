import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Road, Car, autopilot, split, FIRST_FORK, HAZARD_AT, HAZARDS, MAX_HEAD, START_TIME, CHECKPOINT } from '../games/night-driver/engine.js';
import { RIDDLES, CRASH_LINES } from '../games/night-driver/signs.js';

const drive = (car, seconds, pilot = (c) => autopilot(c), dt = 1 / 60) => {
  const events = [];
  for (let t = 0; t < seconds && !car.over; t += dt) events.push(...car.step(dt, pilot(car)));
  return events;
};

test('the same seed gives the same road; bends get tighter the further you go', () => {
  const a = new Road(7);
  const b = new Road(7);
  a.extend(20000);
  b.extend(20000);
  assert.deepEqual(a.sections, b.sections);
  assert.deepEqual(a.forks.map((f) => [f.z, f.safe, f.hazard]), b.forks.map((f) => [f.z, f.safe, f.hazard]));
  const sharpest = (z0, z1) => Math.max(...a.sections.filter((s) => s.z0 >= z0 && s.z1 <= z1).map((s) => Math.abs(s.k)));
  assert.ok(sharpest(15000, 20000) > 2.5 * sharpest(0, 3000));
});

test('classic posts only at first; then forks, plain signs first, both ways used', () => {
  const road = new Road(3);
  road.extend(40000);
  assert.ok(road.forks.length >= 10);
  assert.ok(road.forks[0].z >= FIRST_FORK);
  for (const f of road.forks.slice(0, 4)) {
    const r = RIDDLES.find((q) => [q.left, q.right].includes(f.panels[0]));
    assert.ok(r.easy, 'the first signs are the plain ones');
  }
  const sides = new Set(road.forks.map((f) => f.safe));
  assert.deepEqual([...sides].sort(), [-1, 1]);
  // The road is straight through every fork.
  for (const f of road.forks) assert.equal(road.kappa(f.z + HAZARD_AT), 0);
});

test('every riddle has two panels, a safe side and a hazard with a crash line', () => {
  for (const r of RIDDLES) {
    assert.ok(r.left[0] && r.right[0]);
    assert.ok(r.safe === 'L' || r.safe === 'R');
    assert.ok(HAZARDS.includes(r.hazard), r.hazard);
    assert.ok(CRASH_LINES[r.hazard]);
  }
  assert.ok(RIDDLES.some((r) => r.safe === 'L') && RIDDLES.some((r) => r.safe === 'R'));
});

test('a good driver makes it 25 km without a scratch and reads every sign right', () => {
  for (const seed of [1, 2, 3]) {
    const car = new Car(new Road(seed));
    car.time = 1e9;
    const events = drive(car, 1500);
    assert.ok(car.z > 25000, `got to ${car.z}`);
    assert.equal(events.filter((e) => e.type === 'crash').length, 0);
    const calls = events.filter((e) => e.type === 'commit');
    assert.ok(calls.length >= 8);
    assert.ok(calls.every((e) => e.good));
  }
});

test('no steering in a bend: you hit the posts', () => {
  const road = new Road(5);
  road.extend(20000);
  const bend = road.sections.find((s) => Math.abs(s.k) > 1 / 300 && s.z1 - s.z0 > 250);
  const car = new Car(road);
  car.z = bend.z0 + 100;
  car.v = 45;
  let crash = null;
  for (let t = 0; t < 8 && !crash; t += 1 / 60) crash = car.step(1 / 60, { gas: true, steer: 0 }).find((e) => e.type === 'crash');
  assert.equal(crash?.kind, 'posts');
  assert.ok(car.freeze > 0 && car.v === 0, 'stopped, back on the road');
  assert.ok(car.onRoad());
});

test('the wrong way ends in its hazard -- unless you stop in time', () => {
  const road = new Road(9);
  road.extend(5000);
  const f = road.forks[0];
  const car = new Car(road);
  car.time = 1e9;
  car.z = f.z - 600;
  const events = drive(car, 60, (c) => autopilot(c, { wrong: true, speed: 30 }));
  assert.equal(events.find((e) => e.type === 'commit')?.good, false);
  const crash = events.find((e) => e.type === 'crash');
  assert.equal(crash.kind, f.hazard);
  assert.equal(f.side, f.safe, 'put back on the good road');

  // Same again, but brake hard once you see it.
  const road2 = new Road(9);
  road2.extend(5000);
  const g = road2.forks[0];
  const car2 = new Car(road2);
  car2.time = 1e9;
  car2.z = g.z - 600;
  const events2 = drive(car2, 60, (c) => {
    const hz = c.hazardAhead();
    if (hz && hz.z - c.z < 70) return { brake: true, steer: 0 };
    return autopilot(c, { wrong: true, speed: 30 });
  });
  assert.ok(events2.some((e) => e.type === 'phew'));
  assert.ok(!events2.some((e) => e.type === 'crash'));
  assert.equal(g.side, g.safe);
});

test('the clock: checkpoints add time; when it runs out the car coasts to a stop', () => {
  const car = new Car(new Road(4));
  assert.equal(car.time, START_TIME);
  const events = drive(car, 600);
  const checks = events.filter((e) => e.type === 'checkpoint');
  assert.ok(checks.length >= 1 && car.z > CHECKPOINT);
  assert.ok(checks[0].bonus >= 20);
  assert.ok(car.over);
  assert.equal(car.v, 0);
  assert.equal(events.at(-1).type, 'over');
  assert.equal(events.at(-1).score, Math.floor(car.score));
});

test('holding a bend takes steering in proportion to speed', () => {
  const road = new Road(1);
  road.sections = [{ z0: 0, z1: 1e6, k: 1 / 200 }];
  const car = new Car(road);
  car.z = 500;
  car.v = 30;
  const steer = (car.v * (1 / 200)) / MAX_HEAD;
  for (let i = 0; i < 600; i++) car.step(1 / 60, { gas: false, brake: false, steer });
  // Coasting slows the car, so it drifts in a little -- but stays on the road.
  assert.ok(car.onRoad());
  assert.equal(split({ z: 0 }, 0), 0);
});

test('the drawbridge: 70 mph or more jumps it for +1000, slower lands in the river', async () => {
  const { JUMP_V, jumpHeight, BRIDGE } = await import('../games/night-driver/engine.js');
  assert.ok(JUMP_V * 2.237 > 65 && JUMP_V * 2.237 < 75, `about 70 mph (${(JUMP_V * 2.237).toFixed(1)})`);
  // At the jump speed you just reach the far leaf; much faster flies past it.
  const tip = BRIDGE.GAP - BRIDGE.LEAF * Math.cos(BRIDGE.RAMP);
  assert.ok(jumpHeight(tip, JUMP_V) > 0 && jumpHeight(BRIDGE.GAP + 5, JUMP_V) === 0);
  assert.ok(jumpHeight(BRIDGE.GAP + 5, JUMP_V * 1.5) > 0);
  const run = (speed) => {
    const road = new Road(11);
    road.extend(5000);
    const f = road.forks[0];
    f.hazard = 'drawbridge';
    const car = new Car(road);
    car.time = 1e9;
    car.z = f.z - 600;
    return drive(car, 60, (c) => autopilot(c, { wrong: true, speed }));
  };
  const fast = run(40);
  assert.ok(fast.some((e) => e.type === 'jump'));
  assert.ok(!fast.some((e) => e.type === 'crash'));
  const slow = run(25);
  assert.equal(slow.find((e) => e.type === 'crash')?.kind, 'drawbridge');
});

test('the volcano is the end of the road', () => {
  const road = new Road(12);
  road.extend(5000);
  const f = road.forks[0];
  f.hazard = 'volcano';
  const car = new Car(road);
  car.time = 1e9;
  car.z = f.z - 600;
  const events = drive(car, 60, (c) => autopilot(c, { wrong: true, speed: 40 }));
  assert.equal(events.find((e) => e.type === 'crash')?.kind, 'volcano');
  assert.ok(car.crashes === 1);
});
