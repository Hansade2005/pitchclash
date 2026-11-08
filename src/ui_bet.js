// Virtual sportsbook screens: odds board + bet slips for up to 4 punters, live match centre, results. PLAY COINS ONLY.
import { Bank, COINS_PER_MILLION } from './economy.js';
import { toggleSel, slipSummary, MIN_STAKE, MAX_STAKE, MAX_BETTORS, fmt, teamOf, pickLabel, shortPick, liveBetStatus } from './betting.js';

let api = null, activeId = null, msg = '', msgOk = true, hook = {};
export function init(a, h) { api = a; hook = h || {}; }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAMES = ['Alex', 'Sam', 'Jo', 'Mo', 'Ade', 'Lee', 'Kim', 'Ray', 'Zed', 'Ola', 'Tia', 'Max'];
const kit = t => api.kitSwatch(t, false);
const active = () => { let b = Bank.bettor(activeId); if (!b) { b = Bank.bettors[0]; activeId = b.id; } return b; };
const say = (m, ok = true) => { msg = m; msgOk = ok; };

// ------------------------------------------------------------------ odds board
export function sportsbook() {
  Bank.load(); const md = Bank.matchday(); active(); let more = false;
  const odd = (g, b, mk, pk) => { const sel = b.slip.sels.find(s => s.gameId === g.id); return `<div class="odd nav ${sel && sel.market === mk && sel.pick === pk ? 'on' : ''}" data-act="o:${g.id}:${mk}:${pk}"><small>${shortPick(mk, pk)}</small><b>${g.markets[mk][pk].toFixed(2)}</b></div>`; };
  const card = (g, b) => {
    const h = teamOf(g.homeId), a = teamOf(g.awayId);
    return `<div class="gcard"><div class="gh"><span>${esc(g.label)}</span><small>expected goals ${g.xg[0].toFixed(1)} – ${g.xg[1].toFixed(1)}</small></div>
      <div class="gt"><span>${kit(h)} ${esc(h.name)} <i>${h.rating}</i></span><em>v</em><span>${esc(a.name)} <i>${a.rating}</i> ${kit(a)}</span></div>
      <div class="orow"><label>1 · X · 2</label>${odd(g, b, '1x2', 'h')}${odd(g, b, '1x2', 'x')}${odd(g, b, '1x2', 'a')}</div>
      <div class="orow"><label>Goals 2.5</label>${odd(g, b, 'ou25', 'over')}${odd(g, b, 'ou25', 'under')}<label>Both score</label>${odd(g, b, 'btts', 'yes')}${odd(g, b, 'btts', 'no')}</div>
      <div class="orow"><label>Double chance</label>${odd(g, b, 'dc', 'hx')}${odd(g, b, 'dc', 'xa')}${odd(g, b, 'dc', 'ha')}</div></div>`;
  };
  const slipHtml = b => {
    const s = slipSummary(b.slip), sl = b.slip, open = Bank.openBets(b.id), canTop = Bank.canTopUp(b.id);
    return `<div class="card slip"><h3>BET SLIP · ${esc(b.name)}</h3>
      ${sl.sels.length ? sl.sels.map(x => { const g = md.games.find(q => q.id === x.gameId); return `<div class="ss"><div><b>${esc(pickLabel(g, x.market, x.pick))}</b><small>${esc(teamOf(g.homeId).name)} v ${esc(teamOf(g.awayId).name)}</small></div><span class="so">${x.odds.toFixed(2)}</span><span class="sx nav" data-act="rm:${x.gameId}">✕</span></div>`; }).join('') : '<div class="empty">Tap odds to add selections.<br>One pick per game.</div>'}
      <div class="seg"><span class="nav ${sl.mode === 'acca' ? 'on' : ''}" data-act="mode:acca">Accumulator</span><span class="nav ${sl.mode === 'singles' ? 'on' : ''}" data-act="mode:singles">Singles</span></div>
      <div class="stake"><span class="arr nav" data-act="st:-10">−</span><span class="sv"><b>${fmt(sl.stake)}</b> coins${sl.mode === 'singles' && sl.sels.length > 1 ? ' each' : ''}</span><span class="arr nav" data-act="st:10">+</span></div>
      <div class="chips">${[10, 50, 100, 250, 500].map(v => `<span class="chip nav" data-act="sv:${v}">${v}</span>`).join('')}<span class="chip nav" data-act="sv:max">MAX</span></div>
      <div class="sum"><div><span>${s.bets > 1 || sl.mode === 'singles' ? 'Bets' : 'Total odds'}</span><b>${s.bets > 1 ? s.bets + ' singles' : s.odds ? s.odds.toFixed(2) : '–'}</b></div><div><span>Total stake</span><b>${fmt(s.staked)}</b></div><div><span>Potential return</span><b class="gold">${fmt(s.ret)}</b></div></div>
      <div class="btn nav go" data-act="place">PLACE BET</div>
      ${msg ? `<div class="msg ${msgOk ? 'ok' : 'bad'}">${esc(msg)}</div>` : ''}
      ${open.length ? `<h3 style="margin-top:10px">YOUR OPEN BETS</h3>${open.map(o => `<div class="ob"><span>${o.mode === 'acca' ? o.sels.length + '-fold acca' : esc(pickLabel(md.games.find(q => q.id === o.sels[0].gameId), o.sels[0].market, o.sels[0].pick))}</span><b>${fmt(o.stake)} → ${fmt(Math.floor(o.stake * o.sels.reduce((t, x) => t * x.odds, 1)))}</b></div>`).join('')}` : ''}
      ${canTop ? '<div class="btn nav" data-act="topup" style="margin-top:8px">🪙 Free top-up +300</div>' : ''}</div>`;
  };
  const scr = {
    render: () => {
      const b = active(), all = Bank.openBets().length;
      return `<div class="panel wide book"><div class="title" style="font-size:34px">VIRTUAL SPORTSBOOK <small class="vc">PLAY COINS ONLY · NO REAL MONEY · JUST FOR FUN</small></div>
        <div class="tabs">${Bank.bettors.map(x => `<div class="tab nav ${x.id === b.id ? 'on' : ''}" data-act="b:${x.id}">${esc(x.name)} · ${fmt(x.coins)} 🪙</div>`).join('')}${Bank.bettors.length < MAX_BETTORS ? '<div class="tab nav" data-act="addb">＋ Add friend</div>' : ''}</div>
        <div class="bookgrid"><div><div class="sub" style="margin:0 0 8px;text-align:left">Matchday ${md.number} · 8 virtual games · odds include a 7% bookmaker margin</div><div class="gamegrid scroll">${md.games.map(g => card(g, b)).join('')}</div></div>${slipHtml(b)}</div>
        <div class="actions"><div class="btn nav" data-act="back">← Back</div><div class="btn nav" data-act="rename">✎ ${esc(b.name)}</div><div class="btn nav" data-act="stats">📊 Stats</div>${hook.hasCareer && hook.hasCareer() ? '<div class="btn nav" data-act="fund">🏟 Fund Master League club</div>' : ''}<div class="btn nav go" data-act="play">▶ PLAY MATCHDAY${all ? ` (${all} bet${all > 1 ? 's' : ''} riding)` : ''}</div></div>
        <div class="hint">Click odds to build a slip · type numbers to set your stake · <span class="key">Q</span>/<span class="key">E</span>/<span class="key">Tab</span> switch punter · results are random and the house always has a 7% edge — it's a game, enjoy it</div></div>`;
    },
    typing: false,
    tab: d => { const l = Bank.bettors, i = l.findIndex(x => x.id === activeId); activeId = l[(i + d + l.length) % l.length].id; say(''); api.setFocus(l.findIndex(x => x.id === activeId)); },
    onKey: e => {
      const b = active();
      if (/^(Digit|Numpad)\d$/.test(e.code)) { const d = e.code.slice(-1); b.slip.stake = Math.min(MAX_STAKE, Number(String(b.slip.stake === 50 && !b._typed ? '' : b.slip.stake) + d) || 0); b._typed = true; api.renderScreen(); return true; }
      if (e.code === 'Backspace') { b.slip.stake = Math.floor(b.slip.stake / 10); b._typed = true; api.renderScreen(); return true; }
      return false;
    },
    action: act => {
      const b = active(), [k, x, y, z] = act.split(':');
      if (k === 'back') return api.mainMenu();
      if (k === 'b') { activeId = x; say(''); return api.renderScreen(); }
      if (k === 'addb') { const nb = Bank.add(NAMES[Bank.bettors.length * 2 % NAMES.length]); if (nb) activeId = nb.id; say(''); Sound.confirm(); return api.renderScreen(); }
      if (k === 'o') { const g = md.games.find(q => q.id === x); const r = toggleSel(b.slip, g, y, z); if (r === 'full') say('Max 8 selections per slip', false); else say(''); Bank.save(); return api.renderScreen(); }
      if (k === 'rm') { b.slip.sels = b.slip.sels.filter(s => s.gameId !== x); Bank.save(); return api.renderScreen(); }
      if (k === 'mode') { b.slip.mode = x; Bank.save(); return api.renderScreen(); }
      if (k === 'st') { b.slip.stake = Math.max(MIN_STAKE, Math.min(MAX_STAKE, b.slip.stake + Number(x))); b._typed = false; return api.renderScreen(); }
      if (k === 'sv') { b.slip.stake = x === 'max' ? Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.floor(b.coins / Math.max(1, b.slip.mode === 'singles' ? b.slip.sels.length : 1)))) : Number(x); b._typed = false; return api.renderScreen(); }
      if (k === 'place') { const r = Bank.place(b.id); if (r.ok) { say(`Bet placed! ${r.placed.length > 1 ? r.placed.length + ' singles' : ''} Good luck.`.trim()); Sound.confirm(); } else { say(r.error, false); Sound.back(); } return api.renderScreen(); }
      if (k === 'topup') { if (Bank.topUp(b.id)) say('+300 free coins — spend them wisely!'); return api.renderScreen(); }
      if (k === 'rename') return renameScreen(b.id);
      if (k === 'stats') return statsScreen();
      if (k === 'fund') return hook.fund && hook.fund(b.id);
      if (k === 'play') return liveCentre();
    },
    back: () => api.mainMenu(),
  };
  scr.focus = Bank.bettors.length + 1;
  api.show(scr);
}

// ------------------------------------------------------------------ rename / remove punter
function renameScreen(id) {
  const b = Bank.bettor(id);
  api.show({
    typing: true,
    render: () => `<div class="panel"><div class="title" style="font-size:36px">PUNTER</div><div class="sub">Type a name, press Enter to save</div>
      <input id="nameinput" class="textin" maxlength="14" value="${esc(b.name)}" spellcheck="false" autocomplete="off">
      <div class="actions"><div class="btn nav go" data-act="save">Save</div>${Bank.bettors.length > 1 ? '<div class="btn nav" data-act="del">🗑 Remove this punter</div>' : ''}<div class="btn nav" data-act="back">Cancel</div></div></div>`,
    after: () => { const i = document.getElementById('nameinput'); if (i) { i.focus(); i.select(); i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { Bank.rename(id, i.value.trim() || b.name); sportsbook(); } if (e.key === 'Escape') sportsbook(); }; } },
    action: act => { if (act === 'save') { const i = document.getElementById('nameinput'); Bank.rename(id, (i && i.value.trim()) || b.name); } if (act === 'del') { if (Bank.openBets(id).length) { say('Settle open bets first', false); } else { Bank.remove(id); activeId = null; } } sportsbook(); },
    back: sportsbook,
  });
}

function statsScreen() {
  api.show({
    render: () => `<div class="panel wide"><div class="title" style="font-size:36px">PUNTER STATS</div>
      <table class="tbl">${'<tr><th style="text-align:left">Punter</th><th>Coins</th><th>Bets</th><th>Won</th><th>Lost</th><th>Staked</th><th>Returned</th><th>Profit</th><th>Best win</th></tr>'}
      ${Bank.bettors.map(b => `<tr><td class="tn">${esc(b.name)}</td><td><b>${fmt(b.coins)}</b></td><td>${b.stats.placed}</td><td>${b.stats.won}</td><td>${b.stats.lost}</td><td>${fmt(b.stats.staked)}</td><td>${fmt(b.stats.returned)}</td><td style="color:${b.stats.returned - b.stats.staked >= 0 ? '#6ee7a8' : '#f87171'}">${b.stats.returned - b.stats.staked >= 0 ? '+' : ''}${fmt(b.stats.returned - b.stats.staked)}</td><td>${fmt(b.stats.best)}</td></tr>`).join('')}</table>
      <div class="hint">Play coins have no cash value and cannot be withdrawn. In Master League, 100 coins fund 1M of club budget.</div>
      <div class="actions"><div class="btn nav" data-act="back">← Back</div></div></div>`,
    action: () => sportsbook(), back: sportsbook,
  });
}

// ------------------------------------------------------------------ live match centre
function liveCentre() {
  const md = Bank.matchday(), results = Bank.resolveAll();
  const st = { t: 0, speed: 1, minute: -1, last: performance.now(), done: false, feed: [], live: {}, shown: 0 };
  md.games.forEach(g => { st.live[g.id] = { hg: 0, ag: 0, finished: false, ev: results[g.id].events.slice() }; });
  const bets = () => Bank.openBets();
  const process = m => {
    for (const g of md.games) {
      const L = st.live[g.id];
      while (L.ev.length && L.ev[0].minute <= m) {
        const e = L.ev.shift(); const home = e.side === 'h';
        const og = e.og; if (home !== !!og) L.hg++; else L.ag++;   // own goal counts for the other side
        const t = teamOf(home ? g.homeId : g.awayId);
        st.feed.unshift({ min: e.minute, text: `${og ? 'OWN GOAL' : 'GOAL'}! ${e.name} (${t.short})${e.pen ? ' pen' : ''}`, game: `${teamOf(g.homeId).short} ${L.hg}–${L.ag} ${teamOf(g.awayId).short}` });
        Sound.roar && Sound.roar(); st.goalSound = true;
      }
      if (m >= 90) L.finished = true;
    }
    st.feed = st.feed.slice(0, 9);
  };
  const finish = () => { if (st.done) return; process(90); st.done = true; st.summary = Bank.settle(results); st.doneAt = performance.now(); Sound.whistle(0.4); };
  const row = g => { const L = st.live[g.id], h = teamOf(g.homeId), a = teamOf(g.awayId); return `<div class="lrow ${L.finished ? 'fin' : ''}"><span class="lh">${esc(h.name)}</span><b class="sc">${L.hg} – ${L.ag}</b><span class="la">${esc(a.name)}</span><small>${L.finished ? 'FT' : (st.minute < 0 ? '–' : st.minute + "'")}</small></div>`; };
  const icon = s => s === 'won' ? '✅' : s === 'lost' ? '❌' : '⏳';
  const scoresHtml = () => md.games.map(row).join('');
  const feedHtml = () => st.feed.map(f => `<div class="fe"><b>${f.min}'</b> ${esc(f.text)} <small>${esc(f.game)}</small></div>`).join('') || '<div class="empty">Waiting for the first goal…</div>';
  const betsHtml = () => { const bs = bets(); return Bank.bettors.map(b => { const mine = bs.filter(x => x.bettor === b.id); if (!mine.length) return ''; return `<div class="pb"><b>${esc(b.name)}</b>${mine.map(x => { const s2 = st.done ? x.status : liveBetStatus(x, st.live); const lab = x.mode === 'acca' ? x.sels.length + '-fold' : esc(pickLabel(md.games.find(q => q.id === x.sels[0].gameId), x.sels[0].market, x.sels[0].pick)); return `<div class="ob ${s2}"><span>${icon(s2)} ${lab}</span><b>${fmt(x.stake)} → ${fmt(Math.floor(x.stake * x.sels.reduce((t, y) => t * y.odds, 1)))}</b></div>`; }).join('')}</div>`; }).join('') || '<div class="empty">No bets placed — just watching.</div>'; };
  // only the dynamic regions are repainted, so the buttons never get replaced under the mouse
  const paint = () => {
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('lv-clock', st.done ? 'FULL TIME' : st.minute < 0 ? 'KICK-OFF' : st.minute + "'");
    const pr = document.getElementById('lv-prog'); if (pr) pr.style.width = Math.min(100, Math.max(0, st.minute) / 90 * 100) + '%';
    set('lv-scores', scoresHtml()); set('lv-feed', feedHtml()); set('lv-bets', betsHtml());
    const sp = document.getElementById('lv-speed'); if (sp) sp.textContent = '⏩ ' + st.speed + '×';
    if (st.done) { const bx = document.getElementById('lv-ctl'); if (bx) bx.style.display = 'none'; const rb = document.getElementById('lv-res'); if (rb) rb.style.display = ''; }
  };
  const scr = {
    render: () => `<div class="panel wide"><div class="title" style="font-size:32px">LIVE · MATCHDAY ${md.number}</div>
        <div class="clockbar"><div class="clk" id="lv-clock"></div><div class="prog"><i id="lv-prog"></i></div>
        <span id="lv-ctl" style="display:flex;gap:10px"><div class="btn nav" data-act="speed" id="lv-speed">⏩ 1×</div><div class="btn nav go" data-act="skip">⏭ Skip to full time</div></span></div>
        <div class="hub"><div class="card"><h3>SCORES</h3><div id="lv-scores"></div><h3 style="margin-top:12px">GOALS</h3><div id="lv-feed"></div></div>
        <div class="card"><h3>YOUR BETS</h3><div id="lv-bets"></div></div></div>
        <div class="actions" id="lv-res" style="display:none"><div class="btn nav go" data-act="results">See results & payouts ▶</div></div></div>`,
    after: () => paint(),
    tick: () => {
      if (st.done) { if (performance.now() - st.doneAt > 1800 && !st.went) { st.went = true; resultsScreen(md, st.summary, st.live); } return; }
      const now = performance.now(), dt = Math.min(0.25, (now - st.last) / 1000); st.last = now; st.t += dt * st.speed;
      if (st.minute < 0 && st.t > 0.6) { st.minute = 0; Sound.whistle(0.3); paint(); return; }
      if (st.minute < 0) return;
      const m = Math.min(90, Math.floor((st.t - 0.6) / 0.5));
      if (m !== st.minute) { st.minute = m; process(m); if (m >= 90) finish(); paint(); }
    },
    action: act => { if (act === 'speed') { st.speed = st.speed === 1 ? 3 : st.speed === 3 ? 10 : 1; return paint(); } if (act === 'skip') { st.minute = 90; finish(); return paint(); } if (act === 'results') { st.went = true; return resultsScreen(md, st.summary, st.live); } },
    back: () => { st.minute = 90; finish(); paint(); },
  };
  scr.focus = 0; api.show(scr);
}

function resultsScreen(md, summary, live) {
  const winners = summary.filter(s => s.net > 0);
  if (winners.length) { Sound.roar && Sound.roar(); if (window.Music && Music.sting) Music.sting('goal'); } else if (summary.length) Sound.boo && Sound.boo();
  api.show({
    focus: 0,
    render: () => `<div class="panel wide"><div class="title" style="font-size:34px">FULL TIME · MATCHDAY ${md.number}</div>
      <div class="hub"><div class="card"><h3>RESULTS</h3>${md.games.map(g => `<div class="lrow fin"><span class="lh">${esc(teamOf(g.homeId).name)}</span><b class="sc">${live[g.id].hg} – ${live[g.id].ag}</b><span class="la">${esc(teamOf(g.awayId).name)}</span><small>FT</small></div>`).join('')}</div>
      <div class="card"><h3>PAYOUTS</h3>${summary.length ? summary.map(s => `<div class="pb"><b>${esc(s.bettor.name)}</b> <span class="net ${s.net >= 0 ? 'up' : 'down'}">${s.net >= 0 ? '+' : ''}${fmt(s.net)}</span> <small>balance ${fmt(s.bettor.coins)} 🪙</small>${s.bets.map(x => `<div class="ob ${x.status}"><span>${x.status === 'won' ? '✅' : '❌'} ${x.mode === 'acca' ? x.sels.length + '-fold acca @' + x.sels.reduce((t, y) => t * y.odds, 1).toFixed(2) : esc(pickLabel(md.games.find(q => q.id === x.sels[0].gameId), x.sels[0].market, x.sels[0].pick))}</span><b>${x.status === 'won' ? '+' + fmt(x.ret - x.stake) : '−' + fmt(x.stake)}</b></div>`).join('')}</div>`).join('') : '<div class="empty">No bets were placed on this matchday.</div>'}</div></div>
      <div class="actions"><div class="btn nav go" data-act="next">Next matchday ▶</div><div class="btn nav" data-act="menu">Main menu</div></div></div>`,
    action: act => { if (act === 'next') sportsbook(); else api.mainMenu(); },
    back: () => api.mainMenu(),
  });
}
