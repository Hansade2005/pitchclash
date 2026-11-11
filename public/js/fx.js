// Pooled GPU point particles: smoke (alpha blended) and sparks/nitro (additive).
import * as THREE from 'three';

class Pool {
  constructor(scene, n, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.grow = new Float32Array(n); this.grav = new Float32Array(n);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: 'attribute vec4 pcol; attribute float psize; varying vec4 c; uniform float scale; void main(){ c = pcol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / max(0.1,-mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 c; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * c.a; if (a < 0.01) discard; gl_FragColor = vec4(c.rgb, a); }',
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grow = 0, grav = 0) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([r, g, b, a], i * 4);
    this.size[i] = size; this.life[i] = this.max[i] = life; this.grow[i] = grow; this.grav[i] = grav;
  }
  update(dt) {
    const { pos, vel, col, life, max, size } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { size[i] = 0; col[i * 4 + 3] = 0; continue; }
      vel[i * 3 + 1] -= this.grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.03 && this.grav[i] > 0) { pos[i * 3 + 1] = 0.03; vel[i * 3 + 1] *= -0.4; }
      size[i] += this.grow[i] * dt; col[i * 4 + 3] *= Math.pow(life[i] / max[i], dt * 3.5);
    }
    this.geo.attributes.position.needsUpdate = this.geo.attributes.pcol.needsUpdate = this.geo.attributes.psize.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, low) { this.smokeP = new Pool(scene, low ? 150 : 400, false); this.glowP = new Pool(scene, low ? 150 : 400, true); }
  smoke(x, y, z, vx, vz) { this.smokeP.emit(x, y, z, vx * 0.15 + (Math.random() - 0.5), 0.6 + Math.random(), vz * 0.15 + (Math.random() - 0.5), 0.9, 0.9, 0.85, 0.85, 0.88, 0.32, 2.4); }
  spark(x, y, z, vx, vz) { for (let k = 0; k < 6; k++) this.glowP.emit(x, y, z, vx * 0.5 + (Math.random() - 0.5) * 9, 2 + Math.random() * 5, vz * 0.5 + (Math.random() - 0.5) * 9, 0.5, 0.16, 1, 0.75, 0.3, 1, 0, 18); }
  flame(x, y, z, vx, vz) { this.glowP.emit(x, y, z, vx + (Math.random() - 0.5) * 1.5, (Math.random() - 0.3) * 1.2, vz + (Math.random() - 0.5) * 1.5, 0.22, 0.5, 0.25, 0.6, 1, 0.9, -1.2); }
  burst(x, y, z, r, g, b) { for (let k = 0; k < 18; k++) this.glowP.emit(x, y, z, (Math.random() - 0.5) * 10, Math.random() * 7, (Math.random() - 0.5) * 10, 0.6, 0.3, r, g, b, 1, 0, 9); }
  update(dt) { this.smokeP.update(dt); this.glowP.update(dt); }
  setScale(s) { this.smokeP.mat.uniforms.scale.value = this.glowP.mat.uniforms.scale.value = s; }
}
