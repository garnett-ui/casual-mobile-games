// Trial Bike in play: the camera, the drawing (sky and far hills, the dirt,
// logs, flags and the finish, the bike and its rider, dust and exhaust), the
// course strip at the top, and the ride itself -- stepping the engine,
// crashes, checkpoints and the finish.
import { step, newBike, rider, heightAt, grounded, WHEEL, BASE, COM, VMAX, STEP } from './engine.js';
import { rng } from '../../js/lib/random.js';

const LOOK = 0.36; // the bike sits this far across the screen, looking ahead
const SKY = ['#79c3ff', '#d8ecff']; // top to horizon
const DIRT = '#8a5a2b';
const GRASS = '#5a9e3a';
const FRAME = '#e63946';
const DEG = 180 / Math.PI;

export class Play {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.input = { gas: false, brake: false, lean: 0 };
    this.paused = false;
    this.timeScale = 1; // the browser tests fast-forward rides
    this.pilot = null; // the computer rider, for the demo and the tests
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

  // Back to the start line, clock at zero.
  reset() {
    if (this.demo) {
      this.demo = false;
      this.pilot = null;
      this.timeScale = 1;
      this.hooks.onDemo?.(false);
    }
    this.B = newBike(this.level);
    this.time = 0;
    this.crashes = 0;
    this.outcome = null;
    this.waiting = false; // crashed, waiting for the tap that goes again
    this.dust = [];
    this.puffs = [];
    this.puffT = 0;
    this.shake = 0;
    this.message = null;
    this.cam = null;
    this.flagShown = -1;
    this.hooks.onState?.(this);
  }

  // After a crash: back to the last flag, with the clock where it was.
  retry() {
    const flag = this.B.flag;
    const time = this.time;
    this.B = newBike(this.level, flag >= 0 ? this.level.flags[flag] : this.level.start);
    this.time = time;
    this.outcome = null;
    this.waiting = false;
    this.message = null;
    this.dust = [];
    this.hooks.onState?.(this);
  }

  // Watch the computer rider do it, from the start.
  showMe() {
    this.reset();
    this.demo = true;
    this.pilot = (level, B) => rider(level, B, level.pace);
    this.timeScale = 1;
    this.hooks.onDemo?.(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.hooks.onMotor?.(false, 0);
  }

  // ------------------------------------------------------------- scenery

  makeScenery() {
    const r = rng(this.level.n * 131 + 5);
    // Two ranges of far hills, as bumps along a line, that slide more slowly
    // than the ground.
    const range = (count, h, w) => Array.from({ length: count }, (_, i) => ({ x: i * w + r() * w, h: h * (0.5 + r()), w: w * (0.8 + r() * 0.8) }));
    this.far = range(40, 1, 22);
    this.near = range(60, 1, 14);
    this.clouds = Array.from({ length: 10 }, () => ({ x: r() * 400, y: 0.1 + r() * 0.3, w: 30 + r() * 50 }));
    // Tufts of grass and stones along the course, drawn where the ground is.
    this.tufts = [];
    for (let x = 2; x < this.level.length; x += 1 + r() * 3) this.tufts.push({ x, k: r() < 0.3 ? 'stone' : 'tuft', s: 0.5 + r() });
  }

  // ------------------------------------------------------------ the ride

  update(dt) {
    const B = this.B;
    // After a crash the bike tumbles on for a moment, then holds still.
    if (this.outcome?.kind === 'crash' && !this.waiting && (this.tumble -= dt) > 0) {
      const n = Math.ceil(dt / (1 / 120));
      for (let k = 0; k < n; k++) step(this.level, B, this.input, dt / n);
    }
    if (!this.outcome && !this.waiting) {
      // Physics in fixed small steps for stability.
      let res = null;
      const n = Math.ceil(dt / (1 / 120));
      const wasFlag = B.flag;
      const wasAir = !grounded(B);
      const vyBefore = B.vy;
      for (let k = 0; k < n && !res; k++) {
        // The demo and the tests ride with the computer rider.
        if (this.pilot) Object.assign(this.input, this.pilot(this.level, B));
        res = step(this.level, B, this.input, dt / n);
      }
      this.time += dt;
      // Dust from the rear wheel when it spins up or the bike is moving
      // fast, and exhaust when the throttle's open.
      this.puffT += dt;
      if (this.puffT > 0.06) {
        this.puffT = 0;
        const c = B.rear;
        if (c && (c.slip || Math.abs(c.vt) > 8)) this.puff(c.px, c.py, c.slip ? 1.2 : 0.7, 'dust');
        if (B.gas && grounded(B)) {
          const [ex, ey] = this.onBike(-0.55, -0.2);
          this.puff(ex, ey, 0.5, 'smoke');
        }
      }
      // Landing after a flight: a thump and some dust.
      if (wasAir && grounded(B) && vyBefore < -3) {
        this.hooks.sfx?.('bump');
        this.hooks.haptic?.(20);
        for (let i = 0; i < 8; i++) this.puff(B.x, B.y - COM - WHEEL, 1.5, 'dust');
      }
      if (B.flag > wasFlag && B.flag > this.flagShown) {
        this.flagShown = B.flag;
        this.hooks.sfx?.('checkpoint');
        this.say('CHECKPOINT', 1.2);
      }
      if (B.stall > 1.5 && !this.message) this.say('STUCK? ↶ GOES BACK TO THE FLAG', 2.5);
      if (res) {
        this.outcome = res;
        if (res.kind === 'crash') {
          this.crashes++;
          this.shake = 1;
          this.tumble = 0.7;
          this.hooks.sfx?.('crash');
          this.hooks.haptic?.([30, 40, 60]);
          for (let i = 0; i < 24; i++) this.puff(B.x, B.y, 3, 'dust');
          setTimeout(() => this.hooks.onCrash?.(res), 700);
        } else {
          this.hooks.sfx?.('win');
          this.hooks.haptic?.(40);
          setTimeout(() => this.hooks.onFinished?.(res), 900);
        }
      }
      this.hooks.onState?.(this);
    }
    // The engine note follows the speed, with a blip for the throttle.
    const running = !this.outcome && !this.waiting;
    this.hooks.onMotor?.(running, Math.max(0, B.vx) / VMAX * 0.7 + (B.gas && running ? 0.3 : 0.05));
    for (const p of this.dust) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 3 * dt;
    }
    this.dust = this.dust.filter((p) => p.t < p.life);
    if (this.message && (this.message.t -= dt) <= 0) this.message = null;
    this.shake = Math.max(0, this.shake - dt * 2);
  }

  puff(x, y, size, kind) {
    if (this.dust.length > 120) return;
    const a = Math.random() * Math.PI;
    const v = (0.5 + Math.random()) * size;
    this.dust.push({ x, y, vx: Math.cos(a) * v * (kind === 'smoke' ? -0.6 : 1), vy: Math.abs(Math.sin(a)) * v, t: 0, life: 0.5 + Math.random() * 0.5, r: 0.08 + Math.random() * 0.12 * size, kind });
  }

  say(text, secs) {
    this.message = { text, t: secs };
  }

  // A point fixed to the bike's frame, from its centre of mass, in the world.
  onBike(lx, ly) {
    const B = this.B;
    const c = Math.cos(B.angle);
    const s = Math.sin(B.angle);
    return [B.x + lx * c - ly * s, B.y + lx * s + ly * c];
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

  // The camera follows the bike, which rides a third of the way across the
  // screen so there's room to see what's coming, and keeps the ground in
  // the lower half.
  camera() {
    const { cssW: W, cssH: H } = this;
    const B = this.B;
    const wide = W > H;
    const scale = W / (wide ? 19 : 11.5);
    const ground = heightAt(this.level, B.x + 2);
    const wantY = Math.min(B.y, ground + 1.5) - (H / scale) * (wide ? 0.42 : 0.3);
    const want = { x: B.x - (W / scale) * LOOK, bottom: wantY };
    if (!this.cam) this.cam = want;
    this.cam.x += (want.x - this.cam.x) * 0.25;
    this.cam.bottom += (want.bottom - this.cam.bottom) * 0.08;
    return { scale, left: this.cam.x, bottom: this.cam.bottom };
  }

  draw() {
    const { ctx, dpr, cssW: W, cssH: H } = this;
    const cam = this.camera();
    const sx = (x) => (x - cam.left) * cam.scale;
    const sy = (y) => H - (y - cam.bottom) * cam.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shake = this.shake * 10;
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // Sky, clouds and far hills (parallax: they slide at a fraction of the
    // ground's pace).
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, SKY[0]);
    sky.addColorStop(0.75, SKY[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const c of this.clouds) {
      const x = (((c.x - cam.left * 0.1) % 400) + 400) % 400 / 400 * (W + 160) - 80;
      const y = c.y * H;
      ctx.beginPath();
      ctx.ellipse(x, y, c.w, c.w * 0.35, 0, 0, Math.PI * 2);
      ctx.ellipse(x + c.w * 0.4, y - c.w * 0.15, c.w * 0.6, c.w * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const horizon = sy(cam.bottom + (H / cam.scale) * 0.45);
    this.drawRange(this.far, '#a9c9a0', horizon, cam, 0.2, 90);
    this.drawRange(this.near, '#7fae6e', horizon + 18, cam, 0.4, 60);

    // The ground: dirt with a grass top, from the left edge to the right.
    const x0 = Math.max(0, cam.left - 2);
    const x1 = Math.min(this.level.length, cam.left + W / cam.scale + 2);
    ctx.beginPath();
    ctx.moveTo(sx(x0), H + 20);
    for (let x = x0; x <= x1; x += STEP) ctx.lineTo(sx(x), sy(heightAt(this.level, x)));
    ctx.lineTo(sx(x1), H + 20);
    ctx.closePath();
    ctx.fillStyle = DIRT;
    ctx.fill();
    ctx.strokeStyle = GRASS;
    ctx.lineWidth = Math.max(3, 0.22 * cam.scale);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = x0; x <= x1; x += STEP) ctx.lineTo(sx(x), sy(heightAt(this.level, x)));
    ctx.stroke();
    // Tufts and stones.
    for (const t of this.tufts) {
      if (t.x < x0 || t.x > x1) continue;
      const gx = sx(t.x);
      const gy = sy(heightAt(this.level, t.x));
      if (t.k === 'stone') {
        ctx.fillStyle = '#6e6a66';
        ctx.beginPath();
        ctx.ellipse(gx, gy + 0.04 * cam.scale, 0.09 * t.s * cam.scale, 0.06 * t.s * cam.scale, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#3f8a2a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const d of [-0.06, 0, 0.06]) {
          ctx.moveTo(gx + d * cam.scale, gy);
          ctx.lineTo(gx + d * cam.scale * 1.8, gy - 0.18 * t.s * cam.scale);
        }
        ctx.stroke();
      }
    }
    // Logs lie across the course where the generator put them.
    for (const f of this.level.features) {
      if (f.kind !== 'log' || f.x1 < x0 || f.x0 > x1) continue;
      const cx = (f.x0 + f.x1) / 2;
      const top = heightAt(this.level, cx);
      const base = heightAt(this.level, f.x0);
      const r = (top - base) / 2;
      if (r <= 0) continue;
      ctx.fillStyle = '#6b4423';
      ctx.beginPath();
      ctx.arc(sx(cx), sy(base + r), r * cam.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a0713f';
      ctx.lineWidth = 1.5;
      for (const k of [0.3, 0.6, 0.85]) {
        ctx.beginPath();
        ctx.arc(sx(cx), sy(base + r), r * k * cam.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.drawFlags(cam, sx, sy, x0, x1);
    this.drawDust(sx, sy, cam.scale);
    this.drawBike(sx, sy, cam.scale);
    this.drawStrip(W);
    if (this.message) {
      ctx.font = `800 ${Math.round(Math.min(26, W * 0.04))}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillText(this.message.text, W / 2 + 2, H * 0.3 + 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(this.message.text, W / 2, H * 0.3);
    }
  }

  drawRange(hills, colour, baseY, cam, drift, px) {
    const { ctx, cssW: W } = this;
    const period = hills.length * (hills === this.far ? 22 : 14);
    const off = ((cam.left * drift) % period + period) % period;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(-20, baseY + 40);
    for (const h of hills) {
      let x = (h.x - off) * (W / period) * 1.6;
      if (x < -W * 0.3) x += period * (W / period) * 1.6;
      ctx.ellipse(x, baseY, h.w * 3, h.h * px, 0, Math.PI, 0);
    }
    ctx.lineTo(W + 20, baseY + 40);
    ctx.fill();
  }

  drawFlags(cam, sx, sy, x0, x1) {
    const { ctx } = this;
    const pole = (x, h, colour, flag) => {
      const gy = sy(heightAt(this.level, x));
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(x), gy);
      ctx.lineTo(sx(x), gy - h * cam.scale);
      ctx.stroke();
      if (flag) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(sx(x), gy - h * cam.scale);
        ctx.lineTo(sx(x) + 0.7 * cam.scale, gy - (h - 0.25) * cam.scale);
        ctx.lineTo(sx(x), gy - (h - 0.5) * cam.scale);
        ctx.fill();
      }
    };
    this.level.flags.forEach((x, i) => {
      if (x < x0 - 1 || x > x1 + 1) return;
      pole(x, 2.2, i <= this.B.flag ? '#3dff7a' : '#ffb703', true);
    });
    // The finish: a chequered banner between two poles.
    const fx = this.level.finish;
    if (fx > x0 - 1 && fx < x1 + 3) {
      pole(fx, 3, '#000', false);
      pole(fx + 2, 3, '#000', false);
      const y = sy(heightAt(this.level, fx)) - 3 * cam.scale;
      const cell = 0.25 * cam.scale;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
          ctx.fillRect(sx(fx) + i * cell, y + j * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    // The start line.
    if (this.level.start > x0 - 2) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx(this.level.start - 1), sy(heightAt(this.level, this.level.start - 1)) + 2);
      ctx.lineTo(sx(this.level.start - 1), sy(heightAt(this.level, this.level.start - 1)) - 1.2 * cam.scale);
      ctx.stroke();
    }
  }

  drawDust(sx, sy, scale) {
    const { ctx } = this;
    for (const p of this.dust) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k * (p.kind === 'smoke' ? 0.35 : 0.6);
      ctx.fillStyle = p.kind === 'smoke' ? '#9aa' : '#c9a87c';
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), (p.r + (1 - k) * 0.15) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBike(sx, sy, scale) {
    const { ctx } = this;
    const B = this.B;
    ctx.save();
    ctx.translate(sx(B.x), sy(B.y));
    ctx.rotate(-B.angle);
    ctx.scale(scale, -scale);
    paintBike(ctx, B);
    ctx.restore();
  }

  // A strip along the top: the course's profile, the flags, and where you
  // are on it.
  drawStrip(W) {
    const { ctx } = this;
    const L = this.level;
    const w = Math.min(W - 24, 520);
    const x0 = (W - w) / 2;
    const y0 = 10;
    const h = 22;
    const k = w / L.length;
    const span = Math.max(1, L.maxY - L.minY);
    ctx.fillStyle = 'rgba(22,58,82,.75)';
    ctx.beginPath();
    ctx.roundRect?.(x0 - 4, y0 - 4, w + 8, h + 8, 6);
    ctx.fill();
    ctx.fillStyle = GRASS;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h);
    for (let i = 0; i < L.heights.length; i += 4) ctx.lineTo(x0 + i * STEP * k, y0 + h - ((L.heights[i] - L.minY) / span) * h * 0.8);
    ctx.lineTo(x0 + w, y0 + h);
    ctx.fill();
    L.flags.forEach((x, i) => {
      ctx.fillStyle = i <= this.B.flag ? '#3dff7a' : '#ffb703';
      ctx.fillRect(x0 + x * k - 1, y0, 2, h);
    });
    ctx.fillStyle = '#111';
    ctx.fillRect(x0 + L.finish * k - 1, y0, 2, h);
    ctx.fillStyle = FRAME;
    ctx.beginPath();
    ctx.arc(x0 + Math.min(L.length, Math.max(0, this.B.x)) * k, y0 + h - ((heightAt(L, this.B.x) - L.minY) / span) * h * 0.8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The bike and its rider, drawn in the frame's own coordinates: metres from
// the centre of mass, x forward, y up (the caller has set the transform).
// The rider stands on the pegs and leans with the input. Shared with the
// card picture on the hub.
export function paintBike(ctx, B) {
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
const wheel = (x, y, spin) => {
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = '#222';
    ctx.beginPath();
    ctx.arc(x, y, WHEEL - 0.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = '#bbb';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = spin + (i * Math.PI) / 3;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * (WHEEL - 0.1), y + Math.sin(a) * (WHEEL - 0.1));
    }
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(x, y, 0.06, 0, Math.PI * 2);
    ctx.fill();
  };
  const rx = -BASE / 2;
  const fx = BASE / 2;
  const ay = -COM; // axle height
  wheel(rx, ay, -B.spin);
  wheel(fx, ay, -B.spin * 0.97);
  // Frame: swingarm, down tube, seat, tank, forks and bars.
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(rx, ay); // swingarm to the pegs
  ctx.lineTo(-0.1, ay + 0.1);
  ctx.lineTo(0.15, ay + 0.55); // up to the tank
  ctx.lineTo(0.5, ay + 0.6);
  ctx.lineTo(fx - 0.12, ay + 0.05); // fork
  ctx.moveTo(-0.1, ay + 0.1);
  ctx.lineTo(-0.35, ay + 0.5); // seat post
  ctx.lineTo(0.15, ay + 0.55);
  ctx.stroke();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(fx - 0.12, ay + 0.05);
  ctx.lineTo(fx - 0.3, ay + 0.95); // forks up to the bars
  ctx.stroke();
  ctx.fillStyle = FRAME;
  ctx.beginPath();
  ctx.ellipse(0.25, ay + 0.6, 0.3, 0.14, 0, 0, Math.PI * 2); // tank
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(-0.3, ay + 0.52, 0.22, 0.06, 0, 0, Math.PI * 2); // seat
  ctx.fill();
  // The rider: on the pegs, knees bent, leaning with the input; the body
  // is a thick stroke in the jersey colour, with a helmet.
  const lean = B.lean ?? 0; // 1 = back
  const hipX = -0.3 - lean * 0.25;
  const hipY = ay + 0.9;
  const shX = hipX + 0.25 - lean * 0.3;
  const shY = hipY + 0.55 - Math.abs(lean) * 0.08;
  ctx.strokeStyle = '#2a9d8f';
  ctx.lineWidth = 0.17;
  ctx.beginPath();
  ctx.moveTo(-0.05, ay + 0.12); // foot on the peg
  ctx.lineTo(hipX + 0.12, ay + 0.5); // knee
  ctx.lineTo(hipX, hipY);
  ctx.lineTo(shX, shY);
  ctx.stroke();
  ctx.strokeStyle = '#f2cc8f';
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(shX, shY); // arms to the bars
  ctx.lineTo(shX + 0.25, shY - 0.2);
  ctx.lineTo(fx - 0.32, ay + 0.98);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(shX + 0.08, shY + 0.22, 0.17, 0, Math.PI * 2); // helmet
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(shX + 0.16, shY + 0.19, 0.08, -0.6, 0.9); // visor
  ctx.fill();
}
