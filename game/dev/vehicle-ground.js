// The wheeled-vehicle test ground (pure maths, no THREE): one analytic terrain for the physics and the renderer.
// World: x east, z south (vehicles spawn facing north = -z), water surface at y = 0 in the ford.
// Zones (all reachable from the north-south tarmac road at x = 0):
//   road      tarmac straight x -4..4, z -300..200 (speed, braking), crossroad z 96..104 east-west
//   dirt      a hilly dirt loop, centre (95, -70), radius 50, 7 m wide
//   sand      dunes x -75..-25, z -70..-15
//   mud       a wallow x -75..-25, z 0..40, 0.3 m down
//   slopes    three concrete ramps 20 / 40 / 60 % up to a 4 m plateau, x 25..75 (lanes z 18-26, 32-40, 46-54)
//   bumps     x -16..-9, z -40..-170: washboard, staggered bumps, logs, potholes, a 25 cm kerb, a twist ditch
//   sideslope 25 % side slope x -120..-85, z -60..20 (drive along it, north-south)
//   ford      a pond centre (-45, 140), 0.5 m shelf, 1.7 m deep middle, banks 1 in 6, entered from the crossroad
export const SURF_ID = { tarmac: 0, wet: 1, dirt: 2, grass: 3, sand: 4, mud: 5, deck: 6, rock: 7, snow: 8 };
const S = SURF_ID;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const box = (x, z, x0, x1, z0, z1, f = 2) => sstep(x0 - f, x0, x) * (1 - sstep(x1, x1 + f, x)) * sstep(z0 - f, z0, z) * (1 - sstep(z1, z1 + f, z));
const inside = (x, z, x0, x1, z0, z1) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

export const ZONES = {
  road: { x: 0, z: 150, yaw: 0, label: 'road' }, dirt: { x: 45, z: -70, yaw: 0, label: 'dirt loop' }, sand: { x: -20, z: -45, yaw: Math.PI / 2, label: 'sand' },
  mud: { x: -20, z: 20, yaw: Math.PI / 2, label: 'mud' }, slope20: { x: 12, z: 22, yaw: -Math.PI / 2, label: '20% ramp' }, slope40: { x: 12, z: 36, yaw: -Math.PI / 2, label: '40% ramp' },
  slope60: { x: 12, z: 50, yaw: -Math.PI / 2, label: '60% ramp' }, bumps: { x: -12.5, z: -30, yaw: 0, label: 'bump course' }, sideslope: { x: -102, z: 30, yaw: 0, label: '25% side slope' },
  ford: { x: -45, z: 108, yaw: Math.PI, label: 'ford' }, start: { x: 0, z: 60, yaw: 0, label: 'start' },
};

// rolling grass everywhere else
const base = (x, z) => 0.45 * Math.sin(x / 23 + 1) * Math.cos(z / 31) + 0.22 * Math.sin((x + z) / 13) + 0.12 * Math.sin(x / 5.3) * Math.sin(z / 6.1);
const DIRT = { cx: 95, cz: -70, r: 50, w: 3.5 };
const POND = { cx: -45, cz: 140, rx: 26, rz: 17 };
const RAMPS = [{ z0: 18, z1: 26, g: 0.2 }, { z0: 32, z1: 40, g: 0.4 }, { z0: 46, z1: 54, g: 0.6 }];

// the bump course along z (going north = decreasing z): returns the bump height at (x, z) relative to the course floor
function bumps(x, z) {
  const t = -40 - z;   // distance along the course from its start
  if (t < 0 || t > 130 || x < -16 || x > -9) return 0;
  const lx = x + 12.5;   // lateral, 0 = centreline
  if (t < 20) return 0.035 * (0.5 + 0.5 * Math.cos((t % 0.9) / 0.9 * Math.PI * 2));                                   // washboard
  if (t < 40) { const k = Math.floor((t - 20) / 3), u = ((t - 20) % 3) / 3, s = k % 2 ? 1 : -1; return lx * s > 0 ? 0.15 * Math.sin(Math.PI * Math.min(1, u * 2)) ** 2 * (u < 0.5 ? 1 : 0) : 0; }   // staggered bumps
  if (t < 64) { const u = ((t - 40) % 4) - 2; return Math.abs(u) < 0.18 ? Math.sqrt(0.18 * 0.18 - u * u) : 0; }      // logs (r 0.18)
  if (t < 80) { const u = ((t - 64) % 4) - 2, d = Math.hypot(u, (lx - (Math.floor((t - 64) / 4) % 2 ? 0.7 : -0.7)) * 0.8); return d < 0.6 ? -0.18 * (1 - (d / 0.6) ** 2) : 0; }   // potholes
  if (t < 100) return (t > 84 && t < 92) ? 0.25 : 0;                                                                   // a 25 cm kerb / step up and down
  if (t < 130) { const u = t - 100; const d = (u - 5 - lx * 1.2); const e = (u - 17 + lx * 1.2); return 0.4 * Math.max(0, 1 - (d / 2.2) ** 2) + 0.4 * Math.max(0, 1 - (e / 2.2) ** 2); }   // twist ditch: diagonal humps
  return 0;
}

// height and surface. Returns h; writes the surface to out.surf if given
export function heightAt(x, z, out) {
  let h = base(x, z), surf = S.grass;
  // dirt loop (a ring), with hills along it
  const dr = Math.hypot(x - DIRT.cx, z - DIRT.cz), da = Math.atan2(z - DIRT.cz, x - DIRT.cx);
  const ring = 1 - sstep(DIRT.w, DIRT.w + 3, Math.abs(dr - DIRT.r));
  if (ring > 0) { h = h * (1 - ring) + ring * (1.8 * Math.sin(da * 3) + 0.6 * Math.sin(da * 7)); if (Math.abs(dr - DIRT.r) < DIRT.w) surf = S.dirt; }
  // sand dunes and the mud wallow
  const sb = box(x, z, -75, -25, -70, -15, 4); if (sb > 0) { h = h * (1 - sb) + sb * (0.6 * Math.sin(x / 4.5) * Math.sin(z / 6.5) + 0.35 * Math.sin((x - z) / 3.1) + 0.3); if (inside(x, z, -75, -25, -70, -15)) surf = S.sand; }
  const mb = box(x, z, -75, -25, 0, 40, 3); if (mb > 0) { h = h * (1 - mb) + mb * (-0.3 + 0.08 * Math.sin(x * 1.3) * Math.sin(z * 0.9)); if (inside(x, z, -75, -25, 0, 40)) surf = S.mud; }
  // side slope strip: 25% falling to the east
  const ss = box(x, z, -120, -85, -60, 20, 5); if (ss > 0) { h = h * (1 - ss) + ss * ((-85 - x) * 0.25 - 2); if (inside(x, z, -120, -85, -60, 20)) surf = S.grass; }
  // concrete ramps: up from x = 25 at grade g to 4 m, a 6 m plateau, down again
  for (const r of RAMPS) {
    const L = 4 / r.g, x1 = 25 + L, x2 = x1 + 6, x3 = x2 + L;
    if (z >= r.z0 - 1 && z <= r.z1 + 1 && x >= 24 && x <= x3 + 1) {
      const k = 1 - sstep(r.z1, r.z1 + 1, z) * 1 - (1 - sstep(r.z0 - 1, r.z0, z));
      const rh = x < 25 ? 0 : x < x1 ? (x - 25) * r.g : x < x2 ? 4 : x < x3 ? 4 - (x - x2) * r.g : 0;
      h = h * (1 - k) + k * rh; if (z >= r.z0 && z <= r.z1 && x >= 25 && x <= x3) surf = S.tarmac;
    }
  }
  // the ford: a shelf at -0.5 then a deep middle (-1.7), banks 1 in 6
  const pr = Math.hypot((x - POND.cx) / POND.rx, (z - POND.cz) / POND.rz);
  if (pr < 1.6) {
    const edge = (pr - 1) * Math.min(POND.rx, POND.rz);   // metres outside (+) / inside (-) the waterline
    const bed = edge > 0 ? Math.min(edge / 6, 0.6) : Math.max(-0.5, edge / 6) - 1.2 * (1 - sstep(0.15, 0.6, pr));
    const k = 1 - sstep(1.3, 1.6, pr);
    h = h * (1 - k) + k * bed; if (pr < 1.05) surf = pr < 0.9 ? S.mud : S.dirt;
  }
  // roads last (they cut through everything): flat tarmac with a dirt shoulder
  const road = (1 - sstep(4, 6, Math.abs(x))) * (z > -300 && z < 200 ? 1 : 0), cross = (1 - sstep(4, 6, Math.abs(z - 100))) * (Math.abs(x) < 150 ? 1 : 0);
  const rk = Math.max(road, cross);
  if (rk > 0) { h = h * (1 - rk) + rk * (0.02 - 0.0004 * (Math.abs(x) < 4 ? x * x : (z - 100) ** 2)); if (Math.abs(x) < 4 && z > -300 && z < 200 || Math.abs(z - 100) < 4 && Math.abs(x) < 150) surf = S.tarmac; else if (rk > 0.5) surf = S.dirt; }
  // the bump course strip (a dirt lane west of the road)
  if (x > -17 && x < -8 && z < -38 && z > -172) { const k = sstep(-17, -16, x) * (1 - sstep(-9, -8, x)); h = h * (1 - k) + k * (0.02 + bumps(x, z)); if (x > -16 && x < -9) surf = S.dirt; }
  if (out) out.surf = surf;
  return h;
}
const _o = {};
// the vehiclefm env.ground: height, normal by central differences, surface
export function groundAt(x, z, out) {
  const h = heightAt(x, z, out), e = 0.06;
  const hx = heightAt(x + e, z, _o) - heightAt(x - e, z, _o), hz = heightAt(x, z + e, _o) - heightAt(x, z - e, _o);
  const nx = -hx / (2 * e), nz = -hz / (2 * e), l = Math.hypot(nx, 1, nz);
  out.h = h; out.nx = nx / l; out.ny = 1 / l; out.nz = nz / l; out.vx = out.vy = out.vz = 0;
  return out;
}
export const waterAt = (x, z) => Math.hypot((x - POND.cx) / POND.rx, (z - POND.cz) / POND.rz) < 1.0 ? 0 : -Infinity;
export const POND_SHAPE = POND, DIRT_LOOP = DIRT, RAMP_LANES = RAMPS;
export function makeEnv(extra = {}) { return { g: 9.81, ground: groundAt, water: waterAt, ...extra }; }
