// F-14A TOMCAT damage model (the player's Tomcat; like jetdamage.js for the HORNET): hits break systems, not the
// aeroplane outright. Pure; runs in node.
//   engL / engR  - TF30: thrust falls with damage, oil hot / fuel pressure cautions; below 35% an engine may catch fire
//                  (FIRE light; push it to discharge that side's bottle; one bottle per side). A damaged TF30 stalls
//                  more easily (the inlet / fan is chewed up).
//   hyd          - combined + flight hydraulics: slow surfaces, the wings sweep at half rate (7.5°/s).
//   sas          - the stability augmentation (pitch / roll / yaw dampers) drops out: the stick goes straight to the
//                  surfaces (airframe 'DIRECT'), and the autopilot (AFCS) will not engage.
//   cadc         - the Central Air Data Computer: the wings stop sweeping in AUTO / MAN (they freeze where they are);
//                  the EMERGENCY sweep handle still moves them.
//   fuel         - leaking tanks.     avionics - HUD, VDI, HSD and the AWG-9 flicker or drop out.
//   gear / hook  - won't come down.   airframe - battle damage and overstress; at zero the jet breaks up.
export const TPARTS = [
  { id: 'engL', name: 'LEFT TF30', w: 1.0 }, { id: 'engR', name: 'RIGHT TF30', w: 1.0 }, { id: 'hyd', name: 'HYDRAULICS', w: 0.7 },
  { id: 'sas', name: 'STABILITY AUGMENTATION', w: 0.4 }, { id: 'cadc', name: 'AIR DATA COMPUTER', w: 0.35 }, { id: 'fuel', name: 'FUEL TANKS', w: 1.0 },
  { id: 'avionics', name: 'AVIONICS / AWG-9', w: 0.8 }, { id: 'gear', name: 'LANDING GEAR', w: 0.4 }, { id: 'hook', name: 'TAIL HOOK', w: 0.3 },
  { id: 'airframe', name: 'AIRFRAME', w: 1.4 },
];
const WSUM = TPARTS.reduce((s, p) => s + p.w, 0);
export function createTomcatDamage(rng = Math.random) {
  const D = {
    hp: {}, fire: [false, false], bottles: [1, 1],
    reset() { for (const p of TPARTS) D.hp[p.id] = 1; D.fire = [false, false]; D.bottles = [1, 1]; },
    // amount in war.js units x ~0.8 (a 23 mm-ish hit takes ~0.15 off a part); part: force one (overstress -> airframe)
    hit(amount, part) {
      if (!part) { let r = rng() * WSUM; for (const p of TPARTS) { r -= p.w; if (r <= 0) { part = p.id; break; } } part ||= 'airframe'; }
      D.hp[part] = Math.max(0, D.hp[part] - amount * (0.7 + rng() * 0.6));
      const k = part === 'engL' ? 0 : part === 'engR' ? 1 : -1;
      if (k >= 0 && D.hp[part] < 0.35 && D.hp[part] > 0 && !D.fire[k] && rng() < 0.5) D.fire[k] = true;
      return part;
    },
    extinguish(k) { if (!D.fire[k]) return D.bottles[k] > 0 ? 'NO FIRE' : 'BOTTLE EMPTY'; if (D.bottles[k] <= 0) return 'BOTTLE EMPTY'; D.bottles[k]--; D.fire[k] = false; return 'FIRE OUT'; },
    // per frame: a fire eats its engine and slowly the airframe; returns the fuel lost to leaks this frame (kg)
    update(dt) {
      for (const k of [0, 1]) if (D.fire[k]) { const id = k ? 'engR' : 'engL'; D.hp[id] = Math.max(0, D.hp[id] - 0.03 * dt); D.hp.airframe = Math.max(0.05, D.hp.airframe - 0.004 * dt); if (D.hp[id] <= 0) D.fire[k] = false; }
      return D.hp.fuel < 0.75 ? (0.75 - D.hp.fuel) * 12 * dt : 0;
    },
    damaged() { return TPARTS.some(p => D.hp[p.id] < 0.98) || D.fire[0] || D.fire[1]; },
    repair(k) { for (const p of TPARTS) D.hp[p.id] = Math.min(1, D.hp[p.id] + k); if (k >= 1) { D.fire = [false, false]; D.bottles = [1, 1]; } },
    // what the airframe sim reads (env.mods) plus the Tomcat's own systems
    mods() {
      const h = D.hp;
      return { eng: [h.engL, h.engR], hyd: h.hyd, fcsOk: h.sas > 0.3, gearOk: h.gear > 0.25, hookOk: h.hook > 0.25, fire: D.fire, avionics: h.avionics, cadcOk: h.cadc > 0.3, sasOk: h.sas > 0.3 };
    },
    // a damaged TF30 is easier to stall (multiplies the sim's stall risk for that engine)
    stallRisk(k) { const h = k ? D.hp.engR : D.hp.engL; return 1 + 3 * Math.max(0, 0.8 - h); },
    // caution panel captions from damage (the cockpit adds the flight state's own)
    cautions() {
      const h = D.hp, out = [];
      if (h.engL < 0.5) out.push('L OIL HOT'); if (h.engR < 0.5) out.push('R OIL HOT');
      if (h.engL < 0.3) out.push('L FUEL PRESS'); if (h.engR < 0.3) out.push('R FUEL PRESS');
      if (h.hyd < 0.3) out.push('HYD PRESS'); if (h.sas <= 0.3) out.push('PITCH STAB', 'ROLL STAB', 'YAW STAB');
      if (h.cadc <= 0.3) out.push('CADC', 'WING SWEEP'); if (h.fuel < 0.75) out.push('FUEL LEAK');
      return out;
    },
  };
  D.reset();
  return D;
}
