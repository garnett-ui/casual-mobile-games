// Trial Bike in play: the camera, the drawing (the sky at the course's time
// of day with its sun, or moon and stars; the country each band of courses
// rides through -- meadow, forest, quarry, alpine -- as backdrop layers that
// slide at their own pace; the dirt with rock ledges, plank ramps, pits and
// logs, tufts and stones on top and boulders beside the track; birds that
// take off as the bike comes, the crowd at the finish, tyre tracks, flags,
// a headlight after dark, the bike and its rider, dust and exhaust), the
// course strip at the top, and the ride itself -- stepping the engine,
// crashes, checkpoints and the finish.
import { step, newBike, rider, heightAt, grounded, WHEEL, BASE, COM, VMAX, STEP } from './engine.js';
import { rng } from '../../js/lib/random.js';

const LOOK = 0.36; // the bike sits this far across the screen, looking ahead
const FRAME = '#e63946';
const DEG = 180 / Math.PI;
const SHEER = STEP * 2.5; // ground rising or falling faster than this holds no grass
const DASH = [5, 4];
const SOLID = [];

// ------------------------------------------------------------------ scenes

// The country each band of five courses rides through, in this order and
// round again from course 21:
//   courses 1-5    meadow  soft hills, a few trees, grass and flowers
//   courses 6-10   forest  rows of trees at two depths, trunks by the track
//   courses 11-15  quarry  terraced rock walls, boulders, bare scree
//   courses 16-20  alpine  snow-capped peaks, sparse pines, snow underfoot
const BANDS = ['meadow', 'forest', 'quarry', 'alpine'];
const sceneFor = (n) => SCENES[BANDS[Math.floor((n - 1) / 5) % BANDS.length]];

// Each scene: its colours by plain daylight (the backdrop far to near, the
// dirt and its deeper shade, what's on top of it, the rock of ledges and the
// wood of ramps); the backdrop's layers far to near (what's drawn, in which
// colour, how fast it slides against the ground, where its foot is as a
// share of the screen's height, how many and how big, and the colour of the
// ground it stands on if not its own); how far apart boulders stand beside
// the track (m, 0 for none) and whether there's snow on them; how thick the
// top surface is (m); and what's scattered on it.
const SCENES = {
  meadow: {
    colours: { far: '#a9c9a0', mid: '#7fae6e', near: '#5f9455', dirt: '#8a5a2b', deep: '#6b431f', top: '#5a9e3a', tuft: '#3f8a2a', bush: '#4b8a3c', stone: '#6e6a66', rock: '#8b8174', wood: '#b98549', root: '#4a2e16', dust: '#c9a87c' },
    layers: [
      { art: 'hills', colour: 'far', drift: 0.2, base: 0.55, count: 44, size: 1 },
      { art: 'hills', colour: 'mid', drift: 0.4, base: 0.6, count: 56, size: 0.7 },
      { art: 'trees', colour: 'near', drift: 0.5, base: 0.63, count: 9, size: 0.9 },
    ],
    rocks: 0, surface: 0.22, tuftGap: 2.5, stones: 0.25, flowers: 0.3, clouds: 10,
  },
  forest: {
    colours: { far: '#7d9c8a', mid: '#45705a', near: '#2c5240', dirt: '#6b4a2e', deep: '#4f3520', top: '#4c8a34', tuft: '#2e6b24', bush: '#3b6e3a', stone: '#6a665e', rock: '#7d776c', wood: '#a8763f', root: '#3a2414', dust: '#a88a66' },
    layers: [
      { art: 'hills', colour: 'far', drift: 0.15, base: 0.52, count: 40, size: 0.6 },
      { art: 'conifers', colour: 'mid', drift: 0.3, base: 0.62, count: 220, size: 1.3 },
      { art: 'trees', colour: 'near', drift: 0.55, base: 0.72, count: 30, size: 2.4 },
      { art: 'conifers', colour: 'near', drift: 0.55, base: 0.72, count: 30, size: 2.6 },
    ],
    rocks: 0, surface: 0.22, tuftGap: 2, stones: 0.2, flowers: 0.05, clouds: 6,
  },
  quarry: {
    colours: { far: '#dcc6a0', mid: '#b49878', near: '#8f8174', dirt: '#9a8166', deep: '#7a6450', top: '#cdbd9f', tuft: '#8a7d55', bush: '#8f8174', stone: '#73685d', rock: '#bba98b', wood: '#b98549', root: '#5a4632', dust: '#d6c8ad' },
    layers: [
      { art: 'terraces', colour: 'far', drift: 0.15, base: 0.58, count: 16, size: 1.2 },
      { art: 'terraces', colour: 'mid', drift: 0.3, base: 0.64, count: 20, size: 0.8 },
      { art: 'boulders', colour: 'near', drift: 0.5, base: 0.69, count: 40, size: 1 },
    ],
    rocks: 7, surface: 0.15, tuftGap: 1.6, stones: 0.85, flowers: 0, clouds: 4,
  },
  alpine: {
    colours: { far: '#a3b4cc', mid: '#6f7f97', near: '#2d4a3f', field: '#aab8c9', cap: '#f4f8fd', dirt: '#5f524a', deep: '#463b35', top: '#eef3f9', tuft: '#9fb0bf', bush: '#2d4a3f', stone: '#4f4843', rock: '#7d7883', wood: '#a8763f', root: '#3a2c24', dust: '#f4f7fb' },
    layers: [
      { art: 'peaks', colour: 'far', drift: 0.1, base: 0.6, count: 18, size: 1.3 },
      { art: 'peaks', colour: 'mid', drift: 0.25, base: 0.65, count: 22, size: 0.8 },
      { art: 'conifers', colour: 'near', floor: 'field', drift: 0.5, base: 0.69, count: 14, size: 1.2 },
    ],
    rocks: 9, snow: true, surface: 0.3, tuftGap: 3, stones: 1, flowers: 0, clouds: 7,
  },
};

// How far each part of the backdrop fades into the horizon's colour.
const HAZE = { far: 0.45, mid: 0.25, near: 0.1, field: 0.15, cap: 0.3 };

// The time of day, round a day of thirty courses: course 1 rides in the
// morning with the sun low on the left, noon comes around course 7, golden
// hour around 15, the sun sets in the high teens, it's night from course 21
// and first light just before course 31 starts the round again. Each key is
// a moment of the day: the sky top to horizon, the sun's colour and place
// (shares of the screen), the tint the light lends the land and how much,
// and how dark it is (stars, moon and the headlight).
const DAY = 30;
const SKIES = [
  { at: 0, top: '#7fb2e6', horizon: '#fde2c8', sun: '#fff2cc', pos: [0.15, 0.4], tint: '#bcd0ff', k: 0.1, night: 0 },
  { at: 0.22, top: '#4ea6f2', horizon: '#d6ecff', sun: '#fffbe8', pos: [0.48, 0.15], tint: '#ffffff', k: 0, night: 0 },
  { at: 0.36, top: '#5a9ee6', horizon: '#e9eef0', sun: '#fff4d6', pos: [0.68, 0.2], tint: '#ffd08a', k: 0.06, night: 0 },
  { at: 0.47, top: '#6b86c9', horizon: '#ffc57d', sun: '#ffb24a', pos: [0.8, 0.34], tint: '#ff9640', k: 0.2, night: 0 },
  { at: 0.57, top: '#333a75', horizon: '#f3876a', sun: '#ff6a3d', pos: [0.88, 0.5], tint: '#3d2f6e', k: 0.36, night: 0.35 },
  { at: 0.65, top: '#0a1230', horizon: '#1f2f5c', sun: '#ff6a3d', pos: [0.94, 0.75], tint: '#0d1838', k: 0.55, night: 1 },
  { at: 0.92, top: '#0a1230', horizon: '#1f2f5c', sun: '#ffd0a0', pos: [0.04, 0.75], tint: '#0d1838', k: 0.55, night: 1 },
  { at: 0.97, top: '#26336a', horizon: '#d79a86', sun: '#ffd0a0', pos: [0.08, 0.6], tint: '#2c3366', k: 0.35, night: 0.4 },
];
SKIES.push({ ...SKIES[0], at: 1 });
const MOON = [0.76, 0.2];

// The sky over course n: the keys either side of its moment of the day,
// blended.
const skyFor = (n) => {
  const u = ((((n - 1) % DAY) + DAY) % DAY) / DAY;
  let i = 0;
  while (SKIES[i + 1].at <= u) i++;
  const a = SKIES[i];
  const b = SKIES[i + 1];
  const k = (u - a.at) / (b.at - a.at);
  const lerp = (p, q) => p + (q - p) * k;
  return {
    top: blend(a.top, b.top, k),
    horizon: blend(a.horizon, b.horizon, k),
    sun: blend(a.sun, b.sun, k),
    pos: [lerp(a.pos[0], b.pos[0]), lerp(a.pos[1], b.pos[1])],
    tint: blend(a.tint, b.tint, k),
    k: lerp(a.k, b.k),
    night: lerp(a.night, b.night),
  };
};

// Colours, worked out once per course: '#rrggbb' to its channels, a blend
// of two, and one with some transparency.
const channels = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const blend = (a, b, k) => {
  const q = channels(b);
  return `#${channels(a).map((v, i) => Math.round(v + (q[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
};
const fade = (c, a) => `rgba(${channels(c).join(',')},${a})`;


export class Play {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.input = { gas: false, brake: false, lean: 0 };
    this.paused = false;
    this.timeScale = 1; // the browser tests fast-forward rides
    this.pilot = null; // the computer rider, for the demo and the tests
    this.makeScenery();
    this.reset();
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
      this.last = now;
      if (!this.paused) this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // Back to the start line, clock at zero.
  reset() {
    if (this.demo) {
      this.demo = false;
      this.pilot = null;
      this.timeScale = 1;
      this.hooks.onDemo?.(false);
    }
    this.B = newBike(this.level);
    this.time = 0;
    this.crashes = 0;
    this.outcome = null;
    this.waiting = false; // crashed, waiting for the tap that goes again
    this.dust = [];
    this.puffs = [];
    this.puffT = 0;
    this.shake = 0;
    this.message = null;
    this.cam = null;
    this.flagShown = -1;
    this.pose = 0; // the rider's drawn lean, eased toward the input
    this.hooks.onState?.(this);
  }

  // After a crash: back to the last flag, with the clock where it was.
  retry() {
    const flag = this.B.flag;
    const time = this.time;
    this.B = newBike(this.level, flag >= 0 ? this.level.flags[flag] : this.level.start);
    this.time = time;
    this.outcome = null;
    this.waiting = false;
    this.message = null;
    this.dust = [];
    this.hooks.onState?.(this);
  }

  // Watch the computer rider do it, from the start.
  showMe() {
    this.reset();
    this.demo = true;
    this.pilot = (level, B) => rider(level, B, level.pace);
    this.timeScale = 1;
    this.hooks.onDemo?.(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.hooks.onMotor?.(false, 0);
  }

  // ------------------------------------------------------------- scenery

  // Everything about the course's look that holds still: its scene and its
  // light, the colours they make, and where the backdrop, the boulders by
  // the track, the dressed obstacles, the birds and the crowd are -- all
  // from the course number and its seed, so course n always looks the same.
  makeScenery() {
    const L = this.level;
    const r = rng(L.n * 131 + 5);
    const scene = sceneFor(L.n);
    const sky = skyFor(L.n);
    this.scene = scene;
    this.sky = sky;
    // The scene's colours in this light: everything leans toward the light's
    // tint, the backdrop fades into the horizon with distance, and the top
    // of the ground keeps more of its own colour so it reads.
    const P = {};
    for (const [key, c] of Object.entries(scene.colours)) {
      P[key] = blend(blend(c, sky.horizon, HAZE[key] ?? 0), sky.tint, sky.k * (key === 'top' ? 0.5 : 1));
    }
    Object.assign(P, {
      edge: blend(P.deep, '#000000', 0.35),
      rockDark: blend(P.rock, '#000000', 0.3),
      woodDark: blend(P.wood, '#000000', 0.5),
      woodLight: blend(P.wood, '#ffffff', 0.3),
      logEnd: blend(P.wood, '#ffffff', 0.12),
      ring: blend(P.wood, '#000000', 0.22),
      pit: blend(P.deep, '#000000', 0.5),
      track: fade(blend(P.top, '#000000', 0.6), 0.4),
      bird: blend('#2b2b33', sky.tint, sky.k),
      pants: blend('#33415c', sky.tint, sky.k),
      cloud: fade(blend('#ffffff', sky.tint, Math.min(1, sky.k * 1.3)), 0.85 - 0.5 * sky.night),
      strip: fade(blend(sky.top, '#000000', 0.45), 0.75),
    });
    this.P = P;
    // The backdrop's layers, each with its things spread along it.
    this.layers = scene.layers.map((l) => {
      const art = BACKDROP[l.art];
      const fill = P[l.colour];
      const items = Array.from({ length: l.count }, () => art.make(r));
      return { ...l, paint: art.paint, items, fill, floor: P[l.floor] ?? fill, dark: blend(fill, '#000000', 0.22), light: blend(fill, '#ffffff', 0.2), cap: P.cap, sx: new Float32Array(l.count) };
    });
    this.clouds = Array.from({ length: scene.clouds }, () => ({ x: r() * 400, y: 0.1 + r() * 0.3, w: 30 + r() * 50 }));
    this.stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.55, s: 1 + r() * 1.4, a: 0.4 + r() * 0.6, ph: r() * TAU }));
    // Boulders beside the track, clear of the obstacles, the flags and the
    // finish (where the crowd stands).
    const clear = (x) => !L.features.some((f) => x > f.x0 - 1.5 && x < f.x1 + 1.5) && !L.flags.some((fx) => Math.abs(x - fx) < 1.2) && (x < L.finish - 2.5 || x > L.finish + 6);
    this.rocks = [];
    for (let x = 5 + r() * 5; scene.rocks && x < L.length; x += scene.rocks * (0.5 + r())) {
      const it = { x, s: 0.25 + r() * 0.45, k: Array.from({ length: 7 }, () => 0.8 + 0.3 * r()) };
      if (clear(x)) this.rocks.push(it);
    }
    // Tufts, flowers and stones on top, where the ground is gentle enough to
    // hold them.
    const blooms = ['#ffd23f', '#ffffff', '#e05cae'].map((c) => blend(c, sky.tint, sky.k));
    this.tufts = [];
    for (let x = 2; x < L.length; x += scene.tuftGap * (0.4 + r())) {
      const kind = r() < scene.stones ? 'stone' : 'tuft';
      const t = { x, s: 0.5 + r(), c: r() < scene.flowers ? blooms[Math.floor(r() * blooms.length)] : null, paint: TUFTS[kind] };
      if (Math.abs(heightAt(L, x + 0.2) - heightAt(L, x - 0.2)) < 0.25) this.tufts.push(t);
    }
    // The obstacles, each dressed by its kind's art (or left plain).
    this.art = [];
    L.features.forEach((f, i) => {
      const art = FEATURE_ART[f.kind];
      const d = art?.make(L, f, i, r);
      if (d) this.art.push({ ...d, under: art.under, over: art.over });
    });
    // A few birds pecking about on the hills, and the crowd at the finish.
    this.birds = [];
    for (const f of L.features) {
      if (f.kind === 'hill' && this.birds.length < 4 && r() < 0.6) this.birds.push({ x: f.x0 + (f.x1 - f.x0) * (0.3 + 0.4 * r()), t0: 0, ph: r() * TAU, v: 0.8 + 0.4 * r() });
    }
    const shirts = ['#2a6fdb', '#ffb703', '#7b5cd6', '#2a9d8f', '#f4f1e8'];
    const skins = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69'];
    const first = Math.floor(r() * 5);
    const lit = (c) => blend(c, sky.tint, sky.k);
    this.crowd = [-1.7, 3.1, 3.8, 4.7].map((dx, i) => ({ x: L.finish + dx, h: 1.5 + r() * 0.3, ph: r() * TAU, shirt: lit(shirts[(first + i) % 5]), skin: lit(skins[Math.floor(r() * 4)]) }));
    // Tyre tracks: the rear wheel's last 200 contact points, a ring of
    // [x, y] pairs, NaN where the line breaks.
    this.tracks = new Float32Array(400);
    this.trackHead = 0;
    this.trackCount = 0;
    this.trackOpen = false;
    this.trackBike = null;
    // What the obstacle art needs to draw, refreshed each frame, and the
    // gradients, made once for a size and kept.
    this.view = { L, sx: null, sy: null, m: 1, H: 1, surface: 3, pit: null, wall: null };
    this.cache = {};
    this.horizonRef = null;
  }

  // ------------------------------------------------------------ the ride

  update(dt) {
    const B = this.B;
    // After a crash the bike tumbles on for a moment, then holds still.
    if (this.outcome?.kind === 'crash' && !this.waiting && (this.tumble -= dt) > 0) {
      const n = Math.ceil(dt / (1 / 120));
      for (let k = 0; k < n; k++) step(this.level, B, this.input, dt / n);
    }
    if (!this.outcome && !this.waiting) {
      // Physics in fixed small steps for stability.
      let res = null;
      const n = Math.ceil(dt / (1 / 120));
      const wasFlag = B.flag;
      const wasAir = !grounded(B);
      const vyBefore = B.vy;
      for (let k = 0; k < n && !res; k++) {
        // The demo and the tests ride with the computer rider.
        if (this.pilot) Object.assign(this.input, this.pilot(this.level, B));
        res = step(this.level, B, this.input, dt / n);
      }
      this.time += dt;
      // Dust from the rear wheel when it spins up or the bike is moving
      // fast, and exhaust when the throttle's open.
      this.puffT += dt;
      if (this.puffT > 0.06) {
        this.puffT = 0;
        const c = B.rear;
        if (c && (c.slip || Math.abs(c.vt) > 8)) this.puff(c.px, c.py, c.slip ? 1.2 : 0.7, 'dust');
        if (B.gas && grounded(B)) {
          const [ex, ey] = this.onBike(-0.55, -0.2);
          this.puff(ex, ey, 0.5, 'smoke');
        }
      }
      // Landing after a flight: a thump and some dust.
      if (wasAir && grounded(B) && vyBefore < -3) {
        this.hooks.sfx?.('bump');
        this.hooks.haptic?.(20);
        for (let i = 0; i < 8; i++) this.puff(B.x, B.y - COM - WHEEL, 1.5, 'dust');
      }
      if (B.flag > wasFlag && B.flag > this.flagShown) {
        this.flagShown = B.flag;
        this.hooks.sfx?.('checkpoint');
        this.say('CHECKPOINT', 1.2);
      }
      if (B.stall > 1.5 && !this.message) this.say('STUCK? ↶ GOES BACK TO THE FLAG', 2.5);
      if (res) {
        this.outcome = res;
        if (res.kind === 'crash') {
          this.crashes++;
          this.shake = 1;
          this.tumble = 0.7;
          this.hooks.sfx?.('crash');
          this.hooks.haptic?.([30, 40, 60]);
          for (let i = 0; i < 24; i++) this.puff(B.x, B.y, 3, 'dust');
          setTimeout(() => this.hooks.onCrash?.(res), 700);
        } else {
          this.hooks.sfx?.('win');
          this.hooks.haptic?.(40);
          setTimeout(() => this.hooks.onFinished?.(res), 900);
        }
      }
      this.hooks.onState?.(this);
    }
    // The engine note follows the speed, with a blip for the throttle.
    const running = !this.outcome && !this.waiting;
    this.hooks.onMotor?.(running, Math.max(0, B.vx) / VMAX * 0.7 + (B.gas && running ? 0.3 : 0.05));
    for (const p of this.dust) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 3 * dt;
    }
    this.dust = this.dust.filter((p) => p.t < p.life);
    if (this.message && (this.message.t -= dt) <= 0) this.message = null;
    this.shake = Math.max(0, this.shake - dt * 2);
    // The rider's body follows the lean a beat behind, so a twitch of the
    // controls doesn't jerk it about.
    this.pose += ((B.lean ?? 0) - this.pose) * Math.min(1, dt * 9);
  }

  puff(x, y, size, kind) {
    if (this.dust.length > 120) return;
    const a = Math.random() * Math.PI;
    const v = (0.5 + Math.random()) * size;
    this.dust.push({ x, y, vx: Math.cos(a) * v * (kind === 'smoke' ? -0.6 : 1), vy: Math.abs(Math.sin(a)) * v, t: 0, life: 0.5 + Math.random() * 0.5, r: 0.08 + Math.random() * 0.12 * size, kind });
  }

  say(text, secs) {
    this.message = { text, t: secs };
  }

  // A point fixed to the bike's frame, from its centre of mass, in the world.
  onBike(lx, ly) {
    const B = this.B;
    const c = Math.cos(B.angle);
    const s = Math.sin(B.angle);
    return [B.x + lx * c - ly * s, B.y + lx * s + ly * c];
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
  }

  // The camera follows the bike, which rides a third of the way across the
  // screen so there's room to see what's coming, and keeps the ground in
  // the lower half.
  camera() {
    const { cssW: W, cssH: H } = this;
    const B = this.B;
    const wide = W > H;
    const scale = W / (wide ? 15.5 : 10);
    const ground = heightAt(this.level, B.x + 2);
    const wantY = Math.min(B.y, ground + 1.5) - (H / scale) * (wide ? 0.42 : 0.3);
    const want = { x: B.x - (W / scale) * LOOK, bottom: wantY };
    if (!this.cam) this.cam = want;
    this.cam.x += (want.x - this.cam.x) * 0.25;
    this.cam.bottom += (want.bottom - this.cam.bottom) * 0.08;
    return { scale, left: this.cam.x, bottom: this.cam.bottom };
  }

  // A gradient (or anything else) made for one size and kept until the size
  // changes.
  cached(name, size, make) {
    const c = this.cache[name];
    if (c && c.size === size) return c.value;
    const value = make();
    this.cache[name] = { size, value };
    return value;
  }

  draw() {
    const { ctx, dpr, cssW: W, cssH: H, P } = this;
    const cam = this.camera();
    const m = cam.scale;
    const L = this.level;
    const hs = L.heights;
    const sx = (x) => (x - cam.left) * m;
    const sy = (y) => H - (y - cam.bottom) * m;
    const now = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shake = this.shake * 10;
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // The sky at this time of day, then the backdrop far to near, each layer
    // sliding at its own fraction of the ground's pace.
    this.drawSky(W, H, cam, now);
    this.drawBackdrop(W, H, cam);

    // The stretch of ground on screen, on the course's own samples so its
    // top edge is exactly the engine's.
    const i0 = Math.max(0, Math.floor((cam.left - 2) / STEP));
    const i1 = Math.min(hs.length - 1, Math.ceil((cam.left + W / m + 2) / STEP));
    const x0 = i0 * STEP;
    const x1 = i1 * STEP;
    const v = this.view;
    v.sx = sx;
    v.sy = sy;
    v.m = m;
    v.H = H;
    v.surface = Math.max(3, this.scene.surface * m);
    v.pit = this.cached('pit', m, () => {
      const g = ctx.createLinearGradient(0, 0, 0, 2.2 * m);
      g.addColorStop(0, P.pit);
      g.addColorStop(1, '#040306');
      return g;
    });
    v.wall = this.cached('wall', m, () => {
      const g = ctx.createLinearGradient(0, 0, m, 0);
      g.addColorStop(0, fade(P.dirt, 0));
      g.addColorStop(1, fade(P.dirt, 0.35));
      return g;
    });

    // Boulders beside the track stand behind it: the dirt hides their feet.
    for (const it of this.rocks) if (it.x > x0 - 3 && it.x < x1 + 3) boulder(ctx, it, sx(it.x), sy(heightAt(L, it.x)), m, P, this.scene.snow);

    // The dirt, then what shows inside it: rock ledges, plank ramps, pits.
    ctx.beginPath();
    ctx.moveTo(sx(x0), H + 20);
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
    ctx.lineTo(sx(x1), H + 20);
    ctx.closePath();
    ctx.fillStyle = P.dirt;
    ctx.fill();
    for (const d of this.art) if (d.under && d.b > x0 - 1 && d.a < x1 + 1) d.under(ctx, d, v, P);

    // The ground's top edge: a fine dark line all along it, under the grass
    // (or scree, or snow) wherever it isn't too sheer to hold any.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
    ctx.stroke();
    ctx.strokeStyle = P.top;
    ctx.lineWidth = v.surface;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      if (i === i0 || Math.abs(hs[i] - hs[i - 1]) > SHEER) ctx.moveTo(sx(i * STEP), sy(hs[i]));
      else ctx.lineTo(sx(i * STEP), sy(hs[i]));
    }
    ctx.stroke();

    // On top: tufts and stones, the ramps' decks and the logs, the tracks,
    // the birds, the crowd and the flags.
    for (const t of this.tufts) if (t.x >= x0 && t.x <= x1) t.paint(ctx, t, sx(t.x), sy(heightAt(L, t.x)), m, P);
    for (const d of this.art) if (d.over && d.b > x0 - 1 && d.a < x1 + 1) d.over(ctx, d, v, P);
    ctx.lineCap = 'butt';
    this.drawTracks(sx, sy, m, x0, x1);
    this.drawBirds(sx, sy, m, W, now);
    this.drawCrowd(sx, sy, m, x0, x1, now);
    this.drawFlags(cam, sx, sy, x0, x1);
    this.drawLamp(sx, sy, m, false);
    this.drawDust(sx, sy, m);
    this.drawBike(sx, sy, m);
    this.drawLamp(sx, sy, m, true);
    this.drawStrip(W);
    if (this.message) {
      ctx.font = `800 ${Math.round(Math.min(26, W * 0.04))}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillText(this.message.text, W / 2 + 2, H * 0.3 + 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(this.message.text, W / 2, H * 0.3);
    }
  }

  // The sky: its gradient, the stars and the moon after dark, the sun by day
  // (a low one sets behind the backdrop, drawn after), and the clouds.
  drawSky(W, H, cam, now) {
    const { ctx, sky, P } = this;
    ctx.fillStyle = this.cached('sky', H, () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, sky.top);
      g.addColorStop(0.75, sky.horizon);
      return g;
    });
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const size = W * 4096 + H;
    if (sky.night > 0.05) {
      ctx.fillStyle = '#ffffff';
      for (const s of this.stars) {
        ctx.globalAlpha = sky.night * s.a * (0.65 + 0.35 * Math.sin(now * 0.002 + s.ph));
        ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
      }
      const x = MOON[0] * W;
      const y = MOON[1] * H;
      const rr = Math.max(9, 0.045 * Math.min(W, H));
      ctx.globalAlpha = sky.night;
      ctx.fillStyle = this.cached('moon', size, () => glow(ctx, x, y, rr * 6, '#dfe8ff', 0.35));
      ctx.fillRect(x - rr * 6, y - rr * 6, rr * 12, rr * 12);
      fillWith(ctx, '#f3f0e2', () => blob(ctx, x, y, rr));
      fillWith(ctx, 'rgba(176,170,150,.55)', () => {
        blob(ctx, x - rr * 0.3, y - rr * 0.2, rr * 0.22);
        blob(ctx, x + rr * 0.35, y + rr * 0.1, rr * 0.15);
        blob(ctx, x - rr * 0.05, y + rr * 0.45, rr * 0.12);
      });
    }
    if (sky.night < 0.95) {
      const x = sky.pos[0] * W;
      const y = sky.pos[1] * H;
      const rr = Math.max(10, 0.05 * Math.min(W, H));
      ctx.globalAlpha = 1 - sky.night;
      ctx.fillStyle = this.cached('sun', size, () => glow(ctx, x, y, rr * 10, sky.sun, 0.6));
      ctx.fillRect(x - rr * 10, y - rr * 10, rr * 20, rr * 20);
      fillWith(ctx, sky.sun, () => blob(ctx, x, y, rr));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.cloud;
    for (const c of this.clouds) {
      const x = (((c.x - cam.left * 0.1) % 400) + 400) % 400 / 400 * (W + 160) - 80;
      const y = c.y * H;
      ctx.beginPath();
      ctx.ellipse(x, y, c.w, c.w * 0.35, 0, 0, Math.PI * 2);
      ctx.ellipse(x + c.w * 0.4, y - c.w * 0.15, c.w * 0.6, c.w * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The backdrop, far to near: each layer's things slide by at its own
  // fraction of the ground's pace, rise and fall a little with the camera,
  // and stand on a floor of their own colour that runs down under the
  // ground.
  drawBackdrop(W, H, cam) {
    const { ctx } = this;
    const z = clamp(H / 360, 0.8, 1.6);
    if (this.horizonRef === null) this.horizonRef = cam.bottom;
    const lift = (cam.bottom - this.horizonRef) * cam.scale * 0.5;
    for (const layer of this.layers) {
      const off = cam.left * cam.scale * layer.drift;
      const base = H * layer.base + clamp(lift * layer.drift, -40, 40);
      for (let i = 0; i < layer.items.length; i++) layer.sx[i] = wrap(layer.items[i].x - off);
      layer.paint(ctx, layer, base, W, z);
      ctx.fillStyle = layer.floor;
      ctx.fillRect(-20, base - 0.5, W + 40, H - base + 60);
    }
  }

  drawFlags(cam, sx, sy, x0, x1) {
    const { ctx } = this;
    const pole = (x, h, colour, flag) => {
      const gy = sy(heightAt(this.level, x));
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(x), gy);
      ctx.lineTo(sx(x), gy - h * cam.scale);
      ctx.stroke();
      if (flag) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(sx(x), gy - h * cam.scale);
        ctx.lineTo(sx(x) + 0.7 * cam.scale, gy - (h - 0.25) * cam.scale);
        ctx.lineTo(sx(x), gy - (h - 0.5) * cam.scale);
        ctx.fill();
      }
    };
    this.level.flags.forEach((x, i) => {
      if (x < x0 - 1 || x > x1 + 1) return;
      pole(x, 2.2, i <= this.B.flag ? '#3dff7a' : '#ffb703', true);
    });
    // The finish: a chequered banner between two poles.
    const fx = this.level.finish;
    if (fx > x0 - 1 && fx < x1 + 3) {
      pole(fx, 3, '#000', false);
      pole(fx + 2, 3, '#000', false);
      const y = sy(heightAt(this.level, fx)) - 3 * cam.scale;
      const cell = 0.25 * cam.scale;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
          ctx.fillRect(sx(fx) + i * cell, y + j * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    // The start line.
    if (this.level.start > x0 - 2) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx(this.level.start - 1), sy(heightAt(this.level, this.level.start - 1)) + 2);
      ctx.lineTo(sx(this.level.start - 1), sy(heightAt(this.level, this.level.start - 1)) - 1.2 * cam.scale);
      ctx.stroke();
    }
  }

  // Tyre tracks: a point every 0.3 m the rear wheel rolls on the ground,
  // with the line broken where it leaves the ground or the bike starts
  // afresh (a restart or a flag), drawn as a faint dashed rut.
  drawTracks(sx, sy, m, x0, x1) {
    const { ctx, B, tracks: T } = this;
    const cap = T.length / 2;
    const push = (x, y) => {
      T[this.trackHead * 2] = x;
      T[this.trackHead * 2 + 1] = y;
      this.trackHead = (this.trackHead + 1) % cap;
      this.trackCount = Math.min(cap, this.trackCount + 1);
    };
    const c = B.rear;
    if (B !== this.trackBike || !c) {
      if (this.trackOpen) push(NaN, NaN);
      this.trackOpen = false;
      this.trackBike = B;
    }
    if (c) {
      const k = ((this.trackHead + cap - 1) % cap) * 2;
      if (!this.trackOpen || Math.hypot(c.px - T[k], c.py - T[k + 1]) >= 0.3) {
        push(c.px, c.py);
        this.trackOpen = true;
      }
    }
    ctx.strokeStyle = this.P.track;
    ctx.lineWidth = Math.max(1.5, 0.05 * m);
    ctx.setLineDash(DASH);
    ctx.beginPath();
    let pen = false;
    for (let j = 0; j < this.trackCount; j++) {
      const k = ((this.trackHead - this.trackCount + j + cap) % cap) * 2;
      const x = T[k];
      if (Number.isNaN(x) || x < x0 - 1 || x > x1 + 1) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(sx(x), sy(T[k + 1]) + 1.5);
      else ctx.moveTo(sx(x), sy(T[k + 1]) + 1.5);
      pen = true;
    }
    ctx.stroke();
    ctx.setLineDash(SOLID);
  }

  // Birds pecking on the hills. One takes off when the bike comes within
  // 8 m, up and away over a second and a half and on out of sight, and is
  // back on its hill when the bike starts again from behind it.
  drawBirds(sx, sy, m, W, now) {
    const { ctx, B, P } = this;
    ctx.fillStyle = P.bird;
    ctx.strokeStyle = P.bird;
    ctx.lineWidth = Math.max(1.5, 0.035 * m);
    ctx.lineCap = 'round';
    for (const b of this.birds) {
      if (!b.t0 && Math.abs(B.x - b.x) < 8) b.t0 = now;
      if (b.t0 && B.x < b.x - 12) b.t0 = 0;
      const u = b.t0 ? (now - b.t0) / 1500 : 0;
      if (u > 3) continue;
      const X = sx(b.x + b.v * (2 * u + 4 * u * u));
      const Y = sy(heightAt(this.level, b.x) + b.v * (2.5 * u + 2.5 * u * u));
      if (X < -30 || X > W + 30) continue;
      ctx.beginPath();
      if (!b.t0) {
        // Sitting: a body, a tail and a head that dips now and then to peck.
        const peck = Math.sin(now * 0.004 + b.ph) > 0.75 ? 0.06 * m : 0;
        ctx.ellipse(X, Y - 0.08 * m, 0.1 * m, 0.06 * m, -0.2, 0, TAU);
        blob(ctx, X + 0.1 * m, Y - 0.15 * m + peck, 0.045 * m);
        ctx.moveTo(X - 0.08 * m, Y - 0.1 * m);
        ctx.lineTo(X - 0.2 * m, Y - 0.06 * m);
        ctx.lineTo(X - 0.08 * m, Y - 0.05 * m);
        ctx.fill();
      } else {
        // Flying: a body and two beating wings.
        const w = 0.22 * m;
        const flap = Math.sin(now * 0.03 + b.ph) * 0.7;
        blob(ctx, X, Y, 0.05 * m);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(X - w, Y - w * flap);
        ctx.quadraticCurveTo(X - w * 0.4, Y - w * 0.35, X, Y);
        ctx.quadraticCurveTo(X + w * 0.4, Y - w * 0.35, X + w, Y - w * flap);
        ctx.stroke();
      }
    }
  }

  // The crowd at the finish: arms down, until the bike is within 6 m of
  // them (or home), then up and waving.
  drawCrowd(sx, sy, m, x0, x1, now) {
    const { ctx, B, P } = this;
    ctx.lineCap = 'round';
    for (const p of this.crowd) {
      if (p.x < x0 - 1 || p.x > x1 + 1) continue;
      const X = sx(p.x);
      const Y = sy(heightAt(this.level, p.x));
      const h = p.h * m;
      const cheer = B.finished || Math.abs(B.x - p.x) < 6;
      const wave = cheer ? Math.sin(now * 0.012 + p.ph) * 0.06 * h : 0;
      const sh = Y - 0.78 * h; // the shoulders
      const hand = sh + (cheer ? -0.3 : 0.3) * h;
      strokeWith(ctx, P.pants, 0.09 * m, () => {
        ctx.moveTo(X - 0.08 * m, Y);
        ctx.lineTo(X, Y - 0.46 * h);
        ctx.lineTo(X + 0.08 * m, Y);
      });
      strokeWith(ctx, p.shirt, 0.11 * m, () => {
        ctx.moveTo(X - 0.17 * m, hand + wave);
        ctx.lineTo(X, sh);
        ctx.lineTo(X + 0.17 * m, hand - wave);
      });
      strokeWith(ctx, p.shirt, 0.2 * m, () => {
        ctx.moveTo(X, sh + 0.02 * h);
        ctx.lineTo(X, Y - 0.5 * h);
      });
      fillWith(ctx, p.skin, () => blob(ctx, X, Y - 0.9 * h, 0.1 * h));
    }
    ctx.lineCap = 'butt';
  }

  // After dark, the headlight: a wedge of light from the front of the bike
  // along its heading, a touch down (drawn under the bike), and the lamp's
  // own glow (drawn over it).
  drawLamp(sx, sy, m, lamp) {
    const night = this.sky.night;
    if (night < 0.2) return;
    const { ctx, B } = this;
    const [hx, hy] = this.onBike(0.47, 0.17);
    ctx.save();
    ctx.translate(sx(hx), sy(hy));
    ctx.globalCompositeOperation = 'lighter';
    if (lamp) {
      fillWith(ctx, `rgba(255,246,214,${0.9 * night})`, () => blob(ctx, 0, 0, 0.05 * m));
      fillWith(ctx, `rgba(255,246,214,${0.25 * night})`, () => blob(ctx, 0, 0, 0.14 * m));
    } else {
      const reach = 7 * m;
      ctx.rotate(-B.angle + 0.08);
      ctx.globalAlpha = Math.min(1, night * 1.2) * 0.8;
      ctx.fillStyle = this.cached('beam', m, () => {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
        g.addColorStop(0, 'rgba(255,244,200,0.55)');
        g.addColorStop(0.5, 'rgba(255,244,200,0.2)');
        g.addColorStop(1, 'rgba(255,244,200,0)');
        return g;
      });
      ctx.beginPath();
      ctx.moveTo(0, -0.05 * m);
      ctx.lineTo(reach, -reach * 0.24);
      ctx.lineTo(reach, reach * 0.3);
      ctx.lineTo(0, 0.05 * m);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawDust(sx, sy, scale) {
    const { ctx } = this;
    for (const p of this.dust) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k * (p.kind === 'smoke' ? 0.35 : 0.6);
      ctx.fillStyle = p.kind === 'smoke' ? '#9aa' : this.P.dust;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), (p.r + (1 - k) * 0.15) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBike(sx, sy, scale) {
    const { ctx } = this;
    const B = this.B;
    ctx.save();
    ctx.translate(sx(B.x), sy(B.y));
    ctx.rotate(-B.angle);
    ctx.scale(scale, -scale);
    paintBike(ctx, B, this.pose);
    ctx.restore();
  }

  // A strip along the top, in the scene's colours: the course's profile,
  // the flags, and where you are on it.
  drawStrip(W) {
    const { ctx, P } = this;
    const L = this.level;
    const w = Math.min(W - 24, 520);
    const x0 = (W - w) / 2;
    const y0 = 10;
    const h = 22;
    const k = w / L.length;
    const span = Math.max(1, L.maxY - L.minY);
    const at = (i) => y0 + h - ((L.heights[i] - L.minY) / span) * h * 0.8;
    ctx.fillStyle = P.strip;
    ctx.beginPath();
    ctx.roundRect?.(x0 - 4, y0 - 4, w + 8, h + 8, 6);
    ctx.fill();
    ctx.fillStyle = P.dirt;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h);
    for (let i = 0; i < L.heights.length; i += 4) ctx.lineTo(x0 + i * STEP * k, at(i));
    ctx.lineTo(x0 + w, y0 + h);
    ctx.fill();
    ctx.strokeStyle = P.top;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < L.heights.length; i += 4) ctx.lineTo(x0 + i * STEP * k, at(i));
    ctx.stroke();
    L.flags.forEach((x, i) => {
      ctx.fillStyle = i <= this.B.flag ? '#3dff7a' : '#ffb703';
      ctx.fillRect(x0 + x * k - 1, y0, 2, h);
    });
    ctx.fillStyle = '#111';
    ctx.fillRect(x0 + L.finish * k - 1, y0, 2, h);
    ctx.fillStyle = FRAME;
    ctx.beginPath();
    ctx.arc(x0 + Math.min(L.length, Math.max(0, this.B.x)) * k, y0 + h - ((heightAt(L, this.B.x) - L.minY) / span) * h * 0.8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------- scenery art

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The backdrop repeats every SPAN pixels and is drawn PAD pixels past the
// screen's edges; a layer's things sit at x from 0 to SPAN.
const SPAN = 3200;
const PAD = 220;
const wrap = (x) => (((x % SPAN) + SPAN) % SPAN) - PAD;
const seen = (x, w, W) => x + w > 0 && x - w < W;

// A circle added to the current path, as its own piece.
const blob = (ctx, x, y, r) => {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, TAU);
};

// A closed outline added to the current path: points [x, y, x, y, ...] as
// shares of a half-width w (x) and a height h (y, up), from a foot at (x, y).
const trace = (ctx, pts, x, y, w, h) => {
  ctx.moveTo(x + pts[0] * w, y - pts[1] * h);
  for (let k = 2; k < pts.length; k += 2) ctx.lineTo(x + pts[k] * w, y - pts[k + 1] * h);
  ctx.closePath();
};

// One such outline, filled.
const shape = (ctx, pts, colour, x, y, w, h) => {
  ctx.fillStyle = colour;
  ctx.beginPath();
  trace(ctx, pts, x, y, w, h);
  ctx.fill();
};

// A soft round glow, for the sun and the moon.
const glow = (ctx, x, y, r, colour, a) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, fade(colour, a));
  g.addColorStop(0.3, fade(colour, a * 0.35));
  g.addColorStop(1, fade(colour, 0));
  return g;
};

// Each of a layer's things that's on screen, with its screen x, given the
// scale s of its half-width.
const each = (layer, W, s, fn) => {
  for (let i = 0; i < layer.items.length; i++) if (seen(layer.sx[i], layer.items[i].w * s * 1.5, W)) fn(layer.items[i], layer.sx[i]);
};

// Fills whatever `add` puts on the path, in one colour.
const fillWith = (ctx, colour, add) => {
  ctx.fillStyle = colour;
  ctx.beginPath();
  add();
  ctx.fill();
};

// Strokes whatever `add` puts on the path, in one colour and width.
const strokeWith = (ctx, colour, width, add) => {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  add();
  ctx.stroke();
};

// What the backdrop's layers are made of. `make` places one thing along the
// layer, once per course; `paint` draws the layer's things at their screen
// x (layer.sx) standing on the line `base`, in pixels scaled by z.
const BACKDROP = {
  // Soft round hills, side by side.
  hills: {
    make: (r) => ({ x: r() * SPAN, w: 50 + r() * 70, h: 30 + r() * 80 }),
    paint(ctx, layer, base, W, z) {
      fillWith(ctx, layer.fill, () => each(layer, W, z, (it, x) => {
        ctx.moveTo(x - it.w * z, base);
        ctx.ellipse(x, base, it.w * z, it.h * layer.size * z, 0, Math.PI, 0);
      }));
    },
  },
  // Broadleaf trees: a trunk and a crown of round clumps.
  trees: {
    make: (r) => ({ x: r() * SPAN, w: 9 + r() * 7, h: 26 + r() * 22 }),
    paint(ctx, layer, base, W, z) {
      const s = layer.size * z;
      fillWith(ctx, layer.dark, () => each(layer, W, s, (it, x) => ctx.rect(x - 1.6 * s, base - it.h * s * 0.6, 3.2 * s, it.h * s * 0.6 + 1)));
      fillWith(ctx, layer.fill, () => each(layer, W, s, (it, x) => {
        const rr = it.w * s;
        const y = base - it.h * s * 0.7;
        blob(ctx, x, y, rr);
        blob(ctx, x - rr * 0.5, y - rr * 0.45, rr * 0.7);
        blob(ctx, x + rr * 0.5, y - rr * 0.35, rr * 0.65);
        blob(ctx, x + rr * 0.6, y + rr * 0.3, rr * 0.6);
      }));
    },
  },
  // Pines and firs: a short trunk under three tiers of branches.
  conifers: {
    make: (r) => ({ x: r() * SPAN, w: 7 + r() * 6, h: 26 + r() * 30 }),
    paint(ctx, layer, base, W, z) {
      const s = layer.size * z;
      fillWith(ctx, layer.dark, () => each(layer, W, s, (it, x) => ctx.rect(x - 1.2 * s, base - it.h * s * 0.25, 2.4 * s, it.h * s * 0.25 + 1)));
      fillWith(ctx, layer.fill, () => each(layer, W, s, (it, x) => {
        for (let t = 0; t < 3; t++) {
          const w = it.w * s * (1 - t * 0.22);
          const y = base - it.h * s * (0.15 + t * 0.26);
          ctx.moveTo(x - w, y);
          ctx.lineTo(x, y - it.h * s * 0.38);
          ctx.lineTo(x + w, y);
          ctx.closePath();
        }
      }));
    },
  },
  // Jagged mountains, shaded on their right flanks, with snow on top. Each
  // is drawn whole before the next, so a cap never lies across a neighbour.
  peaks: {
    make(r) {
      const j = () => (r() - 0.5) * 0.12;
      const top = (r() - 0.5) * 0.5; // the summit, left or right of centre
      const l2 = [top - 0.28 + j(), 0.7 + j()];
      const r1 = [top + 0.3 + j(), 0.72 + j()];
      const r2 = [0.62 + top * 0.3 + j(), 0.38 + j()];
      return {
        x: r() * SPAN,
        w: 80 + r() * 90,
        h: 70 + r() * 80,
        pts: [-1, 0, -0.62 + top * 0.3 + j(), 0.36 + j(), ...l2, top, 1, ...r1, ...r2, 1, 0],
        shade: [top, 1, ...r1, ...r2, 1, 0, top * 0.5 + 0.12, 0],
        cap: [...l2, top, 1, ...r1, top + 0.14, 0.6 + j(), top - 0.1, 0.63 + j()],
      };
    },
    paint(ctx, layer, base, W, z) {
      const s = layer.size * z;
      each(layer, W, s, (it, x) => {
        fillWith(ctx, layer.fill, () => trace(ctx, it.pts, x, base, it.w * s, it.h * s));
        fillWith(ctx, layer.dark, () => trace(ctx, it.shade, x, base, it.w * s, it.h * s));
        fillWith(ctx, layer.cap, () => trace(ctx, it.cap, x, base, it.w * s, it.h * s));
      });
    },
  },
  // Quarry walls: benches cut into the rock in steps, strata across them.
  terraces: {
    make(r) {
      const j = () => (r() - 0.5) * 0.1;
      const a = 0.3 + j();
      const b = 0.64 + j();
      return {
        x: r() * SPAN,
        w: 90 + r() * 110,
        h: 45 + r() * 60,
        pts: [-1, 0, -0.86 + j(), a, -0.66 + j(), a, -0.52 + j(), b, -0.34 + j(), b, -0.22 + j(), 1, 0.28 + j(), 1, 0.4 + j(), b - 0.06, 0.6 + j(), b - 0.06, 0.72 + j(), a - 0.04, 0.88 + j(), a - 0.04, 1, 0],
      };
    },
    paint(ctx, layer, base, W, z) {
      const s = layer.size * z;
      fillWith(ctx, layer.fill, () => each(layer, W, s, (it, x) => trace(ctx, it.pts, x, base, it.w * s, it.h * s)));
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = layer.dark;
      ctx.lineWidth = Math.max(1, z);
      ctx.beginPath();
      for (let y = base - 4 * z; y > base - 110 * s; y -= 7 * z) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      ctx.restore();
    },
  },
  // A scatter of big rocks, half buried.
  boulders: {
    make: (r) => ({ x: r() * SPAN, w: 8 + r() * 18, h: 0.55 + r() * 0.4, k: Array.from({ length: 8 }, () => 0.8 + 0.3 * r()) }),
    paint(ctx, layer, base, W, z) {
      const s = layer.size * z;
      fillWith(ctx, layer.fill, () => each(layer, W, s, (it, x) => {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          const px = x + Math.cos(a) * it.w * s * it.k[k] * 1.2;
          const py = base + 2 * z - Math.sin(a) * it.w * s * it.h * it.k[k];
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
      }));
      ctx.strokeStyle = layer.dark;
      ctx.lineWidth = z;
      ctx.stroke();
    },
  },
};

// A boulder beside the track, behind it, its foot in the dirt, at the
// screen point (x, y) where the ground is; snow on it where there's snow.
const boulder = (ctx, it, x, y, m, P, snow) => {
  const rr = it.s * m;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    ctx.lineTo(x + Math.cos(a) * rr * it.k[i] * 1.2, y + 0.25 * rr - Math.sin(a) * rr * it.k[i]);
  }
  ctx.closePath();
  ctx.fillStyle = P.rock;
  ctx.fill();
  ctx.strokeStyle = P.rockDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (snow) fillWith(ctx, P.top, () => ctx.ellipse(x, y - 0.6 * rr, rr * 0.8, rr * 0.28, 0, 0, TAU));
};

// What's scattered on top of the ground, drawn at the screen point (x, y)
// where the ground is.
const TUFTS = {
  stone(ctx, t, x, y, m, P) {
    fillWith(ctx, P.stone, () => ctx.ellipse(x, y + 0.04 * m, 0.09 * t.s * m, 0.06 * t.s * m, 0, 0, TAU));
  },
  tuft(ctx, t, x, y, m, P) {
    ctx.strokeStyle = P.tuft;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let d = -1; d <= 1; d++) {
      ctx.moveTo(x + 0.06 * d * m, y);
      ctx.lineTo(x + 0.11 * d * m, y - 0.18 * t.s * m);
    }
    ctx.moveTo(x + 0.02 * m, y);
    ctx.lineTo(x + 0.08 * m, y - 0.26 * t.s * m);
    ctx.stroke();
    if (t.c) fillWith(ctx, t.c, () => blob(ctx, x + 0.08 * m, y - 0.26 * t.s * m, 0.045 * m));
  },
};

// The ground between a and b (metres) as the clip, so what's painted next
// shows only inside the dirt.
const clipGround = (ctx, v, a, b) => {
  const hs = v.L.heights;
  const i0 = Math.max(0, Math.floor(a / STEP));
  const i1 = Math.min(hs.length - 1, Math.ceil(b / STEP));
  ctx.beginPath();
  ctx.moveTo(v.sx(i0 * STEP), v.H + 20);
  for (let i = i0; i <= i1; i++) ctx.lineTo(v.sx(i * STEP), v.sy(hs[i]));
  ctx.lineTo(v.sx(i1 * STEP), v.H + 20);
  ctx.closePath();
  ctx.clip();
};

// A slab of rock from an outline [[x, y], ...] (metres), with strata at
// uneven spacing from its top down to its foot and a crack or two.
const slab = (a, b, top, foot, outline, r) => {
  const strata = [];
  for (let y = top - 0.08 - 0.08 * r(); y > foot; y -= 0.1 + 0.1 * r()) strata.push(y);
  const crack = () => a + (b - a) * (0.2 + 0.6 * r());
  return { a, b, top, foot, shape: outline.flat(), strata, cracks: [crack(), crack()] };
};

// Rock showing through the dirt where the ground steps: the slab, its
// strata and cracks, its edge, all inside the ground.
const rockFace = (ctx, d, v, P) => {
  const { sx, sy, m } = v;
  ctx.save();
  clipGround(ctx, v, d.a - 0.3, d.b + 0.3);
  ctx.beginPath();
  for (let k = 0; k < d.shape.length; k += 2) ctx.lineTo(sx(d.shape[k]), sy(d.shape[k + 1]));
  ctx.closePath();
  ctx.fillStyle = P.rock;
  ctx.fill();
  ctx.strokeStyle = P.rockDark;
  ctx.lineWidth = Math.max(1.5, 0.03 * m);
  ctx.stroke();
  ctx.clip();
  ctx.lineWidth = Math.max(1, 0.018 * m);
  ctx.beginPath();
  for (const y of d.strata) {
    ctx.moveTo(sx(d.a - 0.2), sy(y));
    ctx.lineTo(sx(d.b + 0.2), sy(y));
  }
  for (const c of d.cracks) {
    ctx.moveTo(sx(c), sy(d.top + 0.1));
    ctx.lineTo(sx(c + 0.06), sy(d.top - 0.2));
    ctx.lineTo(sx(c - 0.02), sy(d.top - 0.45));
  }
  ctx.stroke();
  ctx.restore();
};

// How each kind of obstacle is dressed, beyond the ground's own outline.
// `make` works out where its parts are, once per course (or returns nothing
// to leave it plain), with a and b the stretch it covers; `under` paints
// before the ground's top edge is drawn, `over` after. Neither moves the
// ground line.
const FEATURE_ART = {
  // A ledge: a slab of rock from the foot of its face to where it drops
  // back down.
  step: {
    make(L, f, i, r) {
      const next = L.features[i + 1];
      const b = next?.kind === 'drop' && Math.abs(next.x0 - f.x1) < 0.05 ? next.x1 : f.x1;
      let top = -Infinity;
      for (let x = f.x0; x <= b; x += STEP) top = Math.max(top, heightAt(L, x));
      const foot = Math.min(heightAt(L, f.x0), heightAt(L, b)) - 0.4;
      const a = f.x0 - 0.05;
      return slab(a, b + 0.03, top, foot, [[a, top + 0.3], [b + 0.03, top + 0.3], [b + 0.03, foot], [a, foot]], r);
    },
    under: rockFace,
  },
  // A drop-off: a rock face under its edge, ragged where it meets the dirt
  // behind. (A ledge's own drop is part of the ledge's slab.)
  drop: {
    make(L, f, i, r) {
      const prev = L.features[i - 1];
      if (prev?.kind === 'step' && Math.abs(prev.x1 - f.x0) < 0.05) return null;
      const top = heightAt(L, f.x0);
      const bottom = heightAt(L, f.x1);
      const w = 0.8 + 0.5 * (top - bottom);
      const foot = bottom - 0.35;
      const outline = [[f.x1 + 0.05, top + 0.3], [f.x1 + 0.05, foot]];
      for (let k = 0; k <= 4; k++) outline.push([f.x0 - w * (0.55 + 0.45 * r()), foot + ((top + 0.3 - foot) * k) / 4]);
      return slab(f.x0 - w, f.x1 + 0.05, top, foot, outline, r);
    },
    under: rockFace,
  },
  // A jump: a wooden kicker, planked along its face and propped on uprights,
  // with a dark board at its sheer back and a dark lip.
  jump: {
    make(L, f) {
      const hs = L.heights;
      const ia = Math.round(f.x0 / STEP);
      const end = Math.min(hs.length - 2, Math.round(f.x1 / STEP));
      let lip = ia;
      for (let i = ia; i < end; i++) if (hs[i + 1] - hs[i] < hs[lip + 1] - hs[lip]) lip = i;
      if (lip <= ia + 2) return null;
      return { a: f.x0, b: (lip + 1) * STEP, ia, lip, ya: hs[ia], yb: hs[lip + 1] };
    },
    under(ctx, d, v, P) {
      const { sx, sy, m } = v;
      const hs = v.L.heights;
      const floor = (i) => d.ya + ((d.yb - d.ya) * (i - d.ia)) / (d.lip + 1 - d.ia);
      ctx.save();
      ctx.beginPath();
      for (let i = d.ia; i <= d.lip; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
      ctx.lineTo(sx(d.lip * STEP), sy(floor(d.lip)));
      ctx.closePath();
      ctx.fillStyle = P.wood;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = P.woodLight;
      ctx.lineWidth = Math.max(1, 0.02 * m);
      ctx.beginPath();
      for (let k = 1; k < 13; k++) {
        for (let i = d.ia; i <= d.lip; i++) {
          if (i === d.ia) ctx.moveTo(sx(i * STEP), sy(hs[i] - k * 0.14));
          else ctx.lineTo(sx(i * STEP), sy(hs[i] - k * 0.14));
        }
      }
      ctx.stroke();
      ctx.strokeStyle = P.woodDark;
      ctx.lineWidth = Math.max(1.5, 0.04 * m);
      ctx.beginPath();
      for (let i = d.ia + 5; i < d.lip - 1; i += 6) {
        ctx.moveTo(sx(i * STEP), sy(hs[i]));
        ctx.lineTo(sx(i * STEP), sy(floor(i)));
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = P.woodDark;
      ctx.lineWidth = Math.max(2, 0.07 * m);
      ctx.beginPath();
      ctx.moveTo(sx(d.lip * STEP - 0.035), sy(hs[d.lip]));
      ctx.lineTo(sx(d.lip * STEP - 0.035), sy(floor(d.lip)));
      ctx.stroke();
    },
    over(ctx, d, v, P) {
      const { sx, sy } = v;
      const hs = v.L.heights;
      const deck = () => {
        ctx.beginPath();
        for (let i = d.ia; i <= d.lip; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
        ctx.stroke();
      };
      ctx.lineWidth = v.surface;
      ctx.strokeStyle = P.wood;
      deck();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = P.woodLight;
      deck();
      ctx.lineCap = 'butt';
      ctx.lineWidth = v.surface * 0.8;
      ctx.strokeStyle = P.woodDark;
      ctx.beginPath();
      ctx.moveTo(sx((d.lip - 1) * STEP), sy(hs[d.lip - 1]));
      ctx.lineTo(sx(d.lip * STEP), sy(hs[d.lip]));
      ctx.stroke();
      ctx.lineCap = 'round';
    },
  },
  // A gap: dark inside and darker down deep, the far wall catching a little
  // light, roots and dirt hanging from below both lips.
  gap: {
    make(L, f, i, r) {
      const ya = heightAt(L, f.x0);
      const yb = heightAt(L, f.x1);
      // Where a wall is at height y, walking in from its lip.
      const wall = (x, dir, y) => {
        let w = x;
        while (heightAt(L, w) > y && Math.abs(w - x) < 1) w += dir * 0.01;
        return w;
      };
      const hang = (count, len) => Array.from({ length: count }, (_, k) => {
        const dir = k % 2 ? -1 : 1;
        const y = (dir > 0 ? ya : yb) - 0.03 - r() * 0.45;
        return { x: wall(dir > 0 ? f.x0 : f.x1, dir, y), y, dir, len: len * (0.4 + r()), bend: r() - 0.5 };
      });
      return { a: f.x0, b: f.x1, ia: Math.floor(f.x0 / STEP), ib: Math.ceil(f.x1 / STEP), ya, yb, roots: hang(6, 0.6), drips: hang(6, 0.22) };
    },
    under(ctx, d, v, P) {
      const { sx, sy, m } = v;
      const hs = v.L.heights;
      const lip = sy(Math.min(d.ya, d.yb));
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx(d.a) - 4, lip, sx(d.b) - sx(d.a) + 8, v.H + 40 - lip);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(sx(d.ia * STEP), sy(hs[d.ia]));
      for (let i = d.ia + 1; i <= d.ib; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
      ctx.closePath();
      ctx.save();
      ctx.translate(0, lip);
      ctx.fillStyle = v.pit;
      ctx.fill();
      ctx.restore();
      ctx.clip();
      ctx.save();
      ctx.translate(sx(d.b) - m, 0);
      ctx.fillStyle = v.wall;
      ctx.fillRect(0, lip, m + 4, v.H - lip + 40);
      ctx.restore();
      ctx.strokeStyle = P.root;
      ctx.lineWidth = Math.max(1, 0.025 * m);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const t of d.roots) {
        ctx.moveTo(sx(t.x), sy(t.y));
        ctx.quadraticCurveTo(sx(t.x + t.dir * t.len * 0.35), sy(t.y - t.len * 0.15), sx(t.x + t.dir * t.len * (0.25 + t.bend * 0.3)), sy(t.y - t.len));
      }
      ctx.stroke();
      ctx.fillStyle = P.deep;
      ctx.beginPath();
      for (const t of d.drips) {
        ctx.moveTo(sx(t.x - t.dir * 0.03), sy(t.y + 0.03));
        ctx.lineTo(sx(t.x + t.dir * t.len * 0.5), sy(t.y));
        ctx.lineTo(sx(t.x + t.dir * 0.04), sy(t.y - t.len));
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    },
  },
  // A log: bark round the outside, its sawn end showing rings and cracks.
  log: {
    make(L, f) {
      const cx = (f.x0 + f.x1) / 2;
      const base = heightAt(L, f.x0);
      const r = (heightAt(L, cx) - base) / 2;
      return r > 0 ? { a: f.x0, b: f.x1, cx, cy: base + r, r } : null;
    },
    over(ctx, d, v, P) {
      const x = v.sx(d.cx);
      const y = v.sy(d.cy);
      const rr = d.r * v.m;
      ctx.fillStyle = P.logEnd;
      ctx.beginPath();
      blob(ctx, x, y, rr);
      ctx.fill();
      ctx.strokeStyle = P.ring;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const k of [0.25, 0.48, 0.7]) blob(ctx, x, y, rr * k);
      for (const a of [0.5, 2.6, 4.4]) {
        ctx.moveTo(x + Math.cos(a) * rr * 0.12, y + Math.sin(a) * rr * 0.12);
        ctx.lineTo(x + Math.cos(a) * rr * 0.62, y + Math.sin(a) * rr * 0.62);
      }
      ctx.stroke();
      const bark = Math.min(rr * 0.4, Math.max(2, 0.07 * v.m));
      ctx.strokeStyle = P.woodDark;
      ctx.lineWidth = bark;
      ctx.beginPath();
      blob(ctx, x, y, rr - bark / 2);
      ctx.stroke();
    },
  },
};

// The bike and its rider, drawn in the frame's own coordinates: metres from
// the centre of mass, x forward, y up (the caller has set the transform).
// The rider stands on the pegs and leans by `pose` (1 = back, -1 =
// forward). Shared with the card picture on the hub.
const INK = '#1d1b22';
const RED_DARK = '#9d1b25';
const RED_LIGHT = '#ff8f98';
const JERSEY = ['#2a9d8f', '#1b6b61']; // near side, far side
const PANTS = ['#264653', '#16303a'];
const METAL = '#a7adb5';

// Two-bone reach: where the joint goes between a root and a tip, given the
// two bone lengths. The joint sits to the left of the line root -> tip, which
// is above it for an arm reaching forward and down and in front of it for a
// leg reaching down. The reach is clamped so a limb never straightens past
// its length (the tip returned is where the limb actually gets to), and
// `flat` shortens the bend for an elbow that also flares out of the picture.
const reach = (a, b, l1, l2, flat = 1) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const far = Math.hypot(dx, dy) || 1e-6;
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(far, (l1 + l2) * 0.995));
  const ux = dx / far;
  const uy = dy / far;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along)) * flat;
  return [[a[0] + ux * along - uy * out, a[1] + uy * along + ux * out], [a[0] + ux * d, a[1] + uy * d]];
};

// Piecewise between the three poses: over the bars, neutral, and back.
const byPose = (pose, fwd, mid, back) => (pose < 0 ? mid + (mid - fwd) * pose : mid + (back - mid) * pose);

export function paintBike(ctx, B, pose = B.lean ?? 0) {
  const p = Math.max(-1, Math.min(1, pose));
  const spin = B.spin ?? 0;
  const rx = -BASE / 2;
  const fx = BASE / 2;
  const ay = -COM; // axle height
  const trace = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  // Strokes the current path; a dashed one (knobs, teeth, coils) has square
  // ends so the dashes stay apart.
  const stroke = (width, colour, dash = []) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.setLineDash(dash);
    ctx.lineCap = dash.length ? 'butt' : 'round';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  };
  const line = (pts, width, colour, dash) => {
    trace(pts);
    stroke(width, colour, dash);
  };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const finish = (fill, edge, width) => {
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) stroke(width, edge);
  };
  const shape = (pts, fill, edge = INK, width = 0.012) => {
    trace(pts);
    ctx.closePath();
    finish(fill, edge, width);
  };
  const disc = (x, y, r, fill, edge = null, width = 0.01) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    finish(fill, edge, width);
  };
  // A ring of tyre knobs or sprocket teeth, turning with the wheel.
  const teeth = (x, y, r, width, colour, count, turn) => {
    const gap = (Math.PI * 2 * r) / count;
    ctx.beginPath();
    ctx.arc(x, y, r, turn, turn + Math.PI * 2);
    stroke(width, colour, [gap * 0.55, gap * 0.45]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The rider's pose: hips slide along the seat, the torso pitches, the head
  // stays level to look ahead. Feet stay on the pegs and hands on the grips.
  const peg = [-0.06, -0.36];
  const ankle = [peg[0] - 0.03, peg[1] + 0.07];
  const grip = [0.3, 0.47];
  const hip = [byPose(p, -0.18, -0.22, -0.4), byPose(p, 0.45, 0.52, 0.3)];
  const tilt = byPose(p, 0.7, 0.45, 0.2); // torso from upright, radians
  const shoulder = [hip[0] + 0.5 * Math.sin(tilt), hip[1] + 0.5 * Math.cos(tilt)];
  const nod = tilt * 0.4;
  const head = [shoulder[0] + 0.25 * Math.sin(nod), shoulder[1] + 0.25 * Math.cos(nod)];
  const leg = (h, a, colour, boot) => {
    const [knee, foot] = reach(h, a, 0.44, 0.44);
    line([h, knee], 0.16, colour[0]);
    line([knee, foot], 0.125, colour[0]);
    line([mix(knee, foot, 0.4), foot], 0.13, boot);
    disc(knee[0] + 0.02, knee[1], 0.065, colour[1]); // knee guard
    shape([[foot[0] - 0.08, foot[1] + 0.03], [foot[0] + 0.045, foot[1] + 0.035], [foot[0] + 0.15, foot[1] - 0.07], [foot[0] - 0.09, foot[1] - 0.09]], boot, INK, 0.012);
    line([[foot[0] - 0.09, foot[1] - 0.09], [foot[0] + 0.15, foot[1] - 0.08]], 0.028, INK); // sole
  };
  const arm = (s, g, colour) => {
    const [elbow, hand] = reach(s, g, 0.36, 0.34, 0.55);
    line([s, elbow], 0.105, colour);
    line([elbow, hand], 0.088, colour);
    disc(hand[0], hand[1], 0.047, INK); // glove
  };

  // The far leg and arm, behind the bike and in shadow.
  leg([hip[0] + 0.04, hip[1]], [ankle[0] + 0.05, ankle[1]], PANTS.slice().reverse(), '#b9bec4');
  arm([shoulder[0] + 0.04, shoulder[1]], [grip[0] + 0.05, grip[1] + 0.01], JERSEY[1]);

  // Wheels: knobbly tyres, rims, crossed spokes and hubs.
  const wheel = (x, y, turn, rear) => {
    disc(x, y, 0.3, '#2b2b30');
    teeth(x, y, 0.317, 0.046, INK, 26, turn);
    disc(x, y, 0.255, '#dbe6ef');
    disc(x, y, 0.235, '#dbe6ef', METAL, 0.022);
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = turn + (i * Math.PI) / 10;
      const b = a + (i % 2 ? 0.55 : -0.55);
      ctx.moveTo(x + Math.cos(a) * 0.045, y + Math.sin(a) * 0.045);
      ctx.lineTo(x + Math.cos(b) * 0.23, y + Math.sin(b) * 0.23);
    }
    stroke(0.008, '#6c737b');
    if (rear) {
      disc(x, y, 0.12, '#4a4d52', INK);
      teeth(x, y, 0.13, 0.025, '#4a4d52', 30, turn);
      for (let i = 0; i < 5; i++) {
        const a = turn + (i * Math.PI * 2) / 5;
        disc(x + Math.cos(a) * 0.075, y + Math.sin(a) * 0.075, 0.022, '#dbe6ef');
      }
    } else {
      disc(x, y, 0.1, 'rgba(0,0,0,0)', '#8d949c', 0.03); // brake disc
    }
    disc(x, y, 0.05, '#6c737b', INK);
    disc(x, y, 0.018, '#e9ecef');
  };
  const fork = (dx, near) => {
    const axle = [fx + dx, ay];
    const top = [0.31 + dx, 0.22];
    line([axle, mix(axle, top, 0.45)], 0.075, near ? '#2b2b30' : INK); // slider
    line([mix(axle, top, 0.4), top], 0.05, near ? '#d7dde3' : '#8d949c'); // stanchion
  };
  fork(0.035, false);
  wheel(rx, ay, -spin, true);
  wheel(fx, ay, -spin * 0.97, false);

  // Chain from the gearbox sprocket to the rear one, then the swingarm and
  // its shock on top.
  const box = [-0.04, -0.4];
  line([[box[0], box[1] + 0.045], [rx, ay + 0.135], [rx, ay - 0.135], [box[0], box[1] - 0.045]], 0.018, '#3a3d42');
  const pivot = [-0.14, -0.38];
  shape([[pivot[0], pivot[1] + 0.045], [rx, ay + 0.03], [rx - 0.03, ay], [rx, ay - 0.03], [pivot[0], pivot[1] - 0.045]], '#3d4148');
  line([[pivot[0] - 0.02, pivot[1] + 0.02], [rx + 0.05, ay + 0.015]], 0.012, '#8d949c');
  const shockLow = [-0.36, -0.43];
  const shockTop = [-0.2, -0.02];
  line([shockLow, shockTop], 0.04, '#5a5f66');
  line([mix(shockLow, shockTop, 0.2), mix(shockLow, shockTop, 0.8)], 0.07, '#f4b400', [0.014, 0.014]); // spring

  // The engine: crankcase, a finned cylinder leaning forward, a skid plate
  // underneath, and the pipe curling down from the cylinder and back to the
  // silencer.
  shape([[-0.16, -0.22], [0.13, -0.2], [0.2, -0.33], [0.1, -0.46], [-0.14, -0.45], [-0.2, -0.33]], '#6c737b');
  disc(-0.03, -0.37, 0.065, '#8d949c', INK); // clutch cover
  disc(box[0], box[1], 0.04, '#3a3d42');
  shape([[-0.06, -0.21], [0.11, -0.2], [0.17, -0.02], [0.02, -0.02]], '#8d949c');
  for (let i = 1; i < 5; i++) line([[-0.06 + i * 0.03, -0.205 + i * 0.045], [0.11 + i * 0.012, -0.2 + i * 0.045]], 0.012, '#5a5f66');
  shape([[0.24, -0.36], [0.12, -0.5], [-0.14, -0.5], [-0.18, -0.45], [0.1, -0.45]], '#c9d0d6'); // skid plate
  const pipe = [[0.15, -0.06], [0.27, -0.16], [0.28, -0.29], [0.18, -0.36], [-0.12, -0.3], [-0.3, -0.24], [-0.46, -0.1]];
  line(pipe, 0.055, '#5c4330');
  line(pipe, 0.022, '#c9925a');
  line([[-0.46, -0.1], [-0.9, -0.01]], 0.1, '#3a3d42'); // silencer
  line([[-0.47, -0.1], [-0.89, -0.015]], 0.065, '#8d949c');
  line([[-0.5, -0.075], [-0.86, 0.005]], 0.014, '#e3e8ec');

  // Frame: twin spars from the steering head to the swingarm pivot, a down
  // tube to the front of the engine and a subframe for the seat.
  const headTop = [0.3, 0.2];
  const headLow = [0.36, 0.06];
  line([headTop, [-0.12, -0.04], pivot], 0.075, RED_DARK);
  line([headTop, [-0.12, -0.04], pivot], 0.05, FRAME);
  line([headLow, [0.22, -0.3]], 0.045, FRAME);
  line([[-0.12, -0.04], [-0.55, 0.07]], 0.04, RED_DARK);
  line([headTop, headLow], 0.08, RED_DARK);

  // Plastics: rear mudguard, side panel with a number, slim seat, and the
  // small tank with its shadow and a highlight.
  shape([[-0.22, 0.06], [-0.6, 0.11], [-0.98, 0.09], [-0.96, 0.05], [-0.6, 0.04], [-0.3, -0.04]], FRAME, RED_DARK);
  shape([[-0.16, 0.02], [-0.5, 0.06], [-0.44, -0.16], [-0.2, -0.14]], '#f4f1e8', RED_DARK, 0.02);
  line([[-0.38, -0.01], [-0.28, -0.01], [-0.35, -0.12]], 0.022, INK); // the number 7
  line([[-0.25, -0.01], [-0.25, -0.12]], 0.022, INK); // and a 1: rider 71
  shape([[0.02, 0.13], [-0.1, 0.16], [-0.56, 0.17], [-0.6, 0.12], [-0.1, 0.09]], '#25252b', null);
  line([[-0.1, 0.152], [-0.52, 0.163]], 0.012, '#4a4a52');
  disc(0.1, 0.03, 0.09, 'rgba(0,0,0,0.25)'); // shadow under the tank
  shape([[0.3, 0.12], [0.24, 0.24], [0.05, 0.24], [-0.06, 0.14], [0.06, 0.06], [0.24, 0.06]], FRAME, RED_DARK, 0.016);
  line([[0.08, 0.215], [0.22, 0.215]], 0.025, RED_LIGHT);

  // Front end: near fork, mudguard, triple clamps, number plate and bars.
  fork(0, true);
  shape([[0.47, -0.17], [0.62, -0.15], [0.86, -0.22], [0.85, -0.26], [0.62, -0.2], [0.48, -0.21]], FRAME, RED_DARK);
  line([[0.27, 0.22], [0.37, 0.22]], 0.035, '#4a4d52');
  line([[0.32, 0.08], [0.41, 0.08]], 0.035, '#4a4d52');
  shape([[0.38, 0.05], [0.46, 0.08], [0.45, 0.26], [0.37, 0.25]], FRAME, RED_DARK, 0.014);
  line([[0.31, 0.22], [0.35, 0.36], [grip[0] - 0.02, grip[1] - 0.02]], 0.042, '#2b2b30');
  line([[grip[0] + 0.005, grip[1]], [grip[0] + 0.1, grip[1] - 0.07]], 0.016, '#8d949c'); // brake lever

  // The rider: near leg, body, near arm, then the helmet on top.
  leg(hip, ankle, PANTS, '#eef0f2');
  line([peg, [peg[0] + 0.08, peg[1]]], 0.035, METAL); // footpeg
  const t = [Math.sin(tilt), Math.cos(tilt)];
  const f = [Math.cos(tilt), -Math.sin(tilt)]; // across the body, to the chest
  const at = (o, a, b) => [o[0] + t[0] * a + f[0] * b, o[1] + t[1] * a + f[1] * b];
  const torso = [[-0.02, -0.105], [0.17, -0.13], [0.36, -0.125], [0.48, -0.08], [0.55, 0], [0.52, 0.08], [0.39, 0.125], [0.19, 0.095], [0.03, 0.09]];
  shape(torso.map(([a, b]) => at(hip, a, b)), JERSEY[0], '#164f48', 0.014);
  shape([at(hip, -0.045, -0.105), at(hip, 0.025, 0.09), at(hip, 0.095, 0.09), at(hip, 0.085, -0.125)], PANTS[0], null);
  line([at(hip, 0.275, -0.125), at(hip, 0.31, 0.105)], 0.04, '#f4f1e8'); // jersey stripe
  line([at(shoulder, 0, 0.02), [head[0] - 0.02, head[1] - 0.07]], 0.07, '#e0b07a'); // neck
  arm(shoulder, grip, JERSEY[0]);

  // Helmet: shell with a stripe, peak, goggles and strap, and a chin bar.
  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.rotate(-nod * 0.5);
  ctx.scale(0.95, 0.95);
  disc(0, 0, 0.15, '#f8f9fa', INK, 0.014);
  line([[0, 0.115], [-0.07, 0.093], [-0.11, 0.035], [-0.115, -0.01]], 0.035, FRAME);
  shape([[0.02, 0.13], [0.24, 0.1], [0.22, 0.065], [0.06, 0.07]], FRAME, RED_DARK); // peak
  shape([[0.1, -0.06], [0.2, -0.07], [0.2, -0.13], [0.07, -0.15]], '#d9dde2', INK); // chin bar
  line([[-0.15, 0.03], [0.06, 0.02]], 0.035, '#f4b400'); // goggle strap
  shape([[0.06, 0.055], [0.165, 0.045], [0.16, -0.035], [0.06, -0.025]], '#273c55', INK); // goggle lens
  line([[0.085, 0.03], [0.13, 0.025]], 0.012, 'rgba(255,255,255,0.7)');
  ctx.restore();
}
