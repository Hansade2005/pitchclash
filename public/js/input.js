// Keyboard + gamepad input for football. Devices: 'all' (keyboard + every pad), 'kb1' (WASD side), 'kb2' (arrow side), 'pad0'..'pad3'.
const keys = {}, prev = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
// ---- mouse aiming (keyboard + mouse device): pointer position in normalised device coords, buttons 0/1/2
export const opts = { mouse: true };
const mouse = { nx: 0, ny: 0, t: -1e9, l: false, m: false, r: false, pl: false, pm: false, pr: false }; // p* = pressed since the last frame (a click shorter than a frame is not lost)
export const endFrame = () => { mouse.pl = mouse.pm = mouse.pr = false; };
addEventListener('pointermove', e => { mouse.nx = e.clientX / innerWidth * 2 - 1; mouse.ny = -(e.clientY / innerHeight * 2 - 1); mouse.t = performance.now(); });
addEventListener('pointerdown', e => { mouse.nx = e.clientX / innerWidth * 2 - 1; mouse.ny = -(e.clientY / innerHeight * 2 - 1); mouse.t = performance.now(); if (e.button === 0) mouse.l = mouse.pl = true; else if (e.button === 1) mouse.m = mouse.pm = true; else if (e.button === 2) mouse.r = mouse.pr = true; });
addEventListener('pointerup', e => { if (e.button === 0) mouse.l = false; else if (e.button === 1) mouse.m = false; else if (e.button === 2) mouse.r = false; });
addEventListener('contextmenu', e => { if (!document.getElementById('ui').firstChild) e.preventDefault(); });
addEventListener('mousedown', e => { if (e.button === 1 && !document.getElementById('ui').firstChild) e.preventDefault(); });
addEventListener('blur', () => { mouse.l = mouse.m = mouse.r = false; });
const mouseOn = () => opts.mouse && !document.getElementById('ui').firstChild && performance.now() - mouse.t < 6000;
const K = (...c) => c.some(k => keys[k]) ? 1 : 0;
export const pads = () => (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected);
const padAt = i => (navigator.getGamepads ? navigator.getGamepads()[i] : null);
const dz = v => { const a = Math.abs(v); return a < 0.16 ? 0 : Math.sign(v) * Math.pow((a - 0.16) / 0.84, 1.4); };
const btn = (p, i) => p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0;

// Returns { x, z, pass, shoot, through, sprint, switch, pause } ; x = right, z = towards the camera (down the screen).
function raw(dev) {
  if (dev === 'all') { const o = raw('kb'); o.ax = o.az = 0; for (let i = 0; i < 4; i++) { const r = raw('pad' + i); if (!r) continue; if (Math.hypot(r.x, r.z) > Math.hypot(o.x, o.z)) { o.x = r.x; o.z = r.z; } for (const k of ['pass', 'shoot', 'through', 'sprint', 'switch', 'pause', 'keeper']) o[k] = o[k] || r[k]; if (Math.hypot(r.ax, r.az) > Math.hypot(o.ax, o.az)) { o.ax = r.ax; o.az = r.az; } } return o; }
  if (dev.startsWith('pad')) {
    const p = padAt(+dev.slice(3)); if (!p || !p.connected) return null;
    return { x: dz(p.axes[0] || 0) + (btn(p, 15) ? 1 : 0) - (btn(p, 14) ? 1 : 0), z: dz(p.axes[1] || 0) + (btn(p, 13) ? 1 : 0) - (btn(p, 12) ? 1 : 0), pass: btn(p, 0) > 0.5, shoot: btn(p, 2) > 0.5 || btn(p, 1) > 0.5, through: btn(p, 3) > 0.5, sprint: btn(p, 7) > 0.3 || btn(p, 5) > 0.5, switch: btn(p, 4) > 0.5, pause: btn(p, 9) > 0.5, keeper: btn(p, 6) > 0.5 || btn(p, 8) > 0.5, ax: dz(p.axes[2] || 0), az: dz(p.axes[3] || 0) };
  }
  const a = dev !== 'kb2', b = dev !== 'kb1', o = { x: 0, z: 0, pass: false, shoot: false, through: false, sprint: false, switch: false, pause: !!keys.Escape, keeper: false, curl: 0, ax: 0, az: 0, aim: null, ml: false, mm: false, mr: false };
  if (a) { o.x += K('KeyD') - K('KeyA'); o.z += K('KeyS') - K('KeyW'); o.pass ||= !!K('KeyJ'); o.shoot ||= !!K('KeyK'); o.through ||= !!K('KeyL'); o.sprint ||= !!K('ShiftLeft', 'Space'); o.switch ||= !!K('KeyQ'); o.keeper ||= !!K('KeyG'); o.curl += K('KeyE') - K('KeyR'); }
  if (b) { o.x += K('ArrowRight') - K('ArrowLeft'); o.z += K('ArrowDown') - K('ArrowUp'); o.pass ||= !!K('Numpad1', 'Comma'); o.shoot ||= !!K('Numpad2', 'Period'); o.through ||= !!K('Numpad3', 'Slash'); o.sprint ||= !!K('ShiftRight', 'ControlRight'); o.switch ||= !!K('Numpad0', 'KeyM'); o.keeper ||= !!K('Numpad4', 'KeyN'); }
  if (dev === 'kb' || dev === 'kbm') { o.pass ||= !!K('KeyZ'); o.shoot ||= !!K('KeyX'); o.through ||= !!K('KeyC'); }
  if (dev === 'kb' || dev === 'kbm' || dev === 'kb1') { if (mouseOn()) { o.aim = { nx: mouse.nx, ny: mouse.ny }; o.ml = mouse.l || mouse.pl; o.mm = mouse.m || mouse.pm; o.mr = mouse.r || mouse.pr; } }
  return o;
}
export const ZERO = { x: 0, z: 0, pass: false, shoot: false, through: false, sprint: false, switch: false, pause: false, keeper: false, curl: 0, ax: 0, az: 0, aim: null, ml: false, mm: false, mr: false };
// Adds edge flags: passDown, shootDown/shootUp, throughDown, switchDown, pauseDown.
export function edges(r, p) {
  p = p || ZERO; const l = Math.hypot(r.x, r.z), k = l > 1 ? 1 / l : 1;
  return { ...r, x: r.x * k, z: r.z * k, passDown: r.pass && !p.pass, shootDown: r.shoot && !p.shoot, shootUp: !r.shoot && p.shoot, throughDown: r.through && !p.through, switchDown: r.switch && !p.switch, pauseDown: r.pause && !p.pause, keeperDown: r.keeper && !p.keeper, mlDown: r.ml && !p.ml, mlUp: !r.ml && p.ml, mmDown: r.mm && !p.mm, mrDown: r.mr && !p.mr };
}
export function read(dev) { const r = raw(dev) || ZERO, out = edges(r, prev[dev]); prev[dev] = r; return out; }
export function rawState(dev) { return raw(dev) || ZERO; }
export const deviceLabel = d => d === 'kbm' ? 'Keyboard + Mouse (WASD / arrows)' : d === 'kb' || d === 'all' ? 'Keyboard / Controller' : d === 'kb1' ? 'Keyboard + Mouse (WASD, J K L)' : d === 'kb2' ? 'Keyboard (Arrows + , . /)' : 'Controller ' + (+d.slice(3) + 1);

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
const joinPrev = {};
export function pollJoin() { const out = [], chk = (d, on) => { if (on && !joinPrev[d]) out.push(d); joinPrev[d] = on; }; chk('kb1', !!keys.KeyJ); chk('kb2', !!(keys.Comma || keys.Numpad1)); (navigator.getGamepads ? [...navigator.getGamepads()] : []).forEach((p, i) => { if (p && p.connected) chk('pad' + i, btn(p, 7) > 0.5); }); return out; }
