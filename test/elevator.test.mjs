import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, Day, approach, levelSpec, building, dispatch, playDispatcher, par, floorName, stays, clockAt, toPlay, CAPACITY, DOOR, PRESS, LULL, DAY, MIX, PLAY, MAX_PLAY, TWINS, TRANSIT } from '../games/elevator/engine.js';

const run = (sim, seconds, each = () => {}) => {
  const events = [];
  for (let t = 0; t < seconds && !sim.over; t += 1 / 30) {
    each(sim);
    events.push(...sim.step(1 / 30));
  }
  return events;
};
// A level with just the people given.
// A 20-storey level with just the people given.
const TALL = levelSpec(10);
const only = (people) => {
  const sim = new Sim(TALL);
  sim.arrivals = people.map((p, id) => ({ id, look: [1, 2, 3, 4], ...p }));
  sim.pending = sim.arrivals.slice();
  sim.byId = new Map(sim.arrivals.map((a) => [a.id, a]));
  // They're on their floors to start with.
  sim.occupancy = Array(sim.floors).fill(0);
  for (const p of sim.arrivals) if (stays(sim.building, p.from)) sim.occupancy[p.from]++;
  // Lift B out of the way, doors shut, so only A is in play.
  Object.assign(sim.cars[1], { pos: 15, phase: 'idle', open: 0, settled: false });
  return sim;
};

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
  run(sim, approach(sim.building, 0) + PRESS + CAPACITY * 0.4 + 2);
  assert.equal(sim.cars[0].riders.length, CAPACITY);
  assert.equal(sim.waiting[0].length, 11 - CAPACITY);
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
  const sim = only([{ t: 5, from: TALL.building.ground, to: 9 }, { t: 400, from: 1, to: 2 }]);
  Object.assign(sim.cars[0], { phase: 'idle', open: 0, settled: false });
  run(sim, 5 + approach(sim.building, sim.building.ground) + 2);
  assert.equal(sim.cars[0].riders.length, 1, 'the doors opened and they got on');
});

test('nobody gets on before they reach the button, even with the lift standing open there', () => {
  const B = TALL.building;
  for (const from of [B.ground + 4, B.ground, 0, B.roof]) {
    const sim = only([{ t: 1, from, to: from === B.ground + 4 ? B.ground : B.ground + 4 }, { t: 400, from: 1, to: 2 }]);
    sim.send(0, from);
    const ev = run(sim, 20);
    const leave = ev.find((e) => e.type === 'leave' && e.id === 0);
    const board = ev.find((e) => e.type === 'board' && e.id === 0);
    assert.ok(Math.abs(leave.at - (1 + approach(B, from))) < 0.05, `sets off at 1 s, due at the button ${approach(B, from)} s later`);
    assert.ok(sim.cars[0].phase === 'loading' && board, `floor ${from}: the lift waited, and they got on`);
    assert.ok(sim.arrivals[0].t >= leave.at - 1e-9, `floor ${from}: pressed the button on getting there`);
    assert.ok(sim.arrivals[0].boarded >= leave.at - 1e-9, `floor ${from}: and only then got on`);
  }
});

test('at the button: they press it, and step into a lift standing there a moment later', () => {
  const B = TALL.building;
  const sim = only([{ t: 1, from: B.ground + 4, to: B.ground }, { t: 400, from: 1, to: 2 }]);
  sim.send(0, B.ground + 4);
  const ev = run(sim, 15);
  const press = ev.find((e) => e.type === 'arrive' && e.id === 0);
  const board = ev.find((e) => e.type === 'board' && e.id === 0);
  assert.ok(sim.arrivals[0].boarded >= sim.arrivals[0].t + PRESS - 1e-9, 'pressed, then got on');
  assert.ok(ev.indexOf(press) < ev.indexOf(board));
});

test('the first day: six storeys, one lift', () => {
  const spec = levelSpec(1);
  assert.equal(spec.building.storeys, 6);
  assert.equal(new Sim(spec).cars.length, 1);
  assert.equal(new Sim(levelSpec(2)).cars.length, 2);
  const best = par(spec);
  assert.equal(best.delivered, spec.people);
});

test('everyone getting off goes before anyone gets on; sent off early, it waits till they have', () => {
  const sim = only([
    ...Array.from({ length: 4 }, () => ({ t: 0.05, from: 0, to: 6 })),
    { t: 0.06, from: 6, to: 0 },
    { t: 400, from: 1, to: 2 },
  ]);
  sim.send(0, 0);
  run(sim, approach(sim.building, 0) + PRESS + 4 * 0.4 + 2);
  assert.equal(sim.cars[0].riders.length, 4);
  sim.send(0, 6);
  const ev = [];
  while (sim.cars[0].phase !== 'loading') ev.push(...sim.step(1 / 30));
  // Two get off, then the lift is sent on: it goes only once the other two
  // are off too, and the one waiting here is on.
  while (sim.delivered < 2) ev.push(...sim.step(1 / 30));
  sim.send(0, 10);
  while (sim.cars[0].phase === 'loading') ev.push(...sim.step(1 / 30));
  assert.equal(sim.delivered, 4, 'all four got off');
  assert.deepEqual(sim.cars[0].riders.map((p) => p.to), [0], 'and the one waiting got on');
  assert.equal(sim.cars[0].target, 10, 'then it goes where it was sent');
  // Nobody boarded while people were still getting off.
  const order = ev.filter((e) => e.type === 'deliver' || e.type === 'board').map((e) => e.type);
  assert.deepEqual(order, ['deliver', 'deliver', 'deliver', 'deliver', 'board']);
  run(sim, 10);
  assert.equal(sim.floorOf(sim.cars[0]), 10);
});

test('true occupancy: someone due to leave an empty floor waits until someone is there', () => {
  const sim = only([{ t: 1, from: 3, to: 9 }, { t: 2, from: 9, to: 4 }]);
  sim.occupancy[3] = 1;
  sim.occupancy[9] = 0; // nobody on 9 yet: the second person can't set off until the first gets there
  sim.send(0, 3);
  run(sim, 10);
  assert.equal(sim.waiting[9].length, 0, 'not yet');
  sim.send(0, 9);
  run(sim, 12);
  assert.equal(sim.delivered, 1);
  run(sim, 2);
  assert.equal(sim.waiting[9].length + sim.cars[0].riders.length, 1, 'now they can go');
  assert.equal(sim.occupancy[9], 0);
});

// Runs a level's whole day with the dispatcher (its best way).
const runDay = (spec) => {
  const best = par(spec);
  const day = new Day(spec);
  let over = null;
  const events = [];
  for (let t = 0; t < 3600 && !over; t += 1 / 20) {
    day.sims.forEach((s, k) => dispatch(s, best.optsList[k]));
    const ev = day.step(1 / 20);
    events.push(...ev);
    over = ev.find((e) => e.type === 'over');
    for (const s of day.sims) assert.ok(s.occupancy.every((n) => n >= 0), 'never fewer than nobody');
  }
  return { best, day, over, events };
};
const sum = (o) => o.reduce((a, b) => a + b, 0);

test('the building: parking, the lobby, a restaurant on 2, offices, a health club, a helipad; it grows', () => {
  const small = building(6);
  assert.deepEqual(small.kinds.map((_, f) => floorName(small, f)), ['P1', 'L', '2', '3', '4', '5', '6', 'R']);
  const big = building(20);
  assert.deepEqual([0, 1, 2, 3, 4, big.floors - 3, big.floors - 2, big.floors - 1].map((f) => floorName(big, f)), ['P2', 'P1', 'L', '2', '3', '19', '20', 'R']);
  assert.equal(floorName(big, big.restaurant), '2');
  assert.equal(floorName(big, big.gym), '20');
  assert.deepEqual([1, 3, 4, 7, 10, 12].map((n) => levelSpec(n).building.storeys), [6, 6, 10, 15, 20, 20]);
  const homes = building(10, 1, 'residential');
  assert.equal(homes.kinds.filter((k) => k === 'home').length, 9);
  // More people each level.
  assert.ok(levelSpec(2).workers > levelSpec(1).workers && levelSpec(5).workers > levelSpec(4).workers);
});

test('every level is a whole working day, 7 AM to 7:30 PM: about five minutes to start, up to fifteen in the hardest', () => {
  assert.equal(clockAt(0), 7 * 60);
  assert.equal(clockAt(PLAY), 19.5 * 60);
  const lengths = [1, 4, 7, 10].map((n) => levelSpec(n).length);
  assert.deepEqual([...lengths].sort((a, b) => a - b), lengths, 'longer as the buildings grow');
  assert.equal(Math.max(...[TWINS + 10, TWINS + 20, 100].map((n) => levelSpec(n).play)), MAX_PLAY, 'the longest days');
  for (const n of [1, 4, 7, 10, TWINS, TWINS + 13]) {
    const spec = levelSpec(n);
    const times = spec.towers.flatMap((t) => t.arrivals.map((a) => a.t)).filter(Number.isFinite);
    assert.ok(Math.min(...times) < toPlay(8.5 * 60, spec.play), `level ${n}: starts with the morning rush`);
    assert.ok(Math.max(...times) > toPlay(17.5 * 60, spec.play), `level ${n}: ends with the evening`);
    const { over, best, day } = runDay(spec);
    assert.ok(over.time > spec.length * 0.7 && over.time < spec.length * 1.3, `level ${n}: ${Math.round(over.time)} s, about ${spec.length}`);
    assert.ok(over.time < 16 * 60, `level ${n}: at most about fifteen minutes`);
    assert.ok(best.rms < 45, `level ${n}: playable (the computer's RMS trip ${Math.round(best.rms)} s)`);
    assert.ok(day.clock <= DAY.end && day.clock > 18 * 60, `level ${n}: over by the evening (${day.clock})`);
  }
  // Each building has a name, and each level is the next day there.
  assert.deepEqual([1, 2, 3, 4].map((n) => [levelSpec(n).place, levelSpec(n).day]), [['Maple Street Offices', 1], ['Maple Street Offices', 2], ['Maple Street Offices', 3], ['Riverside House', 1]]);
});

test('lulls: the clock skips ahead so someone new sets off within 3 s -- unless anyone is waiting for a lift', () => {
  for (const n of [1, 4, TWINS]) {
    const spec = levelSpec(n);
    const best = par(spec);
    const day = new Day(spec);
    let last = 0;
    let first = null;
    let quietGaps = 0;
    while (!day.over && day.t < 3600) {
      day.sims.forEach((s, k) => dispatch(s, best.optsList[k]));
      const busy = day.sims.some((s) => s.waiting.some((w) => w.length) || s.walking.length);
      // (Someone on the schedule -- not waiting on their last trip, or for
      // someone to be on the floor they'd leave.)
      const due = day.sims.some((s) => s.pending.some((a) => Number.isFinite(a.t) && s.setsOff(a) === a.t && !(stays(s.building, a.from) && s.occupancy[a.from] <= 0)));
      for (const e of day.step(1 / 20)) {
        if (e.type !== 'leave') continue;
        first ??= day.t;
        last = day.t;
      }
      // Quiet -- nobody setting off, nobody waiting -- with someone on the
      // schedule, for more than LULL: shouldn't happen.
      if (busy) last = Math.max(last, day.t);
      if (!busy && due && day.t - last > LULL + 0.11) quietGaps++;
    }
    assert.ok(first <= LULL + 0.1, `level ${n}: the first person sets off at ${first} s`);
    assert.equal(quietGaps, 0, `level ${n}: no quiet stretches`);
    assert.ok(day.skipped > 0, `level ${n}: the clock skipped ahead`);
  }
});

test('the offices are empty at dawn and empty at night; the mix at the peaks matches the surveys', () => {
  const spec = levelSpec(3);
  const B = spec.building;
  const trips = spec.arrivals;
  assert.equal(sum(trips.start), 0, 'empty first thing');
  const { day } = runDay(spec);
  assert.equal(sum(day.sims[0].occupancy), 0, 'empty at night');
  assert.equal(day.sims[0].delivered, trips.length);
  // Mixes, over a few levels' worth of people: in the morning rush nearly
  // everyone is arriving; at lunch it's in and out (and some to the
  // restaurant or the gym).
  const all = [1, 2, 3, 4, 5, 6].flatMap((n) => levelSpec(n).arrivals.map((a) => ({ ...a, B: levelSpec(n).building, play: levelSpec(n).play })));
  const inside = (a, f) => stays(a.B, f);
  const share = (lo, hi) => {
    const w = all.filter((a) => a.t >= toPlay(lo * 60, a.play) && a.t < toPlay(hi * 60, a.play));
    const i = w.filter((a) => !inside(a, a.from) && inside(a, a.to)).length / w.length;
    const o = w.filter((a) => inside(a, a.from) && !inside(a, a.to)).length / w.length;
    return { in: i, out: o, inter: 1 - i - o };
  };
  const morning = share(7.5, 9.5);
  assert.ok(morning.in >= MIX.morning.in, `morning: ${Math.round(morning.in * 100)}% in`);
  const lunch = share(12, 13.5);
  assert.ok(lunch.in > 0.2 && lunch.out > 0.2, `lunch: ${Math.round(lunch.in * 100)}% in, ${Math.round(lunch.out * 100)}% out`);
  assert.ok(all.some((a) => a.to === a.B.restaurant) && all.some((a) => a.to === a.B.gym), 'lunch in the building too');
  assert.ok(all.some((a) => a.from < a.B.ground) && all.some((a) => a.from === a.B.roof), 'some drive, a few fly');
  // Only the lobby, garage and roof lead outside.
  for (const a of all) for (const f of [a.from, a.to]) if (!inside(a, f)) assert.ok(f <= a.B.ground || f === a.B.roof);
});

test('everyone has their own day: each trip waits for their last to finish', () => {
  const spec = levelSpec(2);
  const { day } = runDay(spec);
  const sim = day.sims[0];
  const byPerson = new Map();
  for (const a of sim.arrivals) byPerson.set(a.look.join(), [...(byPerson.get(a.look.join()) || []), a]);
  assert.ok([...byPerson.values()].every((legs) => legs.length >= 2), 'in and out (at least)');
  for (const a of sim.arrivals) {
    if (a.prev === undefined) continue;
    const before = sim.byId.get(a.prev);
    assert.equal(before.look.join(), a.look.join(), 'the same person');
    assert.ok(a.t >= sim.doneAt.get(a.prev), 'only once they got there');
  }
});

test('the dispatcher does well; par is its best; sending lifts at random does worse', () => {
  for (const n of [1, 2, 4]) {
    const spec = levelSpec(n);
    const best = par(spec);
    assert.equal(best.delivered, spec.people, `level ${n}: everyone delivered`);
    assert.ok(best.rms < 40, `level ${n}: RMS trip ${best.rms}`);
    assert.ok(best.squares <= playDispatcher(spec).stats().squares + 1e-9);
  }
  const spec = levelSpec(2);
  const random = new Sim(spec);
  let k = 0;
  run(random, 3600, (s) => {
    if (++k % 120 === 0) s.cars.forEach((c, i) => c.target === null && s.send(i, (k * 7 + i * 5) % s.floors));
  });
  assert.ok(!random.over || random.stats().rms > par(spec).rms * 1.3, 'random is much slower');
});

test('the dispatcher: a lift on its way to a floor the other has emptied turns to something else', () => {
  const sim = new Sim(TALL);
  const g = sim.building.ground;
  const look = [1, 2, 3, 4];
  // Someone on 8 going down; lift A on 6, with a rider for 8 (so it gets
  // there first); lift B in the lobby. Both are sent to 8 at once.
  sim.arrivals = [{ id: 0, look, t: 0.1, from: g + 7, to: g }, { id: 1, look, t: 0, boarded: 0, from: g, to: g + 7 }];
  sim.byId = new Map(sim.arrivals.map((a) => [a.id, a]));
  sim.pending = [sim.arrivals[0]];
  sim.occupancy = Array(sim.floors).fill(0);
  sim.occupancy[g + 7] = 1;
  Object.assign(sim.cars[0], { pos: g + 5, riders: [sim.arrivals[1]] });
  const ev = run(sim, 30, (s) => dispatch(s));
  assert.ok(ev.some((e) => e.type === 'board' && e.car === 0 && e.id === 0), 'A picks them up');
  assert.ok(!ev.some((e) => e.type === 'stop' && e.car === 1 && e.floor === g + 7), 'B turns back');
  assert.ok(sim.over);
});

test('the dispatcher stages idle lifts: the lobby in the morning, among the people in the evening', () => {
  const at = (hour, type) => {
    const sim = new Sim({ ...TALL, building: type === 'residential' ? building(20, 2, 'residential') : TALL.building });
    sim.pending = [];
    sim.t = toPlay(hour * 60, TALL.play);
    sim.occupancy = Array(sim.floors).fill(0);
    const top = sim.floors - 3;
    for (let f = top - 3; f <= top; f++) sim.occupancy[f] = 5; // all up near the top
    sim.cars.forEach((c) => Object.assign(c, { pos: Math.round(sim.floors / 2), phase: 'loading', settled: true }));
    dispatch(sim);
    return sim.cars.map((c) => c.target);
  };
  const g = TALL.building.ground;
  const top = TALL.building.floors - 3;
  assert.deepEqual(at(8.5), [g, g], 'offices, morning: both to the lobby');
  for (const f of at(17.5)) assert.ok(f >= top - 3, `offices, evening: up among the people (${f})`);
  for (const f of at(8, 'residential')) assert.ok(f >= top - 3, `homes, morning: up among the people (${f})`);
  assert.deepEqual(at(18.5, 'residential'), [g, g], 'homes, evening: both to the lobby');
});
test('the score: every trip, the average, the median, the RMS', () => {
  const sim = only([{ t: 0.1, from: 5, to: 12 }, { t: 0.1, from: 5, to: 9 }, { t: 400, from: 1, to: 2 }]);
  sim.send(0, 5);
  run(sim, 12);
  sim.send(0, 9);
  run(sim, 10);
  sim.send(0, 12);
  run(sim, 10);
  const s = sim.stats();
  assert.equal(s.totals.length, 2);
  assert.ok(Math.abs(s.squares - s.totals.reduce((a, x) => a + x * x, 0)) < 1e-9);
  assert.ok(Math.abs(s.median - (s.totals[0] + s.totals[1]) / 2) < 1e-9);
  assert.ok(Math.abs(s.rms - Math.sqrt(s.squares / 2)) < 1e-9);
});

test(`from level ${TWINS}: an apartment tower and an office tower, one day between them`, () => {
  const spec = levelSpec(TWINS);
  assert.deepEqual(spec.towers.map((t) => t.building.type), ['residential', 'office']);
  const [homes, offices] = spec.towers;
  assert.equal(sum(homes.arrivals.start), spec.residents, 'everyone at home asleep at dawn');
  assert.equal(sum(offices.arrivals.start), 0, 'the offices empty');
  const { day, over } = runDay(spec);
  assert.ok(over);
  assert.equal(sum(day.sims[0].occupancy), spec.residents, 'everyone home again at night');
  assert.equal(sum(day.sims[1].occupancy), 0, 'the offices empty at night');
  // At about 10 AM the apartments are empty and the offices busy.
  const morning = new Day(spec);
  const best = par(spec);
  while (morning.clock < 10.5 * 60) {
    morning.sims.forEach((s, k) => dispatch(s, best.optsList[k]));
    morning.step(1 / 20);
  }
  assert.equal(sum(morning.sims[0].occupancy), 0, 'everyone has left the apartments');
  assert.ok(sum(morning.sims[1].occupancy) > spec.workers, 'and the offices are busy');
  // Most residents cross the street to work: the trip into the office starts
  // after the trip down, plus the time to cross.
  const [h, o] = day.sims;
  const there = h.arrivals.filter((a) => a.onward !== undefined);
  const back = o.arrivals.filter((a) => a.onward !== undefined);
  assert.ok(there.length > spec.residents / 2 && back.length === there.length, `${there.length} cross over, ${back.length} back`);
  for (const [a, other] of [...there.map((x) => [x, o]), ...back.map((x) => [x, h])]) {
    const b = other.byId.get(a.onward);
    assert.ok(Object.values(TRANSIT).includes(b.transit));
    assert.equal(b.look.join(), a.look.join());
    const done = (other === o ? h : o).doneAt.get(a.id);
    assert.ok(b.t + day.skipped >= done + b.transit - 1e-9, 'set off after crossing (or the clock skipped ahead)');
  }
});
