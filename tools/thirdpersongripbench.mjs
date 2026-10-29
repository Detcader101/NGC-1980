#!/usr/bin/env node
// Production TP fitting: posed LP hand surfaces against weapon furniture and adjacent parts, plus state transitions.
// Contact proxies are conservative cylinders/boxes; adjacent bipod/sling checks use their actual mesh vertices.
import assert from 'node:assert/strict';
import { register } from 'node:module';
const threeURL = new URL('../game/vendor/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`));
const T = await import('three');
const {buildMarine,poseSkeleton,makePose,BONES,LEN,applyRiflemanWeaponPose} = await import('../game/js/units/infantry/soldiermodel.js');
const {createRifleman} = await import('../game/js/units/infantry/rifleman.js');
const {selfAidHands,climbHands,swimHands} = await import('../game/js/units/infantry/carepose.js');
let passed=0;
const test=(name,fn)=>{const detail=fn();passed++;console.log('PASS '+name+' '+JSON.stringify(detail??{}));};
const sk=buildMarine({detail:'high',weapon:'M16A1/M203',seed:2});
sk.root.position.set(1,.2,-2);sk.root.rotation.y=.35;
const modes=[['M16A1','rifle'],['M16A1/M203','rifle'],['M16A1/M203','gl'],['M60','mg'],['M72A2','law'],['M1911A1','pistol']];
const weaponState={law:1,lawSights:1,bipod:0};
const indexCache=new WeakMap();
function handIndices(g,side){
 let sides=indexCache.get(g);if(!sides){sides={};indexCache.set(g,sides);}if(sides[side])return sides[side];
 const si=g.attributes.skinIndex,sw=g.attributes.skinWeight,bi=BONES.findIndex(b=>b[0]==='hand'+side),indices=[];
 for(let i=0;i<si.count;i++){let w=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===bi)w+=sw.getComponent(i,k);if(w>.99)indices.push(i);}
 assert(indices.length>100);return sides[side]=indices;
}
function handPoints(m,side){return handIndices(m.geometry,side).map(i=>sk.weaponModel.group.worldToLocal(m.localToWorld(m.getVertexPosition(i,new T.Vector3()))));}
const tube=(cy,r,z0,z1)=>p=>p.z<z0||p.z>z1?null:Math.hypot(p.x,p.y-cy)-r;
const box=(c,b)=>p=>{const q=p.toArray().map((v,i)=>Math.abs(v-c[i])-b[i]);return Math.hypot(...q.map(v=>Math.max(v,0)))+Math.min(Math.max(...q),0);};
function measure(points,distance){let min=Infinity,nearest=Infinity,inside3mm=0,contacts3mm=0,samples=0;for(const p of points){const d=distance(p);if(d===null)continue;samples++;min=Math.min(min,d);nearest=Math.min(nearest,Math.abs(d));if(d<-.003)inside3mm++;if(Math.abs(d)<.003)contacts3mm++;}return{min,nearest,inside3mm,contacts3mm,samples};}
const contactResults=[];
test('posed hand contact at every LP LOD, with transformed figure root',()=>{
 for(const [key,cls]of modes.slice(1,5)){
  sk.setWeapon(key);poseSkeleton(sk,makePose({cls,ads:1,weaponState}),0);
  const solids=cls==='rifle'?[['L','launcher',tube(-.122,.026,-.44,-.2)]]:cls==='gl'?[['L','magazine',box([0,-.175,-.066],[.013,.075,.033])]]:cls==='mg'?[['L','forearm',box([0,-.099,-.175],[.026,.032,.08])]]:[['L','tube',tube(-.07,.039,-.388,.268)],['R','tube',tube(-.07,.039,-.388,.268)]];
  for(const m of sk.person.meshes)for(const[side,part,distance]of solids){const q=measure(handPoints(m,side),distance);assert.equal(q.inside3mm,0,`${key}/${cls}/${m.geometry.userData.lod}/${side} penetrates ${part}: ${q.min}`);assert(q.nearest<.004&&q.contacts3mm>0,'contact must not float');contactResults.push({weapon:key,cls,lod:m.geometry.userData.lod,side,part,...q});}
  if(cls==='rifle')for(const m of sk.person.meshes)assert.equal(measure(handPoints(m,'L'),tube(-.072,.03,-.425,-.17)).inside3mm,0,'M203 upper handguard clear');
  if(cls==='gl'){const tip=sk.bones.handR.localToWorld(new T.Vector3(-.027,-.1104,-.05)),anchor=sk.weaponModel.group.localToWorld(sk.weaponModel.anchor('glTrigger'));assert(tip.distanceTo(anchor)<.001,'index contact on original GL trigger anchor');}
 }
 return contactResults;
});
// Distance to the actual posed hand triangles; parity along a non-axis-aligned ray determines inside/outside.
// This avoids treating distant points beyond a coarse triangle edge as inside based only on its face normal.
function handTriangles(m,side){
 const g=m.geometry,ids=new Set(handIndices(g,side)),ii=g.index.array,vertices=new Map(),triangles=[];
 const at=i=>{let v=vertices.get(i);if(!v){v=sk.weaponModel.group.worldToLocal(m.localToWorld(m.getVertexPosition(i,new T.Vector3())));vertices.set(i,v);}return v;};
 for(let j=0;j<ii.length;j+=3){const a=ii[j],b=ii[j+1],c=ii[j+2];if(!ids.has(a)||!ids.has(b)||!ids.has(c))continue;const t=new T.Triangle(at(a),at(b),at(c));triangles.push({t,normal:t.getNormal(new T.Vector3()),bounds:new T.Box3().setFromPoints([t.a,t.b,t.c])});}
 return triangles;
}
const closest=new T.Vector3(),hit=new T.Vector3(),ray=new T.Ray(new T.Vector3(),new T.Vector3(1,.193,.071).normalize());
function meshDistance(triangles,p){let best=Infinity;const crossings=[];ray.origin.copy(p);for(const {t,bounds}of triangles){if(bounds.distanceToPoint(p)<=best){t.closestPointToPoint(p,closest);best=Math.min(best,p.distanceTo(closest));}if(ray.intersectsBox(bounds)&&ray.intersectTriangle(t.a,t.b,t.c,false,hit))crossings.push(hit.distanceTo(p));}crossings.sort((a,b)=>a-b);const unique=crossings.filter((d,i)=>i===0||d-crossings[i-1]>1e-7);return best*(unique.length%2?-1:1);}
function meshPoints(root,filter=()=>true){const points=[];root.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){const q=new T.Vector3().fromBufferAttribute(p,i);if(filter(q,m))points.push(sk.weaponModel.group.worldToLocal(m.localToWorld(q)));}});return points;}
test('actual folded bipod and LAW sling clear the posed hand meshes',()=>{
 const results=[];
 for(const key of ['M60','M72A2']){
  sk.setWeapon(key);poseSkeleton(sk,makePose({cls:key==='M60'?'mg':'law',ads:1,weaponState}),0);
  const points=key==='M60'?meshPoints(sk.weaponModel.parts.bipod):meshPoints(sk.weaponModel.group.getObjectByName('outerMesh'),q=>q.x>.04&&q.y<=0&&q.y>=-.03&&q.z>=-.34&&q.z<=.20);
  assert(points.length>100,'sampled actual adjacent part geometry');
  for(const m of sk.person.meshes)for(const side of key==='M60'?['L']:['L','R']){
   const triangles=handTriangles(m,side),q=measure(points,p=>meshDistance(triangles,p));assert.equal(q.inside3mm,0,`${key}/${side}/${m.geometry.userData.lod} adjacent part enters hand: ${q.min}`);results.push({weapon:key,side,lod:m.geometry.userData.lod,part:key==='M60'?'folded bipod':'sling',...q});
  }
 }
 return results;
});
const camera=new T.PerspectiveCamera();camera.position.set(1,1,0);camera.updateMatrixWorld(true);
function finiteRig(){
 sk.person.lod.update(camera);
 for(const b of Object.values(sk.bones))assert(b.matrixWorld.elements.every(Number.isFinite));
 for(const side of ['L','R'])for(const [a,b,len]of [['upperArm','forearm',LEN.upperArm],['forearm','hand',LEN.forearm],['thigh','shin',LEN.thigh],['shin','foot',LEN.shin]])assert(Math.abs(sk.bones[a+side].getWorldPosition(new T.Vector3()).distanceTo(sk.bones[b+side].getWorldPosition(new T.Vector3()))-len)<1e-5);
 assert.equal(sk.person.meshes.filter(m=>m.visible).length,1,'one active LP body');
}
test('weapon modes, postures and action overrides keep rig and raw anchors intact',()=>{
 let states=0;
 for(const[key,cls]of modes){sk.setWeapon(key);const raw=JSON.stringify(sk.weaponModel.anchors);
  for(const stance of ['stand','crouch','prone','seat'])for(const ads of [0,1])for(const action of [null,{name:'reload',p:.25},{name:'reload',p:.75},{name:'charge',p:.5},{name:'checkMag',p:.5}]){
   const seated=stance==='seat',s=seated?'stand':stance;
   const p=makePose({cls,ads,stance:s,stanceFrom:s,stanceTo:s,seat:seated,action,weaponState});for(let i=0;i<8;i++)poseSkeleton(sk,p,.1);
   finiteRig();assert.equal(JSON.stringify(sk.weaponModel.anchors),raw,'gameplay anchors unchanged');states++;
  }
 }
 return{states};
});
test('care, sling, down, climb, swim and unarmed reset profiles then restore grips',()=>{
 const results=[];
 for(const[key,cls]of [['M16A1/M203','rifle'],['M16A1/M203','gl'],['M60','mg'],['M72A2','law']]){
  sk.setWeapon(key);const p=makePose({cls,ads:.5,weaponState});for(let i=0;i<30;i++)poseSkeleton(sk,p,1/60);const fitted={...sk.person.gripProfiles};
  const actions=[{hands:selfAidHands('legL',.3),sling:1},{sling:1},{down:true},{climb:.2,hands:climbHands(.2),sling:1},{swim:{ph:.45,speed:.8},hands:swimHands(.45,1),sling:1}];
  for(const state of actions){for(let i=0;i<30;i++)poseSkeleton(sk,{...p,...state},1/60);assert.deepEqual(sk.person.gripProfiles,{L:null,R:null});finiteRig();for(let i=0;i<45;i++)poseSkeleton(sk,p,1/60);assert.deepEqual(sk.person.gripProfiles,fitted);}
  sk.setWeapon(null);for(let i=0;i<30;i++)poseSkeleton(sk,makePose({}),1/60);assert.deepEqual(sk.person.gripProfiles,{L:null,R:null});for(const s of ['L','R'])assert(sk.bones['hand'+s].quaternion.angleTo(new T.Quaternion())<1e-6);
  sk.setWeapon(key);for(let i=0;i<30;i++)poseSkeleton(sk,p,1/60);assert.deepEqual(sk.person.gripProfiles,fitted);results.push({weapon:key,cls,restored:fitted});
 }
 return results;
});
test('care entry and final restoration do not jump to the legacy wrist baseline',()=>{
 const results=[];
 for(const[key,cls]of [['M16A1/M203','rifle'],['M16A1/M203','gl'],['M72A2','law']]){
  const model=buildMarine({detail:'low',weapon:key,seed:2}),p=makePose({cls,ads:.5,weaponState});for(let i=0;i<20;i++)poseSkeleton(model,p,1/60);
  let prev=model.bones.handL.getWorldPosition(new T.Vector3());const aid={...p,hands:selfAidHands('legL',.3),sling:1};poseSkeleton(model,aid,1/60);let cur=model.bones.handL.getWorldPosition(new T.Vector3());const entry=cur.distanceTo(prev);assert(entry<.03,`care entry pop ${key}/${cls}: ${entry}`);
  for(let i=0;i<25;i++)poseSkeleton(model,aid,1/60);prev=model.bones.handL.getWorldPosition(new T.Vector3());const exit=[];
  for(let i=0;i<20;i++){poseSkeleton(model,p,1/60);cur=model.bones.handL.getWorldPosition(new T.Vector3());exit.push(cur.distanceTo(prev));prev.copy(cur);}
  assert(exit[15]<.005,`final care blend release pop ${key}/${cls}: ${exit[15]}`);results.push({weapon:key,cls,entryM:entry,finalReleaseM:exit[15]});
 }
 return results;
});
test('shared adapter projects real rifleman GL and LAW state',()=>{
 const R=createRifleman({loadout:'range'});R.step(1/60,{actions:['gl']});const p=applyRiflemanWeaponPose(makePose({ads:1}),R);assert.equal(p.cls,'gl');sk.setWeapon('M16A1/M203');poseSkeleton(sk,p,0);
 const tip=sk.bones.handR.localToWorld(new T.Vector3(-.027,-.1104,-.05)),target=sk.weaponModel.group.localToWorld(sk.weaponModel.anchor('glTrigger'));assert(tip.distanceTo(target)<.001);
 R.slot=2;R.glMode=false;R.step(1/60,{actions:['law']});for(let i=0;i<200;i++)R.step(1/60,{});const law=applyRiflemanWeaponPose(makePose({ads:1}),R);assert.equal(R.carrier.law,'extended');assert.equal(law.weaponState.law,1);sk.setWeapon('M72A2');poseSkeleton(sk,law,0);assert.equal(sk.weaponModel.parts.inner.position.z,.378);assert.equal(sk.weaponModel.parts.frontSight.rotation.x,0);
 return{glIndexErrorM:tip.distanceTo(target),law:R.carrier.law,innerZ:sk.weaponModel.parts.inner.position.z,note:'Actual player/rich-AI caller wiring is exercised by scenes/tpgripgame.mjs'};
});
console.log(`${passed} third-person grip checks passed`);
