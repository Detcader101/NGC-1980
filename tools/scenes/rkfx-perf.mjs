// RENDERKIT fx/post frame-time A/B (ngc/rk-fx). Same seed, same views, kit on or off:
//   RKQ=rk=0 node snap.mjs scenes/rkfx-perf.mjs --seed 7 --name rkperf-off
//   RKQ=rk=1 node snap.mjs scenes/rkfx-perf.mjs --seed 7 --name rkperf-on
// RKRES=0.6 (default) fixes the pixel ratio; RKRES=dyn leaves dynamic resolution on and reports where it settled.
const RKQ = process.env.RKQ || 'rk=1', RES = process.env.RKRES || '0.6';
export default async function (h) {
  await h.goto(`?debug&auto&kb&peace${RES === 'dyn' ? '' : '&res=' + RES}&${RKQ}`);
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 60000); await h.wait(3000);
  await h.benchmark('deck', { frames: 30, warmup: 8 });
  await h.eval('({ res: document.getElementById("dbg").textContent, post: !!__G.rkPost, calls: __G.renderer.info.render.calls })', 'deck state');
  await h.eval('(__G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x+20, 30, __G.HOME_B.z+60), 0, false, 1), __G.HI.setCollective(0.475), 1)');
  await h.wait(800);
  await h.eval("(() => { const B=__G.HOME_B, fx=__G.fx; for (let i=0;i<5;i++){ const x=B.x+5+i*9, z=B.z+20-i*6; fx.explode(x, __G.terrainH(x,z)+1, z, 1+i*0.5, {fire: 60, debris: 8}); } return fx.emitters.length })()");
  await h.wait(2500);
  await h.benchmark('burning', { frames: 30, warmup: 8 });
  await h.eval('({ res: document.getElementById("dbg").textContent, add: __G.fx.add.n, mix: __G.fx.mix.n, gpuFires: __G.fx.emitters.filter(e => e.rk).length, prof: __G.PROF })', 'burning state');
  await h.eval('(() => { const b = __G.renderer.getDrawingBufferSize(new __G.THREE.Vector2()), t = __G.rkPost && __G.rkPost.post.target; return { pixelRatio: __G.renderer.getPixelRatio(), buffer: [b.x, b.y], postTarget: t ? [t.width, t.height] : null }; })()', 'post target vs drawing buffer');
  await h.shot('burning');
}
