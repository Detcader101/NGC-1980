import * as THREE from 'three';
import * as RK from '../js/renderkit/index.js';
import { buildJetMesh } from '../js/jetmodel.js';

const stage=document.querySelector('#stage');
const renderer=new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setPixelRatio(1); renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x182124);
const camera=new THREE.PerspectiveCamera(35,1,0.1,150);
camera.position.set(11,8,16); camera.lookAt(0,1,0);
scene.add(new THREE.HemisphereLight(0xdde8e0,0x3a4146,2));
const key=new THREE.DirectionalLight(0xf5e7cf,4); key.position.set(-5,10,6); key.castShadow=true;
key.shadow.mapSize.set(1024,1024); key.shadow.camera.left=-12; key.shadow.camera.right=12;
key.shadow.camera.top=12; key.shadow.camera.bottom=-12; key.shadow.normalBias=0.04; scene.add(key);
const rim=new THREE.DirectionalLight(0x93bec9,3); rim.position.set(6,4,-7); scene.add(rim);

// A small generated environment gives metals reflections without external assets.
const envScene=new THREE.Scene(), envSky=new THREE.Mesh(new THREE.SphereGeometry(20,24,12),RK.createSkyMaterial()); envScene.add(envSky);
const pmrem=new THREE.PMREMGenerator(renderer), environment=pmrem.fromScene(envScene,0.025);
scene.environment=environment.texture; pmrem.dispose(); envSky.geometry.dispose(); envSky.material.dispose();

const time=RK.uniform(2), groups=Object.fromEntries(['surface','terrain','particles','interface','temporal'].map(k=>[k,new THREE.Group()]));
for (const group of Object.values(groups)) scene.add(group);
const surfaceMaterials=[];
const floor=new THREE.Mesh(new THREE.CylinderGeometry(6.7,6.7,0.2,96),RK.createSurfaceMaterial('concrete',{ color:0x333e3f,detail:{dust:0.05} }));
floor.position.y=-0.25; floor.receiveShadow=true; scene.add(floor);

const jet=buildJetMesh(1); jet.group.scale.setScalar(0.6); jet.group.position.y=1.65; jet.group.rotation.y=-0.55;
const replacements=new Map();
function replaceMaterial(original) {
  if (replacements.has(original)) return replacements.get(original);
  if (original.isMeshBasicMaterial || original.transparent) return original;
  const m=RK.createSurfaceMaterial('paintedMetal',{ color:original.color, map:original.map, side:original.side,
    flatShading:original.flatShading, detail:{dust:0.18,wear:0.14,wetness:0.08,scale:4} });
  replacements.set(original,m); surfaceMaterials.push(m); return m;
}
jet.group.traverse(o=>{ if (o.isMesh) { o.material=Array.isArray(o.material)?o.material.map(replaceMaterial):replaceMaterial(o.material); o.castShadow=true; o.receiveShadow=true; } });
groups.surface.add(jet.group);
// Separate spheres keep the silhouette and response easy to compare.
for (const [i,preset] of ['steel','rubber','fabric','ceramic'].entries()) {
  const m=RK.createSurfaceMaterial(preset), sphere=new THREE.Mesh(new THREE.SphereGeometry(0.36,24,16),m);
  sphere.position.set(-2+i*1.3,0.28,4.1); sphere.castShadow=true; groups.surface.add(sphere); surfaceMaterials.push(m);
}

const terrainGeo=new THREE.PlaneGeometry(10,10,72,72).rotateX(-Math.PI/2);
const position=terrainGeo.attributes.position;
for(let i=0;i<position.count;i++) {
  const x=position.getX(i), z=position.getZ(i), r=Math.hypot(x+0.8,z);
  position.setY(i,Math.hypot(x,z)>5.7 ? -0.4 : Math.max(-0.12,3.6*Math.exp(-r*r*0.12)+Math.sin(x*1.8)*Math.cos(z*1.5)*0.32-0.45));
}
// Cut away the square grid's outer corners below the circular display water.
const triangles=terrainGeo.index.array, clipped=[];
for(let i=0;i<triangles.length;i+=3) {
  const face=[triangles[i],triangles[i+1],triangles[i+2]];
  if(face.every(v=>Math.hypot(position.getX(v),position.getZ(v))<=5.7)) clipped.push(...face);
}
terrainGeo.setIndex(clipped);
terrainGeo.computeVertexNormals();
const land=new THREE.Mesh(terrainGeo,RK.createTerrainMaterial({shoreHeight:0.05,shoreFade:0.5,snowLine:2.3,snowFade:0.8,scale:1}));
land.receiveShadow=true; land.castShadow=true; groups.terrain.add(land);
const water=new THREE.Mesh(new THREE.CircleGeometry(6,96).rotateX(-Math.PI/2),RK.createWaterMaterial({time}));
water.position.y=0.02; groups.terrain.add(water);

const emitters=Object.fromEntries(Object.keys(RK.PARTICLE_PRESETS).map(kind=>{
  const emitter=RK.createParticleSystem({kind,count:96,spread:['rain','snow'].includes(kind)?8:1.2});
  emitter.mesh.position.y=['rain','snow'].includes(kind)?9:0.15; groups.particles.add(emitter.mesh); return [kind,emitter];
}));
const particleBase=new THREE.Mesh(new THREE.TorusGeometry(1.1,0.04,8,64),RK.createSurfaceMaterial('steel'));
particleBase.rotation.x=-Math.PI/2; groups.particles.add(particleBase);

const hudGroup=new THREE.Group(); hudGroup.position.y=2; hudGroup.quaternion.copy(camera.quaternion); groups.interface.add(hudGroup);
const hud=new THREE.Mesh(new THREE.PlaneGeometry(7,3.6),RK.createHUDMaterial({width:700,height:360,depthTest:true})); hudGroup.add(hud);
const reticle=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.7),RK.createHUDMaterial({kind:'reticle',width:170,height:170,depthTest:true}));
reticle.position.set(1.8,0,0.03); hudGroup.add(reticle);
const labels=[];
for(const [text,x,y,height,tint] of [['TEMPORAL / NAVIGATION',-1.2,1.15,0.34,'#a6cfbb'],['1980 → 2086',-1,0.35,0.65,'#e7e9df'],['OFFSET   +106 YEARS',-1,-0.45,0.28,'#bdb1d9'],['SIGNAL STABLE',-1,-1.05,0.24,'#a7b4b0']]) {
  const label=RK.createTextLabel({text,height,tint,fontFamily:'monospace'}); label.mesh.position.set(x,y,0.04); hudGroup.add(label.mesh); labels.push(label);
}

const anomaly=new THREE.Mesh(new THREE.TorusKnotGeometry(1.7,0.44,160,24),RK.createTemporalMaterial({time}));
anomaly.position.y=2.5; groups.temporal.add(anomaly);
const chronons=RK.createParticleSystem({kind:'temporal',count:128,spread:5}); groups.temporal.add(chronons.mesh);
const ring=new THREE.Mesh(new THREE.TorusGeometry(3,0.018,8,128),RK.createSurfaceMaterial('steel',{emissive:0x648c7d,emissiveIntensity:0.6}));
ring.rotation.x=-Math.PI/2; ring.position.y=0.02; groups.temporal.add(ring);

const post=RK.createPostPipeline(renderer);
const descriptions={
  surface:['SURFACE STUDY / HORNET','PAINTED ALLOY / PHYSICAL LIGHT','Built to feel real.','Paint, exposed alloy and accumulated dust respond to the same light. The future appears in the details, while the material stays believable.'],
  terrain:['WORLD STUDY / ELEVATION','ROCK / SHORE / WATER / SNOW','A world with weight.','Slope and altitude separate rock, soil and snow. Fine optical ripples catch the light across the water. Every region shares one material language.'],
  particles:['ATMOSPHERE / PARTICLES','GPU MOTION / INSTANCED QUADS','Small things, in motion.','Smoke, dust, rain and sparks follow independent lifetimes on the GPU. Soft silhouettes keep the atmosphere tactile, with an optional depth fade at surfaces.'],
  interface:['INSTRUMENT STUDY / NAVIGATION','GPU PANELS / TYPE / RETICLE','Space is an instrument.','Unequal margins create a balanced composition. Fine rules and open centres guide the eye; a muted temporal accent signals a change of era.'],
  temporal:['TEMPORAL STUDY / ANOMALY','FRESNEL / SCAN / PARTICLES','A trace of another time.','A quiet edge glow and moving interference make the unfamiliar legible. Increase temporal disturbance to bend the image; pause motion to inspect its structure.'],
};
let selected='surface', paused=matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');
function select(view) {
  if(!groups[view]) throw new RangeError('Unknown preview view');
  selected=view;
  floor.visible=view!=='interface';
  camera.position.set(...(view==='interface'?[0,2,10]:[11,8,16]));
  camera.lookAt(0,view==='interface'?2:1,0);
  hudGroup.quaternion.copy(camera.quaternion);
  for(const [name,g] of Object.entries(groups)) g.visible=name===view;
  for(const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',String(button.dataset.view===view));
  const [label,note,title,copy]=descriptions[view];
  document.querySelector('#stage-label').textContent=label; document.querySelector('#stage-note').textContent=note;
  document.querySelector('#caption-title').textContent=title; document.querySelector('#caption-copy').textContent=copy;
}
function selectParticle(kind) { for(const [name,e] of Object.entries(emitters)) e.mesh.visible=name===kind; }
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.view)));
for(const [id,key] of [['wetness','rkWet'],['dust','rkDust'],['camo','rkCamo']]) document.querySelector(`#${id}`).addEventListener('input',e=>{
  for(const m of surfaceMaterials) m.userData.renderkit.uniforms[key].value=Number(e.target.value);
});
document.querySelector('#particle').addEventListener('change',e=>{selectParticle(e.target.value);select('particles');});
document.querySelector('#temporal').addEventListener('input',e=>post.uniforms.rkTemporal.value=Number(e.target.value));
const motion=document.querySelector('#motion');
function updateMotion() { motion.textContent=paused?'Resume motion':'Pause motion'; motion.setAttribute('aria-pressed',String(paused)); }
motion.addEventListener('click',()=>{paused=!paused;updateMotion();}); updateMotion();
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{ if(event.matches) {paused=true;updateMotion();} });
function resize() { renderer.setSize(Math.max(1,stage.clientWidth),Math.max(1,stage.clientHeight),false); camera.aspect=stage.clientWidth/Math.max(1,stage.clientHeight); camera.updateProjectionMatrix(); }
const observer=new ResizeObserver(resize); observer.observe(stage); resize();
document.querySelector('#quality').addEventListener('change',e=>{renderer.setPixelRatio(Math.min(Number(e.target.value),devicePixelRatio||1));resize();});
select('surface'); selectParticle('smoke');
let last=performance.now(), frame=0;
function tick(now) {
  const dt=Math.min((now-last)/1000,0.05); last=now;
  if(!paused) time.value+=dt;
  if(selected==='temporal') anomaly.rotation.y=time.value*0.12;
  for(const e of Object.values(emitters)) e.update(time.value,camera,renderer);
  chronons.update(time.value,camera,renderer);
  post.render(scene,camera,time.value);
  document.querySelector('#time-readout').textContent=time.value.toFixed(2).padStart(5,'0');
  frame++; requestAnimationFrame(tick);
}
window.__BENCH={renderer,host:'renderkit',mode:'preview',get state(){return paused?'paused':'live';}};
window.__RK={renderer,scene,camera,post,time,select,selectParticle,groups,emitters,surfaceMaterials,
  get frame(){return frame;},get selected(){return selected;},get paused(){return paused;},ready:true};
requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
