// Benji's Town: drawing the town -- bright, simple shapes, big enough for
// small fingers. Every function draws at (x, y) in pixels with s the size of
// a tile.

const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
};

export function grass(g, w, h) {
  g.fillStyle = '#8fd16a';
  g.fillRect(0, 0, w, h);
}

// The streets: grey, with a sidewalk down each side, a dashed white line
// down the middle, and by the intersections (junctions: their tiles) zebra
// crossings (crossings: { ix, iy, arm }), each with a stop line before it.
export function streets(g, s, size, isRoad, junctions = [], crossings = []) {
  const walk = 0.18; // the sidewalk's width
  g.fillStyle = '#9aa0a8'; // the curb
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) if (isRoad(x, y)) g.fillRect((x - walk) * s, (y - walk) * s, s * (1 + 2 * walk), s * (1 + 2 * walk));
  }
  g.fillStyle = '#dcdfe4'; // the sidewalk
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) if (isRoad(x, y)) g.fillRect((x - walk + 0.02) * s, (y - walk + 0.02) * s, s * (1 + 2 * walk - 0.04), s * (1 + 2 * walk - 0.04));
  }
  g.fillStyle = '#5d6470';
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) if (isRoad(x, y)) g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
  }
  const isJunction = (x, y) => junctions.some((j) => j.x === x && j.y === y);
  // The middle line: along each street, stopping short of the intersections.
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = Math.max(1.5, s * 0.05);
  g.setLineDash([s * 0.18, s * 0.14]);
  g.beginPath();
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (!isRoad(x, y) || isJunction(x, y)) continue;
      const ns = isRoad(x, y - 1) || isRoad(x, y + 1);
      const a = (ns ? isJunction(x, y - 1) : isJunction(x - 1, y)) ? 0.44 : 0;
      const b = (ns ? isJunction(x, y + 1) : isJunction(x + 1, y)) ? 0.56 : 1;
      if (ns) {
        g.moveTo((x + 0.5) * s, (y + a) * s);
        g.lineTo((x + 0.5) * s, (y + b) * s);
      } else {
        g.moveTo((x + a) * s, (y + 0.5) * s);
        g.lineTo((x + b) * s, (y + 0.5) * s);
      }
    }
  }
  g.stroke();
  g.setLineDash([]);
  // The crossings: white stripes across each arm, and the stop line (across
  // the lane coming in).
  g.fillStyle = '#f8f9fa';
  const t = s * 0.05;
  for (const { ix: x, iy: y, arm } of crossings) {
    for (let k = 0; k < 5; k++) {
      const o = 0.06 + k * 0.2;
      if (arm === 'n') g.fillRect((x + o) * s, (y - 0.4) * s, s * 0.1, s * 0.3);
      if (arm === 's') g.fillRect((x + o) * s, (y + 1.1) * s, s * 0.1, s * 0.3);
      if (arm === 'w') g.fillRect((x - 0.4) * s, (y + o) * s, s * 0.3, s * 0.1);
      if (arm === 'e') g.fillRect((x + 1.1) * s, (y + o) * s, s * 0.3, s * 0.1);
    }
    if (arm === 'n') g.fillRect(x * s, (y - 0.44) * s - t, s * 0.5, t);
    if (arm === 's') g.fillRect((x + 0.5) * s, (y + 1.44) * s, s * 0.5, t);
    if (arm === 'w') g.fillRect((x - 0.44) * s - t, (y + 0.5) * s, t, s * 0.5);
    if (arm === 'e') g.fillRect((x + 1.44) * s, y * s, t, s * 0.5);
  }
}

// A traffic light: red, yellow and green, one of them lit.
export function signal(g, x, y, s, colour) {
  const w = s * 0.17;
  const h = s * 0.42;
  g.fillStyle = '#555';
  g.fillRect(x - s * 0.02, y + h / 2, s * 0.04, s * 0.1);
  g.fillStyle = '#222';
  rr(g, x - w / 2, y - h / 2, w, h, w * 0.3);
  g.fill();
  const lamps = [['red', '#ff3b30', '#5a1e1b'], ['yellow', '#ffcc00', '#5a4a12'], ['green', '#34e05c', '#1d4a27']];
  lamps.forEach(([name, on, off], k) => {
    g.fillStyle = name === colour ? on : off;
    g.beginPath();
    g.arc(x, y - h / 2 + h * (0.18 + k * 0.32), w * 0.32, 0, Math.PI * 2);
    g.fill();
  });
}

// A walk signal: the little walking man (walk), or the red hand (stop;
// blinking when it's about to change).
export function walkSign(g, x, y, s, sign, t) {
  const b = s * 0.2;
  g.fillStyle = '#222';
  rr(g, x - b / 2, y - b / 2, b, b, b * 0.2);
  g.fill();
  if (sign === 'walk') {
    g.strokeStyle = '#7dffa0';
    g.fillStyle = '#7dffa0';
    g.lineWidth = b * 0.12;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(x + b * 0.04, y - b * 0.27, b * 0.09, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x, y - b * 0.15);
    g.lineTo(x - b * 0.04, y + b * 0.08);
    g.lineTo(x - b * 0.2, y + b * 0.32);
    g.moveTo(x - b * 0.04, y + b * 0.08);
    g.lineTo(x + b * 0.16, y + b * 0.32);
    g.moveTo(x - b * 0.2, y - b * 0.02);
    g.lineTo(x, y - b * 0.12);
    g.lineTo(x + b * 0.2, y);
    g.stroke();
    return;
  }
  if (sign === 'flash' && Math.floor(t * 3) % 2) return;
  g.fillStyle = '#ff5a3c';
  rr(g, x - b * 0.22, y - b * 0.08, b * 0.4, b * 0.36, b * 0.1);
  g.fill();
  for (let k = 0; k < 4; k++) g.fillRect(x - b * 0.22 + k * b * 0.1, y - b * 0.3, b * 0.07, b * 0.26);
}

export function tree(g, x, y, s) {
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.beginPath();
  g.ellipse(x + s * 0.06, y + s * 0.08, s * 0.3, s * 0.26, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2d9b4e';
  g.beginPath();
  g.arc(x, y, s * 0.28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4fbf6a';
  g.beginPath();
  g.arc(x - s * 0.08, y - s * 0.08, s * 0.14, 0, Math.PI * 2);
  g.fill();
}

// A house, front on: walls, a pitched roof, a door and a window. stage
// (building it): 1 the slab, 2 the walls, 3 the roof (done).
export function house(g, x, y, s, color, stage = 3) {
  const w = s * 0.74;
  const left = x - w / 2;
  const base = y + s * 0.36;
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(left + s * 0.05, base - s * 0.02, w, s * 0.08);
  g.fillStyle = '#9a9a9a';
  g.fillRect(left - s * 0.04, base - s * 0.1, w + s * 0.08, s * 0.12);
  if (stage < 2) {
    // (Just the slab, and the first bricks of the walls.)
    g.fillStyle = color;
    g.fillRect(left, base - s * 0.22, w, s * 0.12);
    return;
  }
  const wallTop = y - s * 0.06;
  g.fillStyle = color;
  g.fillRect(left, wallTop, w, base - wallTop - s * 0.05);
  g.fillStyle = '#6b4226';
  rr(g, x - s * 0.08, base - s * 0.27, s * 0.16, s * 0.22, s * 0.04);
  g.fill();
  g.fillStyle = '#e8f6ff';
  g.fillRect(left + s * 0.08, wallTop + s * 0.08, s * 0.14, s * 0.12);
  g.fillRect(left + w - s * 0.22, wallTop + s * 0.08, s * 0.14, s * 0.12);
  if (stage < 3) return;
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.moveTo(left - s * 0.08, wallTop + s * 0.02);
  g.lineTo(x, y - s * 0.38);
  g.lineTo(left + w + s * 0.08, wallTop + s * 0.02);
  g.closePath();
  g.fill();
}

// A building with a sign: post office, shop, cafe.
function building(g, x, y, s, wall, roof, sign) {
  const w = s * 0.82;
  const left = x - w / 2;
  const top = y - s * 0.24;
  const base = y + s * 0.36;
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(left + s * 0.05, base - s * 0.02, w, s * 0.08);
  g.fillStyle = wall;
  g.fillRect(left, top, w, base - top);
  g.fillStyle = roof;
  g.fillRect(left - s * 0.05, top - s * 0.12, w + s * 0.1, s * 0.14);
  g.fillStyle = '#6b4226';
  g.fillRect(x - s * 0.09, base - s * 0.24, s * 0.18, s * 0.24);
  g.font = `${Math.round(s * 0.3)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(sign, x, top + s * 0.17);
}

export const post = (g, x, y, s) => building(g, x, y, s, '#e63946', '#8d1b26', '✉️');
export const shop = (g, x, y, s) => building(g, x, y, s, '#ffd166', '#e09f3e', '🍎');
export const cafe = (g, x, y, s) => building(g, x, y, s, '#f4a261', '#9c6644', '🍦');

// The dump: a fenced yard with a heap and a recycling sign.
export function dump(g, x, y, s) {
  g.fillStyle = '#a98467';
  rr(g, x - s * 0.42, y - s * 0.38, s * 0.84, s * 0.76, s * 0.08);
  g.fill();
  g.fillStyle = '#6c584c';
  g.beginPath();
  g.ellipse(x, y + s * 0.1, s * 0.3, s * 0.18, 0, Math.PI, 0);
  g.fill();
  g.font = `${Math.round(s * 0.34)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('♻️', x, y - s * 0.12);
}

// The builders' yard: sand, cones and a pile of bricks.
export function yard(g, x, y, s) {
  g.fillStyle = '#e9c46a';
  rr(g, x - s * 0.42, y - s * 0.38, s * 0.84, s * 0.76, s * 0.08);
  g.fill();
  g.fillStyle = '#bc4749';
  for (let k = 0; k < 3; k++) g.fillRect(x - s * 0.3 + k * s * 0.08, y + s * 0.05 - k * s * 0.07, s * 0.24, s * 0.07);
  g.font = `${Math.round(s * 0.3)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🚧', x + s * 0.18, y - s * 0.16);
}

// A lot to build on: earth and a sign.
export function lot(g, x, y, s) {
  g.fillStyle = '#c8a27a';
  rr(g, x - s * 0.4, y - s * 0.36, s * 0.8, s * 0.72, s * 0.06);
  g.fill();
  g.strokeStyle = '#ff9f1c';
  g.lineWidth = s * 0.04;
  g.setLineDash([s * 0.08, s * 0.06]);
  g.stroke();
  g.setLineDash([]);
}

// The park: grass, a pond, trees and a bench.
export function park(g, x, y, w, h, s) {
  g.fillStyle = '#6cc04a';
  rr(g, x + s * 0.06, y + s * 0.06, w - s * 0.12, h - s * 0.12, s * 0.2);
  g.fill();
  g.fillStyle = '#4cc9f0';
  g.beginPath();
  g.ellipse(x + w * 0.62, y + h * 0.6, w * 0.2, h * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  tree(g, x + w * 0.25, y + h * 0.28, s * 0.9);
  tree(g, x + w * 0.72, y + h * 0.25, s * 0.8);
  tree(g, x + w * 0.25, y + h * 0.75, s * 0.7);
  g.fillStyle = '#8d5524';
  g.fillRect(x + w * 0.42, y + h * 0.42, w * 0.18, h * 0.04);
}

// A wheelie bin, out for collection.
export function bin(g, x, y, s) {
  g.fillStyle = '#2a9d8f';
  rr(g, x - s * 0.09, y - s * 0.12, s * 0.18, s * 0.22, s * 0.03);
  g.fill();
  g.fillStyle = '#21867a';
  g.fillRect(x - s * 0.11, y - s * 0.15, s * 0.22, s * 0.05);
}

// A speech bubble with a picture in it (what a place is waiting for).
export function bubble(g, x, y, s, icon, bob = 0) {
  const by = y - s * 0.62 + bob;
  g.fillStyle = '#fff';
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(x, by, s * 0.3, s * 0.25, 0, 0, Math.PI * 2);
  g.moveTo(x - s * 0.06, by + s * 0.22);
  g.lineTo(x, by + s * 0.36);
  g.lineTo(x + s * 0.08, by + s * 0.22);
  g.fill();
  g.stroke();
  g.font = `${Math.round(s * 0.32)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, x, by + 1);
}

// A bouncing arrow pointing down at a place: go here!
export function arrow(g, x, y, s, color, bob) {
  const ty = y - s * 0.55 + bob;
  g.fillStyle = color;
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x, ty + s * 0.18);
  g.lineTo(x - s * 0.2, ty - s * 0.06);
  g.lineTo(x - s * 0.08, ty - s * 0.06);
  g.lineTo(x - s * 0.08, ty - s * 0.32);
  g.lineTo(x + s * 0.08, ty - s * 0.32);
  g.lineTo(x + s * 0.08, ty - s * 0.06);
  g.lineTo(x + s * 0.2, ty - s * 0.06);
  g.closePath();
  g.stroke();
  g.fill();
}

const wheel = (g, x, y, r) => {
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#bbb';
  g.beginPath();
  g.arc(x, y, r * 0.45, 0, Math.PI * 2);
  g.fill();
};

// A vehicle, side on, facing right (face -1: left): the garbage truck, the
// mail van, the cement mixer (its drum turning with t), or a little car.
export function vehicle(g, kind, x, y, s, face = 1, t = 0, color = '#ef476f') {
  g.save();
  g.translate(x, y);
  g.scale(face, 1);
  const u = s * 0.5; // half a tile
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(0, u * 0.42, u * 0.95, u * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  if (kind === 'car') {
    g.fillStyle = color;
    rr(g, -u * 0.7, -u * 0.12, u * 1.4, u * 0.42, u * 0.12);
    g.fill();
    rr(g, -u * 0.38, -u * 0.42, u * 0.76, u * 0.36, u * 0.14);
    g.fill();
    g.fillStyle = '#cdeffd';
    g.fillRect(-u * 0.3, -u * 0.36, u * 0.26, u * 0.22);
    g.fillRect(u * 0.04, -u * 0.36, u * 0.26, u * 0.22);
    wheel(g, -u * 0.42, u * 0.3, u * 0.15);
    wheel(g, u * 0.42, u * 0.3, u * 0.15);
    g.restore();
    return;
  }
  const body = { garbage: '#2a9d8f', mail: '#f1faee', mixer: '#ff9f1c' }[kind];
  const cab = { garbage: '#e9c46a', mail: '#e63946', mixer: '#ffd166' }[kind];
  // The cab, at the front (right).
  g.fillStyle = cab;
  rr(g, u * 0.35, -u * 0.5, u * 0.55, u * 0.8, u * 0.12);
  g.fill();
  g.fillStyle = '#cdeffd';
  g.fillRect(u * 0.55, -u * 0.4, u * 0.28, u * 0.26);
  // The back.
  if (kind === 'mixer') {
    g.fillStyle = '#6c757d';
    g.fillRect(-u * 0.9, u * 0.05, u * 1.3, u * 0.22);
    g.save();
    g.translate(-u * 0.25, -u * 0.18);
    g.rotate(-0.25);
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0, u * 0.62, u * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = u * 0.08;
    for (let k = 0; k < 3; k++) {
      const p = ((t * 1.5 + k / 3) % 1) * 1.2 - 0.6;
      g.beginPath();
      g.moveTo(u * p, -u * 0.32);
      g.lineTo(u * (p + 0.2), u * 0.32);
      g.stroke();
    }
    g.restore();
  } else {
    g.fillStyle = body;
    rr(g, -u * 0.92, -u * 0.6, u * 1.25, u * 0.9, u * 0.1);
    g.fill();
    if (kind === 'garbage') {
      g.fillStyle = '#21867a';
      for (let k = 0; k < 3; k++) g.fillRect(-u * 0.8 + k * u * 0.38, -u * 0.48, u * 0.06, u * 0.66);
    } else {
      g.font = `${Math.round(u * 0.6)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('✉️', -u * 0.28, -u * 0.15);
    }
  }
  wheel(g, -u * 0.55, u * 0.32, u * 0.2);
  wheel(g, u * 0.55, u * 0.32, u * 0.2);
  g.restore();
}

// Someone out walking (with the dog, when they have it).
export function walker(g, x, y, s, face, color, dog, t) {
  g.save();
  g.translate(x, y);
  g.scale(face, 1);
  const u = s * 0.5;
  const step = Math.sin(t * 10) * u * 0.08;
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.beginPath();
  g.ellipse(0, u * 0.45, u * 0.6, u * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  // The person.
  g.strokeStyle = '#3d405b';
  g.lineWidth = u * 0.12;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-u * 0.12, u * 0.05);
  g.lineTo(-u * 0.12 - step, u * 0.42);
  g.moveTo(-u * 0.12, u * 0.05);
  g.lineTo(-u * 0.12 + step, u * 0.42);
  g.stroke();
  g.fillStyle = color;
  rr(g, -u * 0.3, -u * 0.38, u * 0.36, u * 0.48, u * 0.12);
  g.fill();
  g.fillStyle = '#f1c27d';
  g.beginPath();
  g.arc(-u * 0.12, -u * 0.55, u * 0.2, 0, Math.PI * 2);
  g.fill();
  if (dog) {
    // The lead, and the dog trotting ahead.
    g.strokeStyle = '#e63946';
    g.lineWidth = u * 0.04;
    g.beginPath();
    g.moveTo(u * 0.05, -u * 0.1);
    g.lineTo(u * 0.45, u * 0.1);
    g.stroke();
    g.fillStyle = '#a0522d';
    rr(g, u * 0.35, u * 0.08 + step * 0.5, u * 0.45, u * 0.2, u * 0.08);
    g.fill();
    g.beginPath();
    g.arc(u * 0.82, u * 0.05 + step * 0.5, u * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5c2e0e';
    g.beginPath();
    g.ellipse(u * 0.8, u * -0.04 + step * 0.5, u * 0.05, u * 0.09, 0.4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#a0522d';
    g.lineWidth = u * 0.06;
    g.beginPath();
    g.moveTo(u * 0.36, u * 0.12);
    g.lineTo(u * 0.26, u * -0.02 + Math.sin(t * 16) * u * 0.05);
    g.stroke();
  }
  g.restore();
}
