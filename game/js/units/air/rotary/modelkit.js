// modelkit.js - geometry helpers for the rotary models (CH-46, MV-22, RW-3), the same house style as hueymodel.js /
// jetmodel.js: lofted skins through rounded-rectangle rings, thin plates from outlines, rods and tubes, static parts
// merged per material, canvas decals. Flat-shaded Phong / Lambert, colours from materials, no image textures.
import * as THREE from 'three';

export const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 14, ...o });
export const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AV = a => (a.isVector3 ? a : V(...a));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), smooth = THREE.MathUtils.smoothstep;

export function geom(pos, groups) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (groups) for (const [s, n, m] of groups) g.addGroup(s, n, m);
  g.computeVertexNormals(); return g;
}
export function soup(pos) {   // triangle soup -> geometry, flipped if inside-out (negative signed volume)
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
  return geom(pos);
}
// thin plate from a 2D outline [[a, b, thick, below = 0.5]...]; map(a, b, w) -> [x, y, z]
export function slab(poly, map) {
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
// skin through rings (open polylines of equal length, rings running nose to tail); matFn(r, k) -> material index or -1
export function loft(rings, matFn = () => 0, capA = -1, capB = -1) {
  const buckets = [], put = (m, ...pts) => (buckets[m] ||= []).push(...pts.flat());
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length - 1; k++) {
    const m = matFn(r, k); if (m < 0) continue;
    const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k + 1], d = rings[r + 1][k];
    put(m, a, c, b); put(m, a, d, c);
  }
  const fan = (R, m, front) => {
    const c = R.reduce((s, p) => [s[0] + p[0] / R.length, s[1] + p[1] / R.length, s[2] + p[2] / R.length], [0, 0, 0]);
    for (let k = 0; k < R.length - 1; k++) front ? put(m, R[k], R[k + 1], c) : put(m, R[k], c, R[k + 1]);
  };
  if (capA >= 0) fan(rings[0], capA, true);
  if (capB >= 0) fan(rings[rings.length - 1], capB, false);
  const pos = [], groups = [];
  buckets.forEach((b, m) => { if (b) { groups.push([pos.length / 3, b.length / 3, m]); pos.push(...b); } });
  return geom(pos, groups);
}
export function merge(geos) {
  const pos = [], nor = [];
  for (let g of geos) { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
export const cylZ = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).rotateX(Math.PI / 2);   // r0 at -z, r1 at +z
export const cylX = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
export const cylY = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);   // r0 bottom, r1 top
export const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const sphG = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 8, hs = 5) => new THREE.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z);
export const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m; };
export const group = (parent, name, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent && parent.add(o); return o; };
const _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), ONE = V(1, 1, 1), ZAX = V(0, 0, 1);
export function rodG(a, b, w, seg = 0) {   // a box (seg 0) or cylinder of width w between two points
  a = AV(a); b = AV(b); const d = V().subVectors(b, a), L = d.length();
  const g = seg ? new THREE.CylinderGeometry(w / 2, w / 2, L, seg).rotateX(Math.PI / 2) : new THREE.BoxGeometry(w, w, L);
  return g.applyMatrix4(_m4.compose(V().addVectors(a, b).multiplyScalar(0.5), _q0.setFromUnitVectors(ZAX, d.normalize()), ONE));
}
export const tubeG = (pts, r, seg = 16, rad = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(AV)), seg, r, rad);
export function bucket() {   // static parts collect here per material and become one mesh each
  const m = new Map();
  return { add(geo, mat) { (m.get(mat) || m.set(mat, []).get(mat)).push(geo); return geo; },
    flush(parent, name) { const out = []; for (const [mat, geos] of m) out.push(mesh(merge(geos), mat, parent, name)); m.clear(); return out; } };
}
// rounded-rectangle half profile at station z, top centre -> keel: 14 points; lv = three side heights (window lines).
// Quads (qh): 0 roof, 1-4 upper arc, 5-8 side, 9-11 lower arc, 12 belly.
export function rr(z, top, bot, w, rt, rb, lv) {
  rb = Math.min(rb, w, (top - bot) / 2); rt = Math.min(rt, w, top - bot - rb);
  const p = [[0, top], [w - rt, top]], yT = top - rt, yB = bot + rb;
  for (const a of [0.3927, 0.7854, 1.1781]) p.push([w - rt + rt * Math.sin(a), yT + rt * Math.cos(a)]);
  p.push([w, yT]);
  for (const y of lv) p.push([w, clamp(y, yB, yT)]);
  p.push([w, yB]);
  for (const a of [1.0472, 0.5236]) p.push([w - rb + rb * Math.sin(a), yB - rb * Math.cos(a)]);
  p.push([w - rb, bot], [0, bot]);
  return p.map(([x, y]) => [x, y, z]);
}
export const full = h => [...h, ...h.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];   // 27 points
export const QH = k => (k < 13 ? k : 25 - k);
export const shift = (ring, dx = 0, dy = 0, dz = 0) => ring.map(([x, y, z]) => [x + dx, y + dy, z + dz]);
// a flat ring (r0..r1) as a shallow cone whose vertex height = radius (scale.y = coning angle): rotor blur discs
export function ringGeo(r0, r1, n = 48) {
  const pos = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, P = (r, a) => [r * Math.cos(a), r, r * Math.sin(a)];
    pos.push(...P(r0, a0), ...P(r1, a1), ...P(r1, a0), ...P(r0, a0), ...P(r0, a1), ...P(r1, a1));
  }
  return geom(pos);
}
// canvas decal: draw(ctx, w, h) once, cached by key; returns a transparent-material plane w x h metres
const texCache = new Map();
export function decal(key, pw, ph, draw, w, h) {
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas'); c.width = pw; c.height = ph; const x = c.getContext('2d'); draw(x, pw, ph);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t);
  }
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.FrontSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}
export const canDecal = typeof document !== 'undefined';
// put a decal on a side: s = +1 right (faces +x), -1 left
export function sideDecal(parent, d, s, x, y, z, yaw = 0) { d.position.set(x, y, z); d.rotation.y = s * Math.PI / 2 + yaw; parent.add(d); return d; }
// 1980 US national insignia (star and bars, full colour) and stencil text
export function drawInsignia(x, w, h) {
  const cx = w / 2, cy = h / 2, R = h * 0.42;
  x.fillStyle = '#1d2a55'; x.fillRect(cx - R * 2.05, cy - R * 0.52, R * 4.1, R * 1.04);   // blue outline of the bars
  x.fillStyle = '#f2f2ea'; x.fillRect(cx - R * 1.95, cy - R * 0.42, R * 3.9, R * 0.84);
  x.fillStyle = '#a8202a'; x.fillRect(cx - R * 1.95, cy - R * 0.12, R * 3.9, R * 0.24);
  x.fillStyle = '#1d2a55'; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  x.fillStyle = '#f2f2ea'; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.38 : R * 0.95; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  x.fill();
}
export function drawText(txt, color, font = 'bold 40px sans-serif', stroke = null) {
  return (x, w, h) => { x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; if (stroke) { x.lineWidth = 4; x.strokeStyle = stroke; x.strokeText(txt, w / 2, h / 2 + 2); } x.fillStyle = color; x.fillText(txt, w / 2, h / 2 + 2); };
}
