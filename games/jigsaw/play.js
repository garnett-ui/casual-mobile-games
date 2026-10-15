// One jigsaw in play. The picture fills the screen as fully as possible while
// leaving a border all round for the loose pieces. Drag a piece near its
// spot and it snaps in. Positions are kept as fractions of the screen so the
// puzzle survives rotation and resizing.
import { gridFor, makeEdges, pieceSides, tracePiece, isEdgePiece, TAB } from './puzzle.js';
import { rng } from '../../js/lib/random.js';

const BORDER = 0.11; // share of each screen side kept free around the picture

export class Play {
  // image: a decoded image. state (optional): a saved game to resume.
  constructor(canvas, image, opts, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = image;
    this.hooks = hooks;
    this.ghost = true;
    this.edgesOnly = false;
    this.peek = false;
    this.drag = null;
    const aspect = image.width / image.height;
    const saved = opts.state;
    this.seed = saved ? saved.seed : opts.seed;
    const grid = saved ? { rows: saved.rows, cols: saved.cols } : gridFor(opts.pieces, aspect);
    this.rows = grid.rows;
    this.cols = grid.cols;
    this.edges = makeEdges(this.rows, this.cols, this.seed);
    this.pieces = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        this.pieces.push({
          row, col, sides: pieceSides(this.edges, this.rows, this.cols, row, col),
          edge: isEdgePiece(this.rows, this.cols, row, col), placed: false, fx: 0, fy: 0,
        });
      }
    }
    this.elapsed = saved ? saved.elapsed : 0;
    this.moves = saved ? saved.moves : 0;
    this.resize();
    if (saved) {
      saved.pieces.forEach((p, i) => Object.assign(this.pieces[i], p));
      // Saved order = stacking order.
      this.order = saved.order || this.pieces.map((_, i) => i);
    } else {
      this.order = this.pieces.map((_, i) => i);
      this.scatter(false);
    }
    this.bindInput();
    this.started = performance.now();
    this.tick = setInterval(() => this.hooks.onTime?.(this.time()), 1000);
    this.dirty = true;
    const loop = () => {
      if (this.dirty) this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.report();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.tick);
    this.unbind();
  }

  time() {
    return this.elapsed + (this.done ? 0 : (performance.now() - this.started) / 1000);
  }

  placedCount() {
    return this.pieces.filter((p) => p.placed).length;
  }

  report() {
    this.hooks.onState?.({ placed: this.placedCount(), total: this.pieces.length });
  }

  state() {
    return {
      seed: this.seed, rows: this.rows, cols: this.cols, elapsed: this.time(), moves: this.moves,
      pieces: this.pieces.map(({ placed, fx, fy }) => ({ placed, fx, fy })), order: this.order,
    };
  }

  // ------------------------------------------------------------- layout

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    // Biggest picture that leaves a border on every side.
    const mx = Math.max(28, W * BORDER);
    const my = Math.max(28, H * BORDER);
    const aspect = this.image.width / this.image.height;
    let bw = W - 2 * mx;
    let bh = bw / aspect;
    if (bh > H - 2 * my) {
      bh = H - 2 * my;
      bw = bh * aspect;
    }
    this.board = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh };
    this.pw = bw / this.cols;
    this.ph = bh / this.rows;
    this.pad = Math.ceil(Math.min(this.pw, this.ph) * (TAB + 0.05));
    this.renderPieces();
    this.dirty = true;
  }

  // Pre-render every piece (picture clipped to its outline, with a bevel).
  renderPieces() {
    const { pw, ph, pad, dpr } = this;
    const sx = this.image.width / this.board.w;
    const sy = this.image.height / this.board.h;
    for (const p of this.pieces) {
      const path = new Path2D();
      tracePiece(path, pw, ph, p.sides);
      p.path = path;
      const c = document.createElement('canvas');
      c.width = Math.ceil((pw + 2 * pad) * dpr);
      c.height = Math.ceil((ph + 2 * pad) * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(pad, pad);
      g.save();
      g.clip(path);
      g.drawImage(this.image, (p.col * pw - pad) * sx, (p.row * ph - pad) * sy, (pw + 2 * pad) * sx, (ph + 2 * pad) * sy, -pad, -pad, pw + 2 * pad, ph + 2 * pad);
      g.restore();
      // Bevel: light edge top-left, dark edge bottom-right.
      g.lineWidth = Math.max(1, Math.min(pw, ph) * 0.03);
      g.save();
      g.translate(-0.6, -0.6);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.stroke(path);
      g.restore();
      g.save();
      g.translate(0.6, 0.6);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.stroke(path);
      g.restore();
      p.canvas = c;
    }
  }

  // Where a piece belongs, in screen px.
  home(p) {
    return { x: this.board.x + p.col * this.pw, y: this.board.y + p.row * this.ph };
  }

  pos(p) {
    return p.placed ? this.home(p) : { x: p.fx * this.W, y: p.fy * this.H };
  }

  // Spread loose pieces around the border, avoiding the picture where we can.
  scatter(animate = true) {
    const r = rng(this.seed + this.moves * 31 + 1);
    const { W, H, pw, ph, board } = this;
    const loose = this.pieces.filter((p) => !p.placed);
    for (const p of loose) {
      let best = null;
      for (let k = 0; k < 24; k++) {
        const x = r() * Math.max(1, W - pw);
        const y = r() * Math.max(1, H - ph);
        const overlap = Math.max(0, Math.min(x + pw, board.x + board.w) - Math.max(x, board.x)) *
          Math.max(0, Math.min(y + ph, board.y + board.h) - Math.max(y, board.y));
        if (!best || overlap < best.overlap) best = { x, y, overlap };
        if (overlap === 0) break;
      }
      p.fx = best.x / W;
      p.fy = best.y / H;
    }
    // Shuffle the stacking order of the loose pieces.
    const ids = this.order.filter((i) => !this.pieces[i].placed);
    for (let k = ids.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [ids[k], ids[j]] = [ids[j], ids[k]];
    }
    this.order = [...this.order.filter((i) => this.pieces[i].placed), ...ids];
    this.dirty = true;
    if (animate) this.hooks.onChange?.();
  }

  // ------------------------------------------------------------- input

  bindInput() {
    const c = this.canvas;
    const hit = new OffscreenCanvasLike().ctx;
    const pick = (x, y) => {
      for (let k = this.order.length - 1; k >= 0; k--) {
        const p = this.pieces[this.order[k]];
        if (p.placed || (this.edgesOnly && !p.edge)) continue;
        const { x: px, y: py } = this.pos(p);
        const lx = x - px;
        const ly = y - py;
        if (lx < -this.pad || ly < -this.pad || lx > this.pw + this.pad || ly > this.ph + this.pad) continue;
        // Inside the outline, or close enough to it for a fingertip.
        if (hit.isPointInPath(p.path, lx, ly) || (lx > 0 && ly > 0 && lx < this.pw && ly < this.ph)) return p;
      }
      return null;
    };
    const point = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e) => {
      if (this.drag || this.done) return;
      e.preventDefault();
      this.hooks.onInteract?.();
      const { x, y } = point(e);
      const p = pick(x, y);
      if (!p) return;
      c.setPointerCapture?.(e.pointerId);
      const idx = this.pieces.indexOf(p);
      this.order = [...this.order.filter((i) => i !== idx), idx];
      const at = this.pos(p);
      this.drag = { p, id: e.pointerId, dx: x - at.x, dy: y - at.y };
      this.hooks.sfx?.('tap');
      this.dirty = true;
    };
    const move = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const { x, y } = point(e);
      const p = this.drag.p;
      p.fx = Math.max(-this.pw * 0.5, Math.min(this.W - this.pw * 0.5, x - this.drag.dx)) / this.W;
      p.fy = Math.max(-this.ph * 0.5, Math.min(this.H - this.ph * 0.5, y - this.drag.dy)) / this.H;
      this.dirty = true;
    };
    const up = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const p = this.drag.p;
      this.drag = null;
      this.moves++;
      this.drop(p);
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }

  // Snap into place when dropped close enough to its spot.
  drop(p) {
    const at = this.pos(p);
    const home = this.home(p);
    const tol = Math.max(14, Math.min(this.pw, this.ph) * 0.32);
    if (Math.hypot(at.x - home.x, at.y - home.y) < tol) this.place(p);
    this.dirty = true;
    this.hooks.onChange?.();
  }

  place(p) {
    p.placed = true;
    const idx = this.pieces.indexOf(p);
    this.order = [idx, ...this.order.filter((i) => i !== idx)];
    this.hooks.sfx?.('snap');
    this.hooks.haptic?.(15);
    this.report();
    if (this.placedCount() === this.pieces.length) {
      this.elapsed = this.time();
      this.done = true;
      this.hooks.onWin?.({ time: this.elapsed, moves: this.moves, pieces: this.pieces.length });
    }
  }

  // ------------------------------------------------------------- drawing

  draw() {
    this.dirty = false;
    const { ctx, dpr, W, H, board } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Table and frame
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(board.x - 3, board.y - 3, board.w + 6, board.h + 6);
    ctx.fillStyle = '#20263f';
    ctx.fillRect(board.x, board.y, board.w, board.h);
    if (this.ghost || this.peek) {
      ctx.globalAlpha = this.peek ? 1 : 0.18;
      ctx.drawImage(this.image, board.x, board.y, board.w, board.h);
      ctx.globalAlpha = 1;
    }
    if (this.peek) return;
    for (const i of this.order) {
      const p = this.pieces[i];
      if (!p.placed && this.edgesOnly && !p.edge && this.drag?.p !== p) continue;
      const { x, y } = this.pos(p);
      const lifted = this.drag?.p === p;
      if (!p.placed) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = lifted ? 14 : 4;
        ctx.shadowOffsetY = lifted ? 6 : 2;
      }
      const s = lifted ? 1.06 : 1;
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      ctx.drawImage(p.canvas, x - this.pad - (cw * (s - 1)) / 2, y - this.pad - (ch * (s - 1)) / 2, cw * s, ch * s);
      if (!p.placed) ctx.restore();
    }
  }
}

// A tiny canvas context just for isPointInPath hit tests.
class OffscreenCanvasLike {
  constructor() {
    this.ctx = document.createElement('canvas').getContext('2d');
  }
}
