// The player's own photos, kept on the device in IndexedDB (big images don't
// fit in localStorage). Nothing is uploaded anywhere.
const DB = 'pocket-arcade-photos';
const STORE = 'photos';
const MAX_SIDE = 2048; // enough for any phone screen at full resolution

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

// Decode a picked/taken image (respecting its camera orientation), shrink it
// to at most MAX_SIDE pixels and store it as a JPEG. Returns the record.
export async function savePhoto(file) {
  const img = await decode(file);
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * k);
  const h = Math.round(img.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  const rec = { id: `photo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, blob, w, h, created: Date.now() };
  await tx('readwrite', (s) => s.put(rec));
  // Ask the browser not to clear our storage when space runs low.
  navigator.storage?.persist?.().catch(() => {});
  return rec;
}

export async function decode(blob) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Fall back to an <img> below.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function listPhotos() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => b.created - a.created);
}

export function getPhoto(id) {
  return tx('readonly', (s) => s.get(id));
}

export function deletePhoto(id) {
  return tx('readwrite', (s) => s.delete(id));
}
