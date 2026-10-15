// Synthesised sound effects (Web Audio), so the app ships no audio files and
// works offline. The context is created on the first user gesture, as mobile
// browsers require.
import { getSetting } from './settings.js';

let ac = null;
let master = null;
let noise = null;

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.6;
    master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}

function tone(type, f0, f1, dur, vol, at = 0, filter = 0) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function thump(vol, dur, cutoff) {
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur);
}

const SFX = {
  tap: () => tone('sine', 660, 880, 0.08, 0.15),
  vroom: () => tone('sawtooth', 70, 150, 0.32, 0.12, 0, 700),
  bump: () => {
    thump(0.5, 0.15, 400);
    tone('sine', 120, 60, 0.15, 0.3);
  },
  honk: () => {
    tone('square', 370, 370, 0.22, 0.06, 0, 1800);
    tone('square', 466, 466, 0.22, 0.06, 0, 1800);
    tone('square', 370, 370, 0.18, 0.06, 0.27, 1800);
    tone('square', 466, 466, 0.18, 0.06, 0.27, 1800);
  },
  pop: () => tone('sine', 500, 1100, 0.12, 0.1),
  whoosh: () => {
    thump(0.25, 0.22, 2400);
    tone('sine', 420, 980, 0.18, 0.12);
  },
  lose: () => [392, 330, 262].forEach((f, k) => tone('triangle', f, f * 0.97, 0.3, 0.18, k * 0.16)),
  // Breakout: arcade-style square-wave blips.
  wall: () => tone('square', 480, 480, 0.045, 0.07, 0, 3000),
  paddle: () => tone('square', 240, 236, 0.07, 0.1, 0, 2400),
  // Higher rows ring higher, like the 1976 original. row: 0 (bottom) and up.
  brick: (row = 0) => tone('square', 520 + row * 70, 520 + row * 70, 0.06, 0.08, 0, 3500),
  steel: () => tone('square', 900, 880, 0.03, 0.06, 0, 4000),
  miss: () => tone('sawtooth', 440, 70, 0.6, 0.12, 0, 1200),
  // Lunar Lander
  explode: () => {
    thump(0.9, 1.6, 700);
    thump(0.5, 0.5, 3000);
    tone('sine', 110, 28, 1.4, 0.5);
  },
  alarm: () => {
    tone('square', 1046, 1046, 0.09, 0.05, 0, 3000);
    tone('square', 1046, 1046, 0.09, 0.05, 0.14, 3000);
  },
  contact: () => tone('sine', 1320, 1320, 0.12, 0.08),
  star: () => tone('triangle', 880, 1320, 0.25, 0.2),
  win: () => [523, 659, 784, 1047].forEach((f, k) => tone('triangle', f, f, 0.3, 0.2, k * 0.11)),
};

// Continuous sounds that play while a control is held (engine rumble,
// thruster hiss). setLoop(name, true/false) starts/stops them.
const LOOPS = {
  engine: { type: 'lowpass', freq: 340, vol: 0.35 },
  rcs: { type: 'highpass', freq: 2600, vol: 0.05 },
};
const playing = {};

export function setLoop(name, on) {
  if (!ac || !getSetting('sound')) on = false;
  const cur = playing[name];
  if (on && !cur) {
    const spec = LOOPS[name];
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ac.createBiquadFilter();
    f.type = spec.type;
    f.frequency.value = spec.freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(spec.vol, t + 0.06);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random());
    playing[name] = { src, g };
  } else if (!on && cur) {
    const t = ac.currentTime;
    cur.g.gain.cancelScheduledValues(t);
    cur.g.gain.setValueAtTime(Math.max(0.0001, cur.g.gain.value), t);
    cur.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    cur.src.stop(t + 0.15);
    delete playing[name];
  }
}

export function stopLoops() {
  for (const name of Object.keys(playing)) setLoop(name, false);
}

export function sfx(name, arg) {
  if (!getSetting('sound') || !ac || !SFX[name]) return;
  try {
    SFX[name](arg);
  } catch {
    // Never let audio problems break the game.
  }
}
