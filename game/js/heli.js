// Helicopter for the experimental build: a light utility helicopter (think Arma Reforger's UH-1) with a simple but
// simulated flight model, plus HOTAS/flight-stick input with an in-game axis calibration.
//
// Flight model, per 1/240 s substep (units: metres, seconds, mass-normalised so forces are accelerations):
// - Main rotor thrust along the body up axis = collective * TMAX * rpm^2 * ground effect * translational lift * VRS loss.
// - Cyclic and pedals command body angular RATES (like the real thing, not attitude); rates chase the command with a
//   rotor-authority response, plus: torque reaction yaw from collective (needs pedal), tail-fin weathervaning,
//   rotor flapback (nose-up with forward speed), and an optional stability assist that levels the disc hands-off.
// - Quadratic body-axis drag (slick nose-on, draggy side-on and vertically) + linear rotor heave damping.
// - Engine/rotor RPM spools up from cold, droops without fuel; with the engine out the rotor can autorotate.
// - Skids: soft landing settles on the ground, hard impact, rotor strike or big tilt is a crash.
import * as THREE from 'three';

export const HELI = {
  TMAX: 2.1,              // max thrust in g at full collective, 100% rpm
  RATE: { pitch: 1.3, roll: 1.7, yaw: 1.4 },   // rad/s at full deflection
  RESP: 3.2,              // how fast body rates follow the command (rotor authority)
  TORQUE: 0.55,           // yaw rate (rad/s) of main-rotor torque reaction at full collective
  ROTOR_R: 3.8, SKID_Y: -1.15,
  SPOOL: 0.35,            // rpm gain per second when the engine drives the rotor
  BURN: 0.9,              // fuel %/s at full collective (idle burns 15% of that): ~3.5 min of hover per tank
};

// --------------------------------------------------------------------------------------------- model
export function buildHeliMesh() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, ...o });
  const olive = M(0x55613d), dark = M(0x2b2f2a), glass = M(0x6fd0ff, { emissive: 0x0e3048, shininess: 80 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.55, 3.4), olive); cab.position.set(0, 0.1, 0.1); cab.name = 'cab';
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 1.2, 8).rotateX(-Math.PI / 2).scale(1.25, 1, 1), glass); nose.position.set(0, 0.05, -2.15); nose.name = 'nose';
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.6), olive); roof.position.set(0, 1.05, 0.2); roof.name = 'roof';
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, 4.6, 6).rotateX(Math.PI / 2), olive); boom.position.set(0, 0.45, 3.9);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.7), olive); fin.position.set(0, 1.0, 6.0); fin.rotation.x = -0.35;
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.4), olive); stab.position.set(0, 0.45, 5.1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), dark); mast.position.set(0, 1.5, 0.2); mast.name = 'mast';
  const skidGeo = new THREE.BoxGeometry(0.1, 0.1, 3.6);
  const skidL = new THREE.Mesh(skidGeo, dark), skidR = new THREE.Mesh(skidGeo, dark);
  skidL.position.set(-0.85, HELI.SKID_Y + 0.05, 0); skidR.position.set(0.85, HELI.SKID_Y + 0.05, 0);
  for (const z of [-0.8, 0.9]) for (const x of [-0.7, 0.7]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark); st.position.set(x, HELI.SKID_Y + 0.35, z); st.rotation.z = x > 0 ? 0.3 : -0.3; g.add(st);
  }
  // main rotor: two blades + a faint disc that fades in with rpm (motion blur stand-in)
  const rotor = new THREE.Group(); rotor.position.set(0, 1.78, 0.2);
  for (const a of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, HELI.ROTOR_R), dark); b.position.z = HELI.ROTOR_R / 2; b.rotation.y = a; const p = new THREE.Group(); p.rotation.y = a; b.rotation.y = 0; p.add(b); rotor.add(p); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(HELI.ROTOR_R, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.copy(rotor.position);
  const tail = new THREE.Group(); tail.position.set(0.12, 1.15, 6.15);
  for (const a of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.65), dark); b.position.z = 0.32; const p = new THREE.Group(); p.rotation.x = a; p.add(b); tail.add(p); }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3020 })); beacon.position.set(0, 1.35, 0.9);
  g.add(cab, nose, roof, boom, fin, stab, mast, skidL, skidR, rotor, disc, tail, beacon);
  return {
    group: g,
    animate(rpm, dt, time, inside = false) {
      rotor.rotation.y -= rpm * 38 * dt; tail.rotation.x += rpm * 110 * dt;
      disc.material.opacity = (inside ? 0.12 : 0.32) * THREE.MathUtils.smoothstep(rpm, 0.35, 0.9);
      beacon.visible = (time % 1.2) < 0.12;
    },
  };
}

// --------------------------------------------------------------------------------------------- flight model
const _v = new THREE.Vector3(), _vb = new THREE.Vector3(), _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _dq = new THREE.Quaternion(), _e = new THREE.Euler();
const SKID_PTS = [[0.85, 1.7], [-0.85, 1.7], [0.85, -1.7], [-0.85, -1.7]];
const NOMODS = { engineOk: true, power: 1, xmsnOk: true, lift: 1, tail: 1, hyd: 1, hydOk: true, skidTol: 1, vib: 0 };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createHeliSim(G) {   // G = gravity (m/s^2)
  const H = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),   // w = body rates (x pitch, y yaw, z roll)
    rpm: 0, engine: true, landed: true, coll: 0, agl: 0, vrs: 0, etl: 0, ge: 0,
    up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(H.q); },
    forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(H.q); },
    heading() { H.forward(_fw); return Math.atan2(_fw.x, -_fw.z); },
    attitude() { _e.setFromQuaternion(H.q, 'YXZ'); return { pitch: _e.x, roll: _e.z, yaw: _e.y }; },
    reset(pos, yaw = 0, landed = true, rpm = landed ? 0 : 1) {
      H.pos.copy(pos); H.vel.set(0, 0, 0); H.w.set(0, 0, 0); H.q.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
      H.landed = landed; H.rpm = rpm; H.engine = true;
    },
    // ctl: { cx, cy, pedal, coll, sas }  env: { groundY(x,z), fuel }  -> 'crash' | 'rotor' | 'water' | 'land' | null
    step(dt, ctl, env) {
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      let ev = null;
      for (let i = 0; i < n && !ev; i++) ev = sub(h, ctl, env);
      return ev;
    },
  };
  function sub(h, ctl, env) {
    // ---- rotor rpm: governor spools to 100% with fuel; without, rpm bleeds off unless the descent drives it (autorotation)
    _vb.copy(H.vel).applyQuaternion(_dq.copy(H.q).invert());     // velocity in body axes
    // damage model hooks (see damage.js): engine/gearbox state, power, rotor lift, tail authority, hydraulics
    const M = env.mods || NOMODS;
    const driven = H.engine && env.fuel > 0 && M.engineOk && M.xmsnOk;
    H.driven = driven;
    if (driven) {   // governor holds 100% unless the (damaged) engine can't supply the collective: rpm droops
      const tgt = Math.min(1, 1 - Math.max(0, ctl.coll - M.power) * 1.4);
      H.rpm += (tgt - H.rpm) * HELI.SPOOL * 2.2 * h + (H.rpm < tgt ? HELI.SPOOL * 0.15 * h : 0);
    } else H.rpm += (-0.06 - 0.22 * ctl.coll + 0.05 * Math.max(0, -_vb.y) - (M.xmsnOk ? 0 : 0.18)) * h;   // autorotation; a seized gearbox drags it down
    H.rpm = Math.min(1.05, Math.max(0, H.rpm));
    const auth = H.rpm * H.rpm * M.lift;
    H.coll = ctl.coll;

    // ---- angular: rate command + coupling torques
    const att = H.attitude();
    let wx = ctl.cy * HELI.RATE.pitch, wz = -ctl.cx * HELI.RATE.roll, wy = -ctl.pedal * HELI.RATE.yaw;
    wy *= M.tail;   // no tail rotor, no pedals
    const torque = driven ? ctl.coll * HELI.TORQUE * auth * 2.6 : 0;   // main-rotor torque reaction only while the engine drives it
    if (ctl.sas && M.hydOk) {   // stability assist: hands-off it levels the disc and kills drift in the rates
      const hands = 1 - Math.min(1, Math.hypot(ctl.cx, ctl.cy) * 2.5);
      wx += -att.pitch * 1.6 * hands; wz += -att.roll * 1.6 * hands;
      if (driven) wy += ctl.coll * HELI.TORQUE * 2.6 / (HELI.RESP * 0.8) * M.tail;   // auto pedal: cancels the torque reaction in steady state
    }
    const k = HELI.RESP * auth * M.hyd * (H.landed ? 0.2 : 1);
    H.w.x += ((wx - H.w.x) * k + (-_vb.z) * 0.012) * h;                    // flapback: forward speed pitches the nose up
    H.w.z += ((wz - H.w.z) * k) * h;
    const lost = 1 - M.tail;   // without the tail rotor the torque wins fast: ~2 rad/s spin within ~2 s at hover power
    H.w.y += ((wy - H.w.y) * k * 0.8 * M.tail - torque * (1 + 0.6 * lost) - _vb.x * 0.035 - H.w.y * 0.5 * lost) * h;   // torque reaction, tail-fin weathervane, airframe yaw damping
    if (H.landed) { H.w.x *= 0.5; H.w.z *= 0.5; }
    _dq.setFromEuler(_e.set(H.w.x * h, H.w.y * h, H.w.z * h, 'YXZ')); H.q.multiply(_dq).normalize();

    // ---- linear forces
    // ground under the skids: the highest of the four skid ends, so on a slope the uphill skid touches first
    let gy = -1e9;
    for (const [sx, sz] of SKID_PTS) { _v.set(sx, 0, sz).applyQuaternion(H.q); gy = Math.max(gy, env.groundY(H.pos.x + _v.x, H.pos.z + _v.z)); }
    H.agl = H.pos.y + HELI.SKID_Y - gy;
    const hs = Math.hypot(H.vel.x, H.vel.z);
    H.ge = 1 + 0.22 * Math.max(0, 1 - H.agl / (2 * HELI.ROTOR_R));                    // ground effect within a rotor diameter
    H.etl = 1 + 0.12 * sstep(6, 16, hs);                                               // translational lift
    H.vrs = sstep(4, 9, -H.vel.y) * (1 - sstep(6, 12, hs));                             // vortex ring: sinking fast with no airspeed
    const thrust = HELI.TMAX * G * ctl.coll * auth * H.ge * H.etl * (1 - 0.45 * H.vrs);
    H.up(_up);
    const dx = -(0.010 * Math.abs(_vb.x) * _vb.x), dy = -(0.020 * Math.abs(_vb.y) * _vb.y + 0.25 * _vb.y), dzz = -(0.0016 * Math.abs(_vb.z) * _vb.z);
    _v.set(dx, dy, dzz).applyQuaternion(H.q);
    _v.addScaledVector(_up, thrust); _v.y -= G;
    if (H.landed) {
      if (_v.y > 0.05 && thrust > G * 0.98) H.landed = false;   // lift-off
      else { H.vel.multiplyScalar(Math.max(0, 1 - 8 * h)); H.vel.y = 0; settle(gy, h); return null; }
    }
    H.vel.addScaledVector(_v, h); H.pos.addScaledVector(H.vel, h);

    // ---- contact: rotor strike, skids
    const r = HELI.ROTOR_R;
    for (let a = 0; a < 6.28; a += 0.785) {
      _v.set(Math.cos(a) * r, 1.78, Math.sin(a) * r + 0.2).applyQuaternion(H.q).add(H.pos);
      if (_v.y < env.groundY(_v.x, _v.z)) return 'rotor';
    }
    // tail strike (flaring too hard near the ground): the tail rotor takes it, the flight goes on
    _v.set(0.12, 1.15, 6.15).applyQuaternion(H.q).add(H.pos);
    const mishandled = H.vel.length() > 2 || H.attitude().pitch > 0.15;   // a careful lift-off or set-down on a slope just scrapes
    if (_v.y < env.groundY(_v.x, _v.z) - 0.25 && mishandled) { if (!H.tailHit) { H.tailHit = true; return 'tailstrike'; } } else if (_v.y > env.groundY(_v.x, _v.z)) H.tailHit = false;
    if (H.pos.y + HELI.SKID_Y * _up.y <= gy) {
      if (env.water) return 'water';
      const tilt = Math.acos(Math.min(1, _up.y)), tol = M.skidTol;
      if (H.vel.y < -8 * tol || hs > 11 * tol || tilt > 0.7) return 'crash';
      const hard = H.vel.y < -4.5 * tol || hs > 6 * tol || tilt > 0.42;   // survivable, but it breaks things
      H.landed = true; H.vel.set(0, 0, 0); H.w.set(0, H.w.y * 0.2, 0); settle(gy, 1);
      return hard ? 'hardland' : 'land';
    }
    return null;
  }
  function settle(gy, k) {   // sit on the skids: level pitch/roll toward upright, keep heading
    const yaw = H.attitude().yaw; _dq.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
    H.q.slerp(_dq, Math.min(1, k * 6)); H.pos.y = gy - HELI.SKID_Y;
  }
  return H;
}

// --------------------------------------------------------------------------------------------- input
// Axis map for flight sticks: { roll, pitch, coll, yaw } axis indices + collective min/max raw values + yaw sign.
const AXKEY = 'tz_heli_axes';
const HAT_DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];   // up, then clockwise
const loadAxes = () => { try { return JSON.parse(localStorage.getItem(AXKEY)) || null; } catch (e) { return null; } };
export function createHeliInput({ keyDown, readPad, say }) {
  let axes = loadAxes() || { roll: 0, pitch: 1, coll: 2, collMin: 1, collMax: -1, yaw: 5, yawSign: 1, guess: true };
  let collKb = 0, sas = true, sasForcedByUser = false, calib = null, padWasUsed = false;
  const dz = (v, d = 0.06) => Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d);
  const api = {
    get sas() { return sas; }, get axes() { return axes; }, get calibrating() { return !!calib; },
    toggleSas() { sas = !sas; sasForcedByUser = true; say(sas ? 'STABILITY ASSIST ON' : 'STABILITY ASSIST OFF  -  FULL MANUAL', 1.6); },
    setCollective(v) { collKb = v; },
    startCalibration() {
      const p = readPad(); if (!p) { say('NO FLIGHT STICK DETECTED', 2); return; }
      calib = { step: 0, rest: null, min: null, max: null, held: true };
      say('CALIBRATE: LEAVE STICK CENTRED, THROTTLE AT MINIMUM, PRESS TRIGGER', 999);
    },
    // returns { cx, cy, pedal, coll, sas, fire, winch, start, source }
    read(dt) {
      const out = { cx: 0, cy: 0, pedal: 0, coll: 0, sas, fire: false, winch: false, start: false, hatX: 0, hatY: 0, source: 'KEYBOARD' };
      out.cx = (keyDown('KeyD', 'ArrowRight') ? 1 : 0) - (keyDown('KeyA', 'ArrowLeft') ? 1 : 0);
      out.cy = (keyDown('KeyS', 'ArrowDown') ? 1 : 0) - (keyDown('KeyW', 'ArrowUp') ? 1 : 0);
      out.pedal = (keyDown('KeyE') ? 1 : 0) - (keyDown('KeyQ') ? 1 : 0);
      if (keyDown('Space', 'ShiftLeft')) collKb = Math.min(1, collKb + 0.55 * dt);
      if (keyDown('ControlLeft', 'KeyZ')) collKb = Math.max(0, collKb - 0.55 * dt);
      out.coll = collKb;
      out.fire = keyDown('KeyF', 'KeyX', 'KeyJ');
      out.winch = keyDown('KeyS', 'ArrowDown', 'KeyR');
      const p = readPad();
      if (p) {
        const a = i => p.axes[i] ?? 0, b = i => !!(p.buttons[i] && p.buttons[i].pressed);
        if (calib) return calibrate(p, out);
        const cx = dz(a(axes.roll)), cy = dz(a(axes.pitch)), yaw = dz(a(axes.yaw) * axes.yawSign, 0.1);
        const craw = a(axes.coll), coll = Math.min(1, Math.max(0, (craw - axes.collMin) / ((axes.collMax - axes.collMin) || 1)));
        if (cx || cy || yaw || padWasUsed || Math.abs(coll - 0.5) < 0.49) {
          padWasUsed = true; out.source = 'FLIGHT STICK';
          out.cx = cx || out.cx; out.cy = cy || out.cy; out.pedal = yaw || out.pedal;
          if (p.axes.length > axes.coll) { out.coll = coll; collKb = coll; }
          if (!sasForcedByUser && sas) sas = false;   // stick pilots get full manual unless they ask for assist (H)
        }
        if (b(0)) out.fire = true;
        if (b(1) || b(3)) out.winch = true;
        out.start = p.buttons.some(x => x && x.pressed);
        // POV hat: DirectInput sticks report it as an axis (9 on most) stepping -1..1 in eighths, ~3.29 when centred;
        // standard-mapped pads use buttons 12-15 instead
        const hv = p.axes[9];
        if (hv !== undefined && hv >= -1.05 && hv <= 1.05) [out.hatX, out.hatY] = HAT_DIRS[Math.round((hv + 1) / (2 / 7)) % 8];
        if (b(12)) out.hatY = 1; if (b(13)) out.hatY = -1; if (b(14)) out.hatX = -1; if (b(15)) out.hatX = 1;
      }
      out.sas = sas;
      return out;
    },
  };
  function calibrate(p, out) {
    const trig = !!(p.buttons[0] && p.buttons[0].pressed), snap = () => p.axes.slice();
    if (!trig) calib.held = false;
    if (trig && !calib.held) {
      calib.held = true;
      if (calib.step === 0) { calib.rest = snap(); calib.min = snap(); calib.step = 1; say('PUSH THROTTLE TO MAXIMUM, PRESS TRIGGER', 999); }
      else if (calib.step === 1) { calib.max = snap(); calib.step = 2; say('TWIST STICK FULLY RIGHT (RUDDER), PRESS TRIGGER', 999); }
      else {
        const tw = snap(), d = (A, B, i) => Math.abs((A[i] ?? 0) - (B[i] ?? 0));
        let coll = 2, best = 0; for (let i = 0; i < calib.min.length; i++) if (i > 1 && d(calib.min, calib.max, i) > best) { best = d(calib.min, calib.max, i); coll = i; }
        let yaw = 5, bestY = 0; for (let i = 0; i < tw.length; i++) if (i > 1 && i !== coll && d(tw, calib.rest, i) > bestY) { bestY = d(tw, calib.rest, i); yaw = i; }
        axes = { roll: 0, pitch: 1, coll, collMin: calib.min[coll], collMax: calib.max[coll], yaw, yawSign: Math.sign((tw[yaw] ?? 0) - (calib.rest[yaw] ?? 0)) || 1 };
        try { localStorage.setItem(AXKEY, JSON.stringify(axes)); } catch (e) {}
        calib = null; say(`STICK CALIBRATED  -  COLLECTIVE AXIS ${axes.coll}, PEDALS AXIS ${axes.yaw}`, 3);
      }
    }
    out.source = 'CALIBRATING'; out.coll = collKb; return out;
  }
  return api;
}

// --------------------------------------------------------------------------------------------- cockpit
// First-person cockpit (pilot sits right, like a Huey): instrument panel with live gauges drawn to a canvas texture,
// glare shield, door pillars and roof frame, plus the cyclic and collective levers moving with the pilot's inputs.
// Everything sits in heli-local space, so it rides along with the airframe.
export const EYE = new THREE.Vector3(0.42, 0.62, -0.95);
export function buildCockpit() {
  const g = new THREE.Group(); g.visible = false;
  // interior fill light: the cabin is mostly lit from the windows, so give every surface a little self-light
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.45), ...o });
  const frameM = M(0x2a2e28), panelM = M(0x1c1f1c), olive = M(0x4a5536);
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  // Cabin interior: walls at x = +-0.86, floor y = -0.5, roof y = 1.02. The windscreen runs from the front edge of the
  // glare shield (y 0.27, z -2.1) back up to the roof beam (y 1.0, z -1.45); the A-pillars and centre post lie on it.
  const WS = { y0: 0.27, z0: -2.1, y1: 1.0, z1: -1.45 }, wsLen = Math.hypot(WS.y1 - WS.y0, WS.z1 - WS.z0), wsAng = Math.atan2(WS.z1 - WS.z0, WS.y1 - WS.y0);
  const wsY = (WS.y0 + WS.y1) / 2, wsZ = (WS.z0 + WS.z1) / 2;
  // instrument panel + glare shield across the cabin, below the eye line
  box(1.68, 0.035, 0.18, frameM, 0, 0.25, -2.03, 0.05);
  // pedestal / centre console, floor
  box(0.34, 0.36, 0.7, panelM, 0, -0.25, -1.3);
  box(1.7, 0.05, 1.75, olive, 0, -0.5, -0.33);   // floor (chin windows in front of it)
  // A-pillars and centre post along the windscreen, roof frame, overhead console, door rear posts
  for (const x of [0.82, 0, -0.82]) box(x ? 0.06 : 0.045, wsLen, 0.06, frameM, x, wsY, wsZ, wsAng);
  box(1.68, 0.06, 0.06, frameM, 0, 1.0, -1.45); box(0.06, 0.06, 1.6, frameM, 0.82, 1.0, -0.7); box(0.06, 0.06, 1.6, frameM, -0.82, 1.0, -0.7);
  box(0.5, 0.08, 0.6, panelM, 0, 0.97, -0.9);
  box(0.06, 1.5, 0.06, frameM, 0.82, 0.25, -0.1); box(0.06, 1.5, 0.06, frameM, -0.82, 0.25, -0.1);
  // ---- the rest of the cabin, so free-look finds a whole cockpit: doors, rear wall, roof, seats, glass
  const wallM = M(0x3d4630), seatM = M(0x2b2b26), padM = M(0x55503f);
  for (const sx of [1, -1]) {
    box(0.04, 0.58, 2.0, wallM, 0.86 * sx, -0.21, -1.1);             // lower door panel below the window, up to the nose
    box(0.05, 0.05, 2.0, frameM, 0.84 * sx, 0.07, -1.1);              // window sill
    box(0.04, 1.5, 0.62, wallM, 0.86 * sx, 0.25, 0.24);              // solid cabin wall behind the door
    // seat: pan, back, headrest
    box(0.5, 0.08, 0.5, padM, 0.42 * sx, -0.22, -0.45); box(0.5, 0.75, 0.08, padM, 0.42 * sx, 0.18, -0.17, -0.12);
    box(0.28, 0.2, 0.08, seatM, 0.42 * sx, 0.66, -0.11, -0.12); box(0.46, 0.25, 0.4, seatM, 0.42 * sx, -0.38, -0.45);
  }
  box(1.7, 1.5, 0.05, wallM, 0, 0.25, 0.56);                          // rear bulkhead
  box(0.6, 0.35, 0.02, M(0x101410), 0, 0.55, 0.53);                   // dark cargo-bay window in the bulkhead
  box(1.72, 0.04, 1.45, wallM, 0, 1.03, -0.15);                       // roof lining (the front part is the greenhouse glass)
  box(0.18, 0.3, 0.12, seatM, 0, 0.88, 0.1);                          // overhead circuit-breaker box
  // co-pilot's cyclic, static, and a fire extinguisher by the door
  const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 6), frameM); cs.position.set(-0.42, -0.18, -1.15); g.add(cs);
  const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), M(0xaa1810)); ext.position.set(-0.7, -0.3, 0.4); g.add(ext);
  // glass: faint tint on the windscreen, door windows, greenhouse roof and chin windows (read as glass, barely block the view)
  const glass = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  // every pane sits exactly in its frame: nothing pokes into the cabin or past the walls
  const pane = (geo, x, y, z, rx = 0, ry = 0) => { const p = new THREE.Mesh(geo, glass); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); p.renderOrder = 5; g.add(p); };
  pane(new THREE.PlaneGeometry(1.64, wsLen), 0, wsY, wsZ, wsAng);    // windscreen, glare shield to roof beam
  {   // door windows: sill up to the roof rail, the front edge follows the A-pillar
    const pts = [[-0.1, 0.08], [-2.08, 0.08], [WS.z0 + 0.02, WS.y0], [WS.z1, WS.y1 - 0.02], [-0.1, WS.y1 - 0.02]].map(([z, y]) => new THREE.Vector2(-z, y));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts)); geo.rotateY(Math.PI / 2);   // shape x = -z  ->  local z
    pane(geo, 0.855, 0, 0); pane(geo, -0.855, 0, 0);
  }
  pane(new THREE.PlaneGeometry(1.64, 0.57), 0, 1.0, -1.165, -Math.PI / 2);                     // greenhouse, roof beam to roof lining
  {   // chin windows: from the bottom of the instrument panel down to the front of the floor
    const y0 = -0.3, z0 = -1.87, y1 = -0.48, z1 = -1.2;
    pane(new THREE.PlaneGeometry(1.6, Math.hypot(y1 - y0, z1 - z0)), 0, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, y1 - y0) - Math.PI);
  }
  // ---- instruments: two-row panel. Top row = flight instruments (straight ahead), lower row = engine & systems
  // (glance down). Drawn to one canvas texture at ~20 Hz.
  box(1.66, 0.56, 0.05, panelM, 0, -0.04, -1.97, -0.35);         // taller panel face behind the gauges
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 416;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const gauges = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.5525), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  gauges.position.set(0.16, -0.0325, -1.94); gauges.rotation.x = -0.35; g.add(gauges);
  // caution / warning annunciator strip along the glare shield, right in the pilot's eye line
  const acv = document.createElement('canvas'); acv.width = 1024; acv.height = 160;
  const atex = new THREE.CanvasTexture(acv); atex.colorSpace = THREE.SRGBColorSpace;
  const ann = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.1125), new THREE.MeshBasicMaterial({ map: atex, toneMapped: false }));
  ann.position.set(0.39, 0.33, -2.04); ann.rotation.x = -0.25; g.add(ann);
  const actx = acv.getContext('2d');
  const ANN = ['ENG FIRE', 'ENG OUT', 'TAIL ROTOR', 'XMSN', 'HYD PRESS', 'FUEL LEAK', 'LOW FUEL', 'LOW RPM', 'ROTOR DMG', 'AVIONICS'];

  // ---- switch panel on the centre pedestal (look down-left). Each switch has an invisible hit box for clicking.
  const pcv = document.createElement('canvas'); pcv.width = 256; pcv.height = 512;
  const ptex = new THREE.CanvasTexture(pcv); ptex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.64), new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(0, -0.068, -1.3); g.add(plate);
  const SW = [
    { id: 'engine', label: 'ENGINE' }, { id: 'hyd', label: 'HYD BOOST' }, { id: 'sas', label: 'SAS' },
    { id: 'light', label: 'LDG LIGHT' }, { id: 'radio', label: 'LOGISTICS', button: true }, { id: 'fire', label: 'FIRE EXT', button: true, red: true },
  ];
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), switches = [];
  SW.forEach((s, i) => {
    const z = -1.56 + i * 0.1, piv = new THREE.Group(); piv.position.set(0.07, -0.065, z); g.add(piv);
    const m = s.button ? new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.018, 10), M(s.red ? 0xcc1a10 : 0x2a6acc)) : new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.05, 6), M(0xd0d0c8));
    m.position.y = s.button ? 0.009 : 0.025; piv.add(m);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.085), hitM); hit.position.set(0, -0.05, z); hit.userData.sw = s.id; g.add(hit);   // thin, so a slanted look never grabs the neighbour
    switches.push({ ...s, piv, hit, on: false, flash: 0 });
  });
  function drawPlate(hover) {
    const c = pcv.getContext('2d'); c.fillStyle = '#20231f'; c.fillRect(0, 0, 256, 512);
    c.strokeStyle = '#555c50'; c.lineWidth = 3; c.strokeRect(4, 4, 248, 504);
    c.font = 'bold 22px Consolas, monospace'; c.textAlign = 'left';
    switches.forEach((s, i) => {
      const y = 48 + i * 80;
      if (s.id === hover) { c.fillStyle = 'rgba(255,220,80,.18)'; c.fillRect(8, y - 34, 240, 66); }
      c.fillStyle = '#e8e4d0'; c.fillText(s.label, 14, y);
      c.font = '16px Consolas, monospace'; c.fillStyle = s.button ? '#9a9' : (s.on ? '#7f7' : '#a99');
      c.fillText(s.button ? 'PUSH' : (s.on ? 'ON' : 'OFF'), 14, y + 22); c.font = 'bold 22px Consolas, monospace';
    });
    ptex.needsUpdate = true;
  }

  // cyclic between the pilot's knees, collective by the left hand
  const stickPivot = new THREE.Group(); stickPivot.position.set(0.42, -0.45, -1.15); g.add(stickPivot);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 6), frameM); stick.position.y = 0.27; stickPivot.add(stick);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), M(0x111111)); grip.position.y = 0.56; stickPivot.add(grip);
  const collPivot = new THREE.Group(); collPivot.position.set(0.12, -0.4, -0.75); g.add(collPivot);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).rotateX(Math.PI / 2), frameM); lever.position.z = -0.3; collPivot.add(lever);
  const ctx = cv.getContext('2d'); let acc = 1, plateKey = '';
  function dial(cx, cy, r, label, val, max, unit, { ticks = 10, red = null, needle2 = null } = {}) {
    ctx.fillStyle = '#0b0d0b'; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, 6.283); ctx.fill();
    const ang = v => -Math.PI * 1.25 + Math.min(1, Math.max(0, v / max)) * Math.PI * 1.5;
    if (red !== null) { ctx.strokeStyle = '#c02818'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, ang(red), ang(max)); ctx.stroke(); }
    ctx.strokeStyle = '#d8d8c8'; ctx.lineWidth = 3;
    for (let i = 0; i <= ticks; i++) { const a = -Math.PI * 1.25 + i / ticks * Math.PI * 1.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
    const needle = (v, col, w) => { const a = ang(v); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); ctx.stroke(); };
    if (needle2 !== null) needle(needle2, '#7fd0ff', Math.max(3, r * 0.04));
    needle(val, '#ffd040', Math.max(3, r * 0.055));
    ctx.fillStyle = '#d8d8c8'; ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(r * 0.24)}px Consolas, monospace`; ctx.fillText(label, cx, cy + r * 0.5);
    ctx.font = `bold ${Math.round(r * 0.28)}px Consolas, monospace`; ctx.fillText(unit, cx, cy - r * 0.37);
  }
  function off(cx, cy, r) {   // failed instrument: OFF flag
    ctx.fillStyle = '#0b0d0b'; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.4); ctx.fillStyle = '#d02818'; ctx.fillRect(-r * 0.5, -r * 0.14, r, r * 0.28);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 0.22)}px Consolas, monospace`; ctx.textAlign = 'center'; ctx.fillText('OFF', 0, r * 0.08); ctx.restore();
  }
  function horizon(cx, cy, r, pitch, roll) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-roll); const offy = pitch * 180;
    ctx.fillStyle = '#3a78c8'; ctx.fillRect(-200, -400 + offy, 400, 400); ctx.fillStyle = '#7a5428'; ctx.fillRect(-200, offy, 400, 400);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let p = -2; p <= 2; p++) if (p) { ctx.beginPath(); ctx.moveTo(-22, offy - p * 30); ctx.lineTo(22, offy - p * 30); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-200, offy); ctx.lineTo(200, offy); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 50, cy); ctx.lineTo(cx - 16, cy); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx + 16, cy); ctx.lineTo(cx + 50, cy); ctx.stroke();
  }
  return {
    group: g,
    hitBoxes: switches.map(s => s.hit),
    // st: { fuel, cautions:[{t,warn}], engineOn, hydOn, sasOn, lightOn, egt, oil, hydPsi, n2, avionics, hover }
    update(H, ctl, dt, st = {}) {
      // levers follow the pilot's hands every frame; switch levers follow their state
      stickPivot.rotation.set((ctl.cy || 0) * 0.3, 0, -(ctl.cx || 0) * 0.3); collPivot.rotation.x = (H.coll || 0) * 0.45;
      const on = { engine: st.engineOn, hyd: st.hydOn, sas: st.sasOn, light: st.lightOn };
      for (const s of switches) { if (!s.button) { s.on = !!on[s.id]; s.piv.rotation.x = s.on ? -0.55 : 0.55; } else s.piv.position.y = -0.065 - (s.flash > 0 ? 0.008 : 0); s.flash -= dt; }
      const key = switches.map(s => +s.on).join('') + (st.hover || '');
      if (key !== plateKey) { plateKey = key; drawPlate(st.hover); }
      acc += dt; if (acc < 0.05) return; acc = 0;
      const flaky = (st.avionics ?? 1) < 0.4, dead = i => flaky && ((performance.now() / 700 + i * 1.7) % 3) < 1.2;   // failing avionics drop gauges in and out
      ctx.fillStyle = '#1c1f1c'; ctx.fillRect(0, 0, 1024, 416);
      // top row: flight instruments
      const att = H.attitude(), ias = Math.hypot(H.vel.x, H.vel.z) * 1.944;
      dead(0) ? off(110, 128, 92) : dial(110, 128, 92, 'IAS kt', ias, 120, Math.round(ias));
      dead(1) ? off(315, 128, 92) : horizon(315, 128, 96, att.pitch, att.roll);
      dead(2) ? off(520, 128, 92) : dial(520, 128, 92, 'ALT m', Math.max(0, H.agl) % 100, 100, Math.max(0, Math.round(H.agl)));
      dead(3) ? off(720, 128, 92) : dial(720, 128, 92, 'VSI', H.vel.y + 10, 20, (H.vel.y >= 0 ? '+' : '') + H.vel.y.toFixed(1));
      // dual tachometer: yellow = rotor (NR), blue = engine (N2); split needles mean the engine isn't driving the rotor
      dead(4) ? off(915, 128, 92) : dial(915, 128, 92, 'NR / N2 %', H.rpm, 1.1, Math.round(H.rpm * 100), { red: 1.04, needle2: st.n2 ?? H.rpm });
      // lower row: engine and systems
      const fuel = st.fuel ?? 0;
      dial(110, 316, 58, 'FUEL %', fuel, 100, Math.round(fuel), { ticks: 8 });
      dial(270, 316, 58, 'TORQUE %', H.coll * H.rpm * 100, 110, Math.round(H.coll * H.rpm * 100), { ticks: 11, red: 100 });
      dial(430, 316, 58, 'EGT °C', st.egt ?? 0, 900, Math.round(st.egt ?? 0), { ticks: 9, red: 760 });
      dial(590, 316, 58, 'XMSN psi', st.oil ?? 0, 80, Math.round(st.oil ?? 0), { ticks: 8 });
      dial(750, 316, 58, 'HYD psi', st.hydPsi ?? 0, 1200, Math.round(st.hydPsi ?? 0), { ticks: 6 });
      // compass + clock
      const hdg = ((H.heading() * 180 / Math.PI) + 360) % 360, t = new Date();
      ctx.fillStyle = '#000'; ctx.fillRect(412, 2, 200, 26); ctx.fillStyle = '#d8d8c8'; ctx.font = 'bold 20px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', 512, 22);
      ctx.fillStyle = '#000'; ctx.fillRect(860, 288, 130, 56); ctx.fillStyle = '#7fd07f'; ctx.font = 'bold 26px Consolas, monospace';
      ctx.fillText(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, 925, 326);
      tex.needsUpdate = true;
      // annunciator: amber cautions, flashing red warnings
      const lit = new Map((st.cautions || []).map(c => [c.t.startsWith('XMSN') ? 'XMSN' : c.t === 'ENG OFF' ? 'ENG OUT' : c.t === 'T/R DMG' ? 'TAIL ROTOR' : c.t, c]));
      const blink = (performance.now() % 500) < 250, w = 1024 / 5;
      actx.fillStyle = '#0a0b0a'; actx.fillRect(0, 0, 1024, 160);
      ANN.forEach((n, i) => {
        const c = lit.get(n), x = (i % 5) * w + 4, y = Math.floor(i / 5) * 80 + 4;
        actx.fillStyle = !c ? '#1d1f1c' : c.warn ? (blink ? '#ff2a1a' : '#5a0c06') : '#e8a010'; actx.fillRect(x, y, w - 8, 72);
        actx.fillStyle = c ? '#111' : '#6a6d66'; actx.font = 'bold 34px Consolas, monospace'; actx.textAlign = 'center'; actx.fillText(n, x + (w - 8) / 2, y + 48);
      });
      atex.needsUpdate = true;
    },
    press(id) { const s = switches.find(q => q.id === id); if (s) s.flash = 0.15; },
  };
}
