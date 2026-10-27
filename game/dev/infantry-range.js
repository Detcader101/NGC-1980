// NGC-1980 infantry range: the world of the sandbox. Firing line at z = 0 facing -z; lanes with pop-up E-type
// silhouettes at 25-400 m, steel gongs, number boards, an impact berm; a hill to the east (slopes, stamina), a pond
// (wading, ricochets), a sandbag wall and a bench to rest on, a brick wall and a tank hulk (cover / M203 / LAW targets).
// Exposes the env hooks the rifleman needs: groundY, surface, waterDepth, restAt, raycast, headroom.
import * as THREE from 'three';
import { Kit, KITMAT, CAMO, COL, noise3 } from '../js/units/infantry/meshkit.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const DISTS = [25, 50, 100, 150, 200, 250, 300, 350, 400];
const LANE_X = [-8, 0, 8], STAGGER = [-3.0, -2.4, -1.8, -1.2, -0.4, 0.6, 1.8, 3.0, 4.4];   // wide enough that no target hides another, even from prone
const POND = { x: -55, z: -70, r: 16, d: 1.7 };
// ------------------------------------------------------------------------------------------------ terrain
export function groundY(x, z) {
  let h = 0;
  // gentle undulation off the mown range
  const off = sstep(18, 40, Math.abs(x)) + sstep(-470, -520, z);
  h += off * (noise3(x * 0.03, 0, z * 0.03) - 0.5) * 3;
  // impact berm behind the 400 m line, low side berms along the range
  h += 7 * Math.exp(-(((z + 432) / 10) ** 2)) * sstep(70, 40, Math.abs(x));
  h += 2.2 * Math.exp(-(((Math.abs(x) - 30) / 3) ** 2)) * sstep(10, -20, z) * sstep(-440, -400, z);
  // the hill to the east
  if (x > 45) h += Math.min(28, (x - 45) * 0.32) * sstep(40, 0, Math.abs(z + 120) - 80) + (noise3(x * 0.05, 1, z * 0.05) - 0.5) * 2 * sstep(45, 70, x);
  // the pond
  const dp = Math.hypot(x - POND.x, z - POND.z); if (dp < POND.r + 4) h -= POND.d * sstep(POND.r + 4, POND.r - 6, dp) + 0.3 * sstep(POND.r + 4, POND.r, dp);
  return h;
}
export const waterLevel = -0.25;
export function waterDepth(x, z) { const g = groundY(x, z); return Math.hypot(x - POND.x, z - POND.z) < POND.r + 4 ? Math.max(0, waterLevel - g) : 0; }
export function surface(x, z) {
  if (waterDepth(x, z) > 0.03) return 'water';
  if (z > -2 && z < 4 && Math.abs(x) < 16) return 'concrete';
  if (Math.abs(x) < 16 && z < -2 && z > -440) return Math.abs(x % 6) < 0.6 ? 'dirt' : 'grass';
  if (x > 60) return 'rock';
  if (z < -415 && z > -450) return 'dirt';
  return 'grass';
}

// ------------------------------------------------------------------------------------------------ build
// E-type silhouette (head and torso, ~0.5 x 1.0 m) outline, bottom centre at the origin
const E_SIL = [[-0.25, 0], [0.25, 0], [0.25, 0.62], [0.17, 0.7], [0.1, 0.72], [0.1, 0.86], [0.06, 0.98], [-0.06, 0.98], [-0.1, 0.86], [-0.1, 0.72], [-0.17, 0.7], [-0.25, 0.62]];
function inPoly(px, py, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; }
export function buildRange(scene) {
  const R = { targets: [], solids: [], gongs: [], boards: [] };
  // ground mesh (one draw): grid with vertex colours (mown range, lanes, dirt berm, rock hill, pond bed)
  {
    const W = 260, D = 620, NX = 130, NZ = 250, g = new THREE.PlaneGeometry(W, D, NX, NZ).rotateX(-Math.PI / 2); g.translate(20, 0, -250);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = groundY(x, z); p.setY(i, y);
      const s = surface(x, z), n = noise3(x * 0.2, 3, z * 0.2);
      c.setHex(s === 'concrete' ? 0x8a8a82 : s === 'dirt' ? 0x7a6646 : s === 'rock' ? 0x77756c : y < waterLevel ? 0x4a4a36 : Math.abs(x) < 16 && z < 0 && z > -440 ? 0x6f7d40 : 0x5c6a34);
      c.multiplyScalar(0.88 + 0.24 * n); col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    // pond water
    const w = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 3, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f5a64, transparent: true, opacity: 0.8 }));
    w.position.set(POND.x, waterLevel, POND.z); scene.add(w);
  }
  const statics = new Kit();
  // firing line: concrete apron, firing points (benches with sandbag rests), lane markers
  for (let i = -2; i <= 2; i++) {
    const x = i * 6;
    statics.box(1.2, 0.08, 0.6, CAMO.vary(COL.wood, 0.15, 0.2), [x - 2.2, 0.9, -0.9]); for (const lx of [-0.5, 0.5]) for (const lz of [-0.2, 0.2]) statics.box(0.06, 0.9, 0.06, COL.wood, [x - 2.2 + lx, 0.45, -0.9 + lz]);   // shooting bench
    R.solids.push({ min: [x - 2.8, 0, -1.2], max: [x - 1.6, 0.94, -0.6], material: 'wood', rest: true });
    statics.box(0.1, 1.4, 0.1, 0xd8d6c8, [x + 2.8, 0.7, 0.8]); statics.box(0.5, 0.35, 0.03, 0xd8d6c8, [x + 2.8, 1.3, 0.76]);   // lane number post
  }
  // sandbag wall (rest for crouch / stand), the range tower, a brick wall and a tank hulk downrange
  const bag = CAMO.vary(0xa08f62, 0.12, 0.15);
  for (let r = 0; r < 6; r++) for (let i = 0; i < 6; i++) statics.box(0.55, 0.16, 0.32, bag, [-20 + i * 0.56 + (r % 2) * 0.28, 0.08 + r * 0.17, -1.5], [0, 0, 0], 1);
  R.solids.push({ min: [-20.3, 0, -1.66], max: [-16.7, 1.02, -1.34], material: 'sandbag', thickness: 320, rest: true });   // kneeling height: rest the rifle on it
  for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) statics.box(0.2, 6, 0.2, COL.wood, [-24 + lx, 3, 6 + lz]);
  statics.box(3.6, 0.15, 3.6, COL.wood, [-24, 6, 6]); statics.box(3.4, 1.0, 3.4, 0xc8c2a8, [-24, 6.6, 6]); statics.box(3.8, 0.12, 3.8, 0x6a3a2a, [-24, 7.2, 6]);
  // brick wall at 60 m (cover test: rifles, pistol) and a hulk at 150 m (M203 / LAW target)
  for (let r = 0; r < 12; r++) for (let i = 0; i < 12; i++) statics.box(0.22, 0.075, 0.24, CAMO.vary(0x8a4b35, 0.15, 0.3), [-13 + i * 0.23 + (r % 2) * 0.11, 0.04 + r * 0.08, -60], [0, 0, 0]);
  R.solids.push({ min: [-13.2, 0, -60.12], max: [-10.3, 0.98, -59.88], material: 'brick', thickness: 240, name: 'brick wall' });
  {
    const hk = new Kit(), hz = -150, hx = 14, steel = CAMO.vary(0x4f5338, 0.1, 0.4);
    hk.box(3.4, 1.0, 6.4, steel, [hx, 0.9, hz]); hk.box(2.4, 0.7, 2.6, steel, [hx, 1.75, hz + 0.3]); hk.cyl(0.08, 0.1, 3.5, 0x3a3d2a, [hx, 1.8, hz - 2.6], 'z', 8);
    for (const s of [-1, 1]) hk.box(0.55, 0.85, 6.6, 0x2a2a24, [hx + s * 1.75, 0.45, hz]);
    hk.box(3.42, 0.04, 6.42, 0x6a3a22, [hx, 1.38, hz]);   // rust
    scene.add(hk.mesh(KITMAT.lambert(), 'hulk'));
    R.solids.push({ min: [hx - 2.05, 0, hz - 3.3], max: [hx + 2.05, 1.4, hz + 3.3], material: 'armour', thickness: 80, name: 'tank hulk' }, { min: [hx - 1.2, 1.4, hz - 1.0], max: [hx + 1.2, 2.1, hz + 1.6], material: 'armour', thickness: 80, name: 'tank hulk' });
  }
  // trees around the range
  const treeK = new Kit();
  for (let i = 0; i < 140; i++) {
    const a = noise3(i * 1.7, 0, 3) * 2 - 1, x = i % 2 ? -40 - noise3(i, 2, 0) * 60 : 34 + noise3(i, 5, 1) * 10 + (i % 4 === 1 ? 70 : 0), z = 30 - i * 3.6 + a * 6;
    const y = groundY(x, z), hgt = 7 + noise3(i, 9, 9) * 7;
    treeK.cyl(0.12, 0.2, hgt * 0.4, 0x4a3a28, [x, y + hgt * 0.2, z], 'y', 5);
    treeK.cyl(0, 2 + noise3(i, 4, 4), hgt * 0.75, CAMO.vary(0x2f4a24, 0.2, 2), [x, y + hgt * 0.62, z], 'y', 6);
  }
  scene.add(treeK.mesh(KITMAT.lambert(), 'trees'));
  scene.add(statics.mesh(KITMAT.lambert(), 'statics'));
  // targets: pop-up E silhouettes on posts (lanes x -6, 0, 6) at every distance; steel gongs at 100 / 200 / 300 m
  const eMat = KITMAT.lambert();
  for (const d of DISTS) {
    for (const lx of LANE_X) {
      const x = lx + STAGGER[DISTS.indexOf(d)], z = -d, y = groundY(x, z);   // staggered so no target hides another
      const k = new Kit(); k.prism(E_SIL, 0.02, CAMO.vary(0x4a5230, 0.08, 0.15), [0, 0, 0], 'xy'); k.box(0.05, 0.06, 0.06, 0x2a2a20, [0, 0.03, 0.03]);
      const pivot = new THREE.Group(); pivot.position.set(x, y + 0.25, z); scene.add(pivot);
      const mesh = k.mesh(eMat, 'E' + d); pivot.add(mesh);
      // a little earth mound in front hides the lifter
      const mk = new Kit(); mk.box(1.2, 0.3, 0.5, CAMO.vary(0x6a5a3c, 0.15, 0.2), [x, y + 0.1, z - 0.6]); scene.add(mk.mesh(KITMAT.lambert()));
      const holes = new THREE.Group(); mesh.add(holes);
      R.targets.push({ kind: 'E', d, x, z, pivot, mesh, holes, up: 1, down: 0, timer: 0, hits: 0, poly: E_SIL, lane: lx });
    }
    // distance board on the left
    const bx = -15, bz = -d, by = groundY(bx, bz);
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const c2 = cv.getContext('2d'); c2.fillStyle = '#e8e4d0'; c2.fillRect(0, 0, 128, 64); c2.fillStyle = '#111'; c2.font = 'bold 44px sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(String(d), 64, 34);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + d / 400, (1.6 + d / 400) / 2), new THREE.MeshBasicMaterial({ map: tex })); board.position.set(bx, by + 1.6 + d / 400, bz); scene.add(board);
    const pk = new Kit(); pk.box(0.1, 1.6, 0.1, COL.wood, [bx, by + 0.8, bz + 0.05]); scene.add(pk.mesh(KITMAT.lambert()));
  }
  for (const d of [100, 200, 300]) {
    const x = 11, z = -d, y = groundY(x, z), fk = new Kit();
    fk.box(0.1, 1.6, 0.1, COL.wood, [x - 0.6, y + 0.8, z]); fk.box(0.1, 1.6, 0.1, COL.wood, [x + 0.6, y + 0.8, z]); fk.box(1.4, 0.1, 0.1, COL.wood, [x, y + 1.6, z]);
    scene.add(fk.mesh(KITMAT.lambert()));
    const pv = new THREE.Group(); pv.position.set(x, y + 1.55, z); scene.add(pv);
    const gk = new Kit(); gk.cyl(0.25, 0.25, 0.012, 0xd0d0c8, [0, -0.6, 0], 'z', 16); gk.rod([0, 0, 0], [0, -0.35, 0], 0.006, 0x333333); scene.add(pv); const gm = gk.mesh(KITMAT.lambert(), 'gong' + d); pv.add(gm);
    const holes = new THREE.Group(); gm.add(holes);
    R.gongs.push({ kind: 'gong', d, x, z, pivot: pv, mesh: gm, holes, swing: 0, sv: 0 });
  }
  // ------------------------------------------------------------------------------------ raycast (segment)
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4();
  R.raycast = function (x0, y0, z0, x1, y1, z1, P) {
    let best = null;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 1e-9;
    // boxes (axis aligned solids)
    for (const s of R.solids) {
      let t0 = 0, t1 = 1, nAx = -1, nSg = 0;
      const o = [x0, y0, z0], d = [dx, dy, dz];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-12) { if (o[a] < s.min[a] || o[a] > s.max[a]) { ok = false; break; } continue; }
        let ta = (s.min[a] - o[a]) / d[a], tb = (s.max[a] - o[a]) / d[a], sg = -1; if (ta > tb) { [ta, tb] = [tb, ta]; sg = 1; }
        if (ta > t0) { t0 = ta; nAx = a; nSg = sg; } t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
      }
      if (ok && nAx >= 0 && (!best || t0 < best.t)) { const n = [0, 0, 0]; n[nAx] = nSg; best = { t: t0, x: x0 + dx * t0, y: y0 + dy * t0, z: z0 + dz * t0, nx: n[0], ny: n[1], nz: n[2], material: s.material, thickness: s.thickness ?? (s.max[nAx] - s.min[nAx]) * 1000, target: s.name || null }; }
    }
    // targets (E silhouettes: plane + polygon), gongs (discs)
    for (const T of R.targets) {
      if (T.up < 0.5) continue;
      if (Math.abs(z0 - T.z) > L + 1 && Math.abs(z1 - T.z) > L + 1 && Math.sign(z0 - T.z) === Math.sign(z1 - T.z)) continue;
      T.mesh.updateWorldMatrix(true, false); _inv.copy(T.mesh.matrixWorld).invert();
      _o.set(x0, y0, z0).applyMatrix4(_inv); _d.set(x1, y1, z1).applyMatrix4(_inv).sub(_o);
      if (Math.abs(_d.z) < 1e-9) continue; const t = -_o.z / _d.z; if (t < 0 || t > 1) continue;
      const px = _o.x + _d.x * t, py = _o.y + _d.y * t;
      if (inPoly(px, py, T.poly) && (!best || t < best.t)) best = { t, x: x0 + dx * t, y: y0 + dy * t, z: z0 + dz * t, nx: 0, ny: 0, nz: 1, material: 'wood', thickness: 20, target: T, local: [px, py] };
    }
    for (const G of R.gongs) {
      if (Math.sign(z0 - G.z) === Math.sign(z1 - G.z)) continue;
      G.mesh.updateWorldMatrix(true, false); _inv.copy(G.mesh.matrixWorld).invert();
      _o.set(x0, y0, z0).applyMatrix4(_inv); _d.set(x1, y1, z1).applyMatrix4(_inv).sub(_o);
      if (Math.abs(_d.z) < 1e-9) continue; const t = -_o.z / _d.z; if (t < 0 || t > 1) continue;
      const px = _o.x + _d.x * t, py = _o.y + _d.y * t + 0.6;
      if (Math.hypot(px, py) < 0.25 && (!best || t < best.t)) best = { t, x: x0 + dx * t, y: y0 + dy * t, z: z0 + dz * t, nx: 0, ny: 0, nz: 1, material: 'steel', thickness: 10, target: G, local: [px, py - 0.6] };
    }
    // water surface
    if (y0 > waterLevel !== y1 > waterLevel) { const t = (y0 - waterLevel) / (y0 - y1), x = x0 + dx * t, z = z0 + dz * t; if (waterDepth(x, z) > 0.02 && (!best || t < best.t)) best = { t, x, y: waterLevel, z, nx: 0, ny: 1, nz: 0, material: 'water', thickness: waterDepth(x, z) * 1000 }; }
    // ground: march, then bisect
    const n = Math.max(2, Math.ceil(L / 0.6)); let pt = 0, pAbove = y0 - groundY(x0, z0);
    for (let i = 1; i <= n; i++) {
      const t = i / n; if (best && t > best.t) break;
      const above = y0 + dy * t - groundY(x0 + dx * t, z0 + dz * t);
      if (above < 0 && pAbove >= 0) {
        let a = pt, b = t; for (let k = 0; k < 14; k++) { const m = (a + b) / 2; if (y0 + dy * m - groundY(x0 + dx * m, z0 + dz * m) < 0) b = m; else a = m; }
        const x = x0 + dx * b, z = z0 + dz * b, e = 0.3, hx = (groundY(x + e, z) - groundY(x - e, z)) / (2 * e), hz = (groundY(x, z + e) - groundY(x, z - e)) / (2 * e), nl = Math.hypot(hx, 1, hz);
        const s = surface(x, z);
        best = { t: b, x, y: groundY(x, z), z, nx: -hx / nl, ny: 1 / nl, nz: -hz / nl, material: s === 'water' ? 'soil' : s === 'rock' ? 'concrete' : s === 'concrete' ? 'concrete' : 'soil', thickness: 1e9, ground: true };
        break;
      }
      pAbove = above; pt = t;
    }
    if (best && P && P.owner != null && best.body && best.body.target === P.owner) return null;
    return best;
  };
  // weapon rest: a solid's top within reach under the handguard (eye 0.12 m above it), just ahead of the eye
  R.restAt = function (x, y, z, yaw) {
    const fx = x - Math.sin(yaw) * 0.45, fz = z - Math.cos(yaw) * 0.45;
    for (const s of R.solids) if (s.rest && fx > s.min[0] - 0.1 && fx < s.max[0] + 0.1 && fz > s.min[2] - 0.25 && fz < s.max[2] + 0.25 && y > s.max[1] - 0.12 && y < s.max[1] + 0.2) return true;
    return false;
  };
  // collision against solids (feet circle vs boxes), returns the resolved position
  R.move = function (pos, dx, dz, r, h) {
    let x = pos.x + dx, z = pos.z + dz, bx = false, bz = false;
    for (const s of R.solids) {
      if (pos.y + 0.3 > s.max[1] || pos.y + h < s.min[1]) continue;
      const cx = clamp(x, s.min[0], s.max[0]), cz = clamp(z, s.min[2], s.max[2]), ddx = x - cx, ddz = z - cz, dd = Math.hypot(ddx, ddz);
      if (dd < r) { if (dd > 1e-6) { x = cx + ddx / dd * r; z = cz + ddz / dd * r; } else { x = pos.x; z = pos.z; } if (Math.abs(ddx) > Math.abs(ddz)) bx = true; else bz = true; }
    }
    return { x, z, blockedX: bx, blockedZ: bz };
  };
  R.reset = function () { for (const T of R.targets) { T.up = 1; T.down = 0; T.timer = 0; T.holes.clear(); T.hits = 0; } for (const G of R.gongs) { G.holes.clear(); } };
  // a hit on a target: mark the hole, knock it down (pop-up), swing a gong
  const holeG = new THREE.CircleGeometry(0.012, 6), holeM = new THREE.MeshBasicMaterial({ color: 0x0a0a08 }), holeM2 = new THREE.MeshBasicMaterial({ color: 0x3a3a34 });
  R.hit = function (T, local) {
    const hm = new THREE.Mesh(holeG, T.kind === 'gong' ? holeM2 : holeM); hm.position.set(local[0], local[1], 0.012); T.holes.add(hm);
    if (T.kind === 'E') { T.hits++; T.timer = 3.0; T.falling = true; }
    else { T.sv += 2.5; }
  };
  R.update = function (dt) {
    for (const T of R.targets) {
      if (T.falling) { T.down = Math.min(1, T.down + dt / 0.35); if (T.down >= 1) T.falling = false; }
      else if (T.timer > 0) { T.timer -= dt; if (T.timer <= 0) T.rising = true; }
      if (T.rising) { T.down = Math.max(0, T.down - dt / 0.8); if (T.down <= 0) T.rising = false; }
      T.up = 1 - T.down; T.pivot.rotation.x = -T.down * 1.45;
    }
    for (const G of R.gongs) { G.sv += (-9 * G.swing - 0.6 * G.sv) * dt; G.swing += G.sv * dt; G.pivot.rotation.x = -G.swing * 0.25; }
  };
  return R;
}
