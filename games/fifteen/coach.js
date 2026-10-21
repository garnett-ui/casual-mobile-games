// 15: follows a game as it's played -- the exact distance from solved after
// every move, and a best next move -- in a worker (see coach-worker.js), or
// here if workers can't be had. Moves are sent as they're made; nothing
// waits for the answers until the score card (done) or a hint.
//   const c = coach(level); c.move(cell) ...; await c.hint(); await c.done()
import { Follower } from './follow.js';

export function coach(level) {
  const ds = []; // the distance after each move, from the start
  let hint = null; // a best move from where the last answer left off
  let sent = 0; // moves sent
  const waiting = []; // [resolve, when ds has this many]
  const answer = ({ d, next }) => {
    ds.push(d);
    hint = next;
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (ds.length >= waiting[i][1]) waiting.splice(i, 1)[0][0]();
    }
  };
  const caught = (count) => new Promise((resolve) => (ds.length >= count ? resolve() : waiting.push([resolve, count])));
  let worker = null;
  let local = null;
  const tablesUrl = new URL('./tables-4x4.bin.gz', import.meta.url).href;
  try {
    worker = new Worker(new URL('./coach-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => answer(e.data);
    worker.onerror = () => {
      worker = null;
      goLocal();
    };
    worker.postMessage({ type: 'start', level, tablesUrl });
  } catch {
    goLocal();
  }
  let moves = [];
  function goLocal() {
    // (Everything again, from the start, here.)
    local = new Follower();
    local.start(level, tablesUrl).then(() => {
      ds.length = 0;
      const first = local.answer();
      answer(first);
      for (const m of moves) answer(local.move(m));
    });
  }
  return {
    ds,
    move(m) {
      moves.push(m);
      sent++;
      if (worker) worker.postMessage({ type: 'move', m });
      else if (local?.ready) answer(local.move(m));
    },
    // A best next move from here (once caught up).
    async hint() {
      await caught(sent + 1);
      return hint;
    },
    // The distances, once every move's been followed.
    async done() {
      await caught(sent + 1);
      return ds.slice();
    },
    destroy() {
      worker?.terminate();
      worker = null;
      moves = [];
    },
  };
}
