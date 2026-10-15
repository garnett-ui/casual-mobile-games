// Breakout rules and physics, independent of the screen (unit-testable).
//
// Coordinates are "court units": each orientation has its own fixed court
// size, scaled to fit the screen. update() advances the simulation and
// returns events ('wall', 'paddle', { brick: row }, 'steel', 'miss',
// 'clear', 'gameover') for sound and effects.
import { rng } from '../../js/lib/random.js';

export const LAYOUTS = {
  portrait: { w: 360, h: 620, cols: 8, top: 86, brickH: 15, gap: 3, paddleW: 72, paddleY: 572, margin: 6 },
  landscape: { w: 680, h: 380, cols: 14, top: 48, brickH: 12, gap: 3, paddleW: 86, paddleY: 348, margin: 6 },
};

// Classic colours and points, bottom row first: yellow, green, orange, red.
export const ROW_STYLE = [
  { color: '#f9d71c', points: 1 }, { color: '#f9d71c', points: 1 },
  { color: '#2ec27e', points: 3 }, { color: '#2ec27e', points: 3 },
  { color: '#ff8c1a', points: 5 }, { color: '#ff8c1a', points: 5 },
  { color: '#e5383b', points: 7 }, { color: '#e5383b', points: 7 },
  { color: '#c77dff', points: 9 }, { color: '#c77dff', points: 9 },
  { color: '#4cc9f0', points: 11 }, { color: '#4cc9f0', points: 11 },
];

export const BALL_R = 5;
const PADDLE_H = 10;
const MAX_ANGLE = (60 * Math.PI) / 180;
const MIN_ANGLE = (9 * Math.PI) / 180;

// Ball speed for a stage: brisk from the start, faster every wall.
export function baseSpeed(stage) {
  return Math.min(560, 300 + 22 * (stage - 1));
}

// Stage 1 is the classic full wall; later walls vary their pattern, add
// tough bricks (several hits) and, from stage 5, steel bricks that can't be
// broken (they don't need clearing).
export function makeWall(layoutName, stage) {
  const L = LAYOUTS[layoutName];
  const r = rng(stage * 7919 + (layoutName === 'portrait' ? 1 : 2));
  const rows = Math.min(ROW_STYLE.length, 8 + Math.floor((stage - 1) / 2));
  const brickW = (L.w - 2 * L.margin - (L.cols - 1) * L.gap) / L.cols;
  const pattern = stage === 1 ? 'full' : ['full', 'checker', 'pyramid', 'stripes', 'gaps'][Math.floor(r() * 5)];
  const tough = stage < 3 ? 0 : Math.min(0.5, 0.08 * (stage - 2));
  const steel = stage < 5 ? 0 : Math.min(0.12, 0.02 * (stage - 4));
  const bricks = [];
  for (let row = 0; row < rows; row++) {
    // Row 0 is the bottom row; draw from the top down.
    const y = L.top + (rows - 1 - row) * (L.brickH + L.gap);
    for (let c = 0; c < L.cols; c++) {
      const mid = (L.cols - 1) / 2;
      const keep = {
        full: true,
        checker: (row + c) % 2 === 0 || row < 2,
        pyramid: Math.abs(c - mid) <= (rows - row) * (L.cols / (2 * rows)) + 0.5,
        stripes: row % 3 !== 2,
        gaps: c % 4 !== 1,
      }[pattern];
      if (!keep) continue;
      const brick = {
        x: L.margin + c * (brickW + L.gap), y, w: brickW, h: L.brickH,
        row, color: ROW_STYLE[row].color, points: ROW_STYLE[row].points, hits: 1, maxHits: 1, steel: false,
      };
      const roll = r();
      if (roll < steel && row > 1) brick.steel = true;
      else if (roll < steel + tough) brick.hits = brick.maxHits = 2 + (stage > 8 && r() < 0.3 ? 1 : 0);
      bricks.push(brick);
    }
  }
  return bricks;
}

export class Breakout {
  constructor(layoutName, { lives = 3, stage = 1 } = {}) {
    this.layoutName = layoutName;
    this.L = LAYOUTS[layoutName];
    this.score = 0;
    this.lives = lives;
    this.over = false;
    this.startStage(stage);
  }

  startStage(stage) {
    this.stage = stage;
    this.bricks = makeWall(this.layoutName, stage);
    this.paddle = { x: this.L.w / 2, w: this.L.paddleW, y: this.L.paddleY, h: PADDLE_H, target: this.L.w / 2 };
    this.shrunk = false;
    this.resetBall();
  }

  resetBall() {
    this.served = false;
    this.hits = 0;
    this.boosts = new Set();
    this.speed = baseSpeed(this.stage);
    this.ball = { x: this.paddle.x, y: this.paddle.y - BALL_R - 1, vx: 0, vy: 0 };
  }

  // Launch from the paddle at a slight random angle.
  serve(random = Math.random) {
    if (this.served || this.over) return;
    const a = (random() < 0.5 ? -1 : 1) * (0.25 + random() * 0.35);
    this.ball.vx = Math.sin(a) * this.speed;
    this.ball.vy = -Math.cos(a) * this.speed;
    this.served = true;
  }

  movePaddle(x) {
    this.paddle.target = x;
  }

  // Speed-ups from the original: after 4 and 12 hits, and on first reaching
  // the orange and red rows.
  boost(key, factor = 1.1) {
    if (this.boosts.has(key)) return;
    this.boosts.add(key);
    this.speed = Math.min(baseSpeed(this.stage) * 1.6, this.speed * factor);
    const v = Math.hypot(this.ball.vx, this.ball.vy) || 1;
    this.ball.vx *= this.speed / v;
    this.ball.vy *= this.speed / v;
  }

  update(dt) {
    const events = [];
    if (this.over) return events;
    const { L, paddle, ball } = this;
    const half = paddle.w / 2;
    paddle.x = Math.max(half, Math.min(L.w - half, paddle.target));
    if (!this.served) {
      ball.x = paddle.x;
      ball.y = paddle.y - BALL_R - 1;
      return events;
    }
    // Small steps so the ball can never skip through a brick or the paddle.
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / (BALL_R * 0.5)));
    for (let s = 0; s < steps && this.served && !this.over; s++) this.step(dt / steps, events);
    return events;
  }

  step(dt, events) {
    const { L, paddle, ball } = this;
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Walls and ceiling
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
      events.push('wall');
    } else if (ball.x > L.w - BALL_R) {
      ball.x = L.w - BALL_R;
      ball.vx = -Math.abs(ball.vx);
      events.push('wall');
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
      events.push('wall');
      // Breaking through to the back wall halves the paddle (classic rule).
      if (!this.shrunk) {
        this.shrunk = true;
        paddle.w = L.paddleW * 0.6;
      }
    }

    // Paddle: the further from centre it hits, the steeper the bounce.
    if (ball.vy > 0 && py + BALL_R <= paddle.y + 1 && ball.y + BALL_R >= paddle.y &&
        ball.x >= paddle.x - paddle.w / 2 - BALL_R && ball.x <= paddle.x + paddle.w / 2 + BALL_R) {
      const rel = Math.max(-1, Math.min(1, (ball.x - paddle.x) / (paddle.w / 2)));
      let a = rel * MAX_ANGLE;
      // Never straight up: a dead-centre hit would bounce in one column forever.
      if (Math.abs(a) < MIN_ANGLE) a = (a < 0 || (a === 0 && ball.vx < 0) ? -1 : 1) * MIN_ANGLE;
      ball.vx = Math.sin(a) * this.speed;
      ball.vy = -Math.cos(a) * this.speed;
      ball.y = paddle.y - BALL_R;
      events.push('paddle');
    }

    // Bricks: bounce off the first one touched this step.
    for (const b of this.bricks) {
      if (b.hits <= 0) continue;
      const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
      if ((ball.x - cx) ** 2 + (ball.y - cy) ** 2 > BALL_R * BALL_R) continue;
      // Came in from the side if it was beside the brick a moment ago.
      const fromSide = px + BALL_R <= b.x || px - BALL_R >= b.x + b.w;
      if (fromSide) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;
      ball.x = px;
      ball.y = py;
      if (b.steel) {
        events.push('steel');
      } else {
        b.hits--;
        if (b.hits === 0) {
          this.score += b.points;
          events.push({ brick: b.row, x: b.x + b.w / 2, y: b.y + b.h / 2, color: b.color });
        } else {
          events.push('steel');
        }
        this.hits++;
        if (this.hits === 4) this.boost('hits4');
        if (this.hits === 12) this.boost('hits12');
        if (b.row >= 4) this.boost('orange', 1.12);
        if (b.row >= 6) this.boost('red', 1.12);
      }
      break;
    }

    // Missed
    if (ball.y - BALL_R > L.h) {
      this.lives--;
      events.push('miss');
      if (this.lives <= 0) {
        this.over = true;
        events.push('gameover');
      } else {
        this.resetBall();
      }
      return;
    }

    // Wall cleared: on to a faster one, with a bonus ball.
    if (!this.bricks.some((b) => b.hits > 0 && !b.steel)) {
      this.lives = Math.min(5, this.lives + 1);
      events.push('clear');
      this.startStage(this.stage + 1);
    }
  }
}
