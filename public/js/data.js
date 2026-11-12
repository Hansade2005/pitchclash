// Vehicle roster, career ladder and save game.
// top = top speed m/s, acc = m/s^2, grip = lateral g-ish, nitro = boost strength
export const VEHICLES = {
  // cars
  fox:      { kind: 'car', name: 'Fox GT',        model: 'fox',      color: 0x1a5ae6, price: 0,     top: 56, acc: 15, grip: 25, nitro: 1.0 },
  orion:    { kind: 'car', name: 'Orion S',       model: 'orion',    color: 0xcc080d, price: 4000,  top: 60, acc: 16, grip: 26, nitro: 1.0 },
  meridian: { kind: 'car', name: 'Meridian V6',   model: 'meridian', color: 0x0f2454, price: 9000,  top: 64, acc: 17, grip: 26, nitro: 1.05 },
  atlas:    { kind: 'car', name: 'Atlas X',       model: 'atlas',    color: 0x1a2429, price: 12000, top: 62, acc: 19, grip: 24, nitro: 1.2 },
  bulldog:  { kind: 'car', name: 'Bulldog 500',   model: 'bulldog',  color: 0x111318, price: 18000, top: 70, acc: 20, grip: 26, nitro: 1.15 },
  kestrel:  { kind: 'car', name: 'Kestrel RS',    model: 'kestrel',  color: 0xf29e05, price: 28000, top: 75, acc: 21, grip: 29, nitro: 1.1 },
  vanta:    { kind: 'car', name: 'Vanta R',       model: 'vanta',    color: 0xcc0000, price: 45000, top: 81, acc: 23, grip: 31, nitro: 1.15 },
  phantom:  { kind: 'car', name: 'Phantom Zero',  model: 'phantom',  color: 0xededf2, price: 70000, top: 87, acc: 25, grip: 33, nitro: 1.25 },
  police:   { kind: 'car', name: 'Interceptor',   model: 'police',   color: 0xebebf0, price: 35000, top: 78, acc: 22, grip: 29, nitro: 1.3 },
  // bikes
  cruiser:  { kind: 'bike', name: 'Clubman 400',  model: 'racer',     color: 0x1a73e6, price: 0,     top: 58, acc: 18, grip: 23, nitro: 1.0 },
  viper:    { kind: 'bike', name: 'Viper 600',    model: 'racer',     color: 0xe60d14, price: 6000,  top: 68, acc: 21, grip: 25, nitro: 1.05 },
  nightster:{ kind: 'bike', name: 'Monza 750',    model: 'racer',     color: 0x15151a, price: 16000, top: 74, acc: 23, grip: 26, nitro: 1.2 },
  viperrr:  { kind: 'bike', name: 'Viper RR',     model: 'superbike', color: 0x19e68a, price: 34000, top: 84, acc: 26, grip: 29, nitro: 1.2 },
  venom:    { kind: 'bike', name: 'Venom GP',     model: 'superbike', color: 0xf2c40a, price: 60000, top: 92, acc: 29, grip: 31, nitro: 1.3 },
  // boats
  skiff:    { kind: 'boat', name: 'Marlin Skiff',   model: 'marlin',  color: 0xf2f2f5, price: 0,     top: 52, acc: 15, grip: 21, nitro: 1.0 },
  wave:     { kind: 'boat', name: 'Wave Runner',    model: 'marlin',  color: 0x1a8cff, price: 9000,  top: 62, acc: 18, grip: 23, nitro: 1.1 },
  storm:    { kind: 'boat', name: 'Storm Chaser',   model: 'marlin',  color: 0xe6191e, price: 30000, top: 74, acc: 22, grip: 26, nitro: 1.25 },
  // helicopters
  hornet:   { kind: 'heli', name: 'Hornet',         model: 'hornet',  color: 0xf2c40a, price: 0,     top: 60, acc: 16, grip: 23, nitro: 1.0 },
  cobra:    { kind: 'heli', name: 'Black Cobra',    model: 'hornet',  color: 0x15151a, price: 26000, top: 76, acc: 21, grip: 27, nitro: 1.2 },
  // planes
  skylark:  { kind: 'plane', name: 'Skylark',       model: 'skylark', color: 0xededf2, price: 0,     top: 70, acc: 17, grip: 24, nitro: 1.0 },
  redbaron: { kind: 'plane', name: 'Red Baron',     model: 'skylark', color: 0xcc080d, price: 32000, top: 88, acc: 22, grip: 28, nitro: 1.2 },
  // spaceships
  comet:    { kind: 'space', name: 'Comet',         model: 'ship',    color: 0x1a5ae6, price: 0,     top: 80, acc: 22, grip: 28, nitro: 1.1 },
  nova:     { kind: 'space', name: 'Nova Striker',  model: 'shipx',   color: 0xe6191e, price: 24000, top: 95, acc: 26, grip: 31, nitro: 1.2 },
  quasar:   { kind: 'space', name: 'Quasar X',      model: 'shipx',   color: 0xb026ff, price: 60000, top: 110, acc: 30, grip: 34, nitro: 1.35 },
};
export const KINDS = { car: 'Cars', bike: 'Bikes', boat: 'Boats', heli: 'Helicopters', plane: 'Planes', space: 'Spaceships' };
export const kindOf = id => VEHICLES[id].kind;
export const idsOf = kind => Object.keys(VEHICLES).filter(k => VEHICLES[k].kind === kind);
export const PAINTS = [0xe6191e, 0x1a5ae6, 0xf2c40a, 0x19c964, 0xff7a00, 0xb026ff, 0xededf2, 0x15151a, 0x00d5ff, 0xff3fa0];
export const AI_NAMES = ['Rex', 'Lena', 'Blaze', 'Nova', 'Jett', 'Kira', 'Dash', 'Zoe', 'Axel', 'Mika', 'Colt', 'Ivy'];
export const RULES = { sprint: 'Classic Race', versus: 'Versus Duel', knockdown: 'Knockdown', toxic: 'Toxic Tag', gates: 'Drift Gates', catch: 'Catch the Runner', combat: 'Combat Race', pursuit: 'Escape the Police', rush: 'City Rush', relay: 'Land & Sea Relay', elim: 'Elimination', orbs: 'Orb Rush', trial: 'Time Trial' };
export const ROAD_ONLY = ['pursuit', 'rush', 'relay', 'knockdown', 'toxic', 'gates', 'catch'];
export const rulesFor = kind => Object.keys(RULES).filter(r => kind === 'car' || kind === 'bike' || !ROAD_ONLY.includes(r));
export const RULE_HELP = {
  sprint: 'First across the line after the final lap wins.',
  versus: 'One rival, one race. Beat them to the line.',
  knockdown: 'Ram rivals into wrecks. Most takedowns in 2 minutes wins.',
  toxic: 'One car starts toxic. Ram clean cars to spread it and add time to your clock – if your toxic timer runs out, you are out.',
  gates: 'Drift through the glowing gates. Chain drifts for bigger combos; most points wins.',
  catch: 'A target car is fleeing. Stay on its bumper (or ram it) to catch it before time runs out.',
  combat: 'Grab weapon crates: machine gun, rockets, mines, shield. Wreck your rivals and win the race.',
  pursuit: 'Race your rivals while the police hunt you. Get stopped next to a cop and you are BUSTED.',
  rush: 'Race through live traffic and crossing pedestrians. Knock someone down and the police hunt you.',
  relay: 'Part of the lap is water: your ride turns into a speedboat and back. First to the flag wins.',
  elim: 'Every 20 seconds the racer in last place is knocked out. Survive!',
  orbs: 'Grab glowing orbs. Most orbs when the clock hits zero wins.',
  trial: 'Just you and the clock. Set your best lap on this track.',
};

// ---- World Tour: 8 countries, 2 circuits each. env drives the look of the generated city.
export const COUNTRIES = [
  { id: 'cm', name: 'Cameroon', tracks: ['douala', 'yaounde'], ground: 0x8f5d3c, tree: 'palm', bh: [8, 34], towers: 0.06, density: 0.8, wall: [1.0, 0.9, 0.78], landmark: 'monument', scenery: 'hills', hill: 0x2e6d3c, ads: ['DOUALA MOTORS', 'LION POWER', 'MAKOSSA FM'] },
  { id: 'us', name: 'USA', tracks: ['downtown', 'harbor'], ground: 0x6f7378, tree: 'round', bh: [14, 70], towers: 0.2, density: 1, wall: [1, 1, 1], landmark: 'stepped', ads: ['NITRO+', 'TURBO COLA', 'LIBERTY TYRES'] },
  { id: 'br', name: 'Brazil', tracks: ['rio', 'saopaulo'], ground: 0xa3946c, tree: 'palm', bh: [10, 46], towers: 0.12, density: 0.85, wall: [1.0, 0.97, 0.85], landmark: 'peak', scenery: 'domes', hill: 0x3b7446, ads: ['SAMBA FUEL', 'RIO SPEED', 'COPA ENERGY'] },
  { id: 'fr', name: 'France', tracks: ['paris', 'riviera'], ground: 0x7d7a74, tree: 'round', bh: [18, 30], towers: 0.0, density: 1, wall: [1.0, 0.95, 0.84], landmark: 'lattice', ads: ['VITESSE', 'LUMIERE OIL', 'GRAND PRIX CAFE'] },
  { id: 'uk', name: 'United Kingdom', tracks: ['london', 'highlands'], ground: 0x5f6a5c, tree: 'round', bh: [12, 38], towers: 0.08, density: 0.95, wall: [0.92, 0.86, 0.8], landmark: 'clock', hill: 0x4a6a45, ads: ['ROYAL RACING', 'THAMES TYRES', 'UNION OIL'] },
  { id: 'ae', name: 'UAE', tracks: ['skyline', 'desert'], ground: 0xc9a86a, tree: 'palm', bh: [20, 90], towers: 0.35, density: 1, wall: [0.95, 0.98, 1.05], landmark: 'spire', hill: 0xd4b071, ads: ['OASIS ENERGY', 'FALCON AIR', 'GOLD SOUK'] },
  { id: 'jp', name: 'Japan', tracks: ['neon', 'fuji'], ground: 0x60646c, tree: 'sakura', bh: [12, 62], towers: 0.2, density: 1, wall: [0.95, 0.97, 1.02], landmark: 'pagoda', hill: 0x4f7a55, ads: ['SAKURA SPEED', 'SHOGUN OIL', 'NEO TOKYO'] },
  { id: 'it', name: 'Italy', tracks: ['roma', 'monza'], ground: 0x8f8068, tree: 'cypress', bh: [10, 28], towers: 0.0, density: 0.95, wall: [1.05, 0.92, 0.76], landmark: 'arena', hill: 0x5d7a45, ads: ['SCUDERIA ROSSA', 'VELOCE', 'ESPRESSO GP'] },
];
// per-track tweaks on top of the country look
export const TRACK_ENV = {
  london: { weather: 'rain' }, highlands: { scenery: 'hills', density: 0.2, weather: 'snow' }, saopaulo: { weather: 'rain' },
  yaounde: { scenery: 'hills', density: 0.6 }, riviera: { scenery: 'hills', density: 0.5, tree: 'palm' },
  desert: { scenery: 'dunes', density: 0.1 }, fuji: { scenery: 'fuji', density: 0.4 }, monza: { scenery: 'hills', density: 0.3, tree: 'round' }, rio: { scenery: 'domes' },
};
export const countryById = id => COUNTRIES.find(c => c.id === id);

// 4 events per country = 32 levels for cars and 32 for bikes.
function tourFor(kind) {
  const road0 = kind === 'car' || kind === 'bike', special = road0 ? ['orbs', 'elim', 'gates', 'knockdown', 'toxic', 'combat'] : ['orbs', 'elim', 'combat'], out = [];
  COUNTRIES.forEach((c, ci) => {
    const [a, b] = c.tracks, sk = 0.72 + ci * 0.034, pz = 2000 + ci * 1500, k = kind === 'bike' ? 0.9 : kind === 'car' ? 1 : 1.1, ai = Math.min(7, 3 + Math.ceil(ci / 2));
    const road = kind === 'car' || kind === 'bike', third = !road ? (ci % 2 ? 'combat' : 'versus') : ['pursuit', 'rush', 'relay', 'catch', 'versus', 'combat'][ci % 6];
    out.push([
      { name: 'Street Opener', track: a, rule: 'sprint', laps: 2, ai, skill: sk, prize: pz },
      { name: { orbs: 'Orb Hunt', elim: 'Last One Standing', combat: 'Street War', gates: 'Drift King', knockdown: 'Demolition Derby', toxic: 'Toxic Rush' }[special[ci % special.length]], track: b, rule: special[ci % special.length], laps: 2, ai, skill: sk + 0.015, prize: pz * 1.2 },
      { name: { pursuit: 'Great Escape', rush: 'Rush Hour', relay: 'Land & Sea', combat: 'Rocket Run', elim: 'Knockout', catch: 'Hunt the Runner', versus: 'Rival Duel' }[third], peds: third === 'rush' ? 6 : 0, track: a, rule: third, laps: 2, ai: Math.max(2, ai - 1), skill: sk + 0.025, prize: pz * 1.5, traffic: road && (ci >= 2 || third === 'rush') ? 4 : 0, cops: 2 + Math.floor(ci / 3) },
      { name: c.name + ' Grand Final', track: b, rule: 'sprint', laps: 3, ai: Math.min(7, ai + 1), skill: sk + 0.045, prize: pz * 2.2, traffic: road && ci >= 4 ? 3 : 0 },
    ].map((e, ei) => ({ ...e, id: c.id + ei, prize: Math.round(e.prize * k / 100) * 100 })));
  });
  return out;
}
export const TOUR = Object.fromEntries(Object.keys(KINDS).map(k => [k, tourFor(k)]));
export const levelOf = xp => Math.floor(Math.sqrt(xp / 120)) + 1;
export const xpFor = lvl => (lvl - 1) * (lvl - 1) * 120;
export const RANKS = ['Rookie', 'Street Racer', 'Challenger', 'Pro', 'Elite', 'Master', 'Legend'];
export const rankOf = lvl => RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 4))];
export const UPGRADES = [
  { key: 'eng', name: 'Engine', cost: [3000, 7000, 14000] },
  { key: 'grip', name: 'Tyres', cost: [2500, 6000, 12000] },
  { key: 'nitro', name: 'Nitro', cost: [2000, 5000, 10000] },
];

const KEY = 'apexclash.save.v1';
const def = () => ({
  name: 'Hans', credits: 3000,
  owned: Object.fromEntries(['fox', 'cruiser', 'skiff', 'hornet', 'skylark', 'comet'].map(i => [i, { eng: 0, grip: 0, nitro: 0 }])),
  sel: { car: 'fox', bike: 'cruiser', boat: 'skiff', heli: 'hornet', plane: 'skylark', space: 'comet' }, paint: {},
  tour: { car: {}, bike: {}, boat: {}, heli: {}, plane: {}, space: {} }, xp: 0, best: {}, stats: { races: 0, wins: 0, wrecks: 0, busted: 0 },
  settings: { quality: 'auto', music: 0.4, sfx: 0.8, assist: 'easy', autoGas: false },
});
export let save = def();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) save = { ...def(), ...s, settings: { ...def().settings, ...s.settings }, tour: { ...def().tour, ...s.tour }, sel: { ...def().sel, ...s.sel }, owned: { ...def().owned, ...s.owned }, stats: { ...def().stats, ...s.stats } }; } catch (e) {}
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
export function resetSave() { save = def(); persist(); }

// Final stats for a vehicle, including upgrades.
export function statsFor(id, up) {
  const v = VEHICLES[id]; up = up || { eng: 0, grip: 0, nitro: 0 };
  return { ...v, id, top: v.top * (1 + 0.035 * up.eng), acc: v.acc * (1 + 0.07 * up.eng), grip: v.grip * (1 + 0.05 * up.grip), nitro: v.nitro * (1 + 0.12 * up.nitro) };
}
