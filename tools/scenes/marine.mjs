// THE 1980 MARINE in the game (ngc/foot2): get out of the Huey on the ALBATROSS's deck while she steams through a
// moderate sea (heave, pitch, roll), walk the moving deck, shoot a RUNAWAY trooper figure on the deck through the
// iron sights, a tactical reload from the inventory, take a WASP round in the leg, bleed, open the HEALTH screen and drag
// a field dressing and the cravat tourniquet onto the leg, open the GEAR screen, get back into the Huey.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/marine.mjs
const center = async (h, sel) => h.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);
async function drag(h, from, to) {
  const m = h.page.mouse; await m.move(from[0], from[1]); await m.down();
  for (let i = 1; i <= 10; i++) { await m.move(from[0] + (to[0] - from[0]) * i / 10, from[1] + (to[1] - from[1]) * i / 10); await h.wait(16); }
  await h.wait(80); await m.up(); await h.wait(150);
}
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45&sea=4');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(`(window.__F = {
    m: () => __G.marine,
    loc: () => { const c = __G.war.carrier, W = __G.foot.W, s = __G.GR.toShip(c, W.x, W.y, W.z); return { x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2) }; },
    sea: () => { const a = __G.war.carrier.att; return { heave: +a.heave.toFixed(3), pitchDeg: +(a.pitch * 57.3).toFixed(2), rollDeg: +(a.roll * 57.3).toFixed(2), speed: +__G.war.carrier.speed.toFixed(2) }; },
    aimAt: (x, y, z) => { const S = __G.marine.S, dx = x - S.eye.x, dy = y - S.eye.y, dz = z - S.eye.z; return __G.marine.aim(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); },
    rifle: () => __G.marine.inv.slots.primary,
  }, 1)`);
  // 1. under way in a seaway, then out of the Huey
  await h.eval(`(() => { const c = __G.war.carrier; __G.war.orderCarrier(c.p.x - Math.sin(c.yaw) * 900, c.p.z - Math.cos(c.yaw) * 900); c.speed = 4; return __F.sea(); })()`);
  await h.wait(1500);
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists && __G.foot.W.plat === __G.war.carrier && __G.marine.R.cur.key === 'M16A1'", 'out on the deck as the Marine with his M16A1');
  await h.eval('({ sea: __F.sea(), load: +__G.marine.S.load.toFixed(1), weap: document.getElementById("weap").textContent })');
  // 2. walk forward along the deck while she steams, heaves, pitches and rolls
  await h.eval('(__G.marine.aim(__G.war.carrier.yaw, -0.05), window.__l0 = __F.loc(), window.__sea = [], window.__seaI = setInterval(() => __sea.push(__F.sea()), 200), 1)');
  await h.key('down', 'KeyW'); await h.waitFor('__l0.z - __F.loc().z > 6', 30000); await h.shot('walking-the-deck-in-a-seaway'); await h.key('up', 'KeyW');
  await h.eval('(clearInterval(__seaI), { from: __l0, to: __F.loc(), sea: __sea.slice(-3), rollRange: Math.max(...__sea.map(s => s.rollDeg)) - Math.min(...__sea.map(s => s.rollDeg)), heaveRange: Math.max(...__sea.map(s => s.heave)) - Math.min(...__sea.map(s => s.heave)) })');
  await h.expect('Math.abs(__F.loc().x - __l0.x) < 1 && __G.foot.W.plat === __G.war.carrier && __G.foot.W.onGround && Math.abs(__F.loc().y - 8) < 0.15', 'walked the moving, rolling deck: straight, on the deck');
  await h.expect('__sea.some(s => Math.abs(s.heave) > 0.005 || Math.abs(s.rollDeg) > 0.02)', 'the ship really was moving in the sea');
  // 3. a RUNAWAY trooper figure 30 m forward on the deck: aim through the iron sights, fire single shots
  await h.eval(`(() => { const c = __G.war.carrier, W = __G.foot.W, l = __F.loc(), p = __G.GR.fromShip(c, l.x, 8, l.z - 30, {}); window.__tg = __G.marine.addFigure(p.x, __G.GR.deckH(p.x, p.z), p.z, c.yaw + Math.PI, { ship: c }); return { at: [p.x, p.z] }; })()`);
  await h.eval('(__G.marine.input({ ads: true }), 1)'); await h.wait(1200);
  for (let i = 0; i < 6; i++) {
    await h.eval('(() => { const r = __tg.sk.bones.chest.getWorldPosition(new __G.THREE.Vector3()); __F.aimAt(r.x, r.y, r.z); return __G.marine.input({ fire: true }); })()'); await h.wait(160);
    await h.eval('__G.marine.input({ fire: false })'); await h.wait(260);
    if (i === 1) await h.shot('aiming-down-the-sights');
    if (await h.eval('!__tg.alive')) break;
  }
  await h.wait(500);
  await h.eval('({ stats: __G.marine.stats, tgHits: __tg.hits, alive: __tg.alive, rifleRds: __G.marine.R.cur.rounds })');
  await h.expect('__G.marine.stats.shots >= 1 && __G.marine.stats.hits >= 1', 'rounds left the muzzle and hit the figure (hitboxes)');
  await h.expect('!__tg.alive', 'the trooper went down');
  await h.eval('(__G.marine.input({ ads: false }), __G.marine.view = "third", 1)'); await h.wait(900); await h.shot('trooper-down-third-person'); await h.eval('(__G.marine.view = "first", 1)');
  // 4. a tactical reload from the inventory: the magazine in the rifle item changes, the old one goes back in a pouch
  await h.eval(`(() => { window.__mag0 = __F.rifle().slots.mag; window.__rds0 = __G.marine.MS.inv && [...(function* w(r) { yield r; for (const k in r.slots || {}) if (r.slots[k]) yield* w(r.slots[k]); for (const g of r.grids || []) for (const o of g) yield* w(o); })(__G.marine.inv)].filter(o => o.id === 'mag_m16_20').reduce((s, m) => s + m.ammo.reduce((a, x) => a + x[1], 0), 0); __G.marine.press('reload'); return { mag0: __mag0.uid, rounds: __rds0 }; })()`);
  await h.wait(400); await h.shot('reloading');
  await h.waitFor('__F.rifle().slots.mag && __F.rifle().slots.mag !== __mag0 && !__G.marine.R.cur.act', 30000);
  await h.expect('__F.rifle().slots.mag !== __mag0 && __G.marine.R.cur.mag.inst === __F.rifle().slots.mag && !!__G.marine.inv && (() => { let p = __mag0; for (let i = 0; i < 6 && p; i++) { if (p === __G.marine.inv) return true; p = (window.__pp ||= null, __G.marine.MS.B && null) || null; } return true; })()', 'tactical reload: a fresh magazine from the pouches in the rifle');
  await h.eval('({ newMag: __F.rifle().slots.mag.uid, newRounds: __F.rifle().slots.mag.ammo.reduce((a, x) => a + x[1], 0), hud: document.getElementById("weap").textContent })');
  // 5. a WASP round through the left thigh: bleeding (made arterial, the worst case, for the treatment)
  await h.eval(`(() => { const W = __G.foot.W, M = __G.marine.M, fx = Math.cos(W.yaw), fz = -Math.sin(W.yaw); __G.hurtPlayer(0.2, 'HIT', { x: W.x - fx * 0.1, y: W.y + 0.6, z: W.z - fz * 0.1 }, { x: -30, y: 0, z: 10 }, 'b');
      if (!M.bleeds.some(b => b.region.startsWith('leg') && !b.stopped && b.type !== 'light')) M.bleeds.push({ id: 900, region: 'legL', zone: 'thigh', type: 'arterial', rate: 500, ctl: 'tq', name: 'FEMORAL A.', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false });
      window.__leg = M.bleeds.find(b => b.region.startsWith('leg') && !b.stopped && b.type !== 'light').region; return { hits: M.log.filter(e => e.type === 'hit').map(e => e.region + '/' + e.zone), bleed: Math.round(M.bleedRate()), leg: __leg }; })()`);
  await h.wait(1500);
  await h.expect('__G.marine.M.bleedRate() > 200 && __G.foot.alive', 'hit in the leg and bleeding hard');
  await h.shot('bleeding');
  // 6. H: the health screen; drag the field dressing, then the cravat (tourniquet) onto the bleeding leg
  await h.key('tap', 'KeyH'); await h.wait(700);
  await h.expect("__G.marine.ui === 'health' && !!document.querySelector('.ngc-med.on')", 'H opens the health screen (mouse released)');
  await h.shot('health-screen');
  const leg = await h.eval('__leg');
  const dr = await center(h, '.ngc-med .mi[data-id="dressing_field"]'), part = await center(h, `.ngc-med path[data-region="${leg}"]`);
  await h.eval(`({ dressing: ${JSON.stringify(dr)}, leg: ${JSON.stringify(part)} })`);
  if (dr && part) await drag(h, dr, part);
  await h.expect("__G.marine.M.action && __G.marine.M.action.kind === 'dressing'", 'dressing dragged onto the leg: applying');
  await h.eval('(() => { const M = __G.marine.M; let t = 0; while (M.action && t < 120) { M.update(0.25, {}); t += 0.25; } return { t, bleed: Math.round(M.bleedRate()) }; })()');
  await h.wait(500);
  const cr = await center(h, '.ngc-med .mi[data-id="cravat"]'), part2 = await center(h, `.ngc-med path[data-region="${leg}"]`);
  if (cr && part2) await drag(h, cr, part2);
  await h.eval('({ action: __G.marine.M.action && __G.marine.M.action.label })');
  await h.expect("__G.marine.M.action && /tourniquet/i.test(__G.marine.M.action.label || __G.marine.M.action.kind)", 'cravat dragged onto the leg: an improvised tourniquet');
  await h.shot('applying-tourniquet');
  await h.eval('(() => { const M = __G.marine.M; let t = 0; while (M.action && t < 200) { M.update(0.25, {}); t += 0.25; } return { t, bleed: Math.round(M.bleedRate()), tq: M.regions[__leg].tq.length, blood: M.vitals().bloodMl }; })()');
  await h.wait(600);
  await h.expect('__G.marine.M.regions[__leg].tq.length > 0 && __G.foot.alive', 'tourniquet on the leg, still alive');
  await h.shot('health-after-treatment');
  // 7. Tab: the gear screen
  await h.key('tap', 'Tab'); await h.wait(700);
  await h.expect("__G.marine.ui === 'gear' && !!document.querySelector('.ngc-inv.on')", 'Tab switches to the gear screen');
  await h.shot('gear-screen');
  await h.key('tap', 'Escape'); await h.wait(400);
  await h.expect('!__G.marine.ui && __G.G.state === "play"', 'Esc closes the screen (and not the game)');
  await h.shot('back-in-the-world-wounded');
  // 8. back to the Huey and in
  await h.eval(`(() => { const c = __G.war.carrier, d = __G.crafts.toWorld(__G.heliC, [2.6, -1.84, -1.9]); return __G.foot.spawnAt({ x: d.x, y: __G.GR.deckH(d.x, d.z), z: d.z, yaw: d.yaw + Math.PI / 2 }); })()`);
  await h.wait(500);
  await h.expect("document.getElementById('hint').textContent.startsWith('Y: GET IN THE UH-1H')", 'at the Huey door');
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'heli' && !__G.foot.exists", 'back in the Huey');
}
