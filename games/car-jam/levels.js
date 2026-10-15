// Car Jam levels: generated on the device from a seed, endlessly.
//
// Level n is built from seedFor(n), so every player gets the same level n,
// and difficulty is a smooth function of n with no upper bound. Every lot is
// hedged in with only a few gates, so cars must be shuffled out of each
// other's way to reach them. The lot grows until it's as big as fits a phone,
// then fewer gates, more obstacles, trucks, grannies and more required
// shuffles keep raising the bar, with the generator searching harder for
// tougher layouts as n grows.
import { generateLevel } from './model.js';

export const BASE_SEED = 20261015;
// Bump when generation changes, so levels cached on devices are rebuilt.
export const GEN_VERSION = 2;

// Mix the base seed and level number into a well-spread 32-bit seed.
export function seedFor(n, base = BASE_SEED) {
  let h = (base ^ Math.imul(n, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// The first few lots teach the rules; all are hedged in with a few gates.
const TUTORIAL = [
  { w: 3, h: 3, gates: 0.67, maxCars: 3, hard: [2, 2] },
  { w: 3, h: 4, gates: 0.5, maxCars: 4, hard: [2, 3] },
  { w: 4, h: 4, gates: 0.5, hard: [2, 4], minShuffles: 1 },
  { w: 4, h: 5, gates: 0.4, density: 0.8, hard: [3, 5], edgeBias: 0.5, minShuffles: 1 },
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
    // Hedges all round with only a few gates: the share of each side that
    // is open shrinks from about half to under a third.
    gates: Math.max(0.3, 0.45 - 0.006 * n),
    // Cars that must be moved aside before everyone can get out: at least
    // one from the start, rising steadily.
    minShuffles: Math.min(12, 1 + Math.floor((n - 4) / 10)),
    tries: Math.min(400, 150 + n * 2),
    // Search effort grows with n, bounded by a fixed amount of solver work
    // so a level still builds in a moment on a phone.
    climb: Math.min(2000, 100 + n * 12),
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
  1: 'Cars can only leave through the gaps in the hedge. Swipe a car (or tap it) to drive it out!',
  2: 'Cars only drive forwards or backwards. Line them up with a gap to get out.',
  3: 'Blocked? Move another car aside first to clear the way to a gap.',
  5: 'Grannies cross the street here. Cars wait for them -- she has right of way!',
  9: 'Cones, trees and barriers never move. Drive around them!',
  13: 'Trucks are long and take up three spaces.',
};

export function makeLevel(n, base = BASE_SEED) {
  const spec = specFor(n);
  const level = generateLevel(seedFor(n, base), spec, spec.tries);
  return { ...level, n, grannies: granniesFor(n), tip: TIPS[n] };
}
