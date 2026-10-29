// CH-46E blueprint preview (ngc/look-units): ?ref=side|top over NADC-81118-60 fig. 2-1 at its calibration (99.4 px/m;
// side: hub midpoint px 2005, ground py 2862 = y -1.80; top: hub midpoint px 1900, centre py 1308), drawing lines in red;
// &sil=1 the model as a translucent silhouette; &mask=1 the airframe flat black on white for tools/blueprint/fit.mjs
// (blades, hubs, masts, wheels, struts, guns, crew, lights and decals hidden: the trace masks them too);
// ?ref= omitted: a turntable, &cam=yaw,pitch,dist,tx,ty,tz &s={animate state}.
import * as THREE from 'three';
import { buildCH46Mesh } from '../js/units/air/rotary/ch46model.js';
const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(1); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc2e0);
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x6a6a60, 1.0)); const sun = new THREE.DirectionalLight(0xfff0d0, 1.2); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const M = buildCH46Mesh({ modex: 7 }); scene.add(M.group);
const S = Object.assign({ nr: 0, ramp: 0 }, Q.get('s') ? JSON.parse(Q.get('s')) : {}); M.animate(S, 0, 0);
let camera = new THREE.PerspectiveCamera(+(Q.get('fov') || 40), 1, 0.05, 3000);
const [cy, cp, cd, tx = 0, ty = 0, tz = 0] = (Q.get('cam') || '0.8,0.25,30').split(',').map(Number);
camera.position.set(Math.sin(cy) * Math.cos(cp), Math.sin(cp), Math.cos(cy) * Math.cos(cp)).multiplyScalar(cd).add(new THREE.Vector3(tx, ty, tz)); camera.lookAt(tx, ty, tz);
const REF = Q.get('ref'), s = 99.4, REFV = {
  side: { W: 3456, H: 4808, map: (px, py) => [(px - 2005) / s, (2862 - py) / s - 1.80], view: [1, 0, 0], up: [0, 1, 0] },
  top: { W: 3456, H: 4808, map: (px, py) => [(px - 1900) / s, -(py - 1308) / s], view: [0, -1, 0], up: [1, 0, 0] },
}[REF];
if (REFV) {
  scene.background = new THREE.Color(0xf4f4ee);
  const { W, H } = REFV, [a0, b0] = REFV.map(0, 0), [a1, b1] = REFV.map(W, H);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const tex = new THREE.TextureLoader().load('ref/ch46e-fig2-1.png'); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, k: { value: Number(Q.get('refa') || 0.85) } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float k; varying vec2 vUv; void main(){ float l = dot(texture2D(map, vUv).rgb, vec3(0.333)); gl_FragColor = vec4(0.9, 0.05, 0.05, (1.0 - smoothstep(0.35, 0.75, l)) * k); }' });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.renderOrder = 99; plane.frustumCulled = false; scene.add(plane);
  const Vd = new THREE.Vector3(...REFV.view), U = new THREE.Vector3(...REFV.up), Rt = new THREE.Vector3().crossVectors(Vd, U);
  const at = (a, b) => REF === 'side' ? new THREE.Vector3(0, b, a) : new THREE.Vector3(b, 0, a);
  const c00 = at(a0, b0), c11 = at(a1, b1), ctr = c00.clone().add(c11).multiplyScalar(0.5);
  const w = Math.abs(c11.clone().sub(c00).dot(Rt)), h = Math.abs(c11.clone().sub(c00).dot(U));
  ortho.position.copy(ctr).addScaledVector(Vd, -60); ortho.up.copy(U); ortho.lookAt(ctr);
  ortho.left = -w / 2; ortho.right = w / 2; ortho.top = h / 2; ortho.bottom = -h / 2; ortho.updateProjectionMatrix();
  plane.scale.set(w, h, 1); plane.position.copy(ctr).addScaledVector(Vd, -30); plane.quaternion.copy(ortho.quaternion);
  const dA = Rt.dot(at(a1, b0).sub(at(a0, b0))), dB = U.dot(at(a0, b0).sub(at(a0, b1)));
  tex.repeat.set(dA > 0 ? 1 : -1, dB > 0 ? 1 : -1); tex.offset.set(dA > 0 ? 0 : 1, dB > 0 ? 0 : 1); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const skip = /^(farBody|skinLOD2|doorUpper|rotor[FA](Hub|Disc|Mast)?|arm|flap|pitch|blade|bladeTip|cuff|disc|discTips|doorGun|gunPitch|m2|flash|gunner|gunnerBody|crewChief|chiefBody|rampStrut|beacon|nav|landingLight|cockpitBits)$/;
  const hideCol = new Set([0x161616, 0x4a4d4f, 0x141512]);   // tyres, metal (gear legs, hoist), the black antennas: merged into 'airframe' per material
  M.group.traverse(o => { if (skip.test(o.name) || (o.isMesh && o.material && !Array.isArray(o.material) && o.material.color && hideCol.has(o.material.color.getHex()))) o.visible = false; });
  M.group.traverse(o => { if (o.isMesh && /^rotor/.test(o.parent?.name || '')) o.visible = false; });
  if (Q.get('mask') === '1') { plane.visible = false; scene.background = new THREE.Color(0xffffff); const bm = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide }); M.group.traverse(o => { if (o.isMesh) o.material = bm; }); }
  if (Q.get('sil') === '1') { const sm = new THREE.MeshBasicMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.55, depthWrite: false }); M.group.traverse(o => { if (o.isMesh) o.material = sm; }); }
  camera = ortho;
}
function size() { renderer.setSize(innerWidth, innerHeight); if (camera.isPerspectiveCamera) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } }
addEventListener('resize', size); size();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
window.__T = { M, scene, camera, renderer, THREE };
