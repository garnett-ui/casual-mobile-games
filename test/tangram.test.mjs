import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SET, SHAPES, FIGURES, TRAY, figure, shape, outline, flipped, area, inside, coverage, solved, snap, same, starsFor } from '../games/tangram/model.js';

test('the seven pieces make a square of area 8', () => {
  assert.deepEqual(SET, ['L', 'L', 'M', 'S', 'S', 'Q', 'P']);
  const total = SET.reduce((a, t) => a + area(SHAPES[t]), 0);
  assert.equal(total, 8);
});

test('turning a piece keeps its shape, and eight turns bring it back', () => {
  for (const t of Object.keys(SHAPES)) {
    for (let rot = 0; rot < 8; rot++) assert.ok(Math.abs(area(outline(t, rot, 0)) - area(SHAPES[t])) < 1e-9);
    const p = { t, rot: 0, flip: 0, x: 1, y: 2 };
    assert.ok(same(shape({ ...p, rot: 8 % 8 }), shape(p)));
  }
  // Turned over twice is back as it was; once is a mirror image (for the
  // parallelogram, not one you can get by turning it).
  const p = { t: 'P', rot: 3, flip: 0, x: 0, y: 0 };
  assert.ok(same(shape(flipped(flipped(p))), shape(p)));
  for (let rot = 0; rot < 8; rot++) assert.ok(!same(shape({ ...p, rot }), shape(flipped(p))));
});

test('every figure is made of the seven pieces, without overlaps, and its own pieces solve it', () => {
  assert.ok(FIGURES.length >= 12);
  for (let n = 1; n <= FIGURES.length; n++) {
    const f = figure(n);
    assert.deepEqual(f.slots.map((s) => s.t), SET, f.name);
    const a = f.polys.reduce((s, p) => s + area(p), 0);
    assert.ok(Math.abs(a - 8) < 1e-9, `${f.name}: area ${a}`);
    // No point is inside two pieces.
    for (const [x, y] of f.samples) assert.ok(f.polys.filter((p) => inside(p, x, y)).length === 1, `${f.name}: overlap at ${x},${y}`);
    assert.ok(Math.abs(f.samples.length * 0.06 * 0.06 - 8) < 0.4, `${f.name}: samples cover it`);
    assert.equal(coverage(f, f.slots), 1, f.name);
    assert.ok(solved(f, f.slots));
    // Every piece is in the picture: touching another one (a corner of one
    // on an edge of the other).
    const onEdge = ([x, y], pts) => pts.some((a, k) => {
      const b = pts[(k + 1) % pts.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy) < 1e-6;
    });
    for (const [i, p] of f.polys.entries()) assert.ok(f.polys.some((q, j) => j !== i && (q.some((v) => onEdge(v, p)) || p.some((v) => onEdge(v, q)))), `${f.name}: piece ${i} on its own`);
  }
});

test('not solved: pieces in the tray, or one a little out of place', () => {
  for (let n = 1; n <= FIGURES.length; n++) {
    const f = figure(n);
    assert.ok(!solved(f, TRAY.rows.pieces), f.name);
    for (let i = 0; i < 7; i++) {
      const off = f.slots.map((s, j) => (j === i ? { ...s, x: s.x + 0.25 } : s));
      assert.ok(!solved(f, off), `${f.name}: piece ${i} off by a quarter`);
    }
  }
});

test('another way of making a figure counts too (the square: its two large triangles swapped)', () => {
  const f = figure(12);
  const [a, b] = f.slots;
  const swapped = [{ ...b }, { ...a }, ...f.slots.slice(2)];
  assert.ok(solved(f, swapped));
  // And the stored solution, all turned over, makes the mirror image -- not
  // this square (unless it's symmetric, which the rabbit isn't).
  const r = figure(5);
  const mirror = r.slots.map((s) => ({ ...flipped(s), x: r.w - s.x }));
  assert.ok(!solved(r, mirror));
});

test('a piece dropped near its place snaps onto it', () => {
  const f = figure(1);
  const s = f.slots[0];
  const p = { ...s, x: s.x + 0.15, y: s.y - 0.1 };
  const d = snap(shape(p), f.verts, 0.3);
  assert.ok(d);
  assert.ok(same(shape({ ...p, x: p.x + d[0], y: p.y + d[1] }), shape(s)));
  assert.equal(snap(shape({ ...s, x: s.x + 2 }), f.verts.filter((v) => v[0] < 0), 0.3), null);
});

test('the trays hold the set in order, without overlaps', () => {
  for (const lay of Object.values(TRAY)) {
    assert.deepEqual(lay.pieces.map((p) => p.t), SET);
    const polys = lay.pieces.map(shape);
    for (let x = 0.01; x < lay.w; x += 0.05) {
      for (let y = 0.01; y < lay.h; y += 0.05) assert.ok(polys.filter((p) => inside(p, x, y)).length <= 1);
    }
  }
});

test('stars: three without a hint', () => {
  assert.equal(starsFor(0), 3);
  assert.equal(starsFor(1), 2);
  assert.equal(starsFor(2), 2);
  assert.equal(starsFor(5), 1);
});
