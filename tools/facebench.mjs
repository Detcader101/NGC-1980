#!/usr/bin/env node
// ngc/look-faces: head / face budgets and build times in plain Node (relative timings only).
//   node tools/facebench.mjs            per LOD: head surface triangles, whole person triangles, build ms
import { register } from 'node:module';
globalThis.location = { search: '?rk=figures' };
const threeURL = new URL('../game/vendor/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:${JSON.stringify(threeURL)},shortCircuit:true}:n(s,c);}`));
const HF = await import('../game/js/units/infantry/humanfig.js');
const NF = HF.FACES.length, rows = [];
for (const lod of ['hero', 'near', 'crew', 'mid', 'crowd', 'far']) {
  for (let f = 0; f < NF; f++) {
    const t0 = performance.now();
    const hs = HF.headSurfaceFor ? HF.headSurfaceFor(f, lod, null) : null;
    const t1 = performance.now();
    const g = HF.marineGeometry({ lod, face: f, helmet: true, vest: true, sleeves: 'down', hands: 'grip', frags: 0, camo: 'og107' });
    const t2 = performance.now();
    const gb = HF.marineGeometry({ lod, face: f, helmet: false, vest: false, sleeves: 'rolled', hands: 'open', frags: 0 });
    rows.push({ lod, face: f, headTris: hs ? hs.tris : '-', headMs: Math.round(t1 - t0), marineTris: g.userData.tris, bareTris: gb.userData.tris, marineMs: Math.round(t2 - t1) });
  }
}
console.table(rows);
