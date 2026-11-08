# Pitch Clash

11 v 11 stadium football for Windows — 1 to 4 players, controllers or keyboard. Built with Electron + three.js.

* **Master League**: manage a club for seasons — squad ageing, youth, transfers, finances, board, promotion/relegation
* **Virtual Sportsbook** (play coins only, no real money): up to 4 friends bet on CPU matches with live results; winnings can fund the Master League club
* 48 competitions (leagues, cups, continental and nations tournaments, qualifiers, youth and friendly tournaments)
* Realistic players (MakeHuman CC0 bodies, CMU motion capture), 10 stadiums, weather, day/night
* Referees, linesmen, VAR, injuries + medical buggy, substitutions, extra time, penalty shootouts
* Broadcast-style cameras and graphics, commentary booth with two commentators, humanoid crowd, 10 stadiums
* Anthems, rotating music, recorded commentary, team management and tactics
* 16 distinct player faces (MakeHuman CC0 + CMU motion capture)

All clubs and competitions are fictional. National teams use country names and flag colours only.

## Keyboard (easy mode)
One keyboard player can use **WASD and the arrow keys at the same time**. **Enter** confirms menus and skips ceremonies / replays.

| Action | Keys |
|---|---|
| Move | WASD or arrows |
| Pass (hold = chase when defending) | J or Z |
| Shoot (hold for power) / slide tackle | K or X |
| Through ball / standing tackle | L or C |
| Lob / cross | I or B |
| Sprint | Shift or Space |
| Switch player | Q or N |
| Pause | Esc · F1 shows/hides the on-screen key help |

Also: you **sprint automatically** while moving, **E / G** = feint, a ring shows who your next pass goes to, **Enter** skips ceremonies/replays, **Esc / P** pauses.

**Mouse / touchpad aiming** (keyboard players): move the pointer and a dotted line shows the exact path of the ball. Click = pass to the aimed spot, hold click + release = shoot (longer = harder), right-click = lob / cross / free-kick.

Assists (auto-switch to the nearest defender, auto-sprint, tap-to-shoot, easier first touch) can be turned off in Settings.
Two players on one keyboard: P1 = WASD + J/K/L/I, P2 = arrows + Z/X/C/B. Xbox / PlayStation pads work out of the box.

## Develop
```bash
npm install
npm start            # builds the bundle and launches Electron
npm test             # competition engine tests (48 competitions)
```

## Build the Windows installer (from Linux, no Wine)
Needs `makensis` (`apt install nsis`):
```bash
./tools/installer/build_installer.sh      # → dist/PitchClash-<version>-Setup.exe
```
The icon is patched into the exe with `resedit`, so Wine is not required.

## Assets & licences
See `assets/players/LICENSES.md`. Commentary clips are generated with Kokoro-82M (`tools/commentary`). Music and anthems are original and synthesised in code (`src/music.js`, `src/audio.js`).

## Audio credits
Royalty-free recordings (stadium ambience, crowd, commentary calls, jingles) by BombinSound, JonathanSlatterMusic, Arunangshu Banerjee, DJArtMusic, FreeSound Community and ZoeDit. `assets/audio_upload/` holds the originals; `tools/audio/process_uploads.sh` builds the game-ready files. The Champions League theme in that folder is a copyrighted broadcast anthem and is intentionally **not** used.

Goal audio (uploaded by the project owner): Voicy "Goaaaaal" and "An incredible goal" commentary calls, Voicy "Football Goal Stadium Sound Effect", TunePocket "Football Soccer Goal Crowd Cheer" — see assets/audio_upload.
