// Car Jam: screens (level select, play HUD, win dialog) around Play.
import { makeLevel, BASE_SEED, GEN_VERSION } from './levels.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { levelSource } from '../../js/lib/level-source.js';

const CHEERS = ['Lot cleared!', 'Smooth driving!', 'Nicely parked!', 'Traffic genius!', 'Beep beep, hooray!'];

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
      id: 'car-jam',
      title: 'Car Jam',
      intro: 'Swipe or tap cars to drive them out of the lot. Clear every car to win!',
      outro: 'The lots never run out, and every one is a little tougher than the last.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    showing = n;
    root.innerHTML = `
      <div class="screen play-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
        </header>
        <div class="stage building"><div class="spinner"></div><p>Building the lot…</p></div>
      </div>`;
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/car-jam');
    levels.get(n).then((level) => {
      if (showing === n && !play) startPlay(n, level);
    });
  }

  function startPlay(n, level) {
    ctx.track('level_start', { level: n });
    // Build the next lot in the background while this one is played.
    levels.get(n + 1);
    root.innerHTML = `
      <div class="screen play-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <span class="pill moves"><b data-moves>0</b>&nbsp;moves<b class="cj-penalty" data-penalty hidden></b> · par ${level.par}</span>
        </header>
        <div class="stage"><canvas class="board"></canvas></div>
        <footer class="controls">
          <button class="ctl" data-act="undo">${ICON.undo}<span>Undo</span></button>
          <button class="ctl" data-act="restart">${ICON.restart}<span>Restart</span></button>
          <button class="ctl" data-act="hint">${ICON.hint}<span>Hint</span></button>
        </footer>
        <div class="tip" hidden></div>
        <div class="dialog" hidden></div>
      </div>`;
    const movesEl = root.querySelector('[data-moves]');
    const canvas = root.querySelector('canvas');
    play = new Play(canvas, level, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      toast: ctx.toast,
      onMoves: (m) => {
        movesEl.textContent = m;
        const tip = root.querySelector('.tip');
        if (m > 0 && tip) tip.hidden = true;
      },
      onPenalty: (scares, extra) => {
        const el = root.querySelector('[data-penalty]');
        el.hidden = false;
        el.textContent = ` +${extra}`;
        el.title = `${scares} granny scare${scares === 1 ? '' : 's'}`;
        if (!ctx.load('grannyTip', false)) {
          ctx.save('grannyTip', true);
          ctx.toast('Watch the grannies! Sending a car at one costs 2 moves.');
        }
      },
      onWin: (result) => setTimeout(() => showWin(n, result), 350),
    });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__carJamPlay = play;
    onResize = () => play && play.resize();
    window.addEventListener('resize', onResize);
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/car-jam');
    root.querySelector('[data-act=undo]').onclick = () => {
      ctx.sfx('tap');
      play.undo();
    };
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      play.reset();
      root.querySelector('[data-penalty]').hidden = true;
    };
    root.querySelector('[data-act=hint]').onclick = () => {
      ctx.sfx('tap');
      play.showHint();
    };
    if (level.tip) {
      const tip = root.querySelector('.tip');
      tip.textContent = level.tip;
      tip.hidden = false;
      tip.onclick = () => (tip.hidden = true);
    }
  }

  function showWin(n, { moves, scares, total, par, stars }) {
    if (!play) return;
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars, scares });
    ctx.sfx('win');
    ctx.haptic(40);
    const note = total <= par ? 'Perfect — you matched par!' : `Par is ${par}. Can you do it in fewer moves?`;
    const penalty = scares ? ` + ${scares * 2} for ${scares} granny scare${scares === 1 ? '' : 's'} = <b>${total}</b>.` : '';
    showDialog(root.querySelector('.dialog'), ctx, {
      title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
      stars,
      text: `<b>${moves}</b> moves${penalty}${penalty ? '' : '.'} ${note}`,
      buttons: [
        { label: 'Replay', act: 'replay', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/car-jam/${n + 1}`, { replace: true }) },
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
