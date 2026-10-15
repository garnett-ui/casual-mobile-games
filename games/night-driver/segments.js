// Seven-segment LED digits, drawn as slanted hexagonal bars.
const DIGITS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg',
  6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
};

// Draw `text` (digits, '-' or ' ') with its top-left at (x, y), digits h tall.
// Returns the width used. Unlit segments show faintly, like a real display.
export function drawDigits(ctx, text, x, y, h, on = '#ff3b2f', off = 'rgba(255,59,47,0.09)') {
  const w = h * 0.52;
  const gap = h * 0.2;
  const t = h * 0.13;
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, -0.08, 1, h * 0.08, 0); // a slight italic slant
  for (let i = 0; i < text.length; i++) {
    const lit = DIGITS[text[i]] ?? '';
    const ox = i * (w + gap);
    for (const seg of 'abcdefg') {
      ctx.fillStyle = lit.includes(seg) ? on : off;
      ctx.shadowColor = lit.includes(seg) ? on : 'transparent';
      ctx.shadowBlur = lit.includes(seg) ? h * 0.25 : 0;
      bar(ctx, seg, ox, w, h, t);
    }
  }
  ctx.restore();
  return text.length * (w + gap) - gap;
}

function bar(ctx, seg, ox, w, h, t) {
  const g = t * 0.25; // the gap between segments
  const m = h / 2;
  const H = (x0, x1, y) => [[x0, y], [x0 + t / 2, y - t / 2], [x1 - t / 2, y - t / 2], [x1, y], [x1 - t / 2, y + t / 2], [x0 + t / 2, y + t / 2]];
  const V = (x, y0, y1) => [[x, y0], [x + t / 2, y0 + t / 2], [x + t / 2, y1 - t / 2], [x, y1], [x - t / 2, y1 - t / 2], [x - t / 2, y0 + t / 2]];
  const l = ox + t / 2;
  const r = ox + w - t / 2;
  const pts = {
    a: H(l + g, r - g, t / 2),
    b: V(r, t / 2 + g, m - g),
    c: V(r, m + g, h - t / 2 - g),
    d: H(l + g, r - g, h - t / 2),
    e: V(l, m + g, h - t / 2 - g),
    f: V(l, t / 2 + g, m - g),
    g: H(l + g, r - g, m),
  }[seg];
  ctx.beginPath();
  pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
}

export function digitsWidth(n, h) {
  return n * h * 0.52 + (n - 1) * h * 0.2;
}
