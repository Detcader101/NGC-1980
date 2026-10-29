// HORNET exterior model check: dev/jet-preview.html from several angles and states, plus contract asserts
// (wheel bottoms, hook tip, nothing but the shell inside the cockpit volume). node snap.mjs scenes/jetmodel.mjs
const VIEWS = [
  ['front34', '2.4,0.3,22', {}],
  ['side', '1.5708,0.02,20', {}],
  ['top', '0,1.5,26', {}],
  ['below_gear', '2.5,-0.4,18,0,-1,0', {}],
  ['rear_ab', '0.55,0.18,20,0,0,3', { ab: [1, 1], nozzle: [1, 1], n: [1.02, 1.02], brake: 1, hook: 1 }],
  ['cockpit_close', '2.2,0.5,6,0,0.6,-5.0', {}],
  ['cockpit_top', '0,1.5,5,0,0.6,-5.0', { canopy: 1 }],
  ['canopy_open', '1.9,0.25,9,0,0.7,-4.8', { canopy: 1, launchBar: true }],
  ['gear_up', '2.4,-0.3,20', { gear: 0 }],
  ['surfaces', '0.8,0.45,20', { stab: 0.42, ail: 0.44, rud: 0.52, flap: 1, lef: 1, brake: 1 }],
  ['surfaces_rear', '0,0.12,18', { stab: 0.42, ail: 0.44, rud: 0.52, flap: 1, lef: 1 }],
  ['nose_gear', '2.0,0.05,6,0,-1.3,-4.9', { launchBar: true, steer: 0.4 }],
];
export default async function (h) {
  await h.goto('dev/jet-preview.html?ui=0');
  await h.waitFor('window.__J', 10000);
  const base = JSON.stringify({ stab: 0, stabDiff: 0, ail: 0, rud: 0, flap: 0, lef: 0, brake: 0, gear: 1, hook: 0, canopy: 0, steer: 0, wow: [0, 0, 0], launchBar: false, n: [0.7, 0.7], nozzle: [0.5, 0.5], ab: [0, 0], lights: true });
  for (const [name, cam, st] of VIEWS) {
    await h.eval(`(() => { const J = __J, [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(J.cam, { yaw: y, pitch: p, dist: d }); J.cam.t.set(x || 0, yy || 0, z || 0);
      Object.assign(J.S, ${base}, ${JSON.stringify(st)}); return true; })()`);
    await h.wait(400);
    await h.shot(name);
  }
  // contract checks
  await h.eval(`(() => { const J = __J, T = J.THREE; Object.assign(J.S, ${base}, { hook: 1 }); J.render(); J.jet.group.updateMatrixWorld(true);
    const out = {}, bb = new T.Box3();
    J.jet.group.traverse(o => { if (o.name === 'tyre') { bb.setFromObject(o); const k = 'tyre@' + bb.min.x.toFixed(2); out[k] = [bb.min.y.toFixed(3), ((bb.min.x + bb.max.x) / 2).toFixed(3), ((bb.min.z + bb.max.z) / 2).toFixed(3)]; } });
    const t = J.jet.hookTip(new T.Vector3()); out.hookTip = t.toArray().map(v => +v.toFixed(3));
    let tris = 0, meshes = 0; J.jet.group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    out.tris = tris; out.meshes = meshes;
    // anything other than the shell inside the cockpit volume?
    const shell = new Set(); J.jet.shell.forEach(s => s.traverse(o => shell.add(o)));
    const v = new T.Vector3(), hits = {};
    J.jet.group.traverse(o => { if (!o.isMesh || shell.has(o) || !o.visible) return; const p = o.geometry.attributes.position, ix = o.geometry.index ? new Set(o.geometry.index.array) : null;   // (indexed lofts: only vertices a triangle uses)
      for (let i = 0; i < p.count; i++) { if (ix && !ix.has(i)) continue; v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.x) < 0.36 && v.y > -0.5 && v.y < 1.38 && v.z > -6.43 && v.z < -4.55) hits[o.name] = (hits[o.name] || 0) + 1; } });
    out.intrusions = hits; window.__chk = out; return out; })()`);
  await h.expect(`Object.entries(__chk).filter(([k]) => k.startsWith('tyre')).every(([, v]) => Math.abs(+v[0] + 2.05) < 0.03)`);
  await h.expect(`Math.abs(__chk.hookTip[1] + 1.95) < 0.05 && Math.abs(__chk.hookTip[2] - 5.89) < 0.1`);   // ngc/look-units: the drawn hook (jetfm HOOK_TIP)
  await h.expect(`Object.keys(__chk.intrusions).length === 0`);   // nothing but the canopy shell in the cockpit volume (shifted with the cockpit: jetmodel COCKPIT_SHIFT; |x| < 0.36 = inside the drawn canopy rails, 0.43-0.45)
  // control-surface senses: centre of each skin before/after a positive input (bulk of each surface is aft of its hinge)
  await h.eval(`(() => { const J = __J, T = J.THREE, bb = new T.Box3(), c = new T.Vector3();
    const tipOf = (o, lead) => { const p = o.geometry.attributes.position, v = new T.Vector3(); let best = null, bz = lead ? 1e9 : -1e9; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (lead ? v.z < bz : v.z > bz) { bz = v.z; best = v.clone(); } } return best; };
    // (ngc/look-units: the edge farthest from the hinge, not the box centre: the drawn stabilator's root runs far ahead of its pivot)
    const at = (st, name) => { Object.assign(J.S, ${base}, st); J.render(); J.jet.group.updateMatrixWorld(true); const o = J.jet.group.getObjectByName(name); if (/^(stab|ail|flap|rudder|lef)/.test(name)) return tipOf(o, name.startsWith('lef')); bb.setFromObject(o); return bb.getCenter(c).clone(); };
    const d = (st, name, ax) => +(at(st, name)[ax] - at({}, name)[ax]).toFixed(3);
    return window.__sg = { stabR_up: d({ stab: .42 }, 'stabRSkin', 'y'), stabL_up: d({ stab: .42 }, 'stabLSkin', 'y'), diffR_up: d({ stabDiff: .1 }, 'stabRSkin', 'y'), diffL_dn: -d({ stabDiff: .1 }, 'stabLSkin', 'y'),
      ailR_up: d({ ail: .44 }, 'ailRSkin', 'y'), ailL_dn: -d({ ail: .44 }, 'ailLSkin', 'y'), rudR_px: d({ rud: .52 }, 'rudderRSkin', 'x'), rudL_px: d({ rud: .52 }, 'rudderLSkin', 'x'),
      flapR_dn: -d({ flap: 1 }, 'flapRSkin', 'y'), flapL_dn: -d({ flap: 1 }, 'flapLSkin', 'y'), lefR_dn: -d({ lef: 1 }, 'lefRSkin', 'y'), lefL_dn: -d({ lef: 1 }, 'lefLSkin', 'y'),
      brake_up: d({ brake: 1 }, 'speedbrakeSkin', 'y'), canopy_up: d({ canopy: 1 }, 'canopyGlass', 'y'), steer_px: d({ steer: 0.5 }, 'launchBar', 'x') }; })()`);
  await h.expect(`Object.entries(__sg).every(([, v]) => v > 0.01)`);
}
