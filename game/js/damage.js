// Helicopter damage model. Each component has health 0..1; damage comes from enemy fire, rams, hard landings and tail
// strikes. Health feeds the flight model through mods() and the cockpit through cautions(), so failures are
// simulated, survivable states rather than instant deaths:
//   tail rotor  - lost anti-torque: the main rotor's torque spins the airframe ("death spin"). Lower the collective,
//                 fly fast so the fin weathervanes you straight, or cut the engine (I) and autorotate - no engine
//                 torque, no spin.
//   engine      - less power (rotor rpm droops under load); below ~40% it may catch fire; dead = autorotation.
//                 Fire keeps eating the engine and gearbox until you pull the extinguisher (O, one bottle).
//   transmission- chip light when worn; critical = the gearbox seizes and the rotor spins down.
//   hydraulics  - boost lost: heavy, slow controls and no stability assist.
//   fuel tank   - holed: fuel leaks out.
//   avionics    - gauges flicker and drop out.
//   main rotor  - vibration and lost lift; destroyed = no lift at all.
//   skids       - weaker: harder landings break things sooner.
// Remedies: land on the home pad (or the home cave's intake pad) for a full repair, or set down anywhere and call
// the logistics team (L) for a field repair (every part back to >= 60%) plus fuel.
export const PARTS = [
  { id: 'rotor', name: 'MAIN ROTOR', w: 0.8 }, { id: 'tail', name: 'TAIL ROTOR', w: 1.1 }, { id: 'engine', name: 'ENGINE', w: 1.3 },
  { id: 'xmsn', name: 'TRANSMISSION', w: 0.8 }, { id: 'hyd', name: 'HYDRAULICS', w: 1.0 }, { id: 'fuel', name: 'FUEL TANK', w: 1.0 },
  { id: 'avionics', name: 'AVIONICS', w: 0.8 }, { id: 'skids', name: 'SKIDS', w: 0.6 },
];
const W = PARTS.reduce((s, p) => s + p.w, 0);

export function createDamage() {
  const D = {
    hp: {}, fire: false, fireT: 0, bottles: 1,
    engineSwitch: true, hydBoost: true,          // cockpit switches the damage model listens to
    reset() { for (const p of PARTS) D.hp[p.id] = 1; D.fire = false; D.fireT = 0; D.bottles = 1; D.engineSwitch = true; D.hydBoost = true; },
    // amount ~0.2 for a bullet; part optional (random, weighted by how exposed it is)
    hit(amount, part) {
      if (!part) { let r = Math.random() * W; for (const p of PARTS) { r -= p.w; if (r <= 0) { part = p.id; break; } } part ||= 'engine'; }
      D.hp[part] = Math.max(0, D.hp[part] - amount * (0.7 + Math.random() * 0.6));
      if (part === 'engine' && D.hp.engine < 0.4 && D.hp.engine > 0 && !D.fire && Math.random() < 0.5) { D.fire = true; D.fireT = 0; }
      return part;
    },
    damaged() { return PARTS.some(p => D.hp[p.id] < 0.98) || D.fire; },
    critical() { const m = D.mods(); return D.fire || m.tail < 0.5 || !m.engineOk || !m.xmsnOk || m.lift < 0.8 || D.hp.fuel < 0.75; },
    extinguish() {
      if (!D.fire) return D.bottles > 0 ? 'NO FIRE' : 'BOTTLE EMPTY';
      if (D.bottles <= 0) return 'BOTTLE EMPTY';
      D.bottles--; D.fire = false; return 'FIRE OUT';
    },
    // per-frame: fire spreads, the leak drains fuel. Returns fuel lost this frame (%).
    update(dt) {
      if (D.fire) {
        D.fireT += dt; D.hp.engine = Math.max(0, D.hp.engine - 0.035 * dt); D.hp.xmsn = Math.max(0, D.hp.xmsn - 0.008 * dt);
        if (D.fireT > 40) D.fire = false;   // nothing left to burn
      }
      return D.hp.fuel < 0.75 ? (0.75 - D.hp.fuel) * 1.6 * dt : 0;
    },
    // what the flight model needs
    mods() {
      const h = D.hp;
      return {
        engineOk: D.engineSwitch && h.engine > 0.05,
        power: h.engine > 0.05 ? 0.35 + 0.65 * h.engine : 0,     // fraction of collective the engine can hold at 100% rpm
        xmsnOk: h.xmsn > 0.08,
        lift: h.rotor > 0.02 ? 0.55 + 0.45 * h.rotor : 0,
        tail: h.tail < 0.2 ? 0 : Math.min(1, h.tail * 1.25),       // anti-torque authority
        hyd: D.hydBoost && h.hyd > 0.25 ? 1 : 0.35,                  // control response
        hydOk: D.hydBoost && h.hyd > 0.25,
        skidTol: 0.55 + 0.45 * h.skids,
        vib: (1 - h.rotor) * 0.6 + (h.xmsn < 0.5 ? 0.25 : 0),
      };
    },
    // caution/warning annunciator: [{ t, warn }]
    cautions(fuel, rpm, landed) {
      const h = D.hp, m = D.mods(), out = [];
      if (D.fire) out.push({ t: 'ENG FIRE', warn: true });
      if (!m.engineOk) out.push({ t: D.engineSwitch ? 'ENG OUT' : 'ENG OFF', warn: D.engineSwitch });
      else if (h.engine < 0.6) out.push({ t: 'ENG DMG', warn: false });
      if (m.tail === 0) out.push({ t: 'TAIL ROTOR', warn: true }); else if (h.tail < 0.6) out.push({ t: 'T/R DMG', warn: false });
      if (!m.xmsnOk) out.push({ t: 'XMSN FAIL', warn: true }); else if (h.xmsn < 0.5) out.push({ t: 'XMSN CHIP', warn: false });
      if (!m.hydOk) out.push({ t: 'HYD PRESS', warn: false });
      if (h.fuel < 0.75) out.push({ t: 'FUEL LEAK', warn: false });
      if (fuel < 15) out.push({ t: 'LOW FUEL', warn: fuel < 5 });
      if (h.rotor < 0.6) out.push({ t: 'ROTOR DMG', warn: h.rotor < 0.25 });
      if (h.avionics < 0.4) out.push({ t: 'AVIONICS', warn: false });
      if (h.skids < 0.5) out.push({ t: 'SKIDS', warn: false });
      if (rpm < 0.88 && !landed) out.push({ t: 'LOW RPM', warn: true });
      return out;
    },
    repair(k) { for (const p of PARTS) D.hp[p.id] = Math.min(1, D.hp[p.id] + k); if (k > 0) { D.fire = false; D.bottles = 1; } },
    fieldRepair() { for (const p of PARTS) D.hp[p.id] = Math.max(D.hp[p.id], 0.6); D.fire = false; D.bottles = 1; },
  };
  D.reset();
  return D;
}
