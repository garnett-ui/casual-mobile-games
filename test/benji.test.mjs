import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, isRoad, route, nearestRoad, makeTown, levelPlan, jobAt, nextJob, builtBefore, LOTS } from '../games/benji/town.js';
import { walkways, walkDoor, junctions, crossings, isJunction, isLit, lights, mayWalk, walkSignal, zebra, WALK_TIME } from '../games/benji/streets.js';
import { Traffic, lanePoint, startDir, streetTiles, footprint } from '../games/benji/traffic.js';

test('the town: every place off the streets, on its own tile, with a door on a street, all joined up', () => {
  const town = makeTown(1);
  const seen = new Set();
  for (const p of town.places) {
    for (let x = p.x; x < p.x + (p.w || 1); x++) {
      for (let y = p.y; y < p.y + (p.h || 1); y++) {
        assert.ok(!isRoad(x, y), `${p.id} not on a street`);
        assert.ok(!seen.has(y * SIZE + x), `${p.id} has its own tile`);
        seen.add(y * SIZE + x);
      }
    }
    assert.ok(isRoad(p.door.x, p.door.y), `${p.id}'s door is on a street`);
    const touching = Math.abs(p.door.x - Math.max(p.x, Math.min(p.x + (p.w || 1) - 1, p.door.x))) + Math.abs(p.door.y - Math.max(p.y, Math.min(p.y + (p.h || 1) - 1, p.door.y)));
    assert.equal(touching, 1, `${p.id}'s door is beside it`);
  }
  const a = town.places[0].door;
  for (const p of town.places) {
    const r = route(a, p.door);
    assert.deepEqual(r[r.length - 1], p.door);
    for (let k = 1; k < r.length; k++) assert.equal(Math.abs(r[k].x - r[k - 1].x) + Math.abs(r[k].y - r[k - 1].y), 1, 'a step at a time');
  }
  assert.deepEqual(nearestRoad(0.4, 1.6), { x: 0, y: 1 });
});

// Plays a level the way tapping does: each helper in turn to its next job
// (the mixer back to the yard to load up between stages).
function playThrough(town) {
  const done = new Set();
  const at = Object.fromEntries(town.helpers.map((h) => [h.id, h.at]));
  const loaded = {};
  for (let guard = 0; guard < 200 && done.size < town.jobs.length; guard++) {
    for (const h of town.helpers) {
      if (h.kind === 'mixer' && loaded[h.id] === false) {
        at[h.id] = town.places.find((p) => p.id === 'yard').door;
        loaded[h.id] = true;
        continue;
      }
      const j = nextJob(town, h, done);
      if (!j) continue;
      const door = town.places.find((p) => p.id === j.place).door;
      assert.ok(route(at[h.id], door).length > 0);
      at[h.id] = door;
      const found = jobAt(town, h, door, done);
      assert.ok(found, `level ${town.n}: ${h.id} can do its job at ${j.place}`);
      done.add(found.i);
      if (found.kind === 'build') loaded[h.id] = false;
    }
  }
  return done.size === town.jobs.length;
}

test('every level can be finished, just by tapping each helper in turn', () => {
  for (let n = 1; n <= 40; n++) {
    const town = makeTown(n);
    assert.ok(town.jobs.length > 0, `level ${n} has jobs`);
    assert.ok(playThrough(town), `level ${n} finished`);
  }
});

test('the levels: tapping first, then driving; the town grows as houses are built', () => {
  assert.ok(!makeTown(1).drive && !makeTown(5).drive);
  assert.ok(makeTown(6).drive);
  assert.deepEqual(Object.keys(levelPlan(1)), ['garbage']);
  assert.equal(builtBefore(4), 0);
  assert.equal(builtBefore(5), 1);
  // The house built in level 4 is a home from level 5 on (with bins out, letters...).
  const five = makeTown(5);
  assert.equal(five.places.find((p) => p.id === LOTS[0]).kind, 'home');
  assert.equal(makeTown(4).places.find((p) => p.id === LOTS[0]).kind, 'lot');
  // A level is the same every time.
  assert.deepEqual(makeTown(7), makeTown(7));
  // Bins first, then the dump; the park, then home.
  const three = makeTown(3);
  const truck = three.helpers.find((h) => h.kind === 'garbage');
  const dump = three.places.find((p) => p.id === 'dump').door;
  assert.equal(jobAt(three, truck, dump, new Set()), null, 'not the dump till the bins are in');
});

// ------------------------------------------------- sidewalks and traffic

test('the sidewalks: off the streets except at the crosswalks, all joined up, one outside every door', () => {
  const w = walkways();
  const inStreet = (x, y) => isRoad(Math.floor(x), Math.floor(y)) && x % 1 > 0.001 && x % 1 < 0.999 && y % 1 > 0.001 && y % 1 < 0.999;
  let count = 0;
  w.adj.forEach((edges, a) => {
    for (const e of edges) {
      const p = w.nodes[a];
      const q = w.nodes[e.to];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      if (e.cross) {
        count++;
        assert.ok(isJunction(...[e.cross.ix, e.cross.iy]), 'a crosswalk is by an intersection');
        assert.ok(isRoad(Math.floor(mid.x), Math.floor(mid.y)), 'a crosswalk crosses a street');
        assert.ok(!inStreet(p.x, p.y) && !inStreet(q.x, q.y), 'and starts and ends on the sidewalk');
        assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 1.2, 'straight across');
      } else {
        for (const pt of [p, q, mid]) assert.ok(!inStreet(pt.x, pt.y), `sidewalk at ${pt.x},${pt.y} is off the street`);
      }
    }
  });
  assert.equal(count / 2, crossings().length);
  assert.equal(crossings().length, junctions().length * 4 - 12 + 4, 'a crosswalk on every arm of every intersection (bar most dead ends)');
  const town = makeTown(10);
  const spots = town.places.map((p) => walkDoor(w, p));
  for (const p of town.places) {
    const n = w.nodes[walkDoor(w, p)];
    assert.ok(Math.hypot(n.x - (p.door.x + 0.5), n.y - (p.door.y + 0.5)) < 0.75, `${p.id}'s spot is by its door`);
    assert.ok(!isJunction(p.door.x, p.door.y), `${p.id}'s door isn't in an intersection`);
  }
  for (const b of spots) {
    const r = w.route(spots[0], b);
    assert.equal(r[r.length - 1], b, 'every spot can be walked to');
  }
});

test('the lights: the two ways take turns, with all red between; walk with the traffic going your way', () => {
  for (const { x, y } of junctions()) {
    let greens = { ew: 0, ns: 0 };
    for (let t = 0; t < 30; t += 0.05) {
      const l = lights(x, y, t);
      assert.ok(l.ew === 'red' || l.ns === 'red', 'never both going');
      for (const axis of ['ew', 'ns']) if (l[axis] === 'green') greens[axis]++;
      const cross = { ix: x, iy: y, arm: 'n', walk: 'ew' };
      if (mayWalk(cross, t)) {
        assert.equal(l.ns, 'red', 'walk across the north-south street while its traffic has a red');
        assert.ok(l.left > WALK_TIME, 'and time to get over');
      }
      // A walk signal turns to the red hand before the green ends.
      assert.ok(!(walkSignal(cross, t) === 'walk' && l.ew !== 'green'));
    }
    assert.ok(greens.ew > 100 && greens.ns > 100, 'each way gets its turn');
  }
});

// Runs the town's traffic for a while -- cars and people going all over --
// checking the rules every step.
function traffic(seconds, cars = 6, people = 8, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const w = walkways();
  const tr = new Traffic(w);
  const streets = streetTiles(SIZE);
  const anyStreet = () => streets[Math.floor(rand() * streets.length)];
  for (let k = 0; k < cars; k++) {
    const tile = anyStreet();
    const dir = startDir(tile);
    tr.cars.push({ tile, dir, ...lanePoint(tile, dir), path: [], trips: 0, patience: 2 });
  }
  for (let k = 0; k < people; k++) {
    const node = Math.floor(rand() * w.nodes.length);
    tr.people.push({ node, ...w.nodes[node], path: [], trips: 0 });
  }
  const dt = 1 / 30;
  const seen = { entries: 0, crossings: 0, waits: 0, zebra: 0 };
  for (let t = 0; t < seconds; t += dt) {
    tr.t = t;
    for (const c of tr.cars) {
      if (!c.path.length) {
        c.path = route(c.tile, anyStreet()).slice(1);
        c.trips++;
      }
      const before = c.pass;
      tr.drive(c, 1.8, dt);
      if (c.pass && c.pass !== before) {
        seen.entries++;
        const [ix, iy] = c.pass.split(',').map(Number);
        if (isLit(ix, iy)) {
          const axis = c.dir.x || (c.tile.x !== ix) ? 'ew' : 'ns';
          assert.equal(lights(ix, iy, t)[axis], 'green', 'cars go on green');
        } else {
          const others = tr.cars.filter((o) => o !== c && tr.through(o, c.pass));
          assert.equal(others.length, 0, 'no lights: one car through at a time');
        }
      }
      if (c.wait === 'light') seen.waits++;
      // Off the sidewalks: in the street, always.
      assert.ok(isRoad(Math.floor(c.x), Math.floor(c.y)), `car on the street at ${c.x},${c.y}`);
    }
    for (const p of tr.people) {
      if (!p.path.length) {
        p.path = w.route(p.node, Math.floor(rand() * w.nodes.length)).slice(1);
        p.trips++;
      }
      const was = p.crossing;
      tr.walk(p, 0.9, dt);
      if (p.crossing && p.crossing !== was) {
        seen.crossings++;
        if (isLit(p.crossing.ix, p.crossing.iy)) assert.equal(walkSignal(p.crossing, t), 'walk', 'people start across on the walk signal');
        else seen.zebra++;
      }
      if (p.crossing) assert.ok(!tr.carsOn(p.crossing) || was, 'no car on the crosswalk as they start');
    }
    // Nobody on a crosswalk while a car is going over it.
    for (const p of tr.people) {
      if (!p.crossing) continue;
      const [x0, y0, x1, y1] = zebra(p.crossing.ix, p.crossing.iy, p.crossing.arm);
      for (const c of tr.cars) {
        const [a0, b0, a1, b1] = footprint(c);
        const near = a1 > x0 && a0 < x1 && b1 > y0 && b0 < y1;
        assert.ok(!near, `a car at ${c.x.toFixed(2)},${c.y.toFixed(2)} on the crosswalk with someone on it (${p.crossing.arm} of ${p.crossing.ix},${p.crossing.iy}) at ${t.toFixed(2)}`);
      }
    }
  }
  return { tr, seen };
}

test('the traffic: cars stop at red and go on green (or take turns), people cross on the walk signal, never both on a crosswalk -- and everyone gets where they are going', () => {
  for (const seed of [1, 2, 3]) {
    const { tr, seen } = traffic(240, 6, 10, seed);
    assert.ok(seen.entries > 50 && seen.crossings > 30 && seen.zebra > 10 && seen.waits > 0, JSON.stringify(seen));
    for (const c of tr.cars) assert.ok(c.trips >= 5, `every car keeps going (${c.trips} trips)`);
    for (const p of tr.people) assert.ok(p.trips >= 3, `everyone keeps walking (${p.trips} trips)`);
  }
});
