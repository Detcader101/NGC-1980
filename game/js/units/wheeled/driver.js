// driver.js - turns what a player (or an AI) wants into vehiclefm.js pedals and levers. Pure JS, node-testable.
// The physics never cheats: this is a driver working a real clutch, gearbox and pedals, like the Huey's stability assist.
//   mode 'auto'   : automatic clutch and gear changes; hold brake at a standstill to engage reverse (then the throttle
//                   key brakes and the brake key drives backwards, arcade style)
//   mode 'semi'   : automatic clutch, the player changes gear (shiftUp / shiftDown)
//   mode 'manual' : everything by hand: clutch pedal, gear lever (and you can stall it)
// input: { throttle 0..1, brake 0..1, steer -1..1, handbrake 0..1, clutch 0..1 (manual), shiftUp, shiftDown (edges),
//          gear (manual: direct), range, fwd, lock, ignition, starter, horn, kit }
// steering: the wheel turns at a human rate (spec.steer.turns, ~1.5 turns/s) and centres when let go (keyboard);
// an analogue stick sets the position directly (input.steerAbs = true).
import { table } from './vehiclefm.js';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const RPM = 60 / (2 * Math.PI);

export function createDriver(spec, mode = 'auto') {
  const E = spec.engine, GB = spec.gearbox, n = GB.ratios.length, diesel = E.diesel;
  const top = E.governor ? E.governor[0] : E.redline * 0.93;
  const D = {
    mode, ctl: { throttle: 0, brake: 0, clutch: 0, steer: 0, handbrake: 0, gear: 0, range: 'H', fwd: false, lock: false, ignition: true, starter: false, horn: false, kit: false },
    steer: 0, shift: 0, shiftTo: 0, hold: 0, lastShift: 0, reverse: false, revHold: 0, t: 0, launch: 0, rm: 0, acc: 0, v0: null, le: 0,
    reset(sim) { D.ctl.gear = sim.gear; D.shift = 0; D.reverse = sim.gear < 0; D.steer = 0; D.ctl.range = sim.range; D.ctl.fwd = sim.fwd; },
    update(sim, input, dt) {
      const c = D.ctl; D.t += dt;
      // the driver's feel for the acceleration (smoothed dv/dt)
      if (dt > 0) { const a = (sim.speed - (D.v0 ?? sim.speed)) / dt; D.acc += (a - D.acc) * Math.min(1, dt * 3); D.v0 = sim.speed; }
      // ---- steering wheel
      const rate = 1.6 / Math.max(1, spec.steer.turns) * 2 * (1 + 0.5 * (diesel ? 0 : 1));   // full lock per second-ish
      if (input.steerAbs) D.steer = clamp(input.steer || 0, -1, 1);
      else {
        const s = clamp(input.steer || 0, -1, 1);
        if (Math.abs(s) > 0.01) D.steer = clamp(D.steer + s * rate * dt * (Math.sign(s) !== Math.sign(D.steer) ? 1.6 : 1), -1, 1);
        else D.steer -= Math.sign(D.steer) * Math.min(Math.abs(D.steer), rate * 1.3 * dt * (0.4 + Math.min(1, Math.abs(sim.speed) / 8)));
      }
      c.steer = D.steer;
      for (const k of ['range', 'fwd', 'lock', 'ignition', 'starter', 'horn', 'kit']) if (input[k] !== undefined) c[k] = input[k];
      c.handbrake = input.handbrake || 0;
      if (D.mode === 'manual') {
        c.throttle = input.throttle || 0; c.brake = input.brake || 0; c.clutch = input.clutch || 0;
        if (input.gear !== undefined) c.gear = input.gear;
        if (input.shiftUp) c.gear = Math.min(n, c.gear + 1);
        if (input.shiftDown) c.gear = Math.max(-1, c.gear - 1);
        return c;
      }
      // ---- direction: reverse by holding brake at a standstill (auto), or the lever (semi)
      let thr = input.throttle || 0, brk = input.brake || 0;
      const v = sim.speed, rpm = sim.eng.rpm, idle = E.idle;
      if (D.mode === 'auto') {
        if (Math.abs(v) < 0.6 && brk > 0.5 && thr < 0.05 && !D.reverse) { D.revHold += dt; if (D.revHold > 0.35) { D.reverse = true; D.revHold = 0; } }
        else if (Math.abs(v) < 0.6 && thr > 0.5 && D.reverse && brk < 0.05) { D.revHold += dt; if (D.revHold > 0.2) { D.reverse = false; D.revHold = 0; } }
        else D.revHold = 0;
        if (D.reverse) { const t = thr; thr = brk; brk = t; }
      }
      // ---- gear selection
      const ratioOf = g => g < 0 ? GB.reverse : g > 0 ? GB.ratios[g - 1] : 0;
      const wOut = sim.solver.w[1];   // gearbox output shaft (rad/s)
      const rpmIn = g => Math.abs(wOut * ratioOf(g)) * RPM;
      let want = c.gear;
      if (D.mode === 'auto') {
        if (D.reverse) want = -1;
        else if (want <= 0) want = (thr > 0.02 || Math.abs(v) > 1) ? 1 : (want < 0 ? 0 : want);
        else if (D.shift === 0 && D.t - D.lastShift > (diesel ? 1.6 : 1.0)) {
          const up = top * (0.62 + 0.33 * thr), down = idle * (diesel ? 1.25 + 0.5 * thr : 1.35 + 0.9 * thr);
          // up: revs high and the next gear can still pull what the vehicle needs now (a loaded truck crawling up a
          // 60% grade stays in first); down: revs low
          const r1 = ratioOf(want), r2 = ratioOf(want + 1);
          const rng = sim.range === "L" ? (sim.spec.transfer.low || 1) : sim.spec.transfer.high, fin = sim.spec.axles.find(a => a.driven)?.final || 1;
          // gears are judged by ROAD speed, not by spinning wheels (in mud the revs say nothing)
          const vv = Math.abs(v), rpmV = g => vv / sim.wheels[0].r * fin * rng * ratioOf(g) * RPM, rpm2 = rpmV(want + 1);
          // what it takes to keep going: the slope (felt through the seat), rolling resistance and drag, in engine N m x ratio
          const need = (sim.massNow * 9.81 * (Math.max(0, Math.sin(sim.pitch)) + 0.025) + 0.6 * sim.spec.aero.CdA * vv * vv) * sim.wheels[0].r / (fin * rng * 0.9);
          const can = table(E.curve, rpm2) * (E.installed ?? 1) * r2;
          if (want < n && rpmV(want) > up && c.clutch < 0.1 && thr > 0.05 && rpm2 > down * 1.03 && (thr < 0.9 || can > need * 1.15)) want++;
          else if (want > 1 && rpm < down && rpmIn(want - 1) < top * 0.9 && (GB.synchro[want - 2] || Math.abs(wOut) < 0.5)) want--;
          else if (want > 1 && Math.abs(v) < 0.8 && brk > 0 && (GB.synchro[0] || Math.abs(wOut) < 0.5)) want = 1;
        }
      } else {
        if (input.shiftUp) want = Math.min(n, c.gear + 1);
        if (input.shiftDown) want = Math.max(-1, c.gear - 1);
        if (input.gear !== undefined) want = input.gear;
      }
      // ---- the shift itself: clutch down, lift, move the lever, (blip), clutch out
      const shiftTime = diesel ? 0.75 : 0.42;
      if (want !== c.gear && D.shift === 0) { D.shift = shiftTime; D.shiftTo = want; D.lastShift = D.t; }
      if (D.shift > 0) {
        D.shift -= dt;
        c.clutch = 1; c.throttle = 0;
        // move the lever halfway through (the box needs the clutch down first); blip for a downshift
        if (D.shift < shiftTime * 0.55) { c.gear = D.shiftTo; if (sim.gear !== D.shiftTo) c.gear = D.shiftTo; if (D.shiftTo > 0 && rpmIn(D.shiftTo) > rpm + 150) c.throttle = clamp((rpmIn(D.shiftTo) - rpm) / 1200, 0, 0.8); }
        if (D.shift <= 0) { D.shift = 0; D.rm = 0.35; }
        c.brake = Math.abs(v) < 1.5 ? Math.max(brk, 0.7) : brk; return c;   // changing gear at a crawl: foot on the brake (hills)
      }
      // ---- automatic clutch: a launch that slips to a target rpm, locks once the shafts match, never lugs below stall
      const g = c.gear, ratio = ratioOf(g);
      if (!sim.eng.running) { c.clutch = 1; c.throttle = thr; c.brake = brk; return c; }
      if (g === 0) { c.clutch = 0; c.throttle = thr; c.brake = brk; return c; }
      const inRpm = rpmIn(g);
      const launch = idle + (diesel ? 350 + 650 * thr : 500 + 1500 * thr);
      // launch controller: slip the clutch to hold the launch rpm (the engine makes its torque, a turbo diesel builds
      // boost), engage further as the shafts come up to speed, lock once they match; never lug the engine below stall
      if (inRpm > idle * 1.08 && rpm > idle * 0.98 && rpm - inRpm < 250) D.le = 1;         // shafts matched: in
      else if (thr > 0.02 || inRpm > idle * 0.9) D.le = clamp(D.le + dt * (2.2 * (rpm - launch) / Math.max(200, launch - idle) + 0.25 * inRpm / launch), 0, 1);
      else D.le = 0;
      if (rpm < idle * 0.82) D.le = Math.min(D.le, 0.05);                                    // about to stall: clutch down
      if (brk > 0.3 && inRpm < idle * 0.95) D.le = 0;                                        // braking to a stop: clutch down
      let eng = D.le;
      if (D.rm > 0) { D.rm -= dt; eng = Math.min(eng, 1 - D.rm / 0.35 * 0.8); }              // release ramp after a shift
      const target = 1 - (0.08 + 0.62 * eng);                                                // pedal for that engagement (see vehiclefm)
      c.clutch += clamp(target - c.clutch, -dt * 4, dt * 6);
      if (eng >= 1) c.clutch = Math.min(c.clutch, 0);
      // wheelspin: feather the throttle (in mud a spinning tyre digs itself in)
      let spin = 0, nd = 0; for (const W of sim.wheels) if (sim.spec.axles[W.spec.axle].driven && W.contact) { spin += Math.max(0, W.ts.kappa * Math.sign(ratio || 1)); nd++; }
      spin = nd ? spin / nd : 0;
      if (spin > 0.35 && eng >= 1) thr *= clamp(1 - (spin - 0.35) * 1.2, 0.3, 1);
      // feeding the clutch, a driver keeps the revs up: throttle to hold the launch rpm (never more than asked + 0.5)
      if (eng < 1 && thr > 0.02 && rpm < launch) thr = Math.max(thr, Math.min(1, thr + 0.5, (launch - rpm) / (diesel ? 500 : 700)));
      // hill start: on a slope, the foot (or the handbrake) holds the vehicle until the clutch bites
      if (Math.abs(v) < 0.4 && Math.abs(sim.pitch) > 0.05 && thr > 0.02 && eng < 0.5) brk = Math.max(brk, 0.7 * (1 - eng / 0.5));
      c.throttle = thr; c.brake = brk;
      void ratio; return c;
    },
  };
  return D;
}

// AI: steer for a point and hold a speed (pure pursuit on the target, speed by throttle / brake). Returns an input for
// driver.update in 'auto' mode. target {x, z}, vWant m/s (negative = back up).
export function aiInput(sim, target, vWant, out = {}) {
  const dx = target.x - sim.pos[0], dz = target.z - sim.pos[2];
  const fx = sim.fwdv[0], fz = sim.fwdv[2], rx = -fz, rz = fx;   // right = fwd x up
  const along = dx * fx + dz * fz, side = dx * rx + dz * rz, L = Math.hypot(dx, dz) || 1;
  const wb = sim.spec.dims.wheelbase, curv = 2 * side / (L * L);
  let steer = Math.atan(curv * wb) / sim.spec.steer.max;
  if (along < 0 && vWant > 0) steer = Math.sign(side) || 1;
  out.steer = clamp(steer * (vWant < 0 ? -1 : 1), -1, 1); out.steerAbs = true;
  const v = sim.speed, err = vWant - v;
  if (vWant >= 0) { out.throttle = clamp(err * 0.35 + 0.1, 0, 1) * (err > -0.3 ? 1 : 0); out.brake = clamp(-err * 0.3, 0, 1) * (err < -0.8 ? 1 : 0); }
  else { out.throttle = clamp(-err * 0.3, 0, 1) * (err > 0.8 ? 1 : 0); out.brake = clamp(err * 0.35 + 0.1, 0, 1) * (err < 0.3 ? 1 : 0); }
  out.handbrake = 0; return out;
}
