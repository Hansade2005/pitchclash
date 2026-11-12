// Synthesised engine + sound effects (WebAudio) and a small music playlist.
import { save } from './data.js';
let ctx = null, master = null, engBus = null, noiseBuf = null, skidGain = null, musicEl = null, trackI = 0;
const engines = [];
export const MUSIC = [
  { file: 'synthwave_2138139.mp3', title: 'The Synthwave Electronic', artist: 'Sevennotes' },
  { file: 'drive_1267753.mp3', title: 'Ghosts', artist: 'Lyvo' },
  { file: 'rock_1206517.mp3', title: 'DJ Smallest - Chill', artist: 'Smallest' },
];
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = save.settings.sfx; const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; master.connect(comp).connect(ctx.destination);
  engBus = ctx.createGain(); engBus.gain.value = (save.settings.engine ?? 0.8) * 1.6; engBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 2.5;
  skidGain = ctx.createGain(); skidGain.gain.value = 0; src.connect(bp).connect(skidGain).connect(master); src.start();
  loadLoops();
  startMusic();
}
export function setVolumes() { if (master) master.gain.value = save.settings.sfx; if (engBus) engBus.gain.value = (save.settings.engine ?? 0.8) * 1.6; if (musicEl) musicEl.volume = save.settings.music; }
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
  const t = ctx.currentTime, out = ctx.createGain(), v = { kind, out, nodes: [], gear: 0, shiftT: 0, wob: 0 }; out.gain.value = 0; out.connect(engBus);
  const loopSrc = n => { const b = loops[n]; if (!b) return null; const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(t, Math.random() * b.duration); v.nodes.push(s); return s; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); v.nodes.push(o); return o; };
  const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random()); v.nodes.push(s); return s; };
  const filt = (type, f, q = 0.7, g = 0) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; x.gain.value = g; return x; };
  const gain = g => { const x = ctx.createGain(); x.gain.value = g; return x; };
  if (kind === 'car' || kind === 'bike' || kind === 'boat') {
    // two recordings crossfaded by rpm (deep idle loop + revving loop), through a throttle-controlled tone filter.
    // No synthetic oscillators: a steady sine/square under the engine is what made it hum like a generator.
    v.lp = filt('lowpass', 900, 0.5); v.tone = filt('peaking', 1300, 0.9, -5); v.lp.connect(v.tone).connect(out);
    v.lo = loopSrc('engine_low_loop'); v.hi = kind === 'boat' ? null : loopSrc('engine_loop'); v.loG = gain(1); v.hiG = gain(0);
    if (v.lo) v.lo.connect(kind === 'bike' ? filt('highpass', 140) : v.loG).connect(kind === 'bike' ? v.loG : v.lp); if (kind === 'bike' && v.lo) v.loG.connect(v.lp);
    if (v.hi) v.hi.connect(kind === 'bike' ? filt('highpass', 220) : v.hiG).connect(kind === 'bike' ? v.hiG : v.lp); if (kind === 'bike' && v.hi) v.hiG.connect(v.lp);
    if (kind === 'boat') { v.wash = gain(0.03); noise().connect(filt('lowpass', 700)).connect(filt('highpass', 120)).connect(v.wash).connect(out); }
  } else if (kind === 'heli') {
    const am = gain(0.5); v.lfo = osc('sine', 11); v.lfo.connect(gain(0.45)).connect(am.gain); noise().connect(filt('lowpass', 320)).connect(am).connect(out);   // soft blade thump
    v.whine = osc('sine', 2600); v.whine.connect(gain(0.004)).connect(out);   // distant turbine
  } else if (kind === 'plane') {
    const pg = gain(0.12); v.prop = osc('triangle', 90); v.pf = filt('lowpass', 420, 0.6); v.prop.connect(v.pf).connect(pg).connect(out);
    v.am = osc('sine', 18); v.am.connect(gain(0.05)).connect(pg.gain);
    v.lo = loopSrc('engine_low_loop'); if (v.lo) v.lo.connect(filt('lowpass', 500)).connect(gain(0.6)).connect(out);   // radial-engine rumble
    v.air = gain(0.02); noise().connect(filt('bandpass', 900, 0.5)).connect(v.air).connect(out);
  } else {   // spaceship: soft detuned hum + rushing air
    v.o1 = osc('triangle', 55); v.o2 = osc('triangle', 55.6); v.sf = filt('lowpass', 400, 1.5); v.o1.connect(v.sf); v.o2.connect(v.sf); v.sf.connect(gain(0.1)).connect(out);
    v.air = gain(0); noise().connect(filt('bandpass', 1100, 0.5)).connect(v.air).connect(out);
  }
  v.needsLoop = (kind === 'car' || kind === 'bike' || kind === 'boat' || kind === 'plane') && !v.lo;
  return v;
}
function killVoice(v) { v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { for (const n of v.nodes) { try { n.stop(); } catch (e) {} } try { v.out.disconnect(); } catch (e) {} }, 400); }
// i: voice slot (local players 0-3, 9 = nearest rival), s: speed fraction 0..1.2, load: throttle 0..1, kind: vehicle class, vol: extra volume (distance)
export function engine(i, s, load, kind = 'car', boost = false, vol = 1) {
  if (!ctx) return; let v = engines[i];
  if (!v || v.kind !== kind || (v.needsLoop && loops.engine_low_loop)) { if (v) killVoice(v); v = engines[i] = makeVoice(kind); }
  const t = ctx.currentTime, sp = Math.max(0, Math.min(1.2, s)), set = (p, x, k = 0.06) => p && p.setTargetAtTime(x, t, k);
  v.wob += (Math.random() - 0.5) * 0.01; v.wob *= 0.97; const life = 1 + v.wob;   // tiny drift so the note never sits perfectly still
  if (kind === 'car' || kind === 'bike') {
    const bike = kind === 'bike', G = bike ? 6 : 5, gs = Math.min(0.999, sp) * G, gear = Math.floor(gs);
    const rpm = Math.min(1, (gear === 0 ? 0.12 + gs * 0.88 : 0.3 + 0.7 * (gs - gear)) * (load > 0.2 ? 1 : 0.9) + (boost ? 0.06 : 0));
    if (gear > v.gear && sp > 0.05) v.shiftT = t + 0.13; v.gear = gear;   // gear change: a short lift-off before the next gear pulls
    const shifting = t < v.shiftT, onGas = load > 0.2 && !shifting;
    set(v.lo && v.lo.playbackRate, (bike ? 1.0 + rpm * 1.1 : 0.78 + rpm * 0.85) * life, 0.05);
    set(v.hi && v.hi.playbackRate, (bike ? 0.95 + rpm * 1.05 : 0.62 + rpm * 0.62) * life, 0.05);
    const x = Math.min(1, Math.max(0, (rpm - 0.25) / 0.6));   // crossfade: idle loop down low, revving loop up high
    set(v.loG.gain, Math.cos(x * 1.5708) * (bike ? 0.7 : 1)); set(v.hiG.gain, Math.sin(x * 1.5708) * (bike ? 0.9 : 0.75));
    set(v.lp.frequency, (onGas ? (bike ? 1500 : 900) + rpm * (bike ? 2600 : 1700) : (bike ? 900 : 560) + rpm * 500) + (boost ? 600 : 0), 0.07);
    set(v.out.gain, (onGas ? 0.13 + rpm * 0.1 : 0.07 + rpm * 0.04) * (shifting ? 0.55 : 1) * vol, shifting ? 0.03 : 0.09);
  } else if (kind === 'boat') {
    set(v.lo && v.lo.playbackRate, (0.6 + sp * 0.7) * life); set(v.lp.frequency, 450 + load * 900 + sp * 500); set(v.wash.gain, 0.02 + sp * 0.18); set(v.out.gain, (0.1 + load * 0.08) * vol, 0.1);
  } else if (kind === 'heli') {
    set(v.lfo.frequency, 9 + sp * 5 + load * 2); set(v.whine.frequency, 2400 + sp * 700); set(v.out.gain, (0.14 + load * 0.05) * vol, 0.1);
  } else if (kind === 'plane') {
    set(v.prop.frequency, 70 + sp * 90 + load * 20); set(v.pf.frequency, 340 + load * 500); set(v.am.frequency, 12 + sp * 14); set(v.lo && v.lo.playbackRate, (0.5 + sp * 0.5) * life); set(v.air.gain, 0.01 + sp * 0.06); set(v.out.gain, (0.12 + load * 0.06) * vol, 0.1);
  } else {
    set(v.o1.frequency, 45 + sp * 70); set(v.o2.frequency, (45 + sp * 70) * 1.012); set(v.sf.frequency, 300 + sp * 1100 + load * 500); set(v.air.gain, sp * 0.1 + (boost ? 0.07 : 0)); set(v.out.gain, 0.14 * vol, 0.1);
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
  else if (name === 'reward') { const f = 620 * (1 + 0.12 * (p - 1)); tone(f, 0.09, 'triangle', 0.09); setTimeout(() => tone(f * 1.5, 0.16, 'triangle', 0.08), 60); }
  else if (name === 'lap') tone(700, 0.12, 'triangle', 0.14, 1.5);
}
