// Collect player positions for teams that already have real names.
//   node tools/squad_positions.mjs <slice> <slices> <out.json>
// Re-runs the squad crawl (cached pages are free) and keeps { teamId: [["Display Name", "POS" | null], ...] } in page order.
import fs from 'fs';
import { CLUBS, NATIONS } from '../src/data/teams.js';
import { REAL_SQUADS } from '../src/data/real_squads.js';
import { squadFor } from './search/websearch.mjs';

const [slice = 0, slices = 1, outFile] = process.argv.slice(2);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const teams = [...CLUBS.map((c) => ({ id: c.id, name: c.name, kind: 'club' })), ...NATIONS.map((n) => ({ id: n.id, name: n.name, kind: 'nation' }))]
  .filter((t) => REAL_SQUADS[t.id]).filter((_, i) => i % +slices === +slice);
const res = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
for (const t of teams) {
  if (res[t.id]) continue;
  try {
    const r = await squadFor(t.name, { kind: t.kind });
    res[t.id] = r.players.map((p) => [p.name, p.pos || null]);
    console.log(t.id, res[t.id].filter((x) => x[1]).length, 'positions of', r.players.length);
  } catch (e) { res[t.id] = {}; console.log(t.id, 'error', e.message); }
  fs.writeFileSync(outFile, JSON.stringify(res));
}
