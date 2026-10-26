#!/usr/bin/env node
// Short, non-combat identity regressions for every active ground type. Deterministic physics,
// no browser, no assertions about real armour/weapon performance. Detailed legacy benches remain separate.
import assert from 'node:assert/strict';
import { createWheeledSim, WHEELED } from '../game/js/units/wheeled/index.js';
import { TYRES } from '../game/js/units/wheeled/tyre.js';
import { createM113 } from '../game/js/units/armor/m113.js';
import { createM60A3 } from '../game/js/units/armor/m60a3.js';
import { createSoldier } from '../game/js/units/infantry/soldier.js';
import { createStrider, flatEnv } from '../game/js/units/runaway/strider.js';
import { createHoverTank } from '../game/js/units/runaway/hovertank.js';
import { createMBT, MBT } from '../game/js/units/runaway/mbt.js';
import { createSandbox, setupScenario } from '../game/js/units/runaway/sandbox.js';
import { createTrackDrive } from '../game/js/units/groundwar/mbttrack.js';

const dt = 1 / 60, rows = [];
const env = { g: 9.81, ground(x,z,o) { return Object.assign(o,{h:0,nx:0,ny:1,nz:0,surf:0,vx:0,vy:0,vz:0}); } };
const flat = { height: () => 0, normal: () => [0,1,0], surface: () => 'dirt' };
const run = (seconds, fn) => { for (let n=0; n<Math.round(seconds/dt); n++) fn(dt,n*dt); };
function test(id, fn) {
 try { const result = fn(); rows.push({id,ok:true,result}); console.log(`PASS ${id} ${JSON.stringify(result)}`); }
 catch(e) { rows.push({id,ok:false,error:e.message}); console.error(`FAIL ${id}: ${e.message}`); }
}
function car(id, load=0) {
 const c=createWheeledSim(id); c.sim.reset([0,0,0],0,{running:true}); c.sim.setLoad(load?[{kg:load,at:c.spec.cargoAt||[0,1,0]}]:[]); c.driver.reset(c.sim);
 c.run=(s,input={})=>run(s,d=>c.sim.step(d,c.driver.update(c.sim,input,d),env));
 return c;
}
for (const id of ['m151','m35','landrover','hilux','beetle','lada']) test(id,()=>{
 const c=car(id), s=c.sim;
 c.run(1); assert.ok(Math.abs(s.pos[1])<.03 && s.onGround, 'settles on its actual suspension');
 c.run(5,{throttle:1}); const speed=s.speed, distance=-s.pos[2];
 assert.ok(speed>1 && distance>3 && s.wheels.every(w=>Math.abs(w.omega)>1), 'engine drives all visible rolling stations');
 c.run(1,{throttle:.1,steer:.25});
 assert.ok(Math.abs(s.heading)>.005 && s.wheels.some(w=>w.spec.front&&Math.abs(w.steer)>.01), 'front steering changes heading');
 assert.ok(s.wheels.filter(w=>!w.spec.front).every(w=>Math.abs(w.steer)<1e-8), 'rear wheels remain unsteered');
 run(5,d=>s.step(d,{brake:1,throttle:0,clutch:1,gear:0,ignition:true},env)); assert.ok(Math.abs(s.speed)<.4,'service brakes stop the vehicle');
 if (id==='m35') {
   assert.equal(s.wheels.length,6,'six hub/suspension stations retained');
   assert.equal(s.spec.wheels.reduce((n,w)=>n+(w.dual?2:1),0),10,'two singles and four rear dual pairs');
   for (let i=2;i<6;i++) {
     const aggregate=s.spec._prep.wk[i].T, single=TYRES['9.00-20 NDT'];
     assert.equal(aggregate.r,single.r); assert.equal(aggregate.Fz0,2*single.Fz0);
     assert.equal(aggregate.I,2*single.I); assert.equal(aggregate.kz,2*single.kz);
   }
   const loaded=car(id,2200); loaded.run(1); loaded.run(5,{throttle:1});
   assert.ok(loaded.sim.massNow>s.massNow+2100 && loaded.sim.speed<speed-.2, 'cargo has mass and slows acceleration');
 } else if (id==='m151') {
   const v=car(id); v.run(.5,{fwd:true,throttle:.2});
   assert.equal(v.sim.fwd,true,'part-time front axle engages');
   assert.equal(v.spec.transfer.low,null,'MUTT has no invented low range');
 } else if (id==='landrover'||id==='hilux') {
   const v=car(id); v.run(.5,{range:'L',fwd:true,throttle:.2});
   assert.equal(v.sim.range,'L','off-road utility has selectable low range');
 } else {
   assert.ok(!WHEELED[id].spec.transfer.low, 'road car has no invented off-road low range');
   assert.equal(WHEELED[id].spec.axles.filter(a=>a.driven==='F').length,0,'road car remains rear wheel drive');
   if(id==='beetle') assert.ok(WHEELED[id].spec.engine.aircooled && !WHEELED[id].spec.components.radiator,'Beetle is rear air-cooled with no radiator');
 }
 return {distanceM:+distance.toFixed(2),speedBeforeBrake:+speed.toFixed(2),stopMps:+s.speed.toFixed(3)};
});

test('m60',()=>{
 const t=createM60A3();t.reset(0,0,0,flat);run(1,d=>t.step(d,flat,{park:true}));
 run(8,d=>t.step(d,flat,{range:'N',park:false,throttle:1,steer:1}));
 const rate=Math.abs(t.fm.out.yawRate), drift=Math.hypot(t.fm.origin()[0],t.fm.origin()[2]);
 assert.ok(rate>.2 && drift<2.5,'cross-drive neutral steer pivots the hull without translating like a wheeled car');
 assert.ok(t.fm.trackPos[0]*t.fm.trackPos[1]<0,'tracks counter-rotate during neutral steer');
 return {pivotRadS:+rate.toFixed(3),driftM:+drift.toFixed(3)};
});
test('m113',()=>{
 const t=createM113(); t.reset(0,0,0,flat); const payload=t.fm.payload;
 run(4,d=>t.step(d,flat,{range:'N',park:false,throttle:1,steer:1}));
 assert.ok(Math.abs(t.fm.out.yawRate)<.05,'controlled differential does not borrow M60 neutral pivot');
 t.step(dt,flat,{dismount:'all'});assert.equal(t.seats.filter(Boolean).length,11,'closed ramp keeps troops aboard');
 run(9,d=>t.step(d,flat,{ramp:true,park:true}));t.step(dt,flat,{dismount:'all'});
 assert.equal(t.seats.filter(Boolean).length,0,'open ramp permits troop unloading');
 t.step(dt,flat,{park:true});
 assert.ok(payload>900 && t.fm.payload===0,'unloaded troops remove their carried mass');
 run(7,d=>t.step(d,flat,{ramp:false,vane:true,pumps:true,park:true}));
 assert.ok(t.fm.water.vane&&t.fm.water.pumps,'trim vane and bilge pumps are distinct preparation controls');
 return {troopsUnloaded:11,payloadRemovedKg:payload,ramp:+t.ramp.toFixed(2),vane:t.vane};
});
test('marine',()=>{
 const make=(stance='stand',load=20)=>{const s=createSoldier();s.load=load;s.place(0,0,0,0,stance);return s;};
 const standing=make(),crawling=make('prone');
 run(6,d=>{standing.step(d,{move:[0,1]},{},{});crawling.step(d,{move:[0,1]},{},{});});
 assert.ok(standing.speed>2 && crawling.speed<.6 && standing.eyeH>crawling.eyeH+1,'prone is lower and slower than running');
 const light=make(),heavy=make('stand',55);run(7,d=>{light.step(d,{move:[0,1],sprint:true},{},{});heavy.step(d,{move:[0,1],sprint:true},{},{});});
 assert.ok(light.speed>heavy.speed && light.sprinting && !heavy.sprinting,'heavy carried equipment slows the soldier and prevents sprinting');
 return {runMps:standing.speed,crawlMps:crawling.speed,lightReserve:light.staminaFrac,heavyReserve:heavy.staminaFrac};
});
test('rw1',()=>{
 const s=createStrider(),f=flatEnv();s.place(0,0,0,f);let steps=0;
 run(8,d=>{steps+=s.step(d,{vx:0,vz:-1.6},f).filter(e=>e.e==='step').length;});
 assert.ok(s.c[2]<-8 && steps>4 && s.mode!=='fallen','biped moves by alternating planted steps');
 assert.ok(s.stats.maxStretch<=1.001,'legs remain inside IK reach');
 return {distanceM:-s.c[2],steps,maxStretch:s.stats.maxStretch};
});
test('rw7',()=>{
 const s=createHoverTank();s.place(0,0,0,flat);run(4,d=>s.step(d,{lift:1},flat));
 const rest=s.p[1];run(3,d=>s.step(d,{lift:1,strafe:.65},flat));const x=s.p[0];
 run(1,d=>s.step(d,{lift:1},flat));
 assert.ok(rest>.6&&rest<1.4 && s.fan.every(f=>f>0),'lift fans sustain hover clearance');
 assert.ok(Math.abs(x)>1 && Math.abs(s.p[0]-x)>.3,'hovercraft strafes and coasts with lateral inertia');
 return {hoverY:rest,strafeM:x,coastM:s.p[0]-x};
});
for(const id of ['m1a2','t90m'])test(id,()=>{
 const t=createMBT(MBT[id],{drive:createTrackDrive});t.place(0,0,0,flat);
 run(6,d=>t.drive.step(d,{throttle:1},flat));const distance=-t.p[2];
 run(2,d=>t.drive.step(d,{throttle:.2,steer:.5},flat));
 assert.ok(distance>3&&t.speed>1&&t.drive.full&&t.drive.sim.eng.running,'live-game track physics moves the named hull');
 assert.ok(Math.abs(t.drive.wheelSpin[0]-t.drive.wheelSpin[1])>.5,'tracked turn gives different left/right travel');
 run(6,d=>t.drive.step(d,{brake:1},flat));assert.ok(Math.abs(t.speed)<.2,'braking arrests the tracked hull');
 run(4,d=>t.drive.step(d,{throttle:-.65},flat));assert.ok(t.speed<-.5,'full drive reverses');
 t.drive.setDetail(false,flat);run(1,d=>t.drive.step(d,{throttle:-.3},flat));
 const reverse=t.speed, p=[...t.p], travel=[...t.drive.wheelSpin];t.drive.setDetail(true,flat);
 assert.ok(Math.abs(t.speed-reverse)<.01&&t.drive.sim.ctl.range==='R','LOD restoration preserves reverse velocity and range');
 assert.ok(Math.hypot(t.p[0]-p[0],t.p[2]-p[2])<.01,'LOD restoration keeps hull position');
 assert.deepEqual(t.drive.wheelSpin,travel,'LOD restoration keeps track animation travel');
 return {distanceM:distance,roadWheelsPerSide:MBT[id].wheels,reverseBeforeLOD:reverse,reverseAfterLOD:t.speed,coverage:'live-game full drive and distant fallback'};
});
test('live-lineup',()=>{
 const b=setupScenario(createSandbox({seed:1980}),'lineup');
 run(1,d=>b.step(d));
 assert.equal(b.units.length,5);assert.ok(b.units.every(m=>m.ai && m.alive && Number.isFinite(m.y)),'all display units can step live without missing controllers');
 return {units:b.units.length,time:b.time};
});
console.log(`${rows.filter(r=>r.ok).length} passed, ${rows.filter(r=>!r.ok).length} failed (13 ground types plus live lineup)`);
if(rows.some(r=>!r.ok))process.exitCode=1;
