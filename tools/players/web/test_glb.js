// node test_glb.js <outdir> <files> [shots]
const { chromium } = require('playwright');
const [outdir, files, shots] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await page.goto(`http://localhost:8765/tools/players/web/viewer.html?files=${files}&tint=1`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const info = await page.evaluate(() => window.__info);
  // play every clip at several times
  for (const m of info.models) {
    for (const c of m.clips) {
      for (const f of [0, 0.25, 0.5, 0.75, 1.0]) {
        await page.evaluate(([n, t]) => play(n, t), [c.name, c.duration * f]);
      }
    }
  }
  const info2 = await page.evaluate(() => window.__info);
  console.log(JSON.stringify({ info: info2, errs }, null, 1));
  if (shots) {
    for (const s of shots.split(';')) {
      const [clip, t, dir, name] = s.split(':');
      await page.evaluate(([c, t]) => play(c, +t), [clip, t]);
      await page.evaluate(([d]) => view(d, 1.0, 7), [dir]);
      await page.screenshot({ path: `${outdir}/${name}.png` });
    }
  }
  await browser.close();
})();
