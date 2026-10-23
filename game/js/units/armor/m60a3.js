// M60A3 TTS main battle tank: parameters for trackfm.js, plus the turret, gun stabilisation, fire control, ammunition,
// loader and crew (createM60A3). PURE: no THREE, no DOM; runs in node (tools/tankbench.mjs).
//
// Sources and tags (every number below carries one):
//   C  = CONFIRMED in a source read for this work: AFVDB (afvdatabase.com/usa/m60.html, follows Hunnicutt "Patton"),
//        FAS (man.fas.org/dod-101/sys/land/m60.htm), Wikipedia M60 (cites Foss / Jane's 2005 and Hunnicutt 1984),
//        armedconflicts.com. Weapons, armour and fire control are GAME-LEVEL (headline figures, game tables).
//   U  = UNVERIFIED: commonly quoted / from memory, no source read.
//   I  = INFERRED: derived from other numbers or tuned against a published performance figure (the bench says which).
// Hull frame: origin on the ground at static ride height, centre of the track contact, x right, y up, z AFT.
import { createTrackSim } from './trackfm.js';
import { makeArmor, plate, resolveHit, killState, fireTable, ROUNDS } from './armorballistics.js';

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
    STAB_GAIN: 0.95, STAB_DRIFT: 0.0006,     // stabiliser: fraction of hull motion cancelled, slow drift rad/s (game)
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

// ======================================================================================================= armour (game)
// Game thickness per zone (mm, normal to the plate) and the components behind. Shapes follow the real hull and turret;
// the numbers are game balance (the front is much stronger than the sides, the roof and rear are thin).
const D2R = Math.PI / 180;
export const M60A3_ARMOR = (() => {
  const P = [], H = 'hull', T = 'turret';
  P.push(plate('glacis', H, [0, 1.3, -3.1], [0, Math.sin(65 * D2R), -Math.cos(65 * D2R)], [1, 0, 0], 1.6, 0.75, 110));
  P.push(plate('lowerFront', H, [0, 0.7, -3.2], [0, -Math.sin(55 * D2R), -Math.cos(55 * D2R)], [1, 0, 0], 1.6, 0.3, 100));
  for (const s of [-1, 1]) {
    P.push(plate(s < 0 ? 'sideL' : 'sideR', H, [s * 1.1, 1.0, -1.2], [s, 0, 0], [0, 0, 1], 2.1, 0.5, 75, { ext: s < 0 ? 'trackL' : 'trackR' }));
    P.push(plate(s < 0 ? 'sideRearL' : 'sideRearR', H, [s * 1.1, 1.0, 2.2], [s, 0, 0], [0, 0, 1], 1.2, 0.5, 45, { ext: s < 0 ? 'trackL' : 'trackR' }));
    P.push(plate(s < 0 ? 'trackRunL' : 'trackRunR', H, [s * 1.82, 0.55, 0], [s, 0, 0], [0, 0, 1], 3.2, 0.45, 25, { outer: true, ext: s < 0 ? 'trackL' : 'trackR' }));
  }
  P.push(plate('rear', H, [0, 1.1, 3.45], [0, 0, 1], [1, 0, 0], 1.6, 0.6, 30, { ext: null }));
  P.push(plate('deck', H, [0, 1.95, 1.8], [0, 1, 0], [1, 0, 0], 1.6, 1.6, 30));
  P.push(plate('belly', H, [0, 0.47, 0], [0, -1, 0], [1, 0, 0], 1.1, 3.3, 18));
  // turret (frame: ring centre origin): cast, rounded front, mantlet, sides, bustle, roof
  P.push(plate('mantlet', T, [0, 0.38, -1.1], [0, 0.2, -1], [1, 0, 0], 0.5, 0.35, 180, { ext: 'gun' }));
  for (const s of [-1, 1]) {
    P.push(plate('turretFront', T, [s * 0.85, 0.42, -0.95], [s * 0.5, 0.35, -0.8], [0, 1, 0], 0.4, 0.45, 220));
    P.push(plate('turretSide', T, [s * 1.3, 0.42, 0.1], [s, 0.3, 0], [0, 0, 1], 1.0, 0.4, 85));
  }
  P.push(plate('bustle', T, [0, 0.45, 1.6], [0, 0.15, 1], [1, 0, 0], 1.0, 0.35, 50));
  P.push(plate('turretRoof', T, [0, 0.9, 0.1], [0, 1, 0], [1, 0, 0], 1.2, 1.2, 25, { ext: 'sightThermal' }));
  P.push(plate('cupola', T, [0.6, 1.15, 0.3], [0, 0.6, -0.8], [1, 0, 0], 0.4, 0.25, 50, { ext: 'cupola' }));
  const C = [
    // hull
    { id: 'driver', kind: 'crew', frame: H, c: [0, 1.1, -2.3], h: [0.4, 0.45, 0.45] },
    { id: 'hullAmmo', kind: 'ammo', frame: H, c: [0.75, 1.0, -2.2], h: [0.4, 0.4, 0.6] },
    { id: 'floorAmmo', kind: 'ammo', frame: H, c: [-0.6, 0.75, -0.6], h: [0.45, 0.2, 0.5] },
    { id: 'fuelL', kind: 'fuel', frame: H, c: [-0.9, 1.1, 1.1], h: [0.25, 0.45, 0.45] },
    { id: 'fuelR', kind: 'fuel', frame: H, c: [0.9, 1.1, 1.1], h: [0.25, 0.45, 0.45] },
    { id: 'engine', kind: 'engine', frame: H, c: [0, 1.15, 2.1], h: [0.8, 0.55, 0.7] },
    { id: 'transmission', kind: 'drive', frame: H, c: [0, 0.9, 3.05], h: [0.9, 0.35, 0.3] },
    { id: 'trackL', kind: 'track', frame: H, c: [-1.46, 0.5, 0], h: [0.36, 0.5, 3.3], ext: true },
    { id: 'trackR', kind: 'track', frame: H, c: [1.46, 0.5, 0], h: [0.36, 0.5, 3.3], ext: true },
    // turret (ring-centre frame)
    { id: 'gunner', kind: 'crew', frame: T, c: [0.5, -0.1, -0.55], h: [0.3, 0.45, 0.35] },
    { id: 'commander', kind: 'crew', frame: T, c: [0.55, 0.15, 0.35], h: [0.3, 0.55, 0.35] },
    { id: 'loader', kind: 'crew', frame: T, c: [-0.6, -0.1, 0.0], h: [0.3, 0.6, 0.4] },
    { id: 'readyAmmo', kind: 'ammo', frame: T, c: [0, 0.3, 1.45], h: [0.8, 0.25, 0.3] },
    { id: 'breech', kind: 'gun', frame: T, c: [0, 0.38, -0.2], h: [0.25, 0.25, 0.7] },
    { id: 'turretDrive', kind: 'hydraulic', frame: T, c: [0.2, -0.45, -0.3], h: [0.35, 0.2, 0.3] },
    { id: 'computer', kind: 'fc', frame: T, c: [0.85, 0.1, -0.2], h: [0.15, 0.2, 0.25] },
    { id: 'laser', kind: 'fc', frame: T, c: [0.55, 0.7, -0.75], h: [0.15, 0.15, 0.2] },
    { id: 'sightDay', kind: 'sight', frame: T, c: [0.5, 0.85, -0.7], h: [0.12, 0.12, 0.15] },
    { id: 'sightThermal', kind: 'sight', frame: T, c: [0.75, 0.85, -0.45], h: [0.18, 0.15, 0.2], ext: true },
    { id: 'radio', kind: 'radio', frame: T, c: [0, 0.4, 1.2], h: [0.4, 0.2, 0.15] },
    { id: 'gun', kind: 'gun', frame: T, c: [0, 0.38, -3.3], h: [0.12, 0.12, 2.3], ext: true },
    { id: 'cupola', kind: 'mg', frame: T, c: [0.6, 1.1, 0.3], h: [0.4, 0.2, 0.4], ext: true },
  ];
  return { RING: M60A3.TURRET.RING, PLATES: P, COMPS: C, TRACKS: ['trackL', 'trackR'] };
})();

// ======================================================================================================= vehicle
// createM60A3(opt) -> the whole tank: the track sim (fm), turret and gun drives with the stabiliser, sights, laser
// rangefinder and a simple ballistic computer (range + lead), main gun with racks and a loader, coax and the
// commander's .50, crew stations, electrics, fire and damage. step(dt, env, input) each frame; read the state.
//
// input = {
//   throttle, brake, steer, range ('R'|'N'|'L'|'H'), park,             driver (T-bar, accelerator, selector)
//   trav, elev (-1..1 power control handle: + = right / up), fire, coax, lase, dump,   gunner
//   cupTrav, cupElev, fire50,                                                       commander
//   ammo: 'M735'|'M456'|'M393' (round the loader loads next), stab (bool), power (turret power), sight ('day'|'tts'),
//   ttsMag (3|8), ttsPolarity ('wh'|'bh') }
// env (beyond trackfm's): env.raycast?(o, d, max) -> distance to the first thing hit (m) or null, for the laser.
// Gun line and sight line in world: gunDir(out), sightDir(out), muzzle(out). fire() is done inside step when input.fire
// and returns the shot in events: { type: 'shot', weapon: 'main'|'coax'|'mg50', round, p, dir, v0 }.
export const RACKS = [
  // id, capacity, game load time (s), where
  { id: 'readyAmmo', name: 'READY RACK (turret)', cap: 13, t: 7.5 },
  { id: 'hullAmmo', name: 'HULL RACK (front)', cap: 26, t: 13 },
  { id: 'floorAmmo', name: 'TURRET FLOOR / HULL', cap: 24, t: 11 },
];
export const DEFAULT_LOAD = { readyAmmo: { M735: 7, M456: 5, M393: 1 }, hullAmmo: { M735: 14, M456: 9, M393: 3 }, floorAmmo: { M735: 12, M456: 8, M393: 4 } };   // 63 rounds (C), mix: game

export function createM60A3(opt = {}) {
  const fm = createTrackSim(M60A3, opt);
  const TU = M60A3.TURRET;
  const T = {
    fm, armor: makeArmor(M60A3_ARMOR, opt.seed || 7),
    // turret / gun: relative to the hull. az + = left (three.js y). The SIGHT line is what the gunner lays; the gun sits
    // above / beside it by the computer's offsets (superelevation, lead).
    az: 0, el: 0, azRate: 0, elRate: 0, losAz: 0, losEl: 0, stab: true, power: true, hydP: 0,
    stabErr: [0, 0],          // sight-line error from imperfect stabilisation (rad, inertial)
    sight: 'day', ttsMag: 8, ttsPolarity: 'wh', ttsCool: 0,   // TTS cooler: needs ~ 60 s after power-on (game)
    laser: { range: null, t: 0, ready: true, returns: 0, fault: false },
    fc: { range: 1200, ammo: 'M735', se: 0, lead: 0, track: 0, solved: false, battlesight: true },
    gun: { state: 'empty', round: null, loadT: 0, loadNeed: 0, recoil: 0, fired: 0 },
    next: 'M735', racks: JSON.parse(JSON.stringify(opt.load || DEFAULT_LOAD)),
    coax: { ammo: 5950, t: 0, firing: false }, mg50: { ammo: 900, ready: 180, t: 0, az: 0, el: 0, firing: false },   // C: 5950 / 900 rounds
    crew: { driver: 1, gunner: 1, commander: 1, loader: 1 }, station: 'gunner',
    elec: { batt: 1, volts: 24, gen: false, master: true },
    fire: { where: null, t: 0, halon: 2 }, bailed: false,
    events: [], time: 0,
  };
  const ev = T.events;
  const roundsIn = id => T.racks[id] ? Object.values(T.racks[id]).reduce((a, b) => a + b, 0) : 0;
  T.ammoCount = type => RACKS.reduce((s, r) => s + (T.racks[r.id][type] || 0), 0);
  T.ammoTotal = () => RACKS.reduce((s, r) => s + roundsIn(r.id), 0);
  const comp = id => T.armor.COMPS.find(c => c.id === id);
  const hp = id => { const c = comp(id); return c ? c.hp : 1; };

  // ---- geometry helpers (world)
  const R = fm.R;
  function turretDir(az, el, out) {   // hull-relative az/el -> world direction
    const ce = Math.cos(el), x = -Math.sin(az) * ce, y = Math.sin(el), z = -Math.cos(az) * ce;
    out[0] = R[0] * x + R[1] * y + R[2] * z; out[1] = R[3] * x + R[4] * y + R[5] * z; out[2] = R[6] * x + R[7] * y + R[8] * z; return out;
  }
  T.gunDir = (out = [0, 0, 0]) => turretDir(T.az, T.el, out);
  T.sightDir = (out = [0, 0, 0]) => turretDir(T.losAz + T.stabErr[0], T.losEl + T.stabErr[1], out);
  // hull-frame point of the turret, rotated by az (turret frame point p relative to the ring centre)
  T.turretPoint = (p, out = [0, 0, 0]) => {
    const c = Math.cos(T.az), s = Math.sin(T.az), r = TU.RING;
    return fm.toWorld([r[0] + c * p[0] + s * p[2], r[1] + p[1], r[2] - s * p[0] + c * p[2]], out);
  };
  T.muzzle = (out = [0, 0, 0]) => {
    const tr = TU.TRUNNION, r = TU.RING, L = TU.MUZZLE_FWD, ce = Math.cos(T.el);
    // trunnion in the turret frame, then along the gun
    return T.turretPoint([tr[0] - r[0], tr[1] - r[1] + Math.sin(T.el) * L, tr[2] - r[2] - ce * L], out);
  };
  // update the muzzle probe in the FM (the gun can dig in)
  const muzProbe = fm.contacts.find(c => c.name === 'muzzle');
  function syncMuzzleProbe() {
    if (!muzProbe) return;
    const tr = TU.TRUNNION, r = TU.RING, L = TU.MUZZLE_FWD, ce = Math.cos(T.el), c = Math.cos(T.az), s = Math.sin(T.az);
    const px = 0, py = tr[1] - r[1] + Math.sin(T.el) * L, pz = tr[2] - r[2] - ce * L;
    muzProbe.b[0] = r[0] + c * px + s * pz; muzProbe.b[1] = r[1] + py; muzProbe.b[2] = r[2] - s * px + c * pz;
    const dx = -Math.sin(T.az) * ce, dz = -Math.cos(T.az) * ce; muzProbe.n[0] = dx; muzProbe.n[1] = Math.sin(T.el); muzProbe.n[2] = dz;
  }

  // ---- loader
  function startLoad() {
    if (T.gun.state !== 'empty' || hp('breech') <= 0) return;
    const loader = T.crew.loader > 0 ? 'loader' : T.crew.commander > 0 ? 'commander' : null;
    if (!loader) return;
    // the loader takes the selected round from the nearest rack that has one
    const rack = RACKS.find(r => (T.racks[r.id][T.next] || 0) > 0);
    if (!rack) return;
    T.racks[rack.id][T.next]--;
    const moving = Math.abs(fm.out.fwd) > 4 ? 1.25 : 1, wound = loader === 'commander' ? 2.4 : T.crew.loader < 0.5 ? 1.7 : 1;
    T.gun.state = 'loading'; T.gun.round = T.next; T.gun.loadT = 0; T.gun.loadNeed = rack.t * moving * wound; T.gun.rack = rack.id;
  }

  // ---- main step
  const _d = [0, 0, 0], _p = [0, 0, 0], _prevW = [0, 0, -1]; let _havePrev = false;
  T.step = (dt, env, inp = {}) => {
    ev.length = 0; T.time += dt;
    // crew and component states drive the systems
    for (const k of Object.keys(T.crew)) T.crew[k] = hp(k);
    fm.dmg.engine = hp('engine'); fm.dmg.trans = hp('transmission');
    if (hp('trackL') <= 0 && !fm.dmg.thrown[0]) fm.dmg.thrown[0] = true;
    if (hp('trackR') <= 0 && !fm.dmg.thrown[1]) fm.dmg.thrown[1] = true;
    // ---- driver
    const drv = T.crew.driver > 0;
    Object.assign(fm.ctl, {
      throttle: drv ? inp.throttle ?? fm.ctl.throttle : 0, brake: drv ? inp.brake ?? 0 : 0.3, steer: drv ? inp.steer ?? 0 : 0,
      range: drv ? inp.range ?? fm.ctl.range : 'N', park: inp.park ?? fm.ctl.park, starter: !!inp.starter, fuelOn: inp.fuelOn ?? fm.ctl.fuelOn,
    });
    T.sightDir(_prevW); _havePrev = true;   // the sight line in space before the hull moves (for the stabiliser)
    for (const e of fm.step(dt, env)) ev.push(e);
    // ---- electrics: generator with the engine, turret power from the batteries otherwise (game rates)
    const el = T.elec; el.gen = fm.eng.running && fm.eng.w * 9.549 > 1000;
    const draw = (T.power ? 0.0009 : 0) + (T.sight === 'tts' ? 0.0002 : 0);
    el.batt = Math.max(0, Math.min(1, el.batt + (el.gen ? 0.004 : -draw) * dt));
    el.volts = el.gen ? 28 : 22 + 3 * el.batt;
    const pwr = (inp.power ?? T.power) && el.batt > 0.05 && el.master;
    T.power = inp.power ?? T.power;
    T.hydP += ((pwr && hp('turretDrive') > 0 ? 1 : 0) - T.hydP) * Math.min(1, dt / 1.5);   // pump spins up
    if (inp.stab !== undefined) T.stab = inp.stab;
    if (inp.sight) T.sight = inp.sight; if (inp.ttsMag) T.ttsMag = inp.ttsMag; if (inp.ttsPolarity) T.ttsPolarity = inp.ttsPolarity;
    T.ttsCool = pwr && hp('sightThermal') > 0 ? Math.min(1, T.ttsCool + dt / 60) : Math.max(0, T.ttsCool - dt / 30);
    if (inp.ammo && inp.ammo !== T.next) T.next = inp.ammo;
    // ---- turret and gun drive (gunner's power control handle, rate command), stabiliser
    const gun = T.crew.gunner > 0 || T.crew.commander > 0, slow = T.crew.gunner > 0 ? 1 : 0.6;
    const powered = T.hydP > 0.5, hydraulic = powered ? T.hydP : 0;
    const shape = v => Math.sign(v) * Math.pow(Math.abs(v), 1.6);   // fine control near centre
    const tCmd = gun ? -shape(inp.trav || 0) * (powered ? TU.TRAVERSE * slow : TU.MANUAL_TRAV) : 0;   // + right -> az decreases
    const eCmd = gun ? shape(inp.elev || 0) * (powered ? TU.ELEV_RATE * slow : TU.MANUAL_ELEV) : 0;
    const hullYaw = fm.w[1];
    const stab = powered && T.stab;
    // The handle commands a rate (servo lag + acceleration limit; manual handwheels respond directly). Stabilised, the
    // command is INERTIAL: the drives also take out STAB_GAIN of the hull's actual rotation over the frame (the sight line
    // held in space by the gyros), so only the rest of the hull's pitching and yawing reaches the reticle. Unstabilised,
    // the gun rides with the hull.
    const k = stab ? TU.STAB_GAIN : 0;
    const lag = 1 - Math.exp(-dt / TU.SERVO_TAU);
    const lim = (v, m) => Math.max(-m, Math.min(m, v));
    T.cmdAz = (T.cmdAz || 0) + (powered ? lim((tCmd - (T.cmdAz || 0)) * lag, TU.ACC * dt) : tCmd - (T.cmdAz || 0));
    T.cmdEl = (T.cmdEl || 0) + (powered ? lim((eCmd - (T.cmdEl || 0)) * lag, TU.ACC * dt) : eCmd - (T.cmdEl || 0));
    // where last frame's sight line points relative to the hull as it is now
    const b0 = _prevW, Rn = fm.R;
    const bx = Rn[0] * b0[0] + Rn[3] * b0[1] + Rn[6] * b0[2], by = Rn[1] * b0[0] + Rn[4] * b0[1] + Rn[7] * b0[2], bz = Rn[2] * b0[0] + Rn[5] * b0[1] + Rn[8] * b0[2];
    let dHa = Math.atan2(-bx, -bz) - T.losAz; dHa = Math.atan2(Math.sin(dHa), Math.cos(dHa));
    const dHe = Math.asin(Math.max(-1, Math.min(1, by))) - T.losEl;
    const maxA = TU.TRAVERSE * 1.5 * Math.max(0.2, hydraulic) * dt, maxE = (stab ? 0.6 : TU.ELEV_RATE) * dt;   // the stabiliser may drive the gun faster than the handle (game)
    const dA = lim(T.cmdAz * dt + (_havePrev ? k * dHa : 0), maxA), dE = lim(T.cmdEl * dt + (_havePrev ? k * dHe : 0), maxE);
    T.azRate = dA / dt; T.elRate = dE / dt;
    // sight line (hull relative) moves with the drives; the gun follows with the computer's offsets
    T.losAz += dA; T.losEl += dE;
    T.losAz = ((T.losAz + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (T.losEl > TU.EL_MAX - T.fc.se) { T.losEl = TU.EL_MAX - T.fc.se; T.elRate = Math.min(0, T.elRate); }
    if (T.losEl < TU.EL_MIN) { T.losEl = TU.EL_MIN; T.elRate = Math.max(0, T.elRate); }
    // residual stabilisation error (what the gunner sees as the reticle shaking): the part of the hull motion the
    // stabiliser misses, decaying as the loop catches up
    // tracking rate for the lead (inertial traverse rate, smoothed over ~1 s)
    T.fc.track += ((stab ? T.cmdAz : T.azRate + hullYaw) - T.fc.track) * Math.min(1, dt / 1.0);
    T.az = T.losAz + (T.fc.solved ? T.fc.lead : 0); T.el = T.losEl + (T.fc.solved || T.fc.battlesight ? T.fc.se : 0);
    syncMuzzleProbe();
    // ---- laser rangefinder and computer
    const L = T.laser; L.t = Math.max(0, L.t - dt); L.ready = L.t <= 0 && pwr && hp('laser') > 0;
    if (inp.lase && L.ready && gun) {
      L.t = 2.5; T.sightDir(_d); const o = T.turretPoint([0.55, 0.75, -0.8], _p);
      const r = env.raycast ? env.raycast(o, _d, 5000) : null;
      L.range = r && r >= 200 ? Math.round(r / 10) * 10 : null; L.returns = r ? 1 : 0;   // 200-5000 m, 10 m display (game)
      if (L.range) solve(L.range);
      ev.push({ type: 'lase', range: L.range });
    }
    if (inp.dump) { T.fc.solved = false; T.fc.lead = 0; T.fc.range = 1200; T.fc.battlesight = true; solve(1200, true); }
    if (T.fc.ammo !== (T.gun.round || T.next)) { T.fc.ammo = T.gun.round || T.next; solve(T.fc.range, !T.fc.solved); }
    // ---- loader
    if (T.gun.state === 'empty' && (inp.autoload ?? true)) startLoad();
    if (T.gun.state === 'loading') { T.gun.loadT += dt; if (T.gun.loadT >= T.gun.loadNeed) { T.gun.state = 'ready'; ev.push({ type: 'loaded', round: T.gun.round }); } }
    T.gun.recoil = Math.max(0, T.gun.recoil - dt * 1.2);
    // ---- fire the main gun
    if (inp.fire && T.gun.state === 'ready' && hp('gun') > 0 && hp('breech') > 0 && gun && (pwr || inp.manualFire)) {
      const round = T.gun.round; T.gun.state = 'empty'; T.gun.round = null; T.gun.recoil = TU.RECOIL_LEN; T.gun.fired++;
      const dir = T.gunDir([0, 0, 0]), p = T.muzzle([0, 0, 0]);
      const R0 = ROUNDS[round];
      ev.push({ type: 'shot', weapon: 'main', round, p, dir, v0: R0.mv, vel: fm.vel.slice() });
      // recoil impulse on the hull at the trunnion (game: a rocking shove)
      fm.impulse(T.turretPoint([0, 0.38, -1.05]), [-dir[0] * 14000, -dir[1] * 14000, -dir[2] * 14000]);
      if (T.fc.solved && !T.fc.keep) { /* the solution stays for follow-up shots at the same range */ }
    }
    // ---- coax M240 (750 rounds/min, game) along the gun
    const cx = T.coax; cx.t = Math.max(0, cx.t - dt); cx.firing = !!inp.coax && cx.ammo > 0 && gun && pwr;
    while (cx.firing && cx.t <= 0 && cx.ammo > 0) {
      cx.t += 60 / 750; cx.ammo--;
      const dir = T.gunDir([0, 0, 0]), p = T.turretPoint([0.42, 0.38, -1.25]);
      ev.push({ type: 'shot', weapon: 'coax', round: 'M80', p, dir, v0: ROUNDS.M80.mv, tracer: cx.ammo % 5 === 0 });
    }
    // ---- commander's cupola and the .50 (M85: 450 rounds/min low rate, game)
    const m = T.mg50, cmd = T.crew.commander > 0;
    if (cmd) { m.az += -(inp.cupTrav || 0) * 0.6 * dt; m.el = Math.max(-0.26, Math.min(1.05, m.el + (inp.cupElev || 0) * 0.4 * dt)); }
    m.t = Math.max(0, m.t - dt); m.firing = !!inp.fire50 && cmd && m.ready > 0 && hp('cupola') > 0;
    while (m.firing && m.t <= 0 && m.ready > 0) {
      m.t += 60 / 450; m.ready--; m.ammo--;
      const dir = turretDir(T.az + m.az, m.el, [0, 0, 0]), p = T.turretPoint([0.6 + Math.sin(-m.az) * 0.1, 1.35, 0.1]);
      ev.push({ type: 'shot', weapon: 'mg50', round: 'M2AP', p, dir, v0: ROUNDS.M2AP.mv, tracer: m.ammo % 5 === 0 });
    }
    if (m.ready <= 0 && m.ammo > 0 && !m.reload) m.reload = 8;   // commander reloads the cupola box (game)
    if (m.reload) { m.reload -= dt; if (m.reload <= 0) { m.reload = 0; m.ready = Math.min(180, m.ammo); } }
    // ---- fire: burns, Halon (automatic in the crew compartment, manual for the engine), bail-out
    const F = T.fire;
    if (F.where) {
      F.t += dt;
      if (F.halonDue != null && F.t > F.halonDue && F.halon > 0) { F.halon--; ev.push({ type: 'halon', where: F.where }); F.where = Math.random() < 0.8 ? null : F.where; F.halonDue = null; F.t = 0; }
      if (F.where && F.t > 25 && !T.bailed) { T.bailed = true; ev.push({ type: 'bailout' }); }
      if (F.where === 'engine') fm.dmg.engine = Math.max(0, fm.dmg.engine - dt * 0.01);
    }
    if (inp.extinguish && F.where && F.halon > 0) { F.halon--; ev.push({ type: 'halon', where: F.where }); F.where = Math.random() < 0.85 ? null : F.where; F.t = 0; }
    return ev;
  };
  // the computer: superelevation for the range and round, lead = tracking rate x time of flight (game)
  function solve(range, battle = false) {
    const id = T.gun.round || T.next, tab = fireTable(id).at(range), fcOk = hp('computer') > 0;
    T.fc.range = range; T.fc.ammo = id; T.fc.se = tab.el; T.fc.tof = tab.tof;
    T.fc.lead = fcOk && !battle ? Math.max(-0.025, Math.min(0.025, T.fc.track * tab.tof)) : 0;   // capped at 25 mils (game)
    T.fc.solved = fcOk && !battle; T.fc.battlesight = battle || !fcOk;
  }
  solve(1200, true);
  // a hit from outside (hull frame ray): damage + systems
  T.hit = (h) => {
    const r = resolveHit(T.armor, h, { az: T.az });
    for (const e of r.events) {
      if (e.type === 'fire' && !T.fire.where) { T.fire.where = e.where; T.fire.t = 0; T.fire.halonDue = e.where === 'engine' ? null : 0.3; }
      if (e.type === 'cookoff') { T.fire.where = 'ammo'; T.bailed = true; }
      if (e.type === 'component' && e.id === 'trackL') fm.dmg.thrown[0] = e.hp <= 0 || fm.dmg.thrown[0];
      if (e.type === 'component' && e.id === 'trackR') fm.dmg.thrown[1] = e.hp <= 0 || fm.dmg.thrown[1];
    }
    r.kill = killState(T.armor);
    return r;
  };
  T.reset = (x, z, yaw, env, o) => { fm.reset(x, z, yaw, env, o); T.az = T.losAz = 0; T.el = T.losEl = 0; T.azRate = T.elRate = 0; T.hydP = 1; T.ttsCool = o?.cold ? 0 : 1; return T; };
  return T;
}
