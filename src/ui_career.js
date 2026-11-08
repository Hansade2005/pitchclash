// Master League screens: new career, club hub (overview / squad / transfers / finance / table / news), match flow, season end.
import * as C from './career.js';
import * as T from './tournament.js';
import { getTeam } from './data/teams.js';
import { Bank, COINS_PER_MILLION } from './economy.js';
import { fmt } from './betting.js';
import { venueFor } from './data/stadiums.js';

let api = null, career = null, tab = 0, filter = 'ALL', msg = '', msgOk = true, sortBy = 'pos';
export function init(a) { api = a; }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const M = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + 'M';
const save = () => C.careerStore.save(career);
const say = (m, ok = true) => { msg = m; msgOk = ok; };
export const hasCareer = () => !!C.careerStore.load();
const club = () => getTeam(career.clubId);
const nm = id => (getTeam(id) || { name: id }).name;
const TABS = ['Overview', 'Squad', 'Transfers', 'Finance', 'Table', 'News'];

// ------------------------------------------------------------------ entry
export function masterLeague() {
  const saved = C.careerStore.load();
  if (!saved) return newCareer();
  const sc = getTeam(saved.clubId);
  api.show({
    render: () => `<div class="panel"><div class="logo" style="font-size:54px">MASTER<span>LEAGUE</span></div><div class="sub">Build a dynasty. Your betting winnings can fund the club.</div>
      <div class="opts"><div class="opt nav go" data-act="cont"><span>▶ Continue: ${esc(sc.name)}</span><span>Season ${saved.year} · ${esc(saved.season)}</span></div>
      <div class="opt nav" data-act="new"><span>＋ New career</span><span></span></div><div class="opt nav" data-act="back"><span>← Back</span><span></span></div></div></div>`,
    action: act => { if (act === 'cont') { career = saved; tab = 0; say(''); return afterLoad(); } if (act === 'new') return newCareer(); api.mainMenu(); },
    back: () => api.mainMenu(),
  });
}
function afterLoad() { if (career.phase === 'over') return gameOver(); hub(); }

// ------------------------------------------------------------------ new career: league → club
function newCareer() {
  const leagues = C.careerLeagues(); let li = 0;
  api.show({
    focus: leagues.length,
    render: () => {
      const l = leagues[li], clubs = [...l.clubs].sort((a, b) => b.rating - a.rating);
      return `<div class="panel wide"><div class="title" style="font-size:38px">CHOOSE YOUR CLUB</div><div class="sub">Pick a league, then the club you will manage. Small clubs are a bigger challenge (and a better story).</div>
        <div class="tabs">${leagues.map((x, i) => `<div class="tab nav ${i === li ? 'on' : ''}" data-act="lg:${i}">${esc(x.name)}</div>`).join('')}</div>
        <div class="teamgrid">${clubs.map((t, i) => `<div class="btn nav" data-act="cl:${t.id}"><span class="tn">${api.kitSwatch(t, false)} ${esc(t.name)}</span><small>${api.stars(t.rating)} ${t.rating} · ${i < 3 ? 'Title contender' : i < clubs.length * 0.4 ? 'Upper table' : i < clubs.length * 0.75 ? 'Mid-table' : 'Relegation fight'} · ~${Math.round(5 + (t.rating - 60))}M budget</small></div>`).join('')}</div>
        <div class="actions"><div class="btn nav" data-act="back">← Back</div></div><div class="hint">Click a league tab (or <span class="key">Q</span>/<span class="key">E</span>) · arrows + <span class="key">Enter</span> pick a club · <span class="key">Esc</span> back</div></div>`;
    },
    tab: d => { li = (li + d + leagues.length) % leagues.length; api.setFocus(li); },
    action: act => {
      if (act === 'back') return api.mainMenu();
      if (act.startsWith('lg:')) { li = +act.slice(3); return api.setFocus(li); }
      if (act.startsWith('cl:')) { career = C.newCareer(act.slice(3), 'Manager'); tab = 0; say(''); save(); Sound.confirm(); hub(); }
    },
    back: () => api.mainMenu(),
  });
}

// ------------------------------------------------------------------ hub
function pos() { const r = C.tableRows(career), i = r.findIndex(x => x.team === career.clubId); return { p: i + 1, n: r.length, row: r[i] }; }
const confBar = v => `<div class="cbar"><i style="width:${v}%;background:${v > 60 ? '#6ee7a8' : v > 30 ? '#fbbf24' : '#f87171'}"></i></div>`;
export function hub() {
  if (!career) return masterLeague();
  save(); if (career.phase === 'over') return gameOver();
  api.show({
    focus: TABS.length,
    render: () => {
      const c = career, k = club(), po = pos(), ev = C.currentEvent(c);
      const head = `<div class="mlhead"><div><b>${esc(k.name)}</b> ${api.kitSwatch(k, false)} <small>${esc(c.season)} · Year ${c.year} · ${esc(c.manager)}</small></div><div class="mlstats"><span>💰 <b>${M(c.budget)}</b></span><span>👔 Board ${confBar(c.confidence)}</span><span>${esc(C.windowText(c))}</span></div></div>`;
      let body = '';
      if (tab === 0) body = overview(c, ev, po);
      else if (tab === 1) body = squadTab(c);
      else if (tab === 2) body = transfersTab(c);
      else if (tab === 3) body = financeTab(c);
      else if (tab === 4) body = tableTab(c);
      else body = `<div class="card scroll">${c.news.map(n => `<div class="fe"><b>Y${n.y}</b> ${esc(n.t)}</div>`).join('') || '<div class="empty">No news yet.</div>'}</div>`;
      return `<div class="panel wide ml">${head}<div class="tabs">${TABS.map((t, i) => `<div class="tab nav ${i === tab ? 'on' : ''}" data-act="tab:${i}">${t}</div>`).join('')}</div>${body}
        ${msg ? `<div class="msg ${msgOk ? 'ok' : 'bad'}" style="margin-top:8px">${esc(msg)}</div>` : ''}
        <div class="actions"><div class="btn nav" data-act="menu">← Save & exit</div><div class="btn nav" data-act="bet">🎰 Sportsbook</div></div>
        <div class="hint"><span class="key">Q</span>/<span class="key">E</span>/<span class="key">Tab</span> switch tabs · <span class="key">Esc</span> save & exit</div></div>`;
    },
    tab: d => { tab = (tab + d + TABS.length) % TABS.length; say(''); api.setFocus(tab); },
    action: act => hubAction(act),
    back: () => { save(); api.mainMenu(); },
  });
}
function overview(c, ev, po) {
  if (c.phase === 'seasonEnd') return seasonEndCard(c);
  const fx = ev && ev.fixture, home = fx && fx.home === c.clubId, opp = fx ? getTeam(home ? fx.away : fx.home) : null;
  const sick = c.squad.filter(p => p.injured);
  return `<div class="hub"><div class="card"><h3>NEXT · ${esc(ev ? ev.name : '—')}</h3>
    ${fx ? `<div class="final" style="font-size:24px;margin:6px 0"><span>${esc(nm(fx.home))}</span><b style="font-size:30px;padding:0 14px">VS</b><span>${esc(nm(fx.away))}</span></div><div class="sub" style="margin:0 0 8px">${home ? 'Home' : 'Away'} · opponent ${opp.rating} ${api.stars(opp.rating)} · your team ${C.effRating(c)} ${api.stars(C.effRating(c))}</div>
      <div class="actions" style="margin:6px 0"><div class="btn nav go" data-act="play">⚽ Play match</div><div class="btn nav" data-act="sim">⏩ Simulate</div></div>`
      : `<div class="sub" style="margin:10px 0">${ev && ev.skip ? 'You are out of the cup — nothing to play.' : 'No match for you this round.'}</div><div class="actions"><div class="btn nav go" data-act="sim">⏩ Continue</div></div>`}
    <div class="actions" style="margin:6px 0"><div class="btn nav" data-act="sim5">⏭ Sim 5</div><div class="btn nav" data-act="simend">⏭⏭ Sim to season end</div><div class="btn nav" data-act="manage">📋 Tactics & line-up</div></div>
    <h3 style="margin-top:12px">RECENT RESULTS</h3>${c.lastResults.slice(0, 5).map(r => `<div class="fixture ${r.won ? 'me' : ''}" style="${r.lost ? 'opacity:.75' : ''}"><span class="h">${esc(nm(r.home))}</span><span class="s">${r.hg} - ${r.ag}${r.pens ? `<small> (${r.pens.h}-${r.pens.a}p)</small>` : ''}</span><span>${esc(nm(r.away))}</span></div>`).join('') || '<div class="empty">No matches played yet.</div>'}</div>
    <div class="card"><h3>BOARD</h3><div class="sub" style="margin:2px 0 8px;font-size:15px;letter-spacing:0">Objective: finish in the <b>top ${c.objective.pos}</b> · now <b>${po.p}${['th', 'st', 'nd', 'rd'][po.p % 10 > 3 || (po.p % 100 > 10 && po.p % 100 < 14) ? 0 : po.p % 10]}</b> of ${po.n} (${po.row ? po.row.pts : 0} pts)</div>
      <div class="ob"><span>Confidence</span><b>${Math.round(c.confidence)}%</b></div>${confBar(c.confidence)}
      <div class="ob"><span>Season progress</span><b>${c.calIdx} / ${c.calendar.length}</b></div>
      <div class="ob"><span>Wage bill / income</span><b>${M(C.wageBill(c))} / ${M(C.projectedIncome(c))}</b></div>
      <div class="ob"><span>Squad</span><b>${c.squad.length} players · avg top-11 ${Math.round(C.top(c, 11).reduce((t, p) => t + p.rating, 0) / 11)}</b></div>
      ${sick.length ? `<h3 style="margin-top:10px">INJURED</h3>${sick.map(p => `<div class="ob"><span>🩹 ${esc(p.name)} (${p.pos})</span><b>${p.injured} match${p.injured > 1 ? 'es' : ''}</b></div>`).join('')}` : ''}
      <h3 style="margin-top:10px">LATEST NEWS</h3>${c.news.slice(0, 4).map(n => `<div class="fe">${esc(n.t)}</div>`).join('')}</div></div>`;
}
function squadTab(c) {
  const order = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
  const list = [...c.squad].sort((a, b) => sortBy === 'ovr' ? b.rating - a.rating : sortBy === 'age' ? a.age - b.age : (order[C.posGroup(a)] - order[C.posGroup(b)]) || b.rating - a.rating);
  return `<div class="card scroll" style="max-height:48vh"><table class="tbl squad"><tr><th>#</th><th style="text-align:left">Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>POT</th><th>Contract</th><th>Wage</th><th>Value</th><th>Gls</th><th></th></tr>
    ${list.map(p => `<tr class="nav" data-act="pl:${p.id}" style="cursor:pointer"><td>${p.number}</td><td class="tn">${esc(p.name)}</td><td>${p.pos}</td><td>${p.age}</td><td><b>${p.rating}</b></td><td style="opacity:.7">${p.potential}</td><td style="${p.contract <= 1 ? 'color:#fbbf24' : ''}">${p.contract}y</td><td>${M(p.wage)}</td><td>${M(p.value)}</td><td>${p.goals}</td><td>${p.injured ? '🩹' + p.injured : ''}</td></tr>`).join('')}</table></div>
    <div class="actions" style="margin:6px 0"><span class="hint" style="margin:0">Click a player to sell, renew or release · sort:</span><div class="btn nav" data-act="sort:pos">Position</div><div class="btn nav" data-act="sort:ovr">Rating</div><div class="btn nav" data-act="sort:age">Age</div></div>`;
}
function transfersTab(c) {
  const open = C.windowOpen(c), m = C.market(c);
  const f = { ALL: () => true, GK: p => p.pos === 'GK', DEF: p => C.posGroup(p) === 'DEF', MID: p => C.posGroup(p) === 'MID', ATT: p => C.posGroup(p) === 'ATT', Young: p => p.age <= 21, Free: p => p.free }[filter] || (() => true);
  return `<div class="ob" style="margin-bottom:6px"><span>💰 Budget <b>${M(c.budget)}</b> · squad ${c.squad.length}/30 · <b style="color:${open ? '#6ee7a8' : '#f87171'}">${esc(C.windowText(c))}</b></span><span>${m.list.length} players available</span></div>
    <div class="tabs" style="margin:0 0 8px">${['ALL', 'GK', 'DEF', 'MID', 'ATT', 'Young', 'Free'].map(x => `<div class="tab nav ${filter === x ? 'on' : ''}" data-act="fl:${x}">${x}</div>`).join('')}</div>
    <div class="card scroll" style="max-height:40vh"><table class="tbl squad"><tr><th style="text-align:left">Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>POT</th><th style="text-align:left">Club</th><th>Price</th><th>Wage</th></tr>
    ${m.list.filter(f).map(p => `<tr class="nav" data-act="mk:${p.id}" style="cursor:pointer"><td class="tn">${esc(p.name)}</td><td>${p.pos}</td><td>${p.age}</td><td><b>${p.rating}</b></td><td style="opacity:.7">${p.potential}</td><td class="tn" style="opacity:.8">${esc(p.from)}</td><td style="color:#ffd34d"><b>${p.free ? 'FREE' : M(p.price)}</b></td><td>${M(C.wageOf(p, c.wageK))}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nobody matches that filter.</td></tr>'}</table></div>`;
}
function financeTab(c) {
  const f = c.fin, inc = f.tv + f.gate + f.sponsor + f.prize + f.sales + f.funded, exp = f.wages + f.transfers + f.upkeep;
  const bett = Bank.bettors;
  return `<div class="hub"><div class="card"><h3>THIS SEASON SO FAR</h3>
    ${[['TV rights', f.tv], ['Gate receipts', f.gate], ['Sponsors', f.sponsor], ['Prize money', f.prize], ['Player sales', f.sales], ['Betting funding', f.funded]].map(([n, v]) => `<div class="ob"><span>${n}</span><b style="color:#6ee7a8">+${M(v)}</b></div>`).join('')}
    <div class="ob" style="border-top:1px solid rgba(255,255,255,.15);margin-top:4px"><span>Income</span><b>${M(inc)}</b></div>
    ${[['Wages', f.wages], ['Transfers & contracts', f.transfers], ['Upkeep & upgrades', f.upkeep]].map(([n, v]) => `<div class="ob"><span>${n}</span><b style="color:#f87171">−${M(v)}</b></div>`).join('')}
    <div class="ob" style="border-top:1px solid rgba(255,255,255,.15);margin-top:4px"><span>Expenses</span><b>${M(exp)}</b></div>
    <div class="ob"><span>Projected yearly income / wage bill</span><b>${M(C.projectedIncome(c))} / ${M(C.wageBill(c))}</b></div>
    <h3 style="margin-top:12px">🎰 FUND THE CLUB FROM YOUR WINNINGS</h3><div class="sub" style="margin:0 0 6px;font-size:13px;text-align:left">${COINS_PER_MILLION} play coins = 1M club budget (one way).</div>
    ${bett.map(b => `<div class="ob"><span><b>${esc(b.name)}</b> · ${fmt(b.coins)} 🪙</span><span>${[100, 500, 1000].map(v => `<span class="chip nav" data-act="fund:${b.id}:${v}">${v}</span>`).join('')}<span class="chip nav" data-act="fund:${b.id}:all">ALL</span></span></div>`).join('')}</div>
    <div class="card"><h3>CLUB FACILITIES</h3>${Object.entries(C.FACILITIES).map(([k, d]) => `<div class="fac"><div><b>${d.icon} ${d.name}</b> <span class="pips">${'●'.repeat(c.fac[k])}${'○'.repeat(5 - c.fac[k])}</span><small>${esc(d.desc(c.fac[k]))}</small></div>${c.fac[k] < 5 ? `<div class="btn nav" data-act="up:${k}">Upgrade ${M(C.upgradeCost(c, k))}</div>` : '<span class="pips">MAX</span>'}</div>`).join('')}
    <div class="ob" style="margin-top:8px"><span>Stadium capacity</span><b>${fmt(C.stadiumCap(c))}</b></div><div class="ob"><span>Yearly upkeep</span><b>${M(C.upkeepOf(c))}</b></div></div></div>`;
}
function tableTab(c) {
  const rows = C.tableRows(c);
  return `<div class="hub"><div class="card scroll" style="max-height:50vh"><h3>${esc(T.currentRound ? (c.league.name || 'League') : 'League')}</h3><table class="tbl"><tr><th>#</th><th style="text-align:left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
    ${rows.map((r, i) => `<tr class="${r.team === c.clubId ? 'me' : ''}"><td>${i + 1}</td><td class="tn">${esc(nm(r.team))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table></div>
    <div class="card"><h3>HISTORY</h3>${c.history.map(h => `<div class="ob"><span>${esc(h.season)} · ${esc(h.league)}</span><b>${h.pos}/${h.of}${h.champion ? ' 🏆' : ''}${h.promoted ? ' ⬆' : ''}${h.relegated ? ' ⬇' : ''}${h.cup ? ' · cup ' + h.cup : ''}</b></div>`).join('') || '<div class="empty">Your first season is under way.</div>'}
    ${c.cup ? `<h3 style="margin-top:12px">CUP</h3><div class="ob"><span>${esc(c.cup.name)}</span><b>${c.cup.status === 'done' ? (c.cup.champion === c.clubId ? 'Winners 🏆' : 'Finished') : (c.cup.teams.includes(c.clubId) && T.nextFixtures(c.cup).some(f => f.home === c.clubId || f.away === c.clubId) ? 'Still in' : 'Eliminated')}</b></div>` : ''}</div></div>`;
}
function seasonEndCard(c) {
  const s = c.summary;
  return `<div class="card"><h3>SEASON ${esc(s.season)} REVIEW</h3>
    <div class="final" style="font-size:26px;margin:4px 0"><span>${s.champion ? '🏆 CHAMPIONS' : s.promoted ? '⬆ PROMOTED' : s.relegated ? '⬇ RELEGATED' : s.pos + ' of ' + s.of}</span></div>
    <div class="ob"><span>League finish vs target</span><b style="color:${s.met ? '#6ee7a8' : '#f87171'}">${s.pos} (target top ${s.objective}) ${s.met ? '✔' : '✘'}</b></div><div class="ob"><span>Board confidence</span><b>${s.dConf >= 0 ? '+' : ''}${Math.round(s.dConf)} → ${Math.round(c.confidence)}%</b></div>
    <div class="ob"><span>Prize money / upkeep</span><b>+${M(s.prize)} / −${M(s.upkeep)}</b></div>${s.topScorer && s.topScorer.lastSeason ? `<div class="ob"><span>Top scorer</span><b>${esc(s.topScorer.name)} (${s.topScorer.lastSeason.goals})</b></div>` : ''}
    <div class="ob"><span>Cup</span><b>${s.cup || '—'}</b></div>
    ${s.changes.length ? `<h3 style="margin-top:8px">DEVELOPMENT</h3><div class="ob" style="flex-wrap:wrap;gap:4px 12px">${s.changes.slice(0, 6).map(x => `<span style="color:${x.to > x.from ? '#6ee7a8' : '#f87171'}">${esc(x.name.split(' ').pop())} ${x.from}→${x.to}</span>`).join('')}</div>` : ''}
    ${s.retired.length ? `<div class="ob"><span>Retired</span><b>${s.retired.map(r => esc(r.name)).join(', ')}</b></div>` : ''}
    ${s.youth.length ? `<h3 style="margin-top:8px">YOUTH INTAKE</h3>${s.youth.map(y => `<div class="ob"><span>🌱 ${esc(y.name)} (${y.pos}, ${y.age})</span><b>${y.rating} → potential ${y.potential}</b></div>`).join('')}` : ''}
    ${s.expiring.length ? `<h3 style="margin-top:8px">CONTRACTS ENDING — RENEW?</h3>${s.expiring.map(id => { const p = c.squad.find(q => q.id === id); return p ? `<div class="ob"><span>${esc(p.name)} (${p.rating}, ${p.age})</span><span class="btn nav" data-act="renew:${p.id}" style="padding:2px 12px;font-size:13px">Renew ${M(C.renewCost(p))}</span></div>` : ''; }).join('')}` : ''}
    <div class="actions" style="margin-top:10px"><div class="btn nav go" data-act="nextseason">Start next season ▶</div></div><div class="hint" style="margin-top:6px">The transfer window is open now — use the tabs above first if you like.</div></div>
    <div class="card"><h3>TOP OF THE SQUAD</h3>${C.top(c, 8).map(p => `<div class="ob"><span>${esc(p.name)} (${p.pos}, ${p.age})</span><b>${p.rating}</b></div>`).join('')}</div>`;
}

// ------------------------------------------------------------------ actions
function hubAction(act) {
  const [k, x, y] = act.split(':'), c = career;
  if (k === 'menu') { save(); return api.mainMenu(); }
  if (k === 'bet') { save(); return api.sportsbook(); }
  if (k === 'tab') { tab = +x; say(''); return api.setFocus(tab); }
  if (k === 'sort') { sortBy = x; return api.renderScreen(); }
  if (k === 'fl') { filter = x; return api.renderScreen(); }
  if (k === 'pl') return playerScreen(x);
  if (k === 'mk') return bidScreen(x);
  if (k === 'up') { const e = C.upgrade(c, x); say(e || `${C.FACILITIES[x].name} upgraded!`, !e); save(); return api.renderScreen(); }
  if (k === 'renew') { const e = C.renew(c, x); say(e || 'Contract renewed.', !e); save(); return api.renderScreen(); }
  if (k === 'fund') { const b = Bank.bettor(x); const coins = y === 'all' ? b.coins : Number(y); const m = Bank.fundClub(x, coins); if (m) { C.addFunds(c, m); say(`${esc(b.name)} funded the club with ${m}M!`); Sound.confirm(); } else say('Not enough coins (100 coins = 1M).', false); save(); return api.renderScreen(); }
  if (k === 'nextseason') { C.nextSeason(c); tab = 0; say(''); save(); return hub(); }
  if (k === 'manage') return tactics();
  if (k === 'play') return playMatch();
  if (k === 'sim' || k === 'sim5' || k === 'simend') return simulate(k === 'sim' ? 1 : k === 'sim5' ? 5 : 999);
}
function simulate(n) {
  const c = career; let played = 0, last = null;
  C.skipDeadEvents(c);
  while (played < n && c.phase === 'season') {
    C.skipDeadEvents(c); if (c.phase !== 'season') break;
    const ev = C.currentEvent(c); if (!ev) break;
    last = C.completeEvent(c, ev.fixture ? C.simUserMatch(c) : null) || last; played++;
    if (C.windowOpen(c) && n > 1 && c.calIdx === Math.floor(c.calendar.length * 0.42)) { say('Mid-season transfer window is open!'); break; }
  }
  save();
  if (c.phase === 'over') return gameOver();
  if (n === 1 && last) return resultScreen(last); say(c.phase === 'seasonEnd' ? 'Season complete!' : `Simulated ${played} matchday${played > 1 ? 's' : ''}.`); hub();
}
function resultScreen(info) {
  api.show({
    focus: 0,
    render: () => `<div class="panel"><div class="sub">${esc(info.event)}</div><div class="final"><span>${esc(nm(info.home))}</span><b>${info.hg} - ${info.ag}</b><span>${esc(nm(info.away))}</span></div>${info.pens ? `<div class="sub">${info.pens.h} - ${info.pens.a} on penalties</div>` : ''}
      <div class="result" style="font-size:50px;color:${info.won ? '#6ee7a8' : info.lost ? '#f87171' : '#fff'}">${info.won ? 'WIN' : info.lost ? 'DEFEAT' : 'DRAW'}</div>
      <div class="opts"><div class="opt nav go" data-act="ok"><span>Continue ▶</span><span></span></div></div></div>`,
    action: () => afterEvent(), back: () => afterEvent(),
  });
}
function afterEvent() { save(); if (career.phase === 'over') return gameOver(); hub(); }

// ------------------------------------------------------------------ playing the match in 3D
function playMatch() {
  const c = career, ev = C.currentEvent(c), fx = ev && ev.fixture; if (!fx) return;
  const home = getTeam(fx.home), away = getTeam(fx.away), mine = fx.home === c.clubId ? 0 : 1;
  const final = /final/i.test(ev.name) && !/semi|quarter/i.test(ev.name);
  api.sideSelect({
    fixedTeams: [home, away], back: hub,
    onDone: sides => {
      const squads = [null, null]; squads[mine] = c.squad.filter(p => !p.injured);
      const manage = {}; manage[mine] = { formation: c.formation, tactics: { ...c.tactics } };
      api.matchSettings({
        sides: sides.map(s => ({ device: s.device, team: mine })), teams: [home, away], alt: [false, false], from: 'career', compName: ev.name, squads, manage,
        knockout: !!fx.decider, extraTime: fx.extraTime !== false, venue: venueFor(home, away, { neutral: !!fx.neutral, final, seed: fx.id + c.season }),
        onQuit: hub,
        onEnd: r => {
          const res = { hg: r.hg, ag: r.ag, et: r.et, pens: r.pens, scorers: r.scorers.map(s => ({ team: s.team === 0 ? fx.home : fx.away, player: s.id, name: s.name, minute: s.minute, og: s.own })) };
          if (manage[mine]) { c.formation = manage[mine].formation; c.tactics = manage[mine].tactics; }
          const info = C.completeEvent(c, res); save(); if (c.phase === 'over') return gameOver(); resultScreen(info);
        },
      });
    },
  });
}
function tactics() {
  const c = career, squad = c.squad.filter(p => !p.injured), ctx = { teams: [club()], squads: [squad], sides: [{ team: 0 }], manage: { 0: { formation: c.formation, tactics: { ...c.tactics } } } };
  api.teamManagement(ctx, 0, () => { const m = ctx.manage[0]; if (m) { c.formation = m.formation; c.tactics = m.tactics; } save(); say('Formation & tactics saved.'); hub(); });
}

// ------------------------------------------------------------------ player & transfer screens
function playerScreen(id) {
  const c = career, p = c.squad.find(x => x.id === id); if (!p) return hub();
  const open = C.windowOpen(c), offers = open ? C.sellOffers(c, id) : [];
  api.show({
    render: () => `<div class="panel"><div class="title" style="font-size:34px">${esc(p.name)}</div><div class="sub">${p.pos} · age ${p.age} · #${p.number}${p.injured ? ' · 🩹 injured ' + p.injured : ''}</div>
      <table class="tbl" style="margin:0 auto 12px"><tr>${[['OVR', p.rating], ['POT', p.potential], ['PAC', p.pace], ['SHO', p.shooting], ['PAS', p.passing], ['DRI', p.dribbling], ['DEF', p.defending], ['PHY', p.physical]].map(([k, v]) => `<th>${k}</th>`).join('')}</tr><tr>${[p.rating, p.potential, p.pace, p.shooting, p.passing, p.dribbling, p.defending, p.physical].map(v => `<td><b>${v}</b></td>`).join('')}</tr></table>
      <div class="ob"><span>Value</span><b>${M(p.value)}</b></div><div class="ob"><span>Wage</span><b>${M(p.wage)} / yr</b></div><div class="ob"><span>Contract</span><b>${p.contract} year${p.contract > 1 ? 's' : ''}</b></div><div class="ob"><span>This season</span><b>${p.apps} apps · ${p.goals} goals</b></div>
      ${msg ? `<div class="msg ${msgOk ? 'ok' : 'bad'}">${esc(msg)}</div>` : ''}
      <h3 style="margin:12px 0 4px">${open ? 'OFFERS FROM CLUBS' : 'Transfer window closed'}</h3>
      ${offers.map((o, i) => `<div class="ob"><span>${esc(o.club)}</span><span class="btn nav" data-act="sell:${i}" style="padding:2px 14px">Accept ${M(o.amount)}</span></div>`).join('')}
      <div class="actions"><div class="btn nav" data-act="renew">Renew contract ${M(C.renewCost(p))}</div><div class="btn nav" data-act="release">Release player</div><div class="btn nav" data-act="back">← Back</div></div></div>`,
    action: act => {
      const [k, i] = act.split(':');
      if (k === 'back') { say(''); return hub(); }
      if (k === 'sell') { const r = C.sell(c, id, offers[+i].amount); say(r.msg, r.ok); save(); return r.ok ? hub() : api.renderScreen(); }
      if (k === 'renew') { const e = C.renew(c, id); say(e || 'Contract extended to 3 years.', !e); save(); return api.renderScreen(); }
      if (k === 'release') { const e = C.release(c, id); say(e || `${p.name} released.`, !e); save(); return e ? api.renderScreen() : hub(); }
    },
    back: () => { say(''); hub(); },
  });
}
function bidScreen(id) {
  const c = career, m = C.market(c), p = m.list.find(x => x.id === id); if (!p) return hub();
  api.show({
    render: () => `<div class="panel"><div class="title" style="font-size:34px">${esc(p.name)}</div><div class="sub">${p.pos} · age ${p.age} · from ${esc(p.from)}</div>
      <table class="tbl" style="margin:0 auto 12px"><tr>${['OVR', 'POT', 'PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'].map(k => `<th>${k}</th>`).join('')}</tr><tr>${[p.rating, p.potential, p.pace, p.shooting, p.passing, p.dribbling, p.defending, p.physical].map(v => `<td><b>${v}</b></td>`).join('')}</tr></table>
      <div class="ob"><span>Asking price</span><b style="color:#ffd34d">${p.free ? 'FREE TRANSFER' : M(p.price)}</b></div><div class="ob"><span>Wage</span><b>${M(C.wageOf(p, c.wageK))} / yr</b></div><div class="ob"><span>Your budget</span><b>${M(c.budget)}</b></div>
      ${msg ? `<div class="msg ${msgOk ? 'ok' : 'bad'}">${esc(msg)}</div>` : ''}
      <h3 style="margin:12px 0 4px">${C.windowOpen(c) ? 'MAKE AN OFFER' : 'Transfer window closed'}</h3>
      <div class="actions">${p.free ? '<div class="btn nav go" data-act="b:0">Sign for free</div>' : [100, 90, 80, 70].map(pc => `<div class="btn nav ${pc === 100 ? 'go' : ''}" data-act="b:${pc}">${pc}% · ${M(p.price * pc / 100)}</div>`).join('')}</div>
      <div class="actions"><div class="btn nav" data-act="back">← Back to market</div></div><div class="hint">Lower offers can be rejected — the seller may raise the price if you keep trying.</div></div>`,
    action: act => {
      const [k, pc] = act.split(':'); if (k === 'back') { say(''); return hub(); }
      const r = C.bid(c, id, p.free ? 0 : p.price * (+pc) / 100); say(r.msg, r.ok); save();
      if (r.ok) { Sound.confirm(); return hub(); } Sound.back(); api.renderScreen();
    },
    back: () => { say(''); hub(); },
  });
}

// ------------------------------------------------------------------ wallet bridge (also reachable from the sportsbook)
export function fundScreen(bettorId) {
  if (!career) career = C.careerStore.load(); if (!career) return api.mainMenu();
  const back = () => api.sportsbook();
  api.show({
    render: () => `<div class="panel"><div class="title" style="font-size:34px">FUND ${esc(club().name.toUpperCase())}</div><div class="sub">${COINS_PER_MILLION} play coins = 1M club budget · club budget now ${M(career.budget)}</div>
      ${Bank.bettors.map(b => `<div class="ob" style="font-size:15px"><span><b>${esc(b.name)}</b> · ${fmt(b.coins)} 🪙</span><span>${[100, 500, 1000].map(v => `<span class="chip nav" data-act="f:${b.id}:${v}">${v}</span>`).join('')}<span class="chip nav" data-act="f:${b.id}:all">ALL</span></span></div>`).join('')}
      ${msg ? `<div class="msg ${msgOk ? 'ok' : 'bad'}">${esc(msg)}</div>` : ''}<div class="actions"><div class="btn nav" data-act="back">← Back to sportsbook</div><div class="btn nav" data-act="ml">Open Master League</div></div></div>`,
    action: act => {
      const [k, id, v] = act.split(':'); if (k === 'back') return back(); if (k === 'ml') { tab = 3; return hub(); }
      const b = Bank.bettor(id), coins = v === 'all' ? b.coins : Number(v), m = Bank.fundClub(id, coins);
      if (m) { C.addFunds(career, m); save(); say(`${b.name} added ${m}M to the club!`); Sound.confirm(); } else say('Not enough coins (100 coins = 1M).', false); api.renderScreen();
    },
    back,
  });
}

function gameOver() {
  const c = career;
  api.show({
    render: () => `<div class="panel"><div class="title">SACKED</div><div class="sub">${esc(c.over ? c.over.reason : '')}</div>
      <div class="opts"><div class="opt"><span>Seasons managed</span><span class="val">${c.history.length}</span></div>${c.history.slice(-5).map(h => `<div class="opt"><span>${esc(h.season)} · ${esc(h.league)}</span><span class="val">${h.pos}/${h.of}</span></div>`).join('')}
      <div class="opt nav go" data-act="new"><span>Start a new career</span><span></span></div><div class="opt nav" data-act="menu"><span>Main menu</span><span></span></div></div></div>`,
    action: act => { C.careerStore.clear(); career = null; if (act === 'new') return newCareer(); api.mainMenu(); },
    back: () => { C.careerStore.clear(); career = null; api.mainMenu(); },
  });
}
