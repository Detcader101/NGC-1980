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

const NEAR_R = 520, FAR_MAX = 2300;
export function createWorldLife(ctx) {
  const { scene, terrainH, fog, uTime } = ctx;
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const M = {
    solid: worldMaterial(), gNear: groundMaterial(), gFar: groundMaterial({ far: true }),
    zSolid: worldMaterial({ fog, uTime }), zgNear: groundMaterial({ fog, uTime }), zgFar: groundMaterial({ fog, uTime, far: true }),
    wire: new THREE.LineBasicMaterial({ color: 0x202020, transparent: true, opacity: 0.75 }),
  };
  const stats = { chunks: 0, pending: 0, built: 0, buildMs: 0, tris: 0, zoneTris: 0 };
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
  // keep the main thread's road network a step ahead of the camera, so physics never waits on a whole cell
  let prewarmT = 0;
  function prewarm(cx, cz) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = cx + dx * CELL, z = cz + dz * CELL; if (Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300) continue;
      const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), k = (ci + 32768) * 65536 + (cj + 32768);
      if (!netState.ready.has(k)) { cellReady(ci, cj); return; }   // one cell a call
    }
  }

  const ambient = createAmbient({ ...ctx, root, zone, chunks });
  const W = {
    root, stats, zone, chunks, ambient,
    update(dt, cam, playing = true) {
      const cx = cam.position.x, cz = cam.position.z;
      scanT -= dt; if (scanT <= 0) { scanT = 0.4; stream(cx, cz); lod(cx, cz); }
      prewarmT -= dt; if (prewarmT <= 0) { prewarmT = 1.5; prewarm(cx, cz); }
      ambient.update(dt, cam, playing);
    },
    // ---- road queries for vehicles and AI traffic (net.js; see MODLOG "lived-in world")
    roadAt, roadGraph, roadPoint, roadById,
    clearedAt,
  };
  if (/[?&]debug/.test(location.search)) window.__WORLD = W;
  return W;
}
