// Offline render test for src/music.js: renders every track, sting and anthems through an
// OfflineAudioContext in headless Chromium, writes WAVs and checks for NaN / clipping / silence,
// beat periodicity and that the dominant pitch classes sit in the declared key.
// Usage: node tests/music-render.mjs [outDir]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(here, '..', 'tmp-music-render');
fs.mkdirSync(OUT, { recursive: true });
const SR = 44100;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ path: path.join(here, '..', 'src', 'music.js') });

// ---- API smoke tests without attach / with a (possibly suspended) realtime context
const smoke = await page.evaluate(async () => {
  const r = {};
  r.noCtxStart = (() => { try { Music.start(); Music.next(); Music.stop(); Music.sting('goal'); Music.walkout(); Music.setIntensity(0.5); return 'ok'; } catch (e) { return String(e); } })();
  r.current = Music.current();
  r.anthemNoCtx = await new Promise(res => { let d = Music.anthem({ id: 'x' }, { onEnd: () => res('onEnd called, dur=' + d.toFixed(1)) }); setTimeout(() => res('onEnd NOT called'), 500); });
  const ac = new AudioContext(); const g = ac.createGain(); g.connect(ac.destination);
  Music.attach(ac, g);
  const changes = []; Music.onTrackChange = d => changes.push(d.title);
  Music.start(); const c1 = Music.current();
  await new Promise(res => setTimeout(res, 400));
  Music.next(); await new Promise(res => setTimeout(res, 300));
  const c2 = Music.current();
  Music.sting('press');
  Music.stop(0.2); Music.walkout(); await new Promise(res => setTimeout(res, 200)); Music.stop(0.2);
  r.realtime = { state: ac.state, first: c1 && c1.title, second: c2 && c2.title, changes, afterStop: Music.current() };
  Music.onTrackChange = null;
  r.playlist = Music.playlist;
  const teams = ['eng', 'bra', 'ger', 'fra', 'arg', 'jpn', 'usa', 'nga', 'alb-01', 'Redhill Rovers', 'esp', 'ita'];
  r.anthems = teams.map(id => Object.assign({ id }, Music.anthemInfo({ id })));
  r.anthemDeterministic = JSON.stringify(Music.anthemInfo({ id: 'bra' })) === JSON.stringify(Music.anthemInfo('bra'));
  r.patterns = [];
  for (const st of Music._styles.concat([Music._walk])) for (const [name, sc] of Object.entries(st.sec)) {
    for (const [lane, p] of Object.entries(sc.drums || {})) if (p.length % 16) r.patterns.push(st.id + '.' + name + '.' + lane + ' len ' + p.length);
    if (sc.bass && sc.bass[0].length !== 16) r.patterns.push(st.id + '.' + name + '.bass');
    if (sc.comp && sc.comp[0].length !== 16) r.patterns.push(st.id + '.' + name + '.comp');
  }
  await ac.close();
  return r;
});

async function render(job) {
  return page.evaluate(async ({ job, SR }) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * job.dur), SR);
    Music._mute = job.mute || [];
    Music.attach(ctx, ctx.destination);
    let ended = false, info = null;
    if (job.type === 'track') Music.play(job.id);
    else if (job.type === 'walkout') Music.walkout();
    else if (job.type === 'sting') Music.sting(job.id);
    else if (job.type === 'anthem') { info = Music.anthemInfo(job.team); Music.anthem(job.team, { crowd: true, onEnd: () => { ended = true; } }); }
    const changes = []; Music.onTrackChange = d => changes.push(d.title);
    if (job.type === 'xfade') Music.play(job.id);
    // incremental scheduling (like the realtime lookahead scheduler): suspend every 0.2 s and pump
    Music._pump(0);
    for (let t = 0.2; t < job.dur; t += 0.2) ctx.suspend(t).then(() => { if (job.nextAt && Math.abs(ctx.currentTime - job.nextAt) < 0.1) Music.next(); Music._pump(ctx.currentTime); ctx.resume(); });
    const t0 = performance.now();
    const buf = await ctx.startRendering();
    const ms = performance.now() - t0;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let nan = 0, peak = 0, ss = 0;
    for (let i = 0; i < L.length; i++) { const a = L[i], b = R[i]; if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; } peak = Math.max(peak, Math.abs(a), Math.abs(b)); ss += a * a + b * b; }
    const rms = Math.sqrt(ss / (2 * L.length));
    // 16-bit stereo WAV
    const n = L.length, ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) { dv.setInt16(o, Math.max(-1, Math.min(1, L[i] || 0)) * 32767, true); dv.setInt16(o + 2, Math.max(-1, Math.min(1, R[i] || 0)) * 32767, true); }
    let bin = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    Music.onTrackChange = null;
    return { nan, peak, rms, ms, b64: btoa(bin), info, ended, changes };
  }, { job, SR });
}

// ---- analysis helpers (node side)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const k = i + j + len / 2, tr = re[k] * cr - im[k] * ci, ti = re[k] * ci + im[k] * cr; re[k] = re[i + j] - tr; im[k] = im[i + j] - ti; re[i + j] += tr; im[i + j] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
function maxJump(x) { let m = 0; for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return +m.toFixed(3); }
function mono(b64) { const b = Buffer.from(b64, 'base64'); const n = (b.length - 44) / 4, m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = (b.readInt16LE(44 + i * 4) + b.readInt16LE(46 + i * 4)) / 65536; return m; }
function tempo(x, bpm) { // onset-envelope autocorrelation
  const hop = 441, frames = Math.floor(x.length / hop), env = new Float32Array(frames);
  let prev = 0; for (let f = 0; f < frames; f++) { let e = 0; for (let i = 0; i < hop; i++) { const v = x[f * hop + i]; e += v * v; } e = Math.log(1e-9 + e); env[f] = Math.max(0, e - prev); prev = e; }
  let best = 0, bestLag = 0; const ac = {};
  for (let lag = 20; lag <= 150; lag++) { let s = 0; for (let f = 0; f + lag < frames; f++) s += env[f] * env[f + lag]; ac[lag] = s; if (s > best) { best = s; bestLag = lag; } }
  const est = 6000 / bestLag; // frames are 10 ms
  const beatLag = Math.round(6000 / bpm), near = l => Math.max(ac[l - 1] || 0, ac[l] || 0, ac[l + 1] || 0);
  const mean = Object.values(ac).reduce((a, b) => a + b, 0) / Object.keys(ac).length;
  const ratio = est / bpm, okRatio = [0.5, 1, 2, 4 / 3, 2 / 3, 1.5].some(r => Math.abs(ratio - r) < 0.04);
  return { est: +est.toFixed(1), beatStrength: +(near(beatLag) / mean).toFixed(2), ok: okRatio || near(beatLag) / mean > 1.3 };
}
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SC = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
function chroma(x) {
  const N = 8192, ch = new Float64Array(12), win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let s = 0; s + N < x.length; s += N) {
    const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    const mags = new Float64Array(N / 2); for (let k = 1; k < N / 2; k++) mags[k] = Math.hypot(re[k], im[k]);
    for (let k = 3; k < N / 2 - 1; k++) { const f = k * SR / N; if (f < 70 || f > 2000) continue; if (mags[k] > mags[k - 1] && mags[k] >= mags[k + 1]) { const pc = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12; ch[pc] += mags[k] * mags[k]; } } // spectral peaks only
  }
  const tot = ch.reduce((a, b) => a + b, 0) || 1; return Array.from(ch, v => v / tot);
}
function keyCheck(c, tonicPc, mode) {
  const set = SC[mode].map(p => (p + tonicPc) % 12), inKey = set.reduce((a, p) => a + c[p], 0);
  const top7 = c.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 7).map(x => x[1]);
  return { inKey: +(inKey * 100).toFixed(1), top7: top7.map(i => NN[i]).join(' '), top7InKey: top7.filter(p => set.includes(p)).length };
}

// ---- jobs
const jobs = [];
for (const t of smoke.playlist) jobs.push({ type: 'track', id: t.id, dur: 22, bpm: t.bpm, key: t.key, name: 'track-' + t.id });
jobs.push({ type: 'walkout', id: 'walkout', dur: 22, bpm: 96, key: 'E minor', name: 'walkout' });
jobs.push({ type: 'xfade', id: 'carnival', nextAt: 8, dur: 14, name: 'xfade-carnival-next' });
for (const s of ['boot', 'press', 'goal', 'victory', 'whistle-intro']) jobs.push({ type: 'sting', id: s, dur: { boot: 5, press: 2, goal: 3.5, victory: 8, 'whistle-intro': 4 }[s], name: 'sting-' + s });
for (const team of [{ id: 'bra', name: 'Brasilia' }, { id: 'eng' }, { id: 'jpn' }]) jobs.push({ type: 'anthem', team, dur: Music_dur(team), name: 'anthem-' + team.id });
function Music_dur(team) { const a = smoke.anthems.find(x => x.id === team.id); return Math.ceil(a ? a.duration + 1 : 46); }

const results = [];
let fail = 0;
for (const job of jobs) {
  const r = await render(job);
  const file = path.join(OUT, job.name + '.wav');
  fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
  const x = mono(r.b64);
  const row = { name: job.name, nan: r.nan, peak: +r.peak.toFixed(3), rmsDb: +(20 * Math.log10(r.rms + 1e-12)).toFixed(1), cpuPct: +(r.ms / 10 / job.dur).toFixed(1) };
  if (job.type === 'xfade') { row.trackChanges = r.changes; row.clickMax = maxJump(x); }
  if (job.bpm) row.tempo = tempo(x, job.bpm);
  let tonicPc, mode;
  if (job.key) { const [n, m] = job.key.split(' '); tonicPc = NN.indexOf(n); mode = m; }
  if (job.type === 'anthem') { const [n, m] = r.info.key.split(' '); tonicPc = NN.indexOf(n); mode = m === 'minor' ? 'harm' : 'major'; row.anthem = r.info; row.onEndFired = r.ended; }
  if (mode) {
    let kx = x;
    if (job.type === 'track' || job.type === 'walkout') kx = mono((await render(Object.assign({}, job, { mute: ['drums'] }))).b64); // pitched parts only
    row.key = Object.assign({ declared: NN[tonicPc] + ' ' + mode }, keyCheck(chroma(kx), tonicPc, mode));
  }
  const problems = [];
  if (r.nan) problems.push('NaN');
  if (r.peak >= 1) problems.push('clipping');
  if (row.rmsDb < -40) problems.push('too quiet');
  if (row.tempo && !row.tempo.ok) problems.push('tempo?');
  if (row.key && row.key.top7InKey < 6) problems.push('key?');
  if (job.type === 'xfade' && r.changes.length !== 2) problems.push('onTrackChange count ' + r.changes.length);
  row.problems = problems; if (problems.length) fail++;
  results.push(row);
  console.log(JSON.stringify(row));
}
for (const n of ['track-floodlights', 'track-carnival', 'track-goldengoal', 'sting-boot', 'anthem-bra', 'walkout']) {
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, n + '.wav'), '-lavfi', 'showspectrumpic=s=800x300:legend=1', path.join(OUT, n + '.png')]); } catch (e) { console.log('ffmpeg failed', n, e.message); }
}
console.log('\nSMOKE', JSON.stringify(smoke, null, 1));
console.log('\nconsole errors/warnings:', errors.length ? errors : 'none');
await browser.close();
if (fail || errors.length || smoke.patterns.length) { console.log('FAIL'); process.exit(1); } else console.log('ALL CHECKS PASSED');
