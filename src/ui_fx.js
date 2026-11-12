// Menu depth: pointer-driven 3D tilt and glare on buttons, cards and team tiles.
const TILT = '.btn.nav, .opt, .teamcard, .card, .tile';
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function startFx() {
  if (reduce) return;
  let cur = null;
  const reset = (el) => { if (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.style.removeProperty('--mx'); el.style.removeProperty('--my'); el.classList.remove('tilting'); } };
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest(TILT);
    if (cur && cur !== el) { reset(cur); cur = null; }
    if (!el) return;
    cur = el;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const max = Math.min(8, 2.5 + 900 / Math.max(r.width, 120)); // wide cards tilt less
    el.style.setProperty('--ry', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
    el.style.setProperty('--rx', ((0.5 - py) * 2 * max * 0.6).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    el.classList.add('tilting');
  }, { passive: true });
  document.addEventListener('pointerleave', () => { reset(cur); cur = null; }, true);
}
