// Diagnostic: isolate authored hand geometry from legacy weapon intersections; not a gameplay pose.
export default async function(h){
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1&ui=0');await h.waitFor('window.__I',20000);
  await h.eval(`(__I.aimTarget(100),__I.advance(.8),__I.vm.inspect={pos:[-.48,-.28,-.23],look:[.02,-.22,-.27]},__I.render(),true)`);await h.shot('m203-support-contact');
  await h.eval('(__I.R.carrier.gl=null,__I.advance(.5),true)');await h.shot('m16-plain-support');
  await h.eval(`(() => {const v=__I.vm;v.model.group.visible=false;for(const a of Object.values(v.arms)){a.up.visible=false;a.fo.visible=false;}v.arms.L.hand.visible=false;v.arms.R.hand.position.set(0,0,0);v.arms.R.hand.quaternion.identity();v.inspect={pos:[.28,.1,.16],look:[.035,.01,.035]};return true;})()`);await h.shot('right-hand-back');
  await h.eval(`(__I.vm.inspect={pos:[-.24,-.06,-.12],look:[.035,.01,.035]},true)`);await h.shot('right-hand-palm');
  await h.eval(`(__I.vm.handShape('R','open',.5),__I.vm.inspect={pos:[.28,.1,.16],look:[.035,.01,.035]},true)`);await h.shot('right-hand-half-open');
  await h.eval(`(__I.vm.handShape('R','open',1),true)`);await h.shot('right-hand-open');
}
