// AIRLIFT: the Huey's cargo hook and troop lift in the game. The M35A2 is TOO HEAVY for the hook (the crew chief says
// so); the Huey (flown by the crew's AI pilot through the real flight model: G.benchAI) is talked onto an M151A2, the
// hookup man puts the apex on the hook, she lifts it, flies it to another island and sets it down; R releases it and it
// is a unit there (the command board lists it, you can switch into it). Then a squad of six boards on the pad (.),
// rides on the bench and in the doors, and dismounts at the other island into the ground war.
// All waits are on game state (headless runs at 1-8 fps).
export default {
  name: 'airlift',
  query: '?debug&auto&kb&res=0.45',
  run: async (h) => {
    const AL = '__G.airlift';
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 30000); await h.wait(500);
    await h.eval(`(() => { const G = __G.G; G.bench = true; G.benchAI = true; G.mat = 500; G.fuel = 50;
      const isl = __G.ISLANDS.filter(I => I.pad && !I.cave), A = __G.HOME_B.isl;
      let B = null, bd = 1e9; for (const I of isl) { if (I === A) continue; const d = Math.hypot(I.pad.x - A.pad.x, I.pad.z - A.pad.z); if (d < bd) { bd = d; B = I; } }
      window.__A = A; window.__B = B; return { A: A.name, B: B && B.name, owner: B && B.owner, d: Math.round(bd) }; })()`, 'islands');
    const hoverOver = (v, agl) => `(() => { const V = ${v}, p = V.sim.pos, g = __G.groundY(p[0], p[2]); __G.H.reset(new __G.THREE.Vector3(p[0], g + ${agl}, p[2] + 0.15), 0, false, 1); __G.HI.setCollective(0.5); __G.G.heliColl = 0.5; return Math.round(g); })()`;

    // ---- 1. the M35A2: too heavy for a 4,000 lb hook
    await h.eval(`(window.__M35 = __G.pool.list.find(V => V.type === 'm35' && V.home === __A && V.exists), !!__M35)`, 'the island M35');
    await h.eval(hoverOver('__M35', 9));
    await h.waitFor(`${AL}.near && ${AL}.near.V === __M35`, 60000);
    await h.expect(`/TOO HEAVY/.test(${AL}.near.why) && /4,000 LB/.test(${AL}.near.why)`, 'the crew chief: the M35A2 is TOO HEAVY for the hook (numbers shown)');
    await h.eval(`${AL}.near.why`);
    await h.shot('m35-too-heavy');

    // ---- 2. an M151A2 at the home island: talked on, hooked up
    await h.eval(`(() => { const sp = { x: __M35.sim.pos[0] + 30, z: __M35.sim.pos[2] + 10, yaw: 0.5 }; window.__V = __G.pool.spawners.m151(sp); return !!__V && __V.sim.pos.map(Math.round); })()`, 'an M151A2');
    await h.eval(hoverOver('__V', 12));
    await h.eval(`(() => { const p = __V.sim.pos; window.__T = { x: p[0], y: __G.groundY(p[0], p[2]), z: p[2] + 0.15, vx: 0, vz: 0, hdg: null, hover: 3.0 }; __G.heliAI.engage(__G.H, () => __T); return __G.heliAI.phase; })()`);
    await h.waitFor(`${AL}.near && ${AL}.near.V === __V && ${AL}.near.d < 3`, 120000);
    await h.eval(`({ call: ${AL}.near.call, dy: ${AL}.near.dy.toFixed(2), ai: __G.heliAI.phase })`, 'crew chief');
    await h.expect(`/FORWARD|BACK|LEFT|RIGHT|DOWN|UP|HOLD/.test(${AL}.near.call) && document.getElementById('airlift').classList.contains('on')`, 'the crew chief talks the pilot on; the hook HUD is up');
    await h.shot('hookup-approach');
    await h.waitFor(`${AL}.near && ${AL}.near.ready`, 120000);
    await h.shot('hookup-man-ready');
    await h.eval(`(${AL}.camLocal = [[2.2, -0.9, 0.9], [0, -5.5, 0.2]], 1)`); await h.wait(700); await h.shot('hookup-man-from-the-door');
    await h.eval(`${AL}.button()`);
    await h.expect(`!!${AL}.load && ${AL}.load.V === __V && __V.slung`, 'R: hooked up - the M151A2 is on the hook');
    // the hookup man: down and running clear
    await h.wait(2500); await h.shot('hookup-man-clear'); await h.eval(`(${AL}.camLocal = null, 1)`);

    // ---- 3. lift and fly it to the other island
    await h.eval(`(() => { const B = __B, p = B.pad; window.__T2 = { x: p.x + 22, y: __G.groundY(p.x + 22, p.z + 8), z: p.z + 8, vx: 0, vz: 0, hdg: null, hover: 4.0, gentle: true, cruise: 20 }; __G.heliAI.engage(__G.H, () => __T2); return __G.heliAI.phase; })()`);
    await h.waitFor(`${AL}.load && !${AL}.load.S.ground && ${AL}.load.S.taut`, 120000);
    await h.expect(`${AL}.load.S.Tg > 0.8 && __G.H.torque > 30`, 'the load is off the ground: tension on the hook, torque up');
    await h.eval(`({ Tg: ${AL}.load.S.Tg.toFixed(2), tq: __G.H.torque.toFixed(1), mass: Math.round(__G.H.mass) })`);
    await h.wait(1500); await h.shot('load-lifted');
    await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1200); await h.shot('cockpit-hooked'); await h.eval('(__G.cockpitCam = false, 1)');
    await h.waitFor(`__G.H.ias > 25 && ${AL}.load && !${AL}.load.S.ground`, 240000);
    await h.eval(`({ ias: Math.round(__G.H.ias), swing: ${AL}.load.S.swingDeg.toFixed(1), y: Math.round(__G.H.pos.y) })`, 'en route');
    await h.wait(800); await h.shot('load-in-transit');
    await h.eval(`(${AL}.camLocal = [[-22, -3, 4], [0, -6, 0.5]], 1)`); await h.wait(900); await h.shot('load-in-transit-side'); await h.eval(`(${AL}.camLocal = null, 1)`);
    await h.eval('(__G.cockpitCam = true, __G.head.pitch = -0.55, __G.head.yaw = 0.5, 1)'); await h.wait(1200); await h.shot('cockpit-in-transit'); await h.eval('(__G.cockpitCam = false, __G.head.pitch = 0, __G.head.yaw = 0, 1)');
    await h.waitFor(`${AL}.load && ${AL}.load.S.ground && ${AL}.load.S.Tg < 0.35 && Math.hypot(__G.H.pos.x - __T2.x, __G.H.pos.z - __T2.z) < 6`, 600000);
    await h.shot('load-set-down');
    await h.eval(`${AL}.button()`);
    await h.expect(`!${AL}.load && !__V.slung && __V.exists && !__V.wrecked`, 'R: released - the M151A2 is on its wheels');
    await h.expect(`__G.roster.find(r => r.id === 'm151').out() && Math.hypot(__V.sim.pos[0] - __B.pad.x, __V.sim.pos[2] - __B.pad.z) < 60`, 'the jeep is at the other island (a unit out on the command board)');
    await h.eval(`({ where: __V.sim.pos.map(Math.round), B: __B.name })`);
    // the commander can switch into it, and back to the Huey
    await h.eval(`__G.crafts.control(__V.id, 0, 'command')`); await h.wait(600);
    await h.expect(`__G.crafts.active === __V`, 'switched into the delivered M151A2');
    await h.wait(800); await h.shot('in-the-delivered-jeep');
    await h.eval(`__G.crafts.control('heli', 0, 'command')`); await h.wait(600);
    await h.expect(`__G.G.craft === 'heli'`, 'back in the Huey');

    // ---- 4. troop lift: land on the home pad, call a squad, they board
    await h.eval(`(() => { const p = __A.pad; __G.heliAI.off(); __G.H.reset(new __G.THREE.Vector3(p.x, __G.groundY(p.x, p.z) + 2, p.z), 0.3, true, 1); __G.HI.setCollective(0); __G.G.heliColl = 0; return 1; })()`);
    await h.waitFor('__G.H.landed', 30000); await h.wait(600);
    await h.key('tap', 'Period'); await h.wait(500);
    await h.expect(`${AL}.troops && ${AL}.troops.st === 'boarding'`, '. on the pad: a squad called from the barracks');
    await h.eval(`(${AL}.camLocal = [[-11, 1.2, -12], [-5, -1.6, -5]], 1)`); await h.wait(2500); await h.shot('squad-waiting');
    await h.waitFor(`${AL}.troops && ${AL}.troops.Q.figs.some(F => F.st === 'embark' && F.wp > 0)`, 120000);
    await h.eval(`(${AL}.camLocal = [[-7, 0.6, 5], [-1, -1.2, 0.8]], 1)`); await h.wait(600); await h.shot('squad-running-in'); await h.eval(`(${AL}.camLocal = null, 1)`);
    await h.waitFor(`${AL}.troops && ${AL}.troops.st === 'aboard'`, 240000);
    await h.expect(`${AL}.troops.aboard() === 6 && __G.airlift.mass() === 630`, 'six aboard (630 kg on the airframe)');
    await h.wait(600);
    await h.eval(`(${AL}.camLocal = [[6.5, 0.6, 1.0], [0, -0.8, 1.5]], 1)`); await h.wait(900); await h.shot('troops-aboard-outside');
    await h.eval(`(${AL}.camLocal = [[-4.2, 1.2, -1.2], [0, -0.8, 1.4]], 1)`); await h.wait(900); await h.shot('troops-aboard-left');
    await h.eval(`(${AL}.camLocal = [[0.05, 0.3, -1.25], [0, -0.75, 2.1]], 1)`); await h.wait(900); await h.shot('troops-from-the-cockpit-looking-aft');
    await h.eval(`(${AL}.camLocal = null, 1)`);

    // ---- 5. fly them to the other island, land, put them out: they join the ground war there
    await h.eval(`(() => { const p = __B.pad; window.__T3 = { x: p.x - 18, y: __G.groundY(p.x - 18, p.z - 6), z: p.z - 6, vx: 0, vz: 0, hdg: null }; window.__mar0 = __G.war.ground.presence(__B, 1); __G.heliAI.engage(__G.H, () => __T3); __G.heliAI.phase = 'transit'; return { ai: __G.heliAI.phase, mar0: __mar0 }; })()`);
    await h.waitFor('!__G.H.landed', 60000);
    await h.wait(3000); await h.shot('troop-lift-flying');
    await h.waitFor(`__G.heliAI.phase === 'landed' && __G.H.landed`, 600000);
    await h.eval('(__G.heliAI.off(), 1)'); await h.wait(500);
    await h.key('tap', 'Period'); await h.wait(500);
    await h.expect(`!${AL}.troops && __G.war.ground.landings.some(L => L.I === __B)`, '. on the island: the squad dismounts into the ground war');
    await h.eval(`(${AL}.camLocal = [[7, 9, -12], [0, -1.6, 2]], 1)`); await h.wait(1500); await h.shot('squad-dismounting');
    await h.waitFor(`__G.war.ground.presence(__B, 1) >= __mar0 + 4`, 240000);
    await h.expect(`__G.war.ground.presence(__B, 1) >= __mar0 + 4`, 'the Marines are fighting units on the island now');
    await h.eval(`({ marines: __G.war.ground.presence(__B, 1), was: __mar0 })`);
    await h.wait(3000); await h.shot('squad-on-the-island'); await h.eval(`(${AL}.camLocal = null, 1)`);
  },
};
