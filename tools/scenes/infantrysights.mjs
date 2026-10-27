// Sight pictures, one per weapon and setting, aimed at a real target (dev/infantry.html, no HUD):
// M16A1 short aperture at 100 m and 'L' at 400 m, M60 battle sight and the leaf at 600 m, M203 quadrant at 150 m (on
// the hulk), M72 LAW reticle at the hulk, M1911 at 25 m. Each is followed by a shot and the spotting scope.
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  await A("(__I.teleport(0, 1.2, 0, 'prone'), __I.advance(0.4))");
  const ads = async (name, setup, fire = true, wait = 1.0) => {
    await A(`(${setup}, __I.advance(0.8, { ads: true }))`);
    await A('(document.getElementById("hud").style.visibility = "hidden", document.getElementById("log").style.visibility = "hidden", __I.scope = false, __I.render())');
    await h.shot(name);
    await A('(document.getElementById("hud").style.visibility = "", document.getElementById("log").style.visibility = "", __I.scope = true)');
    if (fire) { await A(`(__I.advance(0.05, { ads: true, fire: true }), __I.advance(${wait}, { ads: true, fire: false }))`); await h.eval('__I.log[0]'); await h.shot(name + '_scope'); }
  };
  await ads('m16_short_100', '__I.aimTarget(100)');
  await ads('m16_L_400', "(__I.press('sightUp'), __I.advance(0.1), __I.aimTarget(400))", true, 1.2);
  await A("(__I.press('sightDown'), __I.press('slot2'), __I.advance(3.5, { ads: false }))");
  await ads('m60_battle_300', '__I.aimTarget(300)', true, 0.9);
  await A("(__I.W.setSight(4), __I.advance(0.1))");
  await ads('m60_leaf_600', "__I.aimAt(0, 1.0, -600)", false);
  await A("(__I.press('slot1'), __I.advance(3.5, { ads: false }), __I.press('gl'), __I.advance(0.2), __I.W.mode = 1, __I.W.setSight(4))");
  await ads('m203_quadrant_150', '__I.aimAt(14, 0.9, -150)', true, 2.6);
  await A("(__I.press('gl'), __I.press('slot3'), __I.advance(3.0, { ads: false }), __I.press('law'), __I.advance(3.2), __I.press('law'), __I.advance(0.8))");
  // the LAW: aim with the 150 m line on the hulk: put that line (its angle below the centre) on the target
  await ads('law_150', "(() => { const ln = __I.W.lawLines().find(l => l[0] === 150); __I.aimAt(14, 0.9, -150); __I.S.pitch += ln[1]; __I.S.wPitch += ln[1]; return 1; })()", true, 1.4);
  await A("(__I.press('slot3'), __I.advance(2.5, { ads: false }))");
  await ads('m1911_25', '__I.aimTarget(25)');
}
