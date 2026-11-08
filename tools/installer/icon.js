const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 256, height: 256 } });
  await p.setContent(`<body style="margin:0;background:transparent"><svg width="256" height="256" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f2a1c"/><stop offset="1" stop-color="#04120b"/></linearGradient></defs>
  <rect x="8" y="8" width="240" height="240" rx="52" fill="url(#g)" stroke="#6ee7a8" stroke-width="6"/>
  <circle cx="128" cy="128" r="78" fill="#fff"/>
  <polygon points="128,84 160,107 148,145 108,145 96,107" fill="#111"/>
  <g stroke="#111" stroke-width="5" fill="none"><path d="M128 84 V52 M160 107 L190 96 M148 145 L168 172 M108 145 L88 172 M96 107 L66 96"/></g>
  <path d="M60 218 H196" stroke="#6ee7a8" stroke-width="8" stroke-linecap="round"/></svg></body>`);
  await p.screenshot({ path: 'icon256.png', omitBackground: true }); await b.close();
})();
