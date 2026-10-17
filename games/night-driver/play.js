// Night Driver in play: the view through the windscreen (roadside posts in
// perspective, the green signs, the hazards), the instruments and the loop.
import { Road, Car, autopilot, split, POST_OUT, POST_GAP, MPH, MAX_HEAD, SIGN_LEAD, HAZARD_AT, FIRST_FORK, VMAX, HALF, BRIDGE, jumpHeight } from './engine.js';
import { CRASH_LINES } from './signs.js';
import { drawDigits, digitsWidth } from './segments.js';

const DMAX = 340; // how far ahead we draw (m)
const STEP = 2; // metres between samples of the road's bend
// The 1976 look: depth falls away much faster than true perspective (each
// post up the road is about half as far below the horizon as the last), and
// the posts are big, tall blocks. The game starts like that and eases into
// ordinary perspective before the first sign.
const CLASSIC_FALLOFF = 24; // metres per e-fold
const CUT = new Set(['bridge', 'cliff', 'washout', 'volcano']); // the posts stop at these
const FALLS = new Set(['cliff', 'volcano', 'drawbridge']); // crashes shown as a fall
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
    this.hooks.onSkid?.(0, 0);
  }

  reset(seed = Math.floor(Math.random() * 1e9)) {
    this.road = new Road(seed);
    this.car = new Car(this.road);
    this.flash = 0;
    this.shake = 0;
    this.message = null;
    this.closeup = null;
    this.braking = false;
    this.scene = null;
    this.lift = 0;
    this.parts = [];
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
    // Tyres squealing in a slide or a skid, brakes chattering at the limit;
    // a jolt through the wheel when they lock.
    this.hooks.onSkid?.(car.squeal, car.chatter);
    if (car.locked && !this.wasLocked) this.hooks.haptic?.([20, 30, 20, 30, 20]);
    this.wasLocked = car.locked;
    const running = !car.over && car.freeze <= 0;
    this.hooks.onMotor?.(running || car.v > 0, car.v / VMAX * 0.85 + (this.input.gas ? 0.15 : 0));
    // Flying over a drawbridge: how high the car is.
    const br = this.bridge();
    const was = this.lift || 0;
    this.lift = br && br.fork.jumped ? jumpHeight(car.z - br.z, br.fork.jumpV) : 0;
    if (was > 0.6 && this.lift === 0) {
      this.hooks.sfx?.('bump');
      this.hooks.haptic?.(40);
      this.shake = 0.5;
    }
    if (this.scene) {
      this.scene.t += dt;
      if (!this.scene.hit && this.scene.t >= this.scene.dur) {
        this.scene.hit = true;
        const k = this.scene.kind;
        this.hooks.sfx?.(k === 'drawbridge' ? 'splash' : k === 'volcano' ? 'explode' : 'crash');
        this.hooks.haptic?.([80, 40, 140]);
        this.flash = 1;
        this.shake = 0.8;
        const [title, sub] = CRASH_LINES[k];
        this.say(title, sub, '#ff5a4a', 2.2);
      }
      if (car.freeze <= 0) this.scene = null;
    }
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
    } else if (e.type === 'jump') {
      this.say('AIRBORNE!', '+1000', '#3dff7a', 2.2);
      h.sfx?.('whoosh');
      h.track?.('jump', { mph: Math.round(e.speed * MPH) });
    } else if (e.type === 'crash' && FALLS.has(e.kind)) {
      // Over the edge: watch the fall, then the crash.
      this.scene = { kind: e.kind, t: 0, dur: e.kind === 'drawbridge' ? 1.8 : 2.4, hit: false };
      this.message = null;
      h.sfx?.('whoosh');
      h.track?.('crash', { kind: e.kind });
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
      h.onSkid?.(0, 0);
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
    // Where the car points: the steering, plus the tail swinging out in a slide.
    this.yaw = car.steer * MAX_HEAD * 0.6 + car.fish * 0.5;
  }

  bend(d, curveScale = 1) {
    const i = Math.max(0, Math.min(this.off.length - 2, Math.floor(d / STEP)));
    const t = d / STEP - i;
    return (this.off[i] * (1 - t) + this.off[i + 1] * t) * curveScale - d * this.yaw;
  }

  // Screen point for road-frame X (metres from the original centre line) at
  // height h, d metres ahead.
  P(X, h, d) {
    const lat = this.bend(d) + X - this.car.x;
    const x = this.W / 2 + (this.f * lat) / d;
    const y = this.horizon + (this.f * (this.camH + this.lift - h)) / d;
    const m = this.classic;
    if (!m) return [x, y];
    // Arcade depth: posts come in at about 15% / 85% across and 77% down.
    const k = Math.exp(-d / CLASSIC_FALLOFF);
    const { W, H } = this;
    const top = this.classicTop;
    // Bends are exaggerated so they still show up the road.
    const latC = this.bend(d, Math.exp(d / (CLASSIC_FALLOFF * 1.3))) + X - this.car.x;
    const xc = W / 2 + (latC / POST_OUT) * 0.44 * W * k;
    const yc = top + ((2 - h) / 1.4) * (H * 0.8 - top) * k;
    return [x + (xc - x) * m, y + (yc - y) * m];
  }

  // Road centres at z, each with where its posts stop (a hazard), if they do.
  centres(z) {
    const { road } = this;
    const c = road.center(z);
    const out = [];
    let main = { X: c, from: Infinity, to: Infinity };
    for (const f of road.forks) {
      if (z <= f.z || z > f.z + HAZARD_AT + 400) continue;
      // Where the bad branch's posts stop (and, past a drawbridge, resume).
      const hz = f.z + HAZARD_AT;
      const gap = CUT.has(f.hazard) ? [hz, Infinity] : f.hazard === 'drawbridge' ? [hz, hz + BRIDGE.GAP] : [Infinity, Infinity];
      const none = [Infinity, Infinity];
      const range = (bad) => {
        const [from, to] = bad ? gap : none;
        return { from, to };
      };
      const s = split(f, z);
      if (!f.side) {
        // Not chosen yet: both branches.
        out.push({ X: c - s, ...range(-1 !== f.safe) }, { X: c + s, ...range(1 !== f.safe) });
        main = null;
      } else {
        // The road not taken, heading off to the side.
        out.push({ X: c - 2 * f.side * s, ...range(-f.side !== f.safe) });
        if (f.side !== f.safe) Object.assign(main, range(true));
      }
    }
    if (main) out.push(main);
    return out;
  }

  // ------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, dpr, W, H, car } = this;
    this.sampleBend();
    this.classic = clamp((FIRST_FORK - SIGN_LEAD - 500 - car.z) / 400, 0, 1);
    this.classicTop = Math.max(H * 0.24, (this.hudBottom || 60) + 24);
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

    const dt = Math.min(0.05, Math.max(0, time - (this.lastTime ?? time)));
    this.lastTime = time;
    this.frameDt = dt;
    if (this.scene) {
      this.drawScene(this.scene, time);
    } else if (this.closeup) {
      this.drawHazard(this.closeup, 7, this.car.x, time, true);
    } else {
      const hz = car.hazardAhead();
      const br = this.bridge();
      // A drawbridge stays in view while you fly over it.
      const shown = hz ? { kind: hz.kind, z: hz.z } : br && br.fork.jumped ? { kind: 'drawbridge', z: br.z } : null;
      const hd = shown ? shown.z - car.z : Infinity;
      const posts = this.posts();
      // Far posts, then the hazard, then the posts in front of it.
      for (const p of posts) if (p.d > Math.max(hd, 1)) this.drawPost(p);
      if (hd < 260) this.drawHazard(shown.kind, hd, this.road.center(shown.z), time, false);
      for (const p of posts) if (p.d <= Math.max(hd, 1)) this.drawPost(p);
      this.drawGantry();
    }
    this.stepParts(dt);
    if (this.flash > 0) {
      const hot = this.closeup || this.scene;
      ctx.fillStyle = `rgba(255,${hot ? 80 : 255},${hot ? 40 : 255},${this.flash * 0.7})`;
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
        if (zp > c.from && zp < c.to) continue;
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
    // Tall blocks, shrinking more slowly than they recede (as in the arcade).
    const near = Math.min(this.H * 0.055, this.W * 0.07);
    const real = clamp((f * 0.9) / d, 2.5, near);
    const arcade = near * Math.sqrt(Math.exp(-d / CLASSIC_FALLOFF));
    const h = real + (arcade - real) * this.classic;
    const w = Math.max(1.5, h * 0.4);
    ctx.globalAlpha = this.classic ? 1 : clamp(1.25 - d / DMAX, 0.25, 1);
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
    if (!f || this.car.z < f.z - SIGN_LEAD - 200 || this.closeup || this.scene) return;
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
    // (Most hazards lay their own road.)
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

  // ------------------------------------------------------------- particles

  // The drawbridge on the road you're on, if there is one near.
  bridge() {
    for (const f of this.road.forks) {
      if (f.hazard !== 'drawbridge' || !f.side || f.side === f.safe) continue;
      const z = f.z + HAZARD_AT;
      if (Math.abs(this.car.z - z) < 500) return { fork: f, z };
    }
    return null;
  }

  // Flames, smoke and embers live in the world (so they keep their place in
  // perspective) and are drawn as soft sprites.
  emit(n, make) {
    for (let i = 0; i < n && this.parts.length < 1400; i++) this.parts.push({ life: 0, ...make() });
  }

  stepParts(dt) {
    for (const p of this.parts) {
      p.life += dt;
      p.X += p.vX * dt;
      p.h += p.vh * dt;
      if (p.type === 'flame') p.vh += 1.5 * dt;
    }
    this.parts = this.parts.filter((p) => p.life < p.max && p.z - this.car.z > 0.5);
  }

  drawParts(type, lighter) {
    const { ctx } = this;
    ctx.save();
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (p.type !== type) continue;
      const dd = p.z - this.car.z;
      if (dd < 1) continue;
      const u = p.life / p.max;
      const [x, y] = this.P(p.X, p.h, dd);
      let r;
      let img;
      if (type === 'flame') {
        r = ((this.f * p.size) / dd) * (0.7 + 0.7 * u) * (1 - u * 0.55);
        img = sprite(u < 0.35 ? 'hot' : 'warm');
        ctx.globalAlpha = Math.min(1, (1 - u) * 1.4);
      } else if (type === 'smoke') {
        r = ((this.f * p.size) / dd) * (0.6 + u * 1.6);
        img = sprite('smoke');
        ctx.globalAlpha = Math.sin(Math.PI * u) * 0.9;
      } else {
        r = Math.max(1.2, (this.f * p.size) / dd);
        img = sprite('ember');
        ctx.globalAlpha = 1 - u;
      }
      ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }

  draw_fire(X, d, t, light, closeup) {
    const { ctx } = this;
    const z = this.car.z + d;
    // The road glows orange toward the flames.
    this.roadPatch(X, Math.max(1.2, d - 60), d + 4, 1, [150, 70, 28], true);
    const [cx, cy] = this.P(X, 2 * this.up, d);
    const R = ((this.f * 16) / d) * (1 + 0.06 * Math.sin(t * 9));
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    glow.addColorStop(0, 'rgba(255,170,60,0.6)');
    glow.addColorStop(0.5, 'rgba(255,90,10,0.25)');
    glow.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const dt = this.frameDt || 0.016;
    const up = this.up;
    this.emit(Math.round(dt * 260), () => ({
      type: 'flame', X: X - 8 + Math.random() * 16, z: z + Math.random() * 6, h: Math.random() * 0.4,
      vX: (Math.random() - 0.5) * 0.8, vh: (1.5 + Math.random() * 2.5) * up, max: 0.45 + Math.random() * 0.6, size: (0.9 + Math.random()) * up,
    }));
    this.emit(Math.round(dt * 30), () => ({
      type: 'smoke', X: X - 6 + Math.random() * 12, z: z + 2 + Math.random() * 6, h: 3 * up,
      vX: 0.6 + Math.random(), vh: (2 + Math.random() * 1.5) * up, max: 2.4 + Math.random(), size: 2.2 * up,
    }));
    this.emit(Math.round(dt * 25), () => ({
      type: 'ember', X: X - 7 + Math.random() * 14, z: z + Math.random() * 5, h: 1,
      vX: (Math.random() - 0.5) * 3, vh: (5 + Math.random() * 6) * up, max: 0.8 + Math.random() * 0.8, size: 0.08,
    }));
    this.drawParts('smoke', false);
    this.drawParts('flame', true);
    this.drawParts('ember', true);
  }

  // The lip of a volcano: a crater glowing with a lake of lava.
  draw_volcano(X, d, t, light, closeup) {
    const { ctx, W, horizon } = this;
    const [, yEdge] = this.P(X, 0, d);
    const rimY = horizon - this.H * 0.04;
    // The sky glows red over the crater.
    const sky = ctx.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, W);
    sky.addColorStop(0, 'rgba(255,90,20,0.55)');
    sky.addColorStop(0.5, 'rgba(160,30,10,0.25)');
    sky.addColorStop(1, 'rgba(60,0,0,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, yEdge);
    if (yEdge > rimY + 4) this.drawLava(rimY, yEdge, t, closeup ? 1 : clamp(1.6 - d / 220, 0, 1));
    // The far rim against the glow.
    ctx.fillStyle = '#140604';
    ctx.beginPath();
    ctx.moveTo(-10, rimY + 30);
    for (let i = 0; i <= 30; i++) {
      const x = (W * i) / 30;
      ctx.lineTo(x, rimY - this.H * 0.035 * (0.4 + noise(i * 0.7) + 0.5 * noise(i * 2.3 + 9)));
    }
    ctx.lineTo(W + 10, rimY + 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,40,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Smoke boiling up out of it, lit from below.
    const dt = this.frameDt || 0.016;
    const z = this.car.z + d;
    this.emit(Math.round(dt * 14), () => ({
      type: 'smoke', X: X - 60 + Math.random() * 120, z: z + 150 + Math.random() * 100, h: 5 * this.up,
      vX: 2 + Math.random() * 2, vh: (6 + Math.random() * 4) * this.up, max: 4 + Math.random() * 2, size: 14 * this.up,
    }));
    this.emit(Math.round(dt * 40), () => ({
      type: 'ember', X: X - 50 + Math.random() * 100, z: z + 60 + Math.random() * 120, h: -20,
      vX: (Math.random() - 0.5) * 6, vh: (10 + Math.random() * 14) * this.up, max: 1.5 + Math.random(), size: 0.3,
    }));
    this.drawParts('smoke', false);
    this.drawParts('ember', true);
    // The road up to the lip, lit orange, ending in black rock.
    this.roadPatch(X, Math.max(1.2, d - 60), d, 1, [95, 62, 50]);
    this.brokenEdge(X, d, 0.5);
  }

  // A lake of lava seen from above, filling the band from y0 down to y1:
  // bright cracks between drifting plates of dark crust, and bubbles.
  drawLava(y0, y1, t, fade) {
    const { ctx, W } = this;
    const h = y1 - y0;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.rect(0, y0, W, h);
    ctx.clip();
    const base = ctx.createLinearGradient(0, y0, 0, y1);
    base.addColorStop(0, '#ff8a1a');
    base.addColorStop(0.5, '#ffb43a');
    base.addColorStop(1, '#ff6a00');
    ctx.fillStyle = base;
    ctx.fillRect(0, y0, W, h);
    // Plates: rows get taller and wider toward you.
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const a = (r / rows) ** 1.7;
      const b = ((r + 1) / rows) ** 1.7;
      const ya = y0 + a * h;
      const yb = y0 + b * h;
      const cw = 18 + 110 * b;
      const drift = (t * (4 + r * 3)) % cw;
      const rh = yb - ya;
      for (let x = -cw + drift - (r % 2) * cw * 0.5, i = 0; x < W + cw; x += cw, i++) {
        const gap = 1.2 + 2.5 * b;
        // An irregular hexagon of crust per cell, with glowing edges.
        const j = (n, k) => (noise(r * 13.7 + i * 7.3 + n * 3.1) - 0.5) * k;
        const pts = [
          [x + gap + j(1, cw * 0.3), ya + gap + j(2, rh * 0.3)],
          [x + cw * 0.5 + j(3, cw * 0.3), ya + gap + j(4, rh * 0.2)],
          [x + cw - gap + j(5, cw * 0.25), ya + rh * 0.35 + j(6, rh * 0.3)],
          [x + cw - gap + j(7, cw * 0.3), yb - gap + j(8, rh * 0.2)],
          [x + cw * 0.45 + j(9, cw * 0.3), yb - gap + j(10, rh * 0.2)],
          [x + gap + j(11, cw * 0.25), ya + rh * 0.6 + j(12, rh * 0.3)],
        ];
        const dark = 26 + noise(r * 3.3 + i * 1.7) * 30;
        ctx.fillStyle = `rgb(${dark | 0},${(dark * 0.35) | 0},${(dark * 0.2) | 0})`;
        ctx.strokeStyle = 'rgba(255,110,20,0.75)';
        ctx.lineWidth = 0.8 + 1.5 * b;
        ctx.beginPath();
        pts.forEach(([px, py], q) => (q ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    // Bubbles swell and pop.
    for (let i = 0; i < 9; i++) {
      const life = (t * 0.7 + i * 0.37) % 1;
      const bx = W * noise(i * 3.1 + Math.floor(t * 0.7 + i * 0.37) * 5.3);
      const by = y0 + h * (0.3 + 0.7 * noise(i * 9.7 + Math.floor(t * 0.7 + i * 0.37)));
      const r = (4 + 18 * ((by - y0) / h)) * life;
      ctx.fillStyle = `rgba(255,230,140,${0.9 * (1 - life)})`;
      ctx.beginPath();
      ctx.ellipse(bx, by, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Heat haze over the top.
    const haze = ctx.createLinearGradient(0, y0, 0, y0 + h * 0.35);
    haze.addColorStop(0, 'rgba(255,120,30,0.55)');
    haze.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, y0, W, h);
    ctx.restore();
  }

  // A quad in the world: corners as [X, h, d].
  quad(pts, fill) {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([X, h, d], k) => (k ? ctx.lineTo(...this.P(X, h, d)) : ctx.moveTo(...this.P(X, h, d))));
    ctx.closePath();
    ctx.fill();
  }

  // A drawbridge with both leaves up over the river.
  draw_drawbridge(X, d, t, light) {
    const { ctx } = this;
    const { RAMP, LEAF, GAP } = BRIDGE;
    const lh = LEAF * Math.sin(RAMP);
    const lc = LEAF * Math.cos(RAMP);
    const near = d;
    const far = d + GAP;
    const lit = (dd) => clamp(1.3 - dd / 150, 0.12, 1);
    const shade = (rgb, dd) => `rgb(${rgb.map((c) => Math.round(c * lit(dd))).join(',')})`;
    const from = Math.max(1.3, near);
    // The river below.
    if (far > 1.5) {
      const [, yFar] = this.P(X, -8, far);
      const [, yNear] = this.P(X, -8, from);
      const g = this.ctx.createLinearGradient(0, yFar, 0, yNear);
      g.addColorStop(0, '#0b1a2a');
      g.addColorStop(1, '#02060b');
      this.quad([[X - HALF - 60, -8, from], [X + HALF + 60, -8, from], [X + HALF + 60, -8, far], [X - HALF - 60, -8, far]], g);
      ctx.strokeStyle = 'rgba(200,220,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const dd = from + ((i * 0.618 + t * 0.03) % 1) * (far - from);
        const lat = X + (noise(i * 4.1) - 0.5) * 70;
        const [ax, ay] = this.P(lat, -8, dd);
        const [bx] = this.P(lat + 2 + noise(i) * 3, -8, dd);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, ay);
      }
      ctx.stroke();
    }
    // The road beyond, and the far leaf raised toward you (you see its
    // girders from below, or its deck when you're flying high).
    if (far + 80 > 1.5) this.roadPatch(X, Math.max(1.3, far), far + 80, 0.8);
    if (far - lc > 1.3) {
      const high = this.camH + this.lift > lh + 1;
      this.quad([[X - HALF, 0, far], [X + HALF, 0, far], [X + HALF, lh, far - lc], [X - HALF, lh, far - lc]], high ? shade([70, 70, 74], far) : shade([58, 64, 76], far));
      if (!high) {
        ctx.strokeStyle = shade([110, 118, 132], far);
        ctx.lineWidth = Math.max(1, (this.f * 0.15) / far);
        ctx.beginPath();
        for (let k = 1; k < 5; k++) {
          const a = this.P(X - HALF + (2 * HALF * k) / 5, 0, far);
          const b = this.P(X - HALF + (2 * HALF * k) / 5, lh, far - lc);
          ctx.moveTo(...a);
          ctx.lineTo(...b);
        }
        ctx.stroke();
      }
    }
    // Bridge-tender towers at each end, red lights blinking.
    for (const zz of [far, near]) {
      if (zz < 2) continue;
      for (const side of [-1, 1]) {
        const x0 = X + side * (HALF + 2.5);
        const x1 = X + side * (HALF + 6);
        this.quad([[x0, 0, zz], [x1, 0, zz], [x1, 10, zz], [x0, 10, zz]], shade([92, 96, 108], zz));
        this.quad([[x0 + side * 0.8, 6, zz], [x1 - side * 0.8, 6, zz], [x1 - side * 0.8, 8, zz], [x0 + side * 0.8, 8, zz]], `rgba(255,214,120,${0.4 + 0.5 * lit(zz)})`);
        if (Math.floor(t * 2) % 2) {
          const [lx, ly] = this.P((x0 + x1) / 2, 10.6, zz);
          const r = Math.max(2, (this.f * 0.5) / zz);
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 3);
          g.addColorStop(0, 'rgba(255,60,40,1)');
          g.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(lx - r * 3, ly - r * 3, r * 6, r * 6);
        }
      }
    }
    // The road up to the bridge, and the near leaf: a ramp into the sky.
    if (near > 1.3) this.roadPatch(X, Math.max(1.2, near - 60), near);
    const s0 = Math.max(0, 1.3 - near);
    if (s0 < LEAF) {
      const a = near + s0 * Math.cos(RAMP);
      const ha = s0 * Math.sin(RAMP);
      // Steel deck plates, a blue-grey ramp rising off the road.
      this.quad([[X - HALF, ha, a], [X + HALF, ha, a], [X + HALF, lh, near + lc], [X - HALF, lh, near + lc]], shade([88, 98, 116], Math.max(a, 1)));
      ctx.strokeStyle = shade([140, 150, 170], Math.max(a, 1));
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let q = 1; q < 6; q++) {
        const sq = s0 + ((LEAF - s0) * q) / 6;
        const dq = near + sq * Math.cos(RAMP);
        ctx.moveTo(...this.P(X - HALF, sq * Math.sin(RAMP), dq));
        ctx.lineTo(...this.P(X + HALF, sq * Math.sin(RAMP), dq));
      }
      ctx.stroke();
      // Black and yellow chevrons along the raised tip.
      const band = 1.6;
      const bc = band * Math.cos(RAMP);
      const bh = band * Math.sin(RAMP);
      for (let k = 0; k < 8; k++) {
        const xa = X - HALF + (2 * HALF * k) / 8;
        this.quad([[xa, lh - bh, near + lc - bc], [xa + (2 * HALF) / 8, lh - bh, near + lc - bc], [xa + (2 * HALF) / 8, lh, near + lc], [xa, lh, near + lc]], k % 2 ? '#111' : shade([250, 200, 30], near + lc));
      }
    }
  }

  // ------------------------------------------------------------- falls

  // Over the edge: a few seconds of falling, then the crash.
  drawScene(sc, time) {
    const { ctx, W, H } = this;
    const u = clamp(sc.t / sc.dur, 0, 1);
    const k = sc.kind;
    if (sc.hit) {
      // Afterwards: the bottom of the canyon, the lava, or under water.
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (k === 'drawbridge') {
        g.addColorStop(0, '#0a2a33');
        g.addColorStop(1, '#010608');
      } else if (k === 'volcano') {
        g.addColorStop(0, '#ff9a2a');
        g.addColorStop(1, '#a01800');
      } else {
        g.addColorStop(0, '#2a1410');
        g.addColorStop(1, '#050202');
      }
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      if (k === 'drawbridge') this.bubbles(time);
      if (k === 'volcano') this.drawLava(0, H, time, 1);
      return;
    }
    if (k === 'drawbridge') return this.sink(sc, u, time);
    // Tip over the edge (the view pitches down), then fall between the walls.
    const pitch = Math.min(1, u / 0.3) ** 2;
    this.fallView(k, sc.t, u, time);
    if (pitch < 1) {
      ctx.save();
      ctx.translate(0, -pitch * H * 1.05);
      ctx.fillStyle = '#000';
      ctx.fillRect(-20, -H, W + 40, H + this.horizon + 20);
      this[`draw_${k}`](this.car.x, 6, time, 1, true);
      ctx.restore();
    }
  }

  // Looking down while falling: rock walls rushing up past you.
  fallView(k, t, u, time) {
    const { ctx, W, H } = this;
    const lava = k === 'volcano';
    const vy = H * 0.86;
    // The depths: river glint or lava, growing as you get closer.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (lava) {
      g.addColorStop(0, '#3a0d06');
      g.addColorStop(0.7, '#b52a05');
      g.addColorStop(1, '#ff8a1a');
    } else {
      g.addColorStop(0, '#2b1a2e');
      g.addColorStop(0.7, '#160b10');
      g.addColorStop(1, '#050304');
    }
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const grow = u ** 3;
    if (lava) {
      this.drawLava(vy - H * 0.05 - grow * H * 0.85, H + 10, time, 1);
    } else {
      ctx.fillStyle = `rgba(150,180,230,${0.25 + 0.5 * u})`;
      ctx.beginPath();
      ctx.ellipse(W / 2, vy, W * (0.04 + 0.5 * grow), H * (0.006 + 0.05 * grow), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.sin(t * 2.6) * 0.1 * u); // tumbling
    ctx.translate(-W / 2, -H / 2);
    const scroll = H * (0.25 * t + 0.9 * t * t); // falling faster and faster
    const palette = lava ? ['#2a1410', '#3a1c14', '#22100c', '#4a2216', '#1c0c08'] : ['#8a4a33', '#a65d3c', '#7a3f2c', '#c07a4f', '#6b3426', '#93553a'];
    for (const side of [-1, 1]) {
      // A jagged wall from the screen edge in toward the middle.
      const edge = (y) => W / 2 + side * (W * (0.08 + 0.3 * ((vy - y) / vy) ** 0.8) + W * 0.05 * (noise((y + scroll) / 60 + side * 50) - 0.5));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(side < 0 ? -20 : W + 20, -20);
      for (let y = -20; y <= H + 20; y += 12) ctx.lineTo(edge(Math.min(y, vy)), y);
      ctx.lineTo(side < 0 ? -20 : W + 20, H + 20);
      ctx.closePath();
      ctx.clip();
      const band = H * 0.07;
      const first = Math.floor(scroll / band);
      for (let i = first; i < first + Math.ceil(H / band) + 2; i++) {
        const y = i * band - scroll;
        ctx.fillStyle = palette[((i % palette.length) + palette.length) % palette.length];
        ctx.fillRect(-20, y, W + 40, band + 1);
      }
      // Light: the far side of the wall darker; lava lights it from below.
      const lg = ctx.createLinearGradient(side < 0 ? 0 : W, 0, W / 2, 0);
      lg.addColorStop(0, 'rgba(0,0,0,0)');
      lg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = lg;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      const bottom = ctx.createLinearGradient(0, 0, 0, H);
      bottom.addColorStop(0, 'rgba(0,0,0,0.35)');
      bottom.addColorStop(1, lava ? `rgba(255,110,20,${0.25 + 0.4 * u})` : 'rgba(0,0,0,0.5)');
      ctx.fillStyle = bottom;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.restore();
    }
    // Rock dust (or embers) streaking past.
    ctx.strokeStyle = lava ? 'rgba(255,190,90,0.7)' : 'rgba(230,200,170,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 30; i++) {
      const x = W * noise(i * 5.3);
      const y = H - ((scroll * (0.8 + noise(i * 2.1)) + i * 97) % (H + 60));
      const len = 8 + 40 * u;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Too slow for the drawbridge: up the ramp, a moment of sky, then the river.
  sink(sc, u, time) {
    const { ctx, W, H } = this;
    if (u < 0.35) {
      // Climbing the ramp: the bridge drops away below.
      const k = u / 0.35;
      this.lift = k * 6;
      this.draw_drawbridge(this.car.x, 4 - k * 6, time, 1);
      this.lift = 0;
      return;
    }
    // Nose down toward the water, closer and closer.
    const k = (u - 0.35) / 0.65;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d2233');
    g.addColorStop(1, '#03080d');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.strokeStyle = 'rgba(200,225,255,0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const r = ((i / 14 + k * 0.9) % 1) * Math.max(W, H) * (0.4 + k * 1.6);
      ctx.beginPath();
      ctx.ellipse(W / 2 + Math.sin(i * 2.7) * W * 0.2, H * 0.55 + Math.cos(i * 1.9) * H * 0.15, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Moonlight on the water
    ctx.fillStyle = `rgba(220,230,255,${0.25 * (1 - k)})`;
    ctx.beginPath();
    ctx.ellipse(W * 0.6, H * 0.4, W * 0.12 * (1 + k * 3), H * 0.02 * (1 + k * 3), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  bubbles(time) {
    const { ctx, W, H } = this;
    ctx.strokeStyle = 'rgba(200,240,255,0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const y = H - (((time * (60 + 40 * noise(i * 3.3)) + i * 53) % (H + 40)));
      const x = W * noise(i * 7.7) + Math.sin(time * 3 + i) * 6;
      const r = 3 + 6 * noise(i * 1.9);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// Smooth 1-D value noise in [0, 1).
function noise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const t = f * f * (3 - 2 * f);
  return h(i) * (1 - t) + h(i + 1) * t;
}

// Soft round sprites for flames, smoke and embers (made once, on first use).
const SPRITES = {};
function sprite(name) {
  if (SPRITES[name]) return SPRITES[name];
  const stops = {
    hot: [[0, 'rgba(255,255,235,1)'], [0.25, 'rgba(255,225,130,0.9)'], [0.6, 'rgba(255,130,25,0.35)'], [1, 'rgba(255,60,0,0)']],
    warm: [[0, 'rgba(255,170,60,0.85)'], [0.5, 'rgba(225,70,10,0.4)'], [1, 'rgba(150,20,0,0)']],
    smoke: [[0, 'rgba(42,38,36,0.6)'], [0.6, 'rgba(32,30,30,0.28)'], [1, 'rgba(20,20,20,0)']],
    ember: [[0, 'rgba(255,245,200,1)'], [0.4, 'rgba(255,150,40,0.8)'], [1, 'rgba(255,60,0,0)']],
  }[name];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return (SPRITES[name] = c);
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
