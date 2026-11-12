// GOAL NATION 2026 — boot, main loop, menus, competitions, online matches, Edit mode, HUD.
import * as THREE from 'three';
import { loadAll } from './assets.js';
import { Match } from './match.js';
import { PL, PW } from './pitch.js';
import { TEAMS, CLUBS, LEAGUES, ALL, COMPS, DIFFS, teamById, code, squad, FORMATION, FORMATION_IDS, save, persist, applyEdits, cleanEdits } from './data.js';
import { compDef, startComp, stageName, myFixture, playRound, simulateRest, standings } from './comp.js';
import { flagURL } from './flags.js';
import { Net } from './net.js';
import { STADIUMS, stadiumById, homeStadium } from './stadiums.js';
import { WEATHER, WEATHER_IDS, randomWeather } from './weather.js';
import { CAM_IDS } from './match.js';
import { kitSets, KIT_NAMES, KIT_PRESETS } from './kits.js';
import { TROPHIES, trophyArt, trophyById, ACHS, unlock } from './trophies.js';
import * as career from './career.js';
import * as input from './input.js';
import * as audio from './audio.js';
import * as ui from './ui.js';

const S = save.settings, $ = id => document.getElementById(id); input.opts.mouse = S.mouse !== false;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: S.quality === 'high', powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; const shadowsOn = S.quality !== 'low'; renderer.shadowMap.enabled = shadowsOn; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const game = { renderer, scene: new THREE.Scene(), match: null, togglePause, shadows: shadowsOn };
let resScale = S.quality === 'low' ? 0.7 : S.quality === 'high' ? 1 : 0.85;
function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, S.quality === 'high' ? 1.5 : 1) * resScale); renderer.setSize(innerWidth, innerHeight, false); }
addEventListener('resize', resize); resize();
addEventListener('pointerdown', audio.initAudio); addEventListener('keydown', audio.initAudio); addEventListener('gamepadconnected', audio.initAudio);
const cyc = (arr, cur, d = 1) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const flag = (t, cls = '') => `<img class="${cls}" src="${esc(flagURL(t))}" alt="">`;

// ---------------- match lifecycle ----------------
// ---- venue: stadium, time of day and weather for a match (settings can force one, otherwise it is the home ground + a random sky)
const TODS = ['day', 'dusk', 'night'];
function envFor(home) {
  const st = S.stadium === 'random' ? STADIUMS[Math.floor(Math.random() * STADIUMS.length)] : S.stadium && S.stadium !== 'auto' ? stadiumById(S.stadium) : homeStadium(home), r = Math.random();
  const tod = S.tod && S.tod !== 'auto' ? S.tod : r < 0.5 ? 'day' : r < 0.72 ? 'dusk' : 'night', weather = S.weather && S.weather !== 'auto' ? S.weather : randomWeather();
  return { stadium: st.id, tod, weather };
}
const optsFor = () => ({ camera: S.camera || 'broadcast', psize: S.psize || 'large', labels: S.labels || 'sel' });
function endMatch() { if (game.match) { game.match.dispose(); game.match = null; } $('hud').style.display = 'none'; }
function demo() { endMatch(); const [a, b] = shuffle(ALL()).slice(0, 2); game.match = new Match(game, { home: a, away: b, humans: [], half: 99, diff: 'normal', ...envFor(a), ...optsFor(), labels: 'off', demo: true }); audio.crowd(false); }
function play(cfg) {
  ui.hideMenu(); ui.loading(0.5, 'Walking out of the tunnel…');
  setTimeout(() => {
    endMatch(); game.match = new Match(game, { half: S.half, diff: S.diff, ...envFor(cfg.home), ...optsFor(), formations: [S.form || '4-4-2', FORMATION_IDS[Math.floor(Math.random() * 3)]], ...cfg }); ui.loading(1); setVenue(game.match);
    $('hud').style.display = 'block'; $('f0').src = flagURL(cfg.home); $('f1').src = flagURL(cfg.away); $('n0').textContent = code(cfg.home); $('n1').textContent = code(cfg.away); radarBase = null; hudC = {};
  }, 40);
}
function togglePause() {
  const m = game.match; if (!m || m.cfg.demo || m.done) return;
  if (m.net) { if (ui.menuId() === 'olpause') ui.hideMenu(); else ui.menu({ id: 'olpause', title: 'Online match', cls: 'narrow', sub: 'The match keeps running while this menu is open.', items: [{ label: 'Continue', cls: 'primary', onClick: () => ui.hideMenu() }, { label: 'Leave match', cls: 'danger', onClick: leaveOnline }], back: () => ui.hideMenu() }); return; }
  if (m.paused) { m.paused = false; ui.hideMenu(); m.humans.forEach(h => !h.remote && input.read(h.device)); return; }
  m.paused = true; pauseMenu();
}
function pauseMenu() {
  const m = game.match, sides = [...new Set(m.humans.map(h => h.side))];
  ui.menu({ id: 'pause', title: 'Paused', cls: 'narrow', items: [
    { label: 'Resume', cls: 'primary', onClick: togglePause },
    ...sides.map(s => ({ label: 'Substitution' + (sides.length > 1 ? ' · ' + m.teams[s].name : ''), hint: `${m.subsLeft[s]} of 5 left`, disabled: m.subsLeft[s] <= 0, onClick: () => subsMenu(s) })),
    { label: 'Quit match', onClick: () => { demo(); mainMenu(); } },
  ], back: togglePause });
}
function subsMenu(side) {
  const m = game.match, on = m.players.filter(p => p.t === side && !p.off);
  ui.menu({ id: 'subs', title: 'Who comes off?', sub: `${m.teams[side].name} · ${m.subsLeft[side]} substitutions left`, items: on.map(p => ({ label: `${p.num}  ${p.name}`, hint: `${p.gk ? 'GK' : p.role}${p.inj ? ' · injured' : ''}${p.yel ? ' · booked' : ''}`, value: Math.round(p.sta * 100) + '% fit', onClick: () => benchMenu(side, p) })), back: pauseMenu });
}
function benchMenu(side, out) {
  const m = game.match;
  ui.menu({ id: 'bench', title: 'Who goes on?', sub: `Replacing ${out.name}`, items: m.bench[side].map((b, i) => ({ label: `${b.num}  ${b.name}`, value: b.used ? 'used' : 'fresh', disabled: b.used, onClick: () => { m.makeSub(side, out, i); pauseMenu(); } })), back: () => subsMenu(side) });
}

// ---------------- HUD ----------------
function setVenue(m) { const w = WEATHER[m.wkey]; $('venue').textContent = `${m.stad.name} · ${m.stad.city}  ·  ${w.name}  ·  ${{ day: 'Day', dusk: 'Dusk', night: 'Night' }[m.tod]}`; $('venue').classList.remove('fade'); void $('venue').offsetWidth; $('venue').classList.add('fade'); }
let radarBase = null, hudC = {};
function hud() {
  const m = game.match; if (!m || m.cfg.demo) return; const set = (k, el, v) => { if (hudC[k] !== v) { hudC[k] = v; el.textContent = v; } };
  set('sc', $('score'), `${m.score[0]} - ${m.score[1]}`);
  const sec = m.clockSec(), mm = Math.floor(sec / 60), ss = Math.floor(sec % 60); set('ck', $('clock'), `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
  const agg = m.agg && (m.agg[0] || m.agg[1] || m.cfg.leg2) ? `  ·  agg ${m.agg[0] + m.score[0]}-${m.agg[1] + m.score[1]}` : '';
  set('hf', $('half'), (m.phase === 'pens' ? 'PENS' : ['1st', '2nd', 'ET 1', 'ET 2'][m.half - 1] || '') + agg);
  const multi = m.humans.length > 1; $('hud').classList.toggle('multi', multi);
  if (multi) { const pl = $('plist'); if (hudC.rows !== m) { hudC.rows = m; pl.innerHTML = m.humans.map((h, n) => `<div class="pr" style="--c:#${m.HC[n % 4].toString(16).padStart(6, '0')}"><b>P${n + 1}</b><span class="t">${esc(code(m.teams[h.side]))}</span><span class="n"></span><i class="pwb"><u></u></i><em class="ai"></em></div>`).join(''); }
    [...pl.children].forEach((row, n) => { const h = m.humans[n], q = h.sel, nm = row.querySelector('.n'), t = (h.gkMode ? 'GK  ' : '') + (q ? `${q.num} ${q.name}` : '—'); if (nm._t !== t) { nm._t = t; nm.textContent = t; } row.querySelector('u').style.width = Math.round(h.power * 100) + '%';
      const inf = h.info && q && m.ball.owner === q ? `⌖ ${Math.round(h.info.deg)}° · ${Math.round(h.info.open * 100)}% open` : '', ai = row.querySelector('.ai'); if (ai._t !== inf) { ai._t = inf; ai.textContent = inf; ai.className = 'ai ' + (h.info && h.info.open > 0.6 ? 'g' : h.info && h.info.open > 0.3 ? 'o' : 'r'); } }); }
  const h = m.humans[0], p = h && h.sel; set('pn', $('pname'), p && !multi ? `${p.num}  ${p.name}${h.gkMode ? '  ·  KEEPER' : ''}${p.sta < 0.7 ? '  ·  tired' : ''}` : '');
  const ah = $('aimhud'), inf1 = !multi && h && h.info && p && m.ball.owner === p ? `Shot angle ${Math.round(h.info.deg)}°  ·  ${Math.round(h.info.open * 100)}% of the goal open` : ''; set('ai', ah, inf1); ah.className = h && h.info && h.info.open > 0.6 ? 'g' : h && h.info && h.info.open > 0.3 ? 'o' : 'r'; const pw = Math.round((h ? h.power : 0) * 100); if (hudC.pw !== pw) { hudC.pw = pw; $('power').style.width = pw + '%'; }
  set('msg', $('msg'), m.msgT > 0 ? m.msg : '');
  const P = m.pens, pe = $('pens'); if (P) { pe.style.display = 'block'; const dots = l => l.map(x => x ? '●' : '✕').join(' ').padEnd(9, ' '); set('pens', pe, `${code(m.teams[0])}  ${dots(P.log[0])}  ${P.score[0]} - ${P.score[1]}  ${dots(P.log[1])}  ${code(m.teams[1])}` + (P.state === 'aim' ? '\n   aim with the mouse or stick (left / right, up = high), then SHOOT  ·  keeper: choose a dive' : '')); } else pe.style.display = 'none';
  const c = $('radar'), g = c.getContext('2d'), W = 210, H = 136, X = x => (x + PL + 4) / (PL * 2 + 8) * W, Z = z => (z + PW + 4) / (PW * 2 + 8) * H;
  if (!radarBase) { radarBase = document.createElement('canvas'); radarBase.width = W; radarBase.height = H; const b = radarBase.getContext('2d'); b.fillStyle = 'rgba(8,30,16,0.88)'; b.fillRect(0, 0, W, H); b.strokeStyle = 'rgba(255,255,255,0.7)'; b.lineWidth = 1; b.strokeRect(X(-PL), Z(-PW), X(PL) - X(-PL), Z(PW) - Z(-PW)); b.beginPath(); b.moveTo(X(0), Z(-PW)); b.lineTo(X(0), Z(PW)); b.stroke(); b.beginPath(); b.arc(X(0), Z(0), 12, 0, 7); b.stroke(); }
  g.clearRect(0, 0, W, H); g.drawImage(radarBase, 0, 0);
  const mine = new Set(m.humans.map(h => h.sel));
  for (const q of m.players) { if (q.off) continue; g.fillStyle = mine.has(q) ? '#ffe14a' : '#' + (q.gk ? m.kits[q.t].gk : m.kits[q.t].kit[0]).toString(16).padStart(6, '0'); g.strokeStyle = q.t ? '#000' : '#fff'; g.beginPath(); g.arc(X(q.x), Z(q.z), mine.has(q) ? 4 : 3, 0, 7); g.fill(); g.stroke(); }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(m.ball.x), Z(m.ball.z), 2.2, 0, 7); g.fill();
}

// ---------------- menus ----------------
function mainMenu() {
  const c = save.comp; audio.music('menu'); career.restoreRatings(); const cr = save.career;
  ui.menu({ id: 'main', title: 'GOAL NATION 2026', logo: true, cls: 'narrow main', sub: `Played ${save.played} · Won ${save.wins} · Goals ${save.goals} · Trophies ${save.trophies.length}`, items: [
    c ? { label: 'Continue: ' + compDef(c.id).name, hint: stageName(c), cls: 'primary', onClick: compMenu } : null,
    { label: 'Career mode', hint: cr && !cr.over ? `${teamById(cr.club).name} · season ${cr.season}` : 'Manage a club through seasons: league, cup, Europe', cls: !c && cr && !cr.over ? 'primary' : '', onClick: careerEntry },
    { label: 'Kick-off', hint: 'Friendly: any two teams, 1 or 2 players', cls: c || (cr && !cr.over) ? '' : 'primary', onClick: () => kickMenu(false) },
    { label: 'Competitions', hint: 'Champions cups, nation cups and leagues', onClick: compsMenu },
    { label: 'Trophy room', hint: `${new Set(save.trophies).size} of ${TROPHIES.length} trophies · ${Object.keys(save.ach || {}).length} achievements`, onClick: trophyRoom },
    { label: 'Online match', hint: 'Play a friend over Wi-Fi / LAN', onClick: onlineMenu },
    { label: 'Penalty shoot-out', onClick: () => kickMenu(true) },
    { label: 'Edit mode', hint: 'Rename teams, squads and cups · kits · badges', onClick: editMenu },
    { label: 'Settings', onClick: settingsMenu }, { label: 'How to play', onClick: howMenu },
  ] });
}
const k = { a: null, b: 'bra', players: '1', pens: false };
function kickMenu(pens) {
  if (typeof pens === 'boolean') k.pens = pens; const ids = ALL().map(t => t.id); k.a = k.a || save.team; const A = teamById(k.a), B = teamById(k.b), re = () => kickMenu();
  const opt = (label, value, fn) => ({ label, value, cycle: true, onClick: () => { fn(1); re(); }, onLeft: () => { fn(-1); re(); } });
  ui.menu({ id: 'kick', title: k.pens ? 'Penalty shoot-out' : 'Kick-off', items: [
    { html: `<div class="vs"><div>${flag(A)}<small>${A.rating}</small></div><div>${esc(A.name)}<br><small>vs</small>${esc(B.name)}</div><div>${flag(B)}<small>${B.rating}</small></div></div>` },
    opt('Your team', A.name, d => { k.a = cyc(ids, k.a, d); if (k.a === k.b) k.a = cyc(ids, k.a, d); save.team = k.a; persist(); }),
    opt('Opponent', B.name, d => { k.b = cyc(ids, k.b, d); if (k.a === k.b) k.b = cyc(ids, k.b, d); }),
    opt('Players', playersLabel(k.players), d => k.players = cyc(['1', 'vs', 'coop', 'custom'], k.players, d)),
    k.players === 'custom' ? { label: 'Choose controllers & teams', value: slots().filter(x => x.on).length + ' joined', onClick: playersMenu } : null,
    opt('Stadium', S.stadium === 'random' ? 'Random' : S.stadium && S.stadium !== 'auto' ? stadiumById(S.stadium).name : 'Home ground (' + homeStadium(A).name + ')', d => { const o = ['auto', 'random', ...STADIUMS.map(x => x.id)]; S.stadium = cyc(o, S.stadium || 'auto', d); persist(); }),
    opt('Weather', S.weather && S.weather !== 'auto' ? WEATHER[S.weather].name : 'Auto', d => { S.weather = cyc(['auto', ...WEATHER_IDS], S.weather || 'auto', d); persist(); }),
    opt('Time of day', S.tod && S.tod !== 'auto' ? { day: 'Day', dusk: 'Dusk', night: 'Night' }[S.tod] : 'Auto', d => { S.tod = cyc(['auto', ...TODS], S.tod || 'auto', d); persist(); }),
    opt('Kit – ' + A.name, k.kA && k.kA !== 'auto' ? KIT_NAMES[k.kA] : 'Auto', d => { k.kA = cyc(['auto', 'home', 'away', 'third'], k.kA || 'auto', d); }),
    opt('Kit – ' + B.name, k.kB && k.kB !== 'auto' ? KIT_NAMES[k.kB] : 'Auto', d => { k.kB = cyc(['auto', 'home', 'away', 'third'], k.kB || 'auto', d); }),
    opt('Formation – ' + A.name, S.form || '4-4-2', d => { S.form = cyc(FORMATION_IDS, S.form || '4-4-2', d); persist(); }),
    opt('Formation – ' + B.name, S.formB || '4-4-2', d => { S.formB = cyc(FORMATION_IDS, S.formB || '4-4-2', d); persist(); }),
    k.pens ? null : opt('Half length', S.half + ' min', d => { S.half = cyc([2, 3, 4, 5, 8], S.half, d); persist(); }),
    opt('Difficulty', S.diff, d => { S.diff = cyc(Object.keys(DIFFS), S.diff, d); persist(); }),
    { label: 'KICK OFF', cls: 'primary', onClick: () => friendly() },
  ], back: mainMenu });
}
// ---- local two-player: both on one screen (keyboard + mouse, second keyboard, or controllers)
const DEVS = ['kb1', 'kb2', 'kbm', 'pad0', 'pad1', 'pad2', 'pad3'];
const devName = d => d.startsWith('pad') ? 'Controller ' + (+d.slice(3) + 1) : { kb1: 'Keys + Mouse (WASD)', kb2: 'Keys (arrows)', kbm: 'Keys + Mouse (all)' }[d] || d;
const devClash = (a, b) => a === b || (a === 'kbm' && (b === 'kb1' || b === 'kb2')) || (b === 'kbm' && (a === 'kb1' || a === 'kb2'));
function slots() {
  if (!Array.isArray(S.slots) || S.slots.length !== 2) { const pd = input.pads().map(p => 'pad' + p.index); S.slots = [0, 1].map(i => ({ on: true, side: i, dev: i === 0 ? 'kb1' : (pd[0] || 'kb2') })); }
  return S.slots;
}
function playersLabel(mode) { return { 1: '1 player', vs: '2 players – versus', coop: '2 players – same team', custom: '2 players – pick controllers & teams' }[mode]; }
function humansFor(mode) {
  if (mode === 'custom') { const hs = slots().filter(x => x.on).map(x => ({ side: x.side, device: x.dev })); return hs.length ? hs : [{ side: 0, device: 'all' }]; }
  return mode === '1' ? [{ side: 0, device: 'all' }] : mode === 'vs' ? [{ side: 0, device: firstPad(0, 'kb1') }, { side: 1, device: firstPad(1, 'kb2') }] : [{ side: 0, device: firstPad(0, 'kb1') }, { side: 0, device: firstPad(1, 'kb2') }];
}
function playersMenu() {
  const sl = slots(), re = playersMenu, used = i => sl.filter((x, n) => n !== i && x.on).map(x => x.dev);
  const items = [{ text: 'Two players on one screen: Keyboard + Mouse, a second keyboard side, or controllers. Press RT / R2 on a controller (or J / ,) to assign it. Mouse aiming works with the Keyboard + Mouse slot.' }];
  sl.forEach((x, i) => {
    const cyc2 = d => { let n = DEVS.indexOf(x.dev), t = 0; do { n = (n + d + DEVS.length) % DEVS.length; t++; } while (t < DEVS.length && (used(i).some(u => devClash(u, DEVS[n])) || (DEVS[n].startsWith('pad') && !input.pads().some(p => 'pad' + p.index === DEVS[n]) && DEVS[n] !== x.dev))); x.dev = DEVS[n]; };
    const tm = d => { const o = x.on ? x.side : 2, n = (o + d + 3) % 3; if (n === 2) x.on = false; else { x.on = true; x.side = n; } };
    items.push({ row: [
      { label: 'Player ' + (i + 1), value: x.on ? devName(x.dev) : '—', hint: x.on ? '' : 'press a button to join', cycle: true, onClick: () => { if (!x.on) x.on = true; else cyc2(1); persist(); re(); }, onLeft: () => { cyc2(-1); persist(); re(); } },
      { label: 'Team', value: x.on ? (x.side ? 'Away (' + code(teamById(k.b)) + ')' : 'Home (' + code(teamById(k.a)) + ')') : 'Off', cycle: true, onClick: () => { tm(1); persist(); re(); }, onLeft: () => { tm(-1); persist(); re(); } },
    ] });
  });
  const n = sl.filter(x => x.on).length, h = sl.filter(x => x.on && !x.side).length, a = n - h;
  items.push({ text: n ? `${n} player${n > 1 ? 's' : ''}: ${h} on Home, ${a} on Away — the CPU plays any side with nobody.` : 'Switch at least one player on.' });
  items.push({ label: 'Done', cls: 'primary', onClick: () => { if (!n) { sl[0].on = true; persist(); } kickMenu(); } });
  ui.menu({ id: 'players', title: 'Players', sub: 'Two players on one screen', items, back: () => kickMenu() });
}
function firstPad(n, fallback) { const p = input.pads(); return p[n] ? 'pad' + p[n].index : fallback; }
function friendly() {
  const A = teamById(k.a), B = teamById(k.b);
  play({ home: A, away: B, humans: humansFor(k.players), kitSel: [k.kA || 'auto', k.kB || 'auto'], formations: [S.form || '4-4-2', S.formB || '4-4-2'], mustWin: k.pens, pensOnly: k.pens, onEnd: r => resultMenu(A, B, r, { again: friendly, next: mainMenu }) });
}
const evIcon = e => e.card ? (e.card === 'Y' ? '🟨' : e.card === 'YR' ? '🟨🟥' : '🟥') : e.sub ? '🔁' : e.inj ? '🩹' : '⚽';
function resultMenu(A, B, r, o) {
  $('hud').style.display = 'none'; audio.music('menu'); const side = o.side || 0, my = r.score[side], th = r.score[1 - side], pens = r.pens && [r.pens[side], r.pens[1 - side]];
  const agg = o.agg ? [o.agg[0] + r.score[0], o.agg[1] + r.score[1]] : null;
  const won = pens ? pens[0] > pens[1] : agg ? agg[0] > agg[1] : my > th, drew = !pens && (agg ? agg[0] === agg[1] : my === th);
  if (!o.shown) { save.played++; save.goals += my; if (won) save.wins++; if (won) { badge('a_first'); if (!pens && my - th >= 5) badge('a_big'); if (pens && !r.pens.every(x => x === r.pens[0])) badge('a_pens'); const first = r.events.find(e => !e.sub && !e.card && !e.inj); if (first && first.t !== side) badge('a_comeback'); } persist(); if (won) audio.sfx('win'); }
  const tot = r.stats[0].poss + r.stats[1].poss || 1;
  const ev = r.events.map(e => `<div class="res"><b>${e.min}'</b><span>${evIcon(e)} ${esc(e.name)}${e.sub ? ' <small>for ' + esc(e.off) + '</small>' : ''}</span><em>${esc(code(e.t ? B : A))}</em></div>`).join('');
  ui.menu({ id: 'result', title: o.title || (won ? 'You win!' : drew ? 'Draw' : 'Defeat'), sub: o.sub, items: [
    { html: `<div class="vs"><div>${flag(A)}</div><div>${esc(A.name)} &nbsp;${r.score[0]} - ${r.score[1]}&nbsp; ${esc(B.name)}${agg ? `<small>aggregate ${agg[0]} - ${agg[1]}</small>` : ''}${r.pens ? `<small>penalties ${r.pens[0]} - ${r.pens[1]}</small>` : ''}</div><div>${flag(B)}</div></div>` },
    { html: `<div class="reslist">${ev}</div><div class="statrow"><div><b>${r.stats[0].shots} - ${r.stats[1].shots}</b>shots</div><div><b>${Math.round(r.stats[0].poss / tot * 100)}% - ${Math.round(r.stats[1].poss / tot * 100)}%</b>possession</div></div>${r.stats[0].passes != null ? `<div class="statrow"><div><b>${r.stats[0].sot} - ${r.stats[1].sot}</b>on target</div><div><b>${r.stats[0].passes} - ${r.stats[1].passes}</b>passes</div><div><b>${r.stats[0].fouls} - ${r.stats[1].fouls}</b>fouls</div><div><b>${r.stats[0].corners} - ${r.stats[1].corners}</b>corners</div></div>` : ''}` },
    r.motm ? { html: `<div class="motm"><span>MAN OF THE MATCH</span><b>${esc(r.motm.num)}  ${esc(r.motm.name)}</b><em>${esc(code(r.motm.t ? B : A))} · ${esc(r.motm.line)}</em></div>` } : null,
    o.extra ? { html: o.extra } : null,
    { label: o.nextLabel || 'Continue', cls: 'primary', onClick: () => { demo(); o.next(); } }, o.again ? { label: 'Rematch', onClick: o.again } : null,
    o.trophy && game.match ? { label: 'Lift the trophy', hint: trophyById(o.trophy) ? trophyById(o.trophy).name : '', cls: 'gold', onClick: () => { ui.hideMenu(); game.match.startCeremony(o.trophy, side, () => resultMenu(A, B, r, { ...o, trophy: null, shown: true })); } } : null,
    ...(o.more || []),
  ] });
}
function badge(id) { if (unlock(save, id)) { const a = ACHS.find(x => x[0] === id); if (a) ui.toast('Achievement unlocked: ' + a[1]); persist(); } }

// ---------------- competitions ----------------
const cs = { comp: 'ecc', team: null };
function compsMenu() {
  const def = compDef(cs.comp), pool = def.pool(); if (!pool.includes(cs.team)) cs.team = pool.includes(save.team) ? save.team : pool[0]; const T = teamById(cs.team), re = compsMenu;
  ui.menu({ id: 'comps', title: 'Competitions', sub: def.hint, items: [
    { html: `<div class="vs"><div>${flag(T)}</div><div>${esc(def.name)}<small>${esc(T.name)} · rating ${T.rating}</small></div></div>` },
    { label: 'Competition', value: def.name, cycle: true, onClick: () => { cs.comp = cyc(COMPS.map(c => c.id), cs.comp, 1); re(); }, onLeft: () => { cs.comp = cyc(COMPS.map(c => c.id), cs.comp, -1); re(); } },
    { label: 'Your team', value: T.name, cycle: true, onClick: () => { cs.team = cyc(pool, cs.team, 1); re(); }, onLeft: () => { cs.team = cyc(pool, cs.team, -1); re(); } },
    { label: 'START', cls: 'primary', onClick: () => { save.team = cs.team; save.comp = startComp(def, cs.team); persist(); compMenu(); } },
    save.comp ? { text: 'Starting a new competition replaces the one in progress.', cls: 'dim' } : null,
  ], back: mainMenu });
}
const nm = id => esc(teamById(id).name);
const fixRow = (a, b, sc, me, note) => `<div class="fix ${me ? 'me' : ''}">${flag(teamById(a))}<span>${nm(a)}</span><b>${sc || 'vs'}</b><span>${nm(b)}</span>${flag(teamById(b))}${note ? `<i>${note}</i>` : ''}</div>`;
function tableHtml(c, ids, title) {
  const rows = standings(c, ids), T = c.table, q = c.stage === 'groups' ? 2 : 0;
  return `${title ? `<h3>${title}</h3>` : ''}<table class="tbl"><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>${rows.map((id, i) => { const r = T[id]; return `<tr class="${id === c.me ? 'me' : ''} ${i < q ? 'q' : ''}"><td>${i + 1}</td><td>${flag(teamById(id))}${nm(id)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`; }).join('')}</table>`;
}
function compBody(c) {
  if (c.stage === 'league') return tableHtml(c, c.groups[0]) + `<h3>Match day ${c.round + 1}</h3>` + c.fixtures[c.round].map(f => fixRow(f[0], f[1], '', f.includes(c.me))).join('');
  if (c.stage === 'groups') { const mg = c.groups.findIndex(g => g.includes(c.me)); return [mg, ...c.groups.keys()].filter((g, i, a) => a.indexOf(g) === i).map(g => tableHtml(c, c.groups[g], 'Group ' + 'ABCDEFGH'[g])).join('') + `<h3>Your match</h3>` + c.fixtures[c.round].filter(f => f.includes(c.me)).map(f => fixRow(f[0], f[1], '', true)).join(''); }
  return c.ties.map((t, i) => { const leg2 = c.legs === 2 && c.leg === 1; return fixRow(leg2 ? t[1] : t[0], leg2 ? t[0] : t[1], '', t.includes(c.me), leg2 ? `1st leg ${c.first[i][1]}-${c.first[i][0]}` : ''); }).join('');
}
function compMenu() {
  const c = save.comp; if (!c) return mainMenu(); const def = compDef(c.id), f = myFixture(c);
  ui.menu({ id: 'comp', title: def.name, sub: stageName(c), items: [
    { html: `<div class="reslist">${compBody(c)}</div>` },
    f ? { label: 'PLAY MATCH', hint: `${teamById(c.me).name} vs ${teamById(f.opp).name}${f.agg ? ` · 1st leg ${f.agg[0]}-${f.agg[1]}` : ''}`, cls: 'primary', onClick: playComp } : null,
    { label: 'Abandon competition', cls: 'danger', onClick: () => { save.comp = null; persist(); mainMenu(); } },
  ], back: mainMenu });
}
function playComp() {
  const c = save.comp, def = compDef(c.id), f = myFixture(c), A = teamById(c.me), B = teamById(f.opp), rn = stageName(c);
  play({ home: A, away: B, humans: S.compFriends ? humansFor('custom').map(h => ({ ...h, side: 0 })) : [{ side: 0, device: 'all' }], mustWin: f.decider, agg: f.agg, leg2: !!f.agg, onEnd: r => {
    playRound(c, def, { gf: r.score[0], ga: r.score[1], pens: r.pens });
    let extra = '', next = compMenu, nextLabel = 'Continue', more = [], trophy = null;
    if (c.done && c.champion === c.me) { extra = `🏆 CHAMPIONS! ${esc(A.name)} win the ${esc(def.name)}!`; save.trophies.push(c.id); badge('a_trophy'); trophy = c.id; save.comp = null; next = mainMenu; audio.say('champions'); }
    else if (c.out) { extra = esc(c.out); next = mainMenu; nextLabel = 'Main menu'; more = [{ label: 'See who wins', onClick: () => { demo(); simulateRest(c, def); finalMenu(c, def); } }]; save.comp = null; }
    else if (c.done) { extra = `${nm(c.champion)} win the ${esc(def.name)}.`; save.comp = null; next = mainMenu; }
    else if (c.through) { extra = esc(c.through); c.through = null; }
    persist(); resultMenu(A, B, r, { sub: `${def.name} · ${rn}`, next, nextLabel, more, trophy, agg: f.agg, extra: extra ? `<div class="champ">${extra}</div>` : '' });
  } });
}
function finalMenu(c, def) {
  const fin = c.results[0], T = teamById(c.champion);
  ui.menu({ id: 'final', title: `${T.name} win!`, sub: def.name, items: [
    { html: `<div class="vs"><div>${flag(T)}</div><div>${esc(T.name)}<small>champions</small></div></div>` },
    fin ? { html: `<h3>Final</h3><div class="reslist">${fixRow(fin[0], fin[1], `${fin[2][0]} - ${fin[2][1]}${fin[3] ? ` (${fin[3][0]}-${fin[3][1]} p)` : ''}`, false)}</div>` } : null,
    { label: 'Main menu', cls: 'primary', onClick: mainMenu },
  ] });
}

// ---------------- online (two players, Wi-Fi / LAN) ----------------
let net = null, addr = null;
async function openNet() {
  net = new Net();
  try { await net.connect(); } catch (e) { net = null; ui.toast('Online play needs the GOAL NATION 2026 desktop app (or start.bat).'); return false; }
  net.on('error', m => { ui.toast(m.msg); net.leave(); net = null; joinMenu(); });
  net.on('joined', () => { lobby(); if (net.isHost) fetch('/info').then(r => r.json()).then(i => { addr = i.addresses.map(a => `http://${a}:${i.port}`); if (ui.menuId() === 'lobby') lobby(); }).catch(() => {}); });
  net.on('players', () => { if (ui.menuId() === 'lobby') lobby(); });
  net.on('start', m => startOnline(m.cfg, false));
  net.on('left', () => { ui.toast('Your opponent left.'); if (game.match && game.match.net) { demo(); lobby(); } });
  net.on('closed', () => { ui.toast('Disconnected.'); net = null; if (game.match && game.match.net) demo(); mainMenu(); });
  return true;
}
function leaveOnline() { if (net) { net.leave(); net = null; } demo(); mainMenu(); }
function onlineMenu() {
  if (net) { net.leave(); net = null; }
  ui.menu({ id: 'online', title: 'Online match', sub: 'One player hosts a room; the other joins with its 4-digit code. Both must be on the same Wi-Fi / network.', cls: 'narrow', items: [
    { label: 'Host a room', cls: 'primary', onClick: async () => { if (await openNet()) net.send({ t: 'create', name: 'Host', veh: save.team }); } },
    { label: 'Join a room', onClick: joinMenu },
  ], back: mainMenu });
}
let roomCode = [1, 0, 0, 0];
function joinMenu() {
  ui.menu({ id: 'join', title: 'Join a room', sub: 'Set the code shown on the host’s screen', cls: 'narrow', items: [
    { row: roomCode.map((d, i) => ({ key: 'd' + i, label: String(d), cls: 'digit', cycle: true, onClick: () => { roomCode[i] = (d + 1) % 10; joinMenu(); }, onLeft: () => { roomCode[i] = (d + 9) % 10; joinMenu(); } })) },
    { label: 'JOIN', cls: 'primary', onClick: async () => { if (await openNet()) net.send({ t: 'join', room: roomCode.join(''), name: 'Guest', veh: save.team }); } },
  ], back: onlineMenu });
}
function lobby() {
  if (!net) return onlineMenu(); const host = net.isHost, me = net.players.find(p => p.id === net.id), other = net.players.find(p => p.id !== net.id), ids = ALL().map(t => t.id), mine = teamById(save.team);
  const setTeam = d => { save.team = cyc(ids, save.team, d); persist(); net.send({ t: 'me', veh: save.team }); lobby(); };
  ui.menu({ id: 'lobby', title: 'Room ' + net.room, sub: host ? `Your friend opens GOAL NATION 2026 → Online match → Join a room, and enters ${net.room}.${addr ? '  (Browser address: ' + addr[0] + ')' : ''}` : 'Connected. The host starts the match.', items: [
    { html: `<div class="vs"><div>${flag(mine)}<small>you</small></div><div>${esc(mine.name)}<br><small>vs</small>${other ? esc(teamById(other.veh) ? teamById(other.veh).name : '?') : 'waiting…'}</div><div>${other && teamById(other.veh) ? flag(teamById(other.veh)) : ''}<small>${other ? 'friend' : ''}</small></div></div>` },
    { label: 'Your team', value: mine.name, cycle: true, onClick: () => setTeam(1), onLeft: () => setTeam(-1) },
    host ? { label: 'Half length', value: S.half + ' min', cycle: true, onClick: () => { S.half = cyc([2, 3, 4, 5, 8], S.half, 1); persist(); lobby(); }, onLeft: () => { S.half = cyc([2, 3, 4, 5, 8], S.half, -1); persist(); lobby(); } } : null,
    host ? { label: 'KICK OFF', cls: 'primary', disabled: !other, onClick: () => { const cfg = { home: me.veh, away: other.veh, half: S.half, ...envFor(teamById(me.veh)) }; net.send({ t: 'start', cfg }); startOnline(cfg, true); } } : { text: 'Waiting for the host to kick off…', cls: 'dim' },
  ], back: () => { if (net) { net.leave(); net = null; } onlineMenu(); } });
}
function startOnline(cfg, isHost) {
  const A = teamById(cfg.home), B = teamById(cfg.away); if (!A || !B) return ui.toast('Unknown team in this room.');
  play({ home: A, away: B, half: cfg.half, stadium: cfg.stadium, tod: cfg.tod, weather: cfg.weather, diff: 'normal', net, role: isHost ? 'host' : 'guest',
    humans: isHost ? [{ side: 0, device: 'all' }, { side: 1, remote: true }] : [{ side: 1, device: 'all' }, { side: 0, remote: true }],
    onEnd: r => resultMenu(A, B, r, { side: isHost ? 0 : 1, next: () => lobby(), nextLabel: 'Back to the room' }) });
}

// ---------------- Edit mode ----------------
const PALETTE = [['White', 0xf5f5f5], ['Black', 0x151515], ['Red', 0xd8232a], ['Maroon', 0x7a1f3d], ['Orange', 0xff7a00], ['Yellow', 0xf2c40a], ['Gold', 0xd9a520], ['Green', 0x1f9d55], ['Dark green', 0x0a5a2c], ['Sky blue', 0x6cabdd], ['Blue', 0x1a56c4], ['Navy', 0x1a2a6b], ['Purple', 0x5a2d82], ['Pink', 0xff5fa0], ['Grey', 0x9aa3ad], ['Claret', 0x8e1f2f]];
const palName = c => { let b = PALETTE[0], bd = 1e9; for (const p of PALETTE) { const d = ['r', 'g', 'b'].reduce((a, _, i) => a + Math.abs(((c >> (16 - i * 8)) & 255) - ((p[1] >> (16 - i * 8)) & 255)), 0); if (d < bd) { bd = d; b = p; } } return b; };
const ed = { team: null };
function teamEdits(T) { return save.edits.teams[T.id] || (save.edits.teams[T.id] = {}); }
function commit() { for (const [id, e] of Object.entries(save.edits.teams)) if (!Object.keys(e).length) delete save.edits.teams[id]; persist(); applyEdits(); }
function pickFile(accept, cb) { const f = document.createElement('input'); f.type = 'file'; f.accept = accept; f.onchange = () => { if (f.files[0]) cb(f.files[0]); }; f.click(); }
function editMenu() {
  const ids = ALL().map(t => t.id); ed.team = ed.team || save.team; const T = teamById(ed.team), re = editMenu;
  const kitOpt = (i, label) => ({ key: 'k' + i, label, value: palName(T.kit[i])[0], cycle: true, onClick: () => setKit(i, 1), onLeft: () => setKit(i, -1) });
  const setKit = (i, d) => { const E = teamEdits(T), kit = [...T.kit], cur = palName(kit[i]); kit[i] = cyc(PALETTE, cur, d)[1]; E.kit = kit; commit(); re(); };
  ui.menu({ id: 'edit', title: 'Edit mode', sub: 'Everything you type here is saved on this PC only. Use Export to copy it to another PC.', items: [
    { html: `<div class="vs"><div>${flag(T)}</div><div>${esc(T.name)}<small>${esc(code(T))} · rating ${T.rating}</small></div><div class="kit">${T.kit.map(c => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('')}</div></div>` },
    { key: 'team', label: 'Team', value: T.name, cycle: true, onClick: () => { ed.team = cyc(ids, ed.team, 1); re(); }, onLeft: () => { ed.team = cyc(ids, ed.team, -1); re(); } },
    { input: true, key: 'nm', label: 'Name', value: T.name, max: 28, onInput: v => { const E = teamEdits(T); if (v.trim()) E.name = v.trim(); else delete E.name; commit(); } },
    { input: true, key: 'cd', label: 'Short name', value: code(T), max: 3, onInput: v => { const E = teamEdits(T); if (v.trim()) E.code = v.trim().toUpperCase().slice(0, 3); else delete E.code; commit(); } },
    kitOpt(0, 'Shirt colour'), kitOpt(1, 'Shorts colour'), kitOpt(2, 'Socks colour'),
    { row: [{ key: 'bdg', label: 'Import badge image…', onClick: () => pickFile('image/*', importBadge) }, { key: 'rmb', label: 'Remove badge', disabled: !T.badge, onClick: () => { delete teamEdits(T).badge; commit(); re(); } }] },
    { key: 'kl', label: 'Away & third kits', hint: 'Kit locker with ready-made kits', onClick: kitLocker },
    { key: 'sq', label: 'Edit squad names', hint: '11 starters and 5 substitutes', onClick: squadEdit },
    { key: 'cp', label: 'Rename competitions', onClick: compEdit },
    { row: [{ key: 'ex', label: 'Export edit file', onClick: exportEdits }, { key: 'im', label: 'Import edit file…', onClick: () => pickFile('.json,application/json', importEdits) }] },
    { key: 'rs', label: 'Reset this team', cls: 'danger', onClick: () => { delete save.edits.teams[T.id]; commit(); re(); } },
  ], back: mainMenu });
}
function importBadge(file) {
  const T = teamById(ed.team), url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = 96; c.height = 64; const g = c.getContext('2d'), s = Math.min(96 / img.width, 64 / img.height); g.drawImage(img, (96 - img.width * s) / 2, (64 - img.height * s) / 2, img.width * s, img.height * s); URL.revokeObjectURL(url); teamEdits(T).badge = c.toDataURL('image/png'); commit(); editMenu(); ui.toast('Badge added'); };
  img.onerror = () => ui.toast('That file is not an image.'); img.src = url;
}
function squadEdit() {
  const T = teamById(ed.team), sq = squad(T), roles = [...FORMATION.map(f => f[2]), 'SUB', 'SUB', 'SUB', 'SUB', 'SUB'];
  ui.menu({ id: 'squad', title: 'Squad names', sub: T.name, items: sq.map((p, i) => ({ input: true, key: 'p' + i, label: `${p.num}  ${roles[i]}`, value: p.name, max: 22, onInput: v => { const E = teamEdits(T), list = E.players || sq.map(x => x.name); list[i] = v.trim() || sq[i].name; E.players = list; commit(); } })), back: editMenu });
}
function compEdit() {
  ui.menu({ id: 'compedit', title: 'Competition names', items: COMPS.map(c => ({ input: true, key: c.id, label: c.orig || c.name, value: c.name, max: 40, onInput: v => { if (v.trim()) save.edits.comps[c.id] = v.trim(); else delete save.edits.comps[c.id]; commit(); } })), back: editMenu });
}
function exportEdits() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(save.edits, null, 1)], { type: 'application/json' })); a.download = 'goal-nation-2026-edit.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); ui.toast('Edit file saved'); }
function importEdits(file) { file.text().then(t => { save.edits = cleanEdits(JSON.parse(t)); commit(); editMenu(); ui.toast('Edit file loaded'); }).catch(() => ui.toast('That is not a GOAL NATION edit file.')); }

function settingsMenu() {
  const re = settingsMenu, vols = [0, 0.2, 0.4, 0.6, 0.8, 1], near = v => vols.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  const opt = (label, value, fn, hint) => ({ label, value, hint, cycle: true, onClick: () => { fn(1); persist(); audio.setVolumes(); re(); }, onLeft: () => { fn(-1); persist(); audio.setVolumes(); re(); } });
  ui.menu({ id: 'settings', title: 'Settings', items: [
    opt('Difficulty', S.diff, d => S.diff = cyc(Object.keys(DIFFS), S.diff, d)), opt('Half length', S.half + ' minutes', d => S.half = cyc([2, 3, 4, 5, 8], S.half, d)),
    opt('Friends in competitions', S.compFriends ? 'On – Players screen joins your team' : 'Off', d => S.compFriends = !S.compFriends, 'Choose the controllers in Kick-off → Players'),
    opt('Camera', S.camera || 'broadcast', d => S.camera = cyc(CAM_IDS, S.camera || 'broadcast', d), 'Press V during a match to change it'),
    opt('Player size', { normal: 'Normal', large: 'Large', xl: 'Extra large' }[S.psize || 'large'], d => S.psize = cyc(['normal', 'large', 'xl'], S.psize || 'large', d), 'Bigger players are easier to see'),
    opt('Name labels', { sel: 'Ball carrier & your players', all: 'Everyone', off: 'Off' }[S.labels || 'sel'], d => S.labels = cyc(['sel', 'all', 'off'], S.labels || 'sel', d)),
    opt('Mouse aiming', S.mouse === false ? 'Off' : 'On', d => { S.mouse = S.mouse === false; input.opts.mouse = S.mouse !== false; }, 'Point to pass · click to pass · hold to shoot'),
    opt('Graphics', S.quality, d => S.quality = cyc(['auto', 'low', 'medium', 'high'], S.quality, d), 'Restart the game to apply'),
    opt('Music', Math.round((S.music ?? 0.5) * 100) + '%', d => S.music = cyc(vols, near(S.music ?? 0.5), d)), opt('Commentary', Math.round(S.commentary * 100) + '%', d => S.commentary = cyc(vols, near(S.commentary), d)), opt('Crowd & effects', Math.round(S.sfx * 100) + '%', d => S.sfx = cyc(vols, near(S.sfx), d)),
  ], back: mainMenu });
}
function howMenu() {
  ui.menu({ id: 'how', title: 'How to play', items: [{ html: `<table class="how"><tr><th></th><th>Controller</th><th>Keyboard (WASD)</th><th>Keyboard P2 (arrows)</th></tr>
    <tr><td>Move</td><td>Left stick / D-pad</td><td>W A S D</td><td>Arrows</td></tr><tr><td>Pass · (defending: hold to chase)</td><td>A</td><td>J</td><td>,</td></tr>
    <tr><td>Shoot – hold for power · (defending: slide tackle)</td><td>X or B</td><td>K</td><td>.</td></tr><tr><td>Through ball · (defending: standing tackle)</td><td>Y</td><td>L</td><td>/</td></tr>
    <tr><td>Sprint</td><td>RT / RB</td><td>Shift or Space</td><td>Right Shift</td></tr><tr><td>Switch player</td><td>LB</td><td>Q</td><td>M</td></tr>
    <tr><td>Goalkeeper mode on / off</td><td>LT / Select</td><td>G</td><td>N</td></tr><tr><td>Aim pass &amp; shot</td><td>Right stick</td><td>Mouse</td><td>—</td></tr>
    <tr><td>Curl a shot or free kick</td><td>—</td><td>E (right) / R (left)</td><td>—</td></tr><tr><td>Change camera · screenshot</td><td>—</td><td>V · F12</td><td>—</td></tr><tr><td>Pause · substitutions</td><td>Start</td><td>Esc</td><td>Esc</td></tr></table>
    <p class="tip"><b>Mouse:</b> move the pointer – a line shows where the ball will go and the team-mate it finds. <b>Click</b> = pass to the pointer · <b>hold &amp; release</b> = shoot (longer = harder) · <b>right-click</b> = through ball / lob · <b>click a team-mate</b> (when defending) = switch to him, click elsewhere = slide tackle · <b>middle-click</b> = auto-switch. Aim past the goal line for a high shot into the top corner; the read-out shows the shot angle and how much of the goal is still open. A controller's right stick aims the same way.</p>
    <p class="tip"><b>Goalkeeper:</b> press G (LT) to take over your keeper – move him across the area, Shoot / click to dive towards the pointer or stick, Pass to throw and hold Shoot for a long kick. Free kicks: aim with the pointer and curl the ball with E / R.</p>
    <p class="tip"><b>Two players:</b> Kick-off → Players. Keyboard + mouse vs controller, two controllers, or both on one team against the CPU. During a penalty, aim with the mouse or stick (up = high corner); the keeper picks a side to dive.</p>
    <p class="tip"><b>Rules:</b> offside is given when a pass finds a team-mate beyond the second-last defender. Tackles from behind are fouls and can bring yellow or red cards; a foul in the box is a penalty. Players tire as the match goes on – use your 5 substitutions from the pause menu. Cup ties level after 90 minutes (or on aggregate) go to extra time and penalties.</p>
    <p class="tip">After a goal, press Pass or Shoot to skip the replay. At kick-off, press Pass to skip the walk-out.</p>
    <p class="tip dim">Commentary voices, crowd recordings, chants and the original music come from the Pitch Clash library. GOAL NATION 2026 © 2026 Anye Happiness Ade — AI Engineer, Cameroon. All clubs, squads and competitions are fictional unless you rename them in Edit mode.</p>` }], back: mainMenu });
}

// ---------------- kit locker (Edit mode) ----------------
const kl = { slot: 'away' };
function kitLocker() {
  ed.team = ed.team || save.team; const T = teamById(ed.team), re = kitLocker, cur = kitSets(T)[kl.slot].kit, E = teamEdits(T), save1 = k => { E.kits = E.kits || {}; E.kits[kl.slot] = k; commit(); re(); };
  const pre = KIT_PRESETS.findIndex(x => x[1] === cur[0] && x[2] === cur[1] && x[3] === cur[2]);
  const setCol = (i, d) => { const k = [...cur], c = palName(k[i]); k[i] = cyc(PALETTE, c, d)[1]; save1(k); };
  const chips = (kit, gkc) => `<div class="kit">${kit.map(c => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('')}${gkc != null ? `<i class="gk" style="background:#${gkc.toString(16).padStart(6, '0')}"></i>` : ''}</div>`;
  const sets = kitSets(T);
  ui.menu({ id: 'kitlocker', title: 'Kit locker', sub: T.name, items: [
    { html: `<div class="kitrow">${['home', 'away', 'third'].map(n => `<div class="kc ${n === kl.slot ? 'on' : ''}"><b>${KIT_NAMES[n]}</b>${chips(sets[n].kit, sets[n].gk)}</div>`).join('')}</div>` },
    { label: 'Kit to edit', value: KIT_NAMES[kl.slot], cycle: true, onClick: () => { kl.slot = kl.slot === 'away' ? 'third' : 'away'; re(); }, onLeft: () => { kl.slot = kl.slot === 'away' ? 'third' : 'away'; re(); } },
    { label: 'Ready-made kit', value: pre >= 0 ? KIT_PRESETS[pre][0] : 'Custom', cycle: true, onClick: () => { const n = KIT_PRESETS[(pre + 1 + KIT_PRESETS.length) % KIT_PRESETS.length]; save1([n[1], n[2], n[3]]); }, onLeft: () => { const n = KIT_PRESETS[(pre - 1 + KIT_PRESETS.length) % KIT_PRESETS.length]; save1([n[1], n[2], n[3]]); } },
    ...['Shirt', 'Shorts', 'Socks'].map((n, i) => ({ key: 'c' + i, label: n + ' colour', value: palName(cur[i])[0], cycle: true, onClick: () => setCol(i, 1), onLeft: () => setCol(i, -1) })),
    { label: 'Reset this kit', cls: 'danger', onClick: () => { if (E.kits) delete E.kits[kl.slot]; commit(); re(); } },
  ], back: editMenu });
}

// ---------------- trophy room ----------------
function trophyRoom() {
  const have = {}; for (const id of save.trophies) have[id] = (have[id] || 0) + 1; const kinds = ['Nations', 'Continental', 'League', 'Cup', 'Super Cup', 'Award'];
  const card = t => `<div class="tcard ${have[t.id] ? '' : 'locked'}">${trophyArt(t.id, 72, !have[t.id])}<b>${esc(t.name)}</b><small>${have[t.id] ? `Won ×${have[t.id]}` : esc(t.blurb)}</small></div>`;
  const ach = ACHS.map(([id, n, d]) => `<div class="ach ${save.ach && save.ach[id] ? 'on' : ''}"><i>${save.ach && save.ach[id] ? '★' : '☆'}</i><span><b>${esc(n)}</b><small>${esc(d)}</small></span></div>`).join('');
  ui.menu({ id: 'trophyroom', title: 'Trophy room', sub: `${new Set(save.trophies).size} of ${TROPHIES.length} collected`, cls: 'wide', items: [
    { html: kinds.map(kd => `<h3>${esc(kd === 'Award' ? 'Career awards' : kd)}</h3><div class="tgrid">${TROPHIES.filter(t => t.kind === kd).map(card).join('')}</div>`).join('') + `<h3>Achievements</h3><div class="achs">${ach}</div>` },
  ], back: mainMenu });
}

// ---------------- career mode ----------------
const cn = { club: null, mgr: '', diff: 'normal' };
function careerEntry() {
  const cr = save.career;
  if (cr && !cr.over) return careerHub();
  if (cr && cr.over) return careerOver();
  careerNew();
}
function careerNew() {
  const lgs = LEAGUES.map(l => l.id); cn.league = cn.league || (cn.club ? teamById(cn.club).league : 'en'); const clubs = CLUBS.filter(c => c.league === cn.league).sort((a, b) => b.rating - a.rating), ids = clubs.map(c => c.id);
  if (!cn.club || teamById(cn.club).league !== cn.league) cn.club = ids[0]; const T = teamById(cn.club), lg = LEAGUES_NAME(T.league), re = careerNew;
  const rank = ids.indexOf(T.id) + 1;
  ui.menu({ id: 'careernew', title: 'Career mode', sub: 'Take charge of a club: league, cup and continental football, board objectives, transfers and a trophy cabinet.', items: [
    { html: `<div class="vs"><div>${flag(T)}</div><div>${esc(T.name)}<small>${esc(lg)} · rating ${T.rating} · #${rank} of 8 on paper</small></div><div class="kit">${kitSets(T).home.kit.map(c => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('')}</div></div>` },
    { label: 'League', value: lg, cycle: true, onClick: () => { cn.league = cyc(lgs, cn.league, 1); re(); }, onLeft: () => { cn.league = cyc(lgs, cn.league, -1); re(); } },
    { label: 'Club', value: T.name, cycle: true, onClick: () => { cn.club = cyc(ids, cn.club, 1); re(); }, onLeft: () => { cn.club = cyc(ids, cn.club, -1); re(); } },
    { input: true, key: 'mg', label: 'Manager name', value: cn.mgr, max: 20, placeholder: 'Your name', onInput: v => { cn.mgr = v; } },
    { label: 'Difficulty', value: cn.diff, cycle: true, onClick: () => { cn.diff = cyc(Object.keys(DIFFS), cn.diff, 1); S.diff = cn.diff; persist(); re(); }, onLeft: () => { cn.diff = cyc(Object.keys(DIFFS), cn.diff, -1); S.diff = cn.diff; persist(); re(); } },
    { label: 'START CAREER', cls: 'primary', onClick: () => { save.career = career.newCareer(cn.club, (cn.mgr || '').trim() || 'The Gaffer', cn.diff, cn.keepXp || 0); cn.keepXp = 0; save.team = cn.club; persist(); careerHub(); } },
  ], back: mainMenu });
}
const LEAGUES_NAME = id => (LEAGUES.find(l => l.id === id) || { name: id }).name;
const money = v => '€' + Math.round(v) + 'M';
function careerHub() {
  const cr = save.career; career.applyRatings(cr); const me = teamById(cr.club), ev = career.nextEvent(cr), ml = career.mgrLevel(cr.xp), done = !ev, o = cr.obj;
  const bar = v => `<div class="cbar"><i style="width:${v}%;background:${v > 60 ? '#3df58a' : v > 30 ? '#ffc21f' : '#ff5a4a'}"></i></div>`;
  const L = cr.comps.lg, table = standings(L, L.groups[0]), pos = table.indexOf(cr.club) + 1;
  ui.menu({ id: 'career', title: me.name, sub: `Season ${cr.season} · ${cr.year}/${String(cr.year + 1).slice(2)} · ${cr.manager} (${ml.name})`, cls: 'wide', items: [
    { html: `<div class="chead"><div>${flag(me)}</div><div class="cst"><div><small>Rating</small><b>${me.rating}</b></div><div><small>League</small><b>${pos}${['st', 'nd', 'rd'][pos - 1] || 'th'}</b></div><div><small>Budget</small><b>${money(cr.budget)}</b></div><div><small>Record</small><b>${cr.played.w}-${cr.played.d}-${cr.played.l}</b></div></div></div>
      <div class="cobj"><div><small>Board confidence</small>${bar(cr.board)}</div><ul><li>🎯 ${esc(o.leagueText)}</li><li>🏆 ${esc(o.cupText)}</li>${o.contText ? `<li>🌍 ${esc(o.contText)}</li>` : ''}</ul></div>` },
    done ? { label: 'SEASON REVIEW', hint: 'The season is complete', cls: 'primary', onClick: seasonReview }
      : { label: 'PLAY MATCH', hint: `${ev.label} · ${ev.stage}  ·  ${me.name} vs ${teamById(ev.fix.opp).name}${ev.fix.agg ? ` (1st leg ${ev.fix.agg[0]}-${ev.fix.agg[1]})` : ''}${ev.fix.home ? '  ·  home' : '  ·  away'}`, cls: 'primary', onClick: () => careerPlay(ev) },
    done ? null : { label: 'Simulate match', hint: 'Let the squad play it out', onClick: () => careerSim(ev) },
    { row: [{ label: 'Tables & fixtures', onClick: () => careerTables('lg') }, { label: 'Calendar', onClick: careerCalendar }] },
    { row: [{ label: 'Club', hint: 'Upgrades & transfers', onClick: careerClub }, { label: 'Seasons & trophies', onClick: careerHistory }] },
    { row: [{ label: 'Manager', onClick: careerManager }, { label: 'Save & exit', onClick: mainMenu }] },
    { label: 'Retire', cls: 'danger', onClick: () => { ui.menu({ id: 'retire', title: 'Retire?', sub: 'This deletes the career (your trophies stay in the trophy room).', items: [{ label: 'Keep managing', cls: 'primary', onClick: careerHub }, { label: 'Retire and delete', cls: 'danger', onClick: () => { save.career = null; persist(); mainMenu(); } }], back: careerHub }); } },
  ], back: mainMenu });
}
function careerPlay(ev) {
  const cr = save.career, A = teamById(cr.club), B = teamById(ev.fix.opp);
  play({ home: A, away: B, humans: S.compFriends ? humansFor('custom').map(h => ({ ...h, side: 0 })) : [{ side: 0, device: 'all' }], mustWin: ev.fix.decider, agg: ev.fix.agg, leg2: !!ev.fix.agg, ...(ev.fix.home ? {} : { stadium: homeStadium(B).id }),
    onEnd: r => careerFinish(ev, { gf: r.score[0], ga: r.score[1], pens: r.pens, events: r.events }, A, B, r) });
}
function careerSim(ev) {
  const cr = save.career, A = teamById(cr.club), B = teamById(ev.fix.opp), res = career.quickSim(cr, ev);
  careerFinish(ev, res, A, B, { score: [res.gf, res.ga], pens: res.pens, events: [], stats: [{ shots: 0, poss: 1, passes: 0, sot: 0, fouls: 0, corners: 0 }, { shots: 0, poss: 1, passes: 0, sot: 0, fouls: 0, corners: 0 }] }, true);
}
function careerFinish(ev, res, A, B, r, simmed) {
  const cr = save.career, out = career.playEvent(cr, res), won = res.pens ? res.pens[0] > res.pens[1] : res.gf > res.ga;
  const tid = career.trophyIdOf(cr, out.k); let extra = '', trophy = null;
  if (out.champion) { extra = `${trophyArt(tid, 54)} <b>${esc(trophyById(tid).name)} — ${out.k === 'lg' ? 'league champions!' : 'winners!'}</b>`; trophy = tid; audio.say('champions'); }
  else if (out.out) extra = esc(out.out); else if (out.through) extra = esc(out.through);
  if (won) badge('a_first'); if (cr.goals >= 50) badge('a_goals50'); if (cr.goals >= 200) badge('a_goals200'); persist();
  if (simmed) { ui.menu({ id: 'simres', title: won ? 'Win' : res.gf === res.ga && !res.pens ? 'Draw' : 'Defeat', sub: ev.label + ' · ' + ev.stage, items: [{ html: `<div class="vs"><div>${flag(A)}</div><div>${esc(A.name)} &nbsp;${res.gf} - ${res.ga}&nbsp; ${esc(B.name)}${res.pens ? `<small>penalties ${res.pens[0]} - ${res.pens[1]}</small>` : ''}</div><div>${flag(B)}</div></div>` }, extra ? { html: `<div class="champ">${extra}</div>` } : null, { label: 'Continue', cls: 'primary', onClick: careerHub }] }); return; }
  resultMenu(A, B, r, { sub: ev.label + ' · ' + ev.stage, next: careerHub, trophy, extra: extra ? `<div class="champ">${extra}</div>` : '' });
}
function careerTables(k) {
  const cr = save.career, re = careerTables, ks = ['lg', 'cup', 'cont', 'sup'].filter(x => cr.comps[x]), c = cr.comps[k] || cr.comps.lg; k = cr.comps[k] ? k : 'lg';
  ui.menu({ id: 'ctables', title: career.defOf(cr, k).name, sub: stageName(c), cls: 'wide', items: [
    { label: 'Competition', value: career.COMP_LABEL[k], cycle: true, onClick: () => re(cyc(ks, k, 1)), onLeft: () => re(cyc(ks, k, -1)) },
    { html: `<div class="reslist">${c.done ? `<h3>Finished — champions: ${nm(c.champion)}</h3>` + (c.stage === 'league' ? tableHtml(c, c.groups[0]) : '') : compBody(c)}</div>` },
  ], back: careerHub });
}
function careerCalendar() {
  const cr = save.career, L = cr.comps.lg, cnt = { lg: L.round, cup: 0, cont: 0, sup: 0 }, rows = cr.cal.slice(0, 16).map(e => { const n = ++cnt[e.k]; return `<div class="fix"><span>${career.COMP_LABEL[e.k]}</span><b>${e.k === 'lg' ? 'Match day ' + n : e.k === 'sup' ? 'Super Cup' : 'Round ' + (cr.comps[e.k].round !== undefined && cr.comps[e.k].stage !== 'ko' ? n : n)}</b><span>${esc(career.defOf(cr, e.k).name)}</span></div>`; }).join('');
  ui.menu({ id: 'ccal', title: 'Calendar', sub: `${cr.cal.length} matches left this season`, items: [{ html: `<div class="reslist">${rows || 'Season complete.'}</div>` }], back: careerHub });
}
function careerClub() {
  const cr = save.career, re = careerClub, buy = (fn, msg) => { if (fn()) { persist(); ui.toast(msg); } else ui.toast('Not enough money.'); re(); };
  ui.menu({ id: 'cclub', title: 'Club', sub: `Budget ${money(cr.budget)}`, cls: 'wide', items: [
    { text: 'Upgrades', cls: 'dim' },
    ...career.UPGRADES.map(u => { const c = career.upgradeCost(cr, u); return { label: `${u.name}  ·  level ${cr[u.id]}/${u.max}`, hint: u.text(cr[u.id]), value: c == null ? 'MAX' : money(c), disabled: c == null || cr.budget < c, onClick: () => buy(() => career.buyUpgrade(cr, u.id), u.name + ' upgraded') }; }),
    { text: 'Transfer market', cls: 'dim' },
    ...cr.market.map((p, i) => ({ label: `${p.name}`, hint: `${p.role} · from ${p.from}`, value: `+${p.bonus} · ${money(p.price)}`, disabled: cr.budget < p.price, onClick: () => buy(() => career.signPlayer(cr, i), p.name + ' signed') })),
    cr.market.length ? null : { text: 'No one is available right now.', cls: 'dim' },
    cr.signed.length ? { html: `<div class="reslist"><h3>Your signings</h3>${cr.signed.map(x => `<div class="res"><b>+${x.bonus}</b><span>${esc(x.name)}</span></div>`).join('')}</div>` } : null,
  ], back: careerHub });
}
function careerManager() {
  const cr = save.career, ml = career.mgrLevel(cr.xp), pct = ml.next ? Math.min(100, (cr.xp - [0, 60, 160, 320, 560, 900][ml.level - 1]) / (ml.next - [0, 60, 160, 320, 560, 900][ml.level - 1]) * 100) : 100;
  ui.menu({ id: 'cmgr', title: cr.manager, sub: `${ml.name} · level ${ml.level}`, items: [
    { html: `<div class="cbar"><i style="width:${pct}%;background:#ffc21f"></i></div><small class="dim">${cr.xp} XP${ml.next ? ' · next level at ' + ml.next : ''}</small>
      <table class="how"><tr><td>Matches</td><td>${cr.played.w + cr.played.d + cr.played.l}</td></tr><tr><td>Won – drawn – lost</td><td>${cr.played.w} – ${cr.played.d} – ${cr.played.l}</td></tr><tr><td>Goals for – against</td><td>${cr.played.gf} – ${cr.played.ga}</td></tr><tr><td>League titles</td><td>${cr.titles}</td></tr><tr><td>Top scorers this season</td><td>${Object.entries(cr.scorers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, g]) => esc(n) + ' ' + g).join(', ') || '—'}</td></tr></table>` },
  ], back: careerHub });
}
function careerHistory() {
  const cr = save.career, rows = cr.hist.map(h => `<tr><td>${h.year}/${String(h.year + 1).slice(2)}</td><td>${h.pos}</td><td>${h.pts}</td><td>${h.cup}</td><td>${h.cont}</td><td>${h.trophies.length}</td></tr>`).join('');
  const mine = {}; for (const h of cr.hist) for (const t of [...h.trophies, ...h.awards]) mine[t] = (mine[t] || 0) + 1;
  ui.menu({ id: 'chist', title: 'Seasons & trophies', cls: 'wide', items: [
    { html: cr.hist.length ? `<table class="tbl"><tr><th>Season</th><th>Pos</th><th>Pts</th><th>Cup</th><th>Europe</th><th>Trophies</th></tr>${rows}</table>` : '<p class="tip">Your history appears here after the first season.</p>' },
    Object.keys(mine).length ? { html: `<h3>Won with ${esc(teamById(cr.club).name)}</h3><div class="tgrid">${Object.entries(mine).map(([id, n]) => `<div class="tcard">${trophyArt(id, 60)}<b>${esc(trophyById(id).name)}</b><small>×${n}</small></div>`).join('')}</div>` } : null,
    { label: 'Full trophy room', onClick: trophyRoom },
  ], back: careerHub });
}
function seasonReview() {
  const cr = save.career; if (!cr.review) { const rv = career.endSeason(cr); cr.review = rv; for (const t of [...rv.trophies, ...rv.awards]) { save.trophies.push(t); } if (rv.trophies.length) badge('a_trophy'); if (rv.trophies.some(t => ['ecc', 'lib', 'acc', 'afc', 'ccc'].includes(t))) badge('a_cont'); if (cr.season >= 3) badge('a_season3'); if (cr.budget >= 150) badge('a_rich'); persist(); }
  const rv = cr.review, h = rv.rec, ok = v => v === null ? '' : v ? '✔' : '✘', o = cr.obj, win = [...rv.trophies, ...rv.awards];
  ui.menu({ id: 'creview', title: `Season ${cr.season} review`, sub: `${teamById(cr.club).name} · ${h.year}/${String(h.year + 1).slice(2)}`, cls: 'wide', items: [
    { html: `<div class="cst big"><div><small>League</small><b>${h.pos}${['st', 'nd', 'rd'][h.pos - 1] || 'th'}</b></div><div><small>Points</small><b>${h.pts}</b></div><div><small>W-D-L</small><b>${h.w}-${h.d}-${h.l}</b></div><div><small>Goals</small><b>${h.gf}-${h.ga}</b></div></div>
      <ul class="cobjl"><li>${ok(rv.objectives.leagueMet)} ${esc(o.leagueText)}</li><li>${ok(rv.objectives.cupMet)} ${esc(o.cupText)} <em>(${esc(h.cup)})</em></li>${o.contText ? `<li>${ok(rv.objectives.contMet)} ${esc(o.contText)} <em>(${esc(h.cont)})</em></li>` : ''}</ul>
      <p class="tip">Prize & gate money <b>+${money(h.income)}</b> · board confidence ${h.board >= 0 ? '+' : ''}${h.board} → <b>${cr.board}%</b> · top scorer ${esc(h.scorer)}</p>
      ${win.length ? `<h3>Silverware</h3><div class="tgrid">${win.map(id => `<div class="tcard">${trophyArt(id, 64)}<b>${esc(trophyById(id).name)}</b></div>`).join('')}</div>` : '<p class="tip dim">No trophies this season.</p>'}` },
    cr.sacked ? { label: 'The board has lost faith…', cls: 'danger', onClick: () => { cr.over = true; persist(); careerOver(); } }
      : { label: `START SEASON ${cr.season + 1}`, cls: 'primary', onClick: () => { career.nextSeason(cr); cr.review = null; persist(); careerHub(); } },
  ], back: careerHub });
}
function careerOver() {
  const cr = save.career, ml = career.mgrLevel(cr.xp);
  ui.menu({ id: 'cover', title: 'Sacked', sub: `${cr.manager} · ${cr.season} season${cr.season > 1 ? 's' : ''} at ${teamById(cr.club).name}`, items: [
    { html: `<p class="tip">The board has run out of patience. You won ${cr.titles} league title${cr.titles === 1 ? '' : 's'} and finished as a <b>${ml.name}</b> with ${cr.xp} XP.</p>` },
    { label: 'Take a new job', cls: 'primary', onClick: () => { const xp = cr.xp, name = cr.manager; save.career = null; careerNewKeep(name, xp); } },
    { label: 'Main menu', onClick: () => { save.career = null; persist(); mainMenu(); } },
  ] });
}
function careerNewKeep(name, xp) { cn.mgr = name; careerNew(); cn.keepXp = xp; }

// ---------------- loop ----------------
let last = performance.now(), fpsT = 0, fpsN = 0, shotReq = false;
addEventListener('keydown', e => { if (e.repeat || e.target instanceof HTMLInputElement) return; if (e.code === 'F12' || e.code === 'F9') { shotReq = true; e.preventDefault(); } if (e.code === 'KeyV' && game.match && !game.match.cfg.demo) { const m = game.match; m.camMode = cyc(CAM_IDS, m.camMode, 1); S.camera = m.camMode; persist(); ui.toast('Camera: ' + m.camMode); } });
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (ui.menuId() === 'players') { for (const d of input.pollJoin()) { const sl = slots(); if (sl.some(x => x.on && x.dev === d)) continue; const f = sl.find(x => !x.on); if (f) { f.on = true; f.dev = d; f.side = sl.filter(x => x.on && x !== f && !x.side).length <= sl.filter(x => x.on && x !== f && x.side).length ? 0 : 1; persist(); playersMenu(); } } }
  for (const ev of input.pollNav(now)) { if (ev === 'start') { if (game.match && game.match.paused) togglePause(); } else ui.nav(ev); }
  const m = game.match; if (m) { m.update(dt); m.render(renderer); hud(); if (shotReq) { shotReq = false; $('game').toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'goal-nation-' + Date.now() + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); ui.toast('Screenshot saved'); }); } if (m.cfg.demo && m.time > 150) demo(); }
  input.endFrame(); fpsT += dt; fpsN++; if (fpsT >= 1.5) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; if (S.quality === 'auto' && document.hasFocus()) { const o = resScale; if (fps < 45) resScale = Math.max(0.5, resScale - 0.1); else if (fps > 57) resScale = Math.min(1, resScale + 0.05); if (o !== resScale) resize(); } }
}
(async function boot() {
  try { await loadAll(p => ui.loading(p * 0.9, 'Loading players…')); } catch (e) { console.error(e); ui.loading(0.5, 'Failed to load: ' + e.message); return; }
  ui.loading(0.95, 'Building the stadium…'); await new Promise(r => setTimeout(r, 30));
  demo(); ui.loading(1); mainMenu(); requestAnimationFrame(frame);
  window.__g = { career, careerNew, careerHub, trophyRoom, kitLocker, seasonReview, THREE, game, play, k, kickMenu, playersMenu, friendly, compMenu, playComp, save, teamById, COMPS, startComp, compDef, editMenu, lobby: () => lobby(), get net() { return net; } };
})();
