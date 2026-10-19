"""DWELLER — Level I: THE DESCENT. Eleven sections, one lesson each, building to the crystal."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from levelkit import Sec, assemble, sched, b

secs = []


def new(name, title, w, hs, e, root):
    s = Sec(name, title, w, hs, dict(e=e, root=root))
    secs.append(s)
    return s


# ---------------------------------------------------------------- 0 THRESHOLD
s = new('s0', 'I  THRESHOLD', 112, 56, 0.15, 0)
s.cave([(0, 40)], [(0, 14), (20, 15), (50, 16), (100, 15), (106, 14)])
s.spawn_at(7)
s.rock(36, 38, 4, 2)
s.rock(40, 37, 4, 3)
s.hint(70.5, 20.5, 'LIGHT   BURNS')
s.lamp(62.5, 33.5, 9)
s.hint(70, 22.4, 'SHADOW   HEALS')
s.lamp(90.5, 33.5, 10)
s.tether(102)

# ---------------------------------------------------------------- 1 BRAZIER HALL
s = new('s1', 'II  BRAZIER HALL', 104, 56, 0.25, 0)
s.cave([(0, 40)], [(0, 14), (22, 22), (84, 22), (92, 14)])
for (x, y, w) in [(27, 38, 4), (32, 35, 4), (37, 32, 4), (42, 29, 4), (47, 26, 4)]:
    s.plat(x, y, w, way=True)
s.plat(52, 23, 11, way=True)
for (x, y, w) in [(64, 26, 4), (69, 29, 4), (74, 32, 4), (79, 35, 4), (84, 38, 4)]:
    s.plat(x, y, w, way=True)
s.lamp(57.5, 38.5, 15)
s.hint(11, 21, 'GO  OVER')
s.tether(98)

# ---------------------------------------------------------------- PENDULUM HALL
s = new('sp', 'III  PENDULUM HALL', 124, 56, 0.3, 2)
s.cave([(0, 40)], [(0, 15)])
s.hint(8, 20, 'SOME   LIGHTS   WALK')
for x in (16, 34, 52, 70, 88, 106):
    s.rock(x, 33, 6, 2)
for x, ph in [(26.0, 0.0), (62.0, 0.5), (98.0, 0.25)]:
    s.orb(x, 25, 24, 16, 2, 8, ph, 1.4)

# ---------------------------------------------------------------- 2 FLICKER
s = new('s2', 'IV  FLICKER', 134, 56, 0.35, 4)
s.cave([(0, 40)], [(0, 15)])
s.hint(10, 20, 'FLICKER   WARNS   OF   BURN')
for (x0, w, ph) in [(24, 7, 0), (52, 8, 3), (80, 7, 6), (108, 8, 1)]:
    s.beam(x0 + w / 2.0, 22.5, w + 5, 22, per=8, on=3, ph=ph, I=1.3, burn=4.0)
s.rock(82, 38, 3, 2)
s.pit(111, 115, depth=12)
s.tether(15)
s.tether(126)

# ---------------------------------------------------------------- 3 UNDERTOW
s = new('s3', 'V  UNDERTOW', 96, 60, 0.35, 2)
s.cave([(0, 40), (8, 43), (12, 46), (16, 40)], [(0, 18), (8, 21), (12, 24), (16, 18)])
s.hint(2, 17, 'DOWN  /  S    ROLL')
s.hint(30, 17, 'THE   HALL   BURNS')
s.lamp(30.5, 30.5, 20)
s.lamp(62.5, 30.5, 20)
s.air(16, 45, 60, 1)           # the crawlspace, one tile high
s.air(30, 40, 1, 5)            # thin light holes
s.air(62, 40, 1, 5)
s.air(76, 40, 4, 6)            # the way back up
s.plat(78, 43, 2)
for wx, wy in [(14.5, 46), (40, 46), (74, 46), (78.5, 43), (84, 40)]:
    s.way(wx, wy)
s.tether(90)

# ---------------------------------------------------------------- 4 DRIFT
s = new('s4', 'VI  DRIFT', 140, 70, 0.45, 5)
s.cave([(0, 40), (12, 60), (128, 40)], [(0, 22), (12, 42), (128, 22)])
s.kills.append((12 * 6, 49 * 6, 128 * 6, 62 * 6))
for (x, y, w) in [(15, 40, 5), (23, 38, 4), (31, 36, 4), (38, 38, 5), (47, 40, 4), (55, 38, 4),
                  (62, 36, 5), (71, 38, 4), (79, 40, 5), (88, 38, 4), (96, 36, 4), (104, 38, 5),
                  (113, 40, 4), (121, 38, 4)]:
    s.plat(x, y, w, 2, way=True)
for (x, y0, dy) in [(21.5, 28, 7), (36.5, 27, 8), (45.5, 28, 7), (59.5, 28, 7), (75.5, 28, 8), (92.5, 27, 8), (109.5, 28, 7)]:
    s.orbline(x, y0, 0, dy, 7.5, 8, ((x - 21.5) / 8.0) * 0.085)
s.tether(81, 40)

# ---------------------------------------------------------------- 5 ASCENT
s = new('s5', 'VII  ASCENT', 44, 90, 0.5, 3)
s.cave([(0, 76), (17, 36)], [(0, 8), (12, 50), (17, 8)])
# shaft is columns 12..16 : cave() carved it with floor 76 from x=12? fix floors for shaft columns
for x in range(12, 17):
    s.floor[x] = 76
s.g[26:76, 12:17] = 0
s.g[28:36, 17:44] = 0
for r, ph in [(63, 0.0), (55, 2.0), (47, 4.0), (39, 6.0)]:
    s.air(8, r - 1, 4, 3)
    s.beam(9.5, r + 0.5, 3, 9, per=8, on=3, ph=ph, ang=0, chimney=False)
for r in (59, 51, 43):
    s.air(17, r, 2, 3)
for wy in (62, 54, 46):
    s.way(17.5, wy)
s.way(21.5, 36)
s.hint(2, 71, 'WALL   JUMP   TO   CLIMB')
s.tether(5)
s.tether(30)

# ---------------------------------------------------------------- 6 WATCHERS
s = new('s6', 'VIII  WATCHERS', 152, 60, 0.6, 1)
s.cave([(0, 40)], [(0, 14), (20, 22), (136, 22), (146, 14)])
for x in [10, 24, 38, 52, 66, 80, 94, 108, 122, 136]:
    s.rock(x, 33, 6, 2)
for x, ph in [(34.5, 0.0), (76.5, 3.3), (118.5, 6.6)]:
    s.watch(x, 18.5, 34, 14, 90, 50, 10, ph, I=2.0, burn=2.0)
s.hint(1, 21, 'THE  EYES  BURN  WHERE  THEY  LOOK')
s.tether(96)

# ---------------------------------------------------------------- GATEKEEPERS
s = new('sg', 'IX  GATEKEEPERS', 108, 56, 0.55, 5)
s.cave([(0, 40)], [(0, 15)])
s.hint(6, 20, 'WAIT   FOR   THE   DARK')
for k, (x0, ph) in enumerate([(12, 0), (38, 3), (64, 6), (90, 9)]):
    s.beam(x0 + 7.0, 22.5, 14, 22, per=16, on=9, ph=ph, warn=1.0, burn=4.0)
for wx in (32, 58, 84):
    s.way(wx, 40)
s.tether(58)

# ---------------------------------------------------------------- THE SINK
s = new('sk', 'X  THE SINK', 104, 60, 0.5, 1)
s.cave([(0, 40), (8, 43), (12, 46), (16, 40)], [(0, 18), (8, 21), (12, 24), (16, 18)])
s.hint(2, 17, 'THE   DARK   IS   LOW')
s.lamp(24.5, 30.5, 20)
s.lamp(50.5, 30.5, 20)
s.lamp(76.5, 30.5, 20)
s.air(16, 45, 68, 1)
s.air(24, 40, 1, 5)
s.air(50, 40, 1, 5)
s.air(76, 40, 1, 5)
s.air(84, 40, 4, 6)
s.plat(86, 43, 2)
for wx, wy in [(14.5, 46), (40, 46), (66, 46), (82, 46), (86.5, 43), (92, 40)]:
    s.way(wx, wy)
s.tether(98)

# ---------------------------------------------------------------- 7 FALL
s = new('s7', 'XI  FALL', 50, 96, 0.55, 2)
s.cave([(0, 20), (14, 84), (34, 84)], [(0, 10), (14, 70), (34, 10)])
for (x, y) in [(14, 28), (26, 36), (14, 44), (26, 52), (14, 60), (26, 68)]:
    s.plat(x, y, 8, 2, way=True)
for i, (ledge_row, side, ph) in enumerate([(28, 'L', 0.0), (36, 'R', 1.5), (44, 'L', 3.0), (52, 'R', 4.5), (60, 'L', 6.0), (68, 'R', 7.5)]):
    r = ledge_row - 2
    if side == 'L':      # light enters from the right wall, crosses the left ledge
        s.air(34, r - 1, 4, 3)
        s.beam(36.5, r + 0.5, 3, 24, per=8, on=3, ph=ph, ang=180, chimney=False)
    else:
        s.air(10, r - 1, 4, 3)
        s.beam(11.5, r + 0.5, 3, 24, per=8, on=3, ph=ph, ang=0, chimney=False)
s.tether(46)

# ---------------------------------------------------------------- 8 THE WAVE
s = new('s8', 'XII  THE WAVE', 118, 56, 0.8, 4)
s.cave([(0, 40)], [(0, 15)])
s.hint(6, 20, 'RUN   WITH   THE   BEAT')
for k in range(11):
    x0 = 14 + 8 * k
    s.beam(x0 + 2.5, 22.5, 5, 22, per=8, on=3, ph=-float(k), burn=4.0)
s.tether(110)

# ---------------------------------------------------------------- CROSSING
s = new('sx', 'XIII  CROSSING', 140, 70, 0.7, 4)
s.cave([(0, 40), (12, 60), (128, 40)], [(0, 22), (12, 42), (128, 22)])
s.kills.append((12 * 6, 49 * 6, 128 * 6, 62 * 6))
for (x, y, w) in [(15, 40, 5), (23, 38, 4), (31, 36, 4), (38, 38, 5), (47, 40, 4), (55, 38, 4),
                  (62, 36, 5), (71, 38, 4), (79, 40, 5), (88, 38, 4), (96, 36, 4), (104, 38, 5),
                  (113, 40, 4), (121, 38, 4)]:
    s.plat(x, y, w, 2, way=True)
for (x, y0, dy) in [(21.5, 28, 7), (36.5, 27, 8), (45.5, 28, 7), (59.5, 28, 7), (75.5, 28, 8), (92.5, 27, 8), (109.5, 28, 7)]:
    s.orbline(x, y0, 0, dy, 7.5, 8, -((x - 21.5) / 8.0) * 0.085)
s.tether(81, 40)

# ---------------------------------------------------------------- 9 HOLLOW
s = new('s9', 'XIV  HOLLOW', 150, 60, 0.85, 3)
s.cave([(0, 40)], [(0, 15), (6, 16), (112, 24)])
s.rock(20, 38, 3, 2)
for x, ph in [(14.5, 0.0), (28.5, 0.33), (42.5, 0.66)]:
    s.orbline(x, 27, 0, 10, 10, 6, ph)
s.pit(31, 35, depth=12)
s.tether(50)
# orbit gates
for x in (64, 82):
    s.pillar(x, 2, 37)
    s.orb(x + 1, 33, 10, 7, 5, 8, 0.0)
s.orb(100, 30, 10, 0, 6, 6, 0.0)
s.pit(92, 96, depth=12)
s.tether(108)
# lighthouse
s.watch(130.5, 16.5, 36, 12, 90, 0, 12, 0.0, I=2.0, spin=True, burn=2.0)
for x in (114, 127, 141):
    s.rock(x, 33, 6, 2)

# ---------------------------------------------------------------- 10 CRYSTAL
s = new('s10', 'XV  THE CRYSTAL', 130, 70, 1.0, 0)
s.cave([(0, 50), (59, 20)], [(0, 14), (18, 36), (59, 14), (96, 16)])
s.tether(4)
# the spire: ten ledges, two lighthouses
for (x, y, w) in [(20, 47, 8), (30, 44, 7), (39, 41, 7), (48, 38, 8), (38, 35, 7), (28, 32, 7),
                  (18, 29, 7), (27, 26, 7), (36, 23, 7), (45, 20, 8)]:
    s.plat(x, y, w, 2, way=True)
s.plat(55, 20, 3, 2, way=True)
s.watch(31.5, 14.5, 34, 11, 90, 0, 14, 0.0, I=2.0, spin=True, burn=2.0)
s.watch(47.5, 14.5, 34, 11, 90, 0, 14, 7.0, I=2.0, spin=True, burn=2.0)
s.orbline(34.5, 24, 0, 9, 9, 8, 0.0)
s.rock(60, 17, 2, 3)      # a low wall: the lighthouses cannot see over it
s.tether(64)
# the gate: two beams that take turns
s.beam(70.0, 3.5, 6, 18, per=8, on=4, ph=0.0, warn=0.5, burn=4.0)
s.beam(80.0, 3.5, 6, 18, per=8, on=4, ph=4.0, warn=0.5, burn=4.0)
# the chamber
s.rock(116, 17, 10, 3)
s.rock(119, 15, 4, 2)
s.lamp(121.0, 11.5, 30, 1.0, col='rainbow', haz=False)
s.goal_at(121.0, 12.0)

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'build')
    os.makedirs(out, exist_ok=True)
    lv = assemble(secs, os.path.join(out, 'level.json'), os.path.join(out, 'preview'))
    print('level', lv['w'], 'x', lv['h'], 'lights', len(lv['lights']), 'checks', len(lv['checks']))
