// The coach's worker: follows the game (see follow.js), answering every
// move in turn.
import { Follower } from './follow.js';

const follower = new Follower();
let queue = Promise.resolve();

self.onmessage = (e) => {
  const msg = e.data;
  queue = queue.then(async () => {
    if (msg.type === 'start') {
      await follower.start(msg.level, msg.tablesUrl);
      self.postMessage(follower.answer());
    } else if (msg.type === 'move') {
      self.postMessage(follower.move(msg.m));
    }
  });
};
