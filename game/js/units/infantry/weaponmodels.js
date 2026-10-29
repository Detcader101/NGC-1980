// NGC-1980 infantry: weapon models (M16A1, M16A1 + M203, M60, M72A2 LAW, M1911A1) at real dimensions, house style.
// Shared by the first-person viewmodel (detail = 'high') and the third-person soldier (detail = 'low').
//
// WEAPON FRAME: origin at the rear sight (the point the eye looks through), line of sight along -z, +y up, +x right.
// The bore is `sightHeight` below the line of sight. Every model returns
//   { group, parts: { name: Object3D } (moving parts), anchors: { name: [x, y, z] } (where hands / items go),
//     sight: { eyeRelief, ... }, setState(st) (drive the moving parts) }
// Moving parts are separate meshes (one draw call each); the static body is one mesh.
import * as THREE from 'three';
import { Kit, KITMAT, COL, FIG, creaseNormals, roundPoly, weldNormals, figMat } from './meshkit.js';

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

// ------------------------------------------------------------------------------------------------ RENDERKIT figures
// an extrusion of a front section (x, y) along -z from z0 to z1, scaled by taper (1 at z0 -> taper at z1), crease-smoothed
function sectionBar(outline, z0, z1, taper = 1, cy = 0) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(p => new THREE.Vector2(p[0], p[1]))), { depth: Math.abs(z1 - z0), bevelEnabled: false, curveSegments: 4 });
  const p = g.attributes.position, L = Math.abs(z1 - z0);
  for (let i = 0; i < p.count; i++) { const t = p.getZ(i) / L, s = 1 + (taper - 1) * t; p.setXYZ(i, p.getX(i) * s, cy + p.getY(i) * s, z0 - p.getZ(i)); }
  return creaseNormals(g, 0.82);
}
// The M16A1 for RENDERKIT figures: the same dimensions and anchors as the classic one, but bevelled receivers, the
// rounded triangular handguards with their vent slots, the A1 birdcage open all round, the teardrop forward assist,
// smooth round barrel / delta ring / buffer; anodized-aluminium + parkerized steel in one mesh, the black plastic
// furniture (stock, grip, handguards) in another (dull sheen vs metal).
function m16Fig(G, hi, gl, BY) {
  const k = new Kit(), kf = new Kit(), P = 0x3c3f43, PD = 0x26282b, PE = 0x33363a, F = 0x232426, FD = 0x151617, HOLE = 0x070708;
  const seg = hi ? 16 : 8, bv = hi ? 0.0022 : 0;
  // upper receiver: side profile, bevelled; the flat top under the handle; the ejection port boss on the right
  k.prism([[0.095, -0.036], [0.095, -0.09], [-0.13, -0.09], [-0.165, -0.084], [-0.165, -0.04], [-0.12, -0.036]], 0.032, P, [0, 0, 0], 'zy', [0, 0, 0], bv);
  // carry handle: the loop, bevelled; the rear sight housing with its ears; the windage drum
  k.prism([[0.05, -0.036], [0.05, -0.013], [0.02, -0.011], [-0.17, -0.011], [-0.17, -0.036], [-0.13, -0.036], [-0.13, -0.022], [0.02, -0.022], [0.02, -0.036]], 0.016, P, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0018 : 0);
  if (hi) k.prism([[0.044, -0.022], [0.044, -0.013], [-0.13, -0.013], [-0.13, -0.022]], 0.0185, PD, [0, 0, 0], 'zy', [0, 0, 0], 0.001);   // the handle's top rail (slightly wider: the sight groove)
  k.rbox(0.03, 0.022, 0.04, 0.003, P, [0, -0.024, 0.022], [0, 0, 0], hi ? 2 : 1);
  for (const sx of [-1, 1]) k.prism([[0.022, -0.014], [0.022, 0.0], [0.012, 0.004], [-0.006, 0.004], [-0.012, -0.002], [-0.012, -0.014]], 0.0035, P, [sx * 0.0125, 0, 0], 'zy', [0, 0, 0], hi ? 0.0008 : 0);
  if (hi) { k.cyl(0.0055, 0.0055, 0.006, PD, [0.018, -0.027, 0.03], 'x', 14); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.box(0.0062, 0.0012, 0.0012, PE, [0.018, -0.027 + Math.sin(a) * 0.0056, 0.03 + Math.cos(a) * 0.0056], [a, 0, 0]); } }   // knurled windage drum
  // lower receiver, flared magwell, takedown / pivot pins, bolt catch boss, trigger guard (a round bar), pistol grip
  k.prism([[0.0945, -0.09], [0.0945, -0.126], [0.03, -0.126], [-0.02, -0.124], [-0.11, -0.124], [-0.11, -0.09]], 0.03, PE, [0, 0, 0], 'zy', [0, 0, 0], bv);
  k.prism([[-0.022, -0.092], [-0.11, -0.092], [-0.114, -0.158], [-0.019, -0.158]], 0.035, PE, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0026 : 0);
  if (hi) {
    for (const z of [0.082, -0.1]) for (const sx of [-1, 1]) k.cyl(0.0034, 0.0034, 0.002, PD, [sx * 0.0155, -0.095, z], 'x', 10);   // pins
    k.capsule([0, -0.152, 0.04], [0, -0.153, -0.016], 0.0036, 0.0036, PD, 8);                           // trigger guard bar
    k.capsule([0, -0.153, -0.016], [0, -0.13, -0.022], 0.0036, 0.0036, PD, 8);
  } else k.prism([[0.04, -0.125], [0.012, -0.125], [-0.02, -0.126], [-0.022, -0.152], [0.04, -0.152], [0.04, -0.145], [-0.012, -0.146], [-0.012, -0.132], [0.04, -0.131]], 0.012, PD, [0, 0, 0], 'zy');
  kf.prism([[0.012, -0.124], [0.045, -0.124], [0.083, -0.214], [0.072, -0.226], [0.046, -0.222], [0.02, -0.132]], 0.028, F, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.005 : 0);
  if (hi) for (let i = 0; i < 6; i++) kf.box(0.0285, 0.0016, 0.0016, FD, [0, -0.15 - i * 0.012, 0.044 + i * 0.006], [0.42, 0, 0]);   // grip checkering lines (back strap)
  // buttstock: bevelled, the buttplate rounded with its trap door and the sling swivel
  kf.prism([[0.095, -0.044], [0.335, -0.041], [0.345, -0.043], [0.345, -0.172], [0.335, -0.174], [0.12, -0.124], [0.095, -0.12]], 0.04, F, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.008 : 0);
  kf.rbox(0.044, 0.135, 0.014, hi ? 0.005 : 0.002, FD, [0, -0.107, 0.35], [0, 0, 0], hi ? 2 : 1);
  if (hi) { kf.rbox(0.03, 0.04, 0.004, 0.0015, F, [0, -0.08, 0.358]); k.capsule([-0.024, -0.168, 0.322], [0.024, -0.168, 0.322], 0.0035, 0.0035, P, 8); k.box(0.01, 0.012, 0.012, P, [0, -0.162, 0.322]); }
  // barrel: delta ring + slip ring, the A1 pencil barrel, the gas block / front sight base, bayonet lug, birdcage
  k.lathe([[0.001, 0.0], [0.031, 0.0], [0.031, 0.004], [0.026, 0.006], [0.026, 0.012], [0.001, 0.012]], P, [0, BY, -0.178], 'z', seg);   // delta ring (a lathe: profile y -> +z)
  k.cyl(0.0075, 0.0075, 0.43, P, [0, BY, -0.38], 'z', hi ? 12 : 8);
  if (!gl) {
    // handguards: rounded triangle, point down, tapering forward; a seam on top and below; six vent slots each side
    const tri = roundPoly([[-0.03, 0.021, 0.009], [0.03, 0.021, 0.009], [0.0, -0.035, 0.012]], hi ? 4 : 2);
    kf.add(sectionBar(tri, -0.172, -0.412, 0.86, BY - 0.002), F);
    if (hi) {
      kf.box(0.0016, 0.004, 0.236, FD, [0, BY + 0.019, -0.292]);
      for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const z = -0.2 - i * 0.034, t = (z + 0.172) / -0.24, sc = 1 - 0.14 * t;
        kf.rbox(0.004, 0.009, 0.02, 0.002, HOLE, [sx * 0.0215 * sc, BY - 0.002 + 0.008 * sc, z], [0, 0, sx * -0.95], 1); }
    }
    k.lathe([[0.001, 0.0], [0.012, 0.0], [0.024, 0.004], [0.024, 0.008], [0.0225, 0.012], [0.001, 0.012]], P, [0, BY - 0.002, -0.424], 'z', seg);   // handguard cap
  }
  k.rbox(0.022, 0.024, 0.04, 0.003, P, [0, BY + 0.004, -0.49], [0, 0, 0], hi ? 2 : 1);                                    // gas block
  k.prism([[-0.474, BY + 0.012], [-0.503, BY + 0.012], [-0.507, -0.016], [-0.478, -0.016]], 0.009, P, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0012 : 0);   // the A-frame
  for (const s of [-1, 1]) k.rbox(0.003, 0.016, 0.012, 0.001, P, [s * 0.0075, -0.008, -0.5], [0, 0, 0], 1);             // protective ears
  k.box(0.0018, 0.013, 0.0024, PD, [0, -0.0065, -0.5]);                                                                  // the front sight post (tip on the LOS)
  k.rbox(0.012, 0.016, 0.025, 0.002, P, [0, BY - 0.02, -0.49], [0, 0, 0], 1);                                             // bayonet lug
  if (hi) { k.capsule([-0.012, BY - 0.022, -0.478], [0.012, BY - 0.022, -0.478], 0.0028, 0.0028, P, 8); }                  // front sling swivel
  // the A1 birdcage: open all round (six prongs), a ring at the muzzle
  k.lathe([[0.001, 0.0], [0.0108, 0.0], [0.0108, 0.006], [0.0098, 0.008], [0.0098, 0.049], [0.0108, 0.051], [0.0108, 0.055], [0.006, 0.055], [0.006, 0.0]], P, [0, BY, -0.6395], 'z', seg);
  if (hi) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; k.box(0.0032, 0.0036, 0.034, HOLE, [Math.cos(a) * 0.0097, BY + Math.sin(a) * 0.0097, -0.613], [0, 0, a]); }
  // right side: ejection port, the teardrop forward assist, mag release; left: the bolt catch housing
  if (hi) {
    k.box(0.0018, 0.024, 0.056, 0x0a0a0a, [0.0164, -0.062, -0.048]);                                                     // ejection port (dark)
    k.lathe([[0.0105, 0], [0.0108, 0.006], [0.0098, 0.022], [0.0075, 0.03], [0.001, 0.031]], P, [0.022, -0.05, 0.05], 'z', 14);   // forward assist housing (teardrop)
    k.rbox(0.004, 0.012, 0.012, 0.0015, PD, [0.0162, -0.103, -0.03]);                                                     // magazine release button
    k.rbox(0.005, 0.02, 0.025, 0.002, P, [-0.0168, -0.098, -0.012], [0, 0, 0], 1);                                         // bolt catch housing
    k.cyl(0.0042, 0.0042, 0.003, PD, [-0.016, -0.106, 0.036], 'x', 10);                                                    // selector hub
  }
  const body = k.mesh(KITMAT.steel(), 'body'); G.add(body);
  const furn = kf.mesh(KITMAT.plastic(), 'furniture'); G.add(furn);
}
// the 20-round magazine (FIG): a straight aluminium box, rounded edges, two pressed ribs each side, the floorplate,
// the top rounds in the feed lips. Pivot at the top of the body inside the magwell.
function m16MagFig(km, hi) {
  km.rbox(0.022, 0.15, 0.062, 0.003, COL.alu, [0, -0.075, 0], [0, 0, 0], hi ? 2 : 1);
  km.rbox(0.0262, 0.012, 0.066, 0.0035, 0x2a2c2f, [0, -0.152, 0], [0, 0, 0], hi ? 2 : 1);
  if (hi) {
    for (const sx of [-1, 1]) for (const z of [-0.016, 0.014]) km.rbox(0.0028, 0.112, 0.008, 0.0013, 0x41444a, [sx * 0.0108, -0.082, z], [0, 0, 0], 1);
    km.cyl(0.0028, 0.0028, 0.03, COL.brass, [0.003, 0.004, -0.008], 'z', 8); km.cyl(0.0012, 0.0028, 0.008, COL.copper, [0.003, 0.004, -0.027], 'z', 8);
    km.cyl(0.0028, 0.0028, 0.03, COL.brass, [-0.003, 0.0, -0.006], 'z', 8);
  }
}

// ------------------------------------------------------------------------------------------------ M16A1
// 39 in overall, 20 in barrel, sight radius 19.75 in, carry handle rear sight with two flip apertures, triangular
// handguards, birdcage flash suppressor, forward assist, 20-round magazine.
export function buildM16(o = {}) {
  const hi = o.detail !== 'low', gl = !!o.m203;
  const G = new THREE.Group(); G.name = gl ? 'M16A1_M203' : 'M16A1';
  const k = new Kit(), BY = -0.066;   // bore height
  const P = COL.park, PD = COL.parkDark, F = COL.furniture;
  if (FIG) m16Fig(G, hi, gl, BY); else {
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
  }

  // ---- moving parts
  const parts = {};
  // rear sight flip aperture: short-range and 'L' leaves (selected one stands up)
  { const a = new THREE.Group(); a.name = 'aperture'; a.position.set(0, -0.006, 0.0); G.add(a);
    const apG = plate([...Array(16)].map((_, i) => [Math.cos(i / 16 * Math.PI * 2) * 0.0068, 0.006 + Math.sin(i / 16 * Math.PI * 2) * 0.0068]).concat([[0.0068, -0.004], [-0.0068, -0.004]]).sort(() => 0).slice(0, 16), [[0, 0.006, 0.0032]], 0.0015);   // a round leaf with the peep
    const m = new THREE.Mesh(apG, apertureMat()); m.name = 'peep'; a.add(m); parts.aperture = a; }
  { const kc = new Kit(); if (FIG) { kc.rbox(0.012, 0.008, 0.06, 0.002, P, [0, 0, 0.0], [0, 0, 0], 1); kc.rbox(0.044, 0.009, 0.013, 0.0035, P, [0, 0, 0.032], [0, 0, 0], hi ? 2 : 1); if (hi) kc.rbox(0.007, 0.009, 0.013, 0.002, PD, [-0.026, 0, 0.032], [0, 0, 0], 1); }
    else { kc.box(0.012, 0.008, 0.06, P, [0, 0, 0.0]); kc.box(0.044, 0.008, 0.012, P, [0, 0, 0.032]); if (hi) kc.box(0.006, 0.008, 0.012, PD, [-0.026, 0, 0.032]); }   // charging handle with latch
    parts.charging = part(kc, 'charging', G, [0, -0.041, 0.09]); }
  { const kb = new Kit(); kb.box(0.004, 0.02, 0.05, 0x3a3b3d, [0, 0, 0]); if (hi) kb.box(0.003, 0.006, 0.02, 0x8c8c86, [0.001, 0.004, -0.01]);   // bolt carrier face in the port
    parts.bolt = part(kb, 'bolt', G, [0.0145, -0.062, -0.048]); }
  { const kd = new Kit(); kd.box(0.002, 0.026, 0.058, P, [0, -0.013, 0]); parts.dustCover = part(kd, 'dustCover', G, [0.0175, -0.049, -0.048]); }
  { const kf = new Kit(); kf.cyl(0.006, 0.006, 0.014, PD, [0, 0, 0.0], 'z', 8); kf.cyl(0.0095, 0.0095, 0.004, P, [0, 0, 0.008], 'z', 10); parts.fa = part(kf, 'fa', G, [0.03, -0.05, 0.086]); parts.fa.rotation.y = 0.35; }
  { const ks = new Kit(); ks.box(0.003, 0.004, 0.022, PD, [0, 0, -0.008]); parts.selector = part(ks, 'selector', G, [-0.017, -0.106, 0.036]); }
  { const kt = new Kit(); kt.prism([[0, 0], [0.004, -0.004], [0.006, -0.018], [0.002, -0.02], [-0.002, -0.006]], 0.006, PD, [0, 0, 0], 'zy'); parts.trigger = part(kt, 'trigger', G, [0, -0.124, 0.005]); }
  { const kb = new Kit(); kb.box(0.003, 0.016, 0.01, P, [0, 0, 0]); parts.boltCatch = part(kb, 'boltCatch', G, [-0.019, -0.097, -0.012]); }
  // magazine: 20-round, straight aluminium box; pivot at the top of the body inside the magwell
  { const km = new Kit(); if (FIG) m16MagFig(km, hi); else { km.box(0.022, 0.15, 0.062, COL.alu, [0, -0.075, 0]); km.box(0.026, 0.012, 0.066, COL.parkDark, [0, -0.152, 0]); }
    if (hi && !FIG) { for (let i = 0; i < 4; i++) km.box(0.0225, 0.11, 0.003, 0x26282a, [0, -0.085, -0.022 + i * 0.015]); km.cyl(0.0028, 0.0028, 0.03, COL.brass, [0, 0.004, -0.008], 'z', 6); km.cyl(0.0012, 0.0028, 0.008, COL.copper, [0, 0.004, -0.027], 'z', 6); }
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
function m203Anchors(anchors, sight, TY) {
  Object.assign(anchors, { glFore: [0, -0.15, -0.25], glTrigger: [0, -0.165, -0.2], glBreech: [0, TY, -0.2], glMuzzle: [0, TY, -0.44], magGrip: [0, -0.21, -0.066] });
  sight.quad = { pivot: [-0.03, -0.004, -0.02], rear: [-0.03, 0.002, 0.006], front: [-0.03, 0.002, -0.066] };
}
function addM203(G, parts, anchors, sight, hi) {
  if (FIG) return m203Fig(G, parts, anchors, sight, hi);
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
  m203Anchors(anchors, sight, TY);
}

// ------------------------------------------------------------------------------------------------ M60
// 43.5 in, 23 lb, open bolt, belt fed from the left, quick-change barrel with bipod and carrying handle, leaf sight.
const m60Anchors = BY => ({ grip: [0, -0.185, 0.085], fore: [0, -0.135, -0.36], stockTop: [0, -0.045, 0.33], butt: [0, -0.13, 0.455], cover: [0, -0.02, 0.15], charging: [0.06, -0.095, 0.04],
  barrelLatch: [-0.035, -0.06, -0.055], handle: [0.018, -0.0, -0.17], beltEntry: [-0.045, -0.07, 0.0], muzzle: [0, BY, -0.66], ejection: [0.04, -0.075, 0.05], cheek: [0, -0.04, 0.25] });
export function buildM60(o = {}) {
  const hi = o.detail !== 'low';
  if (FIG) return m60Fig(hi);
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
  return finish(G, parts, m60Anchors(BY), { eyeRelief: 0.09, height: 0.075 }, 'M60');
}

// ------------------------------------------------------------------------------------------------ M72A2 LAW
// telescoping tube: 24.8 in closed, 35 in extended; pop-up sights (rear peep, front reticle with range lines)
const m72Anchors = BY => ({ grip: [0.028, BY, -0.19], fore: [-0.028, BY - 0.01, -0.32], shoulder: [0, BY, 0.15], butt: [0, BY, 0.27], rearCap: [0, BY, 0.27], muzzle: [0, BY, -0.39], cheek: [0, -0.02, 0.08] });
export function buildM72(o = {}) {
  const hi = o.detail !== 'low';
  if (FIG) return m72Fig(hi);
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
  return finish(G, parts, m72Anchors(BY), { eyeRelief: 0.06, height: 0.07 }, 'M72A2');
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
const m1911Anchors = () => ({ grip: [0, -0.1, 0.03], fore: [-0.012, -0.11, 0.028], magwell: [0, -0.16, 0.045], slideRear: [0, -0.02, 0.0], muzzle: [0, -0.02, -0.195], ejection: [0.014, -0.012, -0.045], slideStop: [-0.014, -0.04, -0.04] });
export function buildM1911(o = {}) {
  const hi = o.detail !== 'low';
  if (FIG) return m1911Fig(hi);
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
  return finish(G, parts, m1911Anchors(), { eyeRelief: 0.55, height: 0.018 }, 'M1911A1');
}

// ------------------------------------------------------------------------------------------------ RENDERKIT figures:
// ngc/look-people: the M60, M203, M72A2 LAW and M1911A1 rebuilt at the M16A1's standard (bevelled, lathed, rounded;
// metal in KITMAT.steel, black furniture in KITMAT.plastic, the LAW's painted tubes in paintMat). Same part names,
// pivots, anchors and sight geometry as the classic models (the viewmodel's tracks drive them unchanged).
let _paint = null;
const paintMat = () => _paint || (_paint = Object.assign(figMat('plastic', { roughness: 0.74, emissive: 0x030303 }), { name: 'RKfig/paint' }));
// a domed rivet / screw head on a side face (sx = +1 right, -1 left), r = head radius
function rivet(k, sx, x, y, z, col, r = 0.0024, seg = 8) {
  const g = new THREE.LatheGeometry([new THREE.Vector2(r, 0), new THREE.Vector2(r * 0.72, r * 0.42), new THREE.Vector2(0.0001, r * 0.55)], seg);
  weldNormals(g); k.add(g, col, [sx * x, y, z], [0, 0, -sx * Math.PI / 2]);
}
// a part of an annulus round the z axis (ribs on a round handguard): radius r, length len (along z), arc w centred on top
function arcBand(r, len, w, seg) { const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false, Math.PI - w / 2, w); g.rotateX(Math.PI / 2); return g; }
// clip a line p + t d to a convex polygon (2D): [t0, t1] or null
function clipLine(poly, p, d) {
  let t0 = -1e9, t1 = 1e9; const n = poly.length; let cx = 0, cy = 0; for (const q of poly) { cx += q[0] / n; cy += q[1] / n; }
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]; let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    if (nx * (cx - a[0]) + ny * (cy - a[1]) < 0) { nx = -nx; ny = -ny; }   // inward normal
    const den = nx * d[0] + ny * d[1], num = nx * (p[0] - a[0]) + ny * (p[1] - a[1]);
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den; if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  return t1 > t0 ? [t0, t1] : null;
}
// one 7.62 mm round in its M13 link: the case along +x (rim at -x, bullet tip at +x), the link spine on +y
function beltRoundFig(k, hi, x, y, z, tracer) {
  const sg = hi ? 10 : 6, LINK = 0x2c2d2b;
  if (hi) {
    k.lathe([[0.0001, 0], [0.006, 0], [0.006, 0.0014], [0.0049, 0.0021], [0.0058, 0.0036], [0.0059, 0.036], [0.0046, 0.041], [0.0044, 0.051]], COL.brass, [x - 0.026, y, z], 'x', sg);
    k.lathe([[0.0039, 0], [0.0039, 0.008], [0.0033, 0.014], [0.0026, 0.0165]], COL.copper, [x + 0.0225, y, z], 'x', sg);
    k.lathe([[0.0026, 0], [0.0019, 0.0025], [0.0001, 0.006]], tracer ? 0xb02a18 : COL.copper, [x + 0.039, y, z], 'x', sg);
    for (const dx of [-0.012, 0.007]) k.cyl(0.0065, 0.0065, 0.007, LINK, [x + dx, y, z], 'x', sg, null, true);
    k.rbox(0.03, 0.0024, 0.01, 0.001, LINK, [x - 0.003, y + 0.0066, z], [0, 0, 0], 1);
  } else {
    k.cyl(0.006, 0.006, 0.05, COL.brass, [x, y, z], 'x', 6); k.cyl(0.002, 0.0042, 0.02, tracer ? 0xb02a18 : COL.copper, [x + 0.035, y, z], 'x', 6);
    k.box(0.03, 0.003, 0.012, LINK, [x - 0.003, y + 0.0065, z]);
  }
}

// ---- M60 (FIG). Stamped receiver with its ribs and rivet rows, the feed cover hinged at the front with the latch at
// the rear, the feed tray and the belt guide on the left, the ribbed forearm, the barrel with its collar, gas cylinder,
// bipod yoke, handle clamp, front sight and prong flash suppressor; plastic stock with buttplate and shoulder rest.
function m60Fig(hi) {
  const G = new THREE.Group(); G.name = 'M60';
  const BY = -0.075, P = 0x3b3e42, PD = 0x27292c, PE = 0x34373b, F = 0x232426, FD = 0x151617, HOLE = 0x070708;
  const k = new Kit(), kf = new Kit(), seg = hi ? 16 : 8, c = hi ? 2 : 1;
  // receiver: the stamped box (rounded lower edges), the longitudinal stamped ribs, the top rails, rivet rows
  k.add(sectionBar(roundPoly([[-0.03, -0.043, 0.003], [0.03, -0.043, 0.003], [0.03, -0.124, hi ? 0.01 : 0.006], [-0.03, -0.124, hi ? 0.01 : 0.006]], hi ? 3 : 1), 0.17, -0.05), P);
  for (const sx of [-1, 1]) {
    k.rbox(0.004, 0.011, 0.2, 0.0018, PE, [sx * 0.0302, -0.108, 0.065], [0, 0, 0], c);
    k.rbox(0.003, 0.006, 0.215, 0.0012, PE, [sx * 0.0302, -0.049, 0.06], [0, 0, 0], 1);
    k.rbox(0.004, 0.07, 0.034, 0.0015, PD, [sx * 0.0303, -0.083, -0.03], [0, 0, 0], c);                 // front trunnion
    if (hi) {
      for (const z of [-0.002, 0.034, 0.07, 0.106, 0.142]) { rivet(k, sx, 0.0318, -0.06, z, PE); rivet(k, sx, 0.0318, -0.12, z, PE); }
      for (const y of [-0.062, -0.104]) rivet(k, sx, 0.0322, y, -0.03, PE, 0.0034, 10);
    }
  }
  // rear sight base ahead of the cover, its two ears, the elevation (left) and windage (right) knobs
  k.rbox(0.05, 0.014, 0.042, 0.003, P, [0, -0.037, -0.02], [0, 0, 0], c);
  for (const sx of [-1, 1]) k.rbox(0.004, 0.016, 0.014, 0.0012, P, [sx * 0.0135, -0.027, -0.01], [0, 0, 0], 1);
  k.cyl(0.0095, 0.0095, 0.009, PD, [-0.0345, -0.037, -0.02], 'x', seg); k.cyl(0.0075, 0.0075, 0.008, PD, [0.0335, -0.037, -0.02], 'x', seg);
  if (hi) for (const [x, r] of [[-0.0345, 0.0095], [0.0335, 0.0075]]) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.box(0.0085, 0.0012, 0.0012, PE, [x, -0.037 + Math.sin(a) * r, -0.02 + Math.cos(a) * r], [a, 0, 0]); }
  // feed tray (seen with the cover open): the tray, the cartridge guides, the belt guide on the left
  k.rbox(0.072, 0.004, 0.056, 0.0012, PD, [-0.007, -0.042, 0.028], [0, 0, 0], 1);
  if (hi) { for (const z of [0.006, 0.05]) k.rbox(0.062, 0.006, 0.004, 0.0012, PE, [-0.004, -0.039, z], [0, 0, 0], 1); k.box(0.05, 0.0012, 0.014, HOLE, [0, -0.0398, 0.028]); }
  k.rbox(0.012, 0.03, 0.062, 0.003, P, [-0.037, -0.062, 0.0], [0, 0, 0], c);
  // right side: the ejection port with its deflector lip, the cocking handle slot
  k.box(0.0016, 0.024, 0.05, HOLE, [0.0302, -0.072, 0.05]);
  k.rbox(0.008, 0.004, 0.058, 0.0015, P, [0.033, -0.058, 0.05], [0, 0, 0], 1);
  k.box(0.0016, 0.006, 0.16, HOLE, [0.0302, -0.094, 0.085]);
  // the barrel lock lever (left front: stays on the gun when the barrel comes off)
  k.rbox(0.005, 0.011, 0.034, 0.002, PD, [-0.0335, -0.06, -0.05], [0, 0, 0], 1); k.cyl(0.0042, 0.0042, 0.004, PE, [-0.0325, -0.06, -0.034], 'x', 10);
  // trigger housing, safety (push-through), trigger guard
  k.rbox(0.036, 0.016, 0.132, 0.004, PE, [0, -0.128, 0.045], [0, 0, 0], c);
  k.cyl(0.0036, 0.0036, 0.042, PD, [0, -0.13, 0.002], 'x', 10);
  k.capsule([0, -0.132, -0.03], [0, -0.159, -0.022], 0.0042, 0.0042, PD, hi ? 8 : 6, undefined, null, hi ? 3 : 1);
  k.capsule([0, -0.159, -0.022], [0, -0.161, 0.046], 0.0042, 0.0042, PD, hi ? 8 : 6, undefined, null, hi ? 3 : 1);
  // pistol grip, stock with the buttplate and the folded shoulder rest (plastic)
  kf.prism([[0.04, -0.125], [0.085, -0.125], [0.115, -0.245], [0.1, -0.255], [0.075, -0.25], [0.05, -0.135]], 0.03, F, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.005 : 0);
  if (hi) for (let i = 0; i < 7; i++) kf.box(0.0305, 0.0016, 0.0016, FD, [0, -0.145 - i * 0.014, 0.0898 + i * 0.0035], [0.25, 0, 0]);
  k.rbox(0.058, 0.086, 0.012, 0.004, PD, [0, -0.088, 0.174], [0, 0, 0], c);                                   // stock latch collar
  kf.prism([[0.17, -0.05], [0.44, -0.058], [0.448, -0.065], [0.448, -0.2], [0.44, -0.205], [0.2, -0.135], [0.17, -0.13]], 0.05, F, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.008 : 0);
  kf.rbox(0.056, 0.154, 0.016, hi ? 0.006 : 0.003, FD, [0, -0.131, 0.455], [0, 0, 0], c);
  if (hi) for (let i = 0; i < 8; i++) kf.box(0.046, 0.0016, 0.0016, F, [0, -0.074 - i * 0.016, 0.4635]);
  kf.rbox(0.046, 0.007, 0.085, 0.003, FD, [0, -0.2, 0.402], [0.08, 0, 0], 1);
  k.cyl(0.0035, 0.0035, 0.05, PD, [0, -0.203, 0.446], 'x', 8);
  if (hi) k.add(new THREE.TorusGeometry(0.008, 0.0017, 6, 14), P, [-0.026, -0.12, 0.33], [0, Math.PI / 2, 0]);   // sling swivel (left of the stock)
  // the forearm (fixed to the receiver; the barrel's gas cylinder slides out of it): ribbed, slotted sides, steel cap
  kf.add(sectionBar(roundPoly([[-0.026, -0.067, 0.005], [0.026, -0.067, 0.005], [0.024, -0.131, 0.012], [-0.024, -0.131, 0.012]], hi ? 3 : 1), -0.095, -0.255, 0.96), F);
  if (hi) for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) { const z = -0.112 - i * 0.02; kf.rbox(0.003, 0.028, 0.008, 0.0012, HOLE, [sx * 0.0252 * (1 - 0.04 * (i / 7)), -0.098, z], [0, 0, 0], 1); }
  k.rbox(0.054, 0.066, 0.008, 0.004, P, [0, -0.099, -0.258], [0, 0, 0], c);
  G.add(k.mesh(KITMAT.steel(), 'body')); G.add(kf.mesh(KITMAT.plastic(), 'furniture'));
  const parts = {};
  // feed cover: hinged at the FRONT, the rear lifts; the latch at the rear, the stamped rib, the feed cam underneath
  { const kc = new Kit();
    kc.add(sectionBar(roundPoly([[-0.031, -0.009, 0.001], [0.031, -0.009, 0.001], [0.031, 0.003, 0.006], [-0.031, 0.003, 0.006]], hi ? 3 : 1), 0.162, 0.002), P);
    kc.rbox(0.026, 0.004, 0.13, 0.0015, PE, [0, 0.004, 0.085], [0, 0, 0], 1);
    kc.cyl(0.0042, 0.0042, 0.05, PD, [0, -0.004, 0.003], 'x', 10);
    kc.rbox(0.03, 0.008, 0.012, 0.003, PD, [0, 0.003, 0.157], [0, 0, 0], 1); kc.rbox(0.016, 0.01, 0.006, 0.002, PD, [0, 0.009, 0.164], [0, 0, 0], 1);
    if (hi) { kc.rbox(0.012, 0.006, 0.09, 0.002, PD, [0.004, -0.012, 0.07], [0, 0, 0], 1); for (const x of [-0.016, -0.004]) kc.rbox(0.006, 0.006, 0.026, 0.0015, PD, [x, -0.012, 0.024], [0, 0.5, 0], 1); }
    parts.cover = part(kc, 'cover', G, [0, -0.035, 0.0]); }
  // rear sight leaf (folds down = battle sight): hinge, two rails with the range graduations, the top bar; the slide carries the peep
  { const kl = new Kit(); kl.cyl(0.0035, 0.0035, 0.024, PD, [0, 0, 0], 'x', 10);
    for (const sx of [-1, 1]) kl.rbox(0.003, 0.036, 0.003, 0.0009, PD, [sx * 0.0075, 0.018, 0], [0, 0, 0], 1);
    kl.rbox(0.018, 0.0035, 0.003, 0.001, PD, [0, 0.0345, 0], [0, 0, 0], 1);
    if (hi) for (let i = 0; i < 6; i++) kl.box(0.002, 0.0006, 0.0008, 0x7a7c78, [0.0075, 0.008 + i * 0.0045, -0.0015]);
    const leaf = part(kl, 'leaf', G, [0, -0.02, -0.01]);
    const peep = new THREE.Mesh(plate([[-0.007, -0.004], [0.007, -0.004], [0.007, 0.008], [-0.007, 0.008]], [[0, 0.002, 0.0022]], 0.0015), apertureMat()); peep.name = 'slide'; peep.position.set(0, 0.018, 0); leaf.add(peep); parts.leaf = leaf; }
  // cocking handle (right): the stem through the slot and the knob
  { const kh = new Kit(); kh.rbox(0.022, 0.009, 0.014, 0.0025, P, [-0.006, 0, 0], [0, 0, 0], 1); kh.capsule([0.006, 0, -0.012], [0.006, 0, 0.016], 0.0058, 0.0058, PD, hi ? 10 : 6, undefined, null, hi ? 3 : 1);
    parts.cocking = part(kh, 'cocking', G, [0.045, -0.095, 0.02]); }
  // the barrel group: barrel, collar, handle clamp, gas cylinder, bipod yoke, front sight, flash suppressor (comes off in a change)
  { const kb = new Kit();
    kb.lathe([[0.0125, 0], [0.019, 0.012], [0.0235, 0.016], [0.0235, 0.06]], P, [0, 0, -0.1], 'z', seg);   // chamber collar (z -0.1 .. -0.04)
    kb.cyl(0.0125, 0.0125, 0.51, PD, [0, 0, -0.345], 'z', hi ? 14 : 8);
    kb.lathe([[0.0125, 0], [0.0165, 0.003], [0.0165, 0.021], [0.0125, 0.024]], P, [0, 0, -0.212], 'z', seg);   // handle clamp band
    kb.rbox(0.012, 0.012, 0.022, 0.003, P, [0.013, 0.008, -0.2], [0, 0, 0], 1);
    kb.cyl(0.012, 0.012, 0.22, P, [0, -0.03, -0.36], 'z', hi ? 14 : 8);                                      // gas cylinder
    kb.rbox(0.02, 0.034, 0.03, 0.004, P, [0, -0.016, -0.47], [0, 0, 0], c);                                   // gas port block
    kb.cyl(0.0135, 0.0135, 0.012, PE, [0, -0.03, -0.493], 'z', 6); kb.lathe([[0.0001, 0], [0.008, 0.001], [0.0115, 0.004]], PE, [0, -0.03, -0.5], 'z', hi ? 10 : 6);   // gas cylinder nut
    kb.rbox(0.034, 0.024, 0.026, 0.004, P, [0, -0.04, -0.48], [0, 0, 0], c);                                  // bipod yoke
    kb.lathe([[0.0125, 0], [0.0155, 0.003], [0.0155, 0.021], [0.0125, 0.024]], P, [0, 0, -0.562], 'z', seg);   // front sight band
    kb.prism([[-0.539, 0.012], [-0.563, 0.012], [-0.556, 0.064], [-0.546, 0.064]], 0.008, P, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0012 : 0);
    kb.rbox(0.0025, 0.012, 0.004, 0.0006, PD, [0, 0.067, -0.551], [0, 0, 0], 1);                              // the blade (tip on the line of sight)
    // prong flash suppressor: the sleeve, four open prongs, the dark bore
    kb.lathe([[0.006, 0], [0.0148, 0], [0.0148, 0.02], [0.0125, 0.022]], P, [0, 0, -0.622], 'z', seg);
    kb.cyl(0.0058, 0.0058, 0.002, HOLE, [0, 0, -0.6215], 'z', 8);
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; kb.rbox(0.0078, 0.0034, 0.04, 0.0012, P, [Math.cos(a) * 0.0122, Math.sin(a) * 0.0122, -0.641], [0, 0, a + Math.PI / 2], 1); }
    if (hi) kb.add(new THREE.TorusGeometry(0.007, 0.0016, 6, 12), P, [0, -0.048, -0.455], [0, Math.PI / 2, 0]);   // front sling swivel
    const barrel = part(kb, 'barrel', G, [0, BY, 0]);
    // heat glow overlay (emissive, fades in above ~400 C)
    const gm = new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.0132, 0.0132, 0.44, 10).rotateX(Math.PI / 2), gm); glow.position.set(0, 0, -0.31); glow.name = 'glow'; barrel.add(glow);
    parts.barrel = barrel; parts.glow = glow;
    // carrying handle (folded up): a bent steel arm, the plastic grip
    const kh = new Kit(), khf = new Kit();
    kh.cyl(0.0055, 0.0055, 0.012, PD, [0, 0, 0], 'z', 10);
    kh.capsule([0, 0, 0], [0, 0.048, 0.002], 0.0042, 0.0042, P, hi ? 8 : 6, undefined, null, 2);
    kh.capsule([0, 0.048, 0.002], [0, 0.062, 0.016], 0.0042, 0.0042, P, hi ? 8 : 6, undefined, null, 2);
    khf.capsule([0, 0.062, 0.012], [0, 0.062, 0.104], 0.0085, 0.0085, F, hi ? 12 : 6, undefined, null, hi ? 3 : 1, hi ? 3 : 1);
    if (hi) for (let i = 0; i < 6; i++) khf.cyl(0.0088, 0.0088, 0.002, FD, [0, 0.062, 0.03 + i * 0.012], 'z', 12);
    parts.handle = part(kh, 'handle', barrel, [0.018, 0.012, -0.2]); parts.handle.add(khf.mesh(KITMAT.plastic(), 'handleGrip'));
    // bipod: pivot under the gas cylinder; legs fold back along the barrel. Hinge, tube, collar, extension, foot.
    const bp = new THREE.Group(); bp.name = 'bipod'; bp.position.set(0, -0.045, -0.48); barrel.add(bp);
    for (const s of [-1, 1]) { const kl = new Kit();
      kl.cyl(0.0055, 0.0055, 0.011, PD, [0, 0, 0], 'x', 10);
      kl.capsule([0, -0.004, 0], [0, -0.2, 0], 0.0058, 0.0052, P, hi ? 8 : 6, undefined, null, 1, hi ? 3 : 1);
      kl.capsule([0, -0.19, 0], [0, -0.3, 0], 0.0042, 0.0042, PD, hi ? 8 : 6, undefined, null, 1);
      if (hi) kl.cyl(0.0068, 0.0068, 0.012, P, [0, -0.197, 0], 'y', 10);
      kl.rbox(0.028, 0.006, 0.02, 0.0025, PD, [0, -0.306, 0], [0, 0, 0], 1);
      const leg = part(kl, 'leg' + (s < 0 ? 'L' : 'R'), bp, [s * 0.012, 0, 0]); leg.userData.side = s; }
    parts.bipod = bp; }
  // the belt: a short hanging length of linked cartridges (4 ball : 1 tracer, red tips)
  { const belt = new THREE.Group(); belt.name = 'belt'; belt.position.set(-0.045, -0.065, 0.0); G.add(belt);
    const N = hi ? 12 : 5, links = [];
    for (let i = 0; i < N; i++) { const kr = new Kit(); beltRoundFig(kr, hi, 0, 0, 0, i % 5 === 4);
      const l = part(kr, 'round' + i, i ? links[i - 1] : belt, i ? [0, -0.013, 0.004] : [0, 0, 0], KITMAT.steel()); l.rotation.x = 0.05; links.push(l); }
    belt.rotation.y = Math.PI / 2; parts.belt = belt; parts.links = links; }
  return finish(G, parts, m60Anchors(BY), { eyeRelief: 0.09, height: 0.075 }, 'M60');
}

// ---- M203 (FIG) under the M16A1: the round ribbed handguard (plastic), the long receiver rail with the breech block,
// trigger housing, guard, safety and barrel latch; the leaf sight folded on the handguard; the quadrant sight on the
// carry handle; the 12 in aluminium barrel tube (open bore, rifled-dark) that slides forward to load.
function m203Fig(G, parts, anchors, sight, hi) {
  const BY = -0.066, TY = -0.122, A = 0x3e4145, AD = 0x2a2c2f, P = 0x3c3f43, PD = 0x26282b, F = 0x232426, FD = 0x151617, HOLE = 0x070708;
  const k = new Kit(), kf = new Kit(), seg = hi ? 20 : 10, c = hi ? 2 : 1;
  // handguard: round, the bottom flat where the receiver bolts on, tapering slightly forward; raised ribs over the top
  const R = 0.029, cy = BY - 0.004, ol = [];
  for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + 0.75 + (Math.PI * 2 - 1.5) * i / seg; ol.push([Math.cos(a) * R, Math.sin(a) * R]); }
  kf.add(sectionBar(ol, -0.178, -0.414, 0.97, cy), F);
  if (hi) for (let i = 0; i < 10; i++) { const z = -0.196 - i * 0.021, s = 1 - 0.03 * ((-0.178 - z) / 0.236); kf.add(arcBand(R * s + 0.0016, 0.007, 2.4, 14), F, [0, cy, z]); }
  k.lathe([[0.001, 0.0], [0.012, 0.0], [0.024, 0.004], [0.024, 0.008], [0.0225, 0.012], [0.001, 0.012]], P, [0, BY - 0.002, -0.424], 'z', hi ? 16 : 8);   // handguard cap
  // the leaf sight (folded flat on the handguard): base, hinge, the leaf with its range bars
  k.rbox(0.016, 0.005, 0.022, 0.002, P, [0, cy + R + 0.0015, -0.2], [0, 0, 0], 1);
  k.rbox(0.021, 0.0022, 0.05, 0.001, PD, [0, cy + R + 0.0045, -0.232], [0, 0, 0], 1);
  if (hi) for (let i = 0; i < 4; i++) k.box(0.012, 0.0006, 0.0012, 0x8a8c88, [0, cy + R + 0.0058, -0.218 - i * 0.009]);
  // receiver: the long rail on top of the barrel, its side skirts, the breech block, the trigger housing
  k.add(sectionBar(roundPoly([[-0.026, -0.105, 0.003], [0.026, -0.105, 0.003], [0.026, -0.09, 0.003], [-0.026, -0.09, 0.003]], hi ? 2 : 1), -0.16, -0.405), A);
  for (const sx of [-1, 1]) { k.rbox(0.004, 0.02, 0.2, 0.0015, A, [sx * 0.0255, -0.107, -0.3], [0, 0, 0], 1); if (hi) { k.box(0.0008, 0.0016, 0.2, AD, [sx * 0.0262, -0.097, -0.3]); for (const z of [-0.23, -0.37]) rivet(k, sx, 0.0275, -0.1, z, AD, 0.003, 10); } }
  k.rbox(0.054, 0.062, 0.046, 0.004, A, [0, -0.121, -0.183], [0, 0, 0], c);
  k.rbox(0.03, 0.014, 0.066, 0.004, A, [0, -0.152, -0.2], [0, 0, 0], c);
  // trigger, its guard and the safety lever inside the guard ahead of it; the barrel latch on the left
  k.rbox(0.006, 0.015, 0.005, 0.002, AD, [0, -0.165, -0.195], [0.25, 0, 0], 1);
  k.capsule([0, -0.157, -0.229], [0, -0.178, -0.222], 0.0032, 0.0032, AD, hi ? 8 : 6, undefined, null, 2);
  k.capsule([0, -0.178, -0.222], [0, -0.18, -0.166], 0.0032, 0.0032, AD, hi ? 8 : 6, undefined, null, 2);
  k.capsule([0, -0.18, -0.166], [0, -0.152, -0.162], 0.0032, 0.0032, AD, hi ? 8 : 6, undefined, null, 2);
  k.rbox(0.012, 0.004, 0.008, 0.0015, AD, [0, -0.161, -0.214], [0, 0, 0], 1);
  k.rbox(0.006, 0.012, 0.022, 0.002, AD, [-0.0285, -0.101, -0.245], [0, 0, 0], 1);
  // quadrant sight on the left of the carry handle: bracket, clamp knob, the graduated arc (centred on the arm's pivot)
  k.rbox(0.006, 0.03, 0.05, 0.002, P, [-0.019, -0.02, -0.07], [0, 0, 0], 1);
  k.cyl(0.0062, 0.0062, 0.006, PD, [-0.0245, -0.03, -0.088], 'x', hi ? 14 : 8);
  if (hi) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.box(0.0062, 0.001, 0.001, P, [-0.0245, -0.03 + Math.sin(a) * 0.0062, -0.088 + Math.cos(a) * 0.0062], [a, 0, 0]); }
  { const arc = [], r0 = 0.034, r1 = 0.046, n = hi ? 10 : 4, p0 = -0.08, p1 = 0.72, pt = (r, f) => [-0.02 - r * Math.cos(f), -0.004 - r * Math.sin(f)];
    for (let i = 0; i <= n; i++) arc.push(pt(r1, p0 + (p1 - p0) * i / n)); for (let i = n; i >= 0; i--) arc.push(pt(r0, p0 + (p1 - p0) * i / n));
    k.prism(arc, 0.0025, 0x2b2c2a, [-0.0265, 0, 0], 'zy', [0, 0, 0], hi ? 0.0006 : 0);
    if (hi) for (let i = 0; i < 8; i++) { const f = 0.0 + i * 0.085, [z, y] = pt(0.0435, f); k.box(0.0008, 0.0006, i % 2 ? 0.003 : 0.005, 0xa8aaa4, [-0.0279, y, z], [-f, 0, 0]); } }
  G.add(k.mesh(KITMAT.steel(), 'm203body')); G.add(kf.mesh(KITMAT.plastic(), 'm203furniture'));
  // the barrel: aluminium tube, chamfered muzzle, open bore (dark), rear face; the guide rail on top
  { const kt = new Kit(), sg = hi ? 24 : 12;
    kt.lathe([[0.0255, 0], [0.0255, 0.232]], A, [0, 0, -0.24], 'z', sg);
    kt.lathe([[0.0205, 0.004], [0.0215, 0], [0.0245, 0], [0.0255, 0.0025]], A, [0, 0, -0.24], 'z', sg);
    kt.lathe([[0.0255, 0], [0.0255, 0.006], [0.0205, 0.008]], A, [0, 0, -0.008], 'z', sg);
    kt.lathe([[0.0205, 0.244], [0.0205, 0.004]], 0x17181a, [0, 0, -0.24], 'z', sg);
    kt.cyl(0.0206, 0.0206, 0.002, 0x0c0c0d, [0, 0, -0.012], 'z', sg);
    kt.rbox(0.014, 0.006, 0.2, 0.002, A, [0, 0.0255, -0.12], [0, 0, 0], 1);
    if (hi) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; kt.box(0.003, 0.0012, 0.05, 0x101112, [Math.cos(a) * 0.0203, Math.sin(a) * 0.0203, -0.215], [0, 0, a + Math.PI / 2]); }   // rifling lands near the muzzle
    parts.glBarrel = part(kt, 'glBarrel', G, [0, TY, -0.2]); }
  // the quadrant sight arm: pivot at the front of the bracket, rotates the line of sight down by the elevation
  { const kq = new Kit();
    kq.cyl(0.0042, 0.0042, 0.005, 0x1f201e, [0, 0, 0], 'x', 10);
    kq.rbox(0.003, 0.005, 0.078, 0.0012, 0x1f201e, [0, 0, -0.03], [0, 0, 0], 1);
    kq.rbox(0.003, 0.012, 0.003, 0.0008, 0x111111, [0, 0.006, -0.066], [0, 0, 0], 1);   // front post (same as the classic one)
    if (hi) { kq.rbox(0.003, 0.003, 0.012, 0.001, 0x1f201e, [0, -0.004, 0.002], [0, 0, 0], 1); kq.rbox(0.0026, 0.006, 0.006, 0.001, 0x1f201e, [0, -0.002, -0.072], [0, 0, 0], 1); }
    const qArm = part(kq, 'quadArm', G, [-0.03, -0.004, -0.02]);
    const peep = new THREE.Mesh(plate([[-0.006, -0.004], [0.006, -0.004], [0.006, 0.012], [-0.006, 0.012]], [[0, 0.006, 0.0022]], 0.0015), apertureMat()); peep.position.set(0, 0, 0.006); qArm.add(peep);
    parts.quadArm = qArm; }
  m203Anchors(anchors, sight, TY);
}

// ---- M72A2 LAW (FIG): the fibreglass outer tube (painted OD, flared front rim, yellow HE band, rear collar) with the
// warhead's nose seen down the muzzle, the aluminium inner tube (rear rim, dark bore), rubber end covers, the trigger
// housing with the rubber boot over the trigger bar, the arming handle, the pop-up sights, the sling.
function m72Fig(hi) {
  const G = new THREE.Group(); G.name = 'M72A2';
  const BY = -0.07, R = 0.039, parts = {}, seg = hi ? 32 : 14, OD = 0x575a3b, ODD = 0x44462e, ODI = 0x4b4e33, BLK = 0x171717, IN = 0x1d1e19, HOLE = 0x0a0a0a;
  const ko = new Kit();
  ko.lathe([[R, 0], [R, 0.655]], OD, [0, 0, -0.3875], 'z', seg);
  ko.lathe([[R - 0.003, 0.655], [R - 0.003, 0.004]], IN, [0, 0, -0.3875], 'z', seg);
  ko.lathe([[R - 0.003, 0.004], [R - 0.002, 0], [R + 0.0015, 0], [R + 0.0026, 0.004], [R + 0.0026, 0.018], [R, 0.022]], OD, [0, 0, -0.3875], 'z', seg);   // front rim
  ko.lathe([[R, 0], [R + 0.0012, 0.001], [R + 0.0012, 0.029], [R, 0.03]], COL.yellow, [0, 0, -0.345], 'z', seg);       // yellow band (HE)
  ko.lathe([[R, 0], [R + 0.0026, 0.003], [R + 0.0026, 0.0325], [R - 0.003, 0.0325]], OD, [0, 0, 0.235], 'z', seg);     // rear collar
  // the warhead's nose and fuze inside the muzzle, a dark bulkhead behind it
  ko.lathe([[0.0001, 0], [0.005, 0.003], [0.012, 0.012], [0.022, 0.03], [0.031, 0.06]], 0x4f5434, [0, 0, -0.372], 'z', hi ? 16 : 8);
  ko.cyl(R - 0.0031, R - 0.0031, 0.002, HOLE, [0, 0, -0.31], 'z', seg);
  // front sight housing, trigger housing (top), rear sight housing
  ko.rbox(0.034, 0.007, 0.03, 0.0025, ODD, [0, R + 0.0015, -0.34], [0, 0, 0], hi ? 2 : 1);
  ko.rbox(0.022, 0.012, 0.13, 0.004, ODD, [0, R + 0.002, -0.065], [0, 0, 0], hi ? 2 : 1);
  ko.rbox(0.026, 0.01, 0.034, 0.003, ODD, [0, R + 0.002, 0.018], [0, 0, 0], hi ? 2 : 1);
  if (hi) { for (const z of [-0.12, -0.01]) for (const sx of [-1, 1]) rivet(ko, sx, 0.0112, R + 0.002, z, ODI, 0.0022); ko.rbox(0.008, 0.004, 0.008, 0.0015, ODD, [-0.013, R + 0.0, -0.03], [0, 0, 0], 1); }
  // the sling (right side, a nylon strap clipped to both covers; hangs slightly)
  { const n = hi ? 8 : 1, z0 = -0.375, z1 = 0.255, W = 0x5a5c3c;
    for (let i = 0; i < n; i++) { const za = z0 + (z1 - z0) * i / n, zb = z0 + (z1 - z0) * (i + 1) / n, sag = t => -0.004 - (n > 1 ? 0.012 * (1 - (2 * t - 1) ** 2) : 0.006);
      const ya = sag(i / n), yb = sag((i + 1) / n), L = Math.hypot(zb - za, yb - ya);
      ko.rbox(0.003, 0.018, L + 0.001, 0.001, W, [R + 0.0035, (ya + yb) / 2, (za + zb) / 2], [Math.atan2(yb - ya, zb - za) * -1, 0, 0], 1); }
    if (hi) for (const z of [z0, z1]) ko.rbox(0.006, 0.02, 0.008, 0.002, 0x2a2b26, [R + 0.002, -0.004, z], [0, 0, 0], 1); }
  const tube = new THREE.Group(); tube.name = 'outer'; tube.position.set(0, BY, 0); tube.add(ko.mesh(paintMat(), 'outerMesh')); G.add(tube);
  // the inner tube (slides back by 0.238 when extended): aluminium painted OD, the rear rim, the dark bore and motor
  { const ki = new Kit();
    ki.lathe([[R - 0.004, 0], [R - 0.004, 0.233]], ODI, [0, 0, -0.125], 'z', seg);
    ki.lathe([[R - 0.004, 0], [R - 0.0015, 0.003], [R - 0.0015, 0.019], [R - 0.004, 0.022], [R - 0.007, 0.022]], BLK, [0, 0, 0.108], 'z', seg);
    ki.lathe([[R - 0.007, 0.255], [R - 0.007, 0]], IN, [0, 0, -0.125], 'z', seg);
    ki.cyl(R - 0.0071, R - 0.0071, 0.002, HOLE, [0, 0, -0.04], 'z', seg);
    if (hi) ki.lathe([[0.0001, 0], [0.012, 0], [0.016, 0.03]], 0x2a2a28, [0, 0, -0.04], 'z', 12);   // the motor nozzle
    parts.inner = part(ki, 'inner', tube, [0, 0, 0.14], paintMat()); }
  // end covers (rubber): front on the outer tube, rear on the inner; both drop when the tube is extended
  { const kc = new Kit(); if (hi) { kc.lathe([[0.0001, 0], [R + 0.001, 0], [R + 0.0035, 0.003], [R + 0.0035, 0.012], [R - 0.002, 0.012]], BLK, [0, 0, -0.006], 'z', seg); kc.rbox(0.012, 0.006, 0.01, 0.002, BLK, [0, R + 0.004, -0.001], [0, 0, 0], 1); }
    else kc.cyl(R + 0.002, R + 0.002, 0.012, BLK, [0, 0, 0], 'z', seg);
    parts.frontCap = part(kc, 'frontCap', tube, [0, 0, -0.39], KITMAT.lambert()); }
  { const kc = new Kit(); if (hi) kc.lathe([[R, 0], [R + 0.0025, 0], [R + 0.0025, 0.009], [R, 0.012], [0.0001, 0.012]], BLK, [0, 0, -0.006], 'z', seg);
    else kc.cyl(R + 0.002, R + 0.002, 0.012, BLK, [0, 0, 0], 'z', seg);
    parts.rearCap = part(kc, 'rearCap', parts.inner, [0, 0, 0.131], KITMAT.lambert()); }
  // the rubber boot over the trigger bar; the arming handle (pushed forward to arm)
  { const kt = new Kit(); kt.ellip(0.0095, 0.0055, 0.019, COL.rubber, [0, -0.001, 0], [0, 0, 0], hi ? 12 : 8); if (hi) for (let i = 0; i < 3; i++) kt.box(0.016, 0.0008, 0.0012, 0x0a0a0a, [0, 0.0042 - Math.abs(i - 1) * 0.0004, -0.007 + i * 0.007]);
    parts.triggerBar = part(kt, 'triggerBar', tube, [0, R + 0.012, -0.08], KITMAT.lambert()); }
  { const ka = new Kit(); ka.rbox(0.008, 0.008, 0.022, 0.0025, BLK, [0, 0, 0], [0, 0, 0], 1); ka.rbox(0.004, 0.012, 0.008, 0.0015, BLK, [0.004, 0.004, -0.006], [0, 0, 0], 1);
    parts.armHandle = part(ka, 'armHandle', tube, [0.012, R + 0.01, -0.03]); }
  // rear sight: a peep on a spring leaf (pops up when extended); the leaf below the ring is solid
  { const rs = new THREE.Group(); rs.name = 'rearSight'; rs.position.set(0, R + 0.004, 0.0); tube.add(rs);
    const hy = -BY - R - 0.004;
    const pe = new THREE.Mesh(plate([[-0.006, 0], [0.006, 0], [0.006, hy], ...[...Array(7)].map((_, i) => [Math.cos((i + 1) / 8 * Math.PI) * 0.006, hy + Math.sin((i + 1) / 8 * Math.PI) * 0.006]), [-0.006, hy]], [[0, hy, 0.0026]], 0.0015), apertureMat()); rs.add(pe);
    const kl = new Kit(); kl.rbox(0.0125, hy - 0.007, 0.0022, 0.001, ODD, [0, (hy - 0.007) / 2, -0.0004], [0, 0, 0], 1); kl.cyl(0.0024, 0.0024, 0.016, BLK, [0, 0.0005, 0], 'x', 8);
    rs.add(kl.mesh(paintMat(), 'leafPlate')); parts.rearSight = rs; }
  // front sight: frame with the reticle (cross + range lines), folds up
  { const fs = new THREE.Group(); fs.name = 'frontSight'; fs.position.set(0, R + 0.002, -0.34); tube.add(fs);
    const kf = new Kit(); const H = 0.07 - R - 0.002;
    for (const sx of [-1, 1]) kf.rbox(0.0042, H + 0.034, 0.0032, 0.0012, ODD, [sx * 0.022, (H + 0.03) / 2, 0], [0, 0, 0], 1);
    kf.rbox(0.0482, 0.0042, 0.0032, 0.0012, ODD, [0, H + 0.03, 0], [0, 0, 0], 1); kf.rbox(0.0482, 0.0045, 0.004, 0.0012, ODD, [0, 0.003, 0], [0, 0, 0], 1);
    kf.cyl(0.0026, 0.0026, 0.05, BLK, [0, 0.0, 0.001], 'x', 8);
    fs.add(kf.mesh(paintMat(), 'frame'));
    const ret = new THREE.Group(); ret.name = 'reticle'; ret.position.set(0, H, 0); fs.add(ret); parts.reticle = ret;
    parts.frontSight = fs; }
  return finish(G, parts, m72Anchors(BY), { eyeRelief: 0.06, height: 0.07 }, 'M72A2');
}

// ---- M1911A1 (FIG): the slide (rounded top, rear serrations, ejection port, GI sights, barrel bushing and muzzle,
// the recoil spring housing), the frame with the dust cover, trigger guard, grip safety tang, the arched mainspring
// housing with its grooves and lanyard loop, thumb safety, slide stop, magazine catch; the brown checkered grips with
// their screw bushings; spur hammer; the trigger shoe. The grip follows the magazine's 12.6 deg rake.
function m1911Fig(hi) {
  const G = new THREE.Group(); G.name = 'M1911A1';
  const P = 0x37393b, PD = 0x232527, PE = 0x2f3134, GR = 0x3d2b1e, GRD = 0x22170f, HOLE = 0x070708;
  const k = new Kit(), kg = new Kit(), seg = hi ? 16 : 8, c = hi ? 2 : 1;
  const cz = y => 0.022 + (-0.05 - y) * 0.2236, arch = y => (y < -0.08 ? 0.0035 * Math.sin(Math.PI * Math.min(1, (-0.08 - y) / 0.085)) : 0);
  const fz = y => cz(y) - 0.021, bz = y => cz(y) + 0.021 + arch(y);
  // frame: the dust cover and rails, the grip frame (front strap, arched mainspring housing at the back)
  k.prism([[0.024, -0.032], [-0.152, -0.032], [-0.152, -0.0445], [-0.068, -0.046], [-0.062, -0.05], [0.004, -0.05], [0.024, -0.046]], 0.021, P, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0015 : 0);
  { const ol = [[fz(-0.046), -0.046], [0.04, -0.046], [bz(-0.08) - 0.001, -0.08]]; for (let i = 1; i <= (hi ? 6 : 3); i++) { const y = -0.08 - 0.078 * i / (hi ? 6 : 3); ol.push([bz(y), y]); } ol.push([fz(-0.158), -0.158]);
    k.prism(ol, 0.025, P, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.002 : 0); }
  if (hi) { for (let i = 0; i < 11; i++) { const y = -0.09 - i * 0.0062; k.box(0.019, 0.0012, 0.0016, PD, [0, y, bz(y) + 0.0002]); }
    k.add(new THREE.TorusGeometry(0.0032, 0.0011, 6, 12), PE, [0, -0.1615, bz(-0.158) - 0.004], [0, Math.PI / 2, 0]); }
  // trigger guard (a C section, bevelled)
  k.prism([[fz(-0.076) + 0.002, -0.077], [-0.056, -0.078], [-0.064, -0.074], [-0.069, -0.062], [-0.064, -0.05], [-0.058, -0.05], [-0.062, -0.061], [-0.058, -0.07], [-0.052, -0.072], [fz(-0.07) + 0.002, -0.071]], 0.009, P, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0015 : 0);
  // grip safety with its tang over the web of the hand
  k.prism([[0.024, -0.036], [0.04, -0.034], [0.054, -0.037], [0.058, -0.042], [0.052, -0.047], [0.046, -0.05], [bz(-0.074) + 0.0025, -0.074], [bz(-0.084) + 0.001, -0.084], [bz(-0.07) - 0.004, -0.07], [0.036, -0.05], [0.024, -0.045]], 0.018, PE, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0015 : 0);
  // left side: thumb safety, slide stop (lever and its pin on the right), magazine catch
  k.prism([[0.021, -0.039], [0.019, -0.0315], [0.006, -0.031], [-0.007, -0.0335], [-0.006, -0.037], [0.012, -0.0405]], 0.003, PD, [-0.0122, 0, 0], 'zy', [0, 0, 0], hi ? 0.0007 : 0);
  k.cyl(0.0045, 0.0045, 0.002, PD, [-0.0115, -0.037, 0.018], 'x', 12);
  k.prism([[-0.066, -0.041], [-0.06, -0.048], [-0.05, -0.0465], [-0.034, -0.042], [-0.027, -0.037], [-0.03, -0.0305], [-0.04, -0.032], [-0.057, -0.036]], 0.003, PD, [-0.0122, 0, 0], 'zy', [0, 0, 0], hi ? 0.0007 : 0);
  k.cyl(0.0042, 0.0042, 0.003, PD, [-0.0125, -0.0435, -0.061], 'x', 12); rivet(k, 1, 0.0105, -0.0435, -0.061, PE, 0.0028, 10);
  k.cyl(0.0046, 0.0046, 0.003, PE, [-0.0128, -0.059, fz(-0.059) - 0.006], 'x', 12);
  if (hi) { for (const s of [-1, 1]) for (const [y, z] of [[-0.0365, 0.02], [-0.041, 0.006]]) rivet(k, s, 0.0103, y, z, PE, 0.0022, 8); }
  // grips: brown plastic panels, chequered (crossed grooves inside a smooth border), two screws in reinforcing rings
  { const y0 = -0.058, y1 = -0.148, out = [[fz(y0) + 0.003, y0, 0.003], [bz(y0) - 0.003, y0, 0.003], [bz(y1) - 0.004, y1, 0.005], [fz(y1) + 0.003, y1, 0.005]];
    const inner = [[fz(y0 - 0.005) + 0.006, y0 - 0.005], [bz(y0 - 0.005) - 0.0065, y0 - 0.005], [bz(y1 + 0.006) - 0.0075, y1 + 0.006], [fz(y1 + 0.006) + 0.006, y1 + 0.006]];
    for (const sx of [-1, 1]) {
      kg.prism(roundPoly(out, hi ? 3 : 1), 0.0046, GR, [sx * 0.0147, 0, 0], 'zy', [0, 0, 0], hi ? 0.0016 : 0);
      if (hi) for (const dir of [1, -1]) for (let i = -24; i <= 24; i++) {
        const d = [Math.SQRT1_2, dir * Math.SQRT1_2], nrm = [-d[1], d[0]], o = [cz(-0.103) + nrm[0] * i * 0.0033, -0.103 + nrm[1] * i * 0.0033], t = clipLine(inner, o, d); if (!t) continue;
        const L = t[1] - t[0]; if (L < 0.003) continue; const m = (t[0] + t[1]) / 2;
        kg.box(0.0008, 0.0009, L, GRD, [sx * 0.0169, o[1] + d[1] * m, o[0] + d[0] * m], [-Math.atan2(d[1], d[0]), 0, 0]);
      }
      for (const y of [-0.068, -0.138]) { kg.cyl(0.0058, 0.0058, 0.0012, GR, [sx * 0.0171, y, cz(y) + 0.001], 'x', hi ? 14 : 8); kg.cyl(0.0032, 0.0032, 0.0012, PD, [sx * 0.0178, y, cz(y) + 0.001], 'x', hi ? 12 : 6); if (hi) kg.box(0.0006, 0.0006, 0.005, HOLE, [sx * 0.0184, y, cz(y) + 0.001]); }
    } }
  G.add(k.mesh(KITMAT.steel(), 'body')); G.add(kg.mesh(KITMAT.plastic(), 'grips'));
  const parts = {};
  { const ks = new Kit();
    ks.add(sectionBar(roundPoly([[-0.0108, -0.032, 0.0008], [0.0108, -0.032, 0.0008], [0.0108, -0.013, 0.003], [0.0075, -0.004, 0.003], [-0.0075, -0.004, 0.003], [-0.0108, -0.013, 0.003]], hi ? 3 : 1), 0.011, -0.185), P);
    ks.add(sectionBar(roundPoly([[-0.0108, -0.0445, 0.005], [0.0108, -0.0445, 0.005], [0.0108, -0.031, 0.0005], [-0.0108, -0.031, 0.0005]], 2), -0.152, -0.185), P);   // recoil spring housing
    ks.lathe([[0.0059, 0], [0.0088, 0], [0.0092, 0.0015], [0.0092, 0.0055]], PE, [0, -0.02, -0.1905], 'z', seg);                          // barrel bushing
    ks.lathe([[0.0001, 0.004], [0.0056, 0.004], [0.0056, 0.0]], HOLE, [0, -0.02, -0.191], 'z', seg);                                          // bore
    ks.lathe([[0.0056, 0.0], [0.0059, 0.0], [0.0059, 0.006]], 0x45484c, [0, -0.02, -0.191], 'z', seg);                                     // muzzle crown
    ks.lathe([[0.0001, 0.002], [0.003, 0.002], [0.003, 0], [0.0045, 0], [0.0045, 0.004]], PE, [0, -0.0375, -0.1875], 'z', hi ? 10 : 6);   // recoil spring plug
    if (hi) for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) ks.box(0.0012, 0.0175, 0.0013, PD, [sx * 0.0104, -0.0205, 0.0065 - i * 0.0031]);   // rear serrations
    ks.box(0.0007, 0.0095, 0.031, HOLE, [0.0107, -0.0118, -0.046]); ks.box(0.0007, 0.0052, 0.027, 0x4a4d50, [0.01095, -0.0122, -0.046]);   // ejection port, barrel hood in it
    if (hi) { ks.rbox(0.012, 0.016, 0.0012, 0.0005, PE, [0, -0.019, 0.0112], [0, 0, 0], 1); ks.cyl(0.0018, 0.0018, 0.0014, PD, [0, -0.02, 0.0118], 'z', 8); }   // firing pin stop
    ks.prism([[-0.168, -0.0045], [-0.178, -0.0045], [-0.1765, -0.0015], [-0.1735, 0.0], [-0.1705, -0.001]], 0.0022, PD, [0, 0, 0], 'zy');   // GI front blade
    for (const s of [-1, 1]) ks.rbox(0.0045, 0.0052, 0.0062, 0.0008, PD, [s * 0.00475, -0.0026, 0.003], [0, 0, 0], 1);                 // rear sight (notch)
    ks.rbox(0.014, 0.0018, 0.0068, 0.0006, PD, [0, -0.0042, 0.003], [0, 0, 0], 1);
    parts.slide = part(ks, 'slide', G, [0, 0, 0]); }
  { const kh = new Kit(); kh.prism([[-0.006, -0.006], [0.004, -0.006], [0.006, 0.004], [0.012, 0.016], [0.016, 0.02], [0.0135, 0.0232], [0.008, 0.0215], [0.0, 0.016], [-0.006, 0.01]], 0.0075, PD, [0, 0, 0], 'zy', [0, 0, 0], hi ? 0.0008 : 0);
    if (hi) for (let i = 0; i < 4; i++) kh.box(0.0078, 0.0007, 0.0012, HOLE, [0, 0.0175 + i * 0.0014, 0.0145 - i * 0.0018], [0.6, 0, 0]);
    parts.hammer = part(kh, 'hammer', G, [0, -0.026, 0.022]); }
  { const km = new Kit(); km.rbox(0.0205, 0.112, 0.031, 0.002, 0x3a3b3c, [0, -0.056, -0.006], [0, 0, 0], 1); km.rbox(0.0235, 0.006, 0.036, 0.0025, PD, [0, -0.113, -0.004], [0, 0, 0], c);
    if (hi) km.cyl(0.0057, 0.0057, 0.02, COL.brass, [0, 0.002, -0.012], 'z', 10);
    parts.mag = part(km, 'mag', G, [0, -0.05, 0.028]); parts.mag.rotation.x = -0.22; parts.mag.userData.home = parts.mag.position.clone(); }
  { const kt = new Kit(); kt.rbox(0.0072, 0.013, 0.0042, 0.0016, PD, [0, -0.002, 0.004], [0, 0, 0], 1); kt.rbox(0.006, 0.003, 0.024, 0.001, PD, [0, 0.0055, 0.018], [0, 0, 0], 1);
    parts.trigger = part(kt, 'trigger', G, [0, -0.056, -0.04]); }
  return finish(G, parts, m1911Anchors(), { eyeRelief: 0.55, height: 0.018 }, 'M1911A1');
}
// loose items (FIG): the same shapes as on the weapons, rounded
function itemFig(fit) {
  const k = new Kit(); let mat = KITMAT.steel();
  if (fit === 'M16-20') m16MagFig(k, true);
  else if (fit === 'M1911-7') { k.rbox(0.0205, 0.112, 0.031, 0.002, 0x3a3b3c, [0, -0.056, 0], [0, 0, 0], 1); k.rbox(0.0235, 0.006, 0.036, 0.0025, 0x232527, [0, -0.113, 0.002], [0, 0, 0], 2); k.cyl(0.0057, 0.0057, 0.02, COL.brass, [0, 0.002, -0.006], 'z', 10); }
  else if (fit === '40mm') {
    k.lathe([[0.0195, 0], [0.0195, 0.044], [0.0205, 0.045], [0.0205, 0.05], [0.0001, 0.05]], 0x7a7d76, [0, 0, -0.025], 'z', 16);   // aluminium case with its rim
    k.lathe([[0.006, 0.0035], [0.012, 0.008], [0.0175, 0.02], [0.0195, 0.034], [0.0195, 0.055]], 0x5a5f3a, [0, 0, -0.078], 'z', 16);   // projectile (OD)
    k.lathe([[0.0001, 0], [0.004, 0.0012], [0.006, 0.0035]], 0x55585c, [0, 0, -0.078], 'z', 12);                                     // fuze tip
    k.lathe([[0.0195, 0], [0.0199, 0.0005], [0.0199, 0.0055], [0.0195, 0.006]], COL.yellow, [0, 0, -0.04], 'z', 16);
  }
  else if (fit === 'M60-belt') { for (let i = 0; i < 6; i++) beltRoundFig(k, true, 0, 0, i * 0.013, i % 5 === 4); }
  else if (fit === 'M60-barrel') {
    k.cyl(0.0125, 0.0125, 0.5, 0x27292c, [0, 0, 0.0], 'z', 14);
    k.lathe([[0.0125, 0], [0.019, 0.012], [0.0235, 0.016], [0.0235, 0.04]], 0x3b3e42, [0, 0, 0.24], 'z', 16);
    k.cyl(0.012, 0.012, 0.22, 0x3b3e42, [0, -0.03, -0.02], 'z', 12); k.rbox(0.02, 0.034, 0.03, 0.004, 0x3b3e42, [0, -0.016, -0.13], [0, 0, 0], 2);
    k.lathe([[0.0125, 0], [0.0155, 0.003], [0.0155, 0.021], [0.0125, 0.024]], 0x3b3e42, [0, 0, -0.222], 'z', 16);
    k.prism([[-0.199, 0.012], [-0.223, 0.012], [-0.216, 0.064], [-0.206, 0.064]], 0.008, 0x3b3e42, [0, 0, 0], 'zy', [0, 0, 0], 0.0012);
    k.lathe([[0.006, 0], [0.0148, 0], [0.0148, 0.02], [0.0125, 0.022]], 0x3b3e42, [0, 0, -0.27], 'z', 16);
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; k.rbox(0.0078, 0.0034, 0.04, 0.0012, 0x3b3e42, [Math.cos(a) * 0.0122, Math.sin(a) * 0.0122, -0.289], [0, 0, a + Math.PI / 2], 1); }
  }
  else if (fit === 'case556') k.lathe([[0.0001, 0], [0.0032, 0], [0.0032, 0.007], [0.0046, 0.011], [0.0048, 0.04], [0.0041, 0.0415], [0.0048, 0.043], [0.0048, 0.045], [0.0001, 0.045]], COL.brass, [0, 0, -0.0225], 'z', 10);
  else if (fit === 'case762') k.lathe([[0.0001, 0], [0.0044, 0], [0.0044, 0.009], [0.0059, 0.015], [0.006, 0.0475], [0.005, 0.0485], [0.006, 0.0495], [0.006, 0.051], [0.0001, 0.051]], COL.brass, [0, 0, -0.0255], 'z', 10);
  else if (fit === 'case45') k.lathe([[0.0001, 0], [0.006, 0], [0.006, 0.0205], [0.0052, 0.021], [0.006, 0.022], [0.006, 0.023], [0.0001, 0.023]], COL.brass, [0, 0, -0.0115], 'z', 10);
  else if (fit === 'case40') k.lathe([[0.0175, 0], [0.0195, 0], [0.0195, 0.044], [0.0205, 0.045], [0.0205, 0.05], [0.0001, 0.05]], 0x7a7d76, [0, 0, -0.025], 'z', 14);
  else if (fit === 'tube' || fit === 'M72A2') {
    const R = 0.039; mat = paintMat();
    k.lathe([[R, 0], [R, 0.86]], 0x575a3b, [0, 0, -0.445], 'z', 18); k.lathe([[R - 0.003, 0.89], [R - 0.003, 0.004]], 0x1d1e19, [0, 0, -0.445], 'z', 18);
    k.lathe([[R - 0.003, 0.004], [R - 0.002, 0], [R + 0.0015, 0], [R + 0.0026, 0.004], [R + 0.0026, 0.018], [R, 0.022]], 0x575a3b, [0, 0, -0.445], 'z', 18);
    k.lathe([[R, 0], [R + 0.0012, 0.001], [R + 0.0012, 0.029], [R, 0.03]], COL.yellow, [0, 0, -0.4], 'z', 18);
    k.lathe([[R, 0], [R + 0.0015, 0.003], [R + 0.0015, 0.027], [R, 0.03], [R - 0.003, 0.03]], 0x171717, [0, 0, 0.415], 'z', 18);
    k.rbox(0.022, 0.012, 0.13, 0.004, 0x44462e, [0, R + 0.002, -0.12], [0, 0, 0], 1);
  }
  else k.rbox(0.03, 0.03, 0.03, 0.004, 0x777777, [0, 0, 0], [0, 0, 0], 1);
  return k.mesh(mat, 'item_' + fit);
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
  if (FIG) return itemFig(fit);
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
