const names = { hq: ['HQ bunker', 'RUNAWAY command node'], fuel: ['Fuel farm', 'RUNAWAY siphon spire'], factory: ['Supply depot', 'RUNAWAY fabricator'], radar: ['Radar site', 'RUNAWAY sensor spire'] };
export const cases = [1, 2].flatMap(side => Object.entries(names).map(([kind, labels]) => {
  const id = `${side === 1 ? 'human' : 'runaway'}-${kind}`;
  return { id, name: labels[side - 1], category: 'structure', kind: 'structure', query: `dev/structure-unit.html?kind=${kind}&side=${side}`,
    description: 'Actual faction structure: visible damage, destruction, rebuilding and capture; isolated-site rendering cost.',
    run: async h => {
      await h.waitFor('window.__STRUCT && window.__BENCH', 15000);
      await h.expect(`__STRUCT.kind === '${kind}' && __STRUCT.model.userData.state.side === ${side}`, 'requested structure and faction loaded');
      await h.page.evaluate(() => {
        window.__visibleMeshSignature = () => { const visible = []; __STRUCT.model.traverseVisible(o => { if (o.isMesh) visible.push(o.id); }); return visible.sort((a, b) => a - b).join(','); };
        window.__intactSignature = __visibleMeshSignature();
      });
      await h.page.click('#damage');
      await h.expect('__STRUCT.model.userData.state.cond === "damaged" && __STRUCT.model.userData.state.hp === .35', 'damage state reached through preview control');
      await h.page.click('#destroy');
      await h.expect('__STRUCT.model.userData.state.cond === "destroyed" && __visibleMeshSignature() !== __intactSignature', 'destruction swaps visible geometry to wreckage');
      await h.shot(id + '-wreck'); await h.notblank();
      await h.page.click('#restore');
      await h.expect('__STRUCT.model.userData.state.cond === "intact" && __visibleMeshSignature() === __intactSignature', 'rebuild restores original visible geometry');
      await h.page.click('#capture');
      await h.expect(`__STRUCT.model.userData.state.side === ${side === 1 ? 2 : 1} && __visibleMeshSignature() !== __intactSignature`, 'capture changes visible faction model');
      await h.page.click('#capture');
      await h.page.evaluate(() => { __STRUCT.model.userData.tick(10, 10); __STRUCT.status(); });
      await h.expect(`__STRUCT.model.userData.state.side === ${side} && __STRUCT.model.userData.state.cond === 'intact'`, 'original faction restored for sample');
      // Reclaimed human sites intentionally retain machine wreckage. Reload a pristine site for comparable costs.
      await h.goto(`dev/structure-unit.html?kind=${kind}&side=${side}`);
      await h.waitFor('window.__STRUCT && window.__BENCH', 15000);
      await h.benchmark(id);
      await h.shot(id); await h.notblank();
      if (h.capture) await h.clip(id, { durationMs: 6000 });
    },
  };
}));
