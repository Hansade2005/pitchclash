// Crowd, recorded commentary (one line at a time) and synthesised whistle / kick sounds.
import { save } from './data.js';
let ctx = null, master = null, noise = null, manifest = null, amb = null, talking = null, lastSay = 0;
const base = 'assets/commentary/';
fetch(base + 'manifest.json').then(r => r.json()).then(m => { manifest = m; }).catch(() => {});
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = save.settings.sfx; master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolumes() { if (master) master.gain.value = save.settings.sfx; if (amb) amb.volume = 0.35 * save.settings.sfx; }
export function crowd(on) {
  if (on) { if (!amb) { amb = new Audio('assets/audio/stadium_ambience.mp3'); amb.loop = true; } amb.volume = 0.35 * save.settings.sfx; amb.play().catch(() => {}); }
  else if (amb) amb.pause();
}
const one = (file, vol) => { const a = new Audio(file); a.volume = Math.min(1, vol); a.play().catch(() => {}); return a; };
export function cheer(kind) { if (kind === 'goal') { one('assets/audio/crowd_goal.mp3', 0.9 * save.settings.sfx); one('assets/audio/goal_horn.mp3', 0.45 * save.settings.sfx); } else one('assets/audio/crowd_nearmiss.mp3', 0.6 * save.settings.sfx); }
// commentary: big moments interrupt, small ones are skipped while someone is talking
const BIG = ['goal', 'fulltime', 'halftime', 'kickoff', 'intro', 'champions', 'pen_scored', 'pen_missed', 'shootout', 'secondhalf'];
export function say(cat) {
  if (!manifest || save.settings.commentary <= 0) return; const list = manifest.lines[cat]; if (!list || !list.length) return;
  const now = performance.now(), big = BIG.includes(cat); if (talking && !talking.ended && !talking.paused) { if (!big) return; talking.pause(); } else if (!big && now - lastSay < 2500) return;
  lastSay = now; talking = one(base + list[Math.floor(Math.random() * list.length)], save.settings.commentary);
}
export function sayTeam(id) { if (!manifest || save.settings.commentary <= 0 || !manifest.teams[id]) return; if (talking && !talking.ended && !talking.paused) return; talking = one(base + manifest.teams[id], save.settings.commentary); }
function tone(f, dur, type, vol, slide) { const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur); }
function burst(dur, freq, vol) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime; s.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(90, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur); }
export function sfx(n, p = 1) {
  if (!ctx) return;
  if (n === 'kick') { burst(0.12, 700 + p * 500, 0.25 + p * 0.2); tone(110, 0.09, 'sine', 0.3, 0.5); }
  else if (n === 'whistle') { tone(2300, 0.35, 'square', 0.07); tone(2360, 0.35, 'square', 0.05); }
  else if (n === 'whistle2') { [0, 0.42, 0.84].forEach(d => setTimeout(() => { tone(2300, d > 0.8 ? 0.7 : 0.3, 'square', 0.07); }, d * 1000)); }
  else if (n === 'post') tone(520, 0.3, 'triangle', 0.3, 0.7);
  else if (n === 'click') tone(660, 0.05, 'triangle', 0.1); else if (n === 'move') tone(520, 0.03, 'triangle', 0.05);
  else if (n === 'win') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.16), i * 130));
}
