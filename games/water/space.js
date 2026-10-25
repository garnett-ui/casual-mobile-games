// Water Lab: the solution space -- every state the water can be in, from a
// level's start, and every pour between them, drawn as a map.
//
// With three beakers the total never changes, so a state (a, b, c) is a
// point in a plane: a·U0 + b·U1 + c·U2, the Us three unit vectors 120°
// apart. A pour from beaker i to j of t ml moves that point t·(Uj − Ui):
// along one of just six directions, the six of a hexagonal lattice -- so
// every pour is a straight line along one of the lattice's axes, as long as
// the amount poured. (Every state you can reach has a beaker empty or full,
// so they lie round the edge of the region the beakers allow.)
//
// Four beakers: the same with four unit vectors to the corners of a
// tetrahedron -- the states fill a 3D lattice (a stack of tetrahedra and
// octahedra), each pour along one of 12 directions; you turn it round to
// see it. Five: a 4D lattice, shown through five vectors in 3D (so states
// can line up behind each other -- turn it to see past them).
import { pour, goalMet, solve } from './model.js';

const key = (s) => s.join(',');
export const NAMES = 'ABCDE';
// The beakers' directions (three beakers): A up, B down right, C down left.
const U = [-90, 30, 150].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);
// Where a state (three beakers) is in the plane.
const at = (s) => [s[0] * U[0][0] + s[1] * U[1][0] + s[2] * U[2][0], s[0] * U[0][1] + s[1] * U[1][1] + s[2] * U[2][1]];
// Four beakers: to the corners of a tetrahedron. Five: those and a fifth,
// off to one side.
const unit = (v) => v.map((c) => c / Math.hypot(...v));
const W3 = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1], [0.35, -0.6, 0.72]].map(unit);

// Every state reachable from start (up to limit), and every pour between
// them: { nodes: [{ s, d (pours from start), goal }], edges: [{ a, b, i,
// j, t }] (a, b node indexes), index: Map key -> node }.
export function spaceGraph(caps, start, goal, limit = 6000) {
  const nodes = [{ s: start, d: 0, goal: goalMet(goal, start) }];
  const index = new Map([[key(start), 0]]);
  const edges = [];
  for (let q = 0; q < nodes.length; q++) {
    const { s, d } = nodes[q];
    for (let i = 0; i < caps.length; i++) {
      for (let j = 0; j < caps.length; j++) {
        const r = pour(caps, s, i, j);
        if (!r) continue;
        const k = key(r.state);
        let b = index.get(k);
        if (b === undefined) {
          if (nodes.length >= limit) continue;
          b = nodes.length;
          index.set(k, b);
          nodes.push({ s: r.state, d: d + 1, goal: goalMet(goal, r.state) });
        }
        edges.push({ a: q, b, i, j, t: r.amount });
      }
    }
  }
  return { nodes, edges, index, full: nodes.length < limit };
}

// Where each state goes on the map, the start at the origin: [x, y, z].
// Three beakers: flat, on the hexagonal lattice (one unit a ml). Four or
// five: in 3D, a pour of t ml from i to j moving it t·(Wj − Wi).
export function layout(caps, graph) {
  const { nodes } = graph;
  const pos = caps.length === 3
    ? (s) => [...at(s), 0]
    : (s) => [0, 1, 2].map((c) => s.reduce((t, v, i) => t + v * W3[i][c], 0));
  const o = pos(nodes[0].s);
  return { kind: caps.length === 3 ? 'hex' : '3d', pts: nodes.map((n) => pos(n.s).map((v, c) => v - o[c])) };
}

// The lattice points the beakers allow (three beakers): every (a, b, c) with
// the same total, none over its beaker -- reachable or not.
export function lattice(caps, total) {
  const out = [];
  for (let a = 0; a <= caps[0]; a++) {
    for (let b = 0; b <= caps[1]; b++) {
      const c = total - a - b;
      if (c >= 0 && c <= caps[2]) out.push([a, b, c]);
    }
  }
  return out;
}

// A state as "1·5·1".
export const label = (s) => s.join('·');

// ------------------------------------------------------------------- the view

// The map, in a pop-up over the bench: drag to look round (three beakers)
// or turn it round (more), pinch (or the wheel) to zoom; tap a state to see
// it. Your pours so far in blue, the shortest way on from where you are in
// gold.
export class SpaceView {
  constructor(host, level, { state, history }, { onClose } = {}) {
    this.level = level;
    this.graph = spaceGraph(level.caps, level.start, level.goal);
    this.map = layout(level.caps, this.graph);
    this.onClose = onClose;
    const k = level.caps.length;
    const total = level.start.reduce((a, b) => a + b, 0);
    // Your way here (start ... now), and on to the goal.
    const path = [...history, state].map((s) => this.graph.index.get(key(s))).filter((n) => n !== undefined);
    this.mine = path;
    this.here = this.graph.index.get(key(state)) ?? 0;
    const way = solve(level.caps, state, level.goal) || [];
    let s = state;
    this.ahead = [this.here];
    for (const [i, j] of way) {
      s = pour(level.caps, s, i, j).state;
      const n = this.graph.index.get(key(s));
      if (n !== undefined) this.ahead.push(n);
    }
    const o = k === 3 ? at(level.start) : null;
    this.grid = k === 3 ? lattice(level.caps, total).map((q) => {
      const p = at(q);
      return [p[0] - o[0], p[1] - o[1], 0];
    }) : [];
    // (Turned a little to begin with, to show it's solid.)
    this.flat = k === 3;
    this.yaw = this.flat ? 0 : 0.55;
    this.pitch = this.flat ? 0 : 0.45;
    const goals = this.graph.nodes.filter((n) => n.goal).length;
    const far = Math.max(...this.graph.nodes.map((n) => n.d));
    const caps = level.caps.map((c, i) => `<b>${NAMES[i]}</b>&nbsp;${c}`).join(' · ');
    this.el = document.createElement('div');
    this.el.className = 'wl-map';
    this.el.innerHTML = `
      <div class="wl-map-head">
        <div>
          <h3>Every way the water can go</h3>
          <p>${this.graph.nodes.length}${this.graph.full ? '' : '+'} states · ${this.graph.edges.length} pours · ${goals} solve it · at most ${far} pours from the start</p>
          <p class="wl-map-caps">Beakers, left to right: ${caps} ml</p>
        </div>
        <button class="icon-btn" data-act="close" aria-label="Close">✕</button>
      </div>
      <canvas class="wl-map-canvas"></canvas>
      <div class="wl-map-key">
        <span><b class="sw dot start"></b>start</span>
        <span><b class="sw dot here"></b>you are here</span>
        <span><b class="sw dot goal"></b>solved</span>
        <span><b class="sw line mine"></b>your pours</span>
        <span><b class="sw line ahead"></b>shortest way on</span>
      </div>
      <p class="wl-map-note">${k === 3
        ? 'Each line is one pour, along one of six directions (the compass shows which beaker into which); its length is how much was poured.'
        : k === 4
          ? 'With four beakers the states fill a 3D lattice (stacked tetrahedra and octahedra): each line is one pour, along one of 12 directions, as long as the amount poured.'
          : 'With five beakers the lattice has four dimensions, shown here in three: each line is one pour, as long as the amount poured.'} ${k === 3 ? 'Drag to look round' : 'Drag to turn it round'}; pinch to zoom; tap a state.</p>`;
    host.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.el.querySelector('[data-act=close]').onclick = () => this.close();
    this.onKey = (e) => {
      if (e.key === 'Escape') this.close();
    };
    window.addEventListener('keydown', this.onKey);
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
    this.bindInput();
    this.fit();
  }

  close() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.el.remove();
    this.onClose?.();
  }

  // The whole map in view (with three beakers, clear of the compass, top
  // left; with more, room to turn it round). The start is usually a corner
  // -- one beaker full, the rest empty -- so centring the start would leave
  // half the screen empty.
  fit() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    const pts = [...this.map.pts, ...this.grid];
    const lo = [0, 1, 2].map((c) => Math.min(...pts.map((p) => p[c])));
    const hi = [0, 1, 2].map((c) => Math.max(...pts.map((p) => p[c])));
    this.mid = lo.map((v, c) => (v + hi[c]) / 2);
    const top = this.flat ? 104 : 0;
    const pad = 28;
    if (this.flat) {
      this.k = Math.min((this.W - 2 * pad) / Math.max(1e-6, hi[0] - lo[0]), (this.H - top - 2 * pad) / Math.max(1e-6, hi[1] - lo[1]));
    } else {
      const R = Math.max(1e-6, ...pts.map((p) => Math.hypot(p[0] - this.mid[0], p[1] - this.mid[1], p[2] - this.mid[2])));
      this.R = R;
      this.k = (Math.min(this.W, this.H) / 2 - pad) / R;
    }
    this.cx = this.W / 2;
    this.cy = top + (this.H - top) / 2;
    this.draw();
  }

  // On screen: [x, y, depth (more: nearer)].
  project(p) {
    const [x, y, z] = [p[0] - this.mid[0], p[1] - this.mid[1], p[2] - this.mid[2]];
    const [cy, sy, cp, sp] = [Math.cos(this.yaw), Math.sin(this.yaw), Math.cos(this.pitch), Math.sin(this.pitch)];
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    return [this.cx + x1 * this.k, this.cy + (y1 * cp - z * sp) * this.k, y1 * sp + z * cp];
  }

  bindInput() {
    const c = this.canvas;
    const touches = new Map();
    let pinch = null;
    let tap = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId);
      touches.set(e.pointerId, [e.offsetX, e.offsetY]);
      tap = touches.size === 1 ? { x: e.offsetX, y: e.offsetY } : null;
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: this.k, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      }
    });
    c.addEventListener('pointermove', (e) => {
      const was = touches.get(e.pointerId);
      if (!was) return;
      const now = [e.offsetX, e.offsetY];
      touches.set(e.pointerId, now);
      if (tap && Math.hypot(now[0] - tap.x, now[1] - tap.y) > 8) tap = null;
      if (touches.size === 2 && pinch) {
        // Two fingers: zoom, and move it about.
        const [a, b] = [...touches.values()];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.cx += mid[0] - pinch.mid[0];
        this.cy += mid[1] - pinch.mid[1];
        pinch.mid = mid;
        this.zoomAt(mid, (pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.d / this.k);
      } else if (touches.size === 1 && this.flat) {
        this.cx += now[0] - was[0];
        this.cy += now[1] - was[1];
      } else if (touches.size === 1) {
        // One finger, in 3D: turn it round.
        this.yaw -= (now[0] - was[0]) * 0.01;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + (now[1] - was[1]) * 0.01));
      }
      this.draw();
    });
    const up = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      if (tap && e.type === 'pointerup') this.pick(tap.x, tap.y);
      tap = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt([e.offsetX, e.offsetY], Math.exp(-e.deltaY * 0.002));
      this.draw();
    }, { passive: false });
  }

  zoomAt([x, y], f) {
    const k = Math.max(0.2, Math.min(400, this.k * f));
    const g = k / this.k;
    this.cx = x - (x - this.cx) * g;
    this.cy = y - (y - this.cy) * g;
    this.k = k;
  }

  // Tap: the nearest state (if near enough) is picked out.
  pick(x, y) {
    let best = -1;
    let bd = 24;
    (this.P || []).forEach(([sx, sy], n) => {
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    });
    this.picked = best >= 0 ? best : null;
    this.draw();
  }

  draw() {
    const { g, dpr, W, H } = this;
    const { nodes, edges } = this.graph;
    const pts = (this.P = this.map.pts.map((p) => this.project(p)));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0f2531';
    g.fillRect(0, 0, W, H);
    // The lattice the beakers allow (three beakers), reachable or not.
    g.fillStyle = 'rgba(255,255,255,0.13)';
    const dot = Math.max(1, Math.min(2.5, this.k * 0.08));
    for (const p of this.grid) {
      const [x, y] = this.project(p);
      if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
      g.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }
    // Every pour, between every pair of states it joins.
    g.strokeStyle = edges.length > 1500 ? 'rgba(140,200,225,0.16)' : 'rgba(140,200,225,0.32)';
    g.lineWidth = 1;
    g.beginPath();
    for (const e of edges) {
      const [a, b] = [pts[e.a], pts[e.b]];
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
    g.stroke();
    // Which way each goes (when there's room to see).
    if (edges.length <= 3000) {
      g.fillStyle = 'rgba(140,200,225,0.45)';
      for (const e of edges) {
        const [a, b] = [pts[e.a], pts[e.b]];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 46) continue;
        this.arrowhead(a, b, 0.62, 6);
      }
    }
    // Your pours, and the shortest way on.
    this.trail(this.mine.map((n) => pts[n]), '#4cc9f0', 4, []);
    this.trail(this.ahead.map((n) => pts[n]), '#ffd23f', 4, [8, 6]);
    // The states (in 3D, the far ones first, smaller and dimmer).
    const r = Math.max(2.5, Math.min(7, this.k * 0.22));
    const near = (i) => (this.flat ? 1 : 1 + (0.35 * pts[i][2]) / this.R);
    const order = [...nodes.keys()];
    if (!this.flat) order.sort((a, b) => pts[a][2] - pts[b][2]);
    for (const i of order) {
      const n = nodes[i];
      const [x, y] = pts[i];
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
      g.globalAlpha = this.flat ? 1 : Math.max(0.35, Math.min(1, 0.4 + 0.6 * near(i)));
      g.fillStyle = n.goal ? '#ffd23f' : '#9fd3e6';
      g.beginPath();
      g.arc(x, y, (n.goal ? r * 1.3 : r) * near(i), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    this.ring(pts[0], r + 6, '#4cc9f0', 3);
    this.ring(pts[this.here], r + 9, '#ffffff', 2.5);
    // Labels: where they fit (and always the start, here, and the picked).
    const spacing = this.spacing ?? (this.spacing = this.minSpacing());
    const all = this.flat && spacing * this.k > 44;
    g.font = '700 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    nodes.forEach((n, i) => {
      if (!all && i !== 0 && i !== this.here && i !== this.picked) return;
      const [x, y] = pts[i];
      if (x < -30 || y < -20 || x > W + 30 || y > H + 20) return;
      this.tag(x, y - r - 4, label(n.s), n.goal ? '#ffd23f' : i === this.here ? '#fff' : '#cfe8f1');
    });
    if (this.picked !== null && this.picked !== undefined) {
      const n = nodes[this.picked];
      const [x, y] = pts[this.picked];
      this.ring([x, y], r + 5, '#ff8fab', 2.5);
      const on = solve(this.level.caps, n.s, this.level.goal);
      this.tag(x, y + r + 22, `${n.d} pour${n.d === 1 ? '' : 's'} from the start${n.goal ? ' · solved!' : on ? ` · ${on.length} to go` : ''}`, '#ff8fab');
    }
    if (this.flat) this.compass();
  }

  minSpacing() {
    const ds = this.graph.edges.map((e) => {
      const [a, b] = [this.map.pts[e.a], this.map.pts[e.b]];
      return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    });
    return ds.length ? Math.min(...ds) : 1;
  }

  arrowhead(a, b, at, s) {
    const { g } = this;
    const x = a[0] + (b[0] - a[0]) * at;
    const y = a[1] + (b[1] - a[1]) * at;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.beginPath();
    g.moveTo(x + Math.cos(ang) * s, y + Math.sin(ang) * s);
    g.lineTo(x + Math.cos(ang + 2.5) * s, y + Math.sin(ang + 2.5) * s);
    g.lineTo(x + Math.cos(ang - 2.5) * s, y + Math.sin(ang - 2.5) * s);
    g.closePath();
    g.fill();
  }

  trail(pts, color, w, dash) {
    if (pts.length < 2) return;
    const { g } = this;
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = color;
    for (let i = 1; i < pts.length; i++) this.arrowhead(pts[i - 1], pts[i], 0.6, 8);
  }

  ring([x, y], r, color, w) {
    const { g } = this;
    g.strokeStyle = color;
    g.lineWidth = w;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  }

  tag(x, y, text, color) {
    const { g } = this;
    const w = g.measureText(text).width + 8;
    g.fillStyle = 'rgba(15,37,49,0.85)';
    g.fillRect(x - w / 2, y - 14, w, 15);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }

  // Which direction is which pour: a little hexagon of arrows, top left.
  compass() {
    const { g } = this;
    const cx = 54;
    const cy = 52;
    g.fillStyle = 'rgba(15,37,49,0.85)';
    g.beginPath();
    g.arc(cx, cy, 50, 0, Math.PI * 2);
    g.fill();
    g.font = '800 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i === j) continue;
        const dx = U[j][0] - U[i][0];
        const dy = U[j][1] - U[i][1];
        const n = Math.hypot(dx, dy);
        const [ux, uy] = [dx / n, dy / n];
        g.strokeStyle = 'rgba(140,200,225,0.7)';
        g.fillStyle = 'rgba(140,200,225,0.7)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx + ux * 6, cy + uy * 6);
        g.lineTo(cx + ux * 20, cy + uy * 20);
        g.stroke();
        this.arrowhead([cx, cy], [cx + ux * 24, cy + uy * 24], 1, 5);
        g.fillStyle = '#e6f4f9';
        g.fillText(`${NAMES[i]}→${NAMES[j]}`, cx + ux * 37, cy + uy * 37);
      }
    }
  }
}
