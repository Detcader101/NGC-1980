// ngc/look-people: the people studio. Extra figures beside the infantry model view (bare heads in each face and skin
// tone, the roles from humanfig.js) and close-ups. SHOTS=a,b to run a subset; RK=0 / FIGPARTS=1 for the before shots.
const RK = process.env.RK ?? '1', EXTRA = process.env.FIGPARTS ? '&figparts=1' : '', ONLY = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
export default async function (h) {
  const A = (e, l) => h.eval(e, l);
  await h.goto(`dev/infantry.html?view=model&rk=${RK}${EXTRA}`);
  await h.waitFor('window.__I', 30000);
  await A(`(async () => {
    const SM = await import('../js/units/infantry/soldiermodel.js');
    const I = __I, F = [];
    // bare heads: faces 0..2 x tones (x = -8 .. -12, z = 4)
    [[0, 0], [1, 2], [2, 1], [0, 3]].forEach(([s, t], i) => { const m = SM.buildMarine({ seed: s, skin: [0xc79a77, 0xb5835e, 0x8a5d40, 0x5e3f2c][t], helmet: false, weapon: null }); m.root.position.set(-8 - i * 1.2, 0, 4); I.scene.add(m.root); SM.poseSkeleton(m, SM.makePose({}), 0); F.push(m); });
    I.studio = F; return true; })()`);
  await h.wait(500);
  const F = Math.PI;
  const V = [
    ['bare0', F - 0.15, 0.03, 0.62, -8, 1.65, 4], ['bare0_side', F - 1.45, 0.03, 0.62, -8, 1.65, 4], ['bare0_34', F + 0.65, 0.08, 0.62, -8, 1.65, 4],
    ['bare1', F + 0.2, 0.03, 0.62, -9.2, 1.65, 4], ['bare2', F - 0.3, 0.03, 0.62, -10.4, 1.65, 4], ['bare3', F + 0.1, 0.03, 0.62, -11.6, 1.65, 4],
    ['helm_face', F - 0.25, 0.04, 0.75, 0.0, 1.64, 0], ['helm_34', F + 0.6, 0.12, 0.75, 0.0, 1.63, 0],
  ];
  for (const [n, y, p, d, x, yy, z] of V) {
    if (ONLY && !ONLY.includes(n)) continue;
    await A(`(() => { Object.assign(__I.cam, { yaw: ${y}, pitch: ${p}, dist: ${d} }); __I.cam.t.set(${x}, ${yy}, ${z}); return true; })()`);
    await h.wait(300); await h.shot(n);
  }
}
