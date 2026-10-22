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
// 1.2 / 20 s) -- learnt at full speed, as sounds, with all the time you
// need between them (each one repeats until you find it).
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

// Listening, how fast the characters come round (each repeating till you
// find it), as an effective speed: every character at 20 words a minute,
// the pause after it longer or shorter. 5 words a minute through the
// lessons; then each review a word a minute quicker, up to 15 (any faster
// and there's no time to find the tile).
export const SLOWEST = 5;
export const FASTEST = 15;
export function paceFor(n) {
  return n <= ADD.length ? SLOWEST : Math.min(FASTEST, SLOWEST + (n - ADD.length));
}

// Seconds from the start of a character to the start of its repeat, at w
// words a minute (five characters a word) -- never less than a character's
// own length and a letter's space after it.
export function cycle(code, w) {
  return Math.max(duration(code) + 3 * UNIT, 60 / (5 * w));
}

// The lessons: E I A N T to start, then a couple more characters each
// level, by how long their codes are -- the rest of the short letters, the
// four-symbol ones, numbers, punctuation -- with a review now and then.
// After everything, reviews of the lot, the clouds bigger and livelier.
const ADD = [
  ['E', 'I', 'A', 'N', 'T'], ['M', 'S'], ['O', 'U'], ['R', 'D'], ['K', 'W'], ['G'], [],
  ['H', 'V'], ['F', 'L'], ['P', 'J'], ['B', 'X'], ['C', 'Y'], ['Z', 'Q'], [],
  ['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '0'], ['.', ',', '?', '/'],
];

export function levelSpec(n) {
  const k = Math.min(n, ADD.length);
  const alphabet = ADD.slice(0, k).flat();
  const fresh = n <= ADD.length ? ADD[n - 1] : [];
  // The cloud: the same letters every time for level n, the new ones half
  // the time.
  const count = Math.min(36, 10 + 2 * (n - 1));
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
    letters,
    seed: seedFor(n, 0xc10d),
    pace: paceFor(n), // (listening, words a minute)
    drift: Math.min(70, 26 + 1.5 * (n - 1)), // how fast the tiles drift (points a second)
  };
}

// Stars, by how many of the letters you found without a wrong tap -- and,
// a little, how many you had to hear more than once (again) first.
export function starsFor(right, total, again = 0) {
  const p = (right - 0.25 * again) / Math.max(1, total);
  return p >= 0.9 ? 3 : p >= 0.7 ? 2 : 1;
}
