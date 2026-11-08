// Match-day extras: officials, medical team + buggy + stretcher, coaches, warm-up subs, 4th-official board,
// waving flags, tifo, Mexican wave, flares/smoke and fireworks, pre-match line-up ceremony.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PITCH } from './sim.js';
const { HL, HW } = PITCH;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

export class Extras {
  constructor(R) {
    this.R = R; this.scene = R.scene; this.people = []; this.objs = [];
    this.buildFlags();
    this.waveT = -1;
  }

  // --------------------------------------------------------------- generic person from the player models
  person(variant, colors, x, z, face) {
    const R = this.R;
    const src = variant === 'keeper' ? R.models.keeper : R.models.outfield[variant % R.models.outfield.length];
    const root = SkeletonUtils.clone(src.scene);
    root.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nm = mats.map(m => { const c = m.clone(), n = m.name || '';
        if (/shirt|sleeve|HighLimbs|Beta_Surface/i.test(n)) c.color.set(colors.shirt);
        else if (/short|Joints/i.test(n)) c.color.set(colors.shorts);
        else if (/sock/i.test(n)) c.color.set(colors.socks);
        else if (/glove/i.test(n)) c.color.set(colors.shirt);
        return c; });
      o.material = Array.isArray(o.material) ? nm : nm[0];
    });
    if (!R.realistic) { const h = R.modelHeight(src); root.scale.setScalar(1.8 / h.h); root.position.y = -h.minY * 1.8 / h.h; }
    const holder = new THREE.Group(); holder.add(root); holder.position.set(x, 0, z); holder.rotation.y = face || 0;
    this.scene.add(holder);
    const mixer = new THREE.AnimationMixer(root), actions = {};
    for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
    const ch = { holder, root, mixer, actions, current: null, logical: null };
    this.people.push(ch);
    return ch;
  }
  play(ch, name, speed = 1) { this.R.play(ch, name, speed); }

  // --------------------------------------------------------------- build for a match
  build(match, kits) {
    this.clear();
    this.match = match;
    const black = { shirt: '#151515', shorts: '#151515', socks: '#151515' };
    const refKit = [kits[0].shirt, kits[1].shirt].some(c => isDark(c)) ? { shirt: '#f5d90a', shorts: '#151515', socks: '#151515' } : black;
    this.officials = match.officials.map((o, i) => this.person(i % 4, refKit, o.x, o.z, o.face));
    // assistant referee flags
    this.arFlags = [1, 2].map(i => { const f = flagMesh(i === 1 ? '#ff3b30' : '#ffd400'); this.officials[i].holder.add(f); f.position.set(0.35, 1.0, 0.1); return f; });
    // 4th official LED board
    this.boardCanvas = document.createElement('canvas'); this.boardCanvas.width = 256; this.boardCanvas.height = 128;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas); this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: this.boardTex, side: THREE.DoubleSide }));
    this.board.position.set(0, 2.25, 0.3); this.board.visible = false; this.officials[3].holder.add(this.board);
    // coaches in the technical areas (team 0 left dugout, team 1 right)
    const suit = c => ({ shirt: c, shorts: '#111827', socks: '#111827' });
    this.coaches = [0, 1].map(t => this.person(t ? 2 : 1, suit(t === 0 ? '#1f2937' : '#27272a'), (t === 0 ? -12 : 12) * (match.dir(0) > 0 ? 1 : 1), -HW - 3.4, 0));
    // the two commentators in the booth above the main stand (lead + co-commentator)
    this.casters = [];
    const bp = this.R.boothPos;
    if (bp) for (let i = 0; i < 2; i++) {
      const ch = this.person(i ? 9 : 4, { shirt: i ? '#1d2a46' : '#2a2a30', shorts: '#15171d', socks: '#15171d' }, bp.x + (i ? 2.0 : -2.0), bp.z + 0.15, 0);
      ch.holder.position.y = bp.y - 1.55; ch.bones = {}; ch.root.traverse(o => { if (o.isBone) ch.bones[o.name] = o; }); this.casters.push(ch);
    }
    // warm-up substitutes in bibs
    const bib = t => ({ shirt: t === 0 ? '#ff8a00' : '#9dff00', shorts: kits[t].shorts, socks: kits[t].socks });
    this.warm = [];
    for (let t = 0; t < 2; t++) for (let i = 0; i < 2; i++) { const ch = this.person((t * 2 + i) % 4, bib(t), (t ? 1 : -1) * (32 + i * 3), -HW - 2.6, Math.PI / 2); ch.dir = i ? 1 : -1; ch.base = (t ? 1 : -1) * (36 + i * 2); this.warm.push(ch); }
    // medical team + buggy (hidden until needed)
    const medic = { shirt: '#f1f5f9', shorts: '#16a34a', socks: '#f1f5f9' };
    this.medics = [this.person(3, medic, -13, -HW - 6, 0), this.person(0, medic, -12, -HW - 6, 0)];
    this.medics.forEach(m => m.holder.visible = false);
    this.buggy = buggyMesh(); this.buggy.visible = false; this.scene.add(this.buggy); this.objs.push(this.buggy);
    this.flagsGroup.visible = true;
    this.colorFlags(kits[0].shirt, kits[1].shirt, kits[0].shorts, kits[1].shorts);
  }
  clear() {
    for (const p of this.people) { this.scene.remove(p.holder); p.mixer.stopAllAction(); }
    for (const o of this.objs) this.scene.remove(o);
    this.people = []; this.objs = []; this.officials = null; this.match = null;
  }

  // --------------------------------------------------------------- waving flags in the stands
  buildFlags() {
    const N = 160;
    const geo = new THREE.PlaneGeometry(1.1, 0.7, 8, 2); geo.translate(0.55, 0, 0);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    this.flagUniforms = { uTime: { value: 0 }, uWave: { value: 1 } };
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) phase[i] = Math.random() * 6.28;
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.flagUniforms);
      sh.vertexShader = 'uniform float uTime; uniform float uWave; attribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float k = position.x / 1.1;
         transformed.z += sin(uTime * 7.0 + aPhase + position.x * 4.0) * 0.18 * k * uWave;
         transformed.y += sin(uTime * 3.0 + aPhase) * 0.25 * uWave;`);
    };
    const im = new THREE.InstancedMesh(geo, mat, N);
    const pos = this.R.crowdPositions || [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    this.flagSpots = [];
    for (let i = 0; i < N; i++) {
      const p = pos[Math.floor(Math.random() * pos.length)] || new THREE.Vector3(rand(-50, 50), 5, -HW - 12);
      const yaw = Math.atan2(-p.x, -p.z) + Math.PI / 2;
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m4.compose(new THREE.Vector3(p.x, p.y + 1.3, p.z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4); this.flagSpots.push(p);
    }
    im.instanceMatrix.needsUpdate = true;
    this.flags = im; this.flagsGroup = new THREE.Group(); this.flagsGroup.add(im); this.scene.add(this.flagsGroup);
    this.flagsGroup.visible = false;
  }
  rebuildFlags() { if (this.flagsGroup) this.scene.remove(this.flagsGroup); this.buildFlags(); }
  colorFlags(c0, c1, s0, s1) {
    const col = new THREE.Color();
    this.flagSpots.forEach((p, i) => { const home = p.x < 25; col.set(Math.random() < 0.7 ? (home ? c0 : c1) : (home ? s0 : s1)); this.flags.setColorAt(i, col); });
    this.flags.instanceColor.needsUpdate = true;
  }

  // --------------------------------------------------------------- tifo: the end stands show each team's flag
  tifo(on, kits, teams) {
    const R = this.R, col = new THREE.Color();
    if (!on) { R.colorCrowd(kits[0].shirt, kits[1].shirt); return; }
    const flagColors = t => (t.flag && t.flag.length ? t.flag : [t.colors.shirt, t.colors.shorts, t.colors.socks]);
    R.crowdPositions.forEach((p, i) => {
      if (Math.abs(p.x) > HL + 5) {
        const fc = flagColors(teams[p.x < 0 ? 0 : 1]);
        // vertical tricolour bands across the end stand
        const u = clamp((p.z + HW + 10) / (2 * HW + 20), 0, 0.999);
        col.set(fc[Math.floor(u * fc.length)]);
      } else if (Math.abs(p.z) > HW + 5) {
        const fc = flagColors(teams[p.x < 0 ? 0 : 1]);
        const v = clamp((p.y - 1) / 14, 0, 0.999);
        col.set(fc[Math.floor(v * fc.length)]);
        if (Math.random() < 0.15) col.set('#ffffff');
      } else return;
      R.crowdBody.setColorAt(i, col);
    });
    R.crowdBody.instanceColor.needsUpdate = true;
  }

  // --------------------------------------------------------------- effects
  mexicanWave() { this.waveT = 0; }
  flares(team, kits) {
    const R = this.R, side = this.match ? -this.match.dir(team) : (team ? 1 : -1);
    for (let k = 0; k < 6; k++) {
      const x = side * (HL + rand(8, 18)), z = rand(-25, 25), y = rand(3, 12);
      R.emit(x, y, z, 26, { colors: [kits[team].shirt, '#ff3b1f', '#ffb347'], speed: 1.2, up: 1.6, life: 4.5, size: 0.9, smoke: true });
    }
  }
  fireworks(colors, n = 10) {
    const R = this.R;
    for (let k = 0; k < n; k++) setTimeout(() => {
      const x = rand(-60, 60), z = rand(-50, 40), y = rand(32, 48);
      R.emit(x, y, z, 80, { colors, speed: 11, up: 0.6, life: 1.8, size: 0.32, gravity: 2.5 });
      Sound.kick && Sound.kick(1);
    }, k * 380 + Math.random() * 200);
  }

  // --------------------------------------------------------------- per-frame sync
  sync(match, dt) {
    if (!this.officials) return;
    this.flagUniforms.uTime.value += dt;
    // officials
    match.officials.forEach((o, i) => {
      const ch = this.officials[i];
      ch.holder.position.set(o.x, 0, o.z); ch.holder.rotation.y = o.face;
      const anim = o.anim === 'Card' ? 'ThrowIn' : o.anim === 'Flag' ? 'Idle' : o.anim === 'Board' ? 'Idle' : o.anim;
      this.play(ch, anim, anim === 'Run' ? 1.0 : anim === 'Jog' ? 0.9 : 1);
      ch.mixer.update(dt);
    });
    // assistant flags raised for offside
    this.arFlags.forEach((f, i) => { const up = match.officials[i + 1].flag > 0; f.position.y = lerp(f.position.y, up ? 2.15 : 1.0, Math.min(1, dt * 10)); f.rotation.z = up ? Math.sin(performance.now() / 120) * 0.25 : 0; });
    // 4th official board
    const f = match.officials[3];
    this.board.visible = f.board > 0;
    if (f.board > 0 && f.boardKey !== `${f.boardIn}-${match.addedMinutes()}-${!!f.boardOut}`) {
      f.boardKey = `${f.boardIn}-${match.addedMinutes()}-${!!f.boardOut}`;
      const g = this.boardCanvas.getContext('2d'); g.fillStyle = '#05070a'; g.fillRect(0, 0, 256, 128);
      g.font = 'bold 72px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (f.boardOut) { g.fillStyle = '#ff3b30'; g.fillText(String(f.boardOut), 64, 66); g.fillStyle = '#34ff6a'; g.fillText(String(f.boardIn), 192, 66); }
      else { g.fillStyle = '#34ff6a'; g.fillText('+' + match.addedMinutes(), 128, 66); }
      this.boardTex.needsUpdate = true;
      if (f.board < 0.1) f.boardOut = null;
    }
    if (f.board <= 0.05) f.boardOut = null;
    // coaches react to goals
    this.coaches.forEach((ch, t) => {
      const celebrating = match.phase === 'goal' && match.scorers.length && match.scorers[match.scorers.length - 1].team === t;
      this.play(ch, celebrating ? 'Celebrate' : 'Idle'); ch.mixer.update(dt);
      const target = match.ball; ch.holder.rotation.y = lerp(ch.holder.rotation.y, Math.atan2(target.x - ch.holder.position.x, target.z - ch.holder.position.z), Math.min(1, dt * 2));
    });
    // commentators: nod and gesture while their voice is playing, cheer on goals
    { const spk = (typeof Sound !== 'undefined' && Sound.speaker) ? Sound.speaker() : null, tt = performance.now() / 1000, celeb = match.phase === 'goal';
      this.casters.forEach((ch, i) => {
        this.play(ch, celeb ? 'Celebrate' : 'Idle'); ch.mixer.update(dt);
        const act = (i === 0 && spk === 'lead') || (i === 1 && spk === 'co'); ch.talk = lerp(ch.talk || 0, act ? 1 : 0, Math.min(1, dt * 6));
        const a = ch.talk, B = ch.bones; if (celeb || !B) return;
        const idle = 0.06 + a * 0.2;
        if (B.head) { B.head.rotation.x += Math.sin(tt * 9 + i) * 0.05 * a; B.head.rotation.y += Math.sin(tt * 2.6 + i * 2) * idle; }
        if (B.neck_01) B.neck_01.rotation.y += Math.sin(tt * 2.6 + i * 2) * idle * 0.4;
        if (B.lowerarm_r) { B.lowerarm_r.rotation.z += (Math.sin(tt * 4.4 + i) * 0.45 - 0.3) * a; B.lowerarm_r.rotation.x += Math.sin(tt * 3.1) * 0.3 * a; }
        if (B.upperarm_r) B.upperarm_r.rotation.z += -0.35 * a;
      }); }
    // warm-up substitutes jog up and down the touchline
    this.warm.forEach(ch => {
      ch.holder.position.x += ch.dir * dt * 2.2;
      if (Math.abs(ch.holder.position.x - ch.base) > 4) ch.dir *= -1;
      ch.holder.rotation.y = ch.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.play(ch, 'Jog', 0.6); ch.mixer.update(dt);
    });
    // medical team
    const I = match.injury;
    this.buggy.visible = !!I; this.medics.forEach(m => m.holder.visible = !!I);
    if (I) {
      this.buggy.position.set(I.buggy.x, 0, I.buggy.z); this.buggy.rotation.y = I.buggy.face;
      this.buggy.userData.stretcher.visible = I.stretcher;
      this.buggy.userData.light.material.emissiveIntensity = (Math.sin(performance.now() / 90) > 0) ? 3 : 0.2;
      I.medics.forEach((m, i) => { const ch = this.medics[i]; ch.holder.position.set(m.x, 0, m.z); ch.holder.rotation.y = m.face || 0; this.play(ch, I.carried ? 'Idle' : m.speed > 0.5 ? 'Run' : 'Idle'); ch.mixer.update(dt); if (I.carried) { ch.holder.position.y = 0.45; } else ch.holder.position.y = 0; });
    }
    // Mexican wave travelling around the stadium
    const U = this.R.crowdUniforms;
    if (this.waveT >= 0) { this.waveT += dt; U.uWaveAng.value = -Math.PI + this.waveT * 0.55; U.uWaveAmp.value = this.waveT < 1 ? this.waveT : this.waveT > 10.5 ? Math.max(0, 11.5 - this.waveT) : 1; if (this.waveT > 11.5) { this.waveT = -1; U.uWaveAmp.value = 0; } }
  }

  // --------------------------------------------------------------- pre-match line-up
  lineup(match) {
    const out = [];
    for (let t = 0; t < 2; t++) {
      const ps = match.active(t);
      ps.forEach((p, i) => { p.x = (t === 0 ? -1 : 1) * (1.6 + i * 0.95); p.z = -1; p.vx = p.vz = 0; p.face = 0; p.anim = 'Idle'; p.speed = 0; p.animOnce = null; out.push(p); });
    }
    const o = match.officials;
    o[0].x = 0; o[0].z = -1; o[1].x = -0.9; o[1].z = -1.6; o[2].x = 0.9; o[2].z = -1.6; [0, 1, 2].forEach(i => { o[i].face = 0; o[i].anim = 'Idle'; o[i].speed = 0; });
    return out;
  }
}

function isDark(hex) { const v = parseInt(hex.slice(1), 16); return (((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11) < 60; }
function flagMesh(color) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.24), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  cloth.position.set(0.16, 0.15, 0); g.add(stick, cloth); return g;
}
function buggyMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#e11d2e'; x.fillRect(48, 16, 32, 96); x.fillRect(16, 48, 96, 32);
  const crossTex = new THREE.CanvasTexture(c); crossTex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 3.0), [white, white, white, white, new THREE.MeshStandardMaterial({ map: crossTex }), new THREE.MeshStandardMaterial({ map: crossTex })]);
  body.position.y = 0.6; body.castShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.4), white); roof.position.set(0, 1.85, 0.7); g.add(roof);
  for (const [px, pz] of [[-0.55, 1.2], [0.55, 1.2], [-0.55, 1.2]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0), dark); post.position.set(px, 1.35, pz); g.add(post); }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5), dark); seat.position.set(0, 1.05, 0.6); g.add(seat);
  for (const [px, pz] of [[-0.7, 1.0], [0.7, 1.0], [-0.7, -1.0], [0.7, -1.0]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), dark); w.rotation.z = Math.PI / 2; w.position.set(px, 0.3, pz); g.add(w); }
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.15), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 })); light.position.set(0, 1.95, 0.7); g.add(light);
  const stretcher = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 2.0), new THREE.MeshStandardMaterial({ color: 0xff7a00 })); stretcher.position.set(0, 0.92, -0.6); stretcher.visible = false; g.add(stretcher);
  g.userData = { stretcher, light };
  return g;
}
