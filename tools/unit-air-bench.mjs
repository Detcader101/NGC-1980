#!/usr/bin/env node
// Fast role regressions for the ten active air units. These exercise the actual flight models and geometry,
// not real-aircraft certification. See the larger *bench.mjs suites for performance envelopes and whole sorties.
// node tools/unit-air-bench.mjs [--unit=reaper] [--json=/absolute/results.json]
import { writeFileSync } from 'node:fs';
import * as H from './hueypilot.mjs'; // installs the repo's Three resolver
import { DT, sea, run } from './rotarykit.mjs';
const { createJetSim } = await import('../game/js/jetfm.js');
const { createTomcatSim } = await import('../game/js/units/air/tomcatfm.js');
const { createC130Sim } = await import('../game/js/units/air/c130fm.js');
const RW = await import('../game/js/units/air/rwfm.js');
const { createCH46Sim, CH46 } = await import('../game/js/units/air/rotary/ch46fm.js');
const { createMV22Sim, MV22 } = await import('../game/js/units/air/rotary/mv22fm.js');
const { createWaspSim } = await import('../game/js/units/air/rotary/waspfm.js');
const { createPilot, stateOf } = await import('../game/js/units/air/rotary/pilot.js');
const { createTiltPilot } = await import('../game/js/units/air/rotary/tiltpilot.js');
const { WASP_PILOT } = await import('../game/js/units/air/rotary/waspai.js');
// Decal paint is irrelevant to transform tests; actual canvas appearance is covered by browser captures.
const ctx = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}, set: (t, k, v) => (t[k] = v, true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const { buildReaperModel, buildShahedModel } = await import('../game/js/units/air/rwmodel.js');
const rows = [], only = process.argv.find(a => a.startsWith('--unit='))?.slice(7);
const check = (unit, name, ok, actual) => { rows.push({ unit, name, ok: !!ok, actual }); console.log(`${ok ? 'PASS' : 'FAIL'} ${unit}: ${name} ${JSON.stringify(actual)}`); };
const ctl = (n = 2, thr = 0.6) => ({ pitch: 0, roll: 0, yaw: 0, throttle: Array(n).fill(thr), brakeL: 0, brakeR: 0 });
const env = { groundY: () => -1000, water: () => false };
function airborne(make, speed = 75) { const a = make(); a.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 1500, speed }); return a; }
function fly(a, secs, controls) { for (let i = 0; i < Math.ceil(secs / DT); i++) a.step(DT, typeof controls === 'function' ? controls(a) : controls, env); }
const suites = {
  huey() {
    const a = H.air(), p = H.pilot(); H.trim(a, p, 25, 2);
    const initial = a.vel.y, c = { ...p.ctl, coll: p.ctl.coll + 0.1 };
    H.fly(a, 0.6, c);
    check('huey', 'collective increases vertical lift from a trimmed hover', a.vel.y > initial + 0.5, { before: initial, after: a.vel.y });
    // A free turbine keeps the main rotor turning after fuel cutoff; the two RPM needles must separate.
    const b = H.air(9.81, { speed: 36 }), q = H.pilot({ V: 36 }); H.trim(b, q, 25, 2);
    const ar = H.pilot({ V: 36, rpmHold: true, c0: 0.1 }); Object.assign(ar.i, q.i); ar.ctl.fuel = false;
    H.trim(b, ar, 20, 2);
    check('huey', 'engine cutoff separates engine and rotor RPM', b.n2 < b.rpm - 0.2 && b.rpm > 0.8 && !b.dead, { engine: b.n2, rotor: b.rpm, dead: b.dead });
  },
  hornet() {
    const a = airborne(createJetSim), c = ctl(); c.roll = 0.7; fly(a, 0.7, c);
    check('hornet', 'right stick rolls the twin-engine fighter right', a.attitude().roll > 0.3 && !a.dead, a.attitude());
    const b = airborne(createJetSim), d = ctl(); d.throttle = [0.25, 0.85]; fly(b, 5, d);
    check('hornet', 'independent throttles create different engine indications', b.eng[1].n > b.eng[0].n + 0.08 && b.eng[1].thrust > b.eng[0].thrust, b.eng.map(e => ({ n: e.n, thrust: e.thrust })));
  },
  tomcat() {
    const a = airborne(createTomcatSim, 95); a.sweep = 20; a.sweepMode = 'emer'; a.sweepCmd = 68;
    fly(a, 0.5, ctl()); const halfway = a.sweep; fly(a, 8, ctl());
    check('tomcat', 'variable wings take time to sweep aft', halfway > 20 && halfway < 35 && a.sweep > 60, { halfway, final: a.sweep });
    a.sweepMode = 'over'; a.sweep = 68; fly(a, 1, ctl());
    check('tomcat', 'deck oversweep is inhibited while airborne', a.sweep <= 68 && !a.onGround, { sweep: a.sweep, onGround: a.onGround });
  },
  ch46() {
    const a = createCH46Sim(); a.reset([0, 600, 0], 0, false);
    const p = createPilot(CH46.PILOT), s = {}; p.reset(0.5);
    run(a, 25, () => p.step(stateOf(a.body, s), DT, { vx: 0, vz: 0, vy: 0, hdg: 0 }), sea());
    check('ch46', 'tandem rotors both carry a stable transport hover', a.rf.T > 10000 && a.ra.T > 10000 && Math.abs(a.body.vel[1]) < 0.6 && !a.dead, { front: a.rf.T, aft: a.ra.T, climb: a.body.vel[1] });
    const pitch = a.attitude({}).pitch, c = { ...p.ctl, lon: p.ctl.lon + 0.3, sas: false };
    run(a, 0.8, () => c, sea());
    check('ch46', 'aft stick uses differential collective to pitch up', a.attitude({}).pitch > pitch + 0.01, { before: pitch, after: a.attitude({}).pitch });
  },
  mv22() {
    const a = createMV22Sim(); a.reset([0, 1500, 0], 0, false, null, 0); a.body.vel[2] = -200 / 1.94384;
    const p = createTiltPilot(MV22.PILOT, a), s = {}; p.reset(0.5);
    const step = () => p.step(stateOf(a.body, s), DT, { vx: 0, vz: -200 / 1.94384, vy: 0, hdg: 0, agl: 1500 });
    run(a, 30, step, sea());
    check('mv22', 'airplane mode transfers lift to the wing', a.nac < 0.1 && a.wingL > a.mass * 9.81 * 0.6 && !a.dead, { nac: a.nac, wingLift: a.wingL, weight: a.mass * 9.81 });
    a.eng[1].ok = false; run(a, 12, step, sea());
    check('mv22', 'cross-shaft keeps both proprotors loaded after one engine fails', a.rR.T > 1000 && a.rL.T > 1000 && a.rpm > 0.7 && !a.dead, { right: a.rR.T, left: a.rL.T, rpm: a.rpm });
  },
  c130() {
    const a = createC130Sim(); a.reset(new H.THREE.Vector3(0, 1200, 0), 0, 65, { flap: 0, gear: 0, lever: 60 });
    const target = { track: a.heading, alt: 1200, kias: 220 };
    a.setCond(0, 'feather'); fly(a, 12, () => a.autopilot(DT, target));
    check('c130', 'one condition lever feathers only its propeller', a.eng[0].beta > 90 && a.eng[0].N < 0.05 && a.eng.slice(1).every(e => e.run && e.N > 0.9), a.eng.map(e => ({ run: e.run, rpm: e.N, pitch: e.beta })));
    check('c130', 'transport remains airborne under three-engine autopilot', !a.dead && a.pos.y > 1000 && Math.abs(a.bank) < 0.2, { dead: a.dead, altitude: a.pos.y, bank: a.bank });
  },
  wasp() {
    const a = createWaspSim(); a.reset([0, 300, 0], 0, false); a.power = 140000;
    const p = createPilot(WASP_PILOT), s = {}; p.reset(0.55);
    const hold = v => { const c = p.step(stateOf(a.body, s), DT, { vx: 0, vz: -v, vy: 0, hdg: 0 }); return { thr: c.coll, pitch: c.lon, roll: c.lat, yaw: c.ped }; };
    run(a, 20, () => hold(0), sea()); const hoverDrag = a.momDrag;
    check('wasp', 'fictional ducted fan holds a hover below full power', !a.dead && Math.abs(a.body.vel[1]) < 0.6 && a.power < 230000, { climb: a.body.vel[1], power: a.power });
    run(a, 20, () => hold(20), sea());
    check('wasp', 'edgewise flight develops inlet drag and a lip pitching moment', a.momDrag > hoverDrag + 300 && a.lipM > 0 && !a.dead, { drag: a.momDrag, hoverDrag, lipMoment: a.lipM });
  },
  shrike() {
    const a = airborne(RW.createShrikeSim), c = ctl(1, 1); c.roll = 0.5; fly(a, 0.7, c);
    check('shrike', 'fictional fighter responds to bank command without afterburner', a.attitude().roll > 0.3 && a.eng.length === 1 && a.eng[0].ab === 0 && a.eng[0].thrust > 0, { roll: a.attitude().roll, ab: a.eng[0].ab });
  },
  reaper() {
    const a = airborne(RW.createReaperSim, 32), c = ctl(1, 0.7); fly(a, 6, c);
    const hot = a.eng[0].egt, fuel = a.fuel; a.eng[0].run = false; fly(a, 30, c); const e = a.eng[0];
    check('reaper', 'fuel cutoff removes propulsion and fuel flow', e.thrust === 0 && e.power === 0 && e.ff === 0 && a.fuel === fuel, { power: e.power, thrust: e.thrust, fuelUsed: fuel - a.fuel });
    check('reaper', 'shutdown cools telemetry and loses oil pressure', e.egt < hot - 100 && e.oil < 1 && e.n < 0.001, { hot, egt: e.egt, oil: e.oil, n: e.n });
    const cold = RW.createReaperSim(); cold.reset(0, 0, 0, 0, { running: false }); cold.step(DT, c, { groundY: () => 0, water: () => false });
    check('reaper', 'cold engine stays cold before starting', cold.eng[0].egt === 20 && cold.eng[0].oil === 0 && cold.eng[0].power === 0, cold.eng[0]);
    const model = buildReaperModel(); model.animate({ eng: [{ n: 0 }] }, 1); const stopped = model.parts.prop.rotation.z;
    model.animate({ eng: [{ n: 0 }] }, 1); const still = model.parts.prop.rotation.z; model.animate({ eng: [{ n: 0.6 }] }, 1);
    check('reaper', 'pusher blades stop at zero shaft signal and turn when running', stopped === still && model.parts.prop.rotation.z > still, { stopped, still, running: model.parts.prop.rotation.z });
  },
  shahed() {
    const a = RW.createShahedSim(); a.launch(0, 600, 0, 0, 0); a.ctl.bank = 0.4; a.ctl.gam = 0;
    for (let i = 0; i < 300; i++) a.step(DT);
    check('shahed', 'simplified delta drone banks into a finite forward turn', a.hdg > 0.1 && a.pos.x > 1 && a.pos.z < -50 && Number.isFinite(a.pos.y), { heading: a.hdg, position: a.pos.toArray() });
    const model = buildShahedModel(); model.animate({ ctl: { thr: 0 } }, 1); const disc = model.parts.prop.getObjectByName('propDisc');
    check('shahed', 'stopped pusher has visible blades and no motion disc', model.parts.prop.rotation.z === 0 && disc.material.opacity === 0 && model.parts.prop.children.filter(c => c.name === 'blade').every(c => c.visible), { spin: model.parts.prop.rotation.z, opacity: disc.material.opacity });
    model.animate({ ctl: { thr: 1 } }, 1);
    check('shahed', 'running pusher replaces solid blades with a motion disc', model.parts.prop.rotation.z > 0 && disc.material.opacity > 0 && model.parts.prop.children.filter(c => c.name === 'blade').every(c => !c.visible), { spin: model.parts.prop.rotation.z, opacity: disc.material.opacity });
  },
};
if (only && !suites[only]) throw new Error(`Unknown air unit: ${only}`);
for (const [id, test] of Object.entries(suites)) if (!only || only === id) {
  try { test(); } catch (error) { check(id, 'suite completed', false, String(error.stack || error)); }
}
const result = { suite: 'unit-air', passed: rows.filter(r => r.ok).length, failed: rows.filter(r => !r.ok).length, rows };
const json = process.argv.find(a => a.startsWith('--json='))?.slice(7); if (json) writeFileSync(json, JSON.stringify(result, null, 2) + '\n');
console.log(`${result.passed} passed, ${result.failed} failed across ${new Set(rows.map(r => r.unit)).size} air units`);
process.exitCode = result.failed ? 1 : 0;
