// RenderKit surface GPU micro-benchmark (ngc/rk-surface): one unit model filling a 960x540 view under the game's
// light rig, rendered N times with a readPixels sync after each (so the time is the GPU/raster work, not rAF pacing),
// with ?rk=0 (legacy Lambert/Phong) or RK on (and &rkdetail=0: PBR roles without the procedural noise).
//   RK=0 node snap.mjs scenes/rksurfmicro.mjs ; RK=surface node snap.mjs scenes/rksurfmicro.mjs ; RK=surface XQ='&rkdetail=0' ...
const RK = process.env.RK ?? 'surface', XQ = process.env.XQ || '', N = +(process.env.FRAMES || 40);
export default async function (h) {
  await h.goto(`dev/renderkit.html?still&rk=${RK}${XQ}`);
  await h.wait(1500);
  await h.eval(`(async () => {
    const T = await import('three');
    const { buildHueyMesh } = await import('../js/hueymodel.js');
    const { buildJetMesh } = await import('../js/jetmodel.js');
    const { buildM60A3Mesh } = await import('../js/units/armor/tankmodel.js');
    const r = new T.WebGLRenderer({ antialias: false }); r.setSize(960, 540, false); r.setPixelRatio(1);
    const gl = r.getContext(), px = new Uint8Array(4), out = { rk: '${RK}${XQ}' };
    const units = { huey: [() => buildHueyMesh().group, [5.5, 1.0, -6.5], [0, 0.3, 0.5]], hornet: [() => buildJetMesh(1, 0).group, [7, 2.2, -8], [0, 0, -1]],
      m60: [() => buildM60A3Mesh().root || buildM60A3Mesh(), [6.5, 3.2, -6.5], [0, 1.2, 0]] };
    for (const [k, [mk, eye, at]] of Object.entries(units)) {
      const s = new T.Scene(); s.background = new T.Color(0x9fb6c8);
      s.add(new T.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9)); const sun = new T.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); s.add(sun);
      let m = mk(); if (m.group) m = m.group; s.add(m);
      const cam = new T.PerspectiveCamera(50, 960 / 540, 0.1, 200); cam.position.set(...eye); cam.lookAt(...at);
      for (let i = 0; i < 5; i++) { r.render(s, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }   // compile + warm
      const t0 = performance.now();
      for (let i = 0; i < ${N}; i++) { r.render(s, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      out[k + 'Ms'] = +((performance.now() - t0) / ${N}).toFixed(2);
    }
    out.programs = r.info.programs.length; window.__micro = out; return out; })()`, 'micro');
}
