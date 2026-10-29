// HORNET: the F/A-18A of 1980 (a full-scale development jet, see "1980 markings"), exterior model with every moving part
// (surfaces, gear, hook, canopy, nozzles, afterburner, lights, stores). Real-world metres.
// ngc/look-units: the airframe is built to the drawings (units/air/hornetgeo.js: the NASA Dryden three-view traced at
// 111.42 px/m, NATOPS A1-F18AC-NFM-000 dimensions): a lofted fuselage, canopy and intake ducts, the LEX from the traced
// top view, airfoil wings / stabilators / canted fins, gear, hook and nozzles at the drawn stations. Fit and evidence:
// docs/ngc1980/findings/look-units.md, docs/ngc1980/evidence/look-units/fa18a/.
// Local frame: +x right wing, +y up, nose along -z, origin at the CG (main wheel centres 0.6 m aft of it).
import * as THREE from 'three';
import { wrapFactory, glass, decal, DETAIL } from './renderkit/gamemats.js';   // RENDERKIT surface
import { createLOD, detail } from './renderkit/lod.js';
import { G as HG, fuselageGeo, canopyGeo, canopyHoop, canopySillPts, ductGeo, ductAt, lexOutline, LEX, chineStripeGeo, fuseT, fuseW, fuselageSurface, airfoilGeo, outward, canopyW,
  wingLE, wingTE, wingY, wingTC, WSPLIT, hingeZ, stabLEr, stabTE, stabY, finLE, finTE, finRudder, FIN_H, finPt, sill, COCKPIT_OPEN } from './units/air/hornetgeo.js';

const HP = HG.HOOK, HOOK_PIVOT = HP.pivot, HOOK_LEN = HP.len, HOOK_UP = HP.up, HOOK_DOWN = Math.asin((1.95 + HOOK_PIVOT[1]) / HOOK_LEN);   // arm angles below aft-horizontal; down: tip on the deck (y -1.95)
// the cockpit moved with the airframe: the old box model put the eye at (0, 0.98, -4.35); on the drawing the design eye
// is 0.70 m further forward and 0.10 m lower. jetcockpit.js builds in the old frame and is shifted by this as a block.
export const COCKPIT_SHIFT = [HG.EYE[0] - 0, HG.EYE[1] - 0.98, HG.EYE[2] + 4.35];
export const JET = {
  L: HG.LENGTH, SPAN: HG.SPAN_RAILS, EYE: HG.EYE,
  GEAR: { nose: [0, -2.05, HG.NOSE_WHEEL[1]], mainL: [-HG.MAIN_WHEEL[0], -2.05, 0.6], mainR: [HG.MAIN_WHEEL[0], -2.05, 0.6] },   // wheel bottoms, gear down, struts extended (= jetfm.js HORNET.GEAR)
  WHEEL_R: { nose: HG.R_NOSE, main: HG.R_MAIN },
  HOOK_PIVOT, HOOK_LEN, HOOK_UP, HOOK_DOWN,   // tip = pivot + LEN * (0, -sin a, cos a), a = UP..DOWN; down tip ~ (0, -1.95, 5.89) = jetfm HOOK_TIP
  STATIONS: {
    aam: [[-5.86, -0.10, 0.9], [5.86, -0.10, 0.9]],                                       // tip-rail AIM-9 centres (nose at z - 1.425)
    bomb: [[-3.9, -0.47, 0.75], [-2.6, -0.45, 0.55], [2.6, -0.45, 0.55], [3.9, -0.47, 0.75]],   // left outer, left inner, right inner, right outer (stations 2, 3, 7, 8)
    gun: [0, 0.30, -8.95],                                                              // M61 muzzle port on the nose top, ahead of the windscreen
  },
  COCKPIT: { z0: COCKPIT_OPEN[0], z1: COCKPIT_OPEN[1], sill: 0.62, halfW: 0.6 },
  SEAT: [0, 0.02 + COCKPIT_SHIFT[1], -4.22 + COCKPIT_SHIFT[2]],                       // the seated pilot figure (interiors/seats.js)
  CANOPY_HINGE: [0, 0.80, HG.Z_CANOPY_END + 0.05], CANOPY_OPEN: 0.75,
};

// RENDERKIT surface: semi-gloss navy paint by default (the same Phong with ?rk=0); { rk: role | { role, detail } } per paint.
// The lofted skins are smooth-shaded (analytic normals); small fittings stay flat-shaded.
const M = wrapFactory((c, o = {}) => new THREE.MeshPhongMaterial({ color: c, shininess: 22, ...o }), 'paint', DETAIL.air);   // (smooth everywhere: boxes and slabs carry per-face normals anyway; one shader variant less)
const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);

// ------------------------------------------------------------------------------------------- geometry helpers
// triangle soup -> geometry; flips every triangle if the (closed-ish) mesh has negative signed volume, so mirrored
// builds never come out inside-out
function soup(pos, groups) {
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (groups) for (const [s, n, m] of groups) g.addGroup(s, n, m);
  g.computeVertexNormals(); return g;
}
// thin plate from a 2D outline [[a, b, thick, below = 0.5]...]; map(a, b, w) -> [x, y, z] (w = offset across the plate)
function slab(poly, map) {
  const n = poly.length, area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % n]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p[0], p[1])), []);
  const top = poly.map(p => map(p[0], p[1], p[2] * (1 - (p[3] ?? 0.5)))), bot = poly.map(p => map(p[0], p[1], -p[2] * (p[3] ?? 0.5)));
  const pos = [], tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let [i, j, k] of tris) {
    const [a, b, c] = [poly[i], poly[j], poly[k]];
    if (((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * area < 0) [j, k] = [k, j];
    tri(top[i], top[j], top[k]); tri(bot[i], bot[k], bot[j]);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(top[i], bot[i], bot[j]); tri(top[i], bot[j], top[j]); }
  return soup(pos);
}
// skin through rings of points (each an open polyline, same length); matFn(ring, seg) -> material index; optional end caps
function loft(rings, matFn = () => 0, capEnd = -1) {
  const buckets = [];
  const put = (m, ...pts) => (buckets[m] ||= []).push(...pts.flat());
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length - 1; k++) {
    const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k + 1], d = rings[r + 1][k], m = matFn(r, k);
    put(m, a, b, c); put(m, a, c, d);
  }
  if (capEnd >= 0) {   // fan over the last ring
    const R = rings[rings.length - 1], c = R.reduce((s, p) => [s[0] + p[0] / R.length, s[1] + p[1] / R.length, s[2] + p[2] / R.length], [0, 0, 0]);
    for (let k = 0; k < R.length - 1; k++) put(capEnd, R[k], c, R[k + 1]);
  }
  const pos = [], groups = [];
  buckets.forEach((b, m) => { if (b) { groups.push([pos.length / 3, b.length / 3, m]); pos.push(...b); } });
  return soup(pos, groups);
}
// merge simple geometries (position + normal) into one
function merge(geos) {
  const pos = [], nor = [];
  for (let g of geos) { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
const cylZ = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).rotateX(Math.PI / 2);   // r0 at -z, r1 at +z
const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m; };
// a box spanning two points (struts, braces, bars)
function rod(a, b, w, mat, parent, name) {
  const d = V().subVectors(b, a), m = mesh(new THREE.BoxGeometry(w, w, d.length()), mat, parent, name);
  m.position.addVectors(a, b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 0, 1), d.normalize()); return m;
}
// a control surface on a hinge line p0 -> p1: geometry is given in aircraft coordinates, the returned pivot rotates
// about the hinge (rotation.x). With p1 - p0 along +x, positive rotation moves the aft edge DOWN; along +y, aft edge to +x.
function hinged(parent, geo, mat, p0, p1, name) {
  const o = new THREE.Group(); o.position.copy(p0); o.quaternion.setFromUnitVectors(X, V().subVectors(p1, p0).normalize()); o.updateMatrix();
  geo.applyMatrix4(o.matrix.clone().invert());
  const pv = new THREE.Group(); pv.name = name; o.add(pv); mesh(geo, mat, pv, name + 'Skin'); parent.add(o); return pv;
}

// two paints on an indexed geometry by triangle centroid: fn(x, y, z) true -> material 1, else 0
function paintSplit(geo, fn) {
  const p = geo.attributes.position, ix = geo.index.array, a = [], b = [];
  for (let q = 0; q < ix.length; q += 3) { const i = ix[q], k = ix[q + 1], l = ix[q + 2]; (fn((p.getX(i) + p.getX(k) + p.getX(l)) / 3, (p.getY(i) + p.getY(k) + p.getY(l)) / 3, (p.getZ(i) + p.getZ(k) + p.getZ(l)) / 3) ? b : a).push(i, k, l); }
  geo.setIndex([...a, ...b]); geo.clearGroups(); geo.addGroup(0, a.length, 0); geo.addGroup(a.length, b.length, 1); return geo;
}
// two-tone paint on a plate: faces looking down get material 1 (the white undersides), the rest material 0
function twoTone(geo, below = -0.35) {
  const p = geo.attributes.position.array, up = [], dn = [], a = V(), b = V(), c = V(), n = V();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i); b.fromArray(p, i + 3); c.fromArray(p, i + 6); n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    (n.y < below ? dn : up).push(...p.slice(i, i + 9));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...up, ...dn], 3));
  g.addGroup(0, up.length / 3, 0); g.addGroup(up.length / 3, dn.length / 3, 1); g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------------------------------- 1980 markings
// In summer 1980 the only Hornets in the world are the eleven full-scale development jets of the Naval Air Test Center,
// Patuxent River (VFA-125, the first squadron, only forms in November 1980). So the ALBATROSS flies FSD single-seaters:
// the player's jet is FSD #3, BuNo 160777, the carrier-suitability jet (USS America trials, Oct-Nov 1979); every
// further model (the parked jets on deck) takes the next single-seater.
// Paint (ngc/look-units, from dated USN photographs, docs/ngc1980/reference/fa18a: 160777 trapping aboard USS America
// 1979, 160775 tanking from a NATC KA-3B April 1979): the McDonnell Douglas FSD test scheme, NOT the fleet grey: gloss
// white overall; dark blue wing upper surfaces, LEX tops and a thin stripe forward along the chine, a blue band down
// each fin's leading edge widening to an all-blue tip carrying the FSD number in white; cream radome; full-colour
// national insignia on the intake sides with MARINES aft of it on the right side (both photos) and NAVY on the left
// (the FSD jets' split titles; the left side is not in either photo: INFERRED); a red intake chevron; small day-glo
// test squares on the forebody. Stabilators white.
const FSD = [[3, 160777], [1, 160775], [2, 160776], [4, 160778], [5, 160779], [6, 160780], [8, 160782], [9, 160783], [11, 160785]];
let fsdNext = 0;
const _tex = new Map();
function texOf(key, w, h, draw) {
  if (_tex.has(key)) return _tex.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; _tex.set(key, t); return t;
}
const INK = '#16191c';
const stencil = (x, t, cx, cy, px, col = INK) => { x.font = `bold ${px}px "Arial Narrow", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(t, cx, cy); };
function starBar(x, w, h) {   // US national insignia: white star on a blue disc, white bars (R x R/2) with a red stripe, blue border
  const cx = w / 2, cy = h / 2, R = h * 0.44, blue = '#1c2f6e';
  x.fillStyle = blue; x.fillRect(cx - R * 2.12, cy - R * 0.31 - R * 0.12, R * 4.24, R * 0.74);
  x.fillStyle = '#f4f4f0'; x.fillRect(cx - R * 2.0, cy - R * 0.31, R * 4.0, R * 0.5);
  x.fillStyle = '#b0202a'; x.fillRect(cx - R * 2.0, cy - R * 0.31 + R * 0.25 - R / 12, R * 4.0, R / 6);
  x.fillStyle = blue; x.beginPath(); x.arc(cx, cy, R * 1.08, 0, 7); x.fill();
  x.fillStyle = '#f4f4f0'; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.38 : R; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  x.fill();
}
function decalMesh(tex, w, h, parent, name) {
  const m = mesh(new THREE.PlaneGeometry(w, h), decal(() => new THREE.MeshPhongMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, shininess: 22 }), { map: tex, roughness: 0.6, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), parent, name);
  if (!tex) m.visible = false; return m;
}


// ------------------------------------------------------------------------------------------- the model
const smooth = { flatShading: false };
export function buildJetMesh(side = 1, fsd) {   // fsd: index into FSD (0 = the player's #3); default: the next of the others
  const g = new THREE.Group(); g.name = 'hornet';
  const team = side === 2 ? 0xff3322 : 0x223f8c;   // fin tip: the FSD scheme's blue (side 2: red)
  const [fsdNo, buno] = FSD[fsd ?? 1 + (fsdNext++ % (FSD.length - 1))];
  // the FSD test scheme (see "1980 markings"): gloss white FS 17875 with dark blue trim, cream radome
  const greyM = M(0xeeeeea, { ...smooth, shininess: 45, rk: { detail: true } }), underM = M(0xe6e7e3, { ...smooth, shininess: 45, rk: { detail: true } }), blueM = M(0x223f8c, { ...smooth, shininess: 45, rk: { detail: true } });
  const radomeM = M(0xd8cfae, { ...smooth, shininess: 30, rk: 'flat' }), glareM = M(0x2a2d30, { ...smooth, rk: 'dark' }), darkM = M(0x24272a), blackM = M(0x0c0d0e, { shininess: 5, rk: 'dark' });
  const pair2 = [greyM, underM], blueTop = [blueM, underM], stripeM = M(0x223f8c, { ...smooth, shininess: 45, polygonOffset: true, polygonOffsetFactor: -2 });
  const metalM = M(0x4a4d52, { shininess: 50 }), gearM = M(0xd9dcde), tyreM = M(0x1b1b1b, { shininess: 4, rk: 'rubber' }), teamM = M(team, { ...smooth, emissive: team, emissiveIntensity: 0.15 });
  const glassM = glass(() => new THREE.MeshPhongMaterial({ color: 0x9fc6d8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }), { color: 0x9fc6d8, opacity: 0.18 });
  const frameM = M(0x34383c), ductInM = M(0x8d9092, { side: THREE.BackSide, shininess: 10 });

  // ---- levels of detail for the lofted skins (fuselage + intake ducts): 0 near, 1 mid (~1/6 the triangles), 2 far
  const fuseMats = [greyM, underM, radomeM, glareM];
  const lod = [0, 1, 2].map(l => { const o = new THREE.Group(); o.name = 'skinLOD' + l; g.add(o); return o; });
  const fuse = mesh(fuselageGeo(0), fuseMats, lod[0], 'fuselage');
  mesh(fuselageGeo(1), fuseMats, lod[1], 'fuselage1'); mesh(fuselageGeo(2), fuseMats, lod[2], 'fuselage2');
  for (const s of [-1, 1]) for (let l = 0; l < 3; l++) mesh(ductGeo(s, l), pair2, lod[l], 'intake' + (s < 0 ? 'L' : 'R') + (l ? l : ''));
  // intake mouths: the duct's inner wall (back faces) and the dark throat a little inside the face
  for (const s of [-1, 1]) {
    const d = ductAt(HG.Z_INTAKE), cx = (d.xo + d.xi) / 2, cy = (d.top + d.bot) / 2;
    const throat = mesh(new THREE.PlaneGeometry((d.xo - d.xi) * 0.94, (d.top - d.bot) * 0.94), blackM, g, 'intakeThroat');
    throat.position.set(s * cx, cy, HG.Z_INTAKE + 0.6);
    const wall = mesh(new THREE.BoxGeometry(d.xo - d.xi - 0.02, d.top - d.bot - 0.02, 0.6, 1, 1, 1).translate(0, 0, 0.3), ductInM, g, 'intakeWall'); wall.position.set(s * cx, cy, HG.Z_INTAKE + 0.005);
    // the splitter plate between the duct and the forebody (boundary-layer gap)
    mesh(new THREE.BoxGeometry(0.02, d.top - d.bot - 0.08, 0.9).translate(s * (d.xi - 0.035), cy, HG.Z_INTAKE + 0.35), greyM, g, 'splitter');
  }
  // the aft bulkhead round the nozzles (the loft ends at the nozzle base)
  { const S0 = fuselageSurface(0).S, o = {}, pts = []; for (let k = 0; k < 48; k++) { S0.at(HG.NOZ.z0, Math.PI * 2 * k / 48, o); pts.push(new THREE.Vector2(o.x, o.y)); }
    const cap = mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), darkM, g, 'aftBulkhead'); cap.position.z = HG.NOZ.z0 - 0.003; }
  // FSD number on the nose, NAVY on the aft fuselage, the ejection seat warning triangle under the canopy rail: decals
  // lie tangent to the lofted skin at their station (surface point + normal from the loft)
  const FS0 = fuselageSurface(0).S, _p = {}, _n = {};
  const onSkin = (tex, w, h, s, z, y, name) => {
    const ph = FS0.yToPhi(z, y, s); FS0.at(z, ph, _p); FS0.normal(z, ph, _n);
    const d = decalMesh(tex, w, h, g, name); d.position.set(_p.x + _n.x * 0.006, _p.y + _n.y * 0.006, _p.z + _n.z * 0.006);
    d.lookAt(d.position.clone().add(V(_n.x, _n.y, _n.z))); return d;
  };
  const noseNo = texOf('fsdNose' + fsdNo, 128, 128, (x, w, h) => stencil(x, String(fsdNo), w / 2, h / 2 + 4, 110));
  const navyT = texOf('fsdNavy', 256, 64, (x, w, h) => stencil(x, 'NAVY', w / 2, h / 2 + 2, 54));
  const ejT = texOf('ejectTri', 64, 64, (x, w, h) => { x.fillStyle = '#d42a1c'; x.beginPath(); x.moveTo(w / 2, 3); x.lineTo(w - 3, h - 6); x.lineTo(3, h - 6); x.closePath(); x.fill(); x.fillStyle = '#f2f0e8'; x.beginPath(); x.moveTo(w / 2, 18); x.lineTo(w - 15, h - 13); x.lineTo(15, h - 13); x.closePath(); x.fill(); stencil(x, 'EJECT', w / 2, h - 19, 10, '#111'); });
  for (const s of [-1, 1]) {
    onSkin(noseNo, 0.26, 0.26, s, -8.75, -0.18, 'sideNumber');
    mesh(chineStripeGeo(s), stripeM, g, 'chineStripe');
    const sq = texOf('testSq', 32, 32, (x, w, h) => { x.fillStyle = '#ff6a1a'; x.fillRect(2, 2, w - 4, h - 4); });
    onSkin(sq, 0.2, 0.17, s, -6.75, 0.32, 'testMark'); onSkin(sq, 0.16, 0.08, s, -8.95, -0.05, 'testMark');
    onSkin(ejT, 0.16, 0.16, s, -6.7, 0.38, 'ejectWarning');
  }
  // gun port on the nose top, ahead of the windscreen (M61A1 muzzle)
  { const z = JET.STATIONS.gun[2]; mesh(new THREE.BoxGeometry(0.08, 0.035, 0.22).translate(0, fuseT(z) + 0.004, z), blackM, g, 'gunPort'); }

  // ---- LEX: plate from the traced outline (apex at the windscreen to the wing root), drooping from the body to its edge
  for (const s of [-1, 1]) {
    const edge = lexOutline(36), inner = edge.slice().reverse().map(([, z]) => [Math.max(0.3, fuseW(z) - 0.08), z]);
    const yAt = x => LEX.yIn + (LEX.yOut - LEX.yIn) * Math.min(1, Math.max(0, (x - 0.55) / 0.85));
    const poly = [...edge.map(([x, z]) => [x, z, 0.03, 0.5]), ...inner.map(([x, z]) => [x, z, 0.16, 0.6])];
    mesh(twoTone(slab(poly, (a, b, w) => [s * a, yAt(a) + w, b])), blueTop, g, 'lex');
    // full-colour national insignia on the intake side (1980: the low-visibility grey insignia is still to come)
    const d = ductAt(-1.4), rd = decalMesh(texOf('starBar', 256, 128, starBar), 0.9, 0.45, g, 'insignia'); rd.position.set(s * (d.xo + 0.008), -0.28, -1.4); rd.rotation.y = s * Math.PI / 2;
    // the split titles: MARINES on the right side (photographed), NAVY on the left (INFERRED), aft of the insignia
    const tt = s > 0 ? texOf('titleMarines', 512, 64, (x, w, h) => stencil(x, 'MARINES', w / 2, h / 2 + 2, 56)) : navyT, tw = s > 0 ? 1.25 : 0.72, d2 = ductAt(-0.55);
    const ti = decalMesh(tt, tw, 0.2, g, 'navyTitle'); ti.position.set(s * (d2.xo + 0.008), -0.3, -0.55); ti.rotation.y = s * Math.PI / 2;
    // red intake warning chevron at the lip
    const cv = decalMesh(texOf('chevron', 64, 64, (x, w, h) => { x.strokeStyle = '#c8202a'; x.lineWidth = 9; x.beginPath(); x.moveTo(8, 10); x.lineTo(w - 10, h / 2); x.lineTo(8, h - 10); x.stroke(); }), 0.28, 0.28, g, 'intakeChevron');
    cv.position.set(s * (ductAt(HG.Z_INTAKE + 0.2).xo + 0.008), -0.28, HG.Z_INTAKE + 0.22); cv.rotation.y = s * Math.PI / 2; if (s > 0) cv.scale.x = -1;
  }

  // ---- wings: fixed box + leading-edge flap, trailing-edge flap (inboard) and aileron (outboard); airfoil slabs on
  // the traced planform. Chordwise strips share one thickness law, so the pieces close flush.
  const cos = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * (1 - Math.cos(Math.PI * i / n)) / 2);
  const surf = {};
  const W = HG.WING;
  const wingPiece = (s, x0, x1, f0, f1, nu = 10, nc = 8) => outward(airfoilGeo({ u0: x0, u1: x1, nu, LE: wingLE, TE: wingTE, tc: wingTC, chordPts: f0 === 0 && f1 === 1 ? null : cos(f0, f1, nc), nc: 14, split: true, cap0: true, cap1: true,
    map: (x, z, h) => [s * x, wingY(x) + h, z] }));
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', hp = (x, f) => V(s * x, wingY(x), hingeZ(x, f)), pair = (a, b) => s > 0 ? [a, b] : [b, a];   // hinge axis always points +x
    const geos = [wingPiece(s, W.x0, W.tipX, WSPLIT.lef, WSPLIT.te, 16), wingPiece(s, W.x0, WSPLIT.lefX[0], 0, WSPLIT.lef, 2), wingPiece(s, W.x0, WSPLIT.flapX[0], WSPLIT.te, 1, 2), wingPiece(s, WSPLIT.ailX[1], W.tipX, WSPLIT.te, 1, 2)];
    geos.forEach((geo, i) => mesh(geo, blueTop, g, 'wing' + S + (i ? i : '')));
    surf['lef' + S] = hinged(g, wingPiece(s, WSPLIT.lefX[0], W.tipX, 0, WSPLIT.lef, 14), blueTop, ...pair(hp(WSPLIT.lefX[0], WSPLIT.lef), hp(W.tipX, WSPLIT.lef)), 'lef' + S);
    surf['flap' + S] = hinged(g, wingPiece(s, ...WSPLIT.flapX, WSPLIT.te, 1, 8), blueTop, ...pair(hp(WSPLIT.flapX[0], WSPLIT.te), hp(WSPLIT.flapX[1], WSPLIT.te)), 'flap' + S);
    surf['ail' + S] = hinged(g, wingPiece(s, ...WSPLIT.ailX, WSPLIT.te, 1, 8), blueTop, ...pair(hp(WSPLIT.ailX[0], WSPLIT.te), hp(WSPLIT.ailX[1], WSPLIT.te)), 'ail' + S);
    // wingtip launcher rail (LAU-7 on the tip, traced in the top view)
    const R = HG.RAIL, rl = R.z1 - R.z0;
    mesh(new THREE.BoxGeometry(0.08, 0.11, rl).translate(s * R.x, R.y, (R.z0 + R.z1) / 2), metalM, g, 'rail' + S);
    mesh(new THREE.ConeGeometry(0.055, 0.3, 6).rotateX(-Math.PI / 2).translate(s * R.x, R.y, R.z0 - 0.12), metalM, g, 'railNose');
    // pylons for the bombs (stations 2, 3, 7, 8), under the wing at the store's station
    for (const [x, , z] of JET.STATIONS.bomb.filter(p => Math.sign(p[0]) === s)) {
      const top = wingY(Math.abs(x)) - 0.02;
      mesh(new THREE.BoxGeometry(0.08, top + 0.31, 1.5).translate(x, (top - 0.31) / 2, z - 0.05), greyM, g, 'pylon');
    }
  }

  // ---- vertical tails: canted 20 deg out, planform from the side view (projected heights v); rudder on the lower aft
  // part; the day-glo test band on the tip
  const FT = HG.FIN, RU = finRudder, finTC = v => FT.tc - 0.015 * v / FIN_H;
  const finPiece = (s, v0, v1, f0, f1, nu = 6) => outward(airfoilGeo({ u0: v0, u1: v1, nu, LE: finLE, TE: finTE, tc: finTC, nc: 12, cap0: true, cap1: true,
    chordPts: typeof f0 === 'function' || typeof f1 === 'function' ? null : (f0 === 0 && f1 === 1 ? null : cos(f0, f1, 8)), chordFn: typeof f0 === 'function' || typeof f1 === 'function' ? v => cos(typeof f0 === 'function' ? f0(v) : f0, typeof f1 === 'function' ? f1(v) : f1, 8) : null,
    map: (v, z, h) => finPt(s, v, z, h) }));
  const fHinge = v => (RU.hinge(v) - finLE(v)) / (finTE(v) - finLE(v));
  const BAND = FIN_H - 0.3;
  // the blue leading-edge band (photos): ~0.3 m wide at the root, widening to the whole chord at the tip
  // as a chord fraction: the paint edge is a chord station of the loft itself, so it runs clean (no stair-steps)
  const fBlue = v => Math.min(1, (0.42 + 1.3 * Math.max(0, v / FIN_H) ** 1.6 + 3 * Math.max(0, v - (FIN_H - 0.95))) / (finTE(v) - finLE(v)));
  const strip = (s, v0, v1, fa, fb, nu) => finPiece(s, v0, v1, v => fa(v), v => Math.max(fa(v) + 1e-4, fb(v)), nu);
  const finPair = (s, v0, v1, fEnd, nu, name, parent = g) => { const fe = typeof fEnd === 'function' ? fEnd : () => fEnd, fm = v => Math.min(fBlue(v), fe(v));
    mesh(strip(s, v0, v1, () => 0, fm, nu), blueM, parent, name + 'B'); return mesh(strip(s, v0, v1, fm, fe, nu), greyM, parent, name); };
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R';
    finPair(s, -0.30, RU.v0, 1, 2, 'fin' + S);   // (the root runs 0.3 m down into the nacelle shoulder)
    finPair(s, RU.v0, RU.v1, fHinge, 8, 'fin' + S + '1');
    finPair(s, RU.v1, BAND, 1, 8, 'fin' + S + '2');
    mesh(finPiece(s, BAND, FIN_H, 0, 1, 2), teamM, g, 'finTip' + S);
    const a = V(...finPt(s, RU.v0, RU.hinge(RU.v0))), b = V(...finPt(s, RU.v1, RU.hinge(RU.v1)));
    surf['rud' + S] = hinged(g, finPiece(s, RU.v0, RU.v1, fHinge, 1, 8), greyM, a, b, 'rudder' + S);   // (all white: the blue band stays ahead of the hinge)
    surf['finTip' + S] = V(...finPt(s, FIN_H, finTE(FIN_H) - 0.1));
    // outer face of the fin: the FSD number large, the BuNo and NAVY low on the fixed part (ahead of the rudder hinge)
    const onFin = (tex, w, h, z, v, name) => { const piv = new THREE.Group(); piv.position.set(...finPt(s, v, z, 0.05)); piv.rotation.z = -s * FT.cant; g.add(piv); const d = decalMesh(tex, w, h, piv, name); d.rotation.y = s * Math.PI / 2; return d; };
    onFin(texOf('fsdFinW' + fsdNo, 128, 128, (x, w, h) => stencil(x, String(fsdNo), w / 2, h / 2 + 4, 116, '#f4f4f0')), 0.5, 0.5, finLE(FIN_H - 0.32) + 0.62, FIN_H - 0.32, 'finNumber');
    onFin(texOf('buno' + buno, 256, 48, (x, w, h) => stencil(x, String(buno), w / 2, h / 2 + 2, 40)), 0.6, 0.11, finLE(0.35) + 1.35, 0.35, 'bunoFin');
  }
  // national insignia: top of the left wing, underside of the right wing (1980 Navy practice)
  { const t = texOf('starBar', 256, 128, starBar), xs = 3.3, zc = 0.9, c = wingTE(xs) - wingLE(xs), ht = wingTC(xs) * c / 2 * 0.85;
    const up = decalMesh(t, 1.5, 0.75, g, 'wingStarTop'); up.position.set(-xs, wingY(xs) + ht + 0.01, zc); up.rotation.set(-Math.PI / 2, 0, 0); up.rotateY(-W.dihedral);
    const dn = decalMesh(t, 1.16, 0.58, g, 'wingStarLow'); dn.position.set(xs, wingY(xs) - ht - 0.01, zc); dn.rotation.set(Math.PI / 2, 0, Math.PI); }

  // ---- all-moving stabilators: pivot axis at z 4.85, 2 deg anhedral; planform traced in the top view
  const ST = HG.STAB;
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R';
    const geo = outward(airfoilGeo({ u0: ST.x0, u1: ST.tip - 0.02, nu: 12, LE: stabLEr, TE: stabTE, tc: () => ST.tc, nc: 12, split: true, cap0: true, cap1: true, map: (x, z, h) => [s * x, stabY(x) + h, z] }));
    const p0 = V(s * ST.x0, stabY(ST.x0), ST.pivotZ), p1 = V(s * ST.tip, stabY(ST.tip), ST.pivotZ);
    surf['stab' + S] = hinged(g, geo, pair2, ...(s > 0 ? [p0, p1] : [p1, p0]), 'stab' + S);
  }

  // ---- spine speedbrake between the fins (hinged at its front, opens up)
  const SB = [2.85, 4.05], sbY = z => fuseT(z) + 0.012;
  mesh(new THREE.BoxGeometry(0.56, 0.02, SB[1] - SB[0]).translate(0, (sbY(SB[0]) + sbY(SB[1])) / 2 - 0.02, (SB[0] + SB[1]) / 2).rotateX(0), blackM, g, 'brakeWell');
  const brake = hinged(g, slab([[-0.3, SB[0], .04], [0.3, SB[0], .04], [0.27, SB[1], .03], [-0.27, SB[1], .03]], (a, b, w) => [a, sbY(b) + w, b]), greyM, V(-0.3, sbY(SB[0]), SB[0]), V(0.3, sbY(SB[0]), SB[0]), 'speedbrake');

  // ---- windscreen (fixed, base to the bow) and canopy (bow to the aft fairing, hinged at the rear, opens nose-up)
  const tube = (pts, r, mat, parent, name) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 2), r, 5), mat, parent, name);
  const ws = new THREE.Group(); ws.name = 'windscreen'; g.add(ws);
  mesh(canopyGeo(HG.Z_WS, HG.Z_BOW, { n: 24 }), glassM, ws, 'windscreenGlass');
  tube(canopyHoop(HG.Z_BOW, 0.02, 14), 0.032, frameM, ws, 'windscreenBow'); tube(canopyHoop(HG.Z_WS + 0.03, 0.012, 14), 0.022, frameM, ws, 'windscreenBase');
  for (const s of [-1, 1]) tube(canopySillPts(s, HG.Z_WS + 0.03, HG.Z_BOW, 4), 0.022, frameM, ws, 'windscreenSide');
  // what you see of the cockpit from outside (the full cockpit, jetcockpit.js, draws only from the seat): the dark tub,
  // the glareshield over the panel, the HUD frame and the SJU-5/6 seat with its headbox, at the shifted seat station
  const ext = new THREE.Group(); ext.name = 'extCockpit'; g.add(ext);
  { const tubM = M(0x2e3236, { side: THREE.BackSide }), seatM = M(0x3a3f44), padM = M(0x4a5040), z0 = HG.Z_WS + 0.55, z1 = HG.Z_CANOPY_END - 0.32, SZ = JET.SEAT[2];
    mesh(new THREE.BoxGeometry(0.76, 0.95, z1 - z0).translate(0, 0.14, (z0 + z1) / 2), tubM, ext, 'tub');
    mesh(new THREE.BoxGeometry(0.72, 0.1, 0.42).translate(0, 0.62, HG.Z_BOW + 0.32), M(0x1c1e20), ext, 'glareshield');
    mesh(new THREE.BoxGeometry(0.7, 0.42, 0.06).translate(0, 0.38, HG.Z_BOW + 0.52), M(0x26292c), ext, 'panelFace');
    mesh(new THREE.BoxGeometry(0.2, 0.2, 0.012).rotateX(-0.25).translate(0, 0.82, HG.Z_BOW + 0.38), frameM, ext, 'hudFrame');
    mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5).translate(0, 0.0, SZ - 0.05), seatM, ext, 'seatPan');
    mesh(new THREE.BoxGeometry(0.5, 0.78, 0.14).rotateX(-0.21).translate(0, 0.38, SZ + 0.24), seatM, ext, 'seatBack');
    mesh(new THREE.BoxGeometry(0.36, 0.3, 0.22).rotateX(-0.21).translate(0, 0.9, SZ + 0.36), padM, ext, 'headbox');
    mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI).translate(0, 1.04, SZ + 0.33), M(0xd8b018), ext, 'faceCurtain'); }

  // the canopy rails / cockpit coaming: dark strips on the opening's rim from the windscreen to the aft fairing (seen from
  // the seat between the consoles and the glass, and from outside under the canopy edge)
  for (const s of [-1, 1]) {
    const pos = [], idx = [], n = 40, z0 = HG.Z_WS + 0.02, z1 = HG.Z_CANOPY_END - 0.25;
    for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n, w = canopyW(z), y = sill(z) - 0.015; pos.push(s * (w - 0.16), y - 0.01, z, s * (w + 0.05), y, z); if (i) { const k = (i - 1) * 2; s > 0 ? idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) : idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const cgm = new THREE.BufferGeometry(); cgm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cgm.setIndex(idx); cgm.computeVertexNormals();
    mesh(cgm, M(0x26292c, { side: THREE.DoubleSide }), g, 'coaming');
  }

  const cg = new THREE.Group(); cg.name = 'canopy'; cg.position.set(...JET.CANOPY_HINGE); g.add(cg);
  const cv = new THREE.Group(); cv.position.set(...JET.CANOPY_HINGE).negate(); cg.add(cv);   // children in aircraft coords
  mesh(canopyGeo(HG.Z_BOW + 0.01, HG.Z_CANOPY_END, { n: 28 }), glassM, cv, 'canopyGlass');
  tube(canopyHoop(HG.Z_BOW + 0.04, 0.02, 14), 0.026, frameM, cv, 'canopyBow'); tube(canopyHoop(HG.Z_CANOPY_END - 0.06, 0.01, 12), 0.04, frameM, cv, 'canopyAft');
  for (const s of [-1, 1]) tube(canopySillPts(s, HG.Z_BOW + 0.02, HG.Z_CANOPY_END - 0.04, 10, 0.02), 0.03, frameM, cv, 'canopySill');
  mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05).translate(0, JET.CANOPY_HINGE[1] + 0.06, JET.CANOPY_HINGE[2] - 0.03), frameM, cv, 'canopyHinge');

  // ---- engines: shroud, variable petals (exit radius animated), dark liner, burner face (heat glow), afterburner flame
  // F404 nozzles at the drawn centres (x +-0.40, y -0.35), base radius 0.42 at z 5.32, exit at z 6.04
  const NZ = HG.NOZ, eng = [], LP = NZ.rBase - 0.02;
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.name = 'engine' + (s < 0 ? 'L' : 'R'); e.position.set(s * NZ.x, NZ.y, 0); g.add(e);
    mesh(cylZ(NZ.rBase, LP, 0.3, 20, true), metalM, e, 'shroud').position.z = NZ.z0 + 0.15;
    const petGeo = cylZ(LP, LP, HG.NOZZLE_EXIT - NZ.z0 - 0.3, 20, true), pp = petGeo.attributes.position, base = [];
    for (let i = 0; i < pp.count; i++) if (pp.getZ(i) > 0) base.push(i, pp.getX(i) / LP, pp.getY(i) / LP);
    const petals = mesh(petGeo, M(0x3c3f43, { shininess: 60, side: THREE.DoubleSide }), e, 'petals'); petals.position.z = (NZ.z0 + 0.3 + HG.NOZZLE_EXIT) / 2;
    mesh(cylZ(0.29, 0.29, 0.8, 16, true), M(0x111213, { side: THREE.BackSide }), e, 'liner').position.z = NZ.z0 + 0.25;
    const faceM = B(0x000000), face = mesh(new THREE.CircleGeometry(0.30, 16), faceM, e, 'burnerFace'); face.position.z = NZ.z0 - 0.1;
    mesh(cylZ(0.13, 0.0, 0.3, 8), M(0x1a1a1a), e, 'tailCone').position.z = NZ.z0 + 0.05;
    const add = c => B(c, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const cone = new THREE.CylinderGeometry(0, 1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const fl = new THREE.Group(); fl.name = 'afterburner'; fl.position.z = HG.NOZZLE_EXIT + 0.02; e.add(fl);
    const outer = mesh(cone, add(0xff8a3a), fl, 'abOuter'), core = mesh(cone, add(0x9cc2ff), fl, 'abCore');
    const dm = add(0xd8e8ff), diamonds = [];
    for (let k = 0; k < 4; k++) diamonds.push(mesh(new THREE.SphereGeometry(1, 8, 4), dm, fl, 'shockDiamond'));
    eng.push({ petals, pp, base, faceM, fl, outer, core, dm, diamonds, ph: s * 1.7 });
  }

  // stabilator actuator fairings: the long tapering pods outboard of the nozzles (the top view's outline from the stab TE root to the exit)
  for (const s of [-1, 1]) {
    const A = HG.ACT, xo = z => { const t = A.xo; for (let i = 1; i < t.length; i++) if (z <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (z - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[t.length - 1][1]; };
    const poly = [[0.62, A.z0, 0.2], [xo(A.z0), A.z0, 0.2], [xo(5.6), 5.6, A.h], [xo(A.z1), A.z1, 0.14], [0.62, A.z1, 0.14]];
    mesh(slab(poly, (a, b, w) => [s * a, NZ.y + w, b]), greyM, g, 'actFairing');
  }

  // ---- landing gear (wheels at the drawn stations: nose z -4.91 twin, mains x +-1.544 z 0.6)
  const wheel = (r, w, parent, x, y, z) => {
    const wg = new THREE.Group(); wg.position.set(x, y, z); parent.add(wg);
    mesh(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), tyreM, wg, 'tyre');
    mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 10).rotateZ(Math.PI / 2), gearM, wg, 'hub'); return wg;
  };
  // nose: pivot -> steer -> oleo slider -> twin wheels + launch bar
  const NP = V(0, -0.62, JET.GEAR.nose[2]), nose = new THREE.Group(); nose.name = 'noseGear'; nose.position.copy(NP); g.add(nose);
  const steer = new THREE.Group(); nose.add(steer);
  const nwy = JET.GEAR.nose[1] + JET.WHEEL_R.nose - NP.y;   // wheel centre in the gear frame
  rod(V(0, 0.02, 0), V(0, nwy + 0.45, 0), 0.13, gearM, steer, 'noseStrut');
  const nSl = new THREE.Group(); nSl.name = 'noseOleo'; steer.add(nSl);
  rod(V(0, nwy + 0.55, 0), V(0, nwy, 0), 0.09, M(0xeef0f2, { shininess: 80 }), nSl, 'noseSlider');
  mesh(boxG(0.44, 0.08, 0.08, 0, nwy, 0), gearM, nSl, 'noseAxle');
  wheel(JET.WHEEL_R.nose, 0.17, nSl, -0.2, nwy, 0); wheel(JET.WHEEL_R.nose, 0.17, nSl, 0.2, nwy, 0);
  const launchBar = rod(V(0, nwy + 0.25, -0.12), V(0, -2.05 - NP.y + 0.04, -0.85), 0.07, M(0x9aa0a6), nSl, 'launchBar');
  mesh(boxG(0.12, 0.12, 0.05, 0, -0.45, -0.1), M(0xfff6d0, { emissive: 0x444030 }), steer, 'taxiLight');
  // mains: strut from the duct's lower side, wheel bottom at the contract point; retract by slerping toward a forward/inward pose
  const mains = [];
  for (const s of [-1, 1]) {
    const P0 = V(s * 1.12, -0.72, 0.3), Wc = V(s * HG.MAIN_WHEEL[0], JET.GEAR.mainR[1] + JET.WHEEL_R.main, 0.6), A = V(s * 1.34, Wc.y, 0.6);
    const mg = new THREE.Group(); mg.name = 'mainGear' + (s < 0 ? 'L' : 'R'); mg.position.copy(P0); g.add(mg);
    const u = V().subVectors(A, P0).normalize();
    rod(V(), u.clone().multiplyScalar(0.62), 0.15, gearM, mg, 'mainStrut');
    rod(V(s * -0.3, -0.12, 0.45), u.clone().multiplyScalar(0.45), 0.06, gearM, mg, 'mainBrace');
    const sl = new THREE.Group(); mg.add(sl);
    const a = V().subVectors(A, P0), w = V().subVectors(Wc, P0);
    rod(u.clone().multiplyScalar(0.45), a, 0.1, M(0xeef0f2, { shininess: 80 }), sl, 'mainOleo');
    mesh(boxG(0.22, 0.07, 0.07, (a.x + w.x) / 2, a.y, a.z), gearM, sl, 'mainAxle');
    wheel(JET.WHEEL_R.main, 0.28, sl, w.x, w.y, w.z);
    const frame = (d, ax) => { const a2 = ax.clone().addScaledVector(d, -ax.dot(d)).normalize(); return new THREE.Matrix4().makeBasis(d, a2, V().crossVectors(d, a2)); };
    const t = V(-0.5 * s, 0.12, -1).normalize(), qUp = new THREE.Quaternion().setFromRotationMatrix(frame(t, V(s, 0, 0)).multiply(frame(u, V(s, 0, 0)).transpose()));
    mains.push({ mg, sl, u, k: 1 / -u.y, qUp });
  }
  const q0 = new THREE.Quaternion();

  // ---- tailhook (NASA F-18 HARV side view: pivot under the aft fuselage, the shoe just aft of the nozzles when stowed)
  const hook = new THREE.Group(); hook.name = 'tailhook'; hook.position.set(...HOOK_PIVOT); g.add(hook);
  mesh(boxG(0.08, 0.08, HOOK_LEN - 0.15, 0, 0, (HOOK_LEN - 0.15) / 2), M(0x60666b), hook, 'hookArm');
  mesh(boxG(0.1, 0.12, 0.22, 0, -0.02, HOOK_LEN - 0.1), M(0xe8e8e8), hook, 'hookShoe');
  mesh(boxG(0.09, 0.09, 0.09, 0, 0, 0), darkM, hook);

  // ---- lights: position (red L / green R on the LEX edges), white tail light + strobes at the fin tips, red beacons
  // on the spine and belly, formation strips
  const lightG = new THREE.Group(); lightG.name = 'lights'; g.add(lightG);
  const bulb = (c, r, p, name) => { const m = mesh(new THREE.SphereGeometry(r, 6, 4), B(c), lightG, name); m.position.copy(p); return m; };
  const lexE = lexOutline(36).find(([, z]) => z > -2.4);
  bulb(0xff2a1a, 0.05, V(-lexE[0], LEX.yOut + 0.03, lexE[1]), 'navRed'); bulb(0x2aff5a, 0.05, V(lexE[0], LEX.yOut + 0.03, lexE[1]), 'navGreen');
  bulb(0xffffff, 0.045, V(0, NZ.y + 0.3, NZ.z0 + 0.7), 'tailLight');
  const strobes = [bulb(0xffffff, 0.07, surf.finTipL.clone().add(V(-0.03, 0.05, 0)), 'strobeL'), bulb(0xffffff, 0.07, surf.finTipR.clone().add(V(0.03, 0.05, 0)), 'strobeR')];
  const beacon = bulb(0xff3020, 0.07, V(0, fuseT(1.2) + 0.04, 1.2), 'beacon'), beacon2 = bulb(0xff3020, 0.07, V(0, -0.92, -1.0), 'beaconLow');
  const formM = B(0x8fd060);
  for (const s of [-1, 1]) {
    const f1 = onSkinStrip(-7.4, 0.15, s), f2 = onSkinStrip(2.9, 0.1, s);
    for (const [p, n] of [f1, f2]) { const m = mesh(boxG(0.02, 0.05, 0.6, 0, 0, 0), formM, lightG, 'formation'); m.position.copy(p).addScaledVector(n, 0.012); m.rotation.y = Math.atan2(n.x, n.z) - s * Math.PI / 2; }
    const t = mesh(boxG(0.02, 0.05, 0.6, 0, 0, 0), formM, lightG, 'formation'); t.position.set(...finPt(s, FIN_H - 0.45, finLE(FIN_H - 0.45) + 0.6, 0.04)); t.rotation.z = -s * FT.cant;
  }
  function onSkinStrip(z, y, s) { const ph = FS0.yToPhi(z, y, s); FS0.at(z, ph, _p); FS0.normal(z, ph, _n); return [V(_p.x, _p.y, _p.z), V(_n.x, _n.y, _n.z)]; }

  // ---- stores: wingtip AIM-9s and four Mk-82s
  const aimG = merge([cylZ(0.065, 0.065, 2.85, 8), new THREE.SphereGeometry(0.065, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -1.425),
    ...[0, 1].flatMap(k => [boxG(0.36, 0.006, 0.16, 0, 0, -1.0), boxG(0.62, 0.006, 0.32, 0, 0, 1.2)].map(b => b.rotateZ(Math.PI / 4 + k * Math.PI / 2)))]);
  const aimM = M(0xd2d4d0), seekM = M(0x2b3a44, { shininess: 90, rk: 'lamp' });
  const aam = JET.STATIONS.aam.map((p, i) => {
    const m = mesh(aimG, aimM, g, 'aim9' + (i ? 'R' : 'L')); m.position.set(...p);
    mesh(new THREE.SphereGeometry(0.067, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -1.42), seekM, m);
    mesh(cylZ(0.067, 0.067, 0.12, 8), M(0xc8a040), m).position.z = -0.6; return m;
  });
  const bombGeo = merge([new THREE.CapsuleGeometry(0.14, 1.5, 3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.2), cylZ(0.14, 0.05, 0.45, 8).translate(0, 0, 0.84),
    boxG(0.5, 0.01, 0.3, 0, 0, 0.92).rotateZ(Math.PI / 4).translate(0, 0, 0), boxG(0.5, 0.01, 0.3, 0, 0, 0.92).rotateZ(-Math.PI / 4)]);
  const bombM = M(0x2d3326), bandM = M(0xc8b040);
  const bombs = JET.STATIONS.bomb.map((p, i) => {
    const m = mesh(bombGeo, bombM, g, 'mk82_' + i); m.position.set(...p);
    mesh(cylZ(0.142, 0.142, 0.06, 8), bandM, m).position.z = -0.9; return m;
  });

  // ---- levels: the lofted skins switch at 150 m / 700 m (renderkit/lod.js); everything else is shared by all levels
  // the far level (past 700 m) is the whole airframe in two draws: the coarse skins plus wings, LEX, fins and
  // stabilators baked at rest (white / blue); every separate part dissolves out by 700 m (small fittings, decals and
  // lamps by 180 m), so the jet costs 2-4 draws far away instead of ~150
  { const W2 = [], B2 = [];
    for (const s of [-1, 1]) {
      const ws = outward(airfoilGeo({ u0: W.x0, u1: W.tipX, nu: 4, nc: 6, LE: wingLE, TE: wingTE, tc: wingTC, split: true, map: (x, z, h) => [s * x, wingY(x) + h, z] }));
      B2.push(ws);
      W2.push(outward(airfoilGeo({ u0: HG.STAB.x0, u1: HG.STAB.tip - 0.02, nu: 4, nc: 6, LE: stabLEr, TE: stabTE, tc: () => HG.STAB.tc, map: (x, z, h) => [s * x, stabY(x) + h, z] })));
      W2.push(finPiece(s, -0.3, FIN_H, 0, 1, 4));
      const edge = lexOutline(10), inner = edge.slice().reverse().map(([, z]) => [Math.max(0.3, fuseW(z) - 0.08), z]);
      B2.push(slab([...edge.map(([x, z]) => [x, z, 0.03, 0.5]), ...inner.map(([x, z]) => [x, z, 0.16, 0.6])], (a, b, w) => [s * a, LEX.yIn + (LEX.yOut - LEX.yIn) * Math.min(1, Math.max(0, (a - 0.55) / 0.85)) + w, b]));
    }
    W2.push(canopyGeo(HG.Z_WS, HG.Z_CANOPY_END, { n: 8, lod: 1 }));
    mesh(merge(W2), greyM, lod[2], 'farWhite'); mesh(merge(B2), blueM, lod[2], 'farBlue'); }
  createLOD(g, [{ object: lod[0], far: 150 }, { object: lod[1], far: 700 }, { object: lod[2] }]);
  { const skins = new Set(); lod.forEach(l => l.traverse(o => skins.add(o))); const bs = new THREE.Sphere();
    g.traverse(o => { if (!o.isMesh || skins.has(o)) return; o.geometry.computeBoundingSphere(); bs.copy(o.geometry.boundingSphere); detail(o, 700); }); }   // (one range for every part: fewer shader variants to compile mid-flight)

  // ---- animation
  const def = (v, d) => (v === undefined || v === null ? d : v);
  const ZERO2 = [0, 0], ONE2 = [1, 1], WOW0 = [0, 0, 0];
  let hookA = HOOK_UP;
  const shell = [cg, ws, ext];   // hidden from the seat (jetcockpit.js draws the real cockpit); shell[0] = the canopy
  function animate(s = {}, dt = 0, time = 0, inside = false) {
    const stab = def(s.stab, 0), sd = def(s.stabDiff, 0), ail = def(s.ail, 0), rud = def(s.rud, 0);
    surf.stabR.rotation.x = -(stab + sd); surf.stabL.rotation.x = -(stab - sd);   // + = trailing edge up
    surf.ailR.rotation.x = -ail; surf.ailL.rotation.x = ail;
    surf.rudR.rotation.x = rud; surf.rudL.rotation.x = rud;                       // + = trailing edge to +x
    const fp = def(s.flap, 0) * 0.78, le = -def(s.lef, 0) * 0.6;
    surf.flapR.rotation.x = surf.flapL.rotation.x = fp; surf.lefR.rotation.x = surf.lefL.rotation.x = le;
    brake.rotation.x = -def(s.brake, 0) * 1.05;
    cg.rotation.x = def(s.canopy, 0) * JET.CANOPY_OPEN;
    // gear
    const gd = THREE.MathUtils.clamp(def(s.gear, 1), 0, 1), wow = s.wow || WOW0, up = 1 - gd;
    nose.rotation.x = up * 1.7; steer.rotation.y = -def(s.steer, 0) * gd;
    nSl.position.y = Math.min(0.3, wow[0] || 0);
    launchBar.visible = !!s.launchBar && gd > 0.98;
    for (let i = 0; i < 2; i++) {
      const m = mains[i], c = Math.min(0.3, wow[i + 1] || 0) * m.k;
      m.sl.position.set(-m.u.x * c, -m.u.y * c, -m.u.z * c);
      m.mg.quaternion.slerpQuaternions(q0, m.qUp, THREE.MathUtils.smoothstep(up, 0, 1));
    }
    hookA = HOOK_UP + (HOOK_DOWN - HOOK_UP) * THREE.MathUtils.clamp(def(s.hook, 0), 0, 1); hook.rotation.x = hookA;
    // engines
    const n = s.n || ZERO2, nz = s.nozzle || ONE2, ab = s.ab || ZERO2;
    for (let i = 0; i < 2; i++) {
      const e = eng[i], k = HG.NOZ.rExit + 0.10 * THREE.MathUtils.clamp(nz[i], 0, 1), pa = e.pp.array;
      for (let j = 0; j < e.base.length; j += 3) { pa[e.base[j] * 3] = e.base[j + 1] * k; pa[e.base[j] * 3 + 1] = e.base[j + 2] * k; }
      e.pp.needsUpdate = true;
      const a = THREE.MathUtils.clamp(ab[i], 0, 1), heat = Math.max(0, (n[i] - 0.7) / 0.35) ** 2 * 0.35 + a * 0.6;
      e.faceM.color.setRGB(heat * 1.0, heat * 0.45, heat * 0.15 + a * 0.25);
      e.fl.visible = a > 0.01;
      if (a > 0.01) {
        const fk = 1 + 0.07 * Math.sin(time * 41 + e.ph) + 0.05 * Math.sin(time * 67 + e.ph * 3), L = (0.6 + 4.4 * a) * fk, br = inside ? 0.5 : 1;
        e.outer.scale.set(k * 1.02, k * 1.02, L); e.core.scale.set(k * 0.6, k * 0.6, L * 0.62);
        e.outer.material.opacity = (0.16 + 0.22 * a) * br; e.core.material.opacity = (0.35 + 0.35 * a) * br; e.dm.opacity = 0.85 * a * br;
        for (let d = 0; d < 4; d++) {
          const z = (0.45 + 0.75 * d) * (0.75 + 0.25 * a) * fk, m = e.diamonds[d];
          m.visible = z < L * 0.7; m.position.z = z; const r = k * (0.62 - 0.08 * d); m.scale.set(r * 0.5, r * 0.5, 0.28 * (1 - 0.15 * d));
        }
      }
    }
    // lights
    const lit = !!s.lights; lightG.visible = lit;
    if (lit) { const st = time % 1.1 < 0.07; strobes[0].visible = strobes[1].visible = st; beacon.visible = beacon2.visible = (time + 0.55) % 1.1 < 0.12; }
    // stores
    const st = s.stores; aam[0].visible = st ? !!st.aam?.[0] : true; aam[1].visible = st ? !!st.aam?.[1] : true;
    for (let i = 0; i < 4; i++) bombs[i].visible = st ? !!st.bomb?.[i] : true;
    for (const o of shell) o.visible = !inside;
  }
  function hookTip(out = new THREE.Vector3()) { return out.set(HOOK_PIVOT[0], HOOK_PIVOT[1] - HOOK_LEN * Math.sin(hookA), HOOK_PIVOT[2] + HOOK_LEN * Math.cos(hookA)); }
  animate({});
  return { group: g, shell, hookTip, animate, lod, parts: { surf, brake, canopy: cg, windscreen: ws, nose, mains, hook, eng, aam, bombs, lights: lightG, fuselage: fuse } };
}
