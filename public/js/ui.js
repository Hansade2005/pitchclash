// Gamepad-navigable menus, toasts and banners.
import * as audio from './audio.js';

const $ui = document.getElementById('ui'), $toast = document.getElementById('toast'), $banner = document.getElementById('banner');
let cur = null, focusKey = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// items: { label, value, hint, onClick, onLeft, onRight, cls, disabled, key } | { text, cls } | { html } | { input, value, onInput, placeholder, max } | { row: [items] }
export function menu(m) {
  const same = cur && cur.id === m.id; cur = m;
  const prevScroll = same ? ($ui.querySelector('.items')?.scrollTop || 0) : 0;
  let n = 0; const handlers = [];
  const one = it => {
    if (it.row) return `<div class="row">${it.row.map(one).join('')}</div>`;
    if (it.html != null) return `<div class="raw ${it.cls || ''}">${it.html}</div>`;
    if (it.text != null) return `<div class="text ${it.cls || ''}">${esc(it.text)}</div>`;
    const k = it.key || 'i' + n; n++; handlers.push([k, it]);
    if (it.input) return `<label class="field"><span>${esc(it.label)}</span><input data-k="${k}" maxlength="${it.max || 14}" value="${esc(it.value || '')}" placeholder="${esc(it.placeholder || '')}"></label>`;
    return `<button data-k="${k}" class="${it.cls || ''}" ${it.disabled ? 'disabled' : ''}><span class="l">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>${it.value != null ? `<span class="v">${it.onLeft || it.cycle ? '‹ ' : ''}${esc(it.value)}${it.onLeft || it.cycle ? ' ›' : ''}</span>` : ''}</button>`;
  };
  $ui.innerHTML = `<div class="screen ${m.cls || ''}"><div class="panel">${m.logo ? '<img class="logo" src="assets/logo.png" alt="GOAL NATION 2026">' : m.title ? `<h1>${esc(m.title)}</h1>` : ''}${m.sub ? `<p class="sub">${esc(m.sub)}</p>` : ''}<div class="items">${m.items.filter(Boolean).map(one).join('')}</div>${m.back ? '<div class="foot"><button data-k="__back" class="back">‹ Back</button></div>' : ''}<div class="keys">${m.keys || 'Move: D-pad / stick / arrows &nbsp;·&nbsp; Select: A / Enter &nbsp;·&nbsp; Back: B / Esc'}</div></div></div>`;
  $ui.style.display = 'block';
  for (const [k, it] of handlers) {
    const el = $ui.querySelector(`[data-k="${k}"]`); if (!el) continue; el._it = it;
    if (it.input) { el.addEventListener('input', () => it.onInput(el.value)); continue; }
    el.addEventListener('click', () => { audio.initAudio(); audio.sfx('click'); focusKey = k; (it.onClick || it.onRight || (() => {}))(); });
    el.addEventListener('mouseenter', () => setFocus(el, true));
  }
  const b = $ui.querySelector('[data-k="__back"]'); if (b) { b.addEventListener('click', () => { audio.sfx('click'); m.back(); }); b.addEventListener('mouseenter', () => setFocus(b, true)); }
  const items = $ui.querySelector('.items'); if (items) items.scrollTop = prevScroll;
  let f = same && focusKey ? $ui.querySelector(`[data-k="${focusKey}"]:not([disabled])`) : null;
  if (!f) f = $ui.querySelector('button.primary:not([disabled])') || $ui.querySelector('button:not([disabled])');
  if (f) setFocus(f, true);
}
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

