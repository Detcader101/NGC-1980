// Wheeled-vehicle sound (game/js/units/wheeled/wheeledaudio.js) in the dev page: switch it on with a real key press,
// then check the synthesiser follows the engine (firing frequency, load), the tyres (howl on tarmac, gravel on dirt), the
// horn and the gear whine, for the M151 (petrol four), the M35 (multifuel six + turbo) and the Beetle (air-cooled).
//   node snap.mjs scenes/wheeledaudio.mjs
export default async function (h) {
  await h.goto('dev/vehicle.html?debug&ui=0&v=m151&zone=road&cam=chase&res=0.5');
  await h.waitFor('window.__V && __V.sim', 15000);
  await h.key('tap', 'KeyN');
  await h.waitFor('!!__V.audio', 8000);
  const probe = `(() => { const A = __V.audio, S = __V.sim; return { state: A.ctx.state, rpm: Math.round(S.eng.rpm), eOsc: +A.eOsc.frequency.value.toFixed(1), eG: +A.eG.gain.value.toFixed(3), knock: +A.clD.gain.value.toFixed(3), turbo: +A.turboG.gain.value.toFixed(4), howl: +A.howlG.gain.value.toFixed(4), gravel: +A.grD.gain.value.toFixed(4), whine: +A.whineG.gain.value.toFixed(4), horn: +A.hornG.gain.value.toFixed(3), kmh: +S.kmh.toFixed(1) }; })()`;
  for (const id of ['m151', 'm35', 'beetle']) {
    await h.eval(`__V.setVehicle('${id}', {}, 'road').then(() => 1)`); await h.wait(1500);
    await h.eval(`window.__idle_${id} = ${probe}`);
    await h.eval(`(__V.drive({ throttle: 1 }), 1)`); await h.wait(5000);
    await h.eval(`window.__run_${id} = ${probe}`);
    await h.eval(`(__V.drive({ throttle: 0.5, horn: true }), 1)`); await h.wait(600);
    await h.eval(`window.__horn_${id} = ${probe}`);
    await h.eval(`(__V.drive(null), 1)`);
    // the engine note rises with rpm (firing frequency = rpm / 60 x cylinders / 2)
    await h.expect(`__run_${id}.eOsc > __idle_${id}.eOsc * 1.5 && Math.abs(__run_${id}.eOsc - __run_${id}.rpm / 60 * ${id === 'm35' ? 3 : 2}) < __run_${id}.eOsc * 0.25`);
    await h.expect(`__run_${id}.howl > 0 || __run_${id}.kmh < 15`);
    await h.expect(`__horn_${id}.horn > 0.02`);
  }
  // the diesel clatters harder than the petrol four; only the M35 whistles (turbo)
  await h.expect('__run_m35.knock > __run_m151.knock && __run_m35.turbo > 0 && __run_m151.turbo === 0');
  // gravel: the M151 on the dirt loop
  await h.eval(`__V.setVehicle('m151', {}, 'dirt').then(() => 1)`); await h.wait(800);
  await h.eval(`(__V.drive({ throttle: 0.8, fwd: true }), 1)`); await h.wait(4000);
  await h.eval(`window.__dirt = ${probe}`);
  await h.eval(`(__V.drive(null), 1)`);
  await h.eval('({ idle: [__idle_m151, __idle_m35, __idle_beetle], run: [__run_m151, __run_m35, __run_beetle], horn: __horn_m151.horn, dirt: __dirt })');
}
