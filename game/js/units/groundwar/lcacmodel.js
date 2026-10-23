// THE GROUND WAR: a seized LCAC (Landing Craft, Air Cushion) - how the RUNAWAY bring their seized MBTs ashore.
// Modern hardware brought back (BIBLE: weathered and refitted: sensor pods bolted on, cyan IFF strips, crude machine
// stencils over the old markings). Real dimensions (commonly published, C): 26.4 m long and 14.3 m wide on cushion,
// cargo deck 20.4 x 8.2 m with ramps at both ends, two shrouded reversible-pitch propellers 3.58 m (11.75 ft), four
// lift-fan intakes in the side structures, operator cabin forward on the starboard side; a 60 t payload: one MBT.
// House style: flat-shaded Lambert, vertex colours, one merged mesh per moving part.
import * as THREE from 'three';
import { Kit, RW, rwMats, stencilTex, decal } from '../runaway/rwkit.js';

export const LCAC = { L: 26.4, W: 14.3, DECK: 2.05, RAMP_L: 4.6, RAMP_W: 8.2, PROP_R: 1.79, PROP_Y: 4.5, PROP_X: 4.7, PROP_Z: 11.4 };
const GREY = 0x8d9295, GREY2 = 0x767b7e, GREY3 = 0xa3a8aa, DECKC = 0x55595a, SKIRT = 0x262829, RUST = 0x7a5a42, DARK = 0x1c1f22;

function hullKit() {
  const k = new Kit(), L = LCAC.L, W = LCAC.W, D = LCAC.DECK;
  // the skirt: bag and fingers, flaring out under the buoyancy box (black rubber, scuffed lighter near the hem)
  k.taper(W + 0.9, L + 0.9, W - 0.2, L - 0.4, 1.1, 0, 0, 0, SKIRT);
  k.taper(W - 0.2, L - 0.4, W - 0.4, L - 0.7, 0.35, 0, 1.1, 0, 0x34373a);
  for (let i = 0; i < 26; i++) { const z = -L / 2 + 0.6 + i * (L - 1.2) / 25; for (const s of [-1, 1]) k.box(0.12, 0.9, 0.5, s * (W / 2 + 0.38), 0.5, z, 0x1a1c1d, [0, 0, s * 0.35]); }   // finger seams
  // buoyancy box and the cargo deck (a well between the side structures)
  k.box(W - 0.4, 0.6, L - 0.7, 0, D - 0.3, 0, GREY2);
  k.box(LCAC.RAMP_W + 0.2, 0.06, 20.4, 0, D + 0.03, 0.2, DECKC);
  for (let i = 0; i < 9; i++) k.box(LCAC.RAMP_W, 0.03, 0.12, 0, D + 0.07, -9 + i * 2.3, 0x4a4e4f);   // tie-down rails
  for (let i = 0; i < 4; i++) k.box(0.08, 0.03, 20, -3 + i * 2, D + 0.07, 0.2, 0x4a4e4f);
  // side structures (port + starboard): engines, lift fans, crew spaces
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 1.55);
    k.taper(2.9, 22, 2.5, 21.2, 2.5, x, D, 0.6, GREY);
    k.box(2.6, 0.08, 21, x, D + 2.52, 0.6, GREY3);
    for (const z of [-5.5, 4.5]) { k.cyl(1.05, 1.05, 0.12, 14, x, D + 2.6, z, DARK); for (let i = 0; i < 6; i++) k.box(2.0, 0.05, 0.07, x, D + 2.67, z - 0.8 + i * 0.32, 0x55595b); }   // lift-fan intakes + grilles
    k.box(1.0, 0.9, 1.6, x, D + 2.95, 8.5, GREY2); k.box(0.8, 0.12, 1.3, x, D + 3.45, 8.5, 0x2a2a2a);   // exhaust stacks (sooty)
    k.box(0.02, 1.4, 6, s * (W / 2 - 0.08), D + 1.0, -4, RUST, [0, 0, 0]);   // rust streaks
    k.box(0.02, 0.9, 3, s * (W / 2 - 0.08), D + 1.4, 6, RUST);
    for (let i = 0; i < 5; i++) k.box(0.05, 0.05, 0.05, s * (W / 2 - 0.1), D + 0.4, -9 + i * 4.6, 0x3a3d40);   // cleats
  }
  // operator cabin, starboard forward: the windows are painted over; RUNAWAY sensors where the crew sat
  k.box(2.6, 2.0, 3.0, W / 2 - 1.55, D + 3.5, -8.4, GREY3);
  k.box(2.62, 0.5, 2.8, W / 2 - 1.55, D + 3.9, -8.6, DARK);
  k.box(0.12, 1.6, 0.12, W / 2 - 2.6, D + 5.3, -8.0, DARK); k.box(1.2, 0.08, 0.08, W / 2 - 2.6, D + 6.0, -8.0, DARK);   // mast + yard
  // the props' shrouds (fixed; the blades spin inside) on pylons, with the twin rudders behind each
  for (const s of [-1, 1]) {
    const x = s * LCAC.PROP_X, y = LCAC.PROP_Y, z = LCAC.PROP_Z;
    const ring = new THREE.TorusGeometry(LCAC.PROP_R + 0.22, 0.24, 6, 20); k.add(ring, GREY, new THREE.Matrix4().makeTranslation(x, y, z));
    const sh = new THREE.CylinderGeometry(LCAC.PROP_R + 0.3, LCAC.PROP_R + 0.3, 1.6, 20, 1, true).rotateX(Math.PI / 2); k.add(sh, GREY2, new THREE.Matrix4().makeTranslation(x, y, z));
    k.box(0.5, y - D - 0.6, 1.2, x, D + (y - D) / 2 - 0.3, z, GREY2);   // pylon
    for (const r of [-0.9, 0.9]) k.box(0.12, 3.2, 1.1, x + r, y, z + 1.4, GREY3);   // rudders
  }
  k.box(LCAC.RAMP_W - 1, 1.3, 0.2, 0, D + 0.6, L / 2 - 0.3, GREY2);   // stern ramp (closed)
  return k;
}
function rampKit() {   // the bow ramp: hinged at the deck's forward edge, local origin on the hinge, ramp along -z
  const k = new Kit(), w = LCAC.RAMP_W, l = LCAC.RAMP_L;
  k.box(w, 0.18, l, 0, 0, -l / 2, GREY2);
  for (let i = 0; i < 10; i++) k.box(w - 0.2, 0.05, 0.1, 0, 0.11, -0.3 - i * 0.43, 0x4e5254);   // cleats
  k.box(0.2, 0.7, l, -w / 2, 0.35, -l / 2, GREY); k.box(0.2, 0.7, l, w / 2, 0.35, -l / 2, GREY);
  return k;
}
function propKit() {   // four blades on a hub, in the shroud plane (x-y), spinning about z
  const k = new Kit();
  k.cyl(0.32, 0.32, 0.7, 10, 0, 0, 0, DARK, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; k.box(0.32, LCAC.PROP_R - 0.25, 0.06, Math.sin(a) * LCAC.PROP_R * 0.5, Math.cos(a) * LCAC.PROP_R * 0.5, 0, 0x2c2f31, [0.25, 0, -a]); }
  return k;
}
function refitKit() {   // RUNAWAY additions: sensor pod over the cabin, IFF strips, seams
  const k = new Kit(), D = LCAC.DECK, W = LCAC.W;
  k.box(1.2, 0.5, 1.0, W / 2 - 1.55, D + 4.75, -9.1, RW.ceramic); k.box(1.0, 0.25, 0.4, W / 2 - 1.55, D + 4.75, -9.65, RW.composite);
  k.glowBox(0.7, 0.07, 0.02, W / 2 - 1.55, D + 4.8, -9.86);
  for (const s of [-1, 1]) { k.glowBox(0.02, 0.12, 18, s * (W / 2 - 0.02), D + 2.2, 0.6); k.glowBox(2.0, 0.03, 0.12, s * (W / 2 - 1.55), D + 2.58, -10.1); }
  return k;
}
let PROTO = null;
function protos() {
  if (PROTO) return PROTO; const M = rwMats();
  PROTO = { hull: hullKit().build(M.body, M.glow, 'lcacHull'), ramp: rampKit().build(M.body, M.glow, 'lcacRamp'), prop: propKit().build(M.body, M.glow, 'lcacProp'), refit: refitKit().build(M.body, M.glow, 'lcacRefit') };
  return PROTO;
}
export function buildLCAC(opt = {}) {
  const P = protos(), M = rwMats();
  const group = new THREE.Group(); group.name = 'lcac';
  group.add(P.hull.clone(), P.refit.clone());
  const rampPivot = new THREE.Group(); rampPivot.position.set(0, LCAC.DECK, -10.3); group.add(rampPivot);
  const ramp = P.ramp.clone(); rampPivot.add(ramp);
  const props = [-1, 1].map(s => { const p = P.prop.clone(); p.position.set(s * LCAC.PROP_X, LCAC.PROP_Y, LCAC.PROP_Z); group.add(p); return p; });
  if (opt.tag && typeof document !== 'undefined') for (const s of [-1, 1]) { const d = decal(stencilTex(opt.tag, { w: 256, h: 64, color: '#e6f4f8', font: 'bold 42px monospace' }), 3.2, 0.8, s * (LCAC.W / 2 - 0.01), LCAC.DECK + 1.2, -2, [0, s * Math.PI / 2, 0]); group.add(d); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(LCAC.W * 1.05, LCAC.L * 1.05).rotateX(-Math.PI / 2), M.shadow); shadow.renderOrder = -1; group.add(shadow); shadow.position.y = 0.05;
  let spin = 0;
  return {
    group, ramp: rampPivot, props, shadow,
    // s: { ramp 0 (up, closed) .. 1 (down on the ground), prop -1..1 (pitch: thrust ahead / astern), lift 0..1 }
    animate(s, dt) {
      spin += dt * (6 + 30 * Math.abs(s.prop || 0)) * (s.lift > 0.05 ? 1 : 0.2);
      for (const p of props) p.rotation.z = spin;
      // up: the ramp stands near vertical (it closes the bow); down: it reaches the ground ahead
      rampPivot.rotation.x = 1.35 * (1 - (s.ramp || 0)) - (s.ramp || 0) * 0.46;
    },
  };
}
