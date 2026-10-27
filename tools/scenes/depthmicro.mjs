// ngc/depth-materials GPU micro-benchmark: world surfaces filling a 960x540 view under the game's light rig, rendered N
// times with a readPixels sync after each (GPU / raster time, not rAF pacing). The HQ site close (sandbags, concrete,
// berm), the same at 30 m, a sandbag wall filling the screen, and the Huey (unit detail). Compare
//   RK=0 | RK=all | RK=all XQ='&rkdetail=1' (medium) | RK=all XQ='&rkdetail=0' (PBR roles, no detail)
//   node snap.mjs scenes/depthmicro.mjs --name dmicro-on ; RK=0 node snap.mjs scenes/depthmicro.mjs --name dmicro-off
const RK = process.env.RK ?? 'all', XQ = process.env.XQ || '', N = +(process.env.FRAMES || 30);
export default async function (h) {
  await h.goto(`dev/renderkit.html?still&rk=${RK}${XQ}`);
  await h.wait(1500);
  await h.eval(`(async () => {
    const T = await import('three');
    const { buildFactionStructure, setStructGround } = await import('../js/world/structures.js');
    const { buildHueyMesh } = await import('../js/hueymodel.js');
    const { Geo, col } = await import('../js/world/kit.js');
    const { worldMaterial, geoFrom } = await import('../js/world/gfx.js');
    const { worldSurface } = await import('../js/renderkit/gamemats.js');
    setStructGround(() => 0);
    const r = new T.WebGLRenderer({ antialias: false }); r.setSize(960, 540, false); r.setPixelRatio(1);
    const gl = r.getContext(), px = new Uint8Array(4), out = { rk: '${RK}${XQ}' };
    const bagWall = () => { const g = new Geo(); for (let k = 0; k < 8; k++) for (let i = 0; i < 14; i++) g.box(-4 + i * 0.62 + (k % 2) * 0.31, k * 0.3, 0, 0.58, 0.3, 0.4, i % 3 ? col(0x9c9070) : col(0x8a8064), 1);
      return new T.Mesh(geoFrom(g.build()), worldSurface(() => worldMaterial())); };
    const town = () => { const g = new Geo(); for (let i = 0; i < 6; i++) { g.box(-12 + i * 4.2, 0, -6, 4, 6, 6, col([0xe9e5da, 0x9a523e, 0xdcc0a8][i % 3]), 1); g.gable(-12 + i * 4.2, 6, -6, 4, 6, 2.4, col(i % 2 ? 0xa3553b : 0x4b515b), col(0xe9e5da)); }
      g.box(0, -0.1, 4, 40, 0.1, 8, col(0x4c4d50), 1); return new T.Mesh(geoFrom(g.build()), worldMaterial()); };
    const units = {
      hq_close: [() => buildFactionStructure('hq', 1), [3, 1.7, 15], [0, 1.2, 4]],
      hq_30m: [() => buildFactionStructure('hq', 1), [12, 6, 30], [0, 2, 0]],
      bags: [bagWall, [0.5, 1.3, 2.6], [0, 1.1, 0]],
      town: [town, [0, 1.7, 12], [0, 3, -6]],
      huey: [() => buildHueyMesh().group, [5.5, 1.0, -6.5], [0, 0.3, 0.5]],
    };
    for (const [k, [mk, eye, at]] of Object.entries(units)) {
      const s = new T.Scene(); s.background = new T.Color(0x9fb6c8);
      s.add(new T.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9)); const sun = new T.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); s.add(sun);
      let m = mk(); if (m.group) m = m.group; s.add(m);
      const cam = new T.PerspectiveCamera(62, 960 / 540, 0.1, 400); cam.position.set(...eye); cam.lookAt(...at);
      for (let i = 0; i < 5; i++) { r.render(s, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }   // compile + warm
      const t0 = performance.now();
      for (let i = 0; i < ${N}; i++) { r.render(s, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      out[k + 'Ms'] = +((performance.now() - t0) / ${N}).toFixed(2);
      if (k !== 'huey') { const c = r.domElement; c.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px;z-index:99'; document.body.appendChild(c); r.render(s, cam); window.__lastK = k; }
    }
    out.programs = r.info.programs.length; window.__micro = out; return out; })()`, 'micro');
  await h.shot('last_world_unit');
}
