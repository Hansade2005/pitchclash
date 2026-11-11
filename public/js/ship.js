// Hand-built racing spaceships (pure code). Same template shape as the other vehicles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3();
function part(g, o = {}) {
  if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv');
  E.set(...(o.rot || [0, 0, 0])); Q.setFromEuler(E); g.applyMatrix4(M.compose(V.set(...(o.pos || [0, 0, 0])), Q, new THREE.Vector3(...(o.scale || [1, 1, 1]))));
  if (o.color != null) { const c = new THREE.Color(o.color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  return g;
}
export function buildShip(variant = 'ship') {
  const x = variant === 'shipx', paint = [], misc = [], glass = [], glow = [];
  paint.push(part(new THREE.CylinderGeometry(0.16, 0.72, 4.6, 10), { rot: [Math.PI / 2, 0, 0], pos: [0, 0.75, 0.3], scale: [1.25, 1, 0.62] }));   // fuselage (nose forward)
  paint.push(part(new THREE.SphereGeometry(0.72, 10, 8), { pos: [0, 0.75, -2.0], scale: [1.25, 0.62, 0.8] }));
  for (const s of [1, -1]) {
    paint.push(part(new THREE.BoxGeometry(2.6, 0.09, 1.5), { pos: [1.7 * s, 0.68, -1.1], rot: [0, 0.5 * s, 0.07 * s] }));                               // swept wings
    paint.push(part(new THREE.BoxGeometry(0.08, x ? 1.1 : 0.8, 0.9), { pos: [(x ? 2.8 : 0.55) * s, x ? 1.0 : 1.3, x ? -1.7 : -1.9], rot: [-0.35, 0, -0.25 * s] })); // fins
    misc.push(part(new THREE.CylinderGeometry(0.3, 0.36, 1.7, 10), { rot: [Math.PI / 2, 0, 0], pos: [0.95 * s, 0.7, -1.7], color: 0x2a2e38 }));       // engines
    glow.push(part(new THREE.CircleGeometry(0.27, 12), { rot: [0, Math.PI, 0], pos: [0.95 * s, 0.7, -2.56], color: x ? 0xff7a1a : 0x35f0ff }));
    glow.push(part(new THREE.BoxGeometry(0.5, 0.05, 0.05), { pos: [2.75 * s, 0.7, -1.75], color: s > 0 ? 0x33ff66 : 0xff3344 }));
    if (x) misc.push(part(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), { rot: [Math.PI / 2, 0, 0], pos: [1.9 * s, 0.6, 0.0], color: 0x9aa3ad }));    // cannons
  }
  misc.push(part(new THREE.BoxGeometry(0.5, 0.12, 2.2), { pos: [0, 0.42, -0.3], color: 0x1c1f27 }));
  glass.push(part(new THREE.SphereGeometry(0.42, 10, 8), { pos: [0, 1.02, 0.35], scale: [0.85, 0.7, 1.9] }));
  glow.push(part(new THREE.BoxGeometry(0.34, 0.05, 0.05), { pos: [0, 0.72, 2.58], color: 0xfff4d6 }));
  const body = { paint: mergeGeometries(paint), misc: mergeGeometries(misc), glass: mergeGeometries(glass), glow: mergeGeometries(glow) };
  return { name: variant, body, wheels: [], spinners: [], fork: null, isBike: false, box: new THREE.Box3(new THREE.Vector3(-3, 0, -2.6), new THREE.Vector3(3, 1.6, 2.6)) };
}
