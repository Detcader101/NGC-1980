export default {
  name:'renderkit',seed:1980,query:'/dev/renderkit.html?still',
  fixtureFiles:['game/dev/renderkit-checks.js'],
  run:async h=>{
    await h.waitFor('window.__RK?.ready && __RK.frame>2',30000);
    await h.eval(`(async()=>{const {runRenderKitChecks}=await import('/dev/renderkit-checks.js'); window.__RKChecks=runRenderKitChecks(__RK.renderer,__RK.scene.environment); return __RKChecks;})()`,'GPU contracts');
    await h.expect('__RKChecks.passed>=60','shader families and lifecycle contracts');
    await h.benchmark('model-preview',{frames:30,warmup:10});
    await h.shot('models');await h.notblank();
    for(const view of ['terrain','particles','interface','temporal']) {
      await h.page.click(`[data-view="${view}"]`);
      await h.expect(`__RK.selected===${JSON.stringify(view)}`,'preview navigation');
      await h.wait(150);await h.shot(view);await h.notblank();
    }
    await h.page.select('#particle','fire');await h.expect('__RK.selected==="particles" && __RK.emitters.fire.mesh.visible','particle selector');
    await h.page.$eval('#wetness',el=>{el.value='0.8';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await h.expect('__RK.surfaceMaterials.every(m=>m.userData.renderkit.uniforms.rkWet.value===0.8)','live material slider');
    await h.page.$eval('#temporal',el=>{el.value='0.75';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await h.expect('__RK.post.uniforms.rkTemporal.value===0.75','post control');
    await h.page.click('#motion');await h.expect('!__RK.paused','motion can resume');
    await h.eval('window.__previousRKTime=__RK.time.value');await h.wait(150);
    await h.expect('__RK.time.value>__previousRKTime','simulation clock advances');
    await h.page.click('#motion');await h.eval('window.__previousRKTime=__RK.time.value');await h.wait(150);
    await h.expect('__RK.paused && __RK.time.value===__previousRKTime','pause freezes simulation time');
    await h.page.select('#quality','0.75');await h.wait(100);
    await h.expect('__RK.renderer.getPixelRatio()===0.75','density control');
    await h.page.setViewport({width:390,height:844,deviceScaleFactor:1});await h.wait(150);
    await h.expect('document.documentElement.scrollWidth<=390','mobile layout fits viewport');
    await h.shot('mobile');await h.notblank();
    await h.page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    // Remove ?still so this assertion depends on the preference, not the capture flag.
    const motionUrl=new URL(h.page.url());motionUrl.searchParams.delete('still');
    await h.page.goto(motionUrl.href,{waitUntil:'networkidle0'});await h.waitFor('window.__RK?.ready');
    await h.expect('__RK.paused','reduced motion pauses GPU effects');
  },
};
