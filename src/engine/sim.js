// 11v11 match simulation: physics, rules, set pieces, team AI and human control.
// Pure logic (no rendering). Coordinates in metres: x along the pitch, z across, y up.

export const PITCH = { L: 105, W: 68, HL: 52.5, HW: 34, GOAL_W: 7.32, GOAL_H: 2.44, GOAL_D: 2.0, BOX_D: 16.5, BOX_W: 40.32, SIX_D: 5.5, SIX_W: 18.32, SPOT: 11, CIRCLE: 9.15 };
const { HL, HW, GOAL_W, GOAL_H, GOAL_D, BOX_D, BOX_W } = PITCH;
const GHW = GOAL_W / 2;
export const BALL_R = 0.17;
const GRAV = 9.81;
const PR = 0.45;          // player body radius
const CONTROL_R = 0.95;   // distance at which a player can control the ball

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const angNorm = a => Math.atan2(Math.sin(a), Math.cos(a));

export const DIFFICULTY = {
  amateur: { react: 0.55, passErr: 0.16, press: 0.55, keeper: 0.55, shootDist: 20, tackle: 0.35, speed: 0.9 },
  pro: { react: 0.35, passErr: 0.09, press: 0.8, keeper: 0.75, shootDist: 24, tackle: 0.5, speed: 0.97 },
  world: { react: 0.2, passErr: 0.05, press: 1.0, keeper: 0.88, shootDist: 27, tackle: 0.62, speed: 1.0 },
  legend: { react: 0.1, passErr: 0.025, press: 1.15, keeper: 0.95, shootDist: 30, tackle: 0.72, speed: 1.04 },
};

// --------------------------------------------------------------------------------------------
export class Match {
  /**
   * @param {object} cfg { teams:[teamDef, teamDef], squads:[players[], players[]], formations:[slots[], slots[]],
   *   humans: [{team, device}], halfLength (real seconds), difficulty, knockout (bool: extra time + pens), events (callback) }
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.events = cfg.events || (() => {});
    this.diff = DIFFICULTY[cfg.difficulty || 'pro'];
    this.halfLength = cfg.halfLength || 150;
    const w = cfg.weather || 'clear';
    this.groundFriction = w === 'rain' ? 0.55 : w === 'storm' ? 0.5 : w === 'snow' ? 1.15 : 0.75;
    const wa = Math.random() * Math.PI * 2, ws = w === 'storm' ? 2.2 : w === 'snow' ? 0.6 : w === 'rain' ? 0.5 : 0.25;
    this.wind = { x: Math.cos(wa) * ws, z: Math.sin(wa) * ws };
    this.ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, owner: null, lastTouch: null, lastKick: null, intended: null, passFrom: null, shot: null, heldBy: null, airTime: 0 };
    this.score = [0, 0];
    this.half = 1; this.clock = 0; this.phase = 'prekick'; this.phaseT = 0;
    this.stats = [0, 1].map(() => ({ possession: 0, shots: 0, onTarget: 0, fouls: 0, corners: 0, offsides: 0, passes: 0, passesOk: 0, yellow: 0, red: 0 }));
    this.scorers = [];
    this.attackDir = [1, -1]; // team 0 attacks +x in first half
    this.teams = [0, 1].map(t => ({ idx: t, def: cfg.teams[t], players: [] }));
    for (let t = 0; t < 2; t++) {
      const slots = cfg.formations[t];
      const squad = cfg.squads[t];
      const starters = (cfg.lineups && cfg.lineups[t]) || pickStarters(squad, slots);
      starters.forEach((pl, i) => {
        this.teams[t].players.push({
          team: t, idx: i, info: pl, slot: slots[i], isGK: slots[i].pos === 'GK',
          x: 0, z: 0, vx: 0, vz: 0, face: 0, stamina: 1,
          pace: pl.pace || 70, shooting: pl.shooting || 65, passing: pl.passing || 65, dribbling: pl.dribbling || 65, defending: pl.defending || 60, physical: pl.physical || 65,
          action: null, actionT: 0, stun: 0, slideDX: 0, slideDZ: 0, kickCD: 0, controlCD: 0, human: null, aiT: Math.random() * 0.3, aiTarget: null,
          anim: 'Idle', animOnce: null, animOnceT: 0, yellow: 0, sentOff: false, wantPass: 0, charging: null, charge: 0, keeperHold: 0, dive: 0, diveDir: 0,
        });
      });
    }
    this.all = [...this.teams[0].players, ...this.teams[1].players];
    for (let t = 0; t < 2; t++) {
      const used = new Set(this.teams[t].players.map(p => p.info.id));
      this.teams[t].bench = cfg.squads[t].filter(pl => !used.has(pl.id)).slice(0, 12);
      this.teams[t].subsLeft = 5; this.teams[t].subsQueued = [];
    }
    for (const p of this.all) { p.fatigue = 0; p.ps = { goals: 0, assists: 0, shots: 0, passes: 0, passesOk: 0, tackles: 0, saves: 0, fouls: 0, rating: 6.0 }; }
    // match officials
    this.officials = [
      { role: 'ref', x: -6, z: 6, face: 0, speed: 0, anim: 'Idle', animOnce: null, animOnceT: 0 },
      { role: 'ar1', x: -20, z: -HW - 1.2, face: 0, speed: 0, anim: 'Idle', flag: 0 },   // covers the left half
      { role: 'ar2', x: 20, z: HW + 1.2, face: Math.PI, speed: 0, anim: 'Idle', flag: 0 },  // covers the right half
      { role: '4th', x: 0, z: -HW - 4.2, face: 0, speed: 0, anim: 'Idle', board: 0 },
    ];
    this.added = [0, 0, 0, 0, 0]; this.addedShown = [false, false, false, false, false];
    this.injury = null; this.var = null; this.lastAssist = null;
    this.tactics = [0, 1].map(t => Object.assign({ mentality: 0, pressing: 1, width: 1, line: 1, passing: 1 }, (cfg.tactics && cfg.tactics[t]) || {}));
    this.humans = (cfg.humans || []).map((h, i) => ({ id: i, team: h.team, device: h.device, player: null, prevBtn: {} }));
    this.setPiece = null;
    this.replay = [];  // ring buffer of snapshots
    this.replayT = 0;
    this.whistleQueued = null;
    this.kickoff(0);
  }

  // ------------------------------------------------------------------ helpers
  dir(team) { return this.attackDir[team]; }
  goalX(team) { return this.dir(team) * HL; }          // goal the team attacks
  ownGoalX(team) { return -this.dir(team) * HL; }
  opp(t) { return 1 - t; }
  active(team) { return this.teams[team].players.filter(p => !p.sentOff && !p.injured); }
  keeper(team) { return this.teams[team].players.find(p => p.isGK && !p.sentOff); }
  dist(a, b) { return hyp(a.x - b.x, a.z - b.z); }
  minute() {
    const base = this.half === 1 ? 0 : this.half === 2 ? 45 : this.half === 3 ? 90 : 105;
    const len = this.half <= 2 ? 45 : 15;
    const hl = this.half <= 2 ? this.halfLength : this.halfLength / 3;
    return base + Math.floor(this.clock / hl * len);
  }
  // display string, e.g. "45+2'"
  clockLabel() {
    const base = this.half === 1 ? 0 : this.half === 2 ? 45 : this.half === 3 ? 90 : 105;
    const len = this.half <= 2 ? 45 : 15, m = this.minute();
    return m >= base + len ? `${base + len}+${m - base - len + 1}'` : `${m}'`;
  }
  addedMinutes() { if (this.addedFixed && this.addedFixed[this.half]) return this.addedFixed[this.half]; return Math.max(1, Math.min(9, Math.round(this.added[this.half] + 0.5))); }
  periodSeconds() { const hl = this.half <= 2 ? this.halfLength : this.halfLength / 3, len = this.half <= 2 ? 45 : 15; return hl * (1 + this.addedMinutes() / len); }
  emit(type, data = {}) { this.events(type, data); }
  possTeam() { return this.ball.owner ? this.ball.owner.team : this.ball.lastTouch ? this.ball.lastTouch.team : null; }

  // ------------------------------------------------------------------ setup / restarts
  placeFormation(team, kickingTeam) {
    const d = this.dir(team);
    for (const p of this.teams[team].players) {
      if (p.sentOff) { p.x = 999; continue; }
      const s = p.slot;
      // own half only, compressed
      let x = (-1 + (s.x + 1) * 0.47) * HL;
      x = Math.min(x, -1.5);
      p.x = d * x; p.z = s.y * HW * 0.8 * d;
      p.vx = p.vz = 0; p.face = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.action = null; p.stun = 0; p.keeperHold = 0; p.charging = null; p.charge = 0; p.dive = 0;
    }
    if (team === kickingTeam) {
      // two strikers at the centre spot
      const fw = this.teams[team].players.filter(p => !p.isGK && !p.sentOff).sort((a, b) => b.slot.x - a.slot.x).slice(0, 2);
      if (fw[0]) { fw[0].x = -d * 0.4; fw[0].z = 0; }
      if (fw[1]) { fw[1].x = -d * 1.2; fw[1].z = 3 * d; }
    } else {
      for (const p of this.teams[team].players) if (hyp(p.x, p.z) < PITCH.CIRCLE + 0.5) { const a = Math.atan2(p.z, p.x); p.x = Math.cos(a) * (PITCH.CIRCLE + 0.8); p.z = Math.sin(a) * (PITCH.CIRCLE + 0.8); if (Math.sign(p.x) === d) p.x = -d * (PITCH.CIRCLE + 0.8); }
    }
    for (const p of this.teams[team].players) p.kickPos = { x: p.x, z: p.z };
  }

  resetBall(x, z, y = BALL_R) {
    Object.assign(this.ball, { x, y, z, vx: 0, vy: 0, vz: 0, spin: 0, owner: null, intended: null, passFrom: null, shot: null, heldBy: null });
  }

  kickoff(team) {
    this.placeFormation(0, team); this.placeFormation(1, team);
    this.resetBall(0, 0);
    this.ball.lastTouch = null;
    this.setPiece = { type: 'kickoff', team, x: 0, z: 0, taker: this.teams[team].players.filter(p => !p.isGK && !p.sentOff).sort((a, b) => b.slot.x - a.slot.x)[0], t: 0 };
    this.phase = 'setpiece'; this.phaseT = 0;
    this.assignHumans(true);
    this.emit('kickoff', { team });
  }

  stopPlay(reason, data) {
    // brief pause before a restart
    this.phase = 'stopped'; this.phaseT = 0; this.pending = { reason, ...data };
    this.ball.owner = null;
    this.emit('whistle', { reason });
  }

  beginSetPiece(type, team, x, z) {
    const sp = { type, team, x, z, t: 0, taker: null };
    const attackers = this.active(team).filter(p => !p.isGK);
    const d = this.dir(team);
    if (type === 'goalkick') sp.taker = this.keeper(team) || attackers[0];
    else if (type === 'penalty') sp.taker = attackers.slice().sort((a, b) => b.shooting - a.shooting)[0];
    else sp.taker = attackers.slice().sort((a, b) => hyp(a.x - x, a.z - z) - hyp(b.x - x, b.z - z))[0];
    if (type === 'corner' || type === 'freekick') {
      const best = attackers.slice().sort((a, b) => (b.passing + b.shooting) - (a.passing + a.shooting))[0];
      if (hyp(best.x - x, best.z - z) < 40) sp.taker = best;
    }
    this.setPiece = sp;
    this.phase = 'setpiece'; this.phaseT = 0;
    this.resetBall(x, z);
    // arrange players
    for (const t of [0, 1]) for (const p of this.active(t)) {
      p.vx = p.vz = 0; p.action = null; p.stun = 0; p.charging = null; p.charge = 0; p.dive = 0; p.keeperHold = 0;
      const pos = this.restPosition(p, sp);
      p.x = pos.x; p.z = pos.z;
    }
    const tk = sp.taker;
    if (type === 'throwin') { tk.x = x; tk.z = Math.sign(z) * (HW + 0.15); this.ball.z = Math.sign(z) * (HW - 0.25); this.ball.y = 2.1; }
    else if (type === 'corner') { tk.x = x - Math.sign(x) * 0.6; tk.z = z - Math.sign(z) * 0.6; }
    else { const gx = this.goalX(team); const a = Math.atan2(0 - z, gx - x); tk.x = x - Math.cos(a) * 0.9; tk.z = z - Math.sin(a) * 0.9; }
    tk.face = Math.atan2(type === 'throwin' ? -tk.x * 0 + d * 3 : this.goalX(team) - tk.x, type === 'throwin' ? -Math.sign(z) * 3 : 0 - tk.z);
    if (type === 'penalty') {
      const k = this.keeper(this.opp(team));
      if (k) { k.x = this.goalX(team) - d * 0.3; k.z = 0; k.face = d > 0 ? -Math.PI / 2 : Math.PI / 2; }
    }
    this.assignHumans(true);
    this.emit('setpiece', { type, team });
  }

  restPosition(p, sp) {
    if (sp.type === 'kickoff' && p.kickPos) return p.kickPos;   // stay exactly where the kick-off line-up put us
    const t = p.team, d = this.dir(t), attacking = t === sp.team;
    const base = this.formationTarget(p, { x: sp.x, z: sp.z }, attacking);
    let x = base.x, z = base.z;
    if (sp.type === 'corner') {
      const gx = this.goalX(sp.team), dd = this.dir(sp.team);
      if (!p.isGK) {
        if (attacking && p.slot.x > -0.2) { x = gx - dd * (5 + Math.random() * 9); z = (Math.random() - 0.5) * 22; }
        else if (!attacking && p.slot.x < 0.4) { x = gx - dd * (2 + Math.random() * 10); z = (Math.random() - 0.5) * 20; }
      }
    } else if (sp.type === 'penalty') {
      const gx = this.goalX(sp.team), dd = this.dir(sp.team);
      if (!p.isGK) { x = gx - dd * (BOX_D + 2 + Math.random() * 6); z = (Math.random() - 0.5) * 30; }
      else if (t === sp.team) { x = -gx + dd * 1; z = 0; }
    } else if (sp.type === 'freekick') {
      // defenders keep 9.15 m away
      if (!attacking && hyp(x - sp.x, z - sp.z) < 9.5) { const a = Math.atan2(z - sp.z, x - sp.x); x = sp.x + Math.cos(a) * 9.6; z = sp.z + Math.sin(a) * 9.6; }
      // wall: 3-4 defenders between ball and goal if close to goal
      const gx = this.goalX(sp.team);
      if (!attacking && Math.abs(gx - sp.x) < 32 && !p.isGK && p.slot.x < -0.2 && p.idx % 3 !== 0) {
        const a = Math.atan2(0 - sp.z, gx - sp.x); const off = (p.idx % 4 - 1.5) * 0.7;
        x = sp.x + Math.cos(a) * 9.4 - Math.sin(a) * off; z = sp.z + Math.sin(a) * 9.4 + Math.cos(a) * off;
      }
    } else if (sp.type === 'goalkick') {
      if (!attacking && hyp(x - sp.x, z - sp.z) < BOX_D + 2 && Math.abs(x) > HL - BOX_D - 1) x = sp.x + this.dir(sp.team) * (BOX_D + 3);
    } else if (sp.type === 'throwin') {
      if (hyp(x - sp.x, z - sp.z) < 2) z -= Math.sign(sp.z) * 2;
    }
    return { x: clamp(x, -HL + 0.5, HL - 0.5), z: clamp(z, -HW + 0.5, HW - 0.5) };
  }

  // ------------------------------------------------------------------ human control
  assignHumans(force) {
    for (const h of this.humans) {
      const used = this.humans.filter(o => o !== h && o.player).map(o => o.player);
      if (!force && h.player && !h.player.sentOff) continue;
      const sp = this.setPiece;
      let cand = this.active(h.team).filter(p => !p.isGK && !used.includes(p));
      if (sp && sp.team === h.team && sp.taker && !used.includes(sp.taker) && (h === this.humans.find(o => o.team === h.team))) { this.setHuman(h, sp.taker); continue; }
      cand.sort((a, b) => this.dist(a, this.ball) - this.dist(b, this.ball));
      this.setHuman(h, cand[0] || null);
    }
  }
  setHuman(h, p) {
    if (h.player) h.player.human = null;
    h.player = p; if (p) { p.human = h.id; }
  }
  // Assist: the cursor follows the action — nearest defender when the other team has the ball, ball carrier when a teammate wins it.
  autoSwitch(dt) {
    if (this.cfg.assist === false || this.phase !== 'play') return;
    const b = this.ball;
    for (const h of this.humans) {
      h.switchCD = Math.max(0, (h.switchCD || 0) - dt);
      const p = h.player; if (!p || h.switchCD > 0 || p.action || p.charging || p.stun > 0) continue;
      const used = this.humans.filter(o => o !== h && o.player).map(o => o.player);
      let target = null;
      if (b.owner && b.owner.team === h.team) {
        if (b.owner !== p && b.owner.human === null && !b.owner.isGK && !used.includes(b.owner)) target = b.owner;
      } else {
        const dp = this.dist(p, b);
        let best = null, bd = dp - 3;
        for (const q of this.active(h.team)) { if (q.isGK || q === p || used.includes(q)) continue; const d = this.dist(q, b); if (d < bd) { bd = d; best = q; } }
        // only when the ball is somewhere meaningful (not while you are already closing it down)
        if (best && dp > 7) target = best;
      }
      if (target) { this.setHuman(h, target); h.switchCD = 0.9; this.emit('switch', { human: h.id, auto: true }); }
    }
  }
  switchPlayer(h, toward) {
    h.switchCD = 1.2;
    const used = this.humans.filter(o => o !== h).map(o => o.player);
    let cand = this.active(h.team).filter(p => !p.isGK && p !== h.player && !used.includes(p));
    if (!cand.length) return;
    const b = this.ball;
    if (toward && hyp(toward.x, toward.z) > 0.5) {
      cand.sort((a, c) => score(c) - score(a));
      function score(p) { const dx = p.x - h.player.x, dz = p.z - h.player.z, d = hyp(dx, dz) || 1; return (dx * toward.x + dz * toward.z) / d - d / 60; }
    } else {
      // nearest to the ball, preferring players between ball and own goal
      const og = this.ownGoalX(h.team);
      cand.sort((a, c) => (hyp(a.x - b.x, a.z - b.z) + Math.abs(a.x - og) * 0.05) - (hyp(c.x - b.x, c.z - b.z) + Math.abs(c.x - og) * 0.05));
    }
    this.setHuman(h, cand[0]);
    this.emit('switch', { human: h.id });
  }

  // ------------------------------------------------------------------ main step
  step(dt, inputs) {
    this.phaseT += dt;
    if (this.phase === 'play') {
      this.clock += dt;
      const pt = this.possTeam(); if (pt !== null) this.stats[pt].possession += dt;
      const hl = this.half <= 2 ? this.halfLength : this.halfLength / 3, len = this.half <= 2 ? 45 : 15;
      if (!this.addedShown[this.half] && this.clock >= hl * (len - 1) / len) { this.addedShown[this.half] = true; this.addedFixed = this.addedFixed || []; this.addedFixed[this.half] = this.addedMinutes(); this.officials[3].board = 6; this.emit('added', { minutes: this.addedMinutes() }); }
      if (this.clock >= this.periodSeconds() && !this.ball.shot) return this.endOfPeriod();
    }
    this.updateOfficials(dt);
    if (this.phase === 'injury') { this.updateInjury(dt); this.moveAll(dt, null, true); return; }
    if (this.phase === 'var') { this.moveAll(dt, null, true); if (this.phaseT > 4.5) this.resolveVar(); return; }
    if (this.phase === 'stopped') {
      this.moveAll(dt, null, true);
      if (this.phaseT > 1.2) { this.applyQueuedSubs(); this.resolvePending(); }
      return;
    }
    if (this.phase === 'goal' || this.phase === 'halftime' || this.phase === 'fulltime' || this.phase === 'prekick') {
      this.moveAll(dt, null, true); this.updateBall(dt, true);
      return;
    }
    if (this.phase === 'play' && Math.floor(this.clock) !== this._subTick) { this._subTick = Math.floor(this.clock); this.aiSubs(); }
    // human input
    for (const h of this.humans) this.humanInput(h, inputs[h.id] || {}, dt);
    if (this.phase === 'setpiece') this.setPieceLogic(dt);
    this.autoSwitch(dt);
    this.teamAI(dt);
    this.moveAll(dt);
    this.updateBall(dt);
    this.collisions();
    if (this.phase === 'play' || this.phase === 'setpiece') this.recordReplay(dt);
  }

  endOfPeriod() {
    this.emit('whistle', { reason: 'period' });
    const agg = this.cfg.aggregate || { home: 0, away: 0 };
    const level = this.score[0] + agg.home === this.score[1] + agg.away;
    if (this.half === 1) { this.phase = 'halftime'; this.phaseT = 0; this.emit('halftime'); }
    else if (this.half === 2 && this.cfg.knockout && level && this.cfg.extraTime !== false) { this.phase = 'halftime'; this.phaseT = 0; this.emit('extratime'); }
    else if (this.half === 3) { this.phase = 'halftime'; this.phaseT = 0; this.emit('halftime'); }
    else if (this.half >= 2 && this.cfg.knockout && level) { this.phase = 'fulltime'; this.emit('penalties'); }
    else { this.phase = 'fulltime'; this.phaseT = 0; this.emit('fulltime'); }
  }
  startNextPeriod() {
    this.half++; this.clock = 0;
    this.attackDir = [this.attackDir[0] * -1, this.attackDir[1] * -1];
    this.kickoff(this.half % 2 === 0 ? 1 : 0);
  }

  resolvePending() {
    const p = this.pending; this.pending = null;
    if (!p) return;
    if (p.reason === 'goal') this.kickoff(p.team);
    else this.beginSetPiece(p.type, p.team, p.x, p.z);
  }

  // ------------------------------------------------------------------ set pieces
  setPieceLogic(dt) {
    const sp = this.setPiece; sp.t += dt;
    const tk = sp.taker;
    if (!tk || tk.sentOff) { sp.taker = this.active(sp.team).find(p => !p.isGK); return; }
    // hold taker and ball in place
    const b = this.ball;
    if (sp.type === 'throwin') { b.x = tk.x; b.z = Math.sign(sp.z) * (HW - 0.25); b.y = 2.1; }
    else { b.x = sp.x; b.z = sp.z; b.y = BALL_R; }
    b.vx = b.vy = b.vz = 0;
    if (tk.human === null && sp.t > (sp.type === 'kickoff' ? 1.2 : sp.type === 'penalty' ? 2.0 : 1.6)) this.aiTakeSetPiece(tk, sp);
    else if (tk.human !== null && sp.t > (sp.type === 'kickoff' ? 7 : 9)) this.aiTakeSetPiece(tk, sp);   // you took too long: the CPU does it
  }

  aiTakeSetPiece(tk, sp) {
    const t = tk.team, gx = this.goalX(t), d = this.dir(t);
    if (sp.type === 'penalty') {
      const side = Math.random() < 0.5 ? -1 : 1, high = Math.random() < 0.4;
      this.shootAt(tk, { x: gx, y: high ? 1.7 : 0.4, z: side * (GHW - 0.7 - Math.random() * 1.2) }, 0.6 + Math.random() * 0.3);
    } else if (sp.type === 'corner') {
      this.lobTo(tk, { x: gx - d * (6 + Math.random() * 6), z: (Math.random() - 0.5) * 12 }, true);
    } else if (sp.type === 'freekick' && Math.abs(gx - sp.x) < 28 && Math.abs(sp.z) < 20) {
      this.shootAt(tk, { x: gx, y: 1.6 + Math.random() * 0.6, z: (Math.random() < 0.5 ? -1 : 1) * (GHW - 0.8) }, 0.75, 4);
    } else if (sp.type === 'goalkick') {
      const target = this.bestPassTarget(tk, null, 'long');
      if (target) this.lobTo(tk, target.p, false, target.p); else this.lobTo(tk, { x: 0, z: (Math.random() - 0.5) * 30 }, false);
    } else {
      const target = this.bestPassTarget(tk, null, sp.type === 'throwin' ? 'throw' : 'short');
      if (target) this.passTo(tk, target.p, sp.type === 'throwin' ? 'throw' : 'ground'); else this.kickBall(tk, Math.sin(tk.face) * 12, 0, Math.cos(tk.face) * 12);
    }
  }

  setPieceReleased() {
    if (this.phase !== 'setpiece') return;
    this.phase = 'play'; this.phaseT = 0;
    this.setPiece.released = true;
    this.setPieceGuard = { taker: this.setPiece.taker, t: 0.6 };
    this.emit('play');
  }

  // ------------------------------------------------------------------ ball actions
  kickBall(p, vx, vy, vz, spin = 0, kind = 'kick') {
    const b = this.ball;
    b.owner = null; b.heldBy = null;
    b.vx = vx; b.vy = vy; b.vz = vz; b.spin = spin;
    b.lastTouch = p; b.lastKick = { p, t: 0, kind, sp: this.phase === 'setpiece' && this.setPiece ? this.setPiece.type : null };
    b.intended = null; b.passFrom = null; b.shot = null;
    p.kickCD = 0.35; p.controlCD = 0.35;
    if (b.y < BALL_R) b.y = BALL_R;
    // offside snapshot
    this.offsideSnap = this.computeOffsideLine(p.team, p);
    const wasSetPiece = this.phase === 'setpiece';
    if (wasSetPiece) this.setPieceReleased();
    this.emit('kick', { p, power: hyp(vx, vy, vz), kind });
  }

  passTo(p, target, kind = 'ground', lead = 1) {
    // lead the receiver (pass into their path)
    const b = this.ball;
    const err = this.passError(p);
    let tx = target.x + target.vx * 0.55 * lead, tz = target.z + target.vz * 0.55 * lead;
    const d = hyp(tx - b.x, tz - b.z);
    if (kind === 'throw') {
      const T = 0.5 + d / 22, v = d / T;
      const a = Math.atan2(tz - b.z, tx - b.x) + err;
      this.kickBall(p, Math.cos(a) * v, Math.max(1, GRAV * T / 2 - 1.9 / T), Math.sin(a) * v, 0, 'throw');
    } else if (kind === 'lob') {
      return this.lobTo(p, { x: tx, z: tz }, false, target);
    } else {
      const speed = clamp(d * 0.9 + 7, 9, 28);
      const a = Math.atan2(tz - b.z, tx - b.x) + err;
      this.kickBall(p, Math.cos(a) * speed, 0.3, Math.sin(a) * speed, 0, 'pass');
    }
    b.intended = target; b.passFrom = p;
    this.stats[p.team].passes++; p.ps.passes++;
    p.animOnce = 'Pass'; p.animOnceT = 0.5;
  }

  throughBall(p, target) {
    const b = this.ball, d = this.dir(p.team);
    const tx = clamp(target.x + d * 9 + target.vx * 0.6, -HL + 2, HL - 2), tz = clamp(target.z + target.vz * 0.8, -HW + 2, HW - 2);
    const dist = hyp(tx - b.x, tz - b.z);
    const speed = clamp(dist * 0.95 + 5, 10, 27), err = this.passError(p) * 1.2;
    const a = Math.atan2(tz - b.z, tx - b.x) + err;
    this.kickBall(p, Math.cos(a) * speed, 0.2, Math.sin(a) * speed, 0, 'pass');
    b.intended = target; b.passFrom = p; this.stats[p.team].passes++;
    p.animOnce = 'Pass'; p.animOnceT = 0.5;
  }

  lobTo(p, pos, cross, receiver) {
    const b = this.ball;
    const d = hyp(pos.x - b.x, pos.z - b.z);
    const T = clamp(0.8 + d / 24, 0.9, 2.6);
    const err = this.passError(p) * 1.3;
    const a = Math.atan2(pos.z - b.z, pos.x - b.x) + err;
    const v = d / T * (1 + (Math.random() - 0.5) * err);
    this.kickBall(p, Math.cos(a) * v, GRAV * T / 2, Math.sin(a) * v, 0, cross ? 'cross' : 'lob');
    if (receiver) { b.intended = receiver; b.passFrom = p; }
    else {
      // find likely receiver near landing point
      const mates = this.active(p.team).filter(q => q !== p);
      mates.sort((m, n) => hyp(m.x - pos.x, m.z - pos.z) - hyp(n.x - pos.x, n.z - pos.z));
      if (mates[0] && hyp(mates[0].x - pos.x, mates[0].z - pos.z) < 12) { b.intended = mates[0]; b.passFrom = p; }
    }
    b.landing = { x: pos.x, z: pos.z };
    this.stats[p.team].passes++;
    p.animOnce = 'Pass'; p.animOnceT = 0.6;
  }

  shootAt(p, target, power, curve = 0) {
    const b = this.ball;
    const skill = p.shooting / 100;
    const pressure = this.pressureOn(p);
    const over = Math.max(0, power - 0.88) * 4;
    const errH = (0.025 + (1 - skill) * 0.06 + pressure * 0.04 + over * 0.04) * (Math.random() * 2 - 1);
    const errV = (0.25 + (1 - skill) * 0.5 + over * 1.6) * (Math.random() * 2 - 1) + over * 0.9;
    const speed = 17 + power * 15 + skill * 4;
    const dx = target.x - b.x, dz = target.z - b.z, d = hyp(dx, dz);
    const a = Math.atan2(dz, dx) + errH;
    const T = d / speed;
    const ty = clamp(target.y + errV, 0.1, 6);
    const vy = (ty - b.y + 0.5 * GRAV * T * T) / T;
    this.kickBall(p, Math.cos(a) * speed, vy, Math.sin(a) * speed, curve, 'shot');
    b.shot = { by: p, t: 0, pen: this.phase === 'setpiece' && this.setPiece && this.setPiece.type === 'penalty' };
    this.stats[p.team].shots++; p.ps.shots++;
    // on target?
    const zAtGoal = b.z + Math.sin(a) * speed * T;
    if (Math.abs(zAtGoal) < GHW && ty < GOAL_H) this.stats[p.team].onTarget++;
    p.animOnce = 'Shoot'; p.animOnceT = 0.7;
    this.emit('shot', { p, power });
  }

  passError(p) { return (Math.random() * 2 - 1) * ((1 - p.passing / 110) * 0.12 * (this.assistOn(p) ? 0.45 : 1) + (p.human === null ? this.diff.passErr * 0.5 : 0) + this.pressureOn(p) * 0.04 * (this.assistOn(p) ? 0.5 : 1)); }
  pressureOn(p) { let m = 0; for (const o of this.active(this.opp(p.team))) { const d = this.dist(o, p); if (d < 3) m = Math.max(m, 1 - d / 3); } return m; }

  // ------------------------------------------------------------------ pass target selection
  bestPassTarget(p, stick, kind = 'short', minCos = 0.55) {
    const d = this.dir(p.team);
    const mates = this.active(p.team).filter(q => q !== p && !(q.isGK && kind !== 'back'));
    const opps = this.active(this.opp(p.team));
    let best = null, bestScore = -1e9;
    for (const q of mates) {
      const dx = q.x - p.x, dz = q.z - p.z, dist = hyp(dx, dz);
      if (dist < 4 || (kind === 'throw' && dist > 28)) continue;
      if (kind === 'short' && dist > 40) continue;
      let s = 0;
      if (stick && hyp(stick.x, stick.z) > 0.3) {
        const cos = (dx * stick.x + dz * stick.z) / (dist * hyp(stick.x, stick.z));
        if (cos < minCos) continue;
        s += cos * 40 - dist * 0.25;
      } else {
        s += dx * d * 0.6 - dist * 0.15; // forward progress
        s += (kind === 'long' ? dist * 0.3 : 0);
      }
      // lane safety
      let minLane = 99;
      for (const o of opps) {
        const t = clamp(((o.x - p.x) * dx + (o.z - p.z) * dz) / (dist * dist), 0, 1);
        const lx = p.x + dx * t, lz = p.z + dz * t;
        minLane = Math.min(minLane, hyp(o.x - lx, o.z - lz) / (0.3 + t * 0.7));
      }
      s += Math.min(minLane, 6) * 4;
      // receiver openness
      let near = 99; for (const o of opps) near = Math.min(near, this.dist(o, q));
      s += Math.min(near, 8) * 2;
      if (!this.onside(q, p.team)) s -= 40;
      if (s > bestScore) { bestScore = s; best = q; }
    }
    if (!best) return null;
    return { p: best, score: bestScore };
  }

  // ------------------------------------------------------------------ offside
  computeOffsideLine(team, passer) {
    const d = this.dir(team);
    const defs = this.active(this.opp(team)).map(o => o.x * d).sort((a, b) => b - a);
    const second = defs[1] !== undefined ? defs[1] : HL;
    const line = Math.max(second, this.ball.x * d, 0);
    const flagged = new Set();
    for (const q of this.active(team)) if (q !== passer && q.x * d > line + 0.3) flagged.add(q);
    return { team, flagged };
  }
  onside(q, team) {
    const d = this.dir(team);
    const defs = this.active(this.opp(team)).map(o => o.x * d).sort((a, b) => b - a);
    const second = defs[1] !== undefined ? defs[1] : HL;
    return q.x * d <= Math.max(second, this.ball.x * d, 0) + 0.3;
  }

  // ------------------------------------------------------------------ human input
  humanInput(h, inp, dt) {
    const p = h.player;
    const press = k => inp[k + 'Pressed'];
    if (!p) return;
    p.humanMove = { x: inp.mx || 0, z: inp.my || 0, sprint: !!inp.sprint };
    const b = this.ball;
    const sp = this.phase === 'setpiece' ? this.setPiece : null;
    const stick = { x: inp.mx || 0, z: inp.my || 0 };
    const has = b.owner === p;

    if (press('switch') && !has && !(sp && sp.taker === p)) this.switchPlayer(h, null);

    // set piece taking by human
    if (sp && sp.taker === p) {
      p.humanMove = { x: 0, z: 0 };
      if (Math.hypot(stick.x, stick.z) > 0.3 && sp.type !== 'penalty') p.face = Math.atan2(stick.x, stick.z);
      if (sp.type === 'kickoff' && sp.t < 0.8) return;
      if (press('pass') || press('through')) {
        const t = this.bestPassTarget(p, stick, sp.type === 'throwin' ? 'throw' : 'short');
        if (t) (press('through') && sp.type !== 'throwin') ? this.throughBall(p, t.p) : this.passTo(p, t.p, sp.type === 'throwin' ? 'throw' : 'ground');
        else this.kickBall(p, Math.sin(p.face) * 14, sp.type === 'throwin' ? 4 : 0.3, Math.cos(p.face) * 14);
        return;
      }
      if (press('lob') && sp.type !== 'throwin') {
        const gx = this.goalX(p.team), d = this.dir(p.team);
        if (sp.type === 'corner') this.lobTo(p, { x: gx - d * (6 + Math.abs(stick.x) * 6), z: stick.z * 10 }, true);
        else { const t = this.bestPassTarget(p, stick, 'long'); if (t) this.lobTo(p, t.p, false, t.p); else this.lobTo(p, { x: p.x + Math.sin(p.face) * 30, z: p.z + Math.cos(p.face) * 30 }, false); }
        return;
      }
      // shooting from free kick / penalty: charge
    }

    // shooting with charge (works in open play, free kicks and penalties)
    if (press('shoot')) { p.charging = 'shoot'; p.charge = 0; }
    if (p.charging === 'shoot') {
      if (inp.shoot) p.charge = Math.min(1.1, p.charge + dt / 0.9);
      else {
        const c = p.charge; p.charging = null; p.charge = 0;
        if (has || (sp && sp.taker === p && sp.type !== 'throwin') || this.canFirstTime(p)) {
          const aim = this.shotAim(p, stick, c);
          if (b.y > 1.2 && this.dist(p, b) < 1.4) { this.header(p, { x: aim.x, y: 1.0, z: aim.z }); return; }
          this.shootAt(p, aim, this.shotPowerKey(c));
        } else if (!has && b.owner && b.owner.team !== p.team) {
          this.tryTackle(p, true); // B on defence without ball = slide
        }
        return;
      }
    }
    // defensive actions
    if (!has && !(sp && sp.taker === p)) {
      if (press('shoot') && b.owner && b.owner.team !== p.team && this.dist(p, b) < 5) { p.charging = null; this.tryTackle(p, true); }
      if (press('through')) this.tryTackle(p, false);
      p.pressing = !!inp.pass && b.owner && b.owner.team !== p.team;
      p.teamPress = !!inp.through;
    } else p.pressing = false;

    // mouse "click an opponent": run them down and tackle
    if (h.chase) {
      const c = h.chase, t = c.t, st = Math.hypot(stick.x, stick.z);
      if (has || !t || t.sentOff || this.phase !== 'play' || performance.now() > c.until || st > 0.6 || (c.carrier && this.ball.owner !== t)) h.chase = null;
      else {
        const d = this.dist(p, t), lead = Math.min(0.45, d / 14), tx = t.x + (t.vx || 0) * lead, tz = t.z + (t.vz || 0) * lead, dx = tx - p.x, dz = tz - p.z, dl = Math.hypot(dx, dz) || 1;
        p.humanMove = { x: dx / dl, z: dz / dl, sprint: d > 2.2 };
        if (!p.action && p.stun <= 0) {
          if (d < 1.7) this.tryTackle(p, false);
          else if (d < 3.0 && c.carrier && !c.slid && Math.random() < 0.04) { c.slid = true; p.face = Math.atan2(dx, dz); this.tryTackle(p, true); }
        }
      }
    }
    if (has) {
      if (press('pass')) { const t = this.smartPass(p, stick); if (t) this.passTo(p, t.p); else this.kickBall(p, Math.sin(p.face) * 13, 0.3, Math.cos(p.face) * 13, 0, 'pass'); }
      else if (press('through')) { const t = this.smartPass(p, stick); if (t) this.throughBall(p, t.p); }
      else if (press('lob')) {
        const t = this.bestPassTarget(p, stick, 'long');
        const wide = Math.abs(p.z) > HW * 0.45 && Math.abs(this.goalX(p.team) - p.x) < 32;
        if (wide) { const gx = this.goalX(p.team), d = this.dir(p.team); this.lobTo(p, { x: gx - d * (7 + Math.random() * 5), z: -Math.sign(p.z) * Math.random() * 6 }, true); }
        else if (t) this.passTo(p, t.p, 'lob'); else this.lobTo(p, { x: p.x + Math.sin(p.face) * 28, z: p.z + Math.cos(p.face) * 28 }, false);
      }
      else if (press('skill')) { this.skillMove(p, stick); }
    } else if (!sp) {
      if (press('pass') && this.canFirstTime(p)) { const t = this.smartPass(p, stick); if (t) this.passTo(p, t.p); }
      if (press('lob') && this.canFirstTime(p)) { const gx = this.goalX(p.team), d = this.dir(p.team); this.lobTo(p, { x: gx - d * 9, z: 0 }, true); }
    }
  }
  // ------------------------------------------------------------------ mouse / touchpad aiming (aim line = exact flight prediction)
  // keyboard / pad shot: where it is aimed and how hard it is hit for a given charge (0..1.1)
  shotAim(p, stick, c) {
    const G = PITCH.GOAL_W / 2;
    const z = Math.abs(stick.z) >= 0.25 ? clamp(stick.z, -1, 1) * (G - 0.6) : clamp(-p.z * 0.15, -G + 0.8, G - 0.8);
    return { x: this.goalX(p.team), y: 0.35 + c, z };
  }
  shotPowerKey(c) { return Math.min(1.1, Math.max(c, this.cfg.assist === false ? 0 : 0.3) + 0.15); }
  // gauge value 0..1 for a charge, and where the red "over-hit" zone starts (power 0.88 → charge 0.73)
  gauge(c) { return clamp(c / 0.95, 0, 1); }
  predictShot(p, aim, pw) {
    const b = this.ball, g = GRAV, y0 = Math.max(b.y, BALL_R), pts = [];
    const speed = 17 + pw * 15 + (p.shooting / 100) * 4, dx = aim.x - b.x, dz = aim.z - b.z, d = hyp(dx, dz) || 1, T = d / speed, vy = (aim.y - y0 + 0.5 * g * T * T) / T;
    for (let i = 0; i <= 36; i++) { const t = T * 1.12 * i / 36; pts.push([b.x + dx * t / T, Math.max(0.15, y0 + vy * t - 0.5 * g * t * t), b.z + dz * t / T]); }
    const over = Math.max(0, pw - 0.88);
    return { pts, end: [aim.x, aim.z], dist: d, over: over > 0, power: pw, aim };
  }
  // opponent under the pointer (the ball carrier gets priority), or null
  pickOpponent(h, tx, tz) {
    const me = h.player; if (!me) return null; const c = this.ball.owner;
    if (c && c.team !== me.team && !c.isGK && hyp(c.x - tx, c.z - tz) < 4.5) return c;
    let best = null, bd = 3.2;
    for (const o of this.active(1 - me.team)) { if (o.isGK || o.sentOff) continue; const d = hyp(o.x - tx, o.z - tz); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  mouseTackle(h, tx, tz) {
    let me = h.player; if (!me || me.stun > 0 || this.phase !== 'play' || this.ball.owner === me) return false;
    const t = this.pickOpponent(h, tx, tz); if (!t) return false;
    // if a teammate is clearly closer to that opponent, take control of him
    const used = this.humans.filter(o => o !== h).map(o => o.player);
    const mates = this.active(h.team).filter(q => !q.isGK && !used.includes(q) && q !== me).sort((a, c) => this.dist(a, t) - this.dist(c, t));
    if (mates[0] && this.dist(mates[0], t) + 6 < this.dist(me, t)) { this.setHuman(h, mates[0]); h.switchCD = 1.2; }
    h.chase = { t, until: performance.now() + 5000, carrier: this.ball.owner === t, slid: false };
    return true;
  }
  mouseReady(h) {
    const p = h && h.player; if (!p || p.stun > 0 || p.sentOff) return false;
    const sp = this.phase === 'setpiece' ? this.setPiece : null;
    if (sp) return sp.taker === p;
    return this.phase === 'play' && (this.ball.owner === p || this.canFirstTime(p));
  }
  // where a shot aimed along player→cursor crosses the goal line (height from charge)
  goalAim(p, cx, cz, power) {
    const b = this.ball, gx = this.goalX(p.team), d = this.dir(p.team);
    if ((cx - b.x) * d < 3) return null;
    const t = (gx - b.x) / (cx - b.x); if (!(t > 0)) return null;
    const zg = b.z + (cz - b.z) * t;
    return { x: gx, y: 0.3 + clamp(power, 0, 1.1) * 1.0, z: clamp(zg, -PITCH.GOAL_W / 2 - 3, PITCH.GOAL_W / 2 + 3), toGoal: true };
  }
  mousePower(c) { return clamp(0.3 + c * 0.85, 0.3, 1.1); }
  nearestMate(p, x, z, r) {
    let best = null, bd = r;
    for (const q of this.active(p.team)) { if (q === p || (q.isGK && hyp(q.x - x, q.z - z) > 3)) continue; const d = hyp(q.x - x, q.z - z); if (d < bd) { bd = d; best = q; } }
    return best;
  }
  // kind: 'pass' | 'lob' | 'shoot'. returns {pts:[[x,y,z]...], end:[x,z], label, dist}
  predict(p, kind, tx, tz, c) {
    const b = this.ball, pts = [], g = GRAV, y0 = Math.max(b.y, BALL_R);
    const dist = hyp(tx - b.x, tz - b.z);
    if (kind === 'pass') {
      const mate = this.nearestMate(p, tx, tz, 9);
      const ex = mate ? mate.x + mate.vx * 0.55 : tx, ez = mate ? mate.z + mate.vz * 0.55 : tz;
      for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push([b.x + (ex - b.x) * t, 0.22, b.z + (ez - b.z) * t]); }
      return { pts, end: [ex, ez], dist: hyp(ex - b.x, ez - b.z), label: mate ? 'Pass → ' + mate.info.name.split(' ').pop() : 'Pass', mate };
    }
    if (kind === 'lob') {
      const mate = this.nearestMate(p, tx, tz, 8);
      const ex = mate ? mate.x : tx, ez = mate ? mate.z : tz, d = hyp(ex - b.x, ez - b.z), T = clamp(0.8 + d / 24, 0.9, 2.6), vy = g * T / 2;
      for (let i = 0; i <= 36; i++) { const t = T * i / 36; pts.push([b.x + (ex - b.x) * t / T, y0 + vy * t - 0.5 * g * t * t, b.z + (ez - b.z) * t / T]); }
      const box = Math.abs(this.goalX(p.team) - ex) < PITCH.BOX_D + 4 && Math.abs(ez) < PITCH.BOX_W / 2;
      return { pts, end: [ex, ez], dist: d, label: (box ? 'Cross' : 'Lob') + (mate ? ' → ' + mate.info.name.split(' ').pop() : ''), mate };
    }
    const pw = this.mousePower(c), aim = this.goalAim(p, tx, tz, pw);
    if (aim) {
      const speed = 17 + pw * 15 + (p.shooting / 100) * 4, dx = aim.x - b.x, dz = aim.z - b.z, d = hyp(dx, dz), T = d / speed, vy = (aim.y - y0 + 0.5 * g * T * T) / T;
      for (let i = 0; i <= 36; i++) { const t = T * 1.12 * i / 36; pts.push([b.x + dx * t / T, Math.max(0.15, y0 + vy * t - 0.5 * g * t * t), b.z + dz * t / T]); }
      const on = Math.abs(aim.z) < PITCH.GOAL_W / 2 && aim.y < PITCH.GOAL_H;
      return { pts, end: [aim.x, aim.z], dist: d, label: `Shot ${Math.round(pw / 1.1 * 100)}%${on ? '' : ' — off target'}`, power: pw, aim };
    }
    const sp = 22, a = Math.atan2(tz - b.z, tx - b.x), T2 = Math.min(1.4, dist / sp + 0.2);
    for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push([b.x + Math.cos(a) * sp * T2 * t, 0.3, b.z + Math.sin(a) * sp * T2 * t]); }
    return { pts, end: [b.x + Math.cos(a) * sp * T2, b.z + Math.sin(a) * sp * T2], dist, label: 'Drive', power: pw };
  }
  mouseAct(h, kind, tx, tz, c) {
    if (!this.mouseReady(h)) return false;
    const p = h.player, b = this.ball, sp = this.phase === 'setpiece' ? this.setPiece : null;
    if (kind === 'pass') {
      const mate = this.nearestMate(p, tx, tz, 9);
      if (mate) { this.passTo(p, mate, sp && sp.type === 'throwin' ? 'throw' : 'ground'); return true; }
      if (sp && sp.type === 'throwin') { this.passTo(p, { x: tx, z: tz, vx: 0, vz: 0 }, 'throw'); return true; }
      const d = hyp(tx - b.x, tz - b.z), speed = clamp(d * 0.9 + 7, 9, 28), a = Math.atan2(tz - b.z, tx - b.x) + (Math.random() - 0.5) * 0.06;
      this.kickBall(p, Math.cos(a) * speed, 0.3, Math.sin(a) * speed, 0, 'pass'); this.stats[p.team].passes++; p.ps.passes++; p.animOnce = 'Pass'; p.animOnceT = 0.5;
      return true;
    }
    if (kind === 'lob') {
      const mate = this.nearestMate(p, tx, tz, 8);
      const box = Math.abs(this.goalX(p.team) - tx) < PITCH.BOX_D + 4 && Math.abs(tz) < PITCH.BOX_W / 2;
      this.lobTo(p, mate ? { x: mate.x, z: mate.z } : { x: tx, z: tz }, box || (sp && sp.type === 'corner'), mate || undefined);
      return true;
    }
    const pw = this.mousePower(c), aim = this.goalAim(p, tx, tz, pw);
    if (aim) { this.shootAt(p, aim, pw, sp && sp.type === 'freekick' ? 3 * Math.sign(tz - b.z) : 0); return true; }
    const a = Math.atan2(tz - b.z, tx - b.x), speed = 22;
    this.kickBall(p, Math.cos(a) * speed, 1.2, Math.sin(a) * speed, 0, 'kick'); p.animOnce = 'Shoot'; p.animOnceT = 0.7;
    return true;
  }

  assistOn(p) { return p.human !== null && this.cfg.assist !== false; }
  isKb(p) { return p.human !== null && /^kb/.test(this.humans[p.human].device.type); }
  // best receiver for a human pass: follows the stick, widens if nobody is in the cone, always finds somebody
  smartPass(p, stick, kind = 'short') {
    const has = Math.hypot(stick.x, stick.z) > 0.3;
    let t = this.bestPassTarget(p, stick, kind);
    if (!t && has) t = this.bestPassTarget(p, stick, kind, -0.2);
    if (!t) t = this.bestPassTarget(p, null, kind);
    return t;
  }

  canFirstTime(p) { const b = this.ball; return !b.owner && b.heldBy === null && this.dist(p, b) < 1.5 && b.y < 2.2 && p.kickCD <= 0; }

  // ------------------------------------------------------------------ skill moves
  // SKILL + stick direction (relative to where the player faces); press SKILL twice quickly for the advanced version:
  //   sideways: sidestep / double: drag-back cut      forwards: step-over / double: nutmeg      backwards: roulette spin / double: rainbow flick
  skillMove(p, stick) {
    if (p.skillCD > 0 || p.action || p.stun > 0) return;
    const now = this.clock, dbl = now - (p.lastSkillAt || -9) < 0.4; p.lastSkillAt = now;
    const fx = Math.sin(p.face), fz = Math.cos(p.face), px = fz, pz = -fx, mag = hyp(stick.x, stick.z);
    const f = mag > 0.25 ? stick.x * fx + stick.z * fz : 0, sd = mag > 0.25 ? stick.x * px + stick.z * pz : 0;
    const dir = Math.abs(f) > 0.55 && Math.abs(f) > Math.abs(sd) ? (f > 0 ? 'fwd' : 'back') : 'side', side = Math.abs(sd) > 0.2 ? Math.sign(sd) : (Math.random() < 0.5 ? -1 : 1);
    const name = dir === 'fwd' ? (dbl ? 'nutmeg' : 'stepover') : dir === 'back' ? (dbl ? 'rainbow' : 'roulette') : (dbl ? 'cut' : 'sidestep');
    this.doSkill(p, name, side);
  }
  nearestFoe(p, range, cone) {
    const fx = Math.sin(p.face), fz = Math.cos(p.face); let best = null, bd = range;
    for (const o of this.active(this.opp(p.team))) { if (o.isGK) continue; const dx = o.x - p.x, dz = o.z - p.z, d = hyp(dx, dz); if (d < bd && (cone === undefined || (dx * fx + dz * fz) / (d || 1) > cone)) { bd = d; best = o; } }
    return best;
  }
  doSkill(p, name, side) {
    const b = this.ball, has = b.owner === p, fx = Math.sin(p.face), fz = Math.cos(p.face), px = fz, pz = -fx;
    const wrongFoot = (o, t, chance) => { if (o && Math.random() < chance) { o.wrong = t; o.vx *= 0.3; o.vz *= 0.3; } };
    const win = o => clamp(0.55 + (p.dribbling - (o ? o.defending : 70)) / 140, 0.15, 0.92);
    p.skillT = 0.9; p.skillCD = 0.45; p.stamina = Math.max(0, p.stamina - 0.045);
    switch (name) {
      case 'sidestep': // quick sidestep + burst
        p.vx += px * side * 5.4 + fx * 1.6; p.vz += pz * side * 5.4 + fz * 1.6; p.burst = 0.45; p.shield = 0.5; p.animOnce = 'Dribble'; p.animOnceT = 0.4; p.hop = 0.3;
        wrongFoot(this.nearestFoe(p, 2.6), 0.4, win()); break;
      case 'stepover': // step-over: freezes the defender in front, then bursts past
        p.vx += fx * 3.4 + px * side * 2.2; p.vz += fz * 3.4 + pz * side * 2.2; p.burst = 0.65; p.shield = 0.6; p.animOnce = 'Dribble'; p.animOnceT = 0.5; p.hop = 0.45;
        wrongFoot(this.nearestFoe(p, 3.2, 0.3), 0.6, win(this.nearestFoe(p, 3.2, 0.3))); break;
      case 'roulette': { // 360° spin away from the nearest defender
        const o = this.nearestFoe(p, 3.5); let away = side; if (o) away = Math.sign((o.x - p.x) * px + (o.z - p.z) * pz) * -1 || side;
        p.vx = px * away * 4.8 + fx * 2.2; p.vz = pz * away * 4.8 + fz * 2.2; p.spinT = 0.6; p.spinDir = away; p.shield = 0.8; p.burst = 0.5; p.animOnce = 'Dribble'; p.animOnceT = 0.6;
        wrongFoot(o, 0.5, win(o)); break; }
      case 'cut': // drag-back / Cruyff turn: reverse and go the other way
        p.face += side * 2.1; p.vx = Math.sin(p.face) * 5.2; p.vz = Math.cos(p.face) * 5.2; p.burst = 0.55; p.shield = 0.6; p.hop = 0.35; p.animOnce = 'Dribble'; p.animOnceT = 0.45;
        for (const o of this.active(this.opp(p.team))) if (!o.isGK && hyp(o.x - p.x, o.z - p.z) < 3 && Math.random() < win(o) * 0.8) { o.wrong = 0.5; o.vx *= 0.3; o.vz *= 0.3; } break;
      case 'nutmeg': { // push the ball through the legs of the defender in front
        const o = this.nearestFoe(p, 2.8, 0.35);
        if (has && o) {
          if (Math.random() < win(o)) { b.owner = null; b.vx = fx * 9.5; b.vz = fz * 9.5; b.vy = 0.3; b.lastTouch = p; p.controlCD = 0; p.burst = 0.9; o.wrong = 0.9; o.stun = 0.5; this.emit('nutmeg', { p, o }); }
          else { this.looseBall(p, o, 3); p.controlCD = 0.4; }
        } else { p.vx += fx * 3; p.vz += fz * 3; p.burst = 0.5; p.shield = 0.5; }
        p.animOnce = 'Dribble'; p.animOnceT = 0.5; break; }
      case 'rainbow': // flick the ball up and over the defender's head
        if (has) { b.owner = null; b.vx = fx * 5.2; b.vz = fz * 5.2; b.vy = 6.3; b.lastTouch = p; b.shot = null; p.controlCD = 0.5; p.burst = 1.0; p.hop = 0.7; for (const o of this.active(this.opp(p.team))) if (hyp(o.x - p.x, o.z - p.z) < 5) o.controlCD = Math.max(o.controlCD, 0.9); this.emit('rainbow', { p }); }
        else { p.vx += fx * 3; p.vz += fz * 3; p.burst = 0.6; }
        p.animOnce = 'Dribble'; p.animOnceT = 0.6; break;
    }
    this.emit('skill', { p, name });
  }
  feint(p, stick) { this.skillMove(p, stick); }
  header(p, target) {
    const b = this.ball, dx = target.x - b.x, dz = target.z - b.z, d = hyp(dx, dz);
    const sp = 14 + p.physical / 20;
    const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.25 * (1.3 - p.shooting / 100);
    const T = d / sp, vy = (target.y - b.y + 0.5 * GRAV * T * T) / T;
    this.kickBall(p, Math.cos(a) * sp, Math.min(vy, 6), Math.sin(a) * sp, 0, 'header');
    b.shot = { by: p, t: 0 }; this.stats[p.team].shots++;
    p.animOnce = 'Header'; p.animOnceT = 0.6;
  }

  tryTackle(p, slide) {
    if (p.action || p.stun > 0 || p.isGK || p.wrong > 0) return;
    if (slide) {
      p.action = 'slide'; p.actionT = 0.85;
      const b = this.ball;
      let a = p.face;
      if (this.dist(p, b) < 6) a = Math.atan2(b.x + b.vx * 0.15 - p.x, b.z + b.vz * 0.15 - p.z);
      p.face = a; p.slideDX = Math.sin(a); p.slideDZ = Math.cos(a);
      p.slideHit = false;
      p.animOnce = 'Tackle'; p.animOnceT = 0.9;
      this.emit('slide', { p });
    } else {
      const c = this.ball.owner;
      if (!c || c.team === p.team || this.dist(p, c) > 1.7) { p.action = 'stand'; p.actionT = 0.35; return; }
      const chance = (0.35 + (p.defending - c.dribbling) / 160 + (p.human === null ? this.diff.tackle - 0.5 : 0.1)) * (c.shield > 0 ? 0.15 : 1) * (this.assistOn(c) && p.human === null ? 0.6 : 1);
      if (Math.random() < chance) {
        p.ps.tackles++; p.ps.rating += 0.15;
        this.looseBall(c, p, 4);
        c.controlCD = 0.5;
        this.emit('tackle', { p, won: true });
      } else {
        p.action = 'stand'; p.actionT = 0.45; p.stun = 0.25; this.emit('tackle', { p, won: false });
        // clumsy standing challenge → foul (more likely from behind / tired / low defending)
        const behind = Math.cos(c.face - p.face) > 0.5;
        if (this.phase === 'play' && Math.random() < (behind ? 0.35 : 0.12) * (1.3 - p.defending / 120) + p.fatigue * 0.3) this.foul(p, c, { x: c.x, z: c.z });
      }
    }
  }

  looseBall(from, to, speed) {
    const b = this.ball; b.owner = null; b.heldBy = null;
    const a = Math.atan2(to.x - from.x, to.z - from.z) + (Math.random() - 0.5) * 0.8;
    b.vx = Math.sin(a) * speed; b.vz = Math.cos(a) * speed; b.vy = 0.8;
    b.lastTouch = to; b.intended = null;
  }

  foul(offender, victim, at) {
    this.stats[offender.team].fouls++;
    victim.stun = 1.4; victim.animOnce = 'Fall'; victim.animOnceT = 1.4;
    const t = victim.team, d = this.dir(t), gx = this.goalX(t);
    const inBox = Math.abs(at.x - gx) < BOX_D && Math.abs(at.z) < BOX_W / 2 && Math.sign(at.x) === Math.sign(gx);
    let card = null;
    const fromBehind = Math.cos(offender.face - victim.face) > 0.5;
    const lastMan = this.isLastDefender(offender) && Math.abs(gx - at.x) < 35;
    if (lastMan && Math.random() < 0.7) card = 'red';
    else if (fromBehind && Math.random() < 0.55) card = 'yellow';
    else if (Math.random() < 0.15) card = 'yellow';
    if (card === 'yellow') { offender.yellow++; this.stats[offender.team].yellow++; if (offender.yellow >= 2) card = 'red2'; }
    if (card === 'red' || card === 'red2') { offender.sentOff = true; this.stats[offender.team].red++; offender.x = 999; if (offender.human !== null) { const h = this.humans[offender.human]; this.setHuman(h, null); } }
    offender.ps.fouls++; offender.ps.rating -= card ? (card === 'yellow' ? 0.4 : 1.2) : 0.1;
    this.added[this.half] += card ? 0.35 : 0.15;
    const restart = inBox ? { type: 'penalty', team: t, x: gx - d * PITCH.SPOT, z: 0 } : { type: 'freekick', team: t, x: clamp(at.x, -HL + 1, HL - 1), z: clamp(at.z, -HW + 1, HW - 1) };
    this.emit('foul', { offender, victim, card, penalty: inBox });
    const ref = this.officials[0];
    if (card) { ref.animOnce = 'Card'; ref.animOnceT = 2.2; ref.cardTarget = offender; ref.card = card; }
    // injury?
    const injChance = (card === 'red' || card === 'red2' ? 0.35 : card ? 0.16 : 0.06) * (this.cfg.injuries === false ? 0 : 1);
    if (!victim.isGK && Math.random() < injChance) { this.startInjury(victim, restart); }
    else this.stopPlay('foul', restart);
    this.assignHumans(false);
  }

  // ------------------------------------------------------------------ injuries (medics + buggy + stretcher)
  startInjury(p, restart) {
    this.phase = 'injury'; this.phaseT = 0; this.ball.owner = null;
    p.injured = true; p.stun = 99; p.animOnce = 'Fall'; p.animOnceT = 99;
    const side = -HW - 6; // medical team comes from the dugout side
    this.injury = { p, restart, t: 0, buggy: { x: p.x < 0 ? -15 : 15, z: side, face: 0, visible: true }, medics: [{ x: (p.x < 0 ? -13 : 13), z: side + 1 }, { x: (p.x < 0 ? -12 : 12), z: side + 1.5 }], stretcher: false, carried: false };
    this.added[this.half] += 1.2;
    this.emit('injury', { p });
  }
  updateInjury(dt) {
    const I = this.injury; if (!I) return; I.t += dt;
    const p = I.p, mv = (o, tx, tz, sp) => { const dx = tx - o.x, dz = tz - o.z, d = hyp(dx, dz); if (d > 0.1) { const s = Math.min(d, sp * dt); o.x += dx / d * s; o.z += dz / d * s; o.face = Math.atan2(dx, dz); o.speed = sp; } else o.speed = 0; return d; };
    if (I.t < 1.5) return;
    // medics run on
    if (I.t < 9) { I.medics.forEach((m, i) => mv(m, p.x + (i ? 0.8 : -0.8), p.z + 0.6, 6)); }
    // buggy drives to the player
    if (I.t > 4 && I.t < 13) mv(I.buggy, p.x + 2.2, p.z, 5);
    if (I.t >= 13 && !I.carried) { I.carried = true; I.stretcher = true; this.emit('stretcher', { p }); }
    if (I.carried) { p.x = I.buggy.x - Math.sin(I.buggy.face) * 1.0; p.z = I.buggy.z - Math.cos(I.buggy.face) * 1.0; I.medics.forEach((m, i) => { m.x = I.buggy.x - Math.sin(I.buggy.face) * 2.3 + (i ? 0.6 : -0.6); m.z = I.buggy.z - Math.cos(I.buggy.face) * 2.3; m.face = I.buggy.face; m.speed = I.buggy.speed; }); }
    if (I.t >= 14) { const d = mv(I.buggy, I.buggy.x < 0 ? -HL - 8 : HL + 8, -HW - 6, 5.5); if (d < 1 || I.t > 26) this.finishInjury(); }
  }
  finishInjury() {
    const I = this.injury; if (!I) return;
    const p = I.p; p.injured = false; p.stun = 0; p.animOnce = null;
    const t = this.teams[p.team];
    // forced substitution (or play on with ten if no subs left)
    if (t.subsLeft > 0 && t.bench.length) { const inP = this.bestBenchFor(p); this.substitute(p, inP, true); }
    else { p.sentOff = true; p.x = 999; }
    this.injury = null;
    this.stopPlay('foul', I.restart); this.phaseT = 1.0;
  }
  skipInjury() { if (this.injury) { this.injury.t = Math.max(this.injury.t, 14); this.injury.buggy.x = this.injury.buggy.x < 0 ? -HL - 8 : HL + 8; this.injury.buggy.z = -HW - 6; this.finishInjury(); } }

  // ------------------------------------------------------------------ substitutions
  bestBenchFor(p) {
    const t = this.teams[p.team];
    const same = t.bench.filter(b => (p.isGK ? b.pos === 'GK' : b.pos !== 'GK'));
    const pref = same.filter(b => b.pos === p.info.pos);
    return (pref.length ? pref : same).sort((a, b) => b.rating - a.rating)[0] || t.bench[0];
  }
  queueSub(team, outPlayer, inInfo) {
    const t = this.teams[team];
    if (t.subsLeft - t.subsQueued.length <= 0 || outPlayer.sentOff) return false;
    if (t.subsQueued.some(q => q.out === outPlayer || q.inn === inInfo)) return false;
    t.subsQueued.push({ out: outPlayer, inn: inInfo });
    this.emit('subQueued', { team, out: outPlayer, inn: inInfo });
    if (this.phase !== 'play') this.applyQueuedSubs();
    return true;
  }
  applyQueuedSubs() {
    for (const t of this.teams) { const q = t.subsQueued; t.subsQueued = []; for (const s of q) this.substitute(s.out, s.inn); }
  }
  substitute(p, inInfo, forced) {
    const t = this.teams[p.team];
    if (!inInfo || t.subsLeft <= 0) return;
    const outInfo = p.info;
    t.bench = t.bench.filter(b => b !== inInfo);
    t.subsLeft--;
    p.info = inInfo; p.pace = inInfo.pace || 70; p.shooting = inInfo.shooting || 65; p.passing = inInfo.passing || 65; p.dribbling = inInfo.dribbling || 65; p.defending = inInfo.defending || 60; p.physical = inInfo.physical || 65;
    p.stamina = 1; p.fatigue = 0; p.yellow = 0; p.stun = 0; p.action = null; p.injured = false;
    p.ps = { goals: 0, assists: 0, shots: 0, passes: 0, passesOk: 0, tackles: 0, saves: 0, fouls: 0, rating: 6.0 };
    // the new player walks on from the halfway line
    p.x = 0; p.z = -HW - 0.5;
    this.added[this.half] += 0.4;
    this.officials[3].board = 5; this.officials[3].boardOut = outInfo.number; this.officials[3].boardIn = inInfo.number;
    this.emit('sub', { team: p.team, p, outInfo, inInfo, forced: !!forced });
  }
  aiSubs() {
    const m = this.minute();
    for (const t of this.teams) {
      if (this.humans.some(h => h.team === t.idx) && !this.cfg.autoSubs) continue;
      if (t.subsLeft <= 0 || t.subsQueued.length) continue;
      const windows = [58, 67, 76, 84];
      const due = windows.filter(w => m >= w).length, made = 5 - t.subsLeft;
      if (due <= made || this.half !== 2) continue;
      const tired = this.active(t.idx).filter(p => !p.isGK).sort((a, b) => (a.stamina - a.fatigue) - (b.stamina - b.fatigue))[0];
      if (tired) this.queueSub(t.idx, tired, this.bestBenchFor(tired));
    }
  }

  // ------------------------------------------------------------------ team management (live)
  setFormation(team, slots, name) {
    const ps = this.teams[team].players;
    const gk = ps.find(p => p.isGK);
    const out = ps.filter(p => p !== gk);
    const newSlots = slots.filter(s => s.pos !== 'GK');
    // keep players in similar areas: sort both by depth then width
    const key = s => s.x * 10 + s.y;
    const sortedPlayers = out.slice().sort((a, b) => key(a.slot) - key(b.slot));
    const sortedSlots = newSlots.slice().sort((a, b) => key(a) - key(b));
    sortedPlayers.forEach((p, i) => { p.slot = sortedSlots[i]; });
    if (gk) gk.slot = slots.find(s => s.pos === 'GK');
    this.teams[team].formationName = name;
    this.emit('formation', { team, name });
  }
  swapSlots(a, b) { const s = a.slot; a.slot = b.slot; b.slot = s; const g = a.isGK; a.isGK = b.isGK; b.isGK = g; }
  setTactics(team, t) { Object.assign(this.tactics[team], t); }

  // ------------------------------------------------------------------ officials
  updateOfficials(dt) {
    const b = this.ball, [ref, ar1, ar2, fourth] = this.officials;
    const mv = (o, tx, tz, maxSp) => { const dx = tx - o.x, dz = tz - o.z, d = hyp(dx, dz); const sp = Math.min(maxSp, d * 1.6); if (d > 0.2) { o.x += dx / d * sp * dt; o.z += dz / d * sp * dt; o.speed = sp; o.face += angNorm(Math.atan2(b.x - o.x, b.z - o.z) - o.face) * Math.min(1, dt * 4); } else { o.speed = 0; o.face += angNorm(Math.atan2(b.x - o.x, b.z - o.z) - o.face) * Math.min(1, dt * 3); } };
    // referee: diagonal system, stays ~12 m from the ball
    let tx = b.x - 8, tz = b.z + 8 * (b.z > 0 ? -1 : 1);
    if (ref.cardTarget && ref.animOnceT > 0) { tx = ref.cardTarget.x + 2; tz = ref.cardTarget.z + 1.5; }
    if (this.injury) { tx = this.injury.p.x + 3; tz = this.injury.p.z - 3; }
    mv(ref, clamp(tx, -HL + 2, HL - 2), clamp(tz, -HW + 2, HW - 2), 7.5);
    if (ref.animOnceT > 0) { ref.animOnceT -= dt; if (ref.animOnceT <= 0) { ref.animOnce = null; ref.cardTarget = null; } }
    ref.anim = ref.animOnce || (ref.speed > 4.5 ? 'Run' : ref.speed > 0.5 ? 'Jog' : 'Idle');
    // assistant referees track the second-last defender of their half
    const line = (sign) => { const team = this.dir(0) === sign ? 1 : 0; const xs = this.active(team).map(p => p.x * sign).sort((a, c) => c - a); return sign * Math.max(xs[1] ?? 0, b.x * sign, 0); };
    mv(ar1, clamp(line(-1), -HL, 0), -HW - 1.2, 7); mv(ar2, clamp(line(1), 0, HL), HW + 1.2, 7);
    for (const a of [ar1, ar2]) { a.flag = Math.max(0, a.flag - dt); a.anim = a.flag > 0 ? 'Flag' : a.speed > 4 ? 'Run' : a.speed > 0.4 ? 'Jog' : 'Idle'; }
    fourth.board = Math.max(0, fourth.board - dt); fourth.anim = fourth.board > 0 ? 'Board' : 'Idle';
  }

  // ------------------------------------------------------------------ VAR
  resolveVar() {
    const v = this.var; this.var = null;
    if (!v) return;
    if (v.overturn) {
      this.score[v.team]--; this.scorers.pop();
      if (v.entry.player && v.scorer) v.scorer.ps.goals--;
      this.emit('varResult', { overturn: true, reason: v.reason, team: v.team });
      const s = Math.sign(this.ball.x) || 1;
      this.ball.inGoal = false; for (const p of this.all) p.celebrating = false;
      this.beginSetPiece(v.reason === 'Offside' ? 'freekick' : 'freekick', 1 - v.team, clamp(this.ball.x - s * 16, -HL + 2, HL - 2), clamp(this.ball.z * 0.5, -HW + 2, HW - 2));
    } else {
      this.emit('varResult', { overturn: false, team: v.team });
      this.phase = 'goal'; this.phaseT = 2.0;
    }
  }
  isLastDefender(p) {
    const d = this.dir(p.team);
    const behind = this.active(p.team).filter(q => q !== p && !q.isGK && q.x * d < p.x * d);
    return behind.length === 0;
  }

  // ------------------------------------------------------------------ team AI
  formationTarget(p, ballPos, attacking) {
    const t = p.team, d = this.dir(t), s = p.slot;
    const bx = ballPos.x * d; // ball x from this team's attacking perspective (-HL own goal .. HL opp goal)
    if (p.isGK) {
      const gx = -HL;
      const ang = Math.atan2(ballPos.z, bx - gx);
      const r = clamp((bx - gx) * 0.06, 0.8, 5.5);
      return { x: d * (gx + Math.cos(ang) * r), z: Math.sin(ang) * r * 0.8 };
    }
    // team block: depth follows the ball, width compresses towards ball side
    const tc = this.tactics[t];
    const blockShift = attacking ? clamp(bx * 0.55 + 10 + tc.mentality * 3.5, -12, 34) : clamp(bx * 0.55 - 6 + (tc.line - 1) * 6 + tc.mentality * 2, -26, 20);
    const depth = attacking ? 0.52 + tc.mentality * 0.02 : 0.4 - (tc.line - 1) * 0.03;
    let x = s.x * HL * depth + blockShift;
    const lineMin = attacking ? -HL + 14 : -HL + 6;
    x = clamp(x, lineMin, HL - 6);
    const width = attacking ? 0.72 + tc.width * 0.13 : 0.52 + tc.width * 0.08;
    let z = s.y * HW * width + ballPos.z * (attacking ? 0.2 : 0.35);
    // don't stray offside
    if (attacking && !p.isGK) {
      const defs = this.active(this.opp(t)).map(o => o.x * d).sort((a, b) => b - a);
      const line = Math.max(defs[1] ?? HL, bx, 0);
      x = Math.min(x, line - 0.5);
    }
    return { x: d * x, z: clamp(z * d, -HW + 2, HW - 2) };
  }

  teamAI(dt) {
    const b = this.ball;
    const pt = this.possTeam();
    for (let t = 0; t < 2; t++) {
      const players = this.active(t);
      const attacking = pt === t;
      const opp = this.opp(t);
      // choose pressers
      let pressers = [];
      if (!attacking || !b.owner) {
        const target = b.owner || b;
        const cand = players.filter(p => !p.isGK).sort((a, c) => this.dist(a, target) - this.dist(c, target));
        const pr = this.tactics[t].pressing, ownHalf = b.x * this.dir(t) < 0;
        pressers = cand.slice(0, b.owner ? (pr === 0 && !ownHalf ? 1 : pr === 2 ? 3 : this.diff.press > 0.9 ? 2 : 1) : 1);
        // intended receiver chases a pass
      }
      for (const p of players) {
        if (p.human !== null) continue;
        p.aiT -= dt;
        if (b.owner === p) { this.aiCarrier(p, dt); continue; }
        if (this.phase === 'setpiece') { p.aiTarget = this.restPosition(p, this.setPiece); p.aiSprint = false; if (this.setPiece.taker === p) p.aiTarget = { x: p.x, z: p.z }; continue; }
        if (p.isGK) { this.aiKeeper(p, dt); continue; }
        // receiving a pass
        if (b.intended === p && !b.owner) { const ip = this.interceptPoint(p); p.aiTarget = ip; p.aiSprint = true; continue; }
        // loose ball: nearest chases
        if (!b.owner && pressers[0] === p) { p.aiTarget = this.interceptPoint(p); p.aiSprint = true; continue; }
        if (b.owner && b.owner.team === opp && pressers.includes(p)) {
          // press / contain: goal-side of the carrier
          const c = b.owner, og = this.ownGoalX(t);
          const a = Math.atan2(0 - c.z, og - c.x);
          const dd = pressers[0] === p ? 1.2 : 4;
          p.aiTarget = { x: c.x + Math.cos(a) * dd, z: c.z + Math.sin(a) * dd };
          p.aiSprint = this.dist(p, c) > 1.5;
          if (pressers[0] === p && this.dist(p, c) < 1.6 && p.aiT <= 0) {
            p.aiT = this.diff.react + 0.4;
            if (Math.random() < 0.35 * this.diff.press) this.tryTackle(p, false);
            else if (Math.random() < 0.11 * this.diff.press) this.tryTackle(p, true);
          }
          continue;
        }
        // human team-press call: second nearest closes down
        let tgt = this.formationTarget(p, b, attacking);
        if (attacking && b.owner && b.owner.team === t) {
          // off-ball runs
          const d = this.dir(t);
          if (p.slot.x > 0.3 && p.aiT <= 0) { p.runOffset = (Math.random() < 0.5 ? 1 : 0) * (4 + Math.random() * 8); p.aiT = 1.5 + Math.random() * 2; }
          if (p.slot.x > 0.3 && p.runOffset) {
            tgt.x += d * p.runOffset;
            const defs = this.active(opp).map(o => o.x * d).sort((a, c) => c - a);
            const line = Math.max(defs[1] ?? HL, b.x * d, 0);
            tgt.x = d * Math.min(tgt.x * d, line - 0.4);
          }
        } else if (!attacking) {
          // mark nearest attacker in own half
          const og = this.ownGoalX(t);
          const threats = this.active(opp).filter(o => !o.isGK && Math.abs(o.x - og) < HL * 0.9);
          let best = null, bd = 9;
          for (const o of threats) { const dd = hyp(o.x - tgt.x, o.z - tgt.z); if (dd < bd) { bd = dd; best = o; } }
          if (best) { const a = Math.atan2(0 - best.z, og - best.x); tgt = { x: lerp(tgt.x, best.x + Math.cos(a) * 1.8, 0.65), z: lerp(tgt.z, best.z + Math.sin(a) * 1.8, 0.65) }; }
        }
        p.aiTarget = tgt;
        p.aiSprint = hyp(tgt.x - p.x, tgt.z - p.z) > 8;
      }
    }
  }

  interceptPoint(p) {
    const b = this.ball;
    if (b.owner) return { x: b.owner.x, z: b.owner.z };
    const sp = 7 + p.pace / 30;
    let best = { x: b.x, z: b.z };
    // simulate ball path forward
    let x = b.x, z = b.z, vx = b.vx, vz = b.vz, y = b.y, vy = b.vy;
    for (let t = 0; t < 3; t += 0.1) {
      if (y <= BALL_R + 0.01 && Math.abs(vy) < 0.5) { vx *= Math.exp(-0.9 * 0.1); vz *= Math.exp(-0.9 * 0.1); }
      vy -= GRAV * 0.1; y = Math.max(BALL_R, y + vy * 0.1); if (y === BALL_R) vy = 0;
      x += vx * 0.1; z += vz * 0.1;
      if (hyp(x - p.x, z - p.z) <= sp * t + 0.5 && y < 2.2) { best = { x, z }; break; }
      best = { x, z };
    }
    return { x: clamp(best.x, -HL - 1, HL + 1), z: clamp(best.z, -HW - 1, HW + 1) };
  }

  aiCarrier(p, dt) {
    const d = this.dir(p.team), gx = this.goalX(p.team);
    const distGoal = hyp(gx - p.x, p.z);
    const pressure = this.pressureOn(p);
    // dribble direction: toward goal, avoiding nearest defender
    let tx = gx, tz = 0;
    if (distGoal > 30) tz = p.z * 0.6;
    let ax = tx - p.x, az = tz - p.z; const al = hyp(ax, az) || 1; ax /= al; az /= al;
    for (const o of this.active(this.opp(p.team))) {
      const ox = o.x - p.x, oz = o.z - p.z, od = hyp(ox, oz);
      if (od < 6 && od > 0.01 && (ox * ax + oz * az) > -1) { ax -= ox / od * (6 - od) / 6 * 0.9; az -= oz / od * (6 - od) / 6 * 0.9; }
    }
    // avoid touchlines
    if (Math.abs(p.z) > HW - 4) az -= Math.sign(p.z) * 0.8;
    const l = hyp(ax, az) || 1;
    p.aiTarget = { x: p.x + ax / l * 5, z: p.z + az / l * 5 };
    p.aiSprint = pressure < 0.3 && distGoal > 18 && p.stamina > 0.3;
    if (p.aiT > 0 || p.kickCD > 0) return;
    p.aiT = this.diff.react + 0.15 + Math.random() * 0.25;
    { const foe = this.nearestFoe(p, 2.6, 0.2); if (foe && p.dribbling > 68 && p.skillCD <= 0 && Math.random() < 0.2 + (p.dribbling - 68) / 120) { const r = Math.random(); this.doSkill(p, r < 0.3 ? 'stepover' : r < 0.55 ? 'sidestep' : r < 0.72 ? 'roulette' : r < 0.86 ? 'cut' : r < 0.95 ? 'nutmeg' : 'rainbow', Math.random() < 0.5 ? -1 : 1); return; } }
    // shoot?
    const angleOk = Math.abs(p.z) < 16 || distGoal < 12;
    // is the shooting lane blocked?
    let blocked = 0;
    for (const o of this.active(this.opp(p.team))) { if (o.isGK) continue; const ox = o.x - p.x, oz = o.z - p.z; const along = (ox * (gx - p.x) + oz * (0 - p.z)) / (distGoal || 1); if (along > 0 && along < distGoal) { const perp = Math.abs(ox * (0 - p.z) - oz * (gx - p.x)) / (distGoal || 1); if (perp < 1.2) blocked++; } }
    const pShoot = distGoal < 11 ? 0.85 : distGoal < 17 ? 0.5 : distGoal < this.diff.shootDist ? 0.14 + (p.shooting - 60) / 300 : 0;
    if (angleOk && pShoot > 0 && Math.random() < pShoot * (blocked ? 0.35 : 1)) {
      const k = this.keeper(this.opp(p.team));
      const side = k ? (k.z > 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
      this.shootAt(p, { x: gx, y: 0.3 + Math.random() * 1.4, z: side * (GHW - 1.0 - Math.random() * 1.6) }, 0.5 + Math.random() * 0.35);
      return;
    }
    // cross from wide in final third
    if (Math.abs(p.z) > HW * 0.5 && Math.abs(gx - p.x) < 22 && Math.random() < 0.5) {
      this.lobTo(p, { x: gx - d * (6 + Math.random() * 6), z: -Math.sign(p.z) * Math.random() * 7 }, true); return;
    }
    // pass?
    const t = this.bestPassTarget(p, null, 'short');
    const passProb = 0.25 + pressure * 0.6 + (1 - this.tactics[p.team].passing) * 0.12;
    if (t && t.score > 12 && Math.random() < passProb) {
      const fwd = (t.p.x - p.x) * d;
      const style = this.tactics[p.team].passing;
      if (fwd > 12 && Math.random() < 0.2 + style * 0.12) this.throughBall(p, t.p); else if (this.dist(p, t.p) > (style === 2 ? 22 : 30)) this.passTo(p, t.p, 'lob'); else this.passTo(p, t.p);
    }
  }

  aiKeeper(k, dt) {
    const b = this.ball, t = k.team, og = this.ownGoalX(t), d = this.dir(t);
    if (k.keeperHold > 0) {
      k.keeperHold -= dt;
      k.aiTarget = { x: og + d * 4, z: k.z * 0.9 };
      b.x = k.x + Math.sin(k.face) * 0.4; b.z = k.z + Math.cos(k.face) * 0.4; b.y = 1.2; b.vx = b.vy = b.vz = 0;
      if (k.keeperHold <= 0) {
        b.heldBy = null;
        const tgt = this.bestPassTarget(k, null, 'long');
        if (tgt && this.dist(k, tgt.p) < 30) { this.passTo(k, tgt.p, 'throw'); k.animOnce = 'KeeperThrow'; k.animOnceT = 0.8; }
        else { this.lobTo(k, { x: d * (5 + Math.random() * 15), z: (Math.random() - 0.5) * 40 }, false); }
      }
      return;
    }
    const sk = this.keeperSkill(k), gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
    if (k.smotherCD > 0) k.smotherCD -= dt;
    // positioning: on the line between ball and goal, coming out to close the angle as the attacker gets closer
    const base = this.formationTarget(k, b, false);
    k.aiTarget = base; k.aiSprint = false;
    const inBox = Math.abs(b.x - og) < BOX_D - 2 && Math.abs(b.z) < BOX_W / 2 - 4 && Math.sign(b.x) === Math.sign(og);
    const carrier = b.owner && b.owner.team !== t ? b.owner : null;
    if (carrier && !k.dive) {
      const dg = hyp(carrier.x - og, carrier.z);
      if (dg < 24 && Math.abs(carrier.z) < 20) { // narrow the angle
        const r = clamp((24 - dg) * 0.32 * (0.6 + 0.5 * sk), 0, 7.5), a = Math.atan2(carrier.z, (carrier.x - og) * d);
        k.aiTarget = { x: og + d * (1 + Math.cos(a) * r), z: Math.sin(a) * r * 0.9 + carrier.z * 0.12 }; k.aiSprint = r > 3;
      }
      // smother: dive at the feet of a carrier who is within reach (a good dribbler can still beat it)
      if (inBox && this.dist(k, carrier) < 2.4 && k.smotherCD <= 0 && !k.stun) {
        k.smotherCD = 1.8;
        const win = clamp(0.38 + 0.4 * sk - (carrier.dribbling - 70) / 160 - (carrier.shield > 0 ? 0.3 : 0) - (carrier.skillT > 0 ? 0.3 : 0), 0.08, 0.85);
        k.face = Math.atan2(carrier.x - k.x, carrier.z - k.z);
        k.animOnce = (carrier.z - k.z) * -d > 0 ? 'KeeperDiveLeft' : 'KeeperDiveRight'; k.animOnceT = 0.9;
        if (Math.random() < win) { b.owner = null; this.keeperCatch(k); return; }
        k.stun = 0.9; if (Math.random() < 0.16 && this.phase === 'play') this.foul(k, carrier, { x: carrier.x, z: carrier.z });
        return;
      }
    }
    // loose ball in or just outside the box: sweep it up if the keeper wins the race
    if (!b.owner && b.y < 1.5 && hyp(b.vx, b.vz) < 14 && Math.abs(b.x - og) < BOX_D + 4 && Math.abs(b.z) < BOX_W / 2) {
      const ip = this.interceptPoint(k), rival = this.active(this.opp(t)).reduce((m, o) => Math.min(m, this.dist(o, ip) / 7.5), 9);
      if (this.dist(k, ip) / (6.5 + 2 * sk) < rival + 0.25) { k.aiTarget = ip; k.aiSprint = true; }
    }
    // high ball into the box (cross, corner): claim it when the keeper can get there first
    if (!b.owner && !b.shot && b.y > 0.8 && hyp(b.vx, b.vz) > 5 && Math.abs(b.x - og) < BOX_D + 10) {
      const L = this.landing(b);
      if (L && Math.abs(L.x - og) < BOX_D - 1 && Math.abs(L.z) < 14 && Math.sign(L.x) === Math.sign(og)) {
        const tk = this.dist(k, L) / (6.2 + 2.2 * sk) + 0.2 + (1 - sk) * 0.25, ta = this.active(this.opp(t)).reduce((m, o) => Math.min(m, this.dist(o, L) / 7 + 0.35), 9);
        if (tk < L.t - 0.05 && tk < ta + 0.35 * sk) { k.aiTarget = { x: L.x, z: L.z }; k.aiSprint = true; }
      }
    }
    // shot coming: the keeper needs time to see it, reads the flight with some error, and can only dive so far in the time left
    if (!b.owner && (b.vx * -d) > 4 && k.dive <= 0 && k.kickCD <= 0) {
      const Tg = (og - b.x) / b.vx;
      if (Tg > 0 && Tg < 1.6) {
        const zGoal = b.z + b.vz * Tg, yGoal = b.y + b.vy * Tg - 0.5 * 9.81 * Tg * Tg;
        if (Math.abs(zGoal) < GHW + 0.7 && yGoal < GOAL_H + 0.5) {
          const since = b.shot ? b.shot.t : b.lastKick ? b.lastKick.t : 0, pen = b.shot && b.shot.pen;
          if (pen && !k.penGuess) { // penalty: the keeper must commit early, picking a side (sometimes reading the taker)
            const see = 0.1 + 0.2 * sk, r = Math.random(); k.penGuess = r < see ? Math.sign(zGoal || 1) : r < see + 0.14 ? 0 : (Math.random() < 0.5 ? -1 : 1);
            if (k.penGuess) { k.dive = 0.9; k.diveDir = k.penGuess; k.diveReach = 2.5 + sk * 0.6; k.diveZ = k.penGuess * 2.6; k.diveY = 0.6; k.animOnce = k.diveDir * -d > 0 ? 'KeeperDiveLeft' : 'KeeperDiveRight'; k.animOnceT = 1.0; }
          } else if (!pen && since >= 0.16 + (1 - sk) * 0.26 + this.diff.react * 0.1) {
            const Tk = Math.max(0.02, (k.x - b.x) / b.vx), zAt = b.z + b.vz * Tk, yAt = b.y + b.vy * Tk - 0.5 * 9.81 * Tk * Tk;
            const sigma = 0.3 + (1 - sk) * 1.15 + Math.min(1.2, Math.abs(b.spin || 0) * 0.25), zP = zAt + gauss() * sigma, need = zP - k.z;
            k.aiTarget = { x: k.x, z: clamp(zP, -GHW - 0.5, GHW + 0.5) };
            if (Math.abs(need) > 0.6) {
              const frac = clamp(Tk / 0.4, 0.3, 1), reach = Math.min((1.2 + 1.3 * sk) * frac, Math.abs(need) + 0.3);
              k.dive = 0.9; k.diveDir = Math.sign(need); k.diveReach = reach; k.diveZ = zP; k.diveY = yAt;
              k.animOnce = k.diveDir * -d > 0 ? 'KeeperDiveLeft' : 'KeeperDiveRight'; k.animOnceT = 1.0;
            }
          }
        }
      }
    } else if (!b.shot || b.shot.pen === false) k.penGuess = 0;
  }
  // where (and when) a flying ball comes down within the keeper's reach
  landing(b) {
    let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz;
    for (let t = 0; t < 2.6; t += 0.05) { vy -= GRAV * 0.05; x += vx * 0.05; y += vy * 0.05; z += vz * 0.05; if (vy < 0 && y <= 2.3) return { x, z, t }; }
    return null;
  }
  keeperSkill(k) { const base = ((k.info.rating || 70) - 50) / 45; return clamp(base * 0.6 + (k.human === null ? this.diff.keeper * 0.4 : 0.3), 0.2, 1); }

  // ------------------------------------------------------------------ movement
  moveAll(dt, _unused, idle) {
    const ballLive = this.phase === 'play';
    for (const p of this.all) {
      if (p.sentOff) continue;
      p.kickCD = Math.max(0, p.kickCD - dt); p.controlCD = Math.max(0, p.controlCD - dt); if (p.shield > 0) p.shield -= dt;
      if (p.skillT > 0) p.skillT -= dt; if (p.skillCD > 0) p.skillCD -= dt; if (p.hop > 0) p.hop = Math.max(0, p.hop - dt * 2.2); if (p.spinT > 0) p.spinT -= dt;
      if (p.wrong > 0) { p.wrong -= dt; p.vx *= Math.exp(-10 * dt); p.vz *= Math.exp(-10 * dt); }
      if (p.animOnceT > 0) { p.animOnceT -= dt; if (p.animOnceT <= 0) p.animOnce = null; }
      if (p.stun > 0) p.stun -= dt;
      let mx = 0, mz = 0, sprint = false;
      if (idle) {
        // drift towards formation / celebrate
        if (this.phase === 'goal' && p.celebrating) { mx = 0; mz = 0; }
        else { const tg = this.formationTarget(p, { x: 0, z: 0 }, false); const dx = tg.x - p.x, dz = tg.z - p.z, dl = hyp(dx, dz); if (dl > 1 && this.phase !== 'goal') { mx = dx / dl * 0.5; mz = dz / dl * 0.5; } }
      } else if (p.human !== null && p.humanMove) {
        mx = p.humanMove.x; mz = p.humanMove.z; sprint = p.humanMove.sprint;
        // pressing assist: move toward carrier
        if (p.pressing && this.ball.owner) {
          const c = this.ball.owner, og = this.ownGoalX(p.team), a = Math.atan2(0 - c.z, og - c.x);
          const tx = c.x + Math.cos(a) * 1.1, tz = c.z + Math.sin(a) * 1.1, dx = tx - p.x, dz = tz - p.z, dl = hyp(dx, dz);
          if (dl > 0.3) { mx = dx / dl; mz = dz / dl; }
          if (dl < 1.6 && Math.random() < dt * 1.2) this.tryTackle(p, false);
        }
      } else if (p.aiTarget) {
        const dx = p.aiTarget.x - p.x, dz = p.aiTarget.z - p.z, dl = hyp(dx, dz);
        if (dl > 0.35) { const s = clamp(dl / 3, 0, 1); mx = dx / dl * s; mz = dz / dl * s; }
        sprint = p.aiSprint;
      }
      // speed
      const paceF = 0.85 + p.pace / 400;
      // keyboard assist: moving = sprinting (no Shift combos on laptop keyboards); drains stamina more slowly
      let auto = false;
      if (!sprint && p.human !== null && this.cfg.assist !== false && this.cfg.autoSprint !== false && this.isKb(p) && Math.hypot(mx, mz) > 0.3 && p.stamina > 0.3 && !p.charging) { sprint = true; auto = true; }
      let top = (sprint && p.stamina > 0.08 ? (auto ? 8.1 : 8.6) : 6.4) * paceF * (p.human === null ? this.diff.speed : 1);
      if (this.ball.owner === p) top *= this.assistOn(p) ? 0.97 + p.dribbling / 1500 : 0.88 + p.dribbling / 1000;
      if (p.burst > 0) { p.burst -= dt; top *= 1.2; }
      if (p.charging) top *= 0.7;
      const moving = hyp(mx, mz) > 0.1;
      if (this.phase === 'play') p.fatigue = Math.min(0.45, p.fatigue + dt * (sprint && moving ? 0.0016 : 0.00045) * (1.35 - p.physical / 130) * (150 / this.halfLength));
      if (sprint && moving) p.stamina = Math.max(0, p.stamina - dt * 0.045 * (auto ? 0.45 : 1) * (1.4 - p.physical / 120)); else p.stamina = Math.min(1 - p.fatigue, p.stamina + dt * 0.02);
      top *= 0.8 + p.stamina * 0.2;

      if (p.action === 'slide') {
        p.actionT -= dt;
        const spd = 9 * Math.max(0, p.actionT / 0.85) + 1;
        p.vx = p.slideDX * spd; p.vz = p.slideDZ * spd;
        this.slideContact(p);
        if (p.actionT <= 0) { p.action = 'recover'; p.actionT = 0.45; }
      } else if (p.action === 'recover' || p.action === 'stand' || p.stun > 0 || (p.dive > 0)) {
        if (p.action) { p.actionT -= dt; if (p.actionT <= 0) p.action = null; }
        p.vx *= Math.exp(-8 * dt); p.vz *= Math.exp(-8 * dt);
      } else {
        const ACC = 26 * (0.8 + p.pace / 500) * (this.assistOn(p) ? 1.4 : 1);
        const tx = mx * top, tz = mz * top;
        const dvx = tx - p.vx, dvz = tz - p.vz, dl = hyp(dvx, dvz), a = ACC * dt;
        if (dl <= a) { p.vx = tx; p.vz = tz; } else { p.vx += dvx / dl * a; p.vz += dvz / dl * a; }
        // facing
        let fa = null;
        if (moving) fa = Math.atan2(mx, mz);
        else if (!idle) fa = Math.atan2(this.ball.x - p.x, this.ball.z - p.z);
        if (fa !== null) p.face += angNorm(fa - p.face) * Math.min(1, dt * (moving ? 12 : 4));
      }
      // keeper dive motion
      if (p.dive > 0) {
        p.dive -= dt;
        const t = 0.9 - p.dive;
        if (t < 0.35) { p.z += p.diveDir * p.diveReach / 0.35 * dt; }
        this.keeperSave(p);
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.x = clamp(p.x, -HL - 3, HL + 3); p.z = clamp(p.z, -HW - 3, HW + 3);
      // kickoff: stay in own half until ball played
      if (this.phase === 'setpiece' && this.setPiece.type === 'kickoff') {
        const d = this.dir(p.team);
        if (p.x * d > -0.2 && p !== this.setPiece.taker) p.x = -d * 0.2;
        if (p.team !== this.setPiece.team && hyp(p.x, p.z) < PITCH.CIRCLE) { const a = Math.atan2(p.z, p.x); p.x = Math.cos(a) * PITCH.CIRCLE; p.z = Math.sin(a) * PITCH.CIRCLE; }
      }
      if (this.phase === 'setpiece' && this.setPiece.taker === p) { p.vx = p.vz = 0; }
      // animation state
      const v = hyp(p.vx, p.vz);
      p.anim = p.animOnce || (p.action === 'slide' ? 'Tackle' : p.stun > 0.3 ? 'Fall' : v > 7.4 ? 'Sprint' : v > 4.2 ? 'Run' : v > 0.6 ? 'Jog' : (p.isGK ? 'KeeperIdle' : 'Idle'));
      p.speed = v;
    }
  }

  slideContact(p) {
    const b = this.ball;
    if (p.slideHit) return;
    const db = hyp(b.x - p.x - p.slideDX * 0.6, b.z - p.z - p.slideDZ * 0.6);
    if (db < 1.0 && b.y < 0.8) {
      // won the ball
      const c = b.owner;
      if (c && c.team !== p.team) { c.stun = 0.9; c.animOnce = 'Fall'; c.animOnceT = 1.2; }
      b.owner = null; b.heldBy = null;
      b.vx = p.slideDX * 8 + (Math.random() - 0.5) * 3; b.vz = p.slideDZ * 8 + (Math.random() - 0.5) * 3; b.vy = 1;
      b.lastTouch = p; b.intended = null;
      p.slideHit = true;
      this.emit('tackle', { p, won: true, slide: true });
      return;
    }
    for (const o of this.active(this.opp(p.team))) {
      if (o.isGK && o.keeperHold > 0) continue;
      if (hyp(o.x - p.x, o.z - p.z) < 1.05 && o.stun <= 0) {
        p.slideHit = true;
        const hadBall = b.owner === o || this.dist(o, b) < 2.5;
        const fromBehind = Math.cos(p.face - o.face) > 0.4;
        const foulChance = hadBall ? (fromBehind ? 0.9 : 0.55) : 0.95;
        if (Math.random() < foulChance && this.phase === 'play') this.foul(p, o, { x: o.x, z: o.z });
        else { o.stun = 0.9; o.animOnce = 'Fall'; o.animOnceT = 1.2; if (b.owner === o) this.looseBall(o, p, 3); }
        return;
      }
    }
  }

  // 3D "can the hands get there" test; returns 0 (dead centre) .. 1 (fingertips) or null when out of reach
  keeperReachQ(k, diving) {
    const b = this.ball, dx = b.x - k.x, dz = b.z - k.z, dy = b.y - (diving ? 1.0 : 1.15), sk = this.keeperSkill(k);
    const m = Math.sqrt((dx * 0.9) ** 2 + dz ** 2 + (dy * 0.85) ** 2), R = (diving ? 1.3 : 1.05) * (0.92 + 0.16 * sk);
    return m < R ? m / R : null;
  }
  keeperSave(k) {
    const b = this.ball;
    if (b.owner || k.keeperHold > 0 || k.kickCD > 0 || b.heldBy) return;
    const q = this.keeperReachQ(k, true); if (q !== null) this.keeperHandle(k, q, true);
  }
  // the keeper gets a hand/hands to the ball: hold it, tip it over, or push it away - speed, placement, weather and keeper quality decide
  keeperHandle(k, q, diving) {
    const b = this.ball, sk = this.keeperSkill(k), spd = hyp(b.vx, b.vz, b.vy * 0.5);
    const spdF = spd < 8 ? 1 : spd < 14 ? 0.92 : spd < 20 ? 0.76 : spd < 26 ? 0.55 : 0.34;
    const w = this.cfg.weather, wet = w === 'storm' ? 0.18 : w === 'rain' ? 0.12 : w === 'snow' ? 0.05 : 0;
    const catchP = clamp(spdF * (0.5 + 0.55 * sk) * (1 - 0.55 * q) - wet - (b.y > 2.1 ? 0.12 : 0) - (diving ? 0.1 : 0), 0.03, 0.97);
    if (Math.random() < catchP) this.keeperCatch(k);
    else this.parry(k, b.y > 1.9 && q > 0.35);
  }
  // control branch: a ball reaches the keeper standing in his box
  keeperStand(k) {
    const b = this.ball, q = this.keeperReachQ(k, false); if (q === null) return false;
    if (hyp(b.vx, b.vz) < 8) { this.keeperCatch(k); return true; }   // collects gentle balls
    this.keeperHandle(k, q, false); return true;
  }
  keeperCatch(k) {
    const b = this.ball, fast = hyp(b.vx, b.vz) > 12 || b.shot;
    b.owner = null; b.heldBy = k; b.vx = b.vy = b.vz = 0; b.shot = null; b.intended = null;
    if (fast) { k.ps.saves++; k.ps.rating += 0.45; }
    k.keeperHold = 1.6; k.dive = 0; b.lastTouch = k;
    k.animOnce = 'KeeperCatch'; k.animOnceT = 0.6;
    this.emit('save', { k, caught: true });
  }
  parry(k, tip) {
    const b = this.ball, d = this.dir(k.team), sk = this.keeperSkill(k);
    if (tip) { b.vx = -d * (2 + Math.random() * 2); b.vz = (b.z >= 0 ? 1 : -1) * (1 + Math.random() * 3); b.vy = 4.5 + Math.random() * 2; }       // tipped over the bar
    else if (Math.random() < 0.08 + 0.3 * (1 - sk)) { b.vx = d * (1.5 + Math.random() * 2.5); b.vz = (Math.random() - 0.5) * 3; b.vy = 1 + Math.random() * 1.5; } // spilled in front of goal
    else { b.vx = d * (2 + Math.random() * 3.5); b.vz = (b.z >= k.z ? 1 : -1) * (5 + Math.random() * (5 + 4 * sk)); b.vy = 2 + Math.random() * 3; }              // pushed wide
    b.lastTouch = k; b.shot = null; b.intended = null;
    k.kickCD = 0.55 - 0.2 * sk; k.controlCD = 0.55 - 0.2 * sk; k.dive = 0;
    this.emit('save', { k, caught: false });
  }

  // ------------------------------------------------------------------ ball physics & rules
  updateBall(dt, noRules) {
    const b = this.ball;
    if (b.lastKick) b.lastKick.t += dt;
    if (b.shot) b.shot.t += dt;
    if (b.heldBy) return;
    if (b.owner) {
      const o = b.owner;
      const v = hyp(o.vx, o.vz);
      const ahead = 0.55 + v * 0.06;
      const tx = o.x + Math.sin(o.face) * ahead, tz = o.z + Math.cos(o.face) * ahead;
      const k = this.assistOn(o) ? 28 : 18;
      b.x = lerp(b.x, tx, Math.min(1, dt * k)); b.z = lerp(b.z, tz, Math.min(1, dt * k)); b.y = BALL_R;
      b.vx = o.vx; b.vz = o.vz; b.vy = 0;
      // roll rotation handled by renderer from velocity
    } else {
      b.vy -= GRAV * dt;
      // curve (spin) perpendicular to velocity
      if (b.spin) { const sp = hyp(b.vx, b.vz) || 1; b.vx += -b.vz / sp * b.spin * dt; b.vz += b.vx / sp * b.spin * dt; b.spin *= Math.exp(-0.8 * dt); }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= BALL_R) {
        b.y = BALL_R;
        if (b.vy < -1.5) { b.vy = -b.vy * 0.55; this.emit('bounce', { v: b.vy }); } else b.vy = 0;
        const f = Math.exp(-this.groundFriction * dt); b.vx *= f; b.vz *= f;
        const sp = hyp(b.vx, b.vz); if (sp < 0.4) { b.vx *= Math.exp(-4 * dt); b.vz *= Math.exp(-4 * dt); }
      } else { const f = Math.exp(-0.08 * dt); b.vx *= f; b.vz *= f; b.vx += this.wind.x * dt; b.vz += this.wind.z * dt; }
    }
    // goal frame collisions
    for (const s of [-1, 1]) {
      const gx = s * HL;
      for (const pz of [-GHW, GHW]) { // posts
        const dx = b.x - gx, dz = b.z - pz, d = hyp(dx, dz);
        if (d < BALL_R + 0.06 && b.y < GOAL_H) { const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vz -= 1.7 * vn * nz; this.emit('post'); } b.x = gx + nx * (BALL_R + 0.07); b.z = pz + nz * (BALL_R + 0.07); }
      }
      // crossbar
      if (Math.abs(b.z) < GHW) { const dx = b.x - gx, dy = b.y - GOAL_H, d = hyp(dx, dy); if (d < BALL_R + 0.06) { const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; this.emit('post'); } b.x = gx + nx * (BALL_R + 0.07); b.y = GOAL_H + ny * (BALL_R + 0.07); } }
      // net (inside goal)
      if (Math.sign(b.x) === s && Math.abs(b.x) > HL && Math.abs(b.x) < HL + GOAL_D + 0.5 && Math.abs(b.z) < GHW + 0.1 && b.y < GOAL_H + 0.1 && b.inGoal) {
        if (Math.abs(b.x) > HL + GOAL_D - BALL_R) { b.x = s * (HL + GOAL_D - BALL_R); b.vx *= -0.15; b.vz *= 0.6; this.emit('net', { side: s }); }
        if (Math.abs(b.z) > GHW - BALL_R) { b.z = Math.sign(b.z) * (GHW - BALL_R); b.vz *= -0.2; this.emit('net', { side: s }); }
        if (b.y > GOAL_H - BALL_R) { b.y = GOAL_H - BALL_R; b.vy *= -0.2; }
      }
    }
    if (noRules) {
      if (Math.abs(b.x) > HL + 6 || Math.abs(b.z) > HW + 6) { b.vx *= -0.3; b.vz *= -0.3; }
      return;
    }
    if (this.phase !== 'play') return;
    // goal?
    if (Math.abs(b.x) > HL + BALL_R && !b.inGoal) {
      const s = Math.sign(b.x);
      if (Math.abs(b.z) < GHW && b.y < GOAL_H) {
        b.inGoal = true;
        const scoringTeam = this.dir(0) === s ? 0 : 1;
        this.goal(scoringTeam);
        return;
      }
      // out over goal line
      const defending = this.dir(0) === s ? 1 : 0;
      const attackerTouched = b.lastTouch && b.lastTouch.team !== defending;
      if (attackerTouched || !b.lastTouch) this.stopPlay('out', { type: 'goalkick', team: defending, x: s * (HL - PITCH.SIX_D), z: Math.sign(b.z || 1) * PITCH.SIX_W / 2 * 0.6 });
      else { this.stats[1 - defending].corners++; this.stopPlay('out', { type: 'corner', team: 1 - defending, x: s * (HL - 0.4), z: Math.sign(b.z || 1) * (HW - 0.4) }); }
      return;
    }
    if (Math.abs(b.z) > HW + BALL_R) {
      const team = b.lastTouch ? 1 - b.lastTouch.team : 0;
      this.stopPlay('out', { type: 'throwin', team, x: clamp(b.x, -HL + 1, HL - 1), z: Math.sign(b.z) * (HW + 0.3) });
      return;
    }
  }

  goal(team) {
    const b = this.ball;
    const scorer = b.lastTouch;
    const own = scorer && scorer.team !== team;
    this.score[team]++;
    const entry = { team, minute: this.minute(), label: this.clockLabel(), player: scorer ? scorer.info : null, own };
    this.scorers.push(entry);
    if (scorer && !own) { scorer.ps.goals++; scorer.ps.rating += 1.1; }
    const a = this.lastAssist; if (a && a.team === team && a !== scorer && !own) { a.ps.assists++; a.ps.rating += 0.6; entry.assist = a.info; }
    const k = this.keeper(1 - team); if (k) k.ps.rating -= 0.3;
    this.added[this.half] += 0.5;
    this.phase = 'goal'; this.phaseT = 0;
    for (const p of this.all) p.celebrating = p.team === team;
    if (scorer && !own) { scorer.animOnce = 'Celebrate'; scorer.animOnceT = 4; }
    this.pending = { reason: 'goal', team: 1 - team };
    this.emit('goal', entry);
    if (this.cfg.var !== false && !this.shootoutMode && Math.random() < 0.14) {
      const overturn = Math.random() < 0.3;
      this.var = { team, entry, scorer, overturn, reason: Math.random() < 0.6 ? 'Offside' : 'Foul in the build-up' };
      this.phase = 'var'; this.phaseT = 0;
      this.emit('var', { team });
    }
  }

  afterGoal() { this.ball.inGoal = false; for (const p of this.all) p.celebrating = false; this.resolvePending(); }

  collisions() {
    const b = this.ball;
    if (this.setPieceGuard) { this.setPieceGuard.t -= 1 / 120; if (this.setPieceGuard.t <= 0) this.setPieceGuard = null; }
    // player-player separation
    const act = this.all.filter(p => !p.sentOff);
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
      const a = act[i], c = act[j]; const dx = c.x - a.x, dz = c.z - a.z, d = hyp(dx, dz), min = PR * 2;
      if (d > 0.001 && d < min) { const push = (min - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * push; a.z -= nz * push; c.x += nx * push; c.z += nz * push; }
    }
    if (this.phase !== 'play' || b.heldBy) return;
    // ball control
    if (b.owner) {
      // contested by opponents (shielding vs strength)
      const o = b.owner;
      for (const q of this.active(this.opp(o.team))) {
        if (q.stun > 0 || q.action || q.isGK || q.wrong > 0 || (q.human !== null && this.cfg.assist === false)) continue;
        if (o.shield > 0 || o.skillT > 0) continue;
        if (this.dist(q, b) < 0.8 && Math.random() < (1 / 120) * 0.38 * (q.defending / o.dribbling) * (o.burst > 0 ? 0.5 : 1) * (this.assistOn(o) ? 0.5 : 1)) { this.looseBall(o, q, 3); o.controlCD = 0.4; break; }
      }
      return;
    }
    let best = null, bd = 99;
    for (const p of act) {
      if (p.controlCD > 0 || p.stun > 0 || p.action === 'slide' || (this.setPieceGuard && this.setPieceGuard.taker === p)) continue;
      const d = this.dist(p, b);
      const reach = p.isGK && this.inOwnBox(p) ? 1.4 : CONTROL_R + (this.assistOn(p) ? 0.3 : 0);
      const maxY = p.isGK && this.inOwnBox(p) ? 2.5 : 1.1;
      if (d < reach && b.y < maxY && d < bd) { best = p; bd = d; }
    }
    if (!best) {
      // headers for airborne balls at head height
      for (const p of act) {
        if (p.isGK || p.controlCD > 0 || p.stun > 0) continue;
        if (this.dist(p, b) < 0.9 && b.y > 1.2 && b.y < 2.5 && p.kickCD <= 0 && p.human === null) { this.aiHeader(p); return; }
      }
      return;
    }
    const p = best;
    const relSpeed = hyp(b.vx - p.vx, b.vz - p.vz);
    // offside check on receiving a pass
    if (this.offsideSnap && this.offsideSnap.team === p.team && this.offsideSnap.flagged.has(p) && b.lastKick && b.lastKick.p.team === p.team && b.lastKick.p !== p) {
      this.offsideSnap = null; this.stats[p.team].offsides++;
      (p.x < 0 ? this.officials[1] : this.officials[2]).flag = 2.5;
      this.emit('offside', { p });
      this.stopPlay('offside', { type: 'freekick', team: this.opp(p.team), x: clamp(p.x, -HL + 1, HL - 1), z: clamp(p.z, -HW + 1, HW - 1) });
      return;
    }
    this.offsideSnap = null;
    if (p.isGK && this.inOwnBox(p) && (b.lastTouch === null || b.lastTouch.team !== p.team || b.lastKick?.kind !== 'pass')) {
      if (this.keeperStand(p)) return;
    }
    const controlLimit = 14 + p.dribbling / 8 + (b.intended === p ? 6 : 0) + (this.assistOn(p) ? 6 : 0);
    if (relSpeed < controlLimit) {
      if (b.passFrom && b.passFrom.team === p.team && b.passFrom !== p) { this.stats[p.team].passesOk++; b.passFrom.ps.passesOk++; b.passFrom.ps.rating += 0.03; this.lastAssist = b.passFrom; } else if (!b.passFrom || b.passFrom.team !== p.team) this.lastAssist = null;
      b.owner = p; b.lastTouch = p; b.intended = null; b.passFrom = null; b.shot = null; b.landing = null;
      // auto-switch the human on this team to the receiver
      const h = this.humans.find(h => h.team === p.team && h.player !== p && !this.humans.some(o => o.player === p));
      if (h && p.human === null && !p.isGK) {
        const other = this.humans.find(o => o.team === p.team && o !== h);
        // co-op: switch the human who is closest to the receiver
        let pick = h; if (other && other.player && this.dist(other.player, p) < this.dist(h.player || p, p)) pick = other;
        this.setHuman(pick, p);
      }
      this.emit('control', { p });
    } else {
      // deflection
      const nx = (b.x - p.x) / (bd || 1), nz = (b.z - p.z) / (bd || 1), vn = (b.vx - p.vx) * nx + (b.vz - p.vz) * nz;
      if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vz -= 1.4 * vn * nz; b.vx *= 0.6; b.vz *= 0.6; }
      b.lastTouch = p; p.controlCD = 0.3; b.shot = null;
      this.emit('deflect', { p });
    }
  }
  inOwnBox(p) { const og = this.ownGoalX(p.team); return Math.abs(p.x - og) < BOX_D && Math.abs(p.z) < BOX_W / 2; }

  aiHeader(p) {
    const gx = this.goalX(p.team), distGoal = hyp(gx - p.x, p.z);
    if (distGoal < 16) this.header(p, { x: gx, y: 0.6 + Math.random() * 1.6, z: (Math.random() - 0.5) * (GOAL_W - 1.5) });
    else {
      const t = this.bestPassTarget(p, null, 'short');
      const tgt = t ? t.p : { x: p.x + this.dir(p.team) * 12, z: p.z };
      const dx = tgt.x - p.x, dz = tgt.z - p.z, d = hyp(dx, dz) || 1;
      this.kickBall(p, dx / d * 11, 3, dz / d * 11, 0, 'header');
      p.animOnce = 'Header'; p.animOnceT = 0.6;
    }
  }

  // ------------------------------------------------------------------ replay buffer
  recordReplay(dt) {
    this.replayT += dt;
    if (this.replayT < 1 / 30) return;
    this.replayT = 0;
    const snap = { b: [this.ball.x, this.ball.y, this.ball.z], p: this.all.map(p => [p.x, p.z, p.face, p.anim, p.speed || 0, p.sentOff ? 1 : 0]) };
    this.replay.push(snap);
    if (this.replay.length > 30 * 8) this.replay.shift();
  }
}

// final match ratings (call after full time)
export function playerRatings(m) {
  const out = [];
  for (const p of m.all) {
    let r = p.ps.rating;
    const won = m.score[p.team] > m.score[1 - p.team], lost = m.score[p.team] < m.score[1 - p.team];
    r += won ? 0.4 : lost ? -0.3 : 0;
    if (p.isGK && m.score[1 - p.team] === 0) r += 0.8;
    if (p.slot && p.slot.pos && /CB|LB|RB/.test(p.slot.pos) && m.score[1 - p.team] === 0) r += 0.4;
    r += (p.ps.passesOk / Math.max(1, p.ps.passes) - 0.7) * 1.2;
    out.push({ team: p.team, name: p.info.name, number: p.info.number, pos: p.slot.pos, rating: Math.max(3, Math.min(10, Math.round(r * 10) / 10)), goals: p.ps.goals, assists: p.ps.assists });
  }
  out.sort((a, b) => b.rating - a.rating);
  return out;
}

// pick 11 starters matching the formation slots
export function pickStarters(squad, slots) {
  const pool = squad.slice();
  const out = [];
  const compat = {
    GK: ['GK'], CB: ['CB', 'CDM', 'LB', 'RB'], LB: ['LB', 'LM', 'CB', 'RB'], RB: ['RB', 'RM', 'CB', 'LB'], LWB: ['LB', 'LM', 'LW'], RWB: ['RB', 'RM', 'RW'],
    CDM: ['CDM', 'CM', 'CB'], CM: ['CM', 'CDM', 'CAM'], CAM: ['CAM', 'CM', 'ST', 'LW', 'RW'], LM: ['LM', 'LW', 'CM', 'LB'], RM: ['RM', 'RW', 'CM', 'RB'],
    LW: ['LW', 'LM', 'ST', 'CAM'], RW: ['RW', 'RM', 'ST', 'CAM'], ST: ['ST', 'CF', 'CAM', 'LW', 'RW'], CF: ['CF', 'ST', 'CAM'],
  };
  for (const s of slots) {
    const prefs = compat[s.pos] || [s.pos];
    let pick = null;
    for (const pos of prefs) {
      const cands = pool.filter(p => p.pos === pos).sort((a, b) => b.rating - a.rating);
      if (cands.length) { pick = cands[0]; break; }
    }
    if (!pick) pick = pool.filter(p => p.pos !== 'GK' || s.pos === 'GK').sort((a, b) => b.rating - a.rating)[0] || pool[0];
    out.push(pick); pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
