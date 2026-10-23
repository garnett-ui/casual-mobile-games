// Benji's Town: the town on screen, in 3D -- the helpers going about their
// jobs, people and cars pottering about, and a tray of the level's jobs
// ticking off. Tap a helper and it goes to its next job (the early levels);
// later, drive it there with a finger, along the streets. Everyone minds the
// traffic lights, and people cross only at the crosswalks.
//
// The town is seen from above at an angle (isometric), turned a quarter at
// a time with the buttons at the bottom. The camera follows the action:
// close in on a helper while it's off on a job, back out to see everyone
// when it's done. Drag the ground to look about.
import { SIZE, isRoad, route, nearestRoad, jobAt, nextJob } from './town.js';
import { walkways, walkDoor, nearestWalk, junctions, crossings, isJunction, isLit, lights, walkSignal } from './streets.js';
import { Traffic, lanePoint, startDir, streetTiles } from './traffic.js';
import * as D from './draw.js';
import * as I from './iso.js';

const SPEED = { garbage: 2.2, mail: 2.6, mixer: 2, walker: 1.3, car: 1.6, person: 0.9 };
export const COLORS = { garbage: '#2a9d8f', mail: '#e63946', mixer: '#ff9f1c', walker: '#7b2cbf' };
// The jobs, as pictures in the tray.
const ICONS = { bin: '🗑️', dump: '♻️', letter: '✉️', parcel: '📦', walk: '🐕', home: '🏠', build: '🧱' };
// How long the postal worker takes to hop out, go up to the door and back.
const DELIVER = 2;
const PEOPLE = ['#ef476f', '#118ab2', '#ffd166', '#06d6a0'];
const SIGNS = { post: '✉️', shop: '🍎', cafe: '🍦', dump: '♻️', yard: '🚧' };
const BUILDINGS = { post: ['#e63946', '#8d1b26'], shop: ['#ffd166', '#e09f3e'], cafe: ['#f4a261', '#9c6644'] };
const BTN = 28; // the turn buttons' radius
const BOX = 40; // the tray's pictures (and the gap between them: 5)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
    // Which way each is facing (turning smoothly as it goes).
    for (const m of movers) {
      m.head = m.dir ? Math.atan2(m.dir.y, m.dir.x) : r() * Math.PI * 2;
      m.px = m.x;
      m.py = m.y;
    }
    this.said = -99;
    // The camera: the whole town to begin with, then in to the helpers.
    this.view = new I.View();
    this.rot = 0; // quarter turns
    this.spin = null;
    this.cam = { x: SIZE / 2, y: SIZE / 2, k: 0 };
    this.intro = 1.2;
    this.calm = 9; // seconds since a helper was busy
    this.manual = 0; // seconds left of looking where you dragged it
    this.focus = null;
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

  // The town above, and below it a band with the tray of jobs between the
  // two turn buttons. How close the camera comes: the whole town (fit), the
  // usual view (out), and close in on the action (in).
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.dpr = dpr;
    this.W = rect.width;
    this.H = rect.height;
    const n = this.town.jobs.length;
    this.per = Math.max(1, Math.floor((this.W - 4 * BTN - 30) / (BOX + 5)));
    this.trayH = Math.max(2 * BTN + 16, Math.ceil(n / this.per) * (BOX + 5) + 14);
    this.viewH = Math.max(50, this.H - this.trayH);
    this.view.ox = this.W / 2;
    this.view.oy = this.viewH / 2;
    this.kFit = Math.max(6, Math.min((this.W - 16) / (SIZE * 1.42), (this.viewH - 16) / (SIZE * 0.71 + 1)));
    this.kOut = Math.max(this.kFit, Math.min(this.W * 1.25, this.viewH) / 7);
    this.kIn = this.kOut * 1.6;
    if (!this.cam.k) this.cam.k = this.kFit;
    const y = this.viewH + this.trayH / 2;
    this.buttons = [{ x: BTN + 10, y, dir: -1 }, { x: this.W - BTN - 10, y, dir: 1 }];
    this.camera(0);
  }

  // Where a point in the town is on the page (for the end-to-end tests).
  screenOf(x, y, z = 0) {
    const r = this.canvas.getBoundingClientRect();
    const [sx, sy] = this.view.at(x, y, z);
    return { x: r.left + sx, y: r.top + sy };
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
      case 'parcel':
        // The postal worker hops out, takes it up to the house (the front
        // door, when the street's in front) and hops back in.
        h.pause = DELIVER;
        h.deliver = {
          t: 0, from: { x: h.x, y: h.y }, at, kind: job.kind,
          to: { x: Math.max(p.x + 0.2, Math.min(p.x + 0.8, h.x)), y: Math.max(p.y + 0.2, Math.min(p.y + 0.86, h.y)) },
        };
        this.hooks.sfx?.('pop');
        return;
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

  // The postal worker at the door: here's your letter (or package)!
  handOver(h) {
    const d = h.deliver;
    this.pop(d.kind === 'letter' ? '💌' : '🎁', d.at);
    this.hooks.sfx?.('ding');
    this.hooks.say?.(d.kind === 'letter' ? 'Here’s your letter!' : 'A package for you!');
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

  pointer(e, type) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (type === 'down') {
      e.preventDefault();
      this.canvas.setPointerCapture?.(e.pointerId);
      // The turn buttons.
      const b = this.buttons.find((q) => Math.hypot(q.x - sx, q.y - sy) < BTN + 10);
      if (b) {
        this.turn(b.dir);
        return;
      }
      if (sy > this.viewH) return;
      // The nearest helper (or passer-by) within reach of the finger.
      const reach = Math.max(30, this.view.k * 0.55);
      const near = (list) => list.map((h) => {
        const [hx, hy] = this.view.at(h.x, h.y, 0.25);
        return { h, d: Math.hypot(hx - sx, hy - sy) };
      }).filter((o) => o.d < reach).sort((a, c) => a.d - c.d)[0]?.h;
      const h = near(this.helpers);
      if (h) {
        h.hop = 1;
        if (this.town.drive) {
          this.drag = { h, id: e.pointerId, moved: false, sx, sy };
          this.focus = h;
          this.manual = 0;
        } else if (!h.path.length && h.pause <= 0) {
          this.send(h);
          this.focus = h;
          this.manual = 0;
        } else this.hooks.sfx?.('tap');
        return;
      }
      const a = near(this.ambient);
      if (a) {
        a.hop = 1;
        this.hooks.sfx?.(a.kind === 'car' ? 'honk' : 'pop');
        return;
      }
      // Otherwise: drag the town about, to look round.
      this.pan = { id: e.pointerId, sx, sy, x: this.cam.x, y: this.cam.y };
      return;
    }
    if (this.pan && e.pointerId === this.pan.id) {
      if (type === 'move') {
        if (Math.hypot(sx - this.pan.sx, sy - this.pan.sy) > 8) this.manual = 4;
        if (this.manual > 0) {
          const d = this.view.shift(sx - this.pan.sx, sy - this.pan.sy);
          this.cam.x = clamp(this.pan.x - d.x, 0, SIZE);
          this.cam.y = clamp(this.pan.y - d.y, 0, SIZE);
        }
      } else this.pan = null;
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    if (type === 'move') {
      Object.assign(this.drag, { sx, sy });
      this.steer();
    } else {
      this.drag = null;
    }
  }

  // Leading a helper with a finger: along the streets (or the sidewalks)
  // toward the spot under it.
  steer() {
    const d = this.drag;
    const h = d.h;
    const p = this.view.ground(d.sx, d.sy);
    if (h.kind === 'walker') {
      const to = nearestWalk(this.walk, p.x, p.y);
      if (to === d.to) return;
      d.to = to;
      d.moved = true;
      this.driven = true;
      const at = this.walk.nodes[h.node];
      const from = h.path.length && Math.hypot(h.x - at.x, h.y - at.y) > 1e-6 ? h.path[0] : h.node;
      const way = this.walk.route(from, to);
      h.path = from === h.node ? way.slice(1) : way;
      return;
    }
    const to = nearestRoad(p.x, p.y);
    if (d.to && to.x === d.to.x && to.y === d.to.y) return;
    d.to = to;
    d.moved = true;
    this.driven = true;
    const from = h.path[0] || h.tile;
    h.path = route(from, to);
    if (!h.path.length || (h.path[0].x === h.tile.x && h.path[0].y === h.tile.y && !h.path[1])) h.path = [];
  }

  // A quarter turn of the town (dir 1: clockwise).
  turn(dir) {
    this.rot += dir;
    this.spin = { from: this.view.yaw, to: this.rot, t: 0 };
    this.hooks.sfx?.('tap');
  }

  // ------------------------------------------------------------- camera

  // Where the camera wants to be: on the helper that's busy (the one tapped
  // last), close in; a moment after the job's done, back out to see all the
  // helpers and where they're going next. Still while a finger is leading
  // one (so the spot under it stays put), or after the town's been dragged.
  goal(dt) {
    const busy = (h) => h.path.length > 0 || h.pause > 0 || !!h.deliver;
    if (this.won) return { x: SIZE / 2, y: SIZE / 2, k: this.kFit };
    if (this.drag) {
      this.calm = 0;
      return null;
    }
    const f = (this.focus && busy(this.focus) && this.focus) || this.helpers.find(busy);
    if (f) {
      this.focus = f;
      this.calm = 0;
      return this.manual > 0 ? null : { x: f.x, y: f.y, k: this.kIn };
    }
    this.calm += dt;
    if (this.manual > 0 || this.calm < 0.9) return null;
    if (this.intro > 0) return { x: SIZE / 2, y: SIZE / 2, k: this.kFit };
    const pts = [];
    for (const h of this.helpers) {
      pts.push([h.x, h.y]);
      const p = this.targetPlace(h);
      if (p) pts.push([p.x + (p.w || 1) / 2, p.y + (p.h || 1) / 2]);
    }
    const { c, s } = this.view;
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of pts) {
      const u = x * c - y * s;
      const v = x * s + y * c;
      [u0, u1, v0, v1] = [Math.min(u0, u), Math.max(u1, u), Math.min(v0, v), Math.max(v1, v)];
    }
    const k = clamp(Math.min((this.W - 100) / (u1 - u0 + 1e-6), (this.viewH - 160) / ((v1 - v0) * 0.5 + 1e-6)), this.kFit, this.kOut);
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2 - 0.4; // (a little higher: the arrows stand up over the places)
    return { x: um * c + vm * s, y: -um * s + vm * c, k };
  }

  camera(dt) {
    if (this.spin) {
      this.spin.t = Math.min(1, this.spin.t + dt / 0.6);
      const u = this.spin.t;
      this.view.turn(this.spin.from + (this.spin.to - this.spin.from) * u * u * (3 - 2 * u));
      if (u >= 1) this.spin = null;
    }
    this.intro -= dt;
    this.manual -= dt;
    const c = this.cam;
    const goal = this.goal(dt);
    if (goal) {
      const a = 1 - Math.exp(-dt * 2.6);
      c.x += (goal.x - c.x) * a;
      c.y += (goal.y - c.y) * a;
      c.k += (goal.k - c.k) * (1 - Math.exp(-dt * 1.8));
    }
    // Leading a helper off the edge of the screen: the town scrolls along.
    const d = this.drag;
    if (d?.moved) {
      const m = 50;
      const ex = d.sx < m ? d.sx - m : d.sx > this.W - m ? d.sx - this.W + m : 0;
      const ey = d.sy < m ? d.sy - m : d.sy > this.viewH - m ? d.sy - this.viewH + m : 0;
      if (ex || ey) {
        const s = this.view.shift(ex * dt * 3, ey * dt * 3);
        c.x += s.x;
        c.y += s.y;
        this.steer();
      }
    }
    c.x = clamp(c.x, 0, SIZE);
    c.y = clamp(c.y, 0, SIZE);
    Object.assign(this.view, { x: c.x, y: c.y, k: c.k });
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
      if (h.deliver) {
        const was = h.deliver.t;
        h.deliver.t += dt;
        if (was < DELIVER / 2 && h.deliver.t >= DELIVER / 2) this.handOver(h);
        if (h.deliver.t >= DELIVER) h.deliver = null;
      }
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
    // Everyone turns smoothly to face the way they're going.
    for (const m of [...this.helpers, ...this.ambient]) {
      const dx = m.x - m.px;
      const dy = m.y - m.py;
      if (dx * dx + dy * dy > 1e-8) {
        const d = Math.atan2(dy, dx) - m.head;
        m.head += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 12);
      }
      m.px = m.x;
      m.py = m.y;
    }
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 1.4);
    for (const c of this.confetti) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.a += dt * 6;
    }
    this.confetti = this.confetti.filter((c) => c.y < this.H + 20);
    this.camera(dt);
  }

  // --------------------------------------------------------------- draw

  draw() {
    const { g, view } = this;
    const k = view.k;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, this.viewH);
    sky.addColorStop(0, '#a9dcff');
    sky.addColorStop(1, '#e4f6ff');
    g.fillStyle = sky;
    g.fillRect(0, 0, this.W, this.viewH);
    g.save();
    g.beginPath();
    g.rect(0, 0, this.W, this.viewH);
    g.clip();
    I.paint(g, view, I.slab(SIZE).parts);
    this.drawGround();
    // Shadows on the ground.
    const shadow = 'rgba(0,0,0,0.16)';
    for (const m of [...this.helpers, ...this.ambient]) I.disc(g, view, m.x, m.y, m.kind === 'person' || m.kind === 'walker' ? 0.12 : 0.3, m.kind === 'person' || m.kind === 'walker' ? 0.12 : 0.3, shadow);
    // Where each helper's going next, while driving: a dotted trail along
    // the streets (or sidewalks) to it.
    const bob = Math.sin(this.t * 5) * k * 0.06;
    const ways = new Map();
    for (const h of this.helpers) {
      if (h.path.length || h.pause > 0 || !this.targetPlace(h)) continue;
      ways.set(h, this.way(h));
      if (!this.town.drive) continue;
      g.strokeStyle = COLORS[h.kind];
      g.globalAlpha = 0.6;
      g.lineWidth = Math.max(2, k * 0.08);
      g.setLineDash([k * 0.08, k * 0.14]);
      g.beginPath();
      ways.get(h).forEach((p, i) => {
        const [x, y] = view.at(p.x, p.y);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    // Everything standing up, back to front -- see-through when it's in
    // front of a helper.
    const things = this.things();
    const spots = this.helpers.map((h) => ({ d: view.depth(h.x, h.y), at: view.at(h.x, h.y, 0.2) }));
    for (const o of things.sort((a, b) => a.d - b.d)) {
      let alpha = 1;
      if (o.tall) {
        const [ox, oy] = view.at(o.x, o.y);
        if (spots.some((s) => s.d < o.d && Math.abs(s.at[0] - ox) < k * 0.5 && s.at[1] > oy - k * o.tall && s.at[1] < oy + k * 0.3)) alpha = 0.35;
      }
      o.draw(alpha);
    }
    // Arrows over where the helpers are going, and the letters and parcels
    // houses are waiting for.
    const waiting = new Map();
    for (const j of this.town.jobs) if (!this.done.has(j.i) && (j.kind === 'letter' || j.kind === 'parcel')) waiting.set(j.place, ICONS[j.kind]);
    for (const p of this.town.places) {
      if (!waiting.has(p.id)) continue;
      const [x, y] = view.at(p.x + (p.w || 1) / 2, p.y + (p.h || 1) / 2, 0.75);
      D.bubble(g, x, y, k * 0.9, waiting.get(p.id), bob);
    }
    for (const [h, way] of ways) {
      const dest = this.targetPlace(h);
      const [x, y] = view.at(dest.x + (dest.w || 1) / 2, dest.y + (dest.h || 1) / 2, 0.85);
      D.arrow(g, x, y, k, COLORS[h.kind], bob);
      // (Until you've driven one: a finger showing how, along the trail.)
      if (this.town.drive && !this.driven && h === this.helpers.find((o) => ways.has(o)) && way.length > 1) {
        const f = Math.min(1, (this.t % 3) / 2.4) * (way.length - 1);
        const a = way[Math.floor(f)];
        const b = way[Math.min(way.length - 1, Math.floor(f) + 1)];
        const u = f - Math.floor(f);
        const [hx, hy] = view.at(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
        g.font = `${Math.round(Math.max(28, k * 0.7))}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('👆', hx + k * 0.12, hy + k * 0.3);
      }
    }
    // Little pictures popping up where a job was done.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.fx) {
      const [x, y] = view.at(f.x, f.y, 0.7 + f.t * 0.8);
      g.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      g.font = `${Math.round(k * (0.5 + f.t * 0.3))}px system-ui, sans-serif`;
      g.fillText(f.icon, x, y);
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

  // Is a spot in the town too far off screen for anything there to show?
  offScreen(x, y) {
    const [sx, sy] = this.view.at(x, y);
    const k = this.view.k;
    return sx < -k * 1.3 || sx > this.W + k * 1.3 || sy < -k * 0.7 || sy > this.viewH + k * 1.3;
  }

  // The ground: the places' yards, the sidewalks and streets, the middle
  // lines, crosswalks and stop lines.
  drawGround() {
    const { g, view } = this;
    const R = (x0, y0, x1, y1, c) => I.rect(g, view, x0, y0, x1, y1, c);
    for (const p of this.town.places) {
      const c = { park: '#6cc04a', lot: '#c8a27a', dump: '#a98467', yard: '#e9c46a' }[p.kind];
      if (c) R(p.x + 0.06, p.y + 0.06, p.x + (p.w || 1) - 0.06, p.y + (p.h || 1) - 0.06, c);
      if (p.kind === 'park') I.disc(g, view, p.x + 1.25, p.y + 1.2, 0.42, 0.3, '#4cc9f0');
    }
    const roads = [];
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (isRoad(x, y) && !this.offScreen(x + 0.5, y + 0.5)) roads.push([x, y]);
    const W = 0.18;
    for (const [x, y] of roads) R(x - W, y - W, x + 1 + W, y + 1 + W, '#b5bac2');
    for (const [x, y] of roads) R(x - W + 0.02, y - W + 0.02, x + 1 + W - 0.02, y + 1 + W - 0.02, '#e1e4e9');
    for (const [x, y] of roads) R(x - 0.003, y - 0.003, x + 1.003, y + 1.003, '#5d6470');
    const white = '#f8f9fa';
    for (const [x, y] of roads) {
      if (isJunction(x, y)) continue;
      const ns = isRoad(x, y - 1) || isRoad(x, y + 1);
      const a = (ns ? isJunction(x, y - 1) : isJunction(x - 1, y)) ? 0.44 : 0;
      const b = (ns ? isJunction(x, y + 1) : isJunction(x + 1, y)) ? 0.56 : 1;
      for (let u = a + 0.04; u < b - 0.04; u += 0.32) {
        const e = Math.min(b, u + 0.18);
        if (ns) R(x + 0.475, y + u, x + 0.525, y + e, white);
        else R(x + u, y + 0.475, x + e, y + 0.525, white);
      }
    }
    for (const { ix: x, iy: y, arm } of this.crossings) {
      if (this.offScreen(x + 0.5, y + 0.5)) continue;
      for (let q = 0; q < 5; q++) {
        const o = 0.06 + q * 0.2;
        if (arm === 'n') R(x + o, y - 0.4, x + o + 0.1, y - 0.1, white);
        if (arm === 's') R(x + o, y + 1.1, x + o + 0.1, y + 1.4, white);
        if (arm === 'w') R(x - 0.4, y + o, x - 0.1, y + o + 0.1, white);
        if (arm === 'e') R(x + 1.1, y + o, x + 1.4, y + o + 0.1, white);
      }
      if (arm === 'n') R(x, y - 0.48, x + 0.5, y - 0.44, white);
      if (arm === 's') R(x + 0.5, y + 1.44, x + 1, y + 1.48, white);
      if (arm === 'w') R(x - 0.48, y + 0.5, x - 0.44, y + 1, white);
      if (arm === 'e') R(x + 1.44, y, x + 1.48, y + 0.5, white);
    }
  }

  // Everything standing up in the town: { x, y (where it stands), d (how
  // near), tall (how high it stands, if it can hide a helper), draw(alpha) }.
  things() {
    const { g, view, t } = this;
    const k = view.k;
    const list = [];
    const add = (x, y, draw, tall = 0) => {
      if (this.offScreen(x, y)) return;
      list.push({ x, y, d: view.depth(x, y), tall, draw });
    };
    const model = (m, tall) => add(m.x, m.y, (a) => I.paint(g, view, m.parts, a), tall);
    const sign = (x, y, z, icon) => {
      const [sx, sy] = view.at(x, y, z);
      g.font = `${Math.round(k * 0.34)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(icon, sx, sy);
    };
    const taken = new Set();
    for (const p of this.town.places) {
      for (let x = p.x; x < p.x + (p.w || 1); x++) for (let y = p.y; y < p.y + (p.h || 1); y++) taken.add(y * SIZE + x);
      const cx = p.x + (p.w || 1) / 2;
      const cy = p.y + (p.h || 1) / 2;
      const h = Math.atan2(p.door.y - p.y, p.door.x - p.x);
      if (p.kind === 'home') model(I.house(cx, cy, h, p.color), 0.95);
      else if (BUILDINGS[p.kind]) {
        const m = I.building(cx, cy, h, ...BUILDINGS[p.kind]);
        add(cx, cy, (a) => {
          I.paint(g, view, m.parts, a);
          g.globalAlpha = a;
          sign(cx + Math.cos(h) * 0.39, cy + Math.sin(h) * 0.39, 0.47, SIGNS[p.kind]);
          g.globalAlpha = 1;
        }, 0.95);
      } else if (p.kind === 'lot') {
        if (this.stage[p.id]) model(I.house(cx, cy, h, p.color, this.stage[p.id]), 0.95);
        else model(I.stakes(cx, cy));
      } else if (p.kind === 'dump' || p.kind === 'yard') {
        const m = p.kind === 'dump' ? I.heap(cx, cy) : I.bricks(cx, cy);
        add(cx, cy, (a) => {
          I.paint(g, view, m.parts, a);
          sign(cx, cy, 0.6, SIGNS[p.kind]);
        });
      } else if (p.kind === 'park') {
        for (const [tx, ty, size] of [[0.45, 0.5, 1.1], [1.5, 0.45, 0.95], [0.5, 1.5, 0.9]]) model(I.tree(p.x + tx, p.y + ty, size), 0.75);
        model(I.bench(p.x + 0.95, p.y + 0.9));
      }
      // A bin out by the door, waiting for the truck.
      if (this.town.jobs.some((j) => j.kind === 'bin' && j.place === p.id && !this.done.has(j.i))) {
        model(I.bin(cx + (p.door.x - p.x) * 0.4, cy + (p.door.y - p.y) * 0.4));
      }
    }
    // Trees where there's nothing else.
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        if (isRoad(x, y) || taken.has(y * SIZE + x)) continue;
        model(I.tree(x + 0.32, y + 0.36, 1), 0.75);
        model(I.tree(x + 0.7, y + 0.68, 0.8), 0.6);
      }
    }
    // The traffic lights on the corners, and the walk signals by the
    // crosswalks.
    for (const { x, y } of this.junctions) {
      if (!isLit(x, y)) continue;
      const l = lights(x, y, t);
      for (const [cx, cy, axis] of [[-0.1, -0.34, 'ns'], [1.1, -0.34, 'ew'], [-0.1, 1.24, 'ew'], [1.1, 1.24, 'ns']]) {
        const m = I.pole(x + cx, y + cy, 0.42);
        add(x + cx, y + cy, () => {
          I.paint(g, view, m.parts);
          const [sx, sy] = view.at(x + cx, y + cy, 0.62);
          D.signal(g, sx, sy, k * 0.8, l[axis]);
        });
      }
    }
    const ENDS = { n: [[-0.1, -0.62], [1.1, -0.62]], s: [[-0.1, 1.62], [1.1, 1.62]], w: [[-0.62, -0.1], [-0.62, 1.1]], e: [[1.62, -0.1], [1.62, 1.1]] };
    for (const c of this.crossings) {
      if (!isLit(c.ix, c.iy)) continue;
      const sign2 = walkSignal(c, t);
      for (const [cx, cy] of ENDS[c.arm]) {
        const m = I.pole(c.ix + cx, c.iy + cy, 0.3);
        add(c.ix + cx, c.iy + cy, () => {
          I.paint(g, view, m.parts);
          const [sx, sy] = view.at(c.ix + cx, c.iy + cy, 0.38);
          D.walkSign(g, sx, sy, k * 0.7, sign2, t);
        });
      }
    }
    // Everyone on the move. (Helpers with work to do bob now and then, to
    // say "tap me".)
    for (const m of [...this.ambient, ...this.helpers]) {
      const helper = this.helpers.includes(m);
      const idle = helper && !m.path.length && m.pause <= 0 && this.target(m);
      const lift = Math.sin(m.hop * Math.PI) * 0.35 + (idle ? Math.max(0, Math.sin(t * 4)) * 0.15 : 0);
      const going = m.path.length > 0 && !m.wait;
      if (m.kind === 'person' || m.kind === 'walker') {
        const dog = m.kind === 'walker';
        model(I.person(m.x, m.y, m.head, t, dog ? COLORS.walker : m.color, { walking: going || m.playing > 0, dog, z: lift }));
      } else {
        const v = I.vehicle(m.kind, m.x, m.y, m.head, t, m.color, lift);
        add(m.x, m.y, (a) => {
          I.paint(g, view, v.parts, a);
          if (m.kind === 'garbage' && m.load) sign(m.x, m.y, 0.75 + lift, '🗑️'.repeat(Math.min(3, m.load)));
        });
      }
      // The postal worker out of the van, up to the door with the letter
      // or parcel, and back without it.
      const d = m.deliver;
      if (d) {
        const f = d.t / DELIVER;
        const out = f < 0.5;
        const q = out ? Math.min(1, f / 0.4) : Math.max(0, 1 - (f - 0.6) / 0.4);
        const e = q * q * (3 - 2 * q);
        const px = d.from.x + (d.to.x - d.from.x) * e;
        const py = d.from.y + (d.to.y - d.from.y) * e;
        const head = Math.atan2(d.to.y - d.from.y, d.to.x - d.from.x) + (out ? 0 : Math.PI);
        model(I.person(px, py, head, t, '#1d4e89', { walking: q > 0 && q < 1, postie: true, carry: out ? d.kind : null }));
      }
    }
    return list;
  }

  // The level's jobs as pictures, each ticked off when it's done, between
  // the two turn buttons.
  drawTray() {
    const { g } = this;
    const top = this.viewH;
    g.fillStyle = '#f1f5f9';
    g.fillRect(0, top, this.W, this.trayH);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, top, this.W, 2);
    const jobs = this.town.jobs;
    const box = BOX;
    const gap = 5;
    const cols = Math.min(jobs.length, this.per);
    const rows = Math.ceil(jobs.length / this.per);
    const y0 = top + (this.trayH - rows * (box + gap) + gap) / 2;
    jobs.forEach((j, n) => {
      const x = (this.W - cols * (box + gap) + gap) / 2 + (n % this.per) * (box + gap);
      const y = y0 + Math.floor(n / this.per) * (box + gap);
      const done = this.done.has(j.i);
      g.fillStyle = done ? '#c7f9cc' : '#fff';
      g.strokeStyle = COLORS[this.town.helpers.find((h) => h.id === j.helper).kind];
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(x, y, box, box, 10);
      g.fill();
      g.stroke();
      g.font = '24px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = done ? 0.45 : 1;
      g.fillText(j.kind === 'build' && j.stage === 3 ? '🏠' : ICONS[j.kind], x + box / 2, y + box / 2 + 1);
      g.globalAlpha = 1;
      if (done) {
        g.font = '900 22px system-ui, sans-serif';
        g.fillStyle = '#2b9348';
        g.fillText('✓', x + box - 9, y + 11);
      }
    });
    // The turn buttons: round arrows, anticlockwise and clockwise.
    for (const b of this.buttons) {
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#1d3557';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(b.x, b.y, BTN, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      const r = BTN * 0.5;
      const a0 = -Math.PI * 0.85;
      const a1 = Math.PI * 0.45;
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(b.x, b.y, r, a0, a1, false);
      g.stroke();
      // The arrowhead, at the end it turns toward.
      const end = b.dir > 0 ? a1 : a0;
      const ex = b.x + r * Math.cos(end);
      const ey = b.y + r * Math.sin(end);
      const tx = -Math.sin(end) * b.dir;
      const ty = Math.cos(end) * b.dir;
      g.fillStyle = '#1d3557';
      g.beginPath();
      g.moveTo(ex + tx * 7, ey + ty * 7);
      g.lineTo(ex - ty * 6 - tx * 3, ey + tx * 6 - ty * 3);
      g.lineTo(ex + ty * 6 - tx * 3, ey - tx * 6 - ty * 3);
      g.closePath();
      g.fill();
    }
  }
}
