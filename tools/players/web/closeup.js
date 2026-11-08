const { chromium } = require('playwright');
const [out, files, clip, t, dir, y, d] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.goto(`http://localhost:8765/tools/players/web/viewer.html?files=${files}&tint=1&w=900&h=900`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  await page.evaluate(([c, t]) => play(c, +t), [clip, t]);
  await page.evaluate(([d, y, dd]) => view(d, +y, +dd), [dir, y, d]);
  await page.screenshot({ path: out });
  await browser.close();
})();
