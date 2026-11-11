// Loads GLB models and turns them into lightweight, draw-call-friendly templates.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBike } from './bike.js';
import { buildShip } from './ship.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const VEH_MODELS = ['fox', 'orion', 'meridian', 'atlas', 'bulldog', 'kestrel', 'vanta', 'phantom', 'police', 'marlin', 'hornet', 'skylark'];
const SCALE = { marlin: 0.62, hornet: 0.42, skylark: 0.42 }, SPIN = /^(rotor|tailrotor|prop)$/;
const PEOPLE = ['person_m1', 'person_f1', 'person_m2', 'person_f2', 'person_m3', 'person_f3', 'person_m5', 'person_f5', 'person_rex', 'person_lena', 'person_hans'];
export const HANS = 'hans'; // the player's own character
const CLIPS = ['Idle', 'Walk', 'Run', 'Dance1', 'Dance2', 'Talk', 'Phone', 'Drive', 'Jump', 'Die', 'Hit', 'Punch', 'Kick'];

export const templates = {};   // vehicle templates by model name
export const people = [];      // person source scenes
export const clips = {};       // animation clips by name

const shared = {
  misc: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x555555 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0c1218, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.78 }),
};
const GLOW = /headlight|taillight|drl|glow|nav|lamp/i;
const bucketOf = n => /^paint/i.test(n) ? 'paint' : /glass|screen/i.test(n) ? 'glass' : GLOW.test(n) ? 'glow' : 'misc';

function bakeGeo(mesh, mat, rel, withColor) {
  let g = mesh.geometry.clone();
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(rel);
  if (withColor) {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    const col = (mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05 && GLOW.test(mat.name)) ? mat.emissive : mat.color;
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return g;
}

function buildTemplate(scene, name) {
  scene.updateMatrixWorld(true);
  const parts = new Map(); // owner node (or null for body) -> buckets
  const get = o => { if (!parts.has(o)) parts.set(o, { paint: [], glass: [], glow: [], misc: [] }); return parts.get(o); };
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  const walk = (node, owner) => {
    if (/^wheel_/i.test(node.name) || node.name === 'fork' || SPIN.test(node.name)) owner = node;
    if (node.isMesh) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const mat = mats[0];
      if (!/^floor/i.test(node.name) && !/^floor/i.test(mat.name)) {
        if (owner) inv.copy(owner.matrixWorld).invert(); else inv.identity();
        rel.multiplyMatrices(inv, node.matrixWorld);
        const isWheel = owner && (/^wheel_/i.test(owner.name) || SPIN.test(owner.name));
        const b = isWheel ? 'misc' : bucketOf(mat.name);
        get(owner)[b].push(bakeGeo(node, mat, rel, b === 'misc' || b === 'glow'));
      }
    }
    for (const c of node.children) walk(c, owner);
  };
  walk(scene, null);
  const out = { name, body: {}, wheels: [], spinners: [], fork: null, isBike: false, scale: SCALE[name] || 1 };
  const merged = bk => { const o = {}; for (const k in bk) if (bk[k].length) o[k] = mergeGeometries(bk[k], false); return o; };
  for (const [owner, bk] of parts) {
    if (!owner) { out.body = merged(bk); continue; }
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    owner.matrixWorld.decompose(pos, quat, scl);
    if (owner.name === 'fork') { out.fork = { geo: merged(bk), pos, quat }; out.isBike = true; }
    else if (SPIN.test(owner.name)) out.spinners.push({ geo: merged(bk).misc, pos, quat, axis: owner.name === 'rotor' ? 'y' : owner.name === 'tailrotor' ? 'x' : 'z' });
    else {
      const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
      out.wheels.push({ geo: merged(bk).misc, pos, quat, flip: xAxis.x < 0 ? -1 : 1, front: pos.z > 0, radius: pos.y, onFork: owner.parent && owner.parent.name === 'fork' });
    }
  }
  const box = new THREE.Box3();
  for (const k in out.body) { out.body[k].computeBoundingBox(); box.union(out.body[k].boundingBox); }
  out.box = box;
  return out;
}

// Builds a renderable vehicle from a template. Geometry is shared; only paint is per-instance.
export function makeVehicle(model, color) {
  const t = templates[model], root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.28, envMapIntensity: 1.1 });
  const matFor = k => k === 'paint' ? paint : shared[k];
  for (const k in t.body) root.add(new THREE.Mesh(t.body[k], matFor(k)));
  let forkPivot = null;
  if (t.fork) {
    forkPivot = new THREE.Group(); forkPivot.position.copy(t.fork.pos); forkPivot.quaternion.copy(t.fork.quat);
    const inner = new THREE.Group(); forkPivot.add(inner); forkPivot.userData.inner = inner;
    for (const k in t.fork.geo) inner.add(new THREE.Mesh(t.fork.geo[k], matFor(k)));
    root.add(forkPivot);
  }
  const wheels = [];
  for (const w of t.wheels) {
    const pivot = new THREE.Group(), spin = new THREE.Mesh(w.geo, shared.misc);
    pivot.add(spin);
    if (w.onFork && forkPivot) {
      // position relative to fork
      const m = new THREE.Matrix4().compose(t.fork.pos, t.fork.quat, new THREE.Vector3(1, 1, 1)).invert();
      pivot.position.copy(w.pos).applyMatrix4(m); forkPivot.userData.inner.add(pivot);
    } else { pivot.position.copy(w.pos); pivot.quaternion.copy(w.quat); root.add(pivot); }
    wheels.push({ pivot, spin, flip: w.flip, front: w.front, radius: w.radius, baseQuat: pivot.quaternion.clone() });
  }
  const spinners = (t.spinners || []).map(sp => { const m = new THREE.Mesh(sp.geo, shared.misc); m.position.copy(sp.pos); m.quaternion.copy(sp.quat); root.add(m); return { m, axis: sp.axis }; });
  root.scale.setScalar(t.scale || 1);
  return { root, wheels, spinners, forkPivot, paint, isBike: t.isBike, box: t.box };
}

function prepPerson(scene) {
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const conv = m => { const n = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: m.transparent, alphaTest: m.alphaTest, side: m.side, depthWrite: m.depthWrite, opacity: m.opacity }); n.name = m.name; return n; };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return scene;
}

// A person instance with an animation mixer and a tiny play() helper.
export function makePerson(i) {
  const n = people.length - 1; // the last model is the player's own character and never used for crowds/AI
  const src = people[i === HANS ? n : ((i % n) + n) % n];
  const root = SkeletonUtils.clone(src), mixer = new THREE.AnimationMixer(root), actions = {};
  let cur = null;
  const p = {
    root, mixer, current: null,
    play(name, fade = 0.25, once = false) {
      if (!clips[name] || p.current === name) return;
      const a = actions[name] || (actions[name] = mixer.clipAction(clips[name]));
      a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
      a.play(); if (cur && fade > 0) a.crossFadeFrom(cur, fade, false); else if (cur) cur.stop();
      cur = a; p.current = name; return a;
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); },
  };
  return p;
}

export async function loadAll(onProgress) {
  const loader = new GLTFLoader(), total = VEH_MODELS.length + PEOPLE.length + 1; let done = 0;
  const load = url => loader.loadAsync(url).then(g => { onProgress(++done / total); return g; });
  const base = 'assets/models/';
  const [veh, ppl, anim] = await Promise.all([
    Promise.all(VEH_MODELS.map(m => load(base + m + '.glb'))),
    Promise.all(PEOPLE.map(m => load(base + m + '.glb'))),
    load(base + 'anims.glb'),
  ]);
  VEH_MODELS.forEach((m, i) => { templates[m] = buildTemplate(veh[i].scene, m); });
  templates.racer = buildBike('racer'); templates.superbike = buildBike('superbike'); templates.ship = buildShip('ship'); templates.shipx = buildShip('shipx');
  ppl.forEach(g => people.push(prepPerson(g.scene)));
  for (const c of anim.animations) {
    if (!CLIPS.includes(c.name)) continue;
    // rotation-only clips: keeps every character on its own proportions and removes root motion
    c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion'));
    clips[c.name] = c;
  }
}
