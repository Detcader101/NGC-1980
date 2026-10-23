// RUNAWAY ground forces: the HIT-INFO contract and machine armour. Pure (no THREE, no DOM); runs in node.
//
// One structure describes anything that strikes a unit, so the 1980 infantry's ballistics (INFANTRY agent,
// game/js/units/infantry/ballistics.js) and the RUNAWAY weapons can hit each other's units without knowing each other:
//
//   hit = {
//     calibre:   mm, bore / projectile diameter (5.56, 7.62, 12.7, 66 for the M72 LAW warhead, 0 for blast)
//     mass:      kg, projectile (or fragment) mass
//     velocity:  m/s, speed at impact (scalar)
//     energy:    J, kinetic energy at impact (0.5 m v^2 if left out; for blast, the equivalent impulse energy)
//     direction: {x, y, z} unit vector, direction of travel at impact (world, three.js axes: y up)
//     part:      body part hit (see PARTS) or null = "work it out from point" (resolvePart)
//     point:     {x, y, z} world impact point (optional; used for impulse torque and part lookup)
//     type:      'ball' | 'ap' | 'heat' | 'frag' | 'blast' | 'coil'     (default 'ball')
//     pen:       mm RHA the projectile defeats at this velocity (optional; estimated from energy density if absent)
//     impulse:   N s pushed into the target (optional; mass * velocity if absent, a blast sets it explicitly)
//     side:      firing side (1 task force, 2 RUNAWAY), weapon: id string, src: shooter id   (bookkeeping)
//   }
//
// Accepted variants (normalizeHit): `dir` or `direction` as {x,y,z} or [x,y,z]; `vel` as a velocity vector (gives
// velocity and direction); `calibre` or `caliber`. Body parts follow the infantry convention (Tarkov-style zones):
// head, thorax, stomach, armL, armR, legL, legR; machines add 'weapon', and vehicles use hull/turret/... (see the sims).

export const PARTS = ['head', 'thorax', 'stomach', 'armL', 'armR', 'legL', 'legR', 'weapon'];

const len = v => Math.hypot(v.x, v.y, v.z) || 1;
const vec = v => Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v ? { x: v.x, y: v.y, z: v.z } : null;

// Build a hit from the essentials. Everything not given is derived.
export function makeHit(o) { return normalizeHit(o); }
export function normalizeHit(o) {
  const h = { calibre: o.calibre ?? o.caliber ?? 0, mass: o.mass ?? 0, velocity: o.velocity ?? 0, energy: o.energy ?? 0,
    direction: null, part: o.part ?? null, point: vec(o.point || o.pos), type: o.type || 'ball', pen: o.pen ?? null,
    impulse: o.impulse ?? null, side: o.side ?? 0, weapon: o.weapon || '', src: o.src ?? null };
  let d = vec(o.direction || o.dir);
  if (o.vel) { const v = vec(o.vel), s = len(v); if (!h.velocity) h.velocity = s; if (!d) d = { x: v.x / s, y: v.y / s, z: v.z / s }; }
  if (!d) d = { x: 0, y: 0, z: -1 };
  const l = len(d); h.direction = { x: d.x / l, y: d.y / l, z: d.z / l };
  if (!h.energy) h.energy = 0.5 * h.mass * h.velocity * h.velocity;
  if (h.impulse == null) h.impulse = h.mass * h.velocity;
  if (h.pen == null) h.pen = estimatePen(h);
  return h;
}

// Penetration estimate (mm RHA) when the shooter's ballistics did not give one. Energy density E / d^2 scaled by
// projectile type; anchored to commonly quoted figures (all INFERRED orders of magnitude, not a terminal-ballistics
// model): 5.56 M855 ~9 mm mild steel at 100 m, 7.62x51 ball ~8 mm RHA, .50 M2 AP ~20-25 mm RHA at 100 m,
// 6.8x51 (XM7) ~12 mm, M72 LAW HEAT ~300 mm (TM 9-1340-214), 120 mm APFSDS ~600+ mm.
export function estimatePen(h) {
  if (h.type === 'heat') return h.pen ?? 300;
  if (h.type === 'blast') return 0;
  const d = Math.max(1, h.calibre), ed = h.energy / (d * d);   // J / mm^2
  const k = { ball: 0.14, ap: 0.24, frag: 0.08, coil: 0.3 }[h.type] ?? 0.14;
  return k * ed;
}

// Armour test for one plate: { residual: fraction of energy that gets through (0..1), defeated: bool }. Obliquity
// thickens the plate (cos law, normal = outward plate normal), a partial overmatch lets some energy through.
export function armourTest(h, mmRHA, normal) {
  let t = mmRHA;
  if (normal) { const c = Math.abs(h.direction.x * normal.x + h.direction.y * normal.y + h.direction.z * normal.z); t = mmRHA / Math.max(0.25, c); }
  if (t <= 0) return { residual: 1, defeated: true, t };
  const r = h.pen / t;
  if (r >= 1) return { residual: Math.min(1, 0.35 + 0.65 * (r - 1) / r + 0.0), defeated: true, t };
  return { residual: Math.max(0, (r - 0.6) / 0.4) * 0.15, defeated: false, t };   // near misses spall a little
}

// Damage the hit does to a machine part (hit points), after armour. Machines take damage from energy put into the
// part (J -> hp at 1 hp per 120 J for internals), heavily reduced if the plate holds. Returns { dmg, pen, residual }.
export function machineDamage(h, armourMM, normal, hpPerJ = 1 / 120) {
  const a = armourTest(h, armourMM, normal);
  let e = h.energy * a.residual;
  if (h.type === 'heat' && a.defeated) e = Math.max(e, 60000);   // the jet does the work, not the case
  if (h.type === 'blast') e = h.energy * 0.6;
  return { dmg: e * hpPerJ, pen: a.defeated, residual: a.residual, t: a.t };
}

// Which part a point hits on an upright biped (local height above the feet, lateral offset): for shooters that only
// know where the round went. hgt in m over the ground, lat = signed metres to the body's left (+) / right (-),
// H = standing height of the body.
export function resolvePart(hgt, lat, H = 2.0) {
  const u = hgt / H;
  if (u > 0.88) return 'head';
  if (u > 0.62) return Math.abs(lat) > 0.24 ? (lat > 0 ? 'armL' : 'armR') : 'thorax';
  if (u > 0.5) return Math.abs(lat) > 0.26 ? (lat > 0 ? 'armL' : 'armR') : 'stomach';
  return lat > 0 ? 'legL' : 'legR';
}

// Ammunition the sandbox and the AI use (published figures where real; CONFIRMED / INFERRED / UNVERIFIED tagged).
export const AMMO = {
  // 1980 task force
  m193: { calibre: 5.56, mass: 0.00356, velocity: 991, type: 'ball' },   // M16A1, M193 55 gr at 991 m/s CONFIRMED (TM 9-1005-249-10)
  m80: { calibre: 7.62, mass: 0.0095, velocity: 853, type: 'ball' },     // M60, M80 147 gr ~853 m/s CONFIRMED (FM 23-67)
  m2ap: { calibre: 12.7, mass: 0.0459, velocity: 887, type: 'ap' },      // M2HB, M2 AP 708 gr ~887 m/s CONFIRMED (TM 9-1005-213-10)
  m72: { calibre: 66, mass: 1.0, velocity: 145, type: 'heat', pen: 300 },// M72 LAW: 145 m/s, ~300 mm RHA CONFIRMED order (TM 9-1340-214-10)
  m456: { calibre: 105, mass: 10.5, velocity: 1173, type: 'heat', pen: 400 }, // M60A3 M68 105 mm HEAT M456: 1173 m/s CONFIRMED, pen INFERRED
  // RUNAWAY
  xm7: { calibre: 6.8, mass: 0.00875, velocity: 914, type: 'ap' },      // seized XM7 rifle, 6.8x51 135 gr ~3000 ft/s INFERRED (SIG published 16" figure)
  needle: { calibre: 4, mass: 0.004, velocity: 1600, type: 'coil' },     // RW coil carbine dart: fictional, 5.1 kJ (design value)
  coil120: { calibre: 30, mass: 3.0, velocity: 2400, type: 'coil', pen: 650 },   // RW-7 main coilgun slug: fictional, 8.6 MJ (design value)
  m829: { calibre: 120, mass: 4.6, velocity: 1555, type: 'ap', pen: 700 },      // M1A2 M256, M829A3 penetrator ~1555 m/s CONFIRMED (Army fact files), pen INFERRED
  bm60: { calibre: 125, mass: 4.9, velocity: 1660, type: 'ap', pen: 600 },      // T-90M 2A46M-5, 3BM60 UNVERIFIED
  pd: { calibre: 8, mass: 0.02, velocity: 1100, type: 'frag' },                 // RW-7 point-defence flechette burst (design value)
};
export const hitFromAmmo = (id, o) => normalizeHit({ ...AMMO[id], weapon: id, ...o });
