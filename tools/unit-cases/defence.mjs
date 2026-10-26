// Actual defence subsystem in its rendered host. Distinct roles are asserted before live frame sampling.
const roster = [
  ['vads', 'M163 VADS', 'Open-turret tracked Vulcan; rotary spin-up, range-only pod and visible short bursts.', 12],
  ['shilka', 'ZSU-23-4 SHILKA', 'Quad gun on a tracked hull with separate searching radar and four muzzle positions.', 14],
  ['ciws', 'Phalanx CIWS — Block 0', '1980 carrier close-in mount with white radome and rotating six-barrel cluster.', 9],
  ['sparrow', 'Sea Sparrow', 'Eight-cell box launcher: used covers persist between salvos so every cell is visibly used.', 11],
  ['talon', 'Pantsir-S1 / RW TALON', 'Seized modern 8x8 refit: four gun barrels, separate search radar and twelve-tube visual bank.', 20],
  ['talonm', 'RW TALON — ship mount', 'Fictional naval pedestal conversion of the seized module, retaining its twelve tubes and twin gun pairs.', 14],
  ['lance', 'RW-5 LANCE', 'Fictional laser turret: charge line, beam, cooldown and hot radiators communicate its cycle.', 15],
  ['lancem', 'RW-5 LANCE — ship mount', 'Naval LANCE gameplay variant with the same visible charge / beam / radiator cycle.', 15],
];
function exercise(type) {
  __D.pause(); __D.setUnit(type);
  const d = __D.drones[0]; Object.assign(d, { R: ['sparrow', 'talon', 'talonm'].includes(type) ? 100 : 35, alt: 20, spd: 0, ph: 0, hp: 1e6, hpMax: 1e6 });
  const u = __D.unit, ud = u.mesh.userData, D = u.def, result = { states: [], spin: 0, maxSpent: 0, muzzles: ud.muzzles.length, cells: ud.cells?.length || 0, searchRadar: !!ud.radar };
  const states = new Set();
  for (let i = 0; i < 900; i++) {
    __D.run(1 / 30); states.add(D.beam?.st || D.mode);
    result.spin = Math.max(result.spin, D.spin); result.maxSpent = Math.max(result.maxSpent, D.cellsSpent || 0);
    if (D.beam) { result.chargeLine ||= D.beam.st === 'charge' && D.beam.line.visible; result.beam ||= D.beam.st === 'on' && D.beam.g.visible; result.hotRadiators ||= D.beam.st === 'cool' && ud.finM.color.r > 0.5; }
  }
  result.states = [...states]; result.hits = __D.S.hits; result.finite = [D.yaw, D.pitch, D.err].every(Number.isFinite);
  // Keep the role exercised during the rendered sample. The parked, durable practice drone is a fixture.
  __D.pause(false); window.__defenceCase = result; return result;
}
export const cases = roster.map(([type, name, description, dist]) => {
  const id = `defence-${type}`, query = `dev/defence.html?mode=fight&unit=${type}&drones=1&hill=0&ui=0&cam=0.8,0.26,${dist},0,2,0`;
  return { id, name, category: 'defence', kind: 'ai', query, description, async run(h) {
    await h.goto(query); await h.waitFor('window.__D?.unit && window.__BENCH', 30000);
    try {
      await h.eval(`(${exercise.toString()})(${JSON.stringify(type)})`, `${name} role checks`);
      await h.expect('__defenceCase.finite && __defenceCase.hits > 0', 'finite unit articulation and practice-drone hit feedback');
      if (type === 'vads') await h.expect('__defenceCase.spin > 0.7 && !__defenceCase.searchRadar', 'VADS spins its gun, not a search-radar dish');
      else if (type === 'shilka') await h.expect('__defenceCase.muzzles === 4 && __defenceCase.searchRadar', 'quad gun and separate search dish');
      else if (type === 'ciws') await h.expect('__defenceCase.spin > 0.7 && __defenceCase.cells === 0 && /PHALANX/.test(__D.DEF.ciws.name)', 'named 1980 Phalanx mount with rotary cluster');
      else if (type === 'sparrow') await h.expect('__defenceCase.cells === 8 && __defenceCase.maxSpent >= 4 && __defenceCase.muzzles === 0', 'Sea Sparrow progresses beyond its first pair of cells');
      else if (type.startsWith('talon')) await h.expect('__defenceCase.cells === 12 && __defenceCase.maxSpent >= 2 && __defenceCase.muzzles === 4 && __defenceCase.searchRadar', 'TALON uses successive tube covers alongside its gun pairs');
      else await h.expect('__defenceCase.chargeLine && __defenceCase.beam && __defenceCase.hotRadiators && __defenceCase.states.includes("cool")', 'LANCE shows charge, beam and cooling radiator states');
      await h.benchmark(id);
      await h.shot(id); await h.notblank();
      if (h.capture) await h.clip(id, { durationMs: 6000 });
    } finally { await h.eval('(__D.pause(false), delete window.__defenceCase, true)'); }
  } };
});
