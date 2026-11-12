# APEX CLASH

Fast 3D arcade street racing for 1–8 players: cars **and** bikes, career mode for both,
and **MultiClash** tournaments (split-screen on one PC, or rooms over Wi-Fi/LAN).
Built to run smoothly on integrated graphics (Intel UHD 620 class) in Edge or Chrome.

## Run it (Windows 11)

1. Unzip the folder anywhere.
2. Double-click **start.bat**. A black window opens (the game server) and your browser opens the game.
   - First time only: if Node.js is missing, start.bat offers to install it (or get the LTS installer from nodejs.org), then run start.bat again.
3. Press **F11** for fullscreen. Click the page once so the browser allows sound.

Keep the black window open while playing; close it to quit.

## Controls

| Action | Controller | Keyboard | Keyboard P2 |
|---|---|---|---|
| Steer | Left stick / D-pad | A · D | ← · → |
| Accelerate | RT or A | W | ↑ |
| Brake / reverse | LT | S | ↓ |
| Nitro | X or RB | Left Shift | Right Shift |
| Drift | B or LB | Space | Right Ctrl |
| Camera | Y | C | . |
| Back on track | Back/Select | R | Backspace |
| Pause | Start | Esc | Esc |

Menus work fully with a controller (D-pad/stick, A = select, B = back).
**Settings → Driving help: Easy** (default) brakes for corners and steers you off walls.
**Auto-accelerate** makes it steer-only.

## What's new in 3.1

- **Reward chain**: near misses, takedowns (+ free boost), 20 s of clean driving (+ nitro, boost and extra top speed), slipstream and slingshot, perfect starts, long drifts, big air, overtakes and taking the lead. Quick successions build a ×2–×5 chain worth bonus credits. Rewards appear in a feed on the right; a green bar under the nitro meter tracks clean driving.
- **Softer, more realistic engines**: the steady synthetic hum under the engine is gone. Cars and bikes crossfade two real engine recordings by rpm, go muffled when you lift off the throttle, and dip briefly on each gear change. New *Engine volume* setting.

## What's new in 3.0

- **Track structures**: elevated flyovers on pillars with a busy street underneath, river bridges with steel arches, tunnels, and **shortcuts** – a gap in the barrier, a SHORTCUT sign and a construction road with a smashable fence that saves 25–90 m. Boost pads on the straights.
- **New race types**: Versus Duel, Knockdown (wreck rivals), Toxic Tag (spread the toxic aura before your timer runs out), Drift Gates, Catch the Runner, and Escape the Police – alongside Classic, Combat, City Rush, Land & Sea Relay, Elimination, Orb Rush and Time Trial.
- **Action**: ram takedowns with slow motion, near-miss nitro, smashable barrels and fences for Mayhem credits, police patrols that chase reckless drivers (hitting traffic or pedestrians, firing weapons).
- **Atmosphere**: rain with wet-road sheen, snow, speed-blur at high speed and on nitro.
- **Engines**: each class sounds different – recorded engine loops for cars, bikes and boats (bikes revvier and raspier), rotor slap and turbine whine for helicopters, propeller drone for planes, a synth hum for spaceships – and you hear rivals as they pass.
- **Menus**: rebuilt as lit 3D cards with rendered vehicles, drawn icons, stars and medals.

## What's in the game

- **Six racing classes** – cars, bikes, boats (city canals), helicopters and planes (ring gates above the streets) and spaceships (a neon track among asteroids).
- **World Tour** – 8 countries (Cameroon, USA, Brazil, France, UK, UAE, Japan, Italy), 16 circuits, 4 levels per country for every class: 192 levels. Each country has its own flag, landmark, trees, buildings and scenery. Win a race and your driver raises the flag.
- **Race types** – Sprint, Combat Race, Police Chase, City Rush, Land & Sea Relay, Elimination, Orb Rush, Time Trial.
  - *Combat*: weapon crates give a machine gun, homing rockets, mines, a shield or turbo. Firing guns alerts the police.
  - *Police Chase*: cops ram you and set up roadblocks; stop beside one for too long and you are busted.
  - *City Rush*: live traffic and pedestrians crossing; knock one over and the police come after you.
  - *Land & Sea Relay*: part of the lap is water, where your car or bike becomes a speedboat.
- **Stunts and fighting** – ramps for mid-air spins and flips (land straight or wreck), tunnels, and a punch/shove move to knock rivals out.
- **Progress** – credits, garage with upgrades and paint, driver level and rank, lap records.
- **MultiClash** – a points tournament of mixed rounds for 2–8 players.
  - *Split-screen*: 2–4 players on this PC. Join with RT (controller), Left Shift (keyboard 1) or Right Shift (keyboard 2).
  - *Host a room*: friends on the same Wi-Fi open the address shown in the lobby, pick MultiClash → Join a room and enter the 4-digit code.

Helicopters, planes and spaceships fly freely: climb and dive with the **right stick** (or **I / K**, **PgUp / PgDn**) and thread the ring gates for nitro. With Driving help on Easy or Normal the game holds your height for you.

Extra controls: fire weapon **Y / F / "/"**, punch **LB / Q / ","**, camera **D-pad up / C / "."**. In the air: steer to spin, brake or handbrake to flip.

## Performance

Graphics default to **Auto**, which lowers the render resolution if the frame rate drops. For the smoothest play on a laptop: plug in the charger, use fullscreen, and close other heavy tabs. Settings → Graphics → Low helps further.

## Credits

**APEX CLASH** © 2026 **Anye Happiness Ade** — AI Engineer, Cameroon.

- Engine sounds: built from the engine recordings in the owner's asset library (two loops cut from them).
- Car, boat, helicopter, plane and character models: from the owner's `neon-overdrive` asset library (original vehicle models; characters generated with MakeHuman/MPFB2, CC0; animations from Adobe Mixamo, embedded for in-game use).
- Music (CC BY 3.0, via Jamendo): "The Synthwave Electronic" by Sevennotes · "Ghosts" by Lyvo · "DJ Smallest - Chill" by Smallest.
- Engine: three.js (MIT). Networking: ws (MIT).
- Player character "Hans": built in Blender 4.5 LTS from the owner's photo (script: `tools/build_hans_character.py`).
- Bikes and spaceships: modelled procedurally in code for this game (`public/js/bike.js`).
- City, roads, physics, AI, UI, sound effects: written for this game.

## Build from source

```bash
npm install
```

```bash
npm start
```

`npm run app` runs the desktop (Electron) version and `npm run installer` builds the Windows setup (needs Linux or WSL).
