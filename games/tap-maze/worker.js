// Builds Tap Maze levels off the main thread.
import { makeLevel } from './levels.js';

self.onmessage = (e) => {
  const { n } = e.data;
  self.postMessage({ n, level: makeLevel(n) });
};
