const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  for (const [n, tx] of [['a', 66], ['b', 118]]) {
    await page.evaluate((tx) => { const d = window.__dweller, s = d.state; s.grace = 99999; d.teleport(tx * 6, s.y); s.vx = 0; }, tx);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `shots/hint_${n}.png` });
  }
  await b.close();
})();
