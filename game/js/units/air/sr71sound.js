// The SR-71A, heard (WebAudio, synthesised on the game's Sfx bus like tomcatsound.js; no samples):
// - two J58s: a deep, hard-edged roar (a big single-spool turbojet) with each engine's turbine whine; in afterburner the
//   ragged low rumble and the crackle of the shock diamonds (loudest at low altitude, from outside);
// - the start cart: the AG330 / "Buick" cart's two big-block V8s driving one shaft, a throaty burble that winds up while
//   it cranks a J58, then the TEB (triethylborane) light-off whoomp;
// - the inlet: duct rumble at high Mach (felt in the cockpit), and the UNSTART - a bang "like a train wreck", the airframe
//   slamming sideways - then the restart;
// - wind with KEAS (subsonic: a roar; at Mach 3 in the pressure suit, quiet: the boundary layer hiss only), the drag chute
//   popping out of its compartment, the gear;
// - 1980 warnings are TONES AND LIGHTS (no voice): the master caution chime, a steady tone for an unstart / engine fire,
//   the defensive systems' radar warning (a missile in the air: a fast warble).
export function createSR71Sound(sfx) {
  let ready = false, /** @type {any} */ N = null;
  function init() {
    if (ready || !sfx || !sfx.ctx || !sfx.noise) return ready; const c = sfx.ctx;
    const noise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random() * 1.2); return fl; };
    const gain = (src, v = 0) => { const g = c.createGain(); g.gain.value = v; src.connect(g); return g; };
    const osc = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    N = /** @type {any} */ ({});
    N.muff = c.createBiquadFilter(); N.muff.type = 'lowpass'; N.muff.frequency.value = 18000;
    N.out = c.createGain(); N.out.gain.value = 0; N.muff.connect(N.out); N.out.connect(sfx.master);
    N.roarF = noise('bandpass', 220, 0.5); N.roar = gain(N.roarF); N.roar.connect(N.muff);
    N.lowF = noise('lowpass', 80); N.low = gain(N.lowF); N.low.connect(N.muff);
    N.abF = noise('lowpass', 130); N.ab = gain(N.abF); N.ab.connect(N.muff);
    N.crkF = noise('bandpass', 700, 1.0); N.crk = gain(N.crkF); N.crk.connect(N.muff);
    N.crkL = osc('square', 11); N.crkD = gain(N.crkL); N.crkD.connect(N.crk.gain);   // the diamonds' ragged crackle
    N.windF = noise('highpass', 800); N.wind = gain(N.windF); N.wind.connect(N.muff);
    N.ductF = noise('lowpass', 55); N.duct = gain(N.ductF); N.duct.connect(N.muff);      // the inlet at high Mach
    N.wh = [0, 1].map(() => { const o = osc('sawtooth', 300), f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9; o.connect(f); const g = gain(f); g.connect(N.muff); return { o, f, g }; });
    // the start cart: two V8s (firing ~ rpm/60 x 4 per engine) through an exhaust-ish low-pass
    N.v8 = osc('sawtooth', 30); N.v8b = osc('sawtooth', 30.6); N.v8F = c.createBiquadFilter(); N.v8F.type = 'lowpass'; N.v8F.frequency.value = 320; N.v8.connect(N.v8F); N.v8b.connect(N.v8F); N.v8G = gain(N.v8F); N.v8G.connect(N.muff);
    N.tone = osc('square', 1000); N.toneF = c.createBiquadFilter(); N.toneF.type = 'lowpass'; N.toneF.frequency.value = 2400; N.tone.connect(N.toneF); N.toneG = gain(N.toneF); N.toneG.connect(sfx.master);
    N.rwr = osc('triangle', 1800); N.rwrG = gain(N.rwr); N.rwrG.connect(sfx.master);
    ready = true; return ready;
  }
  const S = {
    // o: { n:[2], ab:[2], keas, mach, sigma, inside, canopy 0..1, on 0..1, cart 0..1 (cranking 1, idling .3), unstart,
    //      warn (0 none | 1 caution tone | 2 steady tone), rwr 0 | 1 search | 2 launch }
    update(o) {
      if (!init()) return; const c = sfx.ctx, t = c.currentTime, sp = (p, v, k = 0.08) => p.setTargetAtTime(v, t, k), on = o.on;
      const n = (o.n[0] + o.n[1]) / 2, run = Math.max(0, (n - 0.2) / 0.8), ab = Math.max(o.ab[0], o.ab[1]), dens = Math.min(1, 0.25 + o.sigma);
      const fade = o.inside ? 0.55 : 1;   // in the pressure suit's helmet the engines are far off; outside they are loud
      sp(N.out.gain, on, 0.1);
      sp(N.roar.gain, (0.05 + 0.32 * run * run) * dens * fade); sp(N.roarF.frequency, 160 + 600 * run);
      sp(N.low.gain, (0.1 * run + 0.4 * ab) * dens * fade); sp(N.ab.gain, 0.55 * ab * dens * fade);
      sp(N.crk.gain, 0.12 * ab * dens * (o.inside ? 0.2 : 1)); sp(N.crkD.gain, 0.12 * ab * dens * (o.inside ? 0.2 : 1));
      sp(N.wind.gain, Math.min(0.35, (o.keas / 450) ** 2 * 0.35) * (o.inside ? (o.mach > 1.2 ? 0.25 : 0.7) + o.canopy : 1)); sp(N.windF.frequency, 600 + o.keas * 4);
      sp(N.duct.gain, 0.25 * Math.max(0, Math.min(1, (o.mach - 1.6) / 1.2)) * (o.inside ? 1 : 0.4) + (o.unstart ? 0.5 : 0), 0.15);
      for (let k = 0; k < 2; k++) { const e = o.n[k], w = N.wh[k]; sp(w.o.frequency, 160 + 760 * e + k * 4); sp(w.f.frequency, 900 + 2300 * e); sp(w.g.gain, 0.035 * Math.min(1, e * 1.6) * fade); }
      const cr = o.cart || 0; sp(N.v8G.gain, 0.09 * cr, 0.3); sp(N.v8.frequency, 18 + 34 * cr + 10 * n, 0.4); sp(N.v8b.frequency, 18.5 + 34 * cr + 10 * n, 0.4);
      sp(N.muff.frequency, o.inside ? 1100 + 4000 * o.canopy : 18000);
      let tone = 0, f = 1000;
      if (o.warn === 2) { tone = 0.045; f = 760; } else if (o.warn === 1) { tone = (t % 1) < 0.25 ? 0.035 : 0; f = 900; }
      sp(N.toneG.gain, on >= 0.99 ? tone : 0, 0.01); sp(N.tone.frequency, f, 0.005);
      const rw = o.rwr === 2 ? 0.05 : o.rwr === 1 ? ((t % 1.2) < 0.15 ? 0.03 : 0) : 0;
      sp(N.rwrG.gain, on >= 0.99 ? rw : 0, 0.01); sp(N.rwr.frequency, o.rwr === 2 ? 1700 + 900 * Math.abs(Math.sin(t * 30)) : 1200, 0.005);
    },
    unstart() { if (!sfx || !sfx.ctx) return; sfx.boom?.(1.0); sfx.noiseBurst?.(180, 40, 0.9, 0.7); setTimeout(() => sfx.noiseBurst?.(900, 120, 0.25, 0.35), 90); },
    lightoff() { sfx?.noiseBurst?.(420, 70, 0.6, 0.3); },   // the TEB's green flash and whoomp
    chute() { sfx?.noiseBurst?.(1600, 300, 0.25, 0.3); setTimeout(() => sfx?.noiseBurst?.(300, 60, 0.5, 0.35), 350); },
    gear() { sfx?.noiseBurst?.(700, 160, 0.4, 0.2); },
    chime() { sfx?.blip?.(880, 870, 0.18, 'sine', 0.07); setTimeout(() => sfx?.blip?.(660, 650, 0.25, 'sine', 0.07), 190); },
    silence() { if (ready) { const t = sfx.ctx.currentTime; for (const g of [N.out.gain, N.toneG.gain, N.rwrG.gain]) g.setTargetAtTime(0, t, 0.03); } },
  };
  return S;
}
