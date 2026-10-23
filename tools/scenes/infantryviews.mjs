// First-person placements: every weapon at the hip and on the sights, sprint, crouch, prone, lean (dev/infantry.html).
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1&ui=0');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  const shots = async (name, setup) => { await A(setup); await h.shot(name); };
  await A('(__I.aimTarget(100), __I.advance(0.5))');
  await shots('m16_hip', '__I.advance(0.3, { ads: false })');
  await shots('m16_walk', "__I.advance(0.7, { move: [0, 1], walk: true })");
  await shots('m16_sprint', "(__I.input({ walk: false }), __I.advance(1.2, { move: [0, 1], sprint: true }))");
  await A("(__I.advance(1.5, { move: [0, 0], sprint: false }), __I.teleport(0, 1.2, 0), __I.aimTarget(100))");
  await shots('m16_lean_left', "__I.advance(0.6, { ads: true, lean: -1 })");
  await shots('m16_lean_right_hip', "__I.advance(0.6, { ads: false, lean: 1 })");
  await A("(__I.input({ lean: 0, stance: 'crouch' }), __I.advance(1.2), __I.aimTarget(200))");
  await shots('m16_crouch_ads_200', "__I.advance(0.6, { ads: true })");
  await A("(__I.input({ stance: 'prone' }), __I.advance(2.2, { ads: false }), __I.aimTarget(300))");
  await shots('m16_prone_hip', "__I.advance(0.4, { ads: false })");
  await shots('m16_prone_ads_300', "__I.advance(0.6, { ads: true })");
  await A("(__I.press('sightUp'), __I.advance(0.3, { ads: true }))");
  await shots('m16_prone_ads_L', "__I.advance(0.2, { ads: true })");
  await A("(__I.input({ stance: 'stand' }), __I.advance(2.5, { ads: false }), __I.press('gl'), __I.advance(0.3))");
  await shots('m203_hip', "__I.advance(0.3)");
  await A("(__I.press('gl'), __I.press('slot2'), __I.advance(3.5))");
  await shots('m60_hip', "(__I.aimTarget(200), __I.advance(0.3))");
  await shots('m60_ads_stand', "__I.advance(0.8, { ads: true })");
  await A("(__I.press('slot3'), __I.advance(3.0, { ads: false }))");
  await shots('law_closed', "__I.advance(0.2)");
  await A("(__I.press('law'), __I.advance(3.2), __I.press('law'), __I.advance(1.0))");
  await shots('law_hip_armed', "__I.advance(0.2)");
  await A("(__I.press('slot4'), __I.advance(2.5))");
  await shots('m1911_hip', "(__I.aimTarget(25), __I.advance(0.3))");
  await A("(__I.press('slot1'), __I.advance(2.5), __I.aimTarget(100))");
  await shots('freelook', "(__I.advance(0.1, { freeLook: true }), __I.input({ look: [-0.7, 0.05] }), __I.advance(0.1), __I.advance(0.5))");
  // resting on the sandbag wall (kneeling), then the M60's bipod on it
  await A("(__I.clear(), __I.teleport(-18.5, -0.9, 0, 'crouch'), __I.aimTarget(100, -8), __I.advance(0.8, { ads: true }))");
  await h.expect('__I.S.rested');
  await shots('rested_sandbags', '__I.advance(0.2, { ads: true })');
  await A("(__I.press('slot2'), __I.advance(3.5, { ads: false }), __I.aimTarget(200, -8), __I.advance(0.6, { ads: true }), __I.input({ bipod: true }), __I.advance(0.4, { ads: true }))");
  await h.expect('__I.S.bipod');
  await shots('m60_bipod_on_wall', '__I.advance(0.3, { ads: true })');
  // the Arma aim deadzone: the weapon moves first, the view follows at the edge
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1&ui=0&deadzone=5');
  await h.waitFor('window.__I', 15000);
  await A("(__I.aimTarget(100), __I.advance(0.5), __I.input({ look: [0.06, 0.03] }), __I.advance(0.05), __I.advance(0.4))");
  await h.eval('({ dz: [__I.S.dzYaw, __I.S.dzPitch], yaw: __I.S.yaw })');
  await h.expect('Math.abs(__I.S.dzYaw) > 0.04');
  await shots('deadzone_offset', '__I.advance(0.1)');
}
