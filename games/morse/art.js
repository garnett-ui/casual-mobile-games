// Card illustration for the arcade hub: a cloud of Scrabble-like letter
// tiles drifting on green felt, and the code for one of them sounding
// (heard, never shown).

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, '#16553f');
  g.addColorStop(1, '#0a2a20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const s = Math.min(H * 0.26, W / 8);
  // Listening: rings round the middle.
  ctx.strokeStyle = 'rgba(255,214,90,0.25)';
  ctx.lineWidth = 3;
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, s * 0.6 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tile = (x, y, ch, tilt) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.roundRect(-s / 2 + 2, -s / 2 + 5, s, s, s * 0.14);
    ctx.fill();
    ctx.fillStyle = '#b8955c';
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2 + 3, s, s, s * 0.14);
    ctx.fill();
    ctx.fillStyle = '#f4e4c1';
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s - 2, s * 0.14);
    ctx.fill();
    ctx.fillStyle = '#3b2a1a';
    ctx.font = `900 ${Math.round(s * 0.56)}px system-ui, sans-serif`;
    ctx.fillText(ch, 0, 1);
    ctx.restore();
  };
  const cloud = [[0.1, 0.25, 'E', -0.1], [0.24, 0.7, 'N', 0.08], [0.33, 0.28, 'T', 0.05], [0.67, 0.25, 'I', -0.06], [0.78, 0.68, 'A', 0.1], [0.9, 0.3, 'N', -0.08], [0.55, 0.78, 'E', 0.04], [0.42, 0.8, 'A', -0.12], [0.06, 0.72, 'I', 0.06], [0.95, 0.75, 'T', -0.05]];
  for (const [fx, fy, ch, tilt] of cloud) tile(fx * W, fy * H, ch, tilt);
  return rect;
}
