// Trial Bike: the course, the bike and the rules. No DOM, so the tests can
// ride it in Node, and so a computer rider can prove every course before a
// player sees it.
//
// The bike is one rigid body (frame plus rider) with two wheels fixed to it,
// seen from the side. Each wheel is a circle; where it sinks into the ground
// the tyre pushes back (a stiff spring with damping, which is also the
// suspension), and grips along the ground up to a friction limit. The rear
// wheel drives, both wheels brake, and the rider leans by applying a torque
// to the whole body: in the air that rotates the bike, on the ground it
// shifts weight between the wheels. The front lifts on hard acceleration by
// itself, because the drive pushes at the ground, below the centre of mass.
// Positions are metres, y up; the angle is the frame's pitch, positive nose
// up.
//
// A course is a height profile sampled every STEP metres, built from a seed
// so course n is the same everywhere, with checkpoint flags along it and a
// finish line at the end. The computer rider rides every course as it is
// generated; one it can't finish is re-rolled, and its time is par.
import { rng, seedFor } from '../../js/lib/random.js';

export const G = 9.81;
export const STEP = 0.1; // ground samples this far apart (m)
export const WHEEL = 0.34; // wheel radius (m)
export const BASE = 1.3; // wheelbase (m)
export const COM = 0.55; // centre of mass this far above the axles (m)
export const HEAD = [0.05, 1.22]; // the rider's helmet, from the centre of mass
export const MASS = 1;
export const INERTIA = MASS * 1.0; // kg m^2: the bike is long and the rider high
export const TYRE_K = 420; // tyre/suspension stiffness (N/m per unit mass)
export const TYRE_C = 22; // and damping
export const GRIP = 1.1; // friction coefficient: dirt tyres on dirt
export const DRIVE = 9; // rear-wheel push at full throttle (m/s^2)
export const BRAKE = 3.5; // each wheel's brake at full squeeze (m/s^2): about 0.7 g together, short of an endo
export const VMAX = 14; // the engine runs out of puff here (m/s, ~31 mph)
export const LEAN = 10; // rider's torque at full lean (rad/s^2)
export const AIR_LEAN = 2; // the lean counts for this much more in the air
// In the air, while the rider is leaning, the air slows a spin only a
// little (SPIN_DAMP). Once they let go, the bike rights itself: a spring
// toward level (rad/s^2 per radian, with damping), pulling the shorter way
// round -- so a half-hearted turn comes back down on its wheels, and a
// turn past upside down is carried on through to land. A flip is hold,
// then let go.
export const SPIN_DAMP = 0.7;
export const LEVEL = { spring: 4, damp: 4 };
// A landing is a crash when a wheel comes down on the ground this fast
// (m/s): the front wheel alone, pitched nose down into the ground (nose
// first), or either wheel at all. About a 2.5 m and a 6 m fall.
export const HARD = { nose: 7, flat: 11 };
export const NOSE_DOWN = (20 * Math.PI) / 180; // pitched this far below the ground's slope counts as nose first
export const FLIP = 0.75 * 2 * Math.PI; // turned this far in the air and come down: a flip
export const LANDED = (80 * Math.PI) / 180; // within this of the ground's slope at touchdown counts as on the wheels (either wheel first)
export const FLIP_BONUS = 2; // seconds off the clock per flip landed
export const BASE_SEED = 20261021;
export const DT = 1 / 240; // physics substep: stiff tyres need small steps

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ------------------------------------------------------------------ ground

export function heightAt(course, x) {
  const h = course.heights;
  const u = x / STEP;
  const i = Math.floor(u);
  if (i < 0) return h[0];
  if (i >= h.length - 1) return h[h.length - 1];
  const f = u - i;
  return h[i] * (1 - f) + h[i + 1] * f;
}

export function slopeAt(course, x) {
  return (heightAt(course, x + STEP) - heightAt(course, x - STEP)) / (2 * STEP);
}

// Where a wheel at (x, y) touches the ground, if it does: the deepest
// overlap with any ground segment under it, as { depth, nx, ny, px, py }
// (the normal points out of the ground, p is the contact point).
export function contactAt(course, x, y, radius = WHEEL) {
  const h = course.heights;
  const i0 = Math.max(0, Math.floor((x - radius) / STEP));
  const i1 = Math.min(h.length - 2, Math.ceil((x + radius) / STEP));
  let best = null;
  for (let i = i0; i <= i1; i++) {
    const ax = i * STEP;
    const ay = h[i];
    const bx = ax + STEP;
    const by = h[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    const depth = radius - d;
    if (depth <= 0 || (best && depth <= best.depth)) continue;
    // Normal: from the contact point to the wheel's centre, or straight up
    // along the segment's own normal when the centre is on the surface.
    let nx;
    let ny;
    if (d > 1e-6) {
      nx = (x - px) / d;
      ny = (y - py) / d;
    } else {
      const len = Math.hypot(dx, dy);
      nx = -dy / len;
      ny = dx / len;
    }
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    best = { depth, nx, ny, px, py };
  }
  return best;
}

// ------------------------------------------------------------------ course

// What course n asks of you. Everything grows with n: the length, how many
// obstacles there are and how big, and how often they come one on top of
// another. Every kind is in play by course 5 -- rolling hills and a small
// jump from the first course, then a log and a long climb, a drop-off, a
// ledge and a cliff, and a gap -- because the bike is the game, and the
// sooner you meet everything it can do, the better.
export function specFor(n) {
  const k = n - 1;
  return {
    length: Math.round(Math.min(240, 70 + 9 * k)),
    features: Math.min(18, 4 + Math.floor(k * 0.8)),
    hill: Math.min(3.0, 1.0 + 0.14 * k), // amplitude (m)
    roll: Math.min(2.5, 1 + 0.12 * k), // the lie of the land: a slow rise and fall under everything (m)
    jump: Math.min(3, 0.35 + 0.1 * k), // kicker height
    log: n >= 2 ? Math.min(0.55, 0.25 + 0.03 * (n - 2)) : 0, // log height
    drop: n >= 3 ? Math.min(2.4, 0.4 + 0.11 * (n - 3)) : 0, // drop-off height
    step: n >= 4 ? Math.min(0.58, 0.28 + 0.03 * (n - 4)) : 0, // ledge height
    gap: n >= 5 ? Math.min(2.8, 1.0 + 0.14 * (n - 5)) : 0, // gap width
    climb: n >= 2 ? Math.min(12, 4 + 0.6 * (n - 2)) : 0, // a long steep hill: its rise (m)
    cliff: n >= 4 ? Math.min(3.6, 2.4 + 0.12 * (n - 4)) : 0, // a sheer drop to flat ground (m)
    combo: n >= 3 ? Math.min(0.5, 0.1 + 0.04 * (n - 3)) : 0, // chance the next obstacle comes straight after
  };
}

// Every course from the third has a set piece: one big moment about two
// thirds of the way along, built from the ordinary obstacles at a larger
// size and packed close, with a flag just before it. Each is a list of
// [kind, size] (size as a multiple of the course's usual), and needs the
// kinds it's made of.
const SET_PIECES = {
  triple: { parts: [['jump', 1.2], ['jump', 1.2], ['jump', 1.2]], between: 1.5 }, // three kickers in a row: a rhythm section
  wall: { parts: [['climb', 1.5]], between: 0 }, // one long climb
  summit: { parts: [['ascent', 1], ['cliff', 'back']], between: 0 }, // a climb to a crest, and a cliff straight off it
  stairs: { parts: [['ledge', 0.85], ['ledge', 0.85], ['ledge', 0.85], ['cliff', 'back']], between: 6 }, // three ledges up, then down the lot
  canyon: { parts: [['gap', 1.3]], between: 0 }, // the big gap
};
const NEEDS = { ledge: 'step', ascent: 'climb' }; // which spec a composed kind draws on
const setPiecesFor = (spec) => Object.keys(SET_PIECES).filter((name) => SET_PIECES[name].parts.every(([kind]) => spec[NEEDS[kind] ?? kind]));
// Course n's set piece: courses take them in turn, and never the same one
// as the course before (which the turn alone can't promise as new ones
// unlock).
const setPieceFor = (n) => {
  if (n < 3) return null;
  const sets = setPiecesFor(specFor(n));
  if (!sets.length) return null;
  const name = sets[n % sets.length];
  return name === setPieceFor(n - 1) ? sets[(n + 1) % sets.length] : name;
};

// The kinds of obstacle course n is made of, in order: a string for an
// ordinary obstacle, or { kind, size, between } for part of the set piece
// (`between`: the gap to its next part, in metres). Whatever is new this course
// is always there, the rest are drawn from everything the course allows,
// and course 1 is hills with one small jump in the middle.
function kindsFor(n, spec, r) {
  const allowed = ['hill', 'hill', 'jump', 'jump'];
  if (spec.log) allowed.push('log');
  if (spec.drop) allowed.push('drop');
  if (spec.step) allowed.push('step');
  if (spec.gap) allowed.push('gap', 'gap');
  if (spec.climb) allowed.push('climb');
  if (spec.cliff) allowed.push('cliff');
  if (n === 1) return ['hill', 'jump', 'hill', 'hill'];
  const fresh = { 2: ['log', 'climb'], 3: ['drop'], 4: ['step', 'cliff'], 5: ['gap'] }[n] ?? [];
  const kinds = [];
  for (let i = 0; i < spec.features; i++) kinds.push(allowed[Math.floor(r() * allowed.length)]);
  const set = setPieceFor(n);
  if (set) {
    // The set piece goes in past the middle, with at least two ordinary
    // obstacles still to come after it, in place of one or two of them.
    const { parts, between } = SET_PIECES[set];
    const remove = kinds.length >= 8 ? 2 : kinds.length >= 6 ? 1 : 0;
    const at = Math.max(1, Math.min(Math.round(kinds.length * 0.6), kinds.length - 2 - remove));
    kinds.splice(at, remove, ...parts.map(([kind, size], k) => ({ kind, size, between: k < parts.length - 1 ? between : null })));
  }
  // What's new this course goes in an ordinary slot (never the first, never
  // the set piece), if the draw left it out.
  const plain = kinds.map((k, i) => (i > 0 && typeof k === 'string' ? i : -1)).filter((i) => i >= 0);
  for (const kind of fresh) {
    if (!kinds.includes(kind)) kinds[plain[Math.floor(r() * plain.length)]] = kind;
  }
  return kinds;
}

// Course n, attempt a: a flat start, obstacles in a random order picked from
// those n allows, a run-out and the finish. Checkpoint flags stand on flat
// ground every few obstacles. The height profile is built as a list of
// pieces, each a function of the distance into it.
export function makeCourse(n, attempt = 0) {
  const r = rng(seedFor(n * 16 + attempt, BASE_SEED));
  const spec = specFor(n);
  const kinds = kindsFor(n, spec, r);
  const features = [];
  const flags = [];
  let x = 12; // the start is flat
  let y = 0;
  const pieces = []; // { x0, x1, y0, f } -- height y0 + f(distance in)
  const flat = (len) => {
    pieces.push({ x0: x, x1: x + len, y0: y, f: () => 0 });
    x += len;
  };
  let landing = 0; // room the last obstacle needs to come down from
  let lastEnd = 0; // where the last obstacle ended
  let inSet = false; // building the set piece
  const piece = (kind, len, f, rise = 0, fall = 0, flight = 0) => {
    pieces.push({ x0: x, x1: x + len, y0: y, f });
    features.push(inSet ? { kind, x0: x, x1: x + len, set: true } : { kind, x0: x, x1: x + len });
    x += len;
    lastEnd = x;
    y += rise;
    landing = fall ? flight + 5 + 4 * Math.sqrt(fall) : 0;
  };
  flat(x);
  const perFlag = n < 4 ? 3 : 4;
  let setBase = null; // the ground's height where the set piece began
  for (let i = 0; i < kinds.length; i++) {
    const entry = kinds[i];
    const { kind, size, between } = typeof entry === 'string' ? { kind: entry } : entry;
    const s = size === 'back' ? 1 : size ?? 0.6 + 0.4 * r(); // this one's size, as a share of the spec
    // The set piece opens on calm ground with a flag, so a crash in it
    // starts you again right there.
    if (size !== undefined && setBase === null) {
      flat(8);
      flags.push(x - 1.5);
      setBase = y;
    }
    inSet = size !== undefined;
    switch (kind) {
      case 'hill': {
        // A rolling rise and fall, or a few of them.
        // (No steeper than about 35 degrees, with the lie of the land under
        // it: a hill is for climbing.)
        const waves = 1 + Math.floor(r() * 2);
        const amp = spec.hill * s;
        const len = Math.max(6 + 4 * r(), 5.6 * amp) * waves;
        piece('hill', len, (d) => amp * (1 - Math.cos((2 * Math.PI * waves * d) / len)) / 2);
        break;
      }
      case 'jump': {
        // A kicker: a ramp that steepens to its lip (about 30 degrees there,
        // so it throws the bike upward) and a sheer drop behind. Carry speed
        // and fly -- and turn, if you dare.
        const h = spec.jump * s;
        const up = h * 2.6;
        const land = 1 + 0.6 * r();
        piece('jump', up + land, (d) => (d < up ? h * (d / up) ** 1.5 : 0), 0, h, 6 + 1.3 * h);
        break;
      }
      case 'log': {
        // A fallen log: short and round, lift the front wheel over it.
        const h = spec.log * s;
        const w = 0.5 + 0.3 * r();
        piece('log', w + 0.6, (d) => (d < 0.3 || d > w + 0.3 ? 0 : h * Math.sqrt(Math.max(0, 1 - ((d - 0.3 - w / 2) / (w / 2)) ** 2))));
        break;
      }
      case 'step': {
        // A ledge up and, a little further on, back down.
        const h = spec.step * s;
        const top = 2.5 + 2 * r();
        piece('step', top, (d) => (d < 0.15 ? h * (d / 0.15) : h), h);
        piece('drop', 0.3, (d) => -h * smooth(d / 0.3), -h, h);
        break;
      }
      case 'drop': {
        // A drop-off: the ground falls away, land it.
        const h = spec.drop * s;
        piece('drop', 0.4, (d) => -h * smooth(d / 0.4), -h, h);
        break;
      }
      case 'climb': {
        // A long steep climb to a crest, then a gentler run back down: on
        // the gas all the way up, or it stalls.
        const h = spec.climb * s;
        const up = h * 2.9; // the smooth rise is steepest in the middle: 1.5 h / up, about 27 degrees, before the lie of the land
        const crest = 3 + 3 * r();
        const down = h * 3;
        piece('climb', up + crest + down, (d) => (d < up ? h * smooth(d / up) : d < up + crest ? h : h * (1 - smooth((d - up - crest) / down))));
        break;
      }
      case 'ledge': {
        // A ledge up that stays up (the stairs of a set piece).
        const h = spec.step * s;
        piece('step', 3 + r(), (d) => (d < 0.15 ? h * (d / 0.15) : h), h);
        break;
      }
      case 'ascent': {
        // The climb up to a crest, and no way down but what follows.
        const h = spec.climb * s;
        const up = h * 2.9;
        piece('climb', up + 3, (d) => (d < up ? h * smooth(d / up) : h), h);
        break;
      }
      case 'cliff': {
        // A cliff: a sheer drop to flat ground, to be landed on both wheels
        // -- or, closing a set piece, back down to where it started: as
        // much of that as can be fallen, then a slope for the rest.
        const h = size === 'back' ? Math.min(3.6, Math.max(1.5, y - setBase)) : spec.cliff * s;
        piece('cliff', 0.6, (d) => -h * smooth(d / 0.6), -h, h);
        const rest = size === 'back' ? y - setBase : 0;
        if (rest > 0.3) {
          flat(landing);
          piece('down', rest * 2.8, (d) => -rest * smooth(d / (rest * 2.8)), -rest);
        }
        break;
      }
      case 'gap': {
        // A gap in the ground: too deep to climb out of, so clear it -- which
        // takes speed, so there's a run-up.
        const w = Math.min(3.3, spec.gap * s);
        flat(Math.max(0, 12 + 3 * w - (x - lastEnd)));
        const pit = 2 + w; // depth: a fall is a fall
        piece('gap', w + 0.8, (d) => (d < 0.4 ? -pit * smooth(d / 0.2) : d > w + 0.4 ? -pit * smooth((w + 0.8 - d) / 0.2) : -pit), 0, 0.5);
        break;
      }
    }
    // Level ground between obstacles: room to land and settle after a
    // jump or drop, and longer early on, when there's more to learn than
    // to do. Sometimes (more often as courses go on) the next obstacle
    // comes straight after instead -- a drop at the top of a climb, a
    // cliff off the end of a jump -- but never a wall (a log or a ledge),
    // which needs a clean approach, nor a gap, which needs its run-up, nor
    // anything but a further fall where a jump or a drop comes down.
    // Inside a set piece the parts follow straight on, as designed.
    const next = kinds[i + 1];
    const nextKind = typeof next === 'string' ? next : next?.kind;
    const wall = nextKind === 'log' || nextKind === 'step' || nextKind === 'ledge';
    const falling = nextKind === 'drop' || nextKind === 'cliff';
    const combo = next && nextKind !== 'gap' && !wall && (!landing || falling) && r() < spec.combo;
    if (between !== null && between !== undefined) flat(between + 0.5 * r());
    else flat(combo ? Math.max(1.5, landing ? landing * 0.6 : 0) + r() : Math.max(landing, Math.max(4, 9 - 0.4 * (n - 1))) + 3 * r());
    if ((i + 1) % perFlag === 0 && i < kinds.length - 1 && !combo && size === undefined) flags.push(x - 1.5);
  }
  flat(10);
  const finish = x - 3;
  const length = x + 6;
  // The lie of the land: a slow rise and fall under the whole course (two
  // long waves, fixed by the seed), so the obstacles sit on real country
  // rather than a table top. The start and finish stand on it like
  // everything else.
  const w1 = 60 + 30 * r();
  const w2 = 120 + 60 * r();
  const ph1 = r() * Math.PI * 2;
  const ph2 = r() * Math.PI * 2;
  const roll = (gx) => spec.roll * (0.6 * Math.sin((gx / w1) * Math.PI * 2 + ph1) + 0.4 * Math.sin((gx / w2) * Math.PI * 2 + ph2));
  const heights = [];
  let p = 0;
  for (let i = 0; i * STEP <= length + STEP; i++) {
    const gx = i * STEP;
    while (p < pieces.length - 1 && gx >= pieces[p].x1) p++;
    const pc = pieces[p];
    // (To the centimetre: courses are kept on the device, and the sixth
    // decimal of a hill is neither ridden nor seen.)
    heights.push(Math.round((roll(gx) + pc.y0 + pc.f(clamp(gx - pc.x0, 0, pc.x1 - pc.x0))) * 100) / 100);
  }
  const minY = Math.min(...heights);
  const maxY = Math.max(...heights);
  return { n, attempt, length, heights, features, flags, finish, minY, maxY, start: 4 };
}

// ------------------------------------------------------------------ bike

// A bike standing on the ground at x (the start, or a checkpoint flag).
export function newBike(course, x = course.start) {
  const slope = Math.atan(slopeAt(course, x));
  const B = {
    x, y: 0, angle: slope, vx: 0, vy: 0, omega: 0, t: 0,
    spin: 0, // rear wheel's rotation, for drawing (rad)
    flag: -1, // the last checkpoint passed
    rear: null, front: null, // ground contacts this moment
    crashed: false, finished: false,
    stall: 0, // seconds standing still
    hitRear: 0, hitFront: 0, noseFirst: false, impact: 0, // this step's landings
    air: 0, // how far the bike has turned since its wheels left the ground
    trick: null, // a flip landed and not yet celebrated: { flips, back }
    pending: null, // a flip whose landing this step is still judging
  };
  const [rx] = wheelAt(B, -BASE / 2);
  const [fx] = wheelAt(B, BASE / 2);
  B.y = Math.max(heightAt(course, rx), heightAt(course, fx)) + WHEEL + COM * Math.cos(slope) - 0.01;
  B.flag = course.flags.findIndex((f) => f > x) - 1;
  if (B.flag < -1) B.flag = course.flags.length - 1;
  return B;
}

// A point fixed to the frame, from the centre of mass, in the world.
function toWorld(B, lx, ly) {
  const c = Math.cos(B.angle);
  const s = Math.sin(B.angle);
  return [B.x + lx * c - ly * s, B.y + lx * s + ly * c];
}

function wheelAt(B, along) {
  return toWorld(B, along, -COM);
}

// Velocity of a point on the frame at world offset (rx, ry) from the centre.
function velocityAt(B, rx, ry) {
  return [B.vx - B.omega * ry, B.vy + B.omega * rx];
}

// A wrecked bike lies on whatever touches: besides the wheels, these points
// of the frame (from the centre of mass) meet the ground like small soft
// wheels, so it comes to rest on its side or its bars instead of standing
// on the rider's helmet.
const WRECK = [[0, 0.1, 0.4], [0.5, 0.35, 0.2], [-0.4, 0.3, 0.2]]; // [x, y, radius]

// One wheel's forces on the frame this substep, as [fx, fy, torque], and
// the contact for drawing. input.gas drives the rear; brake and lean are
// shared by both. `at` is [x, y, radius] on the frame instead of a wheel.
function wheelForces(course, B, along, input, drives, at = null) {
  const [wx, wy] = at ? toWorld(B, at[0], at[1]) : wheelAt(B, along);
  const c = contactAt(course, wx, wy, at ? at[2] : WHEEL);
  if (!c) return null;
  const rx = wx - B.x;
  const ry = wy - B.y;
  const [vx, vy] = velocityAt(B, rx, ry);
  const vn = vx * c.nx + vy * c.ny;
  // Along the ground, forwards: the normal turned a quarter turn clockwise.
  const tx = c.ny;
  const ty = -c.nx;
  const vt = vx * tx + vy * ty;
  const normal = Math.max(0, TYRE_K * c.depth - TYRE_C * vn);
  const limit = GRIP * normal;
  let push = 0;
  if (drives && input.gas) push += DRIVE * Math.max(0, 1 - Math.max(0, vt) / VMAX);
  if (input.brake) push -= clamp(vt * 60, -BRAKE, BRAKE);
  push -= vt * 0.04; // rolling resistance
  const tangent = clamp(push, -limit, limit);
  const fx = c.nx * normal + tx * tangent;
  const fy = c.ny * normal + ty * tangent;
  return { fx, fy, torque: rx * fy - ry * fx, contact: { ...c, slip: Math.abs(push) > limit, vt, vy } };
}

// Advance the bike by dt. input: { gas, brake, lean } -- gas and brake
// booleans, lean from -1 (forward, nose down) to 1 (back, nose up).
// Returns null while riding, or an outcome when the ride ends:
// { kind: 'finished', time } or { kind: 'crash', reason }. A crashed bike
// takes no input but keeps tumbling, so the fall can be watched. A flip
// landed (a full turn in the air, nose over tail either way) is left in
// B.trick for the caller to celebrate and clear; it's worth FLIP_BONUS
// seconds.
export function step(course, B, input, dt) {
  if (B.finished) return null;
  if (B.crashed) input = {};
  const lean = clamp(input.lean ?? 0, -1, 1);
  const steps = Math.max(1, Math.round(dt / DT));
  const h = dt / steps;
  for (let k = 0; k < steps; k++) {
    const vy0 = B.vy; // the fall before this substep's tyres start to take it
    const rear = wheelForces(course, B, -BASE / 2, input, true);
    const front = wheelForces(course, B, BASE / 2, input, false);
    let fx = 0;
    let fy = -G * MASS;
    // The rider's lean: on the ground it shifts weight between the wheels,
    // in the air it turns the whole bike -- and harder, since there's
    // nothing else to push against and a flip has to fit in a jump.
    const airborne = !rear && !front;
    let torque = lean * LEAN * (airborne ? AIR_LEAN : 1) * INERTIA;
    const bodies = B.crashed ? WRECK.map((p) => wheelForces(course, B, 0, input, false, p)) : [];
    for (const w of [rear, front, ...bodies]) {
      if (!w) continue;
      fx += w.fx;
      fy += w.fy;
      torque += w.torque;
    }
    if (airborne) {
      const leaning = Math.abs(lean) > 0.3;
      if (leaning) torque -= B.omega * SPIN_DAMP * INERTIA;
      else torque -= (Math.atan2(Math.sin(B.angle), Math.cos(B.angle)) * LEVEL.spring + B.omega * LEVEL.damp) * INERTIA;
    }
    // A wreck scrubs off its spin and speed quickly.
    if (B.crashed && bodies.some(Boolean)) {
      B.omega *= Math.exp(-3 * h);
      B.vx *= Math.exp(-2 * h);
    }
    B.vx += (fx / MASS) * h;
    B.vy += (fy / MASS) * h;
    B.omega += (torque / INERTIA) * h;
    B.x += B.vx * h;
    B.y += B.vy * h;
    B.angle += B.omega * h;
    B.t += h;
    // A wheel meeting the ground: how fast the bike came down on it. (Ground,
    // not the side of something: running into a wall is a wall, not a
    // landing. And the bike's fall, not the wheel's: a spinning bike's wheel
    // is moving much faster than the bike is.)
    const hit = (w, was) => (w && !was && w.contact.ny > 0.8 ? Math.max(0, -vy0) : 0);
    B.hitRear = Math.max(B.hitRear ?? 0, hit(rear, B.rear));
    B.hitFront = Math.max(B.hitFront ?? 0, hit(front, B.front));
    if (hit(front, B.front) && !rear && B.angle < Math.atan(slopeAt(course, B.x)) - NOSE_DOWN) B.noseFirst = true;
    B.rear = rear?.contact ?? null;
    B.front = front?.contact ?? null;
    B.spin += ((rear ? rear.contact.vt : B.vx) / WHEEL) * h;
    // Turning in the air: three quarters of a turn or more by the time a
    // wheel touches is a flip -- credited below, once the landing has been
    // judged -- as long as the bike comes down on its wheels, either one
    // first; a turn that ends on the rear wheel pointing straight up is a
    // loop still in progress.
    const down = !!(rear || front);
    if (down && Math.abs(B.air) >= FLIP && Math.abs(Math.atan2(Math.sin(B.angle), Math.cos(B.angle)) - Math.atan(slopeAt(course, B.x))) < LANDED) {
      B.pending = { flips: Math.round(Math.abs(B.air) / (2 * Math.PI)), back: B.air > 0 };
    }
    B.air = down ? 0 : B.air + B.omega * h;
  }
  B.gas = !!input.gas;
  B.brake = !!input.brake;
  B.lean = lean;
  // The walls of the world.
  if (B.x < WHEEL) {
    B.x = WHEEL;
    B.vx = Math.abs(B.vx) * 0.2;
  }
  if (B.crashed) return null;
  // Landings: too hard, or nose first too hard, and the rider is off.
  const { hitRear, hitFront, noseFirst } = B;
  B.impact = Math.max(hitRear, hitFront); // for the view: dust and a thump
  B.hitRear = B.hitFront = 0;
  B.noseFirst = false;
  if (B.impact > HARD.flat) return crash(B, 'Hard landing');
  if (noseFirst && hitFront > HARD.nose) return crash(B, 'Nose first');
  if (B.pending) {
    B.trick = B.pending;
    B.pending = null;
  }
  // Standing still (against a wall, or balanced on the back wheel).
  B.stall = grounded(B) && Math.abs(B.vx) < 0.25 ? (B.stall ?? 0) + dt : 0;
  while (B.flag + 1 < course.flags.length && B.x > course.flags[B.flag + 1]) B.flag++;
  // The helmet touching the ground is a crash; so is falling out of the world.
  if (B.y < course.minY - 4) return crash(B, 'Fell');
  const [hx, hy] = toWorld(B, HEAD[0], HEAD[1]);
  if (hy < heightAt(course, hx) || contactAt(course, hx, hy, 0.18)) return crash(B, 'Over the handlebars');
  if (B.x - BASE / 2 > course.finish) {
    B.finished = true;
    return { kind: 'finished', time: B.t };
  }
  return null;
}

function crash(B, reason) {
  B.crashed = true;
  B.pending = null; // (a flip that ends in a crash isn't landed)
  return { kind: 'crash', reason };
}

export function grounded(B) {
  return !!(B.rear || B.front);
}

// ------------------------------------------------------------------ rider

// What the ground does in front of the bike, read forwards from the rear
// wheel: the first wall (a rise too sheer to roll over: a log or a ledge),
// the first edge (ground falling away: a drop-off, a jump's lip or a gap),
// and if that edge is a gap, how wide it is. Distances are metres ahead of
// the rear wheel, so an edge the front wheel is already over still counts.
// `pit` says the bike is out over a gap (the ground under the rear wheel is
// far below the last solid ground).
export function readAhead(course, B) {
  const [rx] = wheelAt(B, -BASE / 2);
  const at = (d) => heightAt(course, rx + d);
  let wall = Infinity;
  let wallH = 0; // how high the wall is
  let edge = Infinity;
  let fall = 0; // how far the ground drops past the edge
  let gap = 0;
  for (let d = STEP; d < 16; d += STEP) {
    const dh = at(d) - at(d - STEP);
    if (wall === Infinity && dh > 0.11) {
      wall = d - STEP;
      for (let e = d; e < d + 1.2; e += STEP) wallH = Math.max(wallH, at(e) - at(wall));
    }
    if (edge === Infinity && dh < -0.11) {
      edge = d - STEP;
      let e = d;
      while (e < d + 1.5 && at(e) - at(e - STEP) < -0.02) e += STEP;
      fall = at(edge) - at(e);
      if (at(e) < at(edge) - 1.5) {
        // A pit: find where the far side comes back up to the lip.
        for (; e < edge + 12; e += STEP) {
          if (at(e) >= at(edge) - 0.3) {
            gap = e - edge;
            break;
          }
        }
        if (!gap) gap = 12;
      }
    }
    if (wall !== Infinity && edge !== Infinity) break;
  }
  const pit = B.y - COM - WHEEL - at(0) > 1.5;
  return { wall, wallH, edge, fall, gap, pit };
}

// Where the bike comes down if it does nothing from here, by flying its
// current motion forwards: [x, slope of the ground there].
function landing(course, B) {
  let lx = B.x;
  let ly = B.y;
  let vy = B.vy;
  for (let t = 0; t < 3; t += 0.05) {
    lx += B.vx * 0.05;
    vy -= G * 0.05;
    ly += vy * 0.05;
    if (ly - COM - WHEEL <= heightAt(course, lx)) break;
  }
  return [lx, Math.atan(slopeAt(course, lx))];
}

// A competent rider that gets round a course: it reads the ground ahead
// and keeps the bike's pitch to where the ground will be, lifts the front
// over logs and ledges, carries the speed a gap needs and eases off
// everywhere else. Used to check every course can be done, and its time
// is par. `pace` is how hard it rides, 0..1. Returns the input for this
// moment.
export function rider(course, B, pace = 0.5) {
  const read = readAhead(course, B);
  const inAir = !grounded(B);
  const speed = B.vx;
  const cruise = 5 + 7 * pace;
  const wall = read.wall - BASE; // in front of the front wheel
  const slope = Math.atan(slopeAt(course, B.x));
  let gas = speed < cruise || slope > 0.25; // open it up on a climb
  let brake = false;
  let target = slope; // pitch to hold
  if (read.pit) {
    // Out over a gap: nose up a little so the front wheel finds the far
    // lip, throttle open to drive up and over it.
    target = 0.2;
    gas = true;
  } else if (inAir) {
    // Pitch to the ground where the bike will come down, nose-up a little
    // so the rear wheel lands first (never the front, pitched down).
    target = landing(course, B)[1] + 0.22;
    gas = speed < cruise + 2;
  } else if (read.gap && read.edge < BASE + 2.5) {
    // Launching: full throttle, nose up, never the brake.
    gas = true;
    target += 0.3;
  } else if (read.gap && read.edge < 18) {
    // Build the speed the gap needs (flat flight with the nose held up, so
    // the front wheel can drop a little and still find the far lip), with
    // some in hand.
    const need = (read.gap + 1) / Math.sqrt((2 * 0.6) / G);
    gas = speed < Math.min(VMAX - 0.5, Math.max(cruise, need * 1.15));
  } else if (wall < read.edge && wall < 1.2 + 0.25 * speed) {
    // Wheelie over the log or ledge, high enough that the front wheel
    // lands on top, with the throttle on to carry it.
    gas = true;
    target = Math.asin(Math.min(1, (read.wallH + 0.15) / BASE)) + 0.2;
  } else if (wall < read.edge && wall < 6) {
    // Come at a wall steadily: fast enough to carry over, slow enough to
    // get the front wheel up in time.
    gas = speed < 5;
    brake = speed > 6.5;
  } else if (read.edge < BASE + 1.5 + 0.25 * speed) {
    // Off a drop or a lip: nose-up so the rear lands first -- the more so
    // the further the fall, since the front wheel going first pitches the
    // bike down.
    target += 0.15 + Math.min(0.25, 0.08 * read.fall);
    gas = speed < cruise;
  }
  // Hold the pitch: a spring to the target, damped by the spin.
  const lean = clamp((target - B.angle) * 3.2 - B.omega * 0.55, -1, 1);
  // Looping over backwards on the ground: ease off so the front comes down.
  if (!inAir && B.angle > 1.0) gas = false;
  return { gas, brake, lean };
}

// Ride the course with the computer rider from the start. Returns the
// outcome with the time, plus the path as [x, y, angle] every TRACK_DT.
export const TRACK_DT = 0.1;
export function simulate(course, pace = 0.5, maxTime = 180) {
  const B = newBike(course);
  const dt = 1 / 60;
  const path = [[B.x, B.y, B.angle]];
  let res = null;
  for (let k = 1; !res && k * dt < maxTime; k++) {
    res = step(course, B, rider(course, B, pace), dt);
    if (k % Math.round(TRACK_DT / dt) === 0) path.push([B.x, B.y, B.angle]);
    if (B.stall > 3) res = { kind: 'stalled' };
  }
  if (!res) res = { kind: 'timeout' };
  return { ...res, time: B.t, x: B.x, path };
}

// The rider's best over a few paces: the fastest finish wins. That ride's
// time is par.
export function bestRide(course) {
  let best = null;
  for (const pace of [0.35, 0.6, 0.85]) {
    const run = simulate(course, pace);
    if (run.kind === 'finished' && (!best || run.time < best.time)) best = { ...run, pace };
  }
  return best;
}

// Course n as played: one the rider has actually finished (re-rolled until
// it does), with par set by its time (`ride`, to the tenth), `pace` the
// pace that set it (for the demo) and `ghost` that ride's path. `checked`
// says the rider managed it.
export function makeLevel(n) {
  let course;
  let run = null;
  for (let attempt = 0; attempt < 12 && !run; attempt++) {
    course = makeCourse(n, attempt);
    run = bestRide(course);
  }
  // Par is the rider's time rounded up to the second. If no attempt could
  // be finished (there's room for 16 in the seed; 12 are tried), the course
  // ships anyway with a guessed par, no ghost, and `checked` false for the
  // screen to say so.
  const par = run ? Math.ceil(run.time) : Math.ceil(course.length / 4);
  // The par ride itself, every TRACK_DT, for the ghost that can race you,
  // and its exact time.
  const ghost = run ? run.path.map((p) => p.map((v) => Math.round(v * 100) / 100)) : [];
  return { ...course, par, ride: run ? Math.round(run.time * 10) / 10 : par, pace: run?.pace ?? 0.5, checked: !!run, ghost };
}

// Stars for a finish: against par, and the number of crashes along the way.
export function stars(level, time, crashes) {
  if (crashes === 0 && time <= level.par) return 3;
  if (crashes <= 1 && time <= level.par * 1.5) return 2;
  return 1;
}
