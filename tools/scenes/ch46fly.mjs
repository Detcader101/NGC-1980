// ch46fly: the player's CH-46F Sea Knight end to end. Taken out from the command board (\ then 9) on the ALBATROSS,
// cold and dark (?cold): the battery and the APU clicked on the overhead with the mouse, I for the rest of the start;
// ramp down, B: a stick of 13 Marines files up the ramp and sits in the troop seats; ramp up, lift off the moving deck,
// fly to the nearest unclaimed island, land, ramp down, B: the Marines come off by the ramp and the ground war has them.
// The flying is done through the real input path: a virtual HOTAS (stick, throttle lever = collective, pedals) set by
// a small in-page pilot (ch46C.testHands), the AFCS and the flight model doing the rest. Waits are on GAME time
// (headless runs at a few fps). Screenshots of every view for the quality pass.
//   from tools/:  CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/ch46fly.mjs
const C = '__G.ch46C';
// the in-page pilot: velocity toward the target by stick, heading by pedals, height by the collective lever
const PILOT = `(() => {
  const D = __G.ch46C, P = D.P, S = P.S, B = S.body, W = __G.war;
  const hw = { stick: { x: 0, y: 0 }, rudder: 0, throttle: S.c.coll, actions: {}, pressed: {}, hasPedals: true, source: 'TEST PILOT' };
  const A = window.__ap = { phase: 'hold', tgt: null, iF: 0, iR: 0, thr: S.c.coll, log: [] };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), att = {};
  P.collSrc = 'hotas'; P.lastHw = hw.throttle;
  const floor = (x, z, ux, uz, L) => { let m = 0; for (let s = 0; s <= L; s += 15) m = Math.max(m, __G.groundY(x + ux * s, z + uz * s) || 0); return m; };
  D.testHands = (P, dt, env) => {
    S.attitude(att); const yaw = att.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), x = B.pos[0], z = B.pos[2], y = B.pos[1];
    hw.stick.x = hw.stick.y = 0; hw.rudder = 0; hw.pressed = {};
    const T = A.tgt;
    if (!T || A.phase === 'hold' || A.phase === 'landed') { if (A.phase === 'landed') A.thr = Math.max(0, A.thr - 0.4 * dt); hw.throttle = A.thr; P.lastHw = hw.throttle; return hw; }
    const dx = T.x - x, dz = T.z - z, d = Math.hypot(dx, dz) || 1e-6, ux = dx / d, uz = dz / d, agl = S.agl;
    const sv = W.surfVel(x, z), bvx = sv ? sv.vx : 0, bvz = sv ? sv.vz : 0;
    let vDes = A.phase === 'down' ? 0 : Math.min(30, Math.sqrt(2 * 0.9 * Math.max(0, d - 1.5)), 0.3 * d);
    if (agl < 12 && A.phase === 'go') vDes = Math.min(vDes, 2 + agl * 0.4);
    const tvx = ux * vDes + (d < 60 ? 0 : 0), tvz = uz * vDes;
    const evx = tvx - B.vel[0], evz = tvz - B.vel[2], ef = evx * fx + evz * fz, er = evx * -fz + evz * fx;
    A.iF = clamp(A.iF + ef * 0.05 * dt, -0.3, 0.3); A.iR = clamp(A.iR + er * 0.05 * dt, -0.3, 0.3);
    hw.stick.y = clamp(-ef * 0.1 - A.iF, -0.8, 0.8); hw.stick.x = clamp(er * 0.1 + A.iR, -0.6, 0.6);
    if (d > 25 && A.phase === 'go') { const hT = Math.atan2(-dx, -dz); hw.rudder = clamp(-wrap(hT - yaw) * 1.2, -0.5, 0.5); if (Math.abs(hw.rudder) < 0.06) hw.rudder = 0; }
    const hDes = A.phase === 'down' ? -1e9 : d > 150 ? floor(x, z, ux, uz, Math.min(d, 300)) + 40 : T.y + 9 + Math.max(0, d - 15) * 0.2;
    let vyDes = A.phase === 'down' ? -clamp(0.4 + agl * 0.15, 0.4, 1.6) : clamp((hDes - y) * 0.35, -2.5, 3.5);
    if (A.phase === 'go' && agl < 8) vyDes = Math.max(vyDes, 1.5);   // off the deck: up first
    const vy = B.vel[1];
    A.thr = clamp(A.thr + (vyDes - vy) * 0.05 * dt * 6 + (vyDes - vy) * 0.004, 0, 1); if (S.torque > 0.98) A.thr -= 0.2 * dt;
    hw.throttle = A.thr;
    if (A.phase === 'go' && d < 3 && Math.hypot(B.vel[0], B.vel[2]) < 1.2 && Math.abs(y - (T.y + 9)) < 4) A.phase = 'down';
    if (A.phase === 'down' && B.contacts >= 3) { A.phase = 'landed'; A.log.push(['landed', +W.time.toFixed(1), +d.toFixed(1), +S.body.maxSink.toFixed(2)]); }
    return hw;
  };
  return 1;
})()`;

export default {
  name: 'ch46fly',
  query: '?debug&auto&kb&res=0.45&cold',
  run: async (h) => {
    const T0 = 'window.__t0', at = s => `__G.war.time > ${T0} + ${s}`;
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.Z.alive && __G.H.landed", 30000); await h.wait(500);
    await h.eval(`(__G.G.bench = true, __G.G.mat = 200, ${T0} = __G.war.time, { n: __G.fleet.n.ch46, gate: __G.war.allow(1, 'ch46') })`);
    await h.expect(`__G.fleet.n.ch46 === 2 && __G.war.allow(1, 'ch46')`, 'two Sea Knights in reserve, MARINE AIR ASSAULT researched at the start');

    // ---- 1. the board: \\ then 9 (the last row) takes one out on the ALBATROSS
    await h.key('tap', 'Backslash'); await h.wait(500);
    await h.expect("/CH-46/.test(document.getElementById('cmdBoard').textContent)", 'the command board lists the CH-46F');
    await h.shot('board');
    await h.key('tap', 'Digit9'); await h.wait(800);
    await h.expect(`__G.G.craft === 'ch46' && __G.fleet.n.ch46 === 1 && ${C}.present()`, 'board 9: a CH-46F out of the reserve (2 -> 1), you are in it');
    await h.expect(`__G.war.shipAt(${C}.P.S.body.pos[0], ${C}.P.S.body.pos[2]) === __G.war.carrier && ${C}.P.S.landed`, 'on its spot on the ALBATROSS deck, on the wheels');
    await h.expect(`!${C}.P.running() && ${C}.P.S.rpm < 0.01 && !${C}.P.sys.bat`, 'cold and dark (?cold): engines out, rotors stopped, battery off');
    await h.eval(`(${C}.orbitTo(2.2, 0.15, 26), 1)`); await h.wait(1200); await h.shot('cold-on-deck');

    // ---- 2. the start: BATTERY and APU clicked on the overhead with the mouse, then I
    await h.eval(`(${C}.view = 'cockpit', ${C}.lookAt(0.4, 1.0), 1)`); await h.wait(1500);
    await h.shot('cockpit-overhead-cold');
    const clickSw = async (id) => {
      const p = await h.eval(`(() => { const ck = ${C}.cockpit, o = ck.hitBoxes.find(b => b.userData.sw === '${id}'); o.updateWorldMatrix(true, false); const v = new __G.THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(__G.zCam); return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - v.y) / 2 * innerHeight), z: v.z }; })()`, 'screen point of ' + id);
      if (p && p.z < 1) await h.click(p.x, p.y);
      await h.wait(400);
    };
    await clickSw('bat');
    await h.expect(`${C}.P.sys.bat`, 'mouse click on the overhead BATTERY switch: battery on');
    await h.expect('!document.pointerLockElement', 'operating a cockpit switch leaves the cursor free for the next switch');
    await clickSw('apu');
    await h.expect(`${C}.P.sys.apu !== 'off'`, 'mouse click on APU: the APU starts');
    await h.waitFor(`${C}.P.sys.apu === 'on'`, 60000);
    await h.eval(`(${C}.lookAt(0, 0), ${C}.holdLook = false, 1)`);
    await h.key('tap', 'KeyI');
    await h.waitFor(`${C}.P.S.eng[0].lit`, 90000); await h.shot('cockpit-starting');
    await h.waitFor(`${C}.P.S.rpm > 0.97 && !${C}.P.sys.auto && ${C}.P.sys.ecl[0] === 1 && ${C}.P.sys.ecl[1] === 1 && !${C}.P.sys.rbrake`, 240000);
    await h.eval(`({ t: Math.round(__G.war.time - ${T0}), line: ${C}.P.line(), cautions: ${C}.P.sys.cautions })`, 'started');
    await h.expect(`${C}.P.sys.g1 && ${C}.P.sys.g2 && ${C}.P.S.landed`, 'both engines on line, generators on, still on the spot');
    await h.shot('cockpit-running');

    // ---- 3. the stick boards: R ramp down, B calls them
    await h.eval(`(${C}.view = 'chase', ${C}.orbitTo(2.75, 0.2, 30), 1)`);
    await h.key('tap', 'KeyR'); await h.waitFor(`${C}.P.ramp > 0.95`, 60000);
    await h.eval(`(window.__mat0 = __G.G.mat, 1)`);
    await h.key('tap', 'KeyB'); await h.wait(600);
    await h.expect(`${C}.troops.state === 'boarding' && __G.G.mat === window.__mat0 - 20`, 'B: a stick of 13 Marines called (20 materiel)');
    await h.waitFor(`${C}.troops.Q && ${C}.troops.Q.figs.some(F => F.st === 'embark' && F.delay <= 0)`, 60000); await h.wait(1500);
    await h.shot('marines-boarding');
    await h.expect(`${C}.troops.Q.figs.filter(F => F.st === 'stick' || F.st === 'embark').every(F => Math.abs(F.y - __G.groundY(F.x, F.z)) < 0.35 || F.wp >= 2)`, 'the stick stands on the deck (no floating, no sinking)');
    await h.waitFor(`${C}.troops.state === 'aboard'`, 120000);
    await h.expect(`${C}.P.marines === 13 && Math.abs(${C}.P.S.payload - 13 * 118) < 1`, '13 Marines aboard, their weight in the flight model');
    await h.eval(`(${C}.view = 'cabin', 1)`); await h.wait(1500); await h.shot('cabin-marines-seated');
    await h.eval(`(${C}.lookAt(Math.PI, -0.1), 1)`); await h.wait(1200); await h.shot('cabin-aft-ramp');
    await h.eval(`(${C}.lookAt(0, 0), ${C}.holdLook = false, ${C}.view = 'chase', ${C}.orbitTo(0, 0.1, 31), 1)`);
    await h.key('tap', 'KeyR'); await h.waitFor(`${C}.P.ramp < 0.05`, 60000);

    // ---- 4. lift off the deck and fly to the nearest unclaimed island
    await h.eval(PILOT, 'test pilot on');
    await h.eval(`(() => { const D = ${C}, x = D.P.S.body.pos[0], z = D.P.S.body.pos[2]; let best = null, bd = 1e9; for (const I of __G.ISLANDS) if (I.owner === 0 && !I.cave && I.pad) { const d = Math.hypot(I.pad.x - x, I.pad.z - z); if (d < bd) { bd = d; best = I; } }
      const lz = __G.war.rotary.chooseLZ(best, __G.war.rotary.FOOT.ch46); window.__isl = best.name; window.__ap.tgt = { x: lz.x, z: lz.z, y: lz.y }; window.__ap.phase = 'go'; D.P.sys.pbrake = false; return { island: best.name, dist: Math.round(bd), lz: [Math.round(lz.x), Math.round(lz.y), Math.round(lz.z)] }; })()`, 'target');
    await h.waitFor(`!${C}.P.S.landed && ${C}.P.S.agl > 6`, 90000);
    await h.expect(`${C}.P.alive`, 'lifted off the moving deck');
    await h.wait(1500); await h.shot('liftoff-chase');
    await h.waitFor(`${C}.P.ias() > 45 || window.__ap.phase !== 'go'`, 120000);
    await h.eval(`(${C}.view = 'cockpit', 1)`); await h.wait(1500); await h.shot('cockpit-cruise');
    await h.eval(`({ ias: Math.round(${C}.P.ias()), agl: Math.round(${C}.P.S.agl), line: ${C}.P.line() })`, 'cruise');
    await h.eval(`(${C}.view = 'chase', ${C}.orbitTo(0.6, 0.1, 31), 1)`); await h.wait(1200); await h.shot('cruise-chase');
    await h.waitFor(`window.__ap.phase === 'down' || !${C}.P.alive`, 300000);
    await h.wait(800); await h.shot('approach-hover');
    await h.waitFor(`window.__ap.phase === 'landed' || !${C}.P.alive`, 120000);
    await h.wait(2500);
    await h.eval(`({ log: window.__ap.log, sink: ${C}.P.maxSink, alive: ${C}.P.alive, hp: ${C}.P.hp, island: window.__isl })`, 'landed');
    await h.expect(`${C}.P.alive && ${C}.P.S.landed && ${C}.P.maxSink < 4.5 && ${C}.P.hp.gear === 1`, 'landed at the LZ within limits (no hard landing)');
    await h.shot('landed-lz');

    // ---- 5. Marines out by the ramp: the ground war takes them
    await h.eval(`(window.__px0 = __G.war.ground.proxies.length, window.__gs0 = __G.war.ground.sim.units.filter(u => u.side === 1 && u.kind === 'marine').length, 1)`);
    await h.key('tap', 'KeyB'); await h.wait(500);   // ramp coming down (B lowers it first)
    await h.waitFor(`${C}.P.ramp > 0.95`, 60000);
    await h.key('tap', 'KeyB'); await h.wait(600);
    await h.expect(`${C}.troops.state === 'deploying'`, 'B at the LZ: the troops go out by the ramp');
    await h.eval(`(${C}.orbitTo(Math.PI * 0.85, 0.18, 30), 1)`);
    await h.waitFor(`${C}.troops.Q && ${C}.troops.Q.figs.filter(F => F.st === 'gone' || F.st === 'path').length >= 3`, 60000); await h.wait(600);
    await h.shot('marines-dismounting');
    await h.waitFor(`${C}.troops.state === 'empty'`, 120000); await h.wait(1500);
    await h.eval(`({ proxies: __G.war.ground.proxies.length - window.__px0, marines: __G.war.ground.sim.units.filter(u => u.side === 1 && u.kind === 'marine').length - window.__gs0, aboard: ${C}.P.marines })`, 'handed over');
    await h.expect(`${C}.P.marines === 0 && __G.war.ground.sim.units.filter(u => u.side === 1 && u.kind === 'marine').length - window.__gs0 >= 13`, 'all 13 off the ramp and fighting as ground-war Marines');
    await h.shot('marines-on-the-ground');
    await h.eval(`(${C}.view = 'cockpit', 1)`); await h.wait(1200); await h.shot('cockpit-at-lz');
    await h.notblank(0.05);
  },
};
