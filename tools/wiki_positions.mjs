// Collects squad rosters with positions from Wikipedia's {{Fs player}} templates (structured, reliable GK/DF/MF/FW).
// Usage: node tools/wiki_positions.mjs   -> writes src/data/real_positions.js
import fs from 'fs';
import { parseRoster, sane } from './wiki_parse.mjs';
import { ALL_TEAMS } from '../src/data/teams.js';
import { REAL_POS as PREV } from '../src/data/real_positions.js';

const UA = 'pitchclash-squad-research/1.0 (personal hobby project)';
const API = 'https://en.wikipedia.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cands = (t) => {
  const n = t.name;
  if (t.kind === 'club') return [n, `${n} (football club)`, `${n} F.C.`, `${n} FC`];
  return [`${n} national football team`, `${n} national soccer team`];
};
async function fetchBatch(titles) {
  const u = `${API}?action=query&format=json&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(titles.join('|'))}`;
  for (let a = 0; a < 5; a++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    await sleep(2000 * (a + 1));
  }
  return null;
}
const result = { ...PREV }, miss = [];
const teams = process.env.REFRESH ? ALL_TEAMS.slice() : ALL_TEAMS.filter((t) => !PREV[t.id]); // re-runs only fill in teams still missing
for (const t of teams) {
  let got = null;
  const cs = cands(t);
  const j = await fetchBatch(cs);
  if (j && j.query) {
    const norm = {}; for (const k of ['normalized', 'redirects']) for (const x of j.query[k] || []) norm[x.from] = x.to;
    const res = (x) => { let y = x, i = 0; while (norm[y] && i++ < 5) y = norm[y]; return y; };
    const pages = Object.values(j.query.pages || {});
    for (const c of cs) {
      const p = pages.find((q) => q.title === res(c));
      const txt = p && p.revisions && p.revisions[0].slots.main['*'];
      if (!txt) continue;
      const r = parseRoster(txt);
      if (sane(r)) { got = r; break; }
    }
  }
  if (got) result[t.id] = got; else miss.push(t.id);
  await sleep(250);
}
const body = Object.entries(result).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
fs.writeFileSync(new URL('../src/data/real_positions.js', import.meta.url),
  `// Squad rosters with positions (GK/DF/MF/FW) from Wikipedia {{Fs player}} templates, by tools/wiki_positions.mjs.\n// Teams not listed fall back to src/data/real_squads.js (names only).\nexport const REAL_POS = {\n${body}\n};\n`);
fs.writeFileSync('/tmp/wiki_missing.json', JSON.stringify(miss));
console.log('with positions:', Object.keys(result).length, 'missing:', miss.length);
