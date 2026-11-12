// Competition engine: home-and-away leagues, group stages, one- and two-legged knockouts.
import { teamById, COMPS } from './data.js';
export const compDef = id => COMPS.find(c => c.id === id);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const row = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
// round robin by the circle method; legs = 2 adds the return fixtures
export function roundRobin(ids, legs) {
  const n = ids.length, arr = [...ids], rounds = [];
  for (let r = 0; r < n - 1; r++) { const fx = []; for (let i = 0; i < n / 2; i++) fx.push(r % 2 ? [arr[n - 1 - i], arr[i]] : [arr[i], arr[n - 1 - i]]); rounds.push(fx); arr.splice(1, 0, arr.pop()); }
  return legs === 2 ? [...rounds, ...rounds.map(r => r.map(([a, b]) => [b, a]))] : rounds;
}
export function simScore(a, b) { const lam = d => 1.3 * Math.exp(d / 16), po = l => { let L = Math.exp(-l), p = 1, n = 0; do { n++; p *= Math.random(); } while (p > L); return n - 1; }; return [po(lam(a.rating - b.rating)), po(lam(b.rating - a.rating))]; }
export function standings(c, ids) { const T = c.table; return [...ids].sort((a, b) => T[b].pts - T[a].pts || (T[b].gf - T[b].ga) - (T[a].gf - T[a].ga) || T[b].gf - T[a].gf || a.localeCompare(b)); }
const koName = n => ({ 8: 'Round of 16', 4: 'Quarter-final', 2: 'Semi-final', 1: 'Final' }[n] || 'Knockout');
function knockout(c, def, ids) { c.stage = 'ko'; c.ties = []; for (let i = 0; i < ids.length; i += 2) c.ties.push([ids[i], ids[i + 1]]); c.legs = c.ties.length === 1 ? 1 : (def.koLegs || 1); c.leg = 0; c.first = []; }

export function startComp(def, me) {
  const ids = shuffle(def.pool()), c = { id: def.id, me, table: Object.fromEntries(ids.map(i => [i, row()])), results: [] };
  if (def.format === 'league') Object.assign(c, { stage: 'league', groups: [ids], fixtures: roundRobin(ids, 2), round: 0 });
  else if (def.format === 'groups') { // seeded pots: each group gets one team from each quarter of the rating list
    const seeded = [...ids].sort((a, b) => teamById(b).rating - teamById(a).rating), G = ids.length / 4, groups = Array.from({ length: G }, () => []);
    for (let pot = 0; pot < 4; pot++) shuffle(seeded.slice(pot * G, pot * G + G)).forEach((id, g) => groups[g].push(id));
    const per = groups.map(g => roundRobin(g, def.groupLegs || 1));
    Object.assign(c, { stage: 'groups', groups, fixtures: per[0].map((_, r) => per.flatMap(p => p[r])), round: 0 });
  } else knockout(c, def, ids);
  return c;
}
export function stageName(c) {
  if (c.stage === 'league') return `Match day ${c.round + 1} of ${c.fixtures.length}`;
  if (c.stage === 'groups') return `Group stage · match day ${c.round + 1} of ${c.fixtures.length}`;
  return koName(c.ties.length) + (c.legs === 2 ? (c.leg ? ' · 2nd leg' : ' · 1st leg') : '');
}
// the player's next match: opponent, whether it must produce a winner, and first-leg goals (me, opponent)
export function myFixture(c) {
  if (c.stage !== 'ko') { const f = c.fixtures[c.round].find(f => f.includes(c.me)); return f && { opp: f[0] === c.me ? f[1] : f[0], home: f[0] === c.me, decider: false, agg: null }; }
  const ti = c.ties.findIndex(t => t.includes(c.me)); if (ti < 0) return null; const t = c.ties[ti], a = t[0] === c.me, opp = a ? t[1] : t[0];
  if (c.legs === 2 && c.leg === 0) return { opp, home: a, decider: false, agg: null };
  const agg = c.legs === 2 ? (a ? [c.first[ti][0], c.first[ti][1]] : [c.first[ti][1], c.first[ti][0]]) : null;
  return { opp, home: c.legs === 2 ? !a : true, decider: true, agg };
}
// Plays out one round. mine = { gf, ga, pens: [me, opp] | null } for the player's match, or null to simulate it too.
export function playRound(c, def, mine) {
  const T = c.table, add = (id, gf, ga) => { const r = T[id]; r.p++; r.gf += gf; r.ga += ga; if (gf > ga) { r.w++; r.pts += 3; } else if (gf === ga) { r.d++; r.pts++; } else r.l++; };
  const mineIn = f => mine && c.me && f.includes(c.me), orient = (f, x) => f[0] === c.me ? x : [x[1], x[0]];
  if (c.stage !== 'ko') {
    const res = c.fixtures[c.round].map(f => { const sc = mineIn(f) ? orient(f, [mine.gf, mine.ga]) : simScore(teamById(f[0]), teamById(f[1])); add(f[0], sc[0], sc[1]); add(f[1], sc[1], sc[0]); return [f[0], f[1], sc]; });
    c.results = res; c.round++;
    if (c.round < c.fixtures.length) return;
    if (c.stage === 'league') { c.done = true; c.champion = standings(c, c.groups[0])[0]; return; }
    const q = c.groups.map(g => standings(c, g).slice(0, 2)), ids = [];
    for (let i = 0; i < q.length; i += 2) ids.push(q[i][0], q[i + 1][1], q[i + 1][0], q[i][1]);   // A1 v B2, B1 v A2 ...
    if (c.me && !ids.includes(c.me)) c.out = 'Eliminated in the group stage.'; else if (c.me) c.through = 'Qualified for the ' + koName(ids.length / 2) + 's!';
    knockout(c, def, ids); return;
  }
  const rn = koName(c.ties.length), res = c.ties.map(t => { if (mineIn(t)) return { sc: orient(t, [mine.gf, mine.ga]), pens: mine.pens ? orient(t, mine.pens) : null }; return { sc: simScore(teamById(t[0]), teamById(t[1])), pens: null }; });
  c.results = c.ties.map((t, i) => [t[0], t[1], res[i].sc, res[i].pens, c.legs === 2 && c.leg === 1 ? c.first[i] : null]);
  if (c.legs === 2 && c.leg === 0) { c.first = res.map(r => r.sc); c.leg = 1; return; }
  const winners = c.ties.map((t, i) => {
    const r = res[i], agg = c.legs === 2 ? [c.first[i][0] + r.sc[0], c.first[i][1] + r.sc[1]] : r.sc;
    if (agg[0] !== agg[1]) return agg[0] > agg[1] ? t[0] : t[1];
    if (!r.pens) { const pa = 0.5 + (teamById(t[0]).rating - teamById(t[1]).rating) / 60; r.pens = Math.random() < pa ? [5, 4] : [3, 4]; c.results[i][3] = r.pens; }
    return r.pens[0] > r.pens[1] ? t[0] : t[1];
  });
  if (c.me && c.ties.some(t => t.includes(c.me))) { if (winners.includes(c.me)) c.through = winners.length === 1 ? null : 'Through to the ' + koName(winners.length / 2) + '!'; else c.out = 'Knocked out in the ' + rn + '.'; }
  if (winners.length === 1) { c.done = true; c.champion = winners[0]; return; }
  knockout(c, def, winners);
}
// after the player is knocked out: play the rest of the competition
export function simulateRest(c, def) { c.was = c.me; c.me = null; let n = 0; while (!c.done && n++ < 60) playRound(c, def, null); }
