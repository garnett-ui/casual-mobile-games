// 15: the board. Tap (or swipe) a tile in line with the gap and it slides
// in -- and every tile between with it. Tiles show numbers on wood, part of
// a picture, or a frame of a sequence. Hold Peek to see the board solved;
// a hint makes the tile to move glow.
import { goalOf } from './solver.js';
import { PICTURES, SEQUENCES, render } from '../../js/lib/patterns.js';

const SLIDE = 0.11; // seconds for a tile to slide one place
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (t) => 1 - (1 - t) ** 3;

export class Play {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.w = level.w;
    this.h = level.h;
    this.goal = goalOf(this.w, this.h);
    this.reset();
    this.resize();
    this.bindInput();
    const loop = (now) => {
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
    this.board = this.level.board.slice();
    this.moves = []; // every move: the cell the gap moved to
    this.slides = 0; // taps or swipes (each may move several tiles)
    this.startedAt = null;
    this.won = null;
    this.anim = new Map(); // tile -> { from: [x, y] cells, t0 }
    this.glow = null; // { cell, t0 } -- a hint
    this.peek = false;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    const pad = 14;
    this.gap = 4;
    this.tile = Math.floor(Math.min((this.W - pad * 2 - this.gap * (this.w - 1)) / this.w, (this.H - pad * 2 - this.gap * (this.h - 1)) / this.h, 140));
    this.bw = this.tile * this.w + this.gap * (this.w - 1);
    this.bh = this.tile * this.h + this.gap * (this.h - 1);
    this.ox = Math.round((this.W - this.bw) / 2);
    this.oy = Math.round((this.H - this.bh) / 2);
    this.faces = this.makeFaces();
  }

  // ------------------------------------------------------------- faces

  // Each tile's face, drawn once at this size.
  makeFaces() {
    const { w, h, tile } = this;
    const px = Math.max(8, Math.round(tile * Math.min(2, this.dpr)));
    const n = w * h;
    const faces = [];
    const { kind, id, seed } = this.level.tiles;
    let picture = null;
    if (kind === 'pic') {
      // The whole picture, cut up.
      const p = PICTURES.find((q) => q.id === id) || PICTURES[0];
      const colourAt = p.make(seed);
      const full = document.createElement('canvas');
      full.width = px * w;
      full.height = px * h;
      const fctx = full.getContext('2d');
      const img = fctx.createImageData(full.width, full.height);
      render(colourAt, full.width, full.height, img.data);
      fctx.putImageData(img, 0, 0);
      picture = full;
    }
    const seq = kind === 'seq' ? SEQUENCES.find((q) => q.id === id) || SEQUENCES[0] : null;
    for (let t = 1; t < n; t++) {
      const c = document.createElement('canvas');
      c.width = c.height = px;
      const g = c.getContext('2d');
      const home = t - 1;
      if (picture) {
        g.drawImage(picture, (home % w) * px, ((home / w) | 0) * px, px, px, 0, 0, px, px);
      } else if (seq) {
        g.fillStyle = '#f4e4c1';
        g.fillRect(0, 0, px, px);
        seq.draw(g, px, home, n - 1);
      } else {
        g.fillStyle = '#f4e4c1';
        g.fillRect(0, 0, px, px);
        g.fillStyle = '#3b2a1a';
        g.font = `900 ${Math.round(px * (t > 9 ? 0.46 : 0.52))}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(t), px / 2, px / 2 + px * 0.03);
      }
      faces[t] = c;
    }
    return faces;
  }

  // ------------------------------------------------------------- moves

  cellAt(x, y) {
    const i = Math.floor((x - this.ox) / (this.tile + this.gap));
    const j = Math.floor((y - this.oy) / (this.tile + this.gap));
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  // The middle of a cell, on the canvas (for the tests).
  cellCenter(c) {
    return [this.ox + (c % this.w) * (this.tile + this.gap) + this.tile / 2, this.oy + ((c / this.w) | 0) * (this.tile + this.gap) + this.tile / 2];
  }

  // Slide the tile at cell c into the gap, with any between: true if it
  // could.
  slide(c, now = performance.now() / 1000) {
    if (this.won || c < 0) return false;
    const g = this.board.indexOf(0);
    const [gx, gy, cx, cy] = [g % this.w, (g / this.w) | 0, c % this.w, (c / this.w) | 0];
    let step;
    if (gy === cy && gx !== cx) step = Math.sign(cx - gx);
    else if (gx === cx && gy !== cy) step = Math.sign(cy - gy) * this.w;
    else return false;
    this.startedAt ??= now;
    this.slides++;
    for (let at = g + step; ; at += step) {
      const t = this.board[at];
      const gap = this.board.indexOf(0);
      this.board[gap] = t;
      this.board[at] = 0;
      this.anim.set(t, { from: [at % this.w, (at / this.w) | 0], t0: now });
      this.moves.push(at);
      this.hooks.onMove?.(at);
      if (at === c) break;
    }
    this.glow = null;
    this.hooks.sfx?.('tap');
    this.hooks.haptic?.(8);
    if (this.board.join() === this.goal.join()) {
      this.won = { at: now, time: now - this.startedAt };
      setTimeout(() => this.hooks.onWin?.(), 700);
    }
    return true;
  }

  // Glow the tile at cell c (a hint).
  showHint(c) {
    if (c === null || c === undefined) return;
    this.glow = { cell: c, t0: performance.now() / 1000 };
  }

  bindInput() {
    const cv = this.canvas;
    const down = (e) => {
      const r = cv.getBoundingClientRect();
      e.preventDefault();
      this.slide(this.cellAt(e.clientX - r.left, e.clientY - r.top));
    };
    cv.addEventListener('pointerdown', down);
    this.unbind = () => cv.removeEventListener('pointerdown', down);
  }

  // ------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, W, H, tile, gap, ox, oy } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // The tray.
    const pad = 8;
    ctx.fillStyle = '#4a3b2c';
    ctx.beginPath();
    ctx.roundRect(ox - pad, oy - pad, this.bw + pad * 2, this.bh + pad * 2, 14);
    ctx.fill();
    ctx.fillStyle = '#2e241b';
    ctx.beginPath();
    ctx.roundRect(ox - 2, oy - 2, this.bw + 4, this.bh + 4, 8);
    ctx.fill();
    const place = (cx, cy) => [ox + cx * (tile + gap), oy + cy * (tile + gap)];
    // Solved: the missing tile fades into the gap.
    const n = this.w * this.h;
    const tiles = [];
    this.board.forEach((t, c) => t && tiles.push([t, c % this.w, (c / this.w) | 0]));
    if (this.won) tiles.push([n, this.w - 1, this.h - 1, clamp((time - this.won.at) / 0.5, 0, 1)]);
    for (const [t, cx, cy, fade = 1] of tiles) {
      let [x, y] = place(cx, cy);
      const a = this.anim.get(t);
      if (a) {
        const k = clamp((time - a.t0) / SLIDE, 0, 1);
        const [fx, fy] = place(...a.from);
        x = fx + (x - fx) * ease(k);
        y = fy + (y - fy) * ease(k);
        if (k >= 1) this.anim.delete(t);
      }
      ctx.globalAlpha = fade;
      this.drawTile(t === n ? null : t, x, y, t === n);
      ctx.globalAlpha = 1;
    }
    // A hint: the tile to move, glowing.
    if (this.glow) {
      const age = time - this.glow.t0;
      if (age > 2.5) this.glow = null;
      else {
        const [x, y] = place(this.glow.cell % this.w, (this.glow.cell / this.w) | 0);
        ctx.strokeStyle = `rgba(255,214,90,${0.6 + 0.4 * Math.sin(age * 8)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(x - 2, y - 2, tile + 4, tile + 4, 10);
        ctx.stroke();
      }
    }
    // Peek: the board solved, over the top.
    if (this.peek && !this.won) {
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = '#2e241b';
      ctx.fillRect(ox - 2, oy - 2, this.bw + 4, this.bh + 4);
      for (let t = 1; t < n; t++) {
        const [x, y] = place((t - 1) % this.w, ((t - 1) / this.w) | 0);
        this.drawTile(t, x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // A tile: its face, a wooden edge, a little bevel.
  drawTile(t, x, y, last = false) {
    const { ctx, tile } = this;
    const r = Math.max(4, tile * 0.08);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 3, tile, tile, r);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x, y, tile, tile, r);
    ctx.clip();
    if (last) {
      const face = this.lastFace ??= this.makeLast();
      ctx.drawImage(face, x, y, tile, tile);
    } else ctx.drawImage(this.faces[t], x, y, tile, tile);
    ctx.lineWidth = Math.max(1.5, tile * 0.03);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(x + 1, y + tile);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + tile, y + 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,30,10,0.45)';
    ctx.beginPath();
    ctx.moveTo(x + tile - 1, y);
    ctx.lineTo(x + tile - 1, y + tile - 1);
    ctx.lineTo(x, y + tile - 1);
    ctx.stroke();
    ctx.restore();
  }

  // The tile that was never on the board, filling the gap when it's
  // solved: the picture's last corner, or a wooden tile with a star.
  makeLast() {
    const { w, h } = this;
    const px = this.faces[1].width;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    const { kind, id, seed } = this.level.tiles;
    if (kind === 'pic') {
      const p = PICTURES.find((q) => q.id === id) || PICTURES[0];
      const colourAt = p.make(seed);
      const img = g.createImageData(px, px);
      const aspect = w / h;
      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const [rr, gg, bb] = colourAt((w - 1 + (x + 0.5) / px) / w, (h - 1 + (y + 0.5) / px) / h, aspect);
          const k = (y * px + x) * 4;
          img.data[k] = rr;
          img.data[k + 1] = gg;
          img.data[k + 2] = bb;
          img.data[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    } else {
      // A star, burnt into the wood.
      g.fillStyle = '#f4e4c1';
      g.fillRect(0, 0, px, px);
      g.fillStyle = '#c8932f';
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = px * (k % 2 ? 0.14 : 0.32);
        g.lineTo(px / 2 + Math.cos(a) * rr, px / 2 + Math.sin(a) * rr);
      }
      g.fill();
    }
    return c;
  }
}
