// 11 v 11 match engine: ball physics, player control, team AI, goalkeepers, restarts, goals, penalties.
import * as THREE from 'three';
import { PL, PW, GW, GH, buildStadium } from './pitch.js';
import { makePlayer } from './assets.js';
import { FORMATION, DIFFS, squad, code } from './data.js';
import * as input from './input.js';
import * as audio from './audio.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v, R = Math.random;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const CL = ['Idle', 'Jog', 'Run', 'Sprint', 'Dribble', 'Pass', 'Shoot', 'Tackle', 'Fall', 'Celebrate', 'Header', 'ThrowIn', 'KeeperIdle', 'KeeperCatch', 'KeeperDiveLeft', 'KeeperDiveRight', 'KeeperThrow'];

export class Match {
  // cfg: { home, away (team objects), humans: [{ side: 0|1, device | remote }], half (minutes of real time), diff, night,
  //       mustWin (tie must be decided: extra time + penalties), agg (first-leg goals), net + role ('host'|'guest') for online, onEnd }
  constructor(game, cfg) {
    this.game = game; this.cfg = cfg; this.scene = game.scene; this.teams = [cfg.home, cfg.away]; this.score = [0, 0]; this.stats = [{ shots: 0, poss: 0 }, { shots: 0, poss: 0 }];
    this.net = cfg.net || null; this.role = cfg.role || 'local'; this.evq = []; this.agg = cfg.agg || [0, 0]; this.decider = !!cfg.mustWin; this.subsLeft = [5, 5]; this.bench = [[], []];
    const fwd = k => (...a) => { audio[k](...a); if (this.role === 'host') this.evq.push([k, ...a]); };
    this.A = Object.fromEntries(['say', 'sayTeam', 'sfx', 'cheer', 'chant', 'jingle', 'decisive', 'sting', 'chatter'].map(k => [k, fwd(k)]));
    this.stadium = buildStadium(this.scene, game.renderer, { night: cfg.night });
    this.halfLen = (cfg.half || 3) * 60; this.time = 0; this.half = 1; this.dir = [1, -1]; this.phase = 'intro'; this.phaseT = 6.5; this.k = DIFFS[cfg.diff || 'normal']; this.etLen = this.halfLen / 3;
    this.cam = new THREE.PerspectiveCamera(30, 1, 1, 600); this.camX = 0; this.camZ = 0; this.zoom = 0;
    this.ball = { x: 0, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0, owner: null, last: null, free: 0 };
    this.ballMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
    const sh = () => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; return m; };
    this.ballSh = sh(); this.ballSh.scale.setScalar(0.2); this.scene.add(this.ballMesh, this.ballSh);
    this.players = [];
    for (let t = 0; t < 2; t++) {
      const team = this.teams[t], names = squad(team), rate = team.rating, vs = [...team.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 16, kit = t === 1 && this.clash() ? [0xf2f2f2, 0x222222, 0xf2f2f2] : team.kit;
      FORMATION.forEach((f, i) => {
        const gk = i === 0, m = makePlayer(i + vs + t * 5, gk ? [team.gk, team.gk, team.gk] : kit, gk), s = sh(); s.scale.setScalar(0.42); m.root.add(s);
        const p = { t, i, gk, role: f[2], ax: f[0], az: f[1], x: 0, z: 0, vx: 0, vz: 0, face: 0, m, name: names[i].name, num: names[i].num, sta: 1, yel: 0, state: 'run', st: 0, cd: 0, human: -1, incoming: 0, think: R() * 0.3,
          spd: (6.6 + rate * 0.016 + (f[2] === 'FW' ? 0.35 : f[2] === 'DF' ? -0.1 : 0.15) + (R() - 0.5) * 0.3), skill: rate + (R() - 0.5) * 8 };
        p.baseSpd = p.spd; this.scene.add(m.root); this.players.push(p);
      });
      this.bench[t] = names.slice(11).map(n => ({ ...n, used: false }));
    }
    this.humans = (cfg.humans || []).map((h, n) => ({ ...h, n, sel: null, power: 0, charging: false }));
    const ring = (c) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 20), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; this.scene.add(m); return m; };
    this.HC = [0xffe14a, 0x35f0ff, 0xff6ad5, 0x7dff6a]; this.rings = this.humans.map((h, n) => ring(this.HC[n % 4])); this.tgtRing = ring(0xffffff); this.tgtRing.scale.setScalar(0.7);
    this.aimV = this.humans.map((h, n) => this.makeAim(this.HC[n % 4])); this.penRet = this.makePenRet();
    this.kickTeam = 0; this.setKickoff(0); this.msg = ''; this.msgT = 0; this.events = [];
    if (!cfg.demo) { audio.crowd(true); audio.music('walkout'); if (this.role !== 'guest') { this.A.chant(true); this.A.say('intro'); this.A.sayTeam(audio.teamKey(this.teams[0])); this.A.sayTeam(audio.teamKey(this.teams[1])); } }
    this.rec = []; this.press = 0;
    if (this.net) {
      this.remIn = null; this.remPrev = null; this.snapT = 0; this.inT = 0; this.snapN = 0;
      this.h = { in: m => { this.remIn = m.i; }, snap: m => { this.snap = m; }, ev: m => { for (const e of m.e) if (audio[e[0]]) audio[e[0]](...e.slice(1)); }, end: m => this.finishWith(m.r) };
      for (const k in this.h) this.net.on(k, this.h[k]);
    }
    if (cfg.demo) { this.phase = 'kickoff'; this.phaseT = 0.5; }
    if (cfg.pensOnly) { this.phase = 'full'; this.phaseT = 1.2; }
  }
  // ---------- aiming helpers: mouse -> pitch point, aim visuals, shot-angle read-out ----------
  makeAim(color) {
    const mat = o => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    const pivot = new THREE.Group(), line = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.26), mat(0.7)); line.rotation.x = -Math.PI / 2; pivot.add(line);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 3), mat(0.9)); head.rotation.z = -Math.PI / 2; head.rotation.y = Math.PI / 2; head.position.y = 0.02; pivot.add(head);
    const ret = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 24), mat(0.9)); ret.rotation.x = -Math.PI / 2;
    const rcv = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.15, 24), mat(0.95)); rcv.rotation.x = -Math.PI / 2;
    for (const o of [pivot, ret, rcv]) { o.visible = false; o.position.y = 0.07; this.scene.add(o); }
    return { pivot, line, head, ret, rcv };
  }
  makePenRet() {
    const mk = c => { const m = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })); m.rotation.y = Math.PI / 2; m.visible = false; this.scene.add(m); return m; };
    return { s: mk(0xffe14a), k: mk(0x35f0ff) };
  }
  aimWorld(a) { // normalised pointer position -> point on the pitch
    const c = this.cam, v = this._v || (this._v = new THREE.Vector3()); v.set(a.nx, a.ny, 0.5).unproject(c); const o = c.position, dy = v.y - o.y; if (dy > -1e-4) return null;
    const t = -o.y / dy; return { x: clamp(o.x + (v.x - o.x) * t, -PL - 10, PL + 10), z: clamp(o.z + (v.z - o.z) * t, -PW - 6, PW + 6) };
  }
  shotInfo(p) { // size of the goal mouth seen from p (degrees) and how much of it is not covered by defenders / the keeper
    const d = this.dir[p.t], dx = (d * PL - p.x) * d; if (dx < 2) return null;
    const aL = Math.atan2(-GW - p.z, dx), aR = Math.atan2(GW - p.z, dx), a0 = aR - aL, iv = [];
    for (const o of this.players) { if (o.t === p.t || o.off) continue; const ox = (o.x - p.x) * d; if (ox < 0.5 || ox > dx + 1) continue; const dd = Math.hypot(ox, o.z - p.z), c = Math.atan2(o.z - p.z, ox), w = Math.asin(Math.min(1, (o.gk ? 1.1 : 0.55) / dd)), lo = Math.max(aL, c - w), hi = Math.min(aR, c + w); if (hi > lo) iv.push([lo, hi]); }
    iv.sort((x, y) => x[0] - y[0]); let blocked = 0, end = -9; for (const [lo, hi] of iv) { const st = Math.max(lo, end); if (hi > st) { blocked += hi - st; end = Math.max(end, hi); } }
    return { deg: a0 * 180 / Math.PI, open: clamp(1 - blocked / a0, 0, 1), dist: dx };
  }
  updateAim() {
    const vis = this.phase === 'play' && !this.paused;
    this.humans.forEach((h, n) => {
      const a = this.aimV[n], p = h.sel;
      const show = vis && !h.remote && h.aim && p, has = show && this.ball.owner === p;
      a.pivot.visible = !!(show && has); a.ret.visible = !!show; a.rcv.visible = false;
      if (!show) return;
      const ax = h.aim.x, az = h.aim.z, dx = ax - p.x, dz = az - p.z, len = Math.max(0.5, Math.hypot(dx, dz) - 1.4);
      a.ret.position.set(ax, 0.07, az); a.ret.scale.setScalar(0.75 + (h.charging ? 0.35 * Math.sin(this.time * 20) : 0));
      if (has) { a.pivot.position.set(p.x, 0.07, p.z); a.pivot.rotation.y = -Math.atan2(dz, dx); a.line.scale.x = len; a.line.position.x = len / 2 + 0.7; a.head.position.x = len + 0.7 + 0.5;
        a.line.material.color.setHex(h.charging ? 0xff5a3a : this.HC[n % 4]); a.ret.material.color.setHex(h.charging ? 0xff5a3a : this.HC[n % 4]);
        let best = null, bd = 7.5; for (const m of this.players) { if (m.t !== p.t || m === p || m.off) continue; const q = Math.hypot(m.x - ax, m.z - az); if (q < bd) { bd = q; best = m; } }
        if (best && !h.charging) { a.rcv.visible = true; a.rcv.position.set(best.x, 0.06, best.z); } }
    });
    // penalty / shoot-out aim markers on the goal mouth
    const R2 = this.penRet; R2.s.visible = R2.k.visible = false;
    const st = this.phase === 'pens' && this.pens && this.pens.state === 'aim' ? { d: 1, a: this.pens, sh: this.humans.find(h => h.side === this.pens.turn), kh: this.humans.find(h => h.side === 1 - this.pens.turn) }
      : this.phase === 'penaim' && this.penAim ? { d: this.dir[this.penAim.p.t], a: this.penAim, sh: this.penAim.sh, kh: this.penAim.kh } : null;
    if (st) {
      const place = (m, f, hh) => { m.position.set(st.d * (PL - 0.15), hh ? 1.95 : 0.55, f * st.d * 2.9); m.visible = true; };
      if (st.sh && !st.kh) place(R2.s, st.a.aim, st.a.aimH);
      if (st.kh && !st.sh) place(R2.k, st.a.dive, st.a.diveH);
    }
  }
  clash() { const a = new THREE.Color(this.teams[0].kit[0]), b = new THREE.Color(this.teams[1].kit[0]); return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 0.5; }
  goalX(t) { return this.dir[t] * PL; }           // the goal team t attacks
  mates(t) { return this.players.filter(p => p.t === t); }
  fit(p) { return 0.85 + 0.15 * p.sta - (p.inj ? 0.18 : 0); }
  level() { return this.score[0] + this.agg[0] === this.score[1] + this.agg[1]; }
  halfEnd(h) { return h <= 2 ? this.halfLen * h : this.halfLen * 2 + this.etLen * (h - 2); }
  clockSec() { const H = this.halfLen * 2; return this.time <= H ? this.time / H * 5400 : 5400 + (this.time - H) / (this.etLen * 2) * 1800; }
  // controls of a local or remote (online) human
  readH(h) { if (!h.remote) return input.read(h.device); const r = this.remIn || input.ZERO, out = input.edges(r, this.remPrev); this.remPrev = r; return out; }

  setKickoff(t) {
    for (const p of this.players) { if (p.off) continue; const d = this.dir[p.t]; p.x = p.ax * PL * d * (p.ax > 0 ? 0.25 : 1) - (p.ax > 0 ? d * 6 : 0); p.z = p.az * PW; p.vx = p.vz = 0; p.face = d > 0 ? Math.PI / 2 : -Math.PI / 2; p.state = 'run'; p.st = 0; }
    const av = this.players.filter(p => p.t === t && !p.off && !p.gk).sort((a, b) => b.ax - a.ax || b.i - a.i), k = av[0], k2 = av[1]; k.x = -this.dir[t] * 0.4; k.z = 0; k2.x = -this.dir[t] * 0.6; k2.z = 3;
    Object.assign(this.ball, { x: 0, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0, owner: k, last: k }); this.kickTeam = t;
  }
  setPhase(p, t) { this.phase = p; this.phaseT = t; }
  say(text, t = 2.2) { this.msg = text; this.msgT = t; }

  // ---------- ball actions ----------
  release(p, cd = 0.4) { this.ball.owner = null; this.ball.last = p; p.cd = cd; this.ball.free = 0; }
  pass(p, dx, dz, through, aim) {
    const b = this.ball, d = this.dir[p.t]; let best = null, bs = 1e9; const l = Math.hypot(dx, dz), aimed = l > 0.3; if (!aimed) { dx = Math.sin(p.face); dz = Math.cos(p.face); } else { dx /= l; dz /= l; }
    for (const m of this.players) { if (m.t !== p.t || m === p || m.off) continue; const ex = m.x - p.x, ez = m.z - p.z, dd = Math.hypot(ex, ez); if (dd < 3 || dd > 46) continue; const cos = (ex * dx + ez * dz) / dd; if (cos < 0.25) continue; const s = (1 - cos) * 60 + dd * 0.35 + (m.gk ? 14 : 0) - (through ? (m.x - p.x) * d * 0.25 : 0); if (s < bs) { bs = s; best = m; } }
    if (aim) { best = null; let bd = 7.5; for (const m of this.players) { if (m.t !== p.t || m === p || m.off) continue; const q = Math.hypot(m.x - aim.x, m.z - aim.z); if (q < bd) { bd = q; best = m; } } }
    this.offP = null;
    if (best && !best.gk && !this.noOff) { const opp = this.players.filter(o => o.t !== p.t && !o.off).map(o => o.x * d).sort((x, y) => y - x), line = Math.max(opp[1] ?? 0, b.x * d, 0); if (best.x * d > line + 0.5) this.offP = best; }
    let tx, tz;
    if (best) { const lead = through ? 9 : 2.2; tx = best.x + best.vx * 0.5 + (through ? d * lead : 0); tz = best.z + best.vz * 0.5; best.incoming = this.time + 3; this.passTo = best; } else if (aim) { const q = Math.hypot(aim.x - p.x, aim.z - p.z) || 1, cap = Math.min(q, 40) / q; tx = p.x + (aim.x - p.x) * cap; tz = p.z + (aim.z - p.z) * cap; } else { tx = p.x + dx * 18; tz = p.z + dz * 18; }
    const ex = tx - p.x, ez = tz - p.z, dd = Math.hypot(ex, ez) || 1, err = (100 - p.skill) * 0.0025 * (R() - 0.5), sp = clamp(7.5 + dd * 0.78, 10, 27) * (through ? 1.08 : 1);
    const a = Math.atan2(ex, ez) + err; b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp; b.vy = dd > 26 ? 5.2 : through && aim && !best ? 3 + dd * 0.12 : 0.6; b.y = 0.12;
    p.face = a; p.m.play('Pass', 0.05, true, 1.5); p.state = 'kick'; p.st = 0.28; this.release(p); this.A.sfx('kick', 0.5);
  }
  shoot(p, power, aimZ, aim, curl, acc = 1) {
    const b = this.ball, gx = this.goalX(p.t), dgo = Math.abs(gx - p.x), skill = p.skill / 100, sg = Math.sign(gx); this.offP = null;
    let tgx = gx, hg = 0, direct = false, tzAim = null;
    if (aim) { if (aim.x * sg >= PL - 0.5) { tzAim = clamp(aim.z, -GW + 0.35, GW - 0.35); hg = clamp((Math.abs(aim.x) - PL) / 6, 0, 1); } else if ((aim.x - p.x) * sg > 3) { direct = true; tgx = aim.x; tzAim = aim.z; } }
    let tz = tzAim != null ? tzAim : clamp(aimZ * 3.3, -3.4, 3.4);
    tz += ((R() - 0.5) * (3.6 - skill * 1.8) * (0.7 + power) + (R() - 0.5) * dgo * 0.05) * (aim ? 0.7 : 1) * acc;
    const ex = tgx - p.x, ez = tz - p.z, dd = Math.hypot(ex, ez) || 1, sp = 17 + power * 15; let a = Math.atan2(ex, ez);
    b.curl = (curl || 0) * (0.55 + power * 0.8); a -= b.curl * 0.4;
    b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp; b.vy = tzAim != null && !direct && hg >= 0 && aim ? (1.2 + power * power * 6.5 * 0.8 + dd * 0.07) * (0.55 + 0.95 * hg) : 1.2 + power * power * 6.5 * (0.6 + R() * 0.7) + dd * 0.07; b.y = 0.14;
    p.face = a; p.m.play('Shoot', 0.05, true, 1.4); p.state = 'kick'; p.st = 0.35; this.release(p, 0.5); this.stats[p.t].shots++; this.shotBy = p; this.shotT = this.time; this.A.sfx('kick', 1);
    if (dgo < 30) { if (R() < 0.5) this.A.say('shot'); if (R() < 0.6) this.A.cheer('chance'); }
  }
  punt(p, dx, dz, power) { // goalkeeper kick out of the hands
    const b = this.ball, d = this.dir[p.t]; let ux = dx, uz = dz; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; if (ux * d < 0.25) { ux = d * 0.9; uz *= 0.5; const m = Math.hypot(ux, uz); ux /= m; uz /= m; }
    const sp = 14 + power * 14; b.vx = ux * sp; b.vz = uz * sp; b.vy = 6 + power * 7; b.y = 1.0; b.curl = 0; p.face = Math.atan2(ux, uz); p.m.play('Shoot', 0.05, true, 1.4); p.state = 'kick'; p.st = 0.4; this.release(p, 0.8); this.A.sfx('kick', 1);
  }
  loose(p, kx, kz) { const b = this.ball; b.vx = kx; b.vz = kz; b.vy = 1.5; this.release(p, 0.5); }
  tackle(p) { // slide tackle
    if (p.state !== 'run' || p.cd > 0) return; p.state = 'slide'; p.st = 0.62; p.cd = 1.1; p.m.play('Tackle', 0.05, true, 1.3);
    p.vx = Math.sin(p.face) * 10; p.vz = Math.cos(p.face) * 10;
  }

  // ---------- per-frame ----------
  update(dt) {
    if (this.role === 'guest') return this.guestUpdate(dt);
    this.step(dt);
    if (this.role === 'host') this.sendSnap(dt);
  }
  step(dt) {
    if (this.paused) return;
    this.stadium.update(dt);
    if (this.msgT > 0) this.msgT -= dt;
    const b = this.ball;
    if (this.phase === 'pens') { this.updatePens(dt); this.sync(dt); return; }
    if (this.phase === 'penaim') { this.updatePenAim(dt); this.sync(dt); return; }
    if (this.phase === 'replay') { this.updateReplay(dt); this.sync(dt); return; }
    if (this.phase !== 'play') {
      this.phaseT -= dt;
      if (this.phase === 'goal') this.celebrate(dt);
      else if (this.phase === 'half' || this.phase === 'full' || this.phase === 'intro') { for (const p of this.players) if (!p.off) this.anim(p, dt); }
      if (this.phase === 'intro') for (const h of this.humans) if (!h.remote && this.readH(h).passDown) this.phaseT = Math.min(this.phaseT, 0.2);
      if (this.phase === 'restart') { this.movePlayers(dt, true); }
      if (this.phaseT <= 0) this.nextPhase();
      this.sync(dt); return;
    }
    this.time += dt; this.stats[b.owner ? b.owner.t : (b.last ? b.last.t : 0)].poss += dt;
    if (this.time >= this.halfEnd(this.half) && !(Math.abs(b.x) > PL - 18 && b.owner)) { this.endHalf(); this.sync(dt); return; }
    this.recT = (this.recT || 0) - dt; if (this.recT <= 0) { this.recT = 0.05; this.rec.push([b.x, b.y, b.z, this.players.map(p => [+p.x.toFixed(2), +p.z.toFixed(2), +p.face.toFixed(2), CL.indexOf(p.m.current)])]); if (this.rec.length > 140) this.rec.shift(); }
    if (!this.cfg.demo) { const o = b.owner, hot = o && !o.gk && o.x * this.dir[o.t] > PL - 32; this.press = clamp(this.press + (hot ? dt : -dt * 1.5), -1, 4); if (this.press > 2.5 && !this.chanting) { this.chanting = true; this.A.chant(true); } else if (this.press < 0 && this.chanting) { this.chanting = false; this.A.chant(false); }
      if (this.role !== 'guest' && audio.quietFor() > 18000 && R() < dt * 0.25) this.A.chatter(); }
    const mn = this.minute(); if (mn !== this.lastMin) { this.lastMin = mn; if (mn >= 58 && mn % 4 === 0) this.aiSubs(); }
    this.humanInput(dt); this.movePlayers(dt, false); this.ballPhysics(dt); this.sync(dt);
  }

  nextPhase() {
    const ph = this.phase;
    if (ph === 'intro') { this.setPhase('kickoff', 1.2); this.A.chant(false); audio.music('off'); this.A.jingle(); this.A.say('kickoff'); this.A.sfx('whistle'); }
    else if (ph === 'kickoff' || ph === 'restart') { this.phase = 'play'; if (this.pendingSub) { const [t, o] = this.pendingSub; this.pendingSub = null; this.makeSub(t, o); } if (ph === 'restart' && this.restart) this.takeRestart(); }
    else if (ph === 'goal') { this.celeb = null; if (this.replay && this.replay.length > 30 && !this.cfg.demo) { this.phase = 'replay'; this.repT = 0; } else { this.setKickoff(this.concede); this.setPhase('kickoff', 1.4); this.A.sfx('whistle'); } }
    else if (ph === 'half') { this.half++; this.dir = this.half % 2 ? [1, -1] : [-1, 1]; this.setKickoff(this.half % 2 ? 0 : 1); this.setPhase('kickoff', 1.4); if (this.half === 2) this.A.say('secondhalf'); this.A.sfx('whistle'); for (const p of this.players) p.sta = Math.min(1, p.sta + 0.12); this.aiSubs(); }
    else if (ph === 'full') { if (this.decider && this.level()) this.startPens(); else this.finish(); }
  }
  endHalf() {
    this.A.sfx('whistle2'); for (const p of this.players) { p.vx = p.vz = 0; }
    if (this.half === 1 || this.half === 3) { this.say(this.half === 1 ? 'HALF TIME' : 'EXTRA TIME · HALF TIME', 3); this.setPhase('half', 3.2); if (this.half === 1) this.A.say('halftime', 'colour_halftime'); }
    else if (this.half === 2 && this.decider && this.level()) { this.say('EXTRA TIME', 3); this.setPhase('half', 3.4); this.A.say('extratime'); }
    else { this.say('FULL TIME', 3); this.setPhase('full', 3.4); this.A.say('fulltime', 'colour_fulltime'); this.A.chant(false); }
  }
  finish() {
    if (this.done) return; this.done = true; audio.crowd(false);
    const r = { score: this.score, pens: this.pens ? this.pens.score : null, stats: this.stats, events: this.events };
    const hs = this.humans.find(h => !h.remote), ws = r.pens ? (r.pens[0] > r.pens[1] ? 0 : 1) : this.score[0] + this.agg[0] > this.score[1] + this.agg[1] ? 0 : this.score[0] + this.agg[0] < this.score[1] + this.agg[1] ? 1 : -1;
    if (hs && ws === hs.side) this.A.decisive();
    if (this.role === 'host') { if (this.evq.length) this.net.send({ t: 'ev', e: this.evq }); this.evq = []; this.net.send({ t: 'end', r }); }
    this.cfg.onEnd && this.cfg.onEnd(r);
  }
  finishWith(r) { if (this.done) return; this.done = true; audio.crowd(false); this.cfg.onEnd && this.cfg.onEnd(r); }

  // ---------- discipline, injuries, substitutions, offside ----------
  sendOff(p) { p.off = true; p.state = 'off'; p.m.root.visible = false; p.x = p.z = 999; p.vx = p.vz = 0; if (this.ball.owner === p) this.ball.owner = null; for (const h of this.humans) if (h.sel === p) h.sel = null; }
  injure(o) { o.inj = true; this.events.push({ t: o.t, min: this.minute(), name: o.name, inj: 1 }); this.A.say('injury'); if (this.subsLeft[o.t] > 0 && this.bench[o.t].some(b => !b.used)) this.pendingSub = [o.t, o]; }
  makeSub(t, out, bi) {
    const bench = this.bench[t]; if (bi == null) bi = bench.findIndex(x => !x.used); const inn = bench[bi];
    if (!inn || inn.used || this.subsLeft[t] <= 0 || !out || out.off) return false;
    inn.used = true; this.subsLeft[t]--; const was = out.name; this.events.push({ t, min: this.minute(), name: inn.name, off: was, sub: 1 });
    Object.assign(out, { name: inn.name, num: inn.num, sta: 1, yel: 0, inj: false, skill: this.teams[t].rating + (R() - 0.5) * 8 }); out.spd = out.baseSpd;
    this.say(`SUBSTITUTION ${code(this.teams[t])}:  ${inn.name}  for  ${was}`, 2.6); this.A.say('sub'); return true;
  }
  aiSubs() { // computer-run teams bring on fresh legs from the hour mark
    if (this.cfg.demo) return; const m = this.minute();
    for (let t = 0; t < 2; t++) {
      if (this.humans.some(h => h.side === t)) continue; const made = 5 - this.subsLeft[t], allow = m >= 85 ? 5 : m >= 75 ? 4 : m >= 66 ? 3 : m >= 58 ? 2 : 0; if (made >= allow) continue;
      const tired = this.players.filter(p => p.t === t && !p.gk && !p.off).sort((a, b) => a.sta - b.sta)[0]; if (tired && tired.sta < 0.92) this.makeSub(t, tired);
    }
  }
  offside(p) { this.A.sfx('whistle'); this.A.say('offside'); this.setRestart('freekick', 1 - p.t, clamp(p.x, -PL + 1, PL - 1), clamp(p.z, -PW + 1, PW - 1)); this.say('OFFSIDE  –  ' + p.name, 2.2); }

  // which player each human controls
  pickSel(h, force) {
    const b = this.ball, mine = this.players.filter(p => p.t === h.side && !p.gk && !p.off && p.state !== 'down');
    if (b.owner && b.owner.t === h.side && !b.owner.gk && !this.humans.some(o => o !== h && o.n < h.n && o.sel === b.owner)) { h.sel = b.owner; return; }
    if (h.sel && !force && h.sel.human === h.n && this.time < (h.lock || 0)) return;
    let best = null, bd = 1e9; const tx = b.x + b.vx * 0.4, tz = b.z + b.vz * 0.4;
    for (const p of mine) { if (this.humans.some(o => o !== h && o.sel === p)) continue; if (force && p === h.sel) continue; const d = Math.hypot(p.x - tx, p.z - tz) - (this.passTo === p && p.t === h.side ? 30 : 0); if (d < bd) { bd = d; best = p; } }
    if (best) { h.sel = best; h.lock = this.time + (force ? 1.2 : 0.5); }
  }
  humanInput(dt) {
    const b = this.ball;
    for (const p of this.players) p.human = -1;
    for (const h of this.humans) {
      const c = this.readH(h); if (c.pauseDown && !h.remote) this.game.togglePause();
      const gkp = this.players.find(q => q.t === h.side && q.gk && !q.off);
      if (c.keeperDown && gkp) { h.gkMode = !h.gkMode; h.autoGk = false; if (!h.gkMode) h.sel = null; this.A.sfx('click'); }
      if (h.gkMode && !gkp) h.gkMode = false;
      if (h.gkMode && h.autoGk && Math.hypot(b.x - (-this.dir[h.side] * PL), b.z) > 38) h.gkMode = false;
      if (h.gkMode) h.sel = gkp; else this.pickSel(h, c.switchDown && !(b.owner && b.owner.t === h.side));
      let p = h.sel; h.aim = null; if (!p) continue;
      // aim point: mouse pointer on the pitch, or the right stick of a controller
      let aim = null; const sa = Math.hypot(c.ax || 0, c.az || 0);
      if (c.aim && !h.remote) aim = this.aimWorld(c.aim); else if (sa > 0.35) aim = { x: p.x + c.ax / sa * 22, z: p.z + c.az / sa * 22, stick: true };
      h.aim = aim; const has0 = b.owner === p;
      // left click on a team-mate (without the ball) switches to him
      if (aim && !aim.stick && c.mlDown && !has0 && !p.gk) { let best = null, bd = 4.5; for (const m of this.players) { if (m.t !== h.side || m.gk || m.off || m === p || this.humans.some(o => o !== h && o.sel === m)) continue; const q = Math.hypot(m.x - aim.x, m.z - aim.z); if (q < bd) { bd = q; best = m; } } if (best) { h.sel = best; h.lock = this.time + 3.5; p.human = -1; p = best; c.mlDown = false; } }
      if (c.mmDown) this.pickSel(h, true);
      p.human = h.n; h.info = null;
      if (p.diveT > 0) { p.diveT -= dt; if (p.diveT <= 0) p.diveZ = null; }
      if (p.state !== 'run') continue;
      const has = b.owner === p, sp = p.spd * this.fit(p) * (c.sprint ? 1.22 : 1) * (has ? 0.9 : 1), mag = Math.hypot(c.x, c.z);
      p.tvx = c.x * sp; p.tvz = c.z * sp; if (mag > 0.2) p.face = Math.atan2(c.x, c.z); p.sprinting = c.sprint && mag > 0.5;
      // direction for passes / shots: aimed point, else right stick, else left stick
      const dirX = aim ? aim.x - p.x : c.x, dirZ = aim ? aim.z - p.z : c.z, curl = -(c.curl || 0);
      let shotAim = aim && !aim.stick ? aim : null;
      if (aim && aim.stick) { const d = this.dir[p.t], gx = d * PL, k = aim.x - p.x; if (k * d > 0.5) { const zl = p.z + (aim.z - p.z) * ((gx - p.x) / k); if (Math.abs(zl) < GW * 2.6) shotAim = { x: gx, z: zl }; } }
      if (p.gk) { this.humanKeeper(h, p, c, aim, dirX, dirZ, has, dt); continue; }
      if (has) {
        const d = this.dir[p.t]; if ((this.goalX(p.t) - p.x) * d < 36) h.info = this.shotInfo(p);
        if (c.mlDown) { h.mlT = 0; h.mlOn = true; }
        if (h.mlOn && c.ml) { h.mlT += dt; if (h.mlT > 0.2 && !h.charging) { h.charging = true; h.byMouse = true; h.power = 0.12; } }
        const clickPass = h.mlOn && c.mlUp && !h.charging; if (c.mlUp) h.mlOn = false;
        if (c.passDown || clickPass) this.pass(p, dirX, dirZ, false, aim);
        else if (c.throughDown || c.mrDown) this.pass(p, dirX, dirZ, true, aim);
        else {
          if (c.shootDown) { h.charging = true; h.byMouse = false; h.power = 0.12; }
          const hold = h.byMouse ? c.ml : c.shoot, rel = h.byMouse ? c.mlUp : c.shootUp;
          if (h.charging && hold) h.power = Math.min(1, h.power + dt * 1.5);
          if (h.charging && (rel || h.power >= 1)) { const pw = h.power; h.charging = false; h.byMouse = false; h.power = 0; this.shoot(p, pw, aim ? 0 : c.z, shotAim, curl); }
        }
      } else {
        h.charging = false; h.power = 0; h.mlOn = false;
        if (c.mlDown || c.shootDown) this.tackle(p);
        else if (c.pass) { const tx = b.x + b.vx * 0.25 - p.x, tz = b.z + b.vz * 0.25 - p.z, l = Math.hypot(tx, tz) || 1; p.tvx = tx / l * sp * 1.12; p.tvz = tz / l * sp * 1.12; p.face = Math.atan2(tx, tz); } // hold pass = chase the ball
        else if (c.throughDown || c.mrDown) { const o = b.owner; if (o && o.t !== p.t && dist(o, p) < 1.9) this.standTackle(p, o); }
      }
    }
  }
  // human-controlled goalkeeper: move inside the area, dive with Shoot / left-click, distribute with Pass / click / hold-Shoot (long kick)
  humanKeeper(h, p, c, aim, dirX, dirZ, has, dt) {
    const b = this.ball, d = this.dir[p.t], gl = -d * PL, depth = (p.x - gl) * d;
    if (depth > 17 && p.tvx * d > 0) p.tvx = 0; if (depth < 0.5 && p.tvx * d < 0) p.tvx = 0; if (Math.abs(p.z) > 21 && p.tvz * Math.sign(p.z) > 0) p.tvz = 0;
    if (has) {
      if (c.mlDown) { h.mlT = 0; h.mlOn = true; }
      if (h.mlOn && c.ml) { h.mlT += dt; if (h.mlT > 0.2 && !h.charging) { h.charging = true; h.byMouse = true; h.power = 0.2; } }
      const click = h.mlOn && c.mlUp && !h.charging; if (c.mlUp) h.mlOn = false;
      if (c.passDown || click || c.throughDown || c.mrDown) { p.m.play('KeeperThrow', 0.05, true, 1.3); this.pass(p, dirX, dirZ, !!(c.throughDown || c.mrDown), aim); }
      else { if (c.shootDown) { h.charging = true; h.byMouse = false; h.power = 0.2; }
        const hold = h.byMouse ? c.ml : c.shoot, rel = h.byMouse ? c.mlUp : c.shootUp; if (h.charging && hold) h.power = Math.min(1, h.power + dt * 1.4);
        if (h.charging && (rel || h.power >= 1)) { const pw = h.power; h.charging = false; h.byMouse = false; h.power = 0; this.punt(p, dirX, dirZ, pw); } }
      return;
    }
    h.charging = false; h.power = 0; h.mlOn = false;
    if ((c.shootDown || c.mlDown || c.passDown) && !(p.diveT > 0)) this.keeperDive(p, aim && !aim.stick ? Math.sign(aim.z - p.z) * (Math.abs(aim.z - p.z) > 0.8 ? 1 : 0) : Math.abs(c.z) > 0.25 ? Math.sign(c.z) : Math.sign(b.z - p.z));
  }
  keeperDive(p, dz) {
    if (!dz) dz = Math.sign(this.ball.z - p.z) || 1; const d = this.dir[p.t];
    p.diveZ = clamp(p.z + dz * 2.4, -GW - 0.6, GW + 0.6); p.diveT = 0.8; p.vz = dz * 7; p.vx = 0;
    p.m.play(dz * d > 0 ? 'KeeperDiveLeft' : 'KeeperDiveRight', 0.05, true, 1.4); p.state = 'kick'; p.st = 0.8;
  }
  standTackle(p, o) {
    if (p.cd > 0) return; p.cd = 0.7; const win = 0.5 + (p.skill - o.skill) / 150 + (p.human >= 0 ? 0.12 : (this.k - 0.95) * 1.2);
    if (R() < win) { this.ball.owner = p; this.ball.last = p; this.offP = null; o.cd = 0.6; o.state = 'stun'; o.st = 0.35; if (R() < 0.3) this.A.say('tackle'); } else { p.state = 'stun'; p.st = 0.4; if (p.human < 0 && R() < 0.16) { o.state = 'down'; o.st = 0.9; o.m.play('Fall', 0.05, true, 1.5); this.foul(p, o); } }
  }

  // AI decisions + movement integration for everyone
  movePlayers(dt, frozen) {
    const b = this.ball, own = b.owner, bx = b.x + b.vx * 0.35, bz = b.z + b.vz * 0.35;
    for (let t = 0; t < 2; t++) {
      const d = this.dir[t], team = this.mates(t), assist = this.humans.some(h => h.side === t), has = own && own.t === t, opp = this.players.filter(p => p.t !== t);
      // nearest two outfield players to the ball (pressers / chasers)
      let n1 = null, n2 = null, d1 = 1e9, d2 = 1e9;
      for (const p of team) { if (p.gk || p.state !== 'run') continue; const dd = Math.hypot(p.x - bx, p.z - bz) - (p.incoming > this.time ? 12 : 0); if (dd < d1) { n2 = n1; d2 = d1; n1 = p; d1 = dd; } else if (dd < d2) { n2 = p; d2 = dd; } }
      const push = has ? 0.3 : -0.08;
      for (const p of team) {
        if (p.off) continue;
        if (p.cd > 0) p.cd -= dt;
        if (p.state !== 'run') { p.st -= dt; if (p.state === 'slide') { p.vx *= 1 - 2.2 * dt; p.vz *= 1 - 2.2 * dt; this.slideHit(p); } else if (p.state !== 'kick') { p.vx *= 1 - 6 * dt; p.vz *= 1 - 6 * dt; } if (p.st <= 0) p.state = 'run'; p.x += p.vx * dt; p.z += p.vz * dt; this.anim(p, dt); continue; }
        if (p.human < 0 || frozen) {
          let tx, tz, sp = p.spd * this.fit(p) * (p.human >= 0 ? 1 : this.k);
          if (p.gk) [tx, tz, sp] = this.keeperTarget(p, sp);
          else if (own === p && !frozen) { [tx, tz] = this.carrierAI(p, opp, dt); sp *= 0.9; }
          else if (!frozen && !has && (p === n1 || (p === n2 && (!own || assist)))) { tx = bx; tz = bz; sp *= 1.08; if (own && own.t !== t && dist(p, own) < 1.5 && p.cd <= 0 && R() < dt * (2.2 + (this.k - 0.9) * 8)) this.standTackle(p, own); }
          else if (!frozen && p.incoming > this.time && !own) { tx = bx; tz = bz; sp *= 1.1; }
          else { // hold shape, shifted with the ball
            tx = p.ax * PL * d + (b.x - 0) * 0.42 + push * PL * d * (p.role === 'DF' ? 0.5 : 1); tz = p.az * PW * 0.92 + b.z * 0.22;
            if (has && p.role === 'FW') tx = Math.max(tx * d, Math.min(PL - 14, (own.x * d) + 12)) * d;
            if (!has && p.role === 'DF') { tx = Math.min(tx * d, b.x * d - 4) * d; tx = Math.max(tx * d, -PL + 13) * d; }
            tx = clamp(tx, -PL + 2, PL - 2); tz = clamp(tz, -PW + 1.5, PW - 1.5);
          }
          const ex = tx - p.x, ez = tz - p.z, l = Math.hypot(ex, ez);
          if (l > 0.6) { const k = Math.min(1, l / 2.5); p.tvx = ex / l * sp * k; p.tvz = ez / l * sp * k; if (l > 1.2) p.face = Math.atan2(ex, ez); } else { p.tvx = p.tvz = 0; if (!p.gk) p.face = Math.atan2(b.x - p.x, b.z - p.z); }
          p.sprinting = l > 8;
        }
        const acc = Math.min(1, 9 * dt); p.vx += ((p.tvx || 0) - p.vx) * acc; p.vz += ((p.tvz || 0) - p.vz) * acc;
        p.x = clamp(p.x + p.vx * dt, -PL - 3, PL + 3); p.z = clamp(p.z + p.vz * dt, -PW - 3, PW + 3);
        if (!frozen) p.sta = Math.max(0, p.sta - dt * (p.sprinting ? 0.5 : 0.12) / (this.halfLen * 2));
        this.anim(p, dt);
      }
    }
    // keep players from standing inside each other
    const P = this.players; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], c = P[j], dx = c.x - a.x, dz = c.z - a.z, dd = dx * dx + dz * dz; if (dd < 0.36 && dd > 1e-6) { const l = Math.sqrt(dd), o = (0.6 - l) / 2; a.x -= dx / l * o; a.z -= dz / l * o; c.x += dx / l * o; c.z += dz / l * o; } }
  }
  slideHit(p) {
    const b = this.ball, o = b.owner; if (p.hit) { if (p.st <= 0.05) p.hit = false; return; }
    if (Math.hypot(b.x - p.x, b.z - p.z) < 1.15 && b.y < 0.8) { p.hit = true; if (o && o.t !== p.t) { o.state = 'down'; o.st = 0.9; o.m.play('Fall', 0.05, true, 1.5); const behind = Math.sin(p.face) * Math.sin(o.face) + Math.cos(p.face) * Math.cos(o.face) > 0.55; if (behind && R() < 0.6) return this.foul(p, o); if (R() < 0.35) this.A.say('tackle'); } if (!o || o.t !== p.t) this.loose(p, Math.sin(p.face) * 7 + (R() - 0.5) * 3, Math.cos(p.face) * 7 + (R() - 0.5) * 3); }
  }
  foul(p, o) {
    this.A.sfx('whistle'); const d = this.dir[o.t], box = o.x * d > PL - 16.5 && Math.abs(o.z) < 20.16, r = R(); let card = null;
    if (r < 0.05) card = 'red'; else if (r < 0.42) { p.yel++; card = p.yel >= 2 ? 'red' : 'yellow'; }
    if (card) this.events.push({ t: p.t, min: this.minute(), name: p.name, card: card === 'red' ? (p.yel >= 2 ? 'YR' : 'R') : 'Y' });
    if (box) this.setRestart('penalty', o.t, d * (PL - 11), 0); else this.setRestart('freekick', o.t, clamp(o.x, -PL + 1, PL - 1), clamp(o.z, -PW + 1, PW - 1));
    if (card === 'red') { this.sendOff(p); this.A.say('red'); } else if (card) this.A.say('yellow'); else this.A.say(box ? 'penalty' : 'foul', 'colour_foul');
    this.say(`${box ? 'PENALTY!' : 'FOUL!'}${card ? `   ${card === 'red' ? 'RED CARD' : 'YELLOW CARD'}  –  ${p.name}` : ''}`, 2.6);
    if (!o.gk && R() < 0.1) this.injure(o);
  }

  carrierAI(p, opp, dt) {
    const b = this.ball, d = this.dir[p.t], gx = this.goalX(p.t), dg = Math.hypot(gx - p.x, p.z);
    let near = 1e9, nx = 0, nz = 0; for (const o of opp) { const dd = dist(o, p); if (dd < near && (o.x - p.x) * d > -1.5) { near = dd; nx = o.x - p.x; nz = o.z - p.z; } }
    p.think -= dt;
    if (p.think <= 0 && p.cd <= 0) {
      p.think = 0.22 + R() * 0.2;
      if (p.gk) { this.pass(p, d, (R() - 0.5), false); return [p.x, p.z]; }
      if (dg < 13 || (dg < 23 && Math.abs(p.z) < 12 && R() < 0.22 + (this.k - 0.9))) { this.shoot(p, 0.4 + R() * 0.5, (R() < 0.5 ? -1 : 1) * (0.2 + R() * 0.75)); return [p.x, p.z]; }
      if (near < 3.2 || R() < 0.1) { // pass to the best open, more advanced team-mate
        let best = null, bs = -1e9; for (const m of this.players) { if (m.t !== p.t || m === p || m.gk || m.off) continue; const dd = dist(m, p); if (dd < 5 || dd > 34) continue; let open = 99; for (const o of opp) open = Math.min(open, dist(o, m)); const s = (m.x - p.x) * d * 0.9 + Math.min(open, 9) * 1.6 - dd * 0.15 + R() * 4; if (s > bs) { bs = s; best = m; } }
        if (best && (bs > 4 || near < 2)) { this.pass(p, best.x - p.x, best.z - p.z, (best.x - p.x) * d > 8 && R() < 0.5); return [p.x, p.z]; }
      }
    }
    // dribble at goal, swerving away from the closest defender in front
    let tx = gx, tz = clamp(p.z * 0.6, -8, 8); if (near < 6) { const side = (nz >= 0 ? -1 : 1); tz = p.z + side * 7; tx = p.x + d * 6; }
    return [clamp(tx, -PL + 1, PL - 1), clamp(tz, -PW + 2, PW - 2)];
  }

  keeperTarget(p, sp) {
    const b = this.ball, d = this.dir[p.t], gx = -d * PL, own = b.owner;
    if (own === p) { p.hold = (p.hold || 0) + 0.016; if (p.hold > 1.1) { p.hold = 0; p.m.play('KeeperThrow', 0.1, true, 1.3); this.pass(p, d, (R() - 0.5) * 1.4, false); } return [p.x, p.z, 0]; } p.hold = 0;
    const toGoal = (b.vx * -d) > 6, tHit = toGoal ? (gx - b.x) / b.vx : 9;
    if (toGoal && tHit > 0 && tHit < 1.6 && !own) { const pz = b.z + b.vz * tHit; if (Math.abs(pz) < GW + 2) { p.diveZ = pz; return [gx + d * 1.0, clamp(pz, -GW - 0.5, GW + 0.5), 7.5 * this.k + (p.skill - 75) * 0.03]; } }
    p.diveZ = null;
    const bd = Math.hypot(b.x - gx, b.z); if (!own && bd < 15 && Math.abs(b.z) < 18 && Math.hypot(b.vx, b.vz) < 9) return [b.x, b.z, sp * 1.1]; // come and collect
    const k = clamp(3.2 / Math.max(bd, 4), 0, 0.8); return [gx + d * 1.2 + (b.x - gx) * k * 0.5, clamp(b.z * k * 1.6, -GW + 0.6, GW - 0.6), sp * 0.8];
  }

  ballPhysics(dt) {
    const b = this.ball;
    if (b.owner) { const o = b.owner; if (o.state === 'down') { this.loose(o, (R() - 0.5) * 5, (R() - 0.5) * 5); return; } const tx = o.x + Math.sin(o.face) * 0.62, tz = o.z + Math.cos(o.face) * 0.62, k = Math.min(1, 16 * dt); b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.y = o.gk ? 1.0 : 0.11; b.vx = o.vx; b.vz = o.vz; b.vy = 0; b.curl = 0; if (this.passTo === o) this.passTo = null; }
    else {
      b.free += dt; b.vy -= 22 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.curl) { if (b.y > 0.2) { const ca = b.curl * dt, cs = Math.cos(ca), sn = Math.sin(ca), vx = b.vx; b.vx = vx * cs + b.vz * sn; b.vz = -vx * sn + b.vz * cs; b.curl *= Math.exp(-0.9 * dt); } else b.curl = 0; }
      if (b.y < 0.11) { b.y = 0.11; if (b.vy < -2.5) { b.vy = -b.vy * 0.5; } else b.vy = 0; const f = Math.exp(-0.75 * dt); b.vx *= f; b.vz *= f; }
      const sp = Math.hypot(b.vx, b.vz);
      // goal frame + goal check
      for (const s of [-1, 1]) {
        if ((b.x - s * PL) * s > 0 && (b.x - b.vx * dt - s * PL) * s <= 0) {
          if (Math.abs(b.z) < GW - 0.08 && b.y < GH - 0.05) { const g = this.players.find(p => p.gk && !p.off && this.dir[p.t] === -s), sp0 = Math.hypot(b.vx, b.vz); if (g && g.cd <= 0 && Math.abs(b.z - g.z) < 1.75 * this.kReach(g) && b.y < 2.3 && R() < 0.8) { b.vx = -s * (3 + R() * 4); b.vz = (b.z > g.z ? 1 : -1) * (5 + R() * 6); b.vy = 2 + R() * 3; b.x = s * PL - s * 0.5; g.cd = 0.7; b.last = g; g.m.play(b.z * this.dir[g.t] > g.z * this.dir[g.t] ? 'KeeperDiveLeft' : 'KeeperDiveRight', 0.05, true, 1.4); g.state = 'kick'; g.st = 0.8; this.A.say('save', 'colour_save'); this.A.cheer('near'); return; } return this.goal(s); }
          if (Math.abs(Math.abs(b.z) - GW) < 0.22 && b.y < GH + 0.15 || (Math.abs(b.z) < GW && Math.abs(b.y - GH) < 0.2)) { b.vx = -b.vx * 0.55; b.vz += (R() - 0.5) * 6; b.x = s * PL - s * 0.2; this.A.sfx('post'); this.A.say('post', 'colour_post'); this.A.cheer('near'); return; }
        }
      }
      // keeper saves
      for (const g of this.players) { if (!g.gk || g.cd > 0 || g.off) continue; const dx = b.x - g.x, dz = b.z - g.z, reach = g.diveZ != null ? 2.1 * this.kReach(g) : 0.95;
        if (Math.abs(dx) < 0.9 && Math.abs(dz) < reach && b.y < 2.45 && (b.last ? b.last.t !== g.t || b.free > 0.5 : true)) {
          if (g.diveZ != null && Math.abs(dz) > 0.7) { g.m.play(dz * this.dir[g.t] > 0 ? 'KeeperDiveLeft' : 'KeeperDiveRight', 0.05, true, 1.4); g.state = 'kick'; g.st = 0.8; g.z += Math.sign(dz) * Math.min(1.2, Math.abs(dz)); }
          if (sp < 19 || R() < 0.45) { b.owner = g; b.last = g; this.offP = null; g.m.play('KeeperCatch', 0.05, true, 1.2); if (sp > 12) { this.A.say(R() < 0.5 ? 'save' : 'catch', 'colour_save'); this.A.cheer('near'); } }
          else { b.vx = -b.vx * 0.35 + (R() - 0.5) * 5; b.vz = (R() < 0.5 ? -1 : 1) * (6 + R() * 6); b.vy = 3 + R() * 3; g.cd = 0.6; b.last = g; this.A.say('save', 'colour_save'); this.A.cheer('near'); }
          return;
        } }
      // players pick up / control the ball
      if (b.y < 1.5) { let best = null, bd = 0.95; for (const p of this.players) { if (p.cd > 0 || p.gk || p.off || p.state === 'down' || p.state === 'stun') continue; const dd = Math.hypot(p.x - b.x, p.z - b.z); if (dd < bd) { bd = dd; best = p; } }
        if (best && !(b.last === best && b.free < 0.35)) { if (sp > 24 && R() < 0.5) { b.vx = -b.vx * 0.3 + (R() - 0.5) * 6; b.vz = b.vz * 0.3 + (R() - 0.5) * 6; best.cd = 0.5; } else { if (this.offP) { const o = this.offP; this.offP = null; if (o === best) return this.offside(best); } b.owner = best; b.last = best; best.incoming = 0; } } }
      // out of play
      if (Math.abs(b.z) > PW + 0.2) { const t = b.last ? 1 - b.last.t : 0; this.A.sfx('whistle'); this.setRestart('throw', t, clamp(b.x, -PL + 1, PL - 1), Math.sign(b.z) * PW); }
      else if (Math.abs(b.x) > PL + 0.2) { const s = Math.sign(b.x), def = this.dir[0] === -s ? 0 : 1, lastT = b.last ? b.last.t : def; this.A.sfx('whistle');
        if (this.shotBy && this.time - this.shotT < 3) { this.A.say('miss'); this.A.cheer('near'); this.shotBy = null; }
        if (lastT === def) { this.A.say('corner'); this.setRestart('corner', 1 - def, s * (PL - 0.4), Math.sign(b.z || 1) * (PW - 0.4)); } else this.setRestart('goalkick', def, s * (PL - 5.5), 0); }
    }
  }
  kReach(g) { return clamp(0.86 + (g.skill - 70) * 0.012 + (this.k - 0.95) * 0.8 * (this.humans.some(h => h.side === g.t) ? -1 : 1), 0.5, 1.2); }

  goal(s) {
    const t = this.dir[0] === s ? 0 : 1, sc = this.ball.last && this.ball.last.t === t ? this.ball.last : this.players.find(p => p.t === t && !p.off && !p.gk); this.offP = null;
    this.score[t]++; this.concede = 1 - t; this.events.push({ t, min: this.minute(), name: sc.name });
    this.say(`GOAL!  ${sc.name}  ${this.minute()}'`, 4.4); this.setPhase('goal', 5.2); this.zoom = 1;
    this.replay = this.rec.slice(-100); this.rec = []; this.celeb = { p: sc, t: 0, tx: this.goalX(t) * 0.93, tz: Math.sign(sc.z || 1) * (PW - 4) };
    for (const p of this.players) { p.vx = p.vz = 0; p.tvx = p.tvz = 0; if (p.t === t) p.m.play('Celebrate', 0.2); else p.m.play('Idle', 0.3); }
    Object.assign(this.ball, { vx: this.ball.vx * 0.2, vz: 0, vy: 0, owner: null });
    this.A.cheer('goal'); this.A.sting('goal'); this.A.say(R() < 0.45 ? 'goal_pro' : 'goal', 'colour_goal'); this.A.sayTeam(audio.teamKey(this.teams[t]));
  }
  minute() { const H = this.halfLen * 2; return this.time <= H ? Math.min(90, Math.floor(this.time / H * 90) + 1) : 90 + Math.min(30, Math.floor((this.time - H) / (this.etLen * 2) * 30) + 1); }

  setRestart(type, t, x, z) {
    const b = this.ball; Object.assign(b, { x, z, y: 0.11, vx: 0, vy: 0, vz: 0, owner: null }); this.restart = { type, t }; this.passTo = null; this.offP = null;
    if (type === 'penalty') {
      const d = this.dir[t], tk = this.players.filter(p => p.t === t && !p.gk && !p.off).sort((a, c) => c.skill - a.skill)[0]; this.restart.taker = tk; tk.x = x - d * 1.2; tk.z = 0; tk.vx = tk.vz = 0; tk.state = 'run';
      for (const p of this.players) { if (p === tk || p.off) continue; if (p.gk && p.t !== t) { p.x = d * (PL - 0.3); p.z = 0; continue; } if (p.x * d > PL - 19) p.x = d * (PL - 20 - R() * 4); }
      this.say('PENALTY!', 1.8); this.setPhase('restart', 2.2); return;
    }
    let taker = null, bd = 1e9; for (const p of this.players) { if (p.t !== t || p.off || (type !== 'goalkick' && p.gk) || (type === 'goalkick' && !p.gk)) continue; const dd = Math.hypot(p.x - x, p.z - z); if (dd < bd) { bd = dd; taker = p; } }
    this.restart.taker = taker; taker.x = x - Math.sign(x || 1) * (type === 'throw' ? 0 : 0.5) * (type === 'corner' ? -1 : 1); taker.z = z + (type === 'throw' ? Math.sign(z) * 0.6 : 0); taker.vx = taker.vz = 0; taker.state = 'run';
    for (const p of this.players) if (p.t !== t && Math.hypot(p.x - x, p.z - z) < 7) { const a = Math.atan2(p.x - x, p.z - z); p.x = clamp(x + Math.sin(a) * 7.5, -PL, PL); p.z = clamp(z + Math.cos(a) * 7.5, -PW, PW); }
    this.say({ throw: 'THROW-IN', corner: 'CORNER', goalkick: 'GOAL KICK', freekick: 'FREE KICK' }[type], 1.4); this.setPhase('restart', 1.5); this.aiSubs();
  }
  takeRestart() {
    const r = this.restart, p = r.taker, b = this.ball, d = this.dir[p.t]; this.restart = null; b.owner = p; b.last = p; p.face = Math.atan2(-b.x * 0.2 + d * 10, -b.z);
    const human = this.humans.find(h => h.side === p.t);
    if (r.type === 'penalty') { b.x = d * (PL - 11); b.z = 0; b.y = 0.11; p.x = b.x - d * 0.7; p.z = 0; p.face = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      const kh = this.humans.find(h => h.side === 1 - p.t), kp = this.players.find(q => q.t === 1 - p.t && q.gk && !q.off);
      if ((human || kh) && kp) { b.owner = null; if (kh) { kh.gkMode = true; kh.autoGk = true; kh.sel = kp; } kp.x = d * (PL - 0.3); kp.z = 0; kp.vx = kp.vz = 0; kp.m.play('KeeperIdle', 0.2); p.m.play('Idle', 0.2); this.penAim = { p, kp, sh: human, kh, aim: 0, aimH: 0, dive: 0, diveH: 0, t: 4 }; this.phase = 'penaim'; this.say('PENALTY', 1.5); return; }
      const c = human ? this.readH(human) : null; const aim = c ? (c.z > 0.35 ? 1 : c.z < -0.35 ? -1 : 0) : Math.floor(R() * 3) - 1; this.shoot(p, 0.75, aim); return; }
    if (r.type === 'corner') { b.owner = null; const gx = this.goalX(p.t); const ex = gx - d * 9 - b.x, ez = (R() - 0.5) * 8 - b.z, l = Math.hypot(ex, ez); b.vx = ex / l * 21; b.vz = ez / l * 21; b.vy = 9; p.cd = 1; p.m.play('Shoot', 0.05, true, 1.4); this.A.sfx('kick', 1); }
    else if (r.type === 'goalkick') { b.owner = null; b.vx = d * (19 + R() * 4); b.vz = (R() - 0.5) * 14; b.vy = 11; p.cd = 1; p.m.play('Shoot', 0.05, true, 1.4); this.A.sfx('kick', 1); }
    else if (!human) { this.noOff = r.type === 'throw'; this.pass(p, d * 0.6, -Math.sign(b.z || 1), false); this.noOff = false; } else if (r.type === 'throw') p.m.play('ThrowIn', 0.05, true, 1.3);
  }

  // reads a penalty aim / dive choice from a human: mouse position over the goal, or stick left-right (+ up/down for height)
  penRead(h, st, ka, kh) {
    const c = this.readH(h);
    if (c.aim) { st[ka] = c.aim.nx < -0.08 ? -1 : c.aim.nx > 0.08 ? 1 : 0; st[kh] = c.aim.ny > 0.02 ? 1 : 0; }
    else { if (Math.abs(c.x) > 0.4 || Math.abs(c.z) > 0.4) { st[ka] = Math.abs(c.x) > 0.4 ? Math.sign(c.x) : 0; if (c.z < -0.4) st[kh] = 1; else if (c.z > 0.4) st[kh] = 0; } else if (Math.abs(c.ax || 0) > 0.4 || Math.abs(c.az || 0) > 0.4) { st[ka] = Math.abs(c.ax) > 0.4 ? Math.sign(c.ax) : 0; st[kh] = c.az < -0.4 ? 1 : 0; } }
    return c;
  }
  updatePenAim(dt) {
    const A = this.penAim, b = this.ball, d = this.dir[A.p.t]; A.t -= dt;
    for (const q of this.players) if (!q.off) { this.anim(q, dt); }
    if (A.sh) { const c = this.penRead(A.sh, A, 'aim', 'aimH'); if (c.shootDown || c.passDown || c.mlDown) A.t = Math.min(A.t, 0); }
    if (A.kh) this.penRead(A.kh, A, 'dive', 'diveH');
    if (A.t > 0) return;
    this.penAim = null; this.phase = 'play';
    if (!A.sh) { A.aim = Math.floor(R() * 3) - 1; A.aimH = R() < 0.35 ? 1 : 0; }
    if (!A.kh) { A.dive = 0; } else if (A.kh.gkMode) { A.kh.sel = A.kp; }
    const tz = A.aim * 2.9 * d, hg = A.aimH ? 0.85 : 0;
    this.shoot(A.p, 0.8, 0, { x: d * (PL + hg * 6), z: tz }, 0, 0.3);
    if (A.kh) { if (A.dive) { this.keeperDive(A.kp, A.dive * d); A.kp.diveZ = clamp(A.dive * d * 2.9, -GW - 0.6, GW + 0.6); } else { A.kp.diveZ = 0; A.kp.diveT = 0.8; } }
  }

  // ---------- penalty shoot-out ----------
  startPens() { this.pens = { score: [0, 0], n: [0, 0], turn: 0, state: 'aim', t: 3.2, log: [[], []] }; this.phase = 'pens'; this.say('PENALTY SHOOT-OUT', 2.5); this.A.say('shootout'); this.setupPen(); }
  setupPen() {
    const P = this.pens, t = P.turn, gx = PL, k = this.players.find(p => p.t === 1 - t && p.gk && !p.off) || this.players.find(p => p.t === 1 - t && !p.off), tk = this.players.filter(p => p.t === t && !p.off && p !== k && !p.gk).sort((a, c) => c.skill - a.skill), s = tk[P.n[t] % tk.length];
    for (const p of this.players) { if (p === k || p === s || p.off) continue; p.x = -4 + (p.i % 6) * 1.6; p.z = (p.t ? 6 : -6) - Math.floor(p.i / 6) * 1.5; p.vx = p.vz = 0; p.face = Math.PI / 2; p.m.play('Idle', 0.3); }
    k.x = gx - 0.4; k.z = 0; k.face = -Math.PI / 2; k.m.play('KeeperIdle', 0.2); s.x = gx - 13.2; s.z = 0; s.face = Math.PI / 2; s.m.play('Idle', 0.2);
    Object.assign(this.ball, { x: gx - 11, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0, owner: null }); P.k = k; P.s = s; P.state = 'aim'; P.t = 3.4; P.aim = 0; P.dive = 0; P.aimH = 0; P.diveH = 0;
  }
  updatePens(dt) {
    const P = this.pens, b = this.ball, sh = this.humans.find(h => h.side === P.turn), kh = this.humans.find(h => h.side === 1 - P.turn); P.t -= dt;
    if (P.state === 'aim') {
      if (sh) { const c = this.penRead(sh, P, 'aim', 'aimH'); if (c.shootDown || c.passDown || c.mlDown) P.t = 0; }
      if (kh) this.penRead(kh, P, 'dive', 'diveH');
      if (P.t <= 0) {
        if (!sh) { P.aim = Math.floor(R() * 3) - 1; P.aimH = R() < 0.35 ? 1 : 0; } if (!kh) { P.dive = R() < 0.72 ? Math.floor(R() * 3) - 1 : P.aim; P.diveH = R() < 0.5 ? P.aimH : (R() < 0.5 ? 1 : 0); }
        const miss = R() < 0.07, saved = !miss && P.dive === P.aim && R() < (P.aim === 0 ? 0.9 : 0.72) * (P.diveH === P.aimH ? 1 : 0.45); P.res = miss ? 'miss' : saved ? 'save' : 'goal';
        const tz = P.aim * 2.9 + (miss ? P.aim * 1.6 || 4.5 : 0); b.vx = 24; b.vz = tz * 24 / 11; b.vy = P.aimH ? 7.1 : miss && !P.aim ? 9 : 3.4; P.s.m.play('Shoot', 0.05, true, 1.4); this.A.sfx('kick', 1);
        if (P.dive) { P.k.m.play(P.dive > 0 ? 'KeeperDiveRight' : 'KeeperDiveLeft', 0.05, true, 1.4); P.k.vz = P.dive * 5.5; } P.state = 'fly'; P.t = 0.75;
      }
    } else if (P.state === 'fly') {
      b.vy -= 14 * dt; b.x += b.vx * dt; b.y = Math.max(0.11, b.y + b.vy * dt); b.z += b.vz * dt; P.k.z += (P.k.vz || 0) * dt;
      if (b.x > PL - 0.6 && P.res === 'save') { b.vx = -6; b.vz *= -0.4; P.res = 'saved'; } if (b.x > PL + 1.6) { b.vx = 0; b.vz = 0; }
      if (P.t <= 0) { const t = P.turn, ok = P.res === 'goal'; if (ok) { P.score[t]++; this.A.cheer('goal'); this.A.say('pen_scored'); } else { this.A.cheer('near'); this.A.say('pen_missed'); }
        P.log[t].push(ok); P.n[t]++; this.say(ok ? 'SCORED!' : P.res === 'miss' ? 'MISSED!' : 'SAVED!', 1.6); P.k.vz = 0; P.state = 'wait'; P.t = 1.9; }
    } else if (P.t <= 0) {
      const [a, c] = P.score, [na, nc] = P.n, left0 = Math.max(0, 5 - na), left1 = Math.max(0, 5 - nc);
      const over = (na <= 5 && nc <= 5) ? (a > c + left1 || c > a + left0) : (na === nc && a !== c);
      if (over) { this.score[a > c ? 0 : 1] += 0; this.phase = 'done'; this.finish(); return; }
      P.turn = 1 - P.turn; this.setupPen();
    }
    for (const p of this.players) p.m.mixer.update(dt);
  }

  // ---------- goal celebration and slow-motion replay ----------
  celebrate(dt) {
    const c = this.celeb; if (!c) { for (const p of this.players) if (!p.off) this.anim(p, dt); return; } c.t += dt;
    for (const p of this.players) {
      if (p.off) continue; let tx = null, sp = 0, clip = 'Idle';
      if (p === c.p) { tx = [c.tx, c.tz]; sp = 7.2; clip = 'Sprint'; }
      else if (p.t === c.p.t && !p.gk && dist(p, c.p) < 30) { tx = [c.p.x + (p.x < c.p.x ? -1.4 : 1.4), c.p.z + (p.z < c.p.z ? -1.2 : 1.2)]; sp = 6.4; clip = 'Run'; }
      if (tx) { const ex = tx[0] - p.x, ez = tx[1] - p.z, l = Math.hypot(ex, ez); if (l > 1.6 && c.t < 3.6) { p.x += ex / l * sp * dt; p.z += ez / l * sp * dt; p.face = Math.atan2(ex, ez); p.m.play(clip, 0.15); } else p.m.play('Celebrate', 0.25); }
      else if (p.t !== c.p.t) p.m.play('Idle', 0.4);
      this.anim(p, dt);
    }
  }
  updateReplay(dt) {
    const F = this.replay, sp = 0.5; this.repT += dt * sp; const f = this.repT / 0.05, i = Math.floor(f), a = F[Math.min(i, F.length - 1)], c = F[Math.min(i + 1, F.length - 1)], u = f - i;
    let skip = false; for (const h of this.humans) if (!h.remote) { const k = this.readH(h); if (k.passDown || k.shootDown) skip = true; }
    if (i >= F.length - 1 || skip) { this.replay = null; this.msgT = 0; for (const p of this.players) p.m.root.visible = !p.off; this.setKickoff(this.concede); this.setPhase('kickoff', 1.4); this.A.sfx('whistle'); return; }
    const b = this.ball; b.vx = (c[0] - a[0]) / 0.05 * sp; b.vz = (c[2] - a[2]) / 0.05 * sp; b.x = a[0] + (c[0] - a[0]) * u; b.y = a[1] + (c[1] - a[1]) * u; b.z = a[2] + (c[2] - a[2]) * u; b.owner = null;
    this.players.forEach((p, j) => { const q = a[3][j], r = c[3][j], rt = p.m.root; rt.visible = q[0] < 900; if (!rt.visible) return; p.x = q[0] + (r[0] - q[0]) * u; p.z = q[1] + (r[1] - q[1]) * u; p.face = q[2]; if (q[3] >= 0) p.m.play(CL[q[3]], 0.1); rt.position.set(p.x, 0, p.z); rt.rotation.y = p.face; p.m.mixer.update(dt * sp); });
    this.msg = 'REPLAY'; this.msgT = 1;
  }

  // ---------- online: host sends snapshots, guest renders them ----------
  sendSnap(dt) {
    if (this.evq.length) { this.net.send({ t: 'ev', e: this.evq }); this.evq = []; }
    this.snapT -= dt; if (this.snapT > 0) return; this.snapT = 1 / 20; this.snapN++;
    const b = this.ball, P = this.pens, side = s => this.humans.find(x => x.side === s);
    const m = { t: 'snap', p: this.players.map(p => [+p.x.toFixed(2), +p.z.toFixed(2), +p.face.toFixed(2), CL.indexOf(p.m.current), p.off ? 1 : 0]), b: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)],
      s: this.score, tm: +this.time.toFixed(2), h: this.half, ph: this.phase, msg: this.msgT > 0 ? this.msg : '', sel: [0, 1].map(s => { const h = side(s); return h && h.sel ? this.players.indexOf(h.sel) : -1; }), pw: [0, 1].map(s => { const h = side(s); return h ? +h.power.toFixed(2) : 0; }) };
    if (P) m.pens = { score: P.score, log: P.log, state: P.state };
    if (this.snapN % 20 === 1) m.nm = this.players.map(p => [p.name, p.num]);
    this.net.send(m);
  }
  guestUpdate(dt) {
    this.stadium.update(dt);
    const c = input.read('all'); if (c.pauseDown) this.game.togglePause();
    const r = input.rawState('all'), acc = this.acc || (this.acc = { ...r }); for (const k of ['pass', 'shoot', 'through', 'sprint', 'switch']) acc[k] = acc[k] || r[k]; acc.x = r.x; acc.z = r.z;
    this.inT -= dt; if (this.inT <= 0) { this.inT = 1 / 30; this.net.send({ t: 'in', i: acc }); this.acc = { ...r }; }
    const s = this.snap, b = this.ball;
    if (s) {
      const k = Math.min(1, 12 * dt), kb = Math.min(1, 20 * dt);
      s.p.forEach((q, i) => { const p = this.players[i]; if (!p) return; if (q[4]) { p.off = true; p.m.root.visible = false; return; } p.x += (q[0] - p.x) * k; p.z += (q[1] - p.z) * k; p.face = q[2]; if (q[3] >= 0) p.m.play(CL[q[3]], 0.15); const rt = p.m.root; rt.position.set(p.x, 0, p.z); rt.rotation.y = p.face; p.m.mixer.update(dt); });
      const ox = b.x, oz = b.z; b.x += (s.b[0] - b.x) * kb; b.y += (s.b[1] - b.y) * kb; b.z += (s.b[2] - b.z) * kb; b.vx = (b.x - ox) / Math.max(dt, 0.001); b.vz = (b.z - oz) / Math.max(dt, 0.001);
      if (s.ph !== 'intro' && !this.musOff) { this.musOff = true; audio.music('off'); }
      this.score = s.s; this.time = s.tm; this.half = s.h; this.phase = s.ph; this.msg = s.msg; this.msgT = s.msg ? 1 : 0; this.pens = s.pens || null;
      if (s.nm) s.nm.forEach((n, i) => { if (this.players[i]) { this.players[i].name = n[0]; this.players[i].num = n[1]; } });
      for (const h of this.humans) { h.sel = s.sel[h.side] >= 0 ? this.players[s.sel[h.side]] : null; h.power = s.pw[h.side]; }
    }
    this.sync(dt);
  }

  // ---------- visuals ----------
  anim(p, dt) {
    const sp = Math.hypot(p.vx, p.vz), b = this.ball;
    if (p.state === 'run' && this.phase !== 'goal') { if (p.gk && sp < 1) p.m.play('KeeperIdle', 0.2); else if (sp < 0.6) p.m.play('Idle', 0.2); else if (b.owner === p && !p.gk) p.m.play('Dribble', 0.12, false, clamp(sp / 5.5, 0.6, 1.5)); else if (sp < 3.4) p.m.play('Jog', 0.15, false, clamp(sp / 2.6, 0.6, 1.4)); else if (sp < 7.4) p.m.play('Run', 0.15, false, clamp(sp / 5.8, 0.8, 1.35)); else p.m.play('Sprint', 0.15, false, clamp(sp / 8, 0.9, 1.3)); }
    const r = p.m.root; r.position.set(p.x, 0, p.z); let da = p.face - r.rotation.y; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; r.rotation.y += da * Math.min(1, 12 * dt);
    p.m.mixer.update(dt);
  }
  sync(dt) {
    const b = this.ball, c = this.cam; this.ballMesh.position.set(b.x, b.y + 0.04, b.z); this.ballMesh.rotation.x += b.vz * dt * 3; this.ballMesh.rotation.z -= b.vx * dt * 3;
    this.ballSh.position.set(b.x, 0.03, b.z); this.ballSh.scale.setScalar(0.2 + Math.min(1, b.y * 0.05));
    this.humans.forEach((h, n) => { const r = this.rings[n], p = h.sel; r.visible = !!p && this.phase !== 'pens' && this.phase !== 'penaim'; if (p) r.position.set(p.x, 0.04, p.z); }); this.updateAim();
    const pt = this.passTo; this.tgtRing.visible = !!pt && !b.owner && this.phase === 'play'; if (pt) this.tgtRing.position.set(pt.x, 0.05, pt.z);
    // broadcast camera
    const pens = this.phase === 'pens', pa = this.phase === 'penaim' && this.penAim, cel = this.phase === 'goal' && this.celeb; this.zoom += ((this.phase === 'goal' ? 1 : this.phase === 'replay' ? 0.6 : 0) - this.zoom) * Math.min(1, 2 * dt);
    const fx = cel ? this.celeb.p.x : this.phase === 'intro' ? Math.sin(this.phaseT * 0.45) * 30 : b.x, fz = cel ? this.celeb.p.z : b.z, tx = pens ? PL - 16 : clamp(fx * 0.86, -PL + 14, PL - 14), tz = pens ? 0 : fz * 0.42; this.camX += (tx - this.camX) * Math.min(1, 3 * dt); this.camZ += (tz - this.camZ) * Math.min(1, 3 * dt);
    if (pens) { c.position.set(PL - 34, 9, 0.01); c.lookAt(PL, 1.2, 0); c.fov = 32; }
    else if (pa) { const d = this.dir[pa.p.t]; c.position.set(d * (PL - 34), 9, 0.01); c.lookAt(d * PL, 1.2, 0); c.fov = 32; }
    else { c.position.set(this.camX, 27 - this.zoom * 11, 50 + this.camZ * 0.55 - this.zoom * 16); c.lookAt(this.camX, 0, this.camZ * 0.9 + 3); c.fov = 38 - this.zoom * 8; }
    c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
  }
  render(renderer) { renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight); renderer.render(this.scene, this.cam); }
  dispose() {
    this.stadium.dispose(); for (const p of this.players) { this.scene.remove(p.m.root); p.m.dispose(); }
    this.scene.remove(this.ballMesh, this.ballSh, this.tgtRing, ...this.rings, this.penRet.s, this.penRet.k); for (const a of this.aimV) this.scene.remove(a.pivot, a.ret, a.rcv); audio.crowd(false);
    if (this.net) for (const k in this.h) this.net.off(k, this.h[k]);
  }
}
