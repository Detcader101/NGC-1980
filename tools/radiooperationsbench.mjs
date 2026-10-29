// Radio adapters exercise actual fleet/research ledgers and simulation-shaped controller doubles.
// This verifies game resource/task semantics; rendered physics are covered by the integration scene.
import assert from 'node:assert/strict';
import { createRadioOperations } from '../game/js/voice/operations.js';
import { createFleet } from '../game/js/units/commander/fleet.js';
import { createTech } from '../game/js/techtree.js';
let count = 0;
const check = (yes, name) => { assert.ok(yes, name); console.log('PASS ' + name); count++; };
function setup() {
  const store = { mat: 500, fuel: 100 }, fleet = createFleet(), denied = new Set();
  const home = { name: 'HOME ISLAND', owner: 1, pad: { x: 0, z: 0 }, structs: [] };
  const dest = { name: 'SANDBAR', owner: 0, pad: { x: 200, z: 50 }, structs: [] };
  const cave = { name: 'CINDER', owner: 0, cave: true, pad: { x: 400, z: 0 }, structs: [] };
  const T = createTech(1, { start: 'default' });
  const war = { P: store, islands: [home, dest, cave], units: [], air: { pending: [] }, carrier: {},
    sim: { COST: { escort: 30, drone: 40, aa: 30 } },
    allow: (_, id) => !denied.has(id), gateMsg: (_, id) => 'NEEDS ' + id + ' RESEARCH',
    ground: { presence: () => 0, CV: { poolCredit: () => 0 } },
    tech: [null, T], research: (_, id) => T.research(id, store),
    sendEscort(I) { store.mat -= 30; this.air.pending.push({ type: 'escort', side: 1, name: 'VICTORY 201', cap: I, deckE: { state: 'hangar' }, ai: { state: 'deck' }, sim: {} }); return 'LAUNCH QUEUED'; },
    sendDrone(I) { store.mat -= 40 - this.ground.CV.poolCredit(40); this.units.push({ type: 'drone', side: 1, target: I, rot: { deployed: false, AI: { phase: 'lift', homing: () => false } } }); return 'SEA KNIGHT LAUNCHED'; },
    orderAA(I) { if (I.structs.length >= 4) return 'NO ROOM'; store.mat -= 30; I.structs.push({ kind: 'aa', side: 1, building: 12 }); return 'BUILDING'; },
  };
  const airdrop = { runs: [], can: () => '',
    order(type, I) { this.runs.push({ type, I, call: 'RAIDER 22', phase: 'inbound' }); return ''; } };
  const roster = ['m151', 'm35', 'm113'].map(id => ({ id, out: () => false, airdropWhy: () => '' }));
  const logs = { requests: 0, why: '', phase: 'active' };
  const logistics = { check: () => logs.why, request: () => { logs.requests++; return { ok: true }; }, status: () => 'Fuel and field repair dispatched.', watch: () => ({ state: logs.phase, detail: 'Field support.' }) };
  const net = createRadioOperations({ war, store, fleet, roster, airdrop, airCost: 10, logistics });
  const find = (call, body) => net.targets().find(t => t.call === call).orders.find(o => o.body === body);
  return { war, store, fleet, roster, airdrop, net, find, home, dest, cave, T, denied, logs };
}
{
  const s = setup(), snapshot = JSON.stringify([s.store, s.fleet.n]);
  const targets = s.net.targets();
  check(targets.length === 4 && targets.every(t => t.orders.length && t.status()), 'four controllers expose live stations, status and requests');
  check(targets.every(t => t.orders.every(o => o.requiresReadback && typeof o.validate === 'function')), 'resource requests all require readback and live validation');
  check(s.net.targets()[0].identity === targets[0].identity, 'controller identity survives roster refresh');
  check(JSON.stringify([s.store, s.fleet.n]) === snapshot && s.war.units.length === 0, 'listing/quoting orders cannot spend or launch');
  const o = s.find('Air Boss', 'Request combat air patrol over SANDBAR');
  check(o.label === 'Request combat air patrol' && o.destination === 'SANDBAR' && o.cost === 30, 'composer separates the order, destination and actual sortie cost');
  s.denied.add('escort');
  check(/RESEARCH/.test(o.validate()) && !o.execute().ok && s.store.mat === 500, 'research refusal persists through execution');
  s.denied.clear(); s.store.mat = 29;
  check(!o.execute().ok && s.war.air.pending.length === 0, 'resource changes after readback are revalidated');
  s.store.mat = 500; s.war.carrier.sinking = 1;
  check(!o.execute().ok && s.store.mat === 500, 'carrier loss prevents launch');
}
{
  const s = setup(), o = s.find('Air Boss', 'Request combat air patrol over Albatross'), r = o.execute();
  const u = s.war.air.pending[0];
  check(r.ok && s.store.mat === 470 && r.watch().state === 'active', 'CAP dispatch charges existing launch API and remains active in the deck queue');
  s.war.air.pending.length = 0; s.war.units.push(u); u.deckE = null; u.ai.state = 'cap';
  check(r.watch().state === 'active' && /on patrol/.test(r.watch().detail), 'airborne patrol is not incorrectly called complete');
  u.ai.state = 'rtb';
  check(/returning/.test(r.watch().detail), 'task follows return to carrier');
  u.ai.recovered = true; u.dead = true; u.stowed = true; s.war.units.length = 0;
  check(r.watch().state === 'complete', 'actual recovery completes a patrol even after unit stow');
  const lost = o.execute(), v = s.war.air.pending[0]; v.dead = true;
  check(lost.watch().state === 'failed', 'lost flight does not report mission completion');
  s.war.air.pending = [{ type: 'escort' }, { type: 'escort' }, { type: 'escort' }];
  check(!o.execute().ok, 'deck queue counts toward existing three-flight limit');
}
{
  const s = setup();
  check(!s.find('Transport', 'Request troop lift to HOME ISLAND').execute().ok, 'troop lift refuses friendly islands without an enemy landing');
  check(!s.find('Transport', 'Request troop lift to CINDER').execute().ok, 'troop lift cannot bypass cave objectives');
  s.war.ground.presence = () => 3;
  check(s.find('Transport', 'Request troop lift to HOME ISLAND').validate() === '', 'friendly island under attack accepts reinforcement');
  s.war.ground.CV.poolCredit = () => 20;
  const o = s.find('Transport', 'Request troop lift to SANDBAR'), r = o.execute(), u = s.war.units[0];
  check(o.cost === 20 && r.ok && s.store.mat === 480, 'recovered Marine credit uses the existing troop-lift price');
  u.rot.AI.phase = 'ground';
  check(r.watch().state === 'active' && /Unloading/.test(r.watch().detail), 'touchdown alone does not complete troop delivery');
  u.rot.deployed = true; u.squadUnit = {};
  check(r.watch().state === 'complete' && s.dest.owner === 0, 'disembarkation completes transport without claiming objective capture');
  const r2 = o.execute(), u2 = s.war.units[1]; u2.stowed = true;
  check(r2.watch().state === 'failed', 'aborted lift returning with troops reports failure');
}
{
  const s = setup(), o = s.find('Transport', 'Request air drop jeep at HOME ISLAND'), n = s.fleet.n.m151;
  const r = o.execute(), run = s.airdrop.runs[0];
  check(r.ok && s.store.mat === 490 && s.fleet.n.m151 === n - 1, 'heavy drop spends one reserve and the ten-materiel sortie');
  run.phase = 'down';
  check(r.watch().state === 'active' && /de-rigging/.test(r.watch().detail), 'landed load waits for the ground crew');
  run.phase = 'ready'; run.vehicle = {};
  check(r.watch().state === 'complete', 'real de-rigged vehicle completes heavy drop');
  run.vehicle = null;
  check(r.watch().state === 'failed', 'vehicle creation failure is not reported as successful delivery');
  const notFriendly = s.find('Transport', 'Request air drop truck at SANDBAR');
  check(!notFriendly.execute().ok && s.airdrop.runs.length === 1, 'logistics heavy drop requires a friendly destination');
  s.home.owner = 2;
  check(!o.execute().ok && s.fleet.n.m151 === n - 1, 'captured destination cannot consume a reserve after readback');
}
{
  const s = setup(); s.fleet.n.m35 = 0;
  const o = s.find('Transport', 'Request air drop truck at HOME ISLAND'), r = o.execute();
  check(o.cost === 30 && r.ok && s.store.mat === 470 && s.fleet.n.m35 === 0 && s.fleet.bought.m35 === 1, 'no reserve charges vehicle purchase plus sortie once');
  s.fleet.n.m35 = 0; s.fleet.log = Array.from({ length: 80 }, (_, i) => ({ i }));
  const before = JSON.stringify([s.store, s.fleet.n, s.fleet.bought, s.fleet.log]);
  s.airdrop.order = () => 'NO DROP ZONE';
  check(!o.execute().ok && JSON.stringify([s.store, s.fleet.n, s.fleet.bought, s.fleet.log]) === before, 'refused drop rolls back purchase, reserves and capped ledger history');
  s.airdrop.order = () => { throw Error('no aircraft'); };
  check(!o.execute().ok && JSON.stringify([s.store, s.fleet.n, s.fleet.bought, s.fleet.log]) === before, 'launch exception before creation cannot spend resources');
  s.airdrop.order = (type, I) => { s.airdrop.runs.push({ type, I, phase: 'inbound' }); throw Error('late HUD failure'); };
  const late = o.execute();
  check(late.ok && s.store.mat === 440 && s.fleet.n.m35 === 0, 'late presentation exception cannot create an unpaid flight');
  s.airdrop.runs.at(-1).phase = 'lost';
  check(late.watch().state === 'failed' && s.store.mat === 440, 'lost load remains spent rather than silently refunding');
}
{
  const s = setup(), o = s.find('Supply', 'Request air defense at HOME ISLAND'), r = o.execute(), gun = s.home.structs[0];
  check(r.ok && s.store.mat === 470 && r.watch().state === 'active', 'AA request starts actual paid construction');
  gun.building = 0;
  check(r.watch().state === 'complete', 'AA completion waits for construction');
  gun.side = 2;
  check(r.watch().state === 'failed', 'lost construction cannot be acknowledged as friendly');
  s.home.structs = [{}, {}, {}, {}]; const mat = s.store.mat;
  check(!o.execute().ok && s.store.mat === mat, 'full island build slots refuse without spending');
  const spare = s.find('Supply', 'Request replacement Huey'), n = s.fleet.n.heli;
  check(spare.execute().ok && s.fleet.n.heli === n + 1 && s.store.mat === mat - 60, 'replacement requisition pays the real fleet ledger');
  s.denied.add('tomcat');
  check(!s.find('Supply', 'Request replacement Tomcat').execute().ok, 'replacement request cannot bypass equipment research');
}
{
  const s = setup(), node = s.T.nodes.find(n => s.T.canResearch(n.id, s.store) === true), o = s.find('Operations', 'Request research ' + node.name);
  const r = o.execute();
  check(r.ok && s.store.mat === 500 - node.cost.mat && r.watch().state === 'active', 'research request pays the existing technology ledger');
  s.T.update(node.time / 2);
  check(/50 percent/.test(r.watch().detail), 'research reports live progress');
  s.T.update(node.time / 2);
  check(r.watch().state === 'complete' && s.T.has(node.id), 'research completion follows actual technology unlock');
  const next = s.T.nodes.find(n => s.T.canResearch(n.id, s.store) === true), other = s.find('Operations', 'Request research ' + next.name).execute();
  s.T.cancel(s.store);
  check(other.watch().state === 'failed', 'cancelled research does not remain permanently active');
  const sky = s.T.node('p.sky'); for (const id of sky.requires) s.T.done.add(id);
  const fuel = s.find('Operations', 'Request research ' + sky.name); s.store.fuel = 39;
  check(fuel.fuelCost === 40 && !fuel.execute().ok, 'fuel costs are quoted and enforced as well as materiel');
}
{
  const s = setup(), o = s.find('Supply', 'Request fuel and field repair');
  s.logs.why = 'Land first.';
  check(!o.execute().ok && s.logs.requests === 0, 'field support uses the active craft logistics gate');
  s.logs.why = ''; const r = o.execute();
  check(r.ok && s.logs.requests === 1 && r.watch().state === 'active', 'field support dispatches once and tracks the supplied job');
  s.logs.phase = 'complete';
  check(r.watch().state === 'complete', 'field support completes only when the existing controller says so');
}
console.log(`${count}/${count} passed`);
