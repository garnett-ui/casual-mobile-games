# Changelog

Pocket Arcade follows [semantic versioning](https://semver.org/): the minor
version goes up for new games and features, the patch version for fixes.
The version shows at the bottom of the home screen. Entries describe what
players can see: new games and features, changes to how things play, and
anything taken away (not internal fixes or renames along the way).

## 1.26.0
- Lunar Lander: flights are drawn as dots at equal times -- the good route
  in the fly-over, your last try after a crash, and both on the map after a
  landing -- so they bunch up where the craft went slowly and spread out
  where it went fast. The time between dots suits the zoom (it says which,
  e.g. "a dot every 4 s"), and the good route is labelled with its speed
  along the way.

## 1.25.0
- Lunar Lander: the missions are much more varied, and get harder more
  steadily: further each time, with taller and more numerous mountains and
  deeper false valleys between them.
  - Each of the first ten has a shape of its own: a hop, a hill, a base far
    below you, twin peaks, a base up on a mesa behind a cliff, a tall ridge,
    a whole range, a base down in a crater.
  - From mission 11, rock overhead: a base inside a cave you have to fly
    into under the overhang, a mountain far too high to fly over with a
    tunnel through it (which starts to bend up and down), and a base in a
    cavern deep under a mesa, reached down a narrow shaft. Each comes round
    again tighter: lower caves, longer tunnels, narrower shafts, and the base
    further off to the side at the bottom.
  - The fly-over before a mission frames the whole course properly on a
    phone held sideways, and the route map after a landing shows the rock.

## 1.24.0
- Lunar Lander: a proper celebration when you land at the base. A little
  American flag pops up out of the hatch and unfurls (hanging from a
  crossbar, like the Apollo flags) to a trumpet fanfare, and the score card
  shows a map of the whole route you flew, from launch pad to base.

## 1.23.0
- Lunar Lander: the readouts tell you more at a glance.
  - ALT is green while you're climbing and red while you're sinking, and
    flashes when there's ground between you and the base higher than you
    are: you'll need to climb to get over it.
  - H/S is green while you're drifting toward the base and red while
    you're drifting away from it, whichever way the base is.

## 1.22.3
- Lunar Lander: the ALT readout (height above the base) goes negative when
  you're below the base, instead of stopping at zero.

## 1.22.2
- Lunar Lander: the turn indicator is now a curved arrow round the bottom
  of the artificial horizon -- green sweeping up the right side when you're
  turning right, red up the left when turning left, longer the faster you
  turn -- with the rate shown signed, like +12°/s or −8°/s.

## 1.22.1
- Lunar Lander: a turn indicator under the artificial horizon, like an
  aircraft's. A bar grows from the middle, green to the right when you're
  turning right and red to the left when turning left (like a ship's
  lights), with the rate in °/s.

## 1.22.0
- Water Lab: on the first nine levels a gold line shows which beaker the
  amount should end up in (Professor Fizz: "…right up to my gold line").
  After that you work it out yourself, but Hint shows where it's headed as
  well as the next pour. Any beaker with the amount still wins.

## 1.21.6
- Lunar Lander: you can now touch down at up to 3 m/s (was 2.2), the
  Apollo Lunar Module's limit. Harder landings still score lower.

## 1.21.5
- Water Lab: the goal is always on show on the bench ("Goal: 4 ml").
- Water Lab in landscape: Professor Fizz moves to the left, and the
  glasses spread out so their labels never overlap.

## 1.21.4
- Water Lab: Professor Fizz keeps it simple ("I need exactly 4 ml of
  water."), amounts are in millilitres, and the top bar and finish card
  talk about the fewest pours possible instead of "par".

## 1.21.3
- Water Lab: the graduations line up on one straight scale in each glass,
  with bigger, bolder numbers that read over water and glass alike; the
  glass rises a little above its top mark so the rim no longer hides it.
  Under each glass, a single large "3 of 8".

## 1.21.2
- Water Lab: Professor Fizz explains how to play in his own speech bubble,
  instead of a note covering it.
- Water Lab: no more one-move puzzles. Every level takes at least two
  pours and offers a wrong first pour, so there's always a real choice.

## 1.21.1
- Professor Fizz has a new look: wavy salt-and-pepper hair swept back, big
  aviator glasses, a thick dark moustache, and a tie under his lab coat.

## 1.21.0
- Water Lab has a host: **Professor Fizz**, a scientist in a white lab
  coat, who tells you what to measure in a speech bubble, follows
  your pours with his eyes, groans when you try to pour into a full beaker,
  whispers hints, and shouts "Eureka!" when you get it. He's on the home
  screen card too.

## 1.20.0
- New game: **Water Lab**, a water-pouring puzzle. Drag a beaker onto
  another to pour until it's empty or the other is full, and measure the
  amount asked for. Glassware of many shapes, with graduation marks that
  follow each shape's real volume; endless levels, each proven solvable,
  with par, hints, undo and stars. Exact splits ("Make 4 · 4 · empty") from
  level 7.

## 1.19.0
- Lunar Lander: after a crash, **Try again** replays the fly-over of the
  course with the path you just flew drawn in red dots, ending in an ✕
  where you crashed and how ("HULL STRUCK THE SURFACE"), next to a good
  route in yellow. Then the mission starts again.

## 1.18.1
- Lunar Lander assist: rotation now works like a stiff spring. Holding a
  turn button leans the lander against the spring until it settles at
  about 20° (it can't get anywhere near 45°); let go and it springs back
  upright in about a second, without wobbling.

## 1.18.0
- Lunar Lander's stability assist is more helpful: it now leans up to 30°
  (was 9°) for quicker sideways moves, still levels the lander when you let
  go, and makes sideways drift die away once you're level, so you can
  settle over the base and come straight down.

## 1.17.1
- Breakout no longer switches to full screen when a game starts, so
  Chrome's "To exit full screen, drag from the top…" notice no longer pops
  up over the game. Where the phone can't lock the orientation, turning it
  pauses the game, as before.

## 1.17.0
- Jigsaw: **pinch with two fingers to zoom** in on the table (up to 4×)
  and move around it; pinch back out to see it all. Pieces re-render
  sharp at the new size.
- Jigsaw statistics: the clock now counts only the time you're actually
  working on the puzzle. It pauses (⏸) after 30 seconds without a touch,
  and while the app is in the background. Next to the pieces placed, you
  can see how many loose pieces you've joined together.
- When you finish: your time, moves, pieces per minute, and a chart of
  pieces placed over time.

## 1.16.0
- Lunar Lander: each mission opens with a fly-over. The whole course with
  the route to fly drawn on it, a zoom down to the base, then a swoop back
  over the terrain to your lander on its pad. Tap to skip.

## 1.15.0
- **About · What's new** on the home screen: what the app is, and this
  history of every version's changes, newest first.
- Car Jam: sounds you can hear on a phone speaker (car bumps, a leafy
  rustle off the hedge, a punchier engine), and vibration you can feel
  (buzzes were too short for phone motors; this helps every game).
- Car Jam: sending a car at a granny now costs you 2 moves ("+2" in red
  next to your moves, and counted toward your stars), and she lets you
  know about it.
- The home screen says "More mini games are on the way."

## 1.14.0
- Night Driver: drive off the Grand Canyon's edge and you fall in, walls of
  rock rushing past, down to the river.
- New hazard: the mouth of a **boiling volcano**, with a lava lake of
  drifting glowing crust, bubbles, embers and smoke. You fall into that too.
- New: the **drawbridge**, raised. Hit it at 70 mph or more and you fly
  across the river (+1000); slower and you land in the water.
- More realistic fire: particle flames, smoke and embers.
- New signs for both ("MT. DOOM SCENIC RTE", "POMPEII / Very historic",
  "EVEL KNIEVEL BLVD / Floor it!").

## 1.13.0
- Lunar Lander is much easier to start: mission 1 is a 30 m hop over flat
  ground, mission 2 a little further, and hills only start at mission 3,
  growing into mountains from there. Early missions carry plenty of fuel.
- New **stability assist** (on by default, toggle in the top bar): the side
  thrusters hold the tilt within 9° and level the lander smoothly when you
  let go.
- A simpler instrument panel with bigger type: distance to the target,
  altitude, vertical and sideways speed (red when too fast to land), fuel,
  and an artificial horizon that turns red past 10°.
- The view always keeps the lander below the panel, however high it climbs.

## 1.12.1
- Night Driver starts out looking like the 1976 arcade screen: big, tall
  roadside posts coming in from the sides, the steep arcade perspective (each
  post up the road about half as far below the horizon as the last), and
  bends that sweep away up the road. It eases into ordinary perspective
  before the first sign.

## 1.12.0
- Jigsaw: pieces lock together whenever you put one against its neighbour
  (turned the same way), anywhere on the table. The group then drags and
  turns as one, and snaps into the picture as a whole when you bring it to
  its spot.

## 1.11.1
- Updates never switch versions by themselves any more, so nothing
  interrupts a game. A new version downloads in the background (progress on
  the home screen only: "Downloading update v… · n of m files"), then waits
  for you to tap **Update to v…** on the home screen. Restarting the app
  doesn't switch either. (The automatic takeover for apps stuck before
  1.8.3 is gone.)

## 1.11.0
- New game: **Night Driver**. Drive between the roadside lights, as in the
  1976 arcade game: drag the wheel with your left thumb and work GAS and
  BRAKE with your right (multi-touch). LED score, time and mph. Later the
  road forks under green signs with jokes and riddles; the wrong way ends in
  a brick wall, a fire, a missing bridge, the Grand Canyon or a washed-out
  road.

## 1.10.0
- Jigsaw: the puzzle sits on a light-oak table. Loose pieces cast a shadow
  on the table, with a tight contact shadow at their edges, and a lifted
  piece's shadow spreads out beneath it. The light stays at the top left
  while a piece turns, so the highlights and shadows are right at every
  angle of the turn.

## 1.9.1
- Jigsaw: knobs now fit their holes exactly (a neighbour's knob offset was
  mirrored, leaving gaps). Pieces are lit consistently from the top left,
  however they're turned; placed pieces show just a fine cut line.
- Jigsaw: the shuffle button (far right) says what it did.

## 1.9.0
- Jigsaw: pieces start scrambled *and turned*; tap a piece to turn it a
  quarter, and it only fits the right way up. The faint guide picture is
  gone -- hold the eye button to see the picture in a pop-up, for as long
  as you hold it. The finished puzzle shows the photo without seams.
- Lunar Lander: scenery from Apollo 8's Earthrise photo -- the real Earth
  over the far lunar horizon, and the photo's lunar surface underfoot.

## 1.8.5
- Apps stuck on an older version (before 1.8.3, whose Update button could
  fail) are now switched to the new version automatically: the new service
  worker detects pages that can't update themselves, takes over and
  reloads them. Current pages still get the "Update to …" prompt.

## 1.8.4
- The update bar names the version throughout: "Downloading update
  v1.9.0… You have v1.8.4", "Update to v1.9.0", "Updating v1.8.4 →
  v1.9.0…".

## 1.8.3
- Updating is reliable: **Update now** always installs the newest
  downloaded version (before, if a newer version arrived while one was
  waiting, the button did nothing), and reopening the app installs a
  downloaded update automatically.
- The update bar appears on the home screen only, never over a game.
- Clearer wording: "Downloading update…", "Version x.y.z is ready",
  "Update now".

## 1.8.2
- Tap the version number at the bottom of the home screen to check for
  updates right away.

## 1.8.1
- Toast messages no longer block taps on the game underneath them.

## 1.8.0
- New game: Jigsaw. Make a puzzle from a photo you choose or take with the
  camera; photos are saved on the device (never uploaded). About 100 pieces
  by default (24-200), classic tab-and-blank pieces, the picture as large as
  the screen allows with a border all round for loose pieces. Guide image,
  peek, edge-pieces-only and scatter helpers; progress is saved so you can
  continue later. Two built-in pictures to start with.

## 1.7.0
- New game: Lunar Lander. Lift off, fly over the mountains and land gently
  on the base. Realistic momentum and spin (side thrusters change the spin
  rate; small spins are held steady automatically), limited fuel, a
  green-phosphor instrument readout, Earthrise and stars, and a fireball
  with flying wreckage on a crash. Endless missions, each checked to be
  landable, with taller mountains, narrower bases and less spare fuel.
- Breakout: the paddle now always leaves about 1.3 cm of screen below it,
  so your thumb can rest underneath without hiding it.

## 1.6.0
- New game: Breakout. Choose portrait (8 columns) or landscape (14
  columns, like the 1976 original); the screen orientation locks once a
  game starts, and on phones that can't lock, turning the phone pauses the
  game. Classic scoring and speed-ups, endless walls with tough and steel
  bricks, arcade-style sound effects for walls, paddle and bricks.

## 1.5.2
- App manifest lists PNG icons only (the SVG icon is still used as the
  browser favicon), to help Android Chrome create a full app install
  instead of a Chrome-badged shortcut.

## 1.5.1
- The installed app is labelled "Pocket Arcade" (was "Arcade") on the home
  screen and in the app drawer.

## 1.5.0
- While a new version downloads, the update bar shows "Downloading version
  x.y.z…" with a progress bar and file count, then turns into the Update
  prompt when it's ready.

## 1.4.1
- Update checks always ask the server, so a new version is noticed right
  away instead of up to 10 minutes later.

## 1.4.0
- New app icon: a classic arcade cabinet (screen, joystick, buttons, coin
  door), with maskable versions for Android's icon shapes, a full-bleed iOS
  icon and a browser-tab favicon.

## 1.3.0
- Version number on the home screen.
- Installed apps check for updates regularly and prompt to install a new
  version, showing which version it is.

## 1.2.0
- Anonymous play statistics (Google Analytics, no accounts): which games
  are played and how far people get. Events recorded offline are queued
  and sent when you're back online.

## 1.1.0
- New game: **Tap Maze**. A board of arrows; tap one and it flies off in
  its direction if the way is clear. Clear the board without crashing
  three times. Endless levels that grow from small, gentle mazes to big,
  tangled ones, each checked to be solvable.

## 1.0.0
- **Pocket Arcade** is born: an installable app for phones and tablets
  that works offline, with no login and no ads.
- First game: **Car Jam**, a top-down parking puzzle. Swipe cars to slide
  them out of a jammed lot through the gaps in its hedge, while grannies
  cross the road outside. Levels are generated from a seed and get harder
  without end; every one is checked to have a solution, and there are
  hints, undo and par scores.
