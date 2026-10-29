// Actual main.js field-support bridge. The fixture scripts terminal flags on real drop missions to isolate
// task reporting from fuel level; it does not claim to fly a complete resupply sortie.
export default {name:'radiorecovery',query:'?debug&auto&kb&res=0.35&peace&tech=max',async run(h){
  await h.waitFor('window.__radioCommands && __G.G.state === "play"',30000);
  await h.eval(`(()=>{
    __G.G.bench=true;for(const n of __G.war.tech[1].nodes)__G.war.tech[1].done.add(n.id);
    const i=__G.ISLANDS.find(i=>i.name==='SANDBAR'),x=i.pad.x+40,z=i.pad.z+40;
    __G.H.reset(new __G.THREE.Vector3(x,__G.terrainH(x,z)+1.9,z),0,true,1);__G.HI.setCollective(0);
    window.__requestRepair=()=>{__G.G.fuel=10;__G.Z.svc=null;const n=__radioCommands.net;
      n.receive([{transcript:'Supply, this is Command. Request fuel and field repair. Over.',confidence:1}]);
      const result=n.receive([{transcript:'Supply, this is Command. Correct. Over.',confidence:1}]);
      window.__repairTask=n.tasks.findLast(t=>t.label==='Request fuel and field repair');return result.ok;
    };return true;
  })()`);
  // Reset teleports the craft; landing/service state settles on the next real physics tick.
  await h.waitFor('__G.H.landed && !__G.Z.svc',15000);
  for(const outcome of ['partial','cancel','failed']){
    await h.expect('__requestRepair()','field support request accepted: '+outcome);
    await h.waitFor('__G.G.rescue?.mission',15000);
    await h.expect('__G.G.rescue.mission===__G.drop.state && __repairTask.state==="active"','request retains the actual active drop mission: '+outcome);
    await h.eval(`(()=>{const m=__G.G.rescue.mission;
      if('${outcome}'!=='cancel'){m.fixed='${outcome}'==='partial';m.arrived='${outcome}'==='partial'?1:0;m.ended=true;}
      __G.G.fuel='${outcome}'==='cancel'?80:20;__G.G.rescue=null;
      __radioCommands.net.update(1);__G.drop.cancel();return {state:__repairTask.state,detail:__repairTask.detail};
    })()`);
    const wanted={partial:'complete',cancel:'cancelled',failed:'failed'}[outcome];
    await h.expect(`__repairTask.state==='${wanted}'`,'actual mission outcome wins over remaining fuel: '+outcome);
  }
}};
