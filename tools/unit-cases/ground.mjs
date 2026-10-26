// Per-unit rendered fixtures. These use production unit modules in existing dev hosts;
// they measure isolated handling/animation, not a full mission or headset framerate.
// Node counterpart: node tools/unit-groundbench.mjs
const capture = async (h,id) => {
  await h.benchmark(id);
  await h.shot(id);
  await h.notblank();
  if (h.capture) await h.clip(id,{durationMs:6000});
};
const wheeled = [
  ['m151','M151A2 MUTT','playable','Part-time four-wheel drive and front steering on the independent-suspension utility vehicle.'],
  ['m35','M35A2 cargo truck','playable','Loaded cargo truck with ten visible tyres on six driven suspension stations and folding troop benches.'],
  ['landrover','Land Rover Series III 109','civilian','Driveable utility vehicle with selectable low range and right-hand driving position.'],
  ['hilux','Toyota Hilux RN37','civilian','Driveable pickup with selectable low range and an open cargo bed.'],
  ['beetle','Volkswagen Beetle 1200','civilian','Driveable rear-engine, air-cooled road car without a radiator or low-range transfer case.'],
  ['lada','Lada 2101','civilian','Driveable rear-wheel-drive road saloon with conventional liquid cooling.'],
].map(([id,name,kind,description])=>({
  id,name,kind,category:'ground',coverage:'Isolated rendered dev fixture using production wheeled physics and model.',
  query:`dev/vehicle.html?debug&v=${id}&zone=road&cam=orbit&res=0.5&hud=0&ui=0`,description,
  async run(h) {
    await h.waitFor('window.__V && __V.sim && __V.model && window.__BENCH',30000);
    try {
      await h.page.evaluate(id=>{
        const v=window.__V;
        v.teleport(0,100,0);v.cam('orbit',{yaw:1.0,pitch:.24,dist:id==='m35'?10:7});
        if(id==='m35'){v.variant({cover:'off',seats:'down'});v.sim.setLoad([{kg:1600,at:[0,1.6,1.75]}]);}
        v.drive({throttle:.4,brake:0,steer:0,fwd:['m151','m35','landrover','hilux'].includes(id),range:['landrover','hilux'].includes(id)?'L':'H'});
        v.pause(false);
      },id);
      await h.waitFor('__V.sim.speed > 1',30000);
      await h.expect(`__V.id === '${id}' && __V.sim.eng.running && __V.sim.wheels.every(w=>Number.isFinite(w.omega))`,name+' is live, running and rolling');
      if(id==='m35') {
        await h.expect('__V.model.wheels.reduce((n,w)=>n+w.tyres.length,0)===10 && __V.model.wheels.length===6','M35 has ten visible tyres on six hubs');
        await h.expect('__V.sim.loadKg>1500 && __V.model.parts.seats.visible && !__V.model.parts.cover.visible','cargo mass and troop-bench variant are active');
      } else if(id==='m151') {
        await h.expect('__V.sim.fwd && __V.sim.spec.transfer.low === null','MUTT front drive engages without an invented low range');
      } else if(['landrover','hilux'].includes(id)) {
        await h.expect("__V.sim.range==='L' && __V.sim.spec.transfer.low>1",name+' low range engages');
      } else if(id==='beetle') {
        await h.expect('__V.sim.spec.engine.aircooled && !__V.sim.spec.components.radiator && !__V.sim.spec.transfer.low','Beetle retains its air-cooled road-car identity');
      } else {
        await h.expect('!!__V.sim.spec.components.radiator && !__V.sim.spec.transfer.low && __V.sim.spec.axles.every(a=>a.driven!=="F")','Lada retains liquid cooling and rear drive');
      }
      await capture(h,id);
      if(id==='m35'){
        // The side view hides the inner tyres. Capture a low rear view after timing,
        // and let two real renderer frames adopt the camera before taking the shot.
        const frame=await h.eval('(__V.cam("orbit",{yaw:0,pitch:-.145,dist:6}),__V.renderer.info.render.frame)');
        await h.waitFor(`__V.renderer.info.render.frame >= ${frame+2}`,15000);
        await h.shot('m35-rear-dual-tyres');await h.notblank();
      }
    } finally { await h.eval('(__V.drive(null), __V.pause(true), true)'); }
  },
}));

const m60={
  id:'m60',name:'M60A3 TTS',category:'ground',kind:'playable',
  query:'dev/tank.html?debug&veh=m60&view=chase&cam=2.6,0.28,13&res=0.5&ui=0',
  coverage:'Isolated rendered dev fixture using production track physics and M60 model.',
  description:'Cross-drive neutral steering: the hull pivots while its tracks counter-rotate.',
  async run(h){
    await h.waitFor('window.__T && __T.fm && window.__BENCH',30000);
    try {
      await h.eval('(__T.input({range:"N",park:false,throttle:0.8,steer:0.7}),__T.pause(false),true)');
      await h.waitFor('Math.abs(__T.fm.out.yawRate) > .2',30000);
      await h.expect('__T.fm.trackPos[0]*__T.fm.trackPos[1]<0 && __T.fm.eng.running','M60 pivots with opposing track travel');
      await capture(h,'m60');
    } finally { await h.eval('(__T.input(null),__T.pause(true),true)'); }
  },
};
const m113={
  id:'m113',name:'M113A2 APC',category:'ground',kind:'playable',
  query:'dev/tank.html?debug&veh=m113&view=chase&cam=0.7,0.25,10&res=0.5&ui=0',
  coverage:'Isolated rendered dev fixture using production APC ramp, trim-vane and pump controls.',
  description:'Personnel carrier opens its powered rear ramp and deploys its trim vane; bilge pumps switch on.',
  async run(h){
    await h.waitFor('window.__T && __T.V && window.__BENCH',30000);
    try {
      await h.eval('(__T.pause(true),__T.input({park:true,throttle:0,ramp:true,vane:true,pumps:true}),__T.step(540),__T.pause(false),true)');
      await h.expect('__T.V.ramp>.95 && __T.V.vane>.95 && __T.fm.water.pumps','APC ramp, trim vane and pumps respond');
      await h.expect('__T.V.seats.filter(Boolean).length===11 && __T.fm.payload>900','APC carries the represented squad mass');
      await h.benchmark('m113');await h.shot('m113');await h.notblank();
      if(h.capture){await h.eval('(__T.input({ramp:false}),true)');await h.clip('m113',{durationMs:6000});}
    } finally {await h.eval('(__T.input(null),__T.pause(true),true)');}
  },
};
const marine={
  id:'marine',name:'1980 Marine rifleman',category:'ground',kind:'playable',
  query:'dev/infantry.html?debug&third&weapon=1&res=0.5&ui=0',
  coverage:'Isolated rendered infantry fixture using production movement, skeleton and equipment.',
  description:'The M16A1 rifleman changes from running to a low, slower prone crawl.',
  async run(h){
    await h.waitFor('window.__I && __I.S && window.__BENCH',30000);
    try{
      await h.eval('(__I.input({move:[0,1]}),true)');
      await h.waitFor('__I.S.speed>2',20000);
      await h.eval('(__I.input({stance:"prone",move:[0,1]}),true)');
      await h.waitFor('__I.S.stance === "prone" && __I.S.stanceT>=1 && __I.S.speed<.6',20000);
      await h.expect('__I.S.eyeH<.8 && __I.R.cur.key==="M16A1" && __I.me.root.visible','low prone pose retains the period rifle and third-person body');
      await capture(h,'marine');
    }finally{await h.eval('__I.clear()');}
  },
};
const runaway=[
  ['rw1','RW-1 STRIDER','strider','Fictional biped balances and plants alternating feet while walking.'],
  ['rw7','RW-7 hover tank','hovertank','Fictional lift-fan vehicle moves above the terrain on an air cushion.'],
  ['m1a2','Captured M1A2 SEPv3','m1a2','Seven-roadwheel hull uses the live-game tracked drive and terrain suspension.'],
  ['t90m','Captured T-90M','t90m','Six-roadwheel hull uses the live-game tracked drive and terrain suspension.'],
].map(([id,name,type,description])=>({
  id,name,category:'ground',kind:'ai',description,
  coverage:'Single selected unit in the rendered runaway dev terrain; captured MBTs use live-game track physics, not the default preview fallback.',
  query:'dev/runaway.html?debug&scenario=lineup&seed=1980&paused&track&overlay=0&res=0.5',
  async run(h){
    await h.waitFor('window.__RW && __RW.B && window.__BENCH',30000);
    try{
      await h.page.evaluate(type=>{
        const r=window.__RW,b=r.B;
        const m=b.units.find(u=>u.kind===type||u.mbtType===type);
        if(!m)throw Error('Missing unit '+type);
        window.__unitGround=m;window.__unitStart=[m.x,m.z];
        b.units.splice(0,b.units.length,m);
        for(const [other,v] of r.views){if(v.group)v.group.visible=other===m;if(v.shadow)v.shadow.visible=other===m;}
        const sq=b.ai.squads.find(s=>s.members.includes(m));b.ai.squads.splice(0,b.ai.squads.length,sq);
        b.ai.order(sq.id,type==='hovertank'?{type:'hold'}:{type:'patrol',points:[[m.x,m.z-35],[m.x+18,m.z-35],[m.x,m.z]]});
        r.lookAt(m.x,m.y+(m.vehicle?1.5:1),m.z,m.vehicle?20:7,2.5,-.15);r.follow(m.id);r.paused=false;
      },type);
      if(id==='rw7'){
        // place() initially lays a horizontal cushion over sloped ground. Allow the
        // actual ride controller to trim before asking for a moving-hover sample.
        await h.waitFor('__RW.B.time >= 3',15000);
        await h.page.evaluate(()=>{
          const m=__unitGround,b=__RW.B;__unitStart=[m.x,m.z];
          b.ai.order(b.ai.squads[0].id,{type:'patrol',points:[[m.x,m.z-35],[m.x+18,m.z-35],[m.x,m.z]]});
        });
      }
      await h.waitFor('Math.hypot(__unitGround.x-__unitStart[0],__unitGround.z-__unitStart[1])>1',30000);
      await h.expect('__unitGround.alive && Number.isFinite(__unitGround.y)','selected unit remains live and grounded');
      if(id==='rw1')await h.expect('__unitGround.sim.stats.maxStretch<=1.01 && __unitGround.sim.mode!=="fallen"','STRIDER legs stay in reach while walking');
      else if(id==='rw7'){
        await h.page.evaluate(async()=>{
          const rows=window.__hoverEvidence=[],end=__RW.B.time+1;
          await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>{cancelAnimationFrame(window.__hoverSampleFrame);reject(Error('Hover evidence window timed out'));},12000);
            let last=-1;
            const sample=()=>{
              const t=__RW.B.time,s=__unitGround.sim;
              if(t!==last){last=t;rows.push({t,clearance:s.p[1]-__RW.B.isl.height(s.p[0],s.p[2]),gap:s.gap.reduce((a,b)=>a+b,0)/4,pressure:s.press.reduce((a,b)=>a+b,0)/4,lift:s.lift,fans:[...s.fan]});}
              if(t>=end){clearTimeout(timeout);resolve();}else window.__hoverSampleFrame=requestAnimationFrame(sample);
            };sample();
          });
        });
        await h.eval('({samples:__hoverEvidence.length,duration:__hoverEvidence.at(-1).t-__hoverEvidence[0].t,minClearance:Math.min(...__hoverEvidence.map(s=>s.clearance)),meanSkirtGap:__hoverEvidence.reduce((a,s)=>a+s.gap,0)/__hoverEvidence.length,meanPressure:__hoverEvidence.reduce((a,s)=>a+s.pressure,0)/__hoverEvidence.length})','RW-7 moving cushion evidence');
        // Individual fans legitimately cut to zero while correcting excess height.
        // Check sustained cushion support instead of requiring all actuators on at once.
        await h.expect('__hoverEvidence.length>=4 && __hoverEvidence.at(-1).t-__hoverEvidence[0].t>=.99 && __hoverEvidence.every(s=>Number.isFinite(s.lift)&&s.lift>0&&s.clearance>.55) && __hoverEvidence.reduce((a,s)=>a+s.gap,0)/__hoverEvidence.length>.05 && __hoverEvidence.reduce((a,s)=>a+s.pressure,0)/__hoverEvidence.length>1000','RW-7 sustains pressurised cushion clearance through a full moving second');
      }
      else await h.expect(`__unitGround.sim.drive.full && __unitGround.sim.drive.sim.eng.running && __unitGround.sim.P.wheels===${id==='m1a2'?7:6}`,'captured hull uses full tracked physics and its own roadwheel count');
      await capture(h,id);
    }finally{await h.eval('(cancelAnimationFrame(window.__hoverSampleFrame),__RW.paused=true,true)');}
  },
}));
export const cases=[...wheeled,m60,m113,marine,...runaway];
