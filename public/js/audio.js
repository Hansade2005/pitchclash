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
  loadLoops();
  startMusic();
}
export function setVolumes() { if (master) master.gain.value = save.settings.sfx; if (musicEl) musicEl.volume = save.settings.music; }
function startMusic() {
  if (musicEl) return;
  musicEl = new Audio(); musicEl.volume = save.settings.music;
  const next = () => { trackI = (trackI + 1) % MUSIC.length; musicEl.src = 'assets/music/' + MUSIC[trackI].file; musicEl.play().catch(() => {}); };
  musicEl.addEventListener('ended', next); trackI = Math.floor(Math.random() * MUSIC.length) - 1; next();
}
// ---- engines: real recorded engine loops (cars, bikes, boats) and synthesised rotors / propellers / thrusters
const loops = {};
function loadLoops() { for (const n of ['engine_loop', 'engine_low_loop']) fetch('assets/audio/' + n + '.wav').then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).then(b => { loops[n] = b; }).catch(() => {}); }
function makeVoice(kind) {
  const t = ctx.currentTime, out = ctx.createGain(), v = { kind, out, nodes: [] }; out.gain.value = 0; out.connect(master);
  const loopSrc = n => { const b = loops[n]; if (!b) return null; const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(t, Math.random() * b.duration); v.nodes.push(s); return s; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); v.nodes.push(o); return o; };
  const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); v.nodes.push(s); return s; };
  const filt = (type, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const gain = g => { const x = ctx.createGain(); x.gain.value = g; return x; };
  if (kind === 'car' || kind === 'bike' || kind === 'boat') {
    v.src = loopSrc(kind === 'boat' ? 'engine_low_loop' : 'engine_loop'); v.lp = filt('lowpass', 1200);
    if (v.src) { if (kind === 'bike') v.src.connect(filt('highpass', 280)).connect(v.lp); else v.src.connect(v.lp); }
    v.lp.connect(out);
    v.sub = osc(kind === 'bike' ? 'square' : 'sine', 50);   // body: deep rumble for cars, raspy buzz for bikes
    v.sub.connect(filt(kind === 'bike' ? 'bandpass' : 'lowpass', kind === 'bike' ? 950 : 170, kind === 'bike' ? 1.6 : 0.7)).connect(gain(kind === 'bike' ? 0.06 : 0.32)).connect(out);
    if (kind === 'boat') { v.wash = gain(0.05); noise().connect(filt('lowpass', 650)).connect(v.wash).connect(out); }
  } else if (kind === 'heli') {
    const am = gain(0.5); v.lfo = osc('sawtooth', 11); v.lfo.connect(gain(0.5)).connect(am.gain); noise().connect(filt('lowpass', 380)).connect(am).connect(out);   // blade slap
    v.whine = osc('sine', 3000); v.whine.connect(gain(0.012)).connect(out);   // turbine
    v.body = osc('triangle', 60); v.body.connect(gain(0.1)).connect(out);
  } else if (kind === 'plane') {
    const pg = gain(0.28); v.prop = osc('sawtooth', 90); v.pf = filt('lowpass', 520, 1.2); v.prop.connect(v.pf).connect(pg).connect(out);
    v.am = osc('sine', 18); v.am.connect(gain(0.1)).connect(pg.gain);
    v.src = loopSrc('engine_low_loop'); if (v.src) v.src.connect(filt('lowpass', 450)).connect(gain(0.55)).connect(out);   // radial-engine rumble
  } else {   // spaceship: detuned synth hum + rushing air
    v.o1 = osc('sawtooth', 55); v.o2 = osc('sawtooth', 55.6); v.sf = filt('lowpass', 400, 4); v.o1.connect(v.sf); v.o2.connect(v.sf); v.sf.connect(gain(0.15)).connect(out);
    v.air = gain(0); noise().connect(filt('bandpass', 1200, 0.6)).connect(v.air).connect(out);
  }
  v.needsLoop = (kind === 'car' || kind === 'bike' || kind === 'boat' || kind === 'plane') && !v.src;
  return v;
}
function killVoice(v) { v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { for (const n of v.nodes) { try { n.stop(); } catch (e) {} } try { v.out.disconnect(); } catch (e) {} }, 400); }
// i: voice slot (local players 0-3, 9 = nearest rival), s: speed fraction 0..1.2, load: throttle 0..1, kind: vehicle class, vol: extra volume (distance)
export function engine(i, s, load, kind = 'car', boost = false, vol = 1) {
  if (!ctx) return; let v = engines[i];
  if (!v || v.kind !== kind || (v.needsLoop && loops.engine_loop)) { if (v) killVoice(v); v = engines[i] = makeVoice(kind); }
  const t = ctx.currentTime, sp = Math.max(0, Math.min(1.2, s)), set = (p, x, k = 0.06) => p && p.setTargetAtTime(x, t, k);
  if (kind === 'car' || kind === 'bike') {
    const G = kind === 'bike' ? 6 : 5, gs = Math.min(0.999, sp) * G, gear = Math.floor(gs), r = Math.min(1, (gear === 0 ? gs : 0.32 + 0.68 * (gs - gear)) + (boost ? 0.08 : 0));
    set(v.src && v.src.playbackRate, kind === 'bike' ? 0.85 + r * 1.55 + gear * 0.03 : 0.5 + r * 1.05 + gear * 0.035);
    set(v.lp.frequency, (kind === 'bike' ? 1400 : 700) + load * 2600 + r * 1800); set(v.sub.frequency, kind === 'bike' ? 90 + r * 260 : 36 + r * 70);
    set(v.out.gain, (0.16 + load * 0.2 + (boost ? 0.05 : 0)) * (kind === 'bike' ? 0.9 : 1) * vol, 0.08);
  } else if (kind === 'boat') {
    set(v.src && v.src.playbackRate, 0.55 + sp * 0.75); set(v.lp.frequency, 500 + load * 1500 + sp * 600); set(v.sub.frequency, 32 + sp * 40); set(v.wash.gain, 0.04 + sp * 0.3); set(v.out.gain, (0.2 + load * 0.15) * vol, 0.08);
  } else if (kind === 'heli') {
    set(v.lfo.frequency, 9 + sp * 5 + load * 2); set(v.whine.frequency, 2600 + sp * 900); set(v.body.frequency, 55 + sp * 22); set(v.out.gain, (0.22 + load * 0.08) * vol, 0.1);
  } else if (kind === 'plane') {
    set(v.prop.frequency, 70 + sp * 90 + load * 20); set(v.pf.frequency, 380 + load * 700); set(v.am.frequency, 12 + sp * 14); set(v.src && v.src.playbackRate, 0.45 + sp * 0.5); set(v.out.gain, (0.18 + load * 0.1) * vol, 0.1);
  } else {
    set(v.o1.frequency, 45 + sp * 70); set(v.o2.frequency, (45 + sp * 70) * 1.012); set(v.sf.frequency, 300 + sp * 1600 + load * 800); set(v.air.gain, sp * 0.16 + (boost ? 0.1 : 0)); set(v.out.gain, 0.2 * vol, 0.1);
  }
}
export function silence() { if (!ctx) return; if (sirenV) sirenV.gain.setTargetAtTime(0, ctx.currentTime, 0.05); for (const v of engines) if (v) v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); if (skidGain) skidGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }
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
