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
// Attitude hold: a spin slower than this, left alone for HOLD_AFTER
// seconds, is quietly stopped -- the creep left over from taps that didn't
// quite cancel. Small and late enough never to swallow a deliberate tap
// (even 20 ms of thruster turns faster), or the first of a quick pair.
export const HOLD_BAND = (0.5 * Math.PI) / 180;
export const HOLD_AFTER = 0.5;
export const RCS_FUEL = 0.06; // fuel per second of side thruster (main = 1/s)
// Touchdown limits, as for the Apollo LM: 3 m/s down, 1.2 m/s sideways.
export const SAFE = { vy: 3, vx: 1.2, angle: (10 * Math.PI) / 180 };
// With assist on, rotation acts like a stiff, well-damped spring back to
// level: holding a turn button leans the lander against the spring until it
// settles at ASSIST_TILT; let go and it springs back upright in about a second.
export const ASSIST_TILT = (20 * Math.PI) / 180;
const SPRING = 9; // stiffness (1/s^2): natural frequency 3 rad/s
const SPRING_DAMP = 2 * 0.85 * 3; // damping ratio 0.85: no wobble
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

// Overhanging rock -- a cave's roof, the mountain over a tunnel, the roof of
// a cavern -- can't be a height map, so it's kept as separate pieces, each
// solid between lo(x) and hi(x) and sampled every `step` metres like the
// ground: { x0, x1, lo: [...], hi: [...] }.
function rockSpan(level, p, x) {
  const f = (x - p.x0) / level.step;
  const i = Math.max(0, Math.min(p.lo.length - 2, Math.floor(f)));
  const u = Math.max(0, Math.min(1, f - i));
  return [p.lo[i] + (p.lo[i + 1] - p.lo[i]) * u, p.hi[i] + (p.hi[i + 1] - p.hi[i]) * u];
}

export function inRock(level, x, y) {
  for (const p of level.rocks || []) {
    if (x < p.x0 || x > p.x1) continue;
    const [lo, hi] = rockSpan(level, p, x);
    if (y > lo && y < hi) return true;
  }
  return false;
}

// The highest solid point at x (ground or rock).
export function topAt(level, x) {
  let top = heightAt(level, x);
  for (const p of level.rocks || []) {
    if (x < p.x0 || x > p.x1) continue;
    const [lo, hi] = rockSpan(level, p, x);
    if (hi > lo) top = Math.max(top, hi);
  }
  return top;
}

// What kind of course mission n is. The first ten each have a shape of
// their own; from 11 the caves, tunnels and shafts come in turn, with an
// open course between, each a little tighter than the last time round.
const KIND = { 1: 'hop', 2: 'hop', 3: 'hill', 4: 'down', 5: 'twin', 6: 'mesa', 7: 'ridge', 8: 'range', 9: 'mesa', 10: 'crater' };
const OPEN = ['range', 'mesa', 'crater', 'down', 'ridge', 'twin'];
export function missionKind(n) {
  if (KIND[n]) return KIND[n];
  const k = (n - 11) % 4;
  return ['cave', 'tunnel', 'shaft'][k] || OPEN[Math.floor((n - 11) / 4) % OPEN.length];
}

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// Level n: launch pad on the left, landing base on the right. Everything
// that makes it hard grows steadily with n -- the distance, the mountains
// (how high and how many), the false valleys between them, how far the base
// sits above or below the launch pad, how narrow the base is -- and from
// mission 11 there's rock overhead to fly under, through or down into.
export function makeTerrain(n, attempt = 0) {
  const r = rng(seedFor(n * 16 + attempt, BASE_SEED));
  const kind = missionKind(n);
  const c = Math.max(0, Math.floor((n - 11) / 4)); // times this feature came before
  const step = 4;
  const snap = (x) => Math.round(x / step) * step;
  const Y0 = 100;
  const hop = n === 1 ? 30 : Math.min(1100, 30 + 50 * (n - 1));
  const peakH = n < 3 ? 0 : Math.min(420, 25 + 22 * (n - 3));
  const rise = Math.min(220, 8 + 7 * n); // how far apart the pads' heights may be
  const baseW = n === 1 ? 26 : Math.max(12, 28 - 1.1 * n);
  const startPad = { x0: 30, x1: 50, y: Y0 + r() * 6 };
  const sx = 40;
  let startY = startPad.y;
  let baseY = startY + (r() - 0.5) * rise * 0.4;
  let bx = sx + hop;
  let zones = null; // where mountains may stand: [[x0, x1], ...]
  let nPeaks = 0;
  let peakScale = 1;
  let narrow = 1;
  let valleys = false;
  let transition = null; // 0 at the start's height .. 1 at the base's
  let floor = null; // (x) => ground height, overriding the hills there
  let calm = []; // [x0, x1]: no bumps (approaches to caves and tunnels)
  let baseBlend = 30;
  let width = 0;
  let hover;
  const rocks = [];
  const keys = [];
  const room = (clear) => (clear - HEIGHT) / 2; // feet height that centres the craft
  const jag = (x) => 6 * Math.sin(x / 9.3) + 3 * Math.sin(x / 4.1 + 2);
  const piece = (x0, x1, lo, hi) => {
    const p = { x0, x1, lo: [], hi: [] };
    for (let x = x0; x <= x1 + 1e-9; x += step) {
      p.lo.push(lo(x));
      p.hi.push(Math.max(lo(x), hi(x)));
    }
    rocks.push(p);
  };

  switch (kind) {
    case 'hop':
      baseY = n === 1 ? startY + (r() - 0.5) * 2 : startY + 6;
      break;
    case 'hill':
      nPeaks = 1;
      break;
    case 'down': // start up high, land down in the lowlands
      startY = startPad.y = Y0 + rise;
      baseY = Y0 + r() * 5;
      nPeaks = n < 12 ? 1 : 2;
      peakScale = 0.6;
      break;
    case 'twin': // two peaks with a deep false valley between
      nPeaks = 2;
      valleys = true;
      break;
    case 'mesa': // the base up on a plateau behind a cliff
      baseY = startY + rise * 0.7 + 15;
      nPeaks = n < 9 ? 1 : 2;
      valleys = nPeaks > 1;
      break;
    case 'ridge': // one tall, narrow mountain
      nPeaks = 1;
      peakScale = 1.5;
      narrow = 0.6;
      break;
    case 'range': // a whole range, the base low beyond it
      nPeaks = Math.min(6, 2 + Math.floor((n - 3) / 4));
      baseY = startY - rise * 0.4;
      valleys = true;
      break;
    case 'crater': // the base down in a crater
      baseY = startY - rise * 0.6 - 15;
      nPeaks = 2;
      valleys = true;
      break;
    default:
      break;
  }
  let base = { x0: bx - baseW / 2, x1: bx + baseW / 2, y: baseY };
  const plain = (x) => startY + (baseY - startY) * (transition ? transition(x) : 0);

  if (kind === 'mesa') {
    transition = (x) => smooth((x - (base.x0 - 60)) / 14);
    zones = [[startPad.x1 + 30, base.x0 - 110]];
    baseBlend = 8;
  } else if (kind === 'crater') {
    transition = (x) => smooth((x - (base.x0 - 34)) / 12) * (1 - smooth((x - (base.x1 + 22)) / 12));
    zones = [[startPad.x1 + 30, base.x0 - 100]];
    baseBlend = 8;
  } else if (kind === 'cave') {
    // The base is inside a cave at the foot of a cliff: fly in under the
    // overhang and set down inside.
    const clear = Math.max(12.5, 22 - 2.5 * c);
    const over = Math.min(70, 25 + 12 * c);
    baseY = startY + (r() - 0.5) * rise * 0.5;
    base = { x0: bx - baseW / 2, x1: bx + baseW / 2, y: baseY };
    const mouth = snap(base.x0 - over);
    const back = snap(base.x1 + 12);
    const top = baseY + clear + 40 + 0.4 * peakH;
    width = back + 140;
    transition = (x) => smooth((x - (sx + 40)) / Math.max(1, mouth - 80 - (sx + 40)));
    zones = [[startPad.x1 + 30, mouth - 110]];
    calm = [[mouth - 70, width]];
    floor = (x) => (x < mouth ? null : x <= back ? baseY : top + jag(x));
    piece(mouth, back + step, () => baseY + clear,
      (x) => baseY + clear + 6 + (top + jag(x) - baseY - clear - 6) * smooth((x - mouth) / 40));
    keys.push({ x: mouth - 35, y: baseY + room(clear) }, { x: bx, y: baseY + room(clear), direct: true });
    hover = room(clear);
    baseBlend = 0;
  } else if (kind === 'tunnel') {
    // A mountain far too high to fly over cheaply, with a tunnel through it;
    // after the first, the tunnel bends up and down.
    const clear = Math.max(12, 22 - 2.5 * c);
    const len = snap(Math.min(300, 170 + 30 * c));
    const high = Math.min(560, 360 + 40 * c);
    const amp = c ? Math.min(24, 8 * c) : 0;
    const ta = snap(sx + Math.max(120, hop * 0.35));
    const tb = ta + len;
    bx = Math.max(sx + hop, tb + 130);
    baseY = startY + (r() - 0.5) * rise * 0.6;
    base = { x0: bx - baseW / 2, x1: bx + baseW / 2, y: baseY };
    const ty = startY;
    const off = (x) => amp * Math.sin((Math.PI * (x - ta)) / len);
    transition = (x) => smooth((x - (tb + 40)) / Math.max(1, base.x0 - 30 - (tb + 40)));
    zones = [[startPad.x1 + 30, ta - 90], [tb + 70, base.x0 - 40]];
    calm = [[ta - 60, tb + 60]];
    floor = (x) => (x >= ta && x <= tb ? ty + off(x) : null);
    const mountain = (x) => ty + high * smooth((x - ta) / 75) * smooth((tb - x) / 75)
      * (0.85 + 0.15 * Math.sin(x / 23)) + jag(x) * 2;
    piece(ta, tb, (x) => ty + off(x) + clear, mountain);
    keys.push({ x: ta - 35, y: ty + room(clear) });
    for (let x = ta + 8; x < tb; x += 16) keys.push({ x, y: ty + off(x) + room(clear), direct: true });
    keys.push({ x: tb + 35, y: ty + room(clear), direct: true });
  } else if (kind === 'shaft') {
    // The base is in a cavern deep under a mesa, reached down a narrow shaft
    // drilled from the top; after the first, the base is off to one side.
    const sw = c < 1 ? 20 : c < 3 ? 16 : 12;
    const clear = Math.max(13, 20 - 1.5 * c);
    const depth = Math.min(220, 50 + 30 * c);
    const offset = c === 0 ? 0 : snap(Math.min(56, 16 + 12 * c));
    baseY = Y0 + (r() - 0.5) * rise * 0.3;
    const s0 = snap(sx + Math.max(160, hop * 0.5));
    const s1 = s0 + sw;
    const sc = (s0 + s1) / 2;
    bx = offset ? s1 + offset + baseW / 2 : sc;
    base = { x0: bx - baseW / 2, x1: bx + baseW / 2, y: baseY };
    const cx0 = s0 - 16;
    const cx1 = snap(Math.max(s1, base.x1) + 14);
    const top = baseY + clear + depth;
    const mx0 = cx0 - 70;
    width = cx1 + 160;
    zones = [[startPad.x1 + 30, mx0 - 70]];
    calm = [[mx0 - 40, width]];
    floor = (x) => (x < mx0 ? null
      : x < cx0 ? startY + (top - startY) * smooth((x - mx0) / 60) + jag(x) * smooth((x - mx0) / 60)
        : x <= cx1 ? baseY : top + jag(x));
    piece(cx0 - step, s0, () => baseY + clear, (x) => top + jag(x));
    piece(s1, cx1 + step, () => baseY + clear, (x) => top + jag(x));
    keys.push({ x: sc, y: top + 20 }, { x: sc, y: baseY + room(clear), direct: true });
    if (offset) keys.push({ x: bx, y: baseY + room(clear), direct: true });
    hover = room(clear);
    baseBlend = 0;
  }
  if (!transition) {
    const a = sx + 40;
    const b = base.x0 - 40;
    transition = (x) => smooth((x - a) / Math.max(1, b - a));
  }
  zones ??= [[startPad.x1 + 30, base.x0 - 30]];
  width ||= Math.ceil(base.x1 + 90);

  // Mountains, shared out among the zones by length, with false valleys
  // between neighbours.
  const bumps = [];
  const spans = zones.filter(([a, b]) => b - a > 30);
  const total = spans.reduce((t, [a, b]) => t + b - a, 0);
  let placed = 0;
  spans.forEach(([a, b], z) => {
    const k = z === spans.length - 1 ? nPeaks - placed : Math.round((nPeaks * (b - a)) / total);
    const span = b - a;
    const xs = [];
    for (let j = 0; j < k; j++) {
      const x = a + span * ((j + 0.5) / k) + (r() - 0.5) * span * 0.15 / k;
      xs.push(x);
      bumps.push({
        x,
        h: Math.min(500, peakH * peakScale) * (placed + j === 0 ? 1 : 0.55 + r() * 0.5),
        w: Math.min(span / (2 * k), (40 + r() * 60 + n * 3) * narrow),
      });
    }
    if (valleys) {
      for (let j = 1; j < xs.length; j++) {
        bumps.push({ x: (xs[j - 1] + xs[j]) / 2, h: -(0.25 + 0.35 * r()) * peakH, w: (xs[j] - xs[j - 1]) / 5 });
      }
    }
    placed += k;
  });
  if (kind === 'crater') {
    const rim = 15 + 0.25 * peakH;
    bumps.push({ x: base.x0 - 40, h: rim, w: 12 }, { x: base.x1 + 28, h: rim, w: 12 });
  }

  const rough = n <= 2 ? 0.15 : Math.min(1, 0.2 + 0.1 * n);
  const phase = [r() * 10, r() * 10, r() * 10];
  const quiet = (x) => {
    let q = 1;
    for (const [a, b] of calm) q = Math.min(q, 1 - smooth((x - (a - 30)) / 30) * (1 - smooth((x - b) / 30)));
    return q;
  };
  const count = Math.ceil(width / step) + 1;
  const terrain = [];
  for (let i = 0; i < count; i++) {
    const x = i * step;
    const own = floor && floor(x);
    if (own != null) {
      terrain.push(own);
      continue;
    }
    let y = plain(x) + quiet(x) * rough * (8 * Math.sin(x / 37 + phase[0]) + 5 * Math.sin(x / 13 + phase[1]) + 2.5 * Math.sin(x / 5.3 + phase[2]));
    for (const p of bumps) {
      // Rugged mountain: a broad bump plus jagged ridges.
      const d = (x - p.x) / p.w;
      y += p.h * Math.exp(-d * d * 1.6) * (1 + 0.12 * Math.sin(x / 7 + p.x));
    }
    terrain.push(y);
  }
  // Flatten the pads and blend the ground into them.
  for (const [pad, blend] of [[startPad, 30], [base, baseBlend]]) {
    for (let i = 0; i < count; i++) {
      const x = i * step;
      const inside = x >= pad.x0 - 2 && x <= pad.x1 + 2;
      const edge = Math.min(Math.abs(x - pad.x0), Math.abs(x - pad.x1));
      if (inside) terrain[i] = pad.y;
      else if (edge < blend) {
        const k = edge / blend;
        terrain[i] = pad.y + (terrain[i] - pad.y) * k * k;
      }
    }
  }
  const maxH = Math.max(...terrain, ...rocks.flatMap((p) => p.hi));
  return { n, kind, width, step, terrain, startPad, base, maxH, rocks, keys, hover };
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
  // cancels a slow creep once the turn buttons have been left alone a
  // moment, so the craft is easy to steady. With assist on,
  // rotation is a spring: a held turn button pushes against it (settling at
  // 20°), and on release it springs back to level.
  if (input.assist && L.fuel > 0) {
    const push = rotating ? L.rcs * SPRING * ASSIST_TILT : 0;
    const torque = push - SPRING * L.angle - SPRING_DAMP * L.omega;
    L.omega += torque * dt;
    L.rcs = Math.abs(torque) > 0.05 ? Math.sign(torque) : 0;
    if (L.rcs) L.fuel = Math.max(0, L.fuel - RCS_FUEL * dt);
  } else if (rotating) {
    L.omega += L.rcs * ROT_ACCEL * dt;
    L.fuel = Math.max(0, L.fuel - RCS_FUEL * dt);
  } else if (L.idle >= HOLD_AFTER && Math.abs(L.omega) < HOLD_BAND) {
    L.omega *= Math.exp(-5 * dt);
    if (Math.abs(L.omega) < 0.002) L.omega = 0;
  }
  L.idle = rotating ? 0 : (L.idle ?? HOLD_AFTER) + dt;
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
    if (inRock(level, wx, wy)) return crash(L, 'Struck the rock overhead');
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
  // Settle on the surface, engines off.
  L.y = Math.max(heightAt(level, L.x - FEET), heightAt(level, L.x + FEET));
  L.angle = 0;
  L.omega = L.vx = L.vy = 0;
  L.thrusting = false;
  L.rcs = 0;
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

// The way through a level as waypoints, from the launch pad to just above
// the base: in the open, up to a safe height, across and down; through a
// cave, tunnel or shaft, straight from point to point ("direct").
export function planRoute(level) {
  const S = { x: (level.startPad.x0 + level.startPad.x1) / 2, y: level.startPad.y };
  const bx = (level.base.x0 + level.base.x1) / 2;
  const keys = [...(level.keys || [])];
  const last = keys[keys.length - 1];
  if (!last || Math.abs(last.x - bx) > 1) keys.push({ x: bx, y: level.base.y + (level.hover ?? 15) });
  const plan = [S];
  let prev = S;
  for (const k of keys) {
    if (!k.direct) {
      let top = -Infinity;
      const a = Math.min(prev.x, k.x) - 8;
      const b = Math.max(prev.x, k.x) + 8;
      for (let x = a; x <= b; x += level.step) top = Math.max(top, topAt(level, x));
      const h = Math.max(top + 30, prev.y + 10, k.y + 10);
      plan.push({ x: prev.x, y: h }, { x: k.x, y: h });
    }
    plan.push({ ...k });
    prev = k;
  }
  return plan;
}

// A careful, competent pilot that follows the planned route, then sets down
// gently on the base. Used to check every level can be done (and to size its
// fuel) and by the tests. Returns the input for this moment; keeps its place
// on the route in L.wp.
export function autopilot(level, L, maxTiltDeg = 35) {
  const plan = (level.plan ??= planRoute(level));
  const tilt = (maxTiltDeg * Math.PI) / 180;
  let vxWant;
  let vyWant;
  let i = L.wp ?? 1;
  // Skip on past waypoints reached.
  for (; i < plan.length; i++) {
    const A = plan[i - 1];
    const B = plan[i];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    if (len < 0.5) continue;
    const s = ((L.x - A.x) * (B.x - A.x) + (L.y - A.y) * (B.y - A.y)) / len;
    if (len - s > (B.direct || plan[i + 1]?.direct ? 1.5 : 4)) break;
  }
  L.wp = i;
  if (i < plan.length) {
    const A = plan[i - 1];
    const B = plan[i];
    const C = plan[i + 1];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const ux = (B.x - A.x) / len;
    const uy = (B.y - A.y) / len;
    const s = (L.x - A.x) * ux + (L.y - A.y) * uy;
    const e = -(L.x - A.x) * uy + (L.y - A.y) * ux; // to the left of the path
    const tight = B.direct || C?.direct;
    // Top speed along this leg, and how hard it can brake along it.
    let vmax = tight ? 3 : 22;
    if (uy > 0.2) vmax = Math.min(vmax, (tight ? 2.5 : 9) / uy);
    if (uy < -0.2) vmax = Math.min(vmax, (tight ? 2.5 : 6) / -uy);
    const brake = Math.abs(ux) * 1.0 * Math.sin(tilt) + Math.abs(uy) * (uy < 0 ? 0.45 : 1.2);
    // Slow for the corner at B (or stop, at the end of the route).
    let vEnd = 0;
    if (C) {
      const lc = Math.hypot(C.x - B.x, C.y - B.y) || 1;
      const cos = ux * ((C.x - B.x) / lc) + uy * ((C.y - B.y) / lc);
      vEnd = cos > 0.95 ? vmax : cos > 0.7 ? 1.5 : 0.6;
    }
    const v = Math.min(vmax, Math.sqrt(vEnd * vEnd + 2 * brake * Math.max(0, len - s)));
    const lim = tight ? 1.5 : 4;
    const back = Math.max(-lim, Math.min(lim, -e * 0.5)); // steer back onto the line
    vxWant = ux * v - uy * back;
    vyWant = uy * v + ux * back;
  } else {
    // Over the base: line up, then come straight down, slowly at the end.
    const base = level.base;
    const dx = (base.x0 + base.x1) / 2 - L.x;
    const hold = level.hover ?? 15;
    vxWant = Math.max(-2.5, Math.min(2.5, dx * 0.3));
    const h = L.y - base.y;
    const steady = Math.abs(L.angle) < 0.05 && Math.abs(L.omega) < 0.05;
    vyWant = Math.abs(dx) < 2 && Math.abs(L.vx) < 0.5
      ? h < 8 && !steady ? 0 : -Math.max(0.9, Math.min(5, h * 0.25))
      : Math.max(-3, Math.min(3, (base.y + hold - L.y) * 0.5));
  }
  const axWant = (vxWant - L.vx) * 0.4;
  const ayWant = (vyWant - L.vy) * 1.6 + G;
  // Never lean so far that the engine can't hold the height it needs.
  const push = MAIN_THRUST / (1 + 0.5 * (L.fuel / L.fuelMax));
  const cap = Math.min(tilt, Math.acos(Math.min(1, Math.max(G * 1.05, ayWant) / push)));
  const want = Math.max(-cap, Math.min(cap, Math.atan2(axWant, Math.max(0.5, ayWant))));
  // Turn no faster than the side thrusters can stop in time.
  const d = want - L.angle;
  const omegaWant = Math.sign(d) * Math.min(0.8, Math.abs(d) * 2.5, Math.sqrt(2 * ROT_ACCEL * 0.85 * Math.abs(d)));
  const de = omegaWant - L.omega;
  const thrust = ayWant > G * 0.55 && Math.abs(want - L.angle) < 0.6;
  return { thrust, left: de < -0.04, right: de > 0.04 };
}

// The autopilot's best: it flies the level (on its fuel) leaning up to each
// of a few limits, and the one that lands with the best score wins. Returns
// that lean (degrees).
export function bestTilt(level) {
  let best = { tilt: 9, score: -1 };
  for (const tilt of [15, 20, 25, 30, 35]) {
    const L = newLander(level, level.fuel ?? 2000);
    for (let t = 0; t < 900; t += 1 / 60) {
      const res = step(level, L, autopilot(level, L, tilt), 1 / 60);
      if (!res || res.kind === 'touchdown') continue;
      if (res.kind === 'landed' && res.score.total > best.score) best = { tilt, score: res.score.total };
      break;
    }
  }
  return best.tilt;
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

// The way a careful pilot would fly it, from the launch pad to the base
// (shown before each mission starts): [x, y, speed] every quarter second
// (TRACK_DT), like the record of your own flights.
export const TRACK_DT = 0.25;
export function flightPath(level) {
  const L = newLander(level, 2000);
  const dt = TRACK_DT / 10;
  const path = [[L.x, L.y, 0]];
  for (let k = 1; k < 900 / dt; k++) {
    const res = step(level, L, autopilot(level, L, 9), dt);
    if (k % 10 === 0) path.push([L.x, L.y, Math.hypot(L.vx, L.vy)]);
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
