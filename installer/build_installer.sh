#!/usr/bin/env bash
# Builds dist/GOAL-NATION-2026-<version>-Setup.exe : package the app, brand the exe, then wrap it in an NSIS setup wizard.
# Needs makensis: either on PATH, or the copy electron-builder keeps in its cache.
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./package.json').version")
rm -rf dist
npx electron-builder --win dir --x64
node installer/set_icon.mjs "dist/win-unpacked/GOAL NATION 2026.exe" build/icon.ico "$VER"
MAKENSIS=$(command -v makensis || true)
if [ -z "$MAKENSIS" ]; then
  N=$(ls -d "$HOME"/.cache/electron-builder/nsis/nsis-3* 2>/dev/null | head -1)
  [ -n "$N" ] || { echo "makensis not found: install NSIS"; exit 1; }
  MAKENSIS="$N/linux/makensis"; export NSISDIR="$N"; chmod +x "$MAKENSIS"
fi
cd installer
"$MAKENSIS" -V2 -DAPPVERSION="$VER" -DSRCDIR="$(pwd)/../dist/win-unpacked" -DOUTFILE="$(pwd)/../dist/GOAL-NATION-2026-${VER}-Setup.exe" installer.nsi
ls -la "../dist/GOAL-NATION-2026-${VER}-Setup.exe"
