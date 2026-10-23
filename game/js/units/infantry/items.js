// NGC-1980 item database: 1980 US Marine kit, weapons, ammunition, medical items and rations, plus the RUNAWAY's
// futuristic kit and the modern (2010-2035) stocks they seized before the jump. Pure data + tiny helpers: no DOM, no
// THREE, runs in node (tools/medinvbench.mjs).
//
// Every number carries a tag: CONFIRMED = from a published source (S.<key> below), INFERRED = derived from a source or
// estimated from similar items, UNVERIFIED = a plausible figure we could not check. FICTION = RUNAWAY technology.
//
// Grid sizes are abstract Tarkov-style cells (roughly a hand's width, ~10 cm): a rifle is 5x2, a magazine 1x2, a
// grenade 1x1. Weights are real (kg). Container items carry `grids` (where items go) and/or `slots` (named sockets:
// a weapon's magazine well, the LC-2 belt's pouch keepers). Interfaces for other modules:
//   ROUNDS[id]   ballistic data per cartridge (mass, muzzle velocity, diameter, BC, wound behaviour) - shared with the
//                INFANTRY ballistics module, which should take its numbers from here (one source of truth).
//   MATS[id]     armour materials (penetration thresholds per projectile class), used by medical.js.
//   ITEMS[id]    item definitions, used by inventory.js (grids, weights) and medical.js (med blocks, armour blocks).
//   FRAGS[id]    fragment presets for grenades / 40 mm / shells (medical.fragmentHit turns them into hit-infos).

// ---------------------------------------------------------------------------------------------------------------- sources
export const S = {
  TM16: 'TM 9-1005-249-10, Operator\'s Manual M16A1 Rifle (1977/1985): weights, 991 m/s M193 from a 20 in barrel',
  FM2367: 'FM 23-67 Machinegun 7.62-mm M60 (1984): 10.5 kg gun, 838 m/s M80',
  FM2331: 'FM 23-31 40-mm Grenade Launcher M203 (1972/1994): 1.36 kg launcher, M406 HE 0.23 kg, 5 m kill / 130 m casualty radius',
  FM2333: 'FM 23-33 66-mm HEAT Rocket M72A2 (1975): 2.3 kg, 0.67 m closed',
  FM2335: 'FM 23-35 Combat Training with Pistols M1911A1 (1988): 1.1 kg, .45 ball 14.9 g at 253 m/s',
  FM32330: 'FM 3-23.30 Grenades and Pyrotechnic Signals: M67 0.4 kg, 5 m fatality / 15 m casualty radius; M18 0.54 kg',
  FM2123: 'FM 23-23 Antipersonnel Mine M18A1 Claymore: 1.6 kg mine, bandolier set 1.6 kg+',
  FM2118: 'FM 21-18 Foot Marches (1990): fighting load 48 lb (22 kg), approach march load 72 lb (33 kg), emergency 150 lb',
  FM2111: 'FM 21-11 First Aid for Soldiers (1977/1988 ed.): field dressing, improvised tourniquet (cravat + windlass), splints, sucking chest wound sealed with the dressing wrapper',
  ATLS: 'ATLS Student Course Manual 10th ed. (2018), table 3-1 haemorrhagic shock classes I-IV (blood volume 7% of body weight)',
  KRAGH: 'Kragh et al., Survival with emergency tourniquet use to stop bleeding in major limb trauma, Ann Surg 2009; Kragh, J Trauma 2008 (2 h safe ischaemia)',
  WALTERS: 'Walters et al., Laboratory evaluation of battlefield tourniquets in human volunteers, USAISR 2005 (CAT 100% occlusion; strap types poor)',
  CATMFR: 'North American Rescue CAT Gen 7 data sheet: 2.7 oz (77 g)',
  QCMFR: 'Z-Medica QuikClot Combat Gauze instructions: pack the wound, hold 3 minutes of direct pressure',
  SAMMFR: 'SAM Medical SAM Splint 36 in: 4 oz (113 g)',
  FACKLER: 'Fackler, Wound ballistics: a review of common misconceptions, JAMA 1988; Fackler et al. 1984 (M193 fragments above ~2700 ft/s; M80 yaws at ~16 cm; AK-47 at ~26 cm; 5.45 7N6 yaws at ~7 cm)',
  NATICK: 'US Army Natick Soldier Center ration fact sheets (MRE ~1250 kcal, ~0.6 kg); MCI / LRP histories',
  MORPH: 'Morphine pharmacology (Goodman & Gilman): IM peak 30-60 min, elimination half-life 2-3 h; respiratory depression dose-related',
  NIJ: 'NIJ 0101.04 / 0101.06 body armour levels: IIIA stops .44 Magnum 15.6 g at 436 m/s; ESAPI (Level IV class) stops .30-06 M2 AP',
  MILV50: 'MIL-STD-662F V50 ballistic test; 17-grain (1.1 g) .22 cal fragment-simulating projectile (FSP)',
  M69: 'US Army Natick history of body armour: M69 fragmentation vest, 12-ply ballistic nylon, ~8.5 lb, fragments only',
  M1HELM: 'M1 helmet: Hadfield manganese steel shell ~2.25 lb + liner; designed against shell fragments and pistol ball at low velocity',
  ALICE: 'TM 10-8465-236-10 / SB 10-523: ALICE components (LC-2 belt, small arms ammunition case holds 3 x 20- or 30-rd magazines, canteen cover, first-aid case, medium pack)',
  UNIT1: 'US Navy Hospital Corpsman Unit One medical bag (Vietnam era to 1980s) contents lists',
  BAND: 'TM 43-0001-27 small arms ammunition data: M193 ball 11.8 g cartridge, issued 10-rd stripper clips, bandolier 140 rds (7 pockets x 2 clips) with charger',
};

// ------------------------------------------------------------------------------------------------------------ cartridges
// proj: penetration class vs armour (fsp = fragment / fragment-simulating, lead = soft lead-core pistol ball, rifle =
// jacketed rifle ball), pen = hardness multiplier on top of the class (steel penetrator 1.2-1.6, AP core 1.8-2.0).
// neckCm: tissue path before the bullet yaws (narrow channel); fragV: impact speed above which it fragments (m/s).
// bc: G1 ballistic coefficient, used only by approxVelocity() below (sandbox); the INFANTRY ballistics module owns flight.
export const ROUNDS = {
  M193:  { cal: '556', name: '5.56x45 M193 BALL', bulletG: 3.56, cartG: 11.8, v0: 991, diaMm: 5.70, bc: 0.243, proj: 'rifle', pen: 1.0, neckCm: 12, fragV: 823, tag: 'CONFIRMED', src: 'TM16,FACKLER,BAND' },
  M196:  { cal: '556', name: '5.56x45 M196 TRACER', bulletG: 3.50, cartG: 11.6, v0: 991, diaMm: 5.70, bc: 0.24, proj: 'rifle', pen: 1.0, neckCm: 12, fragV: 850, tracer: true, tag: 'INFERRED', src: 'TM16' },
  M855:  { cal: '556', name: '5.56x45 M855 (seized)', bulletG: 4.02, cartG: 12.3, v0: 948, diaMm: 5.70, bc: 0.304, proj: 'rifle', pen: 1.25, neckCm: 12, fragV: 760, tag: 'CONFIRMED', src: 'FACKLER (M855 62 gr, 3100 ft/s from 20 in)' },
  M855A1:{ cal: '556', name: '5.56x45 M855A1 EPR (seized)', bulletG: 4.02, cartG: 12.3, v0: 961, diaMm: 5.70, bc: 0.31, proj: 'rifle', pen: 1.6, neckCm: 8, fragV: 0, tag: 'INFERRED', src: 'US Army PEO Soldier M855A1 fact sheet (yaw-independent fragmentation)' },
  M80:   { cal: '762n', name: '7.62x51 M80 BALL', bulletG: 9.53, cartG: 25.4, v0: 838, diaMm: 7.82, bc: 0.40, proj: 'rifle', pen: 1.0, neckCm: 16, fragV: 99999, tag: 'CONFIRMED', src: 'FM2367,FACKLER' },
  M62:   { cal: '762n', name: '7.62x51 M62 TRACER', bulletG: 9.33, cartG: 25.0, v0: 838, diaMm: 7.82, bc: 0.39, proj: 'rifle', pen: 1.0, neckCm: 16, fragV: 99999, tracer: true, tag: 'INFERRED', src: 'FM2367' },
  M1911: { cal: '45', name: '.45 ACP M1911 BALL', bulletG: 14.9, cartG: 21.1, v0: 253, diaMm: 11.48, bc: 0.15, proj: 'lead', pen: 1.0, neckCm: 40, fragV: 99999, tag: 'CONFIRMED', src: 'FM2335' },
  M882:  { cal: '9', name: '9x19 M882 BALL (seized)', bulletG: 8.0, cartG: 12.0, v0: 375, diaMm: 9.01, bc: 0.14, proj: 'lead', pen: 1.05, neckCm: 30, fragV: 99999, tag: 'CONFIRMED', src: 'TM 43-0001-27 (M882 124 gr, 1230 ft/s)' },
  PS:    { cal: '762r', name: '7.62x39 57-N-231 PS', bulletG: 7.9, cartG: 16.2, v0: 718, diaMm: 7.92, bc: 0.30, proj: 'rifle', pen: 1.15, neckCm: 26, fragV: 99999, tag: 'CONFIRMED', src: 'FACKLER (AK-47 yaws at 26 cm); AKM manual 715 m/s' },
  N7N6:  { cal: '545', name: '5.45x39 7N6', bulletG: 3.42, cartG: 10.2, v0: 880, diaMm: 5.60, bc: 0.33, proj: 'rifle', pen: 1.2, neckCm: 7, fragV: 99999, tag: 'CONFIRMED', src: 'FACKLER (7N6 yaws at ~7 cm); AK-74 manual 900 m/s' },
  RWN:   { cal: 'rw', name: 'RW 3 mm NEEDLE (rail)', bulletG: 0.9, cartG: 1.4, v0: 1500, diaMm: 3.0, bc: 0.2, proj: 'rifle', pen: 3.0, neckCm: 4, fragV: 99999, tag: 'FICTION', src: '' },
};

// Simple flat-fire velocity decay v(x) = v0 exp(-x * 2.61e-4 / BC). Calibrated so M193 is 718 m/s at 300 m (published
// ~725) and M80 689 m/s at 300 m (published 689): good to ~5% inside 500 m. INFERRED; for the sandbox and bench only.
export function approxVelocity(roundId, rangeM, v0) {
  const r = ROUNDS[roundId]; return (v0 ?? r.v0) * Math.exp(-rangeM * 2.61e-4 / r.bc);
}

// ---------------------------------------------------------------------------------------------------------- fragments
// Grenade / shell fragment presets: a hit-info generator in medical.js draws a mass and slows it with range
// (v = v0 exp(-x / decayM)). INFERRED from Gurney velocities (~1200-1500 m/s for Comp B steel cases) and the published
// casualty radii: an M67 fragment must still wound (> ~80 J) at 15 m and rarely beyond 30 m.
export const FRAGS = {
  M67:  { name: 'M67 FRAG', massG: [0.15, 0.6], v0: 1500, decayM: 7.5, count: 4000, killR: 5, casR: 15, tag: 'INFERRED', src: 'FM32330' },
  M406: { name: '40mm M406 HE', massG: [0.1, 0.4], v0: 1500, decayM: 9, count: 3000, killR: 5, casR: 130, tag: 'INFERRED', src: 'FM2331 (casualty radius is to 50% of exposed men, statistically)' },
  ART:  { name: '105mm SHELL', massG: [1, 12], v0: 1100, decayM: 40, count: 20000, killR: 15, casR: 35, tag: 'INFERRED', src: 'FM 6-40 lethal area figures' },
  RWB:  { name: 'RW CERAMIC BURST', massG: [0.3, 1.2], v0: 1800, decayM: 10, count: 3000, killR: 6, casR: 20, tag: 'FICTION', src: '' },
};

// ---------------------------------------------------------------------------------------------------------- armour mats
// t50: energy density (J/mm^2 of presented area) at which half the hits of that projectile class get through (V50),
// before the round's own pen multiplier; spread = logistic width as a fraction of t50; blunt = fraction of the energy
// of a STOPPED round passed to the body (back-face deformation); durK = durability lost per kJ stopped.
// Calibration (energy density = E / (pi d^2 / 4)):
//   M69 nylon: 17-gr FSP V50 ~380 m/s (1250 ft/s)            -> 79 J / 24.6 mm^2 = 3.2   INFERRED (MILV50, M69)
//   M1 steel:  17-gr FSP V50 ~320 m/s; stops .45 ball ~244 m/s -> 2.3 fsp / 4.4 lead     INFERRED (M1HELM)
//   soft IIIA: 17-gr FSP V50 ~600 m/s; stops .44 Mag (15.4)    -> 8 fsp / 19 lead        CONFIRMED level (NIJ), V50 INFERRED
//   ESAPI:     stops M2 AP (10.8 g, 868 m/s, 85 J/mm^2 x pen 2) -> rifle t50 210         CONFIRMED level (NIJ), INFERRED t50
//   ECH (UHMWPE helmet): stops some 7.62x39 PS (43 x 1.15)     -> rifle 55               INFERRED
//   RW lattice ceramic: stops every 1980 small-arms round       -> rifle 400              FICTION
export const MATS = {
  m69_nylon:   { name: 'BALLISTIC NYLON (M69)', t50: { fsp: 3.2, lead: 5.0, rifle: 3.2 }, spread: 0.18, blunt: 0.20, durK: 0.6, tag: 'INFERRED', src: 'M69,MILV50' },
  m1_steel:    { name: 'HADFIELD STEEL (M1)', t50: { fsp: 2.3, lead: 4.4, rifle: 6 }, spread: 0.18, blunt: 0.12, durK: 0.5, tag: 'INFERRED', src: 'M1HELM,MILV50' },
  soft3a:      { name: 'ARAMID SOFT IIIA', t50: { fsp: 8, lead: 19, rifle: 9 }, spread: 0.15, blunt: 0.16, durK: 0.4, tag: 'INFERRED', src: 'NIJ,MILV50' },
  esapi:       { name: 'B4C / UHMWPE PLATE', t50: { fsp: 60, lead: 120, rifle: 210 }, spread: 0.12, blunt: 0.07, durK: 0.25, tag: 'INFERRED', src: 'NIJ' },
  ech:         { name: 'UHMWPE HELMET (ECH)', t50: { fsp: 14, lead: 30, rifle: 55 }, spread: 0.15, blunt: 0.10, durK: 0.35, tag: 'INFERRED', src: 'NIJ' },
  rw_lattice:  { name: 'RW LATTICE CERAMIC', t50: { fsp: 80, lead: 200, rifle: 400 }, spread: 0.10, blunt: 0.04, durK: 0.12, tag: 'FICTION', src: '' },
};

// --------------------------------------------------------------------------------------------------------------- items
export const ITEMS = {};
const D = (id, o) => { ITEMS[id] = { id, w: 1, h: 1, stack: 1, kg: 0, era: '1980', tags: [], ...o }; };

// ---- weapons. weapon.cal must match the magazine's mag.cal; slots.mag accepts mag tags.
D('m16a1', { name: 'M16A1 RIFLE', short: 'M16A1', cat: 'weapon', tags: ['weapon', 'rifle', 'long'], w: 5, h: 2, kg: 2.89, icon: 'rifle', tag: 'CONFIRMED', src: 'TM16 (6.35 lb without magazine and sling)',
  slots: { mag: { accept: ['mag_556'] } }, weapon: { cal: '556', rpm: 800, modes: ['safe', 'semi', 'auto'], barrelIn: 20, vMul: 1 },
  desc: 'The Marine rifleman\'s weapon since Vietnam: forward assist, birdcage flash suppressor, 1:12 twist for the 55-grain M193. 20-round magazines.' });
D('m16a1_m203', { name: 'M16A1 / M203', short: 'M16+M203', cat: 'weapon', tags: ['weapon', 'rifle', 'long'], w: 5, h: 2, kg: 4.25, icon: 'rifle203', tag: 'CONFIRMED', src: 'TM16, FM2331 (+1.36 kg launcher)',
  slots: { mag: { accept: ['mag_556'] }, gl: { accept: ['r40'] } }, weapon: { cal: '556', rpm: 800, modes: ['safe', 'semi', 'auto'], barrelIn: 20, vMul: 1, gl: '40' },
  desc: 'Grenadier\'s rifle with the 40 mm M203 under the barrel. Break the breech forward, slide a round in, close. Leaf sight to 250 m, quadrant to 400 m.' });
D('m60', { name: 'M60 MACHINE GUN', short: 'M60', cat: 'weapon', tags: ['weapon', 'mg', 'long'], w: 6, h: 2, kg: 10.5, icon: 'mg', tag: 'CONFIRMED', src: 'FM2367 (23.15 lb)',
  slots: { mag: { accept: ['belt_762n'] } }, weapon: { cal: '762n', rpm: 550, modes: ['safe', 'auto'], barrelIn: 22, vMul: 1 },
  desc: 'The Pig. Belt-fed 7.62 NATO, open bolt, ~550 rounds a minute. Change the barrel after 200 rounds of rapid fire.' });
D('m1911a1', { name: 'M1911A1 PISTOL', short: 'M1911A1', cat: 'weapon', tags: ['weapon', 'pistol'], w: 2, h: 1, kg: 1.1, icon: 'pistol', tag: 'CONFIRMED', src: 'FM2335 (2.44 lb unloaded)',
  slots: { mag: { accept: ['mag_45'] } }, weapon: { cal: '45', rpm: 0, modes: ['safe', 'semi'], barrelIn: 5, vMul: 1 },
  desc: '.45 ACP, seven-round magazine. Carried by officers, NCOs, corpsmen and machine gunners.' });
D('m72a2', { name: 'M72A2 LAW', short: 'LAW', cat: 'weapon', tags: ['weapon', 'launcher', 'long'], w: 4, h: 1, kg: 2.3, icon: 'law', tag: 'CONFIRMED', src: 'FM2333 (5.1 lb, 0.67 m closed)',
  weapon: { cal: '66heat', rpm: 0, modes: ['safe', 'fire'], single: true }, loaded: true,
  desc: '66 mm disposable HEAT rocket. Pull the pins, extend the tube, arm, aim, squeeze. Throw the tube away.' });
D('akm', { name: 'AKM (CONTINGENT)', short: 'AKM', cat: 'weapon', tags: ['weapon', 'rifle', 'long'], w: 4, h: 2, kg: 3.1, icon: 'ak', tag: 'CONFIRMED', src: 'AKM manual (3.1 kg without magazine)',
  slots: { mag: { accept: ['mag_762r'] } }, weapon: { cal: '762r', rpm: 600, modes: ['safe', 'auto', 'semi'], barrelIn: 16.3, vMul: 1 },
  desc: 'Soviet contingent rifle. In the uneasy truce, trading for one is easier than asking.' });
D('m4a1_rw', { name: 'M4A1 (SEIZED, RW-REFIT)', short: 'M4A1 RW', cat: 'weapon', tags: ['weapon', 'rifle', 'long', 'modern'], w: 4, h: 2, kg: 3.4, era: 'modern', icon: 'm4', tag: 'INFERRED', src: 'M4A1 2.88 kg empty (TM 9-1005-319-10) + RW sensor pod ~0.5 kg',
  slots: { mag: { accept: ['mag_556'] } }, weapon: { cal: '556', rpm: 800, modes: ['safe', 'semi', 'auto'], barrelIn: 14.5, vMul: 0.95 },
  desc: 'A carbine from forty years in our future, flat-top rail, a cyan-striped RUNAWAY sensor pod bolted on. Takes our M16 magazines.' });
D('rw_needler', { name: 'RW-2 NEEDLE CARBINE', short: 'RW-2', cat: 'weapon', tags: ['weapon', 'rifle', 'long', 'rw'], w: 4, h: 2, kg: 3.0, era: 'rw', icon: 'rwgun', tag: 'FICTION', src: '',
  slots: { mag: { accept: ['mag_rw'] } }, weapon: { cal: 'rw', rpm: 1200, modes: ['safe', 'semi', 'burst'], barrelIn: 12, vMul: 1 },
  desc: 'Matte ceramic, no sights, no trigger guard made for a human finger. Rails 3 mm needles at 1500 m/s.' });

// ---- magazines (mag.cap rounds; LIFO ammo segments live on the instance). loadS: seconds per round thumbed in.
D('mag_m16_20', { name: 'M16 MAGAZINE 20-RD', short: '20RD', cat: 'mag', tags: ['mag', 'mag_556'], w: 1, h: 2, kg: 0.091, icon: 'mag20', mag: { cal: '556', cap: 20, loadS: 0.9, unloadS: 0.4 }, tag: 'INFERRED', src: 'TM16 (loaded 0.7 lb = 0.32 kg: 91 g + 20 x 11.8 g)',
  desc: 'Straight aluminium 20-rounder. Old hands load 18 so the spring feeds reliably.' });
D('mag_m16_30', { name: 'M16 MAGAZINE 30-RD', short: '30RD', cat: 'mag', tags: ['mag', 'mag_556'], w: 1, h: 2, kg: 0.117, icon: 'mag30', mag: { cal: '556', cap: 30, loadS: 0.9, unloadS: 0.4 }, tag: 'INFERRED', src: 'TM16 (loaded ~1.0 lb)',
  desc: 'Curved 30-round magazine. Scarce in Marine units in 1980.' });
D('mag_45', { name: 'M1911 MAGAZINE 7-RD', short: '.45 MAG', cat: 'mag', tags: ['mag', 'mag_45'], w: 1, h: 1, kg: 0.07, icon: 'magp', mag: { cal: '45', cap: 7, loadS: 0.8, unloadS: 0.4 }, tag: 'INFERRED', src: 'FM2335' });
D('belt_m60_100', { name: 'M60 BELT 100-RD', short: 'BELT', cat: 'mag', tags: ['mag', 'belt_762n'], w: 2, h: 2, kg: 0.42, icon: 'belt', mag: { cal: '762n', cap: 100, loadS: 0.6, unloadS: 0.2 }, tag: 'INFERRED', src: 'FM2367 (M13 links ~3.6 g each + cloth bandolier; 100 linked ~3.0 kg)',
  desc: '100 linked rounds, 4 ball to 1 tracer, in a cloth bandolier.' });
D('mag_akm_30', { name: 'AKM MAGAZINE 30-RD', short: 'AK MAG', cat: 'mag', tags: ['mag', 'mag_762r'], w: 1, h: 2, kg: 0.33, icon: 'magak', mag: { cal: '762r', cap: 30, loadS: 0.9, unloadS: 0.4 }, tag: 'INFERRED', src: 'slab-side steel magazine ~330 g' });
D('mag_pmag', { name: 'PMAG 30 (SEIZED)', short: 'PMAG', cat: 'mag', tags: ['mag', 'mag_556', 'modern'], w: 1, h: 2, kg: 0.135, era: 'modern', icon: 'mag30', mag: { cal: '556', cap: 30, loadS: 0.9, unloadS: 0.4 }, tag: 'CONFIRMED', src: 'Magpul PMAG 30 Gen M3 4.8 oz',
  desc: 'Polymer magazine from the future. Fits the M16A1.' });
D('mag_rw', { name: 'RW NEEDLE CELL 60', short: 'CELL', cat: 'mag', tags: ['mag', 'mag_rw', 'rw'], w: 1, h: 1, kg: 0.2, era: 'rw', icon: 'cell', mag: { cal: 'rw', cap: 60, loadS: 0.3, unloadS: 0.1 }, tag: 'FICTION', src: '' });

// ---- loose ammunition (stack = rounds per cell) and ammo boxes (box.round, box.n)
D('r_m193', { name: '5.56 M193 BALL', short: 'M193', cat: 'ammo', tags: ['ammo', 'ammo_556'], round: 'M193', stack: 60, kg: 0.0118, icon: 'round', tag: 'CONFIRMED', src: 'BAND' });
D('r_m196', { name: '5.56 M196 TRACER', short: 'M196', cat: 'ammo', tags: ['ammo', 'ammo_556'], round: 'M196', stack: 60, kg: 0.0116, icon: 'roundt', tag: 'INFERRED', src: 'BAND' });
D('r_m855a1', { name: '5.56 M855A1 (SEIZED)', short: 'M855A1', cat: 'ammo', tags: ['ammo', 'ammo_556', 'modern'], round: 'M855A1', stack: 60, kg: 0.0123, era: 'modern', icon: 'round', tag: 'INFERRED', src: '' });
D('r_m80', { name: '7.62 M80 BALL', short: 'M80', cat: 'ammo', tags: ['ammo', 'ammo_762n'], round: 'M80', stack: 40, kg: 0.0254, icon: 'round', tag: 'CONFIRMED', src: 'FM2367' });
D('r_45', { name: '.45 ACP BALL', short: '.45', cat: 'ammo', tags: ['ammo', 'ammo_45'], round: 'M1911', stack: 50, kg: 0.0211, icon: 'roundp', tag: 'CONFIRMED', src: 'FM2335' });
D('r_ps', { name: '7.62x39 PS', short: 'PS', cat: 'ammo', tags: ['ammo', 'ammo_762r'], round: 'PS', stack: 60, kg: 0.0162, icon: 'round', tag: 'CONFIRMED', src: '' });
D('r_rwn', { name: 'RW NEEDLES', short: 'NEEDLE', cat: 'ammo', tags: ['ammo', 'ammo_rw', 'rw'], round: 'RWN', stack: 240, kg: 0.0014, era: 'rw', icon: 'needle', tag: 'FICTION', src: '' });
D('r40_m406', { name: '40mm M406 HE', short: 'M406', cat: 'ammo', tags: ['ammo', 'r40', 'explosive'], round40: 'M406', stack: 1, kg: 0.23, icon: 'r40', tag: 'CONFIRMED', src: 'FM2331',
  desc: 'High-explosive 40 mm grenade. Arms 14-27 m from the muzzle. Kill radius 5 m.' });
D('r40_m433', { name: '40mm M433 HEDP', short: 'M433', cat: 'ammo', tags: ['ammo', 'r40', 'explosive'], round40: 'M433', stack: 1, kg: 0.23, icon: 'r40', tag: 'CONFIRMED', src: 'FM2331 (2 in of steel)' });
D('bando_m193', { name: 'BANDOLIER 140 M193', short: 'BANDO', cat: 'ammo', tags: ['ammo', 'ammobox', 'ammo_556'], w: 2, h: 2, kg: 0.12, icon: 'bando', box: { round: 'M193', n: 140, clip: 10, loadS: 0.3 }, tag: 'CONFIRMED', src: 'BAND (7 pockets x 2 stripper clips of 10, plus a magazine charger)',
  desc: 'Cotton bandolier, 14 ten-round stripper clips and the charger "spoon": loading from clips is three times faster than thumbing rounds.' });
D('can_m193', { name: 'AMMO CAN M2A1 840 M193', short: 'M2A1', cat: 'ammo', tags: ['ammo', 'ammobox', 'heavy'], w: 3, h: 2, kg: 2.6, icon: 'can', box: { round: 'M193', n: 840, clip: 10, loadS: 0.3 }, tag: 'INFERRED', src: 'BAND (6 bandoliers; can 2.6 kg; full ~12.5 kg)' });
D('can_m80', { name: 'AMMO CAN 200 M80 LINKED', short: 'M80 CAN', cat: 'ammo', tags: ['ammo', 'ammobox', 'heavy'], w: 3, h: 2, kg: 1.9, icon: 'can', box: { round: 'M80', n: 200, clip: 0, loadS: 0.4 }, tag: 'INFERRED', src: 'FM2367' });
D('box_45', { name: '.45 ACP BOX 50', short: '.45 BOX', cat: 'ammo', tags: ['ammo', 'ammobox'], w: 1, h: 1, kg: 0.03, icon: 'box', box: { round: 'M1911', n: 50, clip: 0, loadS: 0.8 }, tag: 'INFERRED', src: '' });
D('box_m855a1', { name: 'M855A1 CARTON 120 (SEIZED)', short: 'M855A1', cat: 'ammo', tags: ['ammo', 'ammobox', 'modern'], w: 2, h: 1, kg: 0.1, era: 'modern', icon: 'box', box: { round: 'M855A1', n: 120, clip: 10, loadS: 0.3 }, tag: 'INFERRED', src: '' });

// ---- grenades and explosives
D('m67', { name: 'M67 FRAG GRENADE', short: 'M67', cat: 'grenade', tags: ['grenade', 'explosive'], kg: 0.4, icon: 'grenade', throwable: { fuseS: 4.5, frag: 'M67' }, tag: 'CONFIRMED', src: 'FM32330 (14 oz, 4-5.5 s fuse)',
  desc: 'Baseball grenade. 6.5 oz of Comp B in a steel body; fatal within 5 m, wounds to 15 m.' });
D('m18_green', { name: 'M18 SMOKE (GREEN)', short: 'SMOKE G', cat: 'grenade', tags: ['grenade', 'smoke'], kg: 0.54, icon: 'smoke', throwable: { fuseS: 1.5, smoke: 'green', burnS: 60 }, tag: 'CONFIRMED', src: 'FM32330 (19 oz, 50-90 s)' });
D('m18_red', { name: 'M18 SMOKE (RED)', short: 'SMOKE R', cat: 'grenade', tags: ['grenade', 'smoke'], kg: 0.54, icon: 'smoke', throwable: { fuseS: 1.5, smoke: 'red', burnS: 60 }, tag: 'CONFIRMED', src: 'FM32330' });
D('claymore', { name: 'M18A1 CLAYMORE', short: 'CLAYMORE', cat: 'grenade', tags: ['explosive', 'mine'], w: 2, h: 2, kg: 1.6, icon: 'claymore', tag: 'CONFIRMED', src: 'FM2123 (3.5 lb mine + bandolier, firing device, wire)',
  desc: 'FRONT TOWARD ENEMY. 700 steel balls in a 60-degree fan, lethal to 50 m.' });

// ---- carried gear and containers. `fixed` = part of the body (pockets), never dropped.
// grids: [{ w, h, accept?: [tags], deny?: [tags], label }]; an empty accept list = anything that fits.
D('pockets', { name: 'POCKETS (UTILITIES)', short: 'POCKETS', cat: 'container', tags: ['pockets'], fixed: true, kg: 0, icon: 'pouch',
  grids: [{ w: 1, h: 1, label: 'COAT L' }, { w: 1, h: 1, label: 'COAT R' }, { w: 1, h: 2, label: 'COAT LOW L' }, { w: 1, h: 2, label: 'COAT LOW R' }, { w: 1, h: 2, label: 'CARGO L' }, { w: 1, h: 2, label: 'CARGO R' }],
  tag: 'INFERRED', src: 'ERDL / OG-107 utility coat (4 bellows pockets) and trousers (2 cargo)' });
D('lc2_belt', { name: 'LC-2 BELT + SUSPENDERS', short: 'LC-2', cat: 'rig', tags: ['belt'], w: 3, h: 2, kg: 0.45, icon: 'belt2', tag: 'INFERRED', src: 'ALICE (belt ~0.2 kg, Y-suspenders ~0.25 kg)',
  // ALICE slide keepers: each keeper takes one pouch. Order = left to right around the waist.
  slots: { ammoL: { accept: ['pouch_ammo', 'pouch'], label: 'AMMO L' }, ammoR: { accept: ['pouch_ammo', 'pouch'], label: 'AMMO R' }, aid: { accept: ['pouch_aid', 'pouch'], label: 'FIRST AID' },
    canteenL: { accept: ['pouch_canteen', 'pouch'], label: 'CANTEEN L' }, canteenR: { accept: ['pouch_canteen', 'pouch'], label: 'CANTEEN R' }, etool: { accept: ['pouch_etool', 'pouch'], label: 'E-TOOL' }, bayonet: { accept: ['bayonet'], label: 'BAYONET' } },
  desc: 'Individual equipment belt with the Y-suspenders. Pouches hang on the belt with ALICE keepers.' });
D('pouch_ammo', { name: 'SMALL ARMS AMMO CASE', short: 'AMMO CASE', cat: 'pouch', tags: ['pouch', 'pouch_ammo'], w: 2, h: 2, kg: 0.16, icon: 'pouch',
  grids: [{ w: 1, h: 2, accept: ['mag', 'grenade'], label: '' }, { w: 1, h: 2, accept: ['mag', 'grenade'], label: '' }, { w: 1, h: 2, accept: ['mag', 'grenade'], label: '' }, { w: 1, h: 1, accept: ['grenade'], label: 'SLEEVE' }],
  tag: 'CONFIRMED', src: 'ALICE (3 magazines, a grenade strapped to each side; we model one sleeve)', desc: 'LC-2 ammo case: three M16 magazines, a grenade in the side sleeve.' });
D('pouch_aid', { name: 'FIRST AID / COMPASS CASE', short: 'AID CASE', cat: 'pouch', tags: ['pouch', 'pouch_aid'], kg: 0.04, icon: 'aidcase', grids: [{ w: 1, h: 1, accept: ['dressing', 'compass', 'medsmall'], label: '' }], tag: 'INFERRED', src: 'ALICE' });
D('pouch_canteen', { name: 'CANTEEN COVER', short: 'COVER', cat: 'pouch', tags: ['pouch', 'pouch_canteen'], w: 1, h: 2, kg: 0.15, icon: 'pouch', grids: [{ w: 1, h: 2, accept: ['canteen'], label: '' }, { w: 1, h: 1, accept: ['tablets', 'medsmall'], label: 'POCKET' }], tag: 'INFERRED', src: 'ALICE (cover with an outer pocket for water purification tablets)' });
D('pouch_etool', { name: 'E-TOOL CARRIER', short: 'E-TOOL C', cat: 'pouch', tags: ['pouch', 'pouch_etool'], w: 2, h: 2, kg: 0.2, icon: 'pouch', grids: [{ w: 2, h: 2, accept: ['etool'], label: '' }], tag: 'INFERRED', src: 'ALICE' });
D('m69_vest', { name: 'M69 FRAG VEST', short: 'M69', cat: 'armour', tags: ['vest', 'armour'], w: 3, h: 3, kg: 3.9, icon: 'vest', tag: 'INFERRED', src: 'M69 (8.5 lb, 12-ply ballistic nylon)',
  grids: [{ w: 1, h: 2, label: 'POCKET L' }, { w: 1, h: 2, label: 'POCKET R' }],
  armour: { durMax: 60, layers: [{ mat: 'm69_nylon', faces: ['front', 'back', 'side'], zones: { chest: 0.95, abdomen: 0.8, pelvis: 0.15, neck: 0.4, upperArm: 0.15 } }] },
  desc: 'Twelve plies of ballistic nylon with a high collar. Stops grenade and shell fragments. Does not stop rifle bullets. Hot.' });
D('m1_helmet', { name: 'M1 STEEL HELMET', short: 'M1', cat: 'armour', tags: ['helmet', 'armour'], w: 2, h: 2, kg: 1.36, icon: 'helmet', tag: 'INFERRED', src: 'M1HELM (steel shell + liner ~3.0 lb)',
  armour: { durMax: 40, layers: [{ mat: 'm1_steel', faces: ['front', 'back', 'side', 'top'], zones: { cranium: 0.8 } }] },
  desc: 'Manganese-steel pot with a fibre liner and a camouflage cover. Fragments and spent pistol ball.' });
D('alice_medium', { name: 'ALICE MEDIUM PACK', short: 'ALICE M', cat: 'pack', tags: ['pack'], w: 4, h: 4, kg: 1.36, icon: 'pack', tag: 'INFERRED', src: 'ALICE (medium pack without frame ~3 lb)',
  grids: [{ w: 5, h: 6, deny: ['pack'], label: 'MAIN' }, { w: 2, h: 2, label: 'POCKET L' }, { w: 2, h: 2, label: 'POCKET C' }, { w: 2, h: 2, label: 'POCKET R' }],
  desc: 'Medium all-purpose lightweight individual carrying equipment pack. Rides on the suspenders without a frame.' });
D('alice_large', { name: 'ALICE LARGE PACK + LC-1 FRAME', short: 'ALICE L', cat: 'pack', tags: ['pack'], w: 5, h: 5, kg: 3.6, icon: 'pack', tag: 'INFERRED', src: 'ALICE (large pack ~4.5 lb + frame ~3.5 lb)',
  grids: [{ w: 6, h: 7, deny: ['pack'], label: 'MAIN' }, { w: 2, h: 2, label: 'POCKET L' }, { w: 2, h: 2, label: 'POCKET C' }, { w: 2, h: 2, label: 'POCKET R' }, { w: 1, h: 2, label: 'SIDE L' }, { w: 1, h: 2, label: 'SIDE R' }] });
D('unit1_bag', { name: 'UNIT ONE MEDICAL BAG', short: 'UNIT ONE', cat: 'pack', tags: ['medbag', 'pouch'], w: 3, h: 2, kg: 0.9, icon: 'medbag', tag: 'INFERRED', src: 'UNIT1',
  grids: [{ w: 4, h: 3, accept: ['med', 'medsmall', 'dressing'], label: 'MAIN' }],
  med: { kind: 'woundcare', who: 'corpsman', uses: 6, time: { self: 240, buddy: 120 }, hpTo: 0.5 },
  desc: 'The Navy corpsman\'s bag. With it a corpsman can clean, debride and dress a ruined limb so it works again ("wound care", 6 uses of supplies).' });
D('plate_carrier_rw', { name: 'PLATE CARRIER (SEIZED, RW)', short: 'CARRIER', cat: 'armour', tags: ['vest', 'armour', 'modern'], w: 3, h: 3, kg: 10.8, era: 'modern', icon: 'carrier', tag: 'INFERRED', src: 'NIJ; IOTV Gen IV with ESAPI front/back ~ 10-12 kg',
  grids: [{ w: 1, h: 2, accept: ['mag', 'grenade'], label: 'MAG 1' }, { w: 1, h: 2, accept: ['mag', 'grenade'], label: 'MAG 2' }, { w: 1, h: 2, accept: ['mag', 'grenade'], label: 'MAG 3' }, { w: 2, h: 1, label: 'ADMIN' }, { w: 2, h: 2, accept: ['med', 'medsmall', 'dressing'], label: 'IFAK' }],
  armour: { durMax: 90, layers: [
    { mat: 'esapi', faces: ['front', 'back'], zones: { chest: 0.72, abdomen: 0.3 } },
    { mat: 'soft3a', faces: ['front', 'back', 'side'], zones: { chest: 0.97, abdomen: 0.85, pelvis: 0.35, neck: 0.3, upperArm: 0.2 } }] },
  desc: 'A modern ceramic plate carrier from 2030-something, scrubbed of its markings, cyan IFF strip on the shoulder. Stops our rifle rounds.' });
D('ech_helmet', { name: 'ECH HELMET (SEIZED)', short: 'ECH', cat: 'armour', tags: ['helmet', 'armour', 'modern'], w: 2, h: 2, kg: 1.4, era: 'modern', icon: 'helmet2', tag: 'INFERRED', src: 'NIJ',
  armour: { durMax: 55, layers: [{ mat: 'ech', faces: ['front', 'back', 'side', 'top'], zones: { cranium: 0.78 } }] } });
D('rw_carapace', { name: 'RW-1 CARAPACE SECTION', short: 'CARAPACE', cat: 'armour', tags: ['vest', 'armour', 'rw'], w: 3, h: 3, kg: 6.2, era: 'rw', icon: 'carapace', tag: 'FICTION', src: '',
  armour: { durMax: 140, layers: [{ mat: 'rw_lattice', faces: ['front', 'back', 'side'], zones: { chest: 0.9, abdomen: 0.85, pelvis: 0.5, neck: 0.2, upperArm: 0.3 } }] },
  desc: 'Torn from a STRIDER walker and strapped on with cargo straps. Pale ceramic lattice, still faintly warm.' });

// ---- tools and misc
D('etool', { name: 'ENTRENCHING TOOL', short: 'E-TOOL', cat: 'tool', tags: ['etool', 'tool'], w: 2, h: 2, kg: 1.1, icon: 'etool', tag: 'INFERRED', src: 'tri-fold e-tool ~2.5 lb' });
D('bayonet_m7', { name: 'M7 BAYONET + M8A1 SCABBARD', short: 'M7', cat: 'tool', tags: ['bayonet', 'tool'], w: 1, h: 2, kg: 0.45, icon: 'knife', tag: 'INFERRED', src: '' });
D('compass', { name: 'LENSATIC COMPASS', short: 'COMPASS', cat: 'tool', tags: ['compass', 'tool'], kg: 0.21, icon: 'compass', tag: 'INFERRED', src: '7.5 oz' });
D('flashlight', { name: 'MX-991/U FLASHLIGHT', short: 'LIGHT', cat: 'tool', tags: ['tool'], w: 1, h: 2, kg: 0.45, icon: 'flashlight', tag: 'INFERRED', src: 'angle-head, 2 D cells' });
D('p38', { name: 'P-38 CAN OPENER', short: 'P-38', cat: 'tool', tags: ['tool', 'p38'], kg: 0.005, icon: 'p38', tag: 'CONFIRMED', src: '1.5 in, ~5 g', desc: 'John Wayne. Opens a C-ration can in a minute; on your dog-tag chain.' });
D('poncho', { name: 'PONCHO', short: 'PONCHO', cat: 'misc', tags: ['misc'], w: 2, h: 2, kg: 0.85, icon: 'cloth', tag: 'INFERRED', src: '' });
D('poncho_liner', { name: 'PONCHO LINER', short: 'WOOBIE', cat: 'misc', tags: ['misc'], w: 2, h: 2, kg: 0.68, icon: 'cloth', tag: 'INFERRED', src: '1.5 lb' });
D('prc77', { name: 'AN/PRC-77 RADIO', short: 'PRC-77', cat: 'tool', tags: ['tool', 'radio', 'heavy'], w: 3, h: 4, kg: 6.2, icon: 'radio', tag: 'INFERRED', src: 'TM 11-5820-667-12 (~13.5 lb with battery)' });
D('rw_core', { name: 'RW SENSOR CORE', short: 'CORE', cat: 'loot', tags: ['loot', 'rw', 'intel'], w: 1, h: 1, kg: 0.3, era: 'rw', icon: 'core', tag: 'FICTION', src: '', desc: 'Intel: the S-2 wants every one of these.' });

// ---- water and food (hydration ml, energy kcal)
D('canteen_1qt', { name: 'CANTEEN 1-QT', short: 'CANTEEN', cat: 'drink', tags: ['canteen', 'drink'], w: 1, h: 2, kg: 0.13, icon: 'canteen', water: 946, tag: 'INFERRED', src: 'plastic 1-qt canteen ~4.6 oz empty, 946 ml',
  med: { kind: 'drink', sipMl: 250, time: { self: 6, buddy: 8 } } });
D('canteen_2qt', { name: 'CANTEEN 2-QT BLADDER', short: '2QT', cat: 'drink', tags: ['drink'], w: 2, h: 2, kg: 0.25, icon: 'bladder', water: 1893, tag: 'INFERRED', src: 'collapsible 2-qt canteen',
  med: { kind: 'drink', sipMl: 250, time: { self: 6, buddy: 8 } } });
D('tablets_iodine', { name: 'WATER PURIFICATION TABLETS', short: 'IODINE', cat: 'misc', tags: ['tablets'], stack: 50, kg: 0.0006, icon: 'pills', tag: 'INFERRED', src: 'Globaline, 50 per bottle' });
D('mci', { name: 'MEAL, COMBAT, INDIVIDUAL', short: 'C-RATS', cat: 'food', tags: ['food'], w: 2, h: 1, kg: 1.18, icon: 'ration', tag: 'INFERRED', src: 'NATICK (MCI 1958-1983, ~1200 kcal, ~2.6 lb)',
  med: { kind: 'eat', kcal: 1200, waterMl: 150, time: { self: 90, buddy: 90 }, needs: 'p38' },
  desc: 'C-rats: a meat can, a fruit can, crackers, cocoa, cigarettes, the B-unit. Needs a P-38. (The MRE was adopted in 1975 but reached the troops in 1983, so in 1980 the Marines still eat C-rats.)' });
D('lrp', { name: 'LRP RATION (FREEZE-DRIED)', short: 'LRP', cat: 'food', tags: ['food'], w: 1, h: 2, kg: 0.32, icon: 'pouchfood', tag: 'INFERRED', src: 'NATICK (Food Packet, Long Range Patrol, ~11 oz, ~1100 kcal; add ~0.5 l water)',
  med: { kind: 'eat', kcal: 1100, waterMl: -450, time: { self: 120, buddy: 120 } } });
D('mre_seized', { name: 'MRE (SEIZED, 2030s)', short: 'MRE', cat: 'food', tags: ['food', 'modern'], w: 2, h: 1, kg: 0.65, era: 'modern', icon: 'mre', tag: 'CONFIRMED', src: 'NATICK (~1250 kcal)',
  med: { kind: 'eat', kcal: 1250, waterMl: 0, time: { self: 75, buddy: 75 } }, desc: 'Brown plastic, a flameless heater, a date fifty years in the future. Jalapeno cheese spread.' });

// ---- medical, 1980. med.kind drives medical.js; time.self / time.buddy in seconds (per limb class where given).
// who: 'any' or 'corpsman' (corpsman-only skills). Effectiveness numbers are documented in medical.js.
D('dressing_field', { name: 'FIELD FIRST AID DRESSING', short: 'DRESSING', cat: 'med', tags: ['med', 'dressing', 'medsmall'], kg: 0.06, icon: 'dressing', tag: 'INFERRED', src: 'FM2111 (4 x 7 in, plastic wrapper)',
  med: { kind: 'dressing', who: 'any', uses: 1, time: { self: 40, buddy: 25 }, heavyMul: 0.3, arterialMul: 0.6, seal: true },
  desc: 'Pressure dressing with tails. Stops oozing, slows heavy bleeding. Its plastic wrapper, taped down on three sides, seals a sucking chest wound.' });
D('dressing_battle', { name: 'BATTLE DRESSING, LARGE', short: 'BTL DRSG', cat: 'med', tags: ['med', 'dressing'], w: 1, h: 1, kg: 0.17, icon: 'dressing2', tag: 'INFERRED', src: 'UNIT1',
  med: { kind: 'dressing', who: 'any', uses: 1, time: { self: 50, buddy: 30 }, heavyMul: 0.2, arterialMul: 0.5, seal: true } });
D('cravat', { name: 'CRAVAT (TRIANGULAR BANDAGE)', short: 'CRAVAT', cat: 'med', tags: ['med', 'medsmall'], kg: 0.06, icon: 'cravat', tag: 'INFERRED', src: 'FM2111 (improvised tourniquet with a stick windlass; sling; splint ties)',
  med: { kind: 'cravat', who: 'any', uses: 1, time: { self: 75, buddy: 45 }, tq: { p: { arm: 0.8, leg: 0.6 }, occl: [0.96, 1], fail: [0.3, 0.6], slipPerMin: 0.002, pain: 30 } },
  desc: 'Muslin triangle. On a bleeding limb: improvised tourniquet with a stick windlass. On a broken arm: sling and swathe.' });
D('tq_strap', { name: 'TOURNIQUET, STRAP & BUCKLE', short: 'TQ STRAP', cat: 'med', tags: ['med', 'medsmall', 'tourniquet'], kg: 0.07, icon: 'tq', tag: 'INFERRED', src: 'WALTERS (issue strap tourniquets poor on the thigh), KRAGH',
  med: { kind: 'tourniquet', who: 'any', uses: 1, time: { self: { arm: 120, leg: 45 }, buddy: 30 }, tq: { p: { arm: 0.85, leg: 0.3 }, occl: [0.96, 1], fail: [0.2, 0.5], slipPerMin: 0.004, pain: 25 } },
  desc: 'The 1960s issue tourniquet: a web strap through a friction buckle. Fine on an arm. On a thigh it rarely closes the femoral artery.' });
D('splint_wire', { name: 'SPLINT, WIRE LADDER', short: 'SPLINT', cat: 'med', tags: ['med', 'splint'], w: 1, h: 3, kg: 0.4, icon: 'splint', tag: 'INFERRED', src: 'UNIT1, FM2111',
  med: { kind: 'splint', who: 'any', uses: 1, time: { self: 120, buddy: 60 }, quality: 0.6 } });
D('morphine', { name: 'MORPHINE SYRETTE 16 MG', short: 'MORPHINE', cat: 'med', tags: ['med', 'medsmall', 'opioid'], kg: 0.02, icon: 'syrette', tag: 'UNVERIFIED', src: 'UNIT1 (1/4 grain = 16 mg morphine syrette)',
  med: { kind: 'opioid', who: 'any', uses: 1, time: { self: 10, buddy: 8 }, mg: 16, route: 'im' },
  desc: 'Squeeze-tube syrette. Pin the empty to the casualty\'s collar and mark an M on the forehead with the time. Two is a lot. Three can stop his breathing.' });
D('apc', { name: 'APC TABLETS', short: 'APC', cat: 'med', tags: ['med', 'medsmall'], stack: 10, kg: 0.001, icon: 'pills', tag: 'INFERRED', src: 'aspirin-phenacetin-caffeine, the corpsman\'s cure-all',
  med: { kind: 'tablet', who: 'any', uses: 1, time: { self: 5, buddy: 5 }, analgesia: 0.12, hours: 3 } });
D('iv_lr', { name: 'LACTATED RINGER\'S 1000 ML + IV SET', short: 'IV LR', cat: 'med', tags: ['med'], w: 1, h: 2, kg: 1.12, icon: 'ivbag', tag: 'INFERRED', src: 'UNIT1 (plastic bags replaced glass bottles in the 1970s)',
  med: { kind: 'iv', who: 'corpsman', uses: 1, time: { self: 240, buddy: 120 }, ml: 1000, mlPerMin: 70 },
  desc: 'Crystalloid. Restores volume, not red cells: only a third stays in the vessels after an hour, and pushing the pressure back up makes an uncontrolled bleed bleed faster.' });
D('ammonia', { name: 'AMMONIA INHALANT', short: 'AMMONIA', cat: 'med', tags: ['med', 'medsmall'], stack: 10, kg: 0.002, icon: 'ampoule', tag: 'INFERRED', src: 'UNIT1',
  med: { kind: 'inhalant', who: 'any', uses: 1, time: { self: 3, buddy: 4 } }, desc: 'Smelling salts: rouse a man who fainted or got his bell rung. Useless against shock.' });
D('needle_14g', { name: '14G CATHETER (DECOMPRESSION)', short: '14G', cat: 'med', tags: ['med', 'medsmall'], kg: 0.01, icon: 'needle', tag: 'UNVERIFIED', src: 'needle thoracostomy by corpsmen in 1980 is not well documented',
  med: { kind: 'decompress', who: 'corpsman', uses: 1, time: { self: 60, buddy: 25 } }, desc: '2nd intercostal space, mid-clavicular line, over the top of the third rib. Corpsmen only.' });

// ---- medical, modern (seized before the jump: ANACHRONISMS in 1980)
D('tq_cat', { name: 'CAT TOURNIQUET (GEN 7)', short: 'CAT', cat: 'med', tags: ['med', 'medsmall', 'tourniquet', 'modern'], kg: 0.077, era: 'modern', icon: 'cat', tag: 'CONFIRMED', src: 'CATMFR, WALTERS (100% occlusion in volunteers)',
  med: { kind: 'tourniquet', who: 'any', uses: 1, time: { self: { arm: 30, leg: 25 }, buddy: 18 }, tq: { p: { arm: 0.99, leg: 0.97 }, occl: [1, 1], fail: [0.5, 0.8], slipPerMin: 0, pain: 30 } },
  desc: 'Combat Application Tourniquet, black, windlass and clip. One-handed. It will not exist for another 25 years.' });
D('quikclot', { name: 'QUIKCLOT COMBAT GAUZE', short: 'QUIKCLOT', cat: 'med', tags: ['med', 'medsmall', 'modern'], kg: 0.03, era: 'modern', icon: 'gauze', tag: 'INFERRED', src: 'QCMFR (pack + 3 min pressure)',
  med: { kind: 'hemostatic', who: 'any', uses: 1, time: { self: 210, buddy: 190 }, arterial: 0.9, heavy: 1.0 },
  desc: 'Kaolin gauze. Pack it into the wound to the bone and hold pressure for three minutes. Works where a tourniquet can\'t: neck, armpit, groin.' });
D('sam_splint', { name: 'SAM SPLINT 36 IN', short: 'SAM', cat: 'med', tags: ['med', 'splint', 'modern'], w: 1, h: 2, kg: 0.113, era: 'modern', icon: 'sam', tag: 'CONFIRMED', src: 'SAMMFR (first made 1985)',
  med: { kind: 'splint', who: 'any', uses: 1, time: { self: 60, buddy: 35 }, quality: 0.85 } });
D('chest_seal', { name: 'HYFIN VENT CHEST SEAL', short: 'HYFIN', cat: 'med', tags: ['med', 'medsmall', 'modern'], kg: 0.03, era: 'modern', icon: 'seal', tag: 'INFERRED', src: 'TCCC guidelines (vented chest seals since 2013)',
  med: { kind: 'chestseal', who: 'any', uses: 1, time: { self: 20, buddy: 15 }, vented: true } });
D('fentanyl', { name: 'FENTANYL LOZENGE 800 MCG', short: 'OTFC', cat: 'med', tags: ['med', 'medsmall', 'opioid', 'modern'], kg: 0.01, era: 'modern', icon: 'lozenge', tag: 'INFERRED', src: 'TCCC (OTFC 800 mcg, ~10 mg IV morphine equivalent)',
  med: { kind: 'opioid', who: 'any', uses: 1, time: { self: 5, buddy: 5 }, mg: 12, route: 'otfc' } });
D('ifak', { name: 'IFAK II POUCH (SEIZED)', short: 'IFAK', cat: 'pouch', tags: ['pouch', 'modern'], w: 2, h: 2, kg: 0.3, era: 'modern', icon: 'ifak', grids: [{ w: 3, h: 2, accept: ['med', 'medsmall', 'dressing'], label: '' }], tag: 'INFERRED', src: '' });
D('rw_mender', { name: 'RW-M MENDER INJECTOR', short: 'MENDER', cat: 'med', tags: ['med', 'medsmall', 'rw'], w: 1, h: 1, kg: 0.15, era: 'rw', icon: 'injector', tag: 'FICTION', src: '',
  med: { kind: 'nanite', who: 'any', uses: 1, time: { self: 6, buddy: 5 }, seconds: 60 },
  desc: 'A cold white cylinder that hums when you hold it. Inject anywhere: the blood stops, the bone knits, the limb works. The veins glow cyan for an hour. Nobody knows what else it does.' });

// ---- world containers (not carryable: static). Loot crates and caches; a body is a soldier's whole inventory.
D('crate_ammo', { name: 'AMMO CRATE (WOODEN)', short: 'CRATE', cat: 'crate', tags: ['crate'], static: true, w: 6, h: 4, kg: 18, icon: 'crate', grids: [{ w: 8, h: 6, label: 'CRATE' }], searchS: 0.6, tag: 'INFERRED', src: '' });
D('crate_med', { name: 'MEDICAL CHEST', short: 'MED CHEST', cat: 'crate', tags: ['crate'], static: true, w: 5, h: 3, kg: 9, icon: 'crate', grids: [{ w: 6, h: 4, label: 'CHEST' }], searchS: 0.8, tag: 'INFERRED', src: '' });
D('rw_cache', { name: 'RW SUPPLY CACHE', short: 'RW CACHE', cat: 'crate', tags: ['crate', 'rw'], static: true, era: 'rw', w: 6, h: 4, kg: 30, icon: 'crate', grids: [{ w: 7, h: 5, label: 'CACHE' }], searchS: 1.2, tag: 'FICTION', src: '',
  desc: 'A seamless white box that opens along a line you could not see. Inside, modern human kit from forty years ahead, sorted by an inhuman logic.' });

// ---------------------------------------------------------------------------------------------------------- helpers
export const itemDef = id => { const d = ITEMS[id]; if (!d) throw new Error('unknown item ' + id); return d; };
export const hasTag = (def, t) => def.tags.includes(t) || def.id === t || def.cat === t;
// approximate loaded weight of a magazine def with n rounds of round r
export const roundKg = r => (ROUNDS[r]?.cartG ?? 0) / 1000;
export const ERA_LABEL = { '1980': '1980', modern: 'SEIZED MODERN', rw: 'RUNAWAY' };
