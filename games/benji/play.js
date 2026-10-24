// Benji's Town: the town on screen, in 3D -- the helpers going about their
// jobs, people and cars pottering about, and a tray of the level's jobs
// ticking off. Tap a helper and it goes to its next job (the early levels);
// later, tap one and you're its driver -- or walking the dog -- seeing the
// town from the driver's seat. Everyone minds the traffic lights (you too),
// and people cross only at the crosswalks.
//
// The town is seen from above at an angle (isometric), turned a quarter at
// a time with the buttons at the bottom. The camera follows the action:
// close in on a helper while it's off on a job, back out to see everyone
// when it's done. Drag the ground to look about.
import { SIZE, isRoad, route, nearestRoad, jobAt, nextJob } from './town.js';
import { walkways, walkDoor, nearestWalk, junctions, crossings, isJunction, isLit, lights, walkSignal } from './streets.js';
import { Traffic, lanePoint, startDir, streetTiles } from './traffic.js';
import { ahead, driveTurn, walkAhead, walkTurn } from './steer.js';
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
    this.eye = new I.Eye(); // (in the driver's seat)
    this.fp = null; // whose seat you're in: { h, gas, v, intent, hint, ... }
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
    // In the driver's seat: the view, and the buttons -- ◀ ▲ ▶ along the
    // bottom, and back to the town top left.
    this.seatH = this.H - 110;
    const py = this.H - 55;
    this.pads = [
      { act: 'left', x: this.W * 0.18, y: py, r: 34 },
      { act: 'go', x: this.W / 2, y: py, r: 42 },
      { act: 'right', x: this.W * 0.82, y: py, r: 34 },
      { act: 'exit', x: 34, y: 34, r: 24 },
    ];
    this.eye.F = this.W / 2 / Math.tan((40 * Math.PI) / 180);
    this.eye.ox = this.W / 2;
    this.eye.oy = this.seatH * 0.36;
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
    if (this.fp) {
      this.seat(e, type, sx, sy);
      return;
    }
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
        // Tap one to send it off (the early levels) -- or to be its driver.
        if (this.town.drive) {
          if (this.targetPlace(h) && !this.won && h.pause <= 0) this.enter(h);
          else this.hooks.sfx?.('tap');
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
    }
  }

  // In the driver's seat (or walking the dog): hold ▲ to go; ◀ and ▶ turn
  // at the next corner (turn round, walking, when that's the way); the
  // button at the top back out to the town. A tap anywhere else: honk!
  seat(e, type, sx, sy) {
    const f = this.fp;
    if (type === 'down') {
      e.preventDefault();
      this.canvas.setPointerCapture?.(e.pointerId);
      const b = this.pads.find((q) => Math.hypot(q.x - sx, q.y - sy) < q.r + 12);
      if (!b) this.hooks.sfx?.(f.h.kind === 'walker' ? 'pop' : 'honk');
      else if (b.act === 'exit') this.leave();
      else if (b.act === 'go') f.gas = e.pointerId;
      else {
        f.intent = f.h.kind === 'walker' && f.hint === 'back' ? 'back' : b.act;
        this.hooks.sfx?.('tap');
      }
      return;
    }
    if (type !== 'move' && f.gas === e.pointerId) f.gas = null;
  }

  // Into the driver's seat of a helper (or the dog walker's shoes).
  enter(h) {
    h.path = [];
    this.fp = { h, gas: null, v: 0, intent: 'straight', hint: null, head: h.head, wheel: 0, done: 0, said: null, saidT: -9, last: h.kind === 'walker' ? h.node : h.tile };
    this.focus = h;
    this.hooks.sfx?.(h.kind === 'walker' ? 'pop' : 'honk');
    this.hooks.say?.('Let’s go!');
  }

  // Back out to the town (the helper stops at the next street tile).
  leave() {
    const h = this.fp.h;
    this.fp = null;
    if (h.kind === 'walker') h.path = h.path.slice(0, 1);
    else h.path = isJunction(h.path[0]?.x, h.path[0]?.y) ? h.path.slice(0, 2) : h.path.slice(0, 1);
    Object.assign(this.cam, { x: h.x, y: h.y, k: this.kIn });
    this.calm = 0;
    this.manual = 0;
  }

  // A quarter turn of the town (dir 1: clockwise).
  turn(dir) {
    this.rot += dir;
    this.spin = { from: this.view.yaw, to: this.rot, t: 0 };
    this.hooks.sfx?.('tap');
  }

  // ------------------------------------------------------ driving yourself

  fpSteer(dt) {
    const f = this.fp;
    const h = f.h;
    const busy = h.pause > 0 || !!h.deliver;
    const want = f.gas !== null && !busy ? SPEED[h.kind] : 0;
    f.v += clamp(want - f.v, -6 * dt, 3 * dt);
    if (h.kind === 'walker') this.planWalk(f, h);
    else this.planDrive(f, h);
    // Which way you're looking, and the wheel, turning with you.
    const d = h.head - f.head;
    const turnRate = Math.atan2(Math.sin(d), Math.cos(d));
    f.head += turnRate * Math.min(1, dt * 6);
    const lean = { left: -0.5, right: 0.5 }[f.intent] || 0;
    f.wheel += (clamp(turnRate * 3, -1.4, 1.4) + lean - f.wheel) * Math.min(1, dt * 6);
    // A word when there's a turn to make.
    if (['left', 'right', 'back'].includes(f.hint) && f.hint !== f.intent && f.hint !== f.said && this.t - f.saidT > 4) {
      f.said = f.hint;
      f.saidT = this.t;
      this.hooks.say?.({ left: 'Turn left!', right: 'Turn right!', back: 'Turn around!' }[f.hint]);
    }
    if (f.hint === 'straight' || !f.hint) f.said = null;
    // Back out to the town a moment after its jobs are all done.
    if (!this.targetPlace(h) && !busy) {
      f.done += dt;
      if (f.done > 1.5) this.leave();
    } else f.done = 0;
  }

  // Driving: the street on ahead from where you are (or the tile you're
  // heading into), turning at the next intersection the way you asked --
  // till the light lets you through; then that's the way you're going.
  planDrive(f, h) {
    if (!isJunction(h.tile.x, h.tile.y) && isJunction(f.last.x, f.last.y)) f.intent = 'straight';
    f.last = h.tile;
    const at = lanePoint(h.tile, h.dir);
    const moving = h.path.length > 0 && Math.hypot(h.x - at.x, h.y - at.y) > 0.02;
    const base = moving ? h.path[0] : h.tile;
    const dir = moving && (base.x !== h.tile.x || base.y !== h.tile.y) ? { x: base.x - h.tile.x, y: base.y - h.tile.y } : h.dir;
    const to = this.target(h);
    f.hint = to ? driveTurn(base, dir, to) : null;
    f.route = to ? this.driveRoute(base, dir, to) : [];
    if (isJunction(base.x, base.y) && h.pass === `${base.x},${base.y}` && h.path.length) return;
    h.path = [...(moving ? [base] : []), ...ahead(base, dir, f.intent)];
  }

  // The way the turns shown would take you (for the dots on the road).
  driveRoute(t, d, to) {
    const out = [t];
    for (let n = 0; n < 40 && (t.x !== to.x || t.y !== to.y); n++) {
      const next = ahead(t, d, driveTurn(t, d, to))[0];
      if (!next) break;
      d = { x: next.x - t.x, y: next.y - t.y };
      t = next;
      out.push(t);
    }
    return out.map((q, i) => lanePoint(q, i ? { x: q.x - out[i - 1].x, y: q.y - out[i - 1].y } : d));
  }

  // Walking the dog: along the sidewalk the way you're facing, round the
  // bends, and where the way divides, the way you asked (or back round).
  planWalk(f, h) {
    const w = this.walk;
    if (h.node !== f.last && w.adj[h.node].length > 2) f.intent = 'straight';
    f.last = h.node;
    let a = h.node;
    let b = h.path[0];
    if (b === undefined) {
      // Standing still: the way you're facing.
      const p = w.nodes[a];
      const fx = Math.cos(h.head);
      const fy = Math.sin(h.head);
      const ways = w.adj[a].map((e) => e.to).sort((u, v) => {
        const dot = (n) => ((w.nodes[n].x - p.x) * fx + (w.nodes[n].y - p.y) * fy) / Math.hypot(w.nodes[n].x - p.x, w.nodes[n].y - p.y);
        return dot(v) - dot(u);
      });
      b = f.intent === 'back' ? ways.at(-1) : ways[0];
      if (f.intent === 'back') f.intent = 'straight';
    } else if (f.intent === 'back') {
      [a, b] = [b, a];
      f.intent = 'straight';
    }
    const to = this.targetPlace(h) && this.spot.get(this.targetPlace(h).id);
    f.hint = to !== undefined && to !== false ? walkTurn(w, a, b, to) : null;
    f.route = to !== undefined && to !== false ? w.route(b, to).map((n) => w.nodes[n]) : [];
    h.path = [b, ...walkAhead(w, a, b, f.intent)];
  }

  // Where the postal worker is, out of the van on a delivery.
  postie(d) {
    const f = d.t / DELIVER;
    const out = f < 0.5;
    const q = out ? Math.min(1, f / 0.4) : Math.max(0, 1 - (f - 0.6) / 0.4);
    const e = q * q * (3 - 2 * q);
    return {
      x: d.from.x + (d.to.x - d.from.x) * e,
      y: d.from.y + (d.to.y - d.from.y) * e,
      head: Math.atan2(d.to.y - d.from.y, d.to.x - d.from.x) + (out ? 0 : Math.PI),
      out,
      walking: q > 0 && q < 1,
    };
  }

  // ------------------------------------------------------------- camera

  // Where the camera wants to be: on the helper that's busy (the one tapped
  // last), close in; a moment after the job's done, back out to see all the
  // helpers and where they're going next. Still for a while after the town's
  // been dragged.
  goal(dt) {
    const busy = (h) => h.path.length > 0 || h.pause > 0 || !!h.deliver;
    if (this.won) return { x: SIZE / 2, y: SIZE / 2, k: this.kFit };
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
    const goal = this.fp ? null : this.goal(dt);
    if (goal) {
      const a = 1 - Math.exp(-dt * 2.6);
      c.x += (goal.x - c.x) * a;
      c.y += (goal.y - c.y) * a;
      c.k += (goal.k - c.k) * (1 - Math.exp(-dt * 1.8));
    }
    c.x = clamp(c.x, 0, SIZE);
    c.y = clamp(c.y, 0, SIZE);
    Object.assign(this.view, { x: c.x, y: c.y, k: c.k });
  }

  // ------------------------------------------------------------- update

  update(dt) {
    this.t += dt;
    this.traffic.t = this.t;
    if (this.fp) this.fpSteer(dt);
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
      const speed = this.fp?.h === m ? this.fp.v : SPEED[m.kind];
      if (m.kind === 'walker' || m.kind === 'person') {
        const node = this.traffic.walk(m, speed, dt);
        if (node !== null && helper) this.reached(m, node);
      } else {
        const tile = this.traffic.drive(m, speed, dt);
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
    const { g } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.fp) this.drawSeat();
    else this.drawTown();
    for (const c of this.confetti) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.a);
      g.fillStyle = c.c;
      g.fillRect(-5, -3, 10, 6);
      g.restore();
    }
  }

  sky(h) {
    const { g } = this;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#a9dcff');
    sky.addColorStop(1, '#e4f6ff');
    g.fillStyle = sky;
    g.fillRect(0, 0, this.W, h);
  }

  // The town from above.
  drawTown() {
    const { g, view } = this;
    const k = view.k;
    this.sky(this.viewH);
    g.save();
    g.beginPath();
    g.rect(0, 0, this.W, this.viewH);
    g.clip();
    I.paint(g, view, I.slab(SIZE).parts);
    this.drawGround(view);
    // Everything standing up, back to front -- see-through when it's in
    // front of a helper.
    const spots = this.helpers.map((h) => ({ d: view.depth(h.x, h.y), at: view.at(h.x, h.y, 0.2) }));
    for (const o of this.things(view).sort((a, b) => a.d - b.d)) {
      let alpha = 1;
      if (o.tall) {
        const [ox, oy] = view.at(o.x, o.y);
        if (spots.some((s) => s.d < o.d && Math.abs(s.at[0] - ox) < k * 0.5 && s.at[1] > oy - k * o.tall && s.at[1] < oy + k * 0.3)) alpha = 0.35;
      }
      o.draw(alpha);
    }
    this.overlays(view, this.helpers.filter((h) => !h.path.length && h.pause <= 0));
    g.restore();
    this.drawTray(false);
  }

  // From the driver's seat (the walker's eyes; the postal worker's, out on
  // a delivery): the town all round at street level, the way to the job in
  // dots, the dashboard and wheel -- and the buttons.
  drawSeat() {
    const { g, eye } = this;
    const f = this.fp;
    const h = f.h;
    const d = h.deliver;
    if (d) {
      const p = this.postie(d);
      eye.set(p.x, p.y, 0.42, p.head, -0.28);
    } else if (h.kind === 'walker') eye.set(h.x - Math.cos(f.head) * 0.14, h.y - Math.sin(f.head) * 0.14, 0.5, f.head, -0.34);
    else eye.set(h.x + Math.cos(f.head) * 0.2, h.y + Math.sin(f.head) * 0.2, 0.36, f.head, -0.16);
    this.sky(this.seatH);
    g.save();
    g.beginPath();
    g.rect(0, 0, this.W, this.seatH);
    g.clip();
    // Fields all round the town, then the town.
    I.rect(g, eye, -40, -40, SIZE + 40, SIZE + 40, '#7cc15a');
    I.rect(g, eye, 0, 0, SIZE, SIZE, '#8fd16a');
    this.drawGround(eye);
    // The way to the job: dots along it.
    if (!d) {
      const pts = f.route || [];
      let left = 0;
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (; left < len; left += 0.35) {
          const u = left / len;
          I.disc(g, eye, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 0.06, 0.06, '#ffd166', 0.01);
        }
        left -= len;
      }
    }
    for (const o of this.things(eye).sort((a, b) => a.d - b.d)) o.draw(1);
    this.overlays(eye, d ? [] : [h]);
    // In the cab: the dashboard and the wheel, turning as you turn.
    if (h.kind !== 'walker' && !d) this.dashboard(h, f.wheel);
    // Out with the letter or parcel, held out in front.
    if (d && this.postie(d).out) {
      g.font = `${Math.round(this.W * 0.22)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ICONS[d.kind], this.W / 2, this.seatH - this.W * 0.13);
    }
    g.restore();
    this.drawPads();
    this.drawTray(true);
  }

  // The dashboard across the bottom of the windscreen, in the cab's colour,
  // and the steering wheel.
  dashboard(h, wheel) {
    const { g, W } = this;
    const top = this.seatH - Math.min(90, this.seatH * 0.16);
    g.fillStyle = { garbage: '#2f3e46', mail: '#3d0e14', mixer: '#4a3b1a' }[h.kind] || '#333333';
    g.beginPath();
    g.moveTo(0, this.seatH);
    g.lineTo(0, top + 18);
    g.quadraticCurveTo(W / 2, top - 14, W, top + 18);
    g.lineTo(W, this.seatH);
    g.closePath();
    g.fill();
    const r = Math.min(W * 0.2, 80);
    const cx = W / 2;
    const cy = this.seatH + r * 0.25;
    g.save();
    g.translate(cx, cy);
    g.rotate(wheel);
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = r * 0.22;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = r * 0.14;
    g.beginPath();
    for (const a of [Math.PI, 0, -Math.PI / 2]) {
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.stroke();
    g.fillStyle = COLORS[h.kind];
    g.beginPath();
    g.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Arrows over where the helpers (those given) are going next, and the
  // letters and parcels houses are waiting for; little pictures popping up
  // where a job was done.
  overlays(view, pointing) {
    const { g } = this;
    const bob = Math.sin(this.t * 5) * 0.06;
    const size = (x, y, z) => Math.min(150, view.scale(x, y, z));
    const waiting = new Map();
    for (const j of this.town.jobs) if (!this.done.has(j.i) && (j.kind === 'letter' || j.kind === 'parcel')) waiting.set(j.place, ICONS[j.kind]);
    for (const p of this.town.places) {
      if (!waiting.has(p.id)) continue;
      const [x, y, z] = [p.x + (p.w || 1) / 2, p.y + (p.h || 1) / 2, 0.75];
      const at = view.at(x, y, z);
      if (at) D.bubble(g, at[0], at[1], size(x, y, z) * 0.9, waiting.get(p.id), bob * size(x, y, z));
    }
    for (const h of pointing) {
      const dest = this.targetPlace(h);
      if (!dest) continue;
      const [x, y, z] = [dest.x + (dest.w || 1) / 2, dest.y + (dest.h || 1) / 2, 0.85];
      const at = view.at(x, y, z);
      if (at) D.arrow(g, at[0], at[1], size(x, y, z), COLORS[h.kind], bob * size(x, y, z));
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.fx) {
      const at = view.at(f.x, f.y, 0.7 + f.t * 0.8);
      if (!at) continue;
      g.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      g.font = `${Math.round(size(f.x, f.y, 0.7) * (0.5 + f.t * 0.3))}px system-ui, sans-serif`;
      g.fillText(f.icon, at[0], at[1]);
    }
    g.globalAlpha = 1;
  }

  // The driving buttons: ◀ ▲ ▶ along the bottom (the way to turn glowing),
  // and the way back out to the town, top left.
  drawPads() {
    const { g } = this;
    const f = this.fp;
    g.fillStyle = '#f1f5f9';
    g.fillRect(0, this.seatH, this.W, this.H - this.seatH);
    const glow = 0.5 + 0.5 * Math.sin(this.t * 8);
    for (const b of this.pads) {
      const lit = (b.act === 'left' || b.act === 'right') && (f.hint === b.act || f.hint === 'back') && f.intent !== b.act
        || (b.act === 'go' && f.gas === null && f.hint);
      if (lit) {
        g.fillStyle = `rgba(255,200,0,${0.35 + 0.4 * glow})`;
        g.beginPath();
        g.arc(b.x, b.y, b.r + 9, 0, Math.PI * 2);
        g.fill();
      }
      const on = (b.act === 'go' && f.gas !== null) || f.intent === b.act;
      g.fillStyle = b.act === 'go' ? (on ? '#1b9e4b' : '#2ecc71') : b.act === 'exit' ? '#ffffff' : on ? '#ffd166' : '#ffffff';
      g.strokeStyle = '#1d3557';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (b.act === 'exit') {
        g.font = `${Math.round(b.r * 1.1)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('🗺️', b.x, b.y + 1);
        continue;
      }
      // An arrow: up, left or right.
      const a = { go: -Math.PI / 2, left: Math.PI, right: 0 }[b.act];
      const s = b.r * 0.55;
      g.fillStyle = b.act === 'go' ? '#ffffff' : '#1d3557';
      g.beginPath();
      g.moveTo(b.x + Math.cos(a) * s, b.y + Math.sin(a) * s);
      g.lineTo(b.x + Math.cos(a + 2.4) * s, b.y + Math.sin(a + 2.4) * s);
      g.lineTo(b.x + Math.cos(a - 2.4) * s, b.y + Math.sin(a - 2.4) * s);
      g.closePath();
      g.fill();
    }
  }

  // Could anything at (x, y) show, from this camera?
  seen(view, x, y) {
    if (view instanceof I.Eye) return view.sees(x, y);
    const [sx, sy] = view.at(x, y);
    const k = view.k;
    return sx > -k * 1.3 && sx < this.W + k * 1.3 && sy > -k * 0.7 && sy < this.viewH + k * 1.3;
  }

  // The ground: the places' yards, the sidewalks and streets, the middle
  // lines, crosswalks and stop lines.
  drawGround(view) {
    const { g } = this;
    const R = (x0, y0, x1, y1, c) => I.rect(g, view, x0, y0, x1, y1, c);
    for (const p of this.town.places) {
      const c = { park: '#6cc04a', lot: '#c8a27a', dump: '#a98467', yard: '#e9c46a' }[p.kind];
      if (c) R(p.x + 0.06, p.y + 0.06, p.x + (p.w || 1) - 0.06, p.y + (p.h || 1) - 0.06, c);
      if (p.kind === 'park') I.disc(g, view, p.x + 1.25, p.y + 1.2, 0.42, 0.3, '#4cc9f0');
    }
    const roads = [];
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (isRoad(x, y) && this.seen(view, x + 0.5, y + 0.5)) roads.push([x, y]);
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
      if (!this.seen(view, x + 0.5, y + 0.5)) continue;
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
    // Shadows under everyone.
    for (const m of [...this.helpers, ...this.ambient]) {
      if (this.fp?.h === m && !m.deliver) continue;
      const r = m.kind === 'person' || m.kind === 'walker' ? 0.12 : 0.3;
      if (view instanceof I.Eye && Math.hypot(m.x - view.x, m.y - view.y) < 0.45) continue;
      if (this.seen(view, m.x, m.y)) I.disc(g, view, m.x, m.y, r, r, 'rgba(0,0,0,0.16)');
    }
  }

  // Everything standing up in the town: { x, y (where it stands), d (how
  // near), tall (how high it stands, if it can hide a helper), draw(alpha) }.
  // (From the driver's seat, not the truck you're in -- just the dog, when
  // you're walking it.)
  things(view) {
    const { g, t } = this;
    const list = [];
    const add = (x, y, draw, tall = 0, close = 0.2) => {
      if (!this.seen(view, x, y)) return;
      // (Not anyone right on top of you, filling the view.)
      if (view instanceof I.Eye && Math.hypot(x - view.x, y - view.y) < close) return;
      list.push({ x, y, d: view.depth(x, y), tall, draw });
    };
    const model = (m, tall, close) => add(m.x, m.y, (a) => I.paint(g, view, m.parts, a), tall, close);
    const sign = (x, y, z, icon) => {
      const at = view.at(x, y, z);
      if (!at) return;
      g.font = `${Math.round(Math.min(120, view.scale(x, y, z) * 0.34))}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(icon, at[0], at[1]);
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
    // crosswalks (drawn flat, facing you).
    const flatOn = (x, y, z, draw) => {
      const at = view.at(x, y, z);
      if (at) draw(at, Math.min(220, view.scale(x, y, z)));
    };
    for (const { x, y } of this.junctions) {
      if (!isLit(x, y)) continue;
      const l = lights(x, y, t);
      for (const [cx, cy, axis] of [[-0.1, -0.34, 'ns'], [1.1, -0.34, 'ew'], [-0.1, 1.24, 'ew'], [1.1, 1.24, 'ns']]) {
        const m = I.pole(x + cx, y + cy, 0.42);
        add(x + cx, y + cy, () => {
          I.paint(g, view, m.parts);
          flatOn(x + cx, y + cy, 0.62, ([sx, sy], s) => D.signal(g, sx, sy, s * 0.8, l[axis]));
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
          flatOn(c.ix + cx, c.iy + cy, 0.38, ([sx, sy], s) => D.walkSign(g, sx, sy, s * 0.7, sign2, t));
        });
      }
    }
    // Everyone on the move. (Helpers with work to do bob now and then, to
    // say "tap me".)
    for (const m of [...this.ambient, ...this.helpers]) {
      const helper = this.helpers.includes(m);
      const idle = helper && !m.path.length && m.pause <= 0 && this.target(m);
      const lift = Math.sin(m.hop * Math.PI) * 0.35 + (idle && !this.fp ? Math.max(0, Math.sin(t * 4)) * 0.15 : 0);
      const going = m.path.length > 0 && !m.wait;
      const me = this.fp?.h === m;
      if (m.kind === 'person' || m.kind === 'walker') {
        const dog = m.kind === 'walker';
        if (me) model(I.dog(m.x, m.y, m.head, t, going), 0, 0);
        else model(I.person(m.x, m.y, m.head, t, dog ? COLORS.walker : m.color, { walking: going || m.playing > 0, dog, z: lift }), 0, 0.45);
      } else if (!me || m.deliver) {
        const v = I.vehicle(m.kind, m.x, m.y, m.head, t, m.color, lift);
        add(m.x, m.y, (a) => {
          I.paint(g, view, v.parts, a);
          if (m.kind === 'garbage' && m.load) sign(m.x, m.y, 0.75 + lift, '🗑️'.repeat(Math.min(3, m.load)));
        });
      }
      // The postal worker out of the van, up to the door with the letter
      // or parcel, and back without it. (Unless it's you.)
      if (m.deliver && !me) {
        const p = this.postie(m.deliver);
        model(I.person(p.x, p.y, p.head, t, '#1d4e89', { walking: p.walking, postie: true, carry: p.out ? m.deliver.kind : null }));
      }
    }
    return list;
  }

  // The level's jobs as pictures, each ticked off when it's done: in the
  // band at the bottom between the two turn buttons -- or, in the driver's
  // seat, small along the top.
  drawTray(seat) {
    const { g } = this;
    const jobs = this.town.jobs;
    const box = seat ? 30 : BOX;
    const gap = seat ? 4 : 5;
    const per = seat ? Math.max(1, Math.floor((this.W - 90) / (box + gap))) : this.per;
    const cols = Math.min(jobs.length, per);
    const rows = Math.ceil(jobs.length / per);
    let y0;
    if (seat) {
      y0 = 10;
    } else {
      const top = this.viewH;
      g.fillStyle = '#f1f5f9';
      g.fillRect(0, top, this.W, this.trayH);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(0, top, this.W, 2);
      y0 = top + (this.trayH - rows * (box + gap) + gap) / 2;
    }
    const x0 = seat ? 70 + (this.W - 70 - cols * (box + gap)) / 2 : (this.W - cols * (box + gap) + gap) / 2;
    jobs.forEach((j, n) => {
      const x = x0 + (n % per) * (box + gap);
      const y = y0 + Math.floor(n / per) * (box + gap);
      const done = this.done.has(j.i);
      g.fillStyle = done ? '#c7f9cc' : '#fff';
      g.strokeStyle = COLORS[this.town.helpers.find((h) => h.id === j.helper).kind];
      g.lineWidth = seat ? 2 : 3;
      g.beginPath();
      g.roundRect(x, y, box, box, seat ? 7 : 10);
      g.fill();
      g.stroke();
      g.font = `${Math.round(box * 0.6)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = done ? 0.45 : 1;
      g.fillText(j.kind === 'build' && j.stage === 3 ? '🏠' : ICONS[j.kind], x + box / 2, y + box / 2 + 1);
      g.globalAlpha = 1;
      if (done) {
        g.font = `900 ${Math.round(box * 0.55)}px system-ui, sans-serif`;
        g.fillStyle = '#2b9348';
        g.fillText('✓', x + box - box * 0.22, y + box * 0.27);
      }
    });
    if (seat) return;
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
