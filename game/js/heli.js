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
  BURN: 2.2,              // fuel %/s at full collective (idle burns 15% of that)
};

// --------------------------------------------------------------------------------------------- model
export function buildHeliMesh() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, ...o });
  const olive = M(0x55613d), dark = M(0x2b2f2a), glass = M(0x6fd0ff, { emissive: 0x0e3048, shininess: 80 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.55, 3.4), olive); cab.position.set(0, 0.1, 0.1);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 1.2, 8).rotateX(-Math.PI / 2).scale(1.25, 1, 1), glass); nose.position.set(0, 0.05, -2.15); nose.name = 'nose';
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.6), olive); roof.position.set(0, 1.05, 0.2);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, 4.6, 6).rotateX(Math.PI / 2), olive); boom.position.set(0, 0.45, 3.9);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.7), olive); fin.position.set(0, 1.0, 6.0); fin.rotation.x = -0.35;
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.4), olive); stab.position.set(0, 0.45, 5.1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), dark); mast.position.set(0, 1.5, 0.2);
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
    animate(rpm, dt, time) {
      rotor.rotation.y -= rpm * 38 * dt; tail.rotation.x += rpm * 110 * dt;
      disc.material.opacity = 0.32 * THREE.MathUtils.smoothstep(rpm, 0.35, 0.9);
      beacon.visible = (time % 1.2) < 0.12;
    },
  };
}

// --------------------------------------------------------------------------------------------- flight model
const _v = new THREE.Vector3(), _vb = new THREE.Vector3(), _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _dq = new THREE.Quaternion(), _e = new THREE.Euler();
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
    const driven = H.engine && env.fuel > 0;
    if (driven) H.rpm += (1.0 - H.rpm) * HELI.SPOOL * 2.2 * h + (H.rpm < 1 ? HELI.SPOOL * 0.15 * h : 0);
    else H.rpm += (-0.06 - 0.22 * ctl.coll + 0.05 * Math.max(0, -_vb.y)) * h;
    H.rpm = Math.min(1.05, Math.max(0, H.rpm));
    const auth = H.rpm * H.rpm;
    H.coll = ctl.coll;

    // ---- angular: rate command + coupling torques
    const att = H.attitude();
    let wx = ctl.cy * HELI.RATE.pitch, wz = -ctl.cx * HELI.RATE.roll, wy = -ctl.pedal * HELI.RATE.yaw;
    if (ctl.sas) {   // stability assist: hands-off it levels the disc and kills drift in the rates
      const hands = 1 - Math.min(1, Math.hypot(ctl.cx, ctl.cy) * 2.5);
      wx += -att.pitch * 1.6 * hands; wz += -att.roll * 1.6 * hands;
      wy += ctl.coll * HELI.TORQUE * 2.6 / (HELI.RESP * 0.8);   // auto pedal: exactly cancels the torque reaction in steady state
    }
    const k = HELI.RESP * auth * (H.landed ? 0.2 : 1);
    H.w.x += ((wx - H.w.x) * k + (-_vb.z) * 0.012) * h;                    // flapback: forward speed pitches the nose up
    H.w.z += ((wz - H.w.z) * k) * h;
    H.w.y += ((wy - H.w.y) * k * 0.8 - ctl.coll * HELI.TORQUE * auth * 2.6 - _vb.x * 0.035) * h;   // torque reaction, tail-fin weathervane
    if (H.landed) { H.w.x *= 0.5; H.w.z *= 0.5; }
    _dq.setFromEuler(_e.set(H.w.x * h, H.w.y * h, H.w.z * h, 'YXZ')); H.q.multiply(_dq).normalize();

    // ---- linear forces
    const gy = env.groundY(H.pos.x, H.pos.z);
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
    if (H.pos.y + HELI.SKID_Y * _up.y <= gy) {
      if (env.water) return 'water';
      const tilt = Math.acos(Math.min(1, _up.y));
      if (H.vel.y < -4.5 || hs > 6 || tilt > 0.42) return 'crash';
      H.landed = true; H.vel.set(0, 0, 0); H.w.set(0, H.w.y * 0.2, 0); settle(gy, 1);
      return 'land';
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
      const out = { cx: 0, cy: 0, pedal: 0, coll: 0, sas, fire: false, winch: false, start: false, source: 'KEYBOARD' };
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
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const frameM = M(0x2a2e28), panelM = M(0x1c1f1c), olive = M(0x4a5536);
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  // instrument panel + glare shield across the cabin, below the eye line
  box(1.5, 0.38, 0.05, panelM, 0.22, 0.04, -1.97, -0.35);
  box(1.66, 0.035, 0.16, frameM, 0.2, 0.25, -2.03, 0.05);
  // pedestal / centre console, floor
  box(0.34, 0.5, 0.7, panelM, 0, -0.18, -1.3);
  box(1.7, 0.05, 2.2, olive, 0, -0.5, -0.9);
  // door pillars, roof frame, centre post between the windscreens, overhead console
  box(0.06, 1.4, 0.06, frameM, 0.95, 0.35, -1.75, 0.35, 0, -0.12); box(0.06, 1.4, 0.06, frameM, -0.95, 0.35, -1.75, 0.35, 0, 0.12);
  box(0.05, 0.7, 0.05, frameM, 0, 0.75, -1.82, 0.45);
  box(1.7, 0.06, 0.06, frameM, 0, 1.0, -1.45); box(0.06, 0.06, 1.6, frameM, 0.84, 1.0, -0.7); box(0.06, 0.06, 1.6, frameM, -0.84, 1.0, -0.7);
  box(0.5, 0.08, 0.7, panelM, 0, 0.98, -0.95);
  box(0.06, 1.0, 0.06, frameM, 0.84, 0.45, -0.1); box(0.06, 1.0, 0.06, frameM, -0.84, 0.45, -0.1);
  // gauges
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const gauges = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.34), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  gauges.position.set(0.22, 0.045, -1.94); gauges.rotation.x = -0.35; g.add(gauges);
  // cyclic between the pilot's knees, collective by the left hand
  const stickPivot = new THREE.Group(); stickPivot.position.set(0.42, -0.45, -1.15); g.add(stickPivot);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 6), frameM); stick.position.y = 0.27; stickPivot.add(stick);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), M(0x111111)); grip.position.y = 0.56; stickPivot.add(grip);
  const collPivot = new THREE.Group(); collPivot.position.set(0.12, -0.4, -0.75); g.add(collPivot);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).rotateX(Math.PI / 2), frameM); lever.position.z = -0.3; collPivot.add(lever);
  const ctx = cv.getContext('2d'); let acc = 1;
  function dial(cx, label, val, max, unit, ticks = 10) {
    const cy = 128, r = 92;
    ctx.fillStyle = '#0b0d0b'; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#d8d8c8'; ctx.lineWidth = 3;
    for (let i = 0; i <= ticks; i++) { const a = -Math.PI * 1.25 + i / ticks * Math.PI * 1.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
    const a = -Math.PI * 1.25 + Math.min(1, Math.max(0, val / max)) * Math.PI * 1.5;
    ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); ctx.stroke();
    ctx.fillStyle = '#d8d8c8'; ctx.font = 'bold 22px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 46); ctx.font = 'bold 26px Consolas, monospace'; ctx.fillText(unit, cx, cy - 34);
  }
  function horizon(cx, pitch, roll) {
    const cy = 128, r = 96;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-roll); const off = pitch * 180;
    ctx.fillStyle = '#3a78c8'; ctx.fillRect(-200, -400 + off, 400, 400); ctx.fillStyle = '#7a5428'; ctx.fillRect(-200, off, 400, 400);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let p = -2; p <= 2; p++) if (p) { ctx.beginPath(); ctx.moveTo(-22, off - p * 30); ctx.lineTo(22, off - p * 30); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-200, off); ctx.lineTo(200, off); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 50, cy); ctx.lineTo(cx - 16, cy); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx + 16, cy); ctx.lineTo(cx + 50, cy); ctx.stroke();
  }
  return {
    group: g,
    update(H, ctl, dt, warn) {
      // levers follow the pilot's hands every frame; the gauges repaint at ~20 Hz
      stickPivot.rotation.set((ctl.cy || 0) * 0.3, 0, -(ctl.cx || 0) * 0.3); collPivot.rotation.x = (H.coll || 0) * 0.45;
      acc += dt; if (acc < 0.05) return; acc = 0;
      ctx.fillStyle = '#1c1f1c'; ctx.fillRect(0, 0, 1024, 256);
      const att = H.attitude(), ias = Math.hypot(H.vel.x, H.vel.z) * 1.944;
      dial(110, 'IAS kt', ias, 120, Math.round(ias));
      horizon(315, att.pitch, att.roll);
      dial(520, 'ALT m', Math.max(0, H.agl) % 100, 100, Math.max(0, Math.round(H.agl)));
      dial(720, 'VSI', H.vel.y + 10, 20, (H.vel.y >= 0 ? '+' : '') + H.vel.y.toFixed(1));
      dial(915, 'RPM / TQ', H.rpm, 1.1, Math.round(H.coll * 100) + '%');
      // compass strip + warnings across the top
      const hdg = ((H.heading() * 180 / Math.PI) + 360) % 360;
      ctx.fillStyle = '#000'; ctx.fillRect(412, 2, 200, 26); ctx.fillStyle = '#d8d8c8'; ctx.font = 'bold 20px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', 512, 22);
      if (warn) { ctx.fillStyle = (performance.now() % 500) < 250 ? '#ff3020' : '#601008'; ctx.fillRect(20, 4, 170, 24); ctx.fillStyle = '#fff'; ctx.fillText(warn, 105, 22); }
      tex.needsUpdate = true;
    },
  };
}
