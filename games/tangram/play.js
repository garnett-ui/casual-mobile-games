// Tangram in play: the figure in silhouette and the seven pieces waiting
// beside it. Drag a piece to move it, tap it to turn it (45° at a time); the
// Flip button turns the parallelogram over. A piece dropped near a corner
// snaps onto it. The figure is made when the pieces cover it.
import { SET, TRAY, shape, flipped, solved, snap, inside, same, starsFor } from './model.js';

export const COLORS = ['#e63946', '#3a86ff', '#2ec4b6', '#ffbe0b', '#fb5607', '#8338ec', '#06d6a0'];
const TURN = Math.PI / 4;
const MAT = 0.3;
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, t) => a + (b - a) * t;

export class Play {
  constructor(canvas, fig, hooks, { tip = '' } = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.fig = fig;
    this.hooks = hooks;
    this.tip = tip;
    this.t = 0;
    this.reset();
    this.resize();
    this.bind();
    let last = performance.now();
    const loop = (now) => {
      this.update(Math.min(0.05, (now - last) / 1000));
      last = now;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  reset() {
    this.hints = 0;
    this.won = false;
    this.drag = null;
    this.pieces = SET.map((t, id) => ({ id, t, rot: 0, flip: 0, x: 0, y: 0, home: true, spin: 0, flipT: 1, glide: null }));
    this.order = this.pieces.map((p) => p.id);
    if (this.tray) this.layTray();
  }

  // ------------------------------------------------------------- layout

  // The figure and the tray at one scale, the tray below the figure or
  // beside it in whichever layout lets the pieces be biggest.
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const { W, H, fig } = this;
    const m = 16;
    const top = this.tip ? 40 : 8;
    const gap = 1;
    const ah = H - top - m;
    // Each way of laying out the tray: below the figure or beside it.
    // (The tray's mat reaches MAT beyond the pieces.)
    const fits = ['rows', 'grid', 'cols'].flatMap((k) => {
      const tw = TRAY[k].w + 2 * MAT;
      const th = TRAY[k].h + 2 * MAT;
      return [
        { k, below: true, s: Math.min((W - 2 * m) / Math.max(fig.w, tw), (ah - m) / (fig.h + gap + th)) },
        { k, below: false, s: Math.min((W - 3 * m) / (fig.w + gap + tw), (ah - m) / Math.max(fig.h, th)) },
      ];
    });
    const best = fits.reduce((a, b) => (b.s > a.s + 0.5 ? b : a));
    const lay = TRAY[best.k];
    const s = (this.s = Math.max(8, Math.min(best.s, 90)));
    if (best.below) {
      const block = (fig.h + gap + lay.h + 2 * MAT) * s;
      this.ox = (W - fig.w * s) / 2;
      this.oy = top + Math.max(0, (ah - block) / 2);
      this.tray = { lay, x: ((W - lay.w * s) / 2 - this.ox) / s, y: fig.h + gap + MAT };
    } else {
      const block = (fig.w + gap + lay.w + 2 * MAT) * s;
      this.ox = (W - block) / 2;
      this.oy = top + Math.max(0, (ah - fig.h * s) / 2);
      this.tray = { lay, x: fig.w + gap + MAT, y: (top + Math.max(0, (ah - lay.h * s) / 2) - this.oy) / s };
    }
    this.layTray();
    for (const p of this.pieces) this.clamp(p);
  }

  // Pieces not yet moved go (back) to their places in the tray.
  layTray() {
    const { lay, x, y } = this.tray;
    this.pieces.forEach((p, i) => {
      if (!p.home) return;
      // (The parallelogram stays turned over if it has been.)
      const q = lay.pieces[i];
      const o = p.flip ? flipped(q) : q;
      Object.assign(p, { rot: o.rot, flip: o.flip, x: x + q.x, y: y + q.y });
    });
  }

  toScreen([x, y]) {
    return [this.ox + x * this.s, this.oy + y * this.s];
  }

  toWorld(px, py) {
    return [(px - this.ox) / this.s, (py - this.oy) / this.s];
  }

  // Keep a piece's centre on the screen.
  clamp(p) {
    const m = 12 / this.s;
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.W, this.H);
    p.x = Math.max(x0 + m, Math.min(x1 - m, p.x));
    p.y = Math.max(y0 + m, Math.min(y1 - m, p.y));
  }

  // ------------------------------------------------------------- moves

  // The slot (in the figure as stored) a piece exactly fills, or -1.
  slotOf(p) {
    const pts = shape(p);
    return this.fig.slots.findIndex((s) => s.t === p.t && same(shape(s), pts));
  }

  placed() {
    return this.pieces.filter((p) => this.slotOf(p) >= 0).length;
  }

  turn(p) {
    p.rot = (p.rot + 1) % 8;
    p.spin -= TURN;
    this.settle(p);
  }

  // Turn the parallelogram over.
  flip() {
    if (this.won) return;
    const p = this.pieces.find((q) => q.t === 'P');
    Object.assign(p, flipped(p));
    p.flipT = 0;
    this.toTop(p);
    if (p.home) this.layTray();
    this.settle(p);
  }

  // After a move: snap to a nearby corner (of the figure or another piece),
  // then see whether the figure is made.
  settle(p) {
    if (!p.home) {
      const anchors = this.fig.verts.slice();
      for (const q of this.pieces) if (q !== p && !q.home) anchors.push(...shape(q));
      const d = snap(shape(p), anchors, Math.min(0.42, Math.max(0.2, 18 / this.s)));
      if (d) {
        p.x += d[0];
        p.y += d[1];
      }
    }
    this.hooks.sfx?.(this.slotOf(p) >= 0 ? 'snap' : p.home ? 'tap' : 'drop');
    this.check();
  }

  check() {
    if (this.won || this.pieces.some((p) => p.glide) || !solved(this.fig, this.pieces)) return;
    this.won = true;
    this.wonAt = this.t;
    this.drag = null;
    this.hooks.onWin?.({ hints: this.hints, stars: starsFor(this.hints) });
  }

  // Put one more piece where it goes (and anything in the way back in the
  // tray).
  hint() {
    if (this.won) return false;
    const s = this.fig.slots.find((q) => !this.pieces.some((p) => p.t === q.t && same(shape(p), shape(q))));
    if (!s) return false;
    // (There's always a piece of its kind not in place: one per slot.)
    const free = this.pieces.filter((p) => this.slotOf(p) < 0);
    const p = free.find((q) => q.t === s.t && !q.home) || free.find((q) => q.t === s.t);
    const target = shape(s);
    for (const q of free) {
      if (q === p || q.home) continue;
      const pts = shape(q);
      if (pts.some(([x, y]) => inside(target, x, y)) || target.some(([x, y]) => inside(pts, x, y)) || inside(target, q.x, q.y) || inside(pts, s.x, s.y)) this.sendHome(q);
    }
    // Turning on the way (from how it was to how it goes).
    const d = (p.rot - s.rot + 8) % 8;
    if (p.flip !== s.flip) p.flipT = 0;
    else p.spin = (d > 4 ? d - 8 : d) * TURN;
    p.glide = { fx: p.x, fy: p.y, tx: s.x, ty: s.y, t: 0 };
    p.rot = s.rot;
    p.flip = s.flip;
    p.home = false;
    this.toTop(p);
    this.hints++;
    this.hooks.sfx?.('whoosh');
    return true;
  }

  sendHome(q) {
    const { lay, x, y } = this.tray;
    const h = lay.pieces[q.id];
    q.glide = { fx: q.x, fy: q.y, tx: x + h.x, ty: y + h.y, t: 0, home: true };
    q.rot = (q.flip ? flipped(h) : h).rot;
  }

  toTop(p) {
    this.order = this.order.filter((i) => i !== p.id).concat(p.id);
  }

  // ------------------------------------------------------------- input

  // The piece under a point: the topmost one it's in, else the nearest
  // within a finger's width.
  pick(px, py) {
    const [x, y] = this.toWorld(px, py);
    for (let k = this.order.length - 1; k >= 0; k--) {
      const p = this.pieces[this.order[k]];
      if (inside(shape(p), x, y)) return p;
    }
    let best = null;
    let d = 14 / this.s;
    for (const p of this.pieces) {
      const pts = shape(p);
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
        const e = Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
        if (e < d) {
          d = e;
          best = p;
        }
      });
    }
    return best;
  }

  bind() {
    const c = this.canvas;
    const at = (e) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const down = (e) => {
      if (this.won || this.drag) return;
      const [px, py] = at(e);
      const p = this.pick(px, py);
      if (!p || p.glide) return;
      const [x, y] = this.toWorld(px, py);
      this.drag = { p, id: e.pointerId, px, py, dx: p.x - x, dy: p.y - y, moved: false };
      this.toTop(p);
      c.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const [px, py] = at(e);
      if (!d.moved && Math.hypot(px - d.px, py - d.py) < 7) return;
      if (!d.moved) this.hooks.haptic?.(8);
      d.moved = true;
      const [x, y] = this.toWorld(px, py);
      d.p.x = x + d.dx;
      d.p.y = y + d.dy;
      d.p.home = false;
      this.clamp(d.p);
    };
    const up = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (d.moved) this.settle(d.p);
      else this.turn(d.p);
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

  // ------------------------------------------------------------- frame

  update(dt) {
    this.t += dt;
    let landed = false;
    for (const p of this.pieces) {
      if (p.spin) p.spin = Math.sign(p.spin) * Math.max(0, Math.abs(p.spin) - dt * (TURN / 0.14) * Math.max(1, Math.abs(p.spin) / TURN));
      if (p.flipT < 1) p.flipT = Math.min(1, p.flipT + dt / 0.25);
      const g = p.glide;
      if (g) {
        g.t = Math.min(1, g.t + dt / 0.45);
        const u = ease(g.t);
        p.x = lerp(g.fx, g.tx, u);
        p.y = lerp(g.fy, g.ty, u);
        if (g.t >= 1) {
          p.glide = null;
          if (g.home) p.home = true;
          else landed = true;
        }
      }
    }
    if (landed) {
      this.hooks.sfx?.('snap');
      this.check();
    }
  }

  path(pts) {
    const g = this.g;
    g.beginPath();
    pts.forEach((pt, i) => {
      const [x, y] = this.toScreen(pt);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
  }

  draw() {
    const { g, W, H, fig } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#f3ead7';
    g.fillRect(0, 0, W, H);
    // The tray: a little mat the pieces start on.
    const { lay, x, y } = this.tray;
    const [tx, ty] = this.toScreen([x - MAT, y - MAT]);
    const tw = (lay.w + 2 * MAT) * this.s;
    const th = (lay.h + 2 * MAT) * this.s;
    g.fillStyle = 'rgba(120, 90, 50, 0.08)';
    g.beginPath();
    if (g.roundRect) g.roundRect(tx, ty, tw, th, 14);
    else g.rect(tx, ty, tw, th);
    g.fill();
    // The figure, in silhouette (one path, so no seams show between parts).
    g.beginPath();
    for (const poly of fig.polys) {
      poly.forEach((pt, i) => {
        const [sx, sy] = this.toScreen(pt);
        if (i) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      });
      g.closePath();
    }
    g.fillStyle = '#2b2d42';
    g.fill();
    g.lineJoin = 'round';
    g.strokeStyle = '#2b2d42';
    g.lineWidth = 1;
    g.stroke();
    if (this.won) {
      const u = Math.min(1, (this.t - this.wonAt) / 0.4);
      g.strokeStyle = `rgba(255, 190, 11, ${u})`;
      g.lineWidth = 6;
      g.stroke();
    }
    for (const i of this.order) this.drawPiece(this.pieces[i]);
    if (this.tip && !this.won) {
      g.fillStyle = '#5b4a33';
      g.font = '700 15px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      this.wrap(this.tip, W / 2, 22, W - 24);
    }
  }

  wrap(text, x, y, w) {
    const { g } = this;
    if (g.measureText(text).width <= w) {
      g.fillText(text, x, y);
      return;
    }
    g.font = '700 13px system-ui, sans-serif';
    g.fillText(text, x, y, w);
  }

  drawPiece(p) {
    const { g } = this;
    let pts = shape(p);
    const sx = p.flipT < 1 ? -1 + 2 * ease(p.flipT) : 1;
    if (p.spin || sx !== 1) {
      const c = Math.cos(p.spin);
      const s = Math.sin(p.spin);
      pts = pts.map(([x, y]) => {
        const dx = (x - p.x) * sx;
        const dy = y - p.y;
        return [p.x + dx * c - dy * s, p.y + dx * s + dy * c];
      });
    }
    const lifted = this.drag?.p === p && this.drag.moved;
    g.save();
    if (lifted) {
      g.shadowColor = 'rgba(40, 30, 10, 0.35)';
      g.shadowBlur = 14;
      g.shadowOffsetY = 6;
    }
    this.path(pts);
    g.fillStyle = COLORS[p.id];
    g.fill();
    g.restore();
    this.path(pts);
    g.lineJoin = 'round';
    g.lineWidth = 1.5;
    g.strokeStyle = this.won ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.28)';
    g.stroke();
  }
}
