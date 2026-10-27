import { setupXR, frames } from '../xr-harness.mjs';
export default { name: 'vr-evidence', seed: 1980, query: '?debug&kb&peace&res=0.45&xrscale=0.8', run: async h => {
  await setupXR(h, '?debug&kb&peace&res=0.45&xrscale=0.8');
  await frames(h, 4);
  await h.expect('__G.XR.active && __G.renderer.xr.getCamera().cameras.length===2', 'immersive session has two eye cameras');
  await h.benchmark('vr-cockpit', { warmup: 8 });
  await h.shot('vr-cockpit'); await h.notblank();
  if (h.capture) await h.clip('vr-cockpit', { durationMs: 6000 });
  await h.eval('(__G.XR.end(),1)');
  await h.waitFor('!__G.XR.active', 15000);
} };
