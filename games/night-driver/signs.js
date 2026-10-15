// Green highway signs over each fork: one panel per branch. One way leads to
// a hazard; the sign says which, more or less plainly. `safe` is the panel
// to follow ('L' or 'R' as written here -- the game mirrors some at random).
// Hazards: wall, fire, bridge, cliff, washout.
export const RIDDLES = [
  // Plain warnings first, while you get the hang of it.
  { easy: true, left: ['BRIDGE OUT', 'Bring a boat'], right: ['DRY LAND', 'Boring but dry'], safe: 'R', hazard: 'bridge' },
  { easy: true, left: ['GRAND CANYON', 'Scenic drop 1 mi'], right: ['TUCSON', 'Less scenic, more alive'], safe: 'R', hazard: 'cliff' },
  { easy: true, left: ['MAIN ST', 'Open all night'], right: ['WALL ST', 'Dead end. Literally.'], safe: 'L', hazard: 'wall' },
  { easy: true, left: ['CHILL RD', 'Exactly as chill'], right: ['HOT TAMALE TRAIL', 'Now 100% on fire'], safe: 'L', hazard: 'fire' },
  // Puns and riddles.
  { left: ['FREE EGGS', 'Take the EGGS-IT'], right: ['HIGHWAY 1', 'Washed out. Poached.'], safe: 'L', hazard: 'washout' },
  { left: ['EXIT 404', 'Road not found'], right: ['EXIT 200', 'OK'], safe: 'R', hazard: 'bridge' },
  { left: ['THE ROAD LESS TRAVELED', 'For a reason'], right: ['THE ROAD MORE TRAVELED', 'Also for a reason'], safe: 'R', hazard: 'cliff' },
  { left: ['KNOCK KNOCK', "Who's there? A wall."], right: ['NOBODY HOME', 'Come on through'], safe: 'R', hazard: 'wall' },
  { left: ['FLAT EARTH SOCIETY', 'The edge: 2 mi'], right: ['ROUND EARTH', 'Keeps going'], safe: 'R', hazard: 'cliff' },
  { left: ["SMOKEY'S BBQ", 'We lit the road!'], right: ['SALAD BAR', 'Nothing on fire'], safe: 'R', hazard: 'fire' },
  { left: ['LAST EXIT', 'Before the canyon'], right: ['CANYON VIEW', 'No guardrail'], safe: 'L', hazard: 'cliff' },
  { left: ['SPEED BUMP AHEAD', "(It's a brick wall)"], right: ['NO BUMPS', 'Just road'], safe: 'R', hazard: 'wall' },
  { left: ['TROLL BRIDGE', 'The troll ate it'], right: ['TOLL ROAD', 'Free tonight'], safe: 'R', hazard: 'bridge' },
  { left: ['LAKE SHORE DR', 'Lake now on road'], right: ['HIGH GROUND', 'Feet stay dry'], safe: 'R', hazard: 'washout' },
  { left: ['WHAT HAS A BED', 'but never sleeps?'], right: ['MOTEL 6', 'Beds that sleep'], safe: 'R', hazard: 'washout' },
  { left: ['WHAT HAS BRICKS', 'but no house?'], right: ['HOME SWEET HOME', 'This way'], safe: 'R', hazard: 'wall' },
  { left: ["WHERE THERE'S SMOKE", '...'], right: ['...THERE IS', 'ANOTHER WAY'], safe: 'R', hazard: 'fire' },
  { left: ["GRANDMA'S HOUSE", 'Over the river...'], right: ['...AND THROUGH', 'THE WOODS'], safe: 'R', hazard: 'bridge' },
  { left: ['MARSHMALLOW RD', 'Bring a stick'], right: ['GRAHAM CRACKER LN', 'No campfire'], safe: 'R', hazard: 'fire' },
  { left: ['WHY DID THE CAR', 'cross the road?'], right: ['TO GET TO', 'THE OTHER SIDE'], safe: 'R', hazard: 'washout' },
  { left: ['GEOLOGY TOUR', 'Very deep'], right: ['GIFT SHOP', 'Very shallow'], safe: 'R', hazard: 'cliff' },
  { left: ['DEAD END', 'No really'], right: ['THRU TRAFFIC', 'You, presumably'], safe: 'R', hazard: 'wall' },
  { left: ['RIVER CROSSING', 'Bridge pending'], right: ['DETOUR', 'Bridge included'], safe: 'R', hazard: 'bridge' },
  { left: ['HOTFOOT HWY', 'Tires sold separately'], right: ['COOL ST', 'Tires stay round'], safe: 'R', hazard: 'fire' },
  { left: ['THELMA & LOUISE', 'Scenic Overlook'], right: ['DRIVE-IN MOVIE', 'Happy ending'], safe: 'R', hazard: 'cliff' },
  { left: ['PINK FLOYD AVE', 'Another brick...'], right: ['BEATLES BLVD', 'Let it be'], safe: 'R', hazard: 'wall' },
];

// What happened, when you find a hazard the hard way.
export const CRASH_LINES = {
  posts: ['You hit a post.', 'Stay between the lights!'],
  wall: ['Brick wall: 1. You: 0.', 'It was a dead end. Literally.'],
  fire: ['Well, that was a hot take.', 'The road really was on fire.'],
  bridge: ['The bridge was out.', 'Your car is not a boat.'],
  cliff: ['You found the Grand Canyon.', 'The hard way.'],
  washout: ['The road washed out.', 'So did you.'],
};
