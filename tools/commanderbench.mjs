// node tools/commanderbench.mjs - COMMANDER: the fleet ledger (units/commander/fleet.js) and the Huey's AI pilot
// (units/commander/heliai.js) that takes a Huey the commander leaves in the air home: to a pad on land, onto the
// ALBATROSS's deck while she steams, from a fast low run and from a climb. The Huey here is the real flight model
// (hueyfm.js at 9.81, as the game flies it).
import { FM, THREE } from './hueypilot.mjs';
const { createFleet, FLEET_TYPES } = await import('../game/js/units/commander/fleet.js');
const { createHeliAI } = await import('../game/js/units/commander/heliai.js');

let fails = 0, n = 0;
const check = (name, ok, got, want) => { n++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(54)} ${got}${want ? '   (want ' + want + ')' : ''}`); if (!ok) fails++; };

// ------------------------------------------------------------------ the ledger
{
  const F = createFleet();
  check('fleet: every type starts with a reserve', FLEET_TYPES.every(t => F.n[t.id] === t.start), JSON.stringify(F.n));
  check('fleet: Huey reserve 3 (the old lives)', F.n.heli === 3, F.n.heli, 3);
  check('fleet: take one out', F.take('jet') && F.n.jet === 1, F.n.jet, 1);
  F.take('jet'); check('fleet: none left to take', !F.take('jet') && F.n.jet === 0, F.n.jet, 0);
  const S = { mat: 90 }; const why = F.buy('jet', S);
  check('fleet: materiel buys one', why === '' && F.n.jet === 1 && S.mat === 10, `${F.n.jet} / mat ${S.mat}`);
  check('fleet: too dear says so', /COSTS/.test(F.buy('tomcat', S)) && S.mat === 10, F.buy('tomcat', S));
  F.lose('jet', 'SHOT DOWN'); check('fleet: a loss is counted', F.lost.jet === 1 && F.losses() === 1, F.lost.jet, 1);
  F.give('marine'); check('fleet: a Marine stands down into reserve', F.n.marine === 7, F.n.marine, 7);
  check('fleet: not spent while reserves remain', !F.spent(), F.total());
  for (const t of FLEET_TYPES) F.n[t.id] = 0;
  check('fleet: spent with no reserve and nothing out', F.spent(() => false), 'spent');
  check('fleet: not spent while one unit is still out', !F.spent(id => id === 'm113'), 'M113 out');
  const st = createFleet().strip(id => id === 'heli');
  check('fleet: HUD strip lists out units', st.find(s => s.id === 'heli').out === 1 && st.find(s => s.id === 'jet').out === 0, st.map(s => `${s.short} ${s.n}+${s.out}`).join(' '));
}

// ------------------------------------------------------------------ the Huey AI
const DT = 1 / 60, V = (x, y, z) => new THREE.Vector3(x, y, z);
function huey(pos, vel, yaw = 0, coll = 0.42) {
  const H = FM.createHueySim(9.81); H.reset(pos, yaw, false, 1); H.vel.copy(vel); H.fuelKg = FM.UH1H.FUEL_KG * 0.7; H.c.coll = coll; return H;
}
// fly with the AI until it reports landed (and has settled) or time runs out
function run(H, AI, env, secs, ctlBase = { throttle: 1, gov: 'AUTO', fuel: true }) {
  let t = 0, td = null, maxPitch = 0, minAgl = 1e9, landedT = -1, ev = null;
  for (; t < secs; t += DT) {
    const c = AI.step(H, DT, { ground: env.ground });
    const e = H.step(DT, { ...ctlBase, ...c }, env);
    if (env.tick) env.tick(DT);
    if (e && !ev && e !== 'land') ev = e;
    if (e === 'land' && !td) td = { vy: H.vel.y, t };
    if (H.dead) return { dead: H.dead, t };
    maxPitch = Math.max(maxPitch, Math.abs(H.attitude().pitch));
    if (AI.phase === 'transit') minAgl = Math.min(minAgl, H.pos.y - env.ground(H.pos.x, H.pos.z));
    if (AI.phase === 'landed' && landedT < 0) landedT = t;
    if (landedT >= 0 && t - landedT > 3) break;
  }
  return { t, td, maxPitch, minAgl, landed: H.landed, phase: AI.phase, ev };
}
{   // 1. over land to a pad 420 m away (the pad on a 6 m plateau, a 40 m hill on the way)
  const pad = { x: 300, y: 6, z: -290 };
  const ground = (x, z) => { const hill = 40 * Math.exp(-((x - 150) ** 2 + (z + 145) ** 2) / (2 * 40 * 40)); return 6 + hill; };
  const env = { groundY: ground, water: false, ground };
  const H = huey(V(0, 60, 0), V(0, 0, -22)), AI = createHeliAI();
  AI.engage(H, () => ({ x: pad.x, y: pad.y, z: pad.z, vx: 0, vz: 0, hdg: null }));
  const r = run(H, AI, env, 120), d = Math.hypot(H.pos.x - pad.x, H.pos.z - pad.z);
  check('huey AI: lands on a pad 420 m away over a hill', !r.dead && r.landed && r.phase === 'landed', `${r.dead || r.phase} in ${r.t.toFixed(0)} s`);
  check('huey AI: on the spot (within 4 m)', d < 4, d.toFixed(1) + ' m', '< 4 m');
  check('huey AI: gentle touchdown (sink < 1.5 m/s)', r.td && r.td.vy > -1.5, r.td ? r.td.vy.toFixed(2) + ' m/s' : 'none');
  check('huey AI: clears the hill en route (> 20 m)', r.minAgl > 20, r.minAgl.toFixed(0) + ' m', '> 20 m');
  check('huey AI: no wild attitudes (pitch < 25 deg)', r.maxPitch < 25 * Math.PI / 180, (r.maxPitch * 57.3).toFixed(0) + ' deg');
  check('huey AI: collective down once landed', H.c.coll < 0.1, H.c.coll.toFixed(2));
}
{   // 2. over the sea onto a carrier deck steaming at 7 m/s (the aft helicopter spot)
  const ship = { x: 200, z: 0, yaw: Math.PI / 2, v: 7, DECK: 18 };   // bow along -x... yaw: forward = (-sin, -cos) -> (-1, 0)
  const fw = () => [-Math.sin(ship.yaw), -Math.cos(ship.yaw)];
  const local = (x, z) => { const dx = x - ship.x, dz = z - ship.z, c = Math.cos(ship.yaw), s = Math.sin(ship.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const onDeck = (x, z) => { const [lx, lz] = local(x, z); return Math.abs(lx) < 18 && Math.abs(lz) < 130; };
  const ground = (x, z) => onDeck(x, z) ? ship.DECK : 0;
  const env = {
    groundY: (x, z) => onDeck(x, z) ? ship.DECK : -20, water: (x, z) => !onDeck(x, z), ground,
    surfVel: (x, z) => onDeck(x, z) ? { vx: fw()[0] * ship.v, vy: 0, vz: fw()[1] * ship.v, w: 0, cx: ship.x, cz: ship.z } : null,
    tick: dt => { const [fx, fz] = fw(); ship.x += fx * ship.v * dt; ship.z += fz * ship.v * dt; },
  };
  const spot = () => { const lx = -2, lz = 32, c = Math.cos(ship.yaw), s = Math.sin(ship.yaw), [fx, fz] = fw(); return { x: ship.x + lx * c + lz * s, y: ship.DECK, z: ship.z - lx * s + lz * c, vx: fx * ship.v, vz: fz * ship.v, hdg: -ship.yaw }; };
  const H = huey(V(-150, 45, 120), V(15, 0, 0), -Math.PI / 2), AI = createHeliAI();
  AI.engage(H, spot);
  const r = run(H, AI, env, 150), s = spot(), d = Math.hypot(H.pos.x - s.x, H.pos.z - s.z);
  check('huey AI: lands on a deck under way (7 m/s)', !r.dead && r.landed && r.phase === 'landed' && onDeck(H.pos.x, H.pos.z), `${r.dead || r.phase} in ${r.t.toFixed(0)} s, ${r.ev || 'clean'}`);
  check('huey AI: on the aft spot (within 6 m)', d < 6, d.toFixed(1) + ' m', '< 6 m');
  check('huey AI: deck touchdown sink < 1.5 m/s', r.td && r.td.vy > -1.5, r.td ? r.td.vy.toFixed(2) + ' m/s' : 'none');
  check('huey AI: rides the deck after (no slide off)', Math.hypot(H.vel.x - fw()[0] * ship.v, H.vel.z - fw()[1] * ship.v) < 0.5, Math.hypot(H.vel.x - fw()[0] * ship.v, H.vel.z - fw()[1] * ship.v).toFixed(2) + ' m/s rel');
}
{   // 3. handed over in a fast, low, descending run (45 m/s, 25 m, sinking 4 m/s) over flat ground
  const ground = () => 0, env = { groundY: ground, water: false, ground };
  const H = huey(V(0, 25, 0), V(0, -4, -45), 0, 0.3), AI = createHeliAI();
  AI.engage(H, () => ({ x: 0, y: 0, z: -900, vx: 0, vz: 0, hdg: null }));
  let minY = 1e9; const r = run(H, { ...AI, step: (H, dt, e) => { if (AI.phase === 'transit') minY = Math.min(minY, H.pos.y); return AI.step(H, dt, e); }, get phase() { return AI.phase; } }, env, 150);
  check('huey AI: recovers a fast low descent', !r.dead && minY > 8, `lowest ${minY.toFixed(1)} m${r.dead ? ' ' + r.dead : ''}`, '> 8 m');
  check('huey AI: and lands at the spot', r.landed && AI.phase === 'landed' && Math.hypot(H.pos.x, H.pos.z + 900) < 4, `${AI.phase} ${Math.hypot(H.pos.x, H.pos.z + 900).toFixed(1)} m`);
}
{   // 4. left on the ground: it stays down (no lift-off)
  const ground = () => 0, env = { groundY: ground, water: false, ground };
  const H = FM.createHueySim(9.81); H.reset(V(0, 1.9, 0), 0, true, 1); const AI = createHeliAI(); AI.engage(H, () => ({ x: 50, y: 0, z: 0 }));
  run(H, AI, env, 5);
  check('huey AI: a landed Huey stays landed', H.landed && H.pos.y < 3, `y ${H.pos.y.toFixed(2)}`);
}
console.log(`\n${n - fails}/${n} pass`);
process.exit(fails ? 1 : 0);
