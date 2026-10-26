// Real WebXR session/eyes/input events through Meta's IWER runtime. Emulator is injected only by this test.
import fs from 'node:fs';
const iwer=fs.readFileSync(new URL('../node_modules/iwer/build/iwer.min.js',import.meta.url),'utf8');
export default {name:'xr',query:'?debug&kb&peace&res=0.45&tech=all',run:async h=>{
  await h.page.evaluateOnNewDocument(iwer+';const xrContainer=document.createElement("div");xrContainer.dataset.xrIgnore="";xrContainer.style.pointerEvents="none";window.__xrDevice=new IWER.XRDevice(IWER.metaQuest3,{canvasContainer:xrContainer});__xrDevice.stereoEnabled=true;__xrDevice.installRuntime({forceInstall:true});');
  await h.goto('?debug&kb&peace&res=0.45&tech=all');
  if(!await h.waitFor('window.__G && __G.XR.state.supported',30000)) throw Error('emulated WebXR unavailable');
  await h.page.click('#enterVR');
  if(!await h.waitFor('__G.XR.active && __G.XR.state.frames>5',30000)) throw Error('VR entry failed');
  await h.expect('__G.G.state==="play" && __G.renderer.xr.isPresenting','VR entry starts a normal playable game');
  await h.expect('__G.renderer.xr.getCamera().cameras.length===2','WebXR supplies two eye cameras');
  await h.expect('__G.zCam.position.distanceTo(__G.H.pos)<4','seated head is in the aircraft, not at the world origin');
  await h.expect('__G.XR.state.controllers===2','both tracked controllers connected');
  await h.expect('__G.renderer.xr.getSession().enabledFeatures.includes("hand-tracking")','optional hand tracking negotiated');
  await h.shot('vr-cockpit-stereo');await h.notblank();
  await h.eval('(__G.war.carrier.speed=0,__G.war.carrier.path=[],__G.G.state="paused",window.__head0=__G.zCam.position.clone(),window.__body0=__G.H.pos.clone(),1)');
  await h.eval('(__xrDevice.position.x+=.2,1)');await h.wait(800);
  await h.expect('Math.abs(__G.zCam.position.distanceTo(__head0)-.2)<.03 && __G.H.pos.distanceTo(__body0)<.001','head translation is 1:1 metres and does not move the craft');
  await h.eval('(__G.G.state="play",1)');
  await h.eval('(__xrDevice.controllers.right.updateAxes("thumbstick",.5,-.35),__xrDevice.controllers.left.updateAxes("thumbstick",.25,-.5),1)');await h.wait(500);
  await h.expect('__G.CTL.state.stick.x>.2 && __G.CTL.state.stick.y<-.1 && __G.CTL.state.rudder>.05','XR axes reach the ordinary flight input path');
  await h.eval('(__xrDevice.controllers.right.updateAxes("thumbstick",0,0),__xrDevice.controllers.left.updateAxes("thumbstick",0,0),1)');
  // Aimed ray click: the original DOM rectangle is projected onto the physical panel, then the controller points there.
  await h.eval(`(window.__pointVR=async(selector,hand=false)=>{
    const X=__G.XR,T=__G.THREE,head=await new Promise(resolve=>__G.renderer.xr.getSession().requestAnimationFrame((t,f)=>resolve(f.getViewerPose(__G.renderer.xr.getReferenceSpace()).transform.position))),r=typeof selector==='string'?document.querySelector(selector).getBoundingClientRect():{x:selector.x,y:selector.y,width:0,height:0};
    X.panel.mesh.updateMatrix();const p=new T.Vector3((r.x+r.width/2)/innerWidth-.5,.5-(r.y+r.height/2)/innerHeight,0).applyMatrix4(X.panel.mesh.matrix);
    // IWER poses use floor coordinates; the requested local reference space starts at the seated head.
    p.add(new T.Vector3(__xrDevice.position.x,__xrDevice.position.y,__xrDevice.position.z)).sub(head);
    const d=hand?__xrDevice.hands.right:__xrDevice.controllers.right;d.position.set(.25,1.25,-.35);const dir=p.sub(new T.Vector3(d.position.x,d.position.y,d.position.z)).normalize();d.quaternion.copy(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),dir));return p.toArray();},1)`);
  const click=async(selector,hand=false)=>{
    await h.eval(`__pointVR(${JSON.stringify(selector)},${hand})`);await h.wait(500);
    await h.eval(hand?'(__xrDevice.hands.right.updatePinchValue(1),1)':'(__xrDevice.controllers.right.updateButtonValue("trigger",1),1)');await h.wait(400);
    await h.eval(hand?'(__xrDevice.hands.right.updatePinchValue(0),1)':'(__xrDevice.controllers.right.updateButtonValue("trigger",0),1)');await h.wait(500);
  };
  await click('#xrBar button:nth-child(3)');
  await h.expect('__G.techUI.isOpen','controller ray opens the real research page');
  await h.waitFor('__G.XR.panel.captures>0',30000);await h.shot('vr-research-stereo');
  await h.expect('__G.XR.panel.captures>0 && __G.XR.panel.mesh.material.map.image.width>=800','research rendered into the spatial interface');
  const choice=await h.eval(`(()=>{const U=__G.techUI,T=__G.war.tech[1],cell=U.cells.find(c=>T.canResearch(c.n.id,__G.G)===true),cv=document.querySelector('#techBoard canvas'),r=cv.getBoundingClientRect();window.__research=cell.n.id;window.__mat0=__G.G.mat;return {x:r.x+(cell.x+cell.w/2)/cv.width*r.width,y:r.y+(cell.y+cell.h/2)/cv.height*r.height};})()`);
  await click(choice);await click(choice);
  await h.expect('__G.war.tech[1].current?.id===__research && __G.G.mat<__mat0','controller clicks select and fund a real research programme');
  await h.eval('(__G.techUI.close(),__xrDevice.primaryInputMode="hand",1)');await h.wait(1000);
  await h.expect('__G.XR.state.hands===2 && __G.XR.controls.some(c=>c.joints.count===25)','tracked hands have visible 25-joint representations');
  await h.eval('(__xrDevice.hands.right.quaternion.set(0,0,0,1),__xrDevice.hands.right.updatePinchValue(1),1)');await h.wait(300);
  await h.eval('(__xrDevice.hands.right.position.x+=.06,1)');await h.wait(300);
  await h.expect('__G.XR.input.stick.x>.35&&!__G.XR.input.actions.fire','right-hand pinch displacement flies without firing');
  await h.eval('(__xrDevice.hands.right.updatePinchValue(0),1)');await h.wait(300);
  await h.expect('__G.XR.input.stick.x===0','releasing the hand pinch centres the stick');
  await click('#xrBar button:nth-child(2)',true);
  await h.expect('__G.commander.isOpen','hand pinch opens the real command board');
  await h.wait(800);await h.shot('vr-hands-command');
  await h.eval('(__G.commander.close(),__G.XR.end(),1)');await h.waitFor('!__G.XR.active',15000);
  await h.expect('!__G.renderer.xr.isPresenting && !__G.XR.input.active && !document.documentElement.classList.contains("ngc-vr")','session exit releases input and restores desktop UI');
  await h.shot('desktop-after-vr');await h.notblank();
}};
