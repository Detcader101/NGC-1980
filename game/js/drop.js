// Para-drop repair team. Called down damaged (or dry) on land, you radio the carrier: a steel dropship takes off,
// and when it is close you fly the jump run from the carrier's console - line it up, mind the wind (the green smoke
// at the helicopter shows it), pick the height, and call the jumps. Then you steer the canopies down. Whoever lands
// on dry ground runs to the helicopter: each one brings fuel, and together they fix it - the more that make it, the
// faster. Hands off and the autopilot / jumpers do it themselves, just less well. Flak can bring the dropship down.
import * as THREE from 'three';
import { buildDropship, buildJumper } from './ships.js';

const SPEED = 50, FF_TIME = 2, AIR = 7.5, AIR_BRAKE = 3, SINK = 4.4, SINK_BRAKE = 3.1, TURN = 1.1, RUN = 4.5;
const WORK = 10, FUEL_EACH = 20, N_JUMPERS = 3, RUN_IN = 560;
const rnd = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const fwdX = y => -Math.sin(y), fwdZ = y => -Math.cos(y);   // yaw 0 = nose along -z

export function createDrop(ctx) {
  const { scene, fx, sfx, war, groundY, terrainH, isWater, say, feed } = ctx;
  let M = null;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();

  // ground markers: the helicopter (green) and where a jumper leaving now would land with no steering (yellow)
  const ring = (r, col) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
    m.renderOrder = 10; m.visible = false; scene.add(m); return m;
  };
  const tRing = ring(7, 0x44ff66), pRing = ring(4.5, 0xffdd33);

  function cleanup() {
    if (!M) return;
    scene.remove(M.plane.mesh); M.plane.u.gone = true;
    for (const j of M.jumpers) scene.remove(j.m.group);
    tRing.visible = pRing.visible = false; M = null;
  }

  function start(target, from) {
    cleanup();
    const wa = rnd(6.283), ws = rnd(2, 6);
    const yaw = Math.atan2(-(target.x - from.x), -(target.z - from.z));
    const m = buildDropship(); scene.add(m.group);
    const p = new THREE.Vector3(from.x, from.y + 2, from.z);
    const u = { type: 'dropship', side: 1, ext: true, p, v: new THREE.Vector3(fwdX(yaw) * 30, 0, fwdZ(yaw) * 30), r: 9, hp: 14, hpMax: 14, mesh: m.group };
    war.addExternal(u);
    M = {
      phase: 'inbound', target: new THREE.Vector3(target.x, target.y, target.z), wind: new THREE.Vector2(Math.cos(wa) * ws, Math.sin(wa) * ws),
      plane: { u, mesh: m.group, parts: m, p, yaw, bank: 0, alt: 85, speed: 30, from: new THREE.Vector3(from.x, from.y, from.z) },
      jumpers: [], left: N_JUMPERS, jumpCd: 0, handsT: 9, handsOffPass: true, work: 0, arrived: 0, fixed: false, t: 0, smokeT: 0,
      cam: new THREE.Vector3().copy(p).add(_v.set(0, 20, 40)), look: new THREE.Vector3().copy(target), wasFire: false, lost: 0,
    };
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(M.wind.x, -M.wind.y) + 6.283) % 6.283) / 0.785) % 8];
    feed(`DROPSHIP AIRBORNE  -  REPAIR TEAM OF ${N_JUMPERS}  ·  WIND ${ws.toFixed(0)} m/s TOWARD ${dir}`, 'good');
    sfx.dock();
  }

  // where a jumper leaving the plane now lands with no steering: a quick forward sim of freefall + an unsteered canopy
  function predict(out) {
    const P = M.plane; let x = P.p.x, y = P.p.y, z = P.p.z, vx = fwdX(P.yaw) * P.speed, vz = fwdZ(P.yaw) * P.speed, vy = 0, h = P.yaw;
    const dt = 0.25;
    for (let t = 0; t < 60; t += dt) {
      if (t < FF_TIME) { const k = Math.exp(-0.9 * dt); vx = M.wind.x + (vx - M.wind.x) * k; vz = M.wind.y + (vz - M.wind.y) * k; vy = Math.max(vy - 9.8 * dt, -45); }
      else { vx = fwdX(h) * AIR + M.wind.x; vz = fwdZ(h) * AIR + M.wind.y; vy = -SINK; }
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < groundY(x, z) + 0.5) break;
    }
    return out.set(x, groundY(x, z), z);
  }

  function jump() {
    const P = M.plane; M.left--; M.jumpCd = 0.6;
    const m = buildJumper(); m.canopy.visible = false; scene.add(m.group);
    const back = _v.set(-fwdX(P.yaw), 0, -fwdZ(P.yaw));
    const j = { m, p: P.p.clone().addScaledVector(back, 15).add(_w.set(0, -1.5, 0)), v: new THREE.Vector3(fwdX(P.yaw) * P.speed, 0, fwdZ(P.yaw) * P.speed), h: P.yaw, state: 'ff', t: 0, off: (M.jumpers.length - 1) * 4, steerAuto: true };
    M.jumpers.push(j); sfx.ui?.('select');
    say(M.left ? `JUMPER AWAY  -  ${M.left} LEFT` : 'STICK AWAY  -  STEER THE CANOPIES: A/D TURN, S BRAKES', 1.6);
  }

  function landJumper(j) {
    const gy = groundY(j.p.x, j.p.z); j.p.y = gy;
    const fast = Math.hypot(j.v.x, j.v.z) > 8.5;
    j.m.canopy.visible = false;
    if (isWater(j.p.x, j.p.z) && gy < 0.6) {
      j.state = 'swim'; j.t = 0; M.lost++;
      fx.splash?.(j.p.x, j.p.z, 0.6); feed('JUMPER IN THE WATER  -  THE ALBATROSS WILL FISH HIM OUT', 'bad');
      return;
    }
    j.state = 'run'; j.t = 0; j.slow = fast;
    if (fast) say('HARD LANDING  -  BRAKE (S) JUST BEFORE TOUCHDOWN', 1.6);
    for (let i = 0; i < 4; i++) fx.mix.spawn(j.p.x, gy + 0.3, j.p.z, rnd(-1.5, 1.5), rnd(0.3, 1), rnd(-1.5, 1.5), rnd(0.8, 1.5), 0.4, 1.6, .5, .45, .35, 0.4, 0.5, 1.5, 0.3);
  }

  function updateJumper(j, dt, steer, brake, lead) {
    j.t += dt;
    const m = j.m;
    if (j.state === 'ff') {
      const k = Math.exp(-0.9 * dt); j.v.x = M.wind.x + (j.v.x - M.wind.x) * k; j.v.z = M.wind.y + (j.v.z - M.wind.y) * k; j.v.y = Math.max(j.v.y - 9.8 * dt, -45);
      j.p.addScaledVector(j.v, dt);
      m.body.rotation.x = clamp(j.t * 1.5, 0, 1.4);   // tips into the arch
      if (j.t >= FF_TIME) { j.state = 'canopy'; j.t = 0; m.canopy.visible = true; m.canopy.scale.set(0.1, 0.1, 0.1); sfx.noiseBurst?.(700, 200, 0.25, 0.12); }
    } else if (j.state === 'canopy') {
      const gy = groundY(j.p.x, j.p.z), agl = j.p.y - gy;
      let s = 0, b = 0;
      const manual = lead && (Math.abs(steer) > 0.05 || brake > 0.05);
      if (manual) M.handsT = 0;
      if (lead && M.handsT < 1.5) { s = steer; b = brake; }
      else {   // the jumper flies himself: turn toward the helicopter, flare at the bottom
        const tx = M.target.x + j.off, tz = M.target.z, want = Math.atan2(-(tx - j.p.x), -(tz - j.p.z));
        s = clamp(-angDiff(j.h, want) * 1.2, -1, 1); b = agl < 5 ? 1 : 0;
      }
      j.h -= s * TURN * dt;
      const air = AIR + (AIR_BRAKE - AIR) * b, sink = SINK + (SINK_BRAKE - SINK) * b, k = 1 - Math.exp(-2.5 * dt);
      j.v.x += (fwdX(j.h) * air + M.wind.x - j.v.x) * k; j.v.z += (fwdZ(j.h) * air + M.wind.y - j.v.z) * k; j.v.y += (-sink - j.v.y) * (1 - Math.exp(-1.6 * dt));
      j.p.addScaledVector(j.v, dt);
      const o = Math.min(1, j.t / 0.7); m.canopy.scale.set(o, 0.4 + 0.6 * o, o);
      m.body.rotation.x = 0; m.group.rotation.z = -s * 0.25; j.bank = s;
      m.legs[0].rotation.x = m.legs[1].rotation.x = b * -0.5;
      if (agl < 0.6) landJumper(j);
    } else if (j.state === 'run') {
      const dx = M.target.x + Math.cos(j.off) * 2.6 - j.p.x, dz = M.target.z + Math.sin(j.off) * 2.6 - j.p.z, d = Math.hypot(dx, dz);
      if (d < 1) { j.state = 'work'; j.t = 0; M.arrived++; ctx.onFuel(FUEL_EACH); feed(`REPAIR CREW AT THE HELICOPTER  -  +${FUEL_EACH}% FUEL`, 'good'); }
      else {
        const sp = (j.slow ? 1.6 : RUN) * Math.min(1, j.t / 0.8);
        const nx = j.p.x + dx / d * sp * dt, nz = j.p.z + dz / d * sp * dt;
        if (isWater(nx, nz) && groundY(nx, nz) < 0.5) { j.state = 'stuck'; M.lost++; feed('JUMPER CUT OFF BY WATER', 'bad'); }
        else { j.p.set(nx, groundY(nx, nz), nz); j.h = Math.atan2(-dx, -dz); }
        const ph = j.t * (j.slow ? 6 : 11); m.legs[0].rotation.x = Math.sin(ph) * 0.7; m.legs[1].rotation.x = -Math.sin(ph) * 0.7; m.arms[0].rotation.x = -Math.sin(ph) * 0.6; m.arms[1].rotation.x = Math.sin(ph) * 0.6;
      }
      m.group.rotation.z = 0;
    } else if (j.state === 'work') {
      j.h = Math.atan2(-(M.target.x - j.p.x), -(M.target.z - j.p.z));
      const ph = j.t * 7; m.legs[0].rotation.x = m.legs[1].rotation.x = 0;
      m.arms[0].rotation.x = M.fixed ? -2.6 - Math.sin(ph) * 0.4 : -1.2 + Math.sin(ph) * 0.5; m.arms[1].rotation.x = M.fixed ? 0 : -1.2 - Math.sin(ph) * 0.5;   // spanners, then a wave
      if (!M.fixed && Math.random() < dt * 5) fx.add.spawn(M.target.x + (j.p.x - M.target.x) * 0.5, j.p.y + 1, M.target.z + (j.p.z - M.target.z) * 0.5, rnd(-2, 2), rnd(1, 3), rnd(-2, 2), 0.25, 0.25, 0.1, 1, .85, .4, 1, 9);
    } else if (j.state === 'swim') {
      j.p.y = -0.9 + Math.sin(j.t * 3) * 0.1; if (Math.random() < dt * 2) fx.water.add({ x: j.p.x, y: 0.1, z: j.p.z, size: 0.5, grow: 2.5, a: 0.5, life: 1.2, tile: 1 });
    }
    m.group.position.copy(j.p); m.group.rotation.y = j.h;
  }

  function updatePlane(dt, steer, climb, fire) {
    const P = M.plane, u = P.u;
    if (u.dying) {   // shot down: anyone still aboard bails out, then it goes in
      if (!P.down) { P.down = true; feed('DROPSHIP HIT  -  GOING DOWN', 'bad'); say('DROPSHIP GOING DOWN  -  BAIL OUT!', 2); while (M.left > 0) { jump(); M.jumpCd = 0; } }
      P.vy = (P.vy || 0) - 9 * dt; P.p.y += P.vy * dt; P.yaw += dt * 0.4; P.bank += dt * 0.6;
      P.p.x += fwdX(P.yaw) * P.speed * dt; P.p.z += fwdZ(P.yaw) * P.speed * dt;
      fx.add.spawn(P.p.x, P.p.y, P.p.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.3, 0.6), 2.2, 0.6, 1, rnd(.4, .6), .1, 0.9, -1, 1); fx.trail(P.p.x, P.p.y, P.p.z, 2);
      const gy = Math.max(terrainH(P.p.x, P.p.z), 0);
      if (P.p.y < gy + 1) { const wet = isWater(P.p.x, P.p.z); fx.explode(P.p.x, gy, P.p.z, 4, { fire: wet ? 0 : 60, oil: wet, debris: 16, color: 0x6c747c, crater: wet ? 0 : 4 }); sfx.boom(1); P.gone = true; scene.remove(P.mesh); u.gone = true; }
    } else {
      const T = M.target, dx = T.x - P.p.x, dz = T.z - P.p.z, dist = Math.hypot(dx, dz);
      if (M.phase === 'inbound' && dist < RUN_IN) { M.phase = 'run'; M.handsT = 9; say('JUMP RUN  -  A/D STEER  ·  W/S HEIGHT  ·  F (TRIGGER) JUMP  ·  HANDS OFF = AUTOPILOT', 3.5); sfx.alarm?.(); }
      let turn = 0;
      const manual = M.phase === 'run' && (Math.abs(steer) > 0.05 || Math.abs(climb) > 0.05 || fire);
      if (manual) { M.handsT = 0; M.handsOffPass = false; }
      if (M.phase === 'run' && M.handsT < 1.5) { turn = steer; P.alt = clamp(P.alt - climb * 22 * dt, 45, 160); }
      else if (M.left > 0 && !M.egress) {   // autopilot: steer to put the predicted landing on the helicopter
        let qx = T.x, qz = T.z;
        if (M.phase === 'run') { predict(_w); qx = T.x - (_w.x - P.p.x); qz = T.z - (_w.z - P.p.z); }
        turn = clamp(-angDiff(P.yaw, Math.atan2(-(qx - P.p.x), -(qz - P.p.z))) * 1.6, -1, 1);
      } else {   // egress: home to the carrier
        const f = ctx.home(); turn = clamp(-angDiff(P.yaw, Math.atan2(-(f.x - P.p.x), -(f.z - P.p.z))) * 1.2, -1, 1);
        if (Math.hypot(f.x - P.p.x, f.z - P.p.z) < 60 || M.t > (M.egressT || 0) + 60) { P.gone = true; scene.remove(P.mesh); u.gone = true; }
      }
      P.yaw -= turn * 0.42 * dt; P.bank += (-turn * 0.5 - P.bank) * (1 - Math.exp(-3 * dt));
      P.speed += (SPEED - P.speed) * (1 - Math.exp(-0.5 * dt));
      // height: hold the chosen altitude above the sea, but climb over high ground ahead
      let hi = 0; for (let k = 0; k <= 4; k++) hi = Math.max(hi, terrainH(P.p.x + fwdX(P.yaw) * k * 45, P.p.z + fwdZ(P.yaw) * k * 45));
      const want = Math.max(P.alt, hi + 35), vy = clamp((want - P.p.y) * 0.8, -8, 12);
      P.p.x += fwdX(P.yaw) * P.speed * dt; P.p.z += fwdZ(P.yaw) * P.speed * dt; P.p.y += vy * dt; P.pitch = vy * 0.02;
      // the jumps
      M.jumpCd -= dt;
      if (M.phase === 'run' && M.left > 0 && M.jumpCd <= 0) {
        if (fire) jump();
        else if (M.autoStick) jump();   // the jumpmaster sends the rest of the stick after the first
        else if (M.handsOffPass && M.handsT > 1.5) { predict(_w); if (Math.hypot(_w.x - T.x, _w.z - T.z) < 16) { M.autoStick = true; jump(); } }
      }
      if (M.left === 0 && !M.egress) { M.egress = true; M.egressT = M.t; }
      if (!fire) M.handsOffPass = M.handsOffPass || (M.handsT > 6);   // a long hands-off spell gives the jumpmaster the call again
    }
    u.v.set(fwdX(P.yaw) * P.speed, 0, fwdZ(P.yaw) * P.speed);
    P.mesh.position.copy(P.p); P.mesh.rotation.set(P.pitch || 0, P.yaw, P.bank, 'YXZ');
    for (const pr of P.parts.props) pr.rotation.z += dt * 40;
    P.parts.lamp.visible = (M.t % 1.2) < 0.12;
  }

  function update(dt, ctl, heli) {
    if (!M) return;
    M.t += dt; M.handsT += dt;
    if (heli.landed) M.target.set(heli.pos.x, groundY(heli.pos.x, heli.pos.z), heli.pos.z);
    const steer = ctl.cx || 0, climb = ctl.cy || 0, fireNow = !!ctl.fire, fire = fireNow && !M.wasFire; M.wasFire = fireNow;
    const lead = leadJumper(), flying = planeHasStick();   // the stick goes to the dropship until everyone is out
    if (!M.plane.gone) updatePlane(dt, flying ? steer : 0, flying ? climb : 0, flying && fireNow);
    for (const j of M.jumpers) updateJumper(j, dt, steer, Math.max(0, climb), !flying && j === lead);
    // green smoke at the helicopter: shows the drop zone and which way the wind blows
    if (!M.fixed && (M.smokeT -= dt) <= 0) { M.smokeT = 0.12; fx.mix.spawn(M.target.x + 2, M.target.y + 0.6, M.target.z, M.wind.x * 0.5, rnd(1.5, 3), M.wind.y * 0.5, rnd(4, 7), 0.8, 7, .3, .85, .35, 0.55, -0.15, 0.25, 0); }
    // repairs: man-seconds of work from whoever made it
    const working = M.jumpers.filter(j => j.state === 'work').length;
    if (working && !M.fixed) { M.work += working * dt; if (M.work >= WORK) { M.fixed = true; ctx.onRepaired(); } }
    tRing.visible = M.phase === 'run' && !M.fixed; pRing.visible = M.phase === 'run' && M.left > 0 && !M.plane.gone && !M.plane.u.dying;
    if (tRing.visible) { tRing.position.set(M.target.x, M.target.y + 0.4, M.target.z); tRing.scale.setScalar(1 + 0.08 * Math.sin(M.t * 5)); }
    if (pRing.visible) { predict(_w); pRing.position.set(_w.x, _w.y + 0.4, _w.z); }
    // finished?
    const out = M.jumpers.length === N_JUMPERS && M.jumpers.every(j => j.state !== 'ff' && j.state !== 'canopy' && j.state !== 'run');
    if (!M.done && out && (M.fixed || working === 0)) {
      M.done = true; M.doneT = M.t;
      if (!M.fixed) { if (M.arrived === 0) { say('DROP FAILED  -  NOBODY REACHED THE HELICOPTER  -  CALL LOGISTICS AGAIN (L)', 3.5); ctx.onFail(); } else { M.fixed = true; ctx.onRepaired(); } }
    }
    if (M.done && !M.ended) { M.ended = true; ctx.onEnd(); }
    // the crew hangs about until the helicopter leaves (they get picked up later)
    if (M.ended && M.plane.gone && (heli.pos.distanceTo(M.target) > 80 || M.t - M.doneT > 120)) cleanup();
  }
  function planeHasStick() { return M.left > 0 && !M.plane.gone && !M.plane.u.dying; }
  function leadJumper() { return M && M.jumpers.find(j => j.state === 'ff' || j.state === 'canopy') || null; }

  // camera: behind the dropship on the jump run, then riding with the lead canopy
  function camera(cam, dt) {
    const k = 1 - Math.exp(-4 * dt), L = leadJumper();
    if (L && !planeHasStick()) {
      const h = L.state === 'ff' ? M.plane.yaw : L.h;
      _v.set(L.p.x - fwdX(h) * 13, L.p.y + 4.5, L.p.z - fwdZ(h) * 13);
      _w.set(L.p.x + fwdX(h) * 10, L.p.y - 5, L.p.z + fwdZ(h) * 10).lerp(M.target, 0.3);
    } else {
      const P = M.plane;
      _v.set(P.p.x - fwdX(P.yaw) * 48, P.p.y + 15, P.p.z - fwdZ(P.yaw) * 48);
      _w.set(P.p.x + fwdX(P.yaw) * 50, P.p.y - 30, P.p.z + fwdZ(P.yaw) * 50).lerp(M.target, 0.25);
    }
    M.cam.lerp(_v, k); M.look.lerp(_w, k);
    M.cam.y = Math.max(M.cam.y, groundY(M.cam.x, M.cam.z) + 2);
    cam.position.copy(M.cam); cam.lookAt(M.look);
  }

  return {
    start, update, camera, cancel: cleanup,
    get active() { return !!M; },
    get camActive() { return !!M && ((M.phase === 'run' && planeHasStick()) || !!leadJumper()); },
    get controlling() { return this.camActive; },
    get state() { return M; },
    status() {
      if (!M) return '';
      if (M.phase === 'inbound') return `DROPSHIP INBOUND  -  ${Math.round(Math.max(0, Math.hypot(M.target.x - M.plane.p.x, M.target.z - M.plane.p.z) - RUN_IN) / SPEED)}s TO THE JUMP RUN`;
      if (M.fixed) return 'REPAIRED  -  THE CREW WAITS FOR PICK-UP';
      const run = M.jumpers.filter(j => j.state === 'run').length, work = M.jumpers.filter(j => j.state === 'work').length;
      if (work) return `FIELD REPAIR  ${Math.round(100 * M.work / WORK)}%  -  ${work} AT WORK${run ? `, ${run} ON THE WAY` : ''}`;
      if (run) return `REPAIR CREW ON THE WAY  -  ${run} RUNNING`;
      const L = leadJumper();
      if (L && !planeHasStick()) { const d = Math.hypot(L.p.x - M.target.x, L.p.z - M.target.z); return `CANOPY  ·  ${Math.round(L.p.y - groundY(L.p.x, L.p.z))}m UP  ·  ${Math.round(d)}m TO THE HELICOPTER  ·  A/D TURN  ·  S BRAKES  ·  HANDS OFF: HE STEERS`; }
      const P = M.plane; predict(_w);
      return `JUMP RUN  ·  ${Math.round(Math.hypot(M.target.x - P.p.x, M.target.z - P.p.z))}m  ·  HEIGHT ${Math.round(P.p.y)}m  ·  MISS ${Math.round(Math.hypot(_w.x - M.target.x, _w.z - M.target.z))}m  ·  ${M.left} TO JUMP  ·  F JUMP`;
    },
  };
}
