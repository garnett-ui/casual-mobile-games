// The Tangram figures: where they're designed, checked and written out.
//
// Each figure is given either as an outline -- polygons whose union is the
// silhouette; the solver (games/tangram/solver.js) finds a way of making it --
// or as the seven pieces' corners, which are checked to be the real pieces.
// Either way it must use exactly the seven pieces, without overlapping. The
// result, each piece's turn, flip and place, is written to
// games/tangram/figures.js, in the order below (simple to hard).
//
// Units: the small triangle's legs are 1 (so the seven pieces make a square
// of side 2√2). Coordinates can mix whole numbers and multiples of r = √2
// and h = √2/2, for pieces turned 45°. y is down.
//
//   node tools/tangram-figures.mjs               write games/tangram/figures.js
//   node tools/tangram-figures.mjs --check       fail if it's out of date (tests)
//   node tools/tangram-figures.mjs --sheet a.png also draw every figure, in
//                                                silhouette and solved (needs
//                                                Playwright) -- to see a design
//   node tools/tangram-figures.mjs --only Cat,Swan  just these (with --sheet)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SET, SHAPES, outline, inside, area, same } from '../games/tangram/model.js';
import { solve } from '../games/tangram/solver.js';

const r = Math.SQRT2;
const h = r / 2;
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

export const DESIGNS = [
  { name: 'House', outline: [[[-1, 0], [3, 0], [1, -2]], [[0, 0], [2, 0], [2, 2], [0, 2]]] },
  { name: 'Sailboat', outline: [[[-1, 0], [1, 0], [0, -1]], [[1, 0], [1, -2], [3, 0]], [[-2, 0], [4, 0], [3, 1], [-1, 1]]] },
  { name: 'Rocket', outline: [[[-1, 0], [1, 0], [0, -1]], [[-1, 0], [1, 0], [1, 3], [-1, 3]], [[-2, 3], [-1, 2], [-1, 3]], [[1, 2], [2, 3], [1, 3]]] },
  // Head: a square on its corner, small triangles for ears; a medium
  // triangle for the neck, two large for the body, the parallelogram a tail.
  { name: 'Cat', pieces: [
    ['Q', [[0, 0], [h, h], [0, r], [-h, h]]],
    ['S', [[0, 0], [-h, h], [-h, -h]]],
    ['S', [[0, 0], [h, -h], [h, h]]],
    ['M', [[0, r], [r, 0], [r, r]]],
    ['L', [[0, r], [2, r], [0, r + 2]]],
    ['L', [[2, r + 2], [0, r + 2], [2, r]]],
    ['P', [[2, r + 2], [2, r + 1], [3, r], [3, r + 1]]],
  ] },
  // The cat's frame, with a long ear (the parallelogram) and a stubby tail.
  { name: 'Rabbit', pieces: [
    ['Q', [[0, 0], [h, h], [0, r], [-h, h]]],
    ['P', [[-h, h], [0, 0], [0, -r], [-h, h - r]]],
    ['S', [[0, 0], [h, h], [h, -h]]],
    ['M', [[0, r], [r, 0], [r, r]]],
    ['L', [[0, r], [2, r], [0, r + 2]]],
    ['L', [[2, r], [2, r + 2], [0, r + 2]]],
    ['S', [[2, 2], [2, r + 2], [2 + h, r + 2 - h]]],
  ] },
  // Body: the two large triangles; tail feathers: the medium one; the neck
  // rises from a small triangle at the throat, up the parallelogram, to a
  // square head and a small-triangle beak.
  { name: 'Swan', pieces: [
    ['L', [[-r, 0], [r, 0], [0, -r]]],
    ['L', [[r, 0], [0, -r], [2 * r, -r]]],
    ['M', [[2 * r, -r], [2 * r, -2 * r], [r, -r]]],
    ['S', shift([[0, -r], [-1, -r], [0, -r - 1]], 1, 0)],
    ['P', shift([[0, -r], [h, -r - h], [h, -2 * r - h], [0, -2 * r]], 1, 0)],
    ['Q', shift([[0, -2 * r], [h, -2 * r - h], [0, -3 * r], [-h, -2 * r - h]], 1, 0)],
    ['S', shift([[-h, -2 * r - h], [0, -2 * r], [-r, -2 * r]], 1, 0)],
  ] },
  { name: 'Rectangle', outline: [[[0, 0], [4, 0], [4, 2], [0, 2]]] },
  // Head, torso, an arm back (parallelogram) and one forward, a leg kicked
  // back (large triangle) and one forward (medium) with a foot.
  { name: 'Runner', pieces: [
    ['L', [[0, 0], [2, -2], [0, -2]]],
    ['Q', [[0.5, -3], [1.5, -3], [1.5, -2], [0.5, -2]]],
    ['P', [[0, -2], [-1, -2], [-2, -1], [-1, -1]]],
    ['S', [[2, -2], [3, -2], [2, -1]]],
    ['L', [[0, 0], [-r, r], [-2 * r, 0]]],
    ['M', [[0, 0], [r, 0], [r, r]]],
    ['S', [[r, r], [r + 1, r], [r, r + 1]]],
  ] },
  { name: 'Parallelogram', outline: [[[0, 0], [4, 0], [6, 2], [2, 2]]] },
  { name: 'Trapezoid', outline: [[[2, 0], [4, 0], [6, 2], [0, 2]]] },
  { name: 'Triangle', outline: [[[0, 0], [4 * r, 0], [2 * r, 2 * r]]] },
  { name: 'Square', outline: [[[0, 0], [2 * r, 0], [2 * r, 2 * r], [0, 2 * r]]] },
];

// A piece's turn, flip and place (its vertex 0), from its corners; throws
// if they aren't piece t's.
export function placement(t, pts) {
  for (const flip of t === 'P' ? [0, 1] : [0]) {
    for (let rot = 0; rot < 8; rot++) {
      const o = outline(t, rot, flip);
      for (const p of pts) {
        const [x, y] = [p[0] - o[0][0], p[1] - o[0][1]];
        if (same(o.map(([u, v]) => [u + x, v + y]), pts, 1e-6)) return { t, rot, flip, x, y };
      }
    }
  }
  throw new Error(`not a ${t}: ${JSON.stringify(pts)}`);
}

// The pieces of a design (corners), checked: the seven, no overlapping.
export function build(design) {
  let pieces;
  if (design.outline) {
    const [sol] = solve(design.outline);
    if (!sol) throw new Error(`${design.name}: can't be made from the seven pieces`);
    pieces = sol.map(({ t, pts }) => ({ t, pts }));
  } else {
    pieces = design.pieces.map(([t, pts]) => (placement(t, pts), { t, pts }));
  }
  const kinds = pieces.map((p) => p.t).sort().join('');
  if (kinds !== [...SET].sort().join('')) throw new Error(`${design.name}: pieces ${kinds}, not the set`);
  const all = pieces.flatMap((p) => p.pts);
  const [x0, x1] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  for (let x = x0 + 0.007; x < x1; x += 0.03) {
    for (let y = y0 + 0.009; y < y1; y += 0.03) {
      if (pieces.filter((p) => inside(p.pts, x, y)).length > 1) throw new Error(`${design.name}: pieces overlap at ${x.toFixed(2)},${y.toFixed(2)}`);
    }
  }
  // Moved to the origin, in the set's order.
  return SET.map((t) => {
    const k = pieces.findIndex((p) => p.t === t);
    const [p] = pieces.splice(k, 1);
    return { t, pts: p.pts.map(([x, y]) => [x - x0, y - y0]) };
  });
}

// A coordinate as source: a + b·H exactly (H = √2/2), as a whole or half
// number plus a whole multiple of H.
function num(v) {
  for (let b = 0; b <= 40; b = b > 0 ? -b : 1 - b) {
    const a = Math.round((v - b * h) * 2) / 2;
    if (Math.abs(v - b * h - a) > 1e-7) continue;
    const hs = Math.abs(b) === 1 ? 'H' : `${Math.abs(b)} * H`;
    if (!b) return String(a);
    if (!a) return b < 0 ? `-${hs}` : hs;
    return `${a} ${b < 0 ? '-' : '+'} ${hs}`;
  }
  throw new Error(`no exact form for ${v}`);
}

export function source(designs = DESIGNS) {
  const figs = designs.map((d) => {
    const rows = build(d).map(({ t, pts }) => {
      const p = placement(t, pts);
      return `    ['${t}', ${p.rot}, ${p.flip}, ${num(p.x)}, ${num(p.y)}],`;
    });
    return `  { name: '${d.name}', pieces: [\n${rows.join('\n')}\n  ] },`;
  });
  return `// The Tangram figures, simple to hard: each as one way of making it, every
// piece as [kind, turn (× 45° clockwise), flip, x, y] with (x, y) where its
// vertex 0 goes (see SHAPES in model.js).
//
// Generated by tools/tangram-figures.mjs from the designs there: change
// them there, and run it to rewrite this file.
const H = Math.SQRT1_2;

export const FIGURES = [
${figs.join('\n')}
];
`;
}

// Every figure in silhouette, and beside it how it's made -- a picture to
// check a design by.
async function sheet(file, designs) {
  const { chromium } = await import('playwright');
  const items = designs.map((d) => ({ name: d.name, pieces: build(d) }));
  const colors = ['#e63946', '#3a86ff', '#2ec4b6', '#ffbe0b', '#fb5607', '#8338ec', '#06d6a0'];
  const html = `<body style="margin:0"><canvas id=c></canvas><script>
    const items = ${JSON.stringify(items)}, colors = ${JSON.stringify(colors)};
    const cols = 4, cw = 300, ch = 300, c = document.getElementById('c');
    c.width = cols * cw; c.height = Math.ceil(items.length / cols) * ch;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    items.forEach((it, k) => {
      const ox = (k % cols) * cw, oy = Math.floor(k / cols) * ch;
      const all = it.pieces.flatMap((p) => p.pts);
      const w = Math.max(...all.map((p) => p[0])), h = Math.max(...all.map((p) => p[1]));
      const s = Math.min(135 / w, 250 / h, 40);
      const path = (pts, dx) => { g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](ox + dx + x * s, oy + 30 + y * s)); g.closePath(); };
      g.fillStyle = '#000'; g.font = 'bold 15px sans-serif'; g.fillText((k + 1) + '. ' + it.name, ox + 6, oy + 18);
      for (const p of it.pieces) { path(p.pts, 6); g.fillStyle = '#2b2d42'; g.fill(); g.strokeStyle = '#2b2d42'; g.stroke(); }
      it.pieces.forEach((p, i) => { path(p.pts, 150); g.fillStyle = colors[i]; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); });
    });
  </script></body>`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.locator('#c').screenshot({ path: file });
  await browser.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const target = new URL('../games/tangram/figures.js', import.meta.url);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
  if (args.includes('--sheet')) {
    const file = args[args.indexOf('--sheet') + 1];
    await sheet(file, DESIGNS.filter((d) => !only || only.includes(d.name)));
    console.log(`drew ${file}`);
  } else if (args.includes('--check')) {
    if (readFileSync(target, 'utf8') !== source()) {
      console.error('games/tangram/figures.js is out of date. Run: node tools/tangram-figures.mjs');
      process.exit(1);
    }
    console.log('tangram figures up to date');
  } else {
    writeFileSync(target, source());
    console.log(`wrote games/tangram/figures.js (${DESIGNS.length} figures)`);
  }
}
