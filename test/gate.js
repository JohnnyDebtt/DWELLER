const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  for (const t of [0, 300]) {
    await page.evaluate((t) => { const d = window.__dweller, s = d.state; s.grace = 99999; const c = d.world.checks[18]; d.teleport(c.x - 2.5 + 20, c.y - 10); s.t = t; }, t);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `shots/gate${t}.png` });
  }
  await b.close();
})();
