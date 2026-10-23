// Infantry range: first-person views, sight pictures, a shot at 100 m and 300 m (dev/infantry.html?debug&fixed).
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1');
  await h.waitFor('window.__I', 15000);
  await h.eval('__I.advance(0.5)');
  await h.shot('hip_m16');
  await h.notblank(0.05);
  await h.eval('(__I.aimTarget(100), __I.advance(0.6, { ads: true }))');
  await h.shot('ads_m16_100');
  await h.eval('(__I.aimTarget(100), __I.advance(0.05, { ads: true, fire: true }), __I.advance(0.6, { ads: true, fire: false }))');
  await h.eval('({ log: __I.log, last: __I.lastHit })');
  await h.shot('after_shot_100');
  await h.expect('__I.lastHit && __I.lastHit.range > 95 && __I.lastHit.range < 105');
  await h.eval('(__I.aimTarget(300), __I.advance(0.3, { ads: true }), __I.advance(0.05, { ads: true, fire: true }), __I.advance(0.9, { ads: true, fire: false }))');
  await h.eval('({ log: __I.log, last: __I.lastHit })');
  await h.shot('after_shot_300');
  await h.expect('__I.lastHit && __I.lastHit.dy < -0.03 && __I.lastHit.dy > -0.25');
}
