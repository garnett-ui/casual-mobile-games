// Lunar Lander: level select, flight screen with thruster buttons, results.
import { makeLevel } from './engine.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';

const ROT_L = '<svg viewBox="0 0 24 24"><path d="M8 5H3v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 9.5A8.5 8.5 0 1 1 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ROT_R = '<svg viewBox="0 0 24 24" style="transform:scaleX(-1)"><path d="M8 5H3v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 9.5A8.5 8.5 0 1 1 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const TIPS = {
  1: 'Hold THRUST to lift off, then hold ▶ to lean right and drift over to the BASE. Let go to level out. Land gently!',
  2: 'Land slowly: under 2.2 m/s down (V/S) and 1.2 m/s sideways (H/S). Red numbers mean too fast.',
  3: 'A hill! Climb first, then lean toward the base. Tip: turn ASSIST off for faster, trickier flying.',
};

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  const cache = new Map();
  let play = null;
  let cleanup = [];

  const levelFor = (n) => {
    if (!cache.has(n)) cache.set(n, makeLevel(n));
    return cache.get(n);
  };

  function teardown() {
    if (play) play.destroy();
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
    ctx.stopLoops?.();
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'lander',
      title: 'Lunar Lander',
      intro: 'Lift off, fly over the mountains and land gently on the base. Watch your fuel!',
      outro: 'Every mission is a little higher, further and thirstier than the last.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    const level = levelFor(n);
    root.innerHTML = `
      <div class="screen play-screen ll-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Missions">${ICON.back}</button>
          <h2>Mission ${n}</h2>
          <button class="ll-assist" data-act="assist" aria-pressed="true" title="Stability assist: keeps the tilt within 9° and levels the lander when you let go">ASSIST</button>
          <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas>
          <div class="ll-controls">
            <div class="ll-rotate">
              <button class="ll-btn" data-key="left" aria-label="Rotate left">${ROT_L}</button>
              <button class="ll-btn" data-key="right" aria-label="Rotate right">${ROT_R}</button>
            </div>
            <button class="ll-btn ll-thrust" data-key="thrust" aria-label="Thrust">THRUST</button>
          </div>
        </div>
        <div class="tip" hidden></div>
        <div class="dialog" hidden></div>
      </div>`;
    ctx.track('level_start', { level: n });
    const tip = root.querySelector('.tip');
    play = new Play(root.querySelector('canvas'), level, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onSound: (name, on) => {
        if (name === 'stop') ctx.stopLoops?.();
        else ctx.setLoop?.(name, on);
      },
      onLanded: (res) => landed(n, res),
      onCrash: (res) => crashed(n, res),
    }, { intro: true });
    // Any touch ends the fly-over early.
    root.querySelector('.stage').addEventListener('pointerdown', () => play?.skipIntro(), { capture: true });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__lander = play;
    // Stability assist (on unless you've turned it off).
    const assistBtn = root.querySelector('[data-act=assist]');
    const setAssist = (on) => {
      play.assist = on;
      assistBtn.classList.toggle('on', on);
      assistBtn.setAttribute('aria-pressed', String(on));
      assistBtn.textContent = on ? 'ASSIST ON' : 'ASSIST OFF';
    };
    setAssist(ctx.load('assist', true));
    assistBtn.onclick = () => {
      ctx.sfx('tap');
      setAssist(!play.assist);
      ctx.save('assist', play.assist);
    };

    // Hold-to-fire buttons; each finger is tracked separately so you can
    // thrust and turn at the same time.
    root.querySelectorAll('.ll-btn').forEach((btn) => {
      const key = btn.dataset.key;
      const set = (on) => (e) => {
        e.preventDefault();
        if (on) {
          btn.setPointerCapture?.(e.pointerId);
          tip.hidden = true;
        }
        btn.classList.toggle('on', on);
        play?.setInput(key, on);
      };
      btn.addEventListener('pointerdown', set(true));
      btn.addEventListener('pointerup', set(false));
      btn.addEventListener('pointercancel', set(false));
      btn.addEventListener('lostpointercapture', set(false));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    // Keyboard: arrows / WASD, space to thrust.
    const keys = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'thrust', w: 'thrust', ' ': 'thrust' };
    const onKey = (on) => (e) => {
      const key = keys[e.key];
      if (!key || !play) return;
      e.preventDefault();
      if (on) play.skipIntro();
      play.setInput(key, on);
      root.querySelector(`.ll-btn[data-key=${key}]`)?.classList.toggle('on', on);
    };
    const down = onKey(true);
    const up = onKey(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const resize = () => play?.resize();
    window.addEventListener('resize', resize);
    const hide = () => {
      if (document.visibilityState === 'hidden' && play) {
        play.paused = true;
        ctx.stopLoops?.();
        ['left', 'right', 'thrust'].forEach((k) => play.setInput(k, false));
      } else if (play) {
        play.paused = false;
        play.last = performance.now();
      }
    };
    document.addEventListener('visibilitychange', hide);
    cleanup.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', hide);
    });

    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/lander');
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      root.querySelector('.dialog').hidden = true;
      play.reset();
    };
    if (TIPS[n]) {
      tip.textContent = TIPS[n];
      tip.hidden = false;
      tip.onclick = () => (tip.hidden = true);
    }
  }

  function landed(n, res) {
    if (!play) return;
    const { total, parts, stars } = res.score;
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars, score: total });
    ctx.sfx('win');
    ctx.haptic(40);
    const row = (label, v) => `<tr><td>${label}</td><td>${v}</td></tr>`;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: stars === 3 ? 'The Eagle has landed!' : stars === 2 ? 'Nice landing!' : 'Down in one piece',
      stars,
      text: `<table class="ll-score">
        ${row(`Touchdown ${res.vy.toFixed(2)} m/s`, parts.soft)}
        ${row(`Drift ${res.vx.toFixed(2)} m/s`, parts.drift)}
        ${row(`Tilt ${((res.tilt * 180) / Math.PI).toFixed(1)}°`, parts.level)}
        ${row('On target', parts.centre)}
        ${row('Fuel left', parts.fuel)}
        <tr class="total"><td>Score</td><td>${total}</td></tr></table>`,
      buttons: [
        { label: 'Fly again', act: 'replay', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        { label: 'Next mission', act: 'next', primary: true, run: () => ctx.navigate(`#/lander/${n + 1}`, { replace: true }) },
      ],
    });
  }

  function crashed(n, res) {
    if (!play) return;
    ctx.track('level_fail', { level: n, reason: res.reason });
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'Crashed!',
      text: `${res.reason}. Safe landings are under ${2.2} m/s down, ${1.2} m/s sideways and 10° of tilt.`,
      buttons: [
        { label: 'Missions', act: 'levels', run: () => ctx.back('#/lander') },
        { label: 'Try again', act: 'retry', primary: true, run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
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
