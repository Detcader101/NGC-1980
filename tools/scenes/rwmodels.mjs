// RUNAWAY ground models: turntable shots from dev/rwmodels.html, posed by their sims.
//   node snap.mjs scenes/rwmodels.mjs            (UNIT=strider|lineup|hover|m1|t90|all via env)
const VIEWS = {
  strider: [['front34', '3.74,0.15,4.4,0,1.1,0'], ['side', '1.5708,0.05,4.4,0,1.1,0'], ['back34', '0.6,0.25,4.4,0,1.1,0'], ['head', '3.5,0.1,1.3,0,1.95,0'], ['legs', '1.2,0.1,2.4,0,0.5,0']],
  lineup: [['lineup', '0.5,0.12,6.5,0,1.0,0']],
  hover: [['front34', '3.7,0.25,14,0,1,0'], ['side', '1.5708,0.06,14,0,1,0'], ['rear34', '0.7,0.3,14,0,1,0'], ['top', '3.3,1.2,14,0,0,0'], ['low', '3.9,0.02,10,0,0.5,0']],
  m1: [['front34', '3.7,0.2,15,0,1.2,0'], ['side', '1.5708,0.04,15,0,1.2,0'], ['rear34', '0.7,0.3,15,0,1.2,0'], ['top', '3.3,1.2,15,0,0,0']],
  t90: [['front34', '3.7,0.2,15,0,1.1,0'], ['side', '1.5708,0.04,15,0,1.1,0'], ['rear34', '0.7,0.3,15,0,1.1,0'], ['top', '3.3,1.2,15,0,0,0']],
  all: [['all', '3.6,0.18,34,4,1.2,0']],
};
export default async function (h) {
  const which = (process.env.UNIT || 'strider').split(',');
  for (const unit of which) {
    for (const walk of process.env.WALK ? [process.env.WALK] : ['0']) {
      await h.goto(`dev/rwmodels.html?unit=${unit}&walk=${walk}`);
      await h.waitFor('window.__RW && __RW.units.length', 10000);
      await h.wait(700);
      for (const [name, cam] of VIEWS[unit] || VIEWS.strider) {
        await h.eval(`(() => { const [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(__RW.cam, { yaw: y, pitch: p, dist: d }); __RW.cam.t.set(x, yy, z); return true; })()`);
        await h.wait(300);
        await h.shot(`${unit}-${walk}-${name}`);
      }
    }
  }
}
