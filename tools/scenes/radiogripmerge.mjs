// CLD-003/004: third-person production grips in fixed weapon-local cameras. The original six views are retained
// for before/after review. TP diameter profiles stay in the LP SDF body; this never substitutes FP hands.
const cases=[
 {name:'tp-m203-rifle-support',weapon:'M16A1/M203',cls:'rifle',pos:[-.48,-.03,-.27],look:[0,-.10,-.29]},
 {name:'tp-m203-gl-support',weapon:'M16A1/M203',cls:'gl',pos:[-.48,-.10,-.07],look:[0,-.20,-.07]},
 {name:'tp-m60-support',weapon:'M60',cls:'mg',pos:[-.48,-.04,-.32],look:[0,-.13,-.34]},
 {name:'tp-law-support',weapon:'M72A2',cls:'law',pos:[-.48,.015,-.30],look:[0,-.07,-.30]},
 {name:'tp-law-trigger',weapon:'M72A2',cls:'law',pos:[.48,.015,-.19],look:[0,-.07,-.19]},
 {name:'tp-law-sights-oblique',weapon:'M72A2',cls:'law',pos:[.24,.16,-.03],look:[0,-.015,-.24]},
 // Additional follow-up view: the GL trigger hand was occluded in the original support-side camera.
 {name:'tp-m203-gl-trigger',weapon:'M16A1/M203',cls:'gl',pos:[.43,-.08,-.34],look:[0,-.165,-.20]},
];
export default {
 name:'radiogripmerge',query:'dev/people.html?debug&res=1&ui=0',
 async run(h){
  await h.waitFor('window.__H',30000);
  for(const c of cases){
   const opts={weapon:c.weapon,cls:c.cls,detail:0,inspect:{pos:c.pos,look:c.look},weaponState:c.weapon==='M72A2'?{law:1,lawSights:1}:{bipod:0,handle:0,quadUp:false}};
   const metrics=await h.eval(`(() => {
    const counts=__H.set('aim',${JSON.stringify(opts)}),m=__H.active();
    return {...counts,modelKey:m.weaponModel.key,hasLauncher:!!m.weaponModel.parts.glBarrel,
     handSystem:'LP/tpHand SDF',handProfiles:m.person.gripProfiles,inspect:__H.state.inspect,
     camera:{position:__H.camera.position.toArray(),quaternion:__H.camera.quaternion.toArray(),matrix:__H.camera.matrixWorld.toArray(),projection:__H.camera.projectionMatrix.toArray()},
     weaponMatrix:m.weaponModel.group.matrixWorld.toArray()};
   })()`);
   await h.logmsg(c.name+': '+JSON.stringify(metrics));
   await h.expect(`__H.active().weaponKey===${JSON.stringify(c.weapon)} && __H.state.cls===${JSON.stringify(c.cls)} && __H.counts().skinned===1`,c.name+': intended weapon/class and one LP body');
   if(c.weapon==='M16A1/M203')await h.expect('!!__H.active().weaponModel.parts.glBarrel',c.name+': M203 furniture is present');
   await h.shot(c.name);
  }
  await h.notblank();
 }
};
