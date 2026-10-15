// Top-down sprite drawing for Car Jam. Everything is vector-drawn on the
// canvas so the game needs no image assets and stays crisp at any size.
// All functions take a tile size T in pixels and draw centred at (0, 0) after
// the caller has translated/rotated the context.

export const CAR_COLORS = [
  '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b',
  '#9b5de5', '#00bbf9', '#f15bb5', '#8ac926', '#ff924c',
];

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Car facing +x. len in tiles (2 = car, 3 = truck).
export function drawCar(ctx, T, len, color, opts = {}) {
  const L = len * T - T * 0.2;
  const W = T * 0.74;
  const dark = shade(color, -0.35);
  const light = shade(color, 0.28);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  rrect(ctx, -L / 2 + T * 0.05, -W / 2 + T * 0.09, L, W, W * 0.32);
  ctx.fill();

  if (opts.glow) {
    ctx.save();
    ctx.shadowColor = '#fff7a1';
    ctx.shadowBlur = T * 0.6;
    ctx.fillStyle = '#fff7a1';
    rrect(ctx, -L / 2 - T * 0.08, -W / 2 - T * 0.08, L + T * 0.16, W + T * 0.16, W * 0.4);
    ctx.fill();
    ctx.restore();
  }

  if (len >= 3) return drawTruckBody(ctx, T, L, W, color, dark, light);

  // Body
  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, T * 0.04);
  rrect(ctx, -L / 2, -W / 2, L, W, W * 0.32);
  ctx.fill();
  ctx.stroke();

  // Bonnet highlight
  ctx.fillStyle = light;
  rrect(ctx, L * 0.2, -W * 0.3, L * 0.24, W * 0.6, W * 0.2);
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Windscreen (front), roof, rear window
  ctx.fillStyle = '#29334f';
  ctx.beginPath();
  ctx.moveTo(L * 0.17, -W * 0.38);
  ctx.lineTo(L * 0.05, -W * 0.33);
  ctx.lineTo(L * 0.05, W * 0.33);
  ctx.lineTo(L * 0.17, W * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = light;
  rrect(ctx, -L * 0.24, -W * 0.33, L * 0.29, W * 0.66, W * 0.12);
  ctx.fill();
  ctx.fillStyle = '#29334f';
  ctx.beginPath();
  ctx.moveTo(-L * 0.25, -W * 0.33);
  ctx.lineTo(-L * 0.34, -W * 0.36);
  ctx.lineTo(-L * 0.34, W * 0.36);
  ctx.lineTo(-L * 0.25, W * 0.33);
  ctx.closePath();
  ctx.fill();
  // Glass glint
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, T * 0.03);
  ctx.beginPath();
  ctx.moveTo(L * 0.13, -W * 0.25);
  ctx.lineTo(L * 0.09, -W * 0.05);
  ctx.stroke();

  // Mirrors
  ctx.fillStyle = dark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(L * 0.1, s * W * 0.52, T * 0.06, T * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawLights(ctx, T, L, W);
}

function drawTruckBody(ctx, T, L, W, color, dark, light) {
  const cab = L * 0.27;
  // Cargo box
  ctx.fillStyle = '#f4f1ea';
  ctx.strokeStyle = '#b9b2a3';
  ctx.lineWidth = Math.max(1, T * 0.04);
  rrect(ctx, -L / 2, -W / 2, L - cab - T * 0.06, W, W * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-L / 2 + T * 0.08, -W * 0.12, L - cab - T * 0.22, W * 0.24);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let k = 1; k < 5; k++) {
    const x = -L / 2 + ((L - cab) * k) / 5;
    ctx.beginPath();
    ctx.moveTo(x, -W / 2 + 2);
    ctx.lineTo(x, W / 2 - 2);
    ctx.stroke();
  }
  // Cab
  ctx.fillStyle = color;
  ctx.strokeStyle = dark;
  rrect(ctx, L / 2 - cab, -W / 2, cab, W, W * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#29334f';
  rrect(ctx, L / 2 - cab * 0.45, -W * 0.36, cab * 0.2, W * 0.72, T * 0.04);
  ctx.fill();
  ctx.fillStyle = light;
  rrect(ctx, L / 2 - cab * 0.95, -W * 0.34, cab * 0.45, W * 0.68, T * 0.06);
  ctx.fill();
  ctx.fillStyle = dark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(L / 2 - cab * 0.4, s * W * 0.54, T * 0.07, T * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawLights(ctx, T, L, W);
}

function drawLights(ctx, T, L, W) {
  ctx.fillStyle = '#fff4b8';
  for (const s of [-1, 1]) {
    rrect(ctx, L / 2 - T * 0.08, s * W * 0.3 - T * 0.06, T * 0.07, T * 0.12, T * 0.03);
    ctx.fill();
  }
  ctx.fillStyle = '#d7263d';
  for (const s of [-1, 1]) {
    rrect(ctx, -L / 2 + T * 0.01, s * W * 0.3 - T * 0.06, T * 0.06, T * 0.12, T * 0.03);
    ctx.fill();
  }
}

// Granny, drawn as a little upright character (not top-down) so she reads
// clearly at phone size. Feet at (0, 0.3T); faces +x. step: walk phase.
export function drawGranny(ctx, T, step, angry, coat = '#b388eb') {
  const u = T * 0.1; // ~10 units per tile
  const walk = Math.sin(step);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3 * u, 3.6 * u, 1.2 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs and shoes
  ctx.strokeStyle = '#e9c3a6';
  ctx.lineWidth = 0.9 * u;
  for (const k of [-1, 1]) {
    const fx = k * 0.9 * u + walk * k * 0.9 * u;
    ctx.beginPath();
    ctx.moveTo(k * 0.8 * u, 0.6 * u);
    ctx.lineTo(fx, 2.6 * u);
    ctx.stroke();
    ctx.fillStyle = '#5a3e36';
    ctx.beginPath();
    ctx.ellipse(fx + 0.4 * u, 2.9 * u, 0.9 * u, 0.5 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dress
  ctx.fillStyle = coat;
  ctx.strokeStyle = shade(coat, -0.35);
  ctx.lineWidth = Math.max(1, 0.35 * u);
  ctx.beginPath();
  ctx.moveTo(-1.7 * u, -3.6 * u);
  ctx.lineTo(1.7 * u, -3.6 * u);
  ctx.lineTo(2.8 * u, 1 * u);
  ctx.quadraticCurveTo(0, 1.6 * u, -2.8 * u, 1 * u);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Cardigan buttons
  ctx.fillStyle = '#fff';
  for (const y of [-2.6, -1.4, -0.2]) {
    ctx.beginPath();
    ctx.arc(0.5 * u, y * u, 0.28 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  // Handbag on the back arm
  ctx.strokeStyle = '#a61e4d';
  ctx.lineWidth = 0.35 * u;
  ctx.beginPath();
  ctx.arc(-2 * u, -1.6 * u, 0.9 * u, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#d6336c';
  rrect(ctx, -3.1 * u, -1.7 * u, 2.2 * u, 1.6 * u, 0.4 * u);
  ctx.fill();
  // Cane in the front hand; waved about when she's cross
  ctx.save();
  ctx.translate(2.2 * u, -1.8 * u);
  ctx.rotate(angry ? -1.2 + Math.sin(step * 2.5) * 0.6 : 0.08);
  ctx.strokeStyle = '#7b4a2a';
  ctx.lineWidth = 0.55 * u;
  ctx.beginPath();
  ctx.moveTo(0, 4.6 * u);
  ctx.lineTo(0, -0.4 * u);
  ctx.arc(-0.7 * u, -0.4 * u, 0.7 * u, 0, Math.PI, true);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#e9c3a6';
  ctx.beginPath();
  ctx.arc(2.2 * u, -1.8 * u, 0.6 * u, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = '#f2c9a5';
  ctx.beginPath();
  ctx.arc(0.3 * u, -5.4 * u, 2 * u, 0, Math.PI * 2);
  ctx.fill();
  // White curls and a bun
  ctx.fillStyle = '#eceef3';
  ctx.strokeStyle = '#c3c6d0';
  ctx.lineWidth = Math.max(1, 0.25 * u);
  ctx.beginPath();
  ctx.arc(0.3 * u, -5.9 * u, 2.1 * u, Math.PI * 0.95, Math.PI * 2.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const [x, y, r] of [[-1.6, -5.2, 0.8], [-0.4, -8, 1.2], [-1.3, -6.3, 0.8]]) {
    ctx.beginPath();
    ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Glasses and a rosy cheek
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(1, 0.25 * u);
  ctx.beginPath();
  ctx.arc(1.5 * u, -5.2 * u, 0.6 * u, 0, Math.PI * 2);
  ctx.moveTo(0.9 * u, -5.2 * u);
  ctx.lineTo(0.2 * u, -5.4 * u);
  ctx.stroke();
  ctx.fillStyle = 'rgba(240,110,110,0.45)';
  ctx.beginPath();
  ctx.arc(1.1 * u, -4.3 * u, 0.5 * u, 0, Math.PI * 2);
  ctx.fill();
  if (angry) {
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0.9 * u, -6.3 * u);
    ctx.lineTo(2.1 * u, -5.9 * u);
    ctx.stroke();
  }
}

export function drawBubble(ctx, T, text, color = '#e63946') {
  ctx.font = `bold ${Math.round(T * 0.32)}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + T * 0.24;
  const h = T * 0.42;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  rrect(ctx, -w / 2, -h - T * 0.12, w, h, h * 0.4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-T * 0.06, -T * 0.13);
  ctx.lineTo(0, -T * 0.02);
  ctx.lineTo(T * 0.06, -T * 0.13);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -h / 2 - T * 0.12);
}

export function drawObstacle(ctx, T, kind) {
  const s = T;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(s * 0.05, s * 0.07, s * 0.36, s * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === 'cone') {
    ctx.fillStyle = '#e8590c';
    rrect(ctx, -s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.1);
    ctx.fill();
    ctx.fillStyle = '#ff8c42';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb38a';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'tree') {
    ctx.fillStyle = '#8d5b3a';
    rrect(ctx, -s * 0.36, -s * 0.36, s * 0.72, s * 0.72, s * 0.08);
    ctx.fill();
    ctx.fillStyle = '#5b3a24';
    rrect(ctx, -s * 0.3, -s * 0.3, s * 0.6, s * 0.6, s * 0.05);
    ctx.fill();
    const blobs = [[-0.12, -0.1, 0.24], [0.13, -0.08, 0.22], [0, 0.13, 0.24], [0.02, -0.02, 0.2]];
    ctx.fillStyle = '#2d8a3e';
    for (const [x, y, r] of blobs) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#49b35c';
    for (const [x, y, r] of blobs) {
      ctx.beginPath();
      ctx.arc(x * s - r * s * 0.25, y * s - r * s * 0.25, r * s * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'barrier') {
    ctx.save();
    rrect(ctx, -s * 0.42, -s * 0.16, s * 0.84, s * 0.32, s * 0.06);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.fillStyle = '#e63946';
    for (let k = -4; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(k * s * 0.22, -s * 0.2);
      ctx.lineTo(k * s * 0.22 + s * 0.11, -s * 0.2);
      ctx.lineTo(k * s * 0.22 + s * 0.22, s * 0.2);
      ctx.lineTo(k * s * 0.22 + s * 0.11, s * 0.2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#9d0208';
    ctx.lineWidth = Math.max(1, s * 0.03);
    rrect(ctx, -s * 0.42, -s * 0.16, s * 0.84, s * 0.32, s * 0.06);
    ctx.stroke();
  } else {
    // bollard
    ctx.fillStyle = '#f4c20d';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe270';
    ctx.beginPath();
    ctx.arc(-s * 0.05, -s * 0.05, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}
