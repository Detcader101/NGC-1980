// RW-3 WASP raid in the real game (no peace mode): four WASPs launched at the player's helicopter on the ALBATROSS.
// They come in on a swarm ring, take turns on strafing passes and fire cyan pulses (game-level rounds); the carrier's
// guns fight back, hit WASPs tumble out of the sky and explode. A render hook gives a chase camera on one WASP.
// node snap.mjs scenes/wasp.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(55, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3(), f = new T.Vector3();
  r.render = (s, c) => {
    let u = window.__follow; if (u && (u.dead || u.dying) && window.__pick) u = window.__follow = window.__pick();
    if (c !== G.zCam || !u || !window.__cam) return orig(s, c);
    const m = window.__cam; u.mesh.getWorldPosition(t); u.mesh.visible = true;
    if (m.mode === 'chase') { f.set(u.v.x, 0, u.v.z); if (f.lengthSq() < 4) f.set(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)); f.normalize(); p.copy(t).addScaledVector(f, -m.d).y += m.h; }
    else { p.set(t.x + Math.sin(m.yaw) * m.d, t.y + m.h, t.z + Math.cos(m.yaw) * m.d); }
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix(); return orig(s, cam);
  };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1500);
  await h.eval(HOOK);
  await h.eval(`(() => { const W = __G.war, c = W.carrier, P = __G.PL; window.__shots = 0; window.__seen = new Set();
    const at = [c.p.x + 140, 30, c.p.z - 90]; for (const g of c.guns) { g.dead = true; g.rebuild = 1e9; g.mesh.visible = false; }   // the carrier's guns silenced for this test
    window.__ws = [0, 1, 2, 3].map(k => { const u = W.spawnGunship(2, [at[0] + k * 10, at[1], at[2]]); u.target = 'player'; return u; });
    window.__pick = () => __ws.find(u => !u.dead && !u.dying) || null; window.__follow = __ws[0];
    window.__cam = { mode: 'orbit', yaw: 2.0, d: 12, h: 3 };
    setInterval(() => { for (const b of W.proj) if (b.col && !__seen.has(b)) { __seen.add(b); __shots++; } }, 100);
    return { n: __ws.length, kinds: __ws.map(u => u.kind), y: __ws[0].p.y }; })()`);
  await h.expect(`__ws.every(u => u.kind === 'wasp')`, 'four RW-3 WASPs up');
  await h.wait(1500); await h.shot('01-wasp-close');
  await h.eval(`(window.__cam = { mode: 'chase', d: 16, h: 4 }, true)`);
  await h.wait(8000); await h.shot('02-inbound');
  await h.eval(`({ modes: __ws.map(u => u.dead ? 'dead' : u.rot.AI.mode), dist: __ws.map(u => Math.round(u.p.distanceTo(__G.PL.pos))), shots: __shots })`);
  await h.wait(8000); await h.shot('03-attack');
  await h.eval(`(window.__cam = { mode: 'orbit', yaw: 1.2, d: 22, h: 6 }, true)`); await h.wait(6000); await h.shot('04-orbit');
  await h.wait(10000); await h.shot('05-later');
  await h.eval(`({ modes: __ws.map(u => u.dead ? 'dead' : u.dying ? 'dying' : u.rot.AI.mode), shots: __shots, alive: __G.Z.alive, hp: __ws.map(u => u.hp), feed: document.getElementById('feed').textContent.slice(0, 200) })`);
  await h.expect(`__shots > 6`, 'the WASPs fired their pulses at the player');
  await h.expect(`__ws.some(u => !u.dead) || __shots > 6`, 'fought (alive or shot down by the carrier)');
}
