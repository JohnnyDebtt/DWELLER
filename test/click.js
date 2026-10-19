const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1500); await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => window.__dweller.state.x);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.mouse.click(640, 600); await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ m: window.__dweller.mode, x: window.__dweller.state.x }));
  console.log('before', Math.round(x1), 'after click', JSON.stringify(r));
  await b.close();
})();
