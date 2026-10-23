// diagnostic: aim before / after a remedial action
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  const st = "({ pitch: __I.S.pitch, aimP: __I.S.aimPitch, camP: __I.S.camPitch, yaw: __I.S.yaw, aimY: __I.S.aimYaw, wP: __I.S.wPitch, rec: __I.S.recPitch, eye: __I.S.eye.y, t100: __I.range.targets.filter(t => t.d === 100).map(t => t.up) })";
  await A('(__I.aimTarget(100), __I.advance(0.4))');
  await A(st);
  await A("(__I.W.chamber = { round: 'M193', state: 'spent' }, __I.W.malf = 'extract', __I.advance(0.2, { fire: true }), __I.advance(0.1, { fire: false }))");
  await A(st);
  await A("(__I.press('remedial'), __I.advance(14.5))");
  await A(st);
  await A("(__I.advance(0.05, { fire: true }), __I.advance(1.2, { fire: false }))");
  await A('__I.log.slice(0, 3)');
  await A(st);
}
