// Generates original club crests (shield in kit colours with the club's short code).
// Not based on any real club badge. Run: node tools/crests/generate_crests.mjs
import fs from 'fs';
import path from 'path';
import { CLUBS } from '../../src/data/teams.js';

const OUT = path.resolve('assets/crests');
const lum = (hex) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ink = (bg) => (lum(bg) > 0.6 ? '#111111' : '#ffffff');
const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function crest(club) {
  const main = club.colors.shirt;
  const band = club.colors.shorts !== main ? club.colors.shorts : club.colors.alt.shirt;
  const text = ink(main);
  // shield: flat top, pointed bottom; left half main colour, right half band colour
  const shield = 'M10 6 H90 V58 Q90 84 50 96 Q10 84 10 58 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${esc(club.name)}">
  <defs><clipPath id="s"><path d="${shield}"/></clipPath></defs>
  <g clip-path="url(#s)">
    <rect x="0" y="0" width="50" height="100" fill="${main}"/>
    <rect x="50" y="0" width="50" height="100" fill="${band}"/>
  </g>
  <path d="${shield}" fill="none" stroke="#111111" stroke-width="3"/>
  <rect x="16" y="44" width="68" height="30" rx="5" fill="#111111" opacity="0.85"/>
  <text x="50" y="65" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${club.short.length > 3 ? 17 : 22}" fill="#ffffff">${esc(club.short)}</text>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const club of CLUBS) {
  fs.writeFileSync(path.join(OUT, `${club.id}.svg`), crest(club));
  n++;
}
console.log('crests written:', n);
