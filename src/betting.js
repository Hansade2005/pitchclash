// Virtual sportsbook — PLAY COINS ONLY, no real money anywhere. Odds come from the very model that settles the games.
import { simulateMatch, matchProbabilities } from './tournament.js';
import { CLUBS, NATIONS, LEAGUES, mulberry32, getTeam } from './data/teams.js';

export const MARGIN = 0.07, MIN_STAKE = 5, MAX_STAKE = 5000, MAX_SELS = 8, MAX_BETTORS = 4, START_COINS = 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = n => Math.round(n).toLocaleString('en-US');
export const oddsOf = p => clamp(Math.round(100 / Math.max(1e-6, p * (1 + MARGIN))) / 100, 1.04, 80);

export const MARKETS = {
  '1x2': { name: 'Match result', picks: ['h', 'x', 'a'] },
  dc: { name: 'Double chance', picks: ['hx', 'xa', 'ha'] },
  ou25: { name: 'Goals over / under 2.5', picks: ['over', 'under'] },
  btts: { name: 'Both teams to score', picks: ['yes', 'no'] },
};
export const teamOf = id => getTeam(id);

export function pickLabel(game, market, pick) {
  const h = teamOf(game.homeId).name, a = teamOf(game.awayId).name;
  return ({ '1x2': { h: h + ' win', x: 'Draw', a: a + ' win' }, dc: { hx: h + ' or draw', xa: a + ' or draw', ha: h + ' or ' + a }, ou25: { over: 'Over 2.5 goals', under: 'Under 2.5 goals' }, btts: { yes: 'Both teams score', no: 'Not both teams score' } })[market][pick];
}
export function shortPick(market, pick) {
  return ({ '1x2': { h: '1', x: 'X', a: '2' }, dc: { hx: '1X', xa: 'X2', ha: '12' }, ou25: { over: 'Over', under: 'Under' }, btts: { yes: 'Yes', no: 'No' } })[market][pick];
}

// build one matchday of virtual games: mostly club games inside a league, plus a couple of international fixtures
export function makeMatchday(number, seed) {
  const rng = mulberry32(seed), games = [];
  const leagues = LEAGUES.filter(l => CLUBS.filter(c => c.league === l.id).length >= 12).map(l => l.id);
  const used = new Set();
  const add = (home, away, label, kind) => {
    const p = matchProbabilities(home, away, { seed: seed + games.length * 101 });
    games.push({
      id: 'g' + games.length, kind, label, homeId: home.id, awayId: away.id, seed: Math.floor(rng() * 2 ** 31), xg: [p.xgH, p.xgA],
      markets: {
        '1x2': { h: oddsOf(p.h), x: oddsOf(p.x), a: oddsOf(p.a) },
        dc: { hx: oddsOf(p.h + p.x), xa: oddsOf(p.x + p.a), ha: oddsOf(p.h + p.a) },
        ou25: { over: oddsOf(p.over25), under: oddsOf(1 - p.over25) },
        btts: { yes: oddsOf(p.btts), no: oddsOf(1 - p.btts) },
      },
    });
  };
  for (let i = 0; i < 6; i++) {
    const lid = leagues[Math.floor(rng() * leagues.length)], pool = CLUBS.filter(c => c.league === lid && !used.has(c.id));
    const a = pool[Math.floor(rng() * pool.length)]; used.add(a.id);
    const b = pool.filter(c => c !== a)[Math.floor(rng() * (pool.length - 1))]; used.add(b.id);
    add(a, b, LEAGUES.find(l => l.id === lid).name, 'club');
  }
  for (let i = 0; i < 2; i++) {
    const pool = NATIONS.filter(n => !used.has(n.id)), a = pool[Math.floor(rng() * pool.length)]; used.add(a.id);
    const b = pool.filter(n => n.confed === a.confed && n !== a && !used.has(n.id)); const bb = b[Math.floor(rng() * b.length)] || pool.filter(n => n !== a)[0]; used.add(bb.id);
    add(a, bb, 'International friendly', 'nation');
  }
  return { number, seed, games, played: false };
}

// the (deterministic) result of a game — also gives the minute-by-minute events for the live match centre
export function resolveGame(game) {
  const r = simulateMatch(teamOf(game.homeId), teamOf(game.awayId), { seed: game.seed, neutral: false });
  return { hg: r.hg, ag: r.ag, events: r.scorers.map(e => ({ minute: e.minute, side: e.team === game.homeId ? 'h' : 'a', name: e.name, og: e.og, pen: e.pen })) };
}
export function pickWins(market, pick, hg, ag) {
  if (market === '1x2') return pick === 'h' ? hg > ag : pick === 'a' ? ag > hg : hg === ag;
  if (market === 'dc') return pick === 'hx' ? hg >= ag : pick === 'xa' ? ag >= hg : hg !== ag;
  if (market === 'ou25') return pick === 'over' ? hg + ag > 2 : hg + ag < 3;
  return pick === 'yes' ? hg > 0 && ag > 0 : !(hg > 0 && ag > 0);
}

// ---- slips
export function newSlip() { return { mode: 'acca', sels: [], stake: 50 }; }
export function toggleSel(slip, game, market, pick) {
  const i = slip.sels.findIndex(s => s.gameId === game.id);
  const sel = { gameId: game.id, market, pick, odds: game.markets[market][pick] };
  if (i >= 0 && slip.sels[i].market === market && slip.sels[i].pick === pick) { slip.sels.splice(i, 1); return 'removed'; }
  if (i >= 0) { slip.sels[i] = sel; return 'replaced'; }     // one selection per game
  if (slip.sels.length >= MAX_SELS) return 'full';
  slip.sels.push(sel); return 'added';
}
export function slipSummary(slip) {
  const n = slip.sels.length; if (!n) return { odds: 0, staked: 0, ret: 0, bets: 0 };
  if (slip.mode === 'singles' || n === 1) return { odds: n === 1 ? slip.sels[0].odds : 0, staked: slip.stake * n, ret: Math.floor(slip.sels.reduce((t, s) => t + slip.stake * s.odds, 0)), bets: n };
  const odds = slip.sels.reduce((t, s) => t * s.odds, 1);
  return { odds: Math.round(odds * 100) / 100, staked: slip.stake, ret: Math.floor(slip.stake * odds), bets: 1 };
}
export function settleBet(bet, results) {
  const outcomes = bet.sels.map(s => { const r = results[s.gameId]; return r ? pickWins(s.market, s.pick, r.hg, r.ag) : null; });
  if (outcomes.some(o => o === false)) return { status: 'lost', ret: 0 };
  if (outcomes.some(o => o === null)) return { status: 'open', ret: 0 };
  return { status: 'won', ret: Math.floor(bet.stake * bet.sels.reduce((t, s) => t * s.odds, 1)) };
}
// live status of a bet while games are running (for the match centre): 'won' only counts once its games are finished
export function liveBetStatus(bet, live) {
  let allDone = true, anyLost = false;
  for (const s of bet.sels) {
    const g = live[s.gameId]; if (!g) { allDone = false; continue; }
    const ok = pickWins(s.market, s.pick, g.hg, g.ag);
    if (g.finished) { if (!ok) anyLost = true; }
    else { allDone = false; if (s.market === 'ou25' && s.pick === 'under' && g.hg + g.ag > 2) anyLost = true; if (s.market === 'btts' && s.pick === 'no' && g.hg > 0 && g.ag > 0) anyLost = true; }
  }
  return anyLost ? 'lost' : allDone ? 'won' : 'open';
}
