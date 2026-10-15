// Night Driver: a start card, the drive (wheel for the left thumb, pedals for
// the right), and the final score.
import { Play } from './play.js';
import { ICON, showDialog } from '../../js/lib/campaign.js';

const WHEEL = `<svg viewBox="0 0 100 100" class="nd-wheel" aria-hidden="true">
  <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="9"/>
  <circle cx="50" cy="50" r="9" fill="currentColor"/>
  <path d="M41 50H9M59 50h32M50 59v32" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
  <path d="M44 9h12" stroke="#ff3b2f" stroke-width="7" stroke-linecap="round"/>
</svg>`;

export function mount(root, ctx) {
  let play = null;
  let cleanup = [];

  function teardown() {
    if (play) play.destroy();
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
    ctx.stopLoops?.();
  }

  root.innerHTML = `
    <div class="screen play-screen nd-screen">
      <header class="bar">
        <button class="icon-btn" data-act="home" aria-label="Back">${ICON.back}</button>
        <h2>Night Driver</h2>
        <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
      </header>
      <div class="stage"><canvas class="board"></canvas>
        <div class="nd-controls">
          <div class="nd-steer" aria-label="Steering wheel: drag left or right">${WHEEL}<span>◀ DRAG TO STEER ▶</span></div>
          <div class="nd-pedals">
            <button class="nd-pedal nd-brake" data-key="brake" aria-label="Brake">BRAKE</button>
            <button class="nd-pedal nd-gas" data-key="gas" aria-label="Gas">GAS</button>
          </div>
        </div>
      </div>
      <div class="dialog" hidden></div>
    </div>`;
  const dialog = root.querySelector('.dialog');

  play = new Play(root.querySelector('canvas'), {
    sfx: ctx.sfx,
    haptic: ctx.haptic,
    track: (name, params) => ctx.track(name, params),
    onMotor: (on, level) => {
      ctx.setLoop?.('motor', on && !play?.paused);
      if (on) ctx.loopLevel?.('motor', level);
    },
    onOver: (res) => setTimeout(() => over(res), 600),
  });
  // Handle for the end-to-end tests (test/e2e.test.mjs).
  window.__nightDriver = play;

  // Left thumb: the wheel. Drag sideways from wherever you touch it; let go
  // and it springs back to centre.
  const steer = root.querySelector('.nd-steer');
  const wheel = steer.querySelector('.nd-wheel');
  let grab = null;
  const setSteer = (v) => {
    play.input.steer = v;
    wheel.style.transform = `rotate(${v * 120}deg)`;
  };
  steer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      steer.setPointerCapture(e.pointerId);
    } catch {
      // (synthetic pointers in tests can't be captured)
    }
    grab = { id: e.pointerId, x: e.clientX };
    steer.classList.add('on');
  });
  steer.addEventListener('pointermove', (e) => {
    if (!grab || e.pointerId !== grab.id) return;
    const full = Math.max(50, steer.clientWidth * 0.3);
    setSteer(Math.max(-1, Math.min(1, (e.clientX - grab.x) / full)));
  });
  const release = (e) => {
    if (!grab || e.pointerId !== grab.id) return;
    grab = null;
    steer.classList.remove('on');
    setSteer(0);
  };
  steer.addEventListener('pointerup', release);
  steer.addEventListener('pointercancel', release);
  steer.addEventListener('contextmenu', (e) => e.preventDefault());

  // Right thumb: the pedals, held down.
  root.querySelectorAll('.nd-pedal').forEach((btn) => {
    const key = btn.dataset.key;
    let id = null;
    const set = (on) => (e) => {
      e.preventDefault();
      if (on) {
        id = e.pointerId;
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          // as above
        }
      } else if (e.pointerId !== id) return;
      btn.classList.toggle('on', on);
      play.input[key] = on;
    };
    btn.addEventListener('pointerdown', set(true));
    btn.addEventListener('pointerup', set(false));
    btn.addEventListener('pointercancel', set(false));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Keyboard: arrows or WASD; space brakes.
  const keys = { ArrowUp: 'gas', w: 'gas', ArrowDown: 'brake', s: 'brake', ' ': 'brake', ArrowLeft: -1, a: -1, ArrowRight: 1, d: 1 };
  const held = new Set();
  const onKey = (on) => (e) => {
    const k = keys[e.key];
    if (k === undefined || !play) return;
    e.preventDefault();
    if (typeof k === 'number') {
      if (on) held.add(k);
      else held.delete(k);
      setSteer([...held].reduce((a, b) => a + b, 0));
    } else {
      play.input[k] = on;
      root.querySelector(`.nd-pedal[data-key=${k}]`).classList.toggle('on', on);
    }
  };
  const down = onKey(true);
  const up = onKey(false);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  const resize = () => play?.resize();
  window.addEventListener('resize', resize);
  const hide = () => {
    if (!play) return;
    if (document.visibilityState === 'hidden') {
      play.wasPaused = play.paused;
      play.paused = true;
      ctx.stopLoops?.();
      play.input.gas = play.input.brake = false;
      root.querySelectorAll('.nd-pedal').forEach((b) => b.classList.remove('on'));
      setSteer(0);
    } else {
      play.paused = play.wasPaused ?? play.paused;
      play.last = performance.now();
    }
  };
  document.addEventListener('visibilitychange', hide);
  cleanup.push(() => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', hide);
    if (window.__nightDriver === play) window.__nightDriver = null;
  });

  root.querySelector('[data-act=home]').onclick = () => ctx.back('#/');
  root.querySelector('[data-act=restart]').onclick = () => {
    ctx.sfx('tap');
    start();
  };

  function start() {
    dialog.hidden = true;
    play.reset();
    play.paused = false;
    play.last = performance.now();
    ctx.track('level_start', {});
  }

  function intro() {
    const best = ctx.load('best', 0);
    showDialog(dialog, ctx, {
      title: 'Night Driver',
      text: `Race through the night between the roadside lights.<br><br>
        <b>Left thumb:</b> drag the wheel to steer.<br>
        <b>Right thumb:</b> hold GAS, tap BRAKE.<br><br>
        Hit a post and you lose time. Later the road forks: <b>read the green signs</b> and take the safe way.
        ${best ? `<br><br>Best: <b>${best}</b>` : ''}`,
      buttons: [{ label: 'Start driving', act: 'start', primary: true, run: start }],
    });
  }

  function over({ score, miles, crashes, calls }) {
    if (!play) return;
    const best = ctx.load('best', 0);
    const isBest = score > best;
    if (isBest) ctx.save('best', score);
    ctx.track('level_complete', { score, miles: Math.round(miles * 10) / 10 });
    ctx.sfx(isBest ? 'win' : 'lose');
    showDialog(dialog, ctx, {
      title: isBest ? 'New best!' : 'Time’s up',
      text: `Score <b>${score}</b> · ${miles.toFixed(1)} miles<br>
        ${calls} good call${calls === 1 ? '' : 's'} at the forks · ${crashes} crash${crashes === 1 ? '' : 'es'}
        ${isBest ? '' : `<br>Best: ${best}`}`,
      buttons: [
        { label: 'Home', act: 'home', run: () => ctx.back('#/') },
        { label: 'Drive again', act: 'again', primary: true, run: start },
      ],
    });
  }

  intro();
  return { route: () => {}, destroy: teardown };
}
