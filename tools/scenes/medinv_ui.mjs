// Gear + health UI details on dev/medinv.html: rotate while dragging (R), shift-drag split, context menu, container
// window, ctrl-click quick move from a crate, keyboard cursor, corpsman IV through the health screen, shock visuals.
//   CHROME_PATH=... node snap.mjs scenes/medinv_ui.mjs
const center = async (h, sel) => h.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const gridCell = async (h, cUid, g, x, y) => h.page.evaluate((c, g, x, y) => { const e = document.querySelector(`.ngc-inv .grid[data-c="${c}"][data-g="${g}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + (x + 0.5) * 36, r.top + (y + 0.5) * 36]; }, cUid, g, x, y);
async function drag(h, from, to, { mid, key } = {}) {
  const m = h.page.mouse; await m.move(from[0], from[1]); await m.down();
  for (let i = 1; i <= 10; i++) { await m.move(from[0] + (to[0] - from[0]) * i / 10, from[1] + (to[1] - from[1]) * i / 10); await h.wait(16); if (i === 5 && key) { await h.page.keyboard.press(key); await h.wait(50); } }
  if (mid) await mid(); await h.wait(100); await m.up(); await h.wait(150);
}
export default async function (h) {
  await h.goto('dev/medinv.html?debug&manual&seed=11');
  await h.waitFor('window.__MI && __MI.M', 10000);
  await h.eval(`__MI.view('gear')`); await h.wait(400);
  // 1. a 30-round magazine from pocket CARGO L, dragged into the pack's 2x2 POCKET R and rotated with R mid-drag
  await h.eval(`(() => { const I = __MI.I; window.__m30 = I.newItem('mag_m16_30', { fill: 'M193', rounds: 30 }); I.placeIn(__MI.inv.slots.pockets, 4, __m30, 0, 0); __MI.invUI.render(); return __m30.uid; })()`);
  const pk = await h.eval('__MI.inv.slots.pack.uid');
  const f1 = await center(h, `.ngc-inv .it[data-uid="${await h.eval('__m30.uid')}"]`), t1 = await gridCell(h, pk, 3, 1, 1);
  await drag(h, f1, t1, { key: 'KeyR', mid: async () => { await h.eval(`(() => { const t = __MI.invUI.S.drag.t; return t && { kind: t.kind, g: t.g, x: t.x, y: t.y, err: t.err, act: t.act, rot: __MI.invUI.S.drag.rot }; })()`, 'drag target'); await h.shot('drag_rotated'); } });
  await h.expect(`__MI.I.parentOf(__m30).c === __MI.inv.slots.pack && __m30.r === 1`, 'R while dragging lays the magazine sideways in a pack pocket');
  // 2. shift-drag split a loose ammo stack
  await h.eval(`(() => { const I = __MI.I; window.__st = I.newItem('r_m193', { n: 60 }); I.placeIn(__MI.inv.slots.pack, 0, __st, 0, 0); __MI.invUI.render(); return 1; })()`);
  const f2 = await center(h, `.ngc-inv .it[data-uid="${await h.eval('__st.uid')}"]`), t2 = await gridCell(h, pk, 0, 3, 0);
  await h.page.keyboard.down('ShiftLeft'); await drag(h, f2, t2); await h.page.keyboard.up('ShiftLeft');
  await h.wait(200); await h.shot('split_dialog');
  await h.expect(`!!document.querySelector('.ngc-inv .win .split')`, 'shift-drag opens the split dialog');
  const ok = await center(h, '.ngc-inv .win [data-ok]'); if (ok) await h.page.mouse.click(ok[0], ok[1]);
  await h.expect(`__st.n === 30 && __MI.inv.slots.pack.grids[0].some(o => o.id === 'r_m193' && o !== __st && o.n === 30)`, 'split 60 -> 30 + 30');
  // 3. drop the loose rounds on an empty magazine: loads it
  await h.eval(`(() => { const I = __MI.I; window.__em = I.newItem('mag_m16_20'); I.placeIn(__MI.inv.slots.pack, 0, __em, 4, 4); __MI.invUI.render(); return 1; })()`);
  await drag(h, await center(h, `.ngc-inv .it[data-uid="${await h.eval('__st.uid')}"]`), await center(h, `.ngc-inv .it[data-uid="${await h.eval('__em.uid')}"]`));
  await h.expect(`__MI.I.magCount(__em) === 20 && __st.n === 10`, 'rounds dropped on a magazine load it');
  // 4. context menu + container window (IFAK inside the pack)
  await h.eval(`(() => { const I = __MI.I; window.__if = I.newItem('ifak'); I.placeIn(__MI.inv.slots.pack, 0, __if, 0, 2); for (const id of ['tq_cat','quikclot','chest_seal']) { const it = I.newItem(id); const f = I.findFree(__if, it); I.placeIn(__if, f.g, it, f.x, f.y, f.r); } __MI.invUI.render(); return 1; })()`);
  const fi = await center(h, `.ngc-inv .it[data-uid="${await h.eval('__if.uid')}"]`);
  await h.page.mouse.click(fi[0], fi[1], { button: 'right' }); await h.wait(200);
  await h.shot('context_menu');
  await h.expect(`[...document.querySelectorAll('.ngc-inv .menu div')].some(d => d.textContent === 'OPEN')`, 'right-click menu offers OPEN for a container');
  await h.eval(`[...document.querySelectorAll('.ngc-inv .menu div')].find(d => d.textContent === 'OPEN').click()`);
  await h.wait(200); await h.shot('container_window');
  await h.expect(`[...document.querySelectorAll('.ngc-inv .win .wh')].some(w => w.textContent.includes('IFAK'))`, 'IFAK opens in its own window');
  await h.page.keyboard.press('Escape'); await h.wait(100);
  // 5. medical chest: search, then ctrl-click quick-move into the rig
  await h.eval(`__MI.loot('crate_med')`); await h.wait(300);
  await h.eval(`(() => { const c = __MI.invUI.S.loot; for (const o of __MI.I.walk(c)) o.unseen = false; c.searched = true; __MI.invUI.render(); return 1; })()`);
  const dres = await h.eval(`__MI.I.find(__MI.invUI.S.loot, o => o.id === 'dressing_field').uid`);
  const fd = await center(h, `.ngc-inv .it[data-uid="${dres}"]`);
  await h.page.keyboard.down('ControlLeft'); await h.page.mouse.click(fd[0], fd[1]); await h.page.keyboard.up('ControlLeft'); await h.wait(150);
  await h.expect(`__MI.I.isWithin(__MI.I.find(__MI.inv, o => o.uid === ${dres}) || {}, __MI.inv)`, 'ctrl-click moved the dressing from the chest into the rig');
  await h.shot('crate_med');
  // 6. keyboard cursor: arrows + Enter pick up / place
  await h.page.keyboard.press('ArrowRight'); await h.page.keyboard.press('ArrowRight'); await h.wait(100);
  await h.expect(`!!document.querySelector('.ngc-inv .cur')`, 'keyboard cursor shows');
  await h.shot('keyboard_cursor');
  // 7. corpsman: IV through the health screen on a casualty in class III
  await h.eval(`(() => { __MI.loadout('corpsman'); __MI.view('health'); const M = __MI.M; M.vol = M.V0 * 0.64; M.rbc = M.vol * 0.44; M.hit({ round: 'M193', velocity: 850, part: 'stomach', zone: 'abdomen' }); return __MI.advance(20); })()`);
  await h.wait(400);
  const cw = await center(h, '.ngc-med .who [data-who="corpsman"]'); if (cw) await h.page.mouse.click(cw[0], cw[1]);
  const fiv = await center(h, '.ngc-med .mi[data-id="iv_lr"]'), arm = await center(h, '.ngc-med path[data-region="armR"]');
  if (fiv && arm) { const m = h.page.mouse; await m.move(fiv[0], fiv[1]); await m.down(); for (let i = 1; i <= 10; i++) { await m.move(fiv[0] + (arm[0] - fiv[0]) * i / 10, fiv[1] + (arm[1] - fiv[1]) * i / 10); await h.wait(16); } await h.shot('iv_drag_tip'); await m.up(); }
  await h.expect(`__MI.M.action && __MI.M.action.kind === 'iv'`, 'corpsman drags an IV onto the arm');
  await h.eval('__MI.advance(130)'); await h.wait(500);
  await h.expect('!!__MI.M.iv', 'IV running');
  await h.shot('health_iv_running');
  // 8. sandbox: class IV shock visuals (tunnel, greyscale) on the sight picture
  await h.eval(`(() => { __MI.view('sandbox'); const M = __MI.M; M.restore(); M.vol = M.V0 * 0.56; M.rbc = M.vol * 0.44; return __MI.advance(1); })()`);
  await h.wait(800); await h.shot('sandbox_class4_vision');
  await h.expect('__MI.M.mods().vision.grey > 0.5 && __MI.M.mods().vision.tunnel > 0.5', 'class IV greys and tunnels the view');
}
