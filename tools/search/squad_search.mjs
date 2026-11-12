// CLI: node tools/search/squad_search.mjs --team "Arsenal FC" [--nation]
//      node tools/search/squad_search.mjs --batch teams.json --out result.json   (teams: [{id,name,kind}])
import fs from 'fs';
import { squadFor } from './websearch.mjs';
const a = process.argv.slice(2), get = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
if (get('--team')) {
  const r = await squadFor(get('--team'), { kind: a.includes('--nation') ? 'nation' : 'club' });
  console.log(JSON.stringify({ sources: r.sources, count: r.players.length, players: r.players.slice(0, 40) }, null, 1));
} else if (get('--batch')) {
  const teams = JSON.parse(fs.readFileSync(get('--batch'), 'utf8')).flat(), out = get('--out'), res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  for (const t of teams) {
    if (res[t.id]?.players?.length) continue;
    try { const r = await squadFor(t.name, { kind: t.kind }); res[t.id] = { players: r.players.filter((p) => p.pages >= 1).map((p) => p.name).slice(0, 30), note: `${r.sources.filter((s) => s.found >= 8).length} pages`, sources: r.sources.map((s) => s.url) }; }
    catch (e) { res[t.id] = { players: [], note: 'error ' + e.message }; }
    fs.writeFileSync(out, JSON.stringify(res, null, 1)); console.log(t.id, res[t.id].players.length, res[t.id].note);
  }
}
