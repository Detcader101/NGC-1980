// ngc/depth-figures: the ALBATROSS deck crew (instanced, coloured jerseys), the Huey's crew on the deck, and first
// person on the flight deck, A/B (RK=0 env -> ?rk=0).
const RK = process.env.RK ?? '1';
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.05, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => { const m = window.__cam; if (c !== G.zCam || !m) return orig(s, c); p.set(...m.at); t.set(...m.look);
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.fov = m.fov || 50; cam.aspect = c.aspect; cam.updateProjectionMatrix(); return orig(s, cam); };
  window.__stats = () => { const i = r.info; return { calls: i.render.calls, tris: i.render.triangles }; };
  return true; })()`;
export default async function (h) {
  await h.goto(`?debug&auto&kb&peace&res=0.6&rk=${RK}`);
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.eval(HOOK);
  const crewCam = async (name, pick, d = 2.6, hgt = 1.0, fov = 40) => {
    await h.eval(`(() => { const c = __G.war.carrier, cr = c.parts && c.parts.crew; const L = cr ? cr.members : []; const m = L.find(${pick}) || L[0]; if (!m) return { none: true, keys: Object.keys(c.parts || {}) };
      const y = c.p.y + (m.y ?? 8), w = __G.GR.toWorld(c, m.x, m.z), w2 = __G.GR.toWorld(c, m.x + ${d} * 0.7, m.z - ${d} * 0.7); window.__cam = { at: [w2.x, y + ${hgt} + 0.4, w2.z], look: [w.x, y + 1.0, w.z], fov: ${fov} }; return { j: m.jersey, mode: m.mode, n: L.length }; })()`);
    await h.wait(1200); await h.shot(name);
  };
  await crewCam('deck-crew-yellow', "p => p.jersey === 'yellow'");
  await crewCam('deck-crew-kneel', "p => p.mode === 'kneel'", 2.2, 0.6);
  await crewCam('deck-crew-group', "p => p.jersey === 'blue'", 9, 3, 50); await h.eval('__stats()');
  // the Huey on the deck: pilots and the door gunner
  await h.eval(`(() => { const H = __G.H, p = H.p || H.pos, y = __G.H.yaw ?? 0, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    window.__cam = { at: [p.x - rx * 4.2 + fx * 1.0, p.y + 0.9, p.z - rz * 4.2 + fz * 1.0], look: [p.x + fx * 0.3, p.y + 0.2, p.z + fz * 0.3], fov: 45 }; return 1; })()`);
  await h.wait(1200); await h.shot('huey-gunner-deck');
  await h.eval('(window.__cam = null, 1)');
  await h.key('tap', 'KeyY'); await h.wait(900);
  await h.eval(`(() => { const c = __G.war.carrier; __G.marine.view = 'first'; __G.marine.aim(c.yaw, -0.08); return 1; })()`);
  await h.wait(1200); await h.shot('fp-on-deck'); await h.eval('__stats()');
}
