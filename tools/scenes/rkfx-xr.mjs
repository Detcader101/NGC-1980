// RENDERKIT fx/post in WebXR (ngc/rk-fx), through Meta's IWER emulator like scenes/xr.mjs: VR must render, the
// GPU particles must draw in both eyes, and the desktop post pipeline must not run at all while presenting
// (including the flat "spatial display" path that calls drawDesktop into a target). Counts post.render calls.
import fs from 'node:fs';
const iwer = fs.readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
export default { name: 'rkfx-xr', query: '?debug&kb&peace&res=0.45&tech=all', run: async h => {
  await h.page.evaluateOnNewDocument(iwer + ';const xrContainer=document.createElement("div");xrContainer.dataset.xrIgnore="";xrContainer.style.pointerEvents="none";window.__xrDevice=new IWER.XRDevice(IWER.metaQuest3,{canvasContainer:xrContainer});__xrDevice.stereoEnabled=true;__xrDevice.installRuntime({forceInstall:true});');
  await h.goto('?debug&kb&peace&res=0.45&tech=all&rk=1');
  if (!await h.waitFor('window.__G && __G.XR.state.supported', 30000)) throw Error('emulated WebXR unavailable');
  await h.expect('!!__G.rkPost && !!__G.fx.rk', 'kit on: post and GPU particles built');
  // count every post pass (desktop title screen draws through it)
  await h.eval('(window.__postN = 0, (p => { const r = p.render.bind(p); p.render = (...a) => { __postN++; return r(...a); }; })(__G.rkPost.post), 1)');
  await h.wait(1500);
  await h.expect('__postN > 0', 'desktop frames go through the post pipeline');
  await h.page.click('#enterVR');
  if (!await h.waitFor('__G.XR.active && __G.XR.state.frames>5', 30000)) throw Error('VR entry failed');
  await h.expect('__G.renderer.xr.isPresenting', 'presenting');
  await h.eval('(window.__postVR = __postN, 1)');
  await h.eval('(() => { const p = __G.zCam.getWorldPosition(new __G.THREE.Vector3()), d = __G.zCam.getWorldDirection(new __G.THREE.Vector3()); const x = p.x + d.x * 40, z = p.z + d.z * 40; __G.fx.explode(x, Math.max(__G.terrainH(x, z), 0) + 2, z, 2, { fire: 60 }); return [Math.round(x), Math.round(z)]; })()', 'blast ahead of the headset');
  await h.wait(2500);
  await h.shot('vr-fire-stereo'); await h.notblank();
  await h.eval('({ frames: __G.XR.state.frames, flat: __G.XR.state.flat, gpuFires: __G.fx.emitters.filter(e => e.rk).length, postCalls: __postN - __postVR, toneMapping: __G.renderer.toneMapping, ocs: __G.renderer.outputColorSpace, err: __G.XR.state.error })', 'vr state');
  await h.expect('__postN === __postVR', 'no post pass while presenting');
  await h.expect('__G.fx.emitters.some(e => e.rk)', 'GPU fire drawn in VR');
  // the flat spatial display (a magnified sight or the cave) draws drawDesktop into a target while presenting
  await h.eval('(__G.crafts.active = __G.crafts.active, window.__flat0 = __G.XR.state.flat, 1)');
  await h.eval(`(() => { const s = __G.GR.motorPool(__G.HOME_B.isl, 4.6); __G.m60C.spawnAt({ ...s, state: 'hot' }); __G.crafts.control('m60', 1, 'foot'); return __G.G.craft; })()`, 'into the M60 gunner seat');
  await h.wait(2000);
  await h.eval('({ craft: __G.G.craft, flat: __G.XR.state.flat, postCalls: __postN - __postVR })', 'gunner in VR');
  await h.shot('vr-gunner'); await h.notblank();
  await h.expect('__postN === __postVR', 'still no post pass in VR (flat display path included)');
  await h.eval('(__G.XR.exit ? __G.XR.exit() : __G.renderer.xr.getSession().end(), 1)');
  await h.waitFor('!__G.renderer.xr.isPresenting', 30000);
  await h.wait(1500);
  await h.expect('__postN > __postVR', 'post resumes on the desktop after VR');
  await h.shot('desktop-after-vr'); await h.notblank();
} };
