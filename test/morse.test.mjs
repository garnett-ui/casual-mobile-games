import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE, UNIT, duration, interval, levelSpec, starsFor } from '../games/morse/code.js';

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

test('timing: sent at 20 words a minute (a dit is 60 ms), the gaps stretched to 5 to start', () => {
  assert.equal(UNIT, 0.06);
  assert.ok(Math.abs(duration('.') - 0.06) < 1e-9);
  assert.ok(Math.abs(duration('-----') - 19 * 0.06) < 1e-9, 'five dahs and four gaps');
  assert.equal(interval(5), 2.4);
  assert.equal(levelSpec(1).wpm, 5);
  assert.equal(levelSpec(40).wpm, 20);
  const rates = Array.from({ length: 30 }, (_, k) => levelSpec(k + 1).wpm);
  assert.deepEqual([...rates].sort((a, b) => a - b), rates, 'never slower than the level before');
});

test('lessons: the short letters first, then longer ones, numbers and punctuation; the same letters every time', () => {
  assert.deepEqual(levelSpec(1).alphabet, ['E', 'T']);
  assert.deepEqual(levelSpec(3).alphabet.sort(), ['A', 'E', 'I', 'M', 'N', 'T']);
  const symbols = (n) => Math.max(...levelSpec(n).fresh.map((c) => CODE[c].length));
  for (let n = 1; n < 18; n++) if (levelSpec(n).fresh.length && levelSpec(n + 1).fresh.length) assert.ok(symbols(n + 1) >= symbols(n), `level ${n + 1}`);
  assert.ok(levelSpec(16).fresh.every((c) => /\d/.test(c)));
  assert.ok(levelSpec(18).fresh.every((c) => /[.,?/]/.test(c)));
  assert.deepEqual(levelSpec(7).letters, levelSpec(7).letters);
  const s = levelSpec(5);
  assert.ok(s.letters.filter((c) => s.fresh.includes(c)).length > s.letters.length / 3, 'the new ones often');
  assert.ok(s.letters.every((c) => s.alphabet.includes(c)));
});

test('play: each letter sounds as it drops in, face down; unanswered, it lands face up', () => {
  const { p, sounds } = game({ ...levelSpec(1), letters: ['E', 'T'], gap: 1, fall: 2 });
  run(p, 0.7);
  assert.deepEqual(sounds, ['.']);
  assert.equal(p.falling.length, 1);
  run(p, 6);
  assert.deepEqual(sounds, ['.', '-']);
  assert.deepEqual(p.stacks.flat().map((t) => t.ch).sort(), ['E', 'T']);
  assert.equal(p.over.won, true, 'through the lesson');
});

test('play: tap a board tile with the letter heard -- both go, and the tiles above drop', () => {
  const { p } = game({ ...levelSpec(1), letters: ['E', 'T', 'E', 'E'], gap: 1, fall: 1.5 });
  run(p, 4.5); // E and T land; the next E is falling
  const col = p.stacks.findIndex((s) => s.some((t) => t.ch === 'E'));
  // Pile a tile on top of the E, to see it drop.
  p.stacks[col].push({ id: 99, ch: 'T', dy: 0 });
  const before = p.stacks.flat().length;
  assert.ok(p.falling.some((f) => f.ch === 'E'));
  assert.equal(p.answer(col, p.stacks[col].findIndex((t) => t.ch === 'E')), true);
  assert.equal(p.stacks.flat().length, before - 1, 'the board E gone');
  assert.ok(!p.falling.some((f) => f.ch === 'E'), 'and the falling one');
  assert.ok(p.stacks[col].at(-1).dy > 0, 'the T above dropping');
  assert.equal(p.right, 1);
});

test('play: tap the wrong letter, and a copy of the right one drops in (and sounds again)', () => {
  const { p, sounds } = game({ ...levelSpec(1), letters: ['T', 'E'], gap: 1.2, fall: 1.5 });
  // T lands; E is falling.
  while (!(p.stacks.flat().length && p.falling.length)) p.update(1 / 30);
  const col = p.stacks.findIndex((s) => s.length);
  assert.equal(p.answer(col, 0), false);
  assert.equal(p.wrong, 1);
  assert.deepEqual(sounds.slice(-1), ['.'], 'E again');
  assert.ok(p.falling.some((f) => f.penalty && f.ch === 'E'), 'an E drops in');
});

test('play: a column up to the top, and it is over', () => {
  const spec = { ...levelSpec(1), letters: Array(200).fill('E'), gap: 0.2, fall: 0.5 };
  const { p } = game(spec);
  run(p, 60);
  assert.equal(p.over.won, false);
});

test('stars: by the letters you could have got', () => {
  assert.equal(starsFor(20, 20), 3);
  assert.equal(starsFor(15, 20), 2);
  assert.equal(starsFor(5, 20), 1);
});
