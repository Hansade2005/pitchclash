// Stadium set (all fictional). tiers = [main stand, opposite stand, left end, right end].
export const STADIUMS = [
  { id: 'grand-royal', name: 'Grand Royal Arena', capacity: 81000, tiers: [3, 1, 3, 3], roof: 'ring', lights: 'roof', seats: ['#7f1d1d', '#991b1b'], concrete: '#5b616b', mow: 'stripes', track: false, backdrop: 'city', tier: 3 },
  { id: 'colosseo-sol', name: 'Colosseo do Sol', capacity: 78000, tiers: [3, 1, 2, 2], roof: 'ring', lights: 'roof', seats: ['#ca8a04', '#15803d'], concrete: '#6b6355', mow: 'circles', track: false, backdrop: 'city', tier: 3 },
  { id: 'dragon-gate', name: 'Dragon Gate Stadium', capacity: 72000, tiers: [3, 1, 2, 2], roof: 'separate', lights: 'roof', seats: ['#b91c1c', '#d97706'], concrete: '#57534e', mow: 'checker', track: false, backdrop: 'city', tier: 3 },
  { id: 'national-bowl', name: 'National Bowl', capacity: 65000, tiers: [2, 1, 2, 2], roof: 'separate', lights: 'towers', seats: ['#1e3a8a', '#1d4ed8'], concrete: '#5b616b', mow: 'checker', track: true, backdrop: 'none', tier: 2 },
  { id: 'savannah', name: 'Savannah National Stadium', capacity: 60000, tiers: [2, 1, 2, 2], roof: 'separate', lights: 'towers', seats: ['#166534', '#ca8a04'], concrete: '#78716c', mow: 'wide', track: true, backdrop: 'none', tier: 2 },
  { id: 'alpenblick', name: 'Alpenblick Arena', capacity: 47000, tiers: [2, 1, 2, 1], roof: 'separate', lights: 'roof', seats: ['#1e40af', '#e5e7eb'], concrete: '#64748b', mow: 'diagonal', track: false, backdrop: 'mountains', tier: 2 },
  { id: 'desert-pearl', name: 'Desert Pearl Dome', capacity: 55000, tiers: [2, 1, 2, 2], roof: 'closed', lights: 'roof', seats: ['#a16207', '#f5f5f4'], concrete: '#a8a29e', mow: 'circles', track: false, backdrop: 'none', tier: 2 },
  { id: 'old-northern', name: 'Old Northern Ground', capacity: 32000, tiers: [2, 1, 1, 1], roof: 'separate', lights: 'towers', seats: ['#991b1b', '#f8fafc'], concrete: '#4b5563', mow: 'stripes', track: false, backdrop: 'city', tier: 1, gaps: true },
  { id: 'harbour-park', name: 'Harbour Park', capacity: 24000, tiers: [1, 1, 1, 1], roof: 'separate', lights: 'towers', seats: ['#0f766e', '#115e59'], concrete: '#64748b', mow: 'wide', track: false, backdrop: 'sea', tier: 1, gaps: true },
  { id: 'champions', name: 'Stadium of Champions', capacity: 90000, tiers: [3, 1, 3, 3], roof: 'ring', lights: 'roof', seats: ['#a16207', '#facc15'], concrete: '#3f3f46', mow: 'circles', track: false, backdrop: 'city', tier: 4 },
];

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Each team's home ground. Clubs get seats in their own colours; nations play at a national stadium.
export function homeStadium(team) {
  if (!team) return STADIUMS[0];
  const pool = team.kind === 'nation'
    ? STADIUMS.filter(s => s.tier >= 2 && s.tier <= 3)
    : STADIUMS.filter(s => s.tier === (team.rating >= 84 ? 3 : team.rating >= 74 ? 2 : 1));
  const base = pool[hash(team.id) % pool.length];
  if (team.kind === 'nation') return { ...base, name: `${team.name} National Stadium`, baseName: base.name, home: team.id };
  const suffix = ['Park', 'Stadium', 'Arena', 'Ground', 'Road', 'Lane'][hash(team.id + 's') % 6];
  const word = team.name.split(' ').find(w => w.length > 3 && !/^(FC|CF|AC|SC|Real|Club|Athletic|United|City|Royals?)$/i.test(w)) || team.name.split(' ')[0];
  return { ...base, name: `${word} ${suffix}`, baseName: base.name, home: team.id, seats: [team.colors.shirt, team.colors.shorts] };
}

// Venue for a fixture: home team's ground, or a rotating showpiece venue for neutral matches/finals.
export function venueFor(home, away, { neutral = false, final = false, seed = '' } = {}) {
  if (final) return STADIUMS.find(s => s.id === 'champions');
  if (neutral) { const big = STADIUMS.filter(s => s.tier >= 2 && s.id !== 'champions'); return big[hash(String(seed) + (home && home.id)) % big.length]; }
  return homeStadium(home);
}
