// Frame cost of the lived-in world, A/B in one run under the same machine load: the same three views with the world
// (towns, roads, traffic, people) and with ?noworld (structures stay; roads still flattened in the ground).
// Views: the helicopter on the carrier (zone), the helicopter over a wild town (the jet: jetperf.mjs with and without
// --query "?debug&auto&noworld").
// Each sample: 240 frames of rAF timing, plus the world's own main-thread ms, draw calls and triangles.
export default {
  name: 'worldperf',
  query: '?debug&auto&kb&peace&res=0.45',
  run: async h => {
    const sample = async label => {
      await h.eval('(window.__ft=[], window.__lt=performance.now(), (function f(t){ __ft.push(t-__lt); __lt=t; if(__ft.length<240) requestAnimationFrame(f); })(performance.now()), 1)');
      await h.waitFor('window.__ft.length>=240', 60000);
      const r = await h.eval(`(()=>{const a=__ft.slice(10).sort((x,y)=>x-y); const avg=a.reduce((s,x)=>s+x,0)/a.length; return {label:'${label}', avgMs:+avg.toFixed(1), fps:+(1000/avg).toFixed(1), p95:+a[Math.floor(a.length*0.95)].toFixed(0), worldMs:+(__WORLD.stats.ms||0).toFixed(2), calls:__G.renderer.info.render.calls, tris:__G.renderer.info.render.triangles, sim:+__G.PROF.sim.toFixed(1), prep:+__G.PROF.prep.toFixed(1), render:+__G.PROF.render.toFixed(1)}})()`);
      h.log('SAMPLE ' + JSON.stringify(r));
    };
    for (const q of ['?debug&auto&kb&peace&res=0.45', '?debug&auto&kb&peace&res=0.45&noworld']) {
      if (q.includes('noworld')) await h.goto(q);
      await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && window.__WORLD", 20000); await h.wait(3000);
      const tag = q.includes('noworld') ? 'NOWORLD' : 'WORLD';
      await sample(tag + ' heli-deck');
      await h.eval(`(() => { const G = __G; G.H.reset(new G.THREE.Vector3(4070, G.groundY(4070, -1026) + 28, -1026), 0.66, false, 1); G.HI.setCollective(0.47); return 1; })()`);
      await h.waitFor('__G.HW.every(L => !L.busy) && (!__WORLD.stats.pending)', 30000); await h.wait(5000);
      await sample(tag + ' heli-town'); await h.shot(tag.toLowerCase() + '-town');

    }
  },
};
