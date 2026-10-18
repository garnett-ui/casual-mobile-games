// The people: 8-bit sprites, 16 x 32 (twice as tall as wide), drawn with
// a dark outline. Walking, they're seen from the side, in a five-step
// cycle; standing still, they face you. Half the people have lighter skin,
// half darker; half are women (narrower shoulders, longer hair), and half
// of those wear dresses.
//
// h hair, s skin, e eye, c shirt (or dress), d its shading, p trousers (or
// legs, under a dress), o outline, k shoes.

const LIGHT = ['#ffdbac', '#f6d1b0', '#f1c27d'];
const POC = ['#e0ac69', '#c68642', '#a0663a', '#8d5524', '#5c3a1e'];
const HAIR = ['#2b1b0e', '#6a4e23', '#d6b370', '#1c1c1c', '#a33b20', '#c9c9c9', '#e8c07d', '#7b3f00'];
const SHIRT = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#9b5de5', '#ffbe0b', '#06d6a0', '#ef476f', '#3a86ff', '#ffffff', '#8ecae6'];
const PANTS = ['#264653', '#3d405b', '#22223b', '#6b705c', '#14213d', '#4a6fa5', '#8a6d3b', '#5c4033', '#7d7d7d'];

// Side on, facing right: heel down, weight on (a bob), legs passing,
// pushing off, reaching for the next step.
const WALK = [
    [
      '......hhhhh.....',
      '.....hhhhhhh....',
      '....hhhhhhhh....',
      '....hhhhsss.....',
      '....hhsssess....',
      '....hhsssess....',
      '.....hssssss....',
      '......dsss......',
      '.....dcccd......',
      '....dcccccd.....',
      '....dcccccd.....',
      '...dccccccd.....',
      '...dccccccd.....',
      '..dccdcdccd.....',
      '..ssddccdss.....',
      '..ss.dcccdss....',
      '.ss..dccccdsss..',
      '.ss..dccccd.ss..',
      '.ss..oppppo.....',
      '.....oppppo.....',
      '.....oppppo.....',
      '.....oppppo.....',
      '....opppoppo....',
      '....oppopppo....',
      '...opppoopppo...',
      '...oppo..oppo...',
      '..oppo...oppo...',
      '.oppo.....oppo..',
      'ooop......oppo..',
      'oooo.......ooooo',
      '.oooo......ooooo',
      '..ooo......oo...',
    ],
    [
      '................',
      '......hhhhh.....',
      '.....hhhhhhh....',
      '....hhhhhhhh....',
      '....hhhhsss.....',
      '....hhsssess....',
      '....hhsssess....',
      '.....hssssss....',
      '......dsss......',
      '.....dcccd......',
      '....dcccccd.....',
      '....dcccccd.....',
      '....dccdccd.....',
      '....dccdccd.....',
      '....ssdcccd.....',
      '....sdccccd.....',
      '...ssdccccd.....',
      '...ssdccccds....',
      '...ssoppppos....',
      '...ssoppppos....',
      '......opppo.....',
      '......opppo.....',
      '......opppo.....',
      '.......oppo.....',
      '.....ooopppo....',
      '...oopppoppo....',
      '...ooppooppo....',
      '...oooo.opo.....',
      '...oo...opo.....',
      '...oo...ooo.....',
      '........oooo....',
      '........oooo....',
    ],
    [
      '......hhhhh.....',
      '.....hhhhhhh....',
      '....hhhhhhhh....',
      '....hhhhsss.....',
      '....hhsssess....',
      '....hhsssess....',
      '.....hssssss....',
      '......dsss......',
      '.....dcccd......',
      '....dcccccd.....',
      '....dcccccd.....',
      '...dccccccd.....',
      '...dccccccd.....',
      '...sccdcccd.....',
      '...ssdccccds....',
      '..ss.dccccdss...',
      '..ss.dccccdsss..',
      '..ss.oppppo.ss..',
      '..ss.oppppo.....',
      '.....oopppo.....',
      '.....oopppo.....',
      '.....oopppo.....',
      '.....opopppo....',
      '.....oppoppo....',
      '....opppooppo...',
      '...opppo.oppo...',
      '..opppo..oppo...',
      '.ooopo...oppo...',
      '.oooo....oppo...',
      '..oo.....ooooo..',
      '...o.....oooooo.',
      '................',
    ],
    [
      '......hhhhh.....',
      '.....hhhhhhh....',
      '....hhhhhhhh....',
      '....hhhhsss.....',
      '....hhsssess....',
      '....hhsssess....',
      '.....hssssss....',
      '......dss.......',
      '.....dcccd......',
      '.....dccdcd.....',
      '.....dccdcd.....',
      '.....dccdcd.....',
      '.....dccdcd.....',
      '....dddccdd.....',
      '....sdcdssd.....',
      '....sdcdsss.....',
      '....sdccdsss....',
      '....soppposs....',
      '.....oppppo.....',
      '.....oppoppo....',
      '.....oppoppo....',
      '.....oppoppo....',
      '.....oppopppo...',
      '.....oppooppo...',
      '....opppooppo...',
      '...opppo.oppo...',
      '..ooppo..oppo...',
      '..oooo...oooo...',
      '..ooo....ooooo..',
      '...oo...........',
      '...oo...........',
      '................',
    ],
    [
      '......hhhhh.....',
      '.....hhhhhhh....',
      '....hhhhhhhh....',
      '....hhhhsss.....',
      '....hhsssess....',
      '....hhsssess....',
      '.....hssssss....',
      '......dsss......',
      '.....dcccd......',
      '....dcccccd.....',
      '....dcccccd.....',
      '...dcccdccd.....',
      '...dcccdccd.....',
      '..dccdcdccd.....',
      '..ssddccdsd.....',
      '..ss.dccdss.....',
      '.ss..dcccdsss...',
      '.ss..dccccdsss..',
      '.ss..oppppo.ss..',
      '.....oppppo.....',
      '.....oppppo.....',
      '.....oppppo.....',
      '....opppoppo....',
      '....oppopppo....',
      '...opppoopppo...',
      '...oppo..oppo...',
      '..oppo...oppo...',
      '.oppo.....oppo..',
      'ooop......oppo..',
      'oooo.......ooooo',
      '.oooo......ooooo',
      '..ooo......ooo..',
    ],
];

const FRONT = {
  man: [
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....hhhhhhhh....',
    '....hssssssh....',
    '....ssessess....',
    '....ssessess....',
    '.....ssssss.....',
    '.......ss.......',
    '......dccd......',
    '....dccccccd....',
    '...dccccccccd...',
    '..sdccccccccds..',
    '..ssdccccccdss..',
    '..ssdccccccdss..',
    '..ssdccccccdss..',
    '..ssdccccccdss..',
    '..ssdccccccdss..',
    '..ss.oppppo.ss..',
    '....oppppppo....',
    '....oppppppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '...kkkk..kkkk...',
    '...kkkk..kkkk...',
  ],
  woman: [
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '...hhsssssshh...',
    '...hhsesseshh...',
    '...hhsesseshh...',
    '...hhhsssshhh...',
    '...hh..ss..hh...',
    '...hh.dccd.hh...',
    '....hdccccdh....',
    '....dccccccd....',
    '...sdccccccds...',
    '...ssccccccss...',
    '...ssdccccdss...',
    '...ssdccccdss...',
    '...ssdccccdss...',
    '...ssccccccss...',
    '...ssopppposs...',
    '....oppppppo....',
    '....oppppppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....oppooppo....',
    '....kkk..kkk....',
    '....kkk..kkk....',
  ],
  // (A dress: from the waist to the knee, then legs.)
  dress: [
    '...ssccccccss...',
    '...ssdccccdss...',
    '....dccccccd....',
    '....dccccccd....',
    '...dccccccccd...',
    '...dccccccccd...',
    '...dccccccccd...',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '....kkk..kkk....',
    '....kkk..kkk....',
  ],
};

export const WALK_FRAMES = ['walk0', 'walk1', 'walk2', 'walk3', 'walk4'];

export function lookOf(look) {
  const [a, b, c, d] = look;
  const woman = b % 2 === 1;
  const skin = a % 2 ? POC : LIGHT;
  return {
    s: skin[(a >> 1) % skin.length],
    h: HAIR[(b >> 1) % HAIR.length],
    c: SHIRT[c % SHIRT.length],
    p: PANTS[(d >> 1) % PANTS.length],
    woman,
    dress: woman && d % 2 === 0,
  };
}

// A colour, darker.
function shade(hex, k = 0.68) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// The rows for a pose, as a list of strings (built once and kept).
const cache = new Map();
function rowsFor(pose, woman, dress) {
  const key = `${pose}/${woman}/${dress}`;
  if (cache.has(key)) return cache.get(key);
  let rows;
  if (pose === 'stand') rows = woman ? FRONT.woman.slice(0, 16).concat(dress ? FRONT.dress : FRONT.woman.slice(16)) : FRONT.man;
  else {
    const walk = WALK_FRAMES.indexOf(pose);
    rows = WALK[walk >= 0 ? walk : 2].map((r) => r.split(''));
    const top = rows.findIndex((r) => r.some((ch) => ch !== '.'));
    if (walk < 0) {
      // Reaching for the button: the near arm out in front, at shoulder height.
      for (let r = top + 11; r < rows.length; r++) for (let i = 0; i < 16; i++) if (rows[r][i] === 's') rows[r][i] = '.';
      for (const r of [top + 10, top + 11]) for (let i = 10; i <= 14; i++) rows[r][i] = 's';
    }
    if (woman) {
      // Hair down the back of her neck.
      for (let r = top + 6; r <= top + 9; r++) for (const i of [4, 5]) if (rows[r][i] !== 's') rows[r][i] = 'h';
    }
    if (dress) {
      // A skirt over the hips and thighs (between the outer edges of the
      // legs), then bare legs.
      for (let r = top + 18; r <= top + 23; r++) {
        const legs = rows[r].map((ch, i) => (ch === 'p' || ch === 'o' ? i : -1)).filter((i) => i >= 0);
        if (!legs.length) continue;
        const [a, b] = [Math.min(...legs), Math.max(...legs)];
        for (let i = a; i <= b; i++) rows[r][i] = i === a || i === b ? 'd' : 'c';
      }
    }
    rows = rows.map((r) => r.join(''));
  }
  cache.set(key, rows);
  return rows;
}

// To the nearest screen pixel (so sprites stay crisp at any size).
const snap = (v) => {
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  return Math.round(v * dpr) / dpr;
};

// Draws a person with their feet at (x, base), 8 * px wide and 16 * px tall
// (each sprite pixel px / 2). pose: stand (facing you) | walk0..walk4 |
// press (reaching for the button), side on; dir -1 faces left.
export function drawSprite(ctx, look, x, base, px, pose = 'stand', dir = 1) {
  const L = lookOf(look);
  const u = px / 2;
  const rows = rowsFor(pose, L.woman, L.dress);
  const y0 = base - rows.length * u;
  const colour = { h: L.h, s: L.s, e: '#111', c: L.c, d: shade(L.c), p: L.dress ? L.s : L.p, o: '#1b1b1b', k: '#1b1b1b' };
  const flip = pose !== 'stand' && dir < 0;
  rows.forEach((row, r) => {
    for (let i = 0; i < 16; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      ctx.fillStyle = colour[ch];
      const col = flip ? 15 - i : i;
      const [x0, x1, y1, y2] = [x + col * u, x + (col + 1) * u, y0 + r * u, y0 + (r + 1) * u].map(snap);
      ctx.fillRect(x0, y1, x1 - x0, y2 - y1);
    }
  });
}
