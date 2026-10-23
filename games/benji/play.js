// Benji's Town: the town on screen -- the helpers going about their jobs,
// people and cars pottering about, and a tray of the level's jobs ticking
// off. Tap a helper and it goes to its next job (the early levels); later,
// drive it there with a finger, along the streets. Everyone minds the
// traffic lights, and people cross only at the crosswalks.
import { SIZE, isRoad, route, nearestRoad, jobAt, nextJob } from './town.js';
import { walkways, walkDoor, nearestWalk, junctions, crossings, isLit, lights, walkSignal } from './streets.js';
import { Traffic, lanePoint, startDir, streetTiles } from './traffic.js';
import * as D from './draw.js';

const SPEED = { garbage: 2.2, mail: 2.6, mixer: 2, walker: 1.3, car: 1.6, person: 0.9 };
export const COLORS = { garbage: '#2a9d8f', mail: '#e63946', mixer: '#ff9f1c', walker: '#7b2cbf' };
// The jobs, as pictures in the tray.
const ICONS = { bin: '🗑️', dump: '♻️', letter: '✉️', walk: '🐕', home: '🏠', build: '🧱' };
const PEOPLE = ['#ef476f', '#118ab2', '#ffd166', '#06d6a0'];

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
    // The sidewalks: each place's spot outside its door, and the places by
    // each spot (for the dog walker).
    this.walk = walkways();
    this.spot = new Map(town.places.map((p) => [p.id, walkDoor(this.walk, p)]));
    this.atSpot = new Map();
    for (const p of town.places) this.atSpot.set(this.spot.get(p.id), [...(this.atSpot.get(this.spot.get(p.id)) || []), p]);
    this.junctions = junctions();
    this.crossings = crossings();
    const onFoot = (node) => ({ node, ...this.walk.nodes[node] });
    const parked = (tile, dir = startDir(tile)) => ({ tile, dir, ...lanePoint(tile, dir) });
    this.helpers = town.helpers.map((h) => ({
      ...h, ...(h.kind === 'walker' ? onFoot(this.spot.get(h.home)) : parked(h.at)), tile: h.at,
      path: [], face: 1, pause: 0, hop: 0, loaded: true, load: 0, patience: 1.2,
    }));
    // Life in the town: cars and people out and about.
    const r = (() => {
      let s = town.n * 31 + 7;
      return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
    })();
    this.rand = r;
    this.streets = streetTiles(SIZE);
    const anyStreet = () => this.streets[Math.floor(r() * this.streets.length)];
    const anyWhere = () => Math.floor(r() * this.walk.nodes.length);
    this.ambient = [
      { kind: 'car', color: '#ef476f' }, { kind: 'car', color: '#118ab2' }, { kind: 'car', color: '#8338ec' },
      { kind: 'person', color: PEOPLE[0] }, { kind: 'person', color: PEOPLE[1] }, { kind: 'person', color: PEOPLE[2] }, { kind: 'person', color: PEOPLE[3] },
    ].map((a, k) => ({
      ...a, id: `a${k}`, ...(a.kind === 'car' ? parked(anyStreet()) : onFoot(anyWhere())), path: [], face: 1, pause: r() * 2, hop: 0,
    }));
    this.anyStreet = anyStreet;
    this.anyWhere = anyWhere;
    this.traffic = new Traffic(this.walk);
    const movers = [...this.helpers, ...this.ambient];
    this.traffic.cars = movers.filter((m) => m.kind !== 'walker' && m.kind !== 'person');
    this.traffic.people = movers.filter((m) => m.kind === 'walker' || m.kind === 'person');
    this.said = -99;
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
  targetPlace(h) {
    if (h.kind === 'mixer' && !h.loaded) return this.place('yard');
    const left = this.town.jobs.filter((j) => j.helper === h.id && !this.done.has(j.i));
    if (h.kind === 'garbage') {
      const bins = left.filter((j) => j.kind === 'bin');
      if (bins.length) {
        const dist = (j) => route(h.tile, this.place(j.place).door).length;
        return this.place(bins.reduce((a, b) => (dist(b) < dist(a) ? b : a)).place);
      }
    }
    const j = nextJob(this.town, h, this.done);
    return j ? this.place(j.place) : null;
  }

  target(h) {
    return this.targetPlace(h)?.door || null;
  }

  // The way a helper would go to its next job, as points (in tiles): along
  // the streets, or the sidewalks.
  way(h) {
    const p = this.targetPlace(h);
    if (!p) return [];
    if (h.kind === 'walker') return this.walk.route(h.node, this.spot.get(p.id)).map((n) => this.walk.nodes[n]);
    return route(h.tile, p.door).map((t) => ({ x: t.x + 0.5, y: t.y + 0.5 }));
  }

  // Tap mode: off it goes to its next job.
  send(h) {
    const p = this.targetPlace(h);
    if (!p) {
      h.hop = 1;
      return;
    }
    this.hooks.sfx?.(h.kind === 'walker' ? 'pop' : 'honk');
    if (h.kind === 'walker') {
      h.path = this.walk.route(h.node, this.spot.get(p.id)).slice(1);
      if (!h.path.length) this.reached(h, h.node);
      return;
    }
    h.path = route(h.tile, p.door).slice(1);
    if (!h.path.length) this.arrive(h, h.tile);
  }

  // The dog walker at a spot on the sidewalk: outside a place with a job?
  reached(h, node) {
    const p = (this.atSpot.get(node) || []).find((q) => jobAt(this.town, h, q.door, this.done));
    if (p) this.arrive(h, p.door);
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
      const h = this.drag.h;
      if (h.kind === 'walker') {
        // Walking: along the sidewalks, toward the finger.
        const to = nearestWalk(this.walk, p.x, p.y);
        if (to === this.drag.to) return;
        this.drag.to = to;
        this.drag.moved = true;
        this.driven = true;
        const at = this.walk.nodes[h.node];
        const from = h.path.length && Math.hypot(h.x - at.x, h.y - at.y) > 1e-6 ? h.path[0] : h.node;
        const way = this.walk.route(from, to);
        h.path = from === h.node ? way.slice(1) : way;
        return;
      }
      // Driving: along the streets, toward the finger.
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
    this.traffic.t = this.t;
    const move = (m) => {
      if (m.pause > 0) {
        m.pause -= dt;
        if (m.pause <= 0 && m.then) {
          m.then = false;
          this.send(m);
        }
        return;
      }
      m.playing = 0;
      const helper = m.kind !== 'car' && m.kind !== 'person';
      if (m.kind === 'walker' || m.kind === 'person') {
        const node = this.traffic.walk(m, SPEED[m.kind], dt);
        if (node !== null && helper) this.reached(m, node);
      } else {
        const tile = this.traffic.drive(m, SPEED[m.kind], dt);
        if (tile && helper) this.arrive(m, tile);
      }
    };
    for (const h of this.helpers) {
      move(h);
      h.hop = Math.max(0, h.hop - dt * 2.5);
      // A helper held up at a red light: say so (now and then), and say go.
      if ((h.wait === 'light' || h.wait === 'walk') && !h.held && this.t - this.said > 15) {
        h.held = true;
        this.said = this.t;
        this.hooks.say?.(h.wait === 'walk' ? 'Wait for the walking man!' : 'Red light. Stop!');
      } else if (h.held && !h.wait) {
        h.held = false;
        if (h.path.length) this.hooks.say?.(h.kind === 'walker' ? 'Walk!' : 'Green light. Go!');
      }
    }
    for (const a of this.ambient) {
      if (!a.path.length && a.pause <= 0) {
        if (a.kind === 'car') a.path = route(a.tile, this.anyStreet()).slice(1);
        else a.path = this.walk.route(a.node, this.anyWhere()).slice(1);
        a.pause = 0.5 + this.rand() * 2;
      }
      move(a);
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
    D.streets(g, s, SIZE, isRoad, this.junctions, this.crossings);
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
    // The traffic lights, on the corners (each for the cars coming up on
    // its right), and the walk signals by the crosswalks.
    for (const { x, y } of this.junctions) {
      if (!isLit(x, y)) continue;
      const l = lights(x, y, this.t);
      for (const [cx, cy, axis] of [[-0.1, -0.34, 'ns'], [1.1, -0.34, 'ew'], [-0.1, 1.24, 'ew'], [1.1, 1.24, 'ns']]) {
        D.signal(g, (x + cx) * s, (y + cy) * s, s, l[axis]);
      }
    }
    const ENDS = { n: [[-0.1, -0.62], [1.1, -0.62]], s: [[-0.1, 1.62], [1.1, 1.62]], w: [[-0.62, -0.1], [-0.62, 1.1]], e: [[1.62, -0.1], [1.62, 1.1]] };
    for (const c of this.crossings) {
      if (!isLit(c.ix, c.iy)) continue;
      const sign = walkSignal(c, this.t);
      for (const [cx, cy] of ENDS[c.arm]) D.walkSign(g, (c.ix + cx) * s, (c.iy + cy) * s, s, sign, this.t);
    }
    // Where each helper's going next: a bouncing arrow in its colour -- and,
    // driving, a dotted trail along the streets (or sidewalks) to it.
    for (const h of this.helpers) {
      if (h.path.length || h.pause > 0) continue;
      const dest = this.targetPlace(h);
      if (!dest) continue;
      if (this.town.drive) {
        const way = this.way(h);
        // (Until you've driven one: a finger showing how, along the trail.)
        if (!this.driven && h === this.helpers.find((o) => !o.path.length && o.pause <= 0 && this.target(o))) {
          const f = Math.min(1, (this.t % 3) / 2.4) * (way.length - 1);
          const a = way[Math.min(way.length - 1, Math.floor(f))];
          const b = way[Math.min(way.length - 1, Math.floor(f) + 1)];
          const u = Math.min(1, f - Math.floor(f));
          this.hand = { x: (a.x + (b.x - a.x) * u + 0.1) * s, y: (a.y + (b.y - a.y) * u + 0.25) * s };
        }
        g.strokeStyle = COLORS[h.kind];
        g.globalAlpha = 0.45;
        g.lineWidth = s * 0.08;
        g.setLineDash([s * 0.08, s * 0.14]);
        g.beginPath();
        way.forEach((t, k) => (k ? g.lineTo : g.moveTo).call(g, t.x * s, t.y * s));
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
      const going = m.path.length && !m.wait;
      // (People drawn with their feet on the sidewalk; cars in their lane.)
      if (m.kind === 'person') D.walker(g, x, y - s * 0.15, s * 0.7, m.face, m.color, false, going ? this.t : 0);
      else if (m.kind === 'walker') {
        D.walker(g, x, y - s * 0.17, s * 0.8, m.face, COLORS.walker, true, going || m.playing ? this.t : 0);
      } else D.vehicle(g, m.kind, x, y - s * 0.12, s * (m.kind === 'car' ? 0.8 : 0.92), m.face, this.t, m.color);
      if (m.kind === 'garbage' && m.load) {
        g.font = `${Math.round(s * 0.28)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText('🗑️'.repeat(Math.min(3, m.load)), x, y - s * 0.55);
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
