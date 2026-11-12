// APEX CLASH — boot, main loop, menus, career, MultiClash (split-screen + online rooms).
import * as THREE from 'three';
import { loadAll, makePerson, HANS } from './assets.js';
import { TRACKS, trackById } from './track.js';
import { Race, getTrack } from './race.js';
import { flagURL, flagCanvas } from './flags.js';
import { vehicleThumb } from './thumbs.js';
import { Vehicle } from './vehicle.js';
import { VEHICLES, idsOf, PAINTS, AI_NAMES, RULES, RULE_HELP, TOUR, COUNTRIES, KINDS, rulesFor, countryById, TRACK_ENV, levelOf, xpFor, rankOf, UPGRADES, save, persist, resetSave, statsFor } from './data.js';
import * as input from './input.js';
import * as audio from './audio.js';
import * as ui from './ui.js';
import { Net } from './net.js';

const S = save.settings;
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.quality === 'high', powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const game = { renderer, scene: new THREE.Scene(), race: null, quality: S.quality === 'auto' ? 'medium' : S.quality, togglePause };
let resScale = S.quality === 'low' ? 0.7 : S.quality === 'high' ? 1 : 0.85;
function resize() { const pr = Math.min(window.devicePixelRatio || 1, S.quality === 'high' ? 1.5 : 1) * resScale; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); }
addEventListener('resize', resize); resize();
addEventListener('pointerdown', audio.initAudio); addEventListener('keydown', audio.initAudio);

const pick = a => a[Math.floor(Math.random() * a.length)];
const cyc = (arr, cur, d = 1) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
const trackName = id => trackById(id).name;
const paintOf = id => save.paint[id] ?? VEHICLES[id].color;
const myVeh = kind => save.sel[kind];
const DIFFS = { easy: 0.74, medium: 0.86, hard: 0.97 };

// ---------------- showroom (garage preview + podium) ----------------
const show = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(40, 1, 0.1, 200), active: false, a: 0, veh: null, people: [], dist: 9 };
{
  show.scene.background = new THREE.Color(0x0d1018);
  show.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x20222a, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(4, 8, 5); show.scene.add(d);
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, '#59627a'); r.addColorStop(0.6, '#262b3a'); r.addColorStop(1, '#0d1018'); g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })); floor.rotation.x = -Math.PI / 2; show.scene.add(floor);
  show.podium = new THREE.Group(); show.scene.add(show.podium);
}
function clearShow() { if (show.veh) { show.veh.dispose(); show.veh = null; } for (const p of show.people) { show.podium.remove(p.root); p.dispose(); } show.people = []; show.podium.clear(); }
function showVehicle(id) {
  clearShow(); show.active = true; show.scene.environment = game.scene.environment;
  show.veh = new Vehicle(show.scene, statsFor(id, save.owned[id]), { color: paintOf(id), person: HANS }); show.veh.syncVisual(0.016);
  if (VEHICLES[id].kind !== 'bike') { const p = makePerson(HANS); p.root.position.set(VEHICLES[id].kind === 'car' ? -1.9 : -3.2, 0, 1.4); p.root.rotation.y = -0.5; p.play('Idle', 0); show.podium.add(p.root); show.people.push(p); }
  show.dist = { bike: 6, car: 9.5, boat: 11, heli: 13, plane: 13, space: 12 }[VEHICLES[id].kind]; show.look = 0.7;
}
function showPodium(list) { // list: [{name, person}] winner first
  clearShow(); show.active = true; show.dist = 8.5; show.look = 1.5;
  const hs = [1.1, 0.75, 0.5], xs = [0, -1.7, 1.7], cols = [0xffcf2e, 0xc9d1dc, 0xd08a4a], dances = ['Dance1', 'Dance2', 'Jump'];
  list.slice(0, 3).forEach((e, i) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, hs[i], 1.6), new THREE.MeshLambertMaterial({ color: cols[i] })); box.position.set(xs[i], hs[i] / 2, 0); show.podium.add(box);
    const p = makePerson(e.person ?? i); p.root.position.set(xs[i], hs[i], 0); p.play(dances[i], 0); show.podium.add(p.root); show.people.push(p);
  });
}
function showWinner(person, countryId) { // the winner raises the flag
  clearShow(); show.active = true; show.dist = 9.5; show.look = 2.6;
  const box = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.6, 20), new THREE.MeshLambertMaterial({ color: 0xffcf2e })); box.position.y = 0.3; show.podium.add(box);
  const p = makePerson(person); p.root.position.set(0, 0.6, 0); p.play('Jump', 0); show.podium.add(p.root); show.people.push(p);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd })); pole.position.set(0.75, 2.7, 0); show.podium.add(pole);
  const ft = new THREE.CanvasTexture(flagCanvas(countryId, 192, 128)); ft.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2, 8, 1), new THREE.MeshBasicMaterial({ map: ft, side: THREE.DoubleSide })); flag.position.set(1.68, 4.15, 0); show.podium.add(flag); show.flag = flag;
}
function hideShow() { show.flag = null; show.active = false; clearShow(); }

// ---------------- race lifecycle ----------------
function disposeRace() { if (game.race) { game.race.dispose(); game.race = null; } }
function startDemo() {
  disposeRace(); const kind = pick(['car', 'car', 'bike', 'boat', 'heli', 'plane', 'space']), ids = idsOf(kind);
  game.race = new Race(game, { demo: true, track: pick(TRACKS).id, laps: 999, rule: 'sprint', entrants: Array.from({ length: 6 }, (_, i) => ({ id: 'ai' + i, name: AI_NAMES[i], veh: pick(ids), color: PAINTS[i], type: 'ai', skill: 0.8 + i * 0.03, person: i })) });
}
function launch(cfg) {
  if (cfg.weather === undefined || cfg.weather === 'auto') cfg.weather = (TRACK_ENV[cfg.track] || {}).weather || null;
  hideShow(); ui.hideMenu(); ui.loading(0.5, 'Building ' + trackName(cfg.track) + '…');
  setTimeout(() => { disposeRace(); game.race = new Race(game, cfg); ui.loading(1); }, 40);
}
function aiEntrants(kind, n, skill, playerVeh) {
  const cap = VEHICLES[playerVeh || myVeh(kind)].price * 1.4 + 9000, ids = idsOf(kind).filter(i => VEHICLES[i].price <= cap), names = [...AI_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => ({ id: 'ai' + i, name: names[i % names.length], veh: pick(ids), color: PAINTS[(i + 3) % PAINTS.length], type: 'ai', skill: skill + (Math.random() - 0.5) * 0.06 - i * 0.008, person: i + 1 }));
}
// the player starts at the back for sprints, mid-pack for other rules
const grid = (ais, p, rule) => { const a = [...ais]; a.splice(rule === 'sprint' ? a.length : Math.ceil(a.length / 2), 0, p); return a; };
const me = (kind, device = 'all') => ({ id: 'p0', name: save.name, veh: myVeh(kind), up: save.owned[myVeh(kind)], color: paintOf(myVeh(kind)), type: 'local', device, person: HANS });
function togglePause() {
  const r = game.race; if (!r || r.cfg.demo || r.over) return;
  if (r.paused) { r.paused = false; ui.hideMenu(); r.locals.forEach(v => input.read(v.device)); return; }
  r.paused = true; audio.silence();
  ui.menu({ id: 'pause', title: 'Paused', cls: 'narrow', items: [
    { label: 'Resume', cls: 'primary', onClick: togglePause },
    !r.net && r.cfg.restart ? { label: 'Restart', onClick: () => { const c = r.cfg; c.restart(); } } : null,
    { label: r.net ? 'Leave race' : 'Quit to menu', onClick: quitToMenu },
  ], back: togglePause });
}
function quitToMenu() { if (net) { net.leave(); net = null; } mc = null; startDemo(); mainMenu(); }

// ---------------- menus ----------------
const TIPS = ['Drift round corners to fill your nitro.', 'Tuck in behind a rival for a slipstream boost.', 'In Combat races, hold FIRE (Y / F) to use your weapon.', 'Stopped next to a cop? Move, or you are busted!', 'Mines are dropped behind you – great when someone is on your tail.', 'A shield blocks rockets, mines and bullets for 7 seconds.', 'Smash through a roadblock at full speed, or squeeze past the gap.'];
function xpBar() { const lv = levelOf(save.xp), a = xpFor(lv), b = xpFor(lv + 1); return `<div class="xp"><b>LV ${lv} · ${rankOf(lv)}</b><div><i style="width:${Math.round((save.xp - a) / (b - a) * 100)}%"></i></div><span>${save.xp - a}/${b - a} XP</span></div>`; }
function mainMenu() {
  hideShow();
  const stars = k => Object.values(save.tour[k]).reduce((a, b) => a + b, 0), tot = Object.keys(KINDS).reduce((a, k) => a + stars(k), 0), car = myVeh('car');
  ui.menu({ id: 'main', title: 'APEX CLASH', logo: true, sub: `Welcome, ${save.name}  ·  ${save.credits.toLocaleString()} credits`, cls: 'main', items: [
    { html: xpBar() },
    { card: true, key: 'tour', label: 'World Tour', hint: '6 classes · 8 countries · 192 levels', icon: 'globe', accent: '#ff7a1a', img: vehicleThumb(car, paintOf(car)), badge: `${ui.stars(1, 1)} ${tot}/576`, onClick: () => tourMenu('car') },
    { card: true, key: 'quick', label: 'Quick Race', hint: '11 race types · police · weather', icon: 'bolt', accent: '#35f0ff', img: vehicleThumb(myVeh('bike'), paintOf(myVeh('bike'))), onClick: quickMenu },
    { card: true, key: 'clash', label: 'MultiClash', hint: 'Friends: split-screen or Wi-Fi', icon: 'users', accent: '#ff3fa0', img: vehicleThumb('kestrel', 0xff3fa0), onClick: clashMenu },
    { card: true, key: 'garage', label: 'Garage', hint: 'Buy, upgrade and paint', icon: 'wrench', accent: '#3df58a', img: vehicleThumb(myVeh('space'), paintOf(myVeh('space'))), badge: `${save.credits.toLocaleString()} cr`, onClick: () => garageMenu('car') },
    { card: true, size: 'small', key: 'set', label: 'Settings', icon: 'gear', accent: '#9aa5bd', onClick: settingsMenu },
    { card: true, size: 'small', key: 'how', label: 'How to Play', icon: 'book', accent: '#9aa5bd', onClick: howMenu },
    { html: `<div class="tipline">Tip: ${pick(TIPS)}</div>` },
  ] });
}
// small outline of a circuit for the menus
const mapCache = {};
function trackMap(id) {
  if (mapCache[id]) return mapCache[id];
  const T = getTrack(id), c = document.createElement('canvas'); c.width = 240; c.height = 168; const g = c.getContext('2d');
  let a = 1e9, b = -1e9, e = 1e9, f = -1e9; for (let i = 0; i < T.N; i++) { a = Math.min(a, T.x[i]); b = Math.max(b, T.x[i]); e = Math.min(e, T.z[i]); f = Math.max(f, T.z[i]); }
  const sc = Math.min(210 / (b - a), 140 / (f - e)), ox = (240 - (b - a) * sc) / 2, oz = (168 - (f - e) * sc) / 2;
  g.lineJoin = 'round'; for (const [w, col] of [[9, 'rgba(0,0,0,.55)'], [5, '#fff']]) { g.beginPath(); for (let i = 0; i <= T.N; i += 3) { const k = i % T.N, x = 240 - ((T.x[k] - a) * sc + ox), y = (T.z[k] - e) * sc + oz; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.lineWidth = w; g.strokeStyle = col; g.stroke(); }
  g.fillStyle = '#ffc21f'; g.beginPath(); g.arc(240 - ((T.x[0] - a) * sc + ox), (T.z[0] - e) * sc + oz, 6, 0, 7); g.fill();
  return (mapCache[id] = { url: c.toDataURL(), km: (T.length / 1000).toFixed(1) });
}
const trackCard = id => { const t = trackById(id), c = countryById(t.country), m = trackMap(id); return `<div class="crow"><img class="flag" src="${flagURL(c.id)}" alt=""><div><b>${t.name}</b><span>${c.name} · ${m.km} km · ${{ day: 'Day', sunset: 'Sunset', dusk: 'Dusk', night: 'Night', overcast: 'Overcast' }[t.theme]}</span></div><img class="map" src="${m.url}" alt=""></div>`; };

// cops + civilian traffic for a race (ids are stable so online clients agree)
function npcEntrants(rule, cops = 0, traffic = 0, kind = 'car', police = false) {
  const out = [], civ = ['fox', 'orion', 'meridian', 'atlas'];
  if (rule === 'catch') { const ids = idsOf(kind).sort((a, b) => VEHICLES[b].price - VEHICLES[a].price); out.push({ id: 'runner', name: 'TARGET', veh: ids[1] || ids[0], color: 0xffe14a, type: 'runner' }); }
  if (kind !== 'car' && kind !== 'bike') return out;
  if (police && !['rush', 'combat', 'pursuit'].includes(rule)) for (let i = 0; i < 2; i++) out.push({ id: 'cop' + i, name: 'POLICE', veh: 'police', color: 0xf2f2f5, type: 'cop' });
  if (rule === 'rush' || rule === 'combat') for (let i = 0; i < 2; i++) out.push({ id: 'cop' + i, name: 'POLICE', veh: 'police', color: 0xf2f2f5, type: 'cop' });
  if (rule === 'pursuit') { for (let i = 0; i < Math.max(2, cops); i++) out.push({ id: 'cop' + i, name: 'POLICE', veh: 'police', color: 0xf2f2f5, type: 'cop' }); for (let i = 0; i < 2; i++) out.push({ id: 'blk' + i, name: 'POLICE', veh: 'police', color: 0xf2f2f5, type: 'cop', block: true }); }
  for (let i = 0; i < traffic; i++) out.push({ id: 'civ' + i, name: '', veh: civ[i % civ.length], color: [0x9aa3ad, 0x7a4b2a, 0xdedede, 0x2d4a6e, 0x8d1f1f][i % 5], type: 'traffic' });
  return out;
}
function award(pos, total, bonus = 0) { const xp = 40 + Math.max(0, total - pos) * 15 + bonus, before = levelOf(save.xp); save.xp += xp; save.stats.races++; if (pos === 1) save.stats.wins++; persist(); if (levelOf(save.xp) > before) ui.toast(`LEVEL UP!  You are now Level ${levelOf(save.xp)} · ${rankOf(levelOf(save.xp))}`); return xp; }
function statRow(me_, xp) { return `<div class="statrow"><div><b>${me_.best ? ui.fmtTime(me_.best) : '—'}</b>best lap</div><div><b>${me_.top || 0}</b>top km/h</div><div><b>${me_.kills || 0}</b>takedowns</div>${me_.mayhem ? `<div><b>+${me_.mayhem}</b>mayhem cr</div>` : ''}<div><b>+${xp}</b>XP</div></div>`; }

const q = { kind: 'car', veh: null, country: 'cm', track: 'douala', laps: 3, ai: 5, diff: 'medium', rule: 'sprint', traffic: 0, police: false, weather: 'auto' };
function quickMenu() {
  hideShow();
  const ids = idsOf(q.kind); if (!ids.includes(q.veh)) q.veh = myVeh(q.kind);
  const c = countryById(q.country); if (!c.tracks.includes(q.track)) q.track = c.tracks[0];
  const re = quickMenu, opt = (label, value, fn) => ({ label, value, cycle: true, onClick: () => { fn(1); re(); }, onLeft: () => { fn(-1); re(); } });
  const lapR = ['sprint', 'combat', 'pursuit', 'trial', 'rush', 'relay'].includes(q.rule), road = q.kind === 'car' || q.kind === 'bike', rec = save.best[q.track + '_' + q.kind];
  ui.menu({ id: 'quick', title: 'Quick Race', sub: RULE_HELP[q.rule] + (q.rule === 'trial' && rec ? `  Record: ${ui.fmtTime(rec)}` : ''), items: [
    { html: trackCard(q.track) },
    opt('Country', c.name, d => { q.country = cyc(COUNTRIES.map(x => x.id), q.country, d); q.track = countryById(q.country).tracks[0]; }),
    opt('Track', trackName(q.track), d => q.track = cyc(c.tracks, q.track, d)),
    opt('Class', KINDS[q.kind], d => { q.kind = cyc(Object.keys(KINDS), q.kind, d); q.veh = null; if (!rulesFor(q.kind).includes(q.rule)) q.rule = 'sprint'; }),
    opt('Race type', RULES[q.rule], d => q.rule = cyc(rulesFor(q.kind), q.rule, d)),
    opt('Vehicle', VEHICLES[q.veh].name, d => q.veh = cyc(ids, q.veh, d)),
    lapR ? opt('Laps', q.laps, d => q.laps = cyc([1, 2, 3, 4, 5], q.laps, d)) : null,
    q.rule !== 'trial' && q.rule !== 'versus' ? opt('Opponents', q.ai, d => q.ai = cyc([1, 2, 3, 4, 5, 6, 7], q.ai, d)) : null,
    q.rule !== 'trial' ? opt('Difficulty', q.diff, d => q.diff = cyc(Object.keys(DIFFS), q.diff, d)) : null,
    road && !['pursuit', 'rush', 'combat', 'trial'].includes(q.rule) ? opt('Police patrol', q.police ? 'On – they chase reckless drivers' : 'Off', () => q.police = !q.police) : null,
    opt('Weather', { auto: 'Track default', clear: 'Clear', rain: 'Rain', snow: 'Snow' }[q.weather], d => q.weather = cyc(['auto', 'clear', 'rain', 'snow'], q.weather, d)),
    q.rule !== 'trial' && road ? opt('Civilian traffic', q.traffic ? q.traffic + ' cars' : 'Off', d => q.traffic = cyc([0, 3, 5], q.traffic, d)) : null,
    { label: 'START RACE', icon: 'flag', cls: 'primary', onClick: startQuick },
  ], back: mainMenu });
}
function startQuick() {
  if (!idsOf(q.kind).includes(q.veh)) q.veh = myVeh(q.kind);
  const p = { ...me(q.kind), veh: q.veh, up: save.owned[q.veh] || null, color: paintOf(q.veh) }, trial = q.rule === 'trial', key = q.track + '_' + q.kind;
  launch({ track: q.track, laps: q.laps, rule: q.rule, seed: Date.now() % 1e6, record: save.best[key], restart: startQuick, weather: q.weather === 'clear' ? null : q.weather,
    entrants: trial ? [p] : [...grid(aiEntrants(q.kind, q.rule === 'versus' ? 1 : q.ai, DIFFS[q.diff] + (q.rule === 'versus' ? 0.06 : 0), q.veh), p, q.rule), ...npcEntrants(q.rule, 3, q.rule === 'rush' ? Math.max(4, q.traffic) : q.traffic, q.kind, q.police)], peds: q.rule === 'rush' ? 6 : 0,
    onEnd: res => {
      const m = res.find(r => r.type === 'local'), xp = award(m.pos, res.length); if (m.mayhem) { save.credits += m.mayhem; persist(); }
      if (trial) { const old = save.best[key], rec = m.best && (!old || m.best < old); if (rec) { save.best[key] = m.best; persist(); audio.sfx('win'); }
        return resultsMenu(res, { title: rec ? 'New record!' : 'Time Trial', sub: `${trackName(q.track)}  ·  Best lap ${m.best ? ui.fmtTime(m.best) : '—'}${old ? '  ·  Previous record ' + ui.fmtTime(old) : ''}`, extra: statRow(m, xp), again: startQuick }); }
      resultsMenu(res, { title: m.busted ? 'Busted!' : 'Race Results', sub: trackName(q.track) + ' · ' + RULES[q.rule], extra: statRow(m, xp), again: startQuick });
    } });
}

function resultsMenu(res, o) {
  const rule = game.race ? game.race.rule : 'sprint';
  ui.hudClear();
  const medal = ui.medal;
  const rows = res.map(r => `<div class="res ${r.type === 'local' || r.mine ? 'me' : ''}"><b>${medal(r.pos)}</b><span>${r.name}</span><em>${o.pts ? '+' + o.pts(r) + ' pts' : rule === 'orbs' ? r.score + ' orbs' : rule === 'knockdown' ? r.score + ' takedowns' : rule === 'gates' ? r.score + ' pts' : rule === 'toxic' ? (r.out ? 'OUT · ' : '') + r.score + ' infected' : rule === 'catch' ? (r.caught ? 'CAUGHT IT' : '—') : r.busted ? 'BUSTED' : r.out ? 'OUT' : r.time ? ui.fmtTime(r.time) : '—'}</em></div>`).join('');
  ui.menu({ id: 'results', cls: o.cls, title: o.title, sub: o.sub, items: [{ html: rows, cls: 'reslist' }, o.extra ? { html: o.extra } : null,
    o.next ? { label: o.nextLabel || 'Continue', cls: 'primary', onClick: o.next } : null, o.again ? { label: 'Race again', icon: 'refresh', cls: o.next ? '' : 'primary', onClick: o.again } : null,
    o.wait ? { text: o.wait, cls: 'dim' } : null, { label: 'Main menu', icon: 'exit', onClick: quitToMenu }] });
}

// ----- World Tour
const tsel = Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]));
const countryStars = (kind, ci) => TOUR[kind][ci].reduce((a, e) => a + (save.tour[kind][e.id] || 0), 0);
const countryOpen = (kind, ci) => ci === 0 || (save.tour[kind][TOUR[kind][ci - 1][3].id] || 0) > 0;
function tourMenu(kind) {
  hideShow(); const ci = tsel[kind], c = COUNTRIES[ci], ev = TOUR[kind][ci], open = countryOpen(kind, ci), st = save.tour[kind];
  const total = COUNTRIES.reduce((a, _, i) => a + countryStars(kind, i), 0), re = () => tourMenu(kind);
  ui.menu({ id: 'tour', title: 'World Tour', sub: `${KINDS[kind]}  ·  ${total}/96 stars  ·  ${save.credits.toLocaleString()} credits  ·  Driving: ${VEHICLES[myVeh(kind)].name}`, items: [
    { row: [{ key: 'class', label: 'Class', value: KINDS[kind], cycle: true, onClick: () => tourMenu(cyc(Object.keys(KINDS), kind, 1)), onLeft: () => tourMenu(cyc(Object.keys(KINDS), kind, -1)) }, { label: 'Garage', cls: 'tab', onClick: () => garageMenu(kind) }] },
    { html: `<div class="crow"><img class="flag" src="${flagURL(c.id)}" alt=""><div><b>${ci + 1}. ${c.name}</b><span>${open ? countryStars(kind, ci) + '/12 stars' : 'Locked – win a star in the ' + COUNTRIES[ci - 1].name + ' Grand Final'}</span></div><img class="map" src="${trackMap(c.tracks[0]).url}" alt=""></div>` },
    { key: 'country', label: 'Country', value: `${c.name}  (${ci + 1}/8)`, cycle: true, onClick: () => { tsel[kind] = (ci + 1) % 8; re(); }, onLeft: () => { tsel[kind] = (ci + 7) % 8; re(); } },
    ...ev.map((e, i) => {
      const ok = open && (i === 0 || (st[ev[i - 1].id] || 0) > 0), s = st[e.id] || 0;
      return { key: 'ev' + i, label: `${i + 1}. ${e.name}`, hint: `${trackName(e.track)} · ${RULES[e.rule]}${e.traffic ? ' · traffic' : ''} · ${e.ai} rivals · ${e.prize.toLocaleString()} cr`, valueHtml: ok ? ui.stars(s) : `${ui.icon('lock')}`, icon: ok ? ({ sprint: 'flag', versus: 'users', knockdown: 'car', toxic: 'bolt', gates: 'refresh', catch: 'timer', pursuit: 'exit' }[e.rule] || 'flag') : 'lock', disabled: !ok, cls: ok && !s ? 'primary' : '', onClick: () => startTour(kind, ci, i) };
    }),
  ], back: mainMenu });
}
function startTour(kind, ci, i) {
  const e = TOUR[kind][ci][i]; tsel[kind] = ci;
  launch({ track: e.track, laps: e.laps || 3, rule: e.rule, seed: ci * 10 + i + 7, restart: () => startTour(kind, ci, i),
    entrants: [...grid(aiEntrants(kind, e.rule === 'versus' ? 1 : e.ai, e.skill + (e.rule === 'versus' ? 0.05 : 0)), me(kind), e.rule), ...npcEntrants(e.rule, e.cops, e.traffic || 0, kind, ci >= 3)], peds: e.peds || 0,
    onEnd: res => {
      const m = res.find(r => r.type === 'local'), pos = m.pos, stars = m.busted ? 0 : pos === 1 ? 3 : pos === 2 ? 2 : pos === 3 ? 1 : 0, prize = Math.round(e.prize * ([1, 0.6, 0.35][pos - 1] || 0.1));
      const xp = award(pos, res.length, stars * 30); save.credits += prize + (m.mayhem || 0); save.tour[kind][e.id] = Math.max(save.tour[kind][e.id] || 0, stars); if (m.busted) save.stats.busted++; persist();
      if (stars) audio.sfx('win');
      const won = pos === 1 && !m.busted; if (won) { const tc = trackById(e.track).country; setTimeout(() => showWinner(HANS, tc), 60); }
      const lastEv = i === 3, lastC = ci === COUNTRIES.length - 1, nextFn = !stars ? null : !lastEv ? () => startTour(kind, ci, i + 1) : !lastC ? () => { tsel[kind] = ci + 1; tourMenu(kind); } : null;
      resultsMenu(res, { cls: won ? 'left' : '', title: m.busted ? 'Busted!' : won ? 'Winner! Raise the flag!' : stars ? `${ui.ordinal(pos)} place!` : 'Not this time…', sub: `${stars}/3 stars   ·   +${prize.toLocaleString()} credits` + (stars ? '' : '  ·  Finish top 3 to unlock the next level'),
        next: nextFn, nextLabel: lastEv ? `Next country: ${lastC ? '' : COUNTRIES[ci + 1].name}` : 'Next level', again: () => startTour(kind, ci, i),
        extra: statRow(m, xp) + (stars && lastEv ? `<div class="champ">${lastC ? ui.icon('trophy') + ' WORLD CHAMPION! You conquered the World Tour.' : ui.icon('flag') + ' ' + COUNTRIES[ci].name + ' conquered!'}</div>` : '') });
    } });
}

// ----- garage
const gsel = {};
function garageMenu(kind) {
  const ids = idsOf(kind); gsel[kind] = gsel[kind] || myVeh(kind); const id = gsel[kind], v = VEHICLES[id], own = save.owned[id], st = statsFor(id, own), re = () => garageMenu(kind);
  showVehicle(id);
  const bar = (n, val, max) => `<div class="stat"><span>${n}</span><div><i style="width:${Math.min(100, val / max * 100)}%"></i></div></div>`;
  ui.menu({ id: 'garage', title: 'Garage', cls: 'left', sub: `${save.credits.toLocaleString()} credits`, items: [
    { key: 'class', label: 'Class', value: KINDS[kind], cycle: true, onClick: () => garageMenu(cyc(Object.keys(KINDS), kind, 1)), onLeft: () => garageMenu(cyc(Object.keys(KINDS), kind, -1)) },
    { key: 'veh', label: 'Vehicle', value: v.name, cycle: true, onClick: () => { gsel[kind] = cyc(ids, id, 1); re(); }, onLeft: () => { gsel[kind] = cyc(ids, id, -1); re(); } },
    { html: bar('Top speed', st.top, 100) + bar('Acceleration', st.acc, 32) + bar('Handling', st.grip, 36) + bar('Nitro', st.nitro, 1.8) + `<div class="kmh">${Math.round(st.top * 3.6)} km/h</div>` },
    own ? { key: 'use', label: myVeh(kind) === id ? 'Selected ✓' : 'Use this vehicle', cls: 'primary', disabled: myVeh(kind) === id, onClick: () => { save.sel[kind] = id; persist(); re(); } }
        : { key: 'use', label: 'Buy', value: v.price.toLocaleString() + ' cr', cls: 'primary', disabled: save.credits < v.price, onClick: () => { save.credits -= v.price; save.owned[id] = { eng: 0, grip: 0, nitro: 0 }; save.sel[kind] = id; persist(); audio.sfx('win'); re(); } },
    ...(own ? UPGRADES.map(u => { const lv = own[u.key], cost = u.cost[lv]; return { key: 'up' + u.key, label: `${u.name} upgrade`, hint: 'Level ' + lv + '/3', value: lv >= 3 ? 'MAX' : cost.toLocaleString() + ' cr', disabled: lv >= 3 || save.credits < cost, onClick: () => { save.credits -= cost; own[u.key]++; persist(); audio.sfx('orb'); re(); } }; }) : []),
    { key: 'paint', label: 'Paint', value: 'Change colour', cycle: true, onClick: () => { save.paint[id] = cyc(PAINTS, PAINTS.includes(paintOf(id)) ? paintOf(id) : PAINTS[0], 1); persist(); re(); }, onLeft: () => { save.paint[id] = cyc(PAINTS, PAINTS.includes(paintOf(id)) ? paintOf(id) : PAINTS[0], -1); persist(); re(); } },
  ], back: mainMenu });
}

// ----- settings / help
function settingsMenu() {
  const re = settingsMenu, vols = [0, 0.2, 0.4, 0.6, 0.8, 1], near = v => vols.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  const opt = (label, value, fn, hint) => ({ label, value, hint, cycle: true, onClick: () => { fn(1); persist(); audio.setVolumes(); re(); }, onLeft: () => { fn(-1); persist(); audio.setVolumes(); re(); } });
  ui.menu({ id: 'settings', title: 'Settings', items: [
    opt('Driving help', { easy: 'Easy (auto-brake + steering help)', normal: 'Normal', pro: 'Pro (no help)' }[S.assist], d => S.assist = cyc(['easy', 'normal', 'pro'], S.assist, d)),
    opt('Auto-accelerate', S.autoGas ? 'On' : 'Off', () => S.autoGas = !S.autoGas, 'Just steer – the gas is held for you'),
    opt('Graphics', S.quality[0].toUpperCase() + S.quality.slice(1), d => S.quality = cyc(['auto', 'low', 'medium', 'high'], S.quality, d), 'Restart the game to apply'),
    opt('Music volume', Math.round(S.music * 100) + '%', d => S.music = cyc(vols, near(S.music), d)),
    opt('Sound volume', Math.round(S.sfx * 100) + '%', d => S.sfx = cyc(vols, near(S.sfx), d)),
    { input: true, key: 'name', label: 'Player name', value: save.name, max: 12, onInput: v => { save.name = v.trim().slice(0, 12) || 'Racer'; persist(); } },
    { label: 'Reset all progress', cls: 'danger', onClick: () => { if (confirm('Erase career, credits and garage?')) { resetSave(); location.reload(); } } },
  ], back: mainMenu });
}
function howMenu() {
  ui.menu({ id: 'how', title: 'How to Play', items: [{ html: `
    <table class="how"><tr><th></th><th>Controller</th><th>Keyboard</th><th>Keyboard P2</th></tr>
    <tr><td>Steer</td><td>Left stick / D-pad</td><td>A · D</td><td>← · →</td></tr>
    <tr><td>Accelerate</td><td>RT or A</td><td>W</td><td>↑</td></tr>
    <tr><td>Brake / reverse</td><td>LT</td><td>S</td><td>↓</td></tr>
    <tr><td>Nitro boost</td><td>X or RB</td><td>Left Shift</td><td>Right Shift</td></tr>
    <tr><td>Drift (handbrake)</td><td>B</td><td>Space</td><td>Right Ctrl</td></tr>
    <tr><td>Punch / shove rival</td><td>LB</td><td>Q</td><td>,</td></tr>
    <tr><td>Air tricks (on ramps)</td><td>steer = spin · LT / B = flip</td><td>A/D · S / Space</td><td>←/→ · ↓</td></tr>
    <tr><td>Climb / dive (air &amp; space)</td><td>Right stick up / down</td><td>I · K</td><td>PgUp · PgDn</td></tr>
    <tr><td>Fire weapon</td><td>Y</td><td>F or E</td><td>/</td></tr>
    <tr><td>Change camera</td><td>D-pad up / R3</td><td>C</td><td>.</td></tr>
    <tr><td>Back on track</td><td>Back / Select</td><td>R</td><td>Backspace</td></tr>
    <tr><td>Pause</td><td>Start</td><td>Esc</td><td>Esc</td></tr></table>
    <p class="tip"><b>Stages:</b> <i>Combat</i> – grab crates for guns, rockets, mines and shields (firing alerts the police). <i>Police Chase</i> – don't get stopped beside a cop. <i>City Rush</i> – traffic and pedestrians; knock someone over and you are wanted. <i>Land &amp; Sea Relay</i> – the water section turns your ride into a boat. <i>Ramps</i> – spin and flip in the air, but land straight or you wreck.</p>
    <p class="tip"><b>Tips:</b> Drift round corners and tuck in behind rivals to fill your <b>nitro</b>. With <b>Driving help: Easy</b> the game brakes for corners and nudges you off the walls – just hold accelerate and steer. Plug in a controller any time; it is picked up automatically.</p>
    <p class="tip"><b>Play with friends:</b> MultiClash → <i>Split-screen</i> for up to 4 players on this PC, or <i>Host a room</i> and give friends on the same Wi-Fi the address shown plus the 4-digit room code.</p>
    <p class="tip"><b>APEX CLASH</b> © 2026 <b>Anye Happiness Ade</b> — AI Engineer, Cameroon.</p>
    <p class="tip dim">Music: ${audio.MUSIC.map(m => `“${m.title}” by ${m.artist}`).join(' · ')} (CC BY 3.0, Jamendo).</p>` },
  ], back: mainMenu });
}

// ---------------- MultiClash ----------------
let mc = null, net = null;
const POINTS = [10, 7, 5, 4, 3, 2, 1, 0];
const ROUND_RULES = ['sprint', 'combat', 'relay', 'elim', 'pursuit'], SPLIT_RULES = ['sprint', 'knockdown', 'gates', 'toxic', 'combat', 'relay', 'elim', 'pursuit'];
function clashMenu() {
  hideShow(); if (net) { net.leave(); net = null; } mc = null;
  ui.menu({ id: 'clash', title: 'MultiClash', sub: 'A tournament of mixed rounds – Sprint, Elimination and Orb Rush. Most points takes the crown.', cls: 'narrow', items: [
    { label: 'Split-screen', hint: '2–4 players on this PC', cls: 'primary', onClick: () => { mc = newClash('split'); splitLobby(); } },
    { label: 'Host a room', hint: 'Friends join over Wi-Fi / LAN', onClick: hostRoom },
    { label: 'Join a room', hint: 'Enter a 4-digit code', onClick: joinMenu },
  ], back: mainMenu });
}
const newClash = mode => ({ mode, kind: 'car', rounds: 3, ai: 3, diff: 'medium', round: 0, points: {}, names: {}, slots: [], vehs: {} });
function clashOpts(re, host = true) {
  if (!host) return [{ text: `${KINDS[mc.kind]}  ·  ${mc.rounds} rounds  ·  ${mc.ai} AI rivals (${mc.diff})`, cls: 'dim' }];
  const opt = (label, value, fn) => ({ label, value, cycle: true, onClick: () => { fn(1); re(); }, onLeft: () => { fn(-1); re(); } });
  return [opt('Class', KINDS[mc.kind], d => { mc.kind = cyc(Object.keys(KINDS), mc.kind, d); }), opt('Rounds', mc.rounds, d => mc.rounds = cyc([1, 3, 5], mc.rounds, d)),
    opt('AI rivals', mc.ai, d => mc.ai = cyc([0, 1, 2, 3, 4, 5, 6], mc.ai, d)), opt('AI difficulty', mc.diff, d => mc.diff = cyc(Object.keys(DIFFS), mc.diff, d))];
}
function splitLobby() {
  hideShow(); const ids = idsOf(mc.kind);
  mc.slots.forEach(s => { if (!ids.includes(s.veh)) s.veh = ids[Math.min(ids.length - 1, 2)]; });
  ui.menu({ id: 'split', title: 'Split-screen MultiClash', sub: 'To join: Controller → press RT  ·  Keyboard 1 → Left Shift  ·  Keyboard 2 → Right Shift', items: [
    ...mc.slots.map((s, i) => ({ row: [
      { key: 'pv' + i, label: `P${i + 1} · ${input.deviceLabel(s.dev)}`, value: VEHICLES[s.veh].name, cycle: true, onClick: () => { s.veh = cyc(ids, s.veh, 1); splitLobby(); }, onLeft: () => { s.veh = cyc(ids, s.veh, -1); splitLobby(); } },
      { key: 'rm' + i, label: '✕', cls: 'mini', onClick: () => { mc.slots.splice(i, 1); splitLobby(); } }] })),
    mc.slots.length < 4 ? { text: mc.slots.length ? 'Waiting for more players… (up to 4)' : 'No players yet – press your join button!', cls: 'dim' } : null,
    ...clashOpts(splitLobby),
    { key: 'go', label: 'START MULTICLASH', cls: 'primary', disabled: !mc.slots.length, onClick: () => { mc.round = 0; mc.points = {}; startClashRound(); } },
  ], back: clashMenu });
}
function clashRoundCfg() { return mc.cur; }
function clashEntrants() {
  let list;
  if (mc.mode === 'split') list = mc.slots.map((s, i) => ({ id: 'p' + i, name: 'P' + (i + 1), veh: s.veh, color: PAINTS[i], type: 'local', device: s.dev, person: i === 0 ? HANS : i }));
  else list = net.players.map((p, i) => ({ id: 'p' + p.id, pid: p.id, name: p.name, veh: idsOf(mc.kind).includes(p.veh) ? p.veh : idsOf(mc.kind)[0], color: p.color || PAINTS[i], type: 'human', person: i }));
  const ais = aiEntrants(mc.kind, mc.ai, DIFFS[mc.diff], idsOf(mc.kind)[2]).map((a, i) => ({ ...a, person: i + 4 }));
  const all = [...ais, ...list]; for (let k = 0; k < mc.round; k++) all.push(all.shift()); // rotate the grid each round
  all.forEach(e => { mc.names[e.id] = e.name; });
  return all;
}
function startClashRound() {
  const used = mc.used || (mc.used = []), free = TRACKS.filter(t => !used.includes(t.id)); const tr = pick(free.length ? free : TRACKS).id; used.push(tr);
  const RL = mc.mode === 'split' ? SPLIT_RULES : ROUND_RULES, rr = RL[mc.round % RL.length]; mc.cur = { track: tr, rule: rulesFor(mc.kind).includes(rr) ? rr : 'sprint', laps: 2 };
  const c = { ...mc.cur, seed: Math.floor(Math.random() * 1e6), entrants: [...clashEntrants(), ...npcEntrants(mc.cur.rule, 3, 0, mc.kind)] };
  if (mc.mode === 'online') { net.send({ t: 'start', round: mc.round, rounds: mc.rounds, kind: mc.kind, cfg: c }); beginOnlineRound(c); }
  else launch({ ...c, onEnd: clashRoundEnd });
}
function beginOnlineRound(c) {
  const entrants = c.entrants.map(e => e.type === 'human' ? { ...e, type: e.pid === net.id ? 'local' : 'remote', device: 'all', person: e.pid === net.id ? HANS : e.person } : e);
  entrants.forEach(e => { if (e.type !== 'cop' && e.type !== 'traffic') mc.names[e.id] = e.name; }); mc.cur = { track: c.track, rule: c.rule, laps: c.laps };
  launch({ ...c, entrants, net, isHost: net.isHost, onEnd: clashRoundEnd });
}
function clashRoundEnd(res) {
  res.forEach(r => { mc.points[r.id] = (mc.points[r.id] || 0) + (POINTS[r.pos - 1] || 0); });
  const rc = clashRoundCfg(), last = mc.round >= mc.rounds - 1, host = mc.mode === 'split' || net.isHost;
  const table = Object.entries(mc.points).sort((a, b) => b[1] - a[1]).map(([id, p], i) => `<div class="res"><b>${i + 1}</b><span>${mc.names[id] || id}</span><em>${p} pts</em></div>`).join('');
  const myId = mc.mode === 'online' ? 'p' + net.id : null; res.forEach(r => { r.mine = r.id === myId || (mc.mode === 'split' && r.type === 'local'); });
  resultsMenu(res, { title: `Round ${mc.round + 1}/${mc.rounds} · ${RULES[rc.rule]}`, sub: trackName(rc.track), pts: r => POINTS[r.pos - 1] || 0,
    extra: `<h3>Standings</h3><div class="reslist">${table}</div>`,
    next: host ? (last ? clashFinal : () => { mc.round++; startClashRound(); }) : null, nextLabel: last ? 'Crown the champion' : 'Next round', wait: host ? null : 'Waiting for the host…' });
}
function clashFinal() {
  if (mc.mode === 'online' && net.isHost) net.send({ t: 'final' });
  const order = Object.entries(mc.points).sort((a, b) => b[1] - a[1]); disposeRace(); startDemo();
  const mine = mc.mode === 'split' ? 'p0' : 'p' + net.id;
  showPodium(order.map(([id], i) => ({ name: mc.names[id], person: id === mine ? HANS : i * 3 + 1 }))); audio.sfx('win');
  ui.menu({ id: 'final', title: `${mc.names[order[0][0]]} wins the MultiClash!`, cls: 'left', items: [
    { html: `<div class="reslist">${order.map(([id, p], i) => `<div class="res ${i === 0 ? 'me' : ''}"><b>${i + 1}</b><span>${mc.names[id]}</span><em>${p} pts</em></div>`).join('')}</div>` },
    { label: 'Back to lobby', cls: 'primary', onClick: () => { mc.round = 0; mc.points = {}; mc.mode === 'split' ? splitLobby() : onlineLobby(); } }, { label: 'Main menu', onClick: quitToMenu }] });
}

// ----- online rooms
async function openNet() {
  net = new Net();
  try { await net.connect(); } catch (e) { net = null; ui.toast('Online rooms need the APEX CLASH desktop app (or start.bat).'); return false; }
  net.on('error', m => { ui.toast(m.msg); net.leave(); net = null; joinMenu(); });
  net.on('players', () => { if (ui.menuId() === 'lobby') onlineLobby(); });
  net.on('cfg', m => { Object.assign(mc, m.mc); sendMe(); if (ui.menuId() === 'lobby') onlineLobby(); });
  net.on('start', m => { mc.round = m.round; mc.rounds = m.rounds; mc.kind = m.kind; if (m.round === 0) mc.points = {}; beginOnlineRound(m.cfg); });
  net.on('final', () => clashFinal());
  net.on('left', m => { if (m.hostLeft) ui.toast('The host left – a new host was chosen.'); });
  net.on('closed', () => { ui.toast('Disconnected from the room.'); net = null; mc = null; disposeRace(); startDemo(); mainMenu(); });
  net.on('joined', () => { mc = mc || newClash('online'); mc.mode = 'online'; onlineLobby(); if (net.isHost) fetch('/info').then(r => r.json()).then(i => { mc.addr = i.addresses.map(a => `http://${a}:${i.port}`); if (ui.menuId() === 'lobby') onlineLobby(); }).catch(() => {}); });
  return true;
}
const sendMe = () => net && net.send({ t: 'me', veh: myVeh(mc.kind), color: paintOf(myVeh(mc.kind)), name: save.name });
async function hostRoom() { mc = newClash('online'); if (await openNet()) net.send({ t: 'create', name: save.name, veh: myVeh('car'), color: paintOf(myVeh('car')) }); }
let code = [1, 0, 0, 0];
function joinMenu() {
  ui.menu({ id: 'join', title: 'Join a room', sub: 'Set the 4-digit code shown on the host’s screen', cls: 'narrow', items: [
    { row: code.map((d, i) => ({ key: 'd' + i, label: String(d), cls: 'digit', cycle: true, onClick: () => { code[i] = (d + 1) % 10; joinMenu(); }, onLeft: () => { code[i] = (d + 9) % 10; joinMenu(); } })) },
    { text: 'Press a digit to change it (or ←/→ on a controller)', cls: 'dim' },
    { label: 'JOIN', cls: 'primary', onClick: async () => { mc = newClash('online'); if (await openNet()) net.send({ t: 'join', room: code.join(''), name: save.name, veh: myVeh('car'), color: paintOf(myVeh('car')) }); } },
  ], back: clashMenu });
}
function onlineLobby() {
  hideShow(); const host = net.isHost, ids = idsOf(mc.kind), re = () => { net.send({ t: 'cfg', mc: { kind: mc.kind, rounds: mc.rounds, ai: mc.ai, diff: mc.diff } }); sendMe(); onlineLobby(); };
  ui.menu({ id: 'lobby', title: 'Room ' + net.room, sub: host ? 'Friends: open ' + ((mc.addr && mc.addr[0]) || 'http://<this-PC-address>:3000') + ' in their browser, choose MultiClash → Join a room, code ' + net.room : 'Connected. Waiting for the host to start.', items: [
    { html: `<div class="reslist">${net.players.map(p => `<div class="res ${p.id === net.id ? 'me' : ''}"><b>${p.id === net.hostId ? ui.icon('trophy') : '•'}</b><span>${p.name}</span><em>${(VEHICLES[p.veh] || {}).name || ''}</em></div>`).join('')}</div>` },
    { key: 'myveh', label: 'Your vehicle', value: VEHICLES[myVeh(mc.kind)].name, cycle: true, onClick: () => { save.sel[mc.kind] = cyc(ids.filter(i => save.owned[i] || true), myVeh(mc.kind), 1); sendMe(); onlineLobby(); }, onLeft: () => { save.sel[mc.kind] = cyc(ids, myVeh(mc.kind), -1); sendMe(); onlineLobby(); } },
    ...clashOpts(re, host),
    host ? { key: 'go', label: 'START MULTICLASH', cls: 'primary', onClick: () => { mc.round = 0; mc.points = {}; startClashRound(); } } : { text: 'The host starts the game.', cls: 'dim' },
  ], back: clashMenu });
}

// ---------------- main loop ----------------
let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const ev of input.pollNav(now)) { if (ev === 'start') { if (game.race && !game.race.cfg.demo && game.race.paused) togglePause(); } else ui.nav(ev); }
  if (ui.menuId() === 'split') for (const d of input.pollJoin2()) { if (mc.slots.length < 4 && !mc.slots.some(s => s.dev === d)) { mc.slots.push({ dev: d, veh: idsOf(mc.kind)[Math.min(idsOf(mc.kind).length - 1, 2)] }); audio.sfx('orb'); splitLobby(); } }
  const r = game.race;
  if (r) r.update(dt);
  if (show.active) {
    show.a += dt * 0.35; show.cam.aspect = innerWidth / innerHeight; show.cam.updateProjectionMatrix();
    const off = innerWidth > 900 ? -show.dist * 0.3 : 0; // keep the model clear of the menu panel
    show.cam.position.set(Math.sin(show.a) * show.dist, 2.4, Math.cos(show.a) * show.dist); show.cam.lookAt(0, show.look, 0); show.cam.translateX(off);
    if (show.veh) { show.veh.syncVisual(dt); }
    if (show.flag) { const pa = show.flag.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(now / 180 + pa.getX(i) * 3) * 0.12 * (pa.getX(i) + 0.9)); pa.needsUpdate = true; } for (const p of show.people) p.mixer.update(dt);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight); renderer.render(show.scene, show.cam);
  } else if (r) r.render(renderer);
  // adaptive resolution keeps things smooth on integrated graphics
  fpsT += dt; fpsN++;
  if (fpsT >= 1.5) {
    const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (S.quality === 'auto' && document.hasFocus()) { const old = resScale; if (fps < 45) resScale = Math.max(0.5, resScale - 0.1); else if (fps > 57) resScale = Math.min(1, resScale + 0.05); if (old !== resScale) resize(); }
  }
}

(async function boot() {
  try { await loadAll(p => ui.loading(p * 0.9, 'Loading cars, bikes and people…')); }
  catch (e) { console.error(e); ui.loading(0.5, 'Failed to load game files: ' + e.message); return; }
  ui.loading(0.95, 'Building the city…');
  await new Promise(r => setTimeout(r, 30));
  startDemo(); ui.loading(1); mainMenu(); requestAnimationFrame(frame);
  window.__game = game; window.__t = { show, showWinner, q, startQuick, startTour, tourMenu, quickMenu, launch, me, aiEntrants, garageMenu, showPodium, get mc() { return mc; }, set mc(v) { mc = v; }, newClash, splitLobby, startClashRound, save };
})();
