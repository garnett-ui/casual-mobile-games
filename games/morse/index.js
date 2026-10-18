// Morse Rain: level select, the lesson, and how you did.
import { CODE, levelSpec, starsFor } from './code.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { playMorse } from '../../js/lib/audio.js';

const pattern = (code) => [...code].map((s) => (s === '.' ? '·' : '−')).join(' ');

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
      intro: 'Letters fall face down, each sounding its Morse code as it comes into view. Tap a tile on the board with the letter you heard to clear it.',
      outro: 'A couple of new characters each level: the short letters first, then the longer ones, numbers and punctuation. Then faster, up to 20 words a minute.',
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
          <span class="pill"><b data-left>${spec.letters.length}</b>&nbsp;to go · ${spec.wpm} wpm</span>
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
      leftEl.textContent = spec.letters.length - play.next + play.falling.filter((f) => !f.penalty).length;
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
      .map((ch) => `<button class="btn mr-key" data-ch="${ch}"><b>${ch}</b><span>${pattern(CODE[ch])}</span></button>`)
      .join('');
    const text = list.length
      ? `New ${list.length === 1 ? 'character' : 'characters'}: tap to listen.<div class="mr-keys">${keys}</div>
        ${n === 1 ? 'Each letter falls face down, sounding its code. Tap a tile <b>on the board</b> with the letter you heard: it’s cleared, and so is the falling one. One nobody answers lands face up. Tap a falling tile to hear it again.' : `With all ${spec.alphabet.length} so far, at ${spec.wpm} words a minute.`}`
      : `A review: all ${spec.alphabet.length} characters so far, at ${spec.wpm} words a minute.`;
    ctx.track('level_start', { level: n });
    showDialog(dialog, ctx, {
      title: list.length ? `Level ${n}` : `Level ${n}: review`,
      text,
      buttons: [{ label: 'Start', act: 'start', primary: true, run: () => {
        dialog.hidden = true;
        play.paused = false;
      } }],
    });
    dialog.querySelectorAll('.mr-key').forEach((b) => {
      b.onclick = () => playMorse(CODE[b.dataset.ch]);
    });
  }

  function over(n, res) {
    if (!play) return;
    const dialog = root.querySelector('.dialog');
    if (!res.won) {
      ctx.track('level_fail', { level: n });
      ctx.sfx('lose');
      showDialog(dialog, ctx, {
        title: 'Piled up to the top',
        text: `You got <b>${res.right}</b> of the ${res.chances} letters you could have. Tap a falling tile to hear it again -- and replay earlier levels to practise.`,
        buttons: [
          { label: 'Levels', act: 'levels', run: () => ctx.back('#/morse') },
          { label: 'Try again', act: 'retry', primary: true, run: () => showPlay(n) },
        ],
      });
      return;
    }
    const stars = starsFor(res.right - res.wrong / 2, res.chances);
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars });
    ctx.sfx('win');
    const clear = res.left === 0 ? ' And the board’s clear!' : '';
    showDialog(dialog, ctx, {
      title: stars === 3 ? 'Loud and clear!' : stars === 2 ? 'Good copy' : 'Made it through',
      stars,
      text: `You got <b>${res.right}</b> of the ${res.chances} letters you could have (their letter was on the board as they fell)${res.wrong ? `, with ${res.wrong} wrong tap${res.wrong === 1 ? '' : 's'}` : ''}.${clear}`,
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
