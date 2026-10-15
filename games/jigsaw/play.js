// One jigsaw in play. The picture fills the screen as fully as possible while
// leaving a border all round for the loose pieces. Pieces start scattered
// and turned; tap one to turn it a quarter, drag it near its spot (the right
// way up) and it snaps in. Pieces that meet a neighbour edge to edge (turned
// the same way) lock together anywhere on the table, and then move and turn
// as one. The picture itself stays hidden until it's done --
// hold Peek to see it in a pop-up. Positions are kept as fractions of the
// screen so the puzzle survives rotation and resizing.
import { gridFor, makeEdges, pieceSides, tracePiece, isEdgePiece, TAB } from './puzzle.js';
import { rng } from '../../js/lib/random.js';
import { woodTable } from './table.js';

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
          group: 0, // pieces locked together share a group number (0: none)
        });
      }
    }
    this.nextGroup = 1 + Math.max(0, ...(saved?.pieces || []).map((p) => p.group || 0));
    this.elapsed = saved ? saved.elapsed : 0;
    this.moves = saved ? saved.moves : 0;
    this.resize();
    if (saved) {
      saved.pieces.forEach((p, i) => Object.assign(this.pieces[i], p, { rot: p.rot || 0, turn: p.rot || 0, group: p.group || 0 }));
      this.alignGroups();
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
      pieces: this.pieces.map(({ placed, fx, fy, rot, group }) => ({ placed, fx, fy, rot, group })), order: this.order,
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
    // Room round each piece for its tabs and the shadow it casts.
    this.pad = Math.ceil(Math.min(this.pw, this.ph) * (TAB + 0.05) + 6);
    this.table = woodTable(W, H, dpr);
    this.renderPieces();
    if (this.order) this.alignGroups(); // the screen's shape changed
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
  // turned -- even part way through a turn -- so the bevel and the shadow a
  // loose piece casts on the table are re-rendered for its current angle.
  renderPiece(p) {
    const { pw, ph, pad, dpr } = this;
    const sx = this.image.width / this.board.w;
    const sy = this.image.height / this.board.h;
    const cw = Math.ceil((pw + 2 * pad) * dpr);
    const chh = Math.ceil((ph + 2 * pad) * dpr);
    // The piece itself, drawn into a scratch canvas first.
    const body = (this.scratch ??= document.createElement('canvas'));
    if (body.width !== cw || body.height !== chh) {
      body.width = cw;
      body.height = chh;
    }
    const g = body.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, chh);
    g.setTransform(dpr, 0, 0, dpr, dpr * pad, dpr * pad);
    g.save();
    g.clip(p.path);
    g.drawImage(this.image, (p.col * pw - pad) * sx, (p.row * ph - pad) * sy, (pw + 2 * pad) * sx, (ph + 2 * pad) * sy, -pad, -pad, pw + 2 * pad, ph + 2 * pad);
    // A screen direction (dx, dy) in the piece's own, turned frame.
    const a = (p.turn * Math.PI) / 2;
    const local = (dx, dy) => [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
    const [lx, ly] = local(1, 1); // away from the light
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

    const c = p.canvas || document.createElement('canvas');
    c.width = cw;
    c.height = chh;
    const out = c.getContext('2d');
    if (!p.placed) {
      // Shadows on the table, down and right of the piece: a soft one, and
      // a tight one right at the edge where the piece meets the table.
      // (Shadow offsets ignore transforms, so they're given in device px.)
      for (const [ox, oy, blur, alpha] of [[3, 5, 7, 0.42], [1.2, 1.8, 1.5, 0.5]]) {
        const [dx, dy] = local(ox, oy);
        out.shadowOffsetX = dx * dpr;
        out.shadowOffsetY = dy * dpr;
        out.shadowBlur = blur * dpr;
        out.shadowColor = `rgba(45,22,0,${alpha})`;
        out.drawImage(body, 0, 0);
      }
      out.shadowColor = 'transparent';
    }
    out.drawImage(body, 0, 0);
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
      this.renderPiece(p); // keep the light where it is as the piece turns
      this.dirty = true;
    }
  }

  // Turn a loose piece -- and everything locked to it -- a quarter clockwise
  // about the piece you tapped.
  rotate(p) {
    const pivot = this.centre(p);
    for (const m of this.members(p)) {
      const c = this.centre(m);
      this.setCentre(m, pivot.x - (c.y - pivot.y), pivot.y + (c.x - pivot.x));
      m.rot = (m.rot + 1) % 4;
      m.pivot = pivot; // for drawing the turn
    }
    this.hooks.sfx?.('whoosh');
  }

  // ------------------------------------------------------------- groups

  members(p) {
    return p.group ? this.pieces.filter((q) => q.group === p.group) : [p];
  }

  at(row, col) {
    return row >= 0 && col >= 0 && row < this.rows && col < this.cols ? this.pieces[row * this.cols + col] : null;
  }

  centre(p) {
    const { x, y } = this.pos(p);
    return { x: x + this.pw / 2, y: y + this.ph / 2 };
  }

  setCentre(p, x, y) {
    p.fx = (x - this.pw / 2) / this.W;
    p.fy = (y - this.ph / 2) / this.H;
  }

  // Where piece n's centre sits if it's locked to piece m (turned with it).
  beside(m, n) {
    const c = this.centre(m);
    const dx = (n.col - m.col) * this.pw;
    const dy = (n.row - m.row) * this.ph;
    const a = (m.rot * Math.PI) / 2;
    return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  // Line every group up exactly on its first piece (after loading, or when
  // the screen's shape changes).
  alignGroups() {
    const seen = new Set();
    for (const p of this.pieces) {
      if (!p.group || p.placed || seen.has(p.group)) continue;
      seen.add(p.group);
      for (const m of this.members(p)) {
        if (m === p) continue;
        const c = this.beside(p, m);
        this.setCentre(m, c.x, c.y);
        m.rot = m.turn = p.rot;
      }
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
    // Each loose piece, or each group as a whole (placed by its first piece).
    const loose = this.pieces.filter((p) => !p.placed && (!p.group || this.members(p)[0] === p));
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
      if (p.group) {
        for (const m of this.members(p)) {
          if (m === p) continue;
          const c = this.beside(p, m);
          this.setCentre(m, c.x, c.y);
        }
      }
    }
    // Shuffle the stacking order of the loose pieces (groups stay together).
    const ids = this.order.filter((i) => !this.pieces[i].placed && !this.pieces[i].group);
    for (let k = ids.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [ids[k], ids[j]] = [ids[j], ids[k]];
    }
    ids.push(...this.order.filter((i) => !this.pieces[i].placed && this.pieces[i].group));
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
        if (p.placed || (this.edgesOnly && !p.edge && !p.group)) continue;
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
      const group = this.members(p);
      const ids = group.map((m) => this.pieces.indexOf(m));
      this.order = [...this.order.filter((i) => !ids.includes(i)), ...ids];
      const at = this.pos(p);
      // Where each piece in the group sits relative to the one under the finger.
      const rel = group.map((m) => {
        const q = this.pos(m);
        return { m, dx: q.x - at.x, dy: q.y - at.y };
      });
      this.drag = { p, group, rel, id: e.pointerId, dx: x - at.x, dy: y - at.y, x, y, t: performance.now(), moved: false };
      this.hooks.sfx?.('tap');
      this.dirty = true;
    };
    const move = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const { x, y } = point(e);
      const p = this.drag.p;
      if (!this.drag.moved && Math.hypot(x - this.drag.x, y - this.drag.y) < 8) return;
      this.drag.moved = true;
      const px = Math.max(-this.pw * 0.5, Math.min(this.W - this.pw * 0.5, x - this.drag.dx));
      const py = Math.max(-this.ph * 0.5, Math.min(this.H - this.ph * 0.5, y - this.drag.dy));
      for (const { m, dx, dy } of this.drag.rel) {
        m.fx = (px + dx) / this.W;
        m.fy = (py + dy) / this.H;
      }
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

  // After a drop: lock onto any matching neighbour it's been put against,
  // then snap the lot into place if it's near its spot the right way up.
  drop(p) {
    const tol = Math.max(14, Math.min(this.pw, this.ph) * 0.32);
    let group = this.members(p);
    let joined = false;
    for (let again = true; again; ) {
      again = false;
      for (const m of group) {
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const n = this.at(m.row + dr, m.col + dc);
          if (!n || n.placed || group.includes(n) || n.rot !== m.rot || n.turn !== n.rot) continue;
          const want = this.beside(m, n);
          const c = this.centre(n);
          if (Math.hypot(c.x - want.x, c.y - want.y) > tol) continue;
          // Slide what was dropped so the two meet exactly, and join them.
          for (const g of group) {
            const gc = this.centre(g);
            this.setCentre(g, gc.x + c.x - want.x, gc.y + c.y - want.y);
          }
          const id = n.group || m.group || this.nextGroup++;
          for (const g of [...group, ...this.members(n)]) g.group = id;
          group = this.members(n);
          joined = again = true;
          break;
        }
        if (again) break;
      }
    }
    if (joined) {
      const ids = group.map((g) => this.pieces.indexOf(g));
      this.order = [...this.order.filter((i) => !ids.includes(i)), ...ids];
      this.hooks.sfx?.('snap');
      this.hooks.haptic?.(10);
    }
    const at = this.pos(p);
    const home = this.home(p);
    if (p.rot === 0 && Math.hypot(at.x - home.x, at.y - home.y) < tol) {
      for (const g of group) this.place(g, g !== p);
    }
    this.dirty = true;
    this.hooks.onChange?.();
  }

  place(p, quiet = false) {
    if (p.placed) return;
    p.placed = true;
    p.group = 0;
    p.rot = p.turn = 0;
    this.renderPiece(p);
    const idx = this.pieces.indexOf(p);
    this.order = [idx, ...this.order.filter((i) => i !== idx)];
    if (!quiet) {
      this.hooks.sfx?.('snap');
      this.hooks.haptic?.(15);
    }
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
    // Oak table, with the puzzle's spot pressed in slightly (lit top left).
    ctx.drawImage(this.table, 0, 0, W, H);
    ctx.fillStyle = 'rgba(80,45,12,0.22)';
    ctx.fillRect(board.x, board.y, board.w, board.h);
    ctx.fillStyle = 'rgba(60,30,5,0.45)';
    ctx.fillRect(board.x - 1, board.y - 1, board.w + 2, 2);
    ctx.fillRect(board.x - 1, board.y - 1, 2, board.h + 2);
    ctx.fillStyle = 'rgba(255,244,222,0.45)';
    ctx.fillRect(board.x - 1, board.y + board.h - 1, board.w + 2, 2);
    ctx.fillRect(board.x + board.w - 1, board.y - 1, 2, board.h + 2);
    // Finished: show the photo itself, without the seams.
    if (this.done) {
      ctx.drawImage(this.image, board.x, board.y, board.w, board.h);
      return;
    }
    const cw = this.pw + 2 * this.pad;
    const ch = this.ph + 2 * this.pad;
    const drawn = new Set();
    for (const i of this.order) {
      const p = this.pieces[i];
      if (p.placed) {
        const { x, y } = this.pos(p);
        ctx.drawImage(p.canvas, x - this.pad, y - this.pad, cw, ch);
        continue;
      }
      if (this.edgesOnly && !p.edge && !p.group && this.drag?.p !== p) continue;
      if (p.group) {
        if (drawn.has(p.group)) continue;
        drawn.add(p.group);
        // Top-left pieces first, so each piece covers the shadows of the
        // ones up and to its left (the light is top left).
        const ms = this.members(p).map((m) => ({ m, c: this.centre(m) })).sort((a, b) => a.c.x + a.c.y - b.c.x - b.c.y);
        for (const { m } of ms) this.drawLoose(m, cw, ch);
      } else {
        this.drawLoose(p, cw, ch);
      }
    }
    if (this.peek) this.drawPeek();
  }

  drawLoose(p, cw, ch) {
    const { ctx } = this;
    let { x: cx, y: cy } = this.centre(p);
    // Part way through a turn: swing round the piece that was tapped.
    if (p.turn !== p.rot && p.pivot) {
      const left = ((p.rot < p.turn ? p.rot + 4 : p.rot) - p.turn) * (Math.PI / 2);
      const dx = cx - p.pivot.x;
      const dy = cy - p.pivot.y;
      cx = p.pivot.x + dx * Math.cos(-left) - dy * Math.sin(-left);
      cy = p.pivot.y + dx * Math.sin(-left) + dy * Math.cos(-left);
    }
    const held = this.drag && this.drag.moved && this.drag.group.includes(p);
    ctx.save();
    if (held) {
      // Held up off the table: a wider, softer shadow further away.
      ctx.shadowColor = 'rgba(45,22,0,0.35)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetX = 6 * this.dpr;
      ctx.shadowOffsetY = 10 * this.dpr;
    }
    ctx.translate(cx, cy);
    ctx.rotate((p.turn * Math.PI) / 2);
    const s = held && !p.group ? 1.06 : 1;
    ctx.drawImage(p.canvas, (-this.pw / 2 - this.pad) * s, (-this.ph / 2 - this.pad) * s, cw * s, ch * s);
    ctx.restore();
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
