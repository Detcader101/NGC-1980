// ngc/depth-materials: the user's "roblox low tech" views, RK=0 vs RK on. First person on foot at the home-island HQ
// by the helipad and sandbags (the user's screenshot), near (2-5 m) and mid (~30 m); the carrier deck close up; a town
// street (dev/world.html). RK=0|all (default all), PART=base,deck,town (default all), Q=extra query (e.g. &rkdetail=1).
//   from tools/: RK=0 node snap.mjs scenes/depthmat.mjs --name dm-off ; node snap.mjs scenes/depthmat.mjs --name dm-on
const RK = process.env.RK ?? 'all', PART = (process.env.PART || 'all').split(','), Q = process.env.Q || '';
const want = p => PART.includes('all') || PART.includes(p);
// PERF=N: also time N rAF frames at the base views (frame time on this machine's SwiftShader: compare runs, not absolutes)
const PERF = +(process.env.PERF || 0);
const SAMPLE = label => `(async () => { const ft = []; let lt = performance.now(), k = 0;
  await new Promise(res => { (function f(t) { if (k++ >= 8) ft.push(t - lt); lt = t; if (ft.length < ${PERF}) requestAnimationFrame(f); else res(); })(performance.now()); });
  const a = ft.slice().sort((x, y) => x - y), avg = a.reduce((s, x) => s + x, 0) / a.length, inf = __G.renderer.info;
  return { view: '${label}', rk: '${RK}${Q}', avgMs: +avg.toFixed(1), p50Ms: +a[a.length >> 1].toFixed(1), calls: inf.render.calls, programs: inf.programs.length }; })()`;
// stand the soldier at (x, z) looking at (tx, ty, tz) in first person; HUD hidden for clean evidence
const STAND = (x, z, tx, ty, tz) => `(() => { const G = __G, x = (${x}), z = (${z}), tx = (${tx}), ty = (${ty}), tz = (${tz});
  const y = G.groundY(x, z); G.foot.spawnAt({ x, y: y + 0.2, z, yaw: 0 }, { force: true });
  const W = G.foot.W, ey = W.y + 1.6, yaw = Math.atan2(-(tx - x), -(tz - z)), pitch = Math.atan2(ty - ey, Math.hypot(tx - x, tz - z));
  clearInterval(window.__aimI); window.__aimI = setInterval(() => G.marine.aim(yaw, pitch), 30); G.marine.view = 'first';
  return { x: +W.x.toFixed(1), y: +W.y.toFixed(1), z: +W.z.toFixed(1), yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2) }; })()`;

export default async function (h) {
  if (want('base') || want('deck')) {
    await h.goto(`?debug&auto&kb&peace&res=1&rk=${RK}${Q}`);
    await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 40000);
    await h.wait(1500);
    await h.key('tap', 'KeyY'); await h.wait(800);
    await h.expect("__G.G.craft === 'foot'");
    await h.eval(`(document.getElementById('hud') && (document.getElementById('hud').style.visibility = 'hidden'), true)`);
    if (want('deck')) {
      await h.eval(`(() => { const c = __G.war.carrier, W = __G.foot.W; const f = [-Math.sin(c.yaw), -Math.cos(c.yaw)];
        clearInterval(window.__aimI); window.__aimI = setInterval(() => __G.marine.aim(c.yaw + 0.5, -0.32), 30); return { x: W.x, z: W.z }; })()`);
      await h.wait(2500); await h.shot('deck_near');
      await h.eval(`(clearInterval(window.__aimI), window.__aimI = setInterval(() => __G.marine.aim(__G.war.carrier.yaw + 2.2, -0.08), 30), true)`);
      await h.wait(2000); await h.shot('deck_island');
    }
    if (want('base')) {
      // the home island: ours, with an HQ; the pad
      await h.eval(`(() => { const I = __G.ISLANDS.find(I => I.owner === 1 && I.structs && I.structs.some(s => s.kind === 'hq')) || __G.ISLANDS.find(I => I.structs && I.structs.some(s => s.kind === 'hq'));
        const hq = I.structs.find(s => s.kind === 'hq'); window.__B = { I, hq, pad: I.pad }; return { isl: I.name, owner: I.owner, hq: [hq.x, hq.z, hq.yaw ?? hq.mesh?.rotation.y], pad: [I.pad.x, I.pad.z] }; })()`, 'home');
      // the HQ front faces local +z (the sandbagged door): stand 9 m in front of it (the user's view), then 3 m, then 30 m
      const front = (d, side = 0) => `(() => { const hq = __B.hq, a = hq.mesh ? hq.mesh.rotation.y : 0, fx = Math.sin(a), fz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
        return [hq.x + fx * ${d} + rx * ${side}, hq.z + fz * ${d} + rz * ${side}]; })()`;
      for (const [name, d, side, ty] of [['base_user', 16, 3, 2.2], ['base_near', 10.5, -2, 0.4], ['base_mid', 34, 6, 3]]) {
        await h.eval(`(() => { const [X, Z] = ${front(d, side)}, hq = __B.hq; window.__st = ${STAND('X', 'Z', 'hq.x', `__G.groundY(hq.x, hq.z) + ${ty}`, 'hq.z')}; return __st; })()`, name);
        await h.wait(2500); await h.shot(name);
        if (PERF && name !== 'base_mid') await h.eval(SAMPLE(name), 'perf');
      }
      // the pad: standing on its edge looking across it
      await h.eval(`(() => { const p = __B.pad, hq = __B.hq, dx = hq.x - p.x, dz = hq.z - p.z, L = Math.hypot(dx, dz); const X = p.x - dx / L * 11, Z = p.z - dz / L * 11; return ${STAND('X', 'Z', 'p.x', '__G.groundY(p.x, p.z) - 2', 'p.z')}; })()`, 'pad');
      await h.wait(2500); await h.shot('pad_edge');
      await h.eval(`(() => { const p = __B.pad, hq = __B.hq, dx = hq.x - p.x, dz = hq.z - p.z, L = Math.hypot(dx, dz); const X = p.x - dx / L * 30, Z = p.z - dz / L * 30; return ${STAND('X', 'Z', 'p.x', '__G.groundY(p.x, p.z)', 'p.z')}; })()`, 'pad30');
      await h.wait(2500); await h.shot('pad_mid');
    }
  }
  if (want('town')) {
    await h.goto(`dev/world.html?focus=town&dist=320&pitch=30&rk=${RK}${Q}`); await h.waitFor('window.__ready', 40000); await h.wait(800);
    await h.eval('(__view(120, 6, 60), 1)'); await h.wait(500); await h.shot('town_street');
    await h.eval('(__view(30, 3, 20), 1)'); await h.wait(500); await h.shot('town_near');
    await h.goto(`dev/world.html?focus=village&dist=220&pitch=24&rk=${RK}${Q}`); await h.waitFor('window.__ready', 40000); await h.wait(800);
    await h.eval('(__view(200, 9, 70), 1)'); await h.wait(500); await h.shot('village_low');
  }
}
