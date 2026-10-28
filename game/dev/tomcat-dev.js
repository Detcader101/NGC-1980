// TOMCAT cockpit and model preview: the player's F-14A cockpits (units/air/tomcatcockpit.js) on the exterior model,
// driven by sliders instead of a flight (attitude, speed, Mach, AoA, g, sweep, engines, gear...). Pilot or RIO seat,
// or an orbit of the outside. Query: ?ui=0  ?seat=0|1  ?view=cockpit|orbit  ?look=yaw,pitch  ?s={json state}
import * as THREE from 'three';
import { createTomcatSim, loadout, cadcSweep } from '../js/units/air/tomcatfm.js';
import { buildTomcatModel as buildNew } from '../js/units/air/tomcatmodel.js';
import { buildTomcatModel as buildLegacy } from './legacy/tomcatmodel-legacy.js';   // ?legacy=1: the model before ngc/look-tomcat (evidence)
import { buildTomcatCockpit, TEYE, CAUTS } from '../js/units/air/tomcatcockpit.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb6d8); scene.fog = new THREE.Fog(0x8fb6d8, 400, 3000);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x24507a })); scene.add(sea);
for (let i = 0; i < 30; i++) { const isl = new THREE.Mesh(new THREE.ConeGeometry(60 + Math.random() * 120, 40 + Math.random() * 80, 7), new THREE.MeshLambertMaterial({ color: 0x4f7a34, flatShading: true })); isl.position.set((Math.random() - 0.5) * 5000, 10, (Math.random() - 0.5) * 5000); scene.add(isl); }
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 6000);

const A = createTomcatSim(9); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 600, speed: 120 }); A.stores = loadout('cap');
const model = (Q.get('legacy') === '1' ? buildLegacy : buildNew)(1, { modex: 200 }), cockpit = buildTomcatCockpit(); model.group.add(cockpit.group); scene.add(model.group);
const crew = []; model.group.traverse(o => { if (['helmet', 'visor', 'torso', 'seatBack', 'headbox', 'glareshield', 'rioPanel'].includes(o.name)) crew.push(o); });
const X = {   // the state the sliders drive
  pitch: 3, roll: 0, hdg: 40, kias: 330, alt: 600, aoa: 6, nz: 1, sweep: -1, rpm: 92, ab: 0, gear: 0, flap: 0, hook: 0, canopy: 0, fuel: 9000,
  stick: 0, rollStick: 0, thr: 0.78, seat: +(Q.get('seat') || 0), view: Q.get('view') || 'cockpit', mode: 'CRUISE', wpn: 'SP', tracks: 4, lock: true,
  cautions: 'BINGO,L INLET', mc: true, stall: false, fire: false, wheels: false, altLow: false, launch: false, hsd: 'NAV', yaw: 0, look: -0.14,
};
if (Q.get('s')) Object.assign(X, JSON.parse(Q.get('s')));
if (Q.get('look')) { const [y, p] = Q.get('look').split(',').map(Number); X.yaw = y; X.look = p; }
const ui = document.getElementById('ui'); if (Q.get('ui') === '0') ui.classList.add('hide'), document.getElementById('info').remove();
const row = (label, el) => { const l = document.createElement('label'); l.textContent = label; l.appendChild(el); ui.appendChild(l); return el; };
const slider = (k, min, max, step = 0.01) => { const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = X[k]; r.oninput = () => X[k] = +r.value; row(k, r); };
const toggle = k => { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!X[k]; c.onchange = () => X[k] = c.checked; row(k, c); };
const select = (k, opts) => { const s = document.createElement('select'); for (const o of opts) s.add(new Option(o, o)); s.value = X[k]; s.onchange = () => X[k] = isNaN(+s.value) ? s.value : +s.value; row(k, s); };
select('view', ['cockpit', 'orbit']); select('seat', ['0', '1']); select('mode', cockpit.MODES); select('wpn', ['SW', 'SP', 'PH', 'GUN']); select('hsd', ['NAV', 'TID']);
for (const [k, a, b, s] of [['pitch', -60, 60, 0.5], ['roll', -180, 180, 1], ['hdg', 0, 360, 1], ['kias', 0, 800, 1], ['alt', 0, 5000, 10], ['aoa', -5, 30, 0.1], ['nz', -3, 9, 0.1], ['sweep', -1, 75, 1], ['rpm', 0, 105, 1], ['ab', 0, 1], ['gear', 0, 1], ['flap', 0, 1], ['hook', 0, 1], ['canopy', 0, 1], ['fuel', 0, 16200, 10], ['stick', -1, 1], ['rollStick', -1, 1], ['thr', 0, 1], ['tracks', 0, 8, 1], ['yaw', -2.5, 2.5], ['look', -1.1, 0.8]]) slider(k, a, b, s);
for (const k of ['lock', 'mc', 'stall', 'fire', 'wheels', 'altLow', 'launch']) toggle(k);
let drag = null; const orbit = { yaw: 0.8, pitch: 0.3, dist: 34 };
if (Q.get('cam')) { const [y, p, d] = Q.get('cam').split(',').map(Number); Object.assign(orbit, { yaw: y, pitch: p, dist: d }); X.view = 'orbit'; }
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (X.view === 'orbit') { orbit.yaw -= dx * 0.006; orbit.pitch += dy * 0.006; } else { X.yaw -= dx * 0.004; X.look -= dy * 0.004; } });
addEventListener('wheel', e => orbit.dist *= Math.exp(e.deltaY * 0.001));
function size() { let w = innerWidth, h = innerHeight; if (window.__ortho) { const o = window.__ortho, a = (o.right - o.left) / (o.top - o.bottom); if (w / h > a) w = Math.round(h * a); else h = Math.round(w / a); } renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

const D2R = Math.PI / 180, _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const ctl = { pitch: 0, roll: 0, yaw: 0, throttle: [0, 0], brakeL: 0, brakeR: 0 };
const fake = [];   // RUNAWAY tracks for the TID / DDD / HUD
function hudState() {
  const tracks = [];
  for (let i = 0; i < X.tracks; i++) {
    const r = 900 + i * 650, az = (i % 2 ? 1 : -1) * (8 + i * 9) * D2R, brg = A.heading() + az;
    const p = fake[i] || (fake[i] = new THREE.Vector3()); p.set(A.pos.x + Math.sin(brg) * r, A.pos.y + 40 * i, A.pos.z - Math.cos(brg) * r);
    tracks.push({ u: { p }, n: 11 + i * 3, range: r, az, el: 0.02, brg, ship: i === 3, alt: String(Math.round(p.y * 3.28 / 100)).padStart(3, '0'), name: i === 3 ? 'KRAKEN' : 'RW-4 SHRIKE', hooked: i === 0, locked: i === 0 && X.lock, vrel: { hdg: brg + Math.PI, spd: 160 } });
  }
  const t0 = tracks[0];
  return {
    seat: X.seat, power: true, flicker: false, avionics: 1, mode: X.mode, arm: true, wpn: X.wpn, count: 2, agl: A.pos.y, bingo: 3000,
    tgt: t0 ? { pos: t0.u.p, range: t0.range, lock: X.lock, shoot: X.lock } : null,
    seeker: X.wpn === 'SW' ? { dir: A.forward(new THREE.Vector3()), locked: false } : null, pipper: null,
    carrier: { pos: new THREE.Vector3(A.pos.x + 1500, 8, A.pos.z - 800), dist: 1700, brg: 2.05, icls: X.mode === 'LDG' ? { gs: 0.4, loc: -0.8 } : null },
    tracks, lock: X.lock, tidRange: cockpit.tidRange, wpt: { name: 'FORGE', brg: 0.6, dist: 2600 },
    cautions: X.cautions.split(',').filter(Boolean), masterCaution: X.mc, fire: [X.fire, false], lights: true, pbrake: false, hover: null,
    sweep: { mode: X.sweep >= 0 ? 'EMER' : 'AUTO', cmd: X.sweep >= 0 ? X.sweep : cadcSweep(A.mach), handle: X.sweep >= 0 ? X.sweep : 20, thumb: 0 },
    afcs: 'ATT', sas: true, hsdMode: X.hsd, gmax: Math.max(1, X.nz) + 1.4, gmin: -0.8,
    rwr: [{ brg: 0.4, r: 0.5, sym: 'S', lock: true, launch: false }, { brg: -2.2, r: 0.8, sym: 'R', lock: false, launch: false }, ...(X.launch ? [{ brg: 0.3, r: 0.3, sym: 'M', lock: true, launch: true }] : [])],
    rwrLaunch: X.launch, wheels: X.wheels, altLow: X.altLow, shaker: 0, stalled: [X.stall, false], stallCue: X.stall ? 'L STALL' : null, stbyOff: false,
  };
}
let last = performance.now(), time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  // the sim's state from the sliders (not flown: a still picture of any flight condition)
  A.q.setFromEuler(_e.set(X.pitch * D2R, -X.hdg * D2R, -X.roll * D2R, 'YXZ'));
  const eas = X.kias / 1.94384, rho = 4.9 * Math.exp(-X.alt / 6000), tas = eas * Math.sqrt(1.225 / rho);
  A.pos.set(0, X.alt, 0); A.vel.set(0, 0, -tas).applyQuaternion(_q.setFromEuler(_e.set((X.pitch - X.aoa) * D2R, -X.hdg * D2R, 0, 'YXZ')));
  A.eas = eas; A.tas = tas; A.mach = tas / 170; A.alpha = X.aoa * D2R; A.nz = X.nz; A.nzMax = Math.max(1, X.nz) + 1.4; A.nzMin = -0.8;
  A.sweep = X.sweep >= 0 ? X.sweep : cadcSweep(A.mach); A.gear = A.gearCmd = X.gear; A.flapSel = X.flap > 0.5 ? 2 : 0; A.surf.flap = X.flap; A.surf.lef = X.flap * 0.85; A.hook = A.hookCmd = X.hook; A.canopy = X.canopy; A.fuel = X.fuel / 2.20462;
  A.onGround = false; A.vane = A.mach > 1.4 ? 1 : 0;
  for (const [k, e] of A.eng.entries()) { e.n = X.rpm / 100; e.ab = X.ab; e.egt = 420 + 360 * Math.max(0, (e.n - 0.68) / 0.32) + 60 * X.ab + (X.stall && !k ? 260 : 0); e.ff = 0.09 + 0.98 * Math.max(0, (e.n - 0.6) / 0.4) ** 2 + 6.2 * X.ab; e.nozzle = X.ab > 0.01 ? 0.3 + 0.7 * X.ab : 0.75 - 0.65 * Math.max(0, Math.min(1, (e.n - 0.68) / 0.32)); e.oil = 25 + 70 * Math.max(0, (e.n - 0.2) / 0.8); e.run = e.n > 0.5; e.stalled = X.stall && !k; }
  ctl.pitch = X.stick; ctl.roll = X.rollStick; ctl.throttle[0] = ctl.throttle[1] = X.thr;
  const inside = X.view === 'cockpit';
  model.group.position.copy(A.pos); model.group.quaternion.copy(A.q); A.lights = true; model.animate(A, dt, time, inside);
  for (const m of crew) m.visible = !inside;
  cockpit.group.visible = inside;
  if (inside) {
    cockpit.update(A, ctl, dt, hudState());
    const lean = Math.min(1, Math.max(0, (Math.abs(X.yaw) - 0.9) / 1.4));   // as tomcatplay.js cockpitCam: lean out to look back
    const E = TEYE[X.seat].clone().add(_v.set(-Math.sign(X.yaw) * 0.27 * lean, 0.07 * lean, 0.38 * Math.min(1, Math.max(0, (Math.abs(X.yaw) - 1.6) / 0.9)))); camera.position.copy(E).applyQuaternion(A.q).add(A.pos);
    camera.quaternion.copy(A.q).multiply(_q.setFromEuler(_e.set(X.look + (X.seat ? -0.16 : 0), X.yaw + Math.sign(X.yaw) * 0.6 * Math.max(0, Math.abs(X.yaw) - 1.9), 0, 'YXZ'))); camera.near = 0.05;
  } else {
    camera.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(orbit.yaw) * Math.cos(orbit.pitch)).multiplyScalar(orbit.dist).add(A.pos);
    camera.lookAt(A.pos); camera.near = 0.5;
  }
  camera.updateProjectionMatrix();
  renderer.render(scene, window.__ortho || camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__T = { A, X, cockpit, model, CAUTS };

// ---- ?ref=side|top|front (ngc/look-tomcat): orthographic view over the traced drawing at its calibration (dev/ref/,
// copies of docs/ngc1980/reference/f14a: NASA TP-2769 fig. 2a squared, CR-163098 fig. 4), drawing lines in red
// (&refa= opacity); &sil=1 the model as a flat translucent silhouette; &mask=1 the airframe flat black on white for
// tools/blueprint/fit.mjs. The top view is the drawing's lower half (wings at 68 deg): ?ref=top&sweep=68.
// Calibration (px): side/top x 389 = nose (z -11.152), 74.36 px/m; side y 2168 = FRL (y -0.436); top centre line y 1035;
// front 72.11 px/m, centre x 1527, wing plane y 871.5 (= y -0.19, as the side view).
const REF = Q.get('ref'), REFV = {
  side: { img: 'ref/f14a-3view.png', W: 2273, H: 3160, map: (px, py) => [(px - 389) / 74.36 - 11.152, (2168 - py) / 74.36 - 0.436], view: [1, 0, 0], up: [0, 1, 0] },
  top: { img: 'ref/f14a-3view.png', W: 2273, H: 3160, map: (px, py) => [(px - 389) / 74.36 - 11.152, -(py - 1035) / 74.36], view: [0, -1, 0], up: [1, 0, 0] },
  front: { img: 'ref/f14a-front.png', W: 3050, H: 3925, map: (px, py) => [-(px - 1529.2) / 72.11, (871.5 - py) / 72.11 - 0.19], view: [0, 0, 1], up: [0, 1, 0] },
}[REF];
if (REFV) {
  sea.visible = false; scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'ConeGeometry') o.visible = false; });
  scene.background = new THREE.Color(0xf4f4ee); scene.fog = null; X.view = 'orbit'; X.gear = Q.get('gear') ? +Q.get('gear') : 0; X.sweep = Q.get('sweep') ? +Q.get('sweep') : (REF === 'top' ? 68 : 20); X.flap = 0; X.ab = 0; X.rpm = 70;
  A.stores = []; model.group.userData.lockLod = 0;
  const { W, H } = REFV, [a0, b0] = REFV.map(0, 0), [a1, b1] = REFV.map(W, H);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const tex = new THREE.TextureLoader().load(REFV.img); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, k: { value: Number(Q.get('refa') || 0.85) } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float k; varying vec2 vUv; void main(){ float l = dot(texture2D(map, vUv).rgb, vec3(0.333)); gl_FragColor = vec4(0.9, 0.05, 0.05, (1.0 - smoothstep(0.35, 0.75, l)) * k); }' });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.renderOrder = 99; plane.frustumCulled = false; scene.add(plane);
  const Vd = new THREE.Vector3(...REFV.view), U = new THREE.Vector3(...REFV.up), Rt = new THREE.Vector3().crossVectors(Vd, U);
  const at = (a, b) => REF === 'side' ? new THREE.Vector3(0, b, a) : REF === 'front' ? new THREE.Vector3(a, b, 0) : new THREE.Vector3(b, 0, a);
  const c00 = at(a0, b0), c11 = at(a1, b1), ctr = c00.clone().add(c11).multiplyScalar(0.5);
  const w = Math.abs(c11.clone().sub(c00).dot(Rt)), h = Math.abs(c11.clone().sub(c00).dot(U));
  ortho.position.copy(ctr).addScaledVector(Vd, -60); ortho.up.copy(U); ortho.lookAt(ctr);
  ortho.left = -w / 2; ortho.right = w / 2; ortho.top = h / 2; ortho.bottom = -h / 2; ortho.updateProjectionMatrix();
  plane.scale.set(w, h, 1); plane.position.copy(ctr).addScaledVector(Vd, -30); plane.quaternion.copy(ortho.quaternion);
  const dA = Rt.dot(at(a1, b0).sub(at(a0, b0))), dB = U.dot(at(a0, b0).sub(at(a0, b1)));
  tex.repeat.set(dA > 0 ? 1 : -1, dB > 0 ? 1 : -1); tex.offset.set(dA > 0 ? 0 : 1, dB > 0 ? 0 : 1); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // the model at the drawing's origin, level (frame() places it at A.pos with the sliders' attitude)
  X.pitch = 0; X.roll = 0; X.hdg = 0; A.pos.set(0, 0, 0);
  Object.defineProperty(X, 'alt', { get: () => 0, set: () => {} });
  if (Q.get('mask') === '1') {
    plane.visible = false; scene.background = new THREE.Color(0xffffff);
    const skip = /^(aim|pitot|shockDiamond|abOuter|abCore|navLight|strobe|beacon|tailLight|formation|launchBar|taxiLight|burnerFace|liner|tailCone|helmet|visor|torso|seatBack|headbox|glareshield|rioPanel|modex|insignia|navy|rescue|wingStar|wingNavy|tailArt|walkway|alq100|noseDoor|gearDoor|uhfBlade|tacanBlade|aoaProbe|probeDoor|gunVent|gunMuzzle|fuelDump)/;   // (protrusions the wind-tunnel model does not have)
    const bm = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    model.group.traverse(o => { if (!o.isMesh) return; if (skip.test(o.name)) o.visible = false; else o.material = bm; });
    const an = model.animate; model.animate = (...a) => { an(...a); model.group.traverse(o => { if (o.isMesh && skip.test(o.name)) o.visible = false; }); };
  }
  if (Q.get('sil') === '1') { const sm = new THREE.MeshBasicMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.55, depthWrite: false }); model.group.traverse(o => { if (o.isMesh) o.material = sm; }); }
  window.__ortho = ortho; size();
  window.__T.ref = { REF, W, H };
}
