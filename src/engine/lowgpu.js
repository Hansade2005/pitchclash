// Weak-GPU mode (Intel UHD / integrated graphics): cheap Lambert shading instead of PBR, no shadow maps / anti-aliasing / env-map.
import * as THREE from 'three';
const cache = new WeakMap();
export function lowGpuDetected() {
  try {
    if (/[?&]hi=1/.test(location.search)) return false; if (/[?&]low=1/.test(location.search)) return true;
    const gl = document.createElement('canvas').getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const n = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; window.__gpuName = n;
    return /Intel|UHD|HD Graphics|Iris|SwiftShader|Mali|Adreno/i.test(n);
  } catch (x) { return false; }
}
function lamb(m) {
  if (!m || !m.isMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial || !m.isMeshStandardMaterial) return m;
  if (m.onBeforeCompile && String(m.onBeforeCompile).length > 30) return m;   // custom shaders (crowd) are built as Lambert directly
  let l = cache.get(m); if (l) return l;
  l = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map || null, emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0), emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1, vertexColors: !!m.vertexColors, flatShading: !!m.flatShading, transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side, depthWrite: m.depthWrite, alphaTest: m.alphaTest || 0, polygonOffset: !!m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor || 0, polygonOffsetUnits: m.polygonOffsetUnits || 0 });
  l.name = m.name; l.userData = m.userData; cache.set(m, l); return l;
}
export function lowify(root) {
  if (!window.__lowGpu) return;
  root.traverse(o => { if (!o.isMesh || o.userData.lowDone) return; o.userData.lowDone = true; o.material = Array.isArray(o.material) ? o.material.map(lamb) : lamb(o.material); });
}
