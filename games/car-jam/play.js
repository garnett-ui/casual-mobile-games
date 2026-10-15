// One Car Jam level in play: simulation, input and rendering.
//
// Game logic is instant and lives in `pos` (see model.js). Everything you see
// -- cars driving, queueing on the ring road, waiting for grannies -- is
// animation layered on top, so timing never changes the puzzle's outcome.
import { buildModel, occupancy, slide, solve, rng, FENCE } from './model.js';
import { drawCar, drawGranny, drawObstacle, drawBubble, rrect, CAR_COLORS } from './draw.js';

// Layout around the lot, in tiles: inner sidewalk, one-way ring road,
// outer sidewalk. The ring road runs clockwise with exits top and bottom.
const C = 0.35;
const R = 1.15;
const S = 0.55;
const O = C + R / 2; // ring road centre line, measured out from the lot edge
const PAD = C + R + S + 0.15;
const RC = 0.7; // ring corner radius
const HEADING = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

const LOT_VMAX = 14;
const LOT_ACCEL = 45;
const RING_VMAX = 8;
const RING_ACCEL = 14;
const GRANNY_SPEED = 0.85;
const COATS = ['#b388eb', '#ff8fab', '#7ec4cf', '#f6bd60', '#a7c957'];

export function starsFor(moves, par) {
  if (moves <= par) return 3;
  if (moves <= par + Math.max(2, Math.ceil(par * 0.15))) return 2;
  return 1;
}

export class Play {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.m = buildModel(level);
    this.seed = level.cars.length * 977 + level.w * 31 + level.h + (level.par || 0) * 7;
    this.r = rng(this.seed);
    this.reset();
    this.buildRing();
    this.buildCrosswalks();
    this.pointers = new Map();
    this.bindInput();
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  reset() {
    const palette = CAR_COLORS.slice();
    const pr = rng(this.seed);
    for (let k = palette.length - 1; k > 0; k--) {
      const j = Math.floor(pr() * (k + 1));
      [palette[k], palette[j]] = [palette[j], palette[k]];
    }
    this.pos = this.m.start.slice();
    this.history = [];
    this.moves = 0;
    this.won = false;
    this.seq = 0;
    this.time = 0;
    this.fx = [];
    this.hint = null;
    this.cars = this.m.cars.map((c, i) => ({
      i, len: c.len, horiz: c.horiz, dir: c.dir,
      fixed: c.horiz ? c.y : c.x,
      color: palette[i % palette.length],
      mode: 'lot', vp: this.pos[i], shake: 0, nudge: 0, nudgeSign: 0,
    }));
    for (const g of this.grannies || []) g.done = true;
    this.grannies = [];
    for (const cw of this.crosswalks || []) {
      cw.busy = false;
      cw.next = 1.5 + this.r() * 3;
    }
    this.hooks.onMoves?.(0);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind();
  }

  // ---------------------------------------------------------------- geometry

  buildRing() {
    const { w, h } = this.m;
    const pts = [];
    const line = (x0, y0, x1, y1) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1));
      for (let k = 0; k < n; k++) pts.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    };
    const arc = (cx, cy, a0) => {
      for (let k = 0; k < 10; k++) {
        const a = a0 + (Math.PI / 2) * (k / 10);
        pts.push([cx + RC * Math.cos(a), cy + RC * Math.sin(a)]);
      }
    };
    const o = O;
    line(w / 2, -o, w + o - RC, -o);
    arc(w + o - RC, -o + RC, -Math.PI / 2);
    line(w + o, -o + RC, w + o, h + o - RC);
    arc(w + o - RC, h + o - RC, 0);
    line(w + o - RC, h + o, -o + RC, h + o);
    arc(-o + RC, h + o - RC, Math.PI / 2);
    line(-o, h + o - RC, -o, -o + RC);
    arc(-o + RC, -o + RC, Math.PI);
    line(-o + RC, -o, w / 2, -o);
    pts.push([w / 2, -o]);
    const cum = [0];
    for (let k = 1; k < pts.length; k++) {
      cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    }
    this.ringPts = pts;
    this.ringCum = cum;
    this.ringLen = cum[cum.length - 1];
    this.sBottom = this.ringS(w / 2, h + o);
  }

  ringAt(s) {
    const L = this.ringLen;
    s = ((s % L) + L) % L;
    const cum = this.ringCum;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const [x0, y0] = this.ringPts[lo];
    const [x1, y1] = this.ringPts[hi];
    const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) };
  }

  ringS(x, y) {
    let best = 0;
    let bd = Infinity;
    this.ringPts.forEach(([px, py], k) => {
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    return this.ringCum[best] % this.ringLen;
  }

  // Position (d tiles out from the lot edge, a tiles along it) on a side.
  sidePoint(side, d, a) {
    const { w, h } = this.m;
    if (side === 'W') return [-d, a];
    if (side === 'E') return [w + d, a];
    if (side === 'N') return [a, -d];
    return [a, h + d];
  }

  buildCrosswalks() {
    const { w, h } = this.m;
    const want = this.level.grannies || 0;
    const options = [
      ['W', Math.floor(h / 2) - (h > 4 ? 1 : 0)],
      ['E', Math.floor(h / 2)],
      ['N', w >= 5 ? 1 : 0],
      ['S', w >= 5 ? w - 2 : w - 1],
    ];
    this.crosswalks = options.slice(0, want).map(([side, k]) => {
      const [x, y] = this.sidePoint(side, O, k + 0.5);
      return { side, k, s: this.ringS(x, y), next: 1.5 + this.r() * 3, blocked: false };
    });
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const c = this.canvas;
    const down = (e) => {
      e.preventDefault();
      this.hooks.onInteract?.();
      c.setPointerCapture?.(e.pointerId);
      const p = this.toWorld(e);
      const car = this.pickCar(p.x, p.y);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), car, used: false });
    };
    const move = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr || ptr.used || ptr.car == null) return;
      const dx = e.clientX - ptr.x;
      const dy = e.clientY - ptr.y;
      const thr = Math.max(12, this.T * 0.3);
      if (Math.hypot(dx, dy) < thr) return;
      ptr.used = true;
      const car = this.cars[ptr.car];
      const along = car.horiz ? dx : dy;
      const across = car.horiz ? dy : dx;
      if (Math.abs(along) < Math.abs(across) * 0.45) {
        // Swiped sideways: cars can't do that. Give a little wiggle.
        this.nudge(car, 0);
        return;
      }
      this.tryMove(ptr.car, along > 0 ? 1 : -1);
    };
    const up = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!ptr || ptr.used || ptr.car == null) return;
      if (performance.now() - ptr.t < 450) {
        // Tap: drive forwards.
        const car = this.cars[ptr.car];
        this.tryMove(ptr.car, car.dir === 'E' || car.dir === 'S' ? 1 : -1);
      }
    };
    const cancel = (e) => this.pointers.delete(e.pointerId);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', cancel);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', cancel);
    };
  }

  toWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.ox) / this.T,
      y: (e.clientY - rect.top - this.oy) / this.T,
    };
  }

  carRect(car) {
    return car.horiz
      ? [car.vp, car.fixed, car.vp + car.len, car.fixed + 1]
      : [car.fixed, car.vp, car.fixed + 1, car.vp + car.len];
  }

  pickCar(x, y) {
    let best = null;
    let bd = 0.35; // forgiving touch target
    for (const car of this.cars) {
      if (car.mode !== 'lot') continue;
      const [x0, y0, x1, y1] = this.carRect(car);
      const dx = Math.max(x0 - x, 0, x - x1);
      const dy = Math.max(y0 - y, 0, y - y1);
      const d = Math.hypot(dx, dy);
      if (d < bd || (d === 0 && bd === 0)) {
        bd = d;
        best = car.i;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- actions

  tryMove(i, sign) {
    if (this.won || this.pos[i] < 0) return;
    const car = this.cars[i];
    if (car.mode !== 'lot') return;
    const occ = occupancy(this.m, this.pos);
    const r = slide(this.m, occ, this.pos, i, sign);
    this.hint = null;
    if (r.dist === 0) {
      this.nudge(car, sign);
      this.bumpInto(r.blocker, car, sign);
      return;
    }
    this.history.push(this.pos.slice());
    this.moves++;
    this.hooks.onMoves?.(this.moves);
    this.pos[i] = r.to;
    car.sign = sign;
    car.v = 4;
    car.seq = ++this.seq;
    car.blocker = r.blocker;
    car.honked = false;
    this.hooks.sfx?.('vroom');
    if (r.exit) {
      const size = car.horiz ? this.m.w : this.m.h;
      car.mode = 'exit';
      car.side = r.edge;
      car.target = sign > 0 ? size + O - car.len / 2 : -O - car.len / 2;
      const [x, y] = this.sidePoint(r.edge, O, car.fixed + 0.5);
      car.sEntry = this.ringS(x, y);
    } else {
      car.mode = 'slide';
      car.target = r.to;
    }
  }

  nudge(car, sign) {
    car.nudge = 0.25;
    car.nudgeSign = sign;
    if (sign === 0) car.shake = 0.3;
    this.hooks.haptic?.(12);
  }

  bumpInto(blocker, car, sign) {
    this.hooks.sfx?.('bump');
    this.hooks.haptic?.(20);
    if (blocker >= 0) this.cars[blocker].shake = 0.35;
    // Puff where the cars met.
    const [x0, y0, x1, y1] = this.carRect(car);
    const front = sign > 0 ? (car.horiz ? x1 : y1) : car.horiz ? x0 : y0;
    const p = car.horiz ? [front, car.fixed + 0.5] : [car.fixed + 0.5, front];
    this.fx.push({ kind: 'puff', x: p[0], y: p[1], t: 0, life: 0.4 });
    if (blocker === FENCE) this.fx.push({ kind: 'text', text: 'Hedge!', x: p[0], y: p[1], t: 0, life: 0.9 });
  }

  undo() {
    if (!this.history.length || this.won) return;
    this.pos = this.history.pop();
    this.moves--;
    this.hooks.onMoves?.(this.moves);
    this.hint = null;
    for (const car of this.cars) {
      if (this.pos[car.i] >= 0) {
        car.mode = 'lot';
        car.vp = this.pos[car.i];
      }
    }
  }

  showHint() {
    if (this.won) return;
    const sol = solve(this.m, this.pos, 40000);
    if (!sol || !sol.moves.length) {
      this.hooks.toast?.('Stuck! Try Undo or Restart.');
      return;
    }
    const mv = sol.moves[0];
    this.hint = { car: mv.car, sign: mv.sign, t: 0 };
  }

  // ------------------------------------------------------------- simulation

  update(dt) {
    this.time += dt;
    for (const car of this.cars) {
      car.shake = Math.max(0, car.shake - dt);
      car.nudge = Math.max(0, car.nudge - dt);
      if (car.angry) car.angry = Math.max(0, car.angry - dt);
    }
    this.updateGrannies(dt);
    this.updateLot(dt);
    this.updateRing(dt);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    if (this.hint) this.hint.t += dt;
    if (!this.won && this.pos.every((p) => p < 0) && this.cars.every((c) => c.mode === 'gone')) {
      this.won = true;
      const stars = starsFor(this.moves, this.level.par);
      this.hooks.onWin?.({ moves: this.moves, par: this.level.par, stars });
    }
  }

  // Swept region a lot mover still needs, from where it is to where it's going.
  claim(car) {
    const a0 = Math.min(car.vp, car.target);
    const a1 = Math.max(car.vp, car.target) + car.len;
    return car.horiz ? [a0, car.fixed, a1, car.fixed + 1] : [car.fixed, a0, car.fixed + 1, a1];
  }

  updateLot(dt) {
    const movers = this.cars.filter((c) => c.mode === 'slide' || c.mode === 'exit').sort((a, b) => a.seq - b.seq);
    const overlap = (a, b) => a[0] < b[2] - 0.02 && b[0] < a[2] - 0.02 && a[1] < b[3] - 0.02 && b[1] < a[3] - 0.02;
    movers.forEach((car, idx) => {
      car.v = Math.min(LOT_VMAX, car.v + LOT_ACCEL * dt);
      const remaining = Math.abs(car.target - car.vp);
      let step = Math.min(car.v * dt, remaining);
      let next = car.vp + car.sign * step;
      // Yield to anything that started moving earlier and still needs the space.
      const rectAt = (vp) => {
        const save = car.vp;
        car.vp = vp;
        const r = this.carRect(car);
        car.vp = save;
        return r;
      };
      for (let k = 0; k < idx; k++) {
        if (overlap(rectAt(next), this.claim(movers[k]))) {
          car.v = 0;
          return;
        }
      }
      if (car.mode === 'exit') {
        const size = car.horiz ? this.m.w : this.m.h;
        const gate = car.sign > 0 ? size : 0;
        const frontNow = car.sign > 0 ? car.vp + car.len : car.vp;
        const frontNext = car.sign > 0 ? next + car.len : next;
        const crossing = car.sign > 0 ? frontNow <= gate && frontNext > gate : frontNow >= gate && frontNext < gate;
        if (crossing) {
          const why = this.mergeBlocked(car);
          if (why) {
            next = car.sign > 0 ? gate - car.len - 0.01 : gate + 0.01;
            if (car.sign * (next - car.vp) < 0) next = car.vp;
            car.v = 0;
            if (why === 'granny' && !car.honked) {
              car.honked = true;
              this.hooks.sfx?.('honk');
              this.fx.push({ kind: 'text', text: 'BEEP!', x: this.carCenter(car)[0], y: this.carCenter(car)[1], t: 0, life: 0.9 });
            }
          }
        }
      }
      car.vp = next;
      if (Math.abs(car.target - car.vp) < 1e-6) {
        car.vp = car.target;
        if (car.mode === 'slide') {
          car.mode = 'lot';
          if (car.blocker !== undefined) this.bumpInto(car.blocker, car, car.sign);
        } else {
          this.joinRing(car);
        }
      }
    });
  }

  // Can an exiting car pull out onto the road right now?
  mergeBlocked(car) {
    for (const g of this.grannies) {
      if (g.side !== car.side || g.d > C + R + 0.3) continue;
      if (g.a > car.fixed - 0.3 && g.a < car.fixed + 1.3) {
        g.angry = 1.2;
        return 'granny';
      }
    }
    const L = this.ringLen;
    for (const o of this.cars) {
      if (o === car) continue;
      if (o.mode === 'ring') {
        const ahead = (((o.s - car.sEntry) % L) + L) % L;
        const behind = (((car.sEntry - o.s) % L) + L) % L;
        if (ahead < 1.3 || behind < 2.0) return 'traffic';
      } else if (o.mode === 'exit' && o.side !== undefined && this.pastGate(o)) {
        const gap = Math.abs(o.sEntry - car.sEntry);
        if (Math.min(gap, L - gap) < 1.3) return 'traffic';
      }
    }
    return null;
  }

  pastGate(car) {
    const size = car.horiz ? this.m.w : this.m.h;
    return car.sign > 0 ? car.vp + car.len > size : car.vp < 0;
  }

  carCenter(car) {
    if (car.mode === 'ring' || car.mode === 'spur') return [car.x, car.y];
    const a = car.vp + car.len / 2;
    return car.horiz ? [a, car.fixed + 0.5] : [car.fixed + 0.5, a];
  }

  joinRing(car) {
    const L = this.ringLen;
    car.mode = 'ring';
    car.s = car.sEntry;
    car.v = 2;
    car.ang = HEADING[car.dir];
    const exits = [0, this.sBottom, L];
    car.sExit = exits.find((e) => e >= car.s - 0.55);
    if (car.sExit === undefined) car.sExit = L;
    if (car.sExit < car.s) car.s = car.sExit; // practically at an exit already
    const p = this.ringAt(car.s);
    car.x = p.x;
    car.y = p.y;
  }

  updateRing(dt) {
    const L = this.ringLen;
    const obstacles = [];
    for (const c of this.cars) {
      if (c.mode === 'ring') obstacles.push({ car: c, s: c.s, half: c.len / 2 - 0.05 });
      else if (c.mode === 'spur' && c.spurD < 1.2) obstacles.push({ car: c, s: c.sExit + c.spurD, half: c.len / 2 });
      else if (c.mode === 'exit' && this.pastGate(c)) obstacles.push({ car: c, s: c.sEntry, half: 0.45 });
    }
    for (const cw of this.crosswalks) if (cw.blocked) obstacles.push({ cw, s: cw.s, half: 0.55 });

    const ringCars = this.cars.filter((c) => c.mode === 'ring').sort((a, b) => (b.s - a.s));
    for (const car of ringCars) {
      const half = car.len / 2 - 0.05;
      const toExit = car.sExit - car.s;
      let free = toExit + 2;
      for (const o of obstacles) {
        if (o.car === car) continue;
        const gap = (((o.s - car.s) % L) + L) % L;
        if (gap < 0.02 || gap > toExit + half + o.half + 0.5) continue;
        const room = gap - half - o.half - 0.12;
        if (o.cw && room < -0.3) continue; // already on the crossing: keep going
        if (room < free) {
          free = room;
          if (o.cw && room < 0.6) this.angerGrannyAt(o.cw);
        }
      }
      const vTarget = Math.max(0, Math.min(RING_VMAX, free * 5));
      car.v = car.v > vTarget ? vTarget : Math.min(vTarget, car.v + RING_ACCEL * dt);
      car.s += Math.min(car.v * dt, Math.max(0, free));
      if (car.s >= car.sExit) {
        car.mode = 'spur';
        const p = this.ringAt(car.sExit);
        car.spurX = p.x;
        car.spurY = p.y;
        car.spurD = car.s - car.sExit;
        car.spurDir = Math.abs(car.sExit - this.sBottom) < 0.01 ? 1 : -1;
        car.lat0 = car.x - p.x;
      } else {
        const p = this.ringAt(car.s);
        car.x = p.x;
        car.y = p.y;
        car.angTarget = p.a;
      }
    }
    for (const car of this.cars) {
      if (car.mode !== 'spur') continue;
      car.v = Math.min(RING_VMAX * 1.3, car.v + RING_ACCEL * dt);
      car.spurD += car.v * dt;
      const fade = Math.max(0, 1 - car.spurD / 1.2);
      car.x = car.spurX + car.lat0 * fade;
      car.y = car.spurY + car.spurDir * car.spurD;
      car.angTarget = car.spurDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const offscreen = car.spurDir > 0 ? this.oy + (car.y - 1.5) * this.T > this.cssH : this.oy + (car.y + 1.5) * this.T < 0;
      if (offscreen || car.spurD > 40) {
        car.mode = 'gone';
        this.hooks.sfx?.('pop');
      }
    }
    // Smoothly steer the drawn angle towards the direction of travel.
    for (const car of this.cars) {
      if (car.mode !== 'ring' && car.mode !== 'spur') continue;
      let d = car.angTarget - car.ang;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      car.ang += d * Math.min(1, dt * 9);
    }
  }

  angerGrannyAt(cw) {
    for (const g of this.grannies) if (g.cw === cw) g.angry = Math.max(g.angry || 0, 0.8);
  }

  updateGrannies(dt) {
    const L = this.ringLen;
    for (const cw of this.crosswalks) {
      if (cw.busy) continue;
      cw.next -= dt;
      if (cw.next > 0 || this.won) continue;
      cw.busy = true;
      const size = cw.side === 'W' || cw.side === 'E' ? this.m.h : this.m.w;
      const mid = cw.k + 0.5;
      const dOut = C + R + S * 0.5 + 0.05;
      const from = this.r() < 0.5 ? -1 : 1;
      const clampA = (a) => Math.max(-(C + R) + 0.2, Math.min(size + C + R - 0.2, a));
      const a0 = clampA(mid + from * (2 + this.r() * 1.5));
      const a1 = clampA(mid - from * (2 + this.r() * 1.5));
      this.grannies.push({
        cw, side: cw.side, d: dOut, a: a0, step: 0, alpha: 0, angry: 0,
        coat: COATS[Math.floor(this.r() * COATS.length)],
        path: [
          { d: dOut, a: mid },
          { d: C * 0.5, a: mid, pause: 1.0 + this.r() * 1.2, road: true },
          { d: dOut, a: mid, road: true },
          { d: dOut, a: a1, last: true },
        ],
        ang: 0,
      });
    }
    for (const g of this.grannies) {
      g.angry = Math.max(0, g.angry - dt);
      const wp = g.path[0];
      if (!wp) {
        g.alpha -= dt * 2;
        if (g.alpha <= 0) {
          g.done = true;
          g.cw.busy = false;
          g.cw.next = 2 + this.r() * 5;
        }
        continue;
      }
      g.alpha = Math.min(1, g.alpha + dt * 2);
      if (g.pausing > 0) {
        g.pausing -= dt;
        continue;
      }
      // Before stepping into the road, look both ways.
      const onSidewalk = g.d > C + R || g.d < C;
      if (wp.road && onSidewalk && !wp.started) {
        let clear = true;
        for (const c of this.cars) {
          if (c.mode === 'ring') {
            const gap = (((g.cw.s - c.s) % L) + L) % L;
            const past = (((c.s - g.cw.s) % L) + L) % L;
            if (gap < 2.2 || past < c.len / 2 + 0.6) clear = false;
          } else if (c.mode === 'exit' && c.side === g.side && this.pastGate(c) && Math.abs(c.fixed + 0.5 - g.a) < 1.3) {
            clear = false;
          }
        }
        if (!clear) continue;
        wp.started = true;
      }
      const dd = wp.d - g.d;
      const da = wp.a - g.a;
      const dist = Math.hypot(dd, da);
      const step = GRANNY_SPEED * dt;
      const [wx0, wy0] = this.sidePoint(g.side, g.d, g.a);
      if (dist <= step) {
        g.d = wp.d;
        g.a = wp.a;
        g.path.shift();
        if (wp.pause) g.pausing = wp.pause;
      } else {
        g.d += (dd / dist) * step;
        g.a += (da / dist) * step;
        g.step += dt * 9;
      }
      const [wx1, wy1] = this.sidePoint(g.side, g.d, g.a);
      if (wx1 !== wx0 || wy1 !== wy0) g.ang = Math.atan2(wy1 - wy0, wx1 - wx0);
    }
    this.grannies = this.grannies.filter((g) => !g.done);
    for (const cw of this.crosswalks) {
      cw.blocked = this.grannies.some((g) => g.cw === cw && g.d > C - 0.1 && g.d < C + R + 0.15);
    }
  }

  // --------------------------------------------------------------- drawing

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    const { w, h } = this.m;
    this.T = Math.min(this.cssW / (w + 2 * PAD), this.cssH / (h + 2 * PAD));
    this.ox = (this.cssW - w * this.T) / 2;
    this.oy = (this.cssH - h * this.T) / 2;
    this.renderStatic();
  }

  renderStatic() {
    const bg = document.createElement('canvas');
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const ctx = bg.getContext('2d');
    const { T, ox, oy, dpr } = this;
    const { w, h } = this.m;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Grass with a little texture
    ctx.fillStyle = '#86c96f';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    const r = rng(7);
    for (let k = 0; k < (this.cssW * this.cssH) / 600; k++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(60,120,50,0.18)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(r() * this.cssW, r() * this.cssH, 2, 3);
    }
    for (let k = 0; k < (this.cssW * this.cssH) / 9000; k++) {
      ctx.fillStyle = ['#fff', '#ffd6e0', '#fff3a3'][k % 3];
      ctx.beginPath();
      ctx.arc(r() * this.cssW, r() * this.cssH, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(ox, oy);
    const band = (off, rad, color) => {
      ctx.fillStyle = color;
      rrect(ctx, -off * T, -off * T, (w + 2 * off) * T, (h + 2 * off) * T, rad * T);
      ctx.fill();
    };
    const exitRoad = (color) => {
      ctx.fillStyle = color;
      ctx.fillRect((w / 2 - R / 2) * T, -oy - 2, R * T, oy + 2 - (C) * T);
      ctx.fillRect((w / 2 - R / 2) * T, (h + C) * T, R * T, this.cssH - oy - (h + C) * T + 2);
    };
    band(C + R + S, RC + R / 2 + S, '#d9dce3'); // outer sidewalk
    exitRoad('#d9dce3');
    band(C + R + 0.06, RC + R / 2, '#b7bcc7'); // curb
    band(C + R, RC + R / 2, '#4b4f5c'); // road
    exitRoad('#4b4f5c');

    // Road edge lines and direction arrows
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, T * 0.03);
    rrect(ctx, -(C + R - 0.08) * T, -(C + R - 0.08) * T, (w + 2 * (C + R - 0.08)) * T, (h + 2 * (C + R - 0.08)) * T, (RC + R / 2 - 0.08) * T);
    ctx.stroke();
    const L = this.ringLen;
    for (let s = 1.2; s < L - 0.6; s += 2.4) {
      if (Math.abs(s - this.sBottom) < 1 || this.crosswalks.some((cw) => Math.abs(cw.s - s) < 1)) continue;
      const p = this.ringAt(s);
      ctx.save();
      ctx.translate(p.x * T, p.y * T);
      ctx.rotate(p.a);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1.5, T * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-T * 0.12, -T * 0.16);
      ctx.lineTo(T * 0.08, 0);
      ctx.lineTo(-T * 0.12, T * 0.16);
      ctx.stroke();
      ctx.restore();
    }
    // Exit signs
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(T * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [y, rot] of [[-(C + R + S * 0.5), 0], [h + C + R + S * 0.5, 0]]) {
      ctx.save();
      ctx.translate((w / 2) * T, y * T);
      ctx.rotate(rot);
      ctx.fillStyle = '#2a9d8f';
      rrect(ctx, -T * 0.42, -T * 0.18, T * 0.84, T * 0.36, T * 0.08);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('EXIT', 0, T * 0.01);
      ctx.restore();
    }

    // Crosswalks
    for (const cw of this.crosswalks) {
      for (let k = 0; k < 6; k++) {
        const a = cw.k + 0.5 - 0.4 + k * 0.16;
        const [x0, y0] = this.sidePoint(cw.side, C + 0.05, a);
        const [x1, y1] = this.sidePoint(cw.side, C + R - 0.05, a + 0.09);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(Math.min(x0, x1) * T, Math.min(y0, y1) * T, Math.abs(x1 - x0) * T, Math.abs(y1 - y0) * T);
      }
    }

    // Inner sidewalk and the lot itself
    band(C, Math.max(0.05, RC - R / 2), '#d9dce3');
    ctx.fillStyle = '#676c7a';
    ctx.fillRect(0, 0, w * T, h * T);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([T * 0.18, T * 0.12]);
    ctx.beginPath();
    for (let x = 1; x < w; x++) {
      ctx.moveTo(x * T, 0);
      ctx.lineTo(x * T, h * T);
    }
    for (let y = 1; y < h; y++) {
      ctx.moveTo(0, y * T);
      ctx.lineTo(w * T, y * T);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.5, T * 0.05);
    ctx.strokeRect(0, 0, w * T, h * T);

    // Hedges where cars can't leave the lot
    for (const side of ['N', 'E', 'S', 'W']) {
      for (const k of this.m.fence[side]) {
        const [x0, y0] = this.sidePoint(side, -0.06, k + 0.02);
        const [x1, y1] = this.sidePoint(side, C, k + 0.98);
        const x = Math.min(x0, x1) * T;
        const y = Math.min(y0, y1) * T;
        const ww = Math.abs(x1 - x0) * T;
        const hh = Math.abs(y1 - y0) * T;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        rrect(ctx, x + 2, y + 3, ww, hh, Math.min(ww, hh) / 2);
        ctx.fill();
        ctx.fillStyle = '#2f8f46';
        rrect(ctx, x, y, ww, hh, Math.min(ww, hh) / 2);
        ctx.fill();
        ctx.fillStyle = '#4cb862';
        const n = 4;
        for (let j = 0; j < n; j++) {
          const cx = ww > hh ? x + (ww * (j + 0.5)) / n : x + ww / 2;
          const cy = ww > hh ? y + hh / 2 : y + (hh * (j + 0.5)) / n;
          ctx.beginPath();
          ctx.arc(cx - 1, cy - 1, (Math.min(ww, hh) / 2) * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Obstacles
    for (const [x, y, kind] of this.level.obs || []) {
      ctx.save();
      ctx.translate((x + 0.5) * T, (y + 0.5) * T);
      drawObstacle(ctx, T, kind);
      ctx.restore();
    }
    this.bg = bg;
  }

  draw() {
    const ctx = this.ctx;
    const { T, ox, oy, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    const hintCar = this.hint && this.hint.t < 4 ? this.hint.car : -1;
    const order = this.cars.filter((c) => c.mode !== 'gone')
      .sort((a, b) => (a.mode === 'lot' ? 0 : 1) - (b.mode === 'lot' ? 0 : 1));
    for (const car of order) {
      let x;
      let y;
      let ang;
      if (car.mode === 'ring' || car.mode === 'spur') {
        x = car.x;
        y = car.y;
        ang = car.ang;
      } else {
        [x, y] = this.carCenter(car);
        ang = HEADING[car.dir];
        if (car.nudge > 0 && car.nudgeSign) {
          const k = Math.sin((1 - car.nudge / 0.25) * Math.PI) * 0.14 * car.nudgeSign;
          if (car.horiz) x += k;
          else y += k;
        }
      }
      if (car.shake > 0) {
        const k = Math.sin(car.shake * 70) * 0.05 * (car.shake / 0.35);
        if (car.horiz) y += k;
        else x += k;
      }
      ctx.save();
      ctx.translate(x * T, y * T);
      ctx.rotate(ang);
      drawCar(ctx, T, car.len, car.color, { glow: car.i === hintCar && Math.sin(this.hint.t * 8) > -0.3 });
      ctx.restore();
    }
    if (hintCar >= 0) this.drawHintArrow(this.cars[hintCar], this.hint.sign);

    for (const g of this.grannies) {
      const [x, y] = this.sidePoint(g.side, g.d, g.a);
      const c = Math.cos(g.ang);
      if (Math.abs(c) > 0.3) g.flip = c < 0 ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, g.alpha));
      ctx.translate(x * T, y * T + T * 0.05);
      ctx.save();
      ctx.scale(g.flip || 1, 1);
      drawGranny(ctx, T, g.step + (g.angry ? this.time * 3 : 0), g.angry > 0, g.coat);
      ctx.restore();
      if (g.angry > 0) {
        ctx.translate(0, -T * 0.85);
        drawBubble(ctx, T, 'Hmph!', '#e63946');
      }
      ctx.restore();
    }

    for (const f of this.fx) {
      const k = f.t / f.life;
      ctx.save();
      ctx.translate(f.x * T, f.y * T);
      if (f.kind === 'puff') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#f1f1f1';
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * k * T * 0.35, Math.sin(a) * k * T * 0.35, T * 0.1 * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'text') {
        ctx.globalAlpha = 1 - k * k;
        ctx.translate(0, -k * T * 0.6);
        drawBubble(ctx, T, f.text, '#1d3557');
      }
      ctx.restore();
    }
  }

  drawHintArrow(car, sign) {
    const { ctx, T } = this;
    const [x, y] = this.carCenter(car);
    const off = car.len / 2 + 0.45;
    const bob = Math.sin(this.hint.t * 6) * 0.1;
    const ax = car.horiz ? x + sign * (off + bob) : x;
    const ay = car.horiz ? y : y + sign * (off + bob);
    const ang = car.horiz ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    ctx.save();
    ctx.translate(ax * T, ay * T);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = '#8a6d00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(T * 0.3, 0);
    ctx.lineTo(-T * 0.05, -T * 0.28);
    ctx.lineTo(-T * 0.05, -T * 0.11);
    ctx.lineTo(-T * 0.3, -T * 0.11);
    ctx.lineTo(-T * 0.3, T * 0.11);
    ctx.lineTo(-T * 0.05, T * 0.11);
    ctx.lineTo(-T * 0.05, T * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

