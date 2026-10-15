// Builds levels off the main thread so the game stays smooth while a big lot
// is being generated.
import { makeLevel } from './levels.js';

self.onmessage = (e) => {
  const { n, base } = e.data;
  self.postMessage({ n, level: makeLevel(n, base) });
};
