// Watch the AI fly on dev/air.html: a Tomcat sortie off the ALBATROSS (cat shot, climb, CAP, then bingo forced and
// the recovery), a Tomcat vs SHRIKE fight, a REAPER orbit, a SHAHED salvo. Screenshots along the way.
//                                                                           node snap.mjs scenes/airfly.mjs
export default async function (h) {
  await h.goto('dev/air.html?fly=sortie&ui=0&res=0.6');
  await h.waitFor('window.__F && __F.units.length', 10000);
  await h.eval('(__F.speedUp = 0, __F.camMode = 1, 1)');
  // the pilot on the cat: run-up, shot
  for (let i = 0; i < 60 * 6; i++) if (i % 60 === 0) await h.eval('(() => { for (let k = 0; k < 60; k++) __F.step(); return __F.units[0].pilot.state })()');
  await h.wait(300); await h.shot('cat_runup');
  await h.eval('(() => { for (let k = 0; k < 60 * 4; k++) __F.step(); return __F.units[0].pilot.state })()');
  await h.wait(300); await h.shot('off_the_bow');
  await h.eval('(() => { for (let k = 0; k < 60 * 30; k++) __F.step(); const u = __F.units[0]; return [u.pilot.state, +u.A.pos.y.toFixed(0)] })()');
  await h.wait(300); await h.shot('cap');
  await h.expect('__F.units[0].pilot.state === "cap"');
  // bingo now: watch the recovery
  await h.eval('(__F.units[0].A.fuel = 1850, 1)');
  await h.eval('(() => { let n = 0; while (n++ < 60 * 300 && !["final"].includes(__F.units[0].pilot.state)) __F.step(); return __F.units[0].pilot.state })()');
  await h.eval('(() => { let n = 0; while (n++ < 60 * 120 && !(__F.units[0].pilot.lso && __F.units[0].pilot.lso.R < 500)) __F.step(); return __F.units[0].pilot.lso })()');
  await h.eval('(__F.camMode = 1, 1)'); await h.wait(300); await h.shot('final');
  await h.eval('(() => { let n = 0; while (n++ < 60 * 25 && !__F.units[0].pilot.trapped && !__F.units[0].A.dead) __F.step(); return [__F.units[0].pilot.state, __F.units[0].pilot.trapped] })()');
  await h.wait(300); await h.shot('trap');
  await h.expect('!!__F.units[0].pilot.trapped');
  await h.goto('dev/air.html?fly=fight&ui=0&res=0.6');
  await h.waitFor('window.__F && __F.units.length', 10000);
  await h.eval('(__F.speedUp = 0, __F.camMode = 1, 1)');
  await h.eval('(() => { let n = 0; while (n++ < 60 * 25 && !__F.units.some(u => u.dying)) __F.step(); return __F.units.map(u => [u.name, u.pilot.state, u.pilot.mode, u.hp]) })()');
  await h.wait(300); await h.shot('fight');
  await h.eval('(__F.follow = 1, 1)'); await h.wait(500); await h.shot('fight_shrike');
  await h.goto('dev/air.html?fly=reaper&ui=0&res=0.6');
  await h.waitFor('window.__F && __F.units.length', 10000);
  await h.eval('(__F.speedUp = 0, __F.camMode = 1, (() => { for (let k = 0; k < 60 * 20; k++) __F.step(); return 1 })())'); await h.wait(300); await h.shot('reaper');
  await h.goto('dev/air.html?fly=shahed&ui=0&res=0.6');
  await h.waitFor('window.__F && __F.units.length', 10000);
  await h.eval('(__F.speedUp = 0, __F.camMode = 1, (() => { for (let k = 0; k < 60 * 12; k++) __F.step(); return 1 })())'); await h.wait(300); await h.shot('shahed_salvo');
}
