/* Pitch Clash — procedural music & ceremonial audio.
 * Everything here is ORIGINAL and synthesised live with the Web Audio API: no samples, no
 * transcribed melodies. Melodies are composed algorithmically from seeded PRNGs (chord tones on
 * strong beats, stepwise motion, antecedent/consequent phrases with half and full cadences).
 *
 * Classic script: defines the global `Music`. Load after audio.js, before bundle.js, then call
 * Music.attach(ctx, musicGainNode) once an AudioContext exists.
 */
var Music = (function () {
  'use strict';

  // ------------------------------------------------------------------ state
  let ctx = null, dest = null, offline = false;
  let bus = null, mainIn = null, tilt = null, revIn = null, globalNodes = [];
  let noiseBuf = null, distCurve = null, applauseBuf = null;
  let timer = null;
  const players = new Set();
  let playlistOn = false, plPlayer = null, order = [], orderPos = -1, curDesc = null;
  let walkPlayer = null, anthemSt = null, intensity = 1;
  let voices = [];
  const LOOK = 0.3, TICK = 40, XF = 2.0, MAXV = 72;
  const api = {};

  // ------------------------------------------------------------------ helpers
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
  const md7 = d => ((d % 7) + 7) % 7;
  function degMidi(tonic, scale, deg) { return tonic + 12 * Math.floor(deg / 7) + scale[md7(deg)]; }
  const rep = (s, n) => new Array(n + 1).join(s);
  const now = () => (ctx ? ctx.currentTime : 0);
  function safe(fn) { try { return fn(); } catch (e) { if (typeof console !== 'undefined') console.warn('[Music]', e); return null; } }

  // time-based voice limiter: counts oscillators sounding at time t
  function allow(t, end, n, prio) {
    if (voices.length > 24) voices = voices.filter(v => v.e > t);
    let sum = 0; for (let i = 0; i < voices.length; i++) if (voices[i].e > t && voices[i].s <= t + 0.01) sum += voices[i].n;
    if (prio < 2 && sum + n > MAXV) return false;
    if (prio < 1 && sum + n > MAXV * 0.7) return false;
    voices.push({ s: t, e: end, n }); return true;
  }
  function cleanup(src, list) { src.onended = function () { for (let i = 0; i < list.length; i++) { try { list[i].disconnect(); } catch (e) {} } }; }

  // ------------------------------------------------------------------ bus / fx
  function makeIR(sec, decay) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len, w = Math.random() * 2 - 1, k = 0.15 + 0.8 * x; // darker tail
        lp = lp + (w - lp) * (1 - k); d[i] = lp * Math.pow(1 - x, decay) * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
      }
    }
    return buf;
  }
  function build() {
    globalNodes = [];
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; globalNodes.push(n); return n; };
    bus = g(1);
    mainIn = g(1); mainIn.connect(bus);
    tilt = ctx.createBiquadFilter(); tilt.type = 'lowpass'; tilt.frequency.value = 18000; tilt.Q.value = 0.5; globalNodes.push(tilt);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.015; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    const out = g(0.75);
    bus.connect(tilt); tilt.connect(comp); comp.connect(lim); lim.connect(out); out.connect(dest);
    globalNodes.push(comp, lim);
    revIn = g(1);
    const conv = ctx.createConvolver(); conv.buffer = makeIR(2.8, 2.6); globalNodes.push(conv);
    const revOut = g(0.55);
    revIn.connect(conv); conv.connect(revOut); revOut.connect(tilt);
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; distCurve[i] = Math.tanh(4 * x) / Math.tanh(4); }
    applauseBuf = null;
  }
  function outNode(level, send) { // a one-shot output: gain -> bus (+ reverb send)
    const g = ctx.createGain(); g.gain.value = level; g.connect(bus);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(revIn); g._send = s; }
    return g;
  }
  function freeLater(nodes, atTime) {
    const ms = Math.max(0, (atTime - now()) * 1000) + 500;
    if (offline) return;
    setTimeout(() => nodes.forEach(n => { try { n.disconnect(); } catch (e) {} }), ms);
  }

  // ------------------------------------------------------------------ voices
  // generic subtractive voice. o: w (wave|array), det[] cents, mul[], mix[], g peak, a d s r,
  // lp cutoff, q, ft filter type, fe filter env amount, fa, fd, fs, vib [rate, cents, delay], glide, gt, p priority
  function synth(out, t, freq, dur, o) {
    const a = o.a == null ? 0.01 : o.a, d = o.d == null ? 0.2 : o.d, s = o.s == null ? 0.7 : o.s, r = o.r == null ? 0.1 : o.r;
    const dets = o.det || [0], rel = t + Math.max(dur, a + 0.002), end = rel + r * 1.6 + 0.02;
    if (!allow(t, end, dets.length + (o.vib ? 1 : 0), o.p == null ? 1 : o.p)) return null;
    const g = ctx.createGain(), gp = g.gain, nodes = [g];
    gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(o.g, t + a);
    if (s < 1) gp.setTargetAtTime(o.g * s, t + a, Math.max(0.004, d / 3));
    gp.setTargetAtTime(0, rel, Math.max(0.004, r / 4));
    let inp = g;
    if (o.lp) {
      const f = ctx.createBiquadFilter(); f.type = o.ft || 'lowpass'; f.Q.value = o.q == null ? 0.7 : o.q;
      if (o.fe) {
        const fa = o.fa == null ? 0.01 : o.fa;
        f.frequency.setValueAtTime(o.lp, t); f.frequency.linearRampToValueAtTime(Math.min(16000, o.lp + o.fe), t + fa);
        f.frequency.setTargetAtTime(o.lp + (o.fs || 0) * o.fe, t + fa, (o.fd == null ? 0.2 : o.fd) / 3);
      } else f.frequency.value = o.lp;
      f.connect(g); inp = f; nodes.push(f);
    }
    g.connect(out);
    let lg = null;
    if (o.vib) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = o.vib[0] * (0.95 + Math.random() * 0.1); lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib[1], t + (o.vib[2] == null ? 0.3 : o.vib[2]) + 0.01);
      lfo.connect(lg); lfo.start(t); lfo.stop(end); nodes.push(lfo, lg);
    }
    let last = null;
    for (let i = 0; i < dets.length; i++) {
      const os = ctx.createOscillator(), f0 = freq * (o.mul ? o.mul[i] : 1);
      os.type = Array.isArray(o.w) ? o.w[i] : (o.w || 'sawtooth');
      if (o.glide) { os.frequency.setValueAtTime(f0 * o.glide, t); os.frequency.exponentialRampToValueAtTime(f0, t + (o.gt || 0.05)); }
      else os.frequency.value = f0;
      os.detune.value = dets[i];
      if (lg) lg.connect(os.detune);
      let tgt = inp;
      if (o.mix) { const mg = ctx.createGain(); mg.gain.value = o.mix[i]; mg.connect(inp); tgt = mg; nodes.push(mg); }
      os.connect(tgt); os.start(t); os.stop(end); nodes.push(os); last = os;
    }
    cleanup(last, nodes);
    return g;
  }
  function nsrc(t, end) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(end); return s; }
  function hitNoise(out, t, o) {
    const a = o.a || 0.001, d = o.d || 0.1, end = t + a + d * 2.3 + 0.02;
    if (!allow(t, end, 1, o.p == null ? 1 : o.p)) return;
    const s = nsrc(t, end), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = o.ft || 'highpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + a + d);
    f.Q.value = o.q == null ? 0.7 : o.q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.g, t + a); g.gain.setTargetAtTime(0, t + a, d / 3);
    s.connect(f); f.connect(g); g.connect(out); cleanup(s, [s, f, g]);
  }
  function thit(out, t, o) {
    const a = o.a || 0.002, d = o.d || 0.2, end = t + a + d * 2.3 + 0.02;
    if (!allow(t, end, 1, o.p == null ? 1 : o.p)) return;
    const os = ctx.createOscillator(), g = ctx.createGain(); os.type = o.w || 'sine';
    os.frequency.setValueAtTime(o.f0, t); if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, t + (o.pt || 0.08));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.g, t + a); g.gain.setTargetAtTime(0, t + a, d / 3);
    os.connect(g); g.connect(out); os.start(t); os.stop(end); cleanup(os, [os, g]);
  }
  function swellNoise(out, t, dur, g, f0, f1, ft, q) { // reverse-cymbal / riser
    const end = t + dur + 0.06; if (!allow(t, end, 1, 1)) return;
    const s = nsrc(t, end), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    f.type = ft || 'highpass'; f.Q.value = q || 0.7; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + dur); gn.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    s.connect(f); f.connect(gn); gn.connect(out); cleanup(s, [s, f, gn]);
  }
  function whistle(out, t, len, v) {
    const end = t + len + 0.08; if (!allow(t, end, 2, 1)) return;
    const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.frequency.value = 2750; l.frequency.value = 34; lg.gain.value = 130; l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * v, t + 0.015); g.gain.setValueAtTime(0.05 * v, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.04);
    o.connect(g); g.connect(out); o.start(t); l.start(t); o.stop(end); l.stop(end); cleanup(o, [o, l, lg, g]);
  }

  // drums -----------------------------------------------------------
  const D = {
    kick(out, t, v, k) { k = k || {}; thit(out, t, { f0: k.kf0 || 150, f1: k.kf1 || 45, pt: 0.09, g: 0.8 * v, d: k.kd || 0.3, p: 2 }); hitNoise(out, t, { ft: 'lowpass', f: 2500, g: 0.15 * v, d: 0.008, p: 0 }); },
    snare(out, t, v, k) { k = k || {}; hitNoise(out, t, { ft: 'highpass', f: k.sf || 1400, g: 0.34 * v, d: k.sd || 0.12, p: 1 }); thit(out, t, { w: 'triangle', f0: 230, f1: 175, pt: 0.05, g: 0.22 * v, d: 0.06, p: 0 }); },
    clap(out, t, v) {
      const end = t + 0.3; if (!allow(t, end, 1, 1)) return;
      const s = nsrc(t, end), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 1.1;
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 3; i++) { const ti = t + i * 0.011; g.gain.linearRampToValueAtTime(0.42 * v, ti + 0.001); g.gain.setTargetAtTime(0.06 * v, ti + 0.001, 0.003); }
      g.gain.setTargetAtTime(0, t + 0.036, 0.04);
      s.connect(f); f.connect(g); g.connect(out); cleanup(s, [s, f, g]);
    },
    hat(out, t, v, open) { hitNoise(out, t, { ft: 'highpass', f: 7500, g: (open ? 0.08 : 0.11) * v, d: open ? 0.17 : 0.025, p: 0 }); },
    shaker(out, t, v) { hitNoise(out, t, { ft: 'bandpass', f: 6500, q: 1.2, a: 0.012, g: 0.1 * v, d: 0.03, p: 0 }); },
    tom(out, t, v, f) { thit(out, t, { f0: f * 1.5, f1: f, pt: 0.12, g: 0.45 * v, d: 0.25 }); },
    conga(out, t, v, f) { thit(out, t, { f0: f * 1.25, f1: f, pt: 0.03, g: 0.3 * v, d: 0.13 }); hitNoise(out, t, { ft: 'bandpass', f: f * 6, q: 2, g: 0.05 * v, d: 0.01, p: 0 }); },
    surdo(out, t, v, open) { thit(out, t, open ? { f0: 95, f1: 62, pt: 0.06, g: 0.65 * v, d: 0.5, p: 2 } : { f0: 95, f1: 70, pt: 0.03, g: 0.4 * v, d: 0.1 }); },
    tamborim(out, t, v) { thit(out, t, { w: 'triangle', f0: 900, f1: 820, pt: 0.02, g: 0.13 * v, d: 0.04, p: 0 }); hitNoise(out, t, { ft: 'bandpass', f: 4000, q: 1.5, g: 0.06 * v, d: 0.015, p: 0 }); },
    agogo(out, t, v, hi) { const f = hi ? 987.8 : 659.3; thit(out, t, { f0: f, g: 0.09 * v, d: 0.18, p: 0 }); thit(out, t, { f0: f * 2.7, g: 0.025 * v, d: 0.05, p: 0 }); },
    cowbell(out, t, v) { thit(out, t, { w: 'triangle', f0: 560, g: 0.1 * v, d: 0.12, p: 0 }); thit(out, t, { w: 'triangle', f0: 845, g: 0.07 * v, d: 0.1, p: 0 }); },
    clave(out, t, v) { thit(out, t, { f0: 2350, g: 0.1 * v, d: 0.03, p: 0 }); },
    crash(out, t, v) { hitNoise(out, t, { ft: 'highpass', f: 4500, g: 0.2 * v, d: 1.1, p: 1 }); hitNoise(out, t, { ft: 'bandpass', f: 3000, q: 0.6, g: 0.07 * v, d: 0.5, p: 0 }); },
    timp(out, t, v, m, short) { const f = mtof(m); thit(out, t, { f0: f * 1.04, f1: f, pt: 0.15, g: 0.42 * v, d: short ? 0.3 : 1.0, p: short ? 1 : 2 }); if (!short) thit(out, t, { w: 'triangle', f0: f * 1.5, g: 0.1 * v, d: 0.45 }); hitNoise(out, t, { ft: 'lowpass', f: 450, g: 0.2 * v, d: 0.04, p: 0 }); },
    taiko(out, t, v) { thit(out, t, { f0: 110, f1: 58, pt: 0.1, g: 0.65 * v, d: 0.45, p: 2 }); hitNoise(out, t, { ft: 'lowpass', f: 900, g: 0.22 * v, d: 0.06 }); },
    roll(out, t, dur, m, v0, v1) { const step = 0.06; for (let x = 0; x < dur - 0.01; x += step) { const k = x / dur; D.timp(out, t + x, v0 + (v1 - v0) * k * k, m, true); } },
  };

  // instruments (P = player with buses b, style st) --------------------------------
  const BASS = {
    rock: (out, t, f, d, v) => synth(out, t, f, d, { w: ['sawtooth', 'square'], det: [0, 0], mul: [1, 0.5], mix: [1, 0.45], g: 0.15 * v, a: 0.004, d: 0.25, s: 0.6, r: 0.06, lp: 650, fe: 900, fd: 0.12, p: 2 }),
    upright: (out, t, f, d, v) => synth(out, t, f, d, { w: ['triangle', 'sine'], det: [0, 0], mul: [1, 2], mix: [1, 0.3], g: 0.32 * v, a: 0.006, d: 0.35, s: 0.2, r: 0.08, lp: 900, p: 2 }),
    sub: (out, t, f, d, v) => synth(out, t, f, d, { w: ['sine', 'sawtooth'], det: [0, 0], mix: [1, 0.35], g: 0.28 * v, a: 0.004, d: 0.2, s: 0.7, r: 0.05, lp: 450, fe: 450, fd: 0.08, p: 2 }),
    synth: (out, t, f, d, v) => synth(out, t, f, d, { w: 'sawtooth', det: [-6, 6], g: 0.12 * v, a: 0.004, d: 0.15, s: 0.45, r: 0.05, lp: 280, fe: 1500, fd: 0.1, q: 3, p: 2 }),
    slap: (out, t, f, d, v) => synth(out, t, f, d, { w: ['sawtooth', 'sine'], det: [0, 0], mix: [0.7, 1], g: 0.2 * v, a: 0.002, d: 0.18, s: 0.35, r: 0.05, lp: 450, fe: 3200, fd: 0.06, q: 2, p: 2 }),
    log: (out, t, f, d, v) => synth(out, t, f, d, { w: ['sine', 'triangle'], det: [0, 0], mix: [1, 0.25], g: 0.38 * v, a: 0.003, d: 0.32, s: 0, r: 0.1, glide: 1.9, gt: 0.04, p: 2 }),
    orch: (out, t, f, d, v) => synth(out, t, f, d, { w: 'sawtooth', det: [-7, 7], g: 0.09 * v, a: 0.05, d: 0.4, s: 0.85, r: 0.25, lp: 650, q: 0.5, p: 2 }),
  };
  const LEAD = {
    saw: (out, t, f, d, v) => synth(out, t, f, d, { w: 'sawtooth', det: [-7, 7], g: 0.075 * v, a: 0.015, d: 0.3, s: 0.8, r: 0.15, lp: 1800, fe: 1600, fs: 0.4, fd: 0.3, q: 1, vib: [5.5, 12, 0.25], p: 2 }),
    flute: (out, t, f, d, v) => synth(out, t, f, d, { w: ['sine', 'triangle'], det: [0, 3], mix: [1, 0.35], g: 0.15 * v, a: 0.045, d: 0.2, s: 0.85, r: 0.12, vib: [5.2, 14, 0.15], p: 2 }),
    square: (out, t, f, d, v) => synth(out, t, f, d, { w: 'square', det: [0, 8], g: 0.045 * v, a: 0.005, d: 0.18, s: 0.55, r: 0.08, lp: 1600, fe: 2400, fs: 0.3, fd: 0.15, p: 2 }),
    brass: (out, t, f, d, v) => synth(out, t, f, d, { w: 'sawtooth', det: [-6, 6], g: 0.085 * v, a: 0.06, d: 0.3, s: 0.85, r: 0.18, lp: 450, fe: 600 + 1700 * v, fa: 0.08, fs: 0.5, fd: 0.4, vib: [5, 8, 0.4], p: 2 }),
    marimba: (out, t, f, d, v) => synth(out, t, f, 0.06, { w: ['sine', 'sine'], det: [0, 0], mul: [1, 4], mix: [1, 0.16], g: 0.2 * v, a: 0.003, d: 0.28, s: 0, r: 0.25, p: 2 }),
    pluck: (out, t, f, d, v) => synth(out, t, f, Math.min(d, 0.2), { w: 'square', det: [0, 7], g: 0.045 * v, a: 0.003, d: 0.2, s: 0.15, r: 0.12, lp: 900, fe: 3500, fd: 0.14, p: 2 }),
  };
  const CHORD = {
    power: (P, t, ns, d, v, root) => synth(P.gtr, t, mtof(root), d, { w: 'sawtooth', det: [-8, 8, 0], mul: [1, 1, 1.4983], g: 0.11 * v, a: 0.004, d: 0.4, s: 0.75, r: 0.06, p: 1 }),
    stab: (P, t, ns, d, v) => ns.forEach(m => synth(P.b.comp, t, mtof(m), d, { w: ['sawtooth', 'square'], det: [-5, 5], g: 0.03 * v, a: 0.003, d: 0.18, s: 0.25, r: 0.08, lp: 800, fe: 2000, fd: 0.12, p: 1 })),
    pluck: (P, t, ns, d, v) => ns.forEach((m, i) => synth(P.b.comp, t + i * 0.009, mtof(m), d, { w: 'triangle', det: [0], g: 0.07 * v, a: 0.002, d: 0.16, s: 0.1, r: 0.06, p: 0 })),
    strings: (P, t, ns, d, v, root, bus) => ns.forEach(m => synth(bus || P.b.comp, t, mtof(m), d, { w: 'sawtooth', det: [-9, 9], g: 0.026 * v, a: 0.35, d: 1, s: 0.9, r: 0.6, lp: 2000, q: 0.4, p: 1 })),
    clav: (P, t, ns, d, v) => ns.forEach(m => synth(P.b.comp, t, mtof(m), Math.min(d, 0.12), { w: 'square', det: [0], g: 0.035 * v, a: 0.002, d: 0.1, s: 0.2, r: 0.04, lp: 2600, q: 2, p: 0 })),
    rhodes: (P, t, ns, d, v) => ns.forEach(m => synth(P.b.comp, t, mtof(m), d, { w: ['sine', 'sine'], det: [0, 1], mul: [1, 2], mix: [1, 0.22], g: 0.055 * v, a: 0.004, d: 0.8, s: 0.3, r: 0.3, p: 1 })),
    pad: (P, t, ns, d, v, root, bus) => ns.forEach(m => synth(bus || P.b.pad, t, mtof(m), d, { w: 'sawtooth', det: [-12, 12], g: 0.022 * v, a: 0.5, d: 1, s: 0.9, r: 0.9, lp: 1300, q: 0.5, p: 1 })),
  };
  function spic(out, t, f, v) { synth(out, t, f, 0.09, { w: 'sawtooth', det: [-5, 5], g: 0.05 * v, a: 0.008, d: 0.12, s: 0.2, r: 0.08, lp: 1500, p: 1 }); }
  function brassChord(out, t, ns, d, v) { ns.forEach(m => LEAD.brass(out, t, mtof(m), d, v)); }

  // ------------------------------------------------------------------ melody composition
  const POOLS = {
    anthem: [[[0, 4], [4, 4], [8, 6], [14, 2]], [[0, 6], [6, 2], [8, 8]], [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4]], [[0, 8], [8, 4], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 8]]],
    sync: [[[0, 2], [3, 3], [6, 2], [10, 2], [12, 3]], [[0, 1], [2, 2], [4, 2], [7, 3], [10, 2], [12, 2], [14, 2]], [[2, 2], [4, 2], [6, 4], [11, 3], [14, 2]], [[0, 3], [3, 3], [6, 4], [12, 4]], [[0, 2], [2, 1], [3, 3], [8, 2], [10, 1], [11, 3]]],
    riff: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], [[0, 2], [3, 1], [4, 2], [6, 2], [10, 2], [12, 4]], [[0, 1], [2, 1], [3, 2], [6, 2], [8, 1], [10, 1], [11, 2], [14, 2]]],
    epic: [[[0, 6], [6, 2], [8, 8]], [[0, 4], [4, 4], [8, 4], [12, 4]], [[0, 12], [12, 4]], [[0, 3], [3, 1], [4, 8], [12, 4]], [[0, 8], [8, 6], [14, 2]]],
  };
  const CAD = { half: [[[0, 4], [4, 4], [8, 8]], [[0, 6], [6, 2], [8, 8]], [[0, 2], [2, 2], [4, 4], [8, 8]]], full: [[[0, 4], [4, 12]], [[0, 8], [8, 8]], [[0, 2], [2, 2], [4, 12]], [[0, 6], [6, 2], [8, 8]]] };
  const isCT = (d, c) => { const m = md7(d - c); return m === 0 || m === 2 || m === 4; };
  function nearestCT(c, x, lo, hi) {
    let best = lo, bd = 1e9;
    for (let d = lo - 1; d <= hi + 1; d++) if (isCT(d, c)) { const dd = Math.abs(d - x) + (d < lo || d > hi ? 1.5 : 0); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  function cadNote(c, kind, prev, lo, hi) {
    const prefs = kind === 'full' ? [0, 2, 4] : [4, 1, 6, 2];
    for (const pc of prefs) {
      let best = null, bd = 1e9;
      for (let d = lo - 2; d <= hi + 2; d++) if (md7(d) === pc && isCT(d, c)) { const dd = Math.abs(d - prev); if (dd < bd) { bd = dd; best = d; } }
      if (best != null) return best;
    }
    return nearestCT(c, prev, lo, hi);
  }
  function genPhrase(R, chords, rhythms, o) {
    const notes = []; let prev = o.prev, b0 = 0;
    if (o.copy && o.copy.length) { o.copy.forEach(n => notes.push(Object.assign({}, n))); b0 = o.copyBars; prev = o.copy[o.copy.length - 1].deg; }
    for (let b = b0; b < chords.length; b++) {
      const c = chords[b], rh = rhythms[b], target = o.lo + (o.hi - o.lo) * o.contour[b % o.contour.length];
      for (let i = 0; i < rh.length; i++) {
        const st = rh[i][0], len = rh[i][1], last = i === rh.length - 1 && b === chords.length - 1;
        let deg;
        if (last && o.cad) deg = cadNote(c, o.cad, prev, o.lo, o.hi);
        else if (o.strong(st, len)) deg = nearestCT(c, prev * 0.55 + target * 0.45, o.lo, o.hi);
        else {
          let s = [-1, 1, -1, 1, 2, -2, 1, -1, 0][Math.floor(R() * 9)];
          if (prev > target + 1.5) s = -Math.abs(s || 1); else if (prev < target - 1.5) s = Math.abs(s || 1);
          deg = prev + s; if (deg > o.hi) deg = prev - 1; if (deg < o.lo) deg = prev + 1;
          if (o.avoid && o.avoid(deg, c)) deg = nearestCT(c, deg, o.lo, o.hi);
        }
        if (Math.abs(deg - prev) > 5 && !last) deg = nearestCT(c, prev, o.lo, o.hi);
        notes.push({ bar: b, st, len, deg }); prev = deg;
      }
    }
    return notes;
  }
  function melody8(R, ch8, pool, lo, hi) {
    const PL = POOLS[pool] || POOLS.anthem, pick = a => a[Math.floor(R() * a.length)];
    const rA = pick(PL), rB = pick(PL), rC = pick(PL), cH = pick(CAD.half), cF = pick(CAD.full);
    const strong = (st, len) => st % 8 === 0 || len >= 4;
    const A = genPhrase(R, ch8.slice(0, 4), [rA, rB, rA, cH], { lo, hi, contour: [0.35, 0.6, 0.85, 0.5], cad: 'half', prev: nearestCT(ch8[0], lo + (hi - lo) * 0.4, lo, hi), strong });
    const same = ch8[4] === ch8[0] && ch8[5] === ch8[1];
    const B = genPhrase(R, ch8.slice(4, 8), [rA, rB, rC, cF], { lo, hi, contour: [0.35, 0.6, 0.95, 0.25], cad: 'full', prev: A[A.length - 1].deg, strong, copy: same ? A.filter(n => n.bar < 2) : null, copyBars: 2 });
    B.forEach(n => { n.bar += 4; });
    const bars = []; for (let i = 0; i < 8; i++) bars.push(new Map());
    A.concat(B).forEach(n => bars[n.bar].set(n.st, n));
    return bars;
  }
  function parsePat(s) { // 'r--f-.r.' -> onsets with lengths
    const ev = new Array(16).fill(null); if (!s) return ev;
    for (let i = 0; i < 16; i++) { const ch = s[i]; if (ch && ch !== '.' && ch !== '-') { let l = 1; while (s[i + l] === '-') l++; ev[i] = { ch, len: l }; } }
    return ev;
  }

  // ------------------------------------------------------------------ track styles
  const ART = 'Pitch Clash Sound Team';
  const STYLES = [
    {
      id: 'floodlights', title: 'Floodlight Anthem', artist: ART, style: 'Stadium rock anthem', bpm: 132, mode: 'major',
      root: { bass: 38, comp: 50, lead: 62, pad: 62 }, inst: { bass: 'rock', comp: 'power', lead: 'saw', pad: 'strings' },
      kit: { kf0: 140, kf1: 45, kd: 0.32, sf: 1500, sd: 0.15 }, rev: { drums: 0.12, comp: 0.1, lead: 0.25, pad: 0.3 },
      fill: { s: '........x.x.xxxx', t: '....x.x.........', T: '..........x.x...' }, swellInto: ['chorus'],
      form: [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['break', 8], ['chorus', 8], ['chorus', 8]],
      sec: {
        intro: { prog: [0, 3, 5, 4], drums: { k: 'x.......x.......', cr: 'x...............', T: rep('.', 48) + '............xxxx' }, comp: ['x---------------', 1], bass: ['R---------------', 0.95], pad: 0.7, crash: false, noFill: true },
        verse: { prog: [5, 3, 0, 4], drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, comp: ['x-x-x-x-x-x-x-x-', 0.4], bass: ['r-r-r-r-r-r-r-r-', 0.8], lead: { pool: 'anthem', lo: -3, hi: 4, v: 0.7 } },
        chorus: { prog: [0, 4, 5, 3], drums: { k: 'x.....x.x.x.....', s: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' }, comp: ['x-------x-----x-', 0.95], bass: ['r-r-r-r-r-r-r-ra', 0.85], lead: { pool: 'anthem', lo: 0, hi: 9, v: 1 }, pad: 0.6 },
        break: { prog: [5, 3, 0, 4], drums: { k: 'x.........x.....', s: '........x.......', h: 'x...x...x...x...' }, bass: ['R-------r-r-r-o-', 0.9], pad: 0.9, lead: { pool: 'epic', lo: -1, hi: 6, v: 0.75 } },
      },
    },
    {
      id: 'carnival', title: 'Carnival Counterattack', artist: ART, style: 'Samba / Latin percussion', bpm: 100, mode: 'major', swing: 0.06,
      root: { bass: 43, comp: 55, lead: 67, pad: 67 }, inst: { bass: 'upright', comp: 'pluck', lead: 'flute' },
      kit: { kf0: 120, kf1: 50, kd: 0.25, sf: 2500, sd: 0.07 }, dv: { s: 0.45, k: 0.6 }, rev: { drums: 0.1, comp: 0.15, lead: 0.25 },
      form: [['intro', 4], ['verse', 8], ['chorus', 8], ['break', 4], ['verse', 8], ['chorus', 8], ['chorus', 8]],
      sec: {
        intro: { prog: [0, 5, 1, 4], drums: { su: 'o...x...o...x...', ta: 'x.xx.x.xx.x.x.x.', sh: 'xoooxoooxoooxooo', bl: rep('.', 48) + 'x.o.x.o.oo.ox.o.' }, crash: false, whistle: true },
        verse: { prog: [0, 5, 1, 4], drums: { su: 'o...x...o...x...', k: 'x.......x.......', s: 'g.gxg.gxg.gxgxgx', ta: 'x.xx.x.xx.x.x.x.', sh: 'xoooxoooxoooxooo' }, bass: ['r--f-.r.r--f-.a.', 0.85], comp: ['x..x..x...x..x..', 0.45], lead: { pool: 'sync', lo: -1, hi: 7, v: 0.85 } },
        chorus: { prog: [3, 4, 0, 0], drums: { su: 'o...x...o...x...', k: 'x.......x.......', s: 'g.gxg.gxg.gxgxgx', ta: 'x.xx.x.xx.x.x.x.', sh: 'xoooxoooxoooxooo', bl: 'x.o.x.o.oo.ox.o.' }, bass: ['r--f-.r.r--f-.a.', 0.85], comp: ['x.xx.x.xx.x.x.x.', 0.4], lead: { pool: 'sync', lo: 2, hi: 9, v: 1 } },
        break: { prog: [0, 0, 4, 4], drums: { su: 'x...x...x...x.x.', ta: 'x.xx.x.xx.x.x.x.', sh: 'xxxxxxxxxxxxxxxx', s: 'gxgxgxgxgxgxgxxx', bl: 'x.o.x.o.oo.ox.o.' }, whistle: true, noFill: true },
      },
    },
    {
      id: 'goldengoal', title: 'Golden Goal (Club Mix)', artist: ART, style: 'House / EDM four-on-the-floor', bpm: 124, mode: 'minor', c7: true, pump: true, delay: 0.75,
      root: { bass: 41, comp: 65, lead: 77, pad: 65 }, inst: { bass: 'sub', comp: 'stab', lead: 'pluck', pad: 'pad' },
      kit: { kf0: 170, kf1: 48, kd: 0.38, sf: 1800, sd: 0.12 }, riserIn: ['build', 'break'], rev: { drums: 0.08, comp: 0.2, lead: 0.2, pad: 0.3 },
      form: [['intro', 8], ['build', 8], ['drop', 8], ['break', 8], ['drop', 8], ['drop', 8], ['outro', 8]],
      sec: {
        intro: { prog: [0, 5, 2, 6], drums: { k: 'x...x...x...x...', h: '..x...x...x...x.' }, pad: 0.5, crash: false, noFill: true },
        build: { prog: [0, 5, 2, 6], drums: { k: 'x...x...x...x...', h: '..x...x...x...x.', c: '....x.......x...', sh: '.x.x.x.x.x.x.x.x' }, bass: ['..r-..r-..r-..r-', 0.8], comp: ['..x..x....x..x..', 0.35], pad: 0.4, noFill: true },
        drop: { prog: [0, 5, 2, 6], drums: { k: 'x...x...x...x...', H: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.', c: '....x.......x...', sh: 'xoxoxoxoxoxoxoxo' }, bass: ['..r-..r-..r-..ro', 0.8], comp: ['..x..x....x..x..', 0.35], pad: 0.45, lead: { pool: 'riff', lo: -2, hi: 7, v: 1 }, noFill: true },
        break: { prog: [0, 5, 2, 6], drums: { sh: '..x...x...x...x.' }, pad: 0.9, lead: { pool: 'epic', lo: -2, hi: 5, v: 0.6 }, crash: false, noFill: true },
        outro: { prog: [0, 5, 2, 6], drums: { k: 'x...x...x...x...', h: '..x...x...x...x.' }, bass: ['..r-..r-..r-..r-', 0.8], pad: 0.4, noFill: true },
      },
    },
    {
      id: 'roadtofinal', title: 'Road to the Final', artist: ART, style: 'Orchestral epic', bpm: 84, mode: 'minor',
      root: { bass: 38, comp: 74, lead: 62, pad: 50 }, inst: { bass: 'orch', comp: 'strings', lead: 'brass', pad: 'strings' },
      rev: { drums: 0.3, comp: 0.35, lead: 0.35, pad: 0.4, bass: 0.15 }, rollInto: ['chorus'], swellInto: ['chorus'], dv: { s: 0.4 },
      form: [['intro', 4], ['verse', 8], ['chorus', 8], ['break', 4], ['verse', 8], ['chorus', 8], ['chorus', 8]],
      sec: {
        intro: { prog: [0, 0, 5, 6], drums: { tk: 'x.......x.......', ti: 'x...............' }, pad: 0.8, bass: ['R---------------', 0.95], ost: true, crash: false, noFill: true },
        verse: { prog: [0, 5, 2, 6], drums: { tk: 'x..x..x...x.....', ti: 'x.......o.......' }, bass: ['R-------R-------', 0.95], pad: 0.7, ost: true, lead: { pool: 'epic', lo: -3, hi: 4, v: 0.55 }, noFill: true },
        chorus: { prog: [5, 2, 6, 0], drums: { tk: 'x..x..x...x.x...', ti: 'x...x...o...x...', s: 'x.gxx.g.x.gxx.gg' }, bass: ['R---R---R---R---', 0.9], comp: ['x---------------', 1], pad: 0.7, ost: true, lead: { pool: 'epic', lo: 0, hi: 8, v: 1 }, noFill: true },
        break: { prog: [5, 5, 6, 6], pad: 0.9, lead: { pool: 'epic', lo: -2, hi: 5, v: 0.45 }, crash: false, noFill: true },
      },
    },
    {
      id: 'sunrise', title: 'Sunrise Stride', artist: ART, style: 'Afro-house groove', bpm: 118, mode: 'dorian', c7: true, swing: 0.04,
      root: { bass: 45, comp: 57, lead: 69, pad: 57 }, inst: { bass: 'log', comp: 'rhodes', lead: 'marimba', pad: 'pad' },
      kit: { kf0: 130, kf1: 50, kd: 0.28, sf: 2200, sd: 0.08 }, dv: { k: 0.75 }, rev: { drums: 0.12, comp: 0.2, lead: 0.3, pad: 0.35 },
      form: [['intro', 4], ['groove', 8], ['chorus', 8], ['break', 8], ['groove', 8], ['chorus', 8], ['chorus', 8]],
      sec: {
        intro: { prog: [0, 3], drums: { k: 'x...x...x...x...', sh: 'xoooxoooxoooxooo', cg: '..x..xo...x..xo.', cl: 'x..x..x...x.x...' }, pad: 0.45, crash: false, noFill: true },
        groove: { prog: [0, 3, 6, 4], drums: { k: 'x...x...x...x...', sh: 'xoooxoooxoooxooo', cg: '..x..xo...x..xo.', cl: 'x..x..x...x.x...', c: '....x.......x...', h: '..x...x...x...x.' }, bass: ['r..r..o.r.r..f..', 0.6], comp: ['..x...x..x....x.', 0.6], lead: { pool: 'sync', lo: 0, hi: 7, v: 0.85 }, noFill: true },
        chorus: { prog: [3, 4, 0, 0], drums: { k: 'x...x...x...x...', sh: 'xoooxoooxoooxooo', cg: '..x..xo...x..xo.', cl: 'x..x..x...x.x...', c: '....x.......x...', h: '..x...x...x...x.', bl: 'x.x.xx.x.x.xx.x.' }, bass: ['r..r..o.r.r..f..', 0.6], comp: ['..x...x..x....x.', 0.6], pad: 0.35, lead: { pool: 'sync', lo: 2, hi: 9, v: 1 }, arp: 'gtr', noFill: true },
        break: { prog: [0, 3], drums: { sh: 'xoooxoooxoooxooo', cg: '..x..xo...x..xo.', cl: 'x..x..x...x.x...' }, pad: 0.75, lead: { pool: 'riff', lo: -1, hi: 6, v: 0.55 }, crash: false, noFill: true },
      },
    },
    {
      id: 'nutmeg', title: 'Nutmeg Funk', artist: ART, style: 'Funk / breakbeat', bpm: 104, mode: 'dorian', c7: true, swing: 0.1,
      root: { bass: 40, comp: 64, lead: 76, pad: 64 }, inst: { bass: 'slap', comp: 'clav', lead: 'square', pad: 'pad' },
      kit: { kf0: 150, kf1: 52, kd: 0.22, sf: 1700, sd: 0.11 }, fill: { s: '....x..x.x.xxxxx' }, rev: { drums: 0.1, comp: 0.12, lead: 0.2 },
      form: [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['break', 8], ['chorus', 8]],
      sec: {
        intro: { prog: [0, 0, 3, 3], drums: { k: 'x.x.......x..x..', s: '....x..g.g..x..g', h: 'xoxoxoxoxoxoxoxo' }, bass: ['r-.ro.g.r-.r.o.a', 0.6], crash: false },
        verse: { prog: [0, 0, 3, 3], drums: { k: 'x.x.......x..x..', s: '....x..g.g..x..g', h: 'xoxoxoxoxoxoxoxo' }, bass: ['r-.ro.g.r-.r.o.a', 0.6], comp: ['.x.x..x..x.x..x.', 0.3], lead: { pool: 'sync', lo: -2, hi: 5, v: 0.75 } },
        chorus: { prog: [2, 3, 6, 0], drums: { k: 'x.x...x...x..x..', s: '....x..g.g..x..g', H: '..x...x...x...x.', h: 'xoxoxoxoxoxoxoxo' }, bass: ['r-.ro.r.r-.ro.o.', 0.6], comp: ['.x.x..x..x.x..x.', 0.3], lead: { pool: 'sync', lo: 1, hi: 8, v: 1 }, horns: true },
        break: { prog: [0, 0, 3, 3], drums: { k: 'x.x.......x..x..', s: '....x..g.g..x..g', h: 'xoxoxoxoxoxoxoxo', cb: '..x...x...x.x...' }, bass: ['r.......r.....o.', 0.5] },
      },
    },
    {
      id: 'neon', title: 'Neon Touchline', artist: ART, style: 'Synthwave', bpm: 100, mode: 'minor', delay: 0.75,
      root: { bass: 35, comp: 59, lead: 71, pad: 59 }, inst: { bass: 'synth', comp: 'pad', lead: 'saw', pad: 'pad' },
      kit: { kf0: 150, kf1: 45, kd: 0.35, sf: 1200, sd: 0.22 }, rev: { drums: 0.3, lead: 0.3, pad: 0.4, comp: 0.25 },
      fill: { t: '........x.x.....', T: '............x.x.', s: '..............xx' }, swellInto: ['chorus'],
      form: [['intro', 8], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['break', 8], ['chorus', 8]],
      sec: {
        intro: { prog: [0, 5, 2, 6], drums: { h: 'x.x.x.x.x.x.x.x.' }, pad: 0.7, arp: 'wave', crash: false, noFill: true },
        verse: { prog: [0, 5, 2, 6], drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: ['r-o-r-o-r-o-r-o-', 0.6], pad: 0.5, arp: 'wave', lead: { pool: 'anthem', lo: -2, hi: 5, v: 0.75 } },
        chorus: { prog: [5, 6, 0, 0], drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo' }, bass: ['rrrrrrrrrrrrrrrr', 0.5], pad: 0.6, arp: 'wave', lead: { pool: 'anthem', lo: 0, hi: 8, v: 1 } },
        break: { prog: [3, 4, 5, 5], drums: {}, pad: 0.9, arp: 'wave', lead: { pool: 'epic', lo: -2, hi: 5, v: 0.5 }, crash: false },
      },
    },
  ];
  const WALK = {
    id: 'walkout', title: 'Tunnel Walk', artist: ART, style: 'Walk-out theme', bpm: 96, mode: 'minor', ost16: true,
    root: { bass: 40, comp: 76, lead: 64, pad: 52 }, inst: { bass: 'orch', comp: 'strings', lead: 'brass', pad: 'strings' },
    rev: { drums: 0.3, comp: 0.35, lead: 0.35, pad: 0.4, bass: 0.1 }, swellInto: ['A'], dv: { s: 0.5 },
    form: [['A', 4], ['B', 4]],
    sec: {
      A: { prog: [0, 5, 2, 6], drums: { tk: 'x.....x.x.......', ti: 'x.......o.......' }, bass: ['R-------R-------', 0.95], pad: 0.6, ost: true, lead: { pool: 'epic', lo: -3, hi: 4, v: 0.5 }, noFill: true },
      B: { prog: [3, 5, 6, 6], drums: { tk: 'x..x..x.x.x.x...', ti: 'x...x...o...x...', c: '....x.......x...', s: 'g.g.x.g.g.g.x.gg' }, bass: ['R---R---R---R---', 0.9], pad: 0.7, comp: ['x---------------', 1], ost: true, lead: { pool: 'epic', lo: 0, hi: 7, v: 0.95 }, fill: { s: 'x.x.x.x.xxxxxxxx' } },
    },
  };

  function keyName(st) { return NOTE_NAMES[st.root.bass % 12] + ' ' + st.mode; }
  function desc(st) { return { id: st.id, title: st.title, artist: st.artist, style: st.style, bpm: st.bpm, key: keyName(st) }; }

  function compile(st) {
    if (st._c) return st._c;
    const R = rng(hash('track:' + st.id)), scale = SCALES[st.mode];
    const barMap = [];
    st.form.forEach((f, si) => { for (let b = 0; b < f[1]; b++) barMap.push({ sec: f[0], bib: b, len: f[1], si, first: b === 0, last: b === f[1] - 1 }); });
    const mel = {}, bass = {}, comp = {};
    Object.keys(st.sec).forEach(name => {
      const sc = st.sec[name], ch8 = []; for (let i = 0; i < 8; i++) ch8.push(sc.prog[i % sc.prog.length]);
      if (sc.lead) mel[name] = melody8(R, ch8, sc.lead.pool, sc.lead.lo, sc.lead.hi);
      if (sc.bass) bass[name] = parsePat(sc.bass[0]);
      if (sc.comp) comp[name] = parsePat(sc.comp[0]);
    });
    st._c = { scale, barMap, formBars: barMap.length, mel, bass, comp, barSec: 240 / st.bpm };
    return st._c;
  }
  function voicing(S, c, center, n) {
    const out = [];
    for (let k = 0; k < n; k++) { let m = degMidi(center, S.scale, c + 2 * k); while (m >= center + 7) m -= 12; while (m < center - 5) m += 12; out.push(m); }
    return out.sort((a, b) => a - b);
  }
  const wrapB = c => (c > 4 ? c - 7 : c);
  const VEL = { X: 1, x: 0.85, o: 0.5, g: 0.22 };
  const BDEG = { r: 0, R: 0, f: 4, o: 7, O: 7, t: 2, g: 0, l: -3 };

  const LANES = {
    k: (P, t, v) => D.kick(P.b.drums, t, v, P.st.kit),
    s: (P, t, v) => D.snare(P.b.drums, t, v, P.st.kit),
    c: (P, t, v) => D.clap(P.b.drums, t, v),
    h: (P, t, v) => D.hat(P.b.drums, t, v, false),
    H: (P, t, v) => D.hat(P.b.drums, t, v, true),
    sh: (P, t, v) => D.shaker(P.b.drums, t, v),
    t: (P, t, v) => D.tom(P.b.drums, t, v, 190),
    T: (P, t, v) => D.tom(P.b.drums, t, v, 115),
    cg: (P, t, v, ch) => D.conga(P.b.drums, t, v, ch === 'o' ? 196 : 294),
    su: (P, t, v, ch) => D.surdo(P.b.drums, t, ch === 'o' ? 0.8 : v, ch !== 'o'),
    ta: (P, t, v) => D.tamborim(P.b.drums, t, v),
    bl: (P, t, v, ch) => D.agogo(P.b.drums, t, 0.9, ch !== 'o'),
    cb: (P, t, v) => D.cowbell(P.b.drums, t, v),
    cl: (P, t, v) => D.clave(P.b.drums, t, v),
    cr: (P, t, v) => D.crash(P.b.drums, t, v),
    ti: (P, t, v, ch) => D.timp(P.b.drums, t, v, P.st.root.bass + (ch === 'o' ? -5 : 0)),
    tk: (P, t, v) => D.taiko(P.b.drums, t, v),
  };

  // ------------------------------------------------------------------ track player
  function TrackPlayer(st, t0, fadeIn, opts) {
    const S = compile(st), nodes = [];
    const out = ctx.createGain(); nodes.push(out);
    if (fadeIn > 0) { out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(1, t0 + fadeIn); } else out.gain.value = 1;
    out.connect(opts.direct ? bus : mainIn);
    const rv = st.rev || {};
    const mk = (send, name) => { const g = ctx.createGain(); if (api._mute.indexOf(name) >= 0) g.gain.value = 0; g.connect(out); nodes.push(g); if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(revIn); nodes.push(s); } return g; };
    const P = { st, S, out, nodes, sd: 60 / st.bpm / 4, next: t0, step: 0, stopAt: Infinity, t0 };
    P.b = { drums: mk(rv.drums == null ? 0.1 : rv.drums, 'drums'), bass: mk(rv.bass || 0.02), comp: mk(rv.comp == null ? 0.2 : rv.comp), lead: mk(rv.lead == null ? 0.25 : rv.lead), pad: mk(rv.pad == null ? 0.35 : rv.pad), fx: mk(0.45) };
    if (st.inst.comp === 'power') { // distorted guitar bus
      const pre = ctx.createGain(); pre.gain.value = 2.2; const ws = ctx.createWaveShaper(); ws.curve = distCurve; ws.oversample = '2x';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.8;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 900; pk.gain.value = -4; pk.Q.value = 1;
      const post = ctx.createGain(); post.gain.value = 0.32;
      pre.connect(ws); ws.connect(lp); lp.connect(pk); pk.connect(post); post.connect(P.b.comp); nodes.push(pre, ws, lp, pk, post); P.gtr = pre;
    }
    if (st.delay) { // tempo-synced feedback delay on lead
      const dl = ctx.createDelay(2); dl.delayTime.value = st.delay * 60 / st.bpm;
      const fb = ctx.createGain(); fb.gain.value = 0.33; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const wet = ctx.createGain(); wet.gain.value = 0.28;
      P.b.lead.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(out); nodes.push(dl, fb, lp, wet);
    }
    P.pump = function (h) { while (P.next < h && P.next < P.stopAt) { safe(() => trackStep(P, P.next)); P.step++; P.next += P.sd; } };
    P.stop = function (t, fade) {
      if (P.stopAt !== Infinity && P.stopAt <= t + fade) return;
      const g = out.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
      g.linearRampToValueAtTime(0, t + Math.max(0.02, fade)); P.stopAt = t + Math.max(0.02, fade);
    };
    P.dead = n => n > P.stopAt + 1.5;
    P.dispose = () => nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
    return P;
  }

  function trackStep(P, t) {
    const st = P.st, S = P.S, s16 = P.step % 16, bar = Math.floor(P.step / 16);
    const info = S.barMap[bar % S.formBars], sec = st.sec[info.sec];
    const chord = sec.prog[info.bib % sec.prog.length];
    const nInfo = S.barMap[(bar + 1) % S.formBars], nsec = st.sec[nInfo.sec], nChord = nsec.prog[nInfo.bib % nsec.prog.length];
    const tt = t + (s16 % 2 ? (st.swing || 0) * P.sd * 2 : 0), sd = P.sd;
    const hum = () => 0.9 + Math.random() * 0.2;
    // drums
    let dr = sec.drums || {};
    const fill = sec.fill || (!sec.noFill && st.fill);
    if (info.last && fill && info.len >= 4) dr = Object.assign({}, dr, fill);
    const lowI = intensity < 0.35;
    for (const lane in dr) {
      const pat = dr[lane]; if (!pat) continue;
      if (lowI && lane !== 'k' && lane !== 'tk' && lane !== 'su') continue;
      const ch = pat[(info.bib * 16 + s16) % pat.length], v = VEL[ch];
      if (v) LANES[lane](P, tt, Math.min(1, v * hum()) * ((st.dv && st.dv[lane]) || 1), ch);
    }
    if (info.first && s16 === 0 && bar > 0 && sec.crash !== false) D.crash(P.b.drums, t, 0.8);
    // transitions
    if (info.last && s16 === 0) {
      if (st.swellInto && st.swellInto.indexOf(nInfo.sec) >= 0) swellNoise(P.b.fx, t, 16 * sd, 0.12, 2500, 9000);
      if (st.rollInto && st.rollInto.indexOf(nInfo.sec) >= 0) D.roll(P.b.drums, t, 16 * sd, st.root.bass, 0.08, 0.55);
    }
    if (st.riserIn && st.riserIn.indexOf(info.sec) >= 0 && info.bib === info.len - 2 && s16 === 0) swellNoise(P.b.fx, t, 32 * sd, 0.1, 400, 7000, 'bandpass', 2.5);
    if (st.pump && s16 % 4 === 0) [P.b.pad, P.b.comp].forEach(b => { b.gain.setTargetAtTime(0.3, t, 0.006); b.gain.setTargetAtTime(1, t + 0.03, sd * 0.9); });
    // bass
    if (sec.bass) {
      const ev = S.bass[info.sec][s16];
      if (ev) {
        let deg = ev.ch === 'a' ? wrapB(nChord) - 1 : wrapB(chord) + (BDEG[ev.ch] || 0);
        const v = ev.ch === 'g' ? 0.4 : ev.ch === 'R' || ev.ch === 'O' ? 1 : 0.85;
        BASS[st.inst.bass](P.b.bass, tt, mtof(degMidi(st.root.bass, S.scale, deg)), ev.len * sd * sec.bass[1], v);
      }
    }
    // chords
    if (sec.comp) {
      const ev = S.comp[info.sec][s16];
      if (ev) CHORD[st.inst.comp](P, tt, voicing(S, chord, st.root.comp, st.c7 ? 4 : 3), ev.len * sd * sec.comp[1], ev.ch === 'o' ? 0.6 : 1, degMidi(st.root.comp, S.scale, wrapB(chord)));
    }
    if (sec.pad && s16 === 0 && st.inst.pad) CHORD[st.inst.pad](P, t, voicing(S, chord, st.root.pad, st.c7 ? 4 : 3), 16 * sd, sec.pad, 0, P.b.pad);
    // lead
    if (sec.lead && S.mel[info.sec]) {
      const n = S.mel[info.sec][info.bib % 8].get(s16);
      if (n) {
        const m = degMidi(st.root.lead, S.scale, n.deg), v = sec.lead.v == null ? 1 : sec.lead.v;
        LEAD[st.inst.lead](P.b.lead, tt, mtof(m), n.len * sd * 0.92, v);
        if (info.si === st.form.length - 1 && st.form.length > 2) LEAD[st.inst.lead](P.b.lead, tt, mtof(m + 12), n.len * sd * 0.92, v * 0.35);
      }
    }
    // extras
    if (sec.ost && (st.ost16 || s16 % 2 === 0)) {
      const offs = [0, 0, 4, 0, 7, 0, 4, 2], k = st.ost16 ? s16 % 8 : (s16 >> 1);
      spic(P.b.comp, tt, mtof(degMidi(st.root.bass + 12, S.scale, wrapB(chord) + offs[k])), (s16 % 4 === 0 ? 1 : 0.7));
    }
    if (sec.arp === 'wave' && (info.sec !== 'intro' || s16 % 2 === 0)) {
      const vs = voicing(S, chord, st.root.comp + 12, 3), seq = [0, 1, 2, 1, 0, 1, 2, 3], i = seq[s16 % 8];
      const m = i === 3 ? vs[0] + 12 : vs[i];
      synth(P.b.lead, tt, mtof(m), sd * 0.6, { w: 'square', det: [0], g: 0.025, a: 0.003, d: 0.1, s: 0.2, r: 0.06, lp: 1800, fe: 1500, fd: 0.08, p: 0 });
    }
    if (sec.arp === 'gtr' && s16 % 2 === 1) {
      const vs = voicing(S, chord, st.root.comp + 12, 3), seq = [0, 2, 1, 2, 0, 2, 1, 2];
      synth(P.b.comp, tt, mtof(vs[seq[s16 >> 1]]), 0.08, { w: 'triangle', det: [0], g: 0.05, a: 0.002, d: 0.12, s: 0, r: 0.08, p: 0 });
    }
    if (sec.horns && (s16 === 6 || s16 === 14)) brassChord(P.b.lead, tt, voicing(S, chord, st.root.comp, 3), sd * 1.6, 0.7);
    if (sec.whistle && info.bib % 2 === 0 && (s16 === 0 || s16 === 3 || s16 === 6)) whistle(P.b.fx, tt, s16 === 6 ? 0.35 : 0.1, 1);
  }

  // ------------------------------------------------------------------ scheduler
  function ensureTimer() { if (offline || timer || !ctx) return; timer = setInterval(tick, TICK); }
  function tick() { if (!ctx) return; pump(ctx.currentTime); if (!players.size && !playlistOn) { clearInterval(timer); timer = null; } }
  function pump(n) {
    if (!ctx) return;
    const h = n + LOOK;
    if (playlistOn && plPlayer && h >= plPlayer.switchAt) safe(() => nextTrack(plPlayer.switchAt));
    players.forEach(p => { p.pump(h, n); if (!offline && p.dead(n)) { p.dispose(); players.delete(p); } });
    if (anthemSt && !anthemSt.ended && n >= anthemSt.endAt) finishAnthem();
  }

  // ------------------------------------------------------------------ playlist
  function shuffle() { order = STYLES.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = order[i]; order[i] = order[j]; order[j] = x; } orderPos = 0; }
  function playStyle(st, T, fade) {
    const old = plPlayer;
    if (old) old.stop(T, fade);
    const p = TrackPlayer(st, T, fade, {});
    const S = compile(st), wantSec = 90 + Math.random() * 60;
    const bars = Math.max(8, Math.round(wantSec / S.barSec / 4) * 4);
    p.switchAt = T + bars * S.barSec - XF;
    plPlayer = p; players.add(p); curDesc = desc(st);
    const d = curDesc;
    if (typeof api.onTrackChange === 'function') { if (offline) safe(() => api.onTrackChange(d)); else setTimeout(() => safe(() => api.onTrackChange(d)), Math.max(0, (T - now()) * 1000)); }
    ensureTimer();
    return p;
  }
  function nextTrack(T) { if (!order.length) shuffle(); orderPos = (orderPos + 1) % order.length; playStyle(order[orderPos], T, XF); }

  // ------------------------------------------------------------------ stings
  function stingBoot(T) {
    const o = outNode(1, 0.45), fx = outNode(1, 0.8);
    const sw = [38, 50, 57, 62, 66, 69, 76]; // D major add9, open voicing
    sw.forEach((m, i) => synth(o, T, mtof(m), 1.62, { w: 'sawtooth', det: [-10, 10], g: (i === 0 ? 0.06 : 0.035), a: 1.5, d: 0.1, s: 1, r: 0.12, lp: 400, fe: 3200, fa: 1.58, fs: 1, fd: 0.1, p: 2 }));
    swellNoise(fx, T, 1.6, 0.22, 2500, 9000);
    swellNoise(fx, T + 0.4, 1.2, 0.12, 300, 5000, 'bandpass', 2);
    const H = T + 1.6;
    thit(o, H, { f0: 120, f1: 30, pt: 0.6, g: 0.9, d: 1.2, p: 2 });
    hitNoise(o, H, { ft: 'lowpass', f: 1400, g: 0.45, d: 0.35, p: 2 });
    D.crash(fx, H, 1); D.timp(o, H, 0.9, 38);
    [38, 50, 57, 62, 66, 69, 74].forEach(m => synth(o, H, mtof(m), 0.25, { w: 'sawtooth', det: [-7, 7], g: 0.05, a: 0.01, d: 0.6, s: 0.4, r: 1.6, lp: 600, fe: 3500, fa: 0.02, fs: 0.3, fd: 0.5, p: 2 }));
    [86, 90, 93, 98, 100, 105].forEach((m, i) => { // shimmer
      const t = H + 0.08 + i * 0.09;
      synth(fx, t, mtof(m), 0.02, { w: ['sine', 'sine'], det: [0, 4], mul: [1, 2.01], mix: [1, 0.2], g: 0.06, a: 0.003, d: 1.2, s: 0, r: 1.0, p: 2 });
    });
    freeLater([o, fx, o._send, fx._send], T + 4.5);
    return 4.0;
  }
  function stingPress(T) {
    const o = outNode(1, 0.35);
    [69, 74, 78, 81].forEach((m, i) => synth(o, T + i * 0.055, mtof(m), 0.09, { w: 'square', det: [0, 7], g: 0.045, a: 0.003, d: 0.15, s: 0.2, r: 0.1, lp: 1500, fe: 3500, fd: 0.1, p: 2 }));
    [62, 66, 69, 74].forEach(m => synth(o, T + 0.22, mtof(m), 0.4, { w: 'sawtooth', det: [-8, 8], g: 0.03, a: 0.01, d: 0.4, s: 0.5, r: 0.35, lp: 900, fe: 2500, fd: 0.3, p: 2 }));
    thit(o, T + 0.22, { f0: 140, f1: 45, pt: 0.1, g: 0.55, d: 0.25, p: 2 });
    hitNoise(o, T + 0.22, { ft: 'highpass', f: 6000, g: 0.08, d: 0.4, p: 2 });
    freeLater([o, o._send], T + 1.6);
    return 1.0;
  }
  function stingGoal(T) {
    const o = outNode(1, 0.4);
    for (let i = 0; i < 6; i++) D.snare(o, T + i * 0.05, 0.3 + i * 0.1, { sd: 0.08 });
    [65, 65, 65].forEach((m, i) => LEAD.brass(o, T + i * 0.1, mtof(m), 0.08, 0.8));
    const H = T + 0.3;
    brassChord(o, H, [46, 58, 62, 65, 70, 74], 1.2, 1);
    synth(o, H + 0.05, mtof(77), 1.1, { w: 'sawtooth', det: [-6, 6], g: 0.06, a: 0.08, d: 0.3, s: 0.85, r: 0.3, lp: 900, fe: 2500, fa: 0.1, fs: 0.5, glide: 0.75, gt: 0.12, vib: [5.5, 15, 0.3], p: 2 });
    D.timp(o, H, 1, 34); D.crash(o, H, 1); D.kick(o, H, 1, { kd: 0.5 });
    D.timp(o, H + 1.2, 0.6, 41);
    freeLater([o, o._send], T + 3.5);
    return 2.0;
  }
  function stingVictory(T) {
    const o = outNode(1, 0.45), b = 0.45;
    const mel = [[0, 0.25, 67], [0.25, 0.25, 72], [0.5, 0.5, 76], [1, 1, 79], [2, 0.5, 77], [2.5, 0.5, 81], [3, 1, 84], [4, 0.5, 83], [4.5, 0.5, 81], [5, 0.5, 79], [5.5, 0.5, 77], [6, 0.33, 76], [6.33, 0.33, 77], [6.66, 0.34, 74]];
    mel.forEach(n => { LEAD.brass(o, T + n[0] * b, mtof(n[2]), n[1] * b * 0.95, 1); LEAD.brass(o, T + n[0] * b, mtof(n[2] - 12), n[1] * b * 0.95, 0.6); });
    const chords = [[0, [48, 55, 64, 67]], [2, [53, 57, 65, 69]], [4, [43, 55, 62, 65]], [6, [43, 55, 59, 65]]];
    chords.forEach(c => { CHORD.strings(null, T + c[0] * b, c[1], 2 * b, 1.4, 0, o); D.timp(o, T + c[0] * b, 0.7, c[1][0] < 46 ? 43 : 48); });
    const F = T + 7 * b;
    brassChord(o, F, [48, 60, 64, 67, 72, 76], 2.2, 1);
    CHORD.strings(null, F, [48, 55, 64, 67, 72], 2.4, 1.6, 0, o);
    D.roll(o, F - 2 * b, 2 * b, 43, 0.1, 0.6); D.timp(o, F, 1, 36); D.crash(o, F, 1); D.kick(o, F, 1, { kd: 0.6 });
    for (let i = 0; i < 6; i++) synth(o, F + 0.1 + i * 0.1, mtof([84, 88, 91, 96, 100, 103][i]), 0.02, { w: 'sine', det: [0], g: 0.05, a: 0.003, d: 1.3, s: 0, r: 1, p: 2 });
    D.timp(o, F + 2.3, 0.9, 36); D.crash(o, F + 2.3, 0.5);
    freeLater([o, o._send], T + 8);
    return 6.2;
  }
  function stingWhistle(T) {
    const o = outNode(1, 0.3);
    whistle(o, T, 0.12, 2.2); whistle(o, T + 0.22, 0.12, 2.2); whistle(o, T + 0.44, 0.7, 2.2);
    for (let i = 0; i < 16; i++) D.snare(o, T + 1.2 + i * 0.05, 0.15 + i * 0.045, { sd: 0.07 });
    const H = T + 2.0;
    D.crash(o, H, 1); D.kick(o, H, 1, { kd: 0.5 }); D.timp(o, H, 0.9, 38);
    brassChord(o, H, [50, 57, 62, 66, 69], 0.6, 0.9);
    freeLater([o, o._send], T + 4);
    return 2.6;
  }
  const STINGS = { boot: stingBoot, press: stingPress, goal: stingGoal, victory: stingVictory, 'whistle-intro': stingWhistle };

  // ------------------------------------------------------------------ anthem
  const H4 = [[[0, 4], [4, 4], [8, 4], [12, 4]], [[0, 6], [6, 2], [8, 4], [12, 4]], [[0, 8], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 8]], [[0, 4], [4, 2], [6, 2], [8, 8]]];
  const H3 = [[[0, 4], [4, 4], [8, 4]], [[0, 8], [8, 4]], [[0, 6], [6, 2], [8, 4]], [[0, 4], [4, 8]]];
  const H4c = { half: [[[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 8]]], full: [[[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 8]]], fin: [[[0, 16]]] };
  const H3c = { half: [[[0, 8], [8, 4]], [[0, 12]]], full: [[[0, 8], [8, 4]], [[0, 12]]], fin: [[[0, 12]]] };
  const AMAJ = { A: [[0, 3, 0, 4], [0, 5, 1, 4], [0, 4, 5, 4], [0, 3, 5, 4]], F: [[0, 3, 4, 0], [0, 5, 4, 0], [3, 0, 4, 0], [5, 3, 4, 0]], B: [[3, 0, 3, 4], [5, 3, 0, 4], [3, 4, 5, 4], [5, 1, 3, 4]] };
  const AMIN = { A: [[0, 3, 0, 4], [0, 5, 3, 4]], F: [[0, 3, 4, 0], [5, 3, 4, 0]], B: [[5, 3, 5, 4], [3, 0, 3, 4], [5, 0, 3, 4]] };

  function teamKey(team) { return typeof team === 'string' ? team : (team && (team.id || team.code || team.short || team.name)) || 'team'; }
  function composeAnthem(team) {
    const id = teamKey(team), R = rng(hash('anthem:' + id)), pick = a => a[Math.floor(R() * a.length)];
    const beats = R() < 0.3 ? 3 : 4, bpm = 64 + Math.floor(R() * 21), minor = R() < 0.25;
    const tonic = 60 + Math.floor(R() * 8), scale = minor ? SCALES.harm : SCALES.major, T = minor ? AMIN : AMAJ;
    const spb = 60 / bpm, barB = beats;
    // choose structure so the total lands in ~36-45 s
    let best = null;
    for (const N of [4, 3, 2]) for (const intro of [1, 2]) {
      const totalB = (intro + 4 * N) * barB + 3, d = totalB * spb + 2 * barB * spb * 0.12 + 3.2;
      const score = d >= 36 && d <= 45 ? N * 10 - intro : -Math.abs(d - 40);
      if (!best || score > best.score) best = { N, intro, score };
    }
    const N = best.N, introBars = best.intro;
    const types = N === 4 ? ['A', 'F', 'B', 'F'] : N === 3 ? ['A', 'B', 'F'] : ['A', 'F'];
    const pool = beats === 3 ? H3 : H4, cads = beats === 3 ? H3c : H4c;
    const strong = beats === 3 ? (st, len) => st % 12 === 0 || len >= 8 : (st, len) => st % 8 === 0 || len >= 8;
    const avoid = minor ? (d, c) => (md7(d) === 6 && md7(c) !== 4) || (md7(d) === 5 && md7(c) === 4) : null;
    const rA = pick(pool), rB = pick(pool), rC = pick(pool), rD = pick(pool);
    const chA = pick(T.A), chF = pick(T.F), chB = pick(T.B);
    const lo = -3, hi = 8;
    const phA = genPhrase(R, chA, [rA, rB, rA, pick(cads.half)], { lo, hi, contour: [0.3, 0.5, 0.7, 0.45], cad: 'half', prev: nearestCT(0, 2, lo, hi), strong, avoid });
    const sameF = chF[0] === chA[0] && chF[1] === chA[1];
    const phF = genPhrase(R, chF, [rA, rB, rC, pick(cads.fin)], { lo, hi, contour: [0.3, 0.55, 0.8, 0.2], cad: 'full', prev: phA[phA.length - 1].deg, strong, avoid, copy: sameF ? phA.filter(n => n.bar < 2) : null, copyBars: 2 });
    const phB = genPhrase(R, chB, [rC, rD, rC, pick(cads.half)], { lo: 0, hi: hi + 2, contour: [0.55, 0.8, 1.0, 0.6], cad: 'half', prev: phF[phF.length - 1].deg, strong, avoid });
    const phrases = types.map(tp => ({ type: tp, chords: tp === 'A' ? chA : tp === 'B' ? chB : chF, notes: tp === 'A' ? phA : tp === 'B' ? phB : phF }));
    // if the A phrase is followed by F with full cadence, last F uses final rhythm; inner F (N=4) ends with a full cadence too
    const bodyStart = introBars * barB, endBeat = bodyStart + 4 * N * barB, fermata = 3;
    const ritB = 2 * barB, k = 0.35;
    function b2s(b) {
      const rs = endBeat - ritB;
      if (b <= rs) return b * spb;
      const x = Math.min(b, endBeat) - rs, u = x / ritB;
      let s = rs * spb + spb * (x + k * ritB * u * u * u / 3);
      if (b > endBeat) s += (b - endBeat) * spb * (1 + k);
      return s;
    }
    const totalBeats = endBeat + fermata, musicEnd = b2s(totalBeats), dur = musicEnd + 3.2;
    return { id, bpm, beats, tonic, minor, scale, introBars, N, phrases, bodyStart, endBeat, totalBeats, b2s, dur, musicEnd, key: NOTE_NAMES[tonic % 12] + (minor ? ' minor' : ' major'), meter: beats + '/4' };
  }

  function getApplause() {
    if (applauseBuf && applauseBuf._sr === ctx.sampleRate) return applauseBuf;
    const sr = ctx.sampleRate, len = Math.floor(sr * 5), buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch), L = Math.floor(sr * 0.006), tc = sr * 0.0012;
      for (let i = 0; i < 2600; i++) {
        const p = Math.floor(Math.pow(Math.random(), 1.4) * (len - L)), a = 0.25 + Math.random() * 0.6;
        for (let j = 0; j < L; j++) d[p + j] += (Math.random() * 2 - 1) * a * Math.exp(-j / tc);
      }
      let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
      const sc = 0.8 / (pk || 1); for (let i = 0; i < len; i++) d[i] *= sc;
    }
    buf._sr = sr; applauseBuf = buf; return buf;
  }

  // crowd choir: persistent detuned formant voices following the melody
  function crowdChoir(out, T0, notes, endT, R) {
    const nodes = [], end = T0 + endT + 0.6;
    const groups = [
      { oct: 0, F: [[830, 1220, 2900], [500, 880, 2850]], n: 6 },
      { oct: -12, F: [[700, 1150, 2600], [460, 800, 2700]], n: 6 },
    ];
    const vowels = []; let lastPh = -1;
    notes.forEach(n => { if (n.ph !== lastPh) { vowels.push({ t: n.t - 0.1, v: n.ph % 2 }); lastPh = n.ph; } });
    groups.forEach(G => {
      const sum = ctx.createGain(); sum.gain.value = 2.6 / G.n; nodes.push(sum);
      const pre = ctx.createBiquadFilter(); pre.type = 'lowpass'; pre.frequency.value = 3600; sum.connect(pre); nodes.push(pre);
      G.F[0].forEach((f, i) => {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = [4.5, 6, 8][i]; bp.frequency.value = f;
        vowels.forEach(vw => bp.frequency.setTargetAtTime(G.F[vw.v][i], T0 + Math.max(0, vw.t), 0.12));
        const g = ctx.createGain(); g.gain.value = [1, 0.6, 0.28][i]; pre.connect(bp); bp.connect(g); g.connect(out); nodes.push(bp, g);
      });
      for (let k = 0; k < G.n; k++) {
        const os = ctx.createOscillator(), vg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        os.type = k % 3 === 2 ? 'square' : 'sawtooth'; os.detune.value = (R() - 0.5) * 26;
        lfo.frequency.value = 4.3 + R() * 2.2; lg.gain.value = 10 + R() * 16; lfo.connect(lg); lg.connect(os.detune);
        vg.gain.setValueAtTime(0, T0);
        notes.forEach((n, j) => {
          const jit = -0.02 + R() * 0.1, t = T0 + n.t + jit, f = mtof(n.midi + G.oct) * Math.pow(2, (R() - 0.5) * 16 / 1200);
          if (j === 0) os.frequency.setValueAtTime(f, T0); else os.frequency.setTargetAtTime(f, t - 0.015, 0.03);
          const lvl = n.lvl * (0.75 + R() * 0.5);
          vg.gain.setTargetAtTime(lvl, t, 0.05);
          const nx = notes[j + 1], gap = nx ? nx.t - (n.t + n.dur) : 9;
          if (gap > 0.2 || !nx) vg.gain.setTargetAtTime(0, T0 + n.t + n.dur + jit, nx ? 0.06 : 0.35);
          else vg.gain.setTargetAtTime(lvl * 0.55, T0 + n.t + n.dur - 0.07 + jit, 0.03);
        });
        os.connect(vg); vg.connect(sum); os.start(T0); lfo.start(T0); os.stop(end); lfo.stop(end);
        nodes.push(os, vg, lfo, lg);
      }
    });
    // breathy texture
    const s = nsrc(T0, end), bf = ctx.createBiquadFilter(), bg = ctx.createGain(); bf.type = 'bandpass'; bf.frequency.value = 1100; bf.Q.value = 0.8;
    bg.gain.setValueAtTime(0, T0);
    let lastLvl = -1;
    notes.forEach(n => { if (n.lvl !== lastLvl) { bg.gain.setTargetAtTime(n.lvl * 0.05, T0 + n.t, 0.3); lastLvl = n.lvl; } });
    const ln = notes[notes.length - 1]; bg.gain.setTargetAtTime(0, T0 + ln.t + ln.dur, 0.3);
    s.connect(bf); bf.connect(bg); bg.connect(out); nodes.push(s, bf, bg);
    return nodes;
  }

  function playAnthem(team, opts) {
    const A = composeAnthem(team), T0 = now() + 0.1, crowd = opts.crowd !== false;
    const R = rng(hash('crowd:' + A.id));
    const ev = []; const at = (b, fn) => ev.push({ t: A.b2s(b), fn });
    const outO = ctx.createGain(); outO.gain.value = 1; outO.connect(bus);
    const send = ctx.createGain(); send.gain.value = 0.4; outO.connect(send); send.connect(revIn);
    const crowdOut = ctx.createGain(); crowdOut.gain.value = 1; crowdOut.connect(outO);
    const cSend = ctx.createGain(); cSend.gain.value = 0.9; crowdOut.connect(cSend); cSend.connect(revIn);
    const nodes = [outO, send, crowdOut, cSend];
    const bb = A.beats, sc = A.scale, ton = A.tonic;
    const mid = d => degMidi(ton, sc, d), dur = (b0, b1) => A.b2s(b1) - A.b2s(b0);
    const last = A.phrases.length - 1;
    // intro: dominant pedal, timpani roll, brass call
    const ib = A.bodyStart;
    at(0, t => CHORD.strings(null, t, [mid(-3), mid(1), mid(4) - 12].sort((a, b) => a - b), dur(0, ib) + 0.2, 1.2, 0, outO));
    at(0, t => D.roll(outO, t, dur(0, ib) - 0.05, ton - 17, 0.06, 0.45));
    at(0, t => swellNoise(outO, t, dur(0, ib), 0.08, 3000, 9000));
    const cb = ib - bb;
    [[0, 1.5, 4], [1.5, 0.5, 4], [2, bb === 3 ? 1 : 2, 1]].forEach(n => at(cb + n[0], t => { LEAD.brass(outO, t, mtof(mid(n[2])), dur(cb + n[0], cb + n[0] + n[1]) * 0.92, 0.85); LEAD.brass(outO, t, mtof(mid(n[2]) - 12), dur(cb + n[0], cb + n[0] + n[1]) * 0.92, 0.6); }));
    const crowdNotes = [];
    A.phrases.forEach((ph, pi) => {
      const pb = A.bodyStart + pi * 4 * bb, climax = pi === last, lvl = climax ? 1 : [0.55, 0.7, 0.8][Math.min(2, pi)];
      // harmony
      ph.chords.forEach((c, bi) => {
        const b0 = pb + bi * bb, isLastBar = climax && bi === 3, b1 = isLastBar ? A.totalBeats : b0 + bb;
        const vs = []; for (let k = 0; k < 3; k++) { let m = mid(c + 2 * k); while (m >= ton + 2) m -= 12; while (m < ton - 10) m += 12; vs.push(m); }
        at(b0, t => CHORD.strings(null, t, vs.sort((a, b) => a - b), dur(b0, b1) + 0.05, climax ? 1.5 : 1.1, 0, outO));
        const bassM = mid(wrapB(c)) - 24;
        at(b0, t => BASS.orch(outO, t, mtof(bassM), dur(b0, b1) * 0.97, climax ? 1.1 : 0.85));
        if (climax || ph.type === 'B') {
          const tm = md7(c) === 4 ? ton - 17 : ton - 12;
          at(b0, t => D.timp(outO, t, climax ? 0.8 : 0.5, tm));
          if (climax && bb === 4 && !isLastBar) at(b0 + 2, t => D.timp(outO, t, 0.55, tm));
        }
      });
      if (pi > 0) at(pb, t => D.crash(outO, t, climax ? 0.9 : 0.4));
      if (climax) {
        at(pb - bb, t => D.roll(outO, t, dur(pb - bb, pb), ton - 12, 0.05, 0.5));
        at(pb - bb, t => swellNoise(outO, t, dur(pb - bb, pb), 0.15, 2500, 9000));
        at(pb, t => D.kick(outO, t, 0.9, { kd: 0.6 }));
      }
      // melody
      ph.notes.forEach((n, ni) => {
        const b0 = pb + n.bar * bb + n.st / 4, isFinal = climax && ni === ph.notes.length - 1;
        const b1 = isFinal ? A.totalBeats : b0 + n.len / 4, m = mid(n.deg), d = dur(b0, b1);
        at(b0, t => {
          if (pi === 0) LEAD.brass(outO, t, mtof(m), d * 0.94, 0.55);
          else if (climax) {
            LEAD.brass(outO, t, mtof(m), d * 0.94, 1); LEAD.brass(outO, t, mtof(m - 12), d * 0.94, 0.75);
            const c = ph.chords[n.bar]; let h = n.deg - 2; while (!isCT(h, c)) h--; LEAD.brass(outO, t, mtof(mid(h)), d * 0.94, 0.6);
          } else { LEAD.brass(outO, t, mtof(m), d * 0.94, 0.8); if (ph.type === 'B') LEAD.brass(outO, t, mtof(m - 12), d * 0.94, 0.5); }
        });
        crowdNotes.push({ t: A.b2s(b0), dur: d, midi: m, lvl: 0.11 * lvl, ph: pi });
      });
    });
    // ending: tonic roll, final crash, crowd cheer + applause
    const fb = A.endBeat;
    at(fb, t => D.roll(outO, t, dur(fb, A.totalBeats), ton - 12, 0.15, 0.7));
    at(fb, t => swellNoise(outO, t, dur(fb, A.totalBeats), 0.14, 2500, 9000));
    at(A.totalBeats, t => { D.crash(outO, t, 1); D.timp(outO, t, 1, ton - 12); D.kick(outO, t, 1, { kd: 0.7 }); });
    if (crowd) {
      at(A.totalBeats - 1, t => {
        const s = ctx.createBufferSource(); s.buffer = getApplause(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.8); g.gain.setValueAtTime(0.5, t + 2.5); g.gain.linearRampToValueAtTime(0, t + 4.8);
        s.connect(f); f.connect(g); g.connect(crowdOut); s.start(t); s.stop(t + 4.9); cleanup(s, [s, f, g]);
        const n = nsrc(t, t + 4.9), nf = ctx.createBiquadFilter(), ng = ctx.createGain(); nf.type = 'bandpass'; nf.frequency.value = 750; nf.Q.value = 0.5;
        ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.25, t + 1.0); ng.gain.setTargetAtTime(0, t + 2.2, 0.8);
        n.connect(nf); nf.connect(ng); ng.connect(crowdOut); cleanup(n, [n, nf, ng]);
      });
      nodes.push.apply(nodes, crowdChoir(crowdOut, T0, crowdNotes, A.musicEnd, R));
    }
    ev.sort((a, b) => a.t - b.t);
    const seq = { idx: 0, stopAt: Infinity };
    seq.pump = h => { while (seq.idx < ev.length && T0 + ev[seq.idx].t < h && T0 + ev[seq.idx].t < seq.stopAt) { const e = ev[seq.idx++]; safe(() => e.fn(T0 + e.t)); } };
    seq.dead = n => n > Math.min(T0 + A.dur, seq.stopAt) + 1.5;
    seq.dispose = () => nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
    seq.stop = (t, fade) => { const g = outO.gain; if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); } g.linearRampToValueAtTime(0, t + fade); seq.stopAt = t + fade; nodes.forEach(nd => { if (nd.stop && nd !== outO) { try { nd.stop(t + fade + 0.05); } catch (e) {} } }); };
    players.add(seq); ensureTimer();
    return { A, seq, T0 };
  }
  function finishAnthem() {
    const s = anthemSt; if (!s || s.ended) return; s.ended = true; clearTimeout(s.fallback); anthemSt = null;
    if (typeof s.onEnd === 'function') safe(() => s.onEnd());
  }

  // ------------------------------------------------------------------ public API
  api.playlist = STYLES.map(desc);
  api.onTrackChange = null;
  api.attach = function (c, d) {
    if (!c) return;
    if (c === ctx && d === dest) return;
    if (ctx) api._reset();
    ctx = c; dest = d || c.destination;
    offline = typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;
    safe(build);
  };
  api._reset = function () {
    clearInterval(timer); timer = null;
    players.forEach(p => safe(() => p.dispose())); players.clear();
    playlistOn = false; plPlayer = null; walkPlayer = null; curDesc = null; voices = [];
    if (anthemSt) { clearTimeout(anthemSt.fallback); anthemSt = null; }
    globalNodes.forEach(n => { try { n.disconnect(); } catch (e) {} }); globalNodes = [];
    ctx = null; dest = null;
  };
  api.start = function () {
    if (!ctx || playlistOn) return;
    playlistOn = true; shuffle(); orderPos = Math.floor(Math.random() * order.length);
    if (walkPlayer) { walkPlayer.stop(now(), 1); walkPlayer = null; }
    safe(() => playStyle(order[orderPos], now() + 0.08, 1.0));
  };
  api.play = function (id) { // play a specific playlist track (keeps rotating afterwards)
    if (!ctx) return;
    const st = STYLES.find(s => s.id === id) || STYLES[0];
    if (!order.length) shuffle(); orderPos = order.indexOf(st);
    playlistOn = true; safe(() => playStyle(st, now() + 0.08, plPlayer ? XF : 0.5));
  };
  api.next = function () { if (!ctx || !playlistOn) return; safe(() => nextTrack(now() + 0.05)); };
  api.stop = function (fade) {
    fade = fade == null ? 1.5 : fade; playlistOn = false;
    if (!ctx) return;
    const t = now();
    players.forEach(p => p.stop(t, fade));
    plPlayer = null; walkPlayer = null; curDesc = null;
    if (anthemSt) { clearTimeout(anthemSt.fallback); anthemSt = null; }
  };
  api.current = function () { return playlistOn ? curDesc : null; };
  api.sting = function (kind) {
    if (!ctx) return 0;
    const fn = STINGS[kind]; if (!fn) return 0;
    return safe(() => {
      const T = now() + 0.03, d = fn(T);
      if (plPlayer && kind !== 'boot') { const g = mainIn.gain; g.cancelScheduledValues(T); g.setTargetAtTime(0.35, T, 0.05); g.setTargetAtTime(1, T + d * 0.8, 0.4); }
      return d;
    }) || 0;
  };
  api.anthemInfo = function (team) { const A = composeAnthem(team); return { key: A.key, bpm: A.bpm, meter: A.meter, phrases: A.phrases.map(p => p.type).join(''), duration: +A.dur.toFixed(2) }; };
  api.anthem = function (team, opts) {
    opts = opts || {};
    const onEnd = opts.onEnd;
    if (anthemSt) api.stopAnthem(0.3);
    if (!ctx) { const d = composeAnthem(team).dur; if (onEnd) setTimeout(() => safe(onEnd), 0); return d; }
    if (playlistOn || walkPlayer) api.stop(1.0);
    const r = safe(() => playAnthem(team, opts));
    if (!r) { if (onEnd) setTimeout(() => safe(onEnd), 0); return 0; }
    anthemSt = { seq: r.seq, onEnd, endAt: r.T0 + r.A.dur, ended: false };
    const st = anthemSt;
    if (!offline) st.fallback = setTimeout(() => { if (anthemSt === st) finishAnthem(); }, (r.A.dur + 1.5) * 1000); // in case ctx is suspended
    return r.A.dur;
  };
  api.stopAnthem = function (fade) {
    if (!anthemSt) return;
    const s = anthemSt; anthemSt = null; clearTimeout(s.fallback);
    if (ctx) s.seq.stop(now(), fade == null ? 1.0 : fade);
  };
  api.walkout = function () {
    if (!ctx) return;
    if (playlistOn) api.stop(1.0);
    if (walkPlayer) return;
    walkPlayer = TrackPlayer(WALK, now() + 0.08, 0.6, { direct: true });
    players.add(walkPlayer); ensureTimer();
  };
  api.setIntensity = function (x) {
    intensity = Math.max(0, Math.min(1, +x || 0));
    if (tilt) tilt.frequency.setTargetAtTime(700 + Math.pow(intensity, 2) * 17300, now(), 0.4);
  };
  api._pump = function (t) { pump(t); };
  api._mute = []; // test hook: names of track buses to silence (e.g. ['drums'])
  api._styles = STYLES; api._walk = WALK; api._compose = composeAnthem;
  return api;
})();
if (typeof window !== 'undefined') window.Music = Music;
