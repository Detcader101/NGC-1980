// The lived-in world in the game: fly the Huey low over a town, a harbour and a road with traffic (chase and cockpit
// views), check the people and cars are there and that they run from a bang; then the faction structures on the
// islands: intact, damaged, destroyed, taken by the machines (RUNAWAY growth) and taken back.
export default {
  name: 'world',
  query: '?debug&auto&kb&peace&res=0.45',
  run: async h => {
    await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && window.__WORLD", 20000);
    const hover = (x, z, agl, yaw) => h.eval(`(() => { const G = __G, y = Math.max(G.groundY(${x}, ${z}), 0) + ${agl}; G.H.reset(new G.THREE.Vector3(${x}, y, ${z}), ${yaw}, false, 1); G.HI.setCollective(0.45);
      clearInterval(window.__hold); const ty = y; window.__hold = setInterval(() => { const H = G.H; if (!H.pos) return; const err = ty - H.pos.y; G.HI.setCollective(Math.max(0.2, Math.min(0.7, 0.45 + err * 0.02 - H.vel.y * 0.04))); }, 50); return Math.round(y); })()`);
    const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    const stats = l => h.eval(`(() => { const W = __WORLD; return { what: '${l}', fps: document.getElementById('dbg').textContent, ...W.stats, amb: W.ambient.stats, calls: __G.renderer.info.render.calls, tris: __G.renderer.info.render.triangles }; })()`);
    // ---- a town in the wild lands, low and slow
    await h.eval(`(() => { const W = __WORLD, ss = W.net.settlementsNear(3600, 1200, 5000).filter(s => s.size !== 'hamlet').sort((a, b) => (b.size === 'town') - (a.size === 'town') || Math.hypot(a.x - 3600, a.z - 1200) - Math.hypot(b.x - 3600, b.z - 1200)); window.__T = ss[0]; return { id: ss[0].id, size: ss[0].size, x: Math.round(ss[0].x), z: Math.round(ss[0].z) }; })()`);
    const T = await h.eval('({ x: __T.x, z: __T.z })');
    await hover(T.x + 70, T.z + 90, 28, face(T.x + 70, T.z + 90, T.x, T.z));
    await h.waitFor('__WORLD.stats.chunks > 6 && __WORLD.stats.pending === 0', 30000); await h.wait(4000);
    await stats('town'); await h.shot('town-chase'); await h.notblank();
    await h.expect('__WORLD.ambient.stats.people > 0');
    await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1500); await h.shot('town-cockpit'); await h.eval('(__G.cockpitCam = false, 1)');
    // down in the street: hover low beside a walker, looking along the road
    await h.eval(`(() => { const p = __WORLD.ambient.people.filter(p => p.state === 'walk').sort((a, b) => Math.hypot(a.x - __T.x, a.z - __T.z) - Math.hypot(b.x - __T.x, b.z - __T.z))[0]; window.__P = p ? { x: p.x, z: p.z, yaw: p.yaw } : { x: __T.x, z: __T.z, yaw: 0 }; return __P; })()`);
    const PW = await h.eval('__P');
    await hover(PW.x - Math.sin(PW.yaw) * 22, PW.z - Math.cos(PW.yaw) * 22, 7, Math.atan2(-Math.sin(PW.yaw), -Math.cos(PW.yaw)));
    await h.wait(1500); await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1200); await h.shot('street-cockpit'); await h.eval('(__G.cockpitCam = false, 1)'); await h.wait(800); await h.shot('street-chase');
    // a bang in the street: the people run for their doors
    await h.eval(`(() => { const p = __WORLD.ambient.people.find(p => p.state === 'walk') || __WORLD.ambient.people[0]; window.__bang = p ? { x: p.x, z: p.z } : { x: __T.x, z: __T.z }; __G.fx.explode(__bang.x + 12, __G.groundY(__bang.x + 12, __bang.z) + 1, __bang.z, 1.2, { fire: 20 }); return __bang; })()`);
    await h.wait(1200);
    await h.eval(`({ fleeing: __WORLD.ambient.people.filter(p => p.state === 'flee').length, inside: __WORLD.ambient.people.filter(p => p.state === 'inside').length, walking: __WORLD.ambient.people.filter(p => p.state === 'walk').length })`);
    await h.expect(`__WORLD.ambient.people.filter(p => Math.hypot(p.x - __bang.x, p.z - __bang.z) < 150 && p.state === 'walk').length === 0`);
    await h.shot('town-after-bang');
    // ---- a main road with traffic
    await h.eval(`(() => { const R = __WORLD.net.netState.roads.filter(R => R.kind === 'link' && R.type === 'tarmac' && Math.hypot(R.xs[0] - __T.x, R.zs[0] - __T.z) < 3000).sort((a, b) => b.len - a.len)[0]; const i = Math.floor(R.xs.length * 0.35); window.__R = { x: R.xs[i], z: R.zs[i], dx: R.xs[i + 1] - R.xs[i], dz: R.zs[i + 1] - R.zs[i] }; return window.__R; })()`);
    const R = await h.eval('__R');
    await hover(R.x - R.dz * 4 - R.dx * 6, R.z + R.dx * 4 - R.dz * 6, 14, Math.atan2(-R.dx, -R.dz));
    await h.waitFor('__WORLD.stats.pending === 0 && __WORLD.ambient.stats.cars > 2', 40000); await h.wait(6000);
    await stats('road'); await h.shot('road-chase');
    // pull alongside the nearest car and watch it go by
    await h.eval(`(() => { const H = __G.H.pos, c = __WORLD.ambient.cars.filter(c => !c.wreck).sort((a, b) => Math.hypot(a.x - H.x, a.z - H.z) - Math.hypot(b.x - H.x, b.z - H.z))[0]; if (!c) return null; const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); window.__C = { x: c.x + fx * (25 + c.v * 2.2) - fz * 12, z: c.z + fz * (25 + c.v * 2.2) + fx * 12, tx: c.x, tz: c.z, kind: c.kind, v: c.v }; return __C; })()`);
    const C = await h.eval('__C');
    if (C) { await hover(C.x, C.z, 7, face(C.x, C.z, C.tx, C.tz)); await h.wait(900); await h.shot('road-car-chase'); await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1000); await h.shot('road-car-cockpit'); await h.eval('(__G.cockpitCam = false, 1)'); }
    // ---- a harbour
    await h.eval(`(() => { const W = __WORLD; const ss = W.net.settlementsNear(3600, 1200, 9000).filter(s => s.layout && s.layout.quay).sort((a, b) => Math.hypot(a.x - 3600, a.z - 1200) - Math.hypot(b.x - 3600, b.z - 1200)); const q = ss[0].layout.quay; window.__Q = { x: q.x, z: q.z, a: q.a }; return window.__Q; })()`);
    const Q = await h.eval('__Q');
    const hx = Q.x + Math.cos(Q.a) * 70 + Math.cos(Q.a + 1.57) * 30, hz = Q.z + Math.sin(Q.a) * 70 + Math.sin(Q.a + 1.57) * 30;
    await hover(hx, hz, 22, face(hx, hz, Q.x, Q.z));
    await h.waitFor('__WORLD.stats.pending === 0', 30000); await h.wait(5000);
    await stats('harbour'); await h.shot('harbour-chase');
    // ---- the control zone: HOME ISLAND's village, then the structures on a few islands
    await h.eval('(__G.war.carrier && 1)');
    await h.eval(`(() => { const s = __WORLD.zone.find(e => e.I.name === 'HOME ISLAND'); const d = s.items.find(i => i.t === 'house' || i.t === 'cottage'); window.__V = { x: d ? d.x : s.x, z: d ? d.z : s.z }; return window.__V; })()`);
    const V = await h.eval('__V');
    await hover(V.x + 45, V.z - 40, 25, face(V.x + 45, V.z - 40, V.x, V.z)); await h.wait(4000);
    await stats('home village'); await h.shot('zone-home-village');
    const struct = async (island, kind, label) => {
      await h.eval(`(() => { const I = __G.ISLANDS.find(I => I.name === '${island}'), s = I.structs.find(s => s.kind === '${kind}'); window.__S = s; window.__I = I; return { x: Math.round(s.x), z: Math.round(s.z), side: s.side }; })()`);
      const S = await h.eval('({ x: __S.x, z: __S.z })');
      await hover(S.x + 26, S.z + 30, 16, face(S.x + 26, S.z + 30, S.x, S.z)); await h.wait(2500); await h.shot(label);
    };
    await struct('PELICAN', 'hq', 'ours-hq'); await struct('PELICAN', 'fuel', 'ours-fuel');
    await struct('FORGE', 'factory', 'neutral-depot'); await struct('LOOKOUT', 'radar', 'neutral-radar');
    await struct('ANVIL', 'factory', 'runaway-fabricator'); await struct('ANVIL', 'hq', 'runaway-hq');
    await struct('NORTH ROCK', 'fuel', 'runaway-siphon');
    // damage and destroy one of ours
    await struct('PELICAN', 'fuel', 'ours-fuel-again');
    await h.eval('(__G.war.damage(__S, __S.max * 0.6, 2), __S.mesh.userData.state.cond)');
    await h.wait(2500); await h.shot('ours-fuel-damaged');
    await h.eval('(__G.war.damage(__S, __S.max, 2), __S.dead)'); await h.expect('__S.dead && __S.mesh.visible');
    await h.wait(3500); await h.shot('ours-fuel-destroyed');
    // the machines take FORGE: their fabricator grows over the depot's ruins, the pylons go up
    await struct('FORGE', 'factory', 'forge-before');
    await h.eval(`(__G.war.setOwner(__I, 2, 'TEST'), __S.mesh.userData.state.style)`); await h.wait(3500); await h.shot('forge-runaway-growing');
    await h.wait(9000); await h.shot('forge-runaway-grown');
    await h.eval(`(__G.war.setOwner(__I, 1, 'TEST'), __S.mesh.userData.state.style)`); await h.wait(4000); await h.shot('forge-retaken');
    await h.eval('(clearInterval(window.__hold), 1)');
  },
};
