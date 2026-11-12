// Career mode engine: seasons of league + cup + continental football with a calendar, board objectives, money, upgrades, transfers,
// rating drift for every club, awards and a history book. Pure logic - the screens live in main.js.
import { CLUBS, LEAGUES, teamById, CUP_NAMES, SUPER_NAMES, CONTINENTS, continentOf, UEFA_LEAGUES } from './data.js';
import { REAL } from './real_squads.js';
import { compDef, startComp, playRound, simulateRest, myFixture, stageName, standings, simScore } from './comp.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), pick = a => a[Math.floor(Math.random() * a.length)], rnd = (a, b) => a + Math.random() * (b - a);
export const MGR_LEVELS = [[0, 'Rookie'], [60, 'Coach'], [160, 'Tactician'], [320, 'Gaffer'], [560, 'Master'], [900, 'Legend']];
export const mgrLevel = xp => { let l = 0; MGR_LEVELS.forEach(([n], i) => { if (xp >= n) l = i; }); const nx = MGR_LEVELS[l + 1]; return { name: MGR_LEVELS[l][1], level: l + 1, next: nx ? nx[0] : null, xp }; };
export const leagueOf = id => teamById(id).league;
export const COMP_LABEL = { lg: 'League', cup: 'Cup', cont: 'Continental', sup: 'Super Cup' };

// ---- competition definitions for a career (some are built per season)
export function defOf(cr, k) {
  const lg = leagueOf(cr.club);
  if (k === 'lg') return compDef('lg_' + lg);
  if (k === 'cup') return compDef('cup_' + lg);
  if (k === 'sup') return { id: 'sup_' + lg, name: SUPER_NAMES[lg], format: 'ko', koLegs: 1, pool: () => cr.supPair };
  const ct = continentOf(lg); if (!ct.groups) return compDef(ct.id);
  return { id: ct.id, name: ct.name, format: 'groups', groupLegs: 2, koLegs: 2, pool: () => cr.contPool };
}
export const trophyIdOf = (cr, k) => k === 'lg' ? 'lg_' + leagueOf(cr.club) : k === 'cup' ? 'cup_' + leagueOf(cr.club) : k === 'sup' ? 'sup_' + leagueOf(cr.club) : continentOf(leagueOf(cr.club)).id;

// ---- rating handling: the career keeps its own ratings and applies them to the shared team objects while it is open
const ORIG = new Map();
export function applyRatings(cr) {
  for (const t of CLUBS) { if (!ORIG.has(t.id)) ORIG.set(t.id, t.rating); t.rating = Math.round(ratingOf(cr, t.id)); t.cp = null; }
  const me = teamById(cr.club); me.cp = Array(16).fill(null); for (const s of cr.signed) me.cp[s.slot] = s.name;
}
export function restoreRatings() { for (const t of CLUBS) { if (ORIG.has(t.id)) t.rating = ORIG.get(t.id); t.cp = null; } }
export const baseRating = id => ORIG.has(id) ? ORIG.get(id) : teamById(id).rating;
export function ratingOf(cr, id) { return id === cr.club ? clamp(cr.base + cr.fac + cr.youthAcc + cr.sb * 0.6 + cr.mom, 55, 97) : cr.ratings[id] ?? baseRating(id); }

export function newCareer(club, manager, diff, prevXp = 0) {
  for (const t of CLUBS) if (!ORIG.has(t.id)) ORIG.set(t.id, t.rating); const me = teamById(club);
  const cr = { v: 1, club, manager: manager || 'The Gaffer', diff: diff || 'normal', season: 1, year: 2026, budget: 15 + Math.round((me.rating - 70) * 0.8), board: 60, xp: prevXp, goals: 0, scorers: {}, played: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
    base: ORIG.get(club), fac: 0, youth: 0, youthAcc: 0, stad: 0, sb: 0, mom: 0, signed: [], market: [], ratings: Object.fromEntries(CLUBS.map(t => [t.id, ORIG.get(t.id)])), hist: [], awards: [], titles: 0, prevTop: {}, over: false };
  startSeason(cr); return cr;
}

// ---- season set-up
function simOther(lg) { const c = startComp(compDef('lg_' + lg), null); simulateRest(c, compDef('lg_' + lg)); return standings(c, c.groups[0]); }
export function startSeason(cr) {
  const lg = leagueOf(cr.club), me = cr.club; applyRatings(cr); cr.comps = {}; cr.cal = []; cr.res = {};
  const ids = CLUBS.filter(c => c.league === lg).map(c => c.id), rank = [...ids].sort((a, b) => ratingOf(cr, b) - ratingOf(cr, a)).indexOf(me) + 1;
  cr.comps.lg = startComp(defOf(cr, 'lg'), me); cr.comps.cup = startComp(defOf(cr, 'cup'), me);
  const ct = continentOf(lg);
  if (!ct.groups) cr.comps.cont = startComp(defOf(cr, 'cont'), me);
  else {
    const byRating = l => CLUBS.filter(c => c.league === l).map(c => c.id).sort((x, y) => ratingOf(cr, y) - ratingOf(cr, x)), q = [];
    if (ct.id === 'ecc') { for (const l of UEFA_LEAGUES) q.push(...(cr.prevTop[l] || byRating(l)).slice(0, 2)); const rest = CLUBS.filter(c => UEFA_LEAGUES.includes(c.league) && !q.includes(c.id)).map(c => c.id).sort((x, y) => ratingOf(cr, y) - ratingOf(cr, x)); cr.contPool = [...q, ...rest].slice(0, 16); }
    else cr.contPool = CLUBS.filter(c => ct.leagues.includes(c.league)).map(c => c.id);
    cr.comps.cont = cr.contPool.includes(me) ? startComp(defOf(cr, 'cont'), me) : null;
  }
  // super cup: last season's champion v cup winner
  const lastLg = cr.prevTop[lg] && cr.prevTop[lg][0], lastCup = cr.lastCup; cr.comps.sup = null;
  if (cr.season > 1 && lastLg && lastCup && (me === lastLg || me === lastCup)) { const opp = me === lastLg ? lastCup : lastLg; cr.supPair = [me, lastLg === lastCup ? cr.prevTop[lg][1] : opp]; cr.comps.sup = startComp(defOf(cr, 'sup'), me); }
  const contRounds = !cr.comps.cont ? 0 : ct.groups ? 11 : 5;
  for (let i = 0; i < 14; i++) cr.cal.push({ k: 'lg', t: (i + 0.5) / 14 });
  [0.2, 0.5, 0.84].forEach(t => cr.cal.push({ k: 'cup', t })); for (let i = 0; i < contRounds; i++) cr.cal.push({ k: 'cont', t: 0.03 + i * (0.9 / contRounds) });
  if (cr.comps.sup) cr.cal.push({ k: 'sup', t: -1 });
  cr.cal.sort((a, b) => a.t - b.t);
  // board objectives
  cr.obj = { league: rank <= 1 ? 1 : rank <= 2 ? 2 : rank <= 4 ? 4 : 6, leagueText: rank <= 1 ? 'Win the league' : rank <= 2 ? 'Finish in the top 2' : rank <= 4 ? 'Finish in the top 4' : 'Finish in the top 6', cup: rank <= 3 ? 3 : 2, cupText: rank <= 3 ? 'Reach the cup final' : 'Reach the cup semi-finals', cont: cr.comps.cont ? (rank <= 2 || !ct.groups ? 2 : 1) : 0, contText: cr.comps.cont ? (rank <= 2 || !ct.groups ? 'Reach the semi-finals' : 'Get out of the group') : '' };
  genMarket(cr); cr.season0 = true;
}
// next scheduled match for the manager: { k, comp, def, fix, stage } or null when the season is over
export function nextEvent(cr) {
  const ev = cr.cal[0]; if (!ev) return null; const c = cr.comps[ev.k], def = defOf(cr, ev.k), fix = myFixture(c);
  return { k: ev.k, comp: c, def, fix, stage: stageName(c), label: COMP_LABEL[ev.k] + ' · ' + def.name };
}
// result = { gf, ga, pens, events }. Returns a summary used by the result screen.
export function playEvent(cr, result) {
  const ev = nextEvent(cr), c = ev.comp, k = ev.k, stage = ev.stage, st = cr.played, gf = result.gf, ga = result.ga;
  playRound(c, ev.def, { gf, ga, pens: result.pens }); cr.cal.shift();
  const won = result.pens ? result.pens[0] > result.pens[1] : gf > ga, draw = !result.pens && gf === ga;
  st.gf += gf; st.ga += ga; if (won) st.w++; else if (draw) st.d++; else st.l++; cr.goals += gf; cr.xp += won ? 3 : draw ? 1 : 0;
  for (const e of result.events || []) if (e.t === 0 && !e.card && !e.sub && !e.inj) cr.scorers[e.name] = (cr.scorers[e.name] || 0) + 1;
  const out = { k, stage, champion: false, out: null, through: c.through || null };
  if (c.done && c.champion === cr.club) { out.champion = true; cr.xp += k === 'lg' ? 40 : 25; }
  else if (c.out) { out.out = c.out; c.outStage = stage.split(' · ')[0]; simulateRest(c, ev.def); cr.cal = cr.cal.filter(x => x.k !== k); }
  else if (c.done) { out.out = 'The ' + ev.def.name + ' is over.'; }
  if (c.through) c.through = null;
  return out;
}
export const quickSim = (cr, ev) => { const [gf, ga] = simScore(teamById(cr.club), teamById(ev.fix.opp)), pens = gf === ga && ev.fix.decider && !(ev.fix.agg && ev.fix.agg[0] + gf !== ev.fix.agg[1] + ga) ? (Math.random() < 0.5 ? [5, 4] : [3, 4]) : null; return { gf, ga, pens, events: [] }; };

// ---- end of season
const stageRank = { 'Quarter-final': 1, 'Semi-final': 2, 'Final': 3 };
export function endSeason(cr) {
  const lg = leagueOf(cr.club), me = cr.club, L = cr.comps.lg, table = standings(L, L.groups[0]), pos = table.indexOf(me) + 1, row = L.table[me], won = k => cr.comps[k] && cr.comps[k].done && cr.comps[k].champion === me;
  const trophies = []; if (pos === 1) trophies.push('lg_' + lg); if (won('cup')) trophies.push('cup_' + lg); if (won('cont')) trophies.push(continentOf(lg).id); if (won('sup')) trophies.push('sup_' + lg);
  const awards = [], gb = Object.entries(cr.scorers).sort((a, b) => b[1] - a[1])[0]; if (gb && gb[1] >= 8) awards.push('aw_boot');
  if (pos === 1 && row.pts >= Math.max(...Object.values(L.table).map(r => r.pts))) awards.push('aw_moy'); if (pos === 1 && row.l === 0) awards.push('aw_inv');
  if (pos === 1 && won('cup')) awards.push('aw_double'); if (pos === 1 && won('cup') && won('cont')) awards.push('aw_treble'); if (pos === 1) cr.titles++; if (cr.titles >= 5 && pos === 1 && cr.titles === 5) awards.push('aw_dyn');
  // objectives and board
  const prog = (c) => !c ? null : c.done && c.champion === me ? 4 : /Group/.test(c.outStage || '') ? 0 : { 'Quarter-final': 1, 'Semi-final': 2, 'Final': 3 }[c.outStage] ?? 0;
  const cupC = cr.comps.cup, contC = cr.comps.cont, cupProg = prog(cupC), contProg = prog(contC);
  const leagueMet = pos <= cr.obj.league, cupMet = cupProg >= cr.obj.cup, contMet = contC ? contProg >= cr.obj.cont : null;
  let delta = (leagueMet ? 14 : -18) + (cupMet ? 4 : -4) + (contC ? (contMet ? 4 : -4) : 0) + trophies.length * 6 + (pos >= 7 ? -8 : 0); cr.board = clamp(cr.board + delta, 0, 100);
  // money
  const prize = pos === 1 ? 40 : pos === 2 ? 26 : pos === 3 ? 16 : 8, income = Math.round(14 + prize + cr.stad * 5 + (won('cup') ? 18 : cupProg * 3) + (won('cont') ? 60 : contC ? 10 : 0) + (won('sup') ? 8 : 0));
  cr.budget += income; cr.xp += trophies.length * 20 + (pos <= 3 ? 20 : 8);
  const rec = { season: cr.season, year: cr.year, pos, pts: row.pts, w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, cup: won('cup') ? 'Winners' : cupC.outStage || 'Out early', cont: contC ? (won('cont') ? 'Winners' : contC.outStage || 'Out') : '—', trophies, awards, income, scorer: gb ? gb[0] + ' (' + gb[1] + ')' : '—', board: delta };
  cr.hist.push(rec); cr.awards.push(...awards); cr.lastCup = cupC.champion; cr.prevTop[lg] = table;
  // the rest of the world plays its league so next season's continental places are earned
  for (const l of LEAGUES.map(x => x.id)) if (l !== lg) cr.prevTop[l] = simOther(l);
  cr.sacked = cr.board < 10; return { rec, objectives: { leagueMet, cupMet, contMet }, pos, trophies, awards, delta, income };
}
export function nextSeason(cr) {
  const L = cr.hist[cr.hist.length - 1]; cr.season++; cr.year++; cr.scorers = {};
  cr.mom = clamp(cr.mom + (L.pos <= 2 ? 1 : L.pos >= 7 ? -1 : 0), -2, 3); cr.youthAcc = Math.min(5, cr.youthAcc + cr.youth * 0.4); cr.sb *= 0.88;
  for (const t of CLUBS) { if (t.id === cr.club) continue; const b = baseRating(t.id), o = cr.ratings[t.id]; cr.ratings[t.id] = clamp(o + (b - o) * 0.25 + rnd(-1.4, 1.4), 58, 94); }
  startSeason(cr);
}

// ---- club: upgrades and transfers
export const UPGRADES = [
  { id: 'fac', name: 'Training ground', max: 5, cost: l => 25 * (l + 1), text: l => `+1 team rating per level (now +${l})` },
  { id: 'youth', name: 'Youth academy', max: 3, cost: l => 30 * (l + 1), text: l => `Home-grown talent: +${(l * 0.4).toFixed(1)} rating every season` },
  { id: 'stad', name: 'Stadium', max: 4, cost: l => 35 * (l + 1), text: l => `More gate money: +${l * 5}M every season` },
];
export const upgradeCost = (cr, u) => cr[u.id] >= u.max ? null : u.cost(cr[u.id]);
export function buyUpgrade(cr, id) { const u = UPGRADES.find(x => x.id === id), c = upgradeCost(cr, u); if (c == null || cr.budget < c) return false; cr.budget -= c; cr[id]++; applyRatings(cr); return true; }
const ROLE = i => i === 0 ? 'GK' : i <= 4 ? 'DF' : i <= 8 ? 'MF' : 'FW';
export function genMarket(cr) {
  const mine = ratingOf(cr, cr.club), pool = CLUBS.filter(c => c.id !== cr.club && REAL[c.id] && REAL[c.id].length >= 11), out = [], used = new Set();
  for (let n = 0; n < 40 && out.length < 8; n++) {
    const t = pick(pool), slot = Math.random() < 0.08 ? 0 : 1 + Math.floor(Math.random() * 10), name = REAL[t.id][slot]; if (!name || used.has(name)) continue;
    const bonus = clamp(Math.round((ratingOf(cr, t.id) - mine) / 5 + 2 + (Math.random() < 0.3 ? 1 : 0)), 1, 4); used.add(name);
    out.push({ name, from: t.name, role: ROLE(slot), bonus, price: 12 + bonus * bonus * 7 + Math.round(rnd(0, 8)) });
  } out.sort((a, b) => b.bonus - a.bonus); cr.market = out;
}
export function signPlayer(cr, i) {
  const p = cr.market[i]; if (!p || cr.budget < p.price) return false; cr.budget -= p.price;
  const slots = { GK: [0], DF: [1, 2, 3, 4], MF: [5, 6, 7, 8], FW: [9, 10] }[p.role], slot = slots.find(s => !cr.signed.some(x => x.slot === s)) ?? pick(slots);
  cr.signed = cr.signed.filter(x => x.slot !== slot); cr.signed.push({ name: p.name, slot, bonus: p.bonus }); cr.sb = cr.signed.reduce((a, x) => a + x.bonus, 0); cr.market.splice(i, 1); applyRatings(cr); return true;
}
