// One jigsaw in play. The picture fills the screen as fully as possible while
// leaving a border all round for the loose pieces. Pieces start scattered
// and turned; tap one to turn it a quarter, drag it near its spot (the right
// way up) and it snaps in. The picture itself stays hidden until it's done --
// hold Peek to see it in a pop-up. Positions are kept as fractions of the
// screen so the puzzle survives rotation and resizing.
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
          rot: 0, // quarter turns clockwise; must be 0 to fit
          turn: 0, // the angle drawn (eases toward rot)
        });
      }
    }
    this.elapsed = saved ? saved.elapsed : 0;
    this.moves = saved ? saved.moves : 0;
    this.resize();
    if (saved) {
      saved.pieces.forEach((p, i) => Object.assign(this.pieces[i], p, { rot: p.rot || 0, turn: p.rot || 0 }));
      // Saved order = stacking order.
      this.order = saved.order || this.pieces.map((_, i) => i);
    } else {
      this.order = this.pieces.map((_, i) => i);
      this.scatter(false);
      // Turn every piece a random way (a quarter of them happen to be right).
      const r = rng(this.seed + 7);
      for (const p of this.pieces) p.rot = p.turn = Math.floor(r() * 4);
    }
    for (const p of this.pieces) if (p.rot || p.placed) this.renderPiece(p); // re-light
    this.bindInput();
    this.started = performance.now();
    this.tick = setInterval(() => this.hooks.onTime?.(this.time()), 1000);
    this.dirty = true;
    let last = performance.now();
    const loop = (now) => {
      this.animate(Math.min(0.05, (now - last) / 1000));
      last = now;
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
      pieces: this.pieces.map(({ placed, fx, fy, rot }) => ({ placed, fx, fy, rot })), order: this.order,
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

  // Pre-render every piece: the picture clipped to its outline, with a bevel.
  renderPieces() {
    for (const p of this.pieces) {
      p.path = new Path2D();
      tracePiece(p.path, this.pw, this.ph, p.sides);
      this.renderPiece(p);
    }
  }

  // The light comes from the top left of the screen whichever way a piece is
  // turned, so the bevel is baked for the piece's current quarter turn.
  renderPiece(p) {
    const { pw, ph, pad, dpr } = this;
    const sx = this.image.width / this.board.w;
    const sy = this.image.height / this.board.h;
    const c = p.canvas || document.createElement('canvas');
    c.width = Math.ceil((pw + 2 * pad) * dpr);
    c.height = Math.ceil((ph + 2 * pad) * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, dpr * pad, dpr * pad);
    g.save();
    g.clip(p.path);
    g.drawImage(this.image, (p.col * pw - pad) * sx, (p.row * ph - pad) * sy, (pw + 2 * pad) * sx, (ph + 2 * pad) * sy, -pad, -pad, pw + 2 * pad, ph + 2 * pad);
    // Screen direction away from the light, in the piece's own frame.
    const a = (p.rot * Math.PI) / 2;
    const lx = Math.cos(a) + Math.sin(a);
    const ly = -Math.sin(a) + Math.cos(a);
    const b = Math.max(0.8, Math.min(pw, ph) * 0.03);
    g.lineJoin = 'round';
    // Inner bevel: a stroke nudged away from the light shows only along the
    // lit edges (the clip hides the rest), and the reverse for the shade.
    const bevel = (k, colour, width) => {
      g.save();
      g.translate(lx * b * k, ly * b * k);
      g.strokeStyle = colour;
      g.lineWidth = width;
      g.stroke(p.path);
      g.restore();
    };
    if (p.placed) {
      // In the picture: just a hint of relief either side of the cut.
      bevel(0.5, 'rgba(255,255,255,0.3)', 1.6);
      bevel(-0.5, 'rgba(0,0,0,0.22)', 1.6);
    } else {
      bevel(1, 'rgba(255,255,255,0.18)', 4 * b);
      bevel(1, 'rgba(255,255,255,0.38)', 2 * b);
      bevel(-1, 'rgba(0,0,0,0.16)', 4 * b);
      bevel(-1, 'rgba(0,0,0,0.32)', 2 * b);
    }
    // A fine, crisp cut line.
    g.strokeStyle = p.placed ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    g.stroke(p.path);
    g.restore();
    p.canvas = c;
  }

  // Ease each piece's drawn angle toward its quarter turn.
  animate(dt) {
    for (const p of this.pieces) {
      if (p.turn === p.rot) continue;
      // Always spin clockwise: 3 -> 0 goes on to 4 and wraps.
      const target = p.rot < p.turn ? p.rot + 4 : p.rot;
      p.turn = Math.min(target, p.turn + dt * 10);
      if (p.turn >= target) p.turn = p.rot;
      this.dirty = true;
    }
  }

  // Turn a loose piece a quarter clockwise.
  rotate(p) {
    p.rot = (p.rot + 1) % 4;
    this.renderPiece(p);
    this.hooks.sfx?.('whoosh');
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
        // Into the piece's own (unturned) frame, about its centre.
        const cx = this.pw / 2;
        const cy = this.ph / 2;
        const a = (-p.rot * Math.PI) / 2;
        const ux = x - px - cx;
        const uy = y - py - cy;
        const lx = cx + ux * Math.cos(a) - uy * Math.sin(a);
        const ly = cy + ux * Math.sin(a) + uy * Math.cos(a);
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
      this.drag = { p, id: e.pointerId, dx: x - at.x, dy: y - at.y, x, y, t: performance.now(), moved: false };
      this.hooks.sfx?.('tap');
      this.dirty = true;
    };
    const move = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const { x, y } = point(e);
      const p = this.drag.p;
      if (!this.drag.moved && Math.hypot(x - this.drag.x, y - this.drag.y) < 8) return;
      this.drag.moved = true;
      p.fx = Math.max(-this.pw * 0.5, Math.min(this.W - this.pw * 0.5, x - this.drag.dx)) / this.W;
      p.fy = Math.max(-this.ph * 0.5, Math.min(this.H - this.ph * 0.5, y - this.drag.dy)) / this.H;
      this.dirty = true;
    };
    const up = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const { p, moved, t } = this.drag;
      this.drag = null;
      this.moves++;
      // A tap (no drag) turns the piece.
      if (!moved && performance.now() - t < 500) this.rotate(p);
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
    if (p.rot === 0 && Math.hypot(at.x - home.x, at.y - home.y) < tol) this.place(p);
    this.dirty = true;
    this.hooks.onChange?.();
  }

  place(p) {
    p.placed = true;
    p.rot = p.turn = 0;
    this.renderPiece(p);
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
    // Finished: show the photo itself, without the seams.
    if (this.done) {
      ctx.drawImage(this.image, board.x, board.y, board.w, board.h);
      return;
    }
    const cw = this.pw + 2 * this.pad;
    const ch = this.ph + 2 * this.pad;
    for (const i of this.order) {
      const p = this.pieces[i];
      if (!p.placed && this.edgesOnly && !p.edge && this.drag?.p !== p) continue;
      const { x, y } = this.pos(p);
      if (p.placed) {
        ctx.drawImage(p.canvas, x - this.pad, y - this.pad, cw, ch);
        continue;
      }
      const lifted = this.drag?.p === p && this.drag.moved;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = lifted ? 14 : 4;
      ctx.shadowOffsetX = lifted ? 3 : 1; // same top-left light
      ctx.shadowOffsetY = lifted ? 6 : 2;
      ctx.translate(x + this.pw / 2, y + this.ph / 2);
      ctx.rotate((p.turn * Math.PI) / 2);
      const s = lifted ? 1.06 : 1;
      ctx.drawImage(p.canvas, (-this.pw / 2 - this.pad) * s, (-this.ph / 2 - this.pad) * s, cw * s, ch * s);
      ctx.restore();
    }
    if (this.peek) this.drawPeek();
  }

  // The whole picture in a pop-up card over the table, while Peek is held.
  drawPeek() {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(8,10,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    const aspect = this.image.width / this.image.height;
    let w = W * 0.86;
    let h = w / aspect;
    if (h > H * 0.8) {
      h = H * 0.8;
      w = h * aspect;
    }
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    const m = Math.max(6, Math.min(w, h) * 0.025);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(x - m, y - m, w + 2 * m, h + 2 * m, m);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(this.image, x, y, w, h);
  }
}

// A tiny canvas context just for isPointInPath hit tests.
class OffscreenCanvasLike {
  constructor() {
    this.ctx = document.createElement('canvas').getContext('2d');
  }
}
