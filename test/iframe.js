const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  fs.writeFileSync('/tmp/wrap.html', '<body style="margin:0"><iframe id="f" src="file://' + path.resolve('dist/dweller.html') + '" style="width:100vw;height:100vh;border:0"></iframe></body>');
  await page.goto('file:///tmp/wrap.html');
  const fr = page.frameLocator('#f');
  const frame = page.frames()[1];
  await frame.waitForFunction(() => window.__dweller);
  await page.mouse.click(640, 360);               // click to start (title)
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1200); await page.keyboard.up('KeyD');
  const x1 = await frame.evaluate(() => window.__dweller.state.x);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const m1 = await frame.evaluate(() => window.__dweller.mode);
  await page.keyboard.press('KeyN'); await page.waitForTimeout(500);
  const r = await frame.evaluate(() => ({ m: window.__dweller.mode, x: window.__dweller.state.x }));
  console.log('before', Math.round(x1), 'paused mode', m1, 'after N', JSON.stringify(r), errs.join('|') || 'no errors');
  await b.close();
})();
