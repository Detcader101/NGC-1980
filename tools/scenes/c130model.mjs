// Hercules exterior model check: dev/c130-model.html from several angles and states, plus contract asserts (wheel
// bottoms on the ground line, real span / length / height, door and ramp positions).   node snap.mjs scenes/c130model.mjs
const run = { eng: [0, 1, 2, 3].map(() => ({ N: 1, beta: 30 })) }, stop = { eng: [0, 1, 2, 3].map(() => ({ N: 0, beta: 92.5 })) };
const VIEWS = [
  ['front34', '2.4,0.25,52,0,1,0', run],
  ['side', '1.5708,0.03,46,0,2.5,1', stop],
  ['top', '0,1.52,60,0,0,1', stop],
  ['rear34_ramp', '0.6,0.22,40,0,0,6', { ...stop, ramp: 1, door: [1, 1], jumpLight: 'green' }],
  ['nose', '3.7,0.12,14,0,0.5,-10', stop],
  ['props_feather', '3.9,0.15,16,-7,1.3,-4', { eng: [{ N: 0, beta: 92.5 }, { N: 0, beta: 30 }, { N: 1, beta: 30 }, { N: 1, beta: 30 }] }],
  ['dropconfig', '0.9,0.18,48,0,1,2', { eng: [0, 1, 2, 3].map(() => ({ N: 1, beta: 28 })), flap: 0.5, gear: 0, door: [1, 1], jumpLight: 'red' }],
  ['gear_up_flaps', '2.3,-0.25,40,0,-1,0', { ...stop, gear: 0, flap: 1, ail: 0.35, ele: 0.4, rud: 0.5 }],
  ['tail', '2.2,0.3,22,0,4,13', { ...stop, rud: 0.4, ele: -0.3 }],
  ['door_jumper', '-1.3,0.08,9,-2,-0.4,6.9', { ...stop, door: [1, 1], jumpLight: 'green' }],
  ['canopy', '-1.2,0.1,20,-26,6,6', stop],
  ['rear_low_ramp', '0.3,0.04,24,0,-0.5,10', { ...stop, ramp: 1, door: [1, 1] }],
  ['ramp_side', '1.5708,0.0,16,0,-1,10', { ...stop, ramp: 1, door: [1, 1] }],
  ['ramp_rear_below', '0.15,-0.05,16,0,-1.2,12', { ...stop, ramp: 1, door: [1, 1] }],
  ['gear_side', '1.5708,-0.05,14,2,-1.5,0.5', stop],
];
export default async function (h) {
  await h.goto('dev/c130-model.html?ui=0');
  await h.waitFor('window.__P', 10000);
  const base = JSON.stringify({ flap: 0, gear: 1, ramp: 0, door: [0, 0], ele: 0, ail: 0, rud: 0, steer: 0, jumpLight: 'off' });
  for (const [name, cam, st] of VIEWS) {
    await h.eval(`(() => { const P = __P, [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(P.cam, { yaw: y, pitch: p, dist: d }); P.cam.t.set(x || 0, yy || 0, z || 0);
      Object.assign(P.S, ${base}, ${JSON.stringify(st)}); return true; })()`);
    await h.wait(500);
    await h.shot(name);
  }
  await h.eval(`(() => { const P = __P, T = P.THREE; Object.assign(P.S, ${base}); P.render(); P.plane.group.updateMatrixWorld(true);
    const out = {}, bb = new T.Box3().setFromObject(P.plane.group); out.span = +(bb.max.x - bb.min.x).toFixed(2); out.len = +(bb.max.z - bb.min.z).toFixed(2); out.top = +bb.max.y.toFixed(2);
    out.tyres = []; P.plane.group.traverse(o => { if (o.name === 'tyre') { const b = new T.Box3().setFromObject(o); out.tyres.push(+b.min.y.toFixed(3)); } });
    let tris = 0, meshes = 0; P.plane.group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    out.tris = tris; out.meshes = meshes; window.__chk = out; return out; })()`);
  // span 40.41 (+ nav light), length 29.79, height 11.66 above the ground line (-2.64): fin top at ~9.0
  await h.expect(`Math.abs(__chk.span - 40.6) < 0.5 && Math.abs(__chk.len - 29.8) < 0.4 && Math.abs(__chk.top + 2.64 - 11.66) < 0.4`);
  await h.expect(`__chk.tyres.every(y => y > -2.78 && y < -2.6)`);
}
