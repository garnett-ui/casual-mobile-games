// Card illustration for the arcade hub: Earthrise over a lunar landing.
import { Play } from './play.js';
import { makeTerrain } from './engine.js';

export function paint(canvas) {
  const rect = canvas.getBoundingClientRect();
  // Reuse the game's own renderer on a tiny, frozen scene.
  const level = { ...makeTerrain(3), fuel: 100 };
  const play = Object.create(Play.prototype);
  play.canvas = canvas;
  play.ctx = canvas.getContext('2d');
  play.level = level;
  play.hooks = {};
  play.makeScenery();
  play.L = { x: level.base.x0 - 30, y: level.base.y + 34, vx: 6, vy: -1.5, ax: 0, ay: 0, angle: -0.35, omega: 0, fuel: 60, fuelMax: 100, t: 75, thrusting: true, rcs: 0 };
  play.particles = [];
  play.debris = [];
  play.puffs = [];
  play.flash = 0;
  play.shake = 0;
  play.cam = null;
  play.resize();
  play.drawPanel = () => {};
  play.draw();
  return rect;
}
