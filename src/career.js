// Master League: manage one club across seasons — squad, ageing & development, contracts, transfers, finances, board, youth.
// Pure logic on a JSON-safe state object (saved to localStorage). Money is in millions ("M") of club budget.
import * as T from './tournament.js';
import { COMPETITIONS } from './data/competitions.js';
import { CLUBS, LEAGUES, makeSquad, mulberry32, getTeam } from './data/teams.js';

const KEY = 'pc_career_v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const comp = id => COMPETITIONS.find(c => c.id === id);
export const FACILITIES = {
  stadium: { name: 'Stadium', icon: '🏟', desc: lv => `Capacity +${(lv - 1) * 12}% → bigger gate income` },
  training: { name: 'Training ground', icon: '🏋', desc: lv => `Young players develop ${(lv - 1) * 12}% faster, fewer injuries` },
  youth: { name: 'Youth academy', icon: '🌱', desc: lv => `Better youth intake each season (level ${lv})` },
  scouting: { name: 'Scouting network', icon: '🔭', desc: lv => `${12 + lv * 4} players on the transfer list, ${(lv - 1) * 3}% cheaper deals` },
};
export const CUP_FOR = { 'alb-league': 'alb-cup', 'alb2-league': 'alb-league-cup', 'ibe-league': 'ibe-cup', 'pen-league': 'pen-cup', 'teu-league': 'teu-cup', 'hex-league': 'hex-cup', 'afr-league': 'afr-cup' };

// ------------------------------------------------------------------ player economics
export function playerValue(p) {
  let v = 0.15 * Math.exp((p.rating - 55) * 0.16);
  const a = p.age || 25;
  v *= a <= 21 ? 1 + Math.max(0, (p.potential || p.rating) - p.rating) / 16 : a <= 28 ? 1 : a === 29 ? 0.85 : a === 30 ? 0.7 : a === 31 ? 0.55 : 0.4;
  return Math.max(0.1, r1(v));
}
// wages are calibrated per club (c.wageK) so the starting wage bill is ~62% of that club's income, whatever its size
export const wageOf = (p, k) => Math.max(0.05, r2(k * Math.pow(playerValue(p), 0.8)));
const dress = (p, rng, over = {}, k = 0.2) => { const q = { ...p, ...over }; q.potential = q.potential ?? ((q.age || 25) <= 23 ? clamp(q.rating + Math.floor(rng() * 15), q.rating, 95) : q.rating); q.contract = q.contract ?? 1 + Math.floor(rng() * 4); q.apps = q.apps || 0; q.goals = q.goals || 0; q.injured = q.injured || 0; q.value = playerValue(q); q.wage = wageOf(q, k); return q; };
const POSGROUP = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', LW: 'ATT', RW: 'ATT', ST: 'ATT', CF: 'ATT' };
export const posGroup = p => POSGROUP[p.pos] || 'MID';

export function leagueClubs(leagueId) { return CLUBS.filter(c => c.league === leagueId); }
export const careerLeagues = () => LEAGUES.filter(l => leagueClubs(l.id).length >= 12).map(l => ({ id: l.id, name: l.name, clubs: leagueClubs(l.id) }));

// ------------------------------------------------------------------ create / save / load
function makeStates(c, seed) {
  const club = getTeam(c.clubId), leagueComp = `${club.league}-league`, cd = comp(leagueComp);
  c.league = T.createCompetition(leagueComp, { seed });
  const partner = cd && (cd.tierBelow || cd.tierAbove);
  c.linked = partner ? T.createCompetition(partner, { seed: seed + 5 }) : null;
  const cupId = CUP_FOR[leagueComp];
  c.cup = cupId ? T.createCompetition(cupId, { seed: seed + 9 }) : null;
  // calendar: league matchdays with the cup rounds spread between them
  const N = c.league.rounds.length, nCup = c.cup ? Math.ceil(Math.log2(c.cup.teams.length)) + ((c.cup.teams.length & (c.cup.teams.length - 1)) ? 1 : 0) : 0;
  const cupAt = new Set(); for (let k = 0; k < nCup; k++) cupAt.add(Math.floor((k + 1) * N / (nCup + 1)));
  c.calendar = []; let lr = 0;
  for (let i = 0; i < N; i++) { c.calendar.push({ type: 'league', n: i + 1 }); if (cupAt.has(i + 1) && c.calendar.filter(e => e.type === 'cup').length < nCup) c.calendar.push({ type: 'cup', n: c.calendar.filter(e => e.type === 'cup').length + 1 }); }
  c.calIdx = 0; c.leagueId = club.league; c.season = c.league.season;
  const rank = [...c.league.teams].sort((a, b) => (getTeam(b)?.rating || 0) - (getTeam(a)?.rating || 0)).indexOf(c.clubId) + 1, n = c.league.teams.length;
  c.objective = { pos: clamp(Math.round(rank * 1.1 + 1), 2, Math.max(3, n - 4)), expected: rank };
  c.fin = { tv: 0, gate: 0, sponsor: 0, prize: 0, sales: 0, wages: 0, transfers: 0, upkeep: 0, funded: 0 };
  c.market = null; c.window = 0;
}
export function newCareer(clubId, manager = 'Manager') {
  const club = getTeam(clubId), rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
  const c = {
    v: 1, id: 'c' + Date.now().toString(36), manager, clubId, budget: r1(5 + (club.rating - 60) * 1.0), confidence: 62, year: 1, phase: 'season', wageK: 0.2,
    squad: [], formation: club.formation, tactics: { mentality: 0, pressing: 1, width: 1, line: 1, passing: 1 }, fac: { stadium: 1, training: 1, youth: 1, scouting: 1 },
    news: [], history: [], lastResults: [], over: null, sold: [], seed: Math.floor(Math.random() * 2 ** 31),
  };
  makeStates(c, c.seed);
  const raw = makeSquad(club, 1).map(p => dress(p, rng));
  c.wageK = projectedIncome(c) * 0.62 / raw.reduce((t, p) => t + Math.pow(p.value, 0.8), 0);
  c.squad = raw.map(p => ({ ...p, wage: wageOf(p, c.wageK) }));
  c.baseStrength = rawStrength(c);
  news(c, `Welcome to ${club.name}, ${manager}! The board expects a top-${c.objective.pos} finish.`);
  return c;
}
export const careerStore = {
  load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} },
  clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
};
const news = (c, t) => { c.news.unshift({ t, y: c.year, e: c.calIdx }); c.news = c.news.slice(0, 40); };

// ------------------------------------------------------------------ team strength
function rawStrength(c) {
  const ok = c.squad.filter(p => !p.injured), gk = ok.filter(p => p.pos === 'GK').sort((a, b) => b.rating - a.rating)[0];
  const out = ok.filter(p => p.pos !== 'GK').sort((a, b) => b.rating - a.rating).slice(0, 10);
  const xi = (gk ? [gk] : []).concat(out); return xi.reduce((t, p) => t + p.rating, 0) / Math.max(1, xi.length);
}
export function teamObj(c) { const club = getTeam(c.clubId); return { ...club, rating: Math.round(club.rating + (rawStrength(c) - c.baseStrength) * 1.2) }; }
export const effRating = c => teamObj(c).rating;
export const wageBill = c => r1(c.squad.reduce((t, p) => t + p.wage, 0));
export const squadValue = c => r1(c.squad.reduce((t, p) => t + p.value, 0));
export const stadiumCap = c => Math.round((15000 + (getTeam(c.clubId).rating - 55) * 1800) * (1 + (c.fac.stadium - 1) * 0.12) / 100) * 100;
const tvOf = c => (6 + (getTeam(c.clubId).rating - 55) * 1.1) * (comp(`${c.leagueId}-league`)?.tierAbove ? 0.6 : 1);
const sponsorOf = c => 3 + (getTeam(c.clubId).rating - 55) * 0.55;
const gateOf = c => r2(stadiumCap(c) * (0.62 + 0.38 * clamp((getTeam(c.clubId).rating - 55) / 40, 0, 1) + (c.confidence - 50) / 400) * 0.000036);
export const upkeepOf = c => r1(1 + 0.8 * (c.fac.stadium + c.fac.training + c.fac.youth + c.fac.scouting));
export const projectedIncome = c => r1(tvOf(c) + sponsorOf(c) + gateOf(c) * Math.ceil(c.league.rounds.length / 2));

// ------------------------------------------------------------------ calendar / matches
export function userFixture(st, clubId) { if (!st || st.status === 'done') return null; return T.nextFixtures(st).find(f => !f.played && (f.home === clubId || f.away === clubId)) || null; }
export function currentEvent(c) {
  if (c.phase !== 'season' || c.calIdx >= c.calendar.length) return null;
  const ev = c.calendar[c.calIdx], st = ev.type === 'league' ? c.league : c.cup;
  if (ev.type === 'cup' && (!st || st.status === 'done')) return { ...ev, skip: true, name: 'Cup (eliminated)', fixture: null };
  return { ...ev, st, name: ev.type === 'league' ? `${comp(c.league.compId)?.name || 'League'} · Matchday ${ev.n}` : `${st.name} · ${T.currentRound(st).name}`, fixture: userFixture(st, c.clubId) };
}
export function windowOpen(c) { const n = c.calendar.length; return c.phase === 'seasonEnd' || c.calIdx === 0 || (c.calIdx >= Math.floor(n * 0.42) && c.calIdx <= Math.floor(n * 0.5)); }
export function windowText(c) { const n = c.calendar.length; return windowOpen(c) ? 'Transfer window OPEN' : c.calIdx < n * 0.42 ? `Window opens at event ${Math.floor(n * 0.42) + 1}` : 'Transfer window closed until next season'; }

function simulateUser(c, fx) {
  const club = getTeam(c.clubId), oppId = fx.home === c.clubId ? fx.away : fx.home, opp = getTeam(oppId);
  const home = fx.home === c.clubId ? teamObj(c) : opp, away = fx.home === c.clubId ? opp : teamObj(c);
  const res = T.simulateMatch(home, away, { knockout: !!fx.decider, extraTime: fx.extraTime !== false, neutral: !!fx.neutral });
  // goals scored by *my* club are credited to my own squad
  const rng = mulberry32(Math.floor(Math.random() * 2 ** 31)), mine = res.scorers.filter(s => s.team === c.clubId);
  const attackers = c.squad.filter(p => !p.injured && p.pos !== 'GK'); const wt = p => (posGroup(p) === 'ATT' ? 5 : posGroup(p) === 'MID' ? 2 : 0.5) * Math.pow(p.shooting || 60, 2);
  const tot = attackers.reduce((t, p) => t + wt(p), 0);
  for (const s of mine) { if (s.og) continue; let x = rng() * tot, pick = attackers[0]; for (const p of attackers) { x -= wt(p); if (x <= 0) { pick = p; break; } } s.player = pick.id; s.name = pick.name; }
  return res;
}
export function simUserMatch(c) { const ev = currentEvent(c); return ev && ev.fixture ? simulateUser(c, ev.fixture) : null; }

// settle the current event: record my result (if any), simulate the rest of the round, advance the competitions, update money/stats/board
export function completeEvent(c, result) {
  const ev = currentEvent(c); if (!ev) return null;
  if (ev.skip) { c.calIdx++; if (c.calIdx >= c.calendar.length) endSeason(c); return null; }
  const st = ev.st, fx = ev.fixture, rng = mulberry32(Math.floor(Math.random() * 2 ** 31)); let info = null;
  if (fx) {
    if (!result) throw new Error('my fixture needs a result');
    T.recordResult(st, fx.id, result);
    const iAmHome = fx.home === c.clubId, gf = iAmHome ? result.hg : result.ag, ga = iAmHome ? result.ag : result.hg;
    const pens = result.pens ? (iAmHome ? result.pens.h > result.pens.a : result.pens.a > result.pens.h) : null;
    const won = gf > ga || (gf === ga && pens === true), lost = gf < ga || (gf === ga && pens === false);
    info = { event: ev.name, home: fx.home, away: fx.away, hg: result.hg, ag: result.ag, pens: result.pens, won, lost, iAmHome };
    c.lastResults.unshift(info); c.lastResults = c.lastResults.slice(0, 8);
    // squad stats & injuries
    const top = [...c.squad].filter(p => !p.injured).sort((a, b) => b.rating - a.rating).slice(0, 14);
    top.forEach(p => { p.apps++; if (rng() < 0.011 * (1 - (c.fac.training - 1) * 0.08)) { p.injured = 1 + Math.floor(rng() * 6); news(c, `${p.name} is injured (${p.injured} matches).`); } });
    for (const s of result.scorers || []) { if (s.team !== c.clubId || s.og) continue; const p = c.squad.find(q => q.id === s.player); if (p) p.goals++; }
    if (ev.type === 'league') c.confidence = clamp(c.confidence + (won ? 0.8 : lost ? -0.7 : 0.1), 0, 100);
    // money
    if (iAmHome) { const g = gateOf(c) * (ev.type === 'cup' ? 1.15 : 1); c.budget += g; c.fin.gate += g; }
    if (ev.type === 'cup' && won) { const b = 0.6 * ev.n; c.budget += b; c.fin.prize += b; }
  }
  c.squad.forEach(p => { if (p.injured && !(fx && false)) p.injured = Math.max(0, p.injured - 1); });
  // the rest of the competition
  T.simulateRound(st, []); T.advance(st);
  if (ev.type === 'league') {
    const N = c.league.rounds.length, tv = tvOf(c) / N, sp = sponsorOf(c) / N, wg = wageBill(c) / N;
    c.budget += tv + sp - wg; c.fin.tv += tv; c.fin.sponsor += sp; c.fin.wages += wg;
    if (c.budget < -5) { c.confidence = clamp(c.confidence - 0.6, 0, 100); }
  }
  if (ev.type === 'cup' && fx && info && info.lost) news(c, `Knocked out of the ${st.name}.`);
  c.calIdx++;
  if (c.confidence <= 5) { c.over = { reason: 'The board has sacked you after a loss of confidence.' }; c.phase = 'over'; return info; }
  if (c.calIdx >= c.calendar.length) endSeason(c);
  return info;
}
export function skipDeadEvents(c) { let n = 0; while (c.phase === 'season') { const ev = currentEvent(c); if (!ev || !ev.skip) break; completeEvent(c, null); n++; } return n; }

// ------------------------------------------------------------------ season end: prize money, development, retirements, youth, board
function standingPos(c) { const rows = T.standings(c.league); return rows.findIndex(r => r.team === c.clubId) + 1; }
export function endSeason(c) {
  const rng = mulberry32(Math.floor(Math.random() * 2 ** 31)), n = c.league.teams.length, pos = standingPos(c), club = getTeam(c.clubId);
  const tableRows = T.standings(c.league);
  if (c.league.status !== 'done') T.simulateAll(c.league);      // promotion play-offs etc. after the last matchday
  const champion = pos === 1, prize = r1(tvOf(c) * 0.45 * (1 - (pos - 1) / n)); c.budget += prize; c.fin.prize += prize;
  const up = upkeepOf(c); c.budget -= up; c.fin.upkeep += up;
  const rows = tableRows; const relegated = (c.league.relegated || []).includes(c.clubId), promoted = (c.league.promoted || []).includes(c.clubId);
  // board
  const met = pos <= c.objective.pos; let dConf = met ? 12 : -(4 + (pos - c.objective.pos) * 1.5); if (champion) dConf += 10; if (c.budget < 0) dConf -= 12;
  c.confidence = clamp(c.confidence + dConf, 0, 100);
  // development, ageing, contracts, retirement
  const changes = [], retired = [];
  for (const p of c.squad) {
    const old = p.rating, a = p.age; p.age++;
    const boost = 1 + (c.fac.training - 1) * 0.12;
    let d = a <= 21 ? Math.round((1 + rng() * 3.2) * boost) : a <= 24 ? Math.round(rng() * 2.4 * boost) : a <= 29 ? Math.round(rng() * 2 - 1) : a <= 32 ? -Math.round(rng() * 2.2) : -Math.round(1 + rng() * 2.6);
    d = clamp(d, -4, 6); if (d > 0) d = Math.min(d, Math.max(0, (p.potential ?? p.rating) - p.rating));
    p.rating = clamp(p.rating + d, 35, 97);
    for (const k of ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical']) if (p[k] != null) p[k] = clamp(p[k] + d + (k === 'pace' && a > 29 ? -1 : 0), 25, 99);
    p.contract--; p.value = playerValue(p); p.wage = Math.max(p.wage, wageOf(p, c.wageK) * 0.9); p.injured = 0; p.lastSeason = { apps: p.apps, goals: p.goals }; p.apps = 0; p.goals = 0;
    if (Math.abs(p.rating - old) >= 2) changes.push({ id: p.id, name: p.name, from: old, to: p.rating });
    if (p.age >= 36 || (p.age >= 33 && p.rating < 66 && rng() < 0.5)) retired.push(p);
  }
  c.squad = c.squad.filter(p => !retired.includes(p));
  for (const p of retired) news(c, `${p.name} (${p.age}) retires from football.`);
  const expiring = c.squad.filter(p => p.contract <= 0).map(p => p.id);
  // youth intake
  const youth = makeYouth(c, rng); c.squad.push(...youth);
  // linked division finishes too (so promotion/relegation can be applied)
  if (c.linked) T.simulateAll(c.linked);
  const hist = { year: c.year, season: c.season, league: comp(c.league.compId)?.name, pos, of: n, points: rows.find(r => r.team === c.clubId)?.pts, objective: c.objective.pos, champion, relegated, promoted, cup: c.cup && c.cup.status === 'done' ? (c.cup.champion === c.clubId ? 'Winners' : c.cup.runnerUp === c.clubId ? 'Runners-up' : '') : '' };
  c.history.push(hist);
  c.summary = { ...hist, prize, upkeep: up, dConf, met, changes: changes.sort((a, b) => (b.to - b.from) - (a.to - a.from)), retired: retired.map(p => ({ name: p.name, age: p.age })), youth: youth.map(p => ({ id: p.id, name: p.name, pos: p.pos, rating: p.rating, potential: p.potential, age: p.age })), expiring, topScorer: [...c.squad].sort((a, b) => (b.lastSeason?.goals || 0) - (a.lastSeason?.goals || 0))[0] };
  c.phase = c.confidence <= 5 ? 'over' : 'seasonEnd'; if (c.phase === 'over') c.over = { reason: 'The board has sacked you after a poor season.' };
  news(c, `Season over: ${pos}${['th', 'st', 'nd', 'rd'][(pos % 100 > 3 && pos % 100 < 21) ? 0 : pos % 10 > 3 ? 0 : pos % 10] || 'th'} of ${n}${promoted ? ' — PROMOTED!' : relegated ? ' — relegated' : ''}.`);
}
function makeYouth(c, rng) {
  const club = getTeam(c.clubId), pool = CLUBS.filter(x => x.league === club.league), out = [], lv = c.fac.youth, k = Math.max(1, Math.min(2 + lv, 31 - c.squad.length));
  for (let i = 0; i < k; i++) {
    const src = makeSquad(pool[Math.floor(rng() * pool.length)], c.year * 997 + i * 31 + Math.floor(rng() * 5000)).filter(p => p.pos !== 'GK' || rng() < 0.12);
    const t = src[Math.floor(rng() * src.length)]; const rating = clamp(Math.round(44 + lv * 3 + rng() * 9), 40, 72);
    out.push(dress({ ...t, id: `y${c.year}-${c.id}-${i}`, number: 30 + ((c.squad.length + i) % 60), rating, age: 16 + Math.floor(rng() * 3), pace: clamp(rating + Math.round(rng() * 8 - 4), 30, 80), shooting: clamp(rating + Math.round(rng() * 8 - 4), 30, 80), passing: clamp(rating + Math.round(rng() * 8 - 4), 30, 80), dribbling: clamp(rating + Math.round(rng() * 8 - 4), 30, 80), defending: clamp(rating + Math.round(rng() * 8 - 4), 30, 80), physical: clamp(rating + Math.round(rng() * 8 - 4), 30, 80), contract: 3, potential: clamp(rating + 8 + Math.round(rng() * (14 + lv * 4)), rating + 4, 93) }, rng, c.wageK));
  }
  return out;
}
export function renewCost(p) { return r1(p.wage * 0.6 + 0.1); }
export function renew(c, id) { const p = c.squad.find(q => q.id === id); if (!p) return 'Player not found'; const cost = renewCost(p); if (c.budget < cost) return 'Not enough budget'; c.budget -= cost; c.fin.transfers += cost; p.contract = 3; p.wage = r2(p.wage * 1.1); const e = c.summary && c.summary.expiring; if (e) c.summary.expiring = e.filter(x => x !== id); news(c, `${p.name} signs a new contract.`); return null; }

export function nextSeason(c) {
  if (c.phase !== 'seasonEnd') return;
  // players whose deals ran out walk away
  const gone = c.squad.filter(p => p.contract <= 0); c.squad = c.squad.filter(p => p.contract > 0); gone.forEach(p => news(c, `${p.name} leaves as his contract expired.`));
  if (!c.squad.some(p => p.pos === 'GK')) { const rng = mulberry32(c.year * 77); const gk = makeSquad(getTeam(c.clubId), c.year * 13).find(p => p.pos === 'GK'); if (gk) c.squad.push(dress({ ...gk, id: `gk-${c.year}-${c.id}`, rating: 60, age: 24 }, rng, c.wageK)); }
  // roll the competitions over (promotion & relegation for linked divisions)
  const lid = c.league.compId, linked = c.linked; let top = c.league, other = linked;
  if (linked) {
    const [a, b] = T.newCareerSeason([c.league, linked]); const mine = [a, b].find(s => s.teams.includes(c.clubId)); top = mine; other = mine === a ? b : a;
  } else top = T.newSeason(c.league);
  c.league = top; c.linked = other; c.leagueId = getTeam(c.clubId).league;
  const cd = comp(c.league.compId); c.leagueId = c.league.compId.replace('-league', '');
  const cupId = CUP_FOR[c.league.compId]; c.cup = cupId ? T.createCompetition(cupId, { seed: Math.floor(Math.random() * 2 ** 30), season: c.league.season }) : null;
  const N = c.league.rounds.length, nCup = c.cup ? Math.ceil(Math.log2(c.cup.teams.length)) + ((c.cup.teams.length & (c.cup.teams.length - 1)) ? 1 : 0) : 0, cupAt = new Set(); for (let k = 0; k < nCup; k++) cupAt.add(Math.floor((k + 1) * N / (nCup + 1)));
  c.calendar = []; for (let i = 0; i < N; i++) { c.calendar.push({ type: 'league', n: i + 1 }); if (cupAt.has(i + 1) && c.calendar.filter(e => e.type === 'cup').length < nCup) c.calendar.push({ type: 'cup', n: c.calendar.filter(e => e.type === 'cup').length + 1 }); }
  c.calIdx = 0; c.year++; c.season = c.league.season; c.phase = 'season'; c.summary = null; c.market = null; c.window = c.year * 2;
  c.fin = { tv: 0, gate: 0, sponsor: 0, prize: 0, sales: 0, wages: 0, transfers: 0, upkeep: 0, funded: 0 };
  const rank = [...c.league.teams].sort((a, b) => (getTeam(b)?.rating || 0) - (getTeam(a)?.rating || 0)).indexOf(c.clubId) + 1, n = c.league.teams.length;
  c.objective = { pos: clamp(Math.round(rank * 1.1 + 1), 2, Math.max(3, n - 4)), expected: rank };
  c.baseStrength = rawStrength(c) - (effRating(c) - getTeam(c.clubId).rating) / 1.2;   // keep the club rating anchored to its current squad
  c.baseStrength = rawStrength(c);
  news(c, `New season ${c.season} in the ${comp(c.league.compId)?.name}. Target: top ${c.objective.pos}.`);
}

// ------------------------------------------------------------------ transfers
export function squadLimits(c) { return { min: 16, max: 30, size: c.squad.length }; }
export function market(c) {
  const key = c.year + ':' + (c.calIdx >= Math.floor(c.calendar.length * 0.42) ? 1 : 0);
  if (c.market && c.market.key === key) return c.market;
  const rng = mulberry32((c.seed ^ (c.year * 7919) ^ (key.endsWith('1') ? 0x9e37 : 0)) >>> 0), size = 12 + c.fac.scouting * 4;
  const others = CLUBS.filter(x => x.id !== c.clubId), list = [], avg = rawStrength(c);
  for (let i = 0; i < 40 && list.length < size - 4; i++) {
    const club = others[Math.floor(rng() * others.length)], sq = makeSquad(club, c.year * 131 + i * 17 + (key.endsWith('1') ? 7 : 0));
    const p = sq[Math.floor(rng() * sq.length)]; if (!p || c.sold.includes(p.id) || list.some(x => x.id === p.id) || c.squad.some(x => x.id === p.id)) continue;
    if (p.rating < avg - 14 && (p.age || 25) > 21) continue;
    const q = dress(p, rng, { contract: 2 + Math.floor(rng() * 3) }, c.wageK); const disc = 1 - (c.fac.scouting - 1) * 0.03;
    list.push({ ...q, from: club.name, fromId: club.id, price: r1(q.value * (0.95 + rng() * 0.35) * disc), free: false });
  }
  for (let i = 0; i < 4; i++) {   // free agents (veterans on a free, they just want a wage)
    const club = others[Math.floor(rng() * others.length)], sq = makeSquad(club, c.year * 211 + i * 29 + 3).filter(p => (p.age || 25) >= 28 && p.rating > avg - 12);
    const p = sq[Math.floor(rng() * sq.length)]; if (!p || c.sold.includes(p.id) || c.squad.some(x => x.id === p.id) || list.some(x => x.id === p.id)) continue;
    const q = dress(p, rng, { contract: 1 + Math.floor(rng() * 2) }, c.wageK); list.push({ ...q, from: 'Free agent', fromId: null, price: 0, free: true });
  }
  c.market = { key, list: list.sort((a, b) => b.rating - a.rating) }; return c.market;
}
export function bid(c, id, amount) {
  if (!windowOpen(c)) return { ok: false, msg: 'The transfer window is closed.' };
  const m = market(c), p = m.list.find(x => x.id === id); if (!p) return { ok: false, msg: 'Player no longer available.' };
  if (c.squad.length >= 30) return { ok: false, msg: 'Squad is full (30). Sell or release someone first.' };
  const wageOK = true; amount = r1(amount);
  if (amount > c.budget) return { ok: false, msg: `You only have ${r1(c.budget)}M available.` };
  const chance = p.free ? 1 : clamp((amount / Math.max(0.1, p.price) - 0.78) / 0.28, 0.02, 1);
  if (Math.random() > chance) { p.price = r1(p.price * 1.03); return { ok: false, msg: `${p.from} rejected the ${amount}M offer. They want about ${r1(p.price)}M.` }; }
  c.budget -= amount; c.fin.transfers += amount; c.sold.push(p.id);
  const { price, from, fromId, free, ...pl } = p; c.squad.push({ ...pl, contract: p.free ? 1 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 2), apps: 0, goals: 0, injured: 0 });
  m.list = m.list.filter(x => x.id !== id); news(c, `Signed ${p.name} (${p.rating}) ${p.free ? 'on a free' : 'for ' + amount + 'M'}.`);
  return { ok: true, msg: `${p.name} signs! ${p.free ? 'Free transfer.' : amount + 'M paid to ' + from + '.'}`, player: p };
}
export function sellOffers(c, id) {
  const p = c.squad.find(x => x.id === id); if (!p) return [];
  c.offers = c.offers || {}; const k = id + ':' + c.year + ':' + (c.calIdx >= Math.floor(c.calendar.length * 0.42) ? 1 : 0);
  if (c.offers[k]) return c.offers[k];
  const rng = mulberry32([...k].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) >>> 0, 7)), buyers = CLUBS.filter(x => x.id !== c.clubId && x.rating >= p.rating - 8);
  const list = []; for (let i = 0; i < 3; i++) { const b = buyers[Math.floor(rng() * buyers.length)] || CLUBS[0]; list.push({ club: b.name, amount: r1(p.value * (0.8 + rng() * 0.4)) }); }
  c.offers[k] = list.sort((a, b) => b.amount - a.amount); return c.offers[k];
}
export function sell(c, id, amount) {
  if (!windowOpen(c)) return { ok: false, msg: 'The transfer window is closed.' };
  const p = c.squad.find(x => x.id === id); if (!p) return { ok: false, msg: 'Not found' };
  if (p.pos === 'GK' && c.squad.filter(x => x.pos === 'GK').length <= 1) return { ok: false, msg: 'You need at least one goalkeeper.' };
  if (c.squad.length <= 16) return { ok: false, msg: 'You need at least 16 players.' };
  c.squad = c.squad.filter(x => x.id !== id); c.budget += amount; c.fin.sales += amount; c.sold.push(id); news(c, `Sold ${p.name} for ${amount}M.`);
  return { ok: true, msg: `${p.name} sold for ${amount}M.` };
}
export function release(c, id) {
  const p = c.squad.find(x => x.id === id); if (!p) return 'Not found';
  if (p.pos === 'GK' && c.squad.filter(x => x.pos === 'GK').length <= 1) return 'You need at least one goalkeeper.';
  if (c.squad.length <= 16) return 'You need at least 16 players.';
  const fee = r1(p.wage * Math.max(0, p.contract - 1) * 0.5); if (c.budget < fee) return `Releasing ${p.name} costs ${fee}M (half his remaining wages).`;
  c.budget -= fee; c.fin.transfers += fee; c.squad = c.squad.filter(x => x.id !== id); news(c, `${p.name} released.`); return null;
}

// ------------------------------------------------------------------ facilities & wallet bridge
export const upgradeCost = (c, k) => r1(4 * Math.pow(c.fac[k], 1.6));
export function upgrade(c, k) { if (c.fac[k] >= 5) return 'Already at maximum level.'; const cost = upgradeCost(c, k); if (c.budget < cost) return `Needs ${cost}M.`; c.budget -= cost; c.fin.upkeep += cost; c.fac[k]++; news(c, `${FACILITIES[k].name} upgraded to level ${c.fac[k]}.`); return null; }
export function addFunds(c, millions) { c.budget += millions; c.fin.funded += millions; news(c, `+${millions}M injected from betting winnings.`); }

// ------------------------------------------------------------------ misc
export function tableRows(c) { return T.standings(c.league); }
export function top(c, n = 20) { return [...c.squad].sort((a, b) => b.rating - a.rating).slice(0, n); }
export function seasonProgress(c) { return { done: c.calIdx, total: c.calendar.length }; }
