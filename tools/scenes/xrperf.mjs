import {setupXR,frames,click} from '../xr-harness.mjs';
export default {name:'xrperf',query:'?debug&kb&peace&res=0.45&xrscale=0.8',run:async h=>{
  await setupXR(h,'?debug&kb&peace&res=0.45&xrscale=0.8');
  await frames(h,8);
  // Observe the session's animation callbacks without adding renders or changing the game clock.
  await h.eval(`(window.__measureXR=()=>new Promise(resolve=>{
    const session=__G.renderer.xr.getSession(),rows=[];let last=0,lastFrame=-1;
    const tick=()=>{const now=performance.now(),frame=__G.XR.state.frames;
      if(frame!==lastFrame){if(last)rows.push({frame,ms:now-last,sim:__G.PROF.sim,prep:__G.PROF.prep,render:__G.PROF.render,calls:__G.renderer.info.render.calls,triangles:__G.renderer.info.render.triangles,capture:__G.XR.panel.lastCaptureMs});last=now;lastFrame=frame;}
      if(rows.length<30)session.requestAnimationFrame(tick);else{const quant=(key,p)=>rows.map(x=>x[key]).sort((a,b)=>a-b)[Math.floor((rows.length-1)*p)];resolve({samples:rows.length,frameMs:{p50:quant('ms',.5),p95:quant('ms',.95),mean:rows.reduce((s,r)=>s+r.ms,0)/rows.length},cpuMs:{simP50:quant('sim',.5),prepP50:quant('prep',.5),renderP50:quant('render',.5)},callsP50:quant('calls',.5),trianglesP50:quant('triangles',.5),uiCaptureMsP50:quant('capture',.5),memory:{...__G.renderer.info.memory},eyeViewports:__G.renderer.xr.getCamera().cameras.map(c=>c.viewport.toArray()),scale:.8,renderer:'Chrome SwiftShader, IWER Quest 3 emulation; not physical headset performance',rows});}};session.requestAnimationFrame(tick);}),1)`);
  await h.eval('window.__perfCockpit=await __measureXR()','cockpit benchmark');
  await click(h,'#xrBar button:nth-child(3)');await frames(h,6);
  await h.eval('window.__perfUI=await __measureXR()','research UI benchmark');
  await h.expect('__perfCockpit.samples===30&&__perfUI.samples===30&&__perfCockpit.eyeViewports.length===2','both benchmark cases contain 30 real stereo frames');
  await h.expect('__perfUI.memory.textures-__perfCockpit.memory.textures<20','opening research keeps texture allocation bounded');
  await h.shot('bench-research');await h.eval('(__G.techUI.close(),__G.XR.end(),1)');await h.waitFor('!__G.XR.active',15000);
}};
