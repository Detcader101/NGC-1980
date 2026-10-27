// Modelling kit for the air defence units: primitives placed in a normal THREE hierarchy, then baked so each moving
// part (hull, turret, cradle, barrel cluster, radar) is ONE mesh with per-face vertex colours. The bake also does the
// weathering: every face gets a little colour jitter, faces low on the vehicle pick up mud, a few faces get chipped
// (lighter) or rust-streaked. Materials that must stay separate (team colour, glow, glass, flashes) are left alone.
import * as THREE from 'three';
import { pbr, DETAIL } from '../../renderkit/gamemats.js';   // RENDERKIT surface

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// one shared material for every baked part: flat-shaded Lambert, colours from the vertices
// RENDERKIT surface: painted armour with dust and chips over the baked weathering (the same Lambert with ?rk=0)
export const BAKED = pbr(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), undefined, { vertexColors: true, flatShading: true, rk: { role: 'armor', detail: { ...DETAIL.armor, dust: 0.2, wear: 0.06 } } });
// a paint: a marker material (never rendered) carrying the colour and how much it weathers
export function paint(hex, wear = 1, { mud = 1, chip = 1 } = {}) {
  const m = new THREE.MeshLambertMaterial({ color: hex }); m.userData = { paint: true, wear, mud, chip }; return m;
}
export const lam = (hex, o = {}) => pbr(() => new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...o }), hex, { flatShading: true, ...o }, 'paint');   // RENDERKIT surface
export const basic = (hex, o = {}) => new THREE.MeshBasicMaterial({ color: hex, ...o });

// ---- primitive helpers: all return the mesh, added to `p`
export function box(p, m, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o;
}
// cylinder along the local axis 'x' | 'y' | 'z'
export function cyl(p, m, rt, rb, len, x = 0, y = 0, z = 0, axis = 'y', seg = 10, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, len, seg, 1, open);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o;
}
// a prism from a side profile [[z, y], ...] (in the y-z plane), extruded `w` wide along x, centred on x0
export function prism(p, m, prof, w, x0 = 0) {
  const sh = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); g.translate(x0 + w / 2, 0, 0);   // rotateY(-90°): shape x -> +z, extrusion 0..w -> 0..-w on x
  const o = new THREE.Mesh(g, m); p.add(o); return o;
}
// a prism from a top/front profile [[x, y], ...] (in the x-y plane), extruded `d` deep along z, centred on z0
export function prismZ(p, m, prof, d, z0 = 0) {
  const sh = new THREE.Shape(prof.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); g.translate(0, 0, z0 - d / 2);
  const o = new THREE.Mesh(g, m); p.add(o); return o;
}
export function sphere(p, m, r, x = 0, y = 0, z = 0, ws = 10, hs = 6, phiLen = Math.PI * 2, thLen = Math.PI) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs, 0, phiLen, 0, thLen), m); o.position.set(x, y, z); p.add(o); return o;
}
export function group(p, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; }
// a five-pointed star plate (national markings) facing +z (rotate the result)
export function star(p, m, r, x, y, z, ry = 0, rx = 0) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.38 : r; sh[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
  const o = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0, 'YXZ'); p.add(o); return o;
}

// ---- bake: merge every paint mesh into its nearest `userData.part` ancestor (or the root)
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _c = new THREE.Color(), _mud = new THREE.Color(0x4f4232), _rust = new THREE.Color(0x6a3a22), _chip = new THREE.Color(0xb8b4a8);
export function bake(root, { seed = 1, ground = 0, mudH = 0.9 } = {}) {
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const parts = new Map(), owners = [];
  root.traverse(o => { if (o === root || o.userData.part) parts.set(o, { pos: [], col: [] }); });
  root.traverse(o => {
    if (!o.isMesh || !o.material.userData?.paint) return;
    let a = o.parent; while (a && !parts.has(a)) a = a.parent;
    if (!a) return; owners.push([o, a]);
  });
  for (const [o, a] of owners) {
    const P = parts.get(a), ud = o.material.userData, base = o.material.color;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    // into the part's frame (for the mesh) and the root's frame (for weathering by height)
    a.updateMatrixWorld(true);
    _m.copy(a.matrixWorld).invert().multiply(o.matrixWorld); const toPart = _m.clone();
    const toRoot = new THREE.Matrix4().copy(_inv).multiply(o.matrixWorld);
    const pp = g.attributes.position, gp = g.clone(); g.applyMatrix4(toPart); gp.applyMatrix4(toRoot);
    const q = g.attributes.position, r = gp.attributes.position;
    for (let i = 0; i < q.count; i += 3) {
      const yc = (r.getY(i) + r.getY(i + 1) + r.getY(i + 2)) / 3 - ground;
      _c.copy(base).multiplyScalar(1 + (rnd() - 0.5) * 0.12 * ud.wear);
      const mud = clamp((mudH - yc) / mudH, 0, 1) * 0.55 * ud.mud * ud.wear; if (mud > 0) _c.lerp(_mud, mud);
      const roll = rnd();
      if (roll < 0.05 * ud.chip * ud.wear) _c.lerp(_chip, 0.18);
      else if (roll > 1 - 0.04 * ud.chip * ud.wear) _c.lerp(_rust, 0.3);
      for (let k = 0; k < 3; k++) { P.pos.push(q.getX(i + k), q.getY(i + k), q.getZ(i + k)); P.col.push(_c.r, _c.g, _c.b); }
    }
    g.dispose(); gp.dispose(); void pp;
    o.parent.remove(o);
  }
  for (const [a, P] of parts) {
    if (!P.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, BAKED); mesh.name = 'baked'; a.add(mesh);
  }
  // empty helper groups left behind are harmless; count the result for the dev page
  let tris = 0, meshes = 0; root.traverse(o => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  root.userData.stats = { tris, meshes };
  return root;
}
