// The SKY CARRIER's bridge: up in the island tower, glass all round, a ship's wheel, the speed telegraph and the
// lift lever, and a console of instruments. Taking the helm (Tab, parked on the deck) puts you on the bridge; the
// flight controls then work the ship - slowly: holding a key only nudges a lever along, and the ship answers the
// levers with all the hurry of a cathedral. V for the outside view, Tab to leave.
//   W / S (stick fwd/back): telegraph ahead / astern     A / D (stick): wheel
//   Space-Shift / Ctrl-Z (throttle lever): lift up / down - springs back to hold when you let go (a lever holds)
import * as THREE from 'three';
import { CARRIER } from './ships.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EYE = new THREE.Vector3(-0.2, 10.9, -1.9);   // in the tower's frame: standing at the wheel, looking forward
// QA (ngc/qa-ship): on the INTERIORS bridge you stand where the helmsman stood, at the spokes (he steps aside to port);
// from 1.1 m behind him the lee helmsman at the telegraph filled the right of the view
const EYE_IN = new THREE.Vector3(-0.2, 10.78, -2.9);
const KT = 1.944;

function buildBridge() {
  const g = new THREE.Group(), M = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o }), dark = M(0x23272c), steel = M(0x4c5560), wood = M(0x6b4a2a), brass = M(0xb08a3a);
  // QA (ngc/qa-ship): `room` is the stand-in bridge (shell, console, chart table, wheel, telegraph) for a carrier with
  // no INTERIORS bridge; with one, only the console face and the lift lever are added to it and its own wheel turns
  const room = new THREE.Group(); g.add(room);
  const box = (w, h, d, m, x, y, z, p = room) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
  // the room: floor, ceiling, sills and window frames (the tower's own walls are invisible from inside)
  box(4.8, 0.1, 9.6, M(0x3b3530), 0, 9.05, -1);                     // deck plates
  box(4.8, 0.1, 9.6, M(0x30353a), 0, 12.95, -1);                    // deckhead
  for (const [w, d, x, z] of [[4.8, 0.12, 0, -5.75], [4.8, 0.12, 0, 3.75], [0.12, 9.6, -2.4, -1], [0.12, 9.6, 2.4, -1]]) box(w, 0.9, d, steel, x, 9.5, z);   // sills
  for (const [w, d, x, z] of [[4.8, 0.12, 0, -5.75], [4.8, 0.12, 0, 3.75], [0.12, 9.6, -2.4, -1], [0.12, 9.6, 2.4, -1]]) box(w, 0.35, d, steel, x, 12.75, z);  // header
  for (let i = 0; i <= 4; i++) { const x = -2.4 + i * 1.2; box(0.08, 3, 0.08, dark, x, 11.4, -5.75); box(0.08, 3, 0.08, dark, x, 11.4, 3.75); }
  for (let i = 0; i <= 6; i++) { const z = -5.75 + i * 1.583; box(0.08, 3, 0.08, dark, -2.4, 11.4, z); box(0.08, 3, 0.08, dark, 2.4, 11.4, z); }
  // forward console with the instruments, and the chart table aft
  const con = box(4.4, 0.95, 0.9, dark, 0, 9.55, -5.1); const top = box(4.4, 0.08, 0.95, M(0x15181b), 0, 10.08, -5.05); top.rotation.x = 0.45;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: tex })); face.position.set(0, 10.14, -5.0); face.rotation.x = -Math.PI / 2 + 0.45; g.add(face);
  box(1.6, 0.9, 1.0, wood, 1.3, 9.5, 2.6); box(1.5, 0.04, 0.9, M(0xd8cfb0), 1.3, 9.97, 2.6);     // chart table + chart
  // the wheel: spokes and rim on a pedestal
  box(0.3, 0.8, 0.3, brass, -0.2, 9.45, -3.75);
  const wheel = new THREE.Group(); wheel.position.set(-0.2, 10.05, -3.6); room.add(wheel);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24), wood));
  for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.08, 0.03), wood); sp.rotation.z = i * Math.PI / 8; wheel.add(sp); }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10).rotateX(Math.PI / 2), brass));
  // speed telegraph (right of the wheel) and lift lever (left): handles on pivots
  const mkLever = (x, col, p) => {
    box(0.25, 0.6, 0.25, steel, x, 9.35, -3.85, p);
    const piv = new THREE.Group(); piv.position.set(x, 9.65, -3.85); p.add(piv);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), M(0x999999)); arm.position.y = 0.22; piv.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M(col)); knob.position.y = 0.46; piv.add(knob);
    return piv;
  };
  const tel = mkLever(0.75, 0xcc2a1e, room), lift = mkLever(-1.15, 0x2a8cdd, g);
  return { group: g, room, face, cv, tex, wheel, ownWheel: wheel, tel, lift };
}

function drawConsole(B, u, S, info) {
  const x = B.cv.getContext('2d'), W = 1024, H = 256;
  x.fillStyle = '#0d1013'; x.fillRect(0, 0, W, H);
  const gauge = (cx, label, val, min, max, txt, col = '#ffcc33') => {
    const cy = 120, r = 88;
    x.fillStyle = '#050607'; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill(); x.strokeStyle = '#555'; x.lineWidth = 3; x.stroke();
    x.strokeStyle = '#ccc'; x.lineWidth = 2; for (let i = 0; i <= 10; i++) { const a = -2.4 + i * 0.48; x.beginPath(); x.moveTo(cx + Math.sin(a) * r * 0.8, cy - Math.cos(a) * r * 0.8); x.lineTo(cx + Math.sin(a) * r * 0.94, cy - Math.cos(a) * r * 0.94); x.stroke(); }
    const a = -2.4 + clamp((val - min) / (max - min), 0, 1) * 4.8; x.strokeStyle = col; x.lineWidth = 5; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(a) * r * 0.75, cy - Math.cos(a) * r * 0.75); x.stroke();
    x.fillStyle = '#bbb'; x.font = 'bold 17px monospace'; x.textAlign = 'center'; x.fillText(label, cx, cy + 52); x.fillStyle = '#fff'; x.font = 'bold 24px monospace'; x.fillText(txt, cx, cy - 22);
  };
  gauge(100, 'ALT m', u.p.y, 0, 240, Math.round(u.p.y));
  gauge(290, 'CLIMB m/s', S.vy, -4, 4, S.vy.toFixed(1));
  gauge(480, 'SPEED kt', u.speed * KT, -10, 35, Math.round(u.speed * KT));
  // compass card
  { const cx = 670, cy = 120, r = 88, hd = ((-u.yaw * 180 / Math.PI) % 360 + 360) % 360;
    x.fillStyle = '#050607'; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill(); x.strokeStyle = '#555'; x.lineWidth = 3; x.stroke();
    x.save(); x.translate(cx, cy); x.rotate(-hd * Math.PI / 180); x.fillStyle = '#ddd'; x.font = 'bold 20px monospace'; x.textAlign = 'center';
    ['N', 'E', 'S', 'W'].forEach((t, i) => { x.save(); x.rotate(i * Math.PI / 2); x.fillText(t, 0, -r + 26); x.restore(); }); x.restore();
    x.fillStyle = '#ffcc33'; x.beginPath(); x.moveTo(cx, cy - r + 4); x.lineTo(cx - 8, cy - r + 20); x.lineTo(cx + 8, cy - r + 20); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 24px monospace'; x.fillText(String(Math.round(hd)).padStart(3, '0'), cx, cy + 8); x.fillStyle = '#bbb'; x.font = 'bold 17px monospace'; x.fillText('HEADING', cx, cy + 52); }
  // lever readouts + hull
  const bar = (yy, label, v, col) => { x.fillStyle = '#222'; x.fillRect(800, yy, 200, 26); x.fillStyle = col; const m = 900; x.fillRect(Math.min(m, m + v * 100), yy + 3, Math.abs(v * 100), 20); x.fillStyle = '#fff'; x.fillRect(m - 1, yy, 2, 26); x.font = 'bold 16px monospace'; x.textAlign = 'left'; x.fillText(label, 800, yy - 4); };
  bar(30, `TELEGRAPH ${S.telV >= 0 ? 'AHEAD' : 'ASTERN'} ${Math.round(Math.abs(S.telV) * 100)}%`, S.telV, '#f64');
  bar(86, `WHEEL ${S.helmV > 0.02 ? 'STBD' : S.helmV < -0.02 ? 'PORT' : 'MIDSHIPS'}`, S.helmV, '#fc4');
  bar(142, `LIFT ${S.liftV > 0.02 ? 'UP' : S.liftV < -0.02 ? 'DOWN' : 'HOLD'} ${Math.round(Math.abs(S.liftV) * 100)}%`, S.liftV, '#4af');
  x.fillStyle = u.hp / u.hpMax > 0.5 ? '#4f6' : '#f64'; x.font = 'bold 20px monospace'; x.textAlign = 'left'; x.fillText(`HULL ${Math.round(100 * u.hp / u.hpMax)}%`, 800, 210);
  if (info.low) { x.fillStyle = (performance.now() % 600) < 300 ? '#f43' : '#600'; x.fillText('LOW', 950, 210); }
  B.tex.needsUpdate = true;
}

export function createHelm(ctx) {
  const { war, say, groundY } = ctx;
  let B = null, carrier = null, active = false, view = 'bridge', drawT = 0;
  const cam = new THREE.Vector3(), look = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
  function attach(u) {
    if (carrier === u && B) return;
    B = buildBridge(); carrier = u; u.parts.tower.add(B.group); B.group.visible = false;
  }
  // QA (ngc/qa-ship): the INTERIORS bridge is there (its own deck, glass, console, wheel, helmsman): no second room,
  // wheel or telegraph on top of it (they z-fought and stood two wheels in front of you); the console face sits on
  // its console and its wheel is the one that turns
  function fit(u) {
    const IW = u.interior && u.interior.wheel;
    B.room.visible = !IW; B.wheel = IW || B.ownWheel;
    if (IW) { B.face.position.set(0, 10.12, -5.4); B.face.scale.set(0.56, 0.56, 1); B.face.rotation.x = -Math.PI / 2 + 0.7; }
    else { B.face.position.set(0, 10.14, -5.0); B.face.scale.set(1, 1, 1); B.face.rotation.x = -Math.PI / 2 + 0.45; }
  }
  const helm = {
    get active() { return active; },
    get bridgeView() { return active && view === 'bridge'; },
    canTake(heliLanded, onDeck) { const u = war.carrier; return !!(u && u.sky && u.sky.up && u.sinking === undefined && heliLanded && onDeck); },
    take() {
      const u = war.carrier; attach(u); active = true; view = 'bridge'; u.sky.manual = true; u.path = []; u.goal = null;
      u.sky.tel = u.sky.telV; u.sky.helmIn = u.sky.helmV; u.sky.lift = 0;
      say('ON THE BRIDGE  -  W/S TELEGRAPH  ·  A/D WHEEL  ·  SPACE/CTRL LIFT  ·  V VIEW  ·  TAB LEAVE', 4);
    },
    leave() {
      if (!active) return; active = false; if (B) B.group.visible = false; if (war.carrier && war.carrier.parts.band) war.carrier.parts.band.visible = true;
      const u = war.carrier; if (u && u.sky) { u.sky.manual = false; u.sky.hold = u.p.y; u.path = []; }
      say('HELM HANDED TO THE WATCH OFFICER  -  SHE HOLDS STATION (M TO SEND HER)', 2.5);
    },
    toggleView() { view = view === 'bridge' ? 'outside' : 'bridge'; say(view === 'bridge' ? 'BRIDGE' : 'OUTSIDE VIEW', 1); },
    // ctl from the helicopter input: cx (wheel), cy (telegraph: forward = ahead), coll (lift, keyboard or lever)
    update(dt, ctl, keys) {
      const u = war.carrier;
      if (!active) return;
      if (!u || !u.sky || !u.sky.up || u.sinking !== undefined) { helm.leave(); return; }
      const S = u.sky, kbd = ctl.source === 'KEYBOARD';
      // telegraph: held keys walk it along; it stays where you leave it
      S.tel = clamp(S.tel - (ctl.cy || 0) * 0.22 * dt, -0.35, 1);
      // wheel: held keys turn it, let go and it eases back towards midships
      if (Math.abs(ctl.cx || 0) > 0.05) S.helmIn = clamp(S.helmIn + ctl.cx * 0.5 * dt, -1, 1);
      else S.helmIn += clamp(-S.helmIn, -0.25 * dt, 0.25 * dt);
      // lift: keys push it up / down and it springs back to hold; a throttle lever sets it directly (centre = hold)
      if (kbd) {
        const up = keys.up ? 1 : 0, dn = keys.down ? 1 : 0;
        if (up || dn) S.lift = clamp(S.lift + (up - dn) * 0.45 * dt, -1, 1); else S.lift += clamp(-S.lift, -0.4 * dt, 0.4 * dt);
      } else S.lift = clamp(((ctl.coll ?? 0.5) - 0.5) * 2.2, -1, 1);
      if (B) {
        B.wheel.rotation.z = -S.helmV * 2.6; B.tel.rotation.x = -S.telV * 0.7; B.lift.rotation.x = -S.liftV * 0.7;
        if ((drawT -= dt) <= 0 && B.group.visible) { drawT = 0.1; drawConsole(B, u, S, { low: u.p.y - Math.max(0, groundY(u.p.x, u.p.z)) < 12 && u.p.y > 1 }); }
      }
    },
    camera(camA, dt, head) {
      const u = war.carrier;
      B.group.visible = view === 'bridge'; if (u.parts.band) u.parts.band.visible = view !== 'bridge'; fit(u);
      if (view === 'bridge') {
        u.mesh.updateMatrixWorld();
        camA.position.copy(u.interior && u.interior.wheel ? EYE_IN : EYE).applyMatrix4(u.parts.tower.matrixWorld);
        u.mesh.getWorldQuaternion(_q);
        camA.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(-0.2 + (head?.pitch || 0), head?.yaw || 0, 0, 'YXZ')));
        cam.copy(camA.position); return;
      }
      // outside: well back and up, so the whole ship and its fans are in view
      const fx = -Math.sin(u.yaw), fz = -Math.cos(u.yaw), k = 1 - Math.exp(-2 * dt);
      _v.set(u.p.x - fx * 150 + fz * 60, u.p.y + 55, u.p.z - fz * 150 - fx * 60);
      if (cam.lengthSq() === 0) cam.copy(_v);
      cam.lerp(_v, k); cam.y = Math.max(cam.y, groundY(cam.x, cam.z) + 4); look.set(u.p.x, u.p.y + 8, u.p.z);
      camA.position.copy(cam); camA.lookAt(look);
    },
    status() {
      const u = war.carrier; if (!active || !u) return '';
      const S = u.sky;
      return `HELM  ·  ${Math.round(u.p.y)}m  ·  ${Math.round(u.speed * KT)}kt  ·  TELEGRAPH ${Math.round(S.telV * 100)}%  ·  WHEEL ${Math.round(S.helmV * 100)}  ·  LIFT ${S.liftV > 0.02 ? 'UP' : S.liftV < -0.02 ? 'DOWN' : 'HOLD'}  ·  V VIEW  ·  TAB LEAVE`;
    },
  };
  return helm;
}
