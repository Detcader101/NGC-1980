// M113A2 armoured personnel carrier: parameters for trackfm.js (same track / suspension / drivetrain sim as the M60A3),
// swimming (trim vane, bilge pumps, track propulsion), the commander's M2HB .50 cal, the rear ramp and the troop
// compartment (11 seats). PURE: no THREE, no DOM; runs in node.
//
// Tags: C = CONFIRMED in a source read for this work (AFVDB afvdatabase.com/usa/m113.html, FAS
// man.fas.org/dod-101/sys/land/m113.htm, Wikipedia M113), U = UNVERIFIED (memory / common knowledge), I = INFERRED.
// Hull frame: origin on the ground at static ride height, centre of the track contact, x right, y up, z AFT.
import { createTrackSim } from './trackfm.js';
import { makeArmor, plate, resolveHit, killState, ROUNDS } from './armorballistics.js';

const IN = 0.0254, HP = 745.7, LBFT = 1.35582;
const TROOP_KG = 95;   // a 1980 infantryman with M16A1, helmet, LBE and a light pack I

export const M113A2 = {
  name: 'M113A2',
  // combat weight 11,343 kg (AFVDB, C; FAS 24,728 lb = 11,216 kg, Wikipedia 11,740 kg - conflict). The brief's 12.3 t
  // is the combat weight plus a full squad: 11,343 + 11 x 95 = 12,388 kg. MASS here is without troops (see TROOPS).
  MASS: 11343, TROOPS: 11, TROOP_KG,
  CG: [0, 0.98, 0.0],                         // engine forward, troops aft: about mid-track (the hull floats level with the vane up) I
  I: [24e3, 28e3, 9.5e3],                    // pitch, yaw, roll kg m2: 0.85 x box 4.86 x 2.69 x 1.85 m I
  FUEL_L: 360,                               // 95 US gal C
  AERO_CDA: 5.5,
  DIM: { LEN: 191.5 * IN, WIDTH: 105.75 * IN, HEIGHT: 99.25 * IN, HULL_H: 1.85, CLEAR: 17.1 * IN },   // 4.864, 2.686, 2.52 over MG (C); hull 1.85 I; 0.434 C
  TRACK: {
    GAUGE: 85 * IN,                          // 2.159 m track centres (AFVDB) C
    WIDTH: 15 * IN,                          // T130E1 0.381 m C
    PITCH: 6 * IN, SHOES: 63,                // 6 in pitch, 63 / 64 shoes C
    THICK: 0.06, WHEEL_R: 12 * IN,           // 24 in roadwheels U
    WHEELS: [-1.22, -0.61, 0, 0.61, 1.22],   // 5 per side C; contact 2.67 m (105 in, C) with even spacing I
    FRONT: { z: -1.98, y: 0.53, r: 0.27, kind: 'sprocket', teeth: 10 },   // front drive U, 10 teeth U
    REAR: { z: 1.97, y: 0.44, r: 0.28, kind: 'idler' },
    RETURN: [],                              // no support rollers: the top run sags on the wheels U
    SPROCKET_R: 6 * IN / (2 * Math.sin(Math.PI / 10)),   // 0.2466 m pitch radius I
    J_SPROCKET: 75, RUN_K: 1.5e6, RUN_C: 3e4, INTERNAL: 0.9,    // T130 rubber-bushed track, I (tuned with top speed and 0-32 km/h)
  },
  SUSP: { K: 8.4e4, C: [1.4e4, 1.4e4, 0, 0, 1.4e4], REBOUND: 0.10, BUMP: 0.15, BUMP_K: 1.2e6, BUMP_C: 3e4 },   // I
  ENGINE: {
    // Detroit Diesel 6V53: 212 hp gross at 2800 rpm, 492 lb ft gross at 1300 rpm (AFVDB) C; net shape I (fan ~20 hp)
    IDLE: 600, GOV: 2800, CUTOFF: 2950, STALL_RPM: 330, LIGHT_RPM: 150,
    // net = gross less the cooling fan, alternator and air system (~15 %, I: the 6V53 fan is belt driven and large)
    CURVE: [[0, 0], [400, 290], [800, 490], [1300, 492 * LBFT * 0.84], [1800, 535], [2300, 495], [2800, 180 * HP / (2800 / 9.549)], [2950, 260], [3100, 0]],
    FRICTION: [30, 22], J: 1.25, KGOV: 40, TAU: 0.1,
    STARTER: 260, STARTER_RPM: 280,
    FAN_W: 32 * HP, SFC: 0.245 / 3.6e6, IDLE_FUEL: 0.0009, FUEL_DENS: 0.84,
  },
  CONV: { KF: 7.6, STALL_TR: 2.2, COUPLING: 0.86, OVERRUN: 1.1 },   // Allison TX100 converter I
  TRANS: {
    // Allison TX100-1: 3 forward, 1 reverse (C), automatic shifting within the selected range; ratios not published -> I:
    // 3rd sets 64 km/h at the governor (C), 1st the 60 % gradient (C), 0-32 km/h in 11.0 s (FAS) checks the spacing.
    ranges: { R: { ratio: -3.4 }, '1': { ratio: 4.0 }, '2': { ratio: 1.75 }, '3': { ratio: 1.0 }, '1-2': { auto: 2 }, '1-3': { auto: 3 } },
    AUTO: ["1", "2", "3"], UP_RPM: 2350, DOWN_RPM: 1150,
    FINAL: 3.95,
    LOCKUP: { ranges: ['2', '3'], SR: 0.8, ON_RPM: 1500, OFF_RPM: 1250, CAP: 1100 },
    J_TURBINE: 0.6, TURB_DRAG: 0.12, CLUTCH_CAP: 6000, SHIFT_T: 0.45,
    BRAKE: 1.6e4,
    // DS-200 controlled differential (C): steering levers ("laterals") brake one side of the differential; geared
    // regenerative steer at a fixed ratio, no pivot. 7.9 m (26 ft) minimum turning diameter (AFVDB) C -> K I.
    STEER: { REF: "output", K: 0.8, PIVOT: false, CAP: 9000 },
  },
  HULL: {
    CLEAR: 17.1 * IN, K: 1.4e6, C: 4e4,
    INTAKE_Y: 1.80, INTAKE_Z: -1.4,          // air inlet grille on the front deck, right I
    DECK_Y: 1.62, DECK_Z: -2.1,              // front edge of the deck: water over it pours in through the driver's hatch / grilles I
    PROBES: [], COLS: [],
  },
  // swimming: 5.8 km/h on its tracks (C). Trim vane up and bilge pumps on before entering the water (TM procedure, U).
  WATER: {
    SWIMS: true, VANE: true, PUMPS: false, VANE_VOL: 0.5, VANE_Y: 1.15, VANE_Z: -2.85,
    CD_X: 0.85, CD_Y: 1.1, CD_V: 1.2, FRONT_W: 2.6,
    TRACK_CA: 0.037, TRACK_LOSS: 2.2,        // paddle coefficient (m2) tuned to 5.8 km/h I
    LEAK: 0.0015, LEAK_FORD: 0.001, LEAK_OVER: 0.12, PUMP: 0.0125,   // 2 bilge pumps ~100 US gal/min each I
    MAX_INSIDE: 14, FLOOD_CREW: 0.6, RUNNING_GEAR_VOL: 0.7,
  },
  THROW_LAT: 0.6, THROW_SPEED: 8, THROW_TIME: 0.6,
  // M2HB on the commander's cupola (hull frame): pintle pivot, 2000 rounds (C)
  MG: { PIVOT: [0.25, 2.18, -0.35], RPM: 500, MV: 887, ROUNDS: 2000, BELT: 100 },
};
{
  const P = M113A2.HULL.PROBES, c = M113A2.HULL.CLEAR;
  const add = (name, p, n, mu) => { const l = Math.hypot(...n); P.push({ name, p, n: n.map(v => v / l), mu }); };
  for (const x of [-0.8, 0.8]) for (const z of [-1.9, -0.95, 0, 0.95, 1.9]) add('belly', [x, c, z], [0, -1, 0]);
  for (const x of [-0.9, 0, 0.9]) { add('nose', [x, 0.62, -2.3], [0, -0.5, -0.87]); add('glacis', [x, 1.3, -2.42], [0, 0.6, -0.8]); add('tail', [x, 0.9, 2.43], [0, -0.1, 1]); add('ramp', [x, 1.6, 2.43], [0, 0, 1]); }
  for (const s of [-1, 1]) for (const z of [-2.0, 0, 2.0]) { add('side', [s * 1.34, 1.2, z], [s, 0, 0]); add('roofEdge', [s * 1.27, 1.85, z], [s * 0.6, 0.8, 0]); }
  add('cupola', [0.25, 2.2, -0.35], [0, 1, 0]); add('roof', [0, 1.85, 0.8], [0, 1, 0]);
  // buoyancy: lower hull between the tracks (0.434..0.95), upper hull full width (0.95..1.85, sloped glacis trimmed)
  const C = M113A2.HULL.COLS;
  for (const z of [-1.6, 0, 1.6]) for (const x of [-0.445, 0.445]) {
    C.push({ x, z, ax: 0.445, az: 0.8, y0: c, y1: 0.95 });
    C.push({ x: x * 1.43, z, ax: 0.635, az: z < 0 ? 0.72 : 0.8, y0: 0.95, y1: z < 0 ? 1.68 : 1.85 });
  }
}

export function createM113Sim(opt) {
  const P = { ...M113A2, MASS: M113A2.MASS + (opt?.troops ?? M113A2.TROOPS) * TROOP_KG };
  return createTrackSim(P, opt);
}

// ======================================================================================================= armour (game)
// Aluminium hull: stops rifle fire and splinters, not much else. Game thicknesses as steel equivalents (soft: HEP
// blows through); .50 AP gets through the sides at short range.
export const M113_ARMOR = (() => {
  const P = [], H = 'hull', s45 = Math.SQRT1_2;
  P.push(plate('upperFront', H, [0, 1.45, -2.3], [0, s45, -s45], [1, 0, 0], 1.25, 0.32, 20, { soft: true }));
  P.push(plate('lowerFront', H, [0, 0.8, -2.42], [0, -0.5, -0.87], [1, 0, 0], 1.0, 0.35, 18, { soft: true }));
  for (const s of [-1, 1]) {
    P.push(plate(s < 0 ? 'sideL' : 'sideR', H, [s * 1.27, 1.4, 0], [s, 0, 0], [0, 0, 1], 2.4, 0.42, 18, { soft: true }));
    P.push(plate(s < 0 ? 'lowerSideL' : 'lowerSideR', H, [s * 1.27, 0.75, 0], [s, 0, 0], [0, 0, 1], 2.4, 0.25, 14, { soft: true, ext: s < 0 ? 'trackL' : 'trackR' }));
  }
  P.push(plate('ramp', H, [0, 1.15, 2.43], [0, 0.1, 1], [1, 0, 0], 1.2, 0.7, 16, { soft: true }));
  P.push(plate('roof', H, [0, 1.85, 0.2], [0, 1, 0], [1, 0, 0], 1.25, 2.2, 13, { soft: true }));
  P.push(plate('belly', H, [0, 0.44, 0], [0, -1, 0], [1, 0, 0], 0.9, 2.4, 11, { soft: true }));
  const C = [
    { id: 'driver', kind: 'crew', frame: H, c: [-0.65, 1.2, -1.7], h: [0.3, 0.45, 0.35] },
    { id: 'commander', kind: 'crew', frame: H, c: [0.25, 1.4, -0.4], h: [0.3, 0.6, 0.3] },
    { id: 'engine', kind: 'engine', frame: H, c: [0.5, 1.05, -1.7], h: [0.5, 0.5, 0.55] },
    { id: 'transmission', kind: 'drive', frame: H, c: [0, 0.75, -2.15], h: [0.85, 0.25, 0.2] },
    { id: 'fuel', kind: 'fuel', frame: H, c: [-0.75, 1.0, 1.6], h: [0.2, 0.45, 0.6] },
    { id: 'troopsL', kind: 'crew', frame: H, c: [-0.75, 1.15, 0.9], h: [0.3, 0.55, 1.2] },
    { id: 'troopsR', kind: 'crew', frame: H, c: [0.75, 1.15, 0.9], h: [0.3, 0.55, 1.2] },
    { id: 'radio', kind: 'radio', frame: H, c: [0.4, 1.4, 0.1], h: [0.2, 0.2, 0.2] },
    { id: 'mg', kind: 'mg', frame: H, c: [0.25, 2.2, -0.4], h: [0.3, 0.15, 0.5], ext: true },
    { id: 'trackL', kind: 'track', frame: H, c: [-1.08, 0.45, 0], h: [0.2, 0.45, 2.2], ext: true },
    { id: 'trackR', kind: 'track', frame: H, c: [1.08, 0.45, 0], h: [0.2, 0.45, 2.2], ext: true },
  ];
  return { RING: [0, 0, 0], PLATES: P, COMPS: C, TRACKS: ['trackL', 'trackR'] };
})();

// ======================================================================================================= vehicle
// createM113(opt) -> { fm, mg, ramp, troops, swim prep, crew, armor, step(dt, env, input) }.
// input = { throttle, brake, steer, range ('R'|'N'|'1'|'1-2'|'1-3'), park, starter, mgTrav, mgElev, fire50,
//           ramp (true = open), vane (true = raised), pumps (bool), dismount / mount (seat index or 'all') }
// The rear ramp is power operated (~8 s, game); the trim vane is raised from the driver's seat (~6 s, game).
export function createM113(opt = {}) {
  const troops = opt.troops ?? M113A2.TROOPS;
  const fm = createM113Sim({ ...opt, troops });
  const V = {
    fm, armor: makeArmor(M113_ARMOR, opt.seed || 11),
    mg: { az: 0, el: 0, ammo: 2000, ready: 100, t: 0, firing: false, reload: 0 },   // 2000 rounds (C), 100-round box (game)
    ramp: 0, rampWant: 0, vane: 0, vaneWant: 0,
    seats: Array.from({ length: 11 }, (_, i) => i < troops),   // 5 left bench, 5 right bench, 1 behind the commander (game layout)
    crew: { driver: 1, commander: 1 }, station: 'driver',
    elec: { batt: 1, volts: 24, gen: false }, fire: { where: null, t: 0 },
    events: [], time: 0,
  };
  const ev = V.events, hp = id => { const c = V.armor.COMPS.find(c => c.id === id); return c ? c.hp : 1; };
  const R = fm.R;
  const dirOf = (az, el, out) => { const ce = Math.cos(el), x = -Math.sin(az) * ce, y = Math.sin(el), z = -Math.cos(az) * ce; out[0] = R[0] * x + R[1] * y + R[2] * z; out[1] = R[3] * x + R[4] * y + R[5] * z; out[2] = R[6] * x + R[7] * y + R[8] * z; return out; };
  V.mgDir = (out = [0, 0, 0]) => dirOf(V.mg.az, V.mg.el, out);
  V.step = (dt, env, inp = {}) => {
    ev.length = 0; V.time += dt;
    V.crew.driver = hp('driver'); V.crew.commander = hp('commander');
    fm.dmg.engine = hp('engine'); fm.dmg.trans = hp('transmission');
    if (hp('trackL') <= 0) fm.dmg.thrown[0] = true; if (hp('trackR') <= 0) fm.dmg.thrown[1] = true;
    const drv = V.crew.driver > 0;
    Object.assign(fm.ctl, {
      throttle: drv ? inp.throttle ?? fm.ctl.throttle : 0, brake: drv ? inp.brake ?? 0 : 0.3, steer: drv ? inp.steer ?? 0 : 0,
      range: drv ? inp.range ?? fm.ctl.range : 'N', park: inp.park ?? fm.ctl.park, starter: !!inp.starter, fuelOn: inp.fuelOn ?? fm.ctl.fuelOn,
    });
    // ramp, vane, pumps
    if (inp.ramp !== undefined) V.rampWant = inp.ramp ? 1 : 0;
    if (inp.vane !== undefined) V.vaneWant = inp.vane ? 1 : 0;
    if (inp.pumps !== undefined) fm.water.pumps = !!inp.pumps;
    const pwr = V.elec.batt > 0.05;
    if (pwr) V.ramp += Math.max(-dt / 8, Math.min(dt / 8, V.rampWant - V.ramp));
    V.vane += Math.max(-dt / 6, Math.min(dt / 6, V.vaneWant - V.vane));
    fm.water.vane = V.vane > 0.95;
    // an open ramp lets water in when afloat / fording deep (game): treat as a big leak via the deck line
    fm.water.rampOpen = V.ramp > 0.05;
    for (const e of fm.step(dt, env)) ev.push(e);
    if (fm.water.rampOpen && fm.water.depth > 0.6) { fm.water.inside = Math.min(14, fm.water.inside + dt * 0.3 * V.ramp); }
    const el = V.elec; el.gen = fm.eng.running && fm.eng.w * 9.549 > 900;
    el.batt = Math.max(0, Math.min(1, el.batt + (el.gen ? 0.004 : -(fm.water.pumps ? 0.0006 : 0.0001)) * dt)); el.volts = el.gen ? 28 : 22 + 3 * el.batt;
    // the commander's M2HB on its cupola (manual traverse, game rates)
    const m = V.mg, cmd = V.crew.commander > 0 && hp('mg') > 0;
    if (cmd) { m.az += -(inp.mgTrav || 0) * 0.8 * dt; m.el = Math.max(-0.17, Math.min(0.9, m.el + (inp.mgElev || 0) * 0.5 * dt)); }
    m.t = Math.max(0, m.t - dt); m.firing = !!inp.fire50 && cmd && m.ready > 0;
    while (m.firing && m.t <= 0 && m.ready > 0) {
      m.t += 60 / M113A2.MG.RPM; m.ready--; m.ammo--;
      const dir = V.mgDir([0, 0, 0]), pv = M113A2.MG.PIVOT, p = fm.toWorld([pv[0] - Math.sin(m.az) * 0.9, pv[1] + 0.05, pv[2] - Math.cos(m.az) * 0.9]);
      ev.push({ type: 'shot', weapon: 'mg50', round: 'M2AP', p, dir, v0: ROUNDS.M2AP.mv, tracer: m.ammo % 5 === 0 });
    }
    if (m.ready <= 0 && m.ammo > 0 && !m.reload) m.reload = 7;
    if (m.reload) { m.reload -= dt; if (m.reload <= 0) { m.reload = 0; m.ready = Math.min(M113A2.MG.BELT, m.ammo); } }
    // troops: mount / dismount through the ramp (open)
    if (inp.dismount !== undefined && V.ramp > 0.9) { const idx = inp.dismount === 'all' ? V.seats.map((s, i) => s ? i : -1).filter(i => i >= 0) : [inp.dismount]; for (const i of idx) if (V.seats[i]) { V.seats[i] = false; ev.push({ type: 'dismount', seat: i }); } }
    if (inp.mount !== undefined && V.ramp > 0.9) { const i = inp.mount === 'any' ? V.seats.indexOf(false) : inp.mount; if (i >= 0 && !V.seats[i]) { V.seats[i] = true; ev.push({ type: 'mount', seat: i }); } }
    return ev;
  };
  V.hit = h => { const r = resolveHit(V.armor, h, { az: 0 }); for (const e of r.events) if (e.type === 'fire' && !V.fire.where) V.fire.where = e.where; r.kill = killState(V.armor); return r; };
  V.reset = (x, z, yaw, env, o) => { fm.reset(x, z, yaw, env, o); V.ramp = V.rampWant = o?.ramp ? 1 : 0; V.vane = V.vaneWant = o?.vane ? 1 : 0; fm.water.vane = V.vane > 0.95; fm.water.pumps = !!o?.pumps; return V; };
  return V;
}
