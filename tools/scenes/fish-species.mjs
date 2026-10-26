// Actual production sea-life meshes at real in-game sizes with independent inspection cameras.
// This supplements the separate first-person natural-swimming fixture; it is not population evidence.
export default {
  name:'fish-species-inspection',query:'dev/fish.html?debug&res=1',
  async run(h){
    await h.waitFor('window.__FISHVIEW && __FISHVIEW.frames>2 && window.__BENCH',30000);
    await h.expect('__FISHVIEW.patterns','production per-fragment fish markings shader is present');
    await h.expect('__FISHVIEW.entries.length===12 && __FISHVIEW.snapshot().entries.every(e=>e.finite && e.geometry>0 && e.instances===1 && e.length>=e.range[0] && e.length<=e.range[1])','all twelve real geometry entries use their unchanged in-game size ranges');
    const t=await h.eval('__FISHVIEW.time');await h.waitFor(`__FISHVIEW.time>${t+.25}`,10000);
    await h.expect('__FISHVIEW.visible.length===12 && !__FISHVIEW.paused','the complete inspection gallery is animating');
    await h.benchmark('fish-species-gallery');await h.shot('fish-species-gallery');await h.notblank();
    const groups=[
      ['silver-school-species',['sardine','mackerel','mullet']],
      ['predators-and-flying-fins',['amberjack','bonito','flyingfish']],
      ['reef-fish-and-shark',['bream','damsel','shark']],
      ['specialised-sea-life',['ray','jelly','dolphin']],
    ];
    for(const [label,keys] of groups){
      await h.page.evaluate(keys=>{__FISHVIEW.resetView();__FISHVIEW.show(keys);},keys);
      const frame=await h.eval('__FISHVIEW.frames');await h.waitFor(`__FISHVIEW.frames>=${frame+2}`,10000);
      await h.expect(`JSON.stringify(__FISHVIEW.visible)===${JSON.stringify(JSON.stringify(keys))}`,label+' selection is active');
      await h.shot(label);await h.notblank();
    }
    // A close lateral view makes mackerel bars visible without enlarging the actual fish.
    await h.page.evaluate(()=>{__FISHVIEW.show(['mackerel']);__FISHVIEW.resetView();__FISHVIEW.orbit.pitch=.10;});
    const frame=await h.eval('__FISHVIEW.frames');await h.waitFor(`__FISHVIEW.frames>=${frame+2}`,10000);
    await h.expect('__FISHVIEW.visible[0]==="mackerel" && __FISHVIEW.entries.find(e=>e.species.key==="mackerel").data.A[3]<.39','mackerel close-up uses a nearer camera, not a giant fish');
    await h.shot('mackerel-pattern-closeup');await h.notblank();
    if(h.capture)await h.clip('mackerel-inspection-animation',{durationMs:6000});
    await h.eval('__FISHVIEW.snapshot()','species sizes, selection and animation evidence');
    await h.eval('(__FISHVIEW.setPaused(true),true)');
  },
};
