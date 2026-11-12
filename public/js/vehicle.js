// Arcade vehicle: fast, forgiving physics for cars and bikes + visuals (wheels, lean, rider).
import * as THREE from 'three';
import { makeVehicle, makePerson } from './assets.js';
import { nearestIdx, lateral, cutPos, elevAt } from './track.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const qY = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
let shadowTex = null, beamTex = null;
function radial(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, inner); r.addColorStop(0.55, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function nameSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '900 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, 128, 32); g.fillStyle = color; g.fillText(text, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, fog: false })); s.scale.set(3.6, 0.9, 1); return s;
}

export class Vehicle {
  constructor(scene, stats, o = {}) {
    this.scene = scene; this.st = stats; this.isBike = stats.kind === 'bike'; this.kind = stats.kind; this.isBoat = stats.kind === 'boat'; this.air = ['heli', 'plane', 'space'].includes(stats.kind); this.alt = { heli: 11, plane: 14, space: 1.3 }[stats.kind] || 0; this.y = 0; this.vy = 0; this.airT = 0; this.trickYaw = 0; this.trickFlip = 0; this.tricks = 0; this.canJump = stats.kind === 'car' || stats.kind === 'bike'; this.boatForm = false; this.ey = 0; this.eyT = 0; this.pitch = 0; this.padT = 0; this.useElev = false; this.onCut = false; this.name = o.name || 'Racer'; this.id = o.id; this.color = o.color ?? stats.color;
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.vf = 0; this.steer = 0; this.slip = 0;
    this.nitro = 0.5; this.boosting = false; this.drift = false; this.draft = false;
    this.idx = 0; this.lapsDone = 0; this.started = false; this.finished = false; this.finishTime = 0; this.eliminated = false; this.score = 0;
    this.input = { steer: 0, gas: 0, brake: 0, hand: false, nitro: false };
    const dims = { bike: [0.45, 0.7, 0.55], boat: [0.85, 1.1, 1.4], heli: [1.1, 1.5, 1.1], plane: [1.9, 1.7, 0.9], space: [1.5, 1.5, 1.3] }[stats.kind] || [1.02, 1.15, 1.25];
    this.halfW = dims[0]; this.rad = dims[1]; this.len = dims[2];
    this.crashT = 0; this.safeT = 0; this.wrongT = 0; this.stuckT = 0; this.impact = 0; this.remote = false; this.net = null; this.frozen = true;
    this.lapStart = 0; this.bestLap = 0; this.hp = 100; this.shield = 0; this.weapon = null; this.fire = false; this.fireCd = 0; this.inactive = false; this.bustT = 0; this.topSpeed = 0; this.npc = false; this.cop = !!o.cop;

    const m = this.model = makeVehicle(stats.model, this.color);
    this.root = new THREE.Group(); this.tilt = new THREE.Group(); this.tilt.add(m.root); this.root.add(this.tilt);
    if (!shadowTex) { shadowTex = radial('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'); beamTex = radial('rgba(255,244,214,0.5)', 'rgba(255,244,214,0)'); }
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(this.isBike ? 1.6 : 3.2, this.isBike ? 3 : 6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.045 - this.alt; if (this.kind === 'space') sh.visible = false; this.shadow = sh; sh.renderOrder = 1; this.root.add(sh);
    if (o.night && !this.air) { const b = new THREE.Mesh(new THREE.PlaneGeometry(7, 16), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 })); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.06, 9.5); b.renderOrder = 2; this.root.add(b); }
    if (this.kind === 'car') { // brake lights
      const bm = this.brakeMat = new THREE.SpriteMaterial({ map: beamTex, color: 0xff2010, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      for (const sx of [-0.62, 0.62]) { const b = new THREE.Sprite(bm); b.scale.setScalar(0.9); b.position.set(sx, 0.72, m.box.min.z - 0.05); this.tilt.add(b); }
    }
    if (o.cop) { // roof light bar
      this.bar = [0xff1a1a, 0x1a5cff].map((c, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamTex, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(2.6); s.position.set(i ? 0.45 : -0.45, 1.75, -0.1); this.tilt.add(s); return s; });
    }
    if (o.label) { this.label = nameSprite(this.name, o.labelColor || '#ffffff'); this.label.position.y = this.isBike ? 2.5 : 2.2; this.root.add(this.label); }
    if (this.isBike) {
      const r = this.rider = makePerson(o.person ?? 0); r.play('Drive', 0); r.mixer.update(0.5);
      this.seat = new THREE.Group(); this.tilt.add(this.seat); this.seat.add(r.root);
      this.poseRider(); this.riderOff = null;
    }
    scene.add(this.root);
  }

  poseRider() {
    const r = this.rider.root;
    r.position.set(0, -0.03, -0.78); r.rotation.set(0.5, 0, 0); r.scale.setScalar(1);
    this.riderBones = {}; r.traverse(o => { if (o.isBone) this.riderBones[o.name] = o; });
  }

  place(T, idx, off) {
    idx = (idx + T.N) % T.N;
    this.x = T.x[idx] + T.tz[idx] * off; this.z = T.z[idx] - T.tx[idx] * off; this.h = Math.atan2(T.tx[idx], T.tz[idx]);
    this.vx = this.vz = this.vf = 0; this.steer = 0; this.idx = idx; this.slip = 0; this.drift = false;
    if (this.net) { this.net.x = this.x; this.net.z = this.z; this.net.h = this.h; this.net.vx = this.net.vz = 0; this.net.t = 0; }
    this.syncVisual(0.016);
  }

  get progress() { return (this.started ? this.lapsDone : -1) * 100000 + this.idx; }
  get kmh() { return Math.abs(this.vf) * 3.6; }

  update(dt, T, fx, time) {
    if (this.inactive) return;
    if (this.remote) return this.updateRemote(dt, T);
    if (this.shield > 0) this.shield -= dt; if (this.fireCd > 0) this.fireCd -= dt;
    if (this.eliminated) { this.vx *= 1 - 3 * dt; this.vz *= 1 - 3 * dt; this.x += this.vx * dt; this.z += this.vz * dt; this.vf *= 1 - 3 * dt; return; }
    const st = this.st, flying = this.airT > 0, inp = this.frozen || this.crashT > 0 ? { steer: 0, gas: 0, brake: this.crashT > 0 ? 1 : 0, hand: false, nitro: false } : flying ? AIRBORNE : inp_(this.input);
    this.safeT -= dt;
    const sr = (this.isBike ? 4.2 : 5.2) * dt; this.steer += clamp(inp.steer - this.steer, -sr, sr);
    let fx_ = Math.sin(this.h), fz = Math.cos(this.h);
    let vf = this.vx * fx_ + this.vz * fz, vl = this.vx * fz - this.vz * fx_;
    if (this.padT > 0) this.padT -= dt;
    this.boosting = (inp.nitro && this.nitro > 0.02 && vf > 4) || (this.padT > 0 && vf > 2);
    const top = st.top * (this.boosting ? 1.2 : 1) * (this.draft ? 1.04 : 1) * (this.boatForm ? 0.8 : 1), acc = st.acc * (this.boosting ? 1.0 + 0.9 * st.nitro : 1);
    if (inp.gas > 0 && vf < top) { const r = Math.max(0, vf / top); vf += acc * inp.gas * Math.max(0.12, 1 - r * r) * dt; }
    if (inp.brake > 0) { if (vf > 0.5) vf -= 42 * inp.brake * dt; else if (!this.crashT) vf = Math.max(-13, vf - 10 * inp.brake * dt); else vf = 0; }
    if (!inp.gas && !inp.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (2 + Math.abs(vf) * 0.06) * dt);
    if (vf > top) vf -= (vf - top) * 1.6 * dt;
    if (inp.hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt);
    const sp = Math.abs(vf);
    const yawMax = Math.min(2.5, sp * 0.42, st.grip * (inp.hand ? 1.4 : 1) / Math.max(sp, 5));
    this.h += this.steer * yawMax * (vf >= 0 ? 1 : -1) * dt;
    this.drift = (inp.hand && sp > 10) || (this.drift && Math.abs(vl) > 2.5 && sp > 9);
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h);
    const wx = fx_ * vf + fz * vl, wz = fz * vf - fx_ * vl;
    vf = wx * nfx + wz * nfz; vl = wx * nfz - wz * nfx;
    const soft = this.isBoat || this.boatForm ? 4.2 : this.air ? 6.5 : 0;
    vl *= Math.exp(-(flying ? 0.2 : this.drift ? (this.isBike ? 3.4 : 2.6) : soft || (this.isBike ? 11 : 9)) * dt);
    this.slip = Math.abs(vl); this.vf = vf; if (vf > this.topSpeed) this.topSpeed = vf;
    this.vx = nfx * vf + nfz * vl; this.vz = nfz * vf - nfx * vl;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // nitro economy
    if (this.boosting && this.padT <= 0) this.nitro = Math.max(0, this.nitro - 0.26 * dt);
    else this.nitro = Math.min(1, this.nitro + (0.022 + (this.drift ? 0.13 : 0) + (this.draft ? 0.06 : 0)) * dt);

    // walls
    const prev = this.idx, im = nearestIdx(T, this.x, this.z, this.idx), d = lateral(T, im, this.x, this.z), lim = T.half - this.halfW;
    // the shortcut is a second corridor: a car may be on the main road, on the shortcut, or in the gap joining them
    const cp = this.useElev && !this.air ? cutPos(T, this.x, this.z, this.idx) : null, cut = T.cut, inMain = Math.abs(d) <= lim, inCut = !!cp && cp.d <= cut.half - this.halfW;
    this.onCut = inCut && !inMain && cp.j > 0 && cp.j < cut.n;
    this.idx = this.onCut ? Math.round(cut.a + cp.j / cut.n * (cut.b - cut.a)) : im;
    const i = this.idx;
    if (!inMain && inCut) { /* inside the shortcut corridor: no main-road walls */ }
    else if (!inMain && cp && cp.d - (cut.half - this.halfW) < Math.abs(d) - lim) {   // bounce off the shortcut's barriers
      const side = Math.sign((this.x - cut.x[cp.j]) * cut.tz - (this.z - cut.z[cp.j]) * cut.tx) || 1, nx = cut.tz * side, nz = -cut.tx * side, pen = cp.d - (cut.half - this.halfW);
      this.x -= nx * pen; this.z -= nz * pen; const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) { this.vx -= nx * vn * 1.25; this.vz -= nz * vn * 1.25; const k = 1 - Math.min(0.45, vn * 0.028); this.vx *= k; this.vz *= k; if (vn > 3) { this.impact = Math.max(this.impact, vn); if (fx) fx.spark(this.x + nx * this.halfW, 0.5, this.z + nz * this.halfW, this.vx, this.vz); } if (this.isBike && vn > 13 && this.safeT <= 0) this.crash(); }
    }
    else if (Math.abs(d) > lim) {
      const s = Math.sign(d), nx = T.tz[im] * s, nz = -T.tx[im] * s, pen = Math.abs(d) - lim;
      this.x -= nx * pen; this.z -= nz * pen;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= nx * vn * 1.25; this.vz -= nz * vn * 1.25;
        const k = this.air ? 0.985 : 1 - Math.min(0.45, vn * 0.028); this.vx *= k; this.vz *= k;
        const dir = (Math.sin(this.h) * T.tx[im] + Math.cos(this.h) * T.tz[im]) >= 0 ? 0 : Math.PI;
        this.h += clamp(wrap(Math.atan2(T.tx[im], T.tz[im]) + dir - this.h), -1, 1) * Math.min(0.8, vn * 0.05);
        if (this.air) this.offCourse = 1.2; else if (vn > 3) { this.impact = Math.max(this.impact, vn); if (fx) fx.spark(this.x + nx * this.halfW, 0.5 + this.ey, this.z + nz * this.halfW, this.vx, this.vz); }
        if (this.isBike && !this.boatForm && vn > 13 && this.safeT <= 0) this.crash();
      }
    }
    // road height (flyovers, bridges) and boost pads
    this.eyT = this.useElev && !this.onCut ? elevAt(T, i) : 0;
    if (this.useElev && T.pads && !flying) for (const pd of T.pads) { const di = i - pd.i; if (di >= -2 && di <= 2 && Math.abs(d - pd.off) < 2.4 && this.padT <= 0.6) { this.padT = 1.4; this.padHit = true; } }
    // stunt ramps: take off, spin with steering, flip with brake, land straight or wreck
    if (this.canJump && T.ramps && !flying && !this.boatForm && vf > 15) for (const rp of T.ramps) { const di = (i - rp.i + T.N) % T.N; if (di <= 3 && Math.abs(d - rp.off) < rp.w) { this.airT = 0.001; this.vy = clamp(4.5 + vf * 0.13, 6.5, 12.5); this.y = 0.4; this.trickYaw = this.trickFlip = 0; } }
    if (this.airT > 0) {
      this.airT += dt; this.vy -= 22 * dt; this.y += this.vy * dt;
      if (!this.ai && !this.frozen) { this.trickYaw += this.input.steer * 6.5 * dt; if (this.input.brake > 0.3) this.trickFlip -= 5.5 * dt; if (this.input.hand) this.trickFlip += 5.5 * dt; }
      if (this.y <= 0 && this.vy < 0) {
        this.y = 0; this.airT = 0; this.vy = 0; const bad = Math.abs(wrap(this.trickYaw)) > 0.95 || Math.abs(wrap(this.trickFlip)) > 0.95;
        const n = Math.round(Math.abs(this.trickYaw) / (Math.PI * 2)) + Math.round(Math.abs(this.trickFlip) / (Math.PI * 2)); this.trickYaw = this.trickFlip = 0;
        if (bad) { this.hp = Math.max(1, this.hp - 30); this.crash(); this.landed = 'bad'; } else { this.impact = Math.max(this.impact, 4); if (n > 0) { this.tricks += n; this.nitro = Math.min(1, this.nitro + 0.3 * n); this.landed = n; } }
      }
    }
    // free flight: climb and dive
    if (this.air && !this.frozen && this.crashT <= 0) { const tv = clamp(this.input.climb || 0, -1, 1) * 17; this.vy += (tv - this.vy) * Math.min(1, 4 * dt); this.y = clamp(this.y + this.vy * dt, 0, 36); if (this.y <= 0 && this.vy < 0 || this.y >= 36 && this.vy > 0) this.vy = 0; }
    if (this.offCourse > 0) this.offCourse -= dt;
    this.checkForm(T, fx);
    // laps
    const N = T.N;
    if (prev > N * 0.75 && i < N * 0.25) {
      if (!this.started) this.started = true; else { this.lapsDone++; const lt = time - this.lapStart; if (!this.bestLap || lt < this.bestLap) this.bestLap = lt; this.lastLap = lt; }
      this.lapStart = time;
    } else if (prev < N * 0.25 && i > N * 0.75) { if (this.lapsDone > 0) this.lapsDone--; else this.started = false; }
    const along = Math.sin(this.h) * T.tx[i] + Math.cos(this.h) * T.tz[i];
    this.wrongT = (!this.onCut && along < -0.3 && vf > 4) ? this.wrongT + dt : 0;
    this.stuckT = (!this.frozen && sp < 1.5 && (this.input.gas > 0.3)) ? this.stuckT + dt : 0;
    // effects
    if (fx && !this.frozen) {
      if ((this.drift || this.slip > 5) && sp > 8 && Math.random() < 0.6) fx.smoke(this.x - nfx * this.len, 0.25 + this.ey, this.z - nfz * this.len, this.vx, this.vz);
      if ((this.isBoat || this.boatForm) && sp > 6 && Math.random() < 0.7) fx.smokeP.emit(this.x - nfx * this.len, 0.2, this.z - nfz * this.len, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 3, 0.6, 0.6, 0.95, 0.98, 1, 0.5, 2.2, 6);
      if (this.boosting) fx.flame(this.x - nfx * (this.len + 1.0), (this.isBike ? 0.55 : 0.4) + this.alt + this.y + this.ey, this.z - nfz * (this.len + 1.0), this.vx * 0.8, this.vz * 0.8);
    }
    if (this.crashT > 0) { this.crashT -= dt; if (this.crashT <= 0) this.recover(T); }
  }

  // Lose health; at zero the vehicle is wrecked for a moment and then respawns.
  damage(amt, fx) {
    if (this.shield > 0 || this.safeT > 0 || this.crashT > 0 || this.eliminated || this.inactive) return false;
    this.hp -= amt;
    if (this.hp <= 0) { this.hp = 0; this.wrecked = (this.wrecked || 0) + 1; if (fx) { fx.burst(this.x, 1, this.z, 1, 0.5, 0.15); fx.burst(this.x, 1.5, this.z, 1, 0.85, 0.3); } this.crash(); return true; }
    return false;
  }
  // relay stages: part of the lap is water, where road vehicles turn into speedboats
  checkForm(T, fx) {
    if (!this.relay || !T.water) return; const w = T.water, on = this.idx >= w[0] && this.idx < w[1];
    if (on === this.boatForm) return; this.boatForm = on;
    if (on && !this.boat) { this.boat = makeVehicle('marlin', this.color); this.tilt.add(this.boat.root); }
    if (this.boat) this.boat.root.visible = on; this.model.root.visible = !on; if (this.seat) this.seat.visible = !on;
    if (fx) for (let k = 0; k < 10; k++) fx.smokeP.emit(this.x, 0.4, this.z, (Math.random() - 0.5) * 8, 3 + Math.random() * 4, (Math.random() - 0.5) * 8, 0.8, 0.8, 0.9, 0.97, 1, 0.6, 2.5, 8);
    this.formChanged = on ? 'boat' : 'road';
  }
  crash() {
    if (this.crashT > 0) return;
    this.crashT = 2.3; this.airT = 0; this.y = 0; this.trickYaw = this.trickFlip = 0; if (!this.isBike || this.boatForm) { this.spin = (Math.random() < 0.5 ? -1 : 1) * 9; return; }
    const r = this.rider.root;
    this.scene.attach(r); // keep world transform, leave the bike
    this.riderOff = { vx: this.vx * 0.55, vy: 5.5, vz: this.vz * 0.55, spin: (Math.random() - 0.5) * 8 };
    this.rider.play('Die', 0.1, true);
  }
  recover(T) {
    this.crashT = 0; this.safeT = 2.5; this.hp = 100; this.spin = 0; this.place(T, this.idx, clamp(lateral(T, this.idx, this.x, this.z), -T.half + 2, T.half - 2));
    if (this.riderOff) { this.seat.add(this.rider.root); this.riderOff = null; this.rider.play('Drive', 0); this.poseRider(); }
  }
  reset(T) { if (this.crashT > 0) return; this.safeT = 2; this.place(T, this.idx, 0); }

  // ---- network replicas: dead-reckon towards the last received state
  setNet(s, now) { this.net = { x: s[1], z: s[2], h: s[3], vx: s[4], vz: s[5], t: now }; this.steer = s[6]; const f = s[7]; this.boosting = !!(f & 1); this.drift = !!(f & 2); const cr = !!(f & 4); if (cr && !this.crashT) this.crash(); if (!cr && this.crashT) { this.crashT = 0; this.recoverRemote(); } if (cr) this.crashT = 1; this.started = !!(f & 8); this.inactive = !!(f & 16); this.shield = (f & 32) ? 1 : 0; if (s[12] != null) this.hp = s[12]; this.ny = s[13] || 0; this.idx = s[8]; this.lapsDone = s[9]; this.nitro = s[10]; this.score = s[11] ?? this.score; }
  recoverRemote() { this.spin = 0; if (this.riderOff) { this.seat.add(this.rider.root); this.riderOff = null; this.rider.play('Drive', 0); this.poseRider(); } }
  updateRemote(dt, T) {
    const n = this.net; if (!n) return;
    n.t += dt; const age = Math.min(n.t, 0.5), px = n.x + n.vx * age, pz = n.z + n.vz * age, k = 1 - Math.exp(-14 * dt);
    this.x += (px - this.x) * k; this.z += (pz - this.z) * k; this.h += wrap(n.h - this.h) * k;
    this.y += ((this.ny || 0) - this.y) * k; this.checkForm(T, null);
    this.vx = n.vx; this.vz = n.vz; this.vf = n.vx * Math.sin(this.h) + n.vz * Math.cos(this.h); this.slip = this.drift ? 6 : 0;
  }
  netState() { return [this.id, +this.x.toFixed(2), +this.z.toFixed(2), +this.h.toFixed(3), +this.vx.toFixed(2), +this.vz.toFixed(2), +this.steer.toFixed(2), (this.boosting ? 1 : 0) | (this.drift ? 2 : 0) | (this.crashT > 0 ? 4 : 0) | (this.started ? 8 : 0) | (this.inactive ? 16 : 0) | (this.shield > 0 ? 32 : 0), this.idx, this.lapsDone, +this.nitro.toFixed(2), this.score, Math.round(this.hp), +this.y.toFixed(2)]; }

  syncVisual(dt) {
    const m = this.model, vf = this.vf, sp = Math.abs(vf);
    this.root.visible = !this.inactive && !this.eliminated; if (this.inactive) return;
    if (this.brakeMat) this.brakeMat.opacity = this.input.brake > 0.1 && !this.remote ? 0.95 : 0.25;
    if (this.bar) { const t = performance.now() / 140; this.bar[0].material.opacity = Math.sin(t) > 0 ? 1 : 0.08; this.bar[1].material.opacity = Math.sin(t) > 0 ? 0.08 : 1; }
    const bob = this.air ? Math.sin(performance.now() / 600 + (this.phase || (this.phase = Math.random() * 6))) * 0.18 * Math.max(0, 1 - sp / 12) : (this.isBoat || this.boatForm) ? Math.sin(performance.now() / 260 + this.z) * 0.07 - 0.12 : 0;
    const ke = Math.min(1, 12 * dt); this.ey += (this.eyT - this.ey) * ke;
    if (this.useElev) { const T = this.track, sl = T && T.elev ? (elevAt(T, this.idx + 2) - elevAt(T, this.idx - 2)) / (4 * T.step) : 0, al = T ? Math.sign(Math.sin(this.h) * T.tx[this.idx] + Math.cos(this.h) * T.tz[this.idx]) || 1 : 1; this.pitch += (-Math.atan(sl) * al - this.pitch) * ke; this.root.rotation.order = 'YXZ'; this.root.rotation.x = this.pitch; }
    this.root.position.set(this.x, this.alt + this.y + bob + this.ey, this.z); if (this.shadow && this.air) this.shadow.position.y = 0.045 - this.alt - this.y; if (this.shadow && !this.air) this.shadow.position.y = 0.045 - this.y;
    const slide = clamp((this.vx * Math.cos(this.h) - this.vz * Math.sin(this.h)) * 0.02, -0.35, 0.35);
    if (this.spin && this.crashT > 0) { this.spinA = (this.spinA || 0) + this.spin * dt; this.spin *= Math.exp(-1.6 * dt); } else this.spinA = 0;
    this.root.rotation.y = this.h - slide * (this.isBike ? 0.4 : 1) + this.spinA + this.trickYaw;
    const k = 1 - Math.exp(-10 * dt), g = Math.min(1, sp / 22);
    if (this.isBike) {
      const lean = this.crashT > 0 ? 1.35 : -this.steer * g * 0.62;
      this.tilt.rotation.z += (lean - this.tilt.rotation.z) * k;
      const wheelie = this.boosting && sp > 12 ? -0.2 : 0; this.tilt.rotation.x += (wheelie - this.tilt.rotation.x) * k * 0.6;
      this.tilt.position.y = this.crashT > 0 ? 0.25 : -this.tilt.rotation.x * 1.2;
      if (m.forkPivot) m.forkPivot.userData.inner.rotation.y = this.steer * 0.32 * (1 - g * 0.6);
    } else if (this.air || this.isBoat || this.boatForm) {
      this.tilt.rotation.z += (-this.steer * g * (this.air ? (this.kind === 'heli' ? 0.4 : 0.75) : 0.2) - this.tilt.rotation.z) * k * 0.6;
      const climbP = this.air ? -clamp(this.vy * 0.022, -0.35, 0.35) : 0;
      const pitch = climbP + (this.kind === 'heli' ? (this.input.gas > 0 ? 0.16 : 0) - (this.input.brake > 0 ? 0.14 : 0) : (this.isBoat || this.boatForm) ? -Math.min(0.1, sp * 0.002) : 0);
      this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * k * 0.5;
    } else {
      this.tilt.rotation.z += (this.steer * g * 0.055 - this.tilt.rotation.z) * k;
      const pitch = (this.boosting ? -0.035 : 0) + (this.input.brake > 0 && sp > 5 ? 0.03 : 0) - (this.input.gas > 0 ? 0.012 : 0);
      this.tilt.rotation.x += (pitch - this.tilt.rotation.x) * k;
    }
    if (this.trickFlip) this.tilt.rotation.x = this.trickFlip;
    for (const sp2 of m.spinners) sp2.m.rotation[sp2.axis] += (this.kind === 'boat' ? sp : 38) * dt;
    for (const w of m.wheels) {
      w.spin.rotation.x += vf * dt / Math.max(0.2, w.radius) * w.flip;
      if (w.front && !this.isBike) { qY.setFromAxisAngle(UP, this.steer * 0.42); w.pivot.quaternion.copy(w.baseQuat).multiply(qY); }
    }
    if (this.rider) {
      if (this.riderOff) { // tumbling rider: ballistic + bounce + slide
        const r = this.rider.root, o = this.riderOff; o.vy -= 20 * dt;
        r.position.x += o.vx * dt; r.position.y += o.vy * dt; r.position.z += o.vz * dt;
        if (r.position.y < 0.05) { r.position.y = 0.05; o.vy = Math.abs(o.vy) > 2 ? -o.vy * 0.35 : 0; o.vx *= 0.8; o.vz *= 0.8; o.spin *= 0.5; }
        const fr = Math.exp(-1.2 * dt); o.vx *= fr; o.vz *= fr; r.rotation.y += o.spin * dt; this.rider.mixer.update(dt);
      } else { // lean the upper body into corners
        const b = this.riderBones; if (b.spine_02) b.spine_02.rotation.z = this.steer * g * 0.25;
      }
    }
  }

  dispose() {
    this.scene.remove(this.root); this.model.paint.dispose();
    if (this.rider) { if (this.riderOff) this.scene.remove(this.rider.root); this.rider.dispose(); }
    if (this.label) { this.label.material.map.dispose(); this.label.material.dispose(); }
  }
}
function inp_(i) { return i; }
const AIRBORNE = { steer: 0, gas: 0, brake: 0, hand: false, nitro: false };

// Circle-pair collision between two vehicles. Only non-remote vehicles get pushed.
export function collide(a, b, fx) {
  if (a.eliminated || b.eliminated || a.inactive || b.inactive || a.crashT > 0 || b.crashT > 0) return 0;
  const dx0 = b.x - a.x, dz0 = b.z - a.z; if (dx0 * dx0 + dz0 * dz0 > 36 || Math.abs(a.y - b.y) > 2.8) return 0;
  let hit = 0;
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const ax = a.x + Math.sin(a.h) * a.len * sa, az = a.z + Math.cos(a.h) * a.len * sa, bx = b.x + Math.sin(b.h) * b.len * sb, bz = b.z + Math.cos(b.h) * b.len * sb;
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), min = a.rad + b.rad;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, pen = min - d, rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    const ma = a.remote ? 0 : (a.isBike ? 0.7 : 0.5), mb = b.remote ? 0 : (b.isBike ? 0.7 : 0.5), tot = (ma + mb) || 1;
    a.x -= nx * pen * ma / tot; a.z -= nz * pen * ma / tot; b.x += nx * pen * mb / tot; b.z += nz * pen * mb / tot;
    if (rv < 0) {
      const j = -rv * 0.75;
      if (!a.remote) { a.vx -= nx * j * (b.remote ? 1 : 0.5); a.vz -= nz * j * (b.remote ? 1 : 0.5); }
      if (!b.remote) { b.vx += nx * j * (a.remote ? 1 : 0.5); b.vz += nz * j * (a.remote ? 1 : 0.5); }
      hit = Math.max(hit, -rv); a.lastHit = b; b.lastHit = a;
      if (-rv > 6 && a.ramDamage && b.ramDamage) { const sa = Math.hypot(a.vx, a.vz), sb = Math.hypot(b.vx, b.vz), tot = sa + sb + 1e-3, k = a.ramDamage * -rv * 2.2; if (!a.remote && a.damage(k * sb / tot, fx)) a.wreckedBy = b; if (!b.remote && b.damage(k * sa / tot, fx)) b.wreckedBy = a; }
      if (-rv > 4 && fx) fx.spark((ax + bx) / 2, 0.6, (az + bz) / 2, a.vx, a.vz);
      for (const v of [a, b]) if (v.isBike && -rv > 12 && !v.remote && v.safeT <= 0) v.crash();
    }
  }
  if (hit > 0) { a.impact = Math.max(a.impact, hit); b.impact = Math.max(b.impact, hit); }
  return hit;
}
