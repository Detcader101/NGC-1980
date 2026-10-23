// NGC-1980 air defence units: model close-ups and engagements in dev/defence.html.
//   node snap.mjs scenes/defence.mjs            (all)
//   DEF_PART=models|fight node snap.mjs scenes/defence.mjs
// Engagements are stepped with __D.run(sec) (fixed 1/30 s steps), so they are deterministic enough to assert on
// even when headless frames are slow.
const PART = process.env.DEF_PART || 'all';
const VIEWS = {   // unit: [camera for the 3/4 view, camera for a second angle]
  vads: ['0.75,0.3,10,0,1.4,0', '-2.4,0.25,9,0,1.6,0'],
  shilka: ['0.75,0.28,12,0,1.4,0', '-2.5,0.35,11,0,1.8,0'],
  ciws: ['0.75,0.2,7,0,1.6,0', '-2.3,0.3,7,0,1.8,0'],
  sparrow: ['0.8,0.22,9,0,1.6,0', '-2.5,0.2,9,0,1.6,0'],
  talon: ['0.8,0.25,17,0,2.0,0', '-2.4,0.3,16,0,2.4,0'],
  lance: ['0.8,0.18,12,0,2.4,0', '-2.4,0.25,11,0,2.6,0'],
};
export default async function (h) {
  if (PART === 'all' || PART === 'models') {
    await h.goto('dev/defence.html?mode=lineup&ui=0&cam=0.45,0.2,48,0,1.5,0');
    await h.waitFor('window.__D', 15000);
    await h.wait(600); await h.shot('lineup');
    for (const [type, cams] of Object.entries(VIEWS)) {
      await h.goto(`dev/defence.html?mode=view&unit=${type}&ui=0&drones=0`);
      await h.waitFor('window.__D && __D.unit', 15000);
      // a pose: turret off to one side, barrels raised
      await h.eval(`(() => { __D.pause(); const u = __D.unit, ud = u.mesh.userData; u.mesh.rotation.y = 0; ud.yaw.rotation.y = 0.45; ud.pitch.rotation.x = 0.32; return ud.stats; })()`);
      for (let i = 0; i < cams.length; i++) {
        await h.eval(`(() => { const [y, p, d, x, yy, z] = '${cams[i]}'.split(',').map(Number); Object.assign(__D.cam, { yaw: y, pitch: p, dist: d }); __D.cam.t.set(x, yy, z); return 1; })()`);
        await h.wait(350); await h.shot(`${type}-${i ? 'front' : 'rear'}`);
      }
    }
  }
  if (PART === 'all' || PART === 'fight') {
    // each unit against three drones: it must find, lock, fire and score hits
    for (const type of ['vads', 'shilka', 'ciws', 'sparrow', 'talon', 'lance']) {
      await h.goto(`dev/defence.html?mode=fight&unit=${type}&drones=3&hill=0&panel=0`);
      await h.waitFor('window.__D && __D.unit', 15000);
      await h.eval(`(__D.pause(), __D.run(6), ({ mode: __D.unit.def.mode, lock: +__D.unit.def.lockT.toFixed(2), hits: __D.S.hits, kills: __D.S.kills, msl: __D.def.missiles.length }))`);
      // freeze on a frame with something in the air: step until a burst / missile / beam is visible
      await h.eval(`(() => { for (let i = 0; i < 400; i++) { __D.run(1 / 30); const D = __D.unit.def; if (D.flashT > 0 || (__D.def.missiles.length && __D.def.missiles[0].age > 0.7) || (D.beam && D.beam.st === 'on' && D.beam.dwell > 0.3)) break; } const D = __D.unit.def; __D.frame(); return { d: D.d, st: D.beam && D.beam.st }; })()`);
      await h.wait(300); await h.shot(`fight-${type}`);
      await h.eval(`(__D.run(14), ({ hits: __D.S.hits, kills: __D.S.kills }))`);
      await h.expect(`__D.S.hits > 0`);
    }
    // line of sight: a drone behind the ridge is never locked
    await h.goto('dev/defence.html?mode=fight&unit=talon&drones=0&panel=0');
    await h.waitFor('window.__D && __D.unit', 15000);
    await h.eval(`(() => { __D.pause(); const d = __D.addDrone(0); d.R = 1; d.spd = 0; d.alt = 0; d.ph = 0; d.mesh.position.set(0,0,0); __D.setUnit('talon');
      // park it low behind the ridge (ridge at x = 70)
      d.ph = 0; d.R = 115; d.alt = 9; __D.run(3); return { y: +d.p.y.toFixed(1), x: +d.p.x.toFixed(1), los: __D.unit.def.los, lock: __D.unit.def.lockT }; })()`);
    await h.eval(`(() => { const d = __D.drones[0]; d.spd = 0.0001; __D.run(4); return { los: __D.unit.def.los, lock: __D.unit.def.lockT, hits: __D.S.hits }; })()`);
    await h.expect(`__D.unit.def.lockT === 0 && __D.S.hits === 0`);
    // pop up over the ridge: lock builds, then fire
    await h.eval(`(() => { const d = __D.drones[0]; d.alt = 45; __D.run(2.5); return { los: __D.unit.def.los, lock: +__D.unit.def.lockT.toFixed(2), hits: __D.S.hits }; })()`);
    await h.expect(`__D.unit.def.lockT > 1`);
    await h.eval(`(__D.run(4), { hits: __D.S.hits, kills: __D.S.kills })`);
    await h.expect(`__D.S.hits > 0`);
    // LANCE vs a player drone, then smoke: the beam stops in the smoke
    await h.goto('dev/defence.html?mode=fight&unit=lance&drones=1&player=1&hill=0&panel=0');
    await h.waitFor('window.__D && __D.unit', 15000);
    await h.eval(`(() => { __D.pause(); const d = __D.drones[0]; d.R = 60; d.spd = 6; d.alt = 20; for (let i = 0; i < 400; i++) { __D.run(1 / 30); if (__D.unit.def.beam.st === 'charge') break; } return { st: __D.unit.def.beam.st, tone: 1 }; })()`);
    await h.eval(`(() => { return __D.frame(__D.drones[0].p, 0.5, 0.45); })()`);
    await h.wait(300); await h.shot('lance-charge');
    await h.eval(`(() => { for (let i = 0; i < 200; i++) { __D.run(1 / 30); if (__D.unit.def.beam.st === 'on' && __D.unit.def.beam.dwell > 0.5) break; } return { st: __D.unit.def.beam.st, dwell: __D.unit.def.beam.dwell, hurt: __D.S.playerHurt }; })()`);
    await h.wait(300); await h.shot('lance-beam');
    await h.eval(`(__D.run(6), { hurt: __D.S.playerHurt })`);
    await h.expect(`__D.S.playerHurt > 0`);
    await h.eval(`(() => { const d = __D.drones[0], u = __D.unit; const a = Math.atan2(d.p.z, d.p.x); __D.smokeScreen(Math.cos(a) * 25, Math.sin(a) * 25); const h0 = __D.S.playerHurt; window.__h0 = h0;
      for (let i = 0; i < 400; i++) { __D.run(1 / 30); if (u.def.beam.st === 'on') break; } __D.run(0.3); return { st: u.def.beam.st, blocked: u.def.beam.blocked, smoke: +(u.def.beam.smoke || 0).toFixed(2), len: +u.def.beam.len.toFixed(1) }; })()`);
    await h.wait(300); await h.shot('lance-smoke');
    await h.expect(`__D.unit.def.beam.st !== 'on' || __D.unit.def.beam.blocked === 'smoke'`);
  }
}
