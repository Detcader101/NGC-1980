// TOMCAT (the flyable F-14A): from the helicopter on the ALBATROSS deck, 8 puts you on cat 1. Cockpit on the cat, the
// shot (keyboard throttles to MIL), the climb-out (stick, gear, flaps), the wings sweeping aft with Mach in a burner
// run (CADC AUTO), a hard turn, a compressor stall at high AoA and the recovery (idle, nose down), the RIO's seat with
// RUNAWAY fighters on the TID / DDD, an arrested landing flown like the AI's LSO pattern, climbing out on deck and back
// in, then a second Tomcat off the cat and an ejection of both seats.
//   CHROME_PATH=... node snap.mjs scenes/tomcat.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 20000); await h.wait(1200);
  await h.key('tap', 'Digit8'); await h.wait(600);
  await h.expect('__G.G.craft === "tomcat" && __G.tomcatC.TP.A.cat && __G.tomcatC.TP.A.cat.state === "hold" && __G.G.tomcats === 1');
  await h.eval('(window.T = __G.tomcatC.TP, window.A = T.A, __G.cockpitCam = true, 1)');
  await h.wait(1500); await h.shot('cockpit-on-the-cat');
  await h.eval('(T.zoom = 1, __G.head.pitch = 0.08, 1)'); await h.wait(600); await h.shot('hud-on-the-cat'); await h.eval('(T.zoom = 0, __G.head.pitch = 0, 1)');
  // ---- the shot: keyboard throttles to MIL and hold
  await h.key('down', 'ShiftLeft'); await h.waitFor('T.thr > 0.81', 10000); await h.key('up', 'ShiftLeft');
  await h.eval('({thr: T.thr, n: A.eng.map(e => +e.n.toFixed(2)), clear: A.catClear})');
  await h.waitFor('!A.cat', 90000);
  await h.eval('({eas: A.eas * 1.944, y: A.pos.y, alive: T.alive})');
  await h.key('hold', 'KeyS', 1000); await h.key('tap', 'KeyG');
  await h.waitFor('A.pos.y > 30 || !T.alive', 30000);
  await h.expect('T.alive && A.pos.y > 30');
  await h.key('tap', 'KeyL'); await h.shot('cockpit-climb-out');
  await h.eval('({eas: A.eas * 1.944, alt: A.pos.y, gear: A.gear, flap: A.flapSel, pitch: A.attitude().pitch, trim: A.trim, loss: T.lastLoss})');
  // ---- climb to 700 m on the flight director, then a burner run: the CADC sweeps the wings aft with Mach
  await h.eval(`(() => { const FD = T.FD; T.autopilot = (A, dt) => { const fd = FD; fd.steer(fd.dirHdg(A.heading(), Math.max(-0.1, Math.min(0.25, (700 - A.pos.y) * 0.004))), dt, { gmax: 4, eas: window.__spd || 150, ab: true }); const c = fd.ctl; T.thr = c.throttle[0]; return { pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: c.throttle, brakeL: 0, brakeR: 0 }; }; window.__spd = 150; return 1; })()`);
  await h.waitFor('A.pos.y > 550', 90000);
  await h.eval('({alt: A.pos.y, eas: A.eas * 1.944, sweep: A.sweep, mach: A.mach})');
  await h.eval('(window.__spd = 330, window.__sw = [], 1)');
  await h.waitFor('(window.__sw.push([+A.mach.toFixed(2), +A.sweep.toFixed(0)]), A.mach > 0.92 && A.sweep > 55)', 120000);
  await h.eval('({mach: A.mach, sweep: A.sweep, sched: T.sweep.cmdNow, log: window.__sw.filter((_, i) => i % 12 === 0)})');
  await h.expect('A.sweep > 55 && T.sweep.mode === "AUTO"');
  await h.eval('(__G.head.pitch = -0.42, __G.head.yaw = 0.25, 1)'); await h.wait(500); await h.shot('cockpit-swept-wings-sweep-gauge'); await h.eval('(__G.head.pitch = 0, __G.head.yaw = 0, 1)');
  await h.eval('(__G.cockpitCam = false, T.snapChase(), 1)'); await h.wait(1200); await h.shot('chase-wings-swept');
  // ---- a hard turn at the corner: roll right, pull 6 g
  await h.eval('(window.__spd = 200, 1)'); await h.waitFor('A.eas * 1.944 < 380', 60000);
  await h.eval(`(() => { const FD = T.FD; window.__nz = 0; T.autopilot = (A, dt) => { FD.ctl.roll = FD.rollFor(1.35); FD.ctl.pitch = FD.pitchFor(6.2, dt); FD.setThrottle(FD.throttleFor(180, dt, true)); window.__nz = Math.max(window.__nz, A.nz); const c = FD.ctl; T.thr = c.throttle[0]; return { pitch: c.pitch, roll: c.roll, yaw: 0, throttle: c.throttle, brakeL: 0, brakeR: 0 }; }; return 1; })()`);
  await h.waitFor('window.__nz > 5.5', 30000); await h.wait(800); await h.shot('chase-hard-turn');
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(700); await h.shot('cockpit-hard-turn');
  await h.eval('({nz: A.nz, nzMax: window.__nz, eas: A.eas * 1.944, sweep: A.sweep, roll: A.attitude().roll, grey: T.gfx().grey})');
  await h.expect('window.__nz > 5.5 && T.alive');
  // ---- level out, slow down, then a high-AoA, full-power, cross-controlled pull: the TF30 stalls; idle + nose down clears it
  await h.eval(`(() => { const FD = T.FD; window.__ph = 'level'; window.__ev = []; T.autopilot = (A, dt) => {
      for (const e of A.events) if (e.e === 'compstall' || e.e === 'stallclear' || e.e === 'flameout') window.__ev.push(e.e + e.k);
      if (window.__ph === 'level') { FD.steer(FD.dirHdg(A.heading(), Math.max(-0.1, Math.min(0.2, (800 - A.pos.y) * 0.004))), dt, { gmax: 3, eas: 72, ab: false }); const c = FD.ctl; T.thr = c.throttle[0]; if (A.eas < 80 && A.pos.y > 650) window.__ph = 'pull'; return { pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: c.throttle, brakeL: 0, brakeR: 0 }; }
      if (window.__ph === 'pull') { T.thr = 1; if (A.eng.some(e => e.stalled)) window.__ph = 'recover'; return { pitch: 1, roll: 0, yaw: 0.7, throttle: [1, 1], brakeL: 0, brakeR: 0 }; }
      if (A.eng.some(e => e.stalled) || A.alpha > 0.2) { T.thr = 0; return { pitch: -0.35, roll: FD.rollFor(0), yaw: 0, throttle: [0, 0], brakeL: 0, brakeR: 0 }; }
      FD.steer(FD.dirHdg(A.heading(), 0.05), dt, { gmax: 3, eas: 140, ab: false }); const c = FD.ctl; T.thr = c.throttle[0]; return { pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: c.throttle, brakeL: 0, brakeR: 0 };   // recovered: level off, power up slowly
    }; return 1; })()`);
  await h.waitFor("window.__ph !== 'level'", 120000);
  await h.eval('({ph: window.__ph, alt: A.pos.y, eas: A.eas * 1.944})');
  await h.waitFor("window.__ph === 'recover' || !T.alive", 120000);
  await h.wait(300); await h.shot('cockpit-compressor-stall');
  await h.eval('({ev: window.__ev, stalled: A.eng.map(e => !!e.stalled), cue: T.stallCue, caut: T.cautions, egt: A.eng.map(e => Math.round(e.egt)), n: A.eng.map(e => +e.n.toFixed(2)), alt: A.pos.y})');
  await h.waitFor('!A.eng.some(e => e.stalled) || !T.alive', 90000); await h.wait(600);   // (the autopilot hook logs the events a frame later)
  await h.eval('({ev: window.__ev, run: A.eng.map(e => e.run), alt: A.pos.y, eas: A.eas * 1.944})');
  await h.expect("T.alive && window.__ev.some(e => e.startsWith('compstall')) && window.__ev.some(e => e.startsWith('stallclear')) && A.eng.every(e => e.run)");
  // ---- level off again and move to the RIO's seat: two RUNAWAY fighters out ahead for the AWG-9
  await h.eval(`(() => { const FD = T.FD; T.autopilot = (A, dt) => { FD.steer(FD.dirHdg(A.heading(), Math.max(-0.15, Math.min(0.2, (800 - A.pos.y) * 0.004))), dt, { gmax: 3, eas: 150, ab: false }); const c = FD.ctl; T.thr = c.throttle[0]; return { pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: c.throttle, brakeL: 0, brakeR: 0 }; }; return 1; })()`);
  await h.waitFor('A.eas * 1.944 > 260', 60000);
  await h.eval(`(() => { const f = A.forward(new __G.THREE.Vector3()); for (let i = 0; i < 2; i++) { const u = __G.war.air.spawnShrike({ x: A.pos.x + f.x * (2400 + i * 300) + i * 200, y: A.pos.y + 50, z: A.pos.z + f.z * (2400 + i * 300), yaw: A.heading() * -1 + Math.PI }); u.mesh.visible = true; } return __G.war.units.filter(u => u.type === 'shrike').length; })()`);
  await h.eval('(T.autopilot = null, 1)');
  await h.key('tap', 'BracketRight'); await h.wait(1200);
  await h.expect('T.seat === 1 && __G.crafts.seat === 1');
  await h.key('tap', 'KeyB'); await h.wait(300); await h.key('tap', 'KeyL'); await h.wait(1500);
  await h.eval('({tracks: T.tracks.map(t => [t.n, t.name, Math.round(t.range)]), hook: T.hook && T.hook.n, lock: T.lock, alt: A.pos.y, rioAlt: T.rio.alt, rwr: T.rwr.length})');
  await h.shot('rio-tid-ddd');
  await h.eval('(__G.head.pitch = -0.25, 1)'); await h.wait(500); await h.shot('rio-tid-close'); await h.eval('(__G.head.pitch = 0, 1)');
  await h.expect('T.tracks.length >= 1 && T.alive');
  await h.key('tap', 'BracketLeft'); await h.wait(300);
  await h.expect('T.seat === 0');
  await h.eval('(() => { for (const u of __G.war.units) if (u.type === "shrike") { u.dead = true; } return 1; })()');
  // ---- the trap: set up 450 m behind the ALBATROSS on the glideslope, gear / flaps / hook, flown on 15 units
  await h.eval(`(() => {
    const c = __G.war.carrier, FD = T.FD; c.path = [];
    const aimZ = 41 - 8.0, gs = 3.5 * Math.PI / 180, dist = 450, aoa = 10.5 * Math.PI / 180;
    const loc = (x, z) => { const co = Math.cos(c.yaw), si = Math.sin(c.yaw), dx = x - c.p.x, dz = z - c.p.z; return [dx * co - dz * si, dx * si + dz * co]; };
    const toW = (lx, lz) => { const co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [c.p.x + lx * co + lz * si, c.p.z - lx * si + lz * co]; };
    const [x, z] = toW(-2.5, aimZ + dist);
    A.reset(x, 0, z, c.yaw, { running: true, airborne: true, alt: 8 + 2.4 + Math.tan(gs) * dist - 2.38, speed: 34 + c.speed });
    A.gear = A.gearCmd = 1; A.flapSel = 2; A.surf.flap = 1; A.hook = A.hookCmd = 1; A.sweep = 20; A.fuel = 2500; for (const e of A.eng) e.n = 0.85;
    A.stores.forEach((s, i) => s.on = i < 2); T.sweep.mode = 'AUTO'; T.hudAuto = true; FD.reset(); FD.gi = 0;
    let thrI = 0.55; window.__trap = null;
    T.autopilot = (A, dt) => {
      for (const e of A.events) if (e.e === 'trap') window.__trap = e.wire;
      const o = { pitch: 0, roll: 0, yaw: 0, throttle: [0, 0], brakeL: 0, brakeR: 0 };
      if (A.trapWire || A.wire) { const t = A.wire && A.wire.held === 0 ? 0.8 : 0; o.throttle = [t, t]; T.thr = t; if (!A.wire) o.brakeL = o.brakeR = 1; return o; }
      if (A.onGround) { o.throttle = [0.8, 0.8]; return o; }
      const [lx, lz] = loc(A.pos.x, A.pos.z), R = lz - aimZ, yDes = 8 + 2.4 + Math.tan(gs) * Math.max(0, R);
      const vyDes = -Math.tan(gs) * 28 + 0.25 * (yDes - A.pos.y), aerr = A.alpha - aoa;
      thrI = Math.max(0, Math.min(0.79, thrI + aerr * 0.8 * dt)); const t = Math.max(0, Math.min(1, thrI + aerr * 3)); T.thr = t;
      o.throttle = [t, t]; o.pitch = FD.pitchFor(Math.cos(A.attitude().pitch) + 0.12 * (vyDes - A.vel.y), dt);
      const vx = A.vel.x * Math.cos(c.yaw) - A.vel.z * Math.sin(c.yaw);
      o.roll = Math.max(-1, Math.min(1, (-(lx + 2.5) * 0.01 - vx * 0.04 - A.attitude().roll) * 1.5 - A.w.x * 0.2));
      return o;
    };
    return 1; })()`);
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(2500); await h.shot('cockpit-approach');
  await h.eval('(__G.cockpitCam = false, T.snapChase(), 1)'); await h.wait(1500); await h.shot('chase-approach');
  await h.waitFor('A.trapWire > 0 || !T.alive', 60000);
  await h.eval('({wire: A.trapWire, alive: T.alive, loss: T.lastLoss})');
  await h.wait(500); await h.shot('chase-trap');
  await h.waitFor('T.stoppedOnDeck() || !T.alive', 40000); await h.wait(800);
  await h.expect('T.alive && A.trapWire > 0 && T.stoppedOnDeck()');
  await h.eval('(T.autopilot = null, __G.cockpitCam = true, 1)'); await h.wait(1200); await h.shot('cockpit-trapped');
  // ---- climb out on deck (Y), look at it parked, climb back in (Y at the ladder), the wings to OVERSWEEP for the deck
  await h.key('tap', 'KeyY'); await h.wait(900);
  await h.expect('__G.G.craft === "foot" && __G.tomcatC.park.on && T.active');
  await h.eval("(__G.foot.view = 'third', __G.foot.W.yaw += 2.4, 1)"); await h.wait(1200); await h.shot('out-beside-the-parked-tomcat');
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect('__G.G.craft === "tomcat" && !__G.foot.exists');
  await h.key('tap', 'Digit9'); await h.key('down', 'Minus'); await h.waitFor('T.sweep.handle > 74', 30000); await h.key('up', 'Minus'); await h.waitFor('A.sweep > 74', 30000);
  await h.eval('({mode: T.sweep.mode, handle: T.sweep.handle, sweep: A.sweep, simMode: A.sweepMode})');
  await h.expect('T.sweep.mode === "OVER" && A.sweep > 70');
  await h.eval('(__G.cockpitCam = false, T.snapChase(), 1)'); await h.wait(1200); await h.shot('chase-oversweep-on-deck');
  await h.key('tap', 'Digit9'); await h.wait(300);
  // ---- back to the cat (8), launch, and eject both seats
  await h.key('tap', 'Digit8'); await h.wait(600);
  await h.expect('A.cat && A.cat.state === "hold"');
  await h.key('down', 'ShiftLeft'); await h.waitFor('T.thr > 0.81', 10000); await h.key('up', 'ShiftLeft');
  await h.waitFor('!A.cat', 90000); await h.key('hold', 'KeyS', 1000); await h.key('tap', 'KeyG');
  await h.waitFor('A.pos.y > 60 || !T.alive', 30000);
  await h.eval('({alt: A.pos.y, eas: A.eas * 1.944})');
  await h.key('hold', 'Backspace', 1300); await h.wait(500);
  await h.expect('!!T.ejected');
  await h.waitFor('T.ejected.seats.every(s => s.out)', 10000); await h.wait(1500);
  await h.shot('chase-two-chutes');
  await h.eval('({seats: T.ejected.seats.map(s => [Math.round(s.pos.y), s.out])})');
  await h.waitFor('__G.G.craft === "heli"', 90000);
  await h.expect('__G.G.craft === "heli" && __G.G.tomcats === 1 && !__G.tomcatC.TP.active');   // the lost airframe; one left in the hangar
}
