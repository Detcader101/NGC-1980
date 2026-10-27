// Medical + inventory sandbox (game/dev/medinv.html): hits, bleeding, the health screen with a real mouse drag of a
// tourniquet onto the leg, the gear screen with a real drag of a magazine, looting a RUNAWAY body, inspect window.
//   CHROME_PATH=... node snap.mjs scenes/medinv.mjs
const center = async (h, sel) => h.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
async function drag(h, from, to, steps = 12) {
  const m = h.page.mouse; await m.move(from[0], from[1]); await m.down();
  for (let i = 1; i <= steps; i++) { await m.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await h.wait(16); }
  await h.wait(120); await m.up(); await h.wait(150);
}
export default async function (h) {
  await h.goto('dev/medinv.html?debug&manual&seed=7');
  await h.waitFor('window.__MI && __MI.M', 10000);
  await h.wait(500);
  await h.shot('sandbox_healthy'); await h.notblank(0.05);
  // a femoral bleed (M193 to the left thigh) and an M193 to the chest (M69 vest: class 2, goes through)
  await h.eval(`(() => { const r1 = __MI.hit({ round: 'M193', velocity: 900, part: 'legL', zone: 'thigh' }); const b = __MI.M.bleeds.find(b => b.region === 'legL'); Object.assign(b, { type: 'arterial', rate: 500, ctl: 'tq', name: 'FEMORAL A.' });
    const r2 = __MI.hit({ round: 'M193', velocity: 800, part: 'thorax', zone: 'chest' }); return [r1.hp, r2.penetrated, r2.hp]; })()`, 'hits');
  await h.eval('__MI.advance(100)', 'after 100 s');
  await h.expect('__MI.M.cls() >= 2', 'femoral bleed: class II+ after 100 s');
  await h.wait(600); await h.shot('sandbox_bleeding');
  // health screen: drag the CAT (given from the RW cache) onto the left leg with the mouse
  await h.eval(`(() => { const I = __MI.I; I.autoStore(__MI.inv, I.newItem('tq_cat')); I.autoStore(__MI.inv, I.newItem('morphine')); I.autoStore(__MI.inv, I.newItem('quikclot')); __MI.view('health'); return true; })()`);
  await h.wait(700); await h.shot('health_before');
  const from = await center(h, '.ngc-med .mi[data-id="tq_cat"]'), to = await center(h, '.ngc-med path[data-region="legL"]');
  await h.logmsg('drag CAT ' + JSON.stringify(from) + ' -> ' + JSON.stringify(to));
  if (from && to) await drag(h, from, [to[0], to[1] + 30]);
  await h.expect(`__MI.M.action && __MI.M.action.kind === 'tq' && __MI.M.action.region === 'legL'`, 'mouse drag of a CAT onto the left leg starts a tourniquet');
  await h.eval('__MI.advance(12)'); await h.wait(400); await h.shot('health_applying');
  await h.eval('__MI.advance(30)');
  await h.expect(`__MI.M.regions.legL.tq.length === 1`, 'tourniquet on');
  await h.eval(`(() => { const b = __MI.M.bleeds.find(b => b.type === 'arterial'); return { flow: __MI.M.bleedRate(), ok: __MI.M.regions.legL.tq[0].ok }; })()`, 'after CAT');
  await h.eval(`__MI.treat('morphine', null)`); await h.eval('__MI.advance(200)');
  await h.wait(500); await h.shot('health_treated'); await h.notblank(0.05);
  // gear screen: drag a magazine from the left ammo case into the pack main grid
  await h.eval(`__MI.view('gear')`); await h.wait(600);
  await h.shot('gear'); await h.notblank(0.05);
  const magUid = await h.eval(`__MI.inv.slots.belt.slots.ammoL.grids[1][0].uid`, 'mag uid');
  const mfrom = await center(h, `.ngc-inv .grid .it[data-uid="${magUid}"]`);
  const packGrid = await h.eval(`(() => { const p = __MI.inv.slots.pack; const e = document.querySelector('.ngc-inv .grid[data-c="' + p.uid + '"][data-g="0"]'); const r = e.getBoundingClientRect(); return [r.left + 36 * 4 + 18, r.top + 36 * 2 + 36, r.bottom < innerHeight]; })()`, 'pack grid on screen');
  if (mfrom && packGrid) await drag(h, mfrom, packGrid);
  await h.expect(`(() => { const I = __MI.I; const m = I.find(__MI.inv, o => o.uid === ${magUid}); return m && I.parentOf(m).c === __MI.inv.slots.pack; })()`, 'mouse drag moved the magazine into the pack');
  // rotate while dragging (R): a 30-rd magazine laid sideways in the pack
  // loot a RW trooper's body: search, then take things
  await h.eval(`__MI.loot('rwbody')`); await h.wait(300);
  await h.shot('loot_searching');
  await h.wait(4500); await h.shot('loot_searched');
  await h.expect(`__MI.invUI.S.loot && [...__MI.I.walk(__MI.invUI.S.loot)].filter(o => o.unseen).length < [...__MI.I.walk(__MI.invUI.S.loot)].length`, 'searching reveals items');
  // inspect window by double-click on the rifle
  const rifle = await center(h, '.ngc-inv .slot[data-s="primary"] .it');
  if (rifle) { await h.page.mouse.click(rifle[0], rifle[1], { clickCount: 1 }); await h.page.mouse.click(rifle[0], rifle[1], { clickCount: 2 }); await h.wait(400); }
  await h.expect(`!!document.querySelector('.ngc-inv .win.insp')`, 'double-click opens the inspect window');
  await h.shot('inspect');
  // death: an untreated carotid bleed
  await h.eval(`(() => { __MI.view('health'); __MI.M.restore(); __MI.hit({ kind: 'fragment', dmg: 6, pen: 4, part: 'head', zone: 'neck' }, false); __MI.M.bleeds.push({ id: 99, region: 'head', zone: 'neck', type: 'arterial', rate: 800, ctl: 'junctional', name: 'CAROTID A.', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false }); return __MI.advance(150); })()`, 'carotid 150 s');
  await h.wait(500); await h.shot('health_shock_iv');
  await h.eval('__MI.advance(200)'); await h.wait(400);
  await h.expect('__MI.M.dead', 'untreated carotid bleed kills');
  await h.shot('health_dead');
}
