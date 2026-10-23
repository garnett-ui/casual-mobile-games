// Lunar Lander: the autopilot's best flight -- the one shown before each
// mission and on the score card, and flown for "Show me". Not the careful
// pilot that sizes each level's fuel (autopilot() in engine.js): this one
// goes as fast as it can and still land.
//
// The plan: a smooth curve from the pad to the base -- straight up off the
// pad, over everything in the way with room to spare (or through the cave,
// tunnel or shaft), straight down onto the base -- and the fastest speed
// along it that the engine allows: at each point, the most it can speed up
// or slow down along the curve while it also bends the flight around it,
// against gravity, leaning no further than a limit (a "time-optimal path
// parametrisation"). The curve itself is then reshaped, a point at a time,
// for the quickest flight. A pilot follows the plan -- engine pulsed for the
// thrust it needs, the side thrusters turning it in time -- and the plan
// actually flown is the boldest one (the most of the engine) that still
// lands safely.
import { G, FEET, MAIN_THRUST, ROT_ACCEL, ROT_MAX, SAFE, newLander, step, topAt } from './engine.js';

const DS = 2; // the curve sampled every DS metres
const LIFT = 6; // straight up off the pad first...
const APPROACH = 14; // ...and straight down onto the base, from 1.5x this high,
const ENTRY = [APPROACH, APPROACH * 1.5]; // curving into it from this far aside and higher
const MARGIN = 9; // over open ground, the feet stay this far above anything...
const WIDE = FEET + 4; // ...within this either side
const SPACING = 24; // between the curve's adjustable points
const TOUCH = 0.8; // m/s, coming down onto the base
const CORNER = 1.2; // m/s, round a sharp corner
const SPARE = 0.8; // of the push planned for, coming down onto the base
const TILT = (25 * Math.PI) / 180; // the furthest it leans in open air
const TIGHT_TILT = (14 * Math.PI) / 180; // ...and in a cave, tunnel or shaft
const FULL = MAIN_THRUST / 1.5; // the engine's push on a full tank, the weakest

// ------------------------------------------------------------------ route

// The fixed points of the route, from the launch pad to the base: up off the
// pad, the level's own waypoints (caves, tunnels and shafts), down onto the
// base. "direct" legs (in confined spaces) are flown point to point; the
// others are open air, free to curve.
function skeleton(level) {
  const S = { x: (level.startPad.x0 + level.startPad.x1) / 2, y: level.startPad.y };
  const bx = (level.base.x0 + level.base.x1) / 2;
  const by = level.base.y;
  const pts = [S, { x: S.x, y: S.y + LIFT / 2, direct: true, fixed: true }, { x: S.x, y: S.y + LIFT, direct: true, fixed: true }];
  const keys = (level.keys || []).map((k) => ({ ...k }));
  const last = keys[keys.length - 1];
  if (!last || Math.abs(last.x - bx) > 1) {
    keys.push({ x: bx, y: by + APPROACH * 1.5 },
      { x: bx, y: by + APPROACH, direct: true, fixed: true },
      { x: bx, y: by + APPROACH / 2, direct: true, fixed: true });
  }
  keys.push({ x: bx, y: by, direct: true, fixed: true });
  // Into a straight drop (onto the base, or down a shaft): curving down
  // into it from off to one side, not turning sharply at the top.
  for (const k of keys) pts.push(k);
  for (let i = pts.length - 2; i > 0; i--) {
    const K = pts[i];
    const N = pts[i + 1];
    if (K.direct || !N.direct || Math.abs(N.x - K.x) > 1 || N.y > K.y) continue;
    const dir = Math.sign(K.x - pts[i - 1].x) || 1;
    pts.splice(i, 1, { x: K.x - dir * ENTRY[0], y: K.y + ENTRY[1] }, { ...K, direct: true, fixed: true });
  }
  return pts;
}

// Clearance over open ground: the highest solid point near each x.
function clearProfile(level) {
  const n = Math.ceil(level.width / 2) + 1;
  const tops = Array.from({ length: n }, (_, i) => topAt(level, i * 2));
  const w = Math.ceil(WIDE / 2);
  return tops.map((_, i) => {
    let m = -Infinity;
    for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) m = Math.max(m, tops[j]);
    return m;
  });
}
const clearAt = (prof, x) => prof[Math.max(0, Math.min(prof.length - 1, Math.round(x / 2)))];

// The control points of the curve, and for each open leg the lowest it may
// go: { pts: [{x, y, free}], open: [{x0, x1, floor(x)}] }.
function controls(level, prof) {
  const sk = skeleton(level);
  const pts = [{ ...sk[0] }, { ...sk[0] }, { ...sk[0] }];
  const open = [];
  for (let i = 1; i < sk.length; i++) {
    const P = sk[i - 1];
    const K = sk[i];
    if (!K.direct && Math.abs(K.x - P.x) > 1) {
      // Open air: the lowest it may fly is MARGIN over the ground, easing
      // in to the heights of the leg's two ends.
      const pClear = Math.max(0, P.y - clearAt(prof, P.x));
      const kClear = Math.max(0, K.y - clearAt(prof, K.x));
      const floor = (x) => clearAt(prof, x) + Math.min(MARGIN, pClear + Math.abs(x - P.x), kClear + Math.abs(x - K.x));
      const x0 = Math.min(P.x, K.x);
      const x1 = Math.max(P.x, K.x);
      open.push({ x0, x1, floor });
      // Start from the tightest string over it (the upper hull of the floor).
      const hull = [];
      const dir = Math.sign(K.x - P.x);
      const cand = [P];
      for (let x = P.x + 2 * dir; dir * (K.x - x) > 1; x += 2 * dir) cand.push({ x, y: floor(x) });
      cand.push(K);
      for (const q of cand) {
        while (hull.length >= 2) {
          const [a, b] = hull.slice(-2);
          const cross = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
          if (cross * dir >= 0) hull.pop();
          else break;
        }
        hull.push(q);
      }
      const yOn = (x) => {
        for (let j = 1; j < hull.length; j++) {
          const a = hull[j - 1];
          const b = hull[j];
          if (dir * (x - a.x) >= 0 && dir * (b.x - x) >= 0) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
        }
        return K.y;
      };
      const m = Math.max(0, Math.round(Math.abs(K.x - P.x) / SPACING) - 1);
      for (let j = 1; j <= m; j++) {
        const x = P.x + ((K.x - P.x) * j) / (m + 1);
        pts.push({ x, y: yOn(x), free: true });
      }
    }
    // A corner into or within a cave, tunnel or shaft: kept close by extra
    // points either side of it (wider on the open-air side).
    const N = sk[i + 1];
    const B = pts[pts.length - 1];
    const lp = Math.hypot(K.x - B.x, K.y - B.y);
    const ln = N ? Math.hypot(N.x - K.x, N.y - K.y) : 0;
    const cos = N ? ((K.x - B.x) * (N.x - K.x) + (K.y - B.y) * (N.y - K.y)) / (lp * ln || 1) : 1;
    const tight = K.direct && !K.fixed;
    if ((tight || (N?.direct && !N.fixed)) && cos < 0.94 && lp > 1 && ln > 1) {
      const r1 = Math.min(tight ? 3 : 8, lp / 3);
      const r2 = Math.min(3, ln / 3);
      pts.push({ x: K.x - ((K.x - B.x) * r1) / lp, y: K.y - ((K.y - B.y) * r1) / lp, tight });
      pts.push({ x: K.x, y: K.y, tight: true, corner: true });
      pts.push({ x: K.x + ((N.x - K.x) * r2) / ln, y: K.y + ((N.y - K.y) * r2) / ln, tight: true });
      continue;
    }
    pts.push({ x: K.x, y: K.y, tight });
  }
  const end = pts[pts.length - 1];
  pts.push({ ...end }, { ...end });
  return { pts, open };
}

// The curve (a cubic B-spline over the control points, its ends clamped),
// sampled about every DS metres along it: x, y, the distance along it, the
// unit tangent and the curvature vector at each, and how confined it is
// there (0 open air, 1 a cave, tunnel or shaft, 2 a sharp corner in one).
function curve(pts) {
  const spans = pts.length - 3;
  const counts = [];
  let N = 1;
  for (let i = 0; i < spans; i++) {
    const [a, b, c, d] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    const x0 = (a.x + 4 * b.x + c.x) / 6;
    const y0 = (a.y + 4 * b.y + c.y) / 6;
    const x1 = (b.x + 4 * c.x + d.x) / 6;
    const y1 = (b.y + 4 * c.y + d.y) / 6;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / DS));
    counts.push(n);
    N += n;
  }
  const out = {
    n: N, x: new Float64Array(N), y: new Float64Array(N), s: new Float64Array(N),
    tx: new Float64Array(N), ty: new Float64Array(N), kx: new Float64Array(N), ky: new Float64Array(N),
    tight: new Uint8Array(N),
  };
  let k = 0;
  for (let i = 0; i < spans; i++) {
    const [a, b, c, d] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    const t = b.corner || c.corner ? 2 : b.tight || c.tight ? 1 : 0;
    const n = counts[i];
    for (let j = i ? 1 : 0; j <= n; j++, k++) {
      const u = j / n;
      const v = 1 - u;
      const w0 = (v * v * v) / 6;
      const w1 = (3 * u * u * u - 6 * u * u + 4) / 6;
      const w2 = (-3 * u * u * u + 3 * u * u + 3 * u + 1) / 6;
      const w3 = (u * u * u) / 6;
      out.x[k] = w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x;
      out.y[k] = w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y;
      // First and second derivatives: the tangent and the bend.
      const d0 = (-v * v) / 2;
      const d1 = (3 * u * u - 4 * u) / 2;
      const d2 = (-3 * u * u + 2 * u + 1) / 2;
      const d3 = (u * u) / 2;
      const px = d0 * a.x + d1 * b.x + d2 * c.x + d3 * d.x;
      const py = d0 * a.y + d1 * b.y + d2 * c.y + d3 * d.y;
      const qx = v * a.x + (3 * u - 2) * b.x + (1 - 3 * u) * c.x + u * d.x;
      const qy = v * a.y + (3 * u - 2) * b.y + (1 - 3 * u) * c.y + u * d.y;
      const l2 = px * px + py * py;
      if (l2 > 1e-8) {
        const l = Math.sqrt(l2);
        const tx = px / l;
        const ty = py / l;
        const along = qx * tx + qy * ty;
        out.tx[k] = tx;
        out.ty[k] = ty;
        out.kx[k] = Math.max(-1, Math.min(1, (qx - along * tx) / l2));
        out.ky[k] = Math.max(-1, Math.min(1, (qy - along * ty) / l2));
      } else {
        // (At a clamped end the curve stands still: take the way it goes.)
        out.tx[k] = NaN;
      }
      out.tight[k] = t;
      if (k) out.s[k] = out.s[k - 1] + Math.hypot(out.x[k] - out.x[k - 1], out.y[k] - out.y[k - 1]);
    }
  }
  out.tight[N - 1] = 1;
  for (const [i, j] of [[0, 1], [N - 1, N - 2]]) {
    if (!Number.isNaN(out.tx[i])) continue;
    const dx = (out.x[j] - out.x[i]) * (j > i ? 1 : -1);
    const dy = (out.y[j] - out.y[i]) * (j > i ? 1 : -1);
    const l = Math.hypot(dx, dy) || 1;
    out.tx[i] = dx / l;
    out.ty[i] = dy / l;
    out.kx[i] = out.ky[i] = 0;
  }
  return out;
}

// The lowest the curve may go at each x (every 2 m), over the open legs.
// (Not right by their ends: there the fixed points steer it.)
function floors(level, open) {
  const f = new Float64Array(Math.ceil(level.width / 2) + 2).fill(-Infinity);
  for (const o of open) {
    for (let i = Math.ceil((o.x0 + 10) / 2); i * 2 < o.x1 - 10; i++) f[i] = Math.max(f[i], o.floor(i * 2));
  }
  return f;
}

// How far the curve dips below its floor, at worst, and where.
function lowest(c, floor) {
  let worst = 0;
  let at = -1;
  for (let i = 0; i < c.n; i++) {
    const d = floor[Math.max(0, Math.min(floor.length - 1, Math.round(c.x[i] / 2)))] - c.y[i];
    if (d > worst) [worst, at] = [d, i];
  }
  return { worst, at };
}

// ------------------------------------------------------------------ speed

// Coming down onto the base, h metres up: the furthest it leans (radians),
// so as to touch down near enough upright.
const upright = (h) => 0.02 + Math.max(0, h - 2) * 0.03;

// The thrust it may use (per unit mass) is any within A of nothing, leaning
// at most `tilt` from straight up: how far that reaches in direction (dx, dy).
function reach(A, tilt, dx, dy) {
  const off = Math.abs(Math.atan2(dx, dy)) - tilt;
  return off <= 0 ? A : Math.max(0, A * Math.cos(off));
}

// At a point of the curve going at speed^2 u: the range of speeding up
// along it (m/s^2) the engine allows, [LO, HI] -- or false if it can't hold
// the curve there.
let LO = 0;
let HI = 0;
function along(c, i, u, A, tilt) {
  const tx = c.tx[i];
  const ty = c.ty[i];
  // Thrust needed = sdd * t + q, q = u * curvature + gravity's opposite.
  const qx = u * c.kx[i];
  const qy = u * c.ky[i] + G;
  const qt = qx * tx + qy * ty;
  const disc = qt * qt - (qx * qx + qy * qy) + A * A;
  if (disc < 0) return false;
  LO = -qt - Math.sqrt(disc);
  HI = -qt + Math.sqrt(disc);
  // The leaning limit, as two half-planes.
  const sn = Math.sin(tilt);
  const cs = Math.cos(tilt);
  for (let side = -1; side <= 1; side += 2) {
    const te = side * cs * tx - sn * ty;
    const qe = side * cs * qx - sn * qy;
    if (Math.abs(te) < 1e-9) {
      if (qe > 1e-9) return false;
    } else if (te > 0) HI = Math.min(HI, -qe / te);
    else LO = Math.max(LO, -qe / te);
  }
  if (LO > HI + 1e-9) return false;
  HI = Math.max(LO, HI);
  return true;
}

// The fastest way along the curve, from rest on the pad to TOUCH m/s on the
// base, using `push` of the engine (planned for a full tank, the heaviest):
// speed^2 at each point, and the time it takes.
function speeds(c, push, tightV) {
  const N = c.n;
  // (Confined, and coming down onto the base, it keeps some push spare.)
  const landing = c.s[N - 1] - APPROACH * 1.5;
  const pushAt = (i) => FULL * (c.tight[i] || c.s[i] >= landing ? Math.min(push, SPARE) : push);
  // (Low over the base, it leans less and less: see upright() below.)
  const tiltAt = (i) => Math.min(c.tight[i] ? TIGHT_TILT : TILT, c.s[i] >= landing ? upright(c.y[i] - c.y[N - 1]) : 9);
  const umax = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = pushAt(i);
    const tilt = tiltAt(i);
    // How fast it can take the bend here: where the needed thrust, across
    // the curve, is no more than the engine can give.
    const nx = -c.ty[i];
    const ny = c.tx[i];
    const q = c.kx[i] * nx + c.ky[i] * ny;
    const g = G * ny;
    // (Round a sharp corner slowly, a cave or tunnel at tightV at most.)
    let u = c.tight[i] === 2 ? CORNER * CORNER : c.tight[i] ? tightV * tightV : 60 * 60;
    if (q > 1e-9) u = Math.min(u, (reach(a, tilt, nx, ny) - g) / q);
    else if (q < -1e-9) u = Math.min(u, (reach(a, tilt, -nx, -ny) + g) / -q);
    umax[i] = Math.max(0, u);
  }
  umax[N - 1] = Math.min(umax[N - 1], TOUCH * TOUCH);
  const u = new Float64Array(N);
  for (let i = 0; i + 1 < N; i++) {
    const up = along(c, i, u[i], pushAt(i), tiltAt(i)) ? Math.max(0, HI) : 0;
    u[i + 1] = Math.min(umax[i + 1], u[i] + 2 * (c.s[i + 1] - c.s[i]) * up);
  }
  for (let i = N - 1; i > 0; i--) {
    const down = along(c, i, u[i], pushAt(i), tiltAt(i)) ? Math.min(0, LO) : 0;
    u[i - 1] = Math.min(u[i - 1], u[i] - 2 * (c.s[i] - c.s[i - 1]) * down);
  }
  let time = 0;
  for (let i = 0; i + 1 < N; i++) time += (2 * (c.s[i + 1] - c.s[i])) / (Math.sqrt(u[i]) + Math.sqrt(u[i + 1]) || 1e-3);
  return { u, time };
}

// ------------------------------------------------------------------ plan

// The quickest curve: each adjustable point raised or lowered (keeping the
// curve clear of the ground) while that makes the flight quicker.
function shape(level, push, tightV) {
  const prof = clearProfile(level);
  const { pts, open } = controls(level, prof);
  const floor = floors(level, open);
  const free = pts.map((p, i) => (p.free ? i : -1)).filter((i) => i >= 0);
  // First, lift it clear wherever smoothing the corners dipped it.
  for (let k = 0; k < 60; k++) {
    const c = curve(pts);
    const { worst, at } = lowest(c, floor);
    if (worst <= 0.01) break;
    const x = c.x[at];
    const near = free.filter((i) => Math.abs(pts[i].x - x) < SPACING * 1.5)
      .sort((i, j) => Math.abs(pts[i].x - x) - Math.abs(pts[j].x - x)).slice(0, 2);
    if (!near.length) break;
    for (const i of near) pts[i].y += worst + 0.5;
  }
  let best = speeds(curve(pts), push, tightV).time;
  for (const d of [16, 6, 2]) {
    for (let sweep = 0; sweep < 2; sweep++) {
      let better = false;
      for (const i of free) {
        for (const dy of [d, -d]) {
          pts[i].y += dy;
          const c = curve(pts);
          const t = lowest(c, floor).worst > 0.01 ? Infinity : speeds(c, push, tightV).time;
          if (t < best - 1e-3) {
            best = t;
            better = true;
            break;
          }
          pts[i].y -= dy;
        }
      }
      if (!better) break;
    }
  }
  return pts;
}

// A plan: the curve, and the speed and acceleration wanted along it.
export function planFlight(level, { push = 1, tightV = 5, pts } = {}) {
  pts ??= shape(level, push, tightV);
  const c = curve(pts);
  const { u, time } = speeds(c, push, tightV);
  const N = c.n;
  c.v = new Float64Array(N);
  c.ax = new Float64Array(N);
  c.ay = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    c.v[i] = Math.sqrt(u[i]);
    const sdd = i < N - 1 ? (u[i + 1] - u[i]) / (2 * (c.s[i + 1] - c.s[i] || 1)) : 0;
    c.ax[i] = sdd * c.tx[i] + u[i] * c.kx[i];
    c.ay[i] = sdd * c.ty[i] + u[i] * c.ky[i];
  }
  return { ...c, time, pts };
}

// ------------------------------------------------------------------ pilot

const AHEAD = 2.5; // s: it turns for the thrust wanted this far ahead
const GAIN = 0.25; // 1/s: how hard it corrects its speed...
const BACK = 0.25; // ...and its place, off the curve
// (Gentle: the side thrusters turn it slowly, so steering harder would only
// make it swing past and back.)

// Flies a plan: finds its place on the curve, wants the planned speed along
// it (and to be back on it), turns to point the engine the way that needs
// -- a little ahead of time, as turning takes a while -- and pulses the
// engine for just the push it needs. Returns the input for this moment.
export function follow(plan, L) {
  const N = plan.n;
  let i = L.pi ?? 0;
  let best = Infinity;
  let at = i;
  for (let j = Math.max(0, i - 4); j < Math.min(N, i + 30); j++) {
    const d = (plan.x[j] - L.x) ** 2 + (plan.y[j] - L.y) ** 2;
    if (d < best) [best, at] = [d, j];
  }
  i = L.pi = at;
  const tx = plan.tx[i];
  const ty = plan.ty[i];
  // Off the curve by e (to its left); steer back.
  const e = -(L.x - plan.x[i]) * ty + (L.y - plan.y[i]) * tx;
  const back = Math.max(-4, Math.min(4, -e * BACK));
  const end = i >= N - 1;
  const v = end ? TOUCH : Math.max(0.5, plan.v[i]);
  let vxWant = tx * v - ty * back;
  let vyWant = ty * v + tx * back;
  // Coming straight down onto the base: line up over its middle (gently --
  // it can't lean far), and if it's off to one side, hold the height until
  // it's over the pad again.
  const h = L.y - plan.y[N - 1];
  const landing = plan.s[N - 1] - plan.s[i] < APPROACH * 1.5 && Math.abs(tx) < 0.3;
  const dx = plan.x[N - 1] - L.x;
  const off = Math.abs(dx) > 1.2 && h < 6;
  if (landing) {
    vxWant = Math.sign(dx) * Math.min(1, Math.sqrt(0.15 * Math.abs(dx)));
    if (off) vyWant = Math.max(vyWant, (1.5 - h) * 0.5);
  }
  let j = i;
  const far = plan.s[i] + Math.max(1, plan.v[i]) * AHEAD;
  while (j < N - 1 && plan.s[j] < far) j++;
  const ax = plan.ax[j] + (vxWant - L.vx) * GAIN;
  const ay = plan.ay[j] + (vyWant - L.vy) * GAIN + G;
  const push = MAIN_THRUST / (1 + 0.5 * (L.fuel / L.fuelMax));
  const tight = plan.tight[i];
  const lean = tight ? TIGHT_TILT : TILT + 0.1;
  let want = Math.max(-lean, Math.min(lean, Math.atan2(ax, Math.max(0.3, ay))));
  // Close to the ground, coming down: upright for the landing.
  if (landing) {
    const most = off ? 0.14 : upright(h);
    want = Math.max(-most, Math.min(most, want));
  }
  const d = want - L.angle;
  const omegaWant = Math.sign(d) * Math.min(ROT_MAX * 0.9, Math.abs(d) * 4, Math.sqrt(2 * ROT_ACCEL * 0.8 * Math.abs(d)));
  const dw = omegaWant - L.omega;
  // The push it needs, along the way it's pointing, pulsed.
  const need = Math.max(0, ax * Math.sin(L.angle) + ay * Math.cos(L.angle)) / push;
  L.duty = (L.duty ?? 0) + Math.min(1, need);
  const thrust = L.duty >= 1;
  if (thrust) L.duty -= 1;
  return { thrust, left: dw < -0.01, right: dw > 0.01 };
}

// Fly a plan, start to finish, as the game would (physics every 1/120 s):
// the outcome and the path flown, [x, y, speed] every `every` seconds.
export function flyPlan(level, plan, fuel = level.fuel ?? 2000, every = 0.25, maxTime = 900) {
  const L = newLander(level, fuel);
  const dt = 1 / 120;
  const path = [[L.x, L.y, 0]];
  const per = Math.round(every / dt);
  for (let k = 1; k < maxTime / dt; k++) {
    const res = step(level, L, follow(plan, L), dt);
    if (k % per === 0) path.push([L.x, L.y, Math.hypot(L.vx, L.vy)]);
    if (res && res.kind !== 'touchdown') {
      path.push([L.x, L.y]);
      return { res, path, time: L.t, fuel: L.fuel };
    }
  }
  return { res: { kind: 'timeout' }, path, time: L.t, fuel: L.fuel };
}

// The best flight for a level: plans from the boldest down, the first that
// lands about as planned wins (else the quickest that landed at all).
// { plan, res, path, time } -- or null if none lands.
export function bestFlight(level) {
  let shaped;
  let best = null;
  for (const push of [1, 0.92, 0.85, 0.78]) {
    for (const tightV of [14, 9, 6, 4, 2.5]) {
      const plan = planFlight(level, { push, tightV, pts: shaped?.push === push ? shaped.pts : undefined });
      shaped = { push, pts: plan.pts };
      const run = flyPlan(level, plan);
      if (run.res.kind === 'landed') {
        if (!best || run.time < best.time) best = { plan, push, tightV, ...run };
        if (run.time < plan.time * 1.1 + 5) return best;
      }
      if (!plan.tight.some(Boolean)) break; // (nothing confined to slow down for)
    }
  }
  return best;
}
