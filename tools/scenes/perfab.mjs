// ngc/perf-render A/B: the same scripted views (camera set at render time, the rkworld.mjs pattern) in two page loads,
// A = AQ query, B = BQ query; per view a screenshot, the draw calls / triangles of one whole frame (every pass) and
// the shadow passes' share, and a drained frame time (median of 5 frames, SwiftShader: relative only).
//   AQ='merge=0' BQ='' TAG=merge VIEWS=hard,deck node snap.mjs scenes/perfab.mjs
// Pictures: tools/runs/<run>/<A|B>-<view>.png; numbers: the PERFAB line in the log and result.json evals.
const AQ = process.env.AQ ?? '', BQ = process.env.BQ ?? '', TAG = process.env.TAG || 'ab';
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
const BASE = '?debug&auto&kb&peace&res=0.6&sea=3';
export default { name: 'perfab-' + TAG, seed: 1980, query: BASE + (AQ ? '&' + AQ : ''), run: async h => {
  const out = {};
  for (const [side, q] of [['A', AQ], ['B', BQ]].filter(([s]) => !process.env.ONLY || process.env.ONLY === s)) {
    if (side === 'B') await h.goto(BASE + (q ? '&' + q : ''));
    await h.waitFor("window.__G && __G.G.state==='play'", 90000);
    await h.eval('(__G.G.bench=true,1)');
    await h.eval(`(() => {
      const g = __G, r = g.renderer, orig = r.render.bind(r), a = new g.THREE.Vector3(), b = new g.THREE.Vector3();
      r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); if (g.rkLight) g.rkLight.follow(cam); } orig(sc, cam); };
      window.__shotAt = C => { window.__cam = C; a.set(...C.wp); const H = g.H, y = Math.max(a.y + (C.hover ?? 40), g.groundY(a.x, a.z) + 30); H.reset(a.clone().setY(y), 0, false, 1); g.cockpitCam = false;
        clearInterval(window.__hold); let prev = -1; window.__hold = setInterval(() => { if (g.war.time === prev) return; prev = g.war.time; H.pos.set(a.x, y, a.z); H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16); };
      const SM = r.shadowMap, smr = SM.render; let sh = 0; SM.render = function (...x) { const c = r.info.render.calls; const o = smr.apply(this, x); sh += r.info.render.calls - c; return o; };
      // draws by owner (the top-level object under the scene): which model the A/B difference comes from
      let by = null; const rbd = r.renderBufferDirect;
      r.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) { if (by) { let t = obj; while (t.parent && t.parent.parent) t = t.parent; const k = t.name || t.type; const t0 = r.info.render.triangles; const o = rbd.apply(this, arguments); const e = by[k] || (by[k] = [0, 0]); e[0]++; e[1] += r.info.render.triangles - t0; return o; } return rbd.apply(this, arguments); };
      // two whole game frames (the far shadow cascade renders every other frame): reset in one rAF, read two later
      window.__frame = () => new Promise(res => { requestAnimationFrame(() => { r.info.autoReset = false; r.info.reset(); sh = 0; by = {};
        requestAnimationFrame(() => requestAnimationFrame(() => { const o = { calls: r.info.render.calls / 2, tris: Math.round(r.info.render.triangles / 2), shadowCalls: sh / 2, programs: r.info.programs.length, geometries: r.info.memory.geometries, by }; by = null; r.info.autoReset = true; res(o); })); }); });
      // drained frame time: whole frames with a 1-pixel readback before and after (median of 5)
      window.__drained = () => new Promise(res => { const gl = r.getContext(), px = new Uint8Array(4), ds = []; let t = 0;
        const step = () => { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (t) ds.push(performance.now() - t);
          if (ds.length >= 6) { ds.shift(); ds.sort((x, y) => x - y); return res(+ds[2].toFixed(1)); } requestAnimationFrame(() => { t = performance.now(); setTimeout(step, 0); }); };
        requestAnimationFrame(() => { t = 0; step(); }); });
      return 1; })()`);
    const V = {};
    const view = async (name, camExpr, settle = 2500) => {
      if (!want(name)) return;
      await h.eval(`(__shotAt(${camExpr}),1)`);
      await h.wait(settle);
      if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
      await h.wait(1500);
      await h.shot(`${side}-${name}`);
      V[name] = await h.eval('__frame()', `${side}-${name}-frame`);
      V[name].ms = await h.eval('__drained()', `${side}-${name}-ms`);
    };
    const I0 = 'const g = __G, I = g.HOME_B.isl || g.ISLANDS[0], P = g.PAD';
    await view('hq', `(() => { ${I0}; const s = I.structs.find(s => s.kind === 'hq') || { x: I.x, z: I.z }; const ang = Math.atan2(s.z - I.z, s.x - I.x) + 3.3, x = s.x + Math.cos(ang) * 28, z = s.z + Math.sin(ang) * 28, y = g.groundY(x, z) + 1.7; return { wp: [x, y, z], wt: [s.x, y + 0.3, s.z], hover: 60 }; })()`);
    await view('pad', `(() => { ${I0}; return { wp: [P.x + 38, P.h + 22, P.z + 30], wt: [P.x, P.h, P.z] }; })()`);
    await view('hard', `(() => { ${I0}; const H = g.HARDS.find(h => h.I === I) || g.HARDS[0], [x, z] = H.at(H.u1 - 2, 0), [x2, z2] = H.at(H.u1 + 14, 9); const y = g.groundY(x2, z2); return { wp: [x2, y + 3, z2], wt: [x, H.y(H.u1 - 2), z] }; })()`);
    await view('tank', `(() => { const g = __G, o = g.m60C.fm.origin(); return { wp: [o[0] + 9, o[1] + 3.2, o[2] + 7], wt: [o[0], o[1] + 1.2, o[2]] }; })()`);
    await view('m113', `(() => { const g = __G, o = g.m113C.fm.origin(); return { wp: [o[0] + 8, o[1] + 3, o[2] - 6], wt: [o[0], o[1] + 1, o[2]] }; })()`);
    await view('jeep', `(() => { const g = __G, c = g.carC, o = c.fm ? c.fm.origin?.() : null, p = o ? { x: o[0], y: o[1], z: o[2] } : (c.model?.group || c.V?.model?.group)?.position || { x: 0, y: 0, z: 0 }; return { wp: [p.x + 6, p.y + 2.5, p.z + 5], wt: [p.x, p.y + 0.8, p.z] }; })()`);
    await view('deck', `(() => { const c = __G.war.carrier.p; return { wp: [c.x + 40, c.y + 26, c.z + 40], wt: [c.x, c.y + 8, c.z] }; })()`);
    await view('home200', `(() => { ${I0}; return { wp: [I.x + 160, 200, I.z + 260], wt: [I.x, 0, I.z] }; })()`);
    await view('jet1200', `(() => { ${I0}; return { wp: [I.x - 900, 1200, I.z - 900], wt: [I.x + 600, 0, I.z + 600], hover: -400 }; })()`, 5000);
    out[side] = V;
    await h.eval('(clearInterval(__hold),window.__cam=null,1)');
  }
  // per owner: draw calls A -> B where they differ (the attribution of the change)
  const diff = (a, b) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = a[k] || [0, 0], y = b[k] || [0, 0]; if (x[0] !== y[0]) o[k] = `${x[0]}->${y[0]} calls, ${Math.round(x[1] / 100) / 10}k->${Math.round(y[1] / 100) / 10}k tris`; } return o; };
  const rows = Object.keys(out.A).map(k => { const A = out.A[k], B = out.B?.[k] || { by: {} }, d = diff(A.by, B.by); delete A.by; delete B.by; return { view: k, A, B, owners: d }; });
  console.log('PERFAB ' + JSON.stringify({ tag: TAG, A: AQ, B: BQ, rows }));
  await h.eval(`(${JSON.stringify({ A: AQ, B: BQ, rows })})`, 'perfab');
}};
