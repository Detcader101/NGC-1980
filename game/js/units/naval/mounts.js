// Ship weapon mounts used by war.js as each ship's `guns`: a Group whose userData has `yaw` (turns about y) and
// `pitch` (elevates about x), like buildGun(). These are the naval agent's stand-ins, sized right and detailed enough
// to read at a distance; the DEFENCE agent's full Phalanx / Sea Sparrow / laser models can replace the children of a
// mount node (see the `mounts` list each ship builder returns). Each moving part is one merged mesh.
import * as THREE from 'three';
import { Kit, glowMat, pbr } from './navkit.js';

const HAZE = 0x828b93, DARK = 0x2a2d31, WHITE = 0xe6e6e0, BLACK = 0x18191b;
function rig(team) {
  const g = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group();
  g.add(yaw); yaw.add(pitch);
  g.userData = { yaw, pitch, team: team || pbr(() => new THREE.MeshPhongMaterial({ color: 0x33bbff }), 0x33bbff, { rk: 'paint' }) };
  return g;
}
const put = (parent, kit) => { const m = kit.mesh(); parent.add(m); return m; };

// Mk 15 Phalanx CIWS (Block 0, 1980): white radome "R2-D2" over a 6-barrel M61A1 with a muzzle shroud, on a pedestal
export function buildPhalanx(team) {
  const g = rig(team), { yaw, pitch } = g.userData;
  const base = new Kit({ wear: 0.03 }); base.cyl(0.55, 0.65, 0.5, HAZE, 0, 0.25, 0, 0, 0, 0, 12); base.cyl(0.62, 0.62, 0.08, DARK, 0, 0.52, 0, 0, 0, 0, 12); put(g, base);
  yaw.position.y = 0.55;
  const y = new Kit({ wear: 0.03 });
  y.box(1.0, 0.75, 1.1, WHITE, 0, 0.38, 0.1);                       // mount body / ammunition drum housing
  y.box(0.25, 0.9, 0.9, WHITE, -0.62, 0.95, 0.05); y.box(0.25, 0.9, 0.9, WHITE, 0.62, 0.95, 0.05);   // elevation cradle arms
  put(yaw, y);
  pitch.position.set(0, 1.05, 0);
  const p = new Kit({ wear: 0.02 });
  p.cyl(0.42, 0.42, 1.0, WHITE, 0, 0.55, 0.15, 0, 0, 0, 14); p.sphere(0.42, WHITE, 0, 1.05, 0.15, 1, 0.75, 1, 14, 6);   // the radome
  p.box(0.3, 0.3, 0.3, 0xd8d8d0, 0, 0.35, -0.3);                    // search antenna bulge
  p.cyl(0.13, 0.13, 1.8, DARK, 0, -0.05, -0.95, Math.PI / 2, 0, 0, 8); p.cyl(0.17, 0.15, 0.45, BLACK, 0, -0.05, -1.85, Math.PI / 2, 0, 0, 8);   // barrels + shroud
  p.box(0.62, 0.55, 0.9, WHITE, 0, -0.05, 0.35);                     // gun body / feed
  put(pitch, p);
  return g;
}
// Mk 25 Basic Point Defence Missile System launcher (Sea Sparrow, 1980): an 8-cell box trainable launcher
export function buildSeaSparrow(team) {
  const g = rig(team), { yaw, pitch } = g.userData;
  const base = new Kit({ wear: 0.03 }); base.cyl(0.7, 0.85, 0.6, HAZE, 0, 0.3, 0, 0, 0, 0, 12); put(g, base);
  yaw.position.y = 0.6;
  const y = new Kit({ wear: 0.03 }); y.box(0.9, 0.9, 1.0, HAZE, 0, 0.45, 0.2); y.box(0.2, 1.3, 0.5, HAZE, -0.9, 0.9, 0.2); y.box(0.2, 1.3, 0.5, HAZE, 0.9, 0.9, 0.2); put(yaw, y);
  pitch.position.set(0, 1.4, 0.1);
  const p = new Kit({ wear: 0.04 });
  for (let i = 0; i < 2; i++) for (let k = 0; k < 4; k++) {
    const x = (k - 1.5) * 0.4, yy = (i - 0.5) * 0.42;
    p.box(0.38, 0.4, 2.2, HAZE, x, yy, -0.4); p.box(0.3, 0.32, 0.04, 0x9aa2a8, x, yy, -1.52);   // cell + frangible cover
  }
  put(pitch, p);
  return g;
}
// Mk 49 RAM launcher (KRAKEN, 2030s): 21 tubes in a drum on a trainable mount, with its RUNAWAY sensor pod
export function buildRAM(team) {
  const g = rig(team), { yaw, pitch } = g.userData;
  const base = new Kit({ wear: 0.04 }); base.cyl(0.6, 0.75, 0.5, 0x6e767d, 0, 0.25, 0, 0, 0, 0, 12); put(g, base);
  yaw.position.y = 0.5;
  const y = new Kit({ wear: 0.04 }); y.box(0.9, 0.7, 0.9, 0x6e767d, 0, 0.35, 0.15); y.box(0.18, 1.1, 0.7, 0x6e767d, -0.75, 0.8, 0.1); y.box(0.18, 1.1, 0.7, 0x6e767d, 0.75, 0.8, 0.1); put(yaw, y);
  pitch.position.set(0, 1.15, 0.05);
  const p = new Kit({ wear: 0.03 }); p.box(1.15, 1.0, 1.9, 0x7d858c, 0, 0, -0.2);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 7; k++) p.cyl(0.07, 0.07, 0.05, BLACK, (k - 3) * 0.15, (i - 1) * 0.28, -1.17, Math.PI / 2, 0, 0, 6);
  put(pitch, p);
  const glow = new Kit({ wear: 0 }); glow.box(0.05, 0.08, 1.6, 0x66eeff, 0.6, 0.35, -0.2); glow.box(0.05, 0.08, 1.6, 0x66eeff, -0.6, 0.35, -0.2); pitch.add(new THREE.Mesh(glow.geometry(), glowMat()));
  return g;
}
// RUNAWAY point-defence laser: a faceted ceramic turret with a glowing emitter; userData.beam is a cyan beam
// (unit length along -z) that fireBeam(dist) shows for a moment
export function buildLaser(team, s = 1) {
  const g = rig(team), { yaw, pitch } = g.userData;
  const base = new Kit({ wear: 0.02 }); base.cyl(0.6 * s, 0.75 * s, 0.4 * s, 0xc9ccc8, 0, 0.2 * s, 0, 0, 0, 0, 6); put(g, base);
  yaw.position.y = 0.4 * s;
  const y = new Kit({ wear: 0.02 }); y.add(new THREE.OctahedronGeometry(0.62 * s, 0), 0xd6d8d2, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.45 * s, 0), new THREE.Quaternion(), new THREE.Vector3(1.1, 0.75, 1.2))); y.box(0.9 * s, 0.12 * s, 0.9 * s, 0x2a2e33, 0, 0.12 * s, 0); put(yaw, y);
  pitch.position.set(0, 0.6 * s, 0);
  const p = new Kit({ wear: 0.02 }); p.box(0.28 * s, 0.28 * s, 1.1 * s, 0x30343a, 0, 0, -0.55 * s); p.cyl(0.18 * s, 0.13 * s, 0.25 * s, 0x1b1e22, 0, 0, -1.15 * s, Math.PI / 2, 0, 0, 6); put(pitch, p);
  const e = new Kit({ wear: 0 }); e.cyl(0.1 * s, 0.1 * s, 0.06 * s, 0x9ff4ff, 0, 0, -1.29 * s, Math.PI / 2, 0, 0, 6); e.box(0.05 * s, 0.05 * s, 0.9 * s, 0x5fe6ff, 0.15 * s, 0, -0.5 * s); e.box(0.05 * s, 0.05 * s, 0.9 * s, 0x5fe6ff, -0.15 * s, 0, -0.5 * s); pitch.add(new THREE.Mesh(e.geometry(), glowMat()));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.z = -1.32 * s; beam.visible = false; pitch.add(beam);
  g.userData.beam = beam; g.userData.beamT = 0;
  g.userData.fireBeam = (dist) => { beam.scale.set(1, 1, Math.max(1, dist)); beam.visible = true; g.userData.beamT = 0.09; };
  g.userData.tick = dt => { if (g.userData.beamT > 0) { g.userData.beamT -= dt; if (g.userData.beamT <= 0) beam.visible = false; } };
  return g;
}
