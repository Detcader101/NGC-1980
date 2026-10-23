// Wheeled vehicle interiors (game/js/units/wheeled/interior.js) on the dev test ground: driver's eye looking ahead, at
// the instrument panel, at the levers and pedals; then driving so the needles, wheel and pedals move; the gauge canvas.
//   node snap.mjs scenes/wheeledcockpit.mjs [--query "?only=m151"]
const ALL = ['m151', 'm35', 'landrover', 'hilux', 'beetle', 'lada'];
export default async function (h) {
  const only = (h.page.url().match(/only=([a-z0-9,]+)/) || [])[1];
  await h.goto('dev/vehicle.html?debug&ui=0&v=m151&zone=road&cam=cockpit');
  await h.waitFor('window.__V && __V.sim', 15000);
  const ids = only ? only.split(',') : ALL;
  for (const id of ids) {
    await h.eval(`__V.setVehicle('${id}', {}, 'road').then(() => 1)`);
    await h.wait(800);
    await h.expect('!!(__V.interior && __V.interior.controls.panel)');
    const look = async (yaw, pitch, name, ms = 450) => { await h.eval(`(__V.cam('cockpit', { headYaw: ${yaw}, headPitch: ${pitch} }), 1)`); await h.wait(ms); await h.shot(`${id}-${name}`); };
    await look(0, 0, 'ahead');
    await look(0.12, -0.42, 'panel');
    await look(-0.35, -0.85, 'levers');
    await look(0.9, -0.15, 'passenger');
    await look(-1.2, -0.1, 'driverside');
    // drive: accelerate up the road, steer a little
    await h.eval(`(__V.drive({ throttle: 1, steer: 0.0 }), 1)`); await h.wait(4500);
    await h.eval(`(__V.drive({ throttle: 0.5, steer: 0.35 }), 1)`); await h.wait(500);
    await look(0.08, -0.3, 'driving');
    await h.eval(`({ id: '${id}', kmh: __V.sim.kmh, rpm: __V.sim.eng.rpm, gear: __V.sim.gear, temp: __V.sim.eng.temp, oil: __V.sim.eng.oilP, wheelRot: __V.interior.controls.wheelG.rotation.y })`);
    await h.expect('Math.hypot(__V.sim.vel[0], __V.sim.vel[2]) > 2 && Math.abs(__V.interior.controls.wheelG.rotation.y) > 0.3');
    await h.eval(`(__V.drive({ throttle: 0, brake: 1 }), 1)`); await h.wait(2500); await h.eval(`(__V.drive(null), 1)`);
  }
}
