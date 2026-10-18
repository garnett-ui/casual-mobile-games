// Elevator Operator: the building, the people and the cars -- no DOM, so it
// can be tested in Node.
//
// You're the dispatcher. Each car has one "next stop" at a time: send it to
// a floor and it goes there (turning round at once if you change your mind),
// opens its doors, lets out anyone who wanted that floor, takes on everyone
// waiting (up to its capacity) and closes again. The people inside press the
// buttons for their floors; those light up in the car's shaft.
import { rng, seedFor } from '../../js/lib/random.js';

// The building, from the bottom: two levels of parking (P2, P1), the lobby
// at street level, a restaurant on the 2nd floor, offices on 3 to 19 and a
// health club on the top floor (20).
export const FLOORS = 22;
export const GROUND = 2; // the lobby
export const GARAGE = [0, 1];
export const RESTAURANT = 3;
export const GYM = FLOORS - 1;
export const OFFICES = [4, FLOORS - 2]; // first and last office floor
export function floorName(f) {
  return f < GROUND ? `P${GROUND - f}` : f === GROUND ? 'L' : String(f - 1);
}
export const CARS = 2;
export const CAPACITY = 8;
export const VMAX = 2.5; // floors per second
export const ACCEL = 2.5; // floors per second^2
export const DOOR = 0.8; // seconds for the doors to open, or to close
export const STEP_TIME = 0.4; // seconds for each person to get on
export const EXIT_TIME = 0.25; // ...and to get off (quicker: they're ready)
export const DWELL = 0.8; // the doors stay open at least this long

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const WALK = 3; // seconds a new arrival takes to walk up and press the button
export const BASE_SEED = 20261018;

// How the traffic divides at different times of the working day: people
// coming in (from the street or the garage), going out, and going floor to
// floor (offices, the restaurant, the health club). The morning and lunch
// figures are from surveys of modern office buildings (Peters Research: a
// morning up peak of about 85% in, 10% out, 5% floor to floor; the busiest
// part of lunch about 45% in, 45% out, 10% floor to floor). Between the peaks
// and going home are estimates: much more floor to floor in the middle of
// the day, and in the evening mostly out (modern surveys find no sharp
// "down peak" -- people drift away -- but most trips are leaving).
export const MIX = {
  morning: { in: 0.85, out: 0.1, inter: 0.05 },
  midday: { in: 0.25, out: 0.25, inter: 0.5 },
  lunch: { in: 0.45, out: 0.45, inter: 0.1 },
  evening: { in: 0.1, out: 0.8, inter: 0.1 },
};
export const PERIODS = ['morning', 'midday', 'lunch', 'evening'];

// Level n: how many people come, how often (on average), and the time of
// day. The first is the morning rush: 20 people about 10 seconds apart; each
// level after brings more of them, closer together, through the day. (Real
// buildings see 12 to 15% of their population in five minutes at the peaks,
// 4 to 6% between them, but they have six or eight lifts, not two.)
export function levelSpec(n) {
  return {
    n,
    people: Math.min(80, 20 + 5 * (n - 1)),
    gap: Math.max(2.5, 10 * 0.87 ** (n - 1)),
    pattern: PERIODS[(n - 1) % PERIODS.length],
    seed: seedFor(n, BASE_SEED),
  };
}

// One person's trip for the time of day.
function trip(pattern, r) {
  const pick = (weights) => {
    let x = r() * weights.reduce((a, [w]) => a + w, 0);
    for (const [w, v] of weights) if ((x -= w) < 0) return typeof v === 'function' ? v() : v;
    return weights.at(-1)[1];
  };
  const office = () => OFFICES[0] + Math.floor(r() * (OFFICES[1] - OFFICES[0] + 1));
  // In and out by the lobby mostly; about a fifth drive and park downstairs.
  const entrance = () => pick([[0.8, GROUND], [0.1, GARAGE[1]], [0.1, GARAGE[0]]]);
  const m = MIX[pattern];
  const kind = pick([[m.in, 'in'], [m.out, 'out'], [m.inter, 'inter']]);
  if (pattern === 'lunch') {
    // Out to lunch -- the street, the restaurant, or a workout -- and back.
    const place = () => pick([[0.45, GROUND], [0.4, RESTAURANT], [0.15, GYM]]);
    if (kind === 'in') return [place(), office()];
    if (kind === 'out') return [office(), place()];
  } else if (kind === 'in') {
    // Coming in: to work, and in the morning some to the gym or breakfast
    // first; in the evening, those coming in are mostly off to the gym.
    const to = pattern === 'morning' ? pick([[0.88, office], [0.07, GYM], [0.05, RESTAURANT]])
      : pattern === 'evening' ? pick([[0.4, office], [0.6, GYM]]) : office();
    return [entrance(), to];
  } else if (kind === 'out') {
    // Going home -- or, in the evening, to the gym first.
    if (pattern === 'evening' && r() < 0.15) return [office(), GYM];
    return [office(), entrance()];
  }
  // Floor to floor: meetings, coffee in the restaurant, the gym.
  const a = office();
  const b = pick([[0.7, office], [0.18, RESTAURANT], [0.12, GYM]]);
  return a === b ? [a, b === OFFICES[0] ? b + 1 : b - 1] : r() < 0.5 ? [a, b] : [b, a];
}

// The arrivals: a Poisson process (independent, at a steady average rate),
// seeded so you and the dispatcher meet exactly the same people.
export function schedule(spec) {
  const r = rng(spec.seed);
  const people = [];
  let t = WALK;
  for (let id = 0; id < spec.people; id++) {
    if (id) t += -Math.log(1 - r()) * spec.gap;
    const [from, to] = trip(spec.pattern, r);
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
      pos: GROUND, // floor, fractional while moving
      v: 0, // floors per second, + up
      target: null, // the one next stop
      // idle (doors shut) | moving | opening | loading (doors open: people
      // get off and on, then it waits there, open, until sent somewhere) |
      // closing. They start the day open in the lobby.
      phase: 'loading',
      timer: 0,
      open: 1, // how open the doors are, 0..1
      dwell: DWELL,
      settled: true, // doors open with nobody left to get off or on
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
        if (car.target === null) {
          // Standing at a floor where someone presses the button: the doors
          // open for them (unless it's full, or the other lift already has
          // its doors open here).
          if (this.waiting[here].length && car.riders.length < CAPACITY && !this.openHere(car, here)) this.openAt(car, ev);
          break;
        }
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
        if (this.leaving(car, here)) break;
        car.timer -= dt;
        car.open = clamp(1 - car.timer / DOOR, 0, 1);
        if (car.timer <= 0) {
          car.phase = 'loading';
          car.open = 1;
          car.timer = 0;
          car.dwell = 0;
          car.settled = false;
        }
        break;
      case 'loading': {
        // Sent somewhere else with the doors open: they close at once, and
        // anyone who hadn't got off yet stays on. (Sent to where it is:
        // it's there already.)
        if (this.leaving(car, here)) break;
        if (car.target === here) car.target = null;
        car.dwell += dt;
        car.timer -= dt;
        // One at a time: first everyone getting off, then -- once they're
        // all out -- everyone waiting gets on (while there's room).
        while (car.timer <= 0) {
          const out = car.riders.findIndex((p) => p.to === here);
          if (out >= 0) {
            const [p] = car.riders.splice(out, 1);
            this.delivered++;
            this.trips.push({ wait: p.boarded - p.t, ride: this.t - p.boarded });
            ev.push({ type: 'deliver', car: car.i, floor: here, id: p.id, look: p.look });
            car.timer += EXIT_TIME;
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
        // Then it waits here, doors open, until it's sent somewhere.
        car.settled = car.timer <= 0 && car.dwell >= DWELL;
        break;
      }
      case 'closing':
        // Sent back here after all: open up again.
        if (car.target === here || car.target === null) {
          car.target = null;
          car.phase = 'opening';
          car.timer = DOOR * (1 - car.open);
          break;
        }
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

  // If the lift has been sent elsewhere while its doors are open, start
  // closing them (from however far open they are).
  leaving(car, here) {
    if (car.target === null || car.target === here) return false;
    car.phase = 'closing';
    car.settled = false;
    car.timer = DOOR * car.open;
    return true;
  }

  // Is another lift here with its doors open (or opening)?
  openHere(car, here) {
    return this.cars.some((o) => o !== car && (o.phase === 'opening' || o.phase === 'loading') && this.floorOf(o) === here);
  }

  openAt(car, ev) {
    car.target = null;
    car.phase = 'opening';
    car.settled = false;
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
    // Busy until it's done letting people off and on (then it stands open,
    // ready to be sent on).
    const busy = car.phase === 'opening' || car.phase === 'closing' || (car.phase === 'loading' && !car.settled);
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
    if (f === null && park && here !== GROUND && car.i === 0) f = GROUND; // wait in the lobby
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
