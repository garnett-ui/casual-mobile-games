// Makes the 4x4 pattern databases for 15 (games/fifteen/tables-4x4.bin.gz):
// a few seconds here, but too long on a phone, so the game downloads them
// instead. Only needed if the solver's tile groups or goal change.
//   node tools/build-fifteen-tables.mjs
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Solver } from '../games/fifteen/solver.js';

const s = new Solver(4, 4);
const dbs = s.databases();
const all = new Uint8Array(dbs.reduce((a, d) => a + d.length, 0));
let at = 0;
for (const d of dbs) {
  all.set(d, at);
  at += d.length;
}
const out = new URL('../games/fifteen/tables-4x4.bin.gz', import.meta.url);
writeFileSync(out, gzipSync(all, { level: 9 }));
console.log(`${out.pathname}: ${all.length} bytes, groups ${s.groups().map((g) => g.join(' ')).join(' / ')}`);
