// Turntable for the HORNET exterior model: sliders for every animated part. Query: ?ui=0&auto=0&cam=yaw,pitch,dist,tx,ty,tz&s={json state}
import * as THREE from 'three';
import { buildJetMesh, JET } from '../js/jetmodel.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb6d8);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(+(Q.get('fov') || 40), 1, 0.05, 5000);
// deck at the wheel-contact height
const deck = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c4045 })); deck.position.y = JET.GEAR.nose[1]; scene.add(deck);
const grid = new THREE.GridHelper(60, 60, 0x667080, 0x50565e); grid.position.y = JET.GEAR.nose[1] + 0.002; scene.add(grid);
const jet = buildJetMesh(1, Q.get('fsd') != null ? +Q.get('fsd') : undefined); scene.add(jet.group);   // ?fsd=0: the player's FSD #3, BuNo 160777
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
  renderer.render(scene, window.__ortho || camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__J = { jet, S, cam, camera, scene, renderer, JET, THREE, render: () => { jet.animate(S, 0, time, inside); renderer.render(scene, camera); } };
window.__T = window.__J;   // (tools/blueprint/pageshot.mjs waits for __T)

// ---- ?ref=side|top|front (ngc/look-units): orthographic view over the traced NASA three-view at its calibration
// (dev/ref/ copies of docs/ngc1980/reference/fa18a; the top view uses the mirrored copy, nose left, as the trace does),
// drawing lines in red (&refa= opacity); &sil=1 the model as a flat translucent silhouette; &mask=1 the airframe flat
// black on white for tools/blueprint/fit.mjs. Calibration (hornetgeo.js): 111.42 px/m; side nose px 959 (z -10.475),
// ground py 1685 (y -2.05); top' nose px 946, centre py 815; front centre px 2087, ground py 544.
const REF = Q.get('ref'), REFV = {
  side: { img: 'ref/fa18a-3view.png', W: 2865, H: 1760, map: (px, py) => [(px - 959) / 111.42 - 10.475, (1685 - py) / 111.42 - 2.05], view: [1, 0, 0], up: [0, 1, 0] },
  top: { img: 'ref/fa18a-3view-mirrored.png', W: 2865, H: 1760, map: (px, py) => [(px - 946) / 111.42 - 10.475, -(py - 815) / 111.42], view: [0, -1, 0], up: [1, 0, 0] },
  front: { img: 'ref/fa18a-3view.png', W: 2865, H: 1760, map: (px, py) => [-(px - 2087) / 111.42, (544 - py) / 111.42 - 2.05], view: [0, 0, 1], up: [0, 1, 0] },
}[REF];
if (REFV) {
  deck.visible = grid.visible = tip.visible = false; scene.background = new THREE.Color(0xf4f4ee);
  Object.assign(S, { gear: Q.get('gear') ? +Q.get('gear') : 1, lights: false, stores: { aam: [false, false], bomb: [false, false, false, false] } });
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
  // (the front view looks aft from ahead of the nose: the camera sits at -z)
  if (REF === 'front') { ortho.position.copy(ctr).add(new THREE.Vector3(0, 0, -60)); ortho.lookAt(ctr); plane.position.copy(ctr).add(new THREE.Vector3(0, 0, 30)); plane.quaternion.copy(ortho.quaternion); }
  const skip = /^(aim9|tyre|hub|noseStrut|noseSlider|noseAxle|mainStrut|mainBrace|mainOleo|mainAxle|launchBar|taxiLight|hookArm|hookShoe|navRed|navGreen|strobe|beacon|tailLight|formation|abOuter|abCore|shockDiamond|burnerFace|liner|tailCone|sideNumber|navyTitle|ejectWarning|insignia|finNumber|bunoFin|navyFin|wingStar|pylon|mk82)/;
  if (Q.get('mask') === '1') {
    plane.visible = false; scene.background = new THREE.Color(0xffffff);
    const bm = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    jet.group.traverse(o => { if (o.isMesh) o.material = bm; });
  }
  if (Q.get('sil') === '1') { const sm = new THREE.MeshBasicMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.55, depthWrite: false }); jet.group.traverse(o => { if (o.isMesh) o.material = sm; }); }
  // hide what the drawing does not have (gear legs: the NASA drawing floats the wheels; stores; lights) and the mid / far skins
  const hideSkip = () => jet.group.traverse(o => { if (skip.test(o.name) && !(Q.get('wheels') === '1' && /^(tyre|hub)/.test(o.name))) o.visible = false; if (o.name === 'skinLOD1' || o.name === 'skinLOD2') o.visible = false; });
  const an = jet.animate; jet.animate = (...a) => { an(...a); hideSkip(); };
  window.__ortho = ortho; renderer.setPixelRatio(1);
  const fsz = () => { renderer.setSize(innerWidth, innerHeight); }; addEventListener('resize', fsz); fsz();
  window.__J.camera = ortho; window.__J.render = () => { jet.animate(S, 0, time, inside); renderer.render(scene, ortho); };
}

// ---- ?ck=1 (ngc/look-units): the seat view, the cockpit module (jetcockpit.js) in the airframe, eye at JEYE;
// &look=yaw,pitch,fov looks round from the seat (shell hidden as in the game)
if (Q.get('ck') === '1') {
  const { buildJetCockpit, JEYE } = await import('../js/jetcockpit.js');
  const ck = buildJetCockpit(); ck.group.visible = true; jet.group.add(ck.group); inside = true;
  const [ly, lp, lf] = (Q.get('look') || '0,-0.25,70').split(',').map(Number);
  const eye = new THREE.PerspectiveCamera(lf, innerWidth / innerHeight, 0.02, 500); eye.position.copy(JEYE); eye.rotation.set(lp, ly, 0, 'YXZ'); jet.group.add(eye);
  addEventListener('resize', () => { eye.aspect = innerWidth / innerHeight; eye.updateProjectionMatrix(); });
  window.__ortho = eye; window.__J.ck = ck;
}
