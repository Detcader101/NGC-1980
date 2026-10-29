// (ngc/look-airbases) node bench for the air base: the site, the flattened ground (physics = terrain bake = layout),
// the keep-outs (no towns / farms / roads / trees on the field), the mesh budget, and a C-130 sortie on the real
// flight model: engines-running take-off from the runway, a circuit, an autopilot approach and landing, a stop.
// node tools/airbasebench.mjs [--bound=2560]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
globalThis.location = { search: '' };
const W = await import('../game/js/world.js');
const { AB, AB_SLOTS } = await import('../game/js/world/airbase.js');
const NET = await import('../game/js/world/net.js');
const THREE = await import('three');
const A = W.AIRBASE;
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
console.log(`site: ${A.label}  at (${A.x.toFixed(0)}, ${A.z.toFixed(0)})  elevation ${A.E} m  edge ${A.site.edge}  ${A.site.d} m past BOUND ${W.BOUND}  score ${A.site.score.toFixed(1)}`);

// 1. the ground: flat to the centimetre on every paved surface and under every building; the blend reaches the natural ground
let worst = 0;
for (const [, u0, u1, v0, v1] of A.paved) for (let u = u0; u <= u1; u += (u1 - u0) / 20) for (let v = v0; v <= v1; v += (v1 - v0) / 4) { const [x, z] = A.toW(u, v); worst = Math.max(worst, Math.abs(W.islandH(x, z) - A.E), Math.abs(W.rawH(x, z) - A.E)); }
ok(worst < 0.01, `paved surfaces flat at ${A.E} m (worst ${worst.toFixed(3)} m)`);
{ const [x, z] = A.toW(AB.FLAT.u + AB.FLAT.blend + 10, 0); ok(Math.abs(W.rawH(x, z) - W.wildH(x, z)) < 1e-6, 'past the blend the ground is the natural wild land'); }
ok(Math.max(Math.abs(A.x), Math.abs(A.z)) - W.BOUND > 1500, `outside the control zone (${(Math.max(Math.abs(A.x), Math.abs(A.z)) - W.BOUND).toFixed(0)} m past BOUND)`);
// approaches: at least one runway end's corridor (+-1.5 km, 8 km) clear of the 3 deg glide path + 150 m (the autopilot lands there)
ok(Math.min(A.ends[0].obst, A.ends[1].obst) < 0, `an approach is clear: RWY ${A.ends[0].num} ${A.ends[0].obst.toFixed(0)} m, RWY ${A.ends[1].num} ${A.ends[1].obst.toFixed(0)} m above the glide path + 150 m (< 0 = clear)`);

// 2. keep-outs: towns, farms, roads, trees
let towns = 0, cleared = 0, n = 0;
for (let u = -AB.FLAT.u; u <= AB.FLAT.u; u += 150) for (let v = AB.FLAT.v0; v <= AB.FLAT.v1; v += 100) { const [x, z] = A.toW(u, v); n++; if (NET.clearedAt(x, z)) cleared++; const r = NET.roadAt ? NET.roadAt(x, z) : null; if (r && r.dist < r.hw + 2) { towns++; console.log('  road at u', u, 'v', v); } }
ok(cleared === n, `no trees / scrub on the field (${cleared}/${n} points cleared)`);
ok(towns === 0, `no roads across the field (${towns} hits)`);

// 3. the mesh
const { buildAirbase } = await import('../game/js/world/airbasemesh.js');
const t0 = performance.now(); const AM = buildAirbase(A); const ms = performance.now() - t0;
let draws = 0, tris = 0; AM.root.traverse(o => { if (o.isMesh) { draws++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
console.log(`mesh: ${draws} draws, ${(tris / 1000).toFixed(1)} k tris, ${AM.lightCount} lamps, built in ${ms.toFixed(0)} ms`);
ok(draws <= 8 && tris < 400000, 'mesh budget (<= 8 draws, < 400 k tris incl. instanced lamps)');

// 4. a C-130 sortie on the real flight model and the craft's own autopilot (basecraft.js homeAutopilot): lined up,
// full power, rotate at 105 KIAS, the keyboard hands-off climb-out hold, then N: home, the approach, landing, rollout
const { createC130Sim } = await import('../game/js/units/air/c130fm.js');
const { homeAutopilot } = await import('../game/js/units/air/basecraft.js');
const sortie = (endIdx, label) => {
  const S = createC130Sim(), gy = (x, z) => Math.max(W.rawH(x, z), 0), env = { groundY: gy, water: () => false, wind: { x: 0, z: 0 } };
  const e0 = A.ends[endIdx], [tx, tz] = A.toW(e0.u + e0.dir * 60, 0), rwyYaw = A.yawOf(e0.dir, 0);
  S.resetGround(tx, A.E, tz, rwyYaw); S.fuel = 9000; S.payload = 2500; S.flapSel = S.flap = 0.5; S.trim = 0.08;
  let t = 0, liftoff = null, phase = 'roll', maxAlt = 0, hold = null, td = null; const dt = 1 / 60, H = {};
  for (; t < 1200 && !S.dead; t += dt) {
    let c;
    if (phase === 'roll') { c = { pitch: S.kias > 105 ? 0.6 : 0, roll: 0, yaw: 0, lever: [90, 90, 90, 90], brakeL: 0, brakeR: 0 }; if (!S.onGround) { liftoff = A.toL(S.pos.x, S.pos.z, [0, 0]); phase = 'climb'; } }
    else if (phase === 'climb') { if (!hold) hold = { track: S.track(), alt: Math.max(S.pos.y, gy(S.pos.x, S.pos.z) + 300) }; const a = S.autopilot(dt, { track: hold.track, alt: hold.alt, kias: S.kias }); c = { ...a, lever: [90, 90, 90, 90], brakeL: 0, brakeR: 0 }; if (t > 20 + (liftoff ? 0 : 0) && S.pos.y - A.E > 25) phase = 'home'; }
    else { c = homeAutopilot(S, H, A, dt, gy); if (H.rollout && !td) td = { t, ...A.toL(S.pos.x, S.pos.z, [0, 0]).reduce((o, x, i) => (o[i ? 'v' : 'u'] = x, o), {}), vy: S.vel.y }; if (H.rollout && Math.hypot(S.vel.x, S.vel.z) < 0.5) break; }
    maxAlt = Math.max(maxAlt, S.pos.y - A.E);
    S.step(dt, c, env);
  }
  const end = A.toL(S.pos.x, S.pos.z, [0, 0]);
  console.log(`c-130 ${label}: lift-off ${liftoff ? ((liftoff[0] - (e0.u + e0.dir * 60)) * e0.dir).toFixed(0) : '-'} m; max ${maxAlt.toFixed(0)} m; final ${!!H.final} flare ${!!H.flare}; t=${t.toFixed(0)} s; stopped at u=${end[0].toFixed(0)} v=${end[1].toFixed(1)}; nz ${S.nzMin.toFixed(2)}..${S.nzMax.toFixed(2)} ${S.dead ? 'DEAD ' + S.dead : ''}`);
  ok(liftoff && Math.abs(liftoff[1]) < 40 && !S.dead, `${label}: C-130 takes off from the runway`);
  ok(H.rollout && !S.dead && A.onRunway(S.pos.x, S.pos.z) && Math.hypot(S.vel.x, S.vel.z) < 0.5 && Math.abs(end[1]) < 25, `${label}: autopilot home - lands on the runway and stops on it (${end[1].toFixed(1)} m off the centreline)`);
};
sortie(0, `from ${A.ends[0].num}`); sortie(1, `from ${A.ends[1].num}`);
// 5. an SR-71 sortie on its own flight model (sr71fm.js) and the base adapter's way home (basesr71.js sr71Home): lined
// up for the departure end, full AB, rotate at ~190 KIAS (the sr71bench law), gear up, climb out, then N: the fix,
// a 175 KEAS final, flare, 155 KIAS touchdown, drag chute, brakes, stop on the centreline
{
  const { createSR71Sim } = await import('../game/js/units/air/sr71fm.js');
  const { sr71Home } = await import('../game/js/units/air/basesr71.js');
  const { departEnd } = await import('../game/js/units/air/basecraft.js');
  const sr = (endSel, label) => {
    const S = createSR71Sim(), gy = (x, z) => Math.max(W.rawH(x, z), 0), env = { groundY: gy, water: () => false };
    const e0 = endSel, [tx, tz] = A.toW(e0.u + e0.dir * 80, 0);
    S.resetGround(tx, A.E, tz, A.yawOf(e0.dir, 0)); S.fuel = (label === 'other end' ? 45000 : 64000) / 2.20462;
    const dt = +(process.env.SRDT || 1 / 60), H = {}, c = { pitch: 0, roll: 0, yaw: 0, throttle: [1, 1], brakeL: 0, brakeR: 0, trimRate: 0 };
    let t = 0, lift = null, td = null, phase = 'roll', chute = false, maxKeas = 0;
    for (; t < 1500 && !S.dead; t += dt) {
      c.pitch = c.roll = c.yaw = 0; c.brakeL = c.brakeR = 0;
      if (phase === 'roll') { c.throttle = [1, 1]; const att = S.attitude().pitch; if (S.kias > 188) c.pitch = Math.max(-1, Math.min(1, (0.165 - att) * 8 - S.w.y * 2)); if (!S.onGround) { lift = { kias: S.kias, at: A.toL(S.pos.x, S.pos.z, [0, 0]) }; phase = 'climb'; } }
      else if (phase === 'climb') { c.throttle = S.keas < 280 ? [0.85, 0.85] : [0.6, 0.6]; S.ap.on = true; S.ap.pitch = 'alt'; S.ap.alt = A.E + 800; S.ap.roll = 'hdg'; S.ap.hdg = A.yawOf(e0.dir, 0); if (S.pos.y - A.E > 60) S.gearCmd = 0; if (S.pos.y - A.E > 500) phase = 'home'; }
      else { const ph = sr71Home(S, H, A, dt, gy, c); if (ph === 'rollout' && !td) td = { kias: S.kias, at: A.toL(S.pos.x, S.pos.z, [0, 0]) }; if (S.chute === 'deployed' || S.chute === 'jettisoned') chute = true; if (ph === 'rollout' && Math.hypot(S.vel.x, S.vel.z) < 0.5) break; }
      maxKeas = Math.max(maxKeas, S.keas);
      const ev = S.step(dt, c, env); for (const x of ev) if (x.e === 'touchdown' && td === null && phase === 'home') td = { kias: x.kias, at: A.toL(S.pos.x, S.pos.z, [0, 0]) };
    }
    const end = A.toL(S.pos.x, S.pos.z, [0, 0]);
    console.log(`sr-71 ${label}: lift-off ${lift ? lift.kias.toFixed(0) + ' KIAS' : '-'}; home via RWY ${H.end ? H.end.num : '-'}; touchdown ${td ? td.kias.toFixed(0) + ' KIAS at ' + ((td.at[0] - H.end.u) * H.end.dir).toFixed(0) + ' m past the threshold' : '-'}; chute ${chute}; t=${t.toFixed(0)} s; stopped at u=${end[0].toFixed(0)} v=${end[1].toFixed(1)} ${S.dead ? 'DEAD ' + S.dead : ''}`);
    ok(lift && !S.dead, `${label}: SR-71 takes off (${lift ? lift.kias.toFixed(0) : '-'} KIAS, manual ~210)`);
    ok(td && Math.abs(td.kias - 160) < 25 && chute && !S.dead && A.onRunway(S.pos.x, S.pos.z) && Math.hypot(S.vel.x, S.vel.z) < 0.5 && Math.abs(end[1]) < 25, `${label}: SR-71 home autopilot - lands (${td ? td.kias.toFixed(0) : '-'} KIAS, manual 155), chute, stops on the runway (${end[1].toFixed(1)} m off the centreline)`);
  };
  sr(departEnd(A, 0), 'departure end'); sr(A.ends[0] === departEnd(A, 0) ? A.ends[1] : A.ends[0], 'other end');
}
for (const k in AB_SLOTS) { const sp = A.spot(k, 'park'); ok(!A.hitBuilding(sp.x, sp.z, 0) && A.onPavement(sp.x, sp.z), `slot ${k}: inside its hangar on paved floor`); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
