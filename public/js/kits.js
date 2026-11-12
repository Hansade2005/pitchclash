// Kits: every team has a home, away and third kit plus goalkeeper kits. Away / third are generated from the club colours
// (or taken from Edit mode); the match picks the one that avoids a clash.
const lum = c => (0.2126 * (c >> 16 & 255) + 0.7152 * (c >> 8 & 255) + 0.0722 * (c & 255)) / 255;
export const cdist = (a, b) => Math.abs((a >> 16 & 255) - (b >> 16 & 255)) + Math.abs((a >> 8 & 255) - (b >> 8 & 255)) + Math.abs((a & 255) - (b & 255));
const hash = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const THIRDS = [[0x1b1b1f, 0xd4af37, 0x1b1b1f], [0x0b3d91, 0xffd400, 0x0b3d91], [0x6a1b9a, 0xffffff, 0x6a1b9a], [0x00897b, 0x111111, 0x00897b], [0xe91e63, 0x111111, 0xe91e63], [0xff6f00, 0x111111, 0xff6f00], [0x37474f, 0x80deea, 0x37474f], [0x00b0ff, 0xffffff, 0x00b0ff], [0x7cb342, 0x1b1b1f, 0x7cb342], [0xb71c1c, 0xffffff, 0xb71c1c], [0xcfd8dc, 0x263238, 0xcfd8dc], [0x3e2723, 0xffab00, 0x3e2723]];
const GKS = [0x2fb36a, 0xff7a00, 0x5a2d82, 0x00a3e0, 0xf2c40a, 0xe83e8c, 0x222222, 0xd8232a, 0xf5f5f5];
export const KIT_NAMES = { home: 'Home', away: 'Away', third: 'Third' };
// a library of ready-made kits for the kit locker (Edit mode): [name, shirt, shorts, socks]
const BASES = [['Red', 0xd8232a], ['Maroon', 0x7a1f3d], ['Orange', 0xff7a00], ['Yellow', 0xf2c40a], ['Green', 0x1f9d55], ['Dark green', 0x0a5a2c], ['Sky blue', 0x6cabdd], ['Blue', 0x1a56c4], ['Navy', 0x1a2a6b], ['Purple', 0x5a2d82], ['Pink', 0xff5fa0], ['Black', 0x151515], ['White', 0xf5f5f5], ['Grey', 0x9aa3ad]];
export const KIT_PRESETS = BASES.flatMap(([n, c]) => [[n + ' · classic', c, c, c], [n + ' · white shorts', c, 0xffffff, c], [n + ' · black shorts', c, 0x151515, 0x151515]]).filter(k => !(k[1] === 0xf5f5f5 && k[2] === 0xffffff) && !(k[1] === 0x151515 && k[2] === 0x151515 && k[0].includes('black shorts')));

export function kitSets(t) {
  const home = t.kit, E = t.kits || {}, dark = home.find(c => lum(c) < 0.28);
  const away = lum(home[0]) > 0.5 ? [dark ?? 0x16213e, dark ?? 0x16213e, dark ?? 0x16213e] : [0xf4f4f4, home[0], 0xf4f4f4];
  const h = hash(t.id); let third = THIRDS[h % THIRDS.length]; for (let i = 0; i < THIRDS.length; i++) { third = THIRDS[(h + i) % THIRDS.length]; if (cdist(third[0], home[0]) > 170 && cdist(third[0], away[0]) > 170) break; }
  const A = E.away || away, T = E.third || third, gk = c => GKS.find(g => cdist(g, c) > 200 && cdist(g, home[0]) > 150) ?? 0x2a2a2a;
  return { home: { kit: home, gk: t.gk }, away: { kit: A, gk: gk(A[0]) }, third: { kit: T, gk: gk(T[0]) } };
}
// sel[i] = 'auto' | 'home' | 'away' | 'third'. Auto: the first-named team wears home; the other changes if the shirts would clash.
export function pickKits(A, B, sel = ['auto', 'auto']) {
  const a = kitSets(A), b = kitSets(B); let ka = sel[0] === 'auto' || !a[sel[0]] ? 'home' : sel[0], kb = sel[1];
  if (kb === 'auto' || !b[kb]) { kb = 'home'; if (cdist(a[ka].kit[0], b.home.kit[0]) < 150) kb = cdist(a[ka].kit[0], b.away.kit[0]) >= 150 ? 'away' : 'third'; }
  const shirts = [a[ka].kit[0], b[kb].kit[0]], gks = [a[ka].gk, b[kb].gk];
  const fixGk = (g, other) => { const ok = c => shirts.every(s => cdist(c, s) > 130) && cdist(c, other) > 90; if (ok(g)) return g; return GKS.find(ok) ?? g; };
  gks[0] = fixGk(gks[0], gks[1]); gks[1] = fixGk(gks[1], gks[0]);
  return [{ kit: a[ka].kit, gk: gks[0], name: ka }, { kit: b[kb].kit, gk: gks[1], name: kb }];
}
