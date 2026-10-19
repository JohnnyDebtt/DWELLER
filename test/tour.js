const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const idxs = (process.argv[2] || '2,4,6,8,10,13,16,18').split(',').map(Number);
  for (const i of idxs) {
    await page.evaluate((i) => { const d = window.__dweller, c = d.world.checks[i]; const s = d.state; s.grace = 99999; d.teleport(c.x - 2.5, c.y - 10); s.vx = s.vy = 0; }, i);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `shots/cp${i}.png` });
  }
  console.log('errors', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
