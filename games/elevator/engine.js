// Elevator Operator: the building, the people and the cars -- no DOM, so it
// can be tested in Node.
//
// You're the dispatcher. Each car has one "next stop" at a time: send it to
// a floor and it goes there (turning round at once if you change your mind),
// opens its doors, lets out anyone who wanted that floor, takes on everyone
// waiting (up to its capacity) and closes again. The people inside press the
// buttons for their floors; those light up in the car's shaft.
import { rng, seedFor } from '../../js/lib/random.js';

// An office building, from the bottom: parking below the street (P1, or P2
// and P1), the lobby at street level, a restaurant on the 2nd floor,
// offices, a health club on the top storey, and the roof (R) with a
// helipad. It grows with the levels: 6 storeys to start, then 10, 15 and 20.
// An apartment tower has homes on every floor above the lobby.
export function building(storeys, garages = storeys >= 15 ? 2 : 1, type = 'office') {
  const kinds = type === 'residential'
    ? [...Array(garages).fill('garage'), 'lobby', ...Array(storeys - 1).fill('home'), 'roof']
    : [...Array(garages).fill('garage'), 'lobby', 'restaurant', ...Array(storeys - 3).fill('office'), 'gym', 'roof'];
  const ground = garages;
  if (type === 'residential') {
    return { type, storeys, kinds, floors: kinds.length, ground, garage: [...Array(garages).keys()], homes: [ground + 1, kinds.length - 2], restaurant: -1, gym: -1, offices: [-1, -2], roof: kinds.length - 1 };
  }
  return {
    type,
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

export const CARS = 2; // lifts in a building (but just one on the first day)
export const CAPACITY = 6;
export const VMAX = 2.5; // floors per second
export const ACCEL = 2.5; // floors per second^2
export const DOOR = 0.8; // seconds for the doors to open, or to close
export const STEP_TIME = 0.4; // seconds for each person to get on
export const EXIT_TIME = 0.25; // ...and to get off (quicker: they're ready)
export const DWELL = 0.8; // the doors stay open at least this long

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const WALK = 3; // seconds a new arrival takes to walk up and press the button

// Seconds from setting off to pressing the button: from a floor (out of the
// office, the restaurant, the gym, home), in off the street, from a car
// parking in the garage, from a helicopter landing on the roof.
export function approach(B, f) {
  if (f === B.ground) return WALK + 1.5;
  if (f < B.ground) return WALK + 2.5;
  if (f === B.roof) return WALK + 3.5;
  return WALK;
}
export const SETTLE = 3; // seconds at least between someone's trips
export const PRESS = 0.5; // seconds from pressing the button to stepping into a lift that's there
export const BASE_SEED = 20261018;

// The day: every level is a whole working day, 7 AM to 7:30 PM, played in
// about five minutes.
export const DAY = { start: 7 * 60, end: 19.5 * 60 }; // minutes after midnight
export const PLAY = 300; // seconds of play for the day (longer in bigger buildings)
export const toPlay = (min, play = PLAY) => ((min - DAY.start) / (DAY.end - DAY.start)) * play;
// The time of day (minutes after midnight) at time t of the level.
export function clockAt(t, play = PLAY) {
  return DAY.start + (t / play) * (DAY.end - DAY.start);
}

// For reference: how the traffic divides at the peaks, from surveys of
// modern office buildings (Peters Research): the morning up peak about 85%
// in, 10% out, 5% floor to floor; the busiest part of lunch about 45% in,
// 45% out, 10% floor to floor. The day below is made of people, not
// percentages, but it comes out like this (the tests check).
export const MIX = {
  morning: { in: 0.85, out: 0.1, inter: 0.05 },
  lunch: { in: 0.45, out: 0.45, inter: 0.1 },
};

// Level n: the buildings and how many people work (and live) in them. One
// office building to start -- 6 storeys, 10 people -- growing every three
// levels (10, 15, 20 storeys) with a few more people each level (two lifts
// can only do so much: a real 20-storey tower would have six or eight). From level 13
// there are two towers to run, two lifts each: apartments, where people sleep
// at night, and offices, where they (and others from elsewhere) work by day.
//
// Bigger buildings take longer: the day is played over 5 minutes in the
// first, 5.7, 6.7 and 8 in the taller ones, 8 to 9 for the two towers. Each
// building has a name, and each level is the next day there.
export const TWINS = 13;
export const MAX_PLAY = 900; // the longest day: 15 minutes
export const PLACES = ['Maple Street Offices', 'Riverside House', 'Harbor Plaza', 'The Empire', 'Parkview & Commerce Tower'];
export function levelSpec(n) {
  const seed = seedFor(n, BASE_SEED);
  let towers;
  let workers;
  let residents = 0;
  let play;
  let place;
  let day;
  if (n < TWINS) {
    const stage = Math.floor((n - 1) / 3);
    workers = n === 1 ? 6 : [10, 16, 20, 26][stage] + 2 * ((n - 1) % 3); // (day one: one lift, a small firm)
    play = [300, 360, 450, 600][stage]; // 5 to 10 minutes
    towers = [{ building: building([6, 10, 15, 20][stage]), cars: n === 1 ? 1 : CARS }];
    place = PLACES[stage];
    day = ((n - 1) % 3) + 1;
  } else {
    const k = n - TWINS;
    residents = Math.min(64, 24 + 4 * k);
    workers = Math.min(28, 8 + 2 * k); // from elsewhere
    play = Math.min(MAX_PLAY, 600 + 30 * k); // 10 minutes, growing to 15
    towers = [{ building: building(10, 1, 'residential') }, { building: building(10, 1) }];
    place = PLACES[4];
    day = k + 1;
  }
  const plans = dayPlan(towers.map((t) => t.building), { workers, residents, seed, play });
  towers.forEach((t, k) => {
    t.arrivals = plans[k];
    t.people = plans[k].length;
    t.play = play;
  });
  return { ...towers[0], n, towers, workers, residents, play, place, day, people: towers.reduce((a, t) => a + t.people, 0) };
}

// Floors where people stay a while (and are counted): the restaurant, the
// offices, the health club, the homes. The lobby, garage and roof are on the
// way in or out.
export function stays(B, f) {
  return ['restaurant', 'office', 'gym', 'home'].includes(B.kinds[f]);
}

// How people get to and from the buildings: on foot (lobby), by car
// (garage), or now and then by helicopter (roof); and how long it takes to
// get across the street from one tower to the other each way.
export const TRANSIT = { walk: 14, drive: 12, fly: 16 };

// The day's people, each with their own day: a list of trips, in order.
// An office worker arrives in the morning rush (around 8:30), may have a
// meeting on another floor in the morning or afternoon, goes to lunch around
// 12:30 (out to the street, down to the restaurant, or up to the gym, back
// half an hour or so later), and leaves around 5:30 (some by way of the gym).
// A resident wakes in the apartments, leaves around 8 -- most to work across
// the street in the office tower, the rest into town -- and comes home in
// the evening (some sooner). So each building is empty (offices) or full
// (apartments) first thing, and the same again at night. A person's next
// trip waits until they've finished the last one (and, between the towers,
// crossed the street). Returns each tower's trips, with `start`: how many
// are on each floor at dawn.
export function dayPlan(buildings, { workers, residents, seed, play = PLAY }) {
  const r = rng(seed);
  const twin = buildings.length > 1;
  const O = buildings.at(-1);
  const H = twin ? buildings[0] : null;
  const oi = buildings.length - 1;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const around = (mean, sd, lo, hi) => Math.max(lo, Math.min(hi, mean + sd * gauss()));
  const between = (a, b) => a + r() * (b - a);
  const pick = (ws) => {
    let x = r() * ws.reduce((a, [w]) => a + w, 0);
    for (const [w, v] of ws) if ((x -= w) < 0) return v;
    return ws.at(-1)[1];
  };
  const office = () => O.offices[0] + Math.floor(r() * (O.offices[1] - O.offices[0] + 1));
  const otherOffice = (f) => {
    if (O.offices[1] === O.offices[0]) return O.restaurant;
    let g;
    do g = office(); while (g === f);
    return g;
  };
  let flights = 2; // helicopters: once or twice a day
  const how = () => {
    const via = pick([[0.75, 'walk'], [0.22, 'drive'], [0.03, 'fly']]);
    if (via !== 'fly') return via;
    return flights-- > 0 ? 'fly' : 'walk';
  };
  const door = (B, via) => (via === 'walk' ? B.ground : via === 'drive' ? B.garage[Math.floor(r() * B.garage.length)] : B.roof);
  const look = () => [r(), r(), r(), r()].map((v) => Math.floor(v * 1e6));
  const days = []; // [[{ tower, min, from, to, via }...], ...]

  // A working day in the office tower, from `arrive` (minutes) to about
  // `leave`, coming in at `inDoor` and going out at `outDoor`.
  const workday = (arrive, inDoor, outDoor, leave) => {
    const desk = office();
    const legs = [];
    let at = arrive;
    const go = (from, to, min) => {
      at = Math.max(min, at + 8);
      legs.push({ tower: oi, min: at, from, to });
    };
    if (r() < 0.06) {
      go(inDoor, O.restaurant, arrive); // breakfast first
      go(O.restaurant, desk, at + between(15, 25));
    } else go(inDoor, desk, arrive);
    if (r() < 0.45) {
      const m = between(9.75 * 60, 11.25 * 60);
      if (m > at + 10) {
        const room = otherOffice(desk);
        go(desk, room, m);
        go(room, desk, at + between(25, 55));
      }
    }
    if (r() < 0.7) {
      const l = around(12.5 * 60, 20, 11.75 * 60, 13.5 * 60);
      if (l > at + 10) {
        const where = pick([[0.6, O.ground], [0.3, O.restaurant], [0.1, O.gym]]);
        go(desk, where, l);
        go(where, desk, at + between(30, 55));
      }
    }
    if (r() < 0.35) {
      const m = between(14.25 * 60, 16.25 * 60);
      if (m > at + 10) {
        const room = otherOffice(desk);
        go(desk, room, m);
        go(room, desk, at + between(25, 50));
      }
    }
    const end = Math.max(leave, at + 15);
    if (r() < 0.1 && end < 18.25 * 60) {
      go(desk, O.gym, end); // a workout on the way home
      go(O.gym, outDoor, at + between(35, 55));
    } else go(desk, outDoor, end);
    return legs;
  };

  // Office workers from elsewhere.
  for (let k = 0; k < workers; k++) {
    const via = how();
    const d = door(O, via);
    const leave = around(17.5 * 60, 35, 16.25 * 60, 19 * 60);
    days.push({ via, legs: workday(around(8.5 * 60, 30, 7.25 * 60, 10 * 60), d, d, leave) });
  }
  // Residents: at home asleep at dawn.
  const hStart = twin ? Array(H.floors).fill(0) : null;
  for (let k = 0; k < residents; k++) {
    const home = H.homes[0] + Math.floor(r() * (H.homes[1] - H.homes[0] + 1));
    hStart[home]++;
    const via = how();
    const leave = around(8 * 60, 30, 7.1 * 60, 9.5 * 60);
    const legs = [{ tower: 0, min: leave, from: home, to: door(H, via) }];
    if (r() < 0.7) {
      // Across the street to work, and back again in the evening.
      const back = around(17.5 * 60, 35, 16.25 * 60, 19 * 60);
      legs.push(...workday(leave + 5, door(O, via), door(O, via), back));
      legs.push({ tower: 0, min: legs.at(-1).min + 5, from: door(H, via), to: home });
    } else {
      // Into town; home in the evening (or sooner).
      const back = r() < 0.25 ? between(13.5 * 60, 16 * 60) : around(18 * 60, 40, 16 * 60, 19.25 * 60);
      legs.push({ tower: 0, min: back, from: door(H, via), to: home });
    }
    days.push({ via, legs });
  }

  // Into each tower's list of trips, linked: the next trip in the same tower
  // waits for the last (`prev`); one in the other tower is set off by the
  // last (`onward`) once they've crossed (`transit`).
  const lists = buildings.map(() => []);
  const ids = buildings.map(() => 0);
  for (const { via, legs } of days) {
    const face = look();
    let last = null;
    for (const leg of legs) {
      const trip = { id: ids[leg.tower]++, t: toPlay(leg.min, play), from: leg.from, to: leg.to, look: face };
      if (last) {
        if (last.tower === leg.tower) trip.prev = last.trip.id;
        else {
          last.trip.onward = trip.id;
          trip.t = Infinity;
          trip.transit = TRANSIT[via];
        }
      }
      lists[leg.tower].push(trip);
      last = { tower: leg.tower, trip };
    }
  }
  // The early birds: someone's on their way as soon as the doors open, and
  // a trickle more before the morning rush.
  const firsts = lists.flat().filter((a) => a.prev === undefined && Number.isFinite(a.t)).sort((a, b) => a.t - b.t);
  firsts.slice(0, 8).forEach((a, k) => (a.t = Math.min(a.t, 0.5 + 5 * k)));
  lists.forEach((list, k) => {
    list.sort((a, b) => a.t - b.t);
    list.start = k === 0 && twin ? hStart : Array(buildings[k].floors).fill(0);
  });
  return lists;
}

// (For tests and tools: a one-tower level's trips.)
export function schedule(spec) {
  return spec.arrivals;
}

export class Sim {
  constructor(spec) {
    this.spec = spec;
    this.building = spec.building;
    this.floors = spec.building.floors;
    this.t = 0;
    // The people (a copy: some trips' times are only known once an earlier
    // leg is done -- the walk across the street from the other tower).
    const people = spec.arrivals;
    this.arrivals = people.map((a) => ({ ...a }));
    this.arrivals.start = people.start;
    this.byId = new Map(this.arrivals.map((a) => [a.id, a]));
    this.pending = this.arrivals.slice(); // not yet at the button
    this.doneAt = new Map(); // id -> when they got where they were going
    this.walking = []; // on their way to the button
    this.waiting = Array.from({ length: this.floors }, () => []);
    // How many people are on each floor (at their desks, eating, working
    // out): they leave it when they go for a lift, and add to it when they
    // get out at it.
    this.occupancy = this.arrivals.start ? this.arrivals.start.slice() : Array(this.floors).fill(0);
    this.cars = Array.from({ length: spec.cars ?? CARS }, (_, i) => ({
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

  // When someone due to make trip a can set off: on time, but not before
  // their last trip is over (and a moment to settle in) -- never, yet, if
  // they're still on it.
  setsOff(a) {
    if (a.prev === undefined) return a.t;
    const done = this.doneAt.get(a.prev);
    return done === undefined ? Infinity : Math.max(a.t, done + SETTLE);
  }

  // The floors the people in car i want (lit in its shaft).
  lit(i) {
    return new Set(this.cars[i].riders.map((p) => p.to));
  }

  step(dt) {
    const ev = [];
    if (this.over) return ev;
    this.t += dt;
    // People turn up and wait for a lift -- but nobody leaves a floor
    // nobody is on: if they're due to set off from an empty floor (the one
    // they'd be is still on their way there), they go once someone is.
    for (let k = 0; k < this.pending.length; k++) {
      const a = this.pending[k];
      if (this.setsOff(a) > this.t) continue;
      if (stays(this.building, a.from)) {
        if (this.occupancy[a.from] <= 0) continue;
        this.occupancy[a.from]--;
      }
      // Off to the lifts: they press the button when they get there (and
      // only then can they get on).
      this.pending.splice(k--, 1);
      a.at = this.t + approach(this.building, a.from);
      this.walking.push(a);
      ev.push({ type: 'leave', floor: a.from, to: a.to, id: a.id, look: a.look, at: a.at });
    }
    for (let k = 0; k < this.walking.length; k++) {
      const a = this.walking[k];
      if (a.at > this.t) continue;
      this.walking.splice(k--, 1);
      a.t = this.t; // (pressing the button now)
      this.waiting[a.from].push(a);
      ev.push({ type: 'arrive', floor: a.from, to: a.to, id: a.id, look: a.look });
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
    const ready = (p) => this.t >= p.t + PRESS - 1e-9; // (they've pressed the button)
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
        // (Even if it's been sent on, the doors open: people get off first.)
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
        // (Sent to where it is: it's there already.)
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
            this.doneAt.set(p.id, this.t);
            if (stays(this.building, here)) this.occupancy[here]++;
            this.trips.push({ wait: p.boarded - p.t, ride: this.t - p.boarded });
            ev.push({ type: 'deliver', car: car.i, floor: here, id: p.id, look: p.look, onward: p.onward });
            car.timer += EXIT_TIME;
          } else if (this.waiting[here].some(ready) && car.riders.length < CAPACITY) {
            const [p] = this.waiting[here].splice(this.waiting[here].findIndex(ready), 1);
            p.boarded = this.t;
            car.riders.push(p);
            ev.push({ type: 'board', car: car.i, floor: here, id: p.id });
            car.timer += STEP_TIME;
          } else {
            car.timer = 0;
            break;
          }
        }
        // Only once everyone for this floor is out, and everyone waiting
        // here (who fits) is in -- including anyone just pressing the button
        // -- does it go where it's been sent (nobody's ever carried past
        // their floor). Till then, or till it's sent, it waits, doors open.
        const exchanging = car.timer > 0 || (car.riders.length < CAPACITY && this.waiting[here].length > 0);
        if (!exchanging && this.leaving(car, here)) break;
        car.settled = !exchanging && car.dwell >= DWELL;
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

  // How the trips went: each one's total (from pressing the button to
  // getting out), the average wait, ride and trip, the median trip, and the
  // sum of the squares of the trips -- the score: a long wait counts for
  // much more than a short one (one 60 s trip costs as much as four of 30).
  stats() {
    const n = this.trips.length || 1;
    const totals = this.trips.map((x) => x.wait + x.ride);
    const wait = this.trips.reduce((a, x) => a + x.wait, 0) / n;
    const ride = this.trips.reduce((a, x) => a + x.ride, 0) / n;
    const sorted = [...totals].sort((a, b) => a - b);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
    const squares = totals.reduce((a, x) => a + x * x, 0);
    const rms = Math.sqrt(squares / n);
    return { delivered: this.delivered, wait, ride, trip: wait + ride, median, squares, rms, totals, time: this.t };
  }

  waitingCount() {
    return this.waiting.reduce((n, w) => n + w.length, 0);
  }
}

// ------------------------------------------------------------- dispatcher

// A good dispatcher, to measure you against. (The best possible schedule
// isn't something anyone can compute in time -- the number of ways to
// order the stops explodes -- so this is how real lift groups do it, tuned a
// few ways, best of them taken.)
//
// Each lift keeps going the way it's going, stopping at the nearest floor
// ahead where someone inside wants to get off or someone is waiting (that
// the other lift isn't already on its way to -- or, assign: 'eta', that it
// would get to soonest); when there's nothing more ahead it turns round.
// Moving lifts pick people up on the way if they can still stop in time,
// and one going somewhere there's no longer any reason to (the other lift
// got them) turns to its next job. A lift with nothing to do waits where
// the next calls are likely to come from at that time of day (stage), or in
// the lobby.
export function dispatch(sim, opts = {}) {
  const { assign = 'claim', ahead = true, park = true, stage = true } = opts;
  const B = sim.building;
  const mine = sim.cars.map(() => new Set());
  sim.waiting.forEach((w, f) => {
    if (!w.length) return;
    const free = sim.cars.filter((c) => c.riders.length < CAPACITY);
    if (assign === 'eta') {
      // Soonest first; the next too if they won't all fit.
      const by = free.map((c) => [eta(c, f), c]).sort((a, b) => a[0] - b[0]);
      let room = 0;
      for (const [, c] of by) {
        if (room >= w.length) break;
        mine[c.i].add(f);
        room += CAPACITY - c.riders.length;
      }
    } else {
      // Any lift the other one isn't already on its way to.
      for (const c of free) if (!sim.cars.some((o) => o !== c && o.target === f)) mine[c.i].add(f);
    }
  });
  const spots = park ? (stage ? staging(sim) : sim.cars.map((c) => (c.i === 0 ? B.ground : null))) : [];
  for (const car of sim.cars) {
    const want = new Set([...car.riders.map((p) => p.to), ...mine[car.i]]);
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
    if (car.phase === 'moving') {
      // Something to pick up (or drop off) on the way?
      const f = nearest(car.dir, car.pos, stopping);
      const past = (g) => (car.target - car.pos) * car.dir > (g - car.pos) * car.dir;
      if (ahead && f !== null && past(f)) sim.send(car.i, f);
      else if (!want.has(car.target) && car.target !== car.parkAt) {
        // Nobody there for it any more: on to the next job, or to wait.
        const g = f ?? nearest(-car.dir, car.pos, -Infinity);
        if (g !== null) sim.send(car.i, g);
        else if (spots[car.i] != null) sim.send(car.i, (car.parkAt = spots[car.i]));
      }
      continue;
    }
    if (busy || car.target !== null) continue;
    const here = sim.floorOf(car);
    let f = nearest(car.dir, here, 1);
    if (f === null) f = nearest(-car.dir, here, 1);
    if (f === null && want.has(here) && sim.waiting[here].length) f = here;
    if (f !== null) {
      car.parkAt = null;
      sim.send(car.i, f);
    } else if (spots[car.i] != null && spots[car.i] !== here) sim.send(car.i, (car.parkAt = spots[car.i]));
  }
}

// Roughly how soon car could be at floor f (seconds): along the way it's
// going, stopping for its riders, turning round if f is behind it.
function eta(car, f) {
  const stop = 2 * DOOR + DWELL + 1.5;
  const drops = [...new Set(car.riders.map((p) => p.to))];
  const dir = drops.length ? Math.sign(drops[0] - car.pos) || car.dir || 1 : Math.sign(f - car.pos) || 1;
  const ahead = (g) => (g - car.pos) * dir >= 0;
  let dist = Math.abs(f - car.pos);
  let stops = drops.filter((g) => ahead(g) && (g - f) * dir < 0).length;
  if (!ahead(f) && drops.length) {
    // On to the farthest of its riders' floors first, then back.
    const far = drops.reduce((a, g) => ((g - a) * dir > 0 ? g : a), car.pos);
    dist = Math.abs(far - car.pos) + Math.abs(far - f);
    stops = drops.length;
  }
  const busy = car.phase === 'opening' || car.phase === 'closing' || (car.phase === 'loading' && !car.settled) ? 2 * DOOR : 0;
  // Already on its way there: stick with it (unless the other's much nearer).
  const keen = car.target === f && car.parkAt !== f ? 3 : 0;
  return dist / VMAX + stops * stop + busy - keen;
}

// Where the lifts wait, by the time of day: in the lobby while people are
// arriving; among the people (the busiest floors) when they're about to
// leave; one of each in between. Offices fill in the morning and after
// lunch and empty at lunch and in the evening; homes the other way round.
function staging(sim) {
  const B = sim.building;
  const h = clockAt(sim.t, sim.spec.play ?? PLAY) / 60;
  const mode = B.type === 'residential'
    ? h < 10.5 ? 'out' : h < 16 ? 'mixed' : 'in'
    : h < 11.75 ? 'in' : h < 12.75 ? 'out' : h < 14 ? 'in' : h < 15.75 ? 'mixed' : 'out';
  const total = sim.occupancy.reduce((a, b) => a + b, 0);
  // The floor below which a fraction q of the people are.
  const among = (q) => {
    let seen = 0;
    for (let f = 0; f < B.floors; f++) {
      seen += sim.occupancy[f];
      if (seen > q * total) return f;
    }
    return B.ground;
  };
  const n = sim.cars.length;
  return sim.cars.map((c, k) => {
    if (!total || mode === 'in') return B.ground;
    if (mode === 'out') return among((k + 0.5) / n);
    return k === 0 ? B.ground : among(0.5);
  });
}

// Runs one tower's day with the dispatcher until everyone's delivered.
export function playDispatcher(spec, opts = {}, dt = 1 / 20) {
  const sim = new Sim(spec);
  while (!sim.over && sim.t < 3600) {
    dispatch(sim, opts);
    sim.step(dt);
  }
  return sim;
}

// Several towers' stats as one (everyone's trips together).
export function combine(list) {
  const totals = list.flatMap((s) => s.totals);
  const n = totals.length || 1;
  const sorted = [...totals].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
  const weigh = (key) => list.reduce((a, s) => a + s[key] * s.totals.length, 0) / n;
  return {
    delivered: list.reduce((a, s) => a + s.delivered, 0),
    wait: weigh('wait'),
    ride: weigh('ride'),
    trip: weigh('trip'),
    median,
    squares: list.reduce((a, s) => a + s.squares, 0),
    rms: Math.sqrt(list.reduce((a, s) => a + s.squares, 0) / n),
    totals,
    time: Math.max(...list.map((s) => s.time)),
  };
}

// The level's towers run side by side on one clock (one tower, or two).
export class Day {
  constructor(spec) {
    this.spec = spec;
    this.sims = (spec.towers || [spec]).map((t) => new Sim(t));
    this.t = 0;
    this.over = false;
  }

  step(dt) {
    const ev = [];
    if (this.over) return ev;
    this.t += dt;
    this.sims.forEach((sim, tower) => {
      for (const e of sim.step(dt)) {
        if (e.type === 'over') continue;
        // Out of one tower and off to the other: they reach its lobby,
        // garage or roof after the walk, drive or flight across.
        if (e.type === 'deliver' && e.onward !== undefined) {
          const next = this.sims[1 - tower].byId.get(e.onward);
          next.t = this.t + next.transit;
        }
        ev.push({ ...e, tower });
      }
    });
    if (this.sims.every((s) => s.over)) {
      this.over = true;
      ev.push({ type: 'over', ...this.stats() });
    }
    return ev;
  }

  stats() {
    return combine(this.sims.map((s) => s.stats()));
  }
}

// The score to beat: for each tower, the version of the dispatcher with the
// smallest sum of squared trips (on the same people), all together.
export const VARIANTS = [{}, { stage: false }, { stage: false, ahead: false }, { assign: 'eta', stage: false }];
export function par(spec) {
  if (spec.towers && spec.towers.length > 1) {
    // Two towers (linked by the people going between them): each version of
    // the dispatcher runs the whole day.
    let best = null;
    for (const opts of VARIANTS) {
      const day = new Day(spec);
      while (!day.over && day.t < 3600) {
        day.sims.forEach((s) => dispatch(s, opts));
        day.step(1 / 20);
      }
      const s = day.stats();
      if (!best || s.squares < best.squares) best = { ...s, optsList: spec.towers.map(() => opts), opts };
    }
    return best;
  }
  const each = (spec.towers || [spec]).map((tower) => {
    let best = null;
    for (const opts of VARIANTS) {
      const s = playDispatcher(tower, opts).stats();
      if (!best || s.squares < best.squares) best = { ...s, opts };
    }
    return best;
  });
  const optsList = each.map((b) => b.opts);
  return { ...combine(each), optsList, opts: optsList[0] };
}
