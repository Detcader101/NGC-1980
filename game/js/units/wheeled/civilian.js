// 1980 civilian vehicles for the lived-in islands: Land Rover Series III 109, Toyota Hilux 4WD (2nd generation), VW Beetle
// 1200 and Lada 2101. Same dynamics as the military trucks (vehiclefm.js); pure data in the model frame (x right, y up,
// nose -z, origin on the ground in the middle of the wheelbase).
// Sources (factory / period road-test data):
//   LR  = Land Rover Series III owner's handbook / workshop manual (1971-85): 2286 cc petrol, 70 bhp @ 4000, 120 lb-ft @ 1500,
//         4-speed all-synchro + 2-speed transfer (high 1.148, low 2.35), axles 4.7:1, 7.50-16, 109 in wheelbase.
//   HX  = Toyota Hilux 4WD (RN36/37, 1979-83) brochure and Autocar / Motor Trend tests: 20R 2189 cc, 90 hp SAE net @ 4800,
//         122 lb-ft @ 2800, 4-speed + 2-speed transfer (low 2.28), 4.375 axles, leaf-sprung front and rear axles.
//   VW  = Volkswagen 1200 (type 11, 1980) owner's manual / factory data: 1192 cc flat four 34 PS (25 kW) @ 3600, 82 N m @
//         2000, 4-speed, swing-axle rear, torsion bars, 5.60-15, 115 km/h, kerb 780-820 kg.
//   LD  = VAZ-2101 "Zhiguli" factory data (1970-82): 1198 cc 64 PS @ 5600, 87 N m @ 3400 (DIN), 4-speed (3.75/2.30/1.49/1.00,
//         R 3.87), final 4.3, 155SR13, kerb 955 kg, 142 km/h.
// CONFIRMED = from those sources; INFERRED = derived / estimated / tuned; UNVERIFIED = remembered, not checked.
import { IN, FT, LB, GAL, HP, LBFT } from './vehiclefm.js';

const car = (o) => o;
const quad = (wb, tf, tr, tyre, frontSteer = true) => [
  { id: 'FL', x: -tf / 2, z: -wb / 2, axle: 0, tyre, steer: frontSteer, front: true },
  { id: 'FR', x: tf / 2, z: -wb / 2, axle: 0, tyre, steer: frontSteer, front: true },
  { id: 'RL', x: -tr / 2, z: wb / 2, axle: 1, tyre, steer: false, front: false },
  { id: 'RR', x: tr / 2, z: wb / 2, axle: 1, tyre, steer: false, front: false },
];
const boxHull = (L, W, yLo, yHi, zOff = 0, extra = []) => {
  const x = W / 2, z0 = -L / 2 + zOff, z1 = L / 2 + zOff;
  return [[-x * 0.8, yLo, z0 + 0.1], [x * 0.8, yLo, z0 + 0.1], [-x * 0.8, yLo, z1 - 0.1], [x * 0.8, yLo, z1 - 0.1], [0, yLo - 0.02, zOff],
    [-x, yLo + 0.25, z0], [x, yLo + 0.25, z0], [-x, yLo + 0.25, z1], [x, yLo + 0.25, z1], ...extra];
};
const spheres = (L, W, y, zOff = 0, r = 0.3) => {
  const x = W / 2 - r * 0.8, z0 = -L / 2 + r + zOff, z1 = L / 2 - r + zOff, zm = zOff;
  return [[-x, y, z0, r], [x, y, z0, r], [-x, y, zm, r], [x, y, zm, r], [-x, y, z1, r], [x, y, z1, r], [0, y + 0.45, zm, r * 1.3]];
};

// ---------------------------------------------------------------------------------------------- Land Rover Series III 109
const LRWB = 109 * IN, LRT = 51.5 * IN;
export const LANDROVER = car({
  id: 'landrover', name: 'Land Rover Series III 109', side: 0, kind: 'civ4x4',
  // 109 pick-up kerb ~1,530 kg (LR CONFIRMED ~ 3,370 lb); CG 0.78 m (INFERRED), 47% front
  mass: 1530, cg: [0, 0.78, LRWB / 2 - 0.47 * LRWB],
  dims: { L: 175 * IN, W: 66 * IN, H: 81 * IN, wheelbase: LRWB, track: LRT, clearance: 8.25 * IN, box: [4.45, 1.68, 1.4] },
  axles: [
    { z: -LRWB / 2, wheels: [0, 1], solid: true, freq: 1.5, bump: 0.085, droop: 0.09, zeta: [0.22, 0.32], rc: 0.62, driven: 'F', final: 4.7, diff: 'open' },
    { z: LRWB / 2, wheels: [2, 3], solid: true, freq: 1.75, bump: 0.10, droop: 0.10, zeta: [0.22, 0.32], rc: 0.66, driven: 'R', final: 4.7, diff: 'open' },
  ],
  wheels: quad(LRWB, LRT, LRT, '7.50-16'),
  steer: { max: 0.42, ackermann: 0.8, zRef: LRWB / 2, turns: 3.75 },   // 47 ft turning circle (LR CONFIRMED ~)
  engine: {
    name: '2286 cc 4-cyl petrol', diesel: false, disp: 2.29, installed: 0.95,
    curve: [[0, 90], [500, 130], [900, 152], [1500, 120 * LBFT], [2000, 160], [2500, 152], [3000, 143], [3500, 132], [4000, 70 * HP / (4000 / 60 * 2 * Math.PI)], [4500, 98], [5000, 70]],
    fric: [14, 4.2, 1.3], inertia: 0.24, idle: 600, stall: 270, redline: 4600, idleThr: 0.11, idleGain: 0.9, idleMax: 0.32,
    starter: { torque: 65, rpm: 240, catch: 160, crankTime: 0.45 }, clutchCap: 300, etaInd: [0.29, 0.33], oilPsi: 45, oilRpm: 2000,
  },
  // all-synchro 4-speed 3.68 / 2.22 / 1.50 / 1.00, R 4.02 (LR CONFIRMED); transfer high 1.148 / low 2.35; 4WD selectable in
  // high (yellow knob), always in low (LR CONFIRMED)
  gearbox: { ratios: [3.68, 2.22, 1.50, 1.00], reverse: 4.02, synchro: [true, true, true, true], pattern: 'R-1-2-3-4' },
  transfer: { high: 1.148, low: 2.35, front: 'parttime', lowLocks: true },
  drive: { gbI: 0.06, propI: 0.03, loss: 0.10, spinLoss: 3 },
  brakes: { front: 1250, rear: 900, park: 'prop', parkT: 700, air: null },   // transmission drum handbrake (LR CONFIRMED)
  aero: { CdA: 1.85 },                  // INFERRED to ~ 68 mph (LR "about 65-68 mph")
  fuel: { capacity: 16 * 4.546, type: 'petrol' },    // 16 imp gal (LR CONFIRMED)
  electrics: { volts: 12 },
  cooling: { thermostat: 82, heatFrac: 0.30, UA: 380, heatCap: 1.3e5 },
  water: { ford: 0.50, kit: false, sealed: false, intake: [0.3, 1.05, -1.6], ignition: [0.1, 0.72, -1.7],
    points: [[-0.7, 0.45, -1.9], [0.7, 0.45, -1.9], [-0.7, 0.45, 2.0], [0.7, 0.45, 2.0], [-0.8, 1.0, -1.9], [0.8, 1.0, -1.9], [-0.8, 1.0, 2.0], [0.8, 1.0, 2.0]], vol: 1.0, hullH: 0.6, area: 1.4 },
  hull: boxHull(4.45, 1.68, 0.30, 1.9, 0.1, [[-0.8, 2.0, -0.6], [0.8, 2.0, -0.6], [-0.8, 1.9, 2.1], [0.8, 1.9, 2.1]]),
  collide: spheres(4.45, 1.68, 0.75, 0.1, 0.32),
  seats: [
    { id: 'driver', role: 'driver', at: [0.42, 0.85, -0.45], eye: [0.42, 1.62, -0.5] },   // right-hand drive (UK/ Commonwealth export)
    { id: 'front', role: 'passenger', at: [-0.42, 0.85, -0.45], eye: [-0.42, 1.62, -0.5] },
    { id: 'mid', role: 'passenger', at: [0, 0.85, -0.45], eye: [0, 1.62, -0.5] },
  ],
  components: { engine: [-0.45, 0.5, -2.1, 0.45, 1.15, -1.2], radiator: [-0.45, 0.5, -2.3, 0.45, 1.1, -2.15], fuelTank: [0.1, 0.45, -0.7, 0.8, 0.75, -0.1], battery: [-0.7, 0.8, -1.6, -0.4, 1.0, -1.2], gearbox: [-0.25, 0.4, -1.2, 0.25, 0.75, -0.5] },
  published: { vmax: 105 / 3.6, ford: 0.5, turnCircle: 47 * FT },
  colours: [0x4d5b3f, 0x7f8a6a, 0x8b8466, 0x2f4a5c, 0xb8b29c],   // Bronze Green, Pastel Green, Sand, Marine Blue, Limestone
  roof: 0xd8d4c4,
});

// ---------------------------------------------------------------------------------------------- Toyota Hilux 4WD (1980)
const HXWB = 2.585, HXT = 1.39;
export const HILUX = car({
  id: 'hilux', name: 'Toyota Hilux 4WD (RN37)', side: 0, kind: 'pickup',
  mass: 1360, cg: [0, 0.68, HXWB / 2 - 0.56 * HXWB],   // 1,360 kg kerb (HX CONFIRMED ~); CG INFERRED; 56% front empty
  dims: { L: 4.40, W: 1.65, H: 1.71, wheelbase: HXWB, track: HXT, clearance: 0.22, box: [4.4, 1.65, 1.15] },
  axles: [
    { z: -HXWB / 2, wheels: [0, 1], solid: true, freq: 1.45, bump: 0.08, droop: 0.09, zeta: [0.25, 0.35], rc: 0.55, driven: 'F', final: 4.375, diff: 'open' },
    { z: HXWB / 2, wheels: [2, 3], solid: true, freq: 1.7, bump: 0.10, droop: 0.10, zeta: [0.22, 0.32], rc: 0.58, driven: 'R', final: 4.375, diff: 'open' },
  ],
  wheels: quad(HXWB, HXT, HXT, '7.00-15'),
  steer: { max: 0.56, ackermann: 0.85, zRef: HXWB / 2, turns: 3.6 },
  engine: {
    name: '20R 2.2 l 4-cyl petrol', diesel: false, disp: 2.19, installed: 1.0,   // SAE net already
    curve: [[0, 85], [600, 130], [1000, 145], [1800, 160], [2800, 122 * LBFT], [3400, 160], [4000, 150], [4800, 90 * HP / (4800 / 60 * 2 * Math.PI)], [5300, 118], [5800, 90]],
    fric: [12, 3.6, 1.0], inertia: 0.17, idle: 750, stall: 300, redline: 5400, idleThr: 0.1, idleGain: 0.9, idleMax: 0.3,
    starter: { torque: 55, rpm: 260, catch: 170, crankTime: 0.3 }, clutchCap: 280, etaInd: [0.30, 0.34], oilPsi: 50, oilRpm: 2500,
  },
  gearbox: { ratios: [3.58, 2.06, 1.38, 1.00], reverse: 3.80, synchro: [true, true, true, true], pattern: 'R-1-2-3-4' },   // UNVERIFIED (L40/L42 family)
  transfer: { high: 1.0, low: 2.28, front: 'parttime' },
  drive: { gbI: 0.05, propI: 0.03, loss: 0.09, spinLoss: 2.5 },
  brakes: { front: 1300, rear: 750, park: 'rear', parkT: 900, air: null },
  aero: { CdA: 1.25 },
  fuel: { capacity: 60, type: 'petrol' },
  electrics: { volts: 12 },
  cooling: { thermostat: 82, heatFrac: 0.30, UA: 360, heatCap: 1.1e5 },
  water: { ford: 0.45, kit: false, sealed: false, intake: [0.25, 0.95, -1.75], ignition: [0.1, 0.75, -1.6],
    points: [[-0.7, 0.45, -1.9], [0.7, 0.45, -1.9], [-0.7, 0.45, 2.0], [0.7, 0.45, 2.0], [-0.8, 0.95, -1.9], [0.8, 0.95, -1.9], [-0.8, 0.95, 2.0], [0.8, 0.95, 2.0]], vol: 1.0, hullH: 0.5, area: 1.3 },
  hull: boxHull(4.40, 1.65, 0.28, 1.0, 0.05, [[-0.7, 1.72, -0.75], [0.7, 1.72, -0.75], [-0.7, 1.72, 0.25], [0.7, 1.72, 0.25]]),
  collide: spheres(4.40, 1.65, 0.7, 0.05, 0.3),
  seats: [
    { id: 'driver', role: 'driver', at: [0.38, 0.78, -0.25], eye: [0.38, 1.48, -0.3] },   // RHD (Japan / UK / Commonwealth)
    { id: 'front', role: 'passenger', at: [-0.38, 0.78, -0.25], eye: [-0.38, 1.48, -0.3] },
    { id: 'bed', role: 'passenger', at: [0, 0.95, 1.2], eye: [0, 1.7, 1.2] },
  ],
  components: { engine: [-0.45, 0.45, -2.1, 0.45, 1.0, -1.25], radiator: [-0.45, 0.45, -2.25, 0.45, 1.0, -2.1], fuelTank: [-0.6, 0.35, 0.9, 0.2, 0.6, 1.6], battery: [0.4, 0.75, -1.7, 0.7, 0.95, -1.4], gearbox: [-0.25, 0.35, -1.25, 0.25, 0.7, -0.6] },
  published: { vmax: 145 / 3.6, ford: 0.45 },
  colours: [0xc8641e, 0xd8b23a, 0xe8e4d8, 0x5a7a46, 0x8a2a20],   // 1980 Hilux: orange, yellow, white, green, red
});

// ---------------------------------------------------------------------------------------------- VW Beetle 1200 (1980)
const VWWB = 2.40;
export const BEETLE = car({
  id: 'beetle', name: 'VW Beetle 1200', side: 0, kind: 'car',
  // 800 kg kerb (VW CONFIRMED ~780-820), 41% front (rear engine; VW CONFIRMED ~40/60), CG 0.52 m (INFERRED)
  mass: 800, cg: [0, 0.52, VWWB / 2 - 0.41 * VWWB],
  dims: { L: 4.06, W: 1.55, H: 1.50, wheelbase: VWWB, track: 1.31, clearance: 0.15, box: [4.06, 1.55, 1.1] },
  // front: twin trailing arms on torsion bars (camber ~fixed); rear: SWING AXLE on torsion bars, pivots at the gearbox ~0.33 m
  // up (rc) -> big camber gain (1 / ~0.75 m swing radius) and jacking: the famous tuck-under (INFERRED geometry)
  axles: [
    { z: -VWWB / 2, wheels: [0, 1], solid: false, freq: 1.25, bump: 0.08, droop: 0.08, zeta: [0.22, 0.32], rc: 0.05, camber0: 0.01, camberGain: 0.05, arb: 2500, driven: null },
    { z: VWWB / 2, wheels: [2, 3], solid: false, freq: 1.4, bump: 0.08, droop: 0.10, zeta: [0.22, 0.32], rc: 0.33, camber0: 0.0, camberGain: 1.3, driven: 'R', final: 4.375, diff: 'open' },
  ],
  wheels: quad(VWWB, 1.31, 1.35, '5.60-15'),
  steer: { max: 0.62, ackermann: 0.85, zRef: VWWB / 2, turns: 2.6 },
  engine: {
    name: '1192 cc air-cooled flat four', diesel: false, disp: 1.19, installed: 1.0, aircooled: true,
    curve: [[0, 45], [600, 62], [1200, 75], [2000, 82], [2800, 79], [3600, 25000 / (3600 / 60 * 2 * Math.PI)], [4000, 58], [4400, 45]],
    fric: [6, 2.4, 0.8], inertia: 0.13, idle: 850, stall: 330, redline: 4400, idleThr: 0.13, idleGain: 0.9, idleMax: 0.35,
    starter: { torque: 32, rpm: 260, catch: 170, crankTime: 0.35 }, clutchCap: 140, etaInd: [0.28, 0.31], oilPsi: 42, oilRpm: 2500,
  },
  gearbox: { ratios: [3.80, 2.06, 1.26, 0.89], reverse: 3.88, synchro: [true, true, true, true], pattern: 'R-1-2-3-4' },
  transfer: { high: 1.0, low: null, front: 'none' },
  drive: { gbI: 0.03, propI: 0.02, loss: 0.06, spinLoss: 1.5 },
  brakes: { front: 700, rear: 450, park: 'rear', parkT: 700, air: null },
  aero: { CdA: 0.85 },                  // Cd 0.48 x 1.78 m2 (VW CONFIRMED ~)
  fuel: { capacity: 40, type: 'petrol' },
  electrics: { volts: 12 },
  cooling: { thermostat: 90, heatFrac: 0.26, UA: 300, heatCap: 9e4 },    // air-cooled: "temperature" = cylinder head
  water: { ford: 0.30, kit: false, sealed: false, intake: [0.1, 0.85, 1.75], ignition: [0, 0.5, 1.55],
    points: [[-0.6, 0.3, -1.6], [0.6, 0.3, -1.6], [-0.6, 0.3, 1.6], [0.6, 0.3, 1.6], [-0.7, 0.8, -1.6], [0.7, 0.8, -1.6], [-0.7, 0.8, 1.6], [0.7, 0.8, 1.6]], vol: 1.2, hullH: 0.7, area: 1.2 },   // the Beetle famously floats a while (sealed floor pan), then fills
  hull: boxHull(4.06, 1.55, 0.22, 0.9, 0.05, [[-0.6, 1.5, -0.1], [0.6, 1.5, -0.1], [-0.55, 1.42, 0.65], [0.55, 1.42, 0.65]]),
  collide: spheres(4.06, 1.55, 0.6, 0.05, 0.3),
  seats: [
    { id: 'driver', role: 'driver', at: [-0.33, 0.55, -0.05], eye: [-0.33, 1.18, -0.1] },
    { id: 'front', role: 'passenger', at: [0.33, 0.55, -0.05], eye: [0.33, 1.18, -0.1] },
    { id: 'rearL', role: 'passenger', at: [-0.33, 0.55, 0.75], eye: [-0.33, 1.16, 0.75] },
    { id: 'rearR', role: 'passenger', at: [0.33, 0.55, 0.75], eye: [0.33, 1.16, 0.75] },
  ],
  components: { engine: [-0.5, 0.3, 1.25, 0.5, 0.85, 1.95], radiator: null, fuelTank: [-0.5, 0.45, -1.85, 0.5, 0.7, -1.35], battery: [0.2, 0.3, 0.75, 0.5, 0.5, 1.0], gearbox: [-0.3, 0.25, 0.75, 0.3, 0.55, 1.3] },
  published: { vmax: 115 / 3.6, ford: 0.3 },
  colours: [0x8fb3c9, 0xe07a24, 0xece8da, 0xc9372c, 0x6f8f3f, 0xe8c44a],   // 1980: light blue, orange, white, red, green, yellow
});

// ---------------------------------------------------------------------------------------------- Lada 2101
const LDWB = 2.424;
export const LADA = car({
  id: 'lada', name: 'Lada 2101 (VAZ-2101)', side: 0, kind: 'car',
  mass: 955, cg: [0, 0.54, LDWB / 2 - 0.53 * LDWB],   // 955 kg kerb (LD CONFIRMED), 53% front, CG INFERRED
  dims: { L: 4.073, W: 1.611, H: 1.44, wheelbase: LDWB, track: 1.349, clearance: 0.17, box: [4.07, 1.61, 1.05] },
  // front double wishbones + coils + anti-roll bar; rear live axle on coils, 4 links + Panhard rod (LD CONFIRMED layout)
  axles: [
    { z: -LDWB / 2, wheels: [0, 1], solid: false, freq: 1.25, bump: 0.08, droop: 0.08, zeta: [0.25, 0.35], rc: 0.07, camber0: 0, camberGain: 0.3, arb: 9000 },
    { z: LDWB / 2, wheels: [2, 3], solid: true, freq: 1.4, bump: 0.10, droop: 0.10, zeta: [0.22, 0.32], rc: 0.36, driven: 'R', final: 4.3, diff: 'open' },
  ],
  wheels: quad(LDWB, 1.349, 1.305, '155SR13'),
  steer: { max: 0.62, ackermann: 0.9, zRef: LDWB / 2, turns: 3.0 },
  engine: {
    name: 'VAZ-2101 1.2 l OHC petrol', diesel: false, disp: 1.198, installed: 1.0,
    curve: [[0, 45], [800, 64], [1500, 76], [2500, 83], [3400, 87], [4400, 84], [5000, 77], [5600, 47070 / (5600 / 60 * 2 * Math.PI)], [6000, 70], [6400, 58]],
    fric: [6, 2.2, 0.6], inertia: 0.11, idle: 850, stall: 330, redline: 6200, idleThr: 0.1, idleGain: 0.9, idleMax: 0.3,
    starter: { torque: 30, rpm: 280, catch: 180, crankTime: 0.3 }, clutchCap: 160, etaInd: [0.30, 0.34], oilPsi: 55, oilRpm: 3000,
  },
  gearbox: { ratios: [3.75, 2.30, 1.49, 1.00], reverse: 3.87, synchro: [true, true, true, true], pattern: 'R-1-2-3-4' },
  transfer: { high: 1.0, low: null, front: 'none' },
  drive: { gbI: 0.03, propI: 0.02, loss: 0.06, spinLoss: 1.5 },
  brakes: { front: 950, rear: 420, park: 'rear', parkT: 650, air: null },   // front discs, rear drums (LD CONFIRMED)
  aero: { CdA: 0.85 },
  fuel: { capacity: 39, type: 'petrol' },
  electrics: { volts: 12 },
  cooling: { thermostat: 80, heatFrac: 0.30, UA: 300, heatCap: 8e4 },
  water: { ford: 0.30, kit: false, sealed: false, intake: [0.2, 0.8, -1.55], ignition: [0, 0.7, -1.45],
    points: [[-0.6, 0.3, -1.7], [0.6, 0.3, -1.7], [-0.6, 0.3, 1.7], [0.6, 0.3, 1.7], [-0.75, 0.75, -1.7], [0.75, 0.75, -1.7], [-0.75, 0.75, 1.7], [0.75, 0.75, 1.7]], vol: 1.6, hullH: 0.6, area: 1.2 },
  hull: boxHull(4.07, 1.61, 0.22, 0.85, 0.0, [[-0.6, 1.42, -0.2], [0.6, 1.42, -0.2], [-0.6, 1.4, 0.6], [0.6, 1.4, 0.6]]),
  collide: spheres(4.07, 1.61, 0.58, 0.0, 0.3),
  seats: [
    { id: 'driver', role: 'driver', at: [-0.35, 0.52, -0.05], eye: [-0.35, 1.13, -0.1] },
    { id: 'front', role: 'passenger', at: [0.35, 0.52, -0.05], eye: [0.35, 1.13, -0.1] },
    { id: 'rearL', role: 'passenger', at: [-0.35, 0.52, 0.8], eye: [-0.35, 1.12, 0.8] },
    { id: 'rearR', role: 'passenger', at: [0.35, 0.52, 0.8], eye: [0.35, 1.12, 0.8] },
  ],
  components: { engine: [-0.45, 0.35, -1.95, 0.45, 0.85, -1.15], radiator: [-0.45, 0.35, -2.05, 0.45, 0.8, -1.95], fuelTank: [-0.55, 0.45, 1.1, 0.55, 0.7, 1.6], battery: [0.35, 0.6, -1.5, 0.65, 0.8, -1.2], gearbox: [-0.25, 0.3, -1.15, 0.25, 0.6, -0.5] },
  published: { vmax: 142 / 3.6, acc0100: 20, ford: 0.3 },
  colours: [0xe9e4d2, 0xd8c79a, 0x9b2a24, 0x2f6a8a, 0x8fa36a, 0xd9a03a],   // white, beige, cherry, blue, olive, "Kalahari"
});

export const CIVILIANS = { landrover: LANDROVER, hilux: HILUX, beetle: BEETLE, lada: LADA };
