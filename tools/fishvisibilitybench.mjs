// Natural swimmer/diver population regressions. No renderer, forced schools, or increased
// budgets in the population scenarios. Browser fish-only pixel evidence is a separate test.
// Run: node tools/fishvisibilitybench.mjs
import assert from 'node:assert/strict';
import { createFishSim, SPECIES, QUALITY, SUB, subOffset } from '../game/js/units/naval/fishsim.js';
import { underwaterVisibility } from '../game/js/units/naval/seavisibility.js';
import { islandH } from '../game/js/world.js';

let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
const DT = 0.1;
const makeBuffers = () => Object.fromEntries(['school', 'fish', 'dolphin', 'ray', 'jelly'].map(k => [k,
  { n: 0, max: 1200, ...Object.fromEntries(['A', 'B', 'C', 'D'].map(a => [a, new Float32Array(4800)])) }]));
const records = out => Object.values(out).reduce((n, b) => n + b.n, 0);
const viewAt = cam => ({ ...cam, fx: 1, fy: 0, fz: 0, cos: 0.45, px: 590 });
const capacity = (S, quality) => {
  assert(S.schools.length <= QUALITY[quality].MAX_SCHOOLS, 'school cap');
  assert(S.nFish <= QUALITY[quality].MAX_FISH, 'boid cap');
  assert.equal(S.nFish, S.schools.reduce((n, s) => n + s.n, 0), 'accounting');
  for (let i = 0; i < SPECIES.length; i++) assert(S.schools.filter(s => s.sp === i).length <= SPECIES[i].max, SPECIES[i].key + ' cap');
};

test('visibility is finite, weather/depth aware, and reuses an optional output object', () => {
  assert.deepEqual(underwaterVisibility(), { near: 4, far: 60, bodyRange: 72 });
  const out = {};
  assert.equal(underwaterVisibility(4, 3, out), out);
  assert.equal(out.far, 58.65);
  assert.deepEqual(underwaterVisibility(-8, -5), underwaterVisibility(0, 0));
  assert.deepEqual(underwaterVisibility(99, 0), underwaterVisibility(7, 0));
  for (const invalid of [NaN, Infinity, -Infinity, null, '4']) assert.deepEqual(underwaterVisibility(invalid, invalid), underwaterVisibility());
  for (const sea of [0, 4, 7]) for (const depth of [0, 4, 1000, Number.MAX_VALUE]) {
    const v = underwaterVisibility(sea, depth);
    assert(Object.values(v).every(Number.isFinite));
    assert(v.far >= 34 && v.bodyRange > v.far && v.near < v.far);
  }
  assert(underwaterVisibility(7, 8).far < underwaterVisibility(0, 1).far);
});

test('packed school instances reproduce CPU sub-fish centers with distinct stable variation', () => {
  const S = createFishSim({ depthAt: () => -15, seed: 41 }); S.autoSpawn = false;
  const sc = S.spawnSchool('mackerel', 12, 0), out = makeBuffers();
  for (let i = 0; i < 20; i++) S.update(0.05, { x: 0, y: 10, z: 0 });
  S.write(out);
  const b = out.school, seeds = new Set();
  assert.equal(b.n, sc.n);
  for (let i = 0; i < b.n; i++) {
    const j = i * 4, yaw = b.B[j], pitch = -b.B[j + 1], spread = b.A[j + 3] * (1 + 0.6 * b.D[j + 1]);
    seeds.add(b.D[j + 2]);
    for (let k = 0; k < SUB; k++) {
      // Reconstruct the shader's sub-fish center using only submitted instance records.
      // Compare against the CPU position helper, which reads the simulation directly.
      const so = subOffset(b.D[j + 2], k), x = so[0] * spread, y = so[1] * spread, z = so[2] * spread;
      const py = Math.cos(pitch) * y - Math.sin(pitch) * z, pz = Math.sin(pitch) * y + Math.cos(pitch) * z;
      const p = [b.A[j] + Math.cos(yaw) * x + Math.sin(yaw) * pz, b.A[j + 1] + py,
        b.A[j + 2] - Math.sin(yaw) * x + Math.cos(yaw) * pz];
      const expected = S.drawnPos(sc, i, k);
      assert(Math.hypot(...p.map((v, axis) => v - expected[axis])) < 1e-6, `packed sub-fish ${i}/${k} center`);
    }
  }
  assert(seeds.size > sc.n * 0.9, 'schools retain each boid’s variation instead of reusing a zero seed');
  const before = [...seeds]; S.write(out);
  assert.deepEqual(Array.from({ length: b.n }, (_, i) => b.D[i * 4 + 2]), before, 'drawing again keeps stable variation');
});

test('packed airborne flags follow natural mullet leaps and clear on landing', () => {
  const S = createFishSim({ depthAt: x => Math.max(-14, Math.min(6, -x / 12)), seed: 37 }); S.autoSpawn = false;
  S.spawnSchool('mullet', 30, 0);
  const cam = { x: 30, y: 4, z: 0 }, out = makeBuffers();
  let bowZ = -60, airFrames = 0, landings = 0;
  const airborne = new Set();
  for (let i = 0; i < 600; i++) {
    bowZ += 4 / 30; S.clearThreats(); S.hull(30, bowZ, Math.PI, 5, 1.6, 0.6, 4);
    S.update(1 / 30, cam); S.write(out);
    const fish = S.fish(); assert.equal(out.fish.n, fish.length);
    for (let k = 0; k < fish.length; k++) {
      const air = fish[k].air > 0;
      assert.equal(out.fish.D[k * 4 + 3], air ? 1 : 0, 'packed airborne state');
      if (air) { airFrames++; airborne.add(k); }
      else if (airborne.delete(k)) landings++;
    }
  }
  assert(airFrames > 0 && landings > 0, 'exercise both leap and return to water');
});

// Populate an aerial/ship scene first; keep those anchors when the infantry enters the
// sea. This reproduces remote schools retaining the whole budget, with no debug spawning.
function naturalEntry({ quality = 'medium', seed = 1980, depthAt = () => -6.2, x = 0, z = 0, eye = -2.8, seconds = 14, moving = false } = {}) {
  const S = createFishSim({ depthAt, seed }); S.setQuality(quality); S.sea = 4 / 7;
  const cam = { x, y: 80, z }, airView = { fx: 0.93675, fy: -0.35, fz: 0, cos: 0.45 };
  const anchors = () => { S.clearThreats(); S.anchor(x + 160, z); S.anchor(x + 230, z - 75); S.anchor(x + 230, z + 75); };
  for (let i = 0; i < 160; i++) { anchors(); S.update(DT, cam, airView); capacity(S, quality); }
  const initial = { slots: S.schools.length, fish: S.nFish, near: S.schools.filter(s => Math.hypot(s.cx - x, s.cz - z) < 30).length };
  const oldIds = new Set(S.schools.map(s => s.id)), retirees = new Map();
  let fadingIn = 0, anchoredRetiree = false, nearby = 0, drawable = 0;
  const out = makeBuffers();
  cam.y = eye;
  for (let i = 0; i < seconds / DT; i++) {
    anchors();
    if (moving) { cam.x += 0.09; cam.z += Math.sin(i * 0.05) * 0.03; }
    S.point(cam.x, cam.y - 1.02, cam.z, 4.5, 0.65, moving ? 0.9 : 0, 0, 2.5, { swim: true, w: 0.7 });
    const view = viewAt(cam);
    S.update(DT, cam, view); capacity(S, quality);
    for (const sc of S.schools) {
      assert(Number.isFinite(sc.fade) && sc.fade >= 0 && sc.fade <= 1, 'finite fade');
      if (!oldIds.has(sc.id) && sc.fade < 0.5) {
        fadingIn++;
        const depth = -S.bed(sc.hx, sc.hz), sp = SPECIES[sc.sp];
        assert(depth >= sp.water[0] && depth <= sp.water[1], 'natural spawn habitat');
      }
      if (sc.retiring) {
        const oldFade = retirees.get(sc.id);
        if (oldFade !== undefined) assert(sc.fade <= oldFade, 'anchor must not revive a retiring school');
        retirees.set(sc.id, sc.fade);
        if (oldIds.has(sc.id) && S.anchorW(sc.cx, sc.cz) > 0) anchoredRetiree = true;
      }
      if (i % 10 === 0) assert(sc.a.every(Number.isFinite), 'finite fish state through transition');
    }
    if (i > seconds / DT - 20) {
      nearby = Math.max(nearby, S.schools.filter(sc => !sc.leave && sc.fade > 0.5 && Math.hypot(sc.cx - cam.x, sc.cy - cam.y, sc.cz - cam.z) < 30).length);
      S.write(out, view);
      let closeBodies = 0;
      for (const b of Object.values(out)) for (let j = 0; j < b.n * 4; j += 4) {
        if (b.C[j + 2] > 0.5 && Math.hypot(b.A[j] - cam.x, b.A[j + 1] - cam.y, b.A[j + 2] - cam.z) < 30) closeBodies++;
      }
      drawable = Math.max(drawable, closeBodies);
    }
  }
  return { S, cam, initial, nearby, drawable, fadingIn, anchoredRetiree, retirees };
}

for (const quality of ['low', 'medium', 'high']) for (const seed of [1, 7, 1980]) {
  test(`${quality} seed ${seed}: a natural full aerial/ship population refills around the diver`, () => {
    // At 6 m the habitat-valid species caps total only 21 schools; deeper water can
    // naturally occupy all 24 HIGH slots without changing any population limits.
    const R = naturalEntry({ quality, seed, depthAt: () => quality === 'high' ? -15 : -6.2 });
    assert(R.initial.slots === QUALITY[quality].MAX_SCHOOLS || R.initial.fish > QUALITY[quality].MAX_FISH * 0.9, 'begin with school or fish budget filled');
    assert.equal(R.initial.near, 0, 'no conveniently pre-existing nearby school');
    assert(R.nearby >= (quality === 'low' ? 2 : 3), `${R.nearby} close schools`);
    assert(R.drawable > 0, 'nearby bodies pass actual camera/size/water-path culling');
    assert(R.fadingIn > 0, 'new nearby schools fade in');
    assert(R.anchoredRetiree, 'a distant anchored school relinquishes capacity');
    assert([...R.retirees.keys()].some(id => !R.S.schools.some(s => s.id === id)), 'retired schools finish fading and release their slot');
  });
}

for (const quality of ['low', 'medium']) {
  test(`${quality}: surface swimmer sees naturally populated water before diving`, () => {
    const R = naturalEntry({ quality, eye: 0.32 });
    assert(R.nearby >= 2 && R.drawable > 0, `${R.nearby} near schools / ${R.drawable} drawable bodies`);
  });
  test(`${quality}: a moving diver over 15 m water keeps fish near the view within the same caps`, () => {
    const R = naturalEntry({ quality, depthAt: () => -15, moving: true, seconds: 18 });
    assert(R.nearby >= 2 && R.drawable > 0, `${R.nearby} near schools / ${R.drawable} drawable bodies`);
  });
}

test('HOME east shelf: ordinary seed 1980 / sea 4 has nearby drawable fish after an infantry dive', () => {
  const R = naturalEntry({ depthAt: islandH, x: -530, z: 720 });
  assert(R.nearby >= 2 && R.drawable > 0, `${R.nearby} near schools / ${R.drawable} drawable bodies`);
});

test('the same natural input history reproduces fish state and nearby population', () => {
  const a = naturalEntry({ quality: 'low', seconds: 8 }), b = naturalEntry({ quality: 'low', seconds: 8 });
  assert.equal(a.S.hash(), b.S.hash());
  assert.deepEqual(a.S.schools.map(s => [s.sp, s.fade, s.retiring]), b.S.schools.map(s => [s.sp, s.fade, s.retiring]));
});

// Isolated drawing checks may construct a single school: these test body culling, not
// natural population. Both camera-local depth and the actual wave-side matter.
test('submerged bodies beyond the former 40 m cutoff remain until shared fog hides them', () => {
  const S = createFishSim({ depthAt: () => -15, seed: 27 }); S.sea = 4 / 7; S.autoSpawn = false;
  S.spawnSchool('mackerel', 52, 0);
  const out = makeBuffers(), view = viewAt({ x: 0, y: -2.8, z: 0 });
  S.write(out, view); assert(records(out) > 0);
  view.x = -45; S.write(out, view); assert.equal(records(out), 0, 'bodies beyond fog plus margin are culled');
});

test('body culling uses depth below the live camera surface, including a crest above sea level', () => {
  let surface = 0;
  const S = createFishSim({ depthAt: () => -40, seed: 29, surf: (x, z, out) => { out.e = surface; out.sx = out.sz = 0; } });
  S.sea = 4 / 7; S.autoSpawn = false;
  S.spawnSchool('mackerel', 60, 0);
  const out = makeBuffers(), view = viewAt({ x: 0, y: 0.2, z: 0 });
  surface = 1; S.write(out, view); assert(records(out) > 0, 'positive-y camera under a crest uses underwater draw range');
  // An exaggerated deterministic surface isolates depth from mean camera height. The
  // profile floor makes all these 60 m bodies disappear once the camera is deep enough.
  surface = 80; S.write(out, view); assert.equal(records(out), 0, 'wave-relative depth reduces range');
});

test('Off never repopulates or submits fish, and re-enable naturally recovers', () => {
  const S = createFishSim({ depthAt: () => -6, seed: 35 }); S.setQuality('low');
  const cam = { x: 0, y: -2.8, z: 0 }, view = viewAt(cam), out = makeBuffers();
  for (let i = 0; i < 40; i++) S.update(DT, cam, view);
  assert(S.schools.length > 0);
  S.enabled = false;
  S.write(out, view); assert.equal(records(out), 0, 'disabled draw cannot leak the previous population');
  S.clear(); const before = S.stats.spawned;
  for (let i = 0; i < 80; i++) { S.point(0, -3.8, 0, 4.5, 0.65, 0, 0, 2.5, { swim: true }); S.update(DT, cam, view); S.clearThreats(); }
  assert.equal(S.schools.length, 0); assert.equal(S.stats.spawned, before);
  S.enabled = true;
  for (let i = 0; i < 60; i++) S.update(DT, cam, view);
  S.write(out, view); assert(records(out) > 0);
  capacity(S, 'low');
});

console.log(`\n${passed} swimmer visibility checks passed (simulation/culling only; no pixel or FPS claim).`);
