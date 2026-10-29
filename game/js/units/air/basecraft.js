// (ngc/look-airbases) Aircraft that live at the air base (world/airbase.js) and fly sorties from it whenever you like:
// the C-130H (this file, on the real flight model units/air/c130fm.js) and a slot the SR-71A plugs into.
//
// The registry. Each base aircraft is a craft (craft.js contract) plus four base hooks, so main.js, the command board
// and the map handle every one the same way:
//   def.baseSlot                     AB_SLOTS key (its hangar / shelter): 'c130', 'sr71'
//   def.spawnAt(spot, mode)          put it on the ground at spot {x, y, z, yaw} ready to fly; mode 'cold' (engines off,
//                                    towed out onto the ramp), 'hot' (engines running on the ramp), 'runway' (lined up)
//   def.parkAt(spot)                 leave it in its hangar as a static parked aircraft (not present: the fleet's reserve)
//   def.sortie -> { airborne, onBase, stopped }    read by the host for the "sortie complete" hand-in
// and the host (createBaseOps below) calls ctx.onSortieEnd(def) when one is parked back in the hangar.
// SR-71: the look-sr71 branch builds the aircraft; base.attachSR71(def) (or BASE_TYPES.sr71.create) takes its craft def,
// see docs/ngc1980/findings/look-airbases.md "SR-71 hook".
import * as THREE from 'three';
import { createC130Sim, C130, KT } from './c130fm.js';
import { buildC130Mesh, C130M } from './c130model.js';
import { buildC130Deck, DECK_EYE, DECK_EYE_PITCH } from './c130cockpit.js';
import { createC130Audio } from './c130audio.js';
import { AB } from '../../world/airbase.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
// the board rows (FLEET_TYPES entries are in units/commander/fleet.js): which aircraft the base has
export const BASE_TYPES = {
  c130: { id: 'c130', label: 'C-130H HERCULES', short: 'C-130', note: 'TACTICAL AIRLIFT  -  FROM THE AIR BASE' },
  sr71: { id: 'sr71', label: 'SR-71A BLACKBIRD', short: 'SR-71', note: 'STRATEGIC RECONNAISSANCE  -  FROM THE AIR BASE' },
};
const START_ORDER = [2, 3, 1, 0];   // T.O. 1C-130H-1: 3, 4, 2, 1 (the GTC feeds no. 3 first)

// ctx: { scene, war, G, Z, CTL, keyDown, hwOn, say, feed, sfx, fx, crafts, head, AIRBASE, terrainH, camZ, hover,
//        view: { locked() }, onUnitLost(id, why, mine), onSortieEnd(def) }
export function createC130Sortie(ctx) {
  const { scene, say, feed, sfx, fx, crafts, AIRBASE: L } = ctx;
  const S = createC130Sim(), model = buildC130Mesh(), deck = buildC130Deck(), g = model.group;
  g.add(deck.group); deck.group.visible = false; g.visible = false; scene.add(g);
  const snd = createC130Audio(sfx);
  const groundY = (x, z) => Math.max(ctx.terrainH(x, z), 0);
  const env = { groundY, water: (x, z) => ctx.terrainH(x, z) <= 0, wind: { x: 0, z: 0 } };
  const D = {
    id: 'c130', label: 'C-130H HERCULES', kind: 'air', baseSlot: 'c130', farView: true, S, model, deck,
    seats: [{ id: 'pilot', label: 'AIRCRAFT COMMANDER', role: 'driver', door: [-1.8, -2.0, -8.6], exit: [-3.2, -2.64, -8.6], reach: 3 }],
    view: 'cockpit', ap: null, out: false, parked: true, crew: false, hp: 14, lastLever: 18,
    sortie: { airborne: false, onBase: true, stopped: true, done: false, t: 0, stopT: 0 },
  };
  const ctl = { pitch: 0, roll: 0, yaw: 0, lever: [18, 18, 18, 18], brakeL: 0, brakeR: 0, tiller: 0, trimRate: 0 };
  const kb = { roll: 0, pitch: 0, yaw: 0, noInput: 9, hold: null };
  const look = { yaw: 0, pitch: 0, oy: 0, op: 0 };
  let parkBrake = true, crewStart = '', crewT = 0, chocks = 0, mcReset = false, t = 0, hover = null, lastC = ctl, snapChase = true, deadT = 0;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _l = [0, 0];

  // ---------------------------------------------------------------- placing it
  D.present = () => D.out && !S.dead;
  D.frame = out => { out.x = S.pos.x; out.y = S.pos.y; out.z = S.pos.z; out.yaw = S.heading; return out; };
  D.spawnAt = (sp, mode = 'hot') => {
    S.resetGround(sp.x, sp.y ?? groundY(sp.x, sp.z), sp.z, sp.yaw, { running: mode !== 'cold' });
    S.fuel = 9000; S.payload = 2500; S.flapSel = S.flap = mode === 'runway' ? 0.5 : 0; S.trim = 0.08;
    ctl.lever.fill(18); parkBrake = mode !== 'runway'; crewStart = ''; D.ap = null; D.crew = false; D.hp = 14;
    Object.assign(D.sortie, { airborne: false, onBase: true, stopped: true, done: false, t: 0, stopT: 0 });
    D.out = true; D.parked = false; g.visible = true; snapChase = true; look.yaw = look.pitch = 0; t = 0; deadT = 0;
    return true;
  };
  D.parkAt = sp => {
    S.resetGround(sp.x, sp.y ?? groundY(sp.x, sp.z), sp.z, sp.yaw, { running: false });
    D.out = false; D.parked = true; D.crew = false; D.ap = null; snd.stop(); g.visible = true; deck.group.visible = false;
    pose(0);
  };
  D.lineUp = () => {   // quick start: lined up for take-off (departEnd), engines running, 50 % flaps
    const e = departEnd(), [x, z] = L.toW(e.u + e.dir * 60, 0);
    S.resetGround(x, L.E, z, L.yawOf(e.dir, 0)); S.flapSel = S.flap = 0.5; ctl.lever.fill(18); parkBrake = false; snapChase = true;
    say(`LINED UP ON RUNWAY ${String(e.num).padStart(2, '0')}  -  SHIFT POWER UP, PULL BACK AT ~105 KIAS`, 3);
  };
  const nearestEnd = () => { const [u] = L.toL(S.pos.x, S.pos.z, _l); return L.ends.reduce((a, b) => Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a); };
  // the end to take off from: the one whose climb-out goes over the clear approach (high ground behind you), else the nearer
  const departEnd = () => { const [a, b] = L.ends, hi = a.obst > b.obst ? a : b, lo = hi === a ? b : a; return hi.obst > 0 && hi.obst - lo.obst > 100 ? hi : nearestEnd(); };

  // ---------------------------------------------------------------- in / out
  D.enter = (seat, from) => {
    if (!D.present()) return false;
    D.crew = false; kb.hold = null;
    if (from === 'command') say(S.eng.every(e => e.run) ? `C-130H ON THE RAMP AT ${L.name}, ENGINES RUNNING  -  B BRAKE OFF, SHIFT POWER, Q/E STEER, V VIEW, H AUTOPILOT` : `C-130H COLD ON THE RAMP AT ${L.name}  -  K: THE ENGINEER STARTS ALL FOUR  ·  SHIFT+K QUICK START  ·  SHIFT+L LINE UP ON THE RUNWAY`, 4);
    return true;
  };
  D.canExit = () => !S.onGround ? 'LAND FIRST' : Math.hypot(S.vel.x, S.vel.z) > 1 ? 'STOP FIRST' : '';
  D.exitSpots = () => [[-3.2, -2.64, -8.6], [3.2, -2.64, -8.6]].map(p => crafts.toWorld(D, p)).filter(Boolean).map(w => ({ x: w.x, y: groundY(w.x, w.z), z: w.z, yaw: w.yaw }));
  // left for another unit: in the air the crew flies her home and lands; on the ground at the base she is towed in
  D.exit = next => {
    if (!D.present() || next === D) return;
    if (!S.onGround) { D.crew = true; D.ap = { mode: 'home' }; feed(`C-130: THE CREW IS FLYING HER HOME TO ${L.name}`, 'info'); return; }
    if (L.onPavement(S.pos.x, S.pos.z, 30)) { D.crew = true; D.sortie.done = true; return; }
    D.crew = true; D.ap = { mode: 'home' };   // on the ground somewhere else: she takes off again and goes home
  };
  D.flying = () => D.present() && !S.onGround;

  // ---------------------------------------------------------------- the pilot's inputs
  function read(dt) {
    const kd = ctx.keyDown, H = ctx.hwOn() ? ctx.CTL.state : null;
    const kx = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0), ky = (kd('KeyS', 'ArrowDown') ? 1 : 0) - (kd('KeyW', 'ArrowUp') ? 1 : 0), kp = (kd('KeyE') ? 1 : 0) - (kd('KeyQ') ? 1 : 0);
    const k = 1 - Math.exp(-5 * dt);
    kb.roll += (kx * 0.75 - kb.roll) * k; kb.pitch += (ky * 0.6 - kb.pitch) * k; kb.yaw += (kp - kb.yaw) * k;
    let roll = kb.roll, pitch = kb.pitch, yaw = kb.yaw, stick = Math.abs(kx) + Math.abs(ky) > 0;
    if (H && H.stick && (Math.abs(H.stick.x) > 0.02 || Math.abs(H.stick.y) > 0.02)) { roll = H.stick.x; pitch = H.stick.y; stick = true; }
    if (H && Math.abs(H.rudder || 0) > 0.02) yaw = H.rudder;
    // power levers: SHIFT up / CTRL down (ground: the beta range from ground idle 18 deg; R held: reverse), or the throttle
    const up = kd('ShiftLeft', 'ShiftRight'), dn = kd('ControlLeft', 'ControlRight');
    const lo = S.onGround ? 18 : 34;
    let lev = ctl.lever[0];
    if (up || dn) lev = clamp(lev + ((up ? 1 : 0) - (dn ? 1 : 0)) * 30 * dt, lo, 90);
    if (H && H.throttle !== null && H.throttle !== undefined) { if (D.lastHw === undefined) D.lastHw = H.throttle; if (Math.abs(H.throttle - D.lastHw) > 0.02) { D.lastHw = H.throttle; lev = S.onGround ? 18 + H.throttle * 72 : 34 + H.throttle * 56; } }
    lev = kd('KeyR') && S.onGround ? Math.max(0, Math.min(ctl.lever[0], 18) - 40 * dt) : Math.max(lo, lev);   // R held: the levers back through beta into reverse
    ctl.lever.fill(lev);
    ctl.tiller += (((kd('Period') ? 1 : 0) - (kd('Comma') ? 1 : 0)) - ctl.tiller) * k;
    const br = kd('Space') ? 1 : Math.max(H ? (H.brakeL || 0) : 0, H && H.actions && H.actions.wheelbrake ? 1 : 0);
    ctl.brakeL = ctl.brakeR = parkBrake ? 1 : br;
    ctl.trimRate = (kd('BracketRight') ? 1 : 0) - (kd('BracketLeft') ? 1 : 0);
    ctl.roll = roll; ctl.pitch = pitch; ctl.yaw = yaw;
    if (stick && D.ap && D.ap.mode !== 'home') { D.ap = null; say('AUTOPILOT OFF  -  YOU HAVE CONTROL', 1.4); }
    kb.noInput = stick || Math.abs(kp) > 0 ? 0 : kb.noInput + dt;
    return stick;
  }

  // ---------------------------------------------------------------- autopilot: hold, and the way home (approach + landing)
  // home: fly to a 5 km final for the nearer runway end, join the centreline, a 3 deg glide path, flare, land, stop.
  function approach(dt) { return homeAutopilot(S, D.ap, L, dt, groundY, msg => feed(msg, 'info')); }
  // a crew take-off when she is sent home from the ground somewhere else (rare: a field landing)
  function crewTakeoff(dt) { const c = S.autopilot(dt, { track: S.heading, alt: S.pos.y + 200, kias: 160 }); if (S.onGround) c.pitch = S.kias > 105 ? 0.5 : 0; return { ...c, lever: [90, 90, 90, 90], brakeL: 0, brakeR: 0 }; }

  // ---------------------------------------------------------------- the engineer: start / shut down
  function engineer(dt) {
    if (!crewStart) return; if ((crewT += dt) < 1.1) return; crewT = 0;
    if (crewStart === 'stop') { for (const e of S.eng) if (e.cond !== 'stop') { e.cond = 'stop'; return; } crewStart = ''; feed('C-130: ENGINES SHUT DOWN', 'info'); return; }
    if (!S.battery) { S.battery = true; return; }
    if (!S.gtc.cmd) { S.gtc.cmd = true; feed('C-130: GTC START', 'info'); return; }
    if (S.gtc.N < 0.95 && !S.eng.some(e => e.run)) return;
    for (const k of START_ORDER) { const e = S.eng[k]; if (e.run && e.N > 0.94) continue; if (e.start > 0) return; if (e.cond !== 'run') { S.setCond(k, 'run'); return; } if (S.startEngine(k)) feed(`C-130: STARTING NUMBER ${k + 1}`, 'info'); return; }
    if (S.gtc.cmd) { S.gtc.cmd = false; S.bleedValve = false; return; }
    if (S.flapSel !== 0.5) { S.flapSel = 0.5; return; }
    crewStart = ''; feed('C-130: ALL FOUR RUNNING  -  BEFORE TAXI CHECKLIST COMPLETE', 'good'); say('ENGINES RUNNING  -  B BRAKE OFF, SHIFT POWER, Q/E (OR , .) STEER', 2.5);
  }
  function quickStart() { for (const e of S.eng) { e.cond = 'run'; e.run = true; e.N = 1; e.start = 0; e.starter = false; e.tit = 760; } S.battery = true; S.gtc.cmd = false; S.bleedValve = false; crewStart = ''; say('QUICK START  -  ALL FOUR ENGINES RUNNING', 1.6); }

  // ---------------------------------------------------------------- per frame
  D.update = (dt, inp) => { if (!D.present()) { lostTick(dt); return; } for (let i = 0; i < (D.warp || 1) && D.present(); i++) step(dt, true); };   // (warp: tests only - n sim steps a frame)
  D.idle = dt => { if (D.present()) { for (let i = 0; i < (D.warp || 1) && D.present(); i++) step(dt, false); } else lostTick(dt); };
  function lostTick(dt) { if (deadT > 0 && (deadT -= dt) <= 0 && crafts.active === D) ctx.autoNext?.(); }
  function step(dt, piloted) {
    t += dt; engineer(dt);
    let c;
    if (piloted && !D.crew) {
      const stick = read(dt);
      if (D.ap && D.ap.mode === 'home') c = approach(dt);
      else if (D.ap) { const a = S.autopilot(dt, { track: D.ap.track, alt: D.ap.alt, kias: D.ap.kias }); c = { ...a, lever: a.throttle.map(x => 34 + x * 56), brakeL: 0, brakeR: 0 }; ctl.lever.fill(c.lever[0]); }
      else if (!S.onGround && !ctx.hwOn() && kb.noInput > 0.3) {   // keyboard, hands off: hold the attitude it was left in (heading and height)
        if (!kb.hold) { const gy = groundY(S.pos.x, S.pos.z); kb.hold = { track: S.track(), alt: S.pos.y - gy < 250 && S.vel.y > 0.5 ? Math.max(S.pos.y, gy + 300) : S.pos.y }; }   // (let go in the climb-out: she climbs on to 1,000 ft)
        const a = S.autopilot(dt, { track: kb.hold.track, alt: kb.hold.alt, kias: S.kias }); c = { ...a, yaw: a.yaw + ctl.yaw, lever: ctl.lever, brakeL: 0, brakeR: 0, trimRate: ctl.trimRate };
      } else { if (stick) kb.hold = null; if (!S.onGround) S.apState.Iq = S.surf.ele / 0.38; c = ctl; }
    } else if (D.crew) {
      c = D.sortie.done ? { pitch: 0, roll: 0, yaw: 0, lever: [18, 18, 18, 18], brakeL: 1, brakeR: 1 } : S.onGround && !D.ap.final ? crewTakeoff(dt) : approach(dt);
    } else c = { pitch: 0, roll: 0, yaw: 0, lever: [18, 18, 18, 18], brakeL: 1, brakeR: 1 };
    lastC = c;
    const ev = S.step(dt, c, env);
    for (const e of ev) {
      if (e.e === 'touchdown' && piloted) { const vy = Math.round(-e.vy * 393.7); say(`TOUCHDOWN  -  ${vy} FPM${vy > 600 ? '  (FIRM)' : ''}`, 1.6); }
      if (e.e === 'hardland' && piloted) say('HARD LANDING', 1.6);
      if (e.e === 'nopower' && piloted) say('NO POWER  -  BATTERY ON (K: THE ENGINEER RUNS THE START)', 1.8);
      if (e.e === 'nobleed' && piloted) say('NO BLEED AIR  -  START THE GTC FIRST', 1.8);
    }
    if (S.dead) { lose(String(S.dead) === 'crash' ? 'CRASHED' : String(S.dead).toUpperCase()); return; }
    // obstacles on the base the flight model does not know: hangars, buildings, tanks
    if (S.onGround) { const b = L.hitBuilding(S.pos.x, S.pos.z, 6); if (b && Math.hypot(S.vel.x, S.vel.z) > 0.3) { if (Math.hypot(S.vel.x, S.vel.z) > 6) { lose(`HIT THE ${b.name}`); return; } S.vel.set(0, 0, 0); if (piloted) say(`STOP  -  THE ${b.name} IS IN THE WAY`, 1.4); } }
    // the sortie: airborne once, then stopped on the base's pavement -> it can be handed in
    const so = D.sortie, gs = Math.hypot(S.vel.x, S.vel.z);
    so.t += dt; if (!S.onGround && S.pos.y - groundY(S.pos.x, S.pos.z) > 15) so.airborne = true;
    so.onBase = S.onGround && !!L.onPavement(S.pos.x, S.pos.z, 10); so.stopped = so.onBase && gs < 1;
    so.stopT = so.stopped ? so.stopT + dt : 0;
    if (D.crew && D.ap && D.ap.rollout && gs < 1) so.done = true;
    if (so.done || (so.airborne && so.stopT > 2 && parkBrake && S.eng.every(e => !e.run))) handIn();
    if (piloted && S.buffet > 0.3) sfx.alarm?.();
  }
  function handIn() {
    if (!D.out) return;
    const sp = L.spot(D.baseSlot, 'park'), mine = crafts.active === D;
    D.parkAt(sp);
    feed(`${L.name}: C-130H PARKED IN THE HANGAR  -  SORTIE COMPLETE`, 'good');
    ctx.onSortieEnd?.(D, mine);
  }
  D.handIn = () => { if (!D.present()) return 'NOT OUT'; if (!D.sortie.onBase || !D.sortie.stopped) return 'STOP ON THE BASE FIRST'; handIn(); return ''; };
  function lose(why) {
    const mine = crafts.active === D, gy = groundY(S.pos.x, S.pos.z), wet = env.water(S.pos.x, S.pos.z);
    fx.explode?.(S.pos.x, Math.max(gy, 0), S.pos.z, 5, { fire: wet ? 0 : 80, oil: wet, debris: 24, color: 0xa9adb0, crater: wet ? 0 : 5 }); sfx.boom?.(1.4);
    D.out = false; g.visible = false; snd.stop(); feed(`C-130H LOST  -  ${why}`, 'bad');
    if (mine) { say(`C-130 ${why}`, 2.5); deadT = 3; }
    ctx.onUnitLost?.('c130', why, mine);
    // a replacement comes from depot: the hangar is empty until then
  }
  D.hurt = (amount, why) => {
    if (!D.present() || ctx.G.bench) return;
    D.hp -= amount; sfx.hit?.();
    if (Math.random() < 0.45) { const k = Math.floor(Math.random() * 4), e = S.eng[k]; e.hp = Math.max(0, e.hp - 0.3 - Math.random() * 0.4); if (e.hp < 0.4 && e.run && !e.fire) { e.fire = true; say(`NUMBER ${k + 1} ENGINE FIRE  -  PULL THE FIRE HANDLE (OVERHEAD)`, 2); } else say(`${why || 'HIT'}  -  NUMBER ${k + 1} ENGINE DAMAGED`, 1.6); }
    if (D.hp <= 0) lose('SHOT DOWN');
  };

  // ---------------------------------------------------------------- keys, switches
  D.key = (code, e) => {
    const shift = e && e.shiftKey;
    switch (code) {
      case 'KeyK': if (shift) { if (S.onGround) quickStart(); return true; } if (!S.onGround) { say('THE ENGINES STAY ON IN THE AIR (CONDITION LEVERS ON THE OVERHEAD IF YOU MEAN IT)', 2); return true; }
        crewStart = S.eng.some(e => e.run) ? 'stop' : 'start'; crewT = 0; say(crewStart === 'stop' ? 'ENGINEER: SHUTTING DOWN' : 'ENGINEER: STARTING ENGINES  -  BATTERY, GTC, 3, 4, 2, 1', 2); return true;
      case 'KeyL': if (shift && S.onGround && L.onPavement(S.pos.x, S.pos.z, 30) && Math.hypot(S.vel.x, S.vel.z) < 2) { if (!S.eng.every(e => e.run)) quickStart(); D.lineUp(); } else if (shift) say('LINE UP: STOPPED ON THE BASE ONLY', 1.4); return true;
      case 'KeyB': parkBrake = !parkBrake; say(parkBrake ? 'PARKING BRAKE SET' : 'PARKING BRAKE OFF', 1); return true;
      case 'KeyG': if (S.onGround && S.gearCmd) { say('NOT ON THE GROUND', 1); return true; } S.gearCmd = S.gearCmd ? 0 : 1; say(S.gearCmd ? 'GEAR DOWN' : 'GEAR UP', 1); return true;
      case 'KeyZ': S.flapSel = Math.max(0, S.flapSel - 0.5); say(`FLAPS ${Math.round(S.flapSel * 100)} %`, 1); return true;
      case 'KeyX': S.flapSel = Math.min(1, S.flapSel + 0.5); say(`FLAPS ${Math.round(S.flapSel * 100)} %`, 1); return true;
      case 'KeyH':
        if (shift || code === 'KeyN') { D.ap = { mode: 'home' }; say(`AUTOPILOT: HOME TO ${L.name}  -  APPROACH AND LANDING (STICK TO TAKE OVER)`, 2.4); return true; }
        if (S.onGround) { say('AUTOPILOT: IN THE AIR ONLY', 1.2); return true; }
        D.ap = D.ap ? null : { track: S.track(), alt: S.pos.y, kias: Math.max(140, S.kias) }; if (D.ap) Object.assign(S.apState, { I: 0, It: 0, Ir: 0 });
        say(D.ap ? `AUTOPILOT ON  -  HOLDING ${Math.round(((-D.ap.track * 180 / Math.PI) % 360 + 360) % 360)} DEG, ${Math.round(D.ap.alt * 3.28 / 100) * 100} FT, ${Math.round(D.ap.kias)} KIAS` : 'AUTOPILOT OFF', 1.8); return true;
      case 'KeyN': D.ap = { mode: 'home' }; say(`AUTOPILOT: HOME TO ${L.name}  -  APPROACH AND LANDING (STICK TO TAKE OVER)`, 2.4); return true;
      case 'KeyO': { const w = D.handIn(); if (w) say(w === 'STOP ON THE BASE FIRST' ? 'HAND HER IN: STOPPED ON THE BASE (RUNWAY, TAXIWAY OR RAMP)' : w, 1.6); return true; }
      case 'KeyV': D.view = D.view === 'cockpit' ? 'chase' : 'cockpit'; look.yaw = look.pitch = 0; snapChase = true; if (D.view === 'chase' && document.pointerLockElement) document.exitPointerLock?.(); say(D.view === 'cockpit' ? 'FLIGHT DECK  -  CLICK TO LOOK ROUND, THE CROSSHAIR WORKS THE SWITCHES' : 'CHASE CAMERA', 1.2); return true;
      case 'KeyF': case 'KeyI': case 'KeyU': case 'KeyT': case 'KeyC': return true;
    }
    if (/^Digit/.test(code) && !shift) return false;
    return false;
  };
  D.switches = () => D.present() && D.view === 'cockpit' ? deck : null;
  D.click = (id, alt) => {
    const k = +id.slice(-1); sfx.blip?.(1400, 900, 0.04, 'square', 0.05);
    if (id.startsWith('cond')) { const e = S.eng[k]; S.setCond(k, alt ? 'stop' : e.cond === 'run' ? 'feather' : e.cond === 'feather' ? 'airstart' : 'run'); say(`CONDITION LEVER ${k + 1}: ${S.eng[k].cond.toUpperCase()}`, 1.2); }
    else if (id.startsWith('fire')) { const e = S.eng[k]; e.firePulled = true; S.setCond(k, 'feather'); if (e.fire) /** @type {any} */ (e).fire = 'out'; say(`NUMBER ${k + 1} FIRE HANDLE PULLED`, 1.4); }
    else if (id.startsWith('start')) S.startEngine(k);
    else if (id === 'gear') S.gearCmd = S.gearCmd ? 0 : 1;
    else if (id === 'flap') S.flapSel = S.flapSel >= 1 ? 0 : S.flapSel + 0.5;
    else if (id === 'ap' || id === 'apAlt') D.key('KeyH');
    else if (id === 'af') S.autoFeatherArm = !S.autoFeatherArm;
    else if (id === 'bat') S.battery = !S.battery;
    else if (id === 'gtc') S.gtc.cmd = !S.gtc.cmd;
    else if (id === 'bleed') S.bleedValve = !S.bleedValve;
    else if (id === 'doorL' || id === 'doorR') { const i = id === 'doorL' ? 0 : 1; S.doorCmd[i] = S.doorCmd[i] ? 0 : 1; }
    else if (id === 'ramp') S.rampCmd = S.rampCmd ? 0 : 1;
    else if (id === 'mc') mcReset = true;
  };

  // ---------------------------------------------------------------- views
  D.firstPerson = () => D.present() && D.view === 'cockpit';
  D.fov = c => c;
  D.look = (dx, dy) => {
    if (D.view === 'chase') { look.oy -= dx * 0.004; look.op = clamp(look.op - dy * 0.003, -0.35, 1.2); return; }
    look.yaw = clamp(look.yaw - dx * 0.0025, -2.6, 2.6); look.pitch = clamp(look.pitch - dy * 0.0025, -1.1, 1.0);
  };
  D.lookAt = (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; D.holdLook = true; };
  D.orbitTo = (oy, op = 0, dist) => { look.oy = oy; look.op = op; if (dist) D.chaseDist = dist; snapChase = true; };
  D.camera = (cam, dt) => {
    if (D.camAt) { const c = D.camAt; cam.position.set(c[0], c[1], c[2]); cam.up.set(0, 1, 0); cam.lookAt(c[3], c[4], c[5]); return; }   // tests / screenshots: a fixed camera
    if (!D.present()) return;
    g.updateMatrixWorld(true);
    const H = ctx.hwOn() ? ctx.CTL.state : null, hat = H && (H.hatX || H.hatY);
    if (hat) { look.yaw = clamp(look.yaw - H.hatX * 2.2 * dt, -2.6, 2.6); look.pitch = clamp(look.pitch + H.hatY * 1.6 * dt, -1.1, 1.0); }
    else if (!ctx.view.locked() && !D.holdLook && D.view === 'cockpit') { const k = Math.exp(-5 * dt); look.yaw *= k; look.pitch *= k; }
    if (D.view === 'cockpit') {
      cam.position.copy(DECK_EYE).applyQuaternion(S.q).add(S.pos);   // from the sim state, not the mesh (posed later this frame: a frame behind at speed is metres)
      cam.quaternion.copy(S.q).multiply(_q.setFromEuler(_e.set(DECK_EYE_PITCH + look.pitch, look.yaw, 0, 'YXZ')));
      if (!cam.userData.xr && S.buffet > 0.05) { cam.position.y += (Math.random() - 0.5) * 0.03 * S.buffet; }
      hover = null; cam.updateMatrixWorld();
      return;
    }
    const f = S.forward(_w); f.y = 0; f.normalize();
    const yaw = Math.atan2(f.x, f.z) + look.oy, dist = D.chaseDist || 62, hgt = 14 + look.op * 40;
    _v.set(S.pos.x - Math.sin(yaw) * dist, S.pos.y + hgt, S.pos.z - Math.cos(yaw) * dist);
    if (snapChase) { cam.position.copy(_v); snapChase = false; } else cam.position.lerp(_v, 1 - Math.exp(-3 * dt));
    cam.position.y = Math.max(cam.position.y, groundY(cam.position.x, cam.position.z) + 2);
    cam.up.set(0, 1, 0); cam.lookAt(S.pos.x + f.x * 20, S.pos.y + 1, S.pos.z + f.z * 20);
  };

  // ---------------------------------------------------------------- model, deck, sound (every frame)
  function pose(dt) {
    g.position.copy(S.pos); g.quaternion.copy(S.q);
    model.animate({ eng: S.eng, flap: S.flap, gear: S.gear, ramp: S.ramp, door: S.door, ele: S.surf.ele, ail: S.surf.ail, rud: S.surf.rud, steer: S.steer, wow: S.wow, jumpLight: 'off' }, dt, t, D.view === 'cockpit' && crafts.active === D);
  }
  D.render = (dt, time, fp) => {
    if (!D.present()) { deck.group.visible = false; return; }   // parked in the hangar: posed once in parkAt
    pose(dt);
    const inside = fp && D.view === 'cockpit' && crafts.active === D;
    deck.group.visible = inside;
    if (inside) {
      const caut = { gear: S.gear > 0.01 && S.gear < 0.99, flapOs: S.kias > C130.V_FLAP(S.flap) + 2 && S.flap > 0.05, ramp: S.ramp > 0.02, door: S.door[0] > 0.02 || S.door[1] > 0.02,
        otq: S.eng.some(e => e.torque > 19600), tit: S.eng.some(e => e.tit > 1083), nts: S.eng.some(e => e.nts), eng: S.eng.some(e => !e.run), fuel: S.fuel < 1800, stall: S.buffet > 0.3, af: S.autoFeatherArm, doorOs: false };
      if (!Object.values(caut).some(Boolean)) mcReset = false;
      const [rx, rz] = L.toW(nearestEnd().u, 0);
      deck.update(S, { ap: !!D.ap, jumpLight: 'off', jumpSwitch: 'off', dz: { brg: Math.atan2(-(rx - S.pos.x), -(rz - S.pos.z)), dist: Math.hypot(rx - S.pos.x, rz - S.pos.z) },
        agl: S.pos.y - groundY(S.pos.x, S.pos.z) - 2.6, cautions: caut, mcReset, time: t, ctl: lastC, checklist: S.onGround ? checklist() : null }, dt, ctx.hover());
    }
    const cam = ctx.camZ();
    if (cam && ctx.G.state === 'play') {
      const d = cam.position.distanceTo(S.pos), vr = d > 1 ? _v.subVectors(cam.position, S.pos).dot(S.vel) / d : 0;
      snd.update({ eng: S.eng, tas: S.tas, inside, dist: d, vr, gtc: S.gtc.N, bleed: S.bleed });
    }
    // engine fire smoke, prop wash dust on the ground at power
    for (let k = 0; k < 4; k++) if (S.eng[k].fire === true && Math.random() < dt * 20) { _v.set(C130M.ENG_X[k], C130M.ENG_Y + 0.6, 2.5).applyQuaternion(S.q).add(S.pos); fx.trail?.(_v.x, _v.y, _v.z, 1); }
  };
  function checklist() {
    const E = S.eng, allRun = E.every(e => e.run && e.N > 0.94);
    if (!allRun) return { title: 'STARTING ENGINES', items: [['BATTERY', S.battery, 'ON'], ['GTC', S.gtc.N > 0.95, 'ON SPEED'], ['BLEED AIR VALVE', S.bleedValve, 'OPEN'], ['BRAKES', parkBrake, 'SET'],
      ...START_ORDER.map(k => [`ENGINE ${k + 1}`, E[k].run && E[k].N > 0.94, `${Math.round(E[k].N * 100)} %`])] };
    return { title: D.sortie.airborne ? 'AFTER LANDING' : 'BEFORE TAKEOFF', items: [['FLAPS', S.flapSel === 0.5 || D.sortie.airborne, D.sortie.airborne ? 'UP' : '50 %'], ['TRIM', true, 'SET'], ['BRAKES', !parkBrake, parkBrake ? 'SET - B' : 'OFF'], ['RUNWAY', L.onRunway(S.pos.x, S.pos.z), 'LINED UP']] };
  }
  D.silence = () => snd.stop();

  // ---------------------------------------------------------------- HUD, what war.js sees
  D.hud = () => {
    const so = D.sortie, gs = Math.hypot(S.vel.x, S.vel.z), hv = ctx.hover();
    const eng = S.eng.filter(e => e.run).length, [u, v] = L.toL(S.pos.x, S.pos.z, _l), dist = Math.hypot(S.pos.x - L.x, S.pos.z - L.z);
    let hint = hv && D.view === 'cockpit' ? `${deck.labelOf(hv, S, { ap: !!D.ap, jumpLight: 'off' })}  -  CLICK` : '';
    if (!hint) {
      if (crewStart) hint = crewStart === 'stop' ? 'ENGINEER: SHUTTING DOWN' : `ENGINEER: STARTING  -  ${eng} OF 4 RUNNING`;
      else if (S.onGround && eng < 4 && !so.airborne) hint = 'K: ENGINEER STARTS ALL FOUR  ·  SHIFT+K QUICK START  ·  SHIFT+L LINE UP ON THE RUNWAY';
      else if (S.onGround && so.airborne && so.stopped) hint = 'SORTIE COMPLETE  -  O: HAND HER TO THE GROUND CREW (TOWED INTO THE HANGAR)  ·  OR B + K: BRAKE, SHUT DOWN';
      else if (S.onGround && parkBrake) hint = 'B: PARKING BRAKE OFF  ·  SHIFT / CTRL POWER  ·  Q / E (OR , .) NOSE WHEEL  ·  SPACE BRAKES  ·  R REVERSE  ·  SHIFT+L LINE UP';
      else if (S.onGround && !so.airborne) hint = L.onRunway(S.pos.x, S.pos.z) ? 'ON THE RUNWAY  -  FLAPS 50 (X), FULL POWER (SHIFT), ROTATE AT ~105 KIAS (S)' : 'TAXI TO THE RUNWAY: THE YELLOW LINES  ·  SHIFT+L LINE UP';
      else if (D.ap && D.ap.mode === 'home') hint = D.ap.final ? `AUTOPILOT APPROACH  -  RUNWAY ${String(D.ap.end.num).padStart(2, '0')}  ·  STICK TO TAKE OVER` : `AUTOPILOT: HOME TO ${L.name}  ${(dist / 1000).toFixed(1)} km`;
      else if (!S.onGround) hint = `${L.name} ${(dist / 1000).toFixed(1)} km  ·  N: AUTOPILOT HOME AND LAND  ·  H HOLD  ·  G GEAR  ·  Z / X FLAPS  ·  V VIEW`;
    }
    const line = `C-130H  ${Math.round(S.kias)} KIAS  ${Math.round((S.pos.y - groundY(S.pos.x, S.pos.z) - 2.6) * 3.28)} FT AGL  HDG ${String(Math.round(((-S.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}  ${eng}/4 ENG  FLAPS ${Math.round(S.flap * 100)}  GEAR ${S.gear > 0.99 ? 'DN' : S.gear < 0.01 ? 'UP' : 'TRANSIT'}${parkBrake ? '  BRAKE' : ''}${D.ap ? '  AP' : ''}${S.onGround ? `  GS ${Math.round(gs * KT * 2)} KT` : ''}`;
    void u; void v;
    return { line, hint, weap: `${L.label}  ·  ${Math.round(S.fuel * 2.2046)} LB FUEL`, fuel: S.fuel / 90, fuelLabel: 'FUEL' };
  };
  D.menuNote = () => `C-130H FUEL ${Math.round(S.fuel * 2.2046)} LB`;
  D.pl = { alive: () => D.present(), landed: () => D.present() && S.onGround, inCave: false, hitR: 14, sight: 0 };
  D.avatar = Z0 => { if (!D.present()) return; Z0.pos.copy(S.pos); Z0.vel.copy(S.vel); const f = S.forward(_w); Z0.facing.set(f.x, f.z).normalize(); };
  D.bounds = () => {
    if (!D.present() || !S.onGround) return null;
    const b = D._b ||= {}; b.x = S.pos.x; b.z = S.pos.z; b.yaw = S.heading; b.hl = C130M.LENGTH / 2; b.hw = 2.2; b.y0 = S.pos.y - 2.64; b.y1 = S.pos.y + 9; b.def = D; return b;
  };
  return D;
}

// ------------------------------------------------------------------------------------------------ the way home (pure)
// The C-130 autopilot's HOME mode: to the initial approach fix 6 km out on the centreline of the runway end it can
// join with the least turning, a final with a 3 deg glide path (1,000 ft until it meets it), flaps 50 then 100, gear
// down, flare at ~30 ft, power to idle, rollout with reverse, rudder / nose wheel on the centreline and brakes.
// S: the c130fm sim, A: the mode's state object ({} to start), L: the AIRBASE layout. Returns the controls for S.step.
// Pure (tools/airbasebench.mjs flies it in node).
export function homeAutopilot(S, A, L, dt, groundY, say = null) {
  const _p = [0, 0], [u, v] = L.toL(S.pos.x, S.pos.z, _p);
  // the end: the one on our side of the field, unless its approach is over high ground and the other's is clearer
  const e = A.end || (A.end = (() => { const near = u < 0 ? L.ends[0] : L.ends[1], far = near === L.ends[0] ? L.ends[1] : L.ends[0]; return near.obst > -60 && far.obst < near.obst ? far : near; })()), d = e.dir;
  const along = (u - e.u) * d;   // metres past the threshold (negative on final)
  const agl = S.pos.y - groundY(S.pos.x, S.pos.z);
  let tgt, alt, kias;
  if (!A.final) {
    const [fx, fz] = L.toW(e.u - d * 6000, 0), dist = Math.hypot(fx - S.pos.x, fz - S.pos.z);   // the initial approach fix
    tgt = Math.atan2(-(fx - S.pos.x), -(fz - S.pos.z)); kias = 170;
    // 1,000 ft over the field, and never less than 500 ft over the ground ahead (the land round the base is not flat)
    const sp = Math.max(30, Math.hypot(S.vel.x, S.vel.z)); let fl = groundY(S.pos.x, S.pos.z); for (const k of [8, 16, 30, 45]) fl = Math.max(fl, groundY(S.pos.x + S.vel.x / sp * k * sp, S.pos.z + S.vel.z / sp * k * sp));
    alt = Math.max(L.E + 330, fl + 160);
    if (agl < 120 && S.vel.y > -1) { kias = 160; tgt = S.track(); }   // just off the ground: climb out straight ahead first
    if (dist < 600 || (along < -2500 && along > -6100 && Math.abs(v) < 300 && Math.abs(angDiff(S.track(), L.yawOf(d, 0))) < 0.5)) { A.final = true; say?.(`C-130: ESTABLISHED ON FINAL, RUNWAY ${String(e.num).padStart(2, '0')}`); }
    S.flapSel = dist < 3500 ? 0.5 : agl < 120 ? 0.5 : 0; if (agl > 40) S.gearCmd = dist < 3500 ? 1 : 0;
  } else {
    const [px, pz] = L.toW(u + d * 900, 0); tgt = Math.atan2(-(px - S.pos.x), -(pz - S.pos.z));
    const toAim = -(along - 300);
    alt = L.E + Math.min(330, Math.max(0, toAim) * Math.tan(3 * Math.PI / 180)) + 2.6; kias = toAim > 4000 ? 150 : 122;
    if (toAim > 2500) { let fl = 0; for (const k of [0, 400, 900]) { const [qx, qz] = L.toW(u + d * k, v); fl = Math.max(fl, groundY(qx, qz)); } alt = Math.max(alt, fl + 100); }   // terrain under the final
    S.gearCmd = 1; S.flapSel = toAim < 3500 ? 1 : 0.5;
  }
  const c = S.autopilot(dt, { track: tgt, alt, kias, vsMax: A.final ? 4 : 6, bankMax: agl < 150 ? 0.3 : undefined });
  if (A.final && agl < 9 && along > -400) A.flare = true;
  if (A.flare) { c.throttle = [0, 0, 0, 0]; c.pitch = Math.max(c.pitch, 0.12); c.roll = clamp(c.roll, -0.3, 0.3); }
  if (A.flare && S.onGround) A.rollout = true;
  if (A.rollout) {   // rudder and nose wheel toward a point 150 m down the centreline (right pedal: heading decreases)
    const [qx, qz] = L.toW(u + d * 150, 0), st = clamp(angDiff(Math.atan2(-(qx - S.pos.x), -(qz - S.pos.z)), S.heading) * 3, -1, 1), gs = Math.hypot(S.vel.x, S.vel.z);
    return { pitch: 0, roll: 0, yaw: st, tiller: st * 0.3, lever: Array(4).fill(gs > 8 ? 5 : 18), brakeL: 1, brakeR: 1 };
  }
  return { ...c, lever: c.throttle.map(x => 34 + x * 56), brakeL: 0, brakeR: 0, trimRate: c.trimRate };
}

// ------------------------------------------------------------------------------------------------ the base: ops
// The host side main.js wires to: the parked aircraft in their hangars, deploy (a sortie from the board), the hand-in,
// the SR-71 slot. defs: { c130: def, sr71: def | null }.
export function createBaseOps(ctx) {
  const L = ctx.AIRBASE, defs = {};
  const ops = {
    L, defs, ctx,
    add(def) { defs[def.id] = def; if (!def.present()) def.parkAt?.(L.spot(def.baseSlot, 'park')); return def; },
    // register a base aircraft with the craft host and park it in its slot (the SR-71: ops.attach(createSR71Craft(ops.ctx)))
    attach(def) { if (!ctx.crafts.get(def.id)) ctx.crafts.register(def); return ops.add(def); },
    // the board: '' = out, else why not. mode: 'cold' | 'hot' | 'runway'
    deploy(id, mode = ctx.params?.has('cold') ? 'cold' : 'hot') {
      const def = defs[id]; if (!def) return id === 'sr71' ? 'THE SR-71 IS NOT ON THE BASE YET (ngc/look-sr71)' : 'NOT AT THE AIR BASE';
      if (def.present()) return ctx.crafts.control(def.id, 0, 'command') ? '' : `CANNOT REACH THE ${def.label}`;
      const sp = L.spot(def.baseSlot, 'ramp'); if (!sp) return 'NO HANGAR SLOT';
      def.spawnAt(sp, mode); if (mode === 'runway' && def.lineUp) def.lineUp();
      return ctx.crafts.control(def.id, 0, 'command') ? '' : `THE ${def.label} WOULD NOT TAKE A CREW`;
    },
    status(id) {
      const def = defs[id]; if (!def) return 'NO AIRCRAFT IN THE SLOT';
      if (!def.present()) return `IN THE HANGAR AT ${L.name}`;
      const f = def.frame({}), so = def.sortie || {}, d = Math.hypot(f.x - L.x, f.z - L.z);
      return def.crew ? `CREW FLYING HER HOME TO ${L.name}` : so.onBase ? `ON THE GROUND AT ${L.name}` : def.flying?.() ? `FLYING  ${(d / 1000).toFixed(1)} km FROM ${L.name}` : `ON THE GROUND ${(d / 1000).toFixed(1)} km FROM ${L.name}`;
    },
  };
  return ops;
}
