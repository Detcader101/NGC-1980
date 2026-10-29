// (ngc/look-airbases) the air base end to end: the C-130H taken out from the command board at the air base (the
// keyboard path: \ then down to the C-130 row, ENTER), on the ramp in front of the maintenance hangar; taxi a little on
// the real flight model; SHIFT+L lines her up; a keyboard take-off (SHIFT full power, S rotate); N: the autopilot
// flies home, the approach and the landing; stopped on the runway, O hands her in: towed into the hangar, the sortie
// ends, back in the Huey, the C-130 back in reserve. Screenshots of the base from the ground, 300 m, 3000 m and long
// range, the C-130 in its hangar, the cockpit, and the map.
//   from tools/:  CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/airbase.mjs
const C = '__AIRBASE.c130C', L = '__AIRBASE.AIRBASE';
const CS = `(${L}.ends[0].obst < ${L}.ends[1].obst ? -1 : 1)`;   // the side the clear approach comes in from (-u for RWY end 0)
const cam = (u, v, y, lu, lv, ly) => `(() => { const A = ${L}, p = A.toW(${u}, ${v}), q = A.toW(${lu}, ${lv}); ${C}.camAt = [p[0], A.E + ${y}, p[1], q[0], A.E + ${ly}, q[1]]; return 1; })()`;
export default {
  name: 'airbase',
  query: '?debug&auto&kb&res=0.5',
  run: async (h) => {
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.Z.alive && __G.H.landed && window.__AIRBASE", 40000); await h.wait(500);
    await h.eval(`(__G.G.bench = true, { base: ${L}.label, x: Math.round(${L}.x), z: Math.round(${L}.z), E: ${L}.E, n: __G.fleet.n.c130, mesh: __AIRBASE.AIRBASE_MESH.lightCount })`, 'base');
    await h.expect(`__G.fleet.n.c130 === 1 && __AIRBASE.c130C.parked && !__AIRBASE.c130C.present()`, 'one C-130H in reserve, parked in its hangar');
    await h.expect(`Math.abs(__G.groundY(${L}.x, ${L}.z) - ${L}.E) < 0.01`, 'the runway ground is the flattened field elevation (physics)');

    // ---- 1. the board: \\ , down to the C-130 row, ENTER
    await h.key('tap', 'Backslash'); await h.wait(500);
    await h.expect("/C-130/.test(document.getElementById('cmdBoard').textContent) && /SR-71/.test(document.getElementById('cmdBoard').textContent)", 'the command board lists the C-130H and the SR-71A');
    const idx = await h.eval(`__G.roster.findIndex(r => r.id === 'c130')`, 'row');
    for (let i = 0; i < idx; i++) { await h.key('tap', 'ArrowDown'); await h.wait(120); }
    await h.wait(400); await h.shot('board-c130');
    await h.expect(`/DEPLOY AT ${'WESTGATE'}/.test(document.querySelector('#cmdBoard .row.sel').textContent)`, 'the C-130 row deploys at the air base whatever base is selected');
    await h.key('tap', 'Enter'); await h.wait(1200);
    await h.expect(`__G.G.craft === 'c130' && ${C}.present() && __G.fleet.n.c130 === 0`, 'ENTER: the C-130H out of the reserve, you are in it');
    await h.expect(`${C}.S.onGround && ${L}.onPavement(${C}.S.pos.x, ${C}.S.pos.z) === 'ramp' && ${C}.S.eng.every(e => e.run)`, 'on the ramp in front of the hangar, engines running');

    // ---- 2. the base from every view (fixed cameras; the C-130 on the ramp in them)
    const views = [
      ['ramp-ground', cam(-640, 470, 1.8, -737, 560, 6)],
      ['hangar-row', cam(-560, 420, 3, -560, 560, 8)],
      ['tower-firestation', cam(-60, 470, 2, -150, 545, 14)],
      ['runway-threshold', cam(-1829 - 120, 0, 4, 0, 0, 0)],
      ['air-300m', cam(`${CS} * 1400`, -900, 300, -400, 300, 0)],
      ['air-3000m', cam(`${CS} * 3500`, -2500, 3000, 0, 300, 0)],
      ['long-range', cam(`${CS} * 6500`, -1200, 700, 0, 200, 0)],
      ['final-approach-view', cam(`${CS} * 4200`, 0, 230, 0, 0, 0)],
    ];
    for (const [n, js] of views) { await h.eval(js); await h.wait(2500); await h.shot(n); }
    // the C-130 in its hangar: parked there for the picture (the hangar slot the sortie ends in), then back on the ramp
    await h.eval(`(() => { ${C}.parkAt(${L}.spot('c130', 'park')); return 1; })()`);
    await h.eval(cam(-700, 470, 8, -737, 545, 5)); await h.wait(2500); await h.shot('c130-in-hangar');
    await h.eval(cam(-690, 524, 4, -745, 548, 5)); await h.wait(1500); await h.shot('hangar-inside');
    await h.eval(`(() => { ${C}.spawnAt(${L}.spot('c130', 'ramp'), 'hot'); ${C}.camAt = null; return 1; })()`);
    await h.eval(`(${C}.view = 'chase', ${C}.orbitTo(2.4, 0.15, 60), 1)`); await h.wait(1500); await h.shot('c130-on-ramp-chase');
    await h.eval(`(${C}.view = 'cockpit', 1)`); await h.wait(1500); await h.shot('cockpit-on-ramp');

    // ---- 3. taxi on the flight model: brake off, a little power, she rolls; brake
    await h.key('tap', 'KeyB'); await h.eval(`(window.__p0 = ${C}.S.pos.clone(), 1)`);
    await h.key('down', 'ShiftLeft'); await h.wait(700); await h.key('up', 'ShiftLeft');
    await h.waitFor(`${C}.S.pos.distanceTo(window.__p0) > 6`, 40000);
    await h.expect(`${C}.S.onGround && !${C}.S.dead`, 'taxiing on the ramp under her own power');
    await h.eval(`(${C}.view = 'chase', 1)`); await h.wait(1200); await h.shot('taxi');
    await h.key('down', 'ControlLeft'); await h.wait(900); await h.key('up', 'ControlLeft');
    await h.key('tap', 'KeyB'); await h.waitFor(`Math.hypot(${C}.S.vel.x, ${C}.S.vel.z) < 0.5`, 40000);

    // ---- 4. SHIFT+L line up; keyboard take-off
    await h.key('down', 'ShiftLeft'); await h.key('tap', 'KeyL'); await h.key('up', 'ShiftLeft');
    await h.wait(400);
    await h.expect(`${L}.onRunway(${C}.S.pos.x, ${C}.S.pos.z) && ${C}.S.flap > 0.45`, 'SHIFT+L: lined up on the runway, flaps 50');
    await h.wait(800); await h.shot('lined-up');
    await h.eval(`(${C}.warp = 3, 1)`);
    await h.key('down', 'ShiftLeft');
    await h.waitFor(`${C}.S.kias > 105`, 60000);
    await h.key('down', 'KeyS'); await h.waitFor(`!${C}.S.onGround`, 30000); await h.key('up', 'KeyS');
    await h.waitFor(`${C}.S.pos.y - ${L}.E > 25`, 30000); await h.key('down', 'KeyS'); await h.wait(300); await h.key('up', 'KeyS'); await h.key('up', 'ShiftLeft');
    await h.expect(`!${C}.S.onGround && !${C}.S.dead`, 'keyboard take-off: airborne');
    await h.eval(`(${C}.warp = 1, 1)`); await h.wait(1500); await h.shot('takeoff-chase');
    await h.eval(`(${C}.warp = 3, 1)`);
    await h.waitFor(`${C}.S.pos.y - ${L}.E > 20`, 60000);
    await h.key('tap', 'KeyG');
    // ---- 5. N: home, approach, landing
    await h.key('tap', 'KeyN');
    await h.expect(`${C}.ap && ${C}.ap.mode === 'home'`, 'N: the autopilot takes her home');
    await h.waitFor(`${C}.ap && ${C}.ap.final`, 400000);
    await h.eval(`(${C}.warp = 1, ${C}.view = 'cockpit', 1)`); await h.wait(1500); await h.shot('final-cockpit');
    await h.eval(`(${C}.view = 'chase', ${C}.orbitTo(0.3, 0.1, 70), ${C}.warp = 3, 1)`);
    await h.waitFor(`${C}.ap && ${C}.ap.flare || !${C}.present()`, 400000);
    await h.eval(`(${C}.warp = 1, 1)`); await h.wait(500); await h.shot('flare');
    await h.waitFor(`!${C}.present() || (${C}.sortie.stopped && ${C}.S.onGround)`, 200000);
    await h.expect(`${C}.present() && ${C}.sortie.airborne && ${L}.onRunway(${C}.S.pos.x, ${C}.S.pos.z)`, 'landed on the runway and stopped');
    await h.eval(`({ v: Math.round(${L}.toL(${C}.S.pos.x, ${C}.S.pos.z)[1] * 10) / 10, hdg: Math.round(((-${C}.S.heading * 180 / Math.PI) % 360 + 360) % 360), nzMax: ${C}.S.nzMax })`, 'rollout');
    await h.shot('stopped-on-runway');
    // ---- 6. O: hand in - towed into the hangar, the sortie ends
    await h.key('tap', 'KeyO'); await h.wait(1500);
    await h.expect(`!${C}.present() && ${C}.parked && __G.fleet.n.c130 === 1 && __G.G.craft !== 'c130'`, 'O: parked in the hangar, the sortie complete, the C-130 back in reserve, you are back in another unit');
    await h.expect(`(() => { const sp = ${L}.spot('c130', 'park'); return Math.hypot(${C}.S.pos.x - sp.x, ${C}.S.pos.z - sp.z) < 1; })()`, 'the C-130 stands in the maintenance hangar');
    // the map
    await h.key('tap', 'KeyM'); await h.wait(1200); await h.shot('command-map'); await h.key('tap', 'KeyM'); await h.wait(500);
    await h.shot('minimap-at-base');
    await h.notblank(0.05);
  },
};
