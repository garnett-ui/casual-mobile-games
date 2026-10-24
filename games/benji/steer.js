// Benji's Town: being the driver (or the dog walker). Which way the street
// (or sidewalk) goes on ahead from where you are, going the way you're
// going -- turning, at the next place you can, the way you asked -- and
// which way to turn to get to the job. (No DOM: tested in Node.)
import { isRoad } from './town.js';
import { isJunction } from './streets.js';

export const left = (d) => ({ x: d.y, y: -d.x });
export const right = (d) => ({ x: -d.y, y: d.x });
export const back = (d) => ({ x: -d.x, y: -d.y });
const step = (t, d) => ({ x: t.x + d.x, y: t.y + d.y });
const open = (t, d) => isRoad(t.x + d.x, t.y + d.y);
const turned = (d, turn) => (turn === 'left' ? left(d) : turn === 'right' ? right(d) : d);
const same = (a, b) => a.x === b.x && a.y === b.y;

// -------------------------------------------------------------- driving

// The street tiles ahead of a vehicle in tile t going d (t itself not
// counted): on to the next intersection and out of it -- turning the way
// asked, if there's a street that way -- or to the end of a dead end and
// back round.
export function ahead(t, d, turn = 'straight') {
  const out = [];
  let cur = t;
  let dir = d;
  for (let n = 0; n < 8; n++) {
    if (isJunction(cur.x, cur.y)) {
      const w = turned(dir, turn);
      out.push(step(cur, open(cur, w) ? w : dir));
      return out;
    }
    if (!open(cur, dir)) {
      dir = back(dir);
      if (!open(cur, dir)) return out;
    }
    cur = step(cur, dir);
    out.push(cur);
  }
  return out;
}

// Which way to turn at the next intersection, from tile t going d, for the
// quickest way to tile to (going straight on, turning left or right at
// intersections, and round at dead ends -- no U-turns in the street):
// 'straight', 'left' or 'right'; null if you're there.
export function driveTurn(t, d, to) {
  if (same(t, to)) return null;
  const key = (s) => `${s.t.x},${s.t.y},${s.d.x},${s.d.y}`;
  const queue = [{ t, d, first: null }];
  const seen = new Set([key(queue[0])]);
  while (queue.length) {
    const s = queue.shift();
    if (same(s.t, to)) return s.first ?? 'straight';
    const moves = [];
    if (isJunction(s.t.x, s.t.y)) {
      for (const turn of ['straight', 'left', 'right']) if (open(s.t, turned(s.d, turn))) moves.push([turned(s.d, turn), turn]);
    } else moves.push([open(s.t, s.d) ? s.d : back(s.d), null]);
    for (const [nd, turn] of moves) {
      const n = { t: step(s.t, nd), d: nd, first: s.first ?? turn };
      if (seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return 'straight';
}

// ------------------------------------------------------------- walking

// The signed angle (radians; left negative) turning from going a -> b to
// going b -> c.
function bend(w, a, b, c) {
  const [p, q, r] = [w.nodes[a], w.nodes[b], w.nodes[c]];
  const d = Math.atan2(r.y - q.y, r.x - q.x) - Math.atan2(q.y - p.y, q.x - p.x);
  return Math.atan2(Math.sin(d), Math.cos(d));
}

// Where someone going a -> b goes on from b: the only way on (round a
// bend), or where the way divides, the way they're turning (straight on if
// they can't); back the way they came at a dead end.
export function onFrom(w, a, b, turn = 'straight') {
  const ways = w.adj[b].map((e) => e.to).filter((c) => c !== a);
  if (!ways.length) return a;
  if (ways.length === 1) return ways[0];
  const by = ways.map((c) => ({ c, t: bend(w, a, b, c) }));
  const pick = turn === 'left' ? by.filter((o) => o.t < -0.4).sort((x, y) => x.t - y.t)[0]
    : turn === 'right' ? by.filter((o) => o.t > 0.4).sort((x, y) => y.t - x.t)[0] : null;
  return (pick || by.sort((x, y) => Math.abs(x.t) - Math.abs(y.t))[0]).c;
}

// The sidewalk points ahead of someone going a -> b (b not counted): round
// the bends to where the way next divides, and on from there the way
// they're turning.
export function walkAhead(w, a, b, turn = 'straight') {
  const out = [];
  let [p, q] = [a, b];
  for (let n = 0; n < 40; n++) {
    const branch = w.adj[q].length > 2;
    const r = onFrom(w, p, q, branch ? turn : 'straight');
    out.push(r);
    if (branch || r === p) break;
    [p, q] = [q, r];
  }
  return out;
}

// Which way to turn where the way next divides, going a -> b, for the
// quickest walk to sidewalk point to: 'straight', 'left', 'right' or
// 'back' (turn round, now); null if there.
export function walkTurn(w, a, b, to) {
  if (b === to) return null;
  const way = w.route(b, to);
  if (way[1] === a) return 'back';
  let [p, q] = [a, b];
  for (let i = 1; i < way.length; i++) {
    const r = way[i];
    const on = onFrom(w, p, q);
    if (w.adj[q].length > 2) {
      if (r === on) return 'straight';
      return r === p ? 'back' : bend(w, p, q, r) < 0 ? 'left' : 'right';
    }
    if (r !== on) return 'back';
    [p, q] = [q, r];
  }
  return 'straight';
}
