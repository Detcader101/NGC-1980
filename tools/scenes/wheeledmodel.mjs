// Wheeled vehicle models on the dev test ground (game/dev/vehicle.html): each vehicle from several angles, variants,
// suspension articulation. node snap.mjs scenes/wheeledmodel.mjs [--query "?only=m151"]
const ALL = ['m151', 'm35', 'landrover', 'hilux', 'beetle', 'lada'];
export default async function (h) {
  const only = (h.page.url().match(/only=([a-z0-9,]+)/) || [])[1];
  await h.goto('dev/vehicle.html?debug&ui=0&hud=0&v=m151&zone=start&cam=orbit&paused');
  await h.waitFor('window.__V && __V.sim', 15000);
  const ids = only ? only.split(',') : ALL;
  for (const id of ids) {
    await h.eval(`__V.setVehicle('${id}', {}, 'start').then(() => 1)`);
    await h.wait(500);
    await h.eval(`(__V.pause(false), 1)`); await h.wait(1200); await h.eval(`(__V.pause(true), 1)`);
    for (const [name, yaw, pitch, dist] of [['rear34', 0.75, 0.22, 1.25], ['front34', 2.45, 0.28, 1.25], ['side', 1.5708, 0.05, 1.35], ['top', 0.3, 1.2, 1.4], ['low', -0.6, 0.02, 0.9]]) {
      await h.eval(`(__V.cam('orbit', { yaw: ${yaw}, pitch: ${pitch}, dist: __V.sim.spec.dims.L * ${dist} + 1.5 }), 1)`);
      await h.wait(350);
      await h.shot(`${id}-${name}`);
    }
    await h.notblank();
  }
}
