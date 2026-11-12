// Match-day sound: Pitch Clash crowd recordings, two-voice recorded commentary (lead + colour), chants,
// kick-off jingle, decisive sting, the original generative music from Pitch Clash (js/music.js), and synthesised whistles/kicks.
import { save } from './data.js';
let ctx = null, master = null, crowdBus = null, sfxBus = null, musicBus = null, noise = null, manifest = null, pro = null;
const buf = {}, base = 'assets/commentary/';
fetch(base + 'manifest.json').then(r => r.json()).then(m => { manifest = m; }).catch(() => {});
fetch('assets/audio/pro.json').then(r => r.json()).then(m => { pro = m.lines.goal_pro; }).catch(() => {});
const FILES = ['stadium_ambience', 'crowd_cheer', 'chant_stomps', 'jingle_kickoff', 'sting_decisive', 'crowd_goal', 'crowd_nearmiss', 'crowd_nearmiss_fk', 'goal_horn', 'goal_stadium', 'goal_cheer2'];
const S = () => save.settings;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.connect(ctx.destination);
  crowdBus = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain(); crowdBus.connect(master); sfxBus.connect(master); musicBus.connect(master); setVolumes();
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const f of FILES) fetch('assets/audio/' + f + '.mp3').then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).then(b => { buf[f] = b; if (f === 'stadium_ambience' && wantBed) crowd(true); }).catch(() => {});
  if (window.Music) { try { Music.attach(ctx, musicBus); if (musicMode) { const m = musicMode; musicMode = null; music(m); } } catch (e) { console.warn(e); } }
}
export function setVolumes() { if (!ctx) return; crowdBus.gain.value = S().sfx; sfxBus.gain.value = S().sfx; musicBus.gain.value = S().music ?? 0.5; }
function play(name, bus, gain = 1, loop = false) {
  if (!ctx || !buf[name]) return null; const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf[name]; s.loop = loop; g.gain.value = gain; s.connect(g).connect(bus); s.start(); return { s, g };
}
// stadium bed + chants
let bed = null, wantBed = false, stomp = null;
export function crowd(on) {
  wantBed = on; if (!ctx) return;
  if (on && !bed) bed = play('stadium_ambience', crowdBus, 0.45, true);
  if (!on && bed) { const b = bed; bed = null; b.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { b.s.stop(); } catch (e) {} }, 2000); chant(false); }
}
export function chant(on) {
  if (!ctx) return;
  if (on && !stomp) { stomp = play('chant_stomps', crowdBus, 0, true); if (stomp) stomp.g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.8); }
  else if (!on && stomp) { const s = stomp; stomp = null; s.g.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => { try { s.s.stop(); } catch (e) {} }, 3000); }
}
// crowd reactions
export function cheer(kind) {
  if (kind === 'goal') { play('crowd_goal', crowdBus, 0.95); play('goal_horn', crowdBus, 0.45); play(Math.random() < 0.5 ? 'goal_stadium' : 'goal_cheer2', crowdBus, 0.7); }
  else if (kind === 'chance') play('crowd_cheer', crowdBus, 0.6);
  else if (kind === 'nearfk') play('crowd_nearmiss_fk', crowdBus, 0.7);
  else play('crowd_nearmiss', crowdBus, 0.65);
}
export function jingle() { play('jingle_kickoff', musicBus, 0.8); }
export function decisive() { play('sting_decisive', musicBus, 0.9); }
// commentary: a lead commentator and a colour commentator; big moments interrupt, small ones wait their turn
const BIG = ['goal', 'goal_pro', 'fulltime', 'halftime', 'kickoff', 'intro', 'champions', 'pen_scored', 'pen_missed', 'shootout', 'secondhalf', 'extratime', 'red', 'penalty', 'winner'];
let talking = null, lastTalk = 0, queue = [];
const pick = l => l[Math.floor(Math.random() * l.length)];
function voice(file) {
  const a = new Audio(file); a.volume = Math.min(1, S().commentary); talking = a; lastTalk = performance.now();
  a.onended = () => { if (talking === a) talking = null; const n = queue.shift(); if (n) setTimeout(() => { if (!busy()) voice(n); }, 250); };
  a.play().catch(() => { talking = null; });
}
const busy = () => talking && !talking.ended && !talking.paused;
export function say(cat, colour) {
  if (!manifest || S().commentary <= 0) return;
  const file = cat === 'goal_pro' ? (pro && 'assets/audio/' + pick(pro)) : manifest.lines[cat] && base + pick(manifest.lines[cat]); if (!file) return;
  const big = BIG.includes(cat);
  if (busy()) { if (!big) return; talking.pause(); queue = []; } else if (!big && performance.now() - lastTalk < 2200) return;
  voice(file);
  const co = colour && manifest.lines[colour]; if (co && Math.random() < 0.6) queue.push(base + pick(co));
}
// team-name call, queued after the current line (e.g. "GOAL!" ... "Cameroon!")
export function sayTeam(key) {
  if (!manifest || S().commentary <= 0 || !manifest.teams[key]) return; const f = base + manifest.teams[key];
  if (busy()) { queue.unshift(f); return; } voice(f);
}
// colour-man small talk when the play goes quiet
export function chatter() { if (!manifest || S().commentary <= 0 || busy() || performance.now() - lastTalk < 15000) return; voice(base + pick(manifest.lines[Math.random() < 0.6 ? 'chatter' : 'colour'])); }
export const quietFor = () => performance.now() - lastTalk;
export const teamKey = t => { if (!manifest) return t.id; if (manifest.teams[t.id]) return t.id; const k = t.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return manifest.teams[k] ? k : t.id; };
// music: Pitch Clash's original generative playlist, walk-out theme and stings
let musicMode = null;
export function music(mode) {
  if (!ctx || !window.Music) { musicMode = mode; return; }
  if (mode === musicMode) return; musicMode = mode;
  try { if (mode === 'menu') Music.start(); else if (mode === 'walkout') Music.walkout(); else Music.stop(1.2); } catch (e) {}
}
export function sting(kind) { if (ctx && window.Music) { try { Music.sting(kind); } catch (e) {} } }
function tone(f, dur, type, vol, slide) { const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur); }
function burst(dur, freq, vol) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime; s.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(90, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(sfxBus); s.start(t); s.stop(t + dur); }
export function sfx(n, p = 1) {
  if (!ctx) return;
  if (n === 'kick') { burst(0.12, 700 + p * 500, 0.25 + p * 0.2); tone(110, 0.09, 'sine', 0.3, 0.5); }
  else if (n === 'whistle') { tone(2300, 0.35, 'square', 0.07); tone(2360, 0.35, 'square', 0.05); }
  else if (n === 'whistle2') { [0, 0.42, 0.84].forEach(d => setTimeout(() => { tone(2300, d > 0.8 ? 0.7 : 0.3, 'square', 0.07); }, d * 1000)); }
  else if (n === 'post') tone(520, 0.3, 'triangle', 0.3, 0.7);
  else if (n === 'click') tone(660, 0.05, 'triangle', 0.1); else if (n === 'move') tone(520, 0.03, 'triangle', 0.05);
  else if (n === 'win') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.16), i * 130));
}
