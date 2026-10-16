// Water Lab: level select, the bench, and the end-of-level card.
import { makeLevel, goalText } from './model.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';

const TIPS = {
  1: 'Drag a beaker onto another to pour (or tap one, then the other). It pours until it’s empty or the other is full.',
  3: 'Three beakers and no tap: find a way to get exactly the amount asked for in any beaker.',
  7: 'Gold lines mark exact amounts wanted in particular beakers. Get them all at once!',
};
const CHEERS = ['Precisely!', 'Well measured!', 'Eureka!', 'Lab genius!', 'Spot on!'];

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
      outro: 'Every level is checked to be solvable, and par is the fewest pours it can be done in.',
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
          <span class="pill moves"><b data-moves>0</b>&nbsp;<span data-unit>pours</span> · par ${level.par}</span>
        </header>
        <div class="wl-goal sr-only">${goalText(level)}</div>
        <div class="stage"><canvas class="board"></canvas></div>
        <footer class="controls">
          <button class="ctl" data-act="undo">${ICON.undo}<span>Undo</span></button>
          <button class="ctl" data-act="restart">${ICON.restart}<span>Restart</span></button>
          <button class="ctl" data-act="hint">${ICON.hint}<span>Hint</span></button>
        </footer>
        <div class="tip" hidden></div>
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
        if (m > 0) root.querySelector('.tip').hidden = true;
      },
      onWin: (res) => setTimeout(() => win(n, res), 700),
    });
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
    if (TIPS[n]) {
      const tip = root.querySelector('.tip');
      tip.textContent = TIPS[n];
      tip.hidden = false;
      tip.onclick = () => (tip.hidden = true);
    }
  }

  function win(n, { moves, par, stars }) {
    if (!play) return;
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars });
    ctx.sfx('win');
    ctx.haptic(40);
    const note = moves <= par ? 'Perfect — you matched par!' : `Par is ${par}. Can you do it in fewer pours?`;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
      stars,
      text: `<b>${moves}</b> pour${moves === 1 ? '' : 's'}. ${note}`,
      buttons: [
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
