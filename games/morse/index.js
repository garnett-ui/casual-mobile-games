// Morse Rain: level select, the lesson, and how you did.
import { CODE, levelSpec, starsFor } from './code.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { playMorse } from '../../js/lib/audio.js';


export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  let play = null;
  let onResize = null;
  let onHide = null;

  function teardown() {
    if (play) play.destroy();
    play = null;
    if (onResize) window.removeEventListener('resize', onResize);
    if (onHide) document.removeEventListener('visibilitychange', onHide);
    onResize = onHide = null;
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'morse',
      title: 'Morse Rain',
      intro: 'A cloud of letters drifts about. Listen to the Morse code for one of them, and tap it. Clear the screen!',
      outro: 'E I A N T to start, then a couple of new characters each level -- the rest of the letters, numbers and punctuation -- then bigger reviews of the lot. Always sent at 20 words a minute, as real Morse sounds; each one repeats until you find it.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    const spec = levelSpec(n);
    root.innerHTML = `
      <div class="screen play-screen mr-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <span class="pill"><b data-left>${spec.letters.length}</b>&nbsp;left</span>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas>
          <div class="pause-card" hidden><div><b>Paused</b><span>Tap to carry on.</span></div></div>
        </div>
        <div class="dialog" hidden></div>
      </div>`;
    const dialog = root.querySelector('.dialog');
    const pausedCard = root.querySelector('.pause-card');
    const leftEl = root.querySelector('[data-left]');
    play = new Play(root.querySelector('canvas'), spec, {
      morse: (code) => playMorse(code),
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onOver: (res) => setTimeout(() => over(n, res), 500),
    });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__morse = play;
    const tick = setInterval(() => {
      if (!play) return clearInterval(tick);
      leftEl.textContent = play.tiles.length;
    }, 200);
    onResize = () => play?.resize();
    window.addEventListener('resize', onResize);
    const pause = () => {
      if (!play || play.paused || play.over || !dialog.hidden) return;
      play.paused = true;
      pausedCard.hidden = false;
    };
    onHide = () => document.hidden && pause();
    document.addEventListener('visibilitychange', onHide);
    pausedCard.onclick = () => {
      pausedCard.hidden = true;
      play.paused = false;
    };
    root.querySelector('[data-act=pause]').onclick = () => {
      ctx.sfx('tap');
      pause();
    };
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/morse');
    intro(n, spec);
  }

  // Before the lesson: the new characters, to hear.
  function intro(n, spec) {
    const dialog = root.querySelector('.dialog');
    const list = spec.fresh.length ? spec.fresh : [];
    const keys = list
      .map((ch) => `<button class="btn mr-key" data-ch="${ch}"><b>${ch}</b></button>`)
      .join('');
    // Audio only: Morse is learnt by ear, never from the printed dots and
    // dashes.
    const quiet = !ctx.getSetting('sound');
    const text = (quiet ? '<b>Sound is off -- and this game is all sound. Start turns it on.</b><br><br>' : '') + (list.length
      ? `New ${list.length === 1 ? 'character' : 'characters'}: tap to listen.<div class="mr-keys">${keys}</div>
        ${n === 1 ? 'You’ll hear the code for one of the letters on the screen, again and again till you find it: tap a tile with that letter and it’s gone. Clear them all! Tap the wrong letter and a copy of the right one floats in.' : `With all ${spec.alphabet.length} so far.`}`
      : `A review: all ${spec.alphabet.length} characters so far.`);
    ctx.track('level_start', { level: n });
    showDialog(dialog, ctx, {
      title: list.length ? `Level ${n}` : `Level ${n}: review`,
      text,
      buttons: [{ label: 'Start', act: 'start', primary: true, run: () => {
        if (!ctx.getSetting('sound')) ctx.setSetting('sound', true);
        dialog.hidden = true;
        play.paused = false;
      } }],
    });
    dialog.querySelectorAll('.mr-key').forEach((b) => {
      b.onclick = () => {
        if (!ctx.getSetting('sound')) ctx.setSetting('sound', true);
        playMorse(CODE[b.dataset.ch]);
      };
    });
  }

  function over(n, res) {
    if (!play) return;
    const dialog = root.querySelector('.dialog');
    if (!res.won) {
      ctx.track('level_fail', { level: n });
      ctx.sfx('lose');
      showDialog(dialog, ctx, {
        title: 'Too many letters!',
        text: `The cloud grew to twice its size. You cleared <b>${res.right}</b>. Tap the background to hear a letter again -- and replay earlier levels to practise.`,
        buttons: [
          { label: 'Levels', act: 'levels', run: () => ctx.back('#/morse') },
          { label: 'Try again', act: 'retry', primary: true, run: () => showPlay(n) },
        ],
      });
      return;
    }
    const stars = starsFor(res.total - res.wrong, res.total);
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars });
    ctx.sfx('win');

    showDialog(dialog, ctx, {
      title: stars === 3 ? 'Loud and clear!' : stars === 2 ? 'Good copy' : 'Made it through',
      stars,
      text: `All ${res.right} cleared${res.wrong ? `, with ${res.wrong} wrong tap${res.wrong === 1 ? '' : 's'}` : ' -- not a single wrong tap'}.`,
      buttons: [
        { label: 'Replay', act: 'replay', run: () => showPlay(n) },
        { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/morse/${n + 1}`, { replace: true }) },
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
