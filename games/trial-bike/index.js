// Trial Bike: course select, the riding screen with its two-thumb controls
// (lean on the left, GAS and BRAKE on the right), crash and finish cards.
import { makeLevel, stars, BASE_SEED } from './engine.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { levelSource } from '../../js/lib/level-source.js';

// Bump when generation changes, so courses cached on devices are rebuilt.
export const GEN_VERSION = 1;

const RIDER = '<svg class="tb-rider" viewBox="0 0 48 48"><circle cx="12" cy="36" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="36" cy="36" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 36l10-8h8l6 8M22 28l-2-8h8l4 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="13" r="4" fill="currentColor"/></svg>';
// The right handlebar, end on: the brake lever reaching forward over the
// grip, and the twist grip itself.
const LEVER = '<svg viewBox="0 0 120 44"><path d="M8 30c20-12 54-18 104-18" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="8" cy="30" r="6" fill="currentColor"/></svg>';
const GRIP = '<svg viewBox="0 0 120 60"><rect x="4" y="14" width="112" height="32" rx="16" fill="currentColor" opacity=".25"/><rect x="4" y="14" width="112" height="32" rx="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M26 18v24M42 18v24M58 18v24M74 18v24M90 18v24" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".7"/><circle cx="110" cy="30" r="8" fill="currentColor"/></svg>';
const TIPS = {
  1: 'Right thumb: hold the GAS grip. Left thumb: drag back to lift the front wheel, forward to bring it down. In the air, lean to land on both wheels. Sideways is easier to see ahead!',
  2: 'A log: slow down, then drag back and give it gas just before, so the front wheel rides up and over.',
  3: 'A drop-off: a touch of lean back as you go over, so the back wheel lands first.',
  4: 'Ledges: lift the front wheel onto the top, keep the gas on, and the back wheel climbs up after it.',
  5: 'A gap! Full gas from well back, and lean back as you leave the lip. Crash and you restart at the last flag.',
};

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  const levels = levelSource(ctx, {
    workerUrl: new URL('./worker.js', import.meta.url),
    build: (n) => makeLevel(n),
    version: `${GEN_VERSION}:${BASE_SEED}`,
  });
  let play = null;
  let showing = 0;
  let cleanup = [];

  function teardown() {
    showing = 0;
    if (play) play.destroy();
    if (window.__trialBike === play) window.__trialBike = null;
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
    ctx.stopLoops?.();
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'trial-bike',
      title: 'Trial Bike',
      intro: 'Ride the course to the finish: gas, brake and lean. Beat the computer rider’s time without a crash for three stars.',
      outro: 'Every course is longer and rougher than the last -- hills, then jumps, logs, drops, ledges and gaps. Crashes send you back to the last flag; the clock keeps running.',
      progress,
      note: (n) => (progress.data.times?.[n] ? `${progress.data.times[n].toFixed(1)} s` : ''),
    });
  }

  function showPlay(n) {
    teardown();
    showing = n;
    root.innerHTML = `
      <div class="screen play-screen tb-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Courses">${ICON.back}</button>
          <h2>Course ${n}</h2>
        </header>
        <div class="stage building"><div class="spinner"></div><p>Test-riding the course…</p></div>
      </div>`;
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/trial-bike');
    levels.get(n).then((level) => {
      if (showing === n && !play) startPlay(n, level);
    });
  }

  function startPlay(n, level) {
    ctx.track('level_start', { level: n });
    // Build the next course in the background while this one is ridden.
    levels.get(n + 1);
    root.innerHTML = `
      <div class="screen play-screen tb-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Courses">${ICON.back}</button>
          <h2>Course ${n}</h2>
          <span class="pill tb-clock"><b data-time>0.0</b>s · par ${level.par}s<b class="tb-crashes" data-crashes hidden></b></span>
          <button class="icon-btn" data-act="flag" aria-label="Back to the last flag" title="Back to the last flag (counts as a crash)">${ICON.undo}</button>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
          <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas>
          <div class="tb-controls">
            <div class="tb-lean" aria-label="Lean: drag back or forward">${RIDER}<span>◀ BACK · LEAN · FORWARD ▶</span></div>
            <div class="tb-bars" aria-label="Right handlebar">
              <button class="tb-grip tb-brake" data-key="brake" aria-label="Brake">${LEVER}<span>BRAKE</span></button>
              <button class="tb-grip tb-gas" data-key="gas" aria-label="Gas">${GRIP}<span>GAS</span></button>
            </div>
          </div>
        </div>
        <button class="tb-demo" hidden aria-label="Computer rider demo speed">RIDER DEMO · <b>1×</b></button>
        <button class="tb-showme" hidden data-act="showme">SHOW ME</button>
        <div class="tb-paused" hidden><div><b>Paused</b><span>Tap to carry on riding.</span></div></div>
        <div class="tip" hidden></div>
        <div class="dialog" hidden></div>
      </div>`;
    const timeEl = root.querySelector('[data-time]');
    const crashesEl = root.querySelector('[data-crashes]');
    const demoBtn = root.querySelector('.tb-demo');
    const showMeBtn = root.querySelector('.tb-showme');
    const tip = root.querySelector('.tip');
    const dialog = root.querySelector('.dialog');
    let shownTime = -1;
    play = new Play(root.querySelector('canvas'), level, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onMotor: (on, vol) => {
        ctx.setLoop?.('motor', on && !play?.paused);
        if (on) ctx.loopLevel?.('motor', vol);
      },
      onState: (p) => {
        // (The clock in the bar, to a tenth, without churning the DOM.)
        const t = Math.floor(p.time * 10) / 10;
        if (t !== shownTime) {
          shownTime = t;
          timeEl.textContent = t.toFixed(1);
        }
        crashesEl.hidden = !p.crashes;
        crashesEl.textContent = ` · ${p.crashes} crash${p.crashes === 1 ? '' : 'es'}`;
      },
      onDemo: (on) => {
        demoBtn.hidden = !on;
        demoBtn.querySelector('b').textContent = `${play?.timeScale ?? 1}×`;
      },
      onCrash: (res) => crashed(n, res),
      onFinished: (res) => (play.demo ? demoFinished(n, res) : finished(n, res)),
    });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__trialBike = play;
    // Watching the computer rider: tap for 1×, 2× or 4×.
    demoBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!play.demo) return;
      ctx.sfx('tap');
      play.timeScale = { 1: 2, 2: 4, 4: 1 }[play.timeScale] || 1;
      demoBtn.querySelector('b').textContent = `${play.timeScale}×`;
    });

    // Left thumb: lean. Drag back (left) to lift the front wheel, forward
    // (right) to bring it down; let go and the rider sits back up.
    const leanEl = root.querySelector('.tb-lean');
    const riderEl = leanEl.querySelector('.tb-rider');
    let grab = null;
    const setLean = (v) => {
      if (!play || play.pilot) return;
      play.input.lean = v;
      riderEl.style.transform = `rotate(${-v * 28}deg)`;
    };
    leanEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        leanEl.setPointerCapture(e.pointerId);
      } catch {
        // (synthetic pointers in tests can't be captured)
      }
      grab = { id: e.pointerId, x: e.clientX };
      leanEl.classList.add('on');
      tip.hidden = true;
    });
    leanEl.addEventListener('pointermove', (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      const full = Math.max(50, leanEl.clientWidth * 0.45);
      setLean(Math.max(-1, Math.min(1, -(e.clientX - grab.x) / full)));
    });
    const release = (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      grab = null;
      leanEl.classList.remove('on');
      setLean(0);
    };
    leanEl.addEventListener('pointerup', release);
    leanEl.addEventListener('pointercancel', release);
    leanEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // Right thumb: the throttle grip and the brake lever, held down; each
    // tracks its own finger.
    root.querySelectorAll('.tb-grip').forEach((btn) => {
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
          tip.hidden = true;
          if (play?.waiting) return goAgain();
        } else if (e.pointerId !== id) return;
        btn.classList.toggle('on', on);
        if (play && !play.pilot) play.input[key] = on;
      };
      btn.addEventListener('pointerdown', set(true));
      btn.addEventListener('pointerup', set(false));
      btn.addEventListener('pointercancel', set(false));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // Keyboard: arrows or WASD, space for gas; p or Escape to pause.
    const keys = { ArrowUp: 'gas', w: 'gas', ' ': 'gas', ArrowDown: 'brake', s: 'brake', ArrowLeft: 1, a: 1, ArrowRight: -1, d: -1 };
    const held = new Set();
    const onKey = (on) => (e) => {
      if (on && (e.key === 'p' || e.key === 'Escape') && play) {
        e.preventDefault();
        if (play.paused) resume();
        else pause();
        return;
      }
      const k = keys[e.key];
      if (k === undefined || !play) return;
      e.preventDefault();
      if (on && play.waiting) return goAgain();
      if (typeof k === 'number') {
        if (on) held.add(k);
        else held.delete(k);
        setLean([...held].reduce((a, b) => a + b, 0));
      } else {
        if (!play.pilot) play.input[k] = on;
        root.querySelector(`.tb-grip[data-key=${k}]`).classList.toggle('on', on);
      }
    };
    const down = onKey(true);
    const up = onKey(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const resize = () => play?.resize();
    window.addEventListener('resize', resize);

    // After a crash, the first touch or key goes again from the flag.
    const stage = root.querySelector('.stage');
    const onStage = () => play?.waiting && goAgain();
    stage.addEventListener('pointerdown', onStage, { capture: true });
    function goAgain() {
      if (!play || !play.waiting) return;
      dialog.hidden = true;
      showMeBtn.hidden = true;
      play.retry();
    }
    // Or watch the computer rider do the whole course.
    showMeBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      ctx.sfx('tap');
      showMeBtn.hidden = true;
      play.showMe();
    });

    // Pause: everything holds still (controls let go) until you tap to carry
    // on. Leaving the app pauses it too.
    const pausedCard = root.querySelector('.tb-paused');
    const letGo = () => {
      if (!play) return;
      play.input.gas = play.input.brake = false;
      setLean(0);
      held.clear();
      root.querySelectorAll('.tb-grip.on').forEach((b) => b.classList.remove('on'));
    };
    const pause = () => {
      if (!play || play.paused || !dialog.hidden) return;
      play.paused = true;
      ctx.stopLoops?.();
      letGo();
      pausedCard.hidden = false;
    };
    const resume = () => {
      if (!play || !play.paused) return;
      letGo();
      pausedCard.hidden = true;
      play.paused = false;
      play.last = performance.now();
    };
    root.querySelector('[data-act=pause]').onclick = () => {
      ctx.sfx('tap');
      if (play.paused) resume();
      else pause();
    };
    pausedCard.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resume();
    });
    const hide = () => document.visibilityState === 'hidden' && pause();
    document.addEventListener('visibilitychange', hide);
    cleanup.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', hide);
    });

    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/trial-bike');
    root.querySelector('[data-act=restart]').onclick = () => {
      resume();
      ctx.sfx('tap');
      dialog.hidden = true;
      showMeBtn.hidden = true;
      letGo();
      play.reset();
    };
    // Stuck against something: back to the last flag, at the price of a crash.
    root.querySelector('[data-act=flag]').onclick = () => {
      if (!play || play.outcome || play.demo) return;
      ctx.sfx('tap');
      play.crashes++;
      letGo();
      play.retry();
    };
    if (TIPS[n]) {
      tip.textContent = TIPS[n];
      tip.hidden = false;
      tip.onclick = () => (tip.hidden = true);
    }
  }

  // Crashed: a word on what went wrong, and the first touch goes again from
  // the flag (the card stays out of the way of the controls).
  function crashed(n, res) {
    if (!play) return;
    if (play.demo) {
      play.waiting = true;
      return demoFinished(n, res);
    }
    ctx.track('level_fail', { level: n, reason: res.reason });
    play.waiting = true;
    play.say(`${res.reason.toUpperCase()} -- TAP TO GO AGAIN`, 60);
    root.querySelector('.tb-showme').hidden = false;
  }

  function finished(n, res) {
    if (!play) return;
    const time = play.time;
    const crashes = play.crashes;
    const got = stars(play.level, time, crashes);
    const data = progress.data;
    data.times ??= {};
    data.times[n] = Math.min(data.times[n] ?? Infinity, time);
    progress.complete(n, got);
    ctx.track('level_complete', { level: n, stars: got, time: Math.round(time * 10) / 10, crashes });
    ctx.haptic(40);
    const par = play.level.par;
    const vs = time <= par ? `${(par - time).toFixed(1)} s under par` : `${(time - par).toFixed(1)} s over par`;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: got === 3 ? 'Clean ride!' : got === 2 ? 'Made it!' : 'Over the line',
      stars: got,
      text: `<b>${time.toFixed(1)} s</b>, ${vs} (the computer rider’s ${par} s), ${crashes ? `${crashes} crash${crashes === 1 ? '' : 'es'}` : 'no crashes'}.
        ${got < 3 ? '<br><small>Three stars: beat par with no crashes.</small>' : ''}`,
      buttons: [
        { label: 'Ride again', act: 'replay', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        { label: 'Next course', act: 'next', primary: true, run: () => ctx.navigate(`#/trial-bike/${n + 1}`, { replace: true }) },
      ],
    });
  }

  // The demo's end: how the computer rider did, and over to you. (It doesn't
  // count toward your progress.)
  function demoFinished(n, res) {
    if (!play) return;
    ctx.track('trial_bike_demo', { level: n, kind: res.kind });
    showDialog(root.querySelector('.dialog'), ctx, {
      title: res.kind === 'finished' ? 'That’s how it’s done' : 'Even the computer crashes',
      text: res.kind === 'finished' ? `The computer rider finished in <b>${play.time.toFixed(1)} s</b>. Your turn!` : `${res.reason}. Your turn!`,
      buttons: [
        { label: 'Watch again', act: 'showme', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.showMe();
        } },
        { label: 'Try it yourself', act: 'retry', primary: true, run: () => {
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
  return {
    route,
    destroy: () => {
      teardown();
      levels.destroy();
    },
  };
}
