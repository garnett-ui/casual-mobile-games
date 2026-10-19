import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE, UNIT, REPEAT, duration, levelSpec, starsFor } from '../games/morse/code.js';

// The game, headless: a canvas that draws nothing.
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
globalThis.window ??= { devicePixelRatio: 1 };
const stub = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => stub), set: () => true });
const canvas = (w = 384, h = 700) => ({ getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }), getContext: () => stub, addEventListener() {}, removeEventListener() {} });
const { Play } = await import('../games/morse/play.js');
const game = (spec, hooks = {}) => {
  const sounds = [];
  const p = new Play(canvas(), spec, { morse: (c) => sounds.push(c), ...hooks });
  p.paused = false;
  return { p, sounds };
};
const run = (p, s) => {
  for (let t = 0; t < s && !p.over; t += 1 / 30) p.update(1 / 30);
};


test('the code: every letter, number and the punctuation, all different', () => {
  const chars = Object.keys(CODE);
  assert.equal(chars.length, 26 + 10 + 4);
  assert.equal(new Set(Object.values(CODE)).size, chars.length);
  assert.equal(CODE.E, '.');
  assert.equal(CODE.Q, '--.-');
});

test('timing: sent at 20 words a minute (a dit is 60 ms)', () => {
  assert.equal(UNIT, 0.06);
  assert.ok(Math.abs(duration('.') - 0.06) < 1e-9);
  assert.ok(Math.abs(duration('-----') - 19 * 0.06) < 1e-9, 'five dahs and four gaps');
});

test('lessons: E I A N T to start, then a couple more each level -- longer codes, numbers, punctuation', () => {
  assert.deepEqual(levelSpec(1).alphabet, ['E', 'I', 'A', 'N', 'T']);
  assert.ok(levelSpec(1).letters.length >= 10);
  const longest = (n) => Math.max(...levelSpec(n).fresh.map((c) => CODE[c].length));
  for (let n = 2; n < 14; n++) if (levelSpec(n).fresh.length && levelSpec(n + 1).fresh.length) assert.ok(longest(n + 1) >= longest(n), `level ${n + 1}`);
  assert.ok(levelSpec(15).fresh.every((c) => /\d/.test(c)));
  assert.ok(levelSpec(17).fresh.every((c) => /[.,?/]/.test(c)));
  assert.deepEqual(levelSpec(7).letters, levelSpec(7).letters, 'the same every time');
  const s = levelSpec(4);
  assert.ok(s.letters.filter((c) => s.fresh.includes(c)).length > s.letters.length / 3, 'the new ones often');
  assert.ok(s.letters.every((c) => s.alphabet.includes(c)));
});

test('play: a cloud of letters; you hear one that is on the screen', () => {
  const { p, sounds } = game(levelSpec(1));
  assert.equal(p.tiles.length, levelSpec(1).letters.length);
  run(p, 1);
  assert.equal(sounds.length, 1);
  assert.ok(p.tiles.some((t) => t.ch === p.target) && CODE[p.target] === sounds[0]);
  // Drifting, and staying on the screen.
  const at = p.tiles.map((t) => [t.x, t.y]);
  run(p, 2);
  assert.ok(p.tiles.some((t, k) => t.x !== at[k][0] || t.y !== at[k][1]), 'drifting');
  assert.ok(p.tiles.every((t) => t.x >= 0 && t.x <= p.W && t.y >= p.top && t.y <= p.H), 'on the screen');
});

test('play: tap a tile with the letter heard and it goes; the next one plays; clear them all to win', () => {
  const { p, sounds } = game(levelSpec(1));
  while (!p.over) {
    run(p, 1);
    const tile = p.tiles.find((t) => t.ch === p.target);
    if (tile) assert.equal(p.answer(tile), true);
  }
  assert.equal(p.over.won, true);
  assert.equal(p.right, levelSpec(1).letters.length);
  assert.equal(sounds.length, levelSpec(1).letters.length, 'one each');
});

test('play: it repeats till you find it -- no hurry; the wrong letter brings a copy of the right one', () => {
  const { p, sounds } = game({ ...levelSpec(1), letters: ['E', 'T'] });
  run(p, 1);
  const want = p.target;
  run(p, 3 * (REPEAT + 0.3));
  assert.ok(sounds.length >= 3 && sounds.every((c) => c === CODE[want]), 'again and again');
  assert.equal(p.tiles.length, 2, 'no copies for taking your time');
  const wrong = p.tiles.find((t) => t.ch !== want);
  assert.equal(p.answer(wrong), false);
  assert.equal(p.wrong, 1);
  assert.equal(p.tiles.length, 3);
  assert.ok(p.tiles.at(-1).ch === want && p.tiles.at(-1).copy, 'a copy of the right one');
  assert.equal(sounds.at(-1), CODE[want], 'heard again');
});

test('play: let the cloud grow to twice its size (wrong, wrong, wrong...), and it is over', () => {
  const { p } = game({ ...levelSpec(1), letters: ['E', 'T'] });
  run(p, 1);
  while (!p.over) p.answer(p.tiles.find((t) => t.ch !== p.target));
  assert.equal(p.over.won, false);
});

test('stars: by the letters got first time', () => {
  assert.equal(starsFor(20, 20), 3);
  assert.equal(starsFor(15, 20), 2);
  assert.equal(starsFor(5, 20), 1);
});
