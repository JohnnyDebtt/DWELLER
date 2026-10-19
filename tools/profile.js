// Exposure profile: run a straight dash through x-range and report max exposure; list lit() along the floor.
// usage: node profile.js x0 x1 [t0]   (tile columns; player starts at floor of column x0)
'use strict';
const path = require('path');
const D = require('../src/sim.js');
const level = require(path.join(__dirname, '../build/level.json'));
const w = D.makeWorld(level);
const x0 = parseFloat(process.argv[2]), x1 = parseFloat(process.argv[3]);
const t0 = parseInt(process.argv[4] || '0', 10);
// find the floor under x0
let col = Math.floor(x0), row = 0;
for (let y = 0; y < w.H; y++) { if (!D.solidAt(w, col, y) && D.solidAt(w, col, y + 1) && y > 4) { row = y; if (process.env.LOW) break; } }
// pick the first walkable floor with headroom
for (let y = 4; y < w.H - 2; y++) { if (!D.solidAt(w, col, y) && !D.solidAt(w, col, y - 1) && !D.solidAt(w, col, y - 2) && D.solidAt(w, col, y + 1)) { row = y; break; } }
let s = D.newState(w);
s.x = x0 * 6; s.y = (row + 1) * 6 - 10; s.grace = 0; s.t = t0;
let maxEx = 0, line = '';
for (let i = 0; i < 96 * 20; i++) {
  D.step(w, s, D.IN.R);
  if (s.ex > maxEx) maxEx = s.ex;
  if (i % 12 === 0) line += (s.lit > 0.5 ? '#' : s.lit > 0.1 ? '+' : s.lit > 0.02 ? '.' : '_');
  if (s.dead || s.x / 6 > x1) break;
}
console.log('floor row', row, 'dash maxEx', maxEx.toFixed(2), 'dead', s.dead, 'end x', (s.x / 6).toFixed(1));
console.log(line);
