// ngc/depth-figures: first-person self aid (open hands on the wound) and the swim stroke, quick check.
const RK = process.env.RK ?? '1';
export default async function (h) {
  await h.goto(`?debug&auto&kb&peace&res=0.45&rk=${RK}`);
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.key('tap', 'KeyY'); await h.wait(900);
  for (const [part, name] of [['legL', 'aid-leg'], ['armL', 'aid-arm'], ['thorax', 'aid-chest']]) {
    await h.eval(`(() => { const M = __G.marine.M; M.restore && M.restore(); __G.marine.view = 'first'; M.hit({ round: 'M193', velocity: 800, part: '${part}', zone: '${part === 'thorax' ? 'chest' : part === 'armL' ? 'upper' : 'thigh'}', dir: [1, 0, 0] }); __G.marine.aim(__G.marine.S.yaw, -0.75); __G.marine.key('KeyK'); return !!M.action; })()`);
    await h.wait(2000); await h.shot(name);
  }
}
