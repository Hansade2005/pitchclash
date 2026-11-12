// Teams (national sides, fictional squads), formation and save data.
// kit: [shirt, shorts, socks], gk: keeper shirt, rating: overall strength.
export const TEAMS = [
  { id: 'cmr', name: 'Cameroon', kit: [0x0a7a3c, 0xce1126, 0xfcd116], gk: 0x222222, rating: 80, flag: ['v', '#007a5e', '#ce1126', '#fcd116'], star: '#fcd116', names: 'af' },
  { id: 'nga', name: 'Nigeria', kit: [0x1f9d55, 0xffffff, 0x1f9d55], gk: 0xf2c40a, rating: 81, flag: ['v', '#008751', '#ffffff', '#008751'], names: 'af' },
  { id: 'gha', name: 'Ghana', kit: [0xf5f5f5, 0xf5f5f5, 0xf5f5f5], gk: 0x1a1a1a, rating: 78, flag: ['h', '#ce1126', '#fcd116', '#006b3f'], star: '#111', names: 'af' },
  { id: 'sen', name: 'Senegal', kit: [0xfafafa, 0xfafafa, 0x0a8a3c], gk: 0xf2c40a, rating: 82, flag: ['v', '#00853f', '#fdef42', '#e31b23'], star: '#00853f', names: 'af' },
  { id: 'egy', name: 'Egypt', kit: [0xc8102e, 0xffffff, 0x111111], gk: 0x2fb36a, rating: 79, flag: ['h', '#ce1126', '#ffffff', '#000000'], names: 'af' },
  { id: 'mar', name: 'Morocco', kit: [0xc1272d, 0x0a6b3c, 0xc1272d], gk: 0x2a2a2a, rating: 84, flag: ['v', '#c1272d'], star: '#006233', names: 'af' },
  { id: 'civ', name: 'Ivory Coast', kit: [0xf77f00, 0xffffff, 0x009e60], gk: 0x1a1a1a, rating: 80, flag: ['v', '#f77f00', '#ffffff', '#009e60'], names: 'af' },
  { id: 'rsa', name: 'South Africa', kit: [0xffb612, 0x007a4d, 0xffb612], gk: 0x1a1a1a, rating: 75, flag: ['h', '#de3831', '#ffffff', '#007a4d', '#ffffff', '#002395'], names: 'af' },
  { id: 'bra', name: 'Brazil', kit: [0xffdf00, 0x1a4fc4, 0xffffff], gk: 0x2fb36a, rating: 89, flag: ['br'], names: 'la' },
  { id: 'arg', name: 'Argentina', kit: [0x8fd0ff, 0x1a1a2a, 0xffffff], gk: 0xf2c40a, rating: 90, flag: ['h', '#74acdf', '#ffffff', '#74acdf'], star: '#f6b40e', names: 'la' },
  { id: 'fra', name: 'France', kit: [0x1c2f6b, 0xffffff, 0xd8232a], gk: 0xf2c40a, rating: 90, flag: ['v', '#0055a4', '#ffffff', '#ef4135'], names: 'eu' },
  { id: 'ger', name: 'Germany', kit: [0xf7f7f7, 0x151515, 0xf7f7f7], gk: 0xd8232a, rating: 86, flag: ['h', '#000000', '#dd0000', '#ffce00'], names: 'eu' },
  { id: 'esp', name: 'Spain', kit: [0xc60b1e, 0x1a2a6b, 0xc60b1e], gk: 0x2fb36a, rating: 89, flag: ['h', '#aa151b', '#f1bf00', '#f1bf00', '#aa151b'], names: 'la' },
  { id: 'ita', name: 'Italy', kit: [0x1a56c4, 0xffffff, 0x1a56c4], gk: 0x9aa3ad, rating: 85, flag: ['v', '#009246', '#ffffff', '#ce2b37'], names: 'eu' },
  { id: 'eng', name: 'England', kit: [0xfafafa, 0x1a2a5b, 0xfafafa], gk: 0xf2c40a, rating: 88, flag: ['eng'], names: 'en' },
  { id: 'por', name: 'Portugal', kit: [0xb5121b, 0x0a6b3c, 0xb5121b], gk: 0x1a1a1a, rating: 87, flag: ['v', '#046a38', '#da291c', '#da291c'], names: 'la' },
  { id: 'ned', name: 'Netherlands', kit: [0xf36c21, 0xf36c21, 0xf36c21], gk: 0x2a6be0, rating: 86, flag: ['h', '#ae1c28', '#ffffff', '#21468b'], names: 'eu' },
  { id: 'usa', name: 'USA', kit: [0xf5f5f5, 0x1a2a6b, 0xf5f5f5], gk: 0x2fb36a, rating: 79, flag: ['us'], names: 'en' },
  { id: 'jpn', name: 'Japan', kit: [0x1a3fb0, 0x1a3fb0, 0x1a3fb0], gk: 0xf2c40a, rating: 81, flag: ['jp'], names: 'as' },
  { id: 'mex', name: 'Mexico', kit: [0x0a6b3c, 0xffffff, 0xc8102e], gk: 0x1a1a1a, rating: 80, flag: ['v', '#006847', '#ffffff', '#ce1126'], names: 'la' },
];
// Fictional clubs in four leagues. Club = [name, shirt, shorts, socks, rating]
const C = (league, names, list) => list.map(([name, a, b, c, rating], i) => ({ id: league + i, name, league, kit: [a, b, c], gk: 0x2a2a2a, rating, flag: ['crest', '#' + a.toString(16).padStart(6, '0'), '#' + b.toString(16).padStart(6, '0')], names, club: true }));
export const LEAGUES = [
  { id: 'en', name: 'Premier Division' }, { id: 'es', name: 'La Primera' }, { id: 'it', name: 'Serie Azzurra' }, { id: 'af', name: 'Africa Super League' },
];
export const CLUBS = [
  ...C('en', 'en', [['Northbridge United', 0xc8102e, 0xffffff, 0x111111, 88], ['Kingsport City', 0x6cabdd, 0xffffff, 0x6cabdd, 89], ['Ashford Rovers', 0x1a2a6b, 0x1a2a6b, 0xffffff, 83], ['Redcliff Athletic', 0xd8232a, 0x111111, 0xd8232a, 85], ['Westmoor Wanderers', 0xf2c40a, 0x111111, 0xf2c40a, 80], ['Harbour Town', 0x0a6b3c, 0xffffff, 0x0a6b3c, 78], ['Ironvale FC', 0x7a1f3d, 0x9ad0f5, 0x7a1f3d, 81], ['Oakfield Albion', 0xf5f5f5, 0x1a2a6b, 0xf5f5f5, 79]]),
  ...C('es', 'la', [['Real Solana', 0xfafafa, 0xfafafa, 0xfafafa, 90], ['Atlético Marisma', 0xc8102e, 0x1a2a6b, 0xc8102e, 86], ['CD Valmora', 0x1a3fb0, 0xa50044, 0x1a3fb0, 89], ['Costa Brava CF', 0xf2c40a, 0x1a3fb0, 0xf2c40a, 82], ['Montaña Azul', 0x2a6be0, 0xffffff, 0x2a6be0, 80], ['Deportivo Arenal', 0x0a7a3c, 0xffffff, 0x0a7a3c, 79], ['Unión Castellar', 0xff7a00, 0x111111, 0xff7a00, 78], ['Racing Olivar', 0x6a1fb0, 0xffffff, 0x6a1fb0, 77]]),
  ...C('it', 'eu', [['AC Vespera', 0xb5121b, 0x111111, 0xb5121b, 86], ['SS Montebello', 0x111111, 0xf5f5f5, 0x111111, 87], ['Calcio Fiorano', 0x5a2d82, 0xffffff, 0x5a2d82, 81], ['US Portovento', 0x1a56c4, 0x1a56c4, 0xffffff, 84], ['AS Castelrosso', 0x8e1f2f, 0xf2c40a, 0x8e1f2f, 83], ['Virtus Lagonero', 0x87ceeb, 0xffffff, 0x87ceeb, 80], ['Atletica Sorrenta', 0x0a6b3c, 0x111111, 0x0a6b3c, 78], ['FC Valdoro', 0xf2c40a, 0x1a2a6b, 0xf2c40a, 77]]),
  ...C('af', 'af', [['Douala Lions', 0x0a7a3c, 0xce1126, 0xfcd116, 82], ['Yaoundé Stars', 0xfcd116, 0x0a7a3c, 0xfcd116, 80], ['Lagos Eagles', 0x1f9d55, 0xffffff, 0x1f9d55, 81], ['Accra Golden Stars', 0xf5d000, 0x111111, 0xf5d000, 79], ['Cairo Pharaohs', 0xc8102e, 0xffffff, 0xc8102e, 84], ['Casablanca Atlas', 0x0a6b3c, 0xffffff, 0xc1272d, 83], ['Dakar Teranga', 0xfafafa, 0x0a8a3c, 0xfafafa, 79], ['Abidjan Elephants', 0xf77f00, 0xffffff, 0xf77f00, 80]]),
];
export const ALL = () => [...TEAMS, ...CLUBS];
export const teamById = id => TEAMS.find(t => t.id === id) || CLUBS.find(t => t.id === id);
export const code = t => t.short || (t.club ? t.name.replace(/^(AC|SS|US|AS|FC|CD|Real|Atlético|Atletica|Calcio|Virtus|Deportivo|Unión|Racing|Costa|Montaña) /, '') : t.id).slice(0, 3).toUpperCase();
// Competitions: knockout cups and single round-robin leagues
export const COMPS = [
  { id: 'ecc', name: 'European Champions Cup 2026', format: 'groups', groupLegs: 2, koLegs: 2, hint: '16 clubs · 4 groups home & away · two-legged knockouts · one-off final', pool: () => CLUBS.filter(c => c.league !== 'af').sort((a, b) => b.rating - a.rating).slice(0, 16).map(c => c.id) },
  { id: 'wnc', name: 'World Nations Cup 2026', format: 'groups', groupLegs: 1, koLegs: 1, hint: '16 nations · 4 groups · knockout with extra time and penalties', pool: () => TEAMS.slice().sort((a, b) => b.rating - a.rating).slice(0, 16).map(c => c.id) },
  { id: 'anc', name: 'Africa Nations Cup 2026', format: 'ko', koLegs: 1, hint: '8 African nations · knockout', pool: () => TEAMS.filter(t => t.names === 'af').map(c => c.id) },
  { id: 'acc', name: 'Africa Champions Cup', format: 'ko', koLegs: 2, hint: '8 African clubs · two-legged knockouts · one-off final', pool: () => CLUBS.filter(c => c.league === 'af').map(c => c.id) },
  ...LEAGUES.map(l => ({ id: 'lg_' + l.id, name: l.name, format: 'league', hint: '8 clubs · 14 match days, home & away', pool: () => CLUBS.filter(c => c.league === l.id).map(c => c.id) })),
];
const POOL = {
  af: ['Ndongo', 'Mbala', 'Etame', 'Okoro', 'Adeyemi', 'Mensah', 'Diallo', 'Traore', 'Kone', 'Sarr', 'Ngassa', 'Fotso', 'Bello', 'Owusu', 'Camara', 'Tchami', 'Zongo', 'Salah', 'Hassan', 'Amrani', 'Mokoena', 'Dlamini', 'Yeboah', 'Bassong'],
  la: ['Silva', 'Costa', 'Rocha', 'Moreno', 'Vargas', 'Herrera', 'Castro', 'Ramos', 'Molina', 'Pereira', 'Santos', 'Navarro', 'Reyes', 'Fuentes', 'Lima', 'Cardoso', 'Torres', 'Mendez', 'Ibarra', 'Souza', 'Paz', 'Luna', 'Rivas', 'Campos'],
  eu: ['Laurent', 'Moreau', 'Weber', 'Keller', 'Rossi', 'Conti', 'De Vries', 'Bakker', 'Girard', 'Vogel', 'Ricci', 'Jansen', 'Marchand', 'Hartmann', 'Greco', 'Visser', 'Lambert', 'Brandt', 'Fabbri', 'Mulder', 'Roux', 'Kraus', 'Gallo', 'Smit'],
  en: ['Carter', 'Hughes', 'Bennett', 'Cole', 'Parker', 'Reed', 'Hayes', 'Brooks', 'Foster', 'Ward', 'Mason', 'Ellis', 'Price', 'Shaw', 'Grant', 'Webb', 'Turner', 'Miles', 'Rhodes', 'Dean', 'Fox', 'Blake', 'Marsh', 'Lane'],
  as: ['Sato', 'Tanaka', 'Ito', 'Mori', 'Hayashi', 'Kato', 'Endo', 'Fujita', 'Ono', 'Ueda', 'Hara', 'Kubo', 'Noda', 'Abe', 'Sakai', 'Maeda', 'Ishii', 'Okada', 'Arai', 'Nomura', 'Goto', 'Seki', 'Baba', 'Miya'],
};
export function squad(team) { // 11 starters + 5 substitutes, stable per team (Edit mode names win)
  let s = 0; for (const c of team.id) s = s * 31 + c.charCodeAt(0); const pool = [...POOL[team.names]], out = [];
  for (let i = 0; i < 16; i++) { s = (s * 1103515245 + 12345) >>> 0; const nm = pool.splice(s % pool.length, 1)[0]; out.push({ name: (team.players && team.players[i]) || nm, num: [1, 2, 5, 4, 3, 7, 8, 6, 11, 9, 10, 12, 13, 14, 15, 16][i] }); }
  return out;
}
// 4-4-2: x from own goal (-1) to opponent goal (+1), z across the pitch
export const FORMATION = [[-0.95, 0, 'GK'], [-0.62, -0.62, 'DF'], [-0.7, -0.22, 'DF'], [-0.7, 0.22, 'DF'], [-0.62, 0.62, 'DF'], [-0.2, -0.68, 'MF'], [-0.3, -0.22, 'MF'], [-0.3, 0.22, 'MF'], [-0.2, 0.68, 'MF'], [0.28, -0.2, 'FW'], [0.28, 0.2, 'FW']];
export const DIFFS = { easy: 0.86, normal: 0.95, hard: 1.03 };

const KEY = 'goalnation.save.v1';
const def = () => ({ team: 'cmr', comp: null, trophies: [], edits: { teams: {}, comps: {} }, settings: { half: 3, diff: 'normal', music: 0.5, sfx: 0.8, commentary: 0.9, quality: 'auto' }, cups: 0, wins: 0, played: 0, goals: 0 });
export let save = def();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) save = { ...def(), ...s, settings: { ...def().settings, ...s.settings }, edits: { teams: {}, comps: {}, ...(s.edits || {}) } }; } catch (e) {}
// ---- Edit mode: names, short names, kits, squads and badges typed in by the player (saved on this PC only)
const ORIG = new Map();
export function applyEdits() {
  for (const t of [...TEAMS, ...CLUBS]) {
    if (!ORIG.has(t.id)) ORIG.set(t.id, { name: t.name, kit: [...t.kit] });
    const o = ORIG.get(t.id), e = save.edits.teams[t.id] || {};
    t.name = e.name || o.name; t.short = e.code || null; t.kit = Array.isArray(e.kit) && e.kit.length === 3 ? e.kit : [...o.kit]; t.players = Array.isArray(e.players) ? e.players : null; t.badge = typeof e.badge === 'string' && e.badge.startsWith('data:image/') ? e.badge : null;
  }
  for (const c of COMPS) { if (!c.orig) c.orig = c.name; c.name = save.edits.comps[c.id] || c.orig; }
}
// Accepts an imported edit file; keeps only plain strings / numbers so a shared file cannot inject anything.
export function cleanEdits(o) {
  const str = (v, n) => typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, n) : undefined, out = { teams: {}, comps: {} };
  for (const [id, e] of Object.entries((o && o.teams) || {})) { if (!teamById(id) || !e) continue; const t = {}; if (str(e.name, 28)) t.name = str(e.name, 28); if (str(e.code, 3)) t.code = str(e.code, 3).toUpperCase();
    if (Array.isArray(e.kit) && e.kit.length === 3 && e.kit.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffff)) t.kit = e.kit;
    if (Array.isArray(e.players)) t.players = e.players.slice(0, 16).map(n => str(n, 22) || '');
    if (typeof e.badge === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(e.badge) && e.badge.length < 60000) t.badge = e.badge;
    out.teams[id] = t; }
  for (const [id, n] of Object.entries((o && o.comps) || {})) if (COMPS.some(c => c.id === id) && str(n, 40)) out.comps[id] = str(n, 40);
  return out;
}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

applyEdits();
