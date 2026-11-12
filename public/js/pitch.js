// Stadium builder: striped / checked pitch with markings, goals with nets, stands with a painted crowd, roofs, ad boards,
// floodlights, a sky dome, surroundings and time-of-day + weather lighting. Every ground in stadiums.js gets its own look.
import * as THREE from 'three';
import { WEATHER } from './weather.js';
import { STADIUMS } from './stadiums.js';
export const PL = 52.5, PW = 34, GW = 3.66, GH = 2.44;
function tex(w, h, draw, repeat) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
const col = h => new THREE.Color(h), mixc = (a, b, t) => '#' + col(a).lerp(col(b), t).getHexString();
const SKY = { day: ['#3f86d6', '#c3e2f7'], dusk: ['#34457a', '#f2a468'], night: ['#03050d', '#101a35'] };
const GREY = { day: ['#7d8791', '#b8c0c7'], dusk: ['#4a4a58', '#a4857a'], night: ['#090b12', '#1d2331'] };
const LIGHT = { day: { hemi: ['#ffffff', '#3a5a3a', 1.9], sun: ['#ffffff', 2.0, [30, 80, 40]] }, dusk: { hemi: ['#ffd6b0', '#3a4a4a', 1.5], sun: ['#ffa468', 1.8, [-80, 34, 50]] }, night: { hemi: ['#b9c6ff', '#1a2a2a', 1.45], sun: ['#aebfff', 1.25, [30, 80, 40]] } };
const rnd = (a, b) => a + Math.random() * (b - a);

function skyTexture(tod, gray, stars) {
  return tex(8, 256, (c, w, h) => {
    const top = mixc(SKY[tod][0], GREY[tod][0], gray), hor = mixc(SKY[tod][1], GREY[tod][1], gray), g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(0.62, mixc(top, hor, 0.7)); g.addColorStop(1, hor); c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}
function starTexture() { return tex(1024, 256, (c, w, h) => { for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(255,255,255,${rnd(0.3, 0.95)})`; c.fillRect(Math.random() * w, Math.random() * h * 0.7, rnd(1, 2.4), rnd(1, 2.4)); } }); }

function pitchTexture(st, S, W, H) {
  return tex(W * S, H * S, (c, w, h) => {
    const [a, b] = st.grass, n = st.n || 13;
    if (st.pat === 'checks') { const cw = w / (n + 4), ch = h / 9; for (let i = 0; i < n + 4; i++) for (let j = 0; j < 9; j++) { c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(i * cw, j * ch, cw + 1, ch + 1); } }
    else if (st.pat === 'diag') { const bw = w / n; for (let i = -6; i < n + 6; i++) { c.fillStyle = i % 2 ? a : b; c.beginPath(); c.moveTo(i * bw, 0); c.lineTo((i + 1) * bw, 0); c.lineTo((i + 1) * bw + h * 0.45, h); c.lineTo(i * bw + h * 0.45, h); c.fill(); } }
    else { const m = st.pat === 'wide' ? 9 : n; for (let i = 0; i < m; i++) { c.fillStyle = i % 2 ? a : b; c.fillRect(i * w / m, 0, w / m + 1, h); } }
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,40,0' : '180,255,160'},${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    const X = x => (x + W / 2) * S, Z = z => (z + H / 2) * S; c.strokeStyle = '#f4f8f4'; c.lineWidth = 1.4; c.lineJoin = 'miter';
    c.strokeRect(X(-PL), Z(-PW), PL * 2 * S, PW * 2 * S); c.beginPath(); c.moveTo(X(0), Z(-PW)); c.lineTo(X(0), Z(PW)); c.stroke();
    c.beginPath(); c.arc(X(0), Z(0), 9.15 * S, 0, 7); c.stroke(); c.fillStyle = '#f4f8f4'; c.beginPath(); c.arc(X(0), Z(0), 3, 0, 7); c.fill();
    for (const s of [-1, 1]) { const gx = s * PL; c.strokeRect(Math.min(X(gx), X(gx - s * 16.5)), Z(-20.16), 16.5 * S, 40.32 * S); c.strokeRect(Math.min(X(gx), X(gx - s * 5.5)), Z(-9.16), 5.5 * S, 18.32 * S); c.beginPath(); c.arc(X(gx - s * 11), Z(0), 3, 0, 7); c.fill(); c.beginPath(); c.arc(X(gx - s * 11), Z(0), 9.15 * S, s > 0 ? Math.PI - 0.93 : -0.93, s > 0 ? Math.PI + 0.93 : 0.93); c.stroke(); }
  });
}

function crowdTexture(st, homeHex) {
  const cols = [...st.crowd]; if (homeHex != null) { const h = '#' + new THREE.Color(homeHex).getHexString(); cols.push(h, h, h); }
  return tex(512, 256, (c, w, h) => {
    c.fillStyle = st.seat; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 86; x++) { if (Math.random() < 0.1) continue; c.fillStyle = cols[Math.floor(Math.random() * cols.length)]; c.fillRect(x * 6 + (y % 2) * 3, y * 10 + 3, 4, 5); c.fillStyle = ['#e7b48a', '#8a5a3a', '#c98f68', '#5a3a26', '#f1c9a5'][Math.floor(Math.random() * 5)]; c.fillRect(x * 6 + (y % 2) * 3 + 1, y * 10, 2, 3); }
  }, true);
}
function glowTexture(glow) { return tex(256, 128, (c, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) { c.fillStyle = glow[(i + j) % glow.length]; c.beginPath(); c.moveTo(i * 16 + 8, j * 16); c.lineTo(i * 16 + 16, j * 16 + 8); c.lineTo(i * 16 + 8, j * 16 + 16); c.lineTo(i * 16, j * 16 + 8); c.fill(); } c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * 16, 0); c.lineTo(i * 16, h); c.stroke(); } }, true); }

function backdropTexture(kind, tod) {
  return tex(1024, 256, (c, w, h) => {
    const tone = tod === 'night' ? 0.35 : tod === 'dusk' ? 0.7 : 1;
    if (kind === 'city') { for (let x = 0; x < w; x += rnd(18, 44)) { const bw = rnd(20, 52), bh = rnd(50, 200); c.fillStyle = mixc('#5a6678', '#7d8998', Math.random()); c.fillRect(x, h - bh, bw, bh); c.fillStyle = `rgba(255,224,150,${tod === 'night' ? 0.85 : 0.18})`; for (let y = h - bh + 6; y < h - 4; y += 10) for (let xx = x + 4; xx < x + bw - 4; xx += 8) if (Math.random() < 0.55) c.fillRect(xx, y, 3, 4); } }
    else if (kind === 'mountains') { for (const [colr, amp, base] of [['#7e92a8', 120, 150], ['#566c80', 90, 190]]) { c.fillStyle = colr; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 16) c.lineTo(x, h - base - Math.abs(Math.sin(x * 0.011 + base)) * amp - Math.random() * 14); c.lineTo(w, h); c.fill(); } }
    else if (kind === 'hills' || kind === 'palms') { for (const [colr, base, amp] of [['#4f8a52', 110, 40], ['#3b7640', 70, 30]]) { c.fillStyle = colr; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, h - base - Math.sin(x * 0.008 + base) * amp); c.lineTo(w, h); c.fill(); }
      if (kind === 'palms') for (let i = 0; i < 26; i++) { const x = rnd(0, w), y = h - rnd(60, 130); c.strokeStyle = '#4a3a24'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, h - 40); c.quadraticCurveTo(x + rnd(-8, 8), y + 30, x, y); c.stroke(); c.strokeStyle = '#1f6a2a'; c.lineWidth = 2.4; for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * 12, y - 6 + Math.sin(a) * 6, x + Math.cos(a) * 20, y + 6 + Math.sin(a) * 12); c.stroke(); } }
      else for (let i = 0; i < 90; i++) { c.fillStyle = '#2d6a35'; c.beginPath(); c.arc(rnd(0, w), h - rnd(40, 120), rnd(4, 9), 0, 7); c.fill(); } }
    else { for (const [colr, base, amp] of [['#d8b878', 90, 30], ['#c8a460', 50, 24]]) { c.fillStyle = colr; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, h - base - Math.abs(Math.sin(x * 0.006 + base * 0.1)) * amp); c.lineTo(w, h); c.fill(); } }
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(0,0,0,${1 - tone})`; c.fillRect(0, 0, w, h);
  });
}

export function buildStadium(scene, renderer, opt = {}) {
  const st = opt.stadium || STADIUMS[0], tod = opt.tod || (opt.night ? 'night' : 'day'), wk = WEATHER[opt.weather] || WEATHER.clear, gray = wk.gray, night = tod === 'night';
  const g = new THREE.Group(), S = 10, W = 130, H = 92;
  // ---- sky dome, fog and lights
  const horizon = mixc(SKY[tod][1], GREY[tod][1], gray); scene.background = new THREE.Color(horizon); scene.fog = new THREE.Fog(horizon, wk.fog[0], wk.fog[1]);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(tod, gray), side: THREE.BackSide, fog: false, depthWrite: false })); dome.renderOrder = -2; g.add(dome);
  if (night && gray < 0.7) { const stars = new THREE.Mesh(new THREE.SphereGeometry(470, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: starTexture(), side: THREE.BackSide, transparent: true, fog: false, depthWrite: false, opacity: 1 - gray })); stars.renderOrder = -1; g.add(stars); }
  const L = LIGHT[tod], dim = 1 - 0.3 * gray, hemi = new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2] * dim), sun = new THREE.DirectionalLight(L.sun[0], L.sun[1] * (1 - 0.62 * gray)); sun.position.set(...L.sun[2]); g.add(hemi, sun, sun.target);
  const base0 = { hemi: hemi.intensity };
  if (opt.shadows) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -78; sc.right = 78; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 260; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; }
  // ---- ground
  const apronCol = wk.snowGround ? mixc(st.apron, '#e9eef2', 0.85) : st.apron;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshLambertMaterial({ color: apronCol })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.06; g.add(apron);
  const wet = wk.wet || 0, fieldMat = new THREE.MeshLambertMaterial({ map: pitchTexture(st, S, W, H), color: col('#ffffff').multiplyScalar(1 - 0.2 * wet) });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(W, H), fieldMat); field.rotation.x = -Math.PI / 2; field.receiveShadow = true; g.add(field);
  if (st.track) { const sh = new THREE.Shape(); sh.moveTo(-64, -42); sh.lineTo(64, -42); sh.lineTo(64, 42); sh.lineTo(-64, 42); const hole = new THREE.Path(); hole.moveTo(-56.5, -37); hole.lineTo(-56.5, 37); hole.lineTo(56.5, 37); hole.lineTo(56.5, -37); sh.holes.push(hole);
    const tr = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshLambertMaterial({ color: st.track, polygonOffset: true, polygonOffsetFactor: -2 })); tr.rotation.x = -Math.PI / 2; tr.position.y = 0.012; g.add(tr); }
  if (wk.snowGround) { const sn = tex(512, 512, (c, w, h) => { c.fillStyle = 'rgba(240,246,250,0.3)'; c.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${rnd(0.08, 0.4)})`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, rnd(1, 4), 0, 7); c.fill(); } }, true); sn.repeat.set(5, 4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: sn, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.receiveShadow = true; g.add(m); }
  // ---- goals
  const net = tex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.moveTo(0, i); c.lineTo(64, i); c.stroke(); } }, true);
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff }), netM = () => { const t = net.clone(); t.needsUpdate = true; return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }); };
  for (const s of [-1, 1]) {
    const G = new THREE.Group(); G.position.x = s * PL;
    for (const z of [-GW, GW]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GH, 8), white); p.position.set(0, GH / 2, z); G.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GW * 2, 8), white); bar.rotation.x = Math.PI / 2; bar.position.y = GH; G.add(bar);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GH), netM()); back.material.map.repeat.set(9, 3); back.rotation.y = Math.PI / 2; back.position.set(s * 2, GH / 2, 0); G.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2, GW * 2), netM()); top.material.map.repeat.set(3, 9); top.rotation.x = Math.PI / 2; top.position.set(s * 1, GH, 0); G.add(top);
    for (const z of [-GW, GW]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(2, GH), netM()); side.material.map.repeat.set(3, 3); side.position.set(s * 1, GH / 2, z); G.add(side); }
    g.add(G);
  }
  // ---- stands: crowd, outer wall (glowing diamonds for some grounds) and roof
  const crowd = crowdTexture(st, opt.homeColor), glowTex = st.glow ? glowTexture(st.glow) : null, lit = night || gray > 0.8;
  const stand = (len, x, z, ry, tall = 1) => {
    const G = new THREE.Group(); G.position.set(x, 0, z); G.rotation.y = ry; // local +z looks at the pitch
    const t = crowd.clone(); t.needsUpdate = true; t.repeat.set(len / 40, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 30 * tall), new THREE.MeshLambertMaterial({ map: t, emissive: night ? 0x222222 : 0x000000 })); m.rotation.x = -1.0; m.position.y = 13.5 * tall; G.add(m);
    const wallMat = glowTex ? new THREE.MeshBasicMaterial({ map: (() => { const q = glowTex.clone(); q.needsUpdate = true; q.repeat.set(len / 30, 1); return q; })(), color: night ? 0xffffff : 0xcfd6e2 }) : new THREE.MeshLambertMaterial({ color: st.wall });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 28 * tall, 1), wallMat); wall.position.set(0, 14 * tall, -9.3); G.add(wall);
    const rc = col(st.roofCol || '#dfe5ee'), roofMat = new THREE.MeshLambertMaterial({ color: rc });
    if (st.roof === 'flat' || st.roof === 'trusses' || st.roof === 'ring') { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, st.roof === 'ring' ? 18 : 14), roofMat); r.position.set(0, 27 * tall, -5); G.add(r); if (st.roof === 'ring') { const lip = new THREE.Mesh(new THREE.BoxGeometry(len, 1.4, 0.6), new THREE.MeshLambertMaterial({ color: 0xffffff })); lip.position.set(0, 26.8 * tall, 4.2); G.add(lip); } }
    if (st.roof === 'trusses') for (let i = -Math.floor(len / 20); i <= Math.floor(len / 20); i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 15), new THREE.MeshLambertMaterial({ color: 0x8c93a0 })); b.position.set(i * 10, 25.8 * tall, -4.5); G.add(b); }
    if (st.roof === 'canopy') { const r = new THREE.Mesh(new THREE.PlaneGeometry(len, 17), new THREE.MeshLambertMaterial({ color: rc, transparent: true, opacity: 0.62, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2 + 0.2; r.position.set(0, 27.5 * tall, -3); G.add(r); for (let i = -Math.floor(len / 30); i <= Math.floor(len / 30); i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 27 * tall, 0.5), new THREE.MeshLambertMaterial({ color: 0xaab2c0 })); b.position.set(i * 15, 13.5 * tall, 4.5); G.add(b); } }
    g.add(G); return G;
  };
  const tall = st.tall || 1; stand(150, 0, -58, 0, tall); stand(100, -78, 0, Math.PI / 2, tall); stand(100, 78, 0, -Math.PI / 2, tall);
  if (st.shape === 'bowl') { stand(46, -70, -50, 0.96, tall); stand(46, 70, -50, -0.96, tall); }
  if (st.towers) for (const [x, z] of [[-86, -62], [86, -62], [-92, 28], [92, 28]]) { const tw = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 36, 16), new THREE.MeshLambertMaterial({ color: st.wall })); tw.position.set(x, 18, z); g.add(tw); }
  // ---- surroundings
  const bd = backdropTexture(st.back || 'city', tod), tint = night ? 0x6a7690 : tod === 'dusk' ? 0xe0b8a0 : 0xffffff;
  const back = (x, z, ry, len) => { const t = bd.clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 220, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 70), new THREE.MeshBasicMaterial({ map: t, transparent: true, color: tint, depthWrite: false })); m.position.set(x, 34, z); m.rotation.y = ry; g.add(m); };
  back(0, -170, 0, 460); back(-190, -20, Math.PI / 2, 360); back(190, -20, -Math.PI / 2, 360);
  // ---- ad boards
  const ad = tex(1024, 64, (c, w, h) => { const items = [['GOAL NATION 2026', '#0d57d8', '#fff'], ['NITRO+', '#e8232a', '#fff'], ['VOLT ENERGY', '#f2c40a', '#111'], ['APEX SPORTS', '#111', '#3df5a0']]; items.forEach((it, i) => { c.fillStyle = it[1]; c.fillRect(i * 256, 0, 256, h); c.fillStyle = it[2]; c.font = '900 30px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(it[0], i * 256 + 128, 34); }); }, true);
  const board = (len, x, z, ry) => { const t = ad.clone(); t.needsUpdate = true; t.repeat.set(len / 60, 1); const m = new THREE.Mesh(new THREE.BoxGeometry(len, 1, 0.2), new THREE.MeshBasicMaterial({ map: t })); m.rotation.y = ry; m.position.set(x, 0.5, z); g.add(m); return t; };
  const adT = [board(112, 0, -PW - 4.5, 0), board(72, -PL - 5.5, 0, Math.PI / 2), board(72, PL + 5.5, 0, Math.PI / 2)];
  // ---- floodlights (with a glow at night, dusk and in storms)
  let glowTx = null; if (night || tod === 'dusk' || gray > 0.8) glowTx = tex(64, 64, (c) => { const r = c.createRadialGradient(32, 32, 1, 32, 32, 31); r.addColorStop(0, 'rgba(255,250,225,0.95)'); r.addColorStop(0.3, 'rgba(255,240,200,0.35)'); r.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = r; c.fillRect(0, 0, 64, 64); });
  for (const [x, z] of [[-70, -52], [70, -52], [-70, 52], [70, 52]]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1.2, 44, 1.2), new THREE.MeshLambertMaterial({ color: 0x8a93a3 })); pole.position.set(x, 22, z); g.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1), new THREE.MeshBasicMaterial({ color: night || lit ? 0xfffbe6 : 0xdfe5ee, fog: false })); lamp.position.set(x, 45, z); lamp.lookAt(0, 0, 0); g.add(lamp);
    if (glowTx) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTx, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: night ? 1 : 0.55 })); sp.scale.setScalar(26); sp.position.set(x, 45, z); g.add(sp); }
  }
  scene.add(g);
  return {
    group: g, sun, hemi, field, fieldMat, name: st.name,
    flash(f) { hemi.intensity = base0.hemi * (1 + f * 1.6); },
    update(dt) { for (const t of adT) t.offset.x += dt * 0.02; },
    dispose() { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); } } }); },
  };
}
