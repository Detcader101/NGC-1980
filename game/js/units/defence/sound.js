// Synthesised sounds for the air defence units (WebAudio on the game's Sfx instance; no samples). Everything is a
// no-op until the game's audio context exists. One-shots are scaled by the caller's distance factor; the two
// continuous voices (the cockpit lock / launch warning and the nearest LANCE's hum) are single shared voices.
export function createDefenceSound(sfx) {
  const S = { lockV: null, laserV: null };
  const ok = () => sfx && sfx.ctx && sfx.master;
  function noiseSrc(c) { const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true; return s; }

  // a burst of automatic fire: band-passed noise chopped by a square wave at the weapon's firing rate, with a low
  // body tone. rate in rounds / s, dur in s, k = loudness (distance already in it), tone = body pitch
  S.burst = (rate, dur, k, { band = 1400, tone = 70, q = 0.9 } = {}) => {
    if (!ok() || k < 0.02) return; const c = sfx.ctx, t = c.currentTime;
    const n = noiseSrc(c), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = band; f.Q.value = q;
    const chop = c.createGain(); chop.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rate;
    const depth = c.createGain(); depth.gain.value = 0.5; lfo.connect(depth); depth.connect(chop.gain);
    const bias = c.createConstantSource ? c.createConstantSource() : null; if (bias) { bias.offset.value = 0.5; bias.connect(chop.gain); bias.start(t); bias.stop(t + dur + 0.1); }
    const body = c.createOscillator(); body.type = 'sawtooth'; body.frequency.value = tone; const bg = c.createGain(); bg.gain.value = 0.35;
    body.connect(bg); bg.connect(chop);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * k, t + 0.02); g.gain.setValueAtTime(0.32 * k, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);
    n.connect(f); f.connect(chop); chop.connect(g); g.connect(sfx.master);
    n.start(t, Math.random()); lfo.start(t); body.start(t);
    for (const s of [n, lfo, body]) s.stop(t + dur + 0.25);
  };
  // a single heavy round (airburst gun, cannon)
  S.thud = k => { if (!ok() || k < 0.02) return; sfx.noiseBurst(500, 70, 0.22, 0.42 * k); sfx.blip(140, 45, 0.15, 'sine', 0.25 * k); };
  // electric motor whine: rotary barrels spinning up, a turret slewing hard
  S.whine = (k, f0 = 220, f1 = 900, dur = 0.5) => { if (!ok() || k < 0.02) return; sfx.blip(f0, f1, dur, 'sawtooth', 0.035 * k); };
  // a missile leaving its tube: a whoomp and a long tearing hiss
  S.launch = k => { if (!ok() || k < 0.02) return; sfx.noiseBurst(250, 60, 0.35, 0.5 * k); sfx.noiseBurst(3200, 400, 1.4, 0.32 * k); };
  // ---- the cockpit warning: mode 0 off, 1 being locked (beeps, faster with p), 2 locked (steady warble), 3 launch (fast high warble)
  S.warn = (mode, p = 0) => {
    if (!ok()) return; const c = sfx.ctx, t = c.currentTime;
    if (!S.lockV) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1000;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const g = c.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(sfx.master); o.start();
      S.lockV = { o, g, ph: 0, last: t };
    }
    const V = S.lockV, dt = Math.min(0.1, t - V.last); V.last = t;
    let on = 0, fr = 1000;
    if (mode === 1) { V.ph += dt * (2 + 8 * p); on = (V.ph % 1) < 0.35 ? 1 : 0; fr = 900; }
    else if (mode === 2) { V.ph += dt * 6; on = 1; fr = (V.ph % 1) < 0.5 ? 1050 : 950; }
    else if (mode === 3) { V.ph += dt * 14; on = 1; fr = (V.ph % 1) < 0.5 ? 1500 : 1250; }
    V.g.gain.setTargetAtTime(on * 0.045, t, 0.006); V.o.frequency.setTargetAtTime(fr, t, 0.004);
  };
  // ---- the LANCE: a hum that climbs through the charge, then a harsh crackling buzz while the beam is on
  // st: 0 idle, 1 charging (p 0..1), 2 firing; k = distance loudness
  S.laser = (st, p, k) => {
    if (!ok()) return; const c = sfx.ctx, t = c.currentTime;
    if (!S.laserV) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 120;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 6;
      const n = noiseSrc(c), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
      const ng = c.createGain(); ng.gain.value = 0; const g = c.createGain(); g.gain.value = 0;
      o.connect(lp); o2.connect(lp); lp.connect(g); n.connect(bp); bp.connect(ng); ng.connect(g); g.connect(sfx.master);
      o.start(); o2.start(); n.start();
      S.laserV = { o, o2, lp, ng, g };
    }
    const L = S.laserV, sp = (prm, v, tc = 0.04) => prm.setTargetAtTime(v, t, tc);
    if (st === 0 || k < 0.02) { sp(L.g.gain, 0, 0.15); return; }
    if (st === 1) { sp(L.o.frequency, 55 + 260 * p * p); sp(L.o2.frequency, 110 + 520 * p * p); sp(L.lp.frequency, 400 + 2200 * p); sp(L.ng.gain, 0.02 * p); sp(L.g.gain, (0.03 + 0.07 * p) * k); }
    else { sp(L.o.frequency, 330 + Math.random() * 25, 0.01); sp(L.o2.frequency, 660, 0.02); sp(L.lp.frequency, 2800); sp(L.ng.gain, 0.5 + Math.random() * 0.3, 0.01); sp(L.g.gain, 0.12 * k); }
  };
  // steam venting from the LANCE radiators
  S.vent = k => { if (!ok() || k < 0.02) return; sfx.noiseBurst(5000, 1500, 1.2, 0.12 * k); };
  S.silence = () => { S.warn(0); S.laser(0, 0, 0); };
  return S;
}
