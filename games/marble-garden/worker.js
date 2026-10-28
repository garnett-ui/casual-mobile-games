// Builds Marble Garden levels off the main thread (the computer gnome plays
// each one through twice, which takes a moment on a phone).
import { makeLevel } from './engine.js';

self.onmessage = (e) => {
  const { n } = e.data;
  self.postMessage({ n, level: makeLevel(n) });
};
