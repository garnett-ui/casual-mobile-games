// Elevator Operator: the levels, the run of the lifts, and how you did
// against the dispatcher. Played upright on a phone (either way round on a
// tablet), with lift music.
import { Play } from './play.js';
import { CAPACITY, levelSpec } from './engine.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { lockOrientation, unlockOrientation, currentOrientation } from '../../js/lib/orientation.js';

const NOTE = '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>';
const PATTERN = {
  morning: 'The morning rush: nearly everyone is arriving for work, from the street or the garage, and a few are off to the gym or breakfast first.',
  midday: 'The middle of the day: people going floor to floor -- meetings, coffee in the restaurant, the gym -- as well as coming and going.',
  lunch: 'Lunchtime: out to the street, down to the restaurant on 2 or up to the health club, and back again.',
  evening: 'Going home: most people want the lobby or their car in the garage; a few are off to the gym.',
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// A phone (short side under 600 px) is played upright; a tablet either way.
const isPhone = () => Math.min(screen.width, screen.height) < 600;

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  let play = null;
  let cleanup = [];

  function teardown() {
    if (play) play.destroy();
    if (window.__elevator === play) window.__elevator = null;
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
    ctx.stopMusic?.();
    unlockOrientation();
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'elevator',
      title: 'Elevator Operator',
      intro: 'Run the two lifts in a 20-storey tower, from the garage to the health club. Tap a floor in a lift’s shaft to send it there, and get everyone where they’re going.',
      outro: 'Each level is a time of day, with more people, closer together.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    const spec = levelSpec(n);
    root.innerHTML = `
      <div class="screen play-screen el-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <button class="icon-btn el-music" data-act="music" aria-label="Music" aria-pressed="true">${NOTE}</button>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
          <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
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
      onOver: (res) => setTimeout(() => over(n, res), 600),
    }, spec);
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__elevator = play;

    // Lift music (on unless you've turned it off).
    const musicBtn = root.querySelector('[data-act=music]');
    let musicOn = ctx.load('music', true);
    const music = () => {
      musicBtn.classList.toggle('off', !musicOn);
      musicBtn.setAttribute('aria-pressed', String(musicOn));
      if (musicOn && !play.paused && dialog.hidden) ctx.startMusic?.('muzak');
      else ctx.stopMusic?.();
    };
    musicBtn.onclick = () => {
      musicOn = !musicOn;
      ctx.save('music', musicOn);
      ctx.sfx('tap');
      music();
    };

    // Pause (and on a phone held sideways, a pause until it's upright).
    const pause = (why = 'pause') => {
      if (!play || play.sim.over || !dialog.hidden) return;
      play.paused = true;
      pausedCard.dataset.why = why;
      pausedCard.querySelector('b').textContent = why === 'rotate' ? 'Turn your phone upright' : 'Paused';
      pausedCard.querySelector('span').textContent = why === 'rotate' ? 'The tower needs the height.' : 'Tap to carry on.';
      pausedCard.hidden = false;
      music();
    };
    const resume = () => {
      if (!play || pausedCard.hidden) return;
      if (isPhone() && currentOrientation() !== 'portrait') return pause('rotate');
      pausedCard.hidden = true;
      play.paused = false;
      play.last = performance.now();
      music();
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
    const key = (e) => {
      if (e.key !== 'p' && e.key !== 'Escape') return;
      if (!pausedCard.hidden) resume();
      else pause();
    };
    const resize = () => {
      play?.resize();
      if (isPhone() && currentOrientation() !== 'portrait') pause('rotate');
      else if (pausedCard.dataset.why === 'rotate' && !pausedCard.hidden) {
        pausedCard.querySelector('b').textContent = 'Ready';
        pausedCard.querySelector('span').textContent = 'Tap to carry on.';
        pausedCard.dataset.why = 'pause';
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', resize);
    cleanup.push(() => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', resize);
    });
    if (isPhone()) lockOrientation('portrait');

    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/elevator');
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      start();
    };

    function start(watch = false) {
      dialog.hidden = true;
      pausedCard.hidden = true;
      play.reset(spec, watch ? play.getPar().opts : null);
      play.timeScale = watch ? 2 : 1;
      play.paused = false;
      play.last = performance.now();
      if (isPhone() && currentOrientation() !== 'portrait') pause('rotate');
      music();
      ctx.track('level_start', { level: n, watch });
    }

    function over(level, res) {
      if (!play) return;
      music();
      const { delivered, trip, wait, ride, time } = res;
      const p = res.par;
      if (res.watched) {
        showDialog(dialog, ctx, {
          title: 'The dispatcher’s run',
          text: `All ${delivered} delivered in ${fmt(time)}, with an average trip of <b>${Math.round(p.trip)} s</b> (waiting ${Math.round(p.wait)} s, riding ${Math.round(p.ride)} s). Your turn!`,
          buttons: [
            { label: 'Levels', act: 'levels', run: () => ctx.back('#/elevator') },
            { label: 'Try it yourself', act: 'retry', primary: true, run: () => start() },
          ],
        });
        return;
      }
      const pct = Math.round((100 * p.trip) / Math.max(1, trip));
      const stars = pct >= 100 ? 3 : pct >= 80 ? 2 : 1;
      progress.complete(level, stars);
      ctx.track('level_complete', { level, stars, trip: Math.round(trip), par: Math.round(p.trip) });
      ctx.sfx(stars >= 2 ? 'win' : 'lose');
      showDialog(dialog, ctx, {
        title: pct >= 100 ? 'Better than the computer!' : pct >= 80 ? 'Smooth running' : 'Everyone got there',
        stars,
        text: `All ${delivered} passengers delivered in ${fmt(time)}.<br>
          Average trip <b>${Math.round(trip)} s</b> (waiting ${Math.round(wait)} s, riding ${Math.round(ride)} s).<br>
          The dispatcher averaged <b>${Math.round(p.trip)} s</b> with the same people: you got <b>${pct}%</b>.`,
        buttons: [
          { label: 'Watch it', act: 'watch', run: () => start(true) },
          { label: 'Retry', act: 'retry', run: () => start() },
          { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/elevator/${level + 1}`, { replace: true }) },
        ],
      });
    }

    showDialog(dialog, ctx, {
      title: `Level ${n}`,
      text: `${spec.people} passengers, about one every ${Math.round(spec.gap)} seconds. ${PATTERN[spec.pattern]}<br><br>
        <b>Tap a floor in a lift’s shaft</b> to send it there: that’s its one next stop (tap another and it changes course).
        When it stops, anyone for that floor gets off and everyone waiting gets on (${CAPACITY} at most). The floors they want light up, with a figure for each of them.<br><br>
        You’re done when everyone has got where they’re going. The shorter their trips, the better.`,
      buttons: [{ label: 'Open the doors', act: 'start', primary: true, run: () => start() }],
    });
  }

  function route(s) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= progress.data.unlocked) showPlay(n);
    else showLevels();
  }

  route(sub);
  return { route, destroy: teardown };
}
