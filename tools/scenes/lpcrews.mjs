// ngc/look-people: the Tomcat's pilot and RIO (dev/air.html), close and from outside. RK=0 / FIGPARTS=1 for before.
const RK = process.env.RK ?? '1', EXTRA = process.env.FIGPARTS ? '&figparts=1' : '';
export default async function (h) {
  await h.goto(`dev/air.html?model=tomcat&ui=0&rk=${RK}${EXTRA}`);
  await h.waitFor('window.__A', 20000);
  for (const [name, cam, canopy] of [['tomcat_cockpit', '2.3,0.45,8,0,0.8,-5', 1], ['tomcat_crew_close', '2.0,0.35,3.2,0,0.9,-5', 1], ['tomcat_crew_side', '1.5708,0.2,3.6,0,0.9,-4.8', 0], ['tomcat_front34', '2.4,0.3,26,0,0,0', 0]]) {
    await h.eval(`(() => { const A = __A, [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(A.cam, { yaw: y, pitch: p, dist: d }); A.cam.t.set(x || 0, yy || 0, z || 0); A.S.canopy = ${canopy}; return true; })()`);
    await h.wait(400); await h.shot(name);
  }
}
