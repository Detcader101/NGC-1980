// RenderKit surface calibration (ngc/rk-surface): under the game's own light rig (HemisphereLight 0xcfe6ff/0x4a5a34
// 0.9 + DirectionalLight 0xfff0d0 1.1 from (0.5, 1, 0.3)), render flat-shaded cubes with the legacy Lambert / Phong and
// the RenderKit role materials and read back the lit and shaded face colours. Proves the PBR roles keep the art's value.
//   node snap.mjs scenes/rkmatcheck.mjs
export default async function (h) {
  await h.goto('dev/renderkit.html?still');
  await h.wait(1500);
  await h.eval(`(async () => {
    const T = await import('three'), G = await import('../js/renderkit/gamemats.js');
    const r = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true }); r.setSize(64, 64, false);
    const out = {};
    const cases = {
      lambert: () => new T.MeshLambertMaterial({ color: 0x4b5320, flatShading: true }),
      phong14: () => new T.MeshPhongMaterial({ color: 0x4b5320, flatShading: true, shininess: 14 }),
      flat: () => new T.MeshStandardMaterial({ color: 0x4b5320, flatShading: true, ...G.ROLES.flat }),
      flatDetail: () => G.pbr(() => null, 0x4b5320, { flatShading: true, rk: { role: 'flat', detail: G.DETAIL.army } }),
      paint: () => new T.MeshStandardMaterial({ color: 0x4b5320, flatShading: true, ...G.ROLES.paint }),
    };
    for (const [k, f] of Object.entries(cases)) {
      const s = new T.Scene(); s.background = new T.Color(0);
      s.add(new T.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9)); const sun = new T.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); s.add(sun);
      const cam = new T.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(3, 2.2, 4); cam.lookAt(0, 0, 0);
      const m = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 1.6), f()); s.add(m); r.render(s, cam);
      const gl = r.getContext(), px = new Uint8Array(4), rd = (x, y) => { gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px.slice(0, 3)]; };
      out[k] = { top: rd(32, 46), front: rd(36, 22), side: rd(24, 22) };
    }
    // clipping check (renderer stays NoToneMapping): the brightest pixel of a sphere seen with the sun behind the
    // camera, light paint colours, legacy vs each role. 255 in any channel = clipped highlight.
    const peak = {};
    for (const [name, col] of [['white', 0xe8e9e6], ['ceramic', 0xe9e7e0], ['grey', 0xa7aaab]]) for (const [k, f] of Object.entries({
      lambert: () => new T.MeshLambertMaterial({ color: col }), phong22: () => new T.MeshPhongMaterial({ color: col, shininess: 22 }),
      paint: () => new T.MeshStandardMaterial({ color: col, ...G.ROLES.paint }), ceramic: () => new T.MeshStandardMaterial({ color: col, ...G.ROLES.ceramic }),
      flat: () => new T.MeshStandardMaterial({ color: col, ...G.ROLES.flat }) })) {
      const s = new T.Scene(); s.background = new T.Color(0);
      s.add(new T.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9)); const sun = new T.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); s.add(sun);
      const cam = new T.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0.5, 1, 0.3).multiplyScalar(4); cam.lookAt(0, 0, 0);
      s.add(new T.Mesh(new T.SphereGeometry(1, 48, 24), f())); r.render(s, cam);
      const gl = r.getContext(), buf = new Uint8Array(64 * 64 * 4); gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let mx = 0; for (let i = 0; i < buf.length; i += 4) mx = Math.max(mx, buf[i], buf[i + 1], buf[i + 2]); peak[name + '/' + k] = mx;
    }
    out.peak = peak; window.__mc = out; return out; })()`, 'calibration');
}
