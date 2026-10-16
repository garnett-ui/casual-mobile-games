// Professor Fizz: Water Lab's resident scientist. A felt-puppet sort of
// fellow -- wavy salt-and-pepper hair swept back, big aviator glasses, a
// thick dark moustache, shirt and dark tie under a white lab coat -- who
// tells you what to measure and reacts as you pour.

// Draw him with the bottom of his coat at (x, y), s pixels tall.
// opts: t (seconds, for blinking and the bounce of his hair), talk (0..1,
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

  // Lab coat: shoulders and wide lapels over a pale shirt and dark tie.
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
  ctx.fillStyle = '#dfe6ee'; // shirt
  ctx.beginPath();
  ctx.moveTo(-11, -38);
  ctx.lineTo(0, -8);
  ctx.lineTo(11, -38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2b2f3a'; // tie
  ctx.beginPath();
  ctx.moveTo(-3, -37);
  ctx.lineTo(3, -37);
  ctx.lineTo(4, -16);
  ctx.lineTo(0, -10);
  ctx.lineTo(-4, -16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c9cfd8';
  ctx.beginPath();
  ctx.moveTo(-11, -38);
  ctx.lineTo(-4, -4);
  ctx.moveTo(11, -38);
  ctx.lineTo(4, -4);
  ctx.stroke();
  // Pens in the pocket
  [['#e63946', -26], ['#4361ee', -22], ['#2a9d8f', -18]].forEach(([c, px]) => {
    ctx.fillStyle = c;
    ctx.fillRect(px, -30, 2.5, 9);
  });
  ctx.strokeStyle = '#c9cfd8';
  ctx.strokeRect(-29, -24, 14, 10);

  // Neck
  ctx.fillStyle = '#c48a62';
  ctx.fillRect(-8, -48, 16, 12);

  const hy = -70;
  // Hair: wavy salt-and-pepper, swept back and full on top, bouncing a little.
  const hair = (cols, r0, rad) => {
    const tufts = 11;
    for (let k = 0; k < tufts; k++) {
      // Mostly on top and swept back; close to the head at the sides.
      const a = Math.PI * (1.1 + (0.8 * k) / (tufts - 1));
      const wob = Math.sin(t * 3 + k * 1.9) * 1.2;
      const r = r0 + (k % 3) * 1.5 + wob;
      ctx.fillStyle = cols[k % cols.length];
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.95, hy - 8 + Math.sin(a) * r * 0.78, rad * (0.75 + 0.25 * Math.abs(Math.sin(a))), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  hair(['#4a4a4f', '#6d6d72', '#3a3a3f'], 21, 10);
  hair(['#9a9a9f', '#5a5a60', '#b8b8bd', '#76767c'], 18, 8);
  // Sideburns
  ctx.fillStyle = '#3e3e44';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 20, hy + 1, 3.6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Face: olive-tan felt, a little egg-shaped.
  const skin = ctx.createRadialGradient(-6, hy - 8, 4, 0, hy, 30);
  skin.addColorStop(0, '#e2b48c');
  skin.addColorStop(1, '#c48a62');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, hy + 1, 19, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  // Swept-back front of the hair, with silver streaks.
  ctx.fillStyle = '#5c5c62';
  ctx.beginPath();
  ctx.moveTo(-19, hy - 8);
  ctx.quadraticCurveTo(-14, hy - 30, 6, hy - 28);
  ctx.quadraticCurveTo(20, hy - 26, 19, hy - 9);
  ctx.quadraticCurveTo(12, hy - 18, 0, hy - 19);
  ctx.quadraticCurveTo(-12, hy - 19, -19, hy - 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,220,225,0.75)';
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(-14 + k * 7, hy - 19 + Math.abs(k - 2) * 1.5);
    ctx.quadraticCurveTo(-10 + k * 7, hy - 27, -4 + k * 6, hy - 28 + Math.sin(t * 3 + k));
    ctx.stroke();
  }
  // Ears
  ctx.fillStyle = '#c48a62';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 19.5, hy + 3, 4.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes behind big aviator glasses.
  const blink = (t % 4.2) < 0.13;
  const eyeY = hy - 3;
  for (const sx of [-1, 1]) {
    const ex = sx * 9.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 5.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.strokeStyle = '#5a3a24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex - 5, eyeY);
      ctx.lineTo(ex + 5, eyeY);
      ctx.stroke();
    } else {
      const wide = mood === 'oops' ? 1.2 : 1;
      ctx.fillStyle = '#2a1a12';
      ctx.beginPath();
      ctx.arc(ex + look * 2.4, eyeY + 0.3, 2.8 * wide, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + look * 2.4 + 0.9, eyeY - 0.8, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Eyebrows: dark and heavy, up when surprised or delighted.
    const lift = mood === 'happy' ? 0 : 3.5;
    ctx.fillStyle = '#3a3a40';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY - 10 - lift, 7, 2.4, sx * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // Aviator lens: wide at the top, rounded below; faintly tinted.
    ctx.beginPath();
    ctx.moveTo(ex - sx * 1 - 8, eyeY - 7);
    ctx.lineTo(ex + 8.5, eyeY - 7);
    ctx.quadraticCurveTo(ex + 10.5, eyeY + 7, ex + 2, eyeY + 8);
    ctx.quadraticCurveTo(ex - 9, eyeY + 8, ex - 9, eyeY - 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(190,210,230,0.18)';
    ctx.fill();
    ctx.strokeStyle = '#8b7d64';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  // Bridge and arms of the glasses
  ctx.strokeStyle = '#8b7d64';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-1.5, eyeY - 6);
  ctx.lineTo(1.5, eyeY - 6);
  ctx.moveTo(-18.5, eyeY - 6);
  ctx.lineTo(-20, eyeY - 4);
  ctx.moveTo(18.5, eyeY - 6);
  ctx.lineTo(20, eyeY - 4);
  ctx.stroke();

  // Nose
  ctx.fillStyle = '#b8795a';
  ctx.beginPath();
  ctx.ellipse(0, hy + 7, 4.8, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Puppet mouth: a wide hinge that flaps open as he talks.
  const open = Math.max(0, Math.min(1, talk)) * 8 + (mood === 'joy' ? 5 : mood === 'oops' ? 3 : 0);
  const my = hy + 15;
  ctx.fillStyle = '#4a1020';
  ctx.beginPath();
  ctx.moveTo(-10, my);
  ctx.quadraticCurveTo(0, my + 3 + open * 1.4, 10, my);
  ctx.quadraticCurveTo(0, my + 1, -10, my);
  ctx.fill();
  if (open > 2) {
    ctx.fillStyle = '#d9566a';
    ctx.beginPath();
    ctx.ellipse(0, my + open * 0.9, 5, Math.min(2.6, open * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // A thick dark moustache, flecked with grey.
  ctx.fillStyle = '#26262b';
  ctx.beginPath();
  ctx.moveTo(-13, hy + 15);
  ctx.quadraticCurveTo(-12, hy + 9, -4, hy + 10);
  ctx.quadraticCurveTo(0, hy + 11, 4, hy + 10);
  ctx.quadraticCurveTo(12, hy + 9, 13, hy + 15);
  ctx.quadraticCurveTo(8, hy + 13.5, 0, hy + 14);
  ctx.quadraticCurveTo(-8, hy + 13.5, -13, hy + 15);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,150,155,0.6)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let k = -3; k <= 3; k++) {
    ctx.moveTo(k * 3, hy + 10.8);
    ctx.lineTo(k * 3.4, hy + 13.2);
  }
  ctx.stroke();
  ctx.restore();
}

// What he says. Picks are deterministic per level so a level always opens
// with the same line.
const pick = (list, n) => list[((n % list.length) + list.length) % list.length];

export function goalLine(level) {
  const g = level.goal;
  if (g.kind === 'any') return `I need exactly ${g.amount} ml of water.`;
  const parts = level.caps.map((_, i) => {
    const m = g.marks.find(([j]) => j === i);
    return m ? (m[1] ? `${m[1]} ml` : 'empty') : 'any amount';
  });
  return `Left to right, I need ${parts.join(', ')}.`;
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
