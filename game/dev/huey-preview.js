// Turntable for the UH-1H (hueymodel.js: the hi-fi model with RenderKit surface on, the classic one with ?rk=0), with
// sun shadows, an optional cockpit (?ck=1 puts the camera at the pilot's eye) and LOD checks.
// Query: ?ui=0 &cam=yaw,pitch,dist,tx,ty,tz &s={json heliLook state} &ck=1 &ckyaw=rad &ckpitch=rad &ground=0
// window.__H = { huey, cockpit, S, cam, render(), stats }
import * as THREE from 'three';
import { buildHueyMesh, HUEY } from '../js/hueymodel.js';
import { buildHueyCockpit, HUEY_EYE, HUEY_EYE_PITCH } from '../js/hueycockpit.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); document.body.prepend(renderer.domElement);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cbcd8); scene.fog = new THREE.Fog(0x9cbcd8, 200, 1800);
scene.add(new THREE.HemisphereLight(0xc4dcf2, 0x56583e, 1.0));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(-14, 22, -9); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
const camera = new THREE.PerspectiveCamera(Number(Q.get('fov') || 35), 1, 0.05, 4000);
const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5d6150, roughness: 0.95 }));
ground.position.y = HUEY.GROUND; ground.receiveShadow = true; scene.add(ground);
if (Q.get('ground') === '0') ground.visible = false;
const t0 = performance.now();
const huey = buildHueyMesh(); scene.add(huey.group);
const buildMs = performance.now() - t0;
huey.group.traverse(o => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
let cockpit = null;
if (Q.get('ck') === '1') { cockpit = buildHueyCockpit(); huey.group.add(cockpit.group); cockpit.group.visible = true; }

const S = { nr: 1, run: true, n1: 0.95, tx: 0, ty: 0, coll: 0.3, ped: 0, cone: 0.05, rockets: 16, light: false, firing: false, aim: null, cargoDoor: 1 };
if (Q.get('s')) Object.assign(S, JSON.parse(Q.get('s')));
const cam = { yaw: 2.5, pitch: 0.15, dist: 20, t: new THREE.Vector3(0, 0.3, 1.0) };
if (Q.get('cam')) { const [y, p, d, x, yy, z] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); cam.t.set(x || 0, yy || 0, z || 0); }
const ck = { yaw: Number(Q.get('ckyaw') || 0), pitch: Number(Q.get('ckpitch') || HUEY_EYE_PITCH) };
if (Q.get('ui') === '0') document.getElementById('info').remove();

let drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (cockpit) { ck.yaw -= dx * 0.004; ck.pitch -= dy * 0.004; return; }
  if (drag.pan) { const r = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); cam.t.addScaledVector(r, -dx * cam.dist * 0.0015).addScaledVector(u, dy * cam.dist * 0.0015); }
  else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.006)); }
});
addEventListener('wheel', e => cam.dist *= Math.exp(e.deltaY * 0.001));
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

// a dummy panel snapshot for the cockpit (hot, at flight idle on the ground)
const PANEL = { avionics: 1, ac: true, volts: 28, amps: 30, ias: 0, alt: 40, vsi: 0, turn: 0, slip: 0, agl: 0, nr: 1, n2: 1, n1: 0.7, egt: 520, torque: 12, engOilP: 70, xmsnOilP: 50, engOilT: 70, xmsnOilT: 60,
  fuelLb: 1100, throttle: 1, masterCaution: false, rpmWarn: false, fire: false, cautions: [], hdg: 0.6, pitch: 0.02, roll: 0, hover: null,
  sw: { bat: true, gen: true, inv: true, engine: true, gov: 'AUTO', hyd: true, trim: true, sas: false, lowrpm: true, light: false, starter: false }, ctl: { cx: 0, cy: 0, coll: 0.1, pedal: 0 } };
let last = performance.now(), time = 0;
function place() {
  if (cockpit) {
    huey.group.updateMatrixWorld();
    camera.position.copy(HUEY_EYE).applyMatrix4(huey.group.matrixWorld); camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = ck.yaw; camera.rotation.x = ck.pitch; camera.near = 0.03; camera.updateProjectionMatrix();
  } else {
    camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t);
    camera.near = Math.max(0.05, cam.dist * 0.004); camera.far = 4000; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0); camera.lookAt(cam.t);
  }
}
function step(dt) {
  time += dt; huey.animate(S, dt, time, !!cockpit);
  if (cockpit) cockpit.update({}, dt, PANEL);
  place(); renderer.render(scene, camera);
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
window.__H = { huey, cockpit, S, cam, ck, camera, scene, renderer, THREE, HUEY, buildMs, PANEL,
  // render a settled frame (two passes so the LOD probe sees the camera)
  render: (dt = 0) => { step(dt); step(0); step(0); return true; } };
