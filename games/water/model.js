// Water Lab: the rules and the level generator. No DOM, so the tests can run
// it in Node.
//
// A closed system: beakers of whole-number capacities, some water in them,
// no tap and no drain. A pour from beaker i into beaker j moves
// t = min(v[i], cap[j] - v[j]) -- until the source is empty or the target is
// full. States are tuples of volumes summing to the same total; every level
// is checked by breadth-first search over that state graph, which also gives
// its par (the shortest solution) and the hints.
import { rng, seedFor } from '../../js/lib/random.js';

export const BASE_SEED = 20261016;
export const SHAPES = ['cylinder', 'beaker', 'flask', 'round', 'bottle', 'cone'];

const key = (s) => s.join(',');

// Pour i into j. Returns { state, amount } or null if nothing would move.
export function pour(caps, state, i, j) {
  if (i === j) return null;
  const t = Math.min(state[i], caps[j] - state[j]);
  if (t <= 0) return null;
  const s = state.slice();
  s[i] -= t;
  s[j] += t;
  return { state: s, amount: t };
}

// goal: { kind: 'any', amount } -- any beaker holding exactly that much, or
//       { kind: 'split', marks: [[beaker, amount], ...] } -- those beakers
//       holding exactly those amounts.
export function goalMet(goal, state) {
  if (goal.kind === 'any') return state.some((v) => v === goal.amount);
  return goal.marks.every(([i, v]) => state[i] === v);
}

// Every state reachable from start, with its distance (in pours).
export function explore(caps, start, limit = 60000) {
  const dist = new Map([[key(start), 0]]);
  const queue = [start];
  for (let q = 0; q < queue.length && queue.length < limit; q++) {
    const s = queue[q];
    const d = dist.get(key(s));
    for (let i = 0; i < caps.length; i++) {
      for (let j = 0; j < caps.length; j++) {
        const r = pour(caps, s, i, j);
        if (!r) continue;
        const k = key(r.state);
        if (dist.has(k)) continue;
        dist.set(k, d + 1);
        queue.push(r.state);
      }
    }
  }
  return { dist, states: queue };
}

// Shortest list of pours [[i, j], ...] from state to the goal, or null.
export function solve(caps, start, goal, limit = 60000) {
  if (goalMet(goal, start)) return [];
  const prev = new Map([[key(start), null]]);
  const queue = [start];
  for (let q = 0; q < queue.length && queue.length < limit; q++) {
    const s = queue[q];
    for (let i = 0; i < caps.length; i++) {
      for (let j = 0; j < caps.length; j++) {
        const r = pour(caps, s, i, j);
        if (!r) continue;
        const k = key(r.state);
        if (prev.has(k)) continue;
        prev.set(k, [key(s), i, j]);
        if (goalMet(goal, r.state)) {
          const moves = [];
          for (let c = k; prev.get(c); c = prev.get(c)[0]) moves.unshift(prev.get(c).slice(1));
          return moves;
        }
        queue.push(r.state);
      }
    }
  }
  return null;
}

// How many pours a level should take at its best: a gentle start, then
// longer and longer.
export function targetSteps(n) {
  if (n <= 2) return [n, n];
  const lo = Math.min(14, 2 + Math.floor(n * 0.4));
  return [lo, lo + 2 + Math.min(4, Math.floor(n / 15))];
}

// Level n: beakers (capacities and shapes), where the water starts, the goal
// and par. Deterministic for n.
export function makeLevel(n) {
  const r = rng(seedFor(n, BASE_SEED));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const [lo0, hi0] = targetSteps(n);
  const split = n >= 7 && n % 3 === 1; // every third level from 7: an exact split
  let best = null;
  for (let attempt = 0; attempt < 250; attempt++) {
    const reservoir = n >= 12 && attempt % 2 === 0;
    const k = n <= 2 ? 2 : n < 12 || reservoir ? 3 : n < 30 ? (r() < 0.55 ? 3 : 4) : r() < 0.5 ? 4 : 5;
    // More beakers means more ways round, so shorter best solutions -- the
    // difficulty is in the choices instead. Ask for fewer pours.
    const lo = Math.max(3, lo0 - 3 * (k - 3));
    const hi = Math.max(lo + 1, hi0 - 2 * (k - 3));
    const maxCap = Math.min(k >= 5 ? 14 : 20, 5 + Math.floor(n * 0.4) + (attempt % 4));
    const caps = new Set();
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    if (reservoir) {
      // A big reservoir and two smaller beakers that share no factor: the
      // long, winding puzzles come from these.
      let a;
      let b;
      do {
        a = 3 + Math.floor(r() * (maxCap - 6));
        b = 3 + Math.floor(r() * (maxCap - 6));
      } while (a === b || gcd(a, b) !== 1);
      caps.add(Math.max(a, b) + Math.min(a, b) + Math.floor(r() * 4));
      caps.add(a);
      caps.add(b);
    }
    while (caps.size < k) caps.add(2 + Math.floor(r() * (maxCap - 1)));
    const capList = [...caps].sort(() => r() - 0.5);
    // Where the water starts: the classic way (the biggest full, the rest
    // empty) to begin with; later, poured out unevenly.
    const biggest = capList.indexOf(Math.max(...capList));
    const start = capList.map(() => 0);
    if (n < 10 || r() < 0.4) {
      start[biggest] = capList[biggest];
    } else {
      const total = Math.floor(capList[biggest] * (0.8 + r() * 0.8));
      let left = Math.min(total, capList.reduce((a, b) => a + b, 0) - 1);
      for (let tries = 0; left > 0 && tries < 50; tries++) {
        const i = Math.floor(r() * k);
        const add = Math.min(left, capList[i] - start[i], 1 + Math.floor(r() * capList[i]));
        start[i] += add;
        left -= add;
      }
    }
    const { dist, states } = explore(capList, start, 20000);
    let goal = null;
    let par = 0;
    if (!split) {
      // Any beaker holding G: the nearest state that has it.
      const nearest = new Map();
      for (const s of states) {
        const d = dist.get(key(s));
        for (const v of new Set(s)) if (v > 0 && !nearest.has(v)) nearest.set(v, d);
      }
      const options = [...nearest].filter(([v, d]) => d >= lo && d <= hi && !start.includes(v));
      if (options.length) {
        const [amount, d] = pick(options);
        goal = { kind: 'any', amount };
        par = d;
      }
    } else {
      // Exact amounts in two (or, with three beakers, all three) beakers.
      const far = states.filter((s) => {
        const d = dist.get(key(s));
        return d >= lo && d <= hi;
      });
      for (let t = 0; t < 30 && far.length && !goal; t++) {
        const s = pick(far);
        const idx = k === 3 ? [0, 1, 2] : [...Array(k).keys()].sort(() => r() - 0.5).slice(0, 2);
        const marks = idx.map((i) => [i, s[i]]);
        const g = { kind: 'split', marks };
        // Marks must pin it down to a state about as far away as s.
        const d = Math.min(...states.filter((x) => goalMet(g, x)).map((x) => dist.get(key(x))));
        if (d >= lo && d <= hi && !goalMet(g, start)) {
          goal = g;
          par = d;
        }
      }
    }
    if (!goal) continue;
    const shapes = capList.map(() => pick(SHAPES));
    const level = { n, caps: capList, start, goal, par, shapes };
    if (!best || Math.abs(par - lo0) < Math.abs(best.par - lo0)) best = level;
    if (par >= lo && par <= hi) return level;
  }
  return best || { n, caps: [5, 3], start: [5, 0], goal: { kind: 'any', amount: 2 }, par: 1, shapes: ['beaker', 'flask'] };
}

// Stars: par or better earns 3.
export function starsFor(moves, par) {
  if (moves <= par) return 3;
  if (moves <= par + Math.max(2, Math.ceil(par * 0.3))) return 2;
  return 1;
}

// "Measure exactly 4" / "Make 4 · 4 · 0" (with dashes for unmarked beakers).
export function goalText(level) {
  const g = level.goal;
  if (g.kind === 'any') return `Measure exactly ${g.amount}`;
  const parts = level.caps.map((_, i) => {
    const m = g.marks.find(([j]) => j === i);
    return m ? (m[1] ? String(m[1]) : 'empty') : '–';
  });
  return `Make ${parts.join(' · ')}`;
}
