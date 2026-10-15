import { GAMES, COMING_SOON } from './games.js';
import { unlockAudio, sfx } from './lib/audio.js';
import { getSetting, setSetting, haptic } from './lib/settings.js';
import { load, save } from './lib/storage.js';
import { canPrompt, promptInstall, isIOS, isStandalone, onInstallChange } from './lib/install.js';

const view = document.getElementById('view');
let current = null; // { id, instance }

// ------------------------------------------------------------------ routing

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { id: parts[0] || '', sub: parts.slice(1).join('/') };
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) history.replaceState(history.state, '', hash);
  else history.pushState({ inApp: true }, '', hash);
  route();
}

// Go "up" a level: use the browser history when we came from there so the
// system back button stays in sync, otherwise jump straight to the parent.
export function back(parent) {
  if (history.state && history.state.inApp) history.back();
  else navigate(parent, { replace: true });
}

async function route() {
  const { id, sub } = parse();
  const game = GAMES.find((g) => g.id === id);
  if (!game) {
    unmount();
    renderHub();
    return;
  }
  if (current && current.id === id) {
    current.instance.route?.(sub);
    return;
  }
  unmount();
  view.innerHTML = '<div class="loading">Loading…</div>';
  const mod = await game.load();
  if (parse().id !== id) return; // navigated away while loading
  view.innerHTML = '';
  const host = document.createElement('div');
  host.className = 'game-host';
  view.appendChild(host);
  current = { id, instance: mod.mount(host, ctxFor(game), sub) };
}

function unmount() {
  if (current) current.instance.destroy?.();
  current = null;
}

function ctxFor(game) {
  return {
    sfx,
    haptic,
    toast,
    navigate,
    back,
    load: (key, fallback) => load(`${game.id}:${key}`, fallback),
    save: (key, value) => save(`${game.id}:${key}`, value),
    getSetting,
    setSetting,
  };
}

// --------------------------------------------------------------------- hub

const ICONS = {
  soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  buzzOn: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 8v8M21 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  buzzOff: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2" opacity=".45"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function renderHub() {
  view.innerHTML = `
    <div class="hub">
      <header class="hub-head">
        <div class="brand">
          <img src="icons/icon.svg" alt="" width="44" height="44">
          <h1>Pocket Arcade</h1>
        </div>
        <div class="hub-tools">
          <button class="icon-btn" data-act="sound" aria-label="Sound"></button>
          <button class="icon-btn" data-act="haptics" aria-label="Vibration"></button>
        </div>
      </header>
      <div class="install-slot"></div>
      <section class="cards">
        ${GAMES.map((g) => `
          <button class="card" data-game="${g.id}" style="--accent:${g.color}">
            <canvas class="card-art" data-art="${g.id}"></canvas>
            <span class="card-body">
              <span class="card-title">${g.title}</span>
              <span class="card-blurb">${g.blurb}</span>
            </span>
            <span class="play-pill">Play</span>
          </button>`).join('')}
        ${COMING_SOON.map((c) => `
          <div class="card soon">
            <span class="soon-emoji">${c.emoji}</span>
            <span class="card-body">
              <span class="card-title">${c.title}</span>
              <span class="card-blurb">${c.blurb}</span>
            </span>
          </div>`).join('')}
      </section>
      <footer class="hub-foot">No accounts, no ads. Works offline.</footer>
    </div>`;

  const paintTools = () => {
    view.querySelector('[data-act=sound]').innerHTML = getSetting('sound') ? ICONS.soundOn : ICONS.soundOff;
    view.querySelector('[data-act=haptics]').innerHTML = getSetting('haptics') ? ICONS.buzzOn : ICONS.buzzOff;
  };
  paintTools();
  view.querySelector('[data-act=sound]').onclick = () => {
    setSetting('sound', !getSetting('sound'));
    paintTools();
    sfx('tap');
  };
  view.querySelector('[data-act=haptics]').onclick = () => {
    setSetting('haptics', !getSetting('haptics'));
    paintTools();
    haptic(30);
  };
  view.querySelectorAll('[data-game]').forEach((el) => {
    el.onclick = () => {
      sfx('tap');
      navigate(`#/${el.dataset.game}`);
    };
  });
  for (const g of GAMES) {
    const canvas = view.querySelector(`[data-art="${g.id}"]`);
    g.art().then((m) => requestAnimationFrame(() => m.paint(canvas))).catch(() => {});
  }
  renderInstall();
}

function renderInstall() {
  const slot = view.querySelector('.install-slot');
  if (!slot) return;
  slot.innerHTML = '';
  if (isStandalone() || load('installDismissed', false)) return;
  let html = '';
  if (canPrompt()) {
    html = `<div class="install"><span>Install Pocket Arcade to play offline from your home screen.</span>
      <button class="btn primary" data-act="install">Install</button>
      <button class="x" data-act="dismiss" aria-label="Dismiss">×</button></div>`;
  } else if (isIOS()) {
    html = `<div class="install"><span>To play offline: tap <b>Share</b>
      <svg class="inline-ico" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 12v8h14v-8" fill="none" stroke="currentColor" stroke-width="2"/></svg>
      then <b>Add to Home Screen</b>.</span>
      <button class="x" data-act="dismiss" aria-label="Dismiss">×</button></div>`;
  }
  slot.innerHTML = html;
  const inst = slot.querySelector('[data-act=install]');
  if (inst) inst.onclick = () => promptInstall().then(renderInstall);
  const dis = slot.querySelector('[data-act=dismiss]');
  if (dis) dis.onclick = () => {
    save('installDismissed', true);
    renderInstall();
  };
}
onInstallChange(() => {
  if (!current) renderInstall();
});

// ------------------------------------------------------------------- toast

let toastTimer = 0;
export function toast(msg, action) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  el.append(msg);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = action.run;
    el.appendChild(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 15000 : 2600);
}

// ---------------------------------------------------------- service worker

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offer = (worker) => toast('A new version is ready.', {
        label: 'Update',
        run: () => worker.postMessage({ type: 'SKIP_WAITING' }),
      });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloading) {
          reloading = true;
          location.reload();
        }
      });
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
}

// --------------------------------------------------------------------- boot

// Audio may only start after a user gesture on mobile.
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('popstate', route);
// Stop iOS from rubber-band scrolling / double-tap zooming the app.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
route();
