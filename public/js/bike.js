// Hand-built classic sports racing bike (full fairing, clip-ons, race tail). Pure code, no model file.
// Produces the same template shape as the GLB vehicles so the rest of the game treats it alike.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
// prepare a primitive: optional colour, position, rotation, scale
function part(g, o = {}) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  E.set(...(o.rot || [0, 0, 0])); Q.setFromEuler(E);
  g.applyMatrix4(M.compose(V.set(...(o.pos || [0, 0, 0])), Q, o.scale ? new THREE.Vector3(...o.scale) : ONE));
  if (o.color != null) { const c = new THREE.Color(o.color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  return g;
}
// side-profile panel: points are [z, y]; extruded across the bike's width
function panel(pts, width, o = {}) {
  const s = new THREE.Shape(); pts.forEach(([z, y], i) => i ? s.lineTo(-z, y) : s.moveTo(-z, y));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -width / 2); g.rotateY(Math.PI / 2);
  return part(g, o);
}
// tube between two points
function tube(a, b, r, color, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const n = g.toNonIndexed(); n.deleteAttribute('uv'); n.applyMatrix4(M.compose(A.add(B).multiplyScalar(0.5), Q, ONE));
  return part(n, { color });
}
function wheel(R, tw, rimCol) {
  const tubeR = tw / 2, g = [
    part(new THREE.TorusGeometry(R - tubeR, tubeR, 10, 26), { rot: [0, Math.PI / 2, 0], scale: [1, 1, 1], color: 0x0e0e10 }),
    part(new THREE.TorusGeometry(R - tubeR * 2 - 0.012, 0.022, 6, 26), { rot: [0, Math.PI / 2, 0], scale: [1, 1, 2.2], color: rimCol }),
    part(new THREE.CylinderGeometry(0.05, 0.05, tw * 0.9, 10), { rot: [0, 0, Math.PI / 2], color: 0x2a2c30 }),
    part(new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.008, 18), { rot: [0, 0, Math.PI / 2], pos: [tw * 0.42, 0, 0], color: 0xb9bdc4 }),
  ];
  for (let k = 0; k < 5; k++) g.push(part(new THREE.BoxGeometry(tw * 0.35, R - tubeR * 2, 0.035), { pos: [0, 0, 0], rot: [k * Math.PI / 5, 0, 0], color: rimCol }));
  return mergeGeometries(g);
}

export function buildBike(variant = 'racer') {
  const rr = variant === 'superbike', R = 0.32, fz = 0.72, rz = -0.7, head = [0, 0.98, 0.4];
  const paint = [], misc = [], glass = [], glow = [];
  // --- bodywork (paint)
  paint.push(panel([[0.62, 0.6], [0.6, 0.94], [0.42, 1.0], [0.16, 0.88], [-0.16, 0.74], [-0.3, 0.5], [-0.2, 0.25], [0.3, 0.2], [0.52, 0.36]], 0.3));           // full fairing + belly pan
  paint.push(part(new THREE.SphereGeometry(0.2, 14, 10), { pos: [0, 0.9, 0.08], scale: [0.8, 0.62, 1.55] }));                                                     // fuel tank
  paint.push(panel([[-0.18, 0.8], [-0.52, 0.86], [-0.98, 1.02], [-1.02, 0.94], [-0.6, 0.74], [-0.22, 0.68]], rr ? 0.2 : 0.17));                                   // race tail
  paint.push(part(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 0.8, 0.6], rot: [Math.PI / 2 - 0.2, 0, 0], scale: [0.84, 1.0, 1.0] })); // nose cone
  // --- glass + lights
  glass.push(part(new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 1.0, 0.5], rot: [0.55, 0, 0], scale: [0.9, rr ? 1.25 : 1.0, 1.3] }));
  glow.push(part(new THREE.BoxGeometry(0.2, 0.07, 0.03), { pos: [0, 0.8, 0.825], rot: [-0.2, 0, 0], color: 0xfff4d6 }));
  glow.push(part(new THREE.BoxGeometry(0.12, 0.035, 0.02), { pos: [0, 0.97, -1.04], color: 0xff2a1a }));
  // --- mechanical bits (vertex-coloured)
  misc.push(part(new THREE.BoxGeometry(0.2, 0.05, 0.36), { pos: [0, 0.83, -0.36], rot: [0.06, 0, 0], color: 0x15151a }));                                          // seat
  misc.push(part(new THREE.BoxGeometry(0.16, 0.1, 0.12), { pos: [0, 0.9, -0.62], rot: [0.25, 0, 0], color: 0x15151a }));                                           // seat stop
  misc.push(part(new THREE.BoxGeometry(0.26, 0.3, 0.42), { pos: [0, 0.46, 0.1], color: 0x2d2f36 }));                                                               // engine
  for (const s of [1, -1]) {
    misc.push(tube([0.11 * s, 0.42, -0.12], [0.085 * s, R, rz], 0.03, 0x9a9da4));                                                                                  // swingarm
    misc.push(tube([0.1 * s, 0.9, 0.3], [0.1 * s, 0.5, -0.15], 0.028, 0xb0b3ba));                                                                                  // twin-spar frame
    misc.push(tube([0.13 * s, 0.4, -0.22], [0.2 * s, 0.34, -0.3], 0.012, 0x444444)); misc.push(part(new THREE.BoxGeometry(0.09, 0.02, 0.04), { pos: [0.22 * s, 0.34, -0.3], color: 0x333333 })); // foot pegs
    misc.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.006, 20), { rot: [0, 0, Math.PI / 2], pos: [(rr ? 0.137 : 0.122) * s, 0.9, -0.74], color: 0xffffff }));          // race-number roundels
  }
  const pipes = rr ? [1, -1] : [1];
  for (const s of pipes) { misc.push(tube([0.12 * s, 0.3, 0.05], [0.16 * s, 0.36, -0.42], 0.028, 0x8a8d94)); misc.push(tube([0.16 * s, 0.36, -0.42], [0.19 * s, 0.6, -0.95], 0.055, 0xc9ccd2, 10)); misc.push(tube([0.19 * s, 0.6, -0.95], [0.192 * s, 0.61, -0.97], 0.04, 0x222222, 10)); }
  misc.push(tube([0, 0.62, -0.3], [0, 0.42, -0.5], 0.03, 0xe0b020));                                                                                                // rear shock spring
  const body = { paint: mergeGeometries(paint), misc: mergeGeometries(misc), glass: mergeGeometries(glass), glow: mergeGeometries(glow) };
  // --- fork assembly (steers), coordinates relative to the steering head
  const rel = p => [p[0] - head[0], p[1] - head[1], p[2] - head[2]], fk = [], fp = [];
  for (const s of [1, -1]) {
    fk.push(tube(rel([0.1 * s, 1.0, 0.39]), rel([0.1 * s, 0.62, 0.57]), 0.026, 0xd9a520));   // gold upper tubes
    fk.push(tube(rel([0.1 * s, 0.62, 0.57]), rel([0.1 * s, R, fz]), 0.021, 0xc8cbd0));      // sliders
    fk.push(tube(rel([0.06 * s, 0.99, 0.4]), rel([0.3 * s, 0.95, 0.3]), 0.016, 0x1a1a1e));  // clip-on bars
    fk.push(tube(rel([0.24 * s, 0.96, 0.325]), rel([0.31 * s, 0.948, 0.295]), 0.022, 0x0c0c0e));
  }
  fk.push(part(new THREE.BoxGeometry(0.26, 0.03, 0.09), { pos: rel([0, 0.99, 0.4]), rot: [-0.44, 0, 0], color: 0x2a2c30 }));
  fp.push(part(new THREE.TorusGeometry(R + 0.03, 0.05, 6, 10, Math.PI * 0.62), { rot: [0, Math.PI / 2, 0], scale: [1, 1, 1.5] }));
  fp[0].applyMatrix4(M.makeRotationX(-Math.PI * 0.08)); fp[0].applyMatrix4(M.makeTranslation(...rel([0, R, fz])));
  const fork = { geo: { misc: mergeGeometries(fk), paint: mergeGeometries(fp) }, pos: new THREE.Vector3(...head), quat: new THREE.Quaternion() };
  const wheels = [
    { geo: wheel(R, 0.13, rr ? 0xd9a520 : 0xe8e8ec), pos: new THREE.Vector3(0, R, fz), quat: new THREE.Quaternion(), flip: 1, front: true, radius: R, onFork: true },
    { geo: wheel(R, rr ? 0.2 : 0.17, rr ? 0xd9a520 : 0xe8e8ec), pos: new THREE.Vector3(0, R, rz), quat: new THREE.Quaternion(), flip: 1, front: false, radius: R, onFork: false },
  ];
  return { name: variant, body, wheels, fork, isBike: true, box: new THREE.Box3(new THREE.Vector3(-0.35, 0, -1.05), new THREE.Vector3(0.35, 1.2, 1.05)) };
}
