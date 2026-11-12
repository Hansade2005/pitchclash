// Pitch Clash — competition engine (pure logic, no DOM).
//
// All state is plain JSON (safe for JSON.stringify / localStorage). Functions
// that change a competition mutate the state object in place and return it.
//
// Typical loop for a menu:
//   const st = createCompetition('alb-league', { seed: 42 });
//   while (st.status !== 'done') {
//     const fx = nextFixtures(st);                 // current round
//     // ...human plays one of them → recordResult(st, fx[i].id, { hg, ag, scorers })
//     simulateRound(st, [humanFixtureId]);         // sim the rest
//     advance(st);                                 // next round / stage
//   }
//   st.champion  // team id
//
// Staged competitions (format: 'staged' — qualifiers, world-cycle, nations-ladder, second
// tiers) run through the same calls; when done they also expose fields such as
// `qualified`, `playoff`, `promoted`, `relegated`, `playoffWinner`, `nextTiers`.
// Careers: newSeason(state, { pyramid: otherDivisionState }) / newCareerSeason([states]).
// World cycle from separate qualifiers: worldPlayoffEntrants(states) → 'wq-playoff',
// worldCycleQualified(states) → createCompetition('world-nations', { teams }).

import { getTeam, makeSquad, pickXI, mulberry32, hashString, clubsInPool, NATIONS } from './data/teams.js';
import { getCompetition } from './data/competitions.js';

// ============================================================ RNG helpers
/** RNG closure whose internal counter lives in `holder.rng` (so it serialises). */
function stateRng(holder) {
  return function () {
    holder.rng = (holder.rng + 0x6D2B79F5) >>> 0;
    let t = holder.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function poisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}
function gauss(rng) { return (rng() + rng() + rng() + rng() - 2) / 0.5774; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ============================================================ match simulation
const BASE_GOALS = 1.2;   // per team per 90 at equal strength, neutral venue
const HOME_MULT = 1.14, AWAY_MULT = 0.88;
const RATING_K = 0.036;    // goal-rate sensitivity per rating point
const SCORER_POS_WEIGHT = { ST: 3.6, LW: 2.8, RW: 2.8, CAM: 2.3, LM: 1.8, RM: 1.8, CM: 1.2, CDM: 0.6,
  LB: 0.4, RB: 0.4, CB: 0.5, GK: 0.003 };

function resolveTeam(t) {
  if (typeof t === 'string') return getTeam(t) || { id: t, name: t, rating: 70 };
  return t;
}

function teamLineup(team) {
  if (!getTeam(team.id)) return null; // custom team without a squad
  const squad = makeSquad(team);
  return pickXI(squad, team.formation);
}

function pickScorer(rng, lineup) {
  if (!lineup) return null;
  const entries = [];
  for (const { player } of lineup.xi) {
    entries.push([player, SCORER_POS_WEIGHT[player.pos] * Math.pow(player.shooting / 70, 2)]);
  }
  for (const player of lineup.bench) {
    if (player.pos === 'GK') continue;
    entries.push([player, 0.12 * SCORER_POS_WEIGHT[player.pos] * Math.pow(player.shooting / 70, 2)]);
  }
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rng() * total;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}
function pickOwnGoaler(rng, lineup) {
  if (!lineup) return null;
  const defs = lineup.xi.map((e) => e.player).filter((p) => ['CB', 'LB', 'RB', 'CDM', 'GK'].includes(p.pos));
  return defs[Math.floor(rng() * defs.length)] || lineup.xi[0].player;
}

/** Penalty shootout: best of 5 then sudden death. Returns { h, a }. */
function shootout(rng, hRating, aRating) {
  const conv = (r) => clamp(0.74 + (r - 75) * 0.003, 0.62, 0.86);
  const hq = conv(hRating), aq = conv(aRating);
  let h = 0, a = 0;
  for (let i = 0; i < 5; i++) {
    if (rng() < hq) h++;
    if (h > a + (5 - i) || a > h + (4 - i)) break;
    if (rng() < aq) a++;
    if (h > a + (4 - i) || a > h + (4 - i)) break;
  }
  while (h === a) {
    const sh = rng() < hq, sa = rng() < aq;
    if (sh) h++;
    if (sa) a++;
  }
  return { h, a };
}

/**
 * Simulate a match.
 * @param {object|string} homeTeam  team object (from teams.js) or id
 * @param {object|string} awayTeam
 * @param {object} [opts]
 *   seed       number   — deterministic result for this seed
 *   rng        function — use this RNG instead (overrides seed)
 *   neutral    boolean  — no home advantage
 *   knockout   boolean  — a winner is required (extra time / penalties if level)
 *   extraTime  boolean  — play 30' extra time before penalties (default true)
 *   aggregate  {home, away} — goals already scored by this match's home/away team in earlier legs
 * @returns {{hg, ag, et, pens: null|{h,a}, scorers: Array, winner: string|null}}
 *   scorers: [{ team, player, name, minute, og, pen? }] ordered by minute
 *   hg/ag include extra-time goals; pens are shootout scores only.
 */
// expected goals for both sides (with the day-to-day form noise) — the one place the scoring model lives
function goalRates(home, away, rng, neutral) {
  const hs = home.style || {}, as = away.style || {};
  const diff = (home.rating ?? 70) - (away.rating ?? 70);
  const form = () => Math.exp(gauss(rng) * 0.12); // day-to-day variance
  let lh = BASE_GOALS * Math.exp(RATING_K * diff) * form();
  let la = BASE_GOALS * Math.exp(-RATING_K * diff) * form();
  lh *= 1 + ((hs.attack ?? 60) - (as.defence ?? 60)) / 500;
  la *= 1 + ((as.attack ?? 60) - (hs.defence ?? 60)) / 500;
  if (!neutral) { lh *= HOME_MULT; la *= AWAY_MULT; }
  return [lh, la];
}

// true outcome probabilities for betting (Monte-Carlo over the very same goal model that settles matches)
export function matchProbabilities(homeTeam, awayTeam, opts = {}) {
  const home = resolveTeam(homeTeam), away = resolveTeam(awayTeam), n = opts.n || 24000, rng = mulberry32(opts.seed ?? 12345);
  let h = 0, x = 0, a = 0, over = 0, btts = 0, hh = 0, aa = 0; const cs = {};
  for (let i = 0; i < n; i++) {
    const [lh, la] = goalRates(home, away, rng, !!opts.neutral), g1 = poisson(rng, lh), g2 = poisson(rng, la);
    if (g1 > g2) h++; else if (g1 < g2) a++; else x++;
    if (g1 + g2 > 2) over++; if (g1 > 0 && g2 > 0) btts++; hh += g1; aa += g2;
    const k = g1 + '-' + g2; cs[k] = (cs[k] || 0) + 1;
  }
  return { h: h / n, x: x / n, a: a / n, over25: over / n, btts: btts / n, xgH: hh / n, xgA: aa / n, cs: Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, v / n])) };
}

export function simulateMatch(homeTeam, awayTeam, opts = {}) {
  const home = resolveTeam(homeTeam), away = resolveTeam(awayTeam);
  const rng = opts.rng || mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 32));
  const [lh, la] = goalRates(home, away, rng, !!opts.neutral);

  const hLine = teamLineup(home), aLine = teamLineup(away);
  const scorers = [];
  const addGoals = (n, side, minLo, minHi) => {
    for (let i = 0; i < n; i++) {
      const minute = minLo + Math.floor(rng() * (minHi - minLo + 1));
      const teamObj = side === 'h' ? home : away;
      const oppLine = side === 'h' ? aLine : hLine;
      const line = side === 'h' ? hLine : aLine;
      const og = rng() < 0.03;
      const p = og ? pickOwnGoaler(rng, oppLine) : pickScorer(rng, line);
      const ev = { team: teamObj.id, player: p ? p.id : null, name: p ? p.name : 'Unknown', minute, og };
      if (!og && rng() < 0.08) ev.pen = true;
      scorers.push(ev);
    }
  };

  let hg = poisson(rng, lh), ag = poisson(rng, la);
  addGoals(hg, 'h', 1, 90);
  addGoals(ag, 'a', 1, 90);

  const aggH = opts.aggregate ? opts.aggregate.home : 0;
  const aggA = opts.aggregate ? opts.aggregate.away : 0;
  let et = false, pens = null;
  if (opts.knockout && hg + aggH === ag + aggA) {
    if (opts.extraTime !== false) {
      et = true;
      const eh = poisson(rng, lh * 0.3), ea = poisson(rng, la * 0.3);
      addGoals(eh, 'h', 91, 120);
      addGoals(ea, 'a', 91, 120);
      hg += eh; ag += ea;
    }
    if (hg + aggH === ag + aggA) pens = shootout(rng, home.rating ?? 70, away.rating ?? 70);
  }
  scorers.sort((x, y) => x.minute - y.minute);

  let winner = null;
  const th = hg + aggH, ta = ag + aggA;
  if (th > ta) winner = home.id;
  else if (ta > th) winner = away.id;
  else if (pens) winner = pens.h > pens.a ? home.id : away.id;
  return { hg, ag, et, pens, scorers, winner };
}

// ============================================================ qualification
function rankLeague(leagueId, opts) {
  const table = opts.leagueTables && opts.leagueTables[leagueId];
  if (table && table.length) return table.slice();
  return clubsInPool(leagueId).slice().sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    .map((c) => c.id);
}

function resolveQualifiers(comp, opts) {
  const ids = resolveQualifierIds(comp, opts);
  if (!comp.youth) return ids;
  const suffix = `-${comp.youth}`;
  return ids.map((id) => (id.endsWith(suffix) ? id : id + suffix));
}

function resolveQualifierIds(comp, opts) {
  if (opts.teams && opts.teams.length) return opts.teams.slice();
  const chosen = [];
  const add = (id) => { if (!chosen.includes(id)) chosen.push(id); };
  for (const q of comp.qualify || []) {
    if (q.from === 'league') {
      rankLeague(q.league, opts).slice(q.pos[0] - 1, q.pos[1]).forEach(add);
    } else if (q.from === 'pool') {
      let list = q.pool === 'row' ? clubsInPool('row') : rankLeague(q.pool, opts).map(getTeam);
      if (q.pool === 'row') list = list.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
      if (q.confed) list = list.filter((c) => c.confed === q.confed);
      if (q.country) list = list.filter((c) => c.country === q.country);
      list.slice(q.skip || 0).filter((c) => !chosen.includes(c.id)).slice(0, q.count).forEach((c) => add(c.id));
    } else if (q.from === 'confed') {
      NATIONS.filter((n) => n.confed === q.confed).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
        .slice(q.skip || 0, (q.skip || 0) + q.count).forEach((n) => add(n.id));
    } else if (q.from === 'invite') {
      NATIONS.filter((n) => q.confeds.includes(n.confed) && !chosen.includes(n.id))
        .sort((a, b) => b.rating - a.rating).slice(0, q.count).forEach((n) => add(n.id));
    } else if (q.from === 'quotas') {
      for (const [conf, n] of Object.entries(q.quotas)) {
        NATIONS.filter((x) => x.confed === conf).sort((a, b) => b.rating - a.rating).slice(0, n)
          .forEach((x) => add(x.id));
      }
      if (q.playoff) {
        NATIONS.filter((x) => q.playoff.confeds.includes(x.confed) && !chosen.includes(x.id))
          .sort((a, b) => b.rating - a.rating).slice(0, q.playoff.count).forEach((x) => add(x.id));
      }
    }
  }
  return chosen;
}

// ============================================================ state helpers
function teamSnapshot(id) {
  const t = getTeam(id);
  if (!t) return { id, name: id, short: id.slice(0, 3).toUpperCase(), rating: 70, country: null, confed: null };
  return { id: t.id, name: t.name, short: t.short, rating: t.rating, country: t.country, confed: t.confed,
    league: t.league || null, kind: t.kind, colors: t.colors };
}

function newFixture(state, round, home, away, extra = {}) {
  const id = 'F' + state.nextId++;
  const f = { id, round, home, away, leg: extra.leg || 1, played: false, hg: null, ag: null, et: false,
    pens: null, scorers: [], ...extra };
  state.fixtures[id] = f;
  return f;
}

function addRound(state, meta, pairs, fixtureExtra = {}) {
  const idx = state.rounds.length;
  const round = { index: idx, fixtures: [], ...meta };
  if (state.format === 'staged') round.phase = state.stage;
  state.rounds.push(round);
  for (const p of pairs) {
    const [h, a, extra] = p;
    round.fixtures.push(newFixture(state, idx, h, a, { ...fixtureExtra, ...(extra || {}) }).id);
  }
  return round;
}

/** Circle-method round robin. Returns array of rounds, each an array of [home, away]. */
function roundRobin(teams, double) {
  const list = teams.slice();
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds = [];
  let arr = list.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      let h = arr[i], a = arr[n - 1 - i];
      // Alternate the pivot's venue each round and the others by slot, which keeps
      // home/away runs short; the mirrored second half balances totals exactly.
      if (i === 0 ? r % 2 === 1 : i % 2 === 1) [h, a] = [a, h];
      if (h !== null && a !== null) pairs.push([h, a]);
    }
    rounds.push(pairs);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  if (double) {
    const second = rounds.map((pairs) => pairs.map(([h, a]) => [a, h]));
    return rounds.concat(second);
  }
  return rounds;
}

function koRoundName(teamsLeft) {
  if (teamsLeft === 2) return 'Final';
  if (teamsLeft === 4) return 'Semi-finals';
  if (teamsLeft === 8) return 'Quarter-finals';
  return `Round of ${teamsLeft}`;
}
/** Knockout round name honouring comp.roundPrefix / comp.roundNames ({ third, final }). */
function koName(comp, teamsLeft) {
  if (teamsLeft === 2 && comp.roundNames && comp.roundNames.final) return comp.roundNames.final;
  return (comp.roundPrefix || '') + koRoundName(teamsLeft);
}
function thirdName(comp) {
  return (comp.roundNames && comp.roundNames.third) || (comp.roundPrefix || '') + 'Third-place play-off';
}

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOP';

// ============================================================ createCompetition
/**
 * Create a competition state.
 * @param {string} compId  id from COMPETITIONS
 * @param {object} [opts]
 *   seed          number   — RNG seed (default random)
 *   season        string   — season label (default from the competition)
 *   teams         string[] — explicit participant ids (overrides qualification; for 'super' give [a, b])
 *   leagueTables  { [leagueId]: string[] } — finishing orders used for qualification
 *                 (otherwise clubs are ranked by rating)
 *   tiers         { A: ids, B: ids, ... } — tier membership for tiered comps (nations-ladder)
 */
export function createCompetition(compId, opts = {}) {
  const comp = getCompetition(compId);
  if (!comp) throw new Error(`Unknown competition: ${compId}`);
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
  const state = {
    version: 1,
    compId, name: comp.name, short: comp.short, type: comp.type, scope: comp.scope,
    season: opts.season || comp.defaultSeason || '',
    seed, rng: (seed ^ hashString(compId)) >>> 0,
    status: 'pending', current: 0, nextId: 1,
    teams: [], teamInfo: {}, groups: [], rounds: [], fixtures: {}, ties: {},
    ko: { rounds: [], byes: [] },
    bestThirds: null, champion: null, runnerUp: null, third: null,
  };
  const rng = stateRng(state);
  if (comp.format === 'staged') return createStaged(state, comp, opts, rng);
  const ids = resolveQualifiers(comp, opts);
  if (comp.size && !opts.teams && ids.length !== comp.size) {
    throw new Error(`${compId}: qualification produced ${ids.length} teams, expected ${comp.size}`);
  }
  state.teams = ids;
  for (const id of ids) state.teamInfo[id] = teamSnapshot(id);

  if (comp.type === 'league') {
    state.groups = [{ id: 'L', name: comp.name, teams: ids.slice() }];
    roundRobin(shuffle(rng, ids), comp.legs !== 1).forEach((pairs, i) => {
      addRound(state, { name: `Matchday ${i + 1}`, stage: 'league', group: 'L' }, pairs, { group: 'L' });
    });
    state.status = 'league';
  } else if (comp.type === 'groups_ko') {
    const seeded = ids.slice().sort((a, b) => state.teamInfo[b].rating - state.teamInfo[a].rating);
    const groupTeams = drawGroups(state, comp, seeded, rng);
    state.groups = groupTeams.map((teams, i) => ({ id: GROUP_LETTERS[i], name: `Group ${GROUP_LETTERS[i]}`, teams }));
    const perGroup = state.groups.map((g) => roundRobin(shuffle(rng, g.teams), comp.groupLegs === 2));
    const nRounds = perGroup[0].length;
    for (let r = 0; r < nRounds; r++) {
      const pairs = [];
      state.groups.forEach((g, gi) => perGroup[gi][r].forEach(([h, a]) => pairs.push([h, a, { group: g.id }])));
      addRound(state, { name: `Group Stage – Matchday ${r + 1}`, stage: 'group' }, pairs,
        { neutral: !!comp.neutral });
    }
    state.status = 'groups';
  } else if (comp.type === 'knockout') {
    const seeded = ids.slice().sort((a, b) => state.teamInfo[b].rating - state.teamInfo[a].rating);
    const n = seeded.length;
    let p = 1;
    while (p * 2 <= n) p *= 2;
    if (n === p) {
      addKoRound(state, comp, koRoundName(n), randomPairs(rng, seeded), 'main');
    } else {
      const prelim = n - p;              // matches needed to get down to p teams
      state.ko.byes = seeded.slice(0, n - 2 * prelim);
      const playing = seeded.slice(n - 2 * prelim);
      addKoRound(state, comp, 'Preliminary Round', randomPairs(rng, playing), 'main');
    }
    state.status = 'knockout';
  } else if (comp.type === 'super') {
    if (ids.length !== 2) throw new Error(`${compId}: a super cup needs exactly 2 teams`);
    addKoRound(state, comp, 'Final', [[ids[0], ids[1]]], 'final');
    state.status = 'knockout';
  } else {
    throw new Error(`Unsupported competition type: ${comp.type}`);
  }
  return state;
}

function randomPairs(rng, ids) {
  const s = shuffle(rng, ids);
  const pairs = [];
  for (let i = 0; i + 1 < s.length; i += 2) pairs.push([s[i], s[i + 1]]);
  return pairs;
}

// ------------------------------------------------------------ group draw
function drawGroups(state, comp, seeded, rng) {
  const G = comp.groups, size = comp.groupSize;
  if (seeded.length !== G * size) throw new Error(`${comp.id}: need ${G * size} teams, got ${seeded.length}`);
  const pots = [];
  for (let p = 0; p < size; p++) pots.push(seeded.slice(p * G, (p + 1) * G));
  const info = state.teamInfo;
  const rules = [].concat(comp.groupConstraint || []);
  const allowed = (group, id) => rules.every((rule) => {
    if (rule === 'country') return !group.some((o) => info[o].country === info[id].country);
    if (rule === 'confed') {
      const c = info[id].confed;
      const limit = (comp.confedLimit && (comp.confedLimit[c] ?? comp.confedLimit.default)) ?? 1;
      return group.filter((o) => info[o].confed === c).length < limit;
    }
    return true;
  });
  for (let attempt = 0; attempt < 300; attempt++) {
    const constrained = attempt < 250;
    const groups = Array.from({ length: G }, () => []);
    let ok = true;
    for (let p = 0; p < pots.length && ok; p++) {
      const order = shuffle(rng, pots[p]);
      const bt = (i) => {
        if (i === order.length) return true;
        for (const gi of shuffle(rng, [...Array(G).keys()])) {
          const g = groups[gi];
          if (g.length !== p) continue;
          if (constrained && !allowed(g, order[i])) continue;
          g.push(order[i]);
          if (bt(i + 1)) return true;
          g.pop();
        }
        return false;
      };
      ok = bt(0);
    }
    if (ok) return groups;
  }
  throw new Error('Group draw failed');
}

// ------------------------------------------------------------ knockout rounds
function addKoRound(state, comp, name, pairs, kind) {
  const isFinal = kind === 'final';
  let legs = kind === 'third' ? 1 : isFinal ? (comp.finalLegs || 1) : (comp.type === 'knockout' ? (comp.legs || 1) : (comp.koLegs || 1));
  if (kind === 'main' && comp.semiLegs && pairs.length === 2) legs = comp.semiLegs;
  const neutral = !!comp.neutral || (isFinal && legs === 1 && !!comp.finalNeutral) || (kind === 'third');
  const koIndex = state.ko.rounds.length;
  const kr = { index: koIndex, name, kind, legs, ties: [] };
  if (state.format === 'staged') kr.phase = state.stage;
  state.ko.rounds.push(kr);
  const ties = pairs.map(([a, b]) => {
    const tie = { id: 'T' + state.nextId++, ko: koIndex, a, b, legs, fixtures: [], winner: null, loser: null,
      agg: null, decidedBy: null };
    state.ties[tie.id] = tie;
    kr.ties.push(tie.id);
    return tie;
  });
  for (let leg = 1; leg <= legs; leg++) {
    const round = addRound(state, {
      name: legs > 1 ? `${name} – Leg ${leg}` : name, stage: 'ko', ko: koIndex, leg, lastLeg: leg === legs,
    }, ties.map((t) => (leg % 2 === 1 ? [t.a, t.b, { tie: t.id }] : [t.b, t.a, { tie: t.id }])), {
      leg, neutral, decider: leg === legs, extraTime: comp.extraTime !== false,
    });
    round.fixtures.forEach((fid) => { state.ties[state.fixtures[fid].tie].fixtures.push(fid); });
  }
  return kr;
}

function resolveKoRound(state, koIndex) {
  const rng = stateRng(state);
  const kr = state.ko.rounds[koIndex];
  for (const tid of kr.ties) {
    const t = state.ties[tid];
    const fx = t.fixtures.map((id) => state.fixtures[id]);
    let ga = 0, gb = 0;
    for (const f of fx) {
      if (f.home === t.a) { ga += f.hg; gb += f.ag; } else { ga += f.ag; gb += f.hg; }
    }
    t.agg = { a: ga, b: gb };
    const last = fx[fx.length - 1];
    if (ga !== gb) {
      t.winner = ga > gb ? t.a : t.b;
      t.decidedBy = last.et ? 'extra-time' : (t.legs > 1 ? 'aggregate' : 'normal');
    } else {
      if (!last.pens) { // e.g. human result recorded level without a shootout
        const hr = state.teamInfo[last.home].rating, ar = state.teamInfo[last.away].rating;
        last.pens = shootout(rng, hr, ar);
      }
      const homeWins = last.pens.h > last.pens.a;
      t.winner = homeWins ? last.home : last.away;
      t.decidedBy = 'penalties';
    }
    t.loser = t.winner === t.a ? t.b : t.a;
  }
}

function nextKoRound(state, comp) {
  const rng = stateRng(state);
  const prev = state.ko.rounds[state.ko.rounds.length - 1];
  let teams = prev.ties.map((tid) => state.ties[tid].winner);
  let forceRandom = false;
  if (state.ko.byes && state.ko.byes.length) { teams = teams.concat(state.ko.byes); state.ko.byes = []; forceRandom = true; }
  if (teams.length === 2) {
    if (comp.thirdPlace && prev.kind === 'main' && prev.ties.length === 2) {
      const losers = prev.ties.map((tid) => state.ties[tid].loser);
      addKoRound(state, comp, thirdName(comp), [[losers[0], losers[1]]], 'third');
    }
    addKoRound(state, comp, koName(comp, 2), [[teams[0], teams[1]]], 'final');
    return;
  }
  let pairs;
  if (forceRandom || comp.draw === 'random' || comp.koDraw === 'random') pairs = randomPairs(rng, teams);
  else { pairs = []; for (let i = 0; i < teams.length; i += 2) pairs.push([teams[i], teams[i + 1]]); }
  addKoRound(state, comp, koName(comp, teams.length), pairs, 'main');
}

function buildKoFromGroups(state, comp, groupList = state.groups) {
  const rng = stateRng(state);
  const tables = groupList.map((g) => computeTable(state, g));
  const groupOf = {};
  groupList.forEach((g) => g.teams.forEach((t) => { groupOf[t] = g.id; }));
  const winners = tables.map((t) => t[0]);
  const runners = tables.map((t) => t[1]);
  const rankRows = (rows) => rows.slice().sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.w - x.w
    || state.teamInfo[x.team].name.localeCompare(state.teamInfo[y.team].name));
  let thirds = [];
  if (comp.bestThirds) {
    const ranked = rankRows(tables.map((t) => t[2]));
    state.thirdsRanking = ranked.map((r) => ({ ...r, group: groupOf[r.team] }));
    thirds = ranked.slice(0, comp.bestThirds);
    state.bestThirds = thirds.map((r) => r.team);
  }
  const total = winners.length + runners.length + thirds.length;
  let pairs;
  if (comp.firstKo === 'bracket' && !thirds.length) {
    // Fixed bracket: 1A–2B, 1C–2D, … then 1B–2A, 1D–2C, … (A/B winners in opposite halves)
    const half1 = [], half2 = [];
    for (let p = 0; p < winners.length; p += 2) {
      half1.push([winners[p].team, runners[p + 1].team]);
      half2.push([winners[p + 1].team, runners[p].team]);
    }
    pairs = half1.concat(half2);
  } else {
    // Seeded draw: group winners (+ best runners-up if needed) vs the rest; no same-group
    // (and, for clubs, no same-country) pairings.
    const seeds = winners.map((r) => r.team);
    let unseededRows = runners.concat(thirds);
    const need = total / 2;
    if (seeds.length < need) {
      const bestRunners = rankRows(runners).slice(0, need - seeds.length).map((r) => r.team);
      seeds.push(...bestRunners);
      unseededRows = unseededRows.filter((r) => !bestRunners.includes(r.team));
    }
    const unseeded = unseededRows.map((r) => r.team);
    const constraints = comp.koConstraint || ['group'];
    const ok = (s, u, strict) => {
      if (constraints.includes('group') && groupOf[s] === groupOf[u]) return false;
      if (strict && constraints.includes('country') && state.teamInfo[s].country === state.teamInfo[u].country) return false;
      return true;
    };
    pairs = null;
    for (let attempt = 0; attempt < 200 && !pairs; attempt++) {
      const strict = attempt < 150;
      const sOrder = shuffle(rng, seeds);
      const used = new Set();
      const result = [];
      const bt = (i) => {
        if (i === sOrder.length) return true;
        for (const u of shuffle(rng, unseeded)) {
          if (used.has(u) || !ok(sOrder[i], u, strict)) continue;
          used.add(u); result.push([u, sOrder[i]]); // unseeded hosts the first leg
          if (bt(i + 1)) return true;
          used.delete(u); result.pop();
        }
        return false;
      };
      if (bt(0)) pairs = result;
    }
    if (!pairs) throw new Error('Knockout draw failed');
    if (comp.neutral || comp.koLegs === 1) pairs = pairs.map(([u, s]) => [s, u]); // seed listed first
  }
  addKoRound(state, comp, koName(comp, total), pairs, total === 2 ? 'final' : 'main');
}

// ============================================================ staged formats
// See the 'staged formats' notes in data/competitions.js. State additions:
//   format: 'staged', stage: index of the running stage, stageOut: { stageId: { output: ids } },
//   groups[].pool / groups[].phase, rounds[].phase, ko.rounds[].phase,
//   tiers (tiered comps), and on completion the comp's `result` fields (qualified, playoff,
//   promoted, relegated ...), `scalars`, and `nextTiers`.
const byRating = (state) => (a, b) => state.teamInfo[b].rating - state.teamInfo[a].rating
  || state.teamInfo[a].name.localeCompare(state.teamInfo[b].name);

function stageComp(stage) {
  // Shape expected by the shared group / knockout helpers.
  return { ...stage, type: 'stage', koLegs: stage.legs || 1, finalLegs: stage.finalLegs || 1 };
}

function refIds(state, ref) {
  const [sid, key] = ref.split('.');
  const out = state.stageOut[sid];
  if (!out || !out[key]) throw new Error(`${state.compId}: unknown stage output ${ref}`);
  return out[key];
}

function resolveEntrants(state, src, opts) {
  if (Array.isArray(src)) return src.flatMap((ref) => refIds(state, ref));
  if (src.tier) return state.tiers[src.tier].slice();
  if (src.qualify) return resolveQualifiers({ qualify: src.qualify }, { leagueTables: opts.leagueTables });
  throw new Error(`${state.compId}: bad entrants`);
}

function createStaged(state, comp, opts, rng) {
  Object.assign(state, { format: 'staged', stage: 0, stageOut: {} });
  if (comp.tiers) {
    if (opts.tiers) state.tiers = JSON.parse(JSON.stringify(opts.tiers));
    else {
      const ranked = resolveQualifiers({ qualify: comp.tierQualify }, opts)
        .sort((a, b) => getTeam(b).rating - getTeam(a).rating || getTeam(a).name.localeCompare(getTeam(b).name));
      state.tiers = {};
      let i = 0;
      for (const [tier, n] of Object.entries(comp.tiers)) { state.tiers[tier] = ranked.slice(i, i + n); i += n; }
    }
  }
  // Stage-0 entrants decide the participant list; later stages draw from them.
  const first = comp.stages[0];
  const sources = first.kind === 'groups' ? first.pools.map((p) => p.entrants) : [first.entrants];
  const entrants = sources.map((src) => resolveEntrants(state, src, opts));
  if (opts.teams && opts.teams.length) {
    if (entrants.length !== 1) throw new Error(`${comp.id}: opts.teams needs a single-pool first stage`);
    entrants[0] = opts.teams.slice();
  }
  const ids = [...new Set(entrants.flat())];
  state.teams = ids;
  for (const id of ids) state.teamInfo[id] = teamSnapshot(id);
  buildStage(state, comp, rng, opts, entrants);
  return state;
}

/** Seeded pots: pot p = the p-th band of G teams by rating, one per group; sizes may differ by one. */
function drawPots(state, rng, seeded, sizes) {
  const G = sizes.length;
  const groups = sizes.map(() => []);
  for (let p = 0; p * G < seeded.length; p++) {
    const pot = shuffle(rng, seeded.slice(p * G, (p + 1) * G));
    const open = shuffle(rng, [...Array(G).keys()].filter((i) => groups[i].length < sizes[i]));
    if (open.length < pot.length) throw new Error(`${state.compId}: group sizes ${sizes} cannot be drawn in pots`);
    pot.forEach((t, k) => groups[open[k]].push(t));
  }
  return groups;
}

function buildStage(state, comp, rng, opts, pre) {
  const stage = comp.stages[state.stage];
  if (stage.kind === 'groups') buildGroupsStage(state, comp, stage, rng, opts, pre);
  else buildKoStage(state, stage, rng, opts, pre);
}

function buildGroupsStage(state, comp, stage, rng, opts, pre) {
  const groups = [];
  stage.pools.forEach((pool, pi) => {
    const entrants = pre ? pre[pi] : resolveEntrants(state, pool.entrants, opts);
    let sizes = pool.sizes || [entrants.length];
    if (sizes.length === 1 && sizes[0] !== entrants.length) sizes = [entrants.length];
    const total = sizes.reduce((a, b) => a + b, 0);
    if (total !== entrants.length) throw new Error(`${comp.id}/${pool.id}: ${entrants.length} entrants for groups of ${sizes}`);
    const seeded = entrants.slice().sort(byRating(state));
    const arrays = pool.draw === 'constrained'
      ? drawGroups(state, { id: `${comp.id}/${pool.id}`, groups: sizes.length, groupSize: sizes[0],
        groupConstraint: pool.groupConstraint, confedLimit: pool.confedLimit }, seeded, rng)
      : drawPots(state, rng, seeded, sizes);
    arrays.forEach((teams, i) => {
      const single = arrays.length === 1 && pool.groupId;
      const label = pool.numbered ? String(i + 1) : GROUP_LETTERS[i];
      const id = single ? pool.groupId : `${pool.groupPrefix || ''}${label}`;
      const name = single ? (pool.name || id) : (pool.name ? `${pool.name} – Group ${label}` : `Group ${id}`);
      groups.push({ id, name, teams, pool: pool.id, phase: state.stage, legs: pool.legs || 1, neutral: !!pool.neutral });
    });
  });
  state.groups.push(...groups);
  const per = groups.map((g) => roundRobin(shuffle(rng, g.teams), g.legs === 2));
  const nRounds = Math.max(...per.map((r) => r.length));
  const isLeague = comp.type === 'league';
  for (let r = 0; r < nRounds; r++) {
    const pairs = [];
    groups.forEach((g, gi) => (per[gi][r] || []).forEach(([h, a]) => pairs.push([h, a, { group: g.id, neutral: g.neutral }])));
    addRound(state, { name: isLeague ? `Matchday ${r + 1}` : `${stage.name} – Matchday ${r + 1}`,
      stage: isLeague ? 'league' : 'group' }, pairs);
  }
  state.status = isLeague ? 'league' : 'groups';
}

function buildKoStage(state, stage, rng, opts, pre) {
  const sc = stageComp(stage);
  state.status = 'knockout';
  if (stage.entrants.groupsOf) {
    const phase = getCompetition(state.compId).stages.findIndex((s) => s.id === stage.entrants.groupsOf);
    buildKoFromGroups(state, sc, state.groups.filter((g) => g.phase === phase));
    return;
  }
  const teams = pre ? pre[0] : resolveEntrants(state, stage.entrants, opts);
  const n = teams.length;
  if (n < 2 || n % 2) throw new Error(`${state.compId}/${stage.id}: ${n} knockout entrants`);
  let pairs = [];
  if (stage.pairing === 'positions') for (let i = 0; i < n / 2; i++) pairs.push([teams[n - 1 - i], teams[i]]);
  else pairs = randomPairs(rng, teams);
  const kind = n === 2 ? 'final' : stage.single ? 'playoff' : 'main';
  addKoRound(state, sc, stage.roundName || koName(sc, n), pairs, kind);
}

/** Rank the `pos`-placed teams of several groups against each other. */
function rankAcross(state, groups, pos) {
  const minSize = Math.min(...groups.map((g) => g.teams.length));
  const rows = [];
  for (const g of groups) {
    const table = computeTable(state, g);
    const row = table[pos === -1 ? table.length - 1 : pos - 1];
    if (!row) continue;
    if (g.teams.length === minSize || pos === -1 || pos > minSize) { rows.push({ ...row, group: g.id }); continue; }
    // Larger group: discard results against the teams finishing below the smallest group size.
    const keep = new Set(table.slice(0, minSize).map((r) => r.team));
    const r = { team: row.team, group: g.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    for (const f of Object.values(state.fixtures)) {
      if (f.group !== g.id || !f.played) continue;
      const home = f.home === row.team;
      if (!home && f.away !== row.team) continue;
      if (!keep.has(home ? f.away : f.home)) continue;
      const gf = home ? f.hg : f.ag, ga = home ? f.ag : f.hg;
      r.p++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.w++; r.pts += 3; } else if (gf === ga) { r.d++; r.pts++; } else r.l++;
    }
    r.gd = r.gf - r.ga;
    rows.push(r);
  }
  return rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.w - x.w
    || state.teamInfo[x.team].name.localeCompare(state.teamInfo[y.team].name));
}

function stageOutputs(state, stage, phase) {
  const out = {};
  const groups = state.groups.filter((g) => g.phase === phase);
  const krs = state.ko.rounds.filter((k) => k.phase === phase && k.kind !== 'third');
  for (const [key, sels] of Object.entries(stage.outputs || {})) {
    const ids = [];
    const add = (id) => { if (id && !ids.includes(id)) ids.push(id); };
    for (const sel of sels) {
      if (sel.ko) {
        const last = krs[krs.length - 1];
        const ties = last ? last.ties.map((t) => state.ties[t]) : [];
        if (sel.ko === 'winners') ties.forEach((t) => add(t.winner));
        else if (sel.ko === 'champion' && last.kind === 'final') add(ties[0].winner);
        else if (sel.ko === 'runnerUp' && last.kind === 'final') add(ties[0].loser);
        continue;
      }
      const gs = sel.pool ? groups.filter((g) => g.pool === sel.pool) : groups;
      if (sel.best) {
        const skip = sel.skip || 0;
        rankAcross(state, gs, sel.pos).slice(skip, skip + sel.best).forEach((r) => add(r.team));
        continue;
      }
      for (const g of gs) {
        const table = computeTable(state, g);
        if (Array.isArray(sel.pos)) table.slice(sel.pos[0] - 1, sel.pos[1]).forEach((r) => add(r.team));
        else { const r = table[sel.pos === -1 ? table.length - 1 : sel.pos - 1]; if (r) add(r.team); }
      }
    }
    out[key] = ids;
  }
  return out;
}

function advanceStaged(state, comp, round) {
  if (round.stage === 'ko' && round.lastLeg) resolveKoRound(state, round.ko);
  state.current++;
  const stage = comp.stages[state.stage];
  if (round.stage === 'ko' && round.lastLeg) {
    const kr = state.ko.rounds[round.ko];
    if (kr.kind === 'third' && state.stage === comp.stages.length - 1) state.third = state.ties[kr.ties[0]].winner;
    if (kr.kind === 'final' || kr.kind === 'playoff') return completeStage(state, comp);
  }
  if (state.current < state.rounds.length) return state;
  if (stage.kind === 'groups') return completeStage(state, comp);
  nextKoRound(state, stageComp(stage));
  return state;
}

function completeStage(state, comp) {
  const stage = comp.stages[state.stage];
  state.stageOut[stage.id] = stageOutputs(state, stage, state.stage);
  if (state.stage === comp.stages.length - 1) return finishStaged(state, comp);
  state.stage++;
  buildStage(state, comp, stateRng(state), {}, null);
  return state;
}

function finishStaged(state, comp) {
  const ids = (refs) => [...new Set(refs.flatMap((r) => refIds(state, r)))];
  for (const [field, refs] of Object.entries(comp.result || {})) state[field] = ids(refs);
  for (const [field, ref] of Object.entries(comp.scalars || {})) state[field] = refIds(state, ref)[0] || null;
  const lastFinal = [...state.ko.rounds].reverse().find((k) => k.kind === 'final');
  if (comp.championRef) state.champion = refIds(state, comp.championRef)[0];
  else if (lastFinal) state.champion = state.ties[lastFinal.ties[0]].winner;
  if (comp.runnerUpRef) state.runnerUp = refIds(state, comp.runnerUpRef)[0] || null;
  else if (!comp.championRef && lastFinal) state.runnerUp = state.ties[lastFinal.ties[0]].loser;
  if (comp.thirdRef) state.third = refIds(state, comp.thirdRef)[0] || null;
  if (state.tiers) {
    const order = Object.keys(state.tiers);
    const next = Object.fromEntries(order.map((t) => [t, []]));
    order.forEach((tier, i) => {
      for (const id of state.tiers[tier]) {
        let j = i;
        if ((state.promoted || []).includes(id)) j = Math.max(0, i - 1);
        else if ((state.relegated || []).includes(id)) j = Math.min(order.length - 1, i + 1);
        next[order[j]].push(id);
      }
    });
    state.nextTiers = next;
  }
  state.status = 'done';
  state.current = state.rounds.length;
  return state;
}

// ============================================================ round flow
/** Metadata of the current round (or null when done). */
export function currentRound(state) {
  return state.status === 'done' ? null : state.rounds[state.current] || null;
}

/** Fixtures of the current round (played and unplayed). Empty array when finished. */
export function nextFixtures(state) {
  const r = currentRound(state);
  return r ? r.fixtures.map((id) => state.fixtures[id]) : [];
}

function aggregateFor(state, f) {
  if (!f.tie || f.leg < 2) return null;
  const tie = state.ties[f.tie];
  let h = 0, a = 0;
  for (const id of tie.fixtures) {
    const o = state.fixtures[id];
    if (o.id === f.id || o.leg >= f.leg) continue;
    if (o.home === f.home) { h += o.hg; a += o.ag; } else { h += o.ag; a += o.hg; }
  }
  return { home: h, away: a };
}

/** Aggregate (earlier legs only) for a fixture, for a human-played second leg UI. */
export function fixtureAggregate(state, fixtureId) {
  return aggregateFor(state, state.fixtures[fixtureId]);
}

function simulateFixture(state, f) {
  const rng = stateRng(state);
  const res = simulateMatch(getTeam(f.home) || state.teamInfo[f.home], getTeam(f.away) || state.teamInfo[f.away], {
    rng, neutral: !!f.neutral, knockout: !!f.decider, extraTime: f.extraTime !== false,
    aggregate: aggregateFor(state, f) || undefined,
  });
  f.hg = res.hg; f.ag = res.ag; f.et = res.et; f.pens = res.pens; f.scorers = res.scorers; f.played = true;
  f.simulated = true;
  return f;
}

/**
 * Record a human-played result.
 * result: { hg, ag, et?: boolean, pens?: {h,a}|null, scorers?: [{team, player, name, minute, og}] }
 * In a knockout decider that ends level without `pens`, a shootout is simulated on advance().
 */
export function recordResult(state, fixtureId, result) {
  const f = state.fixtures[fixtureId];
  if (!f) throw new Error(`Unknown fixture ${fixtureId}`);
  f.hg = result.hg | 0; f.ag = result.ag | 0;
  f.et = !!result.et; f.pens = result.pens || null; f.scorers = result.scorers || [];
  f.played = true; f.simulated = false;
  return f;
}

/** Simulate every unplayed fixture of the current round except the given ids. */
export function simulateRound(state, exceptFixtureIds = []) {
  const skip = new Set(exceptFixtureIds);
  for (const f of nextFixtures(state)) if (!f.played && !skip.has(f.id)) simulateFixture(state, f);
  return state;
}

/**
 * Move to the next round. All fixtures of the current round must be played.
 * Handles group → knockout, two-legged aggregates, draws, third-place match, champion.
 */
export function advance(state) {
  if (state.status === 'done') return state;
  const comp = getCompetition(state.compId);
  const round = state.rounds[state.current];
  const unplayed = round.fixtures.filter((id) => !state.fixtures[id].played);
  if (unplayed.length) throw new Error(`advance: ${unplayed.length} fixture(s) unplayed in "${round.name}"`);
  if (comp.format === 'staged') return advanceStaged(state, comp, round);

  if (round.stage === 'ko' && round.lastLeg) resolveKoRound(state, round.ko);
  state.current++;
  if (round.stage === 'ko' && round.lastLeg) {
    const kr = state.ko.rounds[round.ko];
    if (kr.kind === 'third') state.third = state.ties[kr.ties[0]].winner;
    if (kr.kind === 'final') return finish(state, state.ties[kr.ties[0]]);
  }
  if (state.current < state.rounds.length) return state;

  if (round.stage === 'league') {
    const table = computeTable(state, state.groups[0]);
    state.champion = table[0].team;
    state.runnerUp = table[1] ? table[1].team : null;
    state.third = table[2] ? table[2].team : null;
    if (comp.relegation) state.relegated = table.slice(-comp.relegation).map((r) => r.team);
    state.status = 'done';
    return state;
  }
  if (round.stage === 'group') {
    buildKoFromGroups(state, comp);
    state.status = 'knockout';
    return state;
  }
  nextKoRound(state, comp);
  return state;
}

function finish(state, finalTie) {
  state.champion = finalTie.winner;
  state.runnerUp = finalTie.loser;
  state.status = 'done';
  state.current = state.rounds.length;
  return state;
}

/** Simulate the whole remaining competition (convenience for "sim to end"). */
export function simulateAll(state) {
  let guard = 0;
  while (state.status !== 'done' && guard++ < 1000) { simulateRound(state); advance(state); }
  return state;
}

// ============================================================ tables
function computeTable(state, group) {
  const comp = getCompetition(state.compId);
  const P = (comp && comp.points) || { win: 3, draw: 1, loss: 0 };
  const rows = {};
  for (const t of group.teams) rows[t] = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] };
  const fx = [];
  for (const r of state.rounds) {
    if (r.stage !== 'league' && r.stage !== 'group') continue;
    for (const id of r.fixtures) {
      const f = state.fixtures[id];
      if (f.played && f.group === group.id) fx.push(f);
    }
  }
  for (const f of fx) {
    const h = rows[f.home], a = rows[f.away];
    h.p++; a.p++; h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.w++; a.l++; h.pts += P.win; a.pts += P.loss; h.form.push('W'); a.form.push('L'); }
    else if (f.hg < f.ag) { a.w++; h.l++; a.pts += P.win; h.pts += P.loss; h.form.push('L'); a.form.push('W'); }
    else { h.d++; a.d++; h.pts += P.draw; a.pts += P.draw; h.form.push('D'); a.form.push('D'); }
  }
  const list = Object.values(rows);
  for (const r of list) { r.gd = r.gf - r.ga; r.form = r.form.slice(-5); }
  const name = (id) => (state.teamInfo[id] ? state.teamInfo[id].name : id);
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
  // Head-to-head among teams level on points, GD and GF; then name.
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i + 1;
    while (j < list.length && list[j].pts === list[i].pts && list[j].gd === list[i].gd && list[j].gf === list[i].gf) j++;
    const cluster = list.slice(i, j);
    if (cluster.length > 1) {
      const ids = new Set(cluster.map((r) => r.team));
      const mini = {};
      for (const r of cluster) mini[r.team] = { pts: 0, gd: 0, gf: 0 };
      for (const f of fx) {
        if (!ids.has(f.home) || !ids.has(f.away)) continue;
        const h = mini[f.home], a = mini[f.away];
        h.gf += f.hg; a.gf += f.ag; h.gd += f.hg - f.ag; a.gd += f.ag - f.hg;
        if (f.hg > f.ag) h.pts += 3; else if (f.hg < f.ag) a.pts += 3; else { h.pts++; a.pts++; }
      }
      cluster.sort((x, y) => mini[y.team].pts - mini[x.team].pts || mini[y.team].gd - mini[x.team].gd
        || mini[y.team].gf - mini[x.team].gf || name(x.team).localeCompare(name(y.team)));
    }
    out.push(...cluster);
    i = j;
  }
  return out;
}

/**
 * Sorted table rows `{ team, p, w, d, l, gf, ga, gd, pts, form }`.
 * League: `standings(state)`. Groups: `standings(state, 'A')`; without a group id a
 * group competition returns `{ A: rows, B: rows, ... }`. Knockout-only comps return [].
 */
export function standings(state, groupId) {
  if (!state.groups.length) return [];
  if (state.type === 'league') return computeTable(state, state.groups[0]);
  if (!groupId) return Object.fromEntries(state.groups.map((g) => [g.id, computeTable(state, g)]));
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) throw new Error(`Unknown group ${groupId}`);
  return computeTable(state, g);
}

/** Top scorers `[{ player, name, team, goals }]` (own goals excluded). */
export function topScorers(state, n = 10) {
  const tally = new Map();
  for (const f of Object.values(state.fixtures)) {
    if (!f.played) continue;
    for (const s of f.scorers || []) {
      if (s.og || !s.player) continue;
      const row = tally.get(s.player) || { player: s.player, name: s.name, team: s.team, goals: 0 };
      row.goals++;
      tally.set(s.player, row);
    }
  }
  return [...tally.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, n);
}

// ============================================================ bracket / paths
function pushPlaceholders(rounds, comp, left, started) {
  const legsFor = (kind, n) => {
    if (kind === 'final') return comp.finalLegs || 1;
    if (kind === 'third') return 1;
    if (comp.semiLegs && n === 4) return comp.semiLegs;
    return comp.koLegs || comp.legs || 1;
  };
  const placeholder = (name, kind, n, teams) => ({ name, kind, legs: legsFor(kind, teams), placeholder: true,
    ties: Array.from({ length: n }, () => ({ id: null, home: null, away: null, legs: [], agg: null, winner: null, decidedBy: null })) });
  // `left` = teams in the next (not yet drawn) round.
  for (let n = left; n >= 2; n /= 2) {
    if (n === 2) {
      if (comp.thirdPlace && (started || left > 2)) rounds.push(placeholder(thirdName(comp), 'third', 1, 2));
      rounds.push(placeholder(koName(comp, 2), 'final', 1, 2));
    } else rounds.push(placeholder(koName(comp, n), 'main', n / 2, n));
  }
}

/**
 * Knockout tree for display:
 * { rounds: [{ name, kind: 'main'|'third'|'final', legs, placeholder?, ties: [{ id, home, away, legs: [fixture
 *   summaries], agg: {home, away}|null, winner, decidedBy }] }] }
 * `home`/`away` are the first-leg home/away team ids (null for undecided future ties).
 */
export function bracket(state) {
  const comp = getCompetition(state.compId);
  const rounds = state.ko.rounds.map((kr) => ({
    name: kr.name, kind: kr.kind, legs: kr.legs,
    ties: kr.ties.map((tid) => {
      const t = state.ties[tid];
      return {
        id: t.id, home: t.a, away: t.b,
        legs: t.fixtures.map((fid) => {
          const f = state.fixtures[fid];
          return { fixtureId: f.id, home: f.home, away: f.away, hg: f.hg, ag: f.ag, played: f.played, et: f.et, pens: f.pens };
        }),
        agg: t.agg && t.legs > 1 ? { home: t.agg.a, away: t.agg.b } : null,
        winner: t.winner, decidedBy: t.decidedBy,
      };
    }),
  }));
  if (state.status === 'done') return { rounds, champion: state.champion };
  const last = state.ko.rounds[state.ko.rounds.length - 1];
  const remaining = (lastKr) => {
    if (!lastKr || lastKr.kind === 'final' || lastKr.kind === 'third' || lastKr.kind === 'playoff') return 0;
    return lastKr.ties.length + (state.ko.byes ? state.ko.byes.length : 0);
  };
  if (comp.format === 'staged') {
    // Placeholders only for the closing knockout stage (e.g. the finals of a full cycle).
    const lastIdx = comp.stages.length - 1;
    const fin = comp.stages[lastIdx];
    if (fin.kind === 'ko') {
      const sc = stageComp(fin);
      let left;
      if (state.stage < lastIdx) left = fin.size || 0;
      else left = last && last.phase === lastIdx ? remaining(last) : 0;
      pushPlaceholders(rounds, sc, left, !!last && last.phase === lastIdx);
    }
  } else if (comp.type !== 'league') {
    const left = last ? remaining(last) : comp.groups * comp.advance + (comp.bestThirds || 0);
    pushPlaceholders(rounds, comp, left, !!last);
  }
  return { rounds, champion: state.champion };
}

/** All fixtures (in round order) involving a team; each copy adds `roundName`. */
export function teamPath(state, teamId) {
  const out = [];
  for (const r of state.rounds) {
    for (const id of r.fixtures) {
      const f = state.fixtures[id];
      if (f.home === teamId || f.away === teamId) out.push({ ...f, roundName: r.name });
    }
  }
  return out;
}

/** Look up a participant snapshot `{ id, name, short, rating, country, confed, colors }`. */
export function teamInfo(state, id) { return state.teamInfo[id]; }

// ============================================================ seasons
export function nextSeasonLabel(label, interval = 1) {
  const m = /^(\d{4})\/(\d{2})$/.exec(label || '');
  if (m) {
    const y = +m[1] + interval;
    return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
  }
  if (/^\d{4}$/.test(label || '')) return String(+label + interval);
  return label;
}

/**
 * Start the next edition of a competition. Leagues keep the same clubs; tiered comps
 * (nations-ladder) start from `nextTiers`. Extra opts (teams, leagueTables, seed, tiers)
 * are passed through to createCompetition.
 *   pyramid  final state of the linked division (comp.tierAbove / comp.tierBelow): applies
 *            promotion & relegation — a top flight drops its `relegated` and takes the other
 *            division's `promoted`; a second tier does the reverse.
 */
export function newSeason(state, opts = {}) {
  const comp = getCompetition(state.compId);
  const { pyramid, ...rest } = opts;
  let teams = comp.type === 'league' ? state.teams.slice() : undefined;
  if (pyramid) teams = pyramidTeams(state, pyramid);
  return createCompetition(state.compId, {
    seed: hashString(`${state.seed}:next`),
    season: nextSeasonLabel(state.season, comp.interval || 1),
    teams,
    ...(state.nextTiers ? { tiers: state.nextTiers } : {}),
    ...rest,
  });
}

function pyramidTeams(state, other) {
  const comp = getCompetition(state.compId);
  if (state.status !== 'done' || other.status !== 'done') throw new Error('pyramid: both divisions must be finished');
  if (comp.tierBelow === other.compId) {
    const down = state.relegated || [];
    return state.teams.filter((t) => !down.includes(t)).concat(other.promoted || []);
  }
  if (comp.tierAbove === other.compId) {
    const up = state.promoted || [];
    return state.teams.filter((t) => !up.includes(t)).concat(other.relegated || []);
  }
  throw new Error(`pyramid: ${state.compId} is not linked to ${other.compId}`);
}

/**
 * Next season for several finished competitions of one career at once (array in, array
 * out, same order). Divisions linked by tierAbove/tierBelow exchange promoted and
 * relegated clubs; everything else behaves like newSeason. `opts` go to every newSeason.
 */
export function newCareerSeason(states, opts = {}) {
  return states.map((st) => {
    const comp = getCompetition(st.compId);
    const partner = states.find((o) => o !== st && (o.compId === comp.tierAbove || o.compId === comp.tierBelow));
    return newSeason(st, { ...opts, ...(partner ? { pyramid: partner } : {}) });
  });
}

// ============================================================ FIFA World Cup cycle helpers
const listStates = (states) => (Array.isArray(states) ? states : Object.values(states));

/**
 * Teams for the Intercontinental Play-off ('wq-playoff') from finished qualifier states
 * (array or { compId: state }): the union of their `playoff` lists (4 teams).
 */
export function worldPlayoffEntrants(states) {
  return [...new Set(listStates(states).filter((s) => s.compId !== 'wq-playoff').flatMap((s) => s.playoff || []))];
}

/**
 * The 32 FIFA World Cup finalists from finished qualifier states (the six wq-* comps
 * plus 'wq-playoff'): the union of their `qualified` lists. Feed it to
 * createCompetition('world-nations', { teams }). ('world-cycle' does all of this in one state.)
 */
export function worldCycleQualified(states) {
  return [...new Set(listStates(states).flatMap((s) => s.qualified || []))];
}

/** Outputs of finished stages of a staged competition: { stageId: { output: ids } }. */
export function stageResults(state) { return state.stageOut || {}; }
