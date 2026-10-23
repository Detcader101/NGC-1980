// M151A2 MUTT, 1/4-ton 4x4 utility truck (Ford / AM General). Spec for vehiclefm.js: pure data, model frame (x right,
// y up, nose -z, origin on the ground in the middle of the wheelbase at static ride height).
// Sources (tags as in the bible):
//   TM  = TM 9-2320-218-10, Operator's Manual, Truck, Utility: 1/4 Ton, 4x4, M151A1, M151A2 (1971, changes to 1985):
//         tabulated data (weights, dimensions, fording, fuel, tyres, speeds).
//   TM20 = TM 9-2320-218-20 (organizational maintenance): engine / transmission data, torque.
//   AMG = AM General / Ford data sheet "Truck, Utility, 1/4-ton, M151A2" (1970s), Jane's Military Vehicles and Logistics
//         1980-81 (dimensions and performance repeat the TM).
//   US Army Tank-Automotive Command report "M151 rollover" (1971-72) / NHTSA SSF method for the stability numbers.
// CONFIRMED = from those sources; INFERRED = derived / estimated / tuned (stated); UNVERIFIED = remembered, not checked.
import { IN, FT, LB, GAL, HP, LBFT } from './vehiclefm.js';

const WB = 85 * IN, TRACK = 53 * IN;   // wheelbase 85 in (2.16 m), track 53 in (1.35 m)  TM CONFIRMED
const ZF = -WB / 2, ZR = WB / 2, XT = TRACK / 2;

export const M151 = {
  id: 'm151', name: 'M151A2 MUTT', side: 1, kind: 'jeep',
  // weights: curb 2,400 lb w/ fuel (TM: "net weight 2,320 lb" for A1, A2 ~1,100 kg - the brief's figure) CONFIRMED ~;
  // payload 800 lb cross-country / 1,200 lb highway (TM) CONFIRMED
  mass: 1100, payload: { xc: 800 * LB, road: 1200 * LB },
  // CG: 0.60 m high (INFERRED: no published figure found; a Jeep CJ-5 measures ~0.69 m, the M151 sits lower on its
  // independent suspension); front axle carries ~52% empty (INFERRED, engine forward) -> SSF = 1.346 / (2 x 0.60) = 1.12
  cg: [0, 0.60, ZF + 0.48 * WB],
  dims: { L: 133 * IN, W: 64 * IN, H: 71 * IN, Hlow: 53 * IN, wheelbase: WB, track: TRACK, clearance: 9.5 * IN, box: [3.38, 1.63, 1.15] },   // TM CONFIRMED (box = mass distribution, INFERRED)
  // suspension: independent coil springs all round, front A-arms, rear semi-trailing arms (the A2's revised rear arms,
  // introduced after the A1 rollover studies). Ride frequencies, travel, damping, roll centres and camber gain INFERRED.
  // rc = roll-centre height above the ground (model frame y); camberGain rad per m of extension (+ = top outward in droop);
  // toeGain rad per m of extension (+ = toe-out in droop: the semi-trailing arm's geometry, ~1 deg per 5 cm, INFERRED).
  axles: [
    { z: ZF, wheels: [0, 1], solid: false, freq: 1.45, bump: 0.085, droop: 0.095, zeta: [0.28, 0.42], rc: 0.10, camber0: 0, camberGain: 0.35, driven: 'F', final: 4.86, diff: 'open' },
    { z: ZR, wheels: [2, 3], solid: false, freq: 1.60, bump: 0.085, droop: 0.110, zeta: [0.28, 0.42], rc: 0.30, camber0: 0, camberGain: 0.85, toeGain: 0.3, driven: 'R', final: 4.86, diff: 'open' },
  ],
  // 7.00-16 NDT on all four (TM CONFIRMED)
  wheels: [
    { id: 'FL', x: -XT, z: ZF, axle: 0, tyre: '7.00-16 NDT', steer: true, front: true },
    { id: 'FR', x: XT, z: ZF, axle: 0, tyre: '7.00-16 NDT', steer: true, front: true },
    { id: 'RL', x: -XT, z: ZR, axle: 1, tyre: '7.00-16 NDT', steer: false, front: false },
    { id: 'RR', x: XT, z: ZR, axle: 1, tyre: '7.00-16 NDT', steer: false, front: false },
  ],
  // steering: turning circle 35 ft 9 in kerb-to-kerb (AMG; UNVERIFIED) -> ~27 deg mean lock; 4 turns lock to lock (INFERRED)
  steer: { max: 0.47, ackermann: 0.85, zRef: ZR, turns: 4.0 },
  // engine: Ford/Continental L-142, 4-cyl OHV 141.5 cu in (2.32 l), 71 hp @ 4000 rpm (gross), 128 lb-ft @ 1800 rpm
  // (TM20 / AMG CONFIRMED). Curve shape between the two points INFERRED. Idle 650 rpm (TM20 600-650 CONFIRMED).
  engine: {
    name: 'L-142 4-cyl 2.3 l petrol', diesel: false, disp: 2.32,
    curve: [[0, 60], [500, 112], [800, 135], [1200, 158], [1800, 128 * LBFT], [2400, 170], [3000, 158], [3500, 143], [4000, 71 * HP / (4000 / 60 * 2 * Math.PI)], [4400, 108], [5000, 75]],
    installed: 0.87,                  // 71 hp is SAE gross: as installed (fan, generator, air cleaner, exhaust) ~ -13% (INFERRED, J245 vs J1349 typical)
    fric: [14, 4.0, 1.2],             // motoring torque N m = a + b krpm + c krpm^2 (FMEP ~0.9-1.6 bar + pumping, INFERRED)
    inertia: 0.20, idle: 650, stall: 280, redline: 4400, idleThr: 0.115, idleGain: 0.9, idleMax: 0.32,
    starter: { torque: 70, rpm: 260, catch: 170, crankTime: 0.35 },
    clutchCap: 290,                   // single dry plate, ~1.65 x peak torque (INFERRED)
    etaInd: [0.29, 0.33],             // gross indicated efficiency light -> full load (pumping is in fric) (INFERRED, 7.5:1 petrol)
    oilPsi: 40, oilRpm: 2000,         // 40 psi at 2000 rpm hot (TM20 normal range 30-50, CONFIRMED range)
  },
  // transmission: 4-speed, synchronised in all forward gears; single-speed transfer with a front-axle engage lever (TM
  // CONFIRMED: "4WD lever, engage for cross-country"). Ratios 6.42 / 3.55 / 1.84 / 1.00, R 6.11 and the 4.86 axles: UNVERIFIED
  // (from secondary sources; they reproduce the TM's 66 mph top speed and 60% grade).
  gearbox: { ratios: [6.42, 3.55, 1.84, 1.00], reverse: 6.11, synchro: [true, true, true, true], pattern: 'R1-2-3-4' },
  transfer: { high: 1.0, low: null, front: 'parttime' },
  drive: { gbI: 0.05, propI: 0.03, loss: 0.09, spinLoss: 2.5 },
  // brakes: hydraulic drums all round (TM CONFIRMED); torques sized for ~0.85 g on the 7.00-16s (INFERRED, 60/40 split);
  // parking brake: lever, mechanical on the rear drums (INFERRED)
  brakes: { front: 1150, rear: 760, park: 'rear', parkT: 1100, air: null },
  // drag: CdA 2.0 m2 (frontal ~2.4 m2 with the windscreen up x Cd ~0.85, INFERRED to the TM top speed)
  aero: { CdA: 2.0 },
  fuel: { capacity: 17 * GAL, type: 'petrol' },   // 17 US gal (TM CONFIRMED); range 300 mi (TM CONFIRMED)
  electrics: { volts: 24 },                        // 24 V waterproof military system (TM CONFIRMED)
  cooling: { thermostat: 82, heatFrac: 0.30, UA: 380, heatCap: 1.15e5 },   // 180 F thermostat (TM20), rest INFERRED
  // fording: 21 in without preparation, 60 in with the deep-water fording kit (TM CONFIRMED). Air intake (cleaner on the
  // engine) ~0.95 m; ignition is sealed (24 V waterproof) so the jeep runs until the intake drinks.
  water: {
    ford: 21 * IN, kit: true, kitFord: 60 * IN, sealed: true,
    intake: [0.25, 0.95, -1.05], kitIntake: [0.55, 1.75, -0.55], ignition: [0.0, 0.70, -1.25],
    points: [[-0.7, 0.36, -1.4], [0.7, 0.36, -1.4], [-0.7, 0.36, 1.3], [0.7, 0.36, 1.3], [-0.75, 0.85, -1.4], [0.75, 0.85, -1.4], [-0.75, 0.85, 1.3], [0.75, 0.85, 1.3]],
    vol: 0.55, hullH: 0.55, area: 1.1,              // open tub: it floods, little buoyancy (INFERRED)
  },
  // hull contact points (model frame): belly, body corners, windscreen frame, the M60 pedestal; and obstacle spheres
  hull: [
    // under the bumpers (approach 66 deg / departure 37 deg, TM: the jeep noses into ditches without touching), the sump and
    // the diffs (0.24 m clearance), then the body corners, beltline, windscreen and the M60 post for rollovers
    [-0.6, 0.42, -1.70], [0.6, 0.42, -1.70], [0, 0.31, -1.30], [-0.55, 0.40, 1.68], [0.55, 0.40, 1.68], [0, 0.25, ZF], [0, 0.25, ZR], [0, 0.27, 0],
    [-0.81, 0.55, -1.68], [0.81, 0.55, -1.68], [-0.81, 0.55, 1.68], [0.81, 0.55, 1.68],
    [-0.81, 1.02, -1.55], [0.81, 1.02, -1.55], [-0.81, 1.02, 1.62], [0.81, 1.02, 1.62], [-0.81, 0.98, 0], [0.81, 0.98, 0],
    [-0.72, 1.48, -0.52], [0.72, 1.48, -0.52], [0, 1.72, 0.45],
  ],
  collide: [
    [-0.5, 0.6, -1.6, 0.28], [0.5, 0.6, -1.6, 0.28], [-0.62, 0.65, -0.5, 0.3], [0.62, 0.65, -0.5, 0.3], [-0.62, 0.65, 0.6, 0.3], [0.62, 0.65, 0.6, 0.3],
    [-0.5, 0.65, 1.55, 0.28], [0.5, 0.65, 1.55, 0.28], [0, 1.1, 0, 0.45],
  ],
  // seats: driver on the left (US), eye ~1.35 m above the ground (INFERRED from the 0.62 m seat)
  seats: [
    { id: 'driver', role: 'driver', at: [-0.36, 0.62, 0.05], eye: [-0.36, 1.38, 0.14] },
    { id: 'front', role: 'passenger', at: [0.36, 0.62, 0.05], eye: [0.36, 1.38, 0.14] },
    { id: 'gunner', role: 'gunner', at: [0, 0.62, 0.95], eye: [0, 1.62, 0.55], gun: 'M60' },
    { id: 'rearL', role: 'passenger', at: [-0.36, 0.62, 0.95], eye: [-0.36, 1.34, 0.92] },
  ],
  // damage components (model-frame boxes [x0,y0,z0, x1,y1,z1]) for vehicledamage.js
  components: {
    engine: [-0.42, 0.40, -1.55, 0.42, 0.95, -0.80], radiator: [-0.45, 0.45, -1.72, 0.45, 0.92, -1.58],
    fuelTank: [-0.62, 0.40, -0.05, -0.12, 0.62, 0.55], battery: [0.25, 0.45, 0.05, 0.6, 0.65, 0.4],
    gearbox: [-0.2, 0.30, -0.80, 0.2, 0.62, -0.25],
  },
  // published performance (TM / AMG) for the bench
  published: { vmax: 66 / 2.23694, grade: 0.60, sideSlope: 0.40, range: 300 * 1609.34, ford: 21 * IN, fordKit: 60 * IN, turnCircle: 35.75 * FT },
};
