# Pitch Clash

11 v 11 stadium football for Windows — 1 to 4 players, controllers or keyboard. Built with Electron + three.js.

* 48 competitions (leagues, cups, continental and nations tournaments, qualifiers, youth and friendly tournaments)
* Realistic players (MakeHuman CC0 bodies, CMU motion capture), 10 stadiums, weather, day/night
* Referees, linesmen, VAR, injuries + medical buggy, substitutions, extra time, penalty shootouts
* Anthems, rotating music, recorded commentary, team management and tactics

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

Assists (auto-switch to the nearest defender, tap-to-shoot) can be turned off in Settings.
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
