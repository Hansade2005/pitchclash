// Pedestrians crossing the street on City Rush stages. Knock one over and the police come for you.
import { makePerson } from './assets.js';
import * as audio from './audio.js';

export class Peds {
  constructor(race, n) {
    this.race = race; const T = this.T = race.T; this.list = [];
    for (let k = 0; k < n; k++) {
      let i = Math.floor(T.N * (k + 0.6) / n); if (i > T.tunnel[0] - 8 && i < T.tunnel[1] + 8) i = T.tunnel[1] + 12; i = Math.min(T.N - 40, Math.max(50, i)); while (T.elev && T.elev[i] > 0.2) i = (i + 9) % T.N;
      const p = makePerson(k + 2), edge = T.half + 2.4; p.play('Walk', 0); race.world.group.add(p.root);
      this.list.push({ p, i, lat: (k % 2 ? 1 : -1) * edge, dir: k % 2 ? -1 : 1, wait: 1 + k * 1.7, down: 0, vx: 0, vy: 0, vz: 0, y: 0, x: 0, z: 0, edge });
    }
  }
  update(dt, cams) {
    const T = this.T, r = this.race;
    for (const q of this.list) {
      const i = q.i, lx = T.tz[i], lz = -T.tx[i], root = q.p.root;
      if (q.down > 0) { // knocked over: tumble, then get back up
        q.down -= dt; q.vy -= 20 * dt; q.x += q.vx * dt; q.z += q.vz * dt; q.y += q.vy * dt;
        if (q.y < 0) { q.y = 0; q.vy = Math.abs(q.vy) > 2 ? -q.vy * 0.3 : 0; q.vx *= 0.7; q.vz *= 0.7; }
        root.position.set(q.x, 0.05 + q.y, q.z);
        if (q.down <= 0) { q.lat = Math.max(-q.edge, Math.min(q.edge, (q.x - T.x[i]) * lx + (q.z - T.z[i]) * lz)); q.wait = 0; q.p.play('Walk', 0.3); }
      } else {
        if (q.wait > 0) { q.wait -= dt; if (q.wait <= 0) q.p.play('Walk', 0.2); }
        else { q.lat += q.dir * 1.7 * dt; if (Math.abs(q.lat) >= q.edge) { q.lat = Math.sign(q.lat) * q.edge; q.dir = -q.dir; q.wait = 2 + Math.random() * 4; q.p.play('Idle', 0.2); } }
        q.x = T.x[i] + lx * q.lat; q.z = T.z[i] + lz * q.lat; root.position.set(q.x, Math.abs(q.lat) > T.half ? 0.16 : 0.03, q.z); root.rotation.y = Math.atan2(lx * q.dir, lz * q.dir);
        if (Math.abs(q.lat) < T.half) for (const v of r.vehicles) {
          if (v.inactive || v.eliminated || v.air || Math.abs(v.vf) < 4) continue; const dx = q.x - v.x, dz = q.z - v.z;
          if (dx * dx + dz * dz < 3.2) {
            q.down = 4.5; q.vx = v.vx * 0.7 + dx * 2; q.vz = v.vz * 0.7 + dz * 2; q.vy = 4 + Math.abs(v.vf) * 0.08; q.y = 0.3; q.p.play('Die', 0.1, true); r.fx.burst(q.x, 1, q.z, 1, 0.9, 0.6);
            if (!v.remote) { v.vx *= 0.9; v.vz *= 0.9; v.impact = Math.max(v.impact, 6); if (!v.npc) r.wanted(v, 30); if (v.type === 'local') audio.sfx('hit', 6); }
            break;
          }
        }
      }
      let d2 = 1e18; for (const c of cams) { const dx = q.x - c.position.x, dz = q.z - c.position.z; d2 = Math.min(d2, dx * dx + dz * dz); }
      root.visible = d2 < 130 * 130; if (d2 < 80 * 80) q.p.mixer.update(dt);
    }
  }
  dispose() { for (const q of this.list) { this.race.world.group.remove(q.p.root); q.p.dispose(); } }
}
