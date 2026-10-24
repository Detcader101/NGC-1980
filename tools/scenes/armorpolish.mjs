// ARMOUR polish: crew procedures and the landing craft. The M60 at the top of the home hard with its crew head out; the
// commander buttoned up / head out with binoculars; the player as loader feeding the gun; the crew buttoning up under
// fire; an LCM-8 run (stern anchor, ramp gallows and wires, deckhands, radio calls).
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__T = () => __G.m60C, 1)`);
  // the crew rides head out; the player in the gunner's seat (no hatch), chase view
  await h.eval(`(__G.crafts.control('m60', 1, 'foot'), __T().view = 'chase', __T().orbit.yaw = 2.5, __T().orbit.pitch = 0.32, 1)`);
  await h.waitFor('__T().fm.eng.running', 15000); await h.wait(1500);
  await h.expect('__T().hatch.driver > 0.9 && __T().hatch.cupola > 0.9 && __T().hatch.loader > 0.9');
  await h.shot('crew-head-out');
  // the commander: in through the hatch, it shuts behind him; H: head out, look about, C binoculars
  await h.eval('(__G.crafts.cycleSeat(1), __T().view = "eye", 1)'); await h.wait(500);
  await h.key('tap', 'KeyH'); await h.wait(1500);   // the TC drops inside and pulls the hatch shut
  await h.expect("__G.crafts.seat === 2 && __T().hatchWant.cupola === 0 && __T().hatch.cupola < 0.1");
  await h.shot('commander-buttoned-up');
  await h.key('tap', 'KeyH'); await h.waitFor('__T().hatch.cupola > 0.9', 5000); await h.wait(300);
  await h.eval('(__T().look(-180, 30), 1)'); await h.wait(400);
  await h.shot('commander-head-out');
  await h.key('tap', 'KeyC'); await h.wait(600);
  await h.expect('__T().binos');
  await h.shot('commander-binoculars');
  await h.key('tap', 'KeyC');
  // the loader: fire one round from the gunner's seat, then load the next one by hand
  await h.eval('(__G.crafts.cycleSeat(-1), 1)'); await h.waitFor("__T().V.gun.state === 'ready'", 20000);
  await h.key('down', 'KeyF'); await h.wait(250); await h.key('up', 'KeyF'); await h.wait(500);
  await h.expect('__T().gunnery.stats.shots >= 1');
  // into the loader's seat; the round the AI loader had started goes back in the rack (test shortcut: the gun empty)
  await h.eval('(__G.crafts.cycleSeat(1), __G.crafts.cycleSeat(1), (() => { const g = __T().V.gun; if (g.state !== "empty") { if (g.round) __T().V.racks[g.rack || "readyAmmo"][g.round]++; g.state = "empty"; g.round = null; } return __G.crafts.seat; })())'); await h.wait(500);
  await h.expect("__G.crafts.seat === 3 && __T().V.gun.state === 'empty'");
  await h.wait(1500); await h.expect("__T().V.gun.state === 'empty'");   // nobody loads it for you
  await h.eval("document.getElementById('hint').textContent");
  await h.key('down', 'KeyF'); await h.wait(250); await h.key('up', 'KeyF');
  await h.waitFor("__T().V.gun.state === 'loading'", 3000);
  await h.shot('loader-ramming');
  await h.waitFor("__T().V.gun.state === 'ready'", 30000);
  await h.eval("document.getElementById('msg').textContent");
  // under fire: everybody buttons up
  await h.eval(`(() => { const T = __T(), o = T.fm.origin(), THREE = __G.THREE; __G.hurtPlayer(0.13, 'FLAK', null, null); return { want: JSON.stringify(T.hatchWant), msg: document.getElementById('msg').textContent }; })()`);
  await h.expect('__T().hatchWant.driver === 0 && __T().hatchWant.cupola === 0 && __T().contactT > 20');
  await h.eval("(__T().view = 'chase', 1)"); await h.wait(1500); await h.shot('buttoned-up-under-fire');
  // the LCM-8 run: stern anchor, gallows, wires, deckhands, the radio calls
  await h.eval('(__G.toHeli(), __G.armDelivery.runIn = 90, __G.G.mat = 300, __G.selIsl = __G.HOME_B.isl, __G.deliverArmour("m113"), __G.armDelivery.runs.length)');
  await h.eval(`(__G.crafts.control('m113', 1, 'foot'), __G.m113C.view = 'chase', __G.m113C.orbit.yaw = 2.3, __G.m113C.orbit.pitch = 0.3, 1)`);
  await h.wait(6000); await h.shot('lcm8-run-in');
  await h.waitFor('__G.armDelivery.runs[0].anchor', 60000); await h.wait(300);
  await h.expect("document.getElementById('feed').textContent.includes('STERN ANCHOR AWAY')");
  await h.waitFor("__G.armDelivery.runs[0].state === 'beached'", 60000); await h.wait(300);
  await h.expect("document.getElementById('feed').textContent.includes('BEACHED')"); await h.wait(6000);
  await h.eval("(__G.m113C.orbit.yaw = 0.6, __G.m113C.orbit.pitch = 0.25, 1)"); await h.wait(1500);
  await h.shot('lcm8-beached-ramp-down');
  await h.eval("document.getElementById('feed').textContent");
  await h.waitFor("__G.armDelivery.runs[0].state === 'backing' || __G.armDelivery.runs[0].state === 'turning'", 80000);
  await h.wait(2000); await h.shot('lcm8-retracting');
}
