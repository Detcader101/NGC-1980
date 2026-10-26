// A repeatable viewing fixture, not an unscripted pilot or war-balance test.
export default { name: 'coast-research', seed: 1980, query: '?debug&auto&kb&peace&res=0.45&tech=default', run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play' && window.__WORLD", 30000);
  await h.eval(`(() => {
    const g=__G; g.G.bench=true; g.H.reset(new g.THREE.Vector3(-1500,80,200),0,false,1);
    g.HI.setCollective(.45); g.cockpitCam=false;
    window.__evidenceHover=setInterval(()=>g.HI.setCollective(Math.max(.2,Math.min(.7,.45+(80-g.H.pos.y)*.02-g.H.vel.y*.04))),16);
    return {fixture:'seeded coastal hover at 80 m; peaceful war; ordinary sea-life population'};
  })()`, 'fixture');
  try {
    await h.waitFor('__WORLD.stats.pending===0 && __G.sealife.sim.schools.length>0', 30000);
    await h.benchmark('coastal-flight');
    await h.shot('coastal-flight'); await h.notblank();
    await h.expect('__G.Z.alive && __G.sealife.sim.schools.length>0', 'live flight with natural sea-life population');
    if (h.capture) await h.clip('coastal-flight', { durationMs: 6000 });
    await h.page.click('#fleet [data-research]');
    await h.expect('__G.techUI.isOpen', 'HUD opens research');
    await h.benchmark('research-open');
    await h.shot('research-open'); await h.notblank();
    if (h.capture) await h.clip('research-navigation', { durationMs: 6000 }, async () => {
      await new Promise(r => setTimeout(r, 1500));
      await h.page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 1800));
      await h.page.click('#fleet [data-research]');
    });
    await h.expect('__G.techUI.isOpen && __G.Z.alive', 'research remains usable after capture');
  } finally { await h.eval('(clearInterval(window.__evidenceHover),1)'); }
} };
