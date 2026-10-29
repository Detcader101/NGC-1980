// ngc/look-faces: the kneel (FM 23-9 kneeling position) from four sides, the aid kneel, the stance transitions
// stand > crouch > prone > crouch > stand, and the crew kneel (crewfig). Uses the people preview (game/dev/people.html).
export default async function (h) {
  await h.goto('dev/people.html?debug&res=1&ui=0'); await h.waitFor('window.__H', 30000);
  for (const [n, yaw] of [['side', Math.PI / 2], ['front34', Math.PI - 0.5], ['rear34', 0.6], ['front', Math.PI]]) {
    await h.eval(`__H.set('kneel', { yaw: ${yaw} })`); await h.wait(80); await h.shot('kneel-' + n);
  }
  await h.eval(`__H.set('aid', { yaw: ${Math.PI / 2} })`); await h.shot('aid-side');
  for (const t of [0.3, 0.9, 1.6, 2.4, 3.2, 4.1, 5.0, 6.2, 7.4]) { await h.eval(`__H.set('transition', { time: ${t}, yaw: ${Math.PI / 2} })`); await h.shot('transition-' + String(t).replace('.', 'p')); }
  await h.notblank();
}
