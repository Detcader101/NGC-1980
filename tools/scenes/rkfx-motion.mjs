// RENDERKIT fx/post clocks (ngc/rk-fx): the GPU particle clock and the post clock stop on pause; with
// prefers-reduced-motion the post clock is frozen, grain/temporal are zero and the decorative embers are hidden.
export default { name: 'rkfx-motion', run: async h => {
  await h.goto('?debug&auto&kb&peace&res=0.45&rk=1');
  await h.waitFor("window.__G && __G.G.state==='play'", 60000); await h.wait(1000);
  await h.eval('(() => { const B = __G.HOME_B, x = B.x + 30, z = B.z + 30; __G.fx.explode(x, __G.terrainH(x, z) + 1, z, 1.5, { fire: 60 }); return 1; })()');
  await h.wait(1000);
  await h.expect('__G.fx.rk.time > 0 && __G.rkPost.seconds > 0', 'clocks run in play');
  await h.eval('(__G.openMenu(), window.__c = [__G.fx.rk.time, __G.rkPost.seconds, __G.fx.time], 1)');
  await h.wait(1500);
  await h.expect("__G.G.state === 'paused' && __G.fx.rk.time === __c[0] && __G.rkPost.seconds === __c[1] && __G.fx.time === __c[2]", 'GPU particle, CPU fx and post clocks frozen while paused');
  await h.key('tap', 'Escape'); await h.wait(800);
  await h.expect('__G.fx.rk.time > __c[0]', 'resumes after the menu');
  // reduced motion (the media query is live: fx.js and the post wrapper read it each frame)
  await h.page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await h.wait(800);
  await h.eval('(window.__s = __G.rkPost.seconds, 1)'); await h.wait(1500);
  await h.eval('({ rm: __G.fx.reducedMotion, postSeconds: [__s, __G.rkPost.seconds], grain: __G.rkPost.uniforms.rkGrain.value, temporal: __G.rkPost.uniforms.rkTemporal.value, embersShown: __G.fx.rk.group.children.filter(m => m.visible && m.material.name.endsWith("sparks")).length })', 'reduced motion');
  await h.expect('__G.fx.reducedMotion && __G.rkPost.seconds === __s && __G.rkPost.uniforms.rkGrain.value === 0 && __G.rkPost.uniforms.rkTemporal.value === 0', 'reduced motion: post time frozen, grain and temporal zero');
  await h.shot('reduced-motion'); await h.notblank();
  // a dynamic-resolution step (what updateDynRes does on a GPU-bound machine): the post target follows the buffer
  await h.eval('(__G.renderer.setPixelRatio(0.6), 1)'); await h.wait(800);
  await h.eval('(() => { const b = __G.renderer.getDrawingBufferSize(new __G.THREE.Vector2()), t = __G.rkPost.post.target; return { buffer: [b.x, b.y], target: [t.width, t.height] }; })()', 'after pixel ratio 0.6');
  await h.expect('(() => { const b = __G.renderer.getDrawingBufferSize(new __G.THREE.Vector2()), t = __G.rkPost.post.target; return b.x === t.width && b.y === t.height; })()', 'post target follows a resolution change');
  await h.shot('pixel-ratio-0.6'); await h.notblank();
} };
