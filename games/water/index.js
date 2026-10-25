// Water Lab: level select, the bench, and the end-of-level card.
import { makeLevel, goalText } from './model.js';
import { Play } from './play.js';
import { SpaceView } from './space.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';

// How to play, in Professor Fizz's words (said in his speech bubble).
const TIPS = {
  1: 'Drag a beaker onto another to pour, or tap one and then the other. It pours until it’s empty or the other is full!',
  3: 'No tap and no drain: only the water we’ve got. Pour it back and forth until you have my amount.',
  7: 'See my gold lines? Every marked beaker must hold exactly that much, all at once.',
};
const CHEERS = ['Precisely!', 'Well measured!', 'Eureka!', 'Lab genius!', 'Spot on!'];
// The solution-space map button: a hexagon with spokes.
const MAP = '<svg viewBox="0 0 24 24"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 12V3M12 12l7.8 4.5M12 12l-7.8 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="2.2"/></svg>';

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  const cache = new Map();
  let play = null;
  let onResize = null;

  const levelFor = (n) => {
    if (!cache.has(n)) cache.set(n, makeLevel(n));
    return cache.get(n);
  };

  function teardown() {
    if (play) play.destroy();
    play = null;
    if (onResize) window.removeEventListener('resize', onResize);
    onResize = null;
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'water',
      title: 'Water Lab',
      intro: 'Pour water between beakers to measure an exact amount. No tap, no drain: just the water you start with.',
      outro: 'Every level is checked to be solvable in the fewest pours shown.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    const level = levelFor(n);
    root.innerHTML = `
      <div class="screen play-screen wl-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <span class="pill moves"><b data-moves>0</b>&nbsp;<span data-unit>pours</span> · fewest ${level.par}</span>
        </header>
        <div class="wl-goal sr-only">${goalText(level)}</div>
        <div class="stage"><canvas class="board"></canvas></div>
        <footer class="controls">
          <button class="ctl" data-act="undo">${ICON.undo}<span>Undo</span></button>
          <button class="ctl" data-act="restart">${ICON.restart}<span>Restart</span></button>
          <button class="ctl" data-act="hint">${ICON.hint}<span>Hint</span></button>
          <button class="ctl" data-act="map">${MAP}<span>Map</span></button>
        </footer>
        <div class="dialog" hidden></div>
      </div>`;
    ctx.track('level_start', { level: n });
    const movesEl = root.querySelector('[data-moves]');
    play = new Play(root.querySelector('canvas'), level, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onMoves: (m) => {
        movesEl.textContent = m;
        root.querySelector('[data-unit]').textContent = m === 1 ? 'pour' : 'pours';
      },
      onWin: (res) => setTimeout(() => win(n, res), 700),
    }, { tip: TIPS[n] || '' });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__water = play;
    onResize = () => play?.resize();
    window.addEventListener('resize', onResize);
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/water');
    root.querySelector('[data-act=undo]').onclick = () => {
      ctx.sfx('tap');
      play.undo();
    };
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      play.reset();
    };
    root.querySelector('[data-act=hint]').onclick = () => {
      ctx.sfx('tap');
      play.showHint();
    };
    root.querySelector('[data-act=map]').onclick = () => {
      ctx.sfx('tap');
      openMap();
    };
  }

  // The solution space: every state the water can be in, and every pour.
  function openMap() {
    if (!play || root.querySelector('.wl-map')) return;
    const view = new SpaceView(root.querySelector('.wl-screen'), play.level, { state: play.state, history: play.history });
    // Handle for the end-to-end tests.
    window.__waterMap = view;
    ctx.track('water_map', { level: play.level.n });
  }

  function win(n, { moves, par, stars }) {
    if (!play) return;
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars });
    ctx.sfx('win');
    ctx.haptic(40);
    const note = moves <= par
      ? 'Perfect — the fewest pours possible!'
      : `It can be done in ${par} pour${par === 1 ? '' : 's'}. Can you find how?`;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
      stars,
      text: `<b>${moves}</b> pour${moves === 1 ? '' : 's'}. ${note}`,
      buttons: [
        { label: 'Map', act: 'map', run: () => openMap() },
        { label: 'Replay', act: 'replay', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/water/${n + 1}`, { replace: true }) },
      ],
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
