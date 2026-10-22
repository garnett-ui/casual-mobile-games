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
    this.pose = 0; // the rider's drawn lean, eased toward the input
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
    // The rider's body follows the lean a beat behind, so a twitch of the
    // controls doesn't jerk it about.
    this.pose += ((B.lean ?? 0) - this.pose) * Math.min(1, dt * 9);
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
    const scale = W / (wide ? 15.5 : 10);
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
    paintBike(ctx, B, this.pose);
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
// The rider stands on the pegs and leans by `pose` (1 = back, -1 =
// forward). Shared with the card picture on the hub.
const INK = '#1d1b22';
const RED_DARK = '#9d1b25';
const RED_LIGHT = '#ff8f98';
const JERSEY = ['#2a9d8f', '#1b6b61']; // near side, far side
const PANTS = ['#264653', '#16303a'];
const METAL = '#a7adb5';

// Two-bone reach: where the joint goes between a root and a tip, given the
// two bone lengths. The joint sits to the left of the line root -> tip, which
// is above it for an arm reaching forward and down and in front of it for a
// leg reaching down. The reach is clamped so a limb never straightens past
// its length (the tip returned is where the limb actually gets to), and
// `flat` shortens the bend for an elbow that also flares out of the picture.
const reach = (a, b, l1, l2, flat = 1) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const far = Math.hypot(dx, dy) || 1e-6;
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(far, (l1 + l2) * 0.995));
  const ux = dx / far;
  const uy = dy / far;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along)) * flat;
  return [[a[0] + ux * along - uy * out, a[1] + uy * along + ux * out], [a[0] + ux * d, a[1] + uy * d]];
};

// Piecewise between the three poses: over the bars, neutral, and back.
const byPose = (pose, fwd, mid, back) => (pose < 0 ? mid + (mid - fwd) * pose : mid + (back - mid) * pose);

export function paintBike(ctx, B, pose = B.lean ?? 0) {
  const p = Math.max(-1, Math.min(1, pose));
  const spin = B.spin ?? 0;
  const rx = -BASE / 2;
  const fx = BASE / 2;
  const ay = -COM; // axle height
  const trace = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  // Strokes the current path; a dashed one (knobs, teeth, coils) has square
  // ends so the dashes stay apart.
  const stroke = (width, colour, dash = []) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.setLineDash(dash);
    ctx.lineCap = dash.length ? 'butt' : 'round';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  };
  const line = (pts, width, colour, dash) => {
    trace(pts);
    stroke(width, colour, dash);
  };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const finish = (fill, edge, width) => {
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) stroke(width, edge);
  };
  const shape = (pts, fill, edge = INK, width = 0.012) => {
    trace(pts);
    ctx.closePath();
    finish(fill, edge, width);
  };
  const disc = (x, y, r, fill, edge = null, width = 0.01) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    finish(fill, edge, width);
  };
  // A ring of tyre knobs or sprocket teeth, turning with the wheel.
  const teeth = (x, y, r, width, colour, count, turn) => {
    const gap = (Math.PI * 2 * r) / count;
    ctx.beginPath();
    ctx.arc(x, y, r, turn, turn + Math.PI * 2);
    stroke(width, colour, [gap * 0.55, gap * 0.45]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The rider's pose: hips slide along the seat, the torso pitches, the head
  // stays level to look ahead. Feet stay on the pegs and hands on the grips.
  const peg = [-0.06, -0.36];
  const ankle = [peg[0] - 0.03, peg[1] + 0.07];
  const grip = [0.3, 0.47];
  const hip = [byPose(p, -0.18, -0.22, -0.4), byPose(p, 0.45, 0.52, 0.3)];
  const tilt = byPose(p, 0.7, 0.45, 0.2); // torso from upright, radians
  const shoulder = [hip[0] + 0.5 * Math.sin(tilt), hip[1] + 0.5 * Math.cos(tilt)];
  const nod = tilt * 0.4;
  const head = [shoulder[0] + 0.25 * Math.sin(nod), shoulder[1] + 0.25 * Math.cos(nod)];
  const leg = (h, a, colour, boot) => {
    const [knee, foot] = reach(h, a, 0.44, 0.44);
    line([h, knee], 0.16, colour[0]);
    line([knee, foot], 0.125, colour[0]);
    line([mix(knee, foot, 0.4), foot], 0.13, boot);
    disc(knee[0] + 0.02, knee[1], 0.065, colour[1]); // knee guard
    shape([[foot[0] - 0.08, foot[1] + 0.03], [foot[0] + 0.045, foot[1] + 0.035], [foot[0] + 0.15, foot[1] - 0.07], [foot[0] - 0.09, foot[1] - 0.09]], boot, INK, 0.012);
    line([[foot[0] - 0.09, foot[1] - 0.09], [foot[0] + 0.15, foot[1] - 0.08]], 0.028, INK); // sole
  };
  const arm = (s, g, colour) => {
    const [elbow, hand] = reach(s, g, 0.36, 0.34, 0.55);
    line([s, elbow], 0.105, colour);
    line([elbow, hand], 0.088, colour);
    disc(hand[0], hand[1], 0.047, INK); // glove
  };

  // The far leg and arm, behind the bike and in shadow.
  leg([hip[0] + 0.04, hip[1]], [ankle[0] + 0.05, ankle[1]], PANTS.slice().reverse(), '#b9bec4');
  arm([shoulder[0] + 0.04, shoulder[1]], [grip[0] + 0.05, grip[1] + 0.01], JERSEY[1]);

  // Wheels: knobbly tyres, rims, crossed spokes and hubs.
  const wheel = (x, y, turn, rear) => {
    disc(x, y, 0.3, '#2b2b30');
    teeth(x, y, 0.317, 0.046, INK, 26, turn);
    disc(x, y, 0.255, '#dbe6ef');
    disc(x, y, 0.235, '#dbe6ef', METAL, 0.022);
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = turn + (i * Math.PI) / 10;
      const b = a + (i % 2 ? 0.55 : -0.55);
      ctx.moveTo(x + Math.cos(a) * 0.045, y + Math.sin(a) * 0.045);
      ctx.lineTo(x + Math.cos(b) * 0.23, y + Math.sin(b) * 0.23);
    }
    stroke(0.008, '#6c737b');
    if (rear) {
      disc(x, y, 0.12, '#4a4d52', INK);
      teeth(x, y, 0.13, 0.025, '#4a4d52', 30, turn);
      for (let i = 0; i < 5; i++) {
        const a = turn + (i * Math.PI * 2) / 5;
        disc(x + Math.cos(a) * 0.075, y + Math.sin(a) * 0.075, 0.022, '#dbe6ef');
      }
    } else {
      disc(x, y, 0.1, 'rgba(0,0,0,0)', '#8d949c', 0.03); // brake disc
    }
    disc(x, y, 0.05, '#6c737b', INK);
    disc(x, y, 0.018, '#e9ecef');
  };
  const fork = (dx, near) => {
    const axle = [fx + dx, ay];
    const top = [0.31 + dx, 0.22];
    line([axle, mix(axle, top, 0.45)], 0.075, near ? '#2b2b30' : INK); // slider
    line([mix(axle, top, 0.4), top], 0.05, near ? '#d7dde3' : '#8d949c'); // stanchion
  };
  fork(0.035, false);
  wheel(rx, ay, -spin, true);
  wheel(fx, ay, -spin * 0.97, false);

  // Chain from the gearbox sprocket to the rear one, then the swingarm and
  // its shock on top.
  const box = [-0.04, -0.4];
  line([[box[0], box[1] + 0.045], [rx, ay + 0.135], [rx, ay - 0.135], [box[0], box[1] - 0.045]], 0.018, '#3a3d42');
  const pivot = [-0.14, -0.38];
  shape([[pivot[0], pivot[1] + 0.045], [rx, ay + 0.03], [rx - 0.03, ay], [rx, ay - 0.03], [pivot[0], pivot[1] - 0.045]], '#3d4148');
  line([[pivot[0] - 0.02, pivot[1] + 0.02], [rx + 0.05, ay + 0.015]], 0.012, '#8d949c');
  const shockLow = [-0.36, -0.43];
  const shockTop = [-0.2, -0.02];
  line([shockLow, shockTop], 0.04, '#5a5f66');
  line([mix(shockLow, shockTop, 0.2), mix(shockLow, shockTop, 0.8)], 0.07, '#f4b400', [0.014, 0.014]); // spring

  // The engine: crankcase, a finned cylinder leaning forward, a skid plate
  // underneath, and the pipe curling down from the cylinder and back to the
  // silencer.
  shape([[-0.16, -0.22], [0.13, -0.2], [0.2, -0.33], [0.1, -0.46], [-0.14, -0.45], [-0.2, -0.33]], '#6c737b');
  disc(-0.03, -0.37, 0.065, '#8d949c', INK); // clutch cover
  disc(box[0], box[1], 0.04, '#3a3d42');
  shape([[-0.06, -0.21], [0.11, -0.2], [0.17, -0.02], [0.02, -0.02]], '#8d949c');
  for (let i = 1; i < 5; i++) line([[-0.06 + i * 0.03, -0.205 + i * 0.045], [0.11 + i * 0.012, -0.2 + i * 0.045]], 0.012, '#5a5f66');
  shape([[0.24, -0.36], [0.12, -0.5], [-0.14, -0.5], [-0.18, -0.45], [0.1, -0.45]], '#c9d0d6'); // skid plate
  const pipe = [[0.15, -0.06], [0.27, -0.16], [0.28, -0.29], [0.18, -0.36], [-0.12, -0.3], [-0.3, -0.24], [-0.46, -0.1]];
  line(pipe, 0.055, '#5c4330');
  line(pipe, 0.022, '#c9925a');
  line([[-0.46, -0.1], [-0.9, -0.01]], 0.1, '#3a3d42'); // silencer
  line([[-0.47, -0.1], [-0.89, -0.015]], 0.065, '#8d949c');
  line([[-0.5, -0.075], [-0.86, 0.005]], 0.014, '#e3e8ec');

  // Frame: twin spars from the steering head to the swingarm pivot, a down
  // tube to the front of the engine and a subframe for the seat.
  const headTop = [0.3, 0.2];
  const headLow = [0.36, 0.06];
  line([headTop, [-0.12, -0.04], pivot], 0.075, RED_DARK);
  line([headTop, [-0.12, -0.04], pivot], 0.05, FRAME);
  line([headLow, [0.22, -0.3]], 0.045, FRAME);
  line([[-0.12, -0.04], [-0.55, 0.07]], 0.04, RED_DARK);
  line([headTop, headLow], 0.08, RED_DARK);

  // Plastics: rear mudguard, side panel with a number, slim seat, and the
  // small tank with its shadow and a highlight.
  shape([[-0.22, 0.06], [-0.6, 0.11], [-0.98, 0.09], [-0.96, 0.05], [-0.6, 0.04], [-0.3, -0.04]], FRAME, RED_DARK);
  shape([[-0.16, 0.02], [-0.5, 0.06], [-0.44, -0.16], [-0.2, -0.14]], '#f4f1e8', RED_DARK, 0.02);
  line([[-0.38, -0.01], [-0.28, -0.01], [-0.35, -0.12]], 0.022, INK); // the number 7
  line([[-0.25, -0.01], [-0.25, -0.12]], 0.022, INK); // and a 1: rider 71
  shape([[0.02, 0.13], [-0.1, 0.16], [-0.56, 0.17], [-0.6, 0.12], [-0.1, 0.09]], '#25252b', null);
  line([[-0.1, 0.152], [-0.52, 0.163]], 0.012, '#4a4a52');
  disc(0.1, 0.03, 0.09, 'rgba(0,0,0,0.25)'); // shadow under the tank
  shape([[0.3, 0.12], [0.24, 0.24], [0.05, 0.24], [-0.06, 0.14], [0.06, 0.06], [0.24, 0.06]], FRAME, RED_DARK, 0.016);
  line([[0.08, 0.215], [0.22, 0.215]], 0.025, RED_LIGHT);

  // Front end: near fork, mudguard, triple clamps, number plate and bars.
  fork(0, true);
  shape([[0.47, -0.17], [0.62, -0.15], [0.86, -0.22], [0.85, -0.26], [0.62, -0.2], [0.48, -0.21]], FRAME, RED_DARK);
  line([[0.27, 0.22], [0.37, 0.22]], 0.035, '#4a4d52');
  line([[0.32, 0.08], [0.41, 0.08]], 0.035, '#4a4d52');
  shape([[0.38, 0.05], [0.46, 0.08], [0.45, 0.26], [0.37, 0.25]], FRAME, RED_DARK, 0.014);
  line([[0.31, 0.22], [0.35, 0.36], [grip[0] - 0.02, grip[1] - 0.02]], 0.042, '#2b2b30');
  line([[grip[0] + 0.005, grip[1]], [grip[0] + 0.1, grip[1] - 0.07]], 0.016, '#8d949c'); // brake lever

  // The rider: near leg, body, near arm, then the helmet on top.
  leg(hip, ankle, PANTS, '#eef0f2');
  line([peg, [peg[0] + 0.08, peg[1]]], 0.035, METAL); // footpeg
  const t = [Math.sin(tilt), Math.cos(tilt)];
  const f = [Math.cos(tilt), -Math.sin(tilt)]; // across the body, to the chest
  const at = (o, a, b) => [o[0] + t[0] * a + f[0] * b, o[1] + t[1] * a + f[1] * b];
  const torso = [[-0.02, -0.105], [0.17, -0.13], [0.36, -0.125], [0.48, -0.08], [0.55, 0], [0.52, 0.08], [0.39, 0.125], [0.19, 0.095], [0.03, 0.09]];
  shape(torso.map(([a, b]) => at(hip, a, b)), JERSEY[0], '#164f48', 0.014);
  shape([at(hip, -0.045, -0.105), at(hip, 0.025, 0.09), at(hip, 0.095, 0.09), at(hip, 0.085, -0.125)], PANTS[0], null);
  line([at(hip, 0.275, -0.125), at(hip, 0.31, 0.105)], 0.04, '#f4f1e8'); // jersey stripe
  line([at(shoulder, 0, 0.02), [head[0] - 0.02, head[1] - 0.07]], 0.07, '#e0b07a'); // neck
  arm(shoulder, grip, JERSEY[0]);

  // Helmet: shell with a stripe, peak, goggles and strap, and a chin bar.
  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.rotate(-nod * 0.5);
  ctx.scale(0.95, 0.95);
  disc(0, 0, 0.15, '#f8f9fa', INK, 0.014);
  line([[0, 0.115], [-0.07, 0.093], [-0.11, 0.035], [-0.115, -0.01]], 0.035, FRAME);
  shape([[0.02, 0.13], [0.24, 0.1], [0.22, 0.065], [0.06, 0.07]], FRAME, RED_DARK); // peak
  shape([[0.1, -0.06], [0.2, -0.07], [0.2, -0.13], [0.07, -0.15]], '#d9dde2', INK); // chin bar
  line([[-0.15, 0.03], [0.06, 0.02]], 0.035, '#f4b400'); // goggle strap
  shape([[0.06, 0.055], [0.165, 0.045], [0.16, -0.035], [0.06, -0.025]], '#273c55', INK); // goggle lens
  line([[0.085, 0.03], [0.13, 0.025]], 0.012, 'rgba(255,255,255,0.7)');
  ctx.restore();
}
