// AIR in the game: Tomcat escorts on the real flight model, flown by the AI pilot (units/air/airwar.js).
// Command 4 twice: two Tomcats to the cat, one at a time; CAP over the ALBATROSS; two RW-4 SHRIKEs come in and the
// Tomcats fight them with game-level missiles and the gun; a REAPER and a SHAHED salvo at the ship (the AA and the
// Tomcats shoot them down); then bingo: the pattern and a trap on the ALBATROSS.      node snap.mjs scenes/escorts.mjs
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.eval(`(() => { const G = __G; G.G.mat = 300; G.G.bench = true; G.selIsl = null; G.command(4); G.command(4);
    const c = G.war.carrier; c.path = []; G.H.reset(new G.THREE.Vector3(c.p.x + 28, c.p.y + 22, c.p.z - 30), c.yaw, false, 1); G.HI.setCollective(0.475);
    window.__esc = () => G.war.units.filter(u => u.type === 'escort');
    // test camera: a chase camera on a chosen aircraft, set just before each render (no game code involved)
    const T = G.THREE, r0 = G.renderer.render.bind(G.renderer), off = new T.Vector3(); window.__cam = null;
    G.renderer.render = (sc, cam) => { const f = window.__cam; if (f && f.u && f.u.p) { const u = f.u; off.set(...(f.off || [0, 5, 32])); if (u.sim) off.applyQuaternion(u.sim.q); cam.position.copy(u.p).add(off); cam.lookAt(f.at ? f.at : u.p); cam.updateMatrixWorld(); } r0(sc, cam); };
    return { pending: G.war.air.pending.length, units: __esc().length } })()`);
  await h.expect('__G.war.air.pending.length + __esc().length === 2');
  await h.waitFor('__esc().length >= 1 && __esc()[0].ai.state === "cat"', 15000);
  await h.eval('(window.__cam = { u: __esc()[0], off: [-14, 6, 22] }, 1)'); await h.wait(3000); await h.shot('on_the_cat');
  await h.waitFor('__esc()[0] && __esc()[0].ai.state === "climb"', 90000);   // (the shot waits for the carrier to turn into clear water: ~25 s of game time, ~40 s headless)
  await h.eval('(window.__cam = { u: __esc()[0], off: [-10, 4, 30] }, 1)'); await h.wait(600); await h.shot('cat_shot');
  await h.waitFor('__esc().length === 2 && __esc().every(u => u.ai.state === "cap")', 90000);
  await h.eval('__esc().map(u => ({ name: u.name, state: u.ai.state, y: Math.round(u.p.y), eas: Math.round(u.sim.eas * 1.944), fuel: Math.round(u.sim.fuel), log: u.ai.log.map(l => l.t + " " + l.msg).join("; ") }))');
  await h.eval('(() => { const G = __G, u = __esc()[1]; G.H.reset(new G.THREE.Vector3(u.p.x, u.p.y + 30, u.p.z), 0, false, 1); G.HI.setCollective(0.475); window.__cam = { u, off: [0, 6, 40] }; return 1 })()'); await h.wait(1500); await h.shot('cap');
  // two SHRIKEs from 1.6 km
  await h.eval(`(() => { const G = __G, c = G.war.carrier, b = { x: c.p.x + 1300, y: 260, z: c.p.z - 900, yaw: -2.2 }; window.__sh = [G.war.air.spawnShrike(b, c.p), G.war.air.spawnShrike({ ...b, x: b.x + 60 }, c.p)]; return __sh.length })()`);
  await h.waitFor('__esc().some(u => u.ai.state === "fight")', 20000);
  await h.wait(4000);
  await h.eval(`(() => { const G = __G, u = __esc().find(u => u.ai.state === 'fight') || __esc()[0]; G.H.reset(new G.THREE.Vector3(u.p.x - 120, u.p.y + 20, u.p.z + 120), 0, false, 1); G.HI.setCollective(0.475); return { state: u.ai.state, mode: u.ai.mode } })()`);
  await h.eval('(window.__cam = { u: __esc().find(u => u.ai.state === "fight") || __esc()[0], off: [0, 8, 45] }, 1)'); await h.wait(800); await h.shot('fight');
  await h.waitFor('__sh.every(s => s.dead || s.dying) || __esc().length === 0', 90000);
  await h.eval(`({ shrikes: __sh.map(s => ({ dead: !!(s.dead || s.dying), hp: s.hp })), escorts: __esc().map(u => ({ name: u.name, hp: u.hp, state: u.ai.state, aim: u.sim.stores.filter(s => s.on).length, gun: u.sim.gun, log: u.ai.log.slice(-8).map(l => l.t + ' ' + l.msg).join('; ') })), feed: document.getElementById('feed').textContent.slice(0, 400) })`);
  await h.expect('__sh.every(s => s.dead || s.dying)');
  // a REAPER over the ship and a SHAHED salvo at her
  await h.eval(`(() => { const G = __G, c = G.war.carrier; window.__rp = G.war.air.spawnReaper(c.p); window.__sd = G.war.air.salvo({ ship: c, x: c.p.x, y: 8, z: c.p.z }, 4, G.ISLANDS.find(I => I.name === 'CITADEL')); return [__rp.type, __sd.length] })()`);
  await h.waitFor('__sd.every(u => !__G.war.air.pending.includes(u))', 20000); await h.wait(5000);
  await h.eval('(() => { const G = __G, u = __sd[1]; G.H.reset(new G.THREE.Vector3(u.p.x + 20, u.p.y + 15, u.p.z + 20), 0, false, 1); G.HI.setCollective(0.475); window.__cam = { u, off: [8, 4, 16] }; return 1 })()'); await h.wait(1200); await h.shot('shahed_salvo');
  await h.eval('(() => { const G = __G, u = __rp; G.H.reset(new G.THREE.Vector3(u.p.x + 20, u.p.y + 15, u.p.z + 20), 0, false, 1); G.HI.setCollective(0.475); window.__cam = { u, off: [10, 5, 26] }; return 1 })()'); await h.wait(1200); await h.shot('reaper');
  await h.eval('(window.__cam = null, 1)');
  await h.eval('(__G.command(4), 1)');   // a fresh Tomcat for the REAPER and, later, the recovery
  await h.waitFor('__sd.every(u => u.dead || u.dying)', 120000);
  await h.eval('({ shahed: __sd.map(u => u.dead ? (u.hp > 0 ? "arrived" : "shot down") : "dying"), reaper: __rp.dying || __rp.dead, carrierHp: Math.round(__G.war.carrier.hp), feed: document.getElementById("feed").textContent.slice(0, 400) })');
  await h.waitFor('__esc().some(u => ["cap", "fight"].includes(u.ai.state))', 90000);
  // bingo: the pattern and the trap
  await h.eval(`(() => { const u = __esc().find(u => ['cap', 'fight'].includes(u.ai.state)); u.sim.fuel = 1850; window.__bu = u; return u.name })()`);
  await h.waitFor('__bu.ai.state === "final" || __bu.dead || __bu.dying', 120000);
  await h.waitFor('(__bu.ai.lso && __bu.ai.lso.R < 350) || __bu.dead || __bu.dying || __bu.ai.state !== "final"', 120000);
  await h.eval(`(() => { const G = __G, c = G.war.carrier; G.H.reset(new G.THREE.Vector3(c.p.x - 30, c.p.y + 28, c.p.z + 10), c.yaw + 2.6, false, 1); G.HI.setCollective(0.475); return __bu.ai.lso })()`);
  await h.eval('(window.__cam = { u: __bu, off: [6, 3, 30] }, 1)'); await h.wait(500); await h.shot('final');
  await h.waitFor('__bu.ai.recovered || __bu.dead || __bu.dying || __bu.ai.state === "waveoff"', 60000);
  await h.eval('(window.__cam = { u: __bu, off: [-12, 5, 24] }, 1)'); await h.wait(800); await h.shot('trap');
  await h.eval('({ state: __bu.ai.state, trapped: __bu.ai.trapped, waveoffs: __bu.ai.waveoffs, bolters: __bu.ai.bolters, log: __bu.ai.log.slice(-10).map(l => l.t + " " + l.msg).join("; ") })');
  await h.waitFor('__bu.ai.recovered || __bu.dead || __bu.dying', 240000);
  await h.expect('__bu.ai.recovered && !!__bu.ai.trapped');
}
