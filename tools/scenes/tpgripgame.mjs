// Exercise the real marine.js and groundwar.js render adapters, not the model-preview pose builder.
// Combat scheduling is held still while real rifleman states are presented to those adapters. This checks
// mode/weapon-state forwarding and rendered contacts; it does not qualify AI combat decision-making.
export default {
  name:'tpgripgame',query:'?debug&auto&kb&peace&nofog&voices=silent&res=.7&rk=all&seed=1980&ui=0',
  async run(h){
    await h.waitFor('window.__G && __G.G.state==="play"',30000);
    await h.eval('(__G.G.bench=true,__G.commander.deploy("marine","ship"))');
    await h.waitFor('__G.G.craft==="foot"',15000);
    await h.eval(`(async()=>{
      const G=__G,T=G.THREE,M=G.marine,GW=G.war.ground,GS=GW.sim,I=G.ISLANDS.find(i=>i.name==='SANDBAR');
      const {createWeapon}=await import('./js/units/infantry/weapons.js');
      const {buildWeaponModel}=await import('./js/units/infantry/weaponmodels.js');
      const x=I.pad.x-18,z=I.pad.z+16;
      G.foot.spawnAt({x,y:G.terrainH(x,z),z,yaw:0},{force:true});M.view='third';M.aim(0,0);
      G.G.state='paused';G.war.E.mat=0;GW.godPlayer=true;GS.FC.pause=true;
      G.say('');G.G.msgT=0;
      // Main-game UI has no ui=0 switch: this fixture hides DOM overlays while preserving the world canvas.
      if(new URLSearchParams(location.search).get('ui')==='0'){
        const style=document.createElement('style');style.textContent='body > :not(#gl):not(script):not(style){visibility:hidden!important}';document.head.appendChild(style);
      }
      M.S.ads=1;M.S.speed=0;M.S.gaitPhase=.75;
      const rifle=M.R.slots.find(w=>w.key==='M16A1');if(!rifle)throw Error('Player fixture needs the service rifle');
      rifle.gl ||= createWeapon('M203',{loaded:true});
      const squad=GW.addSquad(1,I,5,x+5,z,{order:{type:'defend',x:x+5,z,r:5}}),unit=squad.members.find(u=>u.role==='gren');
      if(!unit)throw Error('Five-man fixture did not include the actual grenadier');
      GS.enrich(unit);GS.place(unit,x+4,z,0);unit.rich.S.ads=1;unit.rich.S.speed=0;unit.rich.S.gaitPhase=.75;
      const state=window.__tpg={G,M,GW,GS,unit,scene:GW.root.parent,rifle,createWeapon,target:null,lastPlayer:null,lastAI:null};
      // Use the post pipeline's explicit no-overlay contract for an external inspection camera. An empty
      // foot overlay callback still selects its MSAA overlay texture, which may contain a prior first-person frame.
      if(G.rkPost){const post=G.rkPost.render.bind(G.rkPost);G.rkPost.render=(scene,camera,overlay)=>post(scene,camera,state.target?null:overlay);}
      else {const overlay=G.foot.overlay.bind(G.foot);G.foot.overlay=(...args)=>{if(!state.target)overlay(...args);};}
      // Keep the pose object returned by the real soldier: the production adapter subsequently fills it.
      const playerPose=M.S.pose.bind(M.S);M.S.pose=(...args)=>{const p=playerPose(...args);state.lastPlayer=p;return p;};
      const aiPose=unit.rich.S.pose.bind(unit.rich.S);unit.rich.S.pose=(...args)=>{const p=aiPose(...args);state.lastAI=p;return p;};
      const reference=buildWeaponModel('M16A1/M203',{detail:'low'}),trigger=new T.Vector3().fromArray(reference.anchors.glTrigger);
      state.playerRoot=()=>state.scene.children.find(o=>o.name==='soldier'&&o.visible&&Math.hypot(o.position.x-M.S.pos.x,o.position.z-M.S.pos.z)<.05);
      state.aiRoot=()=>GW.views.get(unit.id)?.skeleton?.root;
      state.model=root=>root?.children.find(o=>/^M16A1|^M72A2/.test(o.name));
      state.metrics=(who)=>{
        const root=who==='player'?state.playerRoot():state.aiRoot(),model=state.model(root),p=who==='player'?state.lastPlayer:state.lastAI;
        if(!root||!model)return {ready:false};root.updateMatrixWorld(true);
        const hand=root.getObjectByName('handR'),finger=hand.localToWorld(new T.Vector3(-.027,-.1104,-.05)),target=model.localToWorld(trigger.clone());
        let finite=true;root.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))finite=false;});
        return {ready:true,cls:p?.cls,weaponState:p?.weaponState,model:model.name,finite,triggerGap:finger.distanceTo(target),
          inner:model.getObjectByName('inner')?.position.z,rearSight:model.getObjectByName('rearSight')?.rotation.x,
          frontSight:model.getObjectByName('frontSight')?.rotation.x,frontCap:model.getObjectByName('frontCap')?.visible,
          profiles:who==='ai'?GW.views.get(unit.id)?.skeleton?.person?.gripProfiles:null};
      };
      state.drawPlayer=()=>{M.render(0,0,false,true);state.target=state.playerRoot();return state.metrics('player');};
      state.drawAI=()=>{
        // Freeze simulation intent only for this call; GW.update still runs its production renderUnits path.
        const step=GS.step;GS.step=()=>[];try{GW.update(0,G.PL,true);}finally{GS.step=step;}
        state.target=state.aiRoot();return state.metrics('ai');
      };
      const camera=new T.PerspectiveCamera(38,innerWidth/innerHeight,.1,2500),render=G.renderer.render.bind(G.renderer),at=new T.Vector3();
      G.renderer.render=(s,c)=>{
        if(c!==G.zCam||!state.target)return render(s,c);
        state.target.getWorldPosition(at);camera.position.copy(at).add(new T.Vector3(1.45,1.6,-2.5));camera.lookAt(at.x,at.y+1.15,at.z-.16);
        camera.aspect=c.aspect;camera.updateProjectionMatrix();return render(s,camera);
      };
      // The visibility test uses the live camera position even though the camera for each shot is fixed.
      G.zCam.position.set(x, G.terrainH(x,z)+1.8,z+3);G.zCam.updateMatrixWorld(true);
      M.R.slot=M.R.slots.indexOf(rifle);M.R.glMode=true;M.R.swap=null;rifle.act=rifle.gl.act=null;
      return state.drawPlayer();
    })()`);
    await h.expect('__tpg.M.R.cls==="gl" && __tpg.metrics("player").cls==="gl"','Real player adapter preserves M203 launch mode');
    await h.expect('__tpg.metrics("player").finite && __tpg.metrics("player").triggerGap<.025','Rendered player index fingertip meets the M203 trigger within 25 mm');
    await h.shot('player-m203-launch');
    await h.eval(`(()=>{const t=__tpg,R=t.M.R;let law=R.slots.find(w=>w.key==='M72A2');if(!law){law=t.createWeapon('M72A2');R.slots.push(law);}R.slot=R.slots.indexOf(law);R.glMode=false;law.law='closed';law.act=null;return t.drawPlayer();})()`);
    await h.expect('Math.abs(__tpg.metrics("player").inner-.14)<1e-6 && __tpg.metrics("player").frontCap===true','Real player closed LAW keeps its tube collapsed and cap visible');
    await h.eval('(__tpg.M.R.carrier.law="armed",__tpg.drawPlayer())');
    await h.expect('__tpg.metrics("player").cls==="law" && __tpg.metrics("player").weaponState.armed && Math.abs(__tpg.metrics("player").inner-.378)<1e-6 && Math.abs(__tpg.metrics("player").rearSight)<1e-6 && Math.abs(__tpg.metrics("player").frontSight)<1e-6 && __tpg.metrics("player").frontCap===false','Actual armed LAW state reaches deployed tube, sights and cap geometry');
    await h.shot('player-law-armed');
    await h.eval(`(()=>{const t=__tpg,R=t.unit.rich.R;R.slot=R.slots.findIndex(w=>w.key==='M16A1'&&w.gl);if(R.slot<0)throw Error('Rich grenadier has no M203');R.glMode=true;R.swap=null;R.carrier.act=R.carrier.gl.act=null;t.unit.ai.fire=null;return t.drawAI();})()`);
    await h.expect('__tpg.unit.richOn && __tpg.unit.rich.R.cls==="gl" && __tpg.metrics("ai").cls==="gl"','Actual rich Marine render adapter preserves M203 launch mode');
    await h.expect('__tpg.metrics("ai").finite && __tpg.metrics("ai").triggerGap<.025','Rendered rich AI index fingertip meets the M203 trigger within 25 mm');
    await h.shot('rich-ai-m203-launch');
    await h.eval('(__tpg.unit.rich.R.glMode=false,__tpg.unit.ai.fire="law",__tpg.unit.body.laws=1,__tpg.unit.laws=1,__tpg.drawAI())');
    await h.expect('__tpg.metrics("ai").model==="M72A2" && __tpg.metrics("ai").cls==="law" && Math.abs(__tpg.metrics("ai").inner-.378)<1e-6 && Math.abs(__tpg.metrics("ai").rearSight)<1e-6 && __tpg.metrics("ai").profiles.L==="tube41" && __tpg.metrics("ai").profiles.R==="tube41"','Rich AI visual LAW selection deploys the tube and selects its two support profiles');
    await h.shot('rich-ai-law-selected');
    await h.notblank();
  }
};
