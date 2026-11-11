// AI driver. The same helper powers the "easy" driving assists for human players.
import { lateral } from './track.js';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// Highest speed we may carry right now and still make every corner in braking range.
export function safeSpeed(v, T, k = 1) {
  const sp = Math.max(0, v.vf), range = (sp * sp / 60 + 24) / T.step; let allow = 999;
  for (let j = 0; j < range; j += 2) {
    const c = Math.abs(T.curv[(v.idx + j) % T.N]); if (c < 0.002) continue;
    const vm = Math.sqrt(v.st.grip * 0.9 / c) * k, a = Math.sqrt(vm * vm + 2 * 30 * j * T.step);
    if (a < allow) allow = a;
  }
  return allow;
}

// Steering value that aims the vehicle at a point further down the track at lateral offset `off`.
export function steerTo(v, T, off, extra = 0) {
  const la = (v.idx + Math.round((9 + Math.max(0, v.vf) * 0.42 + extra) / T.step)) % T.N;
  const px = T.x[la] + T.tz[la] * off, pz = T.z[la] - T.tx[la] * off;
  return clamp(wrap(Math.atan2(px - v.x, pz - v.z) - v.h) * 2.4, -1, 1);
}

export function makeAI(skill, lane) { return { skill, lane, off: lane, band: 1, boost: 0, orbOff: null }; }

export function aiDrive(v, ai, T, others, dt) {
  const lim = T.half - 2.4, sp = Math.max(0, v.vf), my = lateral(T, v.idx, v.x, v.z);
  const la = (v.idx + Math.round((14 + sp * 0.6) / T.step)) % T.N;
  let target = ai.fixed != null ? ai.fixed : ai.orbOff != null ? ai.orbOff : clamp(T.curv[la] * 300, -lim, lim) * 0.75 + ai.lane;
  for (const o of others) {
    if (o === v || o.eliminated) continue;
    const di = (o.idx - v.idx + T.N) % T.N;
    if (di > 0 && di * T.step < 7 + sp * 0.45 && o.vf < sp + 3) {
      const od = lateral(T, o.idx, o.x, o.z);
      if (Math.abs(od - target) < 2.7) target = od + (od > my ? -3.2 : 3.2);
    }
  }
  target = clamp(target, -lim, lim);
  ai.off += (target - ai.off) * (1 - Math.exp(-2.2 * dt));
  const inp = v.input, k = ai.skill * ai.band, allow = safeSpeed(v, T, 0.8 + 0.2 * k), cap = ai.cap != null ? ai.cap : v.st.top * (0.78 + 0.22 * k);
  inp.steer = steerTo(v, T, ai.off);
  inp.gas = sp < Math.min(allow, cap) ? 1 : 0; inp.brake = sp > allow + 2 ? 1 : 0; inp.hand = false;
  if (ai.boost > 0) { ai.boost -= dt; inp.nitro = true; }
  else { inp.nitro = false; if (ai.cap == null && v.nitro > 0.7 && allow > sp + 15 && Math.random() < dt * 0.5 * ai.skill) ai.boost = 2; }
  if (v.stuckT > 2.5) { v.stuckT = 0; v.reset(T); }
}
