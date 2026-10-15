// Supplies generated levels for a game. Building a big level can take a few
// seconds on a phone, so it happens in a module worker; the next level is
// built ahead while you play, and recent levels are kept in storage.
//   workerUrl: module worker answering { n } with { n, level }
//   build(n): main-thread fallback for browsers without module workers
//   version: bump to discard stored levels when generation changes
export function levelSource(ctx, { workerUrl, build, version }) {
  const memo = new Map();
  const waiting = new Map();
  let worker = null;
  const fallback = (n, done) => setTimeout(() => done(build(n)), 30);
  try {
    worker = new Worker(workerUrl, { type: 'module' });
    worker.onmessage = (e) => {
      const done = waiting.get(e.data.n);
      waiting.delete(e.data.n);
      done?.(e.data.level);
    };
    worker.onerror = () => {
      worker = null;
      for (const [n, done] of waiting) fallback(n, done);
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  const key = (n) => `level:${version}:${n}`;
  const get = (n) => {
    if (memo.has(n)) return memo.get(n);
    const stored = ctx.load(key(n), null);
    const p = stored ? Promise.resolve(stored) : new Promise((resolve) => {
      if (worker) {
        waiting.set(n, resolve);
        worker.postMessage({ n });
      } else {
        fallback(n, resolve);
      }
    }).then((level) => {
      ctx.save(key(n), level);
      // Keep storage tidy: drop levels well behind this one.
      ctx.save(key(n - 6), null);
      return level;
    });
    memo.set(n, p);
    return p;
  };
  return { get, destroy: () => worker?.terminate() };
}
