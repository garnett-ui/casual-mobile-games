// Benji's Town: the levels, the town, and a big "Yay!" at the end of each.
import { makeTown } from './town.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';

const CHEERS = ['Yay!', 'Well done!', 'Hooray!', 'Super!', 'Brilliant!'];

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  let play = null;
  let onResize = null;

  // Said out loud, for someone too little to read (with the sound on).
  const say = (text) => {
    if (!ctx.getSetting('sound') || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.pitch = 1.25;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // (No voice: just the pictures, then.)
    }
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
      id: 'benji',
      title: 'Benji’s Town',
      intro: 'Tap the garbage truck, the mail van, the dog walker and the cement mixer, and off they go to work!',
      outro: 'From level 6, drive them yourself: put a finger on one and lead it along the streets.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    const town = makeTown(n);
    root.innerHTML = `
      <div class="screen play-screen bt-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}${town.drive ? ' 👆' : ''}</h2>
          <button class="icon-btn" data-act="restart" aria-label="Start again">${ICON.restart}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas></div>
        <div class="dialog" hidden></div>
      </div>`;
    ctx.track('level_start', { level: n });
    const start = () => {
      if (play) play.destroy();
      play = new Play(root.querySelector('canvas'), town, {
        sfx: ctx.sfx,
        haptic: ctx.haptic,
        say,
        onWin: () => won(n),
      });
      // Handle for the end-to-end tests (test/e2e.test.mjs).
      window.__benji = play;
    };
    start();
    say(town.drive ? 'Drive them with your finger!' : 'Tap a truck!');
    onResize = () => play?.resize();
    window.addEventListener('resize', onResize);
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/benji');
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      root.querySelector('.dialog').hidden = true;
      start();
    };
  }

  // Every finished level is three stars: there's no wrong way to play.
  function won(n) {
    if (!play) return;
    progress.complete(n, 3);
    ctx.track('level_complete', { level: n, stars: 3 });
    showDialog(root.querySelector('.dialog'), ctx, {
      title: CHEERS[n % CHEERS.length],
      stars: 3,
      text: 'All the jobs are done!',
      buttons: [
        { label: '↻', act: 'replay', run: () => showPlay(n) },
        { label: '▶', act: 'next', primary: true, run: () => ctx.navigate(`#/benji/${n + 1}`, { replace: true }) },
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
