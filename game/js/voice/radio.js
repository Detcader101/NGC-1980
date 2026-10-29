// Generated radio effects and real voice processing. All sources are synthesized here, with no recordings.
const NET = {
  ic:  { hp: 350, lp: 3000, drive: 1.8, hiss: 0.006, sq: 0, tail: 0, het: 0, click: 0.035 },   // headset intercom
  uhf: { hp: 420, lp: 2400, drive: 2.1, hiss: 0.020, sq: 0.05, tail: 0.09, het: 0.003, click: 0.06 },   // narrow AM radio
  fm:  { hp: 450, lp: 2300, drive: 2.2, hiss: 0.014, sq: 0.08, tail: 0.17, het: 0, click: 0.05 },   // field radio
  pa:  { hp: 400, lp: 3500, drive: 1.5, hiss: 0.004, sq: 0, tail: 0, het: 0, click: 0.0 },   // the flight deck loudspeaker (5MC)
};
export const NET_KIND = NET;

export class RadioBed {
  constructor(sfx) { this.sfx = sfx; this.duck = 1; this._base = null; this._ducks = 0; this.tails = new Set(); }
  get ctx() { return this.sfx && this.sfx.ctx; }
  // a short burst of the shared noise buffer through a band-pass (clicks, squelch, tails)
  burst(t, dur, f, q, vol, out) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.sfx.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.004, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  click(t, vol, out) {   // the PTT: a pulse a few ms long (high-passed so it reads as a click, not a thump)
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 1400;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.02);
  }
  // key the net: returns a handle for unkey(). vol = the line's gain 0..1
  key(net, vol = 1) {
    const c = this.ctx; if (!c || !this.sfx.noise) return null;
    const N = NET[net] || NET.uhf, t = c.currentTime + 0.01, out = c.createGain(); out.gain.value = vol; out.connect(this.sfx.voiceMaster || this.sfx.master);
    if (N.click) this.click(t, N.click, out);
    if (N.sq) this.burst(t, 0.05, 1800, 0.6, N.sq, out);   // the squelch opening
    const s = c.createBufferSource(); s.buffer = this.sfx.noise; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.4;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(N.hiss, t + 0.05);
    s.connect(bp); bp.connect(g); g.connect(out); s.start(t, Math.random());
    let het = null;
    if (N.het) { het = c.createOscillator(); het.frequency.value = 900 + Math.random() * 500; const hg = c.createGain(); hg.gain.value = N.het; het.connect(hg); hg.connect(out); het.start(t); }
    let hum = null;
    if (net === 'ic') { hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 400; const hl = c.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 600; const hg = c.createGain(); hg.gain.value = 0.004; hum.connect(hl); hl.connect(hg); hg.connect(out); hum.start(t); }   // 400 Hz aircraft AC bus whine on the ICS
    return { net, N, out, s, g, het, hum, t0: t };
  }
  unkey(h, cut = false) {
    if (!h) return; const c = this.ctx; if (!c) return; const t = c.currentTime + 0.01, N = h.N;
    if (cut) { h.s.stop(); h.het?.stop(); h.hum?.stop(); h.out.disconnect(); return; }
    this.tails.add(h);
    h.g.gain.setTargetAtTime(0, t, 0.01);
    if (N.tail) this.burst(t + 0.01, N.tail, 2200, 0.35, h.net === 'fm' ? 0.14 : 0.06, h.out);   // FM: the "kssh" squelch tail
    if (N.click) this.click(t, N.click * 0.7, h.out);
    const end = t + Math.max(0.05, N.tail) + 0.05;
    h.s.stop(end + 0.05); h.het?.stop(end); h.hum?.stop(end);
    setTimeout(() => { try { h.out.disconnect(); this.tails.delete(h); } catch (e) {} }, (end - c.currentTime + 0.3) * 1000);
  }
  stop() { for (const h of this.tails) h.out.disconnect(); this.tails.clear(); }
  // ducking: the game's master bus dips under a voice (engines, rotor, guns) and comes back after
  duckOn() { const m = this.sfx.master; if (!m) return; if (this._ducks++ === 0) { this._base ??= m.gain.value; m.gain.cancelScheduledValues(this.ctx.currentTime); m.gain.setTargetAtTime(this._base * this.duck, this.ctx.currentTime, 0.06); } }
  duckOff(cut = false) { const m = this.sfx.master; if (!m || this._ducks <= 0) return; if (--this._ducks === 0 && this._base !== null) m.gain.setTargetAtTime(this._base, this.ctx.currentTime, cut ? 0.025 : 0.15); }
  // the radio processing chain for a synthetic voice: band-pass, drive (saturation), make-up gain
  chain(net, out) {
    const c = this.ctx, N = NET[net] || NET.uhf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = N.hp; hp.Q.value = 0.707;
    const hp2 = c.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = N.hp; hp2.Q.value = 0.707;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = N.lp; lp.Q.value = 0.707;
    const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1600; pk.gain.value = 3; pk.Q.value = 0.9;
    const ws = c.createWaveShaper(); ws.curve = satCurve(N.drive); ws.oversample = '2x';
    const g = c.createGain(); g.gain.value = 0.6 / Math.sqrt(N.drive);
    // A second low-pass AFTER clipping also removes the new high harmonics; 24 dB/octave band edges.
    const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = N.lp; lp2.Q.value = 0.707;
    hp.connect(hp2); hp2.connect(lp); lp.connect(pk); pk.connect(ws); ws.connect(lp2); lp2.connect(g); g.connect(out);
    return hp;
  }
}
const _curves = new Map();
function satCurve(k) {
  if (_curves.has(k)) return _curves.get(k);
  const n = 1024, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); }
  _curves.set(k, a); return a;
}

// Seconds for silent/subtitle-only playback. Audible playback ends on the actual AudioBufferSource event.
export function lineSeconds(text, rate = 1) { return (0.32 * text.trim().split(/\s+/).length + 0.25) / rate; }

// a RUNAWAY data burst: tone steps [Hz, ms]
export function signal(ctx, steps, vol, dest) {
  const t0 = ctx.currentTime + 0.02, o = ctx.createOscillator(); o.type = 'sine';
  const o2 = ctx.createOscillator(); o2.type = 'square'; const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
  const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g2.connect(g); g.connect(bp); bp.connect(dest);
  let t = t0;
  for (const [f, ms] of steps) { o.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f * 0.5, t); g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + ms / 1000 - 0.004); g.gain.linearRampToValueAtTime(0, t + ms / 1000); t += ms / 1000 + 0.012; }
  o.start(t0); o2.start(t0); o.stop(t + 0.05); o2.stop(t + 0.05);
  return { duration: t - t0 + 0.07, stop() { try { o.stop(); o2.stop(); } catch (_) {} g.disconnect(); bp.disconnect(); } };
}
