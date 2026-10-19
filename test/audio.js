const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.resolve('dist/dweller.html'));
  await page.waitForFunction(() => window.__dweller);
  const secs = parseInt(process.argv[2] || '60');
  const r = await page.evaluate(async (secs) => {
    const buf = await DwellerAudio.renderTrack(secs, 32000);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let pk = 0, ss = 0; const seg = [];
    for (let i = 0; i < L.length; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > pk) pk = v; ss += L[i] * L[i]; }
    const n = Math.floor(L.length / 10);
    for (let k = 0; k < 10; k++) { let q = 0; for (let i = k * n; i < (k + 1) * n; i++) q += L[i] * L[i]; seg.push(+Math.sqrt(q / n).toFixed(4)); }
    // encode 16-bit WAV
    const len = L.length, out = new Int16Array(len * 2);
    for (let i = 0; i < len; i++) { out[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; out[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    const u8 = new Uint8Array(out.buffer); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    return { peak: pk, rms: Math.sqrt(ss / L.length), seg, rate: buf.sampleRate, len, b64: btoa(s) };
  }, secs);
  console.log('peak', r.peak.toFixed(3), 'rms', r.rms.toFixed(4), 'seg', r.seg.join(' '));
  fs.writeFileSync('build/track.pcm', Buffer.from(r.b64, 'base64')); fs.writeFileSync('build/track.meta', JSON.stringify({ rate: r.rate, len: r.len }));
  console.log('errors', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
