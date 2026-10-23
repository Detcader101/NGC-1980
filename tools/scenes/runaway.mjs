// RUNAWAY ground sandbox (dev/runaway.html): runs scenarios, fast-forwards the battle and photographs it, with asserts
// on the AI log.   node snap.mjs scenes/runaway.mjs        (SCEN=assault,combined,... to pick; default assault,combined)
export default async function (h) {
  const scens = (process.env.SCEN || 'assault,combined').split(',');
  for (const sc of scens) {
    await h.goto(`dev/runaway.html?debug&scenario=${sc}&paused&res=0.6`);
    await h.waitFor('window.__RW && __RW.B && __RW.B.units.length', 15000);
    await h.eval(`(() => { const p = __RW.B.isl.spawn.pad; __RW.lookAt(p[0], 10, p[1] - 30, 230, 0.5, -0.55); return true; })()`);
    await h.wait(400); await h.shot(`${sc}-00-overview`);
    // close on the first squad at the start
    await h.eval(`(() => { const m = __RW.B.units[0]; __RW.lookAt(m.x, m.y + 1.5, m.z, 14, 2.6, -0.2); return true; })()`);
    await h.wait(300); await h.shot(`${sc}-01-squad`);
    for (const [t, tag] of [[25, 'contact'], [30, 'fight'], [35, 'later']]) {
      await h.eval(`__RW.run(${t})`);
      // frame the squad that is doing the most: the centroid of the first living squad, from behind it toward the enemy
      await h.eval(`(() => { const B = __RW.B, S = B.ai.squads.find(s => s.members.some(m => m.alive)) || B.ai.squads[0]; const al = S.members.filter(m => m.alive);
        const cx = al.reduce((s, m) => s + m.x, 0) / Math.max(1, al.length), cz = al.reduce((s, m) => s + m.z, 0) / Math.max(1, al.length);
        const th = S.threat || [cx, cz + 50], yaw = Math.atan2(-(th[0] - cx), -(th[1] - cz));
        __RW.lookAt(cx, B.isl.height(cx, cz) + 2, cz, 34, yaw, -0.32); return { t: B.time, state: S.state, stats: B.stats }; })()`);
      await h.wait(300); await h.shot(`${sc}-${tag}`);
    }
    await h.eval(`(() => { const B = __RW.B; return { log: B.ai.log.map(l => l.t.toFixed(1) + ' ' + l.sq + ' ' + l.st + ' ' + (l.note || '')), stats: B.stats }; })()`);
  }
}
