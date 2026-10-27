// RENDERKIT light in VR (IWER Quest 3, stereo): the shadow tier switches to 'xr' (smaller maps, far cascade every 3rd
// frame, tiny casters skip the near map), both eyes draw with the same maps, the VR rig never casts, back to 'desktop'
// on leaving. Needs tools/node_modules/iwer (the experimental checkout's node_modules).
import fs from 'node:fs';
const iwer = fs.readFileSync(new URL('../node_modules/iwer/build/iwer.min.js', import.meta.url), 'utf8');
export default { name: 'rklight-xr', query: '?debug&kb&peace&res=0.45', run: async h => {
  await h.page.evaluateOnNewDocument(iwer + ';const xrContainer=document.createElement("div");xrContainer.dataset.xrIgnore="";xrContainer.style.pointerEvents="none";window.__xrDevice=new IWER.XRDevice(IWER.metaQuest3,{canvasContainer:xrContainer});__xrDevice.stereoEnabled=true;__xrDevice.installRuntime({forceInstall:true});');
  await h.goto('?debug&kb&peace&res=0.45');
  if (!await h.waitFor('window.__G && __G.XR.state.supported', 30000)) throw Error('emulated WebXR unavailable');
  await h.expect("__G.rkLight && __G.rkLight.tier === 'desktop'", 'desktop tier before VR');
  await h.page.click('#enterVR');
  if (!await h.waitFor('__G.XR.active && __G.XR.state.frames>5', 30000)) throw Error('VR entry failed');
  await h.waitFor("__G.rkLight.tier === 'xr'", 10000);
  await h.eval('({ tier: __G.rkLight.tier, cascades: __G.rkLight.cascades.map(c => ({ r: c.r, size: c.size, every: c.every, min: c.min, map: c.S.map && c.S.map.width })), stats: __G.rkLight.stats })', 'xr-tier');
  await h.expect("__G.rkLight.cascades[0].S.map && __G.rkLight.cascades[0].S.map.width === 1536 && __G.rkLight.cascades[1].every === 3", 'xr tier: 1536 near map, far map every 3rd frame');
  await h.expect('(() => { let bad = 0; __G.XR.rig.traverse(o => { if (o.castShadow) bad++; }); return bad === 0; })()', 'nothing in the VR rig (panel, controllers, hands) casts');
  await h.wait(1500); await h.shot('vr-cockpit-stereo'); await h.notblank();
  // out on the deck in VR: the soldier, the arms overlay pass with the matched lights
  await h.eval('(__G.G.state = "play", 1)'); await h.key('tap', 'KeyY'); await h.wait(1200);
  await h.expect("__G.G.craft === 'foot'", 'out on foot in VR');
  await h.wait(1500); await h.shot('vr-foot-stereo'); await h.notblank();
  await h.eval('(__G.renderer.xr.getSession().end(), 1)');
  await h.waitFor('!__G.XR.active', 15000); await h.wait(800);
  await h.expect("__G.rkLight.tier === 'desktop' && __G.rkLight.cascades[0].S.map.width === 2048", 'desktop tier again after VR');
  await h.shot('after-vr'); await h.notblank();
}};
