// HORNET cockpit: a full 3D interior in jet-local space (x right, y up, nose -z), so it rides with the airframe and
// free look finds a whole cockpit. Everything that has a needle or a number is live:
// - HUD: symbology drawn on the combiner glass and projected from the pilot's eye, so it is conformal (the pitch
//   ladder lies on the real horizon, the flight path marker on the real velocity vector, target boxes on targets,
//   the bomb pipper on the impact point) wherever you look.
// - Left / right DDI (pages RDR, SMS, FCS, ENG, HSI, picked with the bezel buttons), AMPCD moving map, IFEI engine
//   readout, standby airspeed / attitude / altimeter / VSI, caution panel, AoA indexer, lock/shoot lights,
//   fire lights, gear lights and the red light in the gear handle.
// - Stick, throttles and rudder pedals move with your HOTAS and pedals; gloved hands ride on the stick and throttle.
// - Clickable: gear and hook handles, flaps, master arm, FCS CAS/DIRECT, engine cranks, fire lights (push to
//   extinguish), master caution, canopy, lights, emergency jettison, eject handle, DDI page buttons.
import * as THREE from 'three';
import { KT, FT, LB, HORNET, DECKOPS } from './jetfm.js';
import { drawRwr } from './units/defence/cm.js';   // ngc/cmpolish: the radar warning scope

export const JEYE = new THREE.Vector3(0, 0.98, -4.35);
const HUD = { z: -5.1, cy: 1.0, hw: 0.15, hh: 0.135, W: 600, H: 540 };   // ~22° wide from the eye
const GRN = '#6dff7c', AMB = '#ffb21e', RED = '#ff3a2a';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const deg = r => r * 180 / Math.PI;
const FONT = 'Consolas, "Liberation Mono", monospace';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _iq = new THREE.Quaternion(), _eye = new THREE.Vector3();

function canvasTex(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { cv, ctx: cv.getContext('2d'), tex };
}

export function buildJetCockpit() {
  const g = new THREE.Group(); g.visible = false; g.name = 'jetCockpit';
  // interior fill: the tub is lit through the canopy, so give every surface some self-light (like the heli cockpit)
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.5), ...o });
  const grey = M(0x40464c), dark = M(0x1e2125), black = M(0x0b0c0d), tubM = M(0x4c535a), suit = M(0x5d6542), glove = M(0x2b2723);
  const yellow = M(0xd8b018), redM = M(0xb81a10), metal = M(0x777d82), seatM = M(0x2d3134), cushion = M(0x3d4a35);
  const box = (w, h, d, m, x, y, z, p = g, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p = g, rx = 0, rz = 0, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); p.add(o); return o; };
  const plane = (w, h, mat, x, y, z, p = g, rx = 0) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); o.rotation.x = rx; p.add(o); return o; };
  const lit = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

  // ---------------------------------------------------------------- tub, consoles, seat, glare shield
  const X = 0.52;   // inner half-width
  for (const s of [-1, 1]) {
    box(0.03, 1.0, 2.75, tubM, s * (X + 0.015), 0.22, -4.35);               // side walls up to the sill
    box(0.1, 0.03, 2.75, grey, s * (X - 0.03), 0.72, -4.35);                 // sill / canopy rail
    box(0.2, 0.3, 1.25, grey, s * 0.43, 0.21, -4.25);                        // side console
    box(0.2, 0.02, 1.25, dark, s * 0.43, 0.365, -4.25);                      // console top
  }
  box(1.04, 0.03, 2.75, dark, 0, -0.28, -4.35);                              // floor
  box(1.04, 1.25, 0.04, tubM, 0, 0.35, -2.98);                               // aft bulkhead behind the seat
  box(0.6, 0.6, 0.5, dark, 0, -0.05, -5.42);                                 // pedal well / under-panel
  // instrument panel (tilted back) carries the displays; panel group local: x right, y up the panel face
  const P = new THREE.Group(); P.position.set(0, 0.55, -5.14); P.rotation.x = -0.15; g.add(P);
  box(0.96, 0.62, 0.05, dark, 0, -0.01, -0.03, P);
  const art = canvasTex(960, 620); const artMesh = plane(0.96, 0.62, new THREE.MeshLambertMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.55 }), 0, -0.01, 0.0, P);
  // glare shield: a padded slab over the panel with a lip toward the pilot
  box(0.98, 0.04, 0.48, black, 0, 0.845, -5.33); box(0.98, 0.03, 0.04, black, 0, 0.85, -5.085);
  // ejection seat
  const seat = new THREE.Group(); seat.position.set(0, 0.0, -3.9); g.add(seat);
  box(0.46, 0.1, 0.48, seatM, 0, 0.18, -0.22, seat); box(0.42, 0.06, 0.42, cushion, 0, 0.25, -0.22, seat);
  box(0.46, 0.95, 0.12, seatM, 0, 0.66, 0.08, seat, -0.17); box(0.4, 0.8, 0.04, cushion, 0, 0.66, 0.0, seat, -0.17);
  box(0.36, 0.32, 0.22, seatM, 0, 1.24, 0.2, seat, -0.17);   // headbox
  for (const s of [-1, 1]) box(0.05, 1.1, 0.1, metal, s * 0.25, 0.6, 0.12, seat, -0.17);   // seat rails
  // eject handle: yellow/black loop on the seat front, between the knees
  const ejectH = new THREE.Group(); ejectH.position.set(0, 0.2, -4.42); g.add(ejectH);
  for (let i = 0; i < 6; i++) box(0.035, 0.02, 0.02, i % 2 ? black : yellow, -0.06 + i * 0.024, 0.02, 0, ejectH);
  box(0.02, 0.06, 0.02, yellow, -0.07, -0.01, 0, ejectH); box(0.02, 0.06, 0.02, yellow, 0.07, -0.01, 0, ejectH);

  // ---------------------------------------------------------------- windscreen and canopy (inside view)
  const glass = new THREE.MeshBasicMaterial({ color: 0xb8dcff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const frame = M(0x2a2e33);
  // a half-elliptic loft along z: rings of (half-width w, height h above the sill)
  function loft(rings, segs = 14) {
    const pos = [], idx = [];
    rings.forEach(([z, w, h, y0], i) => { for (let k = 0; k <= segs; k++) { const a = Math.PI * k / segs; pos.push(Math.cos(a) * w, y0 + Math.sin(a) * h, z); } });
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < segs; k++) { const a = i * (segs + 1) + k, b = a + segs + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  }
  function arc(z, w, h, y0, r = 0.018, p = g) {
    const pts = []; for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; pts.push(new THREE.Vector3(Math.cos(a) * w, y0 + Math.sin(a) * h, z)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 5), frame); p.add(m); return m;
  }
  const ws = new THREE.Mesh(loft([[-5.72, 0.46, 0.06, 0.8], [-5.45, 0.53, 0.32, 0.76], [-5.1, 0.56, 0.6, 0.73]]), glass); ws.renderOrder = 5; g.add(ws);
  arc(-5.1, 0.56, 0.6, 0.73, 0.022);                                          // windscreen bow
  for (const s of [-1, 1]) { const pts = [new THREE.Vector3(s * 0.46, 0.8, -5.72), new THREE.Vector3(s * 0.5, 1.02, -5.45), new THREE.Vector3(s * 0.4, 1.25, -5.12)]; g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.014, 4), frame)); }
  for (const x of [-0.16, 0, 0.16]) box(0.1, 0.035, 0.015, metal, x, 1.3, -5.08);   // rear-view mirrors on the bow
  const canopyG = new THREE.Group(); canopyG.position.set(0, 0.95, -2.4); g.add(canopyG);   // hinged at the rear
  const cg = new THREE.Group(); cg.position.set(0, -0.95, 2.4); canopyG.add(cg);
  const cnp = new THREE.Mesh(loft([[-5.1, 0.56, 0.6, 0.73], [-4.6, 0.58, 0.7, 0.73], [-4.0, 0.57, 0.72, 0.73], [-3.3, 0.52, 0.6, 0.73], [-2.7, 0.42, 0.38, 0.73], [-2.4, 0.3, 0.2, 0.73]]), glass); cnp.renderOrder = 5; cg.add(cnp);
  arc(-3.35, 0.52, 0.6, 0.73, 0.016, cg);                                     // canopy bow frame behind the head
  for (const s of [-1, 1]) box(0.03, 0.04, 2.7, frame, s * 0.55, 0.75, -3.75, cg);

  // ---------------------------------------------------------------- displays
  const disp = (w, h, cw, ch, x, y, p = P, z = 0.006) => { const t = canvasTex(cw, ch); const m = plane(w, h, new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }), x, y, z, p); return { ...t, mesh: m, w: cw, h: ch }; };
  const ddiL = disp(0.15, 0.15, 360, 360, -0.255, 0.035), ddiR = disp(0.15, 0.15, 360, 360, 0.255, 0.035);
  const ampcd = disp(0.155, 0.155, 380, 380, 0, -0.14), ufc = disp(0.2, 0.11, 400, 220, 0, 0.19);
  const ifei = disp(0.14, 0.08, 336, 192, -0.2, -0.205), stby = disp(0.14, 0.14, 300, 300, 0.205, -0.205);
  const caut = disp(0.1, 0.13, 200, 260, 0.41, 0.15), gearL = disp(0.08, 0.06, 160, 120, -0.41, -0.2);
  // CM (ngc/cmpolish): the RWR azimuth scope right of the UFC (threat letters by bearing, ALR-style), and left of it the
  // threat warning lamps (LOCK / LAUNCH / LASER) with the ALE-39 FLARE / CHAFF counters
  const rwrD = disp(0.1, 0.1, 200, 200, 0.25, 0.215), thrD = disp(0.17, 0.1, 340, 200, -0.235, 0.215);
  // HUD combiner glass and its symbology
  const hud = canvasTex(HUD.W, HUD.H);
  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(HUD.hw * 2, HUD.hh * 2), new THREE.MeshBasicMaterial({ map: hud.tex, transparent: true, depthWrite: false, toneMapped: false }));
  hudMesh.position.set(0, HUD.cy, HUD.z); hudMesh.renderOrder = 6; g.add(hudMesh);
  const comb = new THREE.Mesh(new THREE.PlaneGeometry(HUD.hw * 2, HUD.hh * 2), new THREE.MeshBasicMaterial({ color: 0x9fe8c0, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
  comb.position.set(0, HUD.cy, HUD.z - 0.004); comb.renderOrder = 5; g.add(comb);
  for (const s of [-1, 1]) box(0.012, HUD.hh * 2 + 0.02, 0.012, black, s * (HUD.hw + 0.006), HUD.cy - 0.01, HUD.z);
  box(0.26, 0.05, 0.12, black, 0, 0.885, -5.18);                              // HUD projector body on the glare shield
  // lights: AoA indexer (left of HUD), LOCK / SHOOT (right), fire lights at the glare shield ends, master caution
  const lamp = (w, h, x, y, z, on, offc = 0x1a1a1a, p = g) => { const m = new THREE.MeshBasicMaterial({ color: offc, toneMapped: false }); const o = plane(w, h, m, x, y, z, p); o.userData = { on: new THREE.Color(on), off: new THREE.Color(offc) }; return o; };
  const setLamp = (o, v) => o.material.color.copy(v ? o.userData.on : o.userData.off);
  const aoaHi = lamp(0.03, 0.018, -0.165, 1.0, -5.09, 0x30ff40), aoaOn = lamp(0.022, 0.022, -0.165, 0.976, -5.09, 0xffa020), aoaLo = lamp(0.03, 0.018, -0.165, 0.952, -5.09, 0xff3020);
  const lockL = lamp(0.04, 0.02, 0.17, 1.0, -5.09, 0x30ff40), shootL = lamp(0.04, 0.02, 0.17, 0.975, -5.09, 0x30ff40);
  const fireLL = lamp(0.07, 0.035, -0.36, 0.89, -5.07, 0xff2010, 0x3a0a08), fireRL = lamp(0.07, 0.035, 0.36, 0.89, -5.07, 0xff2010, 0x3a0a08);
  const mcL = lamp(0.05, 0.03, -0.41, 0.24, 0.006, 0xffb020, 0x2a2008, P);
  // ---------------------------------------------------------------- handles and switches
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), hits = [], sw = {};
  const hit = (id, w, h, d, x, y, z, p = g, label = id) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); o.position.set(x, y, z); o.userData.sw = id; o.userData.label = label; p.add(o); hits.push(o); return o; };
  // gear handle (wheel-shaped knob, red light inside) and hook handle on the panel sides
  const gearH = new THREE.Group(); gearH.position.set(-0.41, -0.08, 0.02); P.add(gearH);
  box(0.012, 0.09, 0.012, metal, 0, 0, 0, gearH); const knob = cyl(0.026, 0.026, 0.02, M(0xe8e8e0), 0, 0.05, 0, gearH, Math.PI / 2, 0, 12);
  const gearRed = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), lit(0x300808)); gearRed.position.set(0, 0.05, 0.012); gearH.add(gearRed);
  hit('gear', 0.07, 0.13, 0.08, -0.41, -0.06, 0.03, P, 'LANDING GEAR');
  const hookH = new THREE.Group(); hookH.position.set(0.41, -0.08, 0.02); P.add(hookH);
  box(0.012, 0.09, 0.012, metal, 0, 0, 0, hookH); box(0.05, 0.016, 0.03, yellow, 0, 0.05, 0.005, hookH);
  hit('hook', 0.07, 0.13, 0.08, 0.41, -0.06, 0.03, P, 'ARRESTING HOOK');
  const hookLamp = lamp(0.04, 0.018, 0.41, -0.165, 0.006, 0xffb020, 0x1a1a1a, P);
  // toggle switches: a bat that flips up/down
  const toggle = (id, x, y, z, p, label, flat = false) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z); p.add(piv);
    const bat = cyl(0.005, 0.007, 0.04, M(0xd0d0c8), 0, 0.02, 0, piv); if (flat) piv.rotation.x = -Math.PI / 2;
    cyl(0.012, 0.012, 0.008, metal, 0, 0, 0, piv);
    hit(id, 0.05, flat ? 0.04 : 0.06, flat ? 0.06 : 0.05, x, y + (flat ? 0.015 : 0), z + (flat ? 0 : 0.015), p, label);
    sw[id] = piv; return piv;
  };
  toggle('arm', -0.41, 0.12, 0.012, P, 'MASTER ARM');
  hit('mc', 0.06, 0.04, 0.03, -0.41, 0.24, 0.01, P, 'MASTER CAUTION RESET');
  hit('fireL', 0.08, 0.05, 0.04, -0.36, 0.89, -5.07, g, 'L FIRE - PUSH TO EXTINGUISH'); hit('fireR', 0.08, 0.05, 0.04, 0.36, 0.89, -5.07, g, 'R FIRE - PUSH TO EXTINGUISH');
  hit('jett', 0.05, 0.04, 0.03, 0.41, 0.24, 0.01, P, 'EMERGENCY JETTISON');
  const jettB = cyl(0.014, 0.014, 0.012, redM, 0.41, 0.24, 0.008, P, Math.PI / 2, 0, 10);
  hit('eject', 0.2, 0.08, 0.08, 0, 0.2, -4.42, g, 'EJECT (CLICK TWICE)');
  // consoles (flat switch plates facing up; canvas top = forward)
  const conL = canvasTex(200, 640), conR = canvasTex(200, 640);
  plane(0.19, 0.62, new THREE.MeshLambertMaterial({ map: conL.tex, emissive: 0xffffff, emissiveMap: conL.tex, emissiveIntensity: 0.6 }), -0.43, 0.377, -4.25, g, -Math.PI / 2);
  plane(0.19, 0.62, new THREE.MeshLambertMaterial({ map: conR.tex, emissive: 0xffffff, emissiveMap: conR.tex, emissiveIntensity: 0.6 }), 0.43, 0.377, -4.25, g, -Math.PI / 2);
  toggle('flaps', -0.43, 0.38, -4.48, g, 'FLAPS AUTO / HALF / FULL', true);
  toggle('engL', -0.47, 0.38, -4.02, g, 'L ENGINE CRANK', true); toggle('engR', -0.39, 0.38, -4.02, g, 'R ENGINE CRANK', true);
  toggle('cas', 0.43, 0.38, -4.48, g, 'FCS  CAS / DIRECT', true);
  toggle('lights', 0.47, 0.38, -4.25, g, 'EXT LIGHTS', true); toggle('canopy', 0.39, 0.38, -4.25, g, 'CANOPY', true);
  toggle('pbrake', 0.43, 0.38, -4.02, g, 'PARKING BRAKE', true);
  // DDI / AMPCD bezel page buttons (top row of each display)
  const PAGES = ['RDR', 'SMS', 'FCS', 'ENG', 'HSI'];
  for (const [d, cx] of [['L', -0.255], ['R', 0.255]]) PAGES.forEach((pg, i) => { box(0.016, 0.012, 0.01, M(0x55585c), cx - 0.06 + i * 0.03, 0.035 + 0.088, 0.004, P); hit(`ddi${d}:${pg}`, 0.026, 0.02, 0.03, cx - 0.06 + i * 0.03, 0.035 + 0.088, 0.01, P, `DDI ${pg} PAGE`); });
  ['MAP', 'MAP+', 'MAP-'].forEach((pg, i) => { box(0.016, 0.012, 0.01, M(0x55585c), -0.03 + i * 0.03, -0.14 + 0.09, 0.004, P); hit(`ampcd:${pg}`, 0.026, 0.02, 0.03, -0.03 + i * 0.03, -0.14 + 0.09, 0.01, P, pg === 'MAP' ? 'MAP NORTH UP / TRACK UP' : pg === 'MAP+' ? 'MAP ZOOM IN' : 'MAP ZOOM OUT'); });
  // hover marker: a thin yellow frame that sits on whatever the crosshair / cursor is over
  const hov = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false, transparent: true })); hov.renderOrder = 9; hov.visible = false; g.add(hov);

  // ---------------------------------------------------------------- stick, throttles, pedals, pilot
  const stickP = new THREE.Group(); stickP.position.set(0, -0.02, -4.66); g.add(stickP);
  cyl(0.06, 0.08, 0.06, black, 0, 0.0, 0, stickP);                            // boot
  cyl(0.014, 0.016, 0.42, metal, 0, 0.22, 0, stickP);
  const grip = new THREE.Group(); grip.position.set(0, 0.47, 0); stickP.add(grip);
  box(0.045, 0.13, 0.05, black, 0, 0, 0, grip, 0.15); box(0.012, 0.03, 0.015, M(0x333333), 0, 0.02, -0.03, grip);   // grip + trigger
  box(0.05, 0.03, 0.06, black, 0, 0.075, -0.005, grip);                       // head with the hat and buttons
  const thr = [-0.455, -0.405].map(x => { const t = new THREE.Group(); t.position.set(x, 0.38, -4.2); g.add(t); box(0.012, 0.11, 0.012, metal, 0, 0.055, 0, t); box(0.04, 0.05, 0.07, black, x < -0.43 ? -0.01 : 0.01, 0.12, 0, t); return t; });
  box(0.02, 0.015, 0.45, black, -0.43, 0.374, -4.18);                          // throttle slot
  const pedals = [-0.16, 0.16].map(x => { const p = new THREE.Group(); p.position.set(x, -0.14, -5.12); g.add(p); const pl = box(0.1, 0.2, 0.025, metal, 0, 0.06, 0, p, -0.35); box(0.02, 0.18, 0.02, dark, 0, -0.04, 0.06, p); return { p, pl }; });
  // the pilot: legs to the pedals, a hand on the stick and one on the throttle
  const limb = (a, b, r, m) => { const d = new THREE.Vector3().subVectors(b, a), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, d.length(), 7), m); o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(o); return o; };
  for (const s of [-1, 1]) {
    const hip = new THREE.Vector3(s * 0.12, 0.3, -4.05), knee = new THREE.Vector3(s * 0.15, 0.46, -4.72), ank = new THREE.Vector3(s * 0.16, -0.06, -5.02);
    limb(hip, knee, 0.075, suit); limb(knee, ank, 0.058, suit);
    const boot = box(0.1, 0.09, 0.24, black, s * 0.16, -0.09, -5.08); boot.rotation.x = -0.35;
  }
  const handR = new THREE.Group(); grip.add(handR); box(0.07, 0.09, 0.07, glove, 0.0, -0.005, 0.01, handR); limb(new THREE.Vector3(0.12, 0.35, -4.25), new THREE.Vector3(0.03, 0.42, -4.6), 0.04, suit);
  const handL = new THREE.Group(); thr[0].add(handL); handL.position.set(0.02, 0.12, 0); box(0.08, 0.06, 0.09, glove, 0, 0.02, 0, handL);

  // ---------------------------------------------------------------- static panel art (labels, bezels)
  function drawArt(hover) {
    const c = art.ctx, W = 960, H = 620, px = x => (x + 0.48) * 1000, py = y => (0.3 - y) * 1000;
    c.fillStyle = '#2b3036'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#4b5258'; c.lineWidth = 3; c.strokeRect(4, 4, W - 8, H - 8);
    const bez = (cx, cy, s) => { c.fillStyle = '#16181b'; c.fillRect(px(cx - s / 2), py(cy + s / 2), s * 1000, s * 1000); c.strokeStyle = '#555c62'; c.strokeRect(px(cx - s / 2), py(cy + s / 2), s * 1000, s * 1000); };
    bez(-0.255, 0.035, 0.19); bez(0.255, 0.035, 0.19); bez(0, -0.14, 0.19); bez(-0.2, -0.205, 0.155); bez(0.205, -0.205, 0.155); bez(0, 0.19, 0.22); bez(0.25, 0.215, 0.115); bez(-0.235, 0.215, 0.18);
    c.fillStyle = '#e8e4d0'; c.font = `bold 12px ${FONT}`; c.textAlign = 'center';
    const lab = (t, x, y) => c.fillText(t, px(x), py(y));
    lab('MASTER ARM', -0.41, 0.175); lab('ARM', -0.41, 0.155); lab('SAFE', -0.41, 0.075); lab('MASTER', -0.41, 0.285); lab('CAUTION', -0.41, 0.205);
    lab('RWR', 0.25, 0.152); lab('LDG GEAR', -0.41, 0.0); lab('HOOK', 0.41, 0.0); lab('EMER', 0.41, 0.285); lab('JETT', 0.41, 0.205); lab('CAUTION', 0.41, 0.235);
    lab('IFEI', -0.2, -0.282); lab('STBY', 0.205, -0.282); lab('LEFT DDI', -0.255, -0.07); lab('RIGHT DDI', 0.255, -0.07); lab('AMPCD', 0, -0.245);
    c.font = `bold 11px ${FONT}`;
    ['RDR', 'SMS', 'FCS', 'ENG', 'HSI'].forEach((pg, i) => { lab(pg, -0.255 - 0.06 + i * 0.03, 0.035 + 0.102); lab(pg, 0.255 - 0.06 + i * 0.03, 0.035 + 0.102); });
    ['N/T', 'ZM+', 'ZM-'].forEach((pg, i) => lab(pg, -0.03 + i * 0.03, -0.14 + 0.104));
    art.tex.needsUpdate = true;
    for (const [cv, items] of [[conL, [['FLAPS', 'AUTO HALF FULL', -4.48], ['L ENG  R ENG', 'CRANK', -4.02]]], [conR, [['FCS', 'CAS / DIRECT', -4.48], ['CANOPY  LIGHTS', '', -4.25], ['PARK BRK', '', -4.02]]]]) {
      const x = cv.ctx; x.fillStyle = '#262a2e'; x.fillRect(0, 0, 200, 640); x.strokeStyle = '#555'; x.strokeRect(2, 2, 196, 636);
      x.fillStyle = '#e8e4d0'; x.textAlign = 'center';
      for (const [t, s, z] of items) { const y = (z + 4.25 + 0.31) / 0.62 * 640; x.font = `bold 20px ${FONT}`; x.fillText(t, 100, y - 30); x.font = `14px ${FONT}`; x.fillText(s, 100, y + 44); }
      cv.tex.needsUpdate = true;
    }
  }
  drawArt();

  // ---------------------------------------------------------------- display painters
  const PAL = { bg: '#020a04', fg: '#56f070', dim: '#2a8a3a', amb: '#ffc040', red: '#ff5040', cy: '#60e0ff', wh: '#e8f0e8' };
  const page = { L: 'RDR', R: 'FCS' }; let mapZoom = 1, mapTrack = true;
  function osb(ctx, W, labels, sel) {   // the page legends along the top edge, the selected one boxed
    ctx.font = `bold 15px ${FONT}`; ctx.textAlign = 'center';
    labels.forEach((l, i) => { const x = W / 2 + (i - (labels.length - 1) / 2) * (W * 0.19); ctx.fillStyle = l === sel ? PAL.bg : PAL.fg; if (l === sel) { ctx.fillStyle = PAL.fg; ctx.fillRect(x - 24, 4, 48, 20); ctx.fillStyle = PAL.bg; } ctx.fillText(l, x, 19); });
  }
  function txt(ctx, t, x, y, col = PAL.fg, size = 16, align = 'left') { ctx.fillStyle = col; ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = align; ctx.fillText(t, x, y); }
  const pages = {
    RDR(c, W, S, J) {   // B-scope: azimuth across, range up; contacts the radar sees ahead
      const R = S.radar || { range: 2000, contacts: [] }, top = 40, bot = W - 30, l = 30, r = W - 30, rng = R.range;
      c.strokeStyle = PAL.dim; c.lineWidth = 1; c.strokeRect(l, top, r - l, bot - top);
      for (let i = 1; i < 4; i++) { const y = top + (bot - top) * i / 4; c.beginPath(); c.moveTo(l, y); c.lineTo(l + 10, y); c.stroke(); c.beginPath(); c.moveTo(r - 10, y); c.lineTo(r, y); c.stroke(); }
      for (const a of [-30, 0, 30]) { const x = l + (r - l) * (a + 60) / 120; c.beginPath(); c.moveTo(x, bot); c.lineTo(x, bot - 8); c.stroke(); }
      for (const k of R.contacts) {
        const x = l + (r - l) * clamp((deg(k.az) + 60) / 120, 0, 1), y = bot - (bot - top) * clamp(k.range / rng, 0, 1);
        c.fillStyle = k.ship ? PAL.cy : PAL.fg; if (k.locked) { c.strokeStyle = PAL.amb; c.lineWidth = 2; c.strokeRect(x - 11, y - 11, 22, 22); c.lineWidth = 1; }
        if (k.ship) c.fillRect(x - 9, y - 3, 18, 6); else c.fillRect(x - 5, y - 5, 10, 10);
        c.fillStyle = PAL.dim; c.font = `12px ${FONT}`; c.textAlign = 'center'; c.fillText(k.alt, x, y + 18);
      }
      txt(c, `RWS  ${(rng / 1000).toFixed(1)} KM`, l, W - 8, PAL.fg, 15); txt(c, `${R.contacts.length} TGT`, r, W - 8, PAL.fg, 15, 'right');
      if (S.tgt) txt(c, `${S.tgt.name}  ${(S.tgt.range / 1000).toFixed(2)} KM  ${S.tgt.lock ? 'LOCK' : ''}`, W / 2, top + 22, PAL.amb, 14, 'center');
    },
    SMS(c, W, S, J) {   // stores: top view of the jet with what is left on each station
      const cx = W / 2, cy = W / 2 + 20, k = 26;
      c.strokeStyle = PAL.fg; c.lineWidth = 2; c.beginPath();
      c.moveTo(cx, cy - 5.5 * k); c.lineTo(cx + 0.9 * k, cy - 1.5 * k); c.lineTo(cx + 5.5 * k, cy + 1.2 * k); c.lineTo(cx + 5.5 * k, cy + 1.9 * k); c.lineTo(cx + 1.2 * k, cy + 2.2 * k);
      c.lineTo(cx + 2.8 * k, cy + 4.3 * k); c.lineTo(cx, cy + 4.0 * k); c.lineTo(cx - 2.8 * k, cy + 4.3 * k); c.lineTo(cx - 1.2 * k, cy + 2.2 * k); c.lineTo(cx - 5.5 * k, cy + 1.9 * k);
      c.lineTo(cx - 5.5 * k, cy + 1.2 * k); c.lineTo(cx - 0.9 * k, cy - 1.5 * k); c.closePath(); c.stroke();
      const st = J.stores, sel = S.mode;
      [[-5.9, 0], [5.9, 0]].forEach(([x], i) => txt(c, st.aam[i] ? '9M' : '--', cx + x * k * 0.92, cy + 2.9 * k, st.aam[i] ? (sel === 'AA' ? PAL.wh : PAL.fg) : PAL.dim, 15, 'center'));
      [-3.9, -2.6, 2.6, 3.9].forEach((x, i) => txt(c, st.bomb[i] ? '82' : '--', cx + x * k, cy + 2.9 * k + (i % 2) * 18, st.bomb[i] ? (sel === 'AG' ? PAL.wh : PAL.fg) : PAL.dim, 15, 'center'));
      txt(c, `GUN ${J.gun * 5}`, cx, cy - 2.6 * k, PAL.fg, 16, 'center');
      txt(c, S.arm ? 'ARM' : 'SAFE', 20, W - 12, S.arm ? PAL.amb : PAL.fg, 18); txt(c, { NAV: 'NAV', AA: 'A/A  AIM-9M', AG: 'A/G  MK-82 CCIP' }[sel], W - 20, W - 12, PAL.fg, 15, 'right');
    },
    FCS(c, W, S, J) {   // flight control surfaces, live, in degrees (like the Hornet's FCS page)
      const s = J.surf, d = v => `${Math.round(deg(v))}`.padStart(3, ' ');
      const cell = (label, v, x, y) => { c.strokeStyle = PAL.dim; c.strokeRect(x - 40, y - 22, 80, 34); txt(c, d(v), x, y + 4, PAL.fg, 18, 'center'); txt(c, label, x, y - 28, PAL.dim, 12, 'center'); };
      cell('LEF', s.lef * 0.6, 70, 90); cell('LEF', s.lef * 0.6, W - 70, 90);
      cell('TEF', s.flap * 0.78, 70, 160); cell('TEF', s.flap * 0.78, W - 70, 160);
      cell('AIL', s.ail, 160, 160); cell('AIL', -s.ail, W - 160, 160);
      cell('RUD', s.rud, 150, 240); cell('RUD', s.rud, W - 150, 240);
      cell('STAB', s.stab + s.ail * 0.2, 110, 310); cell('STAB', s.stab - s.ail * 0.2, W - 110, 310);
      txt(c, J.casActive || (J.cas && J.onGround) ? 'CAS' : 'DIRECT', W / 2, 90, J.cas ? PAL.fg : PAL.amb, 22, 'center');
      txt(c, J.pa ? 'PA' : 'UA', W / 2, 120, PAL.fg, 18, 'center'); if (J.limiter) txt(c, 'AOA LIM', W / 2, 150, PAL.amb, 16, 'center');
      if (S.dmg && !S.dmg.fcsOk) txt(c, 'FCS FAIL', W / 2, 200, PAL.red, 18, 'center');
    },
    ENG(c, W, S, J) {   // engine and fuel page
      const row = (label, a, b, y, unit = '') => { txt(c, label, W / 2, y, PAL.dim, 14, 'center'); txt(c, a + unit, W / 2 - 70, y, PAL.fg, 20, 'right'); txt(c, b + unit, W / 2 + 70, y, PAL.fg, 20, 'left'); };
      const [L, R] = J.eng;
      txt(c, 'L', W / 2 - 100, 60, PAL.wh, 16, 'center'); txt(c, 'R', W / 2 + 100, 60, PAL.wh, 16, 'center');
      row('RPM %', Math.round(L.n * 100), Math.round(R.n * 100), 95); row('EGT C', Math.round(L.egt), Math.round(R.egt), 130);
      row('FF PPH', Math.round(L.ff * 7937 / 10) * 10, Math.round(R.ff * 7937 / 10) * 10, 165); row('NOZ %', Math.round(L.nozzle * 100), Math.round(R.nozzle * 100), 200);
      row('OIL PSI', Math.round(L.oil), Math.round(R.oil), 235); row('THRUST KN', (L.thrust / 1000).toFixed(0), (R.thrust / 1000).toFixed(0), 270);
      txt(c, `FUEL ${Math.round(J.fuel * LB / 10) * 10} LB`, W / 2, 315, J.fuel * LB < S.bingo ? PAL.amb : PAL.fg, 20, 'center');
      txt(c, `GW ${Math.round(J.mass * LB / 100) / 10}K LB`, W / 2, 342, PAL.dim, 15, 'center');
    },
    HSI(c, W, S, J) {   // compass rose, bearing / range to the carrier (TACAN) and the selected island (waypoint)
      const cx = W / 2, cy = W / 2 + 14, R = W * 0.36, hd = J.heading();
      c.strokeStyle = PAL.fg; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, 6.283); c.stroke();
      for (let a = 0; a < 360; a += 10) {
        const t = (a * Math.PI / 180) - hd - Math.PI / 2, l = a % 30 ? 8 : 16;
        c.beginPath(); c.moveTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); c.lineTo(cx + Math.cos(t) * (R - l), cy + Math.sin(t) * (R - l)); c.stroke();
        if (a % 30 === 0) txt(c, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), cx + Math.cos(t) * (R - 30), cy + Math.sin(t) * (R - 30) + 6, PAL.fg, 15, 'center');
      }
      c.fillStyle = PAL.wh; c.beginPath(); c.moveTo(cx, cy - 16); c.lineTo(cx - 10, cy + 14); c.lineTo(cx + 10, cy + 14); c.fill();
      const ptr = (brg, col, label, dist, y) => {
        const t = brg - hd - Math.PI / 2; c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(cx + Math.cos(t) * (R - 40), cy + Math.sin(t) * (R - 40)); c.lineTo(cx + Math.cos(t) * (R + 6), cy + Math.sin(t) * (R + 6)); c.stroke();
        txt(c, `${label} ${String(Math.round((deg(brg) + 360) % 360)).padStart(3, '0')}° ${(dist / 1852).toFixed(1)} NM`, 12, y, col, 15);
      };
      if (S.carrier) ptr(S.carrier.brg, PAL.cy, 'CV ', S.carrier.dist, W - 34);
      if (S.wpt) ptr(S.wpt.brg, PAL.amb, S.wpt.name.slice(0, 8), S.wpt.dist, W - 12);
      txt(c, String(Math.round((deg(hd) + 360) % 360)).padStart(3, '0'), cx, 52, PAL.wh, 20, 'center');
    },
  };
  function drawDDI(d, side, S, J) {
    const c = d.ctx, W = d.w; c.fillStyle = PAL.bg; c.fillRect(0, 0, W, W);
    if (S.flicker && Math.random() < 0.5) { txt(c, 'NO VIDEO', W / 2, W / 2, PAL.dim, 18, 'center'); d.tex.needsUpdate = true; return; }
    pages[page[side]](c, W, S, J); osb(c, W, ['RDR', 'SMS', 'FCS', 'ENG', 'HSI'], page[side]); d.tex.needsUpdate = true;
  }
  function drawMap(S, J) {   // AMPCD: the archipelago, fog of war, islands, units, you
    const c = ampcd.ctx, W = ampcd.w; c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
    const scale = W / (1600 / mapZoom), hd = mapTrack ? J.heading() : 0;
    c.save(); c.translate(W / 2, W / 2 + (mapTrack ? W * 0.18 : 0)); c.rotate(-hd); c.scale(scale, scale); c.translate(-J.pos.x, -J.pos.z);
    if (S.drawMap) S.drawMap(c, scale);
    c.restore();
    c.save(); c.translate(W / 2, W / 2 + (mapTrack ? W * 0.18 : 0)); c.rotate(mapTrack ? 0 : J.heading());
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -12); c.lineTo(-8, 9); c.lineTo(0, 5); c.lineTo(8, 9); c.fill(); c.restore();
    txt(c, mapTrack ? 'TRK UP' : 'N UP', 10, W - 10, PAL.fg, 14); txt(c, `${(800 / mapZoom / 1852).toFixed(2)} NM`, W - 10, W - 10, PAL.fg, 14, 'right');
    osb(c, W, ['N/T', 'ZM+', 'ZM-'], ''); ampcd.tex.needsUpdate = true;
  }
  function drawIFEI(S, J) {
    const c = ifei.ctx, W = 336, H = 192; c.fillStyle = '#05080a'; c.fillRect(0, 0, W, H);
    const [L, R] = J.eng, col = '#ffd7a0', row = (lab, a, b, y) => { txt(c, a, 110, y, col, 22, 'right'); txt(c, lab, 168, y, '#9a8a70', 13, 'center'); txt(c, b, 226, y, col, 22, 'left'); };
    row('RPM', Math.round(L.n * 100), Math.round(R.n * 100), 32); row('TEMP', Math.round(L.egt), Math.round(R.egt), 62);
    row('FF', Math.round(L.ff * 79.4), Math.round(R.ff * 79.4), 92); row('NOZ', Math.round(L.nozzle * 100), Math.round(R.nozzle * 100), 122); row('OIL', Math.round(L.oil), Math.round(R.oil), 152);
    const lb = Math.round(J.fuel * LB / 10) * 10;
    txt(c, `${lb}`, W - 8, 32, lb < S.bingo ? '#ff8040' : col, 22, 'right'); txt(c, 'FUEL', W - 8, 52, '#9a8a70', 12, 'right');
    txt(c, `${S.bingo}`, W - 8, 92, col, 18, 'right'); txt(c, 'BINGO', W - 8, 110, '#9a8a70', 12, 'right');
    const t = new Date(); txt(c, `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, W - 8, 180, col, 18, 'right');
    ifei.tex.needsUpdate = true;
  }
  function needle(c, cx, cy, r, a, col = '#fff', w = 3) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); c.stroke(); }
  function dialFace(c, cx, cy, r, n, labels) {
    c.fillStyle = '#0c0d0e'; c.beginPath(); c.arc(cx, cy, r, 0, 6.283); c.fill(); c.strokeStyle = '#ddd'; c.lineWidth = 2;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283; c.beginPath(); c.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82); c.lineTo(cx + Math.sin(a) * r * 0.95, cy - Math.cos(a) * r * 0.95); c.stroke(); }
    if (labels) labels.forEach((t, i) => txt(c, t, cx + Math.sin(i / labels.length * 6.283) * r * 0.62, cy - Math.cos(i / labels.length * 6.283) * r * 0.62 + 5, '#ddd', 13, 'center'));
  }
  function drawStby(S, J) {   // standby: airspeed, attitude, altimeter, vertical speed
    const c = stby.ctx, W = 300; c.fillStyle = '#1a1c1e'; c.fillRect(0, 0, W, W); const r = 66;
    const kt = J.eas * KT; dialFace(c, 75, 75, r, 20, ['0', '100', '200', '300', '400', '500', '600', '700']);
    needle(c, 75, 75, r * 0.85, clamp(kt, 0, 800) / 800 * 6.283); txt(c, 'KNOTS', 75, 108, '#aaa', 11, 'center');
    {   // attitude ball
      const att = J.attitude(); c.save(); c.beginPath(); c.arc(225, 75, r, 0, 6.283); c.clip(); c.translate(225, 75); c.rotate(-att.roll);
      const off = clamp(deg(att.pitch), -90, 90) * 2.2; c.fillStyle = '#3c78c8'; c.fillRect(-120, -260 + off, 240, 260); c.fillStyle = '#6a4626'; c.fillRect(-120, off, 240, 260);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-90, off); c.lineTo(90, off); c.stroke();
      for (const p of [-20, -10, 10, 20]) { c.beginPath(); c.moveTo(-18, off - p * 2.2); c.lineTo(18, off - p * 2.2); c.stroke(); }
      c.restore(); c.strokeStyle = '#ffd040'; c.lineWidth = 4; c.beginPath(); c.moveTo(190, 75); c.lineTo(215, 75); c.lineTo(225, 84); c.lineTo(235, 75); c.lineTo(260, 75); c.stroke();
    }
    const ft = J.pos.y * FT; dialFace(c, 75, 225, r, 10, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    needle(c, 75, 225, r * 0.85, (ft % 1000) / 1000 * 6.283); needle(c, 75, 225, r * 0.5, (ft % 10000) / 10000 * 6.283, '#ccc', 5);
    txt(c, String(Math.round(ft)).padStart(5, ' '), 75, 262, '#fff', 14, 'center');
    const vs = J.vel.y * FT * 60 / 1000; dialFace(c, 225, 225, r, 12, ['0', '1', '2', '4', '6', '', '6', '4', '2', '1']);
    needle(c, 225, 225, r * 0.85, -Math.PI / 2 + clamp(vs, -6, 6) / 6 * Math.PI * 0.9 + Math.PI / 2 - Math.PI / 2); txt(c, 'VSI', 225, 262, '#aaa', 11, 'center');
    stby.tex.needsUpdate = true;
  }
  const CAUTS = ['L ENG', 'R ENG', 'HYD', 'FCS', 'FUEL LO', 'BINGO', 'L FIRE', 'R FIRE', 'CANOPY', 'SPD BRK', 'LAUNCH BAR', 'HOOK'];
  function drawCaut(S) {
    const c = caut.ctx; c.fillStyle = '#0a0b0c'; c.fillRect(0, 0, 200, 260); const lit = new Set(S.cautions || []);
    CAUTS.forEach((t, i) => { const x = (i % 2) * 100 + 3, y = Math.floor(i / 2) * 43 + 3, on = lit.has(t), warn = t.includes('FIRE'); c.fillStyle = on ? (warn ? '#ff2a1a' : '#e8a010') : '#1d1f1c'; c.fillRect(x, y, 94, 37); txt(c, t, x + 47, y + 25, on ? '#111' : '#5a5d56', 14, 'center'); });
    caut.tex.needsUpdate = true;
  }
  function drawGearLights(J) {
    const c = gearL.ctx; c.fillStyle = '#0a0b0c'; c.fillRect(0, 0, 160, 120);
    const down = J.gear > 0.99, moving = J.gear > 0.01 && !down;
    ['NOSE', 'LEFT', 'RIGHT'].forEach((t, i) => { c.fillStyle = down ? '#30d040' : '#1b1d1b'; c.fillRect(4 + i * 52, 6, 48, 44); txt(c, t, 28 + i * 52, 34, down ? '#041' : '#444', 12, 'center'); });
    const f = J.surf.flap; [['HALF', f > 0.3 && f < 0.7], ['FULL', f > 0.9], ['FLAPS', f > 0.05 && J.surf.flap !== [0, 0.5, 1][J.flapSel]]].forEach(([t, on], i) => { c.fillStyle = on ? (i === 2 ? '#e8a010' : '#30d040') : '#1b1d1b'; c.fillRect(4 + i * 52, 62, 48, 44); txt(c, t, 28 + i * 52, 90, on ? '#041' : '#444', 12, 'center'); });
    gearL.tex.needsUpdate = true; gearRed.material.color.setHex(moving ? 0xff2010 : 0x300808);
  }
  function drawUFC(S, J) {
    const c = ufc.ctx; c.fillStyle = '#1a1d20'; c.fillRect(0, 0, 400, 220); c.fillStyle = '#04100a'; c.fillRect(20, 14, 360, 60);
    txt(c, S.ufc || `${S.mode}  ${S.arm ? 'ARM' : 'SAFE'}`, 200, 56, '#6dff7c', 26, 'center');
    for (let i = 0; i < 12; i++) { c.fillStyle = '#2f3438'; c.fillRect(30 + (i % 6) * 58, 96 + Math.floor(i / 6) * 58, 46, 44); txt(c, '1234567890-+'[i], 53 + (i % 6) * 58, 126 + Math.floor(i / 6) * 58, '#ddd', 18, 'center'); }
    ufc.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- HUD
  const hc = hud.ctx;
  // project a jet-local direction through the eye onto the combiner: returns canvas px or null when off the glass
  const _pr = [0, 0];
  function projLocal(d) {
    if (d.z > -1e-4) return null;
    const t = (HUD.z - JEYE.z) / d.z, x = JEYE.x + d.x * t, y = JEYE.y + d.y * t - HUD.cy;
    _pr[0] = HUD.W / 2 + x / HUD.hw * HUD.W / 2; _pr[1] = HUD.H / 2 - y / HUD.hh * HUD.H / 2; return _pr;
  }
  function projWorldDir(J, dw) { _v.copy(dw).applyQuaternion(_iq); return projLocal(_v); }
  function projWorldPt(J, p) { _v.copy(p).sub(_eye).applyQuaternion(_iq); if (_v.z > -0.5) return null; _v.normalize(); return projLocal(_v); }
  const onGlass = p => p && p[0] > 4 && p[0] < HUD.W - 4 && p[1] > 4 && p[1] < HUD.H - 4;
  function drawHUD(J, S) {
    const c = hc, W = HUD.W, H = HUD.H; c.clearRect(0, 0, W, H);
    if (!S.power) { hud.tex.needsUpdate = true; return; }
    if (S.flicker && Math.random() < 0.35) { hud.tex.needsUpdate = true; return; }
    c.save(); c.strokeStyle = GRN; c.fillStyle = GRN; c.lineWidth = 3; c.font = `bold 20px ${FONT}`; c.shadowColor = 'rgba(80,255,110,.8)'; c.shadowBlur = 4;
    const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    const T = (t, x, y, a = 'center', sz = 17) => { c.font = `bold ${Math.round(sz * 1.2)}px ${FONT}`; c.textAlign = a; c.fillText(t, x, y); };
    // waterline (boresight) and the flight path marker
    const wl = projLocal(_w.set(0, 0, -1)); if (wl) { const [x, y] = wl; line(x - 18, y, x - 8, y); line(x - 8, y, x - 4, y + 6); line(x - 4, y + 6, x, y); line(x, y, x + 4, y + 6); line(x + 4, y + 6, x + 8, y); line(x + 8, y, x + 18, y); }
    let fpm = null;
    if (J.tas > 8) { const p = projWorldDir(J, _w.copy(J.vel).normalize()); if (p) { fpm = [clamp(p[0], 20, W - 20), clamp(p[1], 20, H - 20)]; } }
    const fx = fpm ? fpm[0] : W / 2, fy = fpm ? fpm[1] : H / 2;
    // pitch ladder: conformal, every 5 degrees, centred on the flight path's heading
    const hv = Math.atan2(J.vel.x, -J.vel.z), vh = J.tas > 8 ? hv : J.heading();
    for (let k = -90; k <= 90; k += 5) {
      const e = k * Math.PI / 180, mk = (dpsi) => projWorldDir(J, _w.set(Math.sin(vh + dpsi) * Math.cos(e), Math.sin(e), -Math.cos(vh + dpsi) * Math.cos(e)));
      const half = k === 0 ? 0.2 : 0.075, gap = k === 0 ? 0.035 : 0.025;
      const a0 = mk(-half), a0b = a0 && [a0[0], a0[1]], a1 = mk(-gap), a1b = a1 && [a1[0], a1[1]], b0 = mk(gap), b0b = b0 && [b0[0], b0[1]], b1 = mk(half), b1b = b1 && [b1[0], b1[1]];
      if (!a0b || !a1b || !b0b || !b1b) continue;
      if (Math.max(a0b[1], b1b[1]) < -40 || Math.min(a0b[1], b1b[1]) > H + 40) continue;
      c.setLineDash(k < 0 ? [8, 6] : []);
      line(a0b[0], a0b[1], a1b[0], a1b[1]); line(b0b[0], b0b[1], b1b[0], b1b[1]); c.setLineDash([]);
      if (k !== 0) {
        const nx = (b1b[1] - a0b[1]), ny = -(b1b[0] - a0b[0]), nl = Math.hypot(nx, ny) || 1, tk = (k > 0 ? 9 : -9) / nl;
        line(a0b[0], a0b[1], a0b[0] - nx * tk, a0b[1] - ny * tk); line(b1b[0], b1b[1], b1b[0] - nx * tk, b1b[1] - ny * tk);
        T(String(Math.abs(k)), a0b[0] - 16, a0b[1] + 6, 'right', 14); T(String(Math.abs(k)), b1b[0] + 16, b1b[1] + 6, 'left', 14);
      }
    }
    // flight path marker: circle with wings and a fin
    c.beginPath(); c.arc(fx, fy, 8, 0, 6.283); c.stroke(); line(fx - 8, fy, fx - 22, fy); line(fx + 8, fy, fx + 22, fy); line(fx, fy - 8, fx, fy - 16);
    if (J.pa && J.tas > 8) {   // AoA approach bracket: on-speed (8.1 deg) when the FPM sits in its middle
      const bx = fx - 30, a = deg(J.alpha), by = fy + (a - 8.1) * 9;
      line(bx, by - 18, bx, by + 18); line(bx, by - 18, bx + 6, by - 18); line(bx, by + 18, bx + 6, by + 18); line(bx - 6, by, bx, by);
    }
    // speed box (left), altitude box (right), heading tape (top)
    const box = (x, y, w, h, t) => { c.strokeRect(x - w / 2, y - h / 2, w, h); T(t, x, y + 7, 'center', 20); };
    box(70, H / 2 - 30, 82, 30, String(Math.round(J.eas * KT)));
    const ftv = J.pos.y * FT, aglft = S.agl * FT;
    box(W - 76, H / 2 - 30, 92, 30, aglft < 1500 && S.agl < 400 ? `${Math.round(aglft / 10) * 10}R` : String(Math.round(ftv / 10) * 10));
    T(`M ${J.mach.toFixed(2)}`, 70, H / 2 + 10, 'center', 15); T(`G ${J.nz.toFixed(1)}`, 70, H / 2 + 30, 'center', 15);
    T(`α ${deg(J.alpha).toFixed(1)}`, 70, H / 2 - 62, 'center', 15);
    if (J.nzMax > 4) T(`${J.nzMax.toFixed(1)}`, 70, H / 2 + 50, 'center', 14);
    T(`${J.vel.y >= 0 ? '+' : ''}${Math.round(J.vel.y * FT * 60)}`, W - 76, H / 2 + 10, 'center', 14);
    {
      const hd = (deg(J.heading()) + 360) % 360, cx = W / 2, y = 36;
      for (let a = Math.ceil((hd - 12) / 5) * 5; a <= hd + 12; a += 5) { const x = cx + (a - hd) * 13; line(x, y, x, y + (a % 10 ? 6 : 11)); if (a % 10 === 0) T(String(((a + 360) % 360) / 10 | 0).padStart(2, '0'), x, y - 4, 'center', 14); }
      line(cx, y + 14, cx - 6, y + 22); line(cx, y + 14, cx + 6, y + 22);
    }
    // carrier: ship symbol on its position, range, and in PA mode the ICLS needles (glideslope / centreline)
    if (S.carrier) {
      const p = projWorldPt(J, S.carrier.pos); if (onGlass(p)) { c.strokeRect(p[0] - 10, p[1] - 4, 20, 8); line(p[0], p[1] - 4, p[0], p[1] - 10); }
      T(`CV ${(S.carrier.dist / 1852).toFixed(1)}`, W - 76, H / 2 + 74, 'center', 14);
      if (J.pa && S.carrier.icls) {
        const { gs, loc } = S.carrier.icls, cx = W / 2, cy = H / 2 + 10;   // needle offsets in degrees: +gs = above path, +loc = right of centreline
        c.setLineDash([3, 4]); line(cx - 70, cy + clamp(gs, -1.5, 1.5) * 50, cx + 70, cy + clamp(gs, -1.5, 1.5) * 50); line(cx - clamp(loc, -3, 3) * 25, cy - 70, cx - clamp(loc, -3, 3) * 25, cy + 70); c.setLineDash([]);
      }
    }
    // weapons
    if (S.mode === 'AA') {
      const sk = S.seeker; if (sk) { const p = projWorldDir(J, sk.dir); if (p) { c.beginPath(); c.arc(p[0], p[1], sk.locked ? 14 : 40, 0, 6.283); c.stroke(); } }
      T(`AIM-9 ${J.stores.aam.filter(Boolean).length}`, 70, H - 22, 'center', 15);
    } else if (S.mode === 'AG') {
      T(`MK-82 ${J.stores.bomb.filter(Boolean).length}`, 70, H - 22, 'center', 15);
      if (S.ccip) {
        const p = projWorldPt(J, S.ccip);
        if (p) {   // displayed impact line from the FPM down to the pipper; off the glass the pipper sits on the edge, dashed
          const px = clamp(p[0], 14, W - 14), py = clamp(p[1], 14, H - 14), off = px !== p[0] || py !== p[1];
          if (off) c.setLineDash([6, 6]); line(fx, fy + 8, px, py); c.setLineDash([]);
          c.beginPath(); c.arc(px, py, 7, 0, 6.283); c.stroke(); c.fillRect(px - 1.5, py - 1.5, 3, 3);
          if (!off) T('REL', px + 26, py + 6, 'left', 13);
        }
      }
    } else T('NAV', 70, H - 22, 'center', 15);
    T(`${S.arm ? 'ARM' : 'SAFE'}  GUN ${J.gun * 5}`, W - 80, H - 22, 'center', 14);
    if (S.pipper) {   // gun pipper: where the rounds fired now will be at the target range (with target lead)
      const p = projWorldPt(J, S.pipper); if (onGlass(p)) { c.beginPath(); c.arc(p[0], p[1], 18, 0, 6.283); c.stroke(); c.fillRect(p[0] - 2, p[1] - 2, 4, 4);
        if (S.tgt) { const fr = clamp(S.tgt.range / 1200, 0, 1); c.lineWidth = 4; c.beginPath(); c.arc(p[0], p[1], 22, -Math.PI / 2, -Math.PI / 2 + fr * 6.283); c.stroke(); c.lineWidth = 2.2; } }
    }
    if (S.tgt) {   // target designator box on the radar target, range, and the SHOOT cue
      const p = projWorldPt(J, S.tgt.pos);
      if (onGlass(p)) { c.strokeRect(p[0] - 13, p[1] - 13, 26, 26); if (S.tgt.lock) { c.beginPath(); c.moveTo(p[0], p[1] - 19); c.lineTo(p[0] + 19, p[1]); c.lineTo(p[0], p[1] + 19); c.lineTo(p[0] - 19, p[1]); c.closePath(); c.stroke(); } }
      else { const a = Math.atan2(-(_v.y), _v.x); line(W / 2, H / 2, W / 2 + Math.cos(a) * 60, H / 2 + Math.sin(a) * 60); }
      T(`${(S.tgt.range / 1852).toFixed(1)}`, W - 76, H / 2 + 52, 'center', 15);
      if (S.tgt.shoot && (performance.now() % 600) < 400) T('SHOOT', W / 2, H - 52, 'center', 22);
    }
    // warnings
    if (S.warn === 'TERRAIN') { if ((performance.now() % 700) < 450) T('TERRAIN', W / 2, H / 2 + 80, 'center', 20); }
    else if (S.warn && (performance.now() % 500) < 330) { c.lineWidth = 3; line(W / 2 - 60, H / 2 - 50, W / 2 + 60, H / 2 + 50); line(W / 2 + 60, H / 2 - 50, W / 2 - 60, H / 2 + 50); T(S.warn, W / 2, H / 2 + 80, 'center', 22); }
    if (J.fuel * LB < S.bingo) T('BINGO', W / 2, H - 82, 'center', 18);
    if (J.limiter) T('AOA', W / 2 - 110, H / 2 - 62, 'center', 15);
    if (J.cat) T(J.cat.state === 'hold' ? 'CAT  -  MIL POWER TO LAUNCH' : 'CAT', W / 2, H - 112, 'center', 15);
    if (J.wire) T(`WIRE ${J.trapWire}`, W / 2, H - 112, 'center', 18);
    if (J.gear > 0.5 && !J.onGround && J.eas * KT > 250) T('GEAR', W / 2, 96, 'center', 18);
    c.restore(); hud.tex.needsUpdate = true;
  }

  // CM: threat lamps + dispenser counters (redrawn only when something changes)
  let thrKey = '';
  function drawThreat(S) {
    const R = S.rwr, d = S.cm, bl = (performance.now() % 400) < 220, pw = S.power !== false;
    const lk = pw && R && R.locked && !R.launch, ln = pw && R && R.launch && bl, lz = pw && R && R.laser;
    const k = `${lk}${ln}${lz}${pw}${d ? d.flare + ':' + d.chaff + ':' + d.queue.length : ''}`; if (k === thrKey) return; thrKey = k;
    const c = thrD.ctx; c.fillStyle = '#0d0f11'; c.fillRect(0, 0, 340, 200);
    const lampAt = (x, y, label, on, col, off) => { c.fillStyle = on ? col : off; c.fillRect(x, y, 104, 46); c.strokeStyle = '#000'; c.lineWidth = 3; c.strokeRect(x, y, 104, 46); txt(c, label, x + 52, y + 31, on ? '#111' : '#5a5d56', 20, 'center'); };
    lampAt(6, 8, 'LOCK', lk, '#ffb020', '#2a2008'); lampAt(118, 8, 'LAUNCH', ln, '#ff3020', '#3a0a08'); lampAt(230, 8, 'LASER', lz, '#40e0ff', '#08262c');
    c.fillStyle = '#020a04'; c.fillRect(6, 70, 328, 124); c.strokeStyle = '#3c4440'; c.strokeRect(6, 70, 328, 124);
    if (pw && d) { txt(c, 'ALE-39', 170, 98, PAL.dim, 18, 'center'); txt(c, `FLR ${String(d.flare).padStart(2, '0')}`, 90, 150, d.flare ? PAL.fg : PAL.amb, 34, 'center'); txt(c, `CHF ${String(d.chaff).padStart(2, '0')}`, 250, 150, d.chaff ? PAL.fg : PAL.amb, 34, 'center'); if (d.queue.length) txt(c, 'DISPENSING', 170, 184, PAL.amb, 16, 'center'); }
    thrD.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- per frame
  let t = 0, slot = 0, artKey = '', mcFlash = 0;
  return {
    group: g, hitBoxes: hits, PAGES, cmState: () => thrKey,   // CM: lamp / counter state, for tests
    labelOf(id) { const h = hits.find(o => o.userData.sw === id); return h ? h.userData.label : id; },
    press(id) {
      if (id.startsWith('ddiL:')) page.L = id.slice(5); else if (id.startsWith('ddiR:')) page.R = id.slice(5);
      else if (id === 'ampcd:MAP') mapTrack = !mapTrack; else if (id === 'ampcd:MAP+') mapZoom = Math.min(8, mapZoom * 2); else if (id === 'ampcd:MAP-') mapZoom = Math.max(0.5, mapZoom / 2);
      if (id === 'mc') mcFlash = 0.2;
    },
    // J = jet sim, ctl = pilot inputs { pitch, roll, yaw, throttle:[l,r], brakeL, brakeR }, S = everything else (see main.js)
    update(J, ctl, dt, S, cam) {
      t += dt;
      _eye.copy(JEYE).applyQuaternion(J.q).add(J.pos); _iq.copy(J.q).invert();
      // moving parts follow the pilot's hands and feet
      stickP.rotation.set((ctl.pitch || 0) * 0.28, 0, -(ctl.roll || 0) * 0.28);
      thr.forEach((o, i) => { o.position.z = -3.98 - 0.4 * clamp(ctl.throttle ? ctl.throttle[i] : 0, 0, 1); o.rotation.x = 0; });
      pedals[0].p.position.z = -5.12 + (ctl.yaw || 0) * 0.07; pedals[1].p.position.z = -5.12 - (ctl.yaw || 0) * 0.07;
      pedals[0].pl.rotation.x = -0.35 - (ctl.brakeL || 0) * 0.25; pedals[1].pl.rotation.x = -0.35 - (ctl.brakeR || 0) * 0.25;
      canopyG.rotation.x = J.canopy * 0.75;
      gearH.rotation.x = J.gearCmd ? 0.0 : 0.5; gearH.position.y = J.gearCmd ? -0.1 : -0.06; hookH.position.y = J.hookCmd ? -0.1 : -0.06;
      const flip = (id, on, three) => { if (!sw[id]) return; sw[id].rotation.z = 0; sw[id].rotation.y = 0; if (three !== undefined) sw[id].rotation.x = -Math.PI / 2 + [-0.5, 0, 0.5][three]; else if (sw[id].parent === P) sw[id].rotation.x = on ? -0.5 : 0.5; else sw[id].rotation.x = -Math.PI / 2 + (on ? -0.5 : 0.5); };
      flip('arm', S.arm); flip('flaps', 0, J.flapSel); flip('cas', J.cas); flip('engL', J.eng[0].run || J.eng[0].start > 0); flip('engR', J.eng[1].run || J.eng[1].start > 0);
      flip('lights', S.lights); flip('canopy', J.canopyCmd); flip('pbrake', S.pbrake);
      // lamps
      const a = deg(J.alpha), pa = J.pa && !J.onGround;
      setLamp(aoaHi, pa && a > 8.8); setLamp(aoaOn, pa && a > 7.4 && a < 8.8); setLamp(aoaLo, pa && a < 7.4);
      setLamp(lockL, S.tgt && S.tgt.lock); setLamp(shootL, S.tgt && S.tgt.shoot);
      const blink = (performance.now() % 500) < 260;
      setLamp(fireLL, S.fire && S.fire[0] && blink); setLamp(fireRL, S.fire && S.fire[1] && blink);
      mcFlash -= dt; setLamp(mcL, (S.masterCaution && blink) || mcFlash > 0); setLamp(hookLamp, J.hook > 0.01 && J.hook < 0.99 || (J.hookCmd && !J.wire && J.onGround));
      jettB.position.z = 0.008 - (S.hover === 'jett' ? 0.003 : 0);
      // hover marker
      hov.visible = false;
      if (S.hover) { const h = hits.find(o => o.userData.sw === S.hover); if (h) { h.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false); hov.visible = true; hov.matrixAutoUpdate = false; h.geometry.computeBoundingBox(); const bb = h.geometry.boundingBox; hov.matrix.copy(g.matrixWorld).invert().multiply(h.matrixWorld).multiply(new THREE.Matrix4().makeScale(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)); } }
      // displays: HUD every frame, the rest round-robin at ~15 Hz each
      drawHUD(J, S);
      if (S.rwr) { drawThreat(S); if (slot % 2) { const f = J.forward(_w); drawRwr(rwrD.ctx, 200, S.rwr, Math.atan2(f.x, -f.z), t, 'alr', S.power !== false); rwrD.tex.needsUpdate = true; } }   // CM
      slot = (slot + 1) % 4;
      if (slot === 0) drawDDI(ddiL, 'L', S, J); else if (slot === 1) drawDDI(ddiR, 'R', S, J); else if (slot === 2) drawMap(S, J);
      else { drawIFEI(S, J); drawStby(S, J); drawCaut(S); drawGearLights(J); const k = `${S.mode}${S.arm}${S.ufc}`; if (k !== artKey) { artKey = k; drawUFC(S, J); } }
    },
  };
}
