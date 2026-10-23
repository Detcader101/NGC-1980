// M151A2 MUTT exterior model: real dimensions (TM 9-2320-218-10: 133 x 64 x 71 in, 85 in wheelbase, 53 in track,
// 7.00-16 tyres), house style (flat-shaded Lambert, geometry details, vertex-colour dust and wear, stencils).
// Model frame = vehiclefm's: x right, y up, nose -z, origin on the ground in the middle of the wheelbase.
// Variants: { screen: 'up' | 'down', top: 'canvas' | 'off', mount: 'm60' | 'none', bumper: 'HQ 1-7 CAV' ..., number }
// API: buildM151Mesh(opts) -> { group, shell: [...], wheels: [...], animate(look, dt), setVariant(v), parts }
//   look = modelkit.lookFrom(sim) (wheel travel / steer / spin, controls); shell = parts hidden from the driver's eye
//   when a camera sits inside (none needed for an open jeep but the canvas top's rear window).
import * as THREE from 'three';
import { PAL, mat, glassMat, lampMat, box, cylX, cylY, cylZ, sphere, rod, tube, extrudeX, extrudeY, extrudeZ, mirrorX, builder, wheelMesh, decal, starTex, stencilTex, V } from './modelkit.js';
import { M151 } from './m151.js';

const WB = M151.dims.wheelbase, ZF = -WB / 2, ZR = WB / 2, XT = M151.dims.track / 2, R = 0.381;
export const M151_DIMS = { ZF, ZR, XT, R, L: 3.378, W: 1.626, FRONT: -1.70, REAR: 1.68, BELT: 1.0, HOOD: 1.02, COWL: -0.46, FLOOR: 0.43 };

export function buildM151Mesh(o = {}) {
  const opts = { screen: 'up', top: 'off', mount: 'm60', bumper: '1-7 CAV  HQ-4', number: 'USA 4D2961', ...o };
  const g = new THREE.Group(); g.name = 'm151';
  const od = mat(PAL.od), odD = mat(PAL.odDark), black = mat(PAL.black), steel = mat(PAL.steel), steelD = mat(PAL.steelDark), canvas = mat(PAL.canvas), canvasD = mat(PAL.canvasDark);
  const seatM = mat(PAL.seat), rubber = mat(PAL.rubber), tyreM = mat(PAL.tyreWall), rimM = mat(PAL.odDark), floorM = mat(0x3c4129);
  const glass = glassMat(), lampW = lampMat(PAL.lampW, 0.15), lampA = lampMat(PAL.lampA, 0.25), lampR = lampMat(PAL.lampR, 0.3), bo = mat(PAL.blackout);
  const B = builder({ dust: 0.55, mud: 0.45, grime: 0.3, yDust: 1.0, yMud: 0.5 });
  const D = M151_DIMS;

  // ------------------------------------------------------------------ body tub sides (with arches and the entry dip)
  const arch = (zc, rr, yb, n = 9) => { const pts = []; for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([zc + Math.cos(a) * rr, yb + Math.sin(a) * rr * 0.98]); } return pts; };
  const side = [
    [D.FRONT + 0.06, 0.52], [D.FRONT + 0.04, 0.99], [D.COWL, 1.035], [-0.40, 1.0], [-0.33, 0.93], [-0.26, 0.86], [0.18, 0.86], [0.28, 0.93], [0.36, 0.995], [D.REAR - 0.02, 1.0], [D.REAR - 0.02, 0.44],
    ...arch(ZR, 0.485, 0.44).filter(([z]) => z < D.REAR - 0.05), [ZF + 0.49, 0.44], ...arch(ZF, 0.49, 0.47).filter(([z]) => z > D.FRONT + 0.08),
  ];
  // the arch helper runs from +z to -z over the top: make sure both arches are in descending z order
  const sideGeo = extrudeX(side, 0.775, 0.805);
  B.add(sideGeo, od); B.add(mirrorX(sideGeo), od);
  // rolled top edge along the tub sides (the M151's beaded edge) and the entry dip
  for (const s of [-1, 1]) {
    B.add(tube([[s * 0.79, 1.0, 0.36], [s * 0.79, 1.002, 1.2], [s * 0.79, 1.0, D.REAR - 0.03]], 0.018, 6, 5), od);
    B.add(tube([[s * 0.79, 1.0, -0.40], [s * 0.79, 0.93, -0.33], [s * 0.79, 0.865, -0.24], [s * 0.79, 0.865, 0.16], [s * 0.79, 0.93, 0.28], [s * 0.79, 0.998, 0.36]], 0.017, 10, 5), od);
    // wheel-arch lips
    B.add(tube(arch(ZF, 0.505, 0.47, 12).map(([z, y]) => [s * 0.80, y, z]), 0.016, 14, 4), odD);
    B.add(tube(arch(ZR, 0.50, 0.44, 12).map(([z, y]) => [s * 0.80, y, z]), 0.016, 14, 4), odD);
    // lower sill / rocker
    B.add(box(0.05, 0.06, ZR - 0.5 - (ZF + 0.5), s * 0.79, 0.47, 0), odD);
    // body side reinforcement ridge (a pressed bead along the side)
    B.add(box(0.012, 0.025, 2.1, s * 0.808, 0.72, 0.15), od);
  }
  // hood (flat, slightly sloping) and the fender tops either side
  B.add(extrudeX([[D.FRONT + 0.05, 0.975], [D.COWL, 1.01], [D.COWL, 1.035], [D.FRONT + 0.05, 1.0]], -0.60, 0.60), od);
  for (const s of [-1, 1]) {
    B.add(extrudeX([[D.FRONT + 0.03, 0.965], [D.COWL, 1.0], [D.COWL, 1.02], [D.FRONT + 0.03, 0.99]], s > 0 ? 0.57 : -0.805, s > 0 ? 0.805 : -0.57), od);   // overlaps the hood edge: no gap to see through
    // hood hinge and the two hood latches (spring clamps)
    B.add(box(0.06, 0.03, 0.05, s * 0.56, 1.0, D.FRONT + 0.12), steelD);
    B.add(rod([s * 0.6, 1.02, D.FRONT + 0.4], [s * 0.6, 0.93, D.FRONT + 0.42], 0.025), steelD);
  }
  // hood panel stiffening ribs (pressed)
  for (const x of [-0.3, 0, 0.3]) B.add(box(0.06, 0.01, 1.0, x, 1.02 + 0.005, (D.FRONT + D.COWL) / 2 + 0.03), od);
  B.add(box(1.20, 0.012, 0.02, 0, 1.03, D.COWL + 0.02), steelD);   // hood rear seam / cowl
  // cowl / scuttle and dash panel (firewall) from the cowl down to the floor
  B.add(box(1.56, 0.6, 0.04, 0, 0.74, D.COWL + 0.01), od);
  B.add(box(1.5, 0.05, 0.08, 0, 1.01, D.COWL + 0.06), od);   // dash top / scuttle lip (narrow: the panel sits under it)
  // ------------------------------------------------------------------ front panel (grille) and lights
  const FZ = D.FRONT + 0.05;
  B.add(box(1.22, 0.47, 0.035, 0, 0.745, FZ), od);
  // grille slots: 9 vertical openings in the centre of the panel
  for (let i = -4; i <= 4; i++) B.add(box(0.045, 0.30, 0.02, i * 0.075, 0.76, FZ - 0.012), black);
  // headlamp recesses with sealed beams and the guard bars
  for (const s of [-1, 1]) {
    const hx = s * 0.47, hy = 0.79;
    B.add(cylZ(0.105, 0.05, hx, hy, FZ - 0.01, 16), steelD);
    B.add(cylZ(0.09, 0.02, hx, hy, FZ - 0.035, 16), lampW);
    for (const dx of [-0.07, 0.07]) B.add(rod([hx + dx, hy + 0.12, FZ - 0.03], [hx + dx, hy - 0.12, FZ - 0.03], 0.014, 6), steelD);
    // blackout marker lamps (small, beside the headlamp)
    B.add(box(0.06, 0.05, 0.04, s * 0.30, 0.90, FZ - 0.02), bo);
    // A2: big combination turn-signal lamps on the fender corners
    B.add(box(0.12, 0.09, 0.12, s * 0.70, 1.04, D.FRONT + 0.14), steelD);
    B.add(box(0.10, 0.06, 0.01, s * 0.70, 1.045, D.FRONT + 0.075), lampA);
    // fender front faces (closing the fender ends)
    B.add(box(0.19, 0.46, 0.03, s * 0.705, 0.76, FZ + 0.005), od);
  }
  // front bumper: a channel across with lifting shackles, the bumper marking
  B.add(box(1.62, 0.13, 0.12, 0, 0.47, D.FRONT + 0.03), odD);
  B.add(box(1.62, 0.025, 0.10, 0, 0.535, D.FRONT + 0.035), od);
  for (const s of [-1, 1]) { B.add(new THREE.TorusGeometry(0.04, 0.012, 5, 10).rotateY(Math.PI / 2).translate(s * 0.42, 0.42, D.FRONT - 0.04), steelD); B.add(box(0.05, 0.1, 0.1, s * 0.42, 0.45, D.FRONT - 0.01), steelD); }
  // ------------------------------------------------------------------ floor, tunnel, rear panel, tub interior
  B.add(box(1.56, 0.03, 2.2, 0, D.FLOOR, 0.55), floorM);
  B.add(box(0.26, 0.14, 1.4, 0, D.FLOOR + 0.07, 0.0), floorM);   // transmission / propshaft tunnel
  B.add(box(1.56, 0.58, 0.035, 0, 0.72, D.REAR - 0.01), od);       // rear panel
  for (const s of [-1, 1]) {
    // inner rear wheel housings (boxes in the tub, double as seat supports)
    B.add(box(0.30, 0.34, 1.0, s * 0.63, 0.6, ZR), od);
    // tail lights (combination: service + blackout), reflectors
    B.add(box(0.13, 0.10, 0.06, s * 0.66, 0.86, D.REAR + 0.02), steelD);
    B.add(box(0.05, 0.05, 0.01, s * 0.69, 0.87, D.REAR + 0.052), lampR);
    B.add(box(0.04, 0.05, 0.01, s * 0.63, 0.87, D.REAR + 0.052), bo);
    // rear bumperettes
    B.add(box(0.30, 0.12, 0.10, s * 0.62, 0.47, D.REAR + 0.04), odD);
    // grab handles on the rear body sides
    B.add(tube([[s * 0.815, 0.9, 1.25], [s * 0.85, 0.9, 1.3], [s * 0.85, 0.9, 1.5], [s * 0.815, 0.9, 1.55]], 0.012, 8, 5), steelD);
  }
  // pintle hook and its plate
  B.add(box(0.2, 0.16, 0.04, 0, 0.5, D.REAR + 0.03), steelD);
  B.add(new THREE.TorusGeometry(0.05, 0.016, 6, 12, Math.PI * 1.5).rotateY(Math.PI / 2).translate(0, 0.46, D.REAR + 0.1), steelD);
  // spare wheel on the rear panel (right of centre), and a jerrycan on its bracket (left)
  const spare = wheelMesh({ r: R, w: 0.18, rim: 'mil', tread: 'ndt', studs: 5 }, 1, tyreM, rimM);
  spare.rotation.y = Math.PI / 2; spare.position.set(0.28, 0.78, D.REAR + 0.13); g.add(spare);
  B.add(box(0.12, 0.10, 0.10, 0.28, 0.78, D.REAR + 0.05), steelD);
  B.add(box(0.345, 0.47, 0.165, -0.48, 0.74, D.REAR + 0.11), od);  // 5 gal can (345 x 470 x 165 mm), broad face aft
  B.add(box(0.03, 0.06, 0.12, -0.48, 1.0, D.REAR + 0.11), od);
  B.add(box(0.2, 0.03, 0.36, -0.48, 0.5, D.REAR + 0.11), steelD); B.add(rod([-0.58, 0.95, D.REAR + 0.29], [-0.38, 0.95, D.REAR + 0.29], 0.02), steelD);
  // ------------------------------------------------------------------ seats: two front buckets (canvas on steel frames), rear bench
  for (const s of [-1, 1]) {
    const sx = s * 0.36;
    B.add(box(0.46, 0.08, 0.44, sx, 0.62, 0.05), seatM);
    B.add(box(0.44, 0.10, 0.06, sx, 0.66, 0.29), seatM);
    B.add(box(0.46, 0.50, 0.08, sx, 0.90, 0.33, -0.18), seatM);
    B.add(box(0.36, 0.14, 0.36, sx, 0.52, 0.05), steelD);   // seat box / frame
  }
  B.add(box(1.0, 0.09, 0.40, 0, 0.66, 1.05), seatM);                 // rear bench cushion
  B.add(box(1.0, 0.36, 0.07, 0, 0.88, 1.32, -0.12), seatM);          // rear backrest
  // ------------------------------------------------------------------ underside: frame-less tub, but visible running gear
  for (const s of [-1, 1]) {
    // front A-arms (lower) and coil-spring towers, rear semi-trailing arms
    B.add(box(0.12, 0.30, 0.18, s * 0.42, 0.62, ZF), odD);              // spring tower
    B.add(box(0.06, 0.08, 1.9, s * 0.5, 0.40, 0.0), odD);               // longitudinal sill members
  }
  B.add(box(0.30, 0.20, 0.25, 0, 0.36, ZF), steelD);                     // front differential (body mounted)
  B.add(box(0.30, 0.20, 0.25, 0, 0.36, ZR), steelD);                     // rear differential
  B.add(rod([0, 0.38, ZF + 0.15], [0, 0.42, ZR - 0.15], 0.06, 8), steelD);   // propshafts
  B.add(cylZ(0.04, 1.6, 0.35, 0.33, 0.2, 8), steelD);                    // exhaust pipe
  B.add(box(0.16, 0.12, 0.42, 0.35, 0.33, 0.95), steelD);                // muffler
  // ------------------------------------------------------------------ pioneer tools and antenna base (radio variants)
  B.add(box(0.03, 0.06, 0.9, 0.83, 0.62, 0.95), mat(PAL.wood));          // axe handle on the right rear side
  B.add(box(0.02, 0.14, 0.12, 0.835, 0.62, 0.45), steelD);
  B.add(cylY(0.05, 0.10, -0.74, 1.04, 1.45, 8), steelD);                 // antenna mount (left rear)
  const whip = new THREE.Mesh(tube([[-0.74, 1.09, 1.45], [-0.74, 1.9, 1.3], [-0.7, 2.25, 0.8], [-0.62, 2.2, 0.0]], 0.006, 12, 4), steelD); whip.name = 'antenna'; g.add(whip);   // whip tied down forward
  // ------------------------------------------------------------------ markings: hood star, bumper codes, hood number
  const star = decal(starTex(false), 0.62, 0.62); star.rotation.x = -Math.PI / 2 + 0.03; star.position.set(0, 1.027, -1.05); g.add(star);
  for (const [txt, x] of [[opts.bumper.split('  ')[0] || '', -0.42], [opts.bumper.split('  ')[1] || '', 0.42]]) {
    const d = decal(stencilTex(txt), 0.5, 0.095); d.position.set(x, 0.47, D.FRONT - 0.035); d.rotation.y = Math.PI; g.add(d);
  }
  for (const s of [-1, 1]) { const d = decal(stencilTex(opts.number), 0.58, 0.11); d.position.set(s * 0.811, 0.92, -1.1); d.rotation.y = s * Math.PI / 2; g.add(d); }
  const rearNum = decal(stencilTex(opts.bumper.replace('  ', '   ')), 0.7, 0.09); rearNum.position.set(0, 0.62, D.REAR + 0.02); g.add(rearNum);
  B.build(g, 'm151Body');

  // ------------------------------------------------------------------ windscreen (folds forward onto the hood)
  const screen = new THREE.Group(); screen.name = 'windscreen'; screen.position.set(0, 1.04, D.COWL + 0.02); g.add(screen);
  const SB = builder({ dust: 0.4, mud: 0, yDust: 99 });
  const sw = 1.40, sh = 0.46;
  SB.add(box(sw, 0.035, 0.035, 0, 0.02, 0), od); SB.add(box(sw, 0.035, 0.035, 0, sh, 0), od);
  for (const x of [-sw / 2, 0, sw / 2]) SB.add(box(0.035, sh, 0.035, x, sh / 2, 0), od);
  SB.add(box(0.05, 0.03, 0.05, -sw / 2 - 0.02, sh * 0.7, 0), steelD);   // mirror arm
  const mirrorG = box(0.16, 0.11, 0.02, -sw / 2 - 0.13, sh * 0.72, 0.02); SB.add(mirrorG, steelD);
  for (const x of [-0.36, 0.36]) SB.add(rod([x, sh - 0.02, -0.02], [x + 0.18, sh - 0.3, -0.03], 0.01), black);   // wipers hang from the top
  SB.build(screen, 'screenFrame', false);
  const glassM = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.04, sh - 0.04), glass); glassM.position.set(0, sh / 2 + 0.01, 0); screen.add(glassM);
  for (const x of [-sw / 2 + 0.05, sw / 2 - 0.05]) { const c = new THREE.Mesh(box(0.03, 0.05, 0.04), steelD); c.position.set(x, 0.0, -0.03); screen.add(c); }

  // ------------------------------------------------------------------ canvas top on bows (variant)
  const top = new THREE.Group(); top.name = 'top'; g.add(top);
  const TB = builder({ dust: 0.35, mud: 0, yDust: 99, grime: 0.4 });
  const yT = 1.79, bows = [[-0.40, 1.50], [0.30, yT], [1.0, yT], [1.62, 1.45]];
  for (const [z] of bows.slice(1, 3)) TB.add(tube([[-0.79, 1.0, z], [-0.79, yT - 0.08, z], [-0.7, yT, z], [0.7, yT, z], [0.79, yT - 0.08, z], [0.79, 1.0, z]], 0.014, 16, 5), steelD);
  // the canvas: roof panel and the sides down to the beltline (rear quarters), rear curtain with a window
  TB.add(extrudeX([[-0.42, 1.505], [0.3, yT], [1.62, yT - 0.02], [1.62, yT - 0.05], [0.3, yT - 0.03], [-0.42, 1.475]], -0.81, 0.81), canvas);
  for (const s of [-1, 1]) TB.add(extrudeX([[0.30, yT - 0.02], [1.62, yT - 0.02], [1.66, 1.0], [0.38, 1.0], [0.30, 1.35]], s > 0 ? 0.80 : -0.815, s > 0 ? 0.815 : -0.80), canvasD);
  TB.add(box(1.6, 0.8, 0.015, 0, 1.39, D.REAR - 0.01), canvasD);
  TB.build(top, 'topCanvas');
  const rearWin = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), glassMat(0x8899a0, 0.35)); rearWin.position.set(0, 1.5, D.REAR + 0.01); top.add(rearWin);

  // ------------------------------------------------------------------ M60 pedestal mount (M151A2 "pedestal, M4")
  const mount = new THREE.Group(); mount.name = 'm60mount'; g.add(mount);
  const MB = builder({ dust: 0.3, mud: 0, yDust: 99 });
  MB.add(cylY(0.05, 0.85, 0, 0.88, 0.62, 10), steelD);                   // post from the floor
  MB.add(box(0.36, 0.03, 0.36, 0, 0.46, 0.62), steelD);                   // base plate
  MB.add(cylY(0.07, 0.08, 0, 1.33, 0.62, 10), steelD);                    // pintle socket
  MB.build(mount, 'pedestal', false);
  const gun = new THREE.Group(); gun.name = 'm60'; gun.position.set(0, 1.40, 0.62); mount.add(gun);
  const GB = builder(false), gunM = mat(0x1e201e), gunP = mat(0x2a2b28);
  GB.add(box(0.07, 0.10, 0.55, 0, 0.03, -0.12), gunM);                    // receiver
  GB.add(cylZ(0.016, 0.62, 0, 0.04, -0.68, 8), gunM);                     // barrel
  GB.add(cylZ(0.024, 0.08, 0, 0.04, -0.98, 8), gunM);                     // flash hider
  GB.add(box(0.03, 0.09, 0.03, 0, 0.0, -0.66), gunM);                     // gas cylinder / bipod folded
  GB.add(box(0.05, 0.08, 0.26, 0, 0.0, 0.27), gunP);                      // butt stock
  GB.add(box(0.10, 0.10, 0.14, 0.09, -0.01, -0.12), mat(PAL.od));         // 100-round ammo box hung on the right
  GB.add(box(0.03, 0.03, 0.16, 0, 0.12, -0.25), gunM);                    // carrying handle
  GB.add(box(0.03, 0.07, 0.03, 0, -0.05, 0.05), gunM);                    // pistol grip
  GB.build(gun, 'm60gun');

  // ------------------------------------------------------------------ wheels: knuckles that steer, hubs that travel, tyres that spin
  const wheels = M151.wheels.map((w, i) => {
    const side = Math.sign(w.x);
    const corner = new THREE.Group(); corner.name = 'corner' + w.id; corner.position.set(w.x, R, w.z); g.add(corner);
    const steerG = new THREE.Group(); corner.add(steerG);
    const wm = wheelMesh({ r: R, w: 0.18, rim: 'mil', tread: 'ndt', studs: 5 }, side, tyreM, rimM); steerG.add(wm);
    // brake drum backing plate (doesn't spin) and the hub
    const back = new THREE.Mesh(cylX(0.14, 0.03, -side * 0.05, 0, 0, 12), steelD); steerG.add(back);
    // a suspension arm from the body to the hub: drawn as a rod that we re-aim each frame
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1), odD); arm.name = 'arm'; g.add(arm);
    const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8, 1, true), mat(0x2a2c22, { side: THREE.DoubleSide })); g.add(spring);
    return { corner, steerG, wm, arm, spring, side, w, front: w.front };
  });

  const shell = [top.getObjectByName('topCanvas'), rearWin].filter(Boolean);
  const _a = V(), _b = V();
  const api = {
    group: g, shell, wheels, parts: { screen, top, mount, gun, star, spare },
    setVariant(v) {
      Object.assign(opts, v);
      screen.rotation.x = opts.screen === 'down' ? -1.62 : -0.12;   // folded flat onto the hood / raked back slightly
      top.visible = opts.top === 'canvas' && opts.screen !== 'down';
      mount.visible = opts.mount === 'm60';
    },
    // look: modelkit.lookFrom(sim); dt for the cosmetic bits
    animate(look, dt = 0) {
      for (let i = 0; i < wheels.length; i++) {
        const W = wheels[i], L = look?.wheels?.[i]; if (!L) continue;
        W.corner.position.y = R + L.dy - (L.flat || 0) * 0.08;
        W.steerG.rotation.y = -L.steer;
        W.wm.rotation.x = -L.spin;
        W.wm.rotation.z = W.side * (L.camber || 0) * 0.8;
        // arm: from the body pivot to the hub (independent: front A-arm inboard pivot / rear semi-trailing arm pivot)
        if (W.front) { _a.set(W.side * 0.30, 0.42, W.w.z); _b.set(W.w.x - W.side * 0.1, W.corner.position.y - 0.06, W.w.z); }
        else { _a.set(W.side * 0.25, 0.45, W.w.z - 0.45); _b.set(W.w.x - W.side * 0.1, W.corner.position.y - 0.02, W.w.z); }
        W.arm.position.copy(_a).add(_b).multiplyScalar(0.5); W.arm.lookAt(_b); W.arm.scale.set(1, 1, _a.distanceTo(_b));
        // coil spring between the arm and the body
        const top = 0.78, bot = W.corner.position.y + 0.02, sx = W.w.x - W.side * 0.28;
        W.spring.position.set(sx, (top + bot) / 2, W.w.z + (W.front ? 0.0 : -0.12)); W.spring.scale.set(1, top - bot, 1);
      }
    },
  };
  api.setVariant({});
  api.animate({ wheels: M151.wheels.map(() => ({ dy: 0, steer: 0, spin: 0 })) });
  return api;
}
