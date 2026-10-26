// A developer inspection host for the production sea-life meshes, shaders and SPECIES.
// No fish population/AI is spawned here. Lengths are unchanged; each panel has an independent camera.
// ?species=mackerel (or comma-separated keys), ?res=1, ?paused, ?debug
import * as THREE from 'three';
import { GEOMETRY, SHADERS, fishUniforms } from '../js/units/naval/sealifegfx.js';
import { SPECIES } from '../js/units/naval/fishsim.js';

const Q=new URLSearchParams(location.search),stage=document.getElementById('stage'),cards=document.getElementById('cards');
const selector=document.getElementById('species'),pauseButton=document.getElementById('pause'),status=document.getElementById('status');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(2,devicePixelRatio)*(Number(Q.get('res'))||1));
renderer.setClearColor(0x10313e,1);renderer.autoClear=false;
stage.prepend(renderer.domElement);
const uniforms=fishUniforms();
uniforms.uUW.value.set(1,0,.005,0);uniforms.uFogP.value.set(12,70,0,0);uniforms.uFogC.value.setHex(0x10313e);uniforms.uSunD.value.set(.45,.8,.55).normalize();
const patterns=typeof SHADERS.FISH_FS==='string';
if(!patterns){
  const message='The production fish-pattern shader is required for this inspection page.';
  const error=document.getElementById('error');error.textContent=message;error.classList.remove('hidden');throw Error(message);
}
const MARKINGS={
  sardine:'Slender silver flank and blue-green back',mackerel:'Wavy dark markings across the back',mullet:'Fine horizontal flank lines',
  amberjack:'Amber lateral stripe and deeper tail fork',bonito:'Oblique dark stripes on the upper flank',
  flyingfish:'Long pectoral fins · wings spread for inspection',bream:'Deep body and two dark bands',damsel:'Compact dark body and forked tail',
  shark:'Tall dorsal fin and unequal tail lobes',ray:'Broad disc, wing stroke and trailing tail',jelly:'Translucent bell, rim and pulsing oral arms',
  dolphin:'Long beak, horizontal flukes and two-tone flank',
};
function behavior(s){
  const labels=[];
  if(s.role==='school')labels.push(s.draw==='school'?'Tight school in game':'Loose school in game');
  else if(s.role==='reef')labels.push('Rock-associated station holding');
  else if(s.role==='pred')labels.push('Predator in game');
  else if(s.role==='drift')labels.push('Drifts with the water');
  else if(s.role==='mammal')labels.push('Pod swimmer in game');
  else labels.push('Solitary cruiser in game');
  if(s.hunts?.length)labels.push('prey: '+s.hunts.join(', '));
  if(s.leap==='hop')labels.push('surface leaps');
  if(s.leap==='glide')labels.push('surface glides');
  return labels.join(' · ');
}
const shapeFor=s=>s.draw==='ray'?{geometry:GEOMETRY.rayGeometry,shader:SHADERS.RAY_VS,span:2.5,height:1.25,pitch:.72,targetY:0}
  :s.draw==='jelly'?{geometry:GEOMETRY.jellyGeometry,shader:SHADERS.JELLY_VS,span:.9,height:1.2,pitch:.12,targetY:-.25}
  :s.draw==='dolphin'?{geometry:GEOMETRY.dolphinGeometry,shader:SHADERS.DOLPHIN_VS,span:1.4,height:.65,pitch:.17,targetY:0}
  :{geometry:GEOMETRY.fishGeometry,shader:SHADERS.FISH_VS(false),span:1.35,height:s.key==='flyingfish'?1:.62,pitch:s.key==='flyingfish'?.52:.16,targetY:0};
const entries=SPECIES.map((species,index)=>{
  const shape=shapeFor(species),length=(species.len[0]+species.len[1])/2,geometry=shape.geometry();
  const data={A:new Float32Array([0,0,0,length]),B:new Float32Array([Math.PI/2,0,0,index]),C:new Float32Array([index*.53,.35,1,.5]),D:new Float32Array([species.leap==='glide'?1:0,0,.5,0])};
  for(const key of ['A','B','C','D'])geometry.setAttribute('i'+key,new THREE.InstancedBufferAttribute(data[key],4).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount=1;
  const ordinary=species.draw==='fish'||species.draw==='school';
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:shape.shader,fragmentShader:ordinary?SHADERS.FISH_FS:SHADERS.FRAG,transparent:true,depthWrite:species.draw==='ray'||species.draw==='dolphin',side:ordinary||species.draw==='jelly'?THREE.DoubleSide:THREE.FrontSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='inspection-'+species.key;mesh.frustumCulled=false;
  const scene=new THREE.Scene();scene.add(mesh);
  const camera=new THREE.PerspectiveCamera(38,1,.001,100);camera.position.set(0,0,3);
  const card=document.createElement('section');card.className='card';card.dataset.species=species.key;
  const heading=document.createElement('div');heading.className='card-heading';
  const title=document.createElement('button');title.className='species';title.type='button';title.textContent=species.key==='sardine'?'SARDINE · '+species.name:species.name;title.addEventListener('click',()=>show([species.key]));
  const note=document.createElement('p');note.className='shape-note';note.textContent=MARKINGS[species.key];heading.append(title,note);
  const footer=document.createElement('div');footer.className='card-footer';
  const scale=document.createElement('span');scale.className='size';
  const habit=document.createElement('span');habit.className='behavior';habit.textContent=behavior(species);footer.append(scale,habit);card.append(heading,footer);
  const option=document.createElement('option');option.value=species.key;option.textContent=species.key==='sardine'?'Sardine (pilchard)':species.name;selector.append(option);
  return {species,index,length,shape,geometry,material,mesh,scene,camera,data,card,scale,viewport:null,distance:0};
});
let visible=[],frames=0,time=0,last=performance.now(),paused=Q.has('paused'),disposed=false;
const orbit={yaw:.04,pitch:0,zoom:1};
function setPaused(value){paused=!!value;pauseButton.textContent=paused?'Resume animation':'Pause animation';pauseButton.setAttribute('aria-pressed',String(paused));updateStatus();}
function updateStatus(){status.textContent=(patterns?'Species markings':'Legacy colour shader')+' · '+visible.length+' view'+(visible.length===1?'':'s')+' · '+(paused?'paused':'live');}
function show(keys){
  const requested=keys==='all'?SPECIES.map(s=>s.key):Array.isArray(keys)?keys:String(keys).split(',');
  if(!requested.length||requested.some(key=>!entries.some(e=>e.species.key===key)))throw Error('Unknown species selection: '+requested.join(', '));
  visible=[...new Set(requested)].map(key=>entries.find(e=>e.species.key===key));
  cards.replaceChildren(...visible.map(e=>e.card));cards.classList.toggle('focus',visible.length===1);
  selector.value=visible.length===1?visible[0].species.key:'all';
  layout();updateStatus();return visible.map(e=>e.species.key);
}
function layout(){
  const bounds=stage.getBoundingClientRect(),width=Math.max(1,bounds.width),height=Math.max(1,bounds.height);
  renderer.setSize(width,height,false);
  const n=visible.length,columns=n===1?1:n<=3?n:width<760?Math.min(3,Math.ceil(Math.sqrt(n))):Math.min(4,Math.ceil(Math.sqrt(n)));
  cards.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;cards.style.gridTemplateRows=`repeat(${Math.ceil(n/columns)},minmax(0,1fr))`;
  for(const e of visible){
    const r=e.card.getBoundingClientRect(),top=Math.min(54,r.height*.27),bottom=Math.min(49,r.height*.25);
    // Keep the actual model viewport between its DOM labels instead of drawing markings
    // beneath the name/size text. Close selections receive a much larger image area.
    e.viewport={x:r.left-bounds.left+2,y:height-(r.bottom-bounds.top)+bottom,width:Math.max(1,r.width-4),height:Math.max(1,r.height-top-bottom)};
  }
}
function resetView(){orbit.yaw=.04;orbit.pitch=0;orbit.zoom=1;}
selector.addEventListener('change',()=>{resetView();show(selector.value==='all'?'all':[selector.value]);});
pauseButton.addEventListener('click',()=>setPaused(!paused));document.getElementById('reset').addEventListener('click',resetView);
const pointers=new Map();let pinch=0;
renderer.domElement.addEventListener('pointerdown',e=>{renderer.domElement.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=0;});
renderer.domElement.addEventListener('pointermove',e=>{
  const prior=pointers.get(e.pointerId);if(!prior)return;
  if(pointers.size===1){orbit.yaw-=(e.clientX-prior.x)*.007;orbit.pitch=Math.max(-1.1,Math.min(1.1,orbit.pitch+(e.clientY-prior.y)*.005));}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0)orbit.zoom=Math.max(.55,Math.min(3,orbit.zoom*pinch/Math.max(1,distance)));pinch=distance;}
});
const release=e=>{pointers.delete(e.pointerId);pinch=0;};renderer.domElement.addEventListener('pointerup',release);renderer.domElement.addEventListener('pointercancel',release);
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();orbit.zoom=Math.max(.55,Math.min(3,orbit.zoom*Math.exp(e.deltaY*.001)));},{passive:false});
window.addEventListener('resize',layout);
const resize=new ResizeObserver(layout);resize.observe(stage);
function draw(now){
  if(disposed)return;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;if(!paused)time+=dt;
  uniforms.uTime.value=time;renderer.info.reset();renderer.setScissorTest(false);renderer.clear();
  for(const e of visible){
    const v=e.viewport;if(!v||v.width<1||v.height<1)continue;
    // Phase/amplitude drive the production shader's tail beat, ray stroke, flukes or bell pulse.
    // Position remains fixed: this is an inspection animation, not a simulated animal trajectory.
    e.data.C[0]=e.index*.53+time*(e.species.draw==='jelly'?1.6:2+e.species.cruise*2);e.geometry.attributes.iC.needsUpdate=true;
    const aspect=v.width/v.height,fov=Math.tan(THREE.MathUtils.degToRad(38)/2);
    e.distance=Math.max(e.shape.height/2/fov,e.shape.span/2/(fov*aspect))*1.35*e.length*orbit.zoom;
    const pitch=Math.max(-1.35,Math.min(1.35,e.shape.pitch+orbit.pitch)),targetY=e.shape.targetY*e.length;
    e.camera.aspect=aspect;e.camera.near=Math.max(.0001,e.length*.003);e.camera.far=Math.max(20,e.distance*10);e.camera.updateProjectionMatrix();
    e.camera.position.set(Math.sin(orbit.yaw)*Math.cos(pitch)*e.distance,targetY+Math.sin(pitch)*e.distance,Math.cos(orbit.yaw)*Math.cos(pitch)*e.distance);e.camera.lookAt(0,targetY,0);
    const meaning=e.species.key==='ray'?'disc scale':e.species.key==='jelly'?'bell + arms':'body length';
    e.scale.textContent=`${e.length.toFixed(2)} m ${meaning} · camera ${e.distance.toFixed(2)} m`;
    renderer.setViewport(v.x,v.y,v.width,v.height);renderer.setScissor(v.x,v.y,v.width,v.height);renderer.setScissorTest(true);renderer.clear(true,true,true);renderer.render(e.scene,e.camera);
  }
  renderer.setScissorTest(false);frames++;requestAnimationFrame(draw);
}
function snapshot(){return {frames,time,paused,patterns,visible:visible.map(e=>e.species.key),entries:entries.map(e=>({key:e.species.key,name:e.species.name,length:e.length,range:[...e.species.len],draw:e.species.draw,role:e.species.role,geometry:e.geometry.attributes.position.count,instances:e.geometry.instanceCount,phase:e.data.C[0],cameraDistance:e.distance,finite:[...e.data.A,...e.data.B,...e.data.C,...e.data.D].every(Number.isFinite)}))};}
function dispose(){if(disposed)return;disposed=true;resize.disconnect();for(const e of entries){e.geometry.dispose();e.material.dispose();}uniforms.uPattern?.value?.dispose();renderer.dispose();}
window.addEventListener('pagehide',dispose,{once:true});
if(Q.has('debug')){
  window.__FISHVIEW={renderer,entries,show,setPaused,resetView,snapshot,orbit,get frames(){return frames;},get time(){return time;},get visible(){return visible.map(e=>e.species.key);},get paused(){return paused;},get patterns(){return patterns;}};
  window.__BENCH={renderer,host:'dev-fish',mode:'inspection',get state(){return paused?'paused':'live';}};
}
try{show(Q.get('species')||'all');setPaused(paused);requestAnimationFrame(draw);}catch(error){const el=document.getElementById('error');el.textContent=error.message;el.classList.remove('hidden');throw error;}
