// The easter egg: the building's cat. It's not one of the people -- the
// lifts don't know it's there and it's not scored -- it just strolls in off
// the street, wanders the floors, sits and washes, hops into any lift
// standing open on its floor and out again wherever the doors next open,
// and now and then wanders off home, to come back later.

const COATS = [
  { k: '#e08a3c', d: '#a85a1c' }, // ginger
  { k: '#2a2a2a', d: '#111111' }, // black
  { k: '#8f8f96', d: '#5c5c63' }, // grey
  { k: '#7a5536', d: '#4e3420' }, // brown tabby
];
// 12 x 8, side on, facing right: k coat, d its shading, e eye.
const POSES = {
  walk0: [
    '.........k.k',
    'k........kkk',
    'k.......kkek',
    '.k......kkkk',
    '..kkkkkkkkd.',
    '..dkkkkkkkd.',
    '..k.k...k.k.',
    '..d.d...d.d.',
  ],
  walk1: [
    '.........k.k',
    '.k.......kkk',
    'k........kek',
    'k.......kkkk',
    '.kkkkkkkkkd.',
    '..dkkkkkkkd.',
    '...kk...kk..',
    '..d..d.d..d.',
  ],
  sit: [
    '.......k.k..',
    '.......kkk..',
    '.......kkek.',
    '.......kkk..',
    '......kkkk..',
    '.....kkkkd..',
    'kk...kkkkd..',
    '.kkkkdkkdd..',
  ],
};

const snap = (v) => {
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  return Math.round(v * dpr) / dpr;
};

// Feet at (x, base), each sprite pixel u.
function drawCat(ctx, coat, x, base, u, pose, dir) {
  const rows = POSES[pose];
  const y0 = base - rows.length * u;
  const colour = { k: coat.k, d: coat.d, e: '#c8e64a' };
  rows.forEach((row, r) => {
    for (let i = 0; i < 12; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      ctx.fillStyle = colour[ch];
      const col = dir < 0 ? 11 - i : i;
      const [x0, x1, y1, y2] = [x + col * u, x + (col + 1) * u, y0 + r * u, y0 + (r + 1) * u].map(snap);
      ctx.fillRect(x0, y1, x1 - x0, y2 - y1);
    }
  });
}

const between = (a, b) => a + Math.random() * (b - a);

export class Cat {
  constructor(tower) {
    this.tower = tower;
    this.coat = COATS[Math.floor(Math.random() * COATS.length)];
    this.state = 'away';
    this.timer = between(3, 10); // in soon after the doors open
    this.floor = 0;
    this.x = 0;
    this.dir = 1;
    this.roam = 0; // how long it's been about
  }

  get u() {
    return this.tower.px / 2;
  }

  get w() {
    return 12 * this.u;
  }

  // A lift standing open on the cat's floor (or -1).
  openLift() {
    const { sim } = this.tower;
    return sim.cars.findIndex((c) => (c.phase === 'loading' || (c.phase === 'opening' && c.open > 0.5)) && sim.floorOf(c) === this.floor);
  }

  wander() {
    const T = this.tower;
    this.state = 'walk';
    this.target = between(T.doorX + T.spriteW, T.panelX - this.w - 2);
  }

  tick(dt) {
    const T = this.tower;
    const { sim, B } = T;
    if (this.state === 'away') {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.floor = B.ground;
      this.x = -this.w * 2;
      this.roam = 0;
      this.wander();
      return;
    }
    this.roam += dt;
    if (this.state === 'ride') {
      // Out wherever the doors next open.
      const car = sim.cars[this.lift];
      if (car.phase === 'loading' && sim.floorOf(car) !== this.from) {
        this.floor = sim.floorOf(car);
        this.x = T.shaftX[this.lift] - this.w;
        this.dir = -1;
        this.wander();
      }
      return;
    }
    // A lift open here: it might fancy a ride.
    const open = this.openLift();
    if (open >= 0 && this.state !== 'toLift' && this.state !== 'leave' && Math.random() < dt * 0.5) {
      this.state = 'toLift';
      this.lift = open;
      this.target = T.shaftX[open] + 2;
    }
    if (this.state === 'toLift' && open !== this.lift) this.wander(); // too late
    if (this.state === 'sit') {
      this.timer -= dt;
      if (this.timer <= 0) this.wander();
      return;
    }
    const speed = Math.max(20, (T.panelX - T.doorX) / (this.state === 'toLift' ? 2.5 : 5));
    const d = this.target - this.x;
    this.moving = Math.abs(d) > 0.5;
    if (this.moving) {
      this.dir = Math.sign(d);
      this.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
      return;
    }
    // Got there.
    if (this.state === 'toLift') {
      this.state = 'ride';
      this.from = this.floor;
    } else if (this.state === 'leave') {
      this.state = 'away';
      this.timer = between(25, 70);
    } else if (this.floor === B.ground && this.roam > 40 && Math.random() < 0.4) {
      this.state = 'leave';
      this.target = -this.w * 2;
    } else if (Math.random() < 0.4) {
      this.state = 'sit';
      this.timer = between(2, 6);
    } else this.wander();
  }

  // On its floor (not when it's away, or in a lift).
  draw(time) {
    const T = this.tower;
    if (this.state === 'away' || this.state === 'ride') return;
    const pose = this.state === 'sit' ? 'sit' : Math.floor(time * 8) % 2 ? 'walk0' : 'walk1';
    drawCat(T.ctx, this.coat, this.x, T.rowY(this.floor) + T.rowH - 2, this.u, pose, this.dir);
  }

  // Riding lift i: curled up at the riders' feet, in the far corner.
  drawInCar(i, cx, cy, cw, ch) {
    if (this.state !== 'ride' || this.lift !== i) return;
    drawCat(this.tower.ctx, this.coat, cx + cw - 3 - this.w, cy + ch - 1, this.u, 'sit', -1);
  }
}
