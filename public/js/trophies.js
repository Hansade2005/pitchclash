// Trophy catalogue: art (SVG) for the trophy room, 3D models for the lifting ceremony, and career awards / achievements.
export const TROPHIES = [
  // world / continental
  { id: 'wnc', name: 'FIFA World Cup', kind: 'Nations', design: 'globe', c: ['#f5c542', '#1f8a4c'], blurb: 'The biggest prize in football.' },
  { id: 'anc', name: 'Africa Cup of Nations', kind: 'Nations', design: 'bigcup', c: ['#e8b93a', '#0b7a43'], blurb: 'Champions of Africa.' },
  { id: 'ecc', name: 'UEFA Champions League', kind: 'Continental', design: 'bigcup', c: ['#c9d1dc', '#1a3fb0'], blurb: 'The big-eared cup.' },
  { id: 'acc', name: 'African Club Champions Cup', kind: 'Continental', design: 'bigcup', c: ['#e8b93a', '#c8102e'], blurb: 'Best club side in Africa.' },
  // leagues
  { id: 'lg_en', name: 'Premier League', kind: 'League', design: 'crown', c: ['#f2c14a', '#3a0f6b'], blurb: 'English champions.' },
  { id: 'lg_es', name: 'La Liga', kind: 'League', design: 'plate', c: ['#e9ecf2', '#d8232a'], blurb: 'Spanish champions.' },
  { id: 'lg_it', name: 'Serie A', kind: 'League', design: 'shield', c: ['#e8b93a', '#2c7a36'], blurb: 'Italian champions — the Scudetto.' },
  { id: 'lg_af', name: 'CAF Champions League', kind: 'League', design: 'plate', c: ['#e8b93a', '#0b7a43'], blurb: 'African club league winners.' },
  // domestic cups
  { id: 'cup_en', name: 'FA Cup', kind: 'Cup', design: 'cup', c: ['#d7dbe3', '#c8102e'], blurb: 'The world\'s oldest cup.' },
  { id: 'cup_es', name: 'Copa del Rey', kind: 'Cup', design: 'cup', c: ['#e8b93a', '#a50044'], blurb: 'The King\'s Cup.' },
  { id: 'cup_it', name: 'Coppa Italia', kind: 'Cup', design: 'cup', c: ['#e8b93a', '#2c7a36'], blurb: 'Italian cup winners.' },
  { id: 'cup_af', name: 'CAF Confederation Cup', kind: 'Cup', design: 'cup', c: ['#d7dbe3', '#0b7a43'], blurb: 'The continental cup.' },
  // super cups
  { id: 'sup_en', name: 'Community Shield', kind: 'Super Cup', design: 'shield', c: ['#d7dbe3', '#1a56c4'], blurb: 'Season opener.' },
  { id: 'sup_es', name: 'Supercopa de España', kind: 'Super Cup', design: 'shield', c: ['#e8b93a', '#c8102e'], blurb: 'Season opener.' },
  { id: 'sup_it', name: 'Supercoppa Italiana', kind: 'Super Cup', design: 'shield', c: ['#e8b93a', '#1a56c4'], blurb: 'Season opener.' },
  { id: 'sup_af', name: 'CAF Super Cup', kind: 'Super Cup', design: 'shield', c: ['#d7dbe3', '#0b7a43'], blurb: 'Season opener.' },
  // career awards
  { id: 'aw_boot', name: 'Golden Boot', kind: 'Award', design: 'boot', c: ['#f2c14a', '#8a5a00'], blurb: 'Top scorer of the season in your squad.' },
  { id: 'aw_moy', name: 'Manager of the Year', kind: 'Award', design: 'medal', c: ['#f2c14a', '#1a2a6b'], blurb: 'Best record in your league.' },
  { id: 'aw_inv', name: 'The Invincibles', kind: 'Award', design: 'plate', c: ['#f5f5f5', '#c8102e'], blurb: 'Win the league without a defeat.' },
  { id: 'aw_double', name: 'The Double', kind: 'Award', design: 'cup', c: ['#f2c14a', '#2c7a36'], blurb: 'League and cup in one season.' },
  { id: 'aw_treble', name: 'The Treble', kind: 'Award', design: 'bigcup', c: ['#f2c14a', '#6a1b9a'], blurb: 'League, cup and continental.' },
  { id: 'aw_dyn', name: 'Dynasty', kind: 'Award', design: 'globe', c: ['#f2c14a', '#111111'], blurb: 'Five league titles in a career.' },
];
export const trophyById = id => TROPHIES.find(t => t.id === id);
export const cupIdFor = (kind, lg) => ({ league: 'lg_', cup: 'cup_', super: 'sup_' }[kind]) + lg;

let uid = 0;
// SVG art, 100 x 120 viewBox
export function trophyArt(id, px = 90, locked = false) {
  const T = trophyById(id), d = T ? T.design : 'cup', [m, a] = T ? T.c : ['#f2c14a', '#1a56c4'], n = 'g' + (uid++);
  const defs = `<defs><linearGradient id="${n}" x1="0" x2="1"><stop offset="0" stop-color="${shade(m, -0.25)}"/><stop offset="0.35" stop-color="${shade(m, 0.35)}"/><stop offset="0.7" stop-color="${m}"/><stop offset="1" stop-color="${shade(m, -0.35)}"/></linearGradient><linearGradient id="${n}b" x1="0" x2="1"><stop offset="0" stop-color="${shade(a, -0.3)}"/><stop offset="0.5" stop-color="${shade(a, 0.2)}"/><stop offset="1" stop-color="${shade(a, -0.3)}"/></linearGradient></defs>`;
  const G = `url(#${n})`, B = `url(#${n}b)`, base = `<rect x="28" y="106" width="44" height="9" rx="2" fill="${B}"/><rect x="35" y="98" width="30" height="9" rx="2" fill="${G}"/>`;
  let body = '';
  if (d === 'cup' || d === 'bigcup') {
    const big = d === 'bigcup';
    body = `${base}<path d="M44 98 L47 62 L53 62 L56 98Z" fill="${G}"/><ellipse cx="50" cy="62" rx="8" ry="3" fill="${G}"/>
      <path d="M26 14 Q27 58 50 64 Q73 58 74 14Z" fill="${G}"/><ellipse cx="50" cy="14" rx="24" ry="5" fill="${shade(m, 0.25)}"/>
      <path d="M27 20 C${big ? 2 : 10} ${big ? 14 : 22} ${big ? 4 : 12} ${big ? 62 : 52} 38 ${big ? 58 : 50}" fill="none" stroke="${G}" stroke-width="${big ? 6 : 4}" stroke-linecap="round"/>
      <path d="M73 20 C${big ? 98 : 90} ${big ? 14 : 22} ${big ? 96 : 88} ${big ? 62 : 52} 62 ${big ? 58 : 50}" fill="none" stroke="${G}" stroke-width="${big ? 6 : 4}" stroke-linecap="round"/>
      <rect x="40" y="30" width="20" height="13" rx="2" fill="${B}" opacity="0.9"/>${d === 'cup' ? `<path d="M40 8 Q50 -6 60 8Z" fill="${G}"/>` : ''}`;
  } else if (d === 'globe') {
    body = `${base}<rect x="36" y="86" width="28" height="12" fill="${B}"/><path d="M42 86 Q34 62 50 50 Q66 62 58 86Z" fill="${G}"/><path d="M42 80 Q50 70 58 80" fill="none" stroke="${shade(m, 0.4)}" stroke-width="2"/>
      <path d="M36 52 Q22 40 34 28 M64 52 Q78 40 66 28" fill="none" stroke="${G}" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="30" r="21" fill="${G}"/><ellipse cx="43" cy="22" rx="7" ry="4" fill="#fff" opacity="0.35" transform="rotate(-30 43 22)"/>`;
  } else if (d === 'crown') {
    body = `${base}<path d="M44 98 L46 66 L54 66 L56 98Z" fill="${G}"/><path d="M24 40 Q26 66 50 70 Q74 66 76 40Z" fill="${G}"/><ellipse cx="50" cy="40" rx="26" ry="5" fill="${shade(m, 0.25)}"/>
      <path d="M26 38 L30 12 L40 28 L50 6 L60 28 L70 12 L74 38Z" fill="${G}"/><circle cx="50" cy="6" r="3.5" fill="${B}"/><circle cx="30" cy="12" r="3" fill="${B}"/><circle cx="70" cy="12" r="3" fill="${B}"/><rect x="38" y="48" width="24" height="12" rx="2" fill="${B}"/>`;
  } else if (d === 'plate') {
    body = `${base}<path d="M45 98 L48 70 L52 70 L55 98Z" fill="${G}"/><ellipse cx="50" cy="56" rx="38" ry="22" fill="${G}"/><ellipse cx="50" cy="54" rx="30" ry="15" fill="${B}"/><ellipse cx="50" cy="54" rx="22" ry="10" fill="${shade(m, 0.1)}"/><path d="M34 56 L40 44 L50 54 L60 44 L66 56Z" fill="${G}"/>`;
  } else if (d === 'shield') {
    body = `${base}<path d="M20 12 L80 12 L80 54 Q80 80 50 98 Q20 80 20 54Z" fill="${G}"/><path d="M28 20 L72 20 L72 54 Q72 74 50 88 Q28 74 28 54Z" fill="${B}"/><path d="M50 28 l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="${G}"/>`;
  } else if (d === 'boot') {
    body = `<path d="M18 94 L18 52 Q18 40 30 40 L48 40 Q52 62 70 66 Q92 70 92 84 L92 96 Q92 100 86 100 L24 100 Q18 100 18 94Z" fill="${G}"/><path d="M18 90 L92 90 L92 98 Q92 102 86 102 L24 102 Q18 102 18 98Z" fill="${B}"/><g stroke="${shade(m, -0.45)}" stroke-width="2"><path d="M54 56 L64 52 M58 64 L68 60 M62 72 L72 68"/></g><path d="M24 36 Q20 28 30 24 L44 24" fill="none" stroke="${G}" stroke-width="4"/>`;
  } else { // medal
    body = `<path d="M30 0 L50 40 L70 0Z" fill="${B}"/><circle cx="50" cy="74" r="30" fill="${G}"/><circle cx="50" cy="74" r="22" fill="${B}"/><path d="M50 58 l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="${G}"/>`;
  }
  return `<svg viewBox="0 0 100 120" width="${px}" height="${Math.round(px * 1.2)}" class="tro${locked ? ' lock' : ''}" xmlns="http://www.w3.org/2000/svg">${defs}${body}</svg>`;
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return '#' + [f(r), f(g), f(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

// 3D model for the ceremony: a lathe-turned cup / globe / plate on a plinth, shiny gold with the second colour as a band
export function build3D(THREE, id) {
  const T = trophyById(id) || TROPHIES[8], g = new THREE.Group(), gold = new THREE.MeshPhongMaterial({ color: T.c[0], specular: 0xffffff, shininess: 110, emissive: new THREE.Color(T.c[0]).multiplyScalar(0.22) }), band = new THREE.MeshPhongMaterial({ color: T.c[1], specular: 0xffffff, shininess: 60, emissive: new THREE.Color(T.c[1]).multiplyScalar(0.18) });
  const lathe = (pts, mat) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 32), mat); g.add(m); return m; };
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.5, 24), band); plinth.position.y = 0.25; g.add(plinth);
  if (T.design === 'globe') { lathe([[0, 0.5], [1.0, 0.5], [1.0, 1.0], [0.6, 1.4], [0.45, 2.4], [0.7, 3.0], [0.2, 3.2]], gold); const s = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 20), gold); s.position.y = 3.9; g.add(s); const b2 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 32), band); b2.position.y = 3.9; b2.rotation.x = 1.2; g.add(b2); }
  else if (T.design === 'plate' || T.design === 'crown') { lathe([[0, 0.5], [0.5, 0.5], [0.4, 1.8], [0.9, 2.0], [1.7, 2.1], [1.9, 2.3], [1.7, 2.35], [0, 2.4]], gold); const d = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.08, 32), band); d.position.y = 2.42; g.add(d); for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), gold); const a = i / 5 * 6.28; c.position.set(Math.cos(a) * 0.9, 2.95, Math.sin(a) * 0.9); g.add(c); } }
  else if (T.design === 'shield') { const sh = new THREE.Shape(); sh.moveTo(-1.5, 0); sh.lineTo(1.5, 0); sh.lineTo(1.5, 2.4); sh.quadraticCurveTo(1.4, 3.7, 0, 4.3); sh.quadraticCurveTo(-1.4, 3.7, -1.5, 2.4); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), gold); m.position.set(0, 0.7, -0.17); g.add(m); const inner = new THREE.Mesh(new THREE.CircleGeometry(0.85, 6), band); inner.position.set(0, 2.9, 0.3); g.add(inner); }
  else if (T.design === 'boot' || T.design === 'medal') { const s = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 32), gold); s.rotation.x = Math.PI / 2; s.position.y = 2.5; g.add(s); const r = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 10, 32), band); r.position.y = 2.5; g.add(r); lathe([[0, 0.5], [0.8, 0.5], [0.4, 1.1], [0.35, 1.3], [0, 1.3]], gold); }
  else { const big = T.design === 'bigcup'; lathe([[0, 0.5], [1.1, 0.5], [1.1, 0.95], [0.55, 1.4], [0.35, 2.3], [0.45, 2.7], [1.0, 3.1], [1.5, 3.7], [1.65, 4.6], [1.55, 5.2], [0, 5.2]], gold);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 8, 32), band); ring.rotation.x = Math.PI / 2; ring.position.y = 5.2; g.add(ring);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(big ? 1.1 : 0.8, big ? 0.17 : 0.11, 10, 24, Math.PI), gold); h.position.set(s * 1.55, 4.4, 0); h.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2; h.rotation.y = 0; g.add(h); }
    if (T.design === 'cup') { const lid = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.8, 24), gold); lid.position.y = 5.6; g.add(lid); } }
  g.scale.setScalar(0.75); return g;
}

// career awards / achievements shown in the trophy room
export const ACHS = [
  ['a_first', 'First Win', 'Win a match in any competition.'], ['a_trophy', 'First Silverware', 'Win your first trophy.'], ['a_goals50', 'Goal Machine', 'Score 50 goals in a career.'], ['a_goals200', 'Goal Legend', 'Score 200 goals in a career.'],
  ['a_comeback', 'Never Give Up', 'Win a match after being behind.'], ['a_big', 'Rout', 'Win a match by 5 or more goals.'], ['a_season3', 'Veteran', 'Complete three seasons in career mode.'], ['a_pens', 'Nerves of Steel', 'Win a penalty shoot-out.'],
  ['a_rich', 'Financial Muscle', 'Hold a budget of 150M or more.'], ['a_cont', 'Conquer Europe', 'Win the continental title in career mode.'],
];
export function unlock(save, id) { save.ach = save.ach || {}; if (save.ach[id]) return false; save.ach[id] = Date.now(); return true; }
