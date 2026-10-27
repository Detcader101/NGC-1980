// Natural populations through the real chase camera; no forced schools or modified fish sizes.
// Pixel A/B uses two renders in the same frame so water, lighting and aircraft motion cannot fake a result.
export default { name: 'visibility', query: '?debug&kb&peace&res=0.6&tech=default', run: async h => {
  await h.waitFor('window.__G', 30000);
  await h.key('tap', 'Enter');
  await h.waitFor("__G.G.state==='play'", 20000);
  await h.eval('(__G.G.bench=true,1)');
  await h.page.click('#fleet [data-research]');
  await h.expect('__G.techUI.isOpen && !__G.commander.isOpen && !document.pointerLockElement');
  await h.shot('tech-tree-from-hud');
  await h.key('tap', 'Escape'); await h.key('tap', 'Escape');
  await h.page.click('#menu [data-action="research"]');
  await h.expect('__G.techUI.isOpen && __G.G.state==="play"');
  await h.key('tap', 'Escape');
  await h.page.click('#fleet [data-command]'); await h.page.click('#cmdBoard [data-research]');
  await h.expect('__G.techUI.isOpen && !__G.commander.isOpen');
  await h.key('tap', 'Escape');
  await h.eval(`(() => {
    const r=__G.renderer, original=r.render.bind(r);
    window.__pixelRequest=false; window.__pixelResult=null;
    r.render=(scene,cam)=>{
      original(scene,cam);
      if(!__pixelRequest || scene!==__G.sealife.signMesh.parent || cam!==__G.zCam) return;
      __pixelRequest=false; const rt0=r.getRenderTarget();r.setRenderTarget(null);original(scene,cam);   // measured on the canvas: RenderKit post renders into an MSAA target
      const gl=r.getContext(), w=gl.drawingBufferWidth, h=gl.drawingBufferHeight;
      const a=new Uint8Array(w*h*4), b=new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
      const L=__G.sealife, meshes=[L.signMesh,...Object.values(L.meshes)], vis=meshes.map(m=>m.visible);
      meshes.forEach(m=>m.visible=false); original(scene,cam);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
      meshes.forEach((m,i)=>m.visible=vis[i]); r.setRenderTarget(rt0); original(scene,cam);
      let changed=0, delta=0;
      for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>12) changed++;delta+=d;}
      __pixelResult={changed,delta,width:w,height:h,fish:L.fishDrawn,signs:L.signsDrawn,schools:L.sim.schools.length,cam:L.cam.toArray()};
    }; return 1;
  })()`);
  for (const alt of [25,80,220]) {
    await h.eval(`(() => { clearInterval(window.__hover); const H=__G.H;
      H.reset(new __G.THREE.Vector3(-1500,${alt},200),0,false,1); __G.HI.setCollective(.48); __G.cockpitCam=false;
      window.__coll=.48; window.__hover=setInterval(()=>{const vy=Math.max(-2,Math.min(2,(${alt}-H.pos.y)*.5));__coll=Math.max(.2,Math.min(.7,__coll+(vy-H.vel.y)*.002));__G.HI.setCollective(__coll)},16); return 1;
    })()`);
    await h.wait(16000);
    await h.eval('(__pixelResult=null,__pixelRequest=true,1)');
    await h.waitFor('__pixelResult!==null'); await h.eval('__pixelResult');
    await h.expect('__pixelResult.schools>0 && __pixelResult.signs>0 && __pixelResult.changed>80');
    await h.shot(`natural-fish-${alt}m`); await h.notblank();
  }
  await h.eval('(__G.sealife.setQuality("off"),1)'); await h.wait(300);
  await h.eval('(__pixelResult=null,__pixelRequest=true,1)'); await h.waitFor('__pixelResult!==null');
  await h.expect('__pixelResult.changed===0 && __G.sealife.sim.schools.length===0');
  await h.shot('sea-life-off');
  await h.eval('(clearInterval(__hover),1)');
}};
