// 15: the levels. (No DOM: made in a worker, and in Node for the tests.)
//
// A level is a board size and a starting position -- the difficulty; what's
// on the tiles is the player's choice (see styles.js), the same for any
// level. Small boards (up to 3x3) start an exact number of moves from
// solved, from the table of every position; bigger ones a number of random
// moves back from solved, or a full shuffle. Either way, always solvable.
import { Solver, goalOf, scramble, shuffle } from './solver.js';
import { rng, seedFor } from '../../js/lib/random.js';

export const BASE_SEED = 0x15f1f7;

// [columns, rows, how scrambled]: for boards up to 3x3 the exact distance,
// bigger ones moves back from solved -- or 'shuffle'.
const LEVELS = [
  [3, 2, 5],
  [3, 2, 9],
  [3, 3, 8],
  [3, 3, 12],
  [3, 3, 16],
  [3, 3, 20],
  [3, 3, 24],
  [3, 4, 25],
  [3, 4, 35],
  [3, 4, 50],
  [4, 4, 30],
  [4, 4, 45],
  [4, 4, 60],
  [4, 4, 80],
  [4, 4, 100],
  [4, 4, 'shuffle'],
];

// After those, 4x4s fully shuffled.
export function levelPlan(n) {
  return n <= LEVELS.length ? LEVELS[n - 1] : [4, 4, 'shuffle'];
}

export function makeLevel(n) {
  const [w, h, how] = levelPlan(n);
  const seed = seedFor(n, BASE_SEED);
  const r = rng(seed);
  const goal = goalOf(w, h);
  let board;
  if (how === 'shuffle') board = shuffle(goal, w, r);
  else if (w * h <= 9) board = atDistance(new Solver(w, h), how, r);
  else {
    // (Never solved already.)
    do board = scramble(goal, w, h, how, r);
    while (board.join() === goal.join());
  }
  return { n, w, h, seed, board };
}

// A position exactly d moves from solved, picked at random.
function atDistance(solver, d, r) {
  const table = solver.table();
  const ranks = [];
  for (let k = 0; k < table.length; k++) if (table[k] === d) ranks.push(k);
  return solver.unrank(ranks[Math.floor(r() * ranks.length)]);
}

// Stars, by wrong-way moves (each costing two): three for at most one in
// five of the moves needed, two for at most as many as needed; a hint
// takes the third away.
export function starsFor(best, wrong, hinted = false) {
  const stars = wrong * 5 <= best ? 3 : wrong <= best ? 2 : 1;
  return hinted ? Math.min(2, stars) : stars;
}

// What a game's walk says: the distance after each move, from the start.
export function review(ds) {
  const best = ds[0];
  let wrong = 0;
  let climb = 0;
  let climbAt = 0;
  let run = 0;
  for (let i = 1; i < ds.length; i++) {
    if (ds[i] > ds[i - 1]) {
      wrong++;
      run++;
      if (run > climb) [climb, climbAt] = [run, i - run + 1];
    } else run = 0;
  }
  let finish = 0;
  for (let i = ds.length - 1; i > 0 && ds[i] < ds[i - 1]; i--) finish++;
  const top = Math.max(...ds);
  return { best, moves: ds.length - 1, wrong, climb, climbAt, finish, top };
}
