// Trial Bike in play: the camera, which pulls back and looks further ahead
// as the bike gathers speed; the drawing (the sky at the course's time of
// day with its sun, or moon and stars; the country each band of courses
// rides through -- meadow, forest, quarry, alpine -- as backdrop layers that
// slide at their own pace into a haze; the dirt with rock faces, plank
// ramps, pits and logs, tufts and stones on top and boulders beside the
// track; birds that take off as the bike comes, a cow on a hill every tenth
// course, the crowd at the finish (forty strong once a flip is landed) and
// the flares over it, tyre tracks, flags, a headlight after dark, the bike
// and its rider, dust, exhaust and the wind of speed); the instrument band
// along the top; and the ride itself -- stepping the engine, crashes (the
// wreck tumbling on until it rests, the rider thrown clear to land in a
// heap), flips, checkpoints and the finish.
import { step, newBike, rider, heightAt, slopeAt, grounded, G, WHEEL, BASE, COM, VMAX, STEP, FLIP_BONUS } from './engine.js';
import { rng } from '../../js/lib/random.js';

const FRAME = '#e63946';
const SHEER = STEP * 2.5; // ground rising or falling faster than this holds no grass
const DASH = [5, 4];
const SOLID = [];

// How the camera frames the ride, sideways and upright: the metres across
// the screen when slow and when flat out, and how far up the screen the
// ground ahead of the bike sits.
const FRAMING = { wide: { near: 13, far: 19, ground: 0.4 }, tall: { near: 8.5, far: 11.5, ground: 0.28 } };

// The backdrop slides this many pixels for each metre the camera moves,
// whatever the zoom, so pulling back doesn't drag the hills along.
const PARALLAX = 50;

// The instrument band: its height, its type and its inks.
const HUD = { h: 24, font: 'ui-monospace, Menlo, Consolas, monospace', band: 'rgba(5,7,12,.68)', rule: 'rgba(255,255,255,.1)', dim: 'rgba(205,214,222,.55)', ink: '#e4eaee', amber: '#ffb347', green: '#5fd38a', red: '#ff5a4d' };

// How far the lowest of a thrown rider's hips, head and feet is into the
// ground (his hips lie BODY off it).
const BODY = 0.13;
const sunk = (L, T) => {
  const c = Math.cos(T.angle);
  const s = Math.sin(T.angle);
  return Math.max(...[-0.8, 0, 0.8].map((d) => heightAt(L, T.x + d * c) + BODY - (T.y + d * s)));
};

// A flip landed is celebrated: the banner's second line for more than one
// turn, and a flare over the finish for each turn -- rising for `rise`
// seconds, then `sparks` of them falling and fading for `fall`.
const MULTIPLE = [null, null, 'DOUBLE!', 'TRIPLE!', 'QUADRUPLE!'];
const FLARE = { rise: 0.6, fall: 1.5, sparks: 18 };

// The cow: how high her back is (the bike must clear it), and how long she
// looks up for (s).
const COW = { back: 1.1, look: 2 };

// ------------------------------------------------------------------ scenes

// The country course n rides through: two courses each for the first
// eight, so all four are met early (meadow 1-2, forest 3-4, quarry 5-6,
// alpine 7-8), then five each from course 9, round and round.
const BANDS = ['meadow', 'forest', 'quarry', 'alpine'];
const sceneFor = (n) => SCENES[BANDS[Math.floor(n <= 8 ? (n - 1) / 2 : (n - 9) / 5) % BANDS.length]];

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
    colours: { far: '#4f7a68', mid: '#355f45', near: '#22472f', dirt: '#5a3820', deep: '#2c1a0e', top: '#4f8f2a', tuft: '#356e1e', bush: '#2f5f2c', stone: '#57514c', rock: '#776a5c', wood: '#a8743c', root: '#3a2210', dust: '#a88a62' },
    layers: [
      { art: 'hills', colour: 'far', drift: 0.2, base: 0.55, count: 44, size: 1 },
      { art: 'hills', colour: 'mid', drift: 0.4, base: 0.6, count: 56, size: 0.7 },
      { art: 'trees', colour: 'near', drift: 0.5, base: 0.63, count: 9, size: 0.9 },
    ],
    rocks: 0, surface: 0.2, tuftGap: 2.5, stones: 0.25, flowers: 0.15, clouds: 7,
  },
  forest: {
    colours: { far: '#46695e', mid: '#264c3c', near: '#143327', dirt: '#4a3120', deep: '#22150b', top: '#3f7a26', tuft: '#285a1a', bush: '#24502c', stone: '#54504a', rock: '#6a645a', wood: '#9a6834', root: '#2c1a0e', dust: '#8a7052' },
    layers: [
      { art: 'hills', colour: 'far', drift: 0.15, base: 0.52, count: 40, size: 0.6 },
      { art: 'conifers', colour: 'mid', drift: 0.3, base: 0.62, count: 220, size: 1.3 },
      { art: 'trees', colour: 'near', drift: 0.55, base: 0.72, count: 30, size: 2.4 },
      { art: 'conifers', colour: 'near', drift: 0.55, base: 0.72, count: 30, size: 2.6 },
    ],
    rocks: 0, surface: 0.2, tuftGap: 2, stones: 0.2, flowers: 0.03, clouds: 5,
  },
  quarry: {
    colours: { far: '#b5875c', mid: '#8a5f42', near: '#5c4434', dirt: '#74503a', deep: '#3a271b', top: '#a8865e', tuft: '#7a6440', bush: '#5c4434', stone: '#5a4e44', rock: '#a08464', wood: '#a8743c', root: '#4a3626', dust: '#c2a27a' },
    layers: [
      { art: 'terraces', colour: 'far', drift: 0.15, base: 0.58, count: 16, size: 1.2 },
      { art: 'terraces', colour: 'mid', drift: 0.3, base: 0.64, count: 20, size: 0.8 },
      { art: 'boulders', colour: 'near', drift: 0.5, base: 0.69, count: 40, size: 1 },
    ],
    rocks: 7, surface: 0.14, tuftGap: 1.6, stones: 0.85, flowers: 0, clouds: 3,
  },
  alpine: {
    colours: { far: '#6a80a4', mid: '#41557a', near: '#1b352d', field: '#7487a6', cap: '#cdd7e4', dirt: '#463b37', deep: '#211a17', top: '#bcc8d8', tuft: '#8696a8', bush: '#1b352d', stone: '#3c3633', rock: '#66626e', wood: '#9a6834', root: '#2e221c', dust: '#dde4ee' },
    layers: [
      { art: 'peaks', colour: 'far', drift: 0.1, base: 0.6, count: 18, size: 1.3 },
      { art: 'peaks', colour: 'mid', drift: 0.25, base: 0.65, count: 22, size: 0.8 },
      { art: 'conifers', colour: 'near', floor: 'field', drift: 0.5, base: 0.69, count: 14, size: 1.2 },
    ],
    rocks: 9, snow: true, surface: 0.26, tuftGap: 3, stones: 1, flowers: 0, clouds: 6,
  },
};

// How far each part of the backdrop fades into the horizon's colour.
const HAZE = { far: 0.45, mid: 0.25, near: 0.1, field: 0.15, cap: 0.3 };

// The time of day, round a day of sixteen courses: course 1 rides at first
// light with the sun low on the left, the late morning is clear, the
// afternoon dusty, golden hour comes around course 8 and dusk around 10,
// it's night from course 12, and first light comes back just before course
// 17 starts the round again. Each key is a moment of the day: the sky top
// to horizon, the sun's colour and place (shares of the screen), the tint
// the light lends the land and how much, and how dark it is (stars, moon
// and the headlight).
const DAY = 16;
const SKIES = [
  { at: 0, top: '#1f3766', horizon: '#c48a66', sun: '#ffd9a8', pos: [0.14, 0.42], tint: '#ff9a5c', k: 0.14, night: 0 },
  { at: 0.18, top: '#1d4a88', horizon: '#86a8c2', sun: '#fff0cc', pos: [0.42, 0.16], tint: '#ffe2b8', k: 0.04, night: 0 },
  { at: 0.34, top: '#274a80', horizon: '#c09c78', sun: '#ffe2a8', pos: [0.66, 0.22], tint: '#ffb469', k: 0.1, night: 0 },
  { at: 0.46, top: '#2b2f66', horizon: '#d97a4a', sun: '#ff9a3c', pos: [0.8, 0.36], tint: '#ff7a2e', k: 0.24, night: 0 },
  { at: 0.56, top: '#141638', horizon: '#a0463c', sun: '#ff5a2e', pos: [0.88, 0.52], tint: '#36255e', k: 0.4, night: 0.4 },
  { at: 0.66, top: '#05081a', horizon: '#141f40', sun: '#ff5a2e', pos: [0.94, 0.75], tint: '#0a1230', k: 0.6, night: 1 },
  { at: 0.9, top: '#05081a', horizon: '#141f40', sun: '#ffc890', pos: [0.04, 0.75], tint: '#0a1230', k: 0.6, night: 1 },
  { at: 0.96, top: '#1a2050', horizon: '#9a5c58', sun: '#ffc890', pos: [0.08, 0.6], tint: '#2c2a60', k: 0.38, night: 0.45 },
];
SKIES.push({ ...SKIES[0], at: 1 });
const MOON = [0.76, 0.22];

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

// What the crowd at the finish wears, and their skins.
const SHIRTS = ['#2a6fdb', '#ffb703', '#7b5cd6', '#2a9d8f', '#f4f1e8'];
const SKINS = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69'];

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
      // (A first frame's time can be from just before the constructor ran.)
      const dt = clamp((now - this.last) / 1000, 0, 0.05) * this.timeScale;
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
    this.started = false; // the clock waits for the first touch of the gas
    this.bonus = 0; // seconds off the clock for flips landed
    this.flips = 0;
    this.roaring = false; // a flip's been landed: the whole crowd's out
    this.flares = [];
    this.crashes = 0;
    this.outcome = null;
    this.waiting = false; // crashed, waiting for the tap that goes again
    this.wreck = null; // after a crash: { t, still } -- seconds since, and at rest
    this.thrown = null; // the rider, thrown off in a crash
    this.dust = [];
    this.puffT = 0;
    this.shake = 0;
    this.message = null;
    this.cam = null;
    this.flagShown = -1;
    this.pose = 0; // the rider's drawn lean, eased toward the input
  }

  // After a crash: back to the last flag, with the clock where it was (and
  // the camera cut straight there).
  retry() {
    const flag = this.B.flag;
    this.B = newBike(this.level, flag >= 0 ? this.level.flags[flag] : this.level.start);
    this.outcome = null;
    this.waiting = false;
    this.wreck = null;
    this.thrown = null;
    this.message = null;
    this.dust = [];
    this.cam = null;
    this.roaring = false;
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
      cloud: fade(blend(sky.horizon, '#ffffff', 0.35), 0.5 - 0.42 * sky.night),
    });
    this.P = P;
    // The backdrop's layers, each with its things spread along it, and the
    // haze that falls in front of all but the nearest.
    this.layers = scene.layers.map((l) => {
      const art = BACKDROP[l.art];
      const fill = P[l.colour];
      const items = Array.from({ length: l.count }, () => art.make(r));
      return { ...l, paint: art.paint, items, fill, floor: P[l.floor] ?? fill, dark: blend(fill, '#000000', 0.22), light: blend(fill, '#ffffff', 0.2), cap: P.cap, sx: new Float32Array(l.count) };
    });
    this.hazeAt = scene.layers.findIndex((l) => l.colour === 'near');
    this.clouds = Array.from({ length: scene.clouds }, () => ({ x: r() * 400, y: 0.12 + r() * 0.3, w: 40 + r() * 90 }));
    this.stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.55, s: 1 + r() * 1.4, a: 0.4 + r() * 0.6, ph: r() * TAU }));
    this.streaks = Array.from({ length: 14 }, () => ({ x: r(), y: 0.12 + r() * 0.55, len: 0.4 + r() }));
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
    const lit = (c) => blend(c, sky.tint, sky.k);
    const person = (x, h, shirt) => ({ x, h, ph: r() * TAU, shirt: lit(shirt), skin: lit(SKINS[Math.floor(r() * SKINS.length)]) });
    const first = Math.floor(r() * SHIRTS.length);
    this.crowd = [-1.7, 3.1, 3.8, 4.7].map((dx, i) => person(L.finish + dx, 1.5 + r() * 0.3, SHIRTS[(first + i) % SHIRTS.length]));
    // The rest of them, out once a flip is landed: up to 36 more on open
    // ground either side of the finish, the tallest drawn first so no one's
    // hidden.
    const throng = [];
    for (let i = 0; i < 60 && throng.length < 36; i++) {
      const x = i % 3 ? L.finish - 0.8 - r() * 11 : L.finish + 2.6 + r() * 5.4;
      const p = person(x, 1.15 + r() * 0.7, SHIRTS[Math.floor(r() * SHIRTS.length)]);
      if (!L.features.some((f) => x > f.x0 - 1 && x < f.x1 + 1)) throng.push(p);
    }
    this.everyone = [...this.crowd, ...throng].sort((a, b) => b.h - a.h);
    // On every tenth course, a cow on a hill.
    this.cow = L.n % 10 ? null : cowOn(L);
    // Tyre tracks: the rear wheel's last 200 contact points, [x, y], with a
    // null where the line breaks.
    this.tracks = [];
    this.trackBike = null;
    // What the obstacle art needs to draw, refreshed each frame, and the
    // gradients, made once for a size and kept.
    this.view = { L };
    this.cache = {};
    this.horizonRef = null;
  }

  // ------------------------------------------------------------ the ride

  update(dt) {
    const B = this.B;
    // Physics in small steps for stability.
    const n = Math.ceil(dt / (1 / 120));
    // After a crash the wreck tumbles on until it has lain still a moment,
    // or for three seconds; the rider flies off on his own.
    const W = this.wreck;
    if (this.outcome?.kind === 'crash' && W && W.t < 3 && W.still < 0.3) {
      for (let k = 0; k < n; k++) step(this.level, B, this.input, dt / n);
      W.t += dt;
      W.still = Math.abs(B.vx) < 0.3 && Math.abs(B.vy) < 0.3 && Math.abs(B.omega) < 0.3 ? W.still + dt : 0;
    }
    if (this.thrown) this.fly(this.thrown, dt);
    if (!this.outcome && !this.waiting) {
      let res = null;
      const wasX = B.x;
      const wasFlag = B.flag;
      const wasAir = !grounded(B);
      const vyBefore = B.vy;
      for (let k = 0; k < n && !res; k++) {
        // The demo and the tests ride with the computer rider.
        if (this.pilot) Object.assign(this.input, this.pilot(this.level, B));
        res = step(this.level, B, this.input, dt / n);
      }
      if (this.input.gas) this.started = true;
      if (this.started) this.time += dt;
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
      // Landing after a flight: a thump, then dust and a jolt of the camera
      // as big as the landing was hard.
      if (wasAir && grounded(B) && vyBefore < -3) {
        const hard = Math.min(1, (-vyBefore - 3) / 7);
        this.hooks.sfx?.('bump');
        this.hooks.haptic?.(20);
        for (let i = 0; i < 6 + 20 * hard; i++) this.puff(B.x, B.y - COM - WHEEL, 1.2 + 2 * hard, 'dust');
        this.shake = Math.max(this.shake, 0.7 * hard);
      }
      if (B.trick && !res) this.celebrate(B.trick);
      if (this.cow) this.passCow(wasX);
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
          this.wreck = { t: 0, still: 0 };
          this.throwRider();
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
    for (const f of this.flares) {
      if (f.t < FLARE.rise && f.t + dt >= FLARE.rise) this.hooks.sfx?.('flare');
      f.t += dt;
    }
    this.flares = this.flares.filter((f) => f.t < FLARE.rise + FLARE.fall);
    if (this.cow) this.cow.look = Math.max(0, this.cow.look - dt);
    if (this.message && (this.message.t -= dt) <= 0) this.message = null;
    this.shake = Math.max(0, this.shake - dt * 2);
    // The rider's body follows the lean a beat behind, so a twitch of the
    // controls doesn't jerk it about.
    this.pose += ((B.lean ?? 0) - this.pose) * Math.min(1, dt * 9);
  }

  // The rider comes off from where his hips were (clear of the ground), at
  // most of the speed the bike's frame had there but flung up, not down,
  // tumbling on the way he was going from the line his body made on it.
  throwRider() {
    const B = this.B;
    const R = seated(clamp(this.pose, -1, 1));
    const [x, y] = this.onBike(R.hip[0], R.hip[1]);
    const vx = 0.7 * (B.vx - B.omega * (y - B.y));
    const vy = Math.max(0, B.vy + B.omega * (x - B.x)) + 2.5;
    const T = (this.thrown = { x, y, vx, vy, angle: B.angle + Math.PI / 2 - R.tilt, omega: B.omega * 0.8 - vx * 0.25, down: false, bounced: false, t: 0, k: 0 });
    T.y += Math.max(0, sunk(this.level, T));
  }

  // The thrown rider for dt: through the air, landing on whichever of his
  // hips, head or feet comes down first -- one soft bounce, then down for
  // good, sliding to a stop and settling flat along the ground (face down
  // or on his back, whichever is nearer). Three seconds at most.
  fly(T, dt) {
    const L = this.level;
    if ((T.t += dt) > 3) return;
    const wasX = T.x;
    T.vy -= G * dt;
    T.x += T.vx * dt;
    T.y += T.vy * dt;
    T.angle += T.omega * dt;
    if (T.down) {
      const slope = Math.atan(slopeAt(L, T.x));
      const flat = slope + Math.PI * Math.round((T.angle - slope) / Math.PI);
      T.angle += (flat - T.angle) * Math.min(1, dt * 6);
      T.vx = Math.sign(T.vx) * Math.max(0, Math.abs(T.vx) - 10 * dt);
      T.k = Math.min(1, T.k + dt * 2.5);
    }
    const into = sunk(L, T);
    if (into <= 0) return;
    if (into > 0.5 && T.x !== wasX) {
      Object.assign(T, { x: wasX, vx: T.vx * -0.3 }); // into the face of a ledge or a log: knocked back
      return;
    }
    T.y += into;
    const hit = T.vy;
    T.vy = Math.max(0, T.vy);
    if (T.down || hit >= 0) return;
    // Coming down: a burst of dust as big as the landing was hard.
    if (hit < -1) for (let i = 0; i < 8 + Math.min(16, -hit * 2); i++) this.puff(T.x, T.y - BODY, 1 + Math.min(2, -hit * 0.25), 'dust');
    const bounce = !T.bounced && hit < -2.5;
    Object.assign(T, bounce ? { bounced: true, vy: -hit * 0.3, vx: T.vx * 0.5, omega: T.omega * 0.4 } : { down: true, omega: 0 });
  }

  puff(x, y, size, kind) {
    if (this.dust.length > 120) return;
    const a = Math.random() * Math.PI;
    const v = (0.5 + Math.random()) * size;
    this.dust.push({ x, y, vx: Math.cos(a) * v * (kind === 'smoke' ? -0.6 : 1), vy: Math.abs(Math.sin(a)) * v, t: 0, life: 0.5 + Math.random() * 0.5, r: 0.08 + Math.random() * 0.12 * size, kind });
  }

  // A message for secs seconds; `big` swells it for a beat, `sub` is a
  // second line under it.
  say(text, secs, { big = false, sub = null } = {}) {
    this.message = { text, t: secs, secs, big, sub };
  }

  // A flip landed: seconds off the clock, a fanfare, the banner big for a
  // beat, a flare over the finish for every turn, and the whole crowd out
  // there for the rest of the ride.
  celebrate({ flips, back }) {
    this.B.trick = null;
    this.flips += flips;
    this.bonus += FLIP_BONUS * flips;
    this.roaring = true;
    this.hooks.sfx?.('flip');
    this.hooks.haptic?.([20, 30, 20]);
    const sub = MULTIPLE[Math.min(flips, MULTIPLE.length - 1)];
    this.say(`${flips > 1 ? `${flips}× ` : ''}${back ? 'BACKFLIP' : 'FRONTFLIP'} · −${(FLIP_BONUS * flips).toFixed(0)} s`, 2, { big: true, sub });
    for (let i = 0; i < Math.min(flips, MULTIPLE.length - 1); i++) this.flares.push(flare(i));
  }

  // Flying over the cow, clear of her back (not riding past her, nor
  // scraping over): she looks up and moos, and the game hears of it.
  passCow(wasX) {
    const { B, cow } = this;
    if (grounded(B) || (wasX < cow.x) === (B.x < cow.x)) return;
    const low = Math.min(this.onBike(-BASE / 2, -COM)[1], this.onBike(BASE / 2, -COM)[1]) - WHEEL;
    if (low < heightAt(this.level, cow.x) + COW.back) return;
    cow.look = COW.look;
    this.hooks.sfx?.('moo');
    this.hooks.onCow?.();
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

  // The camera pulls back as the bike speeds up and slides the bike back
  // across the screen to look further ahead the way it's going. It keeps
  // the ground ahead low on the screen and eases up and down after it, so
  // a jump lifts the bike in the frame; only near the top or bottom does
  // the camera follow the bike itself, and never lets it out of sight.
  camera() {
    const { cssW: W, cssH: H, B } = this;
    const f = FRAMING[W > H ? 'wide' : 'tall'];
    const pace = clamp(B.vx / VMAX, -1, 1);
    const c = (this.cam ??= { span: f.near, look: 0.4, bottom: null });
    c.span += (f.near + (f.far - f.near) * Math.abs(pace) - c.span) * 0.03;
    c.look += (0.4 - 0.14 * pace - c.look) * 0.04;
    const scale = W / c.span;
    const tall = H / scale;
    const ahead = Math.max(...[0, 2, 4].map((dx) => heightAt(this.level, B.x + dx)));
    const want = clamp(ahead - tall * f.ground, B.y - tall * 0.72, B.y - tall * 0.15);
    c.bottom = clamp(c.bottom === null ? want : c.bottom + (want - c.bottom) * 0.06, B.y - tall * 0.88, B.y - tall * 0.08);
    return { scale, left: B.x - c.span * c.look, bottom: c.bottom };
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
    const shake = this.shake * 10;
    ctx.setTransform(dpr, 0, 0, dpr, (Math.random() - 0.5) * shake * dpr, (Math.random() - 0.5) * shake * dpr);

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

    // Any flares, behind the land they rise from.
    this.drawFlares(W, H, sx, sy);
    const v = Object.assign(this.view, { sx, sy, m, H, surface: Math.max(3, this.scene.surface * m) });
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

    // The dirt, darkening with depth, then what shows inside it: rock
    // faces, plank ramps, pits.
    ctx.beginPath();
    ctx.moveTo(sx(x0), H + 20);
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
    ctx.lineTo(sx(x1), H + 20);
    ctx.closePath();
    ctx.fillStyle = this.cached('dirt', H, () => {
      const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, P.dirt);
      g.addColorStop(1, P.deep);
      return g;
    });
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
    // the birds, any cow, the crowd, the flags, then the bike in its dust
    // and wind.
    for (const t of this.tufts) if (t.x >= x0 && t.x <= x1) t.paint(ctx, t, sx(t.x), sy(heightAt(L, t.x)), m, P);
    for (const d of this.art) if (d.over && d.b > x0 - 1 && d.a < x1 + 1) d.over(ctx, d, v, P);
    ctx.lineCap = 'butt';
    this.drawTracks(sx, sy, m, x0, x1);
    this.drawBirds(sx, sy, m, W, now);
    this.drawCow(sx, sy, m, x0, x1, now);
    this.drawCrowd(sx, sy, m, x0, x1, now);
    this.drawFlags(cam, sx, sy, x0, x1);
    this.drawWind(W, H, cam);
    this.drawLamp(sx, sy, m, false);
    this.drawDust(sx, sy, m);
    this.drawBike(sx, sy, m);
    this.drawLamp(sx, sy, m, true);

    // Held still over the picture: the darkened edges, the instruments and
    // any message.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.cached('vignette', W * 4096 + H, () => {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.45)');
      return g;
    });
    ctx.fillRect(0, 0, W, H);
    this.drawHud(W);
    if (this.message) this.drawMessage(W, H);
  }

  // The sky: its gradient, the stars and the moon after dark, the sun by day
  // (a low one sets behind the backdrop, drawn after), and thin streaks of
  // high cloud.
  drawSky(W, H, cam, now) {
    const { ctx, sky, P } = this;
    ctx.fillStyle = this.cached('sky', H, () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, sky.top);
      g.addColorStop(0.7, sky.horizon);
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
      const rr = Math.max(8, 0.035 * Math.min(W, H));
      ctx.globalAlpha = sky.night;
      ctx.fillStyle = this.cached('moon', size, () => glow(ctx, x, y, rr * 6, '#dfe8ff', 0.3));
      ctx.fillRect(x - rr * 6, y - rr * 6, rr * 12, rr * 12);
      fillWith(ctx, '#e6e2d2', () => blob(ctx, x, y, rr));
      fillWith(ctx, 'rgba(160,154,136,.55)', () => {
        blob(ctx, x - rr * 0.3, y - rr * 0.2, rr * 0.22);
        blob(ctx, x + rr * 0.35, y + rr * 0.1, rr * 0.15);
        blob(ctx, x - rr * 0.05, y + rr * 0.45, rr * 0.12);
      });
    }
    if (sky.night < 0.95) {
      const x = sky.pos[0] * W;
      const y = sky.pos[1] * H;
      const rr = Math.max(8, 0.035 * Math.min(W, H));
      ctx.globalAlpha = 1 - sky.night;
      ctx.fillStyle = this.cached('sun', size, () => glow(ctx, x, y, rr * 10, sky.sun, 0.5));
      ctx.fillRect(x - rr * 10, y - rr * 10, rr * 20, rr * 20);
      fillWith(ctx, sky.sun, () => blob(ctx, x, y, rr));
    }
    ctx.globalAlpha = 1;
    fillWith(ctx, P.cloud, () => {
      for (const c of this.clouds) {
        const x = (((c.x - cam.left * 0.1) % 400) + 400) % 400 / 400 * (W + 240) - 120;
        const y = c.y * H;
        ctx.moveTo(x + c.w, y);
        ctx.ellipse(x, y, c.w, c.w * 0.06, 0, 0, TAU);
        ctx.moveTo(x + c.w * 0.95, y - c.w * 0.07);
        ctx.ellipse(x + c.w * 0.4, y - c.w * 0.07, c.w * 0.55, c.w * 0.04, 0, 0, TAU);
      }
    });
  }

  // The backdrop, far to near: each layer's things slide by at its own
  // fraction of the camera's pace, rise and fall a little with it, and stand
  // on a floor of their own colour that runs down under the ground. A haze
  // of the horizon's colour, thickening toward it, falls in front of all
  // but the nearest layers.
  drawBackdrop(W, H, cam) {
    const { ctx } = this;
    const z = clamp(H / 360, 0.8, 1.6);
    if (this.horizonRef === null) this.horizonRef = cam.bottom;
    const lift = (cam.bottom - this.horizonRef) * PARALLAX * 0.5;
    this.layers.forEach((layer, i) => {
      if (i === this.hazeAt) {
        ctx.fillStyle = this.cached('haze', H, () => {
          const g = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.72);
          g.addColorStop(0, fade(this.sky.horizon, 0));
          g.addColorStop(1, fade(this.sky.horizon, 0.5));
          return g;
        });
        ctx.fillRect(-20, -20, W + 40, H + 40);
      }
      const off = cam.left * PARALLAX * layer.drift;
      const base = H * layer.base + clamp(lift * layer.drift, -40, 40);
      for (let j = 0; j < layer.items.length; j++) layer.sx[j] = wrap(layer.items[j].x - off);
      layer.paint(ctx, layer, base, W, z);
      ctx.fillStyle = layer.floor;
      ctx.fillRect(-20, base - 0.5, W + 40, H - base + 60);
    });
  }

  drawFlags(cam, sx, sy, x0, x1) {
    const { ctx } = this;
    const m = cam.scale;
    // A pole standing h metres on the ground at x, with a pennant if it has
    // a colour.
    const pole = (x, h, colour) => {
      const X = sx(x);
      const top = sy(heightAt(this.level, x) + h);
      strokeWith(ctx, '#2a2a2e', 2, () => {
        ctx.moveTo(X, top + h * m);
        ctx.lineTo(X, top);
      });
      if (colour) fillWith(ctx, colour, () => trace(ctx, [0, 0, 0.7, -0.25, 0, -0.5], X, top, m, m));
    };
    this.level.flags.forEach((x, i) => {
      if (x > x0 - 1 && x < x1 + 1) pole(x, 2.2, i <= this.B.flag ? HUD.green : HUD.amber);
    });
    // The finish: a chequered banner between two poles.
    const fx = this.level.finish;
    if (fx > x0 - 1 && fx < x1 + 3) {
      pole(fx, 3);
      pole(fx + 2, 3);
      const y = sy(heightAt(this.level, fx)) - 3 * m;
      const cell = 0.25 * m;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#111' : '#e8e8e8';
          ctx.fillRect(sx(fx) + i * cell, y + j * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
    // The start line.
    const start = this.level.start - 1;
    if (start > x0 - 1) {
      strokeWith(ctx, 'rgba(255,255,255,.6)', 3, () => {
        ctx.moveTo(sx(start), sy(heightAt(this.level, start)) + 2);
        ctx.lineTo(sx(start), sy(heightAt(this.level, start)) - 1.2 * m);
      });
    }
  }

  // Tyre tracks: a point every 0.3 m the rear wheel rolls on the ground,
  // with the line broken where it leaves the ground or the bike starts
  // afresh (a restart or a flag), drawn as a faint dashed rut.
  drawTracks(sx, sy, m, x0, x1) {
    const { ctx, B, tracks: T } = this;
    const c = B.rear;
    if (B !== this.trackBike || !c) {
      if (T.at(-1)) T.push(null);
      this.trackBike = B;
    }
    const last = T.at(-1);
    if (c && (!last || Math.hypot(c.px - last[0], c.py - last[1]) >= 0.3)) T.push([c.px, c.py]);
    if (T.length > 200) T.shift();
    ctx.setLineDash(DASH);
    strokeWith(ctx, this.P.track, Math.max(1.5, 0.05 * m), () => {
      let pen = false;
      for (const p of T) {
        const on = p && p[0] > x0 - 1 && p[0] < x1 + 1;
        if (on && pen) ctx.lineTo(sx(p[0]), sy(p[1]) + 1.5);
        else if (on) ctx.moveTo(sx(p[0]), sy(p[1]) + 1.5);
        pen = on;
      }
    });
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
  // them (or home), then up and waving -- or, once a flip's been landed,
  // all forty of them out, arms up and jumping, each to their own beat.
  drawCrowd(sx, sy, m, x0, x1, now) {
    const { ctx, B, P } = this;
    ctx.lineCap = 'round';
    for (const p of this.roaring ? this.everyone : this.crowd) {
      if (p.x < x0 - 1 || p.x > x1 + 1) continue;
      const X = sx(p.x);
      const hop = this.roaring ? Math.max(0, Math.sin(now * 0.011 + p.ph)) * 0.25 * m : 0;
      const Y = sy(heightAt(this.level, p.x)) - hop;
      const h = p.h * m;
      const cheer = this.roaring || B.finished || Math.abs(B.x - p.x) < 6;
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

  // The cow on her hill, grazing and flicking her tail, and for a moment
  // after the bike has flown over her, looking up.
  drawCow(sx, sy, m, x0, x1, now) {
    const { ctx, cow } = this;
    if (!cow || cow.x < x0 - 2 || cow.x > x1 + 2) return;
    ctx.save();
    ctx.translate(sx(cow.x), sy(heightAt(this.level, cow.x)));
    ctx.scale(m, -m);
    paintCow(ctx, now / 1000, clamp(Math.min(cow.look, COW.look - cow.look) / 0.25, 0, 1));
    ctx.restore();
  }

  // The flares for a flip: each rises from behind the finish line (or, with
  // the finish still out of sight ahead, from behind the land toward it),
  // flashes and bursts into sparks that spread, fall and fade.
  drawFlares(W, H, sx, sy) {
    if (!this.flares.length) return;
    const { ctx } = this;
    const S = Math.min(W, H);
    const fx = this.level.finish + 1;
    const x0 = clamp(sx(fx), W * 0.25, W * 0.9);
    const y0 = clamp(sy(heightAt(this.level, fx)), H * 0.5, H * 0.85);
    const spread = (u) => (1 - Math.exp(-3 * u)) / 3; // sparks slow as they go
    ctx.lineCap = 'round';
    for (const f of this.flares) {
      if (f.t < 0) continue;
      const x = x0 + f.dx * W;
      const top = H * f.apex;
      if (f.t < FLARE.rise) {
        const at = (t) => y0 + (top - y0) * (1 - (1 - Math.max(0, t) / FLARE.rise) ** 2);
        strokeWith(ctx, fade(HUD.amber, 0.8), 3, () => {
          ctx.moveTo(x, at(f.t - 0.15));
          ctx.lineTo(x, at(f.t));
        });
        fillWith(ctx, '#fff6dc', () => blob(ctx, x, at(f.t), 4));
        continue;
      }
      const u = f.t - FLARE.rise;
      if (u < 0.2) fillWith(ctx, fade('#fff6dc', 0.8 * (1 - u / 0.2)), () => blob(ctx, x, top, S * 0.07 * (0.4 + u / 0.2)));
      ctx.globalAlpha = Math.max(0, 1 - u / FLARE.fall);
      const at = (s, t) => [x + Math.cos(s.a) * s.v * S * spread(t), top - Math.sin(s.a) * s.v * S * spread(t) + 0.12 * S * t * t];
      for (const s of f.sparks) {
        strokeWith(ctx, s.c, 3, () => {
          ctx.moveTo(...at(s, Math.max(0, u - 0.12)));
          ctx.lineTo(...at(s, u));
        });
      }
      // White-hot heads while they're fresh.
      if (u < 0.6) fillWith(ctx, '#fff6dc', () => f.sparks.forEach((s) => blob(ctx, ...at(s, u), 1.6)));
      ctx.globalAlpha = 1;
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

  // The wind of speed: from about half of flat out, faint streaks
  // through the air, sliding by faster than the ground and longer the faster
  // the bike goes.
  drawWind(W, H, cam) {
    const k = clamp((Math.abs(this.B.vx) / VMAX - 0.5) / 0.4, 0, 1);
    if (!k) return;
    strokeWith(this.ctx, `rgba(255,255,255,${0.2 * k})`, 1, () => {
      for (const s of this.streaks) {
        const x = (((s.x * 2 * W - cam.left * cam.scale * 1.8) % (2 * W)) + 2 * W) % (2 * W) - W / 2;
        this.ctx.moveTo(x, s.y * H);
        this.ctx.lineTo(x + s.len * k * W * 0.12, s.y * H);
      }
    });
  }

  // Dust and exhaust, each puff thinning as it spreads, and drawn out into a
  // streak along the bike's way when it's going fast.
  drawDust(sx, sy, m) {
    const { ctx } = this;
    const smear = this.B.vx * 0.04;
    ctx.lineCap = 'round';
    for (const p of this.dust) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k * (p.kind === 'smoke' ? 0.35 : 0.6);
      strokeWith(ctx, p.kind === 'smoke' ? '#8a9494' : this.P.dust, 2 * (p.r + (1 - k) * 0.15) * m, () => {
        ctx.moveTo(sx(p.x), sy(p.y));
        ctx.lineTo(sx(p.x + smear), sy(p.y));
      });
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  // The bike, and the rider when he's been thrown off it, in front of the
  // wreck: each in its own frame, at its place and angle.
  drawBike(sx, sy, scale) {
    const { ctx, B, thrown: T } = this;
    const framed = (it, paint) => {
      ctx.save();
      ctx.translate(sx(it.x), sy(it.y));
      ctx.rotate(-it.angle);
      ctx.scale(scale, -scale);
      paint();
      ctx.restore();
    };
    framed(B, () => paintBike(ctx, B, this.pose, { rider: !T }));
    if (T) framed(T, () => paintRider(ctx, T.k, true));
  }

  // The instrument band along the top: the speed (in km/h, to go with the
  // engine's metres), the clock against par, any crashes, and in the rest of
  // the band the course's profile as a thin line, with its flags, the
  // finish and the bike on it. Values are padded so nothing shuffles about.
  drawHud(W) {
    const { ctx, B, level: L } = this;
    ctx.fillStyle = HUD.band;
    ctx.fillRect(0, 0, W, HUD.h);
    ctx.fillStyle = HUD.rule;
    ctx.fillRect(0, HUD.h, W, 1);
    ctx.font = `600 ${W > 600 ? 12 : 11}px ${HUD.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const y = HUD.h / 2 + 1;
    let x = reading(ctx, 12, y, 'KM/H', String(Math.round(Math.abs(B.vx) * 3.6)).padStart(2));
    x = reading(ctx, x, y, 'TIME', this.time.toFixed(1).padStart(5), this.time > L.par ? HUD.amber : HUD.ink);
    x = reading(ctx, x, y, 'PAR', String(L.par).padStart(3));
    if (this.crashes) x = reading(ctx, x, y, 'CRASH', String(this.crashes), HUD.red);
    const left = x + 4;
    const k = (W - 14 - left) / L.length;
    if (k <= 0) return;
    const span = Math.max(1, L.maxY - L.minY);
    const at = (h) => HUD.h - 6 - ((h - L.minY) / span) * (HUD.h - 12);
    strokeWith(ctx, HUD.dim, 1, () => {
      for (let i = 0; i < L.heights.length; i += 4) ctx.lineTo(left + i * STEP * k, at(L.heights[i]));
    });
    const tick = (fx, colour) => {
      ctx.fillStyle = colour;
      ctx.fillRect(Math.round(left + fx * k) - 1, 5, 2, HUD.h - 10);
    };
    L.flags.forEach((fx, i) => tick(fx, i <= B.flag ? HUD.green : HUD.amber));
    tick(L.finish, HUD.ink);
    fillWith(ctx, FRAME, () => blob(ctx, left + clamp(B.x, 0, L.length) * k, at(heightAt(L, B.x)), 3.5));
  }

  // A message -- a checkpoint, a crash, a flip -- in the instruments' style:
  // amber capitals on a dark slip below the band, with any second line in
  // white under them. A big one starts at 1.6× for half a second and
  // settles back to size.
  drawMessage(W, H) {
    const { ctx, message: M } = this;
    ctx.font = `700 ${W > 600 ? 14 : 12}px ${HUD.font}`;
    ctx.textAlign = 'center';
    const w = Math.max(...[M.text, M.sub ?? ''].map((s) => ctx.measureText(s).width)) + 32;
    const h = M.sub ? 50 : 30;
    const k = M.big ? ease(clamp((M.secs - M.t - 0.5) / 0.3, 0, 1)) : 1;
    ctx.save();
    ctx.translate(W / 2, Math.max(HUD.h + 34, H * 0.24));
    ctx.scale(1.6 - 0.6 * k, 1.6 - 0.6 * k);
    ctx.fillStyle = HUD.band;
    ctx.fillRect(-w / 2, -15, w, h);
    ctx.fillStyle = HUD.amber;
    ctx.fillRect(-w / 2, -15, 2, h);
    ctx.fillText(M.text, 0, 1);
    ctx.fillStyle = HUD.ink;
    if (M.sub) ctx.fillText(M.sub, 0, 22);
    ctx.restore();
  }
}

// One instrument reading at (x, y): a dim label and then its value, left
// to right; gives back where the next one starts.
const reading = (ctx, x, y, label, value, colour = HUD.ink) => {
  ctx.fillStyle = HUD.dim;
  ctx.fillText(label, x, y);
  x += ctx.measureText(label).width + 6;
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
  return x + ctx.measureText(value).width + 16;
};

// The i-th flare for a flip: a little after the one before and to one side
// of it, bursting at its own height (a share of the screen's, from the top)
// into sparks of the bike's red and amber.
const flare = (i) => ({
  t: -0.45 * i,
  dx: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.07,
  apex: 0.2 + 0.08 * Math.random(),
  sparks: Array.from({ length: FLARE.sparks }, (_, k) => ({ a: (k / FLARE.sparks) * TAU + Math.random() * 0.3, v: 0.4 + 0.25 * Math.random(), c: k % 2 ? FRAME : HUD.amber })),
});

// Where the cow stands: on the crest of the first hill past the first flag
// (or of the first hill, if none is), or nowhere if the course has none.
const cowOn = (L) => {
  const hills = L.features.filter((f) => f.kind === 'hill');
  const hill = hills.find((f) => f.x0 > (L.flags[0] ?? Infinity)) ?? hills[0];
  if (!hill) return null;
  let x = hill.x0;
  for (let at = hill.x0; at <= hill.x1; at += STEP) if (heightAt(L, at) > heightAt(L, x)) x = at;
  return { x, look: 0 };
};

// ------------------------------------------------------------- scenery art

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (k) => k * k * (3 - 2 * k); // 0 to 1, gently at both ends

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
  const outline = () => {
    for (let i = 0; i < 7; i++) ctx.lineTo(x + Math.cos((i / 7) * TAU) * rr * it.k[i] * 1.2, y + 0.25 * rr - Math.sin((i / 7) * TAU) * rr * it.k[i]);
    ctx.closePath();
  };
  fillWith(ctx, P.rock, outline);
  strokeWith(ctx, P.rockDark, 1.5, outline);
  if (snow) fillWith(ctx, P.top, () => ctx.ellipse(x, y - 0.6 * rr, rr * 0.8, rr * 0.28, 0, 0, TAU));
};

// What's scattered on top of the ground, drawn at the screen point (x, y)
// where the ground is.
const TUFTS = {
  stone(ctx, t, x, y, m, P) {
    fillWith(ctx, P.stone, () => ctx.ellipse(x, y + 0.04 * m, 0.09 * t.s * m, 0.06 * t.s * m, 0, 0, TAU));
  },
  tuft(ctx, t, x, y, m, P) {
    strokeWith(ctx, P.tuft, 1.5, () => {
      for (let d = -1; d <= 1; d++) {
        ctx.moveTo(x + 0.06 * d * m, y);
        ctx.lineTo(x + 0.11 * d * m, y - 0.18 * t.s * m);
      }
      ctx.moveTo(x + 0.02 * m, y);
      ctx.lineTo(x + 0.08 * m, y - 0.26 * t.s * m);
    });
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
  const outline = () => {
    for (let k = 0; k < d.shape.length; k += 2) ctx.lineTo(sx(d.shape[k]), sy(d.shape[k + 1]));
    ctx.closePath();
  };
  fillWith(ctx, P.rock, outline);
  strokeWith(ctx, P.rockDark, Math.max(1.5, 0.03 * m), outline);
  ctx.clip();
  strokeWith(ctx, P.rockDark, Math.max(1, 0.018 * m), () => {
    for (const y of d.strata) {
      ctx.moveTo(sx(d.a - 0.2), sy(y));
      ctx.lineTo(sx(d.b + 0.2), sy(y));
    }
    for (const c of d.cracks) {
      ctx.moveTo(sx(c), sy(d.top + 0.1));
      ctx.lineTo(sx(c + 0.06), sy(d.top - 0.2));
      ctx.lineTo(sx(c - 0.02), sy(d.top - 0.45));
    }
  });
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
      fillWith(ctx, P.wood, () => {
        for (let i = d.ia; i <= d.lip; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
        ctx.lineTo(sx(d.lip * STEP), sy(floor(d.lip)));
      });
      ctx.clip();
      strokeWith(ctx, P.woodLight, Math.max(1, 0.02 * m), () => {
        for (let k = 1; k < 13; k++) {
          ctx.moveTo(sx(d.ia * STEP), sy(hs[d.ia] - k * 0.14));
          for (let i = d.ia + 1; i <= d.lip; i++) ctx.lineTo(sx(i * STEP), sy(hs[i] - k * 0.14));
        }
      });
      strokeWith(ctx, P.woodDark, Math.max(1.5, 0.04 * m), () => {
        for (let i = d.ia + 5; i < d.lip - 1; i += 6) {
          ctx.moveTo(sx(i * STEP), sy(hs[i]));
          ctx.lineTo(sx(i * STEP), sy(floor(i)));
        }
      });
      ctx.restore();
      strokeWith(ctx, P.woodDark, Math.max(2, 0.07 * m), () => {
        ctx.moveTo(sx(d.lip * STEP - 0.035), sy(hs[d.lip]));
        ctx.lineTo(sx(d.lip * STEP - 0.035), sy(floor(d.lip)));
      });
    },
    over(ctx, d, v, P) {
      const { sx, sy } = v;
      const hs = v.L.heights;
      const deck = () => {
        for (let i = d.ia; i <= d.lip; i++) ctx.lineTo(sx(i * STEP), sy(hs[i]));
      };
      strokeWith(ctx, P.wood, v.surface, deck);
      strokeWith(ctx, P.woodLight, 1.5, deck);
      ctx.lineCap = 'butt';
      strokeWith(ctx, P.woodDark, v.surface * 0.8, () => {
        ctx.moveTo(sx((d.lip - 1) * STEP), sy(hs[d.lip - 1]));
        ctx.lineTo(sx(d.lip * STEP), sy(hs[d.lip]));
      });
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
      ctx.lineCap = 'round';
      strokeWith(ctx, P.root, Math.max(1, 0.025 * m), () => {
        for (const t of d.roots) {
          ctx.moveTo(sx(t.x), sy(t.y));
          ctx.quadraticCurveTo(sx(t.x + t.dir * t.len * 0.35), sy(t.y - t.len * 0.15), sx(t.x + t.dir * t.len * (0.25 + t.bend * 0.3)), sy(t.y - t.len));
        }
      });
      fillWith(ctx, P.deep, () => {
        for (const t of d.drips) trace(ctx, [-0.03, 0.03, t.len * 0.5, 0, 0.04, -t.len], sx(t.x), sy(t.y), t.dir * v.m, v.m);
      });
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
      fillWith(ctx, P.logEnd, () => blob(ctx, x, y, rr));
      strokeWith(ctx, P.ring, 1.2, () => {
        for (const k of [0.25, 0.48, 0.7]) blob(ctx, x, y, rr * k);
        for (const a of [0.5, 2.6, 4.4]) {
          ctx.moveTo(x + Math.cos(a) * rr * 0.12, y + Math.sin(a) * rr * 0.12);
          ctx.lineTo(x + Math.cos(a) * rr * 0.62, y + Math.sin(a) * rr * 0.62);
        }
      });
      const bark = Math.min(rr * 0.4, Math.max(2, 0.07 * v.m));
      strokeWith(ctx, P.woodDark, bark, () => blob(ctx, x, y, rr - bark / 2));
    },
  },
};
// A cliff is a drop-off on a grander scale, with the same rock face.
FEATURE_ART.cliff = FEATURE_ART.drop;

// The bike and its rider, drawn in the frame's own coordinates: metres from
// the centre of mass, x forward, y up (the caller has set the transform).
// The rider stands on the pegs and leans by `pose` (1 = back, -1 =
// forward), or is left off when he's been thrown (and is drawn on his own
// by paintRider). Shared with the card picture on the hub.
const INK = '#1d1b22';
const RED_DARK = '#9d1b25';
const RED_LIGHT = '#ff8f98';
const JERSEY = ['#2a9d8f', '#1b6b61']; // near side, far side
const PANTS = ['#264653', '#16303a'];
const METAL = '#a7adb5';
const PEG = [-0.06, -0.36]; // the near footpeg
const BARS = [0.3, 0.47]; // the near grip
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

// Drawing on one context in the frame's metres: a path through points, a
// stroke of it (a dashed one -- knobs, teeth, coils -- has square ends so
// the dashes stay apart), a line, a filled outline and a disc.
const pen = (ctx) => {
  const trace = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  const stroke = (width, colour, dash = []) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.setLineDash(dash);
    ctx.lineCap = dash.length ? 'butt' : 'round';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  };
  const finish = (fill, edge, width) => {
    ctx.fillStyle = fill;
    ctx.fill();
    if (edge) stroke(width, edge);
  };
  const line = (pts, width, colour, dash) => {
    trace(pts);
    stroke(width, colour, dash);
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
  return { stroke, line, shape, disc };
};

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

// Where the rider's parts go on the bike: hips slide along the seat, the
// torso pitches, the head stays level to look ahead; feet on the pegs and
// hands on the grips. (Hips a little behind the pegs and the torso not too
// far over, so the arms reach forward and down to the bars rather than
// straight down.)
const seated = (p) => {
  const ankle = [PEG[0] - 0.03, PEG[1] + 0.07];
  const hip = [byPose(p, -0.26, -0.3, -0.44), byPose(p, 0.45, 0.52, 0.3)];
  const tilt = byPose(p, 0.62, 0.42, 0.2); // torso from upright, radians
  const shoulder = [hip[0] + 0.5 * Math.sin(tilt), hip[1] + 0.5 * Math.cos(tilt)];
  const nod = tilt * 0.4;
  const head = [shoulder[0] + 0.25 * Math.sin(nod), shoulder[1] + 0.25 * Math.cos(nod)];
  const neck = [head[0] - 0.02, head[1] - 0.07];
  return { hip, tilt, shoulder, head, neck, turn: -nod * 0.5, toe: 0, foot: ankle, farFoot: [ankle[0] + 0.05, ankle[1]], hand: BARS, farHand: [BARS[0] + 0.05, BARS[1] + 0.01] };
};

// And thrown off: hips at the origin, the torso out along x with the chest
// toward -y, the legs trailing one way and the arms flung the other -- in
// the air at k = 0, stretched out lying at k = 1. The helmet and boots turn
// with the body.
const sprawled = (k) => ({
  hip: [0, 0], tilt: Math.PI / 2, shoulder: [0.5, 0], head: [0.75, -0.04], neck: [0.68, -0.02], turn: -Math.PI / 2, toe: -Math.PI / 2,
  foot: mix([-0.7, -0.32], [-0.78, -0.12], k), farFoot: mix([-0.8, 0.16], [-0.86, 0.02], k),
  hand: mix([0.84, -0.44], [0.12, -0.12], k), farHand: mix([0.92, 0.36], [1.06, 0.03], k),
});

// The rider drawn from one of those, in three layers so the bike can go
// between them: the far leg and arm (behind the bike, in shadow), the near
// leg (the footpeg goes over its boot), then the body, the near arm and the
// helmet on top.
const riderLayers = (ctx, R) => {
  const { line, shape, disc } = pen(ctx);
  const leg = (h, a, colour, boot) => {
    const [knee, foot] = reach(h, a, 0.44, 0.44);
    line([h, knee], 0.16, colour[0]);
    line([knee, foot], 0.125, colour[0]);
    line([mix(knee, foot, 0.4), foot], 0.13, boot);
    disc(knee[0] + 0.02, knee[1], 0.065, colour[1]); // knee guard
    // The boot, toe forward and sole down on the pegs, turned by R.toe.
    const c = Math.cos(R.toe);
    const s = Math.sin(R.toe);
    const at = (dx, dy) => [foot[0] + dx * c - dy * s, foot[1] + dx * s + dy * c];
    shape([at(-0.08, 0.03), at(0.045, 0.035), at(0.15, -0.07), at(-0.09, -0.09)], boot, INK, 0.012);
    line([at(-0.09, -0.09), at(0.15, -0.08)], 0.028, INK); // sole
  };
  const arm = (s, g, colour) => {
    const [elbow, hand] = reach(s, g, 0.36, 0.34, 0.4);
    line([s, elbow], 0.105, colour);
    line([elbow, hand], 0.088, colour);
    disc(hand[0], hand[1], 0.047, INK); // glove
  };
  const { hip, shoulder, head } = R;
  const far = () => {
    leg([hip[0] + 0.04, hip[1]], R.farFoot, PANTS.slice().reverse(), '#b9bec4');
    arm([shoulder[0] + 0.04, shoulder[1]], R.farHand, JERSEY[1]);
  };
  const body = () => {
    const t = [Math.sin(R.tilt), Math.cos(R.tilt)];
    const f = [Math.cos(R.tilt), -Math.sin(R.tilt)]; // across the body, to the chest
    const at = (o, a, b) => [o[0] + t[0] * a + f[0] * b, o[1] + t[1] * a + f[1] * b];
    const torso = [[-0.02, -0.105], [0.17, -0.13], [0.36, -0.125], [0.48, -0.08], [0.55, 0], [0.52, 0.08], [0.39, 0.125], [0.19, 0.095], [0.03, 0.09]];
    shape(torso.map(([a, b]) => at(hip, a, b)), JERSEY[0], '#164f48', 0.014);
    shape([at(hip, -0.045, -0.105), at(hip, 0.025, 0.09), at(hip, 0.095, 0.09), at(hip, 0.085, -0.125)], PANTS[0], null);
    line([at(hip, 0.275, -0.125), at(hip, 0.31, 0.105)], 0.04, '#f4f1e8'); // jersey stripe
    line([at(shoulder, 0, 0.02), R.neck], 0.07, '#e0b07a'); // neck
    arm(shoulder, R.hand, JERSEY[0]);
    // Helmet: shell with a stripe, peak, goggles and strap, and a chin bar.
    ctx.save();
    ctx.translate(head[0], head[1]);
    ctx.rotate(R.turn);
    ctx.scale(0.95, 0.95);
    disc(0, 0, 0.15, '#f8f9fa', INK, 0.014);
    line([[0, 0.115], [-0.07, 0.093], [-0.11, 0.035], [-0.115, -0.01]], 0.035, FRAME);
    shape([[0.02, 0.13], [0.24, 0.1], [0.22, 0.065], [0.06, 0.07]], FRAME, RED_DARK); // peak
    shape([[0.1, -0.06], [0.2, -0.07], [0.2, -0.13], [0.07, -0.15]], '#d9dde2', INK); // chin bar
    line([[-0.15, 0.03], [0.06, 0.02]], 0.035, '#f4b400'); // goggle strap
    shape([[0.06, 0.055], [0.165, 0.045], [0.16, -0.035], [0.06, -0.025]], '#273c55', INK); // goggle lens
    line([[0.085, 0.03], [0.13, 0.025]], 0.012, 'rgba(255,255,255,0.7)');
    ctx.restore();
  };
  return [far, () => leg(hip, R.foot, PANTS, '#eef0f2'), body];
};

// The rider on his own: riding by `pose`, or limp, thrown clear of a crash
// (drawn round his hips, `pose` then from 0 in the air to 1 lying down).
function paintRider(ctx, pose, limp = false) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const layer of riderLayers(ctx, limp ? sprawled(clamp(pose, 0, 1)) : seated(clamp(pose, -1, 1)))) layer();
}

export function paintBike(ctx, B, pose = B.lean ?? 0, { rider = true } = {}) {
  const p = Math.max(-1, Math.min(1, pose));
  const spin = B.spin ?? 0;
  const rx = -BASE / 2;
  const fx = BASE / 2;
  const ay = -COM; // axle height
  const { stroke, line, shape, disc } = pen(ctx);
  // A ring of tyre knobs or sprocket teeth, turning with the wheel.
  const teeth = (x, y, r, width, colour, count, turn) => {
    const gap = (Math.PI * 2 * r) / count;
    ctx.beginPath();
    ctx.arc(x, y, r, turn, turn + Math.PI * 2);
    stroke(width, colour, [gap * 0.55, gap * 0.45]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The rider's far leg and arm, behind the bike and in shadow.
  const [far, nearLeg, body] = rider ? riderLayers(ctx, seated(p)) : [];
  far?.();

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
  line([[0.31, 0.22], [0.35, 0.36], [BARS[0] - 0.02, BARS[1] - 0.02]], 0.042, '#2b2b30');
  line([[BARS[0] + 0.005, BARS[1]], [BARS[0] + 0.1, BARS[1] - 0.07]], 0.016, '#8d949c'); // brake lever

  // The rider's near leg, the footpeg over its boot, then the rest of him.
  nearLeg?.();
  line([PEG, [PEG[0] + 0.08, PEG[1]]], 0.035, METAL); // footpeg
  body?.();
}

// The cow on the hill of every tenth course, drawn like the bike in its own
// frame's metres: her feet on the ground at the origin, y up, side on and
// facing -x (the way the bike comes from), a black-and-white Friesian about
// 1.4 m long and 1.2 m tall. `t` (s) keeps her chewing and now and then
// flicks her tail; `up`, from 0 to 1, lifts her head from the grass to
// look. Shared with the card picture on the hub.
const HIDE = ['#f6f3ec', '#c9c4b8']; // near side, far side
const MUZZLE = '#e9a6a0';
const COW_BODY = [[-0.55, 0.98], [-0.45, 1.08], [-0.12, 1.05], [0.25, 1.07], [0.55, 1.1], [0.66, 0.98], [0.64, 0.74], [0.55, 0.55], [0.2, 0.5], [-0.2, 0.53], [-0.5, 0.6], [-0.6, 0.78]];
const COW_PATCHES = [[-0.14, 0.9, 0.22, 0.16, 0.3], [0.45, 0.98, 0.18, 0.14, -0.2], [0.15, 0.6, 0.13, 0.08, 0], [-0.52, 0.7, 0.08, 0.1, 0]];
const COW_HEAD = [[0.07, 0.1], [-0.1, 0.13], [-0.27, 0.08], [-0.37, 0], [-0.38, -0.1], [-0.3, -0.16], [-0.12, -0.15], [0.04, -0.1], [0.09, 0]];

export function paintCow(ctx, t, up = 0) {
  const { line, shape, disc } = pen(ctx);
  const k = ease(clamp(up, 0, 1));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // A smooth closed outline through the midpoints of points, as the path.
  const rounded = (pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      if (!i) ctx.moveTo(...mix(pts.at(-1), p, 0.5));
      ctx.quadraticCurveTo(p[0], p[1], ...mix(p, q, 0.5));
    });
    ctx.closePath();
  };
  // A leg, outlined, with its hoof.
  const leg = (x, colour) => {
    line([[x, 0.62], [x + 0.01, 0.07]], 0.13, INK);
    line([[x, 0.62], [x + 0.01, 0.07]], 0.095, colour);
    line([[x + 0.01, 0.08], [x + 0.01, 0.02]], 0.13, INK);
  };

  // The far legs, in shadow, and the tail hanging from the rump, swung out
  // in a flick every few seconds.
  leg(-0.3, HIDE[1]);
  leg(0.5, HIDE[1]);
  const swing = 0.12 + 0.8 * Math.max(0, Math.sin(t * 1.7)) ** 16;
  const root = [0.6, 1.02];
  const tip = [root[0] + Math.sin(swing) * 0.55, root[1] - Math.cos(swing) * 0.55];
  line([root, [root[0] + 0.04 + Math.sin(swing) * 0.25, root[1] - 0.3], tip], 0.035, INK);
  disc(tip[0], tip[1], 0.05, INK);

  // The neck, out to her head: down at the grass, or up to look.
  const head = mix([-0.68, 0.38], [-0.72, 1.15], k);
  line([[-0.35, 0.9], head], 0.3, INK);
  line([[-0.35, 0.9], head], 0.25, HIDE[0]);

  // The udder, then the body over it, white with black patches.
  disc(0.32, 0.52, 0.08, MUZZLE, INK, 0.015);
  rounded(COW_BODY);
  ctx.fillStyle = HIDE[0];
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const [x, y, rx, ry, a] of COW_PATCHES) {
    ctx.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a));
    ctx.ellipse(x, y, rx, ry, a, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
  rounded(COW_BODY);
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = INK;
  ctx.stroke();
  leg(-0.4, HIDE[0]);
  leg(0.4, HIDE[0]);

  // The head, turned down to graze (chewing as she goes) or up to look: a
  // white face with a black poll, an ear, an eye and a pink muzzle.
  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.rotate(1.15 - 1.5 * k + 0.04 * Math.sin(t * 5) * (1 - k));
  shape(COW_HEAD, HIDE[0], INK, 0.02);
  disc(0, 0.01, 0.09, INK); // the black poll
  shape([[0, 0.06], [0.12, 0.17], [0.2, 0.12], [0.07, 0.02]], INK, null); // ear
  disc(-0.11, 0.03, 0.022, HIDE[0]); // eye
  disc(-0.115, 0.03, 0.013, INK);
  disc(-0.32, -0.06, 0.075, MUZZLE, INK, 0.015);
  disc(-0.35, -0.04, 0.012, INK); // nostril
  ctx.restore();
}
