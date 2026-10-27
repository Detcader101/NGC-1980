// Per-vessel rendered evidence. These are model / sea-motion fixtures, not complete strategic sorties.
const roster = [
  ['albatross', 'ALBATROSS', 'playable', 'Conventional 1980 carrier: moving deck-edge lift and jet blast deflector; active Phalanx / Sea Sparrow fit.', '0.8,0.32,195,0,9,0'],
  ['kraken', 'KRAKEN', 'ai', 'Seized nuclear carrier: broad bow, aft island, RUNAWAY deck mounts and no exhaust.', '0.8,0.32,195,0,9,0'],
  ['leviathan', 'RW-9 LEVIATHAN', 'ai', 'Fictional monitor: three independent recoil cradles, mixed deck defence and smaller-vessel sea motion.', '0.85,0.3,155,0,7,0'],
  ['container', 'Autonomous container feeder', 'ai', 'Electric cargo ship: visible roof / forecastle support, instanced containers and actual TALON deck refit.', '0.85,0.36,135,0,7,0'],
  ['sky', 'SKY CARRIER refit', 'playable', 'Fictional ALBATROSS lift refit: four separate outrigger fans. Model articulation only; flight control is not simulated here.', '0.8,0.25,215,0,22,0'],
  ['lcm8', 'LCM-8 — armour delivery', 'ai', 'Mike boat carrying the actual M60A3 model: cargo-well fit, bow ramp and pilothouse support. Articulation preview, not beach pathfinding.', '0.8,0.32,43,0,2,0'],
  ['lcm8truck', 'LCM-8 — truck delivery', 'ai', 'Existing lighter LCM model with the actual M35A2 in its well; forward-opening delivery ramp. Articulation preview.', '0.8,0.32,43,0,2,0'],
  ['lcac', 'Seized LCAC', 'ai', 'Air-cushion transport with actual seized M1A2 cargo, twin air propellers and ramp to ground. Articulation preview.', '0.85,0.34,55,0,2,0'],
];
const ids = { lcm8: 'lcm8-armor', lcm8truck: 'lcm8-truck' };
function exercise(ship) {
  const p = __S.cur.parts, T = __S.THREE, out = {};
  if (__S.mo) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 360; i++) { __S.step(1 / 30); lo = Math.min(lo, __S.mo.heave); hi = Math.max(hi, __S.mo.heave); }
    out.motion = hi - lo; out.finite = [__S.mo.heave, __S.mo.pitch, __S.mo.roll].every(Number.isFinite);
    out.mounts = p.guns.map(g => g.userData.defType);
  }
  if (ship === 'albatross') {
    const L = p.lifts[2], before = p.localDeck(L.cx, L.cz);
    p.lift(2, 'down'); for (let i = 0; i < 300; i++) p.tick(1 / 30, i / 30, 1000);
    out.liftDrop = before - p.localDeck(L.cx, L.cz); out.liftMatches = Math.abs(p.localDeck(L.cx, L.cz) - L.grp.position.y) < 1e-5;
    p.setJBD(1); out.jbdRaised = p.jbd.rotation.x < -0.8; p.lift(2, 'up');
  } else if (ship === 'kraken') {
    out.broadBow = p.localDeck(7, -64) > 0; out.aftIsland = p.tower.position.z > 20; out.exhaust = p.fx.smoke;
  } else if (ship === 'leviathan') {
    const a = p.turrets[0].userData, b = p.turrets[1].userData, rest = a.barrels.position.z;
    a.fire(); out.recoil = a.barrels.position.z - rest; out.otherCold = b.heat === 0;
    for (let i = 0; i < 240; i++) p.tick(1 / 30);
    out.recovered = Math.abs(a.barrels.position.z - rest) < 1e-4; out.turrets = p.turrets.length;
  } else if (ship === 'container') {
    p.group.updateMatrixWorld(true);
    const q = p.group.getWorldQuaternion(new T.Quaternion());
    const dir = new T.Vector3(0, -1, 0).applyQuaternion(q);
    const points = [[3, -30.3], [-4, -31], [6, -30.3], [1.2, -34.5], [-1.5, -37.5]];
    out.surfaceError = Math.max(...points.map(([x, z]) => {
      const origin = p.group.localToWorld(new T.Vector3(x, 100, z));
      const hit = new T.Raycaster(origin, dir).intersectObject(p.hull, true)[0];
      return hit ? Math.abs(p.group.worldToLocal(hit.point.clone()).y - p.localDeck(x, z)) : 1e9;
    }));
    out.noPhantomLedge = p.localDeck(6.3, -30.3) < p.localDeck(6, -30.3);
    out.containers = p.group.getObjectByName('containers').count; out.exhaust = p.fx.smoke;
  } else if (ship === 'sky') {
    const angles = p.fans.map(f => f.rotor.rotation.y); __S.step(0.1); p.group.updateMatrixWorld(true);
    out.fans = p.fans.length;
    out.rotating = p.fans.every((f, i) => f.rotor.rotation.y > angles[i]);
    out.outboard = p.fans.every(f => Math.abs(f.rotor.getWorldPosition(new T.Vector3()).x) > p.dims.W / 2);
  } else {
    const cargo = new T.Box3().setFromObject(p.cargo.group).getSize(new T.Vector3());
    out.cargoWidth = cargo.x; out.cargoPresent = !!p.cargo.group.parent;
    if (ship === 'lcm8') {
      p.animate({ ramp: 1.42 }); p.group.updateMatrixWorld(true); const a = p.ramp.localToWorld(new T.Vector3(0, 0, -3.7));
      p.animate({ ramp: -0.42 }); p.group.updateMatrixWorld(true); const b = p.ramp.localToWorld(new T.Vector3(0, 0, -3.7));
      out.rampLowers = b.y < a.y - 3 && b.z < a.z - 2;
      const hit = new T.Raycaster(new T.Vector3(1, 100, 5.6), new T.Vector3(0, -1, 0)).intersectObject(p.group, true)[0];
      out.roofMatches = !!hit && Math.abs(hit.point.y - p.localDeck(1, 5.6)) < 1e-4;
    } else if (ship === 'lcm8truck') {
      p.ramp.rotation.x = 0; p.group.updateMatrixWorld(true); const a = p.ramp.localToWorld(new T.Vector3(0, 2, 0));
      p.ramp.rotation.x = -1.32; p.group.updateMatrixWorld(true); const b = p.ramp.localToWorld(new T.Vector3(0, 2, 0));
      out.rampLowers = b.y < a.y - 1 && b.z < a.z - 1.5;
    } else {
      p.animate({ ramp: 0, prop: 0, lift: 1 }, 0); p.group.updateMatrixWorld(true); const a = p.ramp.localToWorld(new T.Vector3(0, 0, -4.6));
      p.animate({ ramp: 1, prop: 0.5, lift: 1 }, 0.5); p.group.updateMatrixWorld(true); const b = p.ramp.localToWorld(new T.Vector3(0, 0, -4.6));
      out.rampLowers = b.y < 0.1 && b.z < a.z - 2;
      out.props = p.props.length; out.rotating = p.props.every(prop => prop.rotation.z > 0);
    }
  }
  window.__navalCase = out; return out;
}
export const cases = roster.map(([ship, name, kind, description, cam]) => {
  const id = `naval-${ids[ship] || ship}`, query = `dev/ships.html?ship=${ship}&sea=4&speed=4&ui=0&cam=${cam}`;
  return { id, name, category: 'naval', kind, query, description, async run(h) {
    await h.waitFor('window.__S?.cur?.parts && window.__BENCH', 30000);
    try {
      await h.eval(`(${exercise.toString()})(${JSON.stringify(ship)})`, `${name} role checks`);
      if (['albatross', 'kraken', 'leviathan', 'container'].includes(ship)) {
        await h.expect('__navalCase.finite && __navalCase.motion > 0.01', 'finite rendered vessel motion in sea state 4');
        await h.expect('__navalCase.mounts.length > 0 && __navalCase.mounts.every(Boolean)', 'active war mounts replace placeholders');
      }
      if (ship === 'albatross') await h.expect('__navalCase.liftDrop > 3 && __navalCase.liftMatches && __navalCase.jbdRaised', 'moving lift support and blast-deflector articulation');
      else if (ship === 'kraken') await h.expect('__navalCase.broadBow && __navalCase.aftIsland && __navalCase.exhaust === 0', 'distinct seized nuclear carrier identity');
      else if (ship === 'leviathan') await h.expect('__navalCase.turrets === 3 && __navalCase.recoil > 1 && __navalCase.otherCold && __navalCase.recovered', 'three independent fictional rail cradles');
      else if (ship === 'container') await h.expect('__navalCase.surfaceError < 0.0001 && __navalCase.noPhantomLedge && __navalCase.containers > 80 && __navalCase.exhaust === 0', 'walkable surfaces match visible cargo-ship geometry');
      else if (ship === 'sky') await h.expect('__navalCase.fans === 4 && __navalCase.rotating && __navalCase.outboard', 'four visible lift fans spin outside the hull');
      else {
        await h.expect(`__navalCase.cargoPresent && __navalCase.cargoWidth < ${ship === 'lcac' ? 8.2 : 4.5} && __navalCase.rampLowers`, 'actual vehicle fits cargo well and ramp opens toward shore');
        if (ship === 'lcm8') await h.expect('__navalCase.roofMatches', 'LCM pilothouse is a solid visible roof');
        if (ship === 'lcac') await h.expect('__navalCase.props === 2 && __navalCase.rotating', 'air-cushion transport retains twin air propellers');
      }
      await h.benchmark(id);
      await h.shot(id); await h.notblank();
      if (h.capture) await h.clip(id, { durationMs: 6000 });
    } finally { await h.eval('(delete window.__navalCase, true)'); }
  } };
});
