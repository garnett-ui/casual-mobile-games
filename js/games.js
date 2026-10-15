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
];

export const COMING_SOON = [
  { title: 'More games', blurb: 'New puzzles are on the way.', emoji: '🧩' },
];
