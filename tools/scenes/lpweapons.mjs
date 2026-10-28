// ngc/look-people: close-ups of the M60, M16A1/M203, M72A2 LAW and M1911A1 (model view, several angles and states),
// triangle / draw-call counts per weapon and detail, and first-person inspect views. RK=0 env -> ?rk=0.
// PART=model | vm | stats | all (default). ONLY=m60,m203,law,m1911 limits the model close-ups.
const RK = process.env.RK ?? '1', PART = process.env.PART || 'all', ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
export default async function (h) {
  const A = e => h.eval(e);
  if (PART === 'all' || PART === 'stats' || PART === 'model') {
    await h.goto(`dev/infantry.html?view=model&rk=${RK}`);
    await h.waitFor('window.__I', 20000);
    await A(`(async () => {
      const W = await import('../js/units/infantry/weaponmodels.js');
      const tri = o => { let t = 0, d = 0; o.traverse(m => { if (m.isMesh && m.geometry) { const g = m.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; d++; } }); return Math.round(t) + '/' + d; };
      const out = {};
      for (const k of ['M16A1', 'M16A1/M203', 'M60', 'M72A2', 'M1911A1']) out[k] = { high: tri(W.buildWeaponModel(k, { detail: 'high' }).group), low: tri(W.buildWeaponModel(k, { detail: 'low' }).group) };
      for (const f of ['M16-20', 'M1911-7', '40mm', 'M60-belt', 'M60-barrel', 'M72A2']) out['item ' + f] = tri(W.buildItemModel(f));
      window.__wstats = out; return true; })()`);
    await h.wait(200);
    await A('JSON.stringify(window.__wstats)', 'tris/meshes');
  }
  if (PART === 'all' || PART === 'model') {
    // models: [0] M16A1 y1.8, [1] M16/M203 y1.5, [2] M60 y1.2, [3] M72 y0.9, [4] M1911 y0.6, all at x=-3 rotated so the muzzle points -x
    // cam: yaw 0 looks from +z (the weapon's right side), yaw PI from -z (left)
    await A(`(__I.models[2].setState({ cover: 0, bipod: 1, leaf: 1, handle: 1 }), __I.models[3].setState({}), true)`);
    const R = Math.PI;
    const V = [
      ['m60', [['right', 0.0, 0.08, 1.9, -3.1, 1.15, 0], ['left_q', R + 0.5, 0.2, 1.3, -3.05, 1.15, 0], ['rear_q', 0.9 + R / 2, 0.25, 0.9, -2.8, 1.15, 0], ['front_q', -0.9, 0.15, 1.0, -3.4, 1.12, 0], ['receiver', 0.5, 0.35, 0.55, -2.95, 1.13, 0], ['below', 0.3, -0.5, 1.2, -3.1, 1.1, 0]]],
      ['m203', [['right', 0.0, 0.08, 1.4, -3.1, 1.45, 0], ['left_q', R + 0.6, 0.25, 0.75, -3.15, 1.43, 0], ['below', 0.4, -0.5, 0.7, -3.2, 1.43, 0], ['front', -1.2, 0.15, 0.6, -3.3, 1.43, 0]]],
      ['law', [['right', 0.0, 0.1, 1.5, -3.05, 0.84, 0], ['top_q', 0.6, 0.6, 0.8, -3.0, 0.85, 0], ['rear', R / 2 + 0.3, 0.2, 0.7, -2.9, 0.84, 0]]],
      ['m1911', [['right', 0.0, 0.05, 0.55, -3.07, 0.53, 0], ['left', R, 0.05, 0.55, -3.07, 0.53, 0], ['rear_q', 1.0, 0.3, 0.45, -3.05, 0.55, 0], ['front_q', -0.8, 0.2, 0.45, -3.07, 0.53, 0]]],
    ];
    for (const [w, views] of V) {
      if (ONLY.length && !ONLY.includes(w)) continue;
      for (const [n, y, p, d, x, yy, z] of views) { await A(`(() => { Object.assign(__I.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }); __I.cam.t.set(${x}, ${yy}, ${z}); return true; })()`); await h.wait(250); await h.shot(`${w}_${n}`); }
      if (w === 'm60') {
        await A(`(__I.models[2].setState({ cover: 1, bipod: 0, leaf: 0, handle: 0 }), Object.assign(__I.cam, { yaw: 0.5, pitch: 0.35, dist: 0.9 }), __I.cam.t.set(-3.0, 1.15, 0), true)`); await h.wait(250); await h.shot('m60_open');
        await A(`(Object.assign(__I.cam, { yaw: 0.0, pitch: 0.08, dist: 1.9 }), __I.cam.t.set(-3.1, 1.15, 0), true)`); await h.wait(250); await h.shot('m60_folded');
        await A(`(__I.models[2].setState({ cover: 0, bipod: 1, leaf: 1, handle: 1 }), true)`);
      }
      if (w === 'law') {
        await A(`(__I.models[3].setState({ law: 1, lawSights: 1 }), Object.assign(__I.cam, { yaw: 0.0, pitch: 0.1, dist: 1.8 }), __I.cam.t.set(-3.0, 0.84, 0), true)`); await h.wait(250); await h.shot('law_ext_right');
        await A(`(Object.assign(__I.cam, { yaw: 0.7, pitch: 0.4, dist: 0.9 }), __I.cam.t.set(-3.0, 0.86, 0), true)`); await h.wait(250); await h.shot('law_ext_top');
        await A(`(Object.assign(__I.cam, { yaw: R / 2 + 0.25, pitch: 0.15, dist: 0.6 }), __I.cam.t.set(-2.8, 0.86, 0), true)`.replace('R / 2', String(R / 2))); await h.wait(250); await h.shot('law_ext_rear');
        await A(`(__I.models[3].setState({}), true)`);
      }
      if (w === 'm203') {
        await A(`(__I.models[1].setState({ glOpen: 1, quad: 0.3 }), Object.assign(__I.cam, { yaw: 0.3, pitch: 0.1, dist: 0.8 }), __I.cam.t.set(-3.2, 1.45, 0), true)`); await h.wait(250); await h.shot('m203_open');
        await A(`(__I.models[1].setState({}), true)`);
      }
    }
    // the third-person soldiers (detail low): the M60 gunner (prone) and the M203 kneeler
    await A(`(() => { Object.assign(__I.cam, { yaw: Math.PI - 0.5, pitch: 0.2, dist: 1.6 }); __I.cam.t.set(12.0, 0.3, 0); return true; })()`); await h.wait(300); await h.shot('tp_m60');
    await A(`(() => { Object.assign(__I.cam, { yaw: Math.PI - 0.7, pitch: 0.15, dist: 1.5 }); __I.cam.t.set(9.6, 0.9, 0); return true; })()`); await h.wait(300); await h.shot('tp_m203');
  }
  if (PART === 'all' || PART === 'vm') {
    await h.goto(`dev/infantry.html?debug&fixed&nosway&res=1&ui=0&rk=${RK}`);
    await h.waitFor('window.__I', 20000);
    await A('(__I.aimTarget(100), __I.advance(0.4))');
    const ins = async (n, pos, look) => { await A(`(__I.vm.inspect = { pos: ${JSON.stringify(pos)}, look: ${JSON.stringify(look)} }, __I.render())`); await h.shot(n); };
    await h.shot('vm_m16_hip');
    await ins('vm_m203_side', [0.42, -0.15, -0.2], [0.05, -0.2, -0.3]);
    await A('(__I.vm.inspect = null, __I.render())');
    await A("(__I.press('slot2'), __I.advance(3.5))"); await h.shot('vm_m60');
    await ins('vm_m60_side', [0.6, -0.05, -0.15], [0.05, -0.15, -0.35]);
    await ins('vm_m60_left', [-0.55, 0.0, -0.1], [0.05, -0.15, -0.3]);
    await A('(__I.vm.inspect = null, __I.render())');
    await A('__I.advance(0.6, { ads: true })'); await h.shot('vm_m60_ads');
    await A('__I.advance(0.6, { ads: false })');
    await A("(__I.press('slot3'), __I.advance(3.0))"); await h.shot('vm_law');
    await A("(__I.press('law'), __I.advance(3.2))"); await h.shot('vm_law_ext');
    await A("(__I.press('law'), __I.advance(0.8), __I.advance(0.9, { ads: true }))"); await h.shot('vm_law_ads');
    await ins('vm_law_side', [0.5, 0.05, -0.1], [0.05, -0.1, -0.3]);
    await A('(__I.vm.inspect = null, __I.render())');
    await A('__I.advance(0.6, { ads: false })');
    await A("(__I.press('slot4'), __I.advance(2.5))"); await h.shot('vm_m1911');
    await ins('vm_m1911_side', [0.3, -0.05, -0.2], [0.05, -0.12, -0.38]);
    await A('(__I.vm.inspect = null, __I.render())');
    await A('__I.advance(0.6, { ads: true })'); await h.shot('vm_m1911_ads');
  }
}
