#!/usr/bin/env python3
"""Merge researched squad lists (squads/final_*.json) into src/data/real_squads.js.
Existing teams are kept as-is; new teams are appended. Usage: squads_merge.py <squads_dir>"""
import glob, json, os, re, sys
src = 'src/data/real_squads.js'
text = open(src, encoding='utf8').read()
have = set(re.findall(r'^  "([^"]+)":', text, re.M))
ok = re.compile(r"^[^\W\d_][\w'.\- ÀØ-öø-ÿĀ-ſ]+$", re.U)
added, names = 0, 0
lines = []
for f in sorted(glob.glob(os.path.join(sys.argv[1], 'final_*.json'))):
    for tid, v in json.load(open(f, encoding='utf8')).items():
        if tid in have: continue
        seen, out = set(), []
        for n in v.get('players', []):
            n = ' '.join(str(n).split())
            if len(n) < 3 or len(n) > 40 or not ok.match(n) or n.lower() in seen: continue
            seen.add(n.lower()); out.append(n)
        if not out: continue
        lines.append(f'  {json.dumps(tid)}: {json.dumps(out, ensure_ascii=False)},')
        have.add(tid); added += 1; names += len(out)
if lines:
    text = text.replace('};\n', '\n'.join(lines) + '\n};\n')
    open(src, 'w', encoding='utf8').write(text)
print(f'teams added: {added}, names: {names}, total teams: {len(have)}')
