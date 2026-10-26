#!/usr/bin/env node
// Model/feedback regressions for each active air-defence unit. Gameplay units and cooldowns, not weapon validation.
import assert from 'node:assert/strict';
import { register } from 'node:module';
const threeURL = new URL('../game/vendor/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:${JSON.stringify(threeURL)},shortCircuit:true}:n(s,c);}`));
const THREE = await import(threeURL);
const { createDefence } = await import('../game/js/units/defence/brain.js');
const { buildDefence } = await import('../game/js/units/defence/models.js');
const { DEF } = await import('../game/js/units/defence/tune.js');
// Seed visual variation and initial search/cooldown phases so this never depends on the process RNG.
let seed = 1980; const random = Math.random;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
let n = 0;
try {
  for (const type of Object.keys(DEF)) {
    const scene = new THREE.Scene(), mesh = buildDefence(type, DEF[type].side), shots = [];
    const target = { id: 'practice-drone', p: new THREE.Vector3(0, 20, DEF[type].msl ? -100 : -35), v: new THREE.Vector3(), hp: 1e9, r: 5 };
    let t = 0, ridge = false;
    const def = createDefence({ scene, time: () => t, terrainH: (x, z) => ridge && z < -20 && z > -30 ? 100 : 0,
      shoot: (...a) => shots.push(a), damage: () => {}, player: () => null });
    scene.add(mesh); const unit = { mesh, side: DEF[type].side, x: 0, y: 0, z: 0 }; def.attach(unit, { terrain: false });
    const D = unit.def, ud = mesh.userData, states = new Set(), hidden = new Set();
    let highSpin = 0, chargeLine = false, onBeam = false, hotRadiator = false;
    function step(foes, seconds) {
      for (let i = 0; i < Math.round(seconds * 30); i++) {
        t += 1 / 30; def.update(unit, 1 / 30, foes); def.tick(1 / 30);
        highSpin = Math.max(highSpin, D.spin); states.add(D.beam?.st || D.mode);
        if (ud.cells) for (let k = 0; k < ud.cells.length; k++) if (!ud.cells[k].cover.visible) hidden.add(k);
        if (D.beam) { chargeLine ||= D.beam.st === 'charge' && D.beam.line.visible; onBeam ||= D.beam.st === 'on' && D.beam.g.visible; hotRadiator ||= D.beam.st === 'cool' && ud.finM.color.r > 0.5; }
      }
    }
    const searchStart = ud.radar?.rotation.y ?? 0;
    step([], 2);
    assert.equal(shots.length, 0); assert.equal(def.missiles.length, 0);
    assert.equal(D.lockT, 0); assert.equal(D.spin, 0);
    if (ud.radar) assert.ok(Math.abs(ud.radar.rotation.y - searchStart) > 0.1, `${type}: search radar animates`);
    step([target], 20);
    assert.ok(D.lockT > 0 && D.tgt, `${type}: transitions out of search`);
    assert.ok([D.yaw, D.pitch, D.err].every(Number.isFinite), `${type}: finite articulation`);
    if (D.T.gun) assert.ok(shots.length > 0, `${type}: visible game projectile events`);
    if (D.T.spin) assert.ok(highSpin > 0.7 && ud.spin[0].rotation.z > 1, `${type}: rotary cluster spins through its tell`);
    if (type === 'vads') assert.equal(ud.radar, null, 'range-only VADS pod is not a spinning search dish');
    if (type === 'shilka') assert.equal(ud.muzzles.length, 4, 'Shilka retains four separated barrels');
    if (type === 'ciws') assert.match(DEF[type].name, /PHALANX.*Block 0/, '1980 carrier fit is identifiable');
    if (D.T.msl) {
      const capacity = type === 'sparrow' ? 8 : 12;
      assert.equal(ud.cells.length, capacity);
      // Run the actual bank to empty: all covers must open, including cells beyond the first salvo.
      for (let i = 0; i < 1000 && hidden.size < capacity; i++) step([target], 0.5);
      assert.equal(hidden.size, capacity, `${type}: every visible cell is used before bank reset`);
      assert.equal(ud.cells.filter(c => !c.cover.visible).length, capacity, `${type}: empty bank remains visible during cooldown`);
      step([], D.T.msl.reload + 2);
      assert.ok(ud.cells.every(c => c.cover.visible), `${type}: empty bank replenishes on ordinary cooldown`);
      assert.equal(D.cellsSpent, 0);
      if (type !== 'sparrow') assert.equal(ud.muzzles.length, 4, 'TALON retains twin gun pairs beside its twelve tubes');
    }
    if (D.T.beam) {
      assert.ok(states.has('charge') && states.has('on') && states.has('cool'), `${type}: charge / beam / cooldown cycle`);
      assert.ok(chargeLine && onBeam && hotRadiator, `${type}: visible telegraph, beam and cooling feedback`);
      assert.equal(ud.vents.length, 7, 'LANCE has radiator bank rather than a missile rack');
    }
    ridge = true; step([target], 6);
    assert.equal(D.lockT, 0, `${type}: opaque terrain clears tracking`);
    const settled = shots.length; step([target], 2);
    assert.equal(shots.length, settled, `${type}: blocked target produces no new gun events`);
    if (D.T.beam) assert.notEqual(D.beam.st, 'on', `${type}: no beam persists behind terrain`);
    def.reset(); assert.equal(def.units.size, 0);
    console.log(`PASS ${type}: ${DEF[type].name}; search, distinct role feedback, terrain break${D.T.msl ? ', full visible cell bank and replenishment' : ''}`); n++;
  }
} finally { Math.random = random; }
console.log(`${n} defence unit regressions passed`);
