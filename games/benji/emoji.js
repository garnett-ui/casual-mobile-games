// Benji's Town: emoji, drawn from pictures that come with the game (Google's
// Noto Emoji, in emoji/ -- fetched by tools/benji-emoji.py) rather than the
// device's emoji font: some browsers (a car's, say) have none, and every
// picture in the town came out blank.

const cache = new Map();

// The picture for an emoji: emoji/1f5d1.svg for 🗑️ (no variation selector).
export const emojiURL = (ch) => new URL(`./emoji/${[...ch].filter((c) => c !== '️').map((c) => c.codePointAt(0).toString(16)).join('-')}.svg`, import.meta.url).href;

function picture(ch) {
  let img = cache.get(ch);
  if (!img && typeof Image !== 'undefined') {
    img = new Image();
    img.src = emojiURL(ch);
    cache.set(ch, img);
  }
  return img;
}

// Draw an emoji centred at (x, y), the size of the current font -- as
// g.fillText(ch, x, y) would with the text centred, middle. (Till its
// picture has loaded, or if there isn't one, the font's own.)
export function emoji(g, ch, x, y) {
  const img = picture(ch);
  if (!img?.complete || !img.naturalWidth) {
    g.fillText(ch, x, y);
    return;
  }
  const s = parseFloat(/([\d.]+)px/.exec(g.font)?.[1] || 16) * 1.12;
  g.drawImage(img, x - s / 2, y - s / 2, s, s);
}

// Load these now, so they're there when first drawn.
export function preload(list) {
  for (const ch of list) picture(ch);
}
