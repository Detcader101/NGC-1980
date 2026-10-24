// INTERIORS (ngc/interiors): the ALBATROSS's island and hangar deck on foot, watertight doors that block until opened,
// the bridge and its hatch to the top deck; a house in a village: the front door blocks, opens, the rooms behind it;
// a seat in the Huey's cabin (the RIDE craft) and the people in the seats.
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__F = {
    loc: () => { const c = __G.war.carrier, W = __G.foot.W; const s = __G.GR.toShip(c, W.x, W.y, W.z); return { tx: +(s.x - 10.5).toFixed(2), tz: +(s.z - 6).toFixed(2), y: +s.y.toFixed(2) }; },
    // put the Marine in the tower frame (tx, tz), at ship height y, facing yawRel (0: the bow, PI: aft, -PI/2: starboard)
    place: (tx, y, tz, yawRel) => { const c = __G.war.carrier, w = __G.GR.toWorld(c, 10.5 + tx, 6 + tz); const ok = __G.foot.spawnAt({ x: w.x, y: c.p.y + y, z: w.z, yaw: c.yaw + yawRel }); __G.marine.aim(c.yaw + yawRel, 0); return ok; },
    look: (yawRel, pitch = 0) => (__G.marine.aim(__G.war.carrier.yaw + yawRel, pitch), 1),
    door: k => __DOORS.get('ALBATROSS#' + k),
  }, 1)`);
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists");
  // the carrier stops (the walk is platform-relative anyway: foot.mjs covers her under way)
  await h.eval('(() => { const c = __G.war.carrier; c.path = []; c.goal = null; c.speed = 0; c.v.set(0, 0, 0); return !!c.interior; })()');
  await h.expect('!!__G.war.carrier.interior && !!__IN.carrier()');
  // 1. the island's port door, shut: walk at it - it blocks
  await h.eval('__F.place(-3.4, 8, -1.0, -Math.PI / 2)'); await h.wait(600);
  await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.includes('OPEN THE WATERTIGHT DOOR')");
  await h.shot('island-door-shut');
  await h.key('down', 'KeyW'); await h.wait(2500); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('__F.loc().tx < -2.5', 'the shut door stops him');
  // 2. F: the dogs come off, the door swings in; walk through into Flight Deck Control
  await h.key('tap', 'KeyF'); await h.waitFor("__F.door('port').a > 0.99", 25000);
  await h.shot('island-door-open');
  await h.key('down', 'KeyW'); await h.waitFor('__F.loc().tx > -1.6', 8000); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('Math.abs(__F.loc().y - 8) < 0.1 && __G.foot.W.plat === __G.war.carrier', 'inside on the O-3 deck');
  await h.eval('__F.look(0, -0.25)'); await h.wait(700); await h.shot('flight-deck-control');
  // 3. the trunk: its watertight door, the ladder down to the hangar deck
  await h.eval('__F.place(0.75, 8, 0.2, Math.PI)'); await h.wait(400);
  await h.key('down', 'KeyW'); await h.wait(1500); await h.key('up', 'KeyW');
  await h.expect('__F.loc().tz < 0.95', 'the trunk door shut');
  await h.key('tap', 'KeyF'); await h.waitFor("__F.door('trunk').a > 0.99", 25000);
  await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y < 4.4', 20000); await h.wait(1500); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('Math.abs(__F.loc().y - 4.25) < 0.1 && __G.foot.W.plat === __G.war.carrier', 'on the hangar deck');
  await h.eval('__F.look(Math.PI + 0.3, -0.05)'); await h.wait(800); await h.shot('hangar-deck');
  await h.eval("(__G.marine.view = 'third', __F.look(-Math.PI / 2 - 0.4, -0.15))"); await h.wait(900); await h.shot('hangar-deck-third-person');
  await h.eval("(__G.marine.view = 'first', 1)");
  // 4. up the inclined ladders: O-5 ready room, O-7 flag plot, the bridge
  await h.eval('__F.place(-0.55, 8, 0.6, Math.PI)'); await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y > 11.15', 20000); await h.wait(500); await h.key('up', 'KeyW');
  await h.expect('Math.abs(__F.loc().y - 11.2) < 0.1', 'O-5');
  await h.eval('__F.place(0.5, 11.2, -1.0, 0)'); await h.wait(300); await h.eval('__F.look(0, -0.1)'); await h.wait(700); await h.shot('ready-room');
  await h.eval('__F.place(1.75, 11.2, 6.4, 0)'); await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y > 14.35', 20000); await h.wait(500); await h.key('up', 'KeyW');
  await h.expect('Math.abs(__F.loc().y - 14.4) < 0.1', 'O-7');
  await h.eval('__F.look(0.6, -0.2)'); await h.wait(700); await h.shot('flag-plot');
  await h.eval('__F.place(-1.85, 14.4, -3.3, Math.PI)'); await h.key('down', 'KeyW'); await h.waitFor('__F.loc().y > 17.05', 20000); await h.wait(500); await h.key('up', 'KeyW');
  await h.expect('Math.abs(__F.loc().y - 17.1) < 0.1', 'the bridge');
  await h.eval('__F.place(0.2, 17.1, 1.0, 0)'); await h.wait(300); await h.eval('__F.look(0.15, -0.08)'); await h.wait(800); await h.shot('bridge');
  // 5. the hatch: the ladder is no use while it is shut; F opens it, climb to the island top deck
  await h.eval('__F.place(2.0, 17.1, 2.7, Math.PI)'); await h.wait(400);
  await h.eval("document.getElementById('hint').textContent");
  await h.key('down', 'KeyW'); await h.wait(1500); await h.key('up', 'KeyW');
  await h.expect('!__G.foot.W.ladder', 'no climbing through a shut hatch');
  await h.key('tap', 'KeyF'); await h.waitFor("__F.door('hatch').a > 0.99", 25000);
  await h.key('down', 'KeyW'); await h.waitFor('__G.foot.W.ladder', 8000);
  await h.waitFor('!__G.foot.W.ladder && __G.foot.W.onGround && __F.loc().y > 21', 30000); await h.key('up', 'KeyW');
  await h.eval('__F.loc()');
  await h.expect('Math.abs(__F.loc().y - 21.3) < 0.1', 'out of the hatch onto the roof');
  await h.eval("(__G.marine.view = 'third', __F.look(Math.PI * 0.8, -0.3))"); await h.wait(900); await h.shot('top-deck-hatch');
  await h.eval("(__G.marine.view = 'first', 1)");
  // 6. from outside: the island with its door open, the hangar through a lift opening
  await h.eval('__F.place(-8.5, 8, -2.5, -Math.PI / 2)'); await h.wait(500); await h.eval('__F.look(-Math.PI / 2 + 0.15, 0.12)'); await h.wait(700); await h.shot('island-door-from-the-deck');
}
