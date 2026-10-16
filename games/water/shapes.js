// Glassware: each vessel is round in cross-section, described by its
// half-width (as a fraction of its widest point) up its height, so how high
// a given volume of water stands -- and so where each graduation mark goes --
// follows from real geometry: volume up to height y is the integral of
// pi r(y)^2. A flask's marks crowd together in its wide bulb and spread
// out up its narrow neck.

const N = 200; // samples up the height

// Profiles: [y, half-width] from the bottom (0) to the brim (1), and the
// vessel's width-to-height ratio.
const PROFILES = {
  cylinder: { aspect: 0.3, pts: [[0, 1], [1, 1]] }, // graduated cylinder
  beaker: { aspect: 0.78, pts: [[0, 0.94], [0.03, 1], [1, 1]] },
  flask: { aspect: 0.78, pts: [[0, 0.96], [0.03, 1], [0.6, 0.36], [0.66, 0.3], [1, 0.3]] }, // Erlenmeyer
  round: { aspect: 0.72, pts: circle() }, // Florence flask: a ball with a neck
  bottle: { aspect: 0.56, pts: [[0, 0.9], [0.04, 1], [0.6, 1], [0.74, 0.62], [0.8, 0.42], [0.84, 0.38], [1, 0.38]] },
  cone: { aspect: 0.62, pts: [[0, 0.5], [1, 1]] }, // wider at the top, like a glass
};

function circle() {
  // A ball (round bottom) in the lower 70%, meeting a straight neck.
  const bulb = 0.7;
  const neck = 0.32;
  const top = Math.sqrt(1 - neck * neck); // where the ball is as narrow as the neck
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const t = -1 + ((top + 1) * i) / 30;
    pts.push([(bulb * (t + 1)) / 2, Math.sqrt(Math.max(0, 1 - t * t))]);
  }
  pts.push([1, neck]);
  return pts;
}

function halfWidth(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    if (y <= pts[i][0]) {
      const [y0, w0] = pts[i - 1];
      const [y1, w1] = pts[i];
      return w0 + ((w1 - w0) * (y - y0)) / Math.max(1e-9, y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

// Everything needed to draw a vessel of a given shape and capacity:
// width(y) and the height (0..1) the water reaches at each volume.
export function vessel(shape, capacity) {
  const { aspect, pts } = PROFILES[shape] || PROFILES.beaker;
  const w = new Float64Array(N + 1);
  const vol = new Float64Array(N + 1); // volume below each sample, 0..1
  for (let i = 0; i <= N; i++) w[i] = halfWidth(pts, i / N);
  for (let i = 1; i <= N; i++) vol[i] = vol[i - 1] + (w[i - 1] ** 2 + w[i] ** 2) / 2 / N;
  const total = vol[N];
  for (let i = 0; i <= N; i++) vol[i] /= total;
  return {
    shape,
    capacity,
    aspect,
    // How full a vessel of this shape is, by volume, for its size on screen:
    // relative volume of a vessel 1 unit tall (for sizing them against each other).
    unitVolume: total * aspect * aspect,
    width: (y) => halfWidth(pts, y),
    // Height (0..1) the water stands at with v units in it.
    level(v) {
      const f = Math.max(0, Math.min(1, v / capacity));
      let i = 1;
      while (i < N && vol[i] < f) i++;
      const t = (f - vol[i - 1]) / Math.max(1e-12, vol[i] - vol[i - 1]);
      return (i - 1 + Math.max(0, Math.min(1, t))) / N;
    },
    // The outline: points [x, y] with x in -0.5..0.5 of the width, y from 0
    // up to `top` (1 is the top graduation; a little more leaves headroom,
    // like real glassware, so the rim doesn't sit on the top mark).
    outline(top = 1) {
      const right = [];
      for (let i = 0; i <= 40; i++) {
        const y = i / 40;
        right.push([halfWidth(pts, y) / 2, y]);
      }
      if (top > 1) right.push([halfWidth(pts, 1) / 2, top]);
      return [...right.map(([x, y]) => [-x, y]).reverse(), ...right];
    },
  };
}

// The area (2-D) of the outline below height y, as a fraction of the whole:
// used to keep the water looking the same amount while a vessel tilts.
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

// The part of a polygon below a horizontal line (screen y >= cut, since
// screen y grows downward).
export function clipBelow(pts, cut) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ina = a[1] >= cut;
    const inb = b[1] >= cut;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (cut - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, cut]);
    }
  }
  return out;
}
