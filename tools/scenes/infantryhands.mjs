// Close look at the first-person arms and hands (the viewmodel camera orbits them) for each weapon.
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1&ui=0');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  await A('(__I.aimTarget(100), __I.advance(0.4))');
  const views = [['side_r', [0.55, -0.1, -0.15], [0.05, -0.15, -0.2]], ['side_l', [-0.5, -0.05, -0.25], [0.05, -0.15, -0.25]], ['below', [0.15, -0.6, -0.3], [0.08, -0.15, -0.25]], ['front', [0.05, -0.05, -0.85], [0.08, -0.15, -0.2]]];
  for (const [w, setup] of [['m16', ''], ['m16_ads', '__I.advance(0.5, { ads: true })'], ['m60', "(__I.press('slot2'), __I.advance(3.5, { ads: false }))"], ['m1911', "(__I.press('slot4'), __I.advance(2.5))"]]) {
    if (setup) await A(setup);
    for (const [n, pos, look] of views) {
      await A(`(__I.vm.inspect = { pos: ${JSON.stringify(pos)}, look: ${JSON.stringify(look)} }, __I.render())`);
      await h.shot(`${w}_${n}`);
    }
    await A('(__I.vm.inspect = null, __I.render())');
  }
}
