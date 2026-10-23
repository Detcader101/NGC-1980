// Game-level air-to-air missile: a projectile that steers toward its target with a capped turn rate, a short motor
// burn then a slow coast, and a proximity fuse (war.js). Game-tuned numbers, no guidance or seeker modelling.
// Shared by war.js (the game) and tools/airbench.mjs (the node bench) so both fly the same missiles. Pure.
import * as THREE from 'three';

const _pp = new THREE.Vector3(), _gd = new THREE.Vector3();
export const AAM = { BOOST: 2.2, ACC: 150, VMAX: 340, COAST: 0.06, TURN: 270, LOSE: 1.4, FUSE: 7 };
// Decoys (flares / the RUNAWAY's drone decoys), a game rule: an aircraft with decoys left drops one as a missile
// closes inside 350 m and again inside 150 m; each one draws the missile off 45% of the time. Returns true when a
// decoy was dropped (for the effect).
export const DECOY = { R1: 350, R2: 150, P: 0.45 };
export function decoyCheck(b, u, rnd = Math.random) {
  if (!b.tgt || !u || !(u.decoys > 0)) return false;
  const d = b.tgt.p.distanceTo(b.p), stage = d < DECOY.R2 ? 2 : d < DECOY.R1 ? 1 : 0;
  if (stage <= (b.dc || 0)) return false;
  b.dc = stage; u.decoys--; u.flares = (u.flares || 0) + 1;
  if (rnd() < DECOY.P) b.tgt = null;
  return true;
}
// b: { p, v, tgt: {p, v, dead, dying, gone}, age, spd }
export function homeAAM(b, dt) {
  b.age += dt; b.spd = b.age < AAM.BOOST ? Math.min(AAM.VMAX, b.spd + AAM.ACC * dt) : b.spd * (1 - AAM.COAST * dt);
  const t = b.tgt;
  if (t && !t.dead && !t.dying && !t.gone) {
    const d = t.p.distanceTo(b.p), tgo = d / Math.max(60, b.spd - t.v.dot(_gd.copy(t.p).sub(b.p).normalize()));
    _gd.copy(t.p).addScaledVector(t.v, Math.min(3, tgo)).sub(b.p).normalize();
    const cur = _pp.copy(b.v).normalize(), ang = Math.acos(Math.min(1, cur.dot(_gd))), maxT = AAM.TURN / Math.max(50, b.spd) * dt;
    if (ang > 1e-4) cur.lerp(_gd, Math.min(1, maxT / ang)).normalize();
    b.v.copy(cur).multiplyScalar(b.spd);
    if (ang > AAM.LOSE && d < 120) b.tgt = null;   // flew past: it won't come back round
  } else b.v.setLength(b.spd);
}
