// NGC-1980 infantry: a tiny geometry kit for the house style (flat-shaded Lambert, colours in the geometry, no textures).
// A Kit collects primitives (box, cylinder, cone, sphere, extruded profile, tube between points) as non-indexed
// triangles with per-vertex colours, each placed by a transform, into ONE BufferGeometry: one mesh (one draw call) per
// rigid part. Colours can be a constant or a function of the (local, pre-transform or world) position: that is how the
// ERDL / woodland camouflage and the helmet cover are painted, per triangle, without textures.
import * as THREE from 'three';

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
export class Kit {
  constructor() { this.pos = []; this.col = []; }
  // add a THREE geometry: transform (pos [x,y,z], rot [rx,ry,rz] Euler XYZ or quaternion, scale), colour hex or fn(x,y,z)
  // `paint` = 'world' (default) evaluates colour fns at the transformed centroid, 'local' before the transform
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = null, paint = 'world') {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (Array.isArray(rot)) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ')); else _q.copy(rot);
    if (scale) _s.set(scale[0], scale[1], scale[2]); else _s.set(1, 1, 1);
    _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s);
    const p = g.attributes.position, n = p.count, fn = typeof color === 'function' ? color : null;
    if (!fn) _c.setHex(color);
    for (let i = 0; i < n; i += 3) {
      _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _cc.fromBufferAttribute(p, i + 2);
      let cx = 0, cy = 0, cz = 0;
      if (fn && paint === 'local') { cx = (_a.x + _b.x + _cc.x) / 3; cy = (_a.y + _b.y + _cc.y) / 3; cz = (_a.z + _b.z + _cc.z) / 3; }
      _a.applyMatrix4(_m); _b.applyMatrix4(_m); _cc.applyMatrix4(_m);
      if (fn && paint !== 'local') { cx = (_a.x + _b.x + _cc.x) / 3; cy = (_a.y + _b.y + _cc.y) / 3; cz = (_a.z + _b.z + _cc.z) / 3; }
      if (fn) _c.setHex(fn(cx, cy, cz));
      this.pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _cc.x, _cc.y, _cc.z);
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
  prism(profile, depth, color, pos = [0, 0, 0], plane = 'zy', rot = [0, 0, 0], bevel = 0, paint) {
    const sh = new THREE.Shape(profile.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    // shape is in XY, extruded along Z. Map to the plane.
    if (plane === 'zy') g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));   // (a,b,c) -> (c, b, a)
    else if (plane === 'xz') g.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));   // (a,b,c) -> (a, c, b)
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
    return this.add(g, color, pos, [0, 0, 0], null, paint);
  }
  get empty() { return this.pos.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
  mesh(mat, name) { const m = new THREE.Mesh(this.geometry(), mat || KITMAT.lambert()); if (name) m.name = name; return m; }
}
// shared materials (vertex coloured, flat shaded)
export const KITMAT = {
  _l: null, _s: null,
  lambert() { return this._l || (this._l = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); },
  // a little sheen for blued / parkerized steel (still Lambert: flat, but a touch emissive so black parts read)
  steel() { return this._s || (this._s = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x050506 })); },
};
// colour constants used across the infantry models
export const COL = {
  park: 0x45484c, parkDark: 0x2c2e31, parkWorn: 0x5a5c60, black: 0x161718, alu: 0x4a4d51, furniture: 0x303235,
  od: 0x575a3b, odDark: 0x43452d, odLight: 0x6b6e4a, brass: 0xb08d3c, copper: 0x9a5a33, steelBright: 0x6c6f74,
  skin: 0xc79a77, skinDark: 0x8a5d40, leather: 0x1c1712, rubber: 0x141414, webbing: 0x5a5c3c, canvas: 0x5f6143,
  yellow: 0xc9a227, red: 0x8a1c14, wood: 0x6b4a2c,
};
