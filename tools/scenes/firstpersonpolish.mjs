// Authored first-person geometry/pose evidence. Scripted range, seed 1980; no combat/performance claim.
// Same fixture is used before and after the 2026-10-28 hands pass.
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1&ui=0&seed=1980');
  await h.waitFor('window.__I && __I.vm', 30000);
  const A = expression => h.eval(expression);
  await A(`(() => {
    __I.aimTarget(100); __I.advance(0.8);
    window.__handFinite = () => {
      let finite = true;
      __I.vm.root.updateMatrixWorld(true);
      __I.vm.root.traverse(o => { if (!o.matrixWorld.elements.every(Number.isFinite)) finite = false; });
      return finite;
    };
    window.__handMetrics = () => Object.fromEntries(Object.entries(__I.vm.arms).map(([side,a]) => {
      const wrist = a.hand.localToWorld(a.hand.userData.wrist.clone());
      const cuff = a.fo.localToWorld(new __I.THREE.Vector3(0,-0.28,0));
      return [side, { wrist: wrist.toArray(), cuffGap: cuff.distanceTo(wrist) }];
    }));
    return true;
  })()`);
  await h.benchmark('first-person-ready', { frames: 30, warmup: 10, timeoutMs: 120000 });
  const orbit = { pos: [-0.48, -0.28, -0.23], look: [0.02, -0.22, -0.27] };
  for (const [name, slot, gl] of [['m16',0,false],['m203',0,true],['m60',1,false],['m1911',3,false],['law',2,false]]) {
    await A(`(__I.clear(), __I.slot(${slot}), __I.R.glMode=${gl}, __I.aimTarget(100), __I.advance(0.8,{ads:false}), true)`);
    await h.expect('__handFinite()', `${name}: finite first-person transforms`);
    await h.shot(`${name}-player`);
    await A(`(__I.vm.inspect=${JSON.stringify(orbit)}, __I.render(), __handMetrics())`);
    await h.shot(`${name}-support`);
    if (name === 'm16') {
      await A(`(__I.vm.inspect={pos:[0.5,-0.11,-0.09],look:[0.06,-0.27,-0.12]}, __I.render(), true)`);
      await h.shot('m16-trigger');
    }
    await A('(__I.vm.inspect=null, __I.render(), true)');
    if (name === 'law') await A("(__I.press('law'), __I.advance(3.4), __I.press('law'), __I.advance(1), true)");
    await A('__I.advance(1,{ads:true})');
    await h.shot(`${name}-aim`);
  }
  await A('(__I.slot(0), __I.clear(), __I.advance(0.8,{ads:false}), true)');
  await A("__I.advance(0.7,{move:[0,1],sprint:true})"); await h.shot('m16-sprint');
  await A("(__I.advance(0.5,{move:[0,0],sprint:false}), __I.input({stance:'prone'}), __I.advance(0.7), true)"); await h.shot('m16-prone-transition');
  await A("(__I.advance(2), __I.press('reload'), __I.advance(0.9), true)"); await h.shot('m16-reload');
  await h.expect('__handFinite()', 'stance/reload: finite first-person transforms');
  await A("(__I.advance(5), __I.clear(), __I.teleport(0,1.2,0), __I.advance(0.7), true)");
  await A(`import('../js/units/infantry/bodyvm.js').then(m => { window.__BV=m.createBodyVM(__I.vm); return true; })`);
  for (const [name, state] of [['ladder',{mode:'ladder',climbY:1.83,pitch:0.15}],['swim',{mode:'swim',speed:0.8,pitch:-0.2}],['aid',{mode:'aid',region:'legL',item:'dress',pitch:-0.65}]]) {
    await A(`(() => { for(let i=0;i<30;i++){__I.vm.update(1/60,__I.R);__BV.update(1/60,${JSON.stringify(state)});}return __handFinite();})()`);
    await h.shot(`${name}-hands`);
    await A('(__I.vm.update(1/60,__I.R), __BV.update(1/60,null), __handMetrics())');
    await h.shot(`${name}-exit`);
    await A('(() => {for(let i=0;i<30;i++){__I.vm.update(1/60,__I.R);__BV.update(1/60,null);}return true;})()');
  }
  await h.expect('__handFinite()', 'body overlays: finite first-person transforms');
}
