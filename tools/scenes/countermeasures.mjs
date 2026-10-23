// Countermeasures and cockpit warnings (ngc/cmpolish), in the real game:
//   1. HUEY vs a TALON on ANVIL: the radar locks (APR-39 strobe, LOCK lamp in the cockpit), a missile comes off the rail
//      (MISSILE lamp, MISSILE LAUNCH cue in chase view), the M130 drops a pair of flares (Semicolon) and the missile goes
//      for them.
//   2. HORNET running in on the same TALON: lock (LOCK lamp and the RWR scope), launch, a flare pair from the ALE-39
//      (Insert) decoys the missile.
//   3. THE MARINE on foot in front of a LANCE on IRONHOLD: it locks and fires, he throws an M18 (Shift+G); the green
//      plume blocks the lock (line of sight) and the beam.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/countermeasures.mjs
const Q = '?debug&kb&res=0.45';
const OVERRIDE = `(() => { if (window.__ovOn) return 1; window.__ovOn = 1; const r = __G.renderer, orig = r.render.bind(r);
  r.render = (s, c) => { const o = window.__ov; if (o && c === __G.zCam) { c.position.set(o.p[0], o.p[1], o.p[2]); c.lookAt(o.t[0], o.t[1], o.t[2]); c.updateMatrixWorld(); } return orig(s, c); }; return 1; })()`;
// a camera off to the side of the line from a to b (both {x, y, z} expressions), `off` m out, `up` m up
const side = (a, b, off, up, k = 0.5) => `(() => { const a = ${a}, b = ${b}, mx = a.x + (b.x - a.x) * ${k}, mz = a.z + (b.z - a.z) * ${k}, my = a.y + (b.y - a.y) * ${k}, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  window.__ov = { p: [mx + dz / l * ${off}, my + ${up}, mz - dx / l * ${off}], t: [mx, my, mz] }; return 1; })()`;
// one TALON alone on ANVIL, every other gun and the WASPs out of the way, no damage to the player (the test is the rules)
const ONE_TALON = `(() => { __G.G.bench = true; const I = __G.ISLANDS.find(I => I.name === 'ANVIL'); const t = I.structs.find(s => s.def && s.def.type === 'talon'); window.__t = t; window.__I = I;
  for (const J of __G.ISLANDS) for (const s of J.structs) if (s.kind === 'aa' && s !== t && s.side === 2) { s.dead = true; s.mesh.visible = false; }
  for (const u of __G.war.units) if (u.type === 'gunship') u.dead = true;
  return [t.x, t.y, t.z].map(v => +v.toFixed(1)); })()`;
const CMS = '__G.war.defence.CM';
// a camera beside the tracked missile (window.__m), across its flight line
// (aimed between the missile and `to`, the aircraft, when given)
const AT_MSL = (dist, up, to = null) => `(() => { const m = __m, q = ${to || 'null'}, p = q ? { x: (m.p.x + q.x) / 2, y: (m.p.y + q.y) / 2, z: (m.p.z + q.z) / 2 } : m.p, d = m.dir, l = Math.hypot(d.x, d.z) || 1; window.__ov = { p: [p.x + d.z / l * ${dist} - d.x / l * ${dist * 0.4}, p.y + ${up}, p.z - d.x / l * ${dist} - d.z / l * ${dist * 0.4}], t: [p.x, p.y - 2, p.z] }; return [p.x, p.y, p.z].map(v => +v.toFixed(0)); })()`;
// behind and above an aircraft at pos (expression), looking down past it
const BEHIND = (pos, fwd, back, up) => `(() => { const p = ${pos}, f = ${fwd}, l = Math.hypot(f.x, f.z) || 1; window.__ov = { p: [p.x - f.x / l * ${back} + f.z / l * 8, p.y + ${up}, p.z - f.z / l * ${back} - f.x / l * 8], t: [p.x + f.x / l * 10, p.y - 10, p.z + f.z / l * 10] }; return 1; })()`;
const ONLY = process.env.CM_ONLY || '';   // CM_ONLY=huey|hornet|marine runs one part (iterating)
export default async function (h) {
  // ================================================================ 1. the HUEY
  if (!ONLY || ONLY === 'huey') {
  await h.goto(Q);
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1500);
  await h.eval(OVERRIDE);
  await h.eval(ONE_TALON);
  // in the open, 120 m off the truck, 45 m up, nose on it
  await h.eval(`(() => { const t = __t, a = Math.atan2(t.x - __I.x, t.z - __I.z);
    const px = t.x + Math.sin(a) * 120, pz = t.z + Math.cos(a) * 120; __G.H.reset(new __G.THREE.Vector3(px, Math.max(__G.terrainH(px, pz), 0) + 45, pz), Math.atan2(-(t.x - px), -(t.z - pz)), false, 1); __G.HI.setCollective(0.47); return 1; })()`);
  await h.waitFor(`__t.def.key === 'P' && __t.def.lockT >= __t.def.T.lock + 0.2 && !__G.war.defence.missiles.length`, 30000);
  // the cockpit while it is locked: LOCK lamp, strobe on the APR-39
  await h.eval('(window.__ov = null, __G.cockpitCam = true, 1)'); await h.wait(1500);
  await h.eval(`({ rwr: { n: __G.RWR.n, mode: __G.RWR.mode, threats: __G.RWR.threats.map(o => o.kind + ' ' + (o.brg * 57.3).toFixed(0) + 'deg ' + o.d.toFixed(0) + 'm lock ' + o.lock.toFixed(2)) }, lamp: __G.cockpit.cmLamps.lock.userData.on, launch: __G.RWR.launch })`);
  await h.expect(`__G.RWR.n > 0 && __G.RWR.threats.some(o => o.kind === 'T') && (__G.cockpit.cmLamps.lock.userData.on || __G.RWR.launch)`, 'Huey: the TALON shows on the APR-39 and the LOCK lamp is lit');
  await h.shot('huey-cockpit-lock');
  // the missile: wait for it, the MISSILE lamp, then two flare pairs
  await h.waitFor(`__G.war.defence.missiles.some(m => m.player)`, 40000);
  await h.eval(`(window.__m = __G.war.defence.missiles.find(m => m.player), window.__f0 = __G.cmH.flare, window.__d0 = ${CMS}.stats.decoyed, 1)`);
  await h.key('tap', 'Semicolon');   // the launch tone: flares at once, then a second pair
  await h.expect(`__G.RWR.launch && __G.RWR.threats.some(o => o.kind === 'M')`, 'Huey: missile in the air on the warning picture');
  await h.key('tap', 'Semicolon');
  await h.shot('huey-cockpit-missile');
  await h.eval('(__G.cockpitCam = false, 1)');
  await h.eval(AT_MSL(45, 8, '__G.H.pos'));
  await h.wait(500); await h.shot('huey-flares');
  await h.waitFor(`${CMS}.stats.decoyed > __d0 || !__G.war.defence.missiles.some(m => m.player)`, 30000);
  await h.eval(`({ decoyed: ${CMS}.stats.decoyed, flaresLeft: __G.cmH.flare, flaresOut: ${CMS}.stats.flares, missiles: __G.war.defence.missiles.map(m => ({ player: m.player, decoy: !!m.decoy, age: +m.age.toFixed(2) })), feed: document.getElementById('feed').textContent.slice(0, 200) })`);
  await h.expect(`__G.cmH.flare === __f0 - 4`, 'Huey: two presses = two pairs of flares off the M130');
  await h.expect(`${CMS}.stats.decoyed > __d0`, 'Huey: the missile went for a flare');
  await h.eval(BEHIND('__G.H.pos', '__G.H.forward()', 22, 5)); await h.wait(300); await h.shot('huey-missile-on-flare');
  // the chase-view cue (the HUD scope + words) shows while threats are up
  await h.eval('(window.__ov = null, 1)'); await h.wait(500);
  await h.eval(`({ cue: [...document.querySelectorAll('#hud > div')].some(d => d.querySelector('canvas') && d.style.display === 'block'), weap: document.getElementById('weap').textContent })`);
  await h.expect(`[...document.querySelectorAll('#hud > div')].some(d => d.querySelector('canvas') && d.style.display === 'block')`, 'chase view: the radar warning cue is up');
  await h.shot('huey-chase-cue');
  // chaff: jams the TALON's radar lock
  await h.waitFor(`__t.def.key === 'P' && __t.def.lockT >= __t.def.T.lock`, 30000);
  await h.eval(`(window.__j0 = ${CMS}.stats.jammed, window.__c0 = __G.cmH.chaff, 1)`);
  await h.key('tap', 'Quote'); await h.wait(1200);
  await h.eval(`({ jammed: ${CMS}.stats.jammed, lockT: +__t.def.lockT.toFixed(2), jamT: +(__t.def.jamT || 0).toFixed(2), chaff: __G.cmH.chaff })`);
  await h.expect(`__G.cmH.chaff === __c0 - 1 && ${CMS}.stats.jammed > __j0 && __t.def.lockT < __t.def.T.lock`, 'Huey: chaff broke the TALON radar lock');
  await h.eval(side('__t', '__G.H.pos', 40, 10, 0.85)); await h.wait(300); await h.shot('huey-chaff');
  await h.eval('(window.__ov = null, 1)');

  }
  // ================================================================ 2. the HORNET
  if (!ONLY || ONLY === 'hornet') {
  await h.goto(Q + '&auto');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 30000); await h.wait(500);
  await h.key('tap', 'Digit5'); await h.wait(300);
  await h.eval(OVERRIDE);
  await h.eval(ONE_TALON);
  // a longer missile range for this pass only, so the lock builds in time on a straight run in (the rule is the same)
  await h.eval(`(window.__mr = __G.war.defence.DEF.talon.msl.range, __G.war.defence.DEF.talon.msl.range = 430, 1)`);
  await h.eval(`(() => { const t = __t, a = Math.atan2(t.x - __I.x, t.z - __I.z), x = t.x + Math.sin(a) * 650, z = t.z + Math.cos(a) * 650, J = __G.JP.J; J.cat = null;
    window.__alt = Math.max(t.y, 0) + 95; J.reset(x, 0, z, Math.atan2(-(t.x - x), -(t.z - z)), { running: true, airborne: true, alt: window.__alt, speed: 62 }); for (const e of J.eng) e.n = 0.85; __G.JP.thr = 0.6; __G.JP.thrSrc = 'kb';
    __G.JP.autopilot = (J, dt) => ({ pitch: Math.max(-1, Math.min(1, (-J.vel.y * 0.03 + (window.__alt - J.pos.y) * 0.004))), roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.6, 0.6], brakeL: 0, brakeR: 0 });
    __G.cockpitCam = true; return [x, z].map(v => +v.toFixed(0)); })()`);
  await h.waitFor(`__t.def.key === 'P' && __t.def.lockT >= __t.def.T.lock`, 30000);
  await h.wait(300);
  await h.eval(`({ thr: __G.JP.cockpit.cmState(), rwr: __G.RWR.threats.map(o => o.kind + ' ' + o.d.toFixed(0)), d: +__t.def.d.toFixed(0) })`);
  await h.expect(`__G.JP.cockpit.cmState().startsWith('true') || __G.RWR.launch`, 'Hornet: LOCK lamp lit');
  await h.shot('hornet-cockpit-lock');
  await h.waitFor(`__G.war.defence.missiles.some(m => m.player)`, 30000);
  await h.eval(`(window.__m = __G.war.defence.missiles.find(m => m.player), window.__f0 = __G.JP.cm.flare, window.__d0 = ${CMS}.stats.decoyed, 1)`);
  await h.key('tap', 'Insert'); await h.wait(300); await h.key('tap', 'Insert');
  await h.wait(200); await h.shot('hornet-cockpit-launch');
  await h.eval(`(__G.cockpitCam = false, __G.JP.snapChase(), 1)`); await h.eval(AT_MSL(70, 10, '__G.JP.J.pos')); await h.wait(300); await h.shot('hornet-flares-missile');
  await h.waitFor(`${CMS}.stats.decoyed > __d0 || !__G.war.defence.missiles.some(m => m.player)`, 30000);
  await h.eval(`({ decoyed: ${CMS}.stats.decoyed, flares: __G.JP.cm.flare, weap: __G.JP.weapLine() })`);
  await h.expect(`__G.JP.cm.flare === __f0 - 4`, 'Hornet: two flare pairs off the ALE-39');
  await h.expect(`${CMS}.stats.decoyed > __d0`, 'Hornet: the missile went for a flare');
  await h.eval('(window.__ov = null, 1)'); await h.wait(300); await h.shot('hornet-chase-after');
  await h.eval('(__G.war.defence.DEF.talon.msl.range = __mr, window.__ov = null, 1)');

  }
  // ================================================================ 3. the MARINE's M18 vs a LANCE
  if (!ONLY || ONLY === 'marine') {
  await h.goto(Q + '&auto');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.eval(OVERRIDE);
  await h.key('tap', 'KeyY'); await h.wait(800);
  await h.expect(`__G.G.craft === 'foot'`, 'out of the Huey on foot');
  await h.eval("(__G.marine.view = 'third', 1)");   // third person: the outside cameras below show no viewmodel
  await h.eval(`(() => { __G.G.bench = true; for (const u of __G.war.units) if (u.type === 'gunship') u.dead = true;
    const I = __G.ISLANDS.find(I => I.name === 'IRONHOLD'), L = I.structs.find(s => s.def && s.def.type === 'lance'); window.__L = L;
    for (const s of I.structs) if (s.kind === 'aa' && s !== L) { s.dead = true; s.mesh.visible = false; }
    // a spot 55-80 m from the LANCE that it can see a standing man at
    const los = __G.war.defence.los, e = L.mesh.userData.pitch.getWorldPosition(new __G.THREE.Vector3()); let best = null;
    for (let a = 0; a < 6.28 && !best; a += 0.2) for (const r of [65, 55, 75]) { const x = L.x + Math.sin(a) * r, z = L.z + Math.cos(a) * r, g = __G.terrainH(x, z); if (g > 1 && los(e.x, e.y, e.z, x, g + 1.6, z) && Math.abs(__G.terrainH(x + 2, z) - g) < 1.2) { best = { x, y: g, z }; break; } }
    if (!best) return 'no spot';
    __G.foot.spawnAt([{ x: best.x, y: best.y, z: best.z, yaw: Math.atan2(-(L.x - best.x), -(L.z - best.z)) }], { fresh: false }); window.__spot = best;
    return { spot: [best.x, best.y, best.z].map(v => +v.toFixed(1)), lance: [L.x, L.y, L.z].map(v => +v.toFixed(1)) }; })()`);
  await h.waitFor(`__L.def.key === 'P' && (__L.def.beam.st === 'charge' || __L.def.beam.st === 'on')`, 40000);
  await h.eval(`({ st: __L.def.beam.st, los: __L.def.los, d: +__L.def.d.toFixed(0), smokes: __G.marine.inv && __G.marine.MS ? 1 : 0 })`);
  await h.eval(side('__L', '__G.foot.W', 35, 12, 0.5)); await h.wait(400); await h.shot('lance-on-the-marine');
  // face the LANCE and throw the smoke a little short of the line between
  await h.eval(`(() => { const S = __G.marine.S, L = __L; return __G.marine.aim(Math.atan2(-(L.x - S.eye.x), -(L.z - S.eye.z)), -0.05); })()`); await h.wait(300);
  await h.eval(`(window.__s0 = (__G.marine.stats.smokes || 0), 1)`);
  await h.key('down', 'ShiftLeft'); await h.key('tap', 'KeyG'); await h.key('up', 'ShiftLeft');
  await h.wait(300);
  await h.expect(`(__G.marine.stats.smokes || 0) === __s0 + 1`, 'Marine: an M18 thrown (Shift+G)');
  await h.waitFor(`__G.marine.lastSmoke && __G.marine.lastSmoke.t > 5`, 40000);
  await h.wait(500);
  await h.eval(`({ los: __L.def.los, beam: __L.def.beam.st, blocked: __L.def.beam.blocked, plume: ${CMS}.smoke.length })`);
  await h.expect(`!__L.def.los || __L.def.beam.blocked === 'smoke'`, 'Marine: the smoke hides him from the LANCE');
  await h.eval(side('__L', '__G.foot.W', 40, 14, 0.75)); await h.wait(400); await h.shot('m18-screen-side');
  await h.eval(`(() => { const L = __L, W = __G.foot.W, dx = W.x - L.x, dz = W.z - L.z, l = Math.hypot(dx, dz); window.__ov = { p: [L.x - dx / l * 6, L.y + 6, L.z - dz / l * 6], t: [W.x, W.y + 1.5, W.z] }; return 1; })()`);
  await h.wait(400); await h.shot('m18-from-the-lance');
  await h.wait(4000);
  await h.expect(`!__L.def.los`, 'Marine: still hidden a few seconds on');
  }
}
