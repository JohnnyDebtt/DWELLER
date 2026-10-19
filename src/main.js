/* DWELLER — game shell: loop, input, camera, screens. */
(function () {
  'use strict';
  const D = Dweller, R = DwellerRender, A = DwellerAudio;
  const TS = D.TS, IN = D.IN, EV = D.EV;
  const PAL = R.PAL;

  const canvas = document.getElementById('c');
  const gctx = canvas.getContext('2d', { alpha: false });
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { alpha: false });

  let world = null, S = null;           // world, player state
  let mode = 'loading';                 // loading | title | play | pause | win
  let LW = 480, LH = 270, SC = 3, DPR = 1;
  let camX = 0, camY = 0, camVX = 0;
  let simAcc = 0, lastT = 0, gameTime = 0, runTicks = 0;
  let sectionIdx = -1, cardT = 99, cardText = '';
  let shake = 0, flash = 0, deathFade = 0;
  let saved = null, bestTime = null;
  let touchMode = false, speedMul = 1, replay = null, replayI = 0;
  let stepDist = 0, beamPrev = {};
  let titleT = 0, winT = 0, err = '';

  /* ------------------------------------------------------------ storage */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function loadSave() {
    try { const j = JSON.parse(lsGet('dweller.v1') || 'null'); if (j && typeof j.cp === 'number') saved = j; } catch (e) { }
    const b = parseFloat(lsGet('dweller.best') || ''); if (b > 0) bestTime = b;
  }
  function writeSave() { lsSet('dweller.v1', JSON.stringify({ cp: S.cp, ticks: runTicks, deaths: S.deaths })); }

  /* ------------------------------------------------------------ input */
  const keys = Object.create(null);
  const touch = { L: false, R: false, J: false, D: false };
  const pad = { L: false, R: false, J: false, D: false };
  const KEYMAP = {
    ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R',
    ArrowUp: 'J', KeyW: 'J', Space: 'J', KeyZ: 'J', KeyK: 'J',
    ArrowDown: 'D', KeyS: 'D', ShiftLeft: 'D', ShiftRight: 'D', KeyX: 'D', KeyJ: 'D', ControlLeft: 'D',
  };
  function inputMask() {
    let m = 0;
    if (keys.L || touch.L || pad.L) m |= IN.L;
    if (keys.R || touch.R || pad.R) m |= IN.R;
    if (keys.J || touch.J || pad.J) m |= IN.J;
    if (keys.D || touch.D || pad.D) m |= IN.D;
    return m;
  }
  function anyAction() { audioInit(); }
  function audioInit() { try { A.Live.init(); } catch (e) { } }

  function keyCode(e) {
    if (e.code && e.code !== 'Unidentified') return e.code;
    const k = (e.key || '').toLowerCase();
    return k === 'n' ? 'KeyN' : k === 'p' ? 'KeyP' : k === 'escape' ? 'Escape' : k === ' ' ? 'Space' : k === 'enter' ? 'Enter' : k === 'm' ? 'KeyM' : k === 'r' ? 'KeyR' : k === 'f' ? 'KeyF' : '';
  }
  addEventListener('keydown', (ev) => {
    const e = { code: keyCode(ev), repeat: ev.repeat, metaKey: ev.metaKey, altKey: ev.altKey, preventDefault() { ev.preventDefault(); } };
    if (e.metaKey || e.altKey) return;
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); }
    if (e.repeat) return;
    audioInit();
    if (mode === 'title') {
      if (e.code === 'KeyN') startGame(true);
      else if (['Space', 'Enter', 'ArrowUp', 'KeyW', 'ArrowRight', 'KeyD', 'ArrowLeft', 'KeyA', 'KeyZ', 'KeyK'].includes(e.code)) startGame(false);
    } else if (mode === 'win') {
      if (e.code === 'KeyN') { startGame(true); return; }
      if (e.code === 'Escape') { mode = 'title'; titleT = 0; world && resetRun(); return; }
      if (winT > 3 && (e.code === 'Enter' || e.code === 'Space')) { mode = 'title'; titleT = 0; world && resetRun(); }
    } else if (mode === 'play') {
      if (e.code === 'Escape' || e.code === 'KeyP') setPause(true);
      if (e.code === 'KeyR' && !S.dead && !S.won) { S.ex = 1; S.grace = 0; }   // give up: let the light take you back to the tether
    } else if (mode === 'pause') {
      if (e.code === 'KeyN') { A.Live.setPaused(false); startGame(true); return; }
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Enter' || e.code === 'Space') setPause(false);
    }
    if (e.code === 'KeyM') { const m = A.Live.toggleMute(); }
    if (e.code === 'KeyF') toggleFull();
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[keyCode(e)]; if (k) { keys[k] = false; e.preventDefault(); } });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'play') setPause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') setPause(true); });

  function toggleFull() {
    try {
      if (!document.fullscreenElement) (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen || function () { }).call(document.documentElement);
      else (document.exitFullscreen || document.webkitExitFullscreen || function () { }).call(document);
    } catch (e) { }
  }

  function grabFocus() { try { window.focus(); canvas.focus({ preventScroll: true }); } catch (e) { } }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && mode === 'play') setPause(true); });
  document.addEventListener('webkitfullscreenchange', () => { if (!document.webkitFullscreenElement && mode === 'play') setPause(true); });
  addEventListener('focus', () => { /* regained: stay paused until the player resumes */ });
  function setPause(p) {
    if (p && mode === 'play') { mode = 'pause'; grabFocus(); A.Live.setPaused(true); for (const k in keys) keys[k] = false; }
    else if (!p && mode === 'pause') { mode = 'play'; A.Live.setPaused(false); lastT = performance.now(); }
  }

  /* touch controls */
  const tbtn = {};
  function buildTouchUI() {
    const root = document.getElementById('touch');
    if (!root) return;
    const mk = (id, label) => {
      const b = document.createElement('div'); b.className = 'tb'; b.id = 'tb' + id; b.textContent = label; root.appendChild(b); tbtn[id] = b;
      const set = (v, e) => { touch[id] = v; b.classList.toggle('on', v); if (e) e.preventDefault(); };
      const active = new Set();
      b.addEventListener('pointerdown', (e) => { touchMode = true; audioInit(); active.add(e.pointerId); try { b.setPointerCapture(e.pointerId); } catch (x) { } set(true, e); });
      const up = (e) => { active.delete(e.pointerId); if (!active.size) set(false, e); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    mk('L', '<'); mk('R', '>'); mk('J', 'JUMP'); mk('D', 'ROLL');
    const pb = document.createElement('div'); pb.className = 'tb small'; pb.id = 'tbP'; pb.textContent = 'II'; root.appendChild(pb);
    pb.addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); if (mode === 'play') setPause(true); else if (mode === 'pause') setPause(false); });
    addEventListener('touchstart', () => { if (!touchMode) { touchMode = true; } document.body.classList.add('touch'); }, { passive: true });
  }
  canvas.addEventListener('pointerdown', (e) => {
    audioInit(); grabFocus();
    if (e.pointerType === 'touch') { touchMode = true; document.body.classList.add('touch'); }
    if (mode === 'title') startGame(false);
    else if (mode === 'pause') {
      const r = canvas.getBoundingClientRect();
      if (e.pointerType === 'touch' && (e.clientY - r.top) / r.height > 0.68) { A.Live.setPaused(false); startGame(true); } else setPause(false);
    }
    else if (mode === 'win' && winT > 3) { mode = 'title'; titleT = 0; resetRun(); }
  });

  /* gamepad */
  function pollPad() {
    pad.L = pad.R = pad.J = pad.D = false;
    let gps; try { gps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
    for (const g of gps) {
      if (!g || !g.connected) continue;
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0, b = (i) => g.buttons[i] && g.buttons[i].pressed;
      if (ax < -0.4 || b(14)) pad.L = true;
      if (ax > 0.4 || b(15)) pad.R = true;
      if (b(0) || b(12) || b(2) || ay < -0.7) pad.J = true;
      if (b(1) || b(3) || b(13) || b(6) || b(7) || ay > 0.7) pad.D = true;
      if (b(9)) { if (!pad._start) { pad._start = true; if (mode === 'play') setPause(true); else if (mode === 'pause') setPause(false); else if (mode === 'title') startGame(false); } } else pad._start = false;
      if (mode === 'title' && (b(0))) startGame(false);
    }
  }

  /* ------------------------------------------------------------ layout */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.max(2, Math.round(innerWidth * DPR)), ch = Math.max(2, Math.round(innerHeight * DPR));
    canvas.width = cw; canvas.height = ch;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    SC = Math.max(1, Math.round(ch / 230));
    LW = Math.ceil(cw / SC) + 1; LH = Math.ceil(ch / SC) + 1;
    // never show wildly more than the designed view horizontally
    off.width = LW; off.height = LH;
    octx.imageSmoothingEnabled = false; gctx.imageSmoothingEnabled = false;
  }
  addEventListener('resize', resize);

  /* ------------------------------------------------------------ game flow */
  function resetRun() {
    S = D.newState(world); runTicks = 0; sectionIdx = -1; cardT = 99; beamPrev = {};
    R.parts.length = 0;
    snapCamera();
  }
  function startGame(fresh) {
    audioInit();
    if (fresh) { saved = null; lsSet('dweller.v1', ''); }
    S = D.newState(world); runTicks = 0; R.parts.length = 0; beamPrev = {}; deathFade = 0; flash = 0; shake = 0;
    if (saved && saved.cp > 0 && world.checks[saved.cp]) {
      const c = world.checks[saved.cp];
      S.cp = saved.cp; S.cpX = c.x; S.cpY = c.y; S.x = c.x - D.C.W / 2; S.y = c.y - D.C.H; S.grace = D.C.GRACE;
      S.deaths = saved.deaths || 0; runTicks = saved.ticks || 0;
      for (let i = 1; i <= saved.cp; i++) R.markTether(i, -99);
    }
    mode = 'play'; sectionIdx = -1; cardT = 99; snapCamera();
    A.Live.sfx('start');
    A.Live.setPaused(false);
  }
  function sectionAt(tx) {
    const ss = world.sections;
    for (let i = 0; i < ss.length; i++) if (tx >= ss[i].x0 && tx < ss[i].x1) return i;
    return ss.length - 1;
  }
  function updateSection() {
    const i = sectionAt((S.x + 2.5) / TS);
    if (i !== sectionIdx) {
      sectionIdx = i;
      const sec = world.sections[i];
      cardText = sec.title; cardT = 0;
      const m = sec.music || { e: 0.2, root: 0 };
      A.Live.setMood(m.e, m.root);
    }
  }

  /* ------------------------------------------------------------ camera */
  function camTarget() {
    const px = S.x + 2.5, py = S.y + S.h * 0.5;
    const look = Math.max(-1, Math.min(1, S.vx / 72)) * 26;
    let tx = px - LW / 2 + look;
    let ty = py - LH * 0.56 + (S.vy > 120 ? 22 : 0) + (S.wallDir ? -6 : 0);
    const maxX = world.W * TS - LW, maxY = world.H * TS - LH + 24;
    tx = Math.max(0, Math.min(Math.max(0, maxX), tx));
    ty = Math.max(-24, Math.min(Math.max(-24, maxY), ty));
    return [tx, ty];
  }
  function snapCamera() { const t = camTarget(); camX = t[0]; camY = t[1]; }
  function updateCamera(dt) {
    const t = camTarget();
    const kx = 1 - Math.exp(-dt * 5.5), ky = 1 - Math.exp(-dt * (S.vy > 80 ? 7 : 4.2));
    if (S.dead && S.deadT < 4) return;
    camX += (t[0] - camX) * kx; camY += (t[1] - camY) * ky;
    if (S.ev & EV.RESPAWN) snapCamera();
  }

  /* ------------------------------------------------------------ events -> sound & particles */
  function handleEvents(ev, st) {
    const L = A.Live;
    if (ev & EV.JUMP) { L.sfx('jump'); puff(st, 5, 0.6); }
    if (ev & EV.WJUMP) { L.sfx('wjump'); puff(st, 4, 0.7); }
    if (ev & EV.LAND) { const v = Math.min(1, st.landV / 200); L.sfx('land', { v: 0.35 + v }); puff(st, 3 + Math.round(v * 5), 0.6 + v); if (ev & EV.HARDLAND) shake = Math.max(shake, 1.2); }
    if (ev & EV.ROLL) { L.sfx('roll'); puff(st, 4, 0.8); }
    if (ev & EV.DEATH) {
      L.sfx('death'); shake = 3; flash = 1; deathFade = 1;
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * 6.283, sp = 20 + Math.random() * 70;
        R.spawn(st.deathX, st.deathY - 5, Math.cos(a) * sp, Math.sin(a) * sp - 20, 0.5 + Math.random() * 0.9, i % 3 ? PAL.gold : PAL.snow, 1, 90, false);
      }
    }
    if (ev & EV.RESPAWN) { L.sfx('respawn'); deathFade = 0; for (let i = 0; i < 18; i++) R.spawn(st.x + 2.5 + (Math.random() - 0.5) * 8, st.y + 10 - Math.random() * 10, (Math.random() - 0.5) * 12, -20 - Math.random() * 30, 0.8, PAL.cold2, 1, -10, true); }
    if (ev & EV.CHECK) {
      L.sfx('check'); R.markTether(st.cp, performance.now() / 1000);
      writeSave();
      for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, sp = 10 + Math.random() * 40; R.spawn(st.cpX, st.cpY - 12, Math.cos(a) * sp, Math.sin(a) * sp - 25, 1 + Math.random(), i % 2 ? PAL.cold2 : PAL.cold3, 1, 20, true); }
    }
    if (ev & EV.WIN) {
      L.sfx('win'); flash = 1.5; shake = 2;
      const g = world.goal;
      for (let i = 0; i < 160; i++) { const a = Math.random() * 6.283, sp = 15 + Math.random() * 90; R.spawn(g.x, g.y, Math.cos(a) * sp, Math.sin(a) * sp, 1.5 + Math.random() * 2, R.hsl(Math.random() * 360, 70, 65), 1 + (i % 4 === 0 ? 1 : 0), 14, true); }
      const t = runTicks / D.TICK;
      if (!bestTime || t < bestTime) { bestTime = t; lsSet('dweller.best', String(t)); }
      lsSet('dweller.v1', '');
    }
  }
  function puff(st, n, k) {
    const fx = st.x + 2.5, fy = st.y + st.h;
    for (let i = 0; i < n; i++) R.spawn(fx + (Math.random() - 0.5) * 5, fy - 1, (Math.random() - 0.5) * 30 * k - st.vx * 0.1, -4 - Math.random() * 12 * k, 0.35 + Math.random() * 0.3, '#9aa6b4', 1, 30, false);
  }
  let caughtPrev = {}, caughtCD = 0;
  function watcherSounds() {
    if (S.dead) { caughtPrev = {}; return; }
    caughtCD = Math.max(0, caughtCD - 4);
    const px = S.x + 2.5, py = S.y + S.h * 0.5;
    for (const l of world.lights) {
      if (l.t !== 'watch') continue;
      if (Math.abs(l.x - px) > l.r + 4 || Math.abs(l.y - py) > l.r + 4) { caughtPrev[l.id] = false; continue; }
      const on = D.lightAt(world, l, px, py) > 0.12;
      if (on && !caughtPrev[l.id] && caughtCD === 0) { A.Live.sfx('caught'); caughtCD = 48; shake = Math.max(shake, 0.6); }
      caughtPrev[l.id] = on;
    }
  }
  function beamSounds() {
    let near = null, nd = 1e9;
    const px = S.x, py = S.y;
    for (const l of world.lights) {
      if (l.t !== 'beam') continue;
      const p = beamPrev[l.id] === undefined ? l.k : beamPrev[l.id];
      if (p < 0.25 && l.k >= 0.25) {
        const d = Math.hypot(l.x - px, l.y - py);
        if (d < 200 && d < nd) { nd = d; near = l; }
      }
      beamPrev[l.id] = l.k;
    }
    if (near) A.Live.sfx('beamOn', { v: 1 - nd / 220 });
  }

  /* ------------------------------------------------------------ simulation driver */
  function simStep() {
    let inp;
    if (replay) { inp = replayI < replay.length ? replay[replayI++] : 0; }
    else inp = inputMask();
    D.step(world, S, inp);
    runTicks++;
    if (S.ev) handleEvents(S.ev, S);
    if (S.onG && !S.dead && Math.abs(S.vx) > 30 && S.st === 'run') {
      stepDist += Math.abs(S.vx) / D.TICK;
      if (stepDist > 11) { stepDist = 0; A.Live.sfx('step', { v: 1 }); if (Math.random() < 0.5) puff(S, 1, 0.4); }
    }
    if ((S.t & 7) === 0) beamSounds();
    if ((S.t & 3) === 0) watcherSounds();
    if (S.roll && (S.t & 3) === 0) puff(S, 1, 0.3);
    if (S.won) { if (mode === 'play') { mode = 'win'; winT = 0; } }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000; lastT = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;
    try {
      pollPad();
      gameTime += dt;
      titleT += dt;
      if (mode === 'play' || mode === 'win') {
        simAcc += dt * speedMul;
        let n = 0;
        const stepDt = 1 / D.TICK;
        const maxN = 12 * Math.max(1, speedMul);
        while (simAcc >= stepDt && n < maxN) { simStep(); simAcc -= stepDt; n++; }
        if (n >= maxN) simAcc = 0;
        R.tickTethers(dt);
        R.updateParticles(dt);
        updateCamera(dt);
        if (mode === 'play') updateSection();
        if (mode === 'win') winT += dt;
        cardT += dt;
        shake = Math.max(0, shake - dt * 6); flash = Math.max(0, flash - dt * 1.6);
        const fear = Math.min(1, Math.max(S.ex * 1.15, S.lit * 0.55));
        A.Live.update(S.dead ? 0.1 : fear, mode === 'win' ? 0.7 : 1);
      } else if (mode === 'pause') {
        R.updateParticles(0);
      } else if (mode === 'title') {
        A.Live.update(0.0, 1);
        R.updateParticles(dt);
      }
      render();
    } catch (e) {
      err = String(e && e.stack || e);
      console.error(e);
      showError(err);
    }
  }

  /* ------------------------------------------------------------ drawing */
  function drawBar(ctx, x, y, w, h, v, col) {
    ctx.fillStyle = 'rgba(8,8,12,0.65)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * v), h);
  }
  function fmtTime(t) { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 10) % 10); return m + ':' + (s < 10 ? '0' : '') + s + '.' + c; }

  function drawTitle(ctx) {
    // the title scene: a still world with the Seeker standing in the dark
    const t = titleT;
    ctx.fillStyle = '#07070c'; ctx.fillRect(0, 0, LW, LH);
    const cx = Math.floor(LW / 2), cy = Math.floor(LH / 2);
    // soft rainbow glow far off
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = t * 0.3 + i * 0.9;
      const gr = ctx.createRadialGradient(cx + Math.cos(a) * 30, cy + 40 + Math.sin(a) * 6, 0, cx + Math.cos(a) * 30, cy + 40, 90);
      gr.addColorStop(0, R.hsl(i * 51 + t * 20, 55, 55, 0.07)); gr.addColorStop(1, R.hsl(i * 51 + t * 20, 55, 55, 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, LW, LH);
    }
    ctx.globalCompositeOperation = 'source-over';
    const sc = Math.max(1, Math.min(3, Math.floor(LH / 90)));
    const a = Math.min(1, t / 2);
    ctx.globalAlpha = a;
    R.drawText(ctx, 'DWELLER', cx, cy - 46 * (sc / 2) - 8, PAL.snow, sc * 2, 'center');
    ctx.globalAlpha = a * 0.8;
    R.drawText(ctx, 'STAY IN THE DARK  -  REACH THE LIGHT THAT ISNT FIRE', cx, cy - 8, PAL.muted, 1, 'center');
    const blink = 0.55 + 0.45 * Math.sin(t * 3);
    ctx.globalAlpha = a * blink;
    R.drawText(ctx, touchMode ? 'TAP TO DESCEND' : (saved && saved.cp > 0 ? 'SPACE  CONTINUE FROM TETHER ' + saved.cp : 'PRESS SPACE TO DESCEND'), cx, cy + 14, PAL.gold, 1, 'center');
    ctx.globalAlpha = a * 0.6;
    if (saved && saved.cp > 0) R.drawText(ctx, 'N  NEW DESCENT', cx, cy + 26, PAL.muted, 1, 'center');
    if (!touchMode) {
      R.drawText(ctx, 'A D  MOVE     SPACE  JUMP     S  ROLL / CRAWL', cx, LH - 30, PAL.muted, 1, 'center');
      R.drawText(ctx, 'ESC  PAUSE     M  MUTE     F  FULLSCREEN', cx, LH - 20, PAL.muted, 1, 'center');
    }
    R.drawText(ctx, 'LEVEL I  THE DESCENT', cx, LH - 44 + (touchMode ? 20 : 0), PAL.stone4, 1, 'center');
    if (bestTime) R.drawText(ctx, 'BEST  ' + fmtTime(bestTime), cx, cy + 38, PAL.stone5, 1, 'center');
    ctx.globalAlpha = 1;
    // the little Seeker
    drawTitleSeeker(ctx, cx, cy + 74, t);
  }
  function drawTitleSeeker(ctx, x, y, t) {
    const sh = R.SHEETS.idle, shv = R.SHEETS.idleV;
    if (!sh) return;
    const f = Math.floor(t * 12) % (sh.cols * sh.rows);
    const sx = (f % sh.cols) * sh.w, sy = Math.floor(f / sh.cols) * sh.h;
    ctx.globalAlpha = 0.18;
    ctx.drawImage(sh.cv, sx, sy, sh.w, sh.h, x - sh.ax, y - sh.ay, sh.w, sh.h);
    ctx.globalAlpha = 1;
    ctx.drawImage(shv.cv, sx, sy, sh.w, sh.h, x - sh.ax, y - sh.ay, sh.w, sh.h);
  }

  function render() {
    const ctx = octx;
    ctx.imageSmoothingEnabled = false;
    let ox = 0, oy = 0;
    if (mode === 'loading') {
      ctx.fillStyle = '#07070c'; ctx.fillRect(0, 0, LW, LH);
      R.drawText(ctx, 'DWELLER', LW >> 1, (LH >> 1) - 8, PAL.muted, 2, 'center');
    } else if (mode === 'title') {
      drawTitle(ctx);
    } else {
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 1.2 : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake * 1.2 : 0;
      const cxp = camX + sx, cyp = camY + sy;
      const fx = Math.floor(cxp), fy = Math.floor(cyp);
      ox = (cxp - fx) * SC; oy = (cyp - fy) * SC;
      R.drawScene(ctx, { w: world, s: S, time: gameTime }, fx, fy, LW, LH);
      drawHUD(ctx);
    }
    // blit
    gctx.imageSmoothingEnabled = false;
    gctx.fillStyle = '#000'; gctx.fillRect(0, 0, canvas.width, canvas.height);
    gctx.drawImage(off, 0, 0, LW, LH, Math.round(-ox), Math.round(-oy), LW * SC, LH * SC);
  }

  function drawHUD(ctx) {
    const S_ = S;
    // exposure vignette & bar
    if (S_.ex > 0.02 && !S_.dead) {
      const e = Math.min(1, S_.ex);
      const gr = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.35, LW / 2, LH / 2, LH * 0.95);
      gr.addColorStop(0, 'rgba(230,240,255,0)'); gr.addColorStop(1, 'rgba(230,240,255,' + (0.5 * e * e).toFixed(3) + ')');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, LW, LH);
    }
    if (flash > 0) { ctx.globalAlpha = Math.min(1, flash) * 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, LW, LH); ctx.globalAlpha = 1; }
    if (S_.dead) {
      const k = Math.min(1, S_.deadT / 60) * (S_.deadT > D.C.DEADT - 30 ? Math.max(0, (D.C.DEADT - S_.deadT) / 30) : 1);
      ctx.globalAlpha = k * 0.85; ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, LW, LH); ctx.globalAlpha = 1;
      if (S_.deadT > 20) { ctx.globalAlpha = Math.min(1, (S_.deadT - 20) / 20) * k; R.drawText(ctx, S_.why === 'void' ? 'THE DARK TOOK YOU' : 'THE LIGHT FOUND YOU', LW >> 1, (LH >> 1) - 4, PAL.muted, 1, 'center'); ctx.globalAlpha = 1; }
    }
    // exposure bar above player
    if (S_.ex > 0.04 && !S_.dead) {
      const px = Math.round(S_.x + 2.5 - camX), py = Math.round(S_.y - 7 - camY);
      drawBar(ctx, px - 8, py, 16, 2, Math.min(1, S_.ex), S_.ex > 0.7 ? '#e8e0d0' : '#a9c4d2');
    }
    // section card
    if (cardT < 4.5 && mode !== 'win') {
      const a = Math.min(1, cardT / 0.8) * Math.min(1, (4.5 - cardT) / 1.0);
      ctx.globalAlpha = a * 0.9;
      R.drawText(ctx, cardText, LW >> 1, Math.round(LH * 0.22), PAL.snow, 2, 'center');
      ctx.globalAlpha = 1;
    }
    // small timer (top right) while playing
    if (mode === 'play') {
      ctx.globalAlpha = 0.5;
      R.drawText(ctx, fmtTime(runTicks / D.TICK), LW - 6, Math.round(44 / SC), PAL.muted, 1, 'right');
      ctx.globalAlpha = 1;
    }
    if (mode === 'pause') {
      ctx.fillStyle = 'rgba(5,5,10,0.7)'; ctx.fillRect(0, 0, LW, LH);
      R.drawText(ctx, 'PAUSED', LW >> 1, (LH >> 1) - 22, PAL.snow, 2, 'center');
      R.drawText(ctx, touchMode ? 'TAP TO RESUME' : 'ESC  RESUME', LW >> 1, (LH >> 1) + 2, PAL.gold, 1, 'center');
      R.drawText(ctx, touchMode ? 'TAP LOWER SCREEN  NEW DESCENT' : 'N  NEW DESCENT', LW >> 1, (LH >> 1) + 44, PAL.snow, 1, 'center');
      R.drawText(ctx, 'TIME  ' + fmtTime(runTicks / D.TICK) + '    DEATHS  ' + S_.deaths, LW >> 1, (LH >> 1) + 16, PAL.muted, 1, 'center');
      R.drawText(ctx, 'M  MUTE   F  FULLSCREEN   R  RETURN TO TETHER', LW >> 1, (LH >> 1) + 30, PAL.stone4, 1, 'center');
    }
    if (mode === 'win') {
      const a = Math.min(1, Math.max(0, (winT - 1.2) / 1.5));
      ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, LW, LH); ctx.globalAlpha = a;
      R.drawText(ctx, 'THE CRYSTAL', LW >> 1, Math.round(LH * 0.2), PAL.snow, 2, 'center');
      R.drawText(ctx, 'LEVEL I  THE DESCENT  COMPLETE', LW >> 1, Math.round(LH * 0.2) + 22, PAL.gold, 1, 'center');
      const t = runTicks / D.TICK;
      R.drawText(ctx, 'TIME  ' + fmtTime(t) + '     LIGHT FOUND YOU  ' + S_.deaths + ' TIMES', LW >> 1, Math.round(LH * 0.2) + 38, PAL.snow, 1, 'center');
      if (bestTime) R.drawText(ctx, 'BEST  ' + fmtTime(bestTime), LW >> 1, Math.round(LH * 0.2) + 50, PAL.muted, 1, 'center');
      if (winT > 3) { ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(winT * 3)); R.drawText(ctx, touchMode ? 'TAP FOR TITLE' : 'ENTER  TITLE     N  NEW DESCENT', LW >> 1, Math.round(LH * 0.2) + 68, PAL.gold, 1, 'center'); }
      ctx.globalAlpha = 1;
    }
  }

  function showError(msg) {
    const el = document.getElementById('err');
    if (el) { el.style.display = 'block'; el.textContent = 'Dweller hit a snag:\n' + msg.slice(0, 600) + '\n\nTry reloading the page.'; }
  }

  /* ------------------------------------------------------------ boot */
  async function boot() {
    resize();
    canvas.tabIndex = 0; canvas.style.outline = 'none'; grabFocus();
    buildTouchUI();
    loadSave();
    const q = new URLSearchParams(location.search);
    try {
      await R.load(window.DWELLER_ASSETS);
      world = D.makeWorld(window.DWELLER_LEVEL);
      R.prepare(world);
      S = D.newState(world); snapCamera();
    } catch (e) { showError(String(e && e.stack || e)); console.error(e); return; }
    const ld = document.getElementById('loading'); if (ld) ld.remove();
    mode = 'title'; titleT = 0;
    if (q.get('speed')) speedMul = Math.max(1, Math.min(32, parseFloat(q.get('speed')) || 1));
    lastT = performance.now();
    requestAnimationFrame(frame);
    // debug / test hooks
    window.__dweller = {
      get state() { return S; }, get world() { return world; }, get mode() { return mode; },
      start(fresh) { startGame(!!fresh); },
      replay(inputs, speed) { replay = inputs; replayI = 0; speedMul = speed || 1; },
      setSpeed(v) { speedMul = v; },
      teleport(x, y) { S.x = x; S.y = y; snapCamera(); },
      shot() { return canvas.toDataURL('image/png'); },
      get ticks() { return runTicks; },
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
