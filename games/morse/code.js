// Morse Rain: the code, the lessons and the timing. (No DOM: runs in Node
// for the tests.)
import { rng, seedFor } from '../../js/lib/random.js';

export const CODE = {
  E: '.', T: '-',
  I: '..', A: '.-', N: '-.', M: '--',
  S: '...', U: '..-', R: '.-.', W: '.--', D: '-..', K: '-.-', G: '--.', O: '---',
  H: '....', V: '...-', F: '..-.', L: '.-..', P: '.--.', J: '.---', B: '-...', X: '-..-', C: '-.-.', Y: '-.--', Z: '--..', Q: '--.-',
  1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', 0: '-----',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.',
};

// The characters are always sent at 20 words a minute ("PARIS": a dit is
// 1.2 / 20 s); the gaps between them are stretched to make the overall
// rate slower (Farnsworth timing) -- 5 words a minute to start.
export const CHAR_WPM = 20;
export const TONE = 600; // Hz
export const UNIT = 1.2 / CHAR_WPM; // seconds per dit

// How long a character takes to send (from the first tone to the end of
// the last).
export function duration(code, unit = UNIT) {
  let t = 0;
  for (const s of code) t += (s === '.' ? 1 : 3) * unit + unit;
  return t - unit;
}

// Seconds from one character to the next at an overall rate of wpm words a
// minute (a word being five characters).
export const interval = (wpm) => 12 / wpm;

// The lessons: E I A N T to start, then a couple more characters each
// level, by how long their codes are -- the rest of the short letters, the
// four-symbol ones, numbers, punctuation -- with a review now and then.
// After everything, the speed goes up to 20 words a minute.
const ADD = [
  ['E', 'I', 'A', 'N', 'T'], ['M', 'S'], ['O', 'U'], ['R', 'D'], ['K', 'W'], ['G'], [],
  ['H', 'V'], ['F', 'L'], ['P', 'J'], ['B', 'X'], ['C', 'Y'], ['Z', 'Q'], [],
  ['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '0'], ['.', ',', '?', '/'],
];
const RAMP = [8, 10, 12, 14, 16, 18, 20];

export function levelSpec(n) {
  const k = Math.min(n, ADD.length);
  const alphabet = ADD.slice(0, k).flat();
  const fresh = n <= ADD.length ? ADD[n - 1] : [];
  // The overall rate: 5 words a minute while learning the letters (a little
  // quicker for the longer ones, numbers and punctuation); then up to 20.
  const wpm = n <= ADD.length ? (n <= 7 ? 5 : n <= 14 ? 6 : 7) : RAMP[Math.min(RAMP.length - 1, n - ADD.length - 1)];
  // The cloud: the same letters every time for level n, the new ones half
  // the time.
  const count = Math.min(30, 10 + 2 * (n - 1));
  const r = rng(seedFor(n, 0x5eed));
  const letters = [];
  for (let i = 0; i < count; i++) {
    const pool = fresh.length && fresh.length < alphabet.length && r() < 0.5 ? fresh : alphabet;
    letters.push(pool[Math.floor(r() * pool.length)]);
  }
  return {
    n,
    alphabet,
    fresh,
    wpm,
    letters,
    seed: seedFor(n, 0xc10d),
    // How long you have to find it before a copy floats in: plenty while
    // learning, less as the speed goes up.
    wait: Math.max(2, 5 * interval(wpm)),
    drift: 14 + 2.5 * wpm, // how fast the tiles drift (points a second)
  };
}

// Stars, by how many of the letters you got first time (no wrong tap, not
// too slow).
export function starsFor(right, total) {
  const p = right / Math.max(1, total);
  return p >= 0.9 ? 3 : p >= 0.7 ? 2 : 1;
}
