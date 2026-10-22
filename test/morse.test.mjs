import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE, UNIT, duration, cycle, paceFor, levelSpec, starsFor } from '../games/morse/code.js';

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
  run(p, 3 * (cycle(CODE[p.target ?? 'E'], 5) + 0.3));
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
const { SendPlay, sendPace, SLOWEST, FASTEST, MIN_ON_SCREEN } = await import('../games/morse/send.js');

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
      if (c) out.push(c);
      if (c && !k.done.length && !k.code) break;
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

// Key a string continuously, as a person would -- the next letter straight
// after the last (letterGap dits apart), with a little wobble -- while the
// game reads the keyer every frame. What it read.
const keyStream = (k, text, dit, { letterGap = 3, wobble = 0.15, frame = 1 / 60, start = 0, seed = 1 } = {}) => {
  let x = seed;
  const jiggle = () => 1 + wobble * (((x = (x * 16807) % 2147483647) / 2147483647) * 2 - 1);
  const events = []; // [time, down?]
  let t = start;
  for (const ch of text) {
    [...CODE[ch]].forEach((s, i) => {
      if (i) t += dit * jiggle();
      events.push([t, true]);
      t += (s === '.' ? 1 : 3) * dit * jiggle();
      events.push([t, false]);
    });
    t += letterGap * dit * jiggle();
  }
  const out = [];
  let e = 0;
  for (let now = start; now < t + 2; now += frame) {
    while (e < events.length && events[e][0] <= now) {
      const [at, down] = events[e++];
      if (down) k.down(at);
      else k.up(at);
    }
    const c = k.tick(now);
    if (c) out.push(c);
  }
  return out.join('');
};

test('keying: letters sent one straight after another, properly spaced, each read on its own', () => {
  for (const dit of [0.06, 0.08, 0.1, 0.15]) {
    const text = 'EIANTMSOUEDKRWGTAINE';
    // (A new keyer starts out generous, for a beginner's pauses: someone
    // quick runs a few letters together till it's learnt them.)
    if (dit >= 0.1) assert.equal(keyStream(new Keyer(), text, dit), text, `dit ${dit}`);
    const fresh = new Keyer();
    keyStream(fresh, 'EIANTS', dit);
    assert.equal(keyStream(fresh, text, dit, { start: 30 }), text, `dit ${dit}, after a few letters`);
    // ...and from a keyer that's already learnt you.
    const k = new Keyer({ dit });
    keyStream(k, 'TEAN', dit);
    assert.equal(keyStream(k, text, dit, { start: 50, seed: 7 }), text, `dit ${dit}, learnt`);
  }
  // A speed remembered wrong (much too slow) is soon put right.
  const k = new Keyer({ dit: 0.3 });
  keyStream(k, 'EEIAN', 0.07);
  assert.equal(keyStream(k, 'AINTEMS', 0.07, { start: 50 }), 'AINTEMS');
  // Tapping on glass: quick taps, but slower lifts between them (and a
  // beginner's long pauses) -- each letter whole, straight away.
  for (const [dit, dah, pause, space] of [[0.06, 0.25, 0.15, 0.45], [0.1, 0.3, 0.18, 0.6], [0.04, 0.2, 0.16, 0.5]]) {
    for (const k of [new Keyer(), new Keyer({ dit: 0.05 })]) {
      let t = 0;
      const out = [];
      const text = 'KKANTKRDGW';
      for (const ch of text) {
        [...CODE[ch]].forEach((s, i) => {
          for (const end = t + (i ? pause : 0); t < end; t += 1 / 60) {
            const c = k.tick(t);
            if (c) out.push(c);
          }
          k.down(t);
          t += s === '.' ? dit : dah;
          k.up(t);
        });
        for (const end = t + space; t < end; t += 1 / 60) {
          const c = k.tick(t);
          if (c) out.push(c);
        }
      }
      assert.equal(out.join(''), text, `taps ${dit}/${dah}, pauses ${pause}`);
    }
  }
  // A slow-ish frame rate doesn't run letters together either.
  assert.equal(keyStream(new Keyer({ dit: 0.06, pause: 0.06 }), 'EEEETTTTIIII', 0.06, { frame: 1 / 15 }), 'EEEETTTTIIII');
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
  runSend(p, 60);
  assert.equal(p.over.won, false);
  assert.equal(p.lives, 0);
  const q = sendGame({ ...levelSpec(1), letters: ['E', 'T'] });
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
  runSend(p, 2);
  p.fire('A', 0.97);
  assert.equal(p.shots.length, 2, 'two for one');
  assert.ok(p.praise?.double);
  p.fire('A', 0.6);
  assert.equal(p.shots.length, 3, 'the last one, just the one shot');
  assert.equal(p.excellent, 1);
});

test('sending: from 5 words a minute, faster as you keep ahead -- fewer than three left, all high (up to 20) -- slower as they get low; always a few to aim at', () => {
  assert.equal(sendPace(1).wpm, SLOWEST);
  assert.ok(sendPace(40).wpm < FASTEST);
  const p = sendGame({ ...levelSpec(1), letters: Array(200).fill('E') });
  runSend(p, 1.5);
  assert.equal(p.tiles.length, MIN_ON_SCREEN, 'three to aim at straight away, even at the slowest');
  // Clear each one as soon as it's in: more keep coming, and faster.
  let now = 10;
  for (let k = 0; k < 40; k++) {
    for (const a of p.tiles) if (!p.shots.some((s) => s.tile === a) && a.y > 0) p.fire(a.ch);
    for (let x = 0; x < 30; x++) p.update(1 / 30, (now += 1 / 30));
  }
  assert.ok(p.hits >= 30, `shot down ${p.hits}`);
  assert.equal(p.tempo, FASTEST, 'up to 20 and no more');
  assert.ok(p.wpm > 15, `eased up to ${p.wpm}`);
  assert.ok(p.result(true).topWpm > 15);
  // Let them come down: a life lost, and it slows (never below 5).
  while (p.lives === 3 && now < 300) p.update(1 / 30, (now += 1 / 30));
  assert.ok(p.tempo < FASTEST, `eased off: ${p.tempo}`);
  while (!p.over && now < 600) p.update(1 / 30, (now += 1 / 30));
  assert.ok(p.tempo >= SLOWEST);
});

test('sending: effective speed -- letters keyed right a minute, five to a word', () => {
  const p = sendGame({ ...levelSpec(1), letters: Array(20).fill('E') });
  assert.equal(p.effectiveWpm, 0);
  let now = 0;
  // One letter keyed right every 1.2 s (50 a minute: 10 wpm), and some misses.
  for (let k = 0; k < 10; k++) {
    if (k === 0) while (!p.tiles.length) p.update(1 / 30, (now += 1 / 30));
    p.fire('E');
    p.fire('T');
    for (let x = 0; x < 36; x++) p.update(1 / 30, (now += 1 / 30));
  }
  assert.equal(p.sent, 10);
  assert.ok(Math.abs(p.effectiveWpm - 10 * (9 * 1.2) / (9 * 1.2 + 0.0)) < 1.2, `${p.effectiveWpm}`);
  assert.equal(p.result(true).effectiveWpm, p.effectiveWpm);
});

test('sending: keying letter after letter, properly spaced, shoots every one -- fast enough to keep up', () => {
  const p = sendGame({ ...levelSpec(5), letters: Array.from({ length: 60 }, (_, i) => 'EIANTMSOUDRKW'[(i * 7) % 13]) });
  p.tempo = p.wpm = 15; // (the rain, quick)
  const dit = 0.06; // (keyed at 20 words a minute)
  const frame = 1 / 60;
  let now = 0;
  let plan = []; // [time, down?] for the letter being keyed
  let free = 0; // when the key's free for the next letter (a letter's space after the last)
  const claimed = new Set();
  while (!p.over && now < 120) {
    if (!plan.length) {
      const tile = p.tiles.filter((a) => a.y > 0 && !claimed.has(a)).sort((a, b) => b.y - a.y)[0];
      if (tile) {
        claimed.add(tile);
        let t = Math.max(now, free);
        [...CODE[tile.ch]].forEach((s, i) => {
          if (i) t += dit;
          plan.push([t, true]);
          t += (s === '.' ? 1 : 3) * dit;
          plan.push([t, false]);
        });
        free = t + 3 * dit;
      }
    }
    while (plan.length && plan[0][0] <= now) {
      const [t, down] = plan.shift();
      if (down) p.press(t);
      else p.release(t);
    }
    p.update(frame, (now += frame));
  }
  assert.equal(p.over?.won, true, `cleared them all (lives ${p.lives}, hits ${p.hits})`);
  assert.equal(p.lives, 3, 'none got through');
  assert.ok(p.excellent > 0, 'and, keyed perfectly, two for one');
  // (Every letter read right: the only misses are letters keyed at a tile a
  // two-for-one had already taken.)
  assert.ok(p.wrong <= p.excellent, `${p.wrong} keyed at nothing`);
  assert.equal(p.notes.filter((n) => n.ch === UNKNOWN).length, 0, 'no duds');
});

test('sending: a high shot with plenty still coming down doesn\'t speed it up', () => {
  const p = sendGame({ ...levelSpec(1), letters: ['E', 'T', 'A', 'N', 'I'] });
  for (let now = 0; now < 4; now += 1 / 30) p.update(1 / 30, now);
  assert.ok(p.tiles.length >= 4);
  const was = p.tempo;
  const high = p.tiles.slice().sort((a, b) => a.y - b.y)[0];
  p.tiles.splice(p.tiles.indexOf(high), 1);
  p.quicken(high.y);
  assert.equal(p.tempo, was, 'three or more left: no faster');
  // Down to two, both high: faster.
  for (const a of p.tiles.slice(2)) p.tiles.splice(p.tiles.indexOf(a), 1);
  for (const a of p.tiles) a.y = p.ground * 0.3;
  p.quicken(p.ground * 0.2);
  assert.ok(p.tempo > was);
  // Two, but one low: no faster.
  const now = p.tempo;
  p.tiles[0].y = p.ground * 0.6;
  p.quicken(p.ground * 0.2);
  assert.equal(p.tempo, now);
});

test('sending: keying the next letter while a shot is still flying -- each goes on its own', () => {
  const p = sendGame({ ...levelSpec(1), letters: ['E', 'T', 'A'] });
  let now = 0;
  const step = (s) => { for (const end = now + s; now < end; now += 1 / 60) p.update(1 / 60, now); };
  step(2);
  assert.equal(p.tiles.length, 3);
  const key = (ch, unit = 0.08) => {
    [...CODE[ch]].forEach((s, i) => {
      if (i) step(unit);
      p.press(now);
      step((s === '.' ? 1 : 3) * unit);
      p.release(now);
    });
  };
  key('E');
  step(0.4);
  assert.equal(p.shots.length, 1, 'E fired');
  const slow = p.shots[0];
  slow.speed = 30; // (a long flight)
  key('A');
  step(0.4);
  assert.equal(p.shots.length, 2, 'A fired too, the E shot still on its way');
  assert.ok(p.shots.includes(slow));
  assert.notEqual(p.shots[1].tile, slow.tile);
  key('T');
  step(0.4);
  assert.equal(p.hits + p.shots.length, 3, 'and T');
  slow.speed = 2000;
  step(1.5);
  assert.equal(p.hits, 3, 'all three down');
  assert.equal(p.wrong, 0);
});

test('listening: 5 words a minute through the lessons, then each review quicker, up to 15', () => {
  assert.equal(paceFor(1), 5);
  assert.equal(paceFor(17), 5, 'the last lesson');
  assert.equal(paceFor(18), 6);
  assert.equal(paceFor(27), 15);
  assert.equal(paceFor(60), 15, 'and no faster');
  assert.equal(levelSpec(20).pace, 8);
  // A character comes round every 12/w seconds (five to a word) -- but
  // never sooner than its own length and a letter's space.
  assert.ok(Math.abs(cycle('.', 5) - 2.4) < 1e-9);
  assert.ok(Math.abs(cycle('.', 15) - 0.8) < 1e-9);
  assert.ok(cycle('-----', 15) >= duration('-----') + 3 * UNIT);
});

test('listening: heard more than once before you find it costs a little; faster levels repeat sooner', () => {
  const plays = (n) => {
    const heard = [];
    const p = new Play(canvas(), { ...levelSpec(n), letters: ['E', 'T', 'A'] }, { morse: (code) => heard.push(code) });
    p.paused = false;
    run(p, 6);
    return { p, heard: heard.length };
  };
  const slow = plays(3);
  const fast = plays(30);
  assert.ok(fast.heard > slow.heard * 2, `15 wpm repeats sooner (${fast.heard} against ${slow.heard})`);
  // Heard twice, then found: once "again".
  const p = slow.p;
  const tile = p.tiles.find((t) => t.ch === p.target);
  p.answer(tile);
  assert.equal(p.again, 1);
  // ...and found at the first hearing: not.
  run(p, 1.2);
  p.answer(p.tiles.find((t) => t.ch === p.target));
  assert.equal(p.again, 1);
  assert.equal(p.result(false).again, 1);
  // The stars: hearing again costs a quarter of a wrong tap.
  assert.equal(starsFor(20, 20, 8), 3);
  assert.equal(starsFor(20, 20, 10), 2);
  assert.equal(starsFor(18, 20, 0), 3);
  assert.equal(starsFor(18, 20, 1), 2);
});

const { updateTrouble, hardest, practiceSpec, DECAY, WRONG } = await import('../games/morse/code.js');

test('letters to work on: each game the old weights fade by 0.9, then the new points come in', () => {
  assert.equal(DECAY, 0.9);
  assert.equal(WRONG, 3);
  let w = updateTrouble({}, { K: 4, E: 0 });
  assert.deepEqual(w, { K: 4 });
  w = updateTrouble(w, { Q: 3 });
  assert.ok(Math.abs(w.K - 3.6) < 1e-9);
  assert.equal(w.Q, 3);
  // Ten quiet games: K's down to about a third.
  for (let k = 0; k < 10; k++) w = updateTrouble(w, {});
  assert.ok(Math.abs(w.K - 3.6 * 0.9 ** 10) < 0.01);
  // ...and the hardest, in order; ties alphabetical.
  assert.deepEqual(hardest({ A: 1, B: 5, C: 3, D: 3, E: 0.5, F: 2, G: 4, H: 6, I: 0.2 }, 7).map(([ch]) => ch), ['H', 'B', 'G', 'C', 'D', 'F', 'A']);
  // A practice cloud: just those, each at least once.
  const s = practiceSpec(['K', 'Q', 'Y'], 9, 42);
  assert.ok(s.letters.every((ch) => ['K', 'Q', 'Y'].includes(ch)));
  assert.ok(['K', 'Q', 'Y'].every((ch) => s.letters.includes(ch)));
  assert.equal(s.pace, 9);
});

test('listening: points against a letter -- one each time it sounds again, three for a wrong tap', () => {
  const p = new Play(canvas(), { ...levelSpec(3), letters: ['E', 'T'] }, {});
  p.paused = false;
  run(p, 1);
  const want = p.target;
  run(p, 2 * cycle(CODE[want], 5) + 0.1); // (two repeats)
  p.repeat(); // (and one asked for -- once the last has finished)
  run(p, 0.5);
  p.repeat();
  p.answer(p.tiles.find((t) => t.ch !== want));
  const pts = p.result(false).points;
  assert.ok(pts[want] >= 2 + 1 + WRONG, `${want}: ${pts[want]}`);
  assert.equal(Object.keys(pts).length, 1, 'only the letter being listened for');
});
