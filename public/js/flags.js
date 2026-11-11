// Simple hand-drawn flags (canvas), so they look the same on every system.
const cache = {};
export function drawFlag(g, id, w, h) {
  const v = (cols) => cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / cols.length, 0, w / cols.length + 1, h); });
  const hz = (cols) => cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * h / cols.length, w, h / cols.length + 1); });
  const star = (cx, cy, r, c) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  if (id === 'cm') { v(['#007a5e', '#ce1126', '#fcd116']); star(w / 2, h / 2, h * 0.2, '#fcd116'); }
  else if (id === 'us') { hz(['#b22234', '#fff', '#b22234', '#fff', '#b22234', '#fff', '#b22234']); g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.42, h * 4 / 7); for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) star(w * 0.06 + x * w * 0.1, h * 0.1 + y * h * 0.17, h * 0.05, '#fff'); }
  else if (id === 'br') { g.fillStyle = '#009c3b'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffdf00'; g.beginPath(); g.moveTo(w / 2, h * 0.1); g.lineTo(w * 0.92, h / 2); g.lineTo(w / 2, h * 0.9); g.lineTo(w * 0.08, h / 2); g.fill(); g.fillStyle = '#002776'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.22, 0, 7); g.fill(); }
  else if (id === 'fr') v(['#0055a4', '#fff', '#ef4135']);
  else if (id === 'it') v(['#009246', '#fff', '#ce2b37']);
  else if (id === 'jp') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#bc002d'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.3, 0, 7); g.fill(); }
  else if (id === 'ae') { hz(['#00732f', '#fff', '#000']); g.fillStyle = '#ff0000'; g.fillRect(0, 0, w * 0.27, h); }
  else if (id === 'uk') { g.fillStyle = '#012169'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = h * 0.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); g.strokeStyle = '#c8102e'; g.lineWidth = h * 0.08; g.stroke(); g.fillStyle = '#fff'; g.fillRect(w / 2 - h * 0.17, 0, h * 0.34, h); g.fillRect(0, h / 2 - h * 0.17, w, h * 0.34); g.fillStyle = '#c8102e'; g.fillRect(w / 2 - h * 0.1, 0, h * 0.2, h); g.fillRect(0, h / 2 - h * 0.1, w, h * 0.2); }
}
export function flagCanvas(id, w = 96, h = 64) { const c = document.createElement('canvas'); c.width = w; c.height = h; drawFlag(c.getContext('2d'), id, w, h); return c; }
export function flagURL(id) { return cache[id] || (cache[id] = flagCanvas(id).toDataURL()); }
