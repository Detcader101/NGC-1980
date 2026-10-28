// Turntable for the UH-1H (hueymodel.js: the hi-fi model with RenderKit surface on, the classic one with ?rk=0), with
// sun shadows, an optional cockpit (?ck=1 puts the camera at the pilot's eye) and LOD checks.
// Query: ?ui=0 &cam=yaw,pitch,dist,tx,ty,tz &s={json heliLook state} &ck=1 &ckyaw=rad &ckpitch=rad &ground=0
// window.__H = { huey, cockpit, S, cam, render(), stats }
import * as THREE from 'three';
import '../js/heli.js';   // first: heli.js <-> hueycockpit.js are circular, the game enters through heli.js
import { buildHueyMesh, HUEY } from '../js/hueymodel.js';
import { buildHueyCockpit, HUEY_EYE, HUEY_EYE_PITCH } from '../js/hueycockpit.js';
import { TROOP_SEATS, DOOR_PLACES } from '../js/hueycabin.js';
import { crewGeometry, crewMaterial } from '../js/interiors/crewfig.js';

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
if (Q.get('rot')) { const [rx, ry, rz] = Q.get('rot').split(',').map(Number); huey.group.rotation.set(rx || 0, ry || 0, rz || 0, 'YXZ'); }   // attitude (pitch, yaw, roll), e.g. to match a photo
const buildMs = performance.now() - t0;
huey.group.traverse(o => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
// &troops=1: seated Marines in every troop seat and both doorway places (the player's seat anchors, hueycabin.js)
if (Q.get('troops') === '1') {
  const geo = crewGeometry('marine', 'seated', { arms: 'rifle', seed: 4 }), mat = crewMaterial();
  for (const T of [...TROOP_SEATS, ...DOOR_PLACES]) { const m = new THREE.Mesh(geo, mat); m.position.set(T.x, T.kind === 'door' ? -1.05 : -0.58, T.z); m.rotation.y = T.yaw + Math.PI; m.name = 'troop'; huey.group.add(m); }
}
// &checker=1: every baked (UV-mapped) surface shows a 16 x 16 checker instead of its paint: texel density and seams
if (Q.get('checker') === '1') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { c.fillStyle = (i + j) % 2 ? '#e8e8e0' : '#c03020'; c.fillRect(i * 32, j * 32, 32, 32); }
  c.fillStyle = '#103080'; c.font = 'bold 20px sans-serif'; for (let i = 0; i < 16; i += 4) for (let j = 0; j < 16; j += 4) c.fillText('F' + i + j, i * 32 + 2, j * 32 + 22);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(8, 8);
  huey.group.traverse(o => { if (o.isMesh && o.material && o.material.map && !Array.isArray(o.material)) { o.material = o.material.clone(); o.material.map = tex; o.material.alphaTest = 0; o.material.bumpMap = null; o.material.roughnessMap = null; o.material.needsUpdate = true; } });
}
let cockpit = null;
if (Q.get('ck') === '1' || Q.get('ck') === '2') { cockpit = buildHueyCockpit(); huey.group.add(cockpit.group); cockpit.group.visible = true; }

const S = { nr: 1, run: true, n1: 0.95, tx: 0, ty: 0, coll: 0.3, ped: 0, cone: 0.05, rockets: 16, light: false, firing: false, aim: null, cargoDoor: 1 };
if (Q.get('s')) Object.assign(S, JSON.parse(Q.get('s')));
if (Q.get('psi')) huey.animate({ ...S, nr: 1 }, Number(Q.get('psi')) / HUEY.OMEGA, 0, false);   // rotor phase (rad), e.g. to keep a blade off the cabin in a still
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
// ---- ?ref=side|front|top: orthographic view over the TM 55-1520-210-10 principal-dimensions figure (public domain,
// dev/ref/uh1-tm-3view.png, 1970 x 1586 px). Calibration (px): side view nose x 460 / tail x 1731 = 41 ft 5.0 in, ground
// y 1503, main rotor hub 11 ft 8.65 in aft of the nose; front view skid track 695..955.5 = 8 ft 6.6 in, centre x 825,
// ground y 909.5; top view hub x 829, tail x 1734.5, centre line y 214.5. The drawing's lines are drawn over the model
// in red (&refa= opacity), &sil=1 draws the model as a flat silhouette.
const REF = Q.get('ref'), REFV = {
  side: { s: 100.68, map: (px, py) => [(px - 460) / 100.68 - 0.12 - 3.573, (1503 - py) / 100.68 + HUEY.GROUND], view: [1, 0, 0], up: [0, 1, 0] },
  front: { s: 100.3, map: (px, py) => [-(px - 825) / 100.3, (909.5 - py) / 100.3 + HUEY.GROUND], view: [0, 0, 1], up: [0, 1, 0] },
  top: { s: 99.6, map: (px, py) => [(px - 829) / 99.6 - 0.12, -(py - 214.5) / 99.6], view: [0, -1, 0], up: [1, 0, 0] },
}[REF];
let ortho = null;
if (REFV) {
  ground.visible = false; scene.background = new THREE.Color(0xf4f4ee); scene.fog = null;
  const W = 1970, H = 1586, [a0, b0] = REFV.map(0, 0), [a1, b1] = REFV.map(W, H);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const tex = new THREE.TextureLoader().load('./ref/uh1-tm-3view.png'); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, k: { value: Number(Q.get('refa') || 0.85) } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float k; varying vec2 vUv; void main(){ float l = dot(texture2D(map, vUv).rgb, vec3(0.333)); gl_FragColor = vec4(0.9, 0.05, 0.05, (1.0 - smoothstep(0.35, 0.75, l)) * k); }' });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.renderOrder = 99; plane.frustumCulled = false; scene.add(plane);
  // &mask=1: the body alone (skin, glass, doghouse, shaft cover) in flat black on white, no drawing: tools/hueyfit.mjs
  // measures it against the traced outlines at the drawing's pixel scale
  if (Q.get('mask') === '1') {
    plane.visible = false; scene.background = new THREE.Color(0xffffff);
    const body = new Set(['fuselage', 'noseSkin', 'canopyGlass', 'doghouse', 'shaftCover']), bm = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    huey.group.traverse(o => { if (!o.isMesh && !o.isSprite && !o.isLine) return; if (body.has(o.name)) o.material = bm; else o.visible = false; });
    huey.animate = () => {};   // freeze: animate() would re-show parts
  }
  // plane corners in model space: the ortho camera looks along view, its right/up axes come from map()
  const V = new THREE.Vector3(...REFV.view), U = new THREE.Vector3(...REFV.up), Rt = new THREE.Vector3().crossVectors(V, U);
  const at = (a, b) => REF === 'side' ? new THREE.Vector3(0, b, a) : REF === 'front' ? new THREE.Vector3(a, b, 0) : new THREE.Vector3(b, 0, a);
  const c00 = at(a0, b0), c11 = at(a1, b1), ctr = c00.clone().add(c11).multiplyScalar(0.5);
  const w = Math.abs(c11.clone().sub(c00).dot(Rt)), h = Math.abs(c11.clone().sub(c00).dot(U));
  ortho.position.copy(ctr).addScaledVector(V, -12); ortho.up.copy(U); ortho.lookAt(ctr);
  ortho.left = -w / 2; ortho.right = w / 2; ortho.top = h / 2; ortho.bottom = -h / 2; ortho.updateProjectionMatrix();
  plane.scale.set(w, h, 1); plane.position.copy(ctr).addScaledVector(V, -6); plane.quaternion.copy(ortho.quaternion);
  // texture orientation: flip so image x runs along the camera right when map() increases with px
  const dA = Rt.dot(at(a1, b0).sub(at(a0, b0))), dB = U.dot(at(a0, b0).sub(at(a0, b1)));
  tex.repeat.set(dA > 0 ? 1 : -1, dB > 0 ? 1 : -1); tex.offset.set(dA > 0 ? 0 : 1, dB > 0 ? 0 : 1); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (Q.get('sil') === '1') { const sm = new THREE.MeshBasicMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.55, depthWrite: false }); huey.group.traverse(o => { if (o.isMesh) o.material = sm; }); }
  if (Q.get('ui') !== '0') document.getElementById('info').textContent = 'UH-1H vs TM 55-1520-210-10 ' + REF + ' view (red = drawing). ?ref=side|front|top &sil=1 &refa=0.85';
}
function size() { let w = innerWidth, h = innerHeight; if (ortho) { const a = (ortho.right - ortho.left) / (ortho.top - ortho.bottom); if (w / h > a) w = Math.round(h * a); else h = Math.round(w / a); } renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();

// a dummy panel snapshot for the cockpit (hot, at flight idle on the ground)
const PANEL = { avionics: 1, ac: true, volts: 28, amps: 30, ias: 0, alt: 40, vsi: 0, turn: 0, slip: 0, agl: 0, nr: 1, n2: 1, n1: 0.7, egt: 520, torque: 12, engOilP: 70, xmsnOilP: 50, engOilT: 70, xmsnOilT: 60,
  fuelLb: 1100, throttle: 1, masterCaution: false, rpmWarn: false, fire: false, cautions: [], hdg: 0.6, pitch: 0.02, roll: 0, hover: null,
  sw: { bat: true, gen: true, inv: true, engine: true, gov: 'AUTO', hyd: true, trim: true, sas: false, lowrpm: true, light: false, starter: false }, ctl: { cx: 0, cy: 0, coll: 0.1, pedal: 0 } };
let last = performance.now(), time = 0;
function place() {
  if (cockpit) {
    huey.group.updateMatrixWorld();
    camera.position.copy(HUEY_EYE); if (Q.get('ck') === '2') camera.position.x *= -1; camera.position.applyMatrix4(huey.group.matrixWorld); /* ck=2: the copilot's eye */ camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = ck.yaw; camera.rotation.x = ck.pitch; camera.near = 0.03; camera.updateProjectionMatrix();
  } else {
    camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t);
    camera.near = Math.max(0.05, cam.dist * 0.004); camera.far = 4000; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0); camera.lookAt(cam.t);
  }
}
function step(dt) {
  time += dt; huey.animate(S, dt, time, !!cockpit);
  if (cockpit) cockpit.update({}, dt, PANEL);
  place(); renderer.render(scene, ortho || camera);
}
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
window.__H = { huey, cockpit, S, cam, ck, camera, scene, renderer, THREE, HUEY, buildMs, PANEL,
  // render a settled frame (two passes so the LOD probe sees the camera)
  render: (dt = 0) => { step(dt); step(0); step(0); return true; } };
