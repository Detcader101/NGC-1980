// shadow-pass draw-call census: draws issued by one world render with the near / far maps re-rendered or reused
export default { name: 'rklight-calls', query: '?debug&auto&kb&peace&res=0.6&sea=3' + (process.env.Q || ''), run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 120000);
  await h.eval(`(() => { const g = __G, r = g.renderer, gl = r.getContext(); window.__dc = 0; for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const f = gl[k].bind(gl); gl[k] = (...a) => { window.__dc++; return f(...a); }; }
    const orig = r.render.bind(r); window.__orig = orig; r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { cam.position.set(...C.wp); cam.lookAt(...C.wt); cam.updateMatrixWorld(); if (g.rkLight) g.rkLight.follow(cam); } orig(sc, cam); };
    window.__count = () => { const sc = g.sealife.bedMesh.parent, L = g.rkLight, out = {}; const run = (k, a, b) => { if (L) { L.cascades[0].S.needsUpdate = a; L.cascades[1].S.needsUpdate = b; } window.__dc = 0; orig(sc, g.zCam); out[k] = window.__dc; };
      run('both', true, true); run('near', true, false); run('none', false, false); return out; }; return 1; })()`);
  const views = {
    deck: `(() => { const c = __G.war.carrier.p; return { wp: [c.x + 40, c.y + 26, c.z + 40], wt: [c.x, c.y + 8, c.z] }; })()`,
    home200: `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x + 160, 200, I.z + 260], wt: [I.x, 0, I.z] }; })()`,
    pad: `(() => { const P = __G.PAD; return { wp: [P.x + 20, P.h + 1.8, P.z + 14], wt: [P.x - 20, P.h + 2, P.z - 10] }; })()`,
    town: `(() => { const P = __G.PAD; return { wp: [P.x + 45, P.h + 35, P.z + 55], wt: [P.x - 30, P.h, P.z - 40] }; })()`,
  };
  const res = {};
  for (const [k, v] of Object.entries(views)) { await h.eval(`(window.__cam = ${v}, 1)`); await h.wait(2500); res[k] = await h.eval('__count()', k); }
  await h.eval(`(${JSON.stringify(res)})`, 'calls');
}};
