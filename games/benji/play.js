// Benji's Town: the town on screen -- the helpers going about their jobs,
// people and cars pottering about, and a tray of the level's jobs ticking
// off. Tap a helper and it goes to its next job (the early levels); later,
// drive it there with a finger, along the streets.
import { SIZE, isRoad, route, nearestRoad, jobAt, nextJob } from './town.js';
import * as D from './draw.js';

const SPEED = { garbage: 2.2, mail: 2.6, mixer: 2, walker: 1.3, car: 1.6, person: 0.9 };
export const COLORS = { garbage: '#2a9d8f', mail: '#e63946', mixer: '#ff9f1c', walker: '#7b2cbf' };
// The jobs, as pictures in the tray.
const ICONS = { bin: '🗑️', dump: '♻️', letter: '✉️', walk: '🐕', home: '🏠', build: '🧱' };
const PEOPLE = ['#ef476f', '#118ab2', '#ffd166', '#06d6a0'];

const center = (t) => ({ x: t.x + 0.5, y: t.y + 0.5 });

export class Play {
  constructor(canvas, town, hooks = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.town = town;
    this.hooks = hooks;
    this.done = new Set();
    this.t = 0;
    this.fx = [];
    this.confetti = [];
    this.won = false;
    this.drag = null;
    this.stage = {}; // building lots: stages built so far
    this.helpers = town.helpers.map((h) => ({
      ...h, ...center(h.at), tile: h.at, path: [], face: 1, pause: 0, hop: 0, loaded: true, load: 0,
    }));
    // Life in the town: a couple of cars and people out and about.
    const r = (() => {
      let s = town.n * 31 + 7;
      return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
    })();
    this.rand = r;
    const roads = [];
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (isRoad(x, y)) roads.push({ x, y });
    this.roads = roads;
    this.ambient = [
      { kind: 'car', color: '#ef476f' }, { kind: 'car', color: '#118ab2' },
      { kind: 'person', color: PEOPLE[0] }, { kind: 'person', color: PEOPLE[3] },
    ].map((a, k) => {
      const at = roads[Math.floor(r() * roads.length)];
      return { ...a, id: `a${k}`, ...center(at), tile: at, path: [], face: 1, pause: r() * 2, hop: 0 };
    });
    this.onDown = (e) => this.pointer(e, 'down');
    this.onMove = (e) => this.pointer(e, 'move');
    this.onUp = (e) => this.pointer(e, 'up');
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); // (the first frame's can be a hair before)
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
  }

  // The map as big as fits, with the tray of jobs below it (or beside it,
  // on a wide screen).
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.dpr = dpr;
    this.W = rect.width;
    this.H = rect.height;
    this.wide = this.W > this.H * 1.15;
    // (The tray: rows of 50 px pictures, as many as the jobs need.)
    const n = this.town.jobs.length;
    const rows = Math.ceil(n / Math.max(1, Math.floor((this.W - 16) / 50)));
    const tray = this.wide ? 50 * Math.ceil(n / Math.max(1, Math.floor((this.H - 16) / 50))) + 8 : rows * 50 + 10;
    const side = this.wide ? Math.min(this.W - tray - 16, this.H - 16) : Math.min(this.W - 12, this.H - tray - 16);
    this.s = Math.max(10, side / SIZE);
    this.ox = this.wide ? (this.W - tray - this.s * SIZE) / 2 : (this.W - this.s * SIZE) / 2;
    // (Map and tray together, in the middle.)
    this.oy = this.wide ? (this.H - this.s * SIZE) / 2 : Math.max(6, (this.H - tray - this.s * SIZE) / 2);
  }

  place(id) {
    return this.town.places.find((p) => p.id === id);
  }

  // ------------------------------------------------------------ the jobs

  // Where a helper should go next (tap mode): the nearest bin left, then
  // the dump; the next letter; the park, then home; the lot (loaded with
  // cement) or back to the yard for more.
  target(h) {
    if (h.kind === 'mixer' && !h.loaded) return this.place('yard').door;
    const left = this.town.jobs.filter((j) => j.helper === h.id && !this.done.has(j.i));
    if (h.kind === 'garbage') {
      const bins = left.filter((j) => j.kind === 'bin');
      if (bins.length) {
        const dist = (j) => route(h.tile, this.place(j.place).door).length;
        return this.place(bins.reduce((a, b) => (dist(b) < dist(a) ? b : a)).place).door;
      }
    }
    const j = nextJob(this.town, h, this.done);
    return j ? this.place(j.place).door : null;
  }

  // Tap mode: off it goes to its next job.
  send(h) {
    const to = this.target(h);
    if (!to) {
      h.hop = 1;
      return;
    }
    this.hooks.sfx?.(h.kind === 'walker' ? 'pop' : 'honk');
    h.path = route(h.tile, to).slice(1);
    if (!h.path.length) this.arrive(h, h.tile);
  }

  // At a street tile: a job to do here?
  arrive(h, tile) {
    h.tile = tile;
    if (h.kind === 'mixer' && !h.loaded) {
      const yard = this.place('yard').door;
      if (tile.x === yard.x && tile.y === yard.y) {
        h.loaded = true;
        h.pause = 0.6;
        this.pop('🪣', yard);
        this.hooks.sfx?.('pour', 0.5);
      }
      return;
    }
    const job = jobAt(this.town, h, tile, this.done);
    if (!job) return;
    this.done.add(job.i);
    h.path = [];
    const p = this.place(job.place);
    const at = { x: p.x + (p.w || 1) / 2 - 0.5, y: p.y + (p.h || 1) / 2 - 0.5 };
    switch (job.kind) {
      case 'bin':
        h.load++;
        h.pause = 0.7;
        this.pop('✨', at);
        this.hooks.sfx?.('clink');
        break;
      case 'dump':
        h.load = 0;
        h.pause = 0.8;
        this.pop('♻️', at);
        this.hooks.sfx?.('crash');
        break;
      case 'letter':
        h.pause = 0.6;
        this.pop('💌', at);
        this.hooks.sfx?.('ding');
        break;
      case 'walk':
        // Play in the park a while, then (tapping) home again.
        h.pause = 2.4;
        h.playing = 2.4;
        this.pop('🎾', at);
        this.hooks.sfx?.('pop');
        if (!this.town.drive) h.then = true;
        break;
      case 'home':
        h.pause = 0.6;
        this.pop('❤️', at);
        this.hooks.sfx?.('ding');
        break;
      case 'build':
        this.stage[job.place] = job.stage;
        h.loaded = false;
        h.pause = 1;
        this.pop(job.stage === 3 ? '🎉' : '🔨', at);
        this.hooks.sfx?.(job.stage === 3 ? 'checkpoint' : 'tile');
        if (!this.town.drive && this.town.jobs.some((o) => o.helper === h.id && !this.done.has(o.i))) h.then = true;
        break;
      default:
        break;
    }
    this.hooks.haptic?.(20);
    if (this.done.size === this.town.jobs.length) this.win();
  }

  win() {
    if (this.won) return;
    this.won = true;
    this.hooks.sfx?.('win');
    this.hooks.say?.('Yay! Great job!');
    for (let k = 0; k < 120; k++) {
      this.confetti.push({
        x: this.rand() * this.W, y: -this.rand() * this.H * 0.5, vx: (this.rand() - 0.5) * 60, vy: 80 + this.rand() * 120,
        c: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#ff9f1c'][k % 5], a: this.rand() * 6,
      });
    }
    setTimeout(() => this.hooks.onWin?.(), 2600);
  }

  pop(icon, tile) {
    this.fx.push({ icon, x: tile.x + 0.5, y: tile.y + 0.5, t: 0 });
  }

  // ------------------------------------------------------------- touches

  toTile(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.ox) / this.s, y: (e.clientY - r.top - this.oy) / this.s };
  }

  pointer(e, type) {
    const p = this.toTile(e);
    if (type === 'down') {
      e.preventDefault();
      this.canvas.setPointerCapture?.(e.pointerId);
      // The nearest helper (or passer-by) within reach of the finger.
      const near = (list) => list.map((h) => ({ h, d: Math.hypot(h.x - p.x, h.y - 0.1 - p.y) }))
        .filter((o) => o.d < 0.85).sort((a, b) => a.d - b.d)[0]?.h;
      const h = near(this.helpers);
      if (h) {
        h.hop = 1;
        if (this.town.drive) this.drag = { h, id: e.pointerId, moved: false };
        else if (!h.path.length && h.pause <= 0) this.send(h);
        else this.hooks.sfx?.('tap');
        return;
      }
      const a = near(this.ambient);
      if (a) {
        a.hop = 1;
        this.hooks.sfx?.(a.kind === 'car' ? 'honk' : 'pop');
      }
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    if (type === 'move') {
      // Driving: along the streets, toward the finger.
      const h = this.drag.h;
      const to = nearestRoad(p.x, p.y);
      if (this.drag.to && to.x === this.drag.to.x && to.y === this.drag.to.y) return;
      this.drag.to = to;
      this.drag.moved = true;
      this.driven = true;
      const from = h.path[0] || h.tile;
      h.path = route(from, to);
      if (!h.path.length || (h.path[0].x === h.tile.x && h.path[0].y === h.tile.y && !h.path[1])) h.path = [];
    } else {
      this.drag = null;
    }
  }

  // ------------------------------------------------------------- update

  update(dt) {
    this.t += dt;
    const move = (m, speed) => {
      if (m.pause > 0) {
        m.pause -= dt;
        if (m.pause <= 0 && m.then) {
          m.then = false;
          this.send(m);
        }
        return;
      }
      m.playing = 0;
      if (!m.path.length) return;
      const goal = center(m.path[0]);
      const dx = goal.x - m.x;
      const dy = goal.y - m.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.02) m.face = Math.sign(dx);
      const stepLen = speed * dt;
      if (d <= stepLen) {
        m.x = goal.x;
        m.y = goal.y;
        const tile = m.path.shift();
        if (m.kind === 'car' || m.kind === 'person') m.tile = tile;
        else this.arrive(m, tile);
      } else {
        m.x += (dx / d) * stepLen;
        m.y += (dy / d) * stepLen;
      }
    };
    for (const h of this.helpers) {
      move(h, SPEED[h.kind]);
      h.hop = Math.max(0, h.hop - dt * 2.5);
    }
    for (const a of this.ambient) {
      if (!a.path.length && a.pause <= 0) {
        a.path = route(a.tile, this.roads[Math.floor(this.rand() * this.roads.length)]).slice(1);
        a.pause = 0.5 + this.rand() * 2;
      }
      move(a, SPEED[a.kind]);
      a.hop = Math.max(0, a.hop - dt * 2.5);
    }
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 1.4);
    for (const c of this.confetti) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.a += dt * 6;
    }
    this.confetti = this.confetti.filter((c) => c.y < this.H + 20);
  }

  // --------------------------------------------------------------- draw

  draw() {
    const { g, s } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#5fa84a';
    g.fillRect(0, 0, this.W, this.H);
    g.save();
    g.translate(this.ox, this.oy);
    D.grass(g, s * SIZE, s * SIZE);
    D.streets(g, s, SIZE, isRoad);
    // Trees where there's nothing else.
    const taken = new Set();
    for (const p of this.town.places) {
      for (let x = p.x; x < p.x + (p.w || 1); x++) for (let y = p.y; y < p.y + (p.h || 1); y++) taken.add(y * SIZE + x);
    }
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        if (isRoad(x, y) || taken.has(y * SIZE + x)) continue;
        D.tree(g, (x + 0.35) * s, (y + 0.4) * s, s * 0.9);
        D.tree(g, (x + 0.7) * s, (y + 0.68) * s, s * 0.7);
      }
    }
    const bob = Math.sin(this.t * 5) * s * 0.06;
    const waiting = new Map(); // place -> picture it's waiting for
    for (const j of this.town.jobs) {
      if (this.done.has(j.i)) continue;
      if (j.kind === 'letter') waiting.set(j.place, '✉️');
    }
    // The places, back to front.
    for (const p of [...this.town.places].sort((a, b) => a.y - b.y)) {
      const cx = (p.x + (p.w || 1) / 2) * s;
      const cy = (p.y + (p.h || 1) / 2) * s;
      if (p.kind === 'home') D.house(g, cx, cy, s, p.color);
      else if (p.kind === 'post') D.post(g, cx, cy, s);
      else if (p.kind === 'shop') D.shop(g, cx, cy, s);
      else if (p.kind === 'cafe') D.cafe(g, cx, cy, s);
      else if (p.kind === 'dump') D.dump(g, cx, cy, s);
      else if (p.kind === 'yard') D.yard(g, cx, cy, s);
      else if (p.kind === 'park') D.park(g, p.x * s, p.y * s, (p.w || 1) * s, (p.h || 1) * s, s);
      else if (p.kind === 'lot') {
        D.lot(g, cx, cy, s);
        if (this.stage[p.id]) D.house(g, cx, cy, s, p.color, this.stage[p.id]);
      }
      // A bin out by the door, waiting for the truck.
      if (this.town.jobs.some((j) => j.kind === 'bin' && j.place === p.id && !this.done.has(j.i))) {
        D.bin(g, (p.door.x + 0.5) * s + (p.x - p.door.x) * s * 0.42, (p.door.y + 0.5) * s + (p.y - p.door.y) * s * 0.42, s);
      }
      if (waiting.has(p.id)) D.bubble(g, cx, cy, s, waiting.get(p.id), bob);
    }
    // Where each helper's going next: a bouncing arrow in its colour -- and,
    // driving, a dotted trail along the streets to it.
    for (const h of this.helpers) {
      if (h.path.length || h.pause > 0) continue;
      const to = this.target(h);
      if (!to) continue;
      const dest = this.town.places.find((p) => p.door.x === to.x && p.door.y === to.y) || { x: to.x, y: to.y };
      if (this.town.drive) {
        const way = route(h.tile, to);
        // (Until you've driven one: a finger showing how, along the trail.)
        if (!this.driven && h === this.helpers.find((o) => !o.path.length && o.pause <= 0 && this.target(o))) {
          const f = Math.min(1, (this.t % 3) / 2.4) * (way.length - 1);
          const a = way[Math.min(way.length - 1, Math.floor(f))];
          const b = way[Math.min(way.length - 1, Math.floor(f) + 1)];
          const u = Math.min(1, f - Math.floor(f));
          this.hand = { x: (a.x + (b.x - a.x) * u + 0.6) * s, y: (a.y + (b.y - a.y) * u + 0.75) * s };
        }
        g.strokeStyle = COLORS[h.kind];
        g.globalAlpha = 0.45;
        g.lineWidth = s * 0.08;
        g.setLineDash([s * 0.08, s * 0.14]);
        g.beginPath();
        way.forEach((t, k) => (k ? g.lineTo : g.moveTo).call(g, (t.x + 0.5) * s, (t.y + 0.5) * s));
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
      }
      D.arrow(g, (dest.x + (dest.w || 1) / 2) * s, (dest.y + (dest.h || 1) / 2) * s, s, COLORS[h.kind], bob);
    }
    // Everyone on the move, back to front.
    const movers = [...this.ambient, ...this.helpers].sort((a, b) => a.y - b.y);
    for (const m of movers) {
      // (Helpers with work to do bob, every so often, to say "tap me".)
      const idle = this.helpers.includes(m) && !m.path.length && m.pause <= 0 && this.target(m);
      const invite = idle ? Math.max(0, Math.sin(this.t * 4)) * 0.15 : 0;
      const lift = (Math.sin(m.hop * Math.PI) * 0.35 + invite) * s;
      const x = m.x * s;
      const y = m.y * s - lift;
      if (m.kind === 'person') D.walker(g, x, y + s * 0.05, s * 0.8, m.face, m.color, false, m.path.length ? this.t : 0);
      else if (m.kind === 'walker') {
        D.walker(g, x, y, s, m.face, COLORS.walker, true, m.path.length || m.playing ? this.t : 0);
      } else D.vehicle(g, m.kind, x, y, s, m.face, this.t, m.color);
      if (m.kind === 'garbage' && m.load) {
        g.font = `${Math.round(s * 0.28)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText('🗑️'.repeat(Math.min(3, m.load)), x, y - s * 0.45);
      }
    }
    if (this.hand && !this.driven) {
      g.font = `${Math.round(s * 0.7)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('👆', this.hand.x, this.hand.y);
    }
    this.hand = null;
    // Little pictures popping up where a job was done.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.fx) {
      g.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      g.font = `${Math.round(s * (0.5 + f.t * 0.3))}px system-ui, sans-serif`;
      g.fillText(f.icon, f.x * s, f.y * s - s * (0.4 + f.t * 0.8));
    }
    g.globalAlpha = 1;
    g.restore();
    this.drawTray();
    for (const c of this.confetti) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.a);
      g.fillStyle = c.c;
      g.fillRect(-5, -3, 10, 6);
      g.restore();
    }
  }

  // The level's jobs as pictures, each ticked off when it's done.
  drawTray() {
    const { g } = this;
    const jobs = this.town.jobs;
    const box = 44;
    const gap = 6;
    const n = jobs.length;
    const wide = this.wide;
    const per = wide ? Math.max(1, Math.floor((this.H - 16) / (box + gap))) : Math.max(1, Math.floor((this.W - 16) / (box + gap)));
    const cols = wide ? Math.ceil(n / per) : Math.min(n, per);
    jobs.forEach((j, k) => {
      const a = k % per;
      const b = Math.floor(k / per);
      const x = wide ? this.W - 8 - (cols - b) * (box + gap) : (this.W - cols * (box + gap) + gap) / 2 + a * (box + gap);
      const y = wide ? 8 + a * (box + gap) : this.oy + this.s * SIZE + 10 + b * (box + gap);
      const done = this.done.has(j.i);
      g.fillStyle = done ? '#c7f9cc' : '#fff';
      g.strokeStyle = COLORS[this.town.helpers.find((h) => h.id === j.helper).kind];
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(x, y, box, box, 10);
      g.fill();
      g.stroke();
      g.font = '26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = done ? 0.45 : 1;
      g.fillText(j.kind === 'build' && j.stage === 3 ? '🏠' : ICONS[j.kind], x + box / 2, y + box / 2 + 1);
      g.globalAlpha = 1;
      if (done) {
        g.font = '900 24px system-ui, sans-serif';
        g.fillStyle = '#2b9348';
        g.fillText('✓', x + box - 10, y + 12);
      }
    });
  }
}
