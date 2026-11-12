// Vector icon set that replaces emoji in every menu. Icons are drawn with currentColor so they
// follow the menu theme; a MutationObserver swaps emoji in text nodes after each render.
const svg = (body, extra = '') => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
const solid = (body) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const ICONS = {
  '⚽': svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.6l3.6 2.6-1.4 4.2H9.8L8.4 10.2z"/><path d="M12 7.6V3.2M15.6 10.2l4.4-1.4M14.2 14.4l2.6 3.6M9.8 14.4L7.2 18M8.4 10.2L4 8.8"/>'),
  '🏆': svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M8 21h8M9.5 18h5"/>'),
  '🪙': svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9.5v5M10.2 11h2.6a1 1 0 0 1 0 2h-2.6"/>'),
  '💰': svg('<path d="M9 3.5h6l-1.2 3h-3.6z"/><path d="M10.2 6.5C6 8.5 4.5 12 4.5 15a5 5 0 0 0 5 5h5a5 5 0 0 0 5-5c0-3-1.5-6.500-5.700-8.500"/><path d="M12 11v6M10.2 12.4c0-1.700 3.600-1.700 3.600 0s-3.600 1.100-3.600 2.800 3.600 1.700 3.600 0"/>'),
  '🏟': svg('<ellipse cx="12" cy="8" rx="8.500" ry="3.200"/><path d="M3.500 8v7c0 1.800 3.800 3.200 8.500 3.200s8.500-1.400 8.500-3.200V8"/><ellipse cx="12" cy="8" rx="4.500" ry="1.500"/><path d="M12 11.200v6.800"/>'),
  '🎰': svg('<rect x="3.500" y="4" width="15" height="16" rx="2.500"/><rect x="6" y="8" width="3" height="5" rx=".8"/><rect x="10.500" y="8" width="3" height="5" rx=".8"/><rect x="15" y="8" width="0" height="5"/><path d="M21 7v6M21 7a1.200 1.200 0 1 0 0-.01M6 16.500h9"/>'),
  '📋': svg('<rect x="5" y="4.500" width="14" height="16.500" rx="2"/><path d="M9 4.500V3.500h6v1M8.500 10h7M8.500 13.500h7M8.500 17h4.500"/>'),
  '🩹': svg('<rect x="2.500" y="8.500" width="19" height="7" rx="3.500" transform="rotate(-35 12 12)"/><path d="M9.500 9.500l5 5M14.500 9.500l-5 5" transform="rotate(0 12 12)"/>'),
  '🌱': svg('<path d="M12 21v-9"/><path d="M12 12c0-4 2.500-6.500 7-6.500 0 4-2.500 6.500-7 6.500zM12 14.500c0-3-2-5-6-5 0 3 2 5 6 5z"/>'),
  '👔': svg('<path d="M9 3.500l3 2.500 3-2.500 3.500 3.500-2 2-1.500-1V21h-6V8L7.500 9l-2-2z"/><path d="M12 6l-1 3 1 6 1-6z"/>'),
  '📊': svg('<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="6" rx=".6"/><rect x="12" y="8" width="3" height="10" rx=".6"/><rect x="17" y="5" width="3" height="13" rx=".6"/>'),
  '⭐': solid('<path d="M12 2.800l2.800 5.900 6.400.9-4.700 4.500 1.200 6.400L12 17.400 6.300 20.500l1.200-6.400L2.800 9.600l6.400-.9z" fill="currentColor"/>'),
  '★': solid('<path d="M12 2.800l2.800 5.900 6.400.9-4.700 4.500 1.200 6.400L12 17.400 6.300 20.500l1.200-6.400L2.800 9.600l6.400-.9z" fill="currentColor"/>'),
  '✅': svg('<circle cx="12" cy="12" r="9"/><path d="M7.500 12.500l3 3 6-6.500"/>'),
  '✔': svg('<path d="M5 12.500l4.500 4.500L19 7"/>'),
  '❌': svg('<circle cx="12" cy="12" r="9"/><path d="M8.500 8.500l7 7M15.500 8.500l-7 7"/>'),
  '✘': svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  '✕': svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  '🎮': svg('<path d="M7 7.500h10a4.500 4.500 0 0 1 4.400 5.400l-.9 4.100a2.200 2.200 0 0 1-3.800.9L15 16H9l-1.700 1.900a2.200 2.200 0 0 1-3.800-.9l-.9-4.100A4.500 4.500 0 0 1 7 7.500z"/><path d="M8 10.500v3M6.500 12h3M15.500 11h.01M17.500 13h.01"/>'),
  '⚙': svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.500v2.700M12 18.800v2.700M2.500 12h2.700M18.800 12h2.700M5.300 5.300l1.900 1.900M16.800 16.800l1.900 1.900M18.700 5.300l-1.900 1.900M7.200 16.800l-1.900 1.900"/><circle cx="12" cy="12" r="6.500"/>'),
  'ℹ': svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.500h.01"/>'),
  '⏻': svg('<path d="M12 3v8"/><path d="M6.800 6.500a8 8 0 1 0 10.400 0"/>'),
  '🚑': svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.500v9M7.500 12h9"/>'),
  '🔁': svg('<path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/>'),
  '⚡': solid('<path d="M13.500 2.500L5 13.500h6l-1 8 8.500-11h-6z" fill="currentColor"/>'),
  '🏋': svg('<path d="M3 9.500v5M6 7.500v9M18 7.500v9M21 9.500v5M6 12h12"/>'),
  '🔭': svg('<path d="M3 13.500l12-5.500 1.500 3.200-12 5.500z"/><path d="M16 9l3-1.500 1 2-3 1.500M10 16.500l-2 4.500M12 15.500l2 5.500"/>'),
  '🏅': svg('<circle cx="12" cy="14.500" r="5.500"/><path d="M8.500 3.500l3.500 6 3.500-6M12 12l.9 1.800 2 .3-1.450 1.400.35 2L12 16.500l-1.800.9.350-2L9.100 14.100l2-.3z"/>'),
  '🎲': svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.500 8.500h.01M15.500 8.500h.01M12 12h.01M8.500 15.500h.01M15.500 15.500h.01"/>'),
  '✎': svg('<path d="M4 20l1-4L16.500 4.500a2 2 0 0 1 3 3L8 19z"/><path d="M14.500 6.500l3 3"/>'),
  '🗑': svg('<path d="M4 6.500h16M9.500 6.500V4h5v2.500M6.500 6.500l1 13.500h9l1-13.500M10 10.500v6M14 10.500v6"/>'),
  '⏳': svg('<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>'),
  '🌧': svg('<path d="M7 15.500a4 4 0 0 1-.4-8 5.500 5.500 0 0 1 10.600 1.200A3.400 3.400 0 0 1 17 15.500z"/><path d="M8 18.500l-1 2.500M12 18.500l-1 2.500M16 18.500l-1 2.500"/>'),
  '⛈': svg('<path d="M7 14.500a4 4 0 0 1-.4-8 5.500 5.500 0 0 1 10.600 1.200A3.400 3.400 0 0 1 17 14.500z"/><path d="M12.500 14.500l-2.500 3.500h3l-2 3.500"/>'),
  '❄': svg('<path d="M12 3v18M4.500 7.500l15 9M19.500 7.500l-15 9M9.500 4.500L12 7l2.500-2.500M9.500 19.500L12 17l2.500 2.500"/>'),
  '🌫': svg('<path d="M4 8h12M7 12h13M4 16h10M8 20h9"/>'),
  '🌊': svg('<path d="M3 9c2 0 2.500 1.500 4.500 1.500S10 9 12 9s2.500 1.500 4.500 1.500S19 9 21 9M3 14c2 0 2.500 1.500 4.500 1.500S10 14 12 14s2.500 1.500 4.500 1.500S19 14 21 14M3 19c2 0 2.500 1.500 4.500 1.500S10 19 12 19s2.500 1.500 4.500 1.500S19 19 21 19"/>'),
  '🖱': svg('<rect x="6.500" y="3" width="11" height="18" rx="5.500"/><path d="M12 3v6M6.500 9h11"/>'),
  '🎥': svg('<rect x="3" y="6.500" width="12.500" height="11" rx="2.500"/><path d="M15.500 10.500l5.500-3v9l-5.500-3z"/>'),
  '⏩': solid('<path d="M3 5.500v13L12 12zM12 5.500v13L21 12z" fill="currentColor"/>'),
  '⏭': solid('<path d="M4 5.500v13L13 12zM15.500 5.500h3.500v13h-3.500z" fill="currentColor"/>'),
  '🟨': solid('<rect x="6" y="3.500" width="12" height="17" rx="2.200" fill="#facc15"/>'),
  '🟥': solid('<rect x="6" y="3.500" width="12" height="17" rx="2.200" fill="#ef4444"/>'),
  '⌨': svg('<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>'),
  '♪': svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  '⚠': svg('<path d="M12 3.500l9.500 16.500h-19z"/><path d="M12 10v4.500M12 17.500h.01"/>'),
};
const ICON_RE = new RegExp('(' + Object.keys(ICONS).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\ufe0f?', 'g');

let busy = false;
export function iconify(root = document.body) {
  if (busy) return; busy = true;
  try {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (ICON_RE.test(n.nodeValue) && !/^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = []; ICON_RE.lastIndex = 0;
    while (w.nextNode()) { nodes.push(w.currentNode); ICON_RE.lastIndex = 0; }
    for (const n of nodes) {
      ICON_RE.lastIndex = 0;
      const span = document.createElement('span'); span.className = 'ico-wrap';
      span.innerHTML = n.nodeValue.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(ICON_RE, (m, k) => ICONS[k]);
      n.parentNode.replaceChild(span, n);
    }
  } finally { busy = false; }
}

let queued = false;
export function startIcons() {
  const run = () => { queued = false; iconify(document.body); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  run();
}
