const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  await page.evaluate(() => { const d = window.__dweller, s = d.state, w = d.world; s.grace = 99999;
    const l = w.lights.filter(l => l.t === 'watch')[0];
    s.t = 0; d.teleport(l.x - 2.5, l.y + 21.5 * 6 - 10); window.__eye = l.id; d.setSpeed(0.0005); Dweller.updateLights(w, 0); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/eye.png' });
  console.log(await page.evaluate(() => { const d = window.__dweller; const l = d.world.lights[window.__eye]; return JSON.stringify({ ex: d.state.ex, lit: d.state.lit, ang: l.ang, x: l.x, y: l.y, px: d.state.x, py: d.state.y }); }), errs.join('|') || 'no errors');
  await b.close();
})();
