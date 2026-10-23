// Lunar Lander: level select, flight screen with thruster buttons, results.
import { makeLevel, hoverSeconds } from './engine.js';
import { Play } from './play.js';
import { makeApollo, STARTS, EAGLE_FUEL } from './apollo.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';

// Apollo 11's touchdown, from NASA: "Houston, Tranquility Base here. The
// Eagle has landed." Played on a landing, until you leave the score card.
const EAGLE = new URL('./audio/eagle-has-landed.mp3', import.meta.url).href;
// And on the way down in the Apollo 11 flight, the real voices: cut from
// NASA's Apollo 11 Audio Highlights reel (public domain) -- see apollo.js.
const VOICES = Object.fromEntries(['go-for-pdi', 'alarm-1202', 'alarm-1201', 'sixty-seconds', 'thirty-seconds', 'contact-light']
  .map((name) => [name, new URL(`./audio/a11-${name}.mp3`, import.meta.url).href]));

const ROT_L = '<svg viewBox="0 0 24 24"><path d="M8 5H3v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 9.5A8.5 8.5 0 1 1 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ROT_R = '<svg viewBox="0 0 24 24" style="transform:scaleX(-1)"><path d="M8 5H3v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 9.5A8.5 8.5 0 1 1 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const TIPS = {
  1: 'Hold THRUST to lift off, then hold ▶ to lean right and drift over to the BASE. Let go to level out. Land gently!',
  2: 'Land slowly: keep the RATE tape out of the red (under 3 m/s down) and the cross-pointer’s cross inside its dotted box (under 1.2 m/s sideways too). Red means too fast.',
  3: 'A hill! Climb first, then lean toward the base. Tip: turn ASSIST off for faster, trickier flying.',
  4: 'This time the base is far below you. Come down gently: watch the RATE tape.',
  6: 'The base is up on a mesa. Climb well above the cliff before you cross it.',
  10: 'The base is down in a crater. Clear the rim, then sink straight down.',
  11: 'The base is inside a cave! Come down outside the entrance, then fly in level and slowly under the overhang. Mind your head.',
  12: 'That mountain is far too high to fly over on your fuel. Go through the tunnel, slow and level.',
  13: 'The base is in a cavern deep under the mesa. Hover over the shaft, then sink straight down it, slowly.',
  27: 'A switchback: down the shaft, along the gallery to the second shaft, down that -- then back under the gallery to the base.',
  31: 'A zigzag tunnel: it climbs and dives. Take it slowly, and watch the roof as well as the floor.',
};

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  const cache = new Map();
  let play = null;
  let cleanup = [];
  let stopClip = null;
  const quiet = () => {
    stopClip?.();
    stopClip = null;
  };

  const levelFor = (n) => {
    if (!cache.has(n)) cache.set(n, n === 'apollo' ? makeApollo() : makeLevel(n));
    return cache.get(n);
  };
  const apolloStars = () => (progress.data.apollo ??= {});
  const starText = (n) => (n ? '★'.repeat(n) + '☆'.repeat(3 - n) : '');

  function teardown() {
    quiet();
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
      outro: 'Every mission is a little higher, further and thirstier than the last. From mission 11: caves, tunnels and shafts.<br><br><span class="lvl-badge">A</span> landed with ASSIST on. Land it with assist off to clear the mark.',
      progress,
      badge: (n) => (progress.data.assisted?.[n] ? 'A' : ''),
    });
    // Apollo 11: the first landing, from orbit -- open to everyone.
    const best = Math.max(0, ...Object.values(apolloStars()));
    const card = document.createElement('button');
    card.className = 'll-apollo';
    card.dataset.act = 'apollo';
    card.innerHTML = `<b>APOLLO 11</b><span>Fly the first landing, down from orbit</span>${best ? `<i>${starText(best)}</i>` : ''}`;
    card.onclick = () => {
      ctx.sfx('tap');
      ctx.navigate('#/lander/apollo');
    };
    root.querySelector('.lvl-grid').before(card);
  }

  // Apollo 11: where to take over from the computer.
  function showApollo() {
    teardown();
    const stars = apolloStars();
    root.innerHTML = `
      <div class="screen levels-screen">
        <header class="bar">
          <button class="icon-btn" data-act="back" aria-label="Missions">${ICON.back}</button>
          <h2>Apollo 11</h2>
        </header>
        <div class="levels-scroll">
          <p class="levels-intro">20 July 1969. Eagle starts down from orbit, 15 km above the Moon at 1,690 m/s. Its computer can fly it -- but it’s heading for a crater full of boulders. Where will you take over?</p>
          <div class="ll-starts">${STARTS.map((s) => `<button class="ll-start" data-start="${s.key}"><i>${starText(stars[s.key])}</i><b>${s.name}</b><span>${s.about}</span></button>`).join('')}</div>
          <p class="levels-intro">Land anywhere flat and clear. Here ASSIST holds the lean you leave it at, like the real lander. Time runs fast while the computer flies: tap the TIME button to change it, or touch any control to take over.</p>
        </div>
      </div>`;
    root.querySelector('[data-act=back]').onclick = () => ctx.back('#/lander');
    root.querySelectorAll('.ll-start').forEach((b) => {
      b.onclick = () => {
        ctx.sfx('tap');
        ctx.navigate(`#/lander/apollo-${b.dataset.start}`);
      };
    });
  }

  function showPlay(n, start) {
    teardown();
    const level = levelFor(n);
    const apollo = n === 'apollo';
    root.innerHTML = `
      <div class="screen play-screen ll-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Missions">${ICON.back}</button>
          <h2>${apollo ? 'Apollo 11' : `Mission ${n}`}</h2>
          <button class="ll-assist" data-act="assist" aria-pressed="true" title="Stability assist: rotation springs back to level when you let go (leans about 20° while held), and sideways drift dies away">ASSIST</button>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
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
        <button class="ll-demo" hidden aria-label="Autopilot demo speed">AUTOPILOT · <b>2×</b></button>
        <button class="ll-demo ll-warp" ${apollo ? '' : 'hidden'} aria-label="Time speed">TIME · <b>1×</b></button>
        <div class="ll-paused" hidden><div><b>Paused</b><span>Tap to carry on flying.</span></div></div>
        <div class="tip" hidden></div>
        <div class="dialog" hidden></div>
      </div>`;
    const demoBtn = root.querySelector('.ll-demo');
    const warpBtn = root.querySelector('.ll-warp');
    ctx.track('level_start', { level: n, start });
    ctx.loadClip?.(EAGLE); // ready for the landing
    if (apollo) Object.values(VOICES).forEach((url) => ctx.loadClip?.(url));
    const tip = root.querySelector('.tip');
    play = new Play(root.querySelector('canvas'), level, {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onSound: (name, on) => {
        if (name === 'stop') ctx.stopLoops?.();
        else ctx.setLoop?.(name, on);
      },
      onLanded: (res) => (play.demo ? demoLanded(n, res) : apollo ? apolloLanded(start, res) : landed(n, res)),
      onWarp: (scale) => (warpBtn.querySelector('b').textContent = `${scale}×`),
      onDemo: (on) => {
        demoBtn.hidden = !on;
        demoBtn.querySelector('b').textContent = `${play?.timeScale ?? 2}×`;
      },
      onCelebrate: () => {
        quiet();
        // (Apollo 11: after "Contact light... engine stop" has been said.)
        if (!apollo) stopClip = ctx.playClip?.(EAGLE);
        else {
          const t = setTimeout(() => (stopClip = ctx.playClip?.(EAGLE)), 2200);
          stopClip = () => clearTimeout(t);
        }
      },
      voice: (name) => ctx.playClip?.(VOICES[name], 1),
      onCrash: (res) => crashed(n, res),
    }, { intro: !apollo, start });
    // Any touch ends the fly-over early.
    root.querySelector('.stage').addEventListener('pointerdown', () => play?.skipIntro(), { capture: true });
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__lander = play;
    // Watching the autopilot: tap for 1×, 2× or 4×.
    demoBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!play.demo) return;
      ctx.sfx('tap');
      play.timeScale = { 1: 2, 2: 4, 4: 1 }[play.timeScale] || 2;
      demoBtn.querySelector('b').textContent = `${play.timeScale}×`;
    });
    // Apollo 11: time speeded up 1×, 4×, 16× or 64×.
    warpBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      ctx.sfx('tap');
      play.setWarp({ 1: 4, 4: 16, 16: 64, 64: 1 }[play.timeScale] || 1);
    });
    warpBtn.querySelector('b').textContent = `${play.timeScale}×`;
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
      if (on && (e.key === 'p' || e.key === 'Escape') && play) {
        e.preventDefault();
        if (play.paused) resume();
        else pause();
        return;
      }
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
    // Pause: everything holds still (engines off, controls let go) until you
    // tap to carry on. Leaving the app pauses it too, so an interruption
    // never crashes the lander.
    const pausedCard = root.querySelector('.ll-paused');
    const letGo = () => {
      ['left', 'right', 'thrust'].forEach((k) => play.setInput(k, false));
      root.querySelectorAll('.ll-btn.on').forEach((b) => b.classList.remove('on'));
    };
    const pause = () => {
      if (!play || play.paused || !root.querySelector('.dialog').hidden) return;
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

    root.querySelector('[data-act=levels]').onclick = () => ctx.back(apollo ? '#/lander/apollo' : '#/lander');
    root.querySelector('[data-act=restart]').onclick = () => {
      quiet();
      resume();
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
    // Landed with assist (marked on the level grid) -- until it's landed
    // without.
    const data = progress.data;
    data.assisted ??= {};
    data.clean ??= {};
    if (!play.assisted) {
      data.clean[n] = true;
      delete data.assisted[n];
    } else if (!data.clean[n]) data.assisted[n] = true;
    progress.complete(n, stars);
    ctx.track('level_complete', { level: n, stars, score: total });
    ctx.haptic(40);
    const row = (label, v) => `<tr><td>${label}</td><td>${v}</td></tr>`;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: stars === 3 ? 'The Eagle has landed!' : stars === 2 ? 'Nice landing!' : 'Down in one piece',
      stars,
      text: `<div class="ll-result">${play.routeSvg()}<table class="ll-score">
        ${row(`Touchdown ${res.vy.toFixed(2)} m/s`, parts.soft)}
        ${row(`Drift ${res.vx.toFixed(2)} m/s`, parts.drift)}
        ${row(`Tilt ${((res.tilt * 180) / Math.PI).toFixed(1)}°`, parts.level)}
        ${row('On target', parts.centre)}
        ${row('Fuel left', parts.fuel)}
        <tr class="total"><td>Score</td><td>${total}</td></tr></table></div>${play.assisted ? '<span class="ll-assisted">Landed with ASSIST on -- try it with assist off to clear the A on this mission.</span>' : ''}`,
      buttons: [
        { label: 'Fly again', act: 'replay', run: () => {
          quiet();
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
        { label: 'Next mission', act: 'next', primary: true, run: () => {
          quiet();
          ctx.navigate(`#/lander/${n + 1}`, { replace: true });
        } },
      ],
    });
  }

  function crashed(n, res) {
    if (!play) return;
    ctx.track('level_fail', { level: n, reason: res.reason });
    if (n === 'apollo') {
      showDialog(root.querySelector('.dialog'), ctx, {
        title: 'Crashed!',
        text: `${res.reason}. Safe landings are under 3 m/s down, 1.2 m/s sideways and 10° of tilt, on ground that’s nearly level -- clear of craters and boulders.`,
        buttons: [
          { label: 'Take over elsewhere', act: 'levels', run: () => ctx.back('#/lander/apollo') },
          { label: 'Try again', act: 'retry', primary: true, run: () => {
            root.querySelector('.dialog').hidden = true;
            play.reset();
          } },
        ],
      });
      return;
    }
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'Crashed!',
      text: `${res.reason}. Safe landings are under 3 m/s down, 1.2 m/s sideways and 10° of tilt.`,
      buttons: [
        { label: 'Missions', act: 'levels', run: () => ctx.back('#/lander') },
        { label: 'Show me', act: 'showme', run: () => {
          root.querySelector('.dialog').hidden = true;
          play.showMe();
        } },
        { label: 'Try again', act: 'retry', primary: true, run: () => {
          root.querySelector('.dialog').hidden = true;
          play.retry();
        } },
      ],
    });
  }

  // Apollo 11 down: the score, and how your fuel compares with Eagle's.
  function apolloLanded(start, res) {
    if (!play) return;
    const { total, parts, stars } = res.score;
    const best = apolloStars();
    best[start] = Math.max(best[start] || 0, stars);
    ctx.save('progress', progress.data);
    ctx.track('lander_apollo', { start, stars, score: total });
    ctx.haptic(40);
    const left = Math.round(hoverSeconds(play.level, play.L));
    const fromEagle = Math.round(Math.abs(play.L.x - (play.level.base.x0 + play.level.base.x1) / 2));
    const row = (label, v) => `<tr><td>${label}</td><td>${v}</td></tr>`;
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'The Eagle has landed!',
      stars,
      text: `<div class="ll-result">${play.routeSvg()}<table class="ll-score">
        ${row(`Touchdown ${res.vy.toFixed(2)} m/s`, parts.soft)}
        ${row(`Drift ${res.vx.toFixed(2)} m/s`, parts.drift)}
        ${row(`Tilt ${((res.tilt * 180) / Math.PI).toFixed(1)}°`, parts.level)}
        ${row(`Fuel left: ${left} s`, parts.fuel)}
        <tr class="total"><td>Score</td><td>${total}</td></tr></table></div>
        <span class="ll-assisted">${left > EAGLE_FUEL ? 'More fuel to spare than' : 'Even closer than'} Eagle, which landed with about ${EAGLE_FUEL} seconds left -- ${fromEagle} m from where it came down.</span>`,
      buttons: [
        { label: 'Take over elsewhere', act: 'levels', run: () => {
          quiet();
          ctx.back('#/lander/apollo');
        } },
        { label: 'Fly again', act: 'replay', primary: true, run: () => {
          quiet();
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
      ],
    });
  }

  // The autopilot's landing: how it scored, and over to you. (It doesn't
  // count toward your progress.)
  function demoLanded(n, res) {
    if (!play) return;
    const { total, stars } = res.score;
    ctx.track('lander_demo', { level: n, score: total });
    showDialog(root.querySelector('.dialog'), ctx, {
      title: 'That’s how it’s done',
      stars,
      text: `The autopilot scored <b>${total}</b>, with ${Math.round((100 * play.L.fuel) / play.L.fuelMax)}% of its fuel left. Your turn!`,
      buttons: [
        { label: 'Watch again', act: 'showme', run: () => {
          quiet();
          root.querySelector('.dialog').hidden = true;
          play.showMe();
        } },
        { label: 'Try it yourself', act: 'retry', primary: true, run: () => {
          quiet();
          root.querySelector('.dialog').hidden = true;
          play.reset();
        } },
      ],
    });
  }

  function route(s) {
    if (s === 'apollo') return showApollo();
    const start = /^apollo-(\w+)$/.exec(s || '')?.[1];
    if (STARTS.some((x) => x.key === start)) return showPlay('apollo', start);
    const n = parseInt(s, 10);
    if (n >= 1 && n <= progress.data.unlocked) showPlay(n);
    else showLevels();
  }

  route(sub);
  return { route, destroy: teardown };
}
