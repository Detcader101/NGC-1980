// Turntable / lineup for the RUNAWAY ground models, driven by their real sims.
// Query: ?unit=strider|hover|m1|t90|lineup  &walk=speed  &cam=yaw,pitch,dist,tx,ty,tz  &ui=0  &weapon=coil  &auto=1
// drag: orbit, wheel: zoom, shift-drag: pan. window.__RW = { scene, camera, units, cam, render(), THREE }
import * as THREE from 'three';
import { createStrider, flatEnv } from '../js/units/runaway/strider.js';
import { buildStrider } from '../js/units/runaway/stridermodel.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9db7c9); scene.fog = new THREE.Fog(0x9db7c9, 60, 220);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 600);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5d6b45 })); scene.add(ground);
const grid = new THREE.GridHelper(200, 200, 0x46523a, 0x52603f); grid.position.y = 0.003; scene.add(grid);
const env = flatEnv(0);

const unit = Q.get('unit') || 'strider';
const units = [];
async function addStrider(x, z, yaw, weapon) {
  const S = createStrider({ id: units.length }); S.place(x, z, yaw, env);
  const M = buildStrider({ weapon, tag: 'R1-0' + (units.length + 1) }); scene.add(M.group);
  units.push({ kind: 'strider', S, M, x, z, yaw });
}
if (unit === 'strider') addStrider(0, 0, 0, Q.get('weapon') || 'xm7');
if (unit === 'lineup') { addStrider(-1.2, 0, 0, 'xm7'); addStrider(1.2, 0, 0.6, 'coil'); }
const walk = +(Q.get('walk') || 0);

const cam = { yaw: 0.6, pitch: 0.2, dist: 6, t: new THREE.Vector3(0, 1.1, 0) };
if (Q.get('cam')) { const [y, p, d, x, yy, z] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); cam.t.set(x || 0, yy ?? 1.1, z || 0); }
let auto = Q.get('auto') === '1', follow = Q.get('follow') !== '0';
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) { const r = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), u = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1); cam.t.addScaledVector(r, -dx * cam.dist * 0.0015).addScaledVector(u, dy * cam.dist * 0.0015); }
  else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.006)); }
});
addEventListener('wheel', e => cam.dist *= Math.exp(e.deltaY * 0.001));
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

let last = performance.now(), time = 0;
const cmd = { vx: 0, vz: 0 };
function step(dt) {
  time += dt;
  for (const u of units) {
    if (u.kind === 'strider') {
      cmd.vx = 0; cmd.vz = -walk; cmd.run = walk > 1.7;
      u.S.step(dt, cmd, env); u.M.update(u.S, dt, time);
    }
  }
}
function render() {
  if (auto) cam.yaw += 0.005;
  const tgt = cam.t.clone(); if (follow && units[0] && walk) { tgt.x += units[0].S.c[0]; tgt.z += units[0].S.c[2]; }
  camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(tgt);
  camera.lookAt(tgt); renderer.render(scene, camera);
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!window.__RW.paused) step(dt); render();
  requestAnimationFrame(frame);
}
step(0.5);
requestAnimationFrame(frame);
window.__RW = { scene, camera, units, cam, THREE, render, step, paused: false };
