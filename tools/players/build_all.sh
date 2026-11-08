#!/bin/bash
# Build every character and export to assets/players
set -e
B=/home/user/tools/blender-5.2.3-linux-x64/blender
T=/home/user/pitchclash/tools/players
OUT=/home/user/pitchclash/assets/players
WORK=${WORK:-/tmp/claude-0/-home-user/3278d9fe-4609-5371-b265-afdb43d5c30c/scratchpad/build}
mkdir -p $OUT $WORK
for v in ${@:-a b c d keeper}; do
  $B --background --factory-startup --python $T/build_character.py -- $v $WORK/$v.blend 2>&1 | grep -E "HEIGHT|SAVED|SOLE|rror|Trace" || true
  if [ $v = keeper ]; then name=keeper; extra=--keeper; else name=footballer_$v; extra=; fi
  $B --background $WORK/$v.blend --python $T/make_anims.py -- $OUT/$name.glb --save $WORK/${v}_anim.blend $extra 2>&1 | grep -E "CLIP|EXPORTED|rror|Trace" || true
done
