// One race session: vehicles, rules (sprint / elimination / orb rush), cameras, split-screen and net sync.
import * as THREE from 'three';
import { TRACKS, buildTrackData, lateral, nearestIdx } from './track.js';
import { buildWorld, rng } from './world.js';
import { Vehicle, collide } from './vehicle.js';
import { makeAI, aiDrive, safeSpeed, steerTo } from './ai.js';
import { FX } from './fx.js';
import { statsFor, save, kindOf } from './data.js';
import { Peds } from './peds.js';
import * as input from './input.js';
import * as audio from './audio.js';
import * as ui from './ui.js';
import { Combat, WEAPONS } from './combat.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const trackCache = {};
export const getTrack = id => trackCache[id] || (trackCache[id] = buildTrackData(TRACKS.find(t => t.id === id)));
const ELIM_FIRST = 35, ELIM_EVERY = 20, ORB_TIME = 90;

export class Race {
  // cfg: { track, laps, rule, entrants:[{id,name,veh,up,color,type:'local'|'ai'|'remote',device,skill,person}], demo, net, isHost, onEnd }
  constructor(game, cfg) {
    this.game = game; this.cfg = cfg; this.scene = game.scene; this.T = getTrack(cfg.track);
    { // flying classes get a wide-open course instead of the street corridor, marked by ring gates at different heights
      const k0 = kindOf((cfg.entrants.find(e => e.type !== 'cop' && e.type !== 'traffic') || cfg.entrants[0]).veh), open = { heli: 26, plane: 30, space: 36 }[k0];
      if (open) { this.T = { ...this.T, half: open, roadHalf: this.T.half }; const N = this.T.N, sd = (cfg.seed || 1) % 97; this.gates = []; for (let k = 1, i = 40; i < N - 20; i += 40, k++) this.gates.push({ i, off: Math.sin(k * 1.9 + sd) * open * 0.6, y: 3 + (Math.sin(k * 1.13 + sd * 0.7) + 1) * 10, r: 7 }); }
    }
    const T = this.T;
    this.kind = kindOf((cfg.entrants.find(e => e.type !== 'cop' && e.type !== 'traffic') || cfg.entrants[0]).veh); this.mode = { boat: 'water', heli: 'air', plane: 'air', space: 'space' }[this.kind] || 'road'; this.alt = { heli: 11, plane: 14, space: 1.3 }[this.kind] || 0;
    this.quality = game.quality; this.world = buildWorld(this.scene, game.renderer, T, this.quality, { mode: this.mode, alt: this.alt, relay: cfg.rule === 'relay', gates: this.gates });
    this.fx = new FX(this.scene, this.quality === 'low');
    this.rule = cfg.rule || 'sprint'; this.laps = cfg.laps || 3; this.net = cfg.net || null; this.isHost = !this.net || cfg.isHost;
    this.state = 'countdown'; this.count = cfg.demo ? 0.1 : 3.6; this.time = 0; this.lastBeep = 4; this.endT = 0; this.over = false; this.sendT = 0; this.bandT = 0; this.paused = false;
    this.elimAt = ELIM_FIRST; this.elimOrder = []; this.firstFinish = 0; this.frame = 0;
    this.vehicles = []; this.byId = {}; this.locals = [];
    let gridK = 0, copK = 0, trafK = 0; const nTraffic = cfg.entrants.filter(e => e.type === 'traffic').length;
    cfg.entrants.forEach((e) => {
      const npc = e.type === 'cop' || e.type === 'traffic', k = npc ? 0 : gridK++;
      const v = new Vehicle(this.scene, statsFor(e.veh, e.up), { id: e.id, name: e.name, color: e.color, night: this.world.theme.night, person: e.person ?? k, cop: e.type === 'cop', label: !cfg.demo && (e.type === 'remote' || e.type === 'ai'), labelColor: e.type === 'ai' ? '#cfd6e4' : '#ffe14a' });
      v.type = e.type; v.entrant = e; v.npc = npc; v.remote = e.type === 'remote' || (e.type !== 'local' && !this.isHost);
      if (e.type === 'ai') v.ai = makeAI(e.skill ?? 0.85, ((k % 3) - 1) * 2.4);
      v.canJump = v.canJump && this.mode === 'road'; v.relay = cfg.rule === 'relay' && !npc;
      if (e.type === 'cop') { v.ai = makeAI(1.0, 0); v.block = !!e.block; v.started = true; if (cfg.rule !== 'pursuit') v.inactive = true; if (e.block) { v.inactive = true; v.place(T, 0, 0); } else { v.place(T, T.N - 40 - copK * 6, (copK % 2 ? -1 : 1) * 3); copK++; } }
      else if (e.type === 'traffic') { const lanes = [-0.55, 0.5, -0.18, 0.2]; v.ai = makeAI(0.5, 0); v.ai.fixed = lanes[trafK % 4] * T.half; v.ai.cap = 17 + (trafK % 3) * 3; v.started = true; v.place(T, Math.floor((trafK + 1) * T.N / (nTraffic + 1.5)) + 30, v.ai.fixed); trafK++; }
      else v.place(T, T.N - 5 - Math.floor(k / 2) * 5, (k % 2 ? -1 : 1) * 3.3);
      this.vehicles.push(v); this.byId[e.id] = v;
      if (e.type === 'local') { v.device = e.device || 'kb'; v.auto = makeAI(0.8, 0); v.label && (v.label.visible = false); this.locals.push(v); }
    });
    // cameras / views
    this.views = [];
    const targets = this.locals.length ? this.locals : [this.vehicles[0]];
    targets.forEach((v, i) => {
      const cam = new THREE.PerspectiveCamera(66, 1, 0.3, 6500);
      this.views.push({ v, cam, camH: v.h + 1.2, mode: 0, fov: 66, shake: 0, pos: new THREE.Vector3(v.x, 4, v.z), spectate: null });
      this.updateCamera(this.views[i], 1, true);
    });
    // orbs
    if (this.rule === 'orbs') this.initOrbs();
    this.racers = this.vehicles.filter(v => !v.npc); this.cops = this.vehicles.filter(v => v.cop); this.blockT = 22; this.lapRule = ['sprint', 'combat', 'pursuit', 'trial', 'rush', 'relay'].includes(this.rule); this.heat = {};
    if (cfg.peds && this.mode === 'road') this.peds = new Peds(this, cfg.peds);
    if (this.rule === 'combat' || cfg.weapons) this.combat = new Combat(this);
    if (!cfg.demo) ui.hudLayout(this.views.length, T, this.rule); else ui.hudClear();
    if (this.net) this.bindNet();
    this.order = [...this.racers];
  }

  initOrbs() {
    const T = this.T, R = rng(cfg_seed(this.cfg)), n = Math.min(40, Math.floor(T.N / 26)); this.orbs = [];
    for (let k = 0; k < n; k++) { const i = Math.floor((k + 0.5) * T.N / n), off = (R() - 0.5) * 2 * (T.half - 2.8); this.orbs.push({ i, off, x: T.x[i] + T.tz[i] * off, z: T.z[i] - T.tx[i] * off, t: 0 }); }
    this.orbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 1), new THREE.MeshBasicMaterial({ color: 0x35f0ff, fog: false }), n);
    this.orbGlow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.15, 1), new THREE.MeshBasicMaterial({ color: 0x35f0ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }), n);
    this.orbMesh.frustumCulled = this.orbGlow.frustumCulled = false; this.scene.add(this.orbMesh, this.orbGlow); this.dummy = new THREE.Object3D();
  }
  takeOrb(k, v, fromNet) {
    const o = this.orbs[k]; if (!o || o.t > 0) return; o.t = 7; v.score++;
    if (!v.remote) v.nitro = Math.min(1, v.nitro + 0.3);
    this.fx.burst(o.x, 1.1, o.z, 0.2, 0.95, 1);
    if (v.type === 'local') audio.sfx('orb');
    if (this.net && !fromNet) this.net.send({ t: 'orb', k, id: v.id });
  }

  bindNet() {
    const n = this.net;
    this.handlers = {
      s: m => { for (const s of m.v) { const v = this.byId[s[0]]; if (v && v.remote) v.setNet(s, 0); } },
      fin: m => { const v = this.byId[m.id]; if (v && !v.finished) { v.finished = true; v.finishTime = m.time; if (!this.firstFinish) this.firstFinish = this.time; } },
      elim: m => { const v = this.byId[m.id]; if (v) { v.busted = m.busted; this.eliminate(v, true); } },
      orb: m => { const v = this.byId[m.id]; if (v) this.takeOrb(m.k, v, true); },
      go: () => { this.netGo = true; },
      end: m => { this.finish(m.results); },
      wanted: m => { const v = this.byId[m.id]; if (v) this.wanted(v, m.secs, true); },
      melee: m => { const o = this.byId[m.tid], by = this.byId[m.id]; if (o && by) this.applyMelee(o, by); },
      left: m => { const v = this.byId['p' + m.id]; if (v && !v.finished) { v.eliminated = true; v.left = true; v.syncVisual(0.016); } },
    };
    for (const k in this.handlers) n.on(k, this.handlers[k]);
    this.netGo = false;
    if (this.isHost) setTimeout(() => { if (!this.disposed) { n.send({ t: 'go' }); this.netGo = true; } }, 1800);
  }

  eliminate(v, fromNet) {
    if (v.eliminated || v.finished) return;
    v.eliminated = true; this.elimOrder.push(v); this.fx.burst(v.x, 1, v.z, 1, 0.4, 0.2); this.fx.burst(v.x, 1.4, v.z, 1, 0.9, 0.3);
    if (v.type === 'local') audio.sfx('out');
    if (this.net && (this.isHost || v.type === 'local') && !fromNet) this.net.send({ t: 'elim', id: v.id, busted: v.busted });
    ui.toast(v.name + (v.busted ? ' was BUSTED!' : ' is OUT!'));
  }

  ranking() {
    const sc = v => v.finished ? 3e9 - v.finishTime : v.eliminated ? -1e9 + this.elimOrder.indexOf(v) : this.rule === 'orbs' ? 1e6 + v.score * 1e4 + v.progress * 1e-3 : 1e6 + v.progress;
    return [...this.racers].sort((a, b) => sc(b) - sc(a));
  }

  update(dt) {
    if (this.paused && !this.net) return;
    this.frame++;
    const T = this.T, vs = this.vehicles;
    if (this.state === 'countdown') {
      if (!this.net || this.netGo) this.count -= dt;
      const c = Math.ceil(this.count);
      if (c < this.lastBeep && c > 0 && c <= 3 && !this.cfg.demo) { this.lastBeep = c; audio.sfx('beep'); }
      if (this.count <= 0) { this.state = 'racing'; for (const v of vs) { v.frozen = false; v.lapStart = 0; if (v.type === 'traffic' && !v.remote) { v.vx = Math.sin(v.h) * 16; v.vz = Math.cos(v.h) * 16; } } if (!this.cfg.demo) audio.sfx('go'); }
    } else if (!this.over) this.time += dt;

    // --- controls
    for (const v of vs) {
      if (v.remote || v.inactive) continue;
      if (v.block) { v.input.gas = 0; v.input.steer = 0; v.input.brake = 0; v.input.hand = true; continue; }
      if (v.type === 'local' && !v.finished && !v.eliminated) this.readPlayer(v, dt);
      else if (v.ai || v.auto) { const ai = v.ai || v.auto; if (v.finished) ai.band = 0.8; if (this.orbs) this.aimOrb(v, ai); if (this.gates) this.flyTo(v, ai, true); aiDrive(v, ai, T, vs, dt); }
    }
    if (this.cops.length) this.copLogic(dt);
    // drafting
    for (const v of vs) {
      if (v.remote) continue; v.draft = false; if (v.vf < 25) continue;
      const fx_ = Math.sin(v.h), fz = Math.cos(v.h);
      for (const o of vs) { if (o === v || o.eliminated || o.inactive) continue; const dx = o.x - v.x, dz = o.z - v.z, al = dx * fx_ + dz * fz; if (al > 3 && al < 24 && Math.abs(dx * fz - dz * fx_) < 1.8) { v.draft = true; break; } }
    }
    for (const v of vs) v.update(dt, T, this.fx, this.time);
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) if (!(vs[i].remote && vs[j].remote)) collide(vs[i], vs[j], this.fx);

    // --- rules
    if (this.state === 'racing' && !this.over) {
      for (const v of vs) {
        if (v.remote || v.finished || v.eliminated || v.npc) continue;
        if (this.lapRule && v.lapsDone >= this.laps) {
          v.finished = true; v.finishTime = this.time; if (!this.firstFinish) this.firstFinish = this.time;
          if (this.net) this.net.send({ t: 'fin', id: v.id, time: this.time });
          if (v.type === 'local') audio.sfx('win');
        }
        if (this.orbs) for (let k = 0; k < this.orbs.length; k++) { const o = this.orbs[k]; if (o.t <= 0) { const dx = o.x - v.x, dz = o.z - v.z; if (dx * dx + dz * dz < 6.5) this.takeOrb(k, v); } }
      }
      if (this.rule === 'elim' && this.isHost && this.time >= this.elimAt) {
        this.elimAt += ELIM_EVERY; const alive = this.ranking().filter(v => !v.eliminated);
        if (alive.length > 1) this.eliminate(alive[alive.length - 1]);
      }
      this.checkEnd();
    }
    if (this.orbs) this.updateOrbs(dt);
    if (this.combat) this.combat.update(dt);
    if (this.peds) this.peds.update(dt, this.views.map(v => v.cam));
    if (this.gates && this.state === 'racing') for (const v of this.racers) { // flying through a gate tops up nitro
      if (v.remote || v.eliminated) continue; const g = this.gates[v.gateK = v.gateK ?? 0]; if (!g) { if (v.idx < 30) v.gateK = 0; continue; }
      if (v.idx >= g.i && v.idx < g.i + 30) { v.gateK++; const d = lateral(T, g.i, v.x, v.z) - g.off; if (d * d + (v.y - g.y) ** 2 < g.r * g.r) { v.nitro = Math.min(1, v.nitro + 0.16); v.gatesHit = (v.gatesHit || 0) + 1; this.fx.burst(v.x, v.alt + v.y, v.z, 0.3, 1, 1); if (v.type === 'local') { audio.sfx('orb'); v.trickMsg = 'GATE!  +NITRO'; v.trickT = 0.9; } } }
    }
    for (const v of this.racers) { if (v.remote) continue; if (!this.combat && v.hp < 100 && v.crashT <= 0) v.hp = Math.min(100, v.hp + 2.5 * dt); if (v.punchCd > 0) v.punchCd -= dt; if (v.type !== 'local') { v.landed = null; v.formChanged = null; if (v.ai && (this.rule === 'combat' || this.rule === 'rush') && this.state === 'racing' && Math.random() < dt * 0.3) this.melee(v, true); } }
    // rubber band + ranking
    this.bandT -= dt;
    if (this.bandT <= 0) {
      this.bandT = 0.4; this.order = this.ranking();
      const humans = this.racers.filter(v => v.type !== 'ai' && !v.eliminated); let best = -1e9; for (const h of humans) best = Math.max(best, h.progress);
      for (const v of this.racers) if (v.ai && humans.length) { const gap = (v.progress - best) * T.step; v.ai.band = gap > 60 ? 0.93 : gap < -90 ? 1.07 : 1; }
    }
    // --- net send
    if (this.net) {
      this.sendT -= dt;
      if (this.sendT <= 0) { this.sendT = 1 / 15; const out = []; for (const v of vs) if (!v.remote && !v.left) out.push(v.netState()); if (out.length) this.net.send({ t: 's', v: out }); }
    }
    // --- visuals
    for (const v of vs) v.syncVisual(dt);
    this.fx.update(dt);
    this.views.forEach((vw, i) => { this.updateCamera(vw, dt); this.updateHud(vw, i); });
    this.world.update(dt, vs, this.views.map(v => v.cam));
    this.updateAudio();
    if (this.over) { this.endT -= dt; if (this.endT <= 0 && !this.reported) { this.reported = true; audio.silence(); this.cfg.onEnd && this.cfg.onEnd(this.results); } }
  }

  // Police: chase the nearest human racer, ram and box them in, set up roadblocks. Run by the host.
  copLogic(dt) {
    const T = this.T, L = T.N, humans = this.racers.filter(v => v.type !== 'ai' && !v.eliminated && !v.finished);
    const gapTo = (c, t) => { let g = (t.idx - c.idx + L) % L; if (g > L / 2) g -= L; return g * T.step; };
    if (this.isHost && this.state === 'racing') {
      const hot = this.racers.filter(v => !v.eliminated && !v.finished && (this.heat[v.id] || 0) > this.time);
      const prey = this.rule === 'pursuit' ? (humans.length ? humans : this.racers.filter(v => !v.eliminated).slice(0, 1)) : hot;
      for (const c of this.cops) {
        if (c.block) continue;
        if (!prey.length) { if (!c.inactive && this.rule !== 'pursuit') c.inactive = true; continue; }
        if (c.inactive) { c.inactive = false; c.hp = 100; c.crashT = 0; c.frozen = false; c.place(T, (prey[0].idx - 55 + L) % L, 0); c.safeT = 1; }
        let t = prey[0], bg = 1e9; for (const h of prey) { const g = Math.abs(gapTo(c, h)); if (g < bg) { bg = g; t = h; } }
        const gap = gapTo(c, t), ai = c.ai;
        if ((gap > 240 || gap < -70) && c.crashT <= 0) { c.place(T, (t.idx - 50 + L) % L, 0); c.vx = Math.sin(c.h) * t.vf * 0.9; c.vz = Math.cos(c.h) * t.vf * 0.9; c.safeT = 1; continue; }
        ai.cap = Math.max(14, Math.abs(t.vf) + (gap > 14 ? 10 : gap > 3 ? 4 : -2)); c.st.top = Math.max(c.st.top, t.st.top * 1.08);
        ai.fixed = gap < 40 ? clamp(lateral(T, t.idx, t.x, t.z), -T.half + 2.2, T.half - 2.2) : null; c.input.nitro = false;
      }
      this.blockT -= dt; const bl = this.cops.filter(c => c.block);
      if (this.rule === 'pursuit' && bl.length && this.blockT <= 0 && humans.length) {
        this.blockT = 26; const t = humans[0], i = (t.idx + Math.round(clamp(t.vf * 5, 110, 260) / T.step)) % L;
        if (Math.abs(T.curv[i]) < 0.006) { const side = Math.random() < 0.5 ? -1 : 1; bl.forEach((c, k) => { c.inactive = false; c.hp = 100; c.crashT = 0; c.place(T, i, side * (k ? 0.1 : 0.62) * T.half); c.h += Math.PI / 2; c.life = 22; c.frozen = false; }); ui.toast('ROADBLOCK AHEAD!'); }
      }
      for (const c of bl) if (!c.inactive) { c.life -= dt; if (c.life <= 0 || humans.every(h => gapTo(c, h) < -60)) c.inactive = true; }
    }
    // busted: stopped next to an active cop for too long (each player checks their own car)
    for (const v of this.locals) {
      if (v.eliminated || v.finished || this.state !== 'racing') continue;
      let close = false; for (const c of this.cops) { if (c.inactive || c.crashT > 0) continue; const dx = c.x - v.x, dz = c.z - v.z; if (dx * dx + dz * dz < 72) { close = true; break; } }
      v.bustT = close && Math.abs(v.vf) < 9 ? v.bustT + dt : Math.max(0, v.bustT - dt * 0.8);
      if (v.bustT >= 2.5) { v.busted = true; this.eliminate(v); }
    }
  }

  // Police alert: hitting pedestrians or firing guns makes the cops chase that racer for a while.
  wanted(v, secs, fromNet) {
    if (!this.cops.length || this.rule === 'pursuit') return;
    const was = (this.heat[v.id] || 0) > this.time; this.heat[v.id] = Math.max(this.heat[v.id] || 0, this.time + secs);
    if (!was && v.type === 'local') { ui.toast('WANTED! The police are after you'); audio.sfx('out'); }
    if (this.net && !fromNet && !v.remote) this.net.send({ t: 'wanted', id: v.id, secs });
  }
  // Melee: shove / punch the nearest rival alongside.
  melee(v, quiet) {
    if (v.punchCd > 0 || v.crashT > 0 || v.air) return; let best = null, bd = 13;
    for (const o of this.racers) { if (o === v || o.eliminated || o.crashT > 0) continue; const d = (o.x - v.x) ** 2 + (o.z - v.z) ** 2; if (d < bd) { bd = d; best = o; } }
    if (!best) { if (!quiet) { v.punchCd = 0.35; } return; }
    v.punchCd = 0.8; this.fx.burst((v.x + best.x) / 2, 1.1, (v.z + best.z) / 2, 1, 0.95, 0.7);
    if (v.rider && !v.riderOff) { const a = v.rider.play(Math.random() < 0.5 ? 'Punch' : 'Kick', 0.05, true); setTimeout(() => { if (!v.riderOff && v.rider) { v.rider.current = null; v.rider.play('Drive', 0.15); } }, 520); }
    if (v.type === 'local') audio.sfx('hit', 9);
    if (!best.remote) this.applyMelee(best, v); else if (this.net) this.net.send({ t: 'melee', id: v.id, tid: best.id });
  }
  applyMelee(o, by) {
    if (o.remote || o.shield > 0) return; const dx = o.x - by.x, dz = o.z - by.z, l = Math.hypot(dx, dz) || 1;
    o.vx += dx / l * 7; o.vz += dz / l * 7; o.vx *= 0.94; o.vz *= 0.94; o.impact = Math.max(o.impact, 9);
    if (o.damage(24, this.fx) && by.type === 'local') by.kills = (by.kills || 0) + 1;
  }

  // steer height (and for AI, line) towards the next ring gate
  flyTo(v, ai, isAI) {
    const g = this.gates[v.gateK ?? 0] || this.gates[0]; if (!g) return;
    v.input.climb = clamp((g.y - v.y) / 5, -1, 1) * (isAI ? 0.9 : 0.75);
    if (ai && ai.orbOff == null && ai.cap == null) { const di = (g.i - v.idx + this.T.N) % this.T.N; ai.fixed = di < 70 ? g.off * 0.9 + ai.lane : null; }
  }

  aimOrb(v, ai) {
    ai.orbOff = null; let bd = 1e9;
    for (const o of this.orbs) { if (o.t > 0) continue; const di = (o.i - v.idx + this.T.N) % this.T.N; if (di > 4 && di < 60 && di < bd) { bd = di; ai.orbOff = o.off; } }
  }
  updateOrbs(dt) {
    const d = this.dummy, t = performance.now() / 1000;
    this.orbs.forEach((o, k) => {
      if (o.t > 0) o.t -= dt;
      const s = o.t > 0 ? 0.0001 : 1; d.position.set(o.x, this.alt + 1.15 + Math.sin(t * 3 + k) * 0.18, o.z); d.rotation.set(0, t * 2 + k, 0.4); d.scale.setScalar(s); d.updateMatrix();
      this.orbMesh.setMatrixAt(k, d.matrix); this.orbGlow.setMatrixAt(k, d.matrix);
    });
    this.orbMesh.instanceMatrix.needsUpdate = this.orbGlow.instanceMatrix.needsUpdate = true;
  }

  readPlayer(v, dt) {
    const c = input.read(v.device), T = this.T, a = save.settings.assist, inp = v.input;
    let steer = c.steer, gas = c.gas, brake = c.brake;
    if (save.settings.autoGas && !brake) gas = 1;
    if (a !== 'pro' && v.vf > 6) {
      const d = lateral(T, v.idx, v.x, v.z), lim = T.half - v.halfW, edge = Math.abs(d) / lim;
      const guide = steerTo(v, T, clamp(d, -lim * 0.55, lim * 0.55));
      const w = a === 'easy' ? clamp((edge - 0.45) * 1.6, 0, 0.75) + (Math.abs(steer) < 0.1 ? 0.25 : 0) : clamp((edge - 0.75) * 2, 0, 0.4);
      steer = clamp(steer * (1 - w * 0.6) + guide * w, -1, 1);
      if (a === 'easy') { const allow = safeSpeed(v, T, 1.0); if (v.vf > allow + 2) { brake = Math.max(brake, 0.8); gas = 0; } }
    }
    inp.steer = steer; inp.gas = gas; inp.brake = brake; inp.hand = c.hand; inp.nitro = c.nitro; v.fire = c.fire;
    if (this.gates) { inp.climb = c.climb; if (Math.abs(c.climb) < 0.12 && a !== 'pro') this.flyTo(v, null, false); }
    if (c.punch) this.melee(v);
    if (v.landed) { v.trickMsg = v.landed === 'bad' ? 'BAD LANDING!' : `${v.landed}× TRICK!  +NITRO`; v.trickT = 1.8; audio.sfx(v.landed === 'bad' ? 'out' : 'orb'); v.landed = null; }
    if (v.formChanged) { v.trickMsg = v.formChanged === 'boat' ? 'WATER! ALL ABOARD' : 'BACK ON THE ROAD'; v.trickT = 1.8; audio.sfx('nitro'); v.formChanged = null; }
    if (v.trickT > 0) v.trickT -= dt;
    if (c.nitro && v.nitro > 0.05 && !v.wasBoost) audio.sfx('nitro'); v.wasBoost = c.nitro && v.nitro > 0.05;
    if (c.reset || v.wrongT > 6) { v.wrongT = 0; v.reset(T); }
    if (c.cam) { const vw = this.views.find(x => x.v === v); if (vw) vw.mode = (vw.mode + 1) % 3; }
    if (c.pause && !this.cfg.demo) this.game.togglePause();
    if (v.impact > 3) { const vw = this.views.find(x => x.v === v); if (vw) vw.shake = Math.min(1, v.impact * 0.06); audio.sfx('hit', v.impact); input.rumble(v.device, v.impact * 0.07); }
    if (v.hitCone) { v.hitCone = false; audio.sfx('hit', 2); input.rumble(v.device, 0.25, 80); }
    v.impact = 0;
  }

  checkEnd() {
    const vs = this.racers, humans = vs.filter(v => v.type !== 'ai' && !v.left);
    let done = false;
    if (this.lapRule) {
      const fin = humans.every(v => v.finished || v.eliminated);
      done = fin || (this.net && this.firstFinish && this.time - this.firstFinish > 30 && humans.some(v => v.finished));
      if (!this.net && this.locals.length && this.locals.every(v => v.finished)) done = true;
    } else if (this.rule === 'elim') {
      const alive = vs.filter(v => !v.eliminated);
      done = alive.length <= 1 || (!this.net && this.locals.length && this.locals.every(v => v.eliminated)) || humans.every(v => v.eliminated);
    } else done = this.time >= ORB_TIME;
    if (this.cfg.demo) { if (done) { this.over = true; this.endT = 1; this.results = []; } return; }
    if (done && this.isHost) {
      const res = this.ranking().map((v, i) => ({ id: v.id, name: v.name, type: v.type, pos: i + 1, time: v.finished ? v.finishTime : 0, score: v.score, out: v.eliminated, busted: !!v.busted, best: v.bestLap || 0, top: Math.round(v.topSpeed * 3.6), kills: v.kills || 0 }));
      if (this.net) this.net.send({ t: 'end', results: res });
      this.finish(res);
    }
  }
  finish(results) { if (this.over) return; this.over = true; this.endT = 3; this.results = results; this.state = 'done'; for (const v of this.locals) { v.finished = true; } ui.banner('FINISH!'); }

  updateCamera(vw, dt, snap) {
    let v = vw.v;
    if (v.eliminated) { const alive = this.order ? this.order.find(o => !o.eliminated) : null; if (alive) v = alive; }
    const ay = v.alt + v.y * (v.air ? 1 : 0.6), airK = v.air ? 1.35 : 1;
    const cam = vw.cam, sp = Math.abs(v.vf), bike = v.isBike, k = snap ? 1 : 1 - Math.exp(-6 * dt);
    let tgtH = v.h;
    if (this.state === 'countdown') tgtH = v.h + clamp(this.count - 1.2, 0, 2.4) * 0.9;
    else if (v.finished || this.cfg.demo) tgtH = v.h + Math.sin(performance.now() / 4000) * 1.1 + (this.cfg.demo ? 0.5 : 0);
    vw.camH += wrap(tgtH - vw.camH) * k;
    const far = vw.mode === 1, hood = vw.mode === 2 && this.state === 'racing' && !v.finished;
    const dist = (bike ? 5.2 : 6.6) * airK * (far ? 1.5 : 1) + sp * 0.022 + (this.cfg.demo ? 3 : 0), hgt = (bike ? 2.2 : 2.5) * (far ? 1.55 : 1);
    const sh = vw.shake; vw.shake = Math.max(0, vw.shake - dt * 2.5);
    if (hood) {
      cam.position.set(v.x + Math.sin(v.h) * (bike ? 0.2 : 0.5), (bike ? 1.45 : 1.25) + ay + sh * 0.1 * Math.random(), v.z + Math.cos(v.h) * (bike ? 0.2 : 0.5));
      cam.lookAt(v.x + Math.sin(v.h) * 30, 1.0 + ay, v.z + Math.cos(v.h) * 30); if (bike) cam.rotation.z += v.tilt.rotation.z * 0.5;
    } else {
      let tx = v.x - Math.sin(vw.camH) * dist, tz = v.z - Math.cos(vw.camH) * dist;
      { // keep the camera inside the barriers so walls and trees never block the view
        const T = this.T, ci = nearestIdx(T, tx, tz, (v.idx - 5 + T.N) % T.N), d = lateral(T, ci, tx, tz), lim = T.half - 0.7;
        if (Math.abs(d) > lim) { const e = d - Math.sign(d) * lim; tx -= T.tz[ci] * e; tz += T.tx[ci] * e; }
      }
      const kp = snap ? 1 : 1 - Math.exp(-14 * dt);
      vw.pos.x += (tx - vw.pos.x) * kp; vw.pos.z += (tz - vw.pos.z) * kp; vw.pos.y += (hgt - vw.pos.y) * kp;
      cam.position.set(vw.pos.x + (Math.random() - 0.5) * sh * 0.5, vw.pos.y + ay + (Math.random() - 0.5) * sh * 0.4, vw.pos.z);
      cam.lookAt(v.x + Math.sin(v.h) * 5, (bike ? 1.3 : 1.15) + ay, v.z + Math.cos(v.h) * 5);
    }
    const fov = (hood ? 74 : 62) + Math.min(1, sp / 85) * 15 + (v.boosting ? 7 : 0);
    vw.fov += (fov - vw.fov) * (snap ? 1 : 1 - Math.exp(-4 * dt)); cam.fov = vw.fov;
  }

  updateHud(vw, i) {
    if (this.cfg.demo || this.frame % 2) return;
    const v = vw.v, order = this.order, pos = order.indexOf(v) + 1, c = Math.ceil(this.count);
    let big = '', msg = '';
    if (this.state === 'countdown') big = this.net && !this.netGo ? 'GET READY' : c > 3 ? '' : String(c);
    else if (this.time < 1.2) big = 'GO!';
    if (v.eliminated) msg = v.busted ? 'BUSTED!' : 'KNOCKED OUT'; else if (v.finished && !this.over) msg = 'FINISHED  P' + pos; else if (v.wrongT > 1) msg = 'WRONG WAY'; else if (v.crashT > 0) msg = v.hp <= 0 ? 'WRECKED!' : 'CRASHED!'; else if (v.bustT > 0.4) msg = 'POLICE! KEEP MOVING!'; else if (v.offCourse > 0) msg = 'OFF COURSE – TURN BACK'; else if (v.trickT > 0) msg = v.trickMsg;
    else if (this.lapRule && v.started && v.lapsDone === this.laps - 1 && this.time - v.lapStart < 2.5 && this.laps > 1) msg = 'FINAL LAP';
    const alive = this.racers.filter(x => !x.eliminated).length, wp = v.weapon;
    ui.hud(i, {
      pos, total: this.racers.length, lapRule: this.lapRule, hp: this.combat || v.hp < 99 ? v.hp : null, weapon: !this.combat ? '' : (wp ? WEAPONS[wp.type].name + (wp.ammo > 1 ? '  ×' + wp.ammo : '') : '— no weapon —'), bust: this.cops.length ? v.bustT / 2.5 : null, count: this.state === 'countdown' ? this.count : -1, lap: Math.min(this.laps, v.lapsDone + 1), laps: this.laps, kmh: v.kmh, nitro: v.nitro, boosting: v.boosting, time: this.time, big, msg, rule: this.rule,
      info: this.rule === 'elim' ? `KNOCKOUT IN ${Math.max(0, Math.ceil(this.elimAt - this.time))}s  ·  ${alive} LEFT` : this.rule === 'orbs' ? `ORBS ${v.score}  ·  ${Math.max(0, Math.ceil(ORB_TIME - this.time))}s` : this.rule === 'trial' ? (this.cfg.record ? 'RECORD ' + ui.fmtTime(this.cfg.record) : 'SET A LAP TIME') : this.rule === 'pursuit' ? `${this.cops.filter(c => !c.inactive && !c.block).length} COPS ON YOUR TAIL` : this.gates && this.rule !== 'orbs' && this.rule !== 'elim' ? `ALT ${Math.round(v.alt + v.y)} m  ·  GATES ${v.gatesHit || 0}/${this.gates.length * (this.lapRule ? this.laps : 1)}` : (this.heat[v.id] || 0) > this.time ? `WANTED!  POLICE ALERTED  ·  ${Math.ceil(this.heat[v.id] - this.time)}s` : '',
      danger: (this.heat[v.id] || 0) > this.time || this.rule === 'elim' && !v.eliminated && order.filter(x => !x.eliminated).pop() === v && alive > 1,
      board: this.views.length === 1 ? order : null, me: v, vehicles: this.vehicles, best: v.bestLap,
    });
  }

  updateAudio() {
    if (this.cfg.demo) return;
    let sk = 0;
    this.locals.forEach((v, i) => {
      const on = !v.eliminated && this.state !== 'done';
      audio.engine(i, on ? Math.abs(v.vf) / v.st.top : 0, on ? Math.max(v.input.gas, 0.15) : 0, v.isBike, v.boosting);
      if (on && (v.drift || v.slip > 6) && Math.abs(v.vf) > 8) sk = Math.max(sk, 0.06 + v.slip * 0.012);
    });
    audio.skid(this.paused ? 0 : sk);
    let near = 0; for (const c of this.cops) { if (c.inactive) continue; for (const l of this.locals) { const d = Math.hypot(c.x - l.x, c.z - l.z); if (d < 110) near = Math.max(near, 1 - d / 110); } }
    audio.siren(this.paused || this.over ? 0 : near);
  }

  render(renderer) {
    const w = innerWidth, h = innerHeight, n = this.views.length;
    renderer.setScissorTest(n > 1);
    this.views.forEach((vw, i) => {
      const r = viewRect(i, n), x = Math.floor(r.x * w), y = Math.floor((1 - r.y - r.h) * h), vwW = Math.ceil(r.w * w), vwH = Math.ceil(r.h * h);
      renderer.setViewport(x, y, vwW, vwH); if (n > 1) renderer.setScissor(x, y, vwW, vwH);
      vw.cam.aspect = vwW / vwH; vw.cam.updateProjectionMatrix();
      this.fx.setScale(vwH * renderer.getPixelRatio() * 0.7);
      for (const o of this.vehicles) if (o.label) o.label.visible = o !== vw.v && !o.eliminated;
      renderer.render(this.scene, vw.cam);
    });
  }

  dispose() {
    this.disposed = true;
    if (this.net) for (const k in this.handlers) this.net.off(k, this.handlers[k]);
    for (const v of this.vehicles) v.dispose();
    if (this.orbMesh) { this.scene.remove(this.orbMesh, this.orbGlow); this.orbMesh.geometry.dispose(); this.orbGlow.geometry.dispose(); }
    this.scene.remove(this.fx.smokeP.points, this.fx.glowP.points);
    if (this.combat) this.combat.dispose(); if (this.peds) this.peds.dispose();
    this.world.dispose(); audio.silence(); ui.hudClear();
  }
}
function cfg_seed(c) { return (c.seed || 1) * 31 + c.track.length; }
export function viewRect(i, n) {
  if (n === 1) return { x: 0, y: 0, w: 1, h: 1 };
  if (n === 2) return { x: 0, y: i * 0.5, w: 1, h: 0.5 };
  return { x: (i % 2) * 0.5, y: Math.floor(i / 2) * 0.5, w: 0.5, h: 0.5 };
}
