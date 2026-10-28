// Marble Garden in play: the drawing (the garden with its hedge and gate,
// the sandy path and the drain at its end, bridges over the tunnels; the
// marbles as glass, drawn once each to a sprite; the gnome on his toadstool
// with the marble in his hands and the next in his bucket), the aim and its
// short guide, the shot in flight, the pops, the fall down the drain, and
// the path cleared. The engine holds the game and runs it a tick at a
// time; this only shows it, and tells it when to flick.
import { newGame, step, fire, swap, progress, replay, W, H, R, GNOME, TICK, SHOT_SPEED } from './engine.js';

// The colours of the marbles, by colour number: cherry, sunflower, leaf,
// sky, grape.
export const MARBLES = ['#ff5a5f', '#ffc83d', '#52d273', '#4fb3ff', '#b57bff'];
const HUD = { h: 30, font: 'ui-monospace, Menlo, Consolas, monospace' };
const INK = { light: '#fffbe9', dim: 'rgba(255,251,233,.6)', warn: '#ffb347' };
const GUIDE = 7 * R; // how far the aim's dotted guide reaches
const GNOME_R = 1.6; // the gnome is drawn this many times a marble's size
const DRAIN_R = 1.9 * R;
const HOP = { t: 0.5, h: 0.6 }; // the gnome's jump for joy: seconds, radii
const PARTY = { card: 2.2, n: 60 }; // the path cleared: seconds before the card, confetti
const SINK = { t: 1.2 }; // down the drain: seconds before the card
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ------------------------------------------------------------------ gardens
//
// The garden changes every five levels: each is a palette (the grass, the
// path and its edge, the hedge, the soil beyond the hedge), its dressing
// at the edges (`dress`, drawn behind the game; the path and the middle
// stay quiet so the chain and the shot read), and what drifts in its air
// (`motes`). Adding a garden is adding to this table. L is the layout:
// ox, oy, scale, the canvas size.
export const GARDENS = [
  {
    // The vegetable patch: bright grass, a box hedge, a lettuce or two in
    // the corners, and bees about.
    name: 'patch', grass: '#8fd16a', stripe: 'rgba(255,255,255,.07)', path: '#ecd9a6', pathEdge: '#c9b07a', hedge: '#3f8f3a', hedgeLight: '#5bb24f', soil: '#5a4028',
    motes: { n: 6, colour: '#ffd23d', size: 2.2, kind: 'bee' },
    dress(ctx, L) {
      const { ox, oy, scale } = L;
      const r = scale * R;
      // Lettuces in the four corners, inside the hedge.
      for (const [cx, cy] of [[3.2, 3.2], [W - 3.2, 3.2], [3.2, H - 3.2], [W - 3.2, H - 3.2]]) {
        const x = ox + cx * scale;
        const y = oy + cy * scale;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU;
          ctx.fillStyle = k % 2 ? '#79c35a' : '#a4dd7a';
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, r * 0.75, r * 0.5, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#c8ec9e';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, TAU);
        ctx.fill();
      }
    },
  },
];
export const gardenFor = (n) => GARDENS[Math.floor((n - 1) / 5) % GARDENS.length];

// ------------------------------------------------------------------ looks
//
// How each kind of marble looks: `colour(m)` for sparks and `paint(ctx,
// r, m)` drawing it about the origin. A kind the table doesn't know is
// painted loud (a magenta marble with a question mark), never quietly as
// something else. Adding a kind to the engine is adding its look here.
export function paintMarble(ctx, colour, r) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, colour);
  g.addColorStop(1, shade(colour, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  // A swirl of glass inside, and the window's gleam.
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(r * 0.1, r * 0.1, r * 0.5, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.14, -Math.PI / 4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU);
  ctx.stroke();
}

// A colour darkened: #rrggbb scaled by k.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(((n >> v) & 255) * k);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export const LOOKS = {
  marble: { colour: (m) => MARBLES[m.colour], paint: (ctx, r, m) => paintMarble(ctx, MARBLES[m.colour], r) },
};
const UNKNOWN = {
  colour: () => '#ff00ff',
  paint(ctx, r) {
    paintMarble(ctx, '#ff00ff', r);
    ctx.fillStyle = '#000';
    ctx.font = `900 ${r * 1.2}px ${HUD.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, r * 0.05);
  },
};
export const lookOf = (marble) => LOOKS[marble.kind] ?? UNKNOWN;

// ------------------------------------------------------------------ the gnome

// The gnome: a round fellow in a blue coat and a tall red hat, white beard,
// a nose, two eyes that look where he aims, sitting on a toadstool. Drawn
// about his middle with r the marble's radius on screen; `aim` is where he
// faces (radians, 0 up), `hop` his jump for joy (0..1), `arm` how far his
// hands are thrust out (0..1, the flick).
export function paintGnome(ctx, r, aim, hop = 0, arm = 0) {
  const lift = -Math.sin(hop * Math.PI) * HOP.h * r;
  const ax = Math.sin(aim);
  const ay = -Math.cos(aim);
  // The toadstool he sits on: a red cap with white spots, its stalk under.
  ctx.fillStyle = '#f0e6cc';
  ctx.fillRect(-r * 0.7, r * 1.2, r * 1.4, r * 0.9);
  ctx.fillStyle = '#e8402f';
  ctx.beginPath();
  ctx.ellipse(0, r * 1.35, r * 2.2, r * 0.75, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff4e0';
  for (const [sx, sy, sr] of [[-1.3, 1.25, 0.26], [0.2, 1.05, 0.3], [1.4, 1.4, 0.22], [-0.4, 1.7, 0.18], [0.9, 1.75, 0.17]]) {
    ctx.beginPath();
    ctx.arc(sx * r, sy * r, sr * r, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(0, lift);
  // The body: a blue coat, a belt.
  ctx.fillStyle = '#3d6fd8';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.35, r * 1.25, r * 1.1, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(-r * 1.15, r * 0.55, r * 2.3, r * 0.3);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(-r * 0.2, r * 0.5, r * 0.4, r * 0.4);
  // The beard, the face, the nose, the eyes looking where he aims.
  ctx.fillStyle = '#f7f3ea';
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 0.35);
  ctx.quadraticCurveTo(0, r * 1.5, r * 0.95, -r * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffcfa8';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.55, r * 0.85, r * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffb48a';
  ctx.beginPath();
  ctx.arc(ax * r * 0.15, -r * 0.45 + ay * r * 0.05, r * 0.3, 0, TAU);
  ctx.fill();
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(sgn * r * 0.4, -r * 0.75, r * 0.2, r * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#20202a';
    ctx.beginPath();
    ctx.arc(sgn * r * 0.4 + ax * r * 0.09, -r * 0.75 + ay * r * 0.08, r * 0.1, 0, TAU);
    ctx.fill();
  }
  // The hat: tall, red, a little bent at the top, its brim over the brow.
  ctx.fillStyle = '#e8402f';
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 1.05);
  ctx.quadraticCurveTo(-r * 0.3, -r * 2.6, r * 0.25, -r * 3.0);
  ctx.quadraticCurveTo(r * 0.45, -r * 2.2, r * 0.95, -r * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c93222';
  ctx.beginPath();
  ctx.ellipse(0, -r * 1.05, r * 1.0, r * 0.22, 0, 0, TAU);
  ctx.fill();
  // The hands, out toward the aim, where the marble sits.
  const reach = r * (1.6 + 0.5 * arm);
  ctx.fillStyle = '#ffcfa8';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(ax * reach + sgn * ay * -r * 0.5, ay * reach + sgn * ax * r * 0.5, r * 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ the play

export class Play {
  constructor(canvas, level, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.hooks = hooks;
    this.paused = false;
    this.timeScale = 1; // the browser tests fast-forward
    this.sprites = new Map();
    this.garden = gardenFor(level.n);
    this.motes = [];
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

  // A fresh go at the level.
  reset() {
    this.game = newGame(this.level);
    this.path = this.game.path;
    this.aim = 0;
    this.queued = null; // a flick asked for while one was in the air: fired when it lands
    this.accum = 0; // real time not yet stepped
    this.time = 0;
    this.sparks = [];
    this.rings = []; // a pop's ring, swelling and fading
    this.arm = 0; // the flick, seconds since
    this.hop = 0; // the gnome's jump for joy, seconds since
    this.outcome = null; // 'cleared' | 'drained', once the picture has caught up
    this.sink = null; // down the drain: { t, marbles } falling in
    this.party = null; // the path cleared: { t, bits } -- confetti and the banner
    this.demo = false; // SHOW ME: the computer gnome's run
    this.demoAt = 0;
    this.started = false; // the first flick, or the demo: until then the chain waits
  }

  // Watch the computer gnome do it, from the start.
  showMe() {
    this.reset();
    this.demo = true;
    this.started = true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  // Can a flick be asked for now?
  get ready() {
    return !this.outcome && !this.sink && !this.party && !this.game.over;
  }

  // Aim at a point on the canvas (CSS pixels): the angle from the gnome to
  // it. A point on the gnome himself is no aim (a tap there swaps).
  aimAt(px, py) {
    const [x, y] = this.toBoard(px, py);
    if (this.onGnome(px, py)) return false;
    this.aim = Math.atan2(x - GNOME.x, GNOME.y - y);
    return true;
  }

  // Is this point (CSS pixels) on the gnome? (A tap there swaps.)
  onGnome(px, py) {
    const [x, y] = this.toBoard(px, py);
    return Math.hypot(x - GNOME.x, y - GNOME.y) < R * 2.2 * GNOME_R;
  }

  swap() {
    if (!this.ready || this.demo) return;
    swap(this.game);
    this.hooks.sfx?.('tap');
  }

  // Flick the loaded marble at the aim: now, or as soon as the one in the
  // air has landed.
  fire(angle = this.aim) {
    if (!this.ready || this.paused || this.demo) return false;
    this.started = true;
    if (this.game.shot) {
      this.queued = angle;
      return false;
    }
    return this.flick(angle);
  }

  flick(angle) {
    if (!fire(this.game, angle)) return false;
    this.arm = 0.001;
    this.hooks.sfx?.('whoosh');
    this.hooks.haptic?.(12);
    this.hooks.onShot?.(this.game.shots);
    return true;
  }

  // The engine's tick, and what to show of it.
  tick() {
    const G = this.game;
    // The demo: the computer gnome's flicks at their recorded ticks.
    if (this.demo) {
      const run = this.level.solution;
      while (this.demoAt < run.length && run[this.demoAt][0] === G.tick) {
        const [, angle, swapped] = run[this.demoAt++];
        if (swapped) swap(G);
        this.aim = angle;
        this.flick(angle);
      }
    }
    const events = step(G);
    for (const e of events) this.on(e);
    if (this.queued !== null && !G.shot && !G.over) {
      const angle = this.queued;
      this.queued = null;
      this.flick(angle);
    }
  }

  // An event from the engine: pops, landings, the end.
  on(e) {
    const G = this.game;
    if (e.type === 'pop') {
      for (const m of e.marbles) {
        const p = this.path.at(m.s);
        this.rings.push({ x: p.x, y: p.y, t: 0, colour: lookOf(m).colour(m) });
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * TAU;
          const v = 5 + Math.random() * 9;
          this.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.3 + Math.random() * 0.3, colour: lookOf(m).colour(m) });
        }
      }
      this.hooks.sfx?.('pop', e.marbles.length);
      this.hooks.haptic?.(e.marbles.length > 3 ? 30 : 15);
    } else if (e.type === 'land' && !G.over) {
      this.hooks.sfx?.('stick');
    } else if (e.type === 'over' && e.why === 'cleared') {
      // The celebration: confetti, the banner, the gnome jumping; the
      // card comes after.
      this.outcome = 'cleared';
      this.party = { t: 0, bits: [] };
      for (let k = 0; k < PARTY.n; k++) {
        this.party.bits.push({ x: Math.random() * W, y: -R - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 6, spin: (Math.random() - 0.5) * 10, a: Math.random() * TAU, colour: MARBLES[Math.floor(Math.random() * MARBLES.length)], w: 0.5 + Math.random() * 0.5 });
      }
      this.hop = 0.001;
      this.hooks.sfx?.('win');
      this.hooks.haptic?.(40);
    } else if (e.type === 'over' && e.why === 'drained') {
      // Down the drain: the chain's front runs on into the hole, marble
      // after marble, then the card.
      this.sink = { t: 0, marbles: G.chain.map((m) => ({ marble: m, s: m.s })) };
      this.hooks.sfx?.('lose');
      this.hooks.haptic?.([60, 40, 80]);
    }
  }

  update(dt) {
    this.time += dt;
    // The engine runs in fixed ticks: as many as the time that has passed
    // asks for (a few at most, after a stall).
    if (this.started && !this.game.over) {
      this.accum += dt;
      let n = 0;
      while (this.accum >= TICK && n < 8) {
        this.accum -= TICK;
        this.tick();
        n++;
      }
      if (this.accum > TICK * 8) this.accum = 0;
    }
    for (const s of this.sparks) {
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 12 * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    for (const ring of this.rings) ring.t += dt;
    this.rings = this.rings.filter((ring) => ring.t < 0.35);
    if (this.arm) this.arm = this.arm + dt > 0.18 ? 0 : this.arm + dt;
    if (this.hop) this.hop = this.hop + dt > HOP.t ? 0 : this.hop + dt;
    if (this.party) {
      this.party.t += dt;
      for (const b of this.party.bits) {
        b.vy += 6 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += b.spin * dt;
      }
      if (this.party.t > PARTY.card && !this.party.told) {
        this.party.told = true;
        this.hooks.onCleared?.({ shots: this.game.shots, par: this.level.par });
      }
    }
    if (this.sink) {
      this.sink.t += dt;
      // The chain keeps rolling into the drain, fast.
      for (const m of this.sink.marbles) m.s += 30 * dt;
      if (this.sink.t > SINK.t && !this.outcome) {
        this.outcome = 'drained';
        this.hooks.onDrained?.({ shots: this.game.shots });
      }
    }
    for (const mote of this.motes) {
      mote.p += dt;
      mote.x += Math.cos(mote.p * 0.7) * mote.v * dt;
      mote.y += Math.sin(mote.p * 1.1) * mote.v * 0.6 * dt;
      if (mote.x < -2) mote.x = this.cssW + 2;
      if (mote.x > this.cssW + 2) mote.x = -2;
      if (mote.y < -2) mote.y = this.cssH + 2;
      if (mote.y > this.cssH + 2) mote.y = -2;
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
    // The board fits under the instrument band, centred.
    const top = HUD.h;
    this.scale = Math.min(this.cssW / W, (this.cssH - top) / H);
    this.ox = (this.cssW - W * this.scale) / 2;
    this.oy = top + (this.cssH - top - H * this.scale) / 2;
    this.sprites.clear();
    this.pathCanvas = null;
    // What drifts in this garden's air, scattered afresh.
    const m = this.garden.motes;
    this.motes = [];
    for (let k = 0; k < m.n; k++) this.motes.push({ x: Math.random() * this.cssW, y: Math.random() * this.cssH, p: Math.random() * TAU, v: 8 + Math.random() * 10 });
  }

  toBoard(px, py) {
    return [(px - this.ox) / this.scale, (py - this.oy) / this.scale];
  }

  toScreen(x, y) {
    return [this.ox + x * this.scale, this.oy + y * this.scale];
  }

  // A marble's picture at the board's scale, drawn once and kept.
  sprite(marble) {
    const key = marble.kind === 'marble' ? `m${marble.colour}` : marble.kind;
    let s = this.sprites.get(key);
    if (s) return s;
    const r = R * this.scale;
    const size = Math.ceil(r * 2.6);
    s = document.createElement('canvas');
    s.width = s.height = Math.round(size * this.dpr);
    const c = s.getContext('2d');
    c.scale(this.dpr, this.dpr);
    c.translate(size / 2, size / 2);
    lookOf(marble).paint(c, r * 0.96, marble);
    s.size = size;
    this.sprites.set(key, s);
    return s;
  }

  drawMarble(ctx, marble, x, y, scale = 1, alpha = 1) {
    const s = this.sprite(marble);
    ctx.save();
    ctx.translate(this.ox + x * this.scale, this.oy + y * this.scale);
    if (scale !== 1) ctx.scale(scale, scale);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(s, -s.size / 2, -s.size / 2, s.size, s.size);
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    this.drawGarden(ctx);
    this.drawDrain(ctx);
    if (this.ready && !this.demo && this.started) this.drawGuide(ctx);
    this.drawChain(ctx);
    this.drawBridges(ctx);
    // The shot in flight.
    const sh = this.game.shot;
    if (sh) this.drawMarble(ctx, sh.marble, sh.x, sh.y);
    for (const ring of this.rings) {
      const u = ring.t / 0.35;
      const [x, y] = this.toScreen(ring.x, ring.y);
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = ring.colour;
      ctx.lineWidth = Math.max(1, R * this.scale * 0.25 * (1 - u));
      ctx.beginPath();
      ctx.arc(x, y, R * this.scale * (1 + 1.6 * u), 0, TAU);
      ctx.stroke();
    }
    for (const s of this.sparks) {
      const u = 1 - s.t / s.life;
      const [x, y] = this.toScreen(s.x, s.y);
      ctx.globalAlpha = u;
      ctx.fillStyle = s.colour;
      ctx.beginPath();
      ctx.arc(x, y, R * this.scale * 0.22 * u + 1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.drawGnome(ctx);
    this.drawMotes(ctx);
    if (this.party) this.drawParty(ctx);
    this.drawHud(ctx);
    ctx.restore();
  }

  // The garden: soil beyond the hedge, the grass in mown stripes, the
  // garden's own dressing, the hedge round the edge with a gap where the
  // path comes in, and the path itself -- none of it moves, so it's drawn
  // once to a canvas and kept.
  drawGarden(ctx) {
    if (!this.pathCanvas) this.paintGarden();
    ctx.drawImage(this.pathCanvas, 0, 0, this.cssW, this.cssH);
  }

  paintGarden() {
    const { cssW, cssH, scale, ox, oy, dpr } = this;
    const g = this.garden;
    const r = R * scale;
    const c = document.createElement('canvas');
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = g.soil;
    ctx.fillRect(0, 0, cssW, cssH);
    // The lawn, in stripes.
    ctx.fillStyle = g.grass;
    ctx.fillRect(ox, oy, W * scale, H * scale);
    ctx.fillStyle = g.stripe;
    for (let y = 0; y < H; y += 6) ctx.fillRect(ox, oy + y * scale, W * scale, 3 * scale);
    g.dress?.(ctx, this);
    // The path: an edge, then the sand, along the way from the gate to
    // the drain (the way in beyond the hedge is under the hedge).
    const pts = this.path.points;
    const trace = () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * scale, oy + y * scale) : ctx.moveTo(ox + x * scale, oy + y * scale)));
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = g.pathEdge;
    ctx.lineWidth = r * 2.9;
    trace();
    ctx.stroke();
    ctx.strokeStyle = g.path;
    ctx.lineWidth = r * 2.5;
    trace();
    ctx.stroke();
    // The hedge: a band of bobbles round the lawn, with the gate cut out
    // where the way in crosses it.
    const gate = this.path.at(this.path.gate);
    const gx = ox + gate.x * scale;
    const gy = oy + gate.y * scale;
    const band = r * 1.6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cssW, cssH);
    ctx.arc(gx, gy, r * 2.2, 0, TAU, true);
    ctx.clip();
    for (const [light, inset] of [[false, 0], [true, band * 0.35]]) {
      ctx.fillStyle = light ? g.hedgeLight : g.hedge;
      const step = band * 0.8;
      const bob = (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, band * (light ? 0.42 : 0.62), 0, TAU);
        ctx.fill();
      };
      for (let x = ox - band * 0.5; x <= ox + W * scale + band * 0.5; x += step) {
        bob(x, oy + inset - band * 0.1);
        bob(x + step / 2, oy + H * scale - inset + band * 0.1);
      }
      for (let y = oy - band * 0.5; y <= oy + H * scale + band * 0.5; y += step) {
        bob(ox + inset - band * 0.1, y);
        bob(ox + W * scale - inset + band * 0.1, y + step / 2);
      }
    }
    ctx.restore();
    this.pathCanvas = c;
  }

  // The drain at the end of the path: a dark hole with a grate, that glows
  // red as the chain draws near.
  drawDrain(ctx) {
    const { scale } = this;
    const r = R * scale;
    const end = this.path.at(this.path.length);
    const [x, y] = this.toScreen(end.x, end.y);
    const near = this.game.chain.length ? progress(this.game).front : 0;
    const danger = clamp((near - 0.75) / 0.25, 0, 1);
    if (danger > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
      const glow = ctx.createRadialGradient(x, y, r, x, y, r * 4.5);
      glow.addColorStop(0, `rgba(255,70,40,${0.45 * danger * pulse})`);
      glow.addColorStop(1, 'rgba(255,70,40,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 4.5, y - r * 4.5, r * 9, r * 9);
    }
    ctx.fillStyle = '#5a4a36';
    ctx.beginPath();
    ctx.arc(x, y, DRAIN_R * scale, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1b1510';
    ctx.beginPath();
    ctx.arc(x, y, DRAIN_R * scale * 0.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#6e5c44';
    ctx.lineWidth = Math.max(1, r * 0.14);
    for (const d of [-0.9, -0.3, 0.3, 0.9]) {
      const h = Math.sqrt(Math.max(0, 1 - (d * 0.5) ** 2)) * DRAIN_R * scale * 0.78;
      ctx.beginPath();
      ctx.moveTo(x + d * DRAIN_R * scale * 0.5, y - h);
      ctx.lineTo(x + d * DRAIN_R * scale * 0.5, y + h);
      ctx.stroke();
    }
  }

  // The chain, marble by marble along the way: on the board, out of the
  // tunnels (they're under the bridges), and sinking into the drain at
  // the end.
  drawChain(ctx) {
    const G = this.game;
    const path = this.path;
    const list = this.sink ? this.sink.marbles : G.chain;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = this.sink ? list[i].marble : list[i];
      const s = this.sink ? list[i].s : m.s;
      if (s < path.gate - R) continue;
      const p = path.at(s);
      // Into the drain: smaller and fainter the further past the end.
      const over = s - path.length;
      if (over > 2 * R) continue;
      const shrink = over > 0 ? Math.max(0, 1 - over / (2 * R)) : 1;
      if (G.tunnels.some(([a, b]) => s > a - R * 0.6 && s < b + R * 0.6)) continue;
      this.drawMarble(ctx, m, p.x, p.y, shrink, shrink);
    }
  }

  // A plank bridge over each tunnel, the chain passing under it.
  drawBridges(ctx) {
    const { scale } = this;
    const r = R * scale;
    for (const [a, b] of this.game.tunnels) {
      const p = this.path.at(a - R * 0.6);
      const q = this.path.at(b + R * 0.6);
      const [x0, y0] = this.toScreen(p.x, p.y);
      const [x1, y1] = this.toScreen(q.x, q.y);
      const len = Math.hypot(x1 - x0, y1 - y0);
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(-r * 0.2, -r * 1.7 + r * 0.3, len + r * 0.4, r * 3.4);
      ctx.fillStyle = '#9c6f3f';
      ctx.fillRect(-r * 0.2, -r * 1.7, len + r * 0.4, r * 3.4);
      ctx.fillStyle = '#7d5630';
      for (let x = r * 0.2; x < len; x += r * 0.9) ctx.fillRect(x, -r * 1.7, r * 0.12, r * 3.4);
      ctx.fillStyle = '#5e3f20';
      ctx.fillRect(-r * 0.2, -r * 1.7, len + r * 0.4, r * 0.3);
      ctx.fillRect(-r * 0.2, r * 1.4, len + r * 0.4, r * 0.3);
      ctx.restore();
    }
  }

  // The aim: a short dotted guide out from the gnome's hands.
  drawGuide(ctx) {
    const { scale } = this;
    const r = R * scale;
    const [gx, gy] = this.toScreen(GNOME.x, GNOME.y);
    const dx = Math.sin(this.aim);
    const dy = -Math.cos(this.aim);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.setLineDash([r * 0.3, r * 0.6]);
    ctx.lineCap = 'round';
    const from = r * (1.6 * GNOME_R + 1.3);
    ctx.beginPath();
    ctx.moveTo(gx + dx * from, gy + dy * from);
    ctx.lineTo(gx + dx * (from + GUIDE * r), gy + dy * (from + GUIDE * r));
    ctx.stroke();
    ctx.restore();
  }

  // The gnome in the middle with the loaded marble in his hands and the
  // next one in a bucket at his side.
  drawGnome(ctx) {
    const { scale } = this;
    const r = R * scale;
    const G = this.game;
    const [gx, gy] = this.toScreen(GNOME.x, GNOME.y);
    const hop = this.hop ? this.hop / HOP.t : 0;
    const arm = this.arm ? 1 - this.arm / 0.18 : 0;
    ctx.save();
    ctx.translate(gx, gy);
    paintGnome(ctx, r * GNOME_R, this.aim, hop, arm);
    ctx.restore();
    // The bucket, with the next marble in it.
    const bx = GNOME.x - 3.6 * R;
    const by = GNOME.y + 2.0 * R;
    const [sx, sy] = this.toScreen(bx, by);
    ctx.fillStyle = '#7f8794';
    ctx.beginPath();
    ctx.moveTo(sx - r * 1.0, sy - r * 0.6);
    ctx.lineTo(sx + r * 1.0, sy - r * 0.6);
    ctx.lineTo(sx + r * 0.8, sy + r * 0.9);
    ctx.lineTo(sx - r * 0.8, sy + r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4e5561';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(sx, sy - r * 0.5, r * 0.95, Math.PI, 0);
    ctx.stroke();
    if (!G.over) this.drawMarble(ctx, G.next, bx, by - 0.2 * R, 0.72);
    ctx.fillStyle = INK.light;
    ctx.font = `700 ${Math.max(9, r * 0.55)}px ${HUD.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('NEXT', sx, sy + r * 1.1);
    // The loaded marble, in his hands, out toward the aim.
    if (!G.over) {
      const reach = (1.6 + 0.5 * arm) * GNOME_R;
      const lift = -Math.sin(hop * Math.PI) * HOP.h * GNOME_R;
      this.drawMarble(ctx, G.loaded, GNOME.x + Math.sin(this.aim) * reach * R, GNOME.y - Math.cos(this.aim) * reach * R + lift * R);
    }
  }

  // What drifts about: bees, petals, snow -- by the garden's `motes`.
  drawMotes(ctx) {
    const m = this.garden.motes;
    for (const mote of this.motes) {
      if (m.kind === 'bee') {
        ctx.fillStyle = m.colour;
        ctx.beginPath();
        ctx.ellipse(mote.x, mote.y, m.size * 1.3, m.size, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(mote.x - m.size * 0.3, mote.y - m.size, m.size * 0.5, m.size * 2);
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        const flap = Math.sin(mote.p * 40) * 0.5 + 0.8;
        ctx.beginPath();
        ctx.ellipse(mote.x, mote.y - m.size * 1.1 * flap, m.size * 0.9, m.size * 0.5, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = m.colour;
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, m.size, 0, TAU);
        ctx.fill();
      }
    }
  }

  // Confetti, and PATH CLEARED! swelling in over the garden.
  drawParty(ctx) {
    const { cssW, cssH, scale } = this;
    const t = this.party.t;
    for (const b of this.party.bits) {
      const [x, y] = this.toScreen(b.x, b.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.a);
      ctx.fillStyle = b.colour;
      ctx.fillRect(-R * scale * b.w * 0.5, -R * scale * 0.2, R * scale * b.w, R * scale * 0.4);
      ctx.restore();
    }
    const u = ease(Math.min(1, t / 0.25)) * (t > PARTY.card - 0.3 ? Math.max(0, (PARTY.card - t) / 0.3) : 1);
    if (u <= 0) return;
    const size = Math.min(cssW * 0.11, 44) * (0.6 + 0.4 * u) * (1 + 0.04 * Math.sin(t * 6));
    ctx.save();
    ctx.globalAlpha = u;
    ctx.font = `900 ${size}px ${HUD.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = 'rgba(40,60,20,.85)';
    ctx.strokeText('PATH CLEARED!', cssW / 2, cssH * 0.3);
    ctx.fillStyle = '#fff6c4';
    ctx.fillText('PATH CLEARED!', cssW / 2, cssH * 0.3);
    ctx.restore();
  }

  // The instrument band: shots against par, the level, and how far the
  // chain has got -- a bar for the way, the front marble's place on it
  // and how many marbles are still to come (all from the engine's
  // progress(); no sums here).
  drawHud(ctx) {
    const { cssW } = this;
    const G = this.game;
    const pr = progress(G);
    const mid = (HUD.h - 4) / 2;
    ctx.fillStyle = 'rgba(30,45,20,.75)';
    ctx.fillRect(0, 0, cssW, HUD.h);
    ctx.font = `700 13px ${HUD.font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = INK.light;
    ctx.fillText(`FLICKS ${G.shots}`, 12, mid);
    ctx.textAlign = 'right';
    ctx.fillStyle = G.shots > this.level.par ? INK.warn : INK.dim;
    ctx.fillText(`PAR ${this.level.par}`, cssW - 12, mid);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK.dim;
    ctx.fillText(this.demo ? 'THE COMPUTER GNOME' : `${pr.left} LEFT`, cssW / 2, mid);
    // The way, as a strip along the band's foot: how far the front marble
    // has got, red as it nears the drain.
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.fillRect(0, HUD.h - 4, cssW, 4);
    ctx.fillStyle = pr.front > 0.75 ? '#ff6a5a' : '#ffd23d';
    ctx.fillRect(0, HUD.h - 4, cssW * pr.front, 4);
  }
}

// For the tests: the engine's own replay of a level's recorded run.
export { replay, SHOT_SPEED };
