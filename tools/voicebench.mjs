// Deterministic hook contracts and generated-asset integrity. Browser DSP/lifetimes: scenes/voices.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createHooks} from '../game/js/voice/hooks.js';
import {PHRASES} from '../game/js/voice/phrases.js';
import {speechKey} from '../game/js/voice/samples.js';
import {wallBetween} from '../game/js/voice/occlusion.js';
import {voiceBankIndex} from './voice-bank.mjs';
import {fileURLToPath} from 'node:url';
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS '+label);};
const bank=voiceBankIndex(fileURLToPath(new URL('../game/',import.meta.url)));
if(bank.available){
const data=fs.readFileSync(new URL('../game/audio/voices/'+bank.file,import.meta.url));
check(createHash('sha256').update(data).digest('hex')===bank.sha256,'generated asset SHA-256 matches manifest');
check(gunzipSync(data).length===bank.samples,'generated PCM length matches index');
for(const gender of ['male','female']){
  check(Object.values(PHRASES).every(c=>Object.values(c).flat().every(t=>t.split(/\{[^}]*\}/).every(s=>!speechKey(s)||bank.clips[gender][speechKey(s)]))),'all authored phrase fragments available: '+gender);
  check(Object.values(bank.clips[gender]).every(([a,n])=>a>=0&&n>0&&a+n<=bank.samples),'sample offsets valid: '+gender);
}
}else console.log('SKIP optional generated-bank integrity: run node tools/voice-build.mjs locally to include these six checks. Hook checks still run.');
function fixture(craft='heli',members=[],people=[]){
  const calls=[], V={ctx:{state:'play',unit:craft,craft,ear:{x:0,y:9.6,z:0,yaw:0}},queue:[],speak:o=>{calls.push(o);return o;},betty:()=>{throw Error('Tomcat must not use Hornet warning voice');}};
  const G={craft,state:'play'}, carrier={p:{x:0,y:0,z:0},yaw:0,parts:{crew:{members}},interior:{crew:[],boxes:()=>[]}}, ground={sim:{units:[],proj:[]}};
  const H=createHooks(V);H.attach({G,war:{carrier,ground},Z:{alive:false},world:{ambient:{people}}});
  return {V,H,G,ground,calls};
}
const a=fixture();a.H.event('doorGun');check(a.calls.at(-1).who==='huey:gunner','own door gun action belongs to gunner');
a.H.event('hurt',{dir:{x:1,z:0}});check(a.calls.at(-1).pri===3&&a.calls.at(-1).cat==='takingFire','Huey hit produces urgent directional call');
const t=fixture('tomcat');t.H.hud('STT  -  TRACK 03 LOCKED');t.H.hud('FOX THREE  -  TRACK 03');t.H.hud('LEFT ENGINE FLAMED OUT');
check(t.calls.length===3&&t.calls.every(e=>e.who==='rio'&&e.net==='ic'),'Tomcat lock, Phoenix and engine failure use RIO intercom');
t.H.hud('VICTORY 102: FOX TWO');check(t.calls.at(-1).who==='VICTORY 102'&&t.calls.at(-1).net==='uhf','AI modex has its own radio identity');
const j=fixture('jet');j.H.hud('FOX TWO');j.H.hud('AIRBORNE  -  GEAR UP');check(j.calls.some(e=>e.role==='tower')&&j.calls.some(e=>e.who==='player'),'Hornet launch and tower departure');
const d=fixture('foot',[{x:0,y:8,z:1,jersey:'brown'}]);d.H.update(1.3);check(d.calls.at(-1).role==='captain'&&d.calls.at(-1).net==='air','nearby actual plane captain speaks');
d.H.event('reload');d.H.hud('FRAG OUT');check(d.calls.some(e=>e.cat==='reload')&&d.calls.some(e=>e.cat==='frag'),'player reload and grenade call-outs');
d.H.hud('COMMAND: MARINE OUT AT SANDBAR');d.H.hud('RADAR: ENEMY AIRCRAFT');check(d.calls.some(e=>e.cat==='deploy')&&d.calls.some(e=>e.who==='combat'),'command board and controller identity');
const m={id:1,kind:'marine',side:1,alive:true,able:true,x:2,y:8,z:2,yaw:0}, enemy={id:2,kind:'strider',x:20,z:2};d.ground.sim.units=[m,enemy];
d.ground.onEvents([{e:'shot',side:2,src:2,x:20,y:9,z:2},{e:'callout',id:1,x:2,y:9,z:2,text:'CORPSMAN UP!'}]);
check(d.calls.some(e=>e.cat==='walker'&&e.vars.dir&&e.vars.dist)&&d.calls.some(e=>e.cat==='corpsman'),'ground event stream provides relative contact and casualty calls');
const w={x:0,z:0,y0:0,y1:2,hw:.04,hl:.4,D:{}};
check(wallBetween({x:-1,y:1,z:0},{x:1,y:1,z:0},{near:()=>[w]},null),'narrow door leaves muffle speech');
const person={src:'same-house',door:[0,8,0],x:2,y:8,z:0,state:'walk'}, c=fixture('foot',[],[{...person},{...person}]);
c.H.update(1.3);const names=c.calls.map(e=>e.who);check(names.length===2&&names[0]!==names[1],'villagers sharing a doorway remain different people');
c.H.update(1.3);check(c.calls[2].who===names[0]&&c.calls[3].who===names[1],'villager identities persist between polls');
const tank=fixture('m60'), apc=fixture('m113');tank.H.hud('DRIVER, START UP');apc.H.hud('DRIVER, START UP');
check(tank.calls[0].who!==apc.calls[0].who,'different vehicle crews have separate identities');
console.log(`${checks}/${checks} passed`);
