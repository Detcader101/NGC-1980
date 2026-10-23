// NGC-1980 infantry: weapon models (M16A1, M16A1 + M203, M60, M72A2 LAW, M1911A1) at real dimensions, house style.
// Shared by the first-person viewmodel (detail = 'high') and the third-person soldier (detail = 'low').
//
// WEAPON FRAME: origin at the rear sight (the point the eye looks through), line of sight along -z, +y up, +x right.
// The bore is `sightHeight` below the line of sight. Every model returns
//   { group, parts: { name: Object3D } (moving parts), anchors: { name: [x, y, z] } (where hands / items go),
//     sight: { eyeRelief, ... }, setState(st) (drive the moving parts) }
// Moving parts are separate meshes (one draw call each); the static body is one mesh.
import * as THREE from 'three';
import { Kit, KITMAT, COL } from './meshkit.js';

const D = Math.PI / 180;
// thin flat plate from a 2D outline with optional round holes, in the XY plane (extruded along z)
function plate(outline, holes, thick) {
  const sh = new THREE.Shape(outline.map(p => new THREE.Vector2(p[0], p[1])));
  for (const [cx, cy, r] of holes || []) { const h = new THREE.Path(); h.absarc(cx, cy, r, 0, Math.PI * 2, true); sh.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 12 }); g.translate(0, 0, -thick / 2); return g;
}
function part(kit, name, parent, pos = [0, 0, 0], mat) { const g = new THREE.Group(); g.name = name; g.position.set(...pos); if (!kit.empty) g.add(kit.mesh(mat || KITMAT.steel(), name + 'Mesh')); parent.add(g); return g; }
// the aperture / peep leaf: dark and slightly see-through (an out-of-focus ring at 7 cm from the eye)
let apMat = null;
const apertureMat = () => apMat || (apMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0c, transparent: true, opacity: 0.62, depthWrite: false }));

// ------------------------------------------------------------------------------------------------ M16A1
// 39 in overall, 20 in barrel, sight radius 19.75 in, carry handle rear sight with two flip apertures, triangular
// handguards, birdcage flash suppressor, forward assist, 20-round magazine.
export function buildM16(o = {}) {
  const hi = o.detail !== 'low', gl = !!o.m203;
  const G = new THREE.Group(); G.name = gl ? 'M16A1_M203' : 'M16A1';
  const k = new Kit(), BY = -0.066;   // bore height
  const P = COL.park, PD = COL.parkDark, F = COL.furniture;
  // upper receiver + carry handle
  k.box(0.032, 0.056, 0.26, P, [0, -0.064, -0.035]);                              // upper receiver body
  k.box(0.026, 0.012, 0.24, PD, [0, -0.033, -0.035]);                             // flat top under the handle
  k.prism([[0.05, -0.036], [0.05, -0.013], [0.02, -0.011], [-0.17, -0.011], [-0.17, -0.036], [-0.13, -0.036], [-0.13, -0.022], [0.02, -0.022], [0.02, -0.036]], 0.016, P, [0, 0, 0], 'zy');   // carry handle: a loop, its top just under the line of sight
  k.box(0.03, 0.022, 0.04, P, [0, -0.024, 0.022]);                                 // rear sight housing in the handle
  for (const sx of [-1, 1]) k.prism([[0.022, -0.014], [0.022, 0.0], [0.012, 0.004], [-0.006, 0.004], [-0.012, -0.002], [-0.012, -0.014]], 0.0035, P, [sx * 0.0125, 0, 0], 'zy');   // the ears either side of the aperture
  if (hi) k.cyl(0.005, 0.005, 0.005, PD, [0.017, -0.027, 0.03], "x", 10);   // windage drum (right side; the A1 has no elevation knob)
  // lower receiver, magwell, trigger guard, pistol grip
  k.box(0.03, 0.036, 0.205, P, [0, -0.108, -0.008]);
  k.prism([[-0.025, -0.092], [-0.108, -0.092], [-0.112, -0.158], [-0.022, -0.158]], 0.036, P, [0, 0, 0], 'zy');   // magwell (flared)
  k.prism([[0.04, -0.125], [0.012, -0.125], [-0.02, -0.126], [-0.022, -0.152], [0.04, -0.152], [0.04, -0.145], [-0.012, -0.146], [-0.012, -0.132], [0.04, -0.131]], 0.012, PD, [0, 0, 0], 'zy');   // trigger guard
  k.prism([[0.012, -0.124], [0.045, -0.124], [0.083, -0.214], [0.072, -0.226], [0.046, -0.222], [0.02, -0.132]], 0.028, F, [0, 0, 0], 'zy');   // pistol grip
  if (hi) for (let i = 0; i < 4; i++) k.box(0.03, 0.003, 0.012, PD, [0, -0.148 - i * 0.017, 0.035 + i * 0.008 + 0.012], [0.42, 0, 0]);   // grip finger grooves
  // buttstock (straight line), buttplate with the trapdoor
  k.prism([[0.095, -0.044], [0.335, -0.041], [0.345, -0.043], [0.345, -0.172], [0.335, -0.174], [0.12, -0.124], [0.095, -0.12]], 0.04, F, [0, 0, 0], 'zy');
  k.box(0.044, 0.135, 0.014, PD, [0, -0.107, 0.35]);
  if (hi) { k.box(0.046, 0.02, 0.012, F, [0, -0.06, 0.34]); k.cyl(0.004, 0.004, 0.046, P, [0, -0.162, 0.33], 'x', 6); }   // trap door hinge, sling swivel
  // barrel, delta ring, handguards (or the M203), front sight base, birdcage
  k.cyl(0.031, 0.031, 0.012, P, [0, BY, -0.172], 'z', 12);                         // delta ring
  k.cyl(0.0075, 0.0075, 0.43, P, [0, BY, -0.38], 'z', 8);                           // barrel (A1 profile)
  if (!gl) {
    k.cyl(0.028, 0.028, 0.235, F, [0, BY - 0.004, -0.295], 'z', 6, [0, 0, Math.PI / 6]);   // triangular-ish handguards (hex section)
    if (hi) for (let i = 0; i < 10; i++) k.box(0.058, 0.003, 0.012, PD, [0, BY - 0.004 - 0.024, -0.2 - i * 0.021]);   // ribs underneath
    k.cyl(0.024, 0.026, 0.012, P, [0, BY, -0.418], 'z', 12);                         // handguard cap
  }
  k.box(0.022, 0.024, 0.04, P, [0, BY + 0.004, -0.49]);                              // front sight base block (gas block)
  k.prism([[-0.474, BY + 0.012], [-0.503, BY + 0.012], [-0.507, -0.016], [-0.478, -0.016]], 0.009, P, [0, 0, 0], 'zy');   // A-frame
  for (const s of [-1, 1]) k.box(0.003, 0.016, 0.012, P, [s * 0.0075, -0.008, -0.5]);   // protective ears
  k.box(0.0018, 0.013, 0.0024, PD, [0, -0.0065, -0.5]);                                // the front sight post (tip on the LOS)
  k.box(0.012, 0.016, 0.025, P, [0, BY - 0.02, -0.49]);                              // bayonet lug
  k.cyl(0.0105, 0.0105, 0.055, P, [0, BY, -0.612], 'z', 10);                         // birdcage
  if (hi) for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 1.6 - Math.PI * 0.3; k.box(0.003, 0.0035, 0.04, 0x050505, [Math.cos(a) * 0.0104, BY + Math.sin(a) * 0.0104, -0.615], [0, 0, a]); }   // slots (closed bottom)
  // right side: ejection port frame, forward assist housing; left side: mag release fence, selector markings
  if (hi) {
    k.box(0.002, 0.024, 0.056, 0x0a0a0a, [0.0165, -0.062, -0.048]);                 // ejection port (dark)
    k.cyl(0.009, 0.01, 0.03, P, [0.024, -0.05, 0.065], 'z', 10, [0, 0.35, 0]);       // forward assist housing
    k.box(0.002, 0.012, 0.012, PD, [0.0158, -0.103, -0.03]);                         // magazine release button
    k.box(0.004, 0.02, 0.025, P, [-0.017, -0.098, -0.012]);                           // bolt catch housing
  }
  const body = k.mesh(KITMAT.steel(), 'body'); G.add(body);

  // ---- moving parts
  const parts = {};
  // rear sight flip aperture: short-range and 'L' leaves (selected one stands up)
  { const a = new THREE.Group(); a.name = 'aperture'; a.position.set(0, -0.006, 0.0); G.add(a);
    const apG = plate([...Array(16)].map((_, i) => [Math.cos(i / 16 * Math.PI * 2) * 0.0068, 0.006 + Math.sin(i / 16 * Math.PI * 2) * 0.0068]).concat([[0.0068, -0.004], [-0.0068, -0.004]]).sort(() => 0).slice(0, 16), [[0, 0.006, 0.0032]], 0.0015);   // a round leaf with the peep
    const m = new THREE.Mesh(apG, apertureMat()); m.name = 'peep'; a.add(m); parts.aperture = a; }
  { const kc = new Kit(); kc.box(0.012, 0.008, 0.06, P, [0, 0, 0.0]); kc.box(0.044, 0.008, 0.012, P, [0, 0, 0.032]); if (hi) kc.box(0.006, 0.008, 0.012, PD, [-0.026, 0, 0.032]);   // charging handle with latch
    parts.charging = part(kc, 'charging', G, [0, -0.041, 0.09]); }
  { const kb = new Kit(); kb.box(0.004, 0.02, 0.05, 0x3a3b3d, [0, 0, 0]); if (hi) kb.box(0.003, 0.006, 0.02, 0x8c8c86, [0.001, 0.004, -0.01]);   // bolt carrier face in the port
    parts.bolt = part(kb, 'bolt', G, [0.0145, -0.062, -0.048]); }
  { const kd = new Kit(); kd.box(0.002, 0.026, 0.058, P, [0, -0.013, 0]); parts.dustCover = part(kd, 'dustCover', G, [0.0175, -0.049, -0.048]); }
  { const kf = new Kit(); kf.cyl(0.006, 0.006, 0.014, PD, [0, 0, 0.0], 'z', 8); kf.cyl(0.0095, 0.0095, 0.004, P, [0, 0, 0.008], 'z', 10); parts.fa = part(kf, 'fa', G, [0.03, -0.05, 0.086]); parts.fa.rotation.y = 0.35; }
  { const ks = new Kit(); ks.box(0.003, 0.004, 0.022, PD, [0, 0, -0.008]); parts.selector = part(ks, 'selector', G, [-0.017, -0.106, 0.036]); }
  { const kt = new Kit(); kt.prism([[0, 0], [0.004, -0.004], [0.006, -0.018], [0.002, -0.02], [-0.002, -0.006]], 0.006, PD, [0, 0, 0], 'zy'); parts.trigger = part(kt, 'trigger', G, [0, -0.124, 0.005]); }
  { const kb = new Kit(); kb.box(0.003, 0.016, 0.01, P, [0, 0, 0]); parts.boltCatch = part(kb, 'boltCatch', G, [-0.019, -0.097, -0.012]); }
  // magazine: 20-round, straight aluminium box; pivot at the top of the body inside the magwell
  { const km = new Kit(); km.box(0.022, 0.15, 0.062, COL.alu, [0, -0.075, 0]); km.box(0.026, 0.012, 0.066, COL.parkDark, [0, -0.152, 0]);
    if (hi) { for (let i = 0; i < 4; i++) km.box(0.0225, 0.11, 0.003, 0x26282a, [0, -0.085, -0.022 + i * 0.015]); km.cyl(0.0028, 0.0028, 0.03, COL.brass, [0, 0.004, -0.008], 'z', 6); km.cyl(0.0012, 0.0028, 0.008, COL.copper, [0, 0.004, -0.027], 'z', 6); }
    parts.mag = part(km, 'mag', G, [0, -0.1, -0.066]); parts.mag.userData.home = parts.mag.position.clone(); }
  const anchors = {
    grip: [0, -0.168, 0.05], fore: [0, -0.07, -0.31], butt: [0, -0.105, 0.35], charging: [0, -0.04, 0.13], magwell: [0, -0.158, -0.066],
    magBottom: [0, -0.255, -0.07], boltCatch: [-0.021, -0.097, -0.012], fa: [0.036, -0.05, 0.1], ejection: [0.02, -0.062, -0.048], muzzle: [0, BY, -0.64],
    selector: [-0.02, -0.106, 0.036], frontSight: [0, 0, -0.5], cheek: [0, -0.03, 0.2],
  };
  const sight = { eyeRelief: 0.075, height: 0.066 };
  if (gl) addM203(G, parts, anchors, sight, hi);
  return finish(G, parts, anchors, sight, 'M16A1', gl ? 'M203' : null);
}
// M203 under the M16A1: ribbed handguard, 12 in barrel that slides forward to load, quadrant sight on the carry handle
function addM203(G, parts, anchors, sight, hi) {
  const k = new Kit(), BY = -0.066, TY = -0.122, P = COL.park, PD = COL.parkDark;
  k.cyl(0.03, 0.03, 0.25, COL.furniture, [0, BY - 0.006, -0.3], 'z', 10);           // M203 handguard round the rifle barrel
  if (hi) for (let i = 0; i < 11; i++) k.box(0.064, 0.004, 0.01, PD, [0, BY + 0.022, -0.19 - i * 0.021]);   // top ribs
  k.box(0.05, 0.05, 0.1, P, [0, TY + 0.008, -0.215]);                              // M203 receiver
  k.prism([[-0.165, -0.15], [-0.235, -0.15], [-0.235, -0.165], [-0.165, -0.165]], 0.01, PD, [0, 0, 0], 'zy');   // its trigger guard
  k.box(0.006, 0.014, 0.004, PD, [0, -0.152, -0.19]);                                // its trigger
  // quadrant sight bracket on the left of the carry handle
  k.box(0.006, 0.03, 0.05, P, [-0.019, -0.02, -0.07]);
  const qa = new Kit(); qa.prism([[0.0, 0.0], [-0.012, 0.012], [-0.03, 0.018], [-0.045, 0.012], [-0.05, 0.0]], 0.003, 0x2b2c2a, [0, 0, 0], 'zy');
  k.add(qa.geometry(), 0x2b2c2a, [-0.023, -0.026, -0.045]);                         // quadrant arc
  const body = k.mesh(KITMAT.steel(), 'm203body'); G.add(body);
  const kt = new Kit(); kt.cyl(0.026, 0.026, 0.24, P, [0, 0, -0.12], 'z', 14); kt.cyl(0.02, 0.02, 0.005, 0x050505, [0, 0, -0.241], 'z', 14);   // barrel tube, bore
  parts.glBarrel = part(kt, 'glBarrel', G, [0, TY, -0.2]);
  // the quadrant sight arm: pivot at the front of the bracket, rotates the line of sight down by the elevation
  const kq = new Kit(); kq.box(0.003, 0.004, 0.075, 0x1f201e, [0, 0, -0.03]); kq.box(0.003, 0.012, 0.003, 0x111111, [0, 0.006, -0.066]);   // arm + front post
  const qArm = part(kq, 'quadArm', G, [-0.03, -0.004, -0.02]);
  const peep = new THREE.Mesh(plate([[-0.006, -0.004], [0.006, -0.004], [0.006, 0.012], [-0.006, 0.012]], [[0, 0.006, 0.0022]], 0.0015), apertureMat()); peep.position.set(0, 0, 0.006); qArm.add(peep);
  parts.quadArm = qArm;
  Object.assign(anchors, { glFore: [0, -0.15, -0.25], glTrigger: [0, -0.165, -0.2], glBreech: [0, TY, -0.2], glMuzzle: [0, TY, -0.44], magGrip: [0, -0.21, -0.066] });
  sight.quad = { pivot: [-0.03, -0.004, -0.02], rear: [-0.03, 0.002, 0.006], front: [-0.03, 0.002, -0.066] };
}

// ------------------------------------------------------------------------------------------------ M60
// 43.5 in, 23 lb, open bolt, belt fed from the left, quick-change barrel with bipod and carrying handle, leaf sight.
export function buildM60(o = {}) {
  const hi = o.detail !== 'low';
  const G = new THREE.Group(); G.name = 'M60';
  const k = new Kit(), BY = -0.075, P = COL.park, PD = COL.parkDark, F = COL.furniture;
  k.box(0.064, 0.09, 0.22, P, [0, -0.08, 0.06]);                                     // receiver
  k.box(0.05, 0.02, 0.05, PD, [0, -0.03, -0.015]);                                   // rear sight base (ahead of the cover)
  k.prism([[0.17, -0.05], [0.44, -0.058], [0.448, -0.065], [0.448, -0.2], [0.44, -0.205], [0.2, -0.135], [0.17, -0.13]], 0.05, F, [0, 0, 0], 'zy');   // buttstock
  k.box(0.054, 0.15, 0.016, PD, [0, -0.13, 0.455]);                                  // butt plate
  if (hi) k.box(0.052, 0.012, 0.09, F, [0, -0.205, 0.39], [0.08, 0, 0]);            // shoulder rest (folded)
  k.prism([[0.04, -0.125], [0.085, -0.125], [0.115, -0.245], [0.1, -0.255], [0.075, -0.25], [0.05, -0.135]], 0.03, F, [0, 0, 0], 'zy');   // pistol grip
  k.prism([[0.09, -0.125], [-0.02, -0.125], [-0.03, -0.16], [0.09, -0.165], [0.09, -0.155], [-0.012, -0.152], [-0.012, -0.134], [0.09, -0.133]], 0.014, PD, [0, 0, 0], 'zy');   // trigger guard
  k.box(0.008, 0.016, 0.006, PD, [0, -0.135, 0.035]);                                // trigger
  k.box(0.012, 0.03, 0.06, P, [-0.038, -0.07, 0.0]);                                // feed tray guide (belt in from the left)
  k.box(0.012, 0.03, 0.05, P, [0.037, -0.072, 0.05]);                               // ejection side (right)
  k.box(0.012, 0.012, 0.16, PD, [0.038, -0.095, 0.08]);                             // cocking handle slot
  const body = k.mesh(KITMAT.steel(), 'body'); G.add(body);
  const parts = {};
  // feed cover: hinged at the FRONT, the rear lifts
  { const kc = new Kit(); kc.box(0.06, 0.018, 0.16, P, [0, 0.0, 0.08]); if (hi) { kc.box(0.022, 0.012, 0.03, PD, [0, 0.012, 0.15]); for (let i = 0; i < 3; i++) kc.box(0.062, 0.003, 0.004, PD, [0, 0.009, 0.03 + i * 0.04]); }
    parts.cover = part(kc, 'cover', G, [0, -0.035, 0.0]); }
  // rear sight leaf (folds down = battle sight)
  { const kl = new Kit(); for (const sx of [-1, 1]) kl.box(0.003, 0.034, 0.003, PD, [sx * 0.0075, 0.017, 0]); kl.box(0.018, 0.003, 0.003, PD, [0, 0.0335, 0]); const leaf = part(kl, 'leaf', G, [0, -0.02, -0.01]);   // a frame; the slide carries the peep
    const peep = new THREE.Mesh(plate([[-0.007, -0.004], [0.007, -0.004], [0.007, 0.008], [-0.007, 0.008]], [[0, 0.002, 0.0022]], 0.0015), apertureMat()); peep.name = 'slide'; peep.position.set(0, 0.018, 0); leaf.add(peep); parts.leaf = leaf; }
  { const kh = new Kit(); kh.box(0.012, 0.012, 0.03, P, [0, 0, 0]); kh.box(0.03, 0.01, 0.012, P, [0.012, 0, 0.0]); parts.cocking = part(kh, 'cocking', G, [0.045, -0.095, 0.02]); }
  // the barrel group: barrel, gas cylinder, bipod, carrying handle, front sight, flash hider (comes off in a change)
  { const kb = new Kit(); kb.cyl(0.03, 0.03, 0.05, P, [0, 0, -0.065], 'z', 12);
    kb.cyl(0.0125, 0.0125, 0.52, PD, [0, 0, -0.34], 'z', 10); kb.cyl(0.014, 0.012, 0.06, P, [0, 0, -0.63], 'z', 10);
    kb.cyl(0.012, 0.012, 0.22, P, [0, -0.03, -0.36], 'z', 8); kb.box(0.02, 0.03, 0.03, P, [0, -0.015, -0.47]);   // gas cylinder, gas port block
    kb.box(0.004, 0.072, 0.012, PD, [0, 0.037, -0.55]); kb.box(0.02, 0.02, 0.02, P, [0, 0.0, -0.55]);           // front sight blade (tip on the LOS)
    if (hi) kb.box(0.014, 0.006, 0.006, P, [-0.03, 0.02, -0.055]);                                              // barrel latch
    const barrel = part(kb, 'barrel', G, [0, BY, 0]);
    // heat glow overlay (emissive, fades in above ~400 C)
    const gm = new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.0132, 0.0132, 0.44, 10).rotateX(Math.PI / 2), gm); glow.position.set(0, 0, -0.31); glow.name = 'glow'; barrel.add(glow);
    parts.barrel = barrel; parts.glow = glow;
    // carrying handle (folded up)
    const kh = new Kit(); kh.box(0.008, 0.06, 0.012, P, [0, 0.03, 0]); kh.box(0.008, 0.012, 0.11, F, [0, 0.06, 0.045]);
    parts.handle = part(kh, 'handle', barrel, [0.018, 0.012, -0.2]);
    // bipod: pivot under the gas cylinder; legs fold back along the barrel
    const bp = new THREE.Group(); bp.name = 'bipod'; bp.position.set(0, -0.045, -0.48); barrel.add(bp);
    for (const s of [-1, 1]) { const kl = new Kit(); kl.cyl(0.006, 0.006, 0.31, P, [0, -0.155, 0], 'y', 6); kl.box(0.03, 0.006, 0.02, PD, [0, -0.31, 0]); const leg = part(kl, 'leg' + (s < 0 ? 'L' : 'R'), bp, [s * 0.012, 0, 0]); leg.userData.side = s; }
    parts.bipod = bp; }
  // the belt: a short hanging length of linked cartridges (4 ball : 1 tracer, red tips)
  { const belt = new THREE.Group(); belt.name = 'belt'; belt.position.set(-0.045, -0.065, 0.0); G.add(belt);
    const N = hi ? 12 : 5, links = [];
    for (let i = 0; i < N; i++) { const kr = new Kit(); kr.cyl(0.006, 0.006, 0.05, COL.brass, [0, 0, 0], 'x', 6); kr.cyl(0.002, 0.0045, 0.02, i % 5 === 4 ? 0xb02a18 : COL.copper, [0.035, 0, 0], 'x', 6); kr.box(0.054, 0.004, 0.014, 0x2a2a28, [0.0, 0.006, 0]);
      const l = part(kr, 'round' + i, i ? links[i - 1] : belt, i ? [0, -0.013, 0.004] : [0, 0, 0], KITMAT.lambert()); l.rotation.x = 0.05; links.push(l); }
    belt.rotation.y = Math.PI / 2; parts.belt = belt; parts.links = links; }
  const anchors = { grip: [0, -0.185, 0.085], fore: [0, -0.135, -0.36], stockTop: [0, -0.045, 0.33], butt: [0, -0.13, 0.455], cover: [0, -0.02, 0.15], charging: [0.06, -0.095, 0.04],
    barrelLatch: [-0.035, -0.06, -0.055], handle: [0.018, -0.0, -0.17], beltEntry: [-0.045, -0.07, 0.0], muzzle: [0, BY, -0.66], ejection: [0.04, -0.075, 0.05], cheek: [0, -0.04, 0.25] };
  return finish(G, parts, anchors, { eyeRelief: 0.09, height: 0.075 }, 'M60');
}

// ------------------------------------------------------------------------------------------------ M72A2 LAW
// telescoping tube: 24.8 in closed, 35 in extended; pop-up sights (rear peep, front reticle with range lines)
export function buildM72(o = {}) {
  const hi = o.detail !== 'low';
  const G = new THREE.Group(); G.name = 'M72A2';
  const BY = -0.07, R = 0.039, parts = {};
  const outer = new Kit(); outer.cyl(R, R, 0.655, COL.od, [0, 0, -0.06], 'z', 14);
  outer.cyl(R + 0.0015, R + 0.0015, 0.03, COL.yellow, [0, 0, -0.33], 'z', 14);       // yellow band
  outer.box(0.016, 0.014, 0.05, COL.odDark, [0, R + 0.004, -0.08]);                  // trigger housing (rubber boot)
  outer.box(0.02, 0.008, 0.03, COL.odDark, [0, R + 0.003, 0.02]);                    // rear sight housing
  if (hi) { outer.box(0.018, 0.006, 0.12, COL.odDark, [0, R + 0.002, -0.2]); outer.box(0.004, 0.06, 0.5, COL.webbing, [R + 0.002, -0.01, -0.06]); }   // stencil strip, sling
  const tube = part(outer, 'outer', G, [0, BY, 0], KITMAT.lambert());
  const inner = new Kit(); inner.cyl(R - 0.004, R - 0.004, 0.25, 0x3f4229, [0, 0, 0.0], 'z', 14); inner.cyl(R - 0.002, R - 0.002, 0.02, COL.black, [0, 0, 0.12], 'z', 14);
  parts.inner = part(inner, 'inner', tube, [0, 0, 0.14], KITMAT.lambert());          // slides back by 0.238 when extended
  const caps = new Kit(); caps.cyl(R + 0.002, R + 0.002, 0.012, COL.black, [0, 0, 0], 'z', 14); parts.frontCap = part(caps, 'frontCap', tube, [0, 0, -0.39], KITMAT.lambert());
  const caps2 = new Kit(); caps2.cyl(R + 0.002, R + 0.002, 0.012, COL.black, [0, 0, 0], 'z', 14); parts.rearCap = part(caps2, 'rearCap', parts.inner, [0, 0, 0.131], KITMAT.lambert());
  const kt = new Kit(); kt.box(0.012, 0.01, 0.03, COL.rubber, [0, 0, 0]); parts.triggerBar = part(kt, 'triggerBar', tube, [0, R + 0.012, -0.08]);
  const ka = new Kit(); ka.box(0.01, 0.008, 0.02, COL.black, [0, 0, 0]); parts.armHandle = part(ka, 'armHandle', tube, [0.012, R + 0.01, -0.03]);
  // rear sight: a peep on a spring leaf (pops up when extended)
  { const rs = new THREE.Group(); rs.name = 'rearSight'; rs.position.set(0, R + 0.004, 0.0); tube.add(rs);
    const hy = -BY - R - 0.004;   // the peep sits on the line of sight
    const pe = new THREE.Mesh(plate([[-0.006, 0], [0.006, 0], [0.006, hy], ...[...Array(7)].map((_, i) => [Math.cos((i + 1) / 8 * Math.PI) * 0.006, hy + Math.sin((i + 1) / 8 * Math.PI) * 0.006]), [-0.006, hy]], [[0, hy, 0.0026]], 0.0015), apertureMat()); rs.add(pe); parts.rearSight = rs; }
  // front sight: frame with the reticle (cross + range lines), folds up
  { const fs = new THREE.Group(); fs.name = 'frontSight'; fs.position.set(0, R + 0.002, -0.34); tube.add(fs);
    const kf = new Kit(); const H = 0.07 - R - 0.002;   // height of the line of sight over the hinge
    kf.box(0.003, H + 0.03, 0.003, COL.odDark, [-0.022, (H + 0.03) / 2, 0]); kf.box(0.003, H + 0.03, 0.003, COL.odDark, [0.022, (H + 0.03) / 2, 0]); kf.box(0.047, 0.003, 0.003, COL.odDark, [0, H + 0.03, 0]); kf.box(0.047, 0.003, 0.003, COL.odDark, [0, 0.003, 0]);
    fs.add(kf.mesh(KITMAT.lambert(), 'frame'));
    const ret = new THREE.Group(); ret.name = 'reticle'; ret.position.set(0, H, 0); fs.add(ret); parts.reticle = ret;
    parts.frontSight = fs; }
  const anchors = { grip: [0.028, BY, -0.19], fore: [-0.028, BY - 0.01, -0.32], shoulder: [0, BY, 0.15], butt: [0, BY, 0.27], rearCap: [0, BY, 0.27], muzzle: [0, BY, -0.39], cheek: [0, -0.02, 0.08] };
  return finish(G, parts, anchors, { eyeRelief: 0.06, height: 0.07 }, 'M72A2');
}
// draw the LAW reticle range lines (lines: [[range m, angle rad]...]), distance from the eye to the reticle plane d
export function setLawReticle(model, lines, d = 0.40) {
  const ret = model.parts.reticle; if (!ret || ret.userData.done) return; ret.userData.done = true;
  const k = new Kit();
  k.box(0.03, 0.0008, 0.0008, 0x0a0a0a, [0, 0, 0]); k.box(0.0008, 0.012, 0.0008, 0x0a0a0a, [0, 0.0, 0]);   // centre cross
  for (const [r, a] of lines) { const y = -Math.tan(a) * d, big = r % 100 === 0; k.box(big ? 0.016 : 0.008, 0.0007, 0.0007, 0x0a0a0a, [0, y, 0]); if (big) for (const s of [-1, 1]) k.box(0.0007, 0.003, 0.0007, 0x0a0a0a, [s * 0.008, y - 0.0015, 0]); }
  ret.add(k.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }), 'lines'));
}

// ------------------------------------------------------------------------------------------------ M1911A1
export function buildM1911(o = {}) {
  const hi = o.detail !== 'low';
  const G = new THREE.Group(); G.name = 'M1911A1';
  const k = new Kit(), P = COL.park, PD = COL.parkDark;
  k.prism([[0.022, -0.032], [-0.152, -0.032], [-0.152, -0.044], [-0.07, -0.046], [-0.06, -0.05], [0.0, -0.05], [0.022, -0.045]], 0.022, P, [0, 0, 0], 'zy');   // frame (dust cover, rails)
  k.prism([[-0.012, -0.046], [-0.065, -0.046], [-0.07, -0.062], [-0.06, -0.075], [-0.012, -0.075], [-0.012, -0.068], [-0.055, -0.068], [-0.058, -0.06], [-0.012, -0.056]], 0.012, P, [0, 0, 0], 'zy');   // trigger guard
  k.prism([[0.024, -0.042], [-0.008, -0.048], [0.012, -0.16], [0.047, -0.162], [0.05, -0.05], [0.034, -0.035]], 0.027, P, [0, 0, 0], 'zy');   // grip frame (mainspring housing)
  k.prism([[0.022, -0.05], [-0.004, -0.054], [0.014, -0.15], [0.042, -0.152], [0.044, -0.06]], 0.031, 0x3b2a1e, [0, 0, 0], 'zy');   // brown plastic grips
  if (hi) for (let i = 0; i < 6; i++) k.box(0.0315, 0.002, 0.03, 0x2b1d14, [0, -0.065 - i * 0.015, 0.02 + i * 0.003]);
  k.box(0.006, 0.01, 0.01, PD, [-0.012, -0.036, 0.008]);                              // thumb safety
  k.box(0.004, 0.01, 0.02, PD, [-0.0125, -0.04, -0.04]);                              // slide stop
  k.prism([[0.024, -0.04], [0.04, -0.035], [0.045, -0.044], [0.03, -0.05]], 0.02, P, [0, 0, 0], 'zy');   // grip safety tang
  k.box(0.024, 0.008, 0.042, PD, [0, -0.163, 0.03]);                                  // magazine floor plate
  const body = k.mesh(KITMAT.steel(), 'body'); G.add(body);
  const parts = {};
  { const ks = new Kit(); ks.box(0.022, 0.028, 0.196, P, [0, -0.018, -0.087]); ks.box(0.004, 0.005, 0.004, PD, [0, -0.0025, -0.172]);   // slide, front sight blade
    for (const s of [-1, 1]) ks.box(0.006, 0.005, 0.006, PD, [s * 0.006, -0.0025, 0.003]);                                                // rear sight (notch)
    ks.box(0.012, 0.012, 0.03, 0x060606, [0.011, -0.012, -0.045]);                                                                          // ejection port
    if (hi) for (let i = 0; i < 7; i++) ks.box(0.0225, 0.02, 0.0015, PD, [0, -0.02, -0.0 + 0.003 - i * 0.0035 + 0.0]);                  // rear serrations
    ks.cyl(0.009, 0.009, 0.01, P, [0, -0.02, -0.19], 'z', 10); ks.cyl(0.0057, 0.0057, 0.012, 0x050505, [0, -0.02, -0.19], 'z', 10);        // barrel bushing, bore
    parts.slide = part(ks, 'slide', G, [0, 0, 0]); }
  { const kh = new Kit(); kh.box(0.008, 0.012, 0.01, PD, [0, 0.0, 0.006]); parts.hammer = part(kh, 'hammer', G, [0, -0.026, 0.022]); }
  { const km = new Kit(); km.box(0.021, 0.11, 0.032, 0x3a3b3c, [0, -0.055, 0]); parts.mag = part(km, 'mag', G, [0, -0.05, 0.028]); parts.mag.rotation.x = -0.3; parts.mag.userData.home = parts.mag.position.clone(); }
  { const kt = new Kit(); kt.box(0.008, 0.012, 0.004, PD, [0, 0, 0]); parts.trigger = part(kt, 'trigger', G, [0, -0.056, -0.04]); }
  const anchors = { grip: [0, -0.1, 0.03], fore: [-0.012, -0.11, 0.028], magwell: [0, -0.16, 0.045], slideRear: [0, -0.02, 0.0], muzzle: [0, -0.02, -0.195], ejection: [0.014, -0.012, -0.045], slideStop: [-0.014, -0.04, -0.04] };
  return finish(G, parts, anchors, { eyeRelief: 0.55, height: 0.018 }, 'M1911A1');
}

// ------------------------------------------------------------------------------------------------ state -> parts
function finish(G, parts, anchors, sight, key, sub) {
  const M = { group: G, parts, anchors, sight, key, sub };
  // st: { charge 0..1 (handle back), bolt 0..1 (carrier back), locked, mag: 'in' | 'out' | ..., magOffset [x,y,z],
  //       fa 0..1, selector (index), trigger 0..1, aperture 0|1, dustCover open, glOpen 0..1, quad (elev rad),
  //       cover 0..1 (M60), leaf 0..1 + leafSlide (m), bipod 0..1, handle 0..1, heat (C), barrelOff [x,y,z]|null,
  //       law: 0 closed .. 1 extended, lawSights 0..1, slide 0..1 (M1911), hammer 0..1, beltRounds n, time }
  M.setState = function (st) {
    const p = parts;
    if (p.charging) p.charging.position.z = 0.09 + 0.07 * (st.charge || 0);
    if (p.bolt) { p.bolt.position.z = -0.048 + 0.07 * Math.max(st.bolt || 0, st.charge || 0); p.bolt.visible = (st.bolt || 0) > 0.05 || (st.charge || 0) > 0.05 || st.dustCover; }
    if (p.dustCover) p.dustCover.rotation.z = st.dustCover ? -1.9 : 0;
    if (p.fa) p.fa.position.z = 0.086 - 0.008 * (st.fa || 0);
    if (p.selector) p.selector.rotation.x = -[0, 1.57, 3.14][st.selector || 0] * 0.5;
    if (p.trigger) p.trigger.rotation.x = -0.25 * (st.trigger || 0);
    if (p.boltCatch) p.boltCatch.position.y = -0.097 + (st.locked ? 0.004 : 0);
    if (p.aperture) p.aperture.rotation.x = st.aperture ? 0.0 : 0.0;   // (both leaves look alike from the eye)
    if (p.mag) { const h = p.mag.userData.home; p.mag.visible = st.mag !== 'none'; if (st.magOffset) p.mag.position.set(h.x + st.magOffset[0], h.y + st.magOffset[1], h.z + st.magOffset[2]); else p.mag.position.copy(h); }
    if (p.glBarrel) p.glBarrel.position.z = -0.2 - 0.1 * (st.glOpen || 0);
    if (p.quadArm) { p.quadArm.rotation.x = -(st.quad || 0); p.quadArm.visible = st.quadUp !== false; }
    if (p.cover) p.cover.rotation.x = -1.2 * (st.cover || 0);
    if (p.leaf) { p.leaf.rotation.x = -1.4 * (1 - (st.leaf ?? 0)); const s = p.leaf.getObjectByName('slide'); if (s) s.position.y = 0.018 + 0 * (st.leafSlide || 0); }   // the peep stays on the drawn line of sight (the sim raises the bore)
    if (p.cocking) p.cocking.position.z = 0.02 + 0.09 * (st.charge || 0);
    if (p.bipod) { const a = st.bipod || 0; for (const l of p.bipod.children) { l.rotation.x = -1.45 * (1 - a) + 0.12 * a; l.rotation.z = l.userData.side * 0.25 * a; } }
    if (p.handle) p.handle.rotation.z = -1.5 * (1 - (st.handle ?? 1));
    if (p.glow) { const h = st.heat || 20; p.glow.material.opacity = Math.max(0, Math.min(0.7, (h - 420) / 350)); p.glow.material.color.setHSL(0.0 + Math.max(0, (h - 600) / 3000), 0.95, 0.22 + Math.max(0, (h - 550) / 1200)); }   // dull red from ~450 C, brighter past 600
    if (p.barrel) { if (st.barrelOff) { p.barrel.position.set(st.barrelOff[0], -0.075 + st.barrelOff[1], st.barrelOff[2]); p.barrel.visible = st.barrelVisible !== false; } else { p.barrel.position.set(0, -0.075, 0); p.barrel.visible = true; } }
    if (p.belt) { const n = Math.max(0, Math.min(p.links.length, st.beltRounds ?? p.links.length)); p.links.forEach((l, i) => { l.visible = i < n; l.rotation.x = 0.06 + 0.05 * Math.sin((st.time || 0) * 3 + i * 0.7) * (st.beltSwing || 0.3); }); p.belt.visible = n > 0; }
    if (p.inner) { const e = st.law || 0; p.inner.position.z = 0.14 + 0.238 * e; }
    if (p.frontCap) p.frontCap.visible = (st.law || 0) < 0.05;
    if (p.rearCap) p.rearCap.visible = (st.law || 0) < 0.05;
    if (p.rearSight) p.rearSight.rotation.x = -1.5 * (1 - (st.lawSights || 0));
    if (p.frontSight) p.frontSight.rotation.x = 1.5 * (1 - (st.lawSights || 0));
    if (p.armHandle) p.armHandle.position.z = -0.03 - 0.02 * (st.armed ? 1 : 0);
    if (p.slide) p.slide.position.z = 0.055 * (st.slide || 0);
    if (p.hammer) p.hammer.rotation.x = 0.9 * (st.hammer ?? 1);
  };
  M.anchor = (name, out = new THREE.Vector3()) => { const a = anchors[name]; return a ? out.set(a[0], a[1], a[2]) : out.set(0, 0, 0); };
  M.setState({});
  return M;
}
export function buildWeaponModel(key, o = {}) {
  if (key === 'M16A1' || key === 'M16A1/M203') return buildM16({ ...o, m203: key === 'M16A1/M203' || o.m203 });
  if (key === 'M60') return buildM60(o);
  if (key === 'M72A2') return buildM72(o);
  if (key === 'M1911A1') return buildM1911(o);
  throw new Error('no model for ' + key);
}
// loose items: a dropped / held magazine, a 40 mm round, a spare barrel, a spent case
export function buildItemModel(fit) {
  const k = new Kit();
  if (fit === 'M16-20') { k.box(0.022, 0.15, 0.062, COL.alu, [0, -0.075, 0]); k.box(0.026, 0.012, 0.066, COL.parkDark, [0, -0.152, 0]); }
  else if (fit === 'M1911-7') k.box(0.021, 0.11, 0.032, 0x3a3b3c, [0, -0.055, 0]);
  else if (fit === '40mm') { k.cyl(0.02, 0.02, 0.05, 0x7a7d76, [0, 0, 0], 'z', 10); k.cyl(0.02, 0.012, 0.05, 0x5a5f3a, [0, 0, -0.05], 'z', 10); k.cyl(0.02, 0.02, 0.006, COL.yellow, [0, 0, -0.03], 'z', 10); }
  else if (fit === 'M60-belt') { for (let i = 0; i < 6; i++) k.cyl(0.006, 0.006, 0.07, COL.brass, [0, 0, i * 0.013], 'x', 6); }
  else if (fit === 'M60-barrel') { k.cyl(0.0125, 0.0125, 0.56, COL.parkDark, [0, 0, 0], 'z', 8); }
  else if (fit === 'case556') k.cyl(0.0048, 0.0048, 0.045, COL.brass, [0, 0, 0], 'z', 6);
  else if (fit === 'case762') k.cyl(0.006, 0.006, 0.051, COL.brass, [0, 0, 0], 'z', 6);
  else if (fit === 'case45') k.cyl(0.006, 0.006, 0.023, COL.brass, [0, 0, 0], 'z', 6);
  else if (fit === 'case40') k.cyl(0.02, 0.02, 0.05, 0x7a7d76, [0, 0, 0], 'z', 8);
  else if (fit === 'tube' || fit === 'M72A2') k.cyl(0.039, 0.039, 0.89, COL.od, [0, 0, 0], 'z', 10);
  else k.box(0.03, 0.03, 0.03, 0x777777, [0, 0, 0]);
  return k.mesh(KITMAT.lambert(), 'item_' + fit);
}
