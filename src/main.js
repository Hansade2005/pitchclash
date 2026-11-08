// Pitch Clash — game shell: menus, match runtime, HUD, replays, shootouts and competition hub.
import * as THREE from 'three';
import { Match, PITCH, playerRatings, pickStarters } from './engine/sim.js';
import { Extras } from './engine/extras.js';
import { Renderer } from './engine/render.js';
import { NATIONS, CLUBS, LEAGUES, makeSquad, formations as FORMATIONS } from './data/teams.js';
import * as Comp from './hub.js';
import { STADIUMS, homeStadium, venueFor } from './data/stadiums.js';
import * as Bet from './ui_bet.js';
import * as Career from './ui_career.js';
import { Bank } from './economy.js';

const $ = id => document.getElementById(id);
const menuEl = $('menu'), hudEl = $('hud');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ settings
const SETTINGS_KEY = 'pc_settings';
export const settings = Object.assign({ cuts: true, autoSprint: true, mouseAim: true, assisted: true, stadium: 'home', ceremony: 'full', injuries: true, var: true, autoSubs: false, halfMinutes: 4, difficulty: 'pro', time: 'night', weather: 'clear', camera: 'broadcast', zoom: 1, replays: true, quality: 'high', radar: true, names: true, assisted: true }, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } })());
export function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

const renderer = new Renderer($('stage'));
let extras = null;
renderer.setQuality(settings.quality);
renderer.zoomSetting = settings.zoom;

// ------------------------------------------------------------------ team catalogue
export const CATEGORIES = (() => {
  const cats = [];
  const confNames = { EUR: 'Europe', AFR: 'Africa', SAM: 'South America', ASI: 'Asia', NCA: 'North & Central America', OCE: 'Oceania' };
  for (const c of ['EUR', 'AFR', 'SAM', 'NCA', 'ASI', 'OCE']) { const list = NATIONS.filter(n => n.confed === c); if (list.length) cats.push({ id: 'nat-' + c, name: 'Nations · ' + confNames[c], teams: list }); }
  const leagues = {};
  for (const cl of CLUBS) (leagues[cl.league] = leagues[cl.league] || []).push(cl);
  for (const [lg, list] of Object.entries(leagues)) { const L = LEAGUES.find(l => l.id === lg); cats.push({ id: 'lg-' + lg, name: 'Clubs · ' + (L ? L.name : 'Rest of the world'), teams: list.sort((a, b) => b.rating - a.rating) }); }
  return cats;
})();
export function teamById(id) { return NATIONS.find(t => t.id === id) || CLUBS.find(t => t.id === id); }
export function stars(r) { const s = clamp((r - 55) / 7, 0.5, 5); return '★'.repeat(Math.floor(s)) + (s % 1 >= 0.5 ? '½' : ''); }
function kitSwatch(t, alt) { const k = alt ? (t.colors.alt || t.colors) : t.colors; return `<span class="kit"><i style="background:${k.shirt}"></i><i style="background:${k.shorts}"></i><i style="background:${k.socks}"></i></span>`; }

// ------------------------------------------------------------------ menu framework
let screen = null, focus = 0, focusables = [];
const joinedDevices = []; // devices that have pressed something
export function show(s) {
  screen = s; focus = (s && s.focus) || 0; renderScreen();
}
export function setFocus(i) { focus = i; renderScreen(); }
export function renderScreen() {
  if (!screen) { menuEl.innerHTML = ''; return; }
  menuEl.innerHTML = screen.render();
  menuEl.className = screen.cls || '';
  focusables = [...menuEl.querySelectorAll('.nav')];
  focus = clamp(focus, 0, Math.max(0, focusables.length - 1));
  focusables.forEach((el, i) => {
    el.classList.toggle('focus', i === focus);
    el.onmouseenter = () => { focus = i; focusables.forEach((e, j) => e.classList.toggle('focus', j === focus)); };
    el.onclick = () => { focus = i; activate(el); };
  });
  const f = focusables[focus]; if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  screen.after && screen.after();
}
function moveFocus(dx, dy) {
  if (!focusables.length) return;
  const cur = focusables[focus].getBoundingClientRect(), cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
  let best = -1, bs = 1e9;
  focusables.forEach((el, i) => {
    if (i === focus) return;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ddx = x - cx, ddy = y - cy;
    if (dx && Math.sign(ddx) !== dx) return; if (dy && Math.sign(ddy) !== dy) return;
    if (dx && Math.abs(ddx) < 4) return; if (dy && Math.abs(ddy) < 4) return;
    const s = dx ? Math.abs(ddx) + Math.abs(ddy) * 3 : Math.abs(ddy) + Math.abs(ddx) * 3;
    if (s < bs) { bs = s; best = i; }
  });
  if (best >= 0) { focus = best; Sound.menu(); focusables.forEach((e, j) => e.classList.toggle('focus', j === focus)); focusables[focus].scrollIntoView && focusables[focus].scrollIntoView({ block: 'nearest' }); }
}
function activate(el) { if (!screen) return; Sound.confirm(); screen.action && screen.action(el.dataset.act, el, 0); }
function menuInput(inputs) {
  if (!screen) return;
  if (screen.typing) return;
  const before = screen;
  if (screen.tick) screen.tick(inputs);
  if (!screen || screen.raw || screen !== before) return;
  for (const { inp } of inputs) {
    if (screen !== before) return;
    const el = focusables[focus];
    if (inp.navX && el && el.dataset.cycle !== undefined) { Sound.menu(); screen.action(el.dataset.act, el, inp.navX); continue; }
    if (inp.navX || inp.navY) moveFocus(inp.navX, inp.navX ? 0 : inp.navY);
    if (inp.confirmPressed && el && !(screen._numAt && performance.now() - screen._numAt < 200)) { activate(el); return; }
    if (inp.backPressed && screen.back) { Sound.back(); screen.back(); return; }
    if (inp.lbPressed && screen.tab) { Sound.menu(); screen.tab(-1); }
    if (inp.rbPressed && screen.tab) { Sound.menu(); screen.tab(1); }
  }
}
window.addEventListener('keydown', e => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !screen && M && run && !run.replay && !run.viewer && !run.fulltime) { pauseMenu(); return; }   // pause with Esc or P, any layout
  if (e.code === 'F1') { e.preventDefault(); if (run) run.help.pinned = !run.help.pinned; }
  if (screen && screen.typing) { if (e.code === 'Escape' && screen.back) screen.back(); return; }
  if (screen && screen.onKey && screen.onKey(e)) { screen._numAt = performance.now(); e.preventDefault(); return; }
  if (screen && screen.raw && e.code === 'Escape' && screen.back) { e.preventDefault(); screen.back(); return; }   // Esc = back on every screen
  if (!screen || screen.raw) return;
  if (e.code === 'Enter' && focusables[focus]) { activate(focusables[focus]); }
  if (e.code === 'Escape' && screen.back) { Sound.back(); screen.back(); }
  if (e.code === 'Tab' && screen.tab) { e.preventDefault(); screen.tab(e.shiftKey ? -1 : 1); }
});

// ------------------------------------------------------------------ main menu
function mainMenu() {
  hudEl.classList.add('hidden');
  Sound.crowd(0.15, 0); Sound.chant(false); Sound.music(true); Sound.weather('clear');
  const saved = Comp.hasSave();
  show({
    cls: 'mainbg',
    render: () => `<div class="panel main"><div class="logo">PITCH<span>CLASH</span></div><div class="sub">11 v 11 STADIUM FOOTBALL</div>
      <div class="menu-list">
        <div class="btn nav big" data-act="kickoff">⚽ Kick Off<small>Quick match · 1P vs CPU · 2P versus · 2P co-op</small></div>
        <div class="btn nav big" data-act="comps">🏆 Competitions<small>Leagues · Club cups · Nations championships</small></div>
        ${saved ? `<div class="btn nav" data-act="continue">▶ Continue: ${esc(saved)}</div>` : ''}
        <div class="btn nav big" data-act="ml">👔 Master League<small>Manage a club for seasons · transfers · finances · youth · board</small></div>
        <div class="btn nav" data-act="bet">🎰 Virtual Sportsbook<small>Play coins only · bet on CPU matches · up to 4 friends</small></div>
        <div class="btn nav" data-act="controls">🎮 Controls</div>
        <div class="btn nav" data-act="settings">⚙ Settings</div>
        <div class="btn nav" data-act="credits">ℹ Credits</div>
        <div class="btn nav" data-act="exit">⏻ Exit</div>
      </div>
      <div class="hint">Controllers connected: ${Input.padCount()} · Navigate with stick / D-pad · <span class="key">A</span> select · <span class="key">B</span> back</div></div>`,
    action: act => {
      if (act === 'kickoff') sideSelect({ mode: 'quick' });
      if (act === 'comps') Comp.competitionsMenu();
      if (act === 'continue') Comp.continueSaved();
      if (act === 'ml') Career.masterLeague();
      if (act === 'bet') Bet.sportsbook();
      if (act === 'controls') controlsScreen(mainMenu);
      if (act === 'settings') settingsScreen(mainMenu);
      if (act === 'credits') creditsScreen();
      if (act === 'exit') window.close();
    },
  });
}
export { mainMenu };

// ------------------------------------------------------------------ side select (controller assignment)
// opts: { mode: 'quick' | 'comp', fixedTeams?: [home, away], userTeam?: id, onDone(sides) }
export function sideSelect(opts) {
  const devs = Input.candidates();
  const side = new Map(); // devId -> -1 home, 0 none, 1 away
  const assigned = () => [...side.values()].some(v => v !== 0);
  const setSide = (id, n) => { const count = [...side.entries()].filter(([k, v]) => k !== id && v === n && n !== 0).length; if (n === 0 || count < 2) { side.set(id, n); Sound.menu(); return true; } return false; };
  const goBack = () => { Sound.back(); (opts.back || mainMenu)(); };
  const finish = () => {
    if (!assigned()) return false;
    const all = Input.candidates();
    const sides = [...side.entries()].filter(([, v]) => v !== 0).map(([id, v]) => ({ device: devs.find(d => Input.devId(d) === id) || all.find(d => Input.devId(d) === id), team: v < 0 ? 0 : 1 }));
    Sound.confirm();
    if (opts.onDone) opts.onDone(sides); else teamSelect({ sides });
    return true;
  };
  show({
    raw: true,
    render: () => {
      const list = Input.candidates();
      const homeName = opts.fixedTeams ? esc(opts.fixedTeams[0].name) : 'HOME';
      const awayName = opts.fixedTeams ? esc(opts.fixedTeams[1].name) : 'AWAY';
      const rows = list.map(d => {
        const id = Input.devId(d), s = side.get(id) || 0, icon = d.type === 'pad' ? '🎮' : '⌨';
        return `<div class="siderow"><div class="slot nav ${s < 0 ? 'on home' : ''}" data-act="side:${id}:-1">${s < 0 ? icon : '<small>click</small>'}</div><div class="dev ${s === 0 ? 'mid' : ''}">${icon} ${esc(Input.deviceName(d))}</div><div class="slot nav ${s > 0 ? 'on away' : ''}" data-act="side:${id}:1">${s > 0 ? icon : '<small>click</small>'}</div></div>`;
      }).join('');
      const h = [...side.values()].filter(v => v < 0).length, a = [...side.values()].filter(v => v > 0).length;
      let mode = 'Choose sides';
      if (h && a) mode = 'VERSUS';
      else if (h > 1 || a > 1) mode = 'CO-OP vs CPU';
      else if (h || a) mode = '1 PLAYER vs CPU';
      return `<div class="panel"><div class="title">SELECT SIDES</div><div class="sub">Click a slot, or push ◀ / ▶ (A / D, arrow keys, stick) · <span class="key">Enter</span> when ready</div>
        <div class="sidehead"><span>${homeName}</span><span></span><span>${awayName}</span></div>${rows}
        <div class="modepill">${mode}</div>
        <div class="opts" style="flex-direction:row;justify-content:center;margin-top:16px"><div class="btn nav" data-act="back" style="width:180px">← Back</div><div class="btn nav go" data-act="go" style="width:260px;${assigned() ? '' : 'opacity:.45'}">Continue ▶</div></div>
        <div class="hint"><b>Playing on a keyboard?</b> Just press <span class="key">Enter</span> — you're the home player, with WASD <i>and</i> arrows both working. Two players on one keyboard: P1 = <span class="key">WASD</span>, P2 = <span class="key">arrows</span>. <span class="key">Esc</span> = back</div></div>`;
    },
    action: act => {
      if (act === 'back') return goBack();
      if (act === 'go') { if (!finish()) { Sound.menu(); } return; }
      if (act.startsWith('side:')) { const [, id, v] = act.split(':'); const cur = side.get(id) || 0; setSide(id, cur === +v ? 0 : +v); renderScreen(); }
    },
    back: goBack,
    tick: inputs => {
      let changed = false;
      const first = inputs.find(x => x.inp.confirmPressed || x.inp.startPressed);
      if (!assigned() && first) { side.set(Input.devId(first.dev), -1); Sound.confirm(); renderScreen(); return; }   // Enter / A with nobody picked → you're the home player
      for (const { dev, inp } of inputs) {
        const id = Input.devId(dev), cur = side.get(id) || 0;
        if (inp.navX && setSide(id, clamp(cur + inp.navX, -1, 1))) changed = true;
        if ((inp.confirmPressed || inp.startPressed) && finish()) return;
        if (inp.backPressed) return goBack();
      }
      if (changed || Input.candidates().length !== devs.length) renderScreen();
    },
  });
}

// ------------------------------------------------------------------ team select
function teamSelect({ sides }) {
  const st = { cat: [0, 1], idx: [0, 2], alt: [false, false], active: 0 };
  const tl = s => CATEGORIES[st.cat[s]].teams;
  const pick = s => tl(s)[st.idx[s] % tl(s).length];
  const changeTeam = (s, d) => { const n = tl(s).length; st.idx[s] = (st.idx[s] + d + n) % n; Sound.menu(); renderScreen(); };
  const changeCat = (s, d) => { st.cat[s] = (st.cat[s] + d + CATEGORIES.length) % CATEGORIES.length; st.idx[s] = 0; Sound.menu(); renderScreen(); };
  const toggleKit = s => { st.alt[s] = !st.alt[s]; Sound.menu(); renderScreen(); };
  const goBack = () => { Sound.back(); if (st.active === 1) { st.active = 0; renderScreen(); } else sideSelect({ mode: 'quick' }); };
  const confirmStep = () => {
    Sound.confirm();
    if (st.active === 0) { st.active = 1; renderScreen(); return; }
    if (pick(0).id === pick(1).id) { st.idx[1]++; renderScreen(); return; }
    matchSettings({ sides, teams: [pick(0), pick(1)], alt: st.alt.slice(), from: 'quick' });
  };
  show({
    raw: true,
    render: () => {
      const col = s => {
        const t = pick(s), c = CATEGORIES[st.cat[s]];
        const humans = sides.filter(x => x.team === s).length;
        return `<div class="teamcard ${st.active === s ? 'active' : ''}">
          <div class="side">${s === 0 ? 'HOME' : 'AWAY'} · ${humans ? humans + ' PLAYER' + (humans > 1 ? 'S' : '') : 'CPU'}</div>
          <div class="cat"><span class="arr nav" data-act="cat:${s}:-1">◀</span> ${esc(c.name)} <span class="arr nav" data-act="cat:${s}:1">▶</span></div>
          <div class="crest" style="background:linear-gradient(135deg, ${t.colors.shirt} 50%, ${t.colors.shorts} 50%)"><span>${esc(t.short)}</span></div>
          <div class="tname"><span class="arr nav" data-act="team:${s}:-1">◀</span> ${esc(t.name)} <span class="arr nav" data-act="team:${s}:1">▶</span></div>
          <div class="stars">${stars(t.rating)} <small>${t.rating}</small></div>
          <div class="attrs">ATT ${t.style.attack} · DEF ${t.style.defence} · PAC ${t.style.pace} · PAS ${t.style.passing}</div>
          <div class="form">${esc(t.formation)}</div>
          <div class="kits nav" data-act="kit:${s}" style="cursor:pointer">${kitSwatch(t, false)} ${kitSwatch(t, true)} <small>${st.alt[s] ? 'Away kit' : 'Home kit'} (click to change)</small></div></div>`;
      };
      return `<div class="panel wide"><div class="title">CHOOSE TEAMS</div><div class="sub">${st.active === 0 ? 'Pick the HOME team, then press Enter' : 'Now pick the AWAY team, then press Enter'}</div><div class="teams">${col(0)}<div class="vs">VS</div>${col(1)}</div>
        <div class="opts" style="flex-direction:row;justify-content:center;margin-top:14px"><div class="btn nav" data-act="back" style="width:180px">← Back</div><div class="btn nav go" data-act="ok" style="width:300px">${st.active === 0 ? 'Next: pick away team ▶' : 'Confirm teams ▶'}</div></div>
        <div class="hint">◀ ▶ team · <span class="key">Q</span>/<span class="key">E</span> (LB/RB) league or region · <span class="key">L</span> (Y) kit · <span class="key">Enter</span> confirm · <span class="key">Esc</span> back · mouse: click the arrows</div></div>`;
    },
    action: act => {
      const [k, a, b] = act.split(':');
      if (k === 'back') return goBack();
      if (k === 'ok') return confirmStep();
      if (k === 'team') return changeTeam(+a, +b);
      if (k === 'cat') return changeCat(+a, +b);
      if (k === 'kit') return toggleKit(+a);
    },
    back: goBack,
    tick: inputs => {
      for (const { dev, inp } of inputs) {
        const own = sides.find(x => Input.devId(x.device) === Input.devId(dev));
        let s = own ? own.team : st.active;
        if (!sides.some(x => x.team === st.active) && own) s = st.active; // the human also picks the CPU team
        if (inp.navX) changeTeam(s, inp.navX);
        if (inp.lbPressed || inp.rbPressed) changeCat(s, inp.rbPressed ? 1 : -1);
        if (inp.throughPressed) toggleKit(s);
        if (inp.confirmPressed) return confirmStep();
        if (inp.backPressed) return goBack();
      }
    },
  });
}

// ------------------------------------------------------------------ match settings
const OPTS = {
  halfMinutes: [[2, '2 min halves'], [3, '3 min halves'], [4, '4 min halves'], [5, '5 min halves'], [7.5, '7½ min halves'], [10, '10 min halves']],
  difficulty: [['amateur', 'Amateur'], ['pro', 'Professional'], ['world', 'World Class'], ['legend', 'Legend']],
  time: [['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']],
  weather: [['clear', 'Clear'], ['rain', 'Rain'], ['storm', 'Thunderstorm'], ['snow', 'Snow'], ['fog', 'Fog'], ['random', 'Random']],
  camera: [['broadcast', 'Modern · TV broadcast'], ['classic', 'Classic · high side-on'], ['wide', 'Wide / tactical'], ['close', 'Close'], ['end', 'End-to-end']],
};
function cycleSetting(key, dir) { const list = OPTS[key]; const i = list.findIndex(o => o[0] === settings[key]); settings[key] = list[(i + dir + list.length) % list.length][0]; saveSettings(); }
const label = key => (OPTS[key].find(o => o[0] === settings[key]) || OPTS[key][0])[1];

export function matchSettings(ctx) {
  show({
    render: () => `<div class="panel"><div class="title">MATCH SETTINGS</div><div class="sub">${esc(ctx.teams[0].name)} vs ${esc(ctx.teams[1].name)}${ctx.compName ? ' · ' + esc(ctx.compName) : ''}</div>
      <div class="opts">${!ctx.venue ? `<div class="opt nav" data-cycle data-act="stadium"><span>Stadium</span><span class="val">◀ ${esc(stadiumLabel(ctx))} ▶</span></div>` : `<div class="opt"><span>Venue</span><span class="val">${esc(ctx.venue.name)}</span></div>`}
      ${ctx.sides.length ? '<div class="opt nav" data-act="manage"><span>📋 Team management</span><span class="val">Formation · Line-up · Tactics</span></div>' : ''}
      ${['halfMinutes', 'difficulty', 'time', 'weather', 'camera'].map(k => `<div class="opt nav" data-cycle data-act="${k}"><span>${{ halfMinutes: 'Match length', difficulty: 'CPU difficulty', time: 'Time of day', weather: 'Weather', camera: 'Camera' }[k]}</span><span class="val">◀ ${label(k)} ▶</span></div>`).join('')}
      <div class="opt nav go" data-act="start"><span>KICK OFF ▶</span><span></span></div></div>
      <div class="hint">◀▶ change · <span class="key">A</span> start · <span class="key">B</span> back</div></div>`,
    action: (act, el, dir) => {
      if (act === 'start') { startMatch(ctx); return; }
      if (act === 'manage') { teamManagement(ctx, ctx.sides[0].team, () => matchSettings(ctx)); return; }
      if (act === 'stadium') { const opts = ['home', 'random', ...STADIUMS.map(s => s.id)]; settings.stadium = opts[(opts.indexOf(settings.stadium) + (dir || 1) + opts.length) % opts.length]; saveSettings(); renderScreen(); return; }
      cycleSetting(act, dir || 1); renderScreen();
    },
    back: () => ctx.from === 'comp' ? Comp.hubScreen() : ctx.from === 'career' && ctx.onQuit ? ctx.onQuit() : mainMenu(),
  });
}

function stadiumLabel(ctx) {
  if (settings.stadium === 'home') return 'Home ground · ' + homeStadium(ctx.teams[0]).name;
  if (settings.stadium === 'random') return 'Random';
  return (STADIUMS.find(s => s.id === settings.stadium) || STADIUMS[0]).name;
}
function pickVenue(ctx) {
  if (ctx.venue) return ctx.venue;
  if (settings.stadium === 'home') return homeStadium(ctx.teams[0]);
  if (settings.stadium === 'random') return STADIUMS[Math.floor(Math.random() * STADIUMS.length)];
  return STADIUMS.find(s => s.id === settings.stadium) || homeStadium(ctx.teams[0]);
}

// ------------------------------------------------------------------ controls screen
function controlsScreen(back) {
  let remap = null;
  const km = () => Input.getKeymap();
  const rows = [
    ['Move', 'Left stick / D-pad', 'move'], ['Short pass · Press (defending)', 'A / ✕', 'pass'], ['Shoot (hold for power) · Slide tackle', 'B / ○', 'shoot'],
    ['Through ball · Standing tackle', 'Y / △', 'through'], ['Lob pass · Cross', 'X / □', 'lob'], ['Sprint', 'RB / R1 · RT / R2', 'sprint'],
    ['Switch player', 'LB / L1', 'switch'], ['Skill burst / feint', 'LT / L2 · Right stick', 'skill'], ['Pause', 'Start / Options', 'start'], ['Change camera', 'Back / Share', 'camera'],
  ];
  const keyName = c => (c || '').replace(/^Key/, '').replace(/^Digit/, '').replace('Numpad', 'Num ').replace('Arrow', '').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift');
  const kb = (layout, a) => a === 'move' ? ['up', 'left', 'down', 'right'].map(d => keyName(km()[layout][d])).join(' ') : (km()[layout][a] || []).map(keyName).join(' / ');
  show({
    render: () => `<div class="panel wide"><div class="title">CONTROLS</div>
      <table class="ctl"><tr><th>Action</th><th>Controller</th><th>Keyboard P1</th><th>Keyboard P2</th></tr>
      ${rows.map(([n, pad, a]) => `<tr><td>${n}</td><td>${pad}</td><td class="nav" data-act="kb1:${a}">${remap === 'kb1:' + a ? '<b>press a key…</b>' : kb('kb1', a)}</td><td class="nav" data-act="kb2:${a}">${remap === 'kb2:' + a ? '<b>press a key…</b>' : kb('kb2', a)}</td></tr>`).join('')}
      </table>
      <div class="tips"><b>Mouse / touchpad (keyboard players):</b> move the pointer to aim — a dotted line shows the exact path of the ball · <b>click</b> = pass to the aimed spot or the player nearest it · <b>hold click</b> and release = shoot (longer = harder) · <b>right-click</b> = lob / cross / free-kick over the wall. Works on throw-ins, corners, free kicks and penalties too.<br>
      <b>Keyboard extras:</b> you sprint automatically while moving · <b>E / G</b> = feint (sidestep and shield the ball) · a ring shows who your next pass goes to · <b>Enter</b> skips ceremonies, replays and waits · <b>F1</b> shows this help in a match · <b>Esc</b> or <b>P</b> pauses.</div>
      <div class="tips"><b>Tips:</b> Hold shoot longer for power, but too long sends it over the bar · Aim shots with the stick · Lob from the wing = cross into the box ·
      Defending: hold A to press the ball carrier, B to slide (from behind = foul!), Y for a standing tackle · Passing auto-switches you to the receiver.</div>
      <div class="opts" style="margin-top:14px"><div class="opt nav" data-act="reset"><span>Reset keyboard keys</span><span></span></div><div class="opt nav" data-act="back"><span>Back</span><span></span></div></div>
      <div class="hint">Select a keyboard cell and press <span class="key">A</span>/<span class="key">Enter</span> to remap it</div></div>`,
    action: act => {
      if (act === 'back') return back();
      if (act === 'reset') { Input.resetKeys(); renderScreen(); return; }
      const [layout, a] = act.split(':');
      if (a === 'move') { // remap 4 directions in sequence
        const dirs = ['up', 'down', 'left', 'right']; let i = 0; remap = act; renderScreen();
        const next = () => Input.captureKey(code => { Input.setKey(layout, dirs[i++], code); if (i < dirs.length) next(); else { remap = null; renderScreen(); } });
        next(); return;
      }
      remap = act; renderScreen();
      Input.captureKey(code => { Input.setKey(layout, a, code); remap = null; renderScreen(); });
    },
    back,
  });
}

// ------------------------------------------------------------------ credits
function creditsScreen() {
  show({
    render: () => `<div class="panel"><div class="title">CREDITS</div><div class="tips" style="max-width:720px;line-height:1.9">
      <b>Pitch Clash</b> — game design &amp; code built with Claude Code.<br>
      <b>Players:</b> human bodies, rig and textures from MakeHuman / MPFB2 system assets (CC0).<br>
      <b>Motion capture:</b> The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.<br>
      <b>Commentary voice:</b> Kokoro-82M text-to-speech (voice “bm_george”).<br>
      <b>Engine:</b> three.js (MIT) · Electron (MIT).<br>
      <b>Recordings:</b> royalty-free stadium, crowd, commentary and music audio by BombinSound, JonathanSlatterMusic, Arunangshu Banerjee, DJArtMusic, FreeSound Community and ZoeDit.<br>
      <b>Music:</b> original generative soundtrack${Sound.nowPlaying() ? ' · Now playing: ' + esc(Sound.nowPlaying().title + ' — ' + Sound.nowPlaying().artist) : ''}.<br>
      All club and competition names are fictional. National teams use country names and flag colours only.</div>
      <div class="opts" style="margin-top:16px"><div class="opt nav" data-act="back"><span>Back</span><span></span></div></div></div>`,
    action: () => mainMenu(), back: () => mainMenu(),
  });
}

// ------------------------------------------------------------------ settings screen
function settingsScreen(back) {
  const pct = v => Math.round(v * 100) + '%';
  show({
    render: () => `<div class="panel"><div class="title">SETTINGS</div><div class="opts">
      <div class="opt nav" data-cycle data-act="vol:master"><span>Master volume</span><span class="val">◀ ${pct(Sound.volume.master)} ▶</span></div>
      <div class="opt nav" data-cycle data-act="vol:crowd"><span>Crowd volume</span><span class="val">◀ ${pct(Sound.volume.crowd)} ▶</span></div>
      <div class="opt nav" data-cycle data-act="vol:sfx"><span>Effects volume</span><span class="val">◀ ${pct(Sound.volume.sfx)} ▶</span></div>
      <div class="opt nav" data-cycle data-act="vol:music"><span>Music volume</span><span class="val">◀ ${pct(Sound.volume.music)} ▶</span></div>
      <div class="opt nav" data-cycle data-act="vol:voice"><span>Commentary volume</span><span class="val">◀ ${pct(Sound.volume.voice)} ▶</span></div>
      <div class="opt nav" data-act="nexttrack"><span>♪ Next music track</span><span class="val">${window.Music && Music.current && Music.current() ? esc(Music.current().title) : ''}</span></div>
      <div class="opt nav" data-cycle data-act="commentary"><span>Spoken commentary</span><span class="val">◀ ${Sound.commentary ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="quality"><span>Graphics quality</span><span class="val">◀ ${settings.quality} ▶</span></div>
      <div class="opt nav" data-cycle data-act="zoom"><span>Camera zoom</span><span class="val">◀ ${settings.zoom.toFixed(2)}× ▶</span></div>
      <div class="opt nav" data-cycle data-act="ceremony"><span>Pre-match ceremony</span><span class="val">◀ ${{ full: 'Full', short: 'Short', off: 'Off' }[settings.ceremony]} ▶</span></div>
      <div class="opt nav" data-cycle data-act="injuries"><span>Injuries</span><span class="val">◀ ${settings.injuries ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="var"><span>VAR</span><span class="val">◀ ${settings.var ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="cuts"><span>TV director cuts (corner / free-kick / injury cams)</span><span class="val">◀ ${settings.cuts ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="mouseAim"><span>Mouse / touchpad aiming</span><span class="val">◀ ${settings.mouseAim ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="autoSprint"><span>Keyboard auto-sprint (just hold a direction)</span><span class="val">◀ ${settings.autoSprint ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="assisted"><span>Player assists (auto-switch, easy shots)</span><span class="val">◀ ${settings.assisted ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="autoSubs"><span>Auto-substitutions (your team)</span><span class="val">◀ ${settings.autoSubs ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="replays"><span>Goal replays</span><span class="val">◀ ${settings.replays ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="radar"><span>Radar</span><span class="val">◀ ${settings.radar ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-cycle data-act="names"><span>Player names</span><span class="val">◀ ${settings.names ? 'On' : 'Off'} ▶</span></div>
      <div class="opt nav" data-act="back"><span>Back</span><span></span></div></div>
      <div class="hint">F11 toggles full screen</div></div>`,
    action: (act, el, dir) => {
      dir = dir || 1;
      if (act === 'back') return back();
      if (act === 'nexttrack') { if (window.Music && Music.next) Music.next(); setTimeout(renderScreen, 400); return; }
      if (act.startsWith('vol:')) { const k = act.slice(4); Sound.setVolume(k, clamp(Math.round((Sound.volume[k] + dir * 0.1) * 10) / 10, 0, 1)); }
      if (act === 'commentary') Sound.setCommentary(!Sound.commentary);
      if (act === 'quality') { const q = ['low', 'medium', 'high']; settings.quality = q[(q.indexOf(settings.quality) + dir + 3) % 3]; renderer.setQuality(settings.quality); }
      if (act === 'zoom') { settings.zoom = clamp(Math.round((settings.zoom + dir * 0.1) * 10) / 10, 0.6, 1.5); renderer.zoomSetting = settings.zoom; }
      if (['replays', 'radar', 'names', 'injuries', 'var', 'autoSubs', 'assisted', 'mouseAim', 'autoSprint', 'cuts'].includes(act)) settings[act] = !settings[act];
      if (act === 'ceremony') { const o = ['full', 'short', 'off']; settings.ceremony = o[(o.indexOf(settings.ceremony) + dir + 3) % 3]; }
      saveSettings(); renderScreen();
    },
    back,
  });
}

// ------------------------------------------------------------------ match runtime
let M = null, run = null, run_venue = null;
const HUMAN_COLORS = ['#ffd84d', '#4dd2ff', '#ff7ad9', '#9dff6b'];
const GK_KITS = [{ shirt: '#22c55e', shorts: '#14532d', socks: '#22c55e', gloves: '#f8fafc' }, { shirt: '#f97316', shorts: '#1f2937', socks: '#f97316', gloves: '#f8fafc' }, { shirt: '#a855f7', shorts: '#1e1b4b', socks: '#a855f7', gloves: '#f8fafc' }];

function colorDist(a, b) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); return Math.hypot(((pa >> 16) & 255) - ((pb >> 16) & 255), ((pa >> 8) & 255) - ((pb >> 8) & 255), (pa & 255) - (pb & 255)); }

export function startMatch(ctx) {
  // ctx: { sides:[{device,team}], teams:[t0,t1], alt:[bool,bool], from:'quick'|'comp', knockout, compName, fixture, onEnd(result) }
  show(null); menuEl.innerHTML = '';
  $('loading').classList.remove('hidden'); $('loadtext').textContent = 'Walking out of the tunnel…';
  setTimeout(() => buildMatch(ctx), 30);
}

function buildMatch(ctx) {
  const [t0, t1] = ctx.teams;
  const kit0 = (ctx.alt && ctx.alt[0]) ? (t0.colors.alt || t0.colors) : t0.colors;
  let kit1 = (ctx.alt && ctx.alt[1]) ? (t1.colors.alt || t1.colors) : t1.colors;
  if (colorDist(kit0.shirt, kit1.shirt) < 120) kit1 = t1.colors.alt && colorDist(kit0.shirt, t1.colors.alt.shirt) > colorDist(kit0.shirt, kit1.shirt) ? t1.colors.alt : { shirt: '#f8fafc', shorts: '#111827', socks: '#f8fafc' };
  const squads = [0, 1].map(i => (ctx.squads && ctx.squads[i]) || makeSquad(ctx.teams[i], i + 1));
  const mg = ctx.manage || {};
  const forms = [0, 1].map(i => FORMATIONS[(mg[i] && mg[i].formation) || ctx.teams[i].formation] || FORMATIONS['4-4-2']);
  const lineups = [0, 1].map(i => mg[i] ? mg[i].xi : null);
  const tactics = [0, 1].map(i => mg[i] ? mg[i].tactics : null);
  const humans = ctx.sides.map(s => ({ team: s.team, device: s.device }));
  const weather = settings.weather === 'random' ? ['clear', 'clear', 'rain', 'storm', 'snow', 'fog'][Math.floor(Math.random() * 6)] : settings.weather;
  const ui = { captions: [], ticker: '' };
  Input.setMerge(!(humans.some(h => h.device.type === 'kb1') && humans.some(h => h.device.type === 'kb2')));   // one keyboard player → WASD and arrows both work
  M = new Match({
    teams: [t0, t1], squads, formations: forms, humans, lineups, tactics,
    halfLength: settings.halfMinutes * 60, difficulty: settings.difficulty, knockout: !!ctx.knockout, extraTime: ctx.extraTime, aggregate: ctx.aggregate, weather, injuries: settings.injuries, var: settings.var, autoSubs: settings.autoSubs, assist: settings.assisted, autoSprint: settings.autoSprint, events: (type, d) => onEvent(type, d),
  });
  M.kits = [kit0, kit1];
  const venue = pickVenue(ctx); renderer.setStadium(venue); run_venue = venue;   // the stadium first: extras (booth, commentators) are placed in it
  renderer.clearCharacters();
  renderer.onCut = () => wipe();
  const gk0 = GK_KITS.find(k => colorDist(k.shirt, kit0.shirt) > 120 && colorDist(k.shirt, kit1.shirt) > 120) || GK_KITS[0];
  const gk1 = GK_KITS.find(k => k !== gk0 && colorDist(k.shirt, kit0.shirt) > 120 && colorDist(k.shirt, kit1.shirt) > 120) || GK_KITS[1];
  for (const p of M.all) renderer.makeCharacter(p, p.team === 0 ? kit0 : kit1, p.team === 0 ? gk0 : gk1);
  M.gkKits = [gk0, gk1];
  extras.build(M, M.kits);
  renderer.setAtmosphere(settings.time, weather);
  Sound.music(false); Sound.weather(weather); Sound.preload();
  renderer.colorCrowd(kit0.shirt, kit1.shirt);
  run = { help: { until: performance.now() + 35000, pinned: false }, ctx, t: 0, replay: null, shootout: null, paused: false, goalT: 0, excite: [0, 0], lastEvent: 0, tension: 0 };
  $('loading').classList.add('hidden');
  buildHud(t0, t1, kit0, kit1);
  hudEl.classList.remove('hidden');
  Sound.crowd(0.55, 0.1); Sound.chant(true);
  if (settings.ceremony !== 'off') startCeremony();
  else {
    Sound.asset('jingle_kickoff', { gain: 0.8, bus: 'music', fade: 1.5 }); caption('KICK OFF', `${t0.name} vs ${t1.name}`, 2200); Sound.comment('intro', { pri: 1, fallback: `Welcome to tonight's match. ${t0.name} take on ${t1.name}.` }); }
  if (weather !== 'clear') setTimeout(() => ticker({ rain: '🌧 Rain — the ball will skid on the wet surface', storm: '⛈ Thunderstorm — wind and a slick pitch', snow: '❄ Snow — the ball holds up in the snow', fog: '🌫 Fog — visibility is poor' }[weather] || ''), 2500);
}

// ------------------------------------------------------------------ HUD
function buildHud(t0, t1, k0, k1) {
  hudEl.innerHTML = `
    <div id="sb"><div class="sbt"><i style="background:${k0.shirt}"></i>${esc(t0.short)}</div><div id="sbs">0 - 0</div><div class="sbt">${esc(t1.short)}<i style="background:${k1.shirt}"></i></div><div id="sbc">0'</div></div>
    <div id="pens" class="hidden"></div>
    <canvas id="radar" width="260" height="168" class="${settings.radar ? '' : 'hidden'}"></canvas>
    <div id="tags"></div>
    <div id="banner"></div>
    <div id="ticker"></div>
    <div id="prompt"></div>
    <div id="lower"></div>
    <div id="halfstats"></div>
    <div id="wipe"></div>
    <div id="gauges"></div>
    <div id="keyhelp"></div>
    <div id="replaybadge" class="hidden">● REPLAY <small>A to skip</small></div>`;
}
function caption(text, sub = '', ms = 2000, cls = '') {
  const b = $('banner'); if (!b) return;
  b.className = cls; b.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(caption._t); if (ms) caption._t = setTimeout(() => b.classList.remove('show'), ms);
}
// Premier League-style lower-third graphic
function lower(title, sub, color = '#6ee7a8', ms = 4200) {
  const el = $('lower'); if (!el) return;
  el.style.setProperty('--c', color); el.innerHTML = `<div class="lt-strip"></div><div class="lt-body"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); clearTimeout(lower._t); lower._t = setTimeout(() => el.classList.remove('show'), ms);
}
function wipe() { const w = $('wipe'); if (!w) return; w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); }
function ticker(text) { const t = $('ticker'); if (!t) return; t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(ticker._t); ticker._t = setTimeout(() => t.classList.remove('show'), 3200); }
const pname = p => p && p.info ? p.info.name : '';
const tname = t => M.teams[t].def.name;

const moveLabel = d => d.type === 'pad' ? 'Left stick' : d.type === 'kb2' && !M.humans.some(h => h.device.type === 'kb1') ? 'WASD / Arrows' : d.type === 'kb1' && !M.humans.some(h => h.device.type === 'kb2') ? 'WASD / Arrows' : d.type === 'kb1' ? 'W A S D' : '← ↑ ↓ →';
function keyHelpHtml() {
  return M.humans.map(h => {
    const d = h.device, k = a => `<b>${esc(Input.keyLabel(d, a))}</b>`;
    return `<div class="khrow"><span class="khp" style="background:${HUMAN_COLORS[h.id]}">P${h.id + 1}</span>
      MOVE <b>${moveLabel(d)}</b> <i>${settings.autoSprint && d.type !== 'pad' ? '(you sprint automatically)' : ''}</i> · PASS ${k('pass')} · SHOOT ${k('shoot')} <i>(hold = power)</i> · LOB / CROSS ${k('lob')} · THROUGH ${k('through')} · FEINT ${k('skill')} · SWITCH ${k('switch')}</div>
      ${['kb1', 'kb2'].includes(d.type) && settings.mouseAim ? `<div class="khrow">🖱 <b>MOUSE / TOUCHPAD</b>: <b>click an opponent</b> when defending = chase &amp; tackle · aim the dotted line · <b>click</b> = pass · <b>hold click</b> = shoot (release) · <b>right-click</b> = lob / cross / free-kick</div>` : ''}
      <div class="khrow dim">Defending: hold ${k('pass')} to chase the ball · ${k('shoot')} near the carrier = slide tackle · ${k('through')} = standing tackle · ${d.type === 'pad' ? 'Start' : 'Esc'} = pause</div>`;
  }).join('');
}
function updatePrompts() {
  const pr = $('prompt'), kh = $('keyhelp'); if (!pr || !kh) return;
  // key cheat-sheet: first 35 s of the match, F1 pins it
  const showHelp = run.help.pinned || (performance.now() < run.help.until && !run.ceremony);
  if (showHelp !== kh._on) { kh._on = showHelp; kh.classList.toggle('show', showHelp); if (showHelp) kh.innerHTML = keyHelpHtml() + '<div class="khrow dim">F1 shows / hides this help</div>'; }
  // set-piece prompt for the human who has to take it
  let msg = '';
  const sp = M.phase === 'setpiece' && M.setPiece;
  if (sp && !run.ceremony && sp.taker && sp.taker.human !== null) {
    const h = M.humans[sp.taker.human], d = h.device, pass = Input.keyLabel(d, 'pass'), shoot = Input.keyLabel(d, 'shoot'), lob = Input.keyLabel(d, 'lob');
    const secs = Math.max(0, Math.ceil((sp.type === 'kickoff' ? 7 : 9) - sp.t));
    msg = { kickoff: `Press <b>${esc(pass)}</b> to KICK OFF`, throwin: `THROW-IN — press <b>${esc(pass)}</b> to throw (aim with ${moveLabel(d)})`, corner: `CORNER — <b>${esc(lob)}</b> to cross · <b>${esc(pass)}</b> to play short`, freekick: `FREE KICK — hold <b>${esc(shoot)}</b> to shoot · <b>${esc(pass)}</b> to pass`, goalkick: `GOAL KICK — <b>${esc(lob)}</b> long · <b>${esc(pass)}</b> short`, penalty: `PENALTY — aim with ${moveLabel(d)}, hold <b>${esc(shoot)}</b> then release` }[sp.type] || '';
    if (msg && sp.type !== 'penalty') msg += ` <small>(CPU takes it in ${secs}s)</small>`;
  } else if (sp && sp.type === 'kickoff' && !run.ceremony) msg = 'Waiting for the opposition to kick off…';
  if (msg !== pr._m) { pr._m = msg; pr.innerHTML = msg; pr.classList.toggle('show', !!msg); }
}
// ---- PES-style shot power gauge: fills while the shoot key is held, red zone = over-hit
const gaugeState = {};
function updateGauges() {
  const box = $('gauges'); if (!box) return;
  const now = performance.now();
  const hs = M.humans.filter(h => h.player);
  if (box.children.length !== M.humans.length) box.innerHTML = M.humans.map(() => '<div class="gauge"><div class="gl"><span>SHOT POWER</span><b></b></div><div class="gtrack"><div class="gfill"><i></i></div><div class="gred"></div></div></div>').join('');
  M.humans.forEach((h, idx) => {
    const el = box.children[idx], p = h.player; if (!el) return;
    const gs = gaugeState[h.id] || (gaugeState[h.id] = { was: false, hold: 0, val: 0 });
    const charging = !!p && p.charging === 'shoot';
    let g = charging ? M.gauge(p.charge) : 0;
    if (charging) { gs.was = true; gs.val = g; gs.hold = 0; if (now - (gs.tick || 0) > 85 && g > 0.02) { gs.tick = now; Sound.tick && Sound.tick(g); } }
    else if (gs.was) { gs.was = false; gs.hold = now + 900; }       // just released: keep the final value on screen for a moment
    const show = charging || now < gs.hold;
    el.classList.toggle('show', show && !!p);
    if (!show || !p) return;
    g = charging ? g : gs.val;
    const v = camVec.set(p.x, 0, p.z).project(renderer.camera);
    el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * window.innerHeight + 16) + 'px';
    el.querySelector('.gfill').style.width = (g * 100) + '%';
    const over = g >= 0.77;
    el.classList.toggle('over', over); el.classList.toggle('released', !charging);
    el.querySelector('b').textContent = over ? Math.round(g * 100) + '% · OVER-HIT!' : Math.round(g * 100) + '%';
  });
}
const camVec = new THREE.Vector3();
// ---- predicted flight of the shot while charging (keyboard / pad)
function updateShotPreview(inputs) {
  if (!M || !run || screen || run.ceremony || run.replay || run.viewer) return;
  let shown = false;
  M.humans.forEach((h, i) => {
    const p = h.player; if (shown || !p || p.charging !== 'shoot' || !(M.ball.owner === p || (M.phase === 'setpiece' && M.setPiece && M.setPiece.taker === p))) return;
    const inp = inputs[i] || {}, aim = M.shotAim(p, { x: inp.mx || 0, z: inp.my || 0 }, p.charge), pr = M.predictShot(p, aim, M.shotPowerKey(p.charge));
    renderer.setAim(pr.pts, pr.over ? 0xff4d4d : p.charge > 0.5 ? 0xffa31a : 0x6ee7a8, pr.end, 1.4); shown = true;
  });
}
function updateHud() {
  const s = $('sbs'); if (!s) return;
  { const hs = $('halfstats'), on = !!(run && (run.halftime || (run.fulltime && !(run.shootout && run.shootout.state !== 'done')))); if (hs && on !== hs._on) { hs._on = on; hs.classList.toggle('show', on); if (on) hs.innerHTML = `<h3>${esc(tname(0))} ${M.score[0]} – ${M.score[1]} ${esc(tname(1))}</h3>${statsTable(M.stats)}`; } }
  updatePrompts();
  s.textContent = `${M.score[0]} - ${M.score[1]}`;
  $('sbc').textContent = (M.half > 2 ? 'ET ' : '') + M.clockLabel();
  // tags for controlled players
  const tags = $('tags'); const want = M.humans.filter(h => h.player);
  if (tags.children.length !== want.length) tags.innerHTML = want.map(() => '<div class="tag"><span class="nm"></span><div class="bar pw"><div></div></div><div class="bar st"><div></div></div></div>').join('');
  const v = renderer.camera;
  want.forEach((h, i) => {
    const p = h.player, el = tags.children[i];
    const pos = { x: p.x, y: 2.35, z: p.z };
    const vec = new renderer.camera.position.constructor(pos.x, pos.y, pos.z).project(v);
    el.style.left = ((vec.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - vec.y) / 2 * window.innerHeight) + 'px';
    el.style.setProperty('--c', HUMAN_COLORS[h.id]);
    el.children[0].textContent = (M.humans.length > 1 ? `P${h.id + 1} ` : '') + (settings.names ? `${p.info.number} ${p.info.name.split(' ').pop()}` : '');
    el.children[1].style.visibility = p.charging ? 'visible' : 'hidden'; el.children[1].firstChild.style.width = Math.min(100, p.charge / 1.1 * 100) + '%';
    el.children[1].firstChild.style.background = p.charge > 0.92 ? '#ff3b3b' : '';
    el.children[2].firstChild.style.width = (p.stamina * 100) + '%';
  });
  updateGauges();
  // radar
  if (settings.radar) {
    const c = $('radar'), g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,40,20,0.55)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1;
    g.strokeRect(4, 4, W - 8, H - 8); g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W / 2, H - 4); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 14, 0, 7); g.stroke();
    const bx = 34 / 105 * (W - 8), by = 40 / 68 * (H - 8);
    g.strokeRect(4, H / 2 - by / 2, bx * 0.5, by); g.strokeRect(W - 4 - bx * 0.5, H / 2 - by / 2, bx * 0.5, by);
    const X = x => 4 + (x + 52.5) / 105 * (W - 8), Y = z => 4 + (z + 34) / 68 * (H - 8);
    for (const p of M.all) {
      if (p.sentOff) continue;
      g.fillStyle = M.kits[p.team].shirt; g.beginPath(); g.arc(X(p.x), Y(p.z), p.human !== null ? 4.5 : 3.2, 0, 7); g.fill();
      if (p.human !== null) { g.strokeStyle = HUMAN_COLORS[p.human]; g.lineWidth = 2; g.stroke(); }
    }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(M.ball.x), Y(M.ball.z), 2.6, 0, 7); g.fill();
  }
}

// ------------------------------------------------------------------ match events → sound / captions / effects
function onEvent(type, d) {
  const now = performance.now();
  switch (type) {
    case 'kick': {
      const pw = clamp((d.power - 8) / 25, 0, 1);
      if (d.kind === 'pass' || d.kind === 'throw') Sound.pass(); else Sound.kick(pw);
      if (d.kind === 'cross') Sound.comment('cross', { pri: 0 }); if (d.kind === 'header' && M.ball.shot) Sound.comment('header', { pri: 1 });
      if (pw > 0.6) renderer.emit(M.ball.x, 0.1, M.ball.z, 14, { color: 0x5f9e4f, speed: 3 });
      if (d.p.human !== null) Input.rumble(M.humans[d.p.human].device, 0.15 + pw * 0.4, 0.3, 80);
      break;
    }
    case 'shot': { run.tension = 1; if (d.p.human !== null && d.power > 1.0) ticker('Way too much power!'); Sound.comment('shot', { pri: 1 }); break; }
    case 'bounce': Sound.bounce(d.v); break;
    case 'control': Sound.touch(); break;
    case 'deflect': Sound.touch(); break;
    case 'post': Sound.post(); renderer.shake = 0.3; caption('OFF THE WOODWORK!', '', 1500, 'small'); Sound.comment('post', { pri: 2, then: ['colour_post'], fallback: 'Off the post!' }); break;
    case 'net': if (M.phase === 'goal') { const s = d.side; renderer.rippleNet(s, M.ball.x, M.ball.y, M.ball.z); Sound.net(); } break;
    case 'save': {
      Sound.catchBall();
      if (M.ball.shot || run.tension > 0.5) { Sound.ooh(M.ball.lastKick && M.ball.lastKick.sp === 'freekick'); const line = d.caught ? `Great save by ${pname(d.k)}!` : `${pname(d.k)} pushes it away!`; ticker(line); Sound.comment('save', { pri: 2, then: Math.random() < 0.35 ? ['colour_save'] : [], fallback: line }); }
      else if (d.caught) Sound.comment('catch', { pri: 0 });
      run.tension = 0; break;
    }
    case 'slide': Sound.slide(); renderer.emit(d.p.x, 0.05, d.p.z, 24, { color: 0x6b8f3a, speed: 2.5 }); break;
    case 'tackle': if (d.won) { Sound.tackle(); if (d.slide) { ticker(`Superb tackle by ${pname(d.p)}`); Sound.comment('tackle', { pri: 0 }); } } break;
    case 'foul': {
      Sound.whistle(0.4); Sound.boo();
      const v = d.victim; if (v.human !== null) Input.rumble(M.humans[v.human].device, 1, 0.6, 300);
      let msg = `Foul by ${pname(d.offender)}`;
      Sound.comment(d.penalty ? 'penalty' : d.card === 'yellow' ? 'yellow' : d.card ? 'red' : 'foul', { pri: d.penalty || d.card ? 2 : 0, then: Math.random() < 0.3 ? ['colour_foul'] : [] });
      if (d.card) lower((d.card === 'yellow' ? '🟨 YELLOW CARD' : '🟥 RED CARD'), `${pname(d.offender)} · ${M.teams[d.offender.team].def.name}`, d.card === 'yellow' ? '#facc15' : '#ef4444', 3800);
      if (d.card === 'yellow') msg = `🟨 Yellow card · ${pname(d.offender)}`;
      if (d.card === 'red' || d.card === 'red2') msg = `🟥 RED CARD · ${pname(d.offender)}`;
      if (d.penalty) { caption('PENALTY!', msg, 2500); } else caption(d.card ? (d.card === 'yellow' ? 'YELLOW CARD' : 'RED CARD') : 'FOUL', msg, 1800, 'small ' + (d.card ? 'card-' + d.card.slice(0, 3) : ''));
      break;
    }
    case 'offside': Sound.whistle(0.3); caption('OFFSIDE', pname(d.p), 1400, 'small'); Sound.comment('offside', { pri: 1 }); break;
    case 'whistle': if (d.reason === 'out') { Sound.whistle(0.18); if (M.ball.shot && M.pending && M.pending.type === 'goalkick') { Sound.ooh(M.ball.lastKick && M.ball.lastKick.sp === 'freekick'); Sound.comment('miss', { pri: 1 }); } } if (d.reason === 'period') { Sound.whistle(0.4); Sound.whistle(0.4, 0.5); Sound.whistle(0.9, 1.0); } break;
    case 'setpiece': {
      const names = { corner: 'CORNER', goalkick: 'GOAL KICK', throwin: 'THROW-IN', freekick: 'FREE KICK', penalty: 'PENALTY' };
      if (d.type !== 'kickoff' && d.type !== 'throwin' && !run.shootout) ticker(`${names[d.type]} · ${tname(d.team)}`);
      if (['corner', 'freekick', 'penalty'].includes(d.type) && !run.shootout && M.setPiece && M.setPiece.taker) { const tk = M.setPiece.taker; lower(({ corner: 'CORNER KICK', freekick: 'FREE KICK', penalty: 'PENALTY' })[d.type], `${tk.info.number}  ${tk.info.name} · ${tname(d.team)}`, M.kits[d.team].shirt, 3600); }
      if (d.type === 'corner' && !run.shootout) Sound.comment('corner', { pri: 0 });
      if (d.type === 'freekick' && !run.shootout && Math.abs(M.goalX(d.team) - M.setPiece.x) < 32) Sound.comment('freekick', { pri: 1 });
      break;
    }
    case 'play': if (M.setPiece && M.setPiece.type === 'kickoff') { Sound.whistle(0.3); if (M.score[0] + M.score[1] === 0 || M.clock < 1) Sound.comment(M.half === 1 ? 'kickoff' : 'secondhalf', { pri: 0 }); } break;
    case 'kickoff': break;
    case 'goal': onGoal(d); break;
    case 'halftime': run.halftime = true; caption('HALF TIME', `${tname(0)} ${M.score[0]} - ${M.score[1]} ${tname(1)}`, 0); Sound.applause(); Sound.comment('halftime', { pri: 2, then: ['colour_halftime'] }); renderer.director && renderer.director.request('booth', 3.6); break;
    case 'extratime': run.halftime = true; caption('EXTRA TIME', 'All square — 30 more minutes', 0); Sound.comment('extratime', { pri: 2 }); break;
    case 'fulltime': run.fulltime = true; caption('FULL TIME', `${tname(0)} ${M.score[0]} - ${M.score[1]} ${tname(1)}`, 0); Sound.applause(); { const w = M.score[0] === M.score[1] ? null : M.score[0] > M.score[1] ? 0 : 1; Sound.comment('fulltime', { pri: 3, then: [...(w !== null ? ['winner'] : []), 'colour_fulltime'] }); if (w !== null) setTimeout(() => Sound.teamName(M && M.teams[w].def.id, 3), 10); } break;
    case 'penalties': startShootout(); break;
    case 'switch': break;
    case 'injury': Sound.whistle(0.5); caption('INJURY', `${pname(d.p)} is down`, 2500, 'small'); Sound.comment('injury', { pri: 2 }); ticker('🚑 Medical team on the pitch · press A to skip'); break;
    case 'stretcher': ticker(`🚑 ${pname(d.p)} is stretchered off`); Sound.applause(); break;
    case 'sub': {
      const t = M.teams[d.team].def;
      caption('SUBSTITUTION', `${t.short}  ⬇ ${d.outInfo.number} ${d.outInfo.name}   ⬆ ${d.inInfo.number} ${d.inInfo.name}`, 2600, 'small sub');
      Sound.comment('sub', { pri: 0 }); Sound.applause();
      lower('🔁 SUBSTITUTION', `⬇ ${d.outInfo.number} ${d.outInfo.name}   ⬆ ${d.inInfo.number} ${d.inInfo.name} · ${t.name}`, M.kits[d.team].shirt, 5000);
      renderer.replaceCharacter(d.p, M.kits[d.team], M.gkKits[d.team]);
      break;
    }
    case 'subQueued': if (M.humans.some(h => h.team === d.team)) ticker(`Substitution ready · ${d.inn.name} comes on at the next stoppage`); break;
    case 'added': caption(`+${d.minutes}`, 'Minutes of added time', 1800, 'small'); Sound.comment('added', { pri: 0 }); break;
    case 'var': caption('VAR CHECK', 'Checking possible ' + (M.var ? M.var.reason.toLowerCase() : 'infringement'), 0, 'small var'); Sound.comment('var', { pri: 3, then: ['colour_var'] }); Sound.crowd(0.3, 0.9); break;
    case 'varResult':
      if (d.overturn) { caption('NO GOAL', d.reason + ' · goal disallowed', 2600, 'small card-red'); Sound.boo(); Sound.comment('var_no', { pri: 3 }); run.excite[d.team] = 0; }
      else { caption('GOAL STANDS', 'VAR confirms the goal', 2000, 'small'); Sound.roar(); Sound.comment('var_ok', { pri: 3 }); }
      updateHud(); break;
  }
}

function onGoal(d) {
  if (run.shootout) return run.shootout.onGoal();
  const team = d.team;
  Sound.roar(true); Sound.whistle(0.25, 0.3);
  if (window.Music && Music.sting) Music.sting('goal');
  renderer.shake = 0.5;
  run.excite[team] = 1;
  run.goalT = 0; run.replayQueued = settings.replays;
  const who = d.player ? d.player.name : '';
  caption('GOAL!', d.own ? `Own goal · ${who}` : `${who} · ${tname(team)}`, 3200, 'goal');
  const sc = M.score, then = sc[0] === sc[1] ? ['equaliser'] : (sc[team] - sc[1 - team] === 1 ? ['lead'] : []);
  const pro = !d.own && Math.random() < 0.65;                       // most of the time the real commentator calls it
  Sound.comment(d.own ? 'owngoal' : pro ? 'goal_pro' : 'goal', { pri: 3, team: d.own || pro ? null : M.teams[team].def.id, then: [...then, 'colour_goal'], fallback: `Goal! ${who} scores for ${tname(team)}!` });
  lower(`⚽ ${d.label || d.minute + "'"}  ${who}${d.own ? ' (OG)' : ''}`, `${tname(team)} ${M.score[0]} – ${M.score[1]} ${tname(1 - team)}${d.assist ? ' · assist ' + d.assist.name : ''}`, M.kits[team].shirt, 6000);
  M.humans.forEach(h => Input.rumble(h.device, h.team === team ? 0.5 : 1, h.team === team ? 1 : 0.3, 600));
  renderer.emit(M.ball.x, 1.2, M.ball.z, 60, { colors: [M.kits[team].shirt, '#ffffff'], speed: 5, life: 1.5, size: 0.2 });
  extras.flares(team, M.kits);
  const s = M.ball.x > 0 ? 1 : -1; renderer.rippleNet(s, M.ball.x, M.ball.y, M.ball.z); Sound.net();
}

// ------------------------------------------------------------------ penalty shootout
function startShootout() {
  caption('PENALTIES', 'Sudden death after five kicks each', 2500);
  Sound.comment('shootout', { pri: 3 });
  const so = run.shootout = { kicks: [[], []], turn: 0, t: 0, state: 'wait', result: null };
  M.phase = 'prekick';
  const pensEl = $('pens'); pensEl.classList.remove('hidden');
  const takers = [0, 1].map(t => M.active(t).filter(p => !p.isGK).sort((a, b) => b.shooting - a.shooting));
  so.render = () => {
    pensEl.innerHTML = [0, 1].map(t => `<div><b>${esc(M.teams[t].def.short)}</b>${so.kicks[t].map(k => `<i class="${k ? 'y' : 'n'}"></i>`).join('')}${'<i></i>'.repeat(Math.max(0, 5 - so.kicks[t].length))}</div>`).join('');
  };
  so.render();
  so.next = () => {
    const t = so.turn;
    const k = so.kicks[t].length;
    const taker = takers[t][k % takers[t].length];
    // goal at the +x end (team's attack direction may vary)
    const d = M.dir(t);
    M.beginSetPiece('penalty', t, d * (PITCH.HL - PITCH.SPOT), 0);
    M.setPiece.taker = taker; taker.x = d * (PITCH.HL - PITCH.SPOT) - d * 1.2; taker.z = 0; taker.face = d > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const p of M.all) if (p !== taker && !p.isGK) { p.x = (p.team === 0 ? -1 : 1) * 3 + (p.idx % 5) * 1.2 * (p.team ? 1 : -1); p.z = (p.idx % 2 ? 1 : -1) * 2; }
    const ok = M.keeper(1 - t); M.all.filter(p => p.isGK && p !== ok).forEach(p => { p.x = 0; p.z = -8; });
    const hum = M.humans.find(h => h.team === t); if (hum) M.setHuman(hum, taker); M.humans.filter(h => h.team !== t).forEach(h => M.setHuman(h, null));
    so.state = 'kick'; so.t = 0; so.scored = false; so.taker = taker;
  };
  so.onGoal = () => { if (so.state === 'flight' && M.ball.lastTouch === so.taker) { so.scored = true; Sound.roar(); caption('SCORED!', pname(so.taker), 1200, 'small'); Sound.comment('pen_scored', { pri: 2 }); } M.score[so.turn]--; };
  so.update = dt => {
    so.t += dt;
    if (so.state === 'wait' && so.t > 2.5) so.next();
    else if (so.state === 'kick' && M.phase === 'play') { so.state = 'flight'; so.t = 0; }
    else if (so.state === 'flight' && (so.scored || so.t > 2.6 || M.phase === 'stopped')) {
      if (!so.scored) { Sound.ooh(); caption('MISSED!', pname(so.taker), 1200, 'small'); Sound.comment('pen_missed', { pri: 2 }); }
      so.kicks[so.turn].push(so.scored); so.render();
      M.phase = 'prekick'; M.pending = null;
      // decide
      const [a, b] = so.kicks.map(k => k.filter(Boolean).length), [na, nb] = so.kicks.map(k => k.length);
      const remA = Math.max(0, 5 - na), remB = Math.max(0, 5 - nb);
      let winner = null;
      if (na <= 5 && nb <= 5) { if (a + remA < b) winner = 1; else if (b + remB < a) winner = 0; else if (na === 5 && nb === 5 && a !== b) winner = a > b ? 0 : 1; }
      else if (na === nb && a !== b) winner = a > b ? 0 : 1;
      if (winner !== null) { so.result = { h: a, a: b, winner }; so.state = 'done'; caption(`${tname(winner)} WIN!`, `${a} - ${b} on penalties`, 0, 'goal'); Sound.roar(); Sound.comment('winner', { pri: 3, team: M.teams[winner].def.id }); run.fulltime = true; run.excite[winner] = 1; return; }
      so.turn = 1 - so.turn; so.state = 'wait'; so.t = 1.0;
    }
  };
}

// ------------------------------------------------------------------ replay
function startReplay() {
  const frames = M.replay.slice(-30 * 5);
  if (frames.length < 10) return false;
  run.replay = { frames, i: 0, t: 0, angle: Math.floor(Math.random() * 3), speed: 0.5 };
  $('replaybadge').classList.remove('hidden'); $('replaybadge').innerHTML = '● REPLAY <small>X camera · A skip</small>';
  return true;
}

// ------------------------------------------------------------------ team management (pre-match & in-match)
const TACTICS = {
  mentality: [[-2, 'Ultra defensive'], [-1, 'Defensive'], [0, 'Balanced'], [1, 'Attacking'], [2, 'All-out attack']],
  pressing: [[0, 'Low block'], [1, 'Medium'], [2, 'High press']],
  width: [[0, 'Narrow'], [1, 'Normal'], [2, 'Wide']],
  line: [[0, 'Deep'], [1, 'Normal'], [2, 'High line']],
  passing: [[0, 'Short passing'], [1, 'Mixed'], [2, 'Long ball']],
};
function teamManagement(ctx, team, back) {
  const live = !!M && !ctx;
  const T = live ? M.teams[team] : null;
  const tdef = live ? T.def : ctx.teams[team];
  let mg;
  if (live) mg = { formation: T.formationName || tdef.formation, tactics: M.tactics[team] };
  else {
    ctx.manage = ctx.manage || {};
    if (!ctx.manage[team] || !ctx.manage[team].xi) { const squad = (ctx.squads && ctx.squads[team]) || makeSquad(tdef, team + 1); const prev = ctx.manage[team] || {}; const f = prev.formation || tdef.formation; const xi = pickStarters(squad, FORMATIONS[f] || FORMATIONS['4-4-2']); ctx.manage[team] = { formation: f, xi, bench: squad.filter(p => !xi.includes(p)), tactics: prev.tactics || { mentality: 0, pressing: 1, width: 1, line: 1, passing: 1 } }; }
    mg = ctx.manage[team];
  }
  let sel = null; // selected entry {kind:'xi'|'bench', i}
  const slotsOf = () => FORMATIONS[mg.formation] || FORMATIONS['4-4-2'];
  const xi = () => live ? T.players.filter(p => !p.sentOff).map(p => ({ info: p.info, slot: p.slot, p })) : mg.xi.map((info, i) => ({ info, slot: slotsOf()[i] }));
  const bench = () => live ? T.bench : mg.bench;
  const fmtNames = Object.keys(FORMATIONS);
  const draw = () => {
    const dots = xi().map((e, i) => `<div class="pdot ${sel && sel.kind === 'xi' && sel.i === i ? 'sel' : ''}" style="left:${50 + e.slot.y * 42}%;top:${50 - e.slot.x * 44}%"><b>${e.info.number}</b><span>${esc(e.info.name.split(' ').pop())}</span></div>`).join('');
    const tac = Object.keys(TACTICS).map(k => `<div class="opt nav" data-cycle data-act="tac:${k}"><span>${{ mentality: 'Mentality', pressing: 'Pressing', width: 'Width', line: 'Defensive line', passing: 'Passing' }[k]}</span><span class="val">◀ ${(TACTICS[k].find(o => o[0] === mg.tactics[k]) || TACTICS[k][1])[1]} ▶</span></div>`).join('');
    return `<div class="panel wide"><div class="title">TEAM MANAGEMENT</div><div class="sub">${esc(tdef.name)}${live ? ` · ${T.subsLeft - T.subsQueued.length} substitutions left` : ''}</div>
      <div class="mgmt"><div class="mpitch">${dots}</div>
      <div class="card"><h3>LINE-UP ${sel ? '— now pick who to swap with' : '— select a player'}</h3>
        ${xi().map((e, i) => `<div class="fixture nav ${sel && sel.kind === 'xi' && sel.i === i ? 'me' : ''}" data-act="xi:${i}" style="grid-template-columns:34px 44px 1fr 46px;cursor:pointer"><span>${e.info.number}</span><span>${e.slot.pos}</span><span>${esc(e.info.name)}</span><span>${e.p ? '⚡' + Math.round(e.p.stamina * 100) : e.info.rating}</span></div>`).join('')}
        <h3 style="margin-top:10px">BENCH</h3>
        ${bench().map((b, i) => `<div class="fixture nav ${sel && sel.kind === 'bench' && sel.i === i ? 'me' : ''}" data-act="bench:${i}" style="grid-template-columns:34px 44px 1fr 46px;cursor:pointer;opacity:.85"><span>${b.number}</span><span>${b.pos}</span><span>${esc(b.name)}</span><span>${b.rating}</span></div>`).join('')}</div>
      <div><div class="opts"><div class="opt nav" data-cycle data-act="formation"><span>Formation</span><span class="val">◀ ${mg.formation} ▶</span></div>${tac}
        <div class="opt nav go" data-act="done"><span>Done ✔</span><span></span></div></div></div></div>
      <div class="hint">◀▶ change formation / tactics · select two players to swap${live ? ' (bench swaps are substitutions, made at the next stoppage)' : ''} · <span class="key">B</span> back</div></div>`;
  };
  const pick = (kind, i) => {
    if (!sel) { sel = { kind, i }; return; }
    const a = sel, b = { kind, i }; sel = null;
    if (a.kind === 'bench' && b.kind === 'bench') return;
    const [x, y] = a.kind === 'xi' ? [a, b] : [b, a];   // x is a starter
    if (live) {
      const px = xi()[x.i].p;
      if (y.kind === 'xi') M.swapSlots(px, xi()[y.i].p);
      else M.queueSub(team, px, bench()[y.i]);
    } else {
      if (y.kind === 'xi') { const t = mg.xi[x.i]; mg.xi[x.i] = mg.xi[y.i]; mg.xi[y.i] = t; }
      else { const t = mg.xi[x.i]; mg.xi[x.i] = mg.bench[y.i]; mg.bench[y.i] = t; }
    }
  };
  show({
    render: draw,
    action: (act, el, dir) => {
      if (act === 'done') return back();
      if (act === 'formation') { mg.formation = fmtNames[(fmtNames.indexOf(mg.formation) + (dir || 1) + fmtNames.length) % fmtNames.length]; if (live) M.setFormation(team, FORMATIONS[mg.formation], mg.formation); renderScreen(); return; }
      if (act.startsWith('tac:')) { const k = act.slice(4), opts = TACTICS[k]; const i = opts.findIndex(o => o[0] === mg.tactics[k]); mg.tactics[k] = opts[(i + (dir || 1) + opts.length) % opts.length][0]; if (live) M.setTactics(team, mg.tactics); renderScreen(); return; }
      if (act.startsWith('xi:')) { pick('xi', +act.slice(3)); renderScreen(); return; }
      if (act.startsWith('bench:')) { pick('bench', +act.slice(6)); renderScreen(); return; }
    },
    back,
  });
}

// ------------------------------------------------------------------ substitutions screen
function subsScreen(team, out = null) {
  const T = M.teams[team];
  const teams = [...new Set(M.humans.map(h => h.team))];
  show({
    render: () => {
      const fit = p => Math.round((p.stamina) * 100);
      return `<div class="panel wide"><div class="title">SUBSTITUTIONS</div><div class="sub">${esc(T.def.name)} · ${T.subsLeft - T.subsQueued.length} of 5 left${teams.length > 1 ? ' · <span class="key">LB</span>/<span class="key">RB</span> other team' : ''}</div>
        <div class="hub"><div class="card"><h3>${out ? 'TAKING OFF: ' + esc(out.info.name) : 'ON THE PITCH — choose a player to take off'}</h3>
        ${T.players.filter(p => !p.sentOff).map(p => `<div class="fixture nav ${out === p ? 'me' : ''}" data-act="out:${p.idx}" style="grid-template-columns:40px 50px 1fr 70px 60px;cursor:pointer"><span>${p.info.number}</span><span>${p.slot.pos}</span><span>${esc(p.info.name)}${p.yellow ? ' 🟨' : ''}${T.subsQueued.some(q => q.out === p) ? ' ⬇' : ''}</span><span>⚡${fit(p)}%</span><span>${p.ps.rating.toFixed(1)}</span></div>`).join('')}</div>
        <div class="card"><h3>BENCH</h3>${T.bench.map((b, i) => `<div class="fixture nav" data-act="in:${i}" style="grid-template-columns:40px 50px 1fr 50px;cursor:pointer"><span>${b.number}</span><span>${b.pos}</span><span>${esc(b.name)}</span><span>${b.rating}</span></div>`).join('') || 'No players left'}</div></div>
        <div class="opts" style="margin-top:10px"><div class="opt nav" data-act="done"><span>Done</span><span></span></div></div>
        <div class="hint">Pick a player on the pitch, then a substitute. The change happens at the next stoppage.</div></div>`;
    },
    tab: () => { if (teams.length > 1) subsScreen(teams.find(t => t !== team)); },
    action: act => {
      if (act === 'done') return pauseMenu();
      if (act.startsWith('out:')) { subsScreen(team, T.players[+act.slice(4)]); return; }
      if (act.startsWith('in:') && out) { M.queueSub(team, out, T.bench[+act.slice(3)]); subsScreen(team); }
    },
    back: () => pauseMenu(),
  });
}

// ------------------------------------------------------------------ pre-match ceremony
function startCeremony() {
  const short = settings.ceremony === 'short';
  const t0 = M.teams[0].def, t1 = M.teams[1].def;
  const nation = t0.kind === 'nation';
  extras.lineup(M);
  extras.tifo(true, M.kits, [t0, t1]);
  run.ceremony = { stage: 'walk', t: 0, short, cam: 0 };
  hudEl.classList.add('ceremony');
  caption(`${t0.name}  v  ${t1.name}`, `${run_venue ? run_venue.name + ' · ' : ''}The teams walk out`, 3200, 'small');
  setTimeout(() => ticker('Press ENTER to skip the ceremony'), 3400);
  if (run_venue) setTimeout(() => ticker(`🏟 ${run_venue.name} · capacity ${(run_venue.capacity || 40000).toLocaleString()}`), 1200);
  Sound.comment('intro', { pri: 1, fallback: `Welcome to tonight's match. ${t0.name} take on ${t1.name}.` });
  if (window.Music && Music.walkout) Music.walkout(); else Sound.chant(true);
  Sound.crowd(0.8, 0.4); Sound.applause();
}
function ceremonyNext() {
  const c = run.ceremony; c.t = 0;
  const t = i => M.teams[i].def;
  const anthemLabel = i => t(i).kind === 'nation' ? `National anthem · ${t(i).name}` : `Club anthem · ${t(i).name}`;
  const anthem = i => {
    caption(anthemLabel(i), 'Please stand', 3500, 'small');
    if (window.Music && Music.anthem) { Music.stop && Music.stop(0.8); Music.anthem(t(i), { crowd: true, onEnd: () => { if (run && run.ceremony && run.ceremony.stage === 'anthem' + i) ceremonyNext(); } }); }
    c.maxT = c.short ? 14 : 48;
  };
  if (c.stage === 'walk') { c.stage = 'anthem0'; Sound.comment('anthem', { pri: 1 }); setTimeout(() => { if (run && run.ceremony && run.ceremony.stage === 'anthem0') anthem(0); }, 2200); c.maxT = 99; }
  else if (c.stage === 'anthem0') { if (window.Music && Music.stopAnthem) Music.stopAnthem(); c.stage = 'anthem1'; anthem(1); }
  else if (c.stage === 'anthem1') {
    if (window.Music && Music.stopAnthem) Music.stopAnthem();
    c.stage = 'toss'; c.maxT = 3.2;
    const winner = M.setPiece ? M.setPiece.team : 0;
    caption('COIN TOSS', `${t(winner).name} will kick off`, 3000, 'small');
    Sound.applause();
  } else endCeremony();
}
function endCeremony() {
  if (!run || !run.ceremony) return;
  if (window.Music && Music.stopAnthem) Music.stopAnthem();
  if (window.Music && Music.stop) Music.stop(1);
  run.ceremony = null; hudEl.classList.remove('ceremony');
  { const tk = $('ticker'); if (tk) tk.classList.remove('show'); }
  extras.tifo(false, M.kits, [M.teams[0].def, M.teams[1].def]);
  M.kickoff(M.setPiece ? M.setPiece.team : 0);
  Sound.chant(true); Sound.crowd(0.55, 0.1); Sound.asset('jingle_kickoff', { gain: 0.8, bus: 'music', fade: 1.5 });
  caption('KICK OFF', `${M.teams[0].def.name} vs ${M.teams[1].def.name}`, 1800);
}
function ceremonyUpdate(dt, inputs, enterHit) {
  const c = run.ceremony; c.t += dt;
  if ((enterHit || inputs.some(i => i.passPressed || i.startPressed)) && c.t > 0.3) { endCeremony(); return; }
  if (c.stage === 'walk' && c.t > (c.short ? 3 : 5.5)) ceremonyNext();
  else if (c.stage.startsWith('anthem') && c.t > c.maxT) ceremonyNext();
  else if (c.stage === 'toss' && c.t > c.maxT) ceremonyNext();
  // camera choreography
  const cam = renderer.camera, R = renderer;
  let pos, look;
  let fov = 30;
  if (c.stage === 'walk' && R.boothPos && c.t < (c.short ? 1.6 : 2.9)) { const bp = R.boothPos; pos = new R.camPos.constructor(bp.x * 0.3 + Math.sin(c.t * 0.5) * 2, bp.y + 7, bp.z + 30); look = new R.camPos.constructor(bp.x, bp.y - 0.2, bp.z); fov = 21; }   // opening shot: the commentary booth
  else if (c.stage === 'walk') { const k = Math.min(1, c.t / 5.5); pos = new R.camPos.constructor(lerp(-30, 0, k), lerp(26, 6, k), lerp(40, 14, k)); look = new R.camPos.constructor(0, 1.2, -1); }
  else if (c.stage.startsWith('anthem')) {
    const side = c.stage === 'anthem0' ? -1 : 1, k = (c.t / c.maxT);
    const x = side * lerp(1.6, 11.6, k);
    pos = new R.camPos.constructor(x + side * 0.4, 1.75, 2.6); look = new R.camPos.constructor(x, 1.55, -1);
    if (c.t > c.maxT * 0.7) { pos = new R.camPos.constructor(side * 6 + Math.sin(c.t * 0.2) * 20, 14, 30); look = new R.camPos.constructor(side * 30, 6, -10); }
  } else { pos = new R.camPos.constructor(0, 3, 6); look = new R.camPos.constructor(0, 1.2, -1); }
  const booth = fov < 25; R.camPos.lerp(pos, booth ? 1 : Math.min(1, dt * 2)); R.camLook.lerp(look, booth ? 1 : Math.min(1, dt * 2.5));
  cam.position.copy(R.camPos); cam.lookAt(R.camLook);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * (booth ? 1 : Math.min(1, dt * 3)); cam.updateProjectionMatrix(); }
  // nametags while the camera passes
  if (c.stage.startsWith('anthem')) {
    const team = c.stage === 'anthem0' ? 0 : 1; const ps = M.active(team);
    const i = clamp(Math.floor((c.t / c.maxT) / 0.7 * ps.length), 0, ps.length - 1);
    if (c.t < c.maxT * 0.7 && c.lastTag !== team * 100 + i) { c.lastTag = team * 100 + i; const p = ps[i]; ticker(`${p.info.number} · ${p.info.name} · ${p.slot.pos}`); }
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ pause / post match
function pauseMenu() {
  run.paused = true;
  const st = M.stats;
  show({
    render: () => `<div class="panel"><div class="title">PAUSED</div><div class="sub">${esc(tname(0))} ${M.score[0]} - ${M.score[1]} ${esc(tname(1))} · ${M.minute()}'</div>
      ${statsTable(st)}
      <div class="opts"><div class="opt nav" data-act="resume"><span>Resume</span><span></span></div>
      <div class="opt nav" data-cycle data-act="camera"><span>Camera</span><span class="val">◀ ${label('camera')} ▶</span></div>
      <div class="opt nav" data-act="replay"><span>🎥 Instant replay</span><span></span></div>
      ${M.humans.length ? '<div class="opt nav" data-act="manage"><span>📋 Team management</span><span class="val">Formation · Tactics · Line-up</span></div><div class="opt nav" data-act="subs"><span>🔁 Substitutions</span><span></span></div>' : ''}
      <div class="opt nav" data-act="settings"><span>⚙ Settings</span><span></span></div>
      <div class="opt nav" data-act="controls"><span>Controls</span><span></span></div>
      ${run.ctx.from === 'quick' ? '<div class="opt nav" data-act="restart"><span>Restart match</span><span></span></div>' : ''}
      <div class="opt nav" data-act="quit"><span>${run.ctx.from === 'comp' ? 'Quit to competition hub' : run.ctx.from === 'career' ? 'Quit to Master League (match not counted)' : 'Quit to main menu'}</span><span></span></div>
      <div class="opt nav" data-act="exitgame"><span>⏻ Exit game</span><span></span></div></div></div>`,
    action: (act, el, dir) => {
      if (act === 'resume') { show(null); run.paused = false; }
      if (act === 'camera') { cycleSetting('camera', dir || 1); renderScreen(); }
      if (act === 'controls') controlsScreen(pauseMenu);
      if (act === 'subs') subsScreen(M.humans[0].team);
      if (act === 'manage') teamManagement(null, M.humans[0].team, pauseMenu);
      if (act === 'settings') settingsScreen(pauseMenu);
      if (act === 'exitgame') window.close();
      if (act === 'replay') { if (M.replay.length > 10) { show(null); run.viewer = { frames: M.replay.slice(), t: M.replay.length - 30 * 4, playing: true, speed: 1, angle: 0, orbit: 0 }; $('replaybadge').classList.remove('hidden'); $('replaybadge').innerHTML = '● INSTANT REPLAY <small>◀▶ scrub · A play/pause · Y slow-mo · X camera · B exit</small>'; } }
      if (act === 'restart') { startMatch(run.ctx); }
      if (act === 'quit') { const ctx = run.ctx; endRun(); if (ctx.from === 'comp') Comp.hubScreen(); else if (ctx.from === 'career' && ctx.onQuit) ctx.onQuit(); else mainMenu(); }
    },
    back: () => { show(null); run.paused = false; },
  });
}
function statsTable(st) {
  const total = st[0].possession + st[1].possession || 1;
  const row = (n, a, b) => `<tr><td>${a}</td><th>${n}</th><td>${b}</td></tr>`;
  return `<table class="stats">${row('Possession', Math.round(st[0].possession / total * 100) + '%', Math.round(st[1].possession / total * 100) + '%')}
    ${row('Shots', st[0].shots, st[1].shots)}${row('On target', st[0].onTarget, st[1].onTarget)}
    ${row('Passes completed', st[0].passesOk + '/' + st[0].passes, st[1].passesOk + '/' + st[1].passes)}
    ${row('Corners', st[0].corners, st[1].corners)}${row('Fouls', st[0].fouls, st[1].fouls)}${row('Offsides', st[0].offsides, st[1].offsides)}
    ${row('Cards', '🟨' + st[0].yellow + ' 🟥' + st[0].red, '🟨' + st[1].yellow + ' 🟥' + st[1].red)}</table>`;
}
function postMatch() {
  const ctx = run.ctx, so = run.shootout;
  const result = { hg: M.score[0], ag: M.score[1], pens: so && so.result ? { h: so.result.h, a: so.result.a } : null, scorers: M.scorers.map(s => ({ team: s.team, name: s.player ? s.player.name : '?', id: s.player ? s.player.id : null, minute: s.minute, own: s.own })), et: M.half > 2 };
  const winner = result.pens ? (result.pens.h > result.pens.a ? 0 : 1) : result.hg > result.ag ? 0 : result.hg < result.ag ? 1 : null;
  if (winner !== null && M.humans.some(h => h.team === winner) ) Sound.victory();
  if (winner !== null && M.humans.some(h => h.team === winner)) { renderer.confetti([M.kits[winner].shirt, '#ffffff', '#ffd700']); extras.fireworks([M.kits[winner].shirt, '#ffffff', '#ffd700'], 12); }
  const sc = t => result.scorers.filter(s => s.team === t).map(s => `${esc(s.name)} ${s.minute}'${s.own ? ' (og)' : ''}`).join('<br>') || '&nbsp;';
  const ratings = playerRatings(M), motm = ratings[0];
  result.motm = motm;
  hudEl.classList.add('hidden');
  show({
    render: () => `<div class="panel wide"><div class="sub">FULL TIME${result.et ? ' · AFTER EXTRA TIME' : ''}</div>
      <div class="final"><span>${esc(tname(0))}</span><b>${result.hg} - ${result.ag}</b><span>${esc(tname(1))}</span></div>
      ${result.pens ? `<div class="sub">${result.pens.h} - ${result.pens.a} on penalties</div>` : ''}
      <div class="scorers"><div>${sc(0)}</div><div>⚽</div><div>${sc(1)}</div></div>
      <div class="motm">⭐ Man of the Match: <b>${esc(motm.name)}</b> (${esc(tname(motm.team))}) · ${motm.rating.toFixed(1)}${motm.goals ? ` · ${motm.goals} goal${motm.goals > 1 ? 's' : ''}` : ''}</div>
      <div class="hub" style="grid-template-columns:1fr 1fr"><div>${statsTable(M.stats)}</div><div class="card" style="max-height:34vh;overflow:auto"><h3>PLAYER RATINGS</h3>${ratings.slice(0, 14).map(r => `<div class="fixture" style="grid-template-columns:36px 1fr 60px 40px"><span>${r.number}</span><span>${esc(r.name)} <small style="opacity:.6">${esc(M.teams[r.team].def.short)}</small></span><span>${r.goals ? '⚽'.repeat(r.goals) : ''}</span><b style="color:${r.rating >= 8 ? '#6ee7a8' : r.rating < 6 ? '#f87171' : '#fff'}">${r.rating.toFixed(1)}</b></div>`).join('')}</div></div>
      <div class="opts"><div class="opt nav go" data-act="continue"><span>Continue ▶</span><span></span></div>
      ${ctx.from === 'quick' ? '<div class="opt nav" data-act="rematch"><span>Rematch</span><span></span></div>' : ''}</div></div>`,
    action: act => {
      if (act === 'rematch') { startMatch(ctx); return; }
      endRun();
      if (ctx.onEnd) ctx.onEnd(result); else mainMenu();
    },
  });
}
function endRun() { Input.setMerge(false); M = null; run = null; renderer.clearCharacters(); extras.clear(); renderer.colorCrowd('#cc2233', '#2255cc'); hudEl.classList.add('hidden'); Sound.chant(false); Sound.crowd(0.15, 0); Sound.weather('clear'); renderer.setAtmosphere(settings.time, 'clear'); Sound.music(true); }

// ------------------------------------------------------------------ loop
let last = performance.now(), acc = 0;
const FIXED = 1 / 120;
const idleMatch = { ball: { x: 0, y: 0.17, z: 0, vx: 0, vy: 0, vz: 0 }, all: [], humans: [], phase: 'menu', setPiece: null, scorers: [], dir: () => 1 };
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  // gather menu inputs from every device
  const menuInputs = Input.candidates().map(dev => ({ dev, inp: Input.read(dev) }));
  Input.endFrame();   // taps made during this frame have been read
  const enterHit = Input.takeEnter();
  if (!M || !run || !aimActive()) { if (renderer.aimDots && renderer.aimDots.visible) hideAim(); }   // Enter = skip whatever cut-scene / replay / wait is on screen
  if (!M || !run) {
    menuInput(menuInputs);
    idleMatch.ball.x = Math.sin(now / 9000) * 30;
    if (bootMode === 'title' || bootMode === 'notice') {
      renderer.sync(idleMatch, dt, { camera: 'manual' });
      const a = now / 1000 * 0.06; renderer.camera.position.set(Math.cos(a) * 95, 30 + Math.sin(now / 7000) * 8, Math.sin(a) * 75); renderer.camera.lookAt(0, 4, 0);
    } else renderer.sync(idleMatch, dt, { camera: 'wide' });
    renderer.render();
    return;
  }
  if (screen) {
    menuInput(menuInputs);
    if (run && run.paused) { renderer.render(); return; }
  }
  if (!M || !run) { renderer.render(); return; }
  const humanInputs = M.humans.map(h => menuInputs.find(m => Input.devId(m.dev) === Input.devId(h.device))?.inp || {});
  // instant replay viewer (from pause menu)
  if (run.viewer) {
    const v = run.viewer, inp = Object.assign({}, ...menuInputs.map(m => m.inp).filter(i => i.navX || i.passPressed || i.lobPressed || i.throughPressed || i.shootPressed || i.mx) , {});
    for (const { inp: i } of menuInputs) {
      if (i.passPressed) v.playing = !v.playing;
      if (i.throughPressed) v.speed = v.speed === 1 ? 0.25 : 1;
      if (i.lobPressed) v.angle = (v.angle + 1) % 6;
      if (i.shootPressed || i.startPressed || enterHit) { run.viewer = null; $('replaybadge').classList.add('hidden'); pauseMenu(); return; }
      if (Math.abs(i.mx) > 0.3) { v.t = clamp(v.t + i.mx * dt * 60, 0, v.frames.length - 1); v.playing = false; }
      if (v.angle === 5 && Math.abs(i.my) > 0.3) v.orbit += i.my * dt * 2;
    }
    if (v.playing) { v.t += dt * 30 * v.speed; if (v.t >= v.frames.length - 1) v.t = 0; }
    const i = clamp(Math.floor(v.t), 0, v.frames.length - 1);
    renderer.applySnapshot(M, v.frames[i], null, v.playing ? dt * v.speed : 0);
    if (v.angle === 5) { v.orbit += dt * 0.3; renderer.orbitCamera(v.frames[i], v.orbit, dt); } else renderer.replayCamera(v.frames[i], v.t, dt, v.angle);
    renderer.render();
    return;
  }
  // replay mode
  if (run.replay) {
    const r = run.replay;
    if (humanInputs.some(x => x.lobPressed)) r.angle = (r.angle + 1) % 5;
    r.t += dt * r.speed * 30;
    const i = Math.min(r.frames.length - 1, Math.floor(r.t));
    renderer.applySnapshot(M, r.frames[i], r.frames[i - 1], dt * r.speed);
    renderer.replayCamera(r.frames[i], r.t, dt, r.angle);
    renderer.render();
    if (i >= r.frames.length - 1 || enterHit || humanInputs.some(x => x.passPressed || x.startPressed) || menuInputs.some(m => m.inp.confirmPressed && M.humans.length === 0)) {
      run.replay = null; $('replaybadge').classList.add('hidden');
      M.afterGoal();
    }
    return;
  }
  // pre-match ceremony
  if (run.ceremony) {
    ceremonyUpdate(dt, M.humans.length ? humanInputs : menuInputs.map(m => m.inp), enterHit);
    renderer.sync(M, dt, { camera: 'manual', humanColors: HUMAN_COLORS }); extras.sync(M, dt);
    renderer.render(); return;
  }
  if (M.phase === 'injury' && (enterHit || humanInputs.some(x => x.passPressed)) && M.injury && M.injury.t > 2) M.skipInjury();
  if (M.phase === 'var' && enterHit) M.phaseT = 99;
  if (M.phase === 'goal' && enterHit && !run.replay) { run.goalT = 99; run.replayQueued = false; }
  if (run.fulltime && enterHit) run.ftT = 99;
  // pause
  if (!run.fulltime && humanInputs.some(x => x.startPressed)) { pauseMenu(); return; }
  if (humanInputs.some(x => x.cameraPressed)) { cycleSetting('camera', 1); ticker('Camera: ' + label('camera')); }
  if (M.humans.some(h => h.device.type === 'pad' && !humanInputs[h.id].connected) && !run.paused) { pauseMenu(); caption('CONTROLLER DISCONNECTED', 'Reconnect it, then resume', 3000, 'small'); return; }

  // halftime / fulltime handling
  if (run.halftime) {
    run.htT = (run.htT || 0) + dt;
    if (run.htT > 3.5 && (run.htT > 9 || enterHit || humanInputs.some(x => x.passPressed) || M.humans.length === 0)) { run.halftime = false; run.htT = 0; $('banner').classList.remove('show'); M.startNextPeriod(); }
  }
  if (run.fulltime && !(run.shootout && run.shootout.state !== 'done')) {
    run.ftT = (run.ftT || 0) + dt;
    if (run.ftT > 3.5) { run.fulltime = false; postMatch(); }
  }
  if (run.shootout && run.shootout.state !== 'done') run.shootout.update(dt);
  // goal celebration → replay → restart
  if (M.phase === 'goal') {
    run.goalT += dt;
    if (run.goalT > 3.6) { if (run.replayQueued && startReplay()) { run.replayQueued = false; } else M.afterGoal(); }
  }
  updateAim(dt);
  updateShotPreview(humanInputs);
  updatePassMarker(humanInputs);
  acc += dt; let first = true;
  while (acc >= FIXED) {
    const inp = first ? humanInputs : humanInputs.map(i => { const o = Object.assign({}, i); for (const k in o) if (k.endsWith('Pressed')) o[k] = false; return o; });
    M.step(FIXED, inp); acc -= FIXED; first = false;
    if (!M) break;
  }
  if (!M) return;
  // the pair in the booth keep chatting during quiet spells of play
  run.chatT = (run.chatT ?? 8) - dt;
  if (run.chatT <= 0 && M.phase === 'play' && run.tension < 0.25 && !(Sound.speaker && Sound.speaker())) { run.chatTurn = !run.chatTurn; Sound.comment(run.chatTurn ? 'chatter' : 'colour', { pri: 0 }); run.chatT = 9 + Math.random() * 8; }
  else if (run.chatT <= 0) run.chatT = 2;
  if (M.half === 2 && M.minute() >= 85 && !run.lateSaid && M.phase === 'play') { run.lateSaid = true; Sound.comment('late', { pri: 0 }); }
  if (M.cfg.weather === 'storm' && Math.random() < dt / 9) { renderer.lightning(); Sound.thunder(); }
  // crowd dynamics
  const b = M.ball; const nearGoal = Math.max(0, 1 - (PITCH.HL - Math.abs(b.x)) / 25);
  run.tension = Math.max(0, run.tension - dt * 0.6);
  run.excite = run.excite.map(e => Math.max(0, e - dt * 0.12));
  Sound.crowd(0.5 + nearGoal * 0.25 + run.tension * 0.2, nearGoal * 0.7 + run.tension);
  renderer.setCrowdExcitement(run.excite[0] + nearGoal * 0.15, run.excite[1] + nearGoal * 0.15);
  renderer.sync(M, dt, { camera: settings.camera, cuts: settings.cuts, humanColors: HUMAN_COLORS });
  extras.sync(M, dt);
  if (M.phase === 'play' && run.tension < 0.1 && Math.random() < dt / 70 && extras.waveT < 0) { extras.mexicanWave(); ticker('🌊 The crowd starts a Mexican wave!'); Sound.comment('wave', { pri: 0 }); }
  updateHud();
  renderer.render();
}

// ------------------------------------------------------------------ mouse / touchpad aiming
// Move the pointer to aim: a dotted line shows the exact flight of the ball and what the action will do.
//   LEFT click = pass to the aimed point (or the teammate nearest it) · HOLD left, release = shoot (hold longer = more power)
//   RIGHT click = lob / cross / long free-kick to the aimed point
const mouse = { x: 0, y: 0, moved: 0, left: false, right: false, leftT: 0, rightT: 0 };
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmpP = new THREE.Vector3();
function mouseHuman() { return M && settings.mouseAim ? M.humans.find(h => h.device.type === 'kb1' || h.device.type === 'kb2') : null; }
function aimActive() { return !!(mouseHuman() && run && !screen && !run.ceremony && !run.replay && !run.viewer && !run.fulltime && !run.halftime && M.phase !== 'injury' && M.phase !== 'var'); }
function groundPoint() {
  const cam = renderer.camera; cam.updateMatrixWorld();
  ray.setFromCamera(new THREE.Vector2(mouse.x / window.innerWidth * 2 - 1, -(mouse.y / window.innerHeight) * 2 + 1), cam);
  return ray.ray.intersectPlane(ground, tmpP) ? { x: tmpP.x, z: tmpP.z } : null;
}
function aimKind() { return mouse.right ? 'lob' : mouse.left && mouse.leftT > 0.18 ? 'shoot' : 'pass'; }
const aimPower = () => clamp((mouse.leftT - 0.18) / 0.9, 0, 1);
function hideAim() { renderer.setAim(null); const t = $('aimtip'); if (t) t.classList.remove('show'); document.body.style.cursor = ''; }
// pass-target ring: shows who the next pass will go to, following your movement direction
function updatePassMarker(inputs) {
  let target = null;
  if (M && run && !screen && !run.ceremony && !run.replay && !run.viewer && M.phase === 'play') {
    M.humans.forEach((h, i) => { const p = h.player; if (!target && p && M.ball.owner === p) { const t = M.smartPass(p, { x: inputs[i] ? inputs[i].mx || 0 : 0, z: inputs[i] ? inputs[i].my || 0 : 0 }); if (t) target = t.p; } });
  }
  if (!target && aimActive() && M.phase === 'play' && !M.mouseReady(mouseHuman()) && performance.now() - mouse.moved < 4000) { const g = groundPoint(), o = g && M.pickOpponent(mouseHuman(), g.x, g.z); if (o) { target = o; document.body.style.cursor = 'pointer'; } }
  renderer.setPassMarker(target ? [target.x, target.z] : null);
}
function updateAim(dt) {
  const h = mouseHuman();
  if (!aimActive() || !M.mouseReady(h)) { renderer.setAim(null); const t = $('aimtip'); if (t) t.classList.remove('show'); mouse.left = mouse.right = false; document.body.style.cursor = aimActive() ? 'crosshair' : ''; return; }
  document.body.style.cursor = 'crosshair';
  if (mouse.left) mouse.leftT += dt;
  const recent = performance.now() - mouse.moved < 5000 || mouse.left || mouse.right;
  const g = groundPoint(); const tip = $('aimtip');
  if (!g || !recent) { renderer.setAim(null); if (tip) tip.classList.remove('show'); return; }
  const kind = aimKind(), pr = M.predict(h.player, kind, g.x, g.z, aimPower());
  const color = kind === 'shoot' ? (pr.power > 0.95 ? 0xff4d4d : 0xffa31a) : kind === 'lob' ? 0xffe066 : 0x6ee7a8;
  renderer.setAim(pr.pts, color, pr.end, kind === 'shoot' ? 1.4 : 1);
  if (tip) {
    tip.style.left = (mouse.x + 18) + 'px'; tip.style.top = (mouse.y + 18) + 'px'; tip.classList.add('show');
    const pw = kind === 'shoot' ? `<div class="pwbar"><i style="width:${Math.round(aimPower() * 100)}%"></i></div>` : '';
    tip.innerHTML = `<b>${esc(pr.label)}</b> · ${pr.dist.toFixed(0)} m${pw}<small>${mouse.left ? 'hold to add power — release to shoot' : 'click = pass · hold = shoot · right-click = lob'}</small>`;
    tip.style.borderColor = '#' + color.toString(16).padStart(6, '0');
  }
}
function mouseRelease(kind) {
  const h = mouseHuman(); if (!h || !aimActive() || !M.mouseReady(h)) return;
  const g = groundPoint(); if (!g) return;
  M.mouseAct(h, kind, g.x, g.z, aimPower());
}
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = performance.now(); });
window.addEventListener('mousedown', e => {
  if (e.button === 0 && aimActive() && !M.mouseReady(mouseHuman())) { const g = groundPoint(), h = mouseHuman(); if (g && h) M.mouseTackle(h, g.x, g.z); return; }
  if (!aimActive() || !M.mouseReady(mouseHuman())) return;
  if (e.button === 0) { mouse.left = true; mouse.leftT = 0; }
  if (e.button === 2) { mouse.right = true; }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0 && mouse.left) { const kind = mouse.leftT > 0.18 ? 'shoot' : 'pass'; if (!mouse.right) mouseRelease(kind); mouse.left = false; mouse.leftT = 0; }
  if (e.button === 2 && mouse.right) { mouseRelease('lob'); mouse.right = false; mouse.left = false; mouse.leftT = 0; }
});
window.addEventListener('contextmenu', e => { if (aimActive()) e.preventDefault(); });

// ------------------------------------------------------------------ boot sequence (studio logo → notice → title / PRESS START)
let bootMode = null;
function bootSequence() {
  return new Promise(resolve => {
    const boot = $('boot'); boot.classList.remove('hidden');
    Sound.init();
    if ((navigator.webdriver && !location.search.includes('boot')) || sessionStorage.getItem('pc_booted')) { boot.classList.add('hidden'); resolve(); return; }
    const stages = ['studio', 'notice', 'title'];
    let i = 0, t0 = performance.now(), done = false;
    const showStage = k => { stages.forEach(s => $(s).classList.toggle('hidden', s !== stages[k])); t0 = performance.now(); bootMode = stages[k];
      if (stages[k] === 'studio') { if (window.Music && Music.sting) Music.sting('boot'); else { Sound.whistle(0.01); Sound.roar && setTimeout(() => Sound.applause(), 400); } }
      if (stages[k] === 'title') { renderer.setAtmosphere('night', 'clear'); Sound.crowd(0.35, 0.1); Sound.music(true); }
    };
    showStage(0);
    let hit = false;   // any key (not just Enter) or any controller button; read straight from the browser, not through Input (the main loop already consumes those edges)
    const onKey = e => { if (!e.repeat && !/^(Shift|Control|Alt|Meta|CapsLock|NumLock|ScrollLock|Tab|F\d+)/.test(e.code)) hit = true; };
    window.addEventListener('keydown', onKey);
    const padHit = () => Array.from(navigator.getGamepads ? navigator.getGamepads() : []).some(g => g && g.connected && g.buttons.some((b, i) => i !== 8 && b.pressed));
    const finish = () => { window.removeEventListener('keydown', onKey); if (done) return; done = true; if (window.Music && Music.sting) Music.sting('press'); else Sound.confirm(); boot.style.transition = 'opacity .5s'; boot.style.opacity = '0'; setTimeout(() => { boot.classList.add('hidden'); boot.style.opacity = ''; bootMode = null; renderer.setAtmosphere(settings.time, 'clear'); }, 500); sessionStorage.setItem('pc_booted', '1'); resolve(); };
    const tick = () => {
      if (done) return;
      const el = performance.now() - t0;
      const pressed = hit || padHit(); hit = false;
      if (stages[i] === 'studio' && (el > 3300 || (pressed && el > 400))) showStage(++i);
      else if (stages[i] === 'notice' && (el > 3400 || (pressed && el > 400))) showStage(++i);
      else if (stages[i] === 'title' && pressed && el > 500) return finish();
      requestAnimationFrame(tick);
    };
    window.addEventListener('mousedown', function h() { if (bootMode === 'title') { window.removeEventListener('mousedown', h); finish(); } });
    requestAnimationFrame(tick);
  });
}

// ------------------------------------------------------------------ boot
async function boot() {
  const bar = document.querySelector('#loadbar div');
  await renderer.loadCharacters(f => bar.style.width = (f * 100) + '%');
  extras = new Extras(renderer);
  renderer.onStadiumChange = () => extras.rebuildFlags();
  requestAnimationFrame(t => { last = t; loop(t); });
  $('loading').classList.add('hidden');
  await bootSequence();
  Career.init({ show, setFocus, renderScreen, mainMenu, kitSwatch, stars, sideSelect, matchSettings, teamManagement, venueFor, sportsbook: () => Bet.sportsbook() });
  Bet.init({ show, setFocus, renderScreen, mainMenu, kitSwatch }, { hasCareer: () => Career.hasCareer(), fund: id => Career.fundScreen(id) });
  Comp.init({ show, renderScreen, setFocus, mainMenu, sideSelect, matchSettings, startMatch, teamById, stars, CATEGORIES, esc, kitSwatch, settings });
  mainMenu();
  if (window.Music) Music.onTrackChange = d => { const el = $('nowplaying'); if (!el || !d) return; el.innerHTML = `♪ <b>${esc(d.title)}</b> — ${esc(d.artist)}`; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 4500); };
  window.__pc = { get M() { return M; }, get run() { return run; }, get extras() { return extras; }, renderer, settings, startMatch, teamById, NATIONS, CLUBS, matchSettings, teamManagement, Career, Bet };
}
boot().catch(err => { $('loadtext').textContent = 'Failed to start: ' + err.message; console.error(err); });
