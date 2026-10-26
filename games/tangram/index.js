// Tangram: the list of figures, the board, and the end-of-level card.
import { figure, FIGURES } from './model.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';

// How to play, said once, on the level where it's first needed.
const TIPS = {
  1: 'Drag the pieces onto the shape. Tap a piece to turn it.',
  5: 'This one needs the parallelogram turned over: tap Flip.',
};
const CHEERS = ['You made it!', 'Perfect fit!', 'Well done!', 'Bravo!', 'Just right!'];
// Turning over: a triangle and its mirror image either side of a fold.
const FLIP = '<svg viewBox="0 0 24 24"><path d="M12 3v18" stroke="currentColor" stroke-width="2" stroke-dasharray="2.5 2.5"/><path d="M9.5 6L2.5 18h7z" fill="currentColor"/><path d="M14.5 6l7 12h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  let play = null;
  let onResize = null;

  function teardown() {
    if (play) play.destroy();
    play = null;
    if (onResize) window.removeEventListener('resize', onResize);
    onResize = null;
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'tangram',
      title: 'Tangram',
      intro: 'Seven pieces, cut from one square. Move them, turn them and flip them to fill each shape: every piece, and no overlapping.',
      outro: 'The shapes go from simple to hard, and end with the square the pieces came from.',
      progress,
      count: FIGURES.length,
      note: (n) => FIGURES[n - 1].name,
    });
  }

  function showPlay(n) {
    teardown();
    const fig = figure(n);
    root.innerHTML = `
      <div class="screen play-screen tg-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>${fig.name}</h2>
          <span class="pill">${n} / ${FIGURES.length}</span>
        </header>
        <div class="stage"><canvas class="board"></canvas></div>
        <footer class="controls">
          <button class="ctl" data-act="restart">${ICON.restart}<span>Restart</span></button>
          <button class="ctl" data-act="flip">${FLIP}<span>Flip</span></button>
          <button class="ctl" data-act="hint">${ICON.hint}<span>Hint</span></button>
        </footer>
        <div class="dialog" hidden></div>
      </div>`;
    ctx.track('level_start', { level: n });
    play = new Play(root.querySelector('canvas'), fig, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onWin: (res) => setTimeout(() => win(n, res), 900),
    }, { tip: TIPS[n] || '' });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__tangram = play;
    onResize = () => play?.resize();
    window.addEventListener('resize', onResize);
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/tangram');
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      play.reset();
    };
    root.querySelector('[data-act=flip]').onclick = () => play.flip();
    root.querySelector('[data-act=hint]').onclick = () => {
      if (!play.hint()) ctx.sfx('tap');
    };
  }

  function win(n, { hints, stars }) {
    if (!play) return;
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars });
    ctx.sfx('win');
    ctx.haptic(40);
    const last = n >= FIGURES.length;
    const how = hints ? `with ${hints} hint${hints === 1 ? '' : 's'}.` : 'all by yourself!';
    showDialog(root.querySelector('.dialog'), ctx, {
      title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
      stars,
      text: `The <b>${play.fig.name.toLowerCase()}</b>, ${how}${last ? ' That’s every shape: the pieces are back in their square.' : ''}`,
      buttons: [
        { label: 'Replay', act: 'replay', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        last
          ? { label: 'All shapes', act: 'levels', primary: true, run: () => ctx.navigate('#/tangram', { replace: true }) }
          : { label: 'Next shape', act: 'next', primary: true, run: () => ctx.navigate(`#/tangram/${n + 1}`, { replace: true }) },
      ],
    });
  }

  function route(s) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= Math.min(progress.data.unlocked, FIGURES.length)) showPlay(n);
    else showLevels();
  }

  route(sub);
  return { route, destroy: teardown };
}
