// Generates original SVG flags (900x600) from simple geometric specs.
// Layouts follow each national flag's published design. Emblem-heavy flags use a
// simplified stand-in shape and are listed as SIMPLIFIED in assets/flags/SOURCES.md.
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('assets/flags');
const W = 900, H = 600;
const rect = (x, y, w, h, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
const H3 = (c) => c.map((f, i) => rect(0, (H / c.length) * i, W, H / c.length + 1, f)).join('');
const V3 = (c) => c.map((f, i) => rect((W / c.length) * i, 0, W / c.length + 1, H, f)).join('');
const star = (cx, cy, r, f) => {
  const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.42 : r; pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${f}"/>`;
};
const circ = (cx, cy, r, f) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`;
const poly = (pts, f) => `<polygon points="${pts}" fill="${f}"/>`;
const nordic = (bg, cross, edge) => rect(0, 0, W, H, bg) + (edge ? rect(260, 0, 140, H, edge) + rect(0, 230, W, 140, edge) : '') + rect(290, 0, 80, H, cross) + rect(0, 260, W, 80, cross);
// Union Jack (simplified) drawn into a canton box
const jack = (x, y, w, h) => `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 60 30" preserveAspectRatio="none"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#c8102e" stroke-width="2"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6"/></svg>`;
const line = (pts, w, c) => `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
const cross = (bg, c, x = 0.33) => rect(0, 0, W, H, bg) + rect(W * x - 40, 0, 80, H, c) + rect(0, H / 2 - 40, W, 80, c);
const stripes9 = (a, b) => Array.from({ length: 9 }, (_, i) => rect(0, (H / 9) * i, W, H / 9 + 1, i % 2 ? b : a)).join('');
const stars = (n, cx, cy, rad, r, f) => Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n - Math.PI / 2; return star(cx + rad * Math.cos(a), cy + rad * Math.sin(a), r, f); }).join('');

const S = {
  // Africa
  mar: rect(0, 0, W, H, '#c1272d') + star(450, 300, 150, '#006233'),
  nga: V3(['#008751', '#ffffff', '#008751']),
  civ: V3(['#f77f00', '#ffffff', '#009e60']),
  egy: H3(['#ce1126', '#ffffff', '#000000']) + circ(450, 300, 46, '#c09300'),
  alg: V3(['#006233', '#ffffff']) + circ(430, 300, 110, '#d21034') + circ(465, 300, 90, '#ffffff') + star(520, 300, 40, '#d21034'),
  mli: V3(['#14b53a', '#fcd116', '#ce1126']),
  gha: H3(['#006b3f', '#fcd116', '#ce1126']) + star(450, 300, 90, '#000000'),
  tun: rect(0, 0, W, H, '#e70013') + circ(450, 300, 150, '#ffffff') + circ(475, 300, 115, '#e70013') + star(525, 300, 75, '#e70013'),
  bfa: H3(['#ef2b2d', '#009e49']) + star(450, 300, 150, '#fcd116'),
  cod: rect(0, 0, W, H, '#007fff') + poly('0,600 0,470 900,130 900,0 760,0 0,520', '#ce1021') + star(150, 110, 80, '#f7d618'),
  rsa: rect(0, 0, W, H, '#ffffff') + poly('0,0 900,0 900,600 0,600', '#007749') + poly('0,0 300,0 450,300 300,600 0,600', '#000000') + poly('0,0 0,600 300,600 450,300 300,0', '#ffffff') + poly('0,0 0,600 240,600 380,300 240,0', '#000000') + poly('0,0 300,0 450,300 300,600', '#de3831') + poly('0,0 0,240 380,300 0,360', '#002395'),
  cpv: rect(0, 0, W, H, '#003893') + rect(0, 320, W, 60, '#ffffff') + rect(0, 380, W, 220, '#cf2027') + stars(10, 450, 300, 140, 16, '#f7d116'),
  gui: V3(['#ce1126', '#fcd116', '#009460']),
  gab: H3(['#009e60', '#fcd116', '#3a75c4']),
  zam: rect(0, 0, W, H, '#198a00') + poly('0,600 900,600 900,470 0,600', '#de2010') + rect(0, 0, 900, 0, '#000') + circ(450, 300, 70, '#ef7d00'),
  ang: H3(['#cc092f', '#000000']) + circ(450, 300, 110, '#ffcb00'),
  eqg: H3(['#3e9a00', '#ffffff', '#e32118']) + poly('0,0 0,600 260,300', '#0572ce') + circ(120, 300, 40, '#ffcb00'),
  uga: H3(['#000000', '#fcdc04', '#d90000']) + circ(450, 300, 90, '#ffffff'),
  ken: H3(['#000000', '#ffffff', '#bb0000', '#ffffff', '#006600']) + circ(450, 300, 70, '#bb0000'),
  tan: rect(0, 0, W, H, '#1eb53a') + poly('0,600 900,0 900,0 0,600', '#fcd116') + poly('0,600 900,0 900,0 0,0', '#00a3dd') + poly('0,540 900,60 900,0 0,600', '#000000'),
  moz: H3(['#007f3d', '#ffffff', '#000000', '#fcd116']) + poly('0,0 0,600 260,300', '#d21034'),
  ben: rect(0, 0, W, H, '#e8112d') + rect(0, 0, 360, H, '#008751') + rect(360, 0, 540, 300, '#fcd116'),
  mtn: H3(['#00a95c', '#ffc600', '#e31d1c']) + circ(450, 300, 56, '#ffc600') + circ(472, 300, 46, '#00a95c'),
  nam: rect(0, 0, W, H, '#003580') + poly('0,0 900,600 900,470 0,130', '#ffffff') + poly('0,600 900,0 900,130 0,470', '#ffffff') + poly('0,0 900,600 900,520 0,80', '#da0000') + poly('0,600 900,0 900,80 0,520', '#009543'),
  zim: H3(['#006400', '#ffd200', '#d40000', '#000000']) + poly('0,0 0,600 230,300', '#ffffff') + star(360, 300, 60, '#ffd200'),
  sud: H3(['#d21034', '#ffffff', '#000000']) + poly('0,0 0,600 260,300', '#007229'),
  // Europe
  bel: V3(['#000000', '#fae042', '#ef3340']),
  cro: H3(['#ff0000', '#ffffff', '#171796']) + Array.from({ length: 6 }, (_, i) => Array.from({ length: 12 }, (_, j) => (i + j) % 2 ? rect(j * 75, i * 30, 75, 30, '#ff0000') : '').join('')).slice(0, 0).join(''),
  den: nordic('#c8102e', '#ffffff'),
  sui: rect(0, 0, W, H, '#ff0000') + rect(380, 150, 140, 300, '#ffffff') + rect(300, 230, 300, 140, '#ffffff'),
  aut: H3(['#ed2939', '#ffffff', '#ed2939']),
  tur: rect(0, 0, W, H, '#e30a17') + circ(340, 300, 150, '#ffffff') + circ(385, 300, 120, '#e30a17') + star(540, 300, 80, '#ffffff'),
  nor: nordic('#ba0c2f', '#00205b', '#ffffff'),
  srb: H3(['#c6363c', '#0c4076', '#ffffff']) + circ(180, 130, 60, '#c6363c'),
  ukr: H3(['#005bbb', '#ffd500']),
  pol: H3(['#ffffff', '#dc143c']),
  swe: nordic('#006aa7', '#fecc00'),
  cze: H3(['#ffffff', '#d7141a']) + poly('0,0 450,300 0,600', '#11457e'),
  hun: H3(['#ce2939', '#ffffff', '#477050']),
  sco: rect(0, 0, W, H, '#005eb8') + poly('0,0 900,600 900,540 60,0', '#ffffff') + poly('900,0 0,600 0,540 840,0', '#ffffff'),
  gre: Array.from({ length: 9 }, (_, i) => rect(0, (H / 9) * i, W, H / 9 + 1, i % 2 ? '#ffffff' : '#0d5eaf')).join('') + rect(0, 0, 300, 333, '#0d5eaf') + rect(120, 0, 60, 333, '#ffffff') + rect(0, 137, 300, 60, '#ffffff'),
  wal: H3(['#ffffff', '#00b139']) + circ(450, 300, 90, '#d30731'),
  rou: V3(['#002b7f', '#fcd116', '#ce1126']),
  svk: H3(['#ffffff', '#0b4ea2', '#ee1c25']) + poly('0,0 0,600 240,300', '#ee1c25') + circ(120, 300, 60, '#ffffff'),
  svn: H3(['#ffffff', '#005da4', '#ed1c24']) + poly('0,0 0,600 240,300', '#005da4') + circ(120, 300, 60, '#ffffff'),
  irl: V3(['#169b62', '#ffffff', '#ff883e']),
  geo: rect(0, 0, W, H, '#ffffff') + rect(380, 0, 140, H, '#ff0000') + rect(0, 230, W, 140, '#ff0000') + [[120, 100], [780, 100], [120, 500], [780, 500], [450, 300]].map(([x, y]) => rect(x - 20, y - 60, 40, 120, '#ff0000') + rect(x - 60, y - 20, 120, 40, '#ff0000')).join(''),
  alb: rect(0, 0, W, H, '#e41e20') + circ(450, 300, 150, '#000000'),
  por: rect(0, 0, 360, H, '#046a38') + rect(360, 0, 540, H, '#da291c') + circ(360, 300, 80, '#ffe600'),
  // South America
  uru: stripes9('#ffffff', '#0038a8') + rect(0, 0, 300, 330, '#ffffff') + circ(150, 165, 60, '#fcd116'),
  col: rect(0, 0, W, 300, '#fcd116') + rect(0, 300, W, 150, '#003893') + rect(0, 450, W, 150, '#ce1126'),
  ecu: rect(0, 0, W, 300, '#ffdd00') + rect(0, 300, W, 150, '#034ea2') + rect(0, 450, W, 150, '#ed1c24'),
  par: H3(['#d52b1e', '#ffffff', '#0038a8']) + circ(450, 300, 50, '#ffffff'),
  chi: H3(['#ffffff', '#d52b1e']) + rect(0, 0, 300, 300, '#0039a6') + star(150, 150, 80, '#ffffff'),
  per: V3(['#d91023', '#ffffff', '#d91023']),
  ven: H3(['#fcd116', '#00247d', '#cf142b']) + stars(8, 450, 300, 110, 14, '#ffffff'),
  bol: H3(['#d52b1e', '#f9e300', '#007934']),
  // Asia
  jpn: rect(0, 0, W, H, '#ffffff') + circ(450, 300, 180, '#bc002d'),
  kor: rect(0, 0, W, H, '#ffffff') + circ(450, 300, 150, '#cd2e3a') + '<path d="M300 300 A150 150 0 0 1 600 300 A75 75 0 0 1 450 300 A75 75 0 0 0 300 300 Z" fill="#0047a0"/>',
  irn: H3(['#239f40', '#ffffff', '#da0000']) + circ(450, 300, 50, '#da0000'),
  aus: rect(0, 0, W, H, '#012169') + star(700, 420, 70, '#ffffff') + star(560, 170, 50, '#ffffff') + star(790, 250, 35, '#ffffff') + rect(0, 0, 330, 300, '#012169'),
  ksa: rect(0, 0, W, H, '#006c35') + rect(250, 330, 400, 40, '#ffffff'),
  qat: rect(0, 0, W, H, '#ffffff') + rect(0, 0, 330, H, '#8a1538'),
  irq: H3(['#ce1126', '#ffffff', '#000000']) + rect(0, 0, 0, 0, '#000') + star(450, 300, 46, '#007a3d'),
  uzb: H3(['#1eb53a', '#ffffff', '#0099b5']) + circ(120, 90, 40, '#ffffff') + rect(0, 175, W, 12, '#ce1126') + rect(0, 413, W, 12, '#ce1126'),
  uae: H3(['#00732f', '#ffffff', '#000000']) + rect(0, 0, 220, H, '#ff0000'),
  jor: H3(['#000000', '#ffffff', '#007a3d']) + poly('0,0 0,600 260,300', '#ce1126') + star(90, 300, 45, '#ffffff'),
  omn: H3(['#ffffff', '#db161b', '#009639']) + rect(0, 0, 300, H, '#db161b'),
  chn: rect(0, 0, W, H, '#de2910') + star(150, 120, 90, '#ffde00') + star(300, 50, 25, '#ffde00') + star(340, 130, 25, '#ffde00') + star(320, 210, 25, '#ffde00') + star(260, 260, 25, '#ffde00'),
  bhr: rect(0, 0, W, H, '#ce1126') + rect(0, 0, 260, H, '#ffffff'),
  syr: H3(['#ce1126', '#ffffff', '#000000']) + star(300, 300, 45, '#007a3d') + star(450, 300, 45, '#007a3d') + star(600, 300, 45, '#007a3d'),
  ple: H3(['#000000', '#ffffff', '#009639']) + poly('0,0 0,600 260,300', '#ce1126'),
  kgz: rect(0, 0, W, H, '#e8112d') + circ(450, 300, 110, '#ffef00') + circ(450, 300, 80, '#e8112d'),
  vie: rect(0, 0, W, H, '#da251d') + star(450, 300, 180, '#ffff00'),
  tha: H3(['#a51931', '#f4f5f8', '#2d2a4a', '#f4f5f8', '#a51931']) ,
  lbn: H3(['#ee161f', '#ffffff', '#ee161f']) + star(450, 300, 70, '#00a651'),
  tjk: H3(['#cc0000', '#ffffff', '#006600']) + rect(0, 0, 0, 0, '#000') + circ(450, 300, 60, '#f8c300'),
  ind: H3(['#ff9933', '#ffffff', '#138808']) + circ(450, 300, 60, 'none') + circ(450, 300, 58, '#000080'),
  idn: H3(['#ce1126', '#ffffff']),
  mas: Array.from({ length: 14 }, (_, i) => rect(0, (H / 14) * i, W, H / 14 + 1, i % 2 ? '#ffffff' : '#cc0001')).join('') + rect(0, 0, 360, 320, '#010066') + circ(150, 160, 70, '#fdc800') + circ(170, 160, 58, '#010066'),
  kuw: H3(['#007a3d', '#ffffff', '#ce1126']) + poly('0,0 0,600 230,300', '#000000'),
  hkg: rect(0, 0, W, H, '#de2910') + circ(450, 300, 150, '#ffffff') + star(450, 300, 100, '#de2910'),
  // North & Central America, Caribbean
  can: V3(['#ff0000', '#ffffff', '#ff0000']) + star(450, 300, 90, '#ff0000'),
  crc: H3(['#002b7f', '#ffffff', '#ce1126', '#ffffff', '#002b7f']),
  pan: rect(0, 0, W, H, '#ffffff') + rect(450, 0, 450, 300, '#d21034') + rect(0, 300, 450, 300, '#d21034') + rect(0, 0, 450, 300, '#072357') + rect(450, 300, 450, 300, '#072357') + star(225, 150, 70, '#072357') + star(675, 450, 70, '#d21034'),
  jam: rect(0, 0, W, H, '#009b3a') + poly('0,0 900,600 900,540 60,0', '#fed100') + poly('900,0 0,600 0,540 840,0', '#fed100') + poly('0,0 450,300 0,600', '#000000') + poly('900,0 450,300 900,600', '#000000'),
  hon: H3(['#0073cf', '#ffffff', '#0073cf']) + stars(5, 450, 300, 80, 22, '#0073cf'),
  slv: H3(['#0047ab', '#ffffff', '#0047ab']) + circ(450, 300, 60, '#ffffff'),
  hai: H3(['#00209f', '#d21034']) + rect(340, 240, 220, 120, '#ffffff'),
  tri: rect(0, 0, W, H, '#ce1126') + poly('0,0 900,600 900,540 60,0', '#000000') + poly('900,0 0,600 0,540 840,0', '#ffffff'),
  gua: H3(['#4997d0', '#ffffff', '#4997d0']) + circ(450, 300, 60, '#4997d0'),
  cuw: H3(['#002b7f', '#f9e14b', '#002b7f']) + stars(4, 450, 300, 120, 22, '#ffffff'),
  nca: H3(['#0067c6', '#ffffff', '#0067c6']) + poly('450,260 380,380 520,380', '#ffd700'),
  sur: H3(['#377e3f', '#ffffff', '#b40a2d', '#ffffff', '#377e3f']) + star(450, 300, 110, '#ecc81d'),
  cub: Array.from({ length: 5 }, (_, i) => rect(0, (H / 5) * i, W, H / 5 + 1, i % 2 ? '#ffffff' : '#002a8f')).join('') + poly('0,0 0,600 520,300', '#cf142b') + star(180, 300, 90, '#ffffff'),
  dom: rect(0, 0, W, H, '#ffffff') + rect(0, 0, 0, 0, '#000') + rect(380, 0, 140, H, '#cf142b') + rect(0, 230, W, 140, '#cf142b') + rect(0, 0, 380, 300, '#002d62') + rect(520, 0, 380, 300, '#cf142b') + rect(0, 300, 380, 300, '#cf142b') + rect(520, 300, 380, 300, '#002d62'),
  // Oceania
  nzl: rect(0, 0, W, H, '#00247d') + poly('0,0 450,300 0,300', '#ffffff') + poly('0,0 0,600 450,600 450,0 360,0 0,240', '#cc142b') + star(680, 180, 58, '#ffffff') + star(560, 430, 58, '#cc142b') + star(810, 420, 45, '#ffffff') + star(680, 480, 45, '#ffffff'),
  fij: rect(0, 0, W, H, '#68bfe5') + rect(0, 0, 300, 300, '#012169') + star(150, 150, 90, '#ffffff') + circ(640, 380, 110, '#ffffff') + circ(640, 380, 80, '#cc0000'),
  png: H3(['#000000', '#ce1126']) + poly('0,600 900,0 0,0', '#000000') + circ(330, 300, 60, '#fcd116'),
};

// ---- corrections (applied after the base table)
Object.assign(S, {
  dom: rect(0, 0, W, H, '#ffffff') + rect(0, 0, 380, 230, '#002d62') + rect(520, 0, 380, 230, '#ce1126') + rect(0, 370, 380, 230, '#ce1126') + rect(520, 370, 380, 230, '#002d62') + circ(450, 300, 40, '#ffffff'),
  tan: rect(0, 0, W, H, '#1eb53a') + poly('900,0 900,600 0,600', '#00a3dd') + poly('0,600 900,0 760,0 0,500', '#fcd116') + poly('0,600 900,0 840,0 0,550', '#000000') + line('0,640 940,-20', 140, '#fcd116') + line('0,640 940,-20', 100, '#000000'),
  nam: rect(0, 0, W, H, '#009543') + poly('0,0 900,0 0,600', '#003580') + poly('0,600 0,470 770,0 900,0 900,130 130,600', '#ffffff') + poly('0,600 0,520 700,0 900,0 900,80 200,600', '#d21034') + circ(150, 130, 60, '#ffce00'),
  rsa: rect(0, 0, W, 300, '#de3831') + rect(0, 300, W, 300, '#002395') + line('0,-60 380,300 900,300', 230, '#ffffff') + line('0,660 380,300 900,300', 230, '#ffffff') + line('0,-60 380,300 900,300', 140, '#007749') + line('0,660 380,300 900,300', 140, '#007749') + poly('0,90 0,510 270,300', '#ffb612') + poly('0,150 0,450 210,300', '#000000'),
  png: rect(0, 0, W, H, '#000000') + poly('0,0 900,0 900,600', '#ce1126') + circ(720, 190, 70, '#fcd116') + star(190, 380, 40, '#ffffff') + star(100, 480, 28, '#ffffff') + star(250, 500, 28, '#ffffff'),
  mtn: rect(0, 0, W, H, '#006233') + rect(0, 0, W, 90, '#d01c1f') + rect(0, 510, W, 90, '#d01c1f') + circ(450, 300, 130, '#ffd700') + circ(450, 265, 120, '#006233') + star(450, 285, 60, '#ffd700'),
  uga: H3(['#000000', '#fcdc04', '#d90000', '#000000', '#fcdc04', '#d90000']) + circ(450, 300, 100, '#ffffff'),
  cuw: rect(0, 0, W, H, '#002b7f') + rect(0, 400, W, 60, '#f9e814') + star(150, 130, 60, '#ffffff') + star(260, 210, 42, '#ffffff'),
  aus: rect(0, 0, W, H, '#012169') + jack(0, 0, 450, 300) + star(225, 450, 90, '#ffffff') + star(670, 130, 52, '#ffffff') + star(770, 280, 52, '#ffffff') + star(560, 300, 52, '#ffffff') + star(670, 470, 52, '#ffffff') + star(720, 360, 30, '#ffffff'),
  nzl: rect(0, 0, W, H, '#012169') + jack(0, 0, 450, 300) + star(680, 140, 52, '#cc142b') + star(560, 300, 52, '#cc142b') + star(800, 300, 52, '#cc142b') + star(680, 470, 52, '#cc142b'),
  fij: rect(0, 0, W, H, '#68bfe5') + jack(0, 0, 450, 300) + rect(560, 180, 260, 300, '#ffffff') + rect(580, 200, 220, 130, '#cc0000') + rect(580, 330, 220, 130, '#68bfe5'),
});

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [id, body] of Object.entries(S)) {
  if (!body) continue;
  fs.writeFileSync(path.join(OUT, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>\n`);
  n++;
}
console.log('flags written:', n);
