// Headless goalkeeper benchmark: fires shots at the keeper from random spots and reports goals / catches / parries.
// Usage: node tools/keeper_bench.mjs [shots=600] [difficulty=pro]
import { Match } from '../src/engine/sim.js';
import { getTeam, makeSquad, formations } from '../src/data/teams.js';

const N = +process.argv[2] || 600, diff = process.argv[3] || 'pro';
const A = getTeam('real-madrid-cf'), B = getTeam('fc-barcelona');
const rows = { goal: 0, held: 0, parried: 0, out: 0, other: 0 }, byKind = {};
let ev = null;
for (let n = 0; n < N; n++) {
  ev = { goal: 0, held: 0, parried: 0 };
  const m = new Match({ teams: [A, B], squads: [makeSquad(A, 1), makeSquad(B, 2)], formations: [formations['4-4-2'], formations['4-4-2']], humans: [], halfLength: 150, difficulty: diff,
    events: (t, d) => { if (t === 'goal') ev.goal++; if (t === 'save') (d.caught ? ev.held++ : ev.parried++); } });
  m.phase = 'play'; m.phaseT = 0;
  const shooter = m.teams[0].players.find(p => !p.isGK), keeper = m.keeper(1);
  for (const p of m.all) if (p !== shooter && p !== keeper) { p.x = -30; p.z = (p.idx % 11 - 5) * 5; p.vx = p.vz = 0; }
  // spot: 8-28 m out, anywhere in a wide arc; target anywhere inside the frame; power 0.6-1
  const dist = process.env.PLACED ? 14 + Math.random() * 8 : 8 + Math.random() * 20, ang = (Math.random() - 0.5) * 1.3, sx = 52.5 - Math.cos(ang) * dist, sz = Math.sin(ang) * dist;
  shooter.x = sx; shooter.z = sz; shooter.vx = shooter.vz = 0; Object.assign(m.ball, { x: sx + 0.5, y: 0.17, z: sz, vx: 0, vy: 0, vz: 0, owner: null, heldBy: null }); m.ball.lastTouch = shooter;
  const kind = Math.random() < 0.5 ? 'ground' : 'raised', ty = process.env.PLACED ? (kind === 'ground' ? 0.35 : 2.0) : kind === 'ground' ? 0.15 + Math.random() * 0.9 : 0.9 + Math.random() * 1.4;
  const placed = !!process.env.PLACED, tz = placed ? (Math.random() < 0.5 ? -1 : 1) * 3.1 : (Math.random() * 2 - 1) * 3.4;
  shooter.shooting = 78; m.shootAt(shooter, { x: 52.5, y: ty, z: tz }, 0.65 + Math.random() * 0.35, 0);
  for (let t = 0; t < 3.2; t += 1 / 60) { m.step(1 / 60, {}); if (ev.goal || ev.held || ev.parried || m.phase !== 'play' || m.ball.heldBy) break; }
  if (!ev.goal && !ev.held && !ev.parried && !m.ball.heldBy) (globalThis.__o = globalThis.__o || {})[m.phase + '|' + (Math.abs(m.ball.z) < 3.7 ? 'inframe' : 'wide') + '|' + (m.stats[0].onTarget)] = ((globalThis.__o || {})[m.phase + '|' + (Math.abs(m.ball.z) < 3.7 ? 'inframe' : 'wide') + '|' + (m.stats[0].onTarget)] || 0) + 1;
  const k = ev.goal ? 'goal' : ev.held || m.ball.heldBy ? 'held' : ev.parried ? 'parried' : 'other';
  rows[k]++; (byKind[kind] = byKind[kind] || { goal: 0, held: 0, parried: 0, other: 0 })[k]++;
}
const pct = v => (v / N * 100).toFixed(0) + '%';
console.log(`shots ${N} (${diff}): goals ${pct(rows.goal)}  held ${pct(rows.held)}  parried ${pct(rows.parried)}  other ${pct(rows.other)}`);
for (const [k, r] of Object.entries(byKind)) { const t = r.goal + r.held + r.parried + r.other; console.log(`  ${k}: goal ${(r.goal / t * 100).toFixed(0)}%  held ${(r.held / t * 100).toFixed(0)}%  parried ${(r.parried / t * 100).toFixed(0)}%`); }
console.log(JSON.stringify(globalThis.__o));
