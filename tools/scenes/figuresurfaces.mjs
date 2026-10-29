// Companion to the unchanged firstpersonpolish before/after fixture. Checks production low/disabled/legacy
// figure materials in the browser; no performance claim. Run after all production edits are frozen.
export default async function (h) {
  for (const [mode, query, expectedTier] of [
    ['low', 'rk=all&rkdetail=1', 1],
    ['detail-off', 'rk=all&rkdetail=0', 0],
    ['legacy', 'rk=0', -1],
  ]) {
    await h.goto(`dev/infantry.html?debug&fixed&nosway&res=1&ui=0&seed=1980&${query}`);
    await h.waitFor('window.__I && __I.vm && window.__BENCH', 30000);
    await h.eval('(__I.aimTarget(100),__I.advance(.8),true)');
    await h.eval(`(async()=>{
      const {FIG,KITMAT}=await import('../js/units/infantry/meshkit.js');
      const {figureTexture}=await import('../js/units/infantry/figurematerials.js');
      const mat=KITMAT.lambert(), texture=figureTexture();
      let finite=true, aligned=true, surfaces=0;
      __I.vm.root.updateMatrixWorld(true);
      __I.vm.root.traverse(o=>{
        if(!o.matrixWorld.elements.every(Number.isFinite))finite=false;
        if(!o.geometry)return;
        const g=o.geometry,p=g.attributes.position,s=g.attributes.figSurface,c=g.attributes.figCoord;
        if(!p.array.every(Number.isFinite))finite=false;
        if(s){surfaces++;if(!c||s.count!==p.count||c.count!==p.count)aligned=false;}
      });
      window.__figureSurfaceCheck={
        fig:FIG,lambert:!!mat.isMeshLambertMaterial,standard:!!mat.isMeshStandardMaterial,
        tier:mat.userData.figureSurface?.tier||0,finite,aligned,surfaces,
        shared:texture===figureTexture(),textureBytes:texture.image.data.byteLength,
        programs:__BENCH.renderer.info.programs.length,
        compiled:__BENCH.renderer.info.programs.every(p=>!p.diagnostics||p.diagnostics.runnable!==false)
      };
      return __figureSurfaceCheck;
    })()`,'figure surface mode '+mode);
    await h.expect('__figureSurfaceCheck.compiled', `${mode}: production GPU programs compile`);
    await h.expect('__figureSurfaceCheck.finite && __figureSurfaceCheck.aligned', `${mode}: finite transforms and matching surface attributes`);
    if (expectedTier >= 0) {
      await h.expect(`__figureSurfaceCheck.fig && __figureSurfaceCheck.standard && __figureSurfaceCheck.tier===${expectedTier} && __figureSurfaceCheck.surfaces>0`,`${mode}: selected figure detail tier is active`);
      await h.expect('__figureSurfaceCheck.shared && __figureSurfaceCheck.textureBytes===1048576',`${mode}: one shared 512px RGBA texture`);
    } else {
      await h.expect('!__figureSurfaceCheck.fig && __figureSurfaceCheck.lambert && __figureSurfaceCheck.tier===0 && __figureSurfaceCheck.surfaces===0','legacy: original Lambert geometry path remains active');
    }
    await h.eval('(__I.vm.inspect={pos:[-.48,-.28,-.23],look:[.02,-.22,-.27]},__I.render(),true)');
    await h.shot(`${mode}-sleeve`);
  }
}
