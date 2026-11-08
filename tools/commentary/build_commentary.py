#!/usr/bin/env python3
"""Render game commentary with Kokoro (hosted endpoint) into small mono MP3s + manifest.json."""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
BASE = "https://tts.voice-generator.com"
OUT = sys.argv[1]; TEAMS = sys.argv[2]; VOICE = sys.argv[3] if len(sys.argv) > 3 else "bm_george"; CO_VOICE = sys.argv[4] if len(sys.argv) > 4 else "bf_emma"
os.makedirs(OUT, exist_ok=True)
lines = json.load(open(os.path.join(os.path.dirname(__file__), "lines.json")))
teams = json.load(open(TEAMS))

def fetch(text, out, speed, voice=None):
    voice = voice or VOICE
    if os.path.exists(out) and os.path.getsize(out) > 500: return True
    q = urllib.parse.urlencode({"text": text, "voice": voice, "lang": voice[0], "format": "wav", "speed": str(speed)})
    last = None
    for i in range(4):
        try:
            with urllib.request.urlopen(f"{BASE}/tts?{q}", timeout=120) as r:
                ct, data = r.headers.get("content-type", ""), r.read()
            if ct.startswith("audio/"):
                tmp = out + ".wav"; open(tmp, "wb").write(data)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "48k", out], check=True)
                os.remove(tmp); return True
            last = data[:200]
        except Exception as e:
            last = e
        time.sleep(2 * (i + 1))
    print("FAILED", text, last, file=sys.stderr); return False

jobs, manifest = [], {"voice": VOICE, "lines": {}, "teams": {}}
for cat, arr in lines.items():
    manifest["lines"][cat] = []
    excited = cat in ("goal", "owngoal", "equaliser", "post", "red", "penalty", "shootout", "winner", "champions", "chance", "shot", "pen_scored", "pen_missed")
    for i, t in enumerate(arr):
        f = f"{cat}_{i}.mp3"; manifest["lines"][cat].append(f); jobs.append((t, os.path.join(OUT, f), 1.12 if excited else 1.0, CO_VOICE if cat.startswith("colour") else VOICE))
for tid, name in teams.items():
    slug = re.sub(r"[^a-z0-9]+", "-", tid.lower()); f = f"team_{slug}.mp3"
    manifest["teams"][tid] = f; jobs.append((name + "!", os.path.join(OUT, f), 1.08, VOICE))
print(len(jobs), "clips")
with ThreadPoolExecutor(4) as ex:
    res = list(ex.map(lambda j: fetch(*j), jobs))
print("ok", sum(res), "failed", len(res) - sum(res))
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
