// RenderKit surface frame-time A/B (ngc/rk-surface): main game on the carrier deck (Huey, parked jets, deck crew,
// island, escorts in view = the most RenderKit surface materials on screen), paused sim so only rendering varies.
// RK=0 | RK=surface. 120 rAF intervals after 20 warm-up frames, plus renderer.info for the frame.
//   RK=0 node snap.mjs scenes/rksurfperf.mjs --name rkperf-off ; RK=surface node snap.mjs scenes/rksurfperf.mjs --name rkperf-on
const RK = process.env.RK ?? 'surface', N = +(process.env.FRAMES || 120), XQ = process.env.XQ || '';   // XQ: extra query, e.g. &rkdetail=0
const SAMPLE = label => `(async () => { const ft = []; let lt = performance.now(), k = 0;
  await new Promise(res => { (function f(t) { if (k++ >= 20) ft.push(t - lt); lt = t; if (ft.length < ${N}) requestAnimationFrame(f); else res(); })(performance.now()); });
  const a = ft.slice().sort((x, y) => x - y), avg = a.reduce((s, x) => s + x, 0) / a.length, inf = __G.renderer.info;
  return { view: '${label}', rk: '${RK}${XQ}', avgMs: +avg.toFixed(1), p50Ms: +a[a.length >> 1].toFixed(1), p95Ms: +a[Math.floor(a.length * 0.95)].toFixed(1), calls: inf.render.calls, tris: inf.render.triangles, programs: inf.programs.length }; })()`;
export default async function (h) {
  await h.goto(`?debug&kb&peace&res=0.6&rk=${RK}${XQ}`);
  await h.waitFor('window.__G', 15000); await h.wait(600);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 15000); await h.wait(3000);
  await h.eval(`(document.getElementById('hud').style.visibility = 'hidden', true)`);
  await h.shot('deck_chase');
  await h.eval(SAMPLE('deck_chase'), 'perf');
  await h.key('tap', 'c'); await h.wait(1500); await h.shot('deck_view2');
  await h.eval(SAMPLE('deck_view2'), 'perf');
  // worst case for per-pixel material cost: the Huey filling the screen (orbit camera hook, as in hueymodel.mjs)
  await h.eval(`(() => { const G = __G, T = G.THREE, r = G.renderer, ship = G.cockpit.group.parent, cam = new T.PerspectiveCamera(35, 1, 0.1, 3000), t = new T.Vector3(), p = new T.Vector3(), orig = r.render.bind(r);
    r.render = (s, c) => { if (c !== G.zCam) return orig(s, c); ship.updateMatrixWorld(); t.set(0, 0.4, 1); ship.localToWorld(t); p.set(5.5, 1.2, -5.5); ship.localToWorld(p);
      cam.position.copy(p); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix(); return orig(s, cam); }; return true; })()`);
  await h.wait(1500); await h.shot('huey_fill');
  await h.eval(SAMPLE('huey_fill'), 'perf');
}
