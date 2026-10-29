// A controlled study of the production Marine, including the actual close and squad geometries.
import * as THREE from 'three';
import { buildMarine, poseSkeleton, makePose } from '../js/units/infantry/soldiermodel.js';
import { climbHands, swimHands, selfAidHands } from '../js/units/infantry/carepose.js';
const Q = new URLSearchParams(location.search), scene = new THREE.Scene();
scene.background = new THREE.Color(0x89969a);
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio, +(Q.get('res') || 1))); document.body.prepend(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xdde8ef, 0x57584c, 1.7));
const sun = new THREE.DirectionalLight(0xffedda, 2.2); sun.position.set(-3,6,-5); scene.add(sun);
const fill = new THREE.DirectionalLight(0xb7ccd7,.65); fill.position.set(3,2,3); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x636b63,roughness:1}));scene.add(floor);
const grid = new THREE.GridHelper(8,32,0x777c73,0x6a7269);grid.position.y=.002;scene.add(grid);
const camera = new THREE.PerspectiveCamera(32,1,.01,100);
const models = ['high','low'].map(detail => {const m=buildMarine({seed:2,detail,weapon:'M16A1',pack:true});scene.add(m.root);return m;});
const clothed = buildMarine({seed:2,detail:'high',weapon:null,helmet:false,vest:false,frags:0});scene.add(clothed.root);models.push(clothed);
const cam={yaw:Math.PI-.5,pitch:.08,dist:3.8,t:new THREE.Vector3(0,.95,0)};
const weaponClasses={'M16A1':'rifle','M16A1/M203':'rifle','M60':'mg','M72A2':'law','M1911A1':'pistol'};
const state={view:'stand',detail:0,time:0,play:false,orbit:false,weapon:'M16A1',cls:'rifle',weaponState:{},inspect:null};
const views={stand:[3.8,.95,0,.08],face:[.72,1.68,-.02,.02],cloth:[3.6,.95,0,.06],aim:[3.3,1,0,.06],kneel:[3.1,.64,-.05,.1],prone:[3.5,.28,.3,.4],seated:[3,.7,-.12,.1],walk:[3.8,.95,0,.1],run:[3.8,.95,0,.1],climb:[3.8,.95,0,.1],swim:[3.8,.95,0,.25],aid:[3.1,.64,-.05,.15],transition:[3.8,.85,.1,.12]};
function poseAt(view,t){
 const p=makePose({gaitPhase:t*5,breath:Math.sin(t*1.6),cls:state.cls,weaponState:state.weaponState});
 if(view==='aim')p.ads=1;
 if(view==='kneel'||view==='aid')p.stance=p.stanceFrom=p.stanceTo='crouch';
 if(view==='prone'){p.stance=p.stanceFrom=p.stanceTo='prone';p.ads=1;}
 if(view==='seated')p.seat=true;
 if(view==='walk'||view==='run'){p.speed=view==='run'?3.2:1.45;p.gait=view;p.moveF=p.speed;p.lower=view==='run'?.4:0;}
 if(view==='climb'){p.climb=.2+t*.35;p.hands=climbHands(p.climb);p.sling=1;}
 if(view==='swim'){p.swim={ph:(t*.4+.45)%1,speed:.8};p.hands=swimHands(p.swim.ph,1);p.sling=1;}
 if(view==='aid'){p.hands=selfAidHands('legL',.3);p.sling=1;}
 if(view==='transition'){
  const poses=['stand','crouch','prone','crouch','stand'],phase=(t%8)/2,i=Math.floor(phase);
  p.stance=poses[i+1];p.stanceFrom=poses[i];p.stanceTo=poses[i+1];p.stanceT=Math.min(1,(phase-i)*1.65);p.ads=.4;
 }
 return p;
}
function active(){return state.view==='cloth'?clothed:models[state.detail];}
function update(dt){const m=active();for(const n of models)n.root.visible=n===m;poseSkeleton(m,poseAt(state.view,state.time),dt);}
function counts(){
 const m=active();let triangles=0,meshes=0,skinned=0,lod='parts';
 m.root.updateMatrixWorld(true);m.person?.lod.update(camera);
 m.root.traverseVisible(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;if(o.isSkinnedMesh){skinned++;lod=o.geometry.userData.lod;}}});
 return {triangles,meshes,skinned,lod,view:state.view,detail:m===clothed||!state.detail?'high':'low',weapon:m.weaponKey,cls:state.cls};
}
// inspect = {pos, look}: exact camera coordinates in the current weapon's local frame, independent of hand pose.
function set(view,opts={}){
 state.view=view;state.time=opts.time??0;state.play=opts.play??false;if(opts.detail!=null)state.detail=opts.detail;
 if(opts.weapon!==undefined){if(!(opts.weapon in weaponClasses))throw new Error('Unknown preview weapon '+opts.weapon);state.weapon=opts.weapon;for(const m of models.slice(0,2))m.setWeapon(state.weapon);}
 state.cls=opts.cls??weaponClasses[state.weapon];state.weaponState=opts.weaponState??(state.weapon==='M72A2'?{law:1,lawSights:1}:{});state.inspect=opts.inspect??null;
 const [dist,y,z,pitch]=views[view];Object.assign(cam,{dist:opts.distance??dist,pitch,yaw:opts.yaw??Math.PI-.5});cam.t.set(0,y,z);
 active().state.t=0;for(let i=0;i<8;i++)update(.1);render();return counts();
}
const inspectTarget=new THREE.Vector3(),inspectRotation=new THREE.Quaternion();
function render(){
 camera.up.set(0,1,0);
 if(state.inspect&&active().weaponModel){
  const g=active().weaponModel.group;g.updateWorldMatrix(true,false);
  camera.position.fromArray(state.inspect.pos);g.localToWorld(camera.position);
  inspectTarget.fromArray(state.inspect.look);g.localToWorld(inspectTarget);
  camera.up.applyQuaternion(g.getWorldQuaternion(inspectRotation));camera.lookAt(inspectTarget);
 }else{camera.position.set(Math.sin(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),Math.cos(cam.yaw)*Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t);camera.lookAt(cam.t);}
 camera.updateMatrixWorld();renderer.render(scene,camera);stats();
}
function size(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',size);size();
let previous=performance.now();function loop(now){const dt=Math.min(.05,(now-previous)/1000);previous=now;if(state.play)state.time+=dt;update(state.play?dt:0);render();requestAnimationFrame(loop);}requestAnimationFrame(loop);
let drag=null;renderer.domElement.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(drag){cam.yaw-=(e.clientX-drag[0])*.006;cam.pitch=THREE.MathUtils.clamp(cam.pitch+(e.clientY-drag[1])*.004,-.2,1.1);drag=[e.clientX,e.clientY];}});renderer.domElement.addEventListener('pointerup',()=>drag=null);renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();cam.dist=THREE.MathUtils.clamp(cam.dist*Math.exp(e.deltaY*.001),.35,55);},{passive:false});
for(const view of Object.keys(views)){const b=document.createElement('button');b.textContent=view;b.onclick=()=>{set(view);stats();};document.getElementById('poses').append(b);}
const weapons=document.createElement('div');document.getElementById('poses').after(weapons);
for(const weapon of Object.keys(weaponClasses)){const b=document.createElement('button');b.textContent=weapon;b.onclick=()=>set(state.view,{weapon});weapons.append(b);}
if(Q.get('ui')==='0')for(const el of document.querySelectorAll('aside,footer'))el.style.display='none';
function stats(){const c=counts(),s=`${c.detail} / ${c.lod} · ${c.triangles.toLocaleString()} visible triangles · ${c.meshes} meshes`,el=document.getElementById('stats');if(el.textContent!==s)el.textContent=s;}
document.getElementById('detail').onclick=()=>{state.detail=1-state.detail;update(0);stats();};document.getElementById('play').onclick=()=>state.play=!state.play;
set('stand');stats();window.__H={scene,camera,renderer,models,cam,state,set,counts,active,poseAt,advance(dt){state.time+=dt;update(dt);render();}};window.__BENCH={renderer,host:'dev-people',mode:'preview',get state(){return state.play?'live':'paused';}};
