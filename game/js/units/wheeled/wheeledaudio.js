// wheeledaudio.js - synthesised WebAudio for the wheeled vehicles (no samples), in the style of audio.js.
//   const A = new WheeledAudio(ctx, destination); A.setEnabled(true);
//   each frame: A.update(look, sim, dt, inside, distance = 0)   (look = modelkit.lookFrom(sim))
// Character by engine type (spec.engine + spec.id):
//   petrol four (M151, Land Rover, Hilux, Lada): a pulse train at the firing frequency (rpm/60 x 2), its harmonics
//     filtered by load (throttle opens the filter, exhaust bark), carburettor intake hiss at full throttle
//   air-cooled flat four (Beetle): the same pulses rougher, plus the cooling-fan whine and valve-train clatter
//   multifuel diesel six (M35 LDT-465): firing at rpm/60 x 3, combustion clatter (noise bursts on every firing, hardest
//     at low rpm / high load), the turbo whistle rising with boost, the governor's surge
// Driveline: gear whine (mesh frequency ~ 23 teeth x output shaft speed, loudest in the low gears and the M35's transfer
// case), tyres: NDT military tread howl on tarmac (tread pitch x wheel speed), road roar, squeal when sliding on hard
// surfaces, gravel crunch on dirt, sand hiss, mud splosh, water wash when wading; wind; the horn (M151 / M35 military
// electric horn, civilian twin-tone); starter whirr (cranking with compression beats); stall cough.
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class WheeledAudio {
  constructor(ctx, dest) {
    this.ctx = ctx; this.dest = dest || ctx.destination; this.enabled = false; this.spec = null;
    const c = ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.out = c.createGain(); this.out.gain.value = 0; this.muff = c.createBiquadFilter(); this.muff.type = 'lowpass'; this.muff.frequency.value = 16000;
    this.muff.connect(this.out); this.out.connect(this.dest);
    const noise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; s.connect(fl); s.start(0, Math.random() * 1.5); return fl; };
    const gain = (src, v = 0, to = this.muff) => { const g = c.createGain(); g.gain.value = v; src.connect(g); g.connect(to); return g; };
    // engine: a pulse-train periodic wave (sharp firing pulses), through a load-dependent lowpass
    const N = 32, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k++) { re[k] = Math.exp(-k * 0.12) * (k % 2 ? 1 : 0.7); im[k] = Math.exp(-k * 0.2) * 0.3; }
    this.pulse = c.createPeriodicWave(re, im);
    this.eOsc = c.createOscillator(); this.eOsc.setPeriodicWave(this.pulse);
    this.eLP = c.createBiquadFilter(); this.eLP.type = 'lowpass'; this.eLP.frequency.value = 400; this.eLP.Q.value = 2.5;
    this.eOsc.connect(this.eLP); this.eG = gain(this.eLP);
    this.e2 = c.createOscillator(); this.e2.type = 'sawtooth'; this.e2LP = c.createBiquadFilter(); this.e2LP.type = 'lowpass'; this.e2LP.frequency.value = 900; this.e2.connect(this.e2LP); this.e2G = gain(this.e2LP);   // 2nd order / exhaust bark
    this.sub = c.createOscillator(); this.sub.type = 'sine'; this.subG = gain(this.sub);                                // crank-speed rumble
    // combustion clatter / roughness: noise gated at the firing frequency
    this.clF = noise('bandpass', 1800, 1.4); this.clG = c.createGain(); this.clG.gain.value = 0; this.clF.connect(this.clG); this.clG.connect(this.muff);
    this.clLFO = c.createOscillator(); this.clLFO.setPeriodicWave(this.pulse); this.clD = c.createGain(); this.clD.gain.value = 0; this.clLFO.connect(this.clD); this.clD.connect(this.clG.gain);
    this.intake = noise('bandpass', 1200, 0.8); this.inG = gain(this.intake);                                           // intake hiss
    this.fan = c.createOscillator(); this.fan.type = 'triangle'; this.fanG = gain(this.fan);                            // Beetle cooling fan / truck fan
    this.turbo = c.createOscillator(); this.turbo.type = 'sine'; this.turboG = gain(this.turbo);                        // LDT-465 turbo whistle
    // driveline and tyres
    this.whine = c.createOscillator(); this.whine.type = 'triangle'; this.whineG = gain(this.whine);
    this.howl = c.createOscillator(); this.howl.type = 'sawtooth'; this.howlBP = c.createBiquadFilter(); this.howlBP.type = 'bandpass'; this.howlBP.Q.value = 6; this.howl.connect(this.howlBP); this.howlG = gain(this.howlBP);
    this.roar = noise('lowpass', 300); this.roarG = gain(this.roar);
    this.squeal = noise('bandpass', 1400, 9); this.sqG = gain(this.squeal);
    this.sqLFO = c.createOscillator(); this.sqLFO.frequency.value = 23; this.sqD = c.createGain(); this.sqD.gain.value = 0; this.sqLFO.connect(this.sqD); this.sqD.connect(this.squeal.frequency);
    this.gravel = noise('highpass', 2500); this.grG = c.createGain(); this.grG.gain.value = 0; this.gravel.connect(this.grG); this.grG.connect(this.muff);
    this.grLFO = c.createOscillator(); this.grLFO.type = 'square'; this.grLFO.frequency.value = 37; this.grD = c.createGain(); this.grD.gain.value = 0; this.grLFO.connect(this.grD); this.grD.connect(this.grG.gain);
    this.mud = noise('lowpass', 180); this.mudG = gain(this.mud);
    this.water = noise('bandpass', 700, 0.6); this.waterG = gain(this.water);
    this.wind = noise('highpass', 600); this.windG = gain(this.wind);
    // starter and horn bypass the muffle partly
    this.starter = c.createOscillator(); this.starter.type = 'sawtooth'; this.stLP = c.createBiquadFilter(); this.stLP.type = 'lowpass'; this.stLP.frequency.value = 900; this.starter.connect(this.stLP); this.stG = gain(this.stLP);
    this.stLFO = c.createOscillator(); this.stLFO.type = 'square'; this.stD = c.createGain(); this.stD.gain.value = 0; this.stLFO.connect(this.stD); this.stD.connect(this.stG.gain);
    this.hornA = c.createOscillator(); this.hornA.type = 'square'; this.hornB = c.createOscillator(); this.hornB.type = 'square';
    this.hornBP = c.createBiquadFilter(); this.hornBP.type = 'bandpass'; this.hornBP.Q.value = 2; this.hornBP.frequency.value = 900;
    this.hornA.connect(this.hornBP); this.hornB.connect(this.hornBP); this.hornG = gain(this.hornBP, 0, this.out);
    for (const o of [this.eOsc, this.e2, this.sub, this.clLFO, this.fan, this.turbo, this.whine, this.howl, this.sqLFO, this.grLFO, this.starter, this.stLFO, this.hornA, this.hornB]) o.start();
    this._wasRunning = false; this._gear = 0;
  }
  setEnabled(on) { this.enabled = on; if (this.ctx.state === 'suspended' && on) this.ctx.resume(); const t = this.ctx.currentTime; this.out.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.1); }
  // a one-shot noise thump / clunk (gear change, impact, stall cough)
  thump(f0, f1, dur, vol = 0.2, type = 'lowpass') {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl); fl.connect(g); g.connect(this.muff); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  update(L, sim, dt, inside = false, distance = 0) {
    if (!this.enabled || !L) return;
    const c = this.ctx, t = c.currentTime, sp = (p, v, k = 0.05) => p.setTargetAtTime(v, t, k), spec = sim.spec, E = spec.engine;
    const id = spec.id, diesel = !!E.diesel, aircooled = !!E.aircooled, cyl = diesel ? 6 : 4, mil = id === 'm151' || id === 'm35';
    const rpm = L.rpm, run = L.running, fire = rpm / 60 * cyl / 2, load = clamp(sim.eng.thr, 0, 1), boost = sim.eng.boost || 0;
    const far = clamp(1 - distance / 400, 0, 1) ** 2, near = 1 / (1 + distance * 0.05);
    const vol = far * near;
    // engine
    const on = run ? 1 : 0;
    sp(this.eOsc.frequency, Math.max(4, fire)); sp(this.e2.frequency, Math.max(4, fire * (diesel ? 1 : 2)));
    sp(this.sub.frequency, Math.max(4, rpm / 60)); sp(this.clLFO.frequency, Math.max(4, fire));
    const lp = (diesel ? 260 : 320) + fire * (diesel ? 4 : 6) + load * (diesel ? 900 : 1600);
    sp(this.eLP.frequency, lp); sp(this.e2LP.frequency, lp * 1.3);
    const eVol = on * vol * (0.16 + 0.22 * load) * (aircooled ? 0.8 : 1);
    sp(this.eG.gain, eVol); sp(this.e2G.gain, on * vol * (0.02 + 0.05 * load) * (aircooled ? 1.6 : 1)); sp(this.subG.gain, on * vol * 0.12);
    // clatter: diesel knock (hard at low rpm / load), air-cooled valve clatter; a petrol engine is smoother
    const knock = diesel ? 0.25 * (0.4 + 0.6 * load) * (1.3 - Math.min(1, rpm / 2600)) : aircooled ? 0.1 : 0.035;
    sp(this.clD.gain, on * vol * knock); sp(this.clF.frequency, diesel ? 1500 + rpm * 0.4 : 2400);
    sp(this.inG.gain, on * vol * (diesel ? 0.01 : 0.05) * load * clamp(rpm / 3000, 0, 1)); sp(this.intake.frequency, 700 + rpm * 0.4);
    sp(this.fan.frequency, rpm / 60 * (aircooled ? 2 * 28 : 6)); sp(this.fanG.gain, on * vol * (aircooled ? 0.025 : 0.006) * clamp(rpm / 3000, 0, 1.3));
    sp(this.turbo.frequency, 1800 + 5200 * boost); sp(this.turboG.gain, diesel ? on * vol * 0.022 * boost * boost : 0);
    // driveline: gear whine (low gears, the M35 transfer), louder inside an open military cab
    const wOut = Math.abs(sim.solver.w[1]), gearR = sim.gear ? (sim.gear < 0 ? spec.gearbox.reverse : spec.gearbox.ratios[sim.gear - 1]) : 0;
    const wh = gearR > 1.5 || sim.gear < 0 || sim.range === 'L' ? 1 : 0.35;
    sp(this.whine.frequency, Math.max(20, wOut * 23 / (2 * Math.PI) * (sim.range === 'L' ? 1.8 : 1)));
    sp(this.whineG.gain, vol * clamp(wOut / 60, 0, 1) * (mil ? 0.035 : 0.012) * wh * (0.4 + 0.6 * load) * (inside ? 1.3 : 0.7));
    // tyres: howl (tread blocks), roar, squeal, surface noises
    const v = Math.abs(L.kmh) / 3.6; let slide = 0, surf = 0, wade = 0, nC = 0;
    for (const W of sim.wheels) if (W.contact) { nC++; slide = Math.max(slide, W.ts.slide * clamp(W.ts.slipV / 4, 0, 1)); surf = W.surf; wade = Math.max(wade, W.depthW); }
    const hard = surf === 0 || surf === 1 || surf === 6, xc = spec.wheels[0] && mil;
    const tyreR = sim.wheels[0].r;
    sp(this.howl.frequency, Math.max(20, v / (2 * Math.PI * tyreR) * (xc ? 26 : 60))); sp(this.howlBP.frequency, Math.max(40, v / (2 * Math.PI * tyreR) * (xc ? 26 : 60)));
    sp(this.howlG.gain, vol * (hard && nC ? 1 : 0) * clamp(v / 25, 0, 1) * (xc ? 0.06 : 0.015));
    sp(this.roarG.gain, vol * (nC ? 1 : 0) * clamp(v / 30, 0, 1) * 0.12); sp(this.roar.frequency, 180 + v * 12);
    sp(this.sqG.gain, vol * (hard ? 1 : 0) * clamp(slide * 1.5, 0, 1) * 0.12, 0.03); sp(this.sqD.gain, 120 * clamp(slide, 0, 1)); sp(this.squeal.frequency, 1100 + 400 * clamp(slide, 0, 1));
    const gravel = (surf === 2 || surf === 7) && nC ? clamp(v / 12, 0, 1) : 0;
    sp(this.grD.gain, vol * gravel * 0.07); sp(this.grLFO.frequency, 18 + v * 3);
    sp(this.mudG.gain, vol * ((surf === 5 && nC ? 1 : 0) * clamp((v + slide * 4) / 8, 0, 1) * 0.2 + (surf === 4 && nC ? 1 : 0) * clamp(v / 10, 0, 1) * 0.06));
    sp(this.waterG.gain, vol * clamp(wade * 2, 0, 1) * clamp(v / 4, 0, 1) * 0.3);
    sp(this.windG.gain, vol * clamp((v / 30) ** 2, 0, 1) * (mil ? 0.12 : 0.06)); sp(this.wind.frequency, 500 + v * 15);
    // starter: whirr with compression beats (one per cylinder pair per rev)
    const crank = !!sim.eng.starter;
    sp(this.starter.frequency, crank ? 180 + rpm * 0.5 : 60); sp(this.stLFO.frequency, Math.max(2, rpm / 60 * cyl / 2)); sp(this.stG.gain, crank ? vol * 0.05 : 0, 0.02); sp(this.stD.gain, crank ? vol * 0.05 : 0, 0.02);
    // horn
    const horn = !!L.horn && sim.battery > 0.05;
    const [ha, hb] = mil ? [id === 'm35' ? 340 : 410, id === 'm35' ? 342 : 413] : id === 'beetle' ? [440, 440] : [370, 466];
    sp(this.hornA.frequency, ha); sp(this.hornB.frequency, hb); sp(this.hornG.gain, horn ? vol * 0.12 : 0, 0.01);
    // one-shots: gear changes, stall, start, impacts
    if (sim.gear !== this._gear) { this.thump(500, 120, 0.12, vol * (mil ? 0.2 : 0.1)); this._gear = sim.gear; }
    for (const e of sim.events) {
      if (e.e === 'stall' || e.e === 'drowned' || e.e === 'hydrolock') this.thump(300, 40, 0.5, vol * 0.3);
      else if (e.e === 'impact') this.thump(900, 60, 0.35, vol * clamp(e.speed / 8, 0.1, 0.7));
      else if (e.e === 'grind') this.thump(3500, 1800, 0.25, vol * 0.15, 'bandpass');
      else if (e.e === 'blowout') this.thump(2000, 100, 0.25, vol * 0.5);
    }
    // inside a closed civilian car the world is muffled; the open military cabs much less
    sp(this.muff.frequency, inside ? (mil ? 6000 : 2200) : 16000, 0.2);
  }
  dispose() { try { this.out.disconnect(); } catch { /* gone */ } }
}
