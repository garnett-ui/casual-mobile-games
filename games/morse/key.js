// Morse from a finger: presses and pauses, read by your own rhythm. A press
// shorter than the line between your dits and dahs is a dit, longer a dah;
// both lengths are learnt as you key (starting from about 15 words a
// minute) -- and from the pauses between the parts of a letter -- so it
// follows you whether you're quick or slow. A pause long enough (about a
// dah) ends the letter.
import { CODE } from './code.js';

const LETTER = Object.fromEntries(Object.entries(CODE).map(([ch, code]) => [code, ch]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The character for a pattern, or null.
export const decode = (code) => LETTER[code] ?? null;

export class Keyer {
  constructor({ dit = 0.08 } = {}) {
    this.dit = dit; // your dit, as you key it (seconds)
    this.dah = dit * 3; // ...and your dah
    this.code = ''; // the letter so far
    this.downAt = null;
    this.upAt = 0;
  }

  // Between a dit and a dah.
  get split() {
    return Math.sqrt(this.dit * this.dah);
  }

  // How long a pause ends a letter.
  get gap() {
    return clamp(Math.max(3 * this.dit, this.dah), 0.25, 1);
  }

  down(t) {
    if (this.downAt !== null) return;
    // The pause between the parts of a letter is about a dit: another clue
    // to your speed.
    const g = t - this.upAt;
    if (this.code && g < this.gap) {
      this.dit = clamp(0.7 * this.dit + 0.3 * g, 0.03, 0.4);
      if (this.dah < this.dit * 2) this.dah = this.dit * 2;
    }
    this.downAt = t;
  }

  up(t) {
    if (this.downAt === null) return;
    const d = t - this.downAt;
    this.downAt = null;
    this.upAt = t;
    if (d < 0.015) return; // (a bounce)
    if (d < this.split) {
      this.code += '.';
      this.dit = clamp(0.75 * this.dit + 0.25 * d, 0.03, 0.4);
    } else {
      this.code += '-';
      this.dah = clamp(0.75 * this.dah + 0.25 * d, 0.09, 1.2);
    }
    // (Keep them apart: a dah at least twice a dit.)
    if (this.dah < this.dit * 2) this.dah = this.dit * 2;
  }

  // The letter just sent, once you've paused long enough -- its character,
  // '?' if it isn't one -- or null.
  tick(t) {
    if (!this.code || this.downAt !== null || t - this.upAt < this.gap) return null;
    const code = this.code;
    this.code = '';
    return code.length > 7 ? '?' : decode(code) ?? '?';
  }
}
