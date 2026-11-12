#!/usr/bin/env python3
"""Merge collected positions (pos_*.json) into src/data/real_positions.js.
Format: { teamId: [["Display Name", "GK|CB|LB|RB|CDM|CM|CAM|LM|RM|LW|RW|ST" | null], ...] } in page order.
Only teams with at least 12 players, 8 of them with a position, are written."""
import glob, json, os, re, sys
src = 'src/data/real_squads.js'
have = set(re.findall(r'^  "([^"]+)":', open(src, encoding='utf8').read(), re.M))
out = {}
for f in sorted(glob.glob(os.path.join(sys.argv[1], 'pos_*.json'))):
    for tid, m in json.load(open(f, encoding='utf8')).items():
        if not isinstance(m, list): continue
        junk = re.compile(r"\b(signed|from|loan|loaned|free agent|until|since|contract|transfer|released|retired|joined|on loan|academy|reserves?)\b", re.I)
        m = [x for x in m if not junk.search(x[0])][:40]
        if tid in have and len(m) >= 12 and sum(1 for x in m if x[1]) >= 8: out[tid] = m
lines = ['// Player positions per team, collected from squad pages by tools/squad_positions.mjs.',
         '// Each team is a list of [name, position] in page order; used as the roster and to place players in matching squad slots.',
         'export const REAL_POS = {']
for tid, m in out.items():
    lines.append(f'  {json.dumps(tid)}: {json.dumps(m, ensure_ascii=False)},')
lines.append('};')
open('src/data/real_positions.js', 'w', encoding='utf8').write('\n'.join(lines) + '\n')
print('teams with positions:', len(out), '| players:', sum(len(m) for m in out.values()))
