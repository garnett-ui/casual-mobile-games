# Changelog

Pocket Arcade follows [semantic versioning](https://semver.org/): the minor
version goes up for new games and features, the patch version for fixes.
The version shows at the bottom of the home screen. Entries describe what
players can see: new games and features, changes to how things play, and
anything taken away (not internal fixes or renames along the way).

## 1.41.0
- Elevator Operator: a smarter computer to beat. A lift no longer carries on
  to a floor the other lift has already emptied -- it turns to its next job.
  Idle lifts wait where the next calls are likely to come from at that time
  of day: the lobby while people are arriving, up among the people when
  they're about to leave (offices at lunch and in the evening, homes in the
  morning).

## 1.40.0
- Elevator Operator: call buttons light green for up and red for down. A
  lift holds 6, shown side by side from its left wall. The floors its riders
  want show a dot for each of them in the colour of their shirt -- no
  numbers. Fixed people standing in the lobby who never got in: they were
  shown coming back from the street before they had left the building.

## 1.39.0
- Elevator Operator: longer days in the bigger buildings -- 5 minutes at Maple
  Street Offices, then 6, 7½ and 10 at The Empire -- and at Parkview and
  Commerce Tower days grow from 10 minutes to 15, with more residents and
  office workers each day up to the hardest levels.

## 1.38.1
- Elevator Operator: a lit floor in a lift's shaft shows a dot for each rider
  going there, instead of little figures.

## 1.38.0
- Elevator Operator: the sun rises, crosses the sky and sets over the day,
  the sky turns from dawn to daylight to dusk, and night falls with the
  stars out. Each level tells you where you are and what day it is: three
  days at each building, from Maple Street Offices to The Empire, then
  Parkview and Commerce Tower. Bigger buildings get longer days (five
  minutes at first, up to about nine), and banners mark the morning rush,
  lunchtime, home time and nightfall.

## 1.37.0
- Elevator Operator: every level is a whole working day, 7 AM to 7:30 PM, in
  about five minutes. The day is made of people, each with their own day:
  arriving in the morning rush, a meeting on another floor, lunch (out, the
  restaurant or the gym, and back), home in the evening (some via the gym) --
  keeping their looks all day, and never starting a trip before finishing the
  last. Levels bring more people and, every three, a taller building: 6
  storeys, then 10, 15 and 20; from level 13, the apartment and office
  towers, where the residents leave for work in the morning and come home at
  night.

## 1.36.0
- Elevator Operator's two-tower levels share one day between them. At dawn
  every resident is at home asleep; in the morning they all leave -- most
  across the street to work in the office tower (walking lobby to lobby,
  driving garage to garage, or flying roof to roof: the apartments have a
  helipad too), the rest into town -- so the apartments empty completely. In
  the evening everyone comes home and the apartments end the day full.
- True occupancy everywhere: people only ever come in or go out through the
  lobby, the garage or the roof, and nobody sets off from a floor with nobody
  on it (they wait until someone gets there). Each floor's count is exact.
- The end-of-level card shows the RMS (root mean square) trip -- square every
  trip, average them, take the square root -- and the score is the
  computer's RMS over yours.

## 1.35.0
- Elevator Operator, from level 17: two towers side by side, two lifts each
  -- an apartment tower, where people sleep at night (full first thing,
  emptying as everyone goes to work, filling again in the evening; it has a
  roof garden), and an office tower, busy by day and empty at night. One
  clock, one score for everyone's trips.

## 1.34.0
- Elevator Operator has an analog clock showing the time of day as the level
  goes by: the morning rush from 7:30, midday from 10, lunch from 12 (some
  eat in the building's restaurant, others go out), the evening from 5.
- At the end of a level: a histogram of everyone's trip times, yours against
  the computer's, with the average and median, and a score based on the sum
  of the squares of the trips -- so one person kept waiting a long time costs
  much more than a few short waits.

## 1.33.1
- Elevator Operator keeps count of who's in the building. It's empty first
  thing in the morning and everyone arrives; in the middle of the day the
  staff are at their desks; in the evening everyone goes home and the
  building ends up empty. Nobody leaves a floor nobody is on, and each floor
  shows how many people are on it just now.

## 1.33.0
- Elevator Operator starts with a 6-storey building (parking, lobby,
  restaurant, offices, health club, roof) and grows every four levels: 10
  storeys, then 15 with two parking levels, then 20 under the Empire State
  crown.
- Life around the building: people walk along the street and in through the
  lobby doors (and back out), drive down the ramp into the garage, park and
  walk to the lifts (or walk to their car and drive off), and once or twice a
  level a helicopter lands on the roof's helipad to drop someone off or pick
  them up -- the lifts go up to the roof.

## 1.32.0
- Elevator Operator: the tower has two levels of parking below the street
  (P2, P1; some people drive in and walk from their cars), the lobby at street
  level, a restaurant on the 2nd floor and a health club on the top floor.
- Each level is a time of the working day -- the morning rush, the middle of
  the day, lunch, going home -- with that time's mix of people coming in,
  going out and going floor to floor, following surveys of real office
  buildings: mornings nearly all arriving; lunch out to the street, the
  restaurant or the gym and back; the middle of the day half floor to floor.
- A lift you haven't sent anywhere now waits with its doors open, so anyone
  who comes along walks straight in; the doors close when you send it.

## 1.31.2
- Elevator Operator: more people go floor to floor during the working day
  (about a third of them, even in the rushes).
- The people in a lift stand from the left, spaced so a full load fills it
  wall to wall (so there's no FULL tag).

## 1.31.1
- Elevator Operator: a lift standing at a floor now opens its doors when
  someone there presses the call button (it used to sit there with its
  doors shut until you sent it), and closing doors open again for someone
  who just arrived.
- The people in a lift are shown as little people (the doors are glass)
  instead of a count.
- People get off one at a time, quickly, and nobody gets on until they're
  all out. Send the lift somewhere else while its doors are open and they
  close at once: anyone who hadn't got off yet stays aboard.

## 1.31.0
- Elevator Operator (the new lift game) has levels: each one is a set number
  of passengers -- 20 to start, arriving about 10 seconds apart at random --
  and it's over when everyone has got where they're going. Later levels bring
  more people, closer together, and change the traffic: the morning rush up
  from the lobby, the evening rush down, lunchtime down and back up. You're
  scored on the average trip against the computer dispatcher with the same
  people.
- The people are little 8-bit figures who walk out of their offices, press
  the lit call button by the lifts and queue (getting impatient if kept
  waiting), then walk in and out of the lifts. Each floor a rider wants
  lights up in the lift's shaft with a figure for each of them.
- The tower is topped like the Empire State Building, and there's lift music
  (a bossa nova; the ♪ button turns it off). On a phone it's played upright.

## 1.30.0
- New game: **Elevator**. You run the two lifts in a 20-storey tower for a
  three-minute day: tap a floor in a lift's shaft to send it there (one next
  stop at a time; tap another and it changes course at once). People get off
  where they wanted and everyone waiting gets on; the floors they want light
  up with a ✓. The morning rush goes up, the evening rush comes down. At the
  end you're scored against a computer dispatcher running the very same day,
  and you can watch it play your day or try the day again.

## 1.29.2
- Lunar Lander: the tilt under the artificial horizon is signed: +3° when
  you're leaning right, −3° leaning left. It's green while you're level
  enough to land and turns red past 10°, where you'd tip over on touchdown.

## 1.29.1
- Lunar Lander: the engine falls silent when you touch down on the base.
  If you landed with the engine still firing, its roar used to carry on
  under "The Eagle has landed".

## 1.29.0
- Lunar Lander: **Show me**. After a crash you can watch the autopilot fly
  the mission as well as it knows how -- it tries a few ways and flies the
  one that scores best -- at double speed (tap the AUTOPILOT badge for 1×,
  2× or 4×). It shows you its score and fuel left, then it's your turn; its
  landing doesn't count as yours.

## 1.28.0
- Lunar Lander: a pause button (or P / Esc). Everything holds still --
  engines off, controls let go -- until you tap to carry on. Switching away
  from the app pauses it too, and it stays paused when you come back, so an
  interruption never crashes your lander.

## 1.27.2
- Lunar Lander: a landing now plays the real thing instead of the trumpet
  fanfare -- Apollo 11's "Houston, Tranquility Base here. The Eagle has
  landed." It plays on while you look at your score, and stops when you fly
  again, go on to the next mission or leave.

## 1.27.1
- Night Driver: the tyre squeal is a steady screech now (it used to
  flutter), its pitch climbing a little as the slide gets harder.
- Night Driver: no more copy of the fork's sign at the top of the screen.
  You read the sign on the road itself, while you have the chance.

## 1.27.0
- Night Driver: the tyres have limits. They grip up to about 1 g, shared
  between cornering and braking.
  - Take a bend too fast, or turn too hard into one, and they squeal; push
    past the grip and the car slides wide with its tail swinging out --
    ease off and it catches, keep your foot in and you're into the posts.
  - Braking builds up to the limit and you hear the brakes chatter. Stand
    on them for more than a second and a half (or brake hard in a bend) and
    they lock: a screech, a jolt, and no steering until you let go. Pump
    them instead.

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
