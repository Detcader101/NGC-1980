// diagnostic: the LAW on the sights with parts hidden
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1&ui=0');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  await A("(__I.teleport(30, -20, 0, 'stand'), __I.press('slot3'), __I.advance(3.0), __I.press('law'), __I.advance(3.2), __I.press('law'), __I.advance(0.8), __I.aimAt(14, 1.4, -150), __I.advance(0.9, { ads: true }))");
  await h.eval("({ law: __I.W.law, ads: __I.S.ads, key: __I.vm.key, pos: __I.vm.model.group.position.toArray(), rot: __I.vm.model.group.rotation.toArray() })");
  await h.shot('law_all');
  await A("(__I.vm.arms.L.up.visible = __I.vm.arms.L.fo.visible = __I.vm.arms.L.hand.visible = false, __I.render())"); await h.shot('law_noL');
  await A("(__I.vm.arms.R.up.visible = __I.vm.arms.R.fo.visible = __I.vm.arms.R.hand.visible = false, __I.render())"); await h.shot('law_noarms');
  await A("(__I.vm.model.group.visible = false, __I.vm.arms.L.up.visible = __I.vm.arms.L.fo.visible = __I.vm.arms.L.hand.visible = true, __I.vm.arms.R.up.visible = __I.vm.arms.R.fo.visible = __I.vm.arms.R.hand.visible = true, __I.render())"); await h.shot('law_armsonly');
}
