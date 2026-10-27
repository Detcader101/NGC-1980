// Real first-person swimmer, ordinary medium sea life, no injected schools or enlarged fish.
// Scripted placement on a natural shelf skips the walk from shore; C still drives the actual dive simulation.
export default { name: 'infantry-underwater', seed: 1980, query: '?debug&auto&kb&peace&res=0.6&sealife=medium&sea=4', run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 30000);
  await h.eval('(__G.G.bench=true,1)');
  await h.waitFor('__G.sealife.sim.schools.length>=10', 60000);
  await h.eval(`(() => {
    const g=__G, I=g.ISLANDS[0]; let spot=null;
    for(let d=50;d<650&&!spot;d+=2){const x=I.x+d,z=I.z,b=g.terrainH(x,z);
      if(b < -6 && b > -9 && g.terrainH(x+12,z)<-5 && g.terrainH(x+30,z)<-6)spot={x,z,bed:b};}
    if(!spot)throw Error('No natural underwater shelf found');
    window.__swimSpot=spot;
    g.toHeli();g.H.reset(new g.THREE.Vector3(I.x-100,140,I.z-180),0,false,1);g.HI.setCollective(.45);
    g.foot.spawnAt({x:spot.x,y:-1.3,z:spot.z,yaw:-Math.PI/2},{force:true});
    g.crafts.control('foot',0,g.crafts.active.id);g.marine.view='first';g.marine.aim(-Math.PI/2,-.08);
    return {fixture:'Real infantry camera on natural shelf; no spawned or resized fish',spot,initialSchools:g.sealife.sim.schools.length};
  })()`, 'shelf-placement');
  await h.waitFor('__G.foot.W.swim',30000);
  await h.shot('surface-swimmer');
  await h.key('down','KeyC');
  try {
    await h.waitFor('__G.sealife.under && __G.sealife.camDepth>2',60000);
    await h.eval('(window.__swimUntil=__G.war.sea.t+12,1)');
    await h.waitFor('__G.war.sea.t>=__swimUntil',120000);
    await h.expect('__G.G.craft==="foot" && __G.foot.W.swim && __G.sealife.under && __G.sealife.bedReady', 'Actual Marine dive uses underwater camera and seabed');
    await h.eval(`(() => {
      const g=__G,L=g.sealife,p=g.zCam.position;
      return {camera:p.toArray(),depth:L.camDepth,fog:[L.bedMesh.material.uniforms.uFogP.value.x,L.bedMesh.material.uniforms.uFogP.value.y],drawn:L.fishDrawn,schools:L.sim.schools.map(s=>({species:s.sp,distance:Math.hypot(s.cx-p.x,s.cy-p.y,s.cz-p.z),fade:s.fade})),nearby:L.sim.fish().filter(f=>Math.hypot(f.x-p.x,f.y-p.y,f.z-p.z)<25).length};
    })()`, 'underwater-state');
    await h.expect('__G.sealife.bedMesh.material.uniforms.uFogP.value.y>=48', 'Underwater visibility extends beyond 48 metres in sea state 4');
    // Two renders in one frame isolate the actual fish bodies from water, particles, scenery and UI.
    await h.eval(`(() => {
      const g=__G,r=g.renderer,original=r.render.bind(r);window.__fishPixels=null;window.__fishPixelRequest=false;
      r.render=(scene,cam)=>{original(scene,cam);if(!__fishPixelRequest||cam!==g.zCam||scene!==g.sealife.bedMesh.parent)return;
        __fishPixelRequest=false;const rt0=r.getRenderTarget();r.setRenderTarget(null);original(scene,cam);const gl=r.getContext(),w=gl.drawingBufferWidth,hh=gl.drawingBufferHeight,a=new Uint8Array(w*hh*4),b=new Uint8Array(a.length);
        gl.readPixels(0,0,w,hh,gl.RGBA,gl.UNSIGNED_BYTE,a);
        const meshes=['school','fish','dolphin','ray','jelly'].map(k=>g.sealife.meshes[k]),visible=meshes.map(m=>m.visible);
        meshes.forEach(m=>m.visible=false);original(scene,cam);gl.readPixels(0,0,w,hh,gl.RGBA,gl.UNSIGNED_BYTE,b);
        meshes.forEach((m,i)=>m.visible=visible[i]);r.setRenderTarget(rt0);original(scene,cam);
        let changed=0,delta=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>12)changed++;delta+=d;}
        window.__fishPixels={changed,delta,width:w,height:hh,drawn:g.sealife.fishDrawn};};return 1;
    })()`);
    await h.eval('(__fishPixelRequest=true,1)');await h.waitFor('__fishPixels!==null',30000);
    await h.eval('__fishPixels','natural-fish-pixels');
    await h.expect('__fishPixels.changed>100', 'Natural fish bodies visibly affect more than 100 pixels from the swimmer camera');
    await h.benchmark('underwater-natural');
    await h.shot('underwater-natural');await h.notblank();
    if(h.capture)await h.clip('underwater-natural',{durationMs:6000});
    await h.eval('(__G.sealife.setQuality("off"),1)');await h.wait(400);
    await h.eval('(__fishPixels=null,__fishPixelRequest=true,1)');await h.waitFor('__fishPixels!==null',30000);
    await h.expect('__fishPixels.changed===0 && __G.sealife.sim.schools.length===0', 'Sea life Off removes fish bodies while keeping the underwater view');
    await h.shot('underwater-off');
    await h.eval('(__G.sealife.setQuality("medium"),1)');
  } finally { await h.key('up','KeyC'); }
  await h.waitFor('!__G.sealife.under',60000);
  await h.expect('__G.foot.W.swim && !__G.sealife.bedMesh.visible', 'Releasing dive returns the Marine to the surface');
  await h.shot('resurfaced');
}};
