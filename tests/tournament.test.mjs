// Run: node tests/tournament.test.mjs
import assert from 'node:assert/strict';
import { NATIONS, CLUBS, LEAGUES, formations, makeSquad, getTeam, YOUTH_LEVELS, clubsInPool } from '../src/data/teams.js';
import { COMPETITIONS, getCompetition, COMPETITION_CATEGORIES, WORLD_CYCLE_SLOTS } from '../src/data/competitions.js';
import {
  createCompetition, nextFixtures, simulateRound, advance, simulateAll, recordResult, standings,
  topScorers, bracket, teamPath, simulateMatch, newSeason, fixtureAggregate, currentRound,
  newCareerSeason, worldCycleQualified, worldPlayoffEntrants,
} from '../src/tournament.js';

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push([name, e]); console.log(`  FAIL ${name}\n    ${e.message}`); }
}

// ------------------------------------------------------------------ data sanity
test('nation counts per confederation', () => {
  const c = {};
  for (const n of NATIONS) c[n.confed] = (c[n.confed] || 0) + 1;
  assert.ok(c.AFR >= 24 && c.EUR >= 24 && c.SAM === 10 && c.ASI >= 24 && c.NCA >= 16 && c.OCE >= 2, JSON.stringify(c));
});
test('club league sizes, unique ids, distinct kits per league', () => {
  const ids = new Set();
  for (const t of [...NATIONS, ...CLUBS]) { assert.ok(!ids.has(t.id), `dup id ${t.id}`); ids.add(t.id); }
  for (const lg of LEAGUES) {
    const clubs = CLUBS.filter((c) => c.league === lg.id);
    assert.equal(clubs.length, lg.size, lg.id);
    const kits = new Set(clubs.map((c) => `${c.colors.shirt}|${c.colors.shorts}|${c.colors.socks}`));
    assert.equal(kits.size, clubs.length, `duplicate kit in ${lg.id}`);
    const shorts = new Set(clubs.map((c) => c.short));
    assert.equal(shorts.size, clubs.length, `duplicate short code in ${lg.id}`);
  }
});
test('team fields valid', () => {
  for (const t of [...NATIONS, ...CLUBS]) {
    assert.ok(t.rating >= 55 && t.rating <= 90, `${t.id} rating`);
    assert.ok(formations[t.formation], `${t.id} formation`);
    assert.equal(t.short.length, 3, `${t.id} short`);
    for (const k of ['attack', 'defence', 'pace', 'passing']) assert.ok(t.style[k] >= 1 && t.style[k] <= 100);
    for (const c of [t.colors.shirt, t.colors.shorts, t.colors.socks, t.colors.alt.shirt]) assert.match(c, /^#[0-9a-f]{6}$/i);
  }
});
test('formations: 11 slots, one GK at own goal', () => {
  for (const [name, slots] of Object.entries(formations)) {
    assert.equal(slots.length, 11, name);
    assert.equal(slots.filter((s) => s.pos === 'GK').length, 1, name);
    assert.ok(slots[0].pos === 'GK' && slots[0].x <= -0.9 && slots[0].y === 0);
    for (const s of slots) assert.ok(s.x >= -1 && s.x <= 1 && s.y >= -1 && s.y <= 1);
  }
});
test('squads: 23 players, deterministic, unique numbers, ratings near team rating', () => {
  for (const t of [...NATIONS, ...CLUBS]) {
    const s = makeSquad(t);
    assert.equal(s.length, 23);
    assert.equal(new Set(s.map((p) => p.number)).size, 23, `${t.id} numbers`);
    assert.equal(s.filter((p) => p.pos === 'GK').length, 3);
    const avg = s.reduce((a, p) => a + p.rating, 0) / 23;
    assert.ok(Math.abs(avg - t.rating) < 6, `${t.id} avg ${avg}`);
    for (const p of s) assert.ok(p.skinTone >= 0 && p.skinTone <= 1 && p.hairStyle >= 0 && p.hairStyle <= 3);
  }
  assert.deepEqual(makeSquad(getTeam('bra'), 7), makeSquad(getTeam('bra'), 7));
});

// ------------------------------------------------------------------ competition checks
function checkNoSelfOrDupes(st) {
  const seen = new Set();
  for (const f of Object.values(st.fixtures)) {
    assert.notEqual(f.home, f.away, `self-match ${f.id}`);
    const key = `${f.round}|${f.home}|${f.away}|${f.leg}`;
    assert.ok(!seen.has(key), `duplicate fixture ${key}`);
    seen.add(key);
    // A team plays at most once per round
  }
  for (const r of st.rounds) {
    const teams = r.fixtures.flatMap((id) => [st.fixtures[id].home, st.fixtures[id].away]);
    assert.equal(new Set(teams).size, teams.length, `team twice in round ${r.name}`);
  }
}
function checkScorers(st) {
  for (const f of Object.values(st.fixtures)) {
    assert.ok(f.played, `unplayed ${f.id}`);
    if (f.simulated) assert.equal(f.scorers.length, f.hg + f.ag, `scorers mismatch ${f.id}`);
  }
}
function checkTable(rows, gamesEach, label) {
  let pts = 0, decisive = 0, draws = 0;
  for (const r of rows) {
    assert.equal(r.p, gamesEach, `${label}: ${r.team} played ${r.p}, expected ${gamesEach}`);
    assert.equal(r.w + r.d + r.l, r.p);
    assert.equal(r.pts, 3 * r.w + r.d);
    pts += r.pts; decisive += r.w; draws += r.d;
  }
  assert.equal(draws % 2, 0);
  assert.equal(pts, 3 * decisive + draws, `${label}: points sum (3 per win, 1 per team per draw)`);
  assert.equal(rows.reduce((a, r) => a + r.gf, 0), rows.reduce((a, r) => a + r.ga, 0));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].pts >= rows[i].pts, `${label}: sort order`);
}
function checkKnockout(st) {
  const ties = Object.values(st.ties);
  for (const t of ties) {
    assert.ok(t.winner && t.loser && t.winner !== t.loser, `tie ${t.id} unresolved`);
    assert.ok([t.a, t.b].includes(t.winner));
    assert.equal(t.fixtures.length, t.legs);
    if (t.agg.a !== t.agg.b) assert.equal(t.winner, t.agg.a > t.agg.b ? t.a : t.b, `tie ${t.id} winner vs aggregate`);
    else {
      const last = st.fixtures[t.fixtures[t.legs - 1]];
      assert.ok(last.pens, `tie ${t.id} level without penalties`);
      assert.equal(t.decidedBy, 'penalties');
    }
    if (t.legs === 2) {
      const [l1, l2] = t.fixtures.map((id) => st.fixtures[id]);
      assert.equal(l1.home, l2.away);
      assert.equal(l1.away, l2.home);
    }
  }
  const finals = st.ko.rounds.filter((r) => r.kind === 'final');
  assert.equal(finals.length, 1, 'exactly one final');
  assert.equal(finals[0].ties.length, 1);
  assert.equal(st.champion, st.ties[finals[0].ties[0]].winner);
  // Each knockout round halves the field; the champion never lost a tie.
  for (const t of ties) assert.notEqual(t.loser, st.champion);
}

const results = {};
for (const comp of COMPETITIONS) {
  test(`simulate ${comp.id} (${comp.name})`, () => {
    const st = createCompetition(comp.id, { seed: 1234 });
    JSON.parse(JSON.stringify(st)); // serialisable
    simulateAll(st);
    assert.equal(st.status, 'done');
    assert.ok(st.champion && st.teams.includes(st.champion), 'champion set');
    checkNoSelfOrDupes(st);
    checkScorers(st);
    if (comp.type === 'league') {
      const n = st.teams.length;
      const legs = comp.legs === 1 ? 1 : 2;
      const rows = standings(st);
      checkTable(rows, legs * (n - 1), comp.id);
      assert.equal(st.champion, rows[0].team);
      const leagueRounds = st.rounds.filter((r) => r.stage === 'league');
      assert.equal(leagueRounds.length, legs * (n % 2 ? n : n - 1));
      if (!comp.format) assert.equal(st.rounds.length, leagueRounds.length);
      // Each ordered pair exactly once (unordered for single round robin); home/away balanced.
      const pairs = new Set();
      const homes = {};
      for (const f of Object.values(st.fixtures)) {
        if (f.group !== 'L' && st.groups[0].id !== f.group) continue;
        pairs.add(legs === 2 ? `${f.home}>${f.away}` : [f.home, f.away].sort().join('|'));
        homes[f.home] = (homes[f.home] || 0) + 1;
      }
      assert.equal(pairs.size, legs === 2 ? n * (n - 1) : n * (n - 1) / 2);
      if (legs === 2) for (const t of st.teams) assert.equal(homes[t], n - 1, `${t} home games`);
    }
    if (comp.type === 'groups_ko' && !comp.format) {
      assert.equal(st.teams.length, comp.size);
      assert.equal(st.groups.length, comp.groups);
      for (const g of st.groups) {
        assert.equal(g.teams.length, comp.groupSize, `group ${g.id} size`);
        const games = (comp.groupSize - 1) * (comp.groupLegs || 1);
        checkTable(standings(st, g.id), games, `${comp.id} ${g.id}`);
        const pairs = new Set();
        for (const f of Object.values(st.fixtures)) {
          if (f.group !== g.id) continue;
          pairs.add(comp.groupLegs === 2 ? `${f.home}>${f.away}` : [f.home, f.away].sort().join('|'));
        }
        const n = comp.groupSize;
        assert.equal(pairs.size, comp.groupLegs === 2 ? n * (n - 1) : n * (n - 1) / 2, `group ${g.id} pairings`);
        if ([].concat(comp.groupConstraint).includes('country')) {
          const ctry = g.teams.map((t) => st.teamInfo[t].country);
          assert.equal(new Set(ctry).size, ctry.length, `same-country clubs in group ${g.id}`);
        }
        if ([].concat(comp.groupConstraint).includes('confed')) {
          const cnt = {};
          for (const t of g.teams) cnt[st.teamInfo[t].confed] = (cnt[st.teamInfo[t].confed] || 0) + 1;
          for (const [c, k] of Object.entries(cnt)) assert.ok(k <= (c === 'EUR' ? 2 : 1), `confed limit ${g.id}`);
        }
      }
      const firstKo = st.ko.rounds[0];
      const koTeams = firstKo.ties.flatMap((id) => [st.ties[id].a, st.ties[id].b]);
      const expected = comp.groups * comp.advance + (comp.bestThirds || 0);
      assert.equal(new Set(koTeams).size, expected, 'first knockout round size');
      if (comp.bestThirds) {
        assert.equal(st.bestThirds.length, comp.bestThirds);
        for (const t of st.bestThirds) assert.ok(koTeams.includes(t), 'best third in KO');
        if (comp.size === 24) assert.equal(koTeams.length, 16, '24-team format → 16 in R16');
      }
      // No same-group pairing in first knockout round.
      const groupOf = {};
      st.groups.forEach((g) => g.teams.forEach((t) => { groupOf[t] = g.id; }));
      for (const id of firstKo.ties) assert.notEqual(groupOf[st.ties[id].a], groupOf[st.ties[id].b], 'same-group KO tie');
      if (comp.koLegs === 2) assert.ok(Object.values(st.ties).some((t) => t.legs === 2), 'two-legged ties exist');
      if (comp.thirdPlace) assert.ok(st.third, 'third place decided');
      checkKnockout(st);
    }
    if ((comp.type === 'knockout' || comp.type === 'super') && !comp.format) {
      checkKnockout(st);
      // Every team except the champion lost exactly once.
      const thirdTies = new Set(st.ko.rounds.filter((r) => r.kind === 'third').flatMap((r) => r.ties));
      const losers = Object.values(st.ties).filter((t) => !thirdTies.has(t.id)).map((t) => t.loser);
      if (comp.thirdPlace) assert.ok(st.third, 'third place decided');
      assert.equal(new Set(losers).size, losers.length);
      assert.equal(losers.length, st.teams.length - 1);
    }
    results[comp.id] = st;
  });
}

// ------------------------------------------------------------------ behaviours
test('determinism with a seed', () => {
  for (const id of ['alb-league', 'continental-champions', 'world-nations', 'teu-cup']) {
    const a = simulateAll(createCompetition(id, { seed: 99 }));
    const b = simulateAll(createCompetition(id, { seed: 99 }));
    assert.equal(JSON.stringify(a), JSON.stringify(b), id);
  }
  const c = simulateAll(createCompetition('alb-league', { seed: 100 }));
  const d = simulateAll(createCompetition('alb-league', { seed: 99 }));
  assert.notEqual(JSON.stringify(c.fixtures), JSON.stringify(d.fixtures));
  assert.deepEqual(simulateMatch('fra', 'eng', { seed: 5 }), simulateMatch('fra', 'eng', { seed: 5 }));
});
test('state survives JSON round-trip mid-competition', () => {
  let st = createCompetition('european-nations', { seed: 3 });
  for (let i = 0; i < 4; i++) { simulateRound(st); advance(st); st = JSON.parse(JSON.stringify(st)); }
  simulateAll(st);
  assert.equal(st.status, 'done');
});
test('human result recording + level knockout gets a shootout', () => {
  const st = createCompetition('alb-super', { seed: 8 });
  const [f] = nextFixtures(st);
  recordResult(st, f.id, { hg: 1, ag: 1, scorers: [] });
  simulateRound(st, [f.id]);
  advance(st);
  assert.equal(st.status, 'done');
  assert.ok(st.fixtures[f.id].pens);
  assert.ok([f.home, f.away].includes(st.champion));
});
test('simulateRound respects except list; advance refuses unplayed', () => {
  const st = createCompetition('hex-league', { seed: 11 });
  const fx = nextFixtures(st);
  simulateRound(st, [fx[0].id]);
  assert.equal(fx[0].played, false);
  assert.throws(() => advance(st));
  recordResult(st, fx[0].id, { hg: 2, ag: 0 });
  advance(st);
  assert.equal(st.current, 1);
});
test('second-leg aggregate helper', () => {
  const st = createCompetition('continental-champions', { seed: 21 });
  while (!nextFixtures(st)[0].tie || nextFixtures(st)[0].leg !== 2) { simulateRound(st); advance(st); }
  const f = nextFixtures(st)[0];
  const agg = fixtureAggregate(st, f.id);
  assert.ok(Number.isInteger(agg.home) && Number.isInteger(agg.away));
});
test('match sim calibration (~2.6 goals, home advantage)', () => {
  let goals = 0, hw = 0, dr = 0, aw = 0;
  const N = 4000;
  const pool = CLUBS.filter((c) => c.league === 'alb');
  for (let i = 0; i < N; i++) {
    const h = pool[i % 20], a = pool[(i * 7 + 3) % 20];
    if (h === a) continue;
    const r = simulateMatch(h, a, { seed: i });
    goals += r.hg + r.ag;
    if (r.hg > r.ag) hw++; else if (r.hg === r.ag) dr++; else aw++;
  }
  const n = hw + dr + aw;
  const avg = goals / n;
  console.log(`  calibration: ${avg.toFixed(2)} goals/match, home ${(100 * hw / n).toFixed(0)}% draw ${(100 * dr / n).toFixed(0)}% away ${(100 * aw / n).toFixed(0)}%`);
  assert.ok(avg > 2.3 && avg < 3.0, `avg goals ${avg}`);
  assert.ok(hw > aw);
});
test('newSeason keeps league clubs and bumps label', () => {
  const st = results['alb-league'];
  const ns = newSeason(st);
  assert.equal(ns.season, '2027/28');
  assert.deepEqual([...ns.teams].sort(), [...st.teams].sort());
  const wc = newSeason(results['world-nations']);
  assert.equal(wc.season, '2034');
});
test('bracket placeholders before knockout', () => {
  const st = createCompetition('world-nations', { seed: 2 });
  const b = bracket(st);
  assert.deepEqual(b.rounds.map((r) => r.name), ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Third-place play-off', 'Final']);
  assert.equal(b.rounds[0].ties.length, 8);
});

// ------------------------------------------------------------------ new competitions & data
const NEW_IDS = ['alb2-league', 'ibe2-league', 'alb-league-cup', 'club-world', 'asian-club', 'americas-club',
  'wq-eur', 'wq-afr', 'wq-asi', 'wq-nca', 'wq-sam', 'wq-oce', 'wq-playoff', 'world-cycle', 'nations-ladder',
  'meridian-final', 'summer-games', 'youth-nations', 'summer-invitational', 'harbour-trophy'];
const CATS = COMPETITION_CATEGORIES.map((c) => c[0]);
const TYPES = ['league', 'knockout', 'groups_ko', 'super'];
function everyFixtureOnce(st) {
  const seen = new Map();
  for (const r of st.rounds) for (const id of r.fixtures) seen.set(id, (seen.get(id) || 0) + 1);
  assert.equal(seen.size, Object.keys(st.fixtures).length, 'fixture not in any round');
  for (const [id, n] of seen) assert.equal(n, 1, `fixture ${id} in ${n} rounds`);
  for (const f of Object.values(st.fixtures)) assert.ok(f.played && Number.isInteger(f.hg) && Number.isInteger(f.ag), `${f.id} played`);
}
const confOf = (id) => getTeam(id).confed;
const countBy = (ids, fn) => ids.reduce((a, id) => { const k = fn(id); a[k] = (a[k] || 0) + 1; return a; }, {});

test('new competitions registered with category/type, every one simulates once per fixture', () => {
  for (const id of NEW_IDS) {
    const c = getCompetition(id);
    assert.ok(c, id);
    assert.ok(CATS.includes(c.category), `${id} category ${c.category}`);
    assert.ok(TYPES.includes(c.type), `${id} type`);
    const st = results[id];
    assert.ok(st && st.status === 'done' && st.teams.includes(st.champion), `${id} finished`);
    everyFixtureOnce(st);
    if (c.size) assert.equal(st.teams.length, c.size, `${id} team count`);
  }
  for (const c of COMPETITIONS) assert.ok(CATS.includes(c.category), `${c.id} category`);
  assert.equal(new Set(COMPETITIONS.map((c) => c.id)).size, COMPETITIONS.length, 'unique comp ids');
});

test('data: second tiers, extra rest-of-world clubs, youth teams with ages', () => {
  for (const lg of ['alb2', 'ibe2']) {
    const L = LEAGUES.find((l) => l.id === lg);
    assert.ok(L && L.tier === 2 && L.size === 22);
    assert.ok(Math.max(...CLUBS.filter((c) => c.league === lg).map((c) => c.rating))
      < Math.min(...CLUBS.filter((c) => c.league === L.above).map((c) => c.rating)) + 10);
  }
  const row = countBy(clubsInPool('row').map((c) => c.id), confOf);
  assert.ok(row.SAM >= 10 && row.NCA >= 6 && row.ASI >= 16 && row.OCE >= 1, JSON.stringify(row));
  for (const [lvl, L] of Object.entries(YOUTH_LEVELS)) {
    const t = getTeam(`bra-${lvl}`);
    assert.equal(t.rating, getTeam('bra').rating + L.offset);
    assert.equal(t.confed, 'SAM');
    assert.ok(t.name.includes(L.label));
    const sq = makeSquad(t);
    assert.equal(sq.length, 23);
    const inBand = sq.filter((p) => p.age >= L.ages[0] && p.age <= L.ages[1]).length;
    assert.equal(inBand, 23 - L.overage, `${lvl} ages`);
    assert.notDeepEqual(sq.map((p) => p.name), makeSquad('bra').map((p) => p.name));
  }
  for (const p of makeSquad('eng')) assert.ok(p.age >= 17 && p.age <= 37);
  assert.equal(getTeam('xyz-u23'), undefined);
});

test('youth tournaments: youth sides, U-23 medal matches, U-20 24-team format', () => {
  const sg = results['summer-games'];
  assert.ok(sg.teams.every((id) => id.endsWith('-u23') && getTeam(id).youth === 'u23'));
  const names = sg.ko.rounds.map((r) => r.name);
  assert.deepEqual(names.slice(-2), ['Bronze Medal Match', 'Gold Medal Match']);
  assert.ok(sg.third && sg.runnerUp);
  assert.deepEqual(bracket(createCompetition('summer-games', { seed: 4 })).rounds.map((r) => r.name),
    ['Quarter-finals', 'Semi-finals', 'Bronze Medal Match', 'Gold Medal Match']);
  const yn = results['youth-nations'];
  assert.ok(yn.teams.every((id) => id.endsWith('-u20')));
  assert.equal(yn.groups.length, 6);
  assert.equal(yn.ko.rounds[0].ties.length, 8);
});

test('club world championship: 32 clubs, all confederations, neutral groups, single-match KO', () => {
  const st = results['club-world'];
  assert.deepEqual(countBy(st.teams, confOf), { EUR: 12, AFR: 5, SAM: 6, ASI: 4, NCA: 4, OCE: 1 });
  assert.equal(st.groups.length, 8);
  for (const f of Object.values(st.fixtures)) {
    if (f.group) assert.ok(f.neutral);
    else assert.equal(f.leg, 1);
  }
  assert.ok(Object.values(st.ties).every((t) => t.legs === 1));
  assert.deepEqual(st.ko.rounds.map((r) => r.name), ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']);
  for (const id of ['asian-club', 'americas-club']) {
    const s2 = results[id];
    const want = id === 'asian-club' ? { ASI: 16 } : { SAM: 10, NCA: 6 };
    assert.deepEqual(countBy(s2.teams, confOf), want, id);
  }
});

test('World Nations Cup qualifiers: per-confederation slots sum to 32 finalists', () => {
  const qs = ['wq-eur', 'wq-afr', 'wq-asi', 'wq-nca', 'wq-sam', 'wq-oce'].map((id) => results[id]);
  for (const st of qs) {
    const comp = getCompetition(st.compId);
    assert.equal(st.qualified.length, WORLD_CYCLE_SLOTS[comp.confed], `${st.compId} qualified`);
    assert.equal(st.playoff.length, comp.slots.playoff, `${st.compId} playoff`);
    assert.equal(st.teams.length, NATIONS.filter((n) => n.confed === comp.confed).length, `${st.compId} entrants`);
    for (const id of [...st.qualified, ...st.playoff]) assert.equal(confOf(id), comp.confed);
    assert.equal(new Set([...st.qualified, ...st.playoff]).size, st.qualified.length + st.playoff.length);
  }
  // Group winners qualify in Europe; the 5 runners-up chosen are the best of the 7.
  const eur = results['wq-eur'];
  const tables = standings(eur);
  for (const rows of Object.values(tables)) assert.ok(eur.qualified.includes(rows[0].team));
  assert.equal(Object.values(tables).filter((rows) => eur.qualified.includes(rows[1].team)).length, 5);
  for (const rows of Object.values(tables)) for (const r of rows.slice(2)) assert.ok(!eur.qualified.includes(r.team));
  // South America: top 6 of the table, 7th to the play-off.
  const sam = results['wq-sam'];
  const sRows = standings(sam);
  assert.deepEqual(sam.qualified, sRows.slice(0, 6).map((r) => r.team));
  assert.deepEqual(sam.playoff, [sRows[6].team]);
  checkTable(sRows, 18, 'wq-sam');
  // Oceania mini-tournament: 3 single round-robin games + final.
  const oce = results['wq-oce'];
  assert.equal(Object.keys(oce.fixtures).length, 4);
  assert.equal(oce.playoff[0], oce.champion);

  const entrants = worldPlayoffEntrants(qs);
  assert.equal(entrants.length, WORLD_CYCLE_SLOTS.playoffEntrants);
  const po = simulateAll(createCompetition('wq-playoff', { seed: 77, teams: entrants }));
  assert.equal(po.qualified.length, WORLD_CYCLE_SLOTS.playoffWinners);
  assert.ok(po.qualified.every((id) => entrants.includes(id)));
  const finalists = worldCycleQualified([...qs, po]);
  const directSum = ['EUR', 'AFR', 'SAM', 'ASI', 'NCA', 'OCE'].reduce((a, c) => a + WORLD_CYCLE_SLOTS[c], 0);
  assert.equal(directSum + WORLD_CYCLE_SLOTS.playoffWinners, 32);
  assert.equal(finalists.length, 32);
  const wnc = simulateAll(createCompetition('world-nations', { seed: 78, teams: finalists }));
  assert.equal(wnc.status, 'done');
  assert.deepEqual([...wnc.teams].sort(), [...finalists].sort());
  assert.ok(finalists.includes(wnc.champion));
});

test('world-cycle: qualifiers → Oceania final → play-off → 32-team finals in one state', () => {
  const st = results['world-cycle'];
  assert.equal(st.qualified.length, 32);
  assert.equal(st.playoff.length, 4);
  const finalsGroups = st.groups.filter((g) => g.pool === 'WNC');
  assert.equal(finalsGroups.length, 8);
  assert.deepEqual(finalsGroups.flatMap((g) => g.teams).sort(), [...st.qualified].sort());
  for (const g of finalsGroups) checkTable(standings(st, g.id), 3, `cycle ${g.id}`);
  const c = countBy(st.qualified, confOf);
  for (const conf of ['EUR', 'AFR', 'SAM', 'ASI', 'NCA']) assert.ok(c[conf] >= WORLD_CYCLE_SLOTS[conf] && c[conf] <= WORLD_CYCLE_SLOTS[conf] + 1, conf);
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0) - 30, 2);
  // Qualifying group sizes / games per team
  const qGroups = st.groups.filter((g) => g.phase === 0);
  assert.equal(qGroups.reduce((a, g) => a + g.teams.length, 0), st.teams.length);
  for (const g of qGroups) checkTable(standings(st, g.id), (g.teams.length - 1) * g.legs, `cycle ${g.id}`);
  // Knockout: one-off ties; finals have a third-place match; champion is a finalist that never lost.
  const finalKr = st.ko.rounds.filter((r) => r.phase === 4);
  assert.deepEqual(finalKr.map((r) => r.name), ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Third-place play-off', 'Final']);
  assert.equal(st.champion, st.ties[finalKr[4].ties[0]].winner);
  assert.ok(st.third && st.runnerUp);
  for (const kr of finalKr) for (const tid of kr.ties) if (kr.kind !== 'third') assert.notEqual(st.ties[tid].loser, st.champion);
  assert.ok(Object.values(st.ties).every((t) => t.winner && t.legs === 1));
  // Placeholders show the finals bracket before qualifying is over.
  assert.deepEqual(bracket(createCompetition('world-cycle', { seed: 1 })).rounds.map((r) => r.name),
    ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Third-place play-off', 'Final']);
});

test('nations ladder: tiers, finals week, promotion/relegation and next season', () => {
  const st = results['nations-ladder'];
  const comp = getCompetition('nations-ladder');
  for (const [t, n] of Object.entries(comp.tiers)) assert.equal(st.tiers[t].length, n);
  assert.equal(st.groups.length, 4 + 3 + 2);
  for (const g of st.groups) checkTable(standings(st, g.id), 2 * (g.teams.length - 1), g.id);
  const aWinners = st.groups.filter((g) => g.pool === 'A').map((g) => standings(st, g.id)[0].team);
  const sf = st.ko.rounds[0];
  assert.equal(sf.ties.length, 2);
  assert.deepEqual(sf.ties.flatMap((t) => [st.ties[t].a, st.ties[t].b]).sort(), [...aWinners].sort());
  assert.ok(aWinners.includes(st.champion) && st.third);
  assert.equal(st.promoted.length, 4 + 3);
  assert.equal(st.relegated.length, 4 + 3);
  for (const id of st.relegated) assert.ok(!st.tiers.C.includes(id));
  for (const id of st.promoted) assert.ok(!st.tiers.A.includes(id));
  for (const [t, n] of Object.entries(comp.tiers)) assert.equal(st.nextTiers[t].length, n, `next ${t}`);
  const ns = newSeason(st);
  assert.equal(ns.season, '2028/29');
  assert.deepEqual(ns.tiers, st.nextTiers);
  simulateAll(ns);
  assert.equal(ns.status, 'done');
});

test('second tiers: playoff, promotion/relegation lists, career exchange', () => {
  for (const [top, sec] of [['alb-league', 'alb2-league'], ['ibe-league', 'ibe2-league']]) {
    const T1 = results[top], T2 = results[sec];
    const rows1 = standings(T1), rows2 = standings(T2);
    assert.deepEqual(T1.relegated, rows1.slice(-3).map((r) => r.team));
    assert.equal(T2.promoted.length, 3);
    assert.deepEqual(T2.promoted.slice(0, 2), rows2.slice(0, 2).map((r) => r.team));
    const poTeams = rows2.slice(2, 6).map((r) => r.team);
    assert.ok(poTeams.includes(T2.playoffWinner) && T2.promoted[2] === T2.playoffWinner);
    assert.equal(T2.champion, rows2[0].team);
    // Play-off: 3v6 and 4v5 over two legs (lower seed at home first), one-off neutral final.
    const [semis, fin] = T2.ko.rounds;
    assert.equal(semis.legs, 2);
    const pairs = semis.ties.map((t) => [T2.ties[t].a, T2.ties[t].b]);
    assert.deepEqual(pairs, [[poTeams[3], poTeams[0]], [poTeams[2], poTeams[1]]]);
    assert.equal(fin.kind, 'final');
    assert.ok(T2.fixtures[T2.ties[fin.ties[0]].fixtures[0]].neutral);
    for (const t of Object.values(T2.ties)) assert.ok(t.winner && [t.a, t.b].includes(t.winner) && t.fixtures.length === t.legs);
    assert.equal(T2.ties[fin.ties[0]].winner, T2.playoffWinner);
    const [n1, n2] = newCareerSeason([T1, T2], { seed: 5 });
    assert.equal(n1.teams.length, 20);
    assert.equal(n2.teams.length, 22);
    for (const id of T2.promoted) assert.ok(n1.teams.includes(id) && !n2.teams.includes(id));
    for (const id of T1.relegated) assert.ok(n2.teams.includes(id) && !n1.teams.includes(id));
    assert.equal(new Set([...n1.teams, ...n2.teams]).size, 42);
    assert.equal(n1.season, '2027/28');
    assert.throws(() => newSeason(T1, { pyramid: results['pen-league'] }));
  }
});

test('league cup and friendlies formats', () => {
  const lc = results['alb-league-cup'];
  assert.equal(new Set(lc.teams.map((id) => getTeam(id).league)).size, 2);
  const semis = lc.ko.rounds.find((r) => r.name === 'Semi-finals');
  assert.equal(semis.legs, 2);
  assert.ok(lc.ko.rounds.filter((r) => r !== semis).every((r) => r.legs === 1));
  const inv = results['summer-invitational'];
  assert.deepEqual(inv.ko.rounds.map((r) => r.kind), ['main', 'third', 'final']);
  assert.ok(Object.values(inv.fixtures).every((f) => !f.et));
  const tr = results['harbour-trophy'];
  assert.equal(Object.keys(tr.fixtures).length, 3);
  checkTable(standings(tr), 2, 'harbour-trophy');
  const mf = results['meridian-final'];
  assert.deepEqual(countBy(mf.teams, confOf), { EUR: 1, SAM: 1, AFR: 1, ASI: 1 });
});

test('new competitions: determinism, JSON round-trip across stages, generic API mid-run', () => {
  for (const id of ['world-cycle', 'nations-ladder', 'alb2-league', 'club-world', 'summer-games', 'wq-eur']) {
    const a = simulateAll(createCompetition(id, { seed: 31 }));
    const b = simulateAll(createCompetition(id, { seed: 31 }));
    assert.equal(JSON.stringify(a), JSON.stringify(b), id);
  }
  for (const id of ['world-cycle', 'alb2-league', 'nations-ladder', 'wq-oce', 'wq-playoff']) {
    let st = createCompetition(id, { seed: 12 });
    let guard = 0;
    while (st.status !== 'done' && guard++ < 200) {
      assert.ok(currentRound(st) && nextFixtures(st).length, `${id} round`);
      standings(st); bracket(st); topScorers(st, 5);
      simulateRound(st); advance(st);
      st = JSON.parse(JSON.stringify(st));
    }
    assert.equal(st.status, 'done', id);
    const ref = simulateAll(createCompetition(id, { seed: 12 }));
    assert.equal(JSON.stringify(st), JSON.stringify(ref), `${id} round-trip changes nothing`);
    assert.ok(newSeason(st).status !== 'done');
  }
});

// Real competition / club / player names that must never appear (case-insensitive, accents ignored, whole words).
const BLOCKED = [
  // competitions & organisations
  'premier league', 'la liga', 'laliga', 'serie a', 'bundesliga', 'ligue 1', 'eredivisie', 'primeira liga',
  'champions league', 'europa league', 'conference league', 'world cup', 'club world cup', 'nations league',
  'olympic', 'olympics', 'olympic games', 'gold cup', 'confederations cup', 'copa libertadores', 'libertadores',
  'sudamericana', 'copa america', 'recopa', 'asian cup', 'africa cup of nations', 'afcon', 'caf champions league',
  'afc champions league', 'concacaf', 'conmebol', 'uefa', 'fifa', 'caf', 'afc', 'ofc', 'euros', 'euro 2024',
  'fa cup', 'efl', 'carabao', 'league cup', 'community shield', 'copa del rey', 'supercopa de espana', 'dfb',
  'dfl', 'coppa italia', 'supercoppa italiana', 'coupe de france', 'trophee des champions', 'mls', 'j1 league',
  'j.league', 'k league', 'a-league', 'saudi pro league', 'intercontinental cup', 'finalissima', 'toulon',
  'four continents', 'tri nations', 'emirates cup', 'audi cup', 'international champions cup', 'joan gamper',
  'the championship', 'segunda division', 'league one', 'league two',
  // clubs
  'manchester', 'liverpool', 'arsenal', 'chelsea', 'tottenham', 'everton', 'aston villa', 'west ham', 'newcastle',
  'barcelona', 'real madrid', 'atletico madrid', 'sevilla', 'valencia', 'villarreal', 'athletic bilbao',
  'juventus', 'inter milan', 'ac milan', 'internazionale', 'napoli', 'as roma', 'lazio', 'fiorentina', 'atalanta',
  'bayern', 'borussia', 'dortmund', 'leverkusen', 'schalke', 'rb leipzig', 'psg', 'paris saint-germain',
  'olympique de marseille', 'olympique lyonnais', 'monaco', 'ajax', 'psv', 'feyenoord', 'benfica', 'fc porto',
  'sporting cp', 'galatasaray', 'fenerbahce', 'besiktas', 'celtic', 'glasgow rangers', 'olympiacos',
  'panathinaikos', 'boca juniors', 'river plate', 'flamengo', 'fluminense', 'corinthians', 'palmeiras',
  'santos fc', 'gremio', 'penarol', 'club nacional', 'colo-colo', 'independiente', 'club america', 'chivas',
  'la galaxy', 'inter miami', 'seattle sounders', 'al hilal', 'al nassr', 'al ahly', 'zamalek', 'kaizer chiefs',
  'orlando pirates', 'mamelodi sundowns', 'tp mazembe', 'esperance', 'wydad', 'raja casablanca', 'urawa',
  'kashima antlers', 'jeonbuk', 'ulsan', 'persepolis', 'esteghlal', 'auckland city', 'guarani', 'saprissa',
  'central coast mariners', 'sydney fc', 'melbourne victory',
];
const BLOCKED_PLAYERS = ['messi', 'ronaldo', 'neymar', 'mbappe', 'haaland', 'salah', 'kane', 'bellingham',
  'maradona', 'pele', 'zidane', 'beckham', 'modric', 'lewandowski', 'de bruyne', 'vinicius junior', 'cruyff', 'pirlo'];
BLOCKED.push(...BLOCKED_PLAYERS);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
test('no real-world competition / club names (blocked list)', () => {
  const hits = [];
  const names = [
    ...COMPETITIONS.map((c) => `competition ${c.name}`),
    ...LEAGUES.map((l) => `league ${l.name}`),
    ...CLUBS.map((c) => `club ${c.name}`),
  ];
  for (const n of names) {
    const s = ` ${norm(n).replace(/[^a-z0-9.\-]+/g, ' ')} `;
    for (const b of BLOCKED) if (s.includes(` ${b} `)) hits.push(`${n} ~ ${b}`);
  }
  assert.deepEqual(hits, []);
  // Player names of all new clubs / youth sides avoid famous surnames too.
  const newTeams = [...CLUBS.filter((c) => ['alb2', 'ibe2'].includes(c.league) || (c.pool === 'row' && !['EUR', 'AFR'].includes(c.confed))),
    ...NATIONS.map((n) => getTeam(`${n.id}-u23`)), ...NATIONS.map((n) => getTeam(`${n.id}-u20`))];
  for (const t of newTeams) {
    for (const p of makeSquad(t)) {
      const s = ` ${norm(p.name)} `;
      for (const b of BLOCKED_PLAYERS) assert.ok(!s.includes(` ${b} `), `${t.name}: ${p.name}`);
    }
  }
});

// ------------------------------------------------------------------ sample output
const nameOf = (st, id) => st.teamInfo[id].name;
if (results['alb-league']) {
  const st = results['alb-league'];
  console.log(`\n${st.name} ${st.season} — final top 5:`);
  for (const [i, r] of standings(st).slice(0, 5).entries()) {
    console.log(`  ${i + 1}. ${nameOf(st, r.team).padEnd(22)} P${r.p} W${r.w} D${r.d} L${r.l} GF${r.gf} GA${r.ga} GD${r.gd >= 0 ? '+' : ''}${r.gd} ${r.pts} pts  form ${r.form.join('')}`);
  }
  const ts = topScorers(st, 3);
  console.log('  Top scorers: ' + ts.map((s) => `${s.name} (${nameOf(st, s.team)}) ${s.goals}`).join(', '));
}
if (results['continental-champions']) {
  const st = results['continental-champions'];
  console.log(`\n${st.name} — champion's path: ${nameOf(st, st.champion)}`);
  for (const f of teamPath(st, st.champion)) {
    if (f.group) continue;
    const extra = (f.et ? ' aet' : '') + (f.pens ? ` (pens ${f.pens.h}-${f.pens.a})` : '');
    console.log(`  ${f.roundName.padEnd(26)} ${nameOf(st, f.home)} ${f.hg}-${f.ag} ${nameOf(st, f.away)}${extra}`);
  }
}
if (results['world-nations']) {
  const st = results['world-nations'];
  const b = bracket(st);
  console.log(`\n${st.name} ${st.season} bracket (final rounds):`);
  for (const r of b.rounds.slice(-4)) {
    console.log(`  ${r.name}: ` + r.ties.map((t) => `${st.teamInfo[t.home].short} ${t.legs[0].hg}-${t.legs[0].ag} ${st.teamInfo[t.away].short}${t.legs[0].pens ? ` p${t.legs[0].pens.h}-${t.legs[0].pens.a}` : ''}`).join(' | '));
  }
  console.log(`  Champion: ${nameOf(st, st.champion)}, runner-up: ${nameOf(st, st.runnerUp)}, third: ${nameOf(st, st.third)}`);
}

console.log(`\n${passed} passed, ${failed} failed (${COMPETITIONS.length} competitions simulated)`);
if (failed) { for (const [n, e] of failures) console.error(`\n${n}\n${e.stack}`); process.exit(1); }
