#!/usr/bin/env bash
# Build the Windows installer: refreshes the unpacked app with electron-builder, then packs it with makensis.
set -euo pipefail
cd "$(dirname "$0")/../.."
VER=$(node -p "require('./package.json').version")
npm run build:js >/dev/null
rm -rf dist/win-unpacked
npx electron-builder --win dir --x64 2>&1 | grep -E "packaging|⨯" || true
test -f "dist/win-unpacked/Pitch Clash.exe"
node tools/installer/set_icon.mjs "dist/win-unpacked/Pitch Clash.exe" build/icon.ico "$VER"
cd tools/installer
makensis -V2 -DAPPVERSION="$VER" -DSRCDIR="$(pwd)/../../dist/win-unpacked" -DOUTFILE="$(pwd)/../../dist/PitchClash-${VER}-Setup.exe" installer.nsi
ls -la "../../dist/PitchClash-${VER}-Setup.exe"
