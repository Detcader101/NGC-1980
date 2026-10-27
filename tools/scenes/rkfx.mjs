// RENDERKIT fx/post A/B (ngc/rk-fx): the same views with the RenderKit on and off. Run it twice with the same seed:
//   RKQ=rk=0 node snap.mjs scenes/rkfx.mjs --seed 7 --name rkfx-off
//   RKQ=rk=1 node snap.mjs scenes/rkfx.mjs --seed 7 --name rkfx-on
// Views: carrier deck, pause menu over it, Huey cockpit, foot first person (arms overlay), explosions and a burning
// wreck, rotor dust on land and spray on water, Hornet cockpit on the catapult, the M60 gunner's day and TTS sights.
// Ends with a frame-time sample of the burning view (fixed res, so dynamic resolution does not move).
const RKQ = process.env.RKQ || 'rk=1';
export default async function (h) {
  await h.goto(`?debug&auto&kb&peace&res=0.6&${RKQ}`);
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 60000); await h.wait(1500);
  await h.eval(`({ rk: new URLSearchParams(location.search).get('rk'), fx: !!__G.fx.rk, tm: __G.renderer.toneMapping, ocs: __G.renderer.outputColorSpace })`);
  await h.shot('deck'); await h.notblank();
  await h.eval(`(() => { const P = __G.rkPost, t = P && P.post.target, b = __G.renderer.getDrawingBufferSize(new __G.THREE.Vector2()); return { post: !!P, target: t ? [t.width, t.height, t.samples, t.texture.type, t.texture.colorSpace] : null, buffer: [b.x, b.y], hdr: P ? P.post.hdr : null, toneMapping: __G.renderer.toneMapping, ocs: __G.renderer.outputColorSpace }; })()`, 'post state');
  // pause menu over the scene; the clock must stop (fx clock with the kit on)
  await h.eval('(__G.openMenu(), window.__t0 = __G.fx.time, 1)'); await h.wait(1200);
  await h.shot('pause-menu');
  await h.eval('({ state: __G.G.state, fxTimeMoved: __G.fx.time - __t0 })');
  await h.key('tap', 'Escape'); await h.wait(500); await h.expect("__G.G.state === 'play'");
  // Huey cockpit on the deck
  await h.eval('(__G.cockpitCam = true, window.__hy = [0, -0.1], window.__hyI = setInterval(() => { __G.head.yaw = __hy[0]; __G.head.pitch = __hy[1]; }, 5), 1)');
  await h.wait(1500); await h.shot('huey-cockpit');
  await h.eval('(__hy = [0.18, -0.42], 1)'); await h.wait(800); await h.shot('huey-gauges');
  await h.eval('(clearInterval(__hyI), __G.cockpitCam = false, 1)'); await h.wait(500);
  // out on the deck: first person with the arms and rifle overlay
  await h.key('tap', 'KeyY'); await h.wait(800);
  await h.eval("(__G.marine.aim(__G.marine.S.yaw + 2.2, -0.05), 1)"); await h.wait(1200);
  await h.eval("({ craft: __G.G.craft, view: __G.marine && __G.marine.view })");
  await h.shot('foot-first-person');
  await h.eval('(__G.toHeli(), 1)'); await h.wait(1200);
  // explosions and burning wrecks in front of a hovering Huey (chase view)
  await h.eval('(__G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x+20, 30, __G.HOME_B.z+60), 0, false, 1), __G.HI.setCollective(0.475), 1)');
  await h.wait(800);
  await h.eval("(() => { const B=__G.HOME_B, fx=__G.fx; for (let i=0;i<5;i++){ const x=B.x+5+i*9, z=B.z+20-i*6; fx.explode(x, __G.terrainH(x,z)+1, z, 1+i*0.5, {fire: 60, debris: 8}); } fx.explode(B.x+60, 1, B.z+150, 3, {oil:true}); return fx.emitters.length })()");
  await h.wait(300); await h.shot('blasts');
  await h.wait(3500); await h.shot('burning');
  await h.eval("({ add: __G.fx.add.n, mix: __G.fx.mix.n, emit: __G.fx.emitters.length, gpuFires: __G.fx.emitters.filter(e => e.rk).length })");
  // frame time here (fixed res 0.6, no dynamic resolution): 40 frames of rAF deltas and the CPU render submit
  await h.eval(`new Promise(r => { const d = []; let l = performance.now(); const f = t => { d.push(t - l); l = t; if (d.length < 41) requestAnimationFrame(f); else { d.shift(); d.sort((a, b) => a - b); r({ meanMs: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p50: +d[20].toFixed(1), p90: +d[36].toFixed(1), renderCpuMs: +__G.PROF.render.toFixed(1), calls: __G.renderer.info.render.calls }); } }; requestAnimationFrame(f); })`, 'frametime-burning');
  // rotor dust over land, low hover
  await h.eval(`(() => { const B = __G.HOME_B; for (let r = 160; r < 400; r += 6) for (let k = 0; k < 24; k++) { const a = k * 0.2618, x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r, g = __G.terrainH(x, z); if (g > 3 && Math.abs(__G.terrainH(x + 6, z) - g) < 0.6 && Math.abs(__G.terrainH(x, z + 6) - g) < 0.6) { __G.H.reset(new __G.THREE.Vector3(x, g + 3.5, z), 0.5, false, 1); __G.HI.setCollective(0.5); return [Math.round(x), Math.round(z), Math.round(g)]; } } return null; })()`, 'dust spot');
  await h.wait(2500); await h.shot('rotor-dust');
  await h.eval('({ agl: __G.H.agl, thrust: __G.H.thrust, rpm: __G.H.rpm })');
  // spray over open water
  await h.eval('(__G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x + 400, 4, __G.HOME_B.z + 400), 0.5, false, 1), __G.HI.setCollective(0.5), 1)');
  await h.wait(2500); await h.shot('rotor-spray');
  // Hornet cockpit on the catapult: back to the deck first
  await h.eval('(__G.respawnHome && __G.respawnHome(), 1)'); await h.wait(2000);
  await h.waitFor('__G.H.landed', 20000).catch(() => {});
  await h.key('tap', 'Digit5'); await h.wait(1500);
  await h.eval('({ craft: __G.G.craft })');
  await h.eval('(__G.cockpitCam = true, window.__hy = [0, -0.02], window.__hyI = setInterval(() => { __G.head.yaw = __hy[0]; __G.head.pitch = __hy[1]; }, 5), 1)');
  await h.wait(1800); await h.shot('hornet-cockpit');
  await h.eval('(__hy = [0, -0.55], 1)'); await h.wait(900); await h.shot('hornet-panel');
  await h.eval('(clearInterval(__hyI), __G.cockpitCam = false, 1)');
  // the M60 gunner: day sight, then TTS thermal with a fire burning in view
  await h.eval('(__G.toHeli(), 1)'); await h.wait(800);
  await h.eval(`(() => { const s = __G.GR.motorPool(__G.HOME_B.isl, 4.6); __G.m60C.spawnAt({ ...s, state: 'hot' }); return s.name; })()`); await h.wait(600);
  await h.eval(`(__G.crafts.control('m60', 1, 'foot'), 1)`); await h.wait(1200);
  await h.eval("({ craft: __G.G.craft, seat: __G.crafts.seat, fp: __G.m60C.firstPerson && __G.m60C.firstPerson() })");
  await h.eval(`(() => { const T = __G.m60C, o = T.fm.origin(), d = T.V.sightDir(), x = o[0] + d[0] * 120, z = o[2] + d[2] * 120; __G.fx.explode(x, __G.terrainH(x, z) + 1, z, 2, { fire: 120, debris: 6 }); return [Math.round(x), Math.round(z)]; })()`, 'fire in the sight');
  await h.wait(2500); await h.shot('m60-day-sight');
  await h.key('tap', 'KeyO'); await h.waitFor("__G.m60C.V.sight === 'tts' && __G.m60C.V.ttsCool >= 0.95", 120000).catch(() => {});
  await h.wait(1000); await h.shot('m60-thermal-sight');
  await h.eval("({ sight: __G.m60C.V.sight, cool: __G.m60C.V.ttsCool })");
}
