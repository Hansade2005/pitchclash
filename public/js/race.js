// One race session: vehicles, rules (sprint / elimination / orb rush), cameras, split-screen and net sync.
import * as THREE from 'three';
import { TRACKS, buildTrackData, lateral, nearestIdx, cutPos, elevAt } from './track.js';
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
const ELIM_FIRST = 35, ELIM_EVERY = 20, ORB_TIME = 90, KD_TIME = 120, TOXIC_MAX = 150, CATCH_TIME = 110, CLEAN_TIME = 20, SCORE_RULES = ['orbs', 'knockdown', 'gates'];

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
    this.quality = game.quality; this.world = buildWorld(this.scene, game.renderer, T, this.quality, { mode: this.mode, alt: this.alt, relay: cfg.rule === 'relay', weather: cfg.weather, gates: this.gates });
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
      v.track = T; v.useElev = this.mode === 'road'; v.ramDamage = this.mode === 'road' ? (cfg.rule === 'knockdown' ? 3 : cfg.rule === 'toxic' ? 0 : 0.8) : 0;
      if (cfg.weather === 'rain') v.st.grip *= 0.9; else if (cfg.weather === 'snow') v.st.grip *= 0.82;
      if (e.type === 'runner') { v.npc = true; v.ai = makeAI(0.92, 0); v.st.top *= 0.97; v.started = true; v.place(T, 55, 0); }
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
    this.racers = this.vehicles.filter(v => !v.npc); this.cops = this.vehicles.filter(v => v.cop); this.blockT = 22; this.lapRule = ['sprint', 'combat', 'pursuit', 'trial', 'rush', 'relay', 'versus', 'gates'].includes(this.rule); this.heat = {};
    if (cfg.peds && this.mode === 'road') this.peds = new Peds(this, cfg.peds);
    if (this.rule === 'combat' || cfg.weapons) this.combat = new Combat(this);
    this.slow = 0; this.runner = this.vehicles.find(v => v.type === 'runner') || null;
    if (this.runner) { const top = Math.max(...this.racers.map(v => v.st.top)), acc = Math.max(...this.racers.map(v => v.st.acc)); Object.assign(this.runner.st, { top: top * 0.95, acc: acc * 0.95 }); }
    if (this.rule === 'gates') this.initDriftGates();
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
    const sc = v => this.rule === 'catch' ? (v === this.caughtBy ? 1e12 : 1e6 - (this.runner ? Math.hypot(v.x - this.runner.x, v.z - this.runner.z) : 0)) : this.rule === 'toxic' && !v.eliminated ? 1e6 + v.score * 1e4 + v.progress * 1e-3 : SCORE_RULES.includes(this.rule) && !v.eliminated ? 1e6 + v.score * 1e4 + v.progress * 1e-3 : v.finished ? 3e9 - v.finishTime : v.eliminated ? -1e9 + this.elimOrder.indexOf(v) : this.rule === 'orbs' ? 1e6 + v.score * 1e4 + v.progress * 1e-3 : 1e6 + v.progress;
    return [...this.racers].sort((a, b) => sc(b) - sc(a));
  }

  update(dt) {
    if (this.paused && !this.net) return;
    if (this.slow > 0 && !this.net) { this.slow -= dt; dt *= 0.35; } else this.slow = 0;
    const cv = document.getElementById('game'); if (cv && cv.classList.contains('slowmo') !== this.slow > 0) cv.classList.toggle('slowmo', this.slow > 0);
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
      else if (v.ai || v.auto) { const ai = v.ai || v.auto; if (v.type === 'ai') this.aggro(v, ai); if (v.finished) ai.band = 0.8; if (this.orbs) this.aimOrb(v, ai); if (this.gates) this.flyTo(v, ai, true); aiDrive(v, ai, T, vs, dt); }
    }
    for (const v of vs) if (v.ai && !v.remote && v.ai.cutGo) { const C = T.cut, cp = cutPos(T, v.x, v.z, v.idx), j = cp && cp.d < C.half + 4 ? Math.min(C.n, cp.j + 6) : 4; let a = Math.atan2(C.x[j] - v.x, C.z[j] - v.z) - v.h; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; v.input.steer = clamp(a * 2.4, -1, 1); v.input.gas = 1; v.input.brake = 0; }
    if (this.rule === 'gates') for (const v of vs) if (v.ai && v.type === 'ai' && !v.remote && Math.max(Math.abs(T.curv[v.idx]), Math.abs(T.curv[(v.idx + 8) % T.N])) > 0.006 && v.vf > 16) v.input.hand = Math.random() < 0.75;
    if (this.runner && !this.runner.remote) { const r = this.runner; let gap = 1e9; for (const v of this.racers) if (!v.eliminated) gap = Math.min(gap, Math.hypot(v.x - r.x, v.z - r.z)); r.ai.cap = gap > 70 ? r.st.top * 0.62 : gap > 35 ? r.st.top * 0.8 : null; }
    if (this.cops.length) this.copLogic(dt);
    // drafting
    for (const v of vs) {
      if (v.remote) continue; const was = v.draft; v.draft = false;
      if (v.vf >= 25) { const fx_ = Math.sin(v.h), fz = Math.cos(v.h);
        for (const o of vs) { if (o === v || o.eliminated || o.inactive) continue; const dx = o.x - v.x, dz = o.z - v.z, al = dx * fx_ + dz * fz; if (al > 3 && al < 24 && Math.abs(dx * fz - dz * fx_) < 1.8) { v.draft = true; break; } } }
      if (this.state !== 'racing' || !this.racers.includes(v)) { v.draftT = 0; continue; }
      if (v.draft) { const t0 = v.draftT || 0; v.draftT = t0 + dt; if (t0 < 1.5 && v.draftT >= 1.5) this.reward(v, 'SLIPSTREAM', 0.08, { cr: 20 }); }
      else { if (was && v.draftT >= 1.5 && v.vf > 25 && v.crashT <= 0) this.reward(v, 'SLINGSHOT!', 0.05, { surge: 1.2, cr: 40 }); v.draftT = 0; }
    }
    for (const v of vs) v.update(dt, T, this.fx, this.time);
    for (const v of vs) v.lastHit = null;
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) if (!(vs[i].remote && vs[j].remote)) collide(vs[i], vs[j], this.fx);
    this.events(dt);

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
    if (this.dgates) this.updateDriftGates();
    if (this.peds) this.peds.update(dt, this.views.map(v => v.cam));
    if (this.gates && this.state === 'racing') for (const v of this.racers) { // flying through a gate tops up nitro
      if (v.remote || v.eliminated) continue; const g = this.gates[v.gateK = v.gateK ?? 0]; if (!g) { if (v.idx < 30) v.gateK = 0; continue; }
      if (v.idx >= g.i && v.idx < g.i + 30) { v.gateK++; const d = lateral(T, g.i, v.x, v.z) - g.off; if (d * d + (v.y - g.y) ** 2 < g.r * g.r) { v.nitro = Math.min(1, v.nitro + 0.16); v.gatesHit = (v.gatesHit || 0) + 1; this.fx.burst(v.x, v.alt + v.y, v.z, 0.3, 1, 1); if (v.type === 'local') this.feed(v, 'GATE', '+NITRO'); } }
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

  // ---- reward chain: everything stylish tops up nitro; quick successions build a ×2..×5 chain worth more credits
  reward(v, label, nitro, o = {}) {
    if (!v || v.remote || v.eliminated) return;
    v.nitro = Math.min(1, v.nitro + nitro);
    if (o.surge) v.padT = Math.max(v.padT, o.surge);
    if (o.speed) v.topBonusT = Math.max(v.topBonusT || 0, o.speed);
    if (v.type !== 'local') return;
    v.chain = (v.chainT ?? -9) > this.time - 4 ? Math.min(5, (v.chain || 1) + 1) : 1; v.chainT = this.time;
    const cr = Math.round((o.cr || 20) * v.chain); v.mayhem = (v.mayhem || 0) + cr; v.rewards = (v.rewards || 0) + 1;
    this.feed(v, label, (o.tag || (o.surge ? '+BOOST' : nitro > 0 ? '+NITRO' : '')) + (v.chain > 1 ? `  CHAIN ×${v.chain}` : '') + `  +${cr} cr`, o.hot);
    audio.sfx('reward', v.chain); input.rumble(v.device, 0.15, 60);
  }
  feed(v, label, sub, hot) { const k = this.views.findIndex(w => w.v === v); if (k >= 0 && !this.cfg.demo) ui.feed(k, label, sub, hot); }
  // per-player style tracking: perfect start, clean driving, long drifts, overtakes
  style(v, dt, gas) {
    if (this.state === 'countdown') { if (gas > 0.5) { if (v.gasAt == null) v.gasAt = this.count; } else v.gasAt = null; return; }
    if (this.state !== 'racing' || v.finished || v.eliminated) return;
    if (!v.startDone) { v.startDone = true; if (v.gasAt != null && v.gasAt < 0.75 && !this.cfg.demo) this.reward(v, 'PERFECT START', 0.15, { surge: 1.6, cr: 60 }); }
    const hit = (v.impact > 3 && !v.justLanded) || v.crashT > 0 || v.offCourse > 0 || v.hitCone || v.wrongT > 1; v.justLanded = false;
    if (hit) { if ((v.cleanT || 0) > 8) this.feed(v, 'CLEAN STREAK LOST', ''); v.cleanT = 0; v.cleanN = 0; v.driftT = 0; }
    else if (Math.abs(v.vf) > 12) { v.cleanT = (v.cleanT || 0) + dt;
      if (v.cleanT >= CLEAN_TIME) { v.cleanT = 0; v.cleanN = (v.cleanN || 0) + 1; this.reward(v, v.cleanN > 1 ? `CLEAN DRIVING ×${v.cleanN}` : 'CLEAN DRIVING', 0.4, { surge: 2.5, speed: 10, cr: 150 * v.cleanN, tag: '+NITRO +TOP SPEED', hot: 1 }); } }
    if (this.rule !== 'gates' && !v.air) { if (v.drift && v.crashT <= 0) v.driftT = (v.driftT || 0) + dt; else { if ((v.driftT || 0) > 1.8) this.reward(v, `DRIFT ${v.driftT.toFixed(1)}s`, Math.min(0.25, v.driftT * 0.05), { cr: Math.round(v.driftT * 20) }); v.driftT = 0; } }
    if (this.lapRule && this.order) { const p = this.order.indexOf(v); if (v.lastPos != null && p >= 0 && p < v.lastPos && this.time > 6 && (v.otT ?? -9) < this.time - 1.5) { v.otT = this.time; this.reward(v, p === 0 ? 'TOOK THE LEAD!' : 'OVERTAKE', p === 0 ? 0.1 : 0.05, { cr: p === 0 ? 50 : 20 }); } if (p >= 0) v.lastPos = p; }
  }

  // racing events each frame: takedowns, near misses, smashes, traffic hits, toxic tag, catching the runner
  events(dt) {
    const T = this.T, local = v => v.type === 'local';
    for (const v of this.vehicles) {
      if (v.crashT > 0 && v.wreckedBy && !v.tdDone) { v.tdDone = true; const a = v.wreckedBy; a.kills = (a.kills || 0) + 1; if (this.rule === 'knockdown' && !a.npc) a.score++; this.reward(a, 'TAKEDOWN!', 0.5, { surge: 2, cr: 100, hot: 1 });
        this.fx.burst(v.x, 1 + (v.ey || 0), v.z, 1, 0.6, 0.15); if (local(a) || local(v)) { if (!this.net) this.slow = 0.9; audio.sfx('boom', 1); } if (local(v)) { v.trickMsg = 'WRECKED!'; v.trickT = 1.6; } }
      if (v.crashT <= 0 && v.tdDone) { v.tdDone = false; v.wreckedBy = null; }
      if (v.smashAt) { const [x, z, kind] = v.smashAt; v.smashAt = null; for (let k = 0; k < 3; k++) this.fx.burst(x, 0.8, z, kind ? 1 : 0.7, kind ? 0.45 : 0.5, kind ? 0.1 : 0.35); if (!v.npc) { v.mayhem = (v.mayhem || 0) + 150; if (local(v)) { this.feed(v, 'SMASHED IT', '+150 cr', 1); audio.sfx('hit', 6); } } }
      if (v.padHit) { v.padHit = false; if (local(v)) { this.feed(v, 'BOOST PAD', 'SPEED!'); audio.sfx('nitro'); } }
      if (v.lastHit && v.lastHit.type === 'traffic' && v.impact > 7 && !v.npc && !v.remote) this.wanted(v, 20);
    }
    // near misses: skim past traffic or a rival at speed for nitro (and a moment of slow motion)
    for (const v of this.locals) { if (v.eliminated || v.crashT > 0) continue; const fx = Math.sin(v.h), fz = Math.cos(v.h);
      for (const o of this.vehicles) { if (o === v || o.inactive || o.eliminated || o.air) continue; const dx = o.x - v.x, dz = o.z - v.z; if (dx * dx + dz * dz > 20) continue; const al = dx * fx + dz * fz, sd = Math.abs(dx * fz - dz * fx);
        if (Math.abs(al) < 1.2 && sd > 1.9 && sd < 3.6 && v.vf - o.vf > 8 && v.lastHit !== o && (o.nm || -9) < this.time - 2) { o.nm = this.time; this.reward(v, o.type === 'traffic' ? 'NEAR MISS' : o.cop ? 'COP DODGED' : 'CLOSE CALL', 0.15, { cr: 30 }); if (o.type === 'traffic' && !this.net && this.slow <= 0) this.slow = 0.4; } } }
    // toxic tag
    if (this.rule === 'toxic' && this.state === 'racing') {
      if (!this.toxicStarted) { this.toxicStarted = true; const pool = this.racers.filter(v => !v.eliminated); this.infect(pool[Math.floor(Math.random() * pool.length)], null); }
      for (const v of this.racers) { if (v.eliminated || !(v.toxic > 0)) continue; v.toxic -= dt;
        const o = v.lastHit; if (o && !o.npc && !o.eliminated && !(o.toxic > 0) && !((o.immune || 0) > this.time)) { this.infect(o, v); v.toxic = Math.min(20, v.toxic + 5); v.score++; }
        else if (v.toxic <= 0) { v.toxic = 0; if (v.aura) v.aura.visible = false; this.eliminate(v); } }
    }
    // catch the runner
    if (this.runner && this.state === 'racing' && !this.caughtBy) { const r = this.runner;
      for (const v of this.racers) { if (v.eliminated) continue; const d = Math.hypot(v.x - r.x, v.z - r.z); v.catchT = d < 5.5 ? (v.catchT || 0) + dt : Math.max(0, (v.catchT || 0) - dt); if (v.catchT >= 2 || (v.lastHit === r && v.impact > 4)) { this.caughtBy = v; r.vx *= 0.2; r.vz *= 0.2; r.frozen = true; ui.toast((v.type === 'local' ? 'You' : v.name) + ' caught the target!'); if (local(v)) audio.sfx('win'); break; } } }
  }
  infect(v, by) {
    if (!v) return; v.toxic = by ? 12 : 15; v.immune = this.time + 2;
    if (!v.aura) { v.aura = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), new THREE.MeshBasicMaterial({ color: 0x5dff4a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); v.aura.position.y = 1; v.root.add(v.aura); }
    v.aura.visible = true; this.fx.burst(v.x, 1.2 + (v.ey || 0), v.z, 0.4, 1, 0.3);
    ui.toast(by ? `${by.name} infected ${v.name}!` : `${v.name} is TOXIC!`); if (v.type === 'local') audio.sfx('out');
  }
  // computer racers: ram rivals in Knockdown, chase/avoid in Toxic Tag, maybe take the shortcut
  aggro(v, ai) {
    const T = this.T, C = T.cut;
    if (C && this.mode === 'road') { if (v.idx > C.a - 40 && v.idx < C.a - 18 && ai.cutRoll == null) ai.cutRoll = Math.random() < 0.45; if (v.idx < C.a - 45 || v.idx > C.b + 8) ai.cutRoll = null; ai.cutGo = !!ai.cutRoll && v.idx >= C.a - 12 && v.idx < C.b - 3; }
    if (this.rule === 'catch' && this.runner) { const r = this.runner, d = Math.hypot(r.x - v.x, r.z - v.z); ai.fixed = d < 45 ? clamp(lateral(T, r.idx, r.x, r.z), -T.half + 2, T.half - 2) : null; if (d < 60) ai.band = 1.08; return; }
    if (this.rule !== 'knockdown' && this.rule !== 'toxic') return; ai.fixed = null; if (this.state !== 'racing') return;
    let tgt = null, bd = 30; for (const o of this.racers) { if (o === v || o.eliminated || o.crashT > 0) continue; if (this.rule === 'toxic' && !(v.toxic > 0) && !(o.toxic > 0)) continue; if (this.rule === 'toxic' && v.toxic > 0 && o.toxic > 0) continue; const d = Math.hypot(o.x - v.x, o.z - v.z); if (d < bd) { bd = d; tgt = o; } }
    if (!tgt) return; const lo = lateral(T, tgt.idx, tgt.x, tgt.z), lim = T.half - 2;
    ai.fixed = (this.rule === 'toxic' && !(v.toxic > 0)) ? clamp(-Math.sign(lo || 1) * lim * 0.8, -lim, lim) : clamp(lo, -lim, lim);
  }
  initDriftGates() {
    const T = this.T, n = 10, mat = new THREE.MeshBasicMaterial({ color: 0xff3fa0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), post = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    this.dgates = []; this.dgGroup = new THREE.Group();
    for (let k = 1; k <= n; k++) { let i = Math.floor(k * T.N / (n + 1)), best = i; for (let q = -25; q <= 25; q++) { const j = (i + q + T.N) % T.N; if (Math.abs(T.curv[j]) > Math.abs(T.curv[best])) best = j; } i = best;
      const g = new THREE.Group(), e = elevAt(T, i); g.position.set(T.x[i], e, T.z[i]); g.rotation.y = Math.atan2(T.tx[i], T.tz[i]);
      for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), post); p.position.set(sd * (T.half + 0.4), 2, 0); g.add(p); }
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(T.half * 2 + 0.8, 0.9), mat); bar.position.y = 3.6; g.add(bar); const bar2 = bar.clone(); bar2.rotation.y = Math.PI; g.add(bar2);
      this.dgGroup.add(g); this.dgates.push({ i, g }); }
    this.scene.add(this.dgGroup);
  }
  updateDriftGates() {
    const T = this.T;
    for (const v of this.racers) { if (v.remote) continue; const p = v.gPrev ?? v.idx; v.gPrev = v.idx; if (this.state !== 'racing' || v.finished) continue;
      for (const g of this.dgates) { const crossed = p < g.i && v.idx >= g.i && v.idx - p < 40; if (!crossed) continue;
        if (v.drift || v.slip > 4) { v.combo = Math.min(5, (v.combo || 0) + 1); v.score += 100 * v.combo; if (v.type === 'local') { v.trickMsg = `DRIFT GATE  +${100 * v.combo}`; v.trickT = 1.1; audio.sfx('orb'); } }
        else { v.combo = 0; v.score += 10; if (v.type === 'local') { v.trickMsg = 'GATE +10 – drift through for more!'; v.trickT = 1; } } } }
  }

  aimOrb(v, ai) {
    ai.orbOff = null; let bd = 1e9;
    for (const o of this.orbs) { if (o.t > 0) continue; const di = (o.i - v.idx + this.T.N) % this.T.N; if (di > 4 && di < 60 && di < bd) { bd = di; ai.orbOff = o.off; } }
  }
  updateOrbs(dt) {
    const d = this.dummy, t = performance.now() / 1000;
    this.orbs.forEach((o, k) => {
      if (o.t > 0) o.t -= dt;
      const s = o.t > 0 ? 0.0001 : 1; d.position.set(o.x, this.alt + (this.mode === 'road' ? elevAt(this.T, o.i) : 0) + 1.15 + Math.sin(t * 3 + k) * 0.18, o.z); d.rotation.set(0, t * 2 + k, 0.4); d.scale.setScalar(s); d.updateMatrix();
      this.orbMesh.setMatrixAt(k, d.matrix); this.orbGlow.setMatrixAt(k, d.matrix);
    });
    this.orbMesh.instanceMatrix.needsUpdate = this.orbGlow.instanceMatrix.needsUpdate = true;
  }

  readPlayer(v, dt) {
    const c = input.read(v.device), T = this.T, a = save.settings.assist, inp = v.input;
    let steer = c.steer, gas = c.gas, brake = c.brake;
    if (save.settings.autoGas && !brake) gas = 1;
    const C = T.cut, nearCut = C && this.mode === 'road' && v.idx > C.a - 10 && v.idx < C.b && (v.onCut || ((cutPos(T, v.x, v.z, v.idx) || {}).d ?? 99) < C.half + 3);
    if (a !== 'pro' && v.vf > 6 && !nearCut) {
      const d = lateral(T, v.idx, v.x, v.z), lim = T.half - v.halfW, edge = Math.abs(d) / lim;
      const guide = steerTo(v, T, clamp(d, -lim * 0.55, lim * 0.55));
      const w = a === 'easy' ? clamp((edge - 0.45) * 1.6, 0, 0.75) + (Math.abs(steer) < 0.1 ? 0.25 : 0) : clamp((edge - 0.75) * 2, 0, 0.4);
      steer = clamp(steer * (1 - w * 0.6) + guide * w, -1, 1);
      if (a === 'easy') { const allow = safeSpeed(v, T, 1.0); if (v.vf > allow + 2) { brake = Math.max(brake, 0.8); gas = 0; } }
    }
    inp.steer = steer; inp.gas = gas; inp.brake = brake; inp.hand = c.hand; inp.nitro = c.nitro; v.fire = c.fire;
    if (this.gates) { inp.climb = c.climb; if (Math.abs(c.climb) < 0.12 && a !== 'pro') this.flyTo(v, null, false); }
    if (c.punch) this.melee(v);
    if (v.landed) { if (v.landed === 'bad') { v.trickMsg = 'BAD LANDING!'; v.trickT = 1.8; audio.sfx('out'); } else this.reward(v, `${v.landed}× TRICK`, 0, { cr: 60 * v.landed, tag: '+NITRO' }); v.landed = null; }
    if (v.bigAir) { this.reward(v, `BIG AIR ${v.bigAir.toFixed(1)}s`, 0.12, { cr: 40 }); v.bigAir = 0; }
    if (v.formChanged) { v.trickMsg = v.formChanged === 'boat' ? 'WATER! ALL ABOARD' : 'BACK ON THE ROAD'; v.trickT = 1.8; audio.sfx('nitro'); v.formChanged = null; }
    if (v.trickT > 0) v.trickT -= dt;
    if (c.nitro && v.nitro > 0.05 && !v.wasBoost) audio.sfx('nitro'); v.wasBoost = c.nitro && v.nitro > 0.05;
    if (c.reset || v.wrongT > 6) { v.wrongT = 0; v.reset(T); }
    if (c.cam) { const vw = this.views.find(x => x.v === v); if (vw) vw.mode = (vw.mode + 1) % 3; }
    if (c.pause && !this.cfg.demo) this.game.togglePause();
    this.style(v, dt, gas);
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
    } else if (this.rule === 'knockdown') done = this.time >= KD_TIME;
    else if (this.rule === 'toxic') { const alive = vs.filter(v => !v.eliminated); done = alive.length <= 1 || this.time >= TOXIC_MAX || humans.every(v => v.eliminated); }
    else if (this.rule === 'catch') done = !!this.caughtBy || this.time >= CATCH_TIME;
    else if (this.rule === 'elim') {
      const alive = vs.filter(v => !v.eliminated);
      done = alive.length <= 1 || (!this.net && this.locals.length && this.locals.every(v => v.eliminated)) || humans.every(v => v.eliminated);
    } else done = this.time >= ORB_TIME;
    if (this.cfg.demo) { if (done) { this.over = true; this.endT = 1; this.results = []; } return; }
    if (done && this.isHost) {
      const res = this.ranking().map((v, i) => ({ id: v.id, name: v.name, type: v.type, pos: i + 1, time: v.finished ? v.finishTime : 0, score: v.score, out: v.eliminated, busted: !!v.busted, best: v.bestLap || 0, top: Math.round(v.topSpeed * 3.6), kills: v.kills || 0, mayhem: v.mayhem || 0, caught: v === this.caughtBy }));
      if (this.net) this.net.send({ t: 'end', results: res });
      this.finish(res);
    }
  }
  finish(results) { if (this.over) return; this.over = true; this.endT = 3; this.results = results; this.state = 'done'; for (const v of this.locals) { v.finished = true; } ui.banner('FINISH!'); }

  updateCamera(vw, dt, snap) {
    let v = vw.v;
    if (v.eliminated) { const alive = this.order ? this.order.find(o => !o.eliminated) : null; if (alive) v = alive; }
    const ay = v.alt + v.y * (v.air ? 1 : 0.6) + (v.ey || 0), airK = v.air ? 1.35 : 1;
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
      pos, total: this.racers.length, lapRule: this.lapRule && this.rule !== 'gates' || this.rule === 'gates', blur: Math.min(1, Math.max(0, (v.kmh - 170) / 170)) * 0.6 + (v.boosting ? 0.45 : 0) + (this.slow > 0 ? 0.3 : 0), hp: this.combat || v.hp < 99 ? v.hp : null, weapon: !this.combat ? '' : (wp ? WEAPONS[wp.type].name + (wp.ammo > 1 ? '  ×' + wp.ammo : '') : '— no weapon —'), bust: this.cops.length ? v.bustT / 2.5 : null, count: this.state === 'countdown' ? this.count : -1, lap: Math.min(this.laps, v.lapsDone + 1), laps: this.laps, kmh: v.kmh, nitro: v.nitro, boosting: v.boosting, clean: this.state === 'racing' && !v.finished ? (v.cleanT || 0) / CLEAN_TIME : -1, surge: v.padT > 0 || v.topBonusT > 0, time: this.time, big, msg, rule: this.rule,
      info: this.rule === 'knockdown' ? `TAKEDOWNS ${v.score}  ·  ${Math.max(0, Math.ceil(KD_TIME - this.time))}s` : this.rule === 'toxic' ? (v.toxic > 0 ? `YOU ARE TOXIC – PASS IT ON!  ${Math.ceil(v.toxic)}s` : `CLEAN  ·  ${alive} LEFT  ·  infections ${v.score}`) : this.rule === 'gates' ? `GATE POINTS ${v.score}  ·  combo ×${v.combo || 1}` : this.rule === 'catch' ? (this.caughtBy ? 'CAUGHT!' : `TARGET ${this.runner ? Math.round(Math.hypot(v.x - this.runner.x, v.z - this.runner.z)) : 0} m  ·  ${Math.max(0, Math.ceil(CATCH_TIME - this.time))}s`) : this.rule === 'elim' ? `KNOCKOUT IN ${Math.max(0, Math.ceil(this.elimAt - this.time))}s  ·  ${alive} LEFT` : this.rule === 'orbs' ? `ORBS ${v.score}  ·  ${Math.max(0, Math.ceil(ORB_TIME - this.time))}s` : this.rule === 'trial' ? (this.cfg.record ? 'RECORD ' + ui.fmtTime(this.cfg.record) : 'SET A LAP TIME') : this.rule === 'pursuit' ? `${this.cops.filter(c => !c.inactive && !c.block).length} COPS ON YOUR TAIL` : this.gates && this.rule !== 'orbs' && this.rule !== 'elim' ? `ALT ${Math.round(v.alt + v.y)} m  ·  GATES ${v.gatesHit || 0}/${this.gates.length * (this.lapRule ? this.laps : 1)}` : (this.heat[v.id] || 0) > this.time ? `WANTED!  POLICE ALERTED  ·  ${Math.ceil(this.heat[v.id] - this.time)}s` : '',
      danger: v.toxic > 0 || (this.heat[v.id] || 0) > this.time || this.rule === 'elim' && !v.eliminated && order.filter(x => !x.eliminated).pop() === v && alive > 1,
      board: this.views.length === 1 ? order : null, me: v, vehicles: this.vehicles, best: v.bestLap,
    });
  }

  updateAudio() {
    if (this.cfg.demo) return;
    let sk = 0;
    this.locals.forEach((v, i) => {
      const on = !v.eliminated && this.state !== 'done';
      audio.engine(i, on ? Math.abs(v.vf) / v.st.top : 0, on ? Math.max(v.input.gas, 0.15) : 0, v.boatForm ? 'boat' : v.kind, v.boosting);
      if (on && (v.drift || v.slip > 6) && Math.abs(v.vf) > 8) sk = Math.max(sk, 0.06 + v.slip * 0.012);
    });
    audio.skid(this.paused ? 0 : sk);
    // the nearest rival (or traffic car) is heard as it passes, louder the closer it is
    let rv = null, rd = 48; for (const o of this.vehicles) { if (o.type === 'local' || o.inactive || o.eliminated) continue; for (const l of this.locals) { const d = Math.hypot(o.x - l.x, o.z - l.z); if (d < rd) { rd = d; rv = o; } } }
    if (rv && !this.paused && this.state !== 'done') audio.engine(9, Math.abs(rv.vf) / rv.st.top, rv.input.gas || 0.6, rv.boatForm ? 'boat' : rv.kind, rv.boosting, (1 - rd / 48) ** 2 * 0.75); else audio.engine(9, 0, 0, rv ? rv.kind : this.kind, false, 0);
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
    if (this.dgGroup) { this.scene.remove(this.dgGroup); this.dgGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const cv = document.getElementById('game'); if (cv) cv.classList.remove('slowmo');
    this.world.dispose(); audio.silence(); ui.hudClear();
  }
}
function cfg_seed(c) { return (c.seed || 1) * 31 + c.track.length; }
export function viewRect(i, n) {
  if (n === 1) return { x: 0, y: 0, w: 1, h: 1 };
  if (n === 2) return { x: 0, y: i * 0.5, w: 1, h: 0.5 };
  return { x: (i % 2) * 0.5, y: Math.floor(i / 2) * 0.5, w: 0.5, h: 0.5 };
}
