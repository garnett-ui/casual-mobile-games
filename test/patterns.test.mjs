import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PICTURES, SEQUENCES, distinct, oklab, rgb } from '../js/lib/patterns.js';

test('colour: OKLab there and back', () => {
  for (const c of [[0, 0, 0], [255, 255, 255], [200, 30, 90], [12, 160, 220], [255, 210, 63]]) {
    rgb(oklab(c)).forEach((v, i) => assert.ok(Math.abs(v - c[i]) <= 1, `${c} -> ${rgb(oklab(c))}`));
  }
});

test('pictures: the same seed draws the same picture; every tile tells apart (one solution)', () => {
  for (const p of PICTURES) {
    const a = p.make(7);
    const b = p.make(7);
    assert.deepEqual(a(0.3, 0.6, 1), b(0.3, 0.6, 1), p.id);
    for (const seed of [1, 2, 3, 4, 5]) {
      const f = p.make(seed);
      // (Colour differences: about 2 is just noticeable.)
      for (const n of [3, 4]) {
        const { alike } = distinct(f, n, n);
        assert.ok(alike >= 2.5, `${p.id} seed ${seed} at ${n}x${n}: ${alike.toFixed(1)}`);
      }
    }
  }
});

test('sequences: one of each, drawn without error', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k in Object.prototype ? undefined : (...args) => (calls.push(k), k === 'createLinearGradient' ? { addColorStop() {} } : undefined)), set: () => true });
  for (const q of SEQUENCES) for (let k = 0; k < 15; k++) q.draw(ctx, 64, k, 15);
  assert.ok(calls.length > 0);
});

test('moon: frames evenly spaced by how much is lit -- none too alike, even near full', () => {
  for (const n of [8, 15, 24]) {
    const frames = [];
    for (let k = 0; k < n; k++) {
      const f = { rx: null, waning: false };
      const ctx = new Proxy({}, {
        get: (_, key) => (key in Object.prototype ? undefined : (...a) => {
          if (key === 'ellipse') f.rx = a[2] * (a[7] ? 1 : -1); // (+ crescent, - gibbous)
          if (key === 'scale' && a[0] < 0) f.waning = true;
        }),
        set: () => true,
      });
      SEQUENCES.find((q) => q.id === 'moon').draw(ctx, 100, k, n);
      frames.push(f);
    }
    // The shadow's edge, from new (one side) across to full and back.
    const r = 36;
    const edge = frames.map((f, k) => (k === 0 ? r : f.rx === null ? r : f.rx));
    for (let k = 1; k < n; k++) {
      const same = frames[k].waning === frames[k - 1].waning;
      if (same) assert.ok(Math.abs(edge[k] - edge[k - 1]) >= 0.15 * r, `n ${n}: frames ${k - 1} and ${k}`);
    }
  }
});
