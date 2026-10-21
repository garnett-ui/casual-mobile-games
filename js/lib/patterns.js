// Pictures and sequences made from a seed, for puzzles: shared by 15 and
// Jigsaw.
//
// PICTURES: whole pictures to cut into tiles or pieces. Each is make(seed)
// -> colourAt(u, v, aspect): the colour at (u, v) across and down (0..1),
// [r, g, b] 0..255 -- the same at any size, and (no canvas) checkable in
// Node. Colours are mixed in OKLab, so blends stay clean, and every picture
// changes in lightness as well as hue (so it can be solved without telling
// some colours apart).
//
// SEQUENCES: a frame per tile with an order you can see -- a clock running,
// the moon waxing and waning (northern hemisphere: waxing lit on the right),
// a plant growing, the sun crossing the sky, a glass filling. draw(ctx,
// size, k, n) draws frame k of n in a size-by-size square.
//
// distinct(colourAt, cols, rows) checks a picture cut up: how different
// the two most alike tiles are, and how different each is from itself
// turned around -- so every puzzle has one solution, and in Jigsaw the
// right way up shows.
import { rng } from './random.js';

// ------------------------------------------------------------- colour

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// sRGB 0..255 -> OKLab [L, a, b].
export function oklab([r8, g8, b8]) {
  const r = toLinear(r8 / 255);
  const g = toLinear(g8 / 255);
  const b = toLinear(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

// OKLab -> sRGB 0..255 (clipped).
export function rgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const out = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return out.map((c) => Math.round(255 * Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c)))))));
}

// OKLCH (lightness, chroma, hue in radians) -> OKLab.
const lch = (L, C, h) => [L, C * Math.cos(h), C * Math.sin(h)];
const hex = (h) => oklab([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);

// Gradients that always say where you are: lighter to darker down the
// picture, round the colour wheel across it (hue from h, through span
// radians). No two places the same colour.
const PALETTES = [
  { h: 0.3, span: 1.9 }, // sunset: gold to rose to violet
  { h: 3.2, span: 1.6 }, // ocean: teal to blue to indigo
  { h: 1.6, span: -1.5 }, // forest: green to lime to amber
  { h: 5.6, span: -1.7 }, // berry: rose to magenta to purple
  { h: 1.0, span: 1.6 }, // citrus: orange to yellow to green
  { h: 4.4, span: 1.8 }, // dusk: blue to violet to red
];

// A palette as colours over the picture; `contrast` narrows it (the subtle
// ones).
const corners = (pal, contrast = 1) => (u, v) => {
  const L = 0.9 - 0.5 * contrast * v - 0.04 * u;
  return lch(L, 0.06 + 0.07 * contrast + 0.02 * (1 - Math.abs(2 * v - 1)), pal.h + pal.span * contrast * (u - 0.5));
};

// ------------------------------------------------------------- noise

// Smooth random values over the plane (value noise), and a few octaves of it.
function noise(seed) {
  const hash = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const one = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, octaves = 3) => {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      v += amp * one(x * f, y * f);
      amp /= 2;
      f *= 2;
    }
    return v / (1 - 2 ** -octaves);
  };
}

// ------------------------------------------------------------- pictures

export const PICTURES = [
  {
    id: 'corners',
    name: 'Gradient',
    // Light to dark down, round the colour wheel across.
    make(seed, { contrast = 1 } = {}) {
      const r = rng(seed);
      const at = corners(PALETTES[seed % PALETTES.length], contrast);
      return (u, v) => rgb(at(u, v));
    },
  },
  {
    id: 'subtle',
    name: 'Subtle',
    // Four corners, close together: the expert's gradient.
    make(seed) {
      return PICTURES[0].make(seed, { contrast: 0.66 });
    },
  },
  {
    id: 'wheel',
    name: 'Colour wheel',
    // Hue around the middle, pale in the middle and deeper to the rim.
    make(seed) {
      const turn = rng(seed)() * Math.PI * 2;
      return (u, v, aspect = 1) => {
        const x = (u - 0.5) * aspect;
        const y = v - 0.5;
        const rad = Math.hypot(x, y) / (0.5 * Math.hypot(aspect, 1));
        return rgb(lch(0.93 - 0.48 * rad, 0.03 + 0.14 * Math.min(1, rad * 1.5), Math.atan2(y, x) + turn));
      };
    },
  },
  {
    id: 'spiral',
    name: 'Spiral',
    // Spiral arms from the middle out, their colour drifting round, darker
    // further out.
    make(seed) {
      const r = rng(seed);
      const arms = 2 + Math.floor(r() * 3);
      const turn = r() * Math.PI * 2;
      const twist = 2.5 + r() * 2;
      return (u, v, aspect = 1) => {
        const x = (u - 0.5) * aspect;
        const y = v - 0.5;
        const rad = Math.hypot(x, y) / (0.5 * Math.hypot(aspect, 1));
        const a = Math.atan2(y, x);
        const band = 0.5 + 0.5 * Math.cos(arms * a + twist * Math.PI * 2 * rad);
        return rgb(lch((0.9 - 0.42 * rad) * (0.78 + 0.22 * band), 0.05 + 0.12 * band, a + turn + rad * 2));
      };
    },
  },
  {
    id: 'glass',
    name: 'Stained glass',
    // Irregular panes, each coloured by where it is, between lead lines.
    make(seed) {
      const r = rng(seed);
      const pal = PALETTES[seed % PALETTES.length];
      const at = corners(pal);
      const G = 7; // panes across (and down)
      const cells = [];
      for (let j = -1; j <= G; j++) {
        for (let i = -1; i <= G; i++) {
          const x = (i + 0.15 + 0.7 * r()) / G;
          const y = (j + 0.15 + 0.7 * r()) / G;
          cells[(j + 1) * (G + 2) + (i + 1)] = { x, y, lift: (r() - 0.5) * 0.12, col: at(clamp(x, 0, 1), clamp(y, 0, 1)) };
        }
      }
      return (u, v) => {
        const ci = Math.floor(u * G) + 1;
        const cj = Math.floor(v * G) + 1;
        let d1 = Infinity;
        let d2 = Infinity;
        let best = null;
        for (let j = cj - 1; j <= cj + 1; j++) {
          for (let i = ci - 1; i <= ci + 1; i++) {
            const c = cells[j * (G + 2) + i];
            if (!c) continue;
            const d = Math.hypot(u - c.x, v - c.y);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              best = c;
            } else if (d < d2) d2 = d;
          }
        }
        const edge = d2 - d1;
        if (edge < 0.008) return [38, 34, 40];
        const [L, A, B] = best.col;
        const glow = Math.min(1, edge * 18);
        return rgb([clamp(L + best.lift - 0.08 * (1 - glow), 0.2, 0.97), A, B]);
      };
    },
  },
  {
    id: 'topo',
    name: 'Topographic map',
    // Hills and valleys in bands of colour, with contour lines.
    make(seed) {
      const n = noise(seed);
      const ramp = ['#2f6fb0', '#7fc3e8', '#cfe9a4', '#7fbf5a', '#3f8a3a', '#b59a64', '#8a5a3a', '#f4efe6'].map(hex);
      const height = (u, v, aspect) => clamp(0.65 * n(u * aspect * 2.2, v * 2.2, 4) + 0.35 * (0.3 + 0.6 * u - 0.2 * v), 0, 0.999);
      return (u, v, aspect = 1) => {
        const h = height(u, v, aspect);
        const steps = 14;
        const band = Math.floor(h * steps) / steps;
        const f = band * (ramp.length - 1);
        const c = mix(ramp[Math.floor(f)], ramp[Math.min(ramp.length - 1, Math.floor(f) + 1)], f - Math.floor(f));
        const frac = h * steps - Math.floor(h * steps);
        if (frac < 0.07 || frac > 0.93) return rgb([c[0] - 0.2, c[1], c[2]]);
        // Shaded hills (lit from the top left), and the colours drifting
        // across the map.
        const e = 0.004;
        const shade = (height(u - e, v - e, aspect) - height(u + e, v + e, aspect)) * 9;
        const turn = 0.5 * (u - 0.5) - 0.3 * (v - 0.5);
        const [a, b] = [c[1] * Math.cos(turn) - c[2] * Math.sin(turn), c[1] * Math.sin(turn) + c[2] * Math.cos(turn)];
        return rgb([c[0] + clamp(shade, -0.12, 0.12) - 0.1 * v, a, b]);
      };
    },
  },
  {
    id: 'marble',
    name: 'Marble',
    // Wavy bands, like marbled paper, over a blend of four colours.
    make(seed) {
      const r = rng(seed);
      const at = corners(PALETTES[seed % PALETTES.length]);
      const n = noise(seed ^ 0x5a5a);
      const slant = 1 + r() * 2;
      return (u, v, aspect = 1) => {
        const t = u * aspect * 2.5 + v * slant + 1.4 * n(u * aspect * 1.8, v * 1.8, 3);
        const band = 0.5 + 0.5 * Math.sin(Math.PI * 2 * t * 1.6);
        const [L, A, B] = at(u, v);
        return rgb([L * (0.72 + 0.28 * band), A * (0.7 + 0.5 * band), B * (0.7 + 0.5 * band)]);
      };
    },
  },
  {
    id: 'weave',
    name: 'Truchet weave',
    // Quarter circles in every little square, joining into winding paths,
    // over a blend of four colours.
    make(seed) {
      const r = rng(seed);
      const at = corners(PALETTES[seed % PALETTES.length]);
      const G = 11;
      const flip = Array.from({ length: (G + 2) * (G * 2 + 2) }, () => r() < 0.5);
      return (u, v, aspect = 1) => {
        const x = u * G * aspect;
        const y = v * G;
        const i = Math.floor(x);
        const j = Math.floor(y);
        const fx = x - i;
        const fy = y - j;
        const f = flip[(j + 1) * (G * 2 + 2) + i + 1];
        const d = f
          ? Math.min(Math.abs(Math.hypot(fx, fy) - 0.5), Math.abs(Math.hypot(1 - fx, 1 - fy) - 0.5))
          : Math.min(Math.abs(Math.hypot(1 - fx, fy) - 0.5), Math.abs(Math.hypot(fx, 1 - fy) - 0.5));
        const [L, A, B] = at(u, v);
        return d < 0.13 ? rgb([L - 0.22, A * 1.2, B * 1.2]) : rgb([Math.min(0.97, L + 0.05), A * 0.8, B * 0.8]);
      };
    },
  },
  {
    id: 'landscape',
    name: 'Landscape',
    // A sky going from day to sunset, a low sun, and ridges fading into
    // the distance.
    make(seed) {
      const r = rng(seed);
      const n = noise(seed ^ 0x3c3c);
      const sun = { x: 0.15 + 0.7 * r(), y: 0.3 + 0.12 * r() };
      const top = hex('#3d6fd1');
      const glow = hex('#ffb070');
      const far = hex('#9fa6d6');
      const near = hex('#1f3d2b');
      const ridges = [0.42, 0.52, 0.63, 0.76].map((base, i) => ({ base, amp: 0.06 + 0.03 * i, f: 2 + i * 1.5, off: r() * 50 }));
      const left = hex('#7a5fc0'); // (the sky deeper and cooler away from the sun)
      return (u, v, aspect = 1) => {
        for (let i = ridges.length - 1; i >= 0; i--) {
          const g = ridges[i];
          if (v > g.base - g.amp * n(u * aspect * g.f + g.off, i * 7.3, 3)) {
            // Each ridge nearer and darker, lit from the sun's side, with
            // trees and rocks (texture) on the near ones.
            const c = mix(far, near, (i + 1) / ridges.length);
            const lit = 0.12 * (1 - Math.abs(u - sun.x)) - 0.25 * (v - g.base);
            const rough = (n(u * aspect * 40, v * 40, 2) - 0.5) * 0.06 * i;
            const turn = (u - 0.5) * 0.8;
            return rgb([c[0] + lit + rough, c[1] * Math.cos(turn) - c[2] * Math.sin(turn), c[1] * Math.sin(turn) + c[2] * Math.cos(turn)]);
          }
        }
        const d = Math.hypot((u - sun.x) * aspect, v - sun.y);
        if (d < 0.055) return rgb(hex('#fff3c4'));
        let sky = mix(mix(top, left, clamp(Math.abs(u - sun.x) * 1.4, 0, 1) * (1 - v)), glow, smooth(clamp(v / 0.55, 0, 1)));
        sky = mix(sky, hex('#ffe2a8'), Math.max(0, 0.5 - d) * 0.9);
        // Clouds.
        const cloud = smooth(clamp((n(u * aspect * 3 + 9, v * 7, 4) - 0.55) * 5, 0, 1)) * (1 - v * 1.2);
        return rgb(mix(sky, [Math.min(0.97, sky[0] + 0.15), sky[1] * 0.4, sky[2] * 0.4], clamp(cloud, 0, 1)));
      };
    },
  },
];

// A picture drawn into RGBA pixels (an ImageData's data, or any array).
export function render(colourAt, w, h, out = new Uint8ClampedArray(w * h * 4)) {
  const aspect = w / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = colourAt((x + 0.5) / w, (y + 0.5) / h, aspect);
      const i = (y * w + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}

// How a picture cuts up: `alike`, the difference (mean OKLab distance x100
// over a grid of points) between the two most alike pieces -- and which;
// `turned`, the least any piece differs from itself turned half round
// (quarter turns too, for square pieces). The higher both, the better.
export function distinct(colourAt, cols, rows, { aspect = cols / rows, samples = 8 } = {}) {
  const pieces = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const grid = [];
      for (let y = 0; y < samples; y++) {
        for (let x = 0; x < samples; x++) {
          grid.push(oklab(colourAt((i + (x + 0.5) / samples) / cols, (j + (y + 0.5) / samples) / rows, aspect)));
        }
      }
      pieces.push(grid);
    }
  }
  const diff = (p, q) => {
    let s = 0;
    for (let k = 0; k < p.length; k++) s += Math.hypot(p[k][0] - q[k][0], p[k][1] - q[k][1], p[k][2] - q[k][2]);
    return (100 * s) / p.length;
  };
  // The same piece, turned: its points read in another order.
  const turn = (p, quarter) =>
    p.map((_, k) => {
      const x = k % samples;
      const y = (k / samples) | 0;
      const m = samples - 1;
      const [sx, sy] = quarter === 1 ? [y, m - x] : quarter === 2 ? [m - x, m - y] : [m - y, x];
      return p[sy * samples + sx];
    });
  let alike = Infinity;
  let pair = null;
  for (let a = 0; a < pieces.length; a++) {
    for (let b = a + 1; b < pieces.length; b++) {
      const d = diff(pieces[a], pieces[b]);
      if (d < alike) [alike, pair] = [d, [a, b]];
    }
  }
  const square = Math.abs(aspect * rows - cols) < 1e-6;
  let turned = Infinity;
  for (const p of pieces) {
    for (const q of square ? [1, 2, 3] : [2]) turned = Math.min(turned, diff(p, turn(p, q)));
  }
  return { alike, pair, turned };
}

// ------------------------------------------------------------- sequences

const TAU = Math.PI * 2;

export const SEQUENCES = [
  {
    id: 'clock',
    name: 'Clock',
    // A clock running from twelve: every half hour on small boards, every
    // quarter on bigger ones.
    draw(ctx, s, k, n) {
      const step = n <= 5 ? 60 : n <= 8 ? 30 : 15;
      const minutes = k * step;
      const r = s * 0.42;
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.fillStyle = '#fbf7ec';
      ctx.strokeStyle = '#5a4630';
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * TAU;
        const big = h % 3 === 0;
        ctx.lineWidth = s * (big ? 0.03 : 0.015);
        ctx.beginPath();
        ctx.moveTo(Math.sin(a) * r * (big ? 0.72 : 0.8), -Math.cos(a) * r * (big ? 0.72 : 0.8));
        ctx.lineTo(Math.sin(a) * r * 0.9, -Math.cos(a) * r * 0.9);
        ctx.stroke();
      }
      const hand = (a, len, width, colour) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-Math.sin(a) * len * 0.15, Math.cos(a) * len * 0.15);
        ctx.lineTo(Math.sin(a) * len, -Math.cos(a) * len);
        ctx.stroke();
      };
      hand(((minutes / 60) % 12) / 12 * TAU, r * 0.5, s * 0.06, '#2b2118');
      hand(((minutes % 60) / 60) * TAU, r * 0.8, s * 0.035, '#2b2118');
      ctx.fillStyle = '#b8322a';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.03, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  },
  {
    id: 'moon',
    name: 'Moon',
    // New moon, waxing (lit on the right), full, waning -- stopping short
    // of new again, so the ends can't be mixed up. The frames are evenly
    // spaced by how much is lit, not by the day (which barely changes the
    // moon near full): the shadow's edge moves the same each frame.
    draw(ctx, s, k, n) {
      const waxing = Math.ceil((n - 2) / 2); // frames between new and full
      const steps = waxing + 1;
      const lit = k <= steps ? k / steps : 1 - (k - steps) / steps; // (0 new, 1 full)
      const r = s * 0.36;
      ctx.save();
      ctx.fillStyle = '#141a33';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const [x, y] of [[0.12, 0.15], [0.85, 0.2], [0.2, 0.88], [0.9, 0.82], [0.5, 0.06]]) ctx.fillRect(x * s, y * s, s * 0.012, s * 0.012);
      ctx.translate(s / 2, s / 2);
      // The dark disc, just visible.
      ctx.fillStyle = '#2c3354';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      if (lit > 0) {
        if (k > steps) ctx.scale(-1, 1); // (waning: the same, lit on the left)
        const rx = r * (1 - 2 * lit); // (the shadow's edge: +, a crescent; -, gibbous)
        ctx.fillStyle = '#f3ecd2';
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx.ellipse(0, 0, Math.abs(rx), r, 0, Math.PI / 2, -Math.PI / 2, rx > 0);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    id: 'plant',
    name: 'Plant',
    // A seed, then a stem a good deal taller each time, with a leaf more;
    // then a bud, then a flower.
    draw(ctx, s, k, n) {
      ctx.save();
      ctx.fillStyle = '#eaf4ff';
      ctx.fillRect(0, 0, s, s);
      // The pot.
      const potTop = s * 0.78;
      ctx.fillStyle = '#c4622d';
      ctx.beginPath();
      ctx.moveTo(s * 0.3, potTop);
      ctx.lineTo(s * 0.7, potTop);
      ctx.lineTo(s * 0.64, s * 0.97);
      ctx.lineTo(s * 0.36, s * 0.97);
      ctx.fill();
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(s * 0.3, potTop - s * 0.02, s * 0.4, s * 0.04);
      if (k === 0) {
        ctx.fillStyle = '#7a4a1e';
        ctx.beginPath();
        ctx.ellipse(s / 2, potTop - s * 0.03, s * 0.03, s * 0.02, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        return;
      }
      const grown = k / (n - 1);
      const height = s * (0.1 + 0.6 * grown);
      const top = potTop - height;
      ctx.strokeStyle = '#3f8a3a';
      ctx.lineWidth = s * 0.03;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s / 2, potTop);
      ctx.lineTo(s / 2, top);
      ctx.stroke();
      const leaves = Math.min(k, n - 3);
      ctx.fillStyle = '#5bb04a';
      for (let i = 0; i < leaves; i++) {
        const y = potTop - (height * (i + 1)) / (leaves + 1);
        const side = i % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(s / 2 + side * s * 0.07, y, s * 0.07, s * 0.028, side * -0.5, 0, TAU);
        ctx.fill();
      }
      if (k === n - 2) {
        ctx.fillStyle = '#d9608a';
        ctx.beginPath();
        ctx.ellipse(s / 2, top - s * 0.03, s * 0.035, s * 0.05, 0, 0, TAU);
        ctx.fill();
      } else if (k === n - 1) {
        ctx.fillStyle = '#e8507a';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          ctx.beginPath();
          ctx.ellipse(s / 2 + Math.cos(a) * s * 0.07, top + Math.sin(a) * s * 0.07, s * 0.06, s * 0.035, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(s / 2, top, s * 0.045, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    id: 'sun',
    name: 'Sun across the sky',
    // Dawn on the left to dusk on the right, the sky changing with it.
    draw(ctx, s, k, n) {
      const t = k / (n - 1);
      const sky = (a, b) => (u) => rgb(mix(hex(a), hex(b), u));
      const horizon = s * 0.72;
      const noon = 1 - Math.abs(t - 0.5) * 2; // (0 at dawn and dusk, 1 at noon)
      const topC = rgb(mix(hex('#3b3f8f'), hex('#3d8be0'), noon));
      const lowC = t < 0.5 ? sky('#ff9a7a', '#bfe3ff')(noon) : sky('#ff8a3d', '#bfe3ff')(noon);
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, `rgb(${topC})`);
      g.addColorStop(1, `rgb(${lowC})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, horizon);
      const x = s * (0.1 + 0.8 * t);
      const y = horizon - Math.sin(Math.PI * t) * s * 0.55;
      ctx.fillStyle = noon > 0.5 ? '#fff6c8' : '#ffd27a';
      ctx.beginPath();
      ctx.arc(x, y, s * 0.08, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${rgb(mix(hex('#24432c'), hex('#4f9a4a'), noon))})`;
      ctx.fillRect(0, horizon, s, s - horizon);
      ctx.restore();
    },
  },
  {
    id: 'glass',
    name: 'Filling glass',
    // An empty glass, filling a little more each time.
    draw(ctx, s, k, n) {
      const t = k / (n - 1);
      ctx.save();
      ctx.fillStyle = '#f6f1e6';
      ctx.fillRect(0, 0, s, s);
      const [l, r, top, bottom] = [s * 0.28, s * 0.72, s * 0.12, s * 0.9];
      const inset = s * 0.06; // (narrower at the bottom)
      const at = (y) => ((y - top) / (bottom - top)) * inset;
      const level = bottom - (bottom - top - s * 0.04) * t;
      if (t > 0) {
        ctx.fillStyle = '#5aa9e6';
        ctx.beginPath();
        ctx.moveTo(l + at(level), level);
        ctx.lineTo(r - at(level), level);
        ctx.lineTo(r - inset, bottom);
        ctx.lineTo(l + inset, bottom);
        ctx.fill();
      }
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = s * 0.03;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(l, top);
      ctx.lineTo(l + inset, bottom);
      ctx.lineTo(r - inset, bottom);
      ctx.lineTo(r, top);
      ctx.stroke();
      ctx.restore();
    },
  },
];
