// Loads the footballer models and builds animated, kit-coloured player instances.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const MODELS = [...'abcdefghijklmnop'].map(c => 'footballer_' + c).concat('keeper');
const lib = {};
export async function loadAll(onProgress) {
  const loader = new GLTFLoader(); let done = 0;
  await Promise.all(MODELS.map(m => loader.loadAsync('assets/players/' + m + '.glb').then(g => {
    g.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = false; const conv = x => { const n = new THREE.MeshLambertMaterial({ map: x.map, color: x.color, transparent: x.transparent, alphaTest: x.alphaTest, side: x.side, depthWrite: x.depthWrite }); n.name = x.name; return n; }; o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); } });
    const clips = {}; for (const c of g.animations) { c.tracks = c.tracks.filter(t => !/^(Root|Armature)\.position/.test(t.name)); clips[c.name] = c; }
    lib[m] = { scene: g.scene, clips }; onProgress(++done / MODELS.length);
  })));
}
const kitCache = {};
// kit = [shirt, shorts, socks] colours; keeper models also tint gloves
export function makePlayer(i, kit, keeper) {
  const name = keeper ? 'keeper' : MODELS[((i % 16) + 16) % 16], src = lib[name], root = SkeletonUtils.clone(src.scene), key = name + kit.join('_');
  root.traverse(o => {
    if (!o.isMesh) return;
    const tint = m => { const col = { Shirt: kit[0], Shorts: kit[1], Socks: kit[2], Gloves: 0xf5f5f5 }[m.name]; if (col == null) return m; const k = key + m.name; if (!kitCache[k]) { kitCache[k] = m.clone(); kitCache[k].color.set(col); } return kitCache[k]; };
    o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
  });
  const mixer = new THREE.AnimationMixer(root), acts = {}; let cur = null;
  const p = { root, mixer, current: null,
    play(n, fade = 0.15, once = false, speed = 1) {
      if (!src.clips[n]) n = 'Idle'; if (p.current === n && !once) { if (cur) cur.timeScale = speed; return; }
      const a = acts[n] || (acts[n] = mixer.clipAction(src.clips[n])); a.reset(); a.timeScale = speed; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.play();
      if (cur && cur !== a) a.crossFadeFrom(cur, fade, false); cur = a; p.current = n;
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); } };
  return p;
}
