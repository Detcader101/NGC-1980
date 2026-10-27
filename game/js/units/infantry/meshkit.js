// NGC-1980 infantry: a tiny geometry kit for the house style (flat-shaded Lambert, colours in the geometry, no textures).
// A Kit collects primitives (box, cylinder, cone, sphere, extruded profile, tube between points) as non-indexed
// triangles with per-vertex colours, each placed by a transform, into ONE BufferGeometry: one mesh (one draw call) per
// rigid part. Colours can be a constant or a function of the (local, pre-transform or world) position: that is how the
// ERDL / woodland camouflage and the helmet cover are painted, per triangle, without textures.
import * as THREE from 'three';
import { pbr } from '../../renderkit/gamemats.js';   // RENDERKIT surface
import { RK } from '../../renderkit/adopt.js';         // RENDERKIT figures

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cc = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ colour helpers
// value noise (hash lattice, trilinear, smooth) for camouflage blotches
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) r += hash(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
  return r;
}
const fbm = (x, y, z) => 0.65 * noise3(x, y, z) + 0.35 * noise3(x * 2.1 + 7, y * 2.1 + 3, z * 2.1 + 11);
// camouflage colour functions: (x, y, z) -> hex. scale = blotch size in m.
export const CAMO = {
  // ERDL "lowland" leaf pattern (1967-1981): light green, olive green, brown and black leaf shapes
  erdl: (s = 0.11, seed = 0) => (x, y, z) => {
    const n = fbm(x / s + seed, y / s * 0.8, z / s), m = fbm(x / s * 1.3 + 40 + seed, y / s * 1.1 + 9, z / s * 1.3 + 3);
    if (m > 0.66) return 0x1d1f17;            // black
    if (n > 0.6) return 0x5a4a30;             // brown
    if (n < 0.38) return 0x7d8a52;            // light green
    return 0x4c5a35;                          // olive / dark green
  },
  // OG-107 sateen utilities: plain olive green with a slight fade / stain
  og107: () => (x, y, z) => { const n = fbm(x * 4, y * 4, z * 4); return n > 0.7 ? 0x4a4c34 : n < 0.3 ? 0x5b5e40 : 0x53563a; },
  // the 1960s-80s Mitchell helmet cover, green leaf side
  mitchell: (s = 0.05) => (x, y, z) => { const n = fbm(x / s, y / s, z / s), m = fbm(x / s * 1.7 + 5, y / s * 1.7, z / s * 1.7 + 2); return m > 0.68 ? 0x2c321f : n > 0.58 ? 0x6e7a40 : n < 0.36 ? 0x3d4a2a : 0x56643a; },
  // olive drab nylon with wear (ALICE gear, flak vest): slight mottling
  od: (base = 0x575a3b) => (x, y, z) => { const n = fbm(x * 9, y * 9, z * 9); _c.setHex(base).multiplyScalar(0.9 + 0.2 * n); return _c.getHex(); },
  // anything with a little variation (wood, dirt, skin)
  vary: (base, amt = 0.12, s = 0.05) => (x, y, z) => { const n = fbm(x / s, y / s, z / s); _c.setHex(base).multiplyScalar(1 - amt + 2 * amt * n); return _c.getHex(); },
};

// ------------------------------------------------------------------------------------------------ the kit
// RENDERKIT figures (ngc/depth-figures): with RK.on('figures') a Kit keeps each primitive's OWN normals (transformed),
// so curved parts (cylinders, spheres, capsules, lathes, rounded boxes) shade smooth while boxes and extruded profiles
// stay crisp, and the kit materials are smooth-shaded physical skin / fabric / parkerized steel / black plastic. With
// ?rk=0 (FIG false) nothing changes: face normals, flat-shaded Lambert, the classic geometry.
export const FIG = RK.on('figures');
const _nm = new THREE.Matrix3(), _n0 = new THREE.Vector3(), _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3();
export class Kit {
  constructor(o = {}) { this.pos = []; this.col = []; this.smooth = o.smooth ?? FIG; this.nor = this.smooth ? [] : null; }
  // add a THREE geometry: transform (pos [x,y,z], rot [rx,ry,rz] Euler XYZ or quaternion, scale), colour hex or fn(x,y,z)
  // `paint` = 'world' (default) evaluates colour fns at the transformed centroid, 'local' before the transform,
  // 'vertex' per vertex (soft gradients: skin, shading on a face)
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = null, paint = 'world') {
    if (this.smooth && !geo.attributes.normal) geo.computeVertexNormals();
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (Array.isArray(rot)) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ')); else _q.copy(rot);
    if (scale) _s.set(scale[0], scale[1], scale[2]); else _s.set(1, 1, 1);
    _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s);
    const p = g.attributes.position, n = p.count, fn = typeof color === 'function' ? color : null, N = this.nor ? g.attributes.normal : null;
    if (N) _nm.getNormalMatrix(_m);
    if (!fn) _c.setHex(color);
    for (let i = 0; i < n; i += 3) {
      _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _cc.fromBufferAttribute(p, i + 2);
      let cx = 0, cy = 0, cz = 0;
      if (fn && paint === 'local') { cx = (_a.x + _b.x + _cc.x) / 3; cy = (_a.y + _b.y + _cc.y) / 3; cz = (_a.z + _b.z + _cc.z) / 3; }
      _a.applyMatrix4(_m); _b.applyMatrix4(_m); _cc.applyMatrix4(_m);
      if (fn && paint !== 'local') { cx = (_a.x + _b.x + _cc.x) / 3; cy = (_a.y + _b.y + _cc.y) / 3; cz = (_a.z + _b.z + _cc.z) / 3; }
      this.pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _cc.x, _cc.y, _cc.z);
      if (N) {
        _n0.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); _n1.fromBufferAttribute(N, i + 1).applyMatrix3(_nm).normalize(); _n2.fromBufferAttribute(N, i + 2).applyMatrix3(_nm).normalize();
        this.nor.push(_n0.x, _n0.y, _n0.z, _n1.x, _n1.y, _n1.z, _n2.x, _n2.y, _n2.z);
      }
      if (fn && paint === 'vertex') { for (const v of [_a, _b, _cc]) { _c.setHex(fn(v.x, v.y, v.z)); this.col.push(_c.r, _c.g, _c.b); } continue; }
      if (fn) _c.setHex(fn(cx, cy, cz));
      for (let k = 0; k < 3; k++) this.col.push(_c.r, _c.g, _c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }
  box(w, h, d, color, pos, rot, seg = 1, paint) { return this.add(new THREE.BoxGeometry(w, h, d, seg, seg, seg), color, pos, rot, null, paint); }
  // cylinder along Y by default (r top, r bottom); axis 'x' | 'y' | 'z'
  cyl(rTop, rBot, len, color, pos, axis = 'y', seg = 8, rot = null, open = false, paint) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(-Math.PI / 2);
    return this.add(g, color, pos, rot || [0, 0, 0], null, paint);
  }
  sphere(r, color, pos, seg = 8, scale = null, rot = [0, 0, 0], paint, phi = [0, Math.PI * 2], theta = [0, Math.PI]) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg * 0.6 | 0), phi[0], phi[1], theta[0], theta[1]), color, pos, rot, scale, paint);
  }
  // prism from a 2D profile in the (a, b) plane, extruded `depth` along the third axis. plane 'zy' = side profile of a
  // gun (z forward/back, y up) extruded across x; 'xy' = front profile extruded along z; 'xz' = plan extruded up y.
  // bevel > 0 (RENDERKIT figures): the outline is inset by the bevel so the part keeps its size, the bevels shade round
  prism(profile, depth, color, pos = [0, 0, 0], plane = 'zy', rot = [0, 0, 0], bevel = 0, paint) {
    const sh = new THREE.Shape(profile.map(p => new THREE.Vector2(p[0], p[1])));
    const bv = bevel > 0 && this.smooth, core = bv ? Math.max(0.0005, depth - 2 * bevel) : depth;
    const g = new THREE.ExtrudeGeometry(sh, bv ? { depth: core, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 4 }
      : { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -core / 2);
    // shape is in XY, extruded along Z. Map to the plane.
    if (plane === 'zy') g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));   // (a,b,c) -> (c, b, a)
    else if (plane === 'xz') g.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));   // (a,b,c) -> (a, c, b)
    if (bv) creaseNormals(g, 0.5);
    return this.add(g, color, pos, rot, null, paint);
  }
  // a tube / bar between two points (square or round section)
  rod(a, b, r, color, round = true, seg = 6, paint) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length();
    const g = round ? new THREE.CylinderGeometry(r, r, L, seg, 1) : new THREE.BoxGeometry(r * 2, L, r * 2);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const mid = A.add(Bv).multiplyScalar(0.5);
    return this.add(g, color, [mid.x, mid.y, mid.z], q, null, paint);
  }
  lathe(points, color, pos, axis = 'y', seg = 10, paint) {
    const g = new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), seg);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (this.smooth) weldNormals(g);
    return this.add(g, color, pos, [0, 0, 0], null, paint);
  }
  // ---- RENDERKIT figures: rounded primitives with smooth normals (called on the FIG paths)
  // a box with rounded edges and corners (radius r): w, h, d, centre pos, rot; c = segments per rounded edge
  rbox(w, h, d, r, color, pos, rot = [0, 0, 0], c = 2, paint, flat = 1) { return this.add(roundedBox(w, h, d, r, c, flat), color, pos, rot, null, paint); }
  // a thin slab whose plan is a rounded rectangle (w x d, corner radius r, h thick): a band round a rounded trunk
  rslab(w, d, h, r, color, pos, rot = [0, 0, 0], paint) { return this.prism(roundPoly([[-w / 2, -d / 2, r], [w / 2, -d / 2, r], [w / 2, d / 2, r], [-w / 2, d / 2, r]], 4), h, color, pos, "xz", rot, 0, paint); }
  // a tapered capsule from point a (radius ra) to point b (radius rb): limbs, fingers. seg = radial segments.
  // squash [sx, sz] flattens the section (a finger is wider than it is deep; a forearm is oval)
  capsule(a, b, ra, rb, color, seg = 8, paint, squash = null, rings = 3, body = 1) { const { geo, q, mid } = capsuleGeo(a, b, ra, rb, seg, rings, squash, body); return this.add(geo, color, mid, q, null, paint); }
  // an ellipsoid (radii rx, ry, rz)
  ellip(rx, ry, rz, color, pos, rot = [0, 0, 0], seg = 12, paint) { const g = new THREE.SphereGeometry(1, seg, Math.max(5, seg * 0.66 | 0)); weldNormals(g); return this.add(g, color, pos, rot, [rx, ry, rz], paint); }
  get empty() { return this.pos.length === 0; }
  get tris() { return this.pos.length / 9; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat, name) { const m = new THREE.Mesh(this.geometry(), mat || KITMAT.lambert()); if (name) m.name = name; return m; }
}
// ---- geometry helpers (RENDERKIT figures)
// rounded polygon: corners [x, y, radius] -> outline points (for prisms / extrusions)
export function roundPoly(corners, seg = 4) {
  const out = [], n = corners.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = corners[(i + n - 1) % n], [cx, cy, r] = corners[i], [nx, ny] = corners[(i + 1) % n];
    const ax = px - cx, ay = py - cy, bx = nx - cx, by = ny - cy, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (!r) { out.push([cx, cy]); continue; }
    const ua = [ax / la, ay / la], ub = [bx / lb, by / lb], half = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1]))) / 2, t = r / Math.tan(half);
    const p0 = [cx + ua[0] * t, cy + ua[1] * t], p1 = [cx + ub[0] * t, cy + ub[1] * t];
    for (let s = 0; s <= seg; s++) { const f = s / seg, q = [(1 - f) * (1 - f), 2 * f * (1 - f), f * f]; out.push([q[0] * p0[0] + q[1] * cx + q[2] * p1[0], q[0] * p0[1] + q[1] * cy + q[2] * p1[1]]); }
  }
  return out;
}
const pkey = (p, i) => `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`;
// average the normals of coincident vertices (lathe / sphere seams, pole fans) so a smooth surface has no crease
export function weldNormals(g) {
  const p = g.attributes.position; if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) { const k = pkey(p, i), e = map.get(k); if (e) { e[0] += n.getX(i); e[1] += n.getY(i); e[2] += n.getZ(i); e.push(i); } else map.set(k, [n.getX(i), n.getY(i), n.getZ(i), i]); }
  for (const e of map.values()) { const l = Math.hypot(e[0], e[1], e[2]) || 1; for (let j = 3; j < e.length; j++) n.setXYZ(e[j], e[0] / l, e[1] / l, e[2] / l); }
  n.needsUpdate = true; return g;
}
// smooth normals across edges flatter than `cos` (dot of the face normals), crisp across sharper ones. In place on a
// non-indexed geometry (ExtrudeGeometry is one)
export function creaseNormals(g, cos = 0.5) {
  if (g.index) return g;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, map = new Map(), fn = new Float32Array(n.array);
  for (let i = 0; i < p.count; i++) { const k = pkey(p, i); let l = map.get(k); if (!l) map.set(k, l = []); l.push(i); }
  for (const list of map.values()) for (const i of list) {
    let x = 0, y = 0, z = 0;
    for (const j of list) { const d = fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2]; if (d >= cos) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; } }
    const l = Math.hypot(x, y, z) || 1; n.setXYZ(i, x / l, y / l, z / l);
  }
  n.needsUpdate = true; return g;
}
// rounded box: a box grid with c segments in each rounded band, every vertex pushed onto the box-plus-sphere surface;
// the normal is the analytic one (smooth round the edges, exactly flat on the faces)
export function roundedBox(w, h, d, r, c = 2, flat = 1) {
  const hx = w / 2, hy = h / 2, hz = d / 2; r = Math.min(r, hx, hy, hz) * 0.999;
  const n = 2 * c + flat, g = new THREE.BoxGeometry(2, 2, 2, n, n, n), p = g.attributes.position, nr = g.attributes.normal;
  const ex = hx - r, ey = hy - r, ez = hz - r;
  // grid coordinate (-1..1, n segments) -> (-h..h) with the first / last c segments in the rounded band
  const remap = (u, half, e) => { const k = Math.round((u + 1) / 2 * n); if (k <= c) return -half + r * (k / c); if (k >= n - c) return e + r * ((k - (n - c)) / c); return -e + 2 * e * ((k - c) / (n - 2 * c)); };
  for (let i = 0; i < p.count; i++) {
    const x = remap(p.getX(i), hx, ex), y = remap(p.getY(i), hy, ey), z = remap(p.getZ(i), hz, ez);
    const ix = Math.max(-ex, Math.min(ex, x)), iy = Math.max(-ey, Math.min(ey, y)), iz = Math.max(-ez, Math.min(ez, z));
    let dx = x - ix, dy = y - iy, dz = z - iz; const l = Math.hypot(dx, dy, dz);
    if (l < 1e-9) { dx = nr.getX(i); dy = nr.getY(i); dz = nr.getZ(i); } else { dx /= l; dy /= l; dz /= l; }
    p.setXYZ(i, ix + dx * r, iy + dy * r, iz + dz * r); nr.setXYZ(i, dx, dy, dz);
  }
  return g;
}
// tapered capsule (a lathe: a hemisphere, the cone tangent to both, a hemisphere), centred, oriented a -> b
const _Y = new THREE.Vector3(0, 1, 0);
// body: segments along the cone (long camouflaged limbs need rings, or per-triangle camo runs in stripes)
export function capsuleGeo(a, b, ra, rb, seg = 8, rings = 3, squash = null, body = 1) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = Math.max(1e-4, d.length());
  const pts = [], s = Math.max(-0.95, Math.min(0.95, (ra - rb) / L)), ph = Math.asin(s);   // tilt of the tangent line
  for (let i = 0; i <= rings; i++) { const t = -Math.PI / 2 + (Math.PI / 2 + ph) * (i / rings); pts.push(new THREE.Vector2(Math.max(1e-5, ra * Math.cos(t)), -L / 2 + ra * Math.sin(t))); }
  const p0 = pts[pts.length - 1].clone(), p1 = new THREE.Vector2(rb * Math.cos(ph), L / 2 + rb * Math.sin(ph));
  for (let i = 1; i < body; i++) pts.push(p0.clone().lerp(p1, i / body));
  for (let i = 0; i <= rings; i++) { const t = ph + (Math.PI / 2 - ph) * (i / rings); pts.push(new THREE.Vector2(Math.max(1e-5, rb * Math.cos(t)), L / 2 + rb * Math.sin(t))); }
  const geo = new THREE.LatheGeometry(pts, seg);
  if (squash) { geo.scale(squash[0], 1, squash[1]); geo.computeVertexNormals(); }
  weldNormals(geo);
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
  return { geo, q, mid: [(A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2], L };
}
// shared materials (vertex coloured, flat shaded; RENDERKIT figures: smooth-shaded physical roles)
// roles for people and small arms, tuned for the hemisphere + sun rig with no env map (metals stay low)
export const FIGROLE = Object.freeze({
  fabric: { roughness: 0.93, metalness: 0 },      // utilities, webbing, nylon
  skin: { roughness: 0.58, metalness: 0 },        // a soft sheen on knuckles and cheekbones
  steel: { roughness: 0.5, metalness: 0.22 },     // parkerized / blued steel, anodized aluminium receiver
  plastic: { roughness: 0.44, metalness: 0 },     // the M16's black furniture: a dull sheen
  rubber: { roughness: 0.9, metalness: 0 },
});
export const figMat = (role, o = {}) => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...FIGROLE[role], ...o }); m.name = 'RKfig/' + role; return m; };
export const KITMAT = {
  _l: null, _s: null, _k: null, _p: null,
  // RENDERKIT surface: cloth / webbing / skin read as dielectric fabric; weapon steel as parkerized metal (?rk=0: Lambert)
  lambert() { return this._l || (this._l = FIG ? figMat('fabric') : pbr(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), undefined, { vertexColors: true, flatShading: true, rk: 'fabric' })); },
  // a little sheen for blued / parkerized steel (still Lambert: flat, but a touch emissive so black parts read)
  steel() { return this._s || (this._s = FIG ? figMat('steel', { emissive: 0x040405 }) : pbr(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x050506 }), undefined, { vertexColors: true, flatShading: true, emissive: 0x050506, rk: { role: 'metal' } })); },
  // RENDERKIT figures (FIG; otherwise the classic ones): bare skin, black plastic furniture
  skin() { return this._k || (this._k = FIG ? figMat('skin') : this.lambert()); },
  plastic() { return this._p || (this._p = FIG ? figMat('plastic', { emissive: 0x030303 }) : this.steel()); },
};
// colour constants used across the infantry models
export const COL = {
  park: 0x45484c, parkDark: 0x2c2e31, parkWorn: 0x5a5c60, black: 0x161718, alu: 0x4a4d51, furniture: 0x303235,
  od: 0x575a3b, odDark: 0x43452d, odLight: 0x6b6e4a, brass: 0xb08d3c, copper: 0x9a5a33, steelBright: 0x6c6f74,
  skin: 0xc79a77, skinDark: 0x8a5d40, leather: 0x1c1712, rubber: 0x141414, webbing: 0x5a5c3c, canvas: 0x5f6143,
  yellow: 0xc9a227, red: 0x8a1c14, wood: 0x6b4a2c,
};
