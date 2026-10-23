// Wheeled vehicles: one registry for the host (FOUNDATION / WORLD) and the dev page.
//   import { WHEELED, createWheeled } from './units/wheeled/index.js';
//   const v = createWheeled('m151', { variant: { top: 'canvas' } });   // -> { spec, sim, driver, model, dmg, look() }
//   v.sim.reset([x, y, z], yaw); v.sim.placeOnGround(env);
//   each frame: const ctl = v.driver.update(v.sim, input, dt); v.sim.step(dt, ctl, env); v.sync(); (copies pose + animates)
// Pure parts (spec, sim, driver, damage) load in node; the model needs THREE (browser).
import { createVehicleSim } from './vehiclefm.js';
import { createDriver } from './driver.js';
import { createDamage } from './vehicledamage.js';
import { M151 } from './m151.js';
import { M35 } from './m35.js';
import { LANDROVER, HILUX, BEETLE, LADA } from './civilian.js';

// id -> { spec, model: () => import of the model module + builder name, variants }
export const WHEELED = {
  m151: { spec: M151, model: ['./m151model.js', 'buildM151Mesh'], interior: ['./interior.js', 'buildInterior'], variants: { screen: ['up', 'down'], top: ['off', 'canvas'], mount: ['m60', 'none'] } },
  m35: { spec: M35, model: ['./m35model.js', 'buildM35Mesh'], interior: ['./interior.js', 'buildInterior'], variants: { cover: ['canvas', 'bows', 'off'], ring: [false, true], seats: ['down', 'up'] } },
  landrover: { spec: LANDROVER, model: ['./civmodel.js', 'buildCivMesh'], interior: ['./interior.js', 'buildInterior'], variants: { colour: [0, 1, 2, 3, 4], tilt: [true, false] } },
  hilux: { spec: HILUX, model: ['./civmodel.js', 'buildCivMesh'], interior: ['./interior.js', 'buildInterior'], variants: { colour: [0, 1, 2, 3, 4] } },
  beetle: { spec: BEETLE, model: ['./civmodel.js', 'buildCivMesh'], interior: ['./interior.js', 'buildInterior'], variants: { colour: [0, 1, 2, 3, 4, 5] } },
  lada: { spec: LADA, model: ['./civmodel.js', 'buildCivMesh'], interior: ['./interior.js', 'buildInterior'], variants: { colour: [0, 1, 2, 3, 4, 5] } },
};
export const WHEELED_IDS = Object.keys(WHEELED);
export { createFollower, aiInput } from './driver.js';
export { LODS } from './vehiclefm.js';
export { SURF, SURF_NAMES } from './tyre.js';

// For the host: build the vehiclefm env from the game's own terrain functions (node-safe).
//   height(x, z) -> m; surface(x, z) -> 'tarmac' | 'dirt' | ... | SURF index (default 'grass' on land, 'deck' on decks);
//   water(x, z) -> water surface height or -Infinity; deck(x, z, out) -> fills { h, vx, vy, vz } and returns true when a
//   moving deck (carrier, landing craft) is under the point; collide(x, y, z, r, out) as documented in vehiclefm.js.
// Normals come from central differences of height (eps 0.08 m); give normal(x, z, out) to supply your own.
export function makeTerrainEnv({ height, surface, water, deck, collide, normal, g = 9.0, eps = 0.08 } = {}) {
  const d = { h: 0, vx: 0, vy: 0, vz: 0 };
  return {
    g, water, collide,
    ground(x, z, out) {
      out.vx = out.vy = out.vz = 0; out.mu = 1;
      if (deck && deck(x, z, d)) { out.h = d.h; out.nx = 0; out.ny = 1; out.nz = 0; out.surf = 'deck'; out.vx = d.vx || 0; out.vy = d.vy || 0; out.vz = d.vz || 0; return out; }
      out.h = height(x, z);
      if (normal) normal(x, z, out);
      else { const hx = height(x + eps, z) - height(x - eps, z), hz = height(x, z + eps) - height(x, z - eps), nx = -hx / (2 * eps), nz = -hz / (2 * eps), l = Math.hypot(nx, 1, nz); out.nx = nx / l; out.ny = 1 / l; out.nz = nz / l; }
      out.surf = surface ? surface(x, z) : 'grass';
      return out;
    },
  };
}

// the pure half: sim + driver + damage for a vehicle id (node-safe). o: { mode: 'auto'|'semi'|'manual', sub, probes, lod }
export function createWheeledSim(id, o = {}) {
  const E = WHEELED[id]; if (!E) throw new Error('unknown wheeled vehicle ' + id);
  const sim = createVehicleSim(E.spec, { sub: o.sub, probes: o.probes });
  const driver = createDriver(E.spec, o.mode || 'auto');
  const dmg = createDamage(E.spec, sim); sim.dmg = dmg;
  if (o.lod) sim.setLod(o.lod);
  return { id, spec: E.spec, sim, driver, dmg };
}
// the full vehicle with its model (browser): async because the model modules load on demand
export async function createWheeled(id, o = {}) {
  const v = createWheeledSim(id, o), E = WHEELED[id];
  const [mm, fn] = E.model, mod = await import(mm);
  const model = mod[fn](E.spec === v.spec && fn === 'buildCivMesh' ? { spec: v.spec, ...(o.variant || {}) } : (o.variant || {}));
  let interior = null;
  if (o.interior !== false && E.interior) { const im = await import(E.interior[0]); interior = im[E.interior[1]](v.spec, model); }
  const { lookFrom } = await import('./modelkit.js');
  const out = {
    ...v, model, interior,
    look: () => lookFrom(v.sim, v.sim.lastCtl || {}),
    // copy the sim pose onto the model group and animate the moving parts
    sync(dt = 0, inside = false) {
      const g = model.group; g.position.set(v.sim.pos[0], v.sim.pos[1], v.sim.pos[2]); g.quaternion.set(v.sim.q[0], v.sim.q[1], v.sim.q[2], v.sim.q[3]);
      const L = out.look(); model.animate(L, dt); if (interior) interior.update(L, dt, inside);
      for (const s of model.shell || []) s.visible = !inside;
      return L;
    },
  };
  return out;
}
