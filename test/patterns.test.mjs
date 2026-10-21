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
