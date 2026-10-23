// 1980 civilian vehicles: Land Rover Series III 109 pick-up (optional canvas tilt), Toyota Hilux 4WD (RN37) pick-up,
// VW Beetle 1200 and Lada 2101. Real dimensions from civilian.js, house style (flat-shaded Lambert, small details as
// geometry, light civilian dust / wear), glass you can see out of, number plates.
// Model frame = vehiclefm's: x right, y up, nose -z, origin on the ground in the middle of the wheelbase.
// API: buildCivMesh({ spec, colour, tilt }) -> { group, shell, wheels, parts, setVariant(v), animate(look, dt) }
//   look = modelkit.lookFrom(sim); colour indexes spec.colours; tilt (Land Rover) = canvas tilt over the bed.
import * as THREE from 'three';
import { PAL, mat, glassMat, lampMat, box, cylX, cylY, cylZ, sphere, rod, tube, extrudeX, extrudeY, extrudeZ, mirrorX, builder, wheelMesh, decal, decalTex, wear, V } from './modelkit.js';
import { TYRES } from './tyre.js';

const noWear = m => { m.userData.noWear = true; return m; };
const WEAR = { dust: 0.32, mud: 0.12, grime: 0.15, yDust: 0.75, yMud: 0.32 };
const chromeM = () => mat(PAL.chrome, { emissive: 0x2a2c30 });
// a flat quad through four points (glass, panels): two triangles, double-sided materials only
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); g.computeVertexNormals(); return g;
}
const mirrorQ = (pts) => pts.map(([x, y, z]) => [-x, y, z]);
// wheel arch cut for a side profile: from the rear edge over the top to the front edge (descending z)
// (circle centre yc, cut off at the panel bottom ybot: the arc starts and ends on the bottom line)
const arch = (zc, rr, yc, n = 9, ybot = null) => {
  const a0 = ybot == null ? 0 : Math.asin(Math.max(-1, Math.min(1, (ybot - yc) / rr))), p = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI - 2 * a0) * i / n; p.push([zc + Math.cos(a) * rr, yc + Math.sin(a) * rr]); }
  return p;
};
// number plate decal
function plate(text, bg = '#f2f0e6', fg = '#151515', w = 0.52, h = 0.12) {
  const t = decalTex('plate:' + text + bg, 256, 60, (c, W, H) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H); c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(3, 3, W - 6, H - 6);
    c.fillStyle = fg; c.font = 'bold 40px "Arial Narrow", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, H / 2 + 2);
  });
  return decal(t, w, h, 1);
}
// a word on the bodywork (tailgates)
function lettering(text, color = '#e8e6dc', w = 0.8, h = 0.12) {
  const t = decalTex('let:' + text + color, 512, 80, (c, W, H) => { c.clearRect(0, 0, W, H); c.fillStyle = color; c.font = 'bold 62px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, H / 2 + 3); });
  return decal(t, w, h, 0.95);
}
// a round lamp facing -z (+z for rear): bucket, lens, chrome rim
function lamp(B, x, y, z, r, lensM, rimM, dir = -1, depth = 0.08) {
  B.add(cylZ(r * 1.08, depth, x, y, z - dir * depth / 2, 14), rimM);
  B.add(cylZ(r, 0.012, x, y, z + dir * 0.004, 14), lensM);
}

// ------------------------------------------------------------------------------------------- shared wheels and axles
function addWheels(g, spec, o, tyreM, rimM, steelD) {
  return spec.wheels.map((w) => {
    const T = TYRES[w.tyre], r = T.r, side = Math.sign(w.x);
    const corner = new THREE.Group(); corner.name = 'corner' + w.id; corner.position.set(w.x, r, w.z); g.add(corner);
    const steerG = new THREE.Group(); corner.add(steerG);
    const wm = wheelMesh({ r, w: T.w, rim: o.rim, tread: o.tread, rimR: o.rimR, studs: 5 }, side, tyreM, rimM); steerG.add(wm);
    steerG.add(new THREE.Mesh(cylX(o.rimR * 0.7, 0.03, -side * T.w * 0.42, 0, 0, 12), steelD));   // brake backing plate
    return { corner, steerG, wm, side, w, r };
  });
}
function addAxles(g, spec, wheels, steelD) {
  return spec.axles.filter(a => a.solid).map(a => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.085, 0.085), steelD); g.add(beam);
    const diff = a.driven ? new THREE.Mesh(sphere(0.13, 0, 0, 0, 10, 7).scale(1, 0.9, 1.2), steelD) : null; if (diff) g.add(diff);
    return { L: wheels[a.wheels[0]], R: wheels[a.wheels[1]], beam, diff };
  });
}
function animateWheels(wheels, axles, look) {
  for (let i = 0; i < wheels.length; i++) {
    const W = wheels[i], L = look?.wheels?.[i]; if (!L) continue;
    W.corner.position.y = W.r + L.dy - (L.flat || 0) * 0.07;
    W.steerG.rotation.y = -L.steer;
    W.wm.rotation.x = -L.spin;
    W.wm.rotation.z = W.side * (L.camber || 0) * 0.8;
  }
  for (const A of axles) {
    const a = A.L.corner.position, b = A.R.corner.position, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) - 0.2;
    A.beam.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); A.beam.rotation.z = Math.atan2(dy, dx); A.beam.scale.x = len;
    if (A.diff) A.diff.position.set((a.x + b.x) / 2 + 0.08, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }
}
// two simple seats (frame + cushion + back) for the cars without a separate interior
// wheelhouse liner behind a through-cut arch: inner wall + top, so the cabin doesn't show through the arch
function wheelHouse(B, spec, axle, m, top) {
  for (const w of spec.wheels.filter(w => w.axle === axle)) {
    const T = TYRES[w.tyre], s = Math.sign(w.x), xi = Math.abs(w.x) - T.w / 2 - 0.06;
    B.add(box(0.02, top - 0.25, T.r * 2.5, s * xi, (top + 0.25) / 2, w.z), m);
    B.add(box(Math.max(0.05, 0.84 - xi), 0.02, T.r * 2.5, s * (xi + 0.84) / 2, top, w.z), m);
  }
}
function seat(B, x, y, z, w, m, back = 0.55, bench = false) {
  B.add(box(w, 0.1, 0.48, x, y, z), m);
  B.add(box(w, back, 0.09, x, y + back / 2, z + 0.26, -0.2), m);
  if (!bench) B.add(box(w * 0.7, y - 0.25, 0.4, x, (y + 0.25) / 2, z), mat(PAL.steelDark));
}

// ------------------------------------------------------------------------------------------- Land Rover Series III 109
function buildLandRover(spec, paint, ctx) {
  const { g, B, black, steel, steelD, glass, lampW, lampA, lampR, chrome, roofM, interior } = ctx;
  const ZF = spec.wheels[0].z, ZR = spec.wheels[2].z, r = TYRES[spec.wheels[0].tyre].r;
  const FRONT = -2.10, REAR = 2.33, WX = 0.84;
  // chassis rails, outriggers and the black bumpers (Land Rover box-section chassis shows under the body)
  for (const s of [-1, 1]) B.add(box(0.07, 0.15, 4.25, s * 0.43, 0.63, 0.12), black);
  B.add(box(1.72, 0.17, 0.15, 0, 0.55, FRONT + 0.07), black);                  // front bumper (channel)
  for (const s of [-1, 1]) B.add(box(0.05, 0.08, 0.06, s * 0.3, 0.55, FRONT - 0.02), steelD);
  B.add(box(1.45, 0.13, 0.12, 0, 0.62, REAR + 0.02), black);                   // rear cross member
  B.add(box(0.12, 0.10, 0.12, 0, 0.55, REAR + 0.1), steelD);                   // tow jaw
  // grille panel (Series III: black plastic grille between the wings) with the bonnet badge
  B.add(box(0.86, 0.50, 0.04, 0, 0.88, -1.96), black);
  for (let i = 0; i < 6; i++) B.add(box(0.80, 0.022, 0.02, 0, 0.70 + i * 0.07, -1.985), mat(0x3a3c3e));
  for (let i = -5; i <= 5; i++) B.add(box(0.012, 0.42, 0.02, i * 0.07, 0.88, -1.983), mat(0x2e3032));
  B.add(box(0.30, 0.05, 0.02, 0, 1.08, -1.99), chrome);
  // front wings: flat-topped boxes with the wheel arch; headlamps in the wing fronts
  const wing = [[-1.97, 0.74], [-1.97, 1.13], [-0.86, 1.13], [-0.86, 0.72], ...arch(ZF, 0.50, 0.40, 10, 0.73)];
  const wingR = extrudeX(wing, 0.42, WX); B.add(wingR, paint); B.add(mirrorX(wingR), paint);
  for (const s of [-1, 1]) {
    B.add(tube(arch(ZF, 0.51, 0.40, 12).map(([z, y]) => [s * WX, y, z]).filter(p => p[1] > 0.72), 0.014, 12, 4), black);   // arch edge
    lamp(B, s * 0.63, 0.93, -1.975, 0.09, lampW, chrome);
    B.add(box(0.08, 0.05, 0.03, s * 0.56, 0.80, -1.985), lampA); B.add(box(0.08, 0.05, 0.03, s * 0.70, 0.80, -1.985), lampW);
    B.add(box(0.06, 0.06, 0.03, s * 0.80, 1.06, -1.0), lampA);                // side repeater
    B.add(rod([s * 0.80, 1.13, -1.6], [s * 0.86, 1.36, -1.62], 0.018), steelD); B.add(box(0.13, 0.10, 0.02, s * 0.88, 1.40, -1.62), steelD);   // wing mirror
  }
  wheelHouse(B, spec, 0, black, 1.08);
  // bonnet with the spare wheel on it (as so many 109s carried it)
  B.add(extrudeX([[-1.96, 1.13], [-0.88, 1.16], [-0.88, 1.20], [-1.96, 1.18]], -0.43, 0.43), paint);
  for (const s of [-1, 1]) B.add(box(0.02, 0.02, 1.05, s * 0.3, 1.205, -1.42), paint);
  const spare = wheelMesh({ r, w: TYRES[spec.wheels[0].tyre].w, rim: 'lr', tread: 'xc', rimR: 0.205, studs: 5 }, 1, ctx.tyreM, ctx.rimM);
  spare.rotation.z = Math.PI / 2; spare.position.set(0, 1.20 + 0.10, -1.40); g.add(spare);
  // bulkhead with the two ventilator flaps, windscreen frame
  B.add(box(2 * WX, 0.62, 0.08, 0, 0.98, -0.82), paint);
  B.add(box(2 * WX, 0.06, 0.16, 0, 1.30, -0.80), paint);
  for (const s of [-1, 1]) { B.add(box(0.55, 0.09, 0.05, s * 0.4, 1.20, -0.885), paint); B.add(box(0.52, 0.015, 0.02, s * 0.4, 1.16, -0.9), black); }
  const sw = 1.62, y0 = 1.33, y1 = 1.83, zs = -0.80;
  for (const [x0, x1] of [[-sw / 2, -sw / 2 + 0.05], [sw / 2 - 0.05, sw / 2], [-0.025, 0.025]]) B.add(box(x1 - x0, y1 - y0, 0.05, (x0 + x1) / 2, (y0 + y1) / 2, zs), paint);
  B.add(box(sw, 0.05, 0.06, 0, y1, zs), paint); B.add(box(sw, 0.04, 0.06, 0, y0, zs), paint);
  B.add(quad([-sw / 2 + 0.05, y0 + 0.02, zs], [-0.025, y0 + 0.02, zs], [-0.025, y1 - 0.025, zs], [-sw / 2 + 0.05, y1 - 0.025, zs]), glass);
  B.add(quad([0.025, y0 + 0.02, zs], [sw / 2 - 0.05, y0 + 0.02, zs], [sw / 2 - 0.05, y1 - 0.025, zs], [0.025, y1 - 0.025, zs]), glass);
  for (const x of [-0.45, 0.35]) B.add(rod([x, y0 + 0.03, zs - 0.03], [x + 0.25, y0 + 0.28, zs - 0.035], 0.012), black);   // wipers (bottom-hung)
  // cab: doors (lower panel + window frame), sills, rear wall with its window, the white roof
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? WX - 0.03 : -WX, x1 = s > 0 ? WX : -WX + 0.03;
    B.add(extrudeX([[-0.78, 0.72], [-0.78, 1.32], [0.08, 1.32], [0.08, 0.72]], x0, x1), paint);
    // door top: frame around sliding glass
    B.add(box(0.03, 0.04, 0.84, s * (WX - 0.015), 1.88, -0.35), paint);
    for (const z of [-0.77, 0.07, -0.33]) B.add(box(0.03, 0.56, 0.035, s * (WX - 0.015), 1.60, z), paint);
    B.add(quad([s * WX, 1.33, -0.75], [s * WX, 1.33, 0.05], [s * WX, 1.86, 0.05], [s * WX, 1.86, -0.75]), glass);
    // door seam, exposed hinges, handle, sill
    B.add(box(0.012, 0.6, 0.012, s * (WX + 0.002), 1.02, -0.78), black); B.add(box(0.012, 0.6, 0.012, s * (WX + 0.002), 1.02, 0.08), black);
    for (const y of [0.88, 1.22]) B.add(box(0.03, 0.07, 0.06, s * (WX + 0.01), y, -0.79), steelD);
    B.add(box(0.03, 0.03, 0.10, s * (WX + 0.012), 1.25, -0.02), chrome);
    B.add(box(0.06, 0.08, 0.84, s * (WX - 0.02), 0.68, -0.35), black);
  }
  // cab back around its window (paint outside, dark trim inside)
  const { trim, floorM } = ctx;
  B.add(box(2 * WX, 0.75, 0.05, 0, 1.175, 0.10), paint); B.add(box(2 * WX, 0.13, 0.05, 0, 1.935, 0.10), paint);
  for (const s of [-1, 1]) B.add(box(WX - 0.45, 0.32, 0.05, s * (WX + 0.45) / 2, 1.71, 0.10), paint);
  B.add(box(2 * WX - 0.08, 0.73, 0.012, 0, 1.18, 0.07), trim);
  for (const s of [-1, 1]) {
    B.add(box(0.012, 0.56, 0.82, s * (WX - 0.035), 1.03, -0.35), trim);                  // door cards
    B.add(box(0.04, 0.02, 0.82, s * (WX - 0.05), 1.31, -0.35), trim);
  }
  B.add(box(2 * WX - 0.08, 0.50, 0.012, 0, 1.03, -0.775), trim);                        // bulkhead, cab side
  B.add(box(0.22, 0.08, 0.7, 0, 0.80, -0.40), floorM);                                   // gearbox tunnel
  B.add(quad([-0.45, 1.55, 0.072], [0.45, 1.55, 0.072], [0.45, 1.85, 0.072], [-0.45, 1.85, 0.072]), glass);
  B.add(box(2 * WX + 0.04, 0.06, 0.98, 0, 1.92, -0.35), roofM);                        // roof (Limestone)
  B.add(box(2 * WX - 0.06, 0.10, 0.92, 0, 1.97, -0.35), roofM);
  B.add(box(2 * WX, 0.08, 0.06, 0, 1.86, -0.83), roofM);
  // floor, dash rail, seats (bench for three)
  B.add(box(2 * WX - 0.06, 0.04, 0.9, 0, 0.74, -0.35), mat(0x2f3232));
  B.add(box(2 * WX - 0.1, 0.16, 0.13, 0, 1.18, -0.715), ctx.trim);                     // dash, face just ahead of the binnacle
  seat(interior, 0, 0.84, -0.18, 1.5, mat(PAL.vinyl), 0.5, true);
  // rear tub (pick-up): sides with the wheel arches, floor, front wall, tailgate, rope cleats
  const tub = [[0.14, 0.78], [0.14, 1.28], [REAR, 1.28], [REAR, 0.78], ...arch(ZR, 0.50, 0.40, 10, 0.78)];
  const tubR = extrudeX(tub, WX - 0.035, WX); B.add(tubR, paint); B.add(mirrorX(tubR), paint);
  for (const s of [-1, 1]) {
    B.add(box(0.06, 0.035, REAR - 0.14, s * (WX - 0.02), 1.285, (REAR + 0.14) / 2), paint);   // capping rail
    B.add(tube(arch(ZR, 0.51, 0.40, 12).map(([z, y]) => [s * WX, y, z]).filter(p => p[1] > 0.78), 0.014, 12, 4), black);
    B.add(box(0.36, 0.30, 0.90, s * 0.6, 0.93, ZR), paint);                                // wheel boxes inside the tub
    for (const z of [0.5, 1.2, 1.9]) B.add(box(0.03, 0.04, 0.08, s * (WX + 0.01), 1.22, z), steelD);   // rope cleats
    B.add(box(0.06, 0.12, 0.05, s * 0.72, 0.98, REAR + 0.03), lampR); B.add(box(0.06, 0.06, 0.05, s * 0.72, 0.88, REAR + 0.03), lampA);
  }
  B.add(box(2 * WX - 0.06, 0.04, REAR - 0.16, 0, 0.80, (REAR + 0.16) / 2), mat(0x5a5c58));   // aluminium floor
  B.add(box(2 * WX, 0.50, 0.04, 0, 1.03, 0.14), paint);
  B.add(box(2 * WX - 0.08, 0.48, 0.04, 0, 1.03, REAR), paint);                              // tailgate
  for (const s of [-1, 1]) B.add(box(0.05, 0.06, 0.05, s * 0.74, 1.24, REAR + 0.02), steelD);   // tailgate chains / pins
  // markings: plates
  const pf = plate('KXA 409F', '#f2f0e6', '#151515', 0.5, 0.11); pf.position.set(0, 0.55, FRONT - 0.005); pf.rotation.y = Math.PI; g.add(pf);
  const pr = plate('KXA 409F', '#e8c838', '#151515', 0.5, 0.11); pr.position.set(-0.3, 0.97, REAR + 0.025); g.add(pr);
  const badge = lettering('LAND-ROVER', '#e8e6dc', 0.42, 0.06); badge.position.set(0, 1.08, -1.995); badge.rotation.y = Math.PI; g.add(badge);
  // tilt: three hoops and a canvas cover over the tub (variant)
  const tilt = new THREE.Group(); tilt.name = 'tilt'; g.add(tilt);
  const TB = builder({ dust: 0.3, mud: 0, yDust: 99, grime: 0.3 }), canvas = mat(0x9a8f6a), canvasD = mat(0x857b5a);
  for (const z of [0.3, 1.2, 2.2]) TB.add(tube([[-WX, 1.28, z], [-WX, 1.96, z], [-WX + 0.1, 2.04, z], [WX - 0.1, 2.04, z], [WX, 1.96, z], [WX, 1.28, z]], 0.014, 14, 5), steelD);
  TB.add(extrudeX([[0.12, 2.0], [REAR + 0.02, 2.0], [REAR + 0.02, 2.05], [0.12, 2.05]], -WX - 0.01, WX + 0.01), canvas);
  for (const s of [-1, 1]) TB.add(extrudeX([[0.12, 1.28], [0.12, 2.0], [REAR + 0.02, 2.0], [REAR + 0.02, 1.28]], s > 0 ? WX : -WX - 0.012, s > 0 ? WX + 0.012 : -WX), canvasD);
  TB.add(box(2 * WX, 0.6, 0.012, 0, 1.70, REAR + 0.02), canvasD);
  TB.build(tilt, 'tiltCanvas');
  return { parts: { tilt, spare }, setVariant: v => { tilt.visible = v.tilt !== false; } };
}

// ------------------------------------------------------------------------------------------- Toyota Hilux 4WD (RN37)
function buildHilux(spec, paint, ctx) {
  const { g, B, black, steelD, glass, lampW, lampA, lampR, chrome, interior } = ctx;
  const ZF = spec.wheels[0].z, ZR = spec.wheels[2].z;
  const FRONT = -2.09, REAR = 2.31, WX = 0.82, HOOD = 1.05, CAB0 = -0.95, CAB1 = 0.30, ROOF = 1.70, BED0 = 0.38;
  // ladder frame visible under the body; leaf springs suggested by the axle beams (animated)
  for (const s of [-1, 1]) B.add(box(0.07, 0.14, 4.0, s * 0.45, 0.50, 0.15), black);
  // front clip: one block from the grille to the windscreen base, wheel arch cut through
  const front = [[FRONT + 0.06, 0.53], [FRONT + 0.04, 0.98], [FRONT + 0.12, 1.01], [CAB0 + 0.15, HOOD], [CAB0 + 0.15, 0.53], ...arch(ZF, 0.47, 0.38, 10, 0.53)];
  // a shell, not a block: side skins, the hood, the front panel, an engine-bay floor (the cabin is hollow, below)
  const XI = WX - 0.03, { trim, floorM, headM } = ctx;
  const fskin = extrudeX(front, XI, WX); B.add(fskin, paint); B.add(mirrorX(fskin), paint);
  B.add(extrudeX([[FRONT + 0.04, 0.98], [FRONT + 0.12, 1.01], [CAB0, HOOD], [CAB0, HOOD - 0.04], [FRONT + 0.12, 0.97], [FRONT + 0.04, 0.94]], -XI, XI), paint);   // hood
  B.add(box(2 * XI, 0.45, 0.03, 0, 0.755, FRONT + 0.07), paint);
  B.add(box(2 * XI, 0.03, CAB0 - FRONT, 0, 0.53, (FRONT + CAB0) / 2), black);
  for (const s of [-1, 1]) {
    B.add(tube(arch(ZF, 0.48, 0.38, 12).map(([z, y]) => [s * WX, y, z]).filter(p => p[1] > 0.53), 0.016, 12, 4), black);   // arch flare
    B.add(box(0.01, 0.025, 0.95, s * 0.36, HOOD + 0.005, -1.48), paint);                                                   // hood shut lines
  }
  B.add(box(0.74, 0.012, 0.012, 0, HOOD + 0.005, CAB0 + 0.04), black);
  // grille: black panel, horizontal chrome bars, round headlamps in square bezels
  B.add(box(1.46, 0.28, 0.03, 0, 0.81, FRONT + 0.035), black);
  for (let i = 0; i < 4; i++) B.add(box(0.74, 0.022, 0.02, 0, 0.72 + i * 0.06, FRONT + 0.015), chrome);
  for (const s of [-1, 1]) {
    B.add(box(0.24, 0.24, 0.03, s * 0.57, 0.81, FRONT + 0.02), chrome);
    lamp(B, s * 0.57, 0.81, FRONT + 0.005, 0.085, lampW, black, -1, 0.03);
    B.add(box(0.16, 0.05, 0.03, s * 0.58, 0.64, FRONT + 0.03), lampA);
    B.add(box(0.05, 0.05, 0.02, s * 0.81, 0.86, -1.95), lampA);
  }
  const toy = lettering('TOYOTA', '#d8dade', 0.36, 0.05); toy.position.set(0, 0.935, FRONT + 0.012); toy.rotation.y = Math.PI; g.add(toy);
  B.add(box(1.64, 0.10, 0.10, 0, 0.56, FRONT - 0.02), chrome);                         // front bumper
  for (const s of [-1, 1]) B.add(box(0.04, 0.10, 0.06, s * 0.45, 0.48, FRONT + 0.05), black);
  wheelHouse(B, spec, 0, black, 0.98);
  // cab lower (doors), with seams, handles, the drip rail
  const cskin = extrudeX([[CAB0 + 0.15, 0.53], [CAB0 + 0.15, HOOD], [CAB1, HOOD], [CAB1, 0.53]], XI, WX); B.add(cskin, paint); B.add(mirrorX(cskin), paint);
  B.add(box(2 * XI, HOOD - 0.53, 0.03, 0, (HOOD + 0.53) / 2, CAB1 - 0.02), paint);            // cab back, lower
  // the cabin: floor, tunnel, firewall, dash (face just ahead of the binnacle), dark door cards, back trim, headliner
  B.add(box(2 * XI, 0.03, CAB1 - CAB0, 0, 0.625, (CAB0 + CAB1) / 2), floorM);
  B.add(box(0.26, 0.10, 0.9, 0, 0.69, -0.45), floorM);
  B.add(box(2 * XI, HOOD - 0.62, 0.03, 0, (HOOD + 0.62) / 2, CAB0 + 0.01), trim);
  B.add(extrudeX([[CAB0 + 0.02, 0.78], [CAB0 + 0.02, 1.055], [-0.72, 1.085], [-0.515, 1.07], [-0.515, 0.78]], -XI, XI), trim);
  for (const s of [-1, 1]) {
    B.add(box(0.012, HOOD - 0.63, CAB1 - CAB0 - 0.02, s * (XI - 0.006), (HOOD + 0.63) / 2, (CAB0 + CAB1) / 2 - 0.01), trim);
    B.add(box(0.09, 0.025, CAB1 - CAB0 - 0.02, s * (XI - 0.015), HOOD + 0.008, (CAB0 + CAB1) / 2 - 0.01), trim);
    B.add(box(0.03, 0.03, 0.18, s * (XI - 0.025), 0.90, -0.15), mat(0x6a6460));
  }
  B.add(box(2 * XI, 1.18 - 0.63, 0.012, 0, (1.18 + 0.63) / 2, CAB1 - 0.05), trim);            // back trim below the window
  for (const s of [-1, 1]) B.add(box(0.24, ROOF - 1.18, 0.012, s * 0.64, (ROOF + 1.18) / 2, CAB1 - 0.05), trim);
  B.add(box(1.06, ROOF - 1.57, 0.012, 0, (ROOF + 1.57) / 2, CAB1 - 0.05), trim);
  B.add(box(2 * 0.72 - 0.06, 0.01, CAB1 - 0.06 + 0.46, 0, ROOF - 0.04, (CAB1 - 0.06 - 0.46) / 2), headM);
  for (const s of [-1, 1]) {
    for (const z of [-0.88, 0.22]) B.add(box(0.012, 0.50, 0.012, s * (WX + 0.002), 0.80, z), black);
    B.add(box(0.025, 0.025, 0.11, s * (WX + 0.01), 0.98, 0.10), chrome);
    B.add(rod([s * 0.80, 1.07, -0.82], [s * 0.95, 1.20, -0.86], 0.02), black); B.add(box(0.04, 0.13, 0.11, s * 0.97, 1.22, -0.86), black);   // door mirror
  }
  // greenhouse: pillars, roof, glass (tumblehome: 0.78 at the waist, 0.72 at the roof)
  const wW = 0.80, wR = 0.72, zWS = -0.48;
  for (const s of [-1, 1]) {
    B.add(rod([s * wW, HOOD, CAB0 + 0.02], [s * wR, ROOF, zWS], 0.06), paint);           // A pillar
    B.add(rod([s * wW, HOOD, CAB1 - 0.04], [s * wR, ROOF, CAB1 - 0.06], 0.10), paint);   // B / C pillar (cab back corner)
    B.add(quad([s * wW, HOOD + 0.02, CAB0 + 0.06], [s * wW, HOOD + 0.02, CAB1 - 0.1], [s * wR, ROOF - 0.03, CAB1 - 0.1], [s * wR, ROOF - 0.03, zWS + 0.04]), glass);
  }
  B.add(extrudeY([[-wR, zWS], [wR, zWS], [wR, CAB1 - 0.04], [-wR, CAB1 - 0.04]], ROOF - 0.03, ROOF + 0.01), paint);
  B.add(quad([-wW + 0.04, HOOD + 0.02, CAB0 + 0.03], [wW - 0.04, HOOD + 0.02, CAB0 + 0.03], [wR - 0.04, ROOF - 0.03, zWS + 0.01], [-wR + 0.04, ROOF - 0.03, zWS + 0.01]), glass);
  B.add(box(2 * wW, 0.05, 0.06, 0, HOOD + 0.02, CAB0 + 0.02), black);                  // cowl / wiper recess
  for (const x of [-0.4, 0.3]) B.add(rod([x, HOOD + 0.05, CAB0 + 0.05], [x + 0.32, HOOD + 0.07, CAB0 + 0.02], 0.012), black);
  // cab back wall around the rear window
  B.add(box(2 * wW, 1.20 - HOOD, 0.04, 0, (1.20 + HOOD) / 2, CAB1 - 0.02), paint);
  for (const s of [-1, 1]) B.add(box(0.27, 0.37, 0.04, s * 0.625, 1.375, CAB1 - 0.02), paint);
  B.add(box(2 * wR, ROOF - 1.55, 0.04, 0, (ROOF + 1.55) / 2, CAB1 - 0.02), paint);
  B.add(quad([-0.5, 1.20, CAB1 + 0.004], [0.5, 1.20, CAB1 + 0.004], [0.46, 1.55, CAB1 + 0.004], [-0.46, 1.55, CAB1 + 0.004]), glass);
  // bench seat
  seat(interior, 0, 0.78, -0.12, 1.45, mat(0x5a4632), 0.52, true);
  // bed: sides with arches, floor, front wall, tailgate with the stamped name, tail lights, rear step bumper
  const bed = [[BED0, 0.62], [BED0, 1.17], [REAR, 1.17], [REAR, 0.62], ...arch(ZR, 0.47, 0.38, 10, 0.62)];
  const bedR = extrudeX(bed, WX - 0.035, WX); B.add(bedR, paint); B.add(mirrorX(bedR), paint);
  for (const s of [-1, 1]) {
    B.add(box(0.07, 0.035, REAR - BED0, s * (WX - 0.02), 1.175, (REAR + BED0) / 2), paint);
    B.add(tube(arch(ZR, 0.48, 0.38, 12).map(([z, y]) => [s * WX, y, z]).filter(p => p[1] > 0.62), 0.016, 12, 4), black);
    B.add(box(0.30, 0.26, 0.86, s * 0.62, 0.86, ZR), paint);
    B.add(box(0.07, 0.28, 0.04, s * 0.76, 0.92, REAR + 0.02), lampR); B.add(box(0.07, 0.07, 0.04, s * 0.76, 0.74, REAR + 0.02), lampW);
    B.add(box(0.012, 0.012, 1.6, s * (WX + 0.003), 0.98, 1.3), black);                   // side swage line
  }
  B.add(box(2 * WX - 0.06, 0.04, REAR - BED0, 0, 0.80, (REAR + BED0) / 2), mat(0x3a3a38));
  B.add(box(2 * WX, 0.55, 0.04, 0, 0.90, BED0), paint);
  B.add(box(2 * WX - 0.08, 0.53, 0.04, 0, 0.90, REAR), paint);
  const tg = lettering('TOYOTA', '#e8e6dc', 0.9, 0.14); tg.position.set(0, 1.0, REAR + 0.022); g.add(tg);
  B.add(box(1.58, 0.11, 0.14, 0, 0.56, REAR + 0.06), chrome);                          // step bumper
  const pf = plate('JL-62-41', '#f2f0e6', '#151515', 0.48, 0.11); pf.position.set(0, 0.56, FRONT - 0.075); pf.rotation.y = Math.PI; g.add(pf);
  const pr = plate('JL-62-41', '#f2f0e6', '#151515', 0.48, 0.11); pr.position.set(0, 0.74, REAR + 0.025); g.add(pr);
  return { parts: {}, setVariant() {} };
}

// ------------------------------------------------------------------------------------------- VW Beetle 1200
// superellipse ring from the right side (belt) over the roof to the left side
function ring(z, yb, yt, w, n, N = 14) {
  const p = [];
  for (let i = 0; i <= N; i++) { const a = Math.PI * i / N, c = Math.cos(a), s = Math.sin(a); p.push([w * Math.sign(c) * Math.abs(c) ** (2 / n), yb + (yt - yb) * Math.abs(s) ** (2 / n), z]); }
  return p;
}
// loft that sorts each quad into a material bucket via matFn(centre) -> 0 paint / 1 glass
function loftSplit(rings, matFn) {
  const buckets = [[], []], put = (m, ...pts) => pts.forEach(p => buckets[m].push(p[0], p[1], p[2]));
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length - 1; k++) {
    const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k + 1], d = rings[r + 1][k];
    const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cy = (a[1] + b[1] + c[1] + d[1]) / 4, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
    const m = matFn(cx, cy, cz); put(m, a, b, c); put(m, a, c, d);
  }
  return buckets.map(arr => { if (!arr.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; });
}
const fanCap = (R, centre) => { const arr = []; for (let k = 0; k < R.length - 1; k++) arr.push(...R[k], ...R[k + 1], ...centre); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; };
const lerpT = (pts, z) => { if (z <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return y0 + (y1 - y0) * (z - z0) / (z1 - z0); } return pts[pts.length - 1][1]; };
function buildBeetle(spec, paint, ctx) {
  const { g, B, black, steelD, glass, lampW, lampA, lampR, chrome, interior } = ctx;
  // body stations [z, yb, yt, half width, roundness]
  const ST = [
    [-1.96, 0.56, 0.64, 0.34, 2.2], [-1.88, 0.50, 0.78, 0.52, 2.5], [-1.70, 0.47, 0.87, 0.60, 2.8], [-1.48, 0.46, 0.93, 0.64, 3], [-1.28, 0.46, 0.98, 0.66, 3],
    [-1.06, 0.46, 1.22, 0.70, 3], [-0.82, 0.46, 1.42, 0.73, 3.2], [-0.55, 0.46, 1.48, 0.74, 3.2], [-0.20, 0.46, 1.50, 0.75, 3.2], [0.22, 0.46, 1.50, 0.75, 3.2],
    [0.34, 0.46, 1.49, 0.75, 3.2], [0.70, 0.46, 1.43, 0.74, 3.1], [0.95, 0.46, 1.33, 0.72, 3], [1.12, 0.46, 1.22, 0.70, 3], [1.30, 0.46, 1.09, 0.68, 3],
    [1.55, 0.46, 0.98, 0.66, 2.9], [1.80, 0.45, 0.85, 0.62, 2.6], [1.98, 0.44, 0.70, 0.54, 2.3], [2.06, 0.46, 0.58, 0.36, 2.1],
  ];
  const rings = ST.map(([z, yb, yt, w, n]) => ring(z, yb, yt, w, n));
  const isGlass = (x, y, z) => {
    if (z > -1.07 && z < -0.82 && y > 1.0 && Math.abs(x) < 0.62) return 1;                         // windscreen
    if (z > -0.80 && z < 0.93 && y > 1.03 && y < 1.40 && Math.abs(x) > 0.5 && !(z > 0.22 && z < 0.34)) return 1;   // door + quarter windows
    if (z > 0.95 && z < 1.30 && y > 1.06 && y < 1.32 && Math.abs(x) < 0.40) return 1;               // rear window
    return 0;
  };
  const [bodyG, glassG] = loftSplit(rings, isGlass);
  B.add(bodyG, paint); if (glassG) B.add(glassG, glass);
  B.add(fanCap(rings[0], [0, 0.56, -1.98]), paint); B.add(fanCap(rings[rings.length - 1].slice().reverse(), [0, 0.50, 2.08]), paint);
  // floor pan and sills under the doors
  B.add(box(1.24, 0.06, 3.9, 0, 0.36, 0.05), mat(0x2c2c2a));
  for (const s of [-1, 1]) B.add(box(0.04, 0.11, 1.9, s * 0.66, 0.42, -0.05), paint);
  // the cabin: front bulkhead (the luggage space is ahead of it), kick panels, tunnel, dark door cards, rear bulkhead
  // (the engine is behind it), parcel shelf and a headliner following the roof
  {
    const { trim, floorM, headM } = ctx;
    B.add(box(1.30, 0.62, 0.03, 0, 0.67, -1.0), trim);
    B.add(box(0.16, 0.10, 1.85, 0, 0.44, -0.05), floorM);
    for (const s of [-1, 1]) {
      B.add(box(0.012, 0.60, 0.20, s * 0.675, 0.68, -0.90), trim);
      // the fenders' inner edges (x 0.56) reach past the firewall into the footwell and under the rear seat: cover them
      B.add(box(0.012, 0.64, 0.32, s * 0.545, 0.68, -0.86), trim); B.add(box(0.13, 0.012, 0.32, s * 0.61, 1.0, -0.86), trim);
      B.add(box(0.15, 0.66, 0.012, s * 0.61, 0.69, -0.70), trim);                                    // close the pocket's open back
      B.add(box(0.012, 0.50, 0.34, s * 0.545, 0.62, 0.88), trim);
      B.add(box(0.012, 0.66, 1.08, s * 0.685, 0.725, -0.26), trim);
      B.add(box(0.05, 0.015, 1.08, s * 0.69, 1.055, -0.26), trim);
      B.add(box(0.012, 0.64, 0.80, s * 0.68, 0.72, 0.72), trim);
      B.add(box(0.03, 0.03, 0.16, s * 0.665, 0.84, -0.3), mat(0x6a6460));
      B.add(box(0.09, 0.012, 1.9, s * 0.635, 0.479, -0.05), trim);                    // sill tread plate (inside)
      B.add(box(0.012, 0.09, 1.9, s * 0.637, 0.43, -0.05), trim);
    }
    B.add(box(1.30, 0.66, 0.03, 0, 0.71, 1.15), trim);
    B.add(box(1.10, 0.02, 0.22, 0, 1.03, 1.05), trim);
    const head = [];
    for (let r = 6; r <= 12; r++) head.push(rings[r].slice(4, 11).map(([x, y, z]) => [x * 0.95, 0.46 + (y - 0.46) * 0.975, z]));
    const [hg] = loftSplit(head, () => 0); B.add(hg, headM);
  }
  // fenders: lofted strips over the wheels (separate, bolted on, with a bead)
  const fender = (prof, z0, z1, n = 12) => {
    const rs = []; for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n, yt = lerpT(prof, z), lo = Math.max(0.40, yt - 0.24);
      rs.push([[0.56, yt - 0.03, z], [0.62, yt + 0.02, z], [0.70, yt + 0.035, z], [0.755, yt - 0.005, z], [0.778, yt - 0.08, z], [0.775, lo, z]]); }
    return extrudeLoft(rs);
  };
  const extrudeLoft = (rs) => { const arr = []; for (let r = 0; r < rs.length - 1; r++) for (let k = 0; k < rs[r].length - 1; k++) { const a = rs[r][k], b = rs[r][k + 1], c = rs[r + 1][k + 1], d = rs[r + 1][k]; arr.push(...a, ...b, ...c, ...a, ...c, ...d); } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals(); return geo; };
  const FF = [[-2.0, 0.50], [-1.88, 0.66], [-1.62, 0.79], [-1.38, 0.84], [-1.2, 0.85], [-1.0, 0.80], [-0.86, 0.66], [-0.74, 0.43]];
  const RF = [[0.74, 0.43], [0.88, 0.66], [1.02, 0.80], [1.2, 0.86], [1.42, 0.85], [1.65, 0.79], [1.88, 0.66], [2.02, 0.50]];
  for (const [prof, z0, z1] of [[FF, -2.0, -0.74], [RF, 0.74, 2.02]]) { const fg = fender(prof, z0, z1); B.add(fg, paint); B.add(mirrorX(fg), paint); }
  for (const s of [-1, 1]) {
    // running boards (black rubber tread on a steel board)
    B.add(box(0.17, 0.035, 1.5, s * 0.70, 0.40, 0), black);
    // headlamps on the front fenders, tail lights ("elephant feet") on the rear fenders
    const hx = s * 0.63, hy = 0.84, hz = -1.62;
    B.add(cylZ(0.095, 0.22, hx, hy - 0.02, hz + 0.05, 14, 0.06), paint);
    B.add(cylZ(0.088, 0.012, hx, hy, hz - 0.065, 14), lampW); B.add(new THREE.TorusGeometry(0.09, 0.008, 4, 16).translate(hx, hy, hz - 0.065), chrome);
    B.add(box(0.05, 0.04, 0.05, s * 0.50, 0.72, -1.93), lampA);                          // indicators on the front valance
    B.add(box(0.09, 0.15, 0.07, s * 0.66, 0.72, 1.80, -0.35), lampR); B.add(box(0.09, 0.04, 0.071, s * 0.66, 0.64, 1.83, -0.35), lampA);
    // door seams, handles, quarter-window pillar
    B.add(box(0.012, 0.55, 0.012, s * 0.745, 0.80, -0.80), black); B.add(box(0.012, 0.55, 0.012, s * 0.745, 0.80, 0.28), black);
    B.add(box(0.02, 0.025, 0.10, s * 0.75, 1.0, 0.18), chrome);
    B.add(box(0.03, 0.02, 1.5, s * 0.735, 0.70, -0.25), chrome);                        // side trim strip
    // bumper overriders
    for (const z of [-2.02, 2.12]) B.add(box(0.045, 0.16, 0.05, s * 0.42, 0.50, z), chrome);
  }
  // blade bumpers on their irons
  for (const z of [-2.03, 2.13]) { B.add(box(1.52, 0.09, 0.05, 0, 0.47, z), chrome); for (const s of [-1, 1]) B.add(box(0.05, 0.05, 0.14, s * 0.45, 0.45, z + Math.sign(z) * -0.08), steelD); }
  // front hood: chrome centre strip and the badge; engine lid louvres, handle, plate light
  B.add(box(0.03, 0.012, 0.52, 0, 0.955, -1.55, -0.18), chrome);
  B.add(cylZ(0.05, 0.02, 0, 0.78, -1.93, 16), chrome);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) B.add(box(0.16, 0.012, 0.03, s * 0.12, 0.98 - i * 0.035, 1.60 + i * 0.04, 0.6), black);
  B.add(box(0.12, 0.03, 0.04, 0, 0.82, 1.90), chrome);
  B.add(box(0.12, 0.04, 0.05, 0, 0.70, 2.0), chrome);
  B.add(cylZ(0.025, 0.16, 0.28, 0.40, 2.12, 8), steelD); B.add(cylZ(0.025, 0.16, -0.28, 0.40, 2.12, 8), steelD);   // twin tailpipes
  // wipers, mirror
  for (const x of [-0.35, 0.2]) B.add(rod([x, 1.0, -1.10], [x + 0.30, 1.03, -1.10], 0.012), black);
  B.add(rod([-0.71, 1.05, -0.82], [-0.82, 1.12, -0.82], 0.02), chrome); B.add(cylX(0.055, 0.02, -0.84, 1.13, -0.82, 12), chrome);
  // interior: dash and the four seats
  B.add(box(1.16, 0.13, 0.12, 0, 0.945, -0.935), ctx.trim);   // dash, face just ahead of the binnacle (-0.862)
  const sm = mat(0x3a2f28);
  seat(interior, -0.33, 0.58, -0.05, 0.46, sm, 0.55); seat(interior, 0.33, 0.58, -0.05, 0.46, sm, 0.55); seat(interior, 0, 0.56, 0.74, 1.0, sm, 0.42, true);
  const pf = plate('VW 1200', '#f2f0e6', '#151515', 0.46, 0.10); pf.position.set(0, 0.60, -2.0); pf.rotation.y = Math.PI; g.add(pf);
  const pr = plate('DK 54-17', '#f2f0e6', '#151515', 0.36, 0.13); pr.position.set(0, 0.78, 2.005); pr.rotation.x = -0.35; g.add(pr);
  return { parts: {}, setVariant() {} };
}

// ------------------------------------------------------------------------------------------- Lada 2101
function buildLada(spec, paint, ctx) {
  const { g, B, black, steelD, glass, lampW, lampA, lampR, chrome, interior } = ctx;
  const ZF = spec.wheels[0].z, ZR = spec.wheels[2].z;
  const FRONT = -2.02, REAR = 2.05, WX = 0.805, BELT = 0.92, ROOF = 1.40;
  // lower body: one extrusion with both arches cut
  const body = [[FRONT, 0.36], [FRONT - 0.01, 0.80], [FRONT + 0.06, 0.875], [-0.95, BELT], [1.22, BELT], [REAR - 0.05, 0.90], [REAR, 0.80], [REAR, 0.36],
    ...arch(ZR, 0.36, 0.32, 10, 0.30), ...arch(ZF, 0.36, 0.32, 10, 0.30)];
  // the body is a shell: two side skins with the arches, a bonnet and a boot lid, the front and rear panels, an
  // engine-bay floor and a hollow cabin (floor, tunnel, firewall, dash, dark door cards, headliner)
  const skin = extrudeX(body, WX - 0.03, WX); B.add(skin, paint); B.add(mirrorX(skin), paint);
  const XI = WX - 0.03, { trim, floorM, headM } = ctx;
  B.add(extrudeX([[FRONT + 0.06, 0.875], [-0.95, BELT], [-0.95, BELT - 0.04], [FRONT + 0.06, 0.835]], -XI, XI), paint);          // bonnet
  B.add(extrudeX([[1.22, BELT], [REAR - 0.05, 0.90], [REAR - 0.05, 0.86], [1.22, BELT - 0.04]], -XI, XI), paint);               // boot lid
  B.add(box(2 * XI, 0.48, 0.03, 0, 0.60, FRONT + 0.02), paint); B.add(box(2 * XI, 0.48, 0.03, 0, 0.60, REAR - 0.02), paint);  // front / rear panels
  B.add(box(2 * XI, 0.03, -0.95 - FRONT, 0, 0.36, (FRONT - 0.95) / 2), black); B.add(box(2 * XI, 0.03, REAR - 1.22, 0, 0.36, (REAR + 1.22) / 2), black);
  B.add(box(2 * XI, 0.03, 2.17, 0, 0.345, 0.135), floorM);                                     // cabin floor
  B.add(box(0.26, 0.11, 1.6, 0, 0.415, -0.15), floorM);                                        // transmission tunnel
  B.add(box(2 * XI, 0.56, 0.03, 0, 0.64, -0.95), trim);                                        // firewall
  B.add(extrudeX([[-0.95, 0.55], [-0.95, 0.915], [-0.78, 0.955], [-0.60, 0.95], [-0.60, 0.55]], -XI, XI), trim);   // dash, face just ahead of the binnacle
  B.add(box(0.3, 0.2, 0.3, 0, 0.55, -0.75), trim);                                             // centre console under the dash
  for (const s of [-1, 1]) {
    B.add(box(0.012, BELT - 0.38, 2.14, s * (XI - 0.006), (BELT + 0.38) / 2, 0.135), trim);    // door cards / rear side trim
    B.add(box(0.04, 0.02, 2.14, s * (XI - 0.02), BELT - 0.005, 0.135), trim);                  // window sill
    for (const z of [-0.45, 0.55]) B.add(box(0.03, 0.03, 0.18, s * (XI - 0.025), 0.80, z), mat(0x6a6460));   // door pulls
  }
  B.add(box(2 * XI, BELT - 0.38, 0.03, 0, (BELT + 0.38) / 2, 1.22), trim);                     // behind the rear seat
  B.add(box(2 * XI, 0.02, 0.4, 0, BELT - 0.01, 1.03), trim);                                   // parcel shelf
  B.add(box(2 * 0.65, 0.01, 1.18, 0, ROOF - 0.03, 0.18), headM);                               // headliner
  for (const s of [-1, 1]) {
    for (const zc of [ZF, ZR]) B.add(tube(arch(zc, 0.365, 0.32, 12).map(([z, y]) => [s * WX, y, z]), 0.01, 12, 4), black);
    // door seams (front / rear door), handles, the chrome side moulding
    for (const z of [-0.93, 0.16, 0.98]) B.add(box(0.012, 0.56, 0.012, s * (WX + 0.002), 0.62, z), black);
    for (const z of [0.0, 0.85]) B.add(box(0.022, 0.025, 0.10, s * (WX + 0.01), 0.84, z), chrome);
    B.add(box(0.02, 0.025, 3.6, s * (WX + 0.008), 0.66, 0.02), chrome);
    B.add(box(0.012, 0.012, 2.1, s * (WX + 0.002), BELT - 0.01, 0.13), black);
  }
  // hood and boot lid shut lines
  for (const s of [-1, 1]) { B.add(box(0.01, 0.012, 0.95, s * 0.66, 0.905, -1.48), black); B.add(box(0.01, 0.012, 0.75, s * 0.66, 0.925, 1.64), black); }
  B.add(box(1.32, 0.012, 0.01, 0, 0.92, -0.98), black); B.add(box(1.32, 0.012, 0.01, 0, 0.93, 1.26), black);
  wheelHouse(B, spec, 0, black, 0.80); wheelHouse(B, spec, 1, black, 0.80);
  // greenhouse: pillars, roof, glass
  const wW = 0.76, wR = 0.67, zA = -0.42, zC = 0.78;
  for (const s of [-1, 1]) {
    B.add(rod([s * wW, BELT, -0.93], [s * wR, ROOF, zA], 0.055), paint);
    B.add(rod([s * (wW - 0.01), BELT, 0.18], [s * wR, ROOF, 0.18], 0.07), paint);
    B.add(rod([s * (wW - 0.01), BELT, 1.20], [s * wR, ROOF, zC], 0.11), paint);
    B.add(quad([s * wW, BELT + 0.01, -0.88], [s * (wW - 0.01), BELT + 0.01, 0.14], [s * wR, ROOF - 0.02, 0.14], [s * wR, ROOF - 0.02, zA + 0.04]), glass);
    B.add(quad([s * (wW - 0.01), BELT + 0.01, 0.22], [s * (wW - 0.01), BELT + 0.01, 1.14], [s * wR, ROOF - 0.02, zC + 0.04], [s * wR, ROOF - 0.02, 0.22]), glass);
    B.add(box(0.02, 0.02, 1.25, s * wR, ROOF - 0.01, 0.18), chrome);                      // drip rail
  }
  B.add(extrudeY([[-wR, zA], [wR, zA], [wR, zC], [-wR, zC]], ROOF - 0.02, ROOF + 0.025), paint);
  B.add(quad([-wW + 0.04, BELT + 0.01, -0.94], [wW - 0.04, BELT + 0.01, -0.94], [wR - 0.03, ROOF - 0.015, zA + 0.01], [-wR + 0.03, ROOF - 0.015, zA + 0.01]), glass);
  B.add(quad([wW - 0.06, BELT + 0.01, 1.21], [-wW + 0.06, BELT + 0.01, 1.21], [-wR + 0.05, ROOF - 0.015, zC - 0.01], [wR - 0.05, ROOF - 0.015, zC - 0.01]), glass);
  for (const x of [-0.42, 0.18]) B.add(rod([x, BELT + 0.02, -0.97], [x + 0.36, BELT + 0.05, -0.92], 0.012), black);
  B.add(rod([-wW, 1.0, -0.86], [-wW - 0.1, 1.06, -0.86], 0.02), chrome); B.add(box(0.03, 0.08, 0.12, -wW - 0.12, 1.07, -0.86), chrome);
  // front: chrome grille surround with horizontal bars, twin round headlamps each side in a bright frame
  B.add(box(1.52, 0.26, 0.03, 0, 0.72, FRONT - 0.005), black);
  B.add(box(1.54, 0.02, 0.02, 0, 0.855, FRONT - 0.015), chrome); B.add(box(1.54, 0.02, 0.02, 0, 0.585, FRONT - 0.015), chrome);
  for (let i = 0; i < 5; i++) B.add(box(0.56, 0.012, 0.015, 0, 0.62 + i * 0.05, FRONT - 0.02), chrome);
  for (const s of [-1, 1]) for (const x of [0.46, 0.65]) lamp(B, s * x, 0.72, FRONT - 0.02, 0.078, lampW, chrome, -1, 0.04);
  const vaz = lettering('ЖИГУЛИ', '#d8dade', 0.3, 0.05); vaz.position.set(0, 0.88, FRONT - 0.003); vaz.rotation.y = Math.PI; g.add(vaz);
  // bumpers with rubber-tipped overriders; indicators under the front bumper
  for (const z of [FRONT - 0.06, REAR + 0.05]) { B.add(box(1.60, 0.07, 0.06, 0, 0.47, z), chrome); B.add(box(1.5, 0.02, 0.05, 0, 0.42, z), black); for (const s of [-1, 1]) B.add(box(0.05, 0.14, 0.07, s * 0.38, 0.48, z), black); }
  for (const s of [-1, 1]) B.add(box(0.15, 0.045, 0.03, s * 0.55, 0.40, FRONT + 0.02), lampA);
  // rear: horizontal tail-light clusters (red / amber / white) and the boot lock, plate
  for (const s of [-1, 1]) { B.add(box(0.30, 0.12, 0.03, s * 0.60, 0.76, REAR + 0.005), lampR); B.add(box(0.10, 0.12, 0.031, s * 0.40, 0.76, REAR + 0.005), lampA); B.add(box(0.06, 0.12, 0.032, s * 0.32, 0.76, REAR + 0.006), lampW); }
  B.add(cylZ(0.018, 0.02, 0, 0.82, REAR + 0.01, 8), chrome);
  B.add(cylZ(0.022, 0.2, 0.45, 0.30, REAR + 0.02, 8), steelD);
  const pf = plate('Ж 41-27 ГР', '#f2f0e6', '#151515', 0.48, 0.10); pf.position.set(0, 0.53, FRONT - 0.095); pf.rotation.y = Math.PI; g.add(pf);
  const pr = plate('Ж 41-27 ГР', '#f2f0e6', '#151515', 0.38, 0.13); pr.position.set(0, 0.60, REAR + 0.015); g.add(pr);
  const sm = mat(0x6a4a34);
  seat(interior, -0.35, 0.52, -0.02, 0.48, sm, 0.58); seat(interior, 0.35, 0.52, -0.02, 0.48, sm, 0.58); seat(interior, 0, 0.50, 0.82, 1.25, sm, 0.5, true);
  return { parts: {}, setVariant() {} };
}

const BUILDERS = { landrover: buildLandRover, hilux: buildHilux, beetle: buildBeetle, lada: buildLada };
const RIMS = { landrover: { rim: 'lr', tread: 'xc', rimR: 0.205 }, hilux: { rim: 'car', tread: 'road', rimR: 0.19 }, beetle: { rim: 'beetle', tread: 'road', rimR: 0.19 }, lada: { rim: 'car', tread: 'road', rimR: 0.165 } };

export function buildCivMesh(o = {}) {
  const spec = o.spec; if (!spec || !BUILDERS[spec.id]) throw new Error('buildCivMesh: unknown spec ' + (spec && spec.id));
  const opts = { colour: 0, tilt: true, ...o };
  const g = new THREE.Group(); g.name = spec.id;
  const colours = spec.colours || [0x888888];
  const paint = new THREE.MeshLambertMaterial({ color: colours[opts.colour % colours.length], flatShading: true, vertexColors: true, side: THREE.DoubleSide });
  const ctx = {
    g, B: builder(WEAR), black: mat(PAL.black), steel: mat(PAL.steel), steelD: mat(PAL.steelDark), glass: glassMat(0x9fb6c0, 0.36),
    lampW: lampMat(PAL.lampW, 0.15), lampA: lampMat(PAL.lampA, 0.25), lampR: lampMat(PAL.lampR, 0.3), chrome: chromeM(),
    roofM: new THREE.MeshLambertMaterial({ color: spec.roof ?? 0xd8d4c4, flatShading: true, vertexColors: true, side: THREE.DoubleSide }),
    tyreM: mat(PAL.tyreWall), rimM: mat(spec.id === 'landrover' ? 0x9a9c96 : spec.id === 'beetle' ? 0xd8d6cc : 0xb8bab6),
    interior: builder({ dust: 0.1, mud: 0, grime: 0.2, yDust: 99 }),
    trim: noWear(mat(0x2e2b28, { side: THREE.DoubleSide })), floorM: mat(0x232322), headM: noWear(mat(0xb4ae9e, { side: THREE.DoubleSide, emissive: 0x4a463e })),
  };
  const res = BUILDERS[spec.id](spec, paint, ctx);
  const statics = ctx.B.build(g, spec.id + 'Body');
  const seatsG = new THREE.Group(); seatsG.name = 'seats'; g.add(seatsG); ctx.interior.build(seatsG, 'seats');
  const paintMeshes = statics.filter(m => m.material === paint);
  const wheels = addWheels(g, spec, RIMS[spec.id], ctx.tyreM, ctx.rimM, ctx.steelD);
  const axles = addAxles(g, spec, wheels, ctx.steelD);
  const api = {
    group: g, shell: [], wheels, parts: { ...res.parts, seats: seatsG, paint },
    setVariant(v = {}) {
      Object.assign(opts, v);
      const c = colours[((opts.colour | 0) % colours.length + colours.length) % colours.length];
      if (paint.color.getHex() !== c) { paint.color.setHex(c); for (const m of paintMeshes) wear(m.geometry, c, WEAR); }
      res.setVariant(opts);
    },
    animate(look, dt = 0) { animateWheels(wheels, axles, look); },
  };
  api.setVariant({});
  api.animate({ wheels: spec.wheels.map(() => ({ dy: 0, steer: 0, spin: 0 })) });
  return api;
}
