// Card illustration for the arcade hub: the lift operator at the controls
// of an art-deco lift, doors open onto a marble lobby, the floor dial above
// and the call buttons alongside.

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const floorY = H * 0.9;
  // The lobby: warm marble, deco pilasters, a checked floor.
  const wall = ctx.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, '#3d2a3f');
  wall.addColorStop(1, '#6b4a55');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, floorY);
  for (let x = W * 0.06; x < W; x += W * 0.16) {
    ctx.fillStyle = 'rgba(255,220,160,0.08)';
    ctx.fillRect(x, 0, W * 0.035, floorY);
    ctx.fillStyle = 'rgba(255,220,160,0.14)';
    ctx.fillRect(x + W * 0.012, 0, W * 0.01, floorY);
  }
  const tile = H * 0.05;
  for (let x = 0, k = 0; x < W; x += tile, k++) {
    ctx.fillStyle = k % 2 ? '#e8dcc4' : '#2b2230';
    ctx.fillRect(x, floorY, tile, H - floorY);
  }
  // The lift: an opening in a brass frame, stepped at the top.
  const dh = H * 0.6; // door height
  const dw = Math.min(W * 0.36, dh * 0.95);
  const dx = W / 2 - dw / 2;
  const dy = floorY - dh;
  const brass = (x, y, w, h) => {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, '#9c7a2e');
    g.addColorStop(0.5, '#f1d27a');
    g.addColorStop(1, '#9c7a2e');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };
  const fr = Math.max(4, dw * 0.06);
  brass(dx - fr, dy - fr, dw + 2 * fr, dh + fr);
  for (let k = 1; k <= 2; k++) brass(dx - fr + k * fr * 0.9, dy - fr - k * fr * 0.8, dw + 2 * fr - 2 * k * fr * 0.9, fr * 0.8);
  // Inside: wood panelling, lit from above.
  const wood = ctx.createLinearGradient(0, dy, 0, floorY);
  wood.addColorStop(0, '#d79b5a');
  wood.addColorStop(1, '#7a4526');
  ctx.fillStyle = wood;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = 'rgba(80,40,15,0.35)';
  ctx.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    ctx.strokeRect(dx + (dw / 4) * (k - 1) + 4, dy + dh * 0.1, dw / 4 - 8, dh * 0.45);
  }
  const glow = ctx.createRadialGradient(W / 2, dy, 2, W / 2, dy, dh * 0.8);
  glow.addColorStop(0, 'rgba(255,240,190,0.6)');
  glow.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = '#c9a54b'; // the handrail
  ctx.fillRect(dx, dy + dh * 0.6, dw, Math.max(2, dh * 0.025));
  // The control: a brass wheel with its handle, on the right-hand wall.
  const cx = dx + dw * 0.8;
  const cy = dy + dh * 0.5;
  const cr = dw * 0.07;
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(cx - cr * 1.2, cy - cr * 1.6, cr * 2.4, cr * 3.2);
  ctx.strokeStyle = '#f1d27a';
  ctx.lineWidth = Math.max(1.5, cr * 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - cr * 1.6, cy - cr * 0.9);
  ctx.stroke();
  // The folding gate, pushed back to the left.
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.strokeStyle = '#b8923f';
  ctx.lineWidth = 1.5;
  const gw = dw * 0.14;
  for (let y = dy; y < floorY - 1; y += gw * 0.9) {
    ctx.beginPath();
    ctx.moveTo(dx, y);
    ctx.lineTo(dx + gw, y + gw * 0.9);
    ctx.moveTo(dx + gw, y);
    ctx.lineTo(dx, y + gw * 0.9);
    ctx.stroke();
  }
  ctx.restore();
  // The operator, hand on the control.
  operator(ctx, dx + dw * 0.42, floorY, dh * 0.84, cx - cr * 1.6, cy - cr * 0.9);
  // The floor dial over the doors.
  const rx = W / 2;
  const ry = dy - fr * 2.6;
  const rr = Math.min(dw * 0.3, ry - 6);
  if (rr > 8) {
    ctx.fillStyle = '#2b2230';
    ctx.beginPath();
    ctx.arc(rx, ry, rr, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f1d27a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f6e7b8';
    ctx.font = `800 ${Math.max(7, rr * 0.26)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ['L', '2', '3', '4', '5', '6'].forEach((s, k) => {
      const a = Math.PI + (Math.PI * (k + 0.5)) / 6;
      ctx.fillText(s, rx + Math.cos(a) * rr * 0.72, ry + Math.sin(a) * rr * 0.72);
    });
    ctx.strokeStyle = '#e5383b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    const a = Math.PI * 1.62;
    ctx.lineTo(rx + Math.cos(a) * rr * 0.55, ry + Math.sin(a) * rr * 0.55);
    ctx.stroke();
  }
  // The call buttons beside the doors: up lit green, down red.
  const bx = dx + dw + fr * 3.2;
  const by = dy + dh * 0.45;
  const br = Math.max(4, dw * 0.045);
  brass(bx - br * 1.6, by - br * 3, br * 3.2, br * 6);
  for (const [y, on, dir] of [[by - br * 1.3, '#2bb673', -1], [by + br * 1.3, '#e5383b', 1]]) {
    ctx.fillStyle = `${on}55`;
    ctx.beginPath();
    ctx.arc(bx, y, br * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on;
    ctx.beginPath();
    ctx.arc(bx, y, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(bx, y + dir * br * 0.55);
    ctx.lineTo(bx - br * 0.5, y - dir * br * 0.35);
    ctx.lineTo(bx + br * 0.5, y - dir * br * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  return rect;
}

// A cartoon lift operator, feet at (x, base), h tall: maroon uniform with
// gold buttons, pillbox cap, white gloves; one hand reaching to (hx, hy).
function operator(ctx, x, base, h, hx, hy) {
  const u = h / 100;
  const skin = '#c98b5e';
  const maroon = '#8c1c2c';
  const dark = '#5e1020';
  const gold = '#f1d27a';
  // Legs and shoes.
  ctx.fillStyle = '#26202b';
  ctx.fillRect(x - 9 * u, base - 34 * u, 7.5 * u, 32 * u);
  ctx.fillRect(x + 1.5 * u, base - 34 * u, 7.5 * u, 32 * u);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(x - 6 * u, base - 2 * u, 6 * u, 2.6 * u, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 6 * u, base - 2 * u, 6 * u, 2.6 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  // The jacket.
  ctx.fillStyle = maroon;
  ctx.beginPath();
  ctx.moveTo(x - 15 * u, base - 72 * u);
  ctx.quadraticCurveTo(x, base - 78 * u, x + 15 * u, base - 72 * u);
  ctx.lineTo(x + 13 * u, base - 32 * u);
  ctx.lineTo(x - 13 * u, base - 32 * u);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = gold; // epaulettes and buttons
  ctx.fillRect(x - 16 * u, base - 73 * u, 7 * u, 2.5 * u);
  ctx.fillRect(x + 9 * u, base - 73 * u, 7 * u, 2.5 * u);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.arc(x, base - (66 - k * 9) * u, 1.4 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(x - 13 * u, base - 36 * u, 26 * u, 2 * u);
  // Arms: one at his side, one out to the control.
  ctx.strokeStyle = maroon;
  ctx.lineCap = 'round';
  ctx.lineWidth = 6.5 * u;
  ctx.beginPath();
  ctx.moveTo(x - 14 * u, base - 69 * u);
  ctx.lineTo(x - 17 * u, base - 42 * u);
  ctx.stroke();
  const ex = (x + 14 * u + hx) / 2;
  const ey = Math.max(base - 69 * u, hy) + 9 * u; // the elbow, bent down
  ctx.beginPath();
  ctx.moveTo(x + 14 * u, base - 69 * u);
  ctx.lineTo(ex, ey);
  ctx.lineTo(hx - 2 * u, hy + 1 * u);
  ctx.stroke();
  ctx.fillStyle = '#fff'; // gloves
  ctx.beginPath();
  ctx.arc(x - 17 * u, base - 40 * u, 3.6 * u, 0, Math.PI * 2);
  ctx.arc(hx, hy, 3.6 * u, 0, Math.PI * 2);
  ctx.fill();
  // Collar and head.
  ctx.fillStyle = dark;
  ctx.fillRect(x - 5 * u, base - 79 * u, 10 * u, 5 * u);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(x, base - 88 * u, 9 * u, 10.5 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // ears
  ctx.arc(x - 9 * u, base - 88 * u, 2.4 * u, 0, Math.PI * 2);
  ctx.arc(x + 9 * u, base - 88 * u, 2.4 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1d1d'; // eyes
  ctx.beginPath();
  ctx.arc(x - 3.5 * u, base - 89 * u, 1.3 * u, 0, Math.PI * 2);
  ctx.arc(x + 3.5 * u, base - 89 * u, 1.3 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a2a18'; // a big smile
  ctx.lineWidth = 1.4 * u;
  ctx.beginPath();
  ctx.arc(x, base - 85 * u, 4 * u, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(220,90,80,0.35)'; // cheeks
  ctx.beginPath();
  ctx.arc(x - 6 * u, base - 85 * u, 1.8 * u, 0, Math.PI * 2);
  ctx.arc(x + 6 * u, base - 85 * u, 1.8 * u, 0, Math.PI * 2);
  ctx.fill();
  // The pillbox cap, a little to one side, with its gold band and visor.
  ctx.save();
  ctx.translate(x + 1 * u, base - 97 * u);
  ctx.rotate(-0.08);
  ctx.fillStyle = maroon;
  ctx.fillRect(-8 * u, -8 * u, 16 * u, 8 * u);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0, -8 * u, 8 * u, 1.8 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = gold;
  ctx.fillRect(-8 * u, -3 * u, 16 * u, 2 * u);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5 * u, 2 * u, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}
