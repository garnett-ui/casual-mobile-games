// Night Driver in play: the view through the windscreen (roadside posts in
// perspective, the green signs, the hazards), the instruments and the loop.
import { Road, Car, autopilot, split, POST_OUT, POST_GAP, MPH, MAX_HEAD, SIGN_LEAD, HAZARD_AT, FIRST_FORK, VMAX, HALF } from './engine.js';
import { CRASH_LINES } from './signs.js';
import { drawDigits, digitsWidth } from './segments.js';

const DMAX = 340; // how far ahead we draw (m)
const STEP = 2; // metres between samples of the road's bend
const CUT = new Set(['bridge', 'cliff', 'washout']); // the posts stop at these
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Play {
  constructor(canvas, hooks, seed) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.input = { gas: false, brake: false, steer: 0 };
    this.timeScale = 1; // the browser tests fast-forward
    this.autopilot = false; // ...and let the car drive itself
    this.pilotOpts = {};
    this.paused = true;
    this.reset(seed);
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
      this.last = now;
      if (!this.paused) this.update(dt);
      this.draw(now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.hooks.onMotor?.(false);
  }

  reset(seed = Math.floor(Math.random() * 1e9)) {
    this.road = new Road(seed);
    this.car = new Car(this.road);
    this.flash = 0;
    this.shake = 0;
    this.message = null;
    this.closeup = null;
    this.braking = false;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const { W, H } = this;
    this.hoodH = Math.min(H * 0.17, 130);
    this.horizon = H * (W > H ? 0.42 : 0.4);
    // Like the 1976 game, the nearest posts should come in at the bottom
    // corners. That fixes the eye height for the screen's shape: on a tall
    // phone you look down on the road from higher up.
    this.f = W * 0.75;
    const ground = H - this.hoodH - this.horizon;
    this.camH = clamp(0.6 + (5.7 * ground) / (W / 2), 2.5, 9);
    this.up = this.camH / 2.6; // scales things that stand up (walls, flames)
    this.digitH = clamp(Math.min(W, H) * 0.07, 20, 40);
  }

  // ------------------------------------------------------------- simulation

  update(dt) {
    const car = this.car;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < n; i++) {
      const input = this.autopilot ? autopilot(car, this.pilotOpts) : this.input;
      for (const e of car.step(dt / n, input)) this.handle(e);
    }
    // Tyres squeal when you stand on the brake at speed.
    const hard = this.input.brake && car.v > 22 && !this.autopilot;
    if (hard && !this.braking) this.hooks.sfx?.('screech');
    this.braking = hard;
    const running = !car.over && car.freeze <= 0;
    this.hooks.onMotor?.(running || car.v > 0, car.v / VMAX * 0.85 + (this.input.gas ? 0.15 : 0));
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 2);
    if (this.message && (this.message.until -= dt) <= 0) this.message = null;
    if (this.closeup && car.freeze <= 0) this.closeup = null;
  }

  say(title, sub, colour = '#fff', secs = 2) {
    this.message = { title, sub, colour, until: secs };
  }

  handle(e) {
    const h = this.hooks;
    if (e.type === 'commit') {
      if (e.good) {
        this.say('GOOD CALL', '+500', '#3dff7a', 1.6);
        h.sfx?.('star');
      }
      h.track?.('fork', { good: e.good, hazard: e.fork.hazard });
    } else if (e.type === 'checkpoint') {
      this.say('EXTENDED TIME', `+${e.bonus} SECONDS`, '#ffd23f', 2.2);
      h.sfx?.('checkpoint');
    } else if (e.type === 'crash') {
      const [title, sub] = CRASH_LINES[e.kind];
      this.say(title, sub, '#ff5a4a', e.kind === 'posts' ? 1.6 : 2.8);
      h.sfx?.(e.kind === 'bridge' || e.kind === 'washout' ? 'splash' : 'crash');
      h.haptic?.([60, 40, 120]);
      this.flash = 1;
      this.shake = 1;
      if (e.kind !== 'posts') this.closeup = e.kind;
      h.track?.('crash', { kind: e.kind });
    } else if (e.type === 'phew') {
      this.say('PHEW! STOPPED IN TIME', 'Taking the other road…', '#ffd23f', 1.8);
      h.sfx?.('screech');
    } else if (e.type === 'over') {
      h.onMotor?.(false);
      h.onOver?.({ score: e.score, miles: this.car.dist / 1609.34, crashes: this.car.crashes, calls: this.car.goodCalls });
    }
  }

  // ------------------------------------------------------------- projection

  // Sideways offset of the road's original centre line, d metres ahead, as
  // seen from the car (bends add up; steering turns the view a little).
  sampleBend() {
    const { road, car } = this;
    const n = Math.ceil(DMAX / STEP) + 2;
    const off = (this.off ??= new Float64Array(n));
    let slope = 0;
    let x = 0;
    for (let i = 0; i < n; i++) {
      off[i] = x;
      slope += road.kappa(car.z + i * STEP) * STEP;
      x += slope * STEP;
    }
    this.yaw = car.steer * MAX_HEAD * 0.6;
  }

  bend(d) {
    const i = Math.max(0, Math.min(this.off.length - 2, Math.floor(d / STEP)));
    const t = d / STEP - i;
    return this.off[i] * (1 - t) + this.off[i + 1] * t - d * this.yaw;
  }

  // Screen point for road-frame X (metres from the original centre line) at
  // height h, d metres ahead.
  P(X, h, d) {
    const lat = this.bend(d) + X - this.car.x;
    return [this.W / 2 + (this.f * lat) / d, this.horizon + (this.f * (this.camH - h)) / d];
  }

  // Road centres at z, each with where its posts stop (a hazard), if they do.
  centres(z) {
    const { road } = this;
    const c = road.center(z);
    const out = [];
    let main = { X: c, cut: Infinity };
    for (const f of road.forks) {
      if (z <= f.z || z > f.z + HAZARD_AT + 400) continue;
      const hz = CUT.has(f.hazard) ? f.z + HAZARD_AT : Infinity;
      const s = split(f, z);
      if (!f.side) {
        // Not chosen yet: both branches.
        out.push({ X: c - s, cut: -1 === f.safe ? Infinity : hz }, { X: c + s, cut: 1 === f.safe ? Infinity : hz });
        main = null;
      } else {
        // The road not taken, heading off to the side.
        out.push({ X: c - 2 * f.side * s, cut: -f.side === f.safe ? Infinity : hz });
        if (f.side !== f.safe) main.cut = hz;
      }
    }
    if (main) out.push(main);
    return out;
  }

  // ------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, dpr, W, H, car } = this;
    this.sampleBend();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * this.shake, (Math.random() - 0.5) * 14 * this.shake);
    ctx.fillStyle = '#000';
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // Once the signs start, the headlights show a little of the road.
    if (car.z > FIRST_FORK - SIGN_LEAD - 400 && !this.closeup) {
      // An oval pool of light on the road ahead of the hood.
      const cy = H - this.hoodH;
      ctx.save();
      ctx.translate(W / 2, cy);
      ctx.scale(1, 0.45);
      const r = Math.max(W, H) * 0.5;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,248,220,0.11)');
      g.addColorStop(1, 'rgba(255,248,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.restore();
    }

    if (this.closeup) {
      this.drawHazard(this.closeup, 7, this.car.x, time, true);
    } else {
      const hz = car.hazardAhead();
      const hd = hz ? hz.z - car.z : Infinity;
      const posts = this.posts();
      // Far posts, then the hazard, then the posts in front of it.
      for (const p of posts) if (p.d > hd) this.drawPost(p);
      if (hd < 260) this.drawHazard(hz.kind, hd, this.road.center(hz.z), time, false);
      for (const p of posts) if (p.d <= hd) this.drawPost(p);
      this.drawGantry();
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,${this.closeup ? 80 : 255},${this.closeup ? 40 : 255},${this.flash * 0.7})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHood();
    this.drawHud();
    this.drawSignCopy();
    if (this.message) this.drawMessage();
  }

  posts() {
    const z = this.car.z;
    const list = [];
    for (let k = Math.ceil((z + 1.5) / POST_GAP); k * POST_GAP - z < DMAX; k++) {
      const zp = k * POST_GAP;
      const cs = this.centres(zp);
      for (const c of cs) {
        if (zp > c.cut) continue;
        for (const side of [-1, 1]) {
          const X = c.X + side * POST_OUT;
          // Where two branches still overlap, there's no post in between.
          if (cs.some((o) => o !== c && Math.abs(X - o.X) < POST_OUT - 0.3)) continue;
          list.push({ d: zp - z, X });
        }
      }
    }
    return list.sort((a, b) => b.d - a.d);
  }

  drawPost({ d, X }) {
    const { ctx, f } = this;
    const [x, y] = this.P(X, 0.6, d);
    if (x < -20 || x > this.W + 20) return;
    const w = Math.max(1.5, (f * 0.3) / d);
    const h = Math.max(1.5, (f * 0.42) / d);
    ctx.globalAlpha = clamp(1.25 - d / DMAX, 0.25, 1);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1;
  }

  // The overhead sign before the next fork.
  drawGantry() {
    const f = this.road.upcoming(this.car.z);
    if (!f) return;
    const zs = f.z - SIGN_LEAD;
    const d = zs - this.car.z;
    if (d < 2 || d > DMAX) return;
    const { ctx } = this;
    const c = this.road.center(zs);
    const light = clamp(1.3 - d / 220, 0.25, 1);
    const top = this.camH + 3.4; // the signs hang just above eye level
    ctx.strokeStyle = `rgba(150,150,160,${light})`;
    ctx.lineWidth = Math.max(1, (this.f * 0.25) / d);
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(...this.P(c + s * 7.6, 0, d));
      ctx.lineTo(...this.P(c + s * 7.6, top + 0.4, d));
    }
    ctx.moveTo(...this.P(c - 7.6, top + 0.3, d));
    ctx.lineTo(...this.P(c + 7.6, top + 0.3, d));
    ctx.stroke();
    [[-6.9, -0.25, -1], [0.25, 6.9, 1]].forEach(([a, b, dir], i) => {
      const [x0, y0] = this.P(c + a, top, d);
      const [x1, y1] = this.P(c + b, top - 3, d);
      drawPanel(ctx, x0, y0, x1 - x0, y1 - y0, f.panels[i], dir, light);
    });
  }

  // A copy of the sign up top, from just before it until you've chosen, so
  // there's time to read it at speed.
  drawSignCopy() {
    const f = this.road.upcoming(this.car.z);
    if (!f || this.car.z < f.z - SIGN_LEAD - 200 || this.closeup) return;
    const { ctx, W } = this;
    let total = Math.min(W - 24, 560);
    // On a short (landscape) screen keep the copy small enough to see past.
    total = Math.min(total, ((this.H * 0.2) / 0.46) * 2 + 10);
    const pw = (total - 10) / 2;
    const ph = pw * 0.46;
    const y = this.hudBottom + 8;
    const x = (W - total) / 2;
    drawPanel(ctx, x, y, pw, ph, f.panels[0], -1, 1);
    drawPanel(ctx, x + pw + 10, y, pw, ph, f.panels[1], 1, 1);
  }

  drawHood() {
    const { ctx, W, H, hoodH } = this;
    const y = H - hoodH;
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    ctx.lineTo(-10, y + hoodH * 0.62);
    ctx.quadraticCurveTo(W * 0.1, y + hoodH * 0.04, W * 0.5, y);
    ctx.quadraticCurveTo(W * 0.9, y + hoodH * 0.04, W + 10, y + hoodH * 0.62);
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fillStyle = '#060608';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(W / 2 + s * W * 0.13, y + hoodH * 0.1);
      ctx.quadraticCurveTo(W / 2 + s * W * 0.16, y + hoodH * 0.6, W / 2 + s * W * 0.2, H);
    }
    ctx.stroke();
  }

  drawHud() {
    const { ctx, W, car } = this;
    const h = this.digitH;
    const top = 10;
    const label = (text, x, align) => {
      ctx.font = `700 ${Math.round(h * 0.34)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(text, x, top);
    };
    const y = top + h * 0.48;
    const score = String(Math.floor(car.score)).padStart(5, ' ');
    label('SCORE', 12, 'left');
    drawDigits(ctx, score.slice(-6), 12, y, h);
    const time = String(Math.ceil(car.time)).padStart(2, ' ');
    const tw = digitsWidth(time.length, h);
    label('TIME', W / 2, 'center');
    drawDigits(ctx, time, W / 2 - tw / 2, y, h, car.time < 10 && Math.floor(car.time * 3) % 2 ? '#ffd23f' : '#ff3b2f');
    const mph = String(Math.round(car.v * MPH)).padStart(3, ' ');
    const mw = digitsWidth(3, h);
    label('MPH', W - 12, 'right');
    drawDigits(ctx, mph, W - 12 - mw, y, h);
    this.hudBottom = y + h;
  }

  drawMessage() {
    const { ctx, W, H, message: m } = this;
    const size = clamp(W * 0.065, 18, 34);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = m.colour;
    ctx.shadowColor = m.colour;
    ctx.shadowBlur = 14;
    const y = H * 0.5;
    ctx.fillText(m.title, W / 2, y, W - 24);
    ctx.shadowBlur = 0;
    if (m.sub) {
      ctx.font = `700 ${size * 0.62}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = '#fff';
      ctx.fillText(m.sub, W / 2, y + size * 1.1, W - 24);
    }
  }

  // ------------------------------------------------------------- hazards

  // Asphalt from d0 to d1 ahead on a road centred at X, lit by the
  // headlights (bright near the car, fading with distance), with lane
  // markings. glow: lit from the far end instead (fire ahead).
  roadPatch(X, d0, d1, scale = 1, colour = [70, 70, 74], glow = false) {
    const { ctx } = this;
    const lit = (d) => scale * (glow ? clamp(0.35 + (d - d0) / Math.max(1, d1 - d0), 0.35, 1) : clamp(1.3 - d / 150, 0.05, 1));
    const rgb = (k) => `rgb(${colour.map((c) => Math.round(c * k)).join(',')})`;
    const [, yNear] = this.P(X, 0, d0);
    const [, yFar] = this.P(X, 0, d1);
    const g = ctx.createLinearGradient(0, yNear, 0, yFar);
    g.addColorStop(0, rgb(lit(d0)));
    g.addColorStop(1, rgb(lit(d1)));
    ctx.fillStyle = g;
    const quad = (a, b, e0, e1) => {
      ctx.beginPath();
      ctx.moveTo(...this.P(X + a, 0, e0));
      ctx.lineTo(...this.P(X + b, 0, e0));
      ctx.lineTo(...this.P(X + b, 0, e1));
      ctx.lineTo(...this.P(X + a, 0, e1));
      ctx.closePath();
      ctx.fill();
    };
    quad(-HALF, HALF, d0, d1);
    // Edge lines and a dashed centre line.
    const paint = (r, gg, b) => {
      const k = lit((d0 + d1) / 2);
      const p = ctx.createLinearGradient(0, yNear, 0, yFar);
      p.addColorStop(0, `rgba(${r},${gg},${b},${0.85 * lit(d0)})`);
      p.addColorStop(1, `rgba(${r},${gg},${b},${0.85 * lit(d1)})`);
      ctx.fillStyle = k > 0 ? p : 'transparent';
    };
    paint(235, 235, 235);
    quad(-HALF + 0.3, -HALF + 0.45, d0, d1);
    quad(HALF - 0.45, HALF - 0.3, d0, d1);
    paint(240, 190, 40);
    const first = Math.ceil((this.car.z + d0) / 9) * 9 - this.car.z;
    for (let dd = first; dd < d1; dd += 9) quad(-0.1, 0.1, Math.max(d0, dd), Math.min(d1, dd + 4));
  }

  // A ragged broken edge of road at distance d.
  brokenEdge(X, d, light, far = false) {
    const { ctx } = this;
    ctx.fillStyle = `rgb(${Math.round(38 * light)},${Math.round(36 * light)},${Math.round(34 * light)})`;
    ctx.beginPath();
    ctx.moveTo(...this.P(X - HALF - 0.3, 0, d));
    for (let i = 0; i <= 12; i++) {
      const jag = ((i * 7919) % 5) * 0.22;
      ctx.lineTo(...this.P(X - HALF + (2 * HALF * i) / 12, far ? 0 : -0.15 - jag, far ? d + jag : d));
    }
    ctx.lineTo(...this.P(X + HALF + 0.3, 0, d));
    ctx.closePath();
    ctx.fill();
  }

  drawHazard(kind, d, X, t, closeup) {
    const light = closeup ? 1 : clamp(1.3 - d / 170, 0.08, 1);
    // (Wall, fire and cliff lay their own road.)
    if (kind === 'bridge' || kind === 'washout') this.roadPatch(X, Math.max(1.2, d - 60), d);
    this[`draw_${kind}`](X, d, t, light, closeup);
  }

  draw_wall(X, d, t, light) {
    const { ctx } = this;
    this.roadPatch(X, Math.max(1.2, d - 60), d);
    const wallH = this.camH + 1.5; // taller than you are
    const [x0, y0] = this.P(X - 8, wallH, d);
    const [x1, y1] = this.P(X + 8, 0, d);
    const w = x1 - x0;
    const h = y1 - y0;
    const L = (c) => Math.round(c * light);
    ctx.fillStyle = `rgb(${L(150)},${L(58)},${L(38)})`;
    ctx.fillRect(x0, y0, w, h);
    // Bricks: 0.28 m courses of 0.6 m bricks, staggered.
    const course = h / (wallH / 0.28);
    if (course > 2.5) {
      const brick = w / (16 / 0.6);
      ctx.strokeStyle = `rgba(${L(210)},${L(200)},${L(180)},0.55)`;
      ctx.lineWidth = Math.max(0.6, course * 0.12);
      ctx.beginPath();
      for (let row = 0, y = y0; y < y1; row++, y += course) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        for (let x = x0 + (row % 2 ? brick / 2 : 0); x < x1; x += brick) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, Math.min(y1, y + course));
        }
      }
      ctx.stroke();
      // Some bricks darker than others.
      for (let i = 0; i < 40; i++) {
        const bx = x0 + (((i * 7349) % 997) / 997) * w;
        const by = y0 + (((i * 3571) % 991) / 991) * h;
        ctx.fillStyle = `rgba(40,10,5,${0.15 + (i % 3) * 0.08})`;
        ctx.fillRect(bx, by, brick * 0.9, course * 0.8);
      }
    }
    // Headlight hot spots
    for (const s of [-1, 1]) {
      const [hx, hy] = this.P(X + s * 0.9, 0.8, d);
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, w * 0.18);
      g.addColorStop(0, `rgba(255,240,200,${0.4 * light})`);
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, w, h);
    }
    ctx.fillStyle = `rgba(255,255,255,${0.55 * light})`;
    ctx.font = `900 ${Math.max(6, h * 0.22)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DEAD END', x0 + w / 2, y0 + h * 0.4);
  }

  draw_fire(X, d, t, light, closeup) {
    const { ctx } = this;
    // The road glows orange toward the flames.
    this.roadPatch(X, Math.max(1.2, d - 60), d + 4, 1, [150, 70, 28], true);
    const [cx, cy] = this.P(X, 1.6 * this.up, d);
    const R = (this.f * 12) / d;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    glow.addColorStop(0, 'rgba(255,150,40,0.55)');
    glow.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // Smoke
    for (let i = 0; i < 7; i++) {
      const rise = (t * 0.6 + i / 7) % 1;
      const [sx, sy] = this.P(X - 5 + i * 1.7 + Math.sin(t + i) * 0.6, (3 + rise * 7) * this.up, d + 2);
      ctx.fillStyle = `rgba(40,36,34,${0.35 * (1 - rise)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, ((this.f * (1 + rise * 2.5)) / d), 0, Math.PI * 2);
      ctx.fill();
    }
    // Flames, back row first.
    for (let row = 2; row >= 0; row--) {
      for (let i = 0; i < 16; i++) {
        const lat = X - 8 + (i + (row % 2) * 0.5) * 1.05;
        const dd = d + row * 1.4;
        const h = this.up * 1.6 + this.up * 1.6 * Math.abs(Math.sin(t * (5 + (i % 4)) + i * 1.7 + row));
        const sway = Math.sin(t * 7 + i) * 0.35;
        const [bx0, by] = this.P(lat - 0.55, 0, dd);
        const [bx1] = this.P(lat + 0.55, 0, dd);
        const [tx, ty] = this.P(lat + sway, h, dd);
        const g = ctx.createLinearGradient(0, by, 0, ty);
        g.addColorStop(0, '#fff6c0');
        g.addColorStop(0.3, '#ffb020');
        g.addColorStop(0.65, '#ff5a00');
        g.addColorStop(1, 'rgba(170,20,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx0, by);
        ctx.quadraticCurveTo(bx0, (by + ty) / 2, tx, ty);
        ctx.quadraticCurveTo(bx1, (by + ty) / 2, bx1, by);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  draw_bridge(X, d, t, light) {
    const { ctx } = this;
    const gap = 40;
    // The river far below, seen through the gap.
    const [, yFar] = this.P(X, 0, d + gap);
    const [, yNear] = this.P(X, 0, d);
    const [lx] = this.P(X - HALF - 30, 0, d);
    const [rx] = this.P(X + HALF + 30, 0, d);
    const g = ctx.createLinearGradient(0, yFar, 0, yNear);
    g.addColorStop(0, '#0a1420');
    g.addColorStop(1, '#03070c');
    ctx.fillStyle = g;
    ctx.fillRect(lx, yFar, rx - lx, yNear - yFar);
    ctx.strokeStyle = 'rgba(190,210,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const yy = yFar + ((i * 0.37 + t * 0.05) % 1) * (yNear - yFar);
      const xx = (lx + rx) / 2 + Math.sin(i * 12.9 + t) * (rx - lx) * 0.2;
      const len = (rx - lx) * 0.02 * (1 + (i % 3));
      ctx.moveTo(xx - len, yy);
      ctx.lineTo(xx + len, yy);
    }
    ctx.stroke();
    // The far end of the bridge, and its broken edge.
    this.roadPatch(X, d + gap, d + gap + 40, 0.6);
    this.brokenEdge(X, d + gap, light * 0.5, true);
    // Railings, snapped off at the edge.
    ctx.strokeStyle = `rgba(200,200,205,${light})`;
    ctx.lineWidth = Math.max(1, (this.f * 0.08) / Math.max(d, 1));
    ctx.beginPath();
    for (const s of [-1, 1]) {
      for (let dd = Math.max(2, d - 45); dd <= d; dd += 3) {
        ctx.moveTo(...this.P(X + s * (HALF + 0.4), 0, dd));
        ctx.lineTo(...this.P(X + s * (HALF + 0.4), 1.1, dd));
      }
      ctx.moveTo(...this.P(X + s * (HALF + 0.4), 1.1, Math.max(2, d - 45)));
      ctx.lineTo(...this.P(X + s * (HALF + 0.4), 1.1, d));
      ctx.lineTo(...this.P(X + s * (HALF + 0.9), -0.6, d + 1)); // dangling
    }
    ctx.stroke();
    this.brokenEdge(X, d, light);
  }

  draw_cliff(X, d, t, light, closeup) {
    const { ctx, W, horizon } = this;
    const [, yEdge] = this.P(X, 0, d);
    // A low moon over the canyon.
    const mx = W * 0.72;
    const my = horizon - (this.H * 0.18);
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, this.H * 0.2);
    glow.addColorStop(0, 'rgba(230,235,255,0.35)');
    glow.addColorStop(1, 'rgba(230,235,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - this.H * 0.2, my - this.H * 0.2, this.H * 0.4, this.H * 0.4);
    ctx.fillStyle = '#e9ecf4';
    ctx.beginPath();
    ctx.arc(mx, my, this.H * 0.035, 0, Math.PI * 2);
    ctx.fill();
    // The canyon: layered rock, moonlit, far rim at the horizon.
    const fade = closeup ? 1 : clamp(1.6 - d / 200, 0, 1);
    if (fade > 0 && yEdge > horizon) {
      ctx.save();
      ctx.globalAlpha = fade;
      const bands = ['#5a3a48', '#6b3f3a', '#7a4431', '#5e3226', '#45241d', '#2e1813', '#1b0e0b'];
      // Far rim: mesas against the sky.
      ctx.fillStyle = '#3a2a3c';
      ctx.beginPath();
      ctx.moveTo(0, horizon + 2);
      for (let i = 0; i <= 24; i++) {
        const x = (W * i) / 24;
        const mesa = (i * 37) % 7 < 3 ? (this.H * 0.03 * ((i * 13) % 5)) / 4 : 0;
        ctx.lineTo(x, horizon - mesa);
        ctx.lineTo(x + W / 48, horizon - mesa);
      }
      ctx.lineTo(W, horizon + 2);
      ctx.closePath();
      ctx.fill();
      const span = yEdge - horizon;
      bands.forEach((c, i) => {
        ctx.fillStyle = c;
        const y0 = horizon + (span * i) / bands.length;
        ctx.beginPath();
        ctx.moveTo(0, y0);
        for (let k = 0; k <= 16; k++) ctx.lineTo((W * k) / 16, y0 + Math.sin(k * 1.9 + i * 2.3) * span * 0.03);
        ctx.lineTo(W, yEdge);
        ctx.lineTo(0, yEdge);
        ctx.closePath();
        ctx.fill();
      });
      // Moonlight catching the ledges.
      ctx.strokeStyle = 'rgba(200,205,235,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < bands.length; i++) {
        const y0 = horizon + (span * i) / bands.length;
        for (let k = 0; k < 16; k += 2) {
          ctx.moveTo((W * k) / 16, y0 + Math.sin(k * 1.9 + i * 2.3) * span * 0.03);
          ctx.lineTo((W * (k + 1)) / 16, y0 + Math.sin((k + 1) * 1.9 + i * 2.3) * span * 0.03);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    this.roadPatch(X, Math.max(1.2, d - 60), d);
    this.brokenEdge(X, d, light);
    // A last, useless little sign.
    const [sx, sy] = this.P(X + HALF + 1.2, 1.6, Math.max(2, d - 6));
    const s = Math.max(4, (this.f * 1.1) / Math.max(2, d - 6));
    ctx.fillStyle = `rgba(255,210,40,${light})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy - s);
    ctx.lineTo(sx + s, sy);
    ctx.lineTo(sx, sy + s);
    ctx.lineTo(sx - s, sy);
    ctx.closePath();
    ctx.fill();
    if (s > 9) {
      ctx.fillStyle = `rgba(0,0,0,${light})`;
      ctx.font = `900 ${s * 0.36}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VIEW', sx, sy);
    }
  }

  draw_washout(X, d, t, light) {
    const { ctx } = this;
    const wide = 22;
    // Rushing water across the road, then the road again beyond.
    this.roadPatch(X, d + wide, d + wide + 40, 0.6);
    const corners = [this.P(X - HALF - 20, 0, d), this.P(X + HALF + 20, 0, d), this.P(X + HALF + 20, 0, d + wide), this.P(X - HALF - 20, 0, d + wide)];
    const L = (c) => Math.round(c * Math.max(light, 0.25));
    ctx.fillStyle = `rgb(${L(40)},${L(58)},${L(70)})`;
    ctx.beginPath();
    corners.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = `rgba(220,235,255,${0.5 * Math.max(light, 0.3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const dd = d + ((i * 0.618) % 1) * wide;
      const lat = X - HALF - 20 + ((i * 0.381 + t * 0.35) % 1) * (2 * HALF + 40);
      const [ax, ay] = this.P(lat, 0, dd);
      const [bx] = this.P(lat + 2.2, 0, dd);
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2, ay - 2, bx, ay);
    }
    ctx.stroke();
    ctx.restore();
    this.brokenEdge(X, d, light);
  }
}

// One green highway sign panel: a title, a smaller line and an arrow.
export function drawPanel(ctx, x, y, w, h, [title, sub], dir, light) {
  if (w < 6) return;
  const L = (c) => Math.round(c * light);
  ctx.fillStyle = `rgb(${L(16)},${L(112)},${L(64)})`;
  const r = Math.min(w, h) * 0.08;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  if (w < 24) return;
  const ink = `rgb(${L(255)},${L(255)},${L(255)})`;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, h * 0.025);
  ctx.beginPath();
  ctx.roundRect(x + h * 0.05, y + h * 0.05, w - h * 0.1, h - h * 0.1, r * 0.7);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fit = (text, size, weight) => {
    ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const m = ctx.measureText(text).width;
    if (m > w * 0.86) {
      size *= (w * 0.86) / m;
      ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`;
    }
  };
  fit(title, h * 0.22, 800);
  ctx.fillText(title, x + w / 2, y + h * 0.27);
  if (sub) {
    fit(sub, h * 0.15, 600);
    ctx.fillText(sub, x + w / 2, y + h * 0.5);
  }
  // Arrow pointing up and to its side.
  const ax = x + w / 2;
  const ay = y + h * 0.77;
  const s = h * 0.13;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate((dir * Math.PI) / 4);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.1);
  ctx.lineTo(s * 0.75, -s * 0.2);
  ctx.lineTo(s * 0.25, -s * 0.2);
  ctx.lineTo(s * 0.25, s);
  ctx.lineTo(-s * 0.25, s);
  ctx.lineTo(-s * 0.25, -s * 0.2);
  ctx.lineTo(-s * 0.75, -s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
