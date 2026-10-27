// RENDERKIT nature (ngc/depth-nature): first-person and low-helicopter views of the vegetation, ground detail, shores and
// cliffs, run per setting so the shots and frame times compare like for like.
//   RK=all NAT=high node snap.mjs scenes/depthnature.mjs        (RK=0: classic; RK=surface,world,fx,post,ui: kit without nature)
//   VIEWS=hq,forest,... runs a subset.  Camera scripted at render time (rkworld.mjs pattern); the helicopter is parked
// 40 m above the shot point so the terrain windows, streaming and haze follow it.
const RK = process.env.RK ?? 'all', NAT = process.env.NAT ?? 'high';
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
export default { name: 'depthnature-' + RK.replace(/[^\w]+/g, '_') + '-' + NAT, seed: 1980, query: `?debug&auto&kb&peace&res=0.6&sea=4&rk=${RK}&rknature=${NAT}`, run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 60000);
  await h.eval('(__G.G.bench=true,1)');
  await h.eval(`(() => {
    const g = __G, r = g.renderer, orig = r.render.bind(r), a = new g.THREE.Vector3(), b = new g.THREE.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__shotAt = (C) => { window.__cam = C; a.set(...C.wp); const H = g.H, y = a.y + 40; H.reset(a.clone().setY(y), 0, false, 1); g.cockpitCam = false;
      clearInterval(window.__hold); let prev = -1; window.__hold = setInterval(() => { if (g.war.time === prev) return; prev = g.war.time; H.pos.set(a.x, y, a.z); H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16); };
    // eye at (x, z), 1.7 m over the ground, looking at bearing ang (rad, 0 = +x) dip metres down at 40 m
    window.__eye = (x, z, ang, up = 1.7, dip = 0.6) => { const y = g.groundY(x, z) + up; return { wp: [x, y, z], wt: [x + Math.cos(ang) * 40, y - dip, z + Math.sin(ang) * 40] }; };
    window.__frames = null; const r2 = r.render; r.render = (sc, cam) => { r2(sc, cam); if (window.__frames && cam === g.zCam) window.__frames.push(performance.now()); };
    window.__sample = () => new Promise(res => { window.__frames = []; setTimeout(() => {
      const f = window.__frames; window.__frames = null; const d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((x, y) => x - y);
      const gl = r.getContext(), px = new Uint8Array(4), ds = []; for (let i = 0; i < 7; i++) { const t = performance.now(); orig(g.sealife.bedMesh.parent, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); } ds.sort((x, y) => x - y);
      res({ frames: d.length, frameMs50: d.length ? +d[d.length >> 1].toFixed(1) : null, drawMs50: +ds[3].toFixed(1), calls: r.info.render.calls, tris: r.info.render.triangles, nature: window.__nature ? window.__nature.stats() : null }); }, 4000); });
    return 1; })()`);
  const times = {};
  const view = async (name, camExpr, settle = 2500) => {
    if (!want(name)) return;
    await h.eval(`(__shotAt(${camExpr}),1)`);
    await h.wait(settle);
    if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
    await h.wait(1200);
    await h.shot(name); await h.notblank();
    times[name] = await h.eval('__sample()', name + '-frametime');
  };
  // the user's view (2026-10-27 screenshot): on foot at the home island HQ, looking past it to the trees on the hill
  await view('hq', `(() => { const g = __G, I = g.ISLANDS[0], s = I.structs.find(s => s.kind === 'hq') || { x: I.x, z: I.z }; const ang = Math.atan2(s.z - I.z, s.x - I.x) + 3.3, x = s.x + Math.cos(ang) * 28, z = s.z + Math.sin(ang) * 28; return __eye(x, z, Math.atan2(s.z - z, s.x - x), 1.7, 1.5); })()`);
  // forest edge: the nearest zone tree cluster, standing 14 m out of it, looking in
  await view('forest', `(() => { const g = __G, I = g.ISLANDS[0], T = g.GR && g.GR.trees || null; let best = null, bn = 0;
    const trees = window.__nature && __nature.zoneTrees ? __nature.zoneTrees : [];
    for (let k = 0; k < trees.length; k += 7) { const t = trees[k]; let n = 0; for (const u of trees) if (Math.abs(u.x - t.x) < 25 && Math.abs(u.z - t.z) < 25) n++; if (n > bn && Math.hypot(t.x - I.x, t.z - I.z) < 900) { bn = n; best = t; } }
    if (!best) best = { x: I.x + 60, z: I.z + 60 }; const ang = 0.7, x = best.x - Math.cos(ang) * 30, z = best.z - Math.sin(ang) * 30; window.__forestAt = best; return __eye(x, z, ang, 1.7, 1.0); })()`);
  // grassland: open grass on the home island, looking across it
  await view('grass', `(() => { const g = __G, I = g.ISLANDS[0]; for (let k = 0; k < 400; k++) { const a = k * 2.399, d = 40 + (k % 20) * 4, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = g.terrainH(x, z);
      if (y > 4 && y < 20 && g.terrainH(x + 30 * Math.cos(a), z + 30 * Math.sin(a)) > 3 && !g.PADS.some(p => Math.hypot(p.x - x, p.z - z) < 50)) return __eye(x, z, a, 1.7, 2.0); } return __eye(I.x + 50, I.z, 0); })()`);
  // beach on foot: at the top of a home island beach looking along the waterline
  await view('beach', `(() => { const g = __G, I = g.ISLANDS[0]; let best = null;
    for (let k = 0; k < 96 && !best; k++) { const ang = k / 96 * 6.283 + 0.8; for (let d = I.r * .4; d < I.r * 2; d += 2) { const x = I.x + Math.cos(ang) * d, z = I.z + Math.sin(ang) * d; if (g.terrainH(x, z) < 0) { if (g.terrainH(x + Math.cos(ang) * 30, z + Math.sin(ang) * 30) < -1.5 && Math.abs(g.terrainH(x - Math.cos(ang) * 14, z - Math.sin(ang) * 14) - 3) < 3) best = { x, z, ang }; break; } } }
    if (!best) best = { x: I.x + I.r, z: I.z, ang: 0 }; const c = Math.cos(best.ang), s = Math.sin(best.ang), x = best.x - c * 9, z = best.z - s * 9;
    return __eye(x, z, best.ang + 1.1, 1.7, 2.2); })()`);
  // a cliff: the steepest coast of any zone island, from a boat 60 m off
  await view('cliff', `(() => { const g = __G; let best = { s: 0 };
    for (const I of g.ISLANDS) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.283; let prev = null; for (let d = I.r * .6; d < I.r * 1.6; d += 2) { const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = g.terrainH(x, z); if (y < 0) { const s = (prev ?? 0); if (s > best.s) best = { s, x, z, a }; break; } prev = y; } }
    const c = Math.cos(best.a), s = Math.sin(best.a), x = best.x + c * 60 + s * 25, z = best.z + s * 60 - c * 25; window.__cliff = best; return { wp: [x, 4, z], wt: [best.x, best.s * 0.5, best.z] }; })()`);
  // helicopter heights over the home island
  await view('heli50', `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x + 120, 50, I.z + 140], wt: [I.x, 8, I.z] }; })()`);
  await view('heli200', `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x + 160, 200, I.z + 260], wt: [I.x, 0, I.z] }; })()`);
  // the mainland: a wild forest from the edge on foot, and from 150 m
  await view('wild150', `(() => { const g = __G, x = 2600, z = 900; return { wp: [x, g.groundY(x, z) + 150, z], wt: [x + 400, g.groundY(x + 400, z + 200), z + 200] }; })()`, 8000);
  // on foot at a wild forest edge near there: a streamed tree with open ground 25 m to its south-west
  await view('wildfoot', `(() => { const g = __G, N = window.__nature; let best = null;
    if (N) for (const [id, s] of N.forest.sources) { if (typeof id !== 'number' || best) continue; for (let i = 0; i < s.n && !best; i += 3) { const x = s.d[i * 8], z = s.d[i * 8 + 2], y = s.d[i * 8 + 1]; if (Math.hypot(x - 2800, z - 1000) > 700 || y < 8) continue;
      const ex = x - 22, ez = z - 22; let clear = true; for (let j = 0; j < s.n; j++) if (Math.hypot(s.d[j * 8] - ex, s.d[j * 8 + 2] - ez) < 9) { clear = false; break; } if (clear && g.groundY(ex, ez) > 4) best = { ex, ez }; } }
    if (!best) best = { ex: 2600, ez: 900 }; return __eye(best.ex, best.ez, 0.785, 1.7, 0.8); })()`, 4000);
  console.log('NATURE_TIMES ' + JSON.stringify({ rk: RK, nat: NAT, times }));
  await h.eval(`(${JSON.stringify(times)})`, 'frame-times');
  await h.eval('(clearInterval(__hold),window.__cam=null,1)');
}};
