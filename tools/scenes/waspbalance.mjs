// RW-3 WASP balance (ngc/cmpolish), fast-forwarded in the real war (no rendering between steps), OLD tune (the saucer's
// 3 hp, a flat 0.025 rad aim error, half the hunters in ambush) against the NEW one (war.rotary.waspTune):
//   A. RAID: four WASPs on the ALBATROSS with her guns live (two close-in guns, two missile boxes): how long they live
//      and how many pulses they get off before the guns get them.
//   B. HUNT: three WASPs on the player's Huey off an enemy island (every other RUNAWAY gun silenced): hits on the Huey
//      per minute (counted, not applied), hovering still and flying a 150 m circle at 25 m/s.
//   C. AMBUSH: the Huey flying in toward the WASPs' island: the share of them lying in ambush.
//   node snap.mjs scenes/waspbalance.mjs
const SETUP = `(() => { const W = __G.war;
  window.__step = (secs, f) => { for (let i = 0; i < secs * 10; i++) { W.update(0.1, __G.PL, false); __G.fx.update(0.1); if (f) f(); } };
  // count the hits on the Huey without hurting it (G.bench would skip hurtPlayer altogether)
  window.__hits = 0; const D = __G.D; if (!D.__wrapped) { const o = D.hit.bind(D); D.__wrapped = 1; D.hit = (a, p) => { if (window.__count) { window.__hits++; return 'skids'; } return o(a, p); }; }
  window.__T = __G.war.rotary.waspTune; window.__NEW = { ...__T }; window.__OLD = { hp: 3, r: 2.8, aim: 0.025, aimPerM: 0, ambush: 0.49 };   // (OLD: the ambush share is the old id cut; the old pick-up range rule is gone)
  window.__quiet = () => { for (const I of __G.ISLANDS) for (const s of I.structs) if (s.kind === 'aa' && s.side === 2) { s.dead = true; s.mesh.visible = false; }
    for (const u of W.units) { if (u.side === 2 && u.dims) for (const g of u.guns || []) { g.dead = true; g.rebuild = 1e9; } if (u.type === 'gunship' && u.side === 2) u.dead = true; } };
  return 1; })()`;
const RAID = (tune, off = '') => `(() => { Object.assign(__T, ${tune}); const W = __G.war, c = W.carrier; for (const u of W.units) if (u.type === 'gunship' && u.side === 2) u.dead = true;
  const t0 = W.time, ws = [0, 1, 2, 3].map(k => { const u = W.spawnGunship(2, [c.p.x + 260 + k * 12, 40, c.p.z + 120], c); u.target = c; u.raid = c; return u; });
  const life = ws.map(() => null), why = ws.map(() => ''), shots = new Set(), cp0 = [Math.round(c.p.x), Math.round(c.p.z)], gy = Math.round(__G.terrainH(c.p.x + 260, c.p.z + 120));
  for (const g of c.guns) { g.dead = false; g.hp = g.max; g.mesh.visible = true; g.rebuild = 0; if ('${off}' && g.def && g.def.type === '${off}') { g.dead = true; g.rebuild = 1e9; } }
  __step(90, () => { ws.forEach((u, i) => { if (life[i] === null && (u.dead || u.dying)) { life[i] = +(W.time - t0).toFixed(1); why[i] = (u.crashWhy ? 'crash ' + u.crashWhy : 'shot') + ' @' + Math.round(Math.hypot(u.p.x - c.p.x, u.p.z - c.p.z)) + 'm'; } }); for (const b of W.proj) if (b.col) shots.add(b); });
  const L = life.map(v => v === null ? 90 : v);
  return { tune: ${tune === '__OLD' ? "'OLD'" : "'NEW'"}, without: '${off}', hp: ws[0].hpMax, lifetimes: life.map(v => v === null ? '>90' : v), meanLife: +(L.reduce((a, b) => a + b, 0) / 4).toFixed(1), pulses: shots.size, why, hpLeft: ws.map(u => +u.hp.toFixed(1)), dist: ws.map(u => Math.round(Math.hypot(u.p.x - c.p.x, u.p.z - c.p.z))), guns: c.guns.map(g => g.def.type + (g.dead ? '-dead' : '') + ':' + (g.def.key ? 'T' : '-')) }; })()`;
const HUNT = (tune, moving) => `(() => { Object.assign(__T, ${tune}); const W = __G.war; __quiet();
  const I = __G.ISLANDS.find(I => I.name === 'ANVIL'), a = Math.atan2(I.pad.x - W.carrier.p.x, I.pad.z - W.carrier.p.z) + Math.PI;
  const cx = I.pad.x + Math.sin(a) * 240, cz = I.pad.z + Math.cos(a) * 240; let th = 0;
  const hold = () => { let x = cx, z = cz, vx = 0, vz = 0, yaw = a + Math.PI;
    if (${moving}) { th += 0.1 * 25 / 150; x = cx + Math.sin(th) * 150; z = cz + Math.cos(th) * 150; vx = Math.cos(th) * 25; vz = -Math.sin(th) * 25; yaw = Math.atan2(-vx, -vz); }
    __G.H.reset(new __G.THREE.Vector3(x, Math.max(__G.terrainH(x, z), 0) + 40, z), yaw, false, 1); __G.H.vel.set(vx, 0, vz); __G.Z.pos.copy(__G.H.pos); __G.Z.vel.set(vx, 0, vz); };
  hold(); const ws = [0, 1, 2].map(k => { const u = W.spawnGunship(2, [I.pad.x + k * 10, I.pad.h + 20, I.pad.z]); u.target = 'player'; return u; });
  window.__hits = 0; window.__count = 1; const shots = new Set();
  __step(60, () => { hold(); for (const b of W.proj) if (b.col) shots.add(b); });
  window.__count = 0;
  return { tune: ${tune === '__OLD' ? "'OLD'" : "'NEW'"}, moving: ${moving}, hitsPerMin: __hits, pulses: shots.size, accuracy: +(__hits / Math.max(1, shots.size)).toFixed(2) }; })()`;
const AMBUSH = tune => `(() => { Object.assign(__T, ${tune}); const W = __G.war; __quiet();
  let amb = 0, n = 0, runs = 0;
  for (let r = 0; r < 4; r++) {
    const I = __G.ISLANDS.find(I => I.name === 'ANVIL'), a = Math.atan2(I.pad.x - W.carrier.p.x, I.pad.z - W.carrier.p.z) + Math.PI + (r - 1.5) * 0.4;
    let d = 420; const ws = [0, 1, 2, 3, 4].map(k => { const u = W.spawnGunship(2, [I.pad.x + k * 10, I.pad.h + 20, I.pad.z]); u.target = 'player'; return u; });
    __step(10, () => { d = Math.max(150, d - 2); const x = I.pad.x + Math.sin(a) * d, z = I.pad.z + Math.cos(a) * d;
      __G.H.reset(new __G.THREE.Vector3(x, Math.max(__G.terrainH(x, z), 0) + 40, z), a + Math.PI, false, 1); __G.Z.pos.copy(__G.H.pos); __G.Z.vel.set(-Math.sin(a) * 20, 0, -Math.cos(a) * 20);
      for (const u of ws) { n++; if (u.ambush) amb++; } });
    for (const u of ws) u.dead = true; runs++;
  }
  return { tune: ${tune === '__OLD' ? "'OLD'" : "'NEW'"}, ambushShare: +(amb / Math.max(1, n)).toFixed(2) }; })()`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45');
  await h.waitFor('window.__G', 15000); await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 15000); await h.wait(800);
  await h.eval(SETUP);
  if (!process.env.WB_HPS) for (const t of ['__OLD', '__NEW']) for (let i = 0; i < 3; i++) await h.eval(RAID(t));
  if (!process.env.WB_HPS) for (const off of ['sparrow', 'ciws']) await h.eval(RAID('__NEW', off));   // which of her guns gets them
  if (process.env.WB_SWEEP) for (const hp of (process.env.WB_HPS || '6,7,8').split(',').map(Number)) for (let i = 0; i < 2; i++) await h.eval(RAID(`({ ...__NEW, hp: ${hp} })`));
  if (process.env.WB_SWEEP) return;
  for (const t of ['__OLD', '__NEW']) for (const m of [false, true]) for (let i = 0; i < 2; i++) await h.eval(HUNT(t, m));
  for (const t of ['__OLD', '__NEW']) await h.eval(AMBUSH(t));
  await h.eval('(Object.assign(__T, __NEW), 1)');
  await h.shot('after');
}
