// Benji's Town: the flat pictures that stand up facing you in the 3D town
// -- traffic lights, walk signals, speech bubbles and arrows. Each draws at
// (x, y) in pixels with s its size.

const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
};

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
