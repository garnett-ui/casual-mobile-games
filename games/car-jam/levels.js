// Car Jam levels: generated on the device from a seed, endlessly.
//
// Level n is built from seedFor(n), so every player gets the same level n,
// and difficulty is a smooth function of n with no upper bound: the lot grows
// until it's as big as fits a phone, then hedges, obstacles, trucks, grannies
// and the required depth of the puzzle keep rising, with the generator
// searching harder for tougher layouts as n grows.
import { generateLevel } from './model.js';

export const BASE_SEED = 20261015;
// Bump when generation changes, so levels cached on devices are rebuilt.
export const GEN_VERSION = 1;

// Mix the base seed and level number into a well-spread 32-bit seed.
export function seedFor(n, base = BASE_SEED) {
  let h = (base ^ Math.imul(n, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const TUTORIAL = [
  { w: 3, h: 3, maxCars: 3, hard: [2, 2] },
  { w: 3, h: 4, maxCars: 4, hard: [2, 2] },
  { w: 4, h: 4, hard: [2, 3] },
  { w: 4, h: 5, hard: [3, 3], edgeBias: 0.5 },
];

// Largest lot that still leaves cars big enough to swipe on a phone.
const MAX_W = 9;
const MAX_H = 11;

export function specFor(n) {
  if (n <= TUTORIAL.length) return { ...TUTORIAL[n - 1], tries: 200 };
  // Lot area grows ~1.2 tiles per level until it hits the size cap.
  const area = Math.min(MAX_W * MAX_H, 25 + 1.2 * (n - 4));
  const w = Math.max(5, Math.min(MAX_W, Math.round(Math.sqrt(area * 0.85))));
  const h = Math.max(w, Math.min(MAX_H, Math.ceil(area / w)));
  // Hardness = rounds of cars waiting on each other + 3 per forced
  // repositioning move. The target keeps climbing forever; once it outgrows
  // what a lot can hold, the generator simply picks the hardest it can find.
  const lo = 2 + Math.floor(n / 7);
  return {
    w, h,
    hard: [lo, lo + 3],
    edgeBias: Math.min(0.9, 0.5 + n * 0.01),
    obstacles: n < 9 ? 0 : Math.min(8, 1 + Math.floor((n - 9) / 8)),
    truckRate: n < 13 ? 0 : Math.min(0.3, 0.12 + (n - 13) * 0.004),
    fenceRate: n < 17 ? 0 : Math.min(0.45, 0.12 + (n - 17) * 0.005),
    wantShuffles: n >= 21 ? Math.min(6, 1 + Math.floor(n / 30)) : 0,
    tries: Math.min(400, 150 + n * 2),
    // Search effort grows with n, bounded by a fixed amount of solver work
    // so a level still builds in a moment on a phone.
    climb: n < 21 ? 0 : Math.min(2000, (n - 20) * 12),
    budget: Math.min(150000, 20000 + n * 1500),
    maxStates: 8000,
  };
}

export function granniesFor(n) {
  if (n < 5) return 0;
  if (n < 17) return 1;
  if (n < 41) return 2;
  if (n < 70) return 3;
  return 4;
}

const TIPS = {
  1: 'Swipe a car (or tap it) to drive it out of the lot!',
  2: 'Cars only drive forwards or backwards. Clear the way first!',
  5: 'Grannies cross the street here. Cars wait for them -- she has right of way!',
  9: 'Cones, trees and barriers never move. Drive around them!',
  13: 'Trucks are long and take up three spaces.',
  17: 'Hedges: cars cannot leave the lot through them.',
  21: 'From here on, some cars must be moved aside before others can leave.',
};

export function makeLevel(n, base = BASE_SEED) {
  const spec = specFor(n);
  const level = generateLevel(seedFor(n, base), spec, spec.tries);
  return { ...level, n, grannies: granniesFor(n), tip: TIPS[n] };
}
