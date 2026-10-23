// M60A3 TTS main battle tank: parameters for trackfm.js, plus the turret, gun stabilisation, fire control, ammunition,
// loader and crew (createM60A3). PURE: no THREE, no DOM; runs in node (tools/tankbench.mjs).
//
// Sources and tags (every number below carries one):
//   C  = CONFIRMED in a source read for this work: AFVDB (afvdatabase.com/usa/m60.html, follows Hunnicutt "Patton"),
//        FAS (man.fas.org/dod-101/sys/land/m60.htm), Wikipedia M60 (cites Foss / Jane's 2005 and Hunnicutt 1984),
//        Wikipedia 105x617mmR (cites Rocchio 1983, TM 43-0001-28, Jane's Ammunition Handbook), armedconflicts.com.
//   U  = UNVERIFIED: commonly quoted / from memory, no source read.
//   I  = INFERRED: derived from other numbers or tuned against a published performance figure (the bench says which).
// Hull frame: origin on the ground at static ride height, centre of the track contact, x right, y up, z AFT.
import { createTrackSim } from './trackfm.js';

const LB = 0.45359237, IN = 0.0254, HP = 745.7, LBFT = 1.35582;

export const M60A3 = {
  name: 'M60A3 TTS',
  // combat weight 52,617 kg (armedconflicts, C; the brief's figure); AFVDB 51,350 kg, Wikipedia 51,980 kg (C) - sources
  // conflict by 2.5 %. We use 52,617 (the heavier, with crew, full ammunition and stowage).
  MASS: 52617,
  CG: [0, 1.18, 0.05],                       // I: turret forward, engine aft; ~1.2 m high for a 3.3 m tall tank
  I: [235e3, 255e3, 82e3],                   // pitch (x), yaw (y), roll (z) kg m2: I, 0.85 x solid box 6.95 x 3.63 x 2.9 m
  FUEL_L: 1457,                              // 385 US gal (AFVDB, Foss) C
  AERO_CDA: 9,                               // I
  DIM: {                                      // for models and the bench
    HULL_L: 273.5 * IN,                      // 6.947 m C
    LEN_GUN_FWD: 9.436,                      // C
    WIDTH: 143 * IN,                         // 3.632 m over tracks C
    HEIGHT: 3.282,                           // over the cupola periscope C (AFVDB 129.2 in)
    CLEAR: 0.463,                            // ground clearance: 389 (AFVDB) / 450 / 463 mm (Foss) - C, conflict; 463 used
  },
  TRACK: {
    GAUGE: 115 * IN,                         // 2.921 m track centres (AFVDB "tread") C
    WIDTH: 28 * IN,                          // 0.711 m, T142 C
    PITCH: 0.176, SHOES: 80,                 // T142 6.94 in pitch, 80 shoes per track C
    THICK: 0.085,                            // wheel path to ground face incl. rubber pad I
    WHEEL_R: 13 * IN,                        // 26 in roadwheels U
    WHEELS: [-2.0, -1.2, -0.4, 0.4, 1.2, 2.0],   // 6 dual roadwheels per side (C), even spacing I -> contact 4.26 m vs 4.235 C
    FRONT: { z: -2.93, y: 0.60, r: 0.31, kind: 'idler' },        // compensating idler I
    REAR: { z: 2.95, y: 0.67, r: 0.335, kind: 'sprocket', teeth: 11 },   // rear drive, 11 teeth C
    RETURN: [{ z: -1.45, y: 1.0 }, { z: 0.0, y: 1.02 }, { z: 1.45, y: 1.0 }],   // 3 support rollers per side C; positions I
    SPROCKET_R: 0.176 / (2 * Math.sin(Math.PI / 11)),          // pitch radius 0.3124 m, from pitch and teeth I
    J_SPROCKET: 320,                         // 2.4 t of track per side (r^2 m) + wheels + final drive, kg m2 I
    RUN_K: 3e6, RUN_C: 6e4, INTERNAL: 1.0,
  },
  SUSP: {
    K: 2.1e5,                                // N/m at the wheel: ~1.1 Hz heave, 0.2 m static deflection I
    C: [3.2e4, 3.2e4, 0, 0, 0, 3.2e4],       // shock absorbers at stations 1, 2 and 6 U
    REBOUND: 0.12, BUMP: 0.17,               // wheel travel from static: 0.12 m down, 0.17 m up to the bump stop I
    BUMP_K: 3e6, BUMP_C: 8e4,
  },
  ENGINE: {
    // AVDS-1790-2C: 750 hp gross / 643 hp net at 2400 rpm; 1710 lb ft gross at 1800, 1575 lb ft net at 1750 (AFVDB) C
    IDLE: 750, GOV: 2400, CUTOFF: 2560, STALL_RPM: 380, LIGHT_RPM: 160,   // idle U
    CURVE: [[0, 0], [500, 1050], [800, 1540], [1200, 1930], [1750, 1575 * LBFT], [2100, 2060], [2400, 643 * HP / (2400 / 9.549)], [2560, 1500], [2700, 0]],   // net N m, shape I
    FRICTION: [90, 70], J: 3.6, KGOV: 120, TAU: 0.15,
    STARTER: 700, STARTER_RPM: 260,
    FAN_W: (750 - 643) * HP,                 // cooling fans etc. take the gross-net difference (fuel only) I
    SFC: 0.235 / 3.6e6, IDLE_FUEL: 0.0028, FUEL_DENS: 0.84,   // 235 g/kWh I (tuned to ~450-500 km road range, C)
  },
  CONV: { KF: 4.75, STALL_TR: 2.4, COUPLING: 0.86, OVERRUN: 1.1 },   // Allison CD-850 converter: stall ~2050 rpm, TR 2.4 I
  TRANS: {
    // CD-850-6A cross-drive: 2 forward, 1 reverse (C); pivot in neutral (C, AFVDB "pivot"); ratios not published -> I:
    // high sets 48 km/h at the governor (C), low the 60 % gradient (C), reverse 16 km/h (FAS, C).
    ranges: { R: { ratio: -3.62 }, L: { ratio: 5.1 }, H: { ratio: 1.26 } },
    FINAL: 4.4,                              // final drive U
    LOCKUP: { ranges: ['H'], SR: 0.8, ON_RPM: 1500, OFF_RPM: 1250, CAP: 3200 },   // converter lock-up in high (research note: "converter with lock-up", U)
    J_TURBINE: 2.2, TURB_DRAG: 0.4, CLUTCH_CAP: 2.4e4, SHIFT_T: 0.7,
    BRAKE: 7.5e4,                            // N m per sprocket: ~0.6 g stop I
    STEER: { REF: 'input', K: 0.055, PIVOT: true, CAP: 6.5e4 },   // geared steer from the input, radius grows with range I
  },
  HULL: {
    CLEAR: 0.463, K: 3e6, C: 9e4,
    INTAKE_Y: 1.42, INTAKE_Z: 2.2,           // engine air intake: 1.22 m (48 in) fording C, floods above ~1.4 m I
    DECK_Y: 1.55, DECK_Z: 2.4,
    PROBES: [],                               // filled below
    COLS: [],
  },
  WATER: { SWIMS: false, CD_X: 1.0, CD_Y: 1.2, CD_V: 1.1, FRONT_W: 3.6, TRACK_CA: 0.05, TRACK_LOSS: 4, LEAK: 0, LEAK_FORD: 0.003, LEAK_OVER: 0.35, PUMP: 0.012, PUMPS: true, MAX_INSIDE: 30, FLOOD_CREW: 1.5, RUNNING_GEAR_VOL: 1.0 },
  THROW_LAT: 0.62, THROW_SPEED: 7, THROW_TIME: 0.7,
  // turret and gun (hull frame)
  TURRET: {
    RING: [0, 1.98, -0.25],                  // turret ring centre on the hull roof I
    TRUNNION: [0, 2.36, -1.3],               // I: gives 9.44 m gun forward with a 5.4 m tube C
    MUZZLE_FWD: 4.65,                        // trunnion to muzzle I (M68 tube 5.4 m incl. breech ring)
    TRAVERSE: 22.5 * Math.PI / 180,          // 22.5 deg/s (AFVDB) C
    ELEV_RATE: 4 * Math.PI / 180,            // 4 deg/s (AFVDB) C
    EL_MAX: 20 * Math.PI / 180, EL_MIN: -10 * Math.PI / 180,   // C
    MANUAL_TRAV: 2.2 * Math.PI / 180, MANUAL_ELEV: 0.9 * Math.PI / 180,   // handwheels, I
    SERVO_TAU: 0.07, ACC: 60 * Math.PI / 180,   // hydraulic servo lag and acceleration limit I
    GYRO_NOISE: 0.00012, GYRO_BIAS: 0.0004, GYRO_GAIN_ERR: 0.04,   // rad/s, rad/s, fraction I
    RECOIL_LEN: 0.30,                        // m U
  },
};
// hull probes (outward normals): belly, nose, glacis, tail, sides over the fenders, roof, turret, cupola; plus the
// muzzle (moved by the turret every step)
{
  const P = M60A3.HULL.PROBES, c = M60A3.HULL.CLEAR;
  const add = (name, p, n, mu) => { const l = Math.hypot(...n); P.push({ name, p, n: n.map(v => v / l), mu }); };
  for (const x of [-0.95, 0.95]) for (const z of [-2.7, -1.35, 0, 1.35, 2.7]) add('belly', [x, c, z], [0, -1, 0]);
  for (const x of [-1.0, 0, 1.0]) { add('nose', [x, 0.62, -3.15], [0, -0.6, -0.8]); add('noseTip', [x, 1.02, -3.47], [0, -0.2, -1]); add('glacis', [x, 1.5, -2.95], [0, 0.42, -0.9]); }
  for (const x of [-1.0, 0, 1.0]) { add('tailLow', [x, 0.66, 3.25], [0, -0.55, 0.83]); add('tail', [x, 1.4, 3.47], [0, 0, 1]); }
  for (const s of [-1, 1]) for (const z of [-2.9, -1, 1, 2.9]) { add('fender', [s * 1.81, 1.32, z], [s, 0.1, 0]); add('roofEdge', [s * 1.7, 1.95, z], [s * 0.6, 0.8, 0]); }
  for (const s of [-1, 1]) for (const z of [-1.35, 0.9]) add('turret', [s * 1.25, 2.85, z], [s * 0.5, 0.85, 0]);
  add('turretTop', [0, 2.95, -0.2], [0, 1, 0]); add('cupola', [0.62, 3.28, 0.25], [0, 1, 0]); add('bustle', [0, 2.6, 1.55], [0, 0.3, 1]);
  add('muzzle', [0, 2.36, -5.95], [0, 0, -1], 0.4);
  // buoyancy columns: lower hull between the tracks, upper hull over them
  const C = M60A3.HULL.COLS;
  for (const z of [-2.2, 0, 2.2]) for (const x of [-0.55, 0.55]) { C.push({ x, z, ax: 0.55, az: 1.1, y0: c, y1: 1.0 }); C.push({ x: x * 1.36, z, ax: 0.75, az: 1.12, y0: 1.0, y1: 1.95 }); }
}

export function createM60A3Sim(opt) { return createTrackSim(M60A3, opt); }
