// Procedural city + street circuit built around a track spline. Everything static is merged
// into a handful of draw calls so it runs well on integrated graphics.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePerson, makeVehicle } from './assets.js';
import { countryById, TRACK_ENV } from './data.js';
import { flagCanvas } from './flags.js';

export const THEMES = {
  day:    { top: 0x2f74d0, hor: 0xbfe0ff, fog: 0xc2daf0, fogFar: 620, sun: 0xffffff, sunI: 2.2, hemi: 1.5, ground: 0x6f7378, lit: 0.0, night: false, sunDir: [0.5, 1, 0.3] },
  sunset: { top: 0x27357a, hor: 0xffa060, fog: 0xe9a678, fogFar: 560, sun: 0xffb070, sunI: 2.0, hemi: 1.0, ground: 0x5d5a60, lit: 0.45, night: false, sunDir: [-0.8, 0.35, 0.4] },
  dusk:   { top: 0x10143c, hor: 0xc0508a, fog: 0x5c4276, fogFar: 520, sun: 0xff80b0, sunI: 1.0, hemi: 0.9, ground: 0x3a3a48, lit: 0.85, night: true, sunDir: [0.7, 0.3, -0.5] },
  overcast: { top: 0x7f8c99, hor: 0xc9d1d8, fog: 0xbcc5cc, fogFar: 480, sun: 0xdfe6ee, sunI: 1.2, hemi: 1.7, ground: 0x62666a, lit: 0.15, night: false, sunDir: [0.2, 1, 0.4] },
  night:  { top: 0x02030a, hor: 0x1c1648, fog: 0x0d0b24, fogFar: 480, sun: 0x8090ff, sunI: 0.5, hemi: 0.75, ground: 0x24252e, lit: 1.0, night: true, sunDir: [0.3, 1, 0.2] },
};

// deterministic rng
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function noise(g, w, h, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } }

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const road = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, 0.07);
    g.fillStyle = '#e8e8e8'; g.fillRect(w * 0.03, 0, 7, h); g.fillRect(w * 0.97 - 7, 0, 7, h);
    for (const u of [0.265, 0.735]) { g.fillRect(w * u - 3, 0, 6, h * 0.45); }
    g.fillStyle = '#f2c230'; g.fillRect(w * 0.5 - 8, 0, 5, h); g.fillRect(w * 0.5 + 3, 0, 5, h);
  });
  const walk = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9ba0'; g.fillRect(0, 0, w, h); noise(g, w, h, 3000, 0.06);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
  const ground = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, 0.08); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); });
  // barrier atlas: top half = red/white kerb blocks, bottom half = concrete with sponsor text
  const barrier = canvasTex(512, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#d8232a'; g.fillRect(i * 64, 0, 64, 64); }
    g.fillStyle = '#b9bcc2'; g.fillRect(0, 64, w, 64); noise(g, w, 128, 1500, 0.08);
    g.fillStyle = '#1b6cf2'; g.fillRect(0, 64, w, 10);
    g.font = 'bold 40px Arial'; g.fillStyle = '#20232a'; g.textBaseline = 'middle'; g.fillText('APEX CLASH', 20, 100); g.fillStyle = '#d8232a'; g.fillText('NITRO+', 330, 100);
  });
  const facades = [['#8d939e', '#1d2a3a'], ['#a08d7c', '#22262e'], ['#5f7f9a', '#17324a'], ['#70757c', '#101820']].map(([wall, win]) => {
    const lit = [];
    const map = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = wall; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 0.05);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const on = Math.random() < 0.42; lit.push(on);
        g.fillStyle = win; g.fillRect(x * 32 + 5, y * 32 + 6, 22, 19);
        g.fillStyle = 'rgba(160,200,255,0.18)'; g.fillRect(x * 32 + 5, y * 32 + 6, 22, 6);
      }
    });
    const emis = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (lit[y * 8 + x]) {
        g.fillStyle = ['#ffd98a', '#fff1c4', '#9fd8ff', '#ffc061'][Math.floor(Math.random() * 4)]; g.fillRect(x * 32 + 5, y * 32 + 6, 22, 19);
      }
    });
    return { map, emis };
  });
  const glow = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, false);
  const water = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#1273b8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.2})`; g.lineWidth = 1 + Math.random() * 2; const x = Math.random() * w, y = Math.random() * h, l = 14 + Math.random() * 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke(); } });
  const ramp = canvasTex(128, 128, (g) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#1a1a1a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(14, 118 - i * 40); g.lineTo(64, 88 - i * 40); g.lineTo(114, 118 - i * 40); g.lineTo(114, 100 - i * 40); g.lineTo(64, 70 - i * 40); g.lineTo(14, 100 - i * 40); g.fill(); } }, false);
  const cut = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#4a4236'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, 0.12); g.fillStyle = 'rgba(30,24,18,0.5)'; g.fillRect(w * 0.25, 0, 22, h); g.fillRect(w * 0.7, 0, 22, h); g.fillStyle = '#f2a51a'; for (let y = 0; y < h; y += 64) { g.fillRect(4, y, 10, 32); g.fillRect(w - 14, y + 32, 10, 32); } });
  const jersey = canvasTex(256, 128, (g, w) => { g.fillStyle = '#c9ccd2'; g.fillRect(0, 0, w, 64); noise(g, w, 64, 900, 0.1); for (let i = -2; i < 10; i++) { g.fillStyle = i % 2 ? '#111' : '#f2c40a'; g.beginPath(); g.moveTo(i * 32, 64); g.lineTo(i * 32 + 32, 64); g.lineTo(i * 32 + 64, 30); g.lineTo(i * 32 + 32, 30); g.fill(); } });
  const cutSign = canvasTex(512, 160, (g, w, h) => { g.fillStyle = '#f2a51a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#111'; g.font = '900 72px Arial'; g.textBaseline = 'middle'; g.fillText('SHORTCUT', 34, h / 2 + 4); g.beginPath(); g.moveTo(400, 40); g.lineTo(480, 80); g.lineTo(400, 120); g.lineTo(400, 98); g.lineTo(360, 98); g.lineTo(360, 62); g.lineTo(400, 62); g.fill(); }, false);
  const pad = canvasTex(128, 256, (g, w, h) => { g.clearRect(0, 0, w, h); for (let k = 0; k < 3; k++) { const y = 200 - k * 70; g.fillStyle = k === 1 ? '#ffe14a' : '#35f0ff'; g.beginPath(); g.moveTo(10, y); g.lineTo(64, y - 46); g.lineTo(118, y); g.lineTo(118, y + 26); g.lineTo(64, y - 20); g.lineTo(10, y + 26); g.fill(); } }, false);
  const fence = canvasTex(128, 64, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f5f5f5' : '#d8232a'; g.fillRect(i * 32, 0, 32, h); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 8, w, 8); }, false);
  const barrel = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ff6a00'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 14, w, 8); g.fillRect(0, 40, w, 8); }, false);
  const cloud = canvasTex(256, 96, (g) => { for (let i = 0; i < 26; i++) { const x = 40 + Math.random() * 176, y = 34 + Math.random() * 30, r = 18 + Math.random() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }, false);
  const checker = canvasTex(128, 32, (g) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 16, y * 16, 16, 16); } });
  return (TEX = { road, walk, ground, barrier, facades, glow, checker, cloud, water, ramp, cut, jersey, cutSign, pad, fence, barrel });
}

function ribbon(T, offA, offB, yA, yB, vScale, uA = 0, uB = 1, from = 0, to = -1) {
  if (to < 0) to = T.N; const cnt = to - from, pos = new Float32Array((cnt + 1) * 6), uv = new Float32Array((cnt + 1) * 4), idx = [];
  for (let kk = from; kk <= to; kk++) { const k = kk - from;
    const i = kk % T.N, lx = T.tz[i], lz = -T.tx[i];
    const e = T.elev ? T.elev[i] : 0; pos.set([T.x[i] + lx * offA, yA + e, T.z[i] + lz * offA, T.x[i] + lx * offB, yB + e, T.z[i] + lz * offB], k * 6);
    uv.set([uA, k * T.step / vScale, uB, k * T.step / vScale], k * 4);
    if (kk < to) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function quadGeo(quads) { // quads: [[p0,p1,p2,p3, u0,v0,u1,v1, color?]]
  const n = quads.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
  quads.forEach((q, k) => {
    for (let j = 0; j < 4; j++) { pos.set(q[j], k * 12 + j * 3); const c = q[8] || [1, 1, 1]; col.set(c, k * 12 + j * 3); }
    uv.set([q[4], q[5], q[6], q[5], q[6], q[7], q[4], q[7]], k * 8);
    idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); return g;
}

function textPanel(text, w, h, bg, fg) {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `900 ${h * 0.62}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); }, false);
}

// Ring gates floating at different heights and sides of the course.
function gateRings(T, opt, color, ds) {
  const gs = opt.gates || [], rings = new THREE.InstancedMesh(new THREE.TorusGeometry(7, 0.45, 6, 24), new THREE.MeshBasicMaterial({ color, fog: false }), Math.max(1, gs.length)), dm = new THREE.Object3D();
  gs.forEach((g, k) => { const i = g.i; dm.position.set(T.x[i] + T.tz[i] * g.off, (opt.alt || 12) + g.y, T.z[i] - T.tx[i] * g.off); dm.rotation.set(0, Math.atan2(T.tx[i], T.tz[i]), 0); dm.updateMatrix(); rings.setMatrixAt(k, dm.matrix); });
  rings.count = gs.length; rings.frustumCulled = false; ds.push(rings.geometry, rings.material); return rings;
}

// Outer space: a glowing track among stars, planets and asteroids.
function buildSpace(scene, renderer, T, opt) {
  const tex = textures(), group = new THREE.Group(), half = T.roadHalf || 9, R = rng(T.N * 31 + 7), ds = [], th = { ...THEMES.night, night: true };
  let cx = 0, cz = 0; for (let i = 0; i < T.N; i++) { cx += T.x[i]; cz += T.z[i]; } cx /= T.N; cz /= T.N;
  scene.fog = new THREE.Fog(0x02030a, 400, 2600); scene.background = new THREE.Color(0x02030a);
  group.add(new THREE.HemisphereLight(0x9fb6ff, 0x1a1030, 1.5)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(60, 90, 30); group.add(sun);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1a2040, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer), envRT = pm.fromScene(envScene, 0, 0.1, 100); pm.dispose(); scene.environment = envRT.texture; scene.environmentIntensity = 2;
  const sp = new Float32Array(9000); for (let i = 0; i < 3000; i++) { const a = R() * 6.283, e = (R() - 0.25) * 2.4, r = 3200; sp.set([cx + Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, cz + Math.sin(a) * Math.cos(e) * r], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false }))); ds.push(sg);
  const grid = canvasTex(128, 128, (g) => { g.fillStyle = '#0a0f2a'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#35f0ff'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeStyle = 'rgba(176,38,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.stroke(); });
  group.add(gateRings(T, opt, 0xffc21f, ds));
  { // faint guide lights along the course instead of a road
    const gp = new Float32Array(Math.ceil(T.N / 5) * 3); for (let i = 0, k = 0; i < T.N; i += 5, k++) gp.set([T.x[i], (opt.alt || 1.3) - 1.2, T.z[i]], k * 3);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); group.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: tex.glow, color: 0x35f0ff, size: 2.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); ds.push(gg);
  }
  const dm = new THREE.Object3D();
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x6b6470, flatShading: true }), 220); let c = 0;
  for (let k = 0; k < 1500 && c < 220; k++) { const i = Math.floor(R() * T.N), o = (T.half + 10 + R() * 160) * (R() < 0.5 ? -1 : 1), x = T.x[i] + T.tz[i] * o, z = T.z[i] - T.tx[i] * o; let ok = true; for (let j = 0; j < T.N; j += 6) if ((x - T.x[j]) ** 2 + (z - T.z[j]) ** 2 < (T.half + 6) ** 2) { ok = false; break; } if (!ok) continue;
    dm.position.set(x, (R() - 0.3) * 90, z); dm.rotation.set(R() * 6, R() * 6, R() * 6); dm.scale.set(2 + R() * 7, 2 + R() * 6, 2 + R() * 7); dm.updateMatrix(); rocks.setMatrixAt(c++, dm.matrix); }
  rocks.count = c; group.add(rocks); ds.push(rocks.geometry, rocks.material);
  const band = cols => canvasTex(64, 64, (g) => { cols.forEach((cl, i) => { g.fillStyle = cl; g.fillRect(0, i * 64 / cols.length, 64, 64 / cols.length + 1); }); }, false);
  for (const [px, py, pz, r, cols] of [[-1500, 500, 900, 420, ['#c96a3a', '#e0a070', '#b0552a', '#e8b88a', '#a04a22']], [1700, 300, -1100, 260, ['#2a5ad0', '#4a8ae8', '#3a9a5a', '#2a5ad0', '#e8f0ff']]]) { const p = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshLambertMaterial({ map: band(cols), fog: false })); p.position.set(cx + px, py, cz + pz); group.add(p); ds.push(p.geometry, p.material); }
  const s0h = Math.atan2(T.tx[0], T.tz[0]), line = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 2.4), new THREE.MeshBasicMaterial({ map: tex.checker })); line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, s0h, 0); line.position.set(T.x[0], 0.05, T.z[0]); group.add(line); ds.push(line.geometry, line.material);
  scene.add(group);
  return { group, theme: th, cones: [], crowd: [], update() {}, dispose() { scene.remove(group); ds.forEach(d => d.dispose && d.dispose()); envRT.dispose(); scene.environment = null; } };
}

// Simple landmark silhouettes built from primitives.
function landmark(kind, th) {
  const g = new THREE.Group(), k = th.night ? 0.5 : 1, mat = c => new THREE.MeshLambertMaterial({ color: new THREE.Color(c).multiplyScalar(k), flatShading: true });
  const add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x || 0, y, z || 0); g.add(m); return m; };
  const glowM = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  if (kind === 'lattice') { add(new THREE.CylinderGeometry(7, 26, 34, 4, 1, true), 0x6b5a48, 0, 17).material.side = THREE.DoubleSide; add(new THREE.BoxGeometry(22, 2, 22), 0x5a4a3a, 0, 34); add(new THREE.CylinderGeometry(3, 8, 40, 4), 0x6b5a48, 0, 55); add(new THREE.BoxGeometry(9, 1.6, 9), 0x5a4a3a, 0, 75); add(new THREE.CylinderGeometry(0.4, 3, 44, 4), 0x6b5a48, 0, 97); }
  else if (kind === 'clock') { add(new THREE.BoxGeometry(13, 62, 13), 0xb89f72, 0, 31); add(new THREE.BoxGeometry(15, 13, 15), 0xa58c60, 0, 68); for (const r of [0, 1, 2, 3]) { const f = new THREE.Mesh(new THREE.CircleGeometry(4.6, 20), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })); f.position.set(Math.sin(r * Math.PI / 2) * 7.6, 68, Math.cos(r * Math.PI / 2) * 7.6); f.rotation.y = r * Math.PI / 2; g.add(f); } add(new THREE.ConeGeometry(10.5, 22, 4), 0x4d5a52, 0, 85.5).rotation.y = Math.PI / 4; }
  else if (kind === 'spire') { add(new THREE.CylinderGeometry(9, 15, 60, 6), 0xaebccb, 0, 30); add(new THREE.CylinderGeometry(5.5, 9, 55, 6), 0xbccad8, 0, 87); add(new THREE.CylinderGeometry(2.5, 5.5, 45, 6), 0xcad6e2, 0, 137); add(new THREE.CylinderGeometry(0.3, 2.5, 50, 5), 0xdde6ee, 0, 184); }
  else if (kind === 'pagoda') { for (let i = 0; i < 5; i++) { const w = 22 - i * 3.4, y = i * 11; add(new THREE.BoxGeometry(w, 7.5, w), 0xb23a2e, 0, y + 3.75); add(new THREE.ConeGeometry(w * 0.98, 4.2, 4), 0x2c3338, 0, y + 9.6).rotation.y = Math.PI / 4; } add(new THREE.CylinderGeometry(0.3, 0.6, 12, 5), 0xd9b23a, 0, 62); }
  else if (kind === 'arena') { add(new THREE.CylinderGeometry(34, 34, 22, 26, 1, true), 0xcdb48c, 0, 11).material.side = THREE.DoubleSide; add(new THREE.CylinderGeometry(28, 28, 15, 26, 1, true), 0xb89d76, 0, 7.5).material.side = THREE.DoubleSide; for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, w = new THREE.Mesh(new THREE.PlaneGeometry(4, 7), new THREE.MeshBasicMaterial({ color: th.night ? 0xffc46a : 0x3a2f24 })); w.position.set(Math.sin(a) * 34.2, 12, Math.cos(a) * 34.2); w.rotation.y = a; g.add(w); } }
  else if (kind === 'monument') { add(new THREE.CylinderGeometry(15, 20, 6, 10), 0xcfc7b8, 0, 3); add(new THREE.ConeGeometry(10, 46, 10), 0xe3dccc, 0, 29); for (let i = 0; i < 9; i++) { const a = i * 0.75; add(new THREE.BoxGeometry(5, 1.2, 2.4), 0xb8ad98, Math.cos(a) * (10 - i * 0.95), 8 + i * 4.3, Math.sin(a) * (10 - i * 0.95)).rotation.y = -a; } add(new THREE.SphereGeometry(2.2, 8, 6), 0xd9b23a, 0, 53.5); }
  else if (kind === 'stepped') { add(new THREE.BoxGeometry(34, 60, 30), 0x9aa3b0, 0, 30); add(new THREE.BoxGeometry(24, 46, 21), 0xa5aebb, 0, 83); add(new THREE.BoxGeometry(14, 30, 12), 0xb0b9c6, 0, 121); add(new THREE.CylinderGeometry(0.4, 1.6, 34, 5), 0xc9d1dc, 0, 153); }
  else if (kind === 'peak') { add(new THREE.SphereGeometry(42, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x5b6b58, 0, 0).scale.set(1, 2.3, 0.85); add(new THREE.BoxGeometry(1.2, 9, 1.2), 0xe8e8e8, 0, 100); add(new THREE.BoxGeometry(7, 1.2, 1.2), 0xe8e8e8, 0, 102); }
  if (th.night && kind !== 'arena') { const b = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 5), glowM); b.position.y = kind === 'spire' ? 209 : kind === 'stepped' ? 170 : kind === 'lattice' ? 119 : 100; g.add(b); }
  return g;
}

export function buildWorld(scene, renderer, T, quality, opt = {}) {
  const mode = opt.mode || 'road';
  if (mode !== 'road' && T.elev) T = { ...T, elev: null };   // only road races use flyovers / bridge humps
  if (mode === 'space') return buildSpace(scene, renderer, T, opt);
  const th = THEMES[T.def.theme], env = { ...(countryById(T.def.country) || {}), ...(TRACK_ENV[T.def.id] || {}) }, tex = textures(), R = rng(T.N * 7919 + 13), group = new THREE.Group(), half = T.roadHalf || T.half;
  const disposables = [];
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; group.add(m); disposables.push(geo, mat); return m; };
  let cx = 0, cz = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < T.N; i++) { cx += T.x[i]; cz += T.z[i]; minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); }
  cx /= T.N; cz /= T.N;

  // --- sky, fog, lights
  scene.fog = new THREE.Fog(th.fog, 60, th.fogFar); scene.background = new THREE.Color(th.fog);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(th.top) }, hor: { value: new THREE.Color(th.hor) }, fogc: { value: new THREE.Color(th.fog) } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 fogc; varying vec3 d; void main(){ float h = clamp(d.y,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.55)); c = mix(fogc, c, smoothstep(0.0,0.12,d.y)); gl_FragColor = vec4(c,1.0); }',
  });
  const sky = add(new THREE.SphereGeometry(3000, 24, 12), skyMat); sky.position.set(cx, 0, cz); sky.updateMatrix();
  const hemi = new THREE.HemisphereLight(new THREE.Color(th.hor).lerp(new THREE.Color(0xffffff), 0.5), th.ground, th.hemi);
  const sun = new THREE.DirectionalLight(th.sun, th.sunI); sun.position.set(...th.sunDir).multiplyScalar(100);
  group.add(hemi, sun);
  // small reflection map for car paint
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), skyMat));
  const pm = new THREE.PMREMGenerator(renderer), envRT = pm.fromScene(envScene, 0, 0.1, 100); pm.dispose();
  scene.environment = envRT.texture; scene.environmentIntensity = th.night ? 1.6 : 1.0;

  // --- ground, road, sidewalks
  const gt = tex.ground.clone(); gt.repeat.set(160, 160); gt.needsUpdate = true;
  const ground = add(new THREE.PlaneGeometry(4800, 4800, 60, 60), new THREE.MeshLambertMaterial({ color: new THREE.Color(env.ground ?? th.ground).multiplyScalar(th.night ? 0.42 : th.lit > 0.3 ? 0.8 : 1), map: gt }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.2, cz); ground.updateMatrix();
  const inT = i => mode !== 'air' && i > T.tunnel[0] - 5 && i < T.tunnel[1] + 5;
  const road = mode === 'road', E = i => (T.elev ? T.elev[((i % T.N) + T.N) % T.N] : 0), C = road ? T.cut : null;
  const zone = (i, alongHalf, acrossHalf) => { const k = Math.floor(i); return { x: T.x[k], z: T.z[k], tx: T.tx[k], tz: T.tz[k], a: alongHalf, c: acrossHalf }; };
  const cross = road && T.flyover ? zone((T.flyover[0] + T.flyover[1]) / 2, 9, 120) : null, river = T.bridge && mode !== 'space' ? zone((T.bridge[0] + T.bridge[1]) / 2, 21, 320) : null;
  const inZone = (z, x, y, m = 0) => { if (!z) return false; const dx = x - z.x, dy = y - z.z, al = dx * z.tx + dy * z.tz, ac = dx * z.tz - dy * z.tx; return Math.abs(al) < z.a + m && Math.abs(ac) < z.c + m; };
  const cutD = (x, z) => { if (!C) return 1e9; const dx = x - C.x[0], dz = z - C.z[0], t = Math.max(0, Math.min(C.len, dx * C.tx + dz * C.tz)); return Math.hypot(x - (C.x[0] + C.tx * t), z - (C.z[0] + C.tz * t)); };
  const blocked = (x, z, m = 0) => cutD(x, z) < C?.half + 3 + m || inZone(cross, x, z, m) || inZone(river, x, z, m);
  const waterMat = () => new THREE.MeshLambertMaterial({ map: tex.water, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, emissive: 0x0a2a44 });
  if (opt.relay) add(ribbon(T, half + 0.3, -half - 0.3, 0.05, 0.05, 24, 0, 1, T.water[0], T.water[1]), waterMat());
  if (mode !== 'air') { // tunnel shell with ceiling lights
    const [ta, tb] = T.tunnel, tq = [], lq = [], H = 6.2, W = half + 0.95;
    for (let i = ta; i < tb; i++) { const j = i + 1, P = (k, o, y) => [T.x[k] + T.tz[k] * o, y, T.z[k] - T.tx[k] * o];
      for (const sd of [1, -1]) tq.push([P(i, W * sd, 0), P(j, W * sd, 0), P(j, W * sd, H), P(i, W * sd, H), 0, 0, 1, 1]);
      tq.push([P(i, W, H), P(j, W, H), P(j, -W, H), P(i, -W, H), 0, 0, 1, 1]);
      if (i % 5 === 0) lq.push([P(i, 1.2, H - 0.06), P(j, 1.2, H - 0.06), P(j, -1.2, H - 0.06), P(i, -1.2, H - 0.06), 0, 0, 1, 1]); }
    add(quadGeo(tq), new THREE.MeshLambertMaterial({ color: th.night ? 0x2a2c33 : 0x55585f, side: THREE.DoubleSide }));
    add(quadGeo(lq), new THREE.MeshBasicMaterial({ color: 0xffe9b8, side: THREE.DoubleSide, fog: false }));
    for (const e of [ta, tb]) { const k = e % T.N, fr = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 2.4, 1.6, 1.2), new THREE.MeshLambertMaterial({ color: 0x3a3d44 })); fr.position.set(T.x[k], H + 0.6, T.z[k]); fr.rotation.y = Math.atan2(T.tx[k], T.tz[k]); group.add(fr);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshBasicMaterial({ map: textPanel('TUNNEL  ·  LIGHTS ON', 512, 64, '#0d57d8', '#fff'), side: THREE.DoubleSide })); sg.position.set(T.x[k], H + 0.6, T.z[k]); sg.rotation.y = fr.rotation.y; sg.translateZ(e === ta ? -0.62 : 0.62); group.add(sg); }
  }
  if (mode === 'road') for (const rp of T.ramps) { // stunt ramps
    const k = rp.i, g = new THREE.Group(), slope = new THREE.Mesh(new THREE.PlaneGeometry(rp.w * 2, 7.2), new THREE.MeshLambertMaterial({ map: tex.ramp, side: THREE.DoubleSide }));
    slope.rotation.x = -Math.PI / 2 - Math.atan2(1.7, 7); slope.position.set(0, 0.85, -3.5); const back = new THREE.Mesh(new THREE.PlaneGeometry(rp.w * 2, 1.7), new THREE.MeshLambertMaterial({ color: 0x2a2c33, side: THREE.DoubleSide })); back.position.set(0, 0.85, 0);
    g.add(slope, back); g.position.set(T.x[k] + T.tz[k] * rp.off, 0.03, T.z[k] - T.tx[k] * rp.off); g.rotation.y = Math.atan2(T.tx[k], T.tz[k]); group.add(g);
  }
  if (mode === 'air') group.add(gateRings(T, opt, 0x35f0ff, disposables));
  add(ribbon(T, half + 0.3, -half - 0.3, 0.02, 0.02, 24), mode === 'water' ? waterMat() : new THREE.MeshLambertMaterial({ map: tex.road, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  const walkMat = new THREE.MeshLambertMaterial({ map: tex.walk, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  add(ribbon(T, half + 6, half + 0.3, 0.16, 0.16, 6, 0, 1), walkMat); add(ribbon(T, -half - 0.3, -half - 6, 0.16, 0.16, 6, 0, 1), walkMat);

  // --- barriers (per-segment quads so corners get red/white blocks)
  const bq = [];
  for (let i = 0; i < T.N; i++) {
    const j = (i + 1) % T.N, corner = Math.abs(T.curv[i]) > 0.0045;
    const v0 = corner ? 0.52 : 0.02, v1 = corner ? 0.98 : 0.48, u0 = (i * T.step / 16) % 1, u1 = u0 + T.step / 16;
    const ei = E(i), ej = E(j);
    for (const s of [1, -1]) {
      const o = (half + 0.35) * s, o2 = (half + 0.75) * s;
      const a = [T.x[i] + T.tz[i] * o, ei, T.z[i] - T.tx[i] * o], b = [T.x[j] + T.tz[j] * o, ej, T.z[j] - T.tx[j] * o];
      if (C && cutD(a[0], a[2]) < C.half + 0.9) continue;   // gap where the shortcut leaves / rejoins
      const a2 = [T.x[i] + T.tz[i] * o2, ei + 0.95, T.z[i] - T.tx[i] * o2], b2 = [T.x[j] + T.tz[j] * o2, ej + 0.95, T.z[j] - T.tx[j] * o2];
      const at = [a[0], ei + 0.95, a[2]], bt = [b[0], ej + 0.95, b[2]];
      bq.push(s > 0 ? [b, a, at, bt, u1, v0, u0, v1] : [a, b, bt, at, u1, v0, u0, v1]);
      bq.push(s > 0 ? [bt, at, a2, b2, u1, v1 - 0.06, u0, v1 - 0.02] : [at, bt, b2, a2, u0, v1 - 0.06, u1, v1 - 0.02]);
    }
  }
  add(quadGeo(bq), new THREE.MeshLambertMaterial({ map: tex.barrier, side: THREE.DoubleSide }));
  const ambient = [], pads = [];
  if (mode !== 'air' && mode !== 'space') {
    const concrete = new THREE.MeshLambertMaterial({ color: th.night ? 0x4a4d55 : 0x9a9ea6, side: THREE.DoubleSide }), dk = new THREE.Object3D();
    const deck = (a, b) => { // underside + side fascia of a raised road, plus pillars
      add(ribbon(T, half + 1.2, -half - 1.2, -0.75, -0.75, 24, 0, 1, a, b), concrete);
      for (const sd of [1, -1]) add(ribbon(T, (half + 1.2) * sd, (half + 1.2) * sd, -0.8, 1.15, 24, 0, 1, a, b), concrete);
      const ids = []; for (let i = a; i <= b; i += 6) if (E(i) > 2.2 && !inZone(river, T.x[i], T.z[i], -6)) ids.push(i);
      const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, ids.length * 2);
      ids.forEach((i, k) => { const h = Math.atan2(T.tx[i], T.tz[i]), e = E(i) - 0.75; dk.rotation.set(0, h, 0); dk.position.set(T.x[i], e / 2, T.z[i]); dk.scale.set(2.4, e, 1.8); dk.updateMatrix(); pil.setMatrixAt(k * 2, dk.matrix); dk.position.y = e - 0.45; dk.scale.set(half * 2 + 2.2, 0.9, 1.6); dk.updateMatrix(); pil.setMatrixAt(k * 2 + 1, dk.matrix); });
      group.add(pil); disposables.push(pil.geometry);
    };
    if (T.flyover && road) {
      deck(T.flyover[0], T.flyover[1]);
      // the street that runs underneath, with its own traffic
      const z = cross, street = new THREE.Mesh(new THREE.PlaneGeometry(14, 240), new THREE.MeshLambertMaterial({ map: tex.road, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      street.rotation.order = 'YXZ'; street.rotation.set(-Math.PI / 2, Math.atan2(z.tz, -z.tx), 0); street.position.set(z.x, 0.02, z.z); street.updateMatrix(); street.matrixAutoUpdate = false; group.add(street); disposables.push(street.geometry, street.material);
      const models = ['fox', 'orion', 'meridian', 'atlas'], cols = [0x9aa3ad, 0x7a4b2a, 0xdedede, 0x2d4a6e, 0x8d1f1f, 0xf2c40a];
      for (let k = 0; k < 6; k++) { const v = makeVehicle(models[k % 4], cols[k]), lane = k % 2 ? 3.2 : -3.2, dir = k % 2 ? 1 : -1; v.root.position.set(z.x, 0, z.z); group.add(v.root); ambient.push({ v, t: -110 + k * 40, lane, dir, sp: 11 + k, z }); }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshBasicMaterial({ map: textPanel('FLYOVER', 512, 64, '#0d57d8', '#fff'), side: THREE.DoubleSide }));
      const i0 = T.flyover[0] + 4; sign.position.set(T.x[i0], 6.6, T.z[i0]); sign.rotation.y = Math.atan2(T.tx[i0], T.tz[i0]); group.add(sign);
    }
    if (T.bridge && mode !== 'water') {
      deck(T.bridge[0], T.bridge[1]);
      const z = river, rv = new THREE.Mesh(new THREE.PlaneGeometry(42, 640), new THREE.MeshLambertMaterial({ map: tex.water, emissive: 0x0a2a44, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      tex.water.repeat.set(3, 40); rv.rotation.order = 'YXZ'; rv.rotation.set(-Math.PI / 2, Math.atan2(z.tz, -z.tx), 0); rv.position.set(z.x, -0.05, z.z); rv.updateMatrix(); rv.matrixAutoUpdate = false; group.add(rv); disposables.push(rv.geometry, rv.material);
      // twin steel arches with hangers
      const red = new THREE.MeshLambertMaterial({ color: th.night ? 0x8a1f1f : 0xc0392b }), parts = [], a = T.bridge[0] + 6, b = T.bridge[1] - 6, P = (i, sd, y) => new THREE.Vector3(T.x[i] + T.tz[i] * (half + 1.6) * sd, y, T.z[i] - T.tx[i] * (half + 1.6) * sd);
      const beam = (p, q, w) => { const d = q.clone().sub(p), g = new THREE.BoxGeometry(w, w, d.length()); g.lookAt(d); g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2); parts.push(g); };
      for (const sd of [1, -1]) { let prev = null; for (let i = a; i <= b; i += 3) { const t = (i - a) / (b - a), top = P(i, sd, E(i) + 1.2 + 9 * Math.sin(Math.PI * t)); if (prev) beam(prev, top, 0.55); if ((i - a) % 6 === 0 && t > 0.05 && t < 0.95) beam(P(i, sd, E(i) + 1.1), top, 0.18); prev = top; } }
      for (let i = a + 9; i < b - 6; i += 9) { const t = (i - a) / (b - a), y = E(i) + 1.2 + 9 * Math.sin(Math.PI * t); if (y - E(i) > 6) beam(P(i, 1, y), P(i, -1, y), 0.35); }
      const arch = new THREE.Mesh(mergeGeometries(parts), red); arch.matrixAutoUpdate = false; group.add(arch); disposables.push(arch.geometry, red);
    }
    // boost pads
    if (road) for (const pd of T.pads) { const i = pd.i, m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7), new THREE.MeshBasicMaterial({ map: tex.pad, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, Math.atan2(T.tx[i], T.tz[i]), 0); m.position.set(T.x[i] + T.tz[i] * pd.off, E(i) + 0.06, T.z[i] - T.tx[i] * pd.off); group.add(m); pads.push(m); disposables.push(m.geometry, m.material); }
    // the shortcut: a construction-site road with its own barriers and a smashable fence at the entrance
    if (C) {
      const cr = (offA, offB, y, vs) => { const n = C.n, pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [], lx = C.tz, lz = -C.tx;
        for (let k = 0; k <= n; k++) { pos.set([C.x[k] + lx * offA, y, C.z[k] + lz * offA, C.x[k] + lx * offB, y, C.z[k] + lz * offB], k * 6); uv.set([0, k * C.len / n / vs, 1, k * C.len / n / vs], k * 4); if (k < n) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g; };
      add(cr(C.half + 0.3, -C.half - 0.3, 0.015, 12), new THREE.MeshLambertMaterial({ map: tex.cut, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      const cq = [], mainD = (x, z) => { let b = 1e9; for (let i = 0; i < T.N; i += 2) b = Math.min(b, (x - T.x[i]) ** 2 + (z - T.z[i]) ** 2); return Math.sqrt(b); };
      for (let k = 0; k < C.n; k++) for (const sd of [1, -1]) { const o = (C.half + 0.3) * sd, ax = C.x[k] + C.tz * o, az = C.z[k] - C.tx * o, bx = C.x[k + 1] + C.tz * o, bz = C.z[k + 1] - C.tx * o; if (mainD(ax, az) < half + 1.5) continue; const u0 = (k % 4) / 4; cq.push(sd > 0 ? [[bx, 0, bz], [ax, 0, az], [ax, 0.9, az], [bx, 0.9, bz], u0 + 0.25, 0.02, u0, 0.48] : [[ax, 0, az], [bx, 0, bz], [bx, 0.9, bz], [ax, 0.9, az], u0, 0.02, u0 + 0.25, 0.48]); }
      add(quadGeo(cq), new THREE.MeshLambertMaterial({ map: tex.jersey, side: THREE.DoubleSide }));
      const k0 = Math.min(C.n - 1, Math.round(22 / (C.len / C.n))), sg = new THREE.Group(), pole = new THREE.MeshLambertMaterial({ color: 0x30343c });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 2.2), new THREE.MeshBasicMaterial({ map: tex.cutSign, side: THREE.DoubleSide })); board.position.y = 4.3; sg.add(board);
      for (const sd of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.3, 0.25), pole); pl.position.set(sd * 3, 2.15, 0); sg.add(pl); }
      sg.position.set(C.x[k0] + C.tz * (C.half + 2.2), 0, C.z[k0] - C.tx * (C.half + 2.2)); sg.rotation.y = Math.atan2(C.tx, C.tz) + Math.PI; group.add(sg);
    }
  }

  // --- start line + gantry
  const sp = i => ({ x: T.x[i], z: T.z[i], lx: T.tz[i], lz: -T.tx[i], tx: T.tx[i], tz: T.tz[i], h: Math.atan2(T.tx[i], T.tz[i]) });
  const s0 = sp(0);
  const line = add(new THREE.PlaneGeometry(half * 2, 2.4), new THREE.MeshBasicMaterial({ map: tex.checker })); tex.checker.repeat.set(2, 1);
  line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, s0.h, 0); line.position.set(s0.x, 0.04, s0.z); line.updateMatrix();
  const gantry = new THREE.Group(); gantry.position.set(s0.x, 0, s0.z); gantry.rotation.y = s0.h;
  const steel = new THREE.MeshLambertMaterial({ color: 0x30343c });
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), steel); p.position.set((half + 1.4) * s, 4.5, 0); gantry.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 3.6, 2.2, 0.7), steel); beam.position.y = 8.2; gantry.add(beam);
  const banT = textPanel('APEX  CLASH', 1024, 128, '#11131a', '#ffcf2e');
  for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 3, 1.9), new THREE.MeshBasicMaterial({ map: banT })); b.position.set(0, 8.2, 0.37 * s); if (s < 0) b.rotation.y = Math.PI; gantry.add(b); }
  if (env.id) { const ft = new THREE.CanvasTexture(flagCanvas(env.id, 192, 128)); ft.colorSpace = THREE.SRGBColorSpace; const fm = new THREE.MeshBasicMaterial({ map: ft, side: THREE.DoubleSide });
    for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.2), fm); f.position.set((half + 1.4) * s, 10.6, 0); gantry.add(f); const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.4, 0.15), steel); pole.position.set((half + 1.4) * s - 1.7, 10.4, 0); gantry.add(pole); } }
  group.add(gantry);

  // --- billboards
  const adCols = [['#e8232a', '#fff'], ['#0d57d8', '#ffe14a'], ['#111', '#3df5a0'], ['#f2c40a', '#111'], ['#7a1fd0', '#fff']];
  const ads = [...(env.ads || ['NITRO+', 'TURBO COLA']), 'APEX TYRES', 'VOLT ENERGY'].map((t, i) => [t, ...adCols[i % adCols.length]]);
  const adMats = ads.map(a => new THREE.MeshBasicMaterial({ map: textPanel(a[0], 512, 128, a[1], a[2]) }));
  for (let k = 0, i = 60; i < T.N - 40; i += Math.floor(T.N / 9), k++) {
    const p = sp(i), s = k % 2 ? 1 : -1, bb = new THREE.Group(); if (E(i) > 0.3 || blocked(p.x + p.lx * (half + 4.5) * s, p.z + p.lz * (half + 4.5) * s, 4)) continue;
    bb.position.set(p.x + p.lx * (half + 4.5) * s, 0, p.z + p.lz * (half + 4.5) * s); bb.rotation.y = p.h + Math.PI;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), steel); pole.position.y = 3.5;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.6), adMats[k % ads.length]); panel.position.y = 7.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(10.3, 2.9, 0.2), steel); back.position.set(0, 7.6, -0.12);
    bb.add(pole, panel, back); group.add(bb);
  }

  // --- street lamps + trees (instanced)
  const lampGeo = mergeGeometries([new THREE.CylinderGeometry(0.11, 0.16, 7.5, 6).translate(0, 3.75, 0), new THREE.BoxGeometry(2.4, 0.14, 0.14).translate(1.1, 7.4, 0)]);
  const lamps = [], trees = [];
  for (let i = 8, k = 0; i < T.N; i += 14, k++) { if (inT(i)) continue; const p = sp(i), s = k % 2 ? 1 : -1; if (blocked(p.x + p.lx * (half + 1.6) * s, p.z + p.lz * (half + 1.6) * s, -2) && E(i) < 0.5) continue; lamps.push({ e: E(i), x: p.x + p.lx * (half + 1.6) * s, z: p.z + p.lz * (half + 1.6) * s, h: Math.atan2(-p.lx * s, -p.lz * s) - Math.PI / 2, hx: p.x + p.lx * (half - 0.7) * s, hz: p.z + p.lz * (half - 0.7) * s }); }
  for (let i = 3, k = 0; i < T.N; i += 9, k++) { if (i < 25 || i > T.N - 25 || inT(i) || E(i) > 0.3) continue; const p = sp(i), s = k % 2 ? -1 : 1, o = half + 3.6 + R() * 1.2; if (blocked(p.x + p.lx * o * s, p.z + p.lz * o * s, 2)) continue; trees.push({ x: p.x + p.lx * o * s, z: p.z + p.lz * o * s, sc: 0.8 + R() * 0.6 }); }
  const lampMesh = new THREE.InstancedMesh(lampGeo, steel, lamps.length), dummy = new THREE.Object3D();
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.12, 0.34), new THREE.MeshBasicMaterial({ color: th.lit > 0.3 ? 0xfff0c0 : 0xd8dde4 }), lamps.length);
  lamps.forEach((l, i) => {
    dummy.position.set(l.x, l.e, l.z); dummy.rotation.set(0, l.h, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); lampMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.hx, 7.3 + l.e, l.hz); dummy.updateMatrix(); headMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(lampMesh, headMesh);
  const colGeo = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), col = new THREE.Color(c); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed(); };
  const leaf = th.night ? 0.62 : 1, lc = c => new THREE.Color(c).multiplyScalar(leaf).getHex(), trunk = (h, r = 0.2) => colGeo(new THREE.CylinderGeometry(r * 0.8, r * 1.15, h, 5).translate(0, h / 2, 0), 0x4a3526);
  let treeGeo;
  if (env.tree === 'palm') { const parts = [trunk(5.4, 0.16)]; for (let k = 0; k < 7; k++) parts.push(colGeo(new THREE.ConeGeometry(0.42, 3.2, 4).scale(1, 1, 0.25).rotateZ(Math.PI / 2 + 0.35).translate(1.5, 5.25, 0).rotateY(k * Math.PI * 2 / 7), lc(k % 2 ? 0x2f9a48 : 0x3fae55))); treeGeo = mergeGeometries(parts); }
  else if (env.tree === 'cypress') treeGeo = mergeGeometries([trunk(1.2), colGeo(new THREE.ConeGeometry(0.95, 7.5, 7).translate(0, 4.6, 0), lc(0x24573a))]);
  else if (env.tree === 'sakura') treeGeo = mergeGeometries([trunk(2.4), colGeo(new THREE.IcosahedronGeometry(2.0, 0).translate(0, 3.7, 0), lc(0xf7a8c8)), colGeo(new THREE.IcosahedronGeometry(1.35, 0).translate(0.6, 5.0, 0.2), lc(0xffc4dc))]);
  else treeGeo = mergeGeometries([trunk(2.4), colGeo(new THREE.IcosahedronGeometry(1.9, 0).translate(0, 3.6, 0), lc(0x2f8a45)), colGeo(new THREE.IcosahedronGeometry(1.3, 0).translate(0.5, 5.0, 0.2), lc(0x3da055))]);
  const treeMesh = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), trees.length);
  trees.forEach((t, i) => { dummy.position.set(t.x, 0.16, t.z); dummy.rotation.set(0, R() * 6, 0); dummy.scale.setScalar(t.sc); dummy.updateMatrix(); treeMesh.setMatrixAt(i, dummy.matrix); });
  group.add(treeMesh);
  if (th.lit > 0.3) { // light pools + lamp glows
    const pools = lamps.map(l => { const r = 9, y = 0.05 + l.e; return [[l.hx - r, y, l.hz - r], [l.hx + r, y, l.hz - r], [l.hx + r, y, l.hz + r], [l.hx - r, y, l.hz + r], 0, 0, 1, 1]; });
    add(quadGeo(pools), new THREE.MeshBasicMaterial({ map: tex.glow, color: 0xffd9a0, transparent: true, opacity: 0.28 * th.lit, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lamps.flatMap(l => [l.hx, 7.2 + l.e, l.hz])), 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: tex.glow, color: 0xffe2b0, size: 5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })); group.add(pts); disposables.push(pg);
  }

  // --- buildings
  const samples = []; for (let i = 0; i < T.N; i += 2) samples.push(T.x[i], T.z[i]);
  const dist = (x, z) => { let b = 1e18; for (let i = 0; i < samples.length; i += 2) { const dx = x - samples[i], dz = z - samples[i + 1], d = dx * dx + dz * dz; if (d < b) b = d; } return Math.sqrt(b); };
  // --- landmark: a recognisable silhouette near the start line
  let lm = null;
  if (env.landmark) {
    let bs = 1e9; for (let gx = minX - 60; gx < maxX + 60; gx += 14) for (let gz = minZ - 60; gz < maxZ + 60; gz += 14) { const d = dist(gx, gz); if (d < 78 || d > 150) continue; const sc = Math.hypot(gx - T.x[60 % T.N], gz - T.z[60 % T.N]) + Math.abs(d - 100); if (sc < bs) { bs = sc; lm = { x: gx, z: gz }; } }
    if (lm) { const L = landmark(env.landmark, th); L.position.set(lm.x, 0, lm.z); group.add(L); }
  }
  // --- far scenery
  const hillMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(env.hill ?? 0x4a6a45).multiplyScalar(th.night ? 0.35 : 1), flatShading: true });
  if (env.scenery === 'hills' || env.scenery === 'domes' || env.scenery === 'dunes') {
    const dunes = env.scenery === 'dunes', n = dunes ? 46 : env.scenery === 'domes' ? 12 : 30, geo = env.scenery === 'hills' ? new THREE.ConeGeometry(1, 1, 7) : new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, hillMat, n); let c = 0;
    for (let k = 0; k < n * 6 && c < n; k++) {
      const a = R() * Math.PI * 2, rr = (dunes ? 0.35 : 0.75) + R() * 0.6, x = cx + Math.cos(a) * (maxX - minX) * rr, z = cz + Math.sin(a) * (maxZ - minZ) * rr, w = dunes ? 30 + R() * 60 : 90 + R() * 110, hgt = dunes ? 6 + R() * 12 : env.scenery === 'domes' ? 110 + R() * 90 : 70 + R() * 120;
      if (dist(x, z) < w + (dunes ? 26 : 190)) continue;
      dummy.position.set(x, env.scenery === 'hills' ? hgt / 2 - 2 : -1, z); dummy.rotation.set(0, R() * 6, 0); dummy.scale.set(w, hgt, w * (0.7 + R() * 0.6)); dummy.updateMatrix(); im.setMatrixAt(c++, dummy.matrix);
    }
    im.count = c; group.add(im); disposables.push(geo, hillMat);
  } else if (env.scenery === 'fuji') {
    const far2 = 1500, a = 0.9, base = new THREE.Color(0x5f7fae).lerp(new THREE.Color(th.fog), 0.45);
    const m1 = new THREE.Mesh(new THREE.ConeGeometry(620, 470, 24, 1, true), new THREE.MeshBasicMaterial({ color: base, fog: false })), m2 = new THREE.Mesh(new THREE.ConeGeometry(205, 156, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xf4f7fb, fog: false }));
    m1.position.set(cx + Math.cos(a) * far2, 234, cz + Math.sin(a) * far2); m2.position.set(m1.position.x, 392, m1.position.z); group.add(m1, m2); disposables.push(m1.geometry, m1.material, m2.geometry, m2.material);
  }
  // --- sun + clouds
  if (!th.night || th.lit < 0.9) {
    const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: th.sun, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, opacity: T.def.theme === 'overcast' ? 0.25 : 0.95 }));
    sunS.position.set(cx + th.sunDir[0] * 2300, Math.max(260, th.sunDir[1] * 1500), cz + th.sunDir[2] * 2300); sunS.scale.setScalar(900); group.add(sunS); disposables.push(sunS.material);
    const cm = new THREE.SpriteMaterial({ map: tex.cloud, color: new THREE.Color(0xffffff).lerp(new THREE.Color(th.hor), th.lit > 0.3 ? 0.55 : 0.1), fog: false, depthWrite: false, transparent: true, opacity: T.def.theme === 'overcast' ? 0.9 : 0.75 });
    for (let k = 0, n = T.def.theme === 'overcast' ? 26 : 12; k < n; k++) { const c = new THREE.Sprite(cm), a = R() * 6.28, rr = 1300 + R() * 1200; c.position.set(cx + Math.cos(a) * rr, 380 + R() * 420, cz + Math.sin(a) * rr); const sc = 500 + R() * 600; c.scale.set(sc, sc * 0.36, 1); group.add(c); }
    disposables.push(cm);
  }
  const fq = tex.facades.map(() => []), roofs = [], neon = [], cell = 31, far = quality === 'low' ? 110 : 150, bh = env.bh || [12, 72], wallT = env.wall || [1, 1, 1], dens = env.density ?? 1;
  const neonCols = [[1, 0.1, 0.5], [0.1, 0.9, 1], [1, 0.75, 0.1], [0.6, 0.2, 1], [0.2, 1, 0.5]];
  for (let gx = minX - 240; gx < maxX + 240; gx += cell) for (let gz = minZ - 240; gz < maxZ + 240; gz += cell) {
    const r1 = R(), r2 = R(), r3 = R(), r4 = R(), r5 = R();
    const bx = gx + (r1 - 0.5) * 5, bz = gz + (r2 - 0.5) * 5, w = 15 + r3 * 10, d = 15 + r4 * 10, dd = dist(bx, bz);
    if (dd < T.half + 7.5 + Math.hypot(w, d) / 2 || blocked(bx, bz, Math.hypot(w, d) / 2 + 4)) continue;
    if (lm && Math.hypot(bx - lm.x, bz - lm.z) < 46) continue;
    if (R() > dens) continue;
    const tower = r5 < (env.towers ?? 0.16);
    if (dd > far && !(tower && dd < 250)) continue;
    const h = tower ? 70 + R() * 90 : bh[0] + R() * R() * (bh[1] - bh[0]), f = Math.floor(R() * fq.length), tint = 0.75 + R() * 0.35, c = [tint * wallT[0], tint * wallT[1], tint * wallT[2] * (0.95 + R() * 0.1)];
    const x0 = bx - w / 2, x1 = bx + w / 2, z0 = bz - d / 2, z1 = bz + d / 2, uo = Math.floor(R() * 8) / 8, tile = 26;
    const side = (a, b, len) => fq[f].push([[a[0], -1, a[1]], [b[0], -1, b[1]], [b[0], h, b[1]], [a[0], h, a[1]], uo, 0, uo + Math.round(len / tile * 8) / 8, Math.round(h / tile * 8) / 8, c]);
    side([x0, z1], [x1, z1], w); side([x1, z1], [x1, z0], d); side([x1, z0], [x0, z0], w); side([x0, z0], [x0, z1], d);
    roofs.push([[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], 0, 0, 1, 1]);
    if (th.night && R() < 0.4) {
      const nc = neonCols[Math.floor(R() * neonCols.length)], y0 = h * (0.5 + R() * 0.45), y1 = y0 + 1.2, e = 0.15;
      const band = (a, b) => neon.push([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], 0, 0, 1, 1, nc]);
      band([x0 - e, z1 + e], [x1 + e, z1 + e]); band([x1 + e, z1 + e], [x1 + e, z0 - e]); band([x1 + e, z0 - e], [x0 - e, z0 - e]); band([x0 - e, z0 - e], [x0 - e, z1 + e]);
    }
  }
  fq.forEach((q, i) => { if (q.length) add(quadGeo(q), new THREE.MeshLambertMaterial({ map: tex.facades[i].map, vertexColors: true, emissiveMap: tex.facades[i].emis, emissive: 0xffffff, emissiveIntensity: th.lit * 1.3 })); });
  add(quadGeo(roofs), new THREE.MeshLambertMaterial({ color: 0x2a2c33 }));
  if (neon.length) add(quadGeo(neon), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));

  // --- traffic cones with simple physics
  const coneGeo = mergeGeometries([colGeo(new THREE.CylinderGeometry(0.05, 0.22, 0.7, 8).translate(0, 0.38, 0), 0xff6a00), colGeo(new THREE.BoxGeometry(0.5, 0.05, 0.5).translate(0, 0.025, 0), 0x222222), colGeo(new THREE.CylinderGeometry(0.1, 0.14, 0.14, 8).translate(0, 0.45, 0), 0xffffff)]);
  const cones = [];
  { // find corner apexes
    let last = -100;
    for (let i = 30; i < T.N - 30; i++) {
      if (mode === 'road' && !inT(i) && E(i) < 0.2 && !blocked(T.x[i], T.z[i], 6) && !(opt.relay && i > T.water[0] - 20 && i < T.water[1] + 20) && Math.abs(T.curv[i]) > 0.012 && i - last > 70 && Math.abs(T.curv[i]) >= Math.abs(T.curv[i + 1]) && cones.length < 70) {
        last = i; const s = T.curv[i] > 0 ? -1 : 1; // outside of the corner
        for (let k = 0; k < 7; k++) { const p = sp((i - 12 + k * 4 + T.N) % T.N), o = (half - 1.1) * s; cones.push({ x: p.x + p.lx * o, y: 0, z: p.z + p.lz * o, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, wx: 0, wz: 0, live: false }); }
      }
    }
  }
  const coneMesh = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, cones.length));
  coneMesh.count = cones.length; coneMesh.frustumCulled = false; group.add(coneMesh);
  const setCone = (c, i) => { dummy.position.set(c.x, c.y + 0.02, c.z); dummy.rotation.set(c.rx, 0, c.rz); dummy.scale.setScalar(1); dummy.updateMatrix(); coneMesh.setMatrixAt(i, dummy.matrix); };
  cones.forEach(setCone); coneMesh.instanceMatrix.needsUpdate = true;

  // --- people: spectators and sidewalk walkers
  const crowd = [], maxPeople = quality === 'low' ? 10 : quality === 'high' ? 34 : 22;
  const spots = [];
  for (let k = 0; k < 8; k++) spots.push({ i: (T.N - 14 + k * 5) % T.N, s: k % 2 ? 1 : -1, o: half + 1.9 + (k % 3) * 0.8 });
  for (let i = 70; i < T.N - 40 && spots.length < maxPeople - 5; i += Math.floor(T.N / (maxPeople - 12))) for (let k = 0; k < 2 && spots.length < maxPeople - 5; k++) spots.push({ i: i + k * 2, s: T.curv[i] > 0 ? -1 : 1, o: half + 2 + R() * 1.6 });
  const idle = ['Idle', 'Talk', 'Dance1', 'Dance2', 'Phone', 'Jump', 'Idle', 'Jump'];
  spots.filter(s => !inT(s.i % T.N) && E(s.i) < 0.2 && !blocked(T.x[s.i % T.N], T.z[s.i % T.N], 8)).forEach((s, k) => {
    const p = sp(s.i), per = makePerson(k);
    per.root.position.set(p.x + p.lx * s.o * s.s, 0.16, p.z + p.lz * s.o * s.s); per.root.rotation.y = Math.atan2(-p.lx * s.s, -p.lz * s.s) + (R() - 0.5) * 0.5;
    per.base = idle[Math.floor(R() * idle.length)]; per.play(per.base, 0); per.mixer.update(R() * 4); per.cheer = 0;
    group.add(per.root); crowd.push(per);
  });
  for (let k = 0; k < 5 && quality !== 'low'; k++) {
    const per = makePerson(k + 3); per.walk = { f: R() * T.N, dir: k % 2 ? 1 : -1, s: k % 3 ? 1 : -1, o: half + 4.2 + R() * 1.2 };
    per.play('Walk', 0); group.add(per.root); crowd.push(per);
  }

  scene.add(group);
  let wx = null; const W = opt.weather;
  if (W === 'rain' || W === 'snow') {
    scene.fog.near = 30; scene.fog.far = th.fogFar * (W === 'rain' ? 0.55 : 0.5); const fc = new THREE.Color(W === 'rain' ? 0x6a7480 : 0xdfe6ee).multiplyScalar(th.night ? 0.35 : 1); scene.fog.color.copy(fc); scene.background = fc.clone();
    const n = quality === 'low' ? 900 : W === 'rain' ? 2200 : 1600, pos = new Float32Array(n * (W === 'rain' ? 6 : 3)), R2 = rng(77), seeds = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) seeds.set([R2() * 90 - 45, R2() * 30, R2() * 90 - 45], k * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const obj = W === 'rain' ? new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfd2e6, transparent: true, opacity: 0.45, fog: false })) : new THREE.Points(g, new THREE.PointsMaterial({ map: tex.glow, color: 0xffffff, size: 0.45, transparent: true, depthWrite: false, fog: false }));
    obj.frustumCulled = false; group.add(obj); disposables.push(g, obj.material); wx = { obj, g, pos, seeds, n, rain: W === 'rain', t: 0 };
    if (W === 'rain' && road) { // wet asphalt: a glossy layer that picks up the sky and lights
      const wet = new THREE.Mesh(ribbon(T, half + 0.3, -half - 0.3, 0.035, 0.035, 24), new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.18, metalness: 0.6, transparent: true, opacity: 0.45, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
      group.add(wet); disposables.push(wet.geometry, wet.material); scene.environmentIntensity = 1.6; }
    if (W === 'snow') group.traverse(o => { if (o.material && o.material.color && o.material.map === tex.ground) o.material.color.lerp(new THREE.Color(0xeef2f7), 0.7); });
  }
  const smash = [], dk2 = new THREE.Object3D();
  if (C) { const k = Math.min(C.n - 1, Math.round(10 / (C.len / C.n))); for (let q = -2; q <= 2; q++) smash.push({ kind: 0, x: C.x[k] + C.tz * q * 2.2, y: 0, z: C.z[k] - C.tx * q * 2.2, h: Math.atan2(C.tx, C.tz), vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, live: false, done: false }); }
  if (road) for (let i = 50, k = 0; i < T.N - 40; i += Math.floor(T.N / 14), k++) { if (inT(i) || E(i) > 0.2 || blocked(T.x[i], T.z[i], 6)) continue; const sd = k % 2 ? 1 : -1, o = (half - 0.9) * sd; for (let q = 0; q < 3; q++) { const j = (i + q * 2) % T.N; smash.push({ kind: 1, x: T.x[j] + T.tz[j] * o, y: 0, z: T.z[j] - T.tx[j] * o, h: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, live: false, done: false }); } }
  const smashMesh = [new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 1.1, 0.18), new THREE.MeshLambertMaterial({ map: tex.fence }), Math.max(1, smash.filter(s => !s.kind).length)), new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10), new THREE.MeshLambertMaterial({ map: tex.barrel }), Math.max(1, smash.filter(s => s.kind).length))];
  smashMesh.forEach(m => { m.frustumCulled = false; group.add(m); });
  const setSmash = () => { const n = [0, 0]; for (const s of smash) { dk2.position.set(s.x, s.y + (s.kind ? 0.53 : 0.55), s.z); dk2.rotation.set(s.rx, s.h, s.rz); dk2.updateMatrix(); smashMesh[s.kind].setMatrixAt(n[s.kind]++, dk2.matrix); } smashMesh.forEach((m, i) => { m.count = n[i]; m.instanceMatrix.needsUpdate = true; }); };
  setSmash();
  let frame = 0;
  return {
    group, theme: th, cones, crowd, center: { x: cx, z: cz }, bounds: { minX, maxX, minZ, maxZ },
    // vehicles: [{x,z,vx,vz,radius}] ; cams: THREE.Camera[]
    update(dt, vehicles, cams) {
      frame++;
      for (const a of ambient) { a.t += a.sp * a.dir * dt; if (a.t > 115) a.t = -115; if (a.t < -115) a.t = 115; const z = a.z, x = z.x + z.tz * a.t + z.tx * a.lane, y = z.z - z.tx * a.t + z.tz * a.lane; a.v.root.position.set(x, 0, y); a.v.root.rotation.y = Math.atan2(z.tz * a.dir, -z.tx * a.dir); for (const w of a.v.wheels) w.spin.rotation.x += a.sp * dt / 0.34 * w.flip; }
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 160); for (const m of pads) m.material.opacity = pulse;
      if (wx && cams[0]) { const c = cams[0].position, fall = wx.rain ? 34 : 3.2; wx.t += dt;
        for (let k = 0; k < wx.n; k++) { const sx = wx.seeds[k * 3], sz = wx.seeds[k * 3 + 2], y = 30 - ((wx.seeds[k * 3 + 1] + wx.t * fall) % 30) + c.y - 8, x = c.x + sx + (wx.rain ? 0 : Math.sin(wx.t + k) * 0.8), z = c.z + sz;
          if (wx.rain) wx.pos.set([x, y, z, x + 0.05, y + 0.9, z], k * 6); else wx.pos.set([x, y, z], k * 3); }
        wx.g.attributes.position.needsUpdate = true; }
      let sd = false;
      for (const p of smash) {
        if (!p.done) for (const v of vehicles) { if (v.air || v.inactive) continue; const dx = p.x - v.x, dz = p.z - v.z; if (dx * dx + dz * dz < 3.4) { const sp2 = Math.hypot(v.vx, v.vz); if (sp2 < 4) continue; p.vx = v.vx * 1.1 + dx * 3; p.vz = v.vz * 1.1 + dz * 3; p.vy = 4 + sp2 * 0.15; p.wx = (Math.random() - 0.5) * 18; p.wz = (Math.random() - 0.5) * 18; p.live = true; p.done = true; v.smashed = (v.smashed || 0) + 1; v.smashAt = [p.x, p.z, p.kind]; if (!v.remote) { v.vx *= 0.96; v.vz *= 0.96; } break; } }
        if (!p.live) continue; sd = true; p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.rz += p.wz * dt;
        if (p.y < 0) { p.y = 0; p.vy = -p.vy * 0.3; p.vx *= 0.7; p.vz *= 0.7; p.wx *= 0.6; p.wz *= 0.6; if (Math.abs(p.vy) < 1 && Math.hypot(p.vx, p.vz) < 0.6) { p.live = false; p.rx = Math.PI / 2; } }
      }
      if (sd) setSmash();
      // cones
      let dirty = false;
      for (let i = 0; i < cones.length; i++) {
        const c = cones[i];
        for (const v of vehicles) {
          const dx = c.x - v.x, dz = c.z - v.z;
          if (dx * dx + dz * dz < 2.6 && c.y < 1.2 && !v.air) {
            const sp2 = Math.hypot(v.vx, v.vz); if (sp2 < 3) continue;
            c.vx = v.vx * 1.05 + dx * 3; c.vz = v.vz * 1.05 + dz * 3; c.vy = 3 + sp2 * 0.12; c.wx = (Math.random() - 0.5) * 20; c.wz = (Math.random() - 0.5) * 20; c.live = true; v.hitCone = true;
          }
        }
        if (!c.live) continue;
        dirty = true; c.vy -= 22 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wx * dt; c.rz += c.wz * dt;
        if (c.y < 0) { c.y = 0; c.vy = -c.vy * 0.35; c.vx *= 0.7; c.vz *= 0.7; c.wx *= 0.6; c.wz *= 0.6; if (Math.abs(c.vy) < 1 && Math.hypot(c.vx, c.vz) < 0.6) { c.live = false; c.vy = 0; c.rx = Math.PI / 2; } }
        setCone(c, i);
      }
      if (dirty) coneMesh.instanceMatrix.needsUpdate = true;
      // people: animate only the ones near a camera
      for (let k = 0; k < crowd.length; k++) {
        const p = crowd[k]; let d2 = 1e18;
        for (const c of cams) { const dx = p.root.position.x - c.position.x, dz = p.root.position.z - c.position.z; d2 = Math.min(d2, dx * dx + dz * dz); }
        if (p.walk) {
          const w = p.walk; w.f = (w.f + w.dir * 1.35 * dt / T.step + T.N) % T.N; const q = sp(Math.floor(w.f));
          p.root.position.set(q.x + q.lx * w.o * w.s, 0.16 + E(Math.floor(w.f)), q.z + q.lz * w.o * w.s); p.root.rotation.y = q.h + (w.dir < 0 ? Math.PI : 0);
        }
        const vis = d2 < 120 * 120; p.root.visible = vis; if (!vis) continue;
        if (!p.walk) { // cheer when a racer blasts past
          let near = false; for (const v of vehicles) { const dx = p.root.position.x - v.x, dz = p.root.position.z - v.z; if (dx * dx + dz * dz < 500) { near = true; break; } }
          if (near && p.cheer <= 0) { p.cheer = 2.2 + Math.random() * 2; p.play(Math.random() < 0.5 ? 'Jump' : 'Dance2', 0.2); }
          if (p.cheer > 0) { p.cheer -= dt; if (p.cheer <= 0) p.play(p.base, 0.3); }
        }
        if (d2 < 45 * 45) p.mixer.update(dt); else if (d2 < 85 * 85 && (frame + k) % 3 === 0) p.mixer.update(dt * 3);
      }
    },
    dispose() {
      scene.remove(group); crowd.forEach(p => p.dispose());
      for (const d of disposables) d.dispose && d.dispose();
      [lampMesh, headMesh, treeMesh, coneMesh, ...smashMesh].forEach(m => { m.geometry.dispose(); m.dispose(); }); smashMesh.forEach(m => m.material.dispose());
      for (const a of ambient) a.v.paint.dispose();
      envRT.dispose(); scene.environment = null;
    },
  };
}
