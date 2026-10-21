// Fifteen: the sliding puzzle's rules and an exact solver. (No DOM: runs in
// Node for the tests, and in a worker in the game.)
//
// A board is an array of tiles by cell, reading order, 0 for the gap. A move
// is the cell the gap moves to (the tile there slides into the gap), one
// tile at a time -- a slide of a whole row counts each tile.
//
// distance(board) is the fewest moves to the goal, exactly:
// - small boards (up to 9 cells: 2x3, 2x4, 3x3) from a table of every
//   position, made once by a sweep out from the goal;
// - bigger ones (3x4, 4x4) by IDA*, guided by additive pattern databases:
//   the tiles split into groups of up to five, each group's table giving
//   the fewest moves of its own tiles to get them home, wherever the
//   others are. Their sum never overestimates, so the search is exact.
//   On a square board (with the gap's home on the diagonal), the board
//   mirrored across the diagonal is just as far from the goal: the larger
//   of the two sums is a better guide.
//
// Every move changes the distance by exactly one (it flips the parity of
// the arrangement), which is what track() uses to follow a game cheaply.

// The goal: tiles 1, 2, 3... in reading order, the gap last.
export function goalOf(w, h) {
  const n = w * h;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 0 : i + 1));
}

// The cells the gap can move to from cell b.
export function neighbours(w, h) {
  return Array.from({ length: w * h }, (_, b) => {
    const x = b % w;
    const y = (b / w) | 0;
    const out = [];
    if (y > 0) out.push(b - w);
    if (x > 0) out.push(b - 1);
    if (x < w - 1) out.push(b + 1);
    if (y < h - 1) out.push(b + w);
    return out;
  });
}

// Can this board reach the goal? Half of all arrangements can't: a move
// swaps the gap with a neighbour -- flipping the parity of the arrangement
// -- and moves the gap one step, so the two parities must agree.
export function isSolvable(board, goal, w) {
  const at = new Map(goal.map((t, c) => [t, c]));
  const perm = board.map((t) => at.get(t)); // where each cell's tile belongs
  let swaps = 0;
  const seen = new Array(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      len++;
    }
    swaps += len - 1;
  }
  const b = board.indexOf(0);
  const g = goal.indexOf(0);
  const gap = Math.abs((b % w) - (g % w)) + Math.abs(((b / w) | 0) - ((g / w) | 0));
  return swaps % 2 === gap % 2;
}

// Apply a move (the cell the gap moves to): a new board.
export function apply(board, cell) {
  const next = board.slice();
  const b = next.indexOf(0);
  next[b] = next[cell];
  next[cell] = 0;
  return next;
}

// A scramble: `moves` random moves back from the goal, never straight back
// (so always solvable).
export function scramble(goal, w, h, moves, r) {
  const nb = neighbours(w, h);
  const board = goal.slice();
  let b = board.indexOf(0);
  let last = -1;
  for (let k = 0; k < moves; k++) {
    const options = nb[b].filter((c) => c !== last);
    const c = options[Math.floor(r() * options.length)];
    board[b] = board[c];
    board[c] = 0;
    last = b;
    b = c;
  }
  return board;
}

// A random arrangement that can be solved: any shuffle, with two tiles
// swapped if it can't.
export function shuffle(goal, w, r) {
  const board = goal.slice();
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  if (!isSolvable(board, goal, w)) {
    const [a, b] = board.map((t, c) => (t ? c : -1)).filter((c) => c >= 0);
    [board[a], board[b]] = [board[b], board[a]];
  }
  return board;
}

// ------------------------------------------------------------- the solver

const TABLE_MAX = 9; // cells: a table of every position up to here
const GROUP_MAX = 5; // tiles in a pattern database group

const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

export class Solver {
  constructor(w, h, goal = goalOf(w, h)) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.goal = goal.slice();
    this.home = []; // the goal cell of each tile
    goal.forEach((t, c) => (this.home[t] = c));
    this.nb = neighbours(w, h);
    this.nodes = 0; // (positions searched, for the benchmarks)
  }

  // The fewest moves from board to the goal.
  distance(board) {
    if (this.n <= TABLE_MAX) return this.table()[this.rank(board)];
    return this.solve(board).length;
  }

  // The fewest moves, as moves (cells the gap moves to).
  solve(board) {
    if (this.n <= TABLE_MAX) return this.solveByTable(board);
    return this.search(board, Infinity);
  }

  // A best next move, or null if solved.
  hint(board) {
    return this.solve(board)[0] ?? null;
  }

  // Follow a game as it's played: track(start) gives the distance now and
  // a best line from here, kept up move by move without solving afresh.
  // Each move changes the distance by exactly one:
  // - along the line: one less, and the rest of the line is still best;
  // - otherwise, if the estimate's already more than one less: one more,
  //   and the best line is straight back, then the old line;
  // - otherwise one search, no deeper than one less, tells which -- and
  //   finding one, that's the new line; not, straight back again.
  track(start) {
    let board = start.slice();
    let line = this.solve(board);
    const t = {
      d: line.length,
      line,
      board,
      move: (m) => {
        const back = board.indexOf(0);
        board = apply(board, m);
        if (line[0] === m) line = line.slice(1);
        else if (this.n > TABLE_MAX && (t.d === 0 || this.estimate(board) > t.d - 1)) line = [back, ...line];
        else line = (this.n <= TABLE_MAX ? (this.table()[this.rank(board)] < t.d ? this.solveByTable(board) : null) : this.search(board, t.d - 1)) ?? [back, ...line];
        t.d = line.length;
        t.line = line;
        t.board = board;
        return t.d;
      },
    };
    return t;
  }

  // The distance after each move of a game, from the start (so one more
  // than the moves).
  walk(start, moves) {
    const t = this.track(start);
    return [t.d, ...moves.map((m) => t.move(m))];
  }

  // ---------------------------------------------------- small boards: a table

  // A board's index among all arrangements (its Lehmer code).
  rank(board) {
    let r = 0;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      let smaller = 0;
      for (let j = i + 1; j < n; j++) if (board[j] < board[i]) smaller++;
      r = r * (n - i) + smaller;
    }
    return r;
  }

  unrank(r) {
    const n = this.n;
    const digits = [];
    for (let i = 1; i <= n; i++) {
      digits.unshift(r % i);
      r = Math.floor(r / i);
    }
    const pool = Array.from({ length: n }, (_, i) => i);
    return digits.map((k) => pool.splice(k, 1)[0]);
  }

  // Every position's distance (255 for those that can't be reached), by a
  // sweep out from the goal. Shared by every solver for the same board.
  table() {
    const key = `${this.w}x${this.h}:${this.goal}`;
    if (TABLES.has(key)) return TABLES.get(key);
    const dist = new Uint8Array(factorial(this.n)).fill(255);
    let frontier = [this.goal.slice()];
    dist[this.rank(this.goal)] = 0;
    for (let d = 1; frontier.length; d++) {
      const next = [];
      for (const board of frontier) {
        const b = board.indexOf(0);
        for (const c of this.nb[b]) {
          const s = board.slice();
          s[b] = s[c];
          s[c] = 0;
          const k = this.rank(s);
          if (dist[k] !== 255) continue;
          dist[k] = d;
          next.push(s);
        }
      }
      frontier = next;
    }
    TABLES.set(key, dist);
    return dist;
  }

  solveByTable(board) {
    const dist = this.table();
    let s = board.slice();
    let d = dist[this.rank(s)];
    if (d === 255) throw new Error('unsolvable');
    const path = [];
    while (d > 0) {
      const b = s.indexOf(0);
      for (const c of this.nb[b]) {
        const t = s.slice();
        t[b] = t[c];
        t[c] = 0;
        if (dist[this.rank(t)] === d - 1) {
          path.push(c);
          s = t;
          d--;
          break;
        }
      }
    }
    return path;
  }

  // ------------------------------------------- bigger boards: IDA* with PDBs

  // The tile groups: in goal order, as even as they'll go, up to GROUP_MAX.
  groups() {
    if (this._groups) return this._groups;
    const tiles = this.goal.filter((t) => t);
    const k = Math.ceil(tiles.length / GROUP_MAX);
    const size = Math.ceil(tiles.length / k);
    this._groups = [];
    for (let i = 0; i < tiles.length; i += size) this._groups.push(tiles.slice(i, i + size));
    return this._groups;
  }

  // Each group's database: indexed by its tiles' cells (in base n), the
  // fewest moves of those tiles to bring them all home. Made by a sweep out
  // from the goal over (the group's cells, the gap's cell), where moving
  // one of the group costs a move and moving any other tile is free.
  databases() {
    const key = this.databasesKey();
    if (PDBS.has(key)) return PDBS.get(key);
    const dbs = this.groups().map((g) => this.database(g));
    PDBS.set(key, dbs);
    return dbs;
  }

  databasesKey() {
    return `${this.w}x${this.h}:${this.goal}:${this.groups().join('|')}`;
  }

  // Databases made earlier (by databases(), elsewhere) -- as one array, the
  // groups' tables end to end -- instead of making them here.
  useDatabases(all) {
    const size = (g) => this.n ** g.length;
    let at = 0;
    const dbs = this.groups().map((g) => {
      const db = all.subarray(at, at + size(g));
      at += size(g);
      return db;
    });
    if (at !== all.length) throw new Error('databases: wrong size');
    PDBS.set(this.databasesKey(), dbs);
  }

  database(group) {
    const n = this.n;
    const k = group.length;
    const size = n ** k; // without the gap
    const full = size * n; // with it (the gap's cell the last digit)
    const seen = new Uint8Array(full).fill(255);
    const db = new Uint8Array(size).fill(255);
    const pow = Array.from({ length: k + 1 }, (_, i) => n ** i);
    // The goal state.
    let start = 0;
    group.forEach((t, i) => (start += this.home[t] * pow[i]));
    start += this.home[0] * pow[k];
    // Breadth first by cost; free moves explored within a cost.
    let level = new Int32Array(1024);
    let levelLen = 0;
    const push = (q, len, v) => {
      if (len >= q.length) {
        const bigger = new Int32Array(q.length * 2);
        bigger.set(q);
        q = bigger;
      }
      q[len] = v;
      return q;
    };
    level = push(level, levelLen++, start);
    seen[start] = 0;
    // Scratch: which of the group is in each cell (-1 none), cleared after.
    const occupant = new Int8Array(n).fill(-1);
    const cellOf = new Int32Array(k);
    for (let cost = 0; levelLen; cost++) {
      let next = new Int32Array(1024);
      let nextLen = 0;
      // (A stack within the cost for the free moves.)
      for (let qi = 0; qi < levelLen; qi++) {
        const s = level[qi];
        if (seen[s] !== cost) continue;
        const pat = s % size;
        if (db[pat] > cost) db[pat] = cost;
        let rest = s;
        for (let i = 0; i < k; i++) {
          const c = rest % n;
          cellOf[i] = c;
          occupant[c] = i;
          rest = (rest - c) / n;
        }
        const b = rest;
        for (const c of this.nb[b]) {
          const i = occupant[c];
          let t;
          let tc;
          if (i < 0) {
            // A tile not in the group: free.
            t = pat + c * pow[k];
            tc = cost;
          } else {
            // One of the group's tiles slides into the gap.
            t = pat + (b - c) * pow[i] + c * pow[k];
            tc = cost + 1;
          }
          if (seen[t] <= tc) continue;
          seen[t] = tc;
          if (tc === cost) {
            level = push(level, levelLen++, t);
          } else {
            next = push(next, nextLen++, t);
          }
        }
        for (let i = 0; i < k; i++) occupant[cellOf[i]] = -1;
      }
      level = next;
      levelLen = nextLen;
    }
    return db;
  }

  // The mirror across the diagonal, if it maps the goal to itself: each
  // cell's mirror, and each tile's (the tile that belongs at the mirror of
  // its home). Or null.
  mirror() {
    if (this._mirror !== undefined) return this._mirror;
    const { w, h, n, goal, home } = this;
    this._mirror = null;
    if (w !== h) return null;
    const cell = Array.from({ length: n }, (_, c) => (c % w) * w + ((c / w) | 0));
    if (cell[home[0]] !== home[0]) return null;
    const tile = [];
    for (let t = 0; t < n; t++) tile[t] = goal[cell[home[t]]];
    this._mirror = { cell, tile };
    return this._mirror;
  }

  // A lower bound on the distance (the databases' sum, the larger of the
  // board's and its mirror's; or for small boards the exact distance).
  estimate(board) {
    if (this.n <= TABLE_MAX) return this.table()[this.rank(board)];
    const dbs = this.databases();
    const sum = (b) => {
      const pos = [];
      b.forEach((t, c) => (pos[t] = c));
      let h = 0;
      this.groups().forEach((g, gi) => {
        let idx = 0;
        g.forEach((t, i) => (idx += pos[t] * this.n ** i));
        h += dbs[gi][idx];
      });
      return h;
    };
    const m = this.mirror();
    if (!m) return sum(board);
    const flipped = [];
    board.forEach((t, c) => (flipped[m.cell[c]] = m.tile[t]));
    return Math.max(sum(board), sum(flipped));
  }

  // IDA*: depth-first searches, each a little deeper, never past the bound
  // given (Infinity for none). The best line, or null if none within it.
  search(board, limit) {
    const n = this.n;
    const groups = this.groups();
    const dbs = this.databases();
    const nb = this.nb;
    // Which group (and place in it) each tile is; each group's index.
    const groupOf = new Int8Array(n).fill(-1);
    const weight = new Float64Array(n);
    groups.forEach((g, gi) => g.forEach((t, i) => ((groupOf[t] = gi), (weight[t] = n ** i))));
    const s = Int8Array.from(board);
    const idx = new Float64Array(groups.length);
    s.forEach((t, c) => t && (idx[groupOf[t]] += c * weight[t]));
    let hA = 0;
    for (let gi = 0; gi < groups.length; gi++) hA += dbs[gi][idx[gi]];
    // The mirror's too (or, without one, the same again).
    const m = this.mirror();
    const mc = m ? Int8Array.from(m.cell) : null;
    const mt = m ? Int8Array.from(m.tile) : null;
    const idxM = new Float64Array(groups.length);
    if (m) s.forEach((t, c) => t && (idxM[groupOf[mt[t]]] += mc[c] * weight[mt[t]]));
    let hM = 0;
    if (m) for (let gi = 0; gi < groups.length; gi++) hM += dbs[gi][idxM[gi]];
    if (Math.max(hA, hM) === 0) return [];
    let b = s.indexOf(0);
    const path = [];
    let nodes = 0;
    const FOUND = -1;
    const dfs = (g, bound, hA, hM, last) => {
      nodes++;
      const hNow = hA > hM ? hA : hM;
      const f = g + hNow;
      if (f > bound) return f;
      if (hNow === 0) return FOUND;
      let min = Infinity;
      for (const c of nb[b]) {
        if (c === last) continue;
        // The tile at c slides into the gap at b...
        const t = s[c];
        const gi = groupOf[t];
        const dA = (b - c) * weight[t];
        const hA2 = hA - dbs[gi][idx[gi]] + dbs[gi][(idx[gi] += dA)];
        // ...and in the mirror, its mirror tile from c's mirror to b's.
        let hM2 = hM;
        let gm = 0;
        let dM = 0;
        if (m) {
          const u = mt[t];
          gm = groupOf[u];
          dM = (mc[b] - mc[c]) * weight[u];
          hM2 = hM - dbs[gm][idxM[gm]] + dbs[gm][(idxM[gm] += dM)];
        }
        s[b] = t;
        s[c] = 0;
        const from = b;
        b = c;
        path.push(c);
        const r = dfs(g + 1, bound, hA2, hM2, from);
        if (r === FOUND) return FOUND;
        path.pop();
        b = from;
        s[c] = t;
        s[b] = 0;
        idx[gi] -= dA;
        if (m) idxM[gm] -= dM;
        if (r < min) min = r;
      }
      return min;
    };
    let bound = Math.max(hA, hM);
    while (bound <= limit) {
      const r = dfs(0, bound, hA, hM, -1);
      if (r === FOUND) {
        this.nodes += nodes;
        return path.slice();
      }
      if (r === Infinity) break;
      bound = r;
    }
    this.nodes += nodes;
    return null;
  }
}

const TABLES = new Map();
const PDBS = new Map();
