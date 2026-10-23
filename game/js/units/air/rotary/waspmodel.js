// RW-3 WASP exterior: a RUNAWAY ducted-fan attack drone. Per the bible: sleek, asymmetric, matte ceramic and dark
// composite, pale cyan seams, no windows - a sensor cluster for a head. The body is the shroud itself (a ceramic ring
// round two counter-rotating fans and two stages of exit vanes); a faceted sensor head rides ahead of it on a neck,
// offset to the left; a segmented abdomen sweeps back and curls under into the stinger - an articulated pulse emitter
// that tracks its target. Three thin legs fold up in flight. About 4.2 m long.
// Local frame: x right, y up, nose -z, origin at the CG; feet at y = -0.95.
// API: buildWaspMesh() -> { group, animate(S, dt, time), MUZZLE (local), parts }
import * as THREE from 'three';
import { M, B, V, clamp, smooth, merge, cylZ, cylY, boxG, sphG, mesh, group, rodG, tubeG, bucket } from './modelkit.js';

export const WASPM = { FEET: -0.95, R_IN: 0.76, R_OUT: 1.2 };
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

export function buildWaspMesh() {
  const g = new THREE.Group(); g.name = 'wasp';
  const ceramicM = M(0xe6e4dc, { shininess: 6 }), ceramic2M = M(0xc8c6be, { shininess: 6 }), compM = M(0x24272b, { shininess: 30 }), comp2M = M(0x34383d, { shininess: 30 });
  const bladeM = M(0x3a3e43, { shininess: 40 }), cyanM = B(0x7ff6ff), eyeM = B(0x9ffaff), dimM = B(0x1e5b63);
  const body = bucket();

  // ---- the shroud: a lathed ring with a rounded inlet lip (the lip carries half the thrust) and a diffuser below
  const prof = [[0.76, -0.42], [0.78, -0.2], [0.76, 0.12], [0.8, 0.3], [0.9, 0.4], [1.02, 0.42], [1.13, 0.36], [1.2, 0.22], [1.21, 0.0], [1.16, -0.22], [1.06, -0.38], [0.9, -0.46], [0.8, -0.46], [0.76, -0.42]];
  const ring = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  mesh(ring, ceramicM, g, 'shroud');
  mesh(new THREE.CylinderGeometry(0.765, 0.765, 0.62, 40, 1, true).translate(0, -0.12, 0), M(0x1a1c1f, { side: THREE.BackSide }), g, 'shroudInner');
  // seams: a cyan ring round the lip and one round the waist, dark panel lines
  mesh(new THREE.TorusGeometry(1.03, 0.018, 4, 48).rotateX(Math.PI / 2).translate(0, 0.42, 0), cyanM, g, 'lipSeam');
  mesh(new THREE.TorusGeometry(1.21, 0.014, 4, 48).rotateX(Math.PI / 2).translate(0, 0.02, 0), cyanM, g, 'waistSeam');
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; body.add(boxG(0.02, 0.5, 0.04, 0, 0, 0).translate(Math.cos(a) * 1.205, -0.05, Math.sin(a) * 1.205), compM); }
  // composite armour plates on the ring (asymmetric: more on the right flank)
  body.add(boxG(0.12, 0.35, 0.9, 1.2, -0.02, 0.15).rotateY(0.05), comp2M); body.add(boxG(0.1, 0.25, 0.55, -1.18, 0.02, -0.35), comp2M);
  // fans (two, counter-rotating), hub, stators, exit vanes (two stages, crossed)
  const fans = [0.1, -0.08].map((y, i) => {
    const f = group(g, 'fan', 0, y, 0); const fb = bucket();
    for (let k = 0; k < 7; k++) fb.add(boxG(0.6, 0.03, 0.16, 0.44, 0, 0).rotateX(i ? -0.35 : 0.35).rotateY(k / 7 * Math.PI * 2), bladeM);
    fb.flush(f, 'blades'); return f;
  });
  body.add(cylY(0.18, 0.22, 0.5, 12).translate(0, 0.0, 0), compM); body.add(new THREE.ConeGeometry(0.2, 0.25, 12).translate(0, 0.37, 0), ceramic2M);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; body.add(boxG(0.56, 0.12, 0.03, 0.48, -0.22, 0).rotateY(a), compM); }
  const vanes = { pitch: [], roll: [] };
  for (const [axis, list, y] of [['x', vanes.pitch, -0.52], ['z', vanes.roll, -0.6]]) for (const o of [-0.38, 0, 0.38]) {
    const v = group(g, 'vane', axis === 'x' ? 0 : o, y, axis === 'x' ? o : 0); mesh(boxG(axis === 'x' ? 1.4 : 0.035, 0.22, axis === 'x' ? 0.035 : 1.4), compM, v); list.push(v);
  }

  // ---- the head: a faceted sensor pod ahead on a neck, offset left; eyes of three sizes, a sweeping scanner slit
  const head = group(g, 'head', -0.28, 0.05, -1.55);
  { const hb = bucket();
    hb.add(new THREE.OctahedronGeometry(0.38, 0).scale(0.9, 0.62, 1.55), compM);
    hb.add(boxG(0.36, 0.06, 0.6, 0.02, 0.2, 0.1).rotateZ(-0.12), ceramicM); hb.add(boxG(0.06, 0.24, 0.5, 0.26, 0.02, 0.15), ceramic2M);
    hb.add(rodG([0.05, 0.25, 0.3], [-0.2, 0.55, 1.6], 0.025, 4), compM); hb.add(rodG([0.15, 0.22, 0.35], [0.25, 0.42, 1.4], 0.02, 4), compM);   // antenna spines
    hb.flush(head, 'headParts'); }
  const eyes = [[-0.08, 0.04, -0.52, 0.085], [0.12, 0.08, -0.46, 0.05], [0.05, -0.1, -0.48, 0.035]].map(([x, y, z, r]) => mesh(sphG(r, x, y, z, 1, 1, 0.6, 10, 6), eyeM, head, 'eye'));
  const scan = mesh(boxG(0.34, 0.02, 0.02, 0, 0.0, -0.56), cyanM, head, 'scanner');
  body.add(rodG([-0.22, 0.05, -1.05], [-0.28, 0.05, -1.2], 0.2, 8), comp2M);   // neck
  body.add(rodG([-0.05, 0.0, -1.1], [-0.25, 0.02, -1.25], 0.12, 6), compM);
  // a sensor fin on the right side of the ring (the asymmetric silhouette)
  body.add(boxG(0.04, 0.55, 0.5, 1.25, 0.35, 0.3).rotateZ(-0.25), comp2M); body.add(boxG(0.045, 0.04, 0.4, 1.32, 0.58, 0.3), cyanM);

  // ---- the abdomen: tapered segments back from the ring, curling under to the stinger (the emitter)
  const segs = [[0, 0.05, 1.25, 0.32], [0, 0.0, 1.75, 0.29], [0, -0.1, 2.2, 0.25], [0, -0.25, 2.55, 0.21], [0, -0.43, 2.72, 0.17], [0, -0.6, 2.66, 0.14]];
  for (let i = 0; i < segs.length; i++) {
    const [x, y, z, r] = segs[i]; body.add(sphG(r, x, y, z, 1, 0.85, 1.25, 10, 6), i % 2 ? compM : ceramicM);
    if (i < segs.length - 1) body.add(boxG(0.02, 0.02, 0.02, 0, 0, 0).translate(x, y, z), compM);
    if (i % 2 === 0) body.add(new THREE.TorusGeometry(r * 0.95, 0.012, 4, 20).translate(x, y, z), cyanM);
  }
  const sting = group(g, 'stinger', 0, -0.66, 2.4), stingP = group(sting, 'stingerPitch');
  { const sb = bucket(); sb.add(cylZ(0.13, 0.09, 0.9, 10).translate(0, 0, -0.4), compM); sb.add(cylZ(0.06, 0.06, 0.35, 8).translate(0, 0, -0.95), comp2M); sb.add(boxG(0.3, 0.05, 0.25, 0, 0.1, -0.2), ceramic2M); sb.flush(stingP, 'stingerParts'); }
  const emitter = mesh(sphG(0.07, 0, 0, -1.14, 1, 1, 1, 8, 5), dimM, stingP, 'emitter');
  const flashM = B(0xbff8ff, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flash = mesh(merge([new THREE.PlaneGeometry(0.4, 0.9).rotateX(Math.PI / 2), new THREE.PlaneGeometry(0.4, 0.9).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)]).translate(0, 0, -1.5), flashM, stingP, 'pulseFlash');

  // ---- legs: three thin legs that swing down to land, up and back in flight
  const legs = [[0, -0.6, 0], [-0.55, 0.45, 2.3], [0.55, 0.45, -2.3]].map(([x, z, yaw]) => {
    const L = group(g, 'leg', x, -0.35, z); L.rotation.y = yaw; const lb = bucket();
    lb.add(rodG([0, 0, 0], [0, -0.35, -0.25], 0.05, 5), compM); lb.add(rodG([0, -0.35, -0.25], [0, -0.6, -0.15], 0.04, 5), compM); lb.add(sphG(0.06, 0, -0.62, -0.15), ceramic2M);
    lb.flush(L, 'legParts'); return L;
  });
  body.flush(g, 'airframe');

  // ---- animation. S: { fan 0..1, pitch, roll (vane cmds), aim: world Vector3 | null, firing, gear 0..1, alert 0..1 }
  let psi = 0, sYaw = 0, sPitch = 0;
  const MUZZLE = V(0, -0.66, 2.4 - 1.5);
  function animate(S = {}, dt = 0, time = 0) {
    const fan = S.fan ?? 0.6; psi += fan * 95 * dt;   // ~5400 rpm at full
    fans[0].rotation.y = psi; fans[1].rotation.y = -psi * 1.07;
    for (const v of vanes.pitch) v.rotation.x = clamp(S.pitch ?? 0, -1, 1) * 0.5;
    for (const v of vanes.roll) v.rotation.z = -clamp(S.roll ?? 0, -1, 1) * 0.5;
    // the stinger tracks its aim (world direction -> local yaw / pitch), else rests pointing ahead
    let yT = 0, pT = -0.1;
    if (S.aim && S.aim.lengthSq() > 0.01) {
      g.updateMatrixWorld(); _q.setFromRotationMatrix(_m.extractRotation(g.matrixWorld)).invert(); _v.copy(S.aim).normalize().applyQuaternion(_q);
      yT = clamp(Math.atan2(-_v.x, -_v.z), -1.2, 1.2); pT = clamp(Math.asin(clamp(_v.y, -1, 1)), -1.1, 0.5);
    }
    const k = 1 - Math.exp(-10 * dt); sYaw += (yT - sYaw) * k; sPitch += (pT - sPitch) * k; sting.rotation.y = sYaw; stingP.rotation.x = sPitch;
    const fire = !!S.firing; flash.visible = fire && ((time * 23) % 1) < 0.4; if (flash.visible) flash.scale.setScalar(0.7 + ((time * 41) % 1) * 0.6);
    emitter.material = fire ? eyeM : dimM;
    // eyes: a slow breathing glow, hot white when firing; the scanner slit sweeps
    const glow = 0.55 + 0.25 * Math.sin(time * 1.7) + 0.4 * (S.alert ?? 0);
    eyeM.color.setRGB(Math.min(1, 0.25 * glow + (fire ? 0.6 : 0)), Math.min(1, 0.85 * glow + (fire ? 0.15 : 0)), Math.min(1, 0.95 * glow + 0.05));
    cyanM.color.setHSL(0.51, 1, 0.55 + 0.15 * Math.sin(time * 2.3));
    scan.position.x = Math.sin(time * (S.alert ? 6 : 1.6)) * 0.12;
    const gr = clamp(S.gear ?? 0, 0, 1); for (const L of legs) L.rotation.x = (1 - gr) * 1.1;
  }
  animate({});
  return { group: g, animate, MUZZLE, parts: { fans, vanes, head, sting, legs } };
}
