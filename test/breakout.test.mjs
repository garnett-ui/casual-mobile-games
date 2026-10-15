import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Breakout, makeWall, LAYOUTS, BALL_R, baseSpeed } from '../games/breakout/engine.js';

const fixed = (v) => () => v;

function runUntil(g, pred, seconds = 30) {
  const events = [];
  for (let t = 0; t < seconds && !pred(events); t += 1 / 120) events.push(...g.update(1 / 120));
  return events;
}

test('walls: portrait 8 columns, landscape 14 (like the arcade original)', () => {
  assert.equal(makeWall('portrait', 1).length, 8 * 8);
  assert.equal(makeWall('landscape', 1).length, 14 * 8);
  for (const kind of ['portrait', 'landscape']) {
    const L = LAYOUTS[kind];
    for (const b of makeWall(kind, 7)) {
      assert.ok(b.x >= 0 && b.x + b.w <= L.w + 0.01 && b.y + b.h < L.paddleY - 60, 'bricks fit above the paddle');
    }
  }
});

test('later walls get faster and tougher', () => {
  assert.ok(baseSpeed(5) > baseSpeed(1));
  assert.equal(makeWall('portrait', 1).filter((b) => b.maxHits > 1).length, 0);
  assert.ok(makeWall('portrait', 8).filter((b) => b.maxHits > 1).length > 5);
  assert.ok(makeWall('landscape', 12).some((b) => b.steel));
});

test('ball waits on the paddle until served, then bounces off the side wall', () => {
  const g = new Breakout('portrait');
  g.movePaddle(30);
  g.update(0.1);
  assert.equal(g.ball.x, g.paddle.x);
  g.serve(fixed(0.1)); // leftwards
  assert.ok(g.ball.vx < 0 && g.ball.vy < 0);
  const ev = runUntil(g, (e) => e.includes('wall'));
  assert.ok(ev.includes('wall'));
  assert.ok(g.ball.vx > 0, 'bounced back to the right');
});

test('paddle bounce angle depends on where the ball hits', () => {
  const g = new Breakout('portrait');
  g.served = true;
  const hit = (offset) => {
    g.ball = { x: g.paddle.x + offset, y: g.paddle.y - 20, vx: 0, vy: g.speed };
    runUntil(g, (e) => e.includes('paddle'), 1);
    return g.ball.vx;
  };
  assert.ok(hit(25) > 0, 'right side sends it right');
  assert.ok(hit(-25) < 0, 'left side sends it left');
  assert.ok(Math.abs(hit(0)) > 0, 'never straight up');
});

test('breaking a brick scores its row points and plays its row', () => {
  const g = new Breakout('portrait');
  g.served = true;
  const target = g.bricks.find((b) => b.row === 0);
  g.ball = { x: target.x + target.w / 2, y: target.y + target.h + 20, vx: 0, vy: -g.speed };
  const ev = runUntil(g, (e) => e.some((x) => x.brick !== undefined), 1);
  const hit = ev.find((x) => x.brick !== undefined);
  assert.equal(hit.brick, 0);
  assert.equal(g.score, 1);
  assert.ok(g.ball.vy > 0, 'bounced back down');
  assert.equal(target.hits, 0);
});

test('missing the ball costs a life; the last one ends the game', () => {
  const g = new Breakout('portrait', { lives: 2 });
  g.served = true;
  g.paddle.target = g.paddle.x = 20;
  g.ball = { x: 300, y: g.L.h - 30, vx: 0, vy: 300 };
  let ev = runUntil(g, (e) => e.includes('miss'), 2);
  assert.ok(ev.includes('miss'));
  assert.equal(g.lives, 1);
  assert.equal(g.served, false);
  g.served = true;
  g.ball = { x: 300, y: g.L.h - 30, vx: 0, vy: 300 };
  ev = runUntil(g, (e) => e.includes('gameover'), 2);
  assert.ok(g.over);
});

test('clearing the wall moves to the next one with a bonus ball', () => {
  const g = new Breakout('landscape');
  for (const b of g.bricks.slice(1)) b.hits = 0;
  const last = g.bricks[0];
  g.served = true;
  g.ball = { x: last.x + last.w / 2, y: last.y + last.h + 15, vx: 0, vy: -g.speed };
  const ev = runUntil(g, (e) => e.includes('clear'), 1);
  assert.ok(ev.includes('clear'));
  assert.equal(g.stage, 2);
  assert.equal(g.lives, 4);
  assert.ok(g.bricks.every((b) => b.hits > 0));
});

test('hitting the back wall shrinks the paddle (classic rule)', () => {
  const g = new Breakout('portrait');
  const w = g.paddle.w;
  for (const b of g.bricks) b.hits = 0;
  g.bricks.push({ ...makeWall('portrait', 1)[0], x: 0, y: 500, w: 1, h: 1 }); // keep the wall "uncleared"
  g.served = true;
  g.ball = { x: 180, y: 40, vx: 0, vy: -300 };
  runUntil(g, (e) => e.includes('wall'), 1);
  assert.ok(g.paddle.w < w);
  assert.ok(BALL_R > 0);
});
