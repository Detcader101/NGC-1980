#!/usr/bin/env node
// medinvbench.mjs - checks the NGC-1980 medical and inventory models (game/js/units/infantry/) in plain node against
// published medical / kit data; the damage and armour side is GAME tuning (Tarkov-style) and is checked for feel only. Every check is tagged CONFIRMED (the target is a published figure), INFERRED (derived
// from published data / doctrine), UNVERIFIED (plausible, unchecked) or GAME (a gameplay tuning target).
//   node tools/medinvbench.mjs [--v]
import { createMedical, mulberry32, ZONES, MED, normaliseHit, penProbability, fragmentHits, BUDDY } from '../game/js/units/infantry/medical.js';
import { ITEMS, ROUNDS, approxVelocity } from '../game/js/units/infantry/items.js';
import * as I from '../game/js/units/infantry/inventory.js';

const V = process.argv.includes('--v');
let pass = 0, fail = 0; const fails = [];
const check = (name, ok, got, want, tag = 'INFERRED', src = '') => {
  (ok ? pass++ : (fail++, fails.push(name)));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${String(got).padEnd(26)} want ${want}   [${tag}${src ? ': ' + src : ''}]`);
};
const mmss = s => s == null ? '-' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const bleed = (M, region, zone, type, rate, ctl) => { const b = { id: M.nextId++, region, zone, type, rate, ctl, name: 'bench', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false }; M.bleeds.push(b); return b; };
function run(M, secs, dt = 0.5, ctx = {}, each) {
  const marks = {}; let t = 0;
  for (; t < secs; t += dt) {
    M.update(dt, ctx); const c = M.cls();
    if (!marks['c' + c]) marks['c' + c] = t;
    if (M.unconscious && marks.unc == null) marks.unc = t;
    if (each) each(M, t);
    if (M.dead) { marks.dead = t; break; }
  }
  marks.end = t; return marks;
}

// ================================================================================================= 1. blood loss
console.log('--- 1. haemorrhage timing (75 kg Marine, 5250 ml; untreated, lying still) ---');
{
  const M = createMedical(); check('blood volume 70 ml/kg', M.V0 === 5250, M.V0 + ' ml', '5250 ml', 'CONFIRMED', 'ATLS');
  const cases = [
    ['femoral artery (thigh)', 'legL', 'thigh', 'arterial', 500, 'tq', [120, 300], [180, 600], 'INFERRED', 'KRAGH/Eastridge: limb exsanguination in "3-5 minutes"'],
    ['carotid (neck)', 'head', 'neck', 'arterial', 800, 'junctional', [60, 200], [90, 300], 'INFERRED', 'carotid flow ~400-800 ml/min'],
    ['brachial artery (upper arm)', 'armL', 'upperArm', 'arterial', 250, 'tq', [240, 720], [400, 1500], 'INFERRED', 'brachial flow ~150-250 ml/min'],
  ];
  for (const [name, region, zone, type, rate, ctl, c3, dead, tag, src] of cases) {
    const M = createMedical(); bleed(M, region, zone, type, rate, ctl); const m = run(M, 3600);
    check(`${name}: time to class III`, m.c3 >= c3[0] && m.c3 <= c3[1], mmss(m.c3), `${mmss(c3[0])}-${mmss(c3[1])}`, tag, src);
    check(`${name}: unconscious before death`, m.unc != null && (m.dead == null || m.unc < m.dead), `unc ${mmss(m.unc)}`, '< death', 'CONFIRMED', 'ATLS class IV: lethargic -> unconscious');
    check(`${name}: death`, m.dead >= dead[0] && m.dead <= dead[1], mmss(m.dead) + ' ' + (M.cause || ''), `${mmss(dead[0])}-${mmss(dead[1])}`, tag, src);
  }
  { const M = createMedical(); bleed(M, 'legL', 'thigh', 'heavy', 120, 'tq'); const m = run(M, 7200);
    check('heavy venous bleed (120 ml/min): class III', m.c3 >= 600 && m.c3 <= 1800, mmss(m.c3), '10:00-30:00', 'INFERRED', 'large-vein bleeding slows as pressure falls');
    check('heavy venous bleed: not instantly lethal (> 20 min)', !m.dead || m.dead > 1200, m.dead ? mmss(m.dead) : 'survives 2 h at ' + M.vitals().lossPct + '%', '> 20:00', 'INFERRED'); }
  { const M = createMedical(); const b = bleed(M, 'armL', 'forearm', 'light', 15, 'tq'); const m = run(M, 1800);
    check('light venous ooze (15 ml/min): stays class I', !m.c2, `loss ${M.vitals().lossPct}%`, 'class I', 'INFERRED', 'bleeding time 2-9 min');
    check('light venous ooze: clots by itself within 25 min', b.stopped, b.stopped ? 'stopped' : 'still bleeding', 'stopped', 'INFERRED', 'Ivy bleeding time'); }
  { const M = createMedical(); bleed(M, 'thorax', 'chest', 'arterial', 700, 'internal'); const m = run(M, 3600);
    check('great-vessel chest bleed: dead in < 5 min (no field fix)', m.dead && m.dead < 300, mmss(m.dead), '< 5:00', 'INFERRED', 'non-compressible torso haemorrhage, the leading preventable-death cause (Eastridge 2012)'); }
}
console.log('--- 1b. ATLS vitals by class (table 3-1) ---');
{
  const bands = [[0.08, [60, 100], [110, 140], [14, 20]], [0.22, [100, 120], [105, 140], [20, 30]], [0.35, [120, 140], [70, 105], [30, 40]], [0.44, [140, 200], [40, 85], [35, 50]]];
  bands.forEach(([lf, hr, sbp, rr], i) => {
    const M = createMedical(); M.vol = M.V0 * (1 - lf); M.rbc = M.vol * 0.44; M.adrenaline = 0; const v = M.vitals();
    check(`class ${'I II III IV'.split(' ')[i]} (${lf * 100}% loss): HR ${hr[0]}-${hr[1]}`, v.hr >= hr[0] && v.hr <= hr[1], v.hr, hr.join('-'), 'CONFIRMED', 'ATLS');
    check(`class ${'I II III IV'.split(' ')[i]}: systolic ${sbp[0]}-${sbp[1]}`, v.sbp >= sbp[0] && v.sbp <= sbp[1], v.sbp, sbp.join('-'), 'INFERRED', 'ATLS normal/normal/decreased/greatly decreased');
    check(`class ${'I II III IV'.split(' ')[i]}: resp ${rr[0]}-${rr[1]}`, v.rr >= rr[0] && v.rr <= rr[1], v.rr, rr.join('-'), 'CONFIRMED', 'ATLS');
  });
}

// ================================================================================================ 2. tourniquets
console.log('--- 2. tourniquets ---');
const treat = (M, id, region, by = { self: true, skill: 'rifleman' }) => { const it = I.newItem(id); const o = M.startTreatment({ item: it, region, by }); return { o, it }; };
{
  // femoral bleed, self-aid starts at 0:15; survival over 30 min across 300 seeded casualties (each application rolls
  // success per WALTERS / KRAGH field effectiveness).
  const surv = (steps, N = 300) => { let alive = 0, lost = 0; for (let i = 0; i < N; i++) { const M = createMedical({ rng: mulberry32(300 + i) }); bleed(M, 'legL', 'thigh', 'arterial', 500, 'tq'); run(M, 15); for (const [id, by] of steps) { const it = id.endsWith('TQ') ? id : I.newItem(id); M.startTreatment({ item: it, region: 'legL', by }); run(M, 125); } run(M, 1800); if (!M.dead) alive++; lost += M.V0 - M.vol; } return { alive: alive / N, lost: lost / N }; };
  const SELF = { self: true, skill: 'rifleman' }, BUD = { self: false, skill: 'rifleman' };
  for (const [name, steps, lo, hi, tag, src] of [
    ['CAT, self', [['tq_cat', SELF]], 0.95, 1, 'CONFIRMED', 'WALTERS (CAT 100% in volunteers), KRAGH (field)'],
    ['strap & buckle, self', [['tq_strap', SELF]], 0.15, 0.5, 'INFERRED', 'WALTERS: strap types failed on the thigh'],
    ['two strap & buckle, buddy', [['tq_strap', BUD], ['tq_strap', BUD]], 0.45, 0.8, 'INFERRED', 'doctrine: a second TQ above the first'],
    ['cravat windlass, self', [['cravat', SELF]], 0.45, 0.8, 'INFERRED', 'KRAGH 2008: improvised TQs often fail'],
    ['cravat windlass, self, then tighten', [['cravat', SELF], ['tightenTQ', SELF]], 0.7, 0.95, 'INFERRED', 'FM2111'],
  ]) { const r = surv(steps); check(`femoral bleed at 0:15 + ${name}: survive 30 min`, r.alive >= lo && r.alive <= hi, `${(r.alive * 100).toFixed(0)}% (mean loss ${Math.round(r.lost)} ml)`, `${lo * 100}-${hi * 100}%`, tag, src); }
  { let ok = 0; for (let i = 0; i < 300; i++) { const M = createMedical({ rng: mulberry32(i) }); bleed(M, 'armL', 'upperArm', 'arterial', 250, 'tq'); treat(M, 'tq_strap', 'armL', { self: false, skill: 'rifleman' }); run(M, 40); if (M.bleedRate() < 20) ok++; }
    check('strap TQ on an arm (buddy): closes the brachial', ok / 300 > 0.8, (ok / 3).toFixed(0) + '%', '> 80%', 'INFERRED', 'WALTERS (arm OK)'); }
  { const M = createMedical(); const t = treat(M, 'tq_cat', 'legL').o.time, M2 = createMedical(); const t2 = treat(M2, 'tq_strap', 'armL').o.time;
    check('CAT self-application on a leg', t >= 15 && t <= 40, t + ' s', '15-40 s', 'INFERRED', 'TCCC training data: 20-40 s');
    check('strap TQ on your own arm is slow (two-handed)', t2 >= 90, t2 + ' s', '>= 90 s', 'INFERRED'); }
  { const M = createMedical(); treat(M, 'tq_cat', 'legR', { self: false, skill: 'rifleman' }); let isch = null, lostAt = null;
    run(M, 7 * 3600, 5, {}, (M, t) => { for (const e of M.events) { if (e.type === 'tqIschaemia' && isch == null) isch = t; if (e.type === 'limbLost') lostAt = t; } });
    check('tourniquet: ischaemic damage starts at 2 h', isch != null && Math.abs(isch - 7200) < 60, mmss(isch), '2:00:00', 'CONFIRMED', 'KRAGH (2 h safe)');
    check('tourniquet: limb lost at 6 h', lostAt != null && Math.abs(lostAt - 6 * 3600) < 60, mmss(lostAt), '6:00:00', 'INFERRED', 'KRAGH / ischaemia'); }
  { const M = createMedical(); bleed(M, 'legL', 'thigh', 'arterial', 500, 'tq'); treat(M, 'cravat', 'legL', { self: false }); run(M, 50); M.regions.legL.tq[0].occl = 0.98; const f0 = M.bleedRate(); run(M, 1800, 0.5, { moving: true });
    check('improvised TQ slips when walking 30 min', M.bleedRate() > f0 * 1.3, `${Math.round(f0)} -> ${Math.round(M.bleedRate())} ml/min`, 'flow rises', 'INFERRED'); }
}

// ================================================================================================= 3. treatments
console.log('--- 3. treatments ---');
{
  { const M = createMedical(); const b = bleed(M, 'armR', 'forearm', 'light', 20, 'tq'); treat(M, 'dressing_field', 'armR'); run(M, 60);
    check('field dressing stops a light bleed', b.stopped, b.stopped, 'stopped', 'CONFIRMED', 'FM2111'); }
  { const M = createMedical(); const b = bleed(M, 'legR', 'shin', 'heavy', 100, 'tq'); const o = treat(M, 'dressing_field', 'legR', { self: false }).o; run(M, o.time + 1);
    check('field dressing on a heavy bleed: x0.3 (pressure)', Math.abs(b.ctrl - 0.3) < 1e-6, b.ctrl, '0.3', 'INFERRED', 'FM2111 pressure dressing'); }
  { let ok = 0; const N = 400; for (let i = 0; i < N; i++) { const M = createMedical({ rng: mulberry32(i + 1) }); const b = bleed(M, 'stomach', 'pelvis', 'arterial', 600, 'junctional'); const o = treat(M, 'quikclot', 'stomach', { self: false }).o; run(M, o.time + 1, 1); if (b.stopped) ok++; }
    check('QuikClot on a groin (junctional) arterial bleed', ok / N > 0.84 && ok / N < 0.96, (ok / N * 100).toFixed(0) + '% stopped', '~90%', 'INFERRED', 'QCMFR; TCCC junctional haemorrhage'); }
  { const M = createMedical(); bleed(M, 'stomach', 'pelvis', 'arterial', 600, 'junctional'); const o = M.treatOptions('tq_cat', 'stomach');
    check('no tourniquet on a junctional (groin) wound', !o.ok, o.reason, 'refused', 'CONFIRMED', 'TCCC'); }
  { const M = createMedical(); bleed(M, 'thorax', 'chest', 'heavy', 120, 'internal'); const o = M.treatOptions('dressing_field', 'thorax'); const o2 = M.treatOptions('quikclot', 'thorax');
    check('internal chest bleed: no dressing or packing helps', !o.ok && !o2.ok, `${o.reason} / ${o2.reason}`, 'refused', 'INFERRED', 'non-compressible haemorrhage'); }
  // morphine
  { const M = createMedical(); M.damage('legL', 40); M.adrenaline = 0; run(M, 20); const p0 = M.pain(); treat(M, 'morphine', null); const m = run(M, 600); const p1 = M.pain();
    check('one morphine syrette: pain halved within 10 min', p1 < p0 * 0.5, `${p0.toFixed(0)} -> ${p1.toFixed(0)}`, '< 50%', 'INFERRED', 'MORPH (onset compressed ~10x for play)');
    check('one morphine syrette: no sedation', M.opioidSed() === 0, M.opioid.toFixed(1) + ' mg', 'awake', 'INFERRED', 'MORPH'); }
  { const M = createMedical(); for (let i = 0; i < 2; i++) { treat(M, 'morphine', null); run(M, 12); } run(M, 900);
    check('two syrettes: drowsy but alive', !M.dead && M.opioidSed() > 0.05 && !M.unconscious, `sed ${M.opioidSed().toFixed(2)} rr ${M.vitals().rr}`, 'drowsy', 'INFERRED', 'MORPH'); }
  { const M = createMedical(); M.vol = M.V0 * 0.66; M.rbc = M.vol * 0.44; for (let i = 0; i < 4; i++) { treat(M, 'morphine', null, { self: false }); run(M, 10); } const m = run(M, 1800);
    check('four syrettes in a man in class III shock: fatal', M.dead, M.cause || 'alive', 'DIED: MORPHINE OVERDOSE', 'INFERRED', 'MORPH (contraindicated in shock)'); }
  // IV
  { const M = createMedical(); M.vol = M.V0 * 0.7; M.rbc = M.vol * 0.44; const v0 = M.vol; const o = M.treatOptions('iv_lr', 'armL', { self: false, skill: 'rifleman' });
    check('IV is corpsman-only', !o.ok && o.reason === 'CORPSMAN ONLY', o.reason, 'CORPSMAN ONLY', 'INFERRED', 'decision (1980 Navy corpsmen started IVs; riflemen were not trained)');
    M.waterDef = 9999;   // stop natural refill to see the crystalloid alone
    treat(M, 'iv_lr', 'armL', { self: false, skill: 'corpsman' }); run(M, 96 + 900); const peak = M.vol - v0; run(M, 3600); const kept = M.vol - v0;
    check('1 l Ringer\'s: ~1/3 stays in the vessels after an hour', kept > 280 && kept < 480, `${Math.round(peak)} ml at the end of the bag -> ${Math.round(kept)} ml`, '~333 ml', 'CONFIRMED', '3:1 crystalloid rule');
    check('crystalloid dilutes the blood (haematocrit falls)', M.hct() < 0.42, M.hct().toFixed(3), '< 0.42', 'CONFIRMED', 'haemodilution'); }
  { const mk = () => { const M = createMedical(); M.vol = M.V0 * 0.72; M.rbc = M.vol * 0.44; bleed(M, 'stomach', 'abdomen', 'heavy', 120, 'internal'); return M; };
    const A = mk(), B = mk(); treat(B, 'iv_lr', 'armL', { self: false, skill: 'corpsman' }); run(A, 120 + 600); run(B, 120 + 600);
    check('IV raises the pressure -> an uncontrolled bleed bleeds faster', B.bleedRate() > A.bleedRate() * 1.1, `${Math.round(A.bleedRate())} without vs ${Math.round(B.bleedRate())} ml/min with IV`, 'faster', 'CONFIRMED', 'permissive hypotension rationale (TCCC)'); }
  // pneumothorax
  { const M = createMedical(); M.ptx = { open: true, sev: 0.45, sealed: false, vented: false, tension: 0, decompressed: 0 }; treat(M, 'dressing_field', 'thorax'); const m = run(M, 3600, 1);
    check('sucking chest wound sealed with the wrapper (unvented): tension kills', M.dead && m.dead > 600 && m.dead < 3000, M.dead ? mmss(m.dead) + ' ' + M.cause : 'alive', '10-50 min', 'INFERRED', 'FM2111 / tension pneumothorax after occlusive dressing'); }
  { const M = createMedical(); M.ptx = { open: true, sev: 0.45, sealed: false, vented: false, tension: 0, decompressed: 0 }; treat(M, 'dressing_field', 'thorax'); run(M, 900, 1); treat(M, 'needle_14g', 'thorax', { self: false, skill: 'corpsman' }); run(M, 3600, 1);
    check('... decompressed by a corpsman at 15 min: survives the hour', !M.dead, M.dead ? M.cause : `SpO2 ${M.vitals().spo2}`, 'alive', 'INFERRED'); }
  { const M = createMedical(); M.ptx = { open: true, sev: 0.45, sealed: false, vented: false, tension: 0, decompressed: 0 }; treat(M, 'chest_seal', 'thorax'); run(M, 3600, 1);
    check('vented chest seal (modern): no tension', !M.dead && M.ptx.tension < 0.05, `tension ${M.ptx.tension.toFixed(2)}`, '0', 'INFERRED', 'TCCC 2013'); }
  // splint
  { const M = createMedical(); M.regions.legL.fracture = 'FEMUR'; const a = M.mods().speedMul; treat(M, 'splint_wire', 'legL', { self: false }); run(M, 61); const b = M.mods().speedMul;
    check('splint: broken leg walks faster', b > a + 0.1 && !M.mods().sprint, `${a.toFixed(2)} -> ${b.toFixed(2)}, sprint ${M.mods().sprint}`, 'faster, no sprint', 'INFERRED', 'FM2111'); }
  // nanites
  { const M = createMedical(); bleed(M, 'legL', 'thigh', 'arterial', 500, 'tq'); M.regions.armR.hp = 0; M.regions.legL.fracture = 'FEMUR'; treat(M, 'rw_mender', null); run(M, 70, 0.5);
    check('RW nanite injector: bleeds stopped, limbs restored, bone knit', M.bleedRate() < 1 && M.regions.armR.hp > 50 && !M.regions.legL.fracture, `bleed ${M.bleedRate().toFixed(1)}, arm ${M.regions.armR.hp.toFixed(0)}`, 'healed', 'FICTION'); }
}

// ============================================================================== 4. damage and armour (GAME tuning)
// Not checked against real-world data: these are Tarkov-style gameplay tables. The checks pin the intended FEEL so
// later tuning doesn't break it. Tag GAME.
console.log('--- 4. damage and armour (game tuning, Tarkov-style; tag GAME) ---');
const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
function hpStats(hit, N = 300, armourIds = []) {
  const hp = [], dead = []; let stopped = 0;
  for (let i = 0; i < N; i++) { const M = createMedical({ rng: mulberry32(1000 + i) }); const r = M.hit({ ...hit }, armourIds.map(id => I.newItem(id))); hp.push(r.hp); if (!r.penetrated) stopped++; run(M, 600, 1); dead.push(M.dead ? 1 : 0); }
  return { hp: median(hp), stop: stopped / N, dead10: dead.reduce((s, x) => s + x, 0) / N };
}
function stopRate(hit, ids, N = 1000) { let s = 0, cov = 0; for (let i = 0; i < N; i++) { const M = createMedical({ rng: mulberry32(7 + i) }); const r = M.hit({ ...hit }, ids.map(id => I.newItem(id))); if (r.layers.some(l => l.covered)) { cov++; if (!r.penetrated) s++; } } return cov ? s / cov : 0; }
{
  const out = {};
  for (const [name, h] of [['M193 @100 m', { round: 'M193', velocity: approxVelocity('M193', 100) }], ['M193 @400 m', { round: 'M193', velocity: approxVelocity('M193', 400) }], ['M80 @100 m', { round: 'M80', velocity: approxVelocity('M80', 100) }], ['.45 ACP @10 m', { round: 'M1911', velocity: approxVelocity('M1911', 10) }], ['grenade fragment @5 m', fragmentHits('M67', 5, mulberry32(4))[0] || { kind: 'fragment', dmg: 15, pen: 14 }]]) {
    const th = hpStats({ ...h, part: 'thorax', zone: 'chest' }), lg = hpStats({ ...h, part: 'legL', zone: 'thigh' }); out[name] = { th, lg };
    console.log(`      ${name.padEnd(24)} chest ${th.hp.toFixed(0).padStart(3)} HP (dead in 10 min ${(th.dead10 * 100).toFixed(0).padStart(3)}%)   thigh ${lg.hp.toFixed(0).padStart(3)} HP (dead ${(lg.dead10 * 100).toFixed(0).padStart(3)}%)`);
  }
  check('one rifle hit to the chest is survivable (HP)', out['M193 @100 m'].th.hp < 85, out['M193 @100 m'].th.hp.toFixed(0) + ' HP', '< 85 (two kill)', 'GAME');
  check('7.62 hits harder than 5.56 at range', out['M80 @100 m'].th.hp > out['M193 @400 m'].th.hp, `${out['M80 @100 m'].th.hp.toFixed(0)} vs ${out['M193 @400 m'].th.hp.toFixed(0)}`, 'M80 > M193', 'GAME');
  check('pistol hits softer than rifle', out['.45 ACP @10 m'].th.hp < out['M193 @100 m'].th.hp, `${out['.45 ACP @10 m'].th.hp.toFixed(0)} vs ${out['M193 @100 m'].th.hp.toFixed(0)}`, 'pistol < rifle', 'GAME');
  { const r = hpStats({ round: 'M193', velocity: 900, part: 'head', zone: 'cranium' }, 200); check('unprotected head shot (rifle): lethal', r.dead10 > 0.97, (r.dead10 * 100).toFixed(0) + '%', '> 97%', 'GAME'); }
  const frag = { kind: 'fragment', dmg: 14, pen: 13, part: 'thorax', zone: 'chest' };
  check('class 2 (M69 vest) stops most grenade fragments', stopRate(frag, ['m69_vest']) > 0.7, (stopRate(frag, ['m69_vest']) * 100).toFixed(0) + '%', '> 70% of covered hits', 'GAME');
  const rifle = { round: 'M193', velocity: approxVelocity('M193', 100), part: 'thorax', zone: 'chest' };
  check('class 2 (M69 vest) rarely stops rifle rounds', stopRate(rifle, ['m69_vest']) < 0.1, (stopRate(rifle, ['m69_vest']) * 100).toFixed(1) + '%', '< 10%', 'GAME');
  const pistol = { round: 'M1911', velocity: 250, part: 'head', zone: 'cranium' };
  check('class 2 (M1 helmet) vs pistol: sometimes', stopRate(pistol, ['m1_helmet']) > 0.2 && stopRate(pistol, ['m1_helmet']) < 0.9, (stopRate(pistol, ['m1_helmet']) * 100).toFixed(0) + '%', '20-90%', 'GAME');
  const m80 = { round: 'M80', velocity: approxVelocity('M80', 50), part: 'thorax', zone: 'chest', dir: { x: 0, y: 0, z: -1 } };
  check('class 5 plate (seized carrier) stops 7.62 from the front', stopRate(m80, ['plate_carrier_rw']) > 0.6, (stopRate(m80, ['plate_carrier_rw']) * 100).toFixed(0) + '%', '> 60% of covered hits', 'GAME');
  check('... from the side only the soft class 3 covers: through', stopRate({ ...m80, dir: { x: -1, y: 0, z: 0 } }, ['plate_carrier_rw']) < 0.1, (stopRate({ ...m80, dir: { x: -1, y: 0, z: 0 } }, ['plate_carrier_rw']) * 100).toFixed(0) + '%', '< 10%', 'GAME');
  check('class 6 (RW carapace) stops our 7.62', stopRate(m80, ['rw_carapace']) > 0.9, (stopRate(m80, ['rw_carapace']) * 100).toFixed(0) + '%', '> 90%', 'FICTION');
  check('RW needles go through the M69', stopRate({ round: 'RWN', part: 'thorax', zone: 'chest' }, ['m69_vest']) < 0.02, (stopRate({ round: 'RWN', part: 'thorax', zone: 'chest' }, ['m69_vest']) * 100).toFixed(1) + '%', '< 2%', 'FICTION');
  { const pc = I.newItem('plate_carrier_rw'); const p0 = penProbability(ROUNDS.M80.pen, 5, 1);
    for (let i = 0; i < 25; i++) { const M = createMedical({ rng: mulberry32(5 + i) }); M.hit({ round: 'M80', part: 'thorax', zone: 'chest' }, [pc]); }
    const p1 = penProbability(ROUNDS.M80.pen, 5, pc.dur / ITEMS.plate_carrier_rw.armour.durMax);
    check('armour wears: 25 hits later more get through', p1 > p0 * 2, `P(pen) ${(p0 * 100).toFixed(1)}% -> ${(p1 * 100).toFixed(1)}%, dur ${pc.dur.toFixed(0)}/90`, 'rises', 'GAME'); }
  { const hp = []; for (let i = 0; i < 300; i++) { const M = createMedical({ rng: mulberry32(50 + i) }); const r = M.hit({ round: 'M80', velocity: 820, part: 'thorax', zone: 'chest' }, [I.newItem('plate_carrier_rw')]); if (!r.penetrated) hp.push(r.hp); }
    check('a stopped round still hurts (blunt)', median(hp) > 5 && median(hp) < 20, median(hp).toFixed(1) + ' HP', '5-20 HP', 'GAME'); }
  for (const [d, arm, lo, hi, what, kind] of [[5, [], 0.2, 0.9, 'no armour', 'dead'], [5, ['m69_vest', 'm1_helmet'], 0, 0.6, 'M69 + M1', 'dead'], [15, [], 0.3, 0.8, 'no armour', 'wounded']]) {
    let wounded = 0, dead = 0; const N = 300;
    for (let i = 0; i < N; i++) { const rng = mulberry32(900 + i); const M = createMedical({ rng }); const hits = fragmentHits('M67', d, rng); const kit = arm.map(id => I.newItem(id)); for (const h of hits) M.hit(h, kit); if (Object.values(M.regions).some(R => R.hp < R.max)) wounded++; run(M, 600, 1); if (M.dead) dead++; }
    const v = (kind === 'dead' ? dead : wounded) / N;
    check(`grenade at ${d} m (${what}): ${kind === 'dead' ? 'dead within 10 min untreated' : 'wounded'}`, v >= lo && v <= hi, (v * 100).toFixed(0) + '%', `${lo * 100}-${hi * 100}%`, 'GAME', kind === 'wounded' ? 'feel: about half wounded at 15 m' : '');
  }
}

// =============================================================================================== 5. kit weights
console.log('--- 5. kit weights ---');
{
  const w = id => ITEMS[id].kg;
  check('M16A1 without magazine', w('m16a1') === 2.89, '2.89 kg', '2.89 kg (6.35 lb)', 'CONFIRMED', 'TM16');
  const m = I.newItem('mag_m16_20', { fill: 'M193', rounds: 20 }); check('loaded 20-round magazine', Math.abs(I.weight(m) - 0.318) < 0.02, I.weight(m).toFixed(3) + ' kg', '0.318 kg (0.7 lb)', 'CONFIRMED', 'TM16');
  check('M60', w('m60') === 10.5, '10.5 kg', '10.5 kg', 'CONFIRMED', 'FM2367'); check('M72A2 LAW', w('m72a2') === 2.3, '2.3 kg', '2.3 kg', 'CONFIRMED', 'FM2333'); check('M67 grenade', w('m67') === 0.4, '0.4 kg', '0.4 kg', 'CONFIRMED', 'FM32330');
  const full = I.newItem('canteen_1qt'); check('full 1-qt canteen', Math.abs(I.weight(full) - 1.08) < 0.05, I.weight(full).toFixed(2) + ' kg', '~1.08 kg', 'INFERRED');
  const CLOTHES = 3.6;   // utilities, boots, T-shirt, socks, dog tags (INFERRED: jungle boots ~1.6 kg + uniform ~1.6 kg + misc)
  for (const [n, lo, hi, flo, fhi] of [['rifleman', 25, 35, 15, 23], ['grenadier', 24, 35, 15, 24], ['corpsman', 22, 33, 14, 23], ['mg', 30, 45, 22, 32]]) {
    const s = I.loadout(n); const kg = I.totalWeight(s) + CLOTHES; const pack = s.slots.pack ? I.weight(s.slots.pack) : 0; const sec = s.slots.secondary ? I.weight(s.slots.secondary) : 0; const fight = kg - pack - sec;
    check(`1980 ${n}: approach march load (incl. ${CLOTHES} kg clothing)`, kg >= lo && kg <= hi, kg.toFixed(1) + ' kg', `${lo}-${hi} kg`, 'INFERRED', 'FM2118 (33 kg approach march), brief 25-35 kg');
    check(`1980 ${n}: fighting load (pack and LAW dropped)`, fight >= flo && fight <= fhi, fight.toFixed(1) + ' kg', `${flo}-${fhi} kg`, 'INFERRED', 'FM2118 (22 kg fighting load)');
    if (V) { for (const k of I.EQUIP_ORDER) { const it = s.slots[k]; if (it) console.log(`        ${k.padEnd(10)} ${ITEMS[it.id].short.padEnd(10)} ${I.weight(it).toFixed(2)} kg`); } }
  }
  const W = I.pandolfWatts(75, 30, 1.34, 0, 1.0); check('Pandolf: 75 kg + 30 kg at 1.34 m/s, level road', W > 380 && W < 480, W.toFixed(0) + ' W', '~400-470 W', 'CONFIRMED', 'Pandolf 1977');
  const e = I.encumbrance(30); check('encumbrance at 30 kg: approach load, can sprint', e.state === 'APPROACH LOAD' && e.canSprint, `${e.state} walk x${e.walkMul} sprint x${e.sprintMul}`, 'APPROACH LOAD', 'INFERRED', 'FM2118');
}

// ================================================================================================= 6. grids
console.log('--- 6. inventory grids ---');
{
  const pouch = I.newItem('pouch_ammo'); const mags = [0, 1, 2, 3].map(() => I.newItem('mag_m16_20', { fill: 'M193', rounds: 20 }));
  const placed = mags.map(m => { const f = I.findFree(pouch, m); return !!f && !I.placeIn(pouch, f.g, m, f.x, f.y, f.r); });
  check('ALICE ammo case: 3 magazines, a 4th is refused', placed.filter(Boolean).length === 3 && !placed[3], placed.join(','), 'true,true,true,false', 'CONFIRMED', 'ALICE');
  const gr = I.newItem('m67'); const fg = I.findFree(pouch, gr); check('... grenade goes in the side sleeve', fg && fg.g === 3, JSON.stringify(fg), 'grid 3 (sleeve)', 'CONFIRMED', 'ALICE');
  check('... a dressing does not fit an ammo case', !I.findFree(pouch, I.newItem('dressing_field')), 'refused', 'refused', 'INFERRED');
  const pack = I.newItem('alice_medium'); const rifle = I.newItem('m16a1');
  check('M16A1 (5x2) fits the ALICE medium main (5x6)', !I.placeIn(pack, 0, rifle, 0, 0), 'placed', 'placed', 'INFERRED');
  const law = I.newItem('m72a2'); check('LAW (4x1) fits rotated in a 2x2 pocket? no', !!I.placeError(pack, 1, law, 0, 0, 1), I.placeError(pack, 1, law, 0, 0, 1), 'NO ROOM', 'INFERRED');
  const mag = I.newItem('mag_m16_30'); check('rotation: a 1x2 magazine lies 2x1 in a 2x2 pocket', !I.placeIn(pack, 1, mag, 0, 0, 1) && I.dims(mag).w === 2, JSON.stringify(I.dims(mag)), '{"w":2,"h":1}', 'INFERRED');
  const pack2 = I.newItem('alice_medium'); check('a pack does not go in a pack', I.placeError(pack, 0, pack2, 0, 2) === 'DOESN\'T FIT HERE', I.placeError(pack, 0, pack2, 0, 2), 'refused (deny pack)', 'INFERRED');
  const ifak = I.newItem('ifak'); I.placeIn(pack, 0, ifak, 0, 2); const bag = I.newItem('unit1_bag');
  check('nesting: IFAK in the pack, items in the IFAK', !I.placeIn(ifak, 0, I.newItem('tq_cat'), 0, 0) && I.isWithin(ifak.grids[0][0], pack), 'nested', 'nested', 'INFERRED');
  check('nesting: nothing inside itself', I.placeError(ifak, 0, ifak, 1, 0) === 'INSIDE ITSELF' || I.placeError(ifak, 0, pack, 0, 0) === 'INSIDE ITSELF', I.placeError(ifak, 0, pack, 0, 0), 'INSIDE ITSELF', 'INFERRED');
  const st = I.newItem('r_m193', { n: 60 }); const half = I.split(st, 25); check('split stack 60 -> 35 + 25', st.n === 35 && half.n === 25, `${st.n} + ${half.n}`, '35 + 25', 'INFERRED');
  I.merge(half, st); check('merge back', st.n === 60 && half.n === 0, st.n, '60', 'INFERRED');
  const m1 = I.newItem('mag_m16_20'), m2 = I.newItem('mag_m16_20'), loose = I.newItem('r_m193', { n: 60 }), band = I.newItem('bando_m193');
  const t1 = I.loadMag(m1, loose).seconds, t2 = I.loadMag(m2, band).seconds;
  check('loading 20 rounds: thumbing vs stripper clips + charger', t1 > t2 * 2.5, `${t1.toFixed(0)} s vs ${t2.toFixed(0)} s`, 'clips ~3x faster', 'INFERRED', 'BAND');
  check('magazine LIFO: the last round loaded feeds first', (() => { const m = I.newItem('mag_m16_20'); I.magPush(m, 'M193', 17); I.magPush(m, 'M196', 3); return I.magPop(m) === 'M196' && I.magCount(m) === 19; })(), 'tracers on top', 'M196 first', 'INFERRED');
  check('7.62 rounds refused by an M16 magazine', I.loadMag(I.newItem('mag_m16_20'), I.newItem('r_m80', { n: 10 })).error === 'WRONG CALIBRE', 'WRONG CALIBRE', 'refused', 'INFERRED');
  const s = I.loadout('rifleman'); const w0 = I.totalWeight(s); const json = I.serialize(s); const s2 = I.deserialize(json);
  check('save / load round trip keeps every gram', Math.abs(I.totalWeight(s2) - w0) < 1e-9, I.totalWeight(s2).toFixed(3) + ' kg', w0.toFixed(3) + ' kg', 'INFERRED');
  const W = s.slots.primary; for (let i = 0; i < 20; i++) I.magPop(I.weaponMag(W)); const r = I.reload(s, W);
  check('reload: fullest magazine in, empty one back in the pouch', I.magCount(I.weaponMag(W)) === 20 && I.parentOf(r.old)?.c && !r.dropped, `in ${I.magCount(r.mag)}, out ${I.magCount(r.old)} -> ${ITEMS[I.parentOf(r.old).c.id].short}`, 'swap', 'INFERRED');
  const dr = I.find(s, (o, d) => d.id === 'dressing_field'); I.bindQuick(s, 4, dr); const M = createMedical(); bleed(M, 'armL', 'forearm', 'light', 20, 'tq');
  const tgt = M.autoTarget(I.quick(s, 4)); M.startTreatment({ item: I.quick(s, 4), region: tgt }); run(M, 60); I.prune(s);
  check('quick slot 5: dressing auto-targets the bleeding arm, is used up', tgt === 'armL' && !I.find(s, o => o === dr), `${tgt}, gone=${!I.find(s, o => o === dr)}`, 'armL, gone', 'INFERRED');
  const crate = I.fillCrate('crate_med', mulberry32(3)); const n = [...I.walk(crate)].length; let t = 0; while (I.searchStep(crate, 0.1) > 0) t += 0.1;
  check('searching a medical chest reveals items one by one', crate.searched && t > n * 0.6, `${n} items in ${t.toFixed(1)} s`, `~${(n * 0.8).toFixed(1)} s`, 'INFERRED', 'Tarkov search pacing');
  const sp = BUDDY.dragSpeed(createMedical().mods(), 95, 25); check('buddy drag of a 95 kg casualty', sp >= 0.6 && sp <= 1.1, sp + ' m/s', '0.6-1.1 m/s', 'INFERRED', 'casualty-drag trials');
}

console.log(`\n${pass} passed, ${fail} failed${fail ? ': ' + fails.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
