// SEALIFE 2: the sea's life from every place a player can see it.   [PARTS=huey,deck,bow,swim,jet,lcm,fps] node snap.mjs scenes/sealife.mjs
// - huey: a bait ball (bonito on pilchard) off the ALBATROSS, the Huey hovering low near it: the birds come, the top
//   boils; chase and cockpit; then low over it: the downwash scatters it and flushes the birds
// - deck: a Marine at the ALBATROSS's deck edge at anchor, looking over the side (schools in her shade)
// - bow:  the ALBATROSS under way, dolphins riding her bow, seen from the flight deck's forward end
// - swim: a Marine swimming over the rocks (sea bream come to look), then diving
// - jet:  the HORNET low over a bait ball: the birds flush
// - lcm:  an LCM-8 running in to the beach with the M60: what it stirs up ahead of it
// - fps:  the cost - the same view with the life on and off (blocks alternated), and the sim's ms
// Every wait is on GAME time (the sea's clock), not wall time: a headless build runs ~8 fps.
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.6&sea=3&sealife=high');
  await h.waitFor('window.__G', 20000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.waitFor("__G.G.state === 'play'", 15000);
  const parts = (process.env.PARTS || 'all').split(','), want = p => parts.includes(p) || parts.includes('all');
  await h.eval(`(() => {
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === __G.zCam) { a.set(...C.p); b.set(...C.t); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__gt = () => __G.war.sea.t;
    window.__until = s => { window.__gEnd = __gt() + s; return true; };
    window.__fps = (n = 120) => { window.__ft = []; window.__lt = performance.now(); (function f(t){ __ft.push(t - __lt); __lt = t; if (__ft.length < n) requestAnimationFrame(f); })(performance.now()); return true; };
    window.__fpsRes = () => { const a = __ft.slice(6).sort((x, y) => x - y), avg = a.reduce((s, x) => s + x, 0) / a.length; return { avgMs: +avg.toFixed(1), fps: +(1000 / avg).toFixed(2), simMs: +__G.sealife.ms.toFixed(2), fish: __G.sealife.fishDrawn, birds: __G.sealife.birdsDrawn }; };
    const SL = __G.sealife, S = SL.sim, c = __G.war.carrier;
    // deep open water 160-320 m off the carrier, clear of land for 60 m round
    let best = null; for (let k = 0; k < 64 && !best; k++) { const ang = k * 2.4, d = 160 + (k % 5) * 40, x = c.p.x + Math.cos(ang) * d, z = c.p.z + Math.sin(ang) * d; let ok = true; for (let q = 0; q < 12 && ok; q++) { const qa = q / 12 * 6.283; if (__G.terrainH(x + Math.cos(qa) * 60, z + Math.sin(qa) * 60) > -9) ok = false; } if (ok && __G.terrainH(x, z) < -12) best = [x, z]; }
    window.__P = best;
    // the Huey holds a height over the water by itself (a height-hold loop on the collective; wall-clock, gentle)
    window.__hold = agl => { clearInterval(window.__ap); window.__c = 0.47; window.__ap = setInterval(() => { const H = __G.H; const tgt = (agl - H.agl) * 0.5; window.__c = Math.min(0.62, Math.max(0.2, window.__c + (Math.max(-2, Math.min(2, tgt)) - H.vel.y) * 0.002)); __G.HI.setCollective(window.__c); }, 16); };
    window.__ball = (x, z) => { const B = S.spawnBaitBall(x, z); window.__BB = B; return { n: B.prey.n, pred: B.pred && B.pred.n }; };
    window.__st = () => ({ schools: S.schools.length, fish: SL.fishDrawn, counts: SL.counts, birds: SL.birds.birds.length, drawnBirds: SL.birdsDrawn, signs: SL.signsDrawn, ms: +SL.ms.toFixed(2), simMs: +S.ms.toFixed(2), stats: S.stats, bstats: SL.birds.stats, under: SL.under });
    return { P: best, depth: best && -__G.terrainH(...best), carrier: [c.p.x, c.p.z, c.yaw], L: c.dims && c.dims.L };
  })()`);
  await h.expect('!!window.__P', 'found open deep water near the ALBATROSS');
  const waitGame = async (s) => { await h.eval(`__until(${s})`); await h.waitFor('__gt() >= window.__gEnd', 30000 + s * 5000); };

  if (parts.includes('diag')) {   // (debug: each mesh of the life alone, over a bait ball with dolphins)
    await h.eval(`(() => { const [x, z] = __P, T = __G.THREE; __G.toHeli(); __G.H.reset(new T.Vector3(x - 70, 30, z), 0, false, 1); __hold(30); __ball(x, z); __G.sealife.sim.spawnSchool('dolphin', x + 10, z + 10); window.__cam = { p: [x - 16, 18, z - 12], t: [x, -1, z] }; return 1; })()`);
    await waitGame(12);
    await h.eval('__st()');
    for (const m of ['school', 'fish', 'dolphin', 'ray', 'jelly', 'birds', 'signs']) {
      await h.eval(`(() => { const L = __G.sealife; window.__only = '${m}'; for (const k in L.meshes) L.meshes[k].visible = k === '${m}'; L.signMesh.visible = '${m}' === 'signs'; const r = __G.renderer, o = r.render; return 1; })()`);
      await h.eval(`(() => { const L = __G.sealife; const keep = L.update; if (!L.__wrapped) { L.__wrapped = true; L.update = dt => { keep(dt); if (window.__only) { for (const k in L.meshes) L.meshes[k].visible = k === window.__only; L.signMesh.visible = window.__only === 'signs'; } }; } return 1; })()`);
      await waitGame(0.5); await h.shot('diag-' + m);
    }
    await h.eval('(window.__only = null, clearInterval(__ap), 1)');
  }

  if (want('huey')) {
    // a bait ball 70 m ahead of the Huey; the Huey 14 m up, nose to it; the game's own chase camera
    await h.eval(`(() => { const [x, z] = __P, T = __G.THREE, hx = x - 70, hz = z; __G.toHeli(); __G.cockpitCam = false; __G.H.reset(new T.Vector3(hx, 14, hz), Math.atan2(-(x - hx), -(z - hz)), false, 1); __hold(14); return __ball(x, z); })()`);
    await waitGame(30);
    await h.eval('__st()');
    await h.expect('__BB.prey.ball > 0.5', 'the pilchard have balled up under the bonito');
    await h.expect('__G.sealife.birds.birds.length >= 5', 'seabirds have come to the bait ball');
    await h.shot('huey-chase-baitball');
    await h.eval('(__G.cockpitCam = true, 1)'); await waitGame(2);
    await h.shot('huey-cockpit-baitball');
    // a closer look from 18 m (scripted camera; the life is simulated round the Huey and the ball)
    await h.eval(`(window.__cam = { p: [__BB.prey.cx - 16, 18, __BB.prey.cz - 12], t: [__BB.prey.cx, -1, __BB.prey.cz] }, 1)`); await waitGame(3);
    await h.eval('__st()');
    await h.shot('baitball-from-18m');
    await h.eval(`(window.__cam = { p: [__BB.prey.cx - 30, 5, __BB.prey.cz - 20], t: [__BB.prey.cx, 3, __BB.prey.cz] }, 1)`); await waitGame(2);
    await h.shot('baitball-birds-low');
    // the Huey comes in low over the ball: the downwash flattens the top, the ball scatters, the birds go
    await h.eval(`(() => { window.__cam = null; __G.cockpitCam = false; const T = __G.THREE, B = __BB.prey; window.__fl0 = __G.sealife.birds.stats.flushed; __G.H.reset(new T.Vector3(B.cx - 6, 8, B.cz), 0, false, 1); __hold(7); return 1; })()`);
    await waitGame(5);
    await h.eval('({ ...__st(), fear: +Math.max(0, ...__G.sealife.sim.fish().filter(f => f.school === __BB.prey).map(f => f.fear)).toFixed(2), flushed: __G.sealife.birds.stats.flushed - __fl0 })');
    await h.expect('__G.sealife.birds.stats.flushed > __fl0', 'the downwash flushes the birds');
    await h.expect('__G.sealife.sim.fish().filter(f => f.school === __BB.prey).some(f => f.fear > 0.4)', 'and scatters the ball');
    await h.shot('huey-downwash-over-ball');
    await h.eval('(clearInterval(__ap), 1)');
  }

  if (want('deck')) {
    // at anchor: out of the Huey on the deck, to the starboard edge, looking down over the side
    await h.eval(`(() => { clearInterval(window.__ap); window.__cam = null; const c = __G.war.carrier; c.speed = 0; c.path = []; __G.toHeli(); return 1; })()`);
    await h.eval(`(() => { const c = __G.war.carrier, wl = c.parts.waterline, S = __G.sealife.sim; for (let k = 0; k < 2; k++) S.spawnSchool(k ? 'sardine' : 'mackerel', c.p.x + Math.cos(c.yaw) * (wl.hw + 25 + 10 * k), c.p.z - Math.sin(c.yaw) * (wl.hw + 25 + 10 * k), true); return { hw: wl.hw, hl: wl.hl }; })()`);
    await h.key('tap', 'KeyY'); await h.wait(800);
    await h.waitFor("__G.G.craft === 'foot'", 10000);
    await h.eval(`(() => { const c = __G.war.carrier, w = __G.GR.toWorld(c, c.parts.deckHalf(5) * 0.985 - 0.35, 5); __G.foot.spawnAt({ x: w.x, y: c.p.y + 9, z: w.z, yaw: c.yaw - Math.PI / 2 }); if (__G.marine) { __G.marine.view = 'first'; __G.marine.aim(c.yaw - Math.PI / 2, -0.6); } return { edge: c.parts.deckHalf(5) }; })()`);
    await waitGame(2);
    await h.eval(`(() => { const c = __G.war.carrier, W = __G.foot.W, [lx, lz] = __G.GR.toLocal(c, W.x, W.z); return { lx: +lx.toFixed(2), lz: +lz.toFixed(2), y: +(W.y - c.p.y).toFixed(2), half: c.parts.deckHalf(lz), cam: __G.zCam.position.toArray().map(v => +v.toFixed(1)) }; })()`);
    await waitGame(25);
    await h.eval('__st()');
    await h.shot('deck-looking-over-the-side');
    await h.eval(`(__G.marine && __G.marine.aim(__G.war.carrier.yaw - Math.PI / 2 + 0.6, -0.5), 1)`); await waitGame(2);
    await h.shot('deck-over-the-side-aft');
    await h.expect(`__G.sealife.sim.schools.some(sc => { const c = __G.war.carrier; return Math.hypot(sc.cx - c.p.x, sc.cz - c.p.z) < c.parts.waterline.hl + 30; })`, 'schools alongside the ALBATROSS at anchor');
  }

  if (want('bow')) {
    // under way at ~5.5 m/s: dolphins come to her bow; from the forward end of the flight deck, looking down
    await h.eval(`(() => { window.__cam = null; const c = __G.war.carrier; c.speed = 5.5; const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); __G.war.orderCarrier(c.p.x + fx * 1500, c.p.z + fz * 1500); return 1; })()`);
    await waitGame(8);
    await h.eval(`(() => { const c = __G.war.carrier, S = __G.sealife.sim, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); const p = S.spawnSchool('dolphin', c.p.x + fx * 150 + fz * 40, c.p.z + fz * 150 - fx * 40, true); window.__POD = p; S.spawnSchool('flyingfish', c.p.x + fx * 120 - fz * 20, c.p.z + fz * 120 + fx * 20, true); return { n: p && p.n, v: c.speed }; })()`);
    if (await h.eval("__G.G.craft !== 'foot'")) { await h.eval('(__G.toHeli(), 1)'); await h.key('tap', 'KeyY'); await h.wait(800); }
    await waitGame(30);
    // (the flight deck overhangs the stem: from the port deck edge well forward, looking ahead and down past it)
    await h.eval(`(() => { const c = __G.war.carrier, lz = -50, lx = -(c.parts.deckHalf(lz) * 0.985 - 0.35), w = __G.GR.toWorld(c, lx, lz); __G.foot.spawnAt({ x: w.x, y: c.p.y + 9, z: w.z, yaw: c.yaw + 0.3 }); if (__G.marine) { __G.marine.view = 'first'; __G.marine.aim(c.yaw + 0.3, -0.5); } return { lx, lz }; })()`);
    await waitGame(3);
    await h.eval(`(() => { const c = __G.war.carrier, W = __G.foot.W, cam = __G.zCam, d = new __G.THREE.Vector3(); cam.getWorldDirection(d); const [lx, lz] = __G.GR.toLocal(c, W.x, W.z); return { foot: [+lx.toFixed(2), +lz.toFixed(2), +(W.y - c.p.y).toFixed(2)], dirLocal: [d.x * Math.cos(c.yaw) - d.z * Math.sin(c.yaw), d.y, d.x * Math.sin(c.yaw) + d.z * Math.cos(c.yaw)].map(v => +v.toFixed(2)) }; })()`);
    await h.eval(`(() => { const c = __G.war.carrier, wl = c.parts.waterline, fs = __G.sealife.sim.fish().filter(f => f.school === __POD); return { v: +c.speed.toFixed(1), pod: fs.map(f => { const dx = f.x - c.p.x, dz = f.z - c.p.z; return [+(dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw)).toFixed(1), +(dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw)).toFixed(1), +f.y.toFixed(1)]; }), hl: wl.hl, stats: __G.sealife.sim.stats }; })()`);
    await h.expect(`__G.sealife.sim.fish().filter(f => f.school === __POD).some(f => { const c = __G.war.carrier, dx = f.x - c.p.x, dz = f.z - c.p.z, lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw); return lz < -c.parts.waterline.hl + 2 && lz > -c.parts.waterline.hl - 16; })`, 'dolphins at her bow');
    await h.shot('bow-dolphins-from-deck');
    await h.eval(`(() => { const c = __G.war.carrier, wl = c.parts.waterline, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), sx = Math.cos(c.yaw), sz = -Math.sin(c.yaw); const bx = c.p.x + fx * (wl.hl + 4), bz = c.p.z + fz * (wl.hl + 4); window.__cam = { p: [bx + sx * 16 + fx * 10, 7, bz + sz * 16 + fz * 10], t: [bx, -0.5, bz] }; return 1; })()`);
    await waitGame(1);
    await h.shot('bow-dolphins-close');
    await h.eval('(window.__cam = null, __G.war.carrier.speed = 0, __G.war.carrier.path = [], 1)');
  }

  if (want('swim')) {
    // a rocky shelf 4-8 m deep near HOME ISLAND; a Marine floating still over it; bream and damselfish there
    await h.eval(`(() => { window.__cam = null; const I = __G.ISLANDS[0]; let sp = null; for (let k = 0; k < 1500 && !sp; k++) { const a = k * 0.37, d = 30 + k * 0.25, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, hh = __G.terrainH(x, z); if (hh < -4 && hh > -9 && __G.terrainH(x + 10, z) < -1.5 && __G.terrainH(x - 10, z) < -1.5 && __G.terrainH(x, z + 10) < -1.5 && __G.terrainH(x, z - 10) < -1.5) sp = [x, z]; }
      window.__SW = sp; if (!sp) return null; const [x, z] = sp, S = __G.sealife.sim; __G.toHeli();
      __G.foot.spawnAt({ x, y: -1.3, z, yaw: 0 }, { force: true }); __G.crafts.control('foot', 0, __G.crafts.active.id); if (__G.marine) { __G.marine.view = 'first'; __G.marine.aim(0, -0.35); }
      window.__BR = S.spawnSchool('bream', x + 3, z - 9, true); S.spawnSchool('damsel', x - 4, z - 10, true); S.spawnSchool('mullet', x + 8, z - 4, true); return { sp, depth: -__G.terrainH(x, z) }; })()`);
    await h.expect('!!window.__SW', 'found a rocky shelf 4-8 m deep');
    await waitGame(14);
    await h.eval(`({ ...__st(), bream: +Math.min(...__G.sealife.sim.fish().filter(f => f.school === __BR).map(f => Math.hypot(f.x - __SW[0], f.z - __SW[1]))).toFixed(1) })`);
    await h.eval(`(() => { const S = __G.sealife.sim, c = __G.zCam.position; return { cam: [c.x, c.y, c.z].map(v => +v.toFixed(1)), simCam: [S.cam.x, S.cam.y, S.cam.z].map(v => +v.toFixed(1)), radius: S.radius, culled: S.culled, near: S.schools.filter(sc => Math.hypot(sc.cx - __SW[0], sc.cz - __SW[1]) < 60).map(sc => ({ sp: sc.sp, n: sc.n, live: sc.live, fade: +sc.fade.toFixed(2), leave: sc.leave, cy: +sc.cy.toFixed(1), d: +Math.hypot(sc.cx - c.x, sc.cz - c.z).toFixed(1) })) }; })()`);
    await h.eval(`(() => { const L = __G.sealife, cm = L.camObj, e = cm.matrixWorld.elements, f = L.sim.fish().filter(f => f.school === __BR)[0], c = L.cam; const fl = Math.hypot(e[8], e[9], e[10]); const fwd = [-e[8] / fl, -e[9] / fl, -e[10] / fl]; const dx = f.x - c.x, dy = f.y - c.y, dz = f.z - c.z, d = Math.hypot(dx, dy, dz); return { camObj: cm.type + ' ' + cm.name + ' fov ' + cm.fov, same: cm === __G.zCam, fwd: fwd.map(v => +v.toFixed(2)), dot: +((dx * fwd[0] + dy * fwd[1] + dz * fwd[2]) / d).toFixed(2), d: +d.toFixed(1), fy: +f.y.toFixed(2), top: +L.surfaceAt(f.x, f.z).toFixed(2), px: (__G.renderer.domElement.height) / (cm.fov * Math.PI / 180), view: L.view, under: L.under, enabled: L.enabled, fishOn: L.fishOn, simOn: L.sim.enabled, w1: (L.sim.write(L.bufs, L.view), [L.sim.culled, ...Object.values(L.bufs).map(b => b.n)]), w0: (L.sim.write(L.bufs, null), [L.sim.culled, ...Object.values(L.bufs).map(b => b.n)]) }; })()`);
    await h.shot('swimmer-at-surface');
    await h.eval(`(__G.marine.input({ dive: true }), 1)`);
    await h.waitFor('__G.sealife.under && __G.sealife.camDepth > 1.5', 60000);
    await waitGame(1.5);   // (still holding C: on down towards the rocks)
    await h.eval(`({ ...__st(), depth: +__G.sealife.camDepth.toFixed(1), bream: +Math.min(...__G.sealife.sim.fish().filter(f => f.school === __BR).map(f => Math.hypot(f.x - __G.zCam.position.x, f.z - __G.zCam.position.z))).toFixed(1) })`);
    await h.shot('underwater-reef');
    await h.eval(`(__G.marine.aim(Math.PI * 0.7, -0.2), 1)`); await waitGame(1.2);
    await h.shot('underwater-reef-2');
    await h.eval(`(__G.marine.aim(Math.PI * 0.2, 0.6), 1)`); await waitGame(1.2);
    await h.shot('underwater-looking-up');
    await h.eval(`(__G.marine.input({ dive: false }), 1)`);
    await h.waitFor('!__G.sealife.under', 90000);
    await h.expect('!__G.sealife.under', 'back up at the surface');
  }

  if (want('jet')) {
    // the HORNET low (40 m) and fast over a fresh bait ball; the chase camera
    await h.eval(`(() => { window.__cam = null; const [x, z] = __P; __ball(x + 40, z + 30); return 1; })()`);
    await h.eval('(__G.toHeli(), 1)');
    await h.eval(`(() => { const T = __G.THREE; __G.H.reset(new T.Vector3(__P[0] - 140, 40, __P[1] - 100), 0, false, 1); __hold(40); return 1; })()`);
    await waitGame(30);   // the birds find it
    await h.eval('(clearInterval(__ap), 1)');
    await h.key('tap', 'Digit5'); await h.wait(500);
    await h.eval(`(() => { const J = __G.JP.J, B = __BB.prey; J.cat = null; const x = B.cx - 700, z = B.cz - 30, yaw = Math.atan2(-(B.cx - x), -(B.cz - z)); J.reset(x, 0, z, yaw, { running: true, airborne: true, alt: 40, speed: 140 }); for (const e of J.eng) e.n = 0.85;
      window.__alt = 40; __G.JP.autopilot = (J) => ({ pitch: Math.max(-1, Math.min(1, -J.vel.y * 0.03 + (__alt - J.pos.y) * 0.004)), roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.75, 0.75], brakeL: 0, brakeR: 0 }); window.__fl1 = __G.sealife.birds.stats.flushed; return 1; })()`);
    await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)');
    await h.waitFor(`Math.hypot(__G.JP.J.pos.x - __BB.prey.cx, __G.JP.J.pos.z - __BB.prey.cz) < 220`, 60000);
    await h.eval('__st()');
    await h.shot('jet-approaching-baitball');
    await h.waitFor(`Math.hypot(__G.JP.J.pos.x - __BB.prey.cx, __G.JP.J.pos.z - __BB.prey.cz) < 60 || __G.sealife.birds.stats.flushed > __fl1`, 60000);
    await waitGame(1);
    await h.shot('jet-over-baitball');
    await h.eval('({ flushed: __G.sealife.birds.stats.flushed - __fl1, alt: +__G.JP.J.pos.y.toFixed(0) })');
    await h.expect('__G.sealife.birds.stats.flushed > __fl1', 'the jet passing low flushes the birds');
    await h.eval('(__G.JP.autopilot = null, __G.toHeli(), 1)');
  }

  if (want('lcm')) {
    // an LCM-8 runs the M60 in to HOME ISLAND's beach; the tank's chase camera rides with it
    await h.eval('(window.__cam = null, __G.toHeli(), __G.armDelivery.runIn = 170, __G.G.mat = 300, __G.selIsl = __G.HOME_B.isl, __G.deliverArmour("m60"), __G.armDelivery.runs.length)');
    await h.expect('__G.armDelivery.runs.length >= 1', 'an LCM-8 on its way');
    await h.eval(`(() => { __G.crafts.control('m60', 2, 'foot'); const t = __G.m60C; if (t) { t.view = 'chase'; if (t.orbit) { t.orbit.yaw = 2.9; t.orbit.pitch = 0.32; } } const r = __G.armDelivery.runs[0], S = __G.sealife.sim, fx = -Math.sin(r.P.yaw), fz = -Math.cos(r.P.yaw);
      S.spawnSchool('mullet', r.pl.stop[0] - fx * 30, r.pl.stop[1] - fz * 30, true); S.spawnSchool('sardine', r.P.p.x + fx * 45, r.P.p.z + fz * 45, true); return { state: r.state }; })()`);
    await waitGame(14);
    await h.eval(`({ ...__st(), state: __G.armDelivery.runs[0].state })`);
    await h.shot('lcm-run-in');
    await waitGame(8);
    await h.shot('lcm-run-in-2');
    await h.eval('(__G.toHeli(), 1)');
  }

  if (want('fps')) {
    // the bait ball from the Huey (the heaviest scene for the life: fish, birds, signs); life on / off alternated
    await h.eval(`(() => { window.__cam = null; __G.toHeli(); __G.cockpitCam = false; const T = __G.THREE, [x, z] = __P; __G.H.reset(new T.Vector3(x - 60, 16, z), Math.atan2(-60, 0), false, 1); __hold(16); if (!window.__BB || __BB.prey.live < 20) __ball(x, z); return 1; })()`);
    await waitGame(20);
    await h.eval('(window.__blk = { on: [], off: [] }, 1)');
    // (suspend: no sim, no draw, the state kept - the ball and its birds are still there for the next 'on' block)
    for (const on of [true, false, true, false, true, false]) {
      await h.eval(`(__G.sealife.suspend = ${!on}, 1)`); await waitGame(on ? 1.5 : 0.6);
      await h.eval('__fps(40)'); await h.waitFor('__ft.length >= 40', 90000);
      await h.eval(`(__blk.${on ? 'on' : 'off'}.push(__fpsRes()), 1)`);
    }
    await h.eval(`(__G.sealife.suspend = false, 1)`);
    await h.eval('(() => { const med = a => a.map(r => r.avgMs).sort((x, y) => x - y)[1]; window.__fpsCmp = { on: med(__blk.on), off: med(__blk.off), simMs: [...__blk.on.map(r => r.simMs)].sort((x, y) => x - y)[1], fish: __blk.on[0].fish, birds: __blk.on[0].birds }; __fpsCmp.costMs = +(__fpsCmp.on - __fpsCmp.off).toFixed(1); return { ...__fpsCmp, blocks: __blk }; })()');
    await h.expect('__fpsCmp.simMs < 4', 'the life costs the CPU under 4 ms a frame (sim, birds, instance upload)');
    await h.eval('(clearInterval(__ap), 1)');
  }
}
