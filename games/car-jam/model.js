// Car Jam puzzle model: board rules, solver and level generator.
// Pure functions with no DOM access so the same code runs in the browser
// (gameplay + hints) and in Node (level generation + tests).
//
// Board: a w x h grid of parking tiles. Each car is 1 tile wide and `len`
// tiles long, and can only drive along its own axis (forwards or in reverse).
// A swiped car drives until it hits something; if nothing is in the way it
// leaves the lot onto the road -- unless that stretch of the lot edge is
// fenced, in which case it stops at the edge. The puzzle is solved when every
// car has left the lot.

export const EMPTY = -1;
export const STATIC = -2;
export const FENCE = -3;

export const DIR_VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// level: { w, h, cars: [[x, y, len, dir]], obs: [[x, y, kind]], fence: {N,E,S,W} }
export function buildModel(level) {
  const { w, h } = level;
  const cars = level.cars.map(([x, y, len, dir]) => ({
    x, y, len, dir, horiz: dir === 'E' || dir === 'W',
  }));
  const stat = new Uint8Array(w * h);
  for (const [x, y] of level.obs || []) stat[y * w + x] = 1;
  const f = level.fence || {};
  const fence = {
    N: new Set(f.N || []), E: new Set(f.E || []),
    S: new Set(f.S || []), W: new Set(f.W || []),
  };
  // pos[i] is the car's coordinate along its axis (x for horizontal cars,
  // y for vertical ones), or -1 once it has left the lot.
  const start = cars.map((c) => (c.horiz ? c.x : c.y));
  return { w, h, cars, stat, fence, start };
}

export function carTiles(m, i, p) {
  const c = m.cars[i];
  const out = [];
  for (let k = 0; k < c.len; k++) out.push(c.horiz ? [p + k, c.y] : [c.x, p + k]);
  return out;
}

export function occupancy(m, pos) {
  const occ = new Int16Array(m.w * m.h).fill(EMPTY);
  for (let k = 0; k < occ.length; k++) if (m.stat[k]) occ[k] = STATIC;
  for (let i = 0; i < pos.length; i++) {
    if (pos[i] < 0) continue;
    for (const [x, y] of carTiles(m, i, pos[i])) occ[y * m.w + x] = i;
  }
  return occ;
}

// Drive car i in direction sign (+1 = increasing x/y, -1 = decreasing).
// Returns { to, dist, exit, blocker, edge } where blocker is a car index,
// STATIC, FENCE or EMPTY (when exiting), and edge is the lot side reached.
export function slide(m, occ, pos, i, sign) {
  const c = m.cars[i];
  const p = pos[i];
  const size = c.horiz ? m.w : m.h;
  const at = (t) => (c.horiz ? occ[c.y * m.w + t] : occ[t * m.w + c.x]);
  let t = sign > 0 ? p + c.len : p - 1;
  while (t >= 0 && t < size && at(t) === EMPTY) t += sign;
  const edge = c.horiz ? (sign > 0 ? 'E' : 'W') : (sign > 0 ? 'S' : 'N');
  if (t < 0 || t >= size) {
    const fixed = c.horiz ? c.y : c.x;
    const to = sign > 0 ? size - c.len : 0;
    if (m.fence[edge].has(fixed)) {
      return { to, dist: Math.abs(to - p), exit: false, blocker: FENCE, edge };
    }
    // Distance travelled until the car is fully outside the lot.
    const dist = sign > 0 ? size - p : p + c.len;
    return { to: -1, dist, exit: true, blocker: EMPTY, edge };
  }
  const to = sign > 0 ? t - c.len : t + 1;
  return { to, dist: Math.abs(to - p), exit: false, blocker: at(t), edge };
}

function applyMove(m, occ, pos, i, to) {
  for (const [x, y] of carTiles(m, i, pos[i])) occ[y * m.w + x] = EMPTY;
  pos[i] = to;
  if (to >= 0) for (const [x, y] of carTiles(m, i, to)) occ[y * m.w + x] = i;
}

// Let every car that can currently leave the lot do so (repeatedly, since one
// leaving can free another). Leaving is never a bad move: it only frees space,
// and every car has to leave exactly once anyway. Mutates pos.
function drainExits(m, pos, moves) {
  const occ = occupancy(m, pos);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < pos.length; i++) {
      if (pos[i] < 0) continue;
      for (const sign of [1, -1]) {
        if (slide(m, occ, pos, i, sign).exit) {
          applyMove(m, occ, pos, i, -1);
          if (moves) moves.push({ car: i, sign });
          changed = true;
          break;
        }
      }
    }
  }
}

// Breadth-first search for the fewest moves. Because every solution contains
// exactly one exit move per car, we only search over the repositioning
// ("shuffle") moves and drain exits greedily after each one.
// Returns { moves, shuffles, total, states } or null if unsolvable / too big.
export function solve(m, pos0, maxStates = 200000) {
  const start = pos0.slice();
  const firstExits = [];
  drainExits(m, start, firstExits);
  const done = (p) => p.every((v) => v < 0);
  if (done(start)) {
    return { moves: firstExits, shuffles: 0, total: firstExits.length, states: 1 };
  }
  const startKey = start.join(',');
  const parent = new Map([[startKey, null]]);
  let frontier = [start];
  let states = 1;
  while (frontier.length) {
    const next = [];
    for (const pos of frontier) {
      const occ = occupancy(m, pos);
      const key = pos.join(',');
      for (let i = 0; i < pos.length; i++) {
        if (pos[i] < 0) continue;
        for (const sign of [1, -1]) {
          const r = slide(m, occ, pos, i, sign);
          if (r.dist === 0) continue;
          const np = pos.slice();
          np[i] = r.to;
          const exits = [];
          drainExits(m, np, exits);
          const nk = np.join(',');
          if (parent.has(nk)) continue;
          parent.set(nk, { prev: key, moves: [{ car: i, sign }, ...exits] });
          if (done(np)) {
            const moves = [];
            let k = nk;
            while (parent.get(k)) {
              const e = parent.get(k);
              moves.unshift(...e.moves);
              k = e.prev;
            }
            moves.unshift(...firstExits);
            const shuffles = moves.length - m.cars.length;
            return { moves, shuffles, total: moves.length, states };
          }
          if (++states > maxStates) return null;
          next.push(np);
        }
      }
    }
    frontier = next;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Level generation

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OBSTACLE_KINDS = ['cone', 'tree', 'barrier', 'cone', 'bollard'];

// Randomly fill a lot with cars. spec: { w, h, obstacles, truckRate, fenceRate }
export function randomLayout(r, spec) {
  const { w, h } = spec;
  const occ = new Uint8Array(w * h);
  const obs = [];
  for (let n = 0; n < (spec.obstacles || 0); n++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    if (occ[y * w + x]) continue;
    occ[y * w + x] = 1;
    obs.push([x, y, OBSTACLE_KINDS[Math.floor(r() * OBSTACLE_KINDS.length)]]);
  }
  const fence = { N: [], E: [], S: [], W: [] };
  if (spec.fenceRate) {
    for (const side of ['N', 'E', 'S', 'W']) {
      const n = side === 'N' || side === 'S' ? w : h;
      // Fences come in runs so they read as a hedge, not confetti.
      let k = 0;
      while (k < n) {
        if (r() < spec.fenceRate) {
          const run = 1 + Math.floor(r() * 3);
          for (let j = k; j < Math.min(n, k + run); j++) fence[side].push(j);
          k += run + 1;
        } else k++;
      }
    }
  }
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);
  for (let k = cells.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [cells[k], cells[j]] = [cells[j], cells[k]];
  }
  const cars = [];
  const fits = (x, y, len, horiz) => {
    for (let k = 0; k < len; k++) {
      const cx = horiz ? x + k : x;
      const cy = horiz ? y : y + k;
      if (cx >= w || cy >= h || occ[cy * w + cx]) return false;
    }
    return true;
  };
  const stat = occ.slice();
  const fenced = (side, k) => fence[side].includes(k);
  // Which lot edges could this car ever reach, ignoring other cars?
  const reach = (x, y, len, horiz) => {
    const size = horiz ? w : h;
    const p = horiz ? x : y;
    const at = (t) => stat[horiz ? y * w + t : t * w + x];
    let up = !fenced(horiz ? 'E' : 'S', horiz ? y : x);
    for (let t = p + len; up && t < size; t++) if (at(t)) up = false;
    let down = !fenced(horiz ? 'W' : 'N', horiz ? y : x);
    for (let t = p - 1; down && t >= 0; t--) if (at(t)) down = false;
    return { up, down };
  };
  // Cars sharing a line can't pass each other; reject placements that would
  // trap two of them heading for opposite edges.
  const lineOk = (x, y, len, horiz, me) => {
    const fixed = horiz ? y : x;
    const p = horiz ? x : y;
    for (const [cx, cy, clen, cdir] of cars) {
      const ch = cdir === 'E' || cdir === 'W';
      if (ch !== horiz || (ch ? cy : cx) !== fixed) continue;
      const cp = ch ? cx : cy;
      const them = reach(cx, cy, clen, ch);
      if (cp < p && them.up && !them.down && me.down && !me.up) return false;
      if (cp > p && them.down && !them.up && me.up && !me.down) return false;
    }
    return true;
  };
  for (const [x, y] of cells) {
    if (occ[y * w + x]) continue;
    if (spec.density !== undefined && r() > spec.density) continue;
    const len = r() < (spec.truckRate || 0) ? 3 : 2;
    // Cars along the lot edge mostly park parallel to it so they box the
    // others in, which is what makes a lot feel jammed.
    const edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y);
    const nearSide = Math.min(x, w - 1 - x) < Math.min(y, h - 1 - y);
    const bias = edgeDist === 0 ? spec.edgeBias || 0 : 0;
    const first = r() < bias ? !nearSide : r() < 0.5;
    let placed = false;
    for (const horiz of [first, !first]) {
      if (!fits(x, y, len, horiz)) continue;
      const me = reach(x, y, len, horiz);
      if ((!me.up && !me.down) || !lineOk(x, y, len, horiz, me)) continue;
      for (let k = 0; k < len; k++) occ[(horiz ? y : y + k) * w + (horiz ? x + k : x)] = 1;
      const dir = horiz ? (r() < 0.5 ? 'E' : 'W') : (r() < 0.5 ? 'N' : 'S');
      cars.push([x, y, len, dir]);
      placed = true;
      break;
    }
    if (!placed && len === 3) {
      // A truck didn't fit here; a car might.
      for (const horiz of [first, !first]) {
        if (!fits(x, y, 2, horiz)) continue;
        const me = reach(x, y, 2, horiz);
        if ((!me.up && !me.down) || !lineOk(x, y, 2, horiz, me)) continue;
        for (let k = 0; k < 2; k++) occ[(horiz ? y : y + k) * w + (horiz ? x + k : x)] = 1;
        cars.push([x, y, 2, horiz ? (r() < 0.5 ? 'E' : 'W') : (r() < 0.5 ? 'N' : 'S')]);
        break;
      }
    }
  }
  for (const side of ['N', 'E', 'S', 'W']) if (!fence[side].length) delete fence[side];
  const level = { w, h, cars, obs };
  if (Object.keys(fence).length) level.fence = fence;
  return level;
}

// Cheap check for layouts that can never be solved, so the solver doesn't
// waste its state budget proving it: every car needs an edge it can reach
// without crossing a fixed obstacle or fence, and two cars sharing a row (or
// column) can't pass each other to reach opposite edges.
export function obviouslyStuck(m) {
  const lines = new Map();
  for (let i = 0; i < m.cars.length; i++) {
    const c = m.cars[i];
    const p = m.start[i];
    const size = c.horiz ? m.w : m.h;
    const fixed = c.horiz ? c.y : c.x;
    const isStat = (t) => m.stat[c.horiz ? fixed * m.w + t : t * m.w + fixed];
    let up = !m.fence[c.horiz ? 'E' : 'S'].has(fixed);
    for (let t = p + c.len; up && t < size; t++) if (isStat(t)) up = false;
    let down = !m.fence[c.horiz ? 'W' : 'N'].has(fixed);
    for (let t = p - 1; down && t >= 0; t--) if (isStat(t)) down = false;
    if (!up && !down) return true;
    const key = (c.horiz ? 'r' : 'c') + fixed;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push({ p, up, down });
  }
  for (const cars of lines.values()) {
    cars.sort((a, b) => a.p - b.p);
    let onlyUpSeen = false;
    for (const c of cars) {
      if (c.down && !c.up && onlyUpSeen) return true;
      if (c.up && !c.down) onlyUpSeen = true;
    }
  }
  return false;
}

// Number of rounds needed if, each round, every car that can leave does.
// More rounds = longer chain of cars waiting on each other.
export function waves(m) {
  const pos = m.start.slice();
  let rounds = 0;
  for (;;) {
    const occ = occupancy(m, pos);
    const leaving = [];
    for (let i = 0; i < pos.length; i++) {
      if (pos[i] >= 0 && (slide(m, occ, pos, i, 1).exit || slide(m, occ, pos, i, -1).exit)) leaving.push(i);
    }
    if (!leaving.length) return rounds;
    for (const i of leaving) pos[i] = -1;
    rounds++;
  }
}

// How many cars can leave right away? Fewer = more interesting opening.
export function openCars(m) {
  const occ = occupancy(m, m.start);
  let n = 0;
  for (let i = 0; i < m.cars.length; i++) {
    if (slide(m, occ, m.start, i, 1).exit || slide(m, occ, m.start, i, -1).exit) n++;
  }
  return n;
}

// Generate the best of `tries` random layouts for a difficulty spec:
// { w, h, density, obstacles, truckRate, fenceRate, edgeBias, minCars,
//   hard: [lo, hi], wantShuffles }. Hardness = waves + 3 * forced repositioning moves.
export function generateLevel(seed, spec, tries = 200) {
  const r = rng(seed);
  let best = null;
  const [lo, hi] = spec.hard || [0, 99];
  for (let t = 0; t < tries; t++) {
    const level = randomLayout(r, spec);
    if (level.cars.length < (spec.minCars || 2)) continue;
    if (spec.maxCars && level.cars.length > spec.maxCars) continue;
    const m = buildModel(level);
    if (obviouslyStuck(m)) continue;
    const sol = solve(m, m.start, spec.maxStates || 20000);
    if (!sol) continue;
    const hard = waves(m) + 3 * sol.shuffles;
    const miss = hard < lo ? lo - hard : hard > hi ? hard - hi : 0;
    const open = openCars(m);
    // Hit the hardness band first, then prefer a tight opening and more cars.
    // Later levels also favour layouts that force a car to be repositioned.
    const shuffleBonus = spec.wantShuffles ? Math.min(sol.shuffles, 3) * 40 : 0;
    const score = miss * 100 + open * 4 - level.cars.length - shuffleBonus;
    if (!best || score < best.score) {
      best = { score, level: { ...level, par: sol.total } };
    }
  }
  return best && best.level;
}
