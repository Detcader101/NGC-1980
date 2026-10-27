// ngc/depth-materials quick look (fast iteration; the dev page's plain hemisphere + sun, not the game's full lighting):
// the HQ site, a sandbag wall and a street of houses drawn into the page and screenshotted. RK=0|all, XQ=extra query.
//   from tools/: node snap.mjs scenes/depthlook.mjs --name look ; RK=0 node snap.mjs scenes/depthlook.mjs --name look-off
const RK = process.env.RK ?? 'all', XQ = process.env.XQ || '';
const VIEWS = { hq_close: [3, 1.7, 15, 0, 1.2, 4], hq_wall: [1.5, 1.6, 9.5, 0, 1.5, 5], bags: [0.5, 1.3, 2.6, 0, 1.1, 0], town: [0, 1.7, 12, 0, 3, -6], roof: [2, 9, 4, 0, 7, -6], hq_30m: [12, 6, 30, 0, 2, 0], tarmac: [0, 1.7, 9, 0, 0, 2] };
export default async function (h) {
  await h.goto(`dev/renderkit.html?still&rk=${RK}${XQ}`);
  await h.wait(1500);
  await h.eval(`(async () => {
    const T = await import('three');
    const { buildFactionStructure, setStructGround } = await import('../js/world/structures.js');
    const { Geo, col } = await import('../js/world/kit.js');
    const { worldMaterial, geoFrom } = await import('../js/world/gfx.js');
    const { worldSurface } = await import('../js/renderkit/gamemats.js');
    setStructGround(() => 0);
    const r = new T.WebGLRenderer({ antialias: true }); r.setSize(1280, 720, false); r.setPixelRatio(1);
    const c = r.domElement; c.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:99'; document.body.appendChild(c);
    const s = new T.Scene(); s.background = new T.Color(0x9fb6c8);
    s.add(new T.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9)); const sun = new T.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); s.add(sun);
    const hq = buildFactionStructure('hq', 1); s.add(hq);
    const g = new Geo(); for (let k = 0; k < 4; k++) for (let i = 0; i < 8; i++) g.box(-2 + i * 0.62 + (k % 2) * 0.31, k * 0.3, 0, 0.58, 0.3, 0.4, i % 3 ? col(0x9c9070) : col(0x8a8064), 1);
    const bags = new T.Mesh(geoFrom(g.build()), worldSurface(() => worldMaterial())); bags.position.set(0, 0, 1); s.add(bags);
    const t = new Geo(); for (let i = 0; i < 6; i++) { t.box(-12 + i * 4.2, 0, -6, 4, 6, 6, col([0xe9e5da, 0x9a523e, 0xdcc0a8][i % 3]), 1); t.gable(-12 + i * 4.2, 6, -6, 4, 6, 2.4, col(i % 2 ? 0xa3553b : 0x4b515b), col(0xe9e5da)); }
    t.box(0, -0.1, 4, 40, 0.1, 8, col(0x4c4d50), 1); t.box(0, 0, 4, 40, 0.01, 0.12, col(0xe8e6dc), 1);
    const town = new T.Mesh(geoFrom(t.build()), worldMaterial()); town.position.set(0, 0, -40); s.add(town);
    const ground = new T.Mesh(new T.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x4a6a34 })); ground.position.y = -0.02; s.add(ground);
    const cam = new T.PerspectiveCamera(62, 1280 / 720, 0.1, 600), V = ${JSON.stringify(VIEWS)};
    window.__look = k => { const v = V[k], o = ['town', 'roof', 'tarmac'].includes(k) ? [0, 0, -40] : k === 'bags' ? [0, 0, 1] : [0, 0, 0];
      cam.position.set(v[0] + o[0], v[1] + o[1], v[2] + o[2]); cam.lookAt(v[3] + o[0], v[4] + o[1], v[5] + o[2]); r.render(s, cam); return k; };
    return true; })()`, 'setup');
  for (const k of Object.keys(VIEWS)) { await h.eval(`__look('${k}')`); await h.wait(300); await h.shot(k); }
}
