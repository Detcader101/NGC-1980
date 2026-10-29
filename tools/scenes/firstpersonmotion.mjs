// An observer camera around the production first-person rig, with real input/state transitions.
// This exposes sleeve continuity and weapon/hand motion; it is not the player's normal camera or combat footage.
export default async function(h){
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=0.75&ui=0&seed=1980');await h.waitFor('window.__I',20000);
  await h.eval(`Promise.all([import('../js/units/infantry/bodyvm.js'),import('../js/units/infantry/throwvm.js')]).then(([b,t])=>{window.__motionBV=b.createBodyVM(__I.vm);window.__motionTV=t.createThrowVM(__I.vm);__I.aimTarget(100);__I.advance(.8);__I.vm.inspect={pos:[.59,-.03,.16],look:[.03,-.25,-.24]};__I.render();return true;})`);
  await h.shot('motion-start');
  if(h.capture)await h.clip('first-person-transitions',{durationMs:8000,fps:15},async()=>{
    await h.eval(`(() => {
      const start=performance.now();let prev=start,swap=false;
      window.__motionTimer=setInterval(()=>{
        const now=performance.now(),t=(now-start)/1000,dt=Math.min(.08,(now-prev)/1000);prev=now;
        __I.advance(dt,{ads:t>.4&&t<1.3,sprint:t>=1.3&&t<2.3,move:t>=1.3&&t<2.3?[0,1]:[0,0],stance:t>=2.3&&t<3.4?'crouch':'stand'});
        if(t>=5.8&&!swap){__I.press('slot4');swap=true;}
        const aid=t>=4.1&&t<5.2;
        __motionTV.update(dt,null,aid);__motionBV.update(dt,aid?{mode:'aid',region:'armL',item:'dress',pitch:-.25}:null);
      },45);
      return true;
    })()`);
    await new Promise(resolve=>setTimeout(resolve,7600));
    await h.eval('(clearInterval(__motionTimer),true)');
  });
  await h.expect('(() => {let ok=true;__I.vm.root.updateMatrixWorld(true);__I.vm.root.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))ok=false;});return ok;})()','recorded transitions remain finite');
  await h.shot('motion-end');
}
