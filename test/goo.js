const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  const ks = await page.evaluate(() => window.__dweller.world.kills);
  for (const i of [1,2]) {
    const k = ks[i];
    await page.evaluate(([x,y]) => { const d = window.__dweller, s = d.state; s.grace = 99999; d.teleport(x, y); }, [(k[0]+k[2])/2, k[1]-60]);
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__dweller.state.vy = 0; });
    await page.screenshot({ path: `shots/goo${i}.png` });
  }
  console.log(JSON.stringify(ks), errs);
  await b.close();
})();
