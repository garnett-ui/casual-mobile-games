// Card illustration for the arcade hub: the 15 puzzle on a wooden tray,
// one slide from solved -- the 15 about to slide home.

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#8a5a36');
  g.addColorStop(1, '#5e3b22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // The tray, and the tiles: 1 to 14 home, the gap, then 15.
  const gap = 3;
  const s = Math.min((H * 0.84 - gap * 3) / 4, (W * 0.6 - gap * 3) / 4);
  if (s <= 0) return rect; // (not laid out yet)
  const bw = s * 4 + gap * 3;
  const ox = (W - bw) / 2;
  const oy = (H - bw) / 2;
  ctx.fillStyle = '#2e241b';
  ctx.beginPath();
  ctx.roundRect(ox - 6, oy - 6, bw + 12, bw + 12, 10);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15];
  order.forEach((t, c) => {
    if (!t) return;
    const x = ox + (c % 4) * (s + gap) - (t === 15 ? s * 0.35 : 0);
    const y = oy + Math.floor(c / 4) * (s + gap);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 3, s, s, s * 0.1);
    ctx.fill();
    ctx.fillStyle = '#f4e4c1';
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, s * 0.1);
    ctx.fill();
    ctx.fillStyle = '#3b2a1a';
    ctx.font = `900 ${Math.round(s * 0.48)}px system-ui, sans-serif`;
    ctx.fillText(String(t), x + s / 2, y + s / 2 + 1);
  });
  return rect;
}
