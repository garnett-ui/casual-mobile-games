// Marble Garden: the path, the chain of marbles rolling along it, the shot
// and the rules. No DOM, so the tests can play it in Node, and so a computer
// gnome can prove every level before a player sees it.
//
// A winding path runs from a gate in the hedge, round the gnome in the
// middle of the garden, to the drain at its end. A chain of coloured
// marbles rolls in through the gate, pushed from behind; the gnome flicks
// marbles into it, and three or more of a colour touching pop. Popping opens
// a gap: the marbles behind it race forward to close it, and if the colours
// that meet make three, they pop too. Any marble reaching the drain is the
// end of the level; popping the last one wins it.
//
// Lengths are in marble radii (a marble is 1 across, 2 wide); the board is
// 36 wide by 54 tall, with the gnome in the middle, and y runs down. Time
// runs in ticks of a sixtieth of a second, so the same shots at the same
// ticks always play out the same, in Node, in a worker and on the screen.
//
// Every kind of marble (a plain one, and the power-ups the bucket pays) is a
// package in KINDS: the engine lands the shot, and the kind says what
// happens where it lands, in a small vocabulary of effects the engine
// applies (marbles to pop, a nudge to the chain, a change of pace). Adding
// a kind is adding to that table, nothing else. Likewise every path shape
// is an entry in SHAPES.
import { rng, seedFor } from '../../js/lib/random.js';

export const W = 36; // the board
export const H = 54;
export const R = 1; // a marble's radius
export const GNOME = { x: W / 2, y: H / 2 }; // where the shot starts
export const TICK = 1 / 60; // seconds
export const SHOT_SPEED = 54; // a flicked marble, in radii a second
export const RUSH = 4; // the chain comes in this many times its pace at the start...
export const RUSH_TO = 0.4; // ...until its front is this far along the way
export const CATCH = 14; // a segment racing forward to close a gap
export const PULL = 7; // a segment drawn back toward a matching colour
export const REACT = 21; // ticks the computer gnome waits after a shot lands before the next
export const LEISURE = 60; // ...and, proving there's time, the ticks it waits playing at a careful player's pace
const SETTLE = 12; // ticks after a landing by which its pops and meetings have played out
export const MATCH = 3; // this many of a colour touching pop
export const CLEAR = 6; // the path keeps this far from the gnome
export const APART = 4.6; // two stretches of path keep this far apart (two marbles, and air)
export const MARGIN = 1.6; // the path keeps this far from the board's edge
export const REF_LENGTH = 170; // a level's speed is for a way this long; a shorter way rolls slower, so the time is the same
export const BASE_SEED = 20261028;

// ------------------------------------------------------------------ the path
//
// A shape is { params(r), curve(p) }: its seeded parameters (which way
// round, where it starts), and from them the curve `(t) => [x, y]` for t
// from 0 to 1, from where the chain comes in to the drain. Every one here
// is a ring round an ellipse of half-widths A and B -- so many turns, the
// ellipse scaled as it goes and bent into a square, a peanut, a diamond --
// and the last stretch of a one-turn ring hooks inward so the drain sits
// inside it, clear of it. Adding a shape is adding here.
const A = 16;
const B = 23;
const TAU = Math.PI * 2;
const ring = (p, t, turns, scale = 1, shape = (x, y) => [x, y]) => {
  const a = p.start + p.dir * t * turns * TAU;
  const [x, y] = shape(Math.cos(a), Math.sin(a));
  return [GNOME.x + A * scale * x, GNOME.y + B * scale * y];
};
// The hook: full size until near the end (`from`), then in to `to` of it.
const hook = (t, from = 0.9, to = 0.55) => (t < from ? 1 : 1 - (1 - to) * smooth((t - from) / (1 - from)));
const smooth = (u) => u * u * (3 - 2 * u);
const superellipse = (n) => (x, y) => [Math.sign(x) * Math.abs(x) ** (2 / n), Math.sign(y) * Math.abs(y) ** (2 / n)];

export const SHAPES = {
  // One turn round the garden and in to the drain.
  loop: { params: (r) => ({ start: -TAU / 8 - (r() * TAU) / 6, dir: r() < 0.5 ? 1 : -1 }), curve: (p) => (t) => ring(p, t, 1, hook(t)) },
  // Nearly two turns, winding in all the way.
  spiral: { params: (r) => ({ start: -TAU / 8 - (r() * TAU) / 6, dir: r() < 0.5 ? 1 : -1 }), curve: (p) => (t) => ring(p, t, 1.75, 1 - 0.53 * t) },
  // A flower: one turn, in and out through five or six petals.
  wave: { params: (r) => ({ start: -TAU / 8 - (r() * TAU) / 6, dir: r() < 0.5 ? 1 : -1, petals: 5 + Math.floor(r() * 2) }), curve: (p) => (t) => ring(p, t, 1, hook(t) * 0.92 * (1 + 0.08 * Math.sin(p.petals * t * TAU))) },
  // A rounded square: straights and corners.
  square: { params: (r) => ({ start: -TAU / 8 - (r() * TAU) / 6, dir: r() < 0.5 ? 1 : -1 }), curve: (p) => (t) => ring(p, t, 1, hook(t) * 0.92, superellipse(4)) },
  // A peanut: tall, and pinched at the sides.
  peanut: { params: (r) => ({ start: -TAU / 8 - (r() * TAU) / 6, dir: r() < 0.5 ? 1 : -1 }), curve: (p) => (t) => ring(p, t, 1, hook(t), (x, y) => [x * (0.6 + 0.6 * Math.abs(y)), y * 0.84 * (1 + 0.19 * Math.abs(y))]) },
  // A diamond: points top, bottom and at the sides, rounded off.
  diamond: { params: (r) => ({ start: -TAU / 8 - (r() * TAU) / 6, dir: r() < 0.5 ? 1 : -1 }), curve: (p) => (t) => ring(p, t, 1, hook(t, 0.86, 0.5), superellipse(1.4)) },
};
export const SHAPE_ORDER = ['loop', 'spiral', 'wave', 'square', 'peanut', 'diamond'];

// The path as the game uses it: the curve sampled finely and measured, so
// a marble at distance s along it has a place and a heading. The chain
// comes in from off the board: the curve is run back along its first
// heading until it leaves the board and a little beyond, and s is measured
// from there, with `gate` the s at the board's edge and `length` the s of
// the drain. `at(s)` gives { x, y, angle } for any s (held at the ends).
const CELL = 4 * R; // a square of the board, for `near`: three across cover a marble's reach
const CELLS_ACROSS = 64; // (room either side of the board, where the way in comes from)
const cellKey = (x, y) => (Math.floor(y / CELL) + 8) * CELLS_ACROSS + Math.floor(x / CELL) + 8;
export function buildPath(shape, params, samples = 360) {
  const f = SHAPES[shape].curve(params);
  const pts = [];
  for (let i = 0; i <= samples; i++) pts.push(f(i / samples));
  // The lead-in: a straight run in through the hedge to the start, from
  // out past the edge, leaning away from the gnome (straight back along
  // the curve would lie beside the curve's own end, where it comes round
  // again).
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[1];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const out = Math.hypot(x0 - GNOME.x, y0 - GNOME.y) || 1;
  let bx = (x0 - x1) / len + (2 * (x0 - GNOME.x)) / out;
  let by = (y0 - y1) / len + (2 * (y0 - GNOME.y)) / out;
  const blen = Math.hypot(bx, by);
  bx /= blen;
  by /= blen;
  let back = 0;
  while (back < 40) {
    const x = x0 + bx * back;
    const y = y0 + by * back;
    if (x < -2 * R || x > W + 2 * R || y < -2 * R || y > H + 2 * R) break;
    back += 1;
  }
  const lead = back + 4 * R;
  for (let d = 1; d <= lead; d++) pts.unshift([x0 + bx * d, y0 + by * d]);
  // Round the corner where the way in meets the curve: the stretch three
  // radii either side of it is redrawn as one bend through the corner.
  const corner = lead;
  const upto = pts.findIndex((pt, i) => i > corner && Math.hypot(pt[0] - x0, pt[1] - y0) >= 3 * R);
  const [ax, ay] = pts[corner - 3];
  const [cx, cy] = pts[upto];
  const bend = [];
  for (let k = 1; k < 8; k++) {
    const u = k / 8;
    bend.push([(1 - u) * (1 - u) * ax + 2 * (1 - u) * u * x0 + u * u * cx, (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * y0 + u * u * cy]);
  }
  pts.splice(corner - 2, upto - (corner - 2), ...bend);
  // Measure it.
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = s[s.length - 1];
  const onBoard = ([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H;
  const gate = s[Math.max(0, pts.findIndex(onBoard))];
  // Which stretches of the way pass near each patch of the board, so a
  // shot need only be tested against the marbles on those stretches:
  // the board in squares of CELL, each with the [from, to] in s of every
  // run of samples through it.
  const cells = [];
  for (let i = 0; i < pts.length; i++) {
    const key = cellKey(pts[i][0], pts[i][1]);
    const runs = (cells[key] ??= []);
    const last = runs[runs.length - 1];
    if (last && i > 0 && cellKey(pts[i - 1][0], pts[i - 1][1]) === key) last[1] = s[i];
    else runs.push([s[i], s[i]]);
  }
  // The stretches of the way within a marble's width or so of (x, y).
  const near = (x, y) => {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const runs = cells[cellKey((cx + dx) * CELL, (cy + dy) * CELL)];
      if (runs) for (const run of runs) out.push(run);
    }
    return out;
  };
  const at = (d) => {
    d = Math.max(0, Math.min(length, d));
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = s[hi] - s[lo] || 1;
    const u = (d - s[lo]) / seg;
    const x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u;
    const y = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u;
    return { x, y, angle: Math.atan2(pts[hi][1] - pts[lo][1], pts[hi][0] - pts[lo][0]) };
  };
  return { shape, params, points: pts, s, length, gate, at, near };
}

// Whether a path is fit to play: on the board, clear of the gnome, and
// never doubling back on itself so close that two stretches of chain
// would overlap. Returns the first fault, or null.
export function faultOf(path) {
  const { points: pts, s, gate } = path;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    // (The way in crosses the edge, of course: the check starts past it.)
    if (s[i] >= gate + 6 * R && (x < MARGIN || x > W - MARGIN || y < MARGIN || y > H - MARGIN)) return `off the board at s=${s[i].toFixed(1)}`;
    if (Math.hypot(x - GNOME.x, y - GNOME.y) < CLEAR) return `too close to the gnome at s=${s[i].toFixed(1)}`;
    for (let j = i + 1; j < pts.length; j++) {
      // (Near along the way is near by nature; it's a far stretch coming
      // close that's the fault.)
      if (s[j] - s[i] < 3 * APART) continue;
      if (Math.hypot(pts[j][0] - x, pts[j][1] - y) < APART) return `doubles back on itself at s=${s[i].toFixed(1)} and s=${s[j].toFixed(1)}`;
    }
  }
  return null;
}

// ------------------------------------------------------------------ kinds
//
// A kind is { land(G, i) }: what happens when a marble of it has just been
// set into the chain at index i. It returns effects for the engine to
// apply: { pop: [indices], push: radii to move the chain on (negative is
// back), pace: { factor, ticks } }. A kind the table doesn't know lands as
// a plain marble, loudly (the view paints it so too).
const sameColour = (a, b) => a.colour !== undefined && a.colour === b.colour;

export const KINDS = {
  // A plain marble: three or more of its colour touching, and they pop.
  marble: {
    land(G, i) {
      const group = run(G, i, (m) => sameColour(m, G.chain[i]));
      return group.length >= MATCH ? { pop: group } : {};
    },
  },
};
export const kindOf = (marble) => KINDS[marble.kind] ?? KINDS.marble;

// ------------------------------------------------------------------ the chain
//
// G.chain is the marbles from the front (nearest the drain, index 0) to the
// back, each { kind, colour, s }. Two are touching when their centres are a
// marble's width apart; a gap between i and i+1 is a bigger space than that.
const EPS = 1e-6;
export const touching = (G, i) => i + 1 < G.chain.length && G.chain[i].s - G.chain[i + 1].s <= 2 * R + EPS;

// The marbles joined to i through `same`, touching all the way: a run.
function run(G, i, same) {
  const out = [i];
  for (let j = i; j > 0 && touching(G, j - 1) && same(G.chain[j - 1]); j--) out.unshift(j - 1);
  for (let j = i; touching(G, j) && same(G.chain[j + 1]); j++) out.push(j + 1);
  return out;
}

// The chain cut at its gaps: [from, to] index ranges, front first.
export function segments(G) {
  const out = [];
  let from = 0;
  for (let i = 0; i < G.chain.length; i++) {
    if (!touching(G, i)) {
      out.push([from, i]);
      from = i + 1;
    }
  }
  return out;
}

// The colours still in the chain, in play or on their way.
export function coloursIn(G) {
  const set = new Set();
  for (const m of G.chain) if (m.colour !== undefined) set.add(m.colour);
  return [...set].sort((a, b) => a - b);
}

// ------------------------------------------------------------------ a game

// What level n asks of you: a longer chain, more colours, a faster roll
// (for a way of REF_LENGTH; see makeCourse), and from level 6 a tunnel the
// chain rolls through out of reach, two from level 16. Levels stop growing
// at 40.
export function specFor(n) {
  const k = Math.min(n, 40) - 1;
  const marbles = Math.round(24 + 1.1 * k);
  return {
    marbles,
    colours: Math.min(5, 3 + Math.floor((n - 1) / 8)),
    speed: 1.5 + 0.011 * k, // radii a second
    tunnels: n >= 6 ? (n >= 16 ? 2 : 1) : 0,
    par: Math.ceil(marbles / 4), // the fewest shots the computer gnome should need (see makeLevel)...
    most: Math.ceil(marbles / 1.8), // ...and the most
  };
}

// The level n, attempt a, before it is proved: its path (a loop for the
// first two levels, then any shape), its chain of colours -- leaning on
// the marble before, so there are pairs to go for, never three in a row --
// and its tunnels. Rolled from the seed, so the same on every device.
export function makeCourse(n, attempt = 0) {
  const r = rng(seedFor(n * 16 + attempt, BASE_SEED));
  const spec = specFor(n);
  const shape = n < 3 ? 'loop' : SHAPE_ORDER[Math.floor(r() * SHAPE_ORDER.length)];
  const params = SHAPES[shape].params(r);
  const colours = [];
  for (let i = 0; i < spec.marbles; i++) {
    const prev = colours[i - 1];
    const pair = i >= 1 && colours[i - 2] !== prev && r() < 0.42;
    let c = pair ? prev : Math.floor(r() * spec.colours);
    if (!pair && c === prev && colours[i - 2] === prev) c = (c + 1) % spec.colours;
    colours.push(c);
  }
  const path = buildPath(shape, params);
  // Tunnels: a stretch of nine radii each, in the middle of the way, apart.
  const tunnels = [];
  for (let k = 0; k < spec.tunnels; k++) {
    const lo = path.gate + path.length * (0.25 + 0.45 * (k / Math.max(1, spec.tunnels)));
    const s0 = lo + r() * path.length * 0.18;
    tunnels.push([s0, s0 + 9 * R]);
  }
  // The pace is set so the chain takes the same time to get round a short
  // way as a long one: the level's speed is for a way of REF_LENGTH.
  const speed = Math.round((spec.speed * path.length) / REF_LENGTH * 1000) / 1000;
  return { n, attempt, shape, params, colours: colours.join(''), palette: spec.colours, speed, tunnels, queue: seedFor(n * 16 + attempt, BASE_SEED + 1) };
}

// A fresh game of a level: the chain lined up behind the gate, the first
// marble loaded and the next shown. The i-th marble handed to the gnome is
// a colour still in the chain, from the level's own seed, so the same shots
// always get the same marbles.
export function newGame(level) {
  const path = buildPath(level.shape, level.params);
  const chain = [...level.colours].map((ch, i) => ({ kind: 'marble', colour: Number(ch), s: -2 * R * i }));
  const G = { level, path, chain, tick: 0, shots: 0, popped: 0, drawn: 0, loaded: null, next: null, shot: null, pace: null, rushed: false, over: null, queue: level.queue, speed: level.speed, tunnels: level.tunnels ?? [] };
  G.loaded = draw(G);
  G.next = draw(G);
  return G;
}

function draw(G) {
  const colours = coloursIn(G);
  const r = rng(seedFor(G.drawn++, G.queue));
  if (!colours.length) return { kind: 'marble', colour: 0 };
  return { kind: 'marble', colour: colours[Math.floor(r() * colours.length)] };
}

export function cloneGame(G) {
  return { ...G, chain: G.chain.map((m) => ({ ...m })), loaded: { ...G.loaded }, next: { ...G.next }, shot: G.shot ? { ...G.shot } : null, pace: G.pace ? { ...G.pace } : null };
}

// Swap the loaded marble with the next.
export function swap(G) {
  [G.loaded, G.next] = [G.next, G.loaded];
}

// Whether a marble at s is in reach of a shot: on the board and not in a
// tunnel.
export function inTunnel(G, s) {
  for (let i = 0; i < G.tunnels.length; i++) if (s >= G.tunnels[i][0] && s <= G.tunnels[i][1]) return true;
  return false;
}
export const hittable = (G, m) => m.s >= G.path.gate && m.s <= G.path.length && !inTunnel(G, m.s);

// The marble in reach a shot at (x, y) strikes -- the nearest whose centre
// is within a marble's width -- or -1. Only the stretches of the way near
// (x, y) are looked at, and only the marbles on them (the chain is in
// order of s, front first).
export function struck(G, x, y) {
  let hit = -1;
  let hitD = 2 * R;
  const chain = G.chain;
  for (const [a, b] of G.path.near(x, y)) {
    const lo = a - 2.5 * R;
    const hi = b + 2.5 * R;
    // The first marble at or behind hi.
    let l = 0;
    let h = chain.length;
    while (l < h) {
      const mid = (l + h) >> 1;
      if (chain[mid].s > hi) l = mid + 1;
      else h = mid;
    }
    for (let i = l; i < chain.length && chain[i].s >= lo; i++) {
      const m = chain[i];
      if (!hittable(G, m)) continue;
      const p = G.path.at(m.s);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < hitD) { hitD = d; hit = i; }
    }
  }
  return hit;
}

// Flick the loaded marble at `angle` (radians, 0 straight up, positive
// clockwise). One in the air at a time: a flick while one flies is
// refused (false). The marble lands on a later tick.
export function fire(G, angle) {
  if (G.over || G.shot) return false;
  G.shot = { marble: G.loaded, x: GNOME.x, y: GNOME.y, dx: Math.sin(angle) * SHOT_SPEED, dy: -Math.cos(angle) * SHOT_SPEED, angle };
  G.shots++;
  G.loaded = G.next;
  G.next = draw(G);
  return true;
}

// The chain from `from` to the front shoved on so nothing overlaps.
// Returns the gaps the shove closed (the index ahead of each), nearest
// first.
function compact(G, from) {
  const closed = [];
  let behindWas = G.chain[from + 1]?.s; // where the marble behind was before its shove
  for (let j = from; j >= 0; j--) {
    const need = G.chain[j + 1] ? G.chain[j + 1].s + 2 * R : -Infinity;
    if (G.chain[j].s >= need - EPS) break; // (nothing ahead is touched)
    if (G.chain[j].s > behindWas + 2 * R + EPS) closed.push(j); // (was a gap, now closed)
    behindWas = G.chain[j].s;
    G.chain[j].s = need;
  }
  return closed;
}

// Take these marbles out of the chain (indices, any order), as an event.
function pop(G, indices, ev) {
  const set = new Set(indices);
  const gone = [];
  for (let i = 0; i < G.chain.length; i++) if (set.has(i)) gone.push(G.chain[i]);
  G.chain = G.chain.filter((_, i) => !set.has(i));
  G.popped += gone.length;
  ev.push({ type: 'pop', marbles: gone });
  return gone;
}

// A marble has just been set in at index i (or two segments have just met
// at i and i+1): let its kind say what happens, apply it, and follow any
// chain reaction. Returns the number of marbles popped in all.
function settle(G, i, ev) {
  const effects = kindOf(G.chain[i]).land(G, i);
  let total = 0;
  // (A pop opens a gap; the marbles either side of it meet later, when the
  // back closes it -- see step.)
  if (effects.pop?.length) total += pop(G, effects.pop, ev).length;
  if (effects.push) {
    for (const m of G.chain) m.s += effects.push;
    ev.push({ type: 'push', by: effects.push });
  }
  if (effects.pace) {
    G.pace = { factor: effects.pace.factor, until: G.tick + effects.pace.ticks };
    ev.push({ type: 'pace', ...effects.pace });
  }
  return total;
}

// Two segments have just met: the front one's last marble is at index i,
// the back one's first at i + 1. If the colours either side make a run,
// it pops. Returns marbles popped.
function meet(G, i, ev) {
  if (!G.chain[i + 1] || !sameColour(G.chain[i], G.chain[i + 1])) return 0;
  const group = run(G, i, (m) => sameColour(m, G.chain[i]));
  if (group.length < MATCH) return 0;
  return pop(G, group, ev).length;
}

// Advance the game a tick: the chain rolls on, gaps close, the shot flies
// and lands. Returns the events of the tick, for the view: pop { marbles },
// land { index, marble }, miss { marble }, meet, push, pace, entered
// { marble }, over { why }.
export function step(G) {
  const ev = [];
  if (G.over) return ev;
  const before = G.popped;
  G.tick++;
  if (G.pace && G.tick > G.pace.until) G.pace = null;
  const factor = G.pace ? G.pace.factor : 1;
  // The chain rushes in at the start, until its front is well along the
  // way; once the whole chain is through the gate nothing pushes it, and
  // it rolls on at half pace.
  const last = G.chain[G.chain.length - 1];
  const fed = !last || last.s >= G.path.gate;
  if (!G.rushed && G.chain[0] && G.chain[0].s >= G.path.gate + RUSH_TO * (G.path.length - G.path.gate)) G.rushed = true;
  const roll = G.speed * (G.rushed ? (fed ? 0.5 : 1) : RUSH) * factor * TICK;

  // The chain, segment by segment from the back. The back one is pushed
  // along; one behind a gap races to close it; one ahead of a gap holds
  // still, or is drawn back if the colours across the gap match.
  const segs = segments(G);
  for (let k = segs.length - 1; k >= 0; k--) {
    const [from, to] = segs[k];
    const behind = k + 1 < segs.length;
    const ahead = k > 0;
    let move;
    if (!behind) move = ahead ? Math.max(roll, CATCH * TICK) : roll;
    else if (sameColour(G.chain[to], G.chain[to + 1])) move = -PULL * TICK;
    else move = 0;
    if (!move) continue;
    for (let i = from; i <= to; i++) G.chain[i].s += move;
    // Met the segment ahead (or, drawn back, the one behind): close up and
    // see what the colours make.
    if (move > 0 && ahead && G.chain[from].s > G.chain[from - 1].s - 2 * R) {
      const over = G.chain[from].s - (G.chain[from - 1].s - 2 * R);
      for (let i = from; i <= to; i++) G.chain[i].s -= over;
      ev.push({ type: 'meet', index: from - 1 });
      meet(G, from - 1, ev);
      break; // (the segments have changed; the rest wait a tick)
    }
    if (move < 0 && G.chain[to].s < G.chain[to + 1].s + 2 * R) {
      const over = G.chain[to + 1].s + 2 * R - G.chain[to].s;
      for (let i = from; i <= to; i++) G.chain[i].s += over;
      ev.push({ type: 'meet', index: to });
      meet(G, to, ev);
      break;
    }
  }
  // (The marbles still to come in are the tail of the chain, in order:
  // the first of them is the next in.)
  let tail = G.chain.length - 1;
  while (tail >= 0 && !G.chain[tail].entered) tail--;
  for (let i = tail + 1; i < G.chain.length && G.chain[i].s >= G.path.gate; i++) {
    G.chain[i].entered = true;
    ev.push({ type: 'entered', marble: G.chain[i] });
  }

  // The shot: on its way, into the chain, or off the board.
  if (G.shot) {
    const sh = G.shot;
    sh.x += sh.dx * TICK;
    sh.y += sh.dy * TICK;
    const hit = struck(G, sh.x, sh.y);
    if (hit >= 0) {
      // In front of the marble it struck, or behind it, by which side of
      // it the shot came to.
      const m = G.chain[hit];
      const p = G.path.at(m.s);
      const along = (sh.x - p.x) * Math.cos(p.angle) + (sh.y - p.y) * Math.sin(p.angle);
      const index = along > 0 ? hit : hit + 1;
      const marble = { ...sh.marble, s: along > 0 ? m.s + 2 * R : m.s - 2 * R, entered: true };
      G.chain.splice(index, 0, marble);
      if (G.chain[index + 1]) marble.s = Math.max(marble.s, G.chain[index + 1].s + 2 * R);
      const closed = compact(G, index - 1);
      G.shot = null;
      ev.push({ type: 'land', index, marble });
      // Any gap the shove closed is a meeting too, nearest first (a pop
      // there shifts only what's behind it).
      for (const j of closed) meet(G, j, ev);
      const at = G.chain.indexOf(marble);
      if (at >= 0) settle(G, at, ev);
    } else if (sh.x < -2 * R || sh.x > W + 2 * R || sh.y < -2 * R || sh.y > H + 2 * R) {
      G.shot = null;
      ev.push({ type: 'miss', marble: sh.marble });
    }
  }

  const popped = G.popped > before;
  // The end: the chain gone, or a marble at the drain.
  if (!G.chain.length) {
    G.over = 'cleared';
    G.shot = null;
    ev.push({ type: 'over', why: 'cleared' });
  } else if (G.chain[0].s >= G.path.length) {
    G.over = 'drained';
    G.shot = null;
    ev.push({ type: 'over', why: 'drained' });
  }
  // (The marbles loaded and next were drawn a while ago: if either's colour
  // has gone from the chain since, it's drawn again, so you're never handed
  // a dead one.)
  if (!G.over && popped) {
    const left = coloursIn(G);
    if (G.loaded.kind === 'marble' && !left.includes(G.loaded.colour)) G.loaded = draw(G);
    if (G.next.kind === 'marble' && !left.includes(G.next.colour)) G.next = draw(G);
  }
  return ev;
}

// What the screen shows of the chain's progress, worked out here so the
// view does no sums: how far the front marble is along the way (0 at the
// gate, 1 at the drain), and how many are still to come in.
export function progress(G) {
  const front = G.chain[0];
  return {
    front: front ? Math.max(0, Math.min(1, (front.s - G.path.gate) / (G.path.length - G.path.gate))) : 0,
    waiting: G.chain.filter((m) => !m.entered).length,
    left: G.chain.length,
    popped: G.popped,
  };
}

// ------------------------------------------------------------------ the computer gnome

// The aim from the gnome at a point.
export const aimAt = (x, y) => Math.atan2(x - GNOME.x, GNOME.y - y);

// The shots worth trying now: one at each marble in reach, where it will
// be when the shot gets there -- a touch in front of it or a touch behind,
// whichever side its own colour is on (both, when it's on both; behind,
// when it's on neither, for a shot that only sets one up).
function candidates(G) {
  const out = new Set();
  const colour = G.loaded.colour;
  for (let i = 0; i < G.chain.length; i++) {
    const m = G.chain[i];
    if (!hittable(G, m)) continue;
    const p = G.path.at(m.s);
    const flight = Math.hypot(p.x - GNOME.x, p.y - GNOME.y) / SHOT_SPEED;
    const there = G.path.at(m.s + G.speed * flight);
    const own = m.colour === colour;
    const ahead = own || (i > 0 && touching(G, i - 1) && G.chain[i - 1].colour === colour);
    const behind = own || (touching(G, i) && G.chain[i + 1].colour === colour);
    const sides = ahead && behind ? [-0.7, 0.7] : ahead ? [0.7] : [-0.7];
    for (const side of sides) {
      const x = there.x + Math.cos(there.angle) * side * R;
      const y = there.y + Math.sin(there.angle) * side * R;
      out.add(Math.round(aimAt(x, y) * 1000) / 1000);
    }
  }
  return [...out];
}

// Fire this shot on a copy and play on until it has landed (or missed)
// and the gnome could fire again. Scored: a point a marble popped, a
// bonus for a chain reaction, half a point for landing beside its own
// colour, a point off for a miss, and the drain looming counts against a
// shot that pops nothing.
function tryShot(G, angle) {
  const after = cloneGame(G);
  fire(after, angle);
  let popped = 0;
  let pops = 0;
  let landed = null;
  let missed = false;
  let waited = 0;
  while (!after.over && waited < SETTLE) {
    for (const e of step(after)) {
      if (e.type === 'pop') { popped += e.marbles.length; pops++; }
      if (e.type === 'land') landed = e;
      if (e.type === 'miss') missed = true;
    }
    if (!after.shot) waited++;
    if (after.tick - G.tick > 240) break;
  }
  let score = popped + (pops > 1 ? 2 * (pops - 1) : 0);
  if (missed) score -= 1;
  if (landed && !popped) {
    const i = after.chain.indexOf(landed.marble);
    const beside = (i > 0 && touching(after, i - 1) && sameColour(after.chain[i - 1], landed.marble)) || (touching(after, i) && sameColour(after.chain[i + 1], landed.marble));
    score += beside ? 0.5 : -0.3;
    score -= 2 * progress(after).front;
  }
  if (after.over === 'cleared') score += 100;
  if (after.over === 'drained') score -= 100;
  return { angle, score, after };
}

// The best shot from here, with the marble loaded or (swapped) the next
// one: the candidate that scores best with the best reply after it
// counted for a little over half. { angle, swap, score }, or null with
// nothing in reach.
export function bestShot(G) {
  const swapped = cloneGame(G);
  swap(swapped);
  const now = [
    ...candidates(G).map((angle) => ({ ...tryShot(G, angle), swap: false })),
    ...(G.next.kind !== G.loaded.kind || G.next.colour !== G.loaded.colour ? candidates(swapped).map((angle) => ({ ...tryShot(swapped, angle), swap: true })) : []),
  ].sort((a, b) => b.score - a.score);
  if (!now.length) return null;
  let best = now[0];
  let bestScore = -Infinity;
  for (const o of now.slice(0, 2)) {
    const reply = o.after.over ? 0 : Math.max(0, ...candidates(o.after).map((a) => tryShot(o.after, a).score));
    const score = o.score + 0.6 * reply;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return { angle: best.angle, swap: best.swap, score: best.score };
}

// Ticks until the next marble comes in through the gate, at the chain's
// present pace (none still to come: 0).
function ticksToNextEntry(G) {
  let j = G.chain.length - 1;
  while (j >= 0 && !G.chain[j].entered) j--;
  const next = G.chain[j + 1];
  if (!next) return 0;
  const roll = G.speed * (G.rushed ? 1 : RUSH) * TICK;
  return Math.ceil((G.path.gate - next.s) / roll);
}

// Play the level through from the start, firing whenever ready -- unless
// nothing on offer is any good and more marbles are still to come, when
// it waits a moment for better, as long as the drain is not near:
// { cleared, shots, ticks, fired: [[tick, angle, swapped], ...] }.
export function solve(level, { react = REACT, maxTicks = 60 * 240 } = {}) {
  const G = newGame(level);
  const fired = [];
  let ready = 0;
  while (!G.over && G.tick < maxTicks) {
    if (!G.shot && G.tick >= ready) {
      const best = bestShot(G);
      const { waiting, front } = progress(G);
      if (best && (best.score >= 2 || !waiting || front > 0.7)) {
        if (best.swap) swap(G);
        fire(G, best.angle);
        fired.push([G.tick, best.angle, best.swap ? 1 : 0]);
      } else {
        // Nothing worth a shot yet: look again when the next marble is in.
        ready = G.tick + Math.min(60, Math.max(6, ticksToNextEntry(G)));
      }
    }
    const was = G.shot;
    step(G);
    if (was && !G.shot) ready = G.tick + react;
  }
  return { cleared: G.over === 'cleared', shots: G.shots, ticks: G.tick, fired };
}

// Play a recorded run back on a fresh game: the same ticks, the same
// angles. Returns the game at its end.
export function replay(level, fired) {
  const G = newGame(level);
  let k = 0;
  while (!G.over && G.tick < 60 * 600) {
    while (k < fired.length && fired[k][0] === G.tick) {
      if (fired[k][2]) swap(G);
      fire(G, fired[k++][1]);
    }
    step(G);
  }
  return G;
}

// Level n: its course re-rolled from the same seed (up to a dozen times)
// until the computer gnome clears it in a sensible number of shots -- not
// under spec.par, which would be a chain that falls apart at a touch, and
// not over spec.most -- and its shot count is par; and until it clears it
// again taking its time (a second a shot, as a careful player might), so
// there is always time. If no attempt does all that, the nearest one the
// quick gnome clears is taken (still proved, so still `checked`); if none
// clears at all, the level ships anyway with a guessed par, no solution,
// and `checked` false for the screen to say so.
export function makeLevel(n) {
  const { par: want, most } = specFor(n);
  let best = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const course = makeCourse(n, attempt);
    if (faultOf(buildPath(course.shape, course.params))) continue;
    const run = solve(course);
    if (!run.cleared) continue;
    let off = run.shots < want ? want - run.shots : run.shots > most ? run.shots - most : 0;
    if (!solve(course, { react: LEISURE }).cleared) off += 100;
    if (!best || off < best.off) best = { course, run, off };
    if (off === 0) break;
  }
  if (!best) {
    const course = makeCourse(n, 0);
    return { ...course, par: want, solution: [], ticks: 0, checked: false };
  }
  return { ...best.course, par: best.run.shots, solution: best.run.fired, ticks: best.run.ticks, checked: true };
}

// Stars for clearing the path in `shots`: three at par or better, two
// within half as many again, one for clearing it.
export function stars(level, shots) {
  return shots <= level.par ? 3 : shots <= Math.ceil(level.par * 1.5) ? 2 : 1;
}
