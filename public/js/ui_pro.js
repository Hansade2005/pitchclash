// Menu polish: vector icons on menu items (and in place of emoji) and pointer-driven 3D tilt.
const svg = (b) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
const I = {
  ball: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.6l3.6 2.6-1.4 4.2H9.8L8.4 10.2z"/><path d="M12 7.6V3.2M15.6 10.2l4.4-1.4M14.2 14.4l2.6 3.6M9.8 14.4L7.2 18M8.4 10.2L4 8.8"/>'),
  trophy: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M8 21h8M9.5 18h5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  pencil: svg('<path d="M4 20l1-4L16.500 4.500a2 2 0 0 1 3 3L8 19z"/><path d="M14.500 6.500l3 3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.500"/><path d="M12 2.500v2.700M12 18.800v2.700M2.500 12h2.700M18.800 12h2.700M5.300 5.300l1.900 1.900M16.800 16.800l1.900 1.900M18.700 5.300l-1.900 1.900M7.200 16.800l-1.900 1.900"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.500h.01"/>'),
  play: svg('<path d="M7 4.500v15l12-7.500z"/>'),
  users: svg('<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20a6.500 6.500 0 0 1 13 0"/><path d="M16 5a3 3 0 0 1 0 6M18 14.500a6 6 0 0 1 3.500 5.500"/>'),
  star: svg('<path d="M12 2.800l2.800 5.900 6.400.9-4.700 4.500 1.200 6.400L12 17.400 6.300 20.500l1.200-6.400L2.800 9.600l6.400-.9z"/>'),
  repeat: svg('<path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/>'),
  bandage: svg('<rect x="2.500" y="8.500" width="19" height="7" rx="3.500" transform="rotate(-35 12 12)"/><path d="M9.500 9.500l5 5M14.500 9.500l-5 5"/>'),
  cross: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: svg('<path d="M14 6l-6 6 6 6M8 12h12"/>'),
  card: (c) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3.500" width="12" height="17" rx="2.200" fill="${c}"/></svg>`,
};
// emoji -> icon (HUD / toasts)
const EMOJI = { '⚽': I.ball, '🏆': I.trophy, '🔁': I.repeat, '🩹': I.bandage, '✕': I.cross, '🟨': I.card('#facc15'), '🟥': I.card('#ef4444') };
const EMOJI_RE = new RegExp('(' + Object.keys(EMOJI).join('|') + ')\\ufe0f?', 'g');
// menu label keyword -> icon, applied to the first line of each menu button
const LABELS = [[/how to|help|controls/i, 'info'], [/kick-?off|quick match|play match|play friendly/i, 'ball'], [/competition|cup|league|champion|trophy/i, 'trophy'], [/online|network|lan|join|host/i, 'globe'], [/penalt|shoot-?out/i, 'target'],
  [/edit|rename|kit|badge/i, 'pencil'], [/setting|option|volume|graphics/i, 'gear'], [/player|team|squad/i, 'users'], [/next|continue|start/i, 'play'], [/back|menu|quit|exit/i, 'back']];

let busy = false;
function decorate() {
  if (busy) return; busy = true;
  try {
    document.querySelectorAll('#ui button .l:not([data-ico])').forEach((l) => {
      l.dataset.ico = '1';
      if (l.closest('.tab, .digit, .mini')) return;
      const first = l.firstChild; if (!first || first.nodeType !== 3) return;
      const m = LABELS.find(([re]) => re.test(first.nodeValue)); if (!m) return;
      const b = document.createElement('b'); b.style.font = 'inherit'; b.innerHTML = I[m[1]] + '<span></span>'; b.lastChild.textContent = first.nodeValue;
      l.replaceChild(b, first);
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (EMOJI_RE.test(n.nodeValue) && !/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const nodes = []; EMOJI_RE.lastIndex = 0; while (walker.nextNode()) { nodes.push(walker.currentNode); EMOJI_RE.lastIndex = 0; }
    for (const n of nodes) {
      EMOJI_RE.lastIndex = 0; const s = document.createElement('span'); s.className = 'ico-wrap';
      s.innerHTML = n.nodeValue.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(EMOJI_RE, (x, k) => EMOJI[k]);
      n.parentNode.replaceChild(s, n);
    }
  } finally { busy = false; }
}
let queued = false;
new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); } }).observe(document.body, { childList: true, subtree: true });
decorate();

// pointer tilt on buttons
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let cur = null;
  const reset = (el) => { if (el) { ['--rx', '--ry', '--mx', '--my'].forEach((p) => el.style.removeProperty(p)); el.classList.remove('tilting'); } };
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('#ui button');
    if (cur && cur !== el) { reset(cur); cur = null; }
    if (!el) return; cur = el;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', ((px - 0.5) * 8).toFixed(2) + 'deg'); el.style.setProperty('--rx', ((0.5 - py) * 4).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100).toFixed(1) + '%'); el.classList.add('tilting');
  }, { passive: true });
}
