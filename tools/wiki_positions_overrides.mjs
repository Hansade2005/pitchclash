// Second pass for teams missing from real_positions.js: tries Wikipedia search hits and follows
// transcluded squad templates ({{Chelsea F.C. squad}} etc). Usage: node tools/wiki_positions_overrides.mjs
import fs from 'fs';
import { parseRoster, sane } from './wiki_parse.mjs';
import { ALL_TEAMS } from '../src/data/teams.js';
import { REAL_POS as PREV } from '../src/data/real_positions.js';
import { REAL_SQUADS } from '../src/data/real_squads.js';

const UA = 'pitchclash-squad-research/1.0 (personal hobby project)';
const API = 'https://en.wikipedia.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  for (let a = 0; a < 5; a++) {
    const r = await fetch(`${API}?format=json&${params}`, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    await sleep(2000 * (a + 1));
  }
  return null;
}
const raw = async (title) => {
  const j = await api(`action=query&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(title)}`);
  const p = j && j.query && Object.values(j.query.pages)[0];
  return p && p.revisions ? p.revisions[0].slots.main['*'] : '';
};
// parse a page; if it has no inline roster follow squad-like templates
async function rosterOf(title) {
  const txt = await raw(title); await sleep(200);
  let r = parseRoster(txt); if (sane(r)) return r;
  const tpls = [...txt.matchAll(/\{\{\s*([^{}|\n]*(?:squad|roster)[^{}|\n]*?)\s*(?:\|[^{}]*)?\}\}/gi)].map((m) => m[1]).filter((n) => !/on pitch|start|end|player/i.test(n)).slice(0, 4);
  for (const t of tpls) {
    const tt = await raw(/^template:/i.test(t) ? t : `Template:${t}`); await sleep(200);
    r = parseRoster(tt); if (sane(r)) return r;
  }
  return null;
}
const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const GENERIC = new Set(['fc','cf','sc','ac','as','cd','ud','sd','ca','ec','fk','sk','bk','if','afc','club','de','da','do','del','the','real','sporting','atletico','deportivo','athletic','football','futebol','national','team','men','mens','soccer','al','1893','1899','1904']);
function titleOk(t, title) {
  if (/under|u-?\d\d|women|w\.f\.c|femin|ladies|boise|youth|olympic|b team|reserve|season|list of|\bII\b/i.test(title)) return false;
  const ft = fold(title);
  if (t.kind !== 'club') return ft.startsWith(fold(t.name) + ' ');
  const toks = fold(t.name).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !GENERIC.has(w));
  return toks.length ? toks.every((w) => ft.includes(w)) : ft.replace(/\s*\(.*\)$/, '') === fold(t.name);
}
const last = (n) => fold(n).split(/\s+/).pop();
// content check: the candidate roster must share >=30% (and >=3) surname matches with the names we already hold
function overlapOk(t, r) {
  const ex = (REAL_SQUADS[t.id] || []).map(last);
  if (ex.length < 5) return false;
  const nw = new Set(r.map((x) => last(x[0])));
  const hit = ex.filter((x) => nw.has(x)).length;
  return hit >= 3 && hit / ex.length >= 0.3;
}
const result = { ...PREV };
const todo = ALL_TEAMS.filter((t) => !PREV[t.id]);
const OV = JSON.parse(fs.readFileSync(process.env.OVERRIDES, 'utf8'));
for (const t of todo) {
  if (!OV[t.id]) continue;
  for (const title of OV[t.id]) {
    const txt = await raw(title); await sleep(200);
    const r0 = parseRoster(txt);
    const c = (p) => r0.filter((x) => x[1] === p).length;
    const lenient = (x) => x.length >= 14 && x.filter((p) => p[1] === 'GK').length <= 12 && x.filter((p) => p[1] === 'DF').length >= 3 && x.filter((p) => p[1] === 'FW').length >= 1;
    let r = sane(r0) ? r0 : await rosterOf(title);
    if (!r && lenient(r0)) r = r0;
    console.log('DIAG', t.id, title, txt.length, 'players', r0.length, 'GK', c('GK'), 'DF', c('DF'), 'MF', c('MF'), 'FW', c('FW'), r ? 'sane' : 'NOT-sane', r ? (overlapOk(t, r) ? 'overlap-ok' : 'overlap-low') : '');
    if (r && (overlapOk(t, r) || (REAL_SQUADS[t.id] || []).length < 5 || !process.env.STRICT)) { result[t.id] = r; break; }
  }
}
for (const t of []) {
  const q = t.kind === 'club' ? `${t.name} football club` : `${t.name} national football team`;
  const j = await api(`action=query&list=search&srlimit=4&srsearch=${encodeURIComponent(q)}`);
  const titles = [t.kind === 'club' ? t.name : `${t.name} national football team`, ...((j && j.query ? j.query.search : []).map((s) => s.title))];
  for (const title of [...new Set(titles)]) {
    if (/under|u-?\d\d|women|w\.f\.c|femin|ladies|youth|olympic|reserve|season|list of/i.test(title)) continue;
    const r = await rosterOf(title);
    if (r && !overlapOk(t, r)) console.log('REJECT', t.id, title);
    if (r && (overlapOk(t, r) || ((REAL_SQUADS[t.id] || []).length < 5 && titleOk(t, title)))) { result[t.id] = r; console.log('OK', t.id, '<-', title, r.length); break; }
  }
  await sleep(200);
}
const body = Object.entries(result).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
fs.writeFileSync(new URL('../src/data/real_positions.js', import.meta.url),
  `// Squad rosters with positions (GK/DF/MF/FW) from Wikipedia {{Fs player}} templates, by tools/wiki_positions*.mjs.\n// Teams not listed fall back to src/data/real_squads.js (names only).\nexport const REAL_POS = {\n${body}\n};\n`);
console.log('with positions:', Object.keys(result).length, 'of', ALL_TEAMS.length);
