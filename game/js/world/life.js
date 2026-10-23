// The lived-in world on the main thread: streams the built world (towns, roads, farms, harbours, power lines) in
// 400 m chunks round the camera from the world worker, swaps near / far detail by distance, builds the control
// zone's villages at start, and runs the ambient life (ambient.js). main.js calls createWorldLife() once and
// world.update() every frame (two hooks, marked WORLD in main.js).
//
// Performance: one merged mesh per chunk and level of detail (solid + ground overlay), frustum culled; near detail
// within ~520 m, far detail out to the jet's view distance (capped), nothing past it. Chunks are built in the worker,
// at most two in flight, nearest first; the main thread only wraps the buffers.
import * as THREE from 'three';
import { BOUND, ISLANDS } from '../world.js';
import { netState, ensure, cellReady, CELL, roadAt, roadGraph, roadPoint, roadById, clearedAt } from './net.js';
import { zoneItems } from './layout.js';
import { buildGeo, CHUNK } from './chunkgen.js';
import { worldMaterial, groundMaterial, geoFrom } from './gfx.js';
import { createAmbient } from './ambient.js';
import { buildPadDressing, buildShaftCollar, buildRWPylon } from './structures.js';
import { structAngle, settlementsNear, nearestRoad, settlementOf } from './net.js';

const NEAR_R = 520, FAR_MAX = 2300;
export function createWorldLife(ctx) {
  const { scene, terrainH, fog, uTime } = ctx;
  if (/[?&]noworld/.test(location.search)) return (window.__WORLD = { update() {}, stats: { ms: 0, off: true }, zone: [], chunks: new Map(), ambient: { stats: {}, people: [], cars: [] } });   // A/B for perf
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const M = {
    solid: worldMaterial(), gNear: groundMaterial(), gFar: groundMaterial({ far: true }),
    zSolid: worldMaterial({ fog, uTime }), zgNear: groundMaterial({ fog, uTime }), zgFar: groundMaterial({ fog, uTime, far: true }),
    wire: new THREE.LineBasicMaterial({ color: 0x202020, transparent: true, opacity: 0.75 }),
  };
  const stats = { chunks: 0, pending: 0, built: 0, buildMs: 0, tris: 0, zoneTris: 0, ms: 0 };
  const mk = (d, mat) => { if (!d || !d.tris) return null; const m = new THREE.Mesh(geoFrom(d), mat); m.matrixAutoUpdate = false; root.add(m); return m; };
  const wiresOf = w => { if (!w || !w.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(w, 3)); g.computeBoundingSphere(); const l = new THREE.LineSegments(g, M.wire); l.matrixAutoUpdate = false; root.add(l); return l; };
  const dispose = o => { if (!o) return; root.remove(o); o.geometry.dispose(); };

  // ---------------------------------------------------------------------------------- the control zone (at start)
  const zone = [];
  {
    const t0 = performance.now();
    for (const { I, items, roads } of zoneItems(terrainH)) {
      const rd = new Map(); for (const id of roads) { const R = roadById(id); rd.set(R, new Set(Array.from({ length: R.xs.length - 1 }, (_, i) => i))); }
      const discs = []; for (const [, a] of netState.buckets) for (const s of a) if (s.disc && Math.hypot(s.ax - I.x, s.az - I.z) < I.r + 30 && !discs.includes(s)) discs.push(s);
      const c = buildGeo({ items, roads: rd, discs, x0: -1e9, z0: -1e9, x1: 1e9, z1: 1e9 }, terrainH, { lat: 2.5 });
      const e = { I, x: I.x, z: I.z, sN: mk(c.near, M.zSolid), sF: mk(c.far, M.zSolid), gN: mk(c.gnear, M.zgNear), gF: mk(c.gfar, M.zgFar), wires: wiresOf(c.wires), dyn: c.dyn, items };
      stats.zoneTris += c.near.tris + c.gnear.tris; zone.push(e);
    }
    stats.zoneMs = performance.now() - t0;
  }

  // ---------------------------------------------------------------------------------- the wild lands (streamed)
  const chunks = new Map(), key = (i, j) => i * 100000 + j;
  let worker = null;
  try { worker = new Worker(new URL('./worldworker.js', import.meta.url), { type: 'module' }); } catch (e) { console.warn('world worker failed', e); }
  let reqId = 0;
  if (worker) worker.onmessage = ({ data: d }) => {
    const c = chunks.get(key(d.ci, d.cj)); stats.pending--;
    if (!c || c.state !== 'pending') return;   // dropped while building
    Object.assign(c, { state: 'ready', sN: mk(d.near, M.solid), sF: mk(d.far, M.solid), gN: mk(d.gnear, M.gNear), gF: mk(d.gfar, M.gFar), wires: wiresOf(d.wires), dyn: d.dyn, tris: d.near.tris + d.gnear.tris });
    stats.built++; stats.buildMs = d.ms; ambient.addChunk(c);
  };
  const wantR = () => Math.min(FAR_MAX, Math.max(NEAR_R + 200, (ctx.view ? ctx.view.draw : 600) * 0.92));
  let scanT = 0;
  function stream(cx, cz) {
    const R = wantR(), want = [];
    const i0 = Math.floor((cx - R) / CHUNK), i1 = Math.floor((cx + R) / CHUNK), j0 = Math.floor((cz - R) / CHUNK), j1 = Math.floor((cz + R) / CHUNK);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * CHUNK, z = (j + 0.5) * CHUNK, d = Math.hypot(x - cx, z - cz);
      if (d > R + CHUNK * 0.71 || Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300 - CHUNK * 0.5) continue;   // the zone is built at start
      const k = key(i, j); if (!chunks.has(k)) want.push([d, i, j, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, i, j, k] of want) { if (stats.pending >= 2 || !worker) break; chunks.set(k, { i, j, x: (i + 0.5) * CHUNK, z: (j + 0.5) * CHUNK, state: 'pending' }); stats.pending++; worker.postMessage({ id: reqId++, ci: i, cj: j }); }
    for (const [k, c] of chunks) if (Math.hypot(c.x - cx, c.z - cz) > R + CHUNK * 1.6) {
      if (c.state === 'ready') { for (const p of ['sN', 'sF', 'gN', 'gF', 'wires']) dispose(c[p]); ambient.dropChunk(c); }
      chunks.delete(k);
    }
  }
  function lod(cx, cz) {
    const R = wantR(); let tris = 0, n = 0;
    const show = (c, near, far) => { if (c.sN) c.sN.visible = near; if (c.gN) c.gN.visible = near; if (c.wires) c.wires.visible = near; if (c.sF) c.sF.visible = far; if (c.gF) c.gF.visible = far; };
    for (const c of chunks.values()) { if (c.state !== 'ready') continue; const d = Math.hypot(c.x - cx, c.z - cz), near = d < NEAR_R + CHUNK * 0.35; show(c, near, !near && d < R + CHUNK * 0.71); if (near) tris += c.tris; n++; }
    for (const e of zone) { const d = Math.hypot(e.x - cx, e.z - cz) - e.I.r, near = d < NEAR_R; show(e, near, !near && d < R); }
    stats.chunks = n; stats.tris = tris;
  }
  // keep the main thread's road network a step ahead of the camera, so physics never waits on a whole cell. The
  // settlement candidates round the zone (the bulk of a cold first cell) are worked through a few per frame at start.
  let prewarmT = 0, sIdx = 0;
  const SR = 11, sCells = (2 * SR + 1) ** 2;
  function prewarmSettlements() { for (let k = 0; k < 12 && sIdx < sCells; k++, sIdx++) settlementOf((sIdx % (2 * SR + 1)) - SR, Math.floor(sIdx / (2 * SR + 1)) - SR); }
  function prewarm(cx, cz) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = cx + dx * CELL, z = cz + dz * CELL; if (Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300) continue;
      const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), k = (ci + 32768) * 65536 + (cj + 32768);
      if (!netState.ready.has(k)) { cellReady(ci, cj); return; }   // one cell a call
    }
  }

  // ---------------------------------------------------------------------------------- site dressing in the zone
  // helipads (windsock, edge lights, ops shack), the collar over each cave shaft, RUNAWAY power pylons on machine-held
  // islands; follows island ownership by polling (no hooks needed)
  const sites = [];
  for (const I of ISLANDS) {
    const p = I.pad; if (!p) continue;
    const site = { I, owner: -1, pylons: [], cables: null, fallT: 0 };
    const pd = buildPadDressing(p.r || 8.5); pd.position.set(p.x, p.h, p.z); pd.rotation.y = structAngle(I) + Math.PI / 2; root.add(pd); site.pad = pd;
    if (I.cave && I.base) {
      const c = buildShaftCollar(9); c.position.set(I.x, I.base.h, I.z); root.add(c); site.collar = c;
      // main.js's placeholder blocks round the shaft give way to the collar
      const holder = I.base.surface || (I.base.beam && I.base.beam.parent);
      if (holder) for (const o of holder.children) if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') o.visible = false;
    }
    // pylon line: an arc round the pad from the HQ's side to the production building's, away from the shaft
    const a0 = I.cave ? Math.atan2(9, -17) : structAngle(I), a1 = I.cave ? Math.atan2(6, 19) : a0 + Math.PI, R = I.cave ? 27 : 35;
    let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); if (I.cave && da < 0) da += Math.PI * 2;
    for (let k = 0; k < 5; k++) {
      const a = a0 + da * (k + 0.5) / 5, x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R, y = terrainH(x, z);
      if (y < 0.5) continue;
      const py = buildRWPylon(); py.position.set(x, y, z); py.rotation.y = -a; py.visible = false; root.add(py); site.pylons.push(py);
    }
    const pts = []; for (let k = 0; k + 1 < site.pylons.length; k++) for (const [u, v, w] of site.pylons[k].userData.tops) { const A = site.pylons[k], B = site.pylons[k + 1]; const a = new THREE.Vector3(u, v, w).applyEuler(A.rotation).add(A.position), b = new THREE.Vector3(u, v, w).applyEuler(B.rotation).add(B.position), m = a.clone().lerp(b, 0.5); m.y -= 1.2; pts.push(a.x, a.y, a.z, m.x, m.y, m.z, m.x, m.y, m.z, b.x, b.y, b.z); }
    if (pts.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); site.cables = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8ff4ff, transparent: true, opacity: 0.8 })); site.cables.visible = false; root.add(site.cables); }
    sites.push(site);
  }
  function updateSites(dt, t) {
    const wind = ctx.fx && ctx.fx.wind, wl = wind ? Math.hypot(wind.x, wind.y) : 0;
    for (const s of sites) {
      const own = s.I.owner;
      if (own !== s.owner) {   // ownership changed (or first frame)
        const first = s.owner < 0, was = s.owner; s.owner = own;
        if (s.collar) s.collar.userData.setSide(own);
        if (own === 2) { s.grow = first ? 99 : 0; for (const p of s.pylons) { p.visible = true; p.rotation.z = 0; p.userData.glowMat.color.setHex(0x8ff4ff); } s.fallT = 0; }
        else if (was === 2) { s.fallT = 0.001; for (const p of s.pylons) p.userData.glowMat.color.setHex(0x1c2224); if (s.cables) s.cables.visible = false; }
      }
      if (own === 2 && s.grow < 99) {   // the machines string their power line across the island, pylon by pylon
        s.grow += dt;
        s.pylons.forEach((p, k) => { const f = Math.min(1, Math.max(0.01, (s.grow - k * 1.4) / 2.2)); p.scale.set(1, f, 1); });
        if (s.grow > s.pylons.length * 1.4 + 2.5) s.grow = 99;
      }
      if (own === 2 && s.grow >= 99) { for (const p of s.pylons) p.scale.set(1, 1, 1); if (s.cables) { s.cables.visible = true; s.cables.material.opacity = 0.55 + 0.3 * Math.sin(t * 2.3 + s.I.id); } }
      if (s.fallT > 0 && s.fallT < 4) { s.fallT += dt; s.pylons.forEach((p, k) => { if (k % 2 === 0) p.rotation.z = Math.min(1.35, s.fallT * s.fallT * 0.4) * (k % 4 ? 1 : -1); }); }   // wreckage: half of them topple
      if (s.pad && wind) { const sock = s.pad.userData.sock; sock.rotation.y = Math.atan2(-wind.y, wind.x) - s.pad.rotation.y + Math.sin(t * 1.7 + s.I.id) * 0.15; sock.rotation.z = -(1 - Math.min(1, wl / 2.2)) * 1.1; }
    }
  }

  const ambient = createAmbient({ ...ctx, root, zone, chunks });
  const W = {
    root, stats, zone, chunks, ambient, sites,
    net: { settlementsNear, netState, nearestRoad },   // for tests and tools
    traffic: { setModel: (k, def) => ambient.setModel(k, def), get models() { return ambient.models; }, get cars() { return ambient.cars; } },
    update(dt, cam, playing = true) {
      const t0 = performance.now(), cx = cam.position.x, cz = cam.position.z;
      scanT -= dt; if (scanT <= 0) { scanT = 0.4; stream(cx, cz); lod(cx, cz); }
      // only near the wild lands (physics in the zone never needs them); one cell at a time
      prewarmT -= dt; if (prewarmT <= 0) { prewarmT = 1.5; if (Math.max(Math.abs(cx), Math.abs(cz)) > BOUND - 150) prewarm(cx, cz); }
      if (sIdx < sCells) prewarmSettlements();
      W.t = (W.t || 0) + dt; updateSites(dt, W.t);
      ambient.update(dt, cam, playing);
      stats.ms += (performance.now() - t0 - stats.ms) * 0.05;   // smoothed main-thread cost per frame
    },
    // ---- road queries for vehicles and AI traffic (net.js; see MODLOG "lived-in world")
    roadAt, roadGraph, roadPoint, roadById,
    clearedAt,
  };
  if (/[?&]debug/.test(location.search)) window.__WORLD = W;
  return W;
}
