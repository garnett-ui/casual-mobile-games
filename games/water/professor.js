// Professor Fizz: Water Lab's resident scientist. A felt-puppet sort of
// fellow -- wild orange hair, round glasses, bushy moustache, bow tie and a
// white lab coat -- who tells you what to measure and reacts as you pour.

// Draw him with his feet (the bottom of his coat) at (x, y), s pixels tall.
// opts: t (seconds, for blinking and the wobble of his hair), talk (0..1,
// how open his mouth is), look (-1..1, where his eyes point), mood
// ('happy' | 'oops' | 'joy').
export function drawProfessor(ctx, x, y, s, { t = 0, talk = 0, look = 0, mood = 'happy' } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const bob = mood === 'joy' ? Math.abs(Math.sin(t * 9)) * -4 : Math.sin(t * 2) * 0.8;
  ctx.translate(0, bob);

  // Lab coat: shoulders and lapels, a pocket full of pens.
  ctx.fillStyle = '#f7f8fb';
  ctx.strokeStyle = '#c9cfd8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-38, 0);
  ctx.quadraticCurveTo(-40, -30, -22, -38);
  ctx.lineTo(22, -38);
  ctx.quadraticCurveTo(40, -30, 38, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e3e8ef';
  ctx.beginPath();
  ctx.moveTo(-10, -38);
  ctx.lineTo(0, -14);
  ctx.lineTo(10, -38);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c9cfd8';
  ctx.beginPath();
  ctx.moveTo(-10, -38);
  ctx.lineTo(-4, -10);
  ctx.moveTo(10, -38);
  ctx.lineTo(4, -10);
  ctx.stroke();
  ctx.fillStyle = '#4cc9f0'; // shirt
  ctx.beginPath();
  ctx.moveTo(-6, -38);
  ctx.lineTo(0, -22);
  ctx.lineTo(6, -38);
  ctx.fill();
  // Pens
  [['#e63946', -26], ['#4361ee', -22], ['#2a9d8f', -18]].forEach(([c, px]) => {
    ctx.fillStyle = c;
    ctx.fillRect(px, -30, 2.5, 9);
  });
  ctx.strokeStyle = '#c9cfd8';
  ctx.strokeRect(-29, -24, 14, 10);

  // Bow tie
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(-10, -45);
  ctx.lineTo(-10, -35);
  ctx.closePath();
  ctx.moveTo(0, -40);
  ctx.lineTo(10, -45);
  ctx.lineTo(10, -35);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -40, 3, 0, Math.PI * 2);
  ctx.fill();

  // Head
  const hy = -70;
  // Hair: a wild orange cloud, wobbling a little.
  const tufts = 13;
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass ? '#ff9d3c' : '#f2711c';
    for (let k = 0; k < tufts; k++) {
      const a = Math.PI * (0.92 + (1.16 * k) / (tufts - 1));
      const wob = Math.sin(t * 3 + k * 1.7) * 1.6;
      const r = (pass ? 25 : 29) + (k % 3) * 3 + wob;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, hy - 4 + Math.sin(a) * r * 0.9, pass ? 8 : 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Face: felt-peach, a little egg-shaped.
  const skin = ctx.createRadialGradient(-6, hy - 10, 4, 0, hy, 30);
  skin.addColorStop(0, '#ffd9bd');
  skin.addColorStop(1, '#f0b48e');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, hy, 22, 25, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ears
  ctx.fillStyle = '#f0b48e';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 22, hy + 2, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Glasses and eyes
  const blink = (t % 4.2) < 0.13;
  const eyeY = hy - 6;
  for (const sx of [-1, 1]) {
    const ex = sx * 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, eyeY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.strokeStyle = '#7a4a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex - 6, eyeY);
      ctx.lineTo(ex + 6, eyeY);
      ctx.stroke();
    } else {
      const wide = mood === 'oops' ? 1.25 : 1;
      ctx.fillStyle = '#1f2140';
      ctx.beginPath();
      ctx.arc(ex + look * 3.2, eyeY + 0.5, 3.6 * wide, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + look * 3.2 + 1.2, eyeY - 1, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(ex, eyeY, 9.5, 0, Math.PI * 2);
    ctx.stroke();
    // Bushy eyebrows, raised in surprise or joy.
    const lift = mood === 'happy' ? 0 : 4;
    ctx.fillStyle = '#e8661a';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY - 13 - lift, 8, 3.2, sx * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#3a2a20';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-1, eyeY);
  ctx.lineTo(1, eyeY);
  ctx.stroke();

  // A big round nose.
  ctx.fillStyle = '#ec8f73';
  ctx.beginPath();
  ctx.ellipse(0, hy + 5, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Puppet mouth: a wide hinge that flaps open as he talks.
  const open = Math.max(0, Math.min(1, talk)) * 9 + (mood === 'joy' ? 5 : mood === 'oops' ? 3 : 0);
  const my = hy + 13;
  ctx.fillStyle = '#5a1222';
  ctx.beginPath();
  ctx.moveTo(-13, my);
  ctx.quadraticCurveTo(0, my + 3 + open * 1.4, 13, my);
  ctx.quadraticCurveTo(0, my + 1, -13, my);
  ctx.fill();
  if (open > 2) {
    ctx.fillStyle = '#e8566e';
    ctx.beginPath();
    ctx.ellipse(0, my + open * 0.9, 6, Math.min(3, open * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Moustache over it all.
  ctx.fillStyle = '#e8661a';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 7, hy + 10, 8, 3.6, sx * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// What he says. Picks are deterministic per level so a level always opens
// with the same line.
const pick = (list, n) => list[((n % list.length) + list.length) % list.length];

export function goalLine(level) {
  const g = level.goal;
  if (g.kind === 'any') {
    return pick([
      `I need exactly ${g.amount} units of water. Any beaker will do!`,
      `Quick! Measure me exactly ${g.amount}. Not ${g.amount + 1}, not ${Math.max(0, g.amount - 1)}: ${g.amount}!`,
      `For my experiment I must have precisely ${g.amount}. In any beaker!`,
      `Ah, a new batch! Get ${g.amount} units into one of these.`,
    ], level.n);
  }
  const parts = level.caps.map((_, i) => {
    const m = g.marks.find(([j]) => j === i);
    return m ? (m[1] ? m[1] : 'empty') : 'anything';
  });
  return pick([
    `Left to right, I need: ${parts.join(', ')}. Match my gold lines!`,
    `A delicate split! ${parts.join(' · ')} — exactly on the gold lines.`,
  ], level.n);
}

export const LINES = {
  full: ['Ach! That one’s already full!', 'No room in there, my friend!', 'Full to the brim!'],
  empty: ['That beaker’s empty!', 'Nothing in that one to pour!'],
  hint: ['Psst! Pour where the arrow shows.', 'Try this pour… follow my arrow!'],
  restart: ['Fresh start! Science is mostly starting over.', 'Again, from the top!'],
  win: ['Eureka!', 'Magnificent measuring!', 'Precisely! Splendid!', 'Ha! Exactly right!'],
};

export function line(kind, n = Math.floor(Math.random() * 100)) {
  return pick(LINES[kind], n);
}
