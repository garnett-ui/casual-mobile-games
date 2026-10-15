// Screen orientation locking for games.
//
// Android Chrome lets an installed app lock orientation directly; in a browser
// tab it only works in fullscreen, so we go fullscreen first. iOS can't lock at
// all -- callers should check currentOrientation() and pause on a mismatch.
let enteredFullscreen = false;
let locked = false;

export function currentOrientation() {
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

// Must be called from a user gesture (a tap). Resolves true if locked.
export async function lockOrientation(kind) {
  const o = screen.orientation;
  if (!o || !o.lock) return false;
  try {
    await o.lock(kind);
    locked = true;
    return true;
  } catch {
    // Not allowed outside fullscreen here: try again in fullscreen.
  }
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
      enteredFullscreen = true;
    }
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
  if (enteredFullscreen && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  enteredFullscreen = false;
}
