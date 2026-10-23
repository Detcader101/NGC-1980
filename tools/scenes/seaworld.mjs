// SEAWORLD: the live sea and the islands as places.   [PARTS=sea,elevator] node snap.mjs scenes/seaworld.mjs
// - sea states 1, 4 and 7 from the ALBATROSS's deck and from altitude (the waves are the ones the ships ride)
// (more parts are added below as they are built)
export const query = '?debug&kb&peace&res=0.6&nofog&sea=4';
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.6&nofog&sea=4');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1200);
  await h.waitFor("__G.G.state === 'play'", 10000);
  // a scripted camera: window.__cam = { u, p: [lx, ly, lz], t: [lx, ly, lz] } in a ship's frame (heading only), or
  // { wp: [x, y, z], wt: [x, y, z] } in world space
  await h.eval(`(() => {
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    const W = (u, l, out) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + l[0] * c + l[2] * s, u.p.y + l[1], u.p.z - l[0] * s + l[2] * c); };
    r.render = (sc, cam) => { const C = window.__cam; if (C) { if (C.u) { W(C.u, C.p, a); W(C.u, C.t, b); } else { a.set(...C.wp); b.set(...C.wt); } cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    // the terrain window, sky and fog follow the PLAYER's camera, so the helicopter waits 40 m above the shot
    window.__shot = (C) => { window.__cam = C; if (C.u) W(C.u, C.p, a); else a.set(...C.wp); if (__G.G.craft === "heli") __G.H.reset(a.clone().add(new T.Vector3(0, 40, 0)), 0, false, 1); __G.HI.setCollective(0.475); };
    window.__park = () => { __G.H.reset(new T.Vector3(__G.HOME_B.x + 18, 60, __G.HOME_B.z + 18), 0, false, 1); __G.HI.setCollective(0.475); };
    return true; })()`);
  const parts = (process.env.PARTS || 'all').split(',');   // PARTS=sea,elevator,... to run some of them
  const want = p => parts.includes(p) || parts.includes('all');
  await h.waitFor('__G.H.landed', 10000);   // the helicopter starts on the ALBATROSS's deck

  // helpers: the soldier in the carrier's frame
  await h.eval(`(window.__F = {
    loc: () => { const c = __G.war.carrier, W = __G.foot.W; const [x, z] = __G.GR.toLocal(c, W.x, W.z); return { x: +x.toFixed(2), z: +z.toFixed(2), y: +(W.y - c.p.y).toFixed(2), ground: W.onGround, plat: W.plat ? W.plat.type : null, on: +(W.y - __G.war.deckY(W.x, W.z)).toFixed(3), under: +c.parts.localDeck(x, z).toFixed(3) }; },
    place: (lx, lz, yawRel, ly = 8) => { const c = __G.war.carrier, w = __G.GR.toWorld(c, lx, lz); return __G.foot.spawnAt({ x: w.x, y: c.p.y + ly, z: w.z, yaw: c.yaw + yawRel }); },
  }, 1)`);

  if (want('lift')) {
    // the deck-edge lifts: a Hornet spotted on lift 1 and a soldier beside it ride down to the hangar door and back up
    await h.key('tap', 'KeyY'); await h.wait(600);
    await h.expect("__G.G.craft === 'foot'", 'out of the Huey on the deck');
    await h.eval('(() => { const P = __G.war.carrier.parts; return { lifts: P.lifts.map(L => [L.i, L.y, L.target]), deckOnLift: P.localDeck(15.0, -23.3), deckOnHornet: P.localDeck(18.9, -17), deckHornet2: P.localDeck(9.2, -31), deckTomcat: P.localDeck(9.0, 27.5), deckClear: P.localDeck(-6, 0) }; })()');
    await h.expect('(() => { const P = __G.war.carrier.parts; return P.localDeck(18.9, -17) > 9.5 && P.localDeck(9.2, -31) > 9.5 && P.localDeck(9.0, 27.5) > 9.5 && Math.abs(P.localDeck(-6, 0) - 8) < 1e-6; })()', 'parked aircraft stand up out of the deck (deckY)');
    await h.eval('(__F.place(15.2, -23.2, -Math.PI / 2), 1)'); await h.wait(800);
    await h.eval('__F.loc()');
    await h.expect('Math.abs(__F.loc().on) < 0.1 && Math.abs(__F.loc().under - 8) < 0.01 && __G.foot.W.onGround', 'standing on lift 1, up');
    await h.eval(`(__shot({ u: __G.war.carrier, p: [34, 13, -34], t: [16, 7, -17] }), 1)`); await h.wait(1200); await h.shot('lift-up');
    // U at the console runs it (the soldier is on it: that works too)
    await h.key('tap', 'KeyU'); await h.wait(300);
    await h.expect('__G.war.carrier.parts.lifts[0].target < 5', 'U sends lift 1 down');
    await h.waitFor('__G.war.carrier.parts.lifts[0].y < 4.3', 25000); await h.wait(600);
    await h.eval('({ soldier: __F.loc(), lift: __G.war.carrier.parts.lifts[0].y, hornetY: __G.war.carrier.parts.localDeck(18.9, -17) })');
    await h.expect('Math.abs(__F.loc().on) < 0.15 && Math.abs(__F.loc().under - 4.25) < 0.02 && __G.foot.W.onGround && __F.loc().plat === "carrier"', 'the soldier rode the lift down to the hangar door');
    await h.expect('Math.abs(__G.war.carrier.parts.localDeck(18.9, -17) - 4.25 - 1.65) < 1.5', 'the Hornet came down with it (its footprint too)');
    await h.eval(`(__shot({ u: __G.war.carrier, p: [36, 9, -32], t: [16, 4, -17] }), 1)`); await h.wait(1200); await h.shot('lift-down');
    await h.eval(`(__G.foot.view = 'third', __G.foot.W.yaw = __G.war.carrier.yaw + Math.PI * 0.85, 1)`); await h.wait(300);
    await h.eval('(window.__cam = null, 1)'); await h.wait(1200); await h.shot('lift-down-third-person');
    // the hull is a wall from down here: walking inboard he stays on the platform
    await h.eval('(__G.foot.W.yaw = __G.war.carrier.yaw + Math.PI / 2, 1)');
    await h.key('down', 'KeyW'); await h.wait(2500); await h.key('up', 'KeyW');
    await h.eval('__F.loc()');
    await h.expect('__F.loc().x > 13.6 && Math.abs(__F.loc().under - 4.25) < 0.02 && Math.abs(__F.loc().on) < 0.15', 'the hull side stops him (no walking into the deck from below)');
    await h.eval('(__G.war.carrier.parts.lift(0, "up"), 1)');
    await h.waitFor('__G.war.carrier.parts.lifts[0].y > 7.99', 25000); await h.wait(600);
    await h.expect('Math.abs(__F.loc().under - 8) < 0.02 && Math.abs(__F.loc().on) < 0.15 && __G.foot.W.onGround', 'and back up with it');
    // walking into a parked Hornet: it is solid
    await h.eval('(__F.place(4.6, -31, -Math.PI / 2), __G.foot.view = "first", 1)'); await h.wait(500);
    await h.key('down', 'KeyW'); await h.wait(3500); await h.key('up', 'KeyW');
    await h.eval('__F.loc()');
    await h.expect('__F.loc().x < 9.2 && Math.abs(__F.loc().under - 8) < 0.01 && Math.abs(__F.loc().on) < 0.15', 'a parked Hornet stops a walker');
    await h.eval(`(__G.foot.view = 'third', 1)`); await h.wait(900); await h.shot('walker-at-parked-hornet');
    await h.eval(`(__G.foot.view = 'first', 1)`);
  }

  if (want('sea')) {
    await h.eval('(window.__cam = null, __G.G.craft !== "heli" && __G.toHeli(), 1)'); await h.wait(800); await h.waitFor('__G.H.landed', 8000);
    // from the HORNET at 600 m (its view reaches ~1.5 km): the swell and the whitecaps out to the horizon
    await h.eval('(__G.war.setSea(7), 1)');
    await h.key('tap', 'Digit5'); await h.wait(1500);
    await h.waitFor('__G.G.craft === "jet"', 8000);
    await h.eval('(() => { const c = __G.war.carrier, J = __G.JP.J; J.cat = null; J.reset(c.p.x + 600, 0, c.p.z + 500, 0.9, { running: true, airborne: true, alt: 600, speed: 120 }); J.gearCmd = 0; J.gear = 0; __G.cockpitCam = false; __G.JP.snapChase(); return 1; })()');
    await h.wait(3000); await h.shot('ss7-jet-600m');
    await h.eval('(__G.war.setSea(4), 1)'); await h.wait(1500); await h.shot('ss4-jet-600m');
    await h.eval('(__G.toHeli(), 1)'); await h.wait(1000); await h.waitFor('__G.G.craft === "heli"', 5000);
    await h.eval('(__park(), 1)');
    // the carrier under way into the swell; the camera on deck (port side, looking out over the bow quarter) and up high
    await h.eval(`(() => { const c = __G.war.carrier; c.speed = 4; const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); __G.war.orderCarrier(c.p.x + fx * 900, c.p.z + fz * 900); return 1; })()`);
    for (const ss of [1, 4, 7]) {
      await h.eval(`(__G.war.setSea(${ss}), 1)`); await h.wait(2500);
      await h.expect(`Math.abs(__G.war.sea.ss - ${ss}) < 1e-6 && __G.war.sea.comps.length === 14`, `sea state ${ss} set`);
      await h.eval(`(__shot({ u: __G.war.carrier, p: [-12, 10.2, -20], t: [-60, 4, -90] }), 1)`); await h.wait(1500); await h.shot(`ss${ss}-deck`);
      await h.eval(`(__shot({ u: __G.war.carrier, p: [-120, 70, -60], t: [0, 0, 0] }), 1)`); await h.wait(1500); await h.shot(`ss${ss}-alt`);
      // the ship rides the drawn sea: a sample of the surface next to the hull and the carrier's heave
      await h.eval(`(() => { const W = __G.war, c = W.carrier; return { ss: W.sea.ss, hs: W.sea.hs, heave: +c.att.heave.toFixed(3), pitchDeg: +(c.att.pitch * 57.3).toFixed(2), rollDeg: +(c.att.roll * 57.3).toFixed(2), seaAtShip: +W.seaY(c.p.x, c.p.z).toFixed(3) }; })()`);
    }
    await h.eval(`(__G.war.setSea(4), window.__cam = null, 1)`);
  }
}
