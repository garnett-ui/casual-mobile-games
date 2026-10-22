// 15: level select (with the tile style chooser), play screen (moves,
// restart, peek, hint, tiles) and the score card -- with a graph of how far
// from solved the board was after every move, against the best possible.
import { makeLevel, levelPlan, starsFor, review, BASE_SEED } from './levels.js';
import { Play } from './play.js';
import { coach } from './coach.js';
import { STYLES, styleOf, preview } from './styles.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { levelSource } from '../../js/lib/level-source.js';
import { savePhoto, listPhotos, getPhoto, decode } from '../../js/lib/photos.js';

const GEN_VERSION = 4;
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2"/></svg>';
const TILES = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2" opacity=".6"/><rect x="3" y="13" width="8" height="8" rx="2" opacity=".6"/></svg>';
const CHEERS = ['Solved!', 'In order!', 'Click, click, done!', 'Every tile home!'];

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  const levels = levelSource(ctx, {
    workerUrl: new URL('./worker.js', import.meta.url),
    build: (n) => makeLevel(n),
    version: `${GEN_VERSION}:${BASE_SEED}`,
  });
  let play = null;
  let follow = null;
  let showing = 0;
  let onResize = null;
  // The tiles: the player's choice, for every level.
  let styleKey = ctx.load('style', 'numbers');
  let labels = ctx.load('labels', false);
  const images = new Map(); // photo id -> decoded image

  function teardown() {
    showing = 0;
    play?.destroy();
    follow?.destroy();
    play = follow = null;
    if (onResize) window.removeEventListener('resize', onResize);
    onResize = null;
  }

  // The chosen style, ready to draw (a photo loaded; numbers if it's gone).
  async function chosenStyle() {
    const style = { ...styleOf(styleKey), labels };
    if (style.kind !== 'photo') return style;
    try {
      if (!images.has(style.id)) {
        const rec = await getPhoto(style.id);
        if (!rec) throw new Error('gone');
        images.set(style.id, await decode(rec.blob));
      }
      return { ...style, image: images.get(style.id) };
    } catch {
      styleKey = 'numbers';
      ctx.save('style', styleKey);
      return { ...styleOf(styleKey), labels };
    }
  }

  // The chooser: every style as a little picture, your photos, adding one,
  // and numbers in the corner. pick(style) when one's chosen.
  async function chooser(box, pick) {
    box.innerHTML = `
      <div class="ff-styles" role="listbox" aria-label="Tiles"></div>
      <label class="ff-labels"><input type="checkbox" ${labels ? 'checked' : ''}> Numbers in the corner</label>`;
    const strip = box.querySelector('.ff-styles');
    const add = (key, name, canvasOrImg) => {
      const b = document.createElement('button');
      b.className = `ff-style${key === styleKey ? ' on' : ''}`;
      b.dataset.style = key;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', key === styleKey);
      canvasOrImg.className = 'ff-swatch';
      b.append(canvasOrImg);
      b.insertAdjacentHTML('beforeend', `<span>${name}</span>`);
      b.onclick = async () => {
        ctx.sfx('tap');
        styleKey = key;
        ctx.save('style', key);
        strip.querySelectorAll('.ff-style').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-selected', x === b);
        });
        pick(await chosenStyle());
      };
      strip.append(b);
      return b;
    };
    for (const st of STYLES) add(st.key, st.name, preview(st, 112));
    // Your photos (shared with Jigsaw), and a new one.
    const more = document.createElement('label');
    more.className = 'ff-style ff-add';
    more.innerHTML = `<span class="ff-swatch ff-plus">+</span><span>Your photo</span><input type="file" accept="image/*" hidden>`;
    strip.append(more);
    more.querySelector('input').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        ctx.toast('Saving your photo…');
        const rec = await savePhoto(file);
        ctx.track('photo_added', { game: 'fifteen' });
        styleKey = `photo:${rec.id}`;
        ctx.save('style', styleKey);
        await chooser(box, pick);
        pick(await chosenStyle());
      } catch {
        ctx.toast('Sorry, that picture could not be opened.');
      }
    };
    box.querySelector('.ff-labels input').onchange = async (e) => {
      labels = e.target.checked;
      ctx.save('labels', labels);
      pick(await chosenStyle());
    };
    try {
      for (const p of await listPhotos()) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(p.blob);
        img.alt = '';
        strip.insertBefore(add(`photo:${p.id}`, 'Photo', img), more);
      }
    } catch {
      // (No photos here.)
    }
    strip.querySelector('.ff-style.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'fifteen',
      title: '15',
      intro: 'Slide the tiles back in order: tap one in line with the gap and it slides in, with any between. Choose what’s on the tiles -- for any level:',
      outro: 'Bigger and more scrambled boards as the levels go on, then 4×4s shuffled. After every puzzle, a graph of your moves against the best possible.',
      progress,
      note: (n) => levelPlan(n).slice(0, 2).join('×'),
    });
    const box = document.createElement('div');
    box.className = 'ff-chooser';
    root.querySelector('.levels-intro').after(box);
    chooser(box, () => {});
  }

  function showPlay(n) {
    teardown();
    showing = n;
    root.innerHTML = `
      <div class="screen play-screen ff-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
        </header>
        <div class="stage building"><div class="spinner"></div></div>
      </div>`;
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/fifteen');
    Promise.all([levels.get(n), chosenStyle()]).then(([level, style]) => {
      if (showing === n && !play) startPlay(n, level, style);
    });
  }

  function startPlay(n, level, style) {
    ctx.track('level_start', { level: n, style: style.kind === 'photo' ? 'photo' : style.key });
    levels.get(n + 1);
    root.innerHTML = `
      <div class="screen play-screen ff-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <span class="pill"><b data-moves>0</b>&nbsp;moves</span>
          <button class="icon-btn" data-act="tiles" aria-label="Tiles">${TILES}</button>
        </header>
        <div class="stage"><canvas class="board ff-board"></canvas></div>
        <footer class="controls">
          <button class="ctl" data-act="restart">${ICON.restart}<span>Restart</span></button>
          <button class="ctl" data-act="peek">${EYE}<span>Hold to peek</span></button>
          <button class="ctl" data-act="hint">${ICON.hint}<span>Hint</span></button>
        </footer>
        <div class="tip" hidden></div>
        <div class="ff-sheet" hidden><div class="ff-sheet-card"><h3>Tiles</h3><div class="ff-chooser"></div><button class="btn primary" data-act="done">Done</button></div></div>
        <div class="dialog" hidden></div>
      </div>`;
    const movesEl = root.querySelector('[data-moves]');
    const tip = root.querySelector('.tip');
    let hinted = false;
    let warned = false;
    const begin = () => {
      follow?.destroy();
      follow = coach(level);
      hinted = false;
    };
    begin();
    play = new Play(root.querySelector('canvas'), level, style, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onMove: (m) => {
        follow.move(m);
        movesEl.textContent = play.moves.length;
        tip.hidden = true;
      },
      onWin: () => finished(n, hinted),
      // (Some tiles alike: numbered, so there's still only one way.)
      onAlike: () => {
        if (warned) return;
        warned = true;
        setTimeout(() => ctx.toast('Some tiles look alike, so they’re numbered.'), 300);
      },
    });
    // Handles for the end-to-end tests (test/e2e.test.mjs).
    window.__fifteen = { play, coach: () => follow };
    onResize = () => play?.resize();
    window.addEventListener('resize', onResize);
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/fifteen');
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      root.querySelector('.dialog').hidden = true;
      play.reset();
      movesEl.textContent = 0;
      begin();
    };
    root.querySelector('[data-act=hint]').onclick = async () => {
      if (play.won) return;
      ctx.sfx('tap');
      hinted = true;
      const at = play.moves.length;
      const c = await follow.hint();
      if (play && play.moves.length === at) play.showHint(c);
    };
    const peek = root.querySelector('[data-act=peek]');
    peek.onpointerdown = (e) => {
      e.preventDefault();
      play.peek = true;
    };
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) peek.addEventListener(ev, () => play && (play.peek = false));
    // The tiles, changed mid-game: the board stays as it is.
    const sheet = root.querySelector('.ff-sheet');
    root.querySelector('[data-act=tiles]').onclick = () => {
      ctx.sfx('tap');
      sheet.hidden = false;
      chooser(sheet.querySelector('.ff-chooser'), (st) => {
        warned = false;
        play?.setStyle(st);
      });
    };
    sheet.querySelector('[data-act=done]').onclick = () => {
      ctx.sfx('tap');
      sheet.hidden = true;
    };
    if (n === 1) {
      tip.textContent = 'Tap a tile next to the gap to slide it in. Tap one further along the row or column and they all slide.';
      tip.hidden = false;
      tip.onclick = () => (tip.hidden = true);
    }
  }

  async function finished(n, hinted) {
    if (!play) return;
    const dialog = root.querySelector('.dialog');
    const time = play.won.time;
    const slides = play.slides;
    const f = follow;
    // (Usually ready already; if not, a moment.)
    const late = setTimeout(() => {
      dialog.innerHTML = '<div class="dialog-card"><h3>Solved!</h3><div class="spinner"></div><p>Going over your moves…</p></div>';
      dialog.hidden = false;
    }, 300);
    const ds = await f.done();
    clearTimeout(late);
    if (!play || follow !== f) return;
    const r = review(ds);
    const stars = starsFor(r.best, r.wrong, hinted);
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars, moves: r.moves, best: r.best });
    ctx.sfx('win');
    ctx.haptic(40);
    const mins = Math.floor(time / 60);
    const secs = String(Math.round(time % 60)).padStart(2, '0');
    const lines = [
      `<b>${r.moves}</b> moves${r.moves === r.best ? ' -- the best possible!' : `, best possible <b>${r.best}</b>`}`,
      r.wrong ? `${r.wrong} wrong-way move${r.wrong === 1 ? '' : 's'}, each costing two` : null,
      r.climb >= 2 ? `Longest climb: ${r.climb} moves the wrong way, from move ${r.climbAt}` : null,
      r.wrong && r.finish >= 4 ? `Perfect finish: the last ${r.finish} moves straight home` : null,
      `${mins}:${secs}${slides < r.moves ? ` · ${slides} slides` : ''}${hinted ? ' · with a hint' : ''}`,
    ].filter(Boolean);
    showDialog(dialog, ctx, {
      title: CHEERS[Math.floor(Math.random() * CHEERS.length)],
      stars,
      text: `${graph(ds)}<span class="ff-stats">${lines.map((l) => `<span>${l}</span>`).join('')}</span>`,
      buttons: [
        { label: 'Replay', act: 'replay', run: () => showPlay(n) },
        { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/fifteen/${n + 1}`, { replace: true }) },
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

// The walk: how far from solved after every move -- down a step in green,
// up a step (the wrong way) in red -- and, dashed, the best possible.
export function graph(ds) {
  const W = 320;
  const H = 140;
  const [L, R, T, B] = [30, 10, 10, 26];
  const n = ds.length - 1;
  const top = Math.max(1, ...ds);
  const x = (i) => (L + (i / Math.max(1, n)) * (W - L - R)).toFixed(1);
  const y = (d) => (T + (1 - d / top) * (H - T - B)).toFixed(1);
  let down = '';
  let up = '';
  for (let i = 1; i <= n; i++) {
    const seg = `M${x(i - 1)} ${y(ds[i - 1])}L${x(i)} ${y(ds[i])}`;
    if (ds[i] < ds[i - 1]) down += seg;
    else up += seg;
  }
  return `<svg class="ff-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distance from solved after each move">
    <path class="ff-axis" d="M${L} ${T}V${H - B}H${W - R}"/>
    <path class="ff-best" d="M${x(0)} ${y(ds[0])}L${x(ds[0])} ${y(0)}"/>
    <path class="ff-down" d="${down}"/>
    <path class="ff-up" d="${up}"/>
    <text x="${L - 5}" y="${T + 4}" text-anchor="end">${top}</text>
    <text x="${L - 5}" y="${H - B + 4}" text-anchor="end">0</text>
    <text x="${W - R}" y="${H - 8}" text-anchor="end">${n} moves</text>
    <text x="${L}" y="${H - 8}">from solved, after each move</text>
  </svg>`;
}

