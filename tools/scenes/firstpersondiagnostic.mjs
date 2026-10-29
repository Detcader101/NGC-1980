export default async function(h){
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1&ui=0');await h.waitFor('window.__I',20000);
  for(const [name,slot] of [['m16',0],['m1911',3],['law',2]]){
    await h.eval(`(__I.clear(),__I.slot(${slot}),__I.aimTarget(100),__I.advance(.7,{ads:false}),__I.vm.inspect=null,__I.render(),true)`);await h.shot(name+'-player');
    await h.eval(`(__I.vm.inspect={pos:[-.48,-.28,-.23],look:[.02,-.22,-.27]},__I.render(),true)`);await h.shot(name+'-support');
    if(name==='m16'){await h.eval(`(__I.vm.inspect={pos:[.5,-.11,-.09],look:[.06,-.27,-.12]},__I.render(),true)`);await h.shot('m16-trigger');}
  }
  await h.goto('dev/people.html?debug&res=1');await h.waitFor('window.__H',20000);
  for(const mode of ['face','stand','aim']){await h.eval(`__H.set('${mode}')`);await h.shot('person-'+mode);}
}
