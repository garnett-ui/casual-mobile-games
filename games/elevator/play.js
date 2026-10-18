// Elevator Operator in play: the tower in profile, crowned like the Empire
// State Building, with 8-bit people walking in from their offices, pressing
// the call button and queueing; a shaft for each lift on the right, where
// you tap a floor to send that lift there.
import { Sim, FLOORS, CARS, CAPACITY, WALK, dispatch, par } from './engine.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

// ------------------------------------------------------------------- Play

export class Play {
  constructor(canvas, hooks, spec) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.timeScale = 1;
    this.paused = true;
    this.litStyle = 'figures'; // how a lit floor shows its riders: figures | number | pips
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

  // Start (or restart) the level; with `autopilot`, the dispatcher runs the
  // lifts and you watch.
  reset(spec = this.spec, autopilot = null) {
    this.spec = spec;
    this.sim = new Sim(spec);
    this.autopilot = autopilot;
    this.people = new Map(); // id -> what we see of them (walking, queueing...)
    this.seen = 0; // arrivals already walking in
    this.ripples = [];
    this.pops = [];
    this.par = null;
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
    const { W, H } = this;
    this.hud = 34;
    this.crownH = clamp(H * 0.15, 56, 150);
    this.streetH = clamp(H * 0.025, 12, 22);
    this.top = this.hud + this.crownH;
    this.rowH = (H - this.top - this.streetH) / FLOORS;
    this.x0 = 6;
    this.x1 = W - 6;
    this.labelW = clamp(W * 0.07, 22, 34);
    this.shaftW = clamp(W * 0.17, 50, 96);
    this.gap = 6;
    this.shaftX = Array.from({ length: CARS }, (_, i) => this.x1 - 4 - (CARS - i) * this.shaftW - (CARS - 1 - i) * this.gap);
    this.panelW = clamp(this.rowH * 0.42, 9, 16);
    this.panelX = this.shaftX[0] - this.gap - this.panelW;
    this.doorX = this.x0 + this.labelW + 4; // the office door people come out of
    this.px = Math.max(1, Math.floor((this.rowH * 0.8) / 12)); // sprite pixel size
    this.spriteW = this.px * 8;
  }

  rowY(f) {
    return this.top + (FLOORS - 1 - f) * this.rowH;
  }

  // ------------------------------------------------------------- input

  tap(e) {
    if (this.paused || this.sim.over || this.autopilot) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const f = FLOORS - 1 - Math.floor((y - this.top) / this.rowH);
    if (f < 0 || f >= FLOORS) return;
    const i = this.shaftX.findIndex((sx) => x >= sx - this.gap / 2 && x <= sx + this.shaftW + this.gap / 2);
    if (i < 0) return;
    e.preventDefault();
    this.sim.send(i, f);
    this.ripples.push({ i, f, t: 0 });
    this.hooks.sfx?.('tap');
  }

  // ------------------------------------------------------------- simulation

  update(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let k = 0; k < n; k++) {
      if (this.autopilot) dispatch(this.sim, this.autopilot);
      for (const e of this.sim.step(dt / n)) this.handle(e);
    }
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
      const v = this.people.get(e.id);
      if (v) v.pressT = this.sim.t;
    } else if (e.type === 'board') {
      const v = this.people.get(e.id);
      if (v) {
        v.mode = 'board';
        v.target = this.shaftX[e.car] + this.shaftW / 2 - this.spriteW / 2;
      }
    } else if (e.type === 'deliver') {
      // Out of the lift and off down the corridor.
      this.people.set(e.id, {
        id: e.id, look: e.look, floor: e.floor, mode: 'out', dir: -1,
        x: this.shaftX[e.car] + this.shaftW / 2 - this.spriteW / 2, target: this.x0 - this.spriteW,
      });
      this.pops.push({ i: e.car, f: e.floor, t: 0 });
      h.sfx?.('drop');
    } else if (e.type === 'over') {
      h.onOver?.({ ...e, par: this.getPar(), watched: !!this.autopilot });
    }
  }

  // Walking: new arrivals come out of their office a few seconds before
  // they reach the button; the queue shuffles forward; riders step in and
  // out of the lifts.
  movePeople(dt) {
    const { sim } = this;
    while (this.seen < sim.arrivals.length && sim.arrivals[this.seen].t - WALK <= sim.t) {
      const a = sim.arrivals[this.seen++];
      this.people.set(a.id, { id: a.id, look: a.look, floor: a.from, to: a.to, mode: 'in', dir: 1, x: this.doorX, target: this.doorX, t: a.t });
    }
    // Queue places: those waiting first (in order), then those on their way.
    const slot = (k) => this.panelX - 3 - (k + 1) * (this.spriteW + 2);
    for (let f = 0; f < FLOORS; f++) {
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
    for (const v of [...this.people.values()]) {
      const fast = v.mode === 'board' ? 2.5 : 1;
      const d = v.target - v.x;
      const stepX = Math.sign(d) * Math.min(Math.abs(d), speed * fast * dt);
      v.x += stepX;
      v.moving = Math.abs(stepX) > 0.01;
      if (v.moving) v.dir = Math.sign(stepX);
      if ((v.mode === 'board' || v.mode === 'out') && !v.moving) this.people.delete(v.id);
    }
  }

  // --------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, W, H, rowH } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6ea8de');
    sky.addColorStop(1, '#d6eafb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    this.drawCrown(time);
    // The building: stone piers, then each floor.
    ctx.fillStyle = '#e9e0cc';
    ctx.fillRect(this.x0, this.top - 2, this.x1 - this.x0, rowH * FLOORS + 2);
    for (let f = 0; f < FLOORS; f++) this.drawFloor(f, time);
    for (let i = 0; i < CARS; i++) this.drawShaft(i, time);
    // The street.
    const sy = this.top + rowH * FLOORS;
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, sy, W, this.streetH);
    ctx.fillStyle = '#5c5c5c';
    ctx.fillRect(0, sy + this.streetH * 0.45, W, this.streetH * 0.55);
    ctx.fillStyle = '#e9d36a';
    for (let x = 6; x < W; x += 26) ctx.fillRect(x, sy + this.streetH * 0.7, 12, 2);
    this.drawHud();
  }

  // The top of the Empire State Building: setbacks, the observation deck,
  // the mooring mast and the antenna with its red light.
  drawCrown(time) {
    const { ctx } = this;
    const cx = (this.x0 + this.x1) / 2;
    const bw = this.x1 - this.x0;
    let y = this.top - 2;
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
    const { ctx, rowH, sim } = this;
    const y = this.rowY(f);
    if (f % 2) {
      ctx.fillStyle = 'rgba(120,90,40,0.05)';
      ctx.fillRect(this.x0, y, this.panelX - this.x0, rowH);
    }
    if (f === 0) {
      ctx.fillStyle = 'rgba(220,170,60,0.2)';
      ctx.fillRect(this.x0, y, this.panelX - this.x0, rowH);
    }
    ctx.fillStyle = '#b7a684';
    ctx.fillRect(this.x0, y + rowH - 2, this.x1 - this.x0, 2);
    // Floor number.
    const fs = clamp(rowH * 0.4, 9, 15);
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5b4a2e';
    ctx.fillText(f === 0 ? 'L' : String(f + 1), this.x0 + this.labelW / 2, y + rowH / 2);
    // The door they come out of (glass doors in the lobby).
    const dw = this.spriteW + 4;
    ctx.fillStyle = f === 0 ? 'rgba(140,190,220,0.7)' : '#8a6a44';
    ctx.fillRect(this.doorX - 2, y + rowH * 0.12, dw, rowH * 0.86 - 2);
    ctx.fillStyle = f === 0 ? '#6a8aa0' : '#6b5133';
    ctx.fillRect(this.doorX - 2 + dw - 4, y + rowH * 0.5, 2, 2);
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
    if (f < FLOORS - 1) button(up, y + rowH * 0.34, 1);
    if (f > 0) button(down, y + rowH * 0.64, -1);
    // People on this floor.
    const base = y + rowH - 2;
    for (const v of this.people.values()) {
      if (v.floor !== f) continue;
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
    ctx.fillRect(x, this.top - 2, w, rowH * FLOORS + 2);
    // Who in this lift wants which floor.
    const wanted = new Map();
    for (const p of car.riders) {
      if (!wanted.has(p.to)) wanted.set(p.to, []);
      wanted.get(p.to).push(p);
    }
    for (let f = 0; f < FLOORS; f++) {
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
    // The car: riders inside, doors sliding apart.
    const cy = this.top + (FLOORS - 1 - car.pos) * rowH;
    const cw = w - 8;
    const cx = x + 4;
    const ch = rowH - 3;
    ctx.fillStyle = '#d9dde4';
    ctx.fillRect(cx, cy + 1, cw, ch);
    ctx.fillStyle = '#fff3cf';
    ctx.fillRect(cx + 2, cy + 3, cw - 4, ch - 4);
    const mini = Math.max(1, Math.floor((ch - 6) / 12));
    car.riders.slice(0, Math.floor((cw - 6) / (mini * 8 + 1))).forEach((p, k) => {
      drawSprite(ctx, p.look, cx + 3 + k * (mini * 8 + 1), cy + ch - 1, mini, 'stand');
    });
    const half = (cw - 4) / 2;
    const open = half * car.open;
    ctx.fillStyle = '#a7afbd';
    ctx.fillRect(cx + 2, cy + 3, half - open, ch - 4);
    ctx.fillRect(cx + 2 + half + open, cy + 3, half - open, ch - 4);
    ctx.fillStyle = '#7d8696';
    if (car.open < 0.05) ctx.fillRect(cx + 2 + half - 0.5, cy + 3, 1, ch - 4);
    ctx.strokeStyle = '#6b7383';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 1.5, cw - 1, ch - 1);
    if (car.open < 0.5) {
      ctx.font = `800 ${clamp(rowH * 0.38, 9, 14)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = car.riders.length >= CAPACITY ? '#e5383b' : '#22283a';
      const arrow = car.phase === 'moving' ? (car.v > 0 ? '▲' : '▼') : '';
      ctx.fillText(`${arrow}${car.riders.length}/${CAPACITY}`, cx + cw / 2, cy + ch / 2 + 1);
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

  // A floor someone in the lift has pressed: lit, with a count of how many
  // want it. Three looks, for trying out: little people, a number, or dots.
  drawLit(x, y, w, riders) {
    const { ctx, rowH } = this;
    const n = riders.length;
    ctx.fillStyle = 'rgba(255,196,50,0.35)';
    ctx.fillRect(x + 3, y + 2, w - 6, rowH - 4);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 3.5, y + 2.5, w - 7, rowH - 5);
    if (this.litStyle === 'number') {
      ctx.fillStyle = '#ffd23f';
      ctx.font = `900 ${clamp(rowH * 0.55, 11, 20)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`👤${n}`, x + w / 2, y + rowH / 2 + 1);
    } else if (this.litStyle === 'pips') {
      const r = clamp(rowH * 0.1, 2, 4);
      const per = Math.min(n, 4);
      for (let k = 0; k < n; k++) {
        const row = Math.floor(k / 4);
        const col = k % 4;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(x + w / 2 + (col - (per - 1) / 2) * r * 2.8, y + rowH / 2 + (row - (Math.ceil(n / 4) - 1) / 2) * r * 2.8, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Little people, side by side; "+k" if they don't all fit.
      const mini = Math.max(1, Math.floor((rowH - 8) / 12));
      const step = mini * 8 + 1;
      const fit = Math.max(1, Math.floor((w - 10) / step));
      const shown = n > fit ? fit - 1 : n;
      const total = shown * step + (n > shown ? 16 : 0);
      let sx = x + (w - total) / 2;
      for (let k = 0; k < shown; k++) {
        drawSprite(ctx, riders[k].look, sx, y + rowH - 3, mini, 'stand');
        sx += step;
      }
      if (n > shown) {
        ctx.fillStyle = '#ffd23f';
        ctx.font = `900 ${clamp(rowH * 0.36, 9, 13)}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${n - shown}`, sx + 1, y + rowH / 2);
      }
    }
  }

  drawHud() {
    const { ctx, W, sim } = this;
    const m = Math.floor(sim.t / 60);
    const s = Math.floor(sim.t % 60);
    const items = [
      [`${m}:${String(s).padStart(2, '0')}`, '#22283a'],
      [`✓ ${sim.delivered}/${sim.arrivals.length}`, '#1d8a55'],
      [`${sim.waitingCount()} waiting`, '#5b4a2e'],
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
