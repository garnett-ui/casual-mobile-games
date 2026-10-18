// Elevator in play: the tower in profile -- each floor's waiting people on
// the left, a shaft for each lift on the right -- the taps, and the loop.
import { Sim, FLOORS, CARS, CAPACITY, DURATION, dispatch, par } from './engine.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Play {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.timeScale = 1;
    this.paused = true;
    this.reset();
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

  // A new day (or the same one again, given its seed). With `autopilot`,
  // the dispatcher runs the lifts and you watch.
  reset(seed = Math.floor(Math.random() * 1e9), autopilot = null) {
    this.seed = seed;
    this.sim = new Sim(seed);
    this.autopilot = autopilot;
    this.ripples = [];
    this.pops = [];
    this.par = null;
  }

  // The dispatcher's score for this day (worked out once, when needed).
  getPar() {
    this.par ??= par(this.seed);
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
    this.top = this.hud + 20; // room for the lifts' letters
    this.rowH = (H - this.top - 8) / FLOORS;
    this.labelW = clamp(W * 0.1, 30, 46);
    this.shaftW = clamp(W * 0.2, 54, 96);
    this.gap = 8;
    this.shaftX = Array.from({ length: CARS }, (_, i) => W - 8 - (CARS - i) * this.shaftW - (CARS - 1 - i) * this.gap);
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
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 0.6);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1);
  }

  handle(e) {
    const h = this.hooks;
    if (e.type === 'stop') h.sfx?.('ding');
    else if (e.type === 'deliver') {
      this.pops.push({ i: e.car, f: e.floor, t: 0 });
      h.sfx?.('drop');
    } else if (e.type === 'over') {
      const p = this.getPar();
      const trips = this.sim.trips;
      const wait = trips.length ? trips.reduce((s, x) => s + x.wait, 0) / trips.length : 0;
      h.onOver?.({ delivered: e.delivered, par: p.delivered, arrived: this.sim.next, wait, watched: !!this.autopilot });
    }
  }

  // --------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, W, H, sim, rowH } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Sky behind the tower, then the floors.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#7fb2e5');
    sky.addColorStop(1, '#d9ecfb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const left = 4;
    const right = W - 4;
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(left, this.top - 4, right - left, rowH * FLOORS + 6);
    for (let f = 0; f < FLOORS; f++) {
      const y = this.rowY(f);
      if (f % 2) {
        ctx.fillStyle = 'rgba(120,90,40,0.06)';
        ctx.fillRect(left, y, right - left, rowH);
      }
      if (f === 0) {
        ctx.fillStyle = 'rgba(220,170,60,0.22)';
        ctx.fillRect(left, y, right - left, rowH);
      }
      ctx.fillStyle = '#b7a684';
      ctx.fillRect(left, y + rowH - 1.5, right - left, 1.5);
      this.drawFloorLabel(f, y);
      this.drawWaiting(f, y, time);
    }
    for (let i = 0; i < CARS; i++) this.drawShaft(i, time);
    this.drawHud();
  }

  drawFloorLabel(f, y) {
    const { ctx, rowH, labelW } = this;
    const fs = clamp(rowH * 0.42, 9, 15);
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5b4a2e';
    ctx.fillText(f === 0 ? 'L' : String(f + 1), 9, y + rowH / 2);
    // Hall lamps: lit when someone here wants to go up, or down.
    const w = this.sim.waiting[f];
    const upOn = w.some((p) => p.to > f);
    const downOn = w.some((p) => p.to < f);
    const lx = labelW - 6;
    const s = clamp(rowH * 0.16, 3, 6);
    const lamp = (on, dy, dir) => {
      ctx.fillStyle = on ? '#ff9f1c' : 'rgba(91,74,46,0.18)';
      ctx.beginPath();
      ctx.moveTo(lx, y + rowH / 2 + dy - dir * s);
      ctx.lineTo(lx - s, y + rowH / 2 + dy + dir * s * 0.6);
      ctx.lineTo(lx + s, y + rowH / 2 + dy + dir * s * 0.6);
      ctx.closePath();
      ctx.fill();
    };
    if (f < FLOORS - 1) lamp(upOn, -s * 1.1, 1);
    if (f > 0) lamp(downOn, s * 1.1, -1);
  }

  // The people waiting on floor f, queued toward the lifts; they go from
  // green to red the longer they wait.
  drawWaiting(f, y, time) {
    const { ctx, rowH } = this;
    const w = this.sim.waiting[f];
    if (!w.length) return;
    const x0 = this.labelW + 6;
    const x1 = this.shaftX[0] - this.gap - 4;
    const h = rowH * 0.78;
    const pw = clamp(h * 0.42, 6, 13);
    const fit = Math.max(1, Math.floor((x1 - x0 - 22) / (pw + 2)));
    const shown = Math.min(w.length, fit);
    for (let k = 0; k < shown; k++) {
      const p = w[k];
      const x = x1 - (k + 1) * (pw + 2);
      const age = this.sim.t - p.t;
      const hue = clamp(120 - age * 2.4, 0, 120);
      const bob = Math.sin(time * 6 + p.id) * (age > 40 ? 1 : 0); // the impatient ones fidget
      this.drawPerson(x, y + rowH - 2 + bob, pw, h, `hsl(${hue} 70% 45%)`, p.to > f ? 1 : -1);
    }
    if (w.length > shown) {
      ctx.font = `800 ${clamp(rowH * 0.36, 9, 13)}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#5b4a2e';
      ctx.fillText(`+${w.length - shown}`, x1 - shown * (pw + 2) - 3, y + rowH / 2);
    }
  }

  drawPerson(x, base, w, h, colour, dir) {
    const { ctx } = this;
    const head = w * 0.42;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x + w / 2, base - h + head, head, 0, Math.PI * 2);
    ctx.fill();
    const bt = base - h + head * 2.2;
    ctx.beginPath();
    ctx.roundRect(x, bt, w, base - bt, [w * 0.45, w * 0.45, 2, 2]);
    ctx.fill();
    // Which way they're going, on their chest.
    if (w >= 7) {
      const cy = bt + (base - bt) * 0.42;
      const s = w * 0.22;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, cy - dir * s);
      ctx.lineTo(x + w / 2 - s, cy + dir * s * 0.7);
      ctx.lineTo(x + w / 2 + s, cy + dir * s * 0.7);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawShaft(i, time) {
    const { ctx, rowH, sim } = this;
    const x = this.shaftX[i];
    const w = this.shaftW;
    const car = sim.cars[i];
    // The shaft, and a door frame on each floor.
    ctx.fillStyle = '#3b3f4a';
    ctx.fillRect(x, this.top - 4, w, rowH * FLOORS + 4);
    const lit = sim.lit(i);
    const counts = new Map();
    for (const p of car.riders) counts.set(p.to, (counts.get(p.to) || 0) + 1);
    for (let f = 0; f < FLOORS; f++) {
      const y = this.rowY(f);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3.5, y + 2.5, w - 7, rowH - 4);
      if (lit.has(f)) {
        // Someone inside pressed this floor.
        ctx.fillStyle = 'rgba(255,200,60,0.28)';
        ctx.fillRect(x + 3, y + 2, w - 6, rowH - 4);
        ctx.fillStyle = '#ffd23f';
        ctx.font = `800 ${clamp(rowH * 0.5, 10, 17)}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const n = counts.get(f);
        ctx.fillText(n > 1 ? `✓${n}` : '✓', x + w - 7, y + rowH / 2);
      }
    }
    // Where it's been sent: a pulsing outline.
    if (car.target !== null) {
      const y = this.rowY(car.target);
      ctx.strokeStyle = `rgba(80,220,255,${0.65 + 0.35 * Math.sin(time * 8)})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 2, y + 1.5, w - 4, rowH - 3);
    }
    // Taps.
    for (const r of this.ripples.filter((q) => q.i === i)) {
      const y = this.rowY(r.f) + rowH / 2;
      ctx.strokeStyle = `rgba(80,220,255,${1 - r.t / 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y, 6 + r.t * 50, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The car.
    const cy = this.top + (FLOORS - 1 - car.pos) * rowH;
    const cw = w - 10;
    const cx = x + 5;
    const ch = rowH - 3;
    ctx.fillStyle = '#d9dde4';
    ctx.fillRect(cx, cy + 1, cw, ch);
    // Inside (seen when the doors open): the riders.
    ctx.fillStyle = '#fff6dd';
    ctx.fillRect(cx + 2, cy + 3, cw - 4, ch - 4);
    const dots = car.riders.length;
    const dw = clamp((cw - 8) / CAPACITY, 3, 8);
    for (let k = 0; k < dots; k++) {
      ctx.fillStyle = '#4361ee';
      ctx.beginPath();
      ctx.arc(cx + 4 + dw * (k + 0.5), cy + ch - 4 - dw * 0.3, dw * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
    // Doors, sliding apart.
    const half = (cw - 4) / 2;
    const gapW = half * car.open;
    ctx.fillStyle = '#9aa3b2';
    ctx.fillRect(cx + 2, cy + 3, half - gapW, ch - 4);
    ctx.fillRect(cx + 2 + half + gapW, cy + 3, half - gapW, ch - 4);
    ctx.strokeStyle = '#6b7383';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 1.5, cw - 1, ch - 1);
    // How full, and which way it's going.
    ctx.font = `800 ${clamp(rowH * 0.4, 9, 14)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = car.riders.length >= CAPACITY ? '#e5383b' : '#22283a';
    const arrow = car.phase === 'moving' ? (car.v > 0 ? '▲' : '▼') : '';
    if (car.open < 0.5) ctx.fillText(`${arrow}${car.riders.length}/${CAPACITY}`, cx + cw / 2, cy + ch / 2 + 1);
    // Someone delivered: a little "+1" floats up.
    for (const p of this.pops.filter((q) => q.i === i)) {
      const y = this.rowY(p.f) - p.t * 22;
      ctx.globalAlpha = 1 - p.t;
      ctx.fillStyle = '#2bb673';
      ctx.font = `900 ${clamp(rowH * 0.45, 10, 15)}px system-ui, sans-serif`;
      ctx.fillText('+1', x + w / 2, y + rowH / 2);
      ctx.globalAlpha = 1;
    }
    // Which lift.
    ctx.fillStyle = '#3b3f4a';
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - 22, this.top - 19, 44, 15, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.fillText(`LIFT ${String.fromCharCode(65 + i)}`, x + w / 2, this.top - 11);
  }

  drawHud() {
    const { ctx, W, sim } = this;
    const left = Math.max(0, DURATION - sim.t);
    const m = Math.floor(left / 60);
    const s = Math.floor(left % 60);
    const items = [
      [`${m}:${String(s).padStart(2, '0')}`, left < 20 ? '#e5383b' : '#22283a'],
      [`✓ ${sim.delivered} delivered`, '#1d8a55'],
      [`${sim.waitingCount()} waiting`, '#5b4a2e'],
    ];
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const widths = items.map(([t]) => ctx.measureText(t).width + 20);
    const total = widths.reduce((a, b) => a + b, 0) + 8 * (items.length - 1);
    let x = Math.max(6, (W - total) / 2);
    items.forEach(([t, c], k) => {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(x, 4, widths[k], 26, 13);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.textAlign = 'center';
      ctx.fillText(t, x + widths[k] / 2, 17);
      x += widths[k] + 8;
    });
    if (this.rowH < 16) {
      // A phone on its side squashes the tower.
      ctx.font = '700 12px system-ui, sans-serif';
      const t = 'Turn your phone upright for a taller tower';
      const tw = ctx.measureText(t).width + 18;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(8, this.H - 56, tw, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(t, 17, this.H - 45);
    }
    if (this.autopilot) {
      ctx.fillStyle = 'rgba(30,24,0,0.75)';
      ctx.font = '800 12px ui-monospace, Menlo, monospace';
      const t = 'DISPATCHER AT THE CONTROLS';
      const tw = ctx.measureText(t).width + 18;
      ctx.beginPath();
      ctx.roundRect((W - tw) / 2, this.H - 30, tw, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.textAlign = 'center';
      ctx.fillText(t, W / 2, this.H - 19);
    }
  }
}
