// SR-71A BLACKBIRD exterior model, built from the drawings (ngc/look-sr71): one real configuration, SR-71A 61-7964
// (64-17964) of the 9th Strategic Reconnaissance Wing, Beale AFB, as photographed on 2 August 1981 (DoD photo
// DF-ST-82-xxxxx series, public domain; docs/ngc1980/reference/sr71). Shape: lofted from the traced USAF three-view
// scaled by the flight manual's dimensions (sr71geo.js has every station); fit to the drawing: tools/blueprint/sr71.
// Everything that moves is driven by the sim (sr71fm.js) through animate(A): inlet spikes (26 in of travel on the Mach
// schedule), elevons (inboard + outboard, pitch and roll mixed), the all-moving fins, gear, canopies, the drag chute,
// afterburners with the J58's shock diamonds, lights.
// Paint: overall "iron ball" black (a ferrite-loaded blue-black, radar absorbing and heat radiating), white markings of
// the period: U.S. AIR FORCE on the forward fuselage, the national insignia on the fuselage and the left upper wing,
// the serial 17964 on the fins, 964 on the nacelles (1981 photo).
// Local frame: +x right, +y up, nose along -z, origin at the CG (sr71geo.js G.X_CG); ground under the static aircraft
// at y = -G.Y_CG. LODs (renderkit/lod.js): full detail to 90 m, medium to 420 m, a silhouette beyond.
import * as THREE from 'three';
import { M, B, mesh, cylZ, addM, canvasTex, drawStarBar, glass } from './meshkit.js';
import { createLOD } from '../../renderkit/lod.js';
import { decal as rkDecal } from '../../renderkit/gamemats.js';
import { G, D2R, toY, toZ, section, hUp, hLo, bodyGeometry, bodyPatch, BODY_X, nacelleGeometry, spikeGeometry, wingGeometry, wingPt, wingLE, wingTE, WING_TIP, finGeometry, finPt, FIN, ELEVON, bodyW, nacY } from './sr71geo.js';

export const SR71M = {
  L: G.LENGTH, GROUND_Y: -G.Y_CG,
  EYE: [0, toY(2.58), toZ(5.95)],          // pilot's eye: under the front canopy hump (X 5.95, Y 2.58 - INFERRED from the seat in fig. 1-1)
  EYE_RSO: [0, toY(2.62), toZ(7.95)],      // the RSO, behind the pilot
  CANOPY: [{ hinge: [toY(2.70), toZ(6.85)], X0: 5.25, X1: 6.85 }, { hinge: [toY(2.80), toZ(8.85)], X0: 7.35, X1: 8.85 }],
  NOSE_GEAR: [0, -G.Y_CG + G.GEAR.noseR, toZ(G.GEAR.noseX)], MAIN_GEAR: [G.GEAR.mainBL, -G.Y_CG + G.GEAR.wheelR, toZ(G.GEAR.mainX)],
  NAC: [G.NAC.bl, toY(nacY(G.NAC.exit))], EXIT_Z: toZ(G.NAC.exit), SPIKE_TIP_Z: toZ(G.NAC.spikeTip), SPIKE_TRAVEL: G.NAC.spikeTravel,
  CHUTE: [0, toY(2.86), toZ(G.CHUTE_X)],
};
const LOD_D = [90, 420];
const PAINT = 0x15171b;   // "iron ball" blue-black (the flight manual: "painted black to reduce internal temperatures")
const AIRD = { dust: 0.04, wear: 0.05, scale: 1.2, dustColor: 0x5e6066, bareColor: 0x6b6f76, panel: 0, streak: 0.22, streakColor: 0x2c2d31 };   // fuel-stain streaks: the JP-7 seeps from the tank sealant

// markings (canvas): white U.S. AIR FORCE, the serial, the insignia (full colour, as the 1981 photo's fuselage roundel)
const txt = (key, text, w, h, px, col = '#e9e9e2') => canvasTex('sr71' + key, w, h, (x, W, H) => { x.clearRect(0, 0, W, H); x.font = `bold ${px}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(text, W / 2, H / 2 + px * 0.04); });
const star = () => canvasTex('sr71star', 256, 128, (x, w, h) => { x.clearRect(0, 0, w, h); drawStarBar(x, w, h); });
// the black skin's detail texture: the radar-absorbing sawtooth wedges along the chine and wing edges are geometry-free
// (a texture on the edge bands), as are the corrugations of the wing skin (chordwise, the heat-expansion "wrinkles")
function decalMat(tex) {
  return rkDecal(() => new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), { map: tex, roughness: 0.6, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
}
// a decal laid ON a surface: f(u, v) -> [x, y, z] (model), u 0..1 across the texture left -> right, v 0..1 bottom -> top
function surfDecal(f, tex, parent, name, nu = 12, nv = 4) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...f(i / nu, j / nv)); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, d = a + nu + 1, c = d + 1; idx.push(a, b, d, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return mesh(g, decalMat(tex), parent, name);
}
// a point on the centre body's upper surface at station X, lateral x, lifted d along the surface normal
const _s = {};
function onBody(X, x, d = 0.006, top = true) {
  section(X, _s); const h = top ? hUp(_s, x) : hLo(_s, x), e = 0.01; section(X, _s); const h2 = top ? hUp(_s, x + e) : hLo(_s, x + e);
  const dx = 1, dy = (h2 - h) / e, L = Math.hypot(dx, dy), s = top ? 1 : -1;
  return [x - s * dy / L * d, toY(h) + s * dx / L * d, toZ(X)];
}
// the lateral x where the upper surface at X reaches height Y on one side (for lettering along the fuselage side)
function xAtY(X, Y, side) { section(X, _s); let a = _s.rb * 0.2, b = _s.W; for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (hUp(_s, m) > Y) a = m; else b = m; } return side * (a + b) / 2; }

export function buildSR71Model(opts = {}) {
  const serial = opts.serial || '17964', short = serial.slice(-3);
  const root = new THREE.Group(); root.name = 'sr71';
  const L0 = new THREE.Group(), L1 = new THREE.Group(), L2 = new THREE.Group(); L0.name = 'lod0'; L1.name = 'lod1'; L2.name = 'lod2'; root.add(L0, L1, L2);
  const S0 = { flatShading: false };
  const paintM = M(PAINT, { ...S0, shininess: 26, specular: 0x30343a, rk: { role: 'paint', detail: AIRD } });
  const paint2M = M(0x1b1d22, { ...S0, shininess: 16, rk: 'paint' });   // the nacelles' and fins' slightly lighter cast (photos)
  const tiM = M(0x5b5a58, { ...S0, shininess: 40, rk: 'metal' }), burnM = M(0x3a3430, { ...S0, shininess: 30, rk: 'grimy' });
  const ductM = M(0x0b0c0e, { side: THREE.BackSide, rk: 'dark' }), darkM = M(0x08090a, { rk: 'dark' });
  const gearM = M(0xb9bbb8, { ...S0, shininess: 50, rk: 'metal' }), tyreM = M(0x1c1c1c, { shininess: 4, rk: 'rubber' }), wellM = M(0x3d3f3e, { rk: 'dark' });
  const glassM = glass(() => new THREE.MeshPhongMaterial({ color: 0x8eb0c0, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), { color: 0x7a98a8, opacity: 0.34 });
  const frameM = M(0x1a1b1e, S0);
  // ---------------------------------------------------------------- LOD0: the full airframe
  // canopy glazing on the body loft: pilot windscreen + side windows, the RSO's side windows (photos, fig. 1-1)
  const glassAt = (X, x, Y) => {
    const ax = Math.abs(x);
    if (X > 5.12 && X < 5.95 && Y > 2.48 && ax < 0.50 && !(ax < 0.035)) return true;                  // windscreen (centre post)
    if (X > 6.05 && X < 6.75 && Y > 2.55 && ax > 0.17 && ax < 0.52) return true;                         // pilot side windows
    if (X > 7.55 && X < 8.25 && Y > 2.62 && ax > 0.25 && ax < 0.50) return true;                         // RSO side windows
    return false;
  };
  const inbElevon = (X, x) => Math.abs(x) > ELEVON.inX0 && Math.abs(x) < ELEVON.inX1 && X > ELEVON.inHinge;
  const bodyG = bodyGeometry({ glassAt, keep: (X, x, top) => !inbElevon(X, x) && !canopyCut(X, x, top) });
  function canopyCut(X, x, top) { return false; }
  const body = mesh(bodyG, [paintM, glassM], L0, 'fuselage');
  // the canopies' frames: a raised band around each glazed area (thin tubes along the sills)
  for (const [X0, X1, Y] of [[5.1, 6.85, 2.50], [7.35, 8.85, 2.62]]) for (const s of [-1, 1]) {
    const pts = []; for (let X = X0; X <= X1 + 1e-6; X += 0.1) { const x = xAtY(X, Y, s); pts.push(new THREE.Vector3(x, toY(Y) + 0.004, toZ(X))); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.018, 4), frameM, L0, 'canopyFrame');
  }
  // inside the glazing: the cockpit tubs (dark), seats and crew silhouettes for the outside view (the cockpit interior
  // proper is sr71cockpit.js, shown only from inside)
  const tub = mesh(new THREE.BoxGeometry(0.9, 0.7, 3.4).translate(0, toY(2.25), toZ(6.9)), darkM, L0, 'cockpitTub');
  const crew = new THREE.Group(); crew.name = 'crew'; L0.add(crew);
  const suitM = M(0xc9b07a, { rk: 'fabric' }), helmM = M(0xe6e2d6, { ...S0, shininess: 60 }), visorM = M(0xa07a2a, { shininess: 90, rk: 'lamp' });   // the David Clark S1030 pressure suit (gold-tan), white helmet, gold visor
  for (const [X, Y] of [[6.05, 2.22], [8.0, 2.30]]) {
    mesh(new THREE.CapsuleGeometry(0.2, 0.36, 3, 8).translate(0, toY(Y + 0.05), toZ(X + 0.12)), suitM, crew, 'torso');
    mesh(new THREE.SphereGeometry(0.17, 12, 9).translate(0, toY(Y + 0.42), toZ(X)), helmM, crew, 'helmet');
    mesh(new THREE.SphereGeometry(0.15, 10, 6, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.3, Math.PI * 0.32).translate(0, toY(Y + 0.42), toZ(X - 0.03)), visorM, crew, 'visor');
  }
  // the canopies: each hatch is a hinged group carrying its piece of the body loft's top (opened about the aft hinge)
  const canopies = SR71M.CANOPY.map((c, k) => {
    const g = new THREE.Group(); g.name = 'canopy' + k; g.position.set(0, c.hinge[0], c.hinge[1]); L0.add(g);
    return g;
  });
  // pitot mast (the trace's thin spike forward of the radome): ~0.85 m, tapered
  mesh(cylZ(0.012, 0.045, G.X_NOSE + 0.05, 8).translate(0, toY(1.47), toZ(G.X_NOSE / 2)), tiM, L0, 'pitot');
  // nacelles, cowl lips, inlet ducts, spikes, ejectors
  const spikes = [], burners = [], diamonds = [], ejectors = [];
  for (const s of [-1, 1]) {
    const nac = mesh(nacelleGeometry(s), paint2M, L0, 'nacelle');
    const lipX = G.NAC.lip, lr = 0.80;
    const lip = mesh(new THREE.TorusGeometry(lr - 0.025, 0.028, 6, 40).scale(G.NAC.rx / 0.88, G.NAC.ry / 0.88, 1).translate(s * G.NAC.bl, toY(nacY(lipX)), toZ(lipX)), tiM, L0, 'cowlLip');
    const duct = mesh(cylZ(lr - 0.05, 0.55, 3.2, 32, true).scale(G.NAC.rx / 0.88, G.NAC.ry / 0.88, 1).translate(s * G.NAC.bl, toY(nacY(lipX + 1.6)), toZ(lipX + 1.6)), ductM, L0, 'inletDuct');
    const face = mesh(new THREE.CircleGeometry(0.56, 24).translate(s * G.NAC.bl, toY(nacY(lipX + 3.15)), toZ(lipX + 3.15)), darkM, L0, 'compressorFace');
    const sp = new THREE.Group(); sp.name = 'spike'; sp.position.set(s * G.NAC.bl, toY(nacY(G.NAC.spikeTip)), toZ(G.NAC.spikeTip)); sp.rotation.x = -G.NAC.tilt; L0.add(sp);
    mesh(spikeGeometry(32), paint2M, sp, 'spikeCone'); spikes.push(sp);
    // bleed band on the spike (porous: a darker ring) and the forward bypass door louvres on the nacelle (photos)
    mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.42, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.13), M(0x232428, S0), sp, 'spikeBleed');
    // the ejector: the nacelle's last 1.7 m is the airframe-mounted blow-in-door ejector: free-floating flaps (dark
    // burnt titanium) around the J58's afterburner nozzle
    const ej = mesh(cylZ(0.84, 0.80, 0.45, 32, true).translate(s * G.NAC.bl, toY(nacY(G.NAC.exit)), toZ(G.NAC.exit - 0.22)), burnM, L0, 'ejectorFlaps'); ejectors.push(ej);
    mesh(cylZ(0.62, 0.66, 1.0, 28, true).translate(s * G.NAC.bl, toY(nacY(G.NAC.exit)), toZ(G.NAC.exit - 0.35)), M(0x2a2420, { side: THREE.DoubleSide, rk: 'grimy' }), L0, 'nozzle');
    mesh(new THREE.CircleGeometry(0.60, 24).rotateY(Math.PI).translate(s * G.NAC.bl, toY(nacY(G.NAC.exit)), toZ(G.NAC.exit - 0.9)), M(0x40342a, { rk: 'grimy' }), L0, 'burnerFace');
    // afterburner: a long blue-white core with shock diamonds (the J58's at low altitude, photos)
    const ab = new THREE.Group(); ab.name = 'burner'; ab.position.set(s * G.NAC.bl, toY(nacY(G.NAC.exit)), toZ(G.NAC.exit)); ab.rotation.x = -G.NAC.tilt; L0.add(ab);
    const core = mesh(cylZ(0.58, 0.20, 6.5, 20, true).translate(0, 0, 3.2), addM(0xffb070), ab, 'burnerFlame');
    const inner = mesh(cylZ(0.42, 0.05, 4.0, 16, true).translate(0, 0, 2.0), addM(0xdde8ff), ab, 'burnerCore');
    const dm = []; for (let k = 0; k < 6; k++) { const d = mesh(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 1, 1.5).translate(0, 0, 0.9 + k * 1.05), addM(0xffd0a0), ab, 'shockDiamond'); dm.push(d); }
    burners.push({ g: ab, core, inner }); diamonds.push(dm);
  }
  // outer wings: the fixed part, and the outboard elevons on their hinge (xi 0.80)
  const elevons = { out: [], in: [] };
  for (const s of [-1, 1]) {
    mesh(wingGeometry(s, 0, ELEVON.outXi, G.NAC.bl, WING_TIP), paintM, L0, 'wing');
    mesh(wingGeometry(s, ELEVON.outXi, 1, G.NAC.bl, ELEVON.outX0, 6), paintM, L0, 'wingRootTE');
    mesh(wingGeometry(s, ELEVON.outXi, 1, ELEVON.outX1, WING_TIP, 8), paintM, L0, 'wingTipTE');
    // the outboard elevon: hinge from (outX0, xi .80) to (outX1, xi .80)
    const p0 = new THREE.Vector3(...wingPt(ELEVON.outX0, ELEVON.outXi, true)), p1 = new THREE.Vector3(...wingPt(ELEVON.outX1, ELEVON.outXi, true));
    const h0 = new THREE.Vector3(s * p0.x, toY(p0.y), toZ(p0.z)), h1 = new THREE.Vector3(s * p1.x, toY(p1.y), toZ(p1.z));
    elevons.out.push(hingedPart(L0, wingGeometry(s, ELEVON.outXi, 1, ELEVON.outX0, ELEVON.outX1, 14, 6), paintM, s > 0 ? h0 : h1, s > 0 ? h1 : h0, 'elevonOut'));
    // the inboard elevon: the body's own surface aft of the hinge between inX0 and inX1
    const a0 = new THREE.Vector3(s * ELEVON.inX0, toY(G.WING.yRoot), toZ(ELEVON.inHinge)), a1 = new THREE.Vector3(s * ELEVON.inX1, toY(G.WING.yRoot), toZ(ELEVON.inHinge));
    const pg = bodyPatch(ELEVON.inHinge, 31.38, s > 0 ? ELEVON.inX0 : -ELEVON.inX1, s > 0 ? ELEVON.inX1 : -ELEVON.inX0, 10, 10);
    elevons.in.push(hingedPart(L0, pg, paintM, s > 0 ? a0 : a1, s > 0 ? a1 : a0, 'elevonIn'));
  }
  // fins: a fixed stub (the first 0.35 m of span) and the all-moving fin pivoting about a canted axis at 42 % root chord
  const fins = [];
  for (const s of [-1, 1]) {
    const stub = finGeometry(s, 10, 2); stub.scale(1, 1, 1);
    const fin = finGeometry(s, 16, 12);
    const piv = new THREE.Group(); piv.name = 'finPivot';
    const [bx, by, bz] = finPt(s, G.FIN.pivotFrac, 0), [tx, ty] = finPt(s, G.FIN.pivotFrac, 1);
    const base = new THREE.Vector3(bx, toY(by), toZ(bz)), axis = new THREE.Vector3(tx - bx, ty - by, 0).normalize();
    piv.position.copy(base); piv.userData.axis = axis; L0.add(piv);
    fin.translate(-base.x, -base.y, -base.z); mesh(fin, paint2M, piv, 'fin');
    fins.push(piv);
    // the fixed root fairing on the nacelle (the fin's base housing)
    const [fx0, fy0, fz0] = finPt(s, 0, 0), [fx1, , fz1] = finPt(s, 1, 0);
    mesh(new THREE.CapsuleGeometry(0.16, Math.abs(fz1 - fz0) - 0.3, 3, 10).rotateX(Math.PI / 2).scale(0.7, 0.55, 1).translate(fx0, toY(fy0 - 0.02), toZ((fz0 + fz1) / 2)), paint2M, L0, 'finRoot');
  }
  // gear: nose (two wheels, retracts forward), mains (three wheels abreast per leg, retract inboard) - fig. 1-1, photos
  const gear = buildGear(L0, { gearM, tyreM, wellM });
  // drag chute: the doors on the spine between the nacelles and the deployed chute (a 40 ft ring-slot canopy) on risers
  const chuteDoor = mesh(new THREE.BoxGeometry(0.62, 0.03, 1.15).translate(0, toY(2.86), toZ(G.CHUTE_X)), paint2M, L0, 'chuteDoor');
  const chute = buildChute(L0);
  // lights: the red anti-collision beacons (top and bottom), the position lights on the wing tips and the fins
  const lights = [];
  for (const [p, c, n] of [[[0, toY(2.86) + 0.04, toZ(14.5)], 0xff2a1a, 'beacon'], [[0, toY(1.10) - 0.04, toZ(16.0)], 0xff2a1a, 'beacon'], [[-WING_TIP + 0.1, toY(G.WING.yTip), toZ(wingLE(WING_TIP - 0.1) + 0.4)], 0xff2a1a, 'navLight'], [[WING_TIP - 0.1, toY(G.WING.yTip), toZ(wingLE(WING_TIP - 0.1) + 0.4)], 0x2aff5a, 'navLight']]) {
    const m = mesh(new THREE.SphereGeometry(0.06, 8, 6), B(c), L0, n); m.position.set(...p); lights.push(m);
  }
  // markings
  const decals = new THREE.Group(); decals.name = 'markings'; L0.add(decals);
  for (const s of [-1, 1]) {
    // U.S. AIR FORCE on the forward fuselage side above the chine (X 11.0 - 13.6), 0.30 m letters
    surfDecal((u, v) => { const X = s < 0 ? 11.0 + 2.7 * u : 13.7 - 2.7 * u; return onBody(X, xAtY(X, 2.02 + 0.36 * v, s)); }, txt('usaf', 'U.S. AIR FORCE', 1024, 128, 104), decals, 'usaf');
    // national insignia aft of it, on the side of the fuselage at the wing root (X 15.6 - 17.2)
    surfDecal((u, v) => { const X = s < 0 ? 15.4 + 1.8 * u : 17.2 - 1.8 * u; return onBody(X, xAtY(X, 1.80 + 0.86 * v, s)); }, star(), decals, 'insignia');
    // nacelle number 964, on the outboard side of the nacelle forward of the wing
    surfDecal((u, v) => { const X = s < 0 ? 20.2 + 1.1 * u : 21.3 - 1.1 * u, t = (0.15 + 0.35 * v) * s, r = 0.886; return [s * G.NAC.bl + Math.sin(Math.PI / 2 - 0.0) * r * s * Math.cos(t) * 1.0 * (G.NAC.rx / 0.88), toY(nacY(X) + r * (G.NAC.ry / 0.88) * Math.sin(t) * s), toZ(X)]; }, txt('nac' + short, short, 256, 128, 96), decals, 'nacelleNo');
  }
  // the serial on the outer face of both fins (17964, 0.35 m), placed in fin coordinates
  for (const [k, s] of [[0, -1], [1, 1]]) {
    const fin = fins[k], base = fin.position;
    const g = surfDecalGeo((u, v) => { const xi = s < 0 ? 0.30 + 0.5 * u : 0.80 - 0.5 * u, eta = 0.42 + 0.20 * v; const [x, y, z] = finPt(s, xi, eta, 0.012 + 0.07 * 4 * xi * (1 - xi) * 0.5); return [x - base.x, toY(y) - base.y, toZ(z) - base.z]; });
    mesh(g, decalMat(txt('ser' + serial, serial, 512, 128, 100)), fin, 'finSerial');
  }
  // left upper wing insignia (photo), and the right lower wing (USAF practice of the period: INFERRED, not visible)
  for (const [s, top] of [[-1, true], [1, false]]) {
    const xc = 6.4, Xc = (wingLE(xc) + wingTE(xc)) / 2;
    surfDecal((u, v) => { const x = xc - 0.9 + 1.8 * (top ? 1 - v : v), X = Xc - 0.45 + 0.9 * u; const p = wingPt(x, Math.max(0, Math.min(1, (X - wingLE(x)) / (wingTE(x) - wingLE(x)))), top); return [s * p[0], toY(p[1]) + (top ? 0.006 : -0.006), toZ(p[2])]; }, star(), decals, 'wingInsignia');
  }
  // ---------------------------------------------------------------- LOD1 / LOD2: the same lofts, coarser, no interior
  const l1 = mesh(bodyGeometry({ xs: [...new Set(BODY_X.filter((x, i) => i % 3 === 0 || (x > 29.2 && x < 31.6 && i % 2 === 0)).concat([BODY_X[BODY_X.length - 1]]))].sort((a, b) => a - b), nu: 24 }), paintM, L1, 'fuselageL1');
  for (const s of [-1, 1]) {
    mesh(nacelleGeometry(s, 20), paint2M, L1, 'nacelleL1');
    mesh(wingGeometry(s, 0, 1, G.NAC.bl, WING_TIP, 14, 8), paintM, L1, 'wingL1');
    mesh(finGeometry(s, 8, 4), paint2M, L1, 'finL1');
    const sp = mesh(spikeGeometry(14), paint2M, L1, 'spikeL1'); sp.position.set(s * G.NAC.bl, toY(nacY(G.NAC.spikeTip)), toZ(G.NAC.spikeTip)); sp.rotation.x = -G.NAC.tilt;
    mesh(new THREE.CircleGeometry(0.62, 12).rotateY(Math.PI).translate(s * G.NAC.bl, toY(nacY(G.NAC.exit)), toZ(G.NAC.exit)), darkM, L1, 'exitL1');
  }
  const l2body = mesh(bodyLow(), paintM, L2, 'fuselageL2');
  for (const s of [-1, 1]) {
    mesh(nacelleGeometry(s, 10), paintM, L2, 'nacelleL2');
    mesh(wingGeometry(s, 0, 1, G.NAC.bl, WING_TIP, 5, 3), paintM, L2, 'wingL2');
    mesh(finGeometry(s, 3, 2), paintM, L2, 'finL2');
  }
  const lod = createLOD(root, [{ object: L0, far: LOD_D[0] }, { object: L1, far: LOD_D[1] }, { object: L2 }]);
  // ---------------------------------------------------------------- animate from the sim state
  const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
  let beaconT = 0;
  function animate(A, dt = 0.016, time = 0, inside = false) {
    const sf = A.surf || {}, spike = A.spike || [0, 0];
    // elevons: + = trailing edge down. Left / right each: pitch +- roll (sr71fm.js mixes them)
    for (const k of [0, 1]) { const d = k ? sf.elevR || 0 : sf.elevL || 0; elevons.out[k].rotation.x = d; elevons.in[k].rotation.x = d; }
    // all-moving fins: + = trailing edge left (yaw left)
    for (const k of [0, 1]) { const f = fins[k]; f.quaternion.setFromAxisAngle(f.userData.axis, -(sf.rud || 0)); }
    // spikes: forward at low Mach, aft by 26 in on the schedule
    for (const k of [0, 1]) spikes[k].position.z = SR71M.SPIKE_TIP_Z + (spike[k] || 0) * SR71M.SPIKE_TRAVEL;
    gear.set(A.gear ?? 1, A.onGround ? A.strut || [0, 0, 0] : [0, 0, 0], A.steer || 0, A.wheelRot || 0);
    for (let k = 0; k < 2; k++) SR71M.CANOPY[k] && (canopies[k].rotation.x = (A.canopy || 0) * 0.62);
    chute.set(A.chute || 'stowed', A, dt, time); chuteDoor.visible = (A.chute || 'stowed') === 'stowed';
    // afterburners: length and colour with the burner setting and ambient pressure (long and diamond-studded low down,
    // a short pale cone at altitude), lit only when the burner is
    for (const k of [0, 1]) {
      const e = A.eng ? A.eng[k] : null, ab = e ? e.ab || 0 : 0, n = e ? e.n || 0 : 0, b = burners[k];
      const sig = Math.min(1, A.sigma ?? 1), on = ab > 0.02 && n > 0.6;
      b.g.visible = on; if (!on) continue;
      const fl = 0.55 + 0.8 * ab, fk = 0.85 + 0.15 * Math.sin(time * 37 + k * 2.1);
      b.core.material.opacity = (0.30 + 0.4 * ab) * fk * (0.5 + 0.5 * sig); b.core.scale.set(1, 1, fl * (0.6 + 0.5 * (1 - sig)));
      b.inner.material.opacity = 0.45 * ab * fk; b.inner.scale.set(1, 1, fl);
      for (const [i, d] of diamonds[k].entries()) { d.visible = sig > 0.25; d.material.opacity = (0.55 - i * 0.07) * ab * sig * fk; }
    }
    beaconT += dt; const on = A.lights !== false, blink = (beaconT % 1.1) < 0.12;
    for (const m of lights) m.visible = on && (m.name !== 'beacon' || blink);
    crew.visible = !inside; tub.visible = true;
  }
  return { group: root, animate, lod, parts: { body, spikes, elevons, fins, gear, chute, canopies, decals, burners }, SR71M };
}
// a hinged part: geometry in aircraft coordinates turning about the hinge p0 -> p1 (rotation.x; with p1 - p0 along +x a
// positive angle moves the trailing edge down)
function hingedPart(parent, geo, mat, p0, p1, name) {
  const o = new THREE.Group(); o.position.copy(p0); o.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3().subVectors(p1, p0).normalize()); o.updateMatrix();
  geo.applyMatrix4(o.matrix.clone().invert());
  const pv = new THREE.Group(); pv.name = name; o.add(pv); mesh(geo, mat, pv, name + 'Skin'); parent.add(o); return pv;
}
function surfDecalGeo(f, nu = 12, nv = 4) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...f(i / nu, j / nv)); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, d = a + nu + 1, c = d + 1; idx.push(a, b, d, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// LOD2 body: a coarse loft of the same sections (16 stations x 8 per side)
function bodyLow() {
  const Xs = [0.9, 2, 3.5, 5.2, 6.5, 8.5, 12, 16.5, 18.5, 21, 25, 28.5, 30, 31.3, 32, 32.7], n = 8, S = {}, pos = [], idx = [];
  for (const top of [true, false]) {
    const base = pos.length / 3;
    for (const X of Xs) { section(X, S); for (let j = 0; j <= n; j++) { const x = -S.W + 2 * S.W * (1 - Math.cos(Math.PI * j / n)) / 2; pos.push(x, toY(top ? hUp(S, x) : hLo(S, x)), toZ(X)); } }
    for (let i = 0; i < Xs.length - 1; i++) for (let j = 0; j < n; j++) { const a = base + i * (n + 1) + j, b = a + 1, d = a + n + 1, c = d + 1; idx.push(...(top ? [a, d, b, b, d, c] : [a, b, d, b, c, d])); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// ---- the undercarriage: nose leg (twin wheels) and two main legs (three wheels abreast), wells and doors
function buildGear(parent, { gearM, tyreM, wellM }) {
  const gy = -G.Y_CG, root = new THREE.Group(); root.name = 'gear'; parent.add(root);
  const legs = [];
  const mk = (x, X, R, nW, attachY, foldAxis, foldSign, name) => {
    const top = new THREE.Vector3(x, toY(attachY), toZ(X));
    const pv = new THREE.Group(); pv.name = name; pv.position.copy(top); root.add(pv);
    const len = attachY - R; // strut length from the attach point to the axle
    const strut = mesh(new THREE.CylinderGeometry(0.075, 0.09, len, 10).translate(0, -len / 2, 0), gearM, pv, 'gearStrut');
    const axle = new THREE.Group(); axle.name = 'gearAxle'; axle.position.set(0, -len, 0); pv.add(axle);
    const wheels = [];
    for (let i = 0; i < nW; i++) {
      const off = nW === 2 ? (i - 0.5) * 0.36 : (i - 1) * 0.30, w = new THREE.Group(); w.position.x = off; axle.add(w);
      mesh(new THREE.CylinderGeometry(R, R, 0.16, 18).rotateZ(Math.PI / 2), tyreM, w, 'tyre'); mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.18, 10).rotateZ(Math.PI / 2), gearM, w, 'hub'); wheels.push(w);
    }
    legs.push({ pv, axle, wheels, foldAxis, foldSign, len });
    return pv;
  };
  mk(0, G.GEAR.noseX, G.GEAR.noseR, 2, 1.12, 'x', 1, 'noseGear');
  for (const s of [-1, 1]) mk(s * G.GEAR.mainBL, G.GEAR.mainX, G.GEAR.wheelR, 3, 1.62, 'z', s, 'mainGear');
  // wells (dark recesses drawn as plates under the belly, seen only with the gear down) and doors
  const wells = [mesh(new THREE.BoxGeometry(0.55, 0.02, 1.9).translate(0, toY(1.13), toZ(G.GEAR.noseX - 0.6)), wellM, root, 'gearWell')];
  for (const s of [-1, 1]) wells.push(mesh(new THREE.BoxGeometry(1.5, 0.02, 1.4).translate(s * 1.7, toY(1.58), toZ(G.GEAR.mainX)), wellM, root, 'gearWell'));
  let lastDown = -1;
  return {
    root, legs,
    set(down, strut, steer, rot) {
      const d = Math.max(0, Math.min(1, down));
      for (const [i, L] of legs.entries()) {
        if (L.foldAxis === 'x') L.pv.rotation.x = -(1 - d) * 1.62;   // nose leg folds forward into the well
        else L.pv.rotation.z = L.foldSign * (1 - d) * 1.55;          // mains fold inboard
        L.axle.position.y = -L.len + (strut[i] || 0);
        for (const w of L.wheels) w.rotation.x = rot;
        if (i === 0) L.axle.rotation.y = steer;
      }
      if (d !== lastDown) { root.visible = d > 0.001; for (const w of wells) w.visible = d > 0.02; lastDown = d; }
    },
  };
}
// ---- the drag chute: stowed / deployed (inflates over ~1.2 s behind the tail on 30 m risers) / jettisoned
function buildChute(parent) {
  const g = new THREE.Group(); g.name = 'dragChute'; parent.add(g); g.visible = false;
  const canM = M(0xd8c48a, { side: THREE.DoubleSide, rk: 'fabric' }), canM2 = M(0xb8402e, { side: THREE.DoubleSide, rk: 'fabric' });
  const D = 12.2;   // 40 ft canopy
  const can = new THREE.Group(); can.position.set(0, 0, 0); g.add(can);
  const cg = new THREE.SphereGeometry(D / 2, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.42); cg.rotateX(Math.PI / 2);
  const c1 = mesh(cg, canM, can, 'chuteCanopy');
  const ring = mesh(new THREE.TorusGeometry(D / 2 * 0.96, 0.18, 4, 32), canM2, can, 'chuteBand'); ring.position.z = D / 2 * Math.cos(Math.PI * 0.42) * 0.0;
  const risers = mesh(new THREE.ConeGeometry(D / 2 * 0.9, 1, 12, 1, true).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcfc6b0, wireframe: true, transparent: true, opacity: 0.5 }), g, 'chuteRisers');
  let inflate = 0, state = 'stowed';
  return {
    g,
    set(st, A, dt, time) {
      if (st !== state) { state = st; if (st === 'deployed') inflate = 0; }
      g.visible = st === 'deployed';
      if (!g.visible) return;
      inflate = Math.min(1, inflate + dt / 1.2);
      const L = 32, k = inflate;   // riser length (m) behind the compartment
      g.position.set(SR71M.CHUTE[0], SR71M.CHUTE[1] + 0.6, SR71M.CHUTE[2]);
      can.position.set(Math.sin(time * 1.3) * 0.25, 0.2 + Math.sin(time * 1.7) * 0.15, L);
      can.scale.set(0.2 + 0.8 * k, 0.2 + 0.8 * k, 0.4 + 0.6 * k);
      risers.scale.set(0.2 + 0.8 * k, 0.2 + 0.8 * k, L - 1); risers.position.set(0, 0.1, (L - 1) / 2 + 1);
    },
  };
}
