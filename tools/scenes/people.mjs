// Fixed production-model views. The preview uses buildMarine, including the active look-people LOD.
export default async function(h){
 await h.goto('dev/people.html?debug&res=1');await h.waitFor('window.__H',15000);
 for(const view of ['stand','face','cloth','aim','kneel','prone','seated','climb','swim','aid']){
  await h.eval(`__H.set('${view}')`);await h.wait(100);await h.shot(view);
 }
 await h.eval(`__H.set('stand',{detail:1})`);await h.shot('squad-detail');
 const stats=await h.eval(`[__H.set('stand',{detail:0}),__H.set('stand',{detail:1}),__H.set('cloth',{detail:0}),__H.set('stand',{detail:0,distance:40})]`);
 if(stats.some(s=>s.skinned!==1))throw new Error('Production preview must draw exactly one skinned body per active LOD: '+JSON.stringify(stats));
 await h.logmsg('Geometry: '+JSON.stringify(stats));
 for(const [view,time] of [['walk',0],['walk',.3],['walk',.6],['run',.3],['transition',.4],['transition',2.5]]){
  await h.eval(`__H.set('${view}',{detail:0,time:${time}})`);await h.shot(`${view}-${String(time).replace('.','p')}`);
 }
 await h.eval(`__H.set('walk',{detail:0,play:true})`);
 if(h.capture)await h.clip('walking-and-stance',{durationMs:8000,fps:15},async()=>{await h.wait(3200);await h.eval(`__H.set('transition',{play:true})`);});
 await h.notblank();
}
