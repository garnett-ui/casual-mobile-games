// 15: what's on the tiles -- the player's choice, for any level: numbers, a
// picture (js/lib/patterns.js), a sequence of frames, or a photo of their
// own (saved on the device, shared with Jigsaw).
import { PICTURES, SEQUENCES, render, distinct } from '../../js/lib/patterns.js';

export const STYLES = [
  { key: 'numbers', name: 'Numbers', kind: 'numbers' },
  { key: 'pic:corners', name: 'Gradient', kind: 'pic', id: 'corners' },
  { key: 'pic:wheel', name: 'Colour wheel', kind: 'pic', id: 'wheel' },
  { key: 'pic:spiral', name: 'Spiral', kind: 'pic', id: 'spiral' },
  { key: 'pic:glass', name: 'Stained glass', kind: 'pic', id: 'glass' },
  { key: 'pic:topo', name: 'Map', kind: 'pic', id: 'topo' },
  { key: 'pic:landscape', name: 'Landscape', kind: 'pic', id: 'landscape' },
  { key: 'seq:clock', name: 'Clock', kind: 'seq', id: 'clock' },
  { key: 'seq:moon', name: 'Moon', kind: 'seq', id: 'moon' },
  { key: 'seq:plant', name: 'Plant', kind: 'seq', id: 'plant' },
  { key: 'seq:sun', name: 'Sun', kind: 'seq', id: 'sun' },
  { key: 'seq:glass', name: 'Glass of water', kind: 'seq', id: 'glass' },
];

// A style by its key ('photo:<id>' for a photo).
export function styleOf(key) {
  if (key?.startsWith('photo:')) return { key, name: 'Your photo', kind: 'photo', id: key.slice(6) };
  return STYLES.find((s) => s.key === key) || STYLES[0];
}

export const sequenceOf = (style) => SEQUENCES.find((q) => q.id === style.id) || SEQUENCES[0];

// The whole picture for a w-by-h board, px a tile: a pattern drawn from the
// level's seed, or the photo (image) cropped to fill it.
export function pictureFor(style, w, h, px, seed, image) {
  const c = document.createElement('canvas');
  c.width = px * w;
  c.height = px * h;
  const g = c.getContext('2d');
  if (style.kind === 'photo' && image) {
    const iw = image.width || image.naturalWidth;
    const ih = image.height || image.naturalHeight;
    const k = Math.max(c.width / iw, c.height / ih);
    g.drawImage(image, (c.width - iw * k) / 2, (c.height - ih * k) / 2, iw * k, ih * k);
  } else {
    const p = PICTURES.find((q) => q.id === style.id) || PICTURES[0];
    const img = g.createImageData(c.width, c.height);
    render(p.make(seed), c.width, c.height, img.data);
    g.putImageData(img, 0, 0);
  }
  return c;
}

// How alike the two most alike tiles of a picture are (see distinct in
// patterns.js: about 2 is just noticeable).
export function alikeness(picture, w, h) {
  const S = 8;
  const small = document.createElement('canvas');
  small.width = w * S;
  small.height = h * S;
  const g = small.getContext('2d');
  g.drawImage(picture, 0, 0, small.width, small.height);
  const d = g.getImageData(0, 0, small.width, small.height).data;
  const at = (u, v) => {
    const i = (Math.min(small.height - 1, Math.floor(v * small.height)) * small.width + Math.min(small.width - 1, Math.floor(u * small.width))) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  return distinct(at, w, h, { samples: S }).alike;
}

// Below this, some tiles are too alike to tell apart: number them.
export const TOO_ALIKE = 2.5;

// A small square preview for the chooser.
export function preview(style, size, image) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (style.kind === 'numbers') {
    g.fillStyle = '#2e241b';
    g.fillRect(0, 0, size, size);
    const s = size / 2 - 3;
    ['1', '2', '3', ''].forEach((t, k) => {
      if (!t) return;
      const x = 2 + (k % 2) * (s + 2);
      const y = 2 + ((k / 2) | 0) * (s + 2);
      g.fillStyle = '#f4e4c1';
      g.beginPath();
      g.roundRect(x, y, s, s, 4);
      g.fill();
      g.fillStyle = '#3b2a1a';
      g.font = `900 ${Math.round(s * 0.55)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, x + s / 2, y + s / 2 + 1);
    });
  } else if (style.kind === 'seq') {
    g.fillStyle = '#f4e4c1';
    g.fillRect(0, 0, size, size);
    sequenceOf(style).draw(g, size, 4, 8);
  } else {
    g.drawImage(pictureFor(style, 1, 1, size, 7, image), 0, 0);
  }
  return c;
}
