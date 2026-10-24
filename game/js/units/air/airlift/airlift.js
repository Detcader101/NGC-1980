// airlift.js - AIRLIFT with the player's UH-1H (main.js wires it in; units/air/airlift/):
//
// SLING LOADS. Hover over a ground vehicle and the crew chief talks you onto it ("FORWARD 3 ... LEFT 1 ... DOWN 2 ...
// HOLD"), as a real crew chief does lying on the cabin floor looking down through the hell hole: the pilot cannot see
// the load. A hookup man stands on the load with the sling's apex held up (and the static discharge probe: a spark
// when it touches); with the hook steady over him and within his reach he slips the apex onto the cargo hook (the
// keeper clicks shut), climbs down and runs clear, kneeling with a thumb up. Take the slack gently, lift the load off,
// transition, fly it. The load hangs on a nylon pendant (sling.js): a real pendulum integrated in the flight model's
// own substep through the hook under the cabin floor, so its weight, drag, download in the rotor wash and its swing
// all reach the airframe. Set it down on its wheels (the pendant goes slack) and release with R (the cargo release on
// the cyclic). In the air R asks for a second R: emergency release (jettison). The hook is rated 4,000 lb: an M151A2
// (1,100 kg) is a heavy but honest UH-1H lift; the M35A2, the M113A2 and the M60A3 are TOO HEAVY (the numbers are on
// the HUD) - they go by LCM-8 or C-130 heavy drop. Over-gross, overspeed (the load sails and swings above its speed)
// or a swinging load make the helicopter hard to fly; a snatch past 2.5 x the hook rating parts the load.
//
// TROOP LIFT. Landed at the ALBATROSS or a friendly island's pad, . (period) calls a squad of six Marines from the
// barracks (30 materiel): they wait kneeling in two files off the nose, clear of the disc, then on the crew chief's
// wave run bent double to the cabin doors and climb in - four on the troop bench, two sitting in the doorways with
// their boots on the skids. They ride (630 kg aboard). Land on an island and . again: they jump down, run out from
// the doors and join the island's ground war (groundwar.js takes them over: the fight, capture, casualties).
// A Marine you command on foot boards the Huey's bench as before (interiors/seats.js RIDE: Y at the cabin door).
//
// const AL = createAirlift(ctx);  per frame: AL.mass() into H.extraMass, AL.ext() into hueyfm's env.ext, AL.update(dt,
// piloted, ctl, alive) after the step; AL.key(code) (R, .); AL.lost(why) when the Huey is lost; AL.reset() new game.
import * as THREE from 'three';
import { createSling, loadOf, HOOKS, hookCheck, hookExt, downwashAt, LOADS } from './sling.js';
import { createSquad } from '../rotary/squad.js';
import { FIGURES } from '../rotary/figures.js';
import { createAirliftAudio } from './airliftaudio.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const KT = 1.94384, LB = 0.45359237;
const HK = HOOKS.uh1h;
export const TROOPS = { N: 6, KG: 105, COST: 30 };   // a squad of six with their kit (~105 kg a man), materiel to call one up (game)
// seats in the Huey's frame (x right, y up, -z forward; FIGURES origin at the feet, 'seated' drops onto a seat):
// four on the rear troop bench, two in the doorways facing out, legs over the side
const SEATS = [[-0.82, -1.05, 2.0, 0], [-0.27, -1.05, 2.0, 0], [0.27, -1.05, 2.0, 0], [0.82, -1.05, 2.0, 0], [-1.02, -1.5, 1.2, Math.PI / 2], [1.02, -1.5, 1.2, -Math.PI / 2]];

export function createAirlift(ctx) {
  const { scene, H, crafts, pool, war, fx, sfx, say, feed, groundY, waterAt, G } = ctx;
  const heliObj = ctx.heliObj, R = ctx.rotorR || 7.32;
  const snd = createAirliftAudio(sfx);
  const AL = { load: null, near: null, troops: null, calls: '', hint: '', jettisonT: 0, lastBtn: false };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler();
  const yawOf = q => { _w.set(0, 0, -1).applyQuaternion(q); return Math.atan2(-_w.x, -_w.z); };

  // ---------------------------------------------------------------- visuals: hook, pendant, bridle, hookup man
  const ropeM = new THREE.MeshLambertMaterial({ color: 0x3d4030 }), steelM = new THREE.MeshLambertMaterial({ color: 0x55585a });
  const hookMesh = new THREE.Group(); hookMesh.name = 'cargoHook';
  hookMesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.24), steelM));                                         // the hook body
  { const k = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 4, 8, Math.PI * 1.4), steelM); k.position.y = -0.12; k.rotation.y = Math.PI / 2; hookMesh.add(k); }   // the hook's jaw
  let hookParent = null;
  const rod = () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, 0.5, 0), ropeM); m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
  const pendant = [rod(), rod()], legs = [rod(), rod(), rod(), rod()];
  const apexRing = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 4, 10), steelM); apexRing.visible = false; scene.add(apexRing);
  function setRod(m, a, b, r = 0.025) { _v.subVectors(b, a); const L = _v.length(); if (L < 1e-4) { m.visible = false; return; } m.position.copy(a); m.quaternion.setFromUnitVectors(_up, _v.multiplyScalar(1 / L)); m.scale.set(r / 0.025, L, r / 0.025); m.visible = true; }
  const man = { F: null, st: 'off', x: 0, y: 0, z: 0, yaw: 0, t: 0, ph: 0, tx: 0, tz: 0 };
  function manFig() { if (!man.F) { man.F = FIGURES.marine({ variant: 11 }); man.F.group.visible = false; scene.add(man.F.group); } return man.F; }

  // ---------------------------------------------------------------- the load: which vehicles, its geometry
  const typeOf = V => V.sim ? V.type : V.id;   // wheeled crafts carry their type; the armour crafts' id is 'm60' / 'm113'
  function candidates() {   // ground vehicles that could be on the hook: the motor pool and the cars, plus the armour
    const out = [];
    for (const V of pool.list) if (V.exists && !V.wrecked && !V.slung && crafts.active !== V && V.owner !== 'traffic') out.push(V);
    for (const D of ctx.armour || []) if (D.present() && !D.dead && crafts.active !== D) out.push(D);
    return out;
  }
  const posOf = (V, out) => { if (V.sim && V.sim.pos) return out.set(V.sim.pos[0], V.sim.pos[1], V.sim.pos[2]); const f = V.frame({}); return out.set(f.x, f.y, f.z); };
  const specOf = V => {
    const t = typeOf(V), base = loadOf(t, V.sim && V.sim.spec ? V.sim.spec.mass : (V.T && V.T.MASS) || undefined);
    const dims = V.sim && V.sim.spec && V.sim.spec.dims;
    return { ...base, label: LOADS[t] ? LOADS[t].label : V.label || base.label, top: dims ? dims.H : base.apex - 1.6, L: dims ? dims.L : 4, W: dims ? dims.W : 2 };
  };
  const hookWorld = new THREE.Vector3(), hookV = [0, 0, 0];
  function updateHookWorld() { _v.set(...HK.at).applyQuaternion(H.q); hookWorld.copy(H.pos).add(_v); }

  // the sling's env for this substep (hueyfm calls it at 240 Hz through hookExt)
  const slEnv = { ground: (x, z) => groundY(x, z), water: (x, z) => waterAt(x, z), wind: null, wash: 0, hookYaw: 0, limit: HK.limit, ult: HK.ult, free: false };
  const extFn = hookExt(() => AL.load && AL.load.phase === 'hooked' ? AL.load.S : null, HK.at, (H, S) => { slEnv.wash = downwashAt(H, R, S.p[0], S.p[2]); slEnv.free = false; return slEnv; });
  AL.ext = () => AL.load && AL.load.phase === 'hooked' ? extFn : undefined;
  AL.mass = () => AL.troops && (AL.troops.st === 'aboard' || AL.troops.st === 'boarding') ? AL.troops.aboard() * TROOPS.KG : 0;

  // ---------------------------------------------------------------- hooking up, releasing
  function hookUp(V) {
    const sp = specOf(V), S = createSling(sp), p = posOf(V, _v), f = V.frame({});
    S.place(p.x, p.y, p.z, f.yaw);
    AL.load = { V, sp, S, phase: 'hooked', lifted: false, clear: false, taut: false, t: 0, calls: {}, over: false, up: new THREE.Vector3(0, 1, 0) };
    V.slung = true; V.auto = null;
    snd.hook(); fx.flash?.(hookWorld.x, hookWorld.y - 0.1, hookWorld.z, 0.12);
    feed(`HOOKED UP: ${sp.label}  ${Math.round(sp.mass).toLocaleString('en-US')} KG`, 'good');
    say(`HOOKED UP  -  ${sp.label}  -  HOOKUP MAN CLEAR  ·  UP GENTLY: TAKE THE SLACK, THEN LIFT`, 2.6);
    man.st = 'clear'; man.t = 0;
    const s = Math.sin(yawOf(H.q)), c = Math.cos(yawOf(H.q)); man.tx = man.x - c * 11 - s * 6; man.tz = man.z + s * 11 - c * 6;   // out to the left front, clear of the disc
  }
  // put the vehicle back on its own physics where the load is now
  function setDown(L, why) {
    const V = L.V, S = L.S;
    V.slung = false;
    const deck = war.shipAt && war.shipAt(S.p[0], S.p[2]), plat = deck && war.deckY(S.p[0], S.p[2]) > -1e8 ? deck : null;
    if (V.spawnAt) {
      if (V.sim) V.spawnAt({ x: S.p[0], z: S.p[2], yaw: S.yaw, plat });
      else V.spawnAt({ x: S.p[0], z: S.p[2], y: groundY(S.p[0], S.p[2]), yaw: S.yaw, plat });
    }
    const imp = S.impact;
    if (imp > 4.5 && V.damage) V.damage(clamp((imp - 4) / 3, 0.3, 4), why);
    if (imp > 13 && V.damage) V.damage(6, why);
    hideRig();
    return imp;
  }
  function release(emergency = false) {
    const L = AL.load; if (!L) return;
    snd.release();
    if (!emergency) {
      const where = ctx.whereIs ? ctx.whereIs(L.S.p[0], L.S.p[2]) : '';
      setDown(L, 'SET DOWN');
      feed(`${L.sp.label} SET DOWN ${where}  -  HOOK OPEN`, 'good'); say(`LOAD RELEASED  -  ${L.sp.label} ${where}`, 2.2);
      AL.load = null; AL.lastSet = { V: L.V, where, t: 0 };
      return;
    }
    L.phase = 'falling'; L.fallT = 0;
    feed(`EMERGENCY RELEASE  -  ${L.sp.label} JETTISONED`, 'bad'); say(`LOAD JETTISONED  -  ${L.sp.label} FALLING`, 2);
  }
  AL.release = release;

  // ---------------------------------------------------------------- keys (in the Huey): R hook, . troops
  AL.button = () => {   // the cargo release (R / the HOTAS winch button): hook when over a load, release when it is down
    const L = AL.load;
    if (!L) {
      if (AL.near && AL.near.ready && !AL.near.why) { hookUp(AL.near.V); return true; }
      say(AL.near ? (AL.near.why || 'HOOKUP MAN NOT ON YET  -  HOLD IT STEADY OVER HIM') : 'NO LOAD UNDER YOU  -  HOVER OVER A VEHICLE: THE CREW CHIEF TALKS YOU ON', 1.8); return true;
    }
    if (L.phase !== 'hooked') return true;
    if (L.S.ground && L.S.Tg < 0.35) { release(false); return true; }
    if (AL.jettisonT > 0) { AL.jettisonT = 0; release(true); return true; }
    AL.jettisonT = 1.6; say('LOAD IN THE AIR  -  R AGAIN TO JETTISON (EMERGENCY RELEASE)', 1.6); sfx.blip?.(900, 700, 0.08, 'square', 0.05);
    return true;
  };
  AL.key = code => {   // (R reaches us through the controls as ctl.winch, see update)
    if (code === 'Period' || code === 'NumpadDecimal') return troopKey();
    return false;
  };

  // ---------------------------------------------------------------- the crew chief, talking the pilot onto the load
  function lookForLoad(dt) {
    const prev = AL.near; AL.near = null;
    if (H.landed || H.rpm < 0.85) return;
    updateHookWorld();
    let best = null, bd = 1e9;
    for (const V of candidates()) {
      const p = posOf(V, _v), d = Math.hypot(p.x - hookWorld.x, p.z - hookWorld.z);
      if (d > 22 || hookWorld.y - p.y > 26 || hookWorld.y < p.y) continue;
      if (d < bd) { bd = d; best = V; }
    }
    if (!best) { if (man.st === 'on') man.st = 'off'; return; }
    const sp = specOf(best), p = posOf(best, _w), top = p.y + sp.top;
    // the apex held up by the hookup man: ~1 m above the load's top
    const ax = p.x, az = p.z, ay = top + 1.0;
    const fx_ = -Math.sin(yawOf(H.q)), fz_ = -Math.cos(yawOf(H.q));   // the Huey's nose (horizontal)
    const ox = ax - hookWorld.x, oz = az - hookWorld.z, fwd = ox * fx_ + oz * fz_, right = ox * -fz_ + oz * fx_, dy = hookWorld.y - ay;
    const rel = Math.hypot(H.vel.x, H.vel.z, H.vel.y);
    const why = hookCheck(HK, sp);
    const N = { V: best, sp, fwd, right, dy, d: Math.hypot(fwd, right), why, ready: false, steady: prev && prev.V === best ? prev.steady : 0 };
    const inPos = N.d < 1.3 && dy > -0.4 && dy < 1.6 && rel < 1.4;
    N.steady = inPos ? N.steady + dt : 0;
    N.ready = N.steady > 0.6;
    // the calls: the biggest correction first, in whole metres (feet would be the Army's; the Marines used both)
    const m = v => Math.max(1, Math.round(Math.abs(v)));
    const parts = [];
    if (Math.abs(fwd) > 0.7) parts.push(`${fwd > 0 ? 'FORWARD' : 'BACK'} ${m(fwd)}`);
    if (Math.abs(right) > 0.7) parts.push(`${right > 0 ? 'RIGHT' : 'LEFT'} ${m(right)}`);
    if (dy > 1.4) parts.push(`DOWN ${m(dy - 0.6)}`); else if (dy < -0.3) parts.push(`UP ${m(-dy + 0.5)}`);
    N.call = why ? `${sp.label} BELOW  -  TOO HEAVY FOR OUR HOOK` : parts.length ? parts.join('  ·  ') : N.ready ? 'HOLD  -  HOOKUP MAN ON  -  R: HOOK IT' : 'HOLD ... HOLD ...';
    AL.near = N;
    // the hookup man: up on the load while we come in (waves us off if it is too heavy)
    if (man.st === 'off' || man.st === 'gone' || (man.st === 'on' && man.V !== best)) { man.st = 'on'; man.V = best; man.t = 0; }
    if (man.st === 'on') { man.x = ax + 0.2; man.z = az + 0.3; man.y = p.y + Math.max(0.9, sp.top - 0.6); man.yaw = Math.atan2(-(hookWorld.x - man.x), -(hookWorld.z - man.z)); }
    if (why && (!prev || prev.V !== best)) { say(`CREW CHIEF: ${why}`, 3); feed(`CREW CHIEF: ${why}`, 'bad'); }
  }
  function drawMan(dt, time) {
    if (man.st === 'off' || man.st === 'gone') { if (man.F) man.F.group.visible = false; return; }
    const F = manFig(); F.group.visible = true; man.t += dt;
    if (man.st === 'clear') {   // down off the load and running clear, then kneel with a thumb up
      const dx = man.tx - man.x, dz = man.tz - man.z, d = Math.hypot(dx, dz), v = 4.2 * dt;
      if (d > v) { man.x += dx / d * v; man.z += dz / d * v; man.yaw = Math.atan2(-dx, -dz); man.y = Math.max(groundY(man.x, man.z), man.y - 6 * dt); man.ph += dt * 9.5; F.pose('run', man.ph); }
      else { man.st = 'kneel'; man.t = 0; }
    }
    if (man.st === 'kneel') { man.y = groundY(man.x, man.z); updateHookWorld(); man.yaw = Math.atan2(-(hookWorld.x - man.x), -(hookWorld.z - man.z)); F.pose('kneel', 0); if (man.t > 4 && Math.hypot(hookWorld.x - man.x, hookWorld.z - man.z) > 60) man.st = 'gone'; }
    if (man.st === 'on') F.pose(AL.near && AL.near.ready ? 'aim' : 'stand', 0);   // arms up with the apex when the hook is over him
    F.group.position.set(man.x, man.y, man.z); F.group.rotation.y = man.yaw;
  }

  // ---------------------------------------------------------------- per frame
  function placeVehicle(L) {
    const V = L.V, S = L.S, sp = L.sp;
    // the vehicle hangs with its apex above the CG along the pendant; on the ground it stands on its wheels
    if (!S.ground && L.phase === 'hooked' && S.taut) { _v.set(hookWorld.x - S.p[0], hookWorld.y - S.p[1], hookWorld.z - S.p[2]).normalize(); L.up.lerp(_v, 0.5).normalize(); }
    else L.up.lerp(_up, S.ground ? 0.3 : 0.05).normalize();
    _q.setFromUnitVectors(_up, L.up); _q2.setFromAxisAngle(_up, S.yaw); _q.multiply(_q2);
    const ox = S.p[0] - L.up.x * sp.cg, oy = S.p[1] - L.up.y * sp.cg, oz = S.p[2] - L.up.z * sp.cg;   // the model's origin
    if (V.sim) { const s = V.sim; s.pos[0] = ox; s.pos[1] = oy; s.pos[2] = oz; s.q[0] = _q.x; s.q[1] = _q.y; s.q[2] = _q.z; s.q[3] = _q.w; s.vel[0] = S.v[0]; s.vel[1] = S.v[1]; s.vel[2] = S.v[2]; }
    for (const m of [V.model && V.model.group, V.far]) if (m) { m.position.set(ox, oy, oz); m.quaternion.copy(_q); m.visible = true; }
    if (!V.sim && V.place) V.place(ox, oy, oz, _q);
    return { ox, oy, oz };
  }
  function drawRig(L) {
    const S = L.S, sp = L.sp, o = placeVehicle(L);
    // apex: Lb above the CG along the vehicle's up axis; legs to four lifting points at the corners, bumper height
    const apex = _v.set(S.p[0] + L.up.x * S.Lb, S.p[1] + L.up.y * S.Lb, S.p[2] + L.up.z * S.Lb).clone();
    const hk = L.phase === 'hooked' ? hookWorld : null;
    if (hk) {
      if (S.taut || apex.distanceTo(hk) > S.strop * 0.98) { setRod(pendant[0], hk, apex); pendant[1].visible = false; }
      else {   // slack: the pendant sags between the hook and the apex
        const mid = hk.clone().lerp(apex, 0.5); mid.y -= Math.sqrt(Math.max(0, (S.strop / 2) ** 2 - (hk.distanceTo(apex) / 2) ** 2));
        setRod(pendant[0], hk, mid); setRod(pendant[1], mid, apex);
      }
    } else { pendant[0].visible = pendant[1].visible = false; }
    _q.setFromUnitVectors(_up, L.up); _q2.setFromAxisAngle(_up, S.yaw); _q.multiply(_q2);
    const hl = sp.L * 0.42, hw = sp.W * 0.42, ly = Math.min(0.8, sp.cg + 0.1);
    _org.set(o.ox, o.oy, o.oz);
    [[-hw, ly, -hl], [hw, ly, -hl], [-hw, ly, hl], [hw, ly, hl]].forEach((c, i) => { _w.set(...c).applyQuaternion(_q).add(_org); setRod(legs[i], apex, _w, 0.018); });
    apexRing.position.copy(apex); apexRing.visible = true;
  }
  const _org = new THREE.Vector3();
  function hideRig() { for (const m of [...pendant, ...legs]) m.visible = false; apexRing.visible = false; }

  AL.update = (dt, piloted, ctl, alive = true) => {
    const time = performance.now() / 1000;
    // the hook under the cabin floor (on the Huey's model)
    const obj = heliObj(); if (obj && hookParent !== obj) { obj.add(hookMesh); hookMesh.position.set(...HK.at); hookParent = obj; }
    if (AL.jettisonT > 0) AL.jettisonT -= dt;
    // the HOTAS cargo release (the winch button): edge
    const btn = !!(ctl && ctl.winch); if (piloted && alive && btn && !AL.lastBtn) AL.button(); AL.lastBtn = btn;   // R or the HOTAS winch button (heli.js: ctl.winch)
    updateHookWorld(); slEnv.hookYaw = yawOf(H.q);
    const L = AL.load;
    if (L) {
      L.t += dt; const S = L.S;
      if (!L.V.exists) { AL.load = null; hideRig(); }
      else if (L.phase === 'hooked') {
        if (!alive) { release(true); }
        else if (S.parted) { feed(`SLING PARTED  -  ${L.sp.label} LOST OFF THE HOOK (SNATCH: ${S.Tpeak / (S.m * 9.81) > 0 ? (S.Tpeak / (S.m * 9.81)).toFixed(1) : '?'} g)`, 'bad'); say('THE SLING PARTED  -  LOAD FALLING', 2.2); L.phase = 'falling'; L.fallT = 0; snd.release(); }
        else {
          // the crew chief's calls on the lift
          const c = L.calls;
          if (S.taut && !c.taut) { c.taut = true; say('CREW CHIEF: TENSION  -  YOU HAVE THE LOAD', 1.4); }
          if (!S.ground && S.taut && !c.off) { c.off = true; L.lifted = true; say('CREW CHIEF: LOAD IS OFF THE GROUND', 1.4); }
          const bottom = S.p[1] - L.sp.cg - groundY(S.p[0], S.p[2]);
          if (c.off && !c.clear && bottom > 4) { c.clear = true; say('CREW CHIEF: LOAD IS CLEAR  -  CLEAR FORWARD', 1.6); }
          if (c.off && S.ground && !c.down && L.lifted) { c.down = true; say('CREW CHIEF: LOAD ON THE GROUND  -  SLACK  -  R: RELEASE', 1.8); }
          if (!S.ground) c.down = false;
          if (S.swingDeg > 14 && !S.ground && (!c.swingT || time - c.swingT > 6)) { c.swingT = time; say(`CREW CHIEF: LOAD SWINGING ${Math.round(S.swingDeg)}°  -  EASE IT, SLOW DOWN`, 1.6); }
          const ias = H.ias || 0;
          if (ias > L.sp.vKt + 5 && !S.ground && (!c.fastT || time - c.fastT > 8)) { c.fastT = time; say(`CREW CHIEF: TOO FAST FOR THE LOAD  -  ${Math.round(ias)} KT, KEEP UNDER ${L.sp.vKt}`, 1.8); }
          if (S.Tpeak > HK.limit * 9.81 * 1.6 && (!c.overT || time - c.overT > 5)) { c.overT = time; say('HOOK OVERLOAD  -  EASY ON THE COLLECTIVE', 1.6); }
          snd.strain(S.taut ? S.Tg : 0, piloted);
          // the crew flying her (you left the Huey): they set the load down beside the spot and release it before landing
          L.groundT = S.ground && S.Tg < 0.3 ? (L.groundT || 0) + dt : 0;
          if (!piloted && L.lifted && L.groundT > 1.2 && ctx.crewFlying && ctx.crewFlying()) release(false);
        }
      }
      if (AL.load && L.phase === 'falling') {   // free fall: the sling's own step without the rope, to the ground
        L.fallT += dt; const n = Math.max(1, Math.ceil(dt / (1 / 120)));
        for (let i = 0; i < n; i++) S.step(dt / n, hookV, hookV, { ...slEnv, free: true, wash: 0 });
        if (S.ground || L.fallT > 20) {
          const imp = setDown(L, 'DROPPED FROM THE SLING'), V = L.V;
          fx.explode?.(S.p[0], S.p[1], S.p[2], imp > 13 ? 1.2 : 0.4, { fire: imp > 13 ? 20 : 0, debris: imp > 8 ? 10 : 3, color: 0x4d5838 });
          snd.thud(hookWorld.distanceTo(_v.set(S.p[0], S.p[1], S.p[2])), Math.min(1.5, imp / 8));
          feed(`${L.sp.label} HIT THE GROUND AT ${Math.round(imp)} m/s${S.wet ? '  -  IN THE WATER' : ''}${V.wrecked ? '  -  WRECKED' : imp > 4.5 ? '  -  DAMAGED' : ''}`, imp > 4.5 ? 'bad' : 'info');
          AL.load = null; snd.strain(0);
        }
      }
      if (AL.load) drawRig(AL.load);
    } else {
      snd.strain(0);
      if (piloted && alive) lookForLoad(dt); else AL.near = null;
    }
    drawMan(dt, time);
    updateTroops(dt, time, piloted, alive);
    hud(piloted);
  };
  AL.lost = () => { if (AL.load && AL.load.phase === 'hooked') release(true); if (AL.troops && AL.troops.st !== 'out') { const T = AL.troops; T.Q.killAll(); feed(`${T.aboard()} MARINES WENT DOWN WITH THE HUEY`, 'bad'); T.Q.dispose(); AL.troops = null; } };
  AL.reset = () => { if (AL.load) { AL.load.V.slung = false; AL.load = null; } hideRig(); man.st = 'off'; if (man.F) man.F.group.visible = false; if (AL.troops) { AL.troops.Q.dispose(); AL.troops = null; } AL.near = null; snd.silence(); };
  AL.silence = () => snd.silence();
  // test hook (scenes): AL.camLocal = [[x, y, z], [lx, ly, lz]] puts the camera at a point in the Huey's frame looking at another
  AL.camLocal = null;
  AL.camera = cam => { const o = heliObj(); o.updateMatrixWorld(true); const [p, l] = AL.camLocal; cam.position.set(...p).applyMatrix4(o.matrixWorld); cam.up.set(0, 1, 0); cam.lookAt(_w.set(...l).applyMatrix4(o.matrixWorld)); };

  // ---------------------------------------------------------------- troops
  const toWorld = (x, y, z, out) => { const o = heliObj(); o.updateMatrixWorld(true); _v.set(x, y, z); o.localToWorld(_v); out.x = _v.x; out.y = _v.y; out.z = _v.z; return out; };
  const heliYaw = () => yawOf(heliObj().getWorldQuaternion(_q));
  function troopKey() {
    if (!H.landed) { say(AL.troops ? 'LAND FIRST  -  THEN . TO PUT THE TROOPS OUT' : 'LAND AT THE ALBATROSS OR A FRIENDLY PAD TO PICK UP A SQUAD', 1.8); return true; }
    const T = AL.troops;
    if (T && T.st === 'boarding') { say('THE SQUAD IS STILL BOARDING', 1.2); return true; }
    if (T && T.st === 'aboard') { dismount(); return true; }
    const svc = ctx.serviceAt(H.pos.x, H.pos.z);
    if (!svc) { say('NO SQUAD HERE  -  PICK ONE UP ON THE ALBATROSS OR A FRIENDLY PAD (BARRACKS)', 2); return true; }
    if (G.mat < TROOPS.COST) { say(`A SQUAD NEEDS ${TROOPS.COST} MATERIEL  -  YOU HAVE ${Math.floor(G.mat)}`, 1.8); return true; }
    G.mat -= TROOPS.COST;
    board(svc.name);
    return true;
  }
  function board(where) {
    const Q = createSquad({ parent: scene, side: 1, n: TROOPS.N, kind: 'marine', groundY });
    const SK = -1.84;   // skid line, local y
    // the stick: two files of three, kneeling off the nose at 45 deg, clear of the 7.3 m disc
    const stick = []; for (let i = 0; i < TROOPS.N; i++) { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); stick.push({ x: s * (6.2 + k * 1.1), y: SK, z: -6.4 - k * 1.2, yaw: s > 0 ? Math.PI * 0.75 : -Math.PI * 0.75, g: true }); }
    Q.stick(stick, [], toWorld, heliYaw);
    Q.figs.forEach((F, i) => {
      const seat = SEATS[i], s = seat[0] < 0 ? -1 : 1;
      // in at the side of the seat: bent under the disc to the door, up onto the floor, to the seat
      F.lpath = [stick[i], { x: s * 2.7, y: SK, z: 0.4, g: true }, { x: s * 2.2, y: SK, z: 1.1, g: true }, { x: s * 1.3, y: -1.08, z: 1.15 }, { x: seat[0] * 0.8, y: -1.07, z: Math.min(1.6, seat[2]) }, { x: seat[0], y: -1.07, z: seat[2] }];
    });
    AL.troops = { Q, st: 'boarding', t: 0, where, aboard: () => Q.figs.filter(F => F.st === 'aboard').length };
    feed(`${where}: A SQUAD OF ${TROOPS.N} MARINES FOR THE HUEY (${TROOPS.COST} MATERIEL)`, 'good');
    say(`SQUAD CALLED  -  ${TROOPS.N} MARINES COMING ABOARD  ·  HOLD HER ON THE GROUND`, 2.2);
  }
  function dismount() {
    const T = AL.troops, Q = T.Q;
    if (waterAt(H.pos.x, H.pos.z) && !(war.deckY(H.pos.x, H.pos.z) > -1e8)) { say('NOT IN THE WATER', 1.2); return; }
    // the island they will fight on: the nearest one this LZ is on (or just off)
    let I = null, bd = 1e9; for (const J of ctx.ISLANDS) { if (!J.pad) continue; const d = Math.hypot(J.x - H.pos.x, J.z - H.pos.z) - (J.r || 80); if (d < bd) { bd = d; I = J; } }
    const onDeck = war.shipAt && war.shipAt(H.pos.x, H.pos.z) === war.carrier;
    if (onDeck || !I || bd > 60) {   // back to the barracks: they file out and go below
      const svc = ctx.serviceAt(H.pos.x, H.pos.z);
      if (!svc) { say('NO ISLAND TO PUT THEM ON HERE', 1.4); return; }
      G.mat += TROOPS.COST; Q.dispose(); AL.troops = null; feed(`${svc.name}: THE SQUAD IS BACK IN THE BARRACKS`, 'info'); say('SQUAD DISMOUNTED  -  BACK TO THE BARRACKS', 1.6); return;
    }
    // out of both doors: seat -> door sill -> the ground beside the skid, a few metres out
    const paths = [-1, 1].map(s => [[s * 0.6, -1.07, 1.4], [s * 1.35, -1.07, 1.15], [s * 2.3, -1.84, 1.0], [s * 4.5, -1.84, 0.6]].map(([x, y, z]) => toWorld(x, y, z, { x: 0, y: 0, z: 0 })));
    for (const p of paths) for (let k = 2; k < p.length; k++) p[k].y = groundY(p[k].x, p[k].z);
    Q.deploy(paths[0], [{ x: paths[0][3].x, z: paths[0][3].z, yaw: 0 }], 0.5);
    let k = 0;
    for (const F of Q.figs) { if (F.st !== 'queue') continue; const s = SEATS[Q.figs.indexOf(F)][0] < 0 ? 0 : 1, p = paths[s]; F.path = p; F.x = p[0].x; F.y = p[0].y; F.z = p[0].z; F.delay = 0.35 + (k++) * 0.35; F.slot = { x: p[3].x, z: p[3].z, yaw: Math.atan2(-(p[3].x - p[1].x), -(p[3].z - p[1].z)) }; }
    const unit = { kind: 'huey', side: 1, dead: false, dying: false, stowed: false };
    if (war.ground && war.ground.landing) war.ground.landing(unit, { squad: Q }, 1, I);
    T.st = 'out'; AL.troops = null;
    feed(`HUEY: ${k} MARINES ASHORE ON ${I.name}  -  THEY JOIN THE FIGHT`, 'good');
    say(`TROOPS OUT  -  ${k} MARINES ON ${I.name}  ·  ${I.owner === 1 ? 'THEY REINFORCE THE GARRISON' : 'THEY GO FOR THE PAD'}`, 2.4);
  }
  const _sv = new THREE.Vector3();
  function updateTroops(dt, time, piloted, alive) {
    const T = AL.troops; if (!T) return;
    T.t += dt;
    const Q = T.Q, obj = heliObj();
    if (T.st === 'boarding') {
      if (T.t > 1.6 && !T.called) { T.called = true; Q.embark(0.4); say('CREW CHIEF: COME ON!  -  THE SQUAD IS RUNNING IN', 1.4); }
      if (!H.landed && Q.figs.some(F => F.st === 'stick' || F.st === 'embark')) { Q.boardNow(); say('LIFTED EARLY  -  THE REST JUMPED IN', 1.4); }
      if (Q.boarded) { T.st = 'aboard'; feed(`HUEY: ${T.aboard()} MARINES ABOARD (${T.aboard() * TROOPS.KG} KG)`, 'good'); say(`${T.aboard()} ABOARD  -  CLEAR TO LIFT  ·  LAND ON AN ISLAND AND . TO PUT THEM OUT`, 2.4); }
      Q.update(dt, time);
    } else Q.update(dt, time);
    // the men aboard: seated in the cabin (after the squad's own update, which hides 'aboard' figures)
    obj.updateMatrixWorld(true); obj.getWorldQuaternion(_q);
    const rider = ctx.riderSeat ? ctx.riderSeat() : null;   // the player riding on the bench: that man moves up to the floor by the pylon
    Q.figs.forEach((F, i) => {
      if (F.st !== 'aboard') return;
      let s = SEATS[i]; const Gp = F.f.group;
      if (rider && Math.abs(rider[0] - s[0]) < 0.3 && Math.abs(rider[2] - s[2]) < 0.4) s = [s[0] * 0.5, -1.07, 0.85, Math.PI, 'kneel'];
      _sv.set(s[0], s[1], s[2]); obj.localToWorld(_sv);
      Gp.position.copy(_sv); Gp.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_up, s[3])); Gp.visible = obj.visible;
      F.f.pose(s[4] || 'seated', 0); F.x = _sv.x; F.y = _sv.y; F.z = _sv.z;
    });
  }

  // ---------------------------------------------------------------- the HUD: hook status, load, swing scope, crew chief
  const css = document.createElement('style');
  css.textContent = `#airlift{position:absolute;left:50%;bottom:112px;transform:translateX(-50%);display:none;align-items:flex-end;gap:10px;font-size:13px;color:#cfe;letter-spacing:1px;text-shadow:0 0 3px #000,0 0 6px #000;pointer-events:none;max-width:calc(100vw - 32px)}
#airlift.on{display:flex}#airlift .ln{white-space:pre-wrap;line-height:1.45}#airlift b{color:#fff;font-weight:normal}#airlift .w{color:#fc6}#airlift .r{color:#f86}#airlift .g{color:#8f9}
#airlift canvas{width:74px;height:74px;flex:none;background:rgba(0,20,25,.45);border:1px solid #3a8}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'airlift';
  const scope = document.createElement('canvas'); scope.width = scope.height = 74; el.appendChild(scope);
  const txt = document.createElement('div'); txt.className = 'ln'; el.appendChild(txt);
  (ctx.hud || document.body).appendChild(el);
  let lastHtml = '', scopeT = 0;
  function hud(piloted) {
    const show = piloted && (AL.load || AL.near || AL.troops) && G.craft === 'heli';
    el.classList.toggle('on', !!show);
    if (!show) return;
    const L = AL.load, N = AL.near, lines = [];
    const kg = v => Math.round(v).toLocaleString('en-US'), lb = v => Math.round(v / LB / 10) * 10;
    const gross = H.mass + (L && L.phase === 'hooked' ? L.S.m : 0), over = gross > HK.maxGross;
    if (L && L.phase === 'hooked') {
      const S = L.S, fast = (H.ias || 0) > L.sp.vKt, sw = S.swingDeg;
      lines.push(`HOOK <b class="g">LOADED</b>  ${L.sp.label}  <b>${kg(S.m)} KG</b> / LIMIT ${kg(HK.limit)} KG (${lb(HK.limit).toLocaleString('en-US')} LB)  ·  GROSS <b class="${over ? 'r' : ''}">${kg(gross)} KG${over ? ' OVER 9,500 LB' : ''}</b>`);
      lines.push(`${S.ground ? '<b class="g">LOAD ON THE GROUND</b>' : S.taut ? `TENSION <b class="${S.Tg > 1.6 ? 'r' : S.Tg > 1.25 ? 'w' : ''}">${S.Tg.toFixed(2)} g</b>` : '<b class="w">SLACK</b>'}  ·  SWING <b class="${sw > 15 ? 'r' : sw > 8 ? 'w' : ''}">${Math.round(sw)}°</b>  ·  ${Math.round(H.ias || 0)} KT <b class="${fast ? 'r' : ''}">(LOAD ${L.sp.vKt} KT MAX)</b>  ·  TQ <b class="${H.torque > 50 ? 'r' : ''}">${H.torque.toFixed(0)} PSI</b>`);
      lines.push(S.ground && S.Tg < 0.35 ? '<b class="g">R: RELEASE THE LOAD</b>' : AL.jettisonT > 0 ? '<b class="r">R AGAIN: JETTISON</b>' : 'R R: EMERGENCY RELEASE  ·  SET IT DOWN ON ITS WHEELS, THEN R');
    } else if (L && L.phase === 'falling') lines.push('<b class="r">LOAD FALLING</b>');
    else if (N) {
      lines.push(`HOOK <b>OPEN</b>  ·  BELOW: ${N.sp.label} <b>${kg(N.sp.mass)} KG</b>${N.why ? `  <b class="r">TOO HEAVY (HOOK ${kg(HK.limit)} KG)</b>` : ''}  ·  ${N.d.toFixed(1)} m OFF  ·  HOOK ${N.dy.toFixed(1)} m OVER THE APEX`);
      lines.push(`CREW CHIEF: <b class="${N.why ? 'r' : N.ready ? 'g' : 'w'}">${N.call}</b>`);
    }
    const T = AL.troops;
    if (T) lines.push(T.st === 'boarding' ? `TROOPS <b class="w">BOARDING</b> ${T.aboard()} / ${TROOPS.N}  ·  HOLD ON THE GROUND` : `TROOPS <b>${T.aboard()} ABOARD</b> (${T.aboard() * TROOPS.KG} KG)  ·  ${H.landed ? '<b class="g">. : PUT THEM OUT</b>' : 'LAND ON AN ISLAND, . TO PUT THEM OUT'}`);
    const html = lines.join('\n');
    if (html !== lastHtml) { lastHtml = html; txt.innerHTML = html; }
    scope.style.display = L || N ? '' : 'none';
    if ((scopeT -= 1) > 0) return; scopeT = 2;
    // swing scope: the load (or the apex we are hovering over) relative to the hook, nose up, rings at 10 / 20 / 30 deg
    const c = scope.getContext('2d'), W = 74, m = W / 2; c.clearRect(0, 0, W, W);
    c.strokeStyle = 'rgba(120,220,200,.55)'; c.lineWidth = 1;
    for (const r of [10, 20, 30]) { c.beginPath(); c.arc(m, m, r / 30 * (m - 4), 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(m, 3); c.lineTo(m, W - 3); c.moveTo(3, m); c.lineTo(W - 3, m); c.stroke();
    const hy = yawOf(H.q), fx_ = -Math.sin(hy), fz_ = -Math.cos(hy);
    let ax = 0, ay = 0, col = '#8f9';
    if (L && L.phase === 'hooked') { const S = L.S, sx = Math.tan(S.swing[0]), sz = Math.tan(S.swing[1]); ax = (sx * -fz_ + sz * fx_); ay = -(sx * fx_ + sz * fz_); const d = S.swingDeg; col = d > 15 ? '#f86' : d > 8 ? '#fc6' : '#8f9'; ax = Math.atan(ax) * 57.3; ay = Math.atan(ay) * 57.3; }
    else if (N) { ax = clamp(N.right, -6, 6) * 5; ay = -clamp(N.fwd, -6, 6) * 5; col = N.ready ? '#8f9' : '#fc6'; }
    c.fillStyle = col; c.beginPath(); c.arc(m + clamp(ax, -30, 30) / 30 * (m - 4), m + clamp(ay, -30, 30) / 30 * (m - 4), 4, 0, 7); c.fill();
    c.fillStyle = '#9cc'; c.font = '9px monospace'; c.fillText(L ? 'SWING' : 'APEX', 3, 10);
  }
  return AL;
}
