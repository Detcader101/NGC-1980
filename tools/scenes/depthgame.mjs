// ngc/depth-figures: the people in the game, A/B (RK=0 env -> ?rk=0). At the home pad (the user's report: first person
// at the HQ with the M16A1): hip, aim, reload, third person; the Huey's pilots and door gunner; a Marine squad at 10 m
// and 40 m; a casualty treated / dragged / carried; swimming; the ALBATROSS deck crew; townsfolk.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/depthgame.mjs --out runs/x
const RK = process.env.RK ?? '1';
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.05, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3();
  r.render = (s, c) => {
    const m = window.__cam; if (c !== G.zCam || !m) return orig(s, c);
    p.set(...m.at); t.set(...m.look);
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.fov = m.fov || 50; cam.aspect = c.aspect; cam.updateProjectionMatrix();
    return orig(s, cam);
  };
  window.__ff = (secs, dt = 1 / 30) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, true); G.fx.update(dt); } return true; };
  window.__fem = (M, region) => { M.bleeds.push({ id: 900 + M.bleeds.length, region, zone: 'thigh', type: 'arterial', rate: 500, ctl: 'tq', name: 'FEMORAL A.', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false }); };
  window.__stats = () => { const i = r.info; return { calls: i.render.calls, tris: i.render.triangles }; };
  return true; })()`;
export default async function (h) {
  await h.goto(`?debug&auto&kb&peace&homepad&res=0.6&rk=${RK}`);
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.eval(HOOK);
  // ---- the Huey's crew (pilots, door gunner, crew chief) from outside the left door
  await h.eval(`(() => { const o = __G.hueyMesh || null; const H = __G.H, p = H.p || H.pos, y = H.yaw ?? 0; const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    window.__hp = { x: p.x, y: p.y, z: p.z, fx, fz, rx, rz }; window.__cam = { at: [p.x - rx * 4.2 + fx * 1.2, p.y + 0.9, p.z - rz * 4.2 + fz * 1.2], look: [p.x + fx * 0.3, p.y + 0.2, p.z + fz * 0.3], fov: 45 }; return { p: [p.x, p.y, p.z].map(v => +v.toFixed(1)), y }; })()`);
  await h.wait(900); await h.shot('huey-crew-left');
  await h.eval(`(() => { const P = __hp; window.__cam = { at: [P.x + P.fx * 4.5 + P.rx * 1.2, P.y + 0.8, P.z + P.fz * 4.5 + P.rz * 1.2], look: [P.x + P.fx * 1.5, P.y + 0.1, P.z + P.fz * 1.5], fov: 40 }; return 1; })()`);
  await h.wait(900); await h.shot('huey-pilots-front');
  // ---- out on foot at the home pad: first person (the user's view), aim, reload
  await h.eval('(window.__cam = null, 1)');
  await h.key('tap', 'KeyY'); await h.wait(900);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists && !!__G.marine", 'out of the Huey as the Marine');
  await h.eval(`(() => { const I = __G.HOME_B.isl, s = I.structs && I.structs.find(s => s.kind === 'hq'); const W = __G.foot.W; const tx = s ? s.x : I.x, tz = s ? s.z : I.z, d0 = Math.hypot(tx - W.x, tz - W.z), k = Math.min(0.6, 12 / Math.max(1, d0)), nx = W.x + (tx - W.x) * k, nz = W.z + (tz - W.z) * k; __G.foot.spawnAt({ x: nx, y: __G.terrainH(nx, nz), z: nz, yaw: Math.atan2(-(tx - nx), -(tz - nz)) }); __G.marine.view = 'first'; __G.marine.aim(Math.atan2(-(tx - W.x), -(tz - W.z)), -0.05); return { hq: !!s, d: Math.round(Math.hypot(tx - W.x, tz - W.z)), key: __G.marine.R.cur.key }; })()`);
  await h.wait(1200); await h.eval(`(() => { const I = __G.HOME_B.isl, s = I.structs.find(s => s.kind === 'hq'), W = __G.foot.W; __G.marine.aim(Math.atan2(-(s.x - W.x), -(s.z - W.z)), -0.05); return 1; })()`); await h.wait(600); await h.shot('fp-hip-at-home'); await h.eval('__stats()');
  await h.eval('(__G.marine.input({ ads: true }), 1)'); await h.wait(1300); await h.shot('fp-aim');
  await h.eval('(__G.marine.input({ ads: false }), 1)'); await h.wait(800);
  await h.key('tap', 'KeyR'); await h.wait(1300); await h.shot('fp-reload-a');
  await h.wait(1100); await h.shot('fp-reload-b');
  await h.wait(2500);
  await h.eval(`(() => { __G.marine.aim(__G.marine.S.yaw, -0.6); return 1; })()`); await h.wait(700); await h.shot('fp-look-down');
  // third person, close behind and a front three-quarter
  await h.eval(`(() => { const W = __G.foot.W, S = __G.marine.S; __G.marine.aim(S.yaw, 0); __G.marine.view = 'third'; return 1; })()`); await h.wait(1200); await h.shot('tp-default');
  await h.eval(`(() => { const W = __G.foot.W, a = __G.marine.S.yaw, fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a); __G.marine.view = 'third'; window.__cam = { at: [W.x + fx * 2.2 + rx * 1.0, W.y + 1.6, W.z + fz * 2.2 + rz * 1.0], look: [W.x, W.y + 1.25, W.z], fov: 40 }; return 1; })()`);
  await h.wait(900); await h.shot('tp-front-close'); await h.eval('__stats()');
  await h.eval('(window.__cam = null, __G.marine.view = "first", 1)');
  // ---- a Marine squad dug in round the pad: at 10 m and 40 m
  await h.eval(`(() => { const I = __G.HOME_B.isl, W = __G.war; window.__P = W.ground.addSquad(1, I, 9, __G.foot.W.x + 14, __G.foot.W.z + 4, { order: { type: 'defend', x: __G.foot.W.x + 14, z: __G.foot.W.z + 4, r: 10 } }); window.__GS = W.ground.sim; if (__GS.FC) __GS.FC.pause = true; return { n: __P.members.length }; })()`);
  await h.eval('__ff(12)'); await h.wait(600);
  await h.eval(`(() => { const m = __P.members, cx = m.reduce((s, u) => s + u.x, 0) / m.length, cz = m.reduce((s, u) => s + u.z, 0) / m.length, gy = __G.terrainH(cx, cz); window.__sq = [cx, gy, cz]; __G.marine.view = 'third'; window.__cam = { at: [cx + 10, gy + 2.0, cz + 2], look: [cx, gy + 1.0, cz], fov: 45 }; return { c: [cx, cz].map(Math.round) }; })()`);
  await h.wait(1200); await h.shot('squad-10m'); await h.eval('__stats()');
  await h.eval(`(() => { const [cx, gy, cz] = __sq; window.__cam = { at: [cx + 40, gy + 4, cz + 6], look: [cx, gy + 1.0, cz], fov: 45 }; return 1; })()`);
  await h.wait(1200); await h.shot('squad-40m'); await h.eval('__stats()');
  // ---- a casualty: down next to him, treated (first person), dragged, carried (third person)
  await h.eval(`(() => { const u = __P.members[3]; window.__cas = u; __GS.enrich(u); const W = __G.foot.W, S = __G.marine.S, fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    __GS.place(u, W.x + fx * 1.4, W.z + fz * 1.4, S.yaw); __fem(u.rich.M, 'legL'); u.rich.M.ko = 900; u.rich.noSelfAid = true; __GS.richState(u); __G.marine.view = 'first'; __G.marine.aim(S.yaw, -0.45); return { name: u.name }; })()`);
  await h.eval('__ff(0.5)'); await h.wait(700); await h.shot('casualty-down');
  await h.key('down', 'ShiftLeft'); await h.key('tap', 'KeyF'); await h.key('up', 'ShiftLeft'); await h.wait(500);
  await h.key('down', 'KeyS'); await h.wait(1500); await h.shot('fp-dragging'); await h.key('up', 'KeyS');
  await h.eval(`(() => { const W = __G.foot.W, S = __G.marine.S, fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw); __G.marine.view = 'third'; window.__cam = { at: [W.x + rx * 4 + fx * 0.8, W.y + 2.0, W.z + rz * 4 + fz * 0.8], look: [W.x + fx * 0.8, W.y + 0.5, W.z + fz * 0.8], fov: 45 }; return 1; })()`);
  await h.wait(900); await h.shot('tp-dragging');
  await h.key('tap', 'KeyF'); await h.wait(500);
  await h.eval(`(() => { const W = __G.foot.W, S = __G.marine.S, rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw), fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw); __G.marine.view = 'third'; window.__cam = { at: [W.x + fx * 3.4 + rx * 1.2, W.y + 1.9, W.z + fz * 3.4 + rz * 1.2], look: [W.x, W.y + 1.3, W.z], fov: 45 }; return { hold: __G.marine.care.hold && __G.marine.care.hold.mode }; })()`);
  await h.wait(900); await h.shot('tp-carry');
  await h.eval('(window.__cam = null, __G.marine.view = "first", 1)'); await h.wait(700); await h.shot('fp-carry');
  await h.key('down', 'ShiftLeft'); await h.key('tap', 'KeyF'); await h.key('up', 'ShiftLeft'); await h.wait(400);
  await h.key('tap', 'KeyF'); await h.wait(900); await h.key('tap', 'Escape'); await h.wait(300);
  // ---- swimming off the home island's beach
  await h.eval(`(() => { const I = __G.HOME_B.isl, W = __G.foot.W; for (let r = 60; r < 900; r += 15) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r; if (__G.terrainH(x, z) < -3) { __G.foot.spawnAt({ x, y: -1.3, z, yaw: a }, { force: true }); __G.marine.view = 'first'; __G.marine.aim(a, -0.25); return { at: [Math.round(x), Math.round(z)] }; } } return null; })()`);
  await h.key('down', 'KeyW'); await h.wait(3500); await h.shot('fp-swim');
  await h.eval(`(() => { const W = __G.foot.W, a = __G.marine.S.yaw, fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a); __G.marine.view = 'third'; window.__cam = { at: [W.x + fx * 2.5 + rx * 1.5, W.y + 1.6, W.z + fz * 2.5 + rz * 1.5], look: [W.x, W.y + 0.4, W.z], fov: 45 }; return { swim: __G.foot.W.swim }; })()`);
  await h.wait(900); await h.shot('tp-swim'); await h.key('up', 'KeyW');
  await h.eval('(window.__cam = null, __G.marine.view = "first", 1)');
  // ---- the ALBATROSS deck crew
  await h.eval(`(() => { const c = __G.war.carrier; if (!c) return null; __G.marine.view = 'third'; const a = __G.GR.toWorld(c, 14, 30), b = __G.GR.toWorld(c, 4, 5); window.__cam = { at: [a.x, c.p.y + 11.5, a.z], look: [b.x, c.p.y + 8.6, b.z], fov: 50 }; return 1; })()`);
  await h.wait(1500); await h.shot('deck-crew'); await h.eval('__stats()');
  await h.eval(`(() => { const c = __G.war.carrier, cr = c && c.parts && c.parts.crew; const m = cr && cr.members && cr.members.find(p => p.jersey === 'yellow') || (cr && cr.members[0]); if (!m) return null; const w = __G.GR.toWorld(c, m.x, m.z), w2 = __G.GR.toWorld(c, m.x + 2.2, m.z - 2.2); window.__cam = { at: [w2.x, c.p.y + 9.4, w2.z], look: [w.x, c.p.y + 8.9, w.z], fov: 40 }; return { j: m.jersey, mode: m.mode }; })()`);
  await h.wait(1200); await h.shot('deck-crew-close');
  // ---- townsfolk
  await h.eval(`(() => { const A = window.__WORLD && __WORLD.ambient; const p = A && A.people && A.people.find(p => p.state !== 'inside'); if (!p) return { people: A && A.people && A.people.length }; const gy = __G.terrainH(p.x, p.z); __G.marine.view = 'third'; window.__cam = { at: [p.x + 3.5, gy + 2.0, p.z + 3.5], look: [p.x, gy + 1.0, p.z], fov: 45 }; return { n: A.people.length }; })()`);
  await h.wait(1500); await h.shot('townsfolk');
}
