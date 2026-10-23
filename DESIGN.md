# Pocket Arcade: design notes

How each game works and why, for keeping development consistent. The
README says what the games are; this says how they're meant to play.

## Principles shared by every game

- **Offline first, no accounts, no ads.** What you play is cached as you
  play it, so it works with no network after that: the app shell on the
  first visit, a game when it's opened, the whole arcade once you're on its
  home screen or have installed it. A link to one game (`#/morse`) is
  shareable and downloads just that game; every level page has a link to
  the arcade. Once you've had the whole arcade, every update downloads all
  of it (new games too) before it offers to install.
  Graphics are mostly drawn on a canvas and most sound is synthesised (Web
  Audio), which keeps the download small -- but recorded audio and images
  are fine where they make a game better (Lunar Lander's "The Eagle has
  landed" clip and its Earthrise scenery), as long as they're cached for
  offline play.
- **Phone first.** Every game plays with one thumb on a phone, upright
  unless the game needs the width (Breakout plays either way); tablets get
  the extra room used well, not just stretched.
- **Levels are the same for everyone.** Level *n* is built from a seed
  (`seedFor(n)`), so it's the same day, maze or puzzle on every device and
  every replay. Generated puzzles are checked solvable, and par is the
  solver's best.
- **Short sessions.** A level takes a few minutes at most; progress (the
  furthest level and the best stars) is saved on the device.
- **Fair scoring.** Stars measure how well you did against something
  concrete -- par moves, the computer's dispatcher, the letters found
  first time -- and the end card says what it was.
- **Learn by playing.** Rules are shown by a short intro card or a hint the
  first time they matter, not a manual.
- **Changelog for players.** `CHANGELOG.md` entries describe what players
  can see -- new games and features, changes to how things play, anything
  taken away -- not internal fixes or renames.

## Car Jam

A top-down parking-lot puzzle. The lot is jammed full of cars and hedged in,
with only a few gates out to the ring road. Swipe a car (or tap it to drive
forwards) and it drives until it hits something; a car can only leave if it
lines up with a gate and its way there is clear, so you have to shuffle cars
out of each other's way to get everyone out. Clear every car to win.

- **Endless levels, generated on the device from a seed.** Level *n* is the
  same lot for everyone, and each level is a little tougher than the last,
  forever: the lot grows from a 3×3 tutorial to a packed 9×11 (the most that
  fits a phone), gates get scarcer (under a third of the edge is open on big
  lots), and every level from 3 on needs at least one car moved aside, rising
  to several. The generator searches harder for tough layouts the further you
  get.
- **Grannies** cross the street at the crosswalks. Cars wait for them (and they
  let you know about it).
- **Cones, trees, barriers and bollards** that never move, and **trucks** that
  take three spaces.
- **Stars** for matching par (the fewest possible moves, computed by the
  solver), plus **Undo**, **Restart** and a **Hint** button that always knows
  the best next move.

## Tap Maze

A board packed with non-crossing lines, each ending in an arrowhead. Tap an
arrow (or swipe it the way it points) and it slithers along its own line and
off the board, but only if nothing lies between its head and the edge. Tap a
blocked arrow and it bumps and bounces back, costing one of your three hearts.
Clear every arrow to win; hearts left are your stars.

- **Endless seeded mazes**: boards grow to 10×14, lines get longer and
  twistier, and the chain of arrows blocking other arrows gets deeper level by
  level. Every maze is checked to be clearable.
- **Hint** shows an arrow that is free to go; **Restart** resets the hearts.

## Breakout

The arcade classic. Pick **portrait** (8 columns) or **landscape** (14 columns,
like the 1976 original) before you play; once a game starts the screen
orientation is locked (Android Chrome: installed app, or fullscreen in a tab).
Where it can't be locked (iOS), turning the phone pauses the game until you
turn it back. Drag anywhere to move the paddle, tap to launch.

- Classic rules: rows score 1/3/5/7 from the bottom, the ball speeds up after
  4 and 12 hits and on reaching the orange and red rows, and the paddle
  shrinks once the ball breaks through to the back wall. Three balls, a bonus
  ball for each wall cleared.
- Endless walls: later walls are faster, vary their pattern, and add tough
  (multi-hit) and steel (unbreakable) bricks. Best score is kept per
  orientation.
- Square-wave sound effects for wall bounces, the paddle, and bricks (pitch
  rises with the row).

## Lunar Lander

Lift off from the launch pad, fly over the mountains and set down gently on
the base before the fuel runs out. Hold **THRUST** for the main engine and the
two rotate buttons for the side thrusters (arrow keys / WASD / space work too).

- Realistic momentum and rotational inertia under lunar gravity (1.62 m/s²):
  the side thrusters change the spin rate, so you counter-fire to stop; spins
  under 4°/s are cancelled by an automatic attitude hold. The main engine gets
  punchier as fuel burns off.
- Green-phosphor instrument panel: altitude, horizontal/vertical velocity and
  acceleration, attitude and spin rate, fuel, distance to base, an attitude
  ball and a velocity box, with LOW FUEL / SINK RATE / DRIFT warnings.
- Scored on touchdown speed, drift, tilt, centring and fuel left. Too hard,
  too fast sideways, too tilted, or a hull strike: fireball and wreckage.
- **ASSIST** (on to start) springs the lander back upright when you let go
  and damps sideways drift. A landing flown with it on at any point is
  marked with a little **A** on the mission grid (and said so on the score
  card) until the mission's been landed with it off: the stars count
  either way, the A says how they were earned.
- Scenery from Apollo 8's *Earthrise* photo: the Earth hangs over the far
  lunar horizon, and the ground you fly over is the photo's surface.
- Endless missions: every one is test-flown by an autopilot when generated,
  so it is always possible; fuel is what it needed plus a margin that shrinks
  from 2× to 1.25×, while mountains rise and the base narrows.

## Night Driver

The 1976 Atari arcade racer: at night, all you see of the road is the white
posts along each side. Your left thumb drags the steering wheel and your right
thumb holds **GAS** and **BRAKE**. Both work at once (multi-touch); on a
keyboard, use the arrows or WASD.

- Seven-segment LED score, time and speed (mph). The clock runs down; every
  3 km adds time, a little less each time.
- Bends tighten the further you go, so the sharpest ones need the brake. Hit a
  post and you stop and lose time.
- After the opening stretch the road starts to fork. A green overhead sign
  says where each branch goes (read it while you can), in jokes and
  riddles: *FREE EGGS → take the EGGS-IT*, *EXIT 404: road not found*, *What
  has a bed but never sleeps?* One branch ends in a hazard, drawn
  realistically: a brick wall, a road on fire, a bridge that's out, the Grand
  Canyon (you fall in), a boiling volcano (you fall in), or a road washed
  away. Brake to a stop in time and you're sent back to the right road.
- The drawbridge is a gamble: both leaves are up, and at 70 mph or more you
  jump the river for +1000. Any slower and you're swimming.
- It starts out looking like the 1976 screen (big posts, steep arcade
  perspective) and eases into ordinary perspective before the first sign.
- No 3D engine: it's a hand-written perspective projection on a 2D canvas,
  with particle flames, smoke and embers, and short animated falls.

## Water Lab

A water-pouring puzzle in a closed system: beakers of different sizes and
shapes on a lab bench, some water, no tap and no drain. Drag a beaker onto
another (or tap one, then the other) to pour: it tips over and pours until
it's empty or the other is full. Measure the amount asked for: Professor
Fizz, the lab's host (salt-and-pepper hair, aviator glasses, moustache),
tells you what he needs and reacts as you go.

- Glassware of different shapes (graduated cylinder, beaker, Erlenmeyer and
  round-bottomed flasks, bottle, conical glass). Each is round in cross
  section, so the water level and the graduation marks follow real volume:
  marks crowd together in a wide bulb and spread out up a narrow neck. The
  number under each beaker says how much is in it.
- Goals: "I need exactly 4 ml of water" (in any beaker) to begin with; from
  level 7, every third level is an exact split (4 ml, 4 ml, empty), with gold
  lines on the beakers that must hold those amounts.
- Endless levels from a seed. Each is explored by breadth-first search over
  its states (water is conserved, so states lie on a plane), which proves it
  solvable and finds the fewest pours possible; harder levels have longer
  shortest solutions, or more beakers. Hint shows the next pour of a
  shortest solution from wherever you are.

## Elevator Operator

You run the lifts for a whole working day -- 7 AM to 7:30 PM, with an
analog clock, the sun rising and crossing the sky and the city going dark at
night -- in an office building: parking below the street, the lobby at
street level, a restaurant on the 2nd floor, offices, a health club on the
top storey and a helipad on the roof. It's a career told a day at a time:
three days at each building, with more people every day. Maple Street
Offices (6 storeys, about five minutes a day; on the first day just one
lift and 6 people, then a second lift and 12), then Riverside House (10
storeys), Harbor Plaza (15, two parking levels) and The Empire (20, crowned
like the Empire State Building), each day a little longer as the buildings
grow: about 5, 6, 7½ and 10 minutes. From level 13 you run Parkview (the
apartments) and Commerce Tower (the offices) across the street from each
other, two lifts each, with more residents and workers every day and days
growing from 10 minutes to 15 at the hardest levels. Whenever the screen
is at rest -- nobody waiting or walking, the lifts empty and parked -- the
game eases up to five times as fast (▶▶ by the clock), and back down before
the next person sets off. Banners mark the day's moments (the doors open, the morning rush, lunchtime, home time,
nightfall). Played upright on a phone (either way on a tablet), to lift
music. On a big screen the building is as tall as it can be and no wider
than it needs to be, with the rest of the city round it -- just scenery,
windows lighting up and going dark through the day, and someone passing
behind a lit window now and then.

- **Tap a floor in a lift's shaft** to send it there. Tap more floors to
  line up to 4 stops (numbered in its shaft); it goes to them in order. A
  fifth tap gets a buzz. A lift you haven't sent anywhere waits with its
  doors open. At each stop it goes on only once everyone for that floor is
  out and everyone waiting there is in -- nobody is ever carried past their
  floor.
- When a lift stops, anyone for that floor walks out (one at a time), then
  everyone waiting who's going its way walks in (nobody gets in with people
  going the other way; an empty lift goes the way the first one in wants),
  up to 6 -- shown side by side, the same size as
  everyone on the floors (the lifts are drawn wide enough). People walk up
  to the lifts, press the button (it lights), and only then walk into a lift
  standing there, into their place in the car (and out the same way). On a
  phone the twin towers are one above the other. Each rider's floor is
  marked in that lift's shaft by a small arrow in the colour of their shirt,
  in the column where they stand. The call buttons light green for up, red
  for down.
- Every level is a different day: the first at each building an ordinary
  one, then each with a twist of its own -- rain (everyone drives, and
  lunches in), a traffic jam (all late at once), free pizza at noon, review
  week (meetings everywhere), a lunchtime fitness class, an all-hands
  meeting on the top floor, Friday (long lunches out, home by four), a trade
  fair (helicopters), launch day (working late), an early start. And each
  day the building is busy in different places: tenants of different sizes
  (some floors busy, some quiet, now and then one nearly empty) and one
  floor where most of the day's meetings are. A level is always the same
  day, with the same people. A bar at the top fills as they
  get where they're going.
- The day is made of people, each with their own day: an office worker
  arrives in the morning rush (around 8:30) -- walking in off the street,
  driving down into the garage, or now and then by helicopter -- may go to a
  meeting on another floor, goes to lunch around 12:30 (out to the street,
  down to the restaurant or up to the gym, back half an hour or so later),
  and leaves around 5:30, some by way of the gym. Each keeps their looks all
  day, and nobody starts a trip before finishing the last. The peaks come
  out like the surveys of modern office buildings (Peters Research): the
  morning rush nearly all arrivals (surveys: about 85%), lunch in and out.
- Two towers: at dawn every resident is asleep in the apartments; around 8
  they all leave -- most across the street to work in the offices (walking
  lobby to lobby, driving garage to garage, or flying roof to roof), the rest
  into town -- and come home in the evening, so the apartments end the day
  full.
- True occupancy: the only ways in or out of a building are its lobby,
  garage and roof; nobody ever sets off from a floor with nobody on it, and
  each floor shows how many people are on it.
- People are little 8-bit figures who walk out of their offices, press the
  call button by the lifts (it lights up: ▲ green, ▼ red) and queue; a "…" bubble
  means they've waited 20 s, a red "!" 40 s.
- At the end: a histogram of everyone's trip times (from pressing the button
  to getting out), yours against the computer's, the average and median, and
  the score: the RMS (root mean square) trip -- square every trip, average,
  take the square root, so a long wait counts for much more than a short
  one -- the computer dispatcher's over yours, with exactly the same people.
  The best possible schedule can't be computed in any reasonable time, so the
  yardstick is the "collective control" used by real lift groups: each lift
  keeps going its way, stopping where its riders want to get off and where
  people are waiting that the other lift isn't already heading for, and
  turns to its next job if the other lift gets there first. Idle lifts wait
  where the next calls will likely come from at that time of day -- the
  lobby while people are arriving, up among them when they're about to
  leave (offices at lunch and in the evening, homes in the morning). It's
  tried a few ways (with and without the staging, or assigning each call to
  whichever lift would get there soonest) and the best taken. You can watch
  it run your day.
- The music is synthesised: a bossa nova in C on electric
  piano, bass, vibraphone and shaker (the ♪ button turns it off).

## Morse Rain

Learn Morse code by ear. A cloud of Scrabble-like letter tiles drifts about
the screen; you hear the code for one of them -- a 600 Hz tone, always keyed
at 20 words a minute, so you learn each character as a sound -- again and
again, every few seconds, until you find it. No hurry.

- **Tap a tile with the letter you heard** and it's gone; then you hear the
  next. Clear the screen to win.
- Tap the wrong letter and a copy of the right one floats in, sounding
  again. If the cloud grows to twice its size, the level's over. Stars for
  how many you found without a wrong tap.
- The lessons: E I A N T to start, then a couple of new characters each
  level by how long their codes are (the rest of the short letters, the
  four-symbol ones), with reviews, then numbers and punctuation (. , ? /);
  after that, reviews of the lot with bigger, livelier clouds. The new ones
  are played half the time; before each lesson, tap one to hear it.
- All by ear: the dots and dashes are never shown (learning them printed
  only gets in the way of hearing them), so it needs the sound on.
- **Two sets of lessons, each with its own levels and stars, chosen by
  tabs on the level page: Listen (above) and Send.**
- **Sending**, Missile Command style: tiles drift down the screen (swaying
  a little). Tap anywhere to key -- a short tap a dit, a long one a dah --
  and you hear only your own sidetone. A pause ends the letter, and the
  cannon at the bottom fires a homing shot at the lowest tile with that
  letter, so the urgent ones come first (any can be hit). Key a letter
  that isn't there and the shot flies off across the screen carrying it
  (and it floats up by the cannon); key something that isn't a character
  at all and out pops a dud, which drops straight to the ground -- splat
  -- with a red ? by the cannon. A tile reaching the ground costs one of
  three lives. Stars by lives left (and not too much keyed at nothing).
- Timing is in units: a dit is one unit on, a dah three; one off between
  the parts of a letter, three between letters.
- Key a letter (of two or more parts) with excellent timing -- every dit
  and every pause inside it within about 15% of one unit, every dah of
  three, at your own speed -- and "Excellent timing!" fires two shots, at
  the two lowest tiles of that letter. The board keys anywhere (the
  header's buttons and the cards don't), with a KEY pad under the cannon
  to aim for.
- The rain comes at a sending speed, in words a minute (five letters a
  word, about five tiles on the screen at any speed): 5 wpm on the first
  level, a little quicker each level after (to 12). There are always at
  least three tiles to aim at while more are to come: clear them and the
  next drop in at once (placed away from the others near the top). It
  speeds up only when you're well ahead: a shot that leaves fewer than
  three (not counting those already shot at), all in the top half, makes
  it 10% faster (easing in, never past 20 wpm). A shot low (the bottom
  quarter) eases it back a little, and a life lost by a quarter (never
  below 5). The speed shows by the lives (with a rising arrow while it's
  climbing), and the top speed on the score card.
- Each level's tile shows your best effective speed there: letters keyed
  right a minute (five to a word), from the first tile in to the last
  letter sent -- so misses and dawdling count against it. The score card
  shows it too, and whether it's a new best.
- The keyer reads you by your own rhythm, not a fixed speed: it learns your
  dit and dah from your last 16 presses (where their lengths jump from
  short to long; or, all of a kind, whichever they're nearer), starting
  from about 15 words a minute, and remembers your speed between levels.
  As it learns, it re-reads the letter so far. It learns your pauses
  inside a letter too (only those short enough to be one -- under two and
  a half units by your presses): tapping on glass they're often longer
  than your dits. A pause twice that ends a letter -- halfway, keyed
  perfectly, between the one unit inside a letter and the three between
  letters -- so letters keyed one straight after another, properly spaced,
  each fire on their own. It starts generous (a letter ends after 0.24 s),
  for a beginner's pauses, and remembers both between levels. (A letter's ended by the next
  press too, if the screen hasn't caught up yet.) The lessons are the same
  as listening's.

## Trial Bike

A side-on trials bike over rough country, in the line of *Trials* and
*Elastomania*: there's nothing on the course but ground shaped against you,
and the whole game is in handling the bike. Your right thumb holds **GAS**
or **BRAKE**, your left drags the rider **back** (nose up) or **forward**
(nose down); both work at once, as in Night Driver. Arrows or WASD on a
keyboard.

- **One rigid body, two tyres.** The bike and rider are a single body with
  two wheels fixed to it; each tyre pushes back where it sinks into the
  ground (a stiff, damped spring, which is also the suspension) and grips
  along it up to a friction limit. The rear wheel drives, both brake, and a
  lean is a torque on the body -- in the air it turns the bike, on the
  ground it shifts weight between the wheels. The front lifts under hard
  throttle by itself, because the drive pushes at the ground, below the
  centre of mass. Nothing is scripted: a wheelie, a loop, an endo and a
  nose-first landing all fall out of the same few forces.
- **Crashes.** The rider's helmet touching the ground is a crash, as is
  falling out of the world, and so is a bad landing: coming down on the
  front wheel pitched more than 20° nose-down into the ground at over 7 m/s
  (about a 2.5 m fall), or on either wheel at over 11 m/s (about 6 m) --
  and a little less nose-down than that, the helmet reaches the ground
  first anyway. So a drop has to be landed on the back wheel or flat, and a
  cliff on both.
  Anything else -- a stall against a ledge, a nose-wheelie -- is yours to
  recover from. The bike tumbles for a moment, then the first touch puts
  you back on the last flag with the clock still running. Stuck with
  nowhere to go, the ↶ button does the same at the price of a crash.
- **Endless courses from a seed**, and every one test-ridden. Course *n* is
  built from its seed (and re-rolled from the same seed, up to a dozen
  times, until the computer rider can finish it): a slow rise and fall of
  the land, with obstacles along it in a random order drawn from the kinds
  that course allows.
  Everything the bike can do is met early -- course 1 is hills and one
  small jump, then a log and a long climb on course 2, a drop-off on 3, a
  ledge up and down and a cliff on 4 and a gap on 5 -- and from there they
  grow in size and number and, more and more often, come one straight after
  another (a drop at the top of a climb, a cliff off the end of a jump).
  Hills and climbs are never steeper than about 35°, there's a run-up
  before every gap, and where a jump, a drop or a cliff comes down there's
  open ground -- or the next part of a combination, a further fall or the
  next kicker, never a log or a ledge. From course 3, each course has a
  **set piece** in its second half, with a flag just before it:
  three kickers in a row, one long wall of a climb, a climb to a crest and
  a cliff straight off it, three ledges up and a cliff down the lot, or
  the big gap -- whichever the course's obstacles allow, picked by the
  seed, so the course has a moment the rest builds to. The computer rider rides each
  course at three paces as it is generated; one it can't finish is
  re-rolled, and its best time, rounded up to the second, is **par**.
- **Stars** against par and your crashes: three for beating par clean, two
  for within 1.5× par with at most one crash, one for getting there. The
  course tile shows your best time.
- **Flips.** Turn the bike right over in the air (lean hard off a jump) and
  land it, and each full turn takes two seconds off your clock -- the only
  way to beat the computer rider's time by much, since it never flips. A
  turn that isn't finished by the ground is just a crash. One landed gets
  the big celebration: a fanfare, the banner swelling (with DOUBLE! or
  TRIPLE! under it for more), a flare going up from behind the finish for
  every turn, and the crowd there forty strong, arms up and jumping, for
  the rest of the ride.
- Every tenth course, someone grazes on a hilltop who doesn't mind the
  bikes, so long as they go over.
- **The computer rider** reads the ground ahead of the rear wheel -- the
  first wall (a rise too sheer to roll over), the first edge (ground falling
  away) and, if that edge is a pit, how wide -- and holds the bike's pitch to
  a target: the slope under it, nose-up for a wheelie sized to the wall,
  nose-up off an edge, and in the air the slope where it will come down. It
  carries the speed a gap needs and eases off everywhere else. **SHOW ME**,
  offered after a crash, runs it on the course, at 1×, 2× or 4×.
- **GHOST** (off to start) rides the computer's par run beside you: a
  faint blue bike and rider, behind yours, at the point the par ride had
  reached at your time on the clock (so it waits on the start line until
  you touch the gas, and a flip doesn't move it -- the bonus shows at the
  finish), with a hollow amber ring for it on the course line in the
  instruments. With it on, the finish card says who won and by how much.
- **Landscape plays best** (the course is wide) but it works upright too,
  with the ground lower to leave room for the jumps. Not locked: the camera
  keeps the bike a third of the way across so you see what's coming.
- Sound is the shared motor loop, pitched to the speed, with a bump on a
  hard landing, the checkpoint chime at each flag, a fanfare and the
  flares' whoosh and crackle for a flip, and one other, from the hilltop.

## Jigsaw

Turn your own photos into jigsaw puzzles. **Choose photo** opens the photo
picker and **Take photo** the camera; the picture is scaled to at most 2048 px
and saved on the device in IndexedDB (nothing is uploaded), so it's there for
future puzzles. Two built-in pictures are included too.

- About 100 pieces by default (24 / 48 / 100 / 150 / 200), with the grid fitted
  to the photo so pieces are near-square, and classic tab-and-blank shapes.
- The picture fills as much of the screen as possible with a border on every
  side; loose pieces start scattered around it and turned every which way.
  Tap a piece to turn it a quarter; drag it near its spot, the right way up,
  and it snaps in. Pieces sit on an oak table, lit from the top left, and
  cast shadows on it.
- The picture stays hidden until the puzzle is done: hold the eye button to
  see it in a pop-up. Also: show edge pieces only, and scatter. The puzzle in
  progress is saved for later.
