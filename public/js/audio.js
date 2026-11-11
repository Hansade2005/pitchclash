// Synthesised engine + sound effects (WebAudio) and a small music playlist.
import { save } from './data.js';
let ctx = null, master = null, noiseBuf = null, skidGain = null, musicEl = null, trackI = 0;
const engines = [];
export const MUSIC = [
  { file: 'synthwave_2138139.mp3', title: 'The Synthwave Electronic', artist: 'Sevennotes' },
  { file: 'drive_1267753.mp3', title: 'Ghosts', artist: 'Lyvo' },
  { file: 'rock_1206517.mp3', title: 'DJ Smallest - Chill', artist: 'Smallest' },
];
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = save.settings.sfx; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 2.5;
  skidGain = ctx.createGain(); skidGain.gain.value = 0; src.connect(bp).connect(skidGain).connect(master); src.start();
  startMusic();
}
export function setVolumes() { if (master) master.gain.value = save.settings.sfx; if (musicEl) musicEl.volume = save.settings.music; }
function startMusic() {
  if (musicEl) return;
  musicEl = new Audio(); musicEl.volume = save.settings.music;
  const next = () => { trackI = (trackI + 1) % MUSIC.length; musicEl.src = 'assets/music/' + MUSIC[trackI].file; musicEl.play().catch(() => {}); };
  musicEl.addEventListener('ended', next); trackI = Math.floor(Math.random() * MUSIC.length) - 1; next();
}
function voice() {
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g).connect(master); o1.start(); o2.start(); return { o1, o2, f, g };
}
// i: local player slot, s: speed fraction 0..1.2, load: throttle 0..1, bike: higher pitch
export function engine(i, s, load, bike, boost) {
  if (!ctx) return; const v = engines[i] || (engines[i] = voice()), t = ctx.currentTime;
  const gs = Math.min(0.999, Math.max(0, s)) * 5, gear = Math.floor(gs), rpm = gear === 0 ? gs : 0.35 + 0.65 * (gs - gear);
  const f = (bike ? 85 : 52) + rpm * (bike ? 240 : 150) + gear * 6 + (boost ? 25 : 0);
  v.o1.frequency.setTargetAtTime(f, t, 0.05); v.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  v.f.frequency.setTargetAtTime(350 + rpm * 1500 + load * 700, t, 0.05); v.g.gain.setTargetAtTime(0.035 + load * 0.045 + (boost ? 0.03 : 0), t, 0.08);
}
export function silence() { if (!ctx) return; if (sirenV) sirenV.gain.setTargetAtTime(0, ctx.currentTime, 0.05); for (const v of engines) if (v) v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); if (skidGain) skidGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }
let sirenV = null;
export function siren(level) {
  if (!ctx) return;
  if (!sirenV) { const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 760; l.frequency.value = 1.6; lg.gain.value = 190; l.connect(lg).connect(o.frequency); g.gain.value = 0; o.connect(g).connect(master); o.start(); l.start(); sirenV = g; }
  sirenV.gain.setTargetAtTime(level * 0.05, ctx.currentTime, 0.1);
}
export function skid(level) { if (skidGain) skidGain.gain.setTargetAtTime(Math.min(0.22, level), ctx.currentTime, 0.06); }
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur);
}
function burst(dur, freq, vol) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime; s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur);
}
export function sfx(name, p = 1) {
  if (!ctx) return;
  if (name === 'beep') tone(440, 0.18, 'square', 0.12); else if (name === 'go') tone(880, 0.5, 'square', 0.14);
  else if (name === 'hit') burst(0.3, 900 + p * 60, Math.min(0.5, 0.1 + p * 0.02));
  else if (name === 'orb') { tone(880, 0.1, 'sine', 0.18); setTimeout(() => tone(1320, 0.16, 'sine', 0.18), 70); }
  else if (name === 'nitro') burst(0.6, 3000, 0.2);
  else if (name === 'click') tone(660, 0.05, 'triangle', 0.1); else if (name === 'move') tone(520, 0.03, 'triangle', 0.05);
  else if (name === 'out') tone(300, 0.6, 'sawtooth', 0.15, 0.3); else if (name === 'win') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.16), i * 130));
  else if (name === 'gun') burst(0.07, 2600, 0.12); else if (name === 'rocket') { burst(0.5, 1800, 0.22); tone(180, 0.4, 'sawtooth', 0.08, 2.5); } else if (name === 'boom') burst(0.7, 500, Math.min(0.6, 0.15 + p * 0.45));
  else if (name === 'lap') tone(700, 0.12, 'triangle', 0.14, 1.5);
}
