// Lunar Lander physics, terrain and levels -- no DOM, so it can be tested.
//
// World units are metres, x to the right and y UP. The lander's position is
// the point midway between its footpads. angle 0 = upright; positive angles
// tilt it to the right, so the main engine then pushes it rightwards.
import { rng, seedFor } from '../../js/lib/random.js';

export const G = 1.62; // lunar gravity, m/s^2
export const FEET = 2.4; // half-span of the footpads, m
export const HEIGHT = 5.2; // lander height, m
export const MAIN_THRUST = 3.5; // m/s^2 when nearly empty (heavier when full)
export const ROT_ACCEL = (26 * Math.PI) / 180; // rad/s^2 from the side thrusters
export const ROT_MAX = (90 * Math.PI) / 180;
export const HOLD_BAND = (4 * Math.PI) / 180; // attitude hold cancels slower spins
export const RCS_FUEL = 0.06; // fuel per second of side thruster (main = 1/s)
export const SAFE = { vy: 2.2, vx: 1.2, angle: (10 * Math.PI) / 180 };
export const ASSIST_TILT = (30 * Math.PI) / 180; // with assist on, tilt stays within this
export const ASSIST_DAMP = 0.6; // per second: how fast sideways drift dies away when level
export const BASE_SEED = 20261018;

// ------------------------------------------------------------------ terrain

export function heightAt(level, x) {
  const t = level.terrain;
  const step = level.step;
  const i = Math.max(0, Math.min(t.length - 2, Math.floor(x / step)));
  const f = Math.max(0, Math.min(1, x / step - i));
  return t[i] + (t[i + 1] - t[i]) * f;
}

export function slopeAt(level, x) {
  return (heightAt(level, x + 1) - heightAt(level, x - 1)) / 2;
}

// Level n: launch pad on the left, landing base on the right, mountains in
// between that grow taller (and more numerous) as n rises; the base pad
// gets narrower and the fuel margin thinner.
// Mission 1 is a short hop over flat ground; each one after is a little
// further, and from mission 3 hills grow into mountains between the pads.
export function makeTerrain(n, attempt = 0) {
  const r = rng(seedFor(n * 16 + attempt, BASE_SEED));
  const hop = n === 1 ? 30 : Math.min(1150, 30 + 45 * (n - 1) + 2 * (n - 1) ** 2);
  const step = 4;
  const ground = 30;
  const flat = n <= 2;
  const startPad = { x0: 30, x1: 50, y: ground + r() * (flat ? 3 : 20) };
  const baseW = n === 1 ? 26 : Math.max(14, 28 - 1.2 * n);
  const baseX = (startPad.x0 + startPad.x1) / 2 + hop;
  const base = { x0: baseX - baseW / 2, x1: baseX + baseW / 2, y: ground + r() * (flat ? 3 : 20 + 4 * n) };
  const width = Math.ceil(base.x1 + 90);
  const count = Math.ceil(width / step) + 1;
  const peaks = [];
  const nPeaks = n < 3 ? 0 : Math.min(5, 1 + Math.floor((n - 3) / 3));
  const peakH = Math.min(460, 20 + 28 * (n - 3));
  const span = base.x0 - 30 - (startPad.x1 + 30);
  for (let k = 0; k < nPeaks && span > 20; k++) {
    peaks.push({
      x: startPad.x1 + 30 + span * ((k + 0.5) / nPeaks) + (r() - 0.5) * span * 0.15,
      h: peakH * (k === 0 ? 1 : 0.55 + r() * 0.5),
      w: Math.min(span / 3, 40 + r() * 60 + n * 3),
    });
  }
  const rough = Math.min(1, 0.2 + 0.1 * n);
  const phase = [r() * 10, r() * 10, r() * 10];
  const terrain = [];
  for (let i = 0; i < count; i++) {
    const x = i * step;
    let y = ground + rough * (8 * Math.sin(x / 37 + phase[0]) + 5 * Math.sin(x / 13 + phase[1]) + 2.5 * Math.sin(x / 5.3 + phase[2]));
    for (const p of peaks) {
      // Rugged mountain: a broad bump plus jagged ridges.
      const d = (x - p.x) / p.w;
      const bump = Math.exp(-d * d * 1.6);
      y += p.h * bump * (1 + 0.12 * Math.sin(x / 7 + p.x));
    }
    terrain.push(y);
  }
  // Flatten the pads and blend the ground into them.
  for (const pad of [startPad, base]) {
    for (let i = 0; i < count; i++) {
      const x = i * step;
      const inside = x >= pad.x0 - 2 && x <= pad.x1 + 2;
      const edge = Math.min(Math.abs(x - pad.x0), Math.abs(x - pad.x1));
      if (inside) terrain[i] = pad.y;
      else if (edge < 30) {
        const k = edge / 30;
        terrain[i] = pad.y + (terrain[i] - pad.y) * k * k;
      }
    }
  }
  const maxH = Math.max(...terrain);
  return { n, width, step, terrain, startPad, base, maxH };
}

// ------------------------------------------------------------------ lander

export function newLander(level, fuel) {
  const pad = level.startPad;
  return {
    x: (pad.x0 + pad.x1) / 2, y: pad.y, vx: 0, vy: 0, ax: 0, ay: 0,
    angle: 0, omega: 0, fuel, fuelMax: fuel, landed: 'start', t: 0,
  };
}

// Points of the lander outline that may touch the ground (local coords).
const CONTACTS = [
  [-FEET, 0, 'foot'], [FEET, 0, 'foot'],
  [-2.0, 1.6, 'body'], [2.0, 1.6, 'body'], [-1.6, 4.6, 'body'], [1.6, 4.6, 'body'], [0, HEIGHT, 'body'],
];

function toWorld(L, [lx, ly]) {
  const c = Math.cos(L.angle);
  const s = Math.sin(L.angle);
  // Positive angle tilts right (clockwise), with y up.
  return [L.x + lx * c + ly * s, L.y - lx * s + ly * c];
}

// Advance the lander by dt. input: { thrust, left, right } booleans.
// Returns null while flying, or an outcome when it touches down:
// { kind: 'landed' | 'touchdown' | 'crash', ...details }.
export function step(level, L, input, dt) {
  L.t += dt;
  const thrusting = input.thrust && L.fuel > 0;
  const rotating = (input.left || input.right) && L.fuel > 0 && !(input.left && input.right);
  L.thrusting = thrusting;
  L.rcs = rotating ? (input.right ? 1 : -1) : 0;

  // Sitting on a pad or the ground: only the main engine can lift off.
  if (L.landed) {
    L.vx = L.vy = L.omega = 0;
    L.ax = 0;
    L.ay = 0;
    if (!thrusting) return null;
    L.landed = null;
  }

  // Rotation: side thrusters change the spin rate; attitude hold quietly
  // cancels very slow drift so the craft is easy to steady. With assist on,
  // the thrusters instead steer the tilt: to 30° while a turn button is held,
  // and smoothly back to level when it's let go.
  if (input.assist && L.fuel > 0) {
    const target = rotating ? L.rcs * ASSIST_TILT : 0;
    const want = Math.max(-0.8, Math.min(0.8, (target - L.angle) * 2.5));
    const dw = want - L.omega;
    const max = 2 * ROT_ACCEL * dt;
    L.omega += Math.max(-max, Math.min(max, dw));
    L.rcs = Math.abs(dw) > 0.02 ? Math.sign(dw) : 0;
    if (L.rcs) L.fuel = Math.max(0, L.fuel - RCS_FUEL * dt);
  } else if (rotating) {
    L.omega += L.rcs * ROT_ACCEL * dt;
    L.fuel = Math.max(0, L.fuel - RCS_FUEL * dt);
  } else if (Math.abs(L.omega) < HOLD_BAND) {
    L.omega *= Math.exp(-5 * dt);
    if (Math.abs(L.omega) < 0.002) L.omega = 0;
  }
  L.omega = Math.max(-ROT_MAX, Math.min(ROT_MAX, L.omega));
  L.angle += L.omega * dt;
  L.angle = Math.atan2(Math.sin(L.angle), Math.cos(L.angle));

  // Translation: lighter (so punchier) as fuel burns off.
  const mass = 1 + 0.5 * (L.fuel / L.fuelMax);
  const a = thrusting ? MAIN_THRUST / mass : 0;
  if (thrusting) L.fuel = Math.max(0, L.fuel - dt);
  L.ax = a * Math.sin(L.angle);
  L.ay = a * Math.cos(L.angle) - G;
  L.vx += L.ax * dt;
  L.vy += L.ay * dt;
  // Assist also kills sideways drift: once you let go and the lander levels
  // out, horizontal speed decays away (fully when level, not at all while
  // leaning hard, so you can still pick up speed).
  if (input.assist) {
    const level = Math.max(0, 1 - Math.abs(L.angle) / ASSIST_TILT);
    L.vx *= Math.exp(-ASSIST_DAMP * level * dt);
  }
  L.x += L.vx * dt;
  L.y += L.vy * dt;

  // Edges of the world: soft walls.
  if (L.x < 5) {
    L.x = 5;
    L.vx = Math.abs(L.vx) * 0.3;
  } else if (L.x > level.width - 5) {
    L.x = level.width - 5;
    L.vx = -Math.abs(L.vx) * 0.3;
  }
  return contact(level, L);
}

function onPad(pad, L) {
  return L.x - FEET >= pad.x0 - 0.5 && L.x + FEET <= pad.x1 + 0.5;
}

function contact(level, L) {
  let foot = false;
  for (const p of CONTACTS) {
    const [wx, wy] = toWorld(L, p);
    const ground = heightAt(level, wx);
    if (wy > ground) continue;
    if (p[2] === 'body') return crash(L, 'Hull struck the surface');
    foot = true;
  }
  // A footpad grazing the ground while climbing away isn't a landing.
  if (!foot || L.vy > 0) return null;
  const vy = -L.vy;
  const vx = Math.abs(L.vx);
  const tilt = Math.abs(L.angle);
  const details = { vy, vx, tilt };
  if (vy > SAFE.vy) return crash(L, `Impact at ${vy.toFixed(1)} m/s`, details);
  if (vx > SAFE.vx) return crash(L, `Sideways at ${vx.toFixed(1)} m/s`, details);
  if (tilt > SAFE.angle) return crash(L, `Tipped over at ${((tilt * 180) / Math.PI).toFixed(0)}°`, details);
  const slope = Math.abs(Math.atan(slopeAt(level, L.x)));
  if (slope > SAFE.angle) return crash(L, 'Ground too steep', details);
  // Settle on the surface.
  L.y = Math.max(heightAt(level, L.x - FEET), heightAt(level, L.x + FEET));
  L.angle = 0;
  L.omega = L.vx = L.vy = 0;
  if (onPad(level.base, L)) {
    L.landed = 'base';
    return { kind: 'landed', ...details, score: scoreLanding(level, L, details) };
  }
  L.landed = onPad(level.startPad, L) ? 'start' : 'ground';
  return { kind: 'touchdown', where: L.landed, ...details };
}

function crash(L, reason, details = {}) {
  L.crashed = true;
  return { kind: 'crash', reason, ...details };
}

// Gentle, level, centred and frugal landings score best (max ~1000).
export function scoreLanding(level, L, { vy, vx, tilt }) {
  const pad = level.base;
  const centre = (pad.x0 + pad.x1) / 2;
  const off = Math.abs(L.x - centre) / ((pad.x1 - pad.x0) / 2);
  const parts = {
    soft: Math.round(350 * Math.max(0, 1 - vy / SAFE.vy)),
    drift: Math.round(150 * Math.max(0, 1 - vx / SAFE.vx)),
    level: Math.round(150 * Math.max(0, 1 - tilt / SAFE.angle)),
    centre: Math.round(100 * Math.max(0, 1 - off)),
    fuel: Math.round(250 * (L.fuel / L.fuelMax)),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts, stars: total >= 700 ? 3 : total >= 480 ? 2 : 1 };
}

// ------------------------------------------------------------------ autopilot

// A simple, competent pilot. Used to size each level's fuel (so every level
// is possible) and by the tests. Returns the input for this moment.
export function autopilot(level, L, maxTiltDeg = 35) {
  const base = level.base;
  const target = (base.x0 + base.x1) / 2;
  const dx = target - L.x;
  const dir = Math.sign(dx) || 1;
  // Highest ground along the path ahead (further ahead when moving faster).
  const reach = Math.min(Math.abs(dx) + 10, Math.abs(L.vx) * 8 + 60);
  let ahead = heightAt(level, L.x);
  for (let k = 0; k <= reach; k += level.step) ahead = Math.max(ahead, heightAt(level, L.x + dir * k));
  const clearance = L.y - ahead;
  const far = Math.abs(dx) > 25;
  let vxWant;
  let vyWant;
  if (far) {
    // Climb first; only speed up once the terrain ahead is cleared.
    // No faster than it can stop from, given how far it may tilt.
    const brake = 0.8 * Math.sqrt(2 * 1.6 * Math.sin((maxTiltDeg * Math.PI) / 180) * Math.abs(dx));
    const cap = Math.min(22, brake);
    vxWant = clearance < 25
      ? dir * Math.max(0, Math.min(cap, (clearance - 8) * 0.6))
      : Math.max(-cap, Math.min(cap, dx * 0.14));
    vyWant = Math.max(-5, Math.min(9, (ahead + 40 - L.y) * 0.35));
  } else {
    vxWant = Math.max(-2.5, Math.min(2.5, dx * 0.3));
    const h = L.y - base.y;
    const steady = Math.abs(L.angle) < 0.05 && Math.abs(L.omega) < 0.05;
    vyWant = Math.abs(dx) < 3 && Math.abs(L.vx) < 0.6
      ? h < 8 && !steady ? 0 : -Math.max(0.9, Math.min(5, h * 0.25))
      : Math.max(-3, Math.min(3, (base.y + 15 - L.y) * 0.3));
  }
  const axWant = (vxWant - L.vx) * 0.6;
  const ayWant = (vyWant - L.vy) * 1.6 + G;
  const maxTilt = (maxTiltDeg * Math.PI) / 180;
  const want = Math.max(-maxTilt, Math.min(maxTilt, Math.atan2(axWant, Math.max(0.5, ayWant))));
  const omegaWant = Math.max(-0.8, Math.min(0.8, (want - L.angle) * 2.5));
  const de = omegaWant - L.omega;
  const thrust = ayWant > G * 0.55 && Math.abs(want - L.angle) < 0.6;
  return { thrust, left: de < -0.04, right: de > 0.04 };
}

// Fly the level with the autopilot (plenty of fuel) and report fuel used.
// It flies gently (tilting no more than an assisted pilot can), so the fuel
// it needs is what a careful player needs.
export function simulate(level, fuel = 2000, maxTime = 900) {
  const L = newLander(level, fuel);
  const dt = 1 / 30;
  for (let t = 0; t < maxTime; t += dt) {
    const res = step(level, L, autopilot(level, L, 9), dt);
    if (res && res.kind !== 'touchdown') return { ...res, used: fuel - L.fuel, time: t };
  }
  return { kind: 'timeout', used: fuel - L.fuel };
}

// The way a careful pilot would fly it: points [x, y] every half second,
// from the launch pad to the base (shown before each mission starts).
export function flightPath(level) {
  const L = newLander(level, 2000);
  const dt = 1 / 30;
  const path = [[L.x, L.y]];
  for (let t = 0, k = 0; t < 900; t += dt, k++) {
    const res = step(level, L, autopilot(level, L, 9), dt);
    if (k % 15 === 0) path.push([L.x, L.y]);
    if (res && res.kind !== 'touchdown') break;
  }
  path.push([L.x, L.y]);
  return path;
}

// A level: terrain the autopilot has actually landed on (re-rolled until it
// can), with a fuel budget of what it used plus a margin that shrinks as n
// grows -- so every level is possible, and later ones leave little spare.
export function makeLevel(n) {
  let level;
  let run;
  for (let attempt = 0; attempt < 12; attempt++) {
    level = makeTerrain(n, attempt);
    run = simulate(level);
    if (run.kind === 'landed') break;
  }
  const need = run.kind === 'landed' ? run.used : 60 + level.width * 0.15;
  const margin = Math.max(1.3, 3.0 - 0.12 * (n - 1));
  return { ...level, fuel: Math.round(need * margin), checked: run.kind === 'landed' };
}
