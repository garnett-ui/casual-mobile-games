// One Tap Maze level in play: input, animation and rendering.
// Logic is instant (`alive`); slithering and bouncing are animation on top.
import { buildBoard, blocker, analyze } from './model.js';
import { COLORS, drawArrow, arrowPoints } from './draw.js';
import { rng } from '../../js/lib/random.js';

const EXIT_SPEED = 24; // cells per second
const BUMP_SPEED = 14;
export const HEARTS = 3;

export class Play {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.board = buildBoard(level);
    this.tracks = this.board.arrows.map((a, i) => this.buildTrack(i));
    this.colors = this.pickColors();
    this.reset();
    this.pointers = new Map();
    this.bindInput();
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  reset() {
    this.alive = this.board.arrows.map(() => true);
    this.hearts = HEARTS;
    this.anims = new Map(); // arrow -> { kind, s, target, phase }
    this.shake = new Map(); // arrow -> seconds left
    this.hint = null;
    this.over = false;
    this.time = 0;
    this.report();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind();
  }

  report() {
    const left = this.alive.filter(Boolean).length;
    this.hooks.onState?.({ hearts: this.hearts, left, total: this.alive.length });
  }

  // Cell centres along the arrow, then straight on past the head until the
  // whole arrow is off the board.
  buildTrack(i) {
    const { cells, dir } = this.board.arrows[i];
    const pts = cells.map(([x, y]) => [x + 0.5, y + 0.5]);
    const extra = Math.max(this.board.w, this.board.h) + cells.length + 2;
    const [hx, hy] = pts[pts.length - 1];
    for (let k = 1; k <= extra; k++) pts.push([hx + dir[0] * k, hy + dir[1] * k]);
    return pts;
  }

  // Neighbouring arrows get different colours so tangles stay readable.
  pickColors() {
    const { w, h, occ, arrows } = this.board;
    const offset = Math.floor(rng(arrows.length * 131 + w)() * COLORS.length);
    const colors = [];
    arrows.forEach((a, i) => {
      const near = new Set();
      for (const [x, y] of a.cells) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = occ[ny * w + nx];
          if (j >= 0 && j < i) near.add(colors[j]);
        }
      }
      colors[i] = COLORS[(offset + i * 3) % COLORS.length];
      for (let k = 0; k < COLORS.length; k++) {
        const c = COLORS[(offset + i * 3 + k) % COLORS.length];
        if (!near.has(c)) {
          colors[i] = c;
          break;
        }
      }
    });
    return colors;
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const c = this.canvas;
    const down = (e) => {
      e.preventDefault();
      this.hooks.onInteract?.();
      c.setPointerCapture?.(e.pointerId);
      const p = this.toBoard(e);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), arrow: this.pick(p.x, p.y), used: false });
    };
    const move = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr || ptr.used || ptr.arrow == null) return;
      const dx = e.clientX - ptr.x;
      const dy = e.clientY - ptr.y;
      if (Math.hypot(dx, dy) < Math.max(14, this.T * 0.4)) return;
      ptr.used = true;
      // A swipe sends the arrow only if it's the way the arrow points.
      const [ax, ay] = this.board.arrows[ptr.arrow].dir;
      const along = dx * ax + dy * ay;
      if (along > Math.abs(dx * ay - dy * ax)) this.send(ptr.arrow);
      else this.shake.set(ptr.arrow, 0.25);
    };
    const up = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (ptr && !ptr.used && ptr.arrow != null && performance.now() - ptr.t < 500) this.send(ptr.arrow);
    };
    const cancel = (e) => this.pointers.delete(e.pointerId);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', cancel);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', cancel);
    };
  }

  toBoard(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left - this.ox) / this.T, y: (e.clientY - rect.top - this.oy) / this.T };
  }

  // Arrow under (x, y), forgiving near-misses on small screens.
  pick(x, y) {
    const { w, h, occ } = this.board;
    let best = null;
    let bd = 0.75;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let yy = cy - 1; yy <= cy + 1; yy++) {
      for (let xx = cx - 1; xx <= cx + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const i = occ[yy * w + xx];
        if (i < 0 || !this.alive[i] || this.anims.has(i)) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- actions

  send(i) {
    if (this.over || !this.alive[i] || this.anims.has(i)) return;
    this.hint = null;
    const b = blocker(this.board, this.alive, i);
    if (b.by < 0) {
      this.alive[i] = false;
      const len = this.board.arrows[i].cells.length;
      this.anims.set(i, { kind: 'exit', s: 0, target: b.clear + len + 1 });
      this.hooks.sfx?.('whoosh');
      this.report();
    } else {
      this.anims.set(i, { kind: 'bump', s: 0, target: b.clear + 0.18, phase: 'out', by: b.by });
      this.hearts--;
      this.hooks.sfx?.('bump');
      this.hooks.haptic?.(30);
      this.report();
    }
  }

  showHint() {
    if (this.over) return;
    const free = analyze(this.board, this.alive).free.filter((i) => !this.anims.has(i));
    if (free.length) this.hint = { i: free[0], t: 0 };
  }

  // ------------------------------------------------------------- simulation

  update(dt) {
    this.time += dt;
    if (this.hint) this.hint.t += dt;
    for (const [i, t] of this.shake) {
      if (t - dt <= 0) this.shake.delete(i);
      else this.shake.set(i, t - dt);
    }
    for (const [i, a] of this.anims) {
      if (a.kind === 'exit') {
        a.s += EXIT_SPEED * dt;
        if (a.s >= a.target) {
          this.anims.delete(i);
          this.hooks.sfx?.('pop');
        }
      } else if (a.phase === 'out') {
        a.s = Math.min(a.target, a.s + BUMP_SPEED * dt);
        if (a.s >= a.target) {
          a.phase = 'back';
          a.flash = 0.5;
          this.shake.set(a.by, 0.35);
        }
      } else {
        a.flash = Math.max(0, a.flash - dt);
        a.s = Math.max(0, a.s - BUMP_SPEED * 0.8 * dt);
        if (a.s <= 0) this.anims.delete(i);
      }
    }
    if (this.over) return;
    if (this.hearts <= 0 && !this.anims.size) {
      this.over = true;
      this.hooks.onFail?.();
    } else if (this.alive.every((a) => !a) && !this.anims.size) {
      this.over = true;
      this.hooks.onWin?.({ stars: this.hearts, hearts: this.hearts });
    }
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
    const { w, h } = this.board;
    this.T = Math.min(this.cssW / (w + 1.2), this.cssH / (h + 1.2), 90);
    this.ox = (this.cssW - w * this.T) / 2;
    this.oy = (this.cssH - h * this.T) / 2;
  }

  draw() {
    const { ctx, T, dpr } = this;
    const { w, h, occ } = this.board;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.translate(this.ox, this.oy);

    // Board
    const pad = 0.3;
    ctx.fillStyle = 'rgba(20,10,60,0.25)';
    roundRect(ctx, (-pad + 0.05) * T, (-pad + 0.1) * T, (w + 2 * pad) * T, (h + 2 * pad) * T, T * 0.4);
    ctx.fill();
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, -pad * T, -pad * T, (w + 2 * pad) * T, (h + 2 * pad) * T, T * 0.4);
    ctx.fill();
    // Dots on cells that are (now) empty
    ctx.fillStyle = 'rgba(80,70,120,0.18)';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = occ[y * w + x];
        if (i >= 0 && (this.alive[i] || this.anims.has(i))) continue;
        ctx.beginPath();
        ctx.arc((x + 0.5) * T, (y + 0.5) * T, T * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const hinted = this.hint && this.hint.t < 4 ? this.hint.i : -1;
    for (let i = 0; i < this.board.arrows.length; i++) {
      const anim = this.anims.get(i);
      if (!this.alive[i] && !anim) continue;
      const len = this.board.arrows[i].cells.length;
      const s = anim ? anim.s : 0;
      const pts = arrowPoints(this.tracks[i], s, len);
      ctx.save();
      const sh = this.shake.get(i);
      if (sh) ctx.translate(Math.sin(sh * 60) * T * 0.06, 0);
      if (anim && anim.kind === 'exit') {
        // Fade out once past the board edge.
        ctx.globalAlpha = Math.max(0, Math.min(1, (anim.target - s) / (len + 1)));
      }
      const red = anim && anim.flash > 0;
      drawArrow(ctx, T, pts, red ? '#d90429' : this.colors[i], {
        glow: i === hinted && Math.sin(this.hint.t * 8) > -0.4,
      });
      ctx.restore();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
