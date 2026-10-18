// Elevator Operator: the building, the people and the cars -- no DOM, so it
// can be tested in Node.
//
// You're the dispatcher. Each car has one "next stop" at a time: send it to
// a floor and it goes there (turning round at once if you change your mind),
// opens its doors, lets out anyone who wanted that floor, takes on everyone
// waiting (up to its capacity) and closes again. The people inside press the
// buttons for their floors; those light up in the car's shaft.
import { rng, seedFor } from '../../js/lib/random.js';

// The building, from the bottom: parking below the street (P1, or P2 and
// P1), the lobby at street level, a restaurant on the 2nd floor, offices,
// a health club on the top storey, and the roof (R) with a helipad. It grows
// with the levels: 6 storeys to start, then 10, 15 and 20.
export function building(storeys, garages = storeys >= 15 ? 2 : 1) {
  const kinds = [
    ...Array(garages).fill('garage'),
    'lobby',
    'restaurant',
    ...Array(storeys - 3).fill('office'),
    'gym',
    'roof',
  ];
  const ground = garages;
  return {
    storeys,
    kinds,
    floors: kinds.length,
    ground,
    garage: [...Array(garages).keys()],
    restaurant: ground + 1,
    offices: [ground + 2, kinds.length - 3],
    gym: kinds.length - 2,
    roof: kinds.length - 1,
  };
}

export function floorName(b, f) {
  if (f < b.ground) return `P${b.ground - f}`;
  if (f === b.ground) return 'L';
  if (f === b.roof) return 'R';
  return String(f - b.ground + 1);
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
// is an estimate: much more floor to floor. In the evening everyone still
// in the building goes home (modern surveys find no sharp "down peak" --
// people drift away -- but by the end of the day the building is empty).
export const MIX = {
  morning: { in: 0.85, out: 0.1, inter: 0.05 },
  midday: { in: 0.25, out: 0.25, inter: 0.5 },
  lunch: { in: 0.45, out: 0.45, inter: 0.1 },
  evening: { in: 0, out: 1, inter: 0 },
};
export const PERIODS = ['morning', 'midday', 'lunch', 'evening'];

// Level n: the building, how many people come, how often (on average), and
// the time of day. The first is the morning rush in a 6-storey building: 20
// people about 10 seconds apart; each level after brings more of them,
// closer together, through the day -- and every four, a taller building. (Real
// buildings see 12 to 15% of their population in five minutes at the peaks,
// 4 to 6% between them, but they have six or eight lifts, not two.)
export function levelSpec(n) {
  const stage = Math.min(3, Math.floor((n - 1) / PERIODS.length));
  return {
    n,
    people: Math.min(80, 20 + 5 * (n - 1)),
    gap: Math.max(2.5, 10 * 0.87 ** (n - 1)),
    pattern: PERIODS[(n - 1) % PERIODS.length],
    building: building([6, 10, 15, 20][stage]),
    seed: seedFor(n, BASE_SEED),
  };
}

// Floors where people stay a while (and are counted): the restaurant, the
// offices and the health club. The lobby, garage and roof are on the way in
// or out.
export function stays(B, f) {
  return f >= B.restaurant && f <= B.gym;
}

// The arrivals: a Poisson process (independent, at a steady average rate),
// seeded so you and the dispatcher meet exactly the same people -- and
// consistent with who's in the building. It's empty first thing and empty
// again at the end of the day: nobody leaves a floor nobody is on. In the
// middle of the day the working population is at its desks. Returns the
// people, with `start`: how many are on each floor to begin with.
export function schedule(spec) {
  const r = rng(spec.seed);
  const B = spec.building;
  const N = spec.people;
  const { ground: GROUND, garage: GARAGE, restaurant: RESTAURANT, gym: GYM, offices: OFFICES } = B;
  const pick = (weights) => {
    const ws = weights.filter(([w]) => w > 0);
    let x = r() * ws.reduce((a, [w]) => a + w, 0);
    for (const [w, v] of ws) if ((x -= w) < 0) return typeof v === 'function' ? v() : v;
    const v = ws.at(-1)[1];
    return typeof v === 'function' ? v() : v;
  };
  const office = () => OFFICES[0] + Math.floor(r() * (OFFICES[1] - OFFICES[0] + 1));
  const isOffice = (f) => f >= OFFICES[0] && f <= OFFICES[1];
  // In and out by the lobby mostly; about a fifth drive and park downstairs.
  const entrance = () => (r() < 0.8 ? GROUND : GARAGE[Math.floor(r() * GARAGE.length)]);
  const occ = Array(B.floors).fill(0);
  const inside = [];
  for (let f = RESTAURANT; f <= GYM; f++) inside.push(f);
  // Someone on a floor (matching `ok`), chosen in proportion to how many
  // are there.
  const someone = (ok = () => true) => {
    const fs = inside.filter((f) => occ[f] > 0 && ok(f));
    if (!fs.length) return null;
    return pick(fs.map((f) => [occ[f], f]));
  };
  const m = MIX[spec.pattern];
  const kinds = Array.from({ length: N }, () => pick([[m.in, 'in'], [m.out, 'out'], [m.inter, 'inter']]));
  // Now and then someone flies in to the helipad, or out from it: once or
  // twice a level.
  for (const id of new Set([Math.floor(r() * N), Math.floor(r() * N * 2)])) {
    if (id < N) kinds[id] = spec.pattern === 'morning' || (spec.pattern !== 'evening' && r() < 0.5) ? 'flyIn' : 'flyOut';
  }
  if (spec.pattern === 'evening') {
    // Going home: everyone in the building leaves (one or two by
    // helicopter), and then it's empty.
    for (let k = 0; k < N; k++) occ[kinds[k] === 'flyOut' ? office() : pick([[0.85, office], [0.1, GYM], [0.05, RESTAURANT]])]++;
  } else if (spec.pattern !== 'morning') {
    // At work: a few people on every office floor.
    const workers = Math.max(N, 4 * (OFFICES[1] - OFFICES[0] + 1));
    for (let k = 0; k < workers; k++) occ[office()]++;
  }
  const start = occ.slice();
  // Someone getting out at a floor can't leave it again until they've
  // actually got there: allow a generous time for the trip.
  const settle = 40 + 2 * B.floors;
  const coming = [];
  const people = [];
  let t = WALK;
  for (let id = 0; id < N; id++) {
    if (id) t += -Math.log(1 - r()) * spec.gap;
    for (let k = coming.length - 1; k >= 0; k--) {
      if (coming[k][0] <= t) {
        occ[coming[k][1]]++;
        coming.splice(k, 1);
      }
    }
    let kind = kinds[id];
    if (spec.pattern === 'evening' && kind === 'flyOut' && someone(isOffice) === null) kind = 'out';
    if ((kind === 'out' || kind === 'inter' || kind === 'flyOut') && someone() === null) kind = kind === 'flyOut' ? 'flyIn' : 'in';
    let from;
    let to;
    if (kind === 'flyIn') [from, to] = [B.roof, office()];
    else if (kind === 'flyOut') {
      from = someone(isOffice) ?? someone();
      to = B.roof;
    } else if (kind === 'in') {
      if (spec.pattern === 'lunch') {
        // Back from lunch: the street, the restaurant, or a workout.
        from = pick([[0.45, GROUND], [occ[RESTAURANT] ? 0.4 : 0, RESTAURANT], [occ[GYM] ? 0.15 : 0, GYM]]);
        to = office();
      } else {
        from = entrance();
        // Coming in to work; in the morning a few go to the gym or for
        // breakfast first.
        to = spec.pattern === 'morning' ? pick([[0.88, office], [0.07, GYM], [0.05, RESTAURANT]]) : office();
      }
    } else if (kind === 'out') {
      if (spec.pattern === 'lunch') {
        // Out to lunch: the street, the restaurant, or a workout.
        from = someone(isOffice) ?? someone();
        to = pick([[0.45, GROUND], [from === RESTAURANT ? 0 : 0.4, RESTAURANT], [from === GYM ? 0 : 0.15, GYM]]);
      } else {
        from = someone();
        to = entrance();
      }
    } else {
      // Floor to floor: meetings, coffee in the restaurant, the gym.
      from = someone();
      do to = pick([[0.7, office], [0.18, RESTAURANT], [0.12, GYM]]); while (to === from);
    }
    if (stays(B, from)) occ[from]--;
    if (stays(B, to)) coming.push([t + settle, to]);
    // Looks: skin, hair, shirt, trousers (indexes into the view's palettes).
    const look = [r(), r(), r(), r()].map((x) => Math.floor(x * 1e6));
    people.push({ id, t, from, to, look });
  }
  people.start = start;
  return people;
}

export class Sim {
  constructor(spec) {
    this.spec = spec;
    this.building = spec.building;
    this.floors = spec.building.floors;
    this.t = 0;
    this.arrivals = schedule(spec);
    this.next = 0;
    this.waiting = Array.from({ length: this.floors }, () => []);
    // How many people are on each floor (at their desks, eating, working
    // out): they leave it when they go for a lift, and add to it when they
    // get out at it.
    this.occupancy = this.arrivals.start ? this.arrivals.start.slice() : Array(this.floors).fill(0);
    this.cars = Array.from({ length: CARS }, (_, i) => ({
      i,
      pos: spec.building.ground, // floor, fractional while moving
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
    if (this.over || f < 0 || f >= this.floors) return;
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
      if (stays(this.building, a.from)) this.occupancy[a.from] = Math.max(0, this.occupancy[a.from] - 1);
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
            if (stays(this.building, here)) this.occupancy[here]++;
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
    const lobby = sim.building.ground;
    if (f === null && park && here !== lobby && car.i === 0) f = lobby; // wait in the lobby
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
