// Pitch Clash — competition definitions (pure data). All competition names are
// original; the formats mirror familiar real-world structures.
//
// Competition `type`s understood by tournament.js:
//   'league'      round-robin table (legs: 1|2)
//   'knockout'    single-elimination cup with random draw each round (byes for
//                 the top seeds when the field is not a power of two)
//   'groups_ko'   group stage then knockout bracket
//   'super'       one-off match between two named teams
//
// Qualification rules (`qualify`, evaluated in order, duplicates skipped):
//   { from: 'league', league, pos: [first, last] }   finishing positions (or by rating if no table supplied)
//   { from: 'pool', pool, confed?, country?, skip?, count } best-rated clubs from a club pool / league
//   { from: 'confed', confed, count }                 best-rated nations of a confederation
//   { from: 'invite', confeds: [...], count }         best-rated nations from guest confederations
//   { from: 'quotas', quotas: {CONF: n}, playoff: { confeds, count } }  World-style quotas;
//                                                     playoff slots go to the best-rated leftovers
//   ('confed' also accepts `skip`; a competition with `youth: 'u23'|'u20'` maps every
//   nation id to its youth side, e.g. 'bra' → 'bra-u23'.)
//
// `category`: 'domestic' | 'continental' | 'international' | 'youth' | 'friendly'
// (see COMPETITION_CATEGORIES for menu labels).
//
// ---------------------------------------------------------------- staged formats
// Competitions with `format: 'staged'` keep a `type` from the set above (so menus can
// show a table for 'league', group tables + bracket for 'groups_ko', a bracket for
// 'knockout') but are run as a list of `stages`, each built when the previous one ends:
//
//   { id, kind: 'groups', name, pools: [pool, ...], outputs }
//       pool: { id, name, sizes: [groupSize, ...], legs: 1|2, neutral?, entrants,
//               groupPrefix?, numbered?, groupId? (single-group pools),
//               draw?: 'pots' (default; seeded pots, sizes may differ by one) |
//                      'constrained' (equal sizes; groupConstraint / confedLimit honoured) }
//       All groups of all pools play their matchdays side by side.
//   { id, kind: 'ko', name, entrants, legs, finalLegs, finalNeutral?, neutral?, thirdPlace?,
//     extraTime?, single? (one round only: kind 'playoff', every tie winner advances),
//     pairing?: 'random' | 'positions' (1st v last, lower seed at home first),
//     roundName?, roundPrefix?, roundNames?: { third, final }, outputs }
//       entrants { groupsOf: stageId } draws the knockout from that stage's groups
//       (advance / bestThirds / firstKo / koDraw / koConstraint as for 'groups_ko').
//
//   entrants: { qualify: [rules] } | { tier: 'A' } | ['stageId.output', ...]
//   outputs:  { name: [selector, ...] } evaluated when the stage ends
//       groups selectors: { pool?, pos: n | -1 (last) | [from, to] }
//                         { pool?, pos: n, best: k, skip? }  best k n-placed teams across the
//                         pool's groups (results against teams below the smallest group size
//                         are ignored, as in real qualifying)
//       ko selectors:     { ko: 'winners' | 'champion' | 'runnerUp' }
//   result:      { field: ['stageId.output', ...] } copied onto the final state
//                (e.g. qualified, playoff, promoted, relegated)
//   championRef / runnerUpRef / thirdRef: 'stageId.output' (first id); otherwise the final
//                of the last knockout stage decides.
//   scalars:     { field: 'stageId.output' } single ids copied onto the final state.
//   tiers:       { A: n, B: n, ... } tiered nations (state.tiers); final state gets
//                `nextTiers` after promotion / relegation, used by newSeason.

const CLUB_SEASON = '2026/27';

const POINTS = { win: 3, draw: 1, loss: 0 };
const TIEBREAK = ['points', 'goalDifference', 'goalsFor', 'headToHead', 'name'];

// ------------------------------------------------------------ domestic
const DOMESTIC = [
  { league: 'alb', country: 'eng', league_name: 'English Premier League', lshort: 'EPL',
    cup: 'FA Cup', cshort: 'FAC', sup: 'FA Community Shield', sshort: 'FACS', below: 'alb2' },
  { league: 'ibe', country: 'esp', league_name: 'Spanish La Liga', lshort: 'LAL',
    cup: 'Copa del Rey', cshort: 'CDR', sup: 'Supercopa de España', sshort: 'SCE', below: 'ibe2' },
  { league: 'pen', country: 'ita', league_name: 'Italian Serie A', lshort: 'SEA',
    cup: 'Coppa Italia', cshort: 'CIT', sup: 'Supercoppa Italiana', sshort: 'SCI' },
  { league: 'teu', country: 'ger', league_name: 'German Bundesliga', lshort: 'BUN',
    cup: 'DFB-Pokal', cshort: 'DFB', sup: 'Franz Beckenbauer Supercup', sshort: 'FBS' },
  { league: 'hex', country: 'fra', league_name: 'French Ligue 1', lshort: 'L1',
    cup: 'Coupe de France', cshort: 'CDF', sup: 'Trophée des Champions', sshort: 'TDC' },
  { league: 'afr', country: null, league_name: 'African Super League', lshort: 'ASL',
    cup: 'African Super Shield', cshort: 'ASS', sup: 'African Super Cup', sshort: 'ASC' },
  { league: 'low', country: 'ned', league_name: 'Dutch Eredivisie', lshort: 'ERE', cup: 'KNVB Cup', cshort: 'KNV', sup: 'Johan Cruyff Shield', sshort: 'JCS' },
  { league: 'lus', country: 'por', league_name: 'Portuguese Primeira Liga', lshort: 'PLP', cup: 'Taça de Portugal', cshort: 'TDP', sup: 'Supertaça de Portugal', sshort: 'SDP' },
  { league: 'ana', country: 'tur', league_name: 'Turkish Süper Lig', lshort: 'TSL', cup: 'Turkish Cup', cshort: 'TKU', sup: 'Turkish Super Cup', sshort: 'TSK' },
  { league: 'cal', country: 'sco', league_name: 'Scottish Premiership', lshort: 'SPM', cup: 'Scottish Cup', cshort: 'SCU', sup: 'Scottish League Cup', sshort: 'SLC' },
  { league: 'bsr', country: 'bra', league_name: 'Brazilian Brasileirão Série A', lshort: 'BRA',
    cup: 'Copa do Brasil', cshort: 'CDB', sup: 'Supercopa do Brasil', sshort: 'SDB' },
  { league: 'pla', country: 'arg', league_name: 'Argentine Liga Profesional', lshort: 'LPA', cup: 'Copa Argentina', cshort: 'CAR', sup: 'Supercopa Argentina', sshort: 'SAR' },
  { league: 'cam', country: 'usa', league_name: 'American Major League Soccer', lshort: 'MLS', cup: 'U.S. Open Cup', cshort: 'USO', sup: 'MLS Supporters Shield', sshort: 'MSS' },
  { league: 'gul', country: 'ksa', league_name: 'Saudi Pro League', lshort: 'SPL', cup: 'King Cup', cshort: 'KCU', sup: 'Saudi Super Cup', sshort: 'SSC' },
];

const domesticComps = [];
for (const d of DOMESTIC) {
  domesticComps.push({
    id: `${d.league}-league`, name: d.league_name, short: d.lshort, type: 'league', scope: 'club',
    category: 'domestic', league: d.league, country: d.country, legs: 2,
    points: POINTS, tiebreakers: TIEBREAK, defaultSeason: CLUB_SEASON,
    qualify: [{ from: 'pool', pool: d.league, count: 99 }],
    // Top flights with a second tier: bottom 3 go down (state.relegated).
    ...(d.below ? { relegation: 3, tierBelow: `${d.below}-league` } : {}),
  });
  domesticComps.push({
    id: `${d.league}-cup`, name: d.cup, short: d.cshort, type: 'knockout', scope: 'club',
    category: 'domestic', league: d.league, country: d.country, legs: 1, finalLegs: 1, finalNeutral: true,
    draw: 'random', defaultSeason: CLUB_SEASON,
    qualify: [{ from: 'pool', pool: d.league, count: 99 }],
  });
  domesticComps.push({
    id: `${d.league}-super`, name: d.sup, short: d.sshort, type: 'super', scope: 'club',
    category: 'domestic', league: d.league, country: d.country, neutral: true, extraTime: false,
    defaultSeason: CLUB_SEASON,
    // Pass opts.teams = [leagueChampionId, cupWinnerId]; defaults to the two best-rated clubs.
    participants: ['league champion', 'cup winner'],
    qualify: [{ from: 'pool', pool: d.league, count: 2 }],
  });
}

// ------------------------------------------------------------ continental clubs
const continentalComps = [
  {
    id: 'continental-champions', name: 'UEFA Champions League', short: 'UCL', type: 'groups_ko', scope: 'club',
    category: 'continental', confed: 'EUR', defaultSeason: CLUB_SEASON,
    groups: 8, groupSize: 4, groupLegs: 2, advance: 2, bestThirds: 0,
    koLegs: 2, finalLegs: 1, finalNeutral: true, thirdPlace: false,
    firstKo: 'seeded',       // winners vs runners-up, drawn
    koDraw: 'random',        // QF/SF drawn openly
    groupConstraint: 'country', koConstraint: ['group', 'country'],
    points: POINTS, tiebreakers: TIEBREAK,
    qualify: [
      { from: 'league', league: 'alb', pos: [1, 4] },
      { from: 'league', league: 'ibe', pos: [1, 4] },
      { from: 'league', league: 'pen', pos: [1, 4] },
      { from: 'league', league: 'teu', pos: [1, 4] },
      { from: 'league', league: 'hex', pos: [1, 3] },
      { from: 'pool', pool: 'row', confed: 'EUR', count: 13 },
    ],
    size: 32,
  },
  {
    id: 'continental-shield', name: 'UEFA Europa League', short: 'UEL', type: 'groups_ko', scope: 'club',
    category: 'continental', confed: 'EUR', defaultSeason: CLUB_SEASON,
    groups: 4, groupSize: 4, groupLegs: 2, advance: 2, bestThirds: 0,
    koLegs: 2, finalLegs: 1, finalNeutral: true, thirdPlace: false,
    firstKo: 'seeded', koDraw: 'random',
    groupConstraint: 'country', koConstraint: ['group', 'country'],
    points: POINTS, tiebreakers: TIEBREAK,
    qualify: [
      { from: 'league', league: 'alb', pos: [5, 7] },
      { from: 'league', league: 'ibe', pos: [5, 7] },
      { from: 'league', league: 'pen', pos: [5, 7] },
      { from: 'league', league: 'teu', pos: [5, 7] },
      { from: 'league', league: 'hex', pos: [4, 5] },
      { from: 'pool', pool: 'row', confed: 'EUR', count: 2, skip: 13 },
    ],
    size: 16,
  },
  {
    id: 'african-champions', name: 'CAF Champions League', short: 'CAF', type: 'groups_ko', scope: 'club',
    category: 'continental', confed: 'AFR', defaultSeason: CLUB_SEASON,
    groups: 4, groupSize: 4, groupLegs: 2, advance: 2, bestThirds: 0,
    koLegs: 2, finalLegs: 1, finalNeutral: true, thirdPlace: false,
    firstKo: 'seeded', koDraw: 'random',
    groupConstraint: 'country', koConstraint: ['group', 'country'],
    points: POINTS, tiebreakers: TIEBREAK,
    qualify: [
      { from: 'league', league: 'afr', pos: [1, 10] },
      { from: 'pool', pool: 'row', confed: 'AFR', count: 6 },
    ],
    size: 16,
  },
  {
    id: 'continental-super', name: 'UEFA Super Cup', short: 'USC', type: 'super', scope: 'club',
    category: 'continental', neutral: true, extraTime: true, defaultSeason: CLUB_SEASON,
    participants: ['UEFA Champions League winner', 'UEFA Europa League winner'],
    qualify: [
      { from: 'league', league: 'ibe', pos: [1, 1] },
      { from: 'league', league: 'alb', pos: [1, 1] },
    ],
  },
];

// ------------------------------------------------------------ nations
const NATION_KO = { points: POINTS, tiebreakers: TIEBREAK, neutral: true, groupLegs: 1, groupSize: 4, finalLegs: 1 };
const nationComps = [
  {
    ...NATION_KO, id: 'african-nations', name: 'Africa Cup of Nations', short: 'AFCON', type: 'groups_ko',
    scope: 'nation', category: 'international', confed: 'AFR', defaultSeason: '2027', interval: 2,
    groups: 6, advance: 2, bestThirds: 4, koLegs: 1, thirdPlace: true, firstKo: 'seeded', koDraw: 'bracket',
    koConstraint: ['group'],
    qualify: [{ from: 'confed', confed: 'AFR', count: 24 }], size: 24,
  },
  {
    ...NATION_KO, id: 'european-nations', name: 'UEFA European Championship', short: 'EURO', type: 'groups_ko',
    scope: 'nation', category: 'international', confed: 'EUR', defaultSeason: '2028', interval: 4,
    groups: 6, advance: 2, bestThirds: 4, koLegs: 1, thirdPlace: false, firstKo: 'seeded', koDraw: 'bracket',
    koConstraint: ['group'],
    qualify: [{ from: 'confed', confed: 'EUR', count: 24 }], size: 24,
  },
  {
    ...NATION_KO, id: 'south-american-nations', name: 'Copa América', short: 'COPA', type: 'groups_ko',
    scope: 'nation', category: 'international', confed: 'SAM', defaultSeason: '2028', interval: 4,
    // 10 South American nations + 2 invited guests: 3 groups of 4, top 2 + 2 best thirds → QF.
    groups: 3, advance: 2, bestThirds: 2, koLegs: 1, thirdPlace: true, firstKo: 'seeded', koDraw: 'bracket',
    koConstraint: ['group'],
    qualify: [{ from: 'confed', confed: 'SAM', count: 10 }, { from: 'invite', confeds: ['NCA', 'ASI'], count: 2 }],
    size: 12,
  },
  {
    ...NATION_KO, id: 'asian-nations', name: 'AFC Asian Cup', short: 'AAC', type: 'groups_ko',
    scope: 'nation', category: 'international', confed: 'ASI', defaultSeason: '2027', interval: 4,
    groups: 6, advance: 2, bestThirds: 4, koLegs: 1, thirdPlace: false, firstKo: 'seeded', koDraw: 'bracket',
    koConstraint: ['group'],
    qualify: [{ from: 'confed', confed: 'ASI', count: 24 }], size: 24,
  },
  {
    ...NATION_KO, id: 'north-american-nations', name: 'CONCACAF Gold Cup', short: 'GOLD', type: 'groups_ko',
    scope: 'nation', category: 'international', confed: 'NCA', defaultSeason: '2027', interval: 2,
    groups: 4, advance: 2, bestThirds: 0, koLegs: 1, thirdPlace: false, firstKo: 'bracket', koDraw: 'bracket',
    koConstraint: ['group'],
    qualify: [{ from: 'confed', confed: 'NCA', count: 16 }], size: 16,
  },
  {
    ...NATION_KO, id: 'world-nations', name: 'FIFA World Cup', short: 'WC', type: 'groups_ko',
    scope: 'nation', category: 'international', confed: null, defaultSeason: '2030', interval: 4,
    groups: 8, advance: 2, bestThirds: 0, koLegs: 1, thirdPlace: true, firstKo: 'bracket', koDraw: 'bracket',
    groupConstraint: 'confed', confedLimit: { EUR: 2, default: 1 }, koConstraint: ['group'],
    qualify: [{
      from: 'quotas', quotas: { EUR: 13, AFR: 5, SAM: 5, ASI: 4, NCA: 4 },
      playoff: { confeds: ['ASI', 'NCA', 'OCE', 'AFR'], count: 1 },
    }],
    size: 32,
  },
];

// ------------------------------------------------------------ second tiers + league cup
// 22 clubs, home & away; top 2 promoted automatically, 3rd–6th play a promotion play-off
// (two-legged semis 3v6 / 4v5, one-off final at a neutral ground). The winner is promoted too.
const SECOND_TIERS = [
  { league: 'alb2', above: 'alb', country: 'eng', name: 'English Championship', short: 'CHA' },
  { league: 'ibe2', above: 'ibe', country: 'esp', name: 'Spanish Segunda División', short: 'SEG' },
];
for (const t of SECOND_TIERS) {
  domesticComps.push({
    id: `${t.league}-league`, name: t.name, short: t.short, type: 'league', format: 'staged', scope: 'club',
    category: 'domestic', league: t.league, country: t.country, legs: 2, tier: 2, tierAbove: `${t.above}-league`,
    points: POINTS, tiebreakers: TIEBREAK, defaultSeason: CLUB_SEASON, size: 22,
    promotion: { automatic: 2, playoff: 4 },
    stages: [
      {
        id: 'league', kind: 'groups', name: t.name,
        pools: [{ id: 'L', groupId: 'L', name: t.name, legs: 2, entrants: { qualify: [{ from: 'pool', pool: t.league, count: 99 }] } }],
        outputs: {
          first: [{ pos: 1 }], second: [{ pos: 2 }], third: [{ pos: 3 }],
          auto: [{ pos: [1, 2] }], playoff: [{ pos: [3, 6] }],
        },
      },
      {
        id: 'po', kind: 'ko', name: 'Promotion Play-offs', entrants: ['league.playoff'], pairing: 'positions', size: 4,
        legs: 2, finalLegs: 1, finalNeutral: true, roundPrefix: 'Play-off ', outputs: { champion: [{ ko: 'champion' }] },
      },
    ],
    result: { promoted: ['league.auto', 'po.champion'], relegated: [] },
    championRef: 'league.first', runnerUpRef: 'league.second', thirdRef: 'league.third',
    scalars: { playoffWinner: 'po.champion' },
  });
}
domesticComps.push({
  id: 'alb-league-cup', name: 'EFL Cup', short: 'EFL', type: 'knockout', scope: 'club',
  category: 'domestic', league: 'alb', country: 'eng', legs: 1, semiLegs: 2, finalLegs: 1, finalNeutral: true,
  draw: 'random', defaultSeason: CLUB_SEASON, size: 42,
  // Both English divisions; the top-rated clubs get byes through the preliminary round.
  qualify: [{ from: 'pool', pool: 'alb', count: 99 }, { from: 'pool', pool: 'alb2', count: 99 }],
});

// ------------------------------------------------------------ more club cups
const CLUB_GROUPS = { points: POINTS, tiebreakers: TIEBREAK, groupSize: 4, advance: 2, bestThirds: 0 };
continentalComps.push(
  {
    ...CLUB_GROUPS, id: 'club-world', name: 'FIFA Club World Cup', short: 'CWC', type: 'groups_ko', scope: 'club',
    category: 'continental', confed: null, defaultSeason: '2029', interval: 4,
    // 32 clubs from every confederation at one host: 8 groups of 4 (single round robin,
    // neutral venues), then single-match knockouts with extra time and penalties.
    groups: 8, groupLegs: 1, neutral: true, koLegs: 1, finalLegs: 1, thirdPlace: false,
    firstKo: 'bracket', koDraw: 'bracket', extraTime: true,
    groupConstraint: ['confed', 'country'], confedLimit: { EUR: 2, default: 1 }, koConstraint: ['group'],
    qualify: [
      { from: 'league', league: 'alb', pos: [1, 3] },
      { from: 'league', league: 'ibe', pos: [1, 3] },
      { from: 'league', league: 'pen', pos: [1, 2] },
      { from: 'league', league: 'teu', pos: [1, 2] },
      { from: 'league', league: 'hex', pos: [1, 1] },
      { from: 'pool', pool: 'row', confed: 'EUR', count: 1 },
      { from: 'league', league: 'afr', pos: [1, 3] },
      { from: 'pool', pool: 'row', confed: 'AFR', count: 2 },
      { from: 'pool', pool: 'row', confed: 'SAM', count: 6 },
      { from: 'pool', pool: 'row', confed: 'ASI', count: 4 },
      { from: 'pool', pool: 'row', confed: 'NCA', count: 4 },
      { from: 'pool', pool: 'row', confed: 'OCE', count: 1 },
    ],
    size: 32,
  },
  {
    ...CLUB_GROUPS, id: 'asian-club', name: 'AFC Champions League', short: 'ACL', type: 'groups_ko', scope: 'club',
    category: 'continental', confed: 'ASI', defaultSeason: CLUB_SEASON,
    groups: 4, groupLegs: 2, koLegs: 2, finalLegs: 1, finalNeutral: true, thirdPlace: false,
    firstKo: 'seeded', koDraw: 'random', groupConstraint: 'country', koConstraint: ['group', 'country'],
    qualify: [
      { from: 'pool', pool: 'row', country: 'jpn', count: 2 },
      { from: 'pool', pool: 'row', country: 'kor', count: 2 },
      { from: 'pool', pool: 'row', country: 'ksa', count: 1 },
      { from: 'pool', pool: 'row', country: 'irn', count: 2 },
      { from: 'pool', pool: 'row', country: 'qat', count: 2 },
      { from: 'pool', pool: 'row', country: 'uae', count: 2 },
      { from: 'pool', pool: 'row', country: 'aus', count: 1 },
      { from: 'pool', pool: 'row', country: 'tha', count: 1 },
      { from: 'pool', pool: 'row', country: 'mas', count: 1 },
      { from: 'pool', pool: 'row', country: 'nzl', count: 1 },
      { from: 'pool', pool: 'row', country: 'fij', count: 1 },
    ],
    size: 16,
  },
  {
    ...CLUB_GROUPS, id: 'americas-club', name: 'Copa Libertadores', short: 'LIB', type: 'groups_ko', scope: 'club',
    category: 'continental', confed: null, confeds: ['SAM', 'NCA'], defaultSeason: CLUB_SEASON,
    groups: 4, groupLegs: 2, koLegs: 2, finalLegs: 1, finalNeutral: true, thirdPlace: false,
    firstKo: 'seeded', koDraw: 'random', groupConstraint: 'country', koConstraint: ['group', 'country'],
    qualify: [
      { from: 'pool', pool: 'row', country: 'uru', count: 2 },
      { from: 'pool', pool: 'row', country: 'chi', count: 1 },
      { from: 'pool', pool: 'row', country: 'par', count: 2 },
      { from: 'pool', pool: 'row', country: 'ecu', count: 2 },
      { from: 'pool', pool: 'row', country: 'per', count: 2 },
      { from: 'pool', pool: 'row', country: 'bol', count: 1 },
      { from: 'pool', pool: 'row', country: 'mex', count: 3 },
      { from: 'pool', pool: 'row', country: 'crc', count: 2 },
      { from: 'pool', pool: 'row', country: 'hon', count: 1 },
    ],
    size: 16,
  },
);

// ------------------------------------------------------------ FIFA World Cup qualifying
// Slots for a qualified 32-team finals: EUR 12, AFR 5, SAM 6, ASI 4, NCA 3 = 30 direct,
// plus 2 from the Intercontinental Play-off (SAM 7th, ASI best runner-up, NCA second-best
// runner-up, Oceania champion; two one-off ties). Every pool plays home & away except
// Oceania's mini-tournament (single round robin at one venue, then a final).
export const WORLD_CYCLE_SLOTS = { EUR: 12, AFR: 5, SAM: 6, ASI: 4, NCA: 3, OCE: 0, playoffEntrants: 4, playoffWinners: 2 };
const WQ = {
  EUR: { name: 'Europe', short: 'WQE', sizes: [5, 4, 4, 4, 4, 4, 4],
    direct: [{ pos: 1 }, { pos: 2, best: 5 }], playoff: [],
    format: '7 groups (one of 5, six of 4), home & away; 7 group winners + 5 best runners-up qualify' },
  AFR: { name: 'Africa', short: 'WQA', sizes: [8, 7, 7, 7],
    direct: [{ pos: 1 }, { pos: 2, best: 1 }], playoff: [],
    format: '4 groups (one of 8, three of 7), home & away; 4 group winners + best runner-up qualify' },
  ASI: { name: 'Asia', short: 'WQS', sizes: [7, 6, 6, 6],
    direct: [{ pos: 1 }], playoff: [{ pos: 2, best: 1 }],
    format: '4 groups (one of 7, three of 6), home & away; group winners qualify, best runner-up to the play-off' },
  NCA: { name: 'North & Central America', short: 'WQN', sizes: [8, 8],
    direct: [{ pos: 1 }, { pos: 2, best: 1 }], playoff: [{ pos: 2, best: 1, skip: 1 }],
    format: '2 groups of 8, home & away; winners + best runner-up qualify, other runner-up to the play-off' },
  SAM: { name: 'South America', short: 'WQM', sizes: [10],
    direct: [{ pos: [1, 6] }], playoff: [{ pos: 7 }],
    format: 'one league of 10, home & away; top 6 qualify, 7th to the play-off' },
  OCE: { name: 'Oceania', short: 'WQO', sizes: [3], legs: 1, neutral: true,
    direct: [], playoff: [],
    format: 'mini-tournament: single round robin at one venue, top 2 play a final; winner to the play-off' },
};
const withPool = (sels, pool) => sels.map((s) => ({ ...s, pool }));
function wqPool(conf, prefixed) {
  const q = WQ[conf];
  const single = q.sizes.length === 1;
  return {
    id: conf, name: q.name, sizes: q.sizes, legs: q.legs || 2, neutral: !!q.neutral,
    groupPrefix: prefixed ? `${conf}-` : '', ...(single ? { groupId: prefixed ? conf : 'L' } : {}),
    entrants: { qualify: [{ from: 'confed', confed: conf, count: 99 }] },
  };
}
const NATION_BASE = { points: POINTS, tiebreakers: TIEBREAK, scope: 'nation' };
const qualifierComps = [];
for (const conf of ['EUR', 'AFR', 'ASI', 'NCA', 'SAM', 'OCE']) {
  const q = WQ[conf];
  const total = q.sizes.reduce((a, b) => a + b, 0);
  const base = {
    ...NATION_BASE, id: `wq-${conf.toLowerCase()}`, name: `FIFA World Cup Qualifying – ${q.name}`, short: q.short,
    format: 'staged', category: 'international', confed: conf, defaultSeason: '2029', interval: 4,
    feeds: 'world-nations', slots: { direct: WORLD_CYCLE_SLOTS[conf], playoff: conf === 'EUR' || conf === 'AFR' ? 0 : 1 },
    description: q.format, size: total,
  };
  if (conf === 'OCE') {
    qualifierComps.push({
      ...base, type: 'groups_ko',
      stages: [
        { id: 'q', kind: 'groups', name: 'Oceania Qualifying', pools: [wqPool(conf, false)],
          outputs: { top2: [{ pos: [1, 2] }] } },
        { id: 'f', kind: 'ko', name: 'Oceania Qualifying Final', roundName: 'Oceania Qualifying Final',
          entrants: ['q.top2'], legs: 1, finalLegs: 1, neutral: true, outputs: { winner: [{ ko: 'champion' }] } },
      ],
      result: { qualified: [], playoff: ['f.winner'] },
    });
    continue;
  }
  qualifierComps.push({
    ...base, type: conf === 'SAM' ? 'league' : 'groups_ko', legs: 2,
    stages: [{
      id: 'q', kind: 'groups', name: 'Qualifying', pools: [wqPool(conf, false)],
      outputs: {
        qualified: withPool(q.direct, conf), playoff: withPool(q.playoff, conf),
        top: [{ pool: conf, pos: 1, best: 1 }], second: conf === 'SAM' ? [{ pos: 2 }] : [],
      },
    }],
    result: { qualified: ['q.qualified'], playoff: ['q.playoff'] },
    championRef: 'q.top', ...(conf === 'SAM' ? { runnerUpRef: 'q.second' } : {}),
  });
}
qualifierComps.push({
  ...NATION_BASE, id: 'wq-playoff', name: 'FIFA World Cup Intercontinental Play-off', short: 'WQP',
  type: 'knockout', format: 'staged', category: 'international', confed: null, defaultSeason: '2029', interval: 4,
  feeds: 'world-nations', slots: { direct: 2, playoff: 0 }, size: 4, neutral: true,
  description: 'Two one-off ties at a neutral venue; both winners qualify. Pass opts.teams = worldPlayoffEntrants(states).',
  stages: [{
    id: 'po', kind: 'ko', single: true, name: 'Intercontinental Play-off', roundName: 'Intercontinental Play-off',
    legs: 1, neutral: true, pairing: 'random',
    // Defaults by rating when no qualifier results are supplied.
    entrants: { qualify: [
      { from: 'confed', confed: 'SAM', count: 1, skip: 6 }, { from: 'confed', confed: 'ASI', count: 1, skip: 4 },
      { from: 'confed', confed: 'NCA', count: 1, skip: 3 }, { from: 'confed', confed: 'OCE', count: 1 },
    ] },
    outputs: { winners: [{ ko: 'winners' }] },
  }],
  result: { qualified: ['po.winners'] },
  championRef: 'po.winners',
});

// Full cycle: every qualifying pool side by side, the Oceania final, the intercontinental
// play-off, then the 32-team finals (8 groups of 4 → R16 … final, third-place match).
const CYCLE_CONFS = ['EUR', 'AFR', 'ASI', 'NCA', 'SAM', 'OCE'];
const worldCycle = {
  ...NATION_BASE, id: 'world-cycle', name: 'FIFA World Cup – Full Cycle', short: 'WNC', type: 'groups_ko',
  format: 'staged', category: 'international', confed: null, defaultSeason: '2030', interval: 4,
  description: 'Qualifiers for every confederation, the intercontinental play-off, then the 32-team finals',
  stages: [
    {
      id: 'qual', kind: 'groups', name: 'Qualifying', pools: CYCLE_CONFS.map((c) => wqPool(c, true)),
      outputs: {
        ...Object.fromEntries(CYCLE_CONFS.filter((c) => c !== 'OCE').map((c) => [c, withPool(WQ[c].direct, c)])),
        po: [...withPool(WQ.SAM.playoff, 'SAM'), ...withPool(WQ.ASI.playoff, 'ASI'), ...withPool(WQ.NCA.playoff, 'NCA')],
        oce: [{ pool: 'OCE', pos: [1, 2] }],
      },
    },
    { id: 'ocef', kind: 'ko', name: 'Oceania Qualifying Final', roundName: 'Oceania Qualifying Final',
      entrants: ['qual.oce'], legs: 1, finalLegs: 1, neutral: true, outputs: { winner: [{ ko: 'champion' }] } },
    { id: 'icp', kind: 'ko', single: true, name: 'Intercontinental Play-off', roundName: 'Intercontinental Play-off',
      entrants: ['qual.po', 'ocef.winner'], legs: 1, neutral: true, pairing: 'random',
      outputs: { winners: [{ ko: 'winners' }] } },
    {
      id: 'finals', kind: 'groups', name: 'Finals – Group Stage',
      pools: [{
        id: 'WNC', sizes: [4, 4, 4, 4, 4, 4, 4, 4], legs: 1, neutral: true, draw: 'constrained',
        groupConstraint: 'confed', confedLimit: { EUR: 2, default: 1 },
        entrants: ['qual.EUR', 'qual.AFR', 'qual.SAM', 'qual.ASI', 'qual.NCA', 'icp.winners'],
      }],
      outputs: {},
    },
    { id: 'ko', kind: 'ko', name: 'Finals – Knockout', entrants: { groupsOf: 'finals' }, size: 16,
      advance: 2, bestThirds: 0, firstKo: 'bracket', koDraw: 'bracket', koConstraint: ['group'],
      legs: 1, finalLegs: 1, neutral: true, thirdPlace: true, outputs: { champion: [{ ko: 'champion' }] } },
  ],
  result: {
    qualified: ['qual.EUR', 'qual.AFR', 'qual.SAM', 'qual.ASI', 'qual.NCA', 'icp.winners'],
    playoff: ['qual.po', 'ocef.winner'],
  },
};

// ------------------------------------------------------------ more nations competitions
const tierPool = (id, sizes) => ({ id, name: `League ${id}`, sizes, legs: 2, groupPrefix: id, numbered: true, entrants: { tier: id } });
const moreNationComps = [
  {
    ...NATION_BASE, id: 'nations-ladder', name: 'UEFA Nations League', short: 'UNL', type: 'groups_ko',
    format: 'staged', category: 'international', confed: 'EUR', defaultSeason: '2026/27', interval: 2,
    description: 'Leagues A (4×3), B (3×3), C (2×4) home & away; League A winners to Finals; promotion & relegation',
    tiers: { A: 12, B: 9, C: 8 }, tierQualify: [{ from: 'confed', confed: 'EUR', count: 99 }], size: 29,
    stages: [
      {
        id: 'league', kind: 'groups', name: 'League Phase',
        pools: [tierPool('A', [3, 3, 3, 3]), tierPool('B', [3, 3, 3]), tierPool('C', [4, 4])],
        outputs: {
          finalists: [{ pool: 'A', pos: 1 }],
          promoted: [{ pool: 'B', pos: 1 }, { pool: 'B', pos: 2, best: 1 }, { pool: 'C', pos: 1 }, { pool: 'C', pos: 2, best: 1 }],
          relegated: [{ pool: 'A', pos: -1 }, { pool: 'B', pos: -1 }],
        },
      },
      { id: 'finals', kind: 'ko', name: 'Finals Week', entrants: ['league.finalists'], pairing: 'random', size: 4,
        legs: 1, finalLegs: 1, neutral: true, thirdPlace: true, roundPrefix: 'Finals Week – ',
        outputs: { champion: [{ ko: 'champion' }] } },
    ],
    result: { promoted: ['league.promoted'], relegated: ['league.relegated'] },
  },
  {
    ...NATION_BASE, id: 'meridian-final', name: 'FIFA Confederations Cup', short: 'FCC', type: 'knockout',
    category: 'international', confed: null, defaultSeason: '2029', interval: 4,
    neutral: true, legs: 1, finalLegs: 1, thirdPlace: true, draw: 'random', extraTime: true, size: 4,
    // Pass opts.teams = [continental champions]; defaults to the best-rated nation of four confederations.
    participants: ['European champion', 'South American champion', 'African champion', 'Asian champion'],
    qualify: [
      { from: 'confed', confed: 'EUR', count: 1 }, { from: 'confed', confed: 'SAM', count: 1 },
      { from: 'confed', confed: 'AFR', count: 1 }, { from: 'confed', confed: 'ASI', count: 1 },
    ],
  },
  {
    ...NATION_KO, id: 'summer-games', name: 'Olympic Football Tournament', short: 'OLY', type: 'groups_ko',
    scope: 'nation', category: 'youth', youth: 'u23', confed: null, defaultSeason: '2028', interval: 4,
    groups: 4, advance: 2, bestThirds: 0, koLegs: 1, thirdPlace: true, firstKo: 'bracket', koDraw: 'bracket',
    groupConstraint: 'confed', confedLimit: { EUR: 2, default: 1 }, koConstraint: ['group'],
    roundNames: { third: 'Bronze Medal Match', final: 'Gold Medal Match' },
    qualify: [{ from: 'quotas', quotas: { EUR: 5, AFR: 3, SAM: 2, ASI: 3, NCA: 2, OCE: 1 } }],
    size: 16,
  },
  {
    ...NATION_KO, id: 'youth-nations', name: 'FIFA U-20 World Cup', short: 'U20', type: 'groups_ko',
    scope: 'nation', category: 'youth', youth: 'u20', confed: null, defaultSeason: '2027', interval: 2,
    groups: 6, advance: 2, bestThirds: 4, koLegs: 1, thirdPlace: false, firstKo: 'seeded', koDraw: 'bracket',
    groupConstraint: 'confed', confedLimit: { EUR: 2, default: 1 }, koConstraint: ['group'],
    qualify: [{ from: 'quotas', quotas: { EUR: 6, AFR: 4, SAM: 4, ASI: 4, NCA: 4, OCE: 2 } }],
    size: 24,
  },
];

// ------------------------------------------------------------ pre-season friendlies
const friendlyComps = [
  {
    id: 'summer-invitational', name: 'Summer Champions Series', short: 'SCS', type: 'knockout', scope: 'club',
    category: 'friendly', defaultSeason: CLUB_SEASON, neutral: true, legs: 1, finalLegs: 1, thirdPlace: true,
    extraTime: false, draw: 'random', size: 4,
    // 4 invited clubs: semi-finals, third-place match and final; level games go straight to penalties.
    qualify: [
      { from: 'league', league: 'alb', pos: [1, 1] }, { from: 'league', league: 'ibe', pos: [1, 1] },
      { from: 'league', league: 'pen', pos: [1, 1] }, { from: 'league', league: 'teu', pos: [1, 1] },
    ],
  },
  {
    id: 'harbour-trophy', name: 'Emirates Cup', short: 'EMC', type: 'league', scope: 'club',
    category: 'friendly', defaultSeason: CLUB_SEASON, legs: 1, points: POINTS, tiebreakers: TIEBREAK, size: 3,
    // 3-club round robin: everybody plays everybody once (one club rests each matchday).
    qualify: [
      { from: 'league', league: 'hex', pos: [1, 1] }, { from: 'league', league: 'afr', pos: [1, 1] },
      { from: 'pool', pool: 'row', confed: 'SAM', count: 1 },
    ],
  },
];

export const COMPETITIONS = [...domesticComps, ...continentalComps, ...nationComps,
  ...qualifierComps, worldCycle, ...moreNationComps, ...friendlyComps];

/** Menu groupings, in display order: [category, label]. */
export const COMPETITION_CATEGORIES = [
  ['domestic', 'Domestic leagues & cups'], ['continental', 'Club continental cups'],
  ['international', 'Nations tournaments'], ['youth', 'Youth tournaments'], ['friendly', 'Pre-season friendlies'],
];

const BY_ID = Object.fromEntries(COMPETITIONS.map((c) => [c.id, c]));
/** Look up a competition definition by id. */
export function getCompetition(id) { return BY_ID[id]; }
/** Competitions filtered by category: 'domestic' | 'continental' | 'international' | 'youth' | 'friendly'. */
export function competitionsByCategory(cat) { return COMPETITIONS.filter((c) => c.category === cat); }
