#!/usr/bin/env bash
# Normalises the uploaded audio (assets/audio_upload) into the small, loudness-matched files the game loads (assets/audio).
set -euo pipefail
cd "$(dirname "$0")/../.."
U=assets/audio_upload; O=assets/audio; mkdir -p $O
enc() { # in out loudness
  ffmpeg -y -loglevel error -i "$1" -af "loudnorm=I=$3:TP=-1.5:LRA=11" -ac 2 -ar 44100 -c:a libmp3lame -q:a 4 "$2"; }
enc "$U"/football-commentator-with-fx-oh-what-a-sweet-strike-*.mp3        $O/goalpro_0.mp3 -16
enc "$U"/football-commentator-with-fx-that-is-nothing-but-incredible-*.mp3 $O/goalpro_1.mp3 -16
enc "$U"/football-commentator-with-fx-what-an-amazing-shot-*.mp3          $O/goalpro_2.mp3 -16
enc "$U"/bombinsound-football-football-soccer-game-music-08-second-*.mp3   $O/jingle_kickoff.mp3 -18
enc "$U"/the-decisive-second-*.mp3                                         $O/sting_decisive.mp3 -16
enc "$U"/live-football-match-stadium-crowd-cheering-*.mp3                  $O/crowd_cheer.mp3 -20
enc "$U"/powerful-stomps-claps-cheering-*.mp3                              $O/chant_stomps.mp3 -20
enc "$U"/soccer-stadium-10-*.mp3                                           $O/stadium_ambience.mp3 -24
# 2nd upload batch (the UEFA Champions League theme in that batch is a copyrighted broadcast anthem and is deliberately NOT used)
enc "$U"/8d82b5_Football_Crowd_Goal_Sound_Effect.mp3                       $O/crowd_goal.mp3 -19
enc "$U"/8d82b5_Crowd_Reaction_to_Near_Miss_Sound_Effect.mp3               $O/crowd_nearmiss.mp3 -20
enc "$U"/8d82b5_Football_Crowd_Near_Miss_From_Freekick_Sound_Effect.mp3    $O/crowd_nearmiss_fk.mp3 -20
enc "$U"/8d82b5_Soccer_Goal_Sound_Effect.mp3                               $O/goal_horn.mp3 -18
ls -la $O
