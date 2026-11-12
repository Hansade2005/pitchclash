// Last resort: clubs whose Wikipedia squad lives in a {{football squad2 player}} template (no positions).
// Shirt number 1 is tagged GK; everyone else has an unknown position (null) and is placed by the game as a fill-in.
import fs from 'fs';
import { REAL_POS as PREV } from '../src/data/real_positions.js';
const TPL = { 'boavista-fc': 'Template:Boavista F.C. squad', 'gor-mahia-fc': 'Template:Gor Mahia F.C. squad' };
const result = { ...PREV };
for (const [id, t] of Object.entries(TPL)) {
  const j = await (await fetch('https://en.wikipedia.org/w/api.php?format=json&action=query&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=' + encodeURIComponent(t), { headers: { 'User-Agent': 'pitchclash-squad-research/1.0 (personal hobby project)' } })).json();
  const p = Object.values(j.query.pages)[0];
  const x = p.revisions ? p.revisions[0].slots.main['*'] : '';
  const r = [...x.matchAll(/squad2 player\|no=\s*(\d*)\|name=\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g)].map((m) => [m[2].replace(/\s*\(.*\)$/, ''), m[1] === '1' ? 'GK' : null]);
  if (r.length >= 14) result[id] = r;
}
const body = Object.entries(result).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
fs.writeFileSync(new URL('../src/data/real_positions.js', import.meta.url),
  `// Squad rosters with positions (GK/DF/MF/FW) from Wikipedia squad templates, by tools/wiki_positions*.mjs and wiki_squad2.mjs.\n// Teams not listed fall back to src/data/real_squads.js (names only).\nexport const REAL_POS = {\n${body}\n};\n`);
console.log('with positions:', Object.keys(result).length);
