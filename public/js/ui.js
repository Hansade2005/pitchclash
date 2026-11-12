// DOM user interface: gamepad-navigable menus, in-race HUD, toasts.
import { viewRect } from './race.js';
import * as audio from './audio.js';

const $ui = document.getElementById('ui'), $hud = document.getElementById('hud'), $toast = document.getElementById('toast'), $banner = document.getElementById('banner');
let cur = null, focusKey = null;
// Drawn line icons (24×24, stroke = currentColor)
const P = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
  globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  bolt: P('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  users: P('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>'),
  wrench: P('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.6-.4-.4-2.6z"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  book: P('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  trophy: P('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  flag: P('<path d="M5 21V4M5 4h13l-2.5 4L18 12H5"/>'),
  play: P('<path d="M7 4v16l13-8z"/>'),
  lock: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  timer: P('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  back: P('<path d="M15 18l-6-6 6-6"/>'),
  car: P('<path d="M5 16h14l-1.5-5.5a2 2 0 0 0-1.9-1.5H8.4a2 2 0 0 0-1.9 1.5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>'),
  exit: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  refresh: P('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>'),
};
const STAR = on => `<svg class="star ${on ? 'on' : ''}" viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>`;
export const stars = (n, max = 3) => `<span class="stars">${Array.from({ length: max }, (_, i) => STAR(i < n)).join('')}</span>`;
export const medal = p => `<i class="medal m${Math.min(p, 4)}">${p}</i>`;
export const icon = k => ICONS[k] ? `<i class="ico">${ICONS[k]}</i>` : '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// items: { label, value, hint, onClick, onLeft, onRight, cls, disabled, key } | { text, cls } | { html } | { input, value, onInput, placeholder, max } | { row: [items] }
export function menu(m) {
  const same = cur && cur.id === m.id; cur = m;
  const prevScroll = same ? ($ui.querySelector('.items')?.scrollTop || 0) : 0;
  let n = 0; const handlers = [];
  const one = it => {
    if (it.row) return `<div class="row">${it.row.map(one).join('')}</div>`;
    if (it.card) { const k = it.key || 'i' + n; n++; handlers.push([k, it]);
      return `<button data-k="${k}" class="card ${it.size || ''} ${it.cls || ''}" style="--ac:${it.accent || '#ff7a1a'}" ${it.disabled ? 'disabled' : ''}><span class="art">${it.img ? `<img src="${it.img}" alt="">` : ''}</span><span class="shine"></span><span class="ct">${icon(it.icon)}<b>${esc(it.label)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>${it.badge ? `<em class="badge">${it.badge}</em>` : ''}</button>`; }
    if (it.html != null) return `<div class="raw ${it.cls || ''}">${it.html}</div>`;
    if (it.text != null) return `<div class="text ${it.cls || ''}">${esc(it.text)}</div>`;
    const k = it.key || 'i' + n; n++; handlers.push([k, it]);
    if (it.input) return `<label class="field"><span>${esc(it.label)}</span><input data-k="${k}" maxlength="${it.max || 14}" value="${esc(it.value || '')}" placeholder="${esc(it.placeholder || '')}"></label>`;
    return `<button data-k="${k}" class="${it.cls || ''}${it.icon ? ' hasico' : ''}" ${it.disabled ? 'disabled' : ''}>${icon(it.icon)}<span class="l">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>${it.valueHtml != null ? `<span class="v">${it.valueHtml}</span>` : it.value != null ? `<span class="v">${it.onLeft || it.cycle ? '<i class="arr">‹</i>' : ''}${esc(it.value)}${it.onLeft || it.cycle ? '<i class="arr">›</i>' : ''}</span>` : ''}</button>`;
  };
  $ui.innerHTML = `<div class="screen ${m.cls || ''}"><div class="panel">${m.logo ? '<img class="logo" src="assets/logo.png" alt="APEX CLASH">' : m.title ? `<h1>${esc(m.title)}</h1>` : ''}${m.sub ? `<p class="sub">${esc(m.sub)}</p>` : ''}<div class="items">${group(m.items.filter(Boolean), one)}</div>${m.back ? `<div class="foot"><button data-k="__back" class="back hasico">${icon('back')}<span class="l">Back</span></button></div>` : ''}<div class="keys">${m.keys || 'Move: D-pad / stick / arrows &nbsp;·&nbsp; Select: A / Enter &nbsp;·&nbsp; Back: B / Esc'}</div></div></div>`;
  $ui.style.display = 'block';
  for (const [k, it] of handlers) {
    const el = $ui.querySelector(`[data-k="${k}"]`); if (!el) continue; el._it = it;
    if (it.input) { el.addEventListener('input', () => it.onInput(el.value)); continue; }
    el.addEventListener('click', () => { audio.initAudio(); audio.sfx('click'); focusKey = k; (it.onClick || it.onRight || (() => {}))(); });
    el.addEventListener('mouseenter', () => setFocus(el, true));
  }
  const b = $ui.querySelector('[data-k="__back"]'); if (b) { b.addEventListener('click', () => { audio.sfx('click'); m.back(); }); b.addEventListener('mouseenter', () => setFocus(b, true)); }
  $ui.querySelectorAll('.card').forEach(c => { c.addEventListener('mousemove', e => { const r = c.getBoundingClientRect(); c.style.setProperty('--rx', ((e.clientY - r.top) / r.height - 0.5) * -10 + 'deg'); c.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 12 + 'deg'); }); c.addEventListener('mouseleave', () => { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); }); });
  const items = $ui.querySelector('.items'); if (items) items.scrollTop = prevScroll;
  let f = same && focusKey ? $ui.querySelector(`[data-k="${focusKey}"]:not([disabled])`) : null;
  if (!f) f = $ui.querySelector('button.primary:not([disabled])') || $ui.querySelector('button:not([disabled])');
  if (f) setFocus(f, true);
}
function group(items, one) { let out = '', run = []; const flush = () => { if (run.length) out += `<div class="cards n${run.length}">${run.join('')}</div>`; run = []; };
  for (const it of items) { if (it.card) run.push(one(it)); else { flush(); out += one(it); } } flush(); return out; }
export function hideMenu() { cur = null; $ui.innerHTML = ''; $ui.style.display = 'none'; }
export const menuId = () => cur && cur.id;
function setFocus(el, quiet) {
  $ui.querySelectorAll('.focus').forEach(e => e.classList.remove('focus'));
  el.classList.add('focus'); focusKey = el.dataset.k; if (!(document.activeElement instanceof HTMLInputElement) || el.tagName === 'INPUT') el.focus({ preventScroll: false });
  if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); if (!quiet) audio.sfx('move');
}
// Handle a navigation event ('up','down','left','right','ok','back')
export function nav(ev) {
  if (!cur) return;
  const f = $ui.querySelector('.focus'), it = f && f._it;
  if (ev === 'back') { if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur(); else if (cur.back) { audio.sfx('click'); cur.back(); } return; }
  if (ev === 'ok') { if (f && f.tagName === 'BUTTON') f.click(); return; }
  if (it && ev === 'left' && it.onLeft) { audio.sfx('click'); it.onLeft(); return; }
  if (it && ev === 'right' && (it.onRight || it.cycle)) { audio.sfx('click'); (it.onRight || it.onClick)(); return; }
  const els = [...$ui.querySelectorAll('button:not([disabled]), input')]; if (!els.length) return;
  if (!f) return setFocus(els[0]);
  const r = f.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, bs = 1e9;
  for (const e of els) {
    if (e === f) continue; const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
    const p = ev === 'up' ? -dy : ev === 'down' ? dy : ev === 'left' ? -dx : dx, o = (ev === 'up' || ev === 'down') ? Math.abs(dx) : Math.abs(dy);
    if (p < 6) continue; const s = p + o * 2.2; if (s < bs) { bs = s; best = e; }
  }
  if (best) setFocus(best);
}
let toastT = 0;
export function toast(t) { $toast.textContent = t; $toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $toast.classList.remove('on'), 2600); }
export function banner(t) { $banner.textContent = t; $banner.classList.add('on'); setTimeout(() => $banner.classList.remove('on'), 2600); }
export function loading(p, text) { const l = document.getElementById('loading'); if (p >= 1) { l.style.display = 'none'; return; } l.style.display = 'flex'; l.querySelector('i').style.width = (p * 100).toFixed(0) + '%'; if (text) l.querySelector('span').textContent = text; }

// ---------------- HUD ----------------
let huds = [], mapBase = null, mapT = null, mapS = 1, mapOx = 0, mapOz = 0;
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
export const fmtTime = fmt;
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
export const ordinal = ord;
export function hudLayout(n, T, rule) {
  $hud.innerHTML = ''; huds = []; $hud.style.display = 'block';
  const S = 150; mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = S; mapT = T;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (let i = 0; i < T.N; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); }
  mapS = (S - 24) / Math.max(maxX - minX, maxZ - minZ); mapOx = (S - (maxX - minX) * mapS) / 2 - minX * mapS; mapOz = (S - (maxZ - minZ) * mapS) / 2 - minZ * mapS;
  const g = mapBase.getContext('2d'); g.lineJoin = 'round';
  if (T.cut) { const C = T.cut; g.setLineDash([4, 4]); g.lineWidth = 3; g.strokeStyle = '#ffb21a'; g.beginPath(); g.moveTo(S - (C.x[0] * mapS + mapOx), C.z[0] * mapS + mapOz); g.lineTo(S - (C.x[C.n] * mapS + mapOx), C.z[C.n] * mapS + mapOz); g.stroke(); g.setLineDash([]); }
  for (const [w, c] of [[7, 'rgba(0,0,0,0.6)'], [4, 'rgba(255,255,255,0.92)']]) { g.beginPath(); for (let i = 0; i <= T.N; i += 3) { const k = i % T.N, x = S - (T.x[k] * mapS + mapOx), y = T.z[k] * mapS + mapOz; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.lineWidth = w; g.strokeStyle = c; g.stroke(); }
  for (let i = 0; i < n; i++) {
    const r = viewRect(i, n), d = document.createElement('div'); d.className = 'hudv' + (n > 1 ? ' small' : '') + (n > 2 ? ' tiny' : '');
    d.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
    d.innerHTML = `<div class="pos"><b></b><span></span></div><div class="lap"></div><div class="info"></div><div class="speed"><b>0</b><span>km/h</span><div class="nitro"><i></i></div><em>NITRO</em><div class="clean"><i></i><span>CLEAN DRIVING</span></div></div><div class="feed"></div><div class="speedfx"></div><div class="lights"><i></i><i></i><i></i><i></i><i></i></div><div class="big"></div><div class="msg"></div><div class="arms"><div class="hp"><i></i></div><div class="wpn"></div></div><div class="bust"><span>POLICE</span><div><i></i></div></div><canvas class="map" width="${S}" height="${S}"></canvas><div class="board"></div>`;
    $hud.appendChild(d);
    const q = s => d.querySelector(s);
    huds.push({ d, pos: q('.pos b'), tot: q('.pos span'), lap: q('.lap'), info: q('.info'), kmh: q('.speed b'), nitro: q('.nitro i'), nbox: q('.nitro'), big: q('.big'), msg: q('.msg'), lights: q('.lights'), speedfx: q('.speedfx'), feed: q('.feed'), clean: q('.clean'), cleani: q('.clean i'), arms: q('.arms'), hp: q('.hp i'), wpn: q('.wpn'), bust: q('.bust'), busti: q('.bust i'), gauge: q('.speed'), map: q('.map').getContext('2d'), board: q('.board'), c: {}, f: 0 });
  }
}
// reward feed: short stacked call-outs (NEAR MISS +NITRO, TAKEDOWN! +BOOST ...)
export function feed(i, label, sub, hot) {
  const h = huds[i]; if (!h) return; const e = document.createElement('div'); e.className = hot ? 'hot' : '';
  e.innerHTML = `${esc(label)}${sub ? `<b>${esc(sub)}</b>` : ''}`; h.feed.prepend(e);
  while (h.feed.children.length > 4) h.feed.lastChild.remove(); setTimeout(() => e.remove(), 2300);
}
export function hudClear() { $hud.innerHTML = ''; huds = []; $hud.style.display = 'none'; }
export function hudVisible(v) { $hud.style.visibility = v ? 'visible' : 'hidden'; }
const hex = c => '#' + c.toString(16).padStart(6, '0');
export function hud(i, s) {
  const h = huds[i]; if (!h) return; const c = h.c;
  const set = (k, el, v, html) => { if (c[k] !== v) { c[k] = v; html ? (el.innerHTML = v) : (el.textContent = v); } };
  set('pos', h.pos, ord(s.pos)); set('tot', h.tot, '/' + s.total);
  set('lap', h.lap, (s.lapRule ? `LAP ${s.lap}/${s.laps}  ·  ` : '') + fmt(s.time) + (s.best ? `  ·  BEST ${fmt(s.best)}` : ''));
  set('info', h.info, s.info); if (c.danger !== s.danger) { c.danger = s.danger; h.info.classList.toggle('danger', !!s.danger); }
  set('kmh', h.kmh, Math.round(s.kmh));
  const nw = Math.round(s.nitro * 100); if (c.nw !== nw) { c.nw = nw; h.nitro.style.width = nw + '%'; }
  if (c.boost !== s.boosting) { c.boost = s.boosting; h.nbox.classList.toggle('on', !!s.boosting); }
  if (c.big !== s.big) { c.big = s.big; h.big.textContent = s.big; h.big.classList.remove('pop'); void h.big.offsetWidth; if (s.big) h.big.classList.add('pop'); }
  set('msg', h.msg, s.msg);
  const cw = s.clean < 0 ? -1 : Math.round(Math.min(1, s.clean) * 50) * 2; if (c.cw !== cw) { c.cw = cw; h.clean.style.visibility = cw < 0 ? 'hidden' : 'visible'; h.cleani.style.width = Math.max(0, cw) + '%'; h.clean.classList.toggle('full', cw >= 80); }
  if (c.surge !== s.surge) { c.surge = s.surge; h.gauge.classList.toggle('surge', !!s.surge); }
  const bl = Math.round(Math.min(1, s.blur || 0) * 20) / 20; if (c.bl !== bl) { c.bl = bl; h.speedfx.style.opacity = bl; }
  const lit = s.count < 0 ? -1 : s.count > 3 ? 0 : Math.min(5, Math.floor((3 - s.count) / 3 * 5) + 1);
  if (c.lit !== lit) { c.lit = lit; h.lights.style.display = lit < 0 ? 'none' : 'flex'; [...h.lights.children].forEach((e, k) => e.classList.toggle('on', k < lit)); }
  const arms = s.hp != null; if (c.arms !== arms) { c.arms = arms; h.arms.style.display = arms ? 'block' : 'none'; }
  if (arms) { const hw = Math.round(s.hp); if (c.hw !== hw) { c.hw = hw; h.hp.style.width = hw + '%'; h.hp.style.background = hw > 50 ? '#3df58a' : hw > 25 ? '#ffc21f' : '#ff3b30'; } set('wpn', h.wpn, s.weapon); }
  const bw = s.bust == null ? -1 : Math.round(Math.min(1, s.bust) * 100); if (c.bw !== bw) { c.bw = bw; h.bust.style.display = bw > 3 ? 'block' : 'none'; h.busti.style.width = bw + '%'; }
  const gp = Math.round(Math.min(1, s.kmh / 340) * 100); if (c.gp !== gp) { c.gp = gp; h.gauge.style.setProperty('--p', gp); }
  if (s.board) {
    const html = s.board.slice(0, 8).map((v, k) => `<div class="${v === s.me ? 'me' : ''} ${v.eliminated ? 'out' : ''}"><b>${k + 1}</b><i style="background:${hex(v.color)}"></i>${esc(v.name)}${s.rule === 'orbs' ? `<u>${v.score}</u>` : ''}</div>`).join('');
    set('board', h.board, html, true);
  }
  if (++h.f % 2 === 0 && mapBase) {
    const g = h.map; g.clearRect(0, 0, 150, 150); g.drawImage(mapBase, 0, 0);
    for (const v of s.vehicles) { if (v.eliminated || v.inactive || v === s.me || v.type === 'traffic') continue; g.fillStyle = v.cop ? (h.f % 8 < 4 ? '#ff2020' : '#2060ff') : hex(v.color); g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(150 - (v.x * mapS + mapOx), v.z * mapS + mapOz, 3.4, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = '#ffe14a'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(150 - (s.me.x * mapS + mapOx), s.me.z * mapS + mapOz, 5, 0, 7); g.fill(); g.stroke();
  }
}
