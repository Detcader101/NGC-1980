// M113A2 armoured personnel carrier: parameters for trackfm.js (same track / suspension / drivetrain sim as the M60A3),
// swimming (trim vane, bilge pumps, track propulsion), the commander's M2HB .50 cal, the rear ramp and the troop
// compartment (11 seats). PURE: no THREE, no DOM; runs in node.
//
// Tags: C = CONFIRMED in a source read for this work (AFVDB afvdatabase.com/usa/m113.html, FAS
// man.fas.org/dod-101/sys/land/m113.htm, Wikipedia M113), U = UNVERIFIED (memory / common knowledge), I = INFERRED.
// Hull frame: origin on the ground at static ride height, centre of the track contact, x right, y up, z AFT.
import { createTrackSim } from './trackfm.js';

const IN = 0.0254, HP = 745.7, LBFT = 1.35582;
const TROOP_KG = 95;   // a 1980 infantryman with M16A1, helmet, LBE and a light pack I

export const M113A2 = {
  name: 'M113A2',
  // combat weight 11,343 kg (AFVDB, C; FAS 24,728 lb = 11,216 kg, Wikipedia 11,740 kg - conflict). The brief's 12.3 t
  // is the combat weight plus a full squad: 11,343 + 11 x 95 = 12,388 kg. MASS here is without troops (see TROOPS).
  MASS: 11343, TROOPS: 11, TROOP_KG,
  CG: [0, 0.98, -0.1],                       // engine front right, troops aft: CG slightly forward I
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
    J_SPROCKET: 75, RUN_K: 1.5e6, RUN_C: 3e4, INTERNAL: 1.25,   // T130 rubber-bushed track: high internal losses I (tuned with 0-32 km/h)
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
    ranges: { R: { ratio: -3.4 }, '1': { ratio: 3.3 }, '2': { ratio: 1.62 }, '3': { ratio: 1.0 }, '1-2': { auto: 2 }, '1-3': { auto: 3 } },
    AUTO: ['1', '2', '3'], UP_RPM: 2550, DOWN_RPM: 1150,
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
