// Elevator Operator: the building, the people and the cars -- no DOM, so it
// can be tested in Node.
//
// You're the dispatcher. Each car has one "next stop" at a time: send it to
// a floor and it goes there (turning round at once if you change your mind),
// opens its doors, lets out anyone who wanted that floor, takes on everyone
// waiting (up to its capacity) and closes again. The people inside press the
// buttons for their floors; those light up in the car's shaft.
import { rng, seedFor } from '../../js/lib/random.js';

export const FLOORS = 20; // 0 is the lobby
export const CARS = 2;
export const CAPACITY = 8;
export const VMAX = 2.5; // floors per second
export const ACCEL = 2.5; // floors per second^2
export const DOOR = 0.8; // seconds for the doors to open, or to close
export const STEP_TIME = 0.4; // seconds for each person to get on or off
export const DWELL = 0.8; // the doors stay open at least this long

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const WALK = 3; // seconds a new arrival takes to walk up and press the button
export const BASE_SEED = 20261018;

// Level n: how many people come, how often (on average), and where they're
// going. The first is 20 people about 10 seconds apart; each level after
// brings more of them, closer together, and the traffic changes: a mix,
// the morning rush (up from the lobby), the evening rush (down to it), and
// lunchtime (down, then back up).
const PATTERNS = ['mixed', 'morning', 'evening', 'lunch'];
export function levelSpec(n) {
  return {
    n,
    people: Math.min(80, 20 + 5 * (n - 1)),
    gap: Math.max(2.5, 10 * 0.87 ** (n - 1)),
    pattern: PATTERNS[(n - 1) % PATTERNS.length],
    seed: seedFor(n, BASE_SEED),
  };
}

// The arrivals: a Poisson process (independent, at a steady average rate),
// seeded so you and the dispatcher meet exactly the same people.
export function schedule(spec) {
  const r = rng(spec.seed);
  const people = [];
  const floor = () => 1 + Math.floor(r() * (FLOORS - 1));
  let t = WALK;
  for (let id = 0; id < spec.people; id++) {
    if (id) t += -Math.log(1 - r()) * spec.gap;
    const k = id / spec.people;
    const [up, down] = {
      mixed: [0.4, 0.35],
      morning: [0.75, 0.1],
      evening: [0.1, 0.75],
      lunch: k < 0.5 ? [0.15, 0.7] : [0.7, 0.15],
    }[spec.pattern];
    const pick = r();
    let from;
    let to;
    if (pick < up) {
      from = 0;
      to = floor();
    } else if (pick < up + down) {
      from = floor();
      to = 0;
    } else {
      from = floor();
      do to = floor(); while (to === from);
    }
    // Looks: skin, hair, shirt, trousers (indexes into the view's palettes).
    const look = [r(), r(), r(), r()].map((x) => Math.floor(x * 1e6));
    people.push({ id, t, from, to, look });
  }
  return people;
}

export class Sim {
  constructor(spec) {
    this.spec = spec;
    this.t = 0;
    this.arrivals = schedule(spec);
    this.next = 0;
    this.waiting = Array.from({ length: FLOORS }, () => []);
    this.cars = Array.from({ length: CARS }, (_, i) => ({
      i,
      pos: 0, // floor, fractional while moving
      v: 0, // floors per second, + up
      target: null, // the one next stop
      phase: 'idle', // idle | moving | opening | loading | closing
      timer: 0,
      open: 0, // how open the doors are, 0..1
      dwell: 0,
      riders: [],
      dir: 1, // which way it was last going (for the dispatcher)
    }));
    this.delivered = 0;
    this.trips = []; // { wait, ride } for everyone delivered
    this.over = false;
  }

  floorOf(car) {
    return Math.round(car.pos);
  }

  // Send car i to floor f: its next stop, replacing any other.
  send(i, f) {
    const car = this.cars[i];
    if (this.over || f < 0 || f >= FLOORS) return;
    car.target = f;
  }

  // The floors the people in car i want (lit in its shaft).
  lit(i) {
    return new Set(this.cars[i].riders.map((p) => p.to));
  }

  step(dt) {
    const ev = [];
    if (this.over) return ev;
    this.t += dt;
    // People turn up and wait for a lift.
    while (this.next < this.arrivals.length && this.arrivals[this.next].t <= this.t) {
      const a = this.arrivals[this.next++];
      this.waiting[a.from].push({ ...a });
      ev.push({ type: 'arrive', floor: a.from, id: a.id });
    }
    for (const car of this.cars) this.stepCar(car, dt, ev);
    // Done when everyone has got where they were going.
    if (this.delivered === this.arrivals.length) {
      this.over = true;
      ev.push({ type: 'over', ...this.stats() });
    }
    return ev;
  }

  stepCar(car, dt, ev) {
    const here = this.floorOf(car);
    switch (car.phase) {
      case 'idle':
        if (car.target === null) break;
        if (car.target === here) this.openAt(car, ev);
        else car.phase = 'moving';
        break;
      case 'moving': {
        const d = car.target - car.pos;
        // As fast as it can go and still stop at the target; past it (if
        // sent to a floor it was already too close to stop for), it comes
        // back.
        const want = Math.sign(d) * Math.min(VMAX, Math.sqrt(2 * ACCEL * Math.abs(d)));
        car.v += clamp(want - car.v, -ACCEL * dt, ACCEL * dt);
        const pos = car.pos + car.v * dt;
        if (car.v) car.dir = Math.sign(car.v);
        if ((car.target - pos) * d <= 0 && Math.abs(car.v) < 1.2) {
          car.pos = car.target;
          car.v = 0;
          this.openAt(car, ev);
        } else car.pos = pos;
        break;
      }
      case 'opening':
        car.timer -= dt;
        car.open = clamp(1 - car.timer / DOOR, 0, 1);
        if (car.timer <= 0) {
          car.phase = 'loading';
          car.open = 1;
          car.timer = 0;
          car.dwell = 0;
        }
        break;
      case 'loading': {
        car.dwell += dt;
        car.timer -= dt;
        // One at a time: first everyone getting off, then everyone waiting
        // gets on (while there's room).
        while (car.timer <= 0) {
          const out = car.riders.findIndex((p) => p.to === here);
          if (out >= 0) {
            const [p] = car.riders.splice(out, 1);
            this.delivered++;
            this.trips.push({ wait: p.boarded - p.t, ride: this.t - p.boarded });
            ev.push({ type: 'deliver', car: car.i, floor: here, id: p.id, look: p.look });
            car.timer += STEP_TIME;
          } else if (this.waiting[here].length && car.riders.length < CAPACITY) {
            const p = this.waiting[here].shift();
            p.boarded = this.t;
            car.riders.push(p);
            ev.push({ type: 'board', car: car.i, floor: here, id: p.id });
            car.timer += STEP_TIME;
          } else {
            car.timer = 0;
            break;
          }
        }
        if (car.timer <= 0 && car.dwell >= DWELL) {
          car.phase = 'closing';
          car.timer = DOOR;
        }
        break;
      }
      case 'closing':
        car.timer -= dt;
        car.open = clamp(car.timer / DOOR, 0, 1);
        if (car.timer <= 0) {
          car.open = 0;
          car.phase = 'idle';
        }
        break;
      default:
        break;
    }
  }

  openAt(car, ev) {
    car.target = null;
    car.phase = 'opening';
    car.timer = DOOR;
    ev.push({ type: 'stop', car: car.i, floor: this.floorOf(car) });
  }

  // Average wait (from pressing the button to getting in), ride and the
  // whole trip, and when the last person arrived.
  stats() {
    const n = this.trips.length || 1;
    const wait = this.trips.reduce((a, x) => a + x.wait, 0) / n;
    const ride = this.trips.reduce((a, x) => a + x.ride, 0) / n;
    return { delivered: this.delivered, wait, ride, trip: wait + ride, time: this.t };
  }

  waitingCount() {
    return this.waiting.reduce((n, w) => n + w.length, 0);
  }
}

// ------------------------------------------------------------- dispatcher

// A good dispatcher, to measure you against. (The best possible schedule
// isn't something anyone can compute in time -- the number of ways to
// order the stops explodes -- so this is the classic "collective control"
// used by real lift groups, tuned a few ways, best of them taken.)
//
// Each car keeps going the way it's going, stopping at the nearest floor
// ahead where someone inside wants to get off or someone is waiting (and the
// other car isn't already on its way there); when there's nothing more
// ahead it turns round. Moving cars pick people up on the way if they can
// still stop in time.
export function dispatch(sim, opts = {}) {
  const { claim = true, ahead = true, park = true } = opts;
  for (const car of sim.cars) {
    const want = new Set(car.riders.map((p) => p.to));
    if (car.riders.length < CAPACITY) {
      sim.waiting.forEach((w, f) => {
        if (!w.length) return;
        // Leave it to the other car if that one's already heading there.
        if (claim && sim.cars.some((o) => o !== car && o.target === f)) return;
        want.add(f);
      });
    }
    const busy = car.phase === 'opening' || car.phase === 'loading' || car.phase === 'closing';
    const stopping = (car.v * car.v) / (2 * ACCEL) + 0.15;
    const nearest = (dir, from, min) => {
      let best = null;
      for (const f of want) {
        const d = (f - from) * dir;
        if (d >= min && (best === null || d < (best - from) * dir)) best = f;
      }
      return best;
    };
    if (car.phase === 'moving' && ahead) {
      // Something to pick up (or drop off) on the way?
      const f = nearest(car.dir, car.pos, stopping);
      if (f !== null && (car.target - car.pos) * car.dir > (f - car.pos) * car.dir) sim.send(car.i, f);
      continue;
    }
    if (busy || car.target !== null) continue;
    const here = sim.floorOf(car);
    let f = nearest(car.dir, here, 1);
    if (f === null) f = nearest(-car.dir, here, 1);
    if (f === null && want.has(here) && sim.waiting[here].length) f = here;
    if (f === null && park && here !== 0 && car.i === 0) f = 0; // wait in the lobby
    if (f !== null) sim.send(car.i, f);
  }
}

// Runs the level with the dispatcher until everyone's delivered.
export function playDispatcher(spec, opts = {}, dt = 1 / 20) {
  const sim = new Sim(spec);
  while (!sim.over && sim.t < 3600) {
    dispatch(sim, opts);
    sim.step(dt);
  }
  return sim;
}

// The time to beat: the shortest average trip of a few versions of the
// dispatcher, on the same people.
export const VARIANTS = [{}, { claim: false }, { park: false }, { ahead: false }];
export function par(spec) {
  let best = null;
  for (const opts of VARIANTS) {
    const s = playDispatcher(spec, opts).stats();
    if (!best || s.trip < best.trip) best = { ...s, opts };
  }
  return best;
}
