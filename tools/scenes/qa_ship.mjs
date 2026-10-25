// QA (ngc/qa-ship): a screenshot tour of the ALBATROSS and the ships round her - a regression shot list for the art.
// Every place a player can stand or look on the ship, first and third person, plus scripted cameras round the hull,
// the deck from several heights, the ship at sea state 0 and 6, the SKY CARRIER airborne, the KRAKEN, an LCM-8, the
// container ship, a Tomcat escort on the cat.
// The FRONT CHECK: at every first-person spot, a 9 x 7 fan of rays from the rendering camera; no person (deck crew,
// interior crew, a soldier, a seated rider or pilot) may be hit within 0.6 m (user bug: "first person has a person in
// front of me in albatross").
//   node snap.mjs scenes/qa_ship.mjs                (QA_PART=deck,inside,fp,ext,sea,sky,ships to run some parts only)
const PARTS = (process.env.QA_PART || 'deck,inside,fp,ext,sea,sky,ships').split(',');
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.6&sea=2');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 60000);
  await h.eval(`(() => {
    const G = __G, T = G.THREE, r = G.renderer, orig = r.render.bind(r), a = new T.Vector3(), b = new T.Vector3();
    // ship frame (heading only) -> world
    const W = (u, l, out) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + l[0] * c + l[2] * s, u.p.y + l[1], u.p.z - l[0] * s + l[2] * c); };
    r.render = (sc, cam) => {
      const C = window.__cam; if (C && C.u) { W(C.u, C.p, a); W(C.u, C.t, b); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); }
      if (sc.isScene && (!window.__sc || sc === window.__sc || sc.children.length >= window.__sc.children.length)) { window.__sc = sc; window.__rc = cam; }
      orig(sc, cam); };
    const PERSON = /deckcrew|crew-fig|soldier|rider|pilot|marine|figure|man\\b|sailor|crew|gunner|squad|trooper/i;
    window.__Q = {
      cam: (u, p, t) => { window.__cam = { u, p, t }; return 1; },
      off: () => (window.__cam = null, 1),
      // the Marine on the ship: ship frame (lx, y above the waterline, lz), facing yawRel (0 the bow, PI aft, -PI/2 starboard)
      at: (lx, y, lz, yawRel, pitch = 0) => { const c = G.war.carrier, w = G.GR.toWorld(c, lx, lz); const ok = G.foot.spawnAt({ x: w.x, y: c.p.y + y, z: w.z, yaw: c.yaw + yawRel }); G.marine.aim(c.yaw + yawRel, pitch); return ok; },
      tw: (tx, y, tz, yawRel, pitch = 0) => __Q.at(10.5 + tx, y, 6 + tz, yawRel, pitch),
      look: (yawRel, pitch = 0) => (G.marine.aim(G.war.carrier.yaw + yawRel, pitch), 1),
      loc: () => { const c = G.war.carrier, F = G.foot.W, s = G.GR.toShip(c, F.x, F.y, F.z); return [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)]; },
      // rays from the rendering camera: every object within D m, by its name chain; persons flagged
      front: (D = 0.8) => {
        const cam = window.__rc, sc = window.__sc; if (!cam || !sc) return { err: 'no camera' };
        cam.updateMatrixWorld(); sc.updateMatrixWorld();
        const q = cam.getWorldQuaternion(new T.Quaternion()), o = cam.getWorldPosition(new T.Vector3());
        // the visible meshes (whole parent chain visible), named by their chain; raycast one by one (a sprite or a
        // custom object that cannot be raycast is skipped, not fatal)
        const meshes = [];
        (function walk(ob, chain) { if (!ob.visible) return; const c = [ob.name || ob.type, ...chain].slice(0, 4); if (ob.isMesh && !ob.isSprite) { if (ob.isInstancedMesh) ob.boundingSphere = null; meshes.push([ob, c.join('<')]); } for (const k of ob.children) walk(k, c); })(sc, []);
        const out = {}, persons = [], hits = [], rc = new T.Raycaster(); rc.near = 0; rc.far = D; rc.camera = cam;
        for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) {
          rc.set(o, new T.Vector3(i * 0.11, j * 0.11, -1).normalize().applyQuaternion(q));
          for (const [m, k] of meshes) { hits.length = 0; try { m.raycast(rc, hits); } catch (e) { continue; }
            for (const x of hits) { if (x.distance > D) continue; out[k] = Math.min(out[k] ?? 9, +x.distance.toFixed(2)); if (PERSON.test(k) && !persons.includes(k)) persons.push(k); } }
        }
        return { persons, near: out };
      },
    };
    if (!${process.env.QA_MOVE ? 1 : 0}) { const c = G.war.carrier; c.path = []; c.goal = null; c.speed = 0; c.v.set(0, 0, 0); }   // QA_MOVE=1: under way
    return 1; })()`);
  const fp = async (name) => { await h.wait(900); await h.shot(name); await h.eval('__Q.front(1.6).persons', name + ' (persons within 1.6 m)'); const r = await h.eval('__Q.front()', name); await h.expect('__Q.front().persons.length === 0', `${name}: no person within 0.8 m of the eye`); return r; };

  // ================================================================== the Huey and the deck spawn, first person
  if (PARTS.includes('fp')) {
    await h.eval('(__G.cockpitCam = true, 1)'); await fp('fp-huey-cockpit-on-deck');
    await h.eval('(__G.cockpitCam = false, 1)');
    await h.key('tap', 'KeyY'); await h.waitFor("__G.G.craft === 'foot'", 8000);
    await h.eval("(__G.marine.view = 'first', 1)");
    await fp('fp-out-of-the-huey');
    for (const [n, y] of [['stbd', -1.57], ['aft', 3.14], ['port', 1.57]]) { await h.eval(`__Q.look(${y})`); await fp('fp-out-of-the-huey-' + n); }
    // the deck park spots (a Marine from the command board lands there) and the crew's walking lanes
    for (let k = 0; k < 3; k++) {
      const ok = await h.eval(`(() => { const s = __G.GR.deckSpot(${k}); if (!s) return 0; __G.foot.spawnAt({ x: s.x, y: s.y, z: s.z, yaw: s.yaw }); __G.marine.aim(s.yaw, 0); return 1; })()`);
      if (ok) await fp('fp-deck-park-' + (k + 1));
    }
    for (const [n, lx, lz, yr] of [['bow-street', 4.4, -30, 0], ['island-street', 6.6, 6, Math.PI], ['aft-lane', 3.8, 30, 0], ['cat-lane', -8.9, -20, 0], ['stbd-edge', 12.8, -22, 0], ['fantail', -4, 53, Math.PI]]) {
      await h.eval(`__Q.at(${lx}, 8, ${lz}, ${yr})`);
      for (let i = 0; i < 3; i++) await fp(`fp-deck-${n}-${i}`);   // a few seconds: the walkers come by
    }
    // the Hornet on cat 1 and its cockpit
    await h.eval(`__Q.at(-2, 8, 32, 0)`);
    await h.key('tap', 'Digit5'); await h.waitFor("__G.G.craft === 'jet'", 15000); await h.wait(2500); await h.eval('(__G.cockpitCam = true, 1)');
    await fp('fp-hornet-cockpit-on-the-cat');
    await h.eval(`__Q.cam(__G.war.carrier, [-14, 9.5, 8], [-2.5, 9.5, -8])`); await h.wait(1200); await h.shot('ext-hornet-on-the-cat'); await h.eval('(__Q.off(), __G.cockpitCam = false, 1)');
    await h.key('tap', 'KeyY'); await h.waitFor("__G.G.craft === 'foot'", 10000);
  }

  // ================================================================== seats: the Huey's troop bench, the vehicles on the deck
  if (PARTS.includes('seats')) {
    if (await h.eval("__G.G.craft !== 'foot'")) { await h.key('tap', 'KeyY'); await h.waitFor("__G.G.craft === 'foot'", 8000); }
    const back = `(() => { const c = __G.war.carrier, w = __G.GR.toWorld(c, 4.5, -8); __G.foot.spawnAt({ x: w.x, y: c.p.y + 8, z: w.z, yaw: c.yaw }); return __G.crafts.control('foot', 0, 'ride'); })()`;
    await h.wait(1500);
    await h.eval(`__G.seats ? 1 : __G.crafts.get('ride') && __G.crafts.get('ride').seats.map(s => s.label)`, 'ride seats');
    for (const k of [0, 1, 3]) {
      if (await h.eval(`__G.crafts.control('ride', ${k}, 'door')`)) { await fp('fp-huey-troop-seat-' + (k + 1)); await h.eval("(__G.crafts.active.key('KeyV'), 1)"); await h.wait(900); await h.shot('huey-troop-seat-' + (k + 1) + '-outside'); await h.eval(back); await h.wait(500); }
    }
    for (const id of ['m113', 'm60', 'm151']) {
      const ok = await h.eval(`(() => { const d = __G.crafts.get('${id}') || (${id === 'm151'} && __G.carC); if (!d || !d.present()) return 'absent'; return __G.crafts.control(d.id, 0, 'door'); })()`, id);
      if (ok === true) { await h.wait(2000); await h.eval(`(() => { const a = __G.crafts.active; if (a && a.view !== undefined) a.view = 'first'; return a && a.id; })()`); await fp('fp-in-' + id); await h.eval(back); await h.wait(500); }
    }
  }

  // ================================================================== inside: every space, first and third person
  if (PARTS.includes('inside')) {
    if (await h.eval("__G.G.craft !== 'foot'")) { await h.key('tap', 'KeyY'); await h.waitFor("__G.G.craft === 'foot'", 8000); }
    await h.eval('(() => { for (const k of ["port", "trunk", "hatch"]) { const D = __DOORS.get("ALBATROSS#" + k); if (D) __DOORS.open(D); } return 1; })()');
    const spots = [
      // tower frame (tx, y above the waterline, tz, yawRel, pitch)
      ['island-door-outside', -3.6, 8, -1.0, -1.57, 0], ['fdc-board', -1.2, 8, -1.0, -1.57, -0.3], ['fdc-forward', 0.4, 8, -3.0, 0, -0.1], ['fdc-aft', 0.0, 8, -5.5, 3.14, -0.1],
      ['trunk-top', 0.75, 8, 0.3, 3.14, -0.4], ['stairs-up-o5', -0.55, 8, 0.8, 3.14, 0.4],
      ['ready-room', 0.5, 11.2, -1.0, 0, -0.1], ['ready-room-back', 0.5, 11.2, -6.0, 3.14, -0.1], ['ready-room-side', -1.6, 11.2, -3.0, -1.57, -0.1],
      ['flag-plot', 1.6, 14.4, 2.0, 0.6, -0.2], ['flag-plot-fwd', 0.0, 14.4, -5.5, 3.14, -0.1], ['flag-plot-window', -1.6, 14.4, -2.0, 1.57, 0],
      ['bridge', 0.2, 17.1, 1.0, 0, -0.08], ['bridge-at-the-wheel', -0.2, 17.1, -2.2, 0, -0.1], ['bridge-port', -1.6, 17.1, -1.0, 0.5, -0.05], ['bridge-stbd', 1.7, 17.1, -1.5, -0.4, -0.05],
      ['bridge-wing-port', -3.2, 17.15, -3.2, 1.57, -0.1], ['bridge-wing-stbd', 3.2, 17.15, -4.6, -1.57, -0.1],
      ['top-deck', 0.8, 21.35, -4.5, 3.14, -0.2], ['top-deck-fwd', 0.0, 21.35, -2.0, 0, -0.3], ['catwalk-o7', -3.0, 14.45, 2.0, 0, -0.1], ['catwalk-o7-down', -3.0, 14.45, -4.0, 1.57, -0.5],
    ];
    for (const [n, tx, y, tz, yr, p] of spots) {
      await h.eval(`(__G.marine.view = 'first', __Q.tw(${tx}, ${y}, ${tz}, ${yr}, ${p}))`);
      await fp('in-' + n); await h.eval('__Q.loc()');
      if (/ready-room$|flag-plot$|bridge$|fdc-board|top-deck$/.test(n)) { await h.eval(`(__G.marine.view = 'third', 1)`); await h.wait(900); await h.shot('in-' + n + '-third'); await h.eval(`(__G.marine.view = 'first', 1)`); }
    }
    // the hangar deck (ship frame)
    for (const [n, lx, lz, yr, p] of [['hangar-fwd', 0, -30, 3.14, -0.05], ['hangar-mid', 2, 0, 0, -0.05], ['hangar-aft', -3, 44, 0, -0.05], ['hangar-lift1', 9, -17, -1.57, 0], ['hangar-lift3', -9, -31, 1.57, 0], ['hangar-booth', -7, 4, 1.57, -0.1], ['hangar-engines', -4, -16, 1.57, -0.1]]) {
      await h.eval(`(__G.marine.view = 'first', __Q.at(${lx}, 4.25, ${lz}, ${yr}, ${p}))`);
      await fp('in-' + n);
      if (n === 'hangar-mid' || n === 'hangar-lift1') { await h.eval(`(__G.marine.view = 'third', 1)`); await h.wait(900); await h.shot('in-' + n + '-third'); await h.eval(`(__G.marine.view = 'first', 1)`); }
    }
    // the lifts down: the hangar through the openings, from outside
    await h.eval('(__G.war.carrier.parts.lift(0, "down"), __G.war.carrier.parts.lift(2, "down"), 1)');
    await h.waitFor('__G.war.carrier.parts.lifts[0].y < 4.3', 60000);
    await h.eval(`__Q.at(18, 4.25, -17, 1.57, 0)`); await fp('in-on-lift1-down-looking-in');
    await h.eval(`__Q.cam(__G.war.carrier, [40, 7, -6], [12, 5, -18])`); await h.wait(1200); await h.shot('ext-lift1-down-from-the-sea'); await h.eval('__Q.off()');
    await h.eval('(__G.war.carrier.parts.lift(0, "up"), __G.war.carrier.parts.lift(2, "up"), 1)');
  }

  // ================================================================== the deck from above and around (scripted cameras)
  if (PARTS.includes('deck')) {
    const C = (n, p, t) => [n, p, t];
    for (const [n, p, t] of [
      C('deck-from-the-bow-low', [0, 10, -70], [0, 9, 0]), C('deck-from-the-stern-low', [-2.5, 10.5, 66], [-2.5, 9, 0]), C('deck-wires', [-14, 10.2, 46], [-2, 8, 34]),
      C('deck-cat-1', [-6, 10, -2], [-2.5, 8.5, -40]), C('deck-parked-hornets', [2, 10.5, -42], [10, 9.5, -36]), C('deck-parked-tomcats', [1, 10.5, 20], [10, 9, 34]),
      C('deck-island-street', [4.5, 9.7, -16], [8, 10, 10]), C('deck-island-base', [3, 9.8, 6], [8.2, 10, 2]), C('deck-island-high', [-6, 28, -14], [10.5, 22, 4]),
      C('deck-vehicle-park', [-4, 10, -6], [-10.5, 8.5, -30]), C('deck-lso', [-10, 10, 34], [-15.5, 8.4, 43]), C('deck-fantail', [8, 11, 64], [-4, 8, 50]),
      C('deck-overhead', [0, 90, 0], [0, 8, -1]), C('deck-mast', [-4, 24, -10], [10.6, 28, 5]), C('deck-funnel', [-2, 25, 18], [10.5, 22, 12]),
      C('deck-crew-at-work', [2, 9.8, -48], [7, 8.8, -41]), C('deck-lift1', [6, 11, -26], [18, 8, -17]), C('deck-ladders', [-0.5, 10.5, -4], [8.1, 12, -1.5]),
    ]) { await h.eval(`__Q.cam(__G.war.carrier, ${JSON.stringify(p)}, ${JSON.stringify(t)})`); await h.wait(1200); await h.shot(n); }
    await h.eval('__Q.off()');
  }

  // ================================================================== the ship from the sea and the air
  if (PARTS.includes('ext')) {
    for (const [n, p, t] of [
      ['ext-port-bow', [-70, 14, -80], [0, 8, -10]], ['ext-stbd-beam', [95, 10, 0], [0, 9, 0]], ['ext-stern', [10, 9, 110], [0, 7, 0]], ['ext-stbd-quarter', [60, 6, 70], [0, 8, 10]],
      ['ext-bow-waterline', [-16, 2, -78], [0, 4, -40]], ['ext-island-close', [26, 13, -10], [8, 14, 4]], ['ext-air-high', [180, 160, 200], [0, 8, 0]], ['ext-sponson-ciws', [24, 9, -36], [16, 7, -29]],
      ['ext-stern-gallery', [-6, 6, 72], [0, 6, 56]], ['ext-boat-pocket', [26, 6, 44], [12, 5, 44]],
    ]) { await h.eval(`__Q.cam(__G.war.carrier, ${JSON.stringify(p)}, ${JSON.stringify(t)})`); await h.wait(1200); await h.shot(n); }
    await h.eval('__Q.off()');
  }

  // ================================================================== sea state 0 and 6
  if (PARTS.includes('sea')) {
    for (const ss of [0, 6]) {
      await h.eval(`__G.war.setSea(${ss})`); await h.wait(4000);
      await h.eval(`__Q.cam(__G.war.carrier, [80, 18, -70], [0, 8, 0])`); await h.wait(1200); await h.shot(`sea${ss}-bow-quarter`);
      await h.eval(`__Q.cam(__G.war.carrier, [-6, 10.5, -30], [0, 8.5, 20])`); await h.wait(1200); await h.shot(`sea${ss}-on-deck`);
    }
    await h.eval('(__G.war.setSea(2), __Q.off())');
  }

  // ================================================================== the SKY CARRIER airborne, the helm
  if (PARTS.includes('sky')) {
    if (await h.eval("__G.G.craft !== 'heli'")) { await h.eval(`(() => { const d = __G.crafts.toWorld(__G.heliC, [2.6, -1.84, -1.9]); return __G.foot.spawnAt({ x: d.x, y: __G.GR.deckH(d.x, d.z), z: d.z, yaw: d.yaw + Math.PI / 2 }); })()`); await h.wait(300); await h.key('tap', 'KeyY'); await h.waitFor("__G.G.craft === 'heli'", 8000); }
    await h.eval("(dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit6', key: '^', shiftKey: true })), dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit6', key: '^', shiftKey: true })), 1)");
    await h.waitFor('__G.war.carrier.sky && __G.war.carrier.sky.up && __G.war.carrier.p.y > 30', 120000);
    await h.eval(`__Q.cam(__G.war.carrier, [120, 10, -90], [0, 8, 0])`); await h.wait(1500); await h.shot('sky-from-below');
    await h.eval(`__Q.cam(__G.war.carrier, [-90, 40, 80], [0, 4, 0])`); await h.wait(1200); await h.shot('sky-from-above');
    await h.eval('__Q.off()');
    await h.waitFor('__G.H.landed', 30000);
    await h.key('tap', 'Tab'); await h.wait(1500);
    await fp('fp-sky-carrier-helm');
    for (const [n, y] of [['stbd', -1.1], ['port', 1.1]]) { await h.eval(`(__G.head.yaw = ${y}, 1)`); await h.shot('fp-sky-carrier-helm-' + n); }
    await h.eval('(__G.head.yaw = 0, 1)');
    await h.eval('({ helm: __G.helm.active, view: __G.helm.bridgeView })');
    await h.key('tap', 'Tab'); await h.wait(800);
  }

  // ================================================================== the other ships
  if (PARTS.includes('ships')) {
    await h.eval(`__Q.cam(__G.war.enemyCarrier, [110, 50, 90], [0, 8, 0])`); await h.wait(1500); await h.shot('kraken');
    await h.eval(`__Q.cam(__G.war.enemyCarrier, [-40, 20, -60], [5, 12, 10])`); await h.wait(1200); await h.shot('kraken-deck');
    await h.eval(`__Q.cam(__G.war.enemyCarrier, [60, 4, 30], [0, 6, 0])`); await h.wait(1200); await h.shot('kraken-waterline');
    await h.eval(`(() => { const W = __G.war, c = W.carrier, [x2, z2] = __G.nav.nearestWater(c.p.x - 260, c.p.z + 240); const f = W.makeShip('freighter', 2, x2, z2, -0.5); f.cargo = 10; f.repath = 99; f.speed = 3; f.path = [[x2 + 400, z2 + 400]]; window.__box = f; return [x2, z2]; })()`);
    await h.wait(3000);
    await h.eval(`__Q.cam(__box, [60, 28, 55], [0, 6, 0])`); await h.wait(1500); await h.shot('container-ship');
    await h.eval(`__Q.cam(__box, [-20, 8, -40], [0, 6, 0])`); await h.wait(1200); await h.shot('container-ship-bow');
    // an LCM-8 from the amphibious group with an M113 aboard
    await h.eval(`(__G.G.mat = 999, __G.deliverArmour('m113'), __G.armDelivery.runs.length)`);
    if (await h.eval('__G.armDelivery.runs.length > 0')) {
      await h.wait(3000);
      await h.eval(`(window.__lcm = __G.armDelivery.runs[0].P, 1)`);
      await h.eval(`__Q.cam(__lcm, [12, 6, 16], [0, 1, 0])`); await h.wait(1500); await h.shot('lcm8');
      await h.eval(`__Q.cam(__lcm, [-3, 5, 12], [0, 1, -4])`); await h.wait(1200); await h.shot('lcm8-well');
    }
    // a Tomcat escort on the cat
    await h.eval('(__G.G.mat = 999, __G.selIsl = null, __G.command(4), 1)');
    if (await h.waitFor('__G.war.units.some(u => u.type === "escort" && u.ai && u.ai.state === "cat")', 30000)) {
      await h.eval(`(() => { const u = __G.war.units.find(u => u.type === 'escort'), c = __G.war.carrier; window.__esc = u; return 1; })()`);
      await h.eval(`__Q.cam(__G.war.carrier, [-14, 10, -6], [-2.5, 9.5, -14])`); await h.wait(1500); await h.shot('tomcat-escort-on-the-cat');
    }
    await h.eval('__Q.off()');
  }
  await h.eval(`(() => { const r = __G.renderer.info.render; return { calls: r.calls, tris: r.triangles, fps: document.getElementById('dbg') && document.getElementById('dbg').textContent }; })()`);
}
