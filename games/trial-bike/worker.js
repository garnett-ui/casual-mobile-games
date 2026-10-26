// Builds Trial Bike courses off the main thread (the computer rider test-rides
// each one, which takes a moment on a phone).
import { makeLevel } from './engine.js';

self.onmessage = (e) => {
  const { n } = e.data;
  self.postMessage({ n, level: makeLevel(n) });
};
