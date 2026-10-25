// ch46craft.js - the PLAYER's CH-46F Sea Knight as a craft (craft.js), the part the game host sees. ch46play.js flies
// it (the validated flight model through the pilot's inputs, AFCS, systems, damage), ch46cockpit.js is the cockpit,
// ch46troops.js the Marines in the back; the exterior is the war's own CH-46 model (ch46model.js).
//   - taken out from the command board (\, the last row) on the ALBATROSS (a deck spot the AI Sea Knights don't use)
//     or beside a friendly island's pad, hot (rotors turning) or with ?cold cold and dark
//   - three views (V): the cockpit (clickable start / switches, mouse or hat looks round), the chase camera, the cabin
//     (the troop seats, the door gunners, the ramp); the pause menu's cockpit FOV slider applies
//   - B: a stick of 13 Marines boards by the ramp on the deck / at a friendly pad (20 materiel), rides, comes off by
//     the ramp at an island and joins the ground war (groundwar.js GW.landing); R the ramp; G the door gunners
//   - left in the air (you switch to another unit) the crew flies her home to the deck or the nearest friendly pad
//     (transportai.js + the AI pilot, the same as the war's Sea Knights); lost, she is the fleet's loss
//   - pl / hurt / avatar: what war.js sees (a big target, ~7 m)
import * as THREE from 'three';
import { createCH46Play } from './ch46play.js';
import { buildCH46Mesh } from './ch46model.js';
import { buildCH46Cockpit, CH46_EYE, CH46_EYE_PITCH } from './ch46cockpit.js';
import { createCH46Troops } from './ch46troops.js';
import { createRotorSound } from './rotorsound.js';
import { createPilot, stateOf } from './pilot.js';
import { createTransportAI } from './transportai.js';
import { flyCH46, CH46_AI } from './ch46ai.js';
import { CH46 } from './ch46fm.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const CH46_STICK_COST = 20;   // materiel for a stick of 13 Marines (game level; the AI order is 40 with the aircraft)
// deck spots on the ALBATROSS (local x, z): the AI Sea Knights take [-2, -2] and [-2, -35] first, the Huey [-2, 32]
const DECK_SPOTS = [[-2, -35], [-2, -2], [-2, 12]];

// ctx: { scene, war, G, Z, CTL, keyDown, hwOn, say, feed, sfx, fx, crafts, head, params, ISLANDS, terrainH, waterAt,
//        serviceAt(x, z), whereIs(x, z), camZ(), hover(), view: { locked() }, onUnitLost(id, why, mine), autoNext(), heliPos() }
export function createCH46Craft(ctx) {
  const { scene, war, G, Z, CTL, say, feed, sfx, fx, crafts, head } = ctx;
  const P = createCH46Play(), S = P.S, B = S.body;
  const model = buildCH46Mesh({ modex: 7 }), g = model.group; g.visible = false; scene.add(g);
  const ck = buildCH46Cockpit(); g.add(ck.group);
  const groundY = (x, z) => Math.max(ctx.terrainH(x, z), 0, war.deckY(x, z));
  const env = { groundY, water: (x, z) => ctx.waterAt(x, z), surfVel: (x, z) => war.surfVel(x, z), rho: 1.225 };
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(2.6, 1, 7.5), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  shadow.visible = false; scene.add(shadow);
  const snd = sfx ? createRotorSound(sfx) : null, sndList = [{ kind: 'ch46', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, nr: 0, load: 1 }];
  const proxy = { kind: 'ch46', p: new THREE.Vector3(), v: new THREE.Vector3(), dying: false, dead: false, stowed: false };
  const TR = createCH46Troops({ parent: scene, P, model, groundY, onDeployed: (Q, n, I) => {
    const GW = war.ground; if (!GW || !I || !I.pad || !I.name) return false;
    proxy.dying = proxy.dead = false; GW.landing(proxy, { squad: Q }, 1, I);   // (no U.AI: the Sea Knight's own casevac is the AI's)
    feed(`${I.name}: ${n} MARINES OFF THE RAMP`, 'good'); return true;
  } });
  const D = {
    id: 'ch46', label: 'CH-46F SEA KNIGHT', kind: 'air', P, model, cockpit: ck, troops: TR,
    seats: [{ id: 'pilot', label: 'AIRCRAFT COMMANDER', role: 'driver', doors: [[1.3, -0.6, -4.2]], exit: [2.3, -1.8, -4.2], reach: 2.6 }],
    active: false, view: ctx.params && ctx.params.has('cockpit') ? 'cockpit' : 'chase', gunners: true, crew: null, downT: 0, lostWhy: '',
  };
  const look = { yaw: 0, pitch: 0, oy: 0, op: 0 };   // head in the cockpit / cabin; the chase camera's orbit
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3();
  const _xA = new THREE.Vector3(1, 0, 0), _yA = new THREE.Vector3(0, 1, 0), _att = {};
  const yawOf = () => { S.attitude(_att); return _att.yaw; };
  const fwd = out => { S.attitude(_att); return out.set(-Math.sin(_att.yaw), 0, -Math.cos(_att.yaw)); };

  // ---------------------------------------------------------------- presence, spots, deploy, stow
  D.present = () => D.active && P.alive;
  D.frame = out => { out.x = B.pos[0]; out.y = B.pos[1]; out.z = B.pos[2]; out.yaw = yawOf(); return out; };
  function carrier() { const c = war.carrier; return c && c.sinking === undefined && !(c.sky && c.sky.up) ? c : null; }
  function deckSpot(c, lx, lz) { const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), x = c.p.x + lx * cs + lz * sn, z = c.p.z - lx * sn + lz * cs; return { x, y: war.deckY(x, z), z, hdg: c.yaw }; }
  const taken = (x, z, skipMe = true) => war.units.some(u => u.rot && !u.dead && Math.hypot(u.p.x - x, u.p.z - z) < 16) || (ctx.heliPos && (() => { const h = ctx.heliPos(); return h && Math.hypot(h.x - x, h.z - z) < 14; })()) || (!skipMe && D.present() && Math.hypot(B.pos[0] - x, B.pos[2] - z) < 16);
  D.spotAt = b => {
    if (!b || b.kind === 'ship') { const c = carrier(); if (!c) return null; for (const [lx, lz] of DECK_SPOTS) { const s = deckSpot(c, lx, lz); if (s.y > 0 && !taken(s.x, s.z)) return s; } return null; }
    const I = b.I; if (!I || !I.pad) return null;
    const R = war.rotary, lz = R && R.chooseLZ ? R.chooseLZ(I, R.FOOT.ch46) : { x: I.pad.x + 18, y: I.pad.h, z: I.pad.z, hdg: 0 };
    return { x: lz.x, y: groundY(lz.x, lz.z), z: lz.z, hdg: lz.hdg };
  };
  D.deploy = b => {
    if (G.mode !== 'zarch') return 'CLIMB OUT OF THE CAVE FIRST';
    const sp = D.spotAt(b); if (!sp) return `NO ROOM FOR A SEA KNIGHT ${b && b.kind === 'island' ? 'AT ' + b.name : 'ON THE ALBATROSS DECK'}`;
    spawnAt(sp, ctx.params && ctx.params.has('cold'));
    return crafts.control('ch46', 0, 'command') ? '' : 'THE SEA KNIGHT WOULD NOT TAKE A CREW';
  };
  function spawnAt(sp, cold) {
    TR.reset(); D.crew = null;
    P.reset({ pos: [sp.x, sp.y, sp.z], yaw: sp.hdg, landed: true, cold, env });
    const sv = war.surfVel(sp.x, sp.z); if (sv) { B.vel[0] = sv.vx; B.vel[2] = sv.vz; }
    D.active = true; g.visible = true; proxy.stowed = false; D.downT = 0; look.yaw = look.pitch = look.oy = look.op = 0; snapChase = true;
  }
  D.spawnAt = spawnAt;
  D.stow = () => { if (TR.state !== 'empty') TR.reset(); D.active = false; D.crew = null; g.visible = false; shadow.visible = false; proxy.stowed = true; D.silence(); return true; };
  D.atBase = () => { if (!D.present()) return false; const s = ctx.serviceAt(B.pos[0], B.pos[2]); return !!s && S.landed; };
  // a slot for the AI Sea Knights' deck spot choice (rotary.js asks)
  if (war.rotary) war.rotary.blocked = (x, z) => D.present() && Math.hypot(B.pos[0] - x, B.pos[2] - z) < 16;

  // ---------------------------------------------------------------- in and out
  D.enter = (seat, from) => {
    if (!D.present()) return false;
    if (D.crew) { D.crew = null; P.setCollective(S.c.coll); P.sync(); say(S.landed ? 'YOU HAVE THE SEA KNIGHT' : `YOU HAVE THE SEA KNIGHT  -  ${Math.round(S.agl * 3.28)} FT  ${Math.round(P.ias())} KT`, 2); }
    else { P.setCollective(S.landed ? 0 : S.c.coll); }
    look.yaw = look.pitch = 0;
    if (from === 'foot') { D.view = 'cockpit'; say(P.running() ? 'IN THE SEA KNIGHT  -  COLLECTIVE UP TO LIFT  ·  Y GET OUT' : 'IN THE SEA KNIGHT  -  I TO START (OR THE OVERHEAD SWITCHES)', 2.4); }
    if (from === 'command' && S.landed) say(P.running() ? 'CH-46F ON THE SPOT, TURNING  -  SHIFT / SPACE COLLECTIVE UP TO LIFT  ·  B TROOPS  ·  V VIEWS' : 'CH-46F COLD AND DARK  -  I TO START, OR CLICK THROUGH THE OVERHEAD (V: COCKPIT)', 3);
    return true;
  };
  D.canExit = () => {
    if (!S.landed) return 'LAND FIRST';
    const sv = war.surfVel(B.pos[0], B.pos[2]), rel = Math.hypot(B.vel[0] - (sv ? sv.vx : 0), B.vel[2] - (sv ? sv.vz : 0));
    if (rel > 1) return 'STOP ON THE WHEELS FIRST';
    if (S.c.coll > 0.15) return 'COLLECTIVE DOWN FIRST (CTRL / Z)';
    return '';
  };
  D.exitSpots = () => [[2.3, -1.75, -4.2], [-2.4, -1.75, -3.5], [0, -1.75, 9.5]].map(p => crafts.toWorld(D, p)).filter(Boolean).map(w => ({ x: w.x, y: groundY(w.x, w.z), z: w.z, yaw: w.yaw - Math.PI / 2 }));
  // left in the air: the crew takes her home (the deck spot, else the nearest friendly pad) and sets her down
  D.exit = next => {
    if (!D.present() || S.landed || !next || next === D) return;
    const home = homeSpot(); if (!home) return;
    const AI = createTransportAI(CH46_AI, { lz: () => null, home: () => homeSpot(), unload: () => true, parked: () => { if (D.crew) { feed(`SEA KNIGHT DOWN SAFELY ${home.name ? 'AT ' + home.name : 'ON THE ALBATROSS'}`, 'good'); D.crew = null; } } });
    const PL = createPilot(CH46.PILOT); PL.reset(S.c.coll); PL.i.lon = S.c.lon; PL.i.lat = S.c.lat; PL.i.ped = S.c.ped;
    AI.set('rtb'); D.crew = { AI, PL, st: {}, dest: home.name || 'THE ALBATROSS' };
    feed(`SEA KNIGHT: THE CREW IS FLYING HER TO ${D.crew.dest}`, 'info');
  };
  function homeSpot() {
    const c = carrier();
    if (c) { const s = deckSpot(c, DECK_SPOTS[0][0], DECK_SPOTS[0][1]); return { ...s, vx: c.v.x, vz: c.v.z, name: '' }; }
    let best = null, bd = 1e9; for (const I of ctx.ISLANDS) if (I.owner === 1 && I.pad && !I.cave) { const d = Math.hypot(I.pad.x - B.pos[0], I.pad.z - B.pos[2]); if (d < bd) { bd = d; best = I; } }
    if (!best) return null;
    const s = D.spotAt({ kind: 'island', I: best }); return s && { ...s, vx: 0, vz: 0, name: best.name };
  }
  D.flying = () => D.present() && !S.landed;
  D.status = () => !D.present() ? '' : D.crew ? `CREW FLYING HER TO ${D.crew.dest}` : `${S.landed ? (P.running() ? 'TURNING' : 'PARKED') : 'FLYING'} ${ctx.whereIs(B.pos[0], B.pos[2])}${P.marines ? `  ·  ${P.marines} MARINES ABOARD` : ''}  ·  FUEL ${Math.round(P.fuel)}%`;

  // ---------------------------------------------------------------- flying
  const _parked = { coll: 0, lon: 0, lat: 0, ped: 0, brake: 1, rbrake: false, ecl0: 1, ecl1: 1, start0: false, start1: false };
  D.update = (dt, inp) => {
    if (!D.present()) { lostTick(dt); return; }
    const hw = D.testHands ? D.testHands(P, dt, env) : ctx.hwOn() ? CTL.state : null;   // (testHands: a scene's virtual HOTAS, tools/scenes/ch46fly.mjs)
    const c = P.read(dt, { kd: ctx.keyDown, hw, env });
    if (P.press && P.press.view) cycleView();
    stepSim(dt, c, true);
    Z.pos.set(B.pos[0], B.pos[1], B.pos[2]); Z.vel.set(B.vel[0], B.vel[1], B.vel[2]); Z.landed = S.landed;
    fwd(_f); Z.facing.set(_f.x, _f.z);
  };
  D.idle = dt => {
    if (!D.present()) { lostTick(dt); return; }
    let c = _parked;
    if (D.crew) {   // the crew flying her home: the war's transport AI and the AI pilot (30 Hz), the same controls a pilot moves
      const K = D.crew, nS = Math.max(1, Math.ceil(dt * 30 - 1e-6)), h = dt / nS;
      for (let i = 0; i < nS - 1 && P.alive && D.crew; i++) { stateOf(B, K.st); const cm = K.AI.step(K.st, S, h, aiWorld); P.step(h, env, flyCH46(S, K.PL, K.st, cm, h)); }
      if (!P.alive) { lose(P.dead); return; }
      stateOf(B, K.st); const cmd = K.AI.step(K.st, S, h, aiWorld); c = flyCH46(S, K.PL, K.st, cmd, h); c.brake = 1;
      stepSim(h, c, false); return;
    } else { _parked.ecl0 = P.sys.ecl[0]; _parked.ecl1 = P.sys.ecl[1]; _parked.rbrake = P.sys.rbrake; }
    stepSim(dt, c, false);
  };
  const aiWorld = { groundY, floorAlong(x, z, ux, uz, L) { let m = groundY(x, z); for (let s = 12; s <= L; s += 12) m = Math.max(m, groundY(x + ux * s, z + uz * s)); return m; } };
  function stepSim(dt, c, piloted) {
    const ev = P.step(dt, env, c);
    TR.update(dt, war.time || 0);
    if (P.marineHits) { feed(`SEA KNIGHT: ${P.marineHits > 1 ? P.marineHits + ' MARINES' : 'A MARINE'} HIT IN THE CABIN`, 'bad'); P.marineHits = 0; }
    for (const e of ev) {
      if (e === 'hardland' && piloted) { say('HARD LANDING  -  GEAR AND TRANSMISSIONS DAMAGED', 2); sfx.boom?.(0.4); }
    }
    if (!P.alive) { lose(P.dead); return; }
    // on a friendly pad or the deck: fuel from the fleet's stores, repairs
    if (S.landed) { const sv = ctx.serviceAt(B.pos[0], B.pos[2]); if (sv) service(sv, dt, piloted); }
    if (piloted && P.fuel <= 0 && !S.landed) say('FUEL EXHAUSTED  -  AUTOROTATE AND SET DOWN', 0.5);
    gunners(dt);
    proxy.p.set(B.pos[0], B.pos[1], B.pos[2]); proxy.v.set(B.vel[0], B.vel[1], B.vel[2]);
  }
  let svcMsg = false;
  function service(sv, dt, piloted) {
    const fill = Math.min(G.res, 20 * dt, 100 - P.fuel); G.res -= fill; P.fuel += fill;
    const rep = P.repair(dt);
    if (fill > 0.001 || rep) svcMsg = true; else if (svcMsg) { svcMsg = false; if (piloted) say(G.res < 1 ? 'FUEL STORES EMPTY' : `${sv.name}  -  FUELLED${rep ? '' : ' AND REPAIRED'}`, 1.6); }
  }
  // the door gunners (M60D / M2 on the crew door and the left window, game level): near enemies below, short bursts
  const _gp = new THREE.Vector3(), _gd = new THREE.Vector3();
  let gT = 0, gB = 0, gC = 0, gTgt = null, gFire = false, gAim = null;
  function gunners(dt) {
    gT -= dt; gB -= dt; gC -= dt;
    if (gT <= 0) { gT = 0.4; gTgt = null; if (D.gunners && !S.landed) { let bd = 150; for (const o of war.units) if (o.side === 2 && o.p && !o.dead && !o.dying && !o.dims && o.p.y < B.pos[1] + 8) { const d = Math.hypot(o.p.x - B.pos[0], o.p.y - B.pos[1], o.p.z - B.pos[2]); if (d < bd) { bd = d; gTgt = o; } } } if (!gTgt) { gAim = null; gFire = false; } }
    const T = gTgt; if (!T || T.dead) { gFire = false; return; }
    g.updateMatrixWorld(true);
    const S0 = (() => { _v.set(T.p.x - B.pos[0], 0, T.p.z - B.pos[2]); const y = yawOf(), c = Math.cos(y), s = Math.sin(y); return _v.x * c - _v.z * s; })();
    _gp.copy(model.GUNS[S0 > 0 ? 0 : 1]); g.localToWorld(_gp);
    const d = _gp.distanceTo(T.p), t = d / 100; _gd.set(T.p.x + (T.v ? T.v.x * t : 0) - _gp.x, T.p.y + 0.8 - _gp.y, T.p.z + (T.v ? T.v.z * t : 0) - _gp.z).normalize();
    (gAim || (gAim = new THREE.Vector3())).copy(_gd);
    if (gB <= 0) { gB = gFire ? rnd(1.2, 2.5) : rnd(0.6, 1.2); gFire = !gFire; }
    if (gFire && gC <= 0) { gC = 0.14; const e = 0.03 + d / 5000; _v.set((_gd.x + rnd(-e, e)) * 100 + B.vel[0], (_gd.y + rnd(-e, e)) * 100 + B.vel[1], (_gd.z + rnd(-e, e)) * 100 + B.vel[2]); _v2.copy(_gp).addScaledVector(_gd, 1.9); war.fireBullet(_v2, _v); }
  }
  // lost: the wreck burns, the Marines aboard die with her; the fleet counts it
  function lose(why) {
    const mine = crafts.active === D, gy = groundY(B.pos[0], B.pos[2]), wet = env.water(B.pos[0], B.pos[2]);
    fx.explode(B.pos[0], Math.max(gy + 1, B.pos[1]), B.pos[2], 3, { fire: wet ? 0 : 80, oil: wet, debris: 14, color: 0x46553b }); sfx.boom?.(1);
    const aboard = P.marines; TR.lost(); proxy.dying = true; proxy.dead = true;
    D.active = false; g.visible = false; shadow.visible = false; D.crew = null; D.silence();
    feed(`SEA KNIGHT LOST  -  ${why}${aboard ? `  -  ${aboard} MARINES ABOARD` : ''}`, 'bad');
    D.lostWhy = why;
    if (mine) { say(why, 2.5); D.downT = 3; }
    ctx.onUnitLost?.('ch46', why, mine);
  }
  function lostTick(dt) { if (D.downT > 0) { D.downT -= dt; if (D.downT <= 0 && crafts.active === D && !G.over) ctx.autoNext?.(); } }
  D.hurt = (amount, why) => {
    if (G.bench || !D.present()) return;
    const part = P.hurt(amount); sfx.hit?.() ?? sfx.boom?.(0.3);
    const h = P.hp[part], name = P.partName(part);
    say(part === 'eng1' && h <= 0.05 ? 'NO 1 ENGINE SHOT OUT  -  SINGLE ENGINE: LOWER THE COLLECTIVE, KEEP NR' : part === 'eng2' && h <= 0.05 ? 'NO 2 ENGINE SHOT OUT  -  SINGLE ENGINE: LOWER THE COLLECTIVE, KEEP NR'
      : part === 'hyd' && h < 0.3 ? 'FLIGHT CONTROL HYDRAULICS HIT  -  SAS OUT, HEAVY CONTROLS' : (part === 'fxmsn' || part === 'axmsn') && h <= 0 ? `${name} SEIZING  -  LAND NOW` : `${why}  -  ${name} HIT`, 2);
  };

  // ---------------------------------------------------------------- keys and clicks
  const _saySw = (id, v) => say(ck.labelOf(id), 1.2);
  D.click = id => { const v = P.toggle(id); sfx.ui?.('select'); _saySw(id, v); if (id === 'ramp') rampSay(); };
  function rampSay() { say(P.rampCmd > 0.5 ? 'RAMP COMING DOWN' : 'RAMP COMING UP', 1.2); }
  function cycleView() {
    D.view = D.view === 'cockpit' ? 'chase' : D.view === 'chase' ? 'cabin' : 'cockpit'; look.yaw = look.pitch = 0; snapChase = true;
    if (D.view === 'chase' && document.pointerLockElement) document.exitPointerLock?.();
    say(D.view === 'cockpit' ? 'COCKPIT  -  CLICK TO LOOK ROUND, THE CROSSHAIR WORKS THE SWITCHES' : D.view === 'cabin' ? 'CABIN  -  THE TROOP SEATS AND THE RAMP' : 'CHASE CAMERA', 1.4);
  }
  D.key = (code, e) => {
    switch (code) {
      case 'KeyI': { if (!S.landed && P.running()) { say('ENGINES STAY ON IN THE AIR  -  THE ECLs ARE ON THE OVERHEAD IF YOU MEAN IT', 2); return true; } const on = P.toggle('start'); say(on ? 'START: BATTERY, APU, NO 1 THEN NO 2 ENGINE, ROTOR BRAKE OFF, ECLs TO FLY' : 'SHUTDOWN: ECLs TO STOP', 2); return true; }
      case 'KeyH': if (e && e.shiftKey) { P.toggle('sas'); say(P.sys.sas ? 'SAS ON  -  RATE DAMPING' : 'SAS OFF  -  THE TANDEM IS UNSTABLE IN PITCH: FLY IT', 1.8); } else { P.toggle('afcs'); say(P.sys.afcs ? 'AFCS ON  -  STICK COMMANDS ATTITUDE, HANDS OFF HOLDS THE HOVER AND HEADING' : 'AFCS OFF  -  SAS ONLY: THE STICK IS THE CYCLIC', 1.8); } return true;
      case 'KeyR': P.toggle('ramp'); rampSay(); return true;
      case 'KeyB': troopsKey(); return true;
      case 'KeyL': P.toggle('light'); say(P.light ? 'LANDING LIGHT ON' : 'LANDING LIGHT OFF', 1); return true;
      case 'KeyX': P.toggle('pbrake'); say(P.sys.pbrake ? 'PARKING BRAKE SET' : 'PARKING BRAKE OFF  -  SHE ROLLS (CYCLIC TO TAXI, PEDALS TO STEER)', 1.6); return true;
      case 'KeyG': D.gunners = !D.gunners; say(D.gunners ? 'DOOR GUNNERS: WEAPONS FREE' : 'DOOR GUNNERS: HOLD FIRE', 1.4); return true;
      case 'KeyV': cycleView(); return true;
      case 'KeyC': D.view = D.view === 'cabin' ? 'cockpit' : 'cabin'; look.yaw = look.pitch = 0; say(D.view === 'cabin' ? 'CABIN' : 'COCKPIT', 1); return true;
      case 'KeyJ': CTL.toggle(); return true;
      case 'KeyF': case 'KeyO': case 'KeyU': case 'KeyN': case 'KeyT': return true;   // (Huey / jet keys: nothing here)
    }
    return false;
  };
  function troopsKey() {
    const x = B.pos[0], z = B.pos[2], sv = ctx.serviceAt(x, z);
    if (TR.state === 'empty') {
      if (!sv) { say('MARINES BOARD ON THE ALBATROSS OR AT A FRIENDLY PAD', 1.8); return; }
      if (G.mat < CH46_STICK_COST) { say(`A STICK OF 13 MARINES COSTS ${CH46_STICK_COST} MATERIEL  -  YOU HAVE ${Math.floor(G.mat)}`, 2); return; }
      if (P.ramp < 0.9 && S.landed) { P.rampCmd = 1; say('RAMP COMING DOWN  -  B AGAIN WHEN IT IS DOWN', 1.8); return; }
      const w = TR.board(13); if (w) { say(w, 1.8); return; }
      G.mat -= CH46_STICK_COST; say(`STICK OF 13 MARINES CALLED  -  THEY FILE UP THE RAMP (${CH46_STICK_COST} MATERIEL)`, 2.2); return;
    }
    if (TR.state === 'aboard') {
      if (sv && sv.deck) { say('FLY THE MARINES TO AN ISLAND  -  B ON THE GROUND THERE, RAMP DOWN', 2); return; }
      const I = islandAt(x, z); if (!I) { say('PUT THEM DOWN ON AN ISLAND', 1.6); return; }
      if (P.ramp < 0.9 && S.landed) { P.rampCmd = 1; say('RAMP COMING DOWN  -  B AGAIN WHEN IT IS DOWN', 1.8); return; }
      const w = TR.dismount(I); say(w || `TROOPS OUT  -  ${P.marines} MARINES OFF THE RAMP AT ${I.name}`, 2); return;
    }
    say(TR.state === 'boarding' ? `BOARDING  -  ${P.marines} OF 13 ABOARD` : 'THE STICK IS GOING OUT', 1.4);
  }
  function islandAt(x, z) { let best = null, bd = 1e9; for (const I of ctx.ISLANDS) { if (I.cave && I.owner !== 1) continue; const d = Math.hypot(I.x - x, I.z - z); if (d < (I.r || 80) + 30 && d < bd && ctx.terrainH(x, z) > 0.3) { bd = d; best = I; } } return best; }

  // ---------------------------------------------------------------- views
  let snapChase = true;
  const ckOn = () => D.view === 'cockpit' && D.present();
  D.firstPerson = () => D.present() && (D.view === 'cockpit' || D.view === 'cabin');
  D.switches = () => ckOn() ? ck : null;
  D.look = (dx, dy) => {
    if (D.view === 'chase') { look.oy -= dx * 0.004; look.op = clamp(look.op - dy * 0.003, -0.4, 0.9); return; }
    look.yaw = clamp(look.yaw - dx * 0.0025, -2.6, 2.6); look.pitch = clamp(look.pitch - dy * 0.0025, -1.1, 1.25);
  };
  D.fov = c => c;
  D.lookAt = (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; D.holdLook = true; };   // tests / screenshots
  const CABIN_EYE = new THREE.Vector3(-0.42, 0.55, 3.1);
  D.camera = (cam, dt) => {
    if (!D.present()) return;
    g.updateMatrixWorld(true); g.getWorldQuaternion(_q);
    const hat = CTL.state && CTL.state.actions && CTL.state.actions.lookhat !== false && ctx.hwOn() && (CTL.state.hatX || CTL.state.hatY);
    if (hat) { look.yaw = clamp(look.yaw - CTL.state.hatX * 2.2 * dt, -2.6, 2.6); look.pitch = clamp(look.pitch + CTL.state.hatY * 1.6 * dt, -1.1, 1.25); }
    else if (!ctx.view.locked() && !D.holdLook) { const k = Math.exp(-5 * dt); look.yaw *= k; look.pitch *= k; }   // (holdLook: tests aim the head)
    if (D.view === 'cockpit' || D.view === 'cabin') {
      const eye = D.view === 'cockpit' ? CH46_EYE : CABIN_EYE;
      _v.copy(eye); g.localToWorld(_v); cam.position.copy(_v);
      cam.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_yA, look.yaw)).multiply(_q2.setFromAxisAngle(_xA, (D.view === 'cockpit' ? CH46_EYE_PITCH : -0.12) + look.pitch));
      const sh = (0.0015 + 0.012 * S.vib) * S.rpm, b3 = 0.003 * (0.3 + S.c.coll) * S.rpm * Math.sin((war.time || 0) * 2 * Math.PI * 13.2);   // the 3-per-rev rumble
      cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh + b3;
      return;
    }
    // chase: behind and above, the mouse orbits it
    fwd(_f); const yaw = Math.atan2(_f.x, _f.z) + look.oy, dist = D.chaseDist || 31, hgt = 9.5 + look.op * 20;
    _t.set(B.pos[0] - Math.sin(yaw) * dist * Math.cos(look.op * 0.5), B.pos[1] + hgt, B.pos[2] - Math.cos(yaw) * dist * Math.cos(look.op * 0.5));
    if (snapChase) { cam.position.copy(_t); snapChase = false; } else cam.position.lerp(_t, 1 - Math.exp(-4 * dt));
    cam.position.y = Math.max(cam.position.y, groundY(cam.position.x, cam.position.z) + 3);
    const ahead = 10 * Math.max(0, Math.cos(look.oy)); cam.lookAt(B.pos[0] + _f.x * ahead, B.pos[1] + 1, B.pos[2] + _f.z * ahead);
  };
  D.snapChase = () => { snapChase = true; };
  D.orbitTo = (oy, op = 0, dist) => { look.oy = oy; look.op = op; if (dist) D.chaseDist = dist; snapChase = true; };   // tests / screenshots

  // ---------------------------------------------------------------- the model, cockpit, sound, dust (every frame)
  const animS = { nr: 1, F: { tx: 0, ty: 0 }, A: { tx: 0, ty: 0 }, coll: 0, ramp: 0, run: true, n1: 0.9, cone: 0.06, light: false, gunAim: null, gunFiring: false };
  D.render = (dt, time, fp) => {
    if (!D.present()) { if (g.visible) g.visible = false; return; }
    g.visible = true;
    g.position.set(B.pos[0], B.pos[1], B.pos[2]); g.quaternion.set(B.q[0], B.q[1], B.q[2], B.q[3]);
    animS.nr = S.rpm; animS.F.tx = S.rf.tx; animS.F.ty = S.rf.ty; animS.A.tx = S.ra.tx; animS.A.ty = S.ra.ty; animS.coll = S.c.coll; animS.ramp = P.ramp; animS.n1 = Math.max(S.eng[0].n1, S.eng[1].n1);
    animS.run = P.running(); animS.light = P.light; animS.gunAim = gAim; animS.gunFiring = gFire;
    animS.cone = Math.min(0.12, 0.75 * Math.max(0, (S.rf.ct + S.ra.ct) / 2) / 0.058);
    model.animate(animS, dt, time);
    const inCk = fp && D.view === 'cockpit' && crafts.active === D;
    ck.group.visible = inCk; for (const m of model.parts.cockpitBits) m.visible = !inCk; model.parts.glassM.opacity = inCk ? 0.1 : 0.32;
    if (inCk) ck.update(dt, P.panel(), ctx.hover());
    const gy = groundY(B.pos[0], B.pos[2]), alt = B.pos[1] - gy;
    shadow.visible = alt < 120; shadow.position.set(B.pos[0], gy + 0.12, B.pos[2]); shadow.rotation.y = yawOf(); shadow.material.opacity = clamp(0.45 - alt * 0.004, 0.08, 0.45);
    // sound: the tandem's voice (rotorsound.js) from where the camera is
    if (snd && G.state === 'play') {
      const p = sndList[0]; p.x = B.pos[0]; p.y = B.pos[1]; p.z = B.pos[2]; p.vx = B.vel[0]; p.vy = B.vel[1]; p.vz = B.vel[2]; p.nr = S.rpm; p.load = (S.rf.T + S.ra.T) / (S.mass * 9.81);
      const cam = ctx.camZ(); if (cam) snd.update(sndList, cam.position, dt);
    }
    // downwash: dust (spray over water) thrown out under the discs in ground effect
    const T = (S.rf.T + S.ra.T) / 2;
    if (alt < 19 && S.rpm > 0.5 && T > 5000 && Math.random() < 0.9) {
      const k = (1 - alt / 19) * Math.min(1, T / 60000), wet = env.water(B.pos[0], B.pos[2]) && war.deckY(B.pos[0], B.pos[2]) < -1e8;
      for (let i = 0; i < 4; i++) if (Math.random() < k) {
        const a = rnd(6.283), sp = rnd(10, 22), rr = rnd(2, 7.6);
        if (wet) fx.mix.spawn(B.pos[0] + Math.cos(a) * rr, gy + 0.3, B.pos[2] + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.1), 0.7, 3, .85, .92, .97, 0.4, 2, 1.4, 0.3);
        else if (war.deckY(B.pos[0], B.pos[2]) < -1e8) fx.mix.spawn(B.pos[0] + Math.cos(a) * rr, gy + 0.3, B.pos[2] + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.2), 0.8, 3.4, .55, .48, .36, 0.45, 1.5, 1.5, 0.3);
      }
    }
  };
  D.silence = () => { if (snd) { sndList[0].nr = 0; const cam = ctx.camZ && ctx.camZ(); if (cam) snd.update([], cam.position, 0.1); } };

  // ---------------------------------------------------------------- HUD, what war.js sees
  D.hud = () => {
    const hv = ctx.hover(), sv = S.landed ? ctx.serviceAt(B.pos[0], B.pos[2]) : null;
    let hint = hv ? `${ck.labelOf(hv)}  -  CLICK` : P.hint();
    if (!hint && S.landed) {
      if (TR.state === 'empty' && sv) hint = P.ramp < 0.9 ? `B: CALL A STICK OF 13 MARINES (${CH46_STICK_COST} MATERIEL)  ·  R RAMP  ·  COLLECTIVE UP TO LIFT` : `RAMP DOWN  -  B: CALL A STICK OF 13 MARINES (${CH46_STICK_COST} MATERIEL)`;
      else if (TR.state === 'aboard' && !(sv && sv.deck)) hint = islandAt(B.pos[0], B.pos[2]) ? 'ON THE LZ  -  B: TROOPS OUT BY THE RAMP' : '';
      else if (TR.state === 'boarding') hint = `MARINES BOARDING  -  ${P.marines} OF 13 ABOARD`;
      else if (TR.state === 'deploying') hint = `TROOPS OUT  -  ${P.marines} STILL ABOARD  ·  RAMP UP (R) AND LIFT WHEN THEY ARE CLEAR`;
    }
    return { line: P.line(), hint, weap: `TROOPS ${P.marines}  ·  DOOR GUNNERS ${D.gunners ? 'FREE' : 'HOLD'} (G)  ·  RAMP ${P.ramp > 0.9 ? 'DOWN' : P.ramp > 0.05 ? 'MOVING' : 'UP'} (R)`, fuel: P.fuel, fuelLabel: 'FUEL' };
  };
  D.menuNote = () => `SEA KNIGHT FUEL ${Math.round(P.fuel / 100 * CH46.FUEL_KG * 2.2046)} LB  ·  ${P.marines} MARINES ABOARD`;
  D.pl = { alive: () => D.present(), landed: () => D.present() && S.landed, inCave: false, hitR: 6.5, sight: 0 };
  D.avatar = Z0 => { if (!D.present()) return; Z0.pos.set(B.pos[0], B.pos[1], B.pos[2]); Z0.vel.set(B.vel[0], B.vel[1], B.vel[2]); fwd(_f); Z0.facing.set(_f.x, _f.z); };
  D.bounds = () => {
    if (!D.present() || !S.landed) return null;
    const y = yawOf(), y0 = B.pos[1] - CH46.CG_H;
    return (D._b ||= {}, Object.assign(D._b, { x: B.pos[0], z: B.pos[2], yaw: y, hl: 6.9, hw: 2.1, y0, y1: y0 + 4.2, def: D }));
  };
  return D;
}
