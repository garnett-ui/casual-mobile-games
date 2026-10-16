// Lunar Lander in play: camera, rendering (lander, terrain, Earthrise, retro
// instrument panel, explosion) and the thruster controls.
import { step, newLander, heightAt, flightPath, G, SAFE, FEET, TRACK_DT } from './engine.js';
import { rng } from '../../js/lib/random.js';

const PHOSPHOR = '#3dff7a';

// Flights are drawn as dots at equal times, so they bunch up where the
// craft went slowly and spread out where it went fast. How many seconds
// apart: enough that at a walking pace (2 m/s) they don't run together at
// this scale (pixels per metre).
const DOT_TIMES = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20];
function dotEvery(scale, gap = 6) {
  return DOT_TIMES.find((s) => 2 * s * scale >= gap) ?? 20;
}
// The timed samples (those with a speed) of a recorded path, every `every`
// seconds.
function timedDots(path, every) {
  const k = Math.max(1, Math.round(every / TRACK_DT));
  return path.filter((p) => p.length > 2).filter((_, i) => i % k === 0);
}

// Scenery cut from Apollo 8's "Earthrise" photo (NASA, public domain): the
// Earth, the far lunar horizon, and a seamless tile of the surface.
const photo = (name) => {
  const img = new Image();
  img.src = new URL(`./img/${name}.webp`, import.meta.url).href;
  return img;
};
const EARTH = photo('earth'); // disc centre (183, 183), diameter 342 px
const HORIZON = photo('horizon');
const REGOLITH = photo('regolith');
const ready = (img) => img.complete && img.naturalWidth > 0;
const TILE_M = 70; // metres of ground per surface tile
const DEG = 180 / Math.PI;

export class Play {
  constructor(canvas, level, hooks, { intro = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.input = { thrust: false, left: false, right: false };
    this.assist = true; // stability assist: rotation springs back to level; drift damped
    this.paused = false;
    this.timeScale = 1; // the browser tests fast-forward flights
    this.makeScenery();
    this.reset();
    this.resize();
    // Before the first flight: a fly-over of the course, from the whole
    // route, to the base, and back to the lander on its pad.
    if (intro) {
      this.intro = { t: 0, dur: 5.4 };
      this.level.route ??= flightPath(this.level);
    }
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
    this.flagAt = 0; // when the flag goes up (after a landing)
    this.track = []; // where this flight has been, for the replay after a crash
    this.trackT = 0;
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

  // Try again after a crash: the fly-over again, this time with the path you
  // flew drawn in red, ending where (and saying how) you crashed.
  retry() {
    const path = this.track.slice();
    const reason = this.crashInfo?.reason;
    this.reset();
    this.lastTry = path.length > 1 ? { path, reason } : null;
    this.intro = { t: 0, dur: this.lastTry ? 6.4 : 5.4 };
  }

  skipIntro() {
    if (!this.intro) return;
    this.intro = null;
    this.cam = null;
  }

  update(dt) {
    if (this.intro) {
      this.intro.t += dt / this.timeScale;
      if (this.intro.t >= this.intro.dur) this.skipIntro();
      return;
    }
    const L = this.L;
    if (!this.outcome || this.outcome.kind === 'touchdown') {
      const was = L.landed;
      // Physics in fixed small steps for stability.
      let res = null;
      const n = Math.ceil(dt / (1 / 120));
      for (let k = 0; k < n && !res; k++) {
        // Tests can fly with an autopilot that steers every physics step.
        if (this.pilot) Object.assign(this.input, this.pilot(this.level, L));
        res = step(this.level, L, { ...this.input, assist: this.assist && !this.pilot }, dt / n);
      }
      if (!L.landed) {
        this.trackT += dt;
        if (this.trackT >= TRACK_DT || !this.track.length) {
          this.trackT = Math.min(TRACK_DT, Math.max(0, this.trackT - TRACK_DT));
          this.track.push([L.x, L.y, Math.hypot(L.vx, L.vy)]);
        }
      }
      if (res) {
        this.outcome = res;
        if (res.kind === 'crash') {
          this.track.push([L.x, L.y]);
          this.crashInfo = { reason: res.reason };
          this.explode();
        }
        else if (res.kind === 'landed') {
          this.track.push([L.x, L.y]);
          this.hooks.onSound?.('stop');
          this.hooks.sfx?.('contact');
          // The flag pops out of the hatch to a fanfare; then the score.
          this.flagAt = performance.now() + 350;
          setTimeout(() => this.hooks.sfx?.('fanfare'), 350);
          setTimeout(() => this.hooks.onLanded?.(res), 2600);
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
    if (this.intro) return this.introCamera();
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
    // Never let the lander climb up behind the instrument panel.
    const covered = (this.panelBottom || 0) / this.cssH;
    this.cam.bottom = Math.max(this.cam.bottom, L.y + 8 - this.cam.h * (1 - covered - 0.03));
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
    // Earth hangs in the open sky left of the instrument panel.
    const free = W - Math.min(W * 0.66, 300) - 8;
    const er = Math.max(4, Math.min(Math.min(W, H) * 0.14, free * 0.5 - 12));
    this.drawEarth(free * 0.5 - cam.left * 0.01, Math.max(er + 16, H * 0.2), er);
    this.drawHorizon(cam, W, H);

    // Terrain
    const x0 = Math.max(0, cam.left - 10);
    const x1 = Math.min(this.level.width, cam.left + W / cam.scale + 10);
    ctx.beginPath();
    ctx.moveTo(sx(x0), H + 20);
    for (let x = x0; x <= x1; x += Math.max(1, 2 / cam.scale)) ctx.lineTo(sx(x), sy(heightAt(this.level, x)));
    ctx.lineTo(sx(x1), H + 20);
    ctx.closePath();
    const ground = ctx.createLinearGradient(0, sy(this.level.maxH), 0, H);
    if (ready(REGOLITH)) {
      // The photo's surface, pinned to the world so it scrolls with the camera,
      // shaded darker with depth.
      this.regolith ??= ctx.createPattern(REGOLITH, 'repeat');
      const k = (TILE_M * cam.scale) / REGOLITH.naturalWidth;
      this.regolith.setTransform(new DOMMatrix([k, 0, 0, k, sx(0), sy(0)]));
      ctx.fillStyle = this.regolith;
      ctx.fill();
      ground.addColorStop(0, 'rgba(255,255,255,0.06)');
      ground.addColorStop(1, 'rgba(0,0,0,0.5)');
    } else {
      ground.addColorStop(0, '#a6a6aa');
      ground.addColorStop(1, '#3d3e44');
    }
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.strokeStyle = 'rgba(236,233,224,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += Math.max(1, 2 / cam.scale)) {
      if (x === x0) ctx.moveTo(sx(x), sy(heightAt(this.level, x)));
      else ctx.lineTo(sx(x), sy(heightAt(this.level, x)));
    }
    ctx.stroke();
    this.drawRocks(sx, sy, x0, x1, ground);
    for (const c of this.craters) {
      if (c.x < x0 - 10 || c.x > x1 + 10) continue;
      if (this.level.rocks?.some((p) => c.x > p.x0 - c.r && c.x < p.x1 + c.r)) continue;
      const gy = heightAt(this.level, c.x);
      ctx.fillStyle = 'rgba(30,30,30,0.16)';
      ctx.beginPath();
      ctx.ellipse(sx(c.x), sy(gy - c.r * 0.35), c.r * cam.scale, c.r * c.d * cam.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,238,230,0.22)';
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

    if (this.intro) this.drawIntro(sx, sy, W, H, cam);
    else this.drawBaseMarker(sx, sy, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawPanel(W);
    if (this.message) this.drawMessage(this.message.text, W, H);
  }

  // The far lunar horizon from the photo, behind the terrain; it pans slowly
  // across once over the whole level.
  drawHorizon(cam, W, H) {
    if (!ready(HORIZON)) return;
    const { ctx } = this;
    const w = Math.max(W * 1.5, H * 0.9);
    const h = (w * HORIZON.naturalHeight) / HORIZON.naturalWidth;
    const span = Math.max(1, this.level.width - W / cam.scale);
    const pan = Math.max(0, Math.min(1, cam.left / span));
    const x = -pan * (w - W);
    // Sinks a little as the lander climbs.
    const y = H * 0.5 + Math.min(H * 0.25, Math.max(0, cam.bottom) * 0.15 * cam.scale);
    // Below the strip (whose bottom fades out) the surface carries on in
    // the tile, smaller with distance.
    if (ready(REGOLITH)) {
      this.farRegolith ??= ctx.createPattern(REGOLITH, 'repeat');
      const k = w / REGOLITH.naturalWidth / 1.4;
      this.farRegolith.setTransform(new DOMMatrix([k, 0, 0, k, x, y + h * 0.6]));
      ctx.fillStyle = this.farRegolith;
    } else {
      ctx.fillStyle = '#7f7d73';
    }
    ctx.fillRect(x, y + h * 0.6, w, H);
    ctx.drawImage(HORIZON, x, y, w, h);
    // Darker than the near ground, so the terrain you fly over stands out.
    const shade = ctx.createLinearGradient(0, y, 0, y + h * 0.4);
    shade.addColorStop(0, 'rgba(0,0,6,0.2)');
    shade.addColorStop(1, 'rgba(0,0,6,0.42)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, w, H); // (over black sky it makes no difference)
  }

  drawEarth(x, y, r) {
    const { ctx } = this;
    if (ready(EARTH)) {
      const s = (2 * r) / 342;
      ctx.drawImage(EARTH, x - 183 * s, y - 183 * s, EARTH.naturalWidth * s, EARTH.naturalHeight * s);
      return;
    }
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
    if (this.flagAt) this.drawFlag((performance.now() - this.flagAt) / 1000, lw);
    ctx.restore();
  }

  // Overhanging rock (cave roofs, the mountain over a tunnel, a cavern's
  // roof): the hollow beneath in deep shadow, then the rock in the same
  // regolith as the ground, lit along its top and dark along its underside.
  drawRocks(sx, sy, x0, x1, shade) {
    const { ctx, level } = this;
    for (const p of level.rocks || []) {
      if (p.x1 < x0 - 10 || p.x0 > x1 + 10) continue;
      const xs = p.lo.map((_, k) => p.x0 + k * level.step);
      const trace = (ys, reverse) => {
        const ks = xs.map((_, k) => k);
        if (reverse) ks.reverse();
        ks.forEach((k, j) => (j || reverse ? ctx.lineTo(sx(xs[k]), sy(ys[k])) : ctx.moveTo(sx(xs[k]), sy(ys[k]))));
      };
      ctx.beginPath();
      trace(p.lo);
      trace(xs.map((x, k) => Math.min(p.lo[k], heightAt(level, x))), true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,10,0.55)';
      ctx.fill();
      ctx.beginPath();
      trace(p.lo);
      trace(p.hi, true);
      ctx.closePath();
      if (this.regolith) {
        ctx.fillStyle = this.regolith;
        ctx.fill();
      }
      ctx.fillStyle = shade;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(236,233,224,0.75)';
      ctx.beginPath();
      trace(p.hi);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,20,26,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      trace(p.lo);
      ctx.stroke();
    }
  }

  // The Stars and Stripes, popping up out of the hatch on a telescoping mast
  // and unfurling. Like the Apollo flags it hangs from a crossbar (there's no
  // air to hold it out), rippling from the jolt and slowly settling.
  // In the lander's own frame: metres, y up is negative.
  drawFlag(t, lw) {
    if (t <= 0) return;
    const { ctx } = this;
    const u = Math.min(1, t / 0.45);
    const pop = 1 - (1 - u) ** 3 + Math.sin(u * Math.PI) * 0.12;
    const mx = -0.3;
    const top = -5.2 - 4.4 * pop;
    ctx.strokeStyle = '#eceef2';
    ctx.lineWidth = Math.max(lw * 1.3, 0.12);
    ctx.beginPath();
    ctx.moveTo(mx, -5.0);
    ctx.lineTo(mx, top);
    ctx.stroke();
    const f = Math.max(0, Math.min(1, (t - 0.3) / 0.45));
    if (!f) return;
    const fw = 2.9 * (1 - (1 - f) ** 2);
    const fh = 1.55;
    const amp = 0.05 + 0.2 * Math.exp(-t * 0.7);
    const wave = (d) => Math.sin(d * 6 - t * 4.5) * amp * d;
    const cols = 16;
    for (let c = 0; c < cols; c++) {
      const d = (c + 0.5) / cols;
      const x0 = mx + (fw * c) / cols;
      const w = fw / cols + 0.02;
      const y0 = top + 0.1 + wave(d);
      for (let k = 0; k < 13; k++) {
        ctx.fillStyle = k % 2 ? '#ffffff' : '#c8102e';
        ctx.fillRect(x0, y0 + (fh * k) / 13, w, fh / 13 + 0.01);
      }
      if (d < 0.4) {
        ctx.fillStyle = '#0a3161';
        ctx.fillRect(x0, y0, w, (fh * 7) / 13);
      }
      // Shade the folds: darker where the cloth turns away.
      const slope = Math.cos(d * 6 - t * 4.5) * amp * 3;
      ctx.fillStyle = slope > 0 ? `rgba(0,0,0,${Math.min(0.3, slope * 0.6)})` : `rgba(255,255,255,${Math.min(0.15, -slope * 0.3)})`;
      ctx.fillRect(x0, y0, w, fh);
    }
    // Stars: a few white dots on the blue.
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const d = ((c + 0.5 + (r % 2) * 0.4) / 5.4) * 0.4;
        ctx.beginPath();
        ctx.arc(mx + fw * d, top + 0.1 + wave(d) + ((r + 0.6) * (fh * 7) / 13) / 4.2, 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The crossbar along the top.
    ctx.strokeStyle = '#eceef2';
    ctx.lineWidth = Math.max(lw, 0.08);
    ctx.beginPath();
    ctx.moveTo(mx, top + 0.1);
    for (let i = 1; i <= 8; i++) ctx.lineTo(mx + (fw * i) / 8, top + 0.1 + wave(i / 8));
    ctx.stroke();
  }

  // A small map of the whole flight -- the ground, the launch pad, the base
  // and the route flown -- for the score card.
  routeSvg() {
    const { level } = this;
    const path = this.track;
    const auto = (level.route ??= flightPath(level));
    const xs = [level.startPad.x0, level.startPad.x1, level.base.x0, level.base.x1, ...path.map(([x]) => x), ...auto.map(([x]) => x)];
    const x0 = Math.min(...xs) - 12;
    const x1 = Math.max(...xs) + 12;
    const ground = [];
    for (let x = x0; x < x1 + level.step; x += level.step) ground.push([Math.min(x, x1), heightAt(level, Math.min(x, x1))]);
    const rocks = (level.rocks || []).filter((p) => p.x1 > x0 && p.x0 < x1);
    const ys = [...ground.map(([, y]) => y), ...path.map(([, y]) => y + 5), ...auto.map(([, y]) => y + 5), ...rocks.flatMap((p) => p.hi)];
    const lo = Math.min(...ys) - 10;
    const hi = Math.max(...ys) + 8;
    const W = 300;
    const H = Math.round(Math.max(70, Math.min(120, (W * (hi - lo)) / (x1 - x0))));
    const X = (x) => (((x - x0) / (x1 - x0)) * W).toFixed(1);
    const Y = (y) => (H - ((y - lo) / (hi - lo)) * H).toFixed(1);
    const pts = (list) => list.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
    const pad = (p, colour) => `<line x1="${X(p.x0)}" y1="${Y(p.y)}" x2="${X(p.x1)}" y2="${Y(p.y)}" stroke="${colour}" stroke-width="3" stroke-linecap="round"/>`;
    // Equal-time dots (see dotEvery), for your flight and the autopilot's.
    const every = dotEvery(Math.min(W / (x1 - x0), H / (hi - lo)), 4.5);
    const dotted = (list, r, fill, line) => {
      const ds = timedDots(list, every);
      return `<polyline points="${pts(list.filter((q) => q.length > 2))}" fill="none" stroke="${line}" stroke-width="1"/>`
        + ds.map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${r}" fill="${fill}"/>`).join('');
    };
    const [ex, ey] = path.length ? path[path.length - 1] : [(level.base.x0 + level.base.x1) / 2, level.base.y];
    const fx = +X(ex);
    const fy = +Y(ey);
    return `<svg class="ll-route" viewBox="0 0 ${W} ${H}" role="img" aria-label="The route you flew">
      <rect width="${W}" height="${H}" fill="#0b0e24"/>
      <polygon points="0,${H} ${pts(ground)} ${W},${H}" fill="#5b5f6e"/>
      <polyline points="${pts(ground)}" fill="none" stroke="#9aa0b4" stroke-width="1"/>
      ${rocks.map((p) => {
        const top = p.hi.map((y, k) => [p.x0 + k * level.step, y]);
        const under = p.lo.map((y, k) => [p.x0 + k * level.step, y]).reverse();
        return `<polygon points="${pts([...top, ...under])}" fill="#5b5f6e" stroke="#9aa0b4" stroke-width="1"/>`;
      }).join('')}
      ${pad(level.startPad, '#cfd3dc')}${pad(level.base, '#3dff7a')}
      ${dotted(auto, 1.3, 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)')}
      ${dotted(path, 2.1, '#ffd23f', 'rgba(255,210,63,0.35)')}
      <line x1="${fx}" y1="${fy}" x2="${fx}" y2="${fy - 16}" stroke="#fff" stroke-width="1.2"/>
      <rect x="${fx}" y="${fy - 16}" width="11" height="7" fill="#c8102e"/>
      <rect x="${fx}" y="${fy - 14}" width="11" height="1.2" fill="#fff"/><rect x="${fx}" y="${fy - 11.6}" width="11" height="1.2" fill="#fff"/>
      <rect x="${fx}" y="${fy - 16}" width="4.5" height="3.8" fill="#0a3161"/>
      <g font-size="10" font-weight="700" font-family="system-ui, sans-serif">
        <circle cx="12" cy="12" r="3" fill="#ffd23f"/><text x="19" y="15.5" fill="#ffd23f">YOU</text>
        <circle cx="50" cy="12" r="2.2" fill="rgba(255,255,255,0.6)"/><text x="57" y="15.5" fill="#cfd3dc">AUTOPILOT</text>
        <text x="${W - 8}" y="15.5" fill="#cfd3dc" text-anchor="end">a dot every ${every} s</text>
      </g>
    </svg>`;
  }

  // When the base is off screen, an arrow at the edge points to it.
  // Camera keyframes for the fly-over: the whole course, the base close up,
  // then the lander on its pad (exactly where the flight's camera starts).
  introCamera() {
    const { level, L, cssW, cssH } = this;
    const lo = Math.min(...level.terrain);
    const hi = Math.max(level.maxH, ...level.route.map(([, y]) => y), ...(this.lastTry?.path || []).map(([, y]) => y));
    const fitW = (level.width * 1.04 * cssH) / cssW;
    // (On a short landscape screen the panel covers most of the height; then
    // just keep the course clear of the bottom.)
    const fitH = (hi - lo + 25) / Math.max(0.5, 1 - 0.27 - (this.panelBottom || 0) / cssH - 0.04);
    const hA = Math.max(fitW, fitH);
    // Keyframes as view centre (x, y) and height h, in metres.
    const at = (x, h, bottom) => ({ x, h, y: bottom + h / 2 });
    const A = at(level.width / 2, hA, lo - hA * 0.27);
    this.overviewScale = cssH / hA;
    const b = level.base;
    const B = at((b.x0 + b.x1) / 2, 70, b.y - 70 * 0.27);
    const ground = heightAt(level, L.x);
    const C = at(L.x, 55, Math.min(ground, L.y) - 55 * 0.27);
    const t = this.intro.t;
    const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
    // Zoom in log scale; `swoop` pulls back out (toward the overview)
    // part way, so the view rises over the mountains instead of through them.
    const mix = (P, Q, u, swoop = 0) => {
      const arc = swoop * Math.sin(Math.PI * u);
      const h = Math.exp(Math.log(P.h) + (Math.log(Q.h) - Math.log(P.h)) * u);
      if (!swoop) {
        // Zooming in on Q: keep it gliding steadily to the middle of the
        // screen (its offset in screen terms shrinks linearly) rather than
        // letting it slide off the edge.
        const k = (h * (1 - u)) / P.h;
        return { x: Q.x - (Q.x - P.x) * k, y: Q.y - (Q.y - P.y) * k, h };
      }
      const y = P.y + (Q.y - P.y) * u;
      return { x: P.x + (Q.x - P.x) * u, h: h + (A.h * 0.85 - h) * arc, y: y + (A.y - y) * arc };
    };
    const hold = this.lastTry ? 1 : 0; // a second longer on the overview for a replay
    const tt = Math.max(0, t - hold);
    const k = t < 1.8 + hold ? A : tt < 3.0 ? mix(A, B, ease((tt - 1.8) / 1.2)) : tt < 3.6 ? B : mix(B, C, ease((tt - 3.6) / 1.6), 1);
    k.bottom = k.y - k.h / 2;
    const scale = cssH / k.h;
    return { scale, left: k.x - cssW / scale / 2, bottom: k.bottom };
  }

  // The fly-over's route line and labels.
  drawIntro(sx, sy, W, H, cam) {
    const { ctx, level } = this;
    const t = this.intro.t;
    const show = Math.min(1, t / 0.5) * Math.min(1, (this.intro.dur - t) / 0.6);
    ctx.save();
    ctx.globalAlpha = show;
    // Dots at equal times along each flight, spaced for the overview.
    const every = dotEvery(this.overviewScale || 1);
    const r = Math.max(2, Math.min(4, cam.scale * 0.9));
    const dots = (path, frac, colour, line) => {
      const pts = timedDots(path, every);
      const m = Math.max(1, Math.floor(pts.length * frac));
      // A faint line through them to keep the shape where they're far apart.
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.slice(0, m).forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y + 2.6)) : ctx.moveTo(sx(x), sy(y + 2.6))));
      ctx.stroke();
      ctx.fillStyle = colour;
      for (const [x, y] of pts.slice(0, m)) {
        ctx.beginPath();
        ctx.arc(sx(x), sy(y + 2.6), r, 0, Math.PI * 2);
        ctx.fill();
      }
      return pts.slice(0, m);
    };
    // The route, drawn on progressively during the overview, with its speed
    // marked every so often.
    const shown = dots(level.route, Math.min(1, t / 1.6), 'rgba(255,214,90,0.95)', 'rgba(255,214,90,0.3)');
    {
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const apart = 85 / (this.overviewScale || 1); // metres between labels
      const pads = [level.startPad, level.base].map((q) => (q.x0 + q.x1) / 2);
      let last = null;
      for (const [x, y, v] of shown) {
        if (v < 1.5 || (last && Math.hypot(x - last[0], y - last[1]) < apart)) continue;
        if (pads.some((px) => Math.abs(sx(x) - sx(px)) < 45)) continue; // clear of START and BASE

        last = [x, y];
        const text = `${Math.round(v)} m/s`;
        const lx = sx(x) + r + 3;
        const ly = sy(y + 2.6) - 9;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(text, lx, ly);
      }
    }
    const label = (text, x, y) => {
      ctx.font = '800 13px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2, y - 26, w, 20);
      ctx.fillStyle = '#ffd65a';
      ctx.fillText(text, x, y - 9);
    };
    // Your last try, in red dots, drawn on alongside the route.
    if (this.lastTry) {
      const path = this.lastTry.path;
      const frac = Math.min(1, t / 1.8);
      dots(path, frac, 'rgba(255,90,70,0.95)', 'rgba(255,90,70,0.35)');
      if (frac >= 1) {
        const [cx, cy] = path[path.length - 1];
        const x = sx(cx);
        const y = sy(cy + 2.6);
        ctx.strokeStyle = '#ff5a46';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - 7);
        ctx.lineTo(x + 7, y + 7);
        ctx.moveTo(x + 7, y - 7);
        ctx.lineTo(x - 7, y + 7);
        ctx.stroke();
        if (this.lastTry.reason) {
          ctx.font = '700 12px ui-monospace, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          const text = this.lastTry.reason.toUpperCase();
          const w = ctx.measureText(text).width + 12;
          const lx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x));
          ctx.fillStyle = 'rgba(60,0,0,0.75)';
          ctx.fillRect(lx - w / 2, y - 32, w, 18);
          ctx.fillStyle = '#ffb4a8';
          ctx.fillText(text, lx, y - 17);
        }
      }
    }
    label('START', sx((level.startPad.x0 + level.startPad.x1) / 2), sy(level.startPad.y + 7));
    label('▼ BASE', sx((level.base.x0 + level.base.x1) / 2), sy(level.base.y + 4));
    // Caption
    const dist = Math.round((level.base.x0 + level.base.x1) / 2 - (level.startPad.x0 + level.startPad.x1) / 2);
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cap = this.lastTry ? 'Red: your last try · yellow: a good route' : `Mission ${level.n}: ${dist} m to the base`;
    const sub = `A dot every ${every} s: close together = slow · tap to skip`;
    const w = Math.max(ctx.measureText(cap).width, (ctx.font = '600 12px system-ui, sans-serif', ctx.measureText(sub).width)) + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    // Above the thrust buttons; on a wide screen, down between them.
    const cy = W > H ? H - 36 : Math.min(H * 0.8, H - 150);
    ctx.fillRect(W / 2 - w / 2, cy - 18, w, 44);
    ctx.fillStyle = '#fff';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(cap, W / 2, cy - 2);
    ctx.fillStyle = '#d6d8e4';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(sub, W / 2, cy + 16);
    ctx.restore();
  }

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
  // The instruments: only what you need to land, big enough to read.
  // Is there ground between here and the base higher than the lander is
  // now? (The ALT readout flashes: you'll have to climb to get there.)
  blocked() {
    const { level, L } = this;
    const b = level.base;
    if (L.x >= b.x0 && L.x <= b.x1) return false;
    const to = L.x < b.x0 ? b.x0 : b.x1;
    const dir = Math.sign(to - L.x);
    for (let x = L.x; (to - x) * dir > 0; x += dir * level.step) {
      if (heightAt(level, x) > L.y) return true;
    }
    return false;
  }

  drawPanel(W) {
    const { ctx } = this;
    const L = this.L;
    const pw = Math.min(W * 0.66, 300);
    const k = pw / 250;
    const ph = 168 * k;
    const px = W - pw - 8;
    const py = 8;
    const RED = '#ff4d3d';
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(0,18,6,0.74)';
    ctx.strokeStyle = 'rgba(61,255,122,0.6)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(0, 0, 250, 168);
    ctx.strokeRect(0.5, 0.5, 249, 167);
    ctx.shadowColor = PHOSPHOR;
    ctx.shadowBlur = 5;
    ctx.textBaseline = 'middle';
    const base = this.level.base;
    const dist = (base.x0 + base.x1) / 2 - L.x;
    // Height above the base -- negative (with a proper minus) when you're
    // down in a valley below it.
    const alt = L.y - base.y;
    const altText = (h) => {
      const t = Math.abs(h).toFixed(Math.abs(h) < 20 ? 1 : 0);
      return h < 0 && Number(t) > 0 ? `−${t}` : t;
    };
    const flying = !L.landed;
    const rows = [
      ['TARGET', `${dist >= 0 ? '▶' : '◀'} ${Math.abs(dist).toFixed(0)} M`, PHOSPHOR],
      // Green while climbing, red while sinking.
      ['ALT', `${altText(alt)} M`, flying && L.vy < -0.05 ? RED : PHOSPHOR, flying && this.blocked()],
      ['V/S', `${L.vy >= 0 ? '▲' : '▼'} ${Math.abs(L.vy).toFixed(1)}`, flying && -L.vy > SAFE.vy ? RED : PHOSPHOR],
      // Green while drifting toward the base, red while drifting away.
      ['H/S', `${L.vx >= 0 ? '▶' : '◀'} ${Math.abs(L.vx).toFixed(1)}`, flying && Math.abs(L.vx) > 0.05 && L.vx * dist < 0 ? RED : PHOSPHOR],
    ];
    // Flashing: a few times a second, the value dims.
    const flashOff = Math.floor(performance.now() / 180) % 2 === 1;
    rows.forEach(([label, value, colour, flash], i) => {
      const y = 18 + i * 27;
      ctx.fillStyle = PHOSPHOR;
      ctx.shadowColor = PHOSPHOR;
      ctx.textAlign = 'left';
      ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(label, 10, y);
      ctx.fillStyle = colour;
      ctx.shadowColor = colour;
      ctx.textAlign = 'right';
      ctx.font = '700 19px ui-monospace, Menlo, Consolas, monospace';
      if (flash && flashOff) ctx.globalAlpha = 0.2;
      ctx.fillText(value, 165, y);
      ctx.globalAlpha = 1;
    });
    // Fuel bar
    const frac = L.fuel / L.fuelMax;
    const low = frac < 0.15;
    ctx.fillStyle = low ? RED : PHOSPHOR;
    ctx.strokeStyle = low ? RED : PHOSPHOR;
    ctx.shadowColor = ctx.fillStyle;
    ctx.textAlign = 'left';
    ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('FUEL', 10, 130);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(52, 123, 113, 14);
    if (!low || Math.floor(performance.now() / 300) % 2) ctx.fillRect(54, 125, 109 * frac, 10);
    // Artificial horizon: red past 10° (too tilted to land).
    const tilted = Math.abs(L.angle) > SAFE.angle;
    const col = tilted ? RED : PHOSPHOR;
    const bx = 208;
    const by = 58;
    const R = 34;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(bx, by, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(bx, by);
    ctx.rotate(-L.angle);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-R, 0, 2 * R, R);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(-R, 0);
    ctx.lineTo(R, 0);
    // ±10° marks
    for (const m of [-1, 1]) {
      const a = m * SAFE.angle;
      ctx.moveTo(Math.sin(a) * (R - 9), -Math.cos(a) * (R - 9));
      ctx.lineTo(Math.sin(a) * (R - 1), -Math.cos(a) * (R - 1));
    }
    ctx.stroke();
    ctx.restore();
    // The craft: fixed wings in the middle.
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(bx - 18, by);
    ctx.lineTo(bx - 6, by);
    ctx.lineTo(bx, by + 6);
    ctx.lineTo(bx + 6, by);
    ctx.lineTo(bx + 18, by);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '700 15px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`${Math.abs(Math.round(L.angle * DEG))}°`, bx, by + R + 20);
    // Turn indicator: a curved arrow round the bottom of the horizon, green
    // up the right side when turning right (clockwise) and red up the left
    // when turning left, like a ship's starboard and port lights; longer the
    // faster the turn. Then the rate in °/s, signed.
    {
      const rate = L.omega * DEG; // degrees per second, + clockwise
      const r = R + 7;
      if (Math.abs(rate) > 0.3) {
        const dir = rate > 0 ? -1 : 1; // which way round from the bottom
        const sweep = Math.max(0.15, Math.min(1, Math.abs(rate) / 30)) * Math.PI * 0.55;
        const a0 = Math.PI / 2;
        const a1 = a0 + dir * sweep;
        const c = rate > 0 ? '#3dff7a' : '#ff4d3d';
        ctx.strokeStyle = c;
        ctx.fillStyle = c;
        ctx.shadowColor = c;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(bx, by, r, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
        // Arrowhead along the direction of travel.
        const px = bx + r * Math.cos(a1);
        const py = by + r * Math.sin(a1);
        const tx = -Math.sin(a1) * dir;
        const ty = Math.cos(a1) * dir;
        ctx.beginPath();
        ctx.moveTo(px + tx * 8, py + ty * 8);
        ctx.lineTo(px - tx * 2 - ty * 6, py - ty * 2 + tx * 6);
        ctx.lineTo(px - tx * 2 + ty * 6, py - ty * 2 - tx * 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = Math.abs(rate) < 0.3 ? PHOSPHOR : rate > 0 ? '#3dff7a' : '#ff4d3d';
      ctx.shadowColor = ctx.fillStyle;
      ctx.textAlign = 'center';
      ctx.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
      const shown = Math.round(rate);
      ctx.fillText(`${shown > 0 ? '+' : shown < 0 ? '−' : '±'}${Math.abs(shown)}°/s`, bx, by + R + 36);
    }
    if (this.assist) {
      ctx.fillStyle = PHOSPHOR;
      ctx.shadowColor = PHOSPHOR;
      ctx.textAlign = 'left';
      ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('ASSIST', 10, 156);
    }
    // Scanlines
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let yy = 0; yy < 168; yy += 3) ctx.fillRect(0, yy, 250, 1);
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
