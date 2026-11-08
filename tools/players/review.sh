#!/bin/bash
# review.sh <char.blend> <tag> [Clip,Clip] [view] [extra make_anims args]
SP=/tmp/claude-0/-home-user/3278d9fe-4609-5371-b265-afdb43d5c30c/scratchpad; B=/home/user/tools/blender-5.2.3-linux-x64/blender
BL=$1; T=$2; ONLY=${3:-}; VIEW=${4:-side}; shift 4; EXTRA="$@"
cd /home/user/pitchclash/tools/players
if [ -n "$ONLY" ]; then O="--only $ONLY"; else O=""; fi
$B --background $BL --python make_anims.py -- - --save $SP/${T}_anim.blend $O $EXTRA 2>&1 | grep -E "CLIP|rror|Trace|line [0-9]"
mkdir -p $SP/strips
$B --background $SP/${T}_anim.blend --python render_clips.py -- $SP/strips/$T 6 $VIEW $ONLY 2>&1 | grep STRIP > $SP/strips/list_$T.txt
cd $SP; S=""
while read _ name files; do python3 sheet.py strips/sheet_${T}_$name.png $files; S="$S strips/sheet_${T}_$name.png"; done < strips/list_$T.txt
python3 vstack.py strips/review_$T.png $S
echo $SP/strips/review_$T.png
