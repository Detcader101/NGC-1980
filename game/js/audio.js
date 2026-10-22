export class Sfx {
  constructor() { this.ctx = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = this.ctx = new C();
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 200;
    this.engG = c.createGain(); this.engG.gain.value = 0;
    src.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); src.start();
  }
  engine(l) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engG.gain.setTargetAtTime(l * 0.35, t, 0.05); this.engF.frequency.setTargetAtTime(180 + l * 600, t, 0.05);
  }
  blip(f0, f1, dur, type = 'square', vol = 0.15) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  shot() { this.blip(900, 200, 0.12); }
  enemyShot() { this.blip(300, 120, 0.2, 'sawtooth', 0.1); }
  pickup() { this.blip(400, 1200, 0.25, 'triangle', 0.2); }
  dock() { this.blip(200, 800, 0.6, 'sine', 0.25); }
  rocket() { this.noiseBurst(2400, 300, 0.35, 0.25); this.blip(500, 1400, 0.25, 'sawtooth', 0.05); }
  bombDrop() { this.blip(1600, 600, 0.9, 'sine', 0.05); }
  flak() { this.noiseBurst(900, 120, 0.25, 0.18); }
  alarm() { if (!this.ctx) return; const t = this.ctx.currentTime; if (t - (this._al || 0) < 3) return; this._al = t; this.blip(880, 660, 0.18, 'square', 0.08); setTimeout(() => this.blip(880, 660, 0.18, 'square', 0.08), 260); }
  noiseBurst(f0, f1, dur, vol) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  boom(big = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1500 * big, t); f.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(0.6 * big, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.85);
  }

  // ---------------------------------------------------------------- HORNET
  // jet: two engines' roar (band-passed noise) + turbine whine (saw through a band-pass, pitch follows rpm),
  // afterburner rumble (low noise), wind with airspeed; muffled when you are in the cockpit
  jetInit() {
    if (!this.ctx || this.jg) return; const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.jRoarF = c.createBiquadFilter(); this.jRoarF.type = 'bandpass'; this.jRoarF.Q.value = 0.7;
    this.jRoar = c.createGain(); this.jRoar.gain.value = 0; src.connect(this.jRoarF); this.jRoarF.connect(this.jRoar);
    const src2 = c.createBufferSource(); src2.buffer = this.noise; src2.loop = true;
    this.jAbF = c.createBiquadFilter(); this.jAbF.type = 'lowpass'; this.jAbF.frequency.value = 160;
    this.jAb = c.createGain(); this.jAb.gain.value = 0; src2.connect(this.jAbF); this.jAbF.connect(this.jAb);
    const src3 = c.createBufferSource(); src3.buffer = this.noise; src3.loop = true;
    this.jWindF = c.createBiquadFilter(); this.jWindF.type = 'highpass'; this.jWindF.frequency.value = 900;
    this.jWind = c.createGain(); this.jWind.gain.value = 0; src3.connect(this.jWindF); this.jWindF.connect(this.jWind);
    this.jWhine = c.createOscillator(); this.jWhine.type = 'sawtooth'; this.jWhineF = c.createBiquadFilter(); this.jWhineF.type = 'bandpass'; this.jWhineF.Q.value = 8;
    this.jWhineG = c.createGain(); this.jWhineG.gain.value = 0; this.jWhine.connect(this.jWhineF); this.jWhineF.connect(this.jWhineG);
    this.jMuff = c.createBiquadFilter(); this.jMuff.type = 'lowpass'; this.jMuff.frequency.value = 20000;
    this.jg = c.createGain(); this.jg.gain.value = 1;
    for (const n of [this.jRoar, this.jAb, this.jWind, this.jWhineG]) n.connect(this.jMuff);
    this.jMuff.connect(this.jg); this.jg.connect(this.master);
    // seeker tone: AIM-9 growl (low, warbling) and the high lock tone
    this.sk = c.createOscillator(); this.sk.type = 'triangle'; this.skLfo = c.createOscillator(); this.skLfo.frequency.value = 11; this.skLfoG = c.createGain(); this.skLfoG.gain.value = 0;
    this.skLfo.connect(this.skLfoG); this.skLfoG.connect(this.sk.frequency); this.skG = c.createGain(); this.skG.gain.value = 0; this.sk.connect(this.skG); this.skG.connect(this.master);
    for (const s of [src, src2, src3]) s.start(); this.jWhine.start(); this.sk.start(); this.skLfo.start();
  }
  // n: mean rpm 0..1.05, ab 0..1, spd m/s true airspeed, inside: in the cockpit, on: jet is the player's aircraft
  jet(n, ab, spd, inside, on = true) {
    if (!this.ctx) return; this.jetInit(); const t = this.ctx.currentTime, k = on ? 1 : 0, sp = (v, x) => v.setTargetAtTime(x, t, 0.08);
    const run = Math.max(0, (n - 0.2) / 0.85);
    sp(this.jRoar.gain, k * (0.05 + 0.32 * run * run)); sp(this.jRoarF.frequency, 300 + 900 * run);
    sp(this.jWhineG.gain, k * 0.05 * Math.min(1, n * 1.5) * (inside ? 1.4 : 0.8)); sp(this.jWhine.frequency, 220 + 900 * n); sp(this.jWhineF.frequency, 1200 + 2800 * n);
    sp(this.jAb.gain, k * 0.55 * ab); sp(this.jWind.gain, k * Math.min(0.35, (spd / 180) ** 2 * 0.35)); sp(this.jWindF.frequency, 700 + spd * 6);
    sp(this.jMuff.frequency, inside ? 1500 : 18000);
  }
  // 0 = off, 1 = growl (seeker sees a heat source), 2 = lock
  seeker(mode) {
    if (!this.ctx || !this.sk) return; const t = this.ctx.currentTime;
    this.skG.gain.setTargetAtTime(mode ? 0.05 : 0, t, 0.03); this.sk.frequency.setTargetAtTime(mode === 2 ? 1250 : 420, t, 0.02); this.skLfoG.gain.setTargetAtTime(mode === 1 ? 120 : 0, t, 0.02);
  }
  missile() { this.noiseBurst(3000, 200, 0.9, 0.35); this.blip(300, 120, 0.6, 'sawtooth', 0.06); }
  jetGun(on) {   // the M61's buzz-saw while the trigger is held
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (!this.gunO) { this.gunO = c.createOscillator(); this.gunO.type = 'square'; this.gunO.frequency.value = 100; this.gunN = c.createGain(); this.gunN.gain.value = 0; this.gunO.connect(this.gunN); this.gunN.connect(this.master); this.gunO.start(); }
    this.gunN.gain.setTargetAtTime(on ? 0.09 : 0, t, 0.02);
  }
  thump(v = 0.5) { this.noiseBurst(220, 60, 0.3, 0.4 * v); }
  catShot() { this.noiseBurst(500, 90, 2.0, 0.45); }
  // "Bitching Betty": the Hornet's voice warnings, through the browser's speech synthesis (rate-limited per message)
  betty(msg, every = 6) {
    try {
      const now = performance.now() / 1000; this._bt = this._bt || {};
      if (now - (this._bt[msg] || -1e9) < every || !window.speechSynthesis || this.muteVoice) return;
      if (speechSynthesis.speaking && now - (this._btAny || 0) < 1.2) return;
      this._bt[msg] = now; this._btAny = now;
      const u = new SpeechSynthesisUtterance(msg); u.rate = 1.15; u.pitch = 1.1; u.volume = 0.8;
      const v = speechSynthesis.getVoices().find(v => /female|zira|samantha|susan|hazel|aria|jenny/i.test(v.name)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
      if (v) u.voice = v; speechSynthesis.speak(u);
    } catch (e) {}
  }
}
