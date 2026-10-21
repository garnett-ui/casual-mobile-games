// 15: following a game with the solver (in the coach's worker, or the main
// thread if need be). The 4x4 pattern databases come ready-made (a few
// seconds' work here, much longer on a phone); if they can't be had,
// they're made.
import { Solver } from './solver.js';

export class Follower {
  async start(level, tablesUrl) {
    this.solver = new Solver(level.w, level.h);
    if (level.w * level.h === 16) await this.tables(tablesUrl);
    this.tracker = this.solver.track(level.board);
    this.ready = true;
  }

  async tables(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      let bytes = new Uint8Array(await res.arrayBuffer());
      // (Unless the server's unzipped it already.)
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      this.solver.useDatabases(bytes);
    } catch {
      // (Made here instead: slower, but the same.)
    }
  }

  answer() {
    return { d: this.tracker.d, next: this.tracker.line[0] ?? null };
  }

  move(m) {
    this.tracker.move(m);
    return this.answer();
  }
}
