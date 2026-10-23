// M35A2 "deuce and a half", 2 1/2-ton 6x6 cargo truck (AM General / Kaiser Jeep). Spec for vehiclefm.js: pure data,
// model frame (x right, y up, nose -z, origin on the ground midway between the front axle and the rear bogie centre).
// Sources:
//   TM  = TM 9-2320-209-10, Operator's Manual, Truck, 2 1/2-ton, 6x6, M35A2 series (1970s editions): tabulated data
//         (weights, dimensions, capacities, fording, speeds, tyres, ratios).
//   TM20 = TM 9-2320-209-20 (organizational maintenance): LDT-465-1C engine data, transmission, transfer, axles, brakes.
//   Jane's Military Vehicles and Logistics 1980-81, "Truck, Cargo, 2 1/2-ton, 6x6, M35A2".
// CONFIRMED = from those sources; INFERRED = derived / estimated / tuned (stated); UNVERIFIED = remembered, not checked.
import { IN, FT, LB, GAL, HP, LBFT } from './vehiclefm.js';

const WB = 154 * IN;                  // front axle to bogie centre 154 in (3.91 m)  TM CONFIRMED
const BOGIE = 52 * IN;                // tandem axle spacing 52 in (1.32 m)          TM CONFIRMED
const TRACK = 72 * IN;                // 72 in (1.83 m) front and rear, single 11.00-20s  TM CONFIRMED (~)
const ZF = -WB / 2, ZB = WB / 2, Z1 = ZB - BOGIE / 2, Z2 = ZB + BOGIE / 2, XT = TRACK / 2;

export const M35 = {
  id: 'm35', name: 'M35A2 2 1/2-ton 6x6', side: 1, kind: 'truck',
  // curb (empty, no winch) 13,030 lb = 5,910 kg (TM CONFIRMED); payload 5,000 lb cross-country, 10,000 lb highway (TM CONFIRMED)
  mass: 13030 * LB, payload: { xc: 5000 * LB, road: 10000 * LB },
  // CG 1.05 m high empty (INFERRED: frame top 1.0 m, engine and cab high, empty bed); ~42% on the front axle empty (INFERRED)
  cg: [0, 1.05, ZB - 0.42 * WB],
  dims: { L: 22 * FT + 4 * IN, W: 8 * FT, H: 9 * FT + 4 * IN, Hcab: 7 * FT + 10 * IN, wheelbase: WB, bogie: BOGIE, track: TRACK, clearance: 11.5 * IN, bedY: 1.30, box: [6.7, 2.44, 2.0] },
  // leaf springs: front semi-elliptic with shock absorbers; rear tandem on inverted leaf springs over a trunnion (walking
  // bogie, no shock absorbers) - TM20 CONFIRMED layout; rates, travel, damping and roll centres INFERRED.
  axles: [
    { z: ZF, wheels: [0, 1], solid: true, freq: 1.75, bump: 0.09, droop: 0.08, zeta: [0.25, 0.35], rc: 0.78, driven: 'F', final: 6.72, diff: 'open' },
    { z: Z1, wheels: [2, 3], solid: true, bogie: 'rear', freq: 2.0, bump: 0.11, droop: 0.13, zeta: [0.10, 0.12], rc: 0.72, driven: 'R', final: 6.72, diff: 'open' },
    { z: Z2, wheels: [4, 5], solid: true, bogie: 'rear', freq: 2.0, bump: 0.11, droop: 0.13, zeta: [0.10, 0.12], rc: 0.72, driven: 'R', final: 6.72, diff: 'open' },
  ],
  bogiePairs: [[2, 4], [3, 5]],        // the trunnion: one spring per side shared by both rear axles
  wheels: [
    { id: 'FL', x: -XT, z: ZF, axle: 0, tyre: '11.00-20 NDT', steer: true, front: true },
    { id: 'FR', x: XT, z: ZF, axle: 0, tyre: '11.00-20 NDT', steer: true, front: true },
    { id: 'ML', x: -XT, z: Z1, axle: 1, tyre: '11.00-20 NDT', steer: false, front: false },
    { id: 'MR', x: XT, z: Z1, axle: 1, tyre: '11.00-20 NDT', steer: false, front: false },
    { id: 'RL', x: -XT, z: Z2, axle: 2, tyre: '11.00-20 NDT', steer: false, front: false },
    { id: 'RR', x: XT, z: Z2, axle: 2, tyre: '11.00-20 NDT', steer: false, front: false },
  ],
  // turning circle ~72 ft wall to wall (TM ~ CONFIRMED: 70-74 ft quoted) -> ~23 deg mean lock; 7 turns lock to lock (INFERRED, manual)
  steer: { max: 0.40, ackermann: 0.85, zRef: ZB, turns: 7.0 },
  // engine: Continental LDT-465-1C, 6-cyl in-line, 478 cu in (7.83 l), turbocharged multifuel (diesel, JP-4, gasoline mix),
  // 134 hp @ 2600 rpm, 330 lb-ft @ 2000 rpm, governed 2600 full load (TM20 CONFIRMED). Curve shape, turbo lag INFERRED.
  engine: {
    name: 'LDT-465-1C multifuel 7.8 l turbo', diesel: true, disp: 7.83,
    curve: [[0, 200], [500, 280], [800, 340], [1200, 395], [1600, 432], [2000, 330 * LBFT], [2300, 405], [2600, 134 * HP / (2600 / 60 * 2 * Math.PI)], [2850, 320], [3000, 250]],
    installed: 0.94,
    turbo: { rpm0: 850, rpm1: 1800, lag: 1.1, na: 0.70 },   // the boost builds over ~1 s; without it ~70% torque (INFERRED)
    governor: [2600, 2850],            // full-load governed speed / high idle (TM20 CONFIRMED ~)
    fric: [42, 12, 5.0],
    inertia: 1.9, idle: 650, stall: 330, redline: 2850, idleThr: 0.14, idleGain: 1.4, idleMax: 0.4,
    starter: { torque: 300, rpm: 200, catch: 140, crankTime: 1.2 },
    clutchCap: 950,                    // 14 in single plate (INFERRED capacity)
    etaInd: [0.38, 0.44],              // gross indicated, multifuel M-system direct injection (INFERRED)
    oilPsi: 45, oilRpm: 1800,          // TM20 normal 30-60 psi (CONFIRMED range)
  },
  // Spicer 3053A 5-speed, synchronised 2-5, 5th an overdrive (TM20 CONFIRMED); ratios 6.06 / 3.50 / 1.80 / 1.00 / 0.78,
  // R 6.00 UNVERIFIED. Rockwell T-136 2-speed transfer: high 1.00, low 1.96, front axle through a sprag (overrunning)
  // clutch that drives it when the rear wheels slip, locked in low range (TM CONFIRMED behaviour; ratios UNVERIFIED).
  // Rockwell axles 6.72:1 (TM20 CONFIRMED), open differentials; no inter-axle differential between the tandem axles.
  gearbox: { ratios: [6.06, 3.50, 1.80, 1.00, 0.78], reverse: 6.00, synchro: [false, true, true, true, true], pattern: 'R-1-2-3-4-5' },
  transfer: { high: 1.0, low: 1.96, front: 'sprag' },
  drive: { gbI: 0.4, propI: 0.25, loss: 0.10, spinLoss: 25, spragLead: 1.03 },   // the sprag picks up once the rear slips ~3% (INFERRED)
  // air-over-hydraulic drums on all six wheels (TM CONFIRMED); compressor governed ~105-120 psi, low-air buzzer at 60 psi
  // (TM CONFIRMED ~). Parking brake: a drum on the transfer output (TM CONFIRMED). Torques INFERRED (~0.65 g loaded).
  brakes: { front: 4200, rear: 4600, park: 'prop', parkT: 2600, air: { max: 120, warn: 60, fill: 1.4, use: 7 } },
  aero: { CdA: 5.2 },                  // frontal ~6.5 m2 with the canvas, Cd ~0.8 (INFERRED to the 56 mph TM top speed)
  fuel: { capacity: 50 * GAL, type: 'diesel' },     // 50 US gal (TM CONFIRMED); range ~350 mi (TM CONFIRMED)
  electrics: { volts: 24 },
  cooling: { thermostat: 82, heatFrac: 0.28, UA: 1500, heatCap: 4.5e5 },
  // fording 30 in without, 72 in with the deep-water fording kit (TM CONFIRMED; the brief's 1.9 m is the kit's snorkel
  // height class). Diesel: no ignition to drown; the air cleaner (right cowl) is the limit for hydrolock.
  water: {
    ford: 30 * IN, kit: true, kitFord: 72 * IN, sealed: true,
    intake: [0.95, 1.62, -1.75], kitIntake: [0.95, 2.75, -1.2], ignition: [0, 1.0, -2.3],
    points: [[-1.0, 0.75, -2.8], [1.0, 0.75, -2.8], [-1.1, 1.15, 3.6], [1.1, 1.15, 3.6], [-1.1, 1.15, 0.2], [1.1, 1.15, 0.2], [-1.0, 1.5, -1.2], [1.0, 1.5, -1.2]],
    vol: 2.0, hullH: 0.9, area: 3.2,
  },
  hull: [
    [-1.05, 0.70, -3.02], [1.05, 0.70, -3.02], [0, 0.32, ZF], [0, 0.33, Z1], [0, 0.33, Z2], [-0.45, 0.62, 0.4], [0.45, 0.62, 0.4], [-0.45, 0.62, 3.5], [0.45, 0.62, 3.5],
    [-1.22, 1.12, -0.25], [1.22, 1.12, -0.25], [-1.22, 1.12, 3.72], [1.22, 1.12, 3.72],
    [-1.22, 2.05, -0.25], [1.22, 2.05, -0.25], [-1.22, 2.05, 3.72], [1.22, 2.05, 3.72],
    [-1.0, 2.35, -1.55], [1.0, 2.35, -1.55], [-1.0, 2.35, -0.45], [1.0, 2.35, -0.45], [-0.6, 1.75, -2.85], [0.6, 1.75, -2.85],
    [-1.22, 2.8, 0.2], [1.22, 2.8, 0.2], [-1.22, 2.8, 3.5], [1.22, 2.8, 3.5],
  ],
  collide: [
    [-0.75, 1.0, -2.9, 0.4], [0.75, 1.0, -2.9, 0.4], [-0.8, 1.7, -1.0, 0.55], [0.8, 1.7, -1.0, 0.55],
    [-0.95, 1.6, 0.4, 0.5], [0.95, 1.6, 0.4, 0.5], [-0.95, 1.6, 1.8, 0.5], [0.95, 1.6, 1.8, 0.5], [-0.95, 1.6, 3.3, 0.5], [0.95, 1.6, 3.3, 0.5],
  ],
  seats: [
    { id: 'driver', role: 'driver', at: [-0.48, 1.42, -0.74], eye: [-0.48, 2.25, -0.80] },
    { id: 'front', role: 'passenger', at: [0.48, 1.42, -0.74], eye: [0.48, 2.25, -0.80] },
    { id: 'ring', role: 'gunner', at: [0.48, 1.85, -0.95], eye: [0.48, 2.62, -0.95], gun: 'M2', variant: 'ring' },
    // troop seats: 2 x 8 on the folding side benches, facing in (TM: 16 troops + driver/assistant)
    ...Array.from({ length: 16 }, (_, i) => { const s = i < 8 ? -1 : 1, k = i % 8; return { id: 'troop' + i, role: 'troop', at: [s * 0.92, 1.72, 0.2 + k * 0.44], eye: [s * 0.82, 2.48, 0.2 + k * 0.44], face: -s }; }),
  ],
  components: {
    engine: [-0.5, 0.75, -2.65, 0.5, 1.55, -1.65], radiator: [-0.55, 0.8, -2.95, 0.55, 1.6, -2.75],
    fuelTank: [-1.12, 0.65, -1.35, -0.62, 1.1, -0.45], battery: [0.62, 0.7, -1.35, 1.12, 1.05, -0.65],
    gearbox: [-0.3, 0.6, -1.65, 0.3, 1.05, -0.9], cargo: [-1.15, 1.32, -0.2, 1.15, 2.0, 3.7],
  },
  cargoAt: [0, 1.6, 1.75],             // bed centre for setLoad
  published: { vmax: 56 / 2.23694, grade: 0.60, sideSlope: 0.30, range: 350 * 1609.34, ford: 30 * IN, fordKit: 72 * IN, turnCircle: 72 * FT },
};
