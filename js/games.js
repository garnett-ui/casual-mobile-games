// Registry of games in the arcade. To add a game, create games/<id>/index.js
// exporting mount(el, ctx, route) and add an entry here. The service worker
// precaches everything under games/ automatically (npm run build).
export const GAMES = [
  {
    id: 'car-jam',
    title: 'Car Jam',
    blurb: 'Swipe cars out of a jammed parking lot. Mind the grannies!',
    color: '#ff9f1c',
    load: () => import('../games/car-jam/index.js'),
    art: () => import('../games/car-jam/art.js'),
  },
  {
    id: 'tap-maze',
    title: 'Tap Maze',
    blurb: 'Tap arrows to send them flying off the board. Only the ones with a clear path can go!',
    color: '#7b5cff',
    load: () => import('../games/tap-maze/index.js'),
    art: () => import('../games/tap-maze/art.js'),
  },
  {
    id: 'breakout',
    title: 'Breakout',
    blurb: 'The arcade classic. Smash the wall, one bounce at a time — in portrait or landscape.',
    color: '#e5383b',
    load: () => import('../games/breakout/index.js'),
    art: () => import('../games/breakout/art.js'),
  },
];

export const COMING_SOON = [
  { title: 'More games', blurb: 'New puzzles are on the way.', emoji: '🧩' },
];
