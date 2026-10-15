// Screen orientation locking for games.
//
// Where the browser allows it (Android Chrome, for an installed app) we lock
// the orientation directly. We never go fullscreen to get a lock: Chrome then
// shows an unavoidable "To exit full screen…" notice over the game. Where it
// can't lock (a browser tab, iOS), callers check currentOrientation() and
// pause on a mismatch instead.
let locked = false;

export function currentOrientation() {
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

// Resolves true if locked.
export async function lockOrientation(kind) {
  const o = screen.orientation;
  if (!o || !o.lock) return false;
  try {
    await o.lock(kind);
    locked = true;
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation() {
  if (locked) {
    try {
      screen.orientation?.unlock?.();
    } catch {
      // Already released.
    }
  }
  locked = false;
}
