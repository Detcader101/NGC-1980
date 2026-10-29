// Production figure regressions: deformation, pose contacts and the shared rig/LOD contracts. No browser required.
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(new URL('../game/vendor/three.module.min.js',import.meta.url).href)},shortCircuit:true};return n(s,c);}`));
const THREE=await import('../game/vendor/three.module.min.js');
const {buildMarine,poseSkeleton,makePose,BONES,LEN}=await import('../game/js/units/infantry/soldiermodel.js');
const {buildMarineFigure}=await import('../game/js/units/groundwar/marinefigure.js');
const {climbHands,swimHands,selfAidHands}=await import('../game/js/units/infantry/carepose.js');
let pass=0;const test=(name,fn)=>{const info=fn();pass++;console.log('PASS '+name+' '+JSON.stringify(info??{}));};
const v=new THREE.Vector3();
const {restPerson}=await import('../game/js/units/infantry/figinst.js');
const {crewPerson}=await import('../game/js/units/infantry/humanfig.js');
const tris=m=>(m.geometry.index?.count||m.geometry.attributes.position.count)/3;
const count=sk=>{let triangles=0,meshes=0,skin=0;sk.root.traverseVisible(m=>{if(m.isMesh){meshes++;triangles+=tris(m);skin+=m.isSkinnedMesh?1:0;}});return {triangles,meshes,skin};};
const high=buildMarine({detail:'high',seed:2,pack:true}),low=buildMarine({detail:'low',seed:2,pack:true});
test('one visible look-people body at every cached LOD',()=>{
 assert.equal(high.person.lod.levels.length,3);assert.equal(low.person.lod.levels.length,2);
 const cam=new THREE.PerspectiveCamera(),counts=[];
 for(const sk of [high,low]){
  let allSkin=0;sk.root.traverse(m=>{if(m.isSkinnedMesh){allSkin++;assert.equal(m.parent,sk.person.lod);}});
  assert.equal(allSkin,sk.person.meshes.length,'no second garment body attached');
  assert.equal(sk.person.material.name,'RKfig/person');assert.ok(sk.person.material.userData.lp);
  for(const m of sk.person.meshes){const max={hero:100000,near:35000,mid:15000}[m.geometry.userData.lod];assert.ok(tris(m)<max);}
  for(const distance of [2,10,40]){cam.position.set(0,0,distance);cam.updateMatrixWorld(true);sk.root.updateMatrixWorld(true);sk.person.lod.update(cam);const c=count(sk);assert.equal(c.skin,1);counts.push({detail:sk===high?'high':'low',distance,lod:sk.person.meshes.find(m=>m.visible).geometry.userData.lod,...c});}
 }
 for(let i=0;i<low.person.meshes.length;i++)assert.equal(low.person.meshes[i].geometry,high.person.meshes[i+1].geometry,'near/mid geometries shared');
 return counts;
});
test('named rig, bind lengths and LP material/skin attributes',()=>{
 for(const [name,parent,rest]of BONES){const b=high.bones[name];assert.equal(b.parent,high.bones[parent]);assert.deepEqual(b.position.toArray(),rest);}
 let vertices=0;
 for(const m of high.person.meshes){
  const {position:p,skinIndex:i,skinWeight:w,aFig:f,aRM:r}=m.geometry.attributes;
  assert.equal(f.count,p.count);assert.equal(f.itemSize,4);assert.equal(r.count,p.count);assert.equal(r.itemSize,2);
  assert.ok(!m.geometry.hasAttribute('figSurface'),'LP body does not get the weapon/Kit shader');
  for(let n=0;n<w.count;n++){vertices++;assert.ok(Math.abs(w.getX(n)+w.getY(n)+w.getZ(n)+w.getW(n)-1)<1e-5);for(let k=0;k<4;k++)assert.ok(i.getComponent(n,k)<BONES.length);}
 }
 return {weightedVertices:vertices};
});
// Inspect actual cached LP boot vertices in bind foot space, then deform them through the production skeleton.
const soles=high.person.meshes.map(m=>{
 const p=m.geometry.attributes.position,si=m.geometry.attributes.skinIndex,sw=m.geometry.attributes.skinWeight,indices={L:[],R:[]};
 for(const side of ['L','R']){
  const bone=BONES.findIndex(b=>b[0]==='foot'+side);
  for(let i=0;i<p.count;i++){
   let weight=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===bone)weight+=sw.getComponent(i,k);
   if(weight<.5)continue;
   v.fromBufferAttribute(p,i).applyMatrix4(m.skeleton.boneInverses[bone]);
   if(v.y<-.02&&Math.abs(v.x)<.09&&v.z<.11)indices[side].push(i);
  }
  assert.ok(indices[side].length>5,'boot sole samples '+m.name+side);
 }
 return {m,indices};
});
const footMin=(mesh,indices)=>{let min=Infinity;for(const i of indices){mesh.getVertexPosition(i,v);min=Math.min(min,v.y);}return min;};
test('walk and crouch support soles clear flat ground through all LP levels',()=>{
 let minimum=Infinity,maxSupport=0;
 for(const stance of ['stand','crouch'])for(let j=0;j<96;j++){
  poseSkeleton(high,makePose({stance,stanceFrom:stance,stanceTo:stance,speed:stance==='stand'?1.45:.6,moveF:1.45,gait:'walk',gaitPhase:j/96*Math.PI*2}),0);
  for(const {m,indices} of soles){
   const y=Math.min(footMin(m,indices.L),footMin(m,indices.R));minimum=Math.min(minimum,y);maxSupport=Math.max(maxSupport,y);
   assert.ok(y>=-.003&&y<.035,stance+' phase '+j+' '+m.name+': sole '+y);
  }
 }
 return {phases:192,lods:soles.length,minSoleY:minimum,maxSupportSoleY:maxSupport};
});
test('care, prone, swim, climb and seated poses retain finite connected limbs',()=>{
 const poses=[makePose({stance:'prone',stanceFrom:'prone',stanceTo:'prone',speed:.32}),makePose({down:true}),makePose({seat:true}),makePose({climb:.2,hands:climbHands(.2),sling:1}),makePose({swim:{ph:.45,speed:.8},hands:swimHands(.45,1),sling:1}),makePose({stance:'crouch',stanceFrom:'crouch',stanceTo:'crouch',hands:selfAidHands('legL',.3),sling:1})];
 let minProne=Infinity;
 for(const p of poses)for(let n=0;n<12;n++){
  p.gaitPhase=n*Math.PI/6;poseSkeleton(high,p,.1);
  for(const side of ['L','R'])for(const [a,b,length]of [['thigh','shin',LEN.thigh],['shin','foot',LEN.shin],['upperArm','forearm',LEN.upperArm],['forearm','hand',LEN.forearm]]){
   const A=high.bones[a+side].getWorldPosition(new THREE.Vector3()),B=high.bones[b+side].getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(A.distanceTo(B)-length)<1e-6);
  }
  high.root.traverse(m=>{if(m.isSkinnedMesh){for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,v);assert.ok(Number.isFinite(v.x+v.y+v.z));if(p.stance==='prone'&&n>4&&v.y<.5)minProne=Math.min(minProne,v.y);}}});
 }
 assert.ok(minProne>-.018,'LP prone body clears ground: '+minProne);return {poses:poses.length,minProneBodyY:minProne};
});
test('seat entry and exit blend without changing final sockets',()=>{
 poseSkeleton(high,makePose({}),0);let before=high.bones.pelvis.position.clone(),maxStep=0;
 for(const seated of [true,false])for(let i=0;i<30;i++){poseSkeleton(high,makePose({seat:seated}),1/60);const p=high.bones.pelvis.position;maxStep=Math.max(maxStep,p.distanceTo(before));before.copy(p);}
 assert.ok(maxStep<.07);assert.ok(Math.abs(high.bones.pelvis.position.y-.986)<.01);return {maxPelvisStepM:maxStep};
});
test('lite seated, prone and casualty states do not leak into standing',()=>{
 const F=buildMarineFigure();const body=F.group.children[0].children[0];
 F.poseFull(makePose({seat:true}));assert.ok(body.position.y<-.4);
 F.poseFull(makePose({stance:'prone'}));assert.ok(body.rotation.x< -1.4);
 F.poseFull(makePose({down:true}));F.poseFull(makePose({}));assert.equal(body.rotation.x,0);
 for(const hip of body.children.filter(o=>o.isGroup&&o!==body.children.at(-1))){assert.equal(hip.rotation.x,0);const knee=hip.children.find(o=>o.isGroup);if(knee)assert.equal(knee.rotation.x,0);}
 return {states:4};
});
test('baked crews and instanced crowd contracts remain intact',()=>{
 const crowd=restPerson('deck'),again=restPerson('deck');assert.equal(crowd,again);
 for(const a of ['aLimb','aFig','aRM'])assert.equal(crowd.attributes[a].count,crowd.attributes.position.count);
 assert.ok(!crowd.hasAttribute('skinIndex')&&!crowd.hasAttribute('skinWeight'));
 const weights=crowd.attributes.aLimb;
 for(let i=0;i<weights.count;i++)assert.ok(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)<=1.00001);
 const crew=crewPerson('helo','seated');
 assert.ok(crew.hasAttribute('aFig')&&crew.hasAttribute('aRM'));assert.ok(!crew.hasAttribute('skinWeight'));
 assert.ok(crew.index.count>0);return {crowdTriangles:crowd.userData.tris,bakedCrewTriangles:crew.index.count/3};
});
console.log(`${pass} figure checks passed`);
