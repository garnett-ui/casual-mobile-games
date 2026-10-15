// Tap Maze levels: generated on the device from a seed, endlessly. Level n is
// the same maze for everyone; boards grow until they fill a phone screen,
// then lines get longer and twistier and the chain of arrows blocking other
// arrows gets deeper, with the generator searching harder as n grows.
import { generateLevel } from './model.js';
import { seedFor } from '../../js/lib/random.js';

export const BASE_SEED = 20261016;

const TUTORIAL = [
  { w: 3, h: 4, minLen: 2, maxLen: 3, straight: 0.8, waves: [2, 2] },
  { w: 4, h: 4, minLen: 2, maxLen: 3, straight: 0.7, waves: [2, 3] },
  { w: 4, h: 5, minLen: 2, maxLen: 4, straight: 0.7, waves: [3, 4] },
];

// Largest board that still leaves comfortable tap targets on a phone.
const MAX_W = 10;
const MAX_H = 14;

export function specFor(n) {
  if (n <= TUTORIAL.length) return { ...TUTORIAL[n - 1], tries: 30 };
  // One more column every 5 levels, keeping a phone-shaped board.
  const w = Math.min(MAX_W, 4 + Math.floor((n - 2) / 5));
  const h = Math.min(MAX_H, Math.round(w * 1.4));
  // How deep the blocking chain should be keeps climbing forever; once a
  // board can't go deeper the generator picks the deepest it can find.
  const lo = 2 + Math.floor(n / 4);
  return {
    w, h,
    minLen: Math.min(4, 2 + Math.floor(n / 25)),
    maxLen: Math.min(9, 3 + Math.floor(n / 6)),
    straight: Math.max(0.35, 0.7 - n * 0.005),
    waves: [lo, lo + 3],
    tries: Math.min(80, 20 + n),
    climb: Math.min(3000, n * 30),
  };
}

const TIPS = {
  1: 'Tap an arrow to send it flying off the board. Its path ahead must be clear!',
  2: 'Tap a blocked arrow and it bounces back, costing a heart. You have three.',
  4: 'Long lines slither out along their own path. Only what is ahead of the head matters.',
};

export function makeLevel(n, base = BASE_SEED) {
  const level = generateLevel(seedFor(n, base), specFor(n));
  return { ...level, n, tip: TIPS[n] };
}
