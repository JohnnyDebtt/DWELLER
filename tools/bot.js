// DWELLER test bot: searches for input sequences through the real sim, section by section.
// usage: node bot.js [levelPath] [outInputs]  -> prints per-segment results, writes full input list.
'use strict';
const fs = require('fs');
const path = require('path');
const D = require('../src/sim.js');
const levelPath = process.argv[2] || path.join(__dirname, '../build/level.json');
const outPath = process.argv[3] || path.join(__dirname, '../build/solution.json');
const onlySeg = process.argv[4] !== undefined ? parseInt(process.argv[4], 10) : -1;
const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
const w = D.makeWorld(level);
const { IN } = D;
const MACRO = 8;
const ACTS = [0, IN.L, IN.R, IN.J, IN.L | IN.J, IN.R | IN.J, IN.D, IN.L | IN.D, IN.R | IN.D];

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function lcm(a, b) { return a / gcd(a, b) * b; }

function periodFor(x0, x1) {
  let P = 64;
  for (const l of w.lights) {
    if (!l.hazard) continue;
    const near = l.x + l.reach > x0 - 200 && l.x - l.reach < x1 + 200;
    if (!near) continue;
    let per = 0;
    if (l.sched) per = l.sched.per;
    if (l.move) per = per ? lcm(per, l.move.per) : l.move.per;
    if (l.t === 'watch') per = per ? lcm(per, l.per) : l.per;
    if (per) P = lcm(P, per);
  }
  return P;
}

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function solveSegment(start, targetCp, maxExp, way) {
  const isFinal = targetCp >= w.checks.length && !way;
  const tx = way ? way[0] : (isFinal ? w.goal.x : w.checks[targetCp].x);
  const ty = way ? way[1] - 6 : (isFinal ? w.goal.y : w.checks[targetCp].y - 6);
  const P = periodFor(Math.min(start.x, tx) - 100, Math.max(start.x, tx) + 100);
  const TQ = parseInt(process.env.BOTTQ || '32', 10);
  const PM = Math.max(1, Math.ceil(P / TQ));
  const survives = (s0) => { const c = D.cloneState(s0); for (let i = 0; i < 112; i++) { D.step(w, c, 0); if (c.dead) return false; } return true; };
  const reached = (s) => way ? (Math.abs(s.x + 2.5 - way[0]) < 9 && Math.abs(s.y + s.h - way[1]) < 9 && s.onG && s.ex < 0.5 && survives(s)) : (isFinal ? s.won : s.cp >= targetCp);
  const heap = new Heap();
  const seen = new Map();
  const keyOf = (s) => {
    const tk = Math.floor(s.t / TQ) % PM;
    return ((((Math.round(s.x) * 4096 + Math.round(s.y)) * 16 + Math.round(s.vx / 24) + 8) * 24 + Math.round(s.vy / 24) + 12) * 32 +
      (s.onG ? 1 : 0) + (s.wallDir !== 0 ? 2 : 0) + ((s.roll > 0 || s.crawl) ? 4 : 0) + (s.coy > 0 ? 8 : 0) + (s.wlock > 0 ? 16 : 0)) * 8192 + tk;
  };
  const h = (s) => (Math.abs(s.x - tx) + 1.6 * Math.abs(s.y - ty)) / 6;
  const root = { s: start, g: 0, parent: null, act: 0, f: h(start) };
  heap.push(root);
  seen.set(keyOf(start), start.ex);
  let exp = 0;
  while (heap.size && exp < maxExp) {
    const n = heap.pop();
    exp++;
    if (process.env.BOTLOG && exp % 5000 === 0) console.log('  exp', exp, 'heap', heap.size, 'best x', (n.s.x / 6).toFixed(1), 'y', (n.s.y / 6).toFixed(1), 'g', n.g);
    for (let ai = 0; ai < ACTS.length; ai++) {
      const s = D.cloneState(n.s);
      const inp = ACTS[ai];
      let ok = true;
      for (let k = 0; k < MACRO; k++) {
        D.step(w, s, inp);
        if (s.dead) { ok = false; break; }
        if (reached(s)) break;
      }
      if (!ok) continue;
      if (s.ex > 0.965) continue;
      const done = reached(s);
      const node = { s, g: n.g + 1, parent: n, act: inp, f: 0 };
      if (done) return { node, exp };
      const key = keyOf(s);
      const prev = seen.get(key);
      if (prev !== undefined && prev <= s.ex + 0.06) continue;
      seen.set(key, s.ex);
      node.f = node.g + (parseFloat(process.env.BOTW || '2.2')) * h(s);
      heap.push(node);
    }
  }
  return { node: null, exp };
}

function inputsOf(node) {
  const acts = [];
  for (let n = node; n.parent; n = n.parent) acts.push(n.act);
  acts.reverse();
  return acts;
}

// ---- run
function applyActs(s, acts, cp, way) {
  const out = [];
  for (const a of acts) {
    for (let k = 0; k < MACRO; k++) {
      D.step(w, s, a);
      out.push(a);
      if (s.won) return out;
    }
  }
  return out;
}

const ways = (level.ways || []).slice();
const segOf = (x) => { let i = 0; while (i < w.checks.length && w.checks[i].x < x) i++; return i; }; // target checkpoint index
let s = D.newState(w);
const full = [];
let totalTicks = 0;
const t0 = Date.now();
for (let cp = 1; cp <= w.checks.length; cp++) {
  if (onlySeg >= 0 && cp - 1 !== onlySeg) { if (cp - 1 < onlySeg) continue; break; }
  if (onlySeg >= 0) {
    s = D.newState(w);
    s.x = w.checks[cp - 1].x - 2.5; s.y = w.checks[cp - 1].y - 10; s.cp = cp - 1; s.cpX = w.checks[cp - 1].x; s.cpY = w.checks[cp - 1].y; s.grace = 0;
  }
  const wps = ways.filter(wp => segOf(wp[0]) === cp || (cp === w.checks.length && wp[0] > w.checks[w.checks.length - 1].x));
  const legs = wps.map(wp => ({ way: wp })).concat([{ way: null }]);
  const t1 = Date.now();
  let segTicks = 0, segExp = 0;
  for (const leg of legs) {
    const r = solveSegment(s, cp, parseInt(process.env.BOTMAX || "1200000", 10), leg.way);
    segExp += r.exp;
    if (!r.node) {
      console.log(`segment ${cp - 1} -> ${cp === w.checks.length ? 'GOAL' : cp}: FAILED ${leg.way ? 'at waypoint (' + (leg.way[0] / 6).toFixed(1) + ',' + (leg.way[1] / 6).toFixed(1) + ')' : 'at final leg'} after ${r.exp} expansions (start x=${(s.x / 6).toFixed(1)} y=${(s.y / 6).toFixed(1)} t=${s.t})`);
      process.exit(2);
    }
    const acts = inputsOf(r.node);
    const o = applyActs(s, acts, cp, leg.way);
    for (const a of o) full.push(a);
    segTicks += o.length;
  }
  totalTicks += segTicks;
  console.log(`segment ${cp - 1} -> ${cp === w.checks.length ? 'GOAL' : cp}: ok ${(segTicks / 96).toFixed(1)}s, exp ${segExp}, ex=${s.ex.toFixed(2)}, ${(Date.now() - t1)}ms`);
  if (onlySeg >= 0) break;
}
console.log(`total ${(totalTicks / 96).toFixed(1)}s (${(totalTicks / 96 / 60).toFixed(2)} min), solved in ${((Date.now() - t0) / 1000).toFixed(1)}s, won=${s.won}`);
if (onlySeg < 0) fs.writeFileSync(outPath, JSON.stringify(full));
