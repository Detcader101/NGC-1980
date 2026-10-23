// HORNET damage model: hits break systems instead of killing outright (like the helicopter's damage.js).
//   engL / engR - thrust falls with damage; below 35% an engine may catch fire (FIRE light, push it to extinguish:
//                 one bottle per side). A burning engine eats itself and finally flames out.
//   hyd         - slow, weak control surfaces (both hydraulic systems shot through).
//   fcs         - flight computer fails: the jet drops to DIRECT (stick straight to the surfaces).
//   fuel        - leaking tanks.          avionics - HUD and displays flicker.
//   gear / hook - won't come down (then it is a barricade-less ditching or an ejection).
//   airframe    - overstress and battle damage; at zero the jet breaks up.
export const JPARTS = [
  { id: 'engL', name: 'LEFT ENGINE', w: 1.0 }, { id: 'engR', name: 'RIGHT ENGINE', w: 1.0 }, { id: 'hyd', name: 'HYDRAULICS', w: 0.7 },
  { id: 'fcs', name: 'FLIGHT CONTROLS', w: 0.5 }, { id: 'fuel', name: 'FUEL TANKS', w: 0.9 }, { id: 'avionics', name: 'AVIONICS', w: 0.7 },
  { id: 'gear', name: 'LANDING GEAR', w: 0.4 }, { id: 'hook', name: 'TAIL HOOK', w: 0.3 }, { id: 'airframe', name: 'AIRFRAME', w: 1.2 },
];
const WSUM = JPARTS.reduce((s, p) => s + p.w, 0);
export function createJetDamage() {
  const D = {
    hp: {}, fire: [false, false], bottles: [1, 1],
    reset() { for (const p of JPARTS) D.hp[p.id] = 1; D.fire = [false, false]; D.bottles = [1, 1]; },
    hit(amount, part) {
      if (!part) { let r = Math.random() * WSUM; for (const p of JPARTS) { r -= p.w; if (r <= 0) { part = p.id; break; } } part ||= 'airframe'; }
      D.hp[part] = Math.max(0, D.hp[part] - amount * (0.7 + Math.random() * 0.6));
      const k = part === 'engL' ? 0 : part === 'engR' ? 1 : -1;
      if (k >= 0 && D.hp[part] < 0.35 && D.hp[part] > 0 && !D.fire[k] && Math.random() < 0.5) D.fire[k] = true;
      return part;
    },
    extinguish(k) { if (!D.fire[k]) return D.bottles[k] > 0 ? 'NO FIRE' : 'BOTTLE EMPTY'; if (D.bottles[k] <= 0) return 'BOTTLE EMPTY'; D.bottles[k]--; D.fire[k] = false; return 'FIRE OUT'; },
    update(dt) {   // fire spreads; returns fuel lost this frame (kg)
      for (const k of [0, 1]) if (D.fire[k]) { const id = k ? 'engR' : 'engL'; D.hp[id] = Math.max(0, D.hp[id] - 0.03 * dt); D.hp.airframe = Math.max(0.05, D.hp.airframe - 0.004 * dt); if (D.hp[id] <= 0) D.fire[k] = false; }
      return D.hp.fuel < 0.75 ? (0.75 - D.hp.fuel) * 9 * dt : 0;
    },
    damaged() { return JPARTS.some(p => D.hp[p.id] < 0.98) || D.fire[0] || D.fire[1]; },
    repair(k) { for (const p of JPARTS) D.hp[p.id] = Math.min(1, D.hp[p.id] + k); D.fire = [false, false]; D.bottles = [1, 1]; },
    mods() {
      const h = D.hp;
      return { eng: [h.engL, h.engR], hyd: h.hyd, fcsOk: h.fcs > 0.3, gearOk: h.gear > 0.25, hookOk: h.hook > 0.25, fire: D.fire, avionics: h.avionics };
    },
    // caution panel captions that are lit (the cockpit draws them; the flight state adds its own)
    cautions() {
      const h = D.hp, out = [];
      if (h.engL < 0.5) out.push('L ENG'); if (h.engR < 0.5) out.push('R ENG');
      if (D.fire[0]) out.push('L FIRE'); if (D.fire[1]) out.push('R FIRE');
      if (h.hyd < 0.3) out.push('HYD'); if (h.fcs <= 0.3) out.push('FCS');
      return out;
    },
  };
  D.reset();
  return D;
}
