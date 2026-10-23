import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, isRoad, route, nearestRoad, makeTown, levelPlan, jobAt, nextJob, builtBefore, LOTS } from '../games/benji/town.js';

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
