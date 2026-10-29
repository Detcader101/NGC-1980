#!/usr/bin/env node
// Presentation contracts only: no weapon ballistics or gameplay figures changed by this pass.
import assert from 'node:assert/strict';
import {register} from 'node:module';
const threeURL=new URL('../game/vendor/three.module.min.js',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`));
const THREE=await import('three');
const {createViewmodel,solveArm,sdfHandGeo}=await import('../game/js/units/infantry/viewmodel.js');
const {createRifleman}=await import('../game/js/units/infantry/rifleman.js');
const {createBodyVM}=await import('../game/js/units/infantry/bodyvm.js');
const {sleeveGeo,fpHand}=await import('../game/js/units/infantry/handkit.js');
const {handSocket}=await import('../game/js/units/infantry/handposes.js');
const {SdfKit}=await import('../game/js/units/infantry/sdfmesh.js');
const {SdfHandRecorder}=await import('../game/js/units/infantry/humanfig.js');
const {buildWeaponModel}=await import('../game/js/units/infantry/weaponmodels.js');
const vm=createViewmodel(),R=createRifleman({loadout:'range',seed:1980,swayScale:0}),S=R.soldier;
// Exercise the real LP recorder contract (including nail quaternion/radii), then the single welded SDF skin.
// Surface nets may retain saddle edges shared by four faces; there must be no open boundary or detached part.
for(const side of ['L','R'])for(const gripR of [.017,.028,.029,.030,.033,.041])for(const open of [false,true]){
  const desc=new SdfKit(),w=fpHand(new SdfHandRecorder(desc),{side,gripR,open,trigger:side==='R'});
  assert(desc.prims.length===29,'SDF-compatible anatomical primitives');
  for(const prim of desc.prims)assert(prim.box.every(Number.isFinite),'finite SDF primitive');
  const {g}=sdfHandGeo({side,gripR,open,trigger:side==='R'}),p=g.attributes.position,edges=new Map(),ix=g.index.array;
  const roots=Array.from({length:p.count},(_,i)=>i),find=i=>roots[i]===i?i:(roots[i]=find(roots[i]));
  for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++){const a=ix[i+j],b=ix[i+(j+1)%3],k=a<b?a+':'+b:b+':'+a;edges.set(k,(edges.get(k)||0)+1);roots[find(a)]=find(b);}
  assert([...edges.values()].every(n=>n===2||n===4),'SDF surface has no open boundary');
  assert.equal(new Set(roots.map(find)).size,1,'one connected SDF surface');
  assert.equal(g.userData.handSurface,'LP/SDF');
  for(const attr of ['position','normal','color','aFig','aRM'])assert([...g.attributes[attr].array].every(Number.isFinite),attr+' finite');
  assert(w.wrist.toArray().every(Number.isFinite),'finite authored wrist');
}
// Nail patches must follow the distal finger surface without local face inversion. A separate thumb-nail
// frame used to fold 5–6 triangles backwards, which rendered as detached caps despite connected topology.
const capsuleFrame=p=>{
  const z=new THREE.Vector3(p.bax,p.bay,p.baz),len=z.length();z.divideScalar(len);
  const x=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),z).normalize(),y=new THREE.Vector3().crossVectors(z,x);
  return new THREE.Matrix4().compose(new THREE.Vector3(...p.a),new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)),new THREE.Vector3((p.ra+p.rb)/2,(p.ra+p.rb)/2,len));
};
for(const side of ['L','R']){
  const source=new SdfKit(),rec=new SdfHandRecorder(source,{k:.0026});fpHand(rec,{side,gripR:.024,open:true});
  source.prims.forEach((p,i)=>p.skin=String(i));const surf=source.mesh(.0031,{iters:4});
  const nails=source.prims.map((p,i)=>p.mat===rec.nail?i:-1).filter(i=>i>=0);
  for(const [gripR,thumb] of [[.017,'wrap'],[.029,'wrap'],[.041,'wrap'],[.029,'m203'],[.041,'law']])for(const trigger of [false,true]){
    const target=new SdfKit();fpHand(new SdfHandRecorder(target,{k:.0026}),{side,gripR,trigger,thumb});
    const pos=sdfHandGeo({side,gripR,trigger,thumb}).g.attributes.position;
    for(const nail of nails){
      const mask=surf.skinAcc.map(a=>a[nail]&&a[nail]/Object.values(a).reduce((a,b)=>a+b,0)>.05);
      const xf=capsuleFrame(target.prims[nail-1]).multiply(capsuleFrame(source.prims[nail-1]).invert());
      for(let i=0;i<surf.index.length;i+=3){
        const ids=surf.index.slice(i,i+3);if(!ids.some(id=>mask[id]))continue;
        const dst=ids.map(id=>new THREE.Vector3().fromBufferAttribute(pos,id)),src=ids.map(id=>new THREE.Vector3().fromArray(surf.pos,id*3).applyMatrix4(xf));
        const dn=dst[1].sub(dst[0]).cross(dst[2].sub(dst[0])).normalize(),sn=src[1].sub(src[0]).cross(src[2].sub(src[0])).normalize();
        assert(dn.dot(sn)>0,side+' '+gripR+' nail patch preserves outward winding');
      }
    }
  }
  // Check the actual deformed thumb surface in weapon space, not just its descriptor's joint coordinates.
  // These bounds keep the M203 thumb below the upper handguard and both LAW thumbs below the sight corridor.
  for(const [thumb,key,gripR,ceiling] of [['m203','M16A1',.029,-.105],['law','M72A2',.041,-.045]]){
    if(thumb==='m203'&&side==='R')continue;
    const anchor=side==='L'?'fore':'grip',socket=handSocket(key,side,anchor,true),model=buildWeaponModel(thumb==='m203'?'M16A1/M203':key);
    const pos=sdfHandGeo({side,gripR,thumb,trigger:false}).g.attributes.position,centre=new THREE.Vector3(...model.anchors[anchor]).add(new THREE.Vector3(...socket.offset));
    let maxY=-Infinity;
    for(let i=0;i<surf.skinAcc.length;i++){
      const a=surf.skinAcc[i],total=Object.values(a).reduce((a,b)=>a+b,0),thumbWeight=Object.entries(a).reduce((sum,[id,w])=>sum+(+id>=24?w:0),0);
      if(thumbWeight/total>.5)maxY=Math.max(maxY,new THREE.Vector3().fromBufferAttribute(pos,i).applyQuaternion(socket.rotation).add(centre).y);
    }
    assert(maxY<ceiling,thumb+' '+side+' thumb clears upper furniture/sight: '+maxY);
    assert.equal(socket.thumb,thumb,'socket selects its authored thumb profile');
  }
}
const mgModel=buildWeaponModel('M60'),mgSocket=handSocket('M60','L','fore'),mgCentre=mgModel.anchors.fore[2]+mgSocket.offset[2];
assert(mgCentre>=-.255-1e-9&&mgCentre<=-.095,'M60 support centre reaches the detailed forearm');
// The detailed models keep their moving parts and presentation anchors at both authored detail levels.
for(const key of ['M16A1','M16A1/M203','M60','M1911A1','M72A2'])for(const detail of ['high','low']){
  const model=buildWeaponModel(key,{detail});let vertices=0;
  for(const name of ['grip','fore','muzzle'])assert(model.anchors[name]?.every(Number.isFinite),key+' '+name+' anchor');
  for(const state of [{},{charge:1,cover:1,glOpen:1,slide:1,law:1,lawSights:1},{charge:0,cover:0,glOpen:0,slide:0,law:0,lawSights:0}]){
    model.setState(state);model.group.updateMatrixWorld(true);
    model.group.traverse(o=>{assert(o.matrixWorld.elements.every(Number.isFinite),key+' part transform');if(o.geometry){for(const attr of ['position','normal'])assert([...o.geometry.attributes[attr].array].every(Number.isFinite),key+' '+attr);vertices+=o.geometry.attributes.position.count;}});
  }
  assert(vertices>1000,key+' detailed geometry built');
}
let poses=0,maxCuff=0;
function checkPose(label){
  vm.root.updateMatrixWorld(true);
  vm.root.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite),label+' finite '+o.name));
  for(const arm of Object.values(vm.arms)){
    const wrist=arm.hand.localToWorld(arm.hand.userData.wrist.clone()),cuff=arm.fo.localToWorld(new THREE.Vector3(0,-0.28,0));
    const error=wrist.distanceTo(cuff);maxCuff=Math.max(maxCuff,error);assert(error<1e-6,label+' cuff attached: '+error);
    assert(Math.abs(arm.fo.quaternion.length()-1)<1e-6,label+' unit arm rotation');
  }
  poses++;
}
const actions={M16A1:['tactical','speed','charge','boltRelease','fa','ia','remedialStuck','remedialDouble','checkMag','checkChamber','inspect'],M203:['reload','open','ia','inspect'],M60:['reload','charge','ia','remedialStuck','barrel','breakBelt','checkChamber','inspect'],M1911A1:['tactical','speed','charge','ia','checkMag','checkChamber','inspect'],M72A2:['extend','arm','collapse','ia','inspect']};
for(const [slot,gl] of [[0,false],[0,true],[1,false],[2,false],[3,false]]){
  R.slot=slot;R.glMode=gl;
  for(const stance of ['stand','crouch','prone'])for(const ads of [0,0.5,1])for(const lower of [0,0.5,1]){
    Object.assign(S,{stance,stanceFrom:stance,stanceTo:stance,stanceT:1,ads,lower,bipod:false});vm.update(1/60,R);checkPose(R.cur.key+' '+stance+' '+ads+' '+lower);
  }
  Object.assign(S,{stance:'stand',stanceFrom:'stand',stanceTo:'stand',stanceT:1,ads:0,lower:0});
  for(const action of actions[R.cur.key])for(let i=0;i<=20;i++){
    R.cur.act={name:action,t:i/20,dur:1};vm.update(1/60,R);checkPose(R.cur.key+' '+action+' '+i);
  }
  R.cur.act=null;
}
R.slot=0;R.glMode=false;const launcher=R.carrier.gl;R.carrier.gl=null;
for(const ads of [0,.5,1]){S.ads=ads;vm.update(1/60,R);checkPose('plain M16A1 '+ads);}
R.carrier.gl=launcher;
for(const arm of Object.values(vm.arms)){
  for(const target of [arm.sh.clone(),arm.sh.clone().add(arm.pole),new THREE.Vector3(0,-1,-1)]){
    const local=arm.hand.userData.wrist.clone().applyQuaternion(arm.hand.quaternion);arm.hand.position.copy(target).sub(local);arm.hand.updateMatrix();solveArm(arm,target);checkPose('IK singular/reach');
  }
}
// The support hand's back faces down, thumb points toward the muzzle, and wrist returns toward the body.
for(const key of ['M16A1','M60','M72A2']){
  const f=handSocket(key,'L','fore',true),back=new THREE.Vector3(-1,0,0).applyQuaternion(f.rotation),thumb=new THREE.Vector3(0,1,0).applyQuaternion(f.rotation),wrist=new THREE.Vector3(0,0,1).applyQuaternion(f.rotation);
  assert(back.y<-.95&&thumb.z<-.5&&wrist.z>.5,key+' anatomical support frame');
}
const sleeve=sleeveGeo(.28,.05,.03,{folds:0,cuff:false}),p=sleeve.attributes.position;
let joint=0,cuff=0;for(let i=0;i<p.count;i++){const r=Math.hypot(p.getX(i),p.getZ(i));if(p.getY(i)>-.001)joint=Math.max(joint,r);if(p.getY(i)<-.279)cuff=Math.max(cuff,r);}
assert(joint>cuff*1.5,'sleeve tapers toward wrist');
// Gait amplitude enters continuously and the exact critical spring remains bounded after a long frame.
R.slot=0;R.glMode=false;Object.assign(S,{stance:'stand',stanceFrom:'stand',stanceTo:'stand',stanceT:1,ads:0,lower:0,gait:'idle'});for(let i=0;i<60;i++)vm.update(1/60,R);
S.gait='sprint';vm.update(1/60,R);assert(vm.gaitE>0&&vm.gaitE<.4,'gait starts softly');
S.camYaw+=1;vm.update(.5,R);assert(Number.isFinite(vm.lag.x)&&Math.abs(vm.lag.x)<.1,'bounded turn spring after hitch');
// Leaving a body action retains the final body pose during the fade, including pitch/ladder phase/aid region.
S.gait='idle';const BV=createBodyVM(vm);
for(const st of [{mode:'ladder',climbY:1.83,pitch:.3},{mode:'swim',speed:.8,pitch:-.2},{mode:'aid',region:'legR',item:'dress',pitch:-.65}]){
  for(let i=0;i<35;i++){vm.update(1/60,R);BV.update(1/60,st);}
  const before=Object.values(vm.arms).map(a=>a.hand.position.clone());
  vm.update(1/60,R);BV.update(1/60,null);
  for(let i=0;i<2;i++)assert(Object.values(vm.arms)[i].hand.position.distanceTo(before[i])<.035,st.mode+' exit continuity');
  checkPose(st.mode+' exit');for(let i=0;i<30;i++){vm.update(1/60,R);BV.update(1/60,null);}
}
// Ladder hands must close around a rail, even after LAW/M60 grips. The right index must curl too. Compare the
// effective full morph to an independently built tight, non-trigger hand, then check the half-entry wrist/shape.
const railReference={};for(const side of ['L','R']){const p=sdfHandGeo({side,gripR:.017,trigger:false});railReference[side]={positions:p.g.attributes.position.array,wrist:p.w.wrist};}
for(const slot of [0,1,2,3]){
  R.slot=slot;R.glMode=false;vm.update(1/60,R);
  const weaponWrist=Object.fromEntries(Object.entries(vm.arms).map(([side,a])=>[side,a.hand.userData.wrist.clone()]));
  BV.update(.125,{mode:'ladder',climbY:1.83,pitch:.15});
  for(const [side,a] of Object.entries(vm.arms)){
    const d=a.hand.userData;assert.equal(d.shapes.grip.morphTargetInfluences[1],.5,'half-entry blends rail geometry');
    assert(d.wrist.distanceTo(weaponWrist[side].lerp(railReference[side].wrist,.5))<1e-9,'half-entry blends wrist with geometry');
  }
  vm.update(1/60,R);BV.update(.125,{mode:'ladder',climbY:1.83,pitch:.15});
  for(const [side,a] of Object.entries(vm.arms)){
    const d=a.hand.userData,m=d.shapes.grip;assert.equal(m.morphTargetInfluences[0],0,'ladder is not open');assert.equal(m.morphTargetInfluences[1],1,'rail fully gripped');
    assert.deepEqual(m.geometry.morphAttributes.position[1].array,railReference[side].positions,side+' tight rail geometry, no trigger index');
  }
  checkPose('ladder independent of '+R.cur.key);
  for(let i=0;i<30;i++){vm.update(1/60,R);BV.update(1/60,null);}
  vm.update(1/60,R);for(const a of Object.values(vm.arms)){assert.equal(a.hand.userData.shapes.grip.morphTargetInfluences[1],0,'weapon grip restored after ladder');assert(a.hand.userData.wrist.distanceTo(a.hand.userData.activeProfile.wrist)<1e-9,'weapon wrist restored');}
}
BV.update(.125,{mode:'swim',speed:0,pitch:0});
for(const arm of Object.values(vm.arms)){
  const g=arm.hand.userData.shapes.grip,m=g.geometry.morphAttributes;
  assert(m.position[0].count===g.geometry.attributes.position.count,'matching morph topology');
  assert(g.morphTargetInfluences[0]>.4&&g.morphTargetInfluences[0]<.6,'hands uncurl continuously at half transition');
  assert([...m.position[0].array,...m.normal[0].array].every(Number.isFinite),'finite hand morphs');
}
let vertices=0;vm.root.traverse(o=>{if(o.geometry){const pos=o.geometry.attributes.position;for(const n of pos.array)assert(Number.isFinite(n),'finite geometry');vertices+=pos.count;}});
console.log(`PASS ${poses} weapon/action/body/degenerate poses; maximum cuff error ${maxCuff.toExponential(2)} m; ${vertices} resident vertices; connected SDF surfaces without open boundaries, detailed weapons, support chirality, sleeve taper, hand morphs, inertial and overlay continuity checks.`);
