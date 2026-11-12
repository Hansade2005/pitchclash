// Weather: sky/fog presets, rain / snow particles, lightning and the gameplay effects (grip, wind, slippery hands).
import * as THREE from 'three';
// mods: fric (ball roll: lower = rolls on), accel (player acceleration), speed (top speed), wind [x, z] m/s² on a flying ball, fumble (keeper spill chance)
export const WEATHER = {
  clear: { name: 'Clear', gray: 0, fog: [150, 420], mods: { fric: 1, accel: 1, speed: 1, wind: [0, 0], fumble: 0 } },
  cloudy: { name: 'Overcast', gray: 0.55, fog: [130, 400], mods: { fric: 1, accel: 1, speed: 1, wind: [0.6, 0.2], fumble: 0 } },
  rain: { name: 'Rain', gray: 0.8, fog: [80, 300], rain: 4200, wet: 0.5, mods: { fric: 0.8, accel: 0.9, speed: 0.98, wind: [0.8, 0.3], fumble: 0.08 } },
  storm: { name: 'Thunderstorm', gray: 1, fog: [60, 250], rain: 8000, wet: 0.85, lightning: true, mods: { fric: 0.7, accel: 0.84, speed: 0.965, wind: [3.2, 1.6], fumble: 0.16 } },
  snow: { name: 'Snow', gray: 0.7, fog: [55, 260], snow: 3200, snowGround: true, mods: { fric: 1.55, accel: 0.8, speed: 0.94, wind: [0.4, 0.6], fumble: 0.06 } },
  fog: { name: 'Fog', gray: 0.8, fog: [8, 95], mods: { fric: 1, accel: 1, speed: 1, wind: [0, 0], fumble: 0 } },
};
export const WEATHER_IDS = Object.keys(WEATHER);
// a believable pick for "Auto": mostly fair, sometimes wet
export function randomWeather() { const r = Math.random(); return r < 0.5 ? 'clear' : r < 0.7 ? 'cloudy' : r < 0.84 ? 'rain' : r < 0.9 ? 'storm' : r < 0.95 ? 'fog' : 'snow'; }

let dot = null;
const dotTex = () => dot || (dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 1, 16, 16, 15); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })());

export function createWeather(scene, kind, hooks = {}) {
  const w = WEATHER[kind] || WEATHER.clear, parts = [], BX = 130, BY = 40, BZ = 95; let flash = 0, nextBolt = 4 + Math.random() * 6;
  const box = (n) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() - 0.5) * BX; a[i * 3 + 1] = Math.random() * BY; a[i * 3 + 2] = (Math.random() - 0.5) * BZ; } return a; };
  let rain = null, snow = null;
  if (w.rain) {
    const n = w.rain, pos = box(n), geo = new THREE.BufferGeometry(), seg = new Float32Array(n * 6); geo.setAttribute('position', new THREE.BufferAttribute(seg, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xcddcf5, transparent: true, opacity: 0.42, depthWrite: false, fog: false }); const m = new THREE.LineSegments(geo, mat); m.frustumCulled = false; scene.add(m); rain = { pos, seg, geo, m, n }; parts.push(m);
  }
  if (w.snow) {
    const n = w.snow, pos = box(n), geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTex(), size: 0.42, transparent: true, depthWrite: false, opacity: 0.92, color: 0xffffff, fog: false })); m.frustumCulled = false; scene.add(m); snow = { pos, arr, geo, m, n, ph: Float32Array.from({ length: n }, () => Math.random() * 6.28) }; parts.push(m);
  }
  let overlay = null; if (w.lightning) { overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;inset:0;background:#dfe8ff;opacity:0;pointer-events:none;z-index:9'; document.body.appendChild(overlay); }
  return {
    kind, w, mods: w.mods,
    update(dt, cam, wt) { // wt = elapsed seconds
      const cx = cam.position.x, cz = cam.position.z - 22;
      if (rain) { const { pos, seg, n } = rain, v = 36 * dt, wx = w.mods.wind[0] * 0.05;
        for (let i = 0; i < n; i++) { const j = i * 3; pos[j + 1] -= v * (0.9 + (i % 7) * 0.03); pos[j] += w.mods.wind[0] * dt * 2; if (pos[j + 1] < 0) { pos[j] = (Math.random() - 0.5) * BX; pos[j + 1] = BY; pos[j + 2] = (Math.random() - 0.5) * BZ; }
          let x = pos[j], z = pos[j + 2]; if (x > BX / 2) pos[j] = x -= BX; const k = i * 6; seg[k] = cx + x; seg[k + 1] = pos[j + 1]; seg[k + 2] = cz + z; seg[k + 3] = cx + x - wx * 4; seg[k + 4] = pos[j + 1] + 1.0; seg[k + 5] = cz + z; }
        rain.geo.attributes.position.needsUpdate = true; }
      if (snow) { const { pos, arr, n, ph } = snow;
        for (let i = 0; i < n; i++) { const j = i * 3; pos[j + 1] -= (1.6 + (i % 5) * 0.35) * dt; pos[j] += Math.sin(wt * 0.8 + ph[i]) * dt * 0.8 + w.mods.wind[0] * dt * 0.3; if (pos[j + 1] < 0) { pos[j] = (Math.random() - 0.5) * BX; pos[j + 1] = BY; pos[j + 2] = (Math.random() - 0.5) * BZ; } if (pos[j] > BX / 2) pos[j] -= BX; arr[j] = cx + pos[j]; arr[j + 1] = pos[j + 1]; arr[j + 2] = cz + pos[j + 2]; }
        snow.geo.attributes.position.needsUpdate = true; }
      if (w.lightning) { nextBolt -= dt; if (nextBolt <= 0) { nextBolt = 6 + Math.random() * 12; flash = 1; hooks.thunder && setTimeout(hooks.thunder, 250 + Math.random() * 900); } flash = Math.max(0, flash - dt * 3.2); const f = flash > 0.55 ? 1 : flash > 0.3 ? 0.2 : flash > 0.15 ? 0.7 : 0; overlay.style.opacity = (f * 0.55).toFixed(2); hooks.flash && hooks.flash(f); }
    },
    dispose() { for (const p of parts) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); } if (overlay) overlay.remove(); },
  };
}
