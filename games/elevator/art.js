// Card illustration for the arcade hub: a tower in profile with two lift
// shafts, a car with its doors open, lit floors and people waiting.
export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5a9bd8');
  sky.addColorStop(1, '#cfe6fa');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const floors = 7;
  const bx = W * 0.12;
  const bw = W * 0.76;
  const rowH = (H - 14) / floors;
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(bx, 8, bw, rowH * floors);
  const sw = bw * 0.2;
  const shafts = [bx + bw - 2 * sw - 10, bx + bw - sw - 4];
  for (let f = 0; f < floors; f++) {
    const y = 8 + f * rowH;
    ctx.fillStyle = '#b7a684';
    ctx.fillRect(bx, y + rowH - 1.5, bw, 1.5);
  }
  shafts.forEach((x, i) => {
    ctx.fillStyle = '#3b3f4a';
    ctx.fillRect(x, 8, sw, rowH * floors);
    // Lit floors with a check.
    for (const f of i ? [1, 4] : [2]) {
      ctx.fillStyle = 'rgba(255,200,60,0.35)';
      ctx.fillRect(x + 2, 8 + f * rowH + 2, sw - 4, rowH - 4);
      ctx.fillStyle = '#ffd23f';
      ctx.font = `800 ${rowH * 0.55}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', x + sw / 2, 8 + f * rowH + rowH / 2);
    }
    // The car.
    const cy = 8 + (i ? 5.4 : 3) * rowH;
    ctx.fillStyle = '#d9dde4';
    ctx.fillRect(x + 3, cy + 1, sw - 6, rowH - 3);
    ctx.fillStyle = '#fff6dd';
    ctx.fillRect(x + 5, cy + 3, sw - 10, rowH - 6);
    const open = i ? 0.15 : 0.8;
    const half = (sw - 10) / 2;
    ctx.fillStyle = '#9aa3b2';
    ctx.fillRect(x + 5, cy + 3, half * (1 - open), rowH - 6);
    ctx.fillRect(x + 5 + half + half * open, cy + 3, half * (1 - open), rowH - 6);
  });
  // People waiting.
  const people = [[3, 3], [5, 2], [6, 4], [0, 1]];
  for (const [f, n] of people) {
    for (let k = 0; k < n; k++) {
      const x = shafts[0] - 10 - k * 9;
      const base = 8 + f * rowH + rowH - 2;
      ctx.fillStyle = `hsl(${120 - k * 35 - f * 8} 70% 45%)`;
      ctx.beginPath();
      ctx.arc(x + 3, base - rowH * 0.62, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x, base - rowH * 0.48, 6, rowH * 0.48);
    }
  }
  return rect;
}
