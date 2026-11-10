// Rendering: stadium, players, ball, effects, weather, cameras and replays.
import { lowify, lowGpuDetected } from './lowgpu.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PITCH, BALL_R } from './sim.js';
import { Director } from './director.js';

const { HL, HW, GOAL_W, GOAL_H, GOAL_D } = PITCH;
const GHW = GOAL_W / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// clip fallbacks so the game works with any character set
const CLIP_FALLBACK = {
  Idle: ['Idle', 'idle', 'Unarmed_Idle'], Jog: ['Jog', 'Run', 'walk', 'run', 'Running_A'], Run: ['Run', 'run', 'Running_A'], Sprint: ['Sprint', 'Run', 'run', 'Running_B'],
  Dribble: ['Dribble', 'Run', 'run'], Pass: ['Pass', 'Shoot', 'Unarmed_Melee_Attack_Kick'], Shoot: ['Shoot', 'Pass', 'Unarmed_Melee_Attack_Kick'], Tackle: ['Tackle', 'Dodge_Forward'],
  Header: ['Header', 'Jump_Full_Short'], Celebrate: ['Celebrate', 'Cheer', 'agree'], Fall: ['Fall', 'Hit_A', 'sad_pose'], ThrowIn: ['ThrowIn', 'Throw'],
  KeeperIdle: ['KeeperIdle', 'Idle', 'idle', '2H_Melee_Idle'], KeeperDiveLeft: ['KeeperDiveLeft', 'Dodge_Left'], KeeperDiveRight: ['KeeperDiveRight', 'Dodge_Right'],
  KeeperCatch: ['KeeperCatch', 'Idle', 'idle'], KeeperThrow: ['KeeperThrow', 'Throw', 'Pass'],
};
const ONCE = new Set(['Pass', 'Shoot', 'Tackle', 'Header', 'Fall', 'KeeperDiveLeft', 'KeeperDiveRight', 'KeeperCatch', 'KeeperThrow', 'ThrowIn']);

export class Renderer {
  constructor(container) {
    this.container = container;
    const LOW = window.__lowGpu = lowGpuDetected(); this.capR = x => LOW ? Math.min(x, 1100 / Math.max(1, window.innerWidth), 0.9) : x;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
    r.setPixelRatio(this.capR(Math.min(window.devicePixelRatio || 1, 1.5)));
    r.shadowMap.enabled = !LOW; r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 900);
    this.camPos = new THREE.Vector3(0, 40, 70); this.camLook = new THREE.Vector3();
    this.zoomSetting = 1; this.shake = 0; this.time = 0;
    this.models = {}; this.chars = []; this.quality = 'high';
    window.addEventListener('resize', () => this.resize()); this.resize();
    if (!LOW) { const pmrem = new THREE.PMREMGenerator(r); this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose(); }
    this.buildLights(); this.buildStadium(); this.buildBall(); this.buildEffects(); this.buildAim();
    this.setAtmosphere('day', 'clear');
    lowify(this.scene); setInterval(() => lowify(this.scene), 1200);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(this.capR(q === 'low' ? 0.75 : q === 'medium' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)));
    this.renderer.shadowMap.enabled = q !== 'low' && !window.__lowGpu;
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }

  // ---------------------------------------------------------------- lights / atmosphere
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x2a4a22, 1.0); this.scene.add(this.hemi);
    const s = this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    s.position.set(-40, 80, 45); s.castShadow = !window.__lowGpu; s.shadow.mapSize.set(2048, 2048);
    Object.assign(s.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 10, far: 220 });
    s.shadow.bias = -0.0004; s.shadow.normalBias = 0.04;
    this.scene.add(s); this.scene.add(s.target);
  }

  setAtmosphere(time, weather) {
    this.timeOfDay = time; this.weather = weather;
    const presets = {
      day: { bg: 0x8fb8e6, fog: 0xa9c6e8, hemi: [0xdfefff, 0x3a5a2a, 1.05], sun: [0xffffff, 2.6], pos: [-40, 80, 45], lamps: 0.6, exp: 1.0 },
      sunset: { bg: 0xf0a868, fog: 0xe9a87a, hemi: [0xffd7b0, 0x3a3020, 0.8], sun: [0xffb070, 2.2], pos: [-90, 30, 30], lamps: 1.6, exp: 1.0 },
      night: { bg: 0x070b16, fog: 0x0a1020, hemi: [0x8aa0d0, 0x101810, 0.55], sun: [0xe8f0ff, 2.3], pos: [10, 90, 20], lamps: 3.2, exp: 1.08 },
    };
    const p = presets[time] || presets.day;
    let bg = new THREE.Color(p.bg), fog = new THREE.Color(p.fog);
    if (weather === 'rain' || weather === 'storm') { bg.lerp(new THREE.Color(weather === 'storm' ? 0x262c36 : 0x4a5560), 0.7); fog.lerp(new THREE.Color(weather === 'storm' ? 0x2c323c : 0x56606a), 0.7); }
    if (weather === 'fog') { bg.lerp(new THREE.Color(0xb8c0c8), 0.75); fog.lerp(new THREE.Color(0xb8c0c8), 0.85); }
    if (weather === 'snow') { bg.lerp(new THREE.Color(0xc8d0d8), 0.5); fog.lerp(new THREE.Color(0xd0d6de), 0.6); }
    this.scene.background = bg;
    this.scene.fog = weather === 'fog' ? new THREE.Fog(fog, 18, 110) : new THREE.Fog(fog, weather === 'clear' ? 160 : 90, weather === 'clear' ? 420 : 260);
    this.baseHemi = null;
    this.hemi.color.setHex(p.hemi[0]); this.hemi.groundColor.setHex(p.hemi[1]); this.hemi.intensity = p.hemi[2] * (weather === 'clear' ? 1 : 0.85) * (window.__lowGpu ? (time === 'night' ? 2.0 : 1.35) : 1);
    this.sun.color.setHex(p.sun[0]); this.sun.intensity = p.sun[1] * (weather === 'clear' ? 1 : 0.55);
    this.sun.position.set(...p.pos);
    this.renderer.toneMappingExposure = p.exp;
    this.scene.environmentIntensity = ({ day: 0.28, sunset: 0.22, night: 0.2 }[time] ?? 0.25) * (weather === 'clear' ? 1 : 0.75);
    if (this.lampMat) this.lampMat.emissiveIntensity = p.lamps;
    if (this.glows) this.glows.forEach(g => g.material.opacity = time === 'night' ? 0.9 : time === 'sunset' ? 0.45 : 0.15);
    this.pitchMat.roughness = weather === 'rain' || weather === 'storm' ? 0.5 : 0.95;
    this.pitchMat.color.setHex(weather === 'snow' ? 0xe8eef2 : 0xffffff);
    this.precip.visible = weather === 'rain' || weather === 'storm' || weather === 'snow';
    this.setupPrecip(weather);
  }

  // ---------------------------------------------------------------- textures
  canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  // ---------------------------------------------------------------- stadium (rebuilt per venue)
  setStadium(def) {
    if (this.stadiumDef && def && this.stadiumDef.name === def.name && this.stadiumDef.seats.join() === def.seats.join()) return;
    if (this.stadium) { this.scene.remove(this.stadium); this.stadium.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.stadiumDef = def;
    this.buildStadium(def);
    if (this.timeOfDay) this.setAtmosphere(this.timeOfDay, this.weather || 'clear');
    if (this.onStadiumChange) this.onStadiumChange(def);
  }
  buildStadium(def) {
    def = def || { name: 'Grand Royal Arena', tiers: [2, 1, 2, 2], roof: 'separate', lights: 'towers', seats: ['#23324a', '#2c3e5c'], concrete: '#59606c', mow: 'stripes', track: false, backdrop: 'none' };
    this.stadiumDef = def;
    const G = this.stadium = new THREE.Group(); this.scene.add(G);
    const add = o => { G.add(o); return o; };
    const off = def.track ? 9 : 0;          // athletics track pushes the stands back
    const M = 5, S = 20, PW = PITCH.L + 2 * M, PH = PITCH.W + 2 * M;
    const tex = this.canvasTex(PW * S, PH * S, (g, w, h) => {
      const X = x => (x + HL + M) * S, Z = z => (z + HW + M) * S;
      const A = '#4a9e43', B = '#3d8c38';
      g.fillStyle = B; g.fillRect(0, 0, w, h);
      g.fillStyle = A;
      if (def.mow === 'checker') { const n = 18, m = 12; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if ((i + j) % 2) g.fillRect(X(-HL) + i * PITCH.L / n * S, Z(-HW) + j * PITCH.W / m * S, PITCH.L / n * S + 1, PITCH.W / m * S + 1); }
      else if (def.mow === 'circles') { for (let r = 60; r > 0; r -= 4.5) { g.fillStyle = (r / 4.5) % 2 < 1 ? A : B; g.beginPath(); g.arc(X(0), Z(0), r * S, 0, Math.PI * 2); g.fill(); } }
      else if (def.mow === 'diagonal') { g.save(); g.beginPath(); g.rect(X(-HL - 1), Z(-HW - 1), (PITCH.L + 2) * S, (PITCH.W + 2) * S); g.clip(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); for (let i = -20; i < 20; i++) if (i % 2) g.fillRect(i * 6 * S, -h, 6 * S, h * 2); g.restore(); }
      else { const n = def.mow === 'wide' ? 12 : 22, sw = PITCH.L / n * S; for (let i = 0; i < n; i++) if (i % 2) g.fillRect(X(-HL) + i * sw, Z(-HW - 1), sw + 1, (PITCH.W + 2) * S); }
      const img = g.getImageData(0, 0, w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 12; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(img, 0, 0);
      g.strokeStyle = 'rgba(255,255,255,0.93)'; g.lineWidth = 0.12 * S; g.lineCap = 'round';
      const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
      rect(-HL, -HW, HL, HW);
      g.beginPath(); g.moveTo(X(0), Z(-HW)); g.lineTo(X(0), Z(HW)); g.stroke();
      g.beginPath(); g.arc(X(0), Z(0), PITCH.CIRCLE * S, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(X(0), Z(0), 0.25 * S, 0, Math.PI * 2); g.fill();
      for (const s of [-1, 1]) {
        const gx = s * HL;
        rect(Math.min(gx, gx - s * PITCH.BOX_D), -PITCH.BOX_W / 2, Math.max(gx, gx - s * PITCH.BOX_D), PITCH.BOX_W / 2);
        rect(Math.min(gx, gx - s * PITCH.SIX_D), -PITCH.SIX_W / 2, Math.max(gx, gx - s * PITCH.SIX_D), PITCH.SIX_W / 2);
        g.beginPath(); g.arc(X(gx - s * PITCH.SPOT), Z(0), 0.22 * S, 0, Math.PI * 2); g.fill();
        const a0 = Math.acos((PITCH.BOX_D - PITCH.SPOT) / PITCH.CIRCLE);
        g.beginPath(); if (s > 0) g.arc(X(gx - s * PITCH.SPOT), Z(0), PITCH.CIRCLE * S, Math.PI - a0, Math.PI + a0); else g.arc(X(gx - s * PITCH.SPOT), Z(0), PITCH.CIRCLE * S, -a0, a0); g.stroke();
        for (const t of [-1, 1]) { g.beginPath(); g.arc(X(gx), Z(t * HW), 1 * S, 0, Math.PI * 2); g.stroke(); }
      }
    });
    this.pitchMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const pitch = add(new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), this.pitchMat));
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true;
    const surround = add(new THREE.Mesh(new THREE.PlaneGeometry(500, 400), new THREE.MeshStandardMaterial({ color: def.backdrop === 'sea' ? 0x2b3a2e : 0x24402a, roughness: 1 })));
    surround.rotation.x = -Math.PI / 2; surround.position.y = -0.03; surround.receiveShadow = true;
    if (def.track) {
      const track = add(new THREE.Mesh(new THREE.PlaneGeometry(PITCH.L + 30, PITCH.W + 26), new THREE.MeshStandardMaterial({ color: 0xa23b2c, roughness: 0.9 })));
      track.rotation.x = -Math.PI / 2; track.position.y = -0.015; track.receiveShadow = true;
      const lanes = []; for (let i = 0; i < 8; i++) { const r = PITCH.W / 2 + 6 + i * 1.2; lanes.push(-HL - 3, 0.01, -r, HL + 3, 0.01, -r, -HL - 3, 0.01, r, HL + 3, 0.01, r); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lanes, 3));
      add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })));
    }

    // LED advertising boards (animated texture scroll)
    const boardTex = this.canvasTex(2048, 96, (g, w, h) => {
      const segs = [['PITCH CLASH', '#0b1220', '#6ee7a8'], ['FAIR PLAY', '#1d4ed8', '#fff'], ['ULTRA BOOTS', '#dc2626', '#fff'], ['GOAL TV', '#f59e0b', '#111'], ['SKYLINE AIR', '#0e7490', '#fff'], ['VOLT ENERGY', '#16a34a', '#fff'], ['NOVA BANK', '#7c3aed', '#fff'], [def.name.toUpperCase().slice(0, 18), '#111827', '#f472b6']];
      const sw = w / segs.length;
      segs.forEach(([t, bg, fg], i) => { g.fillStyle = bg; g.fillRect(i * sw, 0, sw, h); g.fillStyle = fg; g.font = 'italic 900 46px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, i * sw + sw / 2, h / 2 + 3); });
    }, [4, 1]);
    this.boardTex = boardTex;
    const bmat = new THREE.MeshStandardMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.55, roughness: 0.5 });
    const addBoard = (len, x, z, rotY) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.15), bmat)); m.position.set(x, 0.5, z); m.rotation.y = rotY; m.castShadow = true; };
    addBoard(PITCH.L + 8, 0, -HW - 4, 0); addBoard(PITCH.L + 8, 0, HW + 4, Math.PI);
    for (const s of [-1, 1]) for (const t of [-1, 1]) addBoard(HW - GHW - 2, s * (HL + 4.5), t * (GHW + 4 + (HW - GHW - 2) / 2), s * Math.PI / 2);

    // stands
    const concrete = new THREE.MeshStandardMaterial({ color: def.concrete || 0x59606c, roughness: 0.9 });
    const sc = new THREE.Color(def.seats[0]).lerp(new THREE.Color(0x111111), 0.35), sc2 = new THREE.Color(def.seats[1] || def.seats[0]).lerp(new THREE.Color(0x111111), 0.35);
    const seatMats = [new THREE.MeshStandardMaterial({ color: sc, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: sc2, roughness: 0.8 })];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide, transparent: def.roof === 'closed', opacity: def.roof === 'closed' ? 0.35 : 1 });
    const crowdPos = [];
    const ROWS = 22, STEP_D = 0.9, STEP_H = 0.55, TIER_H = ROWS * STEP_H + 2.2;
    const fill = 1 - (def.empty ?? (def.capacity && def.capacity < 30000 ? 0.18 : 0.07));
    const stand = (len, cx, cz, rotY, opts = {}) => {
      const grp = add(new THREE.Group()); grp.position.set(cx, 0, cz); grp.rotation.y = rotY;
      const tiers = opts.tiers || 1;
      for (let tier = 0; tier < tiers; tier++) {
        const y0 = tier * TIER_H, z0 = -tier * (ROWS * STEP_D * 0.55);
        for (let r = 0; r < ROWS; r++) {
          const h = STEP_H * (r + 1) + y0;
          const step = new THREE.Mesh(new THREE.BoxGeometry(len, tier ? STEP_H * 1.2 : h, STEP_D), seatMats[(r + tier) % 2]);
          step.position.set(0, tier ? h - STEP_H * 0.6 : h / 2, z0 - r * STEP_D); step.receiveShadow = true; grp.add(step);
          for (let x = -len / 2 + 0.4; x < len / 2 - 0.4; x += 0.6) {
            if (Math.random() > fill) continue;
            crowdPos.push({ g: grp, v: new THREE.Vector3(x + rand(-0.08, 0.08), h + 0.45, z0 - r * STEP_D + rand(-0.12, 0.08)) });
          }
        }
        if (tier) { const face = new THREE.Mesh(new THREE.BoxGeometry(len, 2.2, 0.4), concrete); face.position.set(0, y0 - 1.0, z0 + 0.6); grp.add(face); }
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(len, tiers * TIER_H + 4, 1), concrete);
      back.position.set(0, (tiers * TIER_H + 4) / 2, -(ROWS * STEP_D) * (1 + (tiers - 1) * 0.55) - 1); grp.add(back);
      if (opts.roof) {
        const depth = ROWS * STEP_D * (1 + (tiers - 1) * 0.55) + 8;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.5, depth), roofMat);
        roof.position.set(0, tiers * TIER_H + 7, -depth / 2 + 6); grp.add(roof);
        if (def.lights === 'roof') { const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 0.6), this.lampMat || new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d5 })); strip.position.set(0, tiers * TIER_H + 6.6, 5.5); grp.add(strip); this.roofStrips.push(strip); }
      }
      return grp;
    };
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d5, emissiveIntensity: 1 });
    this.roofStrips = [];
    const T = def.tiers, gapL = def.gaps ? 0 : 24, gapW = def.gaps ? 0 : 20;
    const roofed = i => def.roof !== 'none' && !(i === 1 && def.roof !== 'closed');
    const sides = [
      stand(PITCH.L + gapL, 0, -HW - 8 - off, 0, { tiers: T[0], roof: roofed(0) }),
      stand(PITCH.L + gapL, 0, HW + 8 + off, Math.PI, { tiers: T[1], roof: false }),
      stand(PITCH.W + gapW, -HL - 9 - off, 0, Math.PI / 2, { tiers: T[2], roof: roofed(2) }),
      stand(PITCH.W + gapW, HL + 9 + off, 0, -Math.PI / 2, { tiers: T[3], roof: roofed(3) }),
    ];
    if (!def.gaps) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const hgt = Math.max(T[0], T[2]) * TIER_H + 6; const c = add(new THREE.Mesh(new THREE.BoxGeometry(14, hgt, 14), concrete)); c.position.set(sx * (HL + 16 + off), hgt / 2, sz * (HW + 16 + off)); }
    if (def.roof === 'closed') { const dome = add(new THREE.Mesh(new THREE.BoxGeometry(PITCH.L + 60, 0.4, PITCH.W + 60), roofMat)); dome.position.y = Math.max(...T) * TIER_H + 16; }
    sides.forEach(g => g.updateMatrixWorld(true));
    // commentary booth: glass box with a desk on the main stand's upper rows, centred behind the halfway line
    const tierI = Math.max(0, T[0] - 1), by0 = tierI * TIER_H, bz0 = -HW - 8 - off - tierI * (ROWS * STEP_D * 0.55) - 7 * STEP_D;
    const boothY = by0 + STEP_H * 8 + 0.2;
    this.boothPos = new THREE.Vector3(0, boothY + 1.55, bz0);
    {
      const bg = add(new THREE.Group()); bg.position.set(0, boothY, bz0);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 3.6), new THREE.MeshStandardMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.4, depthWrite: false }));
      glass.position.y = 1.6; bg.add(glass);
      const dark = new THREE.MeshStandardMaterial({ color: 0x20252c, roughness: 0.6 }), desk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x3b2f27, roughness: 0.4 }));
      desk.position.set(0, 1.0, 1.2); bg.add(desk);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.18, 3.8), dark); frame.position.y = 3.25; bg.add(frame); const base = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.18, 3.8), dark); base.position.y = 0.05; bg.add(base);
      for (let i = -1; i <= 1; i++) { const mon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x2563eb, emissiveIntensity: 0.5 })); mon.position.set(i * 2.6, 1.45, 1.55); mon.rotation.x = -0.25; bg.add(mon); }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), new THREE.MeshBasicMaterial({ map: this.canvasTex(512, 76, (g, w, h) => { g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h); g.fillStyle = '#6ee7a8'; g.font = 'italic 900 44px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('COMMENTARY', w / 2, h / 2 + 2); }) }));
      sign.position.set(0, 3.7, 1.85); bg.add(sign);
    }
    let positions = crowdPos.map(c => c.g.localToWorld(c.v.clone())).filter(p => !(Math.abs(p.x) < 5 && Math.abs(p.z - bz0) < 3.4 && p.y > boothY - 1.2 && p.y < boothY + 4));
    if (window.__lowGpu) positions = positions.filter((_, i) => i % 3 === 0);
    // crowd: real little humanoids (torso + arms + head), instanced, with shader-driven bobbing, cheering arms and the Mexican wave
    const lowCrowd = !location.search.includes('hi=1') && (/low/.test(localStorage.getItem('pc_settings') || '') || navigator.webdriver || window.__lowGpu);
    const box = (w, h, d, x, y, z, rx = 0, rz = 0, part = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1)); return g; };
    const bodyGeo = lowCrowd ? box(0.42, 0.9, 0.3, 0, 0.3, 0) : BufferGeometryUtils.mergeGeometries([
      box(0.44, 0.52, 0.26, 0, 0.3, 0),                     // torso
      box(0.09, 0.46, 0.09, -0.27, 0.34, 0.02, 0, 0.12, 1),  // left arm   (part 1 = arms, raised on cheering)
      box(0.09, 0.46, 0.09, 0.27, 0.34, 0.02, 0, -0.12, 1),  // right arm
      box(0.36, 0.1, 0.34, 0, 0.0, 0.16),                    // thighs (seated)
    ].map(g => g.toNonIndexed()));
    const headGeo = new THREE.IcosahedronGeometry(0.14, lowCrowd ? 0 : 1); headGeo.translate(0, 0.74, 0.02);
    headGeo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(headGeo.attributes.position.count), 1));
    { // hair: the top and back of the head are dark (multiplies the skin tone), the face stays skin-coloured
      const pa = headGeo.attributes.position, ca = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) { const hair = pa.getY(i) > 0.76 || pa.getZ(i) < -0.0; const v = hair ? 0.2 : 1; ca[i * 3] = v; ca[i * 3 + 1] = v * (hair ? 0.9 : 1); ca[i * 3 + 2] = v * (hair ? 0.85 : 1); }
      headGeo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    }
    const n = positions.length, phases = new Float32Array(n), sidesAttr = new Float32Array(n), angs = new Float32Array(n), yaw = new Float32Array(n);
    this.crowdUniforms = this.crowdUniforms || { uTime: { value: 0 }, uExcite0: { value: 0 }, uExcite1: { value: 0 }, uWaveAng: { value: 0 }, uWaveAmp: { value: 0 } };
    positions.forEach((p, i) => { phases[i] = Math.random() * 6.28; sidesAttr[i] = p.x < 0 ? 0 : 1; angs[i] = Math.atan2(p.z, p.x); yaw[i] = Math.atan2(-p.x, -p.z); });
    const patch = (mat, withArms) => { mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.crowdUniforms);
      sh.vertexShader = 'uniform float uTime; uniform float uExcite0; uniform float uExcite1; uniform float uWaveAng; uniform float uWaveAmp; attribute float aPhase; attribute float aSide; attribute float aAng; attribute float aPart;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float ex = mix(uExcite0, uExcite1, aSide);
         float sp = 6.0 + fract(aPhase * 7.3) * 4.0;
         float wd = atan(sin(aAng - uWaveAng), cos(aAng - uWaveAng));
         float wv = uWaveAmp * exp(-wd * wd * 40.0);
         ${withArms ? `if (aPart > 0.5) { float side = sign(transformed.x); float lift = clamp(ex * 1.6 + wv * 1.2, 0.0, 1.0) * (2.5 + 0.4 * sin(uTime * 9.0 + aPhase)); vec2 pv = vec2(side * 0.22, 0.52); vec2 d = transformed.xy - pv; float an = lift * side, c = cos(an), sn = sin(an); transformed.x = pv.x + d.x * c - d.y * sn; transformed.y = pv.y + d.x * sn + d.y * c; }` : ''}
         transformed.y += max(0.0, sin(uTime * sp + aPhase)) * (0.04 + ex * 0.55) + wv * 0.85;
         transformed.x += sin(uTime * 1.3 + aPhase) * 0.03;`);
    }; };
    const bodyMat = window.__lowGpu ? new THREE.MeshLambertMaterial({}) : new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), headMat = window.__lowGpu ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, vertexColors: true });
    patch(bodyMat, true); patch(headMat, false);
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, n); geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1)); geo.setAttribute('aSide', new THREE.InstancedBufferAttribute(sidesAttr, 1)); geo.setAttribute('aAng', new THREE.InstancedBufferAttribute(angs, 1)); m.frustumCulled = false; return m; };
    const body = mk(bodyGeo, bodyMat), head = mk(headGeo, headMat);
    const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), SKIN = [0xf1c9a8, 0xe0ac86, 0xc68642, 0x8d5524, 0x5c3a21, 0x3b2417, 0xffdbb4, 0xd9a066];
    positions.forEach((p, i) => {
      q.setFromEuler(e.set(0, yaw[i], 0)); m4.compose(p, q, new THREE.Vector3(1, 1, 1)); body.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
      col.setHSL(Math.random(), 0.4 + Math.random() * 0.45, 0.16 + Math.random() * 0.3); body.setColorAt(i, col);
      head.setColorAt(i, col.setHex(SKIN[Math.floor(Math.random() * SKIN.length)]).multiplyScalar(0.8 + Math.random() * 0.3));
    });
    const grp = new THREE.Group(); grp.add(body, head);
    this.crowd = grp; this.crowdBody = body; this.crowdHeads = head; this.crowdPositions = positions; this.crowdYaw = yaw; add(grp);

    // floodlights
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.6, roughness: 0.4 });
    this.glows = [];
    const glowTex = this.canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.5)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const glow = (x, y, z, sc) => { const gl = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))); gl.scale.set(sc, sc, 1); gl.position.set(x, y, z); this.glows.push(gl); };
    if (def.lights === 'towers') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (HL + 18 + off), z = sz * (HW + 18 + off);
        const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 46, 8), poleMat)); pole.position.set(x, 23, z);
        const lamp = add(new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.6), this.lampMat)); lamp.position.set(x, 47, z); lamp.lookAt(0, 0, 0);
        glow(x * 0.98, 47, z * 0.98, 26);
      }
    } else {
      for (const st of this.roofStrips) { st.updateMatrixWorld(true); const wp = new THREE.Vector3(); st.getWorldPosition(wp); for (let k = -2; k <= 2; k++) { const dir = st.parent.rotation.y; glow(wp.x + Math.cos(dir) * k * 18, wp.y, wp.z - Math.sin(dir) * k * 18, 14); } }
    }
    // backdrop
    if (def.backdrop === 'mountains') {
      const mm = new THREE.MeshStandardMaterial({ color: 0x5b6b7c, flatShading: true }), snow = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, flatShading: true });
      for (let i = 0; i < 14; i++) { const a = -Math.PI * 0.9 + i * 0.14, r = 260 + Math.random() * 60, h = 70 + Math.random() * 70; const m = add(new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 6), mm)); m.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r - 60); const c = add(new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h * 0.33, 6), snow)); c.position.set(m.position.x, h - 5 - h * 0.16, m.position.z); }
    } else if (def.backdrop === 'city') {
      const win = this.canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#1e293b'; g.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) { g.fillStyle = Math.random() < 0.45 ? '#fde68a' : '#0f172a'; g.fillRect(x, y, 4, 5); } });
      const bm = new THREE.MeshStandardMaterial({ color: 0x9ca3af, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.6, map: win });
      for (let i = 0; i < 40; i++) { const a = -Math.PI + Math.random() * Math.PI * 0.95, r = 200 + Math.random() * 90, h = 25 + Math.random() * 80; const b = add(new THREE.Mesh(new THREE.BoxGeometry(12 + Math.random() * 14, h, 12 + Math.random() * 14), bm)); b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r - 40); }
    } else if (def.backdrop === 'sea') {
      const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(900, 300), new THREE.MeshStandardMaterial({ color: 0x1e5a85, roughness: 0.3, metalness: 0.2 }))); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.02, -260);
    }
    // corner flags
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd400, side: THREE.DoubleSide });
    this.flags = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5), poleMat)); p.position.set(sx * HL, 0.75, sz * HW);
      const f = add(new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32, 6, 1), flagMat)); f.position.set(sx * HL + 0.23, 1.33, sz * HW); this.flags.push(f);
    }
    // dugouts
    const dug = new THREE.MeshStandardMaterial({ color: 0x1f2937, transparent: true, opacity: 0.85 });
    for (const s of [-1, 1]) { const d = add(new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, 2.4), dug)); d.position.set(s * 12, 1.1, -HW - 6.3); }
    this.nets = [this.buildGoal(-1), this.buildGoal(1)];
    this.nets.forEach(n => { this.scene.remove(n.parent); G.add(n.parent); });
  }

  buildGoal(side) {
    const g = new THREE.Group(); this.scene.add(g);
    const post = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const R = 0.06, x0 = side * HL, xb = side * (HL + GOAL_D);
    const cyl = (len, x, y, z, rx, rz) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 12), post); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = true; g.add(m); };
    cyl(GOAL_H, x0, GOAL_H / 2, -GHW); cyl(GOAL_H, x0, GOAL_H / 2, GHW); cyl(GOAL_W + 0.12, x0, GOAL_H, 0, Math.PI / 2);
    const thin = new THREE.MeshStandardMaterial({ color: 0xcfd6df });
    for (const z of [-GHW, GHW]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, GOAL_D), thin); b.position.set((x0 + xb) / 2, GOAL_H, z); b.rotation.z = Math.PI / 2; g.add(b);
      const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, GOAL_H), thin); bb.position.set(xb, GOAL_H / 2, z); g.add(bb);
    }
    const pts = [], step = 0.18;
    const seg = (a, b) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    for (let z = -GHW; z <= GHW + 1e-6; z += step) { seg([xb, 0, z], [xb, GOAL_H, z]); seg([x0, GOAL_H, z], [xb, GOAL_H, z]); }
    for (let y = 0; y <= GOAL_H + 1e-6; y += step) seg([xb, y, -GHW], [xb, y, GHW]);
    for (let t = 0; t <= GOAL_D + 1e-6; t += step) { const x = x0 + side * t; seg([x, GOAL_H, -GHW], [x, GOAL_H, GHW]); for (const z of [-GHW, GHW]) seg([x, 0, z], [x, GOAL_H, z]); }
    for (let y = 0; y <= GOAL_H + 1e-6; y += step) for (const z of [-GHW, GHW]) seg([x0, y, z], [xb, y, z]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const net = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    net.userData.orig = Float32Array.from(pts); net.userData.ripple = 0; net.userData.hit = new THREE.Vector3(); net.userData.side = side;
    g.add(net);
    return net;
  }

  rippleNet(side, x, y, z) {
    const n = this.nets[side < 0 ? 0 : 1];
    n.userData.ripple = 1; n.userData.hit.set(x, y, z);
  }

  // ---------------------------------------------------------------- ball
  buildBall() {
    const tex = this.canvasTex(1024, 512, (g, w, h) => {
      const img = g.createImageData(w, h), d = img.data;
      const p = (1 + Math.sqrt(5)) / 2;
      const verts = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const th = (x / w) * Math.PI * 2, ph = (y / h) * Math.PI;
        const dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
        let best = -2, second = -2, bi = 0;
        verts.forEach((v, i) => { const dt = v[0] * dx + v[1] * dy + v[2] * dz; if (dt > best) { second = best; best = dt; bi = i; } else if (dt > second) second = dt; });
        let r = 248, gg = 248, bb = 248;
        if (best > 0.95) { const accent = bi % 3 === 0; r = accent ? 220 : 25; gg = accent ? 30 : 25; bb = accent ? 45 : 30; }
        else if (best - second < 0.01) { r = gg = bb = 140; }
        const i = (y * w + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
    this.ballMesh.castShadow = true; this.scene.add(this.ballMesh);
    if (window.__lowGpu) { this.ballBlob = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })); this.ballBlob.rotation.x = -Math.PI / 2; this.scene.add(this.ballBlob); }
    // trail
    this.trail = [];
    const tm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * (1 - i / 22), 8, 6), tm.clone()); m.material.opacity = 0.35 * (1 - i / 18); m.visible = false; this.scene.add(m); this.trail.push(m); }
    this.trailPts = [];
    // shot-target marker for set pieces
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.visible = false; this.scene.add(this.marker);
  }

  // ---------------------------------------------------------------- mouse aim line (trajectory dots + landing ring)
  buildAim() {
    const N = 48, mat = new THREE.MeshBasicMaterial({ color: 0x6ee7a8, depthTest: false, transparent: true, opacity: 0.95 });
    this.aimDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), mat, N);
    this.aimDots.frustumCulled = false; this.aimDots.renderOrder = 20; this.aimDots.visible = false; this.scene.add(this.aimDots);
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 40), new THREE.MeshBasicMaterial({ color: 0x6ee7a8, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    this.aimRing.rotation.x = -Math.PI / 2; this.aimRing.renderOrder = 20; this.aimRing.visible = false; this.scene.add(this.aimRing);
    this._aimM = new THREE.Matrix4(); this._aimMax = N;
    // pass-target marker: pulsing ring on the grass + a chevron over the receiver's head
    this.passRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.98, 40), new THREE.MeshBasicMaterial({ color: 0x6ee7a8, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    this.passRing.rotation.x = -Math.PI / 2; this.passRing.renderOrder = 19; this.passRing.visible = false; this.scene.add(this.passRing);
    this.passArrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x6ee7a8, depthTest: false, transparent: true, opacity: 0.95 }));
    this.passArrow.rotation.x = Math.PI; this.passArrow.renderOrder = 19; this.passArrow.visible = false; this.scene.add(this.passArrow);
  }
  setPassMarker(xz) {
    if (!xz) { this.passRing.visible = false; this.passArrow.visible = false; return; }
    const t = performance.now() / 1000, pulse = 1 + Math.sin(t * 7) * 0.08;
    this.passRing.position.set(xz[0], 0.05, xz[1]); this.passRing.scale.set(pulse, pulse, pulse); this.passRing.visible = true;
    this.passArrow.position.set(xz[0], 2.55 + Math.sin(t * 7) * 0.12, xz[1]); this.passArrow.visible = true;
  }
  setAim(pts, color, end, ringR) {
    if (!pts) { this.aimDots.visible = false; this.aimRing.visible = false; return; }
    const n = Math.min(this._aimMax, pts.length), m = this._aimM;
    for (let i = 0; i < n; i++) { const q = pts[i], sc = 0.7 + 0.5 * (i / n); m.makeScale(sc, sc, sc); m.setPosition(q[0], q[1], q[2]); this.aimDots.setMatrixAt(i, m); }
    this.aimDots.count = n; this.aimDots.instanceMatrix.needsUpdate = true; this.aimDots.material.color.setHex(color); this.aimDots.visible = true;
    this.aimRing.position.set(end[0], 0.06, end[1]); this.aimRing.material.color.setHex(color); const r = ringR || 1; this.aimRing.scale.set(r, r, r); this.aimRing.visible = true;
  }

  // ---------------------------------------------------------------- particles / weather
  buildEffects() {
    const N = 1500;
    const geo = new THREE.BufferGeometry();
    this.parts = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), col: new Float32Array(N * 3), size: new Float32Array(N), alpha: new Float32Array(N), grav: new Float32Array(N), n: N, i: 0 };
    geo.setAttribute('position', new THREE.BufferAttribute(this.parts.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.parts.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.parts.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.parts.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: 'attribute float size; attribute float alpha; varying float vA; varying vec3 vC; void main(){ vA=alpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; gl_FragColor=vec4(vC, vA*(1.0-d*1.6)); }',
    });
    this.partPoints = new THREE.Points(geo, mat); this.partPoints.frustumCulled = false; this.scene.add(this.partPoints);
    // precipitation
    const P = 6000, pg = new THREE.BufferGeometry(), pp = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) { pp[i * 3] = rand(-60, 60); pp[i * 3 + 1] = rand(0, 40); pp[i * 3 + 2] = rand(-45, 45); }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.precip = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false }));
    this.precip.frustumCulled = false; this.precip.visible = false; this.scene.add(this.precip);
  }
  lightning() {
    const h = this.hemi, base = h.intensity, bg = this.scene.background.clone();
    let n = 0; const flash = () => { h.intensity = base * 4; this.scene.background.setHex(0xc8d4ff); setTimeout(() => { h.intensity = base; this.scene.background.copy(bg); if (++n < 2 + Math.floor(Math.random() * 2)) setTimeout(flash, 60 + Math.random() * 120); }, 50 + Math.random() * 60); };
    flash();
  }
  setupPrecip(w) {
    const m = this.precip.material;
    if (w === 'rain' || w === 'storm') { m.color.setHex(0xaecbe6); m.size = w === 'storm' ? 0.11 : 0.09; m.opacity = w === 'storm' ? 0.7 : 0.55; }
    else if (w === 'snow') { m.color.setHex(0xffffff); m.size = 0.22; m.opacity = 0.9; }
  }

  emit(x, y, z, count, opts = {}) {
    const P = this.parts;
    const c = new THREE.Color(opts.color || 0x6aa84f);
    for (let k = 0; k < count; k++) {
      const i = P.i = (P.i + 1) % P.n;
      P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
      const sp = opts.speed || 3;
      P.vel[i * 3] = rand(-1, 1) * sp; P.vel[i * 3 + 1] = rand(0.3, 1) * sp * (opts.up || 1); P.vel[i * 3 + 2] = rand(-1, 1) * sp;
      P.life[i] = opts.life || rand(0.4, 0.9);
      const cc = opts.colors ? new THREE.Color(opts.colors[Math.floor(Math.random() * opts.colors.length)]) : c;
      P.col[i * 3] = cc.r; P.col[i * 3 + 1] = cc.g; P.col[i * 3 + 2] = cc.b;
      P.size[i] = opts.size || rand(0.08, 0.18); P.alpha[i] = 1;
      P.grav[i] = opts.smoke ? -0.6 : opts.gravity !== undefined ? opts.gravity : (P.size[i] > 0.3 ? 1.2 : 9);
    }
  }
  confetti(colors) { for (let k = 0; k < 6; k++) this.emit(rand(-20, 20), 25, rand(-12, 12), 60, { colors, speed: 4, up: 0.2, life: 4, size: 0.35, gravity: 0.15 }); this.confettiT = 4; }

  updateEffects(dt) {
    const P = this.parts;
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) { P.alpha[i] = 0; continue; }
      P.life[i] -= dt;
      const grav = P.grav[i];
      P.vel[i * 3 + 1] -= grav * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      if (P.size[i] > 0.3) { P.vel[i * 3] *= 0.98; P.vel[i * 3 + 2] *= 0.98; P.pos[i * 3] += Math.sin(this.time * 3 + i) * dt; }
      if (P.pos[i * 3 + 1] < 0.02) { P.pos[i * 3 + 1] = 0.02; P.vel[i * 3 + 1] = 0; P.vel[i * 3] *= 0.8; P.vel[i * 3 + 2] *= 0.8; }
      P.alpha[i] = Math.min(P.grav[i] < 0 ? 0.55 : 1, P.life[i] * (P.grav[i] < 0 ? 0.4 : 2));
      if (P.grav[i] < 0) { P.size[i] += dt * 0.5; P.vel[i * 3] += dt * 0.4; }
    }
    const g = this.partPoints.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    // precipitation follows camera look point
    if (this.precip.visible) {
      const pos = this.precip.geometry.attributes.position, a = pos.array;
      const fall = this.weather === 'rain' ? 22 : this.weather === 'storm' ? 30 : 2.2;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] -= fall * dt; if (this.weather === 'snow') a[i] += Math.sin(this.time + i) * dt * 0.6; else a[i] += dt * (this.weather === 'storm' ? 9 : 2);
        if (a[i + 1] < 0) { a[i + 1] = 40; a[i] = this.camLook.x + rand(-60, 60); a[i + 2] = this.camLook.z + rand(-40, 45); }
      }
      pos.needsUpdate = true;
    }
    // nets ripple
    for (const n of this.nets) {
      const u = n.userData; if (u.ripple <= 0) continue;
      u.ripple = Math.max(0, u.ripple - dt * 1.4);
      const pos = n.geometry.attributes.position, a = pos.array, o = u.orig;
      for (let i = 0; i < a.length; i += 3) {
        const dx = o[i] - u.hit.x, dy = o[i + 1] - u.hit.y, dz = o[i + 2] - u.hit.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const w = Math.exp(-d * 0.9) * Math.sin(d * 5 - this.time * 24) * u.ripple * 0.35;
        a[i] = o[i] + u.side * Math.abs(w) * 1.2; a[i + 1] = o[i + 1] + w * 0.3; a[i + 2] = o[i + 2];
      }
      pos.needsUpdate = true;
    }
    // flags wave
    for (const f of this.flags) { f.rotation.y = Math.sin(this.time * 3 + f.position.x) * 0.4; }
    if (this.boardTex) this.boardTex.offset.x = (this.time * 0.03) % 1;
  }

  // ---------------------------------------------------------------- characters
  async loadCharacters(onProgress) {
    const loader = new GLTFLoader();
    const tryLoad = url => new Promise(res => loader.load(url, g => res(g), undefined, () => res(null)));
    const variants = 'abcdefghijklmnop'.split('');
    // rough skin tone of each variant (0 light … 1 dark) so a player's skinTone picks a matching face
    const TONE = { a: 0.15, b: 0.95, c: 0.38, d: 0.45, e: 0.18, f: 0.92, g: 0.5, h: 0.38, i: 0.62, j: 0.18, k: 0.45, l: 0.92, m: 0.2, n: 0.5, o: 0.62, p: 0.38 };
    const found = [], tones = [];
    const loaded = await Promise.all(variants.map(v => tryLoad(`../assets/players/footballer_${v}.glb`)));
    loaded.forEach((g, i) => { if (g) { found.push(g); tones.push(TONE[variants[i]]); } });
    onProgress && onProgress(0.85);
    const gk = await tryLoad('../assets/players/keeper.glb');
    onProgress && onProgress(0.95);
    if (!found.length) { const dev = await tryLoad('../assets/dev/Xbot.glb'); if (dev) found.push(dev); }
    onProgress && onProgress(1);
    this.models.outfield = found; this.models.keeper = gk || found[0]; this.models.tones = tones;
    this.realistic = found.length > 0 && !!found[0].animations.find(a => a.name === 'Shoot');
  }

  makeCharacter(p, kit, gkKit) {
    const src = p.isGK ? this.models.keeper : this.pickVariant(p);
    const root = SkeletonUtils.clone(src.scene);
    const colors = p.isGK ? gkKit : kit;
    const skin = new THREE.Color().setHSL(0.07, 0.45, lerp(0.72, 0.2, p.info.skinTone ?? 0.4));
    let any = false;
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nm = mats.map(m => {
        const n = m.name || '';
        const c = m.clone();
        if (/shirt|sleeve|jersey|top/i.test(n)) { c.color.set(colors.shirt); any = true; }
        else if (/short/i.test(n)) { c.color.set(colors.shorts); any = true; }
        else if (/sock/i.test(n)) { c.color.set(colors.socks); any = true; }
        else if (/glove/i.test(n)) { c.color.set(colors.gloves || '#e5e7eb'); }
        else if (/skin|body_mat|human/i.test(n)) { if (!this.realistic) c.color.copy(skin); }
        else if (/^(Hair|Eyes|Eyebrows|Boots)$/.test(n)) { /* keep authored colours */ }
        else if (/HighLimbs|Beta_Surface|Body/i.test(n)) { c.color.set(colors.shirt); any = true; }   // dev mannequin body
        else if (/Joints/i.test(n)) { c.color.set(colors.shorts); }
        return c;
      });
      o.material = Array.isArray(o.material) ? nm : nm[0];
    });
    const holder = new THREE.Group();
    // normalise height to ~1.8 m
    const h0 = this.modelHeight(src); const box = { min: { y: h0.minY } }; const h = h0.h;
    const scale = this.realistic ? 1 : (p.isGK ? 1.88 : 1.78 + ((p.info.physical || 65) - 65) / 400) / h;
    root.scale.setScalar(scale); root.position.y = -box.min.y * scale;
    holder.add(root);
    // ground shadow blob + controlled-player ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; holder.add(ring);
    if (window.__lowGpu) { const blob = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; holder.add(blob); }
    this.scene.add(holder);
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const clip of src.animations) actions[clip.name] = mixer.clipAction(clip);
    const ch = { holder, root, mixer, actions, current: null, ring, player: p, missing: {} };
    this.chars.push(ch);
    return ch;
  }

  // measure a model's posed height once (skinned meshes need bone transforms applied)
  modelHeight(src) {
    if (src.userData && src.userData._h) return src.userData._h;
    const tmp = SkeletonUtils.clone(src.scene);
    tmp.updateMatrixWorld(true);
    const box = new THREE.Box3();
    tmp.traverse(o => {
      if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
      else if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    });
    const r = { h: (box.max.y - box.min.y) || 1.8, minY: box.min.y || 0 };
    src.userData = src.userData || {}; src.userData._h = r;
    return r;
  }

  replaceCharacter(p, kit, gkKit) {
    const i = this.chars.findIndex(c => c.player === p);
    if (i < 0) return;
    const old = this.chars[i]; this.scene.remove(old.holder); old.mixer.stopAllAction();
    this.chars.splice(i, 1);
    const ch = this.makeCharacter(p, kit, gkKit);
    // keep original order so replay snapshots line up
    this.chars.splice(this.chars.indexOf(ch), 1); this.chars.splice(i, 0, ch);
  }

  // pick a face for an outfield player: matches his skin tone, stays the same every match, avoids twins inside a team
  pickVariant(p) {
    const L = this.models.outfield, tones = this.models.tones || [];
    if (!this.realistic || L.length < 2) return L[(p.info.hairStyle ?? p.idx) % L.length];
    this._used = this._used || [new Set(), new Set()];
    const used = this._used[p.team];
    const id = String(p.info.id || p.info.name); let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
    const t = p.info.skinTone ?? 0.4;
    const w = L.map((_, i) => Math.exp(-Math.pow((tones[i] ?? 0.4) - t, 2) / 0.045) * (used.has(i) ? 0.04 : 1));
    let x = rnd() * w.reduce((a, b) => a + b, 0), pick = 0;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) { pick = i; break; } }
    used.add(pick); if (used.size >= L.length) used.clear();
    return L[pick];
  }

  clearCharacters() { this._used = null; for (const c of this.chars) { this.scene.remove(c.holder); c.mixer.stopAllAction(); } this.chars = []; }

  resolveClip(ch, name) {
    const list = CLIP_FALLBACK[name] || [name];
    for (const n of list) if (ch.actions[n]) return n;
    return Object.keys(ch.actions)[0];
  }

  play(ch, name, speed = 1) {
    const clip = this.resolveClip(ch, name);
    const a = ch.actions[clip]; if (!a) return;
    a.timeScale = speed;
    if (ch.current === clip && ch.logical === name) return;
    const once = ONCE.has(name);
    const prev = ch.current ? ch.actions[ch.current] : null;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.enabled = true;
    if (prev && prev !== a) a.crossFadeFrom(prev, once ? 0.08 : 0.2, false);
    a.play();
    ch.current = clip; ch.logical = name; ch.fallback = clip !== name;
  }

  // ---------------------------------------------------------------- per-frame sync
  sync(match, dt, opts = {}) {
    this.time += dt;
    this.crowdUniforms.uTime.value = this.time;
    const b = match.ball;
    // ball
    const prev = this.ballMesh.position.clone();
    this.ballMesh.position.set(b.x, b.y, b.z);
    const mv = this.ballMesh.position.clone().sub(prev); const dist = Math.hypot(mv.x, mv.z);
    if (dist > 0.0005 && dist < 3) { const axis = new THREE.Vector3(mv.z, 0, -mv.x).normalize(); this.ballMesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R)); }
    // trail for fast balls
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    this.trailPts.unshift([b.x, b.y, b.z]); if (this.trailPts.length > this.trail.length * 2) this.trailPts.pop();
    this.trail.forEach((m, i) => { const pt = this.trailPts[i * 2 + 1]; m.visible = !!pt && speed > 19 && !b.owner; if (pt) m.position.set(...pt); });
    // players
    for (const ch of this.chars) {
      const p = ch.player;
      ch.holder.visible = !p.sentOff;
      if (p.sentOff) continue;
      ch.holder.position.set(p.x, 0, p.z);
      ch.holder.rotation.y = p.face;
      const anim = p.anim || 'Idle';
      const sp = p.speed || 0;
      const rate = anim === 'Jog' ? clamp(sp / 4.5, 0.6, 1.3) : anim === 'Run' ? clamp(sp / 6.4, 0.8, 1.3) : anim === 'Sprint' ? clamp(sp / 8.4, 0.9, 1.35) : 1;
      this.play(ch, match.phase === 'goal' && p.celebrating && !p.animOnce ? (p.isGK ? 'KeeperIdle' : 'Jog') : anim, rate);
      // procedural lean when no proper clip exists (dev model)
      let tilt = 0;
      if (ch.fallback) { if (anim === 'Tackle') tilt = -1.2; else if (anim === 'Fall') tilt = 1.3; else if (anim.startsWith('KeeperDive')) tilt = 1.25; }
      ch.root.rotation.x = lerp(ch.root.rotation.x, anim.startsWith('KeeperDive') ? 0 : tilt, Math.min(1, dt * 10));
      ch.root.rotation.z = lerp(ch.root.rotation.z, ch.fallback && anim.startsWith('KeeperDive') ? (anim.endsWith('Left') ? 1.3 : -1.3) : 0, Math.min(1, dt * 10));
      ch.mixer.update(dt);
      if (p.injured) { const a = ch.actions[ch.current]; if (a && a.time > Math.min(0.9, a.getClip().duration * 0.45)) a.paused = true; }
      else if (ch.current && ch.actions[ch.current].paused) ch.actions[ch.current].paused = false;
      const carried = match.injury && match.injury.carried && match.injury.p === p;
      ch.holder.position.y = carried ? 0.95 : 0;
      if (carried) { ch.holder.rotation.y = match.injury.buggy.face; }
      // controlled player ring
      const hum = p.human;
      ch.ring.material.opacity = hum !== null ? 0.9 : 0;
      if (hum !== null) ch.ring.material.color.set(opts.humanColors ? opts.humanColors[hum] : 0xffffff);
    }
    // dust/grass on slides & hard kicks
    this.updateEffects(dt);
    // camera
    this.updateCamera(match, dt, opts);
  }

  updateCamera(match, dt, opts) {
    if (opts.camera === 'manual') return;
    this.director = this.director || new Director(this);
    this.director.update(match, dt, opts);
    // sun shadow follows play
    this.sun.target.position.set(this.camLook.x, 0, this.camLook.z);
    const off = new THREE.Vector3(-40, 80, 45); if (this.timeOfDay === 'night') off.set(10, 90, 20); if (this.timeOfDay === 'sunset') off.set(-90, 30, 30);
    this.sun.position.copy(this.sun.target.position).add(off);
  }

  // replay playback: snapshot -> visuals
  applySnapshot(match, snap, prevSnap, dt) {
    const b = snap.b;
    const prev = this.ballMesh.position.clone();
    this.ballMesh.position.set(b[0], b[1], b[2]);
    const mv = this.ballMesh.position.clone().sub(prev); const dist = Math.hypot(mv.x, mv.z);
    if (dist > 0.0005 && dist < 3) { const axis = new THREE.Vector3(mv.z, 0, -mv.x).normalize(); this.ballMesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R)); }
    this.trail.forEach(m => m.visible = false);
    this.chars.forEach((ch, i) => {
      const s = snap.p[i]; if (!s) return;
      ch.holder.visible = !s[5];
      ch.holder.position.set(s[0], 0, s[1]); ch.holder.rotation.y = s[2];
      this.play(ch, s[3], 1); ch.mixer.update(dt);
      ch.ring.material.opacity = 0;
    });
    this.time += dt; this.crowdUniforms.uTime.value = this.time;
    this.updateEffects(dt);
  }

  replayCamera(snap, t, dt, angle) {
    const b = snap.b, look = new THREE.Vector3(b[0], Math.min(b[1], 2), b[2]);
    let pos, fov = 30;
    if (angle === 0) { pos = new THREE.Vector3(Math.sign(b[0] || 1) * (HL + 9), 3.2, b[2] * 0.3 + 6); fov = 34; }                     // behind the goal
    else if (angle === 1) { pos = new THREE.Vector3(b[0] - 11, 1.9, b[2] + 13); fov = 30; }                                          // low pitch-side tracking
    else if (angle === 2) { pos = new THREE.Vector3(b[0] * 0.9, 27, b[2] + 33); fov = 32; }                                          // high tactical
    else if (angle === 3) {                                                                                                         // player cam: behind the nearest player
      let best = null, bd = 1e9; for (const p of snap.p) { const d = Math.hypot(p[0] - b[0], p[1] - b[2]); if (d < bd && !p[5]) { bd = d; best = p; } }
      pos = best ? new THREE.Vector3(best[0] - Math.sin(best[2]) * 5, 2.4, best[1] - Math.cos(best[2]) * 5) : new THREE.Vector3(b[0], 5, b[2] + 10); fov = 36;
    } else { pos = new THREE.Vector3(b[0], 8, b[2] - 22); fov = 30; }                                                                // reverse angle
    this.camLook.lerp(look, Math.min(1, dt * 4.5)); this.camPos.lerp(pos, Math.min(1, dt * 2));
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); }
    if (this.director) this.director.snap();
  }

  orbitCamera(snap, ang, dt) {
    const b = snap.b, look = new THREE.Vector3(b[0], 1, b[2]);
    const pos = new THREE.Vector3(b[0] + Math.cos(ang) * 14, 5, b[2] + Math.sin(ang) * 14);
    this.camLook.lerp(look, Math.min(1, dt * 4)); this.camPos.lerp(pos, Math.min(1, dt * 3));
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
  }

  render() { if (this.ballBlob) { const b = this.ballMesh.position, k = 1 / (1 + Math.max(0, b.y) * 0.45); this.ballBlob.position.set(b.x, 0.025, b.z); this.ballBlob.scale.setScalar(k); this.ballBlob.material.opacity = 0.42 * k; } this.renderer.render(this.scene, this.camera); }

  setCrowdExcitement(e0, e1) { this.crowdUniforms.uExcite0.value = e0; this.crowdUniforms.uExcite1.value = e1; }

  colorCrowd(home, away) {
    const col = new THREE.Color();
    const h = new THREE.Color(home), a = new THREE.Color(away);
    this.crowdPositions.forEach((p, i) => {
      const r = Math.random();
      const homeSide = p.x < 30;  // home fans dominate
      if (r < 0.62) col.copy(homeSide ? h : a); else if (r < 0.75) col.copy(homeSide ? a : h); else col.setHSL(Math.random(), 0.2, 0.25 + Math.random() * 0.5);
      col.offsetHSL(0, 0, rand(-0.1, 0.08));
      this.crowdBody.setColorAt(i, col);
    });
    this.crowdBody.instanceColor.needsUpdate = true;
  }
}
