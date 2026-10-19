/* DWELLER — renderer. Draws at a low logical resolution (pixel art), the caller scales it up by whole numbers.
 * Art direction (The Seeker): low saturation, no outlines, one focal point, depth by layering,
 * drawn fully lit and then darkened by a post-process light pass.
 */
(function (global) {
  'use strict';
  const D = global.Dweller;
  const TS = D.TS;
  const smooth = D.smooth;

  /* ------------------------------------------------------------------ palette (The Seeker) */
  const PAL = {
    void: '#0F0E16', stone0: '#181C20', stone1: '#20242A', stone2: '#353E50', stone3: '#4F5D73', stone4: '#667389',
    stone5: '#94A6B1', gold: '#B9A87B', snow: '#EDF0F1', ice: '#C4CED4',
    cold0: '#698F9B', cold1: '#7BACBC', cold2: '#91CBDE', cold3: '#D6EDF5',
    ui: '#F0F2E8', muted: '#8A919E',
  };

  /* ------------------------------------------------------------------ font (5x7) */
  const G = {};
  function def(ch, rows) { G[ch] = rows.split('/'); }
  def('A', '.###./#...#/#...#/#####/#...#/#...#/#...#'); def('B', '####./#...#/#...#/####./#...#/#...#/####.');
  def('C', '.####/#..../#..../#..../#..../#..../.####'); def('D', '####./#...#/#...#/#...#/#...#/#...#/####.');
  def('E', '#####/#..../#..../####./#..../#..../#####'); def('F', '#####/#..../#..../####./#..../#..../#....');
  def('G', '.####/#..../#..../#..##/#...#/#...#/.####'); def('H', '#...#/#...#/#...#/#####/#...#/#...#/#...#');
  def('I', '.###./..#../..#../..#../..#../..#../.###.'); def('J', '..###/...#./...#./...#./...#./#..#./.##..');
  def('K', '#...#/#..#./#.#../##.../#.#../#..#./#...#'); def('L', '#..../#..../#..../#..../#..../#..../#####');
  def('M', '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#'); def('N', '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#');
  def('O', '.###./#...#/#...#/#...#/#...#/#...#/.###.'); def('P', '####./#...#/#...#/####./#..../#..../#....');
  def('Q', '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#'); def('R', '####./#...#/#...#/####./#.#../#..#./#...#');
  def('S', '.####/#..../#..../.###./....#/....#/####.'); def('T', '#####/..#../..#../..#../..#../..#../..#..');
  def('U', '#...#/#...#/#...#/#...#/#...#/#...#/.###.'); def('V', '#...#/#...#/#...#/#...#/#...#/.#.#./..#..');
  def('W', '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#'); def('X', '#...#/#...#/.#.#./..#../.#.#./#...#/#...#');
  def('Y', '#...#/#...#/.#.#./..#../..#../..#../..#..'); def('Z', '#####/....#/...#./..#../.#.../#..../#####');
  def('0', '.###./#...#/#..##/#.#.#/##..#/#...#/.###.'); def('1', '..#../.##../..#../..#../..#../..#../.###.');
  def('2', '.###./#...#/....#/...#./..#../.#.../#####'); def('3', '####./....#/....#/.###./....#/....#/####.');
  def('4', '...#./..##./.#.#./#..#./#####/...#./...#.'); def('5', '#####/#..../####./....#/....#/#...#/.###.');
  def('6', '.###./#..../#..../####./#...#/#...#/.###.'); def('7', '#####/....#/...#./..#../.#.../.#.../.#...');
  def('8', '.###./#...#/#...#/.###./#...#/#...#/.###.'); def('9', '.###./#...#/#...#/.####/....#/....#/.###.');
  def('.', '...../...../...../...../...../.##../.##..'); def(',', '...../...../...../...../.##../..#../.#...');
  def(':', '...../.##../.##../...../.##../.##../.....'); def('!', '..#../..#../..#../..#../..#../...../..#..');
  def('?', '.###./#...#/....#/...#./..#../...../..#..'); def('-', '...../...../...../.###./...../...../.....');
  def('+', '...../..#../..#../#####/..#../..#../.....'); def('/', '....#/....#/...#./..#../.#.../#..../#....');
  def("'", '..#../..#../.#.../...../...../...../.....'); def('(', '...#./..#../.#.../.#.../.#.../..#../...#.');
  def(')', '.#.../..#../...#./...#./...#./..#../.#...'); def('=', '...../...../#####/...../#####/...../.....');
  def('%', '##..#/##..#/...#./..#../.#.../#..##/#..##'); def('_', '...../...../...../...../...../...../#####');
  def('*', '...../#.#.#/.###./#####/.###./#.#.#/.....'); def('<', '...../..#../.#.../#####/.#.../..#../.....');
  def('>', '...../..#../...#./#####/...#./..#../.....'); def('^', '..#../.###./#.#.#/..#../..#../..#../.....');
  def('~', '...../..#../..#../..#../#.#.#/.###./..#..'); def(' ', '...../...../...../...../...../...../.....');
  const textCache = new Map();
  function textSprite(text, color) {
    const key = color + '|' + text;
    let c = textCache.get(key);
    if (c) return c;
    let w = 0;
    for (const ch of text) w += ch === ' ' ? 4 : 6;
    w = Math.max(1, w - 1);
    c = document.createElement('canvas'); c.width = w; c.height = 7;
    const x = c.getContext('2d'); x.fillStyle = color;
    let px = 0;
    for (const ch of text) {
      const g = G[ch] || G[ch.toUpperCase()] || G['?'];
      if (ch !== ' ') for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r][q] === '#') x.fillRect(px + q, r, 1, 1);
      px += ch === ' ' ? 4 : 6;
    }
    if (textCache.size > 400) textCache.clear();
    textCache.set(key, c);
    return c;
  }
  function textWidth(text) { let w = 0; for (const ch of text) w += ch === ' ' ? 4 : 6; return Math.max(0, w - 1); }
  function drawText(ctx, text, x, y, color, scale, align) {
    const sp = textSprite(text, color || '#fff');
    scale = scale || 1;
    let dx = x;
    if (align === 'center') dx = x - Math.floor(sp.width * scale / 2);
    else if (align === 'right') dx = x - sp.width * scale;
    ctx.drawImage(sp, Math.round(dx), Math.round(y), sp.width * scale, sp.height * scale);
  }

  /* ------------------------------------------------------------------ assets */
  const IMG = {};
  const SHEETS = {};
  function loadImage(src) {
    return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('image failed')); i.src = src; });
  }
  function canvasOf(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); return c;
  }
  function remap(canvas, map) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext('2d'); x.drawImage(canvas, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
      const m = map[k];
      if (m) { d[i] = m[0]; d[i + 1] = m[1]; d[i + 2] = m[2]; }
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function coldTint(canvas) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext('2d'); x.drawImage(canvas, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    const lo = [26, 48, 62], mid = [110, 165, 186], hi = [232, 246, 252];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const l = Math.min(1, (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 235);
      const u = l < 0.5 ? l * 2 : (l - 0.5) * 2, a = l < 0.5 ? lo : mid, b = l < 0.5 ? mid : hi;
      d[i] = a[0] + (b[0] - a[0]) * u; d[i + 1] = a[1] + (b[1] - a[1]) * u; d[i + 2] = a[2] + (b[2] - a[2]) * u;
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function whiteOnly(canvas) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext('2d'); x.drawImage(canvas, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0 || Math.min(d[i], d[i + 1], d[i + 2]) < 232) d[i + 3] = 0;
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function sheet(name, canvas, cols, rows, w, h, ax, ay) {
    const s = { cv: canvas, cols, rows, w, h, ax, ay, n: cols * rows };
    SHEETS[name] = s; return s;
  }
  function drawFrame(ctx, sh, idx, x, y, flip, alpha) {
    idx = Math.max(0, Math.min(sh.n - 1, idx | 0));
    const sx = (idx % sh.cols) * sh.w, sy = Math.floor(idx / sh.cols) * sh.h;
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    if (flip) {
      ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1);
      ctx.drawImage(sh.cv, sx, sy, sh.w, sh.h, -sh.ax, Math.round(y) - sh.ay, sh.w, sh.h);
      ctx.restore();
    } else {
      ctx.drawImage(sh.cv, sx, sy, sh.w, sh.h, Math.round(x) - sh.ax, Math.round(y) - sh.ay, sh.w, sh.h);
    }
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = 1;
  }

  async function load(assets) {
    const names = Object.keys(assets);
    const imgs = await Promise.all(names.map(n => loadImage(assets[n])));
    names.forEach((n, i) => { IMG[n] = canvasOf(imgs[i]); });
    const P = (n, c, r, w, h, ax, ay) => sheet(n, IMG[n], c, r, w, h, ax, ay);
    P('idle', 12, 2, 96, 96, 48, 54); P('run', 10, 1, 48, 48, 24, 30); P('jump', 12, 1, 48, 48, 24, 30);
    P('fall', 6, 2, 48, 48, 24, 30); P('roll', 4, 1, 48, 48, 24, 30); P('wall', 3, 1, 96, 96, 47, 54);
    P('death', 7, 1, 48, 48, 24, 30);
    for (const k of ['idle', 'run', 'jump', 'fall', 'roll', 'wall', 'death']) {
      const s = SHEETS[k];
      sheet(k + 'V', whiteOnly(s.cv), s.cols, s.rows, s.w, s.h, s.ax, s.ay);
    }
    // Tether (checkpoint), watcher eye + roots, orb
    P('tether', 24, 1, 48, 48, 24, 47);
    P('voidBody', 1, 1, 48, 48, 24, 24);
    const cold = {
      '182,193,33': [145, 203, 222], '225,255,146': [214, 237, 245], '55,87,53': [48, 78, 92],
      '159,185,115': [123, 172, 188], '94,136,91': [105, 143, 155],
    };
    sheet('orb', coldTint(IMG.orb), 8, 1, 48, 48, 24, 24);
    // eye: sprite without its pupil (we paint the pupil ourselves so it can look along the beam)
    const eye = document.createElement('canvas'); eye.width = 48; eye.height = 48;
    { const x = eye.getContext('2d'); x.drawImage(IMG.voidFace, 0, 0);
      const id = x.getImageData(0, 0, 48, 48), d = id.data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 200) { d[i] = d[i + 1] = d[i + 2] = 6; }
      x.putImageData(id, 0, 0); }
    sheet('eye', eye, 1, 1, 48, 48, 24, 24);
    buildTiles();
  }

  /* ------------------------------------------------------------------ terrain autotiler (MainTileset) */
  const T = {};
  let tileCv = null;
  function buildTiles() { tileCv = IMG.tiles; }
  function tile(ctx, col, row, x, y) { ctx.drawImage(tileCv, col * 6, row * 6, 6, 6, x, y, 6, 6); }
  const INTERIOR = [[8, 8], [10, 8], [12, 8], [14, 8], [7, 9], [9, 9], [11, 9], [13, 9], [8, 10], [10, 10], [12, 10], [14, 10], [7, 11], [9, 11], [11, 11], [13, 11]];

  function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  function drawTerrainTile(ctx, w, tx, ty, px, py) {
    const S = (x, y) => D.solidAt(w, x, y);
    if (!S(tx, ty)) return;
    const n = !S(tx, ty - 1), s = !S(tx, ty + 1), e = !S(tx + 1, ty), wv = !S(tx - 1, ty);
    const r = hash2(tx, ty);
    const k = n + s + e + wv;
    if (k === 0) {
      tile(ctx, 2 + (r < 0.5 ? 0 : 1), 5, px, py);
      if (r > 0.45) { const q = INTERIOR[Math.floor(hash2(ty, tx) * INTERIOR.length)]; tile(ctx, q[0], q[1], px, py); }
      // inner corners
      const ne = !S(tx + 1, ty - 1), nw = !S(tx - 1, ty - 1), se = !S(tx + 1, ty + 1), sw = !S(tx - 1, ty + 1);
      if (se) ctx.drawImage(tileCv, 6 * 6, 4 * 6, 3, 3, px + 3, py + 3, 3, 3);
      if (sw) ctx.drawImage(tileCv, 8 * 6 + 3, 4 * 6, 3, 3, px, py + 3, 3, 3);
      if (ne) ctx.drawImage(tileCv, 6 * 6, 6 * 6 + 3, 3, 3, px + 3, py, 3, 3);
      if (nw) ctx.drawImage(tileCv, 8 * 6 + 3, 6 * 6 + 3, 3, 3, px, py, 3, 3);
      return;
    }
    if (k === 1) {
      if (n) tile(ctx, 2 + (r < 0.5 ? 0 : 1), 4, px, py);
      else if (s) tile(ctx, 2 + (r < 0.5 ? 0 : 1), 6, px, py);
      else if (wv) tile(ctx, 1, 5, px, py);
      else tile(ctx, 4, 5, px, py);
      return;
    }
    if (k === 2) {
      if (n && wv) tile(ctx, 1, 4, px, py);
      else if (n && e) tile(ctx, 4, 4, px, py);
      else if (s && wv) tile(ctx, 1, 6, px, py);
      else if (s && e) tile(ctx, 4, 6, px, py);
      else if (n && s) tile(ctx, r < 0.5 ? 2 : 4, 10, px, py);        // thin horizontal slab
      else tile(ctx, 3, r < 0.5 ? 9 : 11, px, py);                  // thin vertical column
      return;
    }
    if (k === 3) {
      if (!e) tile(ctx, 5, 10, px, py);            // open to the east only... (right cap)
      else if (!wv) tile(ctx, 1, 10, px, py);      // left cap
      else if (!s) tile(ctx, 3, 12, px, py);       // bottom cap
      else tile(ctx, 3, 8, px, py);                // top cap
      return;
    }
    tile(ctx, 14, 4, px, py);
  }

  const CH = 32;       // chunk size in tiles
  const chunks = new Map();
  function chunkCanvas(w, cx, cy) {
    const key = cx + ',' + cy;
    let c = chunks.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = CH * TS; c.height = CH * TS;
    const x = c.getContext('2d');
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) drawTerrainTile(x, w, cx * CH + i, cy * CH + j, i * TS, j * TS);
    chunks.set(key, c);
    return c;
  }

  /* ------------------------------------------------------------------ level dressing */
  let decor = null, bgLayers = null;

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function buildDecor(w) {
    const r = rng(4802);
    const list = { hang: [], floor: [], glow: [], vines: [] };
    const S = (x, y) => D.solidAt(w, x, y);
    for (let x = 2; x < w.W - 2; x++) {
      for (let y = 4; y < w.H - 4; y++) {
        if (!S(x, y) && S(x, y - 1) && r() < 0.16) {                          // stalactite under rock
          let free = 0; while (!S(x, y + free + 1) && free < 6) free++;
          const len = Math.min(free, 1 + Math.floor(r() * 3));
          if (len > 0) list.hang.push({ x, y, len, v: r() });
        }
        if (!S(x, y) && S(x, y + 1) && !S(x, y - 1) && r() < 0.045) {         // frost tufts on floors
          list.floor.push({ x, y, k: Math.floor(r() * 6), v: r() });
        }
      }
    }
    // luminous roots on floors (tiny cyan sparks, purely decorative)
    for (const f of list.floor) if (f.v > 0.82) list.glow.push({ x: f.x * TS + 3, y: f.y * TS + 5 });
    return list;
  }

  function makeBgLayer(seed, wpx, hpx, kind) {
    const c = document.createElement('canvas'); c.width = wpx; c.height = hpx;
    const x = c.getContext('2d'); const r = rng(seed);
    if (kind === 0) {                 // far: soft rock arches, stars of dust
      for (let i = 0; i < 9; i++) {
        const cx = (i + 0.5) * wpx / 9 + (r() - 0.5) * 30, rw = 34 + r() * 40, top = hpx * (0.15 + r() * 0.25);
        x.fillStyle = r() < 0.5 ? '#2e3849' : '#2b3545';
        x.beginPath(); x.moveTo(cx - rw, hpx);
        for (let k = 0; k <= 16; k++) { const t = k / 16; const px = cx - rw + t * rw * 2; const py = top + (1 - Math.sin(t * Math.PI)) * (hpx - top) * 0.9; x.lineTo(px, py + r() * 6); }
        x.lineTo(cx + rw, hpx); x.closePath(); x.fill();
      }
    } else if (kind === 1) {          // mid: hanging spires and risers
      x.fillStyle = '#242c3a';
      for (let i = 0; i < 24; i++) {
        const px = Math.floor(r() * wpx), len = 20 + r() * 80, wd = 5 + r() * 12;
        x.beginPath(); x.moveTo(px - wd, 0); x.lineTo(px + wd, 0); x.lineTo(px + (r() - 0.5) * 3, len); x.closePath(); x.fill();
        const px2 = Math.floor(r() * wpx), len2 = 10 + r() * 50, wd2 = 6 + r() * 12;
        x.beginPath(); x.moveTo(px2 - wd2, hpx); x.lineTo(px2 + wd2, hpx); x.lineTo(px2 + (r() - 0.5) * 3, hpx - len2); x.closePath(); x.fill();
      }
    } else {                           // near: roots and columns
      x.fillStyle = '#1a202b';
      for (let i = 0; i < 10; i++) {
        const px = Math.floor(r() * wpx), wd = 3 + r() * 5;
        x.fillRect(px, 0, wd, hpx * (0.3 + r() * 0.6));
        x.fillRect(px + 1, hpx - 20 - r() * 70, wd - 1, 100);
      }
    }
    // dither the silhouettes edge a little
    return c;
  }

  function prepare(w) {
    decor = buildDecor(w);
    bgLayers = [makeBgLayer(11, 512, 300, 0), makeBgLayer(23, 512, 300, 1), makeBgLayer(37, 512, 300, 2)];
    chunks.clear();
  }

  /* ------------------------------------------------------------------ light mask */
  let lc = null, lctx = null, lw = 0, lh = 0, ldata = null, odata = null, ocv = null, octx = null, oimg = null, o32 = null;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const STOPS = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12; STOPS.push([u, 1 - smooth(0.30, 1, u)]); }

  function ensureLight(W, H) {
    if (lw === W && lh === H) return;
    lw = W; lh = H;
    lc = document.createElement('canvas'); lc.width = W; lc.height = H;
    lctx = lc.getContext('2d', { willReadFrequently: true });
    ocv = document.createElement('canvas'); ocv.width = W; ocv.height = H;
    octx = ocv.getContext('2d');
    oimg = octx.createImageData(W, H); o32 = new Uint32Array(oimg.data.buffer);
  }

  function visPoly(w, ox, oy, r, a0, a1, n) {
    const pts = [];
    const step = (a1 - a0) / n;
    for (let i = 0; i <= n; i++) {
      const a = a0 + step * i, dx = Math.cos(a), dy = Math.sin(a);
      const d = D.castRay(w, ox, oy, dx, dy, r);
      pts.push(ox + dx * (d + 0.6), oy + dy * (d + 0.6));
    }
    return pts;
  }

  function radialGrad(ctx, x, y, r, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (let i = 0; i < STOPS.length; i++) g.addColorStop(STOPS[i][0], 'rgba(255,255,255,' + (STOPS[i][1] * alpha).toFixed(3) + ')');
    return g;
  }

  function fillPoly(ctx, pts, camX, camY, closeToOrigin, ox, oy) {
    ctx.beginPath();
    if (closeToOrigin) ctx.moveTo(ox - camX, oy - camY);
    for (let i = 0; i < pts.length; i += 2) { if (i === 0 && !closeToOrigin) ctx.moveTo(pts[i] - camX, pts[i + 1] - camY); else ctx.lineTo(pts[i] - camX, pts[i + 1] - camY); }
    ctx.closePath(); ctx.fill();
  }

  function drawHazardLight(ctx, w, l, camX, camY, W, H) {
    const rr = l.reach;
    if (l.x + rr < camX || l.x - rr > camX + W || l.y + rr < camY || l.y - rr > camY + H) return;
    const a = l.I * l.k;
    if (a < 0.004) return;
    if (l.t === 'beam') {
      // per-column rays along the beam direction, drawn as a soft rectangle
      const cols = Math.max(4, Math.ceil(l.w / 1.5));
      const hw = l.w / 2;
      const pts = [];
      const far = [];
      for (let i = 0; i <= cols; i++) {
        const v = -hw + (i / cols) * l.w;
        const sx = l.x + l.nx * v, sy = l.y + l.ny * v;
        const d = D.castRay(w, sx, sy, l.dx, l.dy, l.len);
        pts.push(sx, sy); far.push(sx + l.dx * (d + 0.5), sy + l.dy * (d + 0.5));
      }
      for (let layer = 0; layer < 3; layer++) {
        const shrink = [1, 0.84, 0.62][layer], al = [0.34, 0.33, 0.33][layer] * a;
        const poly = [];
        const lo = Math.round((1 - shrink) / 2 * cols), hi = cols - lo;
        for (let i = lo; i <= hi; i++) poly.push(pts[i * 2], pts[i * 2 + 1]);
        for (let i = hi; i >= lo; i--) poly.push(far[i * 2], far[i * 2 + 1]);
        const g = ctx.createLinearGradient(l.x - camX, l.y - camY, l.x + l.dx * l.len - camX, l.y + l.dy * l.len - camY);
        g.addColorStop(0, 'rgba(255,255,255,' + al.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,' + (al * 0.55).toFixed(3) + ')');
        ctx.fillStyle = g; fillPoly(ctx, poly, camX, camY, false);
      }
      return;
    }
    if (l.t === 'watch') {
      const n = Math.max(24, Math.round(l.half * 2 * l.r / 5));
      const layers = [[1.0, 0.30], [0.82, 0.34], [0.62, 0.36]];
      for (const [f, al] of layers) {
        const pts = visPoly(w, l.x, l.y, l.r, l.ang - l.half * f, l.ang + l.half * f, n);
        ctx.fillStyle = radialGrad(ctx, l.x - camX, l.y - camY, l.r, al * a);
        fillPoly(ctx, pts, camX, camY, true, l.x, l.y);
      }
      return;
    }
    // lamp / orb
    let pts = l._poly;
    if (!pts || l.move) {
      const n = Math.max(40, Math.min(220, Math.round(l.r * 2.4)));
      pts = visPoly(w, l.x, l.y, l.r, 0, Math.PI * 2, n);
      if (!l.move) l._poly = pts;
    }
    ctx.fillStyle = radialGrad(ctx, l.x - camX, l.y - camY, l.r, a);
    fillPoly(ctx, pts, camX, camY, false);
  }

  function softDisc(ctx, x, y, r, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  /* The darkness pass: builds the light mask, dithers it to a few bands, composites a dark overlay. */
  const AMBIENT = 0.34, STEPS = 9;
  function lightPass(ctx, Gm, camX, camY, W, H) {
    const w = Gm.w, s = Gm.s;
    ensureLight(W, H);
    lctx.globalCompositeOperation = 'source-over'; lctx.fillStyle = '#000'; lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'lighter';
    const lights = w.lights;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.hazard) drawHazardLight(lctx, w, l, camX, camY, W, H);
    }
    // gentle lifts: the Dweller sees a little in the dark; tethers and the crystal glow without hurting
    const px = s.x + 2.5, py = s.y + s.h * 0.5;
    softDisc(lctx, px - camX, py - camY, 26, 0.30);
    for (const c of w.checks) {
      if (c.x < camX - 30 || c.x > camX + W + 30) continue;
      softDisc(lctx, c.x - camX, c.y - 12 - camY, c.i <= s.cp ? 30 : 14, c.i <= s.cp ? 0.42 : 0.16);
    }
    const g = w.goal;
    if (g.x > camX - 140 && g.x < camX + W + 140) softDisc(lctx, g.x - camX, g.y - camY, 120, 0.85);
    for (const l of lights) if (!l.hazard && l.col !== 'rainbow') { if (l.x > camX - l.r && l.x < camX + W + l.r) softDisc(lctx, l.x - camX, l.y - camY, l.r, 0.5 * l.k); }
    // quantize
    const id = lctx.getImageData(0, 0, W, H); const d = id.data;
    const dark = (0xFF << 24) | (16 << 16) | (8 << 8) | 5;      // ABGR: r=5 g=8 b=16
    let o = 0;
    for (let y = 0; y < H; y++) {
      const by = (y & 3) * 4;
      for (let x = 0; x < W; x++, o++) {
        const i = o * 4;
        let L = d[i]; if (d[i + 1] > L) L = d[i + 1]; if (d[i + 2] > L) L = d[i + 2];
        let q = Math.floor(L / 255 * STEPS + (BAYER[by + (x & 3)] + 0.5) / 16) / STEPS;
        if (q > 1) q = 1;
        const a = 1 - (AMBIENT + (1 - AMBIENT) * q);
        o32[o] = ((a * 250) << 24) | 0x100A05 | 0; // alpha + (b=0x10,g=0x0A,r=0x05)
      }
    }
    octx.putImageData(oimg, 0, 0);
    ctx.drawImage(ocv, 0, 0);
  }

  /* ------------------------------------------------------------------ sprites in the world */
  function playerFrame(s) {
    const a = s.anim;
    switch (s.st) {
      case 'idle': return ['idle', Math.floor(a / 8) % 24];
      case 'run': return ['run', a < 8 ? 0 : 1 + Math.floor((a - 8) / 8) % 9];
      case 'jump': { const v = s.vy; return ['jump', v < -105 ? 0 : v < -70 ? 1 : v < -35 ? 2 : v < -12 ? 3 : 4]; }
      case 'fall': {
        if (s.airT < 54 && s.vy < 90) return ['jump', 5 + Math.min(3, Math.floor(s.anim / 7))];
        return ['fall', 6 + Math.floor(s.anim / 8) % 6];
      }
      case 'roll': return ['roll', Math.floor(s.anim / 8) % 4];
      case 'wall': return ['wall', Math.floor(s.anim / 10) % 3];
      case 'death': return ['death', Math.min(6, Math.floor(s.anim / 8))];
    }
    return ['idle', 0];
  }

  function drawPlayer(ctx, s, camX, camY, pass, flash) {
    const [name, idx] = playerFrame(s);
    const sh = SHEETS[pass === 'visor' ? name + 'V' : name];
    const fx = Math.round(s.x + 2.5 - camX), fy = Math.round(s.y + s.h - camY);
    const flip = s.st === 'wall' ? s.wdir < 0 : s.face < 0;
    drawFrame(ctx, sh, idx, fx, fy, flip);
    if (pass === 'body' && flash > 0.02) {
      // white-hot flash while burning: draw the sprite again as a white silhouette
      ctx.globalAlpha = Math.min(0.85, flash);
      ctx.globalCompositeOperation = 'lighter';
      drawFrame(ctx, SHEETS[name], idx, fx, fy, flip);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }

  function drawTether(ctx, c, s, camX, camY, time) {
    const sh = SHEETS.tether;
    const active = c.i <= s.cp;
    let idx;
    if (!active) idx = 0 + Math.floor(time * 3) % 2 * 0;
    else {
      const t = (Gm_timeSince(c.i) || 99);
      idx = t < 6 * 0.083 * 3 ? 2 + Math.floor(t / (0.083 * 3)) : 8 + Math.floor(time * 12) % 16;
    }
    drawFrame(ctx, sh, idx, Math.round(c.x - camX), Math.round(c.y - camY), false);
  }
  let tetherT = {};
  function Gm_timeSince(i) { return tetherT[i]; }
  function markTether(i, time) { tetherT[i] = 0; tetherT['_' + i] = time; }
  function tickTethers(dt) { for (const k in tetherT) if (k[0] !== '_') tetherT[k] += dt; }

  function drawLampCrystal(ctx, w, l, camX, camY, time, post) {
    const x = Math.round(l.x - camX), y = Math.round(l.y - camY);
    const k = Math.max(0.15, l.k);
    if (!post) {
      // vine from the ceiling
      let top = 0; const tx = Math.floor(l.x / TS), ty = Math.floor(l.y / TS);
      while (top < 16 && !D.solidAt(w, tx, ty - top - 1)) top++;
      if (top > 0 && top < 16) {
        ctx.fillStyle = '#10131a'; ctx.fillRect(x, y - top * TS, 1, top * TS - 2);
        ctx.fillStyle = '#1c2230'; ctx.fillRect(x + 1, y - top * TS, 1, Math.max(0, top * TS - 6));
      }
      return;
    }
    // crystal body (drawn after the dark pass: it is the light)
    const f = 0.75 + 0.25 * k;
    ctx.fillStyle = '#3c5d6b'; ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = PAL.cold1; ctx.fillRect(x - 1, y - 3, 3, 6);
    ctx.fillStyle = PAL.cold2; ctx.fillRect(x - 1, y - 2, 2, 4);
    ctx.globalAlpha = f; ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 2, 1, 2); ctx.globalAlpha = 1;
  }

  function drawOrb(ctx, l, camX, camY, time) {
    const x = Math.round(l.x - camX), y = Math.round(l.y - camY);
    drawFrame(ctx, SHEETS.orb, Math.floor(time * 12 + l.id) % 8, x, y + 24, false);
  }

  function drawWatcher(ctx, l, camX, camY, time, post, caught, S) {
    const x = Math.round(l.x - camX), y = Math.round(l.y - camY);
    if (!post) {
      drawFrame(ctx, SHEETS.voidBody, 0, x, y, false);
      return;
    }
    const sh = SHEETS.eye;
    drawFrame(ctx, sh, 0, x, y, false);
    // the pupil follows the beam; when the beam finds the Seeker it snaps onto them and burns
    let ang = l.ang, hot = 0;
    if (caught > 0 && S) { ang = Math.atan2(S.y + S.h * 0.5 - l.y, S.x + 2.5 - l.x); hot = Math.min(1, caught); }
    const px = x + Math.round(Math.cos(ang) * 3), py = y + Math.round(Math.sin(ang) * 3);
    if (hot > 0) {
      const pulse = 0.75 + 0.25 * Math.sin(time * 40);
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(px, py, 0, px, py, 14);
      gr.addColorStop(0, 'rgba(255,235,200,' + (0.75 * hot * pulse).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = gr; ctx.fillRect(px - 14, py - 14, 28, 28);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff'; ctx.fillRect(px - 2, py - 2, 5, 5);
      ctx.fillStyle = '#ffe6bd'; ctx.fillRect(px - 1, py - 1, 3, 3);
      return;
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, py - 1, 3, 3);
    ctx.globalAlpha = 0.6; ctx.fillStyle = PAL.cold3; ctx.fillRect(px - 2, py - 1, 5, 3); ctx.globalAlpha = 1;
  }

  function drawBeamEmitter(ctx, l, camX, camY, time) {
    const k = l.k;
    const cx = l.x - camX, cy = l.y - camY;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    // slit glows according to gain
    const a = 0.25 + 0.75 * Math.min(1, k * 4);
    ctx.globalAlpha = a;
    ctx.fillStyle = k > 0.5 ? '#fff' : PAL.cold1;
    if (Math.abs(l.dx) < 0.5) ctx.fillRect(-Math.round(l.w / 2), -1, Math.round(l.w), 2);
    else ctx.fillRect(-1, -Math.round(l.w / 2), 2, Math.round(l.w));
    ctx.restore(); ctx.globalAlpha = 1;
  }

  /* The prismatic crystal: faceted, each facet drifting through the spectrum. */
  function hsl(h, s, l, a) { return 'hsla(' + Math.round(h % 360) + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')'; }
  function drawCrystal(ctx, g, camX, camY, time, burst) {
    const x = Math.round(g.x - camX), y = Math.round(g.y - camY) + Math.round(Math.sin(time * 2.1) * 1.5);
    const pts = [[0, -11], [5, -3], [4, 7], [0, 10], [-4, 7], [-5, -3]];
    const facets = [[0, 1, 3], [0, 3, 5], [0, 5, 4], [1, 2, 3], [3, 4, 5], [4, 5, 0]];
    const base = time * 60;
    const sc = burst ? 1 + burst * 0.6 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    const tri = [[[0, -11], [5, -3], [0, 1]], [[0, -11], [0, 1], [-5, -3]], [[5, -3], [4, 7], [0, 1]], [[-5, -3], [0, 1], [-4, 7]], [[0, 1], [4, 7], [0, 10]], [[0, 1], [0, 10], [-4, 7]]];
    tri.forEach((t, i) => {
      ctx.fillStyle = hsl(base + i * 58, 60, 62 + (i % 2) * 12);
      ctx.beginPath(); ctx.moveTo(Math.round(t[0][0]), Math.round(t[0][1])); ctx.lineTo(Math.round(t[1][0]), Math.round(t[1][1])); ctx.lineTo(Math.round(t[2][0]), Math.round(t[2][1])); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-2, -8, 1, 3); ctx.fillRect(1, -5, 1, 1);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ particles */
  const parts = [];
  function spawn(x, y, vx, vy, life, col, size, grav, add) { if (parts.length < 600) parts.push({ x, y, vx, vy, life, max: life, col, size: size || 1, grav: grav || 0, add: !!add }); }
  function updateParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  function drawParticles(ctx, camX, camY) {
    for (const p of parts) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = a; ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ the whole scene */
  function drawBackground(ctx, w, camX, camY, W, H, time) {
    // depth tint: cold at the top, violet-teal in the deep
    const depth = Math.max(0, Math.min(1, (camY + H / 2) / (w.H * TS)));
    const top = [38, 48, 66], bot = [40, 38, 66];
    const r = Math.round(top[0] + (bot[0] - top[0]) * depth), g = Math.round(top[1] + (bot[1] - top[1]) * depth), b = Math.round(top[2] + (bot[2] - top[2]) * depth);
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'; ctx.fillRect(0, 0, W, H);
    const par = [0.12, 0.28, 0.5];
    for (let i = 0; i < 3; i++) {
      const L = bgLayers[i];
      const ox = -((camX * par[i]) % 512 + 512) % 512;
      const oy = Math.round(-(camY * par[i]) % 400) + (i === 0 ? 20 : i === 1 ? 0 : -10);
      for (let rx = ox - 512; rx < W; rx += 512) {
        if (rx + 512 < 0) continue;
        for (let ry = oy - 300; ry < H; ry += 300) { if (ry + 300 < 0) continue; ctx.drawImage(L, Math.round(rx), Math.round(ry)); }
      }
    }
  }

  function drawTerrain(ctx, w, camX, camY, W, H) {
    const cx0 = Math.floor(camX / (CH * TS)), cx1 = Math.floor((camX + W) / (CH * TS));
    const cy0 = Math.floor(camY / (CH * TS)), cy1 = Math.floor((camY + H) / (CH * TS));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0) continue;
      ctx.drawImage(chunkCanvas(w, cx, cy), cx * CH * TS - camX, cy * CH * TS - camY);
    }
  }

  function drawDecorBack(ctx, w, camX, camY, W, H, time) {
    const x0 = Math.floor(camX / TS) - 2, x1 = Math.floor((camX + W) / TS) + 2;
    // frost tufts: use pale ice-prop frames from the tileset-free procedural shapes
    for (const f of decor.floor) {
      if (f.x < x0 || f.x > x1) continue;
      const px = f.x * TS - camX, py = (f.y + 1) * TS - camY;
      if (py < -10 || py > H + 10) continue;
      const sway = Math.round(Math.sin(time * 1.3 + f.x) * 0.0);
      ctx.fillStyle = '#4a566b';
      ctx.fillRect(px + 2 + sway, py - 2, 1, 2); ctx.fillRect(px + 1, py - 1, 1, 1); ctx.fillRect(px + 3, py - 3, 1, 3);
      ctx.fillStyle = '#7d8da3'; ctx.fillRect(px + 3, py - 3, 1, 1); ctx.fillRect(px + 2, py - 2, 1, 1);
    }
    for (const gl of decor.glow) {
      if (gl.x < x0 * TS || gl.x > x1 * TS) continue;
      ctx.fillStyle = '#3b6f7e'; ctx.fillRect(Math.round(gl.x - camX), Math.round(gl.y - camY), 1, 1);
    }
  }

  function drawDecorFront(ctx, w, camX, camY, W, H, time) {
    const x0 = Math.floor(camX / TS) - 2, x1 = Math.floor((camX + W) / TS) + 2;
    for (const h of decor.hang) {
      if (h.x < x0 || h.x > x1) continue;
      const px = h.x * TS - camX, py = h.y * TS - camY;
      if (py < -30 || py > H + 30) continue;
      const len = h.len * TS - 2;
      ctx.fillStyle = PAL.stone1;
      ctx.fillRect(px + 1, py, 4, 1);
      for (let i = 1; i < len; i++) { const wd = Math.max(1, Math.round(4 * (1 - i / len))); ctx.fillRect(px + 3 - (wd >> 1), py + i, wd, 1); }
      ctx.fillStyle = PAL.stone3; ctx.fillRect(px + 1, py, 1, Math.max(1, len - 3));
    }
  }

  function drawHints(ctx, w, camX, camY, W, H, Gm) {
    for (const h of w.hints) {
      if (h.x < camX - 200 || h.x > camX + W + 200) continue;
      const near = Math.abs((Gm.s.x) - h.x) < 120;
      ctx.globalAlpha = near ? 0.95 : 0.5;
      drawText(ctx, h.text, Math.round(h.x - camX), Math.round(h.y - camY), '#c9d3e0', 1, 'left');
    }
    ctx.globalAlpha = 1;
  }

  // black tar that fills every killing pit: slow swells, a glossy rim and bubbles that rise and pop
  function drawGoo(ctx, w, camX, camY, W, H, time, post) {
    for (const k of w.kills) {
      const x0 = Math.max(Math.floor(k[0] - camX), 0), x1 = Math.min(Math.ceil(k[2] - camX), W);
      if (x1 <= x0) continue;
      const top = k[1] - camY;
      if (top > H + 4 || top < -400) continue;
      const bot = H + 2;
      for (let x = x0; x < x1; x++) {
        const wx = x + camX;
        const sw = Math.sin(wx * 0.21 + time * 1.6) * 1.1 + Math.sin(wx * 0.07 - time * 1.1) * 1.4;
        const y = Math.round(top + sw);
        if (post) {
          // faint wet sheen on the swells, drawn above the dark pass so the tar reads as liquid
          const a = Math.max(0, sw - 0.2) * 0.22 + (Math.sin(wx * 0.5 + time * 3) > 0.92 ? 0.25 : 0);
          if (a > 0.04) { ctx.globalAlpha = Math.min(a, 0.55); ctx.fillStyle = '#6f6f96'; ctx.fillRect(x, y, 1, 1); ctx.globalAlpha = 1; }
          continue;
        }
        ctx.fillStyle = '#040408'; ctx.fillRect(x, y, 1, bot - y);
        ctx.fillStyle = '#0c0b14'; ctx.fillRect(x, y, 1, 1);
        const dr = Math.sin(wx * 0.13 + time * 0.7) + Math.sin(wx * 0.31 - time * 0.4);
        if (dr > 1.55) { ctx.fillStyle = '#0a0a12'; ctx.fillRect(x, y + 2, 1, 3); }
      }
      if (post) continue;
      // bubbles
      const n = Math.ceil((k[2] - k[0]) / 40);
      for (let i = 0; i < n; i++) {
        const per = 2.2 + hash2(i, 7) * 2.5, ph = (time / per + hash2(i, 3)) % 1;
        const bx = Math.round(k[0] + (i + hash2(i, 11)) * (k[2] - k[0]) / n - camX);
        if (bx < x0 || bx >= x1) continue;
        const by = Math.round(top + 6 - ph * 8);
        if (ph < 0.8) {
          const r = ph < 0.4 ? 1 : 2;
          ctx.fillStyle = '#14141f'; ctx.fillRect(bx - r, by - r, r * 2 + 1, r * 2 + 1);
          ctx.fillStyle = '#3a3a52'; ctx.fillRect(bx - r + 1, by - r, 1, 1);
        } else {
          ctx.fillStyle = '#2a2a3c'; ctx.fillRect(bx - 2, Math.round(top) - 1, 1, 1); ctx.fillRect(bx + 2, Math.round(top) - 1, 1, 1);
        }
      }
    }
  }

  function drawScene(ctx, Gm, camX, camY, W, H) {
    const w = Gm.w, s = Gm.s, time = Gm.time;
    drawBackground(ctx, w, camX, camY, W, H, time);
    drawDecorBack(ctx, w, camX, camY, W, H, time);
    // objects behind the player
    for (const l of w.lights) {
      if (l.x < camX - 60 || l.x > camX + W + 60 || l.y < camY - 60 || l.y > camY + H + 60) continue;
      if (l.t === 'watch') drawWatcher(ctx, l, camX, camY, time, false);
      else if (l.t === 'lamp' && l.col !== 'rainbow') drawLampCrystal(ctx, w, l, camX, camY, time, false);
    }
    for (const c of w.checks) if (c.x > camX - 30 && c.x < camX + W + 30) drawTether(ctx, c, s, camX, camY, time);
    drawGoo(ctx, w, camX, camY, W, H, time);
    drawTerrain(ctx, w, camX, camY, W, H);
    drawDecorFront(ctx, w, camX, camY, W, H, time);
    if (!s.won || s.wonT < 30) drawPlayer(ctx, s, camX, camY, 'body', s.burn > 0.02 && !s.dead ? 0.15 + s.burn * 0.6 : 0);
    drawParticles(ctx, camX, camY);
    lightPass(ctx, Gm, camX, camY, W, H);
    drawGoo(ctx, w, camX, camY, W, H, time, true);
    // hints live in the dark ceiling rock, drawn above the dark pass so they stay readable
    drawHints(ctx, w, camX, camY, W, H, Gm);
    // emissive things, drawn after the dark
    for (const l of w.lights) {
      if (l.x < camX - 60 || l.x > camX + W + 60 || l.y < camY - 60 || l.y > camY + H + 60) continue;
      if (l.t === 'orb') drawOrb(ctx, l, camX, camY, time);
      else if (l.t === 'watch') drawWatcher(ctx, l, camX, camY, time, true, s.dead ? 0 : D.lightAt(w, l, s.x + 2.5, s.y + s.h * 0.5) * 3, s);
      else if (l.t === 'lamp' && l.col !== 'rainbow') drawLampCrystal(ctx, w, l, camX, camY, time, true);
      else if (l.t === 'beam') drawBeamEmitter(ctx, l, camX, camY, time);
    }
    if (!s.dead && !(s.won && s.wonT > 30)) {
      // only the visor stays visible in shadow
      const vis = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 5.0));
      ctx.globalAlpha = s.ex > 0.05 ? Math.min(1, vis + s.ex) : vis;
      drawPlayer(ctx, s, camX, camY, 'visor', 0);
      ctx.globalAlpha = 1;
    }
    // coloured glow over the lit scene
    ctx.globalCompositeOperation = 'lighter';
    for (const l of w.lights) {
      if (l.x < camX - l.reach || l.x > camX + W + l.reach || l.y < camY - l.reach || l.y > camY + H + l.reach) continue;
      if (l.t === 'lamp' || l.t === 'orb') {
        if (l.k < 0.02) continue;
        const gr = ctx.createRadialGradient(l.x - camX, l.y - camY, 0, l.x - camX, l.y - camY, l.r * 0.5);
        gr.addColorStop(0, 'rgba(120,190,220,' + (0.16 * l.k * l.I).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(120,190,220,0)');
        ctx.fillStyle = gr; ctx.fillRect(l.x - l.r * 0.5 - camX, l.y - l.r * 0.5 - camY, l.r, l.r);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // the crystal and its rainbow
    const g = w.goal;
    if (g.x > camX - 150 && g.x < camX + W + 150) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const a = time * 0.6 + i * (Math.PI * 2 / 7);
        const gr = ctx.createRadialGradient(g.x - camX, g.y - camY, 0, g.x - camX + Math.cos(a) * 22, g.y - camY + Math.sin(a) * 14, 70);
        gr.addColorStop(0, hsl(i * 51 + time * 40, 70, 60, 0.20)); gr.addColorStop(1, hsl(i * 51 + time * 40, 70, 60, 0));
        ctx.fillStyle = gr; ctx.fillRect(g.x - camX - 90, g.y - camY - 90, 180, 180);
      }
      ctx.globalCompositeOperation = 'source-over';
      drawCrystal(ctx, g, camX, camY, time, s.won ? Math.min(1, s.wonT / 60) : 0);
    }
  }

  global.DwellerRender = {
    PAL, load, prepare, drawScene, drawText, textWidth, textSprite, spawn, updateParticles, markTether, tickTethers,
    SHEETS, IMG, parts, hsl, hash2,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
