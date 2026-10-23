// Infantry movement in the browser: sprint up the hill until blown, recover, wade into the pond, then third-person
// shots of the gait cycles (walk, run, sprint, crouch-walk, crawl). (dev/infantry.html?debug&fixed)
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&res=1');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  // face the hill (east) from its foot and sprint
  await A("(__I.teleport(42, -120, -Math.PI / 2), __I.advance(0.5))");
  const r1 = await A("(() => { let t = 0, blown = null, x0 = __I.S.pos.x; for (; t < 60 && blown == null; t += 0.5) { __I.advance(0.5, { move: [0, 1], sprint: true }); if (!__I.S.sprinting && t > 1) blown = t; } return { blown, dist: __I.S.pos.x - x0, climb: __I.S.pos.y, hr: Math.round(__I.S.hr), stamina: __I.S.staminaFrac, grade: __I.S.grade }; })()");
  await h.shot('blown_on_hill');
  await h.expect('(() => { const r = __I.S; return r.staminaFrac < 0.2 && r.hr > 160; })()');
  await A("__I.advance(20, { move: [0, 0], sprint: false })");
  await h.eval('({ hr: Math.round(__I.S.hr), stamina: __I.S.staminaFrac, breath: __I.S.breathRate })');
  await h.expect('__I.S.staminaFrac > 0.12 && __I.S.hr < 180 && __I.S.breathRate > 25');   // can sprint again; heart slowing, still panting
  // the pond: wade in (speed drops), then deep water (swimming)
  await A("(__I.teleport(-38, -70, Math.PI / 2), __I.advance(0.5))");
  await A("__I.advance(4, { move: [0, 1], sprint: false, walk: true })");
  await h.eval('({ x: __I.S.pos.x, depth: __I.env.waterDepth(__I.S.pos.x, __I.S.pos.z), speed: __I.S.speed, swim: __I.S.swimming, surface: __I.S.surface })');
  await h.shot('wading');
  await A("__I.advance(8, { move: [0, 1] })");
  await h.eval('({ x: __I.S.pos.x, depth: __I.env.waterDepth(__I.S.pos.x, __I.S.pos.z), speed: __I.S.speed, swim: __I.S.swimming })');
  await h.shot('deep_water');
  // third-person gait cycles on the range
  await A("(__I.clear(), __I.teleport(0, -30, 0), __I.third = true, __I.advance(0.3))");
  for (const [name, inp, secs] of [['walk', "{ move: [0, 1], walk: true }", 1.3], ['run', "{ move: [0, 1], walk: false }", 1.1], ['strafe', "{ move: [1, 0], walk: false }", 1.0], ['sprint', "{ move: [0, 1], sprint: true }", 1.6]]) {
    await A(`__I.advance(${secs}, ${inp})`); await h.shot('third_' + name);
  }
  await A("(__I.clear(), __I.advance(1.0, { move: [0, 0] }), __I.input({ stance: 'crouch' }), __I.advance(1.0))");
  await A("__I.advance(1.0, { move: [0, 1], walk: false })"); await h.shot('third_crouch_walk');
  await A("(__I.clear(), __I.input({ stance: 'prone' }), __I.advance(2.0))");
  await A("__I.advance(1.5, { move: [0, 1] })"); await h.shot('third_crawl');
  await A("(__I.clear(), __I.input({ stance: 'stand' }), __I.advance(0.8))"); await h.shot('third_getting_up');
}
