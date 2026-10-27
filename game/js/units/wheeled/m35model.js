// M35A2 2 1/2-ton 6x6 cargo truck exterior model: real dimensions (TM 9-2320-209-10: 22 ft 4 in x 8 ft x 9 ft 4 in,
// 154 in wheelbase to the bogie centre, 52 in bogie, 72 in station track, 9.00-20 tyres with dual rear wheels), house style (flat-shaded Lambert,
// geometry details, vertex-colour dust and wear, stencils).
// Model frame = vehiclefm's: x right, y up, nose -z, origin on the ground midway between the front axle and the bogie centre.
// Variants: { cover: 'canvas' | 'bows' | 'off', ring: false | true (M36 ring mount with an M2), seats: 'down' | 'up' }
// API: buildM35Mesh(opts) -> { group, shell, wheels, parts, setVariant(v), animate(look, dt) }
import * as THREE from 'three';
import { PAL, mat, glassMat, lampMat, box, cylX, cylY, cylZ, sphere, rod, tube, extrudeX, extrudeY, extrudeZ, mirrorX, builder, wheelMesh, decal, starTex, stencilTex, V } from './modelkit.js';
import { M35 } from './m35.js';
import { TYRES } from './tyre.js';

const { r: R, w: TW } = TYRES['9.00-20 NDT'];
const ZF = M35.axles[0].z, Z1 = M35.axles[1].z, Z2 = M35.axles[2].z, XT = M35.dims.track / 2;
export const M35_DIMS = { ZF, Z1, Z2, XT, R, FRONT: -3.08, REAR: 3.63, BED0: -0.22, BEDY: 1.30, CAB0: -1.52, CAB1: -0.42, FRAMEY: 1.0, HOODY: 1.78 };

export function buildM35Mesh(o = {}) {
  const opts = { cover: 'canvas', ring: false, seats: 'down', bumper: '2-504 FA  HQ-12', number: 'USA 4C6620', ...o };
  const g = new THREE.Group(); g.name = 'm35';
  const od = mat(PAL.od), odD = mat(PAL.odDark), black = mat(PAL.black), steel = mat(PAL.steel), steelD = mat(PAL.steelDark), canvas = mat(PAL.canvas), canvasD = mat(PAL.canvasDark);
  const seatM = mat(PAL.seat), tyreM = mat(PAL.tyreWall), rimM = mat(PAL.odDark), wood = mat(0x5a4c34), frameM = mat(0x3a3f29);
  const glass = glassMat(), lampW = lampMat(PAL.lampW, 0.15), lampR = lampMat(PAL.lampR, 0.3), bo = mat(PAL.blackout);
  const B = builder({ dust: 0.55, mud: 0.5, grime: 0.3, yDust: 1.35, yMud: 0.75 });
  const D = M35_DIMS;

  // ------------------------------------------------------------------ chassis: frame rails, crossmembers, bumper
  for (const s of [-1, 1]) {
    B.add(box(0.08, 0.25, 6.62, s * 0.44, 0.88, (D.FRONT + 0.06 + D.REAR - 0.02) / 2), frameM);   // C-channel rails
    B.add(box(0.012, 0.25, 6.62, s * 0.40, 0.88, (D.FRONT + 0.06 + D.REAR - 0.02) / 2), frameM);
  }
  for (const z of [-2.85, -1.6, -0.3, 0.6, 1.95, 3.2, 3.55]) B.add(box(0.84, 0.16, 0.10, 0, 0.88, z), frameM);
  B.add(box(2.30, 0.24, 0.16, 0, 0.78, D.FRONT + 0.08), odD);              // front bumper (channel)
  B.add(box(2.30, 0.03, 0.22, 0, 0.91, D.FRONT + 0.11), od);
  for (const s of [-1, 1]) {
    B.add(new THREE.TorusGeometry(0.07, 0.022, 6, 12).rotateY(Math.PI / 2).translate(s * 0.62, 0.66, D.FRONT), steelD);   // tow shackles / lifting eyes
    B.add(box(0.08, 0.16, 0.16, s * 0.62, 0.72, D.FRONT + 0.04), steelD);
  }
  // ------------------------------------------------------------------ radiator, brush guard, hood, cowl
  B.add(box(0.92, 0.82, 0.16, 0, 1.33, -2.82), steelD);                    // radiator core shell
  for (let i = -5; i <= 5; i++) B.add(box(0.03, 0.74, 0.03, i * 0.08, 1.33, -2.92), black);   // radiator fins (dark)
  // brush guard: vertical bars on a frame in front of the radiator
  B.add(box(1.02, 0.05, 0.06, 0, 1.76, -2.98), odD); B.add(box(1.02, 0.05, 0.06, 0, 0.95, -2.98), odD);
  for (let i = -5; i <= 5; i++) B.add(box(0.025, 0.8, 0.025, i * 0.09, 1.355, -3.0), odD);
  for (const s of [-1, 1]) B.add(box(0.05, 0.85, 0.06, s * 0.51, 1.35, -2.98), odD);
  // hood: flat top with sloping sides and a centre hinge, louvres on the side panels
  const hoodP = [[-2.90, 1.76], [D.CAB0 + 0.02, 1.82], [D.CAB0 + 0.02, 1.86], [-2.90, 1.80]];
  B.add(extrudeX(hoodP, -0.42, 0.42), od);
  B.add(box(0.03, 0.03, 1.36, 0, 1.845, -2.2), steelD);                    // centre hinge
  for (const s of [-1, 1]) {
    B.add(extrudeX([[-2.90, 1.05], [D.CAB0 + 0.02, 1.05], [D.CAB0 + 0.02, 1.82], [-2.90, 1.78]], s > 0 ? 0.45 : -0.48, s > 0 ? 0.48 : -0.45), od);   // hood sides
    B.add(rod([s * 0.43, 1.82, -2.9], [s * 0.47, 1.77, -2.9], 0.03), od);  // hood shoulder
    for (let k = 0; k < 6; k++) B.add(box(0.012, 0.035, 0.30, s * 0.485, 1.55 - k * 0.07, -2.25), black);   // louvres
    B.add(box(0.06, 0.05, 0.05, s * 0.46, 1.7, -2.75), steelD);             // hood latches
  }
  // cowl and the fold-down windshield frame base
  B.add(box(1.9, 0.75, 0.06, 0, 1.47, D.CAB0), od);
  B.add(box(1.96, 0.06, 0.09, 0, 1.86, D.CAB0 + 0.05), od);
  // ------------------------------------------------------------------ front fenders (flat "pontoon" tops), lights, air cleaner, steps
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 0.46 : -1.16, x1 = s > 0 ? 1.16 : -0.46;   // tucked under the hood side: no gap
    B.add(extrudeX([[-3.0, 1.12], [-2.92, 1.28], [-2.75, 1.36], [D.CAB0 + 0.05, 1.36], [D.CAB0 + 0.05, 1.32], [-2.75, 1.32], [-2.92, 1.24], [-2.98, 1.10]], x0, x1), od);
    B.add(box(0.03, 0.22, 1.25, s * 1.15, 1.25, -2.15), od);               // outer skirt
    B.add(box(0.04, 0.12, 1.25, s * 0.5, 1.30, -2.15), od);                // inner edge
    // headlamps on the fender fronts with their guards; blackout lamps; marker
    const hx = s * 0.80;
    B.add(cylZ(0.11, 0.12, hx, 1.48, -2.86, 14), steelD);
    B.add(cylZ(0.095, 0.02, hx, 1.48, -2.93, 14), lampW);
    for (const dx of [-0.13, 0.13]) B.add(rod([hx + dx, 1.36, -2.8], [hx + dx, 1.66, -2.92], 0.025, 6), odD);
    B.add(rod([hx - 0.13, 1.66, -2.92], [hx + 0.13, 1.66, -2.92], 0.025, 6), odD);
    B.add(box(0.10, 0.07, 0.07, s * 1.02, 1.42, -2.82), bo);                // blackout marker
    // cab step (below the door) and the fuel tank (left) / battery box (right) under the cab
    B.add(box(0.30, 0.04, 0.42, s * 1.06, 0.80, -0.98), steelD);
  }
  B.add(box(0.48, 0.42, 0.88, -0.88, 0.88, -0.9), od);                     // fuel tank (left, under the driver's door)
  B.add(box(0.06, 0.08, 0.06, -0.9, 1.12, -0.6), steelD);                  // filler cap
  B.add(box(0.48, 0.34, 0.66, 0.88, 0.86, -1.0), od);                      // battery box (right)
  B.add(cylY(0.19, 0.55, 0.88, 1.66, -1.82, 14), od);                      // air cleaner on the right fender
  B.add(cylY(0.21, 0.05, 0.88, 1.95, -1.82, 14), odD);
  B.add(rod([0.80, 1.7, -1.82], [0.42, 1.65, -1.82], 0.09, 8), steelD);    // intake pipe into the hood
  // ------------------------------------------------------------------ cab: floor, doors (steel lower half), back wall, seats
  B.add(box(1.96, 0.04, 1.12, 0, 1.15, (D.CAB0 + D.CAB1) / 2), floorMat());
  for (const s of [-1, 1]) {
    B.add(box(0.04, 0.62, 0.98, s * 0.99, 1.47, -0.97), od);               // door lower panel
    B.add(box(0.04, 0.04, 0.98, s * 1.0, 1.79, -0.97), odD);               // door top edge
    B.add(box(0.03, 0.10, 0.04, s * 1.02, 1.6, -0.58), steelD);             // door handle
    B.add(box(0.035, 0.12, 0.08, s * 1.0, 1.3, -1.43), steelD);             // hinges
    B.add(box(0.035, 0.12, 0.08, s * 1.0, 1.65, -1.43), steelD);
  }
  B.add(box(1.96, 0.84, 0.05, 0, 1.57, D.CAB1), od);                        // cab back wall
  B.add(box(1.7, 0.10, 0.48, 0, 1.40, -0.75), seatM);                       // bench seat cushion (driver + passenger)
  B.add(box(1.7, 0.46, 0.08, 0, 1.68, -0.5, 0.12), seatM);                  // backrest
  B.add(box(0.06, 0.45, 0.06, 0, 1.68, -0.48), steelD);
  // ------------------------------------------------------------------ behind the cab: spare wheel, exhaust stack
  const spare = wheelMesh({ r: R, w: TW, rim: 'truck', tread: 'ndt' }, 1, tyreM, rimM);
  spare.rotation.y = Math.PI / 2; spare.position.set(-0.55, 1.62, D.CAB1 + 0.2); g.add(spare);
  B.add(box(0.08, 0.9, 0.08, -0.55, 1.4, D.CAB1 + 0.32), steelD);          // spare carrier davit
  // the exhaust stack is its own group (AIRLIFT: it comes off to rig the truck for a C-130 heavy drop - the hold is 2.74 m)
  const XB = builder({ dust: 0.55, mud: 0, grime: 0.3, yDust: 1.35 });
  XB.add(cylY(0.055, 1.35, 0.95, 2.0, D.CAB1 + 0.18, 10), steelD);          // exhaust stack
  XB.add(cylY(0.09, 0.85, 0.95, 2.05, D.CAB1 + 0.18, 10), mat(PAL.odDark)); // perforated heat shield
  XB.add(cylY(0.06, 0.08, 0.95, 2.72, D.CAB1 + 0.18, 10, 0.045), black);    // rain cap
  { const st = new THREE.Group(); st.name = 'exhaustStack'; g.add(st); XB.build(st, 'm35Stack'); }
  B.add(rod([0.95, 1.33, D.CAB1 + 0.18], [0.6, 0.95, -1.6], 0.08, 8), steelD);
  // ------------------------------------------------------------------ cargo bed: floor, sides, racks, tailgate, troop seats
  const bz0 = D.BED0, bz1 = D.REAR - 0.02, bl = bz1 - bz0, bzc = (bz0 + bz1) / 2;
  B.add(box(2.44, 0.06, bl, 0, D.BEDY, bzc), od);                           // bed floor
  for (let k = 0; k < 8; k++) B.add(box(2.44, 0.07, 0.07, 0, D.BEDY - 0.065, bz0 + 0.2 + k * (bl - 0.4) / 7), odD);   // bed crossmembers (under)
  B.add(box(2.44, 0.12, 0.08, 0, D.BEDY - 0.12, bz1 - 0.04), odD);
  for (const s of [-1, 1]) {
    B.add(box(0.05, 0.42, bl, s * 1.2, D.BEDY + 0.24, bzc), od);           // steel side panel
    B.add(box(0.07, 0.04, bl, s * 1.21, D.BEDY + 0.45, bzc), odD);          // side top rail
    for (let k = 0; k <= 7; k++) B.add(box(0.07, 0.42, 0.05, s * 1.225, D.BEDY + 0.24, bz0 + 0.05 + k * (bl - 0.1) / 7), odD);   // stakes
    // the stake racks above the sides (wood slats), the troop-seat backrests
    for (const yy of [1.98, 2.22]) B.add(box(0.05, 0.08, bl - 0.1, s * 1.19, yy, bzc), wood);
    for (let k = 0; k <= 7; k++) B.add(box(0.06, 0.62, 0.06, s * 1.19, 1.98, bz0 + 0.05 + k * (bl - 0.1) / 7), odD);
    // mudflaps and the fender plates over the bogie
    B.add(box(0.36, 0.04, 2.25, s * 0.98, 1.22, (Z1 + Z2) / 2), od);
    B.add(box(0.30, 0.42, 0.012, s * 0.98, 0.78, Z2 + 0.68), black);
  }
  B.add(box(2.44, 0.84, 0.05, 0, D.BEDY + 0.42, bz0 - 0.02), od);           // headboard (front of bed)
  for (let k = -3; k <= 3; k++) B.add(box(0.06, 0.84, 0.03, k * 0.33, D.BEDY + 0.42, bz0 + 0.02), odD);
  // tailgate (closed): panel, ribs, chains, rear lights, pintle, steps
  B.add(box(2.36, 0.46, 0.05, 0, D.BEDY + 0.24, bz1), od);
  for (let k = -3; k <= 3; k++) B.add(box(0.05, 0.46, 0.04, k * 0.33, D.BEDY + 0.24, bz1 + 0.03), odD);
  for (const s of [-1, 1]) {
    B.add(rod([s * 1.17, D.BEDY + 0.46, bz1 - 0.02], [s * 1.17, D.BEDY + 0.30, bz1 + 0.05], 0.012), steelD);   // tailgate chains
    B.add(box(0.18, 0.12, 0.08, s * 0.95, 0.98, bz1 + 0.05), steelD);       // combination tail lights
    B.add(box(0.06, 0.06, 0.012, s * 0.98, 0.99, bz1 + 0.095), lampR);
    B.add(box(0.05, 0.06, 0.012, s * 0.90, 0.99, bz1 + 0.095), bo);
    B.add(box(0.40, 0.04, 0.12, s * 0.55, 0.72, bz1 + 0.1), steelD);       // rear step
  }
  B.add(box(0.22, 0.2, 0.08, 0, 0.82, bz1 + 0.06), steelD);                 // pintle
  B.add(new THREE.TorusGeometry(0.06, 0.02, 6, 12, Math.PI * 1.5).rotateY(Math.PI / 2).translate(0, 0.78, bz1 + 0.16), steelD);
  // ------------------------------------------------------------------ running gear (static parts): front leaf springs, bogie trunnion, torque rods
  for (const s of [-1, 1]) {
    B.add(box(0.07, 0.08, 1.35, s * 0.44, 0.72, ZF), steelD);              // front leaf spring pack
    B.add(box(0.07, 0.04, 1.1, s * 0.44, 0.67, ZF), steelD);
    B.add(box(0.18, 0.24, 0.30, s * 0.46, 0.8, (Z1 + Z2) / 2), steelD);    // trunnion bracket
    B.add(cylX(0.08, 0.22, s * 0.52, 0.72, (Z1 + Z2) / 2, 12), steelD);    // trunnion shaft
    B.add(box(0.08, 0.10, 1.55, s * 0.62, 0.72, (Z1 + Z2) / 2), steelD);   // inverted leaf spring over both axles
  }
  // ------------------------------------------------------------------ markings
  for (const s of [-1, 1]) {
    const st = decal(starTex(false), 0.48, 0.48); st.position.set(s * 1.022, 1.47, -0.97); st.rotation.y = s * Math.PI / 2; g.add(st);
    const n = decal(stencilTex(opts.number), 0.62, 0.12); n.position.set(s * 0.486, 1.55, -2.3); n.rotation.y = s * Math.PI / 2; g.add(n);
  }
  const hs = decal(starTex(false), 0.55, 0.55); hs.rotation.x = -Math.PI / 2 + 0.045; hs.position.set(0, 1.848, -2.15); g.add(hs);
  { const [a, b] = opts.bumper.split('  '); for (const [t, x] of [[a, -0.62], [b, 0.62]]) { const d = decal(stencilTex(t || ''), 0.62, 0.11); d.position.set(x, 0.78, D.FRONT - 0.005); d.rotation.y = Math.PI; g.add(d); } }
  { const d = decal(stencilTex(opts.bumper.replace('  ', '   ')), 1.0, 0.13); d.position.set(0, D.BEDY + 0.24, bz1 + 0.06); g.add(d); }
  B.build(g, 'm35Body');

  // ------------------------------------------------------------------ windshield (two panes, folds forward) and the cab top (canvas)
  const screen = new THREE.Group(); screen.name = 'windshield'; screen.position.set(0, 1.88, D.CAB0 + 0.04); g.add(screen);
  const SB = builder({ dust: 0.4, mud: 0, yDust: 99 });
  const sw = 1.9, sh = 0.52;
  SB.add(box(sw, 0.04, 0.04, 0, 0, 0), od); SB.add(box(sw, 0.04, 0.04, 0, sh, 0), od);
  for (const x of [-sw / 2, 0, sw / 2]) SB.add(box(0.04, sh, 0.04, x, sh / 2, 0), od);
  for (const x of [-0.5, 0.5]) SB.add(rod([x, sh - 0.03, -0.02], [x + 0.25, sh - 0.33, -0.03], 0.012), black);
  SB.add(box(0.2, 0.14, 0.02, -sw / 2 - 0.18, sh * 0.6, 0.03), steelD); SB.add(rod([-sw / 2, sh * 0.6, 0], [-sw / 2 - 0.1, sh * 0.6, 0.02], 0.02), steelD);   // mirror
  SB.add(box(0.2, 0.14, 0.02, sw / 2 + 0.18, sh * 0.6, 0.03), steelD); SB.add(rod([sw / 2, sh * 0.6, 0], [sw / 2 + 0.1, sh * 0.6, 0.02], 0.02), steelD);
  SB.build(screen, 'shieldFrame', false);
  for (const x of [-sw / 4, sw / 4]) { const gp = new THREE.Mesh(new THREE.PlaneGeometry(sw / 2 - 0.06, sh - 0.05), glass); gp.position.set(x, sh / 2, 0); screen.add(gp); }
  const cabTop = new THREE.Group(); cabTop.name = 'cabTop'; g.add(cabTop);
  const CB = builder({ dust: 0.3, mud: 0, yDust: 99, grime: 0.4 });
  CB.add(extrudeX([[D.CAB0 + 0.02, 2.40], [D.CAB1 + 0.05, 2.40], [D.CAB1 + 0.05, 2.36], [D.CAB0 + 0.02, 2.36]], -1.0, 1.0), canvas);
  CB.add(box(1.96, 0.42, 0.02, 0, 2.18, D.CAB1 + 0.03), canvasD);   // rear curtain over the cab back wall
  for (const s of [-1, 1]) CB.add(box(0.02, 0.56, 1.05, s * 1.0, 2.1, -0.97), canvasD);   // door curtains
  for (const z of [D.CAB0 + 0.05, D.CAB1 + 0.02]) for (const s of [-1, 1]) CB.add(rod([s * 0.99, 1.86, z], [s * 0.99, 2.38, z], 0.03, 6), steelD);   // top bows / posts
  CB.build(cabTop, 'cabCanvas');
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), glassMat(0x8899a0, 0.35)); rw.position.set(0, 2.2, D.CAB1 + 0.045); rw.rotation.y = Math.PI; cabTop.add(rw);

  // ------------------------------------------------------------------ bed cover: bows + canvas (variants)
  const bows = new THREE.Group(); bows.name = 'bows'; g.add(bows);
  const cover = new THREE.Group(); cover.name = 'cover'; g.add(cover);
  const BB = builder(false), KB = builder({ dust: 0.3, mud: 0, yDust: 99, grime: 0.45 });
  const yTop = M35.dims.H, nb = 5;
  for (let k = 0; k < nb; k++) { const z = bz0 + 0.12 + k * (bl - 0.24) / (nb - 1); BB.add(tube([[-1.2, 2.25, z], [-1.2, yTop - 0.25, z], [-1.0, yTop - 0.04, z], [1.0, yTop - 0.04, z], [1.2, yTop - 0.25, z], [1.2, 2.25, z]], 0.02, 18, 5), steelD); }
  BB.add(box(0.04, 0.04, bl - 0.2, 0, yTop - 0.03, bzc), steelD);         // ridge pole
  BB.build(bows, 'bowSteel');
  // canvas: roof with rounded shoulders down to the racks, front and rear curtains (rear rolled half up)
  const prof = [[-1.25, 1.74], [-1.25, yTop - 0.24], [-1.02, yTop], [1.02, yTop], [1.25, yTop - 0.24], [1.25, 1.74]];
  for (let i = 0; i < prof.length - 1; i++) {
    const [x0, y0] = prof[i], [x1, y1] = prof[i + 1], L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
    const p = box(L, 0.02, bl + 0.04, 0, 0, 0); p.rotateZ(a); p.translate((x0 + x1) / 2, (y0 + y1) / 2, bzc); KB.add(p, canvas);
  }
  KB.add(extrudeZ([[-1.24, 1.75], [1.24, 1.75], [1.24, yTop - 0.24], [1.02, yTop], [-1.02, yTop], [-1.24, yTop - 0.24]], bz0 - 0.03, bz0 - 0.01), canvasD);
  KB.add(extrudeZ([[-1.24, 2.35], [1.24, 2.35], [1.24, yTop - 0.24], [1.02, yTop], [-1.02, yTop], [-1.24, yTop - 0.24]], bz1 + 0.01, bz1 + 0.03), canvasD);
  KB.add(cylX(0.07, 2.4, 0, 2.32, bz1 + 0.05, 10), canvas);                  // rolled-up rear curtain
  for (let k = 0; k < 9; k++) KB.add(rod([-1.262, 1.76, bz0 + 0.2 + k * 0.45], [-1.262, 1.62, bz0 + 0.2 + k * 0.45], 0.012), black);   // tie-down ropes
  for (let k = 0; k < 9; k++) KB.add(rod([1.262, 1.76, bz0 + 0.2 + k * 0.45], [1.262, 1.62, bz0 + 0.2 + k * 0.45], 0.012), black);
  KB.build(cover, 'bedCanvas');
  const coverStencil = decal(stencilTex('U.S. ARMY', 512, 96), 1.2, 0.22); coverStencil.position.set(1.252, 2.55, 1.6); coverStencil.rotation.y = Math.PI / 2; cover.add(coverStencil);

  // ------------------------------------------------------------------ troop seats: fold down from the racks (both sides)
  const seats = new THREE.Group(); seats.name = 'troopSeats'; g.add(seats);
  const seatPivots = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 1.13, D.BEDY + 0.42, bzc); seats.add(piv);
    const plank = new THREE.Mesh(box(0.34, 0.04, bl - 0.3, -s * 0.17, 0, 0), wood); piv.add(plank);
    for (let k = 0; k < 5; k++) { const leg = new THREE.Mesh(box(0.03, 0.42, 0.03, -s * 0.3, -0.21, -bl / 2 + 0.3 + k * (bl - 0.6) / 4), steelD); piv.add(leg); }
    piv.userData.s = s; seatPivots.push(piv);
  }

  // ------------------------------------------------------------------ M36 ring mount over the cab (passenger side) with an M2
  const ring = new THREE.Group(); ring.name = 'ringMount'; g.add(ring);
  const RB = builder({ dust: 0.25, mud: 0, yDust: 99 }), rc = [0.48, 2.62, -0.95];
  RB.add(new THREE.TorusGeometry(0.52, 0.035, 6, 32).rotateX(Math.PI / 2).translate(...rc), odD);
  for (const [dx, dz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) RB.add(rod([rc[0] + dx, rc[1], rc[2] + dz], [rc[0] + dx * 1.1, 1.85, rc[2] + dz * 1.3], 0.05, 6), odD);
  RB.build(ring, 'ringSteel', false);
  const m2 = new THREE.Group(); m2.name = 'm2'; m2.position.set(rc[0], rc[1] + 0.12, rc[2] - 0.52); ring.add(m2);
  const MB = builder(false), gm = mat(0x1e201e);
  MB.add(box(0.10, 0.12, 0.16, 0, 0.0, 0), gm); MB.add(box(0.14, 0.18, 0.60, 0, 0.06, 0.02), gm);   // cradle + receiver
  MB.add(cylZ(0.024, 1.14, 0, 0.07, -0.85, 10), gm); MB.add(cylZ(0.036, 0.28, 0, 0.07, -0.42, 10), gm);   // barrel + jacket
  MB.add(box(0.03, 0.12, 0.08, -0.05, 0.08, 0.35), gm); MB.add(box(0.03, 0.12, 0.08, 0.05, 0.08, 0.35), gm);   // spade grips
  MB.add(box(0.16, 0.20, 0.30, 0.16, -0.02, 0.0), mat(PAL.od));             // ammo can
  MB.build(m2, 'm2gun');

  // ------------------------------------------------------------------ wheels and solid axles
  const axleBeams = [];
  const wheels = M35.wheels.map((w, i) => {
    const side = Math.sign(w.x);
    const corner = new THREE.Group(); corner.name = 'corner' + w.id; corner.position.set(w.x, R, w.z); g.add(corner);
    const steerG = new THREE.Group(); corner.add(steerG);
    const wm = new THREE.Group(); wm.name = 'hub' + w.id; steerG.add(wm);
    // Separate visible inner/outer wheels on each rear hub; both rotate with that hub.
    const tyres = (w.dual ? [-1, 1] : [0]).map((k, j) => {
      const tyre = wheelMesh({ r: R, w: TW, rim: 'truck', tread: 'ndt' }, side, tyreM, rimM);
      tyre.name = w.id + (w.dual ? (j ? '-outer' : '-inner') : '-single');
      tyre.position.x = side * k * (TW + 0.035) / 2; wm.add(tyre); return tyre;
    });
    const hub = new THREE.Mesh(cylX(0.13, 0.12, -side * 0.12, 0, 0, 12), steelD); corner.add(hub);
    if (w.front) { const knuckle = new THREE.Mesh(sphere(0.12, -side * 0.22, 0, 0, 10, 8), steelD); corner.add(knuckle); }
    return { corner, steerG, wm, tyres, side, w };
  });
  for (const a of M35.axles) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.13, 0.13), steelD); g.add(beam);
    const diff = new THREE.Mesh(sphere(0.2, 0, 0, 0, 12, 8).scale(1, 0.85, 1), steelD); g.add(diff);
    axleBeams.push({ beam, diff, a });
  }
  // propeller shafts (static, frame-mounted transfer case to each axle): drawn to the axle positions each frame
  const tcase = new THREE.Mesh(box(0.36, 0.3, 0.34, 0, 0.78, -0.55), steelD); g.add(tcase);
  const props = M35.axles.map(() => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8).rotateX(Math.PI / 2), steelD); g.add(p); return p; });

  const shell = [cabTop.getObjectByName('cabCanvas'), rw].filter(Boolean);
  const _a = V(), _b = V();
  const api = {
    group: g, shell, wheels, parts: { screen, cabTop, bows, cover, seats, ring, m2, spare },
    setVariant(v) {
      Object.assign(opts, v);
      cover.visible = opts.cover === 'canvas'; bows.visible = opts.cover !== 'off';
      ring.visible = !!opts.ring;
      for (const p of seatPivots) p.rotation.z = opts.seats === 'up' ? -p.userData.s * 1.5 : 0;   // folded up against the racks
      screen.rotation.x = opts.screen === 'down' ? -1.5 : 0;
    },
    animate(look, dt = 0) {
      for (let i = 0; i < wheels.length; i++) {
        const W = wheels[i], L = look?.wheels?.[i]; if (!L) continue;
        W.corner.position.y = R + L.dy - (L.flat || 0) * 0.1;
        W.steerG.rotation.y = -L.steer;
        W.wm.rotation.x = -L.spin;
      }
      // solid axles: a beam between the two hubs, the differential on it (offset to the right on the front axle)
      for (const { beam, diff, a } of axleBeams) {
        const l = wheels[a.wheels[0]].corner.position, r = wheels[a.wheels[1]].corner.position;
        _a.set(l.x + 0.25, l.y, l.z); _b.set(r.x - 0.25, r.y, r.z);
        beam.position.copy(_a).add(_b).multiplyScalar(0.5); beam.scale.x = _a.distanceTo(_b); beam.rotation.z = Math.atan2(_b.y - _a.y, _b.x - _a.x);
        diff.position.copy(beam.position); diff.position.x += a.z < 0 ? 0.18 : 0.0;
      }
      // propeller shafts from the transfer case to each differential
      props.forEach((p, k) => { const d = axleBeams[k].diff.position; _a.set(0.02, 0.78, -0.55); p.position.copy(_a).add(d).multiplyScalar(0.5); p.lookAt(d); p.scale.set(1, 1, _a.distanceTo(d)); });
    },
  };
  api.setVariant({});
  api.animate({ wheels: M35.wheels.map(() => ({ dy: 0, steer: 0, spin: 0 })) });
  return api;
}
let _floor = null; const floorMat = () => _floor || (_floor = mat(0x3c4129));
