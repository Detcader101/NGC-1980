#!/usr/bin/env node
// Actual model geometry and moving surfaces, using the browser's pinned THREE build. No GPU/browser required.
import assert from 'node:assert/strict';
import { register } from 'node:module';
const threeURL = new URL('../game/vendor/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:${JSON.stringify(threeURL)},shortCircuit:true}:n(s,c);}`));
const noop = () => {};
const ctx = new Proxy({}, { get: (o, k) => k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : /Gradient|Pattern/.test(k) ? () => ({ addColorStop: noop }) : o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) };
const THREE = await import(threeURL);
const { buildCarrier, buildBattleship, buildFreighter, addLiftFans } = await import('../game/js/ships.js');
const { createDefence } = await import('../game/js/units/defence/brain.js');
const { LCM8, lcmDeck, buildLCM8Mesh } = await import('../game/js/units/armor/lcm8.js');
const { buildLCM8Mesh: buildTruckLCM } = await import('../game/js/units/wheeled/lcm8model.js');
const { buildLCAC, LCAC } = await import('../game/js/units/groundwar/lcacmodel.js');
const { SHIPS, makeSea, createShipMotion } = await import('../game/js/units/naval/seamotion.js');
const { M60A3 } = await import('../game/js/units/armor/m60a3.js');
const { M35 } = await import('../game/js/units/wheeled/m35.js');
let n = 0;
function test(name, fn) { fn(); n++; console.log(`PASS ${name}`); }
function close(a, b, eps = 1e-4) { assert.ok(Math.abs(a - b) < eps, `${a} differs from ${b}`); }
function top(mesh, x, z) {
  mesh.updateMatrixWorld(true);
  const r = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
  const hits = r.intersectObject(mesh, true);
  assert.ok(hits.length, `visible surface at ${x}, ${z}`);
  return hits[0].point.y;
}
const ships = { albatross: buildCarrier(1), kraken: buildCarrier(2), leviathan: buildBattleship(), container: buildFreighter() };
const defence = createDefence({ scene: new THREE.Scene() });
for (const [name, p] of Object.entries(ships)) {
  test(`${name}: seagoing model has finite geometry and sea-state motion`, () => {
    const b = new THREE.Box3().setFromObject(p.group), size = b.getSize(new THREE.Vector3());
    assert.ok([size.x, size.y, size.z].every(Number.isFinite) && size.z > p.dims.L * 0.8);
    const calm = createShipMotion(SHIPS[name], makeSea(0, 0, 3), 3), rough = createShipMotion(SHIPS[name], makeSea(4, Math.PI, 3), 3);
    let motion = 0;
    for (let i = 0; i < 600; i++) { calm.step(1 / 30, 0, 0, 0); rough.step(1 / 30, 4, 0, 0); motion = Math.max(motion, Math.abs(rough.heave), Math.abs(rough.pitch)); }
    close(calm.heave, 0); close(calm.pitch, 0); assert.ok(motion > 0.01);
  });
  test(`${name}: active defence refit replaces placeholder mounts`, () => {
    const old = [...p.guns];
    if (name === 'albatross') defence.refitCarrier(p, 1); else defence.refitShip(p, 2);
    assert.ok(p.guns.length > 0 && old.every(g => !g.parent));
    assert.ok(p.guns.every(g => g.parent === p.group && g.userData.defType));
    const types = new Set(p.guns.map(g => g.userData.defType));
    if (name === 'albatross') assert.deepEqual(types, new Set(['ciws', 'sparrow']));
    if (name === 'container') assert.deepEqual(types, new Set(['talonm']));
    if (name === 'leviathan' || name === 'kraken') assert.deepEqual(types, new Set(['talonm', 'lancem']));
  });
}
test('ALBATROSS: empty port lift carries its collision surface in both directions', () => {
  const p = ships.albatross, L = p.lifts[2], up = p.localDeck(L.cx, L.cz);
  p.lift(2, 'down'); for (let i = 0; i < 360; i++) p.tick(1 / 30, i / 30, 1000);
  assert.ok(p.localDeck(L.cx, L.cz) < up - 3); close(L.grp.position.y, p.localDeck(L.cx, L.cz));
  p.lift(2, 'up'); for (let i = 0; i < 360; i++) p.tick(1 / 30, i / 30, 1000);
  close(p.localDeck(L.cx, L.cz), up);
  p.setJBD(1, 0.1); assert.ok(p.jbd.rotation.x < 0 && p.jbdK < 0.1); p.setJBD(0); close(p.jbd.rotation.x, 0);
});
test('KRAKEN: broad carrier bow differs from ALBATROSS and has aft island', () => {
  assert.ok(ships.kraken.localDeck(7, -64) > 0 && ships.albatross.localDeck(7, -64) < -1e8);
  assert.ok(ships.kraken.tower.position.z > ships.albatross.tower.position.z + 10);
});
test('LEVIATHAN: three independent rail cradles show recoil and recover', () => {
  const p = ships.leviathan; assert.equal(p.turrets.length, 3);
  const a = p.turrets[0].userData, b = p.turrets[1].userData, rest = a.barrels.position.z;
  a.fire(); assert.ok(a.barrels.position.z > rest + 1 && b.heat === 0);
  for (let i = 0; i < 300; i++) p.tick(1 / 30);
  close(a.barrels.position.z, rest, 1e-5); assert.equal(a.heat, 0);
});
test('container feeder: roof and forecastle support match visible triangles', () => {
  const p = ships.container;
  for (const [x, z] of [[3, -30.3], [-4, -31], [6, -30.3], [1.2, -34.5], [-1.5, -37.5], [6.7, -18]])
    close(p.localDeck(x, z), top(p.hull, x, z));
  assert.ok(p.localDeck(6.3, -30.3) < p.localDeck(6, -30.3), 'no invisible roof ledge beyond visible edge');
  assert.ok(p.localDeck(20, -30) < -1e8 && p.localDeck(0, 45) < -1e8, 'water outside hull has no deck');
  assert.equal(p.fx.smoke, 0, 'battery feeder has no exhaust funnel');
});
test('SKY CARRIER: four fan outriggers unfold outboard and rotate independently', () => {
  const p = ships.albatross; addLiftFans(p); assert.equal(p.fans.length, 4);
  assert.ok(p.fans.every(f => !f.arm.visible));
  for (const f of p.fans) { f.arm.visible = true; f.arm.scale.setScalar(1); f.rotor.rotation.y += 0.5; }
  p.group.updateMatrixWorld(true);
  assert.ok(p.fans.every(f => Math.abs(f.rotor.getWorldPosition(new THREE.Vector3()).x) > p.dims.W / 2));
  assert.equal(new Set(p.fans.map(f => f.rotor)).size, 4);
});
test('LCM-8 armour variant: pilothouse roof, open cargo well and lowering ramp', () => {
  const p = buildLCM8Mesh();
  close(lcmDeck(1.0, 5.6, LCM8.RAMP.up), top(p.group, 1.0, 5.6));
  close(lcmDeck(0.2, -3.2, LCM8.RAMP.up), LCM8.WELL.y);
  const tip = () => p.ramp.localToWorld(new THREE.Vector3(0, 0, -LCM8.RAMP.len));
  p.animate({ ramp: LCM8.RAMP.up }); p.group.updateMatrixWorld(true); const raised = tip();
  p.animate({ ramp: LCM8.RAMP.down }); p.group.updateMatrixWorld(true); const lowered = tip();
  assert.ok(lowered.y < raised.y - 3 && lowered.z < raised.z - 2, 'ramp reaches down and forward');
  const z = LCM8.WELL.z0 - Math.cos(LCM8.RAMP.down) * 1.5;
  assert.ok(lcmDeck(0, z, LCM8.RAMP.down) < LCM8.WELL.y && lcmDeck(0, z, LCM8.RAMP.up) < -1e8);
  assert.ok(M60A3.MASS < 60000 && M60A3.DIM.WIDTH < 2 * LCM8.WELL.x && M60A3.DIM.HULL_L < LCM8.WELL.z1 - LCM8.WELL.z0, 'one M60 fits the cargo role');
});
test('LCM-8 truck variant: same boat scale and forward-opening ramp for M35 cargo', () => {
  const p = buildTruckLCM(), b = new THREE.Box3().setFromObject(p.group).getSize(new THREE.Vector3());
  assert.ok(Math.abs(p.L - LCM8.L) < 0.1 && Math.abs(p.W - LCM8.B) < 0.1 && b.z > 20);
  p.group.updateMatrixWorld(true); const a = p.ramp.localToWorld(new THREE.Vector3(0, 2, 0));
  p.ramp.rotation.x = -1.32; p.group.updateMatrixWorld(true); const b2 = p.ramp.localToWorld(new THREE.Vector3(0, 2, 0));
  assert.ok(b2.z < a.z - 1.5 && b2.y < a.y - 1, 'vertical bow gate opens toward the beach');
  assert.ok(M35.mass < 10000 && M35.dims.W < LCM8.WELL.x * 2, 'truck fits the LCM cargo role');
});
test('seized LCAC: twin air propellers animate and bow ramp reaches ground ahead', () => {
  const p = buildLCAC(); assert.equal(p.props.length, 2);
  p.animate({ ramp: 0, prop: 0, lift: 1 }, 0); p.group.updateMatrixWorld(true);
  const a = p.ramp.localToWorld(new THREE.Vector3(0, 0, -LCAC.RAMP_L));
  p.animate({ ramp: 1, prop: 0.5, lift: 1 }, 0.5); p.group.updateMatrixWorld(true);
  const b = p.ramp.localToWorld(new THREE.Vector3(0, 0, -LCAC.RAMP_L));
  assert.ok(p.props.every(prop => prop.rotation.z > 0) && p.props[0] !== p.props[1]);
  assert.ok(b.z < a.z - 2 && b.y < 0.1, 'opened ramp reaches ground ahead of the skirt');
});
console.log(`${n} naval identity/geometry checks passed`);
