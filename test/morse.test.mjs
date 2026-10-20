import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE, UNIT, REPEAT, duration, levelSpec, starsFor } from '../games/morse/code.js';

// The game, headless: a canvas that draws nothing.
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
globalThis.window ??= { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
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

// ------------------------------------------------------------- sending

const { Keyer, decode, UNKNOWN } = await import('../games/morse/key.js');
const { SendPlay } = await import('../games/morse/send.js');

// Key a string of letters on a keyer at a given dit length (with a little
// human wobble), returning what it read.
const keyText = (k, text, dit, start = 0) => {
  let t = start;
  const out = [];
  for (const ch of text) {
    for (const s of CODE[ch]) {
      k.down(t);
      t += (s === '.' ? 1 : 3) * dit * (0.9 + 0.2 * ((t * 977) % 1));
      k.up(t);
      t += dit * (0.9 + 0.3 * ((t * 613) % 1));
    }
    for (let x = 0; x < 100; x++) {
      const c = k.tick(t);
      if (c) {
        out.push(c);
        break;
      }
      t += 0.02;
    }
  }
  return { text: out.join(''), t };
};

test('keying: decoded by your own rhythm -- quick, steady or slow', () => {
  assert.equal(decode('.-'), 'A');
  assert.equal(decode('.-.-.-.'), null);
  for (const dit of [0.05, 0.08, 0.12]) assert.equal(keyText(new Keyer(), 'EIANTMSOQ5', dit).text, 'EIANTMSOQ5', `dit ${dit}`);
  // A slow keyer: after a letter or two to learn, it reads them right.
  const k = new Keyer();
  keyText(k, 'EIA', 0.2);
  assert.equal(keyText(k, 'NTMSO', 0.2, 100).text, 'NTMSO');
  // Something that isn't a letter: '?'.
  assert.equal(keyText(new Keyer(), 'E', 0.08).text, 'E');
});

const sendGame = (spec) => {
  const p = new SendPlay(canvas(), spec, {});
  p.paused = false;
  return p;
};
const runSend = (p, s, now = 0) => {
  for (let t = 0; t < s && !p.over; t += 1 / 30) p.update(1 / 30, now + t);
};

test('sending: the cannon shoots the lowest tile with the letter keyed', () => {
  const p = sendGame({ ...levelSpec(1), letters: ['E', 'T', 'E'] });
  p.spec.every = 0.5;
  runSend(p, 2);
  assert.equal(p.tiles.length, 3);
  const lowest = p.tiles.filter((a) => a.ch === 'E').sort((a, b) => b.y - a.y)[0];
  assert.equal(p.fire('E'), true);
  assert.equal(p.shots[0].tile, lowest);
  runSend(p, 1.5, 10);
  assert.ok(!p.tiles.includes(lowest), 'shot down');
  assert.equal(p.hits, 1);
});

test('sending: a letter that isn\'t there flies off carrying it; not a character at all, a dud -- splat', () => {
  const p = sendGame({ ...levelSpec(1), letters: ['E'] });
  runSend(p, 1);
  assert.equal(p.fire('T'), false);
  assert.equal(p.wrong, 1);
  assert.equal(p.notes[0].ch, 'T');
  assert.equal(p.shots.length, 1);
  assert.equal(p.shots[0].tile, null);
  assert.equal(p.shots[0].label, 'T', 'the letter sent, riding along');
  p.fire(UNKNOWN);
  assert.equal(p.notes.length, 2, 'a ? floats up');
  assert.equal(p.duds.length, 1, 'out pops a dud');
  let now = 5;
  while (p.duds.length && now < 8) p.update(1 / 30, (now += 1 / 30));
  assert.equal(p.duds.length, 0);
  assert.equal(p.splats.length, 1, 'down it comes: splat');
  // (A real question mark is a character, not a dud.)
  assert.notEqual(UNKNOWN, '?');
  assert.equal(decode('..--..'), '?');
});

test('sending: tiles reaching the ground cost a life; three and it\'s over; shoot them all and you win', () => {
  const p = sendGame({ ...levelSpec(1), letters: ['E', 'T', 'A', 'N'] });
  p.spec.every = 0.5;
  runSend(p, 60);
  assert.equal(p.over.won, false);
  assert.equal(p.lives, 0);
  const q = sendGame({ ...levelSpec(1), letters: ['E', 'T'] });
  q.spec.every = 0.5;
  let now = 0;
  while (!q.over && now < 60) {
    for (const a of q.tiles) if (!q.shots.some((s) => s.tile === a)) q.fire(a.ch);
    q.update(1 / 30, (now += 1 / 30));
  }
  assert.equal(q.over.won, true);
  assert.equal(q.hits, 2);
});

test('sending: keying on the board -- your sidetone while the key is down, then the shot', () => {
  const tones = [];
  const p = new SendPlay(canvas(), { ...levelSpec(1), letters: ['T'] }, { tone: (on) => tones.push(on) });
  p.paused = false;
  runSend(p, 1);
  p.press(1);
  p.release(1.25);
  assert.deepEqual(tones, [true, false]);
  runSend(p, 1, 1.3);
  assert.equal(p.shots.length + p.hits, 1, 'T keyed and fired');
});

test('sending: excellent timing (every dah three dits, every pause one) shoots two of that letter', () => {
  const k = new Keyer();
  keyText(k, 'A', 0.1);
  assert.ok(k.precision >= 0.9, `even keying (${k.precision})`);
  let t = 10;
  k.down(t); k.up((t += 0.1)); k.down((t += 0.25)); k.up((t += 0.12)); // (a ragged A: the pause long, the dah short)
  for (let x = 0; x < 80 && !k.tick((t += 0.02)); x++);
  assert.ok(k.precision < 0.9, `ragged keying (${k.precision})`);
  const p = sendGame({ ...levelSpec(1), letters: ['A', 'A', 'A'] });
  p.spec.every = 0.5;
  runSend(p, 2);
  p.fire('A', 0.97);
  assert.equal(p.shots.length, 2, 'two for one');
  assert.ok(p.praise?.double);
  p.fire('A', 0.6);
  assert.equal(p.shots.length, 3, 'the last one, just the one shot');
  assert.equal(p.excellent, 1);
});
