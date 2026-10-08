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
  boom(big = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1500 * big, t); f.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(0.6 * big, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.85);
  }
}
