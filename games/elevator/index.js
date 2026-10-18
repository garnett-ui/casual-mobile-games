// Elevator: the start card, the day, and how you did against the dispatcher.
import { Play } from './play.js';
import { CAPACITY } from './engine.js';
import { ICON, showDialog } from '../../js/lib/campaign.js';

export function mount(root, ctx) {
  let play = null;
  let cleanup = [];

  function teardown() {
    if (play) play.destroy();
    if (window.__elevator === play) window.__elevator = null;
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
  }

  root.innerHTML = `
    <div class="screen play-screen el-screen">
      <header class="bar">
        <button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button>
        <h2>Elevator</h2>
        <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
        <button class="icon-btn" data-act="restart" aria-label="New day">${ICON.restart}</button>
      </header>
      <div class="stage"><canvas class="board"></canvas>
        <div class="pause-card" hidden><div><b>Paused</b><span>Tap to carry on.</span></div></div>
        <div class="dialog" hidden></div>
      </div>
    </div>`;
  const dialog = root.querySelector('.dialog');
  const pausedCard = root.querySelector('.pause-card');

  play = new Play(root.querySelector('canvas'), {
    sfx: ctx.sfx,
    onOver: (res) => setTimeout(() => over(res), 500),
  });
  // Handle for the end-to-end tests (test/e2e.test.mjs).
  window.__elevator = play;

  // Pause: the clock stops until you tap. Leaving the app pauses it too.
  const running = () => play && !play.sim.over && dialog.hidden;
  const pause = () => {
    if (!running() || play.paused) return;
    play.paused = true;
    pausedCard.hidden = false;
  };
  const resume = () => {
    if (!play || pausedCard.hidden) return;
    pausedCard.hidden = true;
    play.paused = false;
    play.last = performance.now();
  };
  root.querySelector('[data-act=pause]').onclick = () => {
    ctx.sfx('tap');
    if (!pausedCard.hidden) resume();
    else pause();
  };
  pausedCard.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resume();
  });
  const hide = () => document.visibilityState === 'hidden' && pause();
  document.addEventListener('visibilitychange', hide);
  const key = (e) => {
    if (e.key !== 'p' && e.key !== 'Escape') return;
    if (!pausedCard.hidden) resume();
    else pause();
  };
  window.addEventListener('keydown', key);
  const resize = () => play?.resize();
  window.addEventListener('resize', resize);
  cleanup.push(() => {
    document.removeEventListener('visibilitychange', hide);
    window.removeEventListener('keydown', key);
    window.removeEventListener('resize', resize);
  });

  root.querySelector('[data-act=home]').onclick = () => ctx.back('#/');
  root.querySelector('[data-act=restart]').onclick = () => {
    ctx.sfx('tap');
    start();
  };

  // A day: a new one, or the same one again (given its seed).
  function start(seed) {
    dialog.hidden = true;
    pausedCard.hidden = true;
    play.reset(seed);
    play.timeScale = 1;
    play.paused = false;
    play.last = performance.now();
    ctx.track('level_start', {});
  }

  // Watch the dispatcher run the same day (its best way), at double speed.
  function watchDay(seed) {
    dialog.hidden = true;
    pausedCard.hidden = true;
    play.reset(seed);
    play.autopilot = play.getPar().opts;
    play.timeScale = 2;
    play.paused = false;
    play.last = performance.now();
  }

  function intro() {
    const best = ctx.load('best', 0);
    showDialog(dialog, ctx, {
      title: 'Elevator',
      text: `You run the two lifts in a 20-storey tower for a three-minute day.<br><br>
        <b>Tap a floor in a lift’s shaft</b> to send it there. That’s its one next stop: tap another and it changes course at once.<br><br>
        When it stops, anyone for that floor gets off and everyone waiting gets on (${CAPACITY} at most). The floors they want light up <b>✓</b> in the shaft.<br><br>
        Deliver as many people as you can. At the end, see how you did against a computer dispatcher running the very same day.
        ${best ? `<br><br>Best: <b>${best}%</b> of the dispatcher` : ''}`,
      buttons: [{ label: 'Start the day', act: 'start', primary: true, run: () => start() }],
    });
  }

  function over({ delivered, par, arrived, wait, watched }) {
    if (!play) return;
    const seed = play.seed;
    if (watched) {
      showDialog(dialog, ctx, {
        title: 'The dispatcher’s day',
        text: `It delivered <b>${delivered}</b> of the ${arrived} people who turned up, with an average wait of ${Math.round(wait)} s. Your turn!`,
        buttons: [
          { label: 'New day', act: 'new', run: () => start() },
          { label: 'Try this day', act: 'same', primary: true, run: () => start(seed) },
        ],
      });
      return;
    }
    const pct = par ? Math.round((100 * delivered) / par) : 100;
    const stars = pct >= 100 ? 3 : pct >= 85 ? 2 : pct >= 65 ? 1 : 0;
    const best = ctx.load('best', 0);
    const isBest = pct > best;
    if (isBest) ctx.save('best', pct);
    ctx.track('level_complete', { delivered, par, pct });
    ctx.sfx(stars >= 2 ? 'win' : 'lose');
    showDialog(dialog, ctx, {
      title: pct >= 100 ? 'Better than the computer!' : pct >= 85 ? 'Smooth running' : 'Time’s up',
      stars,
      text: `You delivered <b>${delivered}</b> of the ${arrived} people who turned up (average wait ${Math.round(wait)} s).<br>
        The dispatcher managed <b>${par}</b> on the same day: you got <b>${pct}%</b>.
        ${isBest ? '<br>A new best!' : best ? `<br>Best: ${best}%` : ''}`,
      buttons: [
        { label: 'Watch it', act: 'watch', run: () => watchDay(seed) },
        { label: 'Same day', act: 'same', run: () => start(seed) },
        { label: 'New day', act: 'new', primary: true, run: () => start() },
      ],
    });
  }

  intro();
  return { route: () => {}, destroy: teardown };
}
