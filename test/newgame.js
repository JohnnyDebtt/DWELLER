const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  const st = () => page.evaluate(() => { const d = window.__dweller, s = d.state; return { m: d.mode, x: Math.round(s.x), cp: s.cp, dead: s.dead, won: s.won, deaths: s.deaths }; });
  const results = [];
  async function check(name, setup, keysHeld) {
    await page.evaluate(() => window.__dweller.start(true)); await page.waitForTimeout(200);
    await setup();
    for (const k of (keysHeld || [])) await page.keyboard.down(k);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const mid = await st();
    await page.keyboard.press('KeyN'); await page.waitForTimeout(400);
    const after = await st();
    for (const k of (keysHeld || [])) await page.keyboard.up(k);
    const ok = after.m === 'play' && after.x < 60 && after.cp === 0 && !after.won && !after.dead;
    results.push(`${ok ? 'OK ' : 'FAIL'} ${name}: mid=${mid.m} after=${JSON.stringify(after)}`);
  }
  await check('idle at start', async () => { await page.waitForTimeout(300); });
  await check('running', async () => { await page.keyboard.down('KeyD'); await page.waitForTimeout(900); await page.keyboard.up('KeyD'); });
  await check('holding right + jump', async () => {}, ['KeyD', 'Space']);
  await check('deep in level w/ checkpoint', async () => { await page.evaluate(() => { const d = window.__dweller, c = d.world.checks[8]; d.state.grace = 99999; d.teleport(c.x - 2.5, c.y - 10); }); await page.waitForTimeout(600); });
  await check('while dead', async () => { await page.evaluate(() => { const s = window.__dweller.state; s.ex = 1; s.grace = 0; }); await page.waitForTimeout(150); });
  await check('after winning', async () => { await page.evaluate(() => { const d = window.__dweller, g = d.world.goal; d.state.grace = 99999; d.teleport(g.x - 2.5, g.y - 5); }); await page.waitForTimeout(1500); });
  await check('in pit', async () => { await page.evaluate(() => { const d = window.__dweller, c = d.world.checks[5]; d.state.grace = 99999; d.teleport(c.x + 300, c.y + 400); }); await page.waitForTimeout(300); });
  console.log(results.join('\n'));
  console.log(errs.join('|') || 'no errors');
  await b.close();
})();
