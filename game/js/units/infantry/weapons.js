// NGC-1980 infantry: the 1980 Marine rifleman's weapons as state machines. PURE: no THREE, no DOM (runs in node).
//
// M16A1 (semi / auto, 20-round magazines, closed bolt, bolt hold-open, forward assist, 1980 stoppages and the SPORTS
// immediate action), M16A1 + M203 (40 mm, quadrant sight), M60 (open bolt, 100-round belts, barrel heat and changes,
// bipod), M72A2 LAW (extend, arm, single shot, backblast), M1911A1 (.45, 7-round magazines, slide lock).
//
// What a weapon does each step: cool the barrel, advance the current manual action (reload, charging handle, barrel
// change...) along its keyframes, then the trigger: semi = one shot per press, auto = one per 60/rpm s while held.
// A shot rolls the stoppage dice (fouling, heat, magazine load, dirt), emits a 'shot' event with the round, muzzle
// velocity, dispersion and recoil impulse, then cycles: extract, eject, feed (or lock the bolt open on an empty mag).
// The host turns 'shot' into a projectile (ballistics.js) along the bore the soldier is holding (soldier.js); see
// rifleman.js for the whole loop.
//
// INVENTORY CONTRACT (MEDINV implements it; createSimpleInventory below is the reference implementation):
//   Ammunition lives in items: { id, kind: 'mag' | 'belt' | 'round' | 'barrel', fit, round, rounds, cap, ... }.
//   Partly used magazines stay items with their round count (a tactical reload stows the old magazine; a speed
//   reload drops it: the weapon emits { e: 'dropItem', item }).
//   inv.find(fit, prefer)  -> item | null    prefer: 'fullest' (default) | 'emptiest' | 'coolest' (barrels)
//   inv.remove(item)       -> bool           take it out of the pouches (into the hand)
//   inv.add(item)          -> bool           stow it (false = no room: the weapon drops it instead)
//   inv.count(fit)         -> total rounds of that fit carried (HUD / AI)
//   inv.totalKg()          -> carried mass (soldier.js load)
//   Item mass: itemMass(item) (empty magazine + cartridges).
import { ROUNDS, rngSeeded, gauss, MOA, zeroAngle, elevationFor } from './ballistics.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
let ITEM_ID = 1;

// ------------------------------------------------------------------------------------------------ ammunition items
// fit -> magazine / belt data. massEmpty in kg. Sources: TM 9-1005-249-10 (M16A1), FM 23-67 (M60), FM 23-35 (M1911A1).
export const FITS = {
  'M16-20':   { name: 'M16 20-rd magazine', kind: 'mag', cap: 20, round: 'M193', massEmpty: 0.091 },   // cap CONFIRMED; 3.2 oz aluminium INFERRED
  'M1911-7':  { name: 'M1911 7-rd magazine', kind: 'mag', cap: 7, round: 'M1911', massEmpty: 0.068 },  // cap CONFIRMED (FM 23-35); mass INFERRED
  'M60-belt': { name: 'M13-link belt (100)', kind: 'belt', cap: 100, round: 'M80', tracer: 'M62', tracerEvery: 5, massEmpty: 0, link: 0.0033 },   // 4 ball : 1 tracer CONFIRMED (FM 23-67); link mass INFERRED
  '40mm':     { name: '40mm grenade', kind: 'round', cap: 1, round: 'M433', massEmpty: 0 },
  'M60-barrel': { name: 'M60 spare barrel', kind: 'barrel', cap: 0, massEmpty: 3.7 },               // INFERRED (~8.2 lb with bipod-less barrel)
};
// a magazine / belt / grenade item. rounds defaults to full. tracerLast: tracers loaded at the bottom (empty warning)
export function makeItem(fit, rounds, o = {}) {
  const F = FITS[fit];
  const it = { id: o.id ?? ITEM_ID++, kind: F.kind, fit, name: F.name, round: o.round || F.round, rounds: rounds ?? F.cap, cap: F.cap, tracerLast: o.tracerLast || 0 };
  if (F.kind === 'barrel') Object.assign(it, { temp: o.temp ?? 21, wear: o.wear ?? 0 });
  return it;
}
export function itemMass(it) {
  const F = FITS[it.fit]; if (!F) return 0;
  if (F.kind === 'barrel') return F.massEmpty;
  return F.massEmpty + it.rounds * (ROUNDS[it.round].cart + (F.link || 0));
}
// reference inventory: a list of items (MEDINV replaces this with the real rig / pouches / backpack)
export function createSimpleInventory(items = [], { capacity = 40, extraKg = 0 } = {}) {
  const I = {
    items: items.slice(), extraKg,
    find(fit, prefer = 'fullest') {
      let best = null;
      for (const it of I.items) {
        if (it.fit !== fit) continue;
        if (it.kind !== 'barrel' && it.rounds <= 0 && prefer !== 'emptiest') continue;
        if (!best) { best = it; continue; }
        if (prefer === 'fullest' && it.rounds > best.rounds) best = it;
        else if (prefer === 'emptiest' && it.rounds < best.rounds) best = it;
        else if (prefer === 'coolest' && it.temp < best.temp) best = it;
      }
      return best;
    },
    remove(it) { const k = I.items.indexOf(it); if (k < 0) return false; I.items.splice(k, 1); return true; },
    add(it) { if (I.items.length >= capacity) return false; I.items.push(it); return true; },
    count(fit) { let n = 0; for (const it of I.items) if (it.fit === fit) n += it.rounds || 0; return n; },
    totalKg() { let m = I.extraKg; for (const it of I.items) m += itemMass(it); return m; },
    step(dt) { for (const it of I.items) if (it.kind === 'barrel') it.temp += (21 - it.temp) * (1 - Math.exp(-BARREL_K.M60 * 1.3 * dt)); },   // spare barrels cool in the open air
  };
  return I;
}

// ------------------------------------------------------------------------------------------------ weapon data
// Action keyframes: [fraction of the action, event]. The viewmodel animates the same names on the same fractions.
// Times in s for a trained Marine, unhurt (scaled up by arm injury / pain). INFERRED from drill videos / practice
// (M16 speed reload ~2.5 s, tactical ~4 s, M60 reload 8-10 s solo, barrel change ~6-10 s).
const BARREL_K = { M16A1: 0.0045, M60: 0.00265, M1911A1: 0.006, M203: 0.004, M72A2: 0 };   // Newton cooling 1/s
export const WEAPONS = {
  M16A1: {
    name: 'M16A1', cls: 'rifle', feed: 'mag', fit: 'M16-20', round: 'M193', tracerRound: 'M196',
    mass: 2.89, length: 0.99, barrel: 0.508,          // CONFIRMED: 6.35 lb without magazine, 39 in, 20 in barrel (TM 9-1005-249-10)
    rpm: 750, modes: ['safe', 'semi', 'auto'],         // CONFIRMED: cyclic 700-800 rpm (FM 23-9)
    closedBolt: true, holdOpen: true, forwardAssist: true,
    sight: { kind: 'aperture', radius: 0.500, height: 0.066, settings: [{ label: '0-300', zero: 250 }, { label: 'L', zero: 375 }] },
    //   sight radius CONFIRMED (19.75 in, FM 23-9); sight height INFERRED (2.6 in); short aperture 0-300 m / battlesight
    //   zero 250 m and the 'L' aperture for 300-500 m CONFIRMED (FM 23-9); L = 375 m zero INFERRED (middle of its band)
    disp: 0.9,                                         // MOA, 1 sigma per axis (about 3.5-4 MOA extreme spread): INFERRED
    gasV: 1250, charge: 0.00185,                       // propellant 28.5 gr (INFERRED), gas velocity ~4,000 fps (SAAMI rule)
    rise: 0.055, riseYaw: 0.02,                        // muzzle rise rad/s per N s of impulse (straight-line stock: low)
    heatPerShot: 2.2, cookoff: 300, heatFail: 750,     // C/shot; cook-off risk ~150 rounds rapid (TM 9-1005-249-10 warning): INFERRED fit
    malfBase: 1 / 2500, dud: 1 / 6000,                 // INFERRED (chromed-chamber M16A1 with M193, 1980)
    malfMix: { feed: 0.33, oob: 0.17, stovepipe: 0.15, extract: 0.17, double: 0.12, fire: 0.06 },
    ads: 0.28, swap: [0.7, 0.8],
    actions: {
      speed:   { dur: 2.4, keys: [[0.1, 'magRelease'], [0.2, 'dropMag'], [0.35, 'reach'], [0.55, 'draw'], [0.75, 'magIn'], [0.9, 'boltRelease']] },
      tactical:{ dur: 4.2, keys: [[0.08, 'magRelease'], [0.25, 'reach'], [0.42, 'stowMag'], [0.6, 'draw'], [0.8, 'magIn'], [0.92, 'boltRelease']] },
      charge:  { dur: 1.0, keys: [[0.25, 'chargeBack'], [0.6, 'chargeFwd']] },
      boltRelease: { dur: 0.45, keys: [[0.5, 'boltRelease']] },
      fa:      { dur: 0.5, keys: [[0.5, 'fa']] },
      ia:      { dur: 3.4, keys: [[0.12, 'slap'], [0.38, 'chargeBack'], [0.55, 'observe'], [0.7, 'chargeFwd'], [0.85, 'fa']] },   // SPORTS (FM 23-9)
      remedialStuck: { dur: 14, keys: [[0.1, 'magRelease'], [0.2, 'lockBolt'], [0.35, 'rodIn'], [0.75, 'rodOut'], [0.85, 'magIn'], [0.95, 'chargeFwd']] },
      remedialDouble:{ dur: 6.5, keys: [[0.1, 'lockBolt'], [0.25, 'magRelease'], [0.4, 'rack'], [0.55, 'rack'], [0.7, 'magIn'], [0.85, 'chargeBack'], [0.92, 'chargeFwd']] },
      checkMag:    { dur: 1.8, keys: [[0.2, 'magRelease'], [0.5, 'look'], [0.8, 'magIn']] },
      checkChamber:{ dur: 1.5, keys: [[0.3, 'pressCheck'], [0.55, 'look'], [0.8, 'pressRelease'], [0.9, 'fa']] },
      inspect: { dur: 3.2, keys: [[0.5, 'turn']] },
    },
  },
  M203: {   // the M203 itself; it rides under an M16A1 (see the 'M16A1/M203' loadout in rifleman.js)
    name: 'M203', cls: 'gl', feed: 'single', fit: '40mm', round: 'M433',
    mass: 1.36, length: 0.39, barrel: 0.305,            // CONFIRMED: 3 lb, 12 in barrel (FM 23-31)
    rpm: 0, modes: ['safe', 'fire'], closedBolt: true, holdOpen: false,
    sight: { kind: 'quadrant', height: 0.05, ranges: [50, 400, 25], leaf: [50, 250, 50] },   // CONFIRMED: quadrant 50-400 m by 25 m, leaf 50-250 m (FM 23-31)
    disp: 18, gasV: 0, charge: 0, rise: 0.035, riseYaw: 0.015, heatPerShot: 0.5, cookoff: 999, heatFail: 9999,
    malfBase: 1 / 800, dud: 1 / 400, malfMix: { fire: 1 },
    ads: 0.35, swap: [0.5, 0.5],
    actions: {
      reload: { dur: 3.6, keys: [[0.15, 'latch'], [0.3, 'open'], [0.45, 'ejectCase'], [0.55, 'reach'], [0.75, 'insert'], [0.9, 'close']] },
      open:   { dur: 1.0, keys: [[0.4, 'latch'], [0.8, 'open']] },
      ia:     { dur: 3.0, keys: [[0.3, 'open'], [0.5, 'ejectCase'], [0.8, 'close']] },
      inspect:{ dur: 3.0, keys: [[0.5, 'turn']] },
    },
  },
  M60: {
    name: 'M60', cls: 'mg', feed: 'belt', fit: 'M60-belt', round: 'M80', tracerRound: 'M62',
    mass: 10.5, length: 1.105, barrel: 0.56,            // CONFIRMED: 23 lb, 43.5 in, 22 in barrel (FM 23-67)
    rpm: 550, modes: ['safe', 'auto'],                  // CONFIRMED: cyclic 550 rpm, fires from an open bolt
    closedBolt: false, holdOpen: false, bipod: true,
    sight: { kind: 'leaf', radius: 0.55, height: 0.075, battle: 300, ranges: [300, 1100, 100] },   // leaf 300-1,100 m by 100 m: INFERRED (FM 23-67)
    disp: 1.8, gasV: 1250, charge: 0.00298,             // INFERRED; M80 propellant ~46 gr
    rise: 0.03, riseYaw: 0.02,
    heatPerShot: 0.95, cookoff: 450, heatFail: 800, barrelK: BARREL_K.M60,
    //   fit (INFERRED): Newton cooling k = 0.00265/s and 0.95 C/round put the barrel at ~500 C after 1 min at the cyclic
    //   rate (550 rounds) and after 10 min sustained at 100 rpm: FM 23-67's barrel-change points (CONFIRMED doctrine:
    //   change every 10 min sustained, every 2 min rapid (200 rpm), every 1 min cyclic). Our rapid lands at ~350 C (doctrine conservative).
    malfBase: 1 / 2000, dud: 1 / 6000, malfMix: { feed: 0.45, fire: 0.15, extract: 0.25, runaway: 0.15 },
    ads: 0.5, swap: [1.4, 1.6],
    actions: {
      reload:  { dur: 9.0, keys: [[0.1, 'coverOpen'], [0.25, 'clearBelt'], [0.45, 'reach'], [0.6, 'beltOn'], [0.75, 'coverClose'], [0.88, 'chargeBack'], [0.95, 'chargeFwd']] },
      charge:  { dur: 1.2, keys: [[0.35, 'chargeBack'], [0.7, 'chargeFwd']] },
      ia:      { dur: 3.0, keys: [[0.3, 'chargeBack'], [0.6, 'chargeFwd']] },   // FM 23-67: pull the cocking handle to the rear, push forward, re-lay, fire
      remedialStuck: { dur: 12, keys: [[0.1, 'coverOpen'], [0.3, 'clearBelt'], [0.5, 'rodIn'], [0.7, 'rodOut'], [0.85, 'coverClose'], [0.95, 'chargeBack']] },
      barrel:  { dur: 9.0, keys: [[0.15, 'barrelLatch'], [0.3, 'barrelOut'], [0.5, 'reach'], [0.7, 'barrelIn'], [0.85, 'barrelLatch']] },
      breakBelt: { dur: 0.8, keys: [[0.5, 'twist']] },   // runaway gun: twist the belt to break it
      checkChamber: { dur: 2.2, keys: [[0.2, 'coverOpen'], [0.6, 'look'], [0.85, 'coverClose']] },
      inspect: { dur: 3.5, keys: [[0.5, 'turn']] },
    },
  },
  M72A2: {
    name: 'M72A2 LAW', cls: 'law', feed: 'none', round: 'M72',
    mass: 2.36, length: 0.893, lengthClosed: 0.655, barrel: 0.893,   // CONFIRMED-ish: 5.2 lb, 35 in extended, 24.8 in closed (FM 23-33): INFERRED
    rpm: 0, modes: ['safe', 'fire'], closedBolt: false,
    sight: { kind: 'law', height: 0.07, ranges: [50, 350, 25] },     // front sight range lines 50-350 m: INFERRED
    disp: 10, gasV: 0, charge: 0, rise: 0, riseYaw: 0, heatPerShot: 0, cookoff: 999, heatFail: 9999,
    malfBase: 0, dud: 1 / 100, malfMix: { fire: 1 },                  // misfire ~1 %: INFERRED
    backblast: { danger: 40, cone: 60 },                              // 40 m danger area behind, 60 deg cone: INFERRED (FM 23-33)
    ads: 0.4, swap: [1.2, 1.0],
    actions: {
      extend:  { dur: 2.8, keys: [[0.15, 'pin'], [0.35, 'rearCover'], [0.6, 'extend'], [0.8, 'sights']] },
      arm:     { dur: 0.5, keys: [[0.6, 'arm']] },
      collapse:{ dur: 2.2, keys: [[0.3, 'safe'], [0.6, 'collapse']] },
      ia:      { dur: 2.0, keys: [[0.5, 'squeeze']] },                // misfire: re-squeeze the trigger bar (then wait / discard)
      inspect: { dur: 2.5, keys: [[0.5, 'turn']] },
    },
  },
  M1911A1: {
    name: 'M1911A1', cls: 'pistol', feed: 'mag', fit: 'M1911-7', round: 'M1911',
    mass: 1.1, length: 0.219, barrel: 0.127,            // CONFIRMED: 2.4 lb, 8.6 in, 5 in barrel (FM 23-35)
    rpm: 0, modes: ['safe', 'semi'], closedBolt: true, holdOpen: true,
    sight: { kind: 'notch', radius: 0.165, height: 0.018, settings: [{ label: 'fixed', zero: 25 }] },   // sight radius 6.5 in: INFERRED
    disp: 2.6, gasV: 380, charge: 0.00032,              // INFERRED (service-grade ~10 MOA extreme spread)
    rise: 0.16, riseYaw: 0.04, heatPerShot: 4, cookoff: 999, heatFail: 9999,
    malfBase: 1 / 1200, dud: 1 / 6000, malfMix: { feed: 0.4, stovepipe: 0.35, oob: 0.25 },
    ads: 0.22, swap: [0.55, 0.6],
    actions: {
      speed:   { dur: 2.0, keys: [[0.1, 'magRelease'], [0.2, 'dropMag'], [0.4, 'reach'], [0.55, 'draw'], [0.75, 'magIn'], [0.9, 'slideRelease']] },
      tactical:{ dur: 3.4, keys: [[0.1, 'magRelease'], [0.3, 'reach'], [0.45, 'stowMag'], [0.6, 'draw'], [0.8, 'magIn'], [0.92, 'slideRelease']] },
      charge:  { dur: 0.8, keys: [[0.4, 'chargeBack'], [0.7, 'chargeFwd']] },
      ia:      { dur: 1.6, keys: [[0.2, 'slap'], [0.5, 'chargeBack'], [0.75, 'chargeFwd']] },   // tap, rack
      checkMag:{ dur: 1.5, keys: [[0.25, 'magRelease'], [0.5, 'look'], [0.75, 'magIn']] },
      checkChamber: { dur: 1.3, keys: [[0.35, 'pressCheck'], [0.55, 'look'], [0.75, 'pressRelease']] },
      inspect: { dur: 2.6, keys: [[0.5, 'turn']] },
    },
  },
};
for (const [k, d] of Object.entries(WEAPONS)) { d.key = k; d.barrelK = d.barrelK ?? BARREL_K[k] ?? 0.004; }

// recoil: impulse = bullet momentum + propellant gas momentum (gas leaves at ~gasV); free recoil energy of the gun
export function recoilImpulse(def, v = ROUNDS[def.round].mv) { return ROUNDS[def.round].mass * v + def.charge * def.gasV; }
export function freeRecoil(def, gunMass = def.mass) { const J = recoilImpulse(def); return { J, v: J / gunMass, E: J * J / (2 * gunMass) }; }

// sight tables (lazy): bore elevation above the line of sight for each sight setting
const SIGHT_CACHE = new Map();
export function sightAngle(def, setting, atmos) {
  const key = def.key + ':' + setting;
  if (SIGHT_CACHE.has(key)) return SIGHT_CACHE.get(key);
  const S = def.sight, R = ROUNDS[def.round]; let a = 0;
  if (S.kind === 'aperture' || S.kind === 'notch') a = zeroAngle(R, S.settings[setting].zero, { sightHeight: S.height, atmos });
  else if (S.kind === 'leaf') a = zeroAngle(R, setting === 0 ? S.battle : S.ranges[0] + (setting - 1) * S.ranges[2], { sightHeight: S.height, atmos });
  else if (S.kind === 'quadrant' || S.kind === 'law') a = elevationFor(R, S.ranges[0] + setting * S.ranges[2], { atmos }) || 0;
  SIGHT_CACHE.set(key, a); return a;
}
// number of sight settings and a label for each
export function sightSettings(def) {
  const S = def.sight;
  if (S.settings) return S.settings.map(s => s.label);
  if (S.kind === 'leaf') { const o = ['BATTLE']; for (let r = S.ranges[0]; r <= S.ranges[1]; r += S.ranges[2]) o.push(r + ' m'); return o; }
  const o = []; for (let r = S.ranges[0]; r <= S.ranges[1]; r += S.ranges[2]) o.push(r + ' m'); return o;
}
export function sightRange(def, setting) {
  const S = def.sight;
  if (S.settings) return S.settings[setting].zero;
  if (S.kind === 'leaf') return setting === 0 ? S.battle : S.ranges[0] + (setting - 1) * S.ranges[2];
  return S.ranges[0] + setting * S.ranges[2];
}

// ------------------------------------------------------------------------------------------------ the weapon
// createWeapon(key, { rng, mag (item, loaded), chambered (bool), fouling, barrel (item for M60) })
export function createWeapon(key, o = {}) {
  const def = WEAPONS[key]; if (!def) throw new Error('unknown weapon ' + key);
  const rng = o.rng || rngSeeded(o.seed || 7);
  const W = {
    def, key, rng,
    mode: def.modes.length > 2 ? 1 : def.modes.length - 1,          // index into def.modes; rifles start SEMI
    mag: o.mag ?? null,                                               // magazine / belt item in the weapon
    chamber: null,                                                    // null | { round, state: 'live' | 'dud' | 'spent' }
    bolt: 'fwd',                                                      // 'fwd' | 'locked' (held open) | 'cocked' (M60 open bolt to the rear) | 'oob' (out of battery)
    malf: null,                                                       // null | 'feed' | 'stovepipe' | 'extract' | 'double' | 'dud' | 'oob' | 'runaway' | 'misfire'
    malfKnown: false,                                                 // the shooter has looked (press check / observe)
    barrel: def.key === 'M60' ? (o.barrel || makeItem('M60-barrel')) : { temp: 21, wear: 0 },
    fouling: o.fouling || 0, roundsFired: 0, sight: o.sight ?? 0, zeroClicks: [0, 0],
    act: null,                                                        // { name, t, dur, keys, k (next key), data }
    trig: false, cyc: 0, burst: 0, events: [], dirt: 0,
    bipod: false, law: key === 'M72A2' ? 'closed' : null,             // LAW: 'closed' | 'extended' | 'armed' | 'spent'
    gl: null,                                                         // attached M203 (createWeapon('M203'))
    lastInfo: null,                                                   // result of the last check (mag / chamber)
    get modeName() { return def.modes[W.mode]; },
    get rounds() { return (W.mag ? W.mag.rounds : 0) + (W.chamber && W.chamber.state === 'live' ? 1 : 0); },
    get busy() { return !!W.act; },
    get mass() { let m = def.mass + (W.mag ? itemMass(W.mag) : 0) + (W.chamber && W.chamber.state !== 'spent' ? ROUNDS[W.chamber.round].cart : 0); if (W.gl) m += W.gl.mass; if (key === 'M72A2' && W.law === 'spent') m = 0; return m; },
    // bore elevation above the line of sight for the current sight setting (+ zeroing clicks, 1 MOA each: INFERRED)
    // (the LAW's bore is parallel to its reticle centre line; you aim with the range line instead: lawLines())
    sightElevation(atmos) { return def.sight.kind === 'law' ? 0 : sightAngle(def, W.sight, atmos) + W.zeroClicks[0] * MOA; },
    lawLines(atmos) { const S = def.sight, o = []; for (let i = 0, r = S.ranges[0]; r <= S.ranges[1]; r += S.ranges[2], i++) o.push([r, sightAngle(def, i, atmos)]); return o; },
    sightWindage() { return W.zeroClicks[1] * MOA; },
    sightLabel() { return sightSettings(def)[W.sight]; },
    sightCount() { return sightSettings(def).length; },
  };
  const ev = (e, x) => { const o2 = { e, w: key }; if (x) Object.assign(o2, x); W.events.push(o2); return o2; };

  // initial state: loaded and (optionally) chambered
  if (def.key === 'M72A2') { W.chamber = { round: 'M72', state: 'live' }; }
  else if (W.mag && o.chambered !== false) {
    if (def.closedBolt && W.mag.rounds > 0) { W.mag.rounds--; W.chamber = { round: W.mag.round, state: 'live' }; }
    if (!def.closedBolt && def.feed === 'belt') W.bolt = 'cocked';
  }
  if (def.feed === 'single' && o.loaded !== false) W.chamber = { round: def.round, state: 'live' };
  W.magLoadedFull = !!(W.mag && W.mag.cap === 20 && W.mag.rounds >= 19);

  // ---------------------------------------------------------------- firing
  const roundFromFeed = () => {   // the next round off the magazine / belt (tracers by position)
    const m = W.mag; if (!m || m.rounds <= 0) return null;
    const F = FITS[m.fit]; let r = m.round;
    if (F.tracerEvery && ((m.cap - m.rounds) % F.tracerEvery === F.tracerEvery - 1)) r = F.tracer;
    else if (m.tracerLast && m.rounds <= m.tracerLast && def.tracerRound) r = def.tracerRound;
    m.rounds--; return r;
  };
  function stoppageChance() {
    const heat = W.barrel.temp > 350 ? 1 + (W.barrel.temp - 350) / 200 : 1;
    const magF = W.mag && def.feed === 'mag' && W.mag.cap === 20 && W.magLoadedFull ? 1.6 : 1;   // a full 20 on tired 1980 springs (Marines loaded 18)
    const foul = 1 + (W.fouling / 1200) ** 2;
    return def.malfBase * foul * heat * magF * (1 + 4 * W.dirt) * (1 + 2 * W.barrel.wear);
  }
  function pickMalf() {
    let r = W.rng(), last = null;
    for (const [k, p] of Object.entries(def.malfMix)) { last = k; if ((r -= p) <= 0) return k; }
    return last;
  }
  function fire(mods) {
    const ch = W.chamber, R = ROUNDS[ch.round];
    // the round goes off (or not)
    if (ch.state === 'dud' || W.rng() < def.dud) { ch.state = 'dud'; W.malf = def.key === 'M72A2' ? 'misfire' : 'dud'; W.malfKnown = false; ev('click'); return false; }
    const v = R.mv + gauss(W.rng) * R.mvSd - Math.max(0, W.barrel.wear) * 25;
    const heatDisp = 1 + Math.max(0, W.barrel.temp - 200) / 300;
    const sd = def.disp * MOA * heatDisp;
    const J = R.mass * v + def.charge * def.gasV;
    W.events.push({ e: 'shot', w: key, round: R.key, v, dy: gauss(W.rng) * sd, dx: gauss(W.rng) * sd, J, rise: def.rise, riseYaw: def.riseYaw, tracer: !!R.tracer, heat: W.barrel.temp, cookoff: !!W._cook });
    W._cook = false;
    W.barrel.temp += def.heatPerShot; W.fouling++; W.roundsFired++;
    if (W.barrel.temp > def.heatFail) W.barrel.wear = Math.min(1, W.barrel.wear + 0.002);
    ch.state = 'spent';
    if (def.key === 'M72A2') { W.law = 'spent'; W.chamber = null; ev('backblast', def.backblast); return true; }
    if (def.feed === 'single') return true;   // M203: the case stays in until the breech opens
    cycle(mods);
    return true;
  }
  // after a shot: extract, eject, feed (each can fail)
  function cycle() {
    const stop = W.rng() < stoppageChance();
    const kind = stop ? pickMalf() : null;
    if (kind === 'extract') { W.malf = 'extract'; W.malfKnown = false; ev('malf', { kind }); return; }   // case stuck in the chamber
    if (kind === 'stovepipe') { W.malf = 'stovepipe'; W.malfKnown = false; ev('malf', { kind }); return; }   // case caught in the port
    if (kind === 'runaway') { W.malf = 'runaway'; ev('malf', { kind }); }   // worn sear: keeps firing until the belt runs out or is broken
    ev('eject', { round: W.chamber.round });
    W.chamber = null;
    if (kind === 'double') { W.malf = 'double'; W.malfKnown = false; roundFromFeed(); ev('malf', { kind }); return; }
    if (kind === 'feed') { W.malf = 'feed'; W.malfKnown = false; ev('malf', { kind }); return; }
    const r = roundFromFeed();
    if (r) {
      W.chamber = { round: r, state: 'live' };
      if (kind === 'oob') { W.bolt = 'oob'; W.malf = 'oob'; W.malfKnown = false; ev('malf', { kind }); }
      if (kind === 'fire') { W.chamber.state = 'dud'; }
      if (!def.closedBolt) { W.chamber = null; W.mag.rounds++; }   // open bolt: the round stays on the belt until the next pull
    } else if (def.holdOpen) { W.bolt = 'locked'; ev('boltLock'); }
    else if (!def.closedBolt) { W.bolt = 'fwd'; ev('empty'); }   // M60: the bolt rides forward on an empty belt
  }
  // can the trigger do anything?
  function ready() {
    if (W.act) return false;
    if (def.key === 'M72A2') return W.law === 'armed';
    if (def.modes[W.mode] === 'safe') return false;
    return true;
  }
  function pull(mods) {
    if (def.key === 'M72A2') { if (W.chamber) return fire(mods); ev('click'); return false; }
    if (!def.closedBolt) {   // M60: the trigger releases the bolt (open bolt)
      if (W.bolt !== 'cocked') { if (!W._dead) ev('deadTrigger'); W._dead = true; return false; }
      if (W.malf) { ev('click'); return false; }
      const r = roundFromFeed();
      if (!r) { W.bolt = 'fwd'; ev('click'); ev('empty'); return false; }
      W.chamber = { round: r, state: 'live' };
      return fire(mods);
    }
    if (W.bolt === 'oob' || W.malf === 'oob') { if (!W._dead) ev('deadTrigger'); W._dead = true; return false; }   // bolt not locked: the hammer is blocked
    if (W.bolt === 'open' || W.bolt === 'back') return false;
    if (W.malf && W.malf !== 'dud' || !W.chamber || W.chamber.state === 'spent') { if (!W._dead) ev('click'); W._dead = true; return false; }
    return fire(mods);
  }

  // ---------------------------------------------------------------- actions
  // start a manual action by name; returns false if it is not possible now
  W.start = function (name, ctx = {}) {
    if (W.act) return false;
    const A = def.actions[name]; if (!A) return false;
    // preconditions
    if ((name === 'speed' || name === 'tactical') && !ctx.inv?.find(def.fit)) { ev('noAmmo'); return false; }
    if (name === 'reload' && def.feed !== 'none' && !ctx.inv?.find(def.fit)) { ev('noAmmo'); return false; }
    if (name === 'barrel' && !ctx.inv?.find('M60-barrel', 'coolest')) { ev('noBarrel'); return false; }
    if (name === 'extend' && W.law !== 'closed') return false;
    if (name === 'arm' && W.law !== 'extended') return false;
    if (name === 'collapse' && W.law !== 'extended') return false;
    if ((name === 'checkMag') && !W.mag) return false;
    if (name === 'boltRelease' && W.bolt !== 'locked') return false;
    if (name === 'fa' && !def.forwardAssist) return false;
    const slow = 1 + 0.8 * (ctx.mods?.armInjury || 0) + 0.3 * (ctx.mods?.pain || 0) + (ctx.mods?.slowHands || 0);
    let keys = A.keys, dur = A.dur;
    // speed/tactical reload without a locked bolt: no bolt release (shorter); M16 chamber empty with bolt forward: charge instead
    if ((name === 'speed' || name === 'tactical')) {
      keys = A.keys.slice();
      if (W.bolt !== 'locked') { const last = keys[keys.length - 1]; if (/Release$/.test(last[1]) && last[1] !== 'magRelease') { keys.pop(); dur *= 0.88; } if (!W.chamber && def.closedBolt) { keys.push([0.93, 'chargeBack'], [0.98, 'chargeFwd']); dur *= 1.12; } }
      if (!W.mag) { keys = keys.filter(k => !['magRelease', 'dropMag', 'stowMag'].includes(k[1])); dur *= 0.75; }
    }
    W.act = { name, t: 0, dur: dur * slow, keys, k: 0, data: { ...ctx.data }, ctx };
    ev('action', { name, dur: W.act.dur });
    return true;
  };
  W.cancel = function () { if (W.act) { ev('cancel', { name: W.act.name }); W.act = null; } };
  // keyframe effects
  function doKey(name, ctx) {
    const inv = ctx.inv, a = W.act;
    switch (name) {
      case 'magRelease': if (W.mag) { a.data.oldMag = W.mag; W.mag = null; ev('magOut'); } break;
      case 'dropMag': if (a.data.oldMag) { ev('dropItem', { item: a.data.oldMag }); a.data.oldMag = null; } break;
      case 'stowMag': if (a.data.oldMag) { if (!inv || !inv.add(a.data.oldMag)) ev('dropItem', { item: a.data.oldMag }); else ev('stow'); a.data.oldMag = null; } break;
      case 'reach': ev('reach'); break;
      case 'draw': {
        const m = inv && inv.find(def.fit);
        if (m && inv.remove(m)) { a.data.newMag = m; ev('draw'); } else ev('noAmmo');
        break;
      }
      case 'magIn': {
        const m = a.data.newMag || a.data.oldMag;
        if (m) { W.mag = m; W.magLoadedFull = m.rounds >= m.cap; a.data.newMag = a.data.oldMag = null; ev('magIn'); if (W.malf === 'feed' && a.name !== 'checkMag') { /* fresh magazine seats properly */ } }
        break;
      }
      case 'slap': if (W.mag) { W.magLoadedFull = false; ev('slap'); } break;
      case 'boltRelease': case 'slideRelease':
        if (W.bolt === 'locked') { W.bolt = 'fwd'; const r = roundFromFeed(); if (r) W.chamber = { round: r, state: 'live' }; ev('boltRelease'); }
        break;
      case 'lockBolt': W.bolt = 'locked'; ev('chargeBack'); break;
      case 'chargeBack': {
        // pulling the charging handle / slide / cocking handle extracts whatever is in the chamber
        ev('chargeBack');
        if (W.malf === 'extract' && W.rng() < 0.85) { a.data.stuck = true; ev('stuck'); break; }   // the extractor slips over the stuck case
        if (W.chamber) { ev(W.chamber.state === 'spent' ? 'eject' : 'ejectLive', { round: W.chamber.round }); W.chamber = null; }
        if (W.malf === 'stovepipe' || W.malf === 'dud' || W.malf === 'feed' || W.malf === 'oob' || W.malf === 'misfire') { W.malf = null; }
        if (W.malf === 'extract' && !a.data.stuck) W.malf = null;
        if (!def.closedBolt) { if (W.malf !== 'double' && W.malf !== 'extract') W.bolt = 'cocked'; }
        else if (W.bolt !== 'locked') W.bolt = 'back';
        break;
      }
      case 'chargeFwd': {
        ev('chargeFwd');
        if (!def.closedBolt) { if (W.malf === 'runaway') W.malf = null; break; }   // M60: the handle goes forward, the bolt stays cocked
        if (a.data.stuck) { W.malf = 'double'; W.bolt = 'fwd'; roundFromFeed(); ev('malf', { kind: 'double' }); W.malfKnown = true; break; }   // new round rams into the stuck case
        if (W.bolt === 'locked' && a.name !== 'remedialStuck' && a.name !== 'remedialDouble') break;
        W.bolt = 'fwd';
        if (!W.chamber && W.malf !== 'double') { const r = roundFromFeed(); if (r) W.chamber = { round: r, state: 'live' }; }
        if (W.rng() < 0.03 + 0.1 * W.dirt) { W.bolt = 'oob'; W.malf = 'oob'; }   // riding the handle forward can leave the bolt short
        break;
      }
      case 'pressCheck': ev('chargeBack', { partial: true }); break;   // open the bolt just enough to see brass
      case 'pressRelease': ev('chargeFwd', { partial: true }); if (def.forwardAssist && W.rng() < 0.15) { W.bolt = 'oob'; W.malf = 'oob'; } break;
      case 'fa': if (W.bolt === 'oob') { W.bolt = 'fwd'; if (W.malf === 'oob') W.malf = null; } ev('fa'); break;
      case 'observe': case 'look': {
        W.malfKnown = true;
        const m = W.mag || a.data.oldMag;
        W.lastInfo = { chamber: W.chamber ? W.chamber.state : 'empty', malf: W.malf, mag: m ? approxCount(m) : 'none', bolt: W.bolt, temp: Math.round(W.barrel.temp) };
        ev('info', W.lastInfo);
        break;
      }
      case 'rodIn': ev('rod'); break;
      case 'rodOut': if (W.malf === 'extract' || W.malf === 'double') { W.malf = null; if (W.chamber) W.chamber = null; ev('cleared'); } break;
      case 'rack': if (W.malf === 'double') { W.malf = null; W.chamber = null; ev('rack'); } break;
      case 'coverOpen': ev('coverOpen'); a.data.cover = true; break;
      case 'clearBelt': if (W.mag) { if (a.name === 'reload') { const old = W.mag; W.mag = null; if (old.rounds > 0) { if (!inv || !inv.add(old)) ev('dropItem', { item: old }); } else ev('dropItem', { item: old }); } } if (W.malf === 'feed' || W.malf === 'double') W.malf = null; ev('clearBelt'); break;
      case 'beltOn': { const b = inv && inv.find(def.fit); if (b && inv.remove(b)) { W.mag = b; ev('beltOn'); } else ev('noAmmo'); break; }
      case 'coverClose': ev('coverClose'); break;
      case 'barrelLatch': ev('barrelLatch'); break;
      case 'barrelOut': a.data.oldBarrel = W.barrel; W.barrel = null; ev('barrelOut', { temp: a.data.oldBarrel.temp }); break;
      case 'barrelIn': { const nb = inv && inv.find('M60-barrel', 'coolest'); if (nb && inv.remove(nb)) { W.barrel = nb; if (!inv.add(a.data.oldBarrel)) ev('dropItem', { item: a.data.oldBarrel }); } else W.barrel = a.data.oldBarrel; ev('barrelIn', { temp: W.barrel.temp }); break; }
      case 'twist': if (W.malf === 'runaway') { W.malf = null; W.bolt = 'fwd'; const m = W.mag; W.mag = null; if (m) ev('dropItem', { item: m }); ev('beltBroken'); } break;   // the gun runs dry, the broken belt falls away
      // M203
      case 'latch': ev('latch'); break;
      case 'open': W.bolt = 'open'; ev('open'); break;
      case 'ejectCase': if (W.chamber) { ev(W.chamber.state === 'spent' ? 'eject' : 'ejectLive', { round: W.chamber.round }); W.chamber = null; if (W.malf) W.malf = null; } break;
      case 'insert': { const g = inv && inv.find(def.fit); if (g && inv.remove(g)) { W.chamber = { round: g.round, state: 'live' }; ev('insert'); } else ev('noAmmo'); break; }
      case 'close': W.bolt = 'fwd'; ev('close'); break;
      // M72
      case 'pin': case 'rearCover': case 'sights': ev(name); break;
      case 'extend': W.law = 'extended'; ev('extend'); break;
      case 'arm': W.law = 'armed'; ev('arm'); break;
      case 'safe': W.law = 'extended'; ev('safe'); break;
      case 'collapse': W.law = 'closed'; ev('collapse'); break;
      case 'squeeze': if (W.malf === 'misfire' && W.rng() < 0.5) { W.malf = null; W.chamber = { round: 'M72', state: 'live' }; W.law = 'armed'; fire(ctx.mods); } else ev('click'); break;
      case 'turn': ev('inspect'); break;
    }
  }
  function approxCount(m) {   // what a glance at the magazine / belt tells you (Tarkov-style)
    const f = m.rounds / m.cap;
    return m.rounds === 0 ? 'empty' : f > 0.9 ? 'full' : f > 0.6 ? 'more than half' : f > 0.35 ? 'about half' : f > 0.1 ? 'less than half' : 'almost empty';
  }

  // ---------------------------------------------------------------- per-step
  // ctl: { trigger: bool }, ctx: { inv, mods, canFire (soldier allows it), dirt (0..1, sand / mud) }
  W.step = function (dt, ctl, ctx = {}) {
    W.events.length = 0;
    const mods = ctx.mods || {};
    W.dirt = ctx.dirt ?? W.dirt;
    // barrel cooling (Newton)
    if (W.barrel) W.barrel.temp += (21 - W.barrel.temp) * (1 - Math.exp(-def.barrelK * dt));
    if (ctx.inv && ctx.inv.step) ctx.inv.step(dt);
    // cook-off: a live round sitting in a very hot chamber
    if (W.chamber && W.chamber.state === 'live' && def.closedBolt && W.barrel.temp > def.cookoff && W.bolt === 'fwd') {
      if (W.rng() < dt * (W.barrel.temp - def.cookoff) / 400) { W._cook = true; ev('cookoff'); fire(mods); }
    }
    // manual action
    if (W.act) {
      const a = W.act; a.t += dt;
      while (a.k < a.keys.length && a.t >= a.keys[a.k][0] * a.dur) { doKey(a.keys[a.k][1], a.ctx || ctx); a.k++; }
      if (a.t >= a.dur) { W.act = null; ev('actionDone', { name: a.name }); }
    }
    // trigger
    const t = !!(ctl && ctl.trigger) && ctx.canFire !== false;
    const runaway = W.malf === 'runaway' && W.mag && W.mag.rounds > 0;
    if (!t) { W._dead = false; W.burst = 0; }
    if (!t && !runaway) W.cyc = Math.min(W.cyc, 0);
    const mode = def.modes[W.mode];
    if (runaway) {
      W.cyc -= dt; while (W.cyc <= 0 && W.mag && W.mag.rounds > 0) { W.cyc += 60 / def.rpm; const r = roundFromFeed(); W.chamber = { round: r, state: 'live' }; fire(mods); W.malf = 'runaway'; }
      if (!W.mag || W.mag.rounds <= 0) { W.malf = null; W.bolt = 'fwd'; ev('empty'); }
    } else if (t && ready()) {
      if (mode === 'auto') {
        W.cyc -= dt;
        if (!W.trig) W.cyc = 0;
        while (W.cyc <= 0) {
          W.cyc += 60 / def.rpm;
          if (!pull(mods)) { W.cyc = 1e9; break; }
          W.burst++;
          if (!def.closedBolt && (W.malf || !W.mag || W.mag.rounds <= 0)) break;
        }
      } else if (!W.trig) { if (pull(mods)) W.burst++; }
    } else if (t && !W.trig && def.modes[W.mode] === 'safe' && !W.act) ev('safeTrigger');
    W.trig = t;
    return W.events;
  };
  // fire-mode selector (rotates SAFE -> SEMI -> AUTO -> SAFE on the M16A1)
  W.cycleMode = function (dir = 1) { const n = def.modes.length; W.mode = (W.mode + dir + n) % n; ev('selector', { mode: def.modes[W.mode] }); return def.modes[W.mode]; };
  W.setSight = function (i) { const n = W.sightCount(); W.sight = clamp(i, 0, n - 1); ev('sight', { setting: W.sight, label: W.sightLabel() }); };
  return W;
}
