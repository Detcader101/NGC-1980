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
// approach / climb-out: no ground above a 1-in-40 slope from each runway end out to 6 km
let obst = -1e9; for (const s of [-1, 1]) for (let d = 100; d <= 6000; d += 100) { const [x, z] = A.toW(s * (AB.RWY_L / 2 + d), 0); obst = Math.max(obst, W.rawH(x, z) - A.E - d / 40); }
ok(obst < 0, `approach surfaces clear (worst ${obst.toFixed(1)} m against 1:40)`);

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

// 4. a C-130 sortie on the real flight model, from the ramp spot onto the runway, take-off, circuit, landing
const { createC130Sim, KT } = await import('../game/js/units/air/c130fm.js');
const S = createC130Sim(), env = { groundY: (x, z) => Math.max(W.rawH(x, z), 0), water: () => false, wind: { x: 0, z: 0 } };
const e0 = A.ends[0], [tx, tz] = A.toW(e0.u + e0.dir * 60, 0), rwyYaw = A.yawOf(e0.dir, 0);
S.resetGround(tx, A.E, tz, rwyYaw); S.fuel = 9000; S.payload = 4000; S.flapSel = S.flap = 0.5;
let t = 0, liftoff = null, phase = 'roll', maxAlt = 0; const dt = 1 / 60, _l = [0, 0];
const ctl = { pitch: 0, roll: 0, yaw: 0, lever: [90, 90, 90, 90], brakeL: 0, brakeR: 0, tiller: 0 };
for (; t < 900 && !S.dead; t += dt) {
  let c = ctl;
  if (phase === 'roll') { c = { ...ctl, pitch: S.kias > 105 ? 0.55 : 0 }; if (!S.onGround) { liftoff = A.toL(S.pos.x, S.pos.z, [0, 0]); phase = 'climb'; } }
  else if (phase !== 'final' && phase !== 'flare' && phase !== 'rollout') {   // the circuit: upwind, crosswind out to -v, downwind, base
    const d = e0.dir, legs = { climb: [e0.u + d * (AB.RWY_L + 1800), 0, 'cross'], cross: [e0.u + d * (AB.RWY_L + 1800), -1700, 'down'], down: [e0.u - d * 4200, -1700, 'base'], base: [e0.u - d * 4200, 0, 'final'] };
    const [pu, pv, next] = legs[phase], [u, v] = A.toL(S.pos.x, S.pos.z, _l), [px, pz] = A.toW(pu, pv);
    const a = S.autopilot(dt, { track: Math.atan2(-(px - S.pos.x), -(pz - S.pos.z)), alt: A.E + (phase === 'base' ? 220 : 300), kias: phase === 'base' ? 140 : 170 }); c = { ...a };
    if (S.pos.y > A.E + 30) S.gearCmd = 0; if (S.pos.y > A.E + 120 && phase === 'climb') S.flapSel = 0; if (phase === 'base') S.flapSel = 0.5;
    if (Math.hypot(u - pu, v - pv) < 250) phase = next;
  }
  else if (phase === 'final' || phase === 'flare') {
    S.gearCmd = 1; S.flapSel = 1;
    const [u, v] = A.toL(S.pos.x, S.pos.z, _l), dist = (u - (e0.u + e0.dir * 300)) * -e0.dir;   // to the aiming point
    const glide = A.E + Math.max(0, dist) * Math.tan(3 * Math.PI / 180) + 2.6;
    const [px, pz] = A.toW(u + e0.dir * 700, 0);
    const a = S.autopilot(dt, { track: Math.atan2(-(px - S.pos.x), -(pz - S.pos.z)), alt: glide, kias: 120, vsMax: 4 });
    c = { ...a };
    if (S.pos.y - A.E < 9) { phase = 'flare'; c.throttle = [0, 0, 0, 0]; c.pitch = Math.max(c.pitch, 0.12); }
    if (S.onGround && (S.wow[1] > 0 || S.wow[2] > 0)) phase = 'rollout';
  } else if (phase === 'rollout') { c = { pitch: 0, roll: 0, yaw: 0, lever: [5, 5, 5, 5], brakeL: 1, brakeR: 1 }; if (Math.hypot(S.vel.x, S.vel.z) < 0.5) break; }
  maxAlt = Math.max(maxAlt, S.pos.y - A.E);
  S.step(dt, c, env);
}
const end = A.toL(S.pos.x, S.pos.z, [0, 0]);
console.log(`c-130: lift-off ${liftoff ? (liftoff[0] - (e0.u + e0.dir * 60)) * e0.dir : NaN} m from the brake release; max ${maxAlt.toFixed(0)} m; ${phase} at t=${t.toFixed(0)} s, stopped at u=${end[0].toFixed(0)} v=${end[1].toFixed(1)}  ${S.dead ? 'DEAD ' + S.dead : ''}`);
ok(liftoff && liftoff[0] * e0.dir < AB.RWY_L / 2, 'C-130 takes off from the runway');
ok(phase === 'rollout' && !S.dead && A.onRunway(S.pos.x, S.pos.z), 'C-130 lands back on the runway and stops on it');
for (const k in AB_SLOTS) { const sp = A.spot(k, 'park'); ok(!A.hitBuilding(sp.x, sp.z, 0) && A.onPavement(sp.x, sp.z), `slot ${k}: inside its hangar on paved floor`); }
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
