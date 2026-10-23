// modelkit.js - shared building blocks for the wheeled-vehicle models (house style: flat-shaded Lambert, colours from
// materials, small details as geometry, no textures except canvas decals). Static parts collect per material and are
// merged into one mesh each; vertex colours carry dust, mud and wear (lighter dust low down and on horizontal surfaces,
// darker grime in the lowest band, a little mottling), so the paint looks used without textures.
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AV = a => (a.isVector3 ? a : V(...a));
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), ONE = V(1, 1, 1), ZAX = V(0, 0, 1);

// ------------------------------------------------------------------------------------------- palette (1980)
// FS 595 colours: 34087 olive drab (US Army 1980, pre-MERDC on most rear-area vehicles), 34094 forest green, 30051 earth
// brown, 37030 black (MERDC); 33446 desert sand
export const PAL = {
  od: 0x4b5233, odDark: 0x3e442b, odLight: 0x5d6440, canvas: 0x5c5b40, canvasDark: 0x4a4934, seat: 0x3f3d2c,
  black: 0x1b1c1a, rubber: 0x1c1c1b, tread: 0x232320, steel: 0x55595a, steelDark: 0x353837, bare: 0x8a8c88, rust: 0x6b4a32,
  glass: 0x9fb8c0, lampW: 0xf2efe0, lampA: 0xe8a020, lampR: 0xb01a10, blackout: 0x2a2620, white: 0xe8e6dc, wood: 0x6e5a3a,
  dash: 0x34372a, gauge: 0x101010, chrome: 0xc8ccd0, tyreWall: 0x262624, interior: 0x2c2a26, vinyl: 0x2a2725,
};
const _mats = new Map();
// Lambert, flat-shaded; vertexColors so the wear tint shows (each merged mesh carries a colour attribute)
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = _mats.get(key); if (m) return m;
  m = new THREE.MeshLambertMaterial({ color, flatShading: true, vertexColors: o.vc !== false, ...Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'vc')) });
  _mats.set(key, m); return m;
}
export const glassMat = (tint = PAL.glass, op = 0.28) => mat(tint, { vc: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
export const lampMat = (c, glow = 0.35) => mat(c, { vc: false, emissive: c, emissiveIntensity: glow });

// ------------------------------------------------------------------------------------------- geometry primitives
export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) g.applyMatrix4(_m4.makeRotationFromEuler(_e.set(rx, ry, rz))); return g.translate(x, y, z);
};
export const cylX = (r, len, x = 0, y = 0, z = 0, seg = 12, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateZ(-Math.PI / 2).translate(x, y, z);   // r at -x, r2 at +x
export const cylY = (r, len, x = 0, y = 0, z = 0, seg = 12, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).translate(x, y, z);
export const cylZ = (r, len, x = 0, y = 0, z = 0, seg = 12, r2 = r) => new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);   // r at -z? (r2 at +z)
export const sphere = (r, x = 0, y = 0, z = 0, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs).translate(x, y, z);
// a bar of width w (square, or round with seg) between two points
export function rod(a, b, w, seg = 0) {
  a = AV(a); b = AV(b); const d = V().subVectors(b, a), L = d.length();
  const g = seg ? new THREE.CylinderGeometry(w / 2, w / 2, L, seg).rotateX(Math.PI / 2) : new THREE.BoxGeometry(w, w, L);
  return g.applyMatrix4(_m4.compose(V().addVectors(a, b).multiplyScalar(0.5), _q.setFromUnitVectors(ZAX, d.normalize()), ONE));
}
// a polyline tube (bows, grab handles, roll bars)
export const tube = (pts, r, seg = 12, rad = 6, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(AV), closed, 'catmullrom', 0.2), seg, r, rad, closed);
// a side profile (2D outline [[z, y], ...] in the YZ plane, counter-clockwise or not) extruded across x from x0 to x1:
// fenders, body sides, bumpers, tailgates
export function extrudeX(profile, x0, x1) {
  const sh = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false, curveSegments: 3 });
  // shape in XY (x = z, y = y), extruded along +z: map (sx, sy, sz) -> (x0 + sz, sy, sx)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i); p.setXYZ(i, x0 + sz, sy, sx); }
  g.computeVertexNormals(); return fixWinding(g);
}
// a top / plan outline [[x, z], ...] extruded up from y0 to y1 (decks, beds, floors, seats)
export function extrudeY(outline, y0, y1) {
  const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 3 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i); p.setXYZ(i, sx, y0 + sz, sy); }
  g.computeVertexNormals(); return fixWinding(g);
}
// a front outline [[x, y], ...] extruded along z from z0 to z1 (grilles, dashboards, cab backs)
export function extrudeZ(outline, z0, z1) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, z0); return fixWinding(g);
}
// mirrored geometry stays outward-facing: flip triangles when the signed volume is negative
function fixWinding(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position.array; let vol = 0;
  for (let i = 0; i < p.length; i += 9) vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  if (vol < 0) for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  g.attributes.position.needsUpdate = true; g.computeVertexNormals(); return g;
}
// skin through rings of points (each ring an open polyline of equal length), optional caps; for rounded bodies (Beetle)
export function loft(rings, capA = false, capB = false) {
  const pos = [], put = (...pts) => pts.forEach(p => pos.push(p[0], p[1], p[2]));
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < rings[r].length - 1; k++) {
    const a = rings[r][k], b = rings[r][k + 1], c = rings[r + 1][k + 1], d = rings[r + 1][k];
    put(a, c, b); put(a, d, c);
  }
  const fan = (R, front) => { const c = R.reduce((s, p) => [s[0] + p[0] / R.length, s[1] + p[1] / R.length, s[2] + p[2] / R.length], [0, 0, 0]); for (let k = 0; k < R.length - 1; k++) front ? put(R[k], R[k + 1], c) : put(R[k], c, R[k + 1]); };
  if (capA) fan(rings[0], true); if (capB) fan(rings[rings.length - 1], false);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return fixWinding(g);
}
// mirror a geometry across x = 0 (left / right pairs)
export const mirrorX = g => fixWinding(g.clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)));

// ------------------------------------------------------------------------------------------- merge + wear
function toNI(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
export function merge(geos) {
  let n = 0; const list = geos.map(toNI); for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
}
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
// vertex colours (multiplying the material colour): dust rising from the ground and settling on flat tops, mud in the
// lowest band, mottled grime. w = { dust 0..1, mud 0..1, grime 0..1, dustColor, baseColor, yDust (height the dust
// reaches), yMud }. Positions are in the frame the geometry is in (the model frame for statics).
export function wear(g, base, w = {}) {
  const p = g.attributes.position, nrm = g.attributes.normal, n = p.count, col = new Float32Array(n * 3);
  const bc = new THREE.Color(base), dc = new THREE.Color(w.dustColor ?? 0x9a8a68), mc = new THREE.Color(w.mudColor ?? 0x4a3c2a);
  const dust = w.dust ?? 0.5, mud = w.mud ?? 0.3, grime = w.grime ?? 0.25, yD = w.yDust ?? 0.9, yM = w.yMud ?? 0.35;
  const r = [dc.r / Math.max(0.02, bc.r), dc.g / Math.max(0.02, bc.g), dc.b / Math.max(0.02, bc.b)];
  const m = [mc.r / Math.max(0.02, bc.r), mc.g / Math.max(0.02, bc.g), mc.b / Math.max(0.02, bc.b)];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nrm.getY(i);
    const nz = hash3(Math.floor(x * 6), Math.floor(y * 6), Math.floor(z * 6)), nz2 = hash3(Math.floor(x * 2.3) + 7, Math.floor(y * 2.3), Math.floor(z * 2.3));
    let kd = dust * Math.max(Math.max(0, 1 - y / yD) ** 1.5, ny > 0.7 ? 0.35 * ny : 0) * (0.6 + 0.6 * nz2);
    let km = mud * Math.max(0, 1 - y / yM) ** 1.2 * (0.5 + 0.8 * nz);
    kd = Math.min(0.85, kd); km = Math.min(0.9, km);
    const gr = 1 - grime * 0.18 * (nz - 0.5) * 2;
    for (let c = 0; c < 3; c++) col[i * 3 + c] = ((1 - kd) + kd * r[c]) * ((1 - km) + km * m[c]) * gr;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const plainColor = g => { const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };

// a builder: add(geometry, material) for the static parts; build(parent) merges per material (with wear) into meshes
export function builder(wearOpts = {}) {
  const map = new Map();
  return {
    add(geo, m) { if (!geo) return geo; (map.get(m) || map.set(m, []).get(m)).push(geo); return geo; },
    build(parent, name = 'static', wo = wearOpts) {
      const out = [];
      for (const [m, geos] of map) {
        const g = merge(geos);
        if (m.vertexColors) { if (wo === false || m.userData.noWear) plainColor(g); else wear(g, m.color.getHex(), wo); }
        const mesh = new THREE.Mesh(g, m); mesh.name = name; parent.add(mesh); out.push(mesh);
      }
      map.clear(); return out;
    },
  };
}

// ------------------------------------------------------------------------------------------- wheels
// A wheel at the origin, axle along x (outer face towards +x), radius r, section width w. Returns { tyre, rim }
// geometries (separate materials). tread: 'ndt' (military non-directional chevron bars), 'road' (ribbed), 'xc' (bar lugs).
// rim: 'mil' (split-ring military disc: big hub, 6/10 studs), 'truck' (deep dish, 10 studs), 'car' (pressed disc + hub
// cap), 'beetle' (5 bolt, domed cap), 'lr' (Land Rover pressed steel 5 stud).
export function wheelGeo({ r, w, rim = 'mil', tread = 'ndt', rimR = r * 0.55, studs = 6, seg = 22 }) {
  const tyre = [], rimG = [];
  // carcass: a lathe of the section (rounded shoulders, sidewall bulge)
  const hw = w / 2, rr = rimR, prof = [];
  const sec = [[rr, -hw * 0.82], [rr + (r - rr) * 0.35, -hw * 1.0], [r - 0.035, -hw * 0.98], [r - 0.012, -hw * 0.8], [r - 0.012, hw * 0.8], [r - 0.035, hw * 0.98], [rr + (r - rr) * 0.35, hw * 1.0], [rr, hw * 0.82]];
  for (const [rad, x] of sec) prof.push(new THREE.Vector2(rad, x));
  const lathe = new THREE.LatheGeometry(prof, seg);   // around y; we need around x: lathe axis y -> x
  lathe.rotateZ(-Math.PI / 2); tyre.push(lathe);
  // tread blocks around the crown
  const nb = tread === 'road' ? 0 : Math.round(seg * 1.0), depth = tread === 'ndt' ? 0.022 : 0.016;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    for (const s of [-1, 1]) {
      const bw = w * 0.36, bl = 2 * Math.PI * r / nb * 0.42;
      const g = new THREE.BoxGeometry(bw, depth, bl);
      // NDT: bars angled into a chevron, the two halves offset by half a pitch
      g.rotateY(s * (tread === 'ndt' ? 0.5 : 0.25));
      const aa = a + (s > 0 ? Math.PI / nb : 0);
      g.translate(s * w * 0.22, r - 0.012 + depth / 2 - 0.004, 0);
      g.rotateX(aa);
      tyre.push(g);
    }
  }
  if (tread === 'road') for (const s of [-0.25, 0, 0.25]) tyre.push(new THREE.TorusGeometry(r - 0.006, 0.006, 4, seg).rotateY(Math.PI / 2).translate(s * w, 0, 0));
  // rim / disc
  const dish = rim === 'truck' ? 0.07 : rim === 'mil' ? 0.035 : 0.02, off = hw * 0.55;
  rimG.push(cylX(rr * 1.02, w * 0.75, 0, 0, 0, seg));                                        // rim barrel (hidden mostly)
  rimG.push(cylX(rr * 0.98, 0.012, off - dish, 0, 0, seg));                                  // disc face, set in
  if (rim === 'mil' || rim === 'truck') {
    rimG.push(new THREE.TorusGeometry(rr * 0.98, 0.012, 4, seg).rotateY(Math.PI / 2).translate(off, 0, 0));   // lock ring
    rimG.push(cylX(rr * 0.42, 0.06, off - dish + 0.03, 0, 0, 10));                          // hub
    rimG.push(cylX(rr * 0.22, 0.05, off - dish + 0.06, 0, 0, 8));                           // hub cap / drive flange
    const ns = rim === 'truck' ? 10 : studs;
    for (let i = 0; i < ns; i++) { const a = i / ns * Math.PI * 2; rimG.push(cylX(0.012, 0.03, off - dish + 0.025, Math.cos(a) * rr * 0.32, Math.sin(a) * rr * 0.32, 6)); }
    for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * Math.PI * 2; rimG.push(cylX(rr * 0.11, 0.014, off - dish + 0.004, Math.cos(a) * rr * 0.68, Math.sin(a) * rr * 0.68, 8)); }   // lightening holes (dark)
  } else if (rim === 'beetle') {
    rimG.push(sphere(rr * 0.5, off - 0.04, 0, 0, 12, 6).scale(0.35, 1, 1));
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; rimG.push(cylX(0.012, 0.02, off - 0.01, Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62, 6)); }
  } else {
    rimG.push(cylX(rr * 0.45, 0.04, off - dish + 0.02, 0, 0, 12, rr * 0.38));                // hub cap
    for (let i = 0; i < (rim === 'lr' ? 5 : 4); i++) { const a = i / (rim === 'lr' ? 5 : 4) * Math.PI * 2; rimG.push(cylX(0.011, 0.025, off - dish + 0.015, Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, 6)); }
  }
  return { tyre: merge(tyre), rim: merge(rimG) };
}
// a complete wheel mesh (group: spin about x) for the given side (+1 right: outer face +x; -1 left: mirrored)
const _wheelCache = new Map();
export function wheelMesh(o, side, tyreM, rimM) {
  const k = JSON.stringify(o) + side;
  let geo = _wheelCache.get(k);
  if (!geo) {
    const g = wheelGeo(o);
    if (side < 0) { g.tyre = mirrorX(g.tyre); g.rim = mirrorX(g.rim); }
    // dust on the tyre / rim too (in wheel frame, low = y < 0 means nothing; just grime)
    wear(g.tyre, tyreM.color.getHex(), { dust: 0.07, mud: 0, yDust: 99, grime: 0.5 }); wear(g.rim, rimM.color.getHex(), { dust: 0.22, mud: 0, yDust: 99, grime: 0.4 });
    geo = g; _wheelCache.set(k, geo);
  }
  const grp = new THREE.Group(); grp.name = 'wheel';
  const t = new THREE.Mesh(geo.tyre, tyreM); t.name = 'tyre'; grp.add(t);
  const r = new THREE.Mesh(geo.rim, rimM); r.name = 'rim'; grp.add(r);
  return grp;
}

// ------------------------------------------------------------------------------------------- decals
const _decals = new Map();
// canvas texture with a drawing callback (cached by key)
export function decalTex(key, w, h, draw) {
  let t = _decals.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; _decals.set(key, t); return t;
}
export function decal(tex, w, h, opacity = 0.92) {
  const m = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}
// the US white star (in a circle for vehicles: "star in a broken circle" was gone by 1980; plain star)
export function starTex(ring = false) {
  return decalTex('star' + ring, 256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#e6e2d2'; c.globalAlpha = 0.9;
    const R = w * 0.42, cx = w / 2, cy = h / 2 + w * 0.03; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.382 : R; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    c.closePath(); c.fill();
    if (ring) { c.lineWidth = w * 0.035; c.strokeStyle = '#e6e2d2'; c.beginPath(); c.arc(cx, h / 2, w * 0.47, 0, Math.PI * 2); c.stroke(); }
    // weathering: chips
    c.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 60; i++) { c.globalAlpha = Math.random() * 0.5; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, Math.random() * 6, 0, 7); c.fill(); }
  });
}
// stencilled text (bumper codes, "USA" numbers): white on transparent, slightly worn
export function stencilTex(text, w = 512, h = 96, color = '#e2dfcf', font = 'bold 64px "Arial Narrow", Arial, sans-serif') {
  return decalTex('st:' + text + w + h + color, w, h, (c) => {
    c.clearRect(0, 0, w, h); c.fillStyle = color; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
    c.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 40; i++) { c.globalAlpha = Math.random() * 0.6; c.fillRect(Math.random() * w, Math.random() * h, Math.random() * 5 + 1, Math.random() * 3 + 1); }
  });
}

// ------------------------------------------------------------------------------------------- animation helpers
// sim -> look: what the models animate from (decoupled from the sim so a host can also drive a model from AI state)
export function lookFrom(sim, ctl = sim.lastCtl || {}) {
  const P = sim.spec._prep;
  return {
    wheels: sim.wheels.map((W, i) => ({ dy: P.wk[i].s0 - W.s, steer: W.steer + (W.toe || 0), spin: W.spin, camber: W.camber, contact: W.contact, flat: W.ts.flat })),
    steer: ctl.steer || 0, throttle: ctl.throttle || 0, brake: ctl.brake || 0, clutch: ctl.clutch || 0, handbrake: ctl.handbrake || 0,
    gear: sim.gear, range: sim.range, fwd: sim.fwd, rpm: sim.eng.rpm, running: sim.eng.running, speed: sim.speed, kmh: sim.kmh,
    fuel: sim.fuelL / sim.spec.fuel.capacity, temp: sim.eng.temp, oil: sim.eng.oilP, amps: sim.amps, volts: sim.spec.electrics?.volts ?? 12, battery: sim.battery, gen: sim.genOn,
    air: sim.airPsi, odo: sim.odometer, lights: !!sim.lights, horn: sim.horn, smoke: sim.eng.smoke, ignition: ctl.ignition !== false, starter: !!ctl.starter,
    dmg: sim.dmg ? sim.dmg.state : null,
  };
}
