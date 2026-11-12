// Stadium: striped pitch with markings, goals with nets, stands full of fans, floodlights and ad boards.
import * as THREE from 'three';
export const PL = 52.5, PW = 34, GW = 3.66, GH = 2.44;
function tex(w, h, draw, repeat) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
export function buildStadium(scene, renderer, opt = {}) {
  const g = new THREE.Group(), night = !!opt.night, S = 10; // S = pixels per metre on the pitch texture
  scene.background = new THREE.Color(night ? 0x070b1a : 0x8fc4ee); scene.fog = new THREE.Fog(night ? 0x070b1a : 0x9fcdf0, 150, 420);
  g.add(new THREE.HemisphereLight(0xffffff, 0x3a5a3a, night ? 1.5 : 1.9)); const sun = new THREE.DirectionalLight(0xffffff, night ? 1.4 : 2.0); sun.position.set(30, 80, 40); g.add(sun);
  const W = 130, H = 92, grass = tex(W * S, H * S, (c, w, h) => {
    for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#2f8f3a' : '#37a044'; c.fillRect(i * w / 13, 0, w / 13 + 1, h); }
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,40,0' : '180,255,160'},${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    const X = x => (x + W / 2) * S, Z = z => (z + H / 2) * S; c.strokeStyle = '#f4f8f4'; c.lineWidth = 1.4; c.lineJoin = 'miter';
    c.strokeRect(X(-PL), Z(-PW), PL * 2 * S, PW * 2 * S); c.beginPath(); c.moveTo(X(0), Z(-PW)); c.lineTo(X(0), Z(PW)); c.stroke();
    c.beginPath(); c.arc(X(0), Z(0), 9.15 * S, 0, 7); c.stroke(); c.fillStyle = '#f4f8f4'; c.beginPath(); c.arc(X(0), Z(0), 3, 0, 7); c.fill();
    for (const s of [-1, 1]) { const gx = s * PL; c.strokeRect(Math.min(X(gx), X(gx - s * 16.5)), Z(-20.16), 16.5 * S, 40.32 * S); c.strokeRect(Math.min(X(gx), X(gx - s * 5.5)), Z(-9.16), 5.5 * S, 18.32 * S); c.beginPath(); c.arc(X(gx - s * 11), Z(0), 3, 0, 7); c.fill(); c.beginPath(); c.arc(X(gx - s * 11), Z(0), 9.15 * S, s > 0 ? Math.PI - 0.93 : -0.93, s > 0 ? Math.PI + 0.93 : 0.93); c.stroke(); }
  });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshLambertMaterial({ color: 0x2c7a36 })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.06; g.add(apron);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: grass })); field.rotation.x = -Math.PI / 2; g.add(field);
  // goals
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
  // stands with a painted crowd
  const cols = ['#e8413a', '#f2c40a', '#2a6be0', '#f5f5f5', '#1f9d55', '#ff8a1e', '#222', '#c9d1dc'];
  const crowd = tex(512, 256, (c, w, h) => { c.fillStyle = '#2a2f3a'; c.fillRect(0, 0, w, h); for (let y = 0; y < 26; y++) for (let x = 0; x < 86; x++) { if (Math.random() < 0.08) continue; c.fillStyle = cols[Math.floor(Math.random() * cols.length)]; c.fillRect(x * 6 + (y % 2) * 3, y * 10 + 3, 4, 5); c.fillStyle = ['#e7b48a', '#8a5a3a', '#c98f68', '#5a3a26'][Math.floor(Math.random() * 4)]; c.fillRect(x * 6 + (y % 2) * 3 + 1, y * 10, 2, 3); } }, true);
  const stand = (len, x, z, ry) => { const t = crowd.clone(); t.needsUpdate = true; t.repeat.set(len / 40, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 30), new THREE.MeshLambertMaterial({ map: t, emissive: night ? 0x222222 : 0x000000 })); m.rotation.order = 'YXZ'; m.rotation.set(-1.0, ry, 0); m.position.set(x, 13.5, z); g.add(m);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 14), new THREE.MeshLambertMaterial({ color: 0xdfe5ee })); roof.rotation.y = ry; roof.position.set(x * 1.08, 27, z * 1.08); g.add(roof); const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 28, 1), new THREE.MeshLambertMaterial({ color: 0x3a4152 })); wall.rotation.y = ry; wall.position.set(x * 1.16, 14, z * 1.16); g.add(wall); };
  stand(150, 0, -58, 0); stand(100, -78, 0, Math.PI / 2); stand(100, 78, 0, -Math.PI / 2);
  // ad boards
  const ad = tex(1024, 64, (c, w, h) => { const items = [['GOAL NATION 2026', '#0d57d8', '#fff'], ['NITRO+', '#e8232a', '#fff'], ['VOLT ENERGY', '#f2c40a', '#111'], ['APEX SPORTS', '#111', '#3df5a0']]; items.forEach((it, i) => { c.fillStyle = it[1]; c.fillRect(i * 256, 0, 256, h); c.fillStyle = it[2]; c.font = '900 30px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(it[0], i * 256 + 128, 34); }); }, true);
  const board = (len, x, z, ry) => { const t = ad.clone(); t.needsUpdate = true; t.repeat.set(len / 60, 1); const m = new THREE.Mesh(new THREE.BoxGeometry(len, 1, 0.2), new THREE.MeshBasicMaterial({ map: t })); m.rotation.y = ry; m.position.set(x, 0.5, z); g.add(m); return t; };
  const adT = [board(112, 0, -PW - 4.5, 0), board(72, -PL - 5.5, 0, Math.PI / 2), board(72, PL + 5.5, 0, Math.PI / 2)];
  // floodlights
  for (const [x, z] of [[-70, -52], [70, -52], [-70, 52], [70, 52]]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(1.2, 44, 1.2), new THREE.MeshLambertMaterial({ color: 0x8a93a3 })); pole.position.set(x, 22, z); g.add(pole); const lamp = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1), new THREE.MeshBasicMaterial({ color: night ? 0xfffbe6 : 0xdfe5ee, fog: false })); lamp.position.set(x, 45, z); lamp.lookAt(0, 0, 0); g.add(lamp); }
  scene.add(g);
  return { group: g, update(dt) { for (const t of adT) t.offset.x += dt * 0.02; }, dispose() { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } };
}
