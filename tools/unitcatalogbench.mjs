#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadUnitCases, selectCases, validateCases } from './unit-catalog.mjs';
import { fixtureDigest, summarizeFrames } from './evidence.mjs';
import { FLEET_TYPES } from '../game/js/units/commander/fleet.js';
import { WHEELED_IDS } from '../game/js/units/wheeled/index.js';
import { DEF } from '../game/js/units/defence/tune.js';

const cases = await loadUnitCases();
let checks = 0;
const check = (name, run) => { run(); checks++; console.log('PASS ' + name); };
check('every selectable fleet unit has a rendered case', () => {
  const alias = { heli: 'huey', jet: 'hornet' };
  for (const unit of FLEET_TYPES) assert.ok(cases.some(entry => entry.id === (alias[unit.id] || unit.id)), 'missing fleet unit ' + unit.id);
});
check('active non-fleet roles and distinct models are covered', () => {
  for (const id of ['c130', 'paratrooper', 'mv22', 'wasp', 'shrike', 'reaper', 'shahed', 'landrover', 'hilux', 'beetle', 'lada', 'rw1', 'rw7', 'm1a2', 't90m',
    'naval-albatross', 'naval-kraken', 'naval-leviathan', 'naval-container', 'naval-sky', 'naval-lcm8-armor', 'naval-lcm8-truck', 'naval-lcac',
    ...['vads', 'shilka', 'ciws', 'sparrow', 'talon', 'talonm', 'lance', 'lancem'].map(kind => 'defence-' + kind),
    ...['human', 'runaway'].flatMap(side => ['hq', 'fuel', 'factory', 'radar'].map(kind => `${side}-${kind}`))]) {
    assert.ok(cases.some(entry => entry.id === id), 'missing active role ' + id);
  }
});
check('vehicle and defence registries cannot silently gain an untested unit', () => {
  for (const id of WHEELED_IDS) assert.ok(cases.some(entry => entry.id === id), 'missing wheeled vehicle ' + id);
  for (const id of Object.keys(DEF)) assert.ok(cases.some(entry => entry.id === 'defence-' + id), 'missing defence ' + id);
});
check('selection retains catalog order and rejects typos and empty intersections', () => {
  assert.deepEqual(selectCases(cases, { units: ['m35', 'huey'] }).map(entry => entry.id), ['huey', 'm35']);
  assert.ok(selectCases(cases, { category: 'naval' }).every(entry => entry.category === 'naval'));
  assert.throws(() => selectCases(cases, { units: ['heuy'] }), /Unknown unit/);
  assert.throws(() => selectCases(cases, { category: 'aire' }), /Unknown category/);
  assert.throws(() => selectCases(cases, { units: ['m35'], category: 'air' }), /No units/);
});
check('duplicate IDs and missing executable cases fail validation', () => {
  assert.throws(() => validateCases([...cases, cases[0]]), /duplicate/);
  assert.throws(() => validateCases([{ ...cases[0], run: undefined }]), /Incomplete/);
});
check('preview renderer without CPU profiling records unavailable costs, never zero', () => {
  const result = summarizeFrames([{ ms: 20, sim: null, prep: null, render: null, calls: 12 }]);
  assert.deepEqual(result.cpuMs, { sim: null, prep: null, renderSubmit: null }); assert.equal(result.drawCalls.mean, 12);
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-fixture-'));
try {
  check('changing imported fixture invalidates comparison fingerprint', () => {
    const scene = path.join(tmp, 'scene.mjs'), imported = path.join(tmp, 'case.mjs');
    fs.writeFileSync(scene, 'dispatch'); fs.writeFileSync(imported, 'setup A');
    const before = fixtureDigest(scene, [imported]); fs.writeFileSync(imported, 'setup B');
    assert.notEqual(before, fixtureDigest(scene, [imported]));
  });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`${checks}/${checks} catalog checks passed; ${cases.length} distinct unit fixtures`);
