// Morse Rain: letters fall like Scrabble tiles, each one sounding its Morse
// code as it comes into view -- face down, so it's the sound you go by. Tap
// a tile on the board with the letter you heard: it's gone (and so is the
// falling one), and the tiles above it drop down. A tile nobody answers
// lands face up (now you can see what it was), and stays. Tap the wrong
// letter and a copy of the right one drops in. Last through the lesson
// without a column reaching the top.
import { CODE, UNIT, duration } from './code.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LEGEND = 30; // height of the strip of the lesson's letters, at the top

export class Play {
  constructor(canvas, spec, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.spec = spec;
    this.hooks = hooks;
    this.paused = true;
    this.timeScale = 1;
    this.reset();
    this.resize();
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
    this.t = 0;
    this.next = 0; // the next of the lesson's letters to send
    this.nextAt = 0.6; // when
    this.quietAt = 0; // when the sounder's free (a letter's gap after the last)
    this.stacks = null; // per column, bottom first (set up in resize)
    this.falling = [];
    this.bursts = [];
    this.right = 0;
    this.wrong = 0;
    this.missed = 0;
    this.over = null;
    this.last = null; // the letter last sent
    this.ids = 0;
    this.noSound = false;
    if (this.cols) this.stacks = Array.from({ length: this.cols }, () => []);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    // Columns of square tiles, as big as sensible.
    const cols = clamp(Math.floor(this.W / 64), 5, 9);
    const size = Math.min(84, this.W / cols);
    if (this.cols !== cols) {
      this.cols = cols;
      this.stacks = Array.from({ length: cols }, () => []);
      this.falling = [];
    }
    this.size = size;
    this.x0 = (this.W - size * cols) / 2;
    this.top = LEGEND;
    this.floor = this.H - 6;
    this.rows = Math.max(4, Math.floor((this.floor - this.top) / size));
  }

  // ------------------------------------------------------------- the game

  // How far the tiles fall each second: the height of the board in the
  // lesson's fall time.
  get speed() {
    return (this.floor - this.top) / this.spec.fall;
  }

  // The resting y (top) of the k-th tile up a column.
  restY(k) {
    return this.floor - (k + 1) * this.size;
  }

  sound(ch) {
    const ok = this.hooks.morse?.(CODE[ch]);
    if (ok === false) this.noSound = true;
    const d = duration(CODE[ch]);
    this.quietAt = Math.max(this.quietAt, this.t) + d + 3 * UNIT;
    return d;
  }

  // A column to drop into: any with room, at random.
  column() {
    const open = this.stacks.map((s, c) => [s.length + this.falling.filter((f) => f.col === c).length, c]).filter(([n]) => n < this.rows);
    if (!open.length) return -1;
    return open[Math.floor(Math.random() * open.length)][1];
  }

  drop(ch, penalty = false) {
    const col = this.column();
    if (col < 0) return this.lose();
    this.falling.push({ id: this.ids++, ch, col, y: this.top - this.size, penalty, sounding: penalty ? 0 : duration(CODE[ch]) });
  }

  update(dt) {
    this.t += dt;
    const { spec } = this;
    // The next letter, when its time comes and the last has finished
    // sounding.
    if (this.next < spec.letters.length && this.t >= this.nextAt && this.t >= this.quietAt) {
      const ch = spec.letters[this.next++];
      this.last = ch;
      const d = this.sound(ch);
      this.drop(ch);
      this.nextAt = this.t + Math.max(spec.gap, d + 3 * UNIT);
    }
    for (const f of this.falling) {
      f.sounding = Math.max(0, f.sounding - dt);
      // (One you could have answered: its letter was on the board while it fell.)
      if (!f.penalty && !f.fair) f.fair = this.stacks.some((s) => s.some((t) => t.ch === f.ch));
    }
    // Falling; landing on the stack (face up, from now on).
    for (const f of [...this.falling]) {
      const stack = this.stacks[f.col];
      const rest = this.restY(stack.length);
      f.y = Math.min(rest, f.y + this.speed * dt);
      if (f.y >= rest) {
        this.falling.splice(this.falling.indexOf(f), 1);
        if (stack.length >= this.rows) return this.lose();
        stack.push({ id: f.id, ch: f.ch, dy: 0, penalty: f.penalty });
        if (!f.penalty && f.fair) this.missed++;
        this.hooks.sfx?.('tile');
        if (stack.length >= this.rows) return this.lose();
      }
    }
    // Tiles settling after one below them has gone.
    for (const s of this.stacks) for (const tile of s) tile.dy = Math.max(0, tile.dy - this.speed * 1.5 * dt);
    for (const b of this.bursts) b.t += dt;
    this.bursts = this.bursts.filter((b) => b.t < 0.5);
    for (const s of this.stacks) for (const tile of s) if (tile.shake) tile.shake = Math.max(0, tile.shake - dt);
    // The lesson's over when every letter's been sent and come down.
    if (this.next >= spec.letters.length && !this.falling.length && !this.over) this.finish();
  }

  // A tap on a tile on the board: the letter just heard (that one's
  // falling, unanswered)? Gone, both of them. The wrong one? The right one
  // drops in (and sounds again).
  answer(col, k) {
    const stack = this.stacks[col];
    const tile = stack[k];
    const waiting = this.falling.filter((f) => !f.penalty);
    const match = waiting.find((f) => f.ch === tile.ch);
    if (match) {
      this.right++;
      this.falling.splice(this.falling.indexOf(match), 1);
      this.bursts.push({ x: this.colX(col), y: this.restY(k) - tile.dy, t: 0, good: true });
      this.bursts.push({ x: this.colX(match.col), y: match.y, t: 0, good: true });
      stack.splice(k, 1);
      for (let j = k; j < stack.length; j++) stack[j].dy += this.size;
      this.hooks.sfx?.('pop');
      this.hooks.haptic?.(15);
      return true;
    }
    if (!waiting.length) {
      // Nothing to answer just now.
      tile.shake = 0.3;
      return false;
    }
    this.wrong++;
    tile.shake = 0.4;
    const want = waiting[0].ch;
    this.hooks.sfx?.('buzz');
    this.hooks.haptic?.(40);
    this.sound(want);
    this.drop(want, true);
    return false;
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
    // (Scored on the letters you could have answered: those whose letter was
    // on the board while they fell.)
    return { won, right: this.right, wrong: this.wrong, missed: this.missed, chances: this.right + this.missed, total: this.spec.letters.length, left: this.stacks.reduce((a, s) => a + s.length, 0) };
  }

  // ------------------------------------------------------------- input

  colX(c) {
    return this.x0 + c * this.size;
  }

  bindInput() {
    const c = this.canvas;
    const down = (e) => {
      if (this.paused || this.over) return;
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const col = Math.floor((x - this.x0) / this.size);
      if (col < 0 || col >= this.cols) return;
      e.preventDefault();
      // A falling tile: hear it again.
      const f = this.falling.find((q) => q.col === col && y >= q.y && y < q.y + this.size);
      if (f) {
        if (!f.penalty) {
          this.sound(f.ch);
          f.sounding = duration(CODE[f.ch]);
        }
        return;
      }
      const stack = this.stacks[col];
      const k = Math.floor((this.floor - y) / this.size);
      if (k >= 0 && k < stack.length) this.answer(col, k);
    };
    c.addEventListener('pointerdown', down);
    this.unbind = () => c.removeEventListener('pointerdown', down);
  }

  // ------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, W, H, size } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f3d2e');
    g.addColorStop(1, '#0a2a20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Columns, faintly.
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let c = 0; c < this.cols; c += 2) ctx.fillRect(this.colX(c), this.top, size, this.floor - this.top);
    // Danger: a column nearly to the top.
    const high = Math.max(...this.stacks.map((s) => s.length));
    if (high >= this.rows - 2) {
      ctx.fillStyle = `rgba(229,56,59,${0.25 + 0.15 * Math.sin(time * 8)})`;
      ctx.fillRect(this.x0, this.top, size * this.cols, size * 0.4);
    }
    for (let c = 0; c < this.cols; c++) {
      this.stacks[c].forEach((tile, k) => {
        const shake = tile.shake ? Math.sin(time * 60) * 4 * tile.shake : 0;
        this.drawTile(this.colX(c) + shake, this.restY(k) - tile.dy, tile.ch, { penalty: tile.penalty, bad: tile.shake > 0.3 });
      });
    }
    for (const f of this.falling) {
      if (f.penalty) this.drawTile(this.colX(f.col), f.y, f.ch, { penalty: true });
      else this.drawBack(this.colX(f.col), f.y, f.sounding > 0, time);
    }
    this.drawLegend();
    for (const b of this.bursts) {
      const u = b.t / 0.5;
      ctx.strokeStyle = `rgba(120,255,170,${1 - u})`;
      ctx.lineWidth = 3;
      const grow = u * size * 0.4;
      ctx.strokeRect(b.x + 3 - grow, b.y + 3 - grow, size - 6 + grow * 2, size - 6 + grow * 2);
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

  // The lesson's letters across the top (the new ones bright), with their
  // codes.
  drawLegend() {
    const { ctx, W, spec } = this;
    const list = spec.fresh.length ? spec.fresh : spec.alphabet.length <= 10 ? spec.alphabet : [];
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, LEGEND - 2);
    ctx.textBaseline = 'middle';
    if (!list.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`All ${spec.alphabet.length} characters · ${spec.wpm} words a minute`, W / 2, LEGEND / 2);
      return;
    }
    const each = Math.min(110, W / list.length);
    list.forEach((ch, k) => {
      const cx = (W - each * list.length) / 2 + each * k + each / 2;
      ctx.fillStyle = '#ffe9b0';
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(ch, cx - 6, LEGEND / 2);
      this.drawCode(cx - 2, LEGEND / 2, CODE[ch], 3, '#ffe9b0');
    });
  }

  // Dots and dashes, left-aligned at x, centred on y, each dit u wide.
  drawCode(x, y, code, u, colour) {
    const { ctx } = this;
    ctx.fillStyle = colour;
    for (const s of code) {
      const w = s === '.' ? u : u * 3;
      ctx.beginPath();
      ctx.roundRect(x, y - u / 2, w, u, u / 2);
      ctx.fill();
      x += w + u;
    }
  }

  // A tile, face up: the letter, and its code underneath.
  drawTile(x, y, ch, { penalty = false, bad = false } = {}) {
    const { ctx, size } = this;
    const p = 3;
    const s = size - p * 2;
    ctx.fillStyle = '#b8955c';
    ctx.beginPath();
    ctx.roundRect(x + p, y + p + 2, s, s, s * 0.12);
    ctx.fill();
    ctx.fillStyle = bad ? '#f6b4b4' : penalty ? '#f3d9c9' : '#f4e4c1';
    ctx.beginPath();
    ctx.roundRect(x + p, y + p, s, s - 2, s * 0.12);
    ctx.fill();
    if (penalty) {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = '#3b2a1a';
    ctx.font = `900 ${Math.round(s * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x + size / 2, y + p + s * 0.42);
    const code = CODE[ch];
    const u = Math.max(2, s / 22);
    const width = [...code].reduce((a, c) => a + (c === '.' ? u : u * 3) + u, -u);
    this.drawCode(x + size / 2 - width / 2, y + p + s * 0.8, code, u, '#7a5a3a');
  }

  // A tile face down (falling: you hear it, you don't see it), glowing
  // while its code sounds.
  drawBack(x, y, sounding, time) {
    const { ctx, size } = this;
    const p = 3;
    const s = size - p * 2;
    if (sounding) {
      ctx.fillStyle = `rgba(255,214,90,${0.35 + 0.25 * Math.sin(time * 30)})`;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, s * 0.16);
      ctx.fill();
    }
    ctx.fillStyle = '#6e4a24';
    ctx.beginPath();
    ctx.roundRect(x + p, y + p + 2, s, s, s * 0.12);
    ctx.fill();
    ctx.fillStyle = '#a8743f';
    ctx.beginPath();
    ctx.roundRect(x + p, y + p, s, s - 2, s * 0.12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,20,0.35)';
    ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(x + p + 4, y + p + (s * k) / 4);
      ctx.bezierCurveTo(x + size / 2, y + p + (s * k) / 4 - 3, x + size / 2, y + p + (s * k) / 4 + 3, x + size - p - 4, y + p + (s * k) / 4);
      ctx.stroke();
    }
    // A little speaker: tap to hear it again.
    ctx.fillStyle = 'rgba(255,240,210,0.85)';
    const cx = x + size / 2;
    const cy = y + p + s / 2;
    const k = s / 10;
    ctx.beginPath();
    ctx.moveTo(cx - 2.2 * k, cy - k);
    ctx.lineTo(cx - k, cy - k);
    ctx.lineTo(cx + 0.6 * k, cy - 2.4 * k);
    ctx.lineTo(cx + 0.6 * k, cy + 2.4 * k);
    ctx.lineTo(cx - k, cy + k);
    ctx.lineTo(cx - 2.2 * k, cy + k);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,210,0.85)';
    ctx.lineWidth = Math.max(1.5, k * 0.5);
    ctx.beginPath();
    ctx.arc(cx + 0.8 * k, cy, 1.8 * k, -0.8, 0.8);
    ctx.stroke();
  }
}
