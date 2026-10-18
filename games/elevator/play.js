// Elevator Operator in play: the building in profile -- the street outside
// on the left, where people walk in and drive down into the garage; a
// helipad on the roof; the tall ones crowned like the Empire State Building
// -- with 8-bit people walking from their offices, cars and helicopters to
// the call buttons and queueing; a shaft for each lift on the right, where
// you tap a floor to send that lift there.
import { Day, CARS, CAPACITY, WALK, floorName, stays, clockAt, dispatch, par } from './engine.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Two colours mixed (u = 0..1), as #rrggbb.
function mix(a, b, u) {
  const p = (c, i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * u).toString(16).padStart(2, '0')).join('')}`;
}

// The sky's colours through the day: [minutes after midnight, top, bottom].
const SKY = [
  [390, '#1b2445', '#f19a6b'],
  [450, '#6a9fd8', '#f6d7b5'],
  [540, '#5f9fe0', '#d6eafb'],
  [1050, '#5f9fe0', '#d6eafb'],
  [1125, '#4f6fb0', '#f5b27a'],
  [1165, '#2c2c5e', '#e5795a'],
  [1200, '#0b1030', '#2a2550'],
];

// The day's milestones.
const NOTES = [
  [421, 'Good morning! The doors are open'],
  [490, 'The morning rush'],
  [600, 'Meetings, upstairs and down'],
  [735, 'Lunchtime!'],
  [840, 'Back to work'],
  [1035, 'Home time'],
  [1170, 'Night falls…'],
];
const NOTES_TWIN = [
  [421, 'Rise and shine! Parkview is waking up'],
  [480, 'Off to work: across the street, or into town'],
  [600, 'Meetings, upstairs and down'],
  [735, 'Lunchtime!'],
  [840, 'Back to work'],
  [1035, 'Home time: back across the street'],
  [1170, 'Night falls: everyone home, lights out'],
];

// ------------------------------------------------------------ 8-bit people

const SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
const HAIR = ['#2b1b0e', '#6a4e23', '#d6b370', '#1c1c1c', '#a33b20', '#c9c9c9'];
const SHIRT = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#9b5de5', '#ffbe0b', '#06d6a0', '#ef476f', '#3a86ff'];
const LEGS = ['#264653', '#3d405b', '#22223b', '#6b705c', '#14213d'];

// 8 x 12 pixels: h hair, s skin, e eye, c shirt (or dress), a arm, p
// trousers, k shoes.
const BODY = [
  '..hhhh..',
  '.hhhhhh.',
  '.hssssh.',
  '.ssesse.',
  '..ssss..',
  '.cccccc.',
  'acccccca',
  'acccccca',
  '.cccccc.',
];
const FEET = {
  stand: ['.pp..pp.', '.pp..pp.', '.kk..kk.'],
  walk1: ['.pp..pp.', 'pp....pp', 'kk....kk'],
  walk2: ['..pppp..', '..pppp..', '..kkkk..'],
};

export function lookOf(look) {
  const [a, b, c, d] = look;
  return {
    s: SKIN[a % SKIN.length],
    h: HAIR[b % HAIR.length],
    c: SHIRT[c % SHIRT.length],
    p: LEGS[d % LEGS.length],
    dress: d % 4 === 0,
  };
}

// Draws a person with their feet at (x, base), px screen pixels per sprite
// pixel. pose: stand | walk1 | walk2 | press (arm up); dir -1 faces left.
export function drawSprite(ctx, look, x, base, px, pose = 'stand', dir = 1) {
  const L = lookOf(look);
  const rows = [...BODY, ...FEET[pose === 'press' ? 'stand' : pose]];
  const y0 = base - rows.length * px;
  const colour = { h: L.h, s: L.s, e: '#1b1b1b', c: L.c, a: L.s, p: L.dress ? L.s : L.p, k: '#222' };
  rows.forEach((row, r) => {
    for (let i = 0; i < 8; i++) {
      let ch = row[i];
      if (ch === '.') continue;
      if (L.dress && r >= 9 && r <= 9 && ch === 'p') ch = 'c'; // a dress to the knee
      ctx.fillStyle = colour[ch];
      const col = dir < 0 ? 7 - i : i;
      ctx.fillRect(Math.round(x + col * px), Math.round(y0 + r * px), Math.ceil(px), Math.ceil(px));
    }
  });
  if (pose === 'press') {
    // Reaching up to the button.
    ctx.fillStyle = L.s;
    const col = dir < 0 ? 0 : 7;
    for (let r = 2; r <= 5; r++) ctx.fillRect(Math.round(x + (col + dir) * px), Math.round(y0 + r * px), Math.ceil(px), Math.ceil(px));
  }
}

// ------------------------------------------------------------------ Tower

// One building on screen -- its floors, shafts, people, cars and
// helicopters -- drawn in its own strip of the screen (a level has one, or
// two side by side).
class Tower {
  constructor(play, k, sim) {
    this.play = play;
    this.k = k;
    this.sim = sim;
    this.B = sim.building;
    this.ctx = play.ctx;
    this.hooks = play.hooks;
    this.people = new Map(); // id -> what we see of them (walking, queueing...)
    this.seen = new Set(); // arrivals already on their way
    this.autos = []; // cars in the garage (driving in, parked, driving out)
    this.helis = []; // helicopters coming and going
    this.ripples = [];
    this.pops = [];
    this.parked = false;
  }

  // A car into the next free space on garage level f (already there, or
  // driving in from the street).
  parkCar(f, there = false, person = null) {
    const taken = this.autos.filter((c) => c.floor === f && c.state !== 'out').map((c) => c.slot);
    let slot = 0;
    while (taken.includes(slot)) slot++;
    const x = this.slotX(slot);
    const car = { floor: f, slot, x: there ? x : -this.carW() - 4, target: x, state: there ? 'parked' : 'in', person, colour: (f * 7 + slot * 3) % 4 };
    this.autos.push(car);
    return car;
  }

  carW() {
    return Math.max(1, this.px * 0.75) * 12;
  }

  slotX(slot) {
    const n = Math.max(1, Math.floor((this.panelX - 70 - this.doorX) / (this.carW() + 6)));
    return this.doorX + (slot % n) * (this.carW() + 6);
  }

  // This tower's strip of the screen: from ox, W wide, H tall. Two towers
  // side by side are narrower, so everything packs tighter.
  layout(ox, W, H, narrow) {
    this.ox = ox;
    this.W = W;
    this.H = H;
    const F = this.B.floors;
    this.hud = 34;
    this.tall = this.B.storeys >= 15; // the tall ones get the Empire State crown
    this.crownH = this.tall ? clamp(H * 0.13, 50, 130) : clamp(H * 0.08, 30, 70);
    this.groundH = clamp(H * 0.03, 14, 26);
    this.rowH = Math.min(58, (H - this.hud - this.crownH - this.groundH) / F);
    this.top = H - this.groundH - this.rowH * F; // standing on the ground, sky above
    this.x0 = clamp(W * 0.12, narrow ? 14 : 34, 120); // the street is to the left
    this.x1 = W - (narrow ? 3 : 6);
    this.labelW = clamp(W * 0.07, narrow ? 16 : 22, 34);
    this.shaftW = clamp(W * 0.17, narrow ? 30 : 50, 96);
    this.gap = 6;
    this.shaftX = Array.from({ length: CARS }, (_, i) => this.x1 - 4 - (CARS - i) * this.shaftW - (CARS - 1 - i) * this.gap);
    this.panelW = clamp(this.rowH * 0.42, 9, 16);
    this.panelX = this.shaftX[0] - this.gap - this.panelW;
    this.doorX = this.x0 + this.labelW + 4; // the office door people come out of
    this.px = Math.max(1, Math.min(narrow ? 2 : 9, Math.floor((this.rowH * 0.8) / 12))); // sprite pixel size
    this.spriteW = this.px * 8;
    this.padX = this.doorX + 6; // the helipad
    this.padR = Math.min(this.rowH * 0.3, (this.panelX - this.padX) * 0.3);
    this.padCX = this.padX + this.padR * 1.4;
    // The cars of those who'll drive home are already parked (and on a
    // resize, the parked ones move to their new spaces).
    if (!this.parked) {
      this.parked = true;
      for (const a of this.sim.arrivals) if (a.to < this.B.ground) this.parkCar(a.to, true);
    }
    for (const c of this.autos) if (c.state === 'parked') c.x = c.target = this.slotX(c.slot);
  }

  rowY(f) {
    return this.top + (this.B.floors - 1 - f) * this.rowH;
  }

  // ------------------------------------------------------------- input

  // A tap at (x, y) in this tower's strip: on a shaft, send that lift there.
  tap(x, y) {
    const f = this.B.floors - 1 - Math.floor((y - this.top) / this.rowH);
    if (f < 0 || f >= this.B.floors) return false;
    const i = this.shaftX.findIndex((sx) => x >= sx - this.gap / 2 && x <= sx + this.shaftW + this.gap / 2);
    if (i < 0) return false;
    this.sim.send(i, f);
    this.ripples.push({ i, f, t: 0 });
    this.hooks.sfx?.('tap');
    return true;
  }

  // ------------------------------------------------------------- simulation

  tick(dt) {
    this.movePeople(dt);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 0.6);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1);
  }

  handle(e) {
    const h = this.hooks;
    if (e.type === 'stop') h.sfx?.('ding');
    else if (e.type === 'arrive') {
      // Someone leaving a floor steps out of their office (or flat) now --
      // the moment the floor's count goes down.
      if (!this.seen.has(e.id)) {
        this.seen.add(e.id);
        this.people.set(e.id, { id: e.id, look: e.look, floor: e.floor, mode: 'in', dir: 1, x: this.doorX, target: this.doorX });
      }
      const v = this.people.get(e.id);
      if (v) v.pressT = this.sim.t;
    } else if (e.type === 'board') {
      const v = this.people.get(e.id);
      if (v) {
        v.mode = 'board';
        v.target = this.shaftX[e.car] + this.shaftW / 2 - this.spriteW / 2;
      }
    } else if (e.type === 'deliver') {
      // Out of the lift and off: into their office, out into the street, to
      // their car, or up to the helicopter.
      const B = this.B;
      const v = {
        id: e.id, look: e.look, floor: e.floor, mode: 'out', dir: -1,
        x: this.shaftX[e.car] + this.shaftW / 2 - this.spriteW / 2, target: this.doorX,
      };
      if (e.floor === B.ground) v.target = -this.spriteW * 2;
      else if (e.floor < B.ground) {
        const car = this.autos.find((c) => c.floor === e.floor && c.state === 'parked' && !c.taken) || this.parkCar(e.floor, true);
        car.taken = true;
        v.car = car;
        v.target = car.x + this.carW() - this.spriteW;
      } else if (e.floor === B.roof) {
        v.heli = this.callHeli(null);
        v.target = this.padCX + this.spriteW / 2;
      }
      this.people.set(e.id, v);
      this.pops.push({ i: e.car, f: e.floor, t: 0 });
      h.sfx?.('drop');
    }
  }

  // A helicopter in to the pad: bringing someone (or to collect someone).
  callHeli(person) {
    const h = this.helis.find((q) => q.state !== 'out' && !q.full);
    if (h && !person) return h;
    const heli = { x: -60, y: this.hud + 10, state: 'in', t: 0, person, full: !!person };
    this.helis.push(heli);
    return heli;
  }

  // How long before pressing the button someone sets off (so they reach it
  // about then): from their office, the street, their car or a helicopter.
  lead(a) {
    const B = this.B;
    const walk = WALK;
    if (a.from === B.ground) return walk + 1.5;
    if (a.from < B.ground) return walk + 2.5;
    if (a.from === B.roof) return walk + 3.5;
    return walk;
  }

  // Walking: people set off a little before they reach the button; the
  // queue shuffles forward; riders step in and out of the lifts; cars drive
  // in and out of the garage; helicopters land and take off.
  movePeople(dt) {
    const { sim, B } = this;
    // Those coming in from outside (the street, the garage, the sky) set off
    // early, to reach the button about when they press it.
    for (const a of sim.pending) {
      if (this.seen.has(a.id) || stays(B, a.from) || a.t - this.lead(a) > sim.t) continue;
      this.seen.add(a.id);
      const v = { id: a.id, look: a.look, floor: a.from, to: a.to, mode: 'in', dir: 1, x: this.doorX, target: this.doorX, t: a.t };
      if (a.from === B.ground) {
        v.x = -this.spriteW * 2; // along the street and in through the doors
        this.people.set(a.id, v);
      } else if (a.from < B.ground) {
        v.hidden = true; // still in their car
        this.people.set(a.id, v);
        this.parkCar(a.from, false, a.id);
      } else if (a.from === B.roof) {
        v.hidden = true; // still in the helicopter
        this.people.set(a.id, v);
        this.callHeli(a.id);
      }
    }
    // Queue places: those waiting first (in order), then those on their way.
    const slot = (k) => this.panelX - 3 - (k + 1) * (this.spriteW + 2);
    for (let f = 0; f < B.floors; f++) {
      let k = 0;
      for (const p of sim.waiting[f]) {
        const v = this.people.get(p.id);
        if (!v) continue;
        v.mode = 'wait';
        v.since = p.t;
        v.target = Math.max(this.doorX, slot(k++));
      }
      for (const v of this.people.values()) if (v.floor === f && v.mode === 'in') v.target = Math.max(this.doorX, slot(k++));
    }
    const corridor = this.panelX - this.doorX;
    const speed = Math.max(30, corridor / (WALK * 0.9));
    const step = (o, sp) => {
      const d = o.target - o.x;
      const dx = Math.sign(d) * Math.min(Math.abs(d), sp * dt);
      o.x += dx;
      return dx;
    };
    for (const v of [...this.people.values()]) {
      if (v.hidden) continue;
      const dx = step(v, speed * (v.mode === 'board' ? 2.5 : 1));
      v.moving = Math.abs(dx) > 0.01;
      if (v.moving) v.dir = Math.sign(dx);
      if (v.moving) continue;
      if (v.mode === 'board') this.people.delete(v.id);
      else if (v.mode === 'out') {
        // Arrived: in at the office door, off the screen, into the car (which
        // drives away) or the helicopter (which takes off).
        if (v.car) v.car.state = 'out';
        if (v.heli) {
          if (v.heli.state !== 'landed') continue;
          v.heli.leaveAt = v.heli.t + 0.6;
        }
        this.people.delete(v.id);
      }
    }
    // Cars in the garage.
    const carSpeed = Math.max(60, corridor / 2);
    for (const c of this.autos) {
      if (c.state === 'out') c.target = -this.carW() * 2;
      step(c, carSpeed);
      if (c.state === 'in' && c.x === c.target) {
        c.state = 'parked';
        const v = c.person !== null && this.people.get(c.person);
        if (v) {
          v.hidden = false;
          v.x = c.x + this.carW() - this.spriteW;
        }
        c.person = null;
        c.taken = true; // (they'll drive it home later, or not)
      }
    }
    this.autos = this.autos.filter((c) => !(c.state === 'out' && c.x <= -this.carW() * 2 + 0.5));
    // Helicopters: fly in to the pad, set down, take off again.
    const padY = this.rowY(B.roof) + this.rowH - 2;
    for (const h of this.helis) {
      h.t += dt;
      if (h.state === 'in') {
        const u = Math.min(1, h.t / 3);
        const e = u * u * (3 - 2 * u);
        h.x = -60 + (this.padCX + 60) * e;
        h.y = this.hud + 10 + (padY - this.hud - 10) * e;
        if (u >= 1) {
          h.state = 'landed';
          h.landedAt = h.t;
          const v = h.person !== null && this.people.get(h.person);
          if (v) {
            v.hidden = false;
            v.x = this.padCX + this.spriteW;
            h.leaveAt = h.t + 1.2;
          }
        }
      } else if (h.state === 'landed' && h.leaveAt !== undefined && h.t >= h.leaveAt) {
        h.state = 'out';
        h.outAt = h.t;
      } else if (h.state === 'out') {
        const u = h.t - h.outAt;
        h.y -= dt * 40 * (1 + u);
        h.x += dt * 50 * u;
      }
    }
    this.helis = this.helis.filter((h) => h.y > -80);
  }

  // --------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, W, H, rowH, B } = this;
    const street = this.rowY(B.ground) + rowH;
    // The ground, cut away to show the garage.
    ctx.fillStyle = '#6b5641';
    ctx.fillRect(0, street, W, H - street);
    if (this.tall) this.drawCrown(time);
    // The building (the roof is open to the sky).
    ctx.fillStyle = '#e9e0cc';
    ctx.fillRect(this.x0, this.rowY(B.roof) + rowH, this.x1 - this.x0, rowH * (B.floors - 1));
    this.drawRoof(time);
    for (let f = 0; f < B.floors; f++) this.drawFloor(f, time);
    this.drawStreet(street);
    this.drawAutos();
    for (let i = 0; i < CARS; i++) this.drawShaft(i, time);
    for (const h of this.helis) this.drawHeli(h, time);
  }

  // Outside, on the left: the pavement at lobby level, and the ramp down to
  // the garage.
  drawStreet(street) {
    const { ctx, rowH, B } = this;
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, street - 3, this.x0, 4);
    ctx.fillStyle = '#4a4a4f';
    ctx.fillRect(0, street + 1, this.x0, 3);
    // A street lamp.
    ctx.fillStyle = '#3b3f4a';
    ctx.fillRect(this.x0 * 0.3, street - rowH * 0.95, 2, rowH * 0.95);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(this.x0 * 0.3 - 2, street - rowH * 0.97, 6, 3);
    // The ramp: a driveway down into each garage level.
    for (const f of B.garage) {
      const y = this.rowY(f);
      ctx.fillStyle = '#3d3d42';
      ctx.fillRect(0, y + rowH * 0.25, this.x0 + 2, rowH * 0.75 - 2);
      ctx.fillStyle = '#e9d36a';
      for (let x = 4; x < this.x0; x += 12) ctx.fillRect(x, y + rowH * 0.62, 6, 1.5);
    }
  }

  drawAutos() {
    for (const c of this.autos) this.drawCar(c.x, this.rowY(c.floor) + this.rowH - 2, c.colour);
  }

  // The roof: open to the sky, the helipad on the left, the lift machine
  // room over the shafts.
  drawRoof(time) {
    const { ctx, rowH, B } = this;
    const y = this.rowY(B.roof);
    ctx.fillStyle = '#b8ab92';
    ctx.fillRect(this.x0, y + rowH - 3, this.x1 - this.x0, 3);
    ctx.fillRect(this.x0, y + rowH * 0.62, 3, rowH * 0.38);
    if (B.type === 'residential') {
      // A roof garden (a lawn and a few trees), and a helipad.
      ctx.fillStyle = '#7cb342';
      ctx.fillRect(this.x0 + 3, y + rowH - 6, this.panelX - this.x0 - 6, 3);
      this.drawPad(y);
      for (let x = this.padCX + this.padR * 2 + 6; x < this.panelX - 12; x += 26) {
        ctx.fillStyle = '#6b4f2a';
        ctx.fillRect(x + 4, y + rowH * 0.62, 2, rowH * 0.3);
        ctx.fillStyle = '#4caf50';
        ctx.beginPath();
        ctx.arc(x + 5, y + rowH * 0.55, rowH * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      this.drawPad(y);
    }
    // Machine room over the lifts.
    ctx.fillStyle = '#d4cab5';
    ctx.fillRect(this.shaftX[0] - 3, y - rowH * 0.5, this.x1 - this.shaftX[0] + 3, rowH * 0.5);
    ctx.fillStyle = '#b8ab92';
    ctx.fillRect(this.shaftX[0] - 3, y - rowH * 0.5, this.x1 - this.shaftX[0] + 3, 2);
    if (Math.sin(time * 3) > 0) {
      ctx.fillStyle = '#ff2d2d';
      ctx.fillRect(this.x1 - 6, y - rowH * 0.5 - 4, 3, 3);
    }
  }

  // The helipad, on the roof at y.
  drawPad(y) {
    const { ctx, rowH } = this;
    const pr = this.padR;
    const cx = this.padCX;
    ctx.fillStyle = '#4b4f5a';
    ctx.beginPath();
    ctx.ellipse(cx, y + rowH - 4, pr * 1.4, pr * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = `900 ${Math.max(7, pr * 0.55)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', cx, y + rowH - 4);
  }

  // A helicopter, 8-bit, its rotor a blur.
  drawHeli(h, time) {
    const { ctx } = this;
    const p = Math.max(1.5, this.px * 1.2);
    const rows = [
      '.......bbbbbb.......',
      '......bwwwbbbb......',
      'tttttbbwwwbbbbb.....',
      '.....bbbbbbbbbb.....',
      '.......k....k.......',
      '.....kkkkkkkkkkk....',
    ];
    const colour = { b: '#d62828', w: '#bfe3f5', t: '#a31d1d', k: '#2b2b2b' };
    const x0 = h.x - 10 * p;
    const y0 = h.y - rows.length * p;
    rows.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '.') continue;
        ctx.fillStyle = colour[row[i]];
        ctx.fillRect(Math.round(x0 + i * p), Math.round(y0 + r * p), Math.ceil(p), Math.ceil(p));
      }
    });
    // Rotor: spinning (its length flickers), slowing once landed.
    const spin = h.state === 'landed' && (h.leaveAt === undefined || h.t < h.landedAt + 0.5) ? 0.5 : 1;
    const len = 12 * p * (0.6 + 0.4 * Math.abs(Math.sin(time * 30 * spin)));
    ctx.fillStyle = '#333';
    ctx.fillRect(Math.round(x0 + 10 * p - len), Math.round(y0 - p), Math.round(len * 2), Math.max(1, Math.round(p * 0.7)));
    ctx.fillRect(Math.round(x0 + 10 * p), Math.round(y0 - p), Math.ceil(p), Math.ceil(p));
  }

  // The top of the Empire State Building: setbacks, the observation deck,
  // the mooring mast and the antenna with its red light.
  drawCrown(time) {
    const { ctx } = this;
    // Standing over the lifts' machine room, leaving the helipad clear.
    const cx = (this.panelX + this.x1) / 2;
    const bw = (this.x1 - this.panelX) * 1.25;
    let y = this.top - this.rowH * 0.5;
    const stone = '#ddd3bf';
    const pier = '#b8ab92';
    const tier = (w, h, piers = 0) => {
      ctx.fillStyle = stone;
      ctx.fillRect(cx - w / 2, y - h, w, h);
      if (piers) {
        // Vertical piers and dark window strips, art deco.
        const n = piers;
        for (let k = 0; k <= n; k++) {
          const x = cx - w / 2 + (w * k) / n;
          ctx.fillStyle = pier;
          ctx.fillRect(x - 1, y - h, 2, h);
          if (k < n) {
            ctx.fillStyle = 'rgba(60,70,90,0.55)';
            ctx.fillRect(x + w / n / 2 - 1, y - h + 3, 2, h - 6);
          }
        }
      }
      ctx.fillStyle = pier;
      ctx.fillRect(cx - w / 2 - 1, y - h, w + 2, 2);
      y -= h;
    };
    const H = this.crownH;
    tier(bw * 0.78, H * 0.14, 14);
    tier(bw * 0.6, H * 0.13, 10);
    tier(bw * 0.44, H * 0.12, 8);
    // Observation deck railing.
    ctx.fillStyle = '#8f846f';
    ctx.fillRect(cx - bw * 0.23, y - 2, bw * 0.46, 2);
    tier(bw * 0.3, H * 0.1, 6);
    // The mast: art deco wings, then the drum, narrowing in stages.
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.15, y);
    ctx.lineTo(cx - bw * 0.06, y - H * 0.12);
    ctx.lineTo(cx + bw * 0.06, y - H * 0.12);
    ctx.lineTo(cx + bw * 0.15, y);
    ctx.closePath();
    ctx.fill();
    y -= H * 0.12;
    tier(bw * 0.1, H * 0.09, 3);
    tier(bw * 0.075, H * 0.07, 2);
    tier(bw * 0.05, H * 0.05);
    // Antenna, with its light.
    ctx.strokeStyle = '#7d7d7d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, Math.max(this.hud + 2, y - H * 0.16));
    ctx.stroke();
    if (Math.sin(time * 3) > 0) {
      ctx.fillStyle = '#ff2d2d';
      ctx.beginPath();
      ctx.arc(cx, Math.max(this.hud + 2, y - H * 0.16), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFloor(f, time) {
    const { ctx, rowH, sim, B } = this;
    const { ground: GROUND, restaurant: RESTAURANT, gym: GYM, roof: ROOF } = B;
    const y = this.rowY(f);
    if (f % 2 && f !== ROOF) {
      ctx.fillStyle = 'rgba(120,90,40,0.05)';
      ctx.fillRect(this.x0, y, this.panelX - this.x0, rowH);
    }
    // What kind of floor: parking, the lobby, the restaurant, the health club.
    const home = B.kinds[f] === 'home';
    const tint = f < GROUND ? '#a3a6aa' : f === GROUND ? 'rgba(220,170,60,0.22)' : f === RESTAURANT ? 'rgba(200,70,50,0.13)' : f === GYM ? 'rgba(40,170,160,0.14)' : home ? 'rgba(110,100,200,0.1)' : null;
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(this.x0, y, this.panelX - this.x0, rowH);
    }
    const name = f < GROUND ? 'PARKING' : f === GROUND ? 'LOBBY' : f === RESTAURANT ? 'RESTAURANT' : f === GYM ? 'HEALTH CLUB' : f === ROOF ? 'HELIPAD' : '';
    if (name) {
      ctx.font = `800 ${clamp(rowH * 0.32, 8, 13)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = f < GROUND ? 'rgba(255,255,255,0.55)' : 'rgba(90,70,40,0.35)';
      const room = this.panelX - (this.doorX + this.spriteW + 44) - 4;
      ctx.save();
      const tw = ctx.measureText(name).width;
      const cxName = (this.doorX + this.spriteW + 44 + this.panelX) / 2;
      if (tw > room) {
        ctx.translate(cxName, y + rowH * 0.3);
        ctx.scale(room / tw, 1);
        ctx.fillText(name, 0, 0);
      } else ctx.fillText(name, cxName, y + rowH * 0.3);
      ctx.restore();
    }
    if (f === RESTAURANT) this.drawTables(y);
    if (f === GYM) this.drawWeights(y);
    if (f !== ROOF) {
      ctx.fillStyle = '#b7a684';
      ctx.fillRect(this.x0, y + rowH - 2, this.x1 - this.x0, 2);
    }
    // Floor number.
    const fs = clamp(rowH * 0.4, 9, 15);
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5b4a2e';
    ctx.fillText(floorName(B, f), this.x0 + this.labelW / 2, y + rowH / 2);
    // Where they come from: a door (glass onto the street in the lobby), or
    // in the garage, their parked car.
    const dw = this.spriteW + 4;
    if (f < GROUND) {
      // The way in from the ramp.
      ctx.fillStyle = '#3d3d42';
      ctx.fillRect(this.x0, y + rowH * 0.25, 4, rowH * 0.75 - 2);
    } else if (f !== ROOF) {
      ctx.fillStyle = f === GROUND ? 'rgba(140,190,220,0.7)' : home ? '#5c6b8a' : '#8a6a44';
      ctx.fillRect(this.doorX - 2, y + rowH * 0.12, dw, rowH * 0.86 - 2);
      ctx.fillStyle = f === GROUND ? '#6a8aa0' : home ? '#46536e' : '#6b5133';
      ctx.fillRect(this.doorX - 2 + dw - 4, y + rowH * 0.5, 2, 2);
    }
    // How many people are on this floor just now (at their desks, eating,
    // working out): a little figure and the number.
    if (stays(B, f)) {
      const n = sim.occupancy[f];
      const bx = this.doorX + dw + 3;
      const by = y + rowH / 2;
      const s2 = clamp(rowH * 0.12, 2, 5);
      ctx.fillStyle = n ? '#5b4a2e' : 'rgba(91,74,46,0.3)';
      ctx.beginPath();
      ctx.arc(bx + s2, by - s2 * 1.2, s2 * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(bx + s2 * 0.2, by - s2 * 0.2, s2 * 1.6, s2 * 1.8);
      ctx.font = `800 ${clamp(rowH * 0.36, 9, 14)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), bx + s2 * 2.6, by);
    }
    // The call buttons: lit for anyone waiting to go up, or down.
    const w = sim.waiting[f];
    const up = w.some((p) => p.to > f);
    const down = w.some((p) => p.to < f);
    const px = this.panelX;
    const pw = this.panelW;
    ctx.fillStyle = '#c9a54b';
    ctx.fillRect(px, y + rowH * 0.18, pw, rowH * 0.62);
    const button = (on, cy, dir) => {
      const r = pw * 0.3;
      ctx.fillStyle = on ? '#ff8c1a' : '#7a6330';
      ctx.beginPath();
      ctx.arc(px + pw / 2, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (on) {
        ctx.fillStyle = 'rgba(255,170,60,0.35)';
        ctx.beginPath();
        ctx.arc(px + pw / 2, cy, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = on ? '#fff' : '#c9a54b';
      ctx.beginPath();
      ctx.moveTo(px + pw / 2, cy - dir * r * 0.6);
      ctx.lineTo(px + pw / 2 - r * 0.55, cy + dir * r * 0.4);
      ctx.lineTo(px + pw / 2 + r * 0.55, cy + dir * r * 0.4);
      ctx.closePath();
      ctx.fill();
    };
    if (f < B.floors - 1) button(up, y + rowH * 0.34, 1);
    if (f > 0) button(down, y + rowH * 0.64, -1);
    // People on this floor.
    const base = y + rowH - 2;
    for (const v of this.people.values()) {
      if (v.floor !== f || v.hidden) continue;
      const pressing = v.pressT !== undefined && sim.t - v.pressT < 0.5 && v.mode === 'wait';
      const pose = pressing ? 'press' : v.moving ? (Math.floor(time * 8 + v.id) % 2 ? 'walk1' : 'walk2') : 'stand';
      drawSprite(this.ctx, v.look, v.x, base, this.px, pose, v.mode === 'wait' && !v.moving ? 1 : v.dir);
      // Getting impatient.
      if (v.mode === 'wait' && v.since !== undefined) {
        const waited = sim.t - v.since;
        if (waited > 20) this.bubble(v.x + this.spriteW / 2, base - this.px * 12 - 2, waited > 40 ? '!' : '…', waited > 40);
      }
    }
  }

  // A parked car, 8-bit, its nose to the left.
  drawCar(x, base, paint) {
    const { ctx } = this;
    const p = Math.max(1, this.px * 0.75);
    const body = ['#c1121f', '#1d3557', '#ffb703', '#2a9d8f'][paint % 4];
    const rows = [
      '...wwwww....',
      '..wwbbbbww..',
      'cccccccccccc',
      'cccccccccccc',
      '.kk......kk.',
    ];
    const colour = { w: '#bfe3f5', b: '#bfe3f5', c: body, k: '#1b1b1b' };
    const y0 = base - rows.length * p;
    rows.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '.') continue;
        ctx.fillStyle = r < 2 && row[i] === 'w' ? body : colour[row[i]];
        ctx.fillRect(Math.round(x + i * p), Math.round(y0 + r * p), Math.ceil(p), Math.ceil(p));
      }
    });
  }

  // The restaurant's tables and the health club's weights, along the back.
  drawTables(y) {
    const { ctx, rowH } = this;
    const from = this.doorX + this.spriteW + 14;
    for (let x = from; x < this.panelX - 70; x += 38) {
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(x, y + rowH * 0.62, 16, 3);
      ctx.fillRect(x + 7, y + rowH * 0.62, 2, rowH * 0.3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 3, y + rowH * 0.55, 4, 3);
    }
  }

  drawWeights(y) {
    const { ctx, rowH } = this;
    const from = this.doorX + this.spriteW + 14;
    for (let x = from; x < this.panelX - 70; x += 40) {
      const cy = y + rowH * 0.72;
      ctx.fillStyle = '#3b3f4a';
      ctx.fillRect(x, cy - 1, 18, 2);
      ctx.fillRect(x, cy - 4, 4, 8);
      ctx.fillRect(x + 14, cy - 4, 4, 8);
    }
  }

  bubble(x, y, text, angry) {
    const { ctx } = this;
    const r = clamp(this.rowH * 0.2, 5, 9);
    ctx.fillStyle = angry ? '#e5383b' : '#fff';
    ctx.beginPath();
    ctx.arc(x, y - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = angry ? '#fff' : '#333';
    ctx.font = `900 ${r * 1.5}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - r + (angry ? 1 : -1));
  }

  drawShaft(i, time) {
    const { ctx, rowH, sim } = this;
    const x = this.shaftX[i];
    const w = this.shaftW;
    const car = sim.cars[i];
    ctx.fillStyle = '#3b3f4a';
    ctx.fillRect(x, this.top - 2, w, rowH * this.B.floors + 2);
    // Who in this lift wants which floor.
    const wanted = new Map();
    for (const p of car.riders) {
      if (!wanted.has(p.to)) wanted.set(p.to, []);
      wanted.get(p.to).push(p);
    }
    for (let f = 0; f < this.B.floors; f++) {
      const y = this.rowY(f);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3.5, y + 2.5, w - 7, rowH - 5);
      if (wanted.has(f)) this.drawLit(x, y, w, wanted.get(f));
    }
    // Where it's been sent: a pulsing outline.
    if (car.target !== null) {
      const y = this.rowY(car.target);
      ctx.strokeStyle = `rgba(80,220,255,${0.65 + 0.35 * Math.sin(time * 8)})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 2, y + 1.5, w - 4, rowH - 3);
    }
    for (const r of this.ripples.filter((q) => q.i === i)) {
      const y = this.rowY(r.f) + rowH / 2;
      ctx.strokeStyle = `rgba(80,220,255,${1 - r.t / 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y, 6 + r.t * 50, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The car, with its riders always in view (the doors are glass), from
    // the left, spaced so that a full load fills it wall to wall.
    const cy = this.top + (this.B.floors - 1 - car.pos) * rowH;
    const cw = w - 8;
    const cx = x + 4;
    const ch = rowH - 3;
    const full = car.riders.length >= CAPACITY;
    ctx.fillStyle = '#d9dde4';
    ctx.fillRect(cx, cy + 1, cw, ch);
    ctx.fillStyle = '#fff3cf';
    ctx.fillRect(cx + 2, cy + 3, cw - 4, ch - 4);
    const mini = Math.max(1, Math.floor((ch - 5) / 12));
    const fw = mini * 8;
    const stepX = Math.min(fw + 1, (cw - 6 - fw) / (CAPACITY - 1));
    car.riders.forEach((p, k) => drawSprite(ctx, p.look, cx + 3 + k * stepX, cy + ch - 1, mini, 'stand'));
    const half = (cw - 4) / 2;
    const open = half * car.open;
    ctx.fillStyle = 'rgba(150,165,185,0.35)';
    ctx.fillRect(cx + 2, cy + 3, half - open, ch - 4);
    ctx.fillRect(cx + 2 + half + open, cy + 3, half - open, ch - 4);
    ctx.strokeStyle = 'rgba(110,120,140,0.9)';
    ctx.lineWidth = 1;
    if (half - open > 1) {
      ctx.strokeRect(cx + 2.5, cy + 3.5, half - open - 1, ch - 5);
      ctx.strokeRect(cx + 2.5 + half + open, cy + 3.5, half - open - 1, ch - 5);
    }
    ctx.strokeStyle = full ? '#e5383b' : '#6b7383';
    ctx.lineWidth = full ? 2 : 1;
    ctx.strokeRect(cx + 0.5, cy + 1.5, cw - 1, ch - 1);
    // Going up or down; full.
    ctx.font = `900 ${clamp(rowH * 0.3, 8, 11)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    if (car.phase === 'moving') {
      ctx.fillStyle = '#22283a';
      ctx.textAlign = 'right';
      ctx.fillText(car.v > 0 ? '▲' : '▼', cx + cw - 2, cy + 3);
    }
    for (const p of this.pops.filter((q) => q.i === i)) {
      ctx.globalAlpha = 1 - p.t;
      ctx.fillStyle = '#2bb673';
      ctx.font = `900 ${clamp(rowH * 0.45, 10, 15)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('+1', x + w / 2, this.rowY(p.f) + rowH / 2 - p.t * 22);
      ctx.globalAlpha = 1;
    }
    // Which lift.
    ctx.fillStyle = '#3b3f4a';
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - 22, this.top - 17, 44, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`LIFT ${String.fromCharCode(65 + i)}`, x + w / 2, this.top - 10);
  }

  // A floor someone in the lift has pressed: lit, with a dot for each rider
  // who wants it (at most 8, in rows of 4).
  drawLit(x, y, w, riders) {
    const { ctx, rowH } = this;
    const n = riders.length;
    ctx.fillStyle = 'rgba(255,196,50,0.35)';
    ctx.fillRect(x + 3, y + 2, w - 6, rowH - 4);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 3.5, y + 2.5, w - 7, rowH - 5);
    const r = clamp(rowH * 0.1, 2, 4);
    const per = Math.min(n, 4);
    const rows = Math.ceil(n / 4);
    ctx.fillStyle = '#ffd23f';
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / 4);
      const col = k % 4;
      ctx.beginPath();
      ctx.arc(x + w / 2 + (col - (per - 1) / 2) * r * 2.8, y + rowH / 2 + (row - (rows - 1) / 2) * r * 2.8, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

}

// ------------------------------------------------------------------- Play

export class Play {
  constructor(canvas, hooks, spec) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.timeScale = 1;
    this.paused = true;
    this.hud = 34;
    this.reset(spec);
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.timeScale;
      this.last = now;
      if (!this.paused) this.update(dt);
      this.draw(now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    canvas.addEventListener('pointerdown', (e) => this.tap(e));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  // Start (or restart) the level; with `autopilot` (the dispatcher's way for
  // each tower), the computer runs the lifts and you watch.
  reset(spec = this.spec, autopilot = null) {
    this.spec = spec;
    this.day = new Day(spec);
    this.autopilot = autopilot;
    this.par = null;
    this.towers = this.day.sims.map((sim, k) => new Tower(this, k, sim));
    if (this.W) this.layout();
  }

  // The first tower's lifts (one-tower levels have just the one).
  get sim() {
    return this.day.sims[0];
  }

  // The dispatcher's result on this level (worked out once, when needed).
  getPar() {
    this.par ??= par(this.spec);
    return this.par;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.layout();
  }

  layout() {
    const n = this.towers.length;
    const w = this.W / n;
    this.towers.forEach((t, k) => t.layout(k * w, w, this.H, n > 1));
  }

  tap(e) {
    if (this.paused || this.day.over || this.autopilot) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const t = this.towers.find((q) => x >= q.ox && x < q.ox + q.W) || this.towers.at(-1);
    if (t.tap(x - t.ox, y)) e.preventDefault();
  }

  update(dt) {
    const before = clockAt(this.day.t, this.spec.play);
    if (this.banner) this.banner.t += dt / this.timeScale;
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let k = 0; k < n; k++) {
      if (this.autopilot) this.day.sims.forEach((s, i) => dispatch(s, this.autopilot[i] || {}));
      for (const e of this.day.step(dt / n)) {
        if (e.type === 'over') this.hooks.onOver?.({ ...e, par: this.getPar(), watched: !!this.autopilot });
        else this.towers[e.tower].handle(e);
      }
    }
    for (const t of this.towers) t.tick(dt);
    this.note(before === clockAt(0, this.spec.play) ? before - 1 : before, clockAt(this.day.t, this.spec.play));
  }

  draw(time) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const mins = clockAt(this.day.t, this.spec.play);
    this.drawSky(mins, time);
    for (const t of this.towers) {
      ctx.save();
      ctx.translate(t.ox, 0);
      t.draw(time);
      ctx.restore();
    }
    this.drawNight(mins);
    this.drawHud();
    this.drawBanner();
  }

  // The sky through the day: dawn pink, day blue, golden hour, an orange
  // sunset, then night (if you're still at it); the sun rising in the east
  // (left), high at noon, setting in the west; stars after dark.
  drawSky(mins, time) {
    const { ctx, W, H } = this;
    const at = (keys) => {
      let k = 0;
      while (k < keys.length - 2 && mins > keys[k + 1][0]) k++;
      const [m0, ...a] = keys[k];
      const [m1, ...b] = keys[k + 1];
      const u = clamp((mins - m0) / (m1 - m0), 0, 1);
      return a.map((c, i) => mix(c, b[i], u));
    };
    const [top, bottom] = at(SKY);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Stars, coming out as it gets dark.
    const dark = clamp((mins - 1150) / 40, 0, 1);
    if (dark > 0) {
      this.stars ??= Array.from({ length: 60 }, (_, k) => [((k * 97) % 101) / 101, ((k * 53) % 89) / 89, (k % 3) + 1]);
      for (const [x, y, s] of this.stars) {
        ctx.globalAlpha = dark * (0.5 + 0.5 * Math.sin(time * 2 + x * 40));
        ctx.fillStyle = '#fff';
        ctx.fillRect(x * W, this.hud + y * H * 0.4, s * 0.8, s * 0.8);
      }
      ctx.globalAlpha = 1;
    }
    // The sun, from about 6:45 to 7:20 PM.
    const u = (mins - 405) / (1160 - 405);
    if (u > -0.02 && u < 1.02) {
      const t0 = this.towers[0];
      const horizon = t0.rowY(t0.B.ground) + t0.rowH;
      const high = this.hud + 70;
      const x = W * (0.06 + 0.88 * u);
      const y = horizon - Math.sin(Math.PI * clamp(u, 0, 1)) * (horizon - high);
      const low = 1 - Math.sin(Math.PI * clamp(u, 0, 1));
      const core = mix('#fff6c8', '#ff8c42', low);
      const glow = ctx.createRadialGradient(x, y, 4, x, y, 60);
      glow.addColorStop(0, `${core}cc`);
      glow.addColorStop(1, `${core}00`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // After sunset, everything outside dims (the lit floors still show).
  drawNight(mins) {
    const dark = clamp((mins - 1140) / 50, 0, 1);
    if (!dark) return;
    const { ctx, W, H } = this;
    ctx.fillStyle = `rgba(10,14,40,${0.3 * dark})`;
    ctx.fillRect(0, 0, W, H);
  }

  // The day's milestones, announced as they come.
  note(before, now) {
    const notes = this.towers.length > 1 ? NOTES_TWIN : NOTES;
    for (const [m, text] of notes) if (before < m && now >= m) this.banner = { text, t: 0 };
  }

  drawBanner() {
    const b = this.banner;
    if (!b || b.t > 3.2) return;
    const { ctx, W } = this;
    const a = Math.min(1, b.t / 0.3, (3.2 - b.t) / 0.5);
    ctx.globalAlpha = a;
    ctx.font = '800 16px system-ui, sans-serif';
    const w = ctx.measureText(b.text).width + 28;
    const y = this.hud + 12 + (1 - Math.min(1, b.t / 0.3)) * -10;
    ctx.fillStyle = 'rgba(34,40,58,0.88)';
    ctx.beginPath();
    ctx.roundRect((W - w) / 2, y, w, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, W / 2, y + 15);
    ctx.globalAlpha = 1;
  }

  // An analog clock: the time of day in the building.
  drawClock() {
    const { ctx } = this;
    const mins = clockAt(this.day.t, this.spec.play);
    const r = 21;
    const cx = 8 + r;
    const cy = this.hud + 6 + r;
    ctx.fillStyle = '#fffdf6';
    ctx.strokeStyle = '#3b3f4a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3b3f4a';
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      const len = k % 3 ? 2 : 4;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillRect(-1, -r + 3, 2, len);
      ctx.restore();
    }
    const hand = (angle, len, w, colour) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(angle) * len, cy - Math.cos(angle) * len);
      ctx.stroke();
    };
    hand(((mins / 60) % 12) * (Math.PI / 6), r * 0.5, 3, '#22283a');
    hand((mins % 60) * (Math.PI / 30), r * 0.78, 2, '#22283a');
    ctx.fillStyle = '#e5383b';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // And in words, underneath.
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    const tw = ctx.measureText(label).width + 8;
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2, cy + r + 3, tw, 15, 7);
    ctx.fill();
    ctx.fillStyle = '#22283a';
    ctx.fillText(label, cx, cy + r + 5);
  }

  drawHud() {
    const { ctx, W, day } = this;
    this.drawClock();
    const sum = (f) => day.sims.reduce((a, s) => a + f(s), 0);
    const items = [
      [`✓ ${sum((s) => s.delivered)}/${sum((s) => s.arrivals.length)}`, '#1d8a55'],
      [`${sum((s) => s.waitingCount())} waiting`, '#5b4a2e'],
    ];
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const widths = items.map(([t]) => ctx.measureText(t).width + 20);
    const total = widths.reduce((a, b) => a + b, 0) + 8 * (items.length - 1);
    let x = Math.max(6, (W - total) / 2);
    items.forEach(([t, c], k) => {
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      ctx.roundRect(x, 4, widths[k], 26, 13);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.textAlign = 'center';
      ctx.fillText(t, x + widths[k] / 2, 17);
      x += widths[k] + 8;
    });
    if (this.autopilot) {
      ctx.fillStyle = 'rgba(30,24,0,0.78)';
      ctx.font = '800 12px ui-monospace, Menlo, monospace';
      const t = 'DISPATCHER AT THE CONTROLS';
      const tw = ctx.measureText(t).width + 18;
      ctx.beginPath();
      ctx.roundRect((W - tw) / 2, this.hud + 4, tw, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.textAlign = 'center';
      ctx.fillText(t, W / 2, this.hud + 15);
    }
  }
}
