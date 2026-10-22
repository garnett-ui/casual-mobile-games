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

// Letters to work on: how much trouble each character has given you,
// listening. After every game the weights all fade (x DECAY) and the game's
// points come in on top: a point for each time a character's code sounded
// again before you found it, WRONG for each wrong letter tapped while it
// was the one to find. So the hardest letters drift as you get better.
export const DECAY = 0.9;
export const WRONG = 3;
export const PRACTICE = 7; // letters in a practice level

export function updateTrouble(weights, points) {
  const out = {};
  for (const [ch, w] of Object.entries(weights)) {
    const v = w * DECAY;
    if (v >= 0.05) out[ch] = Math.round(v * 1000) / 1000;
  }
  for (const [ch, p] of Object.entries(points)) if (p > 0) out[ch] = (out[ch] || 0) + p;
  return out;
}

// The hardest k, most trouble first: [[ch, weight], ...].
export function hardest(weights, k = PRACTICE) {
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k);
}

// A practice level: a cloud of just these letters (each at least once),
// at this pace.
export function practiceSpec(letters, pace, seed) {
  const r = rng(seed);
  const count = Math.max(12, letters.length * 2);
  const cloud = Array.from({ length: count }, (_, i) => (i < letters.length ? letters[i] : letters[Math.floor(r() * letters.length)]));
  return { n: 'practice', practice: true, alphabet: letters.slice(), fresh: [], letters: cloud, seed, drift: 36, pace };
}
