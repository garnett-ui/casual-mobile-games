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
  // (Pitched high enough for phone speakers, which can't play deep bass.)
  vroom: () => {
    tone('sawtooth', 130, 290, 0.3, 0.09, 0, 1700);
    tone('square', 65, 145, 0.3, 0.04, 0, 900);
  },
  bump: () => {
    thump(0.7, 0.12, 2200);
    tone('square', 300, 150, 0.12, 0.07, 0, 1600);
    tone('triangle', 620, 300, 0.07, 0.08);
  },
  // Leaves: a short rustle and a soft thud.
  hedge: () => {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random());
    src.stop(t + 0.35);
    thump(0.4, 0.1, 1200);
  },
  // A granny's indignant "Hey!"
  granny: () => {
    tone('sawtooth', 820, 1020, 0.09, 0.06, 0.05, 2600);
    tone('sawtooth', 1020, 640, 0.22, 0.07, 0.14, 2600);
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
  // Jigsaw: a piece clicking into place.
  snap: () => {
    thump(0.25, 0.05, 2500);
    tone('triangle', 880, 1320, 0.08, 0.12);
  },
  star: () => tone('triangle', 880, 1320, 0.25, 0.2),
  win: () => [523, 659, 784, 1047].forEach((f, k) => tone('triangle', f, f, 0.3, 0.2, k * 0.11)),
  // Night Driver
  crash: () => {
    thump(1, 0.9, 1800);
    thump(0.6, 0.35, 5000);
    tone('sawtooth', 160, 40, 0.6, 0.18, 0, 900);
  },
  screech: () => {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 6;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.7);
  },
  splash: () => {
    thump(0.7, 1.2, 1200);
    thump(0.3, 0.8, 6000);
  },
  // Water Lab: water glugging from one glass into another, and a glass clink.
  pour: (dur = 0.8) => {
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    // Glugs: the pitch wobbles, rising as the glass fills.
    f.frequency.setValueAtTime(500, t);
    for (let k = 0, x = t; x < t + dur; k++, x += 0.11) f.frequency.setValueAtTime(500 + 500 * ((x - t) / dur) + (k % 2) * 260, x);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
    g.gain.setValueAtTime(0.5, t + Math.max(0.07, dur - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  },
  clink: () => {
    tone('sine', 2650, 2650, 0.25, 0.06);
    tone('sine', 3980, 3980, 0.18, 0.035);
  },
  // Elevator: a lift arriving (the classic two-tone chime), and someone
  // stepping out where they wanted to be.
  ding: () => {
    tone('sine', 1319, 1319, 0.5, 0.09);
    tone('sine', 1047, 1047, 0.8, 0.09, 0.18);
  },
  drop: () => tone('triangle', 660, 990, 0.09, 0.05),
  checkpoint: () => [784, 988, 1175].forEach((f, k) => tone('square', f, f, 0.12, 0.06, k * 0.09, 4000)),
};

// Continuous sounds that play while a control is held (engine rumble,
// thruster hiss). setLoop(name, true/false) starts/stops them.
const LOOPS = {
  engine: { type: 'lowpass', freq: 340, vol: 0.35 },
  rcs: { type: 'highpass', freq: 2600, vol: 0.05 },
  // A car engine: buzzy oscillators whose pitch follows loopLevel().
  motor: { osc: true, vol: 0.09 },
  // Night Driver's tyres: a squeal (a steady, slightly gritty screech whose
  // pitch climbs a little as the slide gets harder) and the brakes
  // chattering at their limit (a low judder, pulsing 17 times a second).
  // Their loudness follows loopLevel().
  squeal: { type: 'bandpass', freq: 2400, q: 4, vol: 0.32, level: true, tone: 1050, toneVol: 0.7 },
  chatter: { type: 'lowpass', freq: 520, vol: 0.9, level: true, pulse: 17 },
};
const playing = {};

// Set a looping sound's level, 0..1 (for the motor: revs).
export function loopLevel(name, value) {
  const cur = playing[name];
  if (!cur) return;
  const t = ac.currentTime;
  if (!cur.oscs) {
    // A noise loop: its loudness (and a squeal's pitch, rising gently).
    const spec = LOOPS[name];
    if (spec?.level) cur.g.gain.setTargetAtTime(Math.max(0.0001, spec.vol * value), t, 0.04);
    if (cur.voice) cur.voice.frequency.setTargetAtTime(spec.tone * (0.94 + 0.1 * value), t, 0.25);
    return;
  }
  const hz = 38 + value * 120;
  cur.oscs[0].frequency.setTargetAtTime(hz, t, 0.05);
  cur.oscs[1].frequency.setTargetAtTime(hz * 1.503, t, 0.05);
  cur.filter.frequency.setTargetAtTime(300 + value * 1400, t, 0.05);
}

function startMotor(spec) {
  const t = ac.currentTime;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 400;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(spec.vol, t + 0.15);
  const oscs = ['sawtooth', 'square'].map((type, k) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = k ? 57 : 38;
    const og = ac.createGain();
    og.gain.value = k ? 0.4 : 1;
    o.connect(og);
    og.connect(f);
    o.start(t);
    return o;
  });
  f.connect(g);
  g.connect(master);
  return { oscs, filter: f, g, src: { stop: (at) => oscs.forEach((o) => o.stop(at)) } };
}

export function setLoop(name, on) {
  if (!ac || !getSetting('sound')) on = false;
  const cur = playing[name];
  if (on && !cur && LOOPS[name]?.osc) {
    playing[name] = startMotor(LOOPS[name]);
  } else if (on && !cur) {
    const spec = LOOPS[name];
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ac.createBiquadFilter();
    f.type = spec.type;
    f.frequency.value = spec.freq;
    if (spec.q) f.Q.value = spec.q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // Level-driven loops start silent; loopLevel() brings them up.
    if (!spec.level) g.gain.exponentialRampToValueAtTime(spec.vol, t + 0.06);
    src.connect(f);
    let out = f;
    const lfos = [];
    let voice = null;
    if (spec.tone) {
      // A screech: a buzzy tone, filtered to a bright squeak, under the noise.
      voice = ac.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.value = spec.tone;
      const vf = ac.createBiquadFilter();
      vf.type = 'bandpass';
      vf.frequency.value = spec.tone * 2;
      vf.Q.value = 2;
      const vg = ac.createGain();
      vg.gain.value = spec.toneVol;
      voice.connect(vf);
      vf.connect(vg);
      vg.connect(g);
      lfos.push(voice);
    }
    if (spec.pulse) {
      // Chatter: the sound pulses on and off.
      const am = ac.createGain();
      am.gain.value = 0.5;
      const lfo = ac.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = spec.pulse;
      const depth = ac.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth);
      depth.connect(am.gain);
      f.connect(am);
      out = am;
      lfos.push(lfo);
    }
    out.connect(g);
    g.connect(master);
    src.start(t, Math.random());
    lfos.forEach((o) => o.start(t));
    playing[name] = { src: { stop: (at) => [src, ...lfos].forEach((o) => o.stop(at)) }, g, voice };
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
  for (const stop of [...clipsPlaying]) stop();
}

// Recorded clips: fetched and decoded once, played through the same volume
// as everything else.
const clips = new Map(); // url -> Promise<AudioBuffer | null>
const clipsPlaying = new Set();

export function loadClip(url) {
  if (!ac) return Promise.resolve(null);
  if (!clips.has(url)) {
    clips.set(url, fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => new Promise((ok, fail) => ac.decodeAudioData(data, ok, fail)))
      .catch(() => {
        clips.delete(url);
        return null;
      }));
  }
  return clips.get(url);
}

// How many clips are playing (for the tests).
export function clipCount() {
  return clipsPlaying.size;
}

// Starts a clip (once it's loaded) and returns a function that stops it,
// with a quick fade, whenever you like.
export function playClip(url, vol = 0.9) {
  let src = null;
  let g = null;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    clipsPlaying.delete(stop);
    if (!src) return;
    const t = ac.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.25);
    src.stop(t + 0.3);
  };
  if (!ac || !getSetting('sound')) return stop;
  clipsPlaying.add(stop);
  loadClip(url).then((buf) => {
    if (!buf || done) return;
    src = ac.createBufferSource();
    src.buffer = buf;
    g = ac.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(master);
    src.onended = () => {
      done = true;
      clipsPlaying.delete(stop);
    };
    src.start();
  });
  return stop;
}

export function sfx(name, arg) {
  if (!getSetting('sound') || !ac || !SFX[name]) return;
  try {
    SFX[name](arg);
  } catch {
    // Never let audio problems break the game.
  }
}
