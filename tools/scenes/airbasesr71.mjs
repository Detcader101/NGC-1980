// (ngc/look-airbases) the SR-71A sortie from the air base (companion of airbase.mjs, which flies the C-130): the board's
// SR-71 row (\ , down, ENTER) puts the crew in her in shelter 1, cold; I: the start cart lights both J58s; she taxis
// out of the shelter under her own power; SHIFT+L tows her to the runway; a keyboard take-off (SHIFT to MIL, again
// into AB, S at ~190 KIAS); N: the home autopilot flies the SR-71 approach, the 155 KIAS touchdown, the drag chute, the
// stop; O engines off: the crew tows her into the shelter, the sortie ends, she is back in reserve.
//   from tools/:  CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/airbasesr71.mjs
const C = '__AIRBASE.sr71C', A = `${C}.sim`, L = '__AIRBASE.AIRBASE';
const chase = (yaw, pitch, dist) => `(${C}.P.view = 'chase', Object.assign(${C}.P.chase, { yaw: ${yaw}, pitch: ${pitch}, dist: ${dist} }), 1)`;
export default {
  name: 'airbasesr71',
  query: '?debug&auto&kb&res=0.5',
  run: async (h) => {
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.Z.alive && __G.H.landed && window.__AIRBASE && __AIRBASE.sr71C", 40000); await h.wait(500);
    await h.eval('(__G.G.bench = true, 1)');
    await h.expect(`__G.fleet.n.sr71 === 1 && !${C}.present() && ${C}.P.exists && ${L}.onPavement(${A}.pos.x, ${A}.pos.z) === 'hangar'`, 'one SR-71A in reserve, parked in her shelter');
    // ---- the board
    await h.key('tap', 'Backslash'); await h.wait(500);
    const idx = await h.eval(`__G.roster.findIndex(r => r.id === 'sr71')`, 'row');
    for (let i = 0; i < idx; i++) { await h.key('tap', 'ArrowDown'); await h.wait(120); }
    await h.wait(400); await h.shot('board-sr71');
    await h.expect(`/DEPLOY AT WESTGATE/.test(document.querySelector('#cmdBoard .row.sel').textContent)`, 'the SR-71 row deploys at the air base');
    await h.key('tap', 'Enter'); await h.wait(1200);
    await h.expect(`__G.G.craft === 'sr71' && ${C}.present() && __G.fleet.n.sr71 === 0 && ${A}.onGround && !${A}.eng.some(e => e.run)`, 'ENTER: out of the reserve, in her shelter, cold');
    await h.eval(chase('Math.PI', 0.02, 30)); await h.wait(2000); await h.shot('sr71-in-shelter');
    // ---- start
    await h.key("tap", "KeyI"); await h.waitFor(`${A}.eng.every(e => e.run)`, 600000);
    await h.expect(`${A}.eng.every(e => e.run) && ${A}.onGround`, 'I: the start cart lights both J58s');
    await h.eval(chase(0, 0.1, 40)); await h.wait(1200); await h.shot('engines-running-in-shelter');
    // ---- taxi out of the shelter
    await h.eval(`(window.__p0 = ${A}.pos.clone(), 1)`);
    await h.key('down', 'ShiftLeft'); await h.wait(600); await h.key('up', 'ShiftLeft');
    await h.waitFor(`${A}.pos.distanceTo(window.__p0) > 30 || !${C}.present()`, 60000);
    await h.expect(`${C}.present() && ${A}.onGround && ${A}.pos.distanceTo(window.__p0) > 30`, 'taxied out of the shelter under her own power');
    await h.key('down', 'ControlLeft'); await h.wait(1500); await h.key('up', 'ControlLeft');
    await h.eval(chase('Math.PI * 0.7', 0.15, 45)); await h.wait(800); await h.shot('taxi-out');
    await h.key('down', 'KeyB'); await h.waitFor(`Math.hypot(${A}.vel.x, ${A}.vel.z) < 0.5`, 40000); await h.key('up', 'KeyB');
    // ---- tow to the runway, keyboard take-off
    await h.key('down', 'ShiftLeft'); await h.key('tap', 'KeyL'); await h.key('up', 'ShiftLeft'); await h.wait(400);
    await h.expect(`${L}.onRunway(${A}.pos.x, ${A}.pos.z) && ${A}.eng.every(e => e.run)`, 'SHIFT+L: towed to the runway, engines running');
    await h.eval(chase(0, 0.1, 40)); await h.wait(1000); await h.shot('lined-up');
    await h.eval(`(${C}.warp = 2, 1)`);
    await h.key('down', 'ShiftLeft'); await h.waitFor(`${C}.P.thr >= 0.659`, 30000); await h.key('up', 'ShiftLeft'); await h.wait(300);
    await h.key('down', 'ShiftLeft'); await h.waitFor(`${C}.P.thr > 0.97`, 30000);
    await h.waitFor(`${A}.kias > 150`, 60000);
    // the rotation: a test pilot's hand on the stick (the sr71.mjs law: toward 9 deg from 190 KIAS) - a held S key is full back stick
    await h.eval(`(window.__ov0 = ${C}.P.override, ${C}.P.override = c => { window.__ov0(c); const p = ${A}.attitude().pitch; if (${A}.kias > 190) c.pitch = Math.max(-1, Math.min(1, (0.16 - p) * 6 - ${A}.w.y * 2)); }, 1)`);
    await h.waitFor(`!${A}.onGround || !${C}.present()`, 30000); await h.waitFor(`${A}.pos.y - ${L}.E > 40 || !${C}.present()`, 120000);
    await h.eval(`(${C}.P.override = window.__ov0, ${A}.ap.on = true, ${A}.ap.pitch = 'att', ${A}.ap.att = 0.12, ${A}.ap.roll = 'hdg', ${A}.ap.hdg = ${A}.heading, 1)`);
    await h.eval(`(${C}.warp = 1, 1)`); await h.wait(1200); await h.shot('takeoff');
    await h.key('up', 'ShiftLeft');
    await h.expect(`!${A}.onGround && ${C}.present()`, 'keyboard take-off: airborne in AB');
    await h.eval(`(${C}.warp = 2, 1)`);
    await h.waitFor(`${A}.pos.y - ${L}.E > 80 || !${C}.present()`, 60000);
    await h.key('tap', 'KeyG');
    // ---- N: home
    await h.key('tap', 'KeyN');
    await h.expect(`${C}.home && ${C}.present()`, 'N: the home autopilot has her');
    await h.waitFor(`(${C}.home && ${C}.home.phase === 'final') || !${C}.present()`, 600000);
    await h.eval(`(${C}.warp = 1, 1)`); await h.eval(chase(0, 0.05, 45)); await h.wait(1500); await h.shot('final');
    await h.eval(`(${C}.warp = 2, 1)`);
    await h.waitFor(`(${C}.home && ${C}.home.phase === 'rollout' && ${A}.chute === 'deployed') || !${C}.present()`, 600000);
    await h.eval(`(${C}.warp = 1, 1)`); await h.eval(chase('Math.PI * 0.8', 0.1, 55)); await h.wait(800); await h.shot('rollout-drag-chute');
    await h.waitFor(`!${C}.home || !${C}.present()`, 400000);
    await h.eval(`({ v: Math.round(${L}.toL(${A}.pos.x, ${A}.pos.z)[1] * 10) / 10, chute: ${A}.chute, fuelLb: Math.round(${A}.fuel * 2.2046) })`, 'stopped');
    await h.expect(`${C}.present() && ${C}.sortie.airborne && ${C}.sortie.stopped && ${L}.onRunway(${A}.pos.x, ${A}.pos.z)`, 'landed and stopped on the runway');
    await h.wait(800); await h.shot('stopped-on-runway');
    // ---- O: engines off - the crew tows her in
    await h.key('tap', 'KeyO'); await h.waitFor(`!${C}.present()`, 60000);
    await h.expect(`!${C}.present() && __G.fleet.n.sr71 === 1 && __G.G.craft !== 'sr71' && ${L}.onPavement(${A}.pos.x, ${A}.pos.z) === 'hangar'`, 'O: engines off, towed into her shelter, the sortie complete, back in reserve');
    // the picture: through the C-130's fixed camera (a sortie of it, for the shot)
    await h.eval(`(__G.commander.deploy('c130'), 1)`); await h.wait(800);
    await h.eval(`(() => { const p = ${L}.toW(-470, 470), q = ${L}.toW(-500, 545); __AIRBASE.c130C.camAt = [p[0], ${L}.E + 6, p[1], q[0], ${L}.E + 3, q[1]]; return 1; })()`); await h.wait(2500);
    await h.shot('sr71-parked-in-shelter');
    await h.notblank(0.05);
  },
};
