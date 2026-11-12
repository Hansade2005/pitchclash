// GOAL NATION 2026 — boot, main loop, menus, competitions, online matches, Edit mode, HUD.
import * as THREE from 'three';
import { loadAll } from './assets.js';
import { Match } from './match.js';
import { PL, PW } from './pitch.js';
import { TEAMS, ALL, COMPS, DIFFS, teamById, code, squad, FORMATION, save, persist, applyEdits, cleanEdits } from './data.js';
import { compDef, startComp, stageName, myFixture, playRound, simulateRest, standings } from './comp.js';
import { flagURL } from './flags.js';
import { Net } from './net.js';
import * as input from './input.js';
import * as audio from './audio.js';
import * as ui from './ui.js';

const S = save.settings, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: S.quality === 'high', powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const game = { renderer, scene: new THREE.Scene(), match: null, togglePause };
let resScale = S.quality === 'low' ? 0.7 : S.quality === 'high' ? 1 : 0.85;
function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, S.quality === 'high' ? 1.5 : 1) * resScale); renderer.setSize(innerWidth, innerHeight, false); }
addEventListener('resize', resize); resize();
addEventListener('pointerdown', audio.initAudio); addEventListener('keydown', audio.initAudio);
const cyc = (arr, cur, d = 1) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const flag = (t, cls = '') => `<img class="${cls}" src="${esc(flagURL(t))}" alt="">`;

// ---------------- match lifecycle ----------------
function endMatch() { if (game.match) { game.match.dispose(); game.match = null; } $('hud').style.display = 'none'; }
function demo() { endMatch(); const [a, b] = shuffle(ALL()).slice(0, 2); game.match = new Match(game, { home: a, away: b, humans: [], half: 99, diff: 'normal', night: Math.random() < 0.5, demo: true }); audio.crowd(false); }
function play(cfg) {
  ui.hideMenu(); ui.loading(0.5, 'Walking out of the tunnel…');
  setTimeout(() => {
    endMatch(); game.match = new Match(game, { half: S.half, diff: S.diff, night: Math.random() < 0.4, ...cfg }); ui.loading(1);
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
let radarBase = null, hudC = {};
function hud() {
  const m = game.match; if (!m || m.cfg.demo) return; const set = (k, el, v) => { if (hudC[k] !== v) { hudC[k] = v; el.textContent = v; } };
  set('sc', $('score'), `${m.score[0]} - ${m.score[1]}`);
  const sec = m.clockSec(), mm = Math.floor(sec / 60), ss = Math.floor(sec % 60); set('ck', $('clock'), `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
  const agg = m.agg && (m.agg[0] || m.agg[1] || m.cfg.leg2) ? `  ·  agg ${m.agg[0] + m.score[0]}-${m.agg[1] + m.score[1]}` : '';
  set('hf', $('half'), (m.phase === 'pens' ? 'PENS' : ['1st', '2nd', 'ET 1', 'ET 2'][m.half - 1] || '') + agg);
  const h = m.humans[0], p = h && h.sel; set('pn', $('pname'), p ? `${p.num}  ${p.name}${p.sta < 0.7 ? '  ·  tired' : ''}` : ''); const pw = Math.round((h ? h.power : 0) * 100); if (hudC.pw !== pw) { hudC.pw = pw; $('power').style.width = pw + '%'; }
  set('msg', $('msg'), m.msgT > 0 ? m.msg : '');
  const P = m.pens, pe = $('pens'); if (P) { pe.style.display = 'block'; const dots = l => l.map(x => x ? '●' : '✕').join(' ').padEnd(9, ' '); set('pens', pe, `${code(m.teams[0])}  ${dots(P.log[0])}  ${P.score[0]} - ${P.score[1]}  ${dots(P.log[1])}  ${code(m.teams[1])}` + (P.state === 'aim' ? '\n      aim with the stick, then press SHOOT' : '')); } else pe.style.display = 'none';
  const c = $('radar'), g = c.getContext('2d'), W = 210, H = 136, X = x => (x + PL + 4) / (PL * 2 + 8) * W, Z = z => (z + PW + 4) / (PW * 2 + 8) * H;
  if (!radarBase) { radarBase = document.createElement('canvas'); radarBase.width = W; radarBase.height = H; const b = radarBase.getContext('2d'); b.fillStyle = 'rgba(8,30,16,0.88)'; b.fillRect(0, 0, W, H); b.strokeStyle = 'rgba(255,255,255,0.7)'; b.lineWidth = 1; b.strokeRect(X(-PL), Z(-PW), X(PL) - X(-PL), Z(PW) - Z(-PW)); b.beginPath(); b.moveTo(X(0), Z(-PW)); b.lineTo(X(0), Z(PW)); b.stroke(); b.beginPath(); b.arc(X(0), Z(0), 12, 0, 7); b.stroke(); }
  g.clearRect(0, 0, W, H); g.drawImage(radarBase, 0, 0);
  const mine = new Set(m.humans.map(h => h.sel));
  for (const q of m.players) { if (q.off) continue; g.fillStyle = mine.has(q) ? '#ffe14a' : '#' + (q.gk ? m.teams[q.t].gk : m.teams[q.t].kit[0]).toString(16).padStart(6, '0'); g.strokeStyle = q.t ? '#000' : '#fff'; g.beginPath(); g.arc(X(q.x), Z(q.z), mine.has(q) ? 4 : 3, 0, 7); g.fill(); g.stroke(); }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(m.ball.x), Z(m.ball.z), 2.2, 0, 7); g.fill();
}

// ---------------- menus ----------------
function mainMenu() {
  const c = save.comp;
  ui.menu({ id: 'main', title: 'GOAL NATION 2026', logo: true, cls: 'narrow main', sub: `Played ${save.played} · Won ${save.wins} · Goals ${save.goals} · Trophies ${save.trophies.length}`, items: [
    c ? { label: 'Continue: ' + compDef(c.id).name, hint: stageName(c), cls: 'primary', onClick: compMenu } : null,
    { label: 'Kick-off', hint: 'Friendly: any two teams, 1 or 2 players', cls: c ? '' : 'primary', onClick: () => kickMenu(false) },
    { label: 'Competitions', hint: 'Champions cups, nation cups and leagues', onClick: compsMenu },
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
    opt('Players', { 1: '1 player', vs: '2 players – versus', coop: '2 players – same team' }[k.players], d => k.players = cyc(['1', 'vs', 'coop'], k.players, d)),
    k.pens ? null : opt('Half length', S.half + ' min', d => { S.half = cyc([2, 3, 4, 5, 8], S.half, d); persist(); }),
    opt('Difficulty', S.diff, d => { S.diff = cyc(Object.keys(DIFFS), S.diff, d); persist(); }),
    { label: 'KICK OFF', cls: 'primary', onClick: () => friendly() },
  ], back: mainMenu });
}
function humansFor(mode) { return mode === '1' ? [{ side: 0, device: 'all' }] : mode === 'vs' ? [{ side: 0, device: firstPad(0, 'kb1') }, { side: 1, device: firstPad(1, 'kb2') }] : [{ side: 0, device: firstPad(0, 'kb1') }, { side: 0, device: firstPad(1, 'kb2') }]; }
function firstPad(n, fallback) { const p = input.pads(); return p[n] ? 'pad' + p[n].index : fallback; }
function friendly() {
  const A = teamById(k.a), B = teamById(k.b);
  play({ home: A, away: B, humans: humansFor(k.players), mustWin: k.pens, pensOnly: k.pens, onEnd: r => resultMenu(A, B, r, { again: friendly, next: mainMenu }) });
}
const evIcon = e => e.card ? (e.card === 'Y' ? '🟨' : e.card === 'YR' ? '🟨🟥' : '🟥') : e.sub ? '🔁' : e.inj ? '🩹' : '⚽';
function resultMenu(A, B, r, o) {
  $('hud').style.display = 'none'; const side = o.side || 0, my = r.score[side], th = r.score[1 - side], pens = r.pens && [r.pens[side], r.pens[1 - side]];
  const agg = o.agg ? [o.agg[0] + r.score[0], o.agg[1] + r.score[1]] : null;
  const won = pens ? pens[0] > pens[1] : agg ? agg[0] > agg[1] : my > th, drew = !pens && (agg ? agg[0] === agg[1] : my === th);
  save.played++; save.goals += my; if (won) save.wins++; persist(); if (won) audio.sfx('win');
  const tot = r.stats[0].poss + r.stats[1].poss || 1;
  const ev = r.events.map(e => `<div class="res"><b>${e.min}'</b><span>${evIcon(e)} ${esc(e.name)}${e.sub ? ' <small>for ' + esc(e.off) + '</small>' : ''}</span><em>${esc(code(e.t ? B : A))}</em></div>`).join('');
  ui.menu({ id: 'result', title: o.title || (won ? 'You win!' : drew ? 'Draw' : 'Defeat'), sub: o.sub, items: [
    { html: `<div class="vs"><div>${flag(A)}</div><div>${esc(A.name)} &nbsp;${r.score[0]} - ${r.score[1]}&nbsp; ${esc(B.name)}${agg ? `<small>aggregate ${agg[0]} - ${agg[1]}</small>` : ''}${r.pens ? `<small>penalties ${r.pens[0]} - ${r.pens[1]}</small>` : ''}</div><div>${flag(B)}</div></div>` },
    { html: `<div class="reslist">${ev}</div><div class="statrow"><div><b>${r.stats[0].shots} - ${r.stats[1].shots}</b>shots</div><div><b>${Math.round(r.stats[0].poss / tot * 100)}% - ${Math.round(r.stats[1].poss / tot * 100)}%</b>possession</div></div>` },
    o.extra ? { html: o.extra } : null,
    { label: o.nextLabel || 'Continue', cls: 'primary', onClick: () => { demo(); o.next(); } }, o.again ? { label: 'Rematch', onClick: o.again } : null,
    ...(o.more || []),
  ] });
}

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
  play({ home: A, away: B, humans: [{ side: 0, device: 'all' }], mustWin: f.decider, agg: f.agg, leg2: !!f.agg, onEnd: r => {
    playRound(c, def, { gf: r.score[0], ga: r.score[1], pens: r.pens });
    let extra = '', next = compMenu, nextLabel = 'Continue', more = [];
    if (c.done && c.champion === c.me) { extra = `🏆 CHAMPIONS! ${esc(A.name)} win the ${esc(def.name)}!`; save.trophies.push(c.id); save.comp = null; next = mainMenu; audio.say('champions'); }
    else if (c.out) { extra = esc(c.out); next = mainMenu; nextLabel = 'Main menu'; more = [{ label: 'See who wins', onClick: () => { demo(); simulateRest(c, def); finalMenu(c, def); } }]; save.comp = null; }
    else if (c.done) { extra = `${nm(c.champion)} win the ${esc(def.name)}.`; save.comp = null; next = mainMenu; }
    else if (c.through) { extra = esc(c.through); c.through = null; }
    persist(); resultMenu(A, B, r, { sub: `${def.name} · ${rn}`, next, nextLabel, more, agg: f.agg, extra: extra ? `<div class="champ">${extra}</div>` : '' });
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
    host ? { label: 'KICK OFF', cls: 'primary', disabled: !other, onClick: () => { const cfg = { home: me.veh, away: other.veh, half: S.half, night: Math.random() < 0.4 }; net.send({ t: 'start', cfg }); startOnline(cfg, true); } } : { text: 'Waiting for the host to kick off…', cls: 'dim' },
  ], back: () => { if (net) { net.leave(); net = null; } onlineMenu(); } });
}
function startOnline(cfg, isHost) {
  const A = teamById(cfg.home), B = teamById(cfg.away); if (!A || !B) return ui.toast('Unknown team in this room.');
  play({ home: A, away: B, half: cfg.half, night: cfg.night, diff: 'normal', net, role: isHost ? 'host' : 'guest',
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
    opt('Graphics', S.quality, d => S.quality = cyc(['auto', 'low', 'medium', 'high'], S.quality, d), 'Restart the game to apply'),
    opt('Commentary', Math.round(S.commentary * 100) + '%', d => S.commentary = cyc(vols, near(S.commentary), d)), opt('Crowd & effects', Math.round(S.sfx * 100) + '%', d => S.sfx = cyc(vols, near(S.sfx), d)),
  ], back: mainMenu });
}
function howMenu() {
  ui.menu({ id: 'how', title: 'How to play', items: [{ html: `<table class="how"><tr><th></th><th>Controller</th><th>Keyboard</th><th>Keyboard P2</th></tr>
    <tr><td>Move</td><td>Left stick / D-pad</td><td>W A S D</td><td>Arrows</td></tr><tr><td>Pass · (defending: hold to chase)</td><td>A</td><td>J</td><td>,</td></tr>
    <tr><td>Shoot – hold for power · (defending: slide tackle)</td><td>X or B</td><td>K</td><td>.</td></tr><tr><td>Through ball · (defending: standing tackle)</td><td>Y</td><td>L</td><td>/</td></tr>
    <tr><td>Sprint</td><td>RT / RB</td><td>Shift or Space</td><td>Right Shift</td></tr><tr><td>Switch player</td><td>LB</td><td>Q</td><td>M</td></tr><tr><td>Pause · substitutions</td><td>Start</td><td>Esc</td><td>Esc</td></tr></table>
    <p class="tip"><b>Rules:</b> offside is given when a pass finds a team-mate beyond the second-last defender. Tackles from behind are fouls and can bring yellow or red cards; a foul in the box is a penalty. Players tire as the match goes on – use your 5 substitutions from the pause menu. Cup ties level after 90 minutes (or on aggregate) go to extra time and penalties.</p>
    <p class="tip"><b>Penalties:</b> point left / centre / right and press Shoot; when defending in a shoot-out, point the way you want to dive.</p>
    <p class="tip dim">GOAL NATION 2026 © 2026 Anye Happiness Ade — AI Engineer, Cameroon. All clubs, squads and competitions are fictional unless you rename them in Edit mode.</p>` }], back: mainMenu });
}

// ---------------- loop ----------------
let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const ev of input.pollNav(now)) { if (ev === 'start') { if (game.match && game.match.paused) togglePause(); } else ui.nav(ev); }
  const m = game.match; if (m) { m.update(dt); m.render(renderer); hud(); if (m.cfg.demo && m.time > 150) demo(); }
  fpsT += dt; fpsN++; if (fpsT >= 1.5) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; if (S.quality === 'auto' && document.hasFocus()) { const o = resScale; if (fps < 45) resScale = Math.max(0.5, resScale - 0.1); else if (fps > 57) resScale = Math.min(1, resScale + 0.05); if (o !== resScale) resize(); } }
}
(async function boot() {
  try { await loadAll(p => ui.loading(p * 0.9, 'Loading players…')); } catch (e) { console.error(e); ui.loading(0.5, 'Failed to load: ' + e.message); return; }
  ui.loading(0.95, 'Building the stadium…'); await new Promise(r => setTimeout(r, 30));
  demo(); ui.loading(1); mainMenu(); requestAnimationFrame(frame);
  window.__g = { game, play, k, friendly, compMenu, playComp, save, teamById, COMPS, startComp, compDef, editMenu, lobby: () => lobby(), get net() { return net; } };
})();
