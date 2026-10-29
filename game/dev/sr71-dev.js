// SR-71A preview and blueprint fit page (ngc/look-sr71): the exterior model on sliders (attitude, spikes, elevons,
// fins, gear, canopies, burners, chute), orbit or the cockpit eye. Blueprint overlays per the milsim-blueprint skill:
// ?ref=side|top|front - an orthographic camera over the traced USAF three-view at its calibration (dev/ref/sr71-3view.png,
// a 2x raster of docs/ngc1980/reference/sr71/usaf-sr71a-3view.svg), drawing lines in red (&refa= opacity); &sil=1 the
// model as a flat translucent silhouette; &mask=1 the airframe flat black on white for tools/blueprint/fit.mjs.
// Flight testing (?start=air|runway|cruise) is the same page with the sim: see the bottom of this file.
import * as THREE from 'three';
import { buildSR71Model, SR71M } from '../js/units/air/sr71model.js';
import { G } from '../js/units/air/sr71geo.js';
import { updateLODs } from '../js/renderkit/lod.js';

const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * (+Q.get('res') || 1)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb6d8); scene.fog = new THREE.Fog(0x8fb6d8, 2000, 30000);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 1.0));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.4); sun.position.set(0.5, 1, 0.3); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7a7d6a })); scene.add(ground);
const runway = new THREE.Mesh(new THREE.PlaneGeometry(45, 3500).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3d4043 })); runway.position.set(0, 0.03, -1500); scene.add(runway);
for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8e8e0 })); m.position.set(0, 0.05, 150 - i * 60); scene.add(m); }
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60000);

const model = buildSR71Model({ serial: Q.get('serial') || '17964' }); scene.add(model.group);
const A = {   // the sim state the model reads (sliders drive it here)
  pos: new THREE.Vector3(0, G.Y_CG, 0), q: new THREE.Quaternion(), surf: { elevL: 0, elevR: 0, rud: 0 }, spike: [0, 0], gear: 1, onGround: true, strut: [0, 0, 0], steer: 0, wheelRot: 0,
  canopy: 0, chute: 'stowed', eng: [{ n: 0.7, ab: 0 }, { n: 0.7, ab: 0 }], sigma: 1, lights: true,
};
const X = { pitch: 0, roll: 0, hdg: 0, alt: 0, elev: 0, ail: 0, rud: 0, spike: 0, gear: 1, canopy: 0, ab: 0, sigma: 1, chute: false, view: Q.get('view') || 'orbit', inside: false, yaw: 0, look: -0.1 };
if (Q.get('s')) Object.assign(X, JSON.parse(Q.get('s')));
const ui = document.getElementById('ui'); if (Q.get('ui') === '0') { ui.classList.add('hide'); document.getElementById('info').remove(); document.getElementById('tele').remove(); }
const row = (label, el) => { const l = document.createElement('label'); l.textContent = label; l.appendChild(el); ui.appendChild(l); return el; };
const slider = (k, min, max, step = 0.01) => { const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = X[k]; r.oninput = () => X[k] = +r.value; row(k, r); };
const toggle = k => { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!X[k]; c.onchange = () => X[k] = c.checked; row(k, c); };
const select = (k, opts) => { const s = document.createElement('select'); for (const o of opts) s.add(new Option(o, o)); s.value = X[k]; s.onchange = () => X[k] = s.value; row(k, s); };
select('view', ['orbit', 'cockpit', 'rso']);
for (const [k, a, b, s] of [['pitch', -40, 40, 0.5], ['roll', -180, 180, 1], ['hdg', 0, 360, 1], ['alt', 0, 30000, 10], ['elev', -0.4, 0.4], ['ail', -0.4, 0.4], ['rud', -0.35, 0.35], ['spike', 0, 1], ['gear', 0, 1], ['canopy', 0, 1], ['ab', 0, 1], ['sigma', 0, 1]]) slider(k, a, b, s);
toggle('chute');
let drag = null; const orbit = { yaw: 0.9, pitch: 0.22, dist: 46 };
if (Q.get('cam')) { const [y, p, d] = Q.get('cam').split(',').map(Number); Object.assign(orbit, { yaw: y, pitch: p, dist: d }); X.view = 'orbit'; }
renderer.domElement.addEventListener('pointerdown', e => drag = { x: e.clientX, y: e.clientY });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (X.view === 'orbit') { orbit.yaw -= dx * 0.006; orbit.pitch += dy * 0.006; } else { X.yaw -= dx * 0.004; X.look -= dy * 0.004; } });
addEventListener('wheel', e => orbit.dist *= Math.exp(e.deltaY * 0.001));
function size() { let w = innerWidth, h = innerHeight; if (window.__ortho) { const o = window.__ortho, a = (o.right - o.left) / (o.top - o.bottom); if (w / h > a) w = Math.round(h * a); else h = Math.round(w / a); } renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
const D2R = Math.PI / 180, _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
let last = performance.now(), time = 0;
const hooks = { pre: null, post: null };   // the flight mode (below) plugs in here
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (hooks.pre) hooks.pre(dt);
  else {
    A.q.setFromEuler(_e.set(X.pitch * D2R, -X.hdg * D2R, -X.roll * D2R, 'YXZ')); A.pos.set(0, G.Y_CG + X.alt, 0);
    A.surf.elevL = X.elev - X.ail; A.surf.elevR = X.elev + X.ail; A.surf.rud = X.rud; A.spike[0] = A.spike[1] = X.spike; A.gear = X.gear; A.canopy = X.canopy;
    A.onGround = X.alt < 0.1 && X.gear > 0.99; A.eng[0].ab = A.eng[1].ab = X.ab; A.eng[0].n = A.eng[1].n = X.ab > 0 ? 1 : 0.7; A.sigma = X.sigma; A.chute = X.chute ? 'deployed' : 'stowed';
  }
  const inside = X.view !== 'orbit' && !window.__ortho;
  model.group.position.copy(A.pos); model.group.quaternion.copy(A.q); model.animate(A, dt, time, inside);
  if (window.__ortho) { /* fixed */ }
  else if (inside) {
    const E = X.view === 'rso' ? SR71M.EYE_RSO : SR71M.EYE; camera.position.set(...E).applyQuaternion(A.q).add(A.pos);
    camera.quaternion.copy(A.q).multiply(_q.setFromEuler(_e.set(X.look, X.yaw, 0, 'YXZ'))); camera.near = 0.05; camera.fov = 70;
  } else if (!hooks.cam || !hooks.cam(camera, dt)) {
    // ?tgt=x,y,z: orbit a point of the aircraft (model frame) instead of the CG; ?fov=; (ngc/sr71-fix: the cockpit photo side-by-side)
    const tg = Q.get('tgt') ? _v.set(...Q.get('tgt').split(',').map(Number)).applyQuaternion(A.q).add(A.pos) : _v.copy(A.pos);
    camera.position.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(orbit.yaw) * Math.cos(orbit.pitch)).multiplyScalar(orbit.dist).add(tg);
    camera.lookAt(tg); camera.near = Q.get('tgt') ? 0.02 : 0.3; camera.fov = +(Q.get('fov') || 50);
  }
  camera.updateProjectionMatrix();
  updateLODs(window.__ortho || camera);
  if (hooks.post) hooks.post(dt);
  renderer.render(scene, window.__ortho || camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__T = { A, X, model, scene, camera, renderer, THREE, hooks, orbit, G };

// ---- ?ref=side|top|front: the traced drawing (2x raster, px) at its calibration (tools/blueprint/sr71/*.config.json):
// side 93.31 px/m, pitot tip x 651 (X 0), ground y 2795.3 (Y 0); top 93.83 px/m, pitot x 634, centre line y 795.5;
// front 137.25 px/m, centre x 1163, ground y 2042.4 (registered by the body, see the findings)
const REF = Q.get('ref'), XC = G.X_CG, YC = G.Y_CG, REFV = {
  side: { img: 'ref/sr71-3view.png', W: 3708, H: 2838, map: (px, py) => [(px - 651) / 93.31 - XC, (2795.3 - py) / 93.31 - YC], view: [1, 0, 0], up: [0, 1, 0] },
  top: { img: 'ref/sr71-3view.png', W: 3708, H: 2838, map: (px, py) => [(px - 634) / 93.83 - XC, -(py - 795.5) / 93.83], view: [0, -1, 0], up: [1, 0, 0] },
  front: { img: 'ref/sr71-3view.png', W: 3708, H: 2838, map: (px, py) => [-(px - 1163) / 137.25, (2042.4 - py) / 137.25 - YC], view: [0, 0, 1], up: [0, 1, 0] },
}[REF];
if (REFV) {
  ground.visible = runway.visible = false; scene.traverse(o => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.height === 18) o.visible = false; });
  scene.background = new THREE.Color(0xf4f4ee); scene.fog = null; X.view = 'orbit'; X.gear = Q.get('gear') ? +Q.get('gear') : 0;
  model.group.userData.lockLod = 0;
  const { W, H } = REFV, [a0, b0] = REFV.map(0, 0), [a1, b1] = REFV.map(W, H);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const tex = new THREE.TextureLoader().load(REFV.img); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, k: { value: Number(Q.get('refa') || 0.85) } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float k; varying vec2 vUv; void main(){ float l = dot(texture2D(map, vUv).rgb, vec3(0.333)); gl_FragColor = vec4(0.9, 0.05, 0.05, (1.0 - smoothstep(0.35, 0.75, l)) * k); }' });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.renderOrder = 99; plane.frustumCulled = false; scene.add(plane);
  const Vd = new THREE.Vector3(...REFV.view), U = new THREE.Vector3(...REFV.up), Rt = new THREE.Vector3().crossVectors(Vd, U);
  const at = (a, b) => REF === 'side' ? new THREE.Vector3(0, b, a) : REF === 'front' ? new THREE.Vector3(a, b, 0) : new THREE.Vector3(b, 0, a);
  const c00 = at(a0, b0), c11 = at(a1, b1), ctr = c00.clone().add(c11).multiplyScalar(0.5);
  const w = Math.abs(c11.clone().sub(c00).dot(Rt)), h = Math.abs(c11.clone().sub(c00).dot(U));
  ortho.position.copy(ctr).addScaledVector(Vd, -150); ortho.up.copy(U); ortho.lookAt(ctr);
  ortho.left = -w / 2; ortho.right = w / 2; ortho.top = h / 2; ortho.bottom = -h / 2; ortho.updateProjectionMatrix();
  plane.scale.set(w, h, 1); plane.position.copy(ctr).addScaledVector(Vd, -100); plane.quaternion.copy(ortho.quaternion);
  const dA = Rt.dot(at(a1, b0).sub(at(a0, b0))), dB = U.dot(at(a0, b0).sub(at(a0, b1)));
  tex.repeat.set(dA > 0 ? 1 : -1, dB > 0 ? 1 : -1); tex.offset.set(dA > 0 ? 0 : 1, dB > 0 ? 0 : 1); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  X.pitch = 0; X.roll = 0; X.hdg = 0; X.alt = 0; X.spike = 0; A.pos.set(0, 0, 0);
  const prePose = () => { A.q.identity(); A.pos.set(0, 0, 0); A.spike[0] = A.spike[1] = 0; A.gear = X.gear; A.onGround = false; A.eng[0].ab = A.eng[1].ab = 0; A.chute = 'stowed'; };
  hooks.pre = prePose;
  // the LOD0 level always (the ortho camera is far away)
  const lv = model.lod.levels; for (const l of lv) { l.near = l === lv[0] ? 0 : 1e9; l.far = l === lv[0] ? 1e9 : 1e9 + 1; }
  if (Q.get('mask') === '1') {
    plane.visible = false; scene.background = new THREE.Color(0xffffff);
    const skip = /^(chute|pitot|shockDiamond|burner|navLight|beacon|crew|torso|helmet|visor|cockpitTub|canopyFrame|markings|usaf|insignia|nacelleNo|finSerial|wingInsignia|dragChute|chute|tyre|hub|gearStrut|gearWell)/;
    const bm = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    model.group.traverse(o => { if (!o.isMesh) return; if (skip.test(o.name)) o.visible = false; else o.material = bm; });
    const an = model.animate; model.animate = (...a) => { an(...a); model.group.traverse(o => { if (o.isMesh && skip.test(o.name)) o.visible = false; }); };
  }
  if (Q.get('sil') === '1') { model.group.traverse(o => { if (/^(chute|dragChute|burner|shockDiamond)/.test(o.name)) o.visible = false; }); const sm = new THREE.MeshBasicMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.55, depthWrite: false }); model.group.traverse(o => { if (o.isMesh) o.material = sm; }); }
  window.__ortho = ortho; size();
  window.__T.ref = { REF, W, H };
}
// tele line
const tele = document.getElementById('tele');
setInterval(() => { if (tele && !hooks.tele) tele.textContent = `LOD ${model.lod.level ?? '-'}`; else if (tele) tele.textContent = hooks.tele(); }, 250);
// ?open=1: the canopy region opened up (the skin over the cockpits hidden, the cockpit shown) for the interior photo comparison
if (Q.get('open') === '1') import('../js/units/air/sr71cockpit.js').then(({ buildSR71Cockpit }) => { const ck = buildSR71Cockpit(); model.group.add(ck.group); model.group.traverse(o => { if (o.name === 'fuselage' || o.name === 'canopyFrame' || o.name === 'crew' || /torso|helmet|visor|cockpitTub/.test(o.name)) o.visible = false; }); const an = model.animate; model.animate = (...a) => { an(...a); model.group.traverse(o => { if (/^(fuselage|crew|torso|helmet|visor|cockpitTub|canopyFrame)$/.test(o.name)) o.visible = false; }); ck.update(SA, { pitch: 0, roll: 0, yaw: 0, throttle: [0.3, 0.3] }, 0.1, {}); }; const SA = { attitude: () => ({ pitch: 0, roll: 0, yaw: 0 }), keas: 0, mach: 0, altFt: 0, vel: new THREE.Vector3(), heading: 0, alpha: 0, cit: 15, sigma: 1, skinT: 15, nz: 1, nzMax: 1, trim: 0, eng: [0, 1].map(() => ({ n: 0, egt: 20, nozzle: 0.5, ff: 0, spike: 0, bypass: 1, unstart: 0, thr: 0 })) }; });
if (Q.get('start')) import('./sr71-fly.js').then(m => m.startFlight(window.__T, Q)).catch(e => console.error(e));
// ---- ?panel=1: the pilot's centre panel straight on (orthographic) over SR-71A-1 fig. 1-12 at its calibration
// (2821 px/m, figure centre px 1103, 1340): the milsim-blueprint skill's panel check. &refa= the figure's opacity.
if (Q.get('panel') === '1') {
  import('../js/units/air/sr71cockpit.js').then(({ buildSR71Cockpit, PANEL }) => {
    const ck = buildSR71Cockpit(), pp = ck.panel; pp.parent.remove(pp); pp.position.set(0, 0, 0); pp.rotation.set(0, 0, 0);
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0xffffff); sc.add(new THREE.AmbientLight(0xffffff, 2.2)); sc.add(pp);
    const W = 2084 / PANEL.pxPerM, H = 2917 / PANEL.pxPerM, cx = (1042 - PANEL.centre[0]) / PANEL.pxPerM, cy = -(1458.5 - PANEL.centre[1]) / PANEL.pxPerM;
    const tex = new THREE.TextureLoader().load('ref/sr71-panel.jpg'); tex.colorSpace = THREE.SRGBColorSpace;
    const fig = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: Number(Q.get('refa') || 0.5), depthTest: false }));
    fig.position.set(cx, cy, 0.2); fig.renderOrder = 9; sc.add(fig);
    const oc = new THREE.OrthographicCamera(cx - W / 2, cx + W / 2, cy + H / 2, cy - H / 2, 0.01, 10); oc.position.set(0, 0, 1);
    window.__ortho = oc; size();
    const A = { attitude: () => ({ pitch: 0.05, roll: 0.1, yaw: 0 }), keas: 352, mach: 3.18, altFt: 80000, vel: new THREE.Vector3(), heading: 0.3, alpha: 0.1, cit: 400, sigma: 0.034, skinT: 300, nz: 1, nzMax: 1.4, trim: 0.05,
      eng: [0, 1].map(() => ({ n: 1, egt: 830, nozzle: 0.8, ff: 21000, spike: 1, bypass: 0.2, unstart: 0, thr: 0.8 })) };
    hooks.post = () => { ck.update(A, null, 0.2); renderer.render(sc, oc); };
    renderer.setAnimationLoop(() => { ck.update(A, null, 0.2); renderer.render(sc, oc); });
  });
}
