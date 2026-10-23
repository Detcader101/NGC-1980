// F-14A TOMCAT systems the player works (pure: no THREE, no DOM; runs in node, see tools/tomcatsysbench.mjs):
// - the WING SWEEP controls: AUTO (the CADC program), MAN (the thumb switch on the outboard throttle: aft of the
//   program only), the EMERGENCY handle (guard up: the wings go where the handle is, 20-68°) and OVERSWEEP (handle aft
//   past 68° on deck, weight on wheels, slow: 75°, to park). A dead CADC freezes the wings in AUTO / MAN; the
//   emergency handle still moves them (NATOPS: "wing sweep emergency"). The sim (tomcatfm.js config) does the motion.
// - the AFCS: stability augmentation (pitch / roll / yaw dampers: off = the stick straight to the surfaces), the
//   autopilot's ATTITUDE HOLD with control stick steering (fly it with the stick, let go and it holds the new attitude;
//   banks under 7° roll out and hold the heading) and ALTITUDE HOLD. It drops out past 70° of bank, with the gear
//   handle down, on the ground, or with the stab aug off / failed.
// - the TF30 start: air for the starter from the deck's start cart, cross-bleed from the other engine, or ram air
//   (windmill airstart above ~225 KEAS).
import { cadcSweep } from './tomcatfm.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const D2R = Math.PI / 180, KT = 1.94384;
export const SWEEP_RATE_HANDLE = 12;   // °/s the pilot moves the emergency handle / the MAN command (game)

// ------------------------------------------------------------------------------------------------ wing sweep
export function createSweepControl() { return { mode: 'AUTO', cmd: 20, handle: 20, thumb: 0, frozen: null, cmdNow: 20 }; }
export const overOk = A => A.onGround && A.eas < 30;   // the sim's OVERSWEEP gate (tomcatfm.js config)
// discrete presses: 'auto' | 'fwd' | 'aft' (one 5° click) | 'emer' (raise / stow the handle's guard). Returns a message.
export function sweepPress(SW, A, id) {
  if (id === 'auto') { if (SW.mode === 'EMER' || SW.mode === 'OVER') return 'STOW THE EMERGENCY HANDLE FIRST (9)'; SW.mode = 'AUTO'; return 'WING SWEEP AUTO  -  CADC'; }
  if (id === 'fwd' || id === 'aft') {
    const d = id === 'aft' ? 5 : -5;
    if (SW.mode === 'AUTO') { SW.mode = 'MAN'; SW.cmd = A.sweep; }
    if (SW.mode === 'MAN') SW.cmd = clamp(SW.cmd + d, 20, 68); else SW.handle = clamp(SW.handle + d, 20, A.onGround ? 75 : 68);
    return '';
  }
  if (id === 'emer') {
    if (SW.mode === 'EMER' || SW.mode === 'OVER') { SW.mode = 'AUTO'; return 'EMERGENCY HANDLE STOWED  -  WING SWEEP AUTO'; }
    SW.mode = 'EMER'; SW.handle = Math.round(A.sweep);
    return `EMERGENCY WING SWEEP  -  HANDLE AT ${SW.handle}°  (- / = MOVE IT${A.onGround ? ', AFT PAST 68 = OVERSWEEP' : ''})`;
  }
  return '';
}
// every frame: fwd / aft held (keys or the HOTAS switch), the CADC's health. Sets the sim's A.sweepMode / A.sweepCmd.
export function sweepStep(SW, A, fwd, aft, dt, cadcOk = true) {
  SW.thumb = fwd ? 1 : aft ? -1 : 0;
  const d = (aft ? 1 : 0) - (fwd ? 1 : 0);
  if (SW.mode === 'EMER' || SW.mode === 'OVER') {
    SW.handle = clamp(SW.handle + d * SWEEP_RATE_HANDLE * dt, 20, A.onGround ? 75 : 68);   // the quadrant's OVER gate opens on deck only
    SW.mode = SW.handle > 68.5 ? 'OVER' : 'EMER';
  } else if (d) { if (SW.mode === 'AUTO') { SW.mode = 'MAN'; SW.cmd = A.sweep; } SW.cmd = clamp(SW.cmd + d * 15 * dt, 20, 68); }
  if (!cadcOk && (SW.mode === 'AUTO' || SW.mode === 'MAN')) { if (SW.frozen === null) SW.frozen = A.sweep; A.sweepMode = 'emer'; A.sweepCmd = SW.frozen; }
  else { SW.frozen = null; A.sweepMode = { AUTO: 'auto', MAN: 'manual', EMER: 'emer', OVER: 'over' }[SW.mode]; A.sweepCmd = SW.mode === 'MAN' ? SW.cmd : SW.handle; }
  // where the wings are going (the indicator's command bug)
  const sched = cadcSweep(A.mach), flaps = A.flapSel > 0 || A.surf.flap > 0.05;
  SW.cmdNow = SW.frozen !== null ? SW.frozen : SW.mode === 'AUTO' ? (flaps ? 20 : sched) : SW.mode === 'MAN' ? (flaps ? 20 : Math.max(sched, SW.cmd))
    : SW.mode === 'OVER' ? (overOk(A) ? 75 : sched) : SW.handle;
  return SW.cmdNow;
}

// ------------------------------------------------------------------------------------------------ AFCS
export function createAfcs() { return { mode: 'OFF', ref: { pitch: 0, roll: 0, hdg: 0, alt: 0 }, css: false, drop: 0 }; }
// engage 'ATT' / 'ALT' (or 'OFF'): returns '' when engaged / off, else why not
export function afcsEngage(AP, A, mode, sasOk) {
  if (mode === 'OFF') { AP.mode = 'OFF'; AP.drop = 0; return ''; }
  if (!sasOk) return 'AUTOPILOT WILL NOT ENGAGE  -  STAB AUG OFF';
  if (A.onGround || A.cat) return 'AUTOPILOT  -  AIRBORNE ONLY';
  const att = A.attitude(); if (Math.abs(att.roll) > 1.0 || Math.abs(att.pitch) > 0.6) return 'AUTOPILOT  -  LEVEL THE WINGS FIRST';
  if (AP.mode === 'OFF' || mode === 'ALT') AP.ref.alt = A.pos.y;
  AP.ref.pitch = att.pitch; AP.ref.roll = Math.abs(att.roll) < 7 * D2R ? 0 : att.roll; AP.ref.hdg = A.heading();
  AP.mode = mode; AP.drop = 0; AP.css = false; AP.pi = 0; return '';
}
// c: the pilot's stick (modified in place when the autopilot holds). FD: units/air/fd.js on this airframe.
// Returns 'drop' when it disengaged itself this frame.
export function afcsStep(AP, A, FD, c, dt, sasOk) {
  if (AP.mode === 'OFF') return '';
  const att = A.attitude();
  if (!sasOk || Math.abs(att.roll) > 70 * D2R || A.onGround || A.gearCmd) { AP.mode = 'OFF'; AP.drop = 5; return 'drop'; }
  if (Math.abs(c.pitch) > 0.06 || Math.abs(c.roll) > 0.06) { AP.css = true; return ''; }   // control stick steering: the pilot flies
  if (AP.css) { AP.css = false; AP.pi = 0; AP.ref.pitch = att.pitch; AP.ref.roll = Math.abs(att.roll) < 7 * D2R ? 0 : att.roll; AP.ref.hdg = A.heading(); if (AP.mode === 'ALT' && Math.abs(A.vel.y) > 3) AP.ref.alt = A.pos.y; FD.gi = 0; }
  let phi = AP.ref.roll; if (phi === 0) phi = clamp(wrap(AP.ref.hdg - A.heading()) * 2, -0.35, 0.35);
  const base = Math.cos(att.pitch) / Math.max(0.3, Math.cos(att.roll)), ep = AP.ref.pitch - att.pitch;
  AP.pi = clamp((AP.pi || 0) + (AP.mode === 'ATT' ? ep * 1.5 * dt : 0), -0.5, 0.5);   // slow integral: holds through speed changes
  const n = AP.mode === 'ALT' ? base + 0.08 * (clamp((AP.ref.alt - A.pos.y) * 0.25, -12, 12) - A.vel.y) : base + 3 * ep + AP.pi - 0.6 * A.w.y;
  c.pitch = FD.pitchFor(clamp(n, -1, 4), dt); c.roll = FD.rollFor(phi);
  return '';
}

// ------------------------------------------------------------------------------------------------ TF30 start air
// which air turns the starter for engines ks (array of 0 / 1): 'CART' on deck, 'XBLEED' off a running engine,
// 'WINDMILL' above 225 KEAS, or null (no start possible)
export function startAir(A, ks) {
  if (A.onGround) return 'CART';
  if (A.eng.some((e, k) => !ks.includes(k) && e.run && e.n > 0.6)) return 'XBLEED';
  if (A.eas * KT > 225) return 'WINDMILL';
  return null;
}
