import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPath, faultOf, makeCourse, makeLevel, specFor, newGame, fire, swap, step, stars, solve, replay,
  progress, segments, touching, coloursIn, aimAt, struck, cloneGame, kindOf, REACT,
  SHAPES, SHAPE_ORDER, KINDS, W, H, R, GNOME, TICK, SHOT_SPEED, RUSH, RUSH_TO, CATCH, PULL, MATCH, LEISURE, APART, MARGIN, CLEAR, REF_LENGTH,
} from '../games/marble-garden/engine.js';
import { rng, seedFor } from '../js/lib/random.js';

// A hand-made level for the rule tests: one turn of the loop, coming in at
// the top right and going round clockwise, the chain's colours as a string.
const level = (colours, extra = {}) => ({ shape: 'loop', params: { start: -Math.PI / 4, dir: 1 }, colours, palette: 3, speed: 1.5, tunnels: [], queue: 1, ...extra });
const marble = (colour) => ({ kind: 'marble', colour });
const colours = (G) => G.chain.map((m) => m.colour).join('');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
// Play on until an event `done` happens (or the game ends): every event on the way.
const until = (G, done, most = 3000) => {
  const out = [];
  for (let t = 0; t < most && !G.over; t++) {
    const ev = step(G);
    out.push(...ev);
    if (ev.some(done)) break;
  }
  return out;
};
// Roll the chain in until its last marble is `past` radii through the gate,
// so every marble is on the board and can be struck.
const rollIn = (G, past = 10) => {
  const out = [];
  while (G.chain.at(-1).s < G.path.gate + past * R) out.push(...step(G));
  return out;
};
// Where the i-th marble will be when a shot from the gnome gets there: the
// game played on, without the shot, for the flight (worked out three times
// over, as the flight depends on where it ends).
const leadOn = (G, i) => {
  let ticks = 0;
  let there;
  for (let k = 0; k < 3; k++) {
    const ahead = cloneGame(G);
    for (let t = 0; t < ticks; t++) step(ahead);
    there = G.path.at(ahead.chain[i].s);
    ticks = Math.max(0, Math.floor((Math.hypot(there.x - GNOME.x, there.y - GNOME.y) - 1.5 * R) / (SHOT_SPEED * TICK)));
  }
  return there;
};
// The aim at the i-th marble, a touch ahead of it (side > 0, toward the
// drain) or behind it (side < 0), where it will be.
const aimFor = (G, i, side) => {
  const p = leadOn(G, i);
  return aimAt(p.x + Math.cos(p.angle) * side * R, p.y + Math.sin(p.angle) * side * R);
};
// Flick the loaded marble at the i-th marble and play on until it lands or
// misses: the events on the way.
const shoot = (G, i, side) => {
  assert.ok(fire(G, aimFor(G, i, side)), 'the shot is away');
  return until(G, (e) => e.type === 'land' || e.type === 'miss');
};
const of = (events, type) => events.filter((e) => e.type === type);
// A few levels, proved once and shared (proving one takes a moment).
const PROVED = [1, 2, 3, 6, 10, 16, 20];
const provedLevels = new Map();
const proved = (n) => {
  if (!provedLevels.has(n)) provedLevels.set(n, makeLevel(n));
  return provedLevels.get(n);
};

test('every shape builds a measured path in through the gate, held at its ends, and fit to play', () => {
  for (const shape of SHAPE_ORDER) {
    assert.ok(SHAPES[shape], `${shape} is a shape`);
    let fit = 0;
    for (let k = 0; k < 20; k++) {
      const params = SHAPES[shape].params(rng(seedFor(k, 7)));
      const path = buildPath(shape, params);
      const tag = `${shape} at seed ${k}`;
      assert.equal(path.points.length, path.s.length);
      assert.equal(path.s[0], 0);
      for (let i = 1; i < path.s.length; i++) assert.ok(path.s[i] > path.s[i - 1], `${tag}: s rises along the way at ${i}`);
      assert.equal(path.length, path.s.at(-1));
      assert.ok(path.length > 100, `${tag}: a way ${path.length} long`);
      // at(s) is on the points at the samples, between them in between, and
      // held at the ends.
      for (const i of [0, 50, 200, path.points.length - 1]) {
        const p = path.at(path.s[i]);
        assert.ok(near(p.x, path.points[i][0]) && near(p.y, path.points[i][1]), `${tag}: at(s[${i}])`);
      }
      const mid = path.at((path.s[100] + path.s[101]) / 2);
      assert.ok(near(mid.x, (path.points[100][0] + path.points[101][0]) / 2, 1e-6), `${tag}: half-way between two samples`);
      assert.ok(near(mid.y, (path.points[100][1] + path.points[101][1]) / 2, 1e-6));
      assert.deepEqual(path.at(-5), path.at(0), `${tag}: held at the start`);
      assert.deepEqual(path.at(path.length + 5), path.at(path.length), `${tag}: held at the drain`);
      // The gate is where the way in comes onto the board.
      const onBoard = ([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H;
      const g = path.s.indexOf(path.gate);
      assert.ok(g > 0, `${tag}: the way in starts off the board`);
      assert.ok(onBoard(path.points[g]), `${tag}: the gate is on the board`);
      assert.ok(path.points.slice(0, g).every((p) => !onBoard(p)), `${tag}: and nothing before it is`);
      if (faultOf(path) === null) fit++;
    }
    // (A level whose path has a fault would be rolled again -- see makeLevel
    // -- but none of these has one.)
    assert.equal(fit, 20, `${shape} is fit at every seed`);
  }
});

test('a path off the board, through the gnome or doubling back on itself has its fault named', () => {
  const good = buildPath('loop', { start: -Math.PI / 4, dir: 1 });
  assert.equal(faultOf(good), null);
  // A hand-made path: a straight way in from the top, then the points given.
  const made = (pts) => {
    const x = pts[0][0];
    const all = [[x, -6], [x, -3], [x, 0], [x, 3], ...pts];
    const s = [0];
    for (let i = 1; i < all.length; i++) s.push(s[i - 1] + Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]));
    return { points: all, s, length: s.at(-1), gate: 6 };
  };
  const down = (x, y0, y1) => Array.from({ length: Math.abs(y1 - y0) + 1 }, (_, k) => [x, y0 + Math.sign(y1 - y0) * k]);
  assert.equal(faultOf(made(down(10, 4, 40))), null, 'a straight way down the board is fit');
  assert.match(faultOf(made(down(GNOME.x, 4, 40).map(([, y]) => [10 + ((GNOME.x - 10) * (y - 4)) / 23, y]))), /too close to the gnome/);
  assert.match(faultOf(made([...down(10, 4, 20), [MARGIN / 2, 21], [MARGIN / 2, 22]])), /off the board/);
  // Down one side and back up beside it, closer than APART.
  const there = down(4, 4, 40);
  assert.match(faultOf(made([...there, ...down(4 + APART - 1, 40, 4)])), /doubles back on itself/);
  assert.equal(faultOf(made([...there, ...down(4 + APART + 1, 40, 4)])), null, 'APART or more apart is fine');
  assert.ok(CLEAR > 0 && MARGIN > 0);
});

test('near(x, y) gives the stretches of the way by a point, and struck finds the marble a shot touches, not one behind the gate or in a tunnel', () => {
  const path = buildPath('loop', { start: -Math.PI / 4, dir: 1 });
  for (const at of [20, 60, 90, 130]) {
    const p = path.at(at);
    const runs = path.near(p.x, p.y);
    assert.ok(runs.some(([a, b]) => a <= at + 1 && b >= at - 1), `a stretch by s=${at}: ${JSON.stringify(runs)}`);
    // Every stretch given is near the point (within the squares round it).
    for (const [a, b] of runs) {
      for (const d of [a, b]) {
        const q = path.at(d);
        assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 12 * R, `s=${d} is near s=${at}`);
      }
    }
  }
  assert.deepEqual(path.near(GNOME.x, GNOME.y), [], 'none by the gnome');
  assert.deepEqual(path.near(0, H), [], 'none in a corner');

  // Nothing is struck while the chain is all behind the gate.
  const G = newGame(level('01201'));
  const start = G.path.at(0);
  assert.equal(struck(G, start.x, start.y), -1);
  rollIn(G);
  G.chain.forEach((m, i) => {
    const p = G.path.at(m.s);
    assert.equal(struck(G, p.x, p.y), i, `the marble at ${i}`);
    assert.equal(struck(G, p.x + 0.9 * R, p.y), i, `a touch to the side of ${i}`);
  });
  const p = G.path.at(G.chain[2].s);
  assert.equal(struck(G, p.x + 1.5 * R * Math.cos(p.angle), p.y + 1.5 * R * Math.sin(p.angle)), 1, 'the nearest is the one struck');
  assert.equal(struck(G, GNOME.x, GNOME.y), -1);
  // A marble in a tunnel is out of reach.
  const T = newGame(level('01201', { tunnels: [[0, 1000]] }));
  rollIn(T);
  for (const m of T.chain) {
    const q = T.path.at(m.s);
    assert.equal(struck(T, q.x, q.y), -1);
  }
});

test('a new game lines the chain up behind the gate, a marble\'s width apart, with the gnome holding colours from the chain', () => {
  const G = newGame(level('0120112'));
  assert.equal(G.chain.length, 7);
  assert.equal(colours(G), '0120112');
  G.chain.forEach((m, i) => {
    assert.equal(m.kind, 'marble');
    assert.equal(m.s, -2 * R * i, `marble ${i}`);
    assert.ok(m.s < G.path.gate, 'behind the gate');
    if (i > 0) assert.ok(touching(G, i - 1), `${i - 1} and ${i} touch`);
  });
  assert.deepEqual(segments(G), [[0, 6]], 'one segment');
  assert.deepEqual(coloursIn(G), [0, 1, 2]);
  for (const m of [G.loaded, G.next]) assert.ok(m.kind === 'marble' && coloursIn(G).includes(m.colour), `holding ${JSON.stringify(m)}`);
  assert.deepEqual(progress(G), { front: 0, waiting: 7, left: 7, popped: 0 });
  assert.equal(G.tick, 0);
  assert.equal(G.shots, 0);
  assert.equal(G.over, null);
  assert.equal(G.rushed, false);
  // A chain of one colour hands out only that colour, whatever the queue.
  for (let queue = 1; queue <= 20; queue++) {
    const K = newGame(level('2222', { queue }));
    assert.deepEqual([K.loaded, K.next], [marble(2), marble(2)]);
  }
});

test('the chain rushes in through the gate, marble by marble, until its front is RUSH_TO of the way along', () => {
  // A long chain, so it is still coming in when the rush ends.
  const G = newGame(level('012'.repeat(16)));
  for (let t = 0; t < 10; t++) step(G);
  assert.ok(near(G.chain[0].s, 10 * G.speed * RUSH * TICK), `the front rolled ${G.chain[0].s}`);
  G.chain.forEach((m, i) => assert.ok(near(m.s, G.chain[0].s - 2 * R * i), 'the chain rolls as one'));
  // Each marble is in as it reaches the gate, in order down the chain.
  const entered = [];
  while (!G.rushed) {
    for (const e of step(G)) {
      if (e.type !== 'entered') continue;
      assert.ok(e.marble.s >= G.path.gate, 'in at the gate');
      assert.ok(e.marble.s < G.path.gate + G.speed * RUSH * TICK + 1e-9, 'as it reaches it');
      entered.push(G.chain.indexOf(e.marble));
    }
  }
  assert.deepEqual(entered, entered.map((_, i) => i), 'in order');
  assert.ok(entered.length > 0 && entered.length < G.chain.length);
  assert.equal(progress(G).waiting, G.chain.length - entered.length);
  assert.ok(G.chain[0].s >= G.path.gate + RUSH_TO * (G.path.length - G.path.gate), 'rushed far enough');
  assert.ok(G.chain[0].s < G.path.gate + RUSH_TO * (G.path.length - G.path.gate) + 2 * G.speed * RUSH * TICK, 'and no further');
  assert.ok(near(progress(G).front, RUSH_TO, 0.01), `the front is ${progress(G).front} of the way`);
  // Then it rolls at its own pace.
  const was = G.chain[0].s;
  step(G);
  assert.ok(near(G.chain[0].s - was, G.speed * TICK), `after the rush: ${G.chain[0].s - was} a tick`);
});

test('once every marble is through the gate, nothing pushes the chain and it rolls on at half pace', () => {
  const G = newGame(level('012'.repeat(16)));
  until(G, () => false, 1); // (under way)
  while (G.chain.at(-1).s < G.path.gate) {
    const was = G.chain[0].s;
    step(G);
    if (G.rushed && G.chain.at(-1).s < G.path.gate) assert.ok(near(G.chain[0].s - was, G.speed * TICK), 'full pace while some are still to come');
  }
  assert.equal(progress(G).waiting, 0);
  for (let t = 0; t < 30; t++) {
    const was = G.chain.map((m) => m.s);
    step(G);
    G.chain.forEach((m, i) => assert.ok(near(m.s - was[i], 0.5 * G.speed * TICK), `half pace: ${m.s - was[i]}`));
  }
});

test('a shot is set in ahead of the marble it strikes or behind it, by which side it came to, and everything ahead is shoved on', () => {
  for (const [side, at] of [[0.7, 3], [-0.7, 4]]) {
    const G = newGame(level('0101010'));
    rollIn(G);
    G.loaded = marble(2);
    // The same game without the shot, to measure the shove against.
    const twin = cloneGame(G);
    const target = G.chain[3];
    const ev = shoot(G, 3, side);
    while (twin.tick < G.tick) step(twin);
    const [land] = of(ev, 'land');
    assert.ok(land, `side ${side}: landed`);
    assert.equal(land.index, at, `side ${side}: set in at ${at}`);
    assert.deepEqual(G.chain[at], land.marble);
    assert.equal(land.marble.colour, 2);
    assert.equal(G.chain.indexOf(target), side > 0 ? 4 : 3, 'the marble struck is behind it, or ahead of it');
    assert.equal(colours(G), side > 0 ? '01021010' : '01012010');
    assert.equal(of(ev, 'pop').length, 0);
    // Those behind it are where they would have been; those ahead a marble's width on.
    for (let i = 0; i < twin.chain.length; i++) {
      const j = i < at ? i : i + 1;
      const shove = i < at ? 2 * R : 0;
      assert.ok(near(G.chain[j].s, twin.chain[i].s + shove, 1e-6), `side ${side}: marble ${i} moved ${G.chain[j].s - twin.chain[i].s}`);
    }
    assert.ok(near(land.marble.s, G.chain[at + 1].s + 2 * R, 1e-6), 'and it touches the one behind');
    assert.deepEqual(segments(G), [[0, 7]], 'still one segment');
    assert.equal(G.shot, null);
  }
});

test('a shot that touches nothing is a miss and is gone, but counted; one in the air at a time', () => {
  const G = newGame(level('0101010'));
  rollIn(G);
  const loaded = G.loaded;
  const next = G.next;
  // The chain is in at the top right: straight down and to the left is clear.
  assert.equal(fire(G, Math.PI * 0.8), true);
  assert.equal(G.shots, 1);
  assert.deepEqual(G.shot.marble, loaded);
  assert.equal(G.loaded, next, 'the next is loaded');
  assert.equal(fire(G, 0), false, 'refused while one flies');
  assert.equal(G.shots, 1, 'and not counted');
  const ev = until(G, (e) => e.type === 'land' || e.type === 'miss');
  const [miss] = of(ev, 'miss');
  assert.ok(miss, 'a miss');
  assert.deepEqual(miss.marble, loaded);
  assert.equal(of(ev, 'land').length, 0);
  assert.equal(G.shot, null);
  assert.equal(G.chain.length, 7, 'the chain is as it was');
  assert.equal(colours(G), '0101010');
  assert.equal(fire(G, 0), true, 'ready again');
  assert.equal(G.shots, 2);
});

test('three of a colour touching pop, and are reported; two do not', () => {
  assert.equal(MATCH, 3);
  for (const side of [0.7, -0.7]) {
    const G = newGame(level('0110'));
    rollIn(G);
    G.loaded = marble(1);
    const ev = shoot(G, side > 0 ? 1 : 2, side);
    const pops = of(ev, 'pop');
    assert.equal(pops.length, 1, `side ${side}`);
    assert.deepEqual(pops[0].marbles.map((m) => m.colour), [1, 1, 1]);
    assert.ok(pops[0].marbles.includes(of(ev, 'land')[0].marble), 'the shot is one of them');
    assert.equal(colours(G), '00');
    assert.equal(G.popped, 3);
    assert.equal(progress(G).popped, 3);
  }
  // A 1 by a single 1: it just goes in.
  const G = newGame(level('0120'));
  rollIn(G);
  G.loaded = marble(1);
  const ev = shoot(G, 1, -0.7);
  assert.equal(of(ev, 'land').length, 1);
  assert.equal(of(ev, 'pop').length, 0);
  assert.equal(colours(G), '01120');
  assert.equal(G.popped, 0);
});

test('a pop opens a gap: the segment behind races up to close it while the one ahead holds still, and they meet', () => {
  // 0 [1 1] 2 with a 1 shot in: 0 | 2, colours that don't match across the gap.
  const G = newGame(level('0112'));
  rollIn(G);
  G.loaded = marble(1);
  shoot(G, 1, 0.7);
  assert.equal(colours(G), '02');
  assert.deepEqual(segments(G), [[0, 0], [1, 1]], 'two segments');
  assert.ok(!touching(G, 0));
  const ticks = [];
  for (;;) {
    const front = G.chain[0].s;
    const back = G.chain[1].s;
    const ev = step(G);
    ticks.push(G.chain[1].s - back);
    assert.equal(G.chain[0].s, front, 'the front holds still');
    if (of(ev, 'meet').length) {
      assert.deepEqual(of(ev, 'meet'), [{ type: 'meet', index: 0 }]);
      assert.equal(of(ev, 'pop').length, 0);
      break;
    }
    assert.ok(near(G.chain[1].s - back, CATCH * TICK), `the back races up: ${G.chain[1].s - back}`);
    assert.ok(ticks.length < 60, 'and gets there');
  }
  assert.ok(near(G.chain[0].s - G.chain[1].s, 2 * R, 1e-9), 'touching');
  assert.deepEqual(segments(G), [[0, 1]], 'one segment again');
  // And then the chain rolls on as one.
  const was = G.chain.map((m) => m.s);
  step(G);
  assert.ok(G.chain[0].s > was[0] && near(G.chain[0].s - was[0], G.chain[1].s - was[1]));
});

test('when the colours across a gap match, the front is drawn back, and the meeting pops them: a chain reaction', () => {
  // 2 0 [1 1] 0 0 2 with a 1 shot in: 2 0 | 0 0 2, then 2 | 2.
  const G = newGame(level('2011002'));
  rollIn(G);
  G.loaded = marble(1);
  const ev = shoot(G, 2, 0.7);
  assert.deepEqual(of(ev, 'pop').map((e) => e.marbles.map((m) => m.colour)), [[1, 1, 1]]);
  assert.equal(colours(G), '20002');
  assert.deepEqual(segments(G), [[0, 1], [2, 4]]);
  const front = G.chain[1].s;
  let ev2 = step(G);
  assert.ok(near(G.chain[1].s - front, -PULL * TICK), `the front is drawn back: ${G.chain[1].s - front}`);
  ev2 = ev2.concat(until(G, (e) => e.type === 'pop'));
  assert.equal(of(ev2, 'meet').length, 1);
  assert.deepEqual(of(ev2, 'pop').map((e) => e.marbles.map((m) => m.colour)), [[0, 0, 0]]);
  assert.equal(colours(G), '22');
  assert.equal(G.popped, 6);
  // The 2s meet too, but two don't pop.
  const ev3 = until(G, (e) => e.type === 'meet');
  assert.equal(of(ev3, 'meet').length, 1);
  assert.equal(of(ev3, 'pop').length, 0);
  assert.deepEqual(segments(G), [[0, 1]]);
  // One more 2 shot in: 2 2 2 pop, the last of the chain.
  const K = newGame(level('22011002'));
  rollIn(K);
  K.loaded = marble(1);
  const all = shoot(K, 3, 0.7).concat(until(K, () => false));
  assert.deepEqual(of(all, 'pop').map((e) => e.marbles.length), [3, 3, 3], 'three pops off one shot');
  assert.equal(K.over, 'cleared');
});

test('the marble loaded is always a colour still in the chain, and swap exchanges it with the next', () => {
  for (let queue = 1; queue <= 10; queue++) {
    const G = newGame(level('0110', { queue }));
    rollIn(G);
    G.loaded = marble(1);
    G.next = marble(1);
    // Fired, the next (a 1) is loaded -- and once the 1s are gone it is drawn again.
    shoot(G, 1, 0.7);
    assert.equal(colours(G), '00');
    assert.deepEqual(G.loaded, marble(0), `queue ${queue}: loaded again`);
  }
  const G = newGame(level('0120'));
  G.loaded = marble(1);
  G.next = marble(2);
  swap(G);
  assert.deepEqual([G.loaded, G.next], [marble(2), marble(1)]);
  swap(G);
  assert.deepEqual([G.loaded, G.next], [marble(1), marble(2)]);
  rollIn(G);
  fire(G, 0);
  assert.deepEqual(G.shot.marble, marble(1), 'the loaded one is the one fired');
  // An unknown kind lands as a plain marble.
  assert.equal(kindOf({ kind: 'mystery', colour: 0 }), KINDS.marble);
  assert.equal(kindOf(marble(0)), KINDS.marble);
});

test('the next marble is a colour still in the chain too, so a dead one is never loaded', () => {
  // Queue 1 draws a 1 for next at the flick that pops the last of the 1s.
  const G = newGame(level('0110', { queue: 1 }));
  rollIn(G);
  G.loaded = marble(1);
  shoot(G, 1, 0.7);
  assert.equal(colours(G), '00');
  assert.deepEqual(G.next, marble(0), 'the next is drawn again');
  fire(G, Math.PI);
  assert.deepEqual(G.loaded, marble(0), 'and so a 0 is loaded on the shot after');
  // And through a game played by the computer gnome: neither the marble
  // loaded nor the next is ever a colour gone from the chain.
  const course = makeCourse(1);
  const { fired } = solve(course);
  const K = newGame(course);
  let k = 0;
  while (!K.over && K.tick < 60 * 240) {
    while (k < fired.length && fired[k][0] === K.tick) {
      if (fired[k][2]) swap(K);
      fire(K, fired[k++][1]);
    }
    step(K);
    if (K.over) break;
    for (const m of [K.loaded, K.next]) assert.ok(coloursIn(K).includes(m.colour), `tick ${K.tick}: holding ${m.colour}, the chain has ${coloursIn(K)}`);
  }
});

test('the same shots at the same ticks always play out the same', () => {
  const course = makeCourse(3);
  const fired = [[40, 0.5, 0], [70, 2.2, 1], [110, -2.5, 0], [140, 1.1, 0], [200, -1.0, 1], [260, 3.0, 0]];
  const A = replay(course, fired);
  const B = replay(course, fired);
  const state = (G) => ({ tick: G.tick, chain: G.chain, shots: G.shots, popped: G.popped, loaded: G.loaded, next: G.next, over: G.over, rushed: G.rushed });
  assert.deepEqual(state(A), state(B));
  assert.ok(A.shots > 0);
  // Step by step, event by event.
  const C = newGame(course);
  const D = newGame(course);
  for (let t = 0; t < 400; t++) {
    for (const [tick, angle, swapped] of fired) {
      if (tick !== C.tick) continue;
      if (swapped) { swap(C); swap(D); }
      assert.equal(fire(C, angle), fire(D, angle));
    }
    assert.deepEqual(step(C), step(D), `tick ${t}`);
  }
  assert.deepEqual(state(C), state(D));
  // The computer gnome plays the same way twice.
  assert.deepEqual(solve(course), solve(course));
});

test('a marble reaching the drain ends the game drained; popping the last clears it; no more shots after either', () => {
  const G = newGame(level('0120', { speed: 6 }));
  const ev = until(G, (e) => e.type === 'over', 60 * 120);
  assert.deepEqual(of(ev, 'over'), [{ type: 'over', why: 'drained' }]);
  assert.equal(G.over, 'drained');
  assert.ok(G.chain[0].s >= G.path.length);
  assert.ok(G.chain[1].s < G.path.length, 'it ends at the first marble in');
  assert.equal(fire(G, 0), false);
  assert.deepEqual(step(G), [], 'nothing moves after');
  // Two 1s, and a third shot in: nothing left.
  const K = newGame(level('11'));
  rollIn(K);
  K.loaded = marble(1);
  const end = shoot(K, 0, -0.7);
  assert.equal(of(end, 'pop').length, 1);
  assert.deepEqual(of(end, 'over'), [{ type: 'over', why: 'cleared' }]);
  assert.equal(K.over, 'cleared');
  assert.deepEqual(K.chain, []);
  assert.equal(fire(K, 0), false);
  assert.equal(K.shots, 1);
});

test('a marble in a tunnel can\'t be struck: the shot passes over it; outside one it lands', () => {
  // A tunnel the chain is in by the time it is all through the gate.
  for (const [tunnels, lands] of [[[[10, 60]], false], [[], true], [[[80, 89]], true]]) {
    const G = newGame(level('01201', { tunnels }));
    rollIn(G);
    G.loaded = marble(2);
    const ev = shoot(G, 2, 0.7);
    assert.equal(of(ev, 'land').length, lands ? 1 : 0, `tunnels ${JSON.stringify(tunnels)}`);
    assert.equal(of(ev, 'miss').length, lands ? 0 : 1);
    assert.equal(G.chain.length, lands ? 6 : 5);
  }
});

test('levels grow: more marbles, colours and speed, tunnels from 6 and two from 16, until 40', () => {
  let prev = specFor(1);
  for (let n = 2; n <= 50; n++) {
    const s = specFor(n);
    assert.ok(s.marbles >= prev.marbles && s.colours >= prev.colours && s.speed >= prev.speed && s.tunnels >= prev.tunnels, `level ${n}: ${JSON.stringify(s)}`);
    assert.ok(s.par >= prev.par && s.most >= prev.most && s.most > s.par, `level ${n}: par ${s.par}, most ${s.most}`);
    prev = s;
  }
  const [a, b] = [specFor(1), specFor(40)];
  assert.ok(b.marbles > a.marbles && b.colours > a.colours && b.speed > a.speed);
  assert.deepEqual([1, 5, 6, 15, 16, 40].map((n) => specFor(n).tunnels), [0, 0, 1, 1, 2, 2]);
  assert.equal(specFor(1).colours, 3);
  assert.equal(specFor(40).colours, 5);
  for (const n of [41, 50, 100]) assert.deepEqual(specFor(n), specFor(40), `level ${n} is no harder than 40`);
  assert.notDeepEqual(specFor(39), specFor(40));
});

test('a course has the spec\'s marbles, never three of a colour in a row, its tunnels on the way, and is the same every time', () => {
  for (let n = 1; n <= 50; n++) {
    for (const attempt of [0, 1, 5]) {
      const c = makeCourse(n, attempt);
      const spec = specFor(n);
      const tag = `level ${n} attempt ${attempt}`;
      assert.equal(c.colours.length, spec.marbles, tag);
      assert.match(c.colours, /^\d+$/);
      assert.ok(!/(\d)\1\1/.test(c.colours), `${tag}: three in a row in ${c.colours}`);
      assert.equal(c.palette, spec.colours);
      for (const ch of c.colours) assert.ok(Number(ch) < c.palette, `${tag}: colour ${ch}`);
      assert.ok(SHAPE_ORDER.includes(c.shape));
      if (n < 3) assert.equal(c.shape, 'loop', `${tag}: the first levels are loops`);
      const path = buildPath(c.shape, c.params);
      assert.ok(near(c.speed, (spec.speed * path.length) / REF_LENGTH, 1e-3), `${tag}: speed ${c.speed} for a way ${path.length} long`);
      assert.equal(c.tunnels.length, spec.tunnels);
      for (const [s0, s1] of c.tunnels) {
        assert.ok(near(s1 - s0, 9 * R), `${tag}: a tunnel nine radii long`);
        assert.ok(s0 > path.gate && s1 < path.length, `${tag}: on the way`);
      }
      assert.deepEqual(makeCourse(n, attempt), c, `${tag}: the same again`);
    }
  }
  assert.notDeepEqual(makeCourse(9, 2).colours, makeCourse(9, 3).colours, 'a re-roll is a different course');
  assert.notDeepEqual(makeCourse(9).colours, makeCourse(10).colours);
  const shapes = new Set();
  for (let n = 3; n <= 40; n++) shapes.add(makeCourse(n).shape);
  assert.ok(shapes.size >= 4, `later courses take other shapes: ${[...shapes]}`);
});

test('every level is proved by the computer gnome: par is in [spec par, most], and the stored solution clears it in par', () => {
  for (const n of PROVED) {
    const L = proved(n);
    const { par, most } = specFor(n);
    assert.ok(L.checked, `level ${n} checked`);
    assert.ok(L.par >= par && L.par <= most, `level ${n}: par ${L.par} in [${par}, ${most}]`);
    assert.ok(L.solution.length > 0);
    assert.equal(L.solution.length, L.par, `level ${n}: a solution of par shots`);
    assert.equal(faultOf(buildPath(L.shape, L.params)), null, `level ${n}: a path fit to play`);
    const G = replay(L, L.solution);
    assert.equal(G.over, 'cleared', `level ${n} cleared by its solution`);
    assert.equal(G.shots, L.par);
  }
});

test('the leisurely gnome, waiting a second after each shot, clears every level too: there is always time', () => {
  assert.ok(LEISURE > REACT);
  for (const n of PROVED) {
    const run = solve(proved(n), { react: LEISURE });
    assert.ok(run.cleared, `level ${n} cleared at leisure`);
    assert.ok(run.fired.every(([tick], k) => k === 0 || tick - run.fired[k - 1][0] > LEISURE), `level ${n}: a second between shots`);
  }
});

test('stars: three at par or under, two within half as many again, else one', () => {
  const L = { par: 10 };
  assert.equal(stars(L, 7), 3);
  assert.equal(stars(L, 10), 3);
  assert.equal(stars(L, 11), 2);
  assert.equal(stars(L, 15), 2);
  assert.equal(stars(L, 16), 1);
  assert.equal(stars({ par: 9 }, 14), 2, 'half as many again rounds up');
  assert.equal(stars({ par: 9 }, 15), 1);
});
