// Benji's Town: the traffic. Cars (and the helpers' trucks) keep to the
// right-hand lane, stop at the line on a red light, wait for anyone on the
// crosswalk they're about to drive over, and queue behind each other; where
// there are no lights, they go through one at a time. People keep to the
// sidewalks and cross only at the crosswalks, when the walk signal shows
// (where there is one) -- and never while a car is going over it. (No DOM:
// tested in Node.)
//
// Cars: { x, y, tile, dir, path (street tiles) }; people: { x, y, node,
// path (sidewalk points) }. drive() and walk() move one along, and say
// where it has just got to.
import { isRoad } from './town.js';
import { isJunction, isLit, runsNS, atEdge, hasCrossing, armOf, zebra, mayDrive, mayWalk, crossingOf } from './streets.js';

export const LANE = 0.17; // a lane's middle, off the street's middle
// Where a car stops for the lights: its middle, back from the intersection
// -- clear of the crosswalk. (Along a street, every tile's stopping place
// is here, so a car parked at a door isn't on a crosswalk either.)
export const STOP = { ew: 0.86, ns: 0.84 };
const GAP = { ew: 0.92, ns: 0.62 }; // between cars in a queue, middle to middle
// Where a car is, as drawn (side on, rising up the screen from its lane):
// [x0, y0, x1, y1]. (Going north or south it's a hair narrower, so it can go
// by people crossing beside it.)
export function footprint(c) {
  const w = c.dir.x ? 0.42 : 0.36;
  return [c.x - w, c.y - 0.4, c.x + w, c.y + 0.12];
}

const dirOf = (a, b) => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });
const same = (a, b) => a.x === b.x && a.y === b.y;

// The intersection a street tile leads into (each one leads into one).
function junctionBy(t) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isJunction(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
  return null;
}

// Where a car is in street tile t, going d: in the right-hand lane; in the
// middle of an intersection (or a dead end at the edge of town with no
// crosswalk), and elsewhere at the stopping place before (or after) the
// intersection.
export function lanePoint(t, d) {
  const p = { x: t.x + 0.5 - d.y * LANE, y: t.y + 0.5 + d.x * LANE };
  const j = !isJunction(t.x, t.y) && hasCrossing(t.x, t.y) && junctionBy(t);
  if (!j) return p;
  if (runsNS(t.x, t.y)) p.y = j.y > t.y ? j.y - STOP.ns : j.y + 1 + STOP.ns;
  else p.x = j.x > t.x ? j.x - STOP.ew : j.x + 1 + STOP.ew;
  return p;
}

// Which way a car parked in street tile t faces, to begin with.
export const startDir = (t) => (runsNS(t.x, t.y) ? { x: 0, y: 1 } : { x: 1, y: 0 });

export class Traffic {
  constructor(ways) {
    this.ways = ways;
    this.cars = [];
    this.people = [];
    this.t = 0;
  }

  // ------------------------------------------------------------- cars

  // One car along its way for dt seconds: the street tile it has just
  // reached, if any. (m.wait while it's held up: 'light' at a red light,
  // 'turn' waiting its turn, 'car' behind another.)
  drive(m, speed, dt) {
    m.ghost = Math.max(0, (m.ghost || 0) - dt);
    if (!m.path.length) {
      m.wait = null;
      return null;
    }
    const next = m.path[0];
    const d = same(next, m.tile) ? m.dir : dirOf(m.tile, next);
    const goal = lanePoint(next, d);
    const dx = goal.x - m.x;
    const dy = goal.y - m.y;
    const dist = Math.hypot(dx, dy);
    let room = speed * dt;
    m.wait = null;
    const light = this.lightRoom(m);
    if (light.room < room) {
      room = light.room;
      m.wait = light.why;
    }
    if (dist > 1e-9) {
      const ahead = this.queueRoom(m, dx / dist, dy / dist);
      if (ahead < room) {
        room = ahead;
        m.wait = 'car';
      }
    }
    // (Stuck behind a parked truck, or in a tangle: after a while, squeeze
    // by. No gridlock, ever.)
    if (m.wait === 'car' && room < 1e-3) {
      m.stuck = (m.stuck || 0) + dt;
      if (m.stuck > (m.patience || 2)) {
        m.ghost = 1.5;
        m.stuck = 0;
      }
    } else m.stuck = 0;
    if (Math.abs(dx) > 0.02 && room > 0) m.face = Math.sign(dx);
    if (dist <= room) {
      const from = m.tile;
      m.x = goal.x;
      m.y = goal.y;
      m.tile = next;
      m.dir = d;
      m.path.shift();
      if (isJunction(from.x, from.y) && !isJunction(next.x, next.y)) m.pass = null;
      return next;
    }
    m.x += (dx / dist) * room;
    m.y += (dy / dist) * room;
    return null;
  }

  // How far a car may go before the next intersection: to its stopping
  // place, unless it's let through -- on a green light, or (no lights) when
  // no one else is going through -- and the crosswalks it'll drive over are
  // clear. { room, why }
  lightRoom(m) {
    const go = { room: Infinity, why: null };
    let prev = m.tile;
    for (let k = 0; k < Math.min(2, m.path.length); k++) {
      const j = m.path[k];
      if (isJunction(j.x, j.y)) {
        const key = `${j.x},${j.y}`;
        if (same(prev, j) || m.pass === key) return go;
        const a = dirOf(prev, j);
        const axis = a.x ? 'ew' : 'ns';
        const edge = a.x > 0 ? j.x - m.x : a.x < 0 ? m.x - j.x - 1 : a.y > 0 ? j.y - m.y : m.y - j.y - 1;
        const room = edge - STOP[axis];
        if (room > 0.01) return { room, why: null };
        const exit = m.path[k + 1];
        const arms = [armOf(j, prev), ...(exit ? [armOf(j, exit)] : [])];
        const lit = isLit(j.x, j.y);
        if (lit && !mayDrive(j.x, j.y, axis, this.t)) return { room: Math.max(0, room), why: 'light' };
        if (this.peopleOn(j, arms) || (!lit && this.cars.some((o) => o !== m && this.through(o, key)))) return { room: Math.max(0, room), why: 'turn' };
        m.pass = key;
        m.passArms = arms;
        return go;
      }
      prev = j;
    }
    return go;
  }

  // Is a car going through intersection key (let in, and not out yet)?
  through(c, key) {
    if (c.pass !== key) return false;
    const [x, y] = key.split(',').map(Number);
    return [c.tile, ...c.path.slice(0, 2)].some((t) => t.x === x && t.y === y);
  }

  // How far a car may go before it's right behind the car in front.
  queueRoom(m, ux, uy) {
    if (m.ghost > 0) return Infinity;
    let room = Infinity;
    const gap = Math.abs(ux) > Math.abs(uy) ? GAP.ew : GAP.ns;
    for (const o of this.cars) {
      if (o === m) continue;
      const rx = o.x - m.x;
      const ry = o.y - m.y;
      const along = rx * ux + ry * uy;
      if (along <= 0 || Math.abs(rx * uy - ry * ux) > 0.22) continue;
      room = Math.min(room, Math.max(0, along - gap));
    }
    return room;
  }

  // Anyone on these crosswalks of intersection j?
  peopleOn(j, arms) {
    return this.people.some((p) => p.crossing && p.crossing.ix === j.x && p.crossing.iy === j.y && arms.includes(p.crossing.arm));
  }

  // Is a car on (or about to drive over) a crosswalk?
  carsOn(cross) {
    const [x0, y0, x1, y1] = zebra(cross.ix, cross.iy, cross.arm);
    return this.cars.some((c) => {
      if (this.through(c, `${cross.ix},${cross.iy}`) && c.passArms.includes(cross.arm)) return true;
      const [a0, b0, a1, b1] = footprint(c);
      return a1 > x0 && a0 < x1 && b1 > y0 && b0 < y1;
    });
  }

  // ----------------------------------------------------------- people

  // One person along their way for dt seconds: the sidewalk point they've
  // just reached, if any. (m.wait while they wait at the curb: 'walk' for
  // the walk signal, 'car' for a car to go by.)
  walk(m, speed, dt) {
    if (!m.path.length) {
      m.wait = null;
      return null;
    }
    const b = m.path[0];
    if (!m.crossing) {
      const cross = crossingOf(this.ways, m.node, b);
      if (cross) {
        const lit = isLit(cross.ix, cross.iy);
        if ((lit && !mayWalk(cross, this.t)) || this.carsOn(cross)) {
          m.wait = lit && !mayWalk(cross, this.t) ? 'walk' : 'car';
          return null;
        }
        m.crossing = cross;
      }
    }
    m.wait = null;
    const goal = this.ways.nodes[b];
    const dx = goal.x - m.x;
    const dy = goal.y - m.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.02) m.face = Math.sign(dx);
    const step = speed * dt;
    if (dist <= step) {
      m.x = goal.x;
      m.y = goal.y;
      m.node = b;
      m.path.shift();
      m.crossing = null;
      return b;
    }
    m.x += (dx / dist) * step;
    m.y += (dy / dist) * step;
    return null;
  }
}

// Somewhere for a car out for a drive to go: a street tile in town (not an
// intersection, nor a dead end at the edge).
export function streetTiles(size) {
  const list = [];
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) if (isRoad(x, y) && !isJunction(x, y) && !atEdge(x, y)) list.push({ x, y });
  return list;
}
