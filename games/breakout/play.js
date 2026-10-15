// Draws a Breakout game and turns touches into paddle moves.
import { Breakout, BALL_R, PADDLE_H } from './engine.js';

const THUMB_ROOM = 50; // CSS px kept clear below the paddle
import { shade } from '../car-jam/draw.js';

export class Play {
  constructor(canvas, layoutName, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.game = new Breakout(layoutName);
    this.paused = false;
    this.particles = [];
    this.flash = 0;
    this.bindInput();
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.033, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.tick(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    this.report();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind();
  }

  report() {
    const g = this.game;
    this.hooks.onState?.({ score: g.score, lives: g.lives, stage: g.stage, served: g.served, over: g.over });
  }

  tick(dt) {
    const g = this.game;
    if (this.autopilot) {
      // Used by the browser tests: chase the ball, aiming around the paddle.
      if (!g.served) g.serve();
      if (!this.aim || Math.random() < 0.01) this.aim = (Math.random() - 0.5) * g.paddle.w * 0.8;
      g.movePaddle(g.ball.x + this.aim);
    }
    const events = g.update(dt);
    let changed = false;
    for (const e of events) {
      if (e === 'wall') this.hooks.sfx?.('wall');
      else if (e === 'paddle') this.hooks.sfx?.('paddle');
      else if (e === 'steel') this.hooks.sfx?.('steel');
      else if (e === 'miss') {
        this.hooks.sfx?.('miss');
        this.hooks.haptic?.(60);
        this.flash = 0.35;
        changed = true;
      } else if (e === 'clear') {
        this.hooks.sfx?.('win');
        this.hooks.onClear?.(g.stage);
        changed = true;
      } else if (e === 'gameover') {
        changed = true;
        setTimeout(() => this.hooks.onGameOver?.({ score: g.score, stage: g.stage }), 600);
      } else if (e.brick !== undefined) {
        this.hooks.sfx?.('brick', e.brick);
        this.burst(e.x, e.y, e.color);
        changed = true;
      }
    }
    if (changed) this.report();
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.flash = Math.max(0, this.flash - dt);
  }

  burst(x, y, color) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 140;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.3, color });
    }
  }

  serve() {
    if (!this.paused && !this.game.served) {
      this.game.serve();
      this.report();
    }
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const c = this.canvas;
    const toCourt = (e) => {
      const r = c.getBoundingClientRect();
      return (e.clientX - r.left - this.ox) / this.scale;
    };
    const down = (e) => {
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      this.hooks.onInteract?.();
      this.game.movePaddle(toCourt(e));
      this.serve();
    };
    const move = (e) => {
      if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) this.game.movePaddle(toCourt(e));
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
    };
  }

  // --------------------------------------------------------------- drawing

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    const L = this.game.L;
    this.scale = Math.min(this.cssW / L.w, this.cssH / L.h);
    this.ox = (this.cssW - L.w * this.scale) / 2;
    this.oy = (this.cssH - L.h * this.scale) / 2;
    // Keep ~1.3 cm (50 CSS px) between the paddle and the bottom of the
    // screen, so a thumb can rest below the paddle without hiding it.
    const below = window.innerHeight - (rect.top + this.oy + L.h * this.scale);
    const room = (THUMB_ROOM - below) / this.scale;
    this.game.setPaddleY(L.h - PADDLE_H - Math.max(0, room));
  }

  draw() {
    const { ctx, dpr, scale } = this;
    const g = this.game;
    const L = g.L;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.translate(this.ox, this.oy);
    ctx.scale(scale, scale);

    // Court
    const bg = ctx.createLinearGradient(0, 0, 0, L.h);
    bg.addColorStop(0, '#0d1033');
    bg.addColorStop(1, '#1a1446');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.strokeStyle = 'rgba(120,140,255,0.07)';
    ctx.lineWidth = 1;
    for (let x = 20; x < L.w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, L.h);
      ctx.stroke();
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(230,57,70,${this.flash})`;
      ctx.fillRect(0, 0, L.w, L.h);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, L.w - 2, L.h + 10);

    // Bricks
    for (const b of g.bricks) {
      if (b.hits <= 0) continue;
      const base = b.steel ? '#aab3c5' : b.hits < b.maxHits ? shade(b.color, -0.25) : b.color;
      ctx.fillStyle = base;
      roundRect(ctx, b.x, b.y, b.w, b.h, 2.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 2.5);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 1, b.y + b.h - 2.5, b.w - 2, 2);
      if (b.steel) {
        ctx.fillStyle = 'rgba(40,50,70,0.6)';
        for (const fx of [0.2, 0.8]) {
          ctx.beginPath();
          ctx.arc(b.x + b.w * fx, b.y + b.h / 2, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (b.maxHits > 1) {
        // Tough bricks show remaining hits as notches; cracks once damaged.
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let k = 0; k < b.hits; k++) ctx.fillRect(b.x + b.w / 2 - (b.hits * 5) / 2 + k * 5, b.y + b.h / 2 - 1.5, 3, 3);
        if (b.hits < b.maxHits) {
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(b.x + b.w * 0.25, b.y + 2);
          ctx.lineTo(b.x + b.w * 0.35, b.y + b.h / 2);
          ctx.lineTo(b.x + b.w * 0.28, b.y + b.h - 2);
          ctx.stroke();
        }
      }
    }

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    // Paddle
    const P = g.paddle;
    const pg = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
    pg.addColorStop(0, '#ff6b81');
    pg.addColorStop(1, '#c9184a');
    ctx.fillStyle = pg;
    roundRect(ctx, P.x - P.w / 2, P.y, P.w, P.h, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    roundRect(ctx, P.x - P.w / 2 + 4, P.y + 2, P.w - 8, 2.5, 1.2);
    ctx.fill();

    // Ball
    const B = g.ball;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(B.x, B.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!g.served && !g.over && !this.paused) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap to launch', L.w / 2, P.y - 40);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
