// ch46play.js - the PLAYER's CH-46 Sea Knight: the host that puts a pilot's hands on the validated flight model
// (ch46fm.js). Pure JS (no three.js, no DOM): tools/ch46playbench.mjs flies it in node through the same input path the
// game uses. ch46craft.js is the game adapter (model, cockpit, cameras, troops, HUD, sound).
//
// What is here:
// - INPUT: keyboard (W A S D cyclic, Q E pedals, Shift / Space - Ctrl / Z collective), the HOTAS / pedals / gamepad
//   state from hotas.js (stick = cyclic, throttle lever = collective, rudder pedals or stick twist = pedals, toe
//   brakes, the bound buttons). On the tandem the pilot's controls mix like the real thing (in the FM): stick fore-aft =
//   DIFFERENTIAL COLLECTIVE PITCH between the rotors, stick lateral = lateral cyclic on both, pedals = DIFFERENTIAL
//   LATERAL CYCLIC (front disc one way, aft disc the other). Keyboard cyclic moves at a finite rate; with the AFCS off
//   and force trim on it stays where you leave it; the HOTAS force trim button re-centres the stick on what you hold.
// - SAS / AFCS: the real dual SAS (rate damping, in the FM, S.sas) and an AFCS on top: attitude command / attitude hold
//   from the stick, hands-off hover hold (over a ship: relative to the deck under you), heading hold with free pedals,
//   turn coordination at speed. On by default; H toggles the AFCS, SHIFT+H the SAS. The flight model is untouched.
// - SYSTEMS: battery, APU (starts the engines, carries the electrics and utility hydraulics on the ground), two T58s
//   with their engine condition levers (STOP / GROUND IDLE / FLY) and starters, generators, the rotor brake, wheel
//   brakes (parking brake), the landing light, the ramp, fuel (game-scaled burn), the caution panel (20 captions,
//   INFERRED from the CH-46E panel), master caution. I = the whole start (or shutdown on the ground); every switch is
//   also a cockpit click (ch46cockpit.js) and toggle(id) here.
// - DAMAGE (game level): component health for two engines, forward / aft transmissions, the two rotors, hydraulics,
//   fuel cells, avionics, gear and the cabin (a cabin hit can kill a Marine aboard); hard landings, rotor strikes on
//   the ground / a deck / the carrier's island, rollover and ditching from the FM's contacts.
import { createCH46Sim, CH46, KT } from './ch46fm.js';
import { stateOf } from './pilot.js';
import { clamp, wrap, sstep } from './rb.js';

// CH-46 caution panel, 5 rows x 4 (INFERRED from CH-46E NATOPS cockpit photos and the systems modelled here)
export const CH46_CAPTIONS = [
  'NO 1 ENG CHIP', 'NO 2 ENG CHIP', 'NO 1 FUEL PRESS', 'NO 2 FUEL PRESS',
  'NO 1 GEN OFF', 'NO 2 GEN OFF', 'FWD XMSN CHIP', 'AFT XMSN CHIP',
  'XMSN OIL PRESS', 'XMSN OIL HOT', 'NO 1 HYD PRESS', 'NO 2 HYD PRESS',
  'UTIL HYD PRESS', 'FUEL LOW', 'APU ON', 'ROTOR BRAKE',
  'RAMP OPEN', 'PARK BRAKE', 'SAS OFF', 'AFCS OFF',
];
export const CH46_PARTS = [
  { id: 'eng1', name: 'NO 1 ENGINE', w: 1.0 }, { id: 'eng2', name: 'NO 2 ENGINE', w: 1.0 }, { id: 'fxmsn', name: 'FORWARD TRANSMISSION', w: 0.6 },
  { id: 'axmsn', name: 'AFT TRANSMISSION', w: 0.6 }, { id: 'rotorF', name: 'FORWARD ROTOR', w: 0.7 }, { id: 'rotorA', name: 'AFT ROTOR', w: 0.7 },
  { id: 'hyd', name: 'FLIGHT CONTROL HYDRAULICS', w: 0.9 }, { id: 'fuel', name: 'FUEL CELLS', w: 1.1 }, { id: 'avionics', name: 'AVIONICS', w: 0.6 },
  { id: 'gear', name: 'LANDING GEAR', w: 0.5 }, { id: 'cabin', name: 'CABIN', w: 1.6 },
];
const PW = CH46_PARTS.reduce((s, p) => s + p.w, 0);
// game tuning (stated, not real): fuel burns 12x the real T58 flow (a tank = ~10 min of flying); hits hurt ~0.7x the
// Huey's (a bigger airframe with two of everything)
export const CH46_PLAY = {
  FUEL_ACCEL: 12, SFC: 0.61 / 2.2046 / 745.7 / 3600,   // T58 ~0.61 lb/shp/h (INFERRED, T58-GE-16 class) -> kg/J
  HIT_K: 0.7, MARINES: 13,
  // AFCS gains (tuned on tools/ch46playbench.mjs)
  AF: { th: 0.3, ph: 0.5, kth: 2.0, kq: 0.9, kph: 2.0, kp: 0.6, ki: 0.5, rate: 0.45, kr: 1.4, hold: 0.045, holdR: 0.05 },
  HOVER_TRIM: { lon: 0.05, lat: 0, ped: -0.03 },
};
const A = CH46_PLAY.AF;

// a disc's rim (8 points, FRD from the CG) for the rotor-strike check; tips droop at rest, cone up with thrust
const RIM = [];
for (const [hub, tilt] of [[CH46.HUB_F, CH46.SHAFT_F], [CH46.HUB_A, CH46.SHAFT_A]]) for (let k = 0; k < 8; k++) {
  const a = k / 8 * Math.PI * 2, x = Math.cos(a) * CH46.R, y = Math.sin(a) * CH46.R;
  RIM.push({ hub, x: hub[0] + x * Math.cos(tilt), y: hub[1] + y, z: hub[2] - x * Math.sin(tilt), front: hub === CH46.HUB_F });
}

export function createCH46Play(o = {}) {
  const S = createCH46Sim(o.G ?? 9.81), st = {};
  const P = {
    S, st, fuel: 100, ramp: 0, rampCmd: 0, marines: 0, light: false, alive: true, dead: '', events: [], stickUsed: false,
    sys: { bat: true, apu: 'off', apuT: 0, gen: [true, true], ecl: [1, 1], start: [false, false], rbrake: false, pbrake: true, sas: true, afcs: true,
      volts: 28, utilPsi: 3000, cautions: [], mcSeen: new Set(), master: false, auto: null, autoT: 0 },
    hp: {}, ctl: { coll: 0, lon: 0, lat: 0, ped: 0, sas: true, brake: 1, rbrake: false, ecl0: 1, ecl1: 1, start0: false, start1: false },
    raw: { cx: 0, cy: 0, ped: 0, coll: 0 }, source: 'KEYBOARD', trimX: 0, trimY: 0,
    I: { lon: 0, lat: 0, ped: 0, th: 0, ph: 0, hdg: null }, kb: { x: 0, y: 0, p: 0 }, coll: 0, collSrc: 'kb', lastHw: undefined,
    strike: null, maxSink: 0, deckRel: false,
  };
  const sys = P.sys;

  // ------------------------------------------------------------------------------------------- reset / start / stop
  // o: { pos: [x, y, z] (the wheels' ground point), yaw, landed, cold, env, marines, fuel }
  P.reset = (r = {}) => {
    const [x, y, z] = r.pos || [0, 0, 0], landed = r.landed !== false;
    S.reset([x, y + (landed ? CH46.CG_H + 0.05 : 0), z], r.yaw || 0, landed, r.env || null);
    for (const p of CH46_PARTS) P.hp[p.id] = 1;
    P.alive = true; P.dead = ''; P.fuel = r.fuel ?? 100; P.marines = r.marines ?? 0; P.ramp = P.rampCmd = 0; P.light = false; P.strike = null; P.maxSink = 0;
    Object.assign(sys, { bat: true, apu: 'off', apuT: 0, gen: [true, true], ecl: [1, 1], start: [false, false], rbrake: false, pbrake: landed, sas: true, afcs: P.afcsPref ?? true, auto: null, autoT: 0, volts: 28, master: false });
    sys.mcSeen.clear();
    P.I.lon = CH46_PLAY.HOVER_TRIM.lon; P.I.lat = 0; P.I.ped = CH46_PLAY.HOVER_TRIM.ped; P.I.th = 0.06; P.I.ph = 0; P.I.hdg = null;
    P.kb.x = P.kb.y = P.kb.p = 0; P.coll = landed ? 0 : 0.58; P.trimX = P.trimY = 0;
    S.c.coll = P.coll;
    if (r.cold) { S.coldStart(); Object.assign(sys, { bat: false, ecl: [0, 0], rbrake: true, volts: 0 }); }
    massNow();
    return P;
  };
  // the whole start (I): battery, APU, engine 1 then 2 (ECL GROUND IDLE, starter to light-off, out at 45% N1), rotor
  // brake off, ECLs to FLY. ~30 s. Running on the ground, I shuts down instead.
  P.quickStart = () => { sys.bat = true; sys.auto = 'apu'; sys.autoT = 0; if (sys.apu === 'off') { sys.apu = 'start'; sys.apuT = 0; } };
  P.shutdown = () => { sys.auto = null; sys.ecl[0] = sys.ecl[1] = 0; sys.start[0] = sys.start[1] = false; sys.apu = 'off'; };
  P.running = () => S.eng.some(e => e.lit);
  P.toggle = id => {
    switch (id) {
      case 'bat': sys.bat = !sys.bat; return sys.bat;
      case 'apu': sys.apu = sys.apu === 'off' ? 'start' : 'off'; sys.apuT = 0; return sys.apu !== 'off';
      case 'gen1': case 'gen2': { const i = id === 'gen1' ? 0 : 1; sys.gen[i] = !sys.gen[i]; return sys.gen[i]; }
      case 'ecl1': case 'ecl2': { const i = id === 'ecl1' ? 0 : 1; sys.ecl[i] = sys.ecl[i] >= 1 ? 0 : sys.ecl[i] >= 0.5 ? 1 : 0.5; sys.auto = null; return sys.ecl[i]; }   // STOP -> GND IDLE -> FLY -> STOP
      case 'start1': case 'start2': { const i = id === 'start1' ? 0 : 1; sys.start[i] = !sys.start[i]; return sys.start[i]; }   // the start switch held (latched until 45% N1)
      case 'rbrake': sys.rbrake = !sys.rbrake; return sys.rbrake;
      case 'pbrake': sys.pbrake = !sys.pbrake; return sys.pbrake;
      case 'sas': sys.sas = !sys.sas; return sys.sas;
      case 'afcs': sys.afcs = !sys.afcs; P.afcsPref = sys.afcs; syncAfcs(); return sys.afcs;
      case 'light': P.light = !P.light; return P.light;
      case 'ramp': P.rampCmd = P.rampCmd > 0.5 ? 0 : 1; return P.rampCmd > 0.5;
      case 'mc': sys.master = false; for (const c of sys.cautions) sys.mcSeen.add(c); return false;
      case 'start': if (P.running()) { P.shutdown(); return false; } P.quickStart(); return true;
    }
    return undefined;
  };
  function syncAfcs() { const s = stateOf(S.body, st); P.I.th = clamp(s.pitch, -0.2, 0.2); P.I.ph = clamp(s.roll, -0.2, 0.2); P.I.lon = S.c.lon; P.I.lat = S.c.lat; P.I.ped = S.c.ped; P.I.hdg = null; }
  P.setCollective = v => { P.coll = clamp(v, 0, 1); P.collSrc = 'kb'; };

  // ------------------------------------------------------------------------------------------- input
  // inp: { kd(...codes) -> bool, hw: hotas.js state or null (keyboard only) }
  P.read = (dt, inp) => {
    const kd = inp.kd || (() => false), H = inp.hw, out = P.ctl, raw = P.raw;
    const kx = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0), ky = (kd('KeyS', 'ArrowDown') ? 1 : 0) - (kd('KeyW', 'ArrowUp') ? 1 : 0), kp = (kd('KeyE') ? 1 : 0) - (kd('KeyQ') ? 1 : 0);
    const kb = P.kb, sticky = !sys.afcs;   // AFCS off: the keyboard stick stays where you leave it (force trim)
    const mv = (v, k) => k ? clamp(v + k * (sticky ? 1.0 : 2.5) * dt, -1, 1) : sticky ? v : v - clamp(v, -4 * dt, 4 * dt);
    kb.x = mv(kb.x, kx); kb.y = mv(kb.y, ky); kb.p = kp ? clamp(kb.p + kp * 3 * dt, -1, 1) : kb.p - clamp(kb.p, -4 * dt, 4 * dt);
    raw.cx = kb.x; raw.cy = kb.y; raw.ped = kb.p; P.source = 'KEYBOARD';
    // collective: Shift / Space up, Ctrl / Z down, or the throttle lever - whichever moved last
    const up = kd('Space', 'ShiftLeft', 'ShiftRight'), dn = kd('ControlLeft', 'KeyZ');
    if (up || dn) { P.collSrc = 'kb'; P.coll = clamp(P.coll + ((up ? 1 : 0) - (dn ? 1 : 0)) * 0.4 * dt, 0, 1); }
    let brakeHeld = 0;
    if (H) {
      if (H.throttle !== null && H.throttle !== undefined) {
        if (P.lastHw === undefined) P.lastHw = H.throttle;
        if (Math.abs(H.throttle - P.lastHw) > 0.03) P.collSrc = 'hotas';
        if (P.collSrc === 'hotas') { P.coll = H.throttle; P.lastHw = H.throttle; }
      }
      if (H.stick) {
        const sx = H.stick.x || 0, sy = H.stick.y || 0;
        if (Math.abs(sx) > 0.001 || Math.abs(sy) > 0.001 || P.stickUsed) {
          P.stickUsed = true; P.source = H.source || 'HOTAS';
          if (Math.abs(sx) > 0.001 || !kx) raw.cx = clamp(sx + P.trimX, -1, 1);
          if (Math.abs(sy) > 0.001 || !ky) raw.cy = clamp(sy + P.trimY, -1, 1);
        }
      }
      if (Math.abs(H.rudder || 0) > 0.001) raw.ped = H.rudder;
      if (H.hasPedals) P.source += ' + PEDALS';
      const a = H.actions || {}, pr = H.pressed || {};
      brakeHeld = Math.max(a.wheelbrake ? 1 : 0, H.brakeL || 0, H.brakeR || 0);
      // HOTAS buttons (the Huey's bindings): 6 AFCS (gear), 7 FORCE TRIM (flaps), 8 LANDING LIGHT (hook), 9 VIEW,
      // 11 WHEEL BRAKES held (wheelbrake), PICKLE = the ramp
      P.press = { afcs: !!pr.gear, trim: !!pr.flaps, light: !!pr.hook, view: !!pr.view, ramp: !!pr.pickle };
      if (pr.gear) P.toggle('afcs');
      if (pr.flaps) { P.trimX = clamp(raw.cx, -1, 1); P.trimY = clamp(raw.cy, -1, 1); }   // force trim: the stick's spring now centres here
      if (pr.hook) P.toggle('light');
      if (pr.pickle) P.toggle('ramp');
    } else P.press = null;
    raw.coll = P.coll;
    out.coll = P.coll; out.lon = raw.cy; out.lat = raw.cx; out.ped = raw.ped;
    if (sys.afcs && (P.hp.hyd ?? 1) > 0.3) afcs(out, dt, inp.env);
    else { P.I.hdg = null; }
    // the hydraulics: below 30% the boost is gone - slow, heavy controls (half authority)
    if ((P.hp.hyd ?? 1) < 0.3) { out.lon *= 0.5; out.lat *= 0.5; out.ped *= 0.5; }
    out.sas = sys.sas && (P.hp.hyd ?? 1) > 0.15 && sys.volts > 18;
    out.brake = sys.pbrake ? 1 : brakeHeld;
    out.rbrake = sys.rbrake;
    out.ecl0 = sys.ecl[0]; out.ecl1 = sys.ecl[1]; out.start0 = sys.start[0] && power(); out.start1 = sys.start[1] && power();
    out.eng0 = P.hp.eng1 > 0.05; out.eng1 = P.hp.eng2 > 0.05;
    return out;
  };
  const power = () => sys.bat && (sys.apu === 'on' || sys.volts > 24);

  // AFCS: attitude command (stick -> pitch / bank), hands-off hover hold (relative to the surface under you), heading
  // hold with the pedals free when slow, turn coordination at speed. Integrators carry the trim (the stick positions
  // the aircraft needs), so letting go holds the attitude.
  const _sv = { vx: 0, vz: 0 };
  function afcs(c, dt, env) {
    const s = stateOf(S.body, st), I = P.I, air = S.body.contacts < 2;
    let vx = s.vx, vz = s.vz; P.deckRel = false;
    if (env && env.surfVel && S.agl < 40) { const sv = env.surfVel(s.x, s.z); if (sv) { vx -= sv.vx + sv.w * (s.z - sv.cz); vz -= sv.vz - sv.w * (s.x - sv.cx); P.deckRel = true; } }
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), u = vx * fx + vz * fz, v = vx * -fz + vz * fx, spd = Math.hypot(vx, vz);
    const hands = 1 - clamp(Math.hypot(c.lat, c.lon) * 6, 0, 1), slow = 1 - clamp((spd - 8) / 6, 0, 1);
    // targets: + cy = stick aft = nose up; drifting forward hands-off: nose up to stop it (and the same sideways)
    const thT = clamp(I.th + c.lon * A.th + hands * slow * u * A.hold, -0.4, 0.35);
    const phT = clamp(I.ph + c.lat * A.ph - hands * slow * v * A.holdR, -0.6, 0.6);
    if (air) {
      I.lon = clamp(I.lon + (thT - s.pitch) * A.ki * dt, -0.8, 0.8); I.lat = clamp(I.lat + (phT - s.roll) * A.ki * dt, -0.8, 0.8);
      I.th = clamp(I.th + u * 0.003 * hands * slow * dt, -0.1, 0.2); I.ph = clamp(I.ph - v * 0.002 * hands * slow * dt, -0.05, 0.05);
    }
    c.lon = clamp(I.lon + (thT - s.pitch) * A.kth - s.q * A.kq, -1, 1);
    c.lat = clamp(I.lat + (phT - s.roll) * A.kph - s.p * A.kp, -1, 1);
    // yaw: pedals command a yaw rate; free pedals hold the heading when slow, coordinate the turn at speed
    const fast = clamp((spd - 15) / 20, 0, 1), pedIn = c.ped;
    let rc = pedIn * A.rate;
    if (Math.abs(pedIn) < 0.05 && air) {
      if (I.hdg === null && Math.abs(s.r) < 0.015) I.hdg = s.yaw;
      if (I.hdg !== null) rc = clamp(-wrap(I.hdg - s.yaw) * 0.8, -0.25, 0.25) * (1 - fast);
    } else I.hdg = null;
    const coord = fast * clamp(9.81 * Math.tan(s.roll) / Math.max(15, spd), -0.4, 0.4), beta = spd > 3 ? Math.atan2(v, Math.max(1, u)) : 0;
    const rT = rc * (1 - fast * 0.5) + coord;
    // the trim integrator only learns while the pedals are free (no wind-up through a commanded turn); the pedals feed
    // forward; at speed the slip ball is centred (sideslip right = nose right: + pedal)
    if (air && Math.abs(pedIn) < 0.05) I.ped = clamp(I.ped + ((rT - s.r) * 0.5 + beta * 0.4 * fast) * dt, -1, 1);
    c.ped = clamp(I.ped + pedIn * 0.5 + (rT - s.r) * A.kr + beta * fast * 0.6, -1, 1);
    if (!air) {   // on the wheels: the hover trim ready for the lift-off, no wind-up against the gear
      I.lon = CH46_PLAY.HOVER_TRIM.lon; I.lat = 0; I.ped = CH46_PLAY.HOVER_TRIM.ped; I.th = 0.06; I.ph = 0; I.hdg = null;
      c.lon = clamp(I.lon + P.raw.cy * 0.6, -1, 1); c.lat = P.raw.cx * 0.6; c.ped = clamp(I.ped + pedIn * 0.8, -1, 1);   // taxiing: the raw stick and pedals
    }
  }

  // ------------------------------------------------------------------------------------------- step
  function massNow() { S.fuelKg = CH46.FUEL_KG * P.fuel / 100; S.payload = P.marines * CH46.MARINE_KG; }
  const _p = [0, 0, 0];
  // env: { groundY(x, z), water(x, z), surfVel(x, z), rho, floats }; returns the events this step
  P.step = (dt, env, ctl = P.ctl) => {
    P.events.length = 0;
    if (!P.alive) return P.events;
    systems(dt);
    massNow();
    // damage -> the flight model's mods
    const h = P.hp, m = S.mods || (S.mods = {});
    m.liftF = 0.55 + 0.45 * Math.min(1, h.rotorF * 1.4) * (h.fxmsn > 0 ? 1 : 0.15); m.liftA = 0.55 + 0.45 * Math.min(1, h.rotorA * 1.4) * (h.axmsn > 0 ? 1 : 0.15);
    m.vib = (1 - h.rotorF) * 0.5 + (1 - h.rotorA) * 0.5; m.sasOk = h.hyd > 0.15 && sys.volts > 18; m.fuel = P.fuel > 0 ? 1 : 0;
    const ev = S.step(dt, ctl, env);
    for (const e of S.events) P.events.push(e);
    // fuel: the T58s' flow at their power, game-scaled; a holed cell leaks
    const flow = S.eng.reduce((a, e) => a + (e.lit ? Math.max(e.p, 0.06 * CH46.P_ENG) : 0), 0) * CH46_PLAY.SFC;
    P.fuel = Math.max(0, P.fuel - (flow * CH46_PLAY.FUEL_ACCEL + (h.fuel < 0.75 ? (0.75 - h.fuel) * 0.6 : 0)) * dt / (CH46.FUEL_KG / 100));
    // ramp: 2.5 s travel
    P.ramp += clamp(P.rampCmd - P.ramp, -dt / 2.5, dt / 2.5);
    // rotor strike: a blade tip in the ground, a deck or the carrier's island (rpm up)
    if (S.rpm > 0.25) {
      const cone = -0.05 + 0.11 * sstep(0.15, 0.75, S.rpm) * clamp((S.rf.ct + S.ra.ct) / 2 / 0.006, 0, 1.4);
      for (const R of RIM) {
        _p[0] = R.x; _p[1] = R.y; _p[2] = R.z - CH46.R * Math.sin(cone); S.body.worldPoint(_p, _p);
        if (_p[1] < env.groundY(_p[0], _p[2]) + 0.05) { P.strike = R.front ? 'FORWARD' : 'AFT'; P.events.push('rotor'); break; }
      }
    }
    if (S.body.maxSink > P.maxSink) P.maxSink = S.body.maxSink;
    // events -> damage / loss
    for (const e of P.events) {
      if (e === 'hardland') { P.hurt(0.35, 'gear'); P.hurt(0.2, 'axmsn'); P.hurt(0.2, 'fxmsn'); }
      if (e === 'crash' || e === 'water' || e === 'rotor') { P.alive = false; P.dead = e === 'water' ? 'DITCHED' : e === 'rotor' ? `ROTOR STRIKE (${P.strike} ROTOR)` : S.dead === 'rollover' ? 'ROLLED OVER' : 'CRASHED'; }
    }
    return P.events;
  };
  // the start sequencer, APU, electrics, hydraulics, cautions
  function systems(dt) {
    // APU: ~6 s to speed (INFERRED), needs the battery
    if (sys.apu === 'start') { sys.apuT += dt; if (!sys.bat) sys.apu = 'off'; else if (sys.apuT > 6) sys.apu = 'on'; }
    if (sys.apu === 'on' && !sys.bat && sys.volts < 10) sys.apu = 'off';
    // start switches let go at 45% N1 (or with no electrical power)
    for (let i = 0; i < 2; i++) if (sys.start[i] && (S.eng[i].n1 > 0.45 || !power())) sys.start[i] = false;
    if (sys.auto) {
      sys.autoT += dt; const e1 = S.eng[0], e2 = S.eng[1];
      if (sys.auto === 'apu' && sys.apu === 'on') { sys.auto = 'eng1'; sys.ecl[0] = 0.5; sys.start[0] = true; sys.rbrake = sys.rbrake || S.omega < 1; }
      else if (sys.auto === 'eng1' && e1.lit && e1.n1 > 0.42) { sys.auto = 'eng2'; sys.ecl[1] = 0.5; sys.start[1] = true; }
      else if (sys.auto === 'eng2' && e2.lit && e2.n1 > 0.5 && e1.n1 > 0.58) { sys.auto = 'fly'; sys.rbrake = false; sys.ecl[0] = sys.ecl[1] = 1; }
      else if (sys.auto === 'fly' && S.rpm > 0.97) { sys.auto = null; sys.apu = 'off'; }
      if (sys.autoT > 90) sys.auto = null;
    }
    // electrics: each generator on its engine past ~55% N1; the APU generator on the ground; else the battery
    const g1 = sys.gen[0] && S.eng[0].n1 > 0.55 && P.hp.eng1 > 0.05, g2 = sys.gen[1] && S.eng[1].n1 > 0.55 && P.hp.eng2 > 0.05;
    const target = g1 || g2 || sys.apu === 'on' ? 28 : sys.bat ? (sys.start[0] || sys.start[1] ? 20 : 24) : 0;
    sys.volts += (target - sys.volts) * Math.min(1, 4 * dt); sys.g1 = g1; sys.g2 = g2;
    sys.utilPsi = (sys.apu === 'on' || S.rpm > 0.5) ? 3000 * (P.hp.hyd < 0.3 ? 0.3 : 1) : 0;
    const c = [], pw = sys.volts > 18, e = S.eng;
    if (pw) {
      if (P.hp.eng1 < 0.6) c.push('NO 1 ENG CHIP'); if (P.hp.eng2 < 0.6) c.push('NO 2 ENG CHIP');
      if (sys.ecl[0] > 0 && (P.fuel <= 0 || P.hp.fuel < 0.5)) c.push('NO 1 FUEL PRESS'); if (sys.ecl[1] > 0 && (P.fuel <= 0 || P.hp.fuel < 0.5)) c.push('NO 2 FUEL PRESS');
      if (!g1) c.push('NO 1 GEN OFF'); if (!g2) c.push('NO 2 GEN OFF');
      if (P.hp.fxmsn < 0.6) c.push('FWD XMSN CHIP'); if (P.hp.axmsn < 0.6) c.push('AFT XMSN CHIP');
      if (S.rpm < 0.4) c.push('XMSN OIL PRESS'); if (Math.min(P.hp.fxmsn, P.hp.axmsn) < 0.35) c.push('XMSN OIL HOT');
      if (S.rpm < 0.5 || P.hp.hyd < 0.3) c.push('NO 1 HYD PRESS', 'NO 2 HYD PRESS');
      if (sys.utilPsi < 1500) c.push('UTIL HYD PRESS');
      if (P.fuel < 20) c.push('FUEL LOW');
      if (sys.apu !== 'off') c.push('APU ON');
      if (sys.rbrake) c.push('ROTOR BRAKE');
      if (P.ramp > 0.05) c.push('RAMP OPEN');
      if (sys.pbrake) c.push('PARK BRAKE');
      if (!sys.sas || P.hp.hyd < 0.15) c.push('SAS OFF');
      if (!sys.afcs) c.push('AFCS OFF');
    }
    sys.cautions = c;
    const warn = c.filter(x => !['APU ON', 'PARK BRAKE', 'RAMP OPEN', 'ROTOR BRAKE', 'AFCS OFF'].includes(x));   // advisories don't trip the master caution
    if (warn.some(x => !sys.mcSeen.has(x))) { sys.master = true; for (const x of warn) sys.mcSeen.add(x); }
    for (const x of [...sys.mcSeen]) if (!c.includes(x)) sys.mcSeen.delete(x);
    sys.rpmWarn = pw && P.running() && (S.rpm < 0.94 && S.rpm > 0.3 && !S.landed || S.rpm > 1.1);
    void e;
  }

  // ------------------------------------------------------------------------------------------- damage (game level)
  // amount ~0.2 for a bullet (the war's scale); part optional (random, weighted by exposure). Returns the part.
  P.hurt = (amount, part) => {
    if (!part) { let r = Math.random() * PW; for (const p of CH46_PARTS) { r -= p.w; if (r <= 0) { part = p.id; break; } } part ||= 'cabin'; }
    const k = CH46_PLAY.HIT_K * (0.7 + Math.random() * 0.6);
    P.hp[part] = Math.max(0, P.hp[part] - amount * k);
    if (part === 'cabin' && P.marines > 0 && Math.random() < 0.35) { P.marines--; P.marineHits = (P.marineHits || 0) + 1; }   // a Marine aboard hit (the craft reports it)
    return part;
  };
  P.repair = (dt) => { let any = false; for (const p of CH46_PARTS) if (P.hp[p.id] < 1) { P.hp[p.id] = Math.min(1, P.hp[p.id] + 0.2 * dt); any = true; } return any; };
  P.damaged = () => CH46_PARTS.some(p => P.hp[p.id] < 0.98);
  P.partName = id => (CH46_PARTS.find(p => p.id === id) || {}).name || id;

  // ------------------------------------------------------------------------------------------- read-outs
  const _att = {};
  P.panel = () => {
    S.attitude(_att); const b = S.body, vb = b.bodyVel([0, 0, 0]);
    return {
      ias: Math.max(0, vb[0]) * KT, alt: b.pos[1] * 3.28084, vsi: b.vel[1] * 196.85, pitch: _att.pitch, roll: _att.roll, hdg: -_att.yaw, agl: S.agl, landed: S.landed,
      nr: S.rpm, n1: [S.eng[0].n1, S.eng[1].n1], n2: [S.rpm * (S.eng[0].lit ? 1 : 0.0), S.rpm * (S.eng[1].lit ? 1 : 0.0)],
      tq: [S.eng[0].q * CH46.OMEGA / (CH46.XMSN / 2) * 100, S.eng[1].q * CH46.OMEGA / (CH46.XMSN / 2) * 100],
      slip: clamp(Math.atan2(vb[1], Math.max(3, Math.abs(vb[0]))) * 2, -1, 1), turn: b.w[2],
      fuelLb: P.fuel / 100 * CH46.FUEL_KG * 2.2046, fuelPct: P.fuel, volts: sys.volts, utilPsi: sys.utilPsi,
      cautions: sys.cautions, master: sys.master, rpmWarn: sys.rpmWarn, avionics: P.hp.avionics,
      sw: { bat: sys.bat, apu: sys.apu, gen1: sys.gen[0], gen2: sys.gen[1], ecl1: sys.ecl[0], ecl2: sys.ecl[1], start1: sys.start[0], start2: sys.start[1], rbrake: sys.rbrake, pbrake: sys.pbrake, sas: sys.sas, afcs: sys.afcs, light: P.light, ramp: P.rampCmd > 0.5 },
      ctl: { cx: S.c.lat, cy: S.c.lon, pedal: S.c.ped, coll: S.c.coll },
      vrs: Math.max(S.rf.vrs, S.ra.vrs), stall: Math.max(S.rf.stall, S.ra.stall),
    };
  };
  P.ias = () => Math.max(0, S.body.bodyVel(_p)[0]) * KT;
  P.torquePct = () => S.torque * 100;
  // the numbers line under the outside views (like the Huey's)
  P.line = () => {
    const pnl = P.panel(), f = [pnl.vrs > 0.4 && 'VORTEX RING!', sys.rpmWarn && 'RPM!', pnl.stall > 0.3 && 'BLADE STALL!', S.torque > 1.02 && 'OVERTORQUE'].filter(Boolean).join('  ');
    return `NR ${(S.rpm * 100).toFixed(0)}%  TQ ${pnl.tq[0].toFixed(0)}/${pnl.tq[1].toFixed(0)}%  N1 ${(pnl.n1[0] * 100).toFixed(0)}/${(pnl.n1[1] * 100).toFixed(0)}%  IAS ${pnl.ias.toFixed(0)}kt  VS ${Math.round(pnl.vsi / 100) * 100}fpm  RALT ${(S.agl * 3.28084).toFixed(0)}ft  HDG ${String(Math.round(((pnl.hdg * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}  COLL ${(S.c.coll * 100).toFixed(0)}%  ${sys.afcs ? 'AFCS' : sys.sas ? 'SAS' : 'MANUAL'}  TROOPS ${P.marines}  [${P.source}]${f ? '  ' + f : ''}`;
  };
  // what to do next: the start sequence, then the emergencies
  P.hint = () => {
    const e = S.eng, n = i => Math.round(e[i].n1 * 100);
    if (!P.alive) return '';
    if (!P.running() && !sys.auto && !sys.start[0] && !sys.start[1]) return !S.landed ? 'BOTH ENGINES OUT  -  COLLECTIVE DOWN, HOLD NR, 70 KT, FLARE AT ~100 FT, CUSHION' : 'ENGINES OFF  -  I: START  ·  BY HAND: BATTERY, APU, ECL TO GND IDLE, HOLD START TO 45% N1, ROTOR BRAKE OFF, ECLs TO FLY';
    if (sys.auto === 'apu') return `APU STARTING  -  ${Math.min(100, Math.round(sys.apuT / 6 * 100))}%`;
    if (sys.start[0] || sys.start[1] || sys.auto === 'eng1' || sys.auto === 'eng2') return `STARTING  -  N1 ${n(0)}% / ${n(1)}%${e[0].lit || e[1].lit ? '  -  LIGHT-OFF' : ''}`;
    if (S.landed && sys.rbrake && P.running()) return 'ROTOR BRAKE ON  -  RELEASE IT (CLICK THE BRAKE HANDLE, OR I)';
    if (S.landed && (sys.ecl[0] < 1 || sys.ecl[1] < 1) && P.running()) return 'ENGINES AT GROUND IDLE  -  ECLs TO FLY (CLICK THE LEVERS, OR I)';
    if (S.landed && S.rpm < 0.95) return `ROTORS COMING UP TO 264 RPM  -  NR ${Math.round(S.rpm * 100)}%`;
    if (S.landed) return '';
    if (S.live === 0 && S.rpm > 0.3) return 'AUTOROTATION  -  COLLECTIVE TO HOLD NR, 70 KT, FLARE AT ~100 FT, CUSHION WITH THE COLLECTIVE';
    if (Math.max(S.rf.vrs, S.ra.vrs) > 0.5) return 'VORTEX RING STATE  -  FORWARD CYCLIC: FLY OUT OF YOUR OWN DOWNWASH';
    if (S.torque > 1.02) return 'OVERTORQUE  -  100% XMSN TORQUE IS THE LIMIT';
    if (sys.rpmWarn && S.rpm < 0.94) return 'LOW ROTOR RPM  -  LOWER THE COLLECTIVE';
    return '';
  };
  return P;
}
