// ngc/depth-figures: first-person hands / arms / weapons and the Marine figure, for A/B shots. RK=0 env -> ?rk=0.
// PART=vm (viewmodel only) | model (model view only) | all (default)
const RK = process.env.RK ?? '1', PART = process.env.PART || 'all';
export default async function (h) {
  const A = e => h.eval(e);
  if (PART !== 'model') {
    await h.goto(`dev/infantry.html?debug&fixed&nosway&res=1&ui=0&rk=${RK}`);
    await h.waitFor('window.__I', 20000);
    await A('(__I.aimTarget(100), __I.advance(0.4))');
    await h.shot('vm_hip');
    const views = [['side_r', [0.42, -0.1, -0.12], [0.05, -0.17, -0.22]], ['side_l', [-0.42, -0.05, -0.25], [0.05, -0.15, -0.28]], ['below', [0.15, -0.55, -0.3], [0.08, -0.17, -0.25]], ['front', [0.05, -0.08, -0.75], [0.08, -0.17, -0.2]], ['grip_close', [0.26, -0.12, 0.0], [0.11, -0.28, -0.17]]];
    for (const [n, pos, look] of views) { await A(`(__I.vm.inspect = { pos: ${JSON.stringify(pos)}, look: ${JSON.stringify(look)} }, __I.render())`); await h.shot(`vm_${n}`); }
    await A('(__I.vm.inspect = null, __I.render())');
    await A('__I.advance(0.6, { ads: true })'); await h.shot('vm_ads');
    await A('__I.advance(0.6, { ads: false })');
    await A("(__I.press('reload'), __I.advance(0.45))"); await h.shot('vm_reload_out');
    await A('__I.advance(1.3)'); await h.shot('vm_reload_pouch');
    await A('__I.advance(1.5)'); await h.shot('vm_reload_in');
    await A('__I.advance(1.5)');
    await A("(__I.press('slot2'), __I.advance(3.5))"); await h.shot('vm_m60');
    await A("(__I.press('slot4'), __I.advance(2.5))"); await h.shot('vm_m1911');
  }
  if (PART !== 'vm') {
    await h.goto(`dev/infantry.html?view=model&rk=${RK}`);
    await h.waitFor('window.__I', 20000);
    const F = Math.PI - 0.6;
    const V = [['m_weapons', 0, 0.05, 3.0, -3, 1.2, 0], ['m_m16_q', 0.8, 0.3, 1.3, -3, 1.8, 0], ['m_stand', F, 0.1, 2.6, 0.0, 1.0, 0], ['m_face', Math.PI - 0.3, 0.05, 0.9, 0.0, 1.62, 0], ['m_aim', F, 0.1, 2.4, 2.4, 1.3, 0], ['m_walk', Math.PI / 2 + 0.3, 0.1, 2.8, 4.8, 1.0, 0], ['m_kneel', F, 0.15, 2.4, 9.6, 0.8, 0],
      ['m_hands', Math.PI - 0.9, 0.1, 0.9, 2.4, 1.3, -0.2], ['m_line10', Math.PI - 0.2, 0.12, 10, 8.4, 0.9, 0], ['m_line40', Math.PI - 0.2, 0.1, 40, 8.4, 0.9, 0], ['m_seated', F, 0.15, 2.4, 19.2, 0.6, 0], ['m_swim', F, 0.35, 3.0, 24.0, 1.0, 0], ['m_selfaid', F, 0.25, 2.2, 26.4, 0.6, 0]];
    for (const [n, y, p, d, x, yy, z] of V) { await A(`(() => { Object.assign(__I.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }); __I.cam.t.set(${x}, ${yy}, ${z}); return true; })()`); await h.wait(300); await h.shot(n); }
  }
}
