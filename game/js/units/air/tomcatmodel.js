// F-14A TOMCAT exterior model, rebuilt from the drawings (ngc/look-tomcat): one real configuration, the F-14A-95-GR
// BuNo 160382 of VF-84 "Jolly Rogers", CVW-8, USS Nimitz, as photographed escorting a Tu-95 in September 1980 (U.S. Navy
// photo USN 1179034, public domain; docs/ngc1980/findings/look-tomcat.md has the configuration table by FS / WL / BL). Shape: lofted from the traced NASA TP-2769 / TM-83250 / CR-163098 three-views
// (public domain, docs/ngc1980/reference/f14a); every station in tomcatgeo.js. Fit to the drawing: tools/blueprint/f14a.
// Everything that moves is driven by the sim (tomcatfm.js) through animate(A): swing wings on the real pivot (BL 107),
// glove vanes, slats, flaps, spoilers, differential stabilators on their 9.5 deg swept pivots, rudders, speedbrakes,
// gear (nose with launch bar), hook, canopy, TF30 nozzles and afterburner, lights, the missiles on their stations.
// Paint: overall gloss light gull grey FS 16440 (the 1977 change from gull grey over white), VF-84 markings: black fins
// with the white skull and crossbones, yellow fin caps, tail code AJ, modex 2xx, full-colour national insignia.
// Local frame: +x right, +y up, nose along -z, origin at the sim's CG (= the drawings' moment reference, FS 92.933 cm
// model); ground under the static jet at y -2.37. LODs: setLod(0 | 1 | 2) or automatic by camera distance.
import * as THREE from 'three';
import { M, B, V, slab, merge, cylZ, boxG, mesh, rod, hinged, tube, wheel, addM, canvasTex, decal, drawStarBar, glass } from './meshkit.js';
import { TOMCAT, STATIONS } from './tomcatfm.js';
import { G, D2R, fuselageGeo, canopyGeo, canopyHoop, nacelleGeo, nacelleAt, zLip, LIP_TOP, airfoilGeo, outward, wingLE, wingTEout, GLOVE, Z_BOW, Z_GLASS_END, sill, fuseB, fuseW, canopyW } from './tomcatgeo.js';

const P0 = G.PIVOT, HOOK_PIVOT = G.HOOK.pivot, HOOK_LEN = G.HOOK.len, HOOK_UP = G.HOOK.up;
const HOOK_DOWN = Math.asin((HOOK_PIVOT[1] - TOMCAT.HOOK_TIP[1]) / HOOK_LEN);   // the tip at the sim's hook height (deck level)
export const TCAT = {
  L: G.LENGTH, EYE: [0, 0.38, -6.87], EYE_RIO: [0, 0.43, -5.64], PIVOT: P0,
  HOOK_PIVOT, HOOK_LEN, HOOK_UP, HOOK_DOWN, CANOPY_HINGE: [0, 0.30, -2.95], CANOPY_OPEN: 0.42,
  COCKPIT_OFFSET: [0, -0.66, -1.42],   // the cockpit interior (tomcatcockpit.js, built in the old frame) moves by this
};
const LOD_D = [70, 260];   // m: full detail inside 70 m, medium to 260 m, silhouette beyond (ngc/perf-render budgets: see findings)

// the squadron art on the outer face of each (black) fin: VF-84's white skull and crossbones, the AJ tail code of CVW-8 near
// the top (as on BuNo 160382 in September 1980); transparent elsewhere, so the fin's black paint shows round it
function tailArt(modex) {
  return canvasTex('tcatTailAJ' + modex, 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#f2f2ee'; x.strokeStyle = '#f2f2ee';
    const cx = w * 0.56, cy = h * 0.60, r = w * 0.13;
    x.lineCap = 'round'; x.lineWidth = w * 0.06;   // the crossbones
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(cx - r * 2.0, cy + d * r * 1.7); x.lineTo(cx + r * 2.0, cy - d * r * 1.7 + r * 0.2); x.stroke(); for (const e of [-1, 1]) { x.beginPath(); x.arc(cx + e * r * 2.05, cy + (e === -1 ? d : -d) * r * 1.72, w * 0.035, 0, Math.PI * 2); x.fill(); } }
    x.beginPath(); x.arc(cx, cy - r * 0.15, r, 0, Math.PI * 2); x.fill(); x.fillRect(cx - r * 0.55, cy + r * 0.5, r * 1.1, r * 0.55);   // the skull, the jaw
    x.fillStyle = '#121314'; for (const e of [-1, 1]) { x.beginPath(); x.ellipse(cx + e * r * 0.4, cy - r * 0.2, r * 0.27, r * 0.32, 0, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.moveTo(cx, cy + r * 0.05); x.lineTo(cx - r * 0.12, cy + r * 0.32); x.lineTo(cx + r * 0.12, cy + r * 0.32); x.fill();
    for (let k = -2; k <= 2; k++) x.fillRect(cx + k * r * 0.22 - 1, cy + r * 0.62, 2, r * 0.4);
    x.fillStyle = '#f2f2ee'; x.font = 'bold 50px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('AJ', w * 0.70, h * 0.17);
  });
}
function noseNumber(modex) {
  return canvasTex('tcatModex' + modex, 128, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = 'bold 48px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1b1e22'; x.fillText(String(modex), w / 2, h / 2 + 2); });
}
function stencil(key, text, px = 30, col = '#1b1e22') {
  return canvasTex('tcatSt' + key, 256, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = `bold ${px}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(text, w * 0.5, h * 0.5); });
}
const starTex = () => canvasTex('starbar', 256, 128, (x, w, h) => { x.clearRect(0, 0, w, h); drawStarBar(x, w, h); });
// geometry shared by every Tomcat (the player's and the AI's): built once per LOD
// RenderKit surface detail WITHOUT the generic procedural panel grid (panel 0): a square grid is a look-alike tell. Panel
// lines and doors are only the ones the drawings locate (configuration table, findings/look-tomcat.md)
const AIRD = { dust: 0.08, wear: 0.06, scale: 1.6, dustColor: 0x8f8a7c, bareColor: 0x9a9ea0, panel: 0, streak: 0.14, streakColor: 0x34302a };
const GEO = new Map();
const geo = (key, make) => { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); };

export function buildTomcatModel(side = 1, { modex = 201 } = {}) {
  const g = new THREE.Group(); g.name = 'tomcat';
  const S0 = { flatShading: false };
  const greyM = M(0xa9afb4, { ...S0, rk: { detail: AIRD } }), whiteM = M(0xa4aaaf, { ...S0, rk: { detail: AIRD } }),   /* undersides: overall gull grey in 1980 (a shade lighter in shadow-side light) */ radomeM = M(0x9fa5aa, { ...S0, rk: 'flat' }), darkM = M(0x25282b, S0), blackM = M(0x0c0d0e, { shininess: 5, rk: 'dark' });
  const metalM = M(0x4c5055, { shininess: 50 }), gearM = M(0xe2e4e2), tyreM = M(0x1b1b1b, { shininess: 4, rk: 'rubber' }), walkM = M(0x6d7277, { rk: 'flat' });
  const finM = M(0x16181a, { ...S0, rk: { detail: AIRD } }), capM = M(0xe8b81a, S0), glassM = glass(() => new THREE.MeshPhongMaterial({ color: 0x9fc6d8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), { color: 0x8fb2c4, opacity: 0.24 });
  const frameM = M(0x3a3e42), crewM = M(0x4d5a3c, { rk: 'fabric' }), helmM = M(0xeceee8), visorM = M(0x1d2a33, { shininess: 90, rk: 'lamp' }), seatM = M(0x2c2f31, { rk: 'fabric' });
  const ductM = M(0x1a1c1e, { side: THREE.BackSide, rk: 'dark' }), linerM = M(0x2a2c2e, { side: THREE.DoubleSide, shininess: 30 });
  const detail = [];            // small parts hidden past LOD 0
  const lodMesh = [];           // [mesh, [geo0, geo1, geo2]]
  const lodded = (key, make, mats, parent, name) => { const gs = [0, 1, 2].map(l => geo(key + l, () => make(l))), m = mesh(gs[0], mats, parent, name); lodMesh.push([m, gs]); return m; };
  const det = m => { detail.push(m); return m; };

  // ---- fuselage: radome, nose, cockpit, spine, the centre body between the nacelles, beaver tail (one loft)
  const fus = lodded('fus', fuselageGeo, [greyM, whiteM, radomeM, darkM], g, 'fuselage');
  // ---- intakes and nacelles (raked 2D intakes, round TF30 nacelles), with the dark ducts inside
  for (const s of [-1, 1]) {
    lodded('nac' + s, l => nacelleGeo(s, l), [greyM, whiteM], g, 'nacelle');
    // duct: the same section 6 cm in, from the lip 1.6 m down to the first compressor face
    const duct = geo('duct' + s, () => { const pts = [], n = 16; for (const z of [0, 1.6]) { for (let j = 0; j <= n; j++) { const ph = Math.PI * 2 * j / n, N = nacelleAt(-5.25 + z * 0.5), cy = (N.top + N.bot) / 2, a = N.a - 0.06, b = (N.top - N.bot) / 2 - 0.06, sn = Math.sin(ph), cs = Math.cos(ph), y = cy + b * Math.sign(cs) * Math.abs(cs) ** 0.33; pts.push(s * (N.cx + a * Math.sign(sn) * Math.abs(sn) ** 0.33), y, zLip(y) + 0.03 + z); } } const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const ix = []; for (let j = 0; j < n; j++) ix.push(j, j + 1, n + 1 + j, j + 1, n + 2 + j, n + 1 + j); gg.setIndex(ix); gg.computeVertexNormals(); return gg; });
    mesh(duct, ductM, g, 'intakeDuct');
    const N0 = nacelleAt(-4.4); mesh(new THREE.PlaneGeometry(2 * N0.a - 0.1, N0.top - N0.bot - 0.12).translate(s * N0.cx, (N0.top + N0.bot) / 2, -3.62), blackM, g, 'compressorFace');
    // the variable ramp: the duct's upper wall, a lighter panel just inside the top lip
    mesh(boxG(0.66, 0.03, 1.2, s * nacelleAt(-5.0).cx, LIP_TOP[0] - 0.08, LIP_TOP[1] + 0.68), M(0x5d6268), g, 'intakeRamp');
  }

  // ---- gloves: the fixed inboard wing from the intakes out to the pivots (traced at 68 deg), enclosing the wing roots
  const gloveGeo = s => outward(airfoilGeo({ u0: GLOVE.x0, u1: GLOVE.x1, nu: 18, nc: 16, LE: GLOVE.LE, TE: GLOVE.TE, tc: u => GLOVE.t(u) / (GLOVE.TE(u) - GLOVE.LE(u)), map: (u, z, h) => [s * u, GLOVE.y + h, z], cap1: true, split: true }));
  const vanes = [];
  for (const s of [-1, 1]) {
    mesh(geo('glove' + s, () => gloveGeo(s)), [greyM, whiteM], g, 'glove');
    // glove vane: swings out of the glove leading edge (pivot FS 55.668 / BL 14.499; 20.4 cm x 12 long; programmed out above M 1.4)
    const vp = new THREE.Group(); vp.position.set(s * 1.74, GLOVE.y, -4.47); g.add(vp);
    det(mesh(slab([[0, 0, .05], [0.30, 2.45, .03], [0.0, 2.45, .03]], (a, b, w) => [s * a, w, b - 0.0]), greyM, vp, 'gloveVane'));
    vanes.push({ g: vp, s });
    det(mesh(new THREE.CylinderGeometry(0.30, 0.34, 0.04, 16).translate(s * P0[0], GLOVE.y + GLOVE.t(P0[0]) / 2 - 0.005, P0[2]), M(0x9ea4a9, S0), g, 'pivotCap'));
  }
  // the inlet bleed doors (two, side by side) on top of each intake duct behind the glove leading edge (TP-2769 fig. 2a top view, 'Inlet bleed': FS 83.3-89.7 cm, BL 6.3-11.1 cm model)
  for (const s of [-1, 1]) for (const k of [0, 1]) det(mesh(boxG(0.27, 0.006, 0.74, s * (0.89 + k * 0.30), 0.078, -1.39), M(0x8c9297, S0), g, 'bleedDoor'));
  // ---- the deck between the nacelles aft of the gloves (fins, stabilator roots) and the beaver tail between the nozzles
  const deckGeo = () => outward(airfoilGeo({ u0: -1.95, u1: 1.95, nu: 20, nc: 14, LE: u => 1.2 + Math.abs(u) * 0.2, TE: u => pl2(Math.abs(u)), tc: u => (0.32 - 0.08 * Math.abs(u) / 1.95) / (pl2(Math.abs(u)) - 1.2 - Math.abs(u) * 0.2), map: (u, z, h) => [u, -0.17 + h + 0.05 * (1 - (z - 1.2) / 5), z], cap0: true, cap1: true }));
  const pl2 = a => a < 0.62 ? 5.9 : a < 1.2 ? 5.9 - (a - 0.62) * 0.4 : 5.67 - (a - 1.2) * 1.2;
  mesh(geo('deck', deckGeo), greyM, g, 'deck');
  mesh(geo('beaver', () => outward(airfoilGeo({ u0: -0.55, u1: 0.55, nu: 10, nc: 12, LE: () => 5.3, TE: u => 7.62 - 0.9 * (Math.abs(u) / 0.55) ** 2, tc: () => 0.13, map: (u, z, h) => [u * (1 - 0.45 * Math.max(0, (z - 6.0) / 1.62)), -0.36 + h * (1 - 0.5 * Math.max(0, (z - 6.0) / 1.62)), z], cap0: true, cap1: true }))), greyM, g, 'beaverTail');
  det(mesh(cylZ(0.05, 0.04, 0.45, 8).translate(0, -0.34, 7.75), metalM, g, 'fuelDump'));   // the fuel dump mast at the end of the beaver tail
  // speedbrakes: upper and lower panels on the beaver tail, hinged at their front edges (shown when open: closed, the skin is the panel)
  const sbU = hinged(g, slab([[-0.42, 6.05, .03], [0.42, 6.05, .03], [0.36, 7.25, .03], [-0.36, 7.25, .03]], (a, b, w) => [a, -0.26 + w, b]), greyM, V(-0.5, -0.26, 6.05), V(0.5, -0.26, 6.05), 'speedbrakeUp');
  const sbL = [-1, 1].map(s => hinged(g, slab([[0.06, 6.05, .03], [0.42, 6.05, .03], [0.36, 7.15, .03], [0.08, 7.15, .03]], (a, b, w) => [s * a, -0.47 + w, b]), whiteM, V(-0.6, -0.47, 6.05), V(0.6, -0.47, 6.05), 'speedbrakeLow'));

  // ---- TF30 nozzles (TP-2769 fig. 4c): shroud 1.28 m, petals to the exit (radius from the sim), liner, burner face, flame
  const NZ = G.NOZZLE, eng = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.name = 'engine' + (s < 0 ? 'L' : 'R'); e.position.set(s * NZ.x, NZ.y, 0); g.add(e);
    mesh(cylZ(NZ.shroudR, NZ.shroudR * 0.94, 0.32, 20, true), metalM, e, 'shroud').position.z = NZ.z0 + 0.16;
    const L = NZ.len - 0.32, petGeo = cylZ(1, 1, L, 20, true), pp = petGeo.attributes.position, base = [];
    for (let i = 0; i < pp.count; i++) { const zz = pp.getZ(i); base.push(i, pp.getX(i), pp.getY(i), zz > 0 ? 1 : 0); if (zz <= 0) { pp.setX(i, pp.getX(i) * NZ.shroudR * 0.94); pp.setY(i, pp.getY(i) * NZ.shroudR * 0.94); } }
    const petals = mesh(petGeo, M(0x3e4146, { shininess: 60, side: THREE.DoubleSide }), e, 'petals'); petals.position.z = NZ.z0 + 0.32 + L / 2;
    mesh(cylZ(0.5, 0.5, 0.9, 16, true), linerM, e, 'liner').position.z = NZ.z0 + 0.4;
    const faceM = B(0x000000), face = mesh(new THREE.CircleGeometry(0.52, 16), faceM, e, 'burnerFace'); face.position.z = NZ.z0 + 0.0;
    det(mesh(cylZ(0.17, 0.0, 0.35, 10), M(0x1a1a1a), e, 'tailCone')).position.z = NZ.z0 + 0.2;
    const cone = new THREE.CylinderGeometry(0, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const fl = new THREE.Group(); fl.position.z = NZ.z0 + NZ.len + 0.05; e.add(fl);
    const outer = mesh(cone, addM(0xff8a3a), fl, 'abOuter'), core = mesh(cone, addM(0x9cc2ff), fl, 'abCore'), dm = addM(0xd8e8ff), diamonds = [];
    for (let k = 0; k < 4; k++) diamonds.push(mesh(new THREE.SphereGeometry(1, 8, 4), dm, fl, 'shockDiamond'));
    eng.push({ petals, pp, base, faceM, fl, outer, core, dm, diamonds, ph: s * 1.7 });
  }

  // ---- vertical tails (TM-83250 fig. 3f: NACA 65A004.5, canted 5 deg out at BL 11.644) with rudders; squadron art outside
  const VT = G.VTAIL, surf = {};
  const vLE = h => VT.rootLE + h * ((VT.tipTE - VT.tipC) - VT.rootLE) / VT.h, vTE = h => VT.rootLE + VT.rootTEx + h * (VT.tipTE - VT.rootLE - VT.rootTEx) / VT.h;
  const vHinge = h => vTE(h) - (0.95 - 0.25 * h / VT.h);   // rudder hinge line (rudder chord 0.95 m at the root, 0.70 m at the top)
  const R0 = 0.16, R1 = VT.h - 0.28;
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R';
    const map = (h, z, w) => [s * (VT.x + h * Math.sin(VT.cant) + w * Math.cos(VT.cant)), VT.y + h * Math.cos(VT.cant) - w * Math.sin(VT.cant), z], mapS = map;   // h up the canted fin, w outward
    const tipLE = h => vLE(h) + 0.5 * VT.tipC * Math.max(0, (h - (VT.h - 0.35)) / 0.35) ** 2;   // the rounded tip leading edge
    const fin = (u0, u1, TE) => outward(airfoilGeo({ u0, u1, nu: Math.max(2, Math.round((u1 - u0) * 6)), nc: 14, LE: tipLE, TE, tc: () => VT.tc, map: mapS, cap0: true, cap1: true }));
    mesh(geo('fin' + s, () => merge([fin(0, R0, vTE), fin(R0, R1, vHinge), fin(R1, VT.h - 0.30, vTE)])), finM, g, 'fin' + S);
    mesh(geo('finCap' + s, () => fin(VT.h - 0.30, VT.h, vTE)), capM, g, 'finCap' + S);   // VF-84's yellow fin cap
    const rg = outward(airfoilGeo({ u0: R0, u1: R1, nu: 8, nc: 8, LE: vHinge, TE: vTE, tc: h => VT.tc * 0.6 * (vTE(h) - vLE(h)) / (vTE(h) - vHinge(h)), map: mapS, cap0: true, cap1: true }));
    const a = V(...mapS(R0, vHinge(R0), 0)), b = V(...mapS(R1, vHinge(R1), 0));
    surf['rud' + S] = hinged(g, rg, finM, a, b, 'rudder' + S);
    // squadron art on the outer face (texture u runs nose-ward as seen from outside, v up the fin)
    const art = decal(tailArt(modex), 2.5, 2.5, g, 'tailArt' + S);
    art.position.copy(V(...map(1.30, 5.80, 0.07)));
    art.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -s), V(s * Math.sin(VT.cant), Math.cos(VT.cant), 0), V(s * Math.cos(VT.cant), -Math.sin(VT.cant), 0)));
    surf['finTip' + S] = V(...map(VT.h, VT.tipTE - 0.1, 0));
    det(mesh(cylZ(0.07, 0.05, 0.55, 8).translate(...map(VT.h - 0.06, VT.tipTE + 0.12, 0)), M(0x9ea4a9), g, 'finTipFairing'));   // ECM / position light fairing on the fin cap
  }

  // ---- all-moving stabilators (fig. 3c: NACA 65A004.6 root, 3.5 deg anhedral, pivots on a 9.49 deg swept axis)
  const HT = G.HTAIL;
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', y = u => HT.y - u * Math.tan(HT.anh);
    const LE = u => HT.rootLE + u * HT.tipLEz / HT.span + 0.35 * Math.max(0, (u - (HT.span - 0.45)) / 0.45) ** 2 * 0.8;
    const TE = u => HT.rootLE + HT.rootC + u * (HT.tipTEz - HT.rootC) / HT.span;
    const gg = geo('stab' + s, () => outward(airfoilGeo({ u0: 0, u1: HT.span, nu: 14, nc: 14, LE, TE, tc: () => HT.tc, map: (u, z, h) => [s * (HT.x + u), y(u) + h, z], cap0: true, cap1: true, split: true })).clone());
    const ax = u => V(s * (HT.x + u), y(u), HT.rootLE + HT.axisZ + u * Math.tan(HT.axisSweep));
    surf['stab' + S] = hinged(g, gg.clone(), [greyM, whiteM], ...(s > 0 ? [ax(0), ax(HT.span)] : [ax(HT.span), ax(0)]), 'stab' + S);
  }
  // ---- ventral fins under the nacelles (fig. 3d), canted out
  for (const s of [-1, 1]) {
    const VF = G.VENTRAL, D = 0.553, LE = u => VF.z0 + 0.463 * u / D, TE = u => u < 0.114 ? VF.z1 : VF.z1 - (u - 0.114) / (D - 0.114) * (VF.z1 - VF.z0 - 0.463) + 0.001;
    const vf = mesh(geo('ventral' + s, () => outward(airfoilGeo({ u0: 0, u1: D - 0.01, nu: 6, nc: 10, LE, TE, tc: () => 0.06, map: (u, z, h) => [h, -u, z], cap0: true, cap1: true }))), greyM, g, 'ventral');
    vf.position.set(s * VF.x, VF.y + 0.05, 0); vf.rotation.z = s * VF.cant;
  }

  // ---- swing wings: the reference wing (fig. 3a) on the pivot, built at 20 deg: slats, main box, flaps; spoilers
  const WG = G.WING, wings = [], tipRound = x => 0.5 * WG.tipC * Math.max(0, (x - (WG.semi - 0.5)) / 0.5) ** 2.2;
  const LEw = x => wingLE(x) + tipRound(x), TEw = x => wingTEout(x) - 0.25 * tipRound(x), tcw = x => 0.0965 - (x - 2.3) / (WG.semi - 2.3) * 0.0075;
  const X_IN = 2.30, X_F0 = 3.40, X_F1 = 8.55, X_S1 = 9.35;
  const frac = (x, f) => LEw(x) + f * (TEw(x) - LEw(x));
  // a chordwise strip [f0, f1] of the wing between spans x0..x1 (absolute frame), relative to the pivot
  const strip = (s, x0, x1, f0, f1, nu) => {
    const cs = Array.from({ length: 9 }, (_, i) => f0 + (f1 - f0) * (1 - Math.cos(Math.PI * i / 8)) / 2);
    return outward(airfoilGeo({ u0: x0, u1: x1, nu, LE: LEw, TE: TEw, tc: tcw, chordPts: f0 === 0 && f1 === 1 ? null : cs, nc: 16, map: (u, z, h) => [s * u - s * P0[0], h, z - P0[2]], cap0: true, cap1: true, split: true }));
  };
  for (const s of [-1, 1]) {
    const pv = new THREE.Group(); pv.name = 'wingPivot' + (s < 0 ? 'L' : 'R'); pv.position.set(s * P0[0], P0[1], P0[2]); g.add(pv);
    [[X_IN, X_F0, 0, 1, 4], [X_F0, X_F1, 0.14, 0.74, 14], [X_F1, X_S1, 0.14, 1, 3], [X_S1, WG.semi, 0, 1, 6]].forEach((a, k) => mesh(geo('wing' + s + k, () => strip(s, ...a)), [greyM, whiteM], pv, 'wing'));
    const hp = (x, f) => V(s * x - s * P0[0], 0, frac(x, f) - P0[2]), pair = (a, b) => s > 0 ? [a, b] : [b, a];
    const slat = hinged(pv, strip(s, X_F0, X_S1, 0, 0.14, 16), [greyM, whiteM], ...pair(hp(X_F0, 0.14), hp(X_S1, 0.14)), 'slat');
    const flap = hinged(pv, strip(s, X_F0, X_F1, 0.74, 1, 14), [greyM, whiteM], ...pair(hp(X_F0, 0.74), hp(X_F1, 0.74)), 'flap');
    const spoilers = [];
    for (let k = 0; k < 4; k++) {   // four spoilers per wing ahead of the flaps (roll below 57 deg sweep, ground roll-out dump)
      const x0 = 3.6 + k * 1.15, x1 = x0 + 1.05, f0 = 0.56, f1 = 0.73, t = (x, f) => tcw(x) * (TEw(x) - LEw(x)) * 0.5 * 5 * (0.2969 * Math.sqrt(f) - 0.126 * f - 0.3516 * f * f + 0.2843 * f ** 3 - 0.1036 * f ** 4) + 0.008;
      const sp = hinged(pv, slab([[x0, frac(x0, f0), .012], [x1, frac(x1, f0), .012], [x1, frac(x1, f1), .012], [x0, frac(x0, f1), .012]], (a, b, w) => [s * a - s * P0[0], t(a, 0.6) + w, b - P0[2]]), M(0x9ea4a9, S0), ...pair(V(s * x0 - s * P0[0], t(x0, f0), frac(x0, f0) - P0[2]), V(s * x1 - s * P0[0], t(x1, f0), frac(x1, f0) - P0[2])), 'spoiler');
      sp.children[0].visible = false; spoilers.push(sp);
    }
    // 1980 practice: insignia on top of the left wing and under the right; NAVY under the left; nav light at the tip
    const xi = 6.4, zi = (frac(xi, 0.3) + frac(xi, 0.62)) / 2 - P0[2], ti = tcw(xi) * (TEw(xi) - LEw(xi)) * 0.5 * 0.98;
    const ins = decal(starTex(), 1.7, 0.85, pv, 'wingStar'); ins.position.set(s * xi - s * P0[0], s < 0 ? ti + 0.012 : -ti - 0.012, zi); ins.rotation.set(s < 0 ? -Math.PI / 2 : Math.PI / 2, 0, s < 0 ? 0 : Math.PI);
    if (s < 0) { const nv = decal(stencil('navyW', 'NAVY', 44), 2.2, 0.55, pv, 'wingNavy'); nv.position.set(-xi + P0[0], -ti - 0.012, zi); nv.rotation.set(Math.PI / 2, 0, Math.PI); }
    const nav = det(mesh(new THREE.SphereGeometry(0.06, 8, 6), B(s < 0 ? 0xff2a1a : 0x2aff5a), pv, 'navLight')); nav.position.set(s * (WG.semi - 0.08) - s * P0[0], 0, frac(WG.semi - 0.08, 0.3) - P0[2]);
    wings.push({ pv, slat, flap, spoilers, s });
  }

  // ---- windscreen (fixed) and the one-piece canopy over both cockpits (hinged at its aft end, swings up)
  const ws = new THREE.Group(); ws.name = 'windscreen'; g.add(ws);
  mesh(geo('wsGlass', () => canopyGeo(-8.40, Z_BOW, { n: 24 })), glassM, ws, 'windscreenGlass');
  tube(canopyHoop(Z_BOW, 0.012).map(p => p.toArray()), 0.035, frameM, ws, 'windscreenBow', 24);
  tube(canopyHoop(-8.36, 0.01).map(p => p.toArray()), 0.022, frameM, ws, 'windscreenBase', 24);
  const cg = new THREE.Group(); cg.name = 'canopy'; cg.position.set(...TCAT.CANOPY_HINGE); g.add(cg);
  const cv = new THREE.Group(); cv.position.set(...TCAT.CANOPY_HINGE).negate(); cg.add(cv);
  mesh(geo('cnpGlass', () => canopyGeo(Z_BOW, Z_GLASS_END, { n: 28 })), glassM, cv, 'canopyGlass');
  mesh(geo('cnpAft', () => canopyGeo(Z_GLASS_END, -2.95, { n: 20 })), greyM, cv, 'canopyAft');
  mesh(geo('cnpFair', () => canopyGeo(-2.95, -2.36, { n: 16 })), greyM, g, 'canopyFairing');   // the fixed fairing behind the hinge
  tube(canopyHoop(Z_BOW + 0.02, 0.016).map(p => p.toArray()), 0.03, frameM, cv, 'canopyBow', 24);
  tube(canopyHoop(Z_GLASS_END, 0.016).map(p => p.toArray()), 0.04, frameM, cv, 'canopyAftBow', 24);
  for (const s of [-1, 1]) tube(Array.from({ length: 9 }, (_, i) => { const z = Z_BOW + (Z_GLASS_END - Z_BOW) * i / 8; return [s * (canopyW(z) + 0.012), sill(z) - 0.04, z]; }), 0.03, frameM, cv, 'canopySill', 16);
  // ---- two crew on GRU-7A seats (pilot and RIO): olive flight suits, white helmets, dark visors
  for (const [z, y] of [[TCAT.EYE[2], TCAT.EYE[1]], [TCAT.EYE_RIO[2], TCAT.EYE_RIO[1]]]) {
    mesh(boxG(0.56, 1.0, 0.18, 0, y - 0.62, z + 0.42), seatM, g, 'seatBack'); mesh(boxG(0.5, 0.28, 0.22, 0, y + 0.02, z + 0.42), seatM, g, 'headbox');
    mesh(boxG(0.44, 0.52, 0.3, 0, y - 0.45, z + 0.12), crewM, g, 'torso');
    mesh(new THREE.SphereGeometry(0.15, 12, 8).translate(0, y + 0.05, z), helmM, g, 'helmet');
    mesh(new THREE.SphereGeometry(0.152, 12, 6, -Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.35, Math.PI * 0.3).translate(0, y + 0.05, z), visorM, g, 'visor');
  }
  // the cockpit tub seen through the canopy from outside (hidden from inside, where tomcatcockpit.js draws the real one)
  const tub = new THREE.Group(); tub.name = 'cockpitTub'; g.add(tub);
  const tubM = M(0x2a2d30, { side: THREE.DoubleSide, rk: 'flat' });
  for (const s of [-1, 1]) mesh(new THREE.PlaneGeometry(4.0, 0.95).rotateY(Math.PI / 2).translate(s * 0.6, -0.35, -6.1), tubM, tub, 'tubWall');
  mesh(new THREE.PlaneGeometry(1.2, 4.0).rotateX(-Math.PI / 2).translate(0, -0.8, -6.1), tubM, tub, 'tubFloor');
  for (const z of [-8.05, -4.15]) mesh(new THREE.PlaneGeometry(1.2, 1.0).translate(0, -0.32, z), tubM, tub, 'tubBulkhead');
  mesh(boxG(0.95, 0.08, 0.5, 0, sill(-7.4) + 0.06, -7.35), darkM, g, 'glareshield');
  mesh(boxG(0.85, 0.32, 0.12, 0, TCAT.EYE_RIO[1] - 0.35, -6.0), darkM, g, 'rioPanel');

  // ---- markings (USN 1179034): modex on the nose, the national insignia on the intake under the canopy, NAVY on the nacelle aft
  for (const s of [-1, 1]) {
    const zM = -8.9, d = decal(noseNumber(modex), 0.66, 0.33, g, 'modex'); d.position.set(s * (fuseW(zM) + 0.012), -0.42, zM); d.rotation.y = s * (Math.PI / 2 - 0.08);
    const zI = -3.2, N = nacelleAt(zI), st = decal(starTex(), 1.25, 0.62, g, 'insignia'); st.position.set(s * (N.cx + N.a + 0.012), (N.top + N.bot) / 2 + 0.05, zI); st.rotation.y = s * Math.PI / 2;
    const zN = 3.3, N2 = nacelleAt(zN), nv = decal(stencil('navy', 'NAVY', 40), 1.1, 0.28, g, 'navy'); nv.position.set(s * (N2.cx + N2.a + 0.012), N2.bot + 0.55, zN); nv.rotation.y = s * Math.PI / 2;
    const zR = -6.3, rs = decal(stencil('rescue', 'RESCUE', 22, '#c8361c'), 0.5, 0.12, g, 'rescue'); rs.position.set(s * (fuseW(zR) + 0.01), sill(zR) - 0.25, zR); rs.rotation.y = s * Math.PI / 2;
    det(mesh(boxG(0.45, 0.004, 1.3, s * 1.45, GLOVE.y + GLOVE.t(1.45) / 2 + 0.002, -2.4), walkM, g, 'walkway'));
  }
  // probes, antennas: pitot on the radome tip, AoA probes, the M61 muzzle on the left of the nose, the retractable
  // refuelling probe door on the right, UHF / TACAN blades top and bottom, the ALQ-100 antenna under the nose
  det(mesh(cylZ(0.012, 0.022, 0.42, 6).translate(0, -0.92, G.NOSE - 0.2), metalM, g, 'pitot'));
  for (const s of [-1, 1]) det(mesh(cylZ(0.015, 0.015, 0.16, 5).rotateZ(Math.PI / 2).translate(s * (fuseW(-9.6) + 0.06), -0.75, -9.6), metalM, g, 'aoaProbe'));
  det(mesh(new THREE.CircleGeometry(0.055, 10).rotateY(-Math.PI / 2).translate(-(fuseW(-8.2) - 0.01), -0.62, -8.2), blackM, g, 'gunMuzzle'));
  for (let i = 0; i < 5; i++) det(mesh(boxG(0.012, 0.03, 0.14, -(fuseW(-7.9) + 0.004), -0.48 - i * 0.045, -7.9), blackM, g, 'gunVent'));
  det(mesh(boxG(0.02, 0.14, 0.75, fuseW(-7.6) + 0.004, sill(-7.6) - 0.16, -7.6), M(0x9aa0a5), g, 'probeDoor'));
  det(mesh(slab([[0, 0, .02], [0.28, 0.12, .015], [0.32, 0.24, .015], [0.05, 0.24, .02]], (a, b, w) => [w, b, -1.2 + a]), M(0x9aa0a5), g, 'uhfBlade')).position.y = 0.26;
  det(mesh(slab([[0, 0, .02], [0.22, -0.16, .015], [0.26, -0.24, .015], [0.04, -0.24, .02]], (a, b, w) => [w, b, -3.0 + a]), M(0x9aa0a5), g, 'tacanBlade')).position.y = fuseB(-3.0);
  det(mesh(cylZ(0.11, 0.11, 0.42, 10).translate(0, fuseB(-8.6) - 0.06, -8.6), M(0xc8c4b4), g, 'alq100'));

  // ---- landing gear: nose (twin wheels, launch bar, retracts forward), mains (single wheels, fold forward/up into the gloves)
  const NP = V(0, fuseB(TOMCAT.GEAR[0][2]) + 0.05, TOMCAT.GEAR[0][2]), nose = new THREE.Group(); nose.name = 'noseGear'; nose.position.copy(NP); g.add(nose);
  const steer = new THREE.Group(); nose.add(steer);
  const nwy = TOMCAT.GEAR[0][1] + 0.28 - NP.y;
  rod(V(0, 0.02, 0), V(0, nwy + 0.5, 0), 0.14, gearM, steer, 'noseStrut');
  const nSl = new THREE.Group(); steer.add(nSl);
  rod(V(0, nwy + 0.55, 0), V(0, nwy, 0), 0.1, M(0xf0f2f4, { shininess: 80 }), nSl, 'noseSlider');
  mesh(boxG(0.4, 0.08, 0.08, 0, nwy, 0), gearM, nSl, 'noseAxle');
  wheel(0.28, 0.17, nSl, -0.19, nwy, 0, tyreM, gearM); wheel(0.28, 0.17, nSl, 0.19, nwy, 0, tyreM, gearM);
  const launchBar = rod(V(0, nwy + 0.25, -0.12), V(0, -2.5 - NP.y + 0.05, -0.95), 0.08, M(0x9aa0a6), nSl, 'launchBar');
  det(mesh(boxG(0.13, 0.13, 0.05, 0, nwy + 0.55, -0.1), M(0xfff6d0, { emissive: 0x444030 }), steer, 'taxiLight'));
  const noseDoors = [-1, 1].map(s => { const h = new THREE.Group(); h.position.set(s * 0.25, NP.y, NP.z - 0.3); h.userData.door = s; g.add(h); mesh(boxG(0.03, 0.5, 1.1, 0, -0.25, 0), whiteM, h, 'noseDoor'); return h; });   // (side doors: flat under the keel when shut, vertical when open)
  const mains = [];
  for (const s of [-1, 1]) {
    const P0g = V(s * 2.05, GLOVE.y - 0.18, 0.15), W = V(s * 2.5, TOMCAT.GEAR[1][1] + 0.48, TOMCAT.GEAR[1][2]);   // strut root under the glove; wheel centre over the contact point
    const mg = new THREE.Group(); mg.name = 'mainGear' + (s < 0 ? 'L' : 'R'); mg.position.copy(P0g); g.add(mg);
    const A2 = V(s * 2.3, W.y, W.z), u = V().subVectors(A2, P0g).normalize(), a = V().subVectors(A2, P0g), w = V().subVectors(W, P0g);
    rod(V(), u.clone().multiplyScalar(1.0), 0.17, gearM, mg, 'mainStrut');
    rod(V(-s * 0.35, -0.1, -0.6), u.clone().multiplyScalar(0.8), 0.07, gearM, mg, 'mainBrace');
    const sl = new THREE.Group(); mg.add(sl);
    rod(u.clone().multiplyScalar(0.8), a, 0.11, M(0xf0f2f4, { shininess: 80 }), sl, 'mainOleo');
    mesh(boxG(0.28, 0.08, 0.08, (a.x + w.x) / 2, a.y, a.z), gearM, sl, 'mainAxle');
    wheel(0.47, 0.29, sl, w.x, w.y, w.z, tyreM, gearM);
    const frame = (d, ax) => { const aa = ax.clone().addScaledVector(d, -ax.dot(d)).normalize(); return new THREE.Matrix4().makeBasis(d, aa, V().crossVectors(d, aa)); };
    const t = V(-0.25 * s, -0.10, -1).normalize(), qUp = new THREE.Quaternion().setFromRotationMatrix(frame(t, V(s, 0, 0)).multiply(frame(u, V(s, 0, 0)).transpose()));
    const door = mesh(boxG(0.04, 0.62, 1.7), whiteM, g, 'gearDoor'); door.position.set(s * 1.98, GLOVE.y - 0.5, -0.75);   // the main gear bay door on the glove underside (shown open with the gear down; shut, the skin is the door)
    mains.push({ mg, sl, u, k: 1 / -u.y, qUp, door });
  }
  const q0 = new THREE.Quaternion();

  // ---- tailhook (fig. 3e: pivot FS 126.893 / WL 29.209, 3.44 m, stowed 8.9 deg tip-up under the aft fuselage)
  const hook = new THREE.Group(); hook.name = 'tailhook'; hook.position.set(...HOOK_PIVOT); g.add(hook);
  mesh(boxG(0.09, 0.09, HOOK_LEN - 0.15, 0, 0, (HOOK_LEN - 0.15) / 2), M(0x60666b), hook, 'hookArm');
  mesh(boxG(0.11, 0.13, 0.25, 0, -0.02, HOOK_LEN - 0.1), M(0xe8e8e8), hook, 'hookShoe');
  for (let k = 0; k < 4; k++) mesh(boxG(0.1, 0.1, 0.18, 0, 0, 0.4 + k * 0.6), k % 2 ? M(0xe8e8e8) : M(0x1c1c1c), hook, 'hookStripe');

  // ---- lights: tail white, strobes on the fin caps, red anti-collision beacons top and bottom, formation strips
  const lightG = new THREE.Group(); lightG.name = 'lights'; g.add(lightG);
  const bulb = (c, r, p, name) => { const m = mesh(new THREE.SphereGeometry(r, 6, 4), B(c), lightG, name); m.position.copy(p); return m; };
  bulb(0xffffff, 0.05, V(0, -0.34, 7.98), 'tailLight');
  const strobes = [bulb(0xffffff, 0.07, surf.finTipL.clone().add(V(-0.03, 0.06, 0)), 'strobeL'), bulb(0xffffff, 0.07, surf.finTipR.clone().add(V(0.03, 0.06, 0)), 'strobeR')];
  const beacon = bulb(0xff3020, 0.08, V(0, 0.33, -1.6), 'beacon'), beacon2 = bulb(0xff3020, 0.08, V(0, fuseB(-1.0) - 0.04, -1.0), 'beaconLow');
  const formM = B(0x8fd060);
  for (const s of [-1, 1]) { mesh(boxG(0.02, 0.05, 0.7, s * (fuseW(-8.0) + 0.01), -0.3, -8.0), formM, lightG, 'formation'); mesh(boxG(0.02, 0.05, 0.7, s * (nacelleAt(1.2).cx + nacelleAt(1.2).a + 0.01), -0.55, 1.2), formM, lightG, 'formation'); }

  // ---- stores: AIM-54A Phoenix, AIM-7F Sparrow, AIM-9L Sidewinder on their stations, glove pylons and rails, Phoenix pallets
  const fins = (r, span, chord, z) => [0, 1].map(k => boxG(span, 0.008, chord, 0, 0, z).rotateZ(Math.PI / 4 + k * Math.PI / 2));
  const geoOf = {
    aim54: geo('aim54', () => merge([cylZ(0.19, 0.19, 3.6, 12), new THREE.ConeGeometry(0.19, 0.6, 12).rotateX(-Math.PI / 2).translate(0, 0, -2.1), ...fins(0.19, 1.0, 0.6, 1.4), ...fins(0.19, 0.7, 0.9, -0.4)])),
    aim7: geo('aim7', () => merge([cylZ(0.1, 0.1, 3.3, 10), new THREE.ConeGeometry(0.1, 0.4, 10).rotateX(-Math.PI / 2).translate(0, 0, -1.85), ...fins(0.1, 0.85, 0.45, -0.4), ...fins(0.1, 0.78, 0.3, 1.5)])),
    aim9: geo('aim9', () => merge([cylZ(0.064, 0.064, 2.75, 10), new THREE.SphereGeometry(0.064, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -1.375), ...fins(0.064, 0.36, 0.16, -1.0), ...fins(0.064, 0.62, 0.3, 1.15)])),
  };
  const matOf = { aim54: M(0xe9e9e4), aim7: M(0xe9e9e4), aim9: M(0xd5d7d2) }, bandM = M(0xc8a040);
  const stores = {};
  for (const [w, st] of [['aim9', '1A'], ['aim9', '8A'], ['aim54', '1B'], ['aim54', '8B'], ['aim7', '3'], ['aim7', '6'], ['aim54', '4'], ['aim54', '5'], ['aim7', '4'], ['aim7', '5'], ['aim7', '1B'], ['aim7', '8B'], ['aim54', '3'], ['aim54', '6']]) {
    const p = STATIONS[st], m = mesh(geoOf[w], matOf[w], g, w + '@' + st); m.position.set(...p); if (w !== 'aim9') m.position.y -= w === 'aim54' ? 0.12 : 0.02;
    mesh(cylZ(w === 'aim54' ? 0.192 : w === 'aim7' ? 0.102 : 0.066, w === 'aim54' ? 0.192 : w === 'aim7' ? 0.102 : 0.066, 0.1, 10), bandM, m).position.z = -0.9;
    m.visible = false; stores[w + '@' + st] = m;
  }
  for (const s of [-1, 1]) {
    const yb = GLOVE.y - GLOVE.t(2.3) / 2;   // glove underside at the pylon
    mesh(outward(airfoilGeo({ u0: 0, u1: yb - (STATIONS['8B'][1] + 0.2), nu: 2, nc: 10, LE: () => -2.45, TE: () => 0.05, tc: () => 0.06, map: (u, z, h) => [s * 2.3 + h, yb - u, z], cap0: true, cap1: true })), greyM, g, 'glovePylon');
    mesh(boxG(0.08, 0.1, 2.0, s * STATIONS['8A'][0], STATIONS['8A'][1] + 0.1, STATIONS['8A'][2]), metalM, g, 'sidewinderRail');
    mesh(boxG(0.12, Math.max(0.05, STATIONS['8A'][1] + 0.12 - GLOVE.y + 0.1), 0.6, s * STATIONS['8A'][0], (STATIONS['8A'][1] + 0.15 + GLOVE.y) / 2, STATIONS['8A'][2]), greyM, g, 'shoulderPylon');
  }
  for (const z of [-3.2, 1.6]) for (const s of [-1, 1]) mesh(boxG(0.3, 0.12, 1.8, s * 0.62, Math.max(fuseB(z), -1.05) - 0.04, z), metalM, g, 'phoenixPallet');

  // ---- LOD: full detail near, coarser lofts and no small parts further out
  let lodNow = 0;
  function setLod(l) {
    if (l === lodNow) return; lodNow = l;
    for (const [m, gs] of lodMesh) m.geometry = gs[l];
    for (const m of detail) m.visible = l === 0;
  }
  const _c = new THREE.Vector3();
  fus.onBeforeRender = (r, sc, cam) => { if (cam.isOrthographicCamera || g.userData.lockLod != null) { setLod(g.userData.lockLod ?? 0); return; } g.getWorldPosition(_c); const d = _c.distanceTo(cam.position) * (cam.zoom || 1) * (cam.fov ? Math.tan(cam.fov * D2R / 2) / 0.6 : 1); setLod(d < LOD_D[0] ? 0 : d < LOD_D[1] ? 1 : 2); };

  // ---- animation from the sim (or a plain state object for the preview page)
  const ZERO2 = [0, 0], WOW0 = [0, 0, 0];
  let hookA = HOOK_UP, sweepNow = 20;
  const shell = [cg, ws, tub];
  function animate(A, dt = 0, time = 0, inside = false) {
    const S = A.surf || A, stab = S.stab || 0, ail = S.ail || 0, rud = S.rud || 0, sweep = A.sweep ?? 20;
    sweepNow = sweep;
    for (const W of wings) W.pv.rotation.y = -W.s * (sweep - 20) * D2R;
    const sd = ail * 0.55;   // differential tail for roll
    surf.stabR.rotation.x = -(stab + sd); surf.stabL.rotation.x = -(stab - sd);
    surf.rudR.rotation.x = rud; surf.rudL.rotation.x = rud;
    const fp = (S.flap || 0) * 0.6, le = -(S.lef || 0) * 0.30, spoilOk = sweep < 57;
    for (const W of wings) {
      W.flap.rotation.x = fp; W.slat.rotation.x = le;
      const up = spoilOk ? Math.max(0, W.s * ail) * 1.3 + (A.onGround && A.wow && A.wow[1] > 0.05 && (A.eas || 0) < 70 ? 0.9 : 0) : 0;   // roll spoilers, ground roll-out dump
      for (const sp of W.spoilers) { const a = Math.min(1, up); sp.rotation.x = -a; sp.children[0].visible = a > 0.02; }   // (flush when closed: the wing skin is the panel)
    }
    for (const v of vanes) { const k = A.vane || 0; v.g.rotation.y = -v.s * k * 0.55; v.g.visible = k > 0.02; }   // (stowed inside the glove)
    const br = S.brake || 0; sbU.rotation.x = -br * 0.95; sbL[0].rotation.x = br * 0.95; sbL[1].rotation.x = br * 0.95;
    sbU.children[0].visible = sbL[0].children[0].visible = sbL[1].children[0].visible = br > 0.02;
    cg.rotation.x = (A.canopy || 0) * TCAT.CANOPY_OPEN;
    const gd = THREE.MathUtils.clamp(A.gear ?? 1, 0, 1), wow = A.wow || WOW0, up = 1 - gd;
    nose.rotation.x = up * 1.75; steer.rotation.y = -(A.steer || 0) * gd;
    for (const d of noseDoors) { const o = Math.min(1, gd * 4); d.rotation.z = d.userData.door * (1 - o) * Math.PI / 2; d.visible = o > 0.02; }   // hinged at the keel sides, open with the gear
    nSl.position.y = Math.min(0.3, wow[0] || 0); launchBar.visible = !!A.launchBar && gd > 0.98;
    for (let i = 0; i < 2; i++) {
      const m = mains[i], c = Math.min(0.3, wow[i + 1] || 0) * m.k;
      m.sl.position.set(-m.u.x * c, -m.u.y * c, -m.u.z * c);
      m.mg.quaternion.slerpQuaternions(q0, m.qUp, THREE.MathUtils.smoothstep(up, 0, 1)); m.door.visible = gd > 0.02;
    }
    hookA = HOOK_UP + (HOOK_DOWN - HOOK_UP) * THREE.MathUtils.clamp(A.hook || 0, 0, 1); hook.rotation.x = hookA;
    const E = A.eng;
    for (let i = 0; i < 2; i++) {
      const e = eng[i], n = E ? E[i].n : (A.n || ZERO2)[i], nzl = E ? E[i].nozzle : (A.nozzle || [0.6, 0.6])[i], ab = E ? E[i].ab : (A.ab || ZERO2)[i];
      const rExit = NZ.exitR[0] + (0.56 - NZ.exitR[0]) * THREE.MathUtils.clamp(nzl, 0, 1), rIn = NZ.shroudR * 0.94, pa = e.pp.array;
      for (let j = 0; j < e.base.length; j += 4) { const r = e.base[j + 3] ? rExit : rIn; pa[e.base[j] * 3] = e.base[j + 1] * r; pa[e.base[j] * 3 + 1] = e.base[j + 2] * r; }
      e.pp.needsUpdate = true;
      const a = THREE.MathUtils.clamp(ab, 0, 1), heat = Math.max(0, (n - 0.7) / 0.35) ** 2 * 0.35 + a * 0.6, k = rExit / 0.6;
      e.faceM.color.setRGB(heat, heat * 0.45, heat * 0.15 + a * 0.25);
      e.fl.visible = a > 0.01;
      if (a > 0.01) {
        const fk = 1 + 0.07 * Math.sin(time * 41 + e.ph) + 0.05 * Math.sin(time * 67 + e.ph * 3), L = (0.8 + 5.2 * a) * fk, brr = inside ? 0.5 : 1;
        e.outer.scale.set(k * 1.02 * 0.6, k * 1.02 * 0.6, L); e.core.scale.set(k * 0.36, k * 0.36, L * 0.62);
        e.outer.material.opacity = (0.16 + 0.22 * a) * brr; e.core.material.opacity = (0.35 + 0.35 * a) * brr; e.dm.opacity = 0.85 * a * brr;
        for (let d = 0; d < 4; d++) { const z = (0.5 + 0.85 * d) * (0.75 + 0.25 * a) * fk, m = e.diamonds[d]; m.visible = z < L * 0.7; m.position.z = z; const r = k * 0.6 * (0.62 - 0.08 * d); m.scale.set(r * 0.5, r * 0.5, 0.3 * (1 - 0.15 * d)); }
      }
    }
    const lit = A.lights ?? true; lightG.visible = lit;
    if (lit) { const st = time % 1.1 < 0.07; strobes[0].visible = strobes[1].visible = st; beacon.visible = beacon2.visible = (time + 0.55) % 1.1 < 0.12; }
    for (const k in stores) stores[k].visible = false;
    if (A.stores && A.stores.length !== undefined) for (const s of A.stores) { const m = stores[s.w + '@' + s.st]; if (m) m.visible = !!s.on; }
    for (const o of shell) o.visible = !inside;
  }
  // world-space-free helpers for the game: where the nozzles and wingtips are (for exhaust and vapour)
  const _t = V();
  function wingTipLocal(side, out = V()) {
    _t.set(side * (WG.semi - 0.1) - side * P0[0], 0, frac(WG.semi - 0.1, 0.4) - P0[2]).applyAxisAngle(V(0, 1, 0), -side * (sweepNow - 20) * D2R);
    return out.set(side * P0[0] + _t.x, P0[1], P0[2] + _t.z);
  }
  function hookTip(out = V()) { return out.set(HOOK_PIVOT[0], HOOK_PIVOT[1] - HOOK_LEN * Math.sin(hookA), HOOK_PIVOT[2] + HOOK_LEN * Math.cos(hookA)); }
  animate({ sweep: 20, gear: 1, stores: [] });
  const zN = NZ.z0 + NZ.len + 0.1;
  return { group: g, shell, animate, hookTip, wingTipLocal, setLod, nozzles: [V(-NZ.x, NZ.y, zN), V(NZ.x, NZ.y, zN)], parts: { wings, surf, nose, mains, hook, eng, stores, canopy: cg, vanes, lights: lightG } };
}
