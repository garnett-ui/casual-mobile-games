// Water Lab in play: beakers on a lab bench. Drag one onto another (or tap
// one, then the other) to pour: it tips over the other and pours until it's
// empty or the other is full.
import { pour, goalMet, solve, starsFor, endsIn, GUIDED_UNTIL } from './model.js';
import { vessel, polygonArea, clipBelow } from './shapes.js';
import { drawProfessor, goalLine, line } from './professor.js';

const HEAD = 1.08; // glass above the top mark (as a share of its height)
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, t) => a + (b - a) * t;

export class Play {
  constructor(canvas, level, hooks, { tip = '' } = {}) {
    this.tip = tip;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.vessels = level.caps.map((c, i) => vessel(level.shapes[i], c));
    this.reset();
    this.resize();
    this.bindInput();
    let last = performance.now();
    const loop = (now) => {
      this.update(Math.min(0.05, (now - last) / 1000));
      last = now;
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
    this.state = this.level.start.slice();
    this.history = [];
    this.moves = 0;
    this.won = false;
    this.anim = null;
    this.held = null;
    this.selected = null;
    this.hint = null;
    // Where the amount should end up, shown as a gold line: from the start on
    // early levels; otherwise only once a hint has been asked for.
    const g = this.level.goal;
    this.target = g.kind === 'any' && this.level.n <= GUIDED_UNTIL ? this.level.target ?? -1 : -1;
    this.notes = [];
    this.sparks = [];
    this.hooks.onMoves?.(0);
    // He states the goal; on teaching levels, then explains how (all in
    // his speech bubble), then repeats the goal.
    this.queue = this.tip ? [{ text: this.tip, mood: 'happy', secs: 9 }] : [];
    this.say(goalLine(this.level), 'happy', this.tip ? 4 : 0);
  }

  // Professor Fizz speaks: `secs` until he moves on (to whatever's queued,
  // else back to the goal); 0: until something else happens.
  say(text, mood = 'happy', secs = 0) {
    this.speech = { text, mood, t: 0, secs };
  }

  // ------------------------------------------------------------- layout

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = Math.max(1, rect.width);
    this.H = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const { W, H } = this;
    // Professor Fizz and his speech bubble: across the top on a tall screen,
    // in a column on the left on a wide one (so the glasses get the height).
    this.side = W > H * 1.2;
    this.profW = this.side ? Math.min(W * 0.34, 340) : W;
    this.band = this.side ? Math.min(H * 0.62, 190) : Math.max(96, Math.min(H * 0.24, 160));
    // The bench, with room on it for the labels and the goal.
    this.bench = H - Math.max(100, H * 0.2);
    const top = this.side ? 18 : this.band + 16;
    const x0 = this.side ? this.profW + 8 : 0;
    const vw = W - x0;
    // Sizes in proportion to capacity (by volume), then scaled to fit.
    const raw = this.vessels.map((v) => {
      const h = Math.cbrt(v.capacity / v.unitVolume);
      return { h, w: h * v.aspect };
    });
    const k = raw.length;
    const sumW = raw.reduce((a, r) => a + r.w, 0) * 1.12;
    const maxH = Math.max(...raw.map((r) => r.h));
    const s = Math.min((vw * 0.92) / sumW, (this.bench - top) / (maxH * HEAD));
    // Each glass gets at least room for its "13 of 16" label, and the row
    // spreads out across the space (not so far that they look scattered).
    const label = 100;
    const cells = raw.map((r) => Math.max(r.w * s + 10, label));
    let used = cells.reduce((a, b) => a + b, 0);
    const squeeze = Math.min(1, (vw * 0.96) / used);
    for (let i = 0; i < k; i++) cells[i] *= squeeze;
    used *= squeeze;
    const gap = k > 1 ? Math.max(0, Math.min((vw * 0.92 - used) / (k - 1), 70)) : 0;
    let x = x0 + (vw - used - gap * (k - 1)) / 2;
    this.goalX = x0 + vw / 2;
    this.slots = raw.map((r, i) => {
      const slot = { x: x + cells[i] / 2, y: this.bench, w: r.w * s, h: r.h * s, room: cells[i] + gap - 6 };
      x += cells[i] + gap;
      return slot;
    });
  }

  // Where a vessel is drawn: bottom-centre (x, y) and tilt (radians).
  pose(i) {
    const slot = this.slots[i];
    const a = this.anim;
    if (a && a.i === i) return a.pose;
    if (this.held && this.held.i === i && this.held.moved) {
      return { x: this.held.x, y: this.held.y, angle: 0, lift: 1 };
    }
    const lifted = this.selected === i ? 1 : 0;
    return { x: slot.x, y: slot.y - lifted * 14, angle: 0, lift: lifted };
  }

  // The volume to draw in vessel i right now (part way through a pour).
  shown(i) {
    const a = this.anim;
    if (!a || a.phase !== 'pour') return a && a.done ? a.after[i] : this.state[i];
    const p = ease(a.p);
    if (i === a.i) return a.before[i] - a.amount * p;
    if (i === a.j) return a.before[i] + a.amount * p;
    return this.state[i];
  }

  // ------------------------------------------------------------- moves

  tryPour(i, j) {
    const r = pour(this.level.caps, this.state, i, j);
    if (!r) {
      const why = this.state[i] === 0 ? 'Empty!' : 'Full!';
      this.note(why === 'Empty!' ? i : j, why);
      this.say(line(why === 'Empty!' ? 'empty' : 'full'), 'oops', 2.6);
      this.hooks.sfx?.('bump');
      this.hooks.haptic?.(30);
      return false;
    }
    const slot = this.slots[i];
    const target = this.slots[j];
    const from = this.held && this.held.i === i && this.held.moved ? { x: this.held.x, y: this.held.y } : { x: slot.x, y: slot.y };
    // Tip toward the target: mouth over its mouth.
    const dir = target.x >= slot.x ? 1 : -1;
    const angle = dir * ((105 + Math.min(20, this.state[i] * 2)) * Math.PI) / 180;
    const mouth = slot.h * (HEAD - 0.5); // from the middle of the glass to its mouth
    const cx = target.x - mouth * Math.sin(angle) - dir * target.w * 0.18;
    // (The mouth sits half a height from the middle, so place the middle there.)
    const cy = target.y - target.h * HEAD - 14 + mouth * Math.cos(angle);
    this.anim = {
      i, j, amount: r.amount, before: this.state.slice(), after: r.state,
      phase: 'go', t: 0, p: 0,
      from, to: { x: cx, y: cy + slot.h / 2 }, angle, dir,
      pose: { x: from.x, y: from.y, angle: 0, lift: 1 },
    };
    this.selected = null;
    this.hint = null;
    this.hooks.sfx?.('tap');
    return true;
  }

  finish() {
    const a = this.anim;
    this.history.push(this.state.slice());
    this.state = a.after;
    this.moves++;
    this.hooks.onMoves?.(this.moves);
    this.anim = null;
    if (goalMet(this.level.goal, this.state)) {
      this.won = true;
      this.celebrate();
      const g = this.level.goal;
      this.say(`${line('win')} ${g.kind === 'any' ? `Exactly ${g.amount} ml!` : 'Every line just right!'}`, 'joy');
      const stars = starsFor(this.moves, this.level.par);
      this.hooks.onWin?.({ moves: this.moves, par: this.level.par, stars });
    }
  }

  undo() {
    if (!this.history.length || this.won || this.anim) return;
    this.state = this.history.pop();
    this.moves--;
    this.hooks.onMoves?.(this.moves);
    this.hint = null;
  }

  showHint() {
    if (this.won || this.anim) return;
    const sol = solve(this.level.caps, this.state, this.level.goal);
    if (!sol || !sol.length) return;
    const [i, j] = sol[0];
    this.hint = { i, j, t: 0 };
    if (this.level.goal.kind === 'any') this.target = endsIn(this.level.caps, this.state, this.level.goal);
    this.say(line('hint'), 'happy', 3);
  }

  note(i, text) {
    this.notes.push({ i, text, t: 0 });
  }

  celebrate() {
    for (let i = 0; i < this.state.length; i++) {
      if (!this.isGoalVessel(i)) continue;
      const s = this.slots[i];
      for (let k = 0; k < 26; k++) {
        this.sparks.push({ x: s.x, y: s.y - s.h * 0.6, vx: (Math.random() - 0.5) * 260, vy: -120 - Math.random() * 220, t: 0, c: ['#ffd23f', '#4cc9f0', '#ff6b6b', '#3dff7a'][k % 4] });
      }
    }
  }

  isGoalVessel(i) {
    const g = this.level.goal;
    if (g.kind === 'any') return this.state[i] === g.amount;
    return g.marks.some(([j]) => j === i);
  }

  // ------------------------------------------------------------- animation

  update(dt) {
    const a = this.anim;
    if (a) {
      a.t += dt;
      if (a.phase === 'go') {
        // Carry it over and tip it.
        const u = ease(a.t / 0.45);
        a.pose = { x: lerp(a.from.x, a.to.x, u), y: lerp(a.from.y, a.to.y, u), angle: lerp(0, a.angle, u), lift: 1 };
        if (a.t >= 0.45) {
          a.phase = 'pour';
          a.t = 0;
          a.dur = Math.min(1.4, 0.35 + 0.07 * a.amount);
          this.hooks.sfx?.('pour', a.dur);
          this.hooks.haptic?.(25);
        }
      } else if (a.phase === 'pour') {
        a.p = Math.min(1, a.t / a.dur);
        if (a.p >= 1) {
          a.phase = 'back';
          a.t = 0;
          a.done = true;
          a.back = { ...a.pose };
        }
      } else if (a.phase === 'back') {
        const u = ease(a.t / 0.4);
        const slot = this.slots[a.i];
        a.pose = { x: lerp(a.back.x, slot.x, u), y: lerp(a.back.y, slot.y, u), angle: lerp(a.angle, 0, u), lift: 1 - u };
        if (a.t >= 0.4) {
          this.hooks.sfx?.('clink');
          this.finish();
        }
      }
    }
    const sp = this.speech;
    if (sp) {
      sp.t += dt;
      if (sp.secs && sp.t > sp.secs) {
        const next = this.queue.shift();
        if (next) this.say(next.text, next.mood, next.secs);
        else this.say(goalLine(this.level));
      }
    }
    for (const n of this.notes) n.t += dt;
    this.notes = this.notes.filter((n) => n.t < 1);
    if (this.hint) this.hint.t += dt;
    for (const s of this.sparks) {
      s.t += dt;
      s.vy += 420 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < 1.6);
  }

  // ------------------------------------------------------------- input

  bindInput() {
    const c = this.canvas;
    const point = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x, y, except = -1) => {
      let best = -1;
      for (let i = 0; i < this.slots.length; i++) {
        if (i === except) continue;
        const s = this.slots[i];
        const m = 14;
        if (x > s.x - s.w / 2 - m && x < s.x + s.w / 2 + m && y > s.y - s.h - 40 && y < s.y + 50) best = i;
      }
      return best;
    };
    const down = (e) => {
      if (this.won || this.anim || this.held) return;
      e.preventDefault();
      const { x, y } = point(e);
      const i = hit(x, y);
      if (i < 0) {
        this.selected = null;
        return;
      }
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // (synthetic pointers can't be captured)
      }
      const s = this.slots[i];
      this.held = { i, id: e.pointerId, sx: x, sy: y, dx: s.x - x, dy: s.y - y, x: s.x, y: s.y, moved: false };
    };
    const move = (e) => {
      const h = this.held;
      if (!h || e.pointerId !== h.id) return;
      const { x, y } = point(e);
      if (!h.moved && Math.hypot(x - h.sx, y - h.sy) < 10) return;
      h.moved = true;
      h.x = x + h.dx;
      h.y = y + h.dy - 20; // lifted a little above the finger
      h.over = hit(x, y, h.i);
    };
    const up = (e) => {
      const h = this.held;
      if (!h || e.pointerId !== h.id) return;
      if (h.moved) {
        const { x, y } = point(e);
        const j = hit(x, y, h.i);
        if (j >= 0 && this.tryPour(h.i, j)) {
          this.held = null;
          return;
        }
        this.held = null;
        return;
      }
      this.held = null;
      // Tap: choose a beaker, then tap the one to pour into.
      if (this.selected === null) {
        this.selected = h.i;
        this.hooks.sfx?.('tap');
      } else if (this.selected === h.i) {
        this.selected = null;
      } else {
        const i = this.selected;
        this.selected = null;
        this.tryPour(i, h.i);
      }
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

  // ------------------------------------------------------------- drawing

  draw(time) {
    const { ctx, dpr, W, H } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The lab: a tiled wall and a bench.
    const wall = ctx.createLinearGradient(0, 0, 0, this.bench);
    wall.addColorStop(0, '#16303f');
    wall.addColorStop(1, '#22495c');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, this.bench);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const tile = 34;
    for (let y = this.bench; y > 0; y -= tile) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    for (let x = 0; x < W; x += tile) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.bench);
    }
    ctx.stroke();
    const bench = ctx.createLinearGradient(0, this.bench, 0, H);
    bench.addColorStop(0, '#d9dee2');
    bench.addColorStop(0.06, '#9aa5ad');
    bench.addColorStop(1, '#5d6971');
    ctx.fillStyle = bench;
    ctx.fillRect(0, this.bench, W, H - this.bench);

    this.drawProfessorBand(time);
    // Hint: an arrow from the beaker to pour to the one to pour into.
    if (this.hint) this.drawHint(time);
    // Shadows and labels, then the glass (the moving one last, on top).
    const order = [...this.slots.keys()];
    const moving = this.anim?.i ?? (this.held?.moved ? this.held.i : -1);
    for (const i of order) this.drawLabel(i);
    this.drawGoal();
    for (const i of order) if (i !== moving) this.drawVessel(i, time);
    if (moving >= 0) this.drawVessel(moving, time);
    if (this.anim?.phase === 'pour') this.drawStream(time);
    for (const n of this.notes) {
      const s = this.slots[n.i];
      ctx.globalAlpha = 1 - n.t;
      ctx.fillStyle = '#fff';
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.text, s.x, s.y - s.h - 16 - n.t * 18);
      ctx.globalAlpha = 1;
    }
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(0, 1 - s.t / 1.6);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  }

  // Professor Fizz, top left, saying what he needs.
  drawProfessorBand(time) {
    const { ctx, W } = this;
    const band = this.band;
    const size = this.side ? Math.min(band * 0.86, this.profW * 0.42) : band * 0.86;
    const px = size * 0.42;
    const sp = this.speech || { text: '', t: 99, mood: 'happy' };
    const speaking = sp.t < Math.min(2.6, 0.045 * sp.text.length);
    const talk = speaking ? 0.5 + 0.5 * Math.sin(time * 19) : 0;
    // Eyes on the beaker in hand (or the bench).
    const held = this.anim ? this.anim.pose.x : this.held?.moved ? this.held.x : W * 0.6;
    const look = Math.max(-1, Math.min(1, (held - px) / (W * 0.4)));
    drawProfessor(ctx, px, band + 4, size, { t: time, talk, look, mood: this.won ? 'joy' : sp.mood });
    // Speech bubble
    const x0 = px + size * 0.36;
    const x1 = this.profW - 10;
    const y0 = 10;
    const y1 = band - 8;
    if (x1 - x0 < 80) return;
    ctx.fillStyle = '#fffdf3';
    ctx.strokeStyle = sp.mood === 'oops' ? '#ff6b6b' : '#ffd23f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 16);
    ctx.fill();
    ctx.stroke();
    // Tail toward his mouth
    const my = band + 4 - size * 0.57;
    ctx.beginPath();
    ctx.moveTo(x0 + 1, my - 12);
    ctx.lineTo(px + size * 0.17, my);
    ctx.lineTo(x0 + 1, my + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0, my - 12);
    ctx.lineTo(px + size * 0.17, my);
    ctx.lineTo(x0, my + 2);
    ctx.stroke();
    // The words, wrapped and sized to fit.
    const maxW = x1 - x0 - 24;
    const maxH = y1 - y0 - 16;
    let size2 = 18;
    let lines;
    for (; size2 >= 11; size2--) {
      ctx.font = `800 ${size2}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      lines = wrap(ctx, sp.text, maxW);
      if (lines.length * size2 * 1.22 <= maxH) break;
    }
    ctx.fillStyle = '#1f2140';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lh = size2 * 1.22;
    const start = (y0 + y1) / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, k) => ctx.fillText(l, x0 + 12, start + k * lh));
  }

  // The goal, always on show at the front of the bench.
  drawGoal() {
    const { ctx, H } = this;
    const g = this.level.goal;
    const text = g.kind === 'any'
      ? `Goal: ${g.amount} ml`
      : `Goal: ${this.level.caps.map((_, i) => {
        const m = g.marks.find(([j]) => j === i);
        return m ? (m[1] ? `${m[1]} ml` : 'empty') : 'any';
      }).join(' · ')}`;
    let size = 24;
    ctx.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const maxW = (this.side ? this.W - this.profW : this.W) - 24;
    while (size > 13 && ctx.measureText(text).width + 32 > maxW) {
      size--;
      ctx.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    }
    const w = ctx.measureText(text).width + 32;
    const h = size + 16;
    const y = Math.min(H - h - 6, this.bench + 50);
    const met = this.won;
    ctx.fillStyle = met ? '#1e7d32' : '#1f2140';
    ctx.beginPath();
    ctx.roundRect(this.goalX - w / 2, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = met ? '#ffffff' : '#ffd23f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.goalX, y + h / 2 + 1);
  }

  drawLabel(i) {
    const { ctx } = this;
    const s = this.slots[i];
    // Shadow on the bench
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 3, s.w * 0.55, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // How much is in it, and how much it holds: "3 of 8", as big as fits.
    const v = Math.round(this.shown(i));
    const goal = this.level.goal;
    const good = goal.kind === 'any' ? v === goal.amount : goal.marks.some(([j, a]) => j === i && a === v);
    const room = s.room;
    let size = 26;
    const text = (sz) => {
      ctx.font = `900 ${sz}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
      return ctx.measureText(`${v} of ${this.level.caps[i]}`).width;
    };
    while (size > 14 && text(size) > room) size--;
    const total = text(size);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const x0 = s.x - total / 2;
    const head = `${v}`;
    ctx.fillStyle = good ? '#1e7d32' : '#1f2140';
    ctx.fillText(head, x0, s.y + 12);
    ctx.fillStyle = '#3a4650';
    ctx.fillText(` of ${this.level.caps[i]}`, x0 + ctx.measureText(head).width, s.y + 12);
  }

  drawVessel(i, time) {
    const { ctx } = this;
    const v = this.vessels[i];
    const s = this.slots[i];
    const pose = this.pose(i);
    const W = s.w;
    const H = s.h;
    const local = v.outline(HEAD).map(([x, y]) => [x * W, -y * H]);
    // Local -> screen: rotate about the vessel's middle.
    const ca = Math.cos(pose.angle);
    const sa = Math.sin(pose.angle);
    const cx = pose.x;
    const cy = pose.y - H / 2;
    const toScreen = ([x, y]) => {
      const yy = y + H / 2;
      return [cx + x * ca - yy * sa, cy + x * sa + yy * ca];
    };
    const outline = local.map(toScreen);
    const path = new Path2D();
    outline.forEach(([x, y], k) => (k ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();

    // Glass body
    ctx.fillStyle = 'rgba(220,240,255,0.08)';
    ctx.fill(path);
    // Water: upright it stands at the true level for its volume; tipped, the
    // same amount (by area) lies level in the tipped glass.
    const vol = this.shown(i);
    if (vol > 0.001) {
      const lvl = v.level(vol);
      let cut;
      if (Math.abs(pose.angle) < 1e-3) {
        cut = pose.y - lvl * H;
      } else {
        const want = polygonArea(clipBelow(local, -lvl * H));
        let lo = Math.min(...outline.map((p) => p[1]));
        let hi = Math.max(...outline.map((p) => p[1]));
        for (let k = 0; k < 30; k++) {
          const mid = (lo + hi) / 2;
          if (polygonArea(clipBelow(outline, mid)) > want) lo = mid;
          else hi = mid;
        }
        cut = (lo + hi) / 2;
      }
      const water = clipBelow(outline, cut);
      if (water.length > 2) {
        const yBottom = Math.max(...water.map((p) => p[1]));
        const g = ctx.createLinearGradient(0, cut, 0, yBottom);
        g.addColorStop(0, 'rgba(90,200,250,0.9)');
        g.addColorStop(1, 'rgba(30,110,210,0.95)');
        ctx.fillStyle = g;
        ctx.beginPath();
        water.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        // A bright surface line
        const xs = water.filter((p) => Math.abs(p[1] - cut) < 0.5).map((p) => p[0]);
        if (xs.length >= 2) {
          ctx.strokeStyle = 'rgba(210,245,255,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.min(...xs) + 1, cut);
          ctx.lineTo(Math.max(...xs) - 1, cut);
          ctx.stroke();
        }
      }
    }
    // Graduations (only drawn upright; they're etched on the glass, so
    // they tip with it).
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pose.angle);
    ctx.translate(0, H / 2);
    this.drawMarks(i, v, W, H);
    ctx.restore();
    // Glass outline and a highlight.
    const glow = this.won && this.isGoalVessel(i);
    ctx.strokeStyle = glow ? '#ffd23f' : this.selected === i || this.held?.over === i ? '#ffffff' : 'rgba(235,248,255,0.85)';
    ctx.lineWidth = this.selected === i || this.held?.over === i || glow ? 3 : 2;
    ctx.stroke(path);
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(2, W * 0.05);
    ctx.beginPath();
    const a1 = toScreen([-W * 0.28, -H * 0.12]);
    const a2 = toScreen([-W * 0.18 * v.width(0.85), -H * 0.88]);
    ctx.moveTo(...a1);
    ctx.lineTo(...a2);
    ctx.stroke();
    ctx.restore();
  }

  // Tick marks at every whole unit (where that volume really reaches),
  // numbers where they fit, and the goal lines.
  drawMarks(i, v, W, H) {
    const { ctx } = this;
    const cap = this.level.caps[i];
    // One straight scale, like a printed ruler: just inside the glass at its
    // narrowest marked point, so every tick and number lines up.
    let narrow = Infinity;
    for (let u = 1; u <= cap; u++) narrow = Math.min(narrow, (v.width(v.level(u)) * W) / 2);
    const xs = Math.max(8, narrow - 4);
    const font = Math.round(Math.max(11, Math.min(15, W * 0.16)));
    // Number each mark that has room (always the top one): where marks
    // crowd together, as in a flask's bulb, some go unnumbered.
    const room = font * 1.15;
    const topY = v.level(cap) * H;
    const labelled = new Set([cap]);
    let last = -Infinity;
    for (let u = 1; u < cap; u++) {
      const y = v.level(u) * H;
      if (y - last >= room && topY - y >= room) {
        labelled.add(u);
        last = y;
      }
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${font}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.lineJoin = 'round';
    for (let u = 1; u <= cap; u++) {
      const y = -v.level(u) * H;
      const major = labelled.has(u) || u % 5 === 0;
      const len = Math.min(major ? 12 : 7, xs * 0.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(xs - len, y);
      ctx.lineTo(xs, y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(xs - len, y);
      ctx.lineTo(xs, y);
      ctx.stroke();
      if (labelled.has(u)) {
        // Dark edging so the number reads over water and glass alike.
        ctx.strokeStyle = 'rgba(10,25,40,0.75)';
        ctx.lineWidth = 3.5;
        ctx.strokeText(String(u), xs - len - 3, y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(u), xs - len - 3, y);
      }
    }
    // Goal: a gold line at the amount wanted in this beaker.
    const g = this.level.goal;
    const m = g.kind === 'split' ? g.marks.find(([j]) => j === i) : this.target === i ? [i, g.amount] : null;
    {
      if (m) {
        const y = -v.level(m[1]) * H;
        const half = (v.width(v.level(m[1])) * W) / 2;
        const met = Math.round(this.shown(i)) === m[1];
        ctx.strokeStyle = met ? '#3dff7a' : '#ffd23f';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(-half - 6, y);
        ctx.lineTo(half + 6, y);
        ctx.stroke();
        ctx.setLineDash([]);
        // A flag with the target amount, inside the glass on the left (the
        // scale is on the right), clear of the next glass's numbers.
        const fx = -half + 4;
        ctx.fillStyle = met ? '#3dff7a' : '#ffd23f';
        ctx.beginPath();
        ctx.roundRect(fx, y - 10, 26, 20, 5);
        ctx.fill();
        ctx.fillStyle = '#1f2140';
        ctx.textAlign = 'center';
        ctx.font = '900 12px system-ui, sans-serif';
        ctx.fillText(m[1] ? String(m[1]) : 'Ø', fx + 13, y + 1);
      }
    }
  }

  // The pour: a stream from the lip of the tipped glass into the other.
  drawStream(time) {
    const { ctx } = this;
    const a = this.anim;
    const s = this.slots[a.i];
    const t = this.slots[a.j];
    const pose = a.pose;
    const ca = Math.cos(pose.angle);
    const sa = Math.sin(pose.angle);
    const v = this.vessels[a.i];
    // The lip on the downhill side of the mouth.
    const lx = a.dir * (v.width(1) * s.w) / 2;
    const ly = -s.h * (HEAD - 0.5);
    const x0 = pose.x + lx * ca - ly * sa;
    const y0 = pose.y - s.h / 2 + lx * sa + ly * ca;
    const tv = this.vessels[a.j];
    const surface = t.y - tv.level(this.shown(a.j)) * t.h;
    const flow = Math.sin(Math.PI * Math.min(1, a.p * 1.15));
    const width = 3 + 5 * flow;
    const g = ctx.createLinearGradient(0, y0, 0, surface);
    g.addColorStop(0, 'rgba(120,210,255,0.95)');
    g.addColorStop(1, 'rgba(40,130,220,0.9)');
    ctx.strokeStyle = g;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + a.dir * 6, (y0 + surface) / 2, t.x + (x0 - t.x) * 0.15, surface);
    ctx.stroke();
    // Splash ripples where it lands
    ctx.strokeStyle = 'rgba(220,245,255,0.7)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 2; k++) {
      const r = ((time * 3 + k * 0.5) % 1) * t.w * 0.25;
      ctx.beginPath();
      ctx.ellipse(t.x + (x0 - t.x) * 0.15, surface, r, r * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawHint(time) {
    const { ctx } = this;
    const a = this.slots[this.hint.i];
    const b = this.slots[this.hint.j];
    const y = Math.min(a.y - a.h, b.y - b.h) - 30;
    ctx.strokeStyle = `rgba(255,210,63,${0.6 + 0.4 * Math.sin(time * 6)})`;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - a.h - 8);
    ctx.quadraticCurveTo((a.x + b.x) / 2, y - 30, b.x, b.y - b.h - 10);
    ctx.stroke();
    // Arrowhead
    const ang = Math.atan2(b.y - b.h - 10 - (y - 30), b.x - (a.x + b.x) / 2);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - b.h - 10);
    ctx.lineTo(b.x - 14 * Math.cos(ang - 0.45), b.y - b.h - 10 - 14 * Math.sin(ang - 0.45));
    ctx.moveTo(b.x, b.y - b.h - 10);
    ctx.lineTo(b.x - 14 * Math.cos(ang + 0.45), b.y - b.h - 10 - 14 * Math.sin(ang + 0.45));
    ctx.stroke();
  }
}

// Break text into lines no wider than maxW.
function wrap(ctx, text, maxW) {
  const out = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > maxW && cur) {
      out.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}
