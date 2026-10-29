#!/usr/bin/env node
// ngc/look-faces: head / face budgets, the baked head bank and the kneel, in plain Node (timings are relative only).
//   node tools/facebench.mjs     asserts: the bank is current; head and figure triangles stay within the pre-look-faces
//                                numbers (hero 18.8 k / near 4.7 k / crew 2.9 k head; near Marine 22.6 k); every face
//                                decodes; the kneel keeps the rear knee and toes above the ground
import assert from 'node:assert/strict';
import { register } from 'node:module';
globalThis.location = { search: '?rk=figures' };
const threeURL = new URL('../game/vendor/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:${JSON.stringify(threeURL)},shortCircuit:true}:n(s,c);}`));
const HF = await import('../game/js/units/infantry/humanfig.js');
const { HEAD_BANK } = await import('../game/js/units/infantry/headbank.js');
assert.ok(HEAD_BANK && HEAD_BANK.key === HF.headKey(), 'head bank is stale: run node tools/facebake.mjs');
const LIMIT = { hero: 18840, near: 4668, crew: 2860 }, FIG = { hero: 75912, near: 22620, crew: 14600 };
const NF = HF.FACES.length, rows = [];
for (const lod of ['hero', 'near', 'crew', 'mid', 'crowd', 'far']) {
  for (let f = 0; f < NF; f++) {
    const t0 = performance.now(), hs = HF.headSurfaceFor(f, lod, null), t1 = performance.now();
    const g = HF.marineGeometry({ lod, face: f, helmet: true, vest: true, sleeves: 'down', hands: 'grip', frags: 0, camo: 'og107' });
    if (LIMIT[lod]) assert.ok(hs.tris <= LIMIT[lod] + 40, `${lod} face ${f}: head ${hs.tris} > ${LIMIT[lod]}`);
    if (FIG[lod]) assert.ok(g.userData.tris <= FIG[lod], `${lod} face ${f}: Marine ${g.userData.tris} > ${FIG[lod]}`);
    rows.push({ lod, face: f, headTris: hs.tris, headMs: Math.round(t1 - t0), marineTris: g.userData.tris });
  }
}
console.table(rows);
// the kneel: crew pose baked; the lowest vertex sits at the floor (the knee / toes), not below it
const g = HF.bakedPerson(HF.personGeometry('marine', { lod: 'crew', hands: 'grip' }), HF.crewPose('kneel').pose, HF.crewPose('kneel').pelvis);
g.computeBoundingBox(); const minY = g.boundingBox.min.y;
assert.ok(minY > -0.03 && minY < 0.04, `kneel: lowest point ${minY.toFixed(3)} m (expected on the floor)`);
console.log(`PASS facebench: bank current, ${NF} faces x 6 LODs within budget, kneel lowest point ${minY.toFixed(3)} m`);
