// Marble Garden: level select, the garden with its one-thumb aim (touch
// anywhere to aim, let go to flick; tap the gnome to swap the loaded
// marble for the next), the down-the-drain and the path-cleared cards.
import { makeLevel, stars, BASE_SEED } from './engine.js';
import { Play } from './play.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { levelSource } from '../../js/lib/level-source.js';

// Bump when generation changes, so levels cached on devices are rebuilt.
export const GEN_VERSION = 1;

const TIPS = {
  1: 'Touch anywhere to aim, let go to flick. Three marbles of a colour touching pop. Tap the gnome to swap his marble for the one in the bucket.',
  2: 'A pop opens a gap, and the chain behind races to close it. If the colours that meet match, they pop too.',
  3: 'Clear the path before the chain reaches the drain. The front marble’s place is on the bar at the top.',
  6: 'The chain goes under the bridge: you can’t hit it there. Wait for it to come out the other side.',
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
    if (window.__marbleGarden === play) window.__marbleGarden = null;
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'marble-garden',
      title: 'Marble Garden',
      intro: 'A chain of marbles rolls along the garden path toward the drain. Flick marbles into it from the middle: three of a colour touching pop. Clear the path in the computer gnome’s number of flicks for three stars.',
      outro: 'The chain grows longer and faster and takes on more colours; from level 6 it runs under a bridge where you can’t reach it.',
      progress,
      note: (n) => (progress.data.shots?.[n] ? `${progress.data.shots[n]} flicks` : ''),
    });
  }

  function showPlay(n) {
    teardown();
    showing = n;
    root.innerHTML = `
      <div class="screen play-screen mg-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
        </header>
        <div class="stage building"><div class="spinner"></div><p>The computer gnome is walking the path…</p></div>
      </div>`;
    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/marble-garden');
    levels.get(n).then((level) => {
      if (showing === n && !play) startPlay(n, level);
    });
  }

  function startPlay(n, level) {
    ctx.track('level_start', { level: n });
    // (The generator gave up on this one: none of levels 1-50 does, but if
    // one ever does, the player should know par is a guess.)
    if (!level.checked) ctx.toast?.('The computer gnome couldn’t clear this path, so par is a guess.');
    // Build the next level in the background while this one is played.
    levels.get(n + 1);
    root.innerHTML = `
      <div class="screen play-screen mg-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
          <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas></div>
        <div class="pause-card" hidden><div><b>Paused</b><span>Tap to carry on.</span></div></div>
        <div class="tip" hidden></div>
        <div class="dialog" hidden></div>
      </div>`;
    const tip = root.querySelector('.tip');
    const dialog = root.querySelector('.dialog');
    const canvas = root.querySelector('canvas');
    play = new Play(canvas, level, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onCleared: (res) => (play.demo ? demoDone(n, res) : cleared(n, res)),
      onDrained: (res) => (play.demo ? demoDone(n, res) : drained(n, res)),
    });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__marbleGarden = play;

    // The thumb: press anywhere on the garden to aim, drag to aim, let go
    // to flick. A tap on the gnome swaps instead.
    let grab = null;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!play || play.demo || !dialog.hidden) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // (synthetic pointers in tests can't be captured)
      }
      // (The first touch with the tip up only puts the tip away.)
      if (!tip.hidden) {
        tip.hidden = true;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      grab = { id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top, moved: false, aimed: false };
      grab.swap = play.onGnome(grab.x, grab.y);
      if (!grab.swap) grab.aimed = play.aimAt(grab.x, grab.y);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!grab || e.pointerId !== grab.id || !play) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (Math.hypot(x - grab.x, y - grab.y) > 6) grab.moved = true;
      if (grab.moved && play.aimAt(x, y)) grab.aimed = true;
    });
    // Let go: a tap on the gnome swaps; a press that aimed (or a drag that
    // did) flicks.
    const release = (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      const g = grab;
      grab = null;
      if (!play || e.type === 'pointercancel') return;
      if (!g.moved && g.swap) play.swap();
      else if (g.aimed) play.fire();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard: arrows aim, space or up flicks, down swaps; p or Escape
    // pauses.
    const held = new Set();
    let turn = 0;
    const onKey = (on) => (e) => {
      if (!play) return;
      if (on && (e.key === 'p' || e.key === 'Escape')) {
        e.preventDefault();
        if (play.paused) resume();
        else pause();
        return;
      }
      if (play.demo || play.paused || !dialog.hidden) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ArrowRight' || e.key === 'd') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' || e.key === 'a' ? -1 : 1;
        if (on) held.add(dir);
        else held.delete(dir);
        turn = [...held].reduce((a, b) => a + b, 0);
        tip.hidden = true;
      } else if (on && (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w')) {
        e.preventDefault();
        tip.hidden = true;
        play.fire();
      } else if (on && (e.key === 'ArrowDown' || e.key === 's' || e.key === 'x')) {
        e.preventDefault();
        play.swap();
      }
    };
    const down = onKey(true);
    const up = onKey(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    // (A held arrow turns the aim steadily, between frames.)
    let turnRaf = 0;
    let lastTurn = performance.now();
    const turning = (now) => {
      const dt = Math.min(0.05, (now - lastTurn) / 1000);
      lastTurn = now;
      if (play && turn && !play.paused) play.aim += turn * 2.2 * dt;
      turnRaf = requestAnimationFrame(turning);
    };
    turnRaf = requestAnimationFrame(turning);
    const resize = () => play?.resize();
    window.addEventListener('resize', resize);

    // Pause: everything holds still until you tap to carry on. Leaving the
    // app pauses it too.
    const pausedCard = root.querySelector('.pause-card');
    const pause = () => {
      if (!play || play.paused || !dialog.hidden) return;
      play.paused = true;
      grab = null;
      held.clear();
      turn = 0;
      pausedCard.hidden = false;
    };
    const resume = () => {
      if (!play || !play.paused) return;
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
      cancelAnimationFrame(turnRaf);
    });

    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/marble-garden');
    root.querySelector('[data-act=restart]').onclick = () => {
      resume();
      ctx.sfx('tap');
      dialog.hidden = true;
      play.reset();
    };
    if (TIPS[n]) {
      tip.textContent = TIPS[n];
      tip.hidden = false;
      tip.onclick = () => (tip.hidden = true);
    }
  }

  function cleared(n, res) {
    if (!play) return;
    const got = stars(play.level, res.shots);
    const data = progress.data;
    data.shots ??= {};
    data.shots[n] = Math.min(data.shots[n] ?? Infinity, res.shots);
    progress.complete(n, got);
    ctx.track('level_complete', { level: n, stars: got, shots: res.shots });
    const par = play.level.par;
    const vs = res.shots < par ? `${par - res.shots} under par` : res.shots === par ? 'on par' : `${res.shots - par} over par`;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: got === 3 ? 'Path cleared!' : got === 2 ? 'Cleared!' : 'All gone',
      stars: got,
      text: `<b>${res.shots} flick${res.shots === 1 ? '' : 's'}</b>, ${vs} (the computer gnome’s ${par}).
        ${got < 3 ? '<br><small>Three stars: clear the path in the computer gnome’s number of flicks or fewer.</small>' : ''}`,
      buttons: [
        { label: 'Play again', act: 'replay', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/marble-garden/${n + 1}`, { replace: true }) },
      ],
    });
  }

  // Down the drain: a word, and the choice of another go or watching the
  // computer gnome.
  function drained(n, res) {
    if (!play) return;
    ctx.track('level_fail', { level: n, reason: 'drained' });
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'Down the drain!',
      text: `The chain reached the drain after ${res.shots} flick${res.shots === 1 ? '' : 's'}. The computer gnome clears this path in ${play.level.par}.`,
      buttons: [
        // (SHOW ME only where there's a run to show: a level the gnome
        // couldn't clear has none.)
        ...(play.level.solution.length ? [{ label: 'Show me', act: 'showme', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.showMe();
        } }] : []),
        { label: 'Try again', act: 'retry', primary: true, run: () => {
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
      ],
    });
  }

  // The demo's end: how the computer gnome did, and over to you. (It
  // doesn't count toward your progress.)
  function demoDone(n, res) {
    if (!play) return;
    ctx.track('marble_garden_demo', { level: n, shots: res.shots });
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'That’s how it’s done',
      text: `The computer gnome cleared the path in <b>${res.shots} flick${res.shots === 1 ? '' : 's'}</b>. Your turn!`,
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
