// RUNAWAY sandbox close-ups: a firing STRIDER, the hover tank in the fight, a fallen machine, the 1980 line, with the
// overlay off.   node snap.mjs scenes/runawaycloseup.mjs     (SCEN=combined by default, T=seconds before the shots)
export default async function (h) {
  const sc = process.env.SCEN || 'combined', T = +(process.env.T || 45);
  await h.goto(`dev/runaway.html?debug&scenario=${sc}&paused&overlay=0&res=0.8`);
  await h.waitFor('window.__RW && __RW.B && __RW.B.units.length', 15000);
  await h.eval(`(() => { __RW.overlay = false; return __RW.run(${T}); })()`);
  // keep stepping in small slices until a strider is firing, then frame it from its left, looking past it at its target
  await h.eval(`(() => { for (let k = 0; k < 120; k++) { const m = __RW.B.units.find(u => u.kind === 'strider' && u.alive && u.up && u.ai.fire && u.ai.aim); if (m) { window.__shooter = m.id; break; } __RW.run(0.25); } return window.__shooter || null; })()`);
  await h.eval(`(() => { const B = __RW.B, m = B.units.find(u => u.id === window.__shooter) || B.units.find(u => u.kind === 'strider' && u.alive); const a = m.ai.aim || [m.x, m.y, m.z - 20];
    const yaw = Math.atan2(-(a[0] - m.x), -(a[2] - m.z)) + 0.9; __RW.lookAt(m.x, m.y + 1.4, m.z, 6.5, yaw, -0.08); return { id: m.id, state: m.ai.state }; })()`);
  await h.wait(300); await h.shot('strider-firing');
  await h.eval(`(() => { const B = __RW.B, m = B.units.find(u => u.id === window.__shooter) || B.units.find(u => u.kind === 'strider' && u.alive); const a = m.ai.aim || [m.x, m.y, m.z - 20];
    const yaw = Math.atan2(-(a[0] - m.x), -(a[2] - m.z)); __RW.lookAt(m.x, m.y + 1.5, m.z, 4.5, yaw + Math.PI - 0.5, 0.02); return true; })()`);
  await h.wait(300); await h.shot('strider-front');
  // the hover tank
  await h.eval(`(() => { const B = __RW.B, t = B.units.find(u => u.kind === 'hovertank'); if (!t) return null; __RW.lookAt(t.x, t.y + 1.5, t.z, 16, t.yaw + 2.4, -0.18); return { state: t.ai.state, alive: t.alive }; })()`);
  await h.wait(300); await h.shot('hovertank');
  await h.eval(`(() => { const B = __RW.B, t = B.units.find(u => u.kind === 'mbt'); if (!t) return null; __RW.lookAt(t.x, t.y + 1.5, t.z, 16, t.yaw + 0.8, -0.15); return { state: t.ai.state, alive: t.alive }; })()`);
  await h.wait(300); await h.shot('mbt');
  // a machine that is down (fallen / disabled / destroyed), if any
  await h.eval(`(() => { const B = __RW.B, m = B.units.find(u => u.kind === 'strider' && !u.sim.up); if (!m) return null; __RW.lookAt(m.x, m.y + 0.6, m.z, 5, 0.6, -0.3); return { mode: m.sim.mode }; })()`);
  await h.wait(300); await h.shot('strider-down');
  // the 1980 line, from behind a defender toward the machines
  await h.eval(`(() => { const B = __RW.B, d = B.dummies.find(q => q.alive && q.kind !== 'vehicle') || B.dummies[0]; __RW.lookAt(d.x, d.y + 1.3, d.z, 4, Math.PI + 0.3, -0.05); return { kind: d.kind }; })()`);
  await h.wait(300); await h.shot('1980-line');
  await h.eval(`(() => ({ t: __RW.B.time, stats: __RW.B.stats, log: __RW.B.ai.log.slice(-8).map(l => l.t.toFixed(1) + ' ' + l.sq + ' ' + l.st + ' ' + (l.note || '')) }))()`);
}
