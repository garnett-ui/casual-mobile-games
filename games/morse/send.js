// Morse Rain, sending: letter tiles drift down the screen, Missile Command
// style. Key a letter's code by tapping anywhere (you hear your own
// sidetone, nothing else), and the cannon at the bottom fires at the lowest
// tile with that letter. Key one that isn't there and it fires off at
// nothing, the letter you sent floating up by the cannon ('?' if it wasn't
// a letter at all). A tile that reaches the ground costs a life; three, and
// it's over.
import { Keyer } from './key.js';
import { rng } from '../../js/lib/random.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The sending lesson's pace: how long a tile takes to come down, and how
// often another comes in -- unhurried to start.
export function sendPace(n) {
  return { fall: Math.max(9, 24 - 0.75 * (n - 1)), every: Math.max(1.3, 3.8 - 0.13 * (n - 1)) };
}

export class SendPlay {
  constructor(canvas, spec, hooks, { dit } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.spec = { ...spec, ...sendPace(spec.n) };
    this.hooks = hooks;
    this.keyer = new Keyer(dit ? { dit } : {});
    this.paused = true;
    this.timeScale = 1;
    this.resize();
    this.reset();
    this.bindInput();
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000) * this.timeScale;
      last = now;
      if (!this.paused && !this.over) this.update(dt, now / 1000);
      this.draw(now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
    this.hooks.tone?.(false);
  }

  reset() {
    this.r = rng(this.spec.seed);
    this.t = 0;
    this.queue = this.spec.letters.slice(); // still to come in
    this.nextAt = 0.5;
    this.tiles = [];
    this.shots = [];
    this.booms = [];
    this.notes = []; // letters sent at nothing, floating up by the cannon
    this.lives = 3;
    this.hits = 0;
    this.wrong = 0;
    this.over = null;
    this.ids = 0;
    this.aim = -Math.PI / 2;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.size = clamp(Math.min(this.W, this.H) / 7.5, 40, 68);
    this.ground = this.H - clamp(this.H * 0.09, 50, 80);
    this.gun = { x: this.W / 2, y: this.ground - 6 };
  }

  // ------------------------------------------------------------- the game

  update(dt, now) {
    this.t += dt;
    const { size } = this;
    // The next tile, from somewhere along the top.
    if (this.queue.length && this.t >= this.nextAt) {
      const ch = this.queue.shift();
      const x = size / 2 + this.r() * (this.W - size);
      this.tiles.push({ id: this.ids++, ch, x, y: -size / 2, phase: this.r() * 6.3, sway: 12 + this.r() * 20, tilt: (this.r() - 0.5) * 0.25 });
      this.nextAt = this.t + this.spec.every * (0.7 + 0.6 * this.r());
    }
    // Drifting down (and a little from side to side), apart.
    const fall = (this.ground - size / 2 + size / 2) / this.spec.fall;
    for (const a of this.tiles) {
      a.y += fall * dt;
      a.x = clamp(a.x + Math.cos(this.t * 0.9 + a.phase) * a.sway * dt, size / 2, this.W - size / 2);
    }
    for (let i = 0; i < this.tiles.length; i++) {
      for (let j = i + 1; j < this.tiles.length; j++) {
        const a = this.tiles[i];
        const b = this.tiles[j];
        const dx = b.x - a.x;
        const d = Math.hypot(dx, b.y - a.y);
        if (d < size * 1.05 && Math.abs(dx) < size) {
          const push = Math.sign(dx || 1) * Math.min(size * 1.05 - d, size * 2 * dt) / 2;
          a.x = clamp(a.x - push, size / 2, this.W - size / 2);
          b.x = clamp(b.x + push, size / 2, this.W - size / 2);
        }
      }
    }
    // Down to the ground: a life gone.
    for (const a of [...this.tiles]) {
      if (a.y + size / 2 < this.ground) continue;
      this.tiles.splice(this.tiles.indexOf(a), 1);
      this.boom(a.x, this.ground - 4, '#ff7a3d', 26);
      this.lives--;
      this.hooks.haptic?.(60);
      if (this.lives <= 0) return this.lose();
    }
    // A letter keyed.
    const ch = this.keyer.tick(now);
    if (ch) this.fire(ch);
    // Shots, homing on their tiles.
    for (const s of [...this.shots]) {
      s.t += dt;
      if (s.tile && this.tiles.includes(s.tile)) {
        const a = Math.atan2(s.tile.y - s.y, s.tile.x - s.x);
        s.vx = Math.cos(a) * s.speed;
        s.vy = Math.sin(a) * s.speed;
      }
      s.trail.push([s.x, s.y]);
      if (s.trail.length > 8) s.trail.shift();
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.tile && this.tiles.includes(s.tile) && Math.hypot(s.tile.x - s.x, s.tile.y - s.y) < size * 0.45) {
        this.tiles.splice(this.tiles.indexOf(s.tile), 1);
        this.shots.splice(this.shots.indexOf(s), 1);
        this.boom(s.tile.x, s.tile.y, '#ffd25a', 34);
        this.hits++;
        this.hooks.haptic?.(20);
      } else if (s.x < -40 || s.x > this.W + 40 || s.y < -40 || s.t > 3) this.shots.splice(this.shots.indexOf(s), 1);
    }
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter((b) => b.t < 0.7);
    for (const n of this.notes) n.t += dt;
    this.notes = this.notes.filter((n) => n.t < 2);
    const want = this.shots.at(-1);
    if (want) this.aim += (Math.atan2(want.vy, want.vx) - this.aim) * Math.min(1, dt * 20);
    if (!this.queue.length && !this.tiles.length && !this.shots.length && !this.over) this.finish();
  }

  // Fire at the lowest tile with that letter -- or, if there's none, off at
  // nothing, the letter you sent floating up by the cannon.
  fire(ch) {
    const { gun } = this;
    const tile = this.tiles.filter((a) => a.ch === ch && !this.shots.some((s) => s.tile === a)).sort((a, b) => b.y - a.y)[0];
    const speed = Math.max(700, this.H * 1.4);
    if (tile) {
      const a = Math.atan2(tile.y - gun.y, tile.x - gun.x);
      this.shots.push({ x: gun.x, y: gun.y - 18, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, tile, t: 0, trail: [] });
      return true;
    }
    this.wrong++;
    this.notes.push({ ch, t: 0, x: gun.x + (this.r() - 0.5) * 60 });
    if (ch !== '?') {
      const a = -Math.PI / 2 + (this.r() - 0.5) * 1.6;
      this.shots.push({ x: gun.x, y: gun.y - 18, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, tile: null, t: 0, trail: [] });
    }
    return false;
  }

  boom(x, y, colour, n) {
    const parts = Array.from({ length: n }, () => {
      const a = this.r() * Math.PI * 2;
      const v = 60 + this.r() * 220;
      return [Math.cos(a) * v, Math.sin(a) * v];
    });
    this.booms.push({ x, y, colour, parts, t: 0 });
  }

  lose() {
    if (this.over) return;
    this.over = { won: false };
    this.hooks.tone?.(false);
    this.hooks.onOver?.(this.result(false));
  }

  finish() {
    this.over = { won: true };
    this.hooks.tone?.(false);
    this.hooks.onOver?.(this.result(true));
  }

  result(won) {
    return { won, hits: this.hits, wrong: this.wrong, lives: this.lives, total: this.spec.letters.length, dit: this.keyer.dit };
  }

  // ------------------------------------------------------------- input

  // The key: down and up (t in seconds), with your sidetone while it's down.
  press(t) {
    if (this.paused || this.over) return;
    this.keyer.down(t);
    this.hooks.tone?.(true);
    this.keying = true;
  }

  release(t) {
    if (!this.keying) return;
    this.keying = false;
    this.keyer.up(t);
    this.hooks.tone?.(false);
  }

  bindInput() {
    const c = this.canvas;
    const down = (e) => {
      e.preventDefault();
      this.press(e.timeStamp / 1000);
    };
    const up = (e) => this.release(e.timeStamp / 1000);
    const key = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      if (e.type === 'keydown') this.press(e.timeStamp / 1000);
      else this.release(e.timeStamp / 1000);
    };
    c.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
    };
  }

  // ------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, W, H, size, gun } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1230');
    g.addColorStop(1, '#1d2a5a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Stars.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k < 40; k++) ctx.fillRect((k * 97.3) % W, (k * 61) % (this.ground * 0.9), 1.5, 1.5);
    for (const a of this.tiles) this.drawTile(a.x, a.y, a.ch, a.tilt, a.y > this.ground - size * 2.5);
    // Shots: bright tracers.
    for (const s of this.shots) {
      ctx.strokeStyle = 'rgba(255,240,170,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      s.trail.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of this.booms) {
      const u = b.t / 0.7;
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = b.colour;
      for (const [vx, vy] of b.parts) ctx.fillRect(b.x + vx * b.t, b.y + vy * b.t + 120 * b.t * b.t, 3, 3);
      ctx.strokeStyle = b.colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, size * 0.3 + u * size * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // The ground and the cannon.
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(0, this.ground, W, H - this.ground);
    ctx.fillStyle = '#3c4252';
    ctx.fillRect(0, this.ground, W, 4);
    ctx.save();
    ctx.translate(gun.x, gun.y);
    ctx.rotate(this.aim + Math.PI / 2);
    ctx.fillStyle = this.keying ? '#ffd25a' : '#9aa4b8';
    ctx.fillRect(-5, -34, 10, 30);
    ctx.restore();
    ctx.fillStyle = '#c9d1e3';
    ctx.beginPath();
    ctx.arc(gun.x, gun.y, 18, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(gun.x - 30, gun.y, 60, 8);
    // Letters sent at nothing, floating up by the cannon.
    for (const n of this.notes) {
      ctx.globalAlpha = 1 - n.t / 2;
      ctx.fillStyle = n.ch === '?' ? '#ff8a8a' : '#ffe9b0';
      ctx.font = `900 ${Math.round(size * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.ch === '?' ? '?' : `${n.ch}?`, n.x, gun.y - 50 - n.t * 40);
      ctx.globalAlpha = 1;
    }
    // Lives.
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k < this.lives ? '#ff5d73' : 'rgba(255,255,255,0.18)';
      const x = 14 + k * 24;
      const y = this.ground + (H - this.ground) / 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.bezierCurveTo(x - 12, y - 2, x - 6, y - 12, x, y - 5);
      ctx.bezierCurveTo(x + 6, y - 12, x + 12, y - 2, x, y + 6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('tap anywhere to key', W - 12, this.ground + (H - this.ground) / 2);
  }

  drawTile(x, y, ch, tilt, low) {
    const { ctx, size } = this;
    const s = size * 0.9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    if (low) {
      ctx.fillStyle = 'rgba(255,90,60,0.35)';
      ctx.beginPath();
      ctx.roundRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8, s * 0.2);
      ctx.fill();
    }
    ctx.fillStyle = '#b8955c';
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2 + 3, s, s, s * 0.14);
    ctx.fill();
    ctx.fillStyle = '#f4e4c1';
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s - 2, s * 0.14);
    ctx.fill();
    ctx.fillStyle = '#3b2a1a';
    ctx.font = `900 ${Math.round(s * 0.56)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 1);
    ctx.restore();
  }
}
