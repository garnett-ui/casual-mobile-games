import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, schedule, dispatch, playDispatcher, par, FLOORS, CAPACITY, DURATION } from '../games/elevator/engine.js';

const run = (sim, seconds, each = () => {}) => {
  const events = [];
  for (let t = 0; t < seconds && !sim.over; t += 1 / 30) {
    each(sim);
    events.push(...sim.step(1 / 30));
  }
  return events;
};

test('the same seed gives the same day: a morning rush up, an evening rush down', () => {
  const a = schedule(7);
  assert.deepEqual(a, schedule(7));
  assert.notDeepEqual(a, schedule(8));
  assert.ok(a.length > 50 && a.length < 110, `${a.length} people`);
  for (const p of a) assert.ok(p.from !== p.to && p.from >= 0 && p.to < FLOORS && p.t < DURATION);
  const early = a.filter((p) => p.t < 50);
  const late = a.filter((p) => p.t > 130);
  const share = (list, f) => list.filter(f).length / list.length;
  assert.ok(share(early, (p) => p.from === 0) > 0.5, 'mornings: mostly up from the lobby');
  assert.ok(share(late, (p) => p.to === 0) > 0.5, 'evenings: mostly down to the lobby');
});

test('a lift goes where it is sent, opens, lets people off and on, and closes', () => {
  const sim = new Sim(1);
  sim.arrivals = [{ id: 0, t: 0.1, from: 5, to: 12 }];
  sim.send(0, 5);
  const ev = run(sim, 12);
  const car = sim.cars[0];
  assert.ok(ev.some((e) => e.type === 'stop' && e.floor === 5));
  assert.equal(car.riders.length, 1, 'got on');
  assert.deepEqual([...sim.lit(0)], [12], 'pressed 12');
  assert.equal(car.phase, 'idle', 'doors closed again');
  sim.send(0, 12);
  run(sim, 15);
  assert.equal(sim.delivered, 1);
  assert.equal(sim.lit(0).size, 0);
  assert.ok(sim.trips[0].wait > 0 && sim.trips[0].ride > 0);
});

test('one next stop at a time: a new one turns the lift round at once', () => {
  const sim = new Sim(1);
  sim.arrivals = [];
  sim.send(0, 15);
  run(sim, 3);
  const car = sim.cars[0];
  assert.ok(car.pos > 2 && car.v > 0, 'on its way up');
  const v0 = car.v;
  sim.send(0, 0);
  run(sim, 0.5);
  assert.ok(car.v < v0 - 0.5, 'braking at once');
  run(sim, 12);
  assert.equal(car.pos, 0);
  assert.notEqual(car.phase, 'moving');
});

test('a full lift leaves people behind', () => {
  const sim = new Sim(1);
  sim.arrivals = Array.from({ length: 11 }, (_, id) => ({ id, t: 0.05, from: 0, to: 9 }));
  sim.send(0, 0);
  run(sim, 8);
  assert.equal(sim.cars[0].riders.length, CAPACITY);
  assert.equal(sim.waiting[0].length, 11 - CAPACITY);
});

test('the dispatcher keeps both lifts busy and delivers most people; par is its best', () => {
  for (const seed of [1, 2, 3]) {
    const sim = playDispatcher(seed);
    const people = schedule(seed).length;
    assert.ok(sim.delivered > people * 0.6, `seed ${seed}: ${sim.delivered} of ${people}`);
    const best = par(seed);
    assert.ok(best.delivered >= sim.delivered);
  }
  // Doing nothing delivers nobody; sending a lift at random does badly.
  const idle = new Sim(2);
  run(idle, DURATION + 1);
  assert.equal(idle.delivered, 0);
  const random = new Sim(2);
  let k = 0;
  run(random, DURATION + 1, (s) => {
    if (++k % 150 === 0) s.cars.forEach((c, i) => s.send(i, (k * 7 + i * 5) % FLOORS));
  });
  assert.ok(random.delivered < par(2).delivered * 0.7, `random ${random.delivered}`);
});

test('the day ends after three minutes', () => {
  const sim = new Sim(4);
  const ev = run(sim, DURATION + 5, (s) => dispatch(s));
  assert.ok(sim.over);
  assert.equal(ev.at(-1).type, 'over');
  assert.equal(ev.at(-1).delivered, sim.delivered);
});
