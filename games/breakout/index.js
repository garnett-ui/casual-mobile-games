// Breakout: pick portrait or landscape, then play. Once a game starts the
// screen orientation is locked where the device allows it; where it doesn't
// (e.g. iOS), the game pauses if the phone is turned the other way.
import { Play } from './play.js';
import { ICON, showDialog } from '../../js/lib/campaign.js';
import { lockOrientation, unlockOrientation, currentOrientation } from '../../js/lib/orientation.js';

const PHONE = (kind) => kind === 'portrait'
  ? '<svg viewBox="0 0 48 48"><rect x="14" y="4" width="20" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><rect x="19" y="13" width="10" height="3" rx="1" fill="#ff8c1a"/><rect x="19" y="18" width="10" height="3" rx="1" fill="#2ec27e"/><circle cx="24" cy="30" r="2" fill="currentColor"/><rect x="19" y="37" width="10" height="2.5" rx="1" fill="#ff6b81"/></svg>'
  : '<svg viewBox="0 0 48 48"><rect x="4" y="14" width="40" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><rect x="10" y="18" width="8" height="3" rx="1" fill="#ff8c1a"/><rect x="20" y="18" width="8" height="3" rx="1" fill="#2ec27e"/><rect x="30" y="18" width="8" height="3" rx="1" fill="#e5383b"/><circle cx="24" cy="25" r="1.8" fill="currentColor"/><rect x="19" y="29" width="10" height="2.5" rx="1" fill="#ff6b81"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

export function mount(root, ctx) {
  let play = null;
  let kind = ctx.load('orientation', 'portrait');
  let onResize = null;
  let onVisibility = null;
  const best = { portrait: 0, landscape: 0, ...ctx.load('best', {}) };

  // Stop the current game; the orientation stays locked until we leave.
  function stopGame() {
    if (play) play.destroy();
    play = null;
    if (onResize) window.removeEventListener('resize', onResize);
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    onResize = onVisibility = null;
  }

  function teardown() {
    stopGame();
    unlockOrientation();
  }

  function showMenu() {
    teardown();
    root.innerHTML = `
      <div class="screen bo-menu">
        <header class="bar">
          <button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button>
          <h2>Breakout</h2>
        </header>
        <div class="bo-menu-body">
          <p class="levels-intro">Bounce the ball off your paddle and smash every brick. Drag anywhere to move the paddle; tap to launch.</p>
          <p class="bo-pick">How do you want to hold your phone?</p>
          <div class="bo-choices">
            ${['portrait', 'landscape'].map((k) => `
              <button class="bo-choice ${k === kind ? 'selected' : ''}" data-kind="${k}">
                ${PHONE(k)}
                <b>${k === 'portrait' ? 'Portrait' : 'Landscape'}</b>
                <small>Best: ${best[k]}</small>
              </button>`).join('')}
          </div>
          <p class="bo-note">The screen stays in this orientation until you leave the game.</p>
        </div>
      </div>`;
    root.querySelector('[data-act=home]').onclick = () => ctx.back('#/');
    root.querySelectorAll('.bo-choice').forEach((b) => {
      b.onclick = () => {
        ctx.sfx('tap');
        kind = b.dataset.kind;
        ctx.save('orientation', kind);
        start();
      };
    });
  }

  async function start() {
    // Lock first (it needs this tap), then build the screen for that shape.
    const locked = await lockOrientation(kind);
    stopGame();
    root.innerHTML = `
      <div class="screen play-screen bo-screen">
        <header class="bar">
          <button class="icon-btn" data-act="menu" aria-label="Menu">${ICON.back}</button>
          <span class="pill bo-score"><b data-score>0</b></span>
          <span class="pill bo-stage">Wall <b data-stage>1</b></span>
          <span class="bo-balls" data-lives></span>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${PAUSE}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas>
          <div class="bo-overlay" hidden></div>
        </div>
        <div class="dialog" hidden></div>
      </div>`;
    const overlay = root.querySelector('.bo-overlay');
    const scoreEl = root.querySelector('[data-score]');
    const stageEl = root.querySelector('[data-stage]');
    const livesEl = root.querySelector('[data-lives]');
    ctx.track('game_start', { orientation: kind, locked });

    play = new Play(root.querySelector('canvas'), kind, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onState: ({ score, lives, stage }) => {
        scoreEl.textContent = score;
        stageEl.textContent = stage;
        livesEl.innerHTML = '<i></i>'.repeat(Math.max(0, lives - 1));
      },
      onClear: (stage) => {
        ctx.track('level_complete', { level: stage - 1 });
        message(`Wall ${stage - 1} cleared!`, 'Bonus ball. Tap to launch the next wall.', 1600);
      },
      onGameOver: gameOver,
    });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__breakout = play;

    let hideTimer = 0;
    function message(title, text, autoHide) {
      overlay.innerHTML = `<div><b>${title}</b><span>${text}</span></div>`;
      overlay.hidden = false;
      clearTimeout(hideTimer);
      if (autoHide) hideTimer = setTimeout(() => (overlay.hidden = true), autoHide);
    }
    function pause(reason) {
      if (!play || play.game.over) return;
      play.paused = true;
      if (reason === 'rotate') {
        overlay.dataset.reason = 'rotate';
        message(`Turn your phone back to ${kind}`, 'The game is paused until you do.');
      } else {
        overlay.dataset.reason = 'pause';
        message('Paused', 'Tap to continue.');
      }
    }
    function resume() {
      if (!play) return;
      if (currentOrientation() !== kind) return pause('rotate');
      overlay.hidden = true;
      overlay.dataset.reason = '';
      play.paused = false;
      play.last = performance.now();
    }
    overlay.onclick = () => overlay.dataset.reason !== 'rotate' && resume();

    // If the phone can't lock, guard against it being turned mid-game.
    const checkShape = () => {
      if (!play) return;
      play.resize();
      if (currentOrientation() !== kind) pause('rotate');
      else if (overlay.dataset.reason === 'rotate') {
        overlay.dataset.reason = 'pause';
        message('Ready', 'Tap to continue.');
      }
    };
    onResize = checkShape;
    window.addEventListener('resize', onResize);
    onVisibility = () => document.visibilityState === 'hidden' && pause('pause');
    document.addEventListener('visibilitychange', onVisibility);
    // The lock may rotate the screen a moment after we start.
    setTimeout(checkShape, 400);

    root.querySelector('[data-act=menu]').onclick = () => {
      ctx.sfx('tap');
      showMenu();
    };
    root.querySelector('[data-act=pause]').onclick = () => {
      ctx.sfx('tap');
      if (play.paused) resume();
      else pause('pause');
    };

    function gameOver({ score, stage }) {
      if (!play) return;
      const isBest = score > best[kind];
      if (isBest) {
        best[kind] = score;
        ctx.save('best', best);
      }
      ctx.track('game_over', { score, stage, orientation: kind });
      ctx.sfx('lose');
      showDialog(root.querySelector('.dialog'), ctx, {
        title: isBest ? 'New best score!' : 'Game over',
        text: `<b>${score}</b> points, reached wall ${stage}.${isBest ? '' : ` Best: ${best[kind]}.`}`,
        buttons: [
          { label: 'Menu', act: 'menu', run: showMenu },
          { label: 'Play again', act: 'again', primary: true, run: start },
        ],
      });
    }
  }

  showMenu();
  return { route: () => {}, destroy: teardown };
}
