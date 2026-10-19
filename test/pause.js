const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space'); await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shots/start.png' });
  await page.evaluate(() => { const d = window.__dweller; d.teleport(900, d.state.y); });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/pause.png' });
  await page.keyboard.press('KeyN'); await page.waitForTimeout(600);
  console.log(JSON.stringify(await page.evaluate(() => ({ m: window.__dweller.mode, x: window.__dweller.state.x, cp: window.__dweller.state.cp }))), errs.join('|') || 'no errors');
  await b.close();
})();
