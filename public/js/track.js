// Track definitions + spline math (no rendering here so it can be unit-checked in Node).
// Seeded random (deterministic everywhere, so online players build identical tracks)
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Procedural circuit: a closed loop whose radius wobbles with angle (never self-crosses).
export function genPts(seed, R = 230, ex = 1.35, rough = 0.34, n = 20) {
  const r = mulberry(seed), ph = [r() * 7, r() * 7, r() * 7, r() * 7], am = [0.5 + r() * 0.5, 0.4 + r() * 0.6, 0.3 + r() * 0.6, 0.15 + r() * 0.3], pts = [];
  for (let k = 0; k < n; k++) {
    const th = (k + (r() - 0.5) * 0.35) / n * Math.PI * 2;
    const rad = R * (1 + rough * (am[0] * Math.sin(th + ph[0]) * 0.45 + am[1] * Math.sin(2 * th + ph[1]) * 0.55 + am[2] * Math.sin(3 * th + ph[2]) * 0.5 + am[3] * Math.sin(5 * th + ph[3]) * 0.4) + (r() - 0.5) * 0.1);
    pts.push([Math.round(Math.cos(th) * rad * ex), Math.round(Math.sin(th) * rad)]);
  }
  return pts;
}
const G = (id, name, country, theme, seed, R, ex, rough, width = 16) => ({ id, name, country, theme, width, laps: 3, auto: true, pts: genPts(seed, R, ex, rough) });
export const TRACKS = [
  G('douala', 'Douala Dash', 'cm', 'day', 102, 215, 1.35, 0.32),
  G('yaounde', 'Yaoundé Hills', 'cm', 'sunset', 103, 250, 1.2, 0.4),
  { id: 'downtown', name: 'New York Loop', country: 'us', theme: 'day', width: 16, laps: 3,
    pts: [[0,0],[160,0],[300,10],[380,70],[390,170],[330,250],[220,270],[140,230],[60,250],[-40,300],[-140,270],[-180,170],[-150,60],[-80,10]] },
  { id: 'harbor', name: 'Miami Harbor', country: 'us', theme: 'sunset', width: 16, laps: 3,
    pts: [[0,0],[200,0],[360,-40],[470,30],[480,160],[400,240],[280,220],[200,150],[110,170],[90,280],[170,370],[120,460],[-20,470],[-110,380],[-90,240],[-160,130],[-120,30]] },
  G('rio', 'Rio Beachfront', 'br', 'day', 105, 240, 1.5, 0.3),
  G('saopaulo', 'São Paulo Nights', 'br', 'night', 108, 255, 1.25, 0.42),
  G('paris', 'Paris Boulevards', 'fr', 'dusk', 109, 235, 1.3, 0.36),
  G('riviera', 'Riviera Sprint', 'fr', 'day', 110, 270, 1.55, 0.3),
  G('london', 'London Circuit', 'uk', 'overcast', 113, 240, 1.3, 0.38),
  G('highlands', 'Highland Run', 'uk', 'sunset', 114, 290, 1.4, 0.34, 17),
  { id: 'skyline', name: 'Dubai Skyline GP', country: 'ae', theme: 'dusk', width: 17, laps: 3,
    pts: [[0,0],[250,0],[480,20],[640,110],[680,280],[600,430],[430,480],[300,400],[200,300],[80,330],[20,450],[-120,520],[-280,460],[-330,300],[-260,160],[-300,40],[-220,-50],[-100,-30]] },
  G('desert', 'Desert Storm', 'ae', 'day', 116, 300, 1.45, 0.28, 18),
  { id: 'neon', name: 'Tokyo Neon Heights', country: 'jp', theme: 'night', width: 16, laps: 3,
    pts: [[0,0],[140,0],[230,50],[240,150],[170,210],[190,300],[290,330],[390,290],[420,180],[500,120],[590,170],[600,300],[530,410],[380,440],[220,430],[80,450],[-40,400],[-80,290],[-30,190],[-100,110],[-90,30]] },
  G('fuji', 'Fuji Speedway', 'jp', 'day', 117, 280, 1.5, 0.3, 17),
  G('roma', 'Roma Classica', 'it', 'sunset', 118, 235, 1.3, 0.4),
  G('monza', 'Monza Royale', 'it', 'day', 121, 320, 1.6, 0.26, 18),
  G('lagos', 'Lagos Lights', 'ng', 'night', 1014, 260, 1.5, 0.34),
  G('abuja', 'Abuja Ring', 'ng', 'day', 1409, 280, 1.45, 0.3),
  G('mexico', 'Mexico City Fiesta', 'mx', 'sunset', 1873, 265, 1.45, 0.36),
  G('cancun', 'Cancún Coast', 'mx', 'day', 340, 275, 1.55, 0.3),
  G('berlin', 'Berlin Gate', 'de', 'overcast', 2245, 260, 1.45, 0.34),
  G('blackforest', 'Black Forest Ring', 'de', 'day', 387, 290, 1.4, 0.36),
  G('capetown', 'Cape Town Coast', 'za', 'day', 430, 270, 1.45, 0.34),
  G('joburg', 'Johannesburg Gold', 'za', 'sunset', 2654, 265, 1.45, 0.34),
  G('cairo', 'Cairo Pyramids', 'eg', 'day', 595, 255, 1.4, 0.32),
  G('nile', 'Nile Nights', 'eg', 'night', 735, 245, 1.5, 0.34),
  G('shanghai', 'Shanghai Bund', 'cn', 'night', 3027, 265, 1.4, 0.36),
  G('greatwall', 'Great Wall Pass', 'cn', 'day', 608, 300, 1.5, 0.34),
  G('sydney', 'Sydney Harbour', 'au', 'day', 884, 255, 1.4, 0.36),
  G('outback', 'Outback Blaze', 'au', 'sunset', 682, 310, 1.5, 0.28),
];
export const trackById = id => TRACKS.find(t => t.id === id);

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Returns evenly spaced samples around the closed track.
export function buildTrackData(def, spacing = 2) {
  const P = def.pts, n = P.length, dense = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
    for (let k = 0; k < 40; k++) { const t = k / 40; dense.push([catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t)]); }
  }
  const cum = [0];
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i], b = dense[(i + 1) % dense.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[dense.length], N = Math.round(length / spacing), step = length / N;
  const x = new Float32Array(N), z = new Float32Array(N), tx = new Float32Array(N), tz = new Float32Array(N), curv = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * step;
    while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = dense[j], b = dense[(j + 1) % dense.length];
    x[i] = a[0] + (b[0] - a[0]) * f; z[i] = a[1] + (b[1] - a[1]) * f;
  }
  for (let i = 0; i < N; i++) {
    const p = (i + N - 1) % N, q = (i + 1) % N;
    let dx = x[q] - x[p], dz = z[q] - z[p]; const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  // signed curvature (positive = turning left, i.e. heading increasing)
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const q = (i + 1) % N, p = (i + N - 1) % N;
    const h1 = Math.atan2(tx[p], tz[p]), h2 = Math.atan2(tx[q], tz[q]);
    let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    raw[i] = d / (2 * step);
  }
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -4; k <= 4; k++) s += raw[(i + k + N) % N]; curv[i] = s / 9; }
  if (def.auto) { // put the start line in the middle of the straightest stretch
    let best = 0, bv = 1e9;
    for (let i = 0; i < N; i += 3) { let m = 0; for (let k = -45; k <= 30; k += 3) m = Math.max(m, Math.abs(curv[(i + k + N) % N])); if (m < bv) { bv = m; best = i; } }
    const rot = a => { const b = new Float32Array(N); for (let i = 0; i < N; i++) b[i] = a[(i + best) % N]; return b; };
    return features({ def, N, step, length, x: rot(x), z: rot(z), tx: rot(tx), tz: rot(tz), curv: rot(curv), half: def.width / 2 });
  }
  return features({ def, N, step, length, x, z, tx, tz, curv, half: def.width / 2 });
}

// Track furniture, placed the same way on every machine: stunt ramps, a tunnel and a water section.
function features(T) {
  const N = T.N, H = T.half, straight = (i, n) => { for (let k = 0; k < n; k += 3) if (Math.abs(T.curv[(i + k) % N]) > 0.0055) return false; return true; };
  const used = [[N - 40, N], [0, 40]], free = (a, b) => a >= 0 && b < N && used.every(([u, v]) => b < u || a > v), take = (a, b) => used.push([a, b]);
  const seg = (f, len) => { const a = Math.floor(N * f); return [a, Math.min(N - 60, a + len)]; };
  // tunnel around 55% of the lap; water stretch around 20% (relay stages)
  T.tunnel = seg(0.55, 80); T.water = seg(0.2, Math.floor(N * 0.22)); take(T.tunnel[0] - 15, T.tunnel[1] + 15); take(T.water[0] - 15, T.water[1] + 15);
  T.elev = new Float32Array(N);
  const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x), hump = (a, len, up, h) => { for (let k = 0; k <= len; k++) { const y = h * Math.min(sm(k / up), sm((len - k) / up)); T.elev[a + k] = Math.max(T.elev[a + k], y); } };
  const place = (len, from) => { for (let k = 0; k < N; k += 4) { const a = (Math.floor(N * from) + k) % N; if (free(a - 8, a + len + 8)) return a; } return -1; };
  // shortcut: a straight cut through the city across a long bend (saves 30 m or more)
  let best = null;
  for (let s = 40; s < N - 80; s += 6) for (let L = 40; L <= 200; L += 6) {
    const b = s + L; if (b > N - 40) continue;
    const ax = T.x[s], az = T.z[s], bx = T.x[b], bz = T.z[b], c = Math.hypot(bx - ax, bz - az), arc = L * T.step, ux = (bx - ax) / c, uz = (bz - az) / c;
    if (c < 90 || c > 340 || arc - c < 25 || c / arc > 0.94) continue;
    if (ux * T.tx[s] + uz * T.tz[s] < 0.55 || ux * T.tx[b] + uz * T.tz[b] < 0.55 || !free(s - 14, b + 14)) continue;   // gentle turn in and out
    let ok = true, mid = 0; for (let d = 34; d < c - 34 && ok; d += 3) { mid++; const px = ax + ux * d, pz = az + uz * d; for (let i = 0; i < N; i += 2) if ((px - T.x[i]) ** 2 + (pz - T.z[i]) ** 2 < (H + 7) ** 2) { ok = false; break; } }
    if (mid < 6) ok = false;   // the merge zones are the first and last 34 m; the middle must be clear of the road
    if (!ok) continue; const gain = arc - c, score = Math.min(gain, 90) - c * 0.05; if (!best || score > best.score) best = { s, b, gain, c, score };
  }
  if (best) {
    const { s: ca, b: cb, c } = best, n = Math.max(8, Math.round(c / 2)), x = new Float32Array(n + 1), z = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) { x[k] = T.x[ca] + (T.x[cb] - T.x[ca]) * k / n; z[k] = T.z[ca] + (T.z[cb] - T.z[ca]) * k / n; }
    T.cut = { a: ca, b: cb, n, x, z, tx: (T.x[cb] - T.x[ca]) / c, tz: (T.z[cb] - T.z[ca]) / c, half: 5.5, len: c, gain: best.gain }; take(ca - 14, cb + 14);
  }
  // elevated flyover: 300 m on pillars, crossing over a city street
  let a = -1, FL = 0; for (const len of [130, 104, 84]) { a = place(len, 0.72); if (a >= 0) { FL = len; break; } }
  if (a >= 0) { T.flyover = [a, a + FL]; hump(a, FL, Math.round(FL * 0.28), 7.5); take(a - 10, a + FL + 10); }
  // river bridge: a gentle hump over a river
  a = -1; let BL = 0; for (const len of [76, 60]) { a = place(len, 0.38); if (a >= 0) { BL = len; break; } }
  if (a >= 0) { T.bridge = [a, a + BL]; hump(a, BL, Math.round(BL * 0.36), 3.2); take(a - 10, a + BL + 10); }
  // stunt ramps and boost pads on the remaining straights
  T.ramps = []; for (let i = 90, last = -999; i < N - 110 && T.ramps.length < 3; i += 5) if (i - last > N / 6 && straight(i - 8, 44) && free(i - 30, i + 30)) { T.ramps.push({ i, off: (T.ramps.length % 2 ? -1 : 1) * H * 0.42, w: 3.2 }); last = i; take(i - 30, i + 30); }
  T.pads = []; for (let i = 60, last = -999; i < N - 60 && T.pads.length < 4; i += 7) if (i - last > N / 6 && straight(i - 5, 25) && free(i - 6, i + 6)) { T.pads.push({ i, off: (T.pads.length % 2 ? 1 : -1) * H * 0.35 }); last = i; take(i - 6, i + 6); }
  return T;
}
export const elevAt = (T, i) => T.elev ? T.elev[((i % T.N) + T.N) % T.N] : 0;
// where a car is relative to the shortcut: { j (sample), d (distance from its centre line) } or null when far away
export function cutPos(T, x, z, idx) {
  const c = T.cut; if (!c || idx < c.a - 25 || idx > c.b + 25) return null;
  let bj = 0, bd = 1e9; for (let j = 0; j <= c.n; j++) { const d = (x - c.x[j]) ** 2 + (z - c.z[j]) ** 2; if (d < bd) { bd = d; bj = j; } }
  return { j: bj, d: Math.abs((x - c.x[bj]) * c.tz - (z - c.z[bj]) * c.tx) };
}

// Nearest sample index, searching a window around a hint (or globally if hint < 0).
export function nearestIdx(T, px, pz, hint) {
  const N = T.N; let best = 0, bd = 1e18;
  if (hint < 0) {
    for (let i = 0; i < N; i += 2) { const dx = px - T.x[i], dz = pz - T.z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    hint = best;
  }
  bd = 1e18;
  for (let k = -6; k <= 14; k++) {
    const i = (hint + k + N) % N, dx = px - T.x[i], dz = pz - T.z[i], d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// lateral offset from centre line (positive = left of travel direction)
export function lateral(T, i, px, pz) { return (px - T.x[i]) * T.tz[i] - (pz - T.z[i]) * T.tx[i]; }

export function distToTrack(T, px, pz) {
  let bd = 1e18;
  for (let i = 0; i < T.N; i += 2) { const dx = px - T.x[i], dz = pz - T.z[i], d = dx * dx + dz * dz; if (d < bd) bd = d; }
  return Math.sqrt(bd);
}
