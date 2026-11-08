// TV-style camera director: a smoothed long-lens main camera plus the cuts you see on a live broadcast
// (corner cam, free-kick cam, penalty cam, injury cam, goal celebration cam, crowd cutaways, commentary booth).
import * as THREE from 'three';
import { PITCH } from './sim.js';
const { HL, HW } = PITCH;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class Director {
  constructor(R) {
    this.R = R; this.cur = 'tv'; this.t = 0; this.snapNext = true; this.forced = null; this.onCut = null;
    this.pos = new THREE.Vector3(0, 24, 60); this.look = new THREE.Vector3(); this.fov = 26; this.zoom = 1; this.noise = 0;
    this._v = new THREE.Vector3();
  }
  request(name, seconds) { this.forced = { name, until: performance.now() + seconds * 1000 }; }
  snap() { this.snapNext = true; }

  // framing information shared by the TV shots
  framing(match, o) {
    const b = match.ball, mine = match.humans.map(h => h.player).filter(Boolean), act = match.all.filter(p => !p.sentOff && Math.hypot(p.x - b.x, p.z - b.z) < 26);
    let minX = b.x, maxX = b.x, minZ = b.z, maxZ = b.z;
    for (const p of act) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    let hx0 = b.x, hx1 = b.x, hz0 = b.z, hz1 = b.z;                       // ball + the players you control must always be in shot
    for (const p of mine) { hx0 = Math.min(hx0, p.x); hx1 = Math.max(hx1, p.x); hz0 = Math.min(hz0, p.z); hz1 = Math.max(hz1, p.z); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const spread = Math.max(maxX - minX, (maxZ - minZ) * 1.7, (hx1 - hx0) * 1.15);
    const lx = clamp(lerp(lerp(b.x + b.vx * 0.2, (minX + maxX) / 2, 0.3), (hx0 + hx1) / 2, 0.35), -HL + 14, HL - 14), lz = clamp(lerp(b.z * 0.42, (hz0 + hz1) / 2 * 0.5, 0.3), -12, 10);
    return { lx, lz, spread };
  }

  pick(match, mode, cuts, dt) {
    const o = { z: this.R.zoomSetting || 1 }, F = this.framing(match, o), b = match.ball, V = this._v;
    const tvShot = () => {
      const zoomT = clamp(0.88 + F.spread / 62, 0.88, 1.14); this.zoom = lerp(this.zoom, zoomT, 1 - Math.exp(-dt * 1.3));
      const z = o.z;
      if (mode === 'classic') return { name: 'tv', pos: new THREE.Vector3(F.lx, 31 * z, 35 * z), look: new THREE.Vector3(F.lx, 0, 3), fov: 44, rate: 4.5 };   // high, steady, side-on: scrolls sideways only, like the arcade classics
      if (mode === 'wide') return { name: 'tv', pos: new THREE.Vector3(F.lx * 0.82, 40 * z, F.lz + 76 * z), look: new THREE.Vector3(F.lx, 0, F.lz + 1), fov: 27 * this.zoom, rate: 3 };
      if (mode === 'close') return { name: 'tv', pos: new THREE.Vector3(F.lx, 13 * z, F.lz + 38 * z), look: new THREE.Vector3(F.lx, 0.5, F.lz + 1), fov: 30 * this.zoom, rate: 3.4 };
      if (mode === 'end') { const h = match.humans[0], d = h ? match.dir(h.team) : 1; return { name: 'tv', pos: new THREE.Vector3(b.x - d * 36 * z, 15 * z, b.z * 0.55), look: new THREE.Vector3(b.x + d * 10, 0.5, b.z * 0.7), fov: 34 * this.zoom, rate: 3.2 }; }
      return { name: 'tv', pos: new THREE.Vector3(F.lx * 0.94, 23 * z, F.lz + 58 * z), look: new THREE.Vector3(F.lx, 0, F.lz + 1), fov: 26 * this.zoom, rate: 3 };    // main camera
    };
    if (this.forced && performance.now() < this.forced.until) {
      if (this.forced.name === 'booth' && this.R.boothPos) { const bp = this.R.boothPos; return { name: 'booth', cut: true, pos: new THREE.Vector3(bp.x * 0.3, bp.y + 7, bp.z + 30), look: new THREE.Vector3(bp.x, bp.y - 0.2, bp.z), fov: 22, rate: 6 }; }
    } else this.forced = null;
    const ph = match.phase;
    if (ph === 'goal' || ph === 'var') {
      const sc = match.scorers[match.scorers.length - 1], p = sc && match.all.find(q => q.info === sc.player);
      const tx = p ? p.x : b.x, tz = p ? p.z : b.z, a = this.t * 0.45;
      return { name: 'celebrate', pos: new THREE.Vector3(tx + Math.sin(a) * 7.5, 2.1, tz + Math.cos(a) * 7.5), look: new THREE.Vector3(tx, 1.4, tz), fov: 32, rate: 2.4 };
    }
    if (ph === 'injury' && match.injury && cuts) { const p = match.injury.p; return { name: 'injury', cut: true, pos: new THREE.Vector3(p.x + 9, 3.6, p.z + 11), look: new THREE.Vector3(p.x, 1, p.z), fov: 32, rate: 3 }; }
    if (ph === 'halftime' || ph === 'fulltime') { const a = this.t * 0.07; return { name: 'crowd', pos: new THREE.Vector3(Math.cos(a) * 26, 11, 50), look: new THREE.Vector3(Math.sin(a * 1.3) * 38, 11, -48), fov: 34, rate: 1.6 }; }
    if (ph === 'setpiece' && match.setPiece && cuts) {
      const sp = match.setPiece, gx = match.goalX(sp.team), d = match.dir(sp.team);
      if (sp.type === 'penalty') return { name: 'penalty', cut: true, pos: new THREE.Vector3(sp.x - d * 13, 3.8, 0), look: new THREE.Vector3(sp.x + d * 11, 1.1, 0), fov: 30, rate: 4 };
      if (sp.type === 'corner') { const sx = Math.sign(sp.x || 1), sz = Math.sign(sp.z || 1); return { name: 'corner', cut: true, pos: new THREE.Vector3(sp.x + sx * 2.5, 2.0, sp.z + sz * 5), look: new THREE.Vector3(sp.x - sx * 10, 2.4, sp.z * 0.2), fov: 42, rate: 4 }; }
      if (sp.type === 'freekick' && Math.abs(gx - sp.x) < 34 && Math.abs(sp.z) < 27) { const dx = gx - sp.x, dz = -sp.z, l = Math.hypot(dx, dz) || 1; return { name: 'freekick', cut: true, pos: new THREE.Vector3(sp.x - dx / l * 7, 2.4, sp.z - dz / l * 7), look: new THREE.Vector3(gx, 1.3, 0), fov: 27, rate: 4 }; }
    }
    return tvShot();
  }

  update(match, dt, opts) {
    this.t += dt;
    const mode = opts.camera || 'broadcast', want = this.pick(match, mode, opts.cuts !== false && mode !== 'classic', dt), cam = this.R.camera;
    if (want.name !== this.cur) { const wasCut = want.cut || this.cur === 'booth'; this.cur = want.name; this.t = 0; if (want.cut) { this.snapNext = true; this.R.onCut && this.R.onCut(want.name); } else if (wasCut) this.snapNext = false; }
    // calm, steady panning: the framing target is low-pass filtered, small ball movements inside a dead-zone are
    // ignored (no jitter), then the camera eases after it with a gentle S-curve - nothing jerks, nothing whips
    const sn = this.snapNext, tvLike = want.name === 'tv';
    if (tvLike) {
      if (this.fx === undefined || sn) this.fx = want.look.x;
      const dz = 3.0, off = want.look.x - this.fx, eff = Math.sign(off) * Math.max(0, Math.abs(off) - dz);
      this.fx += eff * (1 - Math.exp(-dt * 4));                       // filtered target
      const shift = this.fx - want.look.x;                            // keep camera and look-at moving as one
      want.look.x += shift; want.pos.x += shift;
    } else this.fx = undefined;
    const kx = sn ? 1 : 1 - Math.exp(-dt * (tvLike ? 3.4 : want.rate)), kr = sn ? 1 : 1 - Math.exp(-dt * (tvLike ? 2.2 : want.rate));
    this.pos.x += (want.pos.x - this.pos.x) * kx; this.pos.y += (want.pos.y - this.pos.y) * kr; this.pos.z += (want.pos.z - this.pos.z) * kr;
    const kl = sn ? 1 : 1 - Math.exp(-dt * (tvLike ? 3.6 : want.rate + 1.2));
    this.look.x += (want.look.x - this.look.x) * kl; this.look.y += (want.look.y - this.look.y) * kl; this.look.z += (want.look.z - this.look.z) * kr;
    this.fov = lerp(this.fov, want.fov, sn ? 1 : 1 - Math.exp(-dt * 1.2));
    this.snapNext = false;
    cam.position.copy(this.pos);
    // handheld micro-movement on the low cameras
    if (want.cut || want.name === 'celebrate') { const s = performance.now() / 1000; cam.position.x += Math.sin(s * 1.7) * 0.025; cam.position.y += Math.sin(s * 2.3 + 1) * 0.02; }
    const R = this.R; if (R.shake > 0) { R.shake = Math.max(0, R.shake - dt); cam.position.x += (Math.random() - 0.5) * R.shake * 0.7; cam.position.y += (Math.random() - 0.5) * R.shake * 0.7; }
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    R.camPos.copy(this.pos); R.camLook.copy(this.look);
  }
}
