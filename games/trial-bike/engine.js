// Trial Bike: the course, the bike and the rules. No DOM, so the tests can
// ride it in Node, and so a computer rider can prove every course before a
// player sees it.
//
// The bike is one rigid body (frame plus rider) with two wheels fixed to it,
// seen from the side. Each wheel is a circle; where it sinks into the ground
// the tire pushes back (a stiff spring with damping, which is also the
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
export const HEAD = [0.05, 1.45]; // the rider's helmet, from the centre of mass
export const MASS = 1;
export const INERTIA = MASS * 0.9; // kg m^2: the bike is long and the rider high
export const TIRE_K = 420; // tire/suspension stiffness (N/m per unit mass)
export const TIRE_C = 22; // and damping
export const GRIP = 1.1; // friction coefficient: dirt tires on dirt
export const DRIVE = 10; // rear-wheel push at full throttle (m/s^2)
export const BRAKE = 3.5; // each wheel's brake at full squeeze (m/s^2): about 0.7 g together, short of an endo
export const VMAX = 14; // the engine runs out of puff here (m/s, ~31 mph)
export const LEAN = 10; // rider's torque at full lean (rad/s^2)
export const SPIN_DAMP = 1.2; // the air slows a tumbling bike (per second)
export const BASE_SEED = 20261021;
export const DT = 1 / 240; // physics substep: stiff tires need small steps

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
// obstacles there are and how big, and which kinds appear at all -- rolling
// hills first, then jumps, logs, steps up and down, and gaps to clear.
export function specFor(n) {
  const k = n - 1;
  return {
    length: Math.round(Math.min(240, 70 + 9 * k)),
    features: Math.min(18, 3 + Math.floor(k * 0.8)),
    hill: Math.min(2.6, 0.5 + 0.12 * k), // amplitude (m)
    jump: n >= 3 ? Math.min(1.6, 0.4 + 0.08 * (n - 3)) : 0, // ramp height
    log: n >= 5 ? Math.min(0.55, 0.25 + 0.03 * (n - 5)) : 0, // log height
    step: n >= 8 ? Math.min(0.58, 0.3 + 0.035 * (n - 8)) : 0, // ledge height
    gap: n >= 11 ? Math.min(2.8, 1.2 + 0.16 * (n - 11)) : 0, // gap width
    drop: n >= 7 ? Math.min(2.4, 0.5 + 0.12 * (n - 7)) : 0, // drop-off height
  };
}

// Course n, attempt a: a flat start, obstacles in a random order picked from
// those n allows, a run-out and the finish. Checkpoint flags stand on flat
// ground every few obstacles. The height profile is built as a list of
// pieces, each a function of the distance into it.
export function makeCourse(n, attempt = 0) {
  const r = rng(seedFor(n * 16 + attempt, BASE_SEED));
  const spec = specFor(n);
  const kinds = ['hill', 'hill'];
  if (spec.jump) kinds.push('jump', 'jump');
  if (spec.log) kinds.push('log');
  if (spec.drop) kinds.push('drop');
  if (spec.step) kinds.push('step');
  if (spec.gap) kinds.push('gap', 'gap');
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
  const piece = (kind, len, f, rise = 0, fall = 0) => {
    pieces.push({ x0: x, x1: x + len, y0: y, f });
    features.push({ kind, x0: x, x1: x + len });
    x += len;
    lastEnd = x;
    y += rise;
    landing = fall ? 5 + 4 * Math.sqrt(fall) : 0;
  };
  flat(x);
  const perFlag = n < 4 ? 3 : 4;
  for (let i = 0; i < spec.features; i++) {
    const kind = kinds[Math.floor(r() * kinds.length)];
    const s = 0.6 + 0.4 * r(); // this one's size, as a share of the spec
    switch (kind) {
      case 'hill': {
        // A rolling rise and fall, or a few of them.
        const waves = 1 + Math.floor(r() * 2);
        const len = (8 + 6 * r()) * waves;
        const amp = spec.hill * s;
        piece('hill', len, (d) => amp * (1 - Math.cos((2 * Math.PI * waves * d) / len)) / 2);
        break;
      }
      case 'jump': {
        // A ramp up to a lip and a sheer drop: carry speed and fly.
        const h = spec.jump * s;
        const up = h * 2.6;
        const land = 1 + 0.6 * r();
        piece('jump', up + land, (d) => (d < up ? h * smooth(d / up) : 0), 0, h);
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
      case 'gap': {
        // A gap in the ground: too deep to climb out of, so clear it -- which
        // takes speed, so there's a run-up.
        const w = spec.gap * s;
        flat(Math.max(0, 12 + 3 * w - (x - lastEnd)));
        const pit = 2 + w; // depth: a fall is a fall
        piece('gap', w + 0.8, (d) => (d < 0.4 ? -pit * smooth(d / 0.2) : d > w + 0.4 ? -pit * smooth((w + 0.8 - d) / 0.2) : -pit), 0, 0.5);
        break;
      }
    }
    // Level ground between obstacles: room to land and settle after a
    // jump or drop, and longer early on, when there's more to learn than
    // to do.
    flat(Math.max(landing, Math.max(4, 9 - 0.4 * (n - 1))) + 3 * r());
    if ((i + 1) % perFlag === 0 && i < spec.features - 1) flags.push(x - 1.5);
  }
  flat(10);
  const finish = x - 3;
  const length = x + 6;
  const heights = [];
  let p = 0;
  for (let i = 0; i * STEP <= length + STEP; i++) {
    const gx = i * STEP;
    while (p < pieces.length - 1 && gx >= pieces[p].x1) p++;
    const pc = pieces[p];
    heights.push(pc.y0 + pc.f(clamp(gx - pc.x0, 0, pc.x1 - pc.x0)));
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

// One wheel's forces on the frame this substep, as [fx, fy, torque], and
// the contact for drawing. input.gas drives the rear; brake and lean are
// shared by both.
function wheelForces(course, B, along, input, drives) {
  const [wx, wy] = wheelAt(B, along);
  const c = contactAt(course, wx, wy);
  if (!c) return null;
  const rx = wx - B.x;
  const ry = wy - B.y;
  const [vx, vy] = velocityAt(B, rx, ry);
  const vn = vx * c.nx + vy * c.ny;
  // Along the ground, forwards: the normal turned a quarter turn clockwise.
  const tx = c.ny;
  const ty = -c.nx;
  const vt = vx * tx + vy * ty;
  const normal = Math.max(0, TIRE_K * c.depth - TIRE_C * vn);
  const limit = GRIP * normal;
  let push = 0;
  if (drives && input.gas) push += DRIVE * Math.max(0, 1 - Math.max(0, vt) / VMAX);
  if (input.brake) push -= clamp(vt * 60, -BRAKE, BRAKE);
  push -= vt * 0.04; // rolling resistance
  const tangent = clamp(push, -limit, limit);
  const fx = c.nx * normal + tx * tangent;
  const fy = c.ny * normal + ty * tangent;
  return { fx, fy, torque: rx * fy - ry * fx, contact: { ...c, slip: Math.abs(push) > limit, vt } };
}

// Advance the bike by dt. input: { gas, brake, lean } -- gas and brake
// booleans, lean from -1 (forward, nose down) to 1 (back, nose up).
// Returns null while riding, or an outcome when the ride ends:
// { kind: 'finished', time } or { kind: 'crash', reason }.
export function step(course, B, input, dt) {
  if (B.crashed || B.finished) return null;
  const lean = clamp(input.lean ?? 0, -1, 1);
  const steps = Math.max(1, Math.round(dt / DT));
  const h = dt / steps;
  for (let k = 0; k < steps; k++) {
    const rear = wheelForces(course, B, -BASE / 2, input, true);
    const front = wheelForces(course, B, BASE / 2, input, false);
    let fx = 0;
    let fy = -G * MASS;
    let torque = lean * LEAN * INERTIA;
    for (const w of [rear, front]) {
      if (!w) continue;
      fx += w.fx;
      fy += w.fy;
      torque += w.torque;
    }
    if (!rear && !front) torque -= B.omega * SPIN_DAMP * INERTIA;
    B.vx += (fx / MASS) * h;
    B.vy += (fy / MASS) * h;
    B.omega += (torque / INERTIA) * h;
    B.x += B.vx * h;
    B.y += B.vy * h;
    B.angle += B.omega * h;
    B.t += h;
    B.rear = rear?.contact ?? null;
    B.front = front?.contact ?? null;
    B.spin += ((rear ? rear.contact.vt : B.vx) / WHEEL) * h;
  }
  B.gas = !!input.gas;
  B.brake = !!input.brake;
  B.lean = lean;
  // Standing still (against a wall, or balanced on the back wheel).
  B.stall = grounded(B) && Math.abs(B.vx) < 0.25 ? (B.stall ?? 0) + dt : 0;
  // The walls of the world.
  if (B.x < WHEEL) {
    B.x = WHEEL;
    B.vx = Math.abs(B.vx) * 0.2;
  }
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
  return { wall, wallH, edge, gap, pit };
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
  let gas = speed < cruise;
  let brake = false;
  let target = Math.atan(slopeAt(course, B.x)); // pitch to hold
  if (read.pit) {
    // Out over a gap: nose up a little so the front wheel finds the far
    // lip, throttle open to drive up and over it.
    target = 0.2;
    gas = true;
  } else if (inAir) {
    // Pitch to the ground where the bike will come down, a touch nose-up
    // so the rear wheel lands first.
    target = landing(course, B)[1] + 0.12;
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
    // Off a drop or a lip: a touch nose-up so the rear lands first.
    target += 0.15;
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
// it does), with par set by its time. `checked` says the rider managed it.
export function makeLevel(n) {
  let course;
  let run = null;
  for (let attempt = 0; attempt < 12 && !run; attempt++) {
    course = makeCourse(n, attempt);
    run = bestRide(course);
  }
  const par = run ? Math.ceil(run.time) : Math.ceil(course.length / 4);
  return { ...course, par, checked: !!run, ride: run?.path ?? null };
}

// Stars for a finish: against par, and the number of crashes along the way.
export function stars(level, time, crashes) {
  if (crashes === 0 && time <= level.par) return 3;
  if (crashes <= 1 && time <= level.par * 1.5) return 2;
  return 1;
}
