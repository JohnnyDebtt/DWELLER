const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const sol = JSON.parse(fs.readFileSync('build/solution.json'));
  console.log('solution ticks', sol.length);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  await page.keyboard.press('Space');
  await page.evaluate((sol) => { window.__dweller.start(true); window.__dweller.replay(sol, 8); }, sol);
  let last = 0;
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => { const d = window.__dweller, s = d.state; return { m: d.mode, t: d.ticks, x: Math.round(s.x / 6), dead: s.deaths, won: s.won }; });
    if (i % 5 === 0) console.log(JSON.stringify(r));
    if (r.m === 'win' || r.won) { console.log('WON', JSON.stringify(r)); await page.waitForTimeout(3500); await page.screenshot({ path: 'shots/win.png' }); break; }
    if (r.t === last && i > 3) { console.log('stalled', JSON.stringify(r)); break; }
    last = r.t;
  }
  console.log('errors', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
