// Browser-only contract checks: actual linked programs and pixel readbacks, not shader-string snapshots.
import * as THREE from 'three';
import * as RK from '../js/renderkit/index.js';
import { createFog, fogPatch } from '../js/fog.js';

export function runRenderKitChecks(renderer, environment) {
  const results=[], resources=[], owned=value=>(resources.push(value),value);
  const check=(name,condition)=>{ if(!condition) throw new Error(`RenderKit check failed: ${name}`); results.push(name); };
  const throws=(name,fn)=>{let failed=false;try{fn();}catch{failed=true;}check(name,failed);};
  const target=owned(new THREE.WebGLRenderTarget(64,64));
  const previous=renderer.getRenderTarget(), viewport=renderer.getViewport(new THREE.Vector4()), scissor=renderer.getScissor(new THREE.Vector4());
  const scissorTest=renderer.getScissorTest(), autoClear=renderer.autoClear, clear=renderer.getClearColor(new THREE.Color()), clearAlpha=renderer.getClearAlpha();
  const scene=new THREE.Scene(); scene.environment=environment;
  scene.add(new THREE.HemisphereLight(0xffffff,0x555555,2));
  const light=new THREE.DirectionalLight(0xffffff,4); light.position.set(2,3,4); light.castShadow=true; scene.add(light);
  const camera=new THREE.PerspectiveCamera(40,1,0.1,100); camera.position.z=5;
  const geometry=owned(new THREE.SphereGeometry(1,24,16)), plane=owned(new THREE.PlaneGeometry(2,2));
  const holder=new THREE.Group(); scene.add(holder);
  const pixels=new Uint8Array(64*64*4);
  const snapshot=()=>{renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.autoClear=true;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);return pixels.slice();};
  const energy=p=>p.reduce((sum,v,i)=>sum+(i%4===3?0:v),0);
  const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0);
  function render(material, geo=geometry, label=material.name) {
    holder.clear(); const mesh=new THREE.Mesh(geo,material); holder.add(mesh);
    check(`${label}: visible pixels`,energy(snapshot())>20); return mesh;
  }
  try {
    check('tested Three revision',THREE.REVISION===RK.THREE_REVISION);
    throws('invalid surface preset rejected',()=>RK.createSurfaceMaterial('missing'));
    const unsupported=owned(new THREE.MeshBasicMaterial());
    throws('surface detail rejects an unlit material',()=>RK.applySurfaceDetail(unsupported));
    throws('zero terrain scale rejected',()=>RK.createTerrainMaterial({scale:0}));
    throws('invalid particle count rejected',()=>RK.createParticleSystem({count:0}));
    throws('zero particle lifetime rejected',()=>RK.createParticleSystem({life:0}));
    throws('invalid text atlas rejected',()=>RK.createDistanceTextMaterial({}));
    throws('invalid HUD size rejected',()=>RK.createHUDMaterial({width:0}));

    for(const name of Object.keys(RK.SURFACE_PRESETS)) render(owned(RK.createSurfaceMaterial(name)));
    const material=owned(RK.createSurfaceMaterial('paintedMetal',{detail:{dust:0,wear:0,wetness:0}}));
    const separate=owned(RK.createSurfaceMaterial('paintedMetal'));
    throws('surface detail rejects duplicate application',()=>RK.applySurfaceDetail(separate));
    render(material); const dry=snapshot(); material.userData.renderkit.uniforms.rkWet.value=1;
    check('live wetness changes pixels without material recreation',difference(dry,snapshot())>100);
    check('material uniforms are independent',separate.userData.renderkit.uniforms.rkWet.value===0);
    const map=owned(new THREE.DataTexture(new Uint8Array([180,100,60,255]),1,1)); RK.setTextureRole(map,'color');
    const mask=owned(new THREE.DataTexture(new Uint8Array([255,128,255,255]),1,1)); RK.setTextureRole(mask,'data');
    check('texture roles distinguish color from data',map.colorSpace===THREE.SRGBColorSpace && mask.colorSpace===THREE.NoColorSpace);
    const masked=owned(RK.createSurfaceMaterial('armor',{map,detail:{mask,camouflage:1,wear:0.5,wetness:0.5}}));
    render(masked); check('masked and unmasked variants have distinct cache keys',material.customProgramCacheKey()!==masked.customProgramCacheKey());
    render(owned(RK.createGlassMaterial()));
    render(owned(RK.createFoliageMaterial({map})),plane);
    render(owned(RK.createDecalMaterial({map})),plane);
    render(owned(RK.createTerrainMaterial({shoreHeight:-1,snowLine:0.2,snowFade:0.5})));
    const waterTime=RK.uniform(0), water=owned(RK.createWaterMaterial({time:waterTime}));
    render(water); const still=snapshot(); waterTime.value=4;
    check('water time changes optical surface',difference(still,snapshot())>50);

    holder.clear(); const instanced=new THREE.InstancedMesh(geometry,material,2);
    instanced.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-0.65,0,0));
    instanced.setMatrixAt(1,new THREE.Matrix4().makeTranslation(0.65,0,-0.2));
    holder.add(instanced); check('PBR instance transforms compile and render',energy(snapshot())>100);
    const skinGeo=owned(geometry.clone()), indices=new Uint16Array(skinGeo.attributes.position.count*4), weights=new Float32Array(indices.length);
    for(let i=0;i<weights.length;i+=4) weights[i]=1;
    skinGeo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4)); skinGeo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const skinned=new THREE.SkinnedMesh(skinGeo,material), bone=new THREE.Bone(), skeleton=owned(new THREE.Skeleton([bone]));
    skinned.add(bone); skinned.bind(skeleton); holder.clear();holder.add(skinned);
    check('PBR skinning compiles and renders',energy(snapshot())>100);
    const morphGeo=owned(geometry.clone()); morphGeo.morphAttributes.position=[geometry.attributes.position.clone()];
    const morph=render(material,morphGeo,'PBR morph target'); morph.morphTargetInfluences[0]=0.5;
    check('PBR morph influences render',energy(snapshot())>100);
    const fog=createFog(50,4); owned(fog.tex); fog.enabled=false; fog.update([]);
    const fogMaterial=owned(fogPatch(new THREE.MeshStandardMaterial({color:0x778877}),fog,RK.uniform(0)));
    RK.applySurfaceDetail(fogMaterial); render(fogMaterial,geometry,'existing fogPatch chained before detail');
    scene.fog=new THREE.Fog(0x243030,2,20);
    render(owned(RK.createSurfaceMaterial('armor')),geometry,'built-in distance fog'); scene.fog=null;

    for(const kind of Object.keys(RK.PARTICLE_PRESETS)) {
      const emitter=owned(RK.createParticleSystem({kind,count:24,spread:0.5,speed:0,gravity:0,size:0.5}));
      holder.clear();holder.add(emitter.mesh);emitter.update(0.5,camera);emitter.uniforms.rkResolution.value.set(64,64);
      check(`${kind}: instanced particle pixels`,energy(snapshot())>10);
    }
    const smoke=owned(RK.createParticleSystem({kind:'smoke',count:32,spread:0.2,speed:0,gravity:0,size:1}));
    holder.clear();holder.add(smoke.mesh);smoke.update(1,camera);smoke.uniforms.rkResolution.value.set(64,64);
    const depth=owned(new THREE.DataTexture(new Float32Array([1]),1,1,THREE.RedFormat,THREE.FloatType));depth.needsUpdate=true;
    smoke.setDepthTexture(depth); const open=energy(snapshot()); depth.image.data[0]=0;depth.needsUpdate=true;
    check('soft particles fade behind perspective scene depth',open>100 && energy(snapshot())===0);
    smoke.uniforms.rkOrtho.value=1; depth.image.data[0]=1;depth.needsUpdate=true;const openOrtho=energy(snapshot());
    depth.image.data[0]=0;depth.needsUpdate=true;
    check('orthographic depth conversion fades occluded particles',openOrtho>100 && energy(snapshot())===0);
    smoke.setDepthTexture(null); check('depth fade can be disabled',energy(snapshot())>100);
    const burst=owned(RK.createParticleSystem({kind:'fire',loop:false,count:12,speed:0,gravity:0}));
    holder.clear();holder.add(burst.mesh);burst.update(0.3,camera);const live=energy(snapshot());burst.update(3,camera);
    check('non-looping emitter expires',live>50 && energy(snapshot())===0);
    const temporal=owned(RK.createTemporalMaterial());render(temporal);
    render(owned(RK.createSkyMaterial({side:THREE.FrontSide})),geometry,'sky');
    render(owned(RK.createHUDMaterial()),plane);
    render(owned(RK.createHUDMaterial({kind:'reticle'})),plane);

    // Analytic ring glyph: no font download and a known signed-distance ground truth.
    const sdf=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++) for(let x=0;x<64;x++) {
      const distance=5-Math.abs(Math.hypot(x-31.5,y-31.5)-19), value=Math.max(0,Math.min(255,128+distance*16));
      sdf.set([value,value,value,255],(y*64+x)*4);
    }
    const atlas=owned(new THREE.DataTexture(sdf,64,64));atlas.minFilter=atlas.magFilter=THREE.LinearFilter;RK.setTextureRole(atlas,'data');
    const font={common:{lineHeight:64,scaleW:64,scaleH:64,pages:1},chars:[{id:79,x:0,y:0,width:64,height:64,xoffset:0,yoffset:0,xadvance:64}],kernings:[{first:79,second:79,amount:-8}]};
    for(const mode of ['sdf','msdf']) {
      const text=owned(RK.createDistanceText({text:'OO\nO',font,atlas,mode,size:1}));text.mesh.position.set(-1,1,0);
      holder.clear();holder.add(text.mesh);check(`${mode}: distance-field glyph pixels`,energy(snapshot())>50);
      check(`${mode}: kerning and multiline layout`,text.mesh.userData.width===1.875 && text.mesh.userData.height===2);
      text.setText('');check(`${mode}: empty text draws nothing`,energy(snapshot())===0);
      throws(`${mode}: missing glyph without fallback rejected`,()=>text.setText('X'));
    }
    let borrowedDisposed=false;atlas.addEventListener('dispose',()=>borrowedDisposed=true);
    const label=RK.createDistanceText({text:'O',font,atlas});label.dispose();check('text disposal preserves borrowed atlas',!borrowedDisposed);
    const canvasLabel=owned(RK.createTextLabel({text:'OFFSET 1980 → 2086',height:1}));
    holder.clear();holder.add(canvasLabel.mesh);const before=energy(snapshot());canvasLabel.setText('');
    const after=energy(snapshot());
    check(`canvas label update replaces glyph pixels (before=${before}, after=${after})`,before>50 && after===0);

    // Exercise the post chain into a caller-owned target and verify it restores public state.
    render(material);
    renderer.setRenderTarget(target);renderer.setViewport(0,0,64,64);renderer.setScissor(2,3,60,58);renderer.setScissorTest(true);
    renderer.setClearColor(0x123456,0.4);renderer.autoClear=false;
    const savedViewport=renderer.getViewport(new THREE.Vector4()), savedScissor=renderer.getScissor(new THREE.Vector4()), savedXR=renderer.xr.enabled;
    const post=owned(RK.createPostPipeline(renderer));post.render(scene,camera,1);
    check('post restores render target',renderer.getRenderTarget()===target);
    check('post restores viewport and scissor',renderer.getViewport(new THREE.Vector4()).equals(savedViewport) && renderer.getScissor(new THREE.Vector4()).equals(savedScissor) && renderer.getScissorTest());
    check('post restores clear, autoClear and XR state',renderer.getClearColor(new THREE.Color()).getHex()===0x123456 && renderer.getClearAlpha()===0.4 && !renderer.autoClear && renderer.xr.enabled===savedXR);
    renderer.readRenderTargetPixels(target,0,0,64,64,pixels);check('post output contains the scene',energy(pixels)>50);
    post.setSize(37,29);check('post resizes owned target',post.target.width===37 && post.target.height===29);
    post.dispose();throws('disposed post refuses rendering',()=>post.render(scene,camera));
    // Compare final display pixels with/without a neutral post chain, including tone mapping.
    holder.clear();holder.add(new THREE.Mesh(plane,owned(new THREE.MeshBasicMaterial({color:0x808080}))));
    renderer.setRenderTarget(null);renderer.setViewport(0,0,64,64);renderer.setScissorTest(false);renderer.autoClear=true;
    renderer.render(scene,camera);
    const gl=renderer.getContext(), direct=new Uint8Array(4), processed=new Uint8Array(4);
    gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,direct);
    const neutral=owned(RK.createPostPipeline(renderer,{vignette:0,grain:0,saturation:1,contrast:1,temporal:0}));
    neutral.render(scene,camera,0);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,processed);
    check(`neutral post applies display conversion exactly once (${direct.slice(0,3)} / ${processed.slice(0,3)})`,direct[0]>20 && direct.slice(0,3).every((value,i)=>Math.abs(value-processed[i])<=2));
    const programs=renderer.info.programs;
    check('all linked shader programs runnable',programs.every(program=>!program.diagnostics || program.diagnostics.runnable!==false));
    check('WebGL reports no error',renderer.getContext().getError()===renderer.getContext().NO_ERROR);
    return {passed:results.length,checks:results,programs:programs.length};
  } finally {
    holder.clear();for(const resource of resources.reverse()) resource.dispose();
    light.shadow.dispose();
    renderer.setRenderTarget(previous);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
    renderer.setClearColor(clear,clearAlpha);renderer.autoClear=autoClear;
  }
}
