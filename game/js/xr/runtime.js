// Immersive VR host: one XR animation loop, metre-scale tracking, controller/hand input and spatial UI.
import * as THREE from 'three';
import { createXRInput, controllerAxes, button } from './input.js';
import { createXRPanel } from './panel.js';
const UP = new THREE.Vector3(0,1,0), FORWARD = new THREE.Vector3(0,0,-1);
export function createXR(h) {
  const { renderer, scene, camera } = h, manager = renderer.xr, input = createXRInput();
  const rig = new THREE.Group(), xrCamera = new THREE.PerspectiveCamera(65,1,.03,2600);
  rig.name='VR tracking origin'; rig.add(xrCamera); scene.add(rig); rig.visible=false;
  const room = new THREE.Scene(); room.background=new THREE.Color(0x06131d);
  const rt=new THREE.WebGLRenderTarget(1024,576,{depthBuffer:true});
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(2.8,2.8*9/16),new THREE.MeshBasicMaterial({map:rt.texture,toneMapped:false}));
  screen.name='VR optical/cave display'; rig.add(screen); screen.visible=false;
  const state={active:false,supported:false,requesting:false,physical:false,flat:false,frames:0,error:'',hands:0,controllers:0,tracking:false,footYaw:0};
  const controls=[], raycaster=new THREE.Raycaster(), q=new THREE.Quaternion(), v=new THREE.Vector3(), euler=new THREE.Euler(0,0,0,'YXZ');
  const calibration={p:new THREE.Vector3(),q:new THREE.Quaternion(),needed:true};
  let session=null, visible=true, context='', previousFlat=false, pendingResize=false;
  const entry=document.createElement('div'); entry.id='xrEntry'; entry.dataset.html2canvasIgnore='true';
  entry.style.cssText='position:fixed;right:16px;bottom:180px;z-index:110;pointer-events:auto;padding:8px;background:#041724e8;border:1px solid #467;font:12px Consolas;color:#bde';
  entry.innerHTML='<button type="button" id="enterVR" style="font:14px Consolas;color:#bff;background:#123642;border:1px solid #699;padding:8px;cursor:pointer" disabled>CHECKING VR…</button> <label><input id="xrHands" type="checkbox" checked> HAND TRACKING</label><div id="xrStatus" style="max-width:300px;margin-top:5px"></div>';
  document.body.appendChild(entry); const enter=entry.querySelector('button'), status=entry.querySelector('#xrStatus');
  const report = text => { state.error=text; status.textContent=text; };
  const key = (code,on,mods=new Set()) => { dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,shiftKey:mods.has('ShiftLeft'),ctrlKey:mods.has('ControlLeft'),altKey:mods.has('AltLeft'),bubbles:true,cancelable:true})); };
  const tap = code => { key(code,true); key(code,false); };
  const manual={fire:false,secondary:false};
  const actionWas={};
  const panel=createXRPanel({key,action:(name,on)=>{manual[name]=on;},turn:angle=>{if(h.context().kind==='foot'){state.footYaw-=angle;h.snap(angle);}},research:h.research,recenter:()=>api.recenter(),exit:()=>api.end(),physical:v=>{state.physical=v;input.reset();},isPhysical:()=>state.physical,error:report});
  rig.add(panel.mesh);
  const jointGeometry=new THREE.SphereGeometry(1,6,4), jointMaterial=new THREE.MeshBasicMaterial({color:0xb8e8dc,depthTest:true});
  const dummy=new THREE.Object3D(), samplePosition=new THREE.Vector3();
  for(let i=0;i<2;i++) {
    const controller=manager.getController(i), grip=manager.getControllerGrip(i), hand=manager.getHand(i);
    rig.add(controller,grip,hand);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:i?0xffdd88:0x77ffff,transparent:true,opacity:.8,depthTest:false}));
    line.scale.z=2; line.renderOrder=10001; controller.add(line);
    const model=new THREE.Mesh(new THREE.CylinderGeometry(.018,.026,.1,8),new THREE.MeshStandardMaterial({color:0x365466,roughness:.7})); model.rotation.x=Math.PI/2; grip.add(model);
    const joints=new THREE.InstancedMesh(jointGeometry,jointMaterial,25); joints.frustumCulled=false; hand.add(joints);
    const C={controller,grip,hand,joints,line,model,source:null,captured:false,selecting:false,tracked:false,point:null,position:{x:0,y:0,z:0}}; controls.push(C);
    controller.addEventListener('connected',event=>{C.source=event.data;C.selecting=false;C.captured=false;});
    controller.addEventListener('disconnected',()=>{ if(C.captured) panel.release(); C.source=null;C.selecting=false;C.captured=false; });
    controller.addEventListener('selectstart',()=>select(C,true));
    controller.addEventListener('selectend',()=>select(C,false));
  }
  function ray(C) { C.controller.updateWorldMatrix(true,false); raycaster.ray.origin.setFromMatrixPosition(C.controller.matrixWorld); raycaster.ray.direction.copy(FORWARD).transformDirection(C.controller.matrixWorld); return raycaster.ray; }
  function hitPanel(C) {
    ray(C); panel.mesh.updateWorldMatrix(true,false); const hit=raycaster.intersectObject(panel.mesh,false)[0];
    if(hit) { const p=panel.hit(hit.uv); if(p) {C.line.scale.z=hit.distance;return p;} }
    return null;
  }
  function select(C,on) {
    if(!state.active||!visible||!C.source) return;
    if(on) {
      C.point=hitPanel(C); C.captured=!!C.point;
      if(C.point) panel.pointer('down',C.point,button(C.source,1)?2:0);
      else if(!panel.blocked()&&h.switchAt(ray(C),button(C.source,1))) C.captured=true;
      C.selecting=true;
    } else {
      if(C.captured) panel.pointer('up',hitPanel(C)||C.point,button(C.source,1)?2:0);
      C.selecting=false;C.captured=false;
    }
  }
  const api={state,rig,camera:xrCamera,input,panel,controls,renderTarget:rt,
    get active(){return state.active;},get motionInput(){return state.active&&!state.physical&&input.engaged;},
    get pad(){return api.motionInput?input.pad:null;},get blocked(){return state.active&&panel.blocked();},
    recenter(){calibration.needed=true;panel.release();input.reset();},
    async start(){
      if(state.active||state.requesting||!state.supported)return false;
      state.requesting=true;enter.disabled=true;report('');
      h.audio?.();   // start the game's audio on this click: requestSession uses up the user activation the browser needs for sound
      try {
        const hands=entry.querySelector('#xrHands').checked;
        if(window.__xrlog){const gl=renderer.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');window.__xrlog('GPU '+(d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):'?')+' lost '+gl.isContextLost());}
        session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local'],optionalFeatures:hands?['local-floor','hand-tracking']:['local-floor']});
        if(window.__xrlog){const L=window.__xrlog,s=session;L('REQUESTED vis '+s.visibilityState+' features '+JSON.stringify(s.enabledFeatures||[]));let n=0;const raw=(t,f)=>{n++;if(n<4||n%120===0)L('RAWRAF '+n+' vis '+s.visibilityState);s.requestAnimationFrame(raw);};s.requestAnimationFrame(raw);s.addEventListener('visibilitychange',()=>L('VIS '+s.visibilityState));s.addEventListener('end',()=>L('END raw frames '+n));renderer.domElement.addEventListener('webglcontextlost',()=>L('CONTEXTLOST'));renderer.domElement.addEventListener('webglcontextrestored',()=>L('CONTEXTRESTORED'));}
        session.addEventListener('visibilitychange',()=>{visible=session.visibilityState==='visible';if(!visible){input.reset();panel.release();h.pause();}});
        // Chromium/Edge on SteamVR (Steam Link) open a WebXR Layers projection layer but never deliver a frame ("page isn't
        // responding" in the headset); the classic XRWebGLLayer runs at full rate. Three uses layers whenever the browser
        // exposes them, so hide them from Three unless ?xrlayers asks for them.
        if(!new URLSearchParams(location.search).has('xrlayers')&&session.renderState.layers!==undefined){const rs=session.renderState;try{Object.defineProperty(rs,'layers',{value:undefined,configurable:true});}catch(e){}window.__xrlog?.('LAYERS hidden: '+(session.renderState.layers===undefined));}
        let restore=null;
        if(!new URLSearchParams(location.search).has('xrlayers')&&session.renderState.layers!==undefined&&window.XRRenderState){
          const d=Object.getOwnPropertyDescriptor(XRRenderState.prototype,'layers');
          if(d){Object.defineProperty(XRRenderState.prototype,'layers',{get(){return undefined;},configurable:true});restore=()=>Object.defineProperty(XRRenderState.prototype,'layers',d);window.__xrlog?.('LAYERS hidden on prototype');}
        }
        try{await manager.setSession(session);}finally{restore?.();} window.__xrlog?.('SETSESSION done layer '+!!session.renderState.baseLayer+' layers '+(session.renderState.layers?.length||0)); return true;
      } catch(err) { report('Could not enter VR: '+err.message); if(session)await session.end().catch(()=>{});session=null;return false; }
      finally {state.requesting=false;enter.disabled=!state.supported;}
    },
    async end(){if(session)await session.end();},
    begin(dt,frame){
      if(!state.active)return;
      const ref=manager.getReferenceSpace(), pose=frame?.getViewerPose(ref); state.tracking=!!pose;
      if(!pose||!visible){input.reset();panel.release();h.aim(null);return;}
      if(calibration.needed){
        calibration.p.copy(pose.transform.position); euler.setFromQuaternion(q.copy(pose.transform.orientation),'YXZ');calibration.q.setFromAxisAngle(UP,-euler.y);calibration.needed=false;
      }
      const info=h.context(), changed=context!==info.key; if(changed){context=info.key;panel.release();input.reset();h.enterView();state.footYaw=info.yaw||0;}
      rig.updateMatrixWorld(true);state.hands=state.controllers=0;
      for(const C of controls){
        if(!C.source)continue;
        C.tracked=!!frame.getPose(C.source.targetRaySpace,ref);
        if(!C.tracked){if(C.captured)panel.release();C.selecting=false;C.captured=false;C.line.visible=false;continue;}
        if(C.source.hand)state.hands++;else state.controllers++;
        C.line.visible=true;C.line.scale.z=2;C.model.visible=!C.source.hand;
        C.point=hitPanel(C); if(C.point)panel.pointer('move',C.point);
        C.controller.getWorldPosition(samplePosition);rig.worldToLocal(samplePosition);samplePosition.applyQuaternion(calibration.q);
        C.position.x=samplePosition.x;C.position.y=samplePosition.y;C.position.z=samplePosition.z;
        let n=0;
        if(C.source.hand)for(const joint of Object.values(C.hand.joints)){if(!joint.visible)continue;dummy.position.copy(joint.position);dummy.quaternion.copy(joint.quaternion);dummy.scale.setScalar(Math.max(.004,joint.jointRadius||.008));dummy.updateMatrix();C.joints.setMatrixAt(n++,dummy.matrix);if(n===25)break;}
        C.joints.count=n;C.joints.instanceMatrix.needsUpdate=n>0;
        if(panel.blocked()&&C.point&&!C.source.hand){const axes=controllerAxes(C.source);if(Math.abs(axes[1])>.2)panel.scroll(axes[1]*dt*700);}
      }
      input.poll(controls.filter(c=>c.source),dt,{...info,blocked:panel.blocked()||state.physical,visible});
      if(!state.physical&&!panel.modals()){
        if(manual.fire){input.actions.fire=true;input.pad.buttons[7].pressed=true;input.pad.buttons[7].value=1;}
        if(manual.secondary){input.actions.missile=input.actions.ads=true;input.actions.pickle=info.kind==='ground';input.pad.buttons[6].pressed=true;input.pad.buttons[6].value=1;}
      }
      for(const k of ['fire','missile','pickle','wheelbrake']){input.pressed[k]=!changed&&!!input.actions[k]&&!actionWas[k];actionWas[k]=!!input.actions[k];}
      for(const event of input.events){if(event==='panel')panel.toggle();else if(event==='command'){panel.close();tap('Backslash');}else if(event==='view')tap('KeyV');else if(event==='interact')tap('KeyY');}
      if(state.physical)state.footYaw=info.yaw||0;
      if(input.snap){state.footYaw-=input.snap;h.snap(input.snap);}
      if(!state.physical&&info.kind==='foot'){
        const right=controls.find(c=>c.source?.handedness==='right'&&c.tracked&&!c.captured);
        h.aim(right?ray(right):null);
      }else h.aim(null);
    },
    applyControls(target){
      if(!api.motionInput)return;
      for(const k of ['stick','rudder','hasPedals','throttle','source','brakeL','brakeR','hatX','hatY','twist'])target[k]=input[k];
      // HOTAS polls mutate their action dictionaries in place. Copy values, so a later poll cannot overwrite XR.
      for(const k in target.actions)if(k!=='lookhat')target.actions[k]=false;
      for(const k in target.pressed)target.pressed[k]=false;
      Object.assign(target.actions,input.actions);Object.assign(target.pressed,input.pressed);
      if(h.context().kind!=='air')target.throttle=null;
    },
    prepare(){
      if(!state.active)return;
      const flat=!!h.flatView();state.flat=flat;
      if(flat!==previousFlat){ (flat?room:scene).add(rig); previousFlat=flat;panel.release(); }
      screen.visible=flat;
      if(flat){rig.position.set(0,0,0);rig.quaternion.copy(calibration.q);}
      else {rig.position.copy(camera.position);rig.quaternion.copy(camera.quaternion).multiply(calibration.q);}
      rig.position.sub(v.copy(calibration.p).applyQuaternion(rig.quaternion));
      rig.updateMatrixWorld(true);xrCamera.near=.03;xrCamera.far=flat?20:camera.far;
      manager.updateCamera(xrCamera);
      // Keep the full interface inside both eye frusta, including narrower headset/mirror aspect ratios.
      const halfX=Math.min(...manager.getCamera().cameras.map(c=>{const p=c.projectionMatrix.elements;return (1-Math.abs(p[8]))/p[0];}));
      panel.width=Number.isFinite(halfX)&&halfX>0?Math.min(2.8,3.6*halfX*.9):2.8;
      const localForward=v.set(0,0,-1).applyQuaternion(q.copy(calibration.q).invert());
      panel.mesh.position.copy(calibration.p).addScaledVector(localForward,1.8);panel.mesh.position.y-=.05;panel.mesh.quaternion.copy(calibration.q).invert();
      screen.position.copy(calibration.p).addScaledVector(localForward,1.8);screen.position.y-=.05;screen.quaternion.copy(panel.mesh.quaternion);
      screen.scale.set(panel.width/2.8,(panel.width/2.8)*(innerHeight/innerWidth)/(9/16),1);
      if(!flat){xrCamera.getWorldPosition(camera.position);xrCamera.getWorldQuaternion(camera.quaternion);camera.updateMatrixWorld(true);}
      panel.update(performance.now());state.frames++;
    },
    render(drawDesktop){
      if(!state.active)return false;
      if(state.flat){
        const oldTarget=renderer.getRenderTarget();manager.enabled=false;
        try {renderer.setRenderTarget(rt);drawDesktop();} finally{renderer.setRenderTarget(oldTarget);manager.enabled=true;}
        renderer.render(room,xrCamera);
      }else {renderer.render(scene,xrCamera);h.overlay(xrCamera);}
      return true;
    },
    resize(){if(state.active){pendingResize=true;return true;}return false;}
  };
  manager.enabled=true;manager.cameraAutoUpdate=false;manager.setReferenceSpaceType('local');
  const scale=Number(new URLSearchParams(location.search).get('xrscale'))||.8;
  manager.setFramebufferScaleFactor(Math.max(.5,Math.min(1,scale)));manager.setFoveation(1);
  manager.addEventListener('sessionstart',()=>{
    window.__xrlog?.('SESSIONSTART '+JSON.stringify(manager.getSession()?.renderState?.baseLayer?{w:manager.getSession().renderState.baseLayer.framebufferWidth,h:manager.getSession().renderState.baseLayer.framebufferHeight}:{}));
    document.documentElement.classList.add('ngc-vr');
    state.active=true;visible=true;state.frames=0;calibration.needed=true;context='';rig.visible=true;panel.enable(true);entry.style.display='none';
    if(document.pointerLockElement)document.exitPointerLock();h.session(true);enter.textContent='EXIT VR';
    if(window.__xrlog)for(const ms of [3000,10000,30000])setTimeout(()=>window.__xrlog('AUDIO '+(h.audioState?.()||'?')),ms);
  });
  manager.addEventListener('sessionend',()=>{
    window.__xrlog?.('SESSIONEND frames '+state.frames);
    document.documentElement.classList.remove('ngc-vr');
    state.active=false;session=null;state.tracking=false;input.reset();panel.enable(false);rig.visible=false;h.aim(null);
    for(const C of controls){C.selecting=C.captured=false;}scene.add(rig);previousFlat=false;entry.style.display='block';enter.textContent='ENTER VR';h.session(false);
    if(pendingResize){pendingResize=false;h.resize();}
  });
  enter.onclick=()=>state.active?api.end():api.start();
  if(!isSecureContext){enter.textContent='VR NEEDS HTTPS';status.textContent='Use HTTPS, or localhost through USB port forwarding.';}
  else if(!navigator.xr){window.__xrlog?.('NO navigator.xr');enter.textContent='VR UNAVAILABLE';status.textContent='Open this game in a WebXR headset browser.';}
  else navigator.xr.isSessionSupported('immersive-vr').then(ok=>{window.__xrlog?.('SUPPORTED '+ok);state.supported=ok;enter.disabled=!ok;enter.textContent=ok?'ENTER VR':'VR UNAVAILABLE';status.textContent=ok?'Controllers + optional hand tracking':'Connect a VR headset or open its browser.';}).catch(err=>{enter.textContent='VR UNAVAILABLE';report(err.message);});
  return api;
}
