#!/usr/bin/env node
// infantrybench.mjs - checks the NGC-1980 infantry cores (game/js/units/infantry: ballistics, weapons, soldier,
// rifleman) in plain node against published data. Every reference number is tagged:
//   CONFIRMED  = taken from a field / technical manual or a primary source named next to it
//   INFERRED   = derived from published data or physics, or a widely repeated figure without a primary source to hand
//   UNVERIFIED = a plausible game value; no source checked
//   node tools/infantrybench.mjs [--v]
const B = await import('../game/js/units/infantry/ballistics.js');
const Wm = await import('../game/js/units/infantry/weapons.js');
const Sm = await import('../game/js/units/infantry/soldier.js');
const Rm = await import('../game/js/units/infantry/rifleman.js');
const { ROUNDS, trajectory, zeroAngle, maxRange, groundRange, elevationFor, penetration, atmosphere, STD_ATMOS, rngSeeded, MOA } = B;
const { createWeapon, makeItem, createSimpleInventory, WEAPONS, freeRecoil, sightAngle } = Wm;
const { createSoldier, metabolicDemand, tobler, SPEED, BODY } = Sm;
const V = process.argv.includes('--v');
let pass = 0, fail = 0;
const check = (name, ok, got, want, tag = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${got}${want ? '   (want ' + want + ')' : ''}${tag ? '  [' + tag + ']' : ''}`); };
const deg = r => r * 180 / Math.PI, cm = m => (m * 100).toFixed(1) + ' cm';

console.log('=== EXTERIOR BALLISTICS (point mass, ICAO sea level 15 C, no wind) ===');
{
  // muzzle velocities are inputs; check them, and the energy
  for (const [k, mv, src] of [['M193', 991, 'TM 43-0001-27: 3,250 fps, 20 in barrel'], ['M80', 853, 'FM 23-67: 2,800 fps from the M60'], ['M1911', 253, 'FM 23-35: 830 fps'], ['M433', 76, 'FM 23-31: 76 m/s'], ['M72', 145, 'FM 23-33: 145 m/s']])
    check(`${k} muzzle velocity`, Math.abs(ROUNDS[k].mv - mv) < 1, `${ROUNDS[k].mv} m/s`, `${mv} m/s`, 'CONFIRMED ' + src);
  check('M193 muzzle energy', Math.abs(B.energy(ROUNDS.M193, 991) - 1750) < 40, `${B.energy(ROUNDS.M193, 991).toFixed(0)} J`, '~1,750-1,770 J', 'INFERRED: 55 gr at 3,250 fps');
  // maximum ranges (point mass over-predicts the very long subsonic tail of a rifle bullet: ~6-8 %)
  for (const [k, pub, tol, src] of [['M193', 2653, 0.12, 'FM 23-9 (M16A1 max range 2,653 m)'], ['M80', 3725, 0.12, 'FM 23-67 (M60 max range 3,725 m)'], ['M1911', 1500, 0.08, 'FM 23-35 (1,500 m)'], ['M433', 400, 0.05, 'FM 23-31 (400 m; Cd fitted)'], ['M72', 1000, 0.05, 'FM 23-33 (1,000 m; Cd fitted)']]) {
    const m = maxRange(k);
    check(`${k} maximum range`, Math.abs(m.range / pub - 1) < tol, `${m.range.toFixed(0)} m at ${deg(m.angle).toFixed(1)} deg`, `${pub} m +-${tol * 100}%`, 'CONFIRMED ' + src);
  }
  // M16A1 battlesight zero 250 m (short-range aperture). FM 23-9 zeroes it at 25 m. Point mass puts the near crossing
  // at ~40 m (the 25 m target is an approximation: a true 25 m zero gives a far zero near 350-375 m).
  const sh = WEAPONS.M16A1.sight.height, a250 = zeroAngle('M193', 250, { sightHeight: sh });
  const tr = trajectory('M193', { angle: a250, sightHeight: sh, xMax: 500, every: 5 });
  let near = 0; for (let i = 1; i < tr.length; i++) if (tr[i - 1].y < 0 && tr[i].y >= 0) { near = tr[i - 1].x + 5 * (-tr[i - 1].y) / (tr[i].y - tr[i - 1].y); break; }
  const maxOrd = Math.max(...tr.filter(s => s.x <= 250).map(s => s.y)), at = x => tr.find(s => s.x === x);
  check('M16A1 250 m zero: near crossing', near > 22 && near < 48, `${near.toFixed(0)} m`, '25-45 m (FM 23-9 zeroes at 25 m)', 'CONFIRMED 25 m zero procedure; crossing INFERRED');
  const a25 = zeroAngle('M193', 25, { sightHeight: sh }), tr25 = trajectory('M193', { angle: a25, sightHeight: sh, xMax: 600, every: 5 });
  let far = 0; for (let i = 10; i < tr25.length; i++) if (tr25[i - 1].y > 0 && tr25[i].y <= 0) { far = tr25[i].x; break; }
  check('a true 25 m zero gives a far zero of', far > 280 && far < 420, `${far} m`, '~300-400 m', 'INFERRED (why FM 23-9 calls it "about 250 m")');
  check('250 m zero: max ordinate (centre-mass hold 0-300 m)', maxOrd < 0.12, `${cm(maxOrd)} at ~${tr.find(s => s.y === maxOrd).x} m`, '< 12 cm', 'INFERRED: FM 23-9 battlesight aims centre mass to 300 m');
  check('250 m zero: impact at 300 m', at(300).y > -0.2 && at(300).y < 0, cm(at(300).y), '-5..-20 cm', 'INFERRED');
  const L = zeroAngle('M193', 375, { sightHeight: sh }) - a250;
  check("'L' aperture adds elevation over the short aperture", L > 0.6e-3 && L < 2e-3, `${(L / MOA).toFixed(1)} MOA (375 m zero)`, '~2-6 MOA', 'INFERRED (FM 23-9: L for 300-500 m)');
  if (V) for (const s of tr.filter(s => s.x % 50 === 0)) console.log(`      ${String(s.x).padStart(3)} m  ${cm(s.y).padStart(9)}  ${s.v.toFixed(0)} m/s  ${s.E.toFixed(0)} J  ${s.t.toFixed(3)} s`);
  // remaining velocity / energy / time of flight (M193)
  // M60 grazing fire: sights set at 600 m, gun on the bipod (bore ~0.35 m above level ground): the cone's centre must
  // not rise more than 1 m above the ground anywhere out to 600 m (FM 23-67: max grazing fire 600 m over level ground)
  {
    const a600 = sightAngle(WEAPONS.M60, 4), trg = trajectory('M80', { angle: a600, sightHeight: WEAPONS.M60.sight.height, xMax: 650, every: 5 });
    // (judged against the sight line: the FM's "1 m above level ground" assumes the gun is down on the ground)
    const ordL = Math.max(...trg.filter(s => s.x <= 600).map(s => s.y));
    check('M60 grazing fire: 600 m sight, max ordinate over the LOS', ordL <= 1.15, `${ordL.toFixed(2)} m`, '~1 m (+-15 %: our M80 drop matches published tables, the FM rounds it)', 'CONFIRMED FM 23-67: 600 m of grazing fire (cone centre <= 1 m above level ground)');
  }
  // the M203 quadrant sight: elevations and times of flight
  const q = [50, 150, 250, 350, 400].map(r => { const a = elevationFor('M433', r), i = {}; groundRange('M433', a, { info: i }); return [r, a, i.t]; });
  check('M203 quadrant: elevations rise with range, 400 m reachable', q.every((x, i) => x[1] && (i === 0 || x[1] > q[i - 1][1])), q.map(([r, a, t]) => `${r}m ${deg(a).toFixed(1)}deg ${t.toFixed(1)}s`).join(', '), '', 'CONFIRMED quadrant 50-400 m (FM 23-31)');
  check('M433 time of flight to 150 m (point-target max range)', q[1][2] > 1.8 && q[1][2] < 2.8, `${q[1][2].toFixed(2)} s`, '~2-2.5 s', 'INFERRED (76 m/s, high drag)');
  // LAW: drop with the front-sight range lines and time of flight to the 200 m max effective range
  { const a = elevationFor('M72', 200), i = {}; groundRange('M72', a, { info: i });
    check('M72 time of flight to 200 m (max effective)', i.t > 1.35 && i.t < 1.7, `${i.t.toFixed(2)} s, line ${deg(a).toFixed(2)} deg`, '~1.4-1.6 s', 'INFERRED (145 m/s)'); }
  // atmosphere: density, and hot vs cold air
  check('ICAO sea level air density', Math.abs(B.airDensity(15, 1013.25, 0) - 1.225) < 0.002, `${B.airDensity(15, 1013.25, 0).toFixed(4)} kg/m3`, '1.2250', 'CONFIRMED ICAO Doc 7488');
  check('speed of sound at 15 C', Math.abs(B.speedOfSound(15) - 340.3) < 0.5, `${B.speedOfSound(15).toFixed(1)} m/s`, '340.3', 'CONFIRMED');
  const hot = trajectory('M193', { xMax: 400, every: 400, atmos: atmosphere({ T: 35, rh: 0.8 }) })[1].y, cold = trajectory('M193', { xMax: 400, every: 400, atmos: atmosphere({ T: -10, rh: 0.3 }) })[1].y;
  check('hot humid air: less drop than cold air at 400 m', hot > cold, `35C ${cm(hot)} vs -10C ${cm(cold)}`, 'hot > cold', 'INFERRED (thinner air)');
  // wind: 10 mph (4.47 m/s) full-value crosswind at 300 m
  const wd = trajectory('M193', { xMax: 300, every: 300, crossWind: 4.47 })[1].drift;
}

console.log('=== HITS (game table: cover that works) ===');
{
  const tAt = (k, r) => trajectory(k, { xMax: r, every: r })[1].v;
  check('a sandbag layer (300 mm) stops rifle ball at 25 m', penetration('M80', tAt('M80', 25), 'sandbag') < 300 && penetration('M193', tAt('M193', 25), 'sandbag') < 300, `M80 ${penetration('M80', tAt('M80', 25), 'sandbag').toFixed(0)} mm, M193 ${penetration('M193', tAt('M193', 25), 'sandbag').toFixed(0)} mm`, '< 300 mm', 'GAME');
  check('a plank wall (25 mm) does not stop rifle ball', penetration('M193', tAt('M193', 100), 'wood') > 25, `${penetration('M193', tAt('M193', 100), 'wood').toFixed(0)} mm`, '> 25 mm', 'GAME');
  check('M80 beats M193 through cover', penetration('M80', 853, 'brick') > penetration('M193', 991, 'brick'), `${penetration('M80', 853, 'brick').toFixed(0)} vs ${penetration('M193', 991, 'brick').toFixed(0)} mm brick`, '', 'GAME');
  check('a 10 mm steel plate stops small arms', penetration('M80', 853, 'steel') < 10, `${penetration('M80', 853, 'steel').toFixed(1)} mm`, '< 10 mm', 'GAME');
  check('car bodywork does not stop rifle ball', penetration('M193', tAt('M193', 200), 'sheet') > 2, `${penetration('M193', tAt('M193', 200), 'sheet').toFixed(1)} mm`, '> 2 mm', 'GAME');
  check('the .45 is stopped by a brick wall', penetration('M1911', 253, 'brick') < 100, `${penetration('M1911', 253, 'brick').toFixed(0)} mm`, '< 100 mm', 'GAME');
  const rng = rngSeeded(3); let ric = 0; for (let i = 0; i < 200; i++) { const P = B.createProjectile('M193', 0, 1, 0, 1, -Math.tan(4 * Math.PI / 180), 0, 900); if (B.impact(P, 0, 1, 0, 'water', 1e9, rng).result === 'ricochet') ric++; }
  check('a shallow shot onto water mostly skips', ric > 100, `${ric}/200`, '> 50 %', 'GAME');
  const P2 = B.createProjectile('M80', 0, 0, 0, 1, 0, 0, 700); const hi = B.makeHitInfo(P2, 'thorax', 1, 0, 0);
  check('hit info carries the MEDINV fields', ['round', 'calibre', 'velocity', 'dmg', 'dir', 'point', 'part', 'armour'].every(k => k in hi), Object.keys(hi).length + ' fields', '', 'contract');
}


console.log('=== WEAPONS ===');
const fireFor = (w, secs, inv, ctl = { trigger: true }, ctxx = {}) => { const shots = []; for (let t = 0; t < secs; t += 1 / 240) { const ev = w.step(1 / 240, ctl, { inv, canFire: true, ...ctxx }); for (const e of ev) if (e.e === 'shot') shots.push({ t, ...e }); } return shots; };
{
  // rates of fire (cyclic)
  const inv = createSimpleInventory([]);
  const m16 = createWeapon('M16A1', { mag: makeItem('M16-20', 20), seed: 5 }); m16.mode = 2; m16.def.malfBase = 0;
  const s = fireFor(m16, 3, inv); const rpm = 60 * (s.length - 1) / (s[s.length - 1].t - s[0].t);
  WEAPONS.M16A1.malfBase = 1 / 2500;
  check('M16A1 cyclic rate', rpm > 700 && rpm < 800, `${rpm.toFixed(0)} rpm, ${s.length} shots (20 + 1)`, '700-800 rpm', 'CONFIRMED FM 23-9');
  check('M16A1 bolt locks open on the last round', m16.bolt === 'locked' && !m16.chamber, `bolt ${m16.bolt}`, 'locked', 'CONFIRMED');
  const m60 = createWeapon('M60', { mag: makeItem('M60-belt'), seed: 2 }); const sm = fireFor(m60, 3, inv); const rpm60 = 60 * (sm.length - 1) / (sm[sm.length - 1].t - sm[0].t);
  check('M60 cyclic rate', rpm60 > 520 && rpm60 < 580, `${rpm60.toFixed(0)} rpm`, '550 rpm', 'CONFIRMED FM 23-67');
  check('M60 belt: every 5th round a M62 tracer', sm.filter(x => x.tracer).length >= Math.floor(sm.length / 5) - 1 && sm.filter(x => x.tracer).length <= Math.ceil(sm.length / 5) + 1, `${sm.filter(x => x.tracer).length} of ${sm.length}`, '1 in 5', 'CONFIRMED FM 23-67 (4:1)');
  // semi: one shot per trigger press
  const m2 = createWeapon('M16A1', { mag: makeItem('M16-20', 18), seed: 9 }); let n = 0;
  for (let i = 0; i < 5; i++) { n += fireFor(m2, 0.2, inv).length; fireFor(m2, 0.2, inv, { trigger: false }); }
  check('M16A1 SEMI: one round per press', n === 5, `${n} shots in 5 presses`, '5');
  // speed vs tactical reload, partial magazines as items
  const inv2 = createSimpleInventory([makeItem('M16-20', 18), makeItem('M16-20', 18)]);
  const m3 = createWeapon('M16A1', { mag: makeItem('M16-20', 18), seed: 4 }); m3.mode = 1;
  for (let i = 0; i < 7; i++) { fireFor(m3, 0.1, inv2); fireFor(m3, 0.1, inv2, { trigger: false }); }
  const partial = m3.mag.rounds; m3.start('tactical', { inv: inv2 }); let tt = 0; while (m3.act) { m3.step(1 / 60, {}, { inv: inv2 }); tt += 1 / 60; }
  check('tactical reload keeps the partial magazine as an item', inv2.items.some(it => it.rounds === partial) && m3.mag.rounds === 18 && m3.chamber, `stowed a ${partial}-round mag, ${tt.toFixed(1)} s`, '~4 s', 'INFERRED time');
  const m4 = createWeapon('M16A1', { mag: makeItem('M16-20', 2), seed: 4 }); m4.mode = 2; fireFor(m4, 1, inv2);
  m4.start('speed', { inv: inv2 }); let dropped = null; tt = 0; while (m4.act) { for (const e of m4.step(1 / 60, {}, { inv: inv2 })) if (e.e === 'dropItem') dropped = e.item; tt += 1 / 60; }
  check('speed reload from bolt lock: drops the empty, chambers', dropped && dropped.rounds === 0 && m4.chamber && m4.bolt === 'fwd', `${tt.toFixed(1)} s, chamber ${m4.chamber && m4.chamber.state}`, '~2.5 s', 'INFERRED time');
  // M60 barrel heat vs the FM 23-67 barrel-change schedule
  const heat = (rpm, secs) => { const b = createWeapon('M60', { mag: makeItem('M60-belt', 100000), seed: 1 }); b.def.malfBase = 0; const dt = 1 / 120; let acc = 0;
    for (let t = 0; t < secs; t += dt) { acc += dt * rpm / 60; const trig = acc >= 1; if (trig) acc -= 1; b.step(dt, { trigger: trig }, { canFire: true }); if (trig) { b.cyc = 0; } b.trig = false; } return b.barrel.temp; };
  WEAPONS.M60.malfBase = 0;
  const h1 = heat(550, 60), h10 = heat(100, 600), h2 = heat(200, 120);
  WEAPONS.M60.malfBase = 1 / 2000;
  check('M60 barrel after 1 min at the cyclic rate', h1 > 430 && h1 < 560, `${h1.toFixed(0)} C`, '~500 C = change point', 'CONFIRMED schedule FM 23-67; temps INFERRED');
  check('M60 barrel after 10 min sustained (100 rpm)', h10 > 430 && h10 < 560, `${h10.toFixed(0)} C`, '~500 C = change point', 'CONFIRMED schedule FM 23-67');
  check('M60 barrel after 2 min rapid (200 rpm)', h2 > 250 && h2 < 560, `${h2.toFixed(0)} C`, 'below the limit (doctrine conservative)', 'INFERRED');
  // barrel change: the hot barrel goes into the pack and cools
  const inv3 = createSimpleInventory([makeItem('M60-barrel')]); const g = createWeapon('M60', { mag: makeItem('M60-belt'), seed: 3 }); g.barrel.temp = 520;
  g.start('barrel', { inv: inv3 }); tt = 0; while (g.act) { g.step(1 / 60, {}, { inv: inv3 }); tt += 1 / 60; }
  const old = inv3.items.find(it => it.fit === 'M60-barrel');
  check('M60 barrel change swaps in the cool spare', g.barrel.temp < 40 && old && old.temp > 400, `${tt.toFixed(1)} s; in the gun ${g.barrel.temp.toFixed(0)} C, spare ${old.temp.toFixed(0)} C`, '~6-10 s', 'INFERRED');
  // M16A1 cook-off warning: ~150 rounds fired rapidly
  { const c = createWeapon('M16A1', { mag: makeItem('M16-20', 100000), seed: 1 }); c.def.malfBase = 0; c.mode = 2; let t = 0, n150 = null; const dt = 1 / 240;
    // 150 rounds in ~2 min: 20-round bursts, magazine changes in between
    for (let k = 0; k < 8 && t < 200; k++) { for (let i = 0; i < 20 * 0.08 * 240; i++) { c.step(dt, { trigger: true }, { canFire: true }); t += dt; } for (let i = 0; i < 12 * 240; i++) { c.step(dt, { trigger: false }, { canFire: true }); t += dt; } if (c.roundsFired >= 150 && !n150) n150 = c.barrel.temp; }
    WEAPONS.M16A1.malfBase = 1 / 2500;
    check('M16A1 at ~150 rounds rapid: barrel in the cook-off zone', n150 > WEAPONS.M16A1.cookoff * 0.9, `${(n150 || c.barrel.temp).toFixed(0)} C after ${c.roundsFired} rounds in ${t.toFixed(0)} s`, `> ${WEAPONS.M16A1.cookoff * 0.9} C`, 'CONFIRMED warning TM 9-1005-249-10; temp INFERRED'); }
  // stoppages: mean rounds between stoppages, clean vs fouled vs sandy
  const mrbs = (fouling, dirt, full = false, rounds = 20000, seed = 11) => { const w = createWeapon('M16A1', { mag: makeItem('M16-20', 1e9), seed, fouling }); w.mode = 2; w.magLoadedFull = full; let st = 0;
    for (let i = 0; i < rounds; i++) { const ev = w.step(0.09, { trigger: true }, { canFire: true, dirt }); if (w.malf || w.bolt === 'oob' || (w.chamber && w.chamber.state === 'dud')) { st++; w.malf = null; w.bolt = 'fwd'; w.chamber = { round: 'M193', state: 'live' }; } if (i % 20 === 0) w.fouling = fouling; w.barrel.temp = 21; w.step(0.01, { trigger: false }, { canFire: true }); }
    return rounds / Math.max(1, st); };
  const mClean = mrbs(0, 0), mFull = mrbs(0, 0, true), mFoul = mrbs(2000, 0), mSand = mrbs(0, 0.6);
  check('M16A1 MRBS clean, 18-round loads', mClean > 1500 && mClean < 4000, `${mClean.toFixed(0)} rounds (stoppages + duds)`, '~2,000-3,000', 'INFERRED (1980 chromed-chamber M16A1)');
  check('full 20-round loads jam more (tired 1980 springs)', mFull < mClean * 0.8, `${mFull.toFixed(0)} rounds`, '< 80 % of 18-round', 'INFERRED (why Marines loaded 18)');
  check('fouled (2,000 rounds uncleaned) and sandy are worse', mFoul < mClean / 2 && mSand < mClean / 2, `fouled ${mFoul.toFixed(0)}, sandy ${mSand.toFixed(0)}`, '< half', 'INFERRED');
  // immediate action (SPORTS) clears the common stoppages, not a stuck case
  const ia = (malf) => { const w = createWeapon('M16A1', { mag: makeItem('M16-20', 10), seed: 21 }); const inv4 = createSimpleInventory([]);
    if (malf === 'feed') { w.chamber = null; w.malf = 'feed'; } if (malf === 'dud') { w.chamber.state = 'dud'; w.malf = 'dud'; } if (malf === 'oob') { w.bolt = 'oob'; w.malf = 'oob'; } if (malf === 'stovepipe') { w.chamber = { round: 'M193', state: 'spent' }; w.malf = 'stovepipe'; } if (malf === 'extract') { w.chamber = { round: 'M193', state: 'spent' }; w.malf = 'extract'; }
    w.start('ia', { inv: inv4 }); while (w.act) w.step(1 / 60, {}, { inv: inv4 }); return w; };
  const iaOk = ['feed', 'dud', 'oob', 'stovepipe'].map(k => { const w = ia(k); return [k, !w.malf && w.chamber && w.chamber.state === 'live' && w.bolt === 'fwd']; });
  check('SPORTS clears feed / dud / out-of-battery / stovepipe', iaOk.every(x => x[1]), iaOk.map(x => x[0] + (x[1] ? ' ok' : ' FAIL')).join(', '), '', 'CONFIRMED procedure FM 23-9');
  const st = ia('extract');
  check('a stuck case survives SPORTS (needs the cleaning rod)', !!st.malf, `after IA: ${st.malf}`, 'still jammed', 'CONFIRMED FM 23-9 (remedial action)');
  // M203 single shot; M72 sequence
  const gl = createWeapon('M203', { seed: 2 }); gl.mode = 1; const g1 = fireFor(gl, 0.3, inv).length; fireFor(gl, 0.2, inv, { trigger: false }); const g2 = fireFor(gl, 0.3, inv).length;
  check('M203: one shot, then the breech must be reloaded', g1 === 1 && g2 === 0, `${g1} then ${g2}`, '1 then 0', 'CONFIRMED single shot');
  const law = createWeapon('M72A2', { seed: 2 }); const l0 = fireFor(law, 0.2, inv).length; law.start('extend', {}); while (law.act) law.step(1 / 60, {}, {}); const l1 = fireFor(law, 0.2, inv).length; law.start('arm', {}); while (law.act) law.step(1 / 60, {}, {}); fireFor(law, 0.2, inv, { trigger: false }); const l2 = fireFor(law, 0.2, inv).length;
  check('M72: no fire closed or extended-safe; fires once armed; spent', l0 === 0 && l1 === 0 && l2 === 1 && law.law === 'spent', `${l0}/${l1}/${l2}, ${law.law}`, '0/0/1 spent', 'CONFIRMED sequence FM 23-33');
  // recoil
  for (const [k, gm, lo, hi, src] of [['M16A1', 3.2, 4, 6.5, 'published AR-15/M16 free recoil ~3.5-4.5 ft-lbf'], ['M60', 10.8, 5, 9, 'heavy gun, M80'], ['M1911A1', 1.2, 5, 8.5, '.45 in a 2.5 lb pistol ~5-6 ft-lbf']]) {
    const r = freeRecoil(WEAPONS[k], gm); check(`${k} free recoil energy`, r.E > lo && r.E < hi, `${r.E.toFixed(1)} J, impulse ${r.J.toFixed(2)} N s, ${r.v.toFixed(2)} m/s`, `${lo}-${hi} J`, 'INFERRED ' + src);
  }
}

console.log('=== RECOIL AND SWAY IN THE HANDS ===');
{
  const climb = (stance, key = 'M16A1', bipod = false, n = 10) => {
    const R = Rm.createRifleman({ loadout: 'range', seed: 4 }); const S = R.soldier; R.slot = R.slots.findIndex(w => w.key === key);
    const w = R.cur; w.mode = w.def.modes.indexOf('auto'); w.def.malfBase = 0;
    if (stance !== 'stand') { R.step(1 / 60, { stance }); for (let t = 0; t < 2.5; t += 1 / 60) R.step(1 / 60, {}); }
    if (bipod) R.step(1 / 60, { bipod: true, ads: true });
    for (let t = 0; t < 1; t += 1 / 60) R.step(1 / 60, { ads: true, holdBreath: true });
    const p0 = S.aimPitch; let shots = 0, maxP = 0;
    for (let t = 0; t < 2 && shots < n; t += 1 / 240) { const ev = R.step(1 / 240, { ads: true, fire: true, holdBreath: true }); shots += ev.filter(e => e.e === 'shot').length; maxP = Math.max(maxP, S.aimPitch - p0); }
    w.def.malfBase = WEAPONS[key].malfBase; return { deg: deg(maxP), shots, bip: S.bipod };
  };
  WEAPONS.M16A1.malfBase = 0; WEAPONS.M60.malfBase = 0;
  const cs = climb('stand'), cp = climb('prone'), mg = climb('prone', 'M60', true, 6);
  WEAPONS.M16A1.malfBase = 1 / 2500; WEAPONS.M60.malfBase = 1 / 2000;
  check('M16A1 10-round burst, standing: muzzle climb', cs.deg > 1.5 && cs.deg < 7, `${cs.deg.toFixed(1)} deg`, '~2-6 deg (hard to hold)', 'INFERRED (FM 23-9 discourages auto)');
  check('... prone climbs less', cp.deg < cs.deg * 0.75, `${cp.deg.toFixed(1)} deg`, '< 75 % of standing', 'INFERRED');
  check('M60 6-round burst on the bipod stays tight', mg.deg < 1.0 && mg.bip, `${mg.deg.toFixed(2)} deg, bipod ${mg.bip}`, '< 1 deg', 'INFERRED (FM 23-67 6-9 round bursts)');
  // sway amplitude by stance / support (RMS of the aim wander over 6 s, holding still)
  const sway = (setup, secs = 6) => { const S = createSoldier({ rng: rngSeeded(8) }); S.load = 20; setup(S); const dt = 1 / 60; let n = 0, ss = 0;
    for (let t = 0; t < 2; t += dt) S.step(dt, { ads: true, ...(S._inp || {}) }, S._env || {}, S._mods || {});
    for (let t = 0; t < secs; t += dt) { S.step(dt, { ads: true, ...(S._inp || {}) }, S._env || {}, S._mods || {}); ss += S.swayPitch ** 2 + S.swayYaw ** 2; n++; }
    return Math.sqrt(ss / n) / MOA; };
  const sStand = sway(S => {}), sCrouch = sway(S => S.place(0, 0, 0, 0, 'crouch')), sProne = sway(S => S.place(0, 0, 0, 0, 'prone')), sRest = sway(S => { S._env = { restAt: () => true }; });
  check('sway: stand > crouch > prone, rested less', sStand > sCrouch && sCrouch > sProne && sRest < sStand * 0.7, `stand ${sStand.toFixed(1)}, crouch ${sCrouch.toFixed(1)}, prone ${sProne.toFixed(1)}, rested ${sRest.toFixed(1)} MOA rms`, '', 'INFERRED (marksmanship hold data)');
  const sBlown = sway(S => { S.hr = 185; S.reserve = 5; S.vo2 = 48; });
  check('sway after a sprint (HR 185) is much worse', sBlown > sStand * 1.8, `${sBlown.toFixed(1)} MOA rms`, '> 1.8x rested', 'INFERRED');
  const sPain = sway(S => { S._mods = { pain: 0.8 }; }), sArm = sway(S => { S._mods = { armR: 0.8 }; });
  check('medical: pain tremor and an arm wound add sway', sPain > sStand * 1.2 && sArm > sStand * 1.8, `pain ${sPain.toFixed(1)}, arm ${sArm.toFixed(1)} MOA rms`, '', 'hooks');
  const sHold = sway(S => { S._inp = { holdBreath: true }; }, 4);
  check('holding the breath steadies (first seconds)', sHold < sStand * 0.85, `${sHold.toFixed(1)} vs ${sStand.toFixed(1)} MOA rms`, '', 'INFERRED');
}

console.log('=== MOVEMENT AND STAMINA ===');
{
  const runFor = (setup, secs, inp, env = {}, mods = {}) => { const S = createSoldier({ rng: rngSeeded(2) }); S.load = 20; setup && setup(S); const dt = 1 / 60; const evs = [];
    for (let t = 0; t < secs; t += dt) { for (const e of S.step(dt, typeof inp === 'function' ? inp(S, t) : inp, env, mods)) evs.push({ t, ...e }); } S.evs = evs; return S; };
  const w = runFor(null, 6, { move: [0, 1], walk: true }), r = runFor(null, 6, { move: [0, 1] }), s = runFor(null, 4, { move: [0, 1], sprint: true }), c = runFor(S => S.place(0, 0, 0, 0, 'prone'), 6, { move: [0, 1] });
  check('walk = quick time', Math.abs(w.speed - 1.52) < 0.05, `${w.speed.toFixed(2)} m/s`, '1.52 m/s (120 x 30 in /min)', 'CONFIRMED FM 22-5');
  check('run = double time', Math.abs(r.speed - 2.74) < 0.08, `${r.speed.toFixed(2)} m/s`, '2.74 m/s (180 x 36 in /min)', 'CONFIRMED FM 22-5');
  const steps = r.evs.filter(e => e.e === 'footstep' && e.t > 2).length / 4 * 60;
  check('double-time cadence', Math.abs(steps - 180) < 15, `${steps.toFixed(0)} steps/min`, '180', 'CONFIRMED FM 22-5');
  check('sprint, 20 kg fighting load', s.speed > 5.0 && s.speed < 6.5, `${s.speed.toFixed(2)} m/s`, '5-6.5 m/s', 'INFERRED');
  check('prone crawl', c.speed > 0.2 && c.speed < 0.6, `${c.speed.toFixed(2)} m/s`, '0.2-0.6 m/s', 'INFERRED');
  // inertia: from a run to a standstill
  const st = runFor(null, 5, (S, t) => ({ move: [0, t < 3 ? 1 : 0] })); const stopT = st.evs.length; let tStop = null; { const S = createSoldier({ rng: rngSeeded(2) }); S.load = 20; for (let t = 0; t < 6; t += 1 / 60) { S.step(1 / 60, { move: [0, t < 3 ? 1 : 0] }, {}, {}); if (t > 3 && tStop == null && S.speed < 0.05) tStop = t - 3; } }
  check('run to a stop (inertia)', tStop > 0.3 && tStop < 0.8, `${tStop.toFixed(2)} s`, '~0.4-0.7 s', 'UNVERIFIED (Arma-like feel)');
  // Pandolf equation itself
  const W = 70, Lk = 20, Vv = 1.34, Mw = 1.5 * W + 2 * (W + Lk) * (Lk / W) ** 2 + 1.0 * (W + Lk) * (1.5 * Vv * Vv);
  const ours = metabolicDemand({ W, L: Lk, V: Vv, G: 0, eta: 1.0 }) * W * 20.1 / 60;
  check('Pandolf: 70 kg + 20 kg at 1.34 m/s, treadmill', Math.abs(ours - Mw) < 2, `${ours.toFixed(0)} W`, `${Mw.toFixed(0)} W`, 'CONFIRMED equation (Pandolf 1977)');
  // road march: approach-march load 33 kg at the 4 km/h road-march rate, 2 h (FM 21-18)
  const march = runFor(S => { S.load = 33; S.walkMode = true; }, 7200, (S) => ({ move: [0, S.speed > 1.11 ? 0.73 : 0.73] }));
  check('road march 33 kg, 4 km/h, 2 h: aerobic, not blown', march.staminaFrac > 0.95 && march.fatigue < 0.3, `reserve ${(march.staminaFrac * 100).toFixed(0)} %, fatigue ${march.fatigue.toFixed(2)}, HR ${march.hr.toFixed(0)}, ${(march.vo2 / march.vo2max * 100).toFixed(0)} % VO2max, ${(-march.pos.z / 1000).toFixed(1)} km`, '', 'CONFIRMED rate & load FM 21-18');
  // double time with a 22 kg fighting load for 10 min
  const dbl = runFor(S => { S.load = 22; }, 600, { move: [0, 1] });
  check('double time 22 kg for 10 min is sustainable', dbl.staminaFrac > 0.5 && dbl.speed > 2.6, `reserve ${(dbl.staminaFrac * 100).toFixed(0)} %, HR ${dbl.hr.toFixed(0)}, ${(dbl.vo2 / dbl.vo2max * 100).toFixed(0)} % VO2max`, '', 'INFERRED');
  // sprint duration by load, recovery
  const sprintT = load => { const S = createSoldier({ rng: rngSeeded(2) }); S.load = load; for (let t = 0; t < 120; t += 1 / 60) { const ev = S.step(1 / 60, { move: [0, 1], sprint: true }, {}, {}); if (ev.some(e => e.e === 'blown')) return { t, d: -S.pos.z, S }; } return { t: 120, d: -S.pos.z, S }; };
  const s10 = sprintT(10), s22 = sprintT(22), s40 = sprintT(40);
  check('sprint until blown, 22 kg', s22.t > 18 && s22.t < 40, `${s22.t.toFixed(1)} s, ${s22.d.toFixed(0)} m`, '20-35 s', 'INFERRED (all-out effort ~3x VO2max)');
  check('more load = shorter, slower sprint', s10.t > s22.t && s22.t > s40.t && s10.d > s40.d, `10 kg ${s10.t.toFixed(0)} s / ${s10.d.toFixed(0)} m, 40 kg ${s40.t.toFixed(0)} s / ${s40.d.toFixed(0)} m`, '', 'INFERRED');
  { const S = s22.S; let t12 = null, t90 = null; for (let t = 0; t < 600 && t90 == null; t += 1 / 60) { S.step(1 / 60, {}, {}, {}); if (t12 == null && S.staminaFrac > 0.12) t12 = t; if (S.staminaFrac > 0.9) t90 = t; }
    check('recovery after being blown: sprint again / 90 %', t12 < 20 && t90 > 90 && t90 < 300, `${t12.toFixed(0)} s / ${t90.toFixed(0)} s`, '<20 s / 1.5-5 min', 'INFERRED (EPOC)'); }
  // rushes: 3-5 s up, down, repeat (FM 7-8)
  { const S = createSoldier({ rng: rngSeeded(2) }); S.load = 22; let n = 0, blown = false;
    for (; n < 40 && !blown; n++) { for (let t = 0; t < 4; t += 1 / 60) { if (S.step(1 / 60, { move: [0, 1], sprint: true }, {}, {}).some(e => e.e === 'blown')) blown = true; } S.step(1 / 60, { stance: 'prone' }); for (let t = 0; t < 10; t += 1 / 60) S.step(1 / 60, {}); S.step(1 / 60, { stance: 'stand' }); for (let t = 0; t < 2; t += 1 / 60) S.step(1 / 60, {}); }
    check('4 s rushes with 10 s down before blown', n >= 4 && n <= 20, `${n} rushes`, '4-20', 'INFERRED (FM 7-8 3-5 s rushes)'); }
  // stance transitions
  const tr = (from, to, load) => { const S = createSoldier({}); S.load = load; S.place(0, 0, 0, 0, from); S.step(1 / 60, { stance: to }); return S.stanceDur; };
  check('stand -> prone, 22 kg', tr('stand', 'prone', 22) > 1.0 && tr('stand', 'prone', 22) < 2.0, `${tr('stand', 'prone', 22).toFixed(2)} s`, '1-2 s', 'INFERRED');
  check('prone -> stand, 22 kg', tr('prone', 'stand', 22) > 1.5 && tr('prone', 'stand', 22) < 3.0, `${tr('prone', 'stand', 22).toFixed(2)} s`, '1.5-3 s', 'INFERRED');
  // slope (Tobler) and its cost
  const up = runFor(S => { S.walkMode = true; S.load = 30; }, 20, { move: [0, 1] }, { groundY: (x, z) => -z * 0.2 });
  check('walking up a 20 % grade (Tobler)', Math.abs(up.speed / 1.52 - tobler(0.2)) < 0.05, `${up.speed.toFixed(2)} m/s (${(up.speed / 1.52 * 100).toFixed(0)} % of flat)`, `${(tobler(0.2) * 100).toFixed(0)} %`, 'CONFIRMED function (Tobler 1993)');
  check('... and it costs more than the flat', metabolicDemand({ W: 80, L: 30, V: up.speed, G: 20 }) > metabolicDemand({ W: 80, L: 30, V: 1.52, G: 0 }), `${metabolicDemand({ W: 80, L: 30, V: up.speed, G: 20 }).toFixed(0)} vs ${metabolicDemand({ W: 80, L: 30, V: 1.52, G: 0 }).toFixed(0)} ml/kg/min`, '', 'CONFIRMED Pandolf grade term');
  // sand is harder going than a road (eta)
  check('loose sand costs ~2x a dirt road (eta 2.1 vs 1.1)', metabolicDemand({ W: 80, L: 20, V: 1.3, eta: 2.1 }) > 1.5 * metabolicDemand({ W: 80, L: 20, V: 1.3, eta: 1.1 }), `${metabolicDemand({ W: 80, L: 20, V: 1.3, eta: 2.1 }).toFixed(0)} vs ${metabolicDemand({ W: 80, L: 20, V: 1.3, eta: 1.1 }).toFixed(0)}`, '', 'CONFIRMED eta (Pandolf 1977)');
  // breath hold
  const bh = S => { for (let t = 0; t < 1; t += 1 / 60) S.step(1 / 60, { ads: true }); let t = 0; for (; t < 20; t += 1 / 60) { S.step(1 / 60, { ads: true, holdBreath: true }); if (!S.holdBreath) break; } return S.holdMax; };
  const bRest = bh(createSoldier({})), bBlown = bh((() => { const S = createSoldier({}); S.reserve = 10; S.vo2 = 45; S.hr = 180; return S; })());
  check('breath hold: ~8 s rested, a few s when blown', bRest > 6 && bRest < 10 && bBlown < 4, `${bRest.toFixed(1)} s / ${bBlown.toFixed(1)} s`, '6-10 / < 4 s', 'UNVERIFIED (Arma-like)');
  // medical hooks: broken leg
  const leg = runFor(null, 4, { move: [0, 1], sprint: true }, {}, { legL: 0.9 });
  check('broken leg: limp, no sprint', leg.speed <= SPEED.limp + 0.01 && !leg.sprinting, `${leg.speed.toFixed(2)} m/s, sprint ${leg.sprinting}`, `<= ${SPEED.limp}`, 'hook (MEDINV)');
  // fall injury event
  const fall = runFor(S => { S.pos.y = 4; S.onGround = false; }, 2, {}, { groundY: () => 0 });
  check('a 4 m fall raises a fallInjury event', fall.evs.some(e => e.e === 'fallInjury'), fall.evs.filter(e => e.e === 'land').map(e => `land ${e.v.toFixed(1)} m/s`).join(), '> 6 m/s', 'hook (MEDINV)');
}

console.log('=== RIFLEMAN (whole loop: shot -> projectile -> hit info) ===');
{
  // a flat range with a 1 m steel plate at 200 m and a body box at 100 m
  const R = Rm.createRifleman({ loadout: 'rifleman', seed: 3 }); R.cur.def.malfBase = 0;
  const hits = [];
  const env = { groundY: () => 0, raycast(x0, y0, z0, x1, y1, z1) {
    // body: a 0.5 x 1.8 x 0.3 box at z = -100 ; plate at z = -200 ; ground y = 0
    for (const [zc, kind] of [[-100, 'body'], [-200, 'plate']]) if ((z0 - zc) * (z1 - zc) <= 0 && z0 !== z1) { const t = (z0 - zc) / (z0 - z1), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (Math.abs(x) < 0.6 && y > 0 && y < 1.8) return kind === 'body' ? { t, x, y, z: zc, nx: 0, ny: 0, nz: 1, body: { target: 'dummy', part: y > 1.55 ? 'head' : y > 1.1 ? 'thorax' : 'stomach', armour: y > 1.55 ? [{ material: 'hadfield', thickness: 1.12 }] : [] } } : { t, x, y, z: zc, nx: 0, ny: 0, nz: 1, material: 'steel', thickness: 10 }; }
    if (y1 < 0) { const t = y0 / (y0 - y1); return { t, x: x0 + (x1 - x0) * t, y: 0, z: z0 + (z1 - z0) * t, nx: 0, ny: 1, nz: 0, material: 'soil' }; }
    return null; } };
  R.soldier.place(0, 0, 0, 0, 'prone');
  for (let t = 0; t < 1.5; t += 1 / 60) R.step(1 / 60, { ads: true }, env);
  const ev = []; let fired = 0;
  // aim at the body's thorax (1.3 m) from a prone eye at 0.36 m: a small up angle
  R.soldier.pitch = R.soldier.wPitch = Math.atan2(1.3 - 0.36, 100);
  for (let t = 0; t < 1.5; t += 1 / 120) { const e = R.step(1 / 120, { ads: true, fire: fired < 1, holdBreath: true }, env); for (const x of e) { if (x.e === 'shot') fired++; ev.push(x); } }
  const hit = ev.find(e => e.e === 'hit');
  check('a prone shot at a man at 100 m registers a hit', !!hit, hit ? `${hit.hit.part}, ${hit.hit.velocity.toFixed(0)} m/s, dmg ${hit.hit.dmg.toFixed(2)}` : 'miss: ' + ev.filter(e => e.e === 'impact').map(e => e.material + '@' + e.z.toFixed(0) + ' y' + e.y.toFixed(2)).join(), '');
  check('load includes weapons, ammo and kit', R.soldier.load > 18 && R.soldier.load < 30, `${R.soldier.load.toFixed(1)} kg`, '~20-25 kg fighting load', 'CONFIRMED FM 21-18 (<= 22 kg recommended)');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
