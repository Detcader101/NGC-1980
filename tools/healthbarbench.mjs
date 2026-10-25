// node tools/healthbarbench.mjs [--tmax 900] [--seed 3] - UNIT MARKERS (game/js/ui/unitmarkers.js): the adapter gives
// every unit the war builds a health 0..1, a role and a side, with no change to the units' own code.
//   1. the damage-model shapes the player's crafts keep (Huey, Hornet, Tomcat, Marine, M60A3, wheeled, vehicle.js)
//   2. a whole CPU-vs-CPU war in node (tools/sim/headless.mjs): every unit collected every few seconds - health in
//      0..1, a known role, a side, finite position; the roles seen; squads aggregated; dead units dropped
//   3. the cost of collectUnits per call (the browser calls it once per drawn frame)
const A = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, l) => (v.startsWith('--') ? a.push([v.slice(2), l[i + 1] && !l[i + 1].startsWith('--') ? l[i + 1] : true]) : 0, a), []));
const { hpOf, roleOf, sideOf, collectUnits, ROLES, goneOf } = await import('../game/js/ui/unitmarkers.js');

let fails = 0, n = 0;
const check = (name, ok, got = '', want = '') => { n++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${got}${want !== '' ? '   (want ' + want + ')' : ''}`); if (!ok) fails++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ------------------------------------------------------------------ 1. shapes
{
  check('number', near(hpOf(0.4), 0.4) && hpOf(-3) === 0 && hpOf(7) === 1 && hpOf(NaN) === 0, hpOf(0.4));
  check('{hp, hpMax} (war units)', near(hpOf({ hp: 3, hpMax: 12 }), 0.25) && hpOf({ hp: -4, hpMax: 10 }) === 0, hpOf({ hp: 3, hpMax: 12 }));
  check('{hp, max} (structures)', near(hpOf({ hp: 13, max: 26 }), 0.5), hpOf({ hp: 13, max: 26 }));
  check('dead structure reads 0', hpOf({ hp: 5, max: 26, dead: true }) === 0);
  const { createDamage } = await import('../game/js/damage.js'); const D = createDamage(); D.reset();
  check('Huey damage.js fresh = 1', hpOf(D) === 1, hpOf(D));
  D.hp.engine = 0; D.hp.tail = 0.5; const hd = hpOf(D); check('Huey damage.js hit < 1', hd > 0 && hd < 1, hd.toFixed(3));
  const { createJetDamage } = await import('../game/js/jetdamage.js'); const J = createJetDamage(); J.reset(); J.hit(0.8, 'engL');
  check('Hornet jetdamage.js hit', hpOf(J) < 1 && hpOf(J) > 0.8, hpOf(J).toFixed(3));
  const { createTomcatDamage } = await import('../game/js/units/air/tomcatdamage.js'); const TD = createTomcatDamage(); TD.reset();
  check('Tomcat damage fresh = 1', hpOf(TD) === 1, hpOf(TD));
  const { createMedical } = await import('../game/js/units/infantry/medical.js'); const M = createMedical({ rng: () => 0.5 });
  check('Marine medical.js fresh = 1', near(hpOf(M), 1), hpOf(M).toFixed(3));
  M.regions.thorax.hp = M.regions.thorax.max * 0.2; M.vol = M.V0 * 0.8;
  const mh = hpOf(M); check('Marine medical.js wounded + bleeding', mh > 0 && mh < 0.6, mh.toFixed(3));
  check('the Marine (marine.js { M })', near(hpOf({ M }), mh));
  M.dead = true; check('dead Marine reads 0', hpOf({ M }) === 0);
  const { makeArmor } = await import('../game/js/units/armor/armorballistics.js'); const { M60A3_ARMOR } = await import('../game/js/units/armor/m60a3.js');
  const V = { armor: makeArmor(M60A3_ARMOR) }; check('M60A3 armour fresh = 1', hpOf({ V }) === 1, hpOf({ V }));
  V.armor.COMPS.find(c => c.kind !== 'crew').hp = 0; const ah = hpOf({ V }); check('M60A3 a component out', ah < 1 && ah > 0.5, ah.toFixed(3));
  V.armor.cookoff = true; check('M60A3 cook-off reads 0', hpOf({ V }) === 0);
  const VD = await import('../game/js/units/wheeled/vehicledamage.js'); const { M151 } = await import('../game/js/units/wheeled/m151.js');
  const wd = VD.createDamage(M151, null); const W1 = { dmg: wd };
  check('M151 fresh = 1', hpOf(W1) === 1, hpOf(W1));
  wd.state.engine = 0.2; wd.state.tyres[0].blown = true; const wh = hpOf(W1); check('M151 engine hit + blown tyre', wh < 0.85 && wh > 0.4, wh.toFixed(3));
  wd.state.wrecked = true; check('M151 wrecked reads 0', hpOf(W1) === 0);
  check('vehicle.js {sim: {hp: 0..100}}', near(hpOf({ sim: { hp: 64 } }), 0.64));
  check('foot.js default medical {total()}', near(hpOf({ total: () => 0.3 }), 0.3));
  check('unknown shape reads full', hpOf({ foo: 1 }) === 1);
  // roles: the names the war uses, and the shape fallbacks for units nobody has named yet
  const R = { carrier: 'ship', freighter: 'ship', battleship: 'ship', escort: 'air', shrike: 'air', strike: 'air', dropship: 'air', reaper: 'drone', shahed: 'drone', gunship: 'drone', transport: 'heli', squad: 'inf', aa: 'aa', hq: 'struct', factory: 'struct', fuel: 'struct', radar: 'struct', shipyard: 'struct' };
  const bad = Object.entries(R).filter(([t, r]) => roleOf({ type: t }) !== r);
  check('war.js type names -> roles', !bad.length, bad.map(([t]) => `${t}:${roleOf({ type: t })}`).join(' ') || `${Object.keys(R).length} ok`);
  check('kind beats type (CH-46 is the legacy drone)', roleOf({ type: 'drone', kind: 'ch46' }) === 'heli' && roleOf({ type: 'transport', kind: 'mv22' }) === 'heli' && roleOf({ type: 'gunship', kind: 'wasp' }) === 'drone');
  check('ground kinds', roleOf({ kind: 'strider' }) === 'inf' && roleOf({ kind: 'marine' }) === 'inf' && roleOf({ kind: 'hovertank' }) === 'armour' && roleOf({ kind: 'mbt', mbtType: 't90m' }) === 'armour');
  check('a new unit by name (parity: "RW-12 SCARAB TANK")', roleOf({ type: 'rw12-scarab-tank' }) === 'armour' && roleOf({ kind: 'mq9reaper' }) === 'drone' && roleOf({ type: 'm60a3' }) === 'armour');
  check('a new unit by shape', roleOf({ dims: { L: 50 } }) === 'ship' && roleOf({ rot: {} }) === 'heli' && roleOf({ air: true }) === 'air' && roleOf({ vehicle: true }) === 'vehicle' && roleOf({ markerRole: 'aa' }) === 'aa');
  check('sides', sideOf({ side: 2 }) === 2 && sideOf({ owner: 1 }) === 1 && sideOf({ I: { owner: 2 } }) === 2 && sideOf({}) === 0 && sideOf({ side: 7 }) === 0);
  check('gone units', goneOf({ dead: true }) && goneOf({ dying: true }) && goneOf({ sinking: 0 }) && goneOf({ alive: false }) && !goneOf({ hp: 1 }));
}

// ------------------------------------------------------------------ 2. a whole war
{
  const { runWar } = await import('./sim/headless.mjs');
  const tmax = +(A.tmax || 900), seed = +(A.seed || 3);
  const out = [], seenRoles = new Map(), seenKinds = new Map(), errs = []; let samples = 0, maxN = 0, squads = 0, squadAgg = 0, damaged = 0, t0 = 0, calls = 0, ms = 0, lastT = -99, deadSeen = 0;
  const onStep = W => {
    if (W.time - lastT < 5) return; lastT = W.time; samples++;
    const s = performance.now(), k = collectUnits(W, out); ms += performance.now() - s; calls++;
    maxN = Math.max(maxN, k);
    const keys = new Set();
    for (let i = 0; i < k; i++) {
      const e = out[i], u = e.unit, name = `${u.type || u.kind || 'struct'}${u.kind && u.type ? '/' + u.kind : ''}${u.mbtType ? '/' + u.mbtType : ''}`;
      if (!(e.hp >= 0 && e.hp <= 1)) errs.push(`hp ${e.hp} ${name}`);
      if (!ROLES.includes(e.role)) errs.push(`role ${e.role} ${name}`);
      if (![0, 1, 2].includes(e.side)) errs.push(`side ${e.side} ${name}`);
      if (!Number.isFinite(e.x + e.y + e.z)) errs.push(`pos ${name}`);
      if (keys.has(e.key)) errs.push(`twice ${name}`); keys.add(e.key);
      if (goneOf(u) && e.key === u) { deadSeen++; errs.push(`dead unit marked ${name}`); }
      seenRoles.set(e.role, (seenRoles.get(e.role) || 0) + 1);
      const kn = `${e.side}:${e.role}:${e.key !== u ? 'squad' : name}`; seenKinds.set(kn, (seenKinds.get(kn) || 0) + 1);
      if (e.key !== u) { squads++; if (e.n > 1) squadAgg++; }
      if (e.hp < 0.999) damaged++;
    }
  };
  t0 = performance.now();
  const rec = await runWar({ seed, blue: 'BALANCED', red: 'DEFAULT', tmax, tech: 'all', patch: ['catlane'], onStep });
  console.log(`  war: ${tmax} s game in ${((performance.now() - t0) / 1000).toFixed(0)} s wall, end ${rec.end || rec.result || ''}  ${samples} samples, up to ${maxN} markers`);
  console.log('  roles seen: ' + [...seenRoles].map(([r, c]) => `${r} ${c}`).join(', '));
  console.log('  units seen (side:role:type): ' + [...seenKinds.keys()].sort().join('  '));
  check('no bad entries (hp 0..1, role, side, position, no repeats)', !errs.length, errs.slice(0, 6).join(' | ') || `${samples} samples`);
  const want = ['ship', 'heli', 'inf', 'aa', 'struct', 'drone', 'air'];
  const miss = want.filter(r => !seenRoles.has(r)); check('the roles a war builds all appear', !miss.length, miss.join(' ') || want.join(' '));
  check('armour appears (RW-7 / MBT) by the end', seenRoles.has('armour') || tmax < 600, seenRoles.get('armour') || 0);
  check('both sides appear', [...seenKinds.keys()].some(k => k.startsWith('1:')) && [...seenKinds.keys()].some(k => k.startsWith('2:')));
  check('infantry squads aggregated (one marker, many men)', squads > 0 && squadAgg > 0, `${squadAgg} / ${squads}`);
  check('damage shows (some markers under 100 %)', damaged > 0, damaged);
  const per = ms / Math.max(1, calls); check(`collectUnits cost per call (${maxN} max)`, per < 1.5, `${per.toFixed(3)} ms`, '< 1.5 ms');
  // fog of war: with nothing visible no side-2 unit is collected
  const fogged = []; let kf = 0; await runWar({ seed, tmax: 120, tech: 'all', patch: ['catlane'], onStep: W => { kf = collectUnits(W, fogged, { visible: () => false }); } });
  let enemy = 0; for (let i = 0; i < kf; i++) if (fogged[i].side === 2) enemy++;
  check('fog: no enemy marker the side cannot see', enemy === 0 && kf > 0, `${kf} markers, ${enemy} enemy`);
}
console.log(`\n${n - fails} / ${n} passed`);
process.exit(fails ? 1 : 0);
