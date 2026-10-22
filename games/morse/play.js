// Morse Rain: a cloud of letter tiles drifting about the screen. You hear
// the Morse code for one of them -- again and again, till you find it; tap
// a tile with that letter and it's gone, then the next. Tap the wrong
// letter and a copy of the right one floats in, sounding again. Clear the
// screen to win; let the cloud grow to twice its size and it's over.
import { CODE, UNIT, duration, cycle } from './code.js';
import { rng } from '../../js/lib/random.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TOP = 8; // a margin at the top

export class Play {
  constructor(canvas, spec, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.spec = spec;
    this.hooks = hooks;
    this.paused = true;
    this.timeScale = 1;
    this.resize();
    this.reset();
    this.bindInput();
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000) * this.timeScale;
      last = now;
      if (!this.paused && !this.over) this.update(dt);
      this.draw(now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  reset() {
    this.r = rng(this.spec.seed);
    this.t = 0;
    this.tiles = [];
    this.ids = 0;
    this.bursts = [];
    this.right = 0;
    this.wrong = 0;
    this.again = 0; // letters found only after hearing them more than once
    this.heard = 0; // times the letter you're listening for has sounded
    this.over = null;
    this.target = null; // the letter you're listening for
    this.askAt = 0.8; // when the next one's played
    this.sounding = 0; // until when a code is sounding
    this.noSound = false;
    this.most = this.spec.letters.length * 2; // more than this, and it's over
    for (const ch of this.spec.letters) this.add(ch);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.size = clamp(Math.min(this.W, this.H - TOP) / 6.5, 44, 76);
    this.top = TOP;
    for (const tile of this.tiles || []) this.keepIn(tile);
  }

  // ------------------------------------------------------------- the game

  // A tile, somewhere clear (or, a copy, floating in from an edge).
  add(ch, fromEdge = false) {
    const { r, size, W, H, top } = this;
    let x;
    let y;
    for (let k = 0; k < 40; k++) {
      x = size / 2 + r() * (W - size);
      y = top + size / 2 + r() * (H - top - size);
      if (this.tiles.every((q) => Math.hypot(q.x - x, q.y - y) > size * 1.15)) break;
    }
    if (fromEdge) {
      const side = Math.floor(r() * 4);
      if (side === 0) x = -size / 2;
      if (side === 1) x = W + size / 2;
      if (side === 2) y = top - size / 2;
      if (side === 3) y = H + size / 2;
    }
    const a = r() * Math.PI * 2;
    const v = this.spec.drift * (0.6 + 0.8 * r());
    const tile = { id: this.ids++, ch, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, tilt: (r() - 0.5) * 0.25, shake: 0, copy: fromEdge };
    this.tiles.push(tile);
    return tile;
  }

  sound(ch) {
    if (this.hooks.morse?.(CODE[ch]) === false) this.noSound = true;
    this.soundAt = this.t;
    this.sounding = this.t + duration(CODE[ch]);
  }

  // The next letter to listen for: one of those on the screen.
  ask() {
    const tile = this.tiles[Math.floor(this.r() * this.tiles.length)];
    this.target = tile.ch;
    this.askedAt = this.t;
    this.heard = 1;
    this.sound(tile.ch);
  }

  // Got it wrong: a copy of the right one floats in, and you hear it again.
  penalty() {
    this.add(this.target, true);
    this.sound(this.target);
    if (this.tiles.length > this.most) this.lose();
  }

  update(dt) {
    this.t += dt;
    if (!this.target && this.t >= this.askAt && this.tiles.length) this.ask();
    // Again and again, till you find it (as often as the level's pace).
    if (this.target && this.t >= this.soundAt + cycle(CODE[this.target], this.spec.pace)) {
      this.heard++;
      this.sound(this.target);
    }
    this.drift(dt);
    for (const b of this.bursts) b.t += dt;
    this.bursts = this.bursts.filter((b) => b.t < 0.5);
    for (const tile of this.tiles) tile.shake = Math.max(0, tile.shake - dt);
  }

  // Drifting about: bouncing off the edges, and nudging each other apart.
  drift(dt) {
    const { size } = this;
    for (const a of this.tiles) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      this.keepIn(a);
    }
    for (let i = 0; i < this.tiles.length; i++) {
      for (let j = i + 1; j < this.tiles.length; j++) {
        const a = this.tiles[i];
        const b = this.tiles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const gap = size * 1.08 - d;
        if (gap <= 0) continue;
        const push = Math.min(gap, size * 2 * dt) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }

  keepIn(a) {
    const h = this.size / 2;
    const [x0, x1, y0, y1] = [h, this.W - h, this.top + h, this.H - h];
    // (Copies floating in from outside come in before they bounce.)
    if (a.x < x0 && a.vx < 0) a.vx = -a.vx;
    if (a.x > x1 && a.vx > 0) a.vx = -a.vx;
    if (a.y < y0 && a.vy < 0) a.vy = -a.vy;
    if (a.y > y1 && a.vy > 0) a.vy = -a.vy;
    if (a.x < x0) a.x = Math.min(x0, a.x + this.size * 0.05);
    if (a.x > x1) a.x = Math.max(x1, a.x - this.size * 0.05);
    if (a.y < y0) a.y = Math.min(y0, a.y + this.size * 0.05);
    if (a.y > y1) a.y = Math.max(y1, a.y - this.size * 0.05);
  }

  // A tap on a tile: the letter you heard? Gone. The wrong one? A copy of
  // the right one floats in.
  answer(tile) {
    if (!this.target) return false;
    if (tile.ch === this.target) {
      this.right++;
      if (this.heard > 1) this.again++;
      this.tiles.splice(this.tiles.indexOf(tile), 1);
      this.bursts.push({ x: tile.x, y: tile.y, t: 0 });
      this.hooks.sfx?.('pop');
      this.hooks.haptic?.(15);
      this.target = null;
      this.askAt = Math.max(this.sounding, this.t) + 3 * UNIT + 0.35;
      if (!this.tiles.length) this.finish();
      return true;
    }
    this.wrong++;
    tile.shake = 0.4;
    this.hooks.sfx?.('buzz');
    this.hooks.haptic?.(40);
    this.penalty();
    return false;
  }

  // Hear it again.
  repeat() {
    if (this.target && this.t >= this.sounding) {
      this.heard++;
      this.sound(this.target);
    }
  }

  lose() {
    if (this.over) return;
    this.over = { won: false };
    this.hooks.onOver?.(this.result(false));
  }

  finish() {
    this.over = { won: true };
    this.hooks.onOver?.(this.result(true));
  }

  result(won) {
    return { won, right: this.right, wrong: this.wrong, again: this.again, total: this.spec.letters.length, left: this.tiles.length };
  }

  // The tile at (x, y), if any (the one on top).
  tileAt(x, y) {
    const h = this.size / 2;
    for (let k = this.tiles.length - 1; k >= 0; k--) {
      const q = this.tiles[k];
      if (Math.abs(x - q.x) <= h && Math.abs(y - q.y) <= h) return q;
    }
    return null;
  }

  // ------------------------------------------------------------- input

  bindInput() {
    const c = this.canvas;
    const down = (e) => {
      if (this.paused || this.over) return;
      const r = c.getBoundingClientRect();
      e.preventDefault();
      const tile = this.tileAt(e.clientX - r.left, e.clientY - r.top);
      if (tile) this.answer(tile);
      else this.repeat();
    };
    c.addEventListener('pointerdown', down);
    this.unbind = () => c.removeEventListener('pointerdown', down);
  }

  // ------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, W, H, size } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#16553f');
    g.addColorStop(1, '#0a2a20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Listening: rings from the middle while a code sounds.
    if (this.t < this.sounding) {
      for (let k = 0; k < 3; k++) {
        const u = (time * 1.2 + k / 3) % 1;
        ctx.strokeStyle = `rgba(255,214,90,${0.18 * (1 - u)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(W / 2, (H + TOP) / 2, size * (0.6 + u * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const tile of this.tiles) {
      const shake = tile.shake ? Math.sin(time * 60) * 5 * tile.shake : 0;
      this.drawTile(tile.x + shake, tile.y, tile.ch, tile.tilt, { copy: tile.copy, bad: tile.shake > 0.25 });
    }
    for (const b of this.bursts) {
      const u = b.t / 0.5;
      ctx.strokeStyle = `rgba(120,255,170,${1 - u})`;
      ctx.lineWidth = 3;
      const r = size * (0.5 + u * 0.6);
      ctx.strokeRect(b.x - r, b.y - r, r * 2, r * 2);
    }
    if (this.noSound) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = '#ffd23f';
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Turn the sound on to hear the code', W / 2, H / 2);
    }
  }

  // A Scrabble-like tile, centred on (x, y), a little tilted.
  drawTile(x, y, ch, tilt, { copy = false, bad = false } = {}) {
    const { ctx, size } = this;
    const s = size * 0.9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(-s / 2 + 2, -s / 2 + 5, s, s, s * 0.14);
    ctx.fill();
    ctx.fillStyle = '#b8955c';
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2 + 3, s, s, s * 0.14);
    ctx.fill();
    ctx.fillStyle = bad ? '#f6b4b4' : copy ? '#f3d9c9' : '#f4e4c1';
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s - 2, s * 0.14);
    ctx.fill();
    if (copy) {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = '#3b2a1a';
    ctx.font = `900 ${Math.round(s * 0.56)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 1);
    ctx.restore();
  }
}
