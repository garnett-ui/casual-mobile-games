// Times the Fifteen solver: building the 4x4 pattern databases, then exact
// solves of random and scrambled boards, and following a game.
//   node tools/bench-fifteen.mjs [count]
import { Solver, goalOf, shuffle, scramble, apply, neighbours } from '../games/fifteen/solver.js';
import { rng } from '../js/lib/random.js';

const count = Number(process.argv[2] || 20);
const ms = (f) => {
  const t = performance.now();
  const v = f();
  return [performance.now() - t, v];
};
const stats = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `median ${q(0.5).toFixed(0)} ms, 90% ${q(0.9).toFixed(0)} ms, max ${s.at(-1).toFixed(0)} ms`;
};

for (const [w, h] of [[3, 3], [4, 3], [4, 4]]) {
  const s = new Solver(w, h);
  const [build] = ms(() => (w * h <= 9 ? s.table() : s.databases()));
  console.log(`${w}x${h}: tables built in ${build.toFixed(0)} ms`);
  const r = rng(7);
  for (const [label, make] of [
    ['random', () => shuffle(s.goal, w, r)],
    ['scrambled 40', () => scramble(s.goal, w, h, 40, r)],
    ['scrambled 80', () => scramble(s.goal, w, h, 80, r)],
  ]) {
    const times = [];
    const lens = [];
    for (let k = 0; k < count; k++) {
      const board = make();
      const [t, d] = ms(() => s.distance(board));
      times.push(t);
      lens.push(d);
    }
    console.log(`  ${label.padEnd(13)} moves ${Math.min(...lens)}-${Math.max(...lens)} (avg ${(lens.reduce((a, b) => a + b) / lens.length).toFixed(1)}): ${stats(times)}`);
  }
  // Following a game: a player who's right three times in four.
  const start = shuffle(s.goal, w, r);
  const moves = [];
  let b = start;
  const nb = neighbours(w, h);
  while (b.join() !== s.goal.join() && moves.length < 400) {
    const m = r() < 0.75 ? s.hint(b) : nb[b.indexOf(0)][Math.floor(r() * nb[b.indexOf(0)].length)];
    moves.push(m);
    b = apply(b, m);
  }
  const [t] = ms(() => s.walk(start, moves));
  console.log(`  a game of ${moves.length} moves followed in ${t.toFixed(0)} ms (${(t / moves.length).toFixed(1)} ms a move)`);
}
