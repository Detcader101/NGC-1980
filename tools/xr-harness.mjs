// Test-only WebXR emulation. Never imported or served by the game.
import fs from 'node:fs';
const runtime=fs.readFileSync(new URL('./node_modules/iwer/build/iwer.min.js',import.meta.url),'utf8');
export async function setupXR(h,query='?debug&kb&peace&res=0.45&tech=all'){
  await h.page.evaluateOnNewDocument(runtime+';const c=document.createElement("div");c.dataset.xrIgnore="";c.style.pointerEvents="none";window.__xrDevice=new IWER.XRDevice(IWER.metaQuest3,{canvasContainer:c});__xrDevice.stereoEnabled=true;__xrDevice.installRuntime({forceInstall:true});');
  await h.goto(query);
  if(!await h.waitFor('window.__G?.XR.state.supported',30000))throw Error('emulated WebXR unavailable');
  await h.page.click('#enterVR');
  if(!await h.waitFor('__G.XR.active && __G.XR.state.frames>5',30000))throw Error('VR entry failed');
  await h.eval(`(window.__pointVR=async(selector,hand=false)=>{
    const X=__G.XR,T=__G.THREE,head=await new Promise(resolve=>__G.renderer.xr.getSession().requestAnimationFrame((t,f)=>resolve(f.getViewerPose(__G.renderer.xr.getReferenceSpace()).transform.position))),r=typeof selector==='string'?document.querySelector(selector).getBoundingClientRect():{x:selector.x,y:selector.y,width:0,height:0};
    X.panel.mesh.updateMatrix();const p=new T.Vector3((r.x+r.width/2)/innerWidth-.5,.5-(r.y+r.height/2)/innerHeight,0).applyMatrix4(X.panel.mesh.matrix);
    // Convert local tracking coordinates to IWER floor coordinates using the viewer pose, not Three's shifted stereo-union camera.
    p.add(new T.Vector3(__xrDevice.position.x,__xrDevice.position.y,__xrDevice.position.z)).sub(head);
    const d=hand?__xrDevice.hands.right:__xrDevice.controllers.right;d.position.set(.25,1.25,-.35);const dir=p.sub(new T.Vector3(d.position.x,d.position.y,d.position.z)).normalize();d.quaternion.copy(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),dir));return true;},1)`);
}
export async function frames(h,n=3){
  const frame=await h.page.evaluate(()=>__G.XR.state.frames);
  await h.waitFor(`__G.XR.state.frames>=${frame+n}`,30000);
}
export async function point(h,selector,hand=false){await h.eval(`__pointVR(${JSON.stringify(selector)},${hand})`);await frames(h,2);}
export async function trigger(h,on,hand=false){await h.eval(hand?`(__xrDevice.hands.right.updatePinchValue(${on?1:0}),1)`:`(__xrDevice.controllers.right.updateButtonValue('trigger',${on?1:0}),1)`);await frames(h,2);}
export async function click(h,selector,hand=false){await point(h,selector,hand);await trigger(h,true,hand);await trigger(h,false,hand);}
export async function panelShot(h,name){const n=await h.page.evaluate(()=>__G.XR.panel.captures);await h.waitFor(`__G.XR.panel.captures>${n}`,30000);await frames(h,2);await h.shot(name);}
