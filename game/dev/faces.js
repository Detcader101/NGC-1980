// NGC-1980 look-faces: the FACE STUDIO. Every face shape and skin tone at each level of detail, the headgear of every
// role, under a game-like sun and sky, with exact cameras for before / after close-ups (tools/scenes/faces.mjs).
//   rows (z): 0 = hero LOD bare heads, 2 = near, 4 = crew, 6 = mid, 8 = roles (crewPerson at crew detail), 10 = roles near
//   ?light=flat for the old flat dev light; window.__F.look(x, y, z, yaw, pitch, dist, fov, label)
import * as THREE from 'three';
import * as HF from '../js/units/infantry/humanfig.js';
import { figMaterial } from '../js/units/infantry/figgeo.js';
import { crewMaterial } from '../js/interiors/crewfig.js';
const Q = new URLSearchParams(location.search), scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa3b2);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(1); document.body.prepend(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
if (Q.get('light') === 'flat') { scene.add(new THREE.HemisphereLight(0xdde8ef, 0x57584c, 1.7)); const s = new THREE.DirectionalLight(0xffedda, 2.2); s.position.set(-3, 6, -5); scene.add(s); }
else {
  scene.add(new THREE.HemisphereLight(0xb9cde0, 0x6a5e4a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.4); sun.position.set(-3, 4.5, -3.5); scene.add(sun);
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f6656, roughness: 1 })); scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
const NF = HF.FACES.length, TONES = HF.SKIN_TONES;
const stats = {};
function place(geo, mat, x, z, key) { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); scene.add(m); stats[key] = geo.userData.tris ?? geo.index.count / 3; return m; }
const stand = HF.crewPose('stand');
const t0 = performance.now();
for (const [row, lod] of [[0, 'hero'], [2, 'near'], [4, 'crew'], [6, 'mid']]) {
  for (let f = 0; f < NF; f++) {
    const g0 = HF.marineGeometry({ lod, face: f, helmet: false, vest: false, sleeves: 'rolled', hands: 'open', frags: 0, pack: false });
    const g = HF.bakedPerson(g0, stand.pose, stand.pelvis); g.userData.tris = g0.userData.tris;
    place(g, figMaterial({ camo: 'erdl', seed: f, skin: TONES[f % TONES.length] }), f * 0.6, row, `${lod}/face${f}`);
  }
  // the M1 helmet on face 0 (squad marine)
  const gh = HF.marineGeometry({ lod, face: 1, helmet: true, vest: true, sleeves: 'down', hands: 'open', frags: 0, camo: 'og107' });
  const g = HF.bakedPerson(gh, stand.pose, stand.pelvis); g.userData.tris = gh.userData.tris;
  place(g, figMaterial({ camo: 'og107', seed: 3, skin: TONES[1] }), NF * 0.6, row, `${lod}/m1`);
}
const KINDS = ['marine', 'heloPilot', 'jetPilot', 'deck', 'sailor', 'officer', 'pilot', 'tanker'];
for (const [row, detail] of [[8, 'crew'], [10, 'near']]) KINDS.forEach((k, i) => {
  const g = HF.crewPerson(k, 'stand', { seed: i, detail, jersey: 0xd8c020 }); g.rotateY(Math.PI);
  place(g, crewMaterial(), i * 0.6, row, `${detail}/${k}`);
});
// townsfolk hair (civil, no hat)
for (let f = 0; f < NF; f++) { const g = HF.crewPerson('civil', 'stand', { seed: f * 4 + 1, face: f, detail: 'near' }); g.rotateY(Math.PI); place(g, crewMaterial(), -4 - f * 0.6, 0, `near/civil${f}`); }
stats.buildMs = Math.round(performance.now() - t0);
const { HEAD_BANK } = await import('../js/units/infantry/headbank.js'); stats.bankCurrent = !!HEAD_BANK && HEAD_BANK.key === HF.headKey();
const cam = { yaw: Math.PI, pitch: 0.03, dist: 0.6, fov: 30, t: new THREE.Vector3(0, 1.66, 0) };
function render() {
  camera.fov = cam.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t);
  camera.lookAt(cam.t); renderer.render(scene, camera);
}
function size() { renderer.setSize(innerWidth, innerHeight); render(); } addEventListener('resize', size); size();
let drag = null; renderer.domElement.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; });
addEventListener('pointermove', e => { if (drag) { cam.yaw -= (e.clientX - drag[0]) * 0.006; cam.pitch += (e.clientY - drag[1]) * 0.004; drag = [e.clientX, e.clientY]; render(); } }); addEventListener('pointerup', () => drag = null);
addEventListener('wheel', e => { cam.dist *= Math.exp(e.deltaY * 0.001); render(); });
window.__F = {
  NF, stats, scene, cam, render,
  look(x, y, z, yaw, pitch, dist, fov = 30, label = '') { cam.t.set(x, y, z); Object.assign(cam, { yaw, pitch, dist, fov }); document.getElementById('lab').textContent = label; render(); return true; },
};
