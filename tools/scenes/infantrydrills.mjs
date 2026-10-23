// Infantry drills: reloads mid-animation, a malfunction cleared with SPORTS, M60 on the bipod, M203 through the
// quadrant, the LAW extended and on the sights, the M1911, third-person views. (dev/infantry.html?debug&fixed)
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1');
  await h.waitFor('window.__I', 15000);
  const A = async (expr) => h.eval(expr);
  await A('(__I.aimTarget(100), __I.advance(0.4))');
  // ---- M16A1 tactical reload, frames through it
  await A("(__I.press('reload'), __I.advance(0.45))"); await h.shot('tac_mag_out');
  await A('__I.advance(1.3)'); await h.shot('tac_pouch');
  await A('__I.advance(1.5)'); await h.shot('tac_mag_in');
  await A('__I.advance(1.2)');
  await h.expect('__I.W.mag && __I.W.mag.rounds >= 18 && !__I.W.act');
  // ---- fire the magazine dry (auto), speed reload from bolt lock
  await A("(__I.W.mode = 2, __I.advance(2.2, { ads: true, fire: true }), __I.advance(0.2, { fire: false }))");
  await h.expect("__I.W.bolt === 'locked'");
  await h.shot('bolt_locked');
  await A("(__I.press('reloadSpeed'), __I.advance(0.35, { ads: false }))"); await h.shot('speed_drop');
  await A('__I.advance(1.6)'); await h.shot('speed_bolt_release');
  await A('__I.advance(0.6)');
  await h.expect("__I.W.bolt === 'fwd' && __I.W.chamber && __I.W.mag.rounds > 0");
  await h.expect('__I.items.length >= 1');
  // ---- malfunction: a stovepipe, cleared with SPORTS
  await A("(__I.W.chamber = { round: 'M193', state: 'spent' }, __I.W.malf = 'stovepipe', __I.W.malfKnown = false, __I.press('ia'), __I.advance(1.0))"); await h.shot('ia_pull');
  await A('__I.advance(2.6)');
  await h.expect("!__I.W.malf && __I.W.chamber && __I.W.chamber.state === 'live'");
  // ---- check the magazine
  await A("(__I.press('checkMag'), __I.advance(0.8))"); await h.shot('check_mag');
  await A('__I.advance(1.2)');
  // ---- M203: through the quadrant at 150 m, fire at the hulk, then reload
  await A("(__I.press('gl'), __I.advance(0.1), __I.W.mode = 1, __I.W.setSight(4), __I.aimAt(14, 1.0, -150), __I.advance(0.8, { ads: true }))");
  await h.shot('m203_quadrant_150');
  await A("(__I.advance(0.05, { ads: true, fire: true }), __I.advance(2.4, { ads: true, fire: false }))");
  await h.shot('m203_after');
  await A("(__I.press('reload'), __I.advance(1.2, { ads: false }))"); await h.shot('m203_reload_open');
  await A('__I.advance(2.6)');
  await A("(__I.press('gl'), __I.advance(0.2))");
  // ---- M60 prone on the bipod at 300 m, a burst, barrel heat
  await A("(__I.press('slot2'), __I.advance(3.2), __I.input({ stance: 'prone' }), __I.advance(2.5))");
  await A("(__I.input({ bipod: true }), __I.advance(0.2), __I.aimTarget(300), __I.advance(0.8, { ads: true }))");
  await h.shot('m60_bipod_ads');
  await A("(__I.W.barrel.temp = 520, __I.advance(0.6, { ads: true, fire: true }), __I.advance(0.4, { ads: false, fire: false }))");
  await h.shot('m60_hot_barrel');
  await A("(__I.press('barrel'), __I.advance(3.2))"); await h.shot('m60_barrel_change');
  await A('__I.advance(6.5)');
  await h.expect('__I.W.barrel.temp < 100');
  // ---- M72 LAW: extend, arm, aim at the hulk at 150 m
  await A("(__I.input({ stance: 'crouch' }), __I.press('slot3'), __I.advance(3.0), __I.press('law'), __I.advance(1.4))"); await h.shot('law_extend');
  await A("(__I.advance(1.8), __I.press('law'), __I.advance(0.8), __I.aimAt(14, 1.4, -150), __I.advance(0.9, { ads: true }))");
  await h.shot('law_sights');
  await A("(__I.advance(0.05, { ads: true, fire: true }), __I.advance(1.6, { ads: true, fire: false }))");
  await h.shot('law_after');
  // ---- M1911
  await A("(__I.input({ stance: 'stand' }), __I.advance(2.0), __I.press('slot3'), __I.advance(1.5), __I.aimTarget(25), __I.advance(0.6, { ads: true }))");
  await h.eval('__I.W.key');
  await h.shot('m1911_ads');
  await A("(__I.advance(0.4, { ads: false }), __I.press('inspect'), __I.advance(0.9))"); await h.shot('m1911_inspect');
  await A('__I.advance(2)');
  // ---- third person
  await A("(__I.press('slot1'), __I.advance(2.0), __I.third = true, __I.advance(0.3, { ads: true }))"); await h.shot('third_aim');
  await A("(__I.advance(1.5, { ads: false, move: [0, 1], sprint: true }))"); await h.shot('third_sprint');
  await A("(__I.advance(0.5, { move: [0, 0], sprint: false, stance: 'crouch' }), __I.advance(1.2))"); await h.shot('third_kneel');
  await A("(__I.input({ stance: 'prone' }), __I.advance(2.2), __I.advance(0.5, { ads: true }))"); await h.shot('third_prone');
}
