// Car Jam: screens (level select, play HUD, win dialog) around Play.
import { makeLevel, BASE_SEED, GEN_VERSION } from './levels.js';
import { Play } from './play.js';

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h10a6 6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" transform="translate(0 -4)"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hint: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
};
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const CHEERS = ['Lot cleared!', 'Smooth driving!', 'Nicely parked!', 'Traffic genius!', 'Beep beep, hooray!'];

// Levels are generated from a seed on the device. Building a big lot can take
// a few seconds on a phone, so it happens in a worker, the next level is built
// ahead while you play, and recent levels are kept in storage.
function levelSource(ctx) {
  const memo = new Map();
  let worker = null;
  const waiting = new Map();
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const done = waiting.get(e.data.n);
      waiting.delete(e.data.n);
      done?.(e.data.level);
    };
    // Older browsers without module workers: build on the main thread.
    worker.onerror = () => {
      worker = null;
      for (const [n, done] of waiting) setTimeout(() => done(makeLevel(n)), 30);
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  const key = (n) => `level:${GEN_VERSION}:${BASE_SEED}:${n}`;
  const get = (n) => {
    if (memo.has(n)) return memo.get(n);
    const stored = ctx.load(key(n), null);
    const p = stored ? Promise.resolve(stored) : new Promise((resolve) => {
      if (worker) {
        waiting.set(n, resolve);
        worker.postMessage({ n, base: BASE_SEED });
      } else {
        setTimeout(() => resolve(makeLevel(n)), 30);
      }
    }).then((level) => {
      ctx.save(key(n), level);
      // Keep storage tidy: drop levels well behind this one.
      ctx.save(key(n - 6), null);
      return level;
    });
    memo.set(n, p);
    return p;
  };
  return { get, destroy: () => worker?.terminate() };
}

export function mount(root, ctx, sub) {
  const progress = { unlocked: 1, stars: {}, ...ctx.load('progress', {}) };
  const levels = levelSource(ctx);
  let play = null;
  let showing = 0;
  let onResize = null;

  const saveProgress = () => ctx.save('progress', progress);
  const totalStars = () => Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const starRow = (n, cls = '') =>
    `<span class="stars ${cls}">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}">${STAR}</i>`).join('')}</span>`;

  function teardown() {
    showing = 0;
    if (play) play.destroy();
    play = null;
    if (onResize) window.removeEventListener('resize', onResize);
    onResize = null;
  }

  function showLevels() {
    teardown();
    const count = progress.unlocked + 11;
    let tiles = '';
    for (let n = 1; n <= count; n++) {
      const locked = n > progress.unlocked;
      tiles += `<button class="lvl ${locked ? 'locked' : ''}" data-n="${n}" ${locked ? 'disabled' : ''}>
        <span class="lvl-n">${locked ? ICON.lock : n}</span>
        ${locked ? '' : starRow(progress.stars[n] || 0, 'small')}
      </button>`;
    }
    root.innerHTML = `
      <div class="screen levels-screen">
        <header class="bar">
          <button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button>
          <h2>Car Jam</h2>
          <span class="pill">${STAR}<b>${totalStars()}</b></span>
        </header>
        <div class="levels-scroll">
          <p class="levels-intro">Swipe or tap cars to drive them out of the lot. Clear every car to win!</p>
          <div class="lvl-grid">${tiles}</div>
          <p class="levels-intro">The lots never run out, and every one is a little tougher than the last.</p>
        </div>
      </div>`;
    root.querySelector('[data-act=home]').onclick = () => ctx.back('#/');
    root.querySelectorAll('.lvl:not(.locked)').forEach((b) => {
      b.onclick = () => {
        ctx.sfx('tap');
        ctx.navigate(`#/car-jam/${b.dataset.n}`);
      };
    });
    const cur = root.querySelector(`.lvl[data-n="${progress.unlocked}"]`);
    cur?.classList.add('current');
    cur?.scrollIntoView({ block: 'center' });
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
    // Build the next lot in the background while this one is played.
    levels.get(n + 1);
    root.innerHTML = `
      <div class="screen play-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <span class="pill moves"><b data-moves>0</b>&nbsp;moves · par ${level.par}</span>
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

  function showWin(n, { moves, par, stars }) {
    if (!play) return;
    const prev = progress.stars[n] || 0;
    progress.stars[n] = Math.max(prev, stars);
    progress.unlocked = Math.max(progress.unlocked, n + 1);
    saveProgress();
    ctx.sfx('win');
    ctx.haptic(40);
    const dlg = root.querySelector('.dialog');
    const note = moves <= par ? 'Perfect — you matched par!' : `Par is ${par}. Can you do it in fewer moves?`;
    dlg.innerHTML = `
      <div class="dialog-card">
        <h3>${CHEERS[Math.floor(Math.random() * CHEERS.length)]}</h3>
        ${starRow(stars, 'big')}
        <p><b>${moves}</b> moves. ${note}</p>
        <div class="dialog-btns">
          <button class="btn" data-act="replay">Replay</button>
          <button class="btn primary" data-act="next">Next level</button>
        </div>
      </div>`;
    dlg.hidden = false;
    dlg.querySelectorAll('.stars i.on').forEach((el, k) => {
      el.style.animationDelay = `${0.15 + k * 0.25}s`;
      setTimeout(() => ctx.sfx('star'), 150 + k * 250);
    });
    dlg.querySelector('[data-act=replay]').onclick = () => {
      dlg.hidden = true;
      play.reset();
    };
    dlg.querySelector('[data-act=next]').onclick = () => {
      ctx.sfx('tap');
      ctx.navigate(`#/car-jam/${n + 1}`, { replace: true });
    };
  }

  function route(s) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= progress.unlocked) showPlay(n);
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
