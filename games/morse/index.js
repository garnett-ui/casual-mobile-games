// Morse Rain: two sets of lessons -- listening (hear a letter, tap it in the
// cloud) and sending (key a letter, and the cannon shoots it down) -- each
// with its own levels; the lesson; and how you did.
import { CODE, levelSpec, starsFor, SLOWEST } from './code.js';
import { Play } from './play.js';
import { SendPlay } from './send.js';
import { ICON, loadProgress, renderLevelSelect, showDialog } from '../../js/lib/campaign.js';
import { playMorse, sidetone } from '../../js/lib/audio.js';

const LISTEN = 'listen';
const SEND = 'send';

export function mount(root, ctx, sub) {
  // Progress for each: listening's kept as it always was; sending's apart.
  const progress = {
    [LISTEN]: loadProgress(ctx),
    [SEND]: loadProgress({ ...ctx, load: (k, f) => ctx.load(`send-${k}`, f), save: (k, v) => ctx.save(`send-${k}`, v) }),
  };
  const home = (mode) => (mode === SEND ? '#/morse/send' : '#/morse');
  let play = null;
  let onResize = null;
  let onHide = null;

  function teardown() {
    if (play) play.destroy();
    play = null;
    if (onResize) window.removeEventListener('resize', onResize);
    if (onHide) document.removeEventListener('visibilitychange', onHide);
    onResize = onHide = null;
  }

  function showLevels(mode) {
    teardown();
    renderLevelSelect(root, ctx, mode === SEND
      ? {
        id: 'morse/send',
        title: 'Morse Rain',
        intro: 'Letters rain down. Key one’s code -- tap anywhere: short for a dit, long for a dah -- and the cannon shoots it down. Don’t let them reach the ground!',
        outro: 'The same lessons as listening: E I A N T to start, then a couple of new characters each level. The keying follows your own speed. Under each level: your best effective speed -- the letters you sent right each minute, in words a minute (five letters a word).',
        progress: progress[SEND],
        note: (n) => (progress[SEND].data.wpm?.[n] ? `${progress[SEND].data.wpm[n]} wpm` : ''),
      }
      : {
        id: 'morse',
        title: 'Morse Rain',
        intro: 'A cloud of letters drifts about. Listen to the Morse code for one of them, and tap it. Clear the screen!',
        outro: 'E I A N T to start, then a couple of new characters each level -- the rest of the letters, numbers and punctuation -- then bigger reviews of the lot, coming faster: from 5 words a minute up to 15 (marked on each). Every character is sent at 20 words a minute, as real Morse sounds, and repeats until you find it -- but find it the first time for the best score.',
        progress: progress[LISTEN],
        note: (n) => (levelSpec(n).pace > SLOWEST ? `${levelSpec(n).pace} wpm` : ''),
      });
    // Listening or sending: switch between them.
    const tabs = document.createElement('div');
    tabs.className = 'mr-tabs';
    tabs.innerHTML = `<button data-mode="${LISTEN}" class="${mode === LISTEN ? 'on' : ''}">Listen</button><button data-mode="${SEND}" class="${mode === SEND ? 'on' : ''}">Send</button>`;
    root.querySelector('.levels-scroll').prepend(tabs);
    tabs.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.mode === mode) return;
        ctx.sfx('tap');
        ctx.navigate(home(b.dataset.mode), { replace: true });
      };
    });
  }

  function showPlay(mode, n) {
    teardown();
    const spec = levelSpec(n);
    root.innerHTML = `
      <div class="screen play-screen mr-screen ${mode === SEND ? 'mr-send' : ''}">
        <header class="bar">
          <button class="icon-btn" data-act="levels" aria-label="Levels">${ICON.back}</button>
          <h2>${mode === SEND ? 'Send' : 'Level'} ${n}</h2>
          <span class="pill"><b data-left>${spec.letters.length}</b>&nbsp;left</span>
          <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
        </header>
        <div class="stage"><canvas class="board"></canvas>
          <div class="pause-card" hidden><div><b>Paused</b><span>Tap to carry on.</span></div></div>
        </div>
        <div class="dialog" hidden></div>
      </div>`;
    const dialog = root.querySelector('.dialog');
    const pausedCard = root.querySelector('.pause-card');
    const leftEl = root.querySelector('[data-left]');
    const hooks = {
      sfx: ctx.sfx,
      haptic: ctx.haptic,
      onOver: (res) => setTimeout(() => over(mode, n, res), 600),
    };
    const canvas = root.querySelector('canvas');
    if (mode === SEND) {
      play = new SendPlay(canvas, spec, { ...hooks, tone: (on) => sidetone(on) }, { dit: ctx.load('send-dit', null), pause: ctx.load('send-pause', null) });
      window.__morseSend = play; // (for the end-to-end tests)
    } else {
      play = new Play(canvas, spec, { ...hooks, morse: (code) => playMorse(code) });
      window.__morse = play; // (for the end-to-end tests)
    }
    const tick = setInterval(() => {
      if (!play) return clearInterval(tick);
      leftEl.textContent = play.tiles.length + (play.queue?.length || 0);
    }, 200);
    onResize = () => play?.resize();
    window.addEventListener('resize', onResize);
    const pause = () => {
      if (!play || play.paused || play.over || !dialog.hidden) return;
      play.paused = true;
      pausedCard.hidden = false;
    };
    onHide = () => document.hidden && pause();
    document.addEventListener('visibilitychange', onHide);
    pausedCard.onclick = () => {
      pausedCard.hidden = true;
      play.paused = false;
    };
    root.querySelector('[data-act=pause]').onclick = () => {
      ctx.sfx('tap');
      pause();
    };
    root.querySelector('[data-act=levels]').onclick = () => ctx.back(home(mode));
    intro(mode, n, spec);
  }

  // Before the lesson: the new characters, to hear (it's all by ear -- the
  // printed dots and dashes are never shown).
  function intro(mode, n, spec) {
    const dialog = root.querySelector('.dialog');
    const list = spec.fresh;
    const keys = list.map((ch) => `<button class="btn mr-key" data-ch="${ch}"><b>${ch}</b></button>`).join('');
    const quiet = !ctx.getSetting('sound');
    const how = mode === SEND
      ? 'Tap anywhere to key -- a short tap for a dit, a longer one for a dah -- and pause: the cannon fires at the lowest tile with that letter. Three tiles reaching the ground and it’s over. They come at 5 words a minute to start; get them down to fewer than three, all high up, and they come faster, up to 20. The keying follows your speed; key a letter with excellent timing (a dah three units long, a dit one, the pause between them one, and three between letters) and it shoots two.'
      : 'You’ll hear the code for one of the letters on the screen, again and again till you find it: tap a tile with that letter and it’s gone. Clear them all! Tap the wrong letter and a copy of the right one floats in. Find each one the first time you hear it for the best score.';
    const text = (quiet ? '<b>Sound is off -- and this game is all sound. Start turns it on.</b><br><br>' : '') + (list.length
      ? `New ${list.length === 1 ? 'character' : 'characters'}: tap to listen.<div class="mr-keys">${keys}</div>
        ${n === 1 ? how : `With all ${spec.alphabet.length} so far.`}`
      : `A review: all ${spec.alphabet.length} characters so far${mode === LISTEN && spec.pace > SLOWEST ? `, coming at <b>${spec.pace} words a minute</b>` : ''}.`);
    ctx.track('level_start', { level: n, mode });
    showDialog(dialog, ctx, {
      title: `${mode === SEND ? 'Send' : 'Level'} ${n}${list.length ? '' : ': review'}`,
      text,
      buttons: [{ label: 'Start', act: 'start', primary: true, run: () => {
        if (!ctx.getSetting('sound')) ctx.setSetting('sound', true);
        dialog.hidden = true;
        play.paused = false;
      } }],
    });
    dialog.querySelectorAll('.mr-key').forEach((b) => {
      b.onclick = () => {
        if (!ctx.getSetting('sound')) ctx.setSetting('sound', true);
        playMorse(CODE[b.dataset.ch]);
      };
    });
  }

  function over(mode, n, res) {
    if (!play) return;
    const dialog = root.querySelector('.dialog');
    const retry = [
      { label: 'Levels', act: 'levels', run: () => ctx.back(home(mode)) },
      { label: 'Try again', act: 'retry', primary: true, run: () => showPlay(mode, n) },
    ];
    // (Your keying rhythm, for next time.)
    if (mode === SEND && res.dit) ctx.save('send-dit', res.dit);
    if (mode === SEND && res.pause) ctx.save('send-pause', res.pause);
    if (!res.won) {
      ctx.track('level_fail', { level: n, mode });
      ctx.sfx('lose');
      showDialog(dialog, ctx, mode === SEND
        ? { title: 'They got through!', text: `Three letters reached the ground. You shot down <b>${res.hits}</b>. Take your time: the keying follows your speed.`, buttons: retry }
        : { title: 'Too many letters!', text: `The cloud grew to twice its size. You cleared <b>${res.right}</b>. Tap the background to hear a letter again -- and replay earlier levels to practise.`, buttons: retry });
      return;
    }
    // Stars: listening, by letters found without a wrong tap; sending, by
    // lives left (and not too many letters keyed at nothing).
    const stars = mode === SEND
      ? res.lives === 3 && res.wrong <= Math.ceil(res.total * 0.2) ? 3 : res.lives >= 2 ? 2 : 1
      : starsFor(res.total - res.wrong, res.total, res.again);
    // Sending: your best effective speed, for the level grid.
    const wpm = Math.round(res.effectiveWpm || 0);
    const best = mode === SEND && wpm > (progress[SEND].data.wpm?.[n] || 0);
    if (best) (progress[SEND].data.wpm ??= {})[n] = wpm;
    progress[mode].complete(n, stars);
    ctx.track('level_complete', { level: n, stars, mode });
    ctx.sfx('win');
    const text = mode === SEND
      ? `<b>${res.hits}</b> of ${res.total} shot down${res.total - res.hits ? `, ${res.total - res.hits} got through` : ''}${res.wrong ? `; ${res.wrong} keyed at nothing` : ''}.${res.excellent ? ` Excellent timing ${res.excellent} time${res.excellent === 1 ? '' : 's'}!` : ''}<br>Sent at <b>${wpm} wpm</b>${best && wpm ? ' -- your best here' : ''}${res.topWpm >= res.wpm + 0.5 ? `; the rain got up to ${Math.round(res.topWpm)}` : ''}.`
      : `All ${res.right} cleared${res.wrong ? `, with ${res.wrong} wrong tap${res.wrong === 1 ? '' : 's'}` : ' -- not a single wrong tap'}${res.again ? `; ${res.again} heard more than once before you found ${res.again === 1 ? 'it' : 'them'}` : res.wrong ? '' : ', every one found first time'}.`;
    showDialog(dialog, ctx, {
      title: stars === 3 ? 'Loud and clear!' : stars === 2 ? 'Good copy' : 'Made it through',
      stars,
      text,
      buttons: [
        { label: 'Replay', act: 'replay', run: () => showPlay(mode, n) },
        { label: 'Next level', act: 'next', primary: true, run: () => ctx.navigate(`${home(mode)}/${n + 1}`, { replace: true }) },
      ],
    });
  }

  function route(s = '') {
    const [first, second] = s.split('/');
    const mode = first === SEND ? SEND : LISTEN;
    const n = parseInt(mode === SEND ? second : first, 10);
    if (n >= 1 && n <= progress[mode].data.unlocked) showPlay(mode, n);
    else showLevels(mode);
  }

  route(sub);
  return { route, destroy: teardown };
}
