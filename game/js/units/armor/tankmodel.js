// M60A3 TTS exterior model (and the shared running-gear kit the M113 uses): real dimensions, house style (flat-shaded
// Lambert, no image textures, small details as geometry), 1980 US Army MERDC camouflage painted per face, dust and mud
// by height, stencilled markings as canvas decals. Every moving part animates from the sim state: roadwheels ride their
// torsion arms with the suspension travel and spin with the track, the sprocket and idler turn, the track links run
// round the real belt (6 roadwheels, 3 support rollers, idler, sprocket; links instanced), turret, gun (recoil),
// cupola and its .50, hatches, the TTS armoured doors, the xenon searchlight.
//
// Frame: the hull frame of trackfm (origin on the ground at static ride, x right, y up, z aft; forward is -z).
import * as THREE from 'three';
import { M60A3 } from './m60a3.js';
import { pbr, decal as rkDecal, DETAIL } from '../../renderkit/gamemats.js';   // RENDERKIT surface

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------- paint
// MERDC (1975-85) "Summer Verdant": forest green, field drab, sand, black blotches. A deterministic 3-D value noise
// picks the colour of each face from its centroid (the pattern wraps over edges like brushed paint). Dust settles on
// the lower hull and the horizontal surfaces; mud on the running gear.
export const MERDC = { green: 0x56653f, drab: 0x74603f, sand: 0xb3a171, black: 0x2c2b26 };
const hash = (x, y, z) => { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = t => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}
export function camoColor(x, y, z, seed = 0, out = new THREE.Color()) {
  const n = vnoise(x * 0.9 + seed, y * 0.9, z * 0.9) * 0.65 + vnoise(x * 2.1, y * 2.1 + seed, z * 2.1) * 0.35;
  const m = vnoise(x * 1.3 + 40 + seed, y * 1.3, z * 1.3 + 9);
  let c = n < 0.38 ? MERDC.green : n < 0.56 ? MERDC.drab : n < 0.7 ? MERDC.green : MERDC.sand;
  if (m > 0.78 && n > 0.45) c = MERDC.black;
  return out.setHex(c);
}
const DUST = new THREE.Color(0x8a7a5c), MUD = new THREE.Color(0x4a3d2c), _c = new THREE.Color(), _n = new THREE.Vector3();
// give every face of a (non-indexed) geometry a colour: fn(centroid, normal) -> THREE.Color
export function paintFaces(geo, fn) {
  if (geo.index) geo = geo.toNonIndexed();
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3), a = V3(), b = V3(), c = V3(), ctr = V3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    _n.subVectors(c, b).cross(V3().subVectors(a, b)).normalize();
    const k = fn(ctr, _n);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = k.r; col[(i + j) * 3 + 1] = k.g; col[(i + j) * 3 + 2] = k.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// camouflage + weathering, evaluated in a reference frame (hull frame) so the pattern is continuous across parts
export function weathered(seed = 0, worldOf = null, dirt = 1) {
  const w = V3();
  return (ctr, nrm) => {
    if (worldOf) worldOf(w.copy(ctr)); else w.copy(ctr);
    camoColor(w.x, w.y, w.z, seed, _c);
    const low = THREE.MathUtils.clamp(1 - (w.y - 0.3) / 0.9, 0, 1) * 0.75 * dirt;   // splashed mud low down
    const top = Math.max(0, nrm.y) * 0.28 * dirt;                                     // dust on horizontal surfaces
    const spot = vnoise(w.x * 6, w.y * 6, w.z * 6) * 0.18;                              // chipped / scuffed paint
    _c.lerp(MUD, Math.min(0.8, low * (0.6 + spot)));
    _c.lerp(DUST, top + spot * 0.4);
    return _c;
  };
}

// ---------------------------------------------------------------------------------------------------- geometry kit
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a part with a thermal signature (userData.heat 0..1, read by the TTS view): exhaust grilles, engine deck
export const hot = (parent, mesh, heat = 0.9) => { mesh.userData.heat = heat; parent.add(mesh); return mesh; };
const cylX = (r, len, seg = 12, x = 0, y = 0, z = 0, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z);   // axis along x (r at -x)
const cylY = (r, h, seg = 12, x = 0, y = 0, z = 0, r2 = r) => new THREE.CylinderGeometry(r2, r, h, seg).translate(x, y, z);
const cylZ = (r, len, seg = 12, x = 0, y = 0, z = 0, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);   // r at -z... (CylinderGeometry top = +y -> after rotateX(+90) top -> +z)
export function merge(geos) {
  const pos = [], nor = [], col = [];
  let hasCol = geos.some(g => g.attributes.color);
  for (let g of geos) {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (hasCol) { if (g.attributes.color) col.push(...g.attributes.color.array); else for (let i = 0; i < g.attributes.position.count; i++) col.push(1, 1, 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (hasCol) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// loft through rings (each ring = closed list of [x, y] at a z), mirrored half-rings given from top centre to bottom
// centre with x >= 0. Caps on both ends. Returns a non-indexed geometry with flat normals.
export function loftHalfRings(stations) {
  const rings = stations.map(([z, half]) => {
    const full = half.map(([x, y]) => [x, y, z]);
    for (let i = half.length - 2; i >= 1; i--) full.push([-half[i][0], half[i][1], z]);
    return full;
  });
  const pos = [], tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const n = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < n; k++) {
    const a = rings[r][k], b = rings[r][(k + 1) % n], c = rings[r + 1][(k + 1) % n], d = rings[r + 1][k];
    tri(a, c, b); tri(a, d, c);
  }
  const cap = (R, flip) => { const c = R.reduce((s, p) => [s[0] + p[0] / R.length, s[1] + p[1] / R.length, s[2] + p[2] / R.length], [0, 0, 0]); for (let k = 0; k < n; k++) flip ? tri(R[k], R[(k + 1) % n], c) : tri(R[(k + 1) % n], R[k], c); };
  cap(rings[0], true); cap(rings[rings.length - 1], false);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fixWinding(g); g.computeVertexNormals(); return g;
}
// make a closed soup outward-facing (signed volume > 0)
function fixWinding(g) {
  const p = g.attributes.position.array; let vol = 0;
  for (let i = 0; i < p.length; i += 9) vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  if (vol < 0) for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
}
// a rod (thin box) between two points
export function rodGeo(a, b, w, h = w) {
  const d = V3().subVectors(b, a), g = new THREE.BoxGeometry(w, h, d.length());
  const m = new THREE.Matrix4().compose(V3().addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d.normalize()), V3(1, 1, 1));
  return g.applyMatrix4(m);
}
// RENDERKIT surface: LM(colour, opts, role) is the same Lambert with ?rk=0, else a RenderKit role material; the paint
// (vertex colours carry the camouflage and baked mud) is painted armour with dust and chipped-to-steel wear on top
export const LM = (color, o, rk) => pbr(() => new THREE.MeshLambertMaterial({ ...(color !== undefined ? { color } : {}), flatShading: true, ...o }), color, { flatShading: true, ...o, rk });
export const MAT = {
  paint: () => LM(undefined, { vertexColors: true }, { role: 'armor', detail: DETAIL.armor }),
  steel: () => LM(0x3c3a36, {}, 'grimy'),
  bright: () => LM(0x6d6a62, {}, 'metal'),    // worn track guides / pins
  rubber: () => LM(0x1d1c1a, {}, 'rubber'),
  glass: () => LM(0x1f3a3e, { emissive: 0x0a1a1c }, 'lamp'),
  canvas: () => LM(0x5b5a3e, {}, 'fabric'),
  black: () => LM(0x141412, {}, 'dark'),
  red: () => LM(0x8a1a12, { emissive: 0x200404 }, 'lamp'),
  amber: () => LM(0xc08a2a, { emissive: 0x2a1a04 }, 'lamp'),
  lamp: () => LM(0xd8d8cc, { emissive: 0x000000 }, 'lamp'),
  mud: () => LM(0x4a3f30, {}, 'concrete'),
};

// ---------------------------------------------------------------------------------------------------- running gear
// dual roadwheel with rubber tyres (axis x), centred at 0
export function roadwheelGeos(r, discW = 0.1, gap = 0.08, holes = 6) {
  const steel = [], rubber = [];
  for (const s of [-1, 1]) {
    const x = s * (gap / 2 + discW / 2);
    rubber.push(cylX(r, discW, 18, x));
    steel.push(cylX(r * 0.82, discW + 0.012, 18, x));                 // the disc inside the tyre
    steel.push(cylX(r * 0.3, discW + 0.04, 10, x + s * 0.01));          // hub boss
    for (let k = 0; k < holes; k++) { const a = k / holes * TAU; steel.push(cylX(r * 0.1, discW + 0.03, 6, x, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55)); }
  }
  steel.push(cylX(r * 0.2, gap + 2 * discW + 0.06, 8));              // axle / cap
  return { steel: merge(steel), rubber: merge(rubber) };
}
// sprocket: two toothed rings, hub, bolts (axis x)
export function sprocketGeo(rp, teeth, width = 0.26) {
  const g = [], ring = (x) => {
    const sh = new THREE.Shape(), n = teeth, rt = rp + 0.055, rr = rp - 0.03;
    for (let i = 0; i < n * 4; i++) {
      const a = i / (n * 4) * TAU, ph = i % 4, r = ph === 0 || ph === 1 ? rt : rr;
      const x2 = Math.cos(a) * r, y2 = Math.sin(a) * r; i ? sh.lineTo(x2, y2) : sh.moveTo(x2, y2);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 2 });
    geo.rotateY(Math.PI / 2).translate(x - 0.02, 0, 0); return geo;
  };
  g.push(ring(-width / 2 + 0.02), ring(width / 2 - 0.02));
  g.push(cylX(rp * 0.75, width - 0.02, 14)); g.push(cylX(rp * 0.42, width + 0.1, 10));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.push(cylX(0.022, width + 0.13, 6, 0, Math.cos(a) * rp * 0.32, Math.sin(a) * rp * 0.32)); }
  return merge(g);
}
// track link (shoe) geometry: along the belt the link spans +-pitch/2 in z, the ground face at -y (outside), width w.
// 'pads': rubber road pads on the outside (T142); guides: a centre guide horn pair on the inside.
export function linkGeos(pitch, w, o = {}) {
  const t = o.t ?? 0.035, steel = [], rubber = [], bright = [];
  const L = pitch * 0.94;
  steel.push(box(w * 0.98, t, pitch * 0.9, 0, 0, 0));                               // shoe body (shoes nearly touch)
  for (const s of [-1, 1]) { bright.push(box(0.05, t * 1.3, pitch * 0.32, s * (w / 2 + 0.02), 0, pitch * 0.5)); }   // end connectors at the pin line
  bright.push(box(w * 0.94, t * 0.6, pitch * 0.18, 0, 0.004, pitch * 0.5));          // pin / bushing tube
  if (o.pads) for (const s of [-1, 1]) rubber.push(box(w * 0.42, 0.022, L * 0.64, s * w * 0.24, -t / 2 - 0.011, 0));
  else for (let k = -1; k <= 1; k++) steel.push(box(w * 0.96, 0.012, 0.02, 0, -t / 2 - 0.006, k * L * 0.26));   // grousers
  if (o.guide !== false) { bright.push(box(0.035, 0.085, L * 0.4, -0.025, t / 2 + 0.042, 0)); bright.push(box(0.035, 0.085, L * 0.4, 0.025, t / 2 + 0.042, 0)); }
  return { steel: merge(steel), rubber: rubber.length ? merge(rubber) : null, bright: merge(bright) };
}

// The track belt as a closed polyline (y, z) around circles traversed CLOCKWISE in the (z right, y up) view: from the
// front wheel over the top (support rollers front to back), round the rear wheel and back along the bottom (roadwheels
// rear to front). circles: [{ y, z, r, sag? }]: r includes half the track thickness (the belt's pitch line).
// Returns { pts: [[y, z, s]...], len } with s the arc length.
export function beltPath(circles, out = null, arcStep = 0.06) {
  const n = circles.length, pts = out || [];
  pts.length = 0;
  // external tangent points between circle i and i+1 (belt on the left of travel = outside for a clockwise loop)
  const tan = [];
  for (let i = 0; i < n; i++) {
    const A = circles[i], B = circles[(i + 1) % n];
    const dz = B.z - A.z, dy = B.y - A.y, L = Math.hypot(dz, dy), uz = dz / L, uy = dy / L;
    const s = (A.r - B.r) / L, c = Math.sqrt(Math.max(0, 1 - s * s));
    // left normal of (uz, uy) in (z, y) is (-uy, uz); rotate toward the direction by asin(s)
    const nz = -uy * c + uz * s, ny = uz * c + uy * s;
    tan.push({ a: [A.y + ny * A.r, A.z + nz * A.r], b: [B.y + ny * B.r, B.z + nz * B.r], ny, nz, sag: A.sag && B.sag ? Math.min(A.sag, B.sag) : 0 });
  }
  let s = 0, last = null;
  const push = (y, z) => { if (last) s += Math.hypot(y - last[0], z - last[1]); const p = [y, z, s]; pts.push(p); last = p; };
  for (let i = 0; i < n; i++) {
    const T = tan[i];
    // straight run (with a little sag on long unsupported top spans)
    const span = Math.hypot(T.b[0] - T.a[0], T.b[1] - T.a[1]);
    const sag = T.ny > 0.7 && span > 0.5 ? (T.sag || 0.03) * Math.min(1, span / 1.5) : 0;
    const k = sag ? 6 : 1;
    for (let j = 0; j <= k; j++) { const f = j / k; push(T.a[0] + (T.b[0] - T.a[0]) * f - sag * 4 * f * (1 - f), T.a[1] + (T.b[1] - T.a[1]) * f); }
    // arc round circle i+1 from this tangent's normal to the next tangent's normal (clockwise in z-y view)
    const C = circles[(i + 1) % n], N = tan[(i + 1) % n];
    let a0 = Math.atan2(T.ny, T.nz), a1 = Math.atan2(N.ny, N.nz);
    while (a1 > a0) a1 -= TAU;             // clockwise: decreasing angle
    if (a0 - a1 > TAU - 1e-6) a1 += TAU;
    const steps = Math.max(0, Math.ceil((a0 - a1) * C.r / arcStep));
    for (let j = 1; j < steps; j++) { const a = a0 + (a1 - a0) * j / steps; push(C.y + Math.sin(a) * C.r, C.z + Math.cos(a) * C.r); }
  }
  // close
  if (pts.length) { const f = pts[0]; s += Math.hypot(f[0] - last[0], f[1] - last[1]); }
  return { pts, len: s };
}
// sample the belt at arc length s (wrapped): position (y, z) and tangent (ty, tz)
export function beltAt(path, s, out) {
  const P = path.pts, L = path.len; s = ((s % L) + L) % L;
  let lo = 0, hi = P.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m][2] <= s) lo = m; else hi = m - 1; }
  const a = P[lo], b = P[(lo + 1) % P.length], segL = (lo + 1 < P.length ? b[2] : L) - a[2];
  const f = segL > 1e-6 ? (s - a[2]) / segL : 0;
  out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f;
  const ty = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(ty, tz) || 1; out[2] = ty / l; out[3] = tz / l;
  return out;
}

// A complete running-gear side: roadwheels on torsion arms, support rollers, idler, sprocket, shock absorbers and the
// instanced track. def: { x (track centre), wheels: [{ z, r }], hubY0 (static hub height), armLen, armUp (pivot above
// hub), armFwd (+1: pivot ahead of the wheel / trailing arm), rollers: [{ z, y, r }], idler: { z, y, r }, sprocket:
// { z, y, r, teeth }, track: { pitch, width, thick, pads }, shocks: [indices], hullX (inner pivot x) }
export function buildRunningGear(def, mats, side) {
  const g = new THREE.Group(); g.name = 'runningGear' + (side < 0 ? 'L' : 'R');
  const x = def.x, wheels = [], arms = [], shocks = [];
  const rw = roadwheelGeos(def.wheels[0].r, def.discW ?? 0.11, def.discGap ?? 0.09);
  for (const w of def.wheels) {
    const piv = new THREE.Group(); piv.position.set(x, def.hubY0, w.z);
    const spin = new THREE.Group(); piv.add(spin);
    spin.add(new THREE.Mesh(rw.steel, mats.steelP), new THREE.Mesh(rw.rubber, mats.rubber));
    g.add(piv); wheels.push({ piv, spin, z: w.z, r: w.r });
    // torsion arm: from the hull pivot to the hub
    const arm = new THREE.Mesh(box(0.09, 0.12, 1), mats.steelP); g.add(arm); arms.push(arm);
    // the torsion-bar pivot housing on the hull side
    const ph = new THREE.Mesh(cylX(0.09, 0.16, 8, x - side * 0.3, def.hubY0 + def.armUp, w.z + def.armFwd * def.armLen), mats.steelP); g.add(ph);
  }
  for (const i of def.shocks || []) {
    const sh = new THREE.Mesh(cylY(0.045, 1, 8), mats.steel); g.add(sh); shocks.push({ i, mesh: sh });
  }
  const rollers = [];
  const rr = def.rollers.length ? roadwheelGeos(def.rollers[0].r, 0.07, 0.07, 0) : null;
  for (const r of def.rollers) { const m = new THREE.Group(); m.position.set(x, r.y, r.z); m.add(new THREE.Mesh(rr.steel, mats.steelP), new THREE.Mesh(rr.rubber, mats.rubber)); g.add(m); rollers.push(m); }
  const idl = new THREE.Group(); idl.position.set(x, def.idler.y, def.idler.z);
  const ig = roadwheelGeos(def.idler.r, 0.1, 0.09, 5); idl.add(new THREE.Mesh(ig.steel, mats.steelP), new THREE.Mesh(ig.rubber, mats.steel)); g.add(idl);
  const spr = new THREE.Group(); spr.position.set(x, def.sprocket.y, def.sprocket.z);
  spr.add(new THREE.Mesh(sprocketGeo(def.sprocket.r, def.sprocket.teeth, def.track.width * 0.42), mats.steelP)); g.add(spr);
  // final drive housing
  g.add(new THREE.Mesh(cylX(def.sprocket.r * 0.5, 0.3, 10, x - side * (def.track.width * 0.25 + 0.15), def.sprocket.y, def.sprocket.z), mats.steelP));
  // track links
  const lk = linkGeos(def.track.pitch, def.track.width, { pads: def.track.pads, t: def.track.thick });
  const count = def.track.links;
  const parts = [[lk.steel, mats.trackSteel], [lk.bright, mats.bright]]; if (lk.rubber) parts.push([lk.rubber, mats.rubber]);
  const inst = parts.map(([geo, m]) => { const im = new THREE.InstancedMesh(geo, m, count); im.frustumCulled = false; g.add(im); return im; });
  const circles = [], path = { pts: [], len: 0 }, tmp = [0, 0, 0, 0], M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = V3(), S = V3(1, 1, 1), E = new THREE.Euler();
  const half = def.track.thick / 2;
  const state = { travel: def.wheels.map(() => 0), trackPos: 0, sink: 0 };
  function update(travel, trackPos) {
    // wheels on their arms: the hub moves up by the travel (arm swings about its pivot)
    for (let i = 0; i < wheels.length; i++) {
      const W = wheels[i], t = travel ? travel[i] : 0;
      const pivY = def.hubY0 + def.armUp, pivZ = W.z + def.armFwd * def.armLen;
      // arm length fixed: hub at (pivZ - armFwd * sqrt(L^2 - dy^2)) with dy = pivY - hubY
      const hubY = def.hubY0 + t, dy = pivY - hubY, L = Math.hypot(def.armLen, def.armUp), dz = Math.sqrt(Math.max(0.01, L * L - dy * dy));
      const hubZ = pivZ - def.armFwd * dz;
      W.piv.position.set(x, hubY, hubZ); W.hubZ = hubZ;
      W.spin.rotation.x = -trackPos / W.r;
      const a = V3(x - side * 0.12, hubY, hubZ), b = V3(x - side * 0.3, pivY, pivZ);
      const arm = arms[i], d = V3().subVectors(b, a); arm.position.addVectors(a, b).multiplyScalar(0.5); arm.scale.set(1, 1, d.length()); arm.quaternion.setFromUnitVectors(V3(0, 0, 1), d.normalize());
    }
    for (const s of shocks) { const W = wheels[s.i]; const a = V3(x - side * 0.25, W.piv.position.y + 0.05, W.hubZ + def.armFwd * 0.25), b = V3(x - side * 0.3, def.hubY0 + def.armUp + 0.35, W.hubZ + def.armFwd * 0.5); const d = V3().subVectors(b, a); s.mesh.position.addVectors(a, b).multiplyScalar(0.5); s.mesh.scale.set(1, d.length(), 1); s.mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); }
    for (const r of rollers) r.rotation.x = -trackPos / def.rollers[0].r;
    idl.rotation.x = -trackPos / def.idler.r; spr.rotation.x = -trackPos / def.sprocket.r;
    // belt round: front wheel (idler or sprocket), rollers front->back, rear wheel, roadwheels back->front
    circles.length = 0;
    const F = def.frontIsSprocket ? def.sprocket : def.idler, Rr = def.frontIsSprocket ? def.idler : def.sprocket;
    const rF = def.frontIsSprocket ? def.sprocket.r - 0.03 : def.idler.r, rR = def.frontIsSprocket ? def.idler.r : def.sprocket.r - 0.03;
    circles.push({ y: F.y, z: F.z, r: rF + half });
    for (const r of def.rollers) circles.push({ y: r.y, z: r.z, r: r.r + half, sag: 0.03 });
    if (!def.rollers.length) for (let i = 0; i < wheels.length; i++) { if (i === 0 || i === wheels.length - 1) continue; }   // no rollers: the belt sags on the wheel tops
    circles.push({ y: Rr.y, z: Rr.z, r: rR + half });
    for (let i = wheels.length - 1; i >= 0; i--) circles.push({ y: wheels[i].piv.position.y, z: wheels[i].hubZ, r: wheels[i].r + half });
    // M113 style (no rollers): add the wheel tops as supports for the top run
    if (!def.rollers.length) { const top = []; for (let i = 1; i < wheels.length - 1; i++) top.push({ y: wheels[i].piv.position.y, z: wheels[i].hubZ, r: wheels[i].r + half - 0.01, sag: 0.05 }); circles.splice(1, 0, ...top); }
    Object.assign(path, beltPath(circles, path.pts, 0.05));
    const n = count, pitch = path.len / n;
    for (let k = 0; k < n; k++) {
      beltAt(path, k * pitch - trackPos, tmp);
      // link frame: z along the tangent, y = outward normal (left of travel in the z-y view => (ty, tz) rotated)
      const ty = tmp[2], tz = tmp[3];
      // outward normal (left of travel) = (y: tz, z: -ty) -> link's -y must point outward: so local +y = (-tz, ty) inward
      P.set(x, tmp[0], tmp[1]);
      const ang = Math.atan2(-ty, tz);   // rotation about x taking +z to (ty, tz)
      E.set(ang, 0, 0); Q.setFromEuler(E);
      M4.compose(P, Q, S);
      for (const im of inst) im.setMatrixAt(k, M4);
    }
    for (const im of inst) im.instanceMatrix.needsUpdate = true;
  }
  update(null, 0);
  return { group: g, update, wheels, path, def, setTrack: on => { for (const im of inst) im.visible = on; } };
}

// ---------------------------------------------------------------------------------------------------- decals
function stencil(text, w = 256, h = 64, color = '#e8e4d4', font = 'bold 44px "Courier New", monospace') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
  // stencil bridges: draw then cut thin gaps
  x.fillText(text, w / 2, h / 2 + 2);
  x.globalCompositeOperation = 'destination-out'; x.fillRect(0, h / 2 - 1, w, 2);
  for (let i = 0; i < 400; i++) { x.globalAlpha = Math.random() * 0.5; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }   // worn
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function decal(tex, w, h, pos, rotY = 0, rotX = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), rkDecal(() => new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), { map: tex }));   // RENDERKIT surface
  m.position.copy(pos); m.rotation.set(rotX, rotY, 0, 'YXZ'); return m;
}

// ---------------------------------------------------------------------------------------------------- the M60A3
export const TANK = {
  RING: M60A3.TURRET.RING, TRUNNION: M60A3.TURRET.TRUNNION, MUZZLE_FWD: M60A3.TURRET.MUZZLE_FWD,
  // crew eye points (hull frame / turret frame) for the interiors and cameras
  DRIVER_EYE: [0, 1.62, -2.05], GUNNER_EYE_T: [0.56, 0.62, -0.32], COMMANDER_EYE_T: [0.6, 1.05, 0.3],
};
export function buildM60A3Mesh(opts = {}) {
  const T = M60A3.TRACK, seed = opts.seed ?? 3.7, dirt = opts.dirt ?? 1;
  const root = new THREE.Group(); root.name = 'M60A3';
  const paintM = MAT.paint(), steel = MAT.steel(), bright = MAT.bright(), rubber = MAT.rubber(), glass = MAT.glass(), canvas = MAT.canvas(), black = MAT.black();
  const steelP = LM(0x4c4a3c, {}, 'armor');   // painted running gear, muddy
  const trackSteel = LM(0x34302a, {}, 'grimy');
  const W = weathered(seed, null, dirt);
  const P = geo => paintFaces(geo, W);
  const hull = new THREE.Group(); hull.name = 'hull'; root.add(hull);
  const shell = [], glassIn = [];   // exterior shell; vision-device glass hidden when a crewman looks out through it
  // ---- hull body: loft along z
  const ST = [];
  const ring = (z, topY, uw, botY, lw, sy = 1.17) => {
    sy = Math.min(Math.max(sy, botY + 0.1), topY - 0.06); lw = Math.min(lw, uw);
    return [z, [[0, topY], [uw - 0.07, topY], [uw, topY - 0.07], [uw, sy], [lw, sy], [lw, botY + 0.1], [lw - 0.1, botY], [0, botY]]];
  };
  ST.push(ring(-3.47, 1.03, 1.0, 0.97, 1.0));
  ST.push(ring(-3.3, 1.11, 1.14, 0.80, 1.06));
  ST.push(ring(-3.0, 1.25, 1.33, 0.52, 1.1));
  ST.push(ring(-2.6, 1.44, 1.45, 0.463, 1.1));
  ST.push(ring(-2.15, 1.63, 1.45, 0.463, 1.1));
  ST.push(ring(-1.95, 1.72, 1.45, 0.463, 1.1));
  ST.push(ring(-1.6, 1.86, 1.45, 0.463, 1.1));
  ST.push(ring(2.4, 1.90, 1.45, 0.463, 1.1));
  ST.push(ring(3.05, 1.86, 1.45, 0.5, 1.1));
  ST.push(ring(3.3, 1.82, 1.45, 0.68, 1.1));
  ST.push(ring(3.47, 1.80, 1.42, 1.0, 1.08));
  const hullGeo = P(loftHalfRings(ST));
  const parts = [hullGeo];
  // fenders over the tracks (front ones slope down over the idler), mud flaps
  for (const s of [-1, 1]) {
    parts.push(P(box(0.37, 0.025, 6.2, s * 1.635, 1.185, 0.15)));
    parts.push(P(rodGeo(V3(s * 1.635, 1.185, -2.95), V3(s * 1.635, 1.0, -3.55), 0.37, 0.025).scale(1, 1, 1)));
    parts.push(P(box(0.04, 0.12, 6.2, s * 1.815, 1.15, 0.15)));                       // fender lip
    // stowage boxes on the fenders (four per side) with lids and hasps
    for (const [z0, z1] of [[-2.35, -1.45], [-1.35, -0.45], [-0.35, 0.55], [0.65, 1.55]]) {
      parts.push(P(box(0.34, 0.36, z1 - z0, s * 1.63, 1.38, (z0 + z1) / 2)));
      parts.push(P(box(0.36, 0.03, z1 - z0 + 0.02, s * 1.63, 1.575, (z0 + z1) / 2)));
    }
    // headlight clusters on the front corners with brush guards
    parts.push(P(box(0.26, 0.2, 0.16, s * 1.25, 1.24, -3.08)));
    hull.add(new THREE.Mesh(cylZ(0.065, 0.04, 10, s * 1.18, 1.27, -3.17), glass));
    hull.add(new THREE.Mesh(box(0.06, 0.05, 0.02, s * 1.32, 1.21, -3.165), MAT.amber()));
    parts.push(P(rodGeo(V3(s * 1.08, 1.12, -3.2), V3(s * 1.08, 1.42, -3.22), 0.025)));
    parts.push(P(rodGeo(V3(s * 1.4, 1.12, -3.2), V3(s * 1.4, 1.42, -3.22), 0.025)));
    parts.push(P(rodGeo(V3(s * 1.08, 1.42, -3.22), V3(s * 1.4, 1.42, -3.22), 0.025)));
    // tow hooks on the nose and the rear
    hull.add(new THREE.Mesh(box(0.08, 0.16, 0.14, s * 0.75, 0.86, -3.4), steelP));
    hull.add(new THREE.Mesh(box(0.08, 0.16, 0.14, s * 0.85, 0.9, 3.5), steelP));
    // rear: tail light clusters, exhaust grilles over the rear deck sides
    hull.add(new THREE.Mesh(box(0.14, 0.12, 0.05, s * 1.25, 1.62, 3.49), MAT.red()));
    for (let k = 0; k < 6; k++) hot(hull, new THREE.Mesh(box(0.42, 0.02, 0.03, s * 1.05, 1.905, 2.65 + k * 0.12), black), 1);
    // mud flaps
    parts.push(P(box(0.36, 0.3, 0.015, s * 1.63, 1.0, 3.32)));
  }
  // engine deck grilles (centre) and access doors
  for (let k = 0; k < 9; k++) hot(hull, new THREE.Mesh(box(1.05, 0.02, 0.04, 0, 1.906, 1.15 + k * 0.13), black), 0.85);
  parts.push(P(box(1.2, 0.03, 1.25, 0, 1.91, 1.7)));
  // driver's hatch with three M27 periscopes, the hull roof ring guard
  const dh = new THREE.Group(); dh.position.set(0, 1.78, -2.0); hull.add(dh);
  dh.add(new THREE.Mesh(P(cylY(0.32, 0.08, 14, 0, 0.06, 0)), paintM));
  for (const a of [-0.45, 0, 0.45]) { const pe = new THREE.Mesh(box(0.16, 0.09, 0.07, Math.sin(a) * 0.22, 0.14, -Math.cos(a) * 0.22), glass); pe.rotation.y = -a; dh.add(pe); glassIn.push(pe); }
  const dHatch = new THREE.Group(); dHatch.position.set(0, 0.11, 0.0); dh.add(dHatch); dHatch.add(new THREE.Mesh(P(cylY(0.26, 0.05, 12, 0, 0.02, 0)), paintM)); dHatch.name = 'driverHatch';
  // rear plate details: infantry phone box, tow cable (coiled), towing pintle, jerry can racks
  parts.push(P(box(0.28, 0.3, 0.12, 0.95, 1.35, 3.53)));
  hull.add(new THREE.Mesh(box(0.12, 0.12, 0.2, 0, 0.9, 3.56), steelP));
  for (let k = 0; k < 5; k++) hull.add(new THREE.Mesh(new THREE.TorusGeometry(0.22 - k * 0.012, 0.018, 4, 14).rotateY(Math.PI / 2).translate(0, 1.42, 3.52 + 0.0), steel));
  for (const s of [-1, 1]) hull.add(new THREE.Mesh(box(0.17, 0.46, 0.33, s * 0.42, 1.38, 3.66), LM(0x3e4a2e, {}, 'flat')));   // jerry cans
  // spare track blocks on the glacis (a common field fit)
  for (let k = 0; k < 3; k++) { const sb = new THREE.Mesh(box(0.7, 0.05, 0.16, 0, 0, 0), trackSteel); sb.position.set(0, 1.3 + k * 0.07, -2.9 + k * 0.155); sb.rotation.x = -1.13; hull.add(sb); }
  const hullMesh = new THREE.Mesh(merge(parts), paintM); hullMesh.name = 'hullShell'; hull.add(hullMesh); shell.push(hullMesh);
  // markings: bumper codes front and rear (unit / vehicle), subdued 1980 style
  hull.add(decal(stencil('3-64AR', 256, 64), 0.5, 0.125, V3(-0.55, 0.78, -3.28), Math.PI, 0.96));
  // the US Army registration number on the glacis (subdued black, 1980) and the yellow NATO bridge-classification disc
  // (military load class 60) on the right front light guard
  hull.add(decal(stencil('U.S.ARMY  9A1274', 512, 64, '#1c1c18'), 0.9, 0.11, V3(0, 1.385, -2.77), Math.PI, -1.134));
  { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#d8b21c'; x.beginPath(); x.arc(32, 32, 30, 0, TAU); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#111'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('60', 32, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; hull.add(decal(t, 0.2, 0.2, V3(1.24, 1.32, -3.235), Math.PI, 0)); }
  hull.add(decal(stencil('B-21', 256, 64), 0.42, 0.105, V3(0.6, 0.78, -3.28), Math.PI, 0.96));
  hull.add(decal(stencil('3-64AR  B-21', 512, 64), 0.9, 0.11, V3(0, 1.08, 3.475), 0, 0));
  // ---- running gear (both sides)
  const gearDef = s => ({
    x: s * T.GAUGE / 2, wheels: T.WHEELS.map(z => ({ z, r: T.WHEEL_R })), hubY0: T.WHEEL_R + T.THICK, armLen: 0.48, armUp: 0.14, armFwd: -1,
    rollers: T.RETURN.map(r => ({ z: r.z, y: r.y, r: 0.12 })), idler: T.FRONT, sprocket: T.REAR, frontIsSprocket: false,
    track: { pitch: T.PITCH, width: T.WIDTH, thick: T.THICK * 0.55, pads: true, links: T.SHOES }, shocks: [0, 1, 5], discW: 0.12, discGap: 0.1,
  });
  const mats = { steelP, steel, rubber, trackSteel, bright };
  const gear = [-1, 1].map(s => { const rg = buildRunningGear(gearDef(s), mats, s); hull.add(rg.group); return rg; });
  // ---- turret (frame: ring centre)
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(...TANK.RING); hull.add(turret);
  const toHull = v => v.set(v.x + TANK.RING[0], v.y + TANK.RING[1], v.z + TANK.RING[2]);   // turret frame -> hull (az = 0) for the paint pattern
  const WT = weathered(seed, toHull, dirt * 0.7), PT = geo => paintFaces(geo, WT);
  const TR = [];
  const tring = (z, w, h, b = 0.0, nose = 1) => [z, [[0, h], [w * 0.62, h], [w * 0.9, h * 0.8], [w, h * 0.5], [w * 0.97, (h + b) * 0.28 + b * 0.4], [w * 0.84 * nose, b + 0.02], [0, b]]];
  // the M60A1 / A3 "needle nose" casting (Hunnicutt's drawings): a long wedge in plan narrowing to the gun shield, the
  // roof sloping down to the nose with the chin undercut beneath it, full width (~2.8 m) over the ring, then a long bustle
  // overhanging the engine deck (its floor well above the ring) to a near-vertical rear plate: ~3.95 m of casting
  TR.push(tring(-1.78, 0.46, 0.72, 0.3, 0.9));
  TR.push(tring(-1.55, 0.66, 0.8, 0.2));
  TR.push(tring(-1.2, 0.95, 0.88, 0.08));
  TR.push(tring(-0.75, 1.22, 0.95, 0.0));
  TR.push(tring(-0.25, 1.38, 0.98, 0.0));
  TR.push(tring(0.45, 1.4, 0.98, 0.0));
  TR.push(tring(0.95, 1.36, 0.97, 0.12));
  TR.push(tring(1.3, 1.3, 0.95, 0.3));
  TR.push(tring(1.8, 1.22, 0.92, 0.34));
  TR.push(tring(2.0, 1.12, 0.86, 0.38));
  const tparts = [PT(loftHalfRings(TR))];
  // turret ring skirt, lifting eyes, grab rails
  tparts.push(PT(cylY(1.12, 0.1, 24, 0, -0.03, 0)));
  for (const [x, z] of [[-0.95, -0.9], [0.95, -0.9], [-1.05, 1.55], [1.05, 1.55]]) tparts.push(PT(new THREE.TorusGeometry(0.06, 0.018, 4, 8).rotateY(Math.PI / 2).translate(x, 0.9, z)));
  for (const s of [-1, 1]) tparts.push(P(rodGeo(V3(s * 1.2, 0.72, -0.6), V3(s * 1.24, 0.72, 0.8), 0.03)));
  // loader's hatch (left) with periscope
  tparts.push(PT(cylY(0.36, 0.06, 14, -0.6, 0.94, 0.05)));
  const lHatch = new THREE.Group(); lHatch.position.set(-0.6, 0.98, 0.05); turret.add(lHatch); lHatch.add(new THREE.Mesh(PT(cylY(0.3, 0.05, 14, 0, 0, 0)), paintM)); lHatch.name = 'loaderHatch';
  turret.add(new THREE.Mesh(box(0.18, 0.1, 0.1, -0.6, 1.02, -0.32), glass));
  // TTS armoured housing (right front) with its doors, and the day periscope head beside it
  tparts.push(PT(box(0.56, 0.4, 0.72, 0.62, 1.07, -0.62)));
  tparts.push(PT(box(0.6, 0.05, 0.76, 0.62, 1.29, -0.62)));
  const ttsDoorL = new THREE.Group(), ttsDoorR = new THREE.Group();
  ttsDoorL.position.set(0.36, 1.07, -0.99); ttsDoorR.position.set(0.88, 1.07, -0.99); turret.add(ttsDoorL, ttsDoorR);
  ttsDoorL.add(new THREE.Mesh(PT(box(0.26, 0.34, 0.03, 0.13, 0, -0.015)), paintM)); ttsDoorR.add(new THREE.Mesh(PT(box(0.26, 0.34, 0.03, -0.13, 0, -0.015)), paintM));
  turret.add(new THREE.Mesh(box(0.42, 0.24, 0.02, 0.62, 1.07, -0.98), glass));   // TTS window (germanium: dark)
  tparts.push(PT(box(0.24, 0.24, 0.26, 0.2, 1.02, -0.85)));
  turret.add(new THREE.Mesh(box(0.18, 0.13, 0.02, 0.2, 1.04, -0.985), glass));
  // smoke grenade launchers (M239, 6 tubes each side)
  for (const s of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const tube = new THREE.Mesh(cylZ(0.045, 0.22, 8, 0, 0, 0), steelP); tube.position.set(s * (1.06 + c * 0.09), 0.62 + r * 0.1, -1.0 + c * 0.04); tube.rotation.set(0.35, s * 0.5, 0); turret.add(tube);
  }
  // crosswind sensor mast and antennas on the rear roof
  turret.add(new THREE.Mesh(cylY(0.015, 0.5, 6, 0.2, 1.17, 1.7), steel)); turret.add(new THREE.Mesh(cylY(0.04, 0.08, 8, 0.2, 1.44, 1.7), steel));
  for (const s of [-1, 1]) { turret.add(new THREE.Mesh(cylY(0.05, 0.12, 8, s * 0.98, 0.88, 1.78), steelP)); { const ant = new THREE.Mesh(cylY(0.012, 2.8, 4, 0, 1.4, 0), black); ant.position.set(s * 0.98, 0.93, 1.78); ant.rotation.x = 0.12; turret.add(ant); } }
  // bustle rack with stowage: bedrolls, ammo cans, a tarp
  const rk = [];
  for (const x of [-1.05, 1.05]) rk.push(rodGeo(V3(x, 0.42, 1.95), V3(x, 0.42, 2.6), 0.03), rodGeo(V3(x, 0.42, 2.6), V3(x, 0.92, 2.6), 0.03), rodGeo(V3(x, 0.92, 1.95), V3(x, 0.92, 2.6), 0.025));
  rk.push(rodGeo(V3(-1.05, 0.92, 2.6), V3(1.05, 0.92, 2.6), 0.03), rodGeo(V3(-1.05, 0.42, 2.6), V3(1.05, 0.42, 2.6), 0.03), rodGeo(V3(-1.05, 0.67, 2.6), V3(1.05, 0.67, 2.6), 0.02));
  for (let k = -3; k <= 3; k++) rk.push(rodGeo(V3(k * 0.3, 0.42, 2.6), V3(k * 0.3, 0.92, 2.6), 0.015));
  turret.add(new THREE.Mesh(merge(rk), steelP));
  turret.add(new THREE.Mesh(box(2.1, 0.06, 0.62, 0, 0.4, 2.29), steelP));
  // the crew's kit in the rack: bedrolls, duffel bags, ammo cans, a water can, the folded tarpaulin on top
  const kit = LM(0x3c4630, {}, 'fabric'), duffel = LM(0x55553a, {}, 'fabric');
  for (let k = 0; k < 3; k++) { const br = new THREE.Mesh(cylX(0.13, 0.62, 10, -0.62 + k * 0.6, 0.57, 2.42), canvas); br.rotation.y = (k - 1) * 0.05; turret.add(br); }
  for (const [x, w] of [[-0.75, 0.42], [0.55, 0.5]]) turret.add(new THREE.Mesh(cylZ(0.17, w, 9, x, 0.6, 2.2), duffel));
  for (let k = 0; k < 3; k++) turret.add(new THREE.Mesh(box(0.28, 0.2, 0.15, 0.05 + (k - 1) * 0.3, 0.53, 2.1), kit));
  turret.add(new THREE.Mesh(box(0.17, 0.46, 0.33, 0.85, 0.66, 2.42), LM(0x3e4a2e, {}, 'flat')));   // water can
  turret.add(new THREE.Mesh(box(1.5, 0.16, 0.5, -0.15, 0.82, 2.33).rotateZ(0.03), canvas));
  const turretShell = new THREE.Mesh(merge(tparts), paintM); turretShell.name = 'turretShell'; turret.add(turretShell); shell.push(turretShell);
  // turret markings: vehicle number on both sides, a small subdued star on the bustle
  for (const s of [-1, 1]) turret.add(decal(stencil('B21', 256, 96, '#e2ddc8', 'bold 80px "Courier New", monospace'), 0.55, 0.2, V3(s * 1.33, 0.52, 0.2), s * Math.PI / 2, 0));
  // ---- M19 cupola with the M85 .50
  const cupola = new THREE.Group(); cupola.name = 'cupola'; cupola.position.set(...TANK.COMMANDER_EYE_T.map((v, i) => i === 1 ? 0.92 : v)); turret.add(cupola);
  const cp = [PT(cylY(0.5, 0.3, 16, 0, 0.15, 0)), PT(cylY(0.44, 0.08, 16, 0, 0.34, 0))];
  cupola.add(new THREE.Mesh(merge(cp), paintM));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; const vb = new THREE.Mesh(box(0.14, 0.08, 0.03), glass); vb.position.set(Math.sin(a) * 0.495, 0.17, -Math.cos(a) * 0.495); vb.rotation.y = -a; cupola.add(vb); glassIn.push(vb); }
  const cHatch = new THREE.Group(); cHatch.position.set(0, 0.4, 0.3); cupola.add(cHatch); cHatch.add(new THREE.Mesh(PT(cylY(0.38, 0.06, 14, 0, 0.0, -0.3)), paintM)); cHatch.name = 'cupolaHatch';
  const mg50 = new THREE.Group(); mg50.position.set(-0.17, 0.33, -0.36); cupola.add(mg50);   // left of centre, over the vision blocks (M19)
  mg50.add(new THREE.Mesh(box(0.2, 0.2, 0.18, 0, 0, 0), steelP));
  mg50.add(new THREE.Mesh(PT(box(0.26, 0.22, 0.1, 0, 0.01, -0.12)), paintM));   // the M85's armoured mantlet in the cupola front
  mg50.add(new THREE.Mesh(cylZ(0.022, 0.9, 8, 0, 0.02, -0.5), black)); mg50.add(new THREE.Mesh(cylZ(0.032, 0.2, 8, 0, 0.02, -0.15), black));
  // ---- gun: mantlet / shield (pitches with the gun), tube with thermal shroud and bore evacuator, searchlight
  const gun = new THREE.Group(); gun.name = 'gun';
  const trT = [TANK.TRUNNION[0] - TANK.RING[0], TANK.TRUNNION[1] - TANK.RING[1], TANK.TRUNNION[2] - TANK.RING[2]];
  gun.position.set(...trT); turret.add(gun);
  const gp = [PT(box(0.86, 0.56, 0.42, 0, 0.02, -0.4)), PT(box(0.7, 0.44, 0.12, 0, 0.02, -0.66))];
  gun.add(new THREE.Mesh(merge(gp), paintM));
  // the canvas dust cover laced over the gun shield (the M60A1 / A3 look): a slightly larger, sagging shell
  { const cv = new THREE.BoxGeometry(0.98, 0.64, 0.5, 2, 2, 1).translate(0, 0.0, -0.45); const p = cv.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0) p.setZ(i, p.getZ(i) + 0.05); p.setX(i, p.getX(i) * (1 - 0.06 * Math.abs(p.getY(i)))); } cv.computeVertexNormals(); gun.add(new THREE.Mesh(cv, canvas)); }
  gun.add(new THREE.Mesh(cylZ(0.2, 0.22, 12, 0, 0, -0.78), canvas));   // canvas mantlet boot over the gun port
  const recoil = new THREE.Group(); gun.add(recoil);
  const L = TANK.MUZZLE_FWD;
  const tube = [cylZ(0.105, 1.1, 14, 0, 0, -1.3, 0.12), cylZ(0.085, L - 0.85, 14, 0, 0, -0.85 - (L - 0.85) / 2, 0.095)];
  for (let k = 0; k < 6; k++) tube.push(cylZ(0.1, 0.05, 14, 0, 0, -1.9 - k * 0.42));   // thermal shroud bands
  tube.push(cylZ(0.13, 0.62, 14, 0, 0, -L + 1.75, 0.13), cylZ(0.105, 0.1, 14, 0, 0, -L + 1.4, 0.13), cylZ(0.105, 0.1, 14, 0, 0, -L + 2.1, 0.13));   // bore evacuator
  recoil.add(new THREE.Mesh(paintFaces(merge(tube), (c, n) => { camoColor(c.x, c.y + 3, c.z, seed, _c); return _c.lerp(DUST, 0.15); }), paintM));
  recoil.add(new THREE.Mesh(cylZ(0.06, 0.03, 12, 0, 0, -L - 0.01), black));   // muzzle bore
  // the AN/VSS-1 xenon searchlight: a big box (~0.8 m) on brackets over the shield, elevating with the gun
  const searchlight = new THREE.Group(); searchlight.position.set(0, 0.62, -0.5); gun.add(searchlight);
  searchlight.add(new THREE.Mesh(PT(box(0.82, 0.7, 0.5, 0, 0, 0.02)), paintM));
  searchlight.add(new THREE.Mesh(PT(cylZ(0.36, 0.06, 18, 0, 0, -0.25)), paintM));
  for (const s of [-1, 1]) searchlight.add(new THREE.Mesh(box(0.06, 0.24, 0.3, s * 0.3, -0.42, 0.05), steelP));
  searchlight.add(new THREE.Mesh(box(0.12, 0.12, 0.12, 0.33, 0.33, 0.1), black));
  const lens = new THREE.Mesh(cylZ(0.3, 0.03, 20, 0, 0, -0.28), MAT.lamp()); searchlight.add(lens);
  const slDoor = new THREE.Mesh(PT(box(0.74, 0.64, 0.03, 0, 0, -0.29)), paintM); searchlight.add(slDoor);   // closed armoured shutter
  // the coax port and the gunner's day periscope port on the shield
  gun.add(new THREE.Mesh(cylZ(0.03, 0.12, 8, 0.32, -0.05, -0.68), black));
  // ---- collect
  const api = { group: root, hull, turret, gun, recoil, cupola, mg50, gear, shell, glassIn, setInside: v => { for (const m of glassIn) m.visible = !v; }, hatches: { driver: dHatch, loader: lHatch, cupola: cHatch }, tts: [ttsDoorL, ttsDoorR], searchlight: { group: searchlight, lens, door: slDoor }, materials: { paintM, steel, steelP, trackSteel, rubber } };
  // state: { travel: [[6],[6]], trackPos: [L, R], az, el, recoil (m), cupAz, mgEl, hatches: { driver, loader, cupola } 0..1,
  //          tts: 0..1 doors open, light: 0..1, inside: hide the shell (interior views) }
  api.animate = (s = {}) => {
    for (let i = 0; i < 2; i++) { gear[i].update(s.travel ? s.travel[i] : null, s.trackPos ? s.trackPos[i] : 0); gear[i].setTrack(!(s.thrown && s.thrown[i])); }
    turret.rotation.y = s.az || 0; gun.rotation.x = s.el || 0; recoil.position.z = s.recoil || 0;
    cupola.rotation.y = s.cupAz || 0; mg50.rotation.x = s.mgEl || 0;
    const h = s.hatches || {};
    dHatch.position.x = (h.driver || 0) * 0.5; dHatch.position.y = 0.11 + (h.driver || 0) * 0.04;   // the M60 driver's hatch lifts and swings aside
    lHatch.rotation.z = -(h.loader || 0) * 1.9; cHatch.rotation.x = (h.cupola || 0) * 1.7;
    ttsDoorL.rotation.y = -(s.tts ?? 1) * 1.6; ttsDoorR.rotation.y = (s.tts ?? 1) * 1.6;
    slDoor.visible = !(s.light > 0); lens.material.emissive.setScalar(s.light > 0 ? 1 : 0);
    for (const m of glassIn) m.visible = !s.inside;
  };
  api.animate({});
  return api;
}
