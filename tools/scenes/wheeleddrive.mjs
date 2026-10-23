// Wheeled vehicles driving the dev test ground (game/dev/vehicle.html): the dirt loop under AI at speed, the 60 % ramp
// in 4WD, the bump course (suspension articulation), the ford with the deep-water kit, the side slope, soft ground,
// then damage: a burst through the M151's fuel tank, fire, the crew bail-out window, the wreck.
//   node snap.mjs scenes/wheeleddrive.mjs
export default async function (h) {
  await h.goto('dev/vehicle.html?debug&ui=0&v=m151&zone=start&cam=chase&res=0.5');
  await h.waitFor('window.__V && __V.sim', 15000);
  const st = () => h.eval('({ id: __V.id, x: +__V.sim.pos[0].toFixed(1), y: +__V.sim.pos[1].toFixed(2), z: +__V.sim.pos[2].toFixed(1), kmh: +__V.sim.kmh.toFixed(1), gear: __V.sim.gear, range: __V.sim.range, fwd: __V.sim.fwd, rpm: Math.round(__V.sim.eng.rpm), run: __V.sim.eng.running, roll: +(__V.sim.roll * 57.3).toFixed(1), pitch: +(__V.sim.pitch * 57.3).toFixed(1), surf: __V.sim.wheels.map(w => w.surf).join(""), depth: +__V.sim.depth.toFixed(2), evs: __V.events.slice(-6).map(e => e.e) })');
  // 1. the dirt loop: AI around the ring at 45 km/h (centre (95,-70), r 50), chase cam, dust
  await h.eval(`(__V.zone('dirt'), window.__loop = setInterval(() => { const s = __V.sim, a = Math.atan2(s.pos[2] + 70, s.pos[0] - 95) - 0.22; __V.ai({ x: 95 + Math.cos(a) * 50, z: -70 + Math.sin(a) * 50 }, 11, { fwd: true }); }, 100), 1)`);
  await h.wait(9000); await st();
  await h.shot('m151-dirtloop'); await h.notblank();
  await h.eval(`(__V.cam('side'), 1)`); await h.wait(1500); await h.shot('m151-dirtloop-side');
  await h.eval(`(clearInterval(window.__loop), __V.ai(null), __V.drive(null), 1)`);
  // 2. the 60 % ramp in 4WD (M151: single-speed transfer, front drive engaged)
  await h.eval(`(__V.zone('slope60'), __V.drive({ throttle: 1, fwd: true }), __V.cam('side'), 1)`);
  await h.waitFor('__V.sim.pos[0] > 27.5', 25000); await h.wait(300);
  await st(); await h.shot('m151-ramp60');
  await h.waitFor('__V.sim.pos[0] > 31.5 || __V.sim.speed < 0.2', 25000); await st();
  await h.expect('__V.sim.pos[0] > 31.5');
  await h.eval(`(__V.drive({ throttle: 0, brake: 1, fwd: true }), 1)`); await h.wait(800);
  // 3. the M35 on the bump course: articulation over the twist ditch (wheel cam), troops' seats down
  await h.eval(`__V.setVehicle('m35', { cover: 'bows' }, 'bumps').then(() => 1)`);
  await h.eval(`(__V.cam('orbit', { yaw: 2.2, pitch: 0.18, dist: 9 }), __V.ai({ x: -12.5, z: -400 }, 2.8, { range: 'L' }), 1)`);
  await h.waitFor('__V.sim.pos[2] < -146', 150000); await st();
  await h.shot('m35-twistditch'); await h.notblank();
  await h.eval(`({ travel: __V.sim.wheels.map(w => +(__V.sim.spec._prep.wk[w.i].travel - w.s).toFixed(3)), loads: __V.sim.wheels.map(w => Math.round(w.Fz)) })`);
  await h.waitFor('__V.sim.pos[2] < -158', 60000); await h.shot('m35-twistditch2');
  // 4. the ford with the deep-water kit (snorkel), splash
  await h.eval(`(__V.ai(null), __V.setVehicle('m35', { cover: 'canvas' }, 'ford').then(() => 1))`); await h.wait(600);
  await h.eval(`(__V.cam('orbit', { yaw: 1.2, pitch: 0.12, dist: 14 }), __V.ai({ x: -45, z: 200 }, 3.0, { kit: true, range: 'L' }), 1)`);
  await h.waitFor('__V.sim.depth > 0.9', 60000); await st();
  await h.shot('m35-ford-deep'); await h.notblank();
  await h.expect('__V.sim.eng.running');
  await h.waitFor('__V.sim.pos[2] > 150', 60000); await st();
  // 5. side slope (25 %) with the Land Rover
  await h.eval(`(__V.ai(null), __V.setVehicle('landrover', {}, 'sideslope').then(() => 1))`); await h.wait(600);
  await h.eval(`(__V.cam('orbit', { yaw: 3.14, pitch: 0.1, dist: 10 }), __V.drive({ throttle: 0.35 }), 1)`); await h.wait(4500); await st();
  await h.shot('landrover-sideslope');
  await h.expect('Math.abs(__V.sim.roll) > 0.15 && __V.sim.up[1] > 0.5');
  // 6. the Beetle in the mud wallow (2WD road tyres: it bogs)
  await h.eval(`(__V.drive(null), __V.setVehicle('beetle', {}, 'mud').then(() => 1))`); await h.wait(600);
  await h.eval(`(__V.cam('chase'), __V.drive({ throttle: 1 }), 1)`); await h.wait(7000); await st();
  await h.shot('beetle-mud');
  await h.eval(`({ sink: __V.sim.wheels.map(w => +(w.ts.sink * 100).toFixed(0)), slip: __V.sim.wheels.map(w => +w.ts.kappa.toFixed(2)), x: __V.sim.pos[0] })`);
  // 7. damage: M151 on the road, a .50 burst through the fuel tank: leak, fire, wreck
  await h.eval(`(__V.drive(null), __V.setVehicle('m151', { top: 'canvas' }, 'road').then(() => 1))`); await h.wait(800);
  await h.eval(`(__V.cam('orbit', { yaw: 0.9, pitch: 0.2, dist: 8 }), __V.drive({ throttle: 0, brake: 0, handbrake: 1 }), 1)`);
  await h.eval(`(() => { const D = __V.dmg; D.setOccupant('front', true); let hits = []; for (let i = 0; i < 6; i++) hits.push(D.hit([-1.2, 0.5, 0.25 + i * 0.04], [1, 0, 0], 'hmg')); for (let i = 0; i < 3; i++) hits.push(D.hit([-0.2, 0.7, -2.2], [0, 0, 1], 'hmg')); D.state.fire = Math.max(D.state.fire, 0.15); return { hits, fuelLeak: D.state.fuelLeak, fire: D.state.fire }; })()`);
  await h.wait(3000); await st(); await h.shot('m151-fire');
  await h.eval(`(__V.dmg.state.fire = 1.45, 1)`); await h.wait(2500);
  await h.eval(`({ wrecked: __V.dmg.state.wrecked, cause: __V.dmg.state.cause, crew: __V.dmg.state.seats.filter(s => s.occupied).map(s => [s.id, +s.hp.toFixed(2)]), evs: __V.events.slice(-12).map(e => e.e) })`);
  await h.expect('__V.dmg.state.wrecked');
  await h.shot('m151-wreck');
}
