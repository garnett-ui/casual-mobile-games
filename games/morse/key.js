// Morse from a finger: presses and pauses, read by your own rhythm. In
// units: a dit is one on, a dah three; one off between them, three between
// letters. A press shorter than the line between your dits and dahs is a
// dit, longer a dah; both lengths are learnt from your recent presses
// (starting from about 15 words a minute), so it follows you whether you're
// quick or slow. A pause of two units -- between the one inside a letter
// and the three between letters -- ends the letter.
import { CODE } from './code.js';

const LETTER = Object.fromEntries(Object.entries(CODE).map(([ch, code]) => [code, ch]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The character for a pattern, or null.
export const decode = (code) => LETTER[code] ?? null;

// What tick gives for keying that isn't any character. (Not '?': that's a
// character of its own.)
export const UNKNOWN = '#';

const RECENT = 16; // presses remembered, to learn your dit and dah from

export class Keyer {
  constructor({ dit = 0.08 } = {}) {
    this.dit = dit; // your dit, as you key it (seconds)
    this.dah = dit * 3; // ...and your dah
    this.presses = []; // your recent presses (seconds)
    this.code = ''; // the letter so far
    this.parts = []; // its presses and pauses, in turn: [seconds, how many units it should be]
    this.done = []; // letters finished, not yet collected by tick
    this.downAt = null;
    this.upAt = 0;
    this.precision = null; // how evenly the last letter was keyed (see tick)
  }

  // Between a dit and a dah.
  get split() {
    return Math.sqrt(this.dit * this.dah);
  }

  // Your unit (a dit's length), by both your dits and dahs.
  get unit() {
    return (this.dit + this.dah / 3) / 2;
  }

  // How long a pause ends a letter: two units, halfway between the pause
  // inside a letter (one) and the one between letters (three).
  get gap() {
    return clamp(2 * this.unit, 0.1, 1.2);
  }

  down(t) {
    if (this.downAt !== null) return;
    const g = t - this.upAt;
    if (this.code) {
      // Paused long enough: that letter's done (even if nobody's looked yet).
      if (g >= this.gap) this.end();
      else this.parts.push([g, 1]);
    }
    this.downAt = t;
  }

  up(t) {
    if (this.downAt === null) return;
    const d = t - this.downAt;
    this.downAt = null;
    this.upAt = t;
    if (d < 0.015) return; // (a bounce)
    this.learn(d);
    // The letter so far (its presses, between its pauses), read again by
    // what it's just learnt.
    this.parts.push([d, 1]);
    this.code = '';
    this.parts.forEach((p, i) => {
      if (i % 2) return;
      p[1] = p[0] >= this.split ? 3 : 1;
      this.code += p[1] === 3 ? '-' : '.';
    });
  }

  // Your dit and dah, from your recent presses: split where they jump (a
  // dah's about three units, a dit one); or, all of a kind, they're the dits or the
  // dahs, whichever they're nearer.
  learn(d) {
    this.presses.push(d);
    if (this.presses.length > RECENT) this.presses.shift();
    const logs = this.presses.map(Math.log).sort((a, b) => a - b);
    const mean = (xs) => Math.exp(xs.reduce((a, b) => a + b, 0) / xs.length);
    let at = 0;
    let jump = 0;
    for (let i = 1; i < logs.length; i++) {
      if (logs[i] - logs[i - 1] > jump) [at, jump] = [i, logs[i] - logs[i - 1]];
    }
    const short = at ? mean(logs.slice(0, at)) : 0;
    const long = at ? mean(logs.slice(at)) : 0;
    if (at && long / short >= 2) {
      this.dit = clamp(short, 0.03, 0.4);
      this.dah = clamp(long, 0.09, 1.2);
    } else if (mean(logs) < this.split) {
      // (Just dits lately: the dah, about three of them.)
      this.dit = clamp(mean(logs), 0.03, 0.4);
      this.dah = clamp(this.dah, this.dit * 2, this.dit * 4);
    } else {
      this.dah = clamp(mean(logs), 0.09, 1.2);
      this.dit = clamp(this.dit, this.dah / 4, this.dah / 2);
    }
  }

  // The letter keyed so far is done: its character -- UNKNOWN if it isn't
  // one -- and how evenly it was keyed (for letters of two or more parts;
  // otherwise null): 1 for perfect -- every dah three units, every dit and
  // every pause inside it one -- less the more each part strays (at whatever speed you key).
  end() {
    const { code, parts } = this;
    this.code = '';
    this.parts = [];
    let precision = null;
    if (code.length >= 2) {
      const unit = parts.reduce((a, [d]) => a + d, 0) / parts.reduce((a, [, k]) => a + k, 0);
      const off = parts.reduce((a, [d, k]) => a + Math.abs(d / (k * unit) - 1), 0) / parts.length;
      precision = Math.max(0, 1 - off);
    }
    this.done.push([code.length > 7 ? UNKNOWN : decode(code) ?? UNKNOWN, precision]);
  }

  // The next letter sent, once you've paused long enough, or null; its
  // evenness in `precision`.
  tick(t) {
    if (this.code && this.downAt === null && t - this.upAt >= this.gap) this.end();
    if (!this.done.length) return null;
    const [ch, precision] = this.done.shift();
    this.precision = precision;
    return ch;
  }
}
