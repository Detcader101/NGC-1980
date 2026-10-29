#!/usr/bin/env node
// Marine-only SDF grip profiles: real meshed clearance/contact, finite cache states and LOD identity.
// Default crew/civil/crowd buffer preservation is additionally covered by figurecrowdbench's saved baseline.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';

const threeURL = new URL('../game/vendor/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`));
const THREE = await import('three');
const { marineGeometry, bindPose, attachMarine, setMarineGripProfiles } = await import('../game/js/units/infantry/humanfig.js');
const { BONE_INDEX } = await import('../game/js/units/infantry/figgeo.js');
const { createSkeleton } = await import('../game/js/units/infantry/soldiermodel.js');
const { tpGripFrame } = await import('../game/js/units/infantry/handkit.js');

const options = { face: 2, sleeves: 'rolled', vest: true, helmet: true, pack: false, frags: 0, hands: 'grip' };
const lods = ['hero', 'near', 'mid'];
const profiles = [null, 'tube28', 'tube41'];
const bytes = g => Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (g.index?.array.byteLength || 0);
function digest(g) {
  const h = createHash('sha256');
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name].array; h.update(name); h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  if (g.index) { const a = g.index.array; h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
  return h.digest('hex');
}
const defaults = lods.map(lod => marineGeometry({ ...options, lod }));
const defaultHashes = defaults.map(digest);
for (let i = 0; i < lods.length; i++) {
  assert.equal(marineGeometry({ ...options, lod: lods[i], gripProfiles: { L: null, R: null } }), defaults[i], 'null profiles retain default cache key');
}
assert.equal(tpGripFrame(), tpGripFrame(null), 'default frame identity');
for (const invalid of ['tube27', 'tube41 ', 0.041, {}, ['tube41']]) assert.throws(() => tpGripFrame(invalid), /Unknown TP grip profile/);
for (const lod of lods) {
  const open = marineGeometry({ ...options, lod, hands: 'open' });
  for (const L of profiles) for (const R of profiles) {
    assert.equal(marineGeometry({ ...options, lod, hands: 'open', gripProfiles: { L, R } }), open, 'open profiles canonicalize to the original default cache key');
  }
  for (const hands of ['grip', 'open']) {
    assert.throws(() => marineGeometry({ ...options, lod, hands, gripProfiles: { L: 'invalid-profile' } }), /Unknown TP grip profile/, 'direct geometry API validates before cache construction');
  }
}

const surfaceResults = [];
for (const lod of lods) for (const profile of profiles.slice(1)) {
  const g = marineGeometry({ ...options, lod, gripProfiles: { L: profile, R: profile } });
  const p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const frame = tpGripFrame(profile), tubeRadius = profile === 'tube41' ? 0.039 : 0.026;
  assert.deepEqual(frame.axis, [1, 0, 0]); assert.deepEqual(frame.palm, [0, 0, -1]);
  for (const attr of Object.values(g.attributes)) assert(attr.array.every(Number.isFinite), 'finite profile surface');
  for (const side of ['L', 'R']) {
    const bone = BONE_INDEX['hand' + side], inverse = bindPose()['hand' + side].clone().invert();
    let minimum = Infinity, inside3mm = 0, contacts3mm = 0, vertices = 0;
    const contactBands = new Set();
    for (let i = 0; i < p.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bone) weight += sw.getComponent(i, k);
      if (weight < 0.99) continue;
      const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(inverse);
      if (Math.abs(v.x) > 0.045) continue; // the actual tube runs across the palm's grasp width
      const clearance = Math.hypot(v.y - frame.centre[1], v.z - frame.centre[2]) - tubeRadius;
      minimum = Math.min(minimum, clearance); vertices++;
      if (clearance < -0.003) inside3mm++;
      if (Math.abs(clearance) <= 0.003) { contacts3mm++; contactBands.add(Math.floor((v.x + 0.045) / 0.0225)); }
    }
    assert(vertices > 20, 'test sampled the actual skinned hand surface');
    assert.equal(inside3mm, 0, `${lod}/${profile}/${side}: no deep tube penetration`);
    assert(contacts3mm > 0 && minimum < 0.003, `${lod}/${profile}/${side}: grip contacts tube, not an oversized air gap`);
    assert(contactBands.size >= (lod === 'mid' ? 2 : 4), `${lod}/${profile}/${side}: contact spans the grasp width`);
    surfaceResults.push({ lod, profile, side, vertices, inside3mm, contacts3mm, contactBands: contactBands.size, minimumClearanceMM: +(minimum * 1000).toFixed(3) });
  }
}

// Exercise the production SkinnedMeshes, skeleton binding and LOD objects, not stand-in mesh containers.
defaults.forEach((g, i) => assert.equal(digest(g), defaultHashes[i], 'creating optional cached profiles leaves defaults unchanged'));
const sk = createSkeleton();
const person = attachMarine(sk, { ...options, detail: 'high', seed: 2, weapon: 'M16A1' });
// makeSkinned performs the pre-existing skin-weight normalization when binding. Compare profile setters against
// that bound state so this check measures the optional-profile operation, not construction's rounding changes.
const boundDefaultHashes = defaults.map(digest);
const meshRefs = [...person.meshes], materials = meshRefs.map(m => m.material), skeletons = meshRefs.map(m => m.skeleton);
const bindMatrices = meshRefs.map(m => m.bindMatrix.clone()), levels = [...person.lod.levels];
const originalGeometry = meshRefs.map(m => m.geometry), rootChildren = [...sk.root.children];
const cacheRefs = new Map(), combinations = [];
for (const L of profiles) for (const R of profiles) combinations.push({ L, R });
for (let pass = 0; pass < 4; pass++) for (const request of combinations) {
  const key = JSON.stringify(request);
  setMarineGripProfiles(sk, request);
  assert.equal(setMarineGripProfiles(sk, request), false, 'repeated setter is a no-op');
  if (!cacheRefs.has(key)) cacheRefs.set(key, person.meshes.map(m => m.geometry));
  person.meshes.forEach((m, i) => {
    assert.equal(m, meshRefs[i], 'LOD mesh identity retained');
    assert.equal(m.geometry, cacheRefs.get(key)[i], 'revisiting a profile reuses cached geometry');
    assert.equal(m.material, materials[i], 'material identity retained');
    assert.equal(m.skeleton, skeletons[i], 'skeleton identity retained');
    assert(m.bindMatrix.equals(bindMatrices[i]), 'skeleton binding retained');
    assert.equal(person.lod.levels[i], levels[i], 'LOD level identity retained');
  });
  assert.deepEqual(sk.root.children, rootChildren, 'no renderer/mesh additions');
}
assert.equal(cacheRefs.size, 9, 'two finite optional profiles plus default yield nine hand combinations');
const uniqueGeometries = new Set([...cacheRefs.values()].flat());
assert.equal(uniqueGeometries.size, 27, 'profile cache dimension is bounded to nine combinations at three LODs');
setMarineGripProfiles(sk, {});
person.meshes.forEach((m, i) => assert.equal(m.geometry, originalGeometry[i], 'exact default geometry reference restored'));
for (const invalid of ['tube27', 'tube41 ', 0.041]) {
  assert.throws(() => setMarineGripProfiles(sk, { L: invalid }), /Unknown TP grip profile/);
  person.meshes.forEach((m, i) => assert.equal(m.geometry, originalGeometry[i], 'invalid profile does not mutate geometry'));
}
defaults.forEach((g, i) => assert.equal(digest(g), boundDefaultHashes[i], 'default buffers remain unchanged after all profile combinations'));

const perCombination = Object.fromEntries([...cacheRefs].map(([key, geometries]) => [key, geometries.reduce((n, g) => n + bytes(g), 0)]));
const used = [{ L: 'tube28', R: null }, { L: 'tube41', R: null }, { L: 'tube41', R: 'tube41' }];
const usedBytes = used.reduce((n, p) => n + perCombination[JSON.stringify(p)], 0);
const fullOptionalBytes = [...uniqueGeometries].filter(g => !originalGeometry.includes(g)).reduce((n, g) => n + bytes(g), 0);
console.log(JSON.stringify({ surfaces: surfaceResults, geometryBufferBytes: { perCombination, threeUsedOptionalCombinations: usedBytes, allEightOptionalCombinations: fullOptionalBytes } }, null, 2));
console.log(`PASS ${surfaceResults.length} actual LOD hand surfaces; 9 finite profile combinations reused across 4 cycles; exact geometry/mesh/material/skeleton restoration; ${usedBytes} bytes for three optional high-detail combinations.`);
