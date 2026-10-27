// Mesh kit for the aircraft models (house style: flat-shaded Phong, no textures except decals, real metres).
// The helpers are the HORNET's (jetmodel.js), shared here so the TOMCAT, SHRIKE, REAPER and SHAHED models build the
// same way without touching jetmodel.js. Local frame everywhere: +x right, +y up, nose along -z.
import * as THREE from 'three';
import { wrapFactory, glass, decal as rkDecal, DETAIL } from '../../renderkit/gamemats.js';   // RENDERKIT surface
export { glass };

// RENDERKIT surface: semi-gloss paint by default (the same Phong with ?rk=0); { rk: role | { role, detail } } per paint
export const M = wrapFactory((c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 22, ...o }), 'paint', DETAIL.air);
export const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);

// triangle soup -> geometry; flips every triangle if the (closed-ish) mesh has negative signed volume, so mirrored
// builds never come out inside-out
export function soup(pos, groups) {
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
// skin through rings of points (each an open polyline, same length); matFn(ring, seg) -> material index; optional end caps
export function loft(rings, matFn = () => 0, capEnd = -1) {
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
export function merge(geos) {
  const pos = [], nor = [];
  for (let g of geos) { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
export const cylZ = (r0, r1, len, seg = 10, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).rotateX(Math.PI / 2);   // r0 at -z, r1 at +z
export const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m; };
// a box spanning two points (struts, braces, bars)
export function rod(a, b, w, mat, parent, name) {
  const d = V().subVectors(b, a), m = mesh(new THREE.BoxGeometry(w, w, d.length()), mat, parent, name);
  m.position.addVectors(a, b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V(0, 0, 1), d.normalize()); return m;
}
// a control surface on a hinge line p0 -> p1: geometry is given in aircraft coordinates, the returned pivot rotates
// about the hinge (rotation.x). With p1 - p0 along +x, positive rotation moves the aft edge DOWN; along +y, aft edge to +x.
export function hinged(parent, geo, mat, p0, p1, name) {
  const o = new THREE.Group(); o.position.copy(p0); o.quaternion.setFromUnitVectors(X, V().subVectors(p1, p0).normalize()); o.updateMatrix();
  geo.applyMatrix4(o.matrix.clone().invert());
  const pv = new THREE.Group(); pv.name = name; o.add(pv); mesh(geo, mat, pv, name + 'Skin'); parent.add(o); return pv;
}

// ------------------------------------------------------------------------------------------- more helpers
// canopy / frame cross-section: an arch of n points at station z (half width hw, sill height base, crown top)
export const arch = (z, top, hw, base, n = 9) => Array.from({ length: n }, (_, i) => {
  const f = -Math.PI / 2 + Math.PI * i / (n - 1), sn = Math.sin(f), cs = Math.cos(f);
  return [hw * Math.sign(sn) * Math.abs(sn) ** 0.7, base + (top - base) * Math.abs(cs) ** 0.6, z];
});
export const tube = (pts, r, mat, parent, name, seg = 12) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V(...p))), seg, r, 4), mat, parent, name);
export function wheel(r, w, parent, x, y, z, tyreM, hubM) {
  const wg = new THREE.Group(); wg.position.set(x, y, z); parent.add(wg);
  mesh(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), tyreM, wg, 'tyre');
  mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8).rotateZ(Math.PI / 2), hubM, wg, 'hub'); return wg;
}
// additive unlit material (exhaust glow, flames, lamps)
export const addM = (c, o = {}) => B(c, { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, ...o });
// a decal: a canvas drawn once, on a plane (w x h metres), polygon-offset so it sits on the skin
const texCache = new Map();
export function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
}
export function decal(tex, w, h, parent, name, double = false) {
  const m = mesh(new THREE.PlaneGeometry(w, h), rkDecal(() => new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: double ? THREE.DoubleSide : THREE.FrontSide }), { map: tex, roughness: 0.6, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: double ? THREE.DoubleSide : THREE.FrontSide }), parent, name);
  if (!tex) m.visible = false; return m;
}
// US national insignia, 1980 style: white star on a blue disc, white bars with a red stripe
export function drawStarBar(x, w, h, lowvis = false) {
  const cx = w / 2, cy = h / 2, R = h * 0.46, blue = lowvis ? '#5a6168' : '#1c2f6e', white = lowvis ? '#9aa1a8' : '#f4f4f0', red = lowvis ? '#7a8086' : '#b0202a';
  x.fillStyle = blue; x.fillRect(cx - R * 2.05, cy - R * 0.42, R * 4.1, R * 0.84);
  x.fillStyle = white; x.fillRect(cx - R * 1.95, cy - R * 0.32, R * 3.9, R * 0.64);
  x.fillStyle = red; x.fillRect(cx - R * 1.95, cy - R * 0.11, R * 3.9, R * 0.22);
  x.fillStyle = blue; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  x.fillStyle = white; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.38 : R * 0.97; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  x.fill();
}
// RUNAWAY refit mark: a cyan IFF strip with machine glyphs stencilled over whatever was there
export function drawRunawayMark(x, w, h, text = 'RW-') {
  x.fillStyle = '#7ff6ff'; x.fillRect(0, h * 0.3, w, h * 0.4);
  x.fillStyle = '#0e1418'; x.font = `bold ${Math.round(h * 0.3)}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(`◇ ${text} ◇`, w / 2, h * 0.52);
}

