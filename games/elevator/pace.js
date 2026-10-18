// Through the lulls the game plays fast. When the screen is at rest --
// nobody waiting or walking, the lifts empty and parked, nothing on the
// move but perhaps the cat -- time eases up to FAST times normal, and eases
// back down before whoever's next sets off, so you see them at normal
// speed. (It's only how fast the day plays: everything happens just as it
// would, the score included.)

import { stays } from './engine.js';

export const FAST = 5;
export const RAMP_UP = 1.2; // seconds to get up to speed
export const RAMP_DOWN = 0.6; // ...and back down
export const AHEAD = 4; // slowing down this long (in the day's time) before someone's due

const smooth = (u) => u * u * (3 - 2 * u);

// The next step: ramp (0..1) eases towards full speed while it's calm with
// nobody due soon, back to 0 otherwise; rate is how fast the day plays.
export function pace(ramp, calm, dueIn, dt) {
  const go = calm && dueIn > AHEAD;
  ramp = Math.max(0, Math.min(1, ramp + (go ? dt / RAMP_UP : -dt / RAMP_DOWN)));
  return { ramp, rate: 1 + (FAST - 1) * smooth(ramp) };
}

// How long (in the day's time) until someone's next due to set off, in any
// of the day's towers. (Not anyone waiting for someone to be on the floor
// they'd leave: they go when that happens.)
export function dueIn(day) {
  let next = Infinity;
  for (const sim of day.sims) {
    for (const a of sim.pending) {
      if (stays(sim.building, a.from) && sim.occupancy[a.from] <= 0) continue;
      next = Math.min(next, sim.setsOff(a));
    }
  }
  return next - day.t;
}

// Nothing going on in the lifts: nobody waiting or on their way to the
// buttons, nobody aboard, no lift sent anywhere, all standing still.
export function idle(day) {
  return day.sims.every(
    (s) =>
      !s.walking.length &&
      s.waiting.every((w) => !w.length) &&
      s.cars.every((c) => !c.riders.length && c.target === null && !c.queue.length && (c.phase === 'idle' || (c.phase === 'loading' && c.settled))),
  );
}
