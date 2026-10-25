// Damage on the rotary units in the real game (peace mode, damage applied through war.damage like any hit):
//   CH-46: below half hp one engine quits - it aborts and turns for home on the other; then killed: both engines out,
//          the AI autorotates down, the wreck explodes (Marines aboard lost)
//   MV-22: shot down in cruise - falls, explodes
//   WASP:  shot down - fans dead, tumbles, explodes
//   squad: hits drop Marines one by one; wiped out, the unit is gone, the bodies stay a while
// node snap.mjs scenes/rotarydamage.mjs
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 10000); await h.wait(500);
  const gw = async s => { await h.eval('(window.__gt0 = __G.war.time, 1)'); await h.waitFor('__G.war.time - __gt0 >= ' + s, s * 15000 + 10000); };
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000); await h.wait(1000);
  // CH-46 to SANDBAR; in transit an engine is hit
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); __G.G.mat = 300; __G.selIsl = I; __G.command(1); window.__u = __G.war.units.find(u => u.kind === 'ch46'); return !!__u; })()`);
  await h.waitFor(`__u.rot.AI.phase === 'transit' && __u.rot.AI.cmd.dist < 380`, 300000);   // (ngc/bugsweep) wall timeouts for 2-5 fps headless; holds in game time
  await h.eval(`(__G.war.damage(__u, 6, 2), { hp: __u.hp, engines: __u.rot.S.eng.map(e => e.ok), phase: __u.rot.AI.phase })`);
  await gw(3);
  await h.eval(`({ hp: __u.hp, engines: __u.rot.S.eng.map(e => e.ok), phase: __u.rot.AI.phase, live: __u.rot.S.live, feed: document.getElementById('feed').textContent.slice(0, 120) })`);
  await h.expect(`__u.rot.S.eng.filter(e => e.ok).length === 1 && __u.rot.AI.phase === 'rtb'`, 'CH-46: one engine out, aborts and turns for home');
  await gw(4);
  await h.expect(`!__u.dead && __u.rot.S.rpm > 0.93`, 'CH-46: flies on one engine (rotor rpm held)');
  // now kill it
  await h.eval(`(__G.war.damage(__u, 10, 2), { dying: !!__u.dying, alt: Math.round(__u.p.y) })`);
  await h.waitFor(`__u.dead`, 300000);
  await h.eval(`({ crashed: __u.crashed, cat: __u.catastrophic, feed: document.getElementById('feed').textContent.slice(0, 160) })`);
  await h.expect(`__u.dead && __u.crashed`, 'CH-46: shot down - autorotated / fell and crashed');
  // an Osprey in cruise
  await h.eval(`(() => { const W = __G.war, I = __G.ISLANDS.find(i => i.name === 'FORGE'); window.__o = W.rotary.make('transport', 2, 0, 0, 0, { target: I }); W.units.push(__o); return __o.kind; })()`);
  await h.waitFor(`__o.rot.AI.phase === 'transit' && __o.rot.S.ias > 50`, 300000);
  await h.eval(`(__G.war.damage(__o, 20, 1), { dying: !!__o.dying })`);
  await h.waitFor(`__o.dead`, 300000);
  await h.expect(`__o.dead && __o.crashed`, 'MV-22: shot down, crashed');
  // a WASP
  await h.eval(`(() => { const W = __G.war, c = W.carrier; window.__w = W.spawnGunship(2, [c.p.x + 120, 40, c.p.z - 60]); return __w.kind; })()`);
  await h.wait(2000);
  await h.eval(`(__G.war.damage(__w, 5, 1), { dying: !!__w.dying })`);
  await h.waitFor(`__w.dead`, 150000);
  await h.expect(`__w.dead`, 'WASP: shot down, tumbled and exploded');
  // a squad: land a second CH-46's Marines, then hit them
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); __G.selIsl = I; __G.command(1); window.__u2 = __G.war.units.filter(u => u.kind === 'ch46').pop(); return !!__u2; })()`);
  // (ngc/bugsweep) since the GROUND WAR merge the Sea Knight's Marines come off the ramp into the ground war (GW.landing:
  // a proxy unit for the war, each Marine a ground-sim unit), not rotary.js's own squad - hit them there
  await h.waitFor(`__G.war.ground.proxies.some(P => P.side === 1 && P.formed && P.members.length >= 6)`, 900000);
  await gw(2);
  await h.eval(`(() => { const P = __G.war.ground.proxies.find(P => P.side === 1 && P.formed); window.__P = P; return { members: P.members.length, able: P.members.filter(u => u.alive && u.able).length, island: P.home.name }; })()`);
  // three Marines hit by 20 mm until they are down (a hit is a wound on a body part: alive or not, out of the fight)
  await h.eval(`(() => { const GS = __G.war.ground.sim, M = __P.members.filter(u => u.alive && u.able).slice(0, 3); window.__hit3 = M; for (const u of M) for (let k = 0; k < 30 && u.alive && u.able; k++) GS.hitUnit(2, 'cannon20', u, u.x, u.y + 1.2, u.z, [1, 0, 0]); return M.map(u => ({ alive: u.alive, able: u.able })); })()`);
  await gw(1.5);
  await h.expect(`__hit3.length === 3 && __hit3.every(u => !u.alive || !u.able)`, 'squad: three hits, three Marines down');
  await h.eval(`(() => { const GS = __G.war.ground.sim; for (const u of __P.members) for (let k = 0; k < 30 && u.alive && u.able; k++) GS.hitUnit(2, 'cannon20', u, u.x, u.y + 1.2, u.z, [1, 0, 0]); return 1; })()`);
  await gw(2);
  await h.eval(`({ wiped: __P.wiped, dead: __P.dead, inProxies: __G.war.ground.proxies.includes(__P), bodies: __P.members.length })`);
  await h.expect(`__P.wiped && !__G.war.ground.proxies.includes(__P)`, 'squad: wiped out, the unit is gone');
  await h.expect(`__G.war.ground.sim.units.some(u => __P.members.includes(u))`, 'squad: the fallen stay on the island a while');
}
