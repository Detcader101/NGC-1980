// NGC-1980 infantry sandbox (temporary: model view only, the range comes next)
import * as THREE from 'three';
import { buildWeaponModel } from '../js/units/infantry/weaponmodels.js';
import { buildMarine, poseSkeleton, makePose, HITBOXES } from '../js/units/infantry/soldiermodel.js';
const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, +(Q.get('res') || 1.5))); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c4);
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x50503a, 1.0)); const sun = new THREE.DirectionalLight(0xfff2dc, 1.3); sun.position.set(0.4, 1, 0.6); scene.add(sun);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5d6b3a })); scene.add(ground);
const models = [];
['M16A1', 'M16A1/M203', 'M60', 'M72A2', 'M1911A1'].forEach((k, i) => { const m = buildWeaponModel(k); m.group.position.set(-3, 1.8 - i * 0.3, 0); m.group.rotation.y = Math.PI / 2; scene.add(m.group); models.push(m); });
const POSES = [
  ['stand', makePose({})], ['aim', makePose({ ads: 1 })], ['walk', makePose({ speed: 1.5, gait: 'walk', gaitPhase: 1.2, moveF: 1.5 })], ['sprint', makePose({ speed: 5.6, gait: 'sprint', gaitPhase: 0.6, moveF: 5.6, lower: 1 })],
  ['kneel', makePose({ stance: 'crouch', stanceFrom: 'crouch', stanceTo: 'crouch', ads: 1 })], ['prone', makePose({ stance: 'prone', stanceFrom: 'prone', stanceTo: 'prone', ads: 1 })],
  ['lean', makePose({ ads: 1, lean: 1 })], ['down', makePose({ down: true })],
];
const marines = POSES.map(([n, p], i) => { const m = buildMarine({ seed: i, weapon: n === 'down' ? null : i === 5 ? 'M60' : i === 4 ? 'M16A1/M203' : 'M16A1', pack: i === 2 }); m.root.position.set(i * 2.4, 0, 0); m.root.rotation.y = 0; scene.add(m.root); if (i === 5) p.cls = 'mg'; if (i === 4) p.cls = 'rifle'; poseSkeleton(m, p, 0); return m; });
// hitbox debug
const hbMat = new THREE.MeshBasicMaterial({ color: 0xff2020, wireframe: true });
if (Q.has('hitboxes')) for (const m of marines) for (const h of HITBOXES) { const b = m.bones[h.bone]; let g; if (h.type === 'sphere') { g = new THREE.SphereGeometry(h.r, 8, 6); g.translate(...h.c); } else if (h.type === 'box') { g = new THREE.BoxGeometry(h.h[0] * 2, h.h[1] * 2, h.h[2] * 2); g.translate(...h.c); } else { const L = Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2]); g = new THREE.CapsuleGeometry(h.r, L, 2, 6); g.translate(0, (h.a[1] + h.b[1]) / 2, 0); } b.add(new THREE.Mesh(g, hbMat)); }
const cam = { yaw: 0.6, pitch: 0.15, dist: 6, t: new THREE.Vector3(3, 0.9, 0) };
function size() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
function render() { camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist).add(cam.t); camera.lookAt(cam.t); renderer.render(scene, camera); }
(function loop() { render(); requestAnimationFrame(loop); })();
window.__I = { THREE, scene, camera, cam, models, marines, render };
