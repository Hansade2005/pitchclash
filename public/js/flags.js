// Simple hand-drawn flags on canvas.
const cache = {};
export function drawFlag(g, team, w, h) {
  const f = team.flag, t = f[0], cols = f.slice(1);
  const star = (cx, cy, r, c) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  if (t === 'v') cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / cols.length, 0, w / cols.length + 1, h); });
  else if (t === 'h') cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * h / cols.length, w, h / cols.length + 1); });
  else if (t === 'br') { g.fillStyle = '#009c3b'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffdf00'; g.beginPath(); g.moveTo(w / 2, h * 0.1); g.lineTo(w * 0.92, h / 2); g.lineTo(w / 2, h * 0.9); g.lineTo(w * 0.08, h / 2); g.fill(); g.fillStyle = '#002776'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.22, 0, 7); g.fill(); }
  else if (t === 'jp') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#bc002d'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.3, 0, 7); g.fill(); }
  else if (t === 'eng') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ce1124'; g.fillRect(w / 2 - h * 0.09, 0, h * 0.18, h); g.fillRect(0, h / 2 - h * 0.09, w, h * 0.18); }
  else if (t === 'us') { for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(0, i * h / 7, w, h / 7 + 1); } g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, w * 0.42, h * 4 / 7); for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) star(w * 0.06 + x * w * 0.1, h * 0.1 + y * h * 0.17, h * 0.05, '#fff'); }
  else if (t === 'crest') { g.clearRect(0, 0, w, h); g.fillStyle = '#10131d'; g.fillRect(0, 0, w, h); const x0 = w * 0.26, x1 = w * 0.74; g.beginPath(); g.moveTo(x0, h * 0.08); g.lineTo(x1, h * 0.08); g.lineTo(x1, h * 0.55); g.quadraticCurveTo(x1, h * 0.85, w / 2, h * 0.95); g.quadraticCurveTo(x0, h * 0.85, x0, h * 0.55); g.closePath(); g.save(); g.clip(); g.fillStyle = cols[0]; g.fillRect(0, 0, w, h); g.fillStyle = cols[1]; g.fillRect(w / 2 - w * 0.06, 0, w * 0.12, h); g.fillRect(0, h * 0.42, w, h * 0.1); g.restore(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
  if (team.star) star(w / 2, h / 2, h * 0.2, team.star);
}
export function flagCanvas(team, w = 96, h = 64) { const c = document.createElement('canvas'); c.width = w; c.height = h; drawFlag(c.getContext('2d'), team, w, h); return c; }
export function flagURL(team) { return team.badge || cache[team.id] || (cache[team.id] = flagCanvas(team).toDataURL()); }
