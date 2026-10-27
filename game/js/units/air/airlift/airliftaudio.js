// airliftaudio.js - the airlift's own sounds, synthesised on the game's bus (audio.js style, no samples):
//   hook()      the cargo hook's keeper snapping shut on the apex (a short metallic double click + clunk)
//   release()   the hook opening under load (solenoid thunk, the apex ring dropping clear with a clatter)
//   strain(k)   the nylon pendant taking a load: a low creak whose level follows the tension (0..1+), heard aboard
//   crack(d)    a G-11A (or the extraction chute) opening: a sharp canvas crack and a whump, faded with distance d (m)
//   thud(d, k)  the platform landing on its honeycomb (a dull crunch), faded with distance
//   rollers(k)  the platform running aft on the roller conveyor (a rising rumble while k > 0)
// The rotor's own load is the Huey's sound (audio.js huey(): blade slap and torque rise with thrust / weight).
export function createAirliftAudio(sfx) {
  const A = {};
  let strainG = null, strainF = null, rollG = null, rollF = null;
  const ok = () => !!(sfx && sfx.ctx && sfx.master && sfx.noise);
  function burst(c, t, f0, f1, dur, vol, type = 'bandpass', q = 1.2) {
    const s = c.createBufferSource(); s.buffer = sfx.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(sfx.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone(c, t, f0, f1, dur, vol, type = 'triangle') {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(sfx.master); o.start(t); o.stop(t + dur + 0.02);
  }
  A.hook = () => {
    if (!ok()) return; const c = sfx.ctx, t = c.currentTime;
    burst(c, t, 3200, 2400, 0.04, 0.35, 'bandpass', 6); burst(c, t + 0.07, 2800, 1800, 0.05, 0.3, 'bandpass', 6);   // click-click of the keeper
    tone(c, t + 0.06, 340, 180, 0.12, 0.25, 'square'); burst(c, t + 0.06, 600, 150, 0.14, 0.25, 'lowpass');          // the clunk
  };
  A.release = () => {
    if (!ok()) return; const c = sfx.ctx, t = c.currentTime;
    tone(c, t, 160, 90, 0.08, 0.3, 'square'); burst(c, t, 900, 200, 0.1, 0.3, 'lowpass');                          // solenoid thunk
    for (let i = 0; i < 4; i++) burst(c, t + 0.18 + i * 0.07 + Math.random() * 0.03, 4200, 2600, 0.035, 0.12, 'bandpass', 8);   // the ring and links clattering clear
  };
  A.strain = (k, aboard = true) => {
    if (!ok()) return; const c = sfx.ctx;
    if (!strainG) {
      const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true;
      strainF = c.createBiquadFilter(); strainF.type = 'bandpass'; strainF.Q.value = 9; strainF.frequency.value = 180;
      strainG = c.createGain(); strainG.gain.value = 0; s.connect(strainF); strainF.connect(strainG); strainG.connect(sfx.master); s.start(0, Math.random());
    }
    const t = c.currentTime, v = aboard ? Math.min(0.12, Math.max(0, k - 0.15) * 0.08) : 0;
    strainG.gain.setTargetAtTime(v, t, 0.15); strainF.frequency.setTargetAtTime(140 + 120 * Math.min(2, k), t, 0.2);
  };
  A.crack = (d = 0) => {
    if (!ok()) return; const c = sfx.ctx, t = c.currentTime + d / 340, k = Math.max(0, 1 - d / 900);
    if (k <= 0) return;
    burst(c, t, 2600, 900, 0.12, 0.55 * k, 'highpass', 0.7);   // the crack of the canopy filling
    burst(c, t + 0.03, 400, 60, 0.6, 0.6 * k, 'lowpass');      // the whump
  };
  A.thud = (d = 0, power = 1) => {
    if (!ok()) return; const c = sfx.ctx, t = c.currentTime + d / 340, k = Math.max(0, 1 - d / 700) * Math.min(1.5, power);
    if (k <= 0) return;
    burst(c, t, 300, 40, 0.5, 0.7 * k, 'lowpass'); burst(c, t, 1500, 400, 0.25, 0.25 * k, 'bandpass', 0.8);   // the honeycomb crushing
  };
  A.rollers = (k, d = 0) => {
    if (!ok()) return; const c = sfx.ctx;
    if (!rollG) {
      const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true;
      rollF = c.createBiquadFilter(); rollF.type = 'bandpass'; rollF.Q.value = 2; rollF.frequency.value = 120;
      rollG = c.createGain(); rollG.gain.value = 0; s.connect(rollF); rollF.connect(rollG); rollG.connect(sfx.master); s.start(0, Math.random());
    }
    const t = c.currentTime, v = Math.max(0, 1 - d / 400) * Math.min(1, k) * 0.35;
    rollG.gain.setTargetAtTime(v, t, 0.05); rollF.frequency.setTargetAtTime(90 + 220 * Math.min(1, k), t, 0.1);
  };
  A.silence = () => { if (!ok()) return; const t = sfx.ctx.currentTime; if (strainG) strainG.gain.setTargetAtTime(0, t, 0.05); if (rollG) rollG.gain.setTargetAtTime(0, t, 0.05); };
  return A;
}
