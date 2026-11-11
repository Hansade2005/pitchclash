// Keyboard + gamepad input. Devices: 'kb' (whole keyboard), 'kb1' (WASD), 'kb2' (arrows), 'pad0'..'pad3'.
const keys = {}, prev = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const K = (...c) => c.some(k => keys[k]) ? 1 : 0;
export const pads = () => (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected);
const padAt = i => (navigator.getGamepads ? navigator.getGamepads()[i] : null);
const dz = v => { const a = Math.abs(v); return a < 0.16 ? 0 : Math.sign(v) * Math.pow((a - 0.16) / 0.84, 1.4); };
const btn = (p, i) => p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0;

function raw(dev) {
  if (dev === 'all') { // whole keyboard plus every connected controller
    const o = raw('kb');
    (navigator.getGamepads ? [...navigator.getGamepads()] : []).forEach((p, i) => { if (!p || !p.connected) return; const r = raw('pad' + i); if (!r) return;
      if (Math.abs(r.steer) > Math.abs(o.steer)) o.steer = r.steer; o.gas = Math.max(o.gas, r.gas); o.brake = Math.max(o.brake, r.brake); if (Math.abs(r.climb) > Math.abs(o.climb)) o.climb = r.climb;
      for (const k of ['nitro', 'hand', 'fire', 'punch', 'cam', 'reset', 'pause']) o[k] = o[k] || r[k]; });
    return o;
  }
  if (dev.startsWith('pad')) {
    const p = padAt(+dev.slice(3)); if (!p) return null;
    return { steer: -dz(p.axes[0] || 0) + (btn(p, 14) ? 1 : 0) - (btn(p, 15) ? 1 : 0), gas: Math.max(btn(p, 7), btn(p, 0)), brake: btn(p, 6), nitro: btn(p, 2) > 0.5 || btn(p, 5) > 0.5, hand: btn(p, 1) > 0.5, punch: btn(p, 4) > 0.5, fire: btn(p, 3) > 0.5, climb: -dz(p.axes[3] || 0), cam: btn(p, 12) > 0.5 || btn(p, 11) > 0.5, reset: btn(p, 8) > 0.5, pause: btn(p, 9) > 0.5 };
  }
  const a = dev !== 'kb2', b = dev !== 'kb1', o = { climb: 0, steer: 0, gas: 0, brake: 0, nitro: false, hand: false, fire: false, cam: false, reset: false, pause: !!keys.Escape };
  if (a) { o.steer += K('KeyA') - K('KeyD'); o.gas = Math.max(o.gas, K('KeyW')); o.brake = Math.max(o.brake, K('KeyS')); o.nitro ||= !!K('ShiftLeft'); o.hand ||= !!K('Space'); o.cam ||= !!K('KeyC'); o.reset ||= !!K('KeyR'); o.fire ||= !!K('KeyF', 'KeyE'); o.punch ||= !!K('KeyQ'); o.climb += K('KeyI') - K('KeyK'); }
  if (b) { o.steer += K('ArrowLeft') - K('ArrowRight'); o.gas = Math.max(o.gas, K('ArrowUp')); o.brake = Math.max(o.brake, K('ArrowDown')); o.nitro ||= !!K('ShiftRight', 'Enter'); o.hand ||= !!K('ControlRight'); o.fire ||= !!K('Slash'); o.punch ||= !!K('Comma'); o.climb += K('PageUp') - K('PageDown'); o.cam ||= !!K('Period'); o.reset ||= !!K('Backspace'); }
  if (dev === 'kb') { o.nitro = !!K('ShiftLeft', 'ShiftRight', 'KeyN'); }
  return o;
}
// Returns the control state for a device, with edge-triggered cam/reset/pause.
export function read(dev) {
  const r = raw(dev) || { steer: 0, gas: 0, brake: 0, nitro: false, hand: false, fire: false, cam: false, reset: false, pause: false }, p = prev[dev] || {};
  const out = { ...r, steer: Math.max(-1, Math.min(1, r.steer)), punch: r.punch && !p.punch, cam: r.cam && !p.cam, reset: r.reset && !p.reset, pause: r.pause && !p.pause };
  prev[dev] = r; return out;
}
export function rumble(dev, strength, ms = 180) {
  if (dev === 'all') { for (let i = 0; i < 4; i++) rumble('pad' + i, strength, ms); return; }
  if (!dev.startsWith('pad')) return; const p = padAt(+dev.slice(3));
  try { p && p.vibrationActuator && p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.6) }); } catch (e) {}
}
export const deviceLabel = d => d === 'kb' || d === 'all' ? 'Keyboard' : d === 'kb1' ? 'Keyboard (WASD)' : d === 'kb2' ? 'Keyboard (Arrows)' : 'Controller ' + (+d.slice(3) + 1);

// Menu navigation events from any pad + keyboard: 'up','down','left','right','ok','back','start'
const navPrev = {}; let repeatAt = 0;
export function pollNav(now) {
  const ev = [], st = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false };
  for (const p of pads()) {
    if (btn(p, 12) || p.axes[1] < -0.6) st.up = true; if (btn(p, 13) || p.axes[1] > 0.6) st.down = true;
    if (btn(p, 14) || p.axes[0] < -0.6) st.left = true; if (btn(p, 15) || p.axes[0] > 0.6) st.right = true;
    if (btn(p, 0)) st.ok = true; if (btn(p, 1)) st.back = true; if (btn(p, 9)) st.start = true;
  }
  const typing = document.activeElement instanceof HTMLInputElement;
  if (!typing) { if (keys.ArrowUp || keys.KeyW) st.up = true; if (keys.ArrowDown || keys.KeyS) st.down = true; if (keys.ArrowLeft || keys.KeyA) st.left = true; if (keys.ArrowRight || keys.KeyD) st.right = true; }
  if (keys.Escape) st.back = true;
  for (const k in st) {
    if (st[k] && !navPrev[k]) { ev.push(k); repeatAt = now + 380; }
    else if (st[k] && now > repeatAt && (k === 'up' || k === 'down' || k === 'left' || k === 'right')) { ev.push(k); repeatAt = now + 130; }
    navPrev[k] = st[k];
  }
  return ev;
}
// For the split-screen lobby: which device just pressed its "join" button?
const joinPrev = {};
export function pollJoin2() {
  const out = [], chk = (d, on) => { if (on && !joinPrev[d]) out.push(d); joinPrev[d] = on; };
  chk('kb1', !!keys.ShiftLeft); chk('kb2', !!keys.ShiftRight);
  (navigator.getGamepads ? [...navigator.getGamepads()] : []).forEach((p, i) => { if (p && p.connected) chk('pad' + i, btn(p, 7) > 0.5); });
  return out;
}
