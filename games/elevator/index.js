// Elevator Operator: the levels, the run of the lifts, and how you did
// against the dispatcher. Played upright on a phone (either way round on a
// tablet), with lift music.
import { Play } from './play.js';
import { CAPACITY, levelSpec } from './engine.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { lockOrientation, unlockOrientation, currentOrientation } from '../../js/lib/orientation.js';

const NOTE = '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/></svg>';
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// How long everyone's trips took (from pressing the button to getting out):
// your passengers as bars, the computer's on the same people as an outline.
function histogram(yours, theirs) {
  const most = Math.max(10, ...yours, ...theirs);
  const step = [5, 10, 15, 20, 30, 45, 60, 90, 120].find((s) => most / s <= 10) || 180;
  const bins = Math.ceil((most + 0.001) / step);
  const count = (list) => {
    const c = Array(bins).fill(0);
    for (const t of list) c[Math.min(bins - 1, Math.floor(t / step))]++;
    return c;
  };
  const a = count(yours);
  const b = count(theirs);
  const top = Math.max(1, ...a, ...b);
  const W = 300;
  const H = 120;
  const left = 22;
  const bottom = 18;
  const bw = (W - left - 4) / bins;
  const y = (n) => H - bottom - ((H - bottom - 8) * n) / top;
  let svg = `<svg class="el-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trip times">`;
  svg += `<line x1="${left}" y1="${H - bottom}" x2="${W - 2}" y2="${H - bottom}" stroke="#c9cbe0"/>`;
  a.forEach((n, k) => {
    if (n) svg += `<rect x="${(left + k * bw + 1).toFixed(1)}" y="${y(n).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - bottom - y(n)).toFixed(1)}" rx="2" fill="#ff9f1c"/>`;
  });
  // The computer's, as a stepped outline.
  let path = `M${left},${H - bottom}`;
  b.forEach((n, k) => {
    path += ` L${(left + k * bw).toFixed(1)},${y(n).toFixed(1)} L${(left + (k + 1) * bw).toFixed(1)},${y(n).toFixed(1)}`;
  });
  path += ` L${(left + bins * bw).toFixed(1)},${H - bottom}`;
  svg += `<path d="${path}" fill="none" stroke="#22283a" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  for (let k = 0; k <= bins; k += Math.ceil(bins / 6)) {
    svg += `<text x="${(left + k * bw).toFixed(1)}" y="${H - 4}" font-size="10" text-anchor="middle" fill="#565a7e">${k * step}s</text>`;
  }
  svg += `<text x="${left - 4}" y="${y(top) + 4}" font-size="10" text-anchor="end" fill="#565a7e">${top}</text>`;
  svg += `<g font-size="10" font-weight="700"><rect x="${W - 132}" y="2" width="10" height="10" rx="2" fill="#ff9f1c"/><text x="${W - 118}" y="11" fill="#22283a">you</text>`;
  svg += `<line x1="${W - 92}" y1="7" x2="${W - 78}" y2="7" stroke="#22283a" stroke-width="1.6" stroke-dasharray="4 3"/><text x="${W - 74}" y="11" fill="#22283a">computer</text></g>`;
  return `${svg}</svg>`;
}

// A phone (short side under 600 px) is played upright; a tablet either way.
const isPhone = () => Math.min(screen.width, screen.height) < 600;

export function mount(root, ctx, sub) {
  const progress = loadProgress(ctx);
  let play = null;
  let cleanup = [];

  function teardown() {
    if (play) play.destroy();
    if (window.__elevator === play) window.__elevator = null;
    play = null;
    cleanup.forEach((fn) => fn());
    cleanup = [];
    ctx.stopMusic?.();
    unlockOrientation();
  }

  function showLevels() {
    teardown();
    renderLevelSelect(root, ctx, {
      id: 'elevator',
      title: 'Elevator Operator',
      intro: 'Run the lifts in an office building, from the garage to the helipad. Tap a floor in a lift’s shaft to send it there, and get everyone where they’re going.',
      outro: 'Each level is a whole working day, with more people; every three levels a taller building (6 storeys, then 10, 15 and 20) and from level 13, an apartment tower and an office tower side by side, four lifts in all.',
      progress,
    });
  }

  function showPlay(n) {
    teardown();
    const spec = levelSpec(n);
    root.innerHTML = `
      <div class="screen play-screen el-screen">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>Level ${n}</h2>
          <button class="icon-btn el-music" data-act="music" aria-label="Music" aria-pressed="true">${NOTE}</button>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
          <button class="icon-btn" data-act="restart" aria-label="Restart">${ICON.restart}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas>
          <div class="pause-card" hidden><div><b>Paused</b><span>Tap to carry on.</span></div></div>
          <div class="dialog" hidden></div>
        </div>
      </div>`;
    const dialog = root.querySelector('.dialog');
    const pausedCard = root.querySelector('.pause-card');
    play = new Play(root.querySelector('canvas'), {
      sfx: ctx.sfx,
      onOver: (res) => setTimeout(() => over(n, res), 600),
    }, spec);
    // Handle for the end-to-end tests (test/e2e.test.mjs).
    window.__elevator = play;

    // Lift music (on unless you've turned it off).
    const musicBtn = root.querySelector('[data-act=music]');
    let musicOn = ctx.load('music', true);
    const music = () => {
      musicBtn.classList.toggle('off', !musicOn);
      musicBtn.setAttribute('aria-pressed', String(musicOn));
      if (musicOn && !play.paused && dialog.hidden) ctx.startMusic?.('muzak');
      else ctx.stopMusic?.();
    };
    musicBtn.onclick = () => {
      musicOn = !musicOn;
      ctx.save('music', musicOn);
      ctx.sfx('tap');
      music();
    };

    // Pause (and on a phone held sideways, a pause until it's upright).
    const pause = (why = 'pause') => {
      if (!play || play.day.over || !dialog.hidden) return;
      play.paused = true;
      pausedCard.dataset.why = why;
      pausedCard.querySelector('b').textContent = why === 'rotate' ? 'Turn your phone upright' : 'Paused';
      pausedCard.querySelector('span').textContent = why === 'rotate' ? 'The tower needs the height.' : 'Tap to carry on.';
      pausedCard.hidden = false;
      music();
    };
    const resume = () => {
      if (!play || pausedCard.hidden) return;
      if (isPhone() && currentOrientation() !== 'portrait') return pause('rotate');
      pausedCard.hidden = true;
      play.paused = false;
      play.last = performance.now();
      music();
    };
    root.querySelector('[data-act=pause]').onclick = () => {
      ctx.sfx('tap');
      if (!pausedCard.hidden) resume();
      else pause();
    };
    pausedCard.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      resume();
    });
    const hide = () => document.visibilityState === 'hidden' && pause();
    const key = (e) => {
      if (e.key !== 'p' && e.key !== 'Escape') return;
      if (!pausedCard.hidden) resume();
      else pause();
    };
    const resize = () => {
      play?.resize();
      if (isPhone() && currentOrientation() !== 'portrait') pause('rotate');
      else if (pausedCard.dataset.why === 'rotate' && !pausedCard.hidden) {
        pausedCard.querySelector('b').textContent = 'Ready';
        pausedCard.querySelector('span').textContent = 'Tap to carry on.';
        pausedCard.dataset.why = 'pause';
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', resize);
    cleanup.push(() => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', resize);
    });
    if (isPhone()) lockOrientation('portrait');

    root.querySelector('[data-act=levels]').onclick = () => ctx.back('#/elevator');
    root.querySelector('[data-act=restart]').onclick = () => {
      ctx.sfx('tap');
      start();
    };

    function start(watch = false) {
      dialog.hidden = true;
      pausedCard.hidden = true;
      play.reset(spec, watch ? play.getPar().optsList : null);
      play.timeScale = watch ? 2 : 1;
      play.paused = false;
      play.last = performance.now();
      if (isPhone() && currentOrientation() !== 'portrait') pause('rotate');
      music();
      ctx.track('level_start', { level: n, watch });
    }

    function over(level, res) {
      if (!play) return;
      music();
      const p = res.par;
      const sec = (x) => `${Math.round(x)} s`;
      if (res.watched) {
        showDialog(dialog, ctx, {
          title: 'The computer’s run',
          text: `${histogram(p.totals, p.totals)}
            All ${p.delivered} delivered in ${fmt(p.time)}. Trips: average <b>${sec(p.trip)}</b>, median <b>${sec(p.median)}</b>. Your turn!`,
          buttons: [
            { label: 'Levels', act: 'levels', run: () => ctx.back('#/elevator') },
            { label: 'Try it yourself', act: 'retry', primary: true, run: () => start() },
          ],
        });
        return;
      }
      // Scored on the sum of the squares of the trips, against the
      // computer's (as a root-mean-square, so 50% means trips "twice as
      // long", with long waits counting extra).
      const pct = Math.round((100 * p.rms) / Math.max(0.1, res.rms));
      const stars = pct >= 100 ? 3 : pct >= 80 ? 2 : 1;
      progress.complete(level, stars);
      ctx.track('level_complete', { level, stars, pct, trip: Math.round(res.trip), par: Math.round(p.trip) });
      ctx.sfx(stars >= 2 ? 'win' : 'lose');
      const k = (x) => Math.round(x).toLocaleString();
      showDialog(dialog, ctx, {
        title: pct >= 100 ? 'Better than the computer!' : pct >= 80 ? 'Smooth running' : 'Everyone got there',
        stars,
        text: `${histogram(res.totals, p.totals)}
          <table class="el-stats">
            <tr><th></th><th>you</th><th>computer</th></tr>
            <tr><td>Average trip</td><td>${sec(res.trip)}</td><td>${sec(p.trip)}</td></tr>
            <tr><td>Median trip</td><td>${sec(res.median)}</td><td>${sec(p.median)}</td></tr>
            <tr><td>RMS trip</td><td>${sec(res.rms)}</td><td>${sec(p.rms)}</td></tr>
          </table>
          The score is the computer’s RMS trip over yours: <b>${pct}%</b>. (RMS, root mean square: square every trip, average them, take the square root -- so long waits count extra.)`,
        buttons: [
          { label: 'Watch it', act: 'watch', run: () => start(true) },
          { label: 'Retry', act: 'retry', run: () => start() },
          { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`#/elevator/${level + 1}`, { replace: true }) },
        ],
      });
    }

    // The story so far: a new building every few days.
    const people = spec.residents ? `${spec.residents} residents and ${spec.workers} more who come to work` : `${spec.workers} people`;
    const story = spec.residents
      ? (spec.day === 1
        ? `The big one: you run Parkview Apartments and, across the street, Commerce Tower -- two lifts in each. ${spec.residents} residents are asleep in Parkview. Around 8 they'll all head out, most of them over the street to work in Commerce Tower (on foot, by car, a couple by helicopter), the rest into town, while ${spec.workers} more arrive at the offices from elsewhere. Tonight, everyone comes home.`
        : `Day ${spec.day} at Parkview and Commerce Tower: ${people}.`)
      : spec.day === 1
        ? [`Your first day as the lift operator at Maple Street Offices: six storeys, ${people} at work, and one lift -- yours.`,
          `Promoted! Riverside House has ten storeys, a garage, a restaurant and a health club -- and ${people}.`,
          `Harbor Plaza: fifteen storeys, two levels of parking, ${people}. The days are longer here.`,
          `The Empire: twenty storeys under its famous crown, ${people} -- and still only two lifts.`][Math.min(3, Math.floor((n - 1) / 3))]
        : spec.n === 2
          ? `Day 2 at Maple Street Offices: they've opened up the second lift, and taken on more staff -- ${people} work here now.`
          : `Day ${spec.day} at ${spec.place}. Word has got around: ${people} work here now.`;
    showDialog(dialog, ctx, {
      title: spec.day === 1 ? spec.place : `${spec.place}, day ${spec.day}`,
      text: `${story}<br><br>
        A whole day, 7 AM to 7:30 PM, in about ${Math.round(spec.length / 60)} minutes: the morning rush, meetings, lunch (out, the restaurant or the gym), home time. When things go quiet, the clock skips ahead.<br><br>
        <b>Tap a floor in ${spec.cars === 1 ? 'the' : 'a'} lift’s shaft</b> to send it there: that’s its one next stop (tap another and it changes course).
        When it stops, anyone for that floor gets off and everyone waiting gets on (${CAPACITY} at most) before it moves on. The floors they want light up, with a dot for each of them.<br><br>
        The shorter everyone’s trips, the better, and a long wait counts extra.`,
      buttons: [{ label: 'Open the doors', act: 'start', primary: true, run: () => start() }],
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
