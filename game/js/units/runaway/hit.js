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

// Penetration when the shooter did not give one: a GAME-TUNED value (arbitrary 'armour points', not real-world
// terminal ballistics). Light rounds scratch machine plates, heavy rounds and launchers break them.
export function estimatePen(h) {
  if (h.type === 'heat') return h.pen ?? 300;
  if (h.type === 'blast') return 0;
  const d = Math.max(1, h.calibre), ed = h.energy / (d * d);
  const k = { ball: 0.14, ap: 0.24, frag: 0.08, coil: 0.3 }[h.type] ?? 0.14;
  return k * ed;
}

// Armour test for one plate (game rule): { residual: fraction of energy that gets through (0..1), defeated: bool }.
// Obliquity thickens the plate, a partial overmatch lets some energy through.
export function armourTest(h, mmRHA, normal) {
  let t = mmRHA;
  if (normal) { const c = Math.abs(h.direction.x * normal.x + h.direction.y * normal.y + h.direction.z * normal.z); t = mmRHA / Math.max(0.25, c); }
  if (t <= 0) return { residual: 1, defeated: true, t };
  const r = h.pen / t;
  if (r >= 1) return { residual: Math.min(1, 0.35 + 0.65 * (r - 1) / r), defeated: true, t };
  return { residual: Math.max(0, (r - 0.6) / 0.4) * 0.15, defeated: false, t };   // near misses still jolt a little
}

// Damage the hit does to a machine part (hit points), after armour (game rule: 1 hp per 120 J that gets through).
export function machineDamage(h, armourMM, normal, hpPerJ = 1 / 120) {
  const a = armourTest(h, armourMM, normal);
  let e = h.energy * a.residual;
  if (h.type === 'heat' && a.defeated) e = Math.max(e, 60000);
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

// Ammunition the sandbox and the AI use. GAME-TUNED values (round classes for feel and balance, deliberately not
// researched real-world performance): 'speed' drives travel time / drop, 'mass' x speed drives knock-back, 'pen' is
// in the same arbitrary armour points as the STRIDER / tank plates. The INFANTRY agent's ballistics replace the 1980
// rows in wave 2.
export const AMMO = {
  // 1980 task force (stand-ins for the sandbox dummies)
  rifle: { calibre: 5.6, mass: 0.004, velocity: 900, type: 'ball' },
  mg: { calibre: 7.6, mass: 0.009, velocity: 820, type: 'ball' },
  hmg: { calibre: 12.7, mass: 0.045, velocity: 850, type: 'ap' },
  law: { calibre: 66, mass: 1.0, velocity: 150, type: 'heat', pen: 300 },
  tankgun: { calibre: 105, mass: 10, velocity: 1100, type: 'heat', pen: 400 },
  // RUNAWAY
  xm7: { calibre: 6.8, mass: 0.009, velocity: 900, type: 'ap' },      // seized rifle
  needle: { calibre: 4, mass: 0.004, velocity: 1600, type: 'coil' },   // RW coil carbine dart (fictional)
  coil120: { calibre: 30, mass: 3.0, velocity: 2400, type: 'coil', pen: 650 },   // RW-7 main coilgun slug (fictional)
  mbt120: { calibre: 120, mass: 5, velocity: 1500, type: 'ap', pen: 650 },       // seized M1A2 main gun (game value)
  mbt125: { calibre: 125, mass: 5, velocity: 1500, type: 'ap', pen: 600 },       // seized T-90M main gun (game value)
  pd: { calibre: 8, mass: 0.02, velocity: 1100, type: 'frag' },                 // RW-7 point-defence burst (fictional)
};
export const hitFromAmmo = (id, o) => normalizeHit({ ...AMMO[id], weapon: id, ...o });
