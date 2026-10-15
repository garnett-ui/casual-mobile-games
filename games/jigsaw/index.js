// Jigsaw: pick a photo (gallery, camera, a saved one, or a built-in picture),
// choose how many pieces, and solve. Photos are saved on the device; the
// puzzle in progress is saved so you can come back to it.
import { Play } from './play.js';
import { SAMPLES, sampleImage } from './samples.js';
import { ICON, showDialog } from '../../js/lib/campaign.js';
import { savePhoto, listPhotos, getPhoto, deletePhoto, decode } from '../../js/lib/photos.js';

const SIZES = [24, 48, 100, 150, 200];
const CAMERA = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const GALLERY = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 17l5-5 4 4 3-3 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="9" r="1.8" fill="currentColor"/></svg>';
const EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const EDGES = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 2"/></svg>';
const SCATTER = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="6" rx="1" fill="currentColor"/><rect x="14" y="3" width="6" height="6" rx="1" fill="currentColor" transform="rotate(15 17 6)"/><rect x="6" y="14" width="6" height="6" rx="1" fill="currentColor" transform="rotate(-12 9 17)"/><rect x="15" y="14" width="6" height="6" rx="1" fill="currentColor"/></svg>';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function mount(root, ctx) {
  let play = null;
  let cleanup = [];
  let urls = [];
  let pieces = ctx.load('pieces', 100);

  function teardown() {
    if (play) {
      if (!play.done) saveCurrent();
      play.destroy();
    }
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  }

  let current = ctx.load('current', null);
  function saveCurrent() {
    if (!play || !current) return;
    current = { ...current, state: play.state() };
    ctx.save('current', current);
  }

  async function imageFor(id) {
    if (id.startsWith('sample:')) return sampleImage(id);
    const rec = await getPhoto(id);
    if (!rec) throw new Error('missing photo');
    return decode(rec.blob);
  }

  // ---------------------------------------------------------------- menu

  async function showMenu() {
    teardown();
    root.innerHTML = `
      <div class="screen jg-menu">
        <header class="bar">
          <button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button>
          <h2>Jigsaw</h2>
        </header>
        <div class="jg-body">
          <div class="jg-continue" hidden></div>
          <p class="jg-label">Make a puzzle from your own picture</p>
          <div class="jg-add">
            <label class="jg-add-btn">${GALLERY}<span>Choose photo</span>
              <input type="file" accept="image/*" data-src="gallery" hidden></label>
            <label class="jg-add-btn">${CAMERA}<span>Take photo</span>
              <input type="file" accept="image/*" capture="environment" data-src="camera" hidden></label>
          </div>
          <p class="jg-label">Pieces</p>
          <div class="jg-sizes">${SIZES.map((n) => `<button data-n="${n}" class="${n === pieces ? 'on' : ''}">${n}</button>`).join('')}</div>
          <p class="jg-label">Your photos</p>
          <div class="jg-grid" data-list="photos"><p class="jg-empty">Photos you add are saved on this device only.</p></div>
          <p class="jg-label">Built-in pictures</p>
          <div class="jg-grid" data-list="samples"></div>
        </div>
      </div>`;
    root.querySelector('[data-act=home]').onclick = () => ctx.back('#/');
    root.querySelectorAll('.jg-sizes button').forEach((b) => {
      b.onclick = () => {
        ctx.sfx('tap');
        pieces = Number(b.dataset.n);
        ctx.save('pieces', pieces);
        root.querySelectorAll('.jg-sizes button').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    root.querySelectorAll('input[type=file]').forEach((input) => {
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          ctx.toast('Saving your photo…');
          const rec = await savePhoto(file);
          ctx.track('photo_added', { source: input.dataset.src });
          start(rec.id);
        } catch (err) {
          ctx.toast('Sorry, that picture could not be opened.');
        }
      };
    });

    // Built-in pictures
    const samples = root.querySelector('[data-list=samples]');
    for (const s of SAMPLES) {
      const c = sampleImage(s.id, 320, 240);
      const tile = document.createElement('button');
      tile.className = 'jg-tile';
      c.className = 'jg-thumb';
      tile.append(c);
      tile.insertAdjacentHTML('beforeend', `<span>${s.title}</span>`);
      tile.onclick = () => start(s.id);
      samples.append(tile);
    }

    // Continue the last puzzle
    if (current && current.state) {
      const box = root.querySelector('.jg-continue');
      const done = current.state.pieces.filter((p) => p.placed).length;
      box.innerHTML = `<button class="btn primary">Continue puzzle · ${done}/${current.state.pieces.length} pieces</button>`;
      box.hidden = false;
      box.querySelector('button').onclick = () => start(current.id, current.state);
    }

    // Saved photos
    try {
      const photos = await listPhotos();
      const list = root.querySelector('[data-list=photos]');
      if (!list || !photos.length) return;
      list.innerHTML = '';
      for (const p of photos) {
        const url = URL.createObjectURL(p.blob);
        urls.push(url);
        const tile = document.createElement('div');
        tile.className = 'jg-tile';
        tile.innerHTML = `<button class="jg-open" aria-label="Make a puzzle"><img class="jg-thumb" src="${url}" alt=""></button>
          <button class="jg-del" aria-label="Delete photo">×</button>`;
        tile.querySelector('.jg-open').onclick = () => start(p.id);
        tile.querySelector('.jg-del').onclick = async () => {
          showDialog(dialog(), ctx, {
            title: 'Delete this photo?',
            text: 'It will be removed from this device.',
            buttons: [
              { label: 'Keep', run: () => (dialog().hidden = true) },
              { label: 'Delete', primary: true, run: async () => {
                await deletePhoto(p.id);
                if (current?.id === p.id) {
                  current = null;
                  ctx.save('current', null);
                }
                showMenu();
              } },
            ],
          });
        };
        list.append(tile);
      }
    } catch {
      // No IndexedDB (private mode): built-in pictures still work.
    }
  }

  function dialog() {
    let d = root.querySelector('.dialog');
    if (!d) {
      d = document.createElement('div');
      d.className = 'dialog';
      root.firstElementChild.append(d);
    }
    return d;
  }

  // ---------------------------------------------------------------- play

  async function start(id, state = null) {
    teardown();
    root.innerHTML = `
      <div class="screen play-screen jg-screen">
        <header class="bar">
          <button class="icon-btn" data-act="menu" aria-label="Back">${ICON.back}</button>
          <span class="pill" title="Pieces placed in the picture"><b data-placed>0</b>/<span data-total>0</span><small class="jg-joined" data-joined hidden></small></span>
          <span class="pill jg-time" data-time title="Time spent working on it (pauses after 30 s without a touch)">0:00</span>
          <span class="jg-tools">
            <button class="icon-btn jg-peek" data-act="peek" aria-label="Hold to peek at the picture" title="Hold to peek at the picture">${EYE}</button>
            <button class="icon-btn" data-act="edges" aria-label="Edge pieces only" title="Show only edge pieces">${EDGES}</button>
            <button class="icon-btn" data-act="scatter" aria-label="Shuffle the loose pieces" title="Shuffle the loose pieces">${SCATTER}</button>
          </span>
        </header>
        <div class="stage"><canvas class="board"></canvas></div>
        <div class="dialog" hidden></div>
      </div>`;
    root.querySelector('[data-act=menu]').onclick = () => showMenu();
    let image;
    try {
      image = await imageFor(id);
    } catch {
      ctx.toast('That picture is no longer on this device.');
      current = null;
      ctx.save('current', null);
      return showMenu();
    }
    const seed = state ? state.seed : Math.floor(Math.random() * 1e9);
    current = { id, pieces, state };
    play = new Play(root.querySelector('canvas'), image, { pieces, seed, state }, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onState: ({ placed, joined, total }) => {
        root.querySelector('[data-placed]').textContent = placed;
        root.querySelector('[data-total]').textContent = total;
        const j = root.querySelector('[data-joined]');
        j.hidden = !joined;
        j.textContent = ` · ${joined} joined`;
      },
      onTime: (t, idle) => {
        const el = root.querySelector('[data-time]');
        el.textContent = `${idle ? '⏸ ' : ''}${fmtTime(t)}`;
        el.classList.toggle('idle', idle);
      },
      onChange: () => saveCurrent(),
      onWin: (res) => setTimeout(() => win(res), 400),
    });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__jigsaw = play;
    // Wide picture on an upright phone (or the reverse): suggest turning it.
    const wide = image.width > image.height * 1.15;
    const tall = image.height > image.width * 1.15;
    const upright = window.innerHeight > window.innerWidth;
    const tips = [];
    if (!state && !ctx.load('tipped', false)) {
      ctx.save('tipped', true);
      tips.push('Tap a piece to turn it. Hold the eye to peek at the picture.');
    }
    if ((wide && upright) || (tall && !upright)) {
      tips.push(`Turn your phone ${wide ? 'sideways' : 'upright'} for bigger pieces.`);
    }
    if (tips.length) ctx.toast(`Tip: ${tips.join(' ')}`);
    if (!state) ctx.track('level_start', { pieces: play.pieces.length });
    saveCurrent();

    const toggle = (act, key) => {
      const btn = root.querySelector(`[data-act=${act}]`);
      btn.classList.toggle('on', play[key]);
      btn.onclick = () => {
        ctx.sfx('tap');
        play.touch();
        play[key] = !play[key];
        play.dirty = true;
        btn.classList.toggle('on', play[key]);
      };
    };
    toggle('edges', 'edgesOnly');
    // Peek: the picture pops up for as long as the button is held.
    const peek = root.querySelector('[data-act=peek]');
    peek.oncontextmenu = (e) => e.preventDefault();
    peek.onpointerdown = (e) => {
      e.preventDefault();
      play.touch();
      peek.setPointerCapture?.(e.pointerId);
      play.peek = true;
      play.dirty = true;
      peek.classList.add('on');
    };
    const unpeek = () => {
      if (!play) return;
      play.peek = false;
      play.dirty = true;
      peek.classList.remove('on');
    };
    peek.onpointerup = unpeek;
    peek.onpointercancel = unpeek;
    peek.onlostpointercapture = unpeek;
    // Shuffle: deal the loose pieces out again around the picture.
    root.querySelector('[data-act=scatter]').onclick = () => {
      ctx.sfx('tap');
      play.touch();
      if (play.done || play.placedCount() === play.pieces.length) return ctx.toast('Every piece is in place.');
      play.scatter();
      ctx.toast('Loose pieces shuffled around the picture.');
    };
    const resize = () => {
      if (!play) return;
      play.resize();
    };
    window.addEventListener('resize', resize);
    const hide = () => document.visibilityState === 'hidden' && saveCurrent();
    document.addEventListener('visibilitychange', hide);
    cleanup.push(() => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', hide);
    });
  }

  // A step chart of pieces placed against time spent.
  function chart(history, total, time) {
    const w = 300;
    const h = 150;
    const L = 34;
    const B = 22;
    const pw = w - L - 8;
    const ph = h - B - 8;
    const X = (t) => L + (pw * t) / Math.max(1, time);
    const Y = (n) => 8 + ph - (ph * n) / total;
    let d = `M${X(0)},${Y(0)}`;
    let prev = 0;
    for (const [t, n] of history) {
      d += ` L${X(t).toFixed(1)},${Y(prev).toFixed(1)} L${X(t).toFixed(1)},${Y(n).toFixed(1)}`;
      prev = n;
    }
    d += ` L${X(time)},${Y(prev)}`;
    const ticks = [0, 0.5, 1].map((f) => `<text x="${L - 6}" y="${Y(total * f) + 4}" text-anchor="end">${Math.round(total * f)}</text>`).join('');
    const tticks = [[0, 'start'], [0.5, 'middle'], [1, 'end']].map(([f, a]) => `<text x="${X(time * f)}" y="${h - 6}" text-anchor="${a}">${fmtTime(time * f)}</text>`).join('');
    return `<svg class="jg-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pieces placed over time">
      <rect x="${L}" y="8" width="${pw}" height="${ph}" fill="#f3f4fb"/>
      <path d="${d} L${X(time)},${Y(0)} Z" fill="rgba(67,97,238,0.18)" stroke="none"/>
      <path d="${d}" fill="none" stroke="#4361ee" stroke-width="2.2" stroke-linejoin="round"/>
      <g font-size="10" fill="#6b6f93">${ticks}${tticks}</g>
    </svg>`;
  }

  function win({ time, moves, pieces: n, history }) {
    if (!play) return;
    current = null;
    ctx.save('current', null);
    ctx.sfx('win');
    ctx.haptic(60);
    ctx.track('level_complete', { pieces: n, seconds: Math.round(time) });
    const best = ctx.load('best', {});
    const isBest = !best[n] || time < best[n];
    if (isBest) {
      best[n] = time;
      ctx.save('best', best);
    }
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'Puzzle complete!',
      text: `${n} pieces in <b>${fmtTime(time)}</b> of puzzling (${moves} moves,
        ${(n / Math.max(1 / 60, time / 60)).toFixed(1)} pieces a minute).${isBest ? ' Your best time for this size!' : ` Best: ${fmtTime(best[n])}.`}
        <br><small>Pieces placed over time</small>${chart(history, n, time)}`,
      buttons: [
        { label: 'Admire it', act: 'admire', run: () => (root.querySelector('.dialog').hidden = true) },
        { label: 'New puzzle', act: 'new', primary: true, run: showMenu },
      ],
    });
  }

  showMenu();
  return { route: () => {}, destroy: teardown };
}
