// Lunar Lander: Apollo 11 -- the first landing, from orbit. (No DOM: tested
// in Node.)
//
// Eagle's powered descent began 15 km up, coasting round the Moon at
// 1,690 m/s, hundreds of km from the landing site. The guidance computer
// braked it (program P63) down to "High Gate", 2 km up, where it pitched
// over so the crew could see ahead; flew the approach (P64) down to "Low
// Gate", 150 m up; and would have landed it -- in a crater strewn with
// boulders, West crater. Armstrong took over by hand (P66) and flew on past
// it to clear ground beyond, landing with well under a minute of fuel.
//
// Here the computer flies it the same way, and you take over where you
// choose -- from the start, at High Gate, or at Low Gate like Armstrong --
// or whenever you touch the controls.
//
// The ground is flat; the Moon's curve shows up as a lift of vx^2/R (see
// step() in engine.js), which in orbit balances its gravity.
import { G, ROT_ACCEL, ROT_MAX, MOON_R, heightAt, newLander, step } from './engine.js';
import { rng } from '../../js/lib/random.js';

const DATUM = 100; // the mare's level
const X0 = 3000; // where powered descent starts...
const XC = X0 + 600000; // ...West crater, where the computer was taking Eagle...
const XS = XC + 420; // ...and where Eagle landed: Tranquility Base
export const PDI = { alt: 15000, vx: 1690, vy: 0 };
// The computer's aim points, before West crater: High Gate and Low Gate.
export const GATES = {
  high: { dx: -7000, alt: 2300, vx: 140, vy: -45 },
  low: { dx: -600, alt: 150, vx: 18, vy: -5 },
};
// Where you take over: { key, name, about, prog: the program you take over in }.
export const STARTS = [
  { key: 'low', name: 'Low Gate · 150 m', about: 'Take over 150 m up, like Armstrong, and find somewhere clear to land.' },
  { key: 'high', name: 'High Gate · 2 km', about: 'Take over 2 km up, still at 140 m/s: slow down, pick a spot and land.' },
  { key: 'pdi', name: 'From orbit · 15 km', about: 'Fly the whole powered descent yourself, from 1,690 m/s.' },
];
// The descent engine: punchier than the other missions' (as Eagle's was).
export const THRUST = 5;
export const FUEL_SPARE = 45; // seconds of full thrust left at Low Gate (some two minutes' hover)
export const EAGLE_FUEL = 25; // about what Eagle landed with (s of hover, as called out)

// The Sea of Tranquility: a gently rolling plain dotted with craters, and
// near the end West crater, ringed with boulders; beyond it, clear ground.
export function makeApollo() {
  const r = rng(19690720);
  const step = 4;
  const width = XS + 3000;
  const count = Math.ceil(width / step) + 1;
  const ph = [r() * 9, r() * 9, r() * 9, r() * 9];
  const terrain = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const x = i * step;
    terrain[i] = DATUM + 9 * Math.sin(x / 2300 + ph[0]) + 5 * Math.sin(x / 870 + ph[1])
      + 1.2 * Math.sin(x / 37 + ph[2]) + 0.6 * Math.sin(x / 11 + ph[3]);
  }
  const crater = (c, rad, depth, rim) => {
    for (let i = Math.max(0, Math.floor((c - 1.6 * rad) / step)); i <= Math.min(count - 1, (c + 1.6 * rad) / step); i++) {
      const d = Math.abs(i * step - c) / rad;
      if (d < 1) terrain[i] -= depth * (1 - d * d);
      terrain[i] += rim * Math.exp(-(((d - 1) / 0.2) ** 2));
    }
  };
  // Craters along the way (but none on the clear ground beyond West crater).
  for (let x = X0 - 2000; x < width; x += 60 + r() * 260) {
    if (Math.abs(x - XS) < 500 || Math.abs(x - XC) < 300) continue;
    const rad = r() < 0.05 ? 120 + r() * 200 : 6 + r() * 40;
    crater(x, rad, rad * (0.15 + r() * 0.1), rad * 0.06);
  }
  crater(XC, 90, 22, 5);
  // Boulders, in and around West crater (kept to be drawn, too).
  const boulders = [];
  for (let x = XC - 150; x < XC + 150; x += 5 + r() * 9) {
    const h = 1.5 + r() * 2.5;
    const w = 1.5 + r() * 2;
    boulders.push({ x, h, w });
    for (let i = Math.floor((x - w) / step); i <= (x + w) / step; i++) terrain[i] += h * Math.max(0, 1 - Math.abs(i * step - x) / w) ** 0.6;
  }
  const level = {
    n: 'apollo', kind: 'apollo', apollo: { X0, XC, XS }, orbit: true, anywhere: true, thrust: THRUST,
    width, step, terrain: Array.from(terrain), rocks: [], keys: [], hover: 15, boulders,
    startPad: { x0: X0 - 10, x1: X0 + 10, y: DATUM }, maxH: terrain.reduce((m, y) => Math.max(m, y), -Infinity),
  };
  level.base = { x0: XS - 15, x1: XS + 15, y: heightAt(level, XS) };
  level.fuel = fuelFor(level);
  return level;
}

// A lander at the start of powered descent, the engine already pointing
// the way the computer will first fire it.
export function startApollo(level, fuel = level.fuel) {
  const L = newLander(level, fuel);
  Object.assign(L, { x: X0, y: DATUM + PDI.alt, vx: PDI.vx, vy: PDI.vy, landed: null, prog: 63 });
  const f = thrustWanted(level, L);
  L.angle = Math.atan2(f[0], f[1]);
  return L;
}

// The push the engine can give now (lighter as the fuel burns).
const pushOf = (L) => THRUST / (1 + 0.5 * (L.fuel / L.fuelMax));
const lift = (L) => (L.vx * L.vx) / MOON_R - G; // gravity, less the Moon's curve

// Steering to an aim point (P63, P64): the acceleration, changing steadily,
// that arrives there at the aim speed in T seconds -- the thrust for it
// being that less gravity -- now and on arrival. T is the soonest the
// engine can manage, both now and at the end, without working flat out;
// it's counted down from then (and found again if the engine can't keep up).
function aimThrust(L, gate, T, end = false) {
  const tx = XC + gate.dx;
  const ty = DATUM + gate.alt;
  const ax = (6 * (tx - L.x) - (4 * L.vx + 2 * gate.vx) * T) / (T * T);
  const ay = (6 * (ty - L.y) - (4 * L.vy + 2 * gate.vy) * T) / (T * T);
  if (!end) return [ax, ay - lift(L)];
  const endLift = (gate.vx * gate.vx) / MOON_R - G;
  return [(2 * (gate.vx - L.vx)) / T - ax, (2 * (gate.vy - L.vy)) / T - ay - endLift];
}
function soonest(L, gate) {
  const push = pushOf(L) * 0.8;
  let best = { T: 3000, worst: Infinity };
  for (let T = 10; T < 3000; T += 2) {
    const [fx, fy] = aimThrust(L, gate, T);
    const [ex, ey] = aimThrust(L, gate, T, true);
    const worst = Math.max(Math.hypot(fx, fy), Math.hypot(ex, ey));
    if (worst <= push && fy > -0.2 && ey > -0.2) return T;
    if (worst < best.worst) best = { T, worst }; // (else the nearest it can get)
  }
  return best.T;
}

// The thrust (per unit mass) the computer wants now, moving on through its
// programs as it reaches each gate: P63 to High Gate, P64 to Low Gate, then
// P66, setting down -- on its target, in West crater.
export function thrustWanted(level, L) {
  for (;;) {
    if (L.prog === 63 || L.prog === 64) {
      const gate = L.prog === 63 ? GATES.high : GATES.low;
      L.tgoEnd ??= L.t + soonest(L, gate);
      let T = L.tgoEnd - L.t;
      if (T < 2) {
        L.prog = L.prog === 63 ? 64 : 66;
        L.tgoEnd = null;
        continue;
      }
      let f = aimThrust(L, gate, T);
      if (Math.hypot(...f) > pushOf(L) * 0.98) {
        L.tgoEnd = L.t + (T = soonest(L, gate));
        f = aimThrust(L, gate, T);
      }
      return f;
    }
    const alt = L.y - heightAt(level, L.x);
    const vxWant = Math.max(-15, Math.min(18, (XC - L.x) * 0.05));
    const vyWant = -Math.max(0.9, Math.min(5, alt * 0.06));
    return [(vxWant - L.vx) * 0.5, (vyWant - L.vy) * 1.2 - lift(L)];
  }
}

// The computer at the controls: the input for this moment.
export function computer(level, L) {
  const [fx, fy] = thrustWanted(level, L);
  const want = Math.max(-1.75, Math.min(1.75, Math.atan2(fx, Math.max(-0.5, fy))));
  const d = want - L.angle;
  const omegaWant = Math.sign(d) * Math.min(ROT_MAX * 0.9, Math.abs(d) * 4, Math.sqrt(2 * ROT_ACCEL * 0.8 * Math.abs(d)));
  const dw = omegaWant - L.omega;
  const need = Math.max(0, fx * Math.sin(L.angle) + fy * Math.cos(L.angle)) / pushOf(L);
  L.duty = (L.duty ?? 0) + (Math.abs(d) < 0.5 ? Math.min(1, need) : 0);
  const thrust = L.duty >= 1;
  if (thrust) L.duty -= 1;
  return { thrust, left: dw < -0.01, right: dw > 0.01 };
}

// Where each start hands over: true once the lander's there.
export function handedOver(start, L) {
  if (start === 'pdi') return true;
  if (start === 'high') return L.prog >= 64;
  return L.prog >= 66;
}

// The fuel to load: what leaves FUEL_SPARE seconds at Low Gate with the
// computer flying (a fuller tank is heavier, so found by trying).
function fuelFor(level) {
  let fuel = 600;
  for (let k = 0; k < 4; k++) {
    const L = startApollo(level, fuel);
    for (let i = 0; i < 1500 * 60 && L.prog < 66; i++) step(level, L, computer(level, L), 1 / 60);
    fuel = Math.ceil(fuel - L.fuel + FUEL_SPARE);
  }
  return fuel;
}
