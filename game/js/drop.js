// Para-drop repair team. Called down damaged (or dry) on land, you radio for help and home base - off the map, over
// the horizon - sends a steel dropship, MULE 1, with a repair team. You fly it in from the edge of the map: a proper
// fixed-wing flight model (fixedwing.js) from the flight deck, or from outside (V); the autopilot (H) flies it if you
// let it. Line up the jump run, mind the wind (the green smoke at the helicopter shows it), pick height and speed,
// and call the jumps on the green light. Then you steer the canopies down. Whoever lands on dry ground runs to the
// helicopter: each one brings fuel, and together they fix it - the more that make it, the faster. Flak can bring
// the dropship down (the stick bails out); fly it into the ground and the team is lost.
import * as THREE from 'three';
import { buildDropship, buildJumper } from './ships.js';
import { createPlaneSim } from './fixedwing.js';

const FF_TIME = 2, AIR = 7.5, AIR_BRAKE = 3, SINK = 4.4, SINK_BRAKE = 3.1, TURN = 1.1, RUN = 4.5;
const WORK = 10, FUEL_EACH = 20, N_JUMPERS = 3, ENTRY = 1400, AP_SPEED = 50, JUMP_MIN_AGL = 40, JUMP_MAX_V = 72;
const EYE = new THREE.Vector3(-0.75, 1.42, -10.3);   // left seat on the flight deck
const rnd = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fwdX = y => -Math.sin(y), fwdZ = y => -Math.cos(y);   // yaw 0 = nose along -z
const KT = 1.944;

// ---------------------------------------------------------------------------------------------- flight deck
function buildFlightDeck() {
  const g = new THREE.Group(), M = c => new THREE.MeshLambertMaterial({ color: c }), dark = M(0x2a2e33), frame = M(0x3a3f45), seatM = M(0x4a3a2a);
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  const panel = box(3.3, 0.55, 0.12, dark, 0, 0.3, -11.55); panel.rotation.x = -0.35;
  box(3.4, 0.06, 0.2, dark, 0, 0.6, -11.72);                             // glareshield
  for (const x of [-1.62, -0.55, 0.55, 1.62]) { const p = box(0.045, 1.25, 0.045, frame, x, 1.3, -11.8); p.rotation.x = 0.25; p.rotation.z = x * 0.08; }
  box(3.5, 0.08, 0.08, frame, 0, 2.0, -11.6);                             // windscreen top
  box(3.5, 0.08, 1.8, dark, 0, 2.0, -10.2);                               // overhead panel
  for (const x of [-1.8, 1.8]) { box(0.08, 0.6, 2.4, dark, x, 0.55, -10.2); box(0.08, 0.08, 2.4, frame, x, 1.9, -10.2); box(0.08, 1, 0.08, frame, x, 1.4, -9.4); }
  box(0.5, 0.45, 1.1, dark, 0, 0.45, -10.4);                              // pedestal
  const levers = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.Group(); l.position.set(-0.15 + i * 0.1, 0.68, -10.4); g.add(l); const k = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), M(0x999999)); k.position.y = 0.11; l.add(k); const knob = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), M(0x222222)); knob.position.y = 0.23; l.add(knob); levers.push(l); }
  box(0.55, 0.12, 0.55, seatM, -0.75, 0.2, -9.9); box(0.55, 0.7, 0.1, seatM, -0.75, 0.6, -9.6);
  box(0.55, 0.12, 0.55, seatM, 0.75, 0.2, -9.9); box(0.55, 0.7, 0.1, seatM, 0.75, 0.6, -9.6);
  // yokes: column + wheel, they move with your inputs
  const yokes = [];
  for (const x of [-0.75, 0.75]) {
    const col = new THREE.Group(); col.position.set(x, 0.12, -10.95); g.add(col);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), frame); c.position.y = 0.22; col.add(c);
    const wheel = new THREE.Group(); wheel.position.y = 0.48; col.add(wheel);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.05), M(0x1c1c1c)); wheel.add(bar);
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), M(0x1c1c1c)); h.position.set(s * 0.18, 0.05, 0); wheel.add(h); }
    yokes.push({ col, wheel });
  }
  // instruments: one canvas across the panel
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.425), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(-0.75, 0.33, -11.47); face.rotation.x = -0.35; g.add(face);
  // the jump light by the door is mirrored on the glareshield where the pilot sees it
  const jl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0x220000 })); jl.position.set(-0.85, 0.66, -11.5); g.add(jl);
  const jl2 = jl.clone(); jl2.material = new THREE.MeshBasicMaterial({ color: 0x002200 }); jl2.position.x = -0.76; g.add(jl2);
  return { group: g, levers, yokes, cv, tex, red: jl, green: jl2 };
}
function drawInstruments(D, s, info) {
  const x = D.cv.getContext('2d'), W = 1024, H = 256;
  x.fillStyle = '#16191c'; x.fillRect(0, 0, W, H);
  const dial = (cx, cy, r, label, val, min, max, txt) => {
    x.fillStyle = '#060708'; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill(); x.strokeStyle = '#555'; x.lineWidth = 3; x.stroke();
    x.strokeStyle = '#ddd'; x.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { const a = -2.4 + i / 10 * 4.8; x.beginPath(); x.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82); x.lineTo(cx + Math.sin(a) * r * 0.95, cy - Math.cos(a) * r * 0.95); x.stroke(); }
    const a = -2.4 + clamp((val - min) / (max - min), 0, 1) * 4.8;
    x.strokeStyle = '#ffcc33'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(a) * r * 0.78, cy - Math.cos(a) * r * 0.78); x.stroke();
    x.fillStyle = '#ccc'; x.font = 'bold 17px monospace'; x.textAlign = 'center'; x.fillText(label, cx, cy + r * 0.55); x.fillStyle = '#fff'; x.font = 'bold 24px monospace'; x.fillText(txt, cx, cy - r * 0.25);
  };
  const r = 96, y = 128;
  dial(110, y, r, 'IAS kt', s.V * KT, 0, 200, Math.round(s.V * KT));
  // attitude
  { const cx = 330; x.save(); x.beginPath(); x.arc(cx, y, r, 0, 6.283); x.clip(); x.translate(cx, y); x.rotate(-s.bank); const py = s.pitch * 260;
    x.fillStyle = '#3a7bd5'; x.fillRect(-200, -400 + py, 400, 400); x.fillStyle = '#7a5530'; x.fillRect(-200, py, 400, 400); x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(-200, py); x.lineTo(200, py); x.stroke();
    for (const k of [-2, -1, 1, 2]) { x.beginPath(); x.moveTo(-30, py - k * 45); x.lineTo(30, py - k * 45); x.stroke(); }
    x.restore(); x.strokeStyle = '#ffcc33'; x.lineWidth = 6; x.beginPath(); x.moveTo(cx - 60, y); x.lineTo(cx - 18, y); x.lineTo(cx, y + 14); x.lineTo(cx + 18, y); x.lineTo(cx + 60, y); x.stroke();
    x.strokeStyle = '#555'; x.lineWidth = 3; x.beginPath(); x.arc(cx, y, r, 0, 6.283); x.stroke(); }
  dial(550, y, r, 'ALT m', info.alt % 1000, 0, 1000, Math.round(info.alt));
  dial(770, y, r, 'VSI m/s', s.v.y, -15, 15, s.v.y.toFixed(1));
  // annunciators
  const ann = (t, on, col, yy) => { x.fillStyle = on ? col : '#222'; x.fillRect(890, yy, 124, 36); x.fillStyle = on ? '#000' : '#555'; x.font = 'bold 18px monospace'; x.textAlign = 'center'; x.fillText(t, 952, yy + 25); };
  ann(info.ap ? 'AP ON' : 'AP OFF', info.ap, '#4f6', 10); ann('STALL', s.stall || s.alpha > 0.18, '#f43', 52);
  ann(`THR ${Math.round(s.thr * 100)}%`, true, '#fc4', 94); ann(`HDG ${String(Math.round(((-s.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}`, true, '#9cf', 136);
  ann(`JUMP ${info.left}`, info.light === 'green', '#4f6', 178); ann('PULL UP', info.pullUp, '#f43', 220);
  D.tex.needsUpdate = true;
}

export function createDrop(ctx) {
  const { scene, fx, sfx, war, groundY, terrainH, isWater, say, feed } = ctx;
  let M = null;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

  // ground markers: the helicopter (green) and where a jumper leaving now would land with no steering (yellow)
  const ring = (r, col) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
    m.renderOrder = 10; m.visible = false; scene.add(m); return m;
  };
  const tRing = ring(7, 0x44ff66), pRing = ring(4.5, 0xffdd33);
  const deck = buildFlightDeck(); deck.group.visible = false;

  function cleanup() {
    if (!M) return;
    if (M.hadStick) ctx.releaseStick();
    M.plane.mesh.remove(deck.group); scene.remove(M.plane.mesh); M.plane.u.gone = true;
    for (const j of M.jumpers) scene.remove(j.m.group);
    tRing.visible = pRing.visible = false; M = null;
  }

  // home base is off the map: MULE 1 comes in over the edge, from the side the carrier is on, a long way out
  function entryPoint(target, from) {
    let a = Math.atan2(from.z - target.z, from.x - target.x);
    if (Math.hypot(from.x - target.x, from.z - target.z) < 1) a = Math.atan2(1, -1);
    a += rnd(-0.35, 0.35);
    return new THREE.Vector3(target.x + Math.cos(a) * ENTRY, 0, target.z + Math.sin(a) * ENTRY);
  }

  function start(target, from) {
    cleanup();
    const wa = rnd(6.283), ws = rnd(2, 6);
    const e = entryPoint(target, from), yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
    const m = buildDropship(); scene.add(m.group); m.group.add(deck.group);
    const sim = createPlaneSim(); sim.reset(new THREE.Vector3(e.x, Math.max(150, target.y + 120), e.z), yaw, 55);
    const u = { type: 'dropship', side: 1, ext: true, p: sim.p, v: sim.v, r: 9, hp: 14, hpMax: 14, mesh: m.group };
    war.addExternal(u);
    M = {
      phase: 'run', target: new THREE.Vector3(target.x, target.y, target.z), wind: new THREE.Vector2(Math.cos(wa) * ws, Math.sin(wa) * ws),
      plane: { u, sim, mesh: m.group, parts: m, p: sim.p, entry: e }, ap: true, view: 'cockpit', ctl: { roll: 0, pitch: 0, yaw: 0, thr: 0.45 }, kb: { roll: 0, pitch: 0 },
      jumpers: [], left: N_JUMPERS, jumpCd: 0, work: 0, arrived: 0, fixed: false, t: 0, smokeT: 0, instT: 0, hadStick: false,
      cam: new THREE.Vector3().copy(sim.p).add(_v.set(0, 20, 40)), look: new THREE.Vector3().copy(target), wasFire: false, lost: 0, autoStick: false, apJump: true,
    };
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(M.wind.x, -M.wind.y) + 6.283) % 6.283) / 0.785) % 8];
    const from8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(e.x - target.x, -(e.z - target.z)) + 6.283) % 6.283) / 0.785) % 8];
    feed(`HOME BASE: REPAIR TEAM OF ${N_JUMPERS} ON THE WAY  -  DROPSHIP MULE 1 FROM THE ${from8}, ${(ENTRY / 1000).toFixed(1)} km`, 'good');
    feed(`WIND ${ws.toFixed(0)} m/s TOWARD ${dir}`, 'info');
    say('YOU HAVE MULE 1  -  AUTOPILOT ON (H)  ·  STICK TO FLY IT  ·  V VIEW  ·  F JUMP ON THE GREEN LIGHT', 4);
    sfx.dock();
  }

  // where a jumper leaving the plane now lands with no steering: a quick forward sim of freefall + an unsteered canopy
  function predict(out) {
    const S = M.plane.sim; let x = S.p.x, y = S.p.y, z = S.p.z, vx = S.v.x, vz = S.v.z, vy = S.v.y, h = S.heading;
    const dt = 0.25;
    for (let t = 0; t < 70; t += dt) {
      if (t < FF_TIME) { const k = Math.exp(-0.9 * dt); vx = M.wind.x + (vx - M.wind.x) * k; vz = M.wind.y + (vz - M.wind.y) * k; vy = Math.max(vy - 9.8 * dt, -45); }
      else { vx = fwdX(h) * AIR + M.wind.x; vz = fwdZ(h) * AIR + M.wind.y; vy = -SINK; }
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < groundY(x, z) + 0.5) break;
    }
    return out.set(x, groundY(x, z), z);
  }
  const aglOf = p => p.y - Math.max(groundY(p.x, p.z), 0);

  function jump(force) {
    const S = M.plane.sim;
    if (!force) {
      if (aglOf(S.p) < JUMP_MIN_AGL) { say(`TOO LOW TO JUMP  -  CLIMB ABOVE ${JUMP_MIN_AGL} m`, 1.2); M.jumpCd = 0.8; return; }
      if (S.V > JUMP_MAX_V) { say(`TOO FAST TO JUMP  -  SLOW BELOW ${Math.round(JUMP_MAX_V * KT)} kt`, 1.2); M.jumpCd = 0.8; return; }
    }
    M.left--; M.jumpCd = 0.6;
    const m = buildJumper(); m.canopy.visible = false; scene.add(m.group);
    const door = _v.set(0, -1.5, 15).applyQuaternion(S.q).add(S.p);   // the rear ramp
    const j = { m, p: door.clone(), v: S.v.clone(), h: S.heading, state: 'ff', t: 0, off: (M.jumpers.length - 1) * 4 };
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
    if (war.shipAt(j.p.x, j.p.z)) { j.state = 'aboard'; M.lost++; j.m.group.visible = false; feed('JUMPER CAME DOWN ON A SHIP  -  OUT OF THIS ONE', 'bad'); return; }
    if (Math.hypot(j.p.x - M.target.x, j.p.z - M.target.z) > 300) { j.state = 'stranded'; M.lost++; feed('JUMPER DOWN TOO FAR AWAY TO WALK  -  WAITING FOR PICK-UP', 'bad'); return; }
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
      if (j.p.y < groundY(j.p.x, j.p.z) + 0.5) { j.state = 'canopy'; landJumper(j); }
    } else if (j.state === 'canopy') {
      const gy = groundY(j.p.x, j.p.z), agl = j.p.y - gy;
      let s = 0, b = 0;
      if (lead && (Math.abs(steer) > 0.05 || brake > 0.05)) M.jumpHandsT = 0;
      if (lead && M.jumpHandsT < 1.5) { s = steer; b = brake; }
      else {   // the jumper flies himself: turn toward the helicopter, flare at the bottom
        const tx = M.target.x + j.off, tz = M.target.z, want = Math.atan2(-(tx - j.p.x), -(tz - j.p.z));
        let d = want - j.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        s = clamp(-d * 1.2, -1, 1); b = agl < 5 ? 1 : 0;
      }
      j.h -= s * TURN * dt;
      const air = AIR + (AIR_BRAKE - AIR) * b, sink = SINK + (SINK_BRAKE - SINK) * b, k = 1 - Math.exp(-2.5 * dt);
      j.v.x += (fwdX(j.h) * air + M.wind.x - j.v.x) * k; j.v.z += (fwdZ(j.h) * air + M.wind.y - j.v.z) * k; j.v.y += (-sink - j.v.y) * (1 - Math.exp(-1.6 * dt));
      j.p.addScaledVector(j.v, dt);
      const o = Math.min(1, j.t / 0.7); m.canopy.scale.set(o, 0.4 + 0.6 * o, o);
      m.body.rotation.x = 0; m.group.rotation.z = -s * 0.25;
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

  // the jump run: where the autopilot aims, so that the unsteered landing point sweeps over the helicopter
  function apTarget() {
    const T = M.target, S = M.plane.sim;
    if (M.left === 0 || M.egress) return { x: M.plane.entry.x, z: M.plane.entry.z, alt: 160, spd: 60 };
    predict(_w);
    const dzAlt = Math.max(T.y, 0) + 85;
    const d = Math.hypot(T.x - S.p.x, T.z - S.p.z);
    // far out: head for the drop zone; close in: correct for the throw and the drift
    const k = clamp((900 - d) / 500, 0, 1);
    return { x: T.x - (_w.x - S.p.x) * k, z: T.z - (_w.z - S.p.z) * k, alt: d > 900 ? Math.max(dzAlt, 140) : dzAlt, spd: AP_SPEED };
  }

  function updatePlane(dt, ctl, fireNow, hasStick) {
    const P = M.plane, S = P.sim, u = P.u;
    const agl = aglOf(S.p);
    if (u.dying && !P.down) { P.down = true; S.engines = 0; feed('MULE 1 HIT  -  GOING DOWN', 'bad'); say('MULE 1 GOING DOWN  -  BAIL OUT!', 2); while (M.left > 0) jump(true); }
    // controls: autopilot, or you; any real stick input takes it off autopilot
    let c;
    if (hasStick && !P.down) {
      const kbd = ctl.source === 'KEYBOARD';
      const thrMoved = M.lastColl !== undefined && ctl.coll !== undefined && Math.abs(ctl.coll - M.lastColl) > 0.03;   // throttle keys pressed / throttle lever moved
      const stickIn = Math.abs(ctl.cx || 0) > 0.15 || Math.abs(ctl.cy || 0) > 0.15 || Math.abs(ctl.pedal || 0) > 0.15 || thrMoved;
      if (M.ap && stickIn && M.t > 0.5) { M.ap = false; M.apJump = false; say('AUTOPILOT OFF  -  YOU HAVE CONTROL', 1.4); }
      if (M.ap) {
        const t = apTarget(); c = S.autopilot(dt, t.x, t.z, t.alt, t.spd);
        if (kbd) ctx.setThrottle(c.thr);   // the throttle keys pick up from where the autopilot left it
      } else {
        // keyboard: smoothed half deflection, and a wing leveller / pitch hold when the keys are released; a stick is raw
        const rIn = ctl.cx || 0, pIn = ctl.cy || 0;
        if (kbd) {
          const k = 1 - Math.exp(-5 * dt); M.kb.roll += (rIn * 0.7 - M.kb.roll) * k; M.kb.pitch += (pIn * 0.5 - M.kb.pitch) * k;
          c = { roll: Math.abs(rIn) > 0 ? M.kb.roll : clamp(-S.bank * 1.2 + S.w.z * 0.6, -0.5, 0.5), pitch: Math.abs(pIn) > 0 ? M.kb.pitch : clamp(-S.v.y * 0.05 - S.w.x * 0.4 + 0.05, -0.4, 0.4), yaw: ctl.pedal || 0, thr: ctl.coll ?? S.thr };
        } else c = { roll: rIn, pitch: pIn, yaw: ctl.pedal || 0, thr: ctl.coll ?? S.thr };
      }
      M.lastColl = M.ap && kbd ? c.thr : ctl.coll;
    } else if (!P.down) {   // nobody on the stick (everyone out): autopilot home
      const t = apTarget(); c = S.autopilot(dt, t.x, t.z, t.alt, t.spd);
    } else c = { roll: 0.3, pitch: -0.2, yaw: 0, thr: 0, wobble: Math.sin(M.t * 3) * 0.6 };
    M.ctl = c;
    S.step(dt, c);
    // jumps: F on the green light (or the jumpmaster, on autopilot)
    M.jumpCd -= dt;
    if (!P.down && hasStick && M.left > 0 && M.jumpCd <= 0) {
      if (fireNow) jump();
      else if (M.autoStick) jump();
      else if (M.ap && M.apJump) { predict(_w); if (Math.hypot(_w.x - M.target.x, _w.z - M.target.z) < 16 && agl > JUMP_MIN_AGL) { M.autoStick = true; jump(); } }
    }
    if (M.left === 0 && !M.egress) { M.egress = true; M.egressT = M.t; }
    // warnings
    if (!P.down && hasStick) {
      if (S.alpha > 0.18 && S.V > 5) sfx.alarm?.();
      M.pullUp = agl < 30 && S.v.y < -3;
      if (M.pullUp) sfx.alarm?.();
    }
    // smoke and fire when hit; ground
    if (P.down || u.hp < u.hpMax * 0.5) { fx.trail(S.p.x, S.p.y, S.p.z, P.down ? 2 : 1); if (P.down) fx.add.spawn(S.p.x, S.p.y, S.p.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.3, 0.6), 2.2, 0.6, 1, rnd(.4, .6), .1, 0.9, -1, 1); }
    const floor = Math.max(groundY(S.p.x, S.p.z), 0);
    if (S.p.y < floor + 1.5) {
      const wet = isWater(S.p.x, S.p.z);
      fx.explode(S.p.x, floor, S.p.z, 4, { fire: wet ? 0 : 60, oil: wet, debris: 16, color: 0x6c747c, crater: wet ? 0 : 4 }); sfx.boom(1.2);
      if (M.left > 0) { feed(`MULE 1 CRASHED  -  ${M.left} OF THE TEAM LOST`, 'bad'); say('MULE 1 CRASHED', 2.5); M.lost += M.left; M.left = 0; }
      P.gone = true; scene.remove(P.mesh); u.gone = true;
    }
    if (M.egress && !P.gone && (M.t > M.egressT + 70 || (Math.hypot(S.p.x, S.p.z) > 1000 && M.t > M.egressT + 15))) { P.gone = true; scene.remove(P.mesh); u.gone = true; }
    // the mesh and its moving parts
    P.mesh.position.copy(S.p); P.mesh.quaternion.copy(S.q);
    for (const pr of P.parts.props) pr.rotation.z += dt * (S.engines ? 20 + 30 * S.thr : 3);
    P.parts.lamp.visible = (M.t % 1.2) < 0.12;
    for (const l of deck.levers) l.rotation.x = -0.6 + S.thr * 1.1;
    for (const y of deck.yokes) { y.col.rotation.x = clamp(c.pitch, -1, 1) * 0.25; y.wheel.rotation.z = -clamp(c.roll, -1, 1) * 0.8; }
  }

  function jumpLight() {
    if (!M || M.left === 0 || M.plane.gone) return 'off';
    predict(_w); const miss = Math.hypot(_w.x - M.target.x, _w.z - M.target.z), S = M.plane.sim;
    if (miss < 30 && aglOf(S.p) > JUMP_MIN_AGL && S.V < JUMP_MAX_V) return 'green';
    return Math.hypot(M.target.x - S.p.x, M.target.z - S.p.z) < 900 ? 'red' : 'off';
  }

  function update(dt, ctl, heli) {
    if (!M) return;
    M.t += dt; M.jumpHandsT = (M.jumpHandsT ?? 9) + dt;
    if (heli.landed) M.target.set(heli.pos.x, groundY(heli.pos.x, heli.pos.z), heli.pos.z);
    const fireNow = !!ctl.fire, flying = planeHasStick();   // the stick goes to the dropship until everyone is out
    if (flying && !M.hadStick) { M.hadStick = true; ctx.takeStick(); }
    if (!flying && M.hadStick) { M.hadStick = false; ctx.releaseStick(); }
    if (!flying) deck.group.visible = false;
    const lead = leadJumper();
    if (!M.plane.gone) updatePlane(dt, ctl, flying && fireNow, flying);
    for (const j of M.jumpers) updateJumper(j, dt, ctl.cx || 0, Math.max(0, ctl.cy || 0), !flying && j === lead);
    // green smoke at the helicopter: shows the drop zone and which way the wind blows
    if (!M.fixed && (M.smokeT -= dt) <= 0) { M.smokeT = 0.12; fx.mix.spawn(M.target.x + 2, M.target.y + 0.6, M.target.z, M.wind.x * 0.5, rnd(1.5, 3), M.wind.y * 0.5, rnd(4, 7), 0.8, 7, .3, .85, .35, 0.55, -0.15, 0.25, 0); }
    // repairs: man-seconds of work from whoever made it
    const working = M.jumpers.filter(j => j.state === 'work').length;
    if (working && !M.fixed) { M.work += working * dt; if (M.work >= WORK) { M.fixed = true; ctx.onRepaired(); } }
    // markers, light, instruments
    M.light = jumpLight();
    tRing.visible = !M.fixed; pRing.visible = M.left > 0 && !M.plane.gone && !M.plane.down;
    if (tRing.visible) { tRing.position.set(M.target.x, M.target.y + 0.4, M.target.z); tRing.scale.setScalar(1 + 0.08 * Math.sin(M.t * 5)); }
    if (pRing.visible) { predict(_w); pRing.position.set(_w.x, _w.y + 0.4, _w.z); }
    const blink = (M.t % 0.5) < 0.25;
    deck.red.material.color.setHex(M.light === 'red' ? 0xff2010 : 0x220000); deck.green.material.color.setHex(M.light === 'green' && blink ? 0x30ff40 : 0x002200);
    if (deck.group.visible && (M.instT -= dt) <= 0) { M.instT = 0.08; drawInstruments(deck, M.plane.sim, { ap: M.ap, alt: M.plane.sim.p.y, left: M.left, light: M.light, pullUp: M.pullUp }); }
    // finished? everyone is down (or lost) and nobody is still running
    const settled = M.left === 0 && M.jumpers.every(j => j.state !== 'ff' && j.state !== 'canopy' && j.state !== 'run');
    if (!M.done && settled && (M.fixed || working === 0)) {
      M.done = true; M.doneT = M.t;
      if (!M.fixed) { if (M.arrived === 0) { say('DROP FAILED  -  NOBODY REACHED THE HELICOPTER  -  CALL LOGISTICS AGAIN (L)', 3.5); ctx.onFail(); } else { M.fixed = true; ctx.onRepaired(); } }
    }
    if (M.done && !M.ended) { M.ended = true; ctx.onEnd(); }
    // the crew hangs about until the helicopter leaves (they get picked up later)
    if (M.ended && M.plane.gone && (heli.pos.distanceTo(M.target) > 80 || M.t - M.doneT > 120)) cleanup();
  }
  function planeHasStick() { return !!M && M.left > 0 && !M.plane.gone && !M.plane.u.dying; }
  function leadJumper() { return M && M.jumpers.find(j => j.state === 'ff' || j.state === 'canopy') || null; }

  // camera: on the flight deck (or behind the dropship), then riding with the lead canopy
  function camera(cam, dt) {
    const k = 1 - Math.exp(-4 * dt), L = leadJumper(), S = M.plane.sim;
    const deckView = planeHasStick() && M.view === 'cockpit';
    deck.group.visible = deckView; M.plane.parts.glazing.visible = !deckView;
    if (deckView) {
      M.plane.mesh.updateMatrixWorld();
      cam.position.copy(EYE).applyMatrix4(M.plane.mesh.matrixWorld);
      cam.quaternion.copy(S.q).multiply(_q.setFromEuler(_e.set(-0.24 + (ctx.head?.pitch || 0), ctx.head?.yaw || 0, 0, 'YXZ')));
      M.cam.copy(cam.position); M.look.copy(cam.position).add(S.forward(_v).multiplyScalar(50));
      return;
    }
    if (L && !planeHasStick()) {
      const h = L.state === 'ff' ? S.heading : L.h;
      _v.set(L.p.x - fwdX(h) * 13, L.p.y + 4.5, L.p.z - fwdZ(h) * 13);
      _w.set(L.p.x + fwdX(h) * 10, L.p.y - 5, L.p.z + fwdZ(h) * 10).lerp(M.target, 0.3);
    } else {
      const f = S.forward(_w).clone(); f.y = 0; f.normalize();
      _v.set(S.p.x - f.x * 48, S.p.y + 14, S.p.z - f.z * 48);
      _w.set(S.p.x + f.x * 50, S.p.y - 20, S.p.z + f.z * 50);
    }
    M.cam.lerp(_v, k); M.look.lerp(_w, k);
    M.cam.y = Math.max(M.cam.y, groundY(M.cam.x, M.cam.z) + 2);
    cam.position.copy(M.cam); cam.lookAt(M.look);
  }

  return {
    start, update, camera, cancel: cleanup,
    get active() { return !!M; },
    get camActive() { return !!M && (planeHasStick() || !!leadJumper()); },
    get controlling() { return this.camActive; },
    get flying() { return planeHasStick(); },
    get cockpitView() { return planeHasStick() && M.view === 'cockpit'; },
    get state() { return M; },
    engineLevel() { return M && !M.plane.gone ? 0.35 + 0.55 * M.plane.sim.thr * M.plane.sim.engines : 0; },
    toggleAP() { if (!planeHasStick()) return; M.ap = !M.ap; if (M.ap) { M.apJump = true; M.plane.sim.ap.I = 0.05; } say(M.ap ? 'AUTOPILOT ON  -  IT WILL FLY THE RUN AND CALL THE JUMP' : 'AUTOPILOT OFF  -  YOU HAVE CONTROL', 1.6); },
    toggleView() { if (!M) return; M.view = M.view === 'cockpit' ? 'chase' : 'cockpit'; say(M.view === 'cockpit' ? 'FLIGHT DECK' : 'CHASE VIEW', 1); },
    status() {
      if (!M) return '';
      if (M.fixed) return 'REPAIRED  -  THE CREW WAITS FOR PICK-UP';
      const run = M.jumpers.filter(j => j.state === 'run').length, work = M.jumpers.filter(j => j.state === 'work').length;
      if (work) return `FIELD REPAIR  ${Math.round(100 * M.work / WORK)}%  -  ${work} AT WORK${run ? `, ${run} ON THE WAY` : ''}`;
      if (run) return `REPAIR CREW ON THE WAY  -  ${run} RUNNING`;
      const L = leadJumper();
      if (L && !planeHasStick()) { const d = Math.hypot(L.p.x - M.target.x, L.p.z - M.target.z); return `CANOPY  ·  ${Math.round(L.p.y - groundY(L.p.x, L.p.z))}m UP  ·  ${Math.round(d)}m TO THE HELICOPTER  ·  A/D TURN  ·  S BRAKES  ·  HANDS OFF: HE STEERS`; }
      if (!planeHasStick()) return 'MULE 1 OUTBOUND';
      const S = M.plane.sim; predict(_w);
      const light = M.light === 'green' ? 'GREEN LIGHT - JUMP (F)' : M.light === 'red' ? 'RED LIGHT - STAND BY' : `${M.left} TO JUMP`;
      return `MULE 1  ·  DZ ${Math.round(Math.hypot(M.target.x - S.p.x, M.target.z - S.p.z))}m  ·  ${Math.round(S.V * KT)}kt  ·  ${Math.round(aglOf(S.p))}m AGL  ·  MISS ${Math.round(Math.hypot(_w.x - M.target.x, _w.z - M.target.z))}m  ·  ${M.ap ? 'AP ON' : 'AP OFF'} (H)  ·  ${light}`;
    },
  };
}
