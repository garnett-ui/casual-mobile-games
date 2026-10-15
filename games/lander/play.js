// Lunar Lander in play: camera, rendering (lander, terrain, Earthrise, retro
// instrument panel, explosion) and the thruster controls.
import { step, newLander, heightAt, G, SAFE, HOLD_BAND, FEET } from './engine.js';
import { rng } from '../../js/lib/random.js';

const PHOSPHOR = '#3dff7a';
const DEG = 180 / Math.PI;

export class Play {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.input = { thrust: false, left: false, right: false };
    this.paused = false;
    this.timeScale = 1; // the browser tests fast-forward flights
    this.makeScenery();
    this.reset();
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
      this.last = now;
      if (!this.paused) this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  reset() {
    this.L = newLander(this.level, this.level.fuel);
    this.outcome = null;
    this.particles = [];
    this.debris = [];
    this.puffs = [];
    this.flash = 0;
    this.shake = 0;
    this.message = null;
    this.alarmAt = 0;
    this.cam = null;
    this.hooks.onSound?.('stop');
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.hooks.onSound?.('stop');
  }

  setInput(key, on) {
    this.input[key] = on;
  }

  // ------------------------------------------------------------- scenery

  makeScenery() {
    const r = rng(this.level.n * 101 + 7);
    this.stars = Array.from({ length: 160 }, () => ({ x: r(), y: r() * 0.85, s: r() < 0.1 ? 1.6 : 0.8 + r() * 0.6, tw: r() * 6 }));
    // Craters dotted along the surface.
    this.craters = [];
    for (let x = 20; x < this.level.width; x += 18 + r() * 40) {
      this.craters.push({ x, r: 2 + r() * 7, d: 0.25 + r() * 0.3 });
    }
    // Earth's continents (blobs on the disc).
    this.lands = Array.from({ length: 5 }, () => ({
      a: r() * Math.PI * 2, d: r() * 0.7, rx: 0.18 + r() * 0.25, ry: 0.1 + r() * 0.2, rot: r() * 3,
      c: r() < 0.6 ? '#4f8f3a' : '#a08354',
    }));
    this.clouds = Array.from({ length: 7 }, () => ({ a: r() * Math.PI * 2, d: r() * 0.8, w: 0.2 + r() * 0.4, rot: r() * 3 }));
  }

  // ------------------------------------------------------------ simulation

  update(dt) {
    const L = this.L;
    if (!this.outcome || this.outcome.kind === 'touchdown') {
      const was = L.landed;
      // Physics in fixed small steps for stability.
      let res = null;
      const n = Math.ceil(dt / (1 / 120));
      for (let k = 0; k < n && !res; k++) {
        // Tests can fly with an autopilot that steers every physics step.
        if (this.pilot) Object.assign(this.input, this.pilot(this.level, L));
        res = step(this.level, L, this.input, dt / n);
      }
      if (res) {
        this.outcome = res;
        if (res.kind === 'crash') this.explode();
        else if (res.kind === 'landed') {
          this.hooks.onSound?.('stop');
          this.hooks.sfx?.('contact');
          setTimeout(() => this.hooks.onLanded?.(res), 900);
        } else {
          this.hooks.sfx?.('contact');
          this.message = { text: res.where === 'start' ? 'BACK ON LAUNCH PAD' : 'TOUCHDOWN — NOT AT BASE. LIFT OFF AGAIN', t: 3 };
        }
      } else if (was && !L.landed) {
        this.outcome = null;
      }
      this.hooks.onSound?.('engine', L.thrusting && !L.crashed);
      this.hooks.onSound?.('rcs', !!L.rcs && !L.crashed);
      // Low fuel alarm.
      if (!L.landed && L.fuel > 0 && L.fuel / L.fuelMax < 0.15 && L.t > this.alarmAt) {
        this.alarmAt = L.t + 2;
        this.hooks.sfx?.('alarm');
      }
      // Thruster exhaust puffs.
      if (L.rcs) this.rcsPuff();
    }
    if (this.message) {
      this.message.t -= dt;
      if (this.message.t <= 0) this.message = null;
    }
    this.updateEffects(dt);
  }

  rcsPuff() {
    const L = this.L;
    // Clockwise turn: left quad fires up, right quad fires down (and vice versa).
    for (const side of [-1, 1]) {
      const dir = side * L.rcs > 0 ? -1 : 1;
      const [x, y] = this.local(1.95 * side, 3.6);
      const c = Math.cos(L.angle);
      const s = Math.sin(L.angle);
      // Puff direction in world coords (local up = (sin, cos)).
      const ux = s * dir;
      const uy = c * dir;
      this.puffs.push({ x, y, vx: L.vx + ux * 6 + (Math.random() - 0.5), vy: L.vy + uy * 6 + (Math.random() - 0.5), life: 0.35 });
    }
  }

  local(lx, ly) {
    const L = this.L;
    const c = Math.cos(L.angle);
    const s = Math.sin(L.angle);
    return [L.x + lx * c + ly * s, L.y - lx * s + ly * c];
  }

  explode() {
    const L = this.L;
    this.hooks.onSound?.('stop');
    this.hooks.sfx?.('explode');
    this.hooks.haptic?.(400);
    this.flash = 0.8;
    this.shake = 1;
    const [cx, cy] = this.local(0, 2.5);
    for (let k = 0; k < 90; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * 14;
      this.particles.push({
        x: cx, y: cy, vx: Math.cos(a) * v + L.vx * 0.3, vy: Math.abs(Math.sin(a)) * v * 0.9 + 2,
        r: 0.6 + Math.random() * 1.2, grow: 2 + Math.random() * 3,
        life: 0.8 + Math.random() * 1.6, max: 0, fire: k < 60,
      });
    }
    for (const p of this.particles) p.max = p.life;
    // The lander comes apart: these pieces tumble and settle on the surface.
    const gold = '#d4a017';
    const grey = '#c9ccd4';
    const parts = [
      { shape: [[-1.6, 1.2], [1.6, 1.2], [1.8, 2.6], [-1.8, 2.6]], color: gold, at: [0, 1.9] },
      { shape: [[-1.3, 2.6], [1.3, 2.6], [1.0, 4.6], [-1.0, 4.6]], color: grey, at: [0, 3.6] },
      { shape: [[-0.6, 4.6], [0.6, 4.6], [0.5, 5.2], [-0.5, 5.2]], color: '#8e939e', at: [0, 4.9] },
      { shape: [[-0.4, 0.6], [0.4, 0.6], [0.6, 1.2], [-0.6, 1.2]], color: '#555a66', at: [0, 0.9] },
      { shape: [[0, 0], [0.9, 1.6], [1.1, 1.5], [0.2, -0.1]], color: '#b8bcc6', at: [-1.9, 0.8] },
      { shape: [[0, 0], [-0.9, 1.6], [-1.1, 1.5], [-0.2, -0.1]], color: '#b8bcc6', at: [1.9, 0.8] },
      { shape: [[-0.5, -0.1], [0.5, -0.1], [0.5, 0.15], [-0.5, 0.15]], color: '#9aa0aa', at: [-2.4, 0] },
      { shape: [[-0.5, -0.1], [0.5, -0.1], [0.5, 0.15], [-0.5, 0.15]], color: '#9aa0aa', at: [2.4, 0] },
      { shape: [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]], color: '#e6e6e6', at: [1.8, 3.6] },
      { shape: [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]], color: '#e6e6e6', at: [-1.8, 3.6] },
      { shape: [[0, 0], [0.7, 0.4], [0.5, 0.8], [-0.2, 0.5]], color: gold, at: [1.2, 2.0] },
      { shape: [[0, 0], [-0.7, 0.4], [-0.5, 0.8], [0.2, 0.5]], color: gold, at: [-1.2, 2.0] },
      { shape: [[-0.5, 0], [0.5, 0], [0, 0.6]], color: '#dfe3ea', at: [0.9, 5.0] },
    ];
    this.debris = parts.map((p) => {
      const [x, y] = this.local(...p.at);
      const out = Math.atan2(y - cy, x - cx);
      const v = 4 + Math.random() * 12;
      return {
        shape: p.shape.map(([px, py]) => [px - p.at[0], py - p.at[1]]), color: p.color, x, y,
        vx: Math.cos(out) * v + (Math.random() - 0.5) * 6 + L.vx * 0.4,
        vy: Math.abs(Math.sin(out)) * v + 3 + Math.random() * 6,
        a: L.angle, spin: (Math.random() - 0.5) * 10, rest: false,
      };
    });
    setTimeout(() => this.hooks.onCrash?.(this.outcome), 2800);
  }

  updateEffects(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.2 * dt);
      p.vy = p.vy * Math.exp(-1.2 * dt) + (p.fire ? 1.5 : 0.6) * dt;
      p.r += p.grow * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.puffs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    for (const d of this.debris) {
      if (d.rest) continue;
      d.vy -= G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.a += d.spin * dt;
      const ground = heightAt(this.level, d.x) + 0.15;
      if (d.y < ground) {
        d.y = ground;
        if (Math.abs(d.vy) < 1.2 && Math.abs(d.vx) < 0.8) {
          d.rest = true;
          continue;
        }
        d.vy = Math.abs(d.vy) * 0.35;
        d.vx *= 0.65;
        d.spin *= 0.55;
        // Kick up a little dust.
        this.particles.push({ x: d.x, y: ground, vx: 0, vy: 0.5, r: 0.4, grow: 1.5, life: 0.6, max: 0.6, fire: false, dust: true });
      }
    }
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 1.4);
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
  }

  // Camera follows the lander and zooms in as it gets close to the ground.
  camera() {
    const L = this.L;
    const ground = heightAt(this.level, L.x);
    const alt = Math.max(0, L.y - ground);
    const wantH = Math.max(55, Math.min(420, alt * 1.7 + 48));
    // Keep the surface above the thruster buttons at the bottom.
    let bottom = Math.min(ground, L.y) - wantH * 0.27;
    if (L.y + 12 > bottom + wantH * 0.8) bottom = L.y + 12 - wantH * 0.8;
    const want = { h: wantH, bottom, x: L.x };
    if (!this.cam) this.cam = want;
    const k = 0.08;
    this.cam.h += (want.h - this.cam.h) * k;
    this.cam.bottom += (want.bottom - this.cam.bottom) * k * 1.5;
    this.cam.x += (want.x - this.cam.x) * 0.2;
    const scale = this.cssH / this.cam.h;
    return { scale, left: this.cam.x - this.cssW / scale / 2, bottom: this.cam.bottom };
  }

  draw() {
    const { ctx, dpr, cssW: W, cssH: H } = this;
    const cam = this.camera();
    const sx = (x) => (x - cam.left) * cam.scale;
    const sy = (y) => H - (y - cam.bottom) * cam.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shake = this.shake * 8;
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // Space
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#000004');
    sky.addColorStop(1, '#070a1c');
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const t = performance.now() / 1000;
    for (const s of this.stars) {
      const x = (((s.x * W * 1.4 - cam.left * 0.02) % (W * 1.4)) + W * 1.4) % (W * 1.4) - W * 0.2;
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 1.3 + s.tw);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, s.y * H, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    this.drawEarth(W * 0.24 - cam.left * 0.01, H * 0.24, Math.min(W, H) * 0.1);

    // Terrain
    const x0 = Math.max(0, cam.left - 10);
    const x1 = Math.min(this.level.width, cam.left + W / cam.scale + 10);
    ctx.beginPath();
    ctx.moveTo(sx(x0), H + 20);
    for (let x = x0; x <= x1; x += Math.max(1, 2 / cam.scale)) ctx.lineTo(sx(x), sy(heightAt(this.level, x)));
    ctx.lineTo(sx(x1), H + 20);
    ctx.closePath();
    const ground = ctx.createLinearGradient(0, sy(this.level.maxH), 0, H);
    ground.addColorStop(0, '#a6a6aa');
    ground.addColorStop(1, '#3d3e44');
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.strokeStyle = '#d8d8dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += Math.max(1, 2 / cam.scale)) {
      if (x === x0) ctx.moveTo(sx(x), sy(heightAt(this.level, x)));
      else ctx.lineTo(sx(x), sy(heightAt(this.level, x)));
    }
    ctx.stroke();
    for (const c of this.craters) {
      if (c.x < x0 - 10 || c.x > x1 + 10) continue;
      const gy = heightAt(this.level, c.x);
      ctx.fillStyle = 'rgba(40,40,46,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx(c.x), sy(gy - c.r * 0.35), c.r * cam.scale, c.r * c.d * cam.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,230,235,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx(c.x), sy(gy - c.r * 0.35), c.r * cam.scale, c.r * c.d * cam.scale, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
    this.drawPad(this.level.startPad, sx, sy, cam.scale, false);
    this.drawPad(this.level.base, sx, sy, cam.scale, true);

    // Lander, exhaust and wreckage
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const p of this.puffs) {
      ctx.globalAlpha = p.life / 0.35;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), Math.max(1, 0.25 * cam.scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!this.L.crashed) this.drawLander(sx(this.L.x), sy(this.L.y), cam.scale);
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(sx(d.x), sy(d.y));
      ctx.rotate(d.a);
      ctx.fillStyle = d.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      d.shape.forEach(([px, py], k) => (k ? ctx.lineTo(px * cam.scale, -py * cam.scale) : ctx.moveTo(px * cam.scale, -py * cam.scale)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      ctx.globalCompositeOperation = p.fire && k < 0.6 ? 'lighter' : 'source-over';
      ctx.globalAlpha = Math.max(0, p.life / p.max) * (p.dust ? 0.5 : 0.9);
      ctx.fillStyle = p.dust ? '#bdbdc2' : !p.fire ? '#4a4a50' : k < 0.2 ? '#fff6c0' : k < 0.45 ? '#ffb02e' : k < 0.7 ? '#e8590c' : '#5a3a30';
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), Math.max(1, p.r * cam.scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,220,160,${this.flash * 0.6})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    this.drawBaseMarker(sx, sy, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawPanel(W);
    if (this.message) this.drawMessage(this.message.text, W, H);
  }

  drawEarth(x, y, r) {
    const { ctx } = this;
    // Glow
    const glow = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.35);
    glow.addColorStop(0, 'rgba(110,170,255,0.35)');
    glow.addColorStop(1, 'rgba(110,170,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    const ocean = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    ocean.addColorStop(0, '#4a8fe0');
    ocean.addColorStop(1, '#173d8a');
    ctx.fillStyle = ocean;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    for (const l of this.lands) {
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(l.a) * l.d * r, y + Math.sin(l.a) * l.d * r, l.rx * r, l.ry * r, l.rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineCap = 'round';
    for (const c of this.clouds) {
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(c.a) * c.d * r, y + Math.sin(c.a) * c.d * r, c.w * r, c.w * r * 0.35, c.rot, 0.2, 2.4);
      ctx.stroke();
    }
    // Night side: the Sun is off to the right.
    const shadow = ctx.createLinearGradient(x - r, y, x + r * 0.4, y);
    shadow.addColorStop(0, 'rgba(0,0,8,0.92)');
    shadow.addColorStop(0.55, 'rgba(0,0,8,0.6)');
    shadow.addColorStop(1, 'rgba(0,0,8,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  }

  drawPad(pad, sx, sy, scale, isBase) {
    const { ctx } = this;
    const x = sx(pad.x0);
    const w = (pad.x1 - pad.x0) * scale;
    const y = sy(pad.y);
    const h = Math.max(3, 0.7 * scale);
    ctx.fillStyle = isBase ? '#e9ecef' : '#8d9099';
    ctx.fillRect(x, y, w, h);
    if (isBase) {
      // Hazard stripes on both ends and blinking beacons.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = '#f4c20d';
      for (let k = -2; k < w / 6 + 2; k++) {
        if (k * 6 > w * 0.18 && k * 6 < w * 0.82) continue;
        ctx.beginPath();
        ctx.moveTo(x + k * 6, y + h);
        ctx.lineTo(x + k * 6 + 3, y + h);
        ctx.lineTo(x + k * 6 + 3 + h, y);
        ctx.lineTo(x + k * 6 + h, y);
        ctx.fill();
      }
      ctx.restore();
      const on = Math.floor(performance.now() / 500) % 2 === 0;
      for (const bx of [x, x + w]) {
        ctx.fillStyle = on ? '#ff3b3b' : '#5a1010';
        ctx.beginPath();
        ctx.arc(bx, y - 2, Math.max(2, 0.35 * scale), 0, Math.PI * 2);
        ctx.fill();
        if (on) {
          ctx.fillStyle = 'rgba(255,60,60,0.25)';
          ctx.beginPath();
          ctx.arc(bx, y - 2, Math.max(6, 1.2 * scale), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Habitat dome and antenna beside the pad.
      const hx = sx(pad.x1 + 6);
      const hy = sy(heightAt(this.level, pad.x1 + 6));
      ctx.fillStyle = '#dfe3ea';
      ctx.beginPath();
      ctx.arc(hx, hy, 3 * scale, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#7ab8ff';
      ctx.fillRect(hx - 0.8 * scale, hy - 1.6 * scale, 1.6 * scale, 0.7 * scale);
      ctx.strokeStyle = '#dfe3ea';
      ctx.lineWidth = Math.max(1, 0.2 * scale);
      ctx.beginPath();
      ctx.moveTo(hx + 4 * scale, hy);
      ctx.lineTo(hx + 4 * scale, hy - 6 * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx + 4 * scale, hy - 6 * scale, 1.2 * scale, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      if (scale > 1.2) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `bold ${Math.max(10, Math.min(16, scale * 2))}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('BASE', x + w / 2, y + h + Math.max(12, 2.2 * scale));
        ctx.textAlign = 'left';
      }
    }
  }

  drawLander(x, y, s) {
    const { ctx } = this;
    const L = this.L;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(L.angle);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    // Flame (local y up = screen -y)
    if (L.thrusting) {
      const len = 2.8 + Math.random() * 1.6;
      const fl = ctx.createLinearGradient(0, -0.6, 0, len);
      fl.addColorStop(0, 'rgba(255,255,240,0.95)');
      fl.addColorStop(0.3, 'rgba(255,200,90,0.85)');
      fl.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.moveTo(-0.5, -0.6);
      ctx.quadraticCurveTo(-0.9, len * 0.5, 0, len);
      ctx.quadraticCurveTo(0.9, len * 0.5, 0.5, -0.6);
      ctx.fill();
    }
    const lw = 1 / s;
    // Legs and footpads
    ctx.strokeStyle = '#b8bcc6';
    ctx.lineWidth = Math.max(lw * 1.5, 0.18);
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(k * 1.5, -1.6);
      ctx.lineTo(k * FEET, 0);
      ctx.moveTo(k * 1.0, -1.1);
      ctx.lineTo(k * FEET, 0);
      ctx.stroke();
      ctx.fillStyle = '#9aa0aa';
      ctx.beginPath();
      ctx.ellipse(k * FEET, -0.05, 0.5, 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Engine bell
    ctx.fillStyle = '#4b505c';
    ctx.beginPath();
    ctx.moveTo(-0.4, -1.2);
    ctx.lineTo(0.4, -1.2);
    ctx.lineTo(0.6, -0.6);
    ctx.lineTo(-0.6, -0.6);
    ctx.closePath();
    ctx.fill();
    // Descent stage: gold foil
    const foil = ctx.createLinearGradient(-1.8, 0, 1.8, 0);
    foil.addColorStop(0, '#a87a10');
    foil.addColorStop(0.45, '#f2c94c');
    foil.addColorStop(1, '#9c6f0c');
    ctx.fillStyle = foil;
    ctx.beginPath();
    ctx.moveTo(-1.6, -1.2);
    ctx.lineTo(1.6, -1.2);
    ctx.lineTo(1.8, -1.6);
    ctx.lineTo(1.8, -2.6);
    ctx.lineTo(-1.8, -2.6);
    ctx.lineTo(-1.8, -1.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,0,0.6)';
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.beginPath();
    for (const fx of [-0.9, 0, 0.9]) {
      ctx.moveTo(fx, -1.25);
      ctx.lineTo(fx + 0.1, -2.55);
    }
    ctx.stroke();
    // Ascent stage
    ctx.fillStyle = '#d9dce3';
    ctx.beginPath();
    ctx.moveTo(-1.3, -2.6);
    ctx.lineTo(1.3, -2.6);
    ctx.lineTo(1.4, -3.4);
    ctx.lineTo(1.0, -4.6);
    ctx.lineTo(-1.0, -4.6);
    ctx.lineTo(-1.4, -3.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7d828e';
    ctx.stroke();
    ctx.fillStyle = '#20263a';
    ctx.beginPath();
    ctx.moveTo(-0.7, -3.3);
    ctx.lineTo(-0.15, -3.3);
    ctx.lineTo(-0.3, -3.9);
    ctx.closePath();
    ctx.moveTo(0.7, -3.3);
    ctx.lineTo(0.15, -3.3);
    ctx.lineTo(0.3, -3.9);
    ctx.closePath();
    ctx.fill();
    // Hatch, antenna, RCS quads
    ctx.fillStyle = '#9aa0aa';
    ctx.fillRect(-0.5, -5.2, 1.0, 0.6);
    ctx.strokeStyle = '#dfe3ea';
    ctx.lineWidth = Math.max(lw, 0.1);
    ctx.beginPath();
    ctx.moveTo(0.9, -4.5);
    ctx.lineTo(1.4, -5.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1.45, -5.4, 0.35, Math.PI * 0.1, Math.PI * 1.1);
    ctx.stroke();
    ctx.fillStyle = '#e6e6e6';
    for (const k of [-1, 1]) ctx.fillRect(k * 1.95 - 0.25, -3.85, 0.5, 0.5);
    ctx.restore();
  }

  // When the base is off screen, an arrow at the edge points to it.
  drawBaseMarker(sx, sy, W, H) {
    const b = this.level.base;
    const x = sx((b.x0 + b.x1) / 2);
    const y = sy(b.y);
    if (x > 0 && x < W && y > 0 && y < H) return;
    const { ctx } = this;
    const cx = Math.max(24, Math.min(W - 24, x));
    const cy = Math.max(90, Math.min(H - 24, y));
    const a = Math.atan2(y - cy, x - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(244,194,13,0.9)';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Retro green-phosphor instrument panel, top right.
  drawPanel(W) {
    const { ctx } = this;
    const L = this.L;
    const pw = Math.min(W * 0.62, 280);
    const k = pw / 280;
    const ph = 178 * k;
    const px = W - pw - 8;
    const py = 8;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(0,18,6,0.72)';
    ctx.strokeStyle = 'rgba(61,255,122,0.6)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(0, 0, 280, 178);
    ctx.strokeRect(0.5, 0.5, 279, 177);
    ctx.shadowColor = PHOSPHOR;
    ctx.shadowBlur = 6;
    ctx.fillStyle = PHOSPHOR;
    ctx.strokeStyle = PHOSPHOR;
    ctx.font = '12px ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const ground = heightAt(this.level, L.x);
    const alt = L.y - ground;
    const base = this.level.base;
    const dist = (base.x0 + base.x1) / 2 - L.x;
    const sign = (v, d = 1) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(d).padStart(5, ' ')}`;
    const tt = Math.floor(L.t);
    const lines = [
      `LM-${String(this.level.n).padStart(2, '0')} GUIDANCE   T+${String(Math.floor(tt / 60)).padStart(2, '0')}:${String(tt % 60).padStart(2, '0')}`,
      `ALT  ${alt.toFixed(1).padStart(7, ' ')} M`,
      `VEL H${sign(L.vx)}  V${sign(L.vy)} M/S`,
      `ACC H${sign(L.landed ? 0 : L.ax, 2)} V${sign(L.landed ? 0 : L.ay, 2)}`,
      `ATT  ${sign(L.angle * DEG)}°  ROT${sign(L.omega * DEG)}`,
      `BASE ${dist >= 0 ? '▶' : '◀'} ${Math.abs(dist).toFixed(0).padStart(5, ' ')} M`,
    ];
    lines.forEach((s, i) => ctx.fillText(s, 10, 9 + i * 19));
    // Fuel bar
    const frac = L.fuel / L.fuelMax;
    ctx.fillText('FUEL', 10, 9 + 6 * 19);
    ctx.strokeRect(52, 9 + 6 * 19, 120, 12);
    if (frac > 0.15 || Math.floor(performance.now() / 300) % 2) ctx.fillRect(54, 11 + 6 * 19, 116 * frac, 8);
    ctx.fillText(`${Math.round(frac * 100)}%`, 178, 9 + 6 * 19);
    // Warnings
    const warn = [];
    if (L.fuel <= 0) warn.push('FUEL OUT');
    else if (frac < 0.15) warn.push('LOW FUEL');
    if (!L.landed && -L.vy > SAFE.vy && alt < 40) warn.push('SINK RATE');
    if (!L.landed && Math.abs(L.vx) > SAFE.vx && alt < 15) warn.push('DRIFT');
    if (!L.landed && !L.rcs && L.omega !== 0 && Math.abs(L.omega) < HOLD_BAND) warn.push('ATT HOLD');
    if (L.landed) warn.push(L.landed === 'base' ? 'CONTACT · BASE' : 'CONTACT');
    if (Math.floor(performance.now() / 400) % 2 || warn.every((w) => w.startsWith('ATT') || w.startsWith('CONTACT'))) {
      ctx.fillText(warn.join('  '), 10, 9 + 7 * 19 + 6);
    }
    // Attitude ball (artificial horizon) and velocity vector box.
    const bx = 245;
    const by = 44;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(bx, by, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, 25, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(bx, by);
    ctx.rotate(-L.angle);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(-30, 0, 60, 30);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(30, 0);
    for (const m of [-10, 10]) {
      ctx.moveTo(-8, m);
      ctx.lineTo(8, m);
    }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(bx - 12, by);
    ctx.lineTo(bx - 4, by);
    ctx.lineTo(bx, by + 4);
    ctx.lineTo(bx + 4, by);
    ctx.lineTo(bx + 12, by);
    ctx.stroke();
    const vx = 245;
    const vy = 118;
    ctx.strokeRect(vx - 26, vy - 26, 52, 52);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(vx - 26, vy);
    ctx.lineTo(vx + 26, vy);
    ctx.moveTo(vx, vy - 26);
    ctx.lineTo(vx, vy + 26);
    ctx.stroke();
    ctx.strokeRect(vx - 26 * (SAFE.vx / 20), vy - 26 * (SAFE.vy / 20), 52 * (SAFE.vx / 20), 52 * (SAFE.vy / 20));
    ctx.globalAlpha = 1;
    const clamp = (v) => Math.max(-1, Math.min(1, v / 20));
    ctx.beginPath();
    ctx.arc(vx + clamp(L.vx) * 26, vy - clamp(L.vy) * 26, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('VEL', vx - 26, vy + 29);
    ctx.fillText('ATT', bx - 26, by + 29);
    // Scanlines
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = 0; yy < 178; yy += 3) ctx.fillRect(0, yy, 280, 1);
    ctx.restore();
    this.panelBottom = py + ph;
  }

  drawMessage(text, W, H) {
    const { ctx } = this;
    ctx.save();
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(0,18,6,0.8)';
    ctx.fillRect(W / 2 - w / 2, H * 0.62 - 18, w, 30);
    ctx.shadowColor = PHOSPHOR;
    ctx.shadowBlur = 6;
    ctx.fillStyle = PHOSPHOR;
    ctx.fillText(text, W / 2, H * 0.62 + 2);
    ctx.restore();
  }
}
