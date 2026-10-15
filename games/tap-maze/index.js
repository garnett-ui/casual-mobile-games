// Tap Maze: level select, play screen (hearts, hint, restart) and dialogs.
import { makeLevel, BASE_SEED } from './levels.js';
import { Play, HEARTS } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { levelSource } from '../../js/lib/level-source.js';

const GEN_VERSION = 1;
const CHEERS = ['Maze cleared!', 'Straight to the point!', 'Arrow-some!', 'Bullseye!', 'Nothing but net!'];

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  const levels = levelSource(ctx, {
    workerUrl: new URL('./worker.js', import.meta.url),
    build: (n) => makeLevel(n),
    version: `${GEN_VERSION}:${BASE_SEED}`,
  });
  let play = null;
  let showing = 0;
  let onResize = null;

  function teardown() {
    showing = 0;
    if (play) play.destroy();
    play = null;
    if (onResize) window.removeEventListener('resize', onResize);
    onResize = null;
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'tap-maze',
      title: 'Tap Maze',
      intro: 'Tap arrows to send them off the board. Only arrows with a clear path ahead can leave!',
      outro: 'The mazes never run out, and every one is a little more tangled than the last.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    showing = n;
    root.innerHTML = `
      <div class="screen play-screen tm-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
        </header>
        <div class="stage building"><div class="spinner"></div><p>Drawing the maze…</p></div>
      </div>`;
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/tap-maze');
    levels.get(n).then((level) => {
      if (showing === n && !play) startPlay(n, level);
    });
  }

  function startPlay(n, level) {
    ctx.track('level_start', { level: n });
    levels.get(n + 1);
    root.innerHTML = `
      <div class="screen play-screen tm-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <span class="pill hearts" aria-label="Hearts">${ICON.heart.repeat(HEARTS)}</span>
        </header>
        <div class="stage"><canvas class="board"></canvas></div>
        <footer class="controls">
          <span class="left-count"><b data-left>0</b> arrows left</span>
          <button class="ctl" data-act="restart">${ICON.restart}<span>Restart</span></button>
          <button class="ctl" data-act="hint">${ICON.hint}<span>Hint</span></button>
        </footer>
        <div class="tip" hidden></div>
        <div class="dialog" hidden></div>
      </div>`;
    const hearts = root.querySelectorAll('.hearts svg');
    const leftEl = root.querySelector('[data-left]');
    const tip = root.querySelector('.tip');
    play = new Play(root.querySelector('canvas'), level, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onState: ({ hearts: h, left, total }) => {
        hearts.forEach((el, k) => el.classList.toggle('lost', k >= h));
        leftEl.textContent = left;
        if (left < total) tip.hidden = true;
      },
      onWin: (result) => setTimeout(() => showWin(n, result), 300),
      onFail: () => setTimeout(() => showFail(n), 300),
    });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__tapMazePlay = play;
    onResize = () => play && play.resize();
    window.addEventListener('resize', onResize);
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/tap-maze');
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      root.querySelector('.dialog').hidden = true;
      play.reset();
    };
    root.querySelector('[data-act=hint]').onclick = () => {
      ctx.sfx('tap');
      play.showHint();
    };
    if (level.tip) {
      tip.textContent = level.tip;
      tip.hidden = false;
      tip.onclick = () => (tip.hidden = true);
    }
  }

  function showWin(n, { stars, hearts }) {
    if (!play) return;
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars });
    ctx.sfx('win');
    ctx.haptic(40);
    const lost = HEARTS - hearts;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
      stars,
      text: lost ? `Cleared with ${hearts} heart${hearts > 1 ? 's' : ''} left. Can you do it without a bump?` : 'Flawless — not a single bump!',
      buttons: [
        { label: 'Replay', act: 'replay', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/tap-maze/${n + 1}`, { replace: true }) },
      ],
    });
  }

  function showFail(n) {
    if (!play) return;
    ctx.track('level_fail', { level: n });
    ctx.sfx('lose');
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'Out of hearts!',
      text: 'Look for an arrow with nothing at all between its head and the edge.',
      buttons: [
        { label: 'Levels', act: 'levels', run: () => ctx.back('#/tap-maze') },
        { label: 'Try again', act: 'retry', primary: true, run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
      ],
    });
  }

  function route(s) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= progress.data.unlocked) showPlay(n);
    else showLevels();
  }

  route(sub);
  return {
    route,
    destroy() {
      teardown();
      levels.destroy();
    },
  };
}
