// ngc/look-people: the Marine (model view) from every side, close-ups of the face, hands, elbows and knees, every
// posture. RK=0 -> ?rk=0, FIGPARTS=1 -> the previous part-built figure. SHOTS=a,b,c to run a subset.
const RK = process.env.RK ?? '1', EXTRA = process.env.FIGPARTS ? '&figparts=1' : '', ONLY = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
export default async function (h) {
  const A = e => h.eval(e);
  await h.goto(`dev/infantry.html?view=model&rk=${RK}${EXTRA}`);
  await h.waitFor('window.__I', 30000);
  const F = Math.PI;   // camera on the -z side: the figures face it
  // [name, yaw, pitch, dist, target x, y, z]
  const V = [
    ['face', F - 0.25, 0.04, 0.75, 0.0, 1.64, 0], ['face_side', F - 1.2, 0.05, 0.8, 0.0, 1.62, 0], ['face_34', F + 0.6, 0.12, 0.75, 0.0, 1.63, 0],
    ['front', F, 0.08, 3.6, 0.0, 0.95, 0], ['side', Math.PI / 2, 0.08, 3.6, 0.0, 0.95, 0], ['back', 0.0, 0.1, 3.6, 0.0, 0.95, 0], ['three_q', F - 0.7, 0.15, 3.0, 0.0, 1.0, 0],
    ['torso', F - 0.35, 0.1, 1.5, 0.0, 1.25, 0], ['hands', F - 0.9, 0.1, 0.9, 2.4, 1.3, -0.2], ['elbow_aim', F + 1.2, 0.2, 1.1, 2.4, 1.3, -0.1],
    ['aim', F - 0.5, 0.1, 3.0, 2.4, 1.1, 0], ['walk', Math.PI / 2 + 0.3, 0.1, 3.0, 4.8, 1.0, 0], ['sprint', Math.PI / 2 + 0.2, 0.1, 3.0, 7.2, 1.0, 0],
    ['kneel', F - 0.6, 0.15, 2.6, 9.6, 0.7, 0], ['knee', Math.PI / 2 + 0.4, 0.15, 1.2, 9.6, 0.5, 0], ['prone', F - 0.7, 0.4, 3.2, 12.0, 0.3, 0.6],
    ['lean', F - 0.3, 0.1, 3.0, 14.4, 1.0, 0], ['down', F - 0.7, 0.6, 3.2, 16.8, 0.3, -0.5], ['seated', F - 0.6, 0.15, 2.6, 19.2, 0.6, 0],
    ['climb', F - 0.6, 0.15, 2.6, 21.6, 1.0, 0], ['swim', F - 0.6, 0.35, 3.0, 24.0, 1.0, 0], ['selfaid', F - 0.6, 0.25, 2.4, 26.4, 0.6, 0],
    ['boots', F - 0.5, 0.25, 1.0, 0.0, 0.12, 0], ['line10', F - 0.2, 0.12, 10, 8.4, 0.9, 0], ['line40', F - 0.2, 0.1, 40, 8.4, 0.9, 0],
  ];
  for (const [n, y, p, d, x, yy, z] of V) {
    if (ONLY && !ONLY.includes(n)) continue;
    await A(`(() => { Object.assign(__I.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }); __I.cam.t.set(${x}, ${yy}, ${z}); return true; })()`);
    await h.wait(300); await h.shot(n);
  }
}
