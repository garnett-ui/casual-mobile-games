import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, schedule, levelSpec, dispatch, playDispatcher, par, floorName, FLOORS, CAPACITY, WALK, DOOR, GROUND, GARAGE, RESTAURANT, GYM, MIX } from '../games/elevator/engine.js';

const run = (sim, seconds, each = () => {}) => {
  const events = [];
  for (let t = 0; t < seconds && !sim.over; t += 1 / 30) {
    each(sim);
    events.push(...sim.step(1 / 30));
  }
  return events;
};
// A level with just the people given.
const only = (people) => {
  const sim = new Sim(levelSpec(1));
  sim.arrivals = people.map((p, id) => ({ id, look: [1, 2, 3, 4], ...p }));
  // Lift B out of the way, doors shut, so only A is in play.
  Object.assign(sim.cars[1], { pos: 15, phase: 'idle', open: 0, settled: false });
  return sim;
};

test('levels: 20 people about 10 s apart to start, then more of them, closer together', () => {
  const one = levelSpec(1);
  assert.equal(one.people, 20);
  assert.equal(Math.round(one.gap), 10);
  const later = levelSpec(8);
  assert.ok(later.people > one.people && later.gap < one.gap);
  assert.deepEqual([1, 2, 3, 4].map((n) => levelSpec(n).pattern), ['morning', 'midday', 'lunch', 'evening']);
});

test('the building: parking below the street, the lobby, a restaurant on 2, offices, a health club on top', () => {
  assert.deepEqual([0, 1, 2, 3, 4, FLOORS - 2, FLOORS - 1].map(floorName), ['P2', 'P1', 'L', '2', '3', '19', '20']);
  assert.deepEqual(GARAGE, [0, 1]);
  assert.equal(floorName(GROUND), 'L');
  assert.equal(floorName(RESTAURANT), '2');
  assert.equal(floorName(GYM), '20');
  for (const mix of Object.values(MIX)) assert.ok(Math.abs(mix.in + mix.out + mix.inter - 1) < 1e-9);
  // The surveyed peaks: mornings ~85% in, lunch ~45/45/10.
  assert.equal(MIX.morning.in, 0.85);
  assert.deepEqual(MIX.lunch, { in: 0.45, out: 0.45, inter: 0.1 });
});

test('who goes where: mornings in from the street and garage, lunch to the restaurant, evenings home', () => {
  const big = (pattern) => schedule({ ...levelSpec(1), pattern, people: 3000 });
  const share = (list, f) => list.filter(f).length / list.length;
  const entrance = (f) => f <= GROUND;
  const morning = big('morning');
  assert.ok(Math.abs(share(morning, (p) => entrance(p.from)) - 0.85) < 0.03, 'mornings: ~85% coming in');
  assert.ok(share(morning, (p) => GARAGE.includes(p.from)) > 0.1, 'some from the garage');
  const lunch = big('lunch');
  assert.ok(share(lunch, (p) => p.to === RESTAURANT || p.from === RESTAURANT) > 0.25, 'lunch: the restaurant');
  assert.ok(share(lunch, (p) => p.to === GYM || p.from === GYM) > 0.05, 'and the gym');
  const midday = big('midday');
  assert.ok(share(midday, (p) => !entrance(p.from) && !entrance(p.to)) > 0.45, 'midday: half floor to floor');
  const evening = big('evening');
  assert.ok(share(evening, (p) => entrance(p.to)) > 0.6, 'evenings: going home');
  for (const p of [...morning, ...lunch, ...midday, ...evening]) assert.ok(p.from !== p.to && p.from >= 0 && p.to < FLOORS);
});

test('arrivals: a seeded Poisson process, the same each time', () => {
  const spec = levelSpec(3);
  const a = schedule(spec);
  assert.deepEqual(a, schedule(spec));
  assert.equal(a.length, spec.people);
  for (const p of a) assert.ok(p.from !== p.to && p.from >= 0 && p.to < FLOORS && p.t >= WALK);
  // Poisson: the gaps average about the level's gap, and vary a lot
  // (exponential: the spread is about the mean).
  const big = { ...levelSpec(1), people: 2000 };
  const ts = schedule(big).map((p) => p.t);
  const gaps = ts.slice(1).map((t, i) => t - ts[i]);
  const mean = gaps.reduce((x, y) => x + y) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((x, g) => x + (g - mean) ** 2, 0) / gaps.length);
  assert.ok(Math.abs(mean - 10) < 0.8, `mean gap ${mean}`);
  assert.ok(Math.abs(sd / mean - 1) < 0.12, `spread ${sd / mean}`);
});

test('a lift goes where it is sent, opens, lets people off and on, and waits there open', () => {
  const sim = only([{ t: 0.1, from: 5, to: 12 }, { t: 400, from: 1, to: 2 }]);
  sim.send(0, 5);
  const ev = run(sim, 12);
  const car = sim.cars[0];
  assert.ok(ev.some((e) => e.type === 'stop' && e.floor === 5));
  assert.equal(car.riders.length, 1, 'got on');
  assert.deepEqual([...sim.lit(0)], [12], 'pressed 12');
  assert.ok(car.phase === 'loading' && car.open === 1 && car.settled, 'waits with its doors open');
  sim.send(0, 12);
  run(sim, 15);
  assert.equal(sim.delivered, 1);
  assert.equal(sim.lit(0).size, 0);
  const s = sim.stats();
  assert.ok(s.wait > 0 && s.ride > 0 && Math.abs(s.trip - s.wait - s.ride) < 1e-9);
});

test('one next stop at a time: a new one turns the lift round at once', () => {
  const sim = only([{ t: 999, from: 1, to: 2 }]);
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
});

test('a full lift leaves people behind', () => {
  const sim = only(Array.from({ length: 11 }, () => ({ t: 0.05, from: 0, to: 9 })));
  sim.send(0, 0);
  run(sim, 8);
  assert.equal(sim.cars[0].riders.length, CAPACITY);
  assert.equal(sim.waiting[0].length, 11 - CAPACITY);
});

test('the level ends when everyone has got where they were going', () => {
  const spec = levelSpec(1);
  const sim = new Sim(spec);
  const ev = run(sim, 3600, (s) => dispatch(s));
  assert.ok(sim.over);
  assert.equal(sim.delivered, spec.people);
  const over = ev.at(-1);
  assert.equal(over.type, 'over');
  assert.equal(over.delivered, spec.people);
  assert.ok(over.trip > 0 && over.time > 100);
});

test('the dispatcher does well; par is its best; idling or sending lifts at random does worse', () => {
  for (const n of [1, 2, 5]) {
    const spec = levelSpec(n);
    const best = par(spec);
    assert.equal(best.delivered, spec.people, `level ${n}: everyone delivered`);
    assert.ok(best.trip < 40, `level ${n}: average trip ${best.trip}`);
    assert.ok(best.trip <= playDispatcher(spec).stats().trip + 1e-9);
  }
  const spec = levelSpec(2);
  const random = new Sim(spec);
  let k = 0;
  run(random, 3600, (s) => {
    if (++k % 120 === 0) s.cars.forEach((c, i) => c.target === null && s.send(i, (k * 7 + i * 5) % FLOORS));
  });
  assert.ok(!random.over || random.stats().trip > par(spec).trip * 1.4, 'random is much slower');
});

test('a lift not sent anywhere waits with its doors open; they shut only when it is sent', () => {
  const sim = only([{ t: 0.1, from: 3, to: 9 }, { t: 30, from: 3, to: 7 }, { t: 400, from: 1, to: 2 }]);
  sim.send(0, 3);
  run(sim, 12);
  const car = sim.cars[0];
  assert.equal(car.riders.length, 1);
  car.riders = []; // (as if they'd been taken up)
  // Nobody sends it anywhere: the doors stay open, and the next person to
  // come along walks straight in.
  run(sim, 25);
  assert.equal(car.open, 1);
  assert.equal(car.riders.length, 1);
  assert.equal(car.riders[0].to, 7);
  sim.send(0, 7);
  run(sim, 0.3);
  assert.equal(car.phase, 'closing');
});

test('a lift standing shut at a floor opens for someone who presses the button there', () => {
  const sim = only([{ t: 5, from: GROUND, to: 9 }, { t: 400, from: 1, to: 2 }]);
  Object.assign(sim.cars[0], { phase: 'idle', open: 0, settled: false });
  run(sim, 9);
  assert.equal(sim.cars[0].riders.length, 1, 'the doors opened and they got on');
});

test('everyone getting off goes before anyone gets on; sent off early, the rest stay aboard', () => {
  const sim = only([
    ...Array.from({ length: 4 }, () => ({ t: 0.05, from: 0, to: 6 })),
    { t: 0.06, from: 6, to: 0 },
    { t: 400, from: 1, to: 2 },
  ]);
  sim.send(0, 0);
  run(sim, 6);
  assert.equal(sim.cars[0].riders.length, 4);
  sim.send(0, 6);
  const ev = [];
  while (sim.cars[0].phase !== 'loading') ev.push(...sim.step(1 / 30));
  // Two get off, then the lift is sent away before the others can.
  while (sim.delivered < 2) ev.push(...sim.step(1 / 30));
  sim.send(0, 10);
  ev.push(...run(sim, DOOR + 0.5));
  assert.equal(sim.delivered, 2);
  assert.equal(sim.cars[0].riders.length, 2, 'two still aboard, still wanting 6');
  assert.ok(sim.lit(0).has(6));
  // Nobody boarded while people were still getting off.
  const order = ev.filter((e) => e.type === 'deliver' || e.type === 'board').map((e) => e.type);
  assert.ok(!order.includes('board'), order.join(','));
  assert.equal(sim.waiting[6].length, 1, 'the one waiting at 6 is still waiting');
});
