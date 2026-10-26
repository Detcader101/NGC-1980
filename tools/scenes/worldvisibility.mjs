// Real streamed scenery outside the war zone, approaching through the LOD band; normal game renderer and workers.
export default {
  name:'worldvisibility', query:'?debug&auto&kb&peace&res=0.5',
  run:async h=>{
    await h.waitFor("window.__G && __G.G.state==='play' && window.__WORLD",30000);
    await h.eval('(__G.G.bench=true,1)');
    const hover=async(x,z,y,tx,tz)=>{
      await h.eval(`(()=>{clearInterval(window.__hold);const G=__G,H=G.H;H.reset(new G.THREE.Vector3(${x},${y},${z}),Math.atan2(-(${tx}-(${x})),-(${tz}-(${z}))),false,1);G.HI.setCollective(.45);G.cockpitCam=false;
        let prev=-1;window.__hold=setInterval(()=>{if(G.war.time===prev)return;prev=G.war.time;G.HI.setCollective(Math.max(.2,Math.min(.7,.45+(${y}-H.pos.y)*.02-H.vel.y*.04)))},16);return 1})()`);
    };
    const sample=async(label)=>{
      await h.eval(`(()=>{window.__frames=[];window.__last=performance.now();window.__measure=true;const tick=t=>{if(!__measure)return;__frames.push(t-__last);__last=t;requestAnimationFrame(tick)};requestAnimationFrame(tick);return 1})()`);
      await h.wait(6000);
      return h.eval(`(()=>{__measure=false;const a=__frames.filter(t=>t>0).sort((a,b)=>a-b),W=__WORLD;return {label:${JSON.stringify(label)},frames:a.length,frameMs50:a[a.length>>1],frameMs95:a[Math.floor(a.length*.95)],...W.stats,calls:__G.renderer.info.render.calls,triangles:__G.renderer.info.render.triangles,geometries:__G.renderer.info.memory.geometries,textures:__G.renderer.info.memory.textures}})()`);
    };
    const T=await h.eval(`(()=>{const a=__WORLD.net.settlementsNear(3600,1200,5000).filter(s=>s.size!=='hamlet').sort((a,b)=>(b.size==='town')-(a.size==='town')||Math.hypot(a.x-3600,a.z-1200)-Math.hypot(b.x-3600,b.z-1200));window.__T=a[0];return {x:__T.x,z:__T.z,y:__G.groundY(__T.x,__T.z)}})()`);
    const reports=[];
    for(const d of [680,520,360]){
      await hover(T.x,T.z+d,Math.max(80,T.y+65),T.x,T.z);
      await h.waitFor('__WORLD.stats.chunks>8 && __WORLD.stats.pending===0',60000);await h.wait(2500);
      await h.expect('__WORLD.stats.forestTrees>100 && __WORLD.stats.prefetch>__WORLD.stats.draw');
      reports.push(await sample('town-'+d));await h.shot('town-'+d+'m');await h.notblank();
      if(d===520)await h.expect('[...__WORLD.chunks.values()].some(c=>c.state==="ready" && c.sN?.visible && c.sF?.visible)');
    }
    // A moving height-map window must retain existing trees; visit a second position, then return.
    await h.eval('(()=>{window.__trees=new Map([...__WORLD.chunks].filter(([,c])=>c.state==="ready").map(([k,c])=>[k,c.forestTrees]));window.__transitionSeen=false;return 1})()');
    await h.eval(`(()=>{const r=__G.renderer,render=r.render.bind(r);r.render=(s,c)=>{const t=__G.terrainUni.uHMNblend.value;if(t>0&&t<1)window.__transitionSeen=true;return render(s,c)};return 1})()`);
    await hover(T.x+900,T.z+360,Math.max(80,T.y+65),T.x+900,T.z);
    await h.wait(12000);await h.waitFor('__WORLD.stats.pending===0',60000);
    await h.expect('__transitionSeen');
    await h.expect('[...__WORLD.chunks].every(([k,c])=>c.state!=="ready"||!__trees.has(k)||__trees.get(k)===c.forestTrees)');
    reports.push(await sample('after-900m'));await h.shot('forest-after-window-move');
    await h.expect('__WORLD.stats.chunks<180 && __WORLD.stats.pending<=2');
    // Stream continuously for 2 km at 100 m/s. This is a camera-path fixture, not a helicopter flight-model test.
    await h.eval(`(()=>{clearInterval(__hold);window.__flight={start:__G.war.time,x:__G.H.pos.x,z:__G.H.pos.z,maxChunks:0,maxPending:0,distance:0};
      window.__fly=setInterval(()=>{const f=__flight;f.distance=Math.min(2000,(__G.war.time-f.start)*100);__G.H.pos.set(f.x+f.distance,300,f.z);__G.H.vel.set(0,0,0);f.maxChunks=Math.max(f.maxChunks,__WORLD.stats.chunks);f.maxPending=Math.max(f.maxPending,__WORLD.stats.pending)},16);return 1})()`);
    await h.waitFor('__flight.distance>=2000',120000);
    await h.eval('(clearInterval(__fly),1)');
    await h.expect('__flight.maxChunks<180 && __flight.maxPending<=2 && __G.Z.alive');
    await h.eval('__flight');await h.shot('continuous-flight-2km');await h.notblank();
    // Wider control-zone edge: haze approaches continuously on both sides of x=1280.
    await hover(1260,234,280,1008,234);await h.wait(4000);const a=await h.eval('__WORLD.stats.draw');await h.shot('zone-edge-inside');
    await hover(1300,234,280,1008,234);await h.wait(4000);const b=await h.eval('__WORLD.stats.draw');
    await h.expect(`${Math.abs(a-b)}<12`);await h.shot('zone-edge-outside');
    // Survey fixtures disable strategic intelligence masking to show the different coast shapes and geology.
    await h.eval('(__G.fog.enabled=false,1)');
    for(const name of ['HOME ISLAND','PELICAN','CITADEL','SANDBAR']){
      const I=await h.eval(`(()=>{const I=__G.ISLANDS.find(I=>I.name===${JSON.stringify(name)});return {x:I.x,z:I.z,r:I.r}})()`);
      await hover(I.x+I.r*.2,I.z+I.r*1.65,Math.max(130,I.r*.85),I.x,I.z);await h.wait(2500);await h.shot('island-'+name.toLowerCase().replaceAll(' ','-'));await h.notblank();
    }
    await h.eval('(clearInterval(__hold),1)');
    console.log('WORLD_VISIBILITY_BENCH '+JSON.stringify(reports));
  }
};
