/* DWELLER — simulation core. Pure logic, no DOM: runs in the browser and in Node (for the test bot).
 *
 * Resonance with The Seeker: the simulation ticks at 96 Hz, animation steps at 12 fps (8 ticks),
 * the tempo is 90 BPM (one beat = 64 ticks), tiles are 6 px and the Seeker is two tiles tall.
 * Every light that pulses does so on whole beats. Running speed is exactly 8 tiles per beat.
 */
(function (global) {
  'use strict';

  const TS = 6;                 // tile size in px
  const TICK = 96;              // simulation Hz
  const DT = 1 / TICK;
  const BEAT = 64;              // ticks per beat at 90 BPM
  const IN = { L: 1, R: 2, J: 4, D: 8 };
  const EV = { JUMP: 1, LAND: 2, ROLL: 4, WJUMP: 8, DEATH: 16, RESPAWN: 32, CHECK: 64, WIN: 128, HARDLAND: 256 };

  const C = {
    W: 5, H: 10, HR: 5,                      // hitbox: standing 5x10, rolling 5x5
    RUN: 72, CRAWL: 46,
    GACC: 1100, GFRIC: 1500, AACC: 760, AFRIC: 420,
    JUMPV: 150, GU: 540, GD: 650, CUT: 2.7, MAXFALL: 215, APEXV: 26, APEXG: 0.62,
    COYOTE: 9, BUFFER: 10,
    WSLIDE: 34, WJX: 86, WJY: 144, WLOCK: 11, WCOY: 7,
    ROLLV: 108, ROLLT: 33, ROLLCD: 20,
    BURN: 0.95, REGEN: 0.9, DEADT: 104, GRACE: 64,
    LITLO: 0.10, LITHI: 0.50,
  };

  const EPS = 1e-4;

  function smooth(e0, e1, x) {
    let t = (x - e0) / (e1 - e0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  /* ------------------------------------------------------------------ world */

  function decodeRows(level) {
    const W = level.w, H = level.h;
    const solid = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const runs = level.rows[y];
      let x = 0, v = 0;           // runs alternate: air, rock, air, rock...
      for (let i = 0; i < runs.length; i++) {
        const n = runs[i];
        if (v) solid.fill(1, y * W + x, y * W + x + n);
        x += n; v ^= 1;
      }
    }
    return solid;
  }

  function makeWorld(level) {
    const w = {
      W: level.w, H: level.h,
      solid: decodeRows(level),
      killY: level.h * TS + 40,
      lights: [], hazards: [],
      checks: level.checks.map(c => ({ x: c.x, y: c.y, i: c.i })),
      goal: level.goal, spawn: level.spawn, kills: level.kills || [],
      sections: level.sections, hints: level.hints, level,
    };
    level.lights.forEach((d, i) => {
      const l = Object.assign({ id: i, hazard: true, I: 1, k: 1 }, d);
      l.bx = l.x; l.by = l.y;            // anchor
      if (l.t === 'beam') {
        const a = l.ang === undefined ? Math.PI / 2 : l.ang;
        l.ang = a; l.dx = Math.cos(a); l.dy = Math.sin(a); l.nx = -l.dy; l.ny = l.dx;
        l.reach = l.len + l.w;
      } else if (l.t === 'watch') {
        l.reach = l.r;
      } else {
        l.reach = l.r + (l.move ? Math.max(Math.abs(l.move.rx || l.move.dx || 0), Math.abs(l.move.ry || l.move.dy || 0)) + 2 : 0);
      }
      w.lights.push(l);
      if (l.hazard) w.hazards.push(l);
    });
    updateLights(w, 0);
    return w;
  }

  function solidAt(w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w.W) return true;
    if (ty >= w.H) return false;      // below the map is open void
    return w.solid[ty * w.W + tx] === 1;
  }

  function rectSolid(w, x, y, ww, hh) {
    const x0 = Math.floor(x / TS), x1 = Math.floor((x + ww - EPS) / TS);
    const y0 = Math.floor(y / TS), y1 = Math.floor((y + hh - EPS) / TS);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (solidAt(w, tx, ty)) return true;
    return false;
  }

  /* Distance along a ray to the first solid tile (Amanatides & Woo). maxD in px. */
  function castRay(w, ox, oy, dx, dy, maxD) {
    let tx = Math.floor(ox / TS), ty = Math.floor(oy / TS);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const tdx = adx < 1e-9 ? 1e30 : TS / adx, tdy = ady < 1e-9 ? 1e30 : TS / ady;
    let tmx = adx < 1e-9 ? 1e30 : ((dx > 0 ? (tx + 1) * TS - ox : ox - tx * TS) / adx);
    let tmy = ady < 1e-9 ? 1e30 : ((dy > 0 ? (ty + 1) * TS - oy : oy - ty * TS) / ady);
    let t = 0;
    for (let i = 0; i < 400; i++) {
      if (tmx < tmy) { t = tmx; tmx += tdx; tx += sx; } else { t = tmy; tmy += tdy; ty += sy; }
      if (t >= maxD) return maxD;
      if (solidAt(w, tx, ty)) return t;
    }
    return maxD;
  }

  function rayClear(w, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.5) return true;
    return castRay(w, x0, y0, dx / d, dy / d, d) >= d - 0.01;
  }

  /* -------------------------------------------------------------- lights */

  const RISE = 8, FALL = 14;

  function schedGain(s, t) {
    if (!s) return 1;
    const per = s.per, tau = ((t + (s.ph || 0)) % per + per) % per;
    const warn = s.warn === undefined ? 48 : s.warn;
    if (tau < s.len) {
      let k = 1;
      if (tau < RISE) k = smooth(0, RISE, tau);
      else if (tau > s.len - FALL) k = 1 - smooth(s.len - FALL, s.len, tau);
      return k;
    }
    if (warn > 0 && tau >= per - warn) {
      const q = tau - (per - warn);      // gentle flicker that is visible but harmless
      return 0.07 + 0.045 * Math.sin(q * 0.55) * Math.sin(q * 0.23 + 1);
    }
    return 0;
  }

  function updateLights(w, t) {
    const lights = w.lights;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      l.k = schedGain(l.sched, t);
      const m = l.move;
      if (m) {
        const ph = (t / m.per + (m.ph || 0)) * Math.PI * 2;
        if (m.k === 'ellipse') {
          l.x = l.bx + m.rx * Math.cos(ph); l.y = l.by + m.ry * Math.sin(ph);
        } else { // 'line': ping-pong with ease
          const s = 0.5 - 0.5 * Math.cos(ph);
          l.x = l.bx + m.dx * s; l.y = l.by + m.dy * s;
        }
      }
      if (l.t === 'watch') {
        const ph = (t / l.per + (l.ph || 0)) * Math.PI * 2;
        l.ang = l.spin ? l.base + ph : l.base + l.amp * Math.sin(ph);
      }
    }
  }

  /* Light intensity at a point, 0..1, occlusion included. */
  function lightAt(w, l, px, py) {
    if (l.k <= 0.001) return 0;
    if (l.t === 'beam') {
      const rx = px - l.x, ry = py - l.y;
      const s = rx * l.dx + ry * l.dy, v = rx * l.nx + ry * l.ny;
      const hw = l.w / 2;
      if (s < 0 || s > l.len || v < -hw || v > hw) return 0;
      const sx = l.x + l.nx * v, sy = l.y + l.ny * v;
      if (!rayClear(w, sx, sy, px, py)) return 0;
      const lat = 1 - smooth(0.78, 1.0, Math.abs(v) / hw);
      return l.I * l.k * lat * (1 - 0.4 * (s / l.len));
    }
    const dx = px - l.x, dy = py - l.y, d2 = dx * dx + dy * dy;
    if (d2 > l.r * l.r) return 0;
    const d = Math.sqrt(d2);
    let f = 1 - smooth(0.30 * l.r, l.r, d);
    if (l.t === 'watch') {
      let da = Math.atan2(dy, dx) - l.ang;
      da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (da > l.half) return 0;
      f *= 1 - smooth(0.62 * l.half, l.half, da);
      f *= 1 - 0.0 * d;
    }
    if (f <= 0.001) return 0;
    if (!rayClear(w, l.x, l.y, px, py)) return 0;
    return l.I * l.k * f;
  }

  const SAMPLE_STAND = [[0, -3.6], [0, 0], [0, 3.6], [-2, -1.5], [2, -1.5], [-2, 2], [2, 2]];
  const SAMPLE_LOW = [[0, 0], [-1.8, 0], [1.8, 0]];

  function playerLit(w, s) {
    const cx = s.x + C.W / 2, cy = s.y + s.h / 2;
    const pts = s.h > C.HR + 0.1 ? SAMPLE_STAND : SAMPLE_LOW;
    let sum = 0, bn = 0, bd = 0;
    const hz = w.hazards;
    for (let k = 0; k < pts.length; k++) {
      const px = cx + pts[k][0], py = cy + pts[k][1];
      let best = 0, bl = null;
      for (let i = 0; i < hz.length; i++) {
        const l = hz[i];
        const rr = l.reach;
        if (px < l.x - rr || px > l.x + rr || py < l.y - rr || py > l.y + rr) continue;
        const v = lightAt(w, l, px, py);
        if (v > best) { best = v; bl = l; }
      }
      sum += best;
      if (bl) { bn += best * (bl.burnMul || 1); bd += best; }
    }
    w.lastBM = bd > 0 ? bn / bd : 1;
    return sum / pts.length;
  }

  /* ------------------------------------------------------------- state */

  function newState(w) {
    const sp = w.spawn;
    return {
      t: 0, ticks: 0,
      x: sp.x - C.W / 2, y: sp.y - C.H, h: C.H, vx: 0, vy: 0,
      onG: false, face: 1, coy: 0, buf: 0, wallDir: 0, wcoy: 0, wlock: 0, wdir: 0,
      roll: 0, rollDir: 1, rollCD: 0, crawl: false, prev: 0,
      ex: 0, lit: 0, deadT: 0, dead: false, grace: C.GRACE, deathX: 0, deathY: 0,
      cp: -1, cpX: sp.x, cpY: sp.y,
      won: false, wonT: 0, deaths: 0, ev: 0, anim: 0, st: 'idle', airT: 0, landV: 0, why: '',
    };
  }

  function cloneState(s) { return Object.assign({}, s); }

  function canStand(w, s) { return !rectSolid(w, s.x, s.y + s.h - C.H, C.W, C.H); }

  function setH(s, h) { s.y += s.h - h; s.h = h; }

  function moveX(w, s, dx) {
    if (dx === 0) return false;
    s.x += dx;
    if (!rectSolid(w, s.x, s.y, C.W, s.h)) return false;
    // auto step-up for one-tile lips when grounded
    if (s.onG && s.vy >= 0) {
      for (let up = 1; up <= TS; up++) {
        if (!rectSolid(w, s.x, s.y - up, C.W, s.h)) { s.y -= up; return false; }
      }
    }
    if (dx > 0) s.x = Math.floor((s.x + C.W) / TS) * TS - C.W;
    else s.x = (Math.floor(s.x / TS) + 1) * TS;
    return true;
  }

  function moveY(w, s, dy) {
    if (dy === 0) return 0;
    s.y += dy;
    if (!rectSolid(w, s.x, s.y, C.W, s.h)) return 0;
    if (dy < 0) {
      // corner correction: slide round a ledge by up to 3px
      for (let n = 1; n <= 3; n++) {
        if (!rectSolid(w, s.x + n, s.y, C.W, s.h)) { s.x += n; return 0; }
        if (!rectSolid(w, s.x - n, s.y, C.W, s.h)) { s.x -= n; return 0; }
      }
      s.y = (Math.floor(s.y / TS) + 1) * TS;
      return -1;
    }
    s.y = Math.floor((s.y + s.h) / TS) * TS - s.h;
    return 1;
  }

  function killPlayer(s, why) {
    if (s.dead) return;
    s.dead = true; s.deadT = 0; s.vx = 0; s.vy = 0; s.why = why;
    s.deaths++; s.ev |= EV.DEATH; s.deathX = s.x + C.W / 2; s.deathY = s.y + s.h;
    s.st = 'death'; s.anim = 0; s.roll = 0; s.crawl = false;
  }

  function respawn(s) {
    s.x = s.cpX - C.W / 2; s.h = C.H; s.y = s.cpY - C.H;
    s.vx = s.vy = 0; s.dead = false; s.ex = 0; s.lit = 0; s.grace = C.GRACE;
    s.roll = 0; s.crawl = false; s.rollCD = 0; s.wlock = 0; s.coy = 0; s.buf = 0;
    s.st = 'idle'; s.anim = 0; s.ev |= EV.RESPAWN;
  }

  /* One simulation tick. inp is a bitmask of IN flags. Returns the state (mutated). */
  function step(w, s, inp) {
    s.ev = 0;
    if (s.won) { s.wonT++; s.t++; s.prev = inp; updateLights(w, s.t); return s; }
    s.t++; s.ticks++;
    updateLights(w, s.t);

    if (s.dead) {
      s.deadT++; s.anim++;
      if (s.deadT >= C.DEADT) respawn(s);
      s.prev = inp;
      return s;
    }

    const prev = s.prev;
    const dirIn = ((inp & IN.R) ? 1 : 0) - ((inp & IN.L) ? 1 : 0);
    const jumpPress = (inp & IN.J) && !(prev & IN.J);
    const jumpHeld = !!(inp & IN.J);
    const downPress = (inp & IN.D) && !(prev & IN.D);

    if (jumpPress) s.buf = C.BUFFER; else if (s.buf > 0) s.buf--;
    if (s.rollCD > 0) s.rollCD--;
    if (s.wlock > 0) s.wlock--;
    if (s.grace > 0) s.grace--;

    // ground / wall probes
    const grounded = s.vy >= 0 && rectSolid(w, s.x, s.y + 0.5, C.W, s.h);
    if (grounded) { s.coy = C.COYOTE; } else if (s.coy > 0) s.coy--;
    const touchL = rectSolid(w, s.x - 0.6, s.y + 1, C.W, s.h - 2);
    const touchR = rectSolid(w, s.x + 0.6, s.y + 1, C.W, s.h - 2);
    const wasOnG = s.onG;
    s.onG = grounded;

    // ---- rolling
    const rolling = s.roll > 0 || s.crawl;
    if (!rolling && downPress && grounded && s.rollCD === 0) {
      s.roll = C.ROLLT; s.rollDir = dirIn !== 0 ? dirIn : s.face; s.face = s.rollDir;
      setH(s, C.HR); s.ev |= EV.ROLL; s.anim = 0;
    }
    if (s.roll > 0) {
      s.roll--;
      if (s.roll === 0) {
        s.rollCD = C.ROLLCD;
        if (canStand(w, s)) setH(s, C.H); else s.crawl = true;
      }
    } else if (s.crawl && canStand(w, s)) {
      s.crawl = false; setH(s, C.H);
    }
    const low = s.roll > 0 || s.crawl;

    // ---- horizontal control
    if (low) {
      if (s.roll > 0) {
        const k = s.roll / C.ROLLT;
        const sp = C.CRAWL + (C.ROLLV - C.CRAWL) * Math.min(1, k * 1.6);
        s.vx = s.rollDir * sp;
      } else {
        s.vx = dirIn * C.CRAWL; if (dirIn) s.face = dirIn;
      }
    } else if (s.wlock > 0) {
      // keep wall-jump impulse, allow small steering
      s.vx += dirIn * C.AACC * 0.25 * DT;
    } else {
      const target = dirIn * C.RUN;
      const acc = grounded ? (dirIn ? C.GACC : C.GFRIC) : (dirIn ? C.AACC : C.AFRIC);
      if (s.vx < target) s.vx = Math.min(target, s.vx + acc * DT);
      else if (s.vx > target) s.vx = Math.max(target, s.vx - acc * DT);
      if (dirIn) s.face = dirIn;
    }

    // ---- wall slide / wall jump
    let wallDir = 0;
    if (!grounded && !low) {
      if (touchL && (dirIn < 0 || s.vy > 0)) wallDir = -1;
      else if (touchR && (dirIn > 0 || s.vy > 0)) wallDir = 1;
      if (touchL && touchR) wallDir = dirIn || -1;
    }
    if (wallDir !== 0) { s.wcoy = C.WCOY; s.wdir = wallDir; } else if (s.wcoy > 0) s.wcoy--;
    s.wallDir = wallDir;

    // ---- jump
    if (s.buf > 0) {
      if ((s.coy > 0 || (low && grounded)) && (!low || canStand(w, s) || true)) {
        if (low && !canStand(w, s)) { /* cannot jump out of a low tunnel */ }
        else {
          if (low) { s.roll = 0; s.crawl = false; setH(s, C.H); }
          s.vy = -C.JUMPV; s.buf = 0; s.coy = 0; s.onG = false; s.ev |= EV.JUMP; s.airT = 0;
        }
      } else if (s.wcoy > 0 && !grounded) {
        s.vy = -C.WJY; s.vx = -s.wdir * C.WJX; s.face = -s.wdir; s.wlock = C.WLOCK;
        s.buf = 0; s.wcoy = 0; s.ev |= EV.WJUMP;
      }
    }

    // ---- gravity
    if (!grounded || s.vy < 0) {
      let g = s.vy < 0 ? C.GU : C.GD;
      if (s.vy < 0 && !jumpHeld) g *= C.CUT;
      if (Math.abs(s.vy) < C.APEXV && jumpHeld) g *= C.APEXG;
      s.vy += g * DT;
      if (wallDir !== 0 && s.vy > C.WSLIDE) s.vy = Math.max(C.WSLIDE, s.vy - 1400 * DT);
      if (s.vy > C.MAXFALL) s.vy = C.MAXFALL;
    }

    // ---- integrate
    const hitX = moveX(w, s, s.vx * DT);
    if (hitX) s.vx = 0;
    const hy = moveY(w, s, s.vy * DT);
    if (hy === 1) {
      if (!wasOnG && s.vy > 30) { s.ev |= EV.LAND; s.landV = s.vy; if (s.vy > 150) s.ev |= EV.HARDLAND; }
      s.vy = 0; s.onG = true;
    } else if (hy === -1) s.vy = 0;
    else if (s.vy > 0 && s.onG && !rectSolid(w, s.x, s.y + 0.5, C.W, s.h)) s.onG = false;

    // ---- animation state
    const prevSt = s.st;
    if (low) s.st = 'roll';
    else if (!s.onG && wallDir !== 0 && s.vy > 0) s.st = 'wall';
    else if (!s.onG) s.st = s.vy < 0 ? 'jump' : 'fall';
    else s.st = Math.abs(s.vx) > 6 && dirIn !== 0 ? 'run' : 'idle';
    if (s.st !== prevSt) { s.anim = 0; if (s.st === 'jump') s.airT = 0; }
    else s.anim++;
    if (!s.onG) s.airT++;

    // ---- light & exposure
    s.lit = playerLit(w, s);
    let b = (s.lit - C.LITLO) / (C.LITHI - C.LITLO); b = b < 0 ? 0 : b > 1 ? 1 : b; b = b * b * (3 - 2 * b);
    s.burn = b;
    if (s.grace > 0) { s.ex = Math.max(0, s.ex - C.REGEN * DT); }
    else if (b > 0) s.ex += b * C.BURN * (w.lastBM || 1) * DT - (1 - b) * C.REGEN * DT * 0.35;
    else s.ex -= C.REGEN * DT;
    if (s.ex < 0) s.ex = 0;
    if (s.ex >= 1) { s.ex = 1; killPlayer(s, 'seen'); }
    if (s.y > w.killY) killPlayer(s, 'void');
    else {
      const kx = s.x + C.W / 2, ky = s.y + s.h;
      const ks = w.kills;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (kx > k[0] && kx < k[2] && ky > k[1] && ky < k[3]) { killPlayer(s, 'void'); break; }
      }
    }

    // ---- checkpoints & goal
    const cx = s.x + C.W / 2, cy = s.y + s.h / 2;
    for (let i = 0; i < w.checks.length; i++) {
      const c = w.checks[i];
      if (c.i > s.cp && Math.abs(cx - c.x) < 14 && Math.abs(cy - (c.y - 8)) < 14) {
        s.cp = c.i; s.cpX = c.x; s.cpY = c.y; s.ev |= EV.CHECK; s.ex = Math.max(0, s.ex - 0.5);
      }
    }
    const g = w.goal;
    if (Math.abs(cx - g.x) < 11 && Math.abs(cy - g.y) < 14) { s.won = true; s.wonT = 0; s.ev |= EV.WIN; }

    s.prev = inp;
    return s;
  }

  global.Dweller = global.Dweller || {};
  Object.assign(global.Dweller, {
    TS, TICK, DT, BEAT, IN, EV, C, smooth,
    makeWorld, newState, cloneState, step, solidAt, rectSolid, castRay, rayClear,
    lightAt, updateLights, schedGain, playerLit,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Dweller;
})(typeof globalThis !== 'undefined' ? globalThis : this);
