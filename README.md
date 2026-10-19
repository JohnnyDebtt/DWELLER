# Dweller

A dark side-scroller: stay in the shadow, reach the rainbow crystal. Set in The Seeker universe.

- Play: open `dist/dweller.html` in any browser (single self-contained file).
- Source: `src/` (game: sim, render, audio, main), `tools/` (level generator, bot solver, build), `assets/`, `test/`.
- Build: `python3 tools/levels.py` (regenerates build/level.json), then `python3 tools/build.py` (writes dist/dweller.html).
- Verify solvability: `node tools/bot.js build/level.json build/solution.json`.

Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY 4.0
(https://github.com/TheSeekerGame/the-seeker). Changes were made where applicable.

