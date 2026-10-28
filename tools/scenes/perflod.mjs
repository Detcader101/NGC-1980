// ngc/perf-render: renderkit/lod.js self-test in the game. A two-level model (LOD0 red, LOD1 blue, switch at 60 m) is
// put on the open sea and looked at from 40 m (LOD0 only), 60 m (the cross-fade band: both levels, complementary
// screen doors) and 90 m (LOD1 only). In the band the two levels must cover the box together with no holes and no
// double draw: the box centre's pixels are all red or blue (none sky / sea), some of each.
//   node snap.mjs scenes/perflod.mjs
export default { name: 'perflod', seed: 1980, query: '?debug&auto&kb&peace&res=0.5&rkpost=off&shadows=off', run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 90000);
  await h.eval(`(async () => {
    const g = __G, T = g.THREE, { createLOD, updateLODs } = await import('/js/renderkit/lod.js'), sc = g.sealife.bedMesh.parent;
    const root = new T.Group(); root.name = 'lod-test'; const c = g.war.carrier.p, x = c.x + 600, z = c.z + 600; root.position.set(x, 8, z);
    const box = col => new T.Mesh(new T.BoxGeometry(6, 6, 6), new T.MeshBasicMaterial({ color: col, fog: false }));
    const a = box(0xff0000), b = box(0x0000ff); root.add(a, b); sc.add(root);
    window.__lt = { root, L: createLOD(root, [{ object: a, far: 60 }, { object: b }]), x, z };
    const r = g.renderer, orig = r.render.bind(r);
    r.render = (s, cam) => { const C = window.__cam; if (C && cam === g.zCam) { cam.position.set(...C.wp); cam.lookAt(...C.wt); cam.updateMatrixWorld(); updateLODs(cam); } orig(s, cam); if (C && cam === g.zCam && window.__want) { window.__got = window.__px(); window.__want = false; } };
    window.__px = () => { const gl = r.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, n = 24, px = new Uint8Array(n * n * 4);
      gl.readPixels((w >> 1) - n / 2, (hh >> 1) - n / 2, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px); let red = 0, blue = 0, other = 0;
      for (let i = 0; i < px.length; i += 4) { if (px[i] > 150 && px[i + 2] < 90) red++; else if (px[i + 2] > 150 && px[i] < 90) blue++; else other++; } return { red, blue, other }; };
    return 1; })()`);
  // (__px reads the box centre right after the world render, in the same task)
  const at = async (d, name) => {
    await h.eval(`(window.__cam = { wp: [__lt.x + ${d}, 8, __lt.z], wt: [__lt.x, 8, __lt.z] }, 1)`);
    await h.wait(1500); await h.shot(name);
    return h.eval(`new Promise(res => { window.__want = true; const t = setInterval(() => { if (!window.__want) { clearInterval(t); res({ px: window.__got, on: __lt.L.levels.map(l => l.on) }); } }, 50); })`, name);
  };
  const near = await at(40, 'lod0-40m'), band = await at(60, 'band-60m'), far = await at(90, 'lod1-90m');
  await h.expect(`${near.on[0] && !near.on[1]}`, 'at 40 m only LOD0 is on');
  await h.expect(`${band.on[0] && band.on[1]}`, 'at 60 m (the band) both levels are on');
  await h.expect(`${!far.on[0] && far.on[1]}`, 'at 90 m only LOD1 is on');
  await h.expect(`${band.px.other === 0 && band.px.red > 0 && band.px.blue > 0 && near.px.red === 576}`, 'in the band the two screen doors cover the box together: no hole, both levels showing');
  h.log('note', JSON.stringify({ near, band, far }));
  await h.eval('(window.__cam = null, 1)');
}};
