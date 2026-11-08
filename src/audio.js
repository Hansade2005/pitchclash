// Synthesised stadium audio (no audio files) + optional spoken commentary via the OS speech engine.
const Sound = (() => {
  let ctx = null, master = null, sfx = null, crowdBus = null, crowdBed = null, crowdHigh = null, musicBus = null, voiceBus = null, weatherBus = null, windGain = null, windF = null;
  let volume = { master: 0.8, crowd: 0.8, sfx: 0.9, music: 0.55, voice: 1.0 }, commentary = true;
  try { const s = JSON.parse(localStorage.getItem('pc_audio') || 'null'); if (s) { volume = Object.assign(volume, s.volume || {}); commentary = s.commentary !== false; } } catch (e) {}

  function noiseBuffer(sec, brown) {
    const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } }
    return buf;
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = volume.master; master.connect(ctx.destination);
      sfx = ctx.createGain(); sfx.gain.value = volume.sfx; sfx.connect(master);
      crowdBus = ctx.createGain(); crowdBus.gain.value = volume.crowd; crowdBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = volume.music; musicBus.connect(master);
      voiceBus = ctx.createGain(); voiceBus.gain.value = volume.voice; voiceBus.connect(master);
      weatherBus = ctx.createGain(); weatherBus.gain.value = 0; weatherBus.connect(master);
      const rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuffer(3, false); rainSrc.loop = true;
      const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800; rainSrc.connect(rf); rf.connect(weatherBus); rainSrc.start();
      const windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuffer(4, true); windSrc.loop = true;
      windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 300; windF.Q.value = 1.5; windGain = ctx.createGain(); windGain.gain.value = 0;
      windSrc.connect(windF); windF.connect(windGain); windGain.connect(master); windSrc.start();
      loadCommentary();
      if (window.Music && Music.attach) { try { Music.attach(ctx, musicBus); } catch (e) { console.warn(e); } }
      const loop = (buf, freq, q, type = 'bandpass') => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(crowdBus); s.start(); return { g, f };
      };
      const brown = noiseBuffer(4, true), white = noiseBuffer(3, false);
      crowdBed = loop(brown, 500, 0.5);
      crowdHigh = loop(white, 1400, 0.8);
    } catch (e) { ctx = null; }
  }
  const t0 = () => ctx.currentTime;
  function noise(dur, freq, gain, type = 'lowpass', dest) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(dest || sfx); s.start();
  }
  function tone(freq, dur, gain, type = 'sine', slide = 0, delay = 0) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0() + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  // crowd swell: a burst of filtered noise shaped like a roar
  function swell(peak, attack, hold, release, freq = 900) {
    if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(attack + hold + release + 0.2, true);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.4;
    const g = ctx.createGain(), t = t0();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + attack + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    s.connect(f); f.connect(g); g.connect(crowdBus); s.start();
  }
  // vowel-ish "ooooh" / "booo" using formant-filtered sawtooth chorus
  function voices(base, dur, gain, formant, slide = 0) {
    if (!ctx) return;
    for (let i = 0; i < 14; i++) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = t0() + Math.random() * 0.08;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(base * (0.85 + Math.random() * 0.4), t);
      if (slide) o.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.4) + slide, t + dur);
      f.type = 'bandpass'; f.frequency.value = formant; f.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain / 14, t + 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(crowdBus); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  let chantT = null;
  function chant(on) {
    clearInterval(chantT); chantT = null;
    if (!on || !ctx) return;
    // rhythmic clap + "olé"-style tone pattern
    let beat = 0;
    chantT = setInterval(() => {
      if (!ctx) return;
      const pat = [1, 0, 1, 0, 1, 1, 1, 0];
      if (pat[beat % 8]) noise(0.08, 2200, 0.12, 'bandpass', crowdBus);
      if (beat % 16 === 0) voices(220, 1.1, 0.25, 700, 40);
      if (beat % 16 === 8) voices(196, 1.1, 0.22, 650, -20);
      beat++;
    }, 210);
  }

  let speaking = 0;
  function say(text, priority = 0) {
    if (!commentary || !window.speechSynthesis) return;
    if (speechSynthesis.speaking && priority <= speaking) return;
    if (priority > speaking) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const vs = speechSynthesis.getVoices();
    const v = vs.find(v => /en-GB/i.test(v.lang) && /male|george|ryan|daniel/i.test(v.name)) || vs.find(v => /en-GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
    if (v) u.voice = v;
    u.rate = priority >= 2 ? 1.15 : 1.05; u.pitch = priority >= 2 ? 1.1 : 1; u.volume = 0.9 * volume.master;
    speaking = priority; u.onend = () => { speaking = 0; };
    speechSynthesis.speak(u);
  }

  // ---------------- recorded commentary (Kokoro voice clips bundled with the game)
  let manifest = null; const buffers = new Map(); let voiceQueue = [], voicePlaying = null, voicePri = -1, lastLine = {};
  async function loadCommentary() {
    try { const r = await fetch('../assets/commentary/manifest.json'); if (r.ok) manifest = await r.json(); } catch (e) { manifest = null; }
  }
  async function getBuf(file) {
    if (buffers.has(file)) return buffers.get(file);
    const p = fetch('../assets/commentary/' + file).then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).catch(() => null);
    buffers.set(file, p); return p;
  }
  function pickLine(cat) {
    const arr = manifest && manifest.lines[cat]; if (!arr || !arr.length) return null;
    let i = Math.floor(Math.random() * arr.length); if (arr.length > 1 && i === lastLine[cat]) i = (i + 1) % arr.length; lastLine[cat] = i;
    return arr[i];
  }
  function playNext() {
    if (voicePlaying || !voiceQueue.length || !ctx) return;
    const item = voiceQueue.shift();
    voicePri = item.pri;
    getBuf(item.file).then(buf => {
      if (!buf) { voicePlaying = null; voicePri = -1; return playNext(); }
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(voiceBus);
      voicePlaying = s; s.onended = () => { if (voicePlaying === s) { voicePlaying = null; voicePri = -1; setTimeout(playNext, 120); } };
      s.start();
    });
  }
  // cat: line category; opts: { team: teamId, pri: 0-3, then: [cats] }
  function comment(cat, opts = {}) {
    if (!commentary || !ctx) return;
    const pri = opts.pri ?? 1;
    if (!manifest) { if (opts.fallback) say(opts.fallback, pri); return; }
    if (voicePlaying && pri <= voicePri && pri < 2) return;           // don't talk over more important lines
    if (pri > voicePri && voicePlaying) { try { voicePlaying.stop(); } catch (e) {} voicePlaying = null; voiceQueue = []; }
    if (voiceQueue.length > 2) voiceQueue = voiceQueue.filter(q => q.pri >= pri);
    const f = pickLine(cat); if (f) voiceQueue.push({ file: f, pri });
    if (opts.team && manifest.teams[opts.team]) voiceQueue.push({ file: manifest.teams[opts.team], pri });
    for (const c of opts.then || []) { const g = pickLine(c); if (g) voiceQueue.push({ file: g, pri }); }
    playNext();
  }
  function teamName(id, pri = 1) { if (!manifest || !manifest.teams[id] || !ctx) return; voiceQueue.push({ file: manifest.teams[id], pri }); playNext(); }
  function preload() { if (!manifest || !ctx) return; for (const arr of Object.values(manifest.lines)) for (const f of arr) getBuf(f); }

  // ---------------- music: original generative anthem (+ optional tracks in assets/music/manifest.json)
  let musicOn = false, musicTimer = null, musicStep = 0, trackEl = null, tracks = null, trackIdx = 0;
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
  const MELODY = [76, 0, 74, 76, 79, 0, 76, 74, 72, 0, 74, 72, 69, 0, 67, 69, 72, 0, 74, 76, 74, 0, 72, 69, 71, 0, 74, 0, 79, 78, 76, 74];
  function mtone(freq, t, dur, gain, type, dest, attack = 0.01) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function mdrum(t, kind) {
    if (kind === 'k') { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25); }
    else { const len = kind === 's' ? 0.18 : 0.05, b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : 7000; g.gain.value = kind === 's' ? 0.35 : 0.12; s.connect(f); f.connect(g); g.connect(musicBus); s.start(t); }
  }
  function scheduleBar() {
    if (!musicOn || !ctx) return;
    const bpm = 122, beat = 60 / bpm, t0b = ctx.currentTime + 0.1;
    const bar = musicStep % 4, chord = PROG[bar];
    for (let b = 0; b < 4; b++) {
      const t = t0b + b * beat;
      mdrum(t, 'k'); if (b % 2 === 1) mdrum(t, 's'); mdrum(t, 'h'); mdrum(t + beat / 2, 'h');
      mtone(NOTE(chord[0] - 12), t, beat * 0.9, 0.22, 'sawtooth', musicBus); mtone(NOTE(chord[0] - 12), t + beat / 2, beat * 0.4, 0.16, 'sawtooth', musicBus);
    }
    for (const n of chord) mtone(NOTE(n), t0b, beat * 4, 0.05, 'triangle', musicBus, 0.3);
    if (musicStep >= 4) for (let i = 0; i < 8; i++) { const n = MELODY[(bar * 8 + i) % MELODY.length]; if (n) mtone(NOTE(n), t0b + i * beat / 2, beat * 0.45, 0.09, 'square', musicBus); }
    musicStep++;
    musicTimer = setTimeout(scheduleBar, beat * 4 * 1000 - 30);
  }
  async function loadTracks() { if (tracks !== null) return tracks; try { const r = await fetch('../assets/music/manifest.json'); tracks = r.ok ? (await r.json()).tracks || [] : []; } catch (e) { tracks = []; } return tracks; }
  async function music(on) {
    if (on === musicOn) return; musicOn = on;
    if (window.Music && Music.start && ctx) { try { if (on) Music.start(); else Music.stop(1.2); } catch (e) { console.warn(e); } return; }
    clearTimeout(musicTimer); if (trackEl) { trackEl.pause(); }
    if (!on || !ctx) return;
    const list = await loadTracks();
    if (list.length) {
      if (!trackEl) { trackEl = new Audio(); const node = ctx.createMediaElementSource(trackEl); node.connect(musicBus); trackEl.onended = () => { trackIdx = (trackIdx + 1) % list.length; trackEl.src = '../assets/music/' + list[trackIdx].file; trackEl.play().catch(() => {}); }; }
      trackEl.src = '../assets/music/' + list[trackIdx % list.length].file; trackEl.play().catch(() => {});
    } else { musicStep = 0; scheduleBar(); }
  }
  function nowPlaying() { if (window.Music && Music.current) return musicOn ? Music.current() : null; return tracks && tracks.length && musicOn ? tracks[trackIdx % tracks.length] : null; }

  // ---------------- weather ambience
  function weather(kind) {
    if (!ctx) return;
    const rain = kind === 'rain' ? 0.35 : kind === 'storm' ? 0.6 : 0;
    weatherBus.gain.setTargetAtTime(rain, t0(), 1);
    windGain.gain.setTargetAtTime(kind === 'storm' ? 0.35 : kind === 'snow' ? 0.12 : kind === 'fog' ? 0.05 : 0.03, t0(), 1);
  }
  function thunder() {
    if (!ctx) return;
    setTimeout(() => { swell(1.6, 0.05, 0.6, 3.5, 90); noise(1.2, 220, 0.5, 'lowpass'); }, 300 + Math.random() * 1500);
  }

  function save() { try { localStorage.setItem('pc_audio', JSON.stringify({ volume, commentary })); } catch (e) {} }

  return {
    init,
    kick(power = 0.5) { tone(120, 0.12, 0.55 * (0.4 + power), 'sine', -70); noise(0.05, 2600, 0.2 + power * 0.35); },
    pass() { tone(170, 0.08, 0.3, 'sine', -80); noise(0.04, 1800, 0.15); },
    touch() { tone(210, 0.05, 0.12, 'sine', -100); },
    bounce(v) { tone(150, 0.06, Math.min(0.25, v * 0.05), 'sine', -60); },
    post() { tone(780, 0.6, 0.3, 'triangle'); tone(1170, 0.45, 0.15, 'sine'); tone(1560, 0.3, 0.08, 'sine'); voices(200, 1.4, 0.5, 600, 60); },
    net() { noise(0.35, 700, 0.35, 'bandpass'); },
    tackle() { noise(0.2, 900, 0.5); tone(80, 0.15, 0.3, 'sine', -40); },
    slide() { noise(0.45, 3000, 0.18, 'highpass'); },
    catchBall() { tone(160, 0.1, 0.35, 'sine', -60); noise(0.06, 1100, 0.25); },
    whistle(len = 0.35, delay = 0) {
      if (!ctx) return;
      setTimeout(() => {
        const t = t0(), o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 2650; lfo.frequency.value = 42; lg.gain.value = 160;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.16, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
        o.connect(g); g.connect(sfx); o.start(t); lfo.start(t); o.stop(t + len + 0.1); lfo.stop(t + len + 0.1);
      }, delay * 1000);
    },
    menu() { tone(620, 0.06, 0.12, 'triangle'); },
    confirm() { tone(660, 0.07, 0.14, 'triangle'); tone(990, 0.09, 0.14, 'triangle', 0, 0.07); },
    back() { tone(500, 0.07, 0.12, 'triangle', -150); },
    crowd(level, tension = 0) { if (!ctx) return; crowdBed.g.gain.setTargetAtTime(level * 0.9, t0(), 0.5); crowdHigh.g.gain.setTargetAtTime(tension * 0.12, t0(), 0.3); },
    roar() { swell(2.2, 0.15, 2.5, 3.5, 800); swell(0.8, 0.1, 2, 3, 1800); voices(260, 3, 0.6, 800, 80); },
    ooh() { voices(210, 1.5, 0.6, 520, -50); swell(0.6, 0.2, 0.4, 1.2); },
    boo() { voices(130, 1.8, 0.5, 400, -15); },
    applause() { for (let i = 0; i < 40; i++) setTimeout(() => noise(0.04, 2500 + Math.random() * 1500, 0.06 + Math.random() * 0.05, 'bandpass', crowdBus), Math.random() * 2500); },
    chant, say, comment, teamName, preload, music, nowPlaying, weather, thunder,
    get volume() { return volume; }, get commentary() { return commentary; },
    setVolume(k, v) { volume[k] = v; if (ctx) { master.gain.value = volume.master; sfx.gain.value = volume.sfx; crowdBus.gain.value = volume.crowd; musicBus.gain.value = volume.music; voiceBus.gain.value = volume.voice; } save(); },
    setCommentary(on) { commentary = on; if (!on && window.speechSynthesis) speechSynthesis.cancel(); save(); },
  };
})();
