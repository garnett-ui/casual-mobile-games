// Difficulty ramp for Car Jam. Used by tools/gen-levels.mjs to build the
// campaign and at runtime to generate endless bonus levels past the end.

export const LEVEL_COUNT = 60;

const TIERS = [
  { first: 1, spec: { w: 3, h: 3, maxCars: 3, hard: [2, 2] }, grannies: 0,
    tip: 'Swipe a car (or tap it) to drive it out of the lot!' },
  { first: 2, spec: { w: 3, h: 4, maxCars: 4, hard: [2, 2] }, grannies: 0,
    tip: 'Cars only drive forwards or backwards. Clear the way first!' },
  { first: 3, spec: { w: 4, h: 4, hard: [2, 3] }, grannies: 0 },
  { first: 4, spec: { w: 4, h: 5, hard: [3, 3], edgeBias: 0.5 }, grannies: 0 },
  { first: 5, spec: { w: 5, h: 5, hard: [3, 4], edgeBias: 0.6 }, grannies: 1,
    tip: 'Grannies cross the street here. Cars wait for them -- she has right of way!' },
  { first: 6, spec: { w: 5, h: 6, hard: [3, 4], edgeBias: 0.7 }, grannies: 1 },
  { first: 9, spec: { w: 6, h: 6, obstacles: 2, hard: [4, 5], edgeBias: 0.7 }, grannies: 1,
    tip: 'Cones, trees and barriers never move. Drive around them!' },
  { first: 13, spec: { w: 6, h: 7, obstacles: 2, truckRate: 0.15, hard: [4, 6], edgeBias: 0.7 }, grannies: 1,
    tip: 'Trucks are long and take up three spaces.' },
  { first: 17, spec: { w: 6, h: 8, obstacles: 2, truckRate: 0.15, fenceRate: 0.15, hard: [5, 7], edgeBias: 0.7 }, grannies: 2,
    tip: 'Hedges: cars cannot leave the lot through them.' },
  { first: 21, spec: { wantShuffles: true, w: 7, h: 8, obstacles: 3, truckRate: 0.2, fenceRate: 0.2, hard: [6, 9], edgeBias: 0.8 }, grannies: 2 },
  { first: 31, spec: { wantShuffles: true, w: 7, h: 9, obstacles: 3, truckRate: 0.2, fenceRate: 0.25, hard: [7, 10], edgeBias: 0.8 }, grannies: 2 },
  { first: 41, spec: { wantShuffles: true, w: 8, h: 9, obstacles: 4, truckRate: 0.2, fenceRate: 0.25, hard: [8, 12], edgeBias: 0.8 }, grannies: 3 },
  { first: 51, spec: { wantShuffles: true, w: 8, h: 10, obstacles: 5, truckRate: 0.25, fenceRate: 0.3, hard: [9, 14], edgeBias: 0.85 }, grannies: 3 },
];

export function tierFor(n) {
  let tier = TIERS[0];
  for (const t of TIERS) if (t.first <= n) tier = t;
  return tier;
}
