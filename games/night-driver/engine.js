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
// Tyres: they grip up to about 1 g, shared between cornering and braking
// (the friction circle). Ask for more and they squeal, then slide.
export const GRIP = 9.81;
export const BRAKE = 9; // m/s^2 at full pressure: just inside the grip
export const SLIDE = 7.5; // a locked wheel's grip, braking and sideways
export const SEP = 50; // how far each branch ends up from the old centre (m)
export const SPLIT = 320; // over how far the branches part (m)
export const COMMIT = 2 * HALF; // once branches are this far apart, you've chosen
export const FIRST_FORK = 2600; // just the classic posts before this
export const SIGN_LEAD = 420; // the sign stands this far before its fork
export const HAZARD_AT = SPLIT + 80; // hazard this far past the fork
export const CHECKPOINT = 3000; // more time every this many metres
export const START_TIME = 75; // seconds
export const HAZARDS = ['wall', 'fire', 'bridge', 'cliff', 'washout', 'volcano', 'drawbridge'];

// The drawbridge: two leaves raised at RAMP, each LEAF metres long, GAP
// metres from hinge to hinge. Hit the near leaf fast enough and you fly
// across to the far one.
export const BRIDGE = { RAMP: (32 * Math.PI) / 180, LEAF: 18, GAP: 120 };
const G = 9.8;
const TIPS = BRIDGE.GAP - 2 * BRIDGE.LEAF * Math.cos(BRIDGE.RAMP); // tip to tip
// Speed to clear the gap between the raised tips (about 70 mph).
export const JUMP_V = Math.sqrt((TIPS * G) / Math.sin(2 * BRIDGE.RAMP));

// Height of a car above the road, s metres past the drawbridge's near hinge,
// launched at speed v: up the ramp, through the air, down the far leaf.
export function jumpHeight(s, v) {
  const { RAMP, LEAF, GAP } = BRIDGE;
  const t = Math.tan(RAMP);
  const lc = LEAF * Math.cos(RAMP);
  if (s <= 0) return 0;
  if (s <= lc) return s * t;
  const far = s > GAP - lc && s < GAP ? (GAP - s) * t : 0;
  const x = s - lc;
  const fly = lc * t + x * t - (G * x * x) / (2 * v * v * Math.cos(RAMP) ** 2);
  return Math.max(far, fly, 0);
}

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
    this.u = 0; // sideways slide, m/s (+ to the right)
    this.head = null; // heading off the road's direction (rad), last step
    this.turnRate = 0; // how fast that's changing, smoothed (rad/s)
    this.aLat = 0; // sideways acceleration asked of the tyres, m/s^2
    this.held = 0; // how long the brake has been held, s
    this.locked = false; // brakes locked up: skidding straight on
    this.squeal = 0; // 0..1: how hard the tyres are sliding (for the sound)
    this.chatter = 0; // 0..1: brakes at the limit (for the sound)
    this.fish = 0; // the tail swinging out (rad), and its swing rate
    this.fishV = 0;
  }

  // How much braking is asked for: it builds up over a third of a second
  // to the most the tyres will take (less in a bend, where cornering uses
  // some of the grip) -- the brakes chatter at that limit -- then, stand on
  // them for more than a second and a half, it goes past and they lock.
  brakeDemand() {
    const t = this.held;
    if (t <= 0) return 0;
    const room = Math.sqrt(Math.max(0, GRIP * GRIP - this.aLat * this.aLat)) * 0.97;
    return Math.min(BRAKE * Math.min(1, t / 0.3), room) + Math.max(0, t - 1.5) * 4;
  }

  // The hazard you're heading for, if you took a wrong turn.
  hazardAhead() {
    for (const f of this.road.forks) {
      if (!f.side || f.side === f.safe || f.jumped) continue;
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
    this.u = this.aLat = this.fish = this.fishV = this.held = this.turnRate = 0;
    this.head = null;
    this.locked = false;
    this.squeal = this.chatter = 0;
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
    const k = this.road.kappa(this.z);
    // Brakes: lock up if you ask more of the tyres than they have (braking
    // and cornering together), until you let go.
    this.held = input.brake && v > 0 ? this.held + dt : 0;
    const brake = this.brakeDemand();
    if (!brake || v < 2) this.locked = false;
    else if (Math.hypot(brake, this.aLat) > GRIP) this.locked = true;
    let a;
    if (this.locked) a = -SLIDE;
    else if (brake) a = -brake;
    else if (input.gas && this.time > 0) a = 7.5 * Math.pow(Math.max(0, 1 - v / VMAX), 0.6);
    else a = -1.2 - 0.0006 * v * v;
    // Locked wheels can't steer.
    const want = this.locked ? 0 : clamp(input.steer || 0, -1, 1);
    this.steer += (want - this.steer) * Math.min(1, dt * 12);
    // Sideways: where you point, minus the bend pushing you out.
    const head = this.steer * MAX_HEAD - v * k;
    // What that asks of the tyres: following the bend, plus turning into
    // or out of it (smoothed; a flick of the wheel adds up to 0.6 g).
    this.turnRate += (((head - (this.head ?? head)) / dt) - this.turnRate) * Math.min(1, dt * 4);
    this.head = head;
    const turn = v * v * k + clamp(v * this.turnRate, -0.6 * GRIP, 0.6 * GRIP);
    this.aLat += (turn - this.aLat) * Math.min(1, dt * 10);
    // The grip left over from braking; locked, only a sliding tyre's.
    const grip = this.locked ? SLIDE * 0.35 : Math.sqrt(Math.max(0, GRIP * GRIP - (brake && a < 0 ? a * a : 0)));
    const over = Math.abs(this.aLat) - grip;
    if (over > 0) {
      // More than the tyres can give: the car slides to the outside of the
      // turn, scrubbing off speed.
      this.u -= Math.sign(this.aLat) * over * dt;
      a -= over * 0.35;
    } else if (this.u) {
      // Grip to spare: the tyres catch the slide.
      const catchUp = Math.min(Math.abs(this.u), -over * 0.7 * dt + 0.3 * dt);
      this.u -= Math.sign(this.u) * catchUp;
    }
    this.u = clamp(this.u, -0.6 * v - 1, 0.6 * v + 1);
    this.v = clamp(v + a * dt, 0, VMAX);
    // The tail swings out as the slide builds and wags as it's caught: a
    // lightly damped spring, kicked by the slide.
    const slip = v > 1 ? Math.atan2(this.u, v) : 0;
    this.fishV += (-60 * (this.fish - slip * 1.6) - 3.5 * this.fishV) * dt;
    this.fish = clamp(this.fish + this.fishV * dt, -0.6, 0.6);
    // For the sounds.
    const use = Math.hypot(this.aLat, brake && !this.locked ? brake : 0) / GRIP;
    this.squeal = v < 3 ? 0 : this.locked ? 1 : clamp((Math.abs(this.aLat) / GRIP - 0.88) / 0.2, 0, 1) * 0.7 + clamp(Math.abs(this.u) / 3, 0, 0.3);
    this.chatter = brake && !this.locked && v > 4 ? clamp((use - 0.75) / 0.2, 0, 1) : 0;
    this.x += (v * head + this.u) * dt;
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
    if (hz && hz.kind === 'drawbridge' && hz.z - this.z <= 0 && this.v >= JUMP_V) {
      // Fast enough: off the ramp and across.
      hz.fork.jumped = true;
      hz.fork.jumpV = this.v;
      this.score += 1000;
      ev.push({ type: 'jump', speed: this.v });
    } else if (hz && hz.z - this.z <= (hz.kind === 'drawbridge' ? 0 : 1.5)) {
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
    // Long falls take a while to watch.
    this.freeze = kind === 'posts' ? 1.6 : kind === 'cliff' || kind === 'volcano' || kind === 'drawbridge' ? 4.6 : 2.8;
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
  // Slow for bends ahead so full lock is never needed, and the tyres never
  // squeal: the path's curvature is the road's plus the swerve onto a branch.
  let kmax = 0;
  for (let d = 0; d <= 160; d += 10) {
    const z = car.z + d;
    const swerve = (target(z + 5) - 2 * target(z) + target(z - 5)) / 25;
    kmax = Math.max(kmax, Math.abs(road.kappa(z)), Math.abs(road.kappa(z) + swerve));
  }
  // Holding a bend k at speed v takes steer = v k / MAX_HEAD, and v^2 k of grip.
  const vBend = kmax ? Math.min((MAX_HEAD * 0.75) / kmax, Math.sqrt((0.8 * GRIP) / kmax)) : VMAX;
  const vWant = Math.min(opts.speed || VMAX, vBend);
  // Pump the brakes rather than stand on them and lock up.
  return { steer, gas: car.v < vWant - 0.5, brake: car.v > vWant + 3 && car.held < 1.2 };
}
