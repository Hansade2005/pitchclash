// Renders vehicles (with your driver on bikes) into small images for the menu cards.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { statsFor } from './data.js';
let R = null, scene = null, cam = null; const cache = new Map();
function init() {
  const c = document.createElement('canvas'); c.width = 560; c.height = 340;
  R = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true }); R.outputColorSpace = THREE.SRGBColorSpace; R.setClearColor(0x000000, 0);
  scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(30, 560 / 340, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a2e3a, 1.7)); const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(5, 9, 6); scene.add(k); const rim = new THREE.DirectionalLight(0x9fd8ff, 1.6); rim.position.set(-6, 4, -7); scene.add(rim);
  const sky = new THREE.Scene(); sky.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'varying vec3 d; void main(){ float h = d.y * 0.5 + 0.5; gl_FragColor = vec4(mix(vec3(0.08,0.09,0.12), vec3(0.85,0.9,1.0), smoothstep(0.35, 0.9, h)), 1.0); }' })));
  const pm = new THREE.PMREMGenerator(R); scene.environment = pm.fromScene(sky, 0, 0.1, 100).texture; pm.dispose();
}
// angle: 'front' three-quarter view from the front, 'side' a lower profile shot
export function vehicleThumb(id, color, person = 'hans', angle = 'front') {
  const key = [id, color, person, angle].join('|'); if (cache.has(key)) return cache.get(key);
  try {
    if (!R) init(); const v = new Vehicle(scene, statsFor(id), { color, person }); v.frozen = true; v.syncVisual(0.016);
    if (v.rider) { v.rider.mixer.update(0.4); } if (v.model.spinners) for (const s of v.model.spinners) s.m.rotation[s.axis] = 0.6;
    v.root.position.set(0, -v.alt, 0); v.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(v.root), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    const dir = angle === 'side' ? new THREE.Vector3(1.6, 0.35, 0.6) : new THREE.Vector3(1.25, 0.55, 1.55); cam.position.copy(c).add(dir.normalize().multiplyScalar(size * 1.62)); cam.lookAt(c.x, c.y - size * 0.03, c.z);
    R.render(scene, cam); const url = R.domElement.toDataURL('image/png'); v.dispose(); cache.set(key, url); return url;
  } catch (e) { console.warn(e); return ''; }
}
