// Turntable for the HORNET exterior model: sliders for every animated part. Query: ?ui=0&auto=0&cam=yaw,pitch,dist,tx,ty,tz&s={json state}
import * as THREE from 'three';
import { buildJetMesh, JET } from '../js/jetmodel.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb6d8);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
// deck at the wheel-contact height
const deck = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c4045 })); deck.position.y = JET.GEAR.nose[1]; scene.add(deck);
const grid = new THREE.GridHelper(60, 60, 0x667080, 0x50565e); grid.position.y = JET.GEAR.nose[1] + 0.002; scene.add(grid);
const jet = buildJetMesh(1); scene.add(jet.group);
const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff00ff })); scene.add(tip);

const S = { stab: 0, stabDiff: 0, ail: 0, rud: 0, flap: 0, lef: 0, brake: 0, gear: 1, hook: 0, canopy: 0, steer: 0, wow: [0, 0, 0], launchBar: false,
  n: [0.7, 0.7], nozzle: [0.5, 0.5], ab: [0, 0], lights: true, stores: { aam: [true, true], bomb: [true, true, true, true] } };
if (Q.get('s')) Object.assign(S, JSON.parse(Q.get('s')));
const cam = { yaw: 0.7, pitch: 0.35, dist: 24, t: new THREE.Vector3(0, 0, 0) };
if (Q.get('cam')) { const [y, p, d, x, yy, z] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); cam.t.set(x || 0, yy || 0, z || 0); }
let auto = Q.get('auto') === '1', inside = false;

// ---- UI
const ui = document.getElementById('ui'); if (Q.get('ui') === '0') ui.classList.add('hide'), document.getElementById('info').remove();
const row = (label, el) => { const l = document.createElement('label'); l.textContent = label; l.appendChild(el); ui.appendChild(l); return el; };
function slider(label, get, set, min, max, step = 0.01) {
  const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
  r.oninput = () => set(+r.value); row(label, r);
}
function toggle(label, get, set) { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = get(); c.onchange = () => set(c.checked); row(label, c); }
for (const [k, mn, mx] of [['stab', -0.42, 0.42], ['stabDiff', -0.1, 0.1], ['ail', -0.44, 0.44], ['rud', -0.52, 0.52], ['flap', 0, 1], ['lef', 0, 1], ['brake', 0, 1], ['gear', 0, 1], ['hook', 0, 1], ['canopy', 0, 1], ['steer', -1.2, 1.2]])
  slider(k, () => S[k], v => S[k] = v, mn, mx);
['nose', 'mainL', 'mainR'].forEach((n, i) => slider('wow ' + n, () => S.wow[i], v => S.wow[i] = v, 0, 0.3));
['L', 'R'].forEach((n, i) => { slider('rpm ' + n, () => S.n[i], v => S.n[i] = v, 0, 1.05); slider('nozzle ' + n, () => S.nozzle[i], v => S.nozzle[i] = v, 0, 1); slider('AB ' + n, () => S.ab[i], v => S.ab[i] = v, 0, 1); });
toggle('launchBar', () => S.launchBar, v => S.launchBar = v); toggle('lights', () => S.lights, v => S.lights = v);
toggle('AIM-9 L', () => S.stores.aam[0], v => S.stores.aam[0] = v); toggle('AIM-9 R', () => S.stores.aam[1], v => S.stores.aam[1] = v);
for (let i = 0; i < 4; i++) toggle('Mk-82 ' + i, () => S.stores.bomb[i], v => S.stores.bomb[i] = v);
toggle('inside (hide shell)', () => inside, v => inside = v); toggle('turntable', () => auto, v => auto = v);
toggle('deck', () => deck.visible, v => deck.visible = grid.visible = v);

// ---- orbit
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
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (auto) cam.yaw += dt * 0.3;
  camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t);
  camera.lookAt(cam.t);
  jet.animate(S, dt, time, inside); jet.hookTip(tip.position);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__J = { jet, S, cam, camera, scene, renderer, JET, THREE, render: () => { jet.animate(S, 0, time, inside); renderer.render(scene, camera); } };
