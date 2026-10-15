// Night Driver: the road, the car and the rules. No DOM, so the tests can
// drive it in Node.
//
// The road is a centre line that bends (curvature per metre, generated from a
// seed and getting twistier the further you go), lined with white posts.
// Later on it forks: two branches part over a few hundred metres, a green
// sign before the fork says where each one goes, and one of them ends in a
// hazard. The car's position is z (metres along the road) and x (metres
// sideways from the road's original centre line; taking a branch moves the
// road's centre, not the car).
import { rng } from '../../js/lib/random.js';
import { RIDDLES } from './signs.js';

export const HALF = 5; // road half-width (m)
export const POST_OUT = HALF + 0.7; // the posts stand just off the road
export const POST_GAP = 14; // between posts (m)
export const CAR = 0.9; // half the car's width (m)
export const VMAX = 58; // top speed, m/s (130 mph)
export const MPH = 2.23694;
export const MAX_HEAD = 0.35; // full lock: heading off the road's direction (rad)
export const SEP = 50; // how far each branch ends up from the old centre (m)
export const SPLIT = 320; // over how far the branches part (m)
export const COMMIT = 2 * HALF; // once branches are this far apart, you've chosen
export const FIRST_FORK = 2600; // just the classic posts before this
export const SIGN_LEAD = 420; // the sign stands this far before its fork
export const HAZARD_AT = SPLIT + 80; // hazard this far past the fork
export const CHECKPOINT = 3000; // more time every this many metres
export const START_TIME = 75; // seconds
export const HAZARDS = ['wall', 'fire', 'bridge', 'cliff', 'washout'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// How far a branch of `fork` has moved off the centre line at z.
export function split(fork, z) {
  return SEP * smooth((z - fork.z) / SPLIT);
}

export class Road {
  constructor(seed = 1) {
    this.seed = seed;
    this.r = rng(seed);
    this.sections = []; // { z0, z1, k }: a bend of curvature k, eased in and out
    this.forks = [];
    this.end = 0;
    this.nextFork = FIRST_FORK;
    this.bag = [];
    this.easyLeft = RIDDLES.filter((q) => q.easy).length;
    this.extend(1500);
  }

  // 0 at the start, 1 from 15 km on.
  difficulty(z) {
    return clamp(z / 15000, 0, 1);
  }

  extend(toZ) {
    while (this.end < toZ) {
      const z0 = this.end;
      const zone = this.nextFork - SIGN_LEAD - 150;
      if (z0 >= zone) {
        // Straight from before the sign until well past the split.
        const z1 = this.nextFork + HAZARD_AT + 150;
        this.sections.push({ z0, z1, k: 0 });
        this.addFork(this.nextFork);
        this.end = z1;
        const d = this.difficulty(this.nextFork);
        this.nextFork += Math.round(2700 - 1300 * d + this.r() * 600);
        continue;
      }
      const d = this.difficulty(z0);
      let len = 150 + this.r() * 350;
      if (zone - (z0 + len) < 120) len = zone - z0;
      let k = 0;
      if (this.r() > 0.35 - 0.2 * d) {
        // Bends tighten from a 700 m radius to 110 m.
        const kmax = 1 / 700 + d * (1 / 110 - 1 / 700);
        k = (this.r() < 0.5 ? -1 : 1) * kmax * (0.45 + 0.55 * this.r());
      }
      this.sections.push({ z0, z1: z0 + len, k });
      this.end = z0 + len;
    }
  }

  addFork(z) {
    if (!this.bag.length) {
      // Plain signs come first, then everything, shuffled.
      const ids = RIDDLES.map((_, i) => i).filter((i) => this.forks.length >= this.easyLeft || RIDDLES[i].easy);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(this.r() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      this.bag = ids;
    }
    const riddle = RIDDLES[this.bag.pop()];
    const mirror = this.r() < 0.5;
    const panels = mirror ? [riddle.right, riddle.left] : [riddle.left, riddle.right];
    const safeLeft = (riddle.safe === 'L') !== mirror;
    // side: which branch the car took (-1 left, +1 right, 0 not yet).
    this.forks.push({ z, panels, safe: safeLeft ? -1 : 1, hazard: riddle.hazard, side: 0, n: this.forks.length });
  }

  section(z) {
    const s = this.sections;
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid].z0 <= z) lo = mid;
      else hi = mid - 1;
    }
    return s[lo];
  }

  // Curvature at z (1/m, positive bends right).
  kappa(z) {
    if (z < 0) return 0;
    const s = this.section(z);
    if (!s.k) return 0;
    const ease = Math.min(1, (z - s.z0) / 80, (s.z1 - z) / 80);
    return s.k * Math.max(0, ease);
  }

  // Centre of the road you're on at z: the original line plus the branches
  // already taken.
  center(z) {
    let c = 0;
    for (const f of this.forks) if (f.side && z > f.z) c += f.side * split(f, z);
    return c;
  }

  // The fork whose branches you're between and haven't chosen yet, if any.
  openFork(z) {
    return this.forks.find((f) => !f.side && z > f.z - 1 && z < f.z + SPLIT + 50) || null;
  }

  // The next fork you haven't chosen at yet.
  upcoming(z) {
    return this.forks.find((f) => !f.side && f.z > z - SPLIT) || null;
  }

  // Branch centres at z: one, or two while a fork is still open.
  branches(z) {
    const c = this.center(z);
    const f = this.openFork(z);
    if (!f || z <= f.z) return [c];
    const s = split(f, z);
    return [c - s, c + s];
  }
}

export class Car {
  constructor(road) {
    this.road = road;
    this.z = 0;
    this.x = 0;
    this.v = 0;
    this.steer = 0; // -1 full left .. 1 full right, eased toward the input
    this.time = START_TIME;
    this.score = 0;
    this.dist = 0;
    this.freeze = 0; // seconds until you can drive again (after a crash)
    this.over = false;
    this.nextCheckpoint = CHECKPOINT;
    this.crashes = 0;
    this.goodCalls = 0;
  }

  // The hazard you're heading for, if you took a wrong turn.
  hazardAhead() {
    for (const f of this.road.forks) {
      if (!f.side || f.side === f.safe) continue;
      const z = f.z + HAZARD_AT;
      if (z > this.z - 1) return { fork: f, z, kind: f.hazard };
    }
    return null;
  }

  onRoad() {
    const room = POST_OUT - CAR;
    return this.road.branches(this.z).some((c) => Math.abs(this.x - c) <= room);
  }

  // Back on a good road, standing still.
  recover() {
    this.v = 0;
    const bs = this.road.branches(this.z);
    this.x = bs.reduce((best, c) => (Math.abs(c - this.x) < Math.abs(best - this.x) ? c : best), bs[0]);
  }

  // input: { gas, brake, steer (-1..1) }. Returns a list of events.
  step(dt, input) {
    const ev = [];
    if (this.over) return ev;
    this.time = Math.max(0, this.time - dt);
    if (this.freeze > 0) {
      this.freeze -= dt;
      this.v = 0;
      if (this.time <= 0) this.end(ev);
      return ev;
    }
    const v = this.v;
    let a;
    if (input.brake) a = -14;
    else if (input.gas && this.time > 0) a = 7.5 * Math.pow(Math.max(0, 1 - v / VMAX), 0.6);
    else a = -1.2 - 0.0006 * v * v;
    this.v = clamp(v + a * dt, 0, VMAX);
    this.steer += (clamp(input.steer || 0, -1, 1) - this.steer) * Math.min(1, dt * 12);
    // Sideways: where you point, minus the bend pushing you out.
    const k = this.road.kappa(this.z);
    this.x += this.v * (this.steer * MAX_HEAD - this.v * k) * dt;
    this.z += this.v * dt;
    this.dist += this.v * dt;
    this.score += (this.v * dt) / 4;
    this.road.extend(this.z + 1000);

    for (const f of this.road.forks) {
      if (f.side || this.z < f.z || split(f, this.z) < COMMIT) continue;
      const c = this.road.center(this.z);
      f.side = this.x < c ? -1 : 1;
      const good = f.side === f.safe;
      if (good) {
        this.score += 500;
        this.goodCalls++;
      }
      ev.push({ type: 'commit', fork: f, good });
    }
    if (this.z >= this.nextCheckpoint) {
      this.nextCheckpoint += CHECKPOINT;
      // Less each time: even a perfect drive runs out of time eventually.
      const bonus = Math.max(20, 45 - 5 * Math.floor(this.z / 6000));
      this.time += bonus;
      ev.push({ type: 'checkpoint', bonus });
    }
    const hz = this.hazardAhead();
    if (hz && hz.z - this.z <= 1.5) {
      this.crash(ev, hz.kind, hz.fork);
    } else if (hz && this.v === 0 && hz.z - this.z < 90) {
      // Stopped in time: turn round and take the other road.
      hz.fork.side = hz.fork.safe;
      this.recover();
      this.freeze = 1.5;
      ev.push({ type: 'phew', kind: hz.kind });
    } else if (!this.onRoad()) {
      this.crash(ev, 'posts');
    }
    if (this.time <= 0 && this.v === 0) this.end(ev);
    return ev;
  }

  crash(ev, kind, fork = null) {
    this.crashes++;
    ev.push({ type: 'crash', kind, speed: this.v });
    if (fork) fork.side = fork.safe;
    this.recover();
    this.freeze = kind === 'posts' ? 1.6 : 2.8;
  }

  end(ev) {
    if (this.over) return;
    this.over = true;
    this.freeze = 0;
    ev.push({ type: 'over', score: Math.floor(this.score) });
  }
}

// Drives the car well: the tests use it, and the browser tests switch it on.
export function autopilot(car, opts = {}) {
  const { road } = car;
  const v = Math.max(car.v, 5);
  const look = clamp(v * 0.7, 8, 40);
  // Aim for the safe branch of the next fork (or the wrong one, if asked).
  const target = (z) => {
    const f = road.openFork(z) || (road.upcoming(z) && road.upcoming(z).z < z + 60 ? road.upcoming(z) : null);
    const c = road.center(z);
    if (!f || z <= f.z) return c;
    return c + (opts.wrong ? -f.safe : f.safe) * split(f, z);
  };
  const k = road.kappa(car.z + look * 0.3);
  const steer = clamp(((target(car.z + look) - car.x) / look + v * k) / MAX_HEAD, -1, 1);
  // Slow for bends ahead so full lock is never needed.
  let kmax = 0;
  for (let d = 0; d <= 160; d += 10) kmax = Math.max(kmax, Math.abs(road.kappa(car.z + d)));
  // Holding a bend k at speed v takes steer = v k / MAX_HEAD.
  const vBend = kmax ? (MAX_HEAD * 0.75) / kmax : VMAX;
  const vWant = Math.min(opts.speed || VMAX, vBend);
  return { steer, gas: car.v < vWant - 0.5, brake: car.v > vWant + 3 };
}
