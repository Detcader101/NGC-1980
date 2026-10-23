// Malfunction drills in the browser: a stuck case (SPORTS makes it a double feed, the remedial action with the
// cleaning rod clears it), a press check that reveals the stoppage, an M60 runaway gun stopped by breaking the belt.
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  await A('(__I.aimTarget(100), __I.advance(0.4))');
  // a stuck case after a shot: the trigger goes dead, the shooter does not know why
  await A("(__I.W.chamber = { round: 'M193', state: 'spent' }, __I.W.malf = 'extract', __I.W.malfKnown = false, __I.advance(0.2, { fire: true }), __I.advance(0.1, { fire: false }))");
  await h.expect('!__I.R.status().malfKnown');
  await A("(__I.press('checkChamber'), __I.advance(1.6))");
  await h.shot('press_check');
  await h.expect("__I.R.status().malfKnown === 'extract'");
  await A("(__I.press('ia'), __I.advance(3.6))");
  await h.eval('({ malf: __I.W.malf, msg: document.getElementById("msg").textContent })');
  await h.expect("__I.W.malf === 'double'");   // SPORTS rammed a new round into the stuck case
  await A("(__I.press('remedial'), __I.advance(4.0))");
  await h.shot('remedial_rod');
  await A('__I.advance(10.0)');
  await h.expect("!__I.W.malf && __I.W.chamber && __I.W.chamber.state === 'live' && __I.W.bolt === 'fwd'");
  await A("(__I.advance(0.05, { fire: true }), __I.advance(1.2, { fire: false }))");
  await h.eval('__I.log[0]');
  await h.expect('__I.log[0] && /M16A1/.test(__I.log[0])');   // it fires again
  // M60 runaway: the gun keeps firing with the trigger released until the belt is broken
  await A("(__I.press('slot2'), __I.advance(3.5), __I.aimTarget(200), __I.W.malf = 'runaway', __I.advance(0.5, { fire: false }))");
  const n0 = await A('__I.W.mag.rounds');
  await A('__I.advance(0.5, { fire: false })');
  await h.expect(`__I.W.mag.rounds < ${n0} - 2`);           // still firing on its own
  await h.shot('runaway');
  await A("(__I.press('ia'), __I.advance(1.2))");
  await h.expect("__I.W.malf !== 'runaway' && !__I.W.mag");
  await h.eval('({ log: __I.log.slice(0, 3), items: __I.items.length, msg: document.getElementById("msg").textContent })');
}
