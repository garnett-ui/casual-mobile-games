// Shared screens for level-based games: icons, star rows, saved progress,
// the level-select grid and the end-of-level dialog.
import { GAMES } from '../games.js';

export const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h10a6 6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" transform="translate(0 -4)"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hint: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
};

export const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';

export function starRow(n, cls = '') {
  return `<span class="stars ${cls}">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}">${STAR}</i>`).join('')}</span>`;
}

// { unlocked, stars: { [level]: best } } saved per game.
export function loadProgress(ctx) {
  const data = { unlocked: 1, stars: {}, ...ctx.load('progress', {}) };
  return {
    data,
    total: () => Object.values(data.stars).reduce((a, b) => a + b, 0),
    complete(n, stars) {
      data.stars[n] = Math.max(data.stars[n] || 0, stars);
      data.unlocked = Math.max(data.unlocked, n + 1);
      ctx.save('progress', data);
    },
  };
}

// Level grid: every unlocked level plus a few locked ones ahead (up to
// count, for a game with only so many). badge(n), if given, puts a little
// mark in a level's corner (explained in the outro); note(n), a few words
// under its stars.
export function renderLevelSelect(root, ctx, { id, title, intro, outro, progress, badge, note, count = Infinity }) {
  const { unlocked, stars } = progress.data;
  const credit = GAMES.find((g) => g.id === id)?.credit;
  let tiles = '';
  for (let n = 1; n <= Math.min(unlocked + 11, count); n++) {
    const locked = n > unlocked;
    const mark = !locked && badge?.(n);
    const words = !locked && note?.(n);
    tiles += `<button class="lvl ${locked ? 'locked' : ''}" data-n="${n}" ${locked ? 'disabled' : ''}>
      ${mark ? `<span class="lvl-badge">${mark}</span>` : ''}
      <span class="lvl-n">${locked ? ICON.lock : n}</span>
      ${locked ? '' : starRow(stars[n] || 0, 'small')}
      ${words ? `<span class="lvl-note">${words}</span>` : ''}
    </button>`;
  }
  root.innerHTML = `
    <div class="screen levels-screen">
      <header class="bar">
        <button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button>
        <h2>${title}</h2>
        <span class="pill">${STAR}<b>${progress.total()}</b></span>
      </header>
      <div class="levels-scroll">
        <p class="levels-intro">${intro}</p>
        <div class="lvl-grid">${tiles}</div>
        <p class="levels-intro">${outro}</p>
        ${credit ? `<p class="levels-credit">Contributed by <a href="${credit.url}" target="_blank" rel="noopener">${credit.name}</a></p>` : ''}
        <button class="arcade-link" data-act="arcade">🕹️ Part of <b>Pocket Arcade</b> · ${GAMES.length - 1} more games</button>
      </div>
    </div>`;
  root.querySelector('[data-act=home]').onclick = () => ctx.back('#/');
  // (For someone sent a link to just this game: there's more.)
  root.querySelector('[data-act=arcade]').onclick = () => ctx.navigate('#/');
  root.querySelectorAll('.lvl:not(.locked)').forEach((b) => {
    b.onclick = () => {
      ctx.sfx('tap');
      ctx.navigate(`#/${id}/${b.dataset.n}`);
    };
  });
  const cur = root.querySelector(`.lvl[data-n="${unlocked}"]`);
  cur?.classList.add('current');
  cur?.scrollIntoView({ block: 'center' });
}

// End-of-level card. buttons: [{ label, act, primary, run }]
export function showDialog(dlg, ctx, { title, stars, text, buttons }) {
  dlg.innerHTML = `
    <div class="dialog-card">
      <h3>${title}</h3>
      ${stars === undefined ? '' : starRow(stars, 'big')}
      <p>${text}</p>
      <div class="dialog-btns">
        ${buttons.map((b, k) => `<button class="btn ${b.primary ? 'primary' : ''}" data-k="${k}" data-act="${b.act || ''}">${b.label}</button>`).join('')}
      </div>
    </div>`;
  dlg.hidden = false;
  dlg.querySelectorAll('.stars i.on').forEach((el, k) => {
    el.style.animationDelay = `${0.15 + k * 0.25}s`;
    setTimeout(() => ctx.sfx('star'), 150 + k * 250);
  });
  dlg.querySelectorAll('[data-k]').forEach((el) => {
    el.onclick = () => {
      ctx.sfx('tap');
      buttons[el.dataset.k].run();
    };
  });
}
