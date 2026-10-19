/* DWELLER — procedural music and sound, all synthesised with Web Audio (no samples).
 *
 * Tuning: every pitch is 48 Hz x X / 2^N (the Seeker tuning). The palette is 1, 9/8, 19/16, 21/16, 3/2, 7/4.
 * Tempo: 90 BPM = 1.5 Hz; one step (a half beat) = 32 simulation ticks at 96 Hz.
 * Motifs of 5 and 7 steps run against each other and realign every 35 steps.
 * The same engine drives the live game (reacting to light and danger) and the offline render of the soundtrack.
 */
(function (global) {
  'use strict';
  const F0 = 48;
  const PALETTE = [1, 9 / 8, 19 / 16, 21 / 16, 3 / 2, 7 / 4];
  const BEAT = 60 / 90;
  const STEP = BEAT / 2;

  function hz(ratio, oct) { return F0 * ratio * Math.pow(2, oct); }
  function fold(f, lo, hi) { while (f < lo) f *= 2; while (f >= hi) f /= 2; return f; }
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function makeIR(ctx, seconds, decay, seed) {
    const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, n, rate);
    const rnd = mulberry(seed || 7);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const env = Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
        lp += ((rnd() * 2 - 1) - lp) * (0.18 + 0.5 * (1 - t));   // darker as it decays
        d[i] = lp * env;
      }
    }
    return buf;
  }

  function noiseBuffer(ctx, seconds, seed) {
    const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0), r = mulberry(seed || 3);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  class Engine {
    constructor(ctx, out, opts) {
      opts = opts || {};
      this.ctx = ctx; this.offline = !!opts.offline;
      this.rnd = mulberry(opts.seed || 1999);
      this.noise = noiseBuffer(ctx, 3, 5);
      const c = ctx;
      this.master = c.createGain(); this.master.gain.value = opts.volume === undefined ? 0.8 : opts.volume;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -20; this.comp.knee.value = 24; this.comp.ratio.value = 3.2; this.comp.attack.value = 0.012; this.comp.release.value = 0.35;
      this.shaper = c.createWaveShaper();
      const curve = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = (i / 1023.5 - 1); curve[i] = Math.tanh(x * 1.25) / Math.tanh(1.25); }
      this.shaper.curve = curve;
      this.master.connect(this.comp); this.comp.connect(this.shaper); this.shaper.connect(out);
      this.musicBus = c.createGain(); this.musicBus.gain.value = 1; this.musicBus.connect(this.master);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      // reverb + echo
      this.rev = c.createConvolver(); this.rev.buffer = makeIR(c, 4.2, 2.4, 11);
      this.revSend = c.createGain(); this.revSend.gain.value = 1; this.revOut = c.createGain(); this.revOut.gain.value = 0.62;
      this.revSend.connect(this.rev); this.rev.connect(this.revOut); this.revOut.connect(this.master);
      this.echo = c.createDelay(2); this.echo.delayTime.value = BEAT * 0.75;
      this.echoFb = c.createGain(); this.echoFb.gain.value = 0.42; this.echoLP = c.createBiquadFilter(); this.echoLP.type = 'lowpass'; this.echoLP.frequency.value = 1800;
      this.echo.connect(this.echoLP); this.echoLP.connect(this.echoFb); this.echoFb.connect(this.echo); this.echoLP.connect(this.revSend);
      this.echoOut = c.createGain(); this.echoOut.gain.value = 0.5; this.echoLP.connect(this.echoOut); this.echoOut.connect(this.musicBus);
      this.energy = 0.2; this.fear = 0; this.rootIdx = 0; this.seedBase = 1;
      this.buildDrone(); this.buildWind(); this.buildFear();
      this.pad = null; this.padTime = -99;
    }

    osc(type, f, dest, g) {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const gn = this.ctx.createGain(); gn.gain.value = g === undefined ? 1 : g;
      o.connect(gn); gn.connect(dest); o.start(); return { o, g: gn };
    }

    buildDrone() {
      const c = this.ctx;
      this.droneGain = c.createGain(); this.droneGain.gain.value = 0.0; this.droneGain.connect(this.musicBus);
      const send = c.createGain(); send.gain.value = 0.3; this.droneGain.connect(send); send.connect(this.revSend);
      this.osc('sine', F0, this.droneGain, 0.55);                       // 48 Hz, the fundamental
      this.osc('sine', F0 * 2, this.droneGain, 0.28);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.8; lp.connect(this.droneGain);
      this.osc('sawtooth', F0 * 2, lp, 0.20);                           // 96 Hz growl
      this.osc('triangle', F0 * 3, lp, 0.14);                           // 144 Hz (3/2)
      this.osc('sawtooth', F0 * 3, lp, 0.05);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.043; const lg = c.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      this.droneLP = lp;
    }

    buildWind() {
      const c = this.ctx;
      this.windGain = c.createGain(); this.windGain.gain.value = 0; this.windGain.connect(this.musicBus);
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.4;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
      s.connect(bp); bp.connect(this.windGain); s.start(0, 0);
      const send = c.createGain(); send.gain.value = 0.5; this.windGain.connect(send); send.connect(this.revSend);
    }

    buildFear() {
      const c = this.ctx;
      this.fearGain = c.createGain(); this.fearGain.gain.value = 0; this.fearGain.connect(this.musicBus);
      const send = c.createGain(); send.gain.value = 0.35; this.fearGain.connect(send); send.connect(this.revSend);
      // 19 and 21 harmonics of 48 Hz beat against each other at 96 Hz: tension
      this.osc('sine', F0 * 19, this.fearGain, 0.16); this.osc('sine', F0 * 21, this.fearGain, 0.16);
      this.osc('sine', F0 * 13, this.fearGain, 0.10); this.osc('triangle', F0 * 7, this.fearGain, 0.12);
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
      const ng = c.createGain(); ng.gain.value = 0.10; s.connect(hp); hp.connect(ng); ng.connect(this.fearGain); s.start(0, 1.1);
    }

    /* chord pad: swap voices when the root changes */
    setRoot(t, idx) {
      if (this.pad && this.rootIdx === idx) return;
      this.rootIdx = idx;
      const c = this.ctx;
      if (this.pad) {
        const old = this.pad;
        old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + 5);
        old.stop = t + 5.2;
        for (const o of old.oscs) { try { o.stop(t + 5.3); } catch (e) { } }
      }
      const g = c.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 4.5);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5;
      g.connect(lp); const out = c.createGain(); out.gain.value = 0.0; lp.connect(out); out.connect(this.musicBus);
      const send = c.createGain(); send.gain.value = 0.55; out.connect(send); send.connect(this.revSend);
      const r = PALETTE[idx];
      const notes = [fold(F0 * r * 4, 150, 300), fold(F0 * r * 6, 190, 420), fold(F0 * r * 7, 230, 500), fold(F0 * r * 19 / 16 * 8, 300, 640)];
      const oscs = [];
      notes.forEach((f, i) => {
        for (const [type, gain, mul] of [['sawtooth', 0.07, 1], ['triangle', 0.12, 1], ['sine', 0.08, 2]]) {
          const o = c.createOscillator(); o.type = type; o.frequency.value = f * mul;
          const vg = c.createGain(); vg.gain.value = gain; o.connect(vg); vg.connect(g); o.start(t);
          oscs.push(o);
        }
      });
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + 0.02 * idx; const lg = c.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); oscs.push(lfo);
      this.pad = { g, lp, out, oscs };
    }

    /* continuous parameters; call often (cheap) */
    setParams(t, p) {
      const e = p.energy === undefined ? this.energy : p.energy, f = p.fear || 0;
      this.energy = e; this.fear = f;
      const tc = 0.6;
      const d = p.duck === undefined ? 1 : p.duck;
      this.droneGain.gain.setTargetAtTime((0.32 + 0.18 * e) * d, t, tc);
      this.windGain.gain.setTargetAtTime((0.085 + 0.05 * (1 - e)) * d, t, tc);
      this.fearGain.gain.setTargetAtTime(0.14 * f * f * d, t, 0.25);
      if (this.pad) { this.pad.out.gain.setTargetAtTime((0.20 + 0.30 * e) * d, t, tc); this.pad.lp.frequency.setTargetAtTime(520 + 1100 * e, t, 1.5); }
      this.droneLP.frequency.setTargetAtTime(210 + 340 * e + 200 * f, t, 1.2);
    }

    env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }

    bell(t, f, vel, dur) {
      const c = this.ctx;
      const g = c.createGain(); this.env(g, t, 0.006, 0.20 * vel, dur || 2.2);
      const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      const o3 = c.createOscillator(); o3.type = 'triangle'; o3.frequency.value = f * 3; const g3 = c.createGain(); g3.gain.value = 0.10;
      o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
      g.connect(this.musicBus); const s1 = c.createGain(); s1.gain.value = 0.6; g.connect(s1); s1.connect(this.revSend);
      const s2 = c.createGain(); s2.gain.value = 0.5; g.connect(s2); s2.connect(this.echo);
      const end = t + (dur || 2.2) + 0.1;
      for (const o of [o1, o2, o3]) { o.start(t); o.stop(end); }
    }

    thump(t, f0, vel, len) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0 * 2.2, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.09);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + (len || 0.42));
      o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + (len || 0.42) + 0.05);
      const s = c.createGain(); s.gain.value = 0.25; g.connect(s); s.connect(this.revSend);
    }

    pluckBass(t, f, vel, dur) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      lp.frequency.setValueAtTime(900 + 700 * this.energy, t); lp.frequency.exponentialRampToValueAtTime(130, t + dur);
      const g = c.createGain(); this.env(g, t, 0.01, 0.22 * vel, dur);
      const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = f; const sg = c.createGain(); sg.gain.value = 0.7;
      o.connect(lp); lp.connect(g); sub.connect(sg); sg.connect(g); g.connect(this.musicBus);
      o.start(t); sub.start(t); o.stop(t + dur + 0.1); sub.stop(t + dur + 0.1);
    }

    tick(t, vel, f) {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f || 2400; bp.Q.value = 6;
      const g = c.createGain(); this.env(g, t, 0.002, 0.08 * vel, 0.07);
      s.connect(bp); bp.connect(g); g.connect(this.musicBus);
      const sd = c.createGain(); sd.gain.value = 0.4; g.connect(sd); sd.connect(this.revSend);
      s.start(t, this.rnd() * 2); s.stop(t + 0.12);
    }

    /* one musical step (half a beat). n is the global step number. */
    step(t, n, p) {
      const e = p.energy === undefined ? this.energy : p.energy;
      const idx = this.rootIdx, root = PALETTE[idx];
      const r = this.rnd;
      const bar = Math.floor(n / 8), s8 = n % 8;
      // heartbeat: lub-dub every two beats
      if (n % 4 === 0) {
        const v = 0.30 + 0.45 * e;
        this.thump(t, 48, v, 0.5); this.thump(t + 0.20, 48, v * 0.55, 0.32);
      }
      // bass motif, 5 steps
      if (e > 0.28) {
        const pat = [0, 0, 4, 2, 5], k = n % 5;
        if (k === 0 || (e > 0.55 && (k === 2 || k === 3))) {
          const ratio = PALETTE[pat[k]] * root;
          this.pluckBass(t, fold(F0 * ratio * 2, 48, 130), 0.5 + 0.5 * e, STEP * 1.8);
        }
      }
      // bells, 7-step motif; density follows energy
      const motif = [1, 0, 1, 1, 0, 1, 0], k7 = n % 7;
      const dens = 0.30 + 0.45 * (1 - e * 0.55);
      if (motif[k7] && r() < dens) {
        const choice = [0, 2, 4, 5, 1, 4, 2][Math.floor(r() * 7)];
        const ratio = PALETTE[choice] * root;
        const oct = 3 + Math.floor(r() * 3);
        this.bell(t, fold(F0 * ratio * Math.pow(2, oct), 380, 2000), 0.45 + 0.5 * r() * (1 - 0.3 * e), 2.4);
      }
      // low drums when it gets serious
      if (e > 0.6) {
        if ([0, 3, 6].includes(s8)) this.thump(t, 72, 0.35 * e, 0.28);
        if ([2, 5, 7].includes(s8) && r() < 0.6) this.tick(t, 0.5 + 0.5 * e, 1800 + 1800 * r());
      }
      // drips in the dark
      if (r() < 0.05) this.bell(t + r() * STEP, fold(F0 * PALETTE[Math.floor(r() * 6)] * 32, 1500, 3200), 0.12, 0.9);
    }

    /* ----------------------------------------------------------- sound effects */
    sfxNoise(t, dur, type, f0, f1, vel, q) {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = type; bp.Q.value = q || 1;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(bp); bp.connect(g); g.connect(this.sfxBus);
      const sd = c.createGain(); sd.gain.value = 0.25; g.connect(sd); sd.connect(this.revSend);
      s.start(t, this.rnd() * 2); s.stop(t + dur + 0.05);
    }
    sfxTone(t, f0, f1, dur, vel, type) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
      const sd = c.createGain(); sd.gain.value = 0.3; g.connect(sd); sd.connect(this.revSend);
    }
    sfx(name, t, a) {
      a = a || {};
      const v = a.v === undefined ? 1 : a.v;
      switch (name) {
        case 'jump': this.sfxNoise(t, 0.12, 'bandpass', 500, 1400, 0.10 * v, 1.2); this.sfxTone(t, 190, 330, 0.12, 0.06 * v); break;
        case 'land': this.sfxNoise(t, 0.16, 'lowpass', 600, 120, 0.22 * v, 0.7); this.sfxTone(t, 90, 48, 0.2, 0.18 * v); break;
        case 'step': this.sfxNoise(t, 0.05, 'bandpass', 900 + 400 * this.rnd(), 500, 0.05 * v, 2); break;
        case 'roll': this.sfxNoise(t, 0.36, 'bandpass', 380, 1100, 0.16 * v, 1.6); break;
        case 'wjump': this.sfxNoise(t, 0.1, 'highpass', 1800, 900, 0.10 * v, 1); this.sfxTone(t, 260, 480, 0.14, 0.08 * v, 'triangle'); break;
        case 'death': {
          this.sfxTone(t, 380, 48, 1.4, 0.34, 'sawtooth'); this.sfxNoise(t, 1.1, 'lowpass', 2400, 90, 0.34, 0.8);
          this.sfxTone(t, F0 * 19, F0 * 19 * 0.5, 1.0, 0.12); this.sfxTone(t, F0 * 21, F0 * 21 * 0.5, 1.0, 0.12); break;
        }
        case 'respawn': { for (let i = 0; i < 3; i++) this.bell(t + i * 0.09, F0 * 8 * PALETTE[[0, 4, 5][i]] * 0.5 * 2, 0.5, 1.8); break; }
        case 'check': { const seq = [1, 3 / 2, 2, 7 / 4, 3, 7 / 2]; seq.forEach((r, i) => this.bell(t + i * 0.12, F0 * 8 * r, 0.7, 3.2)); this.sfxNoise(t, 0.6, 'bandpass', 300, 2400, 0.09, 1.5); break; }
        case 'beamOn': this.sfxTone(t, 160, 70, 0.28, 0.16 * v, 'sine'); this.sfxNoise(t, 0.22, 'highpass', 3600, 2200, 0.05 * v, 0.7); break;
        case 'win': {
          const hs = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 24];
          hs.forEach((h, i) => this.bell(t + i * 0.11, F0 * h * 2, 0.8, 5.5));
          this.sfxTone(t, F0, F0 * 2, 3.5, 0.3, 'sine'); this.sfxNoise(t, 3.5, 'bandpass', 600, 5200, 0.12, 0.8); break;
        }
        case 'caught': {
          this.sfxTone(t, F0 * 19, F0 * 19 * 0.96, 0.5, 0.16 * v, 'sawtooth'); this.sfxTone(t, F0 * 21, F0 * 21 * 0.95, 0.5, 0.14 * v, 'sawtooth');
          this.sfxNoise(t, 0.35, 'bandpass', 3400, 1500, 0.12 * v, 2.5); this.sfxTone(t, 120, 60, 0.3, 0.2 * v); break;
        }
        case 'ui': this.bell(t, F0 * 8 * 1.5, 0.35, 0.7); break;
        case 'start': { [1, 3 / 2, 2, 7 / 4].forEach((r, i) => this.bell(t + i * 0.16, F0 * 4 * r, 0.7, 4)); this.thump(t, 48, 0.8, 1.2); break; }
      }
    }
  }

  /* ------------------------------------------------------------------ live game wrapper */
  const Live = {
    ctx: null, eng: null, started: false, muted: false, timer: null, nextStep: 0, stepN: 0, t0: 0, params: { energy: 0.2, fear: 0 },
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.eng = new Engine(this.ctx, this.ctx.destination, { volume: 0.7 });
        this.eng.setParams(this.ctx.currentTime, { energy: 0.2, fear: 0 });
        this.eng.setRoot(this.ctx.currentTime, 0);
        this.started = true;
        this.t0 = this.ctx.currentTime;
        this.stepN = 0; this.nextStep = this.ctx.currentTime + 0.1;
        this.timer = setInterval(() => this.pump(), 30);
      } catch (e) { this.ctx = null; return false; }
      return true;
    },
    pump() {
      const c = this.ctx; if (!c || c.state !== 'running' || this.paused) return;
      const horizon = c.currentTime + 0.25;
      let guard = 0;
      while (this.nextStep < horizon && guard++ < 8) {
        if (this.nextStep < c.currentTime - 0.5) { this.nextStep = c.currentTime + 0.05; }
        this.eng.step(this.nextStep, this.stepN, this.params);
        this.nextStep += STEP; this.stepN++;
      }
    },
    setMood(e, rootIdx) {
      if (!this.eng) return;
      this.params.energy = e;
      this.eng.setRoot(this.ctx.currentTime + 0.05, rootIdx);
    },
    update(fear, duck) {
      if (!this.eng) return;
      this.params.fear = fear;
      this.eng.setParams(this.ctx.currentTime, { energy: this.params.energy, fear, duck: this.muted ? 0 : (duck === undefined ? 1 : duck) });
    },
    sfx(name, a) { if (this.eng && !this.muted && this.ctx.state === 'running') this.eng.sfx(name, this.ctx.currentTime + 0.005, a); },
    setPaused(p) { this.paused = p; if (this.ctx) { if (p) this.eng.setParams(this.ctx.currentTime, { energy: this.params.energy, fear: 0, duck: 0.35 }); } },
    toggleMute() { this.muted = !this.muted; if (this.eng) this.eng.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.1); return this.muted; },
  };

  /* ------------------------------------------------------------------ offline soundtrack render */
  // arrangement: [seconds, energy, rootIdx]
  const ARRANGEMENT = [[0, 0.12, 0], [24, 0.22, 0], [48, 0.34, 4], [72, 0.46, 2], [96, 0.58, 5], [120, 0.72, 1], [144, 0.86, 3], [168, 1.0, 0], [200, 0.66, 4], [224, 0.30, 0], [248, 0.12, 0]];
  async function renderTrack(seconds, sampleRate) {
    const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    const rate = sampleRate || 44100;
    const ctx = new OAC(2, Math.floor(seconds * rate), rate);
    const eng = new Engine(ctx, ctx.destination, { offline: true, volume: 0.7, seed: 48 });
    let ai = 0;
    const steps = Math.floor(seconds / STEP);
    let lastParam = -1;
    for (let n = 0; n < steps; n++) {
      const t = n * STEP;
      while (ai + 1 < ARRANGEMENT.length && ARRANGEMENT[ai + 1][0] <= t) ai++;
      const a = ARRANGEMENT[ai], b = ARRANGEMENT[Math.min(ARRANGEMENT.length - 1, ai + 1)];
      const k = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0;
      const e = a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k);
      if (n === 0 || a[2] !== eng.rootIdx) eng.setRoot(t, a[2]);
      const fear = e > 0.8 ? 0.35 + 0.25 * Math.sin(t * 0.7) : 0.05;
      if (t - lastParam >= 0.5) { eng.setParams(t, { energy: e, fear }); lastParam = t; }
      eng.step(t, n, { energy: e });
    }
    // closing chime
    eng.sfx('check', seconds - 14);
    return ctx.startRendering();
  }

  global.DwellerAudio = { Live, Engine, renderTrack, PALETTE, F0, BEAT, STEP, hz };
})(typeof globalThis !== 'undefined' ? globalThis : this);
