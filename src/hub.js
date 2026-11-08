// Competition hub: choose a competition and team(s), play or simulate fixtures, tables, brackets, scorers, seasons.
import * as T from './tournament.js';
import { COMPETITIONS, COMPETITION_CATEGORIES } from './data/competitions.js';
import { getTeam } from './data/teams.js';
import { venueFor } from './data/stadiums.js';

let api = null;
let C = null; // { state, users: [teamId, teamId?], tab, lastResults: [] }
const SAVE_KEY = 'pc_comp';
export function init(a) { api = a; }

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state: C.state, users: C.users, lastResults: C.lastResults || [] })); } catch (e) {} }
function load() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return d && d.state ? d : null; } catch (e) { return null; } }
export function hasSave() { const d = load(); return d ? `${d.state.name} ${d.state.season} · ${(d.users || []).map(id => (getTeam(id) || {}).name).join(' & ')}` : null; }
export function continueSaved() { const d = load(); if (!d) return competitionsMenu(); C = { state: d.state, users: d.users, tab: 0, lastResults: d.lastResults || [] }; hubScreen(); }

const name = id => { const t = getTeam(id); return t ? t.name : (C && C.state.teamInfo[id] ? C.state.teamInfo[id].name : id); };
const short = id => { const t = getTeam(id); return t ? t.short : id; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ competition list
const CATS = (COMPETITION_CATEGORIES && COMPETITION_CATEGORIES.length) ? COMPETITION_CATEGORIES : [['domestic', 'Domestic leagues & cups'], ['continental', 'Club continental cups'], ['international', 'Nations tournaments']];
let lastCat = 0;   // coming back to this menu keeps the category you were in
export function competitionsMenu(start) {
  let cat = start === undefined ? lastCat : start;
  const saved = hasSave();
  const listFor = i => COMPETITIONS.filter(c => c.category === CATS[i][0]);
  const icon = c => c.type === 'league' ? '📊' : c.type === 'super' ? '⭐' : c.type === 'knockout' ? '🏅' : '🏆';
  api.show({
    focus: CATS.length + (saved ? 1 : 0),          // start on the first competition
    render: () => `<div class="panel wide"><div class="title">COMPETITIONS</div>
        <div class="tabs">${CATS.map((c, i) => `<div class="tab nav ${i === cat ? 'on' : ''}" data-act="cat:${i}">${esc(c[1])}</div>`).join('')}</div>
        ${saved ? `<div class="opts" style="margin-bottom:12px"><div class="opt nav go" data-act="continue"><span>▶ Continue: ${esc(saved)}</span><span></span></div></div>` : ''}
        <div class="complist">${listFor(cat).map(c => `<div class="btn nav" data-act="comp:${c.id}">${icon(c)} ${esc(c.name)}<small>${esc(describe(c))}</small></div>`).join('')}</div>
        <div class="actions"><div class="btn nav" data-act="back">← Back to menu</div></div>
        <div class="hint">Click a category, or press <span class="key">Q</span>/<span class="key">E</span> · <span class="key">LB</span>/<span class="key">RB</span> · <span class="key">Tab</span> to switch · arrows move · <span class="key">Enter</span> choose · <span class="key">Esc</span> back</div></div>`,
    tab: d => { cat = (cat + d + CATS.length) % CATS.length; lastCat = cat; api.renderScreen(); },
    action: act => {
      if (act === 'back') return api.mainMenu();
      if (act === 'continue') return continueSaved();
      if (act.startsWith('cat:')) { cat = +act.slice(4); lastCat = cat; api.setFocus(cat); return; }
      if (act.startsWith('comp:')) { lastCat = cat; chooseTeams(act.slice(5)); }
    },
    back: () => api.mainMenu(),
  });
}
function describe(c) {
  if (c.type === 'league') return `League · ${c.teams || c.size || ''} clubs · home & away`.replace(' ·  clubs', '');
  if (c.type === 'super') return 'One-off showpiece final';
  if (c.type === 'knockout') return 'Knockout cup · draws every round';
  return `${c.size || c.teams || ''} teams · groups then knockouts`.trim();
}

// ------------------------------------------------------------------ team choice
function chooseTeams(compId) {
  let state;
  try { state = T.createCompetition(compId, { seed: (Math.random() * 1e9) | 0 }); }
  catch (e) { console.error(e); return; }
  const teams = state.teams.slice().sort((a, b) => (getTeam(b)?.rating || 0) - (getTeam(a)?.rating || 0));
  const info = id => getTeam(id) || state.teamInfo[id];
  const picks = [];
  const ACT = 3;                                     // number of buttons before the team grid
  const choose = id => {
    if (picks.includes(id)) return;
    picks.push(id); Sound.confirm();
    if (picks.length === 2) return begin(state, picks);
    api.renderScreen(); api.setFocus(ACT);
  };
  api.show({
    focus: ACT,
    render: () => `<div class="panel wide"><div class="title">${esc(state.name)}</div>
      <div class="sub">${esc(state.season)} · ${teams.length} teams · ${picks.length === 0 ? '<b>Click or press Enter on YOUR team</b>' : `Player 1: <b>${esc(name(picks[0]))}</b> — now pick a rival for Player 2, or start with one team`}</div>
      <div class="actions"><div class="btn nav" data-act="back">← ${picks.length ? 'Undo' : 'Back'}</div><div class="btn nav" data-act="random">🎲 Random team</div>${picks.length ? '<div class="btn nav go" data-act="start1">▶ Start with one team</div>' : '<div class="btn" style="opacity:.0;pointer-events:none">.</div>'}</div>
      <div class="teamgrid">${teams.map(id => { const t = info(id); return `<div class="btn nav ${picks.includes(id) ? 'picked' : ''}" data-act="t:${id}"><span class="tn">${api.kitSwatch(t, false)} ${esc(t.name)}</span><small>${api.stars(t.rating)} ${t.rating}${t.formation ? ' · ' + esc(t.formation) : ''}</small></div>`; }).join('')}</div>
      <div class="hint">Arrows move · <span class="key">Enter</span> / click choose · <span class="key">Y</span> random · <span class="key">Esc</span> ${picks.length ? 'undo' : 'back to competitions'}</div></div>`,
    action: act => {
      if (act === 'back') { Sound.back(); if (picks.length) { picks.pop(); api.renderScreen(); api.setFocus(ACT); return; } return competitionsMenu(); }
      if (act === 'random') { const free = teams.filter(id => !picks.includes(id)); return choose(free[Math.floor(Math.random() * free.length)]); }
      if (act === 'start1') return begin(state, picks);
      if (act.startsWith('t:')) choose(act.slice(2));
    },
    back: () => { Sound.back(); if (picks.length) { picks.pop(); api.renderScreen(); api.setFocus(ACT); } else competitionsMenu(); },
    tick: inputs => { for (const { inp } of inputs) if (inp.throughPressed) { const free = teams.filter(id => !picks.includes(id)); return choose(free[Math.floor(Math.random() * free.length)]); } },
  });
}
function begin(state, users) {
  C = { state, users, tab: 0, lastResults: [] };
  save();
  hubScreen();
}

// ------------------------------------------------------------------ hub
const TABS = ['Overview', 'Table', 'Fixtures', 'Bracket', 'Top scorers'];
function userFixtures() {
  if (C.state.status === 'done') return [];
  return T.nextFixtures(C.state).filter(f => !f.played && (C.users.includes(f.home) || C.users.includes(f.away)));
}
function fixtureRow(f, mine) {
  const s = f.played ? `${f.hg} - ${f.ag}${f.pens ? `<small> (${f.pens.h}-${f.pens.a}p)</small>` : f.et ? '<small> aet</small>' : ''}` : 'vs';
  return `<div class="fixture ${mine ? 'me' : ''}"><span class="h">${esc(name(f.home))}</span><span class="s">${s}</span><span>${esc(name(f.away))}</span></div>`;
}
function tableHtml(rows, qualify = 0) {
  return `<table class="tbl"><tr><th>#</th><th style="text-align:left">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th><th>Form</th></tr>
    ${rows.map((r, i) => `<tr class="${C.users.includes(r.team) ? 'me' : ''} ${i < qualify ? 'q' : ''}"><td>${i + 1}</td><td class="tn">${esc(name(r.team))}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td><td>${(r.form || []).map(f => `<span style="color:${f === 'W' ? '#6ee7a8' : f === 'L' ? '#f87171' : '#fbbf24'}">${f}</span>`).join('')}</td></tr>`).join('')}</table>`;
}
function standingsHtml(compact) {
  const s = C.state;
  if (s.type === 'league') { const rows = T.standings(s); return tableHtml(compact ? focusRows(rows) : rows, 4); }
  if (s.groups && s.groups.length && (s.type === 'groups_ko')) {
    const all = T.standings(s);
    const groups = Object.entries(all);
    const mine = groups.filter(([g, rows]) => rows.some(r => C.users.includes(r.team)));
    const show = compact ? (mine.length ? mine : groups.slice(0, 1)) : groups;
    return show.map(([g, rows]) => `<div style="margin-bottom:10px"><b>Group ${esc(g)}</b>${tableHtml(rows, 2)}</div>`).join('');
  }
  return '<div class="sub">Knockout competition — see the bracket.</div>';
}
function focusRows(rows) {
  const i = rows.findIndex(r => C.users.includes(r.team));
  const start = Math.max(0, Math.min(rows.length - 8, i - 3));
  return rows.slice(start, start + 8);
}
function bracketHtml() {
  const b = T.bracket(C.state);
  if (!b || !b.rounds || !b.rounds.length) return '<div class="sub">The knockout draw has not been made yet.</div>';
  return `<div class="bracket">${b.rounds.map(r => `<div class="round"><b>${esc(r.name)}</b>${r.ties.map(t => {
    const agg = t.agg ? ` <small>(${t.agg.home}-${t.agg.away})</small>` : '';
    const line = (id, sc) => `<div class="${t.winner && t.winner === id ? 'w' : ''}"><span>${id ? esc(short(id)) + ' ' + esc(name(id)).slice(0, 16) : 'TBD'}</span><span>${sc ?? ''}</span></div>`;
    const legs = t.legs || [];
    const hs = legs.filter(l => l.played).map(l => l.home === t.home ? l.hg : l.ag).join(' ');
    const as = legs.filter(l => l.played).map(l => l.home === t.home ? l.ag : l.hg).join(' ');
    return `<div class="tie">${line(t.home, hs)}${line(t.away, as)}${agg}</div>`;
  }).join('')}</div>`).join('')}</div>`;
}
function scorersHtml() {
  const list = T.topScorers(C.state, 15);
  if (!list.length) return '<div class="sub">No goals yet.</div>';
  return `<table class="tbl">${list.map((s, i) => `<tr class="${C.users.includes(s.team) ? 'me' : ''}"><td>${i + 1}</td><td class="tn">${esc(s.name)}</td><td class="tn">${esc(name(s.team))}</td><td><b>${s.goals}</b></td></tr>`).join('')}</table>`;
}

export function hubScreen() {
  if (!C) return competitionsMenu();
  const s = C.state;
  if (s.status === 'done') return championScreen();
  const round = T.currentRound(s);
  const mine = userFixtures();
  const roundFx = T.nextFixtures(s);
  api.show({
    focus: TABS.length,
    render: () => {
      let body = '';
      if (C.tab === 0) {
        const next = mine[0];
        let agg = '';
        if (next) { const a = T.fixtureAggregate(s, next.id); if (a) agg = `<div class="sub">First leg: ${esc(name(next.home))} ${a.home} - ${a.away} ${esc(name(next.away))} (aggregate)</div>`; }
        body = `<div class="hub"><div class="card"><h3>${esc(round.name).toUpperCase()}</h3>
          ${next ? `<div class="final" style="font-size:24px"><span>${esc(name(next.home))}</span><b style="font-size:34px">VS</b><span>${esc(name(next.away))}</span></div>${agg}
            <div class="opts"><div class="opt nav go" data-act="play"><span>⚽ Play match</span><span></span></div><div class="opt nav" data-act="sim"><span>⏩ Simulate match</span><span></span></div></div>`
          : `<div class="sub">${C.users.some(u => s.teams.includes(u)) && !isEliminated() ? 'No match for your team this round.' : 'Your team is out — follow the rest of the competition.'}</div>
            <div class="opts"><div class="opt nav go" data-act="advance"><span>⏩ Simulate round</span><span></span></div><div class="opt nav" data-act="simall"><span>⏭ Simulate to the end</span><span></span></div></div>`}
          <h3 style="margin-top:16px">THIS ROUND</h3><div class="scroll" style="max-height:30vh">${roundFx.map(f => fixtureRow(f, C.users.includes(f.home) || C.users.includes(f.away))).join('')}</div></div>
          <div class="card"><h3>${s.type === 'league' ? 'TABLE' : 'STANDINGS'}</h3>${standingsHtml(true)}
          ${(C.lastResults || []).length ? `<h3>LAST RESULTS</h3>${C.lastResults.slice(0, 6).map(f => fixtureRow(f, true)).join('')}` : ''}</div></div>`;
      } else if (C.tab === 1) body = `<div class="card scroll">${standingsHtml(false)}</div>`;
      else if (C.tab === 2) {
        const fx = (T.teamPath ? C.users.flatMap(u => T.teamPath(s, u)) : []).filter((f, i, a) => a.findIndex(x => x.id === f.id) === i).sort((a, b) => a.round - b.round);
        body = `<div class="card scroll">${fx.map(f => `<div class="sub" style="margin:6px 0 0;font-size:13px">${esc(f.roundName || '')}</div>${fixtureRow(f, true)}`).join('') || '<div class="sub">No fixtures yet.</div>'}</div>`;
      } else if (C.tab === 3) body = `<div class="card scroll">${bracketHtml()}</div>`;
      else body = `<div class="card scroll">${scorersHtml()}</div>`;
      return `<div class="panel wide"><div class="title" style="font-size:36px">${esc(s.name)} <small style="font-size:18px;opacity:.7">${esc(s.season)}</small></div>
        <div class="sub" style="margin:4px 0 12px">${C.users.map(u => esc(name(u))).join(' vs ')}</div>
        <div class="tabs">${TABS.map((t, i) => `<div class="tab nav ${i === C.tab ? 'on' : ''}" data-act="tab:${i}">${t}</div>`).join('')}</div>${body}
        <div class="opts" style="margin-top:12px"><div class="opt nav" data-act="quit"><span>Save & exit to menu</span><span></span></div></div>
        <div class="hint"><span class="key">LB</span>/<span class="key">RB</span> tabs · <span class="key">A</span> select · <span class="key">B</span> menu</div></div>`;
    },
    tab: d => { C.tab = (C.tab + d + TABS.length) % TABS.length; api.setFocus(C.tab); },
    action: act => {
      if (act.startsWith('tab:')) { C.tab = +act.slice(4); api.setFocus(C.tab); return; }
      if (act === 'play') return playFixture(mine[0]);
      if (act === 'sim') { simulateUserFixture(mine[0]); return finishRoundIfReady(); }
      if (act === 'advance') { finishRoundIfReady(true); return; }
      if (act === 'simall') { T.simulateAll(C.state); save(); return hubScreen(); }
      if (act === 'quit') { save(); api.mainMenu(); }
    },
    back: () => { save(); api.mainMenu(); },
  });
}
function isEliminated() {
  const s = C.state;
  if (s.status !== 'knockout') return false;
  return !C.users.some(u => T.nextFixtures(s).some(f => f.home === u || f.away === u));
}

function simulateUserFixture(f) {
  const res = T.simulateMatch(getTeam(f.home), getTeam(f.away), { knockout: !!f.decider, extraTime: f.extraTime !== false, neutral: !!f.neutral, aggregate: T.fixtureAggregate(C.state, f.id) || undefined });
  T.recordResult(C.state, f.id, res);
  C.lastResults = [Object.assign({}, f, res, { played: true }), ...(C.lastResults || [])].slice(0, 10);
}

function finishRoundIfReady(force) {
  const s = C.state;
  if (userFixtures().length && !force) { save(); return hubScreen(); }
  // simulate everybody else, then advance
  T.simulateRound(s, []);
  try { T.advance(s); } catch (e) { console.error(e); }
  save();
  hubScreen();
}

function playFixture(f) {
  const home = getTeam(f.home), away = getTeam(f.away);
  const aggregate = T.fixtureAggregate(C.state, f.id) || undefined;
  api.sideSelect({
    fixedTeams: [home, away],
    back: () => hubScreen(),
    onDone: sides => {
      api.matchSettings({
        sides, teams: [home, away], alt: [false, false], from: 'comp', compName: C.state.name + ' · ' + T.currentRound(C.state).name,
        knockout: !!f.decider, extraTime: f.extraTime !== false, aggregate,
        venue: venueFor(home, away, { neutral: !!f.neutral, final: /final/i.test(T.currentRound(C.state).name) && !/semi|quarter|third|1\/|of 16/i.test(T.currentRound(C.state).name), seed: f.id + C.state.season }),
        onEnd: result => {
          T.recordResult(C.state, f.id, { hg: result.hg, ag: result.ag, et: result.et, pens: result.pens, scorers: result.scorers.map(sc => ({ team: sc.team === 0 ? f.home : f.away, player: sc.id, name: sc.name, minute: sc.minute, og: sc.own })) });
          C.lastResults = [Object.assign({}, f, { hg: result.hg, ag: result.ag, pens: result.pens, played: true }), ...(C.lastResults || [])].slice(0, 10);
          finishRoundIfReady();
        },
      });
    },
  });
}

function outcome(s) {
  const list = (label, ids, color) => ids && ids.length ? `<div class="sub" style="margin:4px 0"><b style="color:${color}">${label}:</b> ${ids.map(id => (C.users.includes(id) ? '<b>' : '') + esc(name(id)) + (C.users.includes(id) ? '</b>' : '')).join(', ')}</div>` : '';
  return list('Qualified', s.qualified, '#6ee7a8') + list('To play-off', s.playoff, '#fbbf24') + list('Promoted', s.promoted, '#6ee7a8') + list('Relegated', s.relegated, '#f87171');
}
function championScreen() {
  const s = C.state;
  const won = C.users.includes(s.champion);
  if (won) Sound.victory();
  if (won) { Sound.roar(); Sound.say(`${name(s.champion)} are the champions!`, 3); }
  api.show({
    render: () => `<div class="panel wide"><div class="trophy">🏆</div><div class="title">${esc(name(s.champion))}</div>
      <div class="sub">${won ? 'CHAMPIONS! You won the ' : 'win the '}${esc(s.name)} ${esc(s.season)}</div>
      ${s.runnerUp ? `<div class="sub">Runner-up: ${esc(name(s.runnerUp))}${s.third ? ' · Third: ' + esc(name(s.third)) : ''}</div>` : ''}
      ${outcome(s)}
      <div class="hub"><div class="card">${s.type === 'league' ? tableHtml(T.standings(s).slice(0, 10), 4) : bracketHtml()}</div><div class="card"><h3>TOP SCORERS</h3>${scorersHtml()}</div></div>
      <div class="opts" style="margin-top:14px">${T.newSeason ? '<div class="opt nav go" data-act="next"><span>Next season ▶</span><span></span></div>' : ''}
      <div class="opt nav" data-act="menu"><span>Main menu</span><span></span></div></div></div>`,
    action: act => {
      if (act === 'next') { C.state = T.newSeason(s, { seed: (Math.random() * 1e9) | 0 }); C.lastResults = []; save(); hubScreen(); }
      if (act === 'menu') { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} api.mainMenu(); }
    },
    back: () => api.mainMenu(),
  });
}
