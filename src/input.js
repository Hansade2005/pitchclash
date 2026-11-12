// Input: gamepads (Xbox / PlayStation / generic via the standard mapping) and two keyboard layouts.
const Input = (() => {
  const keys = new Set();
  window.addEventListener('keydown', e => { keys.add(e.code); if (/^(Arrow|Space|Tab|Numpad)/.test(e.code)) e.preventDefault(); Sound.init(); });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousedown', () => Sound.init());

  // Gamepad buttons (standard mapping): 0 A/Cross 1 B/Circle 2 X/Square 3 Y/Triangle 4 LB 5 RB 6 LT 7 RT 8 Back/Share 9 Start/Options 10 LS 11 RS 12-15 D-pad
  const PAD = { pass: [0], shoot: [1], lob: [2], through: [3], switch: [4], sprint: [7], skill: [6, 11], send: [5], start: [9], camera: [8] };
  const DEFAULT_KB = {
    kb1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', pass: ['KeyJ'], shoot: ['KeyK'], through: ['KeyL'], lob: ['KeyI'], sprint: ['ShiftLeft'], switch: ['KeyQ'], skill: ['KeyE'], send: ['KeyU'], start: ['Escape'], camera: ['KeyV'] },
    kb2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', pass: ['KeyZ', 'Comma', 'Numpad1'], shoot: ['KeyX', 'Period', 'Numpad2'], through: ['KeyC', 'Slash', 'Numpad3'], lob: ['KeyB', 'Semicolon', 'Numpad5'], sprint: ['Space', 'ShiftRight', 'Numpad0'], switch: ['KeyN', 'KeyM', 'Numpad4'], skill: ['KeyG', 'Quote', 'Numpad6'], send: ['KeyH', 'Numpad8'], start: ['Backspace'], camera: ['Equal', 'NumpadAdd'] },
  };
  let KB = JSON.parse(JSON.stringify(DEFAULT_KB));
  try { const saved = JSON.parse(localStorage.getItem('pc_keys_v2') || 'null'); if (saved && saved.kb1 && saved.kb2) KB = saved; } catch (e) {}
  const tapped = new Set();          // keys pressed (even if released again) since the last frame — a quick tap is never lost on a slow frame
  window.addEventListener('keydown', e => { if (!e.repeat) tapped.add(e.code); });
  let merge = false;                 // one keyboard player: WASD *and* arrows both work
  let enterFlag = false;
  window.addEventListener('keydown', e => { if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) enterFlag = true; });
  const ACTIONS = ['pass', 'shoot', 'through', 'lob', 'sprint', 'switch', 'skill', 'send', 'start', 'camera'];
  const DEAD = 0.2;
  const prev = new Map();

  function pads() { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(g => g && g.connected); }
  function getPad(index) { const g = navigator.getGamepads ? navigator.getGamepads()[index] : null; return g && g.connected ? g : null; }
  const btn = (g, i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.4));

  function raw(dev) {
    const out = { mx: 0, my: 0, connected: true };
    ACTIONS.forEach(a => out[a] = false);
    if (dev.type === 'pad') {
      const g = getPad(dev.index);
      if (!g) { out.connected = false; return out; }
      let ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (btn(g, 12)) ay = -1; if (btn(g, 13)) ay = 1; if (btn(g, 14)) ax = -1; if (btn(g, 15)) ax = 1;
      const m = Math.hypot(ax, ay);
      if (m > DEAD) { const s = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; out.mx = ax * s; out.my = ay * s; }
      for (const a of ACTIONS) out[a] = PAD[a].some(i => btn(g, i));
      // right stick flick = skill
      if (Math.hypot(g.axes[2] || 0, g.axes[3] || 0) > 0.8) out.skill = true;
      out.back = btn(g, 1); out.confirm = btn(g, 0);
      out.lb = btn(g, 4); out.rb = btn(g, 5);
    } else {
      const any = arr => arr.some(c => keys.has(c) || tapped.has(c));
      const layouts = [dev.type]; if (merge) layouts.push(dev.type === 'kb1' ? 'kb2' : 'kb1');
      let mx = 0, my = 0;
      for (const L of layouts) {
        const k = KB[L];
        mx += (keys.has(k.right) || tapped.has(k.right) ? 1 : 0) - (keys.has(k.left) || tapped.has(k.left) ? 1 : 0);
        my += (keys.has(k.down) || tapped.has(k.down) ? 1 : 0) - (keys.has(k.up) || tapped.has(k.up) ? 1 : 0);
        for (const a of ACTIONS) if (any(k[a])) out[a] = true;
      }
      mx = Math.max(-1, Math.min(1, mx)); my = Math.max(-1, Math.min(1, my));
      const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
      out.mx = mx; out.my = my;
      out.confirm = out.pass || keys.has('Enter') || keys.has('NumpadEnter') || tapped.has('Enter');
      out.back = out.shoot;
      out.lb = out.switch; out.rb = out.skill;
    }
    return out;
  }

  function read(dev) {
    const id = devId(dev), r = raw(dev), p = prev.get(id) || {};
    const out = Object.assign({}, r);
    for (const b of [...ACTIONS, 'confirm', 'back', 'lb', 'rb']) out[b + 'Pressed'] = r[b] && !p[b];
    const dirY = r.my < -0.55 ? -1 : r.my > 0.55 ? 1 : 0, dirX = r.mx < -0.55 ? -1 : r.mx > 0.55 ? 1 : 0;
    // menu navigation with auto-repeat
    const now = performance.now();
    let navX = 0, navY = 0;
    if (dirX !== (p.dirX || 0) || dirY !== (p.dirY || 0)) { navX = dirX; navY = dirY; out._rep = now + 380; }
    else if ((dirX || dirY) && now > (p._rep || 0)) { navX = dirX; navY = dirY; out._rep = now + 110; }
    else out._rep = p._rep;
    out.navX = navX; out.navY = navY;
    const store = { dirX, dirY, _rep: out._rep };
    for (const b of [...ACTIONS, 'confirm', 'back', 'lb', 'rb']) store[b] = r[b];
    prev.set(id, store);
    return out;
  }

  const devId = d => d.type === 'pad' ? 'pad' + d.index : d.type;
  function deviceName(d) {
    if (!d) return '—';
    if (d.type === 'kb1') return 'Keyboard (WASD)';
    if (d.type === 'kb2') return 'Keyboard (Arrows/Numpad)';
    const g = getPad(d.index);
    let n = g ? g.id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim() : 'Controller';
    if (/xinput|xbox/i.test(g ? g.id : '')) n = 'Xbox Controller';
    else if (/054c|dualsense|dualshock|wireless controller/i.test(g ? g.id : '')) n = 'PlayStation Controller';
    return (n.length > 24 ? n.slice(0, 24) + '…' : n) + ' ' + (d.index + 1);
  }
  function isPlayStation(d) { const g = d && d.type === 'pad' ? getPad(d.index) : null; return !!g && /054c|dualsense|dualshock|wireless controller/i.test(g.id); }

  function candidates() { const list = pads().map(g => ({ type: 'pad', index: g.index })); list.push({ type: 'kb1' }, { type: 'kb2' }); return list; }

  function rumble(dev, strong = 0.6, weak = 0.6, ms = 200) {
    if (!dev || dev.type !== 'pad') return;
    const g = getPad(dev.index);
    try { if (g && g.vibrationActuator) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {}
  }

  // keyboard remapping
  function getKeymap() { return KB; }
  function setKey(layout, action, code) {
    if (['up', 'down', 'left', 'right'].includes(action)) KB[layout][action] = code; else KB[layout][action] = [code];
    try { localStorage.setItem('pc_keys_v2', JSON.stringify(KB)); } catch (e) {}
  }
  function resetKeys() { KB = JSON.parse(JSON.stringify(DEFAULT_KB)); try { localStorage.removeItem('pc_keys_v2'); } catch (e) {} }
  let captureCb = null;
  window.addEventListener('keydown', e => { if (captureCb) { const cb = captureCb; captureCb = null; e.preventDefault(); e.stopPropagation(); cb(e.code); } }, true);
  function captureKey(cb) { captureCb = cb; }

  const niceKey = c => String(c).replace(/^Key/, '').replace(/^Digit/, '').replace('Numpad', 'Num ').replace('Arrow', '').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift').replace('Comma', ',').replace('Period', '.').replace('Slash', '/').replace('Semicolon', ';').replace('Quote', "'").replace('Equal', '=').replace('Backspace', 'Backspace').replace('Escape', 'Esc');
  // label for an action on a device, e.g. 'A / ✕' for pads, 'J' or 'Z' for keyboards
  function keyLabel(dev, action) {
    if (!dev) return '';
    if (dev.type === 'pad') return { pass: 'A / ✕', shoot: 'B / ○', through: 'Y / △', lob: 'X / □', sprint: 'RB / R1', switch: 'LB / L1', start: 'Start' }[action] || '';
    const list = (merge ? ['kb1', 'kb2'] : [dev.type]).flatMap(L => (KB[L][action] || []).filter(c => !/^Numpad/.test(c)).slice(0, 1));
    return list.map(niceKey).join(' / ');
  }
  return { read, endFrame: () => tapped.clear(), takeEnter: () => { const v = enterFlag; enterFlag = false; return v; }, setMerge: v => { merge = !!v; }, keyLabel, candidates, devId, deviceName, isPlayStation, rumble, padCount: () => pads().length, getKeymap, setKey, resetKeys, captureKey, keysDown: () => keys };
})();
