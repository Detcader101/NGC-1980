// UNIT MARKERS (ngc/healthbars, game/js/ui/): the icon + health bar over every unit, in the views a player sees.
//   1. the ALBATROSS deck from the Huey's chase camera (the carrier, the player's own Huey)
//   2. a battle placed on the nearest neutral island: Marines vs STRIDERs (squads: one marker each), an RW-7, WASPs,
//      the island's buildings and an AA gun; seen from the Huey's chase camera, from above, and from the cockpit
//   3. damage: the flash and the white "lost" segment on a hit; a destroyed unit drops its marker
//   4. the modes: F8 cycles ALL UNITS -> DAMAGED ONLY -> OFF (and back); the pause menu item
//   5. the Hornet (cockpit + chase), on foot (first + third person), the M60A3, the command map
// The war is fast-forwarded between shots (headless Chrome runs ~8 fps).   node snap.mjs scenes/healthbars.mjs
const HOOK = `(() => { const G = __G, r = G.renderer, orig = r.render.bind(r), T = G.THREE, t = new T.Vector3();
  // a scripted camera: the game's own camera is moved (the marker layer projects with it)
  r.render = (s, c) => { const m = window.__cam; if (c === G.zCam && m) { c.position.set(...m.at); t.set(...m.look); c.up.set(0, 1, 0); c.lookAt(t); c.updateMatrixWorld(); } return orig(s, c); };
  window.__ff = (secs, dt = 1 / 30, until) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, !!window.__peace); if (until && until()) return true; } return false; };
  window.__mk = () => ({ mode: __MK.mode, ...__MK.stats, ms: +__MK.stats.ms.toFixed(3) });
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45&markers=all');
  await h.waitFor('window.__G && window.__MK', 15000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000);
  await h.waitFor('__G.H.landed', 15000); await h.wait(1500);
  await h.eval(HOOK);
  await h.expect(`__MK.mode === 'all'`, '?markers=all');
  // ---- 1. on the deck: the chase camera
  await h.eval(`(__G.cockpitCam = false, 1)`); await h.key('tap', 'KeyC'); await h.wait(1500);
  await h.eval('__mk()');
  await h.shot('01-deck-chase');
  await h.expect('__MK.stats.drawn >= 2', 'the ALBATROSS and the Huey have markers');
  // ---- 2. a battle on the nearest neutral island
  await h.eval(`(() => { const W = __G.war, c = W.carrier, GW = W.ground;
    const I = __G.ISLANDS.filter(i => !i.cave && i.owner === 0).sort((a, b) => Math.hypot(a.x - c.p.x, a.z - c.p.z) - Math.hypot(b.x - c.p.x, b.z - c.p.z))[0]; window.__I = I;
    W.E.mat = 0; W.transT = 1e9; W.raidT = 1e9; __G.G.bench = true; GW.godPlayer = true;
    const p = I.pad; GW.addSquad(1, I, 13, p.x - 30, p.z + 10); GW.addSquad(2, I, 8, p.x + 30, p.z - 8);
    window.__wasps = [0, 1].map(k => W.spawnGunship(2, [p.x + 60 + k * 14, p.h + 40, p.z - 50]));
    for (const s of I.structs) if (s.kind !== 'aa') W.damage(s, s.max * (0.15 + 0.3 * Math.random()), 2);
    return { I: I.name, pad: [Math.round(p.x), Math.round(p.z)], structs: I.structs.map(s => s.kind) }; })()`);
  await h.eval(`__ff(25)`);
  // the Huey hovers off the island, facing it; chase camera
  await h.eval(`(() => { const p = __I.pad, x = p.x - 90, z = p.z + 70, yaw = Math.atan2(-(p.x - x), -(p.z - z)); __G.H.reset(new __G.THREE.Vector3(x, Math.max(__G.terrainH(x, z), 0) + 30, z), yaw, false, 1); __G.HI.setCollective(0.475); return yaw; })()`);
  await h.wait(2500);
  await h.eval('__mk()');
  await h.shot('02-battle-chase');
  await h.expect('__MK.stats.drawn >= 4', 'markers over the battle');
  // from above (the scripted camera), squads aggregated
  await h.eval(`(window.__cam = { at: [__I.pad.x - 70, __I.pad.h + 70, __I.pad.z + 80], look: [__I.pad.x, __I.pad.h, __I.pad.z] }, 1)`); await h.wait(1500);
  await h.eval('__mk()');
  await h.shot('03-battle-above');
  // ---- 3. damage: hit a STRIDER squad and the island HQ; the flash
  await h.eval(`(() => { const W = __G.war, GS = W.ground.sim, s = GS.units.filter(u => u.kind === 'strider' && u.alive); for (const u of s.slice(0, 3)) u.sim.hp.thorax *= 0.3; const hq = __I.structs.find(q => !q.dead); if (hq) W.damage(hq, hq.max * 0.3, 2); return s.length; })()`);
  await h.wait(150);
  await h.shot('04-hit-flash');
  await h.eval(`(() => { const W = __G.war, w = __wasps[0]; W.damage(w, 99, 1); return { dying: !!w.dying }; })()`);
  await h.wait(400);
  await h.eval('__mk()');
  await h.shot('05-wasp-destroyed');
  // ---- the Huey's cockpit: no marker on your own craft, the sight and the panel clear
  await h.eval(`(window.__cam = null, __G.cockpitCam = true, 1)`); await h.wait(2000);
  await h.eval('__mk()');
  await h.shot('06-huey-cockpit');
  await h.eval(`(__G.cockpitCam = false, 1)`);
  // ---- 4. modes: F8 cycles; the pause menu item
  await h.key('tap', 'F8'); await h.wait(800);
  await h.expect(`__MK.mode === 'damaged'`, 'F8: DAMAGED ONLY');
  await h.shot('07-damaged-only');
  await h.key('tap', 'F8'); await h.wait(800);
  await h.expect(`__MK.mode === 'off' && __MK.stats.drawn === 0`, 'F8: OFF');
  await h.shot('08-off');
  await h.key('tap', 'F8'); await h.wait(300);
  await h.expect(`__MK.mode === 'all' && localStorage.getItem('tz_markers') === 'all'`, 'F8: back to ALL, remembered');
  await h.eval(`(__G.openMenu(), 1)`); await h.wait(500);
  await h.expect(`__G.menu.items.some(i => i.id === 'markers' && /ALL UNITS/.test(i.label))`, 'the pause menu shows UNIT MARKERS: ALL UNITS');
  await h.shot('09-menu');
  await h.eval(`(() => { __G.menu.sel = __G.menu.items.findIndex(i => i.id === 'markers'); __G.menuPick(); return __G.menu.items.find(i => i.id === 'markers').label; })()`);
  await h.expect(`__MK.mode === 'damaged'`, 'the menu item cycles the mode');
  await h.eval(`(__MK.set('all'), __G.menuKey({ code: 'Escape' }), 1)`); await h.wait(300);
  // ---- 5. the command map
  await h.key('tap', 'KeyM'); await h.wait(1200);
  await h.shot('10-command-map');
  await h.key('tap', 'KeyM'); await h.wait(500);
  // a dry, gentle spot on the island r m from the pad, on the side facing the camera's way in (x-, z+)
  await h.eval(`(window.__land = (r0 = 25, r1 = 60) => { const p = __I.pad, H = __G.terrainH; let best = null;
    for (let r = r0; r <= r1; r += 5) for (let a = 0; a < 6.283; a += 0.2) { const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = H(x, z), sl = Math.abs(H(x + 2, z) - H(x - 2, z)) + Math.abs(H(x, z + 2) - H(x, z - 2));
      if (y < 1.5 || sl > 1.6) continue; const s = sl + Math.abs(a - 2.4) * 0.5; if (!best || s < best.s) best = { x, z, y, s }; }
    return best; }, true)`);
  // ---- on foot: out of the Huey on the island (first person, then the Marine's third-person view)
  await h.eval(`(() => { const s = __land(22, 50); if (!s) return null; const p = __I.pad, yaw = Math.atan2(-(p.x - s.x), -(p.z - s.z)); __G.foot.spawnAt([{ x: s.x, y: s.y, z: s.z, yaw }]); __G.crafts.control('foot', 0, 'heli'); __G.marine?.aim?.(yaw, -0.05); return { craft: __G.G.craft, at: [Math.round(s.x), Math.round(s.z)] }; })()`);
  await h.wait(2500);
  await h.eval(`({ craft: __G.G.craft, fp: __G.crafts.active.firstPerson(), ...__mk() })`);
  await h.expect(`__G.G.craft === 'foot'`, 'on foot on the island');
  await h.shot('11-foot-first');
  await h.key('tap', 'KeyV'); await h.wait(2000);
  await h.eval(`({ craft: __G.G.craft, fp: __G.crafts.active.firstPerson(), ...__mk() })`);
  await h.shot('12-foot-third');
  await h.eval(`(__G.toHeli(), 1)`); await h.wait(1000);
  // ---- the M60A3 on the island, facing the fight
  await h.eval(`(() => { const s = __land(30, 70); if (!s) return null; const p = __I.pad; __G.m60C.spawnAt({ x: s.x, z: s.z, yaw: Math.atan2(-(p.x - s.x), -(p.z - s.z)), state: 'hot' }); __G.crafts.control('m60', 0, 'foot'); return { craft: __G.G.craft, at: [Math.round(s.x), Math.round(s.z)] }; })()`);
  await h.wait(2500);
  await h.eval(`({ craft: __G.G.craft, fp: __G.crafts.active.firstPerson(), ...__mk() })`);
  await h.shot('13-m60');
  await h.key('tap', 'KeyV'); await h.wait(2000);
  await h.eval(`({ craft: __G.G.craft, fp: __G.crafts.active.firstPerson(), ...__mk() })`);
  await h.shot('14-m60-outside');
  await h.eval(`(__G.toHeli(), 1)`); await h.wait(1000);
  // ---- the cost: ms per frame with ~300 units (more squads on other islands, gunships over this one; fog off)
  await h.eval(`(() => { const W = __G.war, GW = W.ground; __G.fog.enabled = false; let k = 0; for (const I of __G.ISLANDS) { if (I.cave || I === __I) continue; GW.addSquad(1 + (k++ % 2), I, 12, I.pad.x + 20, I.pad.z); } for (let j = 0; j < 4; j++) { GW.addSquad(1, __I, 10, __I.pad.x - 40 + j * 9, __I.pad.z + 30); GW.addSquad(2, __I, 8, __I.pad.x + 40 - j * 9, __I.pad.z - 30); } for (let k = 0; k < 24; k++) W.spawnGunship(2, [__I.pad.x + (k % 6) * 14, __I.pad.h + 60 + (k / 6 | 0) * 10, __I.pad.z - 120]); return W.ground.sim.units.length + W.units.length + W.islands.reduce((s, I) => s + I.structs.length, 0); })()`);
  await h.eval(`(() => { const p = __I.pad; window.__cam = { at: [p.x - 170, p.h + 140, p.z + 190], look: [p.x + 60, p.h, p.z - 60] }; __G.cockpitCam = false; return 1; })()`);
  await h.wait(2500);
  await h.eval(`(async () => { const s = []; for (let i = 0; i < 20; i++) { await new Promise(r => requestAnimationFrame(r)); s.push(__MK.stats.ms); } s.sort((a, b) => a - b); const W = __G.war; window.__cost = { median: +s[10].toFixed(3), max: +s[19].toFixed(3), soldiers: W.ground.sim.units.length, warUnits: W.units.length, ...__mk() }; return window.__cost; })()`);
  await h.shot('15-many-units');
  await h.expect('window.__cost.median < 2.5', 'the marker layer costs under 2.5 ms a frame (software GL, headless)');
  // ---- the Hornet (a fresh war: on the deck, 5 takes a jet; then it is put in the air over the island)
  await h.goto('?debug&auto&kb&res=0.45&markers=all');
  await h.waitFor(`window.__G && __G.G.state === 'play' && __G.H.landed`, 20000); await h.wait(1200);
  await h.eval(HOOK);
  await h.key('tap', 'Digit5'); await h.wait(800);
  await h.expect(`__G.G.craft === 'jet'`, 'in the Hornet');
  await h.eval(`(() => { const W = __G.war, c = W.carrier, I = __G.ISLANDS.filter(i => !i.cave && i.owner === 0).sort((a, b) => Math.hypot(a.x - c.p.x, a.z - c.p.z) - Math.hypot(b.x - c.p.x, b.z - c.p.z))[0]; window.__I = I; W.E.mat = 0; W.transT = 1e9; __G.G.bench = true; W.ground.godPlayer = true;
    const p = I.pad; W.ground.addSquad(1, I, 13, p.x - 30, p.z + 10); W.ground.addSquad(2, I, 8, p.x + 30, p.z - 8); window.__wasps = [0, 1, 2].map(k => W.spawnGunship(2, [p.x + 40 + k * 16, p.h + 50, p.z - 40]));
    const J = __G.JP.J, x = p.x - 520, z = p.z + 380, yaw = Math.atan2(-(p.x - x), -(p.z - z)); J.reset(x, 140, z, yaw, { running: true, airborne: true, alt: 140, speed: 140 }); __G.cockpitCam = true; return I.name; })()`);
  await h.wait(1500);
  await h.eval(`({ craft: __G.G.craft, ...__mk() })`);
  await h.shot('16-hornet-cockpit');
  await h.eval(`(__G.cockpitCam = false, 1)`); await h.wait(1500);
  await h.eval(`({ craft: __G.G.craft, ...__mk() })`);
  await h.shot('17-hornet-chase');
  // ---- SIM MODE: markers on by default (no ?markers), every spectator camera
  await h.goto('?sim&debug&res=0.45&speed=16&seed=3&patch=catlane&blue=BALANCED&red=DEFAULT&tech=all');
  await h.waitFor(`window.__SIM && __SIM.built && __G.G.state === 'play'`, 30000);
  await h.eval(HOOK);
  await h.expect(`__MK.mode === 'all'`, 'sim mode: markers ON by default');
  await h.waitFor('__G.war.time > 200', 240000);
  await h.eval(`({ t: Math.round(__G.war.time), cam: __SIM.cam, ...__mk() })`);
  await h.shot('18-sim-action');
  await h.key('tap', 'KeyC'); await h.wait(2500);
  await h.shot('19-sim-free');
  await h.key('tap', 'KeyC'); await h.waitFor(`__SIM.cam === 'FOLLOW' && !!__SIM.follow`, 20000); await h.wait(2500);
  await h.eval(`({ follow: __SIM.follow && (__SIM.follow.name || __SIM.follow.type), ...__mk() })`);
  await h.shot('20-sim-follow');
  await h.key('tap', 'KeyC'); await h.wait(2500);
  await h.eval(`({ cam: __SIM.cam, ...__mk() })`);
  await h.shot('21-sim-map');
}
