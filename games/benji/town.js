// Benji's Town: the town and its jobs. (No DOM: tested in Node.)
//
// The town is a 9 x 9 grid of tiles: three streets each way, and between
// them blocks of places -- houses, the post office, the dump, the builders'
// yard, the park and lots to build on. Every place has a door on a street.
// Helpers (the garbage truck, the postal worker's van, a dog walker, the cement mixer)
// drive or walk along the streets to do the level's jobs.

export const SIZE = 9;
const ROADS = [1, 4, 7]; // the rows and columns that are streets

export const isRoad = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && (ROADS.includes(x) || ROADS.includes(y));

// The places, by tile, each with its door: the street tile next to it.
const PLACES = [
  { id: 'post', kind: 'post', x: 2, y: 0 },
  { id: 'dump', kind: 'dump', x: 8, y: 8 },
  { id: 'yard', kind: 'yard', x: 0, y: 8 },
  { id: 'park', kind: 'park', x: 5, y: 5, w: 2, h: 2 },
  { id: 'h1', kind: 'home', x: 0, y: 0, color: '#ff6b6b' },
  { id: 'h2', kind: 'home', x: 5, y: 0, color: '#ffd166' },
  { id: 'h3', kind: 'home', x: 8, y: 2, color: '#4cc9f0' },
  { id: 'h4', kind: 'home', x: 2, y: 3, color: '#b388ff' },
  { id: 'h5', kind: 'home', x: 3, y: 2, color: '#06d6a0' },
  { id: 'h6', kind: 'home', x: 0, y: 5, color: '#f78c6b' },
  { id: 'h7', kind: 'home', x: 3, y: 8, color: '#ff8fab' },
  { id: 'h8', kind: 'home', x: 8, y: 5, color: '#ffd166' },
  { id: 'shop', kind: 'shop', x: 6, y: 2 },
  { id: 'cafe', kind: 'cafe', x: 2, y: 6 },
  // Lots to build on: each becomes a house, in turn, as the town grows.
  { id: 'lot1', kind: 'lot', x: 3, y: 5, color: '#90be6d' },
  { id: 'lot2', kind: 'lot', x: 5, y: 8, color: '#f9c74f' },
  { id: 'lot3', kind: 'lot', x: 8, y: 0, color: '#577590' },
  { id: 'lot4', kind: 'lot', x: 6, y: 3, color: '#f3722c' },
];
export const LOTS = PLACES.filter((p) => p.kind === 'lot').map((p) => p.id);

// The street tile beside a place (its door).
function doorOf(p) {
  const w = p.w || 1;
  const h = p.h || 1;
  for (let x = p.x - 1; x <= p.x + w; x++) {
    for (let y = p.y - 1; y <= p.y + h; y++) {
      const side = (x === p.x - 1 || x === p.x + w) !== (y === p.y - 1 || y === p.y + h);
      if (side && isRoad(x, y)) return { x, y };
    }
  }
  throw new Error(`no street beside ${p.id}`);
}

// The shortest way along the streets from one street tile to another: the
// tiles in order (both ends included).
export function route(from, to) {
  const key = (t) => t.y * SIZE + t.x;
  const prev = new Map([[key(from), null]]);
  const queue = [from];
  while (queue.length) {
    const t = queue.shift();
    if (t.x === to.x && t.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (!isRoad(n.x, n.y) || prev.has(key(n))) continue;
      prev.set(key(n), t);
      queue.push(n);
    }
  }
  const path = [];
  for (let t = to; t; t = prev.get(key(t))) path.unshift(t);
  return path;
}

// The street tile nearest a point (in tiles).
export function nearestRoad(px, py) {
  let best = null;
  let bd = Infinity;
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (!isRoad(x, y)) continue;
      const d = (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2;
      if (d < bd) [bd, best] = [d, { x, y }];
    }
  }
  return best;
}

// ------------------------------------------------------------------ levels

// Each level: some jobs, and whether you tap the helpers (they go by
// themselves) or drive them yourself, from the driver's seat.
//   garbage: bins out at that many houses -- collect them, then to the dump
//   mail:    that many letters and packages to deliver (every other one a
//            package)
//   dog:     that many dog walks to the park and home
//   build:   that many houses to build (three trips each)
const LEVELS = [
  { garbage: 2 },
  { mail: 3 },
  { dog: 1, garbage: 2 },
  { build: 1 },
  { garbage: 3, mail: 2, dog: 1 },
  { garbage: 2, drive: true },
  { mail: 3, drive: true },
  { dog: 1, build: 1, drive: true },
  { garbage: 3, mail: 3, drive: true },
  { garbage: 2, mail: 2, dog: 1, build: 1, drive: true },
];
export const levelCount = () => Infinity;
export function levelPlan(n) {
  if (n <= LEVELS.length) return LEVELS[n - 1];
  // After those, a bit of everything, driving -- and on odd levels tapping.
  const k = n - LEVELS.length;
  return { garbage: 2 + (k % 2), mail: 2 + ((k >> 1) % 2), dog: 1, build: k % 3 === 0 ? 1 : 0, drive: k % 2 === 0 };
}

// Houses built before level n (the town grows as you build).
export function builtBefore(n) {
  let b = 0;
  for (let k = 1; k < n; k++) b += levelPlan(k).build || 0;
  return Math.min(LOTS.length, b);
}

// A little pseudo-random sequence, the same every time for a level.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// The town for level n: its places (lots already built are homes), the
// helpers and the jobs.
export function makeTown(n) {
  const plan = levelPlan(n);
  const r = rng(n * 7919 + 17);
  const built = builtBefore(n);
  const places = PLACES.map((p) => {
    const q = { ...p, door: doorOf(p) };
    if (p.kind === 'lot' && LOTS.indexOf(p.id) < built) q.kind = 'home';
    return q;
  });
  const by = (id) => places.find((p) => p.id === id);
  const homes = places.filter((p) => p.kind === 'home');
  const pick = (list, k) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, k);
  };
  const helpers = [];
  const jobs = [];
  if (plan.garbage) {
    helpers.push({ id: 'garbage', kind: 'garbage', at: by('dump').door, home: 'dump' });
    for (const h of pick(homes, plan.garbage)) jobs.push({ helper: 'garbage', kind: 'bin', place: h.id });
    jobs.push({ helper: 'garbage', kind: 'dump', place: 'dump', last: true });
  }
  if (plan.mail) {
    helpers.push({ id: 'mail', kind: 'mail', at: by('post').door, home: 'post' });
    pick(homes, plan.mail).forEach((h, k) => jobs.push({ helper: 'mail', kind: k % 2 ? 'parcel' : 'letter', place: h.id }));
  }
  if (plan.dog) {
    for (let k = 0; k < plan.dog; k++) {
      const h = pick(homes, 1)[0];
      const id = `dog${k}`;
      helpers.push({ id, kind: 'walker', at: h.door, home: h.id, color: h.color });
      jobs.push({ helper: id, kind: 'walk', place: 'park' }, { helper: id, kind: 'home', place: h.id, last: true });
    }
  }
  if (plan.build) {
    helpers.push({ id: 'mixer', kind: 'mixer', at: by('yard').door, home: 'yard' });
    for (let k = 0; k < plan.build; k++) {
      const lot = LOTS[built + k];
      if (!lot) break;
      for (let s = 1; s <= 3; s++) jobs.push({ helper: 'mixer', kind: 'build', place: lot, stage: s });
    }
  }
  jobs.forEach((j, i) => (j.i = i));
  return { n, plan, drive: !!plan.drive, places, helpers, jobs };
}

// A helper's next job: the first not done (in order; bins nearest first is
// the player's choice, so any bin will do -- see jobAt).
export const nextJob = (town, helper, done) => town.jobs.find((j) => j.helper === helper.id && !done.has(j.i)
  && !(j.last && town.jobs.some((o) => o.helper === helper.id && !o.last && !done.has(o.i))));

// The job a helper can do at a street tile, if any: one of its own, not
// done, whose place's door is that tile (a "last" job only once the rest
// are done; building stages in order).
export function jobAt(town, helper, tile, done) {
  const mine = town.jobs.filter((j) => j.helper === helper.id && !done.has(j.i));
  const rest = mine.filter((j) => !j.last);
  for (const j of mine) {
    if (j.last && rest.length) continue;
    if (j.kind === 'build' && mine.some((o) => o.kind === 'build' && o.place === j.place && o.stage < j.stage)) continue;
    if (j.kind === 'home' && mine.some((o) => o.kind === 'walk')) continue;
    const door = town.places.find((p) => p.id === j.place).door;
    if (door.x === tile.x && door.y === tile.y) return j;
  }
  return null;
}
