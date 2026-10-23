// FOUNDATION placeholder: the TEST CAR's model - an open quarter-ton box in olive drab, at the M151's real size, with
// steering, rolling wheels and a driver figure. Replaced by the WHEELED agent's M151A2 model.
// Frame: x right, y up, -z forward, origin on the ground between the axles (the sim's x / y / z).
import * as THREE from 'three';
import { BOXCAR } from './boxcar.js';

const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
export function buildBoxCarMesh(P = BOXCAR) {
  const g = new THREE.Group(), od = M(0x4b5233), dark = M(0x23251d), tyre = M(0x1b1b1b), white = M(0xd8d8cc), glass = M(0x8fa7b0, { transparent: true, opacity: 0.35 });
  const body = new THREE.Group(); g.add(body);
  const box = (w, h, d, m, x, y, z, p = body) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  const R = 0.36, base = P.RIDE;
  box(P.W - 0.08, 0.5, P.L - 0.3, od, 0, base + 0.25, 0.05);                 // tub
  box(P.W - 0.1, 0.32, 0.95, od, 0, base + 0.64, -P.L / 2 + 0.6);           // bonnet
  box(P.W - 0.2, 0.36, 0.08, dark, 0, base + 0.44, -P.L / 2 + 0.1);         // grille
  for (const s of [-1, 1]) {
    box(0.3, 0.06, 0.95, od, s * (P.W / 2 - 0.05), base + 0.55, -P.L / 2 + 0.55);   // front wings
    box(0.3, 0.06, 0.7, od, s * (P.W / 2 - 0.05), base + 0.52, P.L / 2 - 0.45);     // rear wings
    box(0.14, 0.14, 0.04, white, s * 0.5, base + 0.55, -P.L / 2 + 0.08);            // headlights
  }
  box(P.W - 0.15, 0.48, 0.04, glass, 0, base + 1.05, -P.L / 2 + 1.12);       // windscreen
  box(P.W - 0.12, 0.05, 0.06, od, 0, base + 1.3, -P.L / 2 + 1.12); for (const s of [-1, 1]) box(0.05, 0.5, 0.06, od, s * (P.W / 2 - 0.08), base + 1.05, -P.L / 2 + 1.12);
  for (const s of [-1, 1]) { box(0.5, 0.1, 0.5, dark, s * 0.38, base + 0.62, 0.05); box(0.5, 0.5, 0.08, dark, s * 0.38, base + 0.85, 0.32); }   // seats
  box(P.W - 0.1, 0.1, 0.6, dark, 0, base + 0.62, 0.95);                      // rear bench
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.22, 12), tyre); spare.rotation.x = Math.PI / 2; spare.position.set(0.35, base + 0.6, P.L / 2 + 0.08); body.add(spare);
  // white star on the bonnet, unit stencil
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.22, 5), white); star.rotation.x = -Math.PI / 2; star.position.set(0, base + 0.805, -P.L / 2 + 0.6); body.add(star);
  box(0.6, 0.12, 0.01, white, 0, base + 0.35, P.L / 2 + 0.205);
  // a whip antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 2.4, 4), dark); ant.position.set(-P.W / 2 + 0.1, base + 1.7, P.L / 2 - 0.2); body.add(ant);
  // the driver (seen when you are outside, or in the passenger seat)
  const drv = new THREE.Group(); drv.position.set(-0.38, base + 0.68, 0.0); body.add(drv);
  box(0.36, 0.5, 0.24, M(0x59603f), 0, 0.3, 0, drv); box(0.18, 0.2, 0.2, M(0xc09272), 0, 0.65, -0.02, drv);
  const hel = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M(0x4c5634)); hel.position.set(0, 0.72, -0.02); drv.add(hel);
  // steering wheel
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 4, 14), dark); sw.position.set(-0.38, base + 1.0, -0.42); sw.rotation.x = -1.0; body.add(sw);
  const wheels = [[-P.TRACK / 2, -P.WB / 2], [P.TRACK / 2, -P.WB / 2], [-P.TRACK / 2, P.WB / 2], [P.TRACK / 2, P.WB / 2]].map(([x, z], i) => {
    const hub = new THREE.Group(); hub.position.set(x, R, z); g.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.24, 14), tyre); t.rotation.z = Math.PI / 2; spin.add(t);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.25, 8), od); rim.rotation.z = Math.PI / 2; spin.add(rim);
    return { hub, spin, front: i < 2 };
  });
  const V = { group: g, body, driver: drv, wheel: sw };
  let roll = 0;
  // s: the sim state (boxcar.js); driverIn: show the driver figure
  V.animate = (s, dt, opts = {}) => {
    roll += s.v * dt / R;
    for (const w of wheels) { w.spin.rotation.x = -roll; w.hub.rotation.y = w.front ? -s.steer : 0; }
    sw.rotation.z = s.steer * 3;
    drv.visible = !!opts.driverIn && !opts.firstPerson;
    body.visible = !s.sunk || s.water < P.H * 1.4;
  };
  return V;
}
