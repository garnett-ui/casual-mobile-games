// Tap Maze puzzle model: rules, solvability analysis and maze generation.
// Pure functions (no DOM) shared by the game and the Node tests.
//
// The board is a w x h grid packed with arrows. Each arrow is a line through
// adjacent cells (lines never cross) with an arrowhead at one end. Tapping an
// arrow sends it slithering forwards along its own line and off the board in
// the direction the head points -- but only if no other arrow lies anywhere
// between its head and the edge of the board. Clear every arrow to win.
//
// level: { w, h, arrows: [[[x, y], ...]] }  each path runs tail -> head.
import { rng } from '../../js/lib/random.js';

export function headDir(path) {
  const [ax, ay] = path[path.length - 2];
  const [bx, by] = path[path.length - 1];
  return [bx - ax, by - ay];
}

export function buildBoard(level) {
  const { w, h } = level;
  const occ = new Int16Array(w * h).fill(-1);
  const arrows = level.arrows.map((cells, i) => {
    for (const [x, y] of cells) occ[y * w + x] = i;
    return { cells, dir: headDir(cells) };
  });
  return { w, h, arrows, occ };
}

// Cells from just past the head to the board edge.
export function rayCells(board, i) {
  const { cells, dir } = board.arrows[i];
  const [hx, hy] = cells[cells.length - 1];
  const out = [];
  for (let x = hx + dir[0], y = hy + dir[1]; x >= 0 && y >= 0 && x < board.w && y < board.h; x += dir[0], y += dir[1]) {
    out.push([x, y]);
  }
  return out;
}

// First arrow (still on the board) in the way of arrow i, or -1 if it's free.
// Also returns how many clear cells lie before it.
export function blocker(board, alive, i) {
  const ray = rayCells(board, i);
  for (let k = 0; k < ray.length; k++) {
    const [x, y] = ray[k];
    const j = board.occ[y * board.w + x];
    if (j >= 0 && j !== i && alive[j]) return { by: j, clear: k };
  }
  return { by: -1, clear: ray.length };
}

// Peel the board: each round, every free arrow leaves. Solvable when all go.
// waves = number of rounds (how deep the chain of arrows blocking arrows is).
export function analyze(board, alive = board.arrows.map(() => true)) {
  alive = alive.slice();
  let left = alive.filter(Boolean).length;
  let waves = 0;
  const firstFree = [];
  for (;;) {
    const free = [];
    for (let i = 0; i < alive.length; i++) {
      if (alive[i] && blocker(board, alive, i).by < 0) free.push(i);
    }
    if (waves === 0) firstFree.push(...free);
    if (!free.length) break;
    for (const i of free) alive[i] = false;
    left -= free.length;
    waves++;
  }
  return { solvable: left === 0, waves, free: firstFree, stuck: alive };
}

// An arrow whose head points back into its own line can never leave.
function selfBlocked(w, h, path) {
  const [dx, dy] = headDir(path);
  const [hx, hy] = path[path.length - 1];
  const own = new Set(path.map(([x, y]) => y * w + x));
  for (let x = hx + dx, y = hy + dy; x >= 0 && y >= 0 && x < w && y < h; x += dx, y += dy) {
    if (own.has(y * w + x)) return true;
  }
  return false;
}

const TURNS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Pack the board with random non-crossing lines.
// spec: { w, h, minLen, maxLen, straight (0..1 chance to keep going straight) }
function randomPaths(r, spec, used = new Uint8Array(spec.w * spec.h)) {
  const { w, h } = spec;
  const order = [];
  for (let k = 0; k < w * h; k++) order.push(k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  const paths = [];
  for (const start of order) {
    if (used[start]) continue;
    const len = spec.minLen + Math.floor(r() * (spec.maxLen - spec.minLen + 1));
    const path = [[start % w, Math.floor(start / w)]];
    used[start] = 1;
    let dir = TURNS[Math.floor(r() * 4)];
    while (path.length < len) {
      const [x, y] = path[path.length - 1];
      const left = [dir[1], -dir[0]];
      const right = [-dir[1], dir[0]];
      const turn = r() < 0.5 ? [left, right] : [right, left];
      const tries = r() < spec.straight ? [dir, ...turn] : [...turn, dir];
      let moved = false;
      for (const d of tries) {
        const nx = x + d[0];
        const ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || used[ny * w + nx]) continue;
        used[ny * w + nx] = 1;
        path.push([nx, ny]);
        dir = d;
        moved = true;
        break;
      }
      if (!moved) break;
    }
    if (path.length >= 2) paths.push(path);
  }
  return paths;
}

// Choose which end of each line gets the arrowhead, flipping arrows caught in
// a deadlock until the whole board can be cleared (dropping a line if that
// fails). `kept` arrows are already oriented. Returns arrows (tail -> head).
function orient(r, w, h, paths, kept = []) {
  let arrows = kept.slice();
  for (const p of paths) {
    const options = [p, p.slice().reverse()].filter((q) => !selfBlocked(w, h, q));
    if (options.length) arrows.push(options[Math.floor(r() * options.length)]);
  }
  for (let round = 0; round < 400; round++) {
    const board = buildBoard({ w, h, arrows });
    const res = analyze(board);
    if (res.solvable) return arrows;
    const stuck = [];
    res.stuck.forEach((s, i) => s && stuck.push(i));
    const i = stuck[Math.floor(r() * stuck.length)];
    const flipped = arrows[i].slice().reverse();
    if (round < 300 && !selfBlocked(w, h, flipped)) arrows[i] = flipped;
    else arrows = arrows.filter((_, k) => k !== i);
  }
  return null;
}

function score(level, spec) {
  const res = analyze(buildBoard(level));
  if (!res.solvable) return null;
  const [lo, hi] = spec.waves;
  const miss = res.waves < lo ? lo - res.waves : res.waves > hi ? res.waves - hi : 0;
  // Hit the depth band, then prefer few free arrows and a well-filled board.
  const filled = level.arrows.reduce((a, p) => a + p.length, 0) / (level.w * level.h);
  return { score: miss * 100 + res.free.length * 6 - filled * 20, waves: res.waves };
}

// Mutations for hill-climbing: turn one arrow round...
function flipOne(r, level) {
  const { w, h } = level;
  const arrows = level.arrows.slice();
  const i = Math.floor(r() * arrows.length);
  const flipped = arrows[i].slice().reverse();
  if (selfBlocked(w, h, flipped)) return null;
  arrows[i] = flipped;
  return { w, h, arrows };
}

// ...or lift out a few lines and grow new ones in the gap.
function regrow(r, spec, level) {
  const { w, h } = level;
  const kept = level.arrows.slice();
  const drop = 1 + Math.floor(r() * 3);
  for (let k = 0; k < drop && kept.length > 2; k++) kept.splice(Math.floor(r() * kept.length), 1);
  const used = new Uint8Array(w * h);
  for (const p of kept) for (const [x, y] of p) used[y * w + x] = 1;
  const arrows = orient(r, w, h, randomPaths(r, spec, used), kept);
  return arrows && { w, h, arrows };
}

// Best of `spec.tries` random mazes, then hill-climb with the mutations.
export function generateLevel(seed, spec) {
  const r = rng(seed);
  const { w, h } = spec;
  let best = null;
  for (let t = 0; t < (spec.tries || 40); t++) {
    const arrows = orient(r, w, h, randomPaths(r, spec));
    if (!arrows || arrows.length < 2) continue;
    const level = { w, h, arrows };
    const s = score(level, spec);
    if (s && (!best || s.score < best.score)) best = { ...s, level };
  }
  for (let k = 0; best && k < (spec.climb || 0); k++) {
    const level = r() < 0.5 ? flipOne(r, best.level) : regrow(r, spec, best.level);
    if (!level) continue;
    const s = score(level, spec);
    if (s && s.score <= best.score) best = { ...s, level };
  }
  return best && best.level;
}
