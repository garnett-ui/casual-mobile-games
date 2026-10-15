// Built-in pictures, painted in code, so there's something to play before
// you add your own photos.
import { rng } from '../../js/lib/random.js';

export const SAMPLES = [
  { id: 'sample:lake', title: 'Mountain lake', paint: paintLake },
  { id: 'sample:balloons', title: 'Balloon festival', paint: paintBalloons },
];

export function sampleImage(id, w = 1600, h = 1200) {
  const s = SAMPLES.find((x) => x.id === id);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  s.paint(c.getContext('2d'), w, h);
  return c;
}

function paintLake(ctx, W, H) {
  const r = rng(11);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, '#2b2d6e');
  sky.addColorStop(0.5, '#e86a5f');
  sky.addColorStop(1, '#ffc46b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(W * 0.68, H * 0.42, H * 0.09, 0, Math.PI * 2);
  ctx.fill();
  const ridge = (base, amp, color, seed) => {
    const rr = rng(seed);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    let y = base;
    for (let x = 0; x <= W; x += W / 40) {
      y = Math.max(H * 0.2, Math.min(H * 0.6, y + (rr() - 0.5) * amp));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  };
  ridge(H * 0.4, H * 0.12, '#6c4f8a', 3);
  ridge(H * 0.48, H * 0.1, '#46356b', 5);
  ridge(H * 0.55, H * 0.06, '#23304a', 7);
  // Lake with reflections
  const lake = ctx.createLinearGradient(0, H * 0.6, 0, H);
  lake.addColorStop(0, '#f2a46b');
  lake.addColorStop(0.4, '#5a6fa8');
  lake.addColorStop(1, '#1a2340');
  ctx.fillStyle = lake;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  ctx.strokeStyle = 'rgba(255,240,200,0.5)';
  for (let k = 0; k < 40; k++) {
    const y = H * 0.62 + r() * H * 0.3;
    const x = W * 0.68 + (r() - 0.5) * W * 0.25 * (1 - (y - H * 0.6) / H);
    ctx.lineWidth = 2 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(x - 30 - r() * 40, y);
    ctx.lineTo(x + 30 + r() * 40, y);
    ctx.stroke();
  }
  // Pine trees on the shore
  for (let k = 0; k < 26; k++) {
    const x = r() * W;
    const s = H * (0.06 + r() * 0.08);
    const y = H * 0.62;
    ctx.fillStyle = r() < 0.5 ? '#13241c' : '#1c3326';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x - s * 0.3, y);
    ctx.lineTo(x + s * 0.3, y);
    ctx.fill();
  }
  // A canoe
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.ellipse(W * 0.3, H * 0.8, W * 0.07, H * 0.012, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintBalloons(ctx, W, H) {
  const r = rng(21);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5ec8f2');
  sky.addColorStop(1, '#d9f3ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 9; k++) {
    const x = r() * W;
    const y = r() * H * 0.6;
    for (let j = 0; j < 5; j++) {
      ctx.beginPath();
      ctx.arc(x + j * W * 0.025, y + Math.sin(j) * 10, H * (0.03 + r() * 0.03), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Rolling green hills and fields
  const hills = ['#7bc86c', '#5bab52', '#3f8f45'];
  hills.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H * (0.72 + i * 0.08) + Math.sin(x / (W * 0.12) + i * 2) * H * 0.04);
    ctx.lineTo(W, H);
    ctx.fill();
  });
  const colors = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5', '#f15bb5'];
  for (let k = 0; k < 12; k++) {
    const x = W * (0.06 + r() * 0.88);
    const y = H * (0.12 + r() * 0.5);
    const s = H * (0.04 + r() * 0.07);
    const c1 = colors[k % colors.length];
    const c2 = colors[(k + 3) % colors.length];
    // Envelope with stripes
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.85, s, 0, 0, Math.PI * 2);
    ctx.clip();
    for (let j = -4; j <= 4; j++) {
      ctx.fillStyle = j % 2 ? c1 : c2;
      ctx.fillRect(x + j * s * 0.22 - s * 0.11, y - s, s * 0.22, s * 2);
    }
    const shade = ctx.createRadialGradient(x - s * 0.3, y - s * 0.4, s * 0.1, x, y, s);
    shade.addColorStop(0, 'rgba(255,255,255,0.35)');
    shade.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
    ctx.restore();
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.35, y + s * 0.92);
    ctx.lineTo(x - s * 0.15, y + s * 1.3);
    ctx.moveTo(x + s * 0.35, y + s * 0.92);
    ctx.lineTo(x + s * 0.15, y + s * 1.3);
    ctx.stroke();
    ctx.fillStyle = '#8d5b3a';
    ctx.fillRect(x - s * 0.16, y + s * 1.3, s * 0.32, s * 0.22);
  }
}
