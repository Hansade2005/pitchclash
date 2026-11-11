// Combat racing: weapon crates, machine gun, homing rockets, mines, shield and instant nitro.
// Ownership rule (works offline and online): whoever simulates a vehicle decides the damage it takes.
import * as THREE from 'three';
import { lateral, nearestIdx } from './track.js';
import * as audio from './audio.js';

export const WEAPONS = {
  gun: { name: 'MACHINE GUN', ammo: 36, cd: 0.09 },
  rocket: { name: 'ROCKET', ammo: 2, cd: 0.7 },
  mine: { name: 'MINE', ammo: 2, cd: 0.6 },
  shield: { name: 'SHIELD', ammo: 1, cd: 0.5 },
  boost: { name: 'TURBO', ammo: 1, cd: 0.5 },
};
const POOL = ['gun', 'gun', 'rocket', 'rocket', 'mine', 'shield', 'boost'];
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Combat {
  constructor(race) {
    this.race = race; this.T = race.T; this.scene = race.scene; this.fx = race.fx; this.shots = []; this.mines = []; this.y0 = race.alt || 0; this.dummy = new THREE.Object3D();
    const T = this.T, n = Math.max(6, Math.floor(T.N / 70)); this.crates = [];
    for (let k = 0; k < n; k++) for (const s of [-0.5, 0.05, 0.55]) { const i = Math.floor((k + 0.35) * T.N / n) % T.N, off = s * (T.half - 2.2); this.crates.push({ i, x: T.x[i] + T.tz[i] * off, z: T.z[i] - T.tx[i] * off, t: 0 }); }
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#ff9d1a'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#2a1500'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58); g.fillStyle = '#2a1500'; g.font = '900 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 35);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.crateMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), new THREE.MeshBasicMaterial({ map: tex, fog: false }), this.crates.length); this.crateMesh.frustumCulled = false;
    this.rocketMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 1.3, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe9eef5 }), 12); this.rocketMesh.frustumCulled = false; this.rocketMesh.count = 0;
    this.mineMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.6, 0.22, 10), new THREE.MeshBasicMaterial({ color: 0xff2a2a }), 24); this.mineMesh.frustumCulled = false; this.mineMesh.count = 0;
    this.scene.add(this.crateMesh, this.rocketMesh, this.mineMesh);
    this.bubbleGeo = new THREE.SphereGeometry(2.4, 14, 10); this.bubbleMat = new THREE.MeshBasicMaterial({ color: 0x35f0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    if (race.net) { this.onShot = m => { const v = race.byId[m.id]; if (v) this.spawn(v, m.w, m, true); }; this.onCrate = m => { const cr = this.crates[m.k]; if (cr) cr.t = 9; }; race.net.on('shot', this.onShot); race.net.on('crate', this.onCrate); }
  }

  give(v) { const type = POOL[Math.floor(Math.random() * POOL.length)]; v.weapon = { type, ammo: WEAPONS[type].ammo }; if (v.type === 'local') audio.sfx('orb'); }

  // nearest rival in front of v (by track position), within range metres
  targetFor(v, range) {
    const T = this.T; let best = null, bd = range / T.step;
    for (const o of this.race.vehicles) { if (o === v || o.eliminated || o.inactive || o.crashT > 0 || o.type === 'traffic' || (v.cop && o.cop)) continue; const di = (o.idx - v.idx + T.N) % T.N; if (di > 1 && di < bd) { bd = di; best = o; } }
    return best;
  }

  // create a projectile / effect. p = network payload when replaying someone else's shot.
  spawn(v, w, p, fromNet) {
    const x = p ? p.x : v.x, z = p ? p.z : v.z, h = p ? p.h : v.h, mine = v.type === 'local';
    if (w === 'gun') {
      this.shots.push({ type: 'gun', x: x + Math.sin(h) * 2, z: z + Math.cos(h) * 2, h, sp: 150 + Math.max(0, v.vf), life: 0.55, owner: v });
      if (mine) audio.sfx('gun');
    } else if (w === 'rocket') {
      const t = p && p.tid ? this.race.byId[p.tid] : this.targetFor(v, 190);
      this.shots.push({ type: 'rocket', x: x + Math.sin(h) * 2.4, z: z + Math.cos(h) * 2.4, h, sp: Math.max(55, v.vf + 38), life: 4.5, owner: v, target: t });
      if (mine) audio.sfx('rocket'); if (!p) p = { tid: t ? t.id : null };
    } else if (w === 'mine') { this.mines.push({ x: x - Math.sin(h) * 3, z: z - Math.cos(h) * 3, owner: v, arm: 0.6, life: 40 }); if (mine) audio.sfx('click'); }
    else if (w === 'shield') { if (!v.remote) v.shield = 7; if (mine) audio.sfx('nitro'); }
    else if (w === 'boost') { if (!v.remote) v.nitro = 1; if (mine) audio.sfx('nitro'); }
    if (this.race.net && !fromNet) this.race.net.send({ t: 'shot', id: v.id, w, x: +v.x.toFixed(2), z: +v.z.toFixed(2), h: +v.h.toFixed(3), tid: p && p.tid });
  }

  tryFire(v) {
    const wp = v.weapon; if (!wp || v.fireCd > 0 || v.crashT > 0 || v.frozen) return;
    v.fireCd = WEAPONS[wp.type].cd; if (wp.type === 'gun' || wp.type === 'rocket') this.race.wanted(v, 25);
    let h = v.h;
    if (wp.type === 'gun') { const t = this.targetFor(v, 110); if (t) { const a = wrap(Math.atan2(t.x - v.x, t.z - v.z) - v.h); if (Math.abs(a) < 0.24) h = v.h + a; } h += (Math.random() - 0.5) * 0.02; }
    this.spawn(v, wp.type, wp.type === 'gun' ? { x: v.x, z: v.z, h } : null, false);
    if (--wp.ammo <= 0) v.weapon = null;
  }

  hit(o, dmg, heavy, by) {
    const r = this.race; this.fx.burst(o.x, 1, o.z, 1, heavy ? 0.6 : 0.9, 0.2);
    if (heavy) { this.fx.burst(o.x, 1.6, o.z, 1, 0.35, 0.1); for (let k = 0; k < 4; k++) this.fx.smoke(o.x, 1, o.z, 0, 0); for (const l of r.locals) { const d = Math.hypot(l.x - o.x, l.z - o.z); if (d < 70) audio.sfx('boom', 1 - d / 70); } }
    if (o.remote) return;            // its owner applies the damage
    if (o.shield > 0) return;
    if (heavy) { o.vx *= 0.4; o.vz *= 0.4; o.h += (Math.random() - 0.5) * 0.9; o.impact = Math.max(o.impact, 14); } else { o.vx *= 0.985; o.vz *= 0.985; o.impact = Math.max(o.impact, 3.5); }
    if (o.damage(dmg, this.fx) && by && by.type === 'local') { by.kills = (by.kills || 0) + 1; r.game.onWreck && r.game.onWreck(o); }
  }

  update(dt) {
    const r = this.race, T = this.T, vs = r.vehicles, d = this.dummy, time = performance.now() / 1000;
    // crates
    this.crates.forEach((c, k) => {
      if (c.t > 0) c.t -= dt;
      else for (const v of vs) { if (v.remote || v.weapon || v.npc || v.eliminated || v.inactive || v.finished) continue; const dx = c.x - v.x, dz = c.z - v.z; if (dx * dx + dz * dz < 5.5) { c.t = 9; this.give(v); this.fx.burst(c.x, 1, c.z, 1, 0.7, 0.2); if (r.net) r.net.send({ t: 'crate', k }); break; } }
      d.position.set(c.x, this.y0 + 1.25 + Math.sin(time * 2.5 + k) * 0.15, c.z); d.rotation.set(0.5, time * 1.6 + k, 0.3); d.scale.setScalar(c.t > 0 ? 0.0001 : 1); d.updateMatrix(); this.crateMesh.setMatrixAt(k, d.matrix);
    });
    this.crateMesh.instanceMatrix.needsUpdate = true;
    // firing: players hold the fire button, AI decides for itself
    if (r.state === 'racing') for (const v of vs) {
      if (v.remote || !v.weapon || v.eliminated || v.inactive) continue;
      if (v.type === 'local' && !v.finished) { if (v.fire) this.tryFire(v); continue; }
      const w = v.weapon.type; let go = false;
      if (w === 'gun' || w === 'rocket') { const t = this.targetFor(v, w === 'gun' ? 70 : 150); go = !!t && Math.abs(lateral(T, t.idx, t.x, t.z) - lateral(T, v.idx, v.x, v.z)) < (w === 'gun' ? 3.5 : 9) && Math.random() < dt * (w === 'gun' ? 30 : 1.2); }
      else if (w === 'mine') go = vs.some(o => o !== v && !o.npc && ((v.idx - o.idx + T.N) % T.N) * T.step < 22 && ((v.idx - o.idx + T.N) % T.N) > 1) && Math.random() < dt * 1.5;
      else if (w === 'shield') go = v.hp < 70 || Math.random() < dt * 0.15; else go = Math.random() < dt * 0.6;
      if (go) this.tryFire(v);
    }
    // projectiles
    let nr = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.life -= dt;
      if (s.type === 'rocket') {
        const t = s.target; if (t && !t.eliminated && !t.inactive) s.h += Math.max(-3.2 * dt, Math.min(3.2 * dt, wrap(Math.atan2(t.x - s.x, t.z - s.z) - s.h)));
        else { const ci = nearestIdx(T, s.x, s.z, -1); s.h += Math.max(-2 * dt, Math.min(2 * dt, wrap(Math.atan2(T.tx[(ci + 8) % T.N], T.tz[(ci + 8) % T.N]) - s.h))); }
        s.sp = Math.min(s.sp + 40 * dt, 105); this.fx.flame(s.x, 0.9, s.z, -Math.sin(s.h) * 8, -Math.cos(s.h) * 8);
      }
      const steps = s.type === 'gun' ? 3 : 1; let dead = s.life <= 0;
      for (let k = 0; k < steps && !dead; k++) {
        s.x += Math.sin(s.h) * s.sp * dt / steps; s.z += Math.cos(s.h) * s.sp * dt / steps;
        for (const o of vs) {
          if (o === s.owner || o.eliminated || o.inactive || o.crashT > 0) continue;
          const dx = o.x - s.x, dz = o.z - s.z, rad = s.type === 'gun' ? 1.7 : 2.5;
          if (dx * dx + dz * dz < rad * rad) { this.hit(o, s.type === 'gun' ? 7 : 60, s.type === 'rocket', s.owner); dead = true; break; }
        }
      }
      if (s.type === 'gun') this.fx.glowP.emit(s.x, this.y0 + 0.8, s.z, 0, 0, 0, 0.07, 0.35, 1, 0.85, 0.35, 1);
      else if (!dead) { d.position.set(s.x, this.y0 + 0.9, s.z); d.rotation.set(0, s.h, 0); d.scale.setScalar(1); d.updateMatrix(); if (nr < 12) this.rocketMesh.setMatrixAt(nr++, d.matrix); }
      if (dead) { if (s.type === 'rocket') this.fx.burst(s.x, 1, s.z, 1, 0.6, 0.2); this.shots.splice(i, 1); }
    }
    this.rocketMesh.count = nr; this.rocketMesh.instanceMatrix.needsUpdate = true;
    // mines
    let nm = 0;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i]; m.arm -= dt; m.life -= dt; let dead = m.life <= 0;
      if (m.arm <= 0) for (const o of vs) { if (o.eliminated || o.inactive || o.crashT > 0) continue; const dx = o.x - m.x, dz = o.z - m.z; if (dx * dx + dz * dz < 5) { this.hit(o, 50, true, m.owner); dead = true; break; } }
      if (dead) { this.mines.splice(i, 1); continue; }
      if (nm < 24) { d.position.set(m.x, this.y0 + 0.14, m.z); d.rotation.set(0, 0, 0); d.scale.setScalar(Math.sin(time * 9) > 0 ? 1 : 0.8); d.updateMatrix(); this.mineMesh.setMatrixAt(nm++, d.matrix); }
    }
    this.mineMesh.count = nm; this.mineMesh.instanceMatrix.needsUpdate = true;
    // shield bubbles + damage smoke
    for (const v of vs) {
      if (v.shield > 0 && !v.bubble) { v.bubble = new THREE.Mesh(this.bubbleGeo, this.bubbleMat); v.bubble.position.y = 0.9; v.root.add(v.bubble); }
      if (v.bubble) v.bubble.visible = v.shield > 0;
      if (v.hp < 40 && !v.inactive && !v.eliminated && Math.random() < 0.35) this.fx.smokeP.emit(v.x, 1, v.z, v.vx * 0.3, 1.5, v.vz * 0.3, 0.9, 0.7, 0.18, 0.18, 0.18, 0.5, 2.2);
    }
  }

  dispose() {
    this.scene.remove(this.crateMesh, this.rocketMesh, this.mineMesh);
    for (const m of [this.crateMesh, this.rocketMesh, this.mineMesh]) { m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    this.bubbleGeo.dispose(); this.bubbleMat.dispose();
    if (this.race.net) { this.race.net.off('shot', this.onShot); this.race.net.off('crate', this.onCrate); }
  }
}
