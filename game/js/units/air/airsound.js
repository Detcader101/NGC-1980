// Synthesised sounds for the AI aircraft (WebAudio, on the game's Sfx context and master bus; no samples):
//   TF30 roar     the Tomcats (and, thinner, the SHRIKE's engine): band-passed noise rumble that opens up with rpm, a
//                 low crackle in afterburner, a turbine whine, Doppler on the pass; three voices for the nearest jets
//   turboprop     the REAPER: blade-passage buzz (3 blades) with its harmonics, a little gearbox whine, a wash of noise
//   moped drone   the SHAHED swarm: a two-stroke buzz (sawtooth with a fast firing flutter) through a nasal band-pass;
//                 one voice whose loudness sums the drones in earshot, slightly detuned per drone count
// Distance falls off like the war's other sounds (war.js hear()); speeds here are world speeds (sound at 170 m/s).
const C_SND = 170;

export function createAirSound(sfx) {
  let ready = false, c, out;
  const jets = [], prop = {}, moped = {};
  function init() {
    if (ready || !sfx || !sfx.ctx || !sfx.noise) return ready; c = sfx.ctx; ready = true;
    out = c.createGain(); out.gain.value = 0.9; out.connect(sfx.master);
    const noise = () => { const s = c.createBufferSource(); s.buffer = sfx.noise; s.loop = true; s.start(0, Math.random() * 1.5); return s; };
    for (let i = 0; i < 3; i++) {
      const J = {}, n1 = noise(), n2 = noise();
      J.roarF = c.createBiquadFilter(); J.roarF.type = 'bandpass'; J.roarF.Q.value = 0.8; J.roar = c.createGain(); J.roar.gain.value = 0;
      n1.connect(J.roarF); J.roarF.connect(J.roar); J.roar.connect(out);
      J.abF = c.createBiquadFilter(); J.abF.type = 'lowpass'; J.abF.frequency.value = 140; J.ab = c.createGain(); J.ab.gain.value = 0;
      // afterburner crackle: the low rumble amplitude-modulated by a slow random-ish LFO pair
      J.crk = c.createGain(); J.crk.gain.value = 0.6; const l1 = c.createOscillator(), l1g = c.createGain(); l1.frequency.value = 13; l1g.gain.value = 0.4; l1.connect(l1g); l1g.connect(J.crk.gain); l1.start();
      n2.connect(J.abF); J.abF.connect(J.crk); J.crk.connect(J.ab); J.ab.connect(out);
      J.wh = c.createOscillator(); J.wh.type = 'sawtooth'; J.whF = c.createBiquadFilter(); J.whF.type = 'bandpass'; J.whF.Q.value = 6; J.whG = c.createGain(); J.whG.gain.value = 0;
      J.wh.connect(J.whF); J.whF.connect(J.whG); J.whG.connect(out); J.wh.start();
      jets.push(J);
    }
    // turboprop
    prop.o = c.createOscillator(); prop.o.type = 'sawtooth'; prop.o2 = c.createOscillator(); prop.o2.type = 'square';
    prop.f = c.createBiquadFilter(); prop.f.type = 'lowpass'; prop.f.frequency.value = 900; prop.g = c.createGain(); prop.g.gain.value = 0;
    const o2g = c.createGain(); o2g.gain.value = 0.35; prop.o.connect(prop.f); prop.o2.connect(o2g); o2g.connect(prop.f);
    prop.wh = c.createOscillator(); prop.wh.type = 'triangle'; const whg = c.createGain(); whg.gain.value = 0.08; prop.wh.connect(whg); whg.connect(prop.f);
    const pn = noise(), pnf = c.createBiquadFilter(); pnf.type = 'bandpass'; pnf.frequency.value = 500; pnf.Q.value = 0.6; const png = c.createGain(); png.gain.value = 0.25; pn.connect(pnf); pnf.connect(png); png.connect(prop.f);
    prop.f.connect(prop.g); prop.g.connect(out); prop.o.start(); prop.o2.start(); prop.wh.start();
    // moped drone
    moped.o = c.createOscillator(); moped.o.type = 'sawtooth'; moped.o2 = c.createOscillator(); moped.o2.type = 'sawtooth';
    moped.am = c.createGain(); moped.am.gain.value = 0.7; const lfo = c.createOscillator(), lg = c.createGain(); lfo.type = 'square'; lfo.frequency.value = 23; lg.gain.value = 0.3; lfo.connect(lg); lg.connect(moped.am.gain); lfo.start();
    moped.f = c.createBiquadFilter(); moped.f.type = 'bandpass'; moped.f.frequency.value = 900; moped.f.Q.value = 1.4; moped.g = c.createGain(); moped.g.gain.value = 0;
    moped.o.connect(moped.am); moped.o2.connect(moped.am); moped.am.connect(moped.f); moped.f.connect(moped.g); moped.g.connect(out); moped.o.start(); moped.o2.start();
    return ready;
  }
  const lv = (ear, p, range) => { const d = Math.hypot(p.x - ear.x, p.y - ear.y, p.z - ear.z); return { d, k: Math.max(0, 1 - d / range) ** 2 }; };
  const doppler = (ear, p, v, d) => { if (d < 1) return 1; const vr = ((p.x - ear.x) * v.x + (p.y - ear.y) * v.y + (p.z - ear.z) * v.z) / d; return Math.min(1.8, Math.max(0.55, C_SND / (C_SND + vr))); };
  // units: the war's air units with a sim; ear: the camera position
  function update(units, ear, on = true) {
    if (!init()) return;
    const t = c.currentTime, sp = (a, x, tc = 0.12) => a.setTargetAtTime(x, t, tc);
    const jl = [], props = [], drones = [];
    for (const u of units) {
      if (u.dead || u.dying || !u.p) continue;
      if (u.sim && (u.type === 'escort' || u.type === 'shrike')) { const { d, k } = lv(ear, u.p, 900); if (k > 0) jl.push({ u, d, k }); }
      else if (u.type === 'reaper') { const { d, k } = lv(ear, u.p, 600); if (k > 0) props.push({ u, d, k }); }
      else if (u.type === 'shahed') { const { d, k } = lv(ear, u.p, 500); if (k > 0) drones.push({ u, d, k }); }
    }
    jl.sort((a, b) => a.d - b.d);
    for (let i = 0; i < jets.length; i++) {
      const J = jets[i], e = jl[i];
      if (!e || !on) { sp(J.roar.gain, 0); sp(J.ab.gain, 0); sp(J.whG.gain, 0); continue; }
      const A = e.u.sim, n = A.eng.reduce((s, q) => s + q.n, 0) / A.eng.length, ab = A.eng.reduce((s, q) => s + (q.ab || 0), 0) / A.eng.length, dop = doppler(ear, e.u.p, e.u.v, e.d);
      const run = Math.max(0, (n - 0.5) / 0.55), tf = e.u.type === 'shrike' ? 1.5 : 1;   // the SHRIKE: thinner, higher
      sp(J.roar.gain, e.k * (0.12 + 0.5 * run * run) * (e.u.type === 'shrike' ? 0.7 : 1)); sp(J.roarF.frequency, (180 + 650 * run) * dop * tf);
      sp(J.ab.gain, e.k * 0.9 * ab); sp(J.abF.frequency, 120 * dop + 60 * ab);
      sp(J.whG.gain, e.k * 0.035 * Math.min(1, n * 1.4)); sp(J.wh.frequency, (160 + 520 * n) * dop * tf); sp(J.whF.frequency, (900 + 1900 * n) * dop * tf);
    }
    props.sort((a, b) => a.d - b.d); const p0 = props[0];
    if (p0 && on) { const A = p0.u.sim, n = A.eng[0].n, dop = doppler(ear, p0.u.p, p0.u.v, p0.d), bpf = (40 + 70 * n) * 3; sp(prop.g.gain, p0.k * 0.16); sp(prop.o.frequency, bpf * dop); sp(prop.o2.frequency, bpf * 0.5 * dop); sp(prop.wh.frequency, 2400 * dop); }
    else sp(prop.g.gain, 0);
    if (drones.length && on) {
      drones.sort((a, b) => a.d - b.d); const s = Math.min(1, drones.reduce((q, e) => q + e.k, 0)), e = drones[0], dop = doppler(ear, e.u.p, e.u.v, e.d);
      sp(moped.g.gain, 0.22 * s); sp(moped.o.frequency, 118 * dop); sp(moped.o2.frequency, (118 + 3 + drones.length * 1.7) * dop); sp(moped.f.frequency, 800 + 300 * dop);
    } else sp(moped.g.gain, 0);
  }
  function silence() { if (ready) update([], { x: 0, y: 0, z: 0 }, false); }
  return { update, silence };
}
