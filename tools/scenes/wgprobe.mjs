// scratch probe for ngc/wheeledgame (not committed)
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.eval(`(() => { const V = __G.pool.list.find(V => V.type === 'm151' && V.home && V.home.name === 'HOME ISLAND'); window.__M = V; const d = __G.crafts.toWorld(V, [-1.9, 0, 0.05]); return __G.foot.spawnAt({ x: d.x, y: V.sim.pos[1] + 0.4, z: d.z, yaw: 0 }); })()`);
  await h.wait(500); await h.key('tap', 'KeyY'); await h.wait(300);
  await h.eval(`(() => { const T = __G.terrainH; for (const I of __G.ISLANDS) { if (I.owner !== 2 || !I.structs) continue; for (const s of I.structs) { if (s.dead || s.kind === 'aa') continue; for (let a = 0; a < 6.283; a += 0.2) for (const d of [55, 70, 85]) { const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, y = T(x, z); if (y < 1.5) continue; let ok = Math.abs(T(x + 2, z) - T(x - 2, z)) < 0.6 && Math.abs(T(x, z + 2) - T(x, z - 2)) < 0.6 && !__G.BASES.some(b => Math.hypot(b.x - x, b.z - z) < 14); for (let k = 0.1; k < 0.95 && ok; k += 0.05) { const px = x + (s.x - x) * k, pz = z + (s.z - z) * k, ly = y + 2 + (s.y + s.h * 0.6 - y - 2) * k; if (T(px, pz) > ly - 0.3) ok = false; } if (ok && __G.GR.clearAt(x, z, 3)) { window.__TGT = s; __M.spawnAt({ x, z, yaw: Math.atan2(-(s.x - x), -(s.z - z)) + 0.6 }, { running: true }); return { island: I.name, kind: s.kind, hp: s.hp, d, y: +y.toFixed(1), s: { x: s.x, y: s.y, z: s.z, h: s.h, r: s.r, side: s.side } }; } } } } return null; })()`);
  await h.wait(1500);
  await h.key('tap', 'BracketRight'); await h.wait(200); await h.key('tap', 'BracketRight'); await h.wait(300);
  await h.eval('(__M.view = "first", __M.aimAt(__TGT.x, __TGT.y + __TGT.h * 0.6, __TGT.z), [__M.aim.yaw, __M.aim.pitch, __M.seats[__M.seat].sid])');
  await h.key('down', 'KeyF'); await h.wait(2500); await h.key('up', 'KeyF'); await h.wait(1500);
  await h.eval('({ fired: __G.pool.guns.fired, hits: __G.pool.guns.hits, hp: __TGT.hp, log: __G.pool.guns.log, me: [__M.sim.pos[0], __M.sim.pos[1], __M.sim.pos[2]] })');
  await h.shot('m60');
}
