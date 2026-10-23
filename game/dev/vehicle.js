// Vehicle test ground for the NGC-1980 wheeled vehicles: drive any of them (M151A2, M35A2, Land Rover, Hilux, Beetle,
// Lada) on tarmac, a dirt loop, sand, mud, 20/40/60 % ramps, a bump course, a side slope and a ford, with a live
// telemetry overlay. Query: ?v=m151&zone=road&cam=chase|orbit|cockpit|side|wheel&mode=auto|semi|manual&ui=0&hud=0
// &s={variant json}&debug (window.__V bridge for headless scenes) &paused &res=0.5
import * as THREE from 'three';
import { WHEELED, WHEELED_IDS, createWheeledSim } from '../js/units/wheeled/index.js';
import { aiInput } from '../js/units/wheeled/driver.js';
import { lookFrom } from '../js/units/wheeled/modelkit.js';
import { SURF_NAMES } from '../js/units/wheeled/tyre.js';
import { heightAt, groundAt, waterAt, makeEnv, ZONES, POND_SHAPE, RAMP_LANES } from './vehicle-ground.js';

const Q = new URLSearchParams(location.search), DEBUG = Q.has('debug');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio) * (+Q.get('res') || 1));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9db8cf); scene.fog = new THREE.Fog(0x9db8cf, 180, 480);
scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x5a5238, 0.95));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.35); sun.position.set(60, 110, 40); scene.add(sun);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);

// ------------------------------------------------------------------------------------------- the ground
const SURF_COL = { 0: 0x3c3d3e, 1: 0x2f3236, 2: 0x8a7352, 3: 0x5b7a38, 4: 0xc9b07c, 5: 0x4c3c2a, 6: 0x50545a, 7: 0x7a7870, 8: 0xe8eef2 };
function buildTerrain() {
  const x0 = -140, x1 = 170, z0 = -205, z1 = 190, st = 1.5, nx = Math.round((x1 - x0) / st) + 1, nz = Math.round((z1 - z0) / st) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), o = {}, c = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * st, z = z0 + j * st, h = heightAt(x, z, o), k = (j * nx + i) * 3;
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    c.setHex(SURF_COL[o.surf] ?? 0x5b7a38);
    if (o.surf === 0 && x > 24 && x < 90 && z > 15 && z < 57) c.setHex(0x8a8a82);   // concrete ramps
    const n = Math.sin(x * 0.7) * Math.sin(z * 0.9) * 0.05 + Math.sin(x * 0.13 + z * 0.11) * 0.06;
    c.multiplyScalar(1 + n); col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  // the bump course at fine resolution (logs, kerb, potholes are smaller than the terrain grid)
  {
    const bx0 = -16.5, bx1 = -8.5, bz0 = -172, bz1 = -38, s2 = 0.12, mx = Math.round((bx1 - bx0) / s2) + 1, mz = Math.round((bz1 - bz0) / s2) + 1;
    const p = new Float32Array(mx * mz * 3), cc = new Float32Array(mx * mz * 3);
    for (let j = 0; j < mz; j++) for (let i = 0; i < mx; i++) {
      const x = bx0 + i * s2, z = bz0 + j * s2, h = heightAt(x, z, o), k = (j * mx + i) * 3;
      p[k] = x; p[k + 1] = h + 0.01; p[k + 2] = z; c.setHex(h > 0.06 ? 0x7a6448 : 0x8a7352); c.multiplyScalar(0.95 + 0.1 * Math.sin(i * 1.7 + j * 0.3)); cc[k] = c.r; cc[k + 1] = c.g; cc[k + 2] = c.b;
    }
    const id2 = []; for (let j = 0; j < mz - 1; j++) for (let i = 0; i < mx - 1; i++) { const a = j * mx + i, b = a + 1, d = a + mx, e = d + 1; id2.push(a, d, b, b, d, e); }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(p, 3)); g2.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g2.setIndex(id2); g2.computeVertexNormals();
    scene.add(new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
  // water
  const wg = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2); wg.scale(POND_SHAPE.rx, 1, POND_SHAPE.rz);
  const water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x3f6a78, transparent: true, opacity: 0.72, depthWrite: false }));
  water.position.set(POND_SHAPE.cx, 0.0, POND_SHAPE.cz); water.renderOrder = 2; scene.add(water);
  // road markings: centre dashes and edge lines; distance boards every 50 m; grade signs at the ramps
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e6da });
  for (let z = -295; z < 195; z += 6) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 3), white); m.position.set(0, heightAt(0, z) + 0.012, z); scene.add(m); }
  for (const x of [-3.7, 3.7]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 495), white); m.position.set(x, heightAt(x, 0) + 0.01, -52.5); scene.add(m); }
  const sign = (text, x, z, col = '#f2efe2', bg = '#2a3a28') => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const cx = cv.getContext('2d');
    cx.fillStyle = bg; cx.fillRect(0, 0, 256, 128); cx.strokeStyle = col; cx.lineWidth = 6; cx.strokeRect(6, 6, 244, 116);
    cx.fillStyle = col; cx.font = 'bold 54px Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, 128, 66);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    const y = heightAt(x, z); s.position.set(x, y + 1.6, z); scene.add(s);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), new THREE.MeshLambertMaterial({ color: 0x555555 })); post.position.set(x, y + 0.8, z); scene.add(post);
    return s;
  };
  for (let z = 150; z >= -250; z -= 50) sign(`${150 - z} m`, 5.5, z).rotation.y = 0;
  RAMP_LANES.forEach(r => sign(`${Math.round(r.g * 100)} %`, 22, (r.z0 + r.z1) / 2).rotation.y = Math.PI / 2);
  sign('FORD', -36, 110, '#f2efe2', '#20405a'); sign('BUMPS', -7.5, -36).rotation.y = 0; sign('SAND', -22, -66).rotation.y = Math.PI / 2; sign('MUD', -22, 6).rotation.y = Math.PI / 2; sign('25% SIDE', -88, 22);
  // cones along the road for speed
  const coneM = new THREE.MeshLambertMaterial({ color: 0xe06a20, flatShading: true });
  for (let z = 140; z > -260; z -= 25) for (const x of [-4.6, 4.6]) { const cn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), coneM); cn.position.set(x, heightAt(x, z) + 0.25, z); scene.add(cn); }
  // trees for depth cues
  const treeM = new THREE.MeshLambertMaterial({ color: 0x2f5a26, flatShading: true }), trunkM = new THREE.MeshLambertMaterial({ color: 0x4a3828 });
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) {
    const x = -135 + rnd() * 300, z = -200 + rnd() * 385; heightAt(x, z, o);
    if (o.surf !== 3 || Math.abs(x) < 12 || Math.abs(z - 100) < 12 || (x > 20 && x < 95 && z > 12 && z < 60) || (x > -125 && x < -80 && z > -65 && z < 25)) continue;
    const s = 0.7 + rnd() * 0.8, t = new THREE.Mesh(new THREE.ConeGeometry(1.6 * s, 5 * s, 7), treeM), tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.4 * s, 6), trunkM);
    const y = heightAt(x, z); t.position.set(x, y + 1.4 * s + 2.5 * s, z); tr.position.set(x, y + 0.7 * s, z); scene.add(t, tr);
  }
}
buildTerrain();

// ------------------------------------------------------------------------------------------- particles (dust, spray, smoke)
const NP = 900, pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pAge = new Float32Array(NP).fill(9), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP).fill(1);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 1.2, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.55 })); pts.frustumCulled = false; scene.add(pts);
let pNext = 0;
function emit(x, y, z, vx, vy, vz, col, life = 1.5) {
  const i = pNext = (pNext + 1) % NP; pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz; pAge[i] = 0; pLife[i] = life;
  const c = new THREE.Color(col); pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
}
function stepParticles(dt) {
  for (let i = 0; i < NP; i++) {
    if (pAge[i] >= pLife[i]) { pPos[i * 3 + 1] = -999; continue; }
    pAge[i] += dt; pVel[i * 3 + 1] -= dt * (pVel[i * 3 + 1] > 0.5 ? 2 : 0.3);
    for (let k = 0; k < 3; k++) { pPos[i * 3 + k] += pVel[i * 3 + k] * dt; pVel[i * 3 + k] *= 1 - dt * 0.8; }
    const f = 1 - pAge[i] / pLife[i]; for (let k = 0; k < 3; k++) pCol[i * 3 + k] *= 1 - dt * 0.4 * (1 - f);
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------- vehicle
const env = makeEnv({ g: 9.81, ambient: 26 });
const V = { id: null, sim: null, driver: null, dmg: null, model: null, interior: null, variant: {}, look: null };
let shadowBlob;
{
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); shadowBlob.renderOrder = 1; scene.add(shadowBlob);
}
async function placeholderModel(spec) {   // until a model module exists: a coloured box on four wheels
  const g = new THREE.Group(), M = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const [L, W, H] = [spec.dims.L, spec.dims.W, spec.dims.H];
  const body = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, H * 0.5, L), M(spec.colours ? spec.colours[0] : 0x4b5233)); body.position.y = H * 0.45; g.add(body);
  const wheels = spec.wheels.map(w => { const r = 0.35; const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 14).rotateZ(Math.PI / 2), M(0x1b1b1b)); m.position.set(w.x, r, w.z); g.add(m); return m; });
  return { group: g, shell: [], animate(L) { L.wheels.forEach((w, i) => { wheels[i].position.y = 0.35 + w.dy; wheels[i].rotation.set(-w.spin, -w.steer, 0, 'YXZ'); }); }, setVariant() {} };
}
async function setVehicle(id, variant = {}, zone = null) {
  if (V.model) { scene.remove(V.model.group); }
  const keepPose = V.sim && !zone ? { pos: [...V.sim.pos], yaw: -V.sim.heading } : null;
  const w = createWheeledSim(id, { mode: Q.get('mode') || 'auto' });
  Object.assign(V, w, { id, variant: { ...variant } });
  const E = WHEELED[id];
  let model;
  try { const mod = await import('../js/units/wheeled/' + E.model[0].slice(2)); model = mod[E.model[1]]({ spec: E.spec, ...variant }); }
  catch (err) { console.warn('model for ' + id + ' not available yet:', err.message); model = await placeholderModel(E.spec); }
  V.model = model; scene.add(model.group);
  V.interior = null;
  try { const im = await import('../js/units/wheeled/interior.js'); V.interior = im.buildInterior(E.spec, model); }
  catch (err) { if (!/Failed to fetch|Cannot find|404|error loading/i.test(err.message)) console.warn('interior', err.message); }
  if (model.setVariant) model.setVariant(variant);
  const zz = ZONES[zone || (keepPose ? '' : Q.get('zone') || 'start')];
  if (zz) teleport(zz.x, zz.z, zz.yaw); else if (keepPose) teleport(keepPose.pos[0], keepPose.pos[2], keepPose.yaw);
  V.sim.dmg.setOccupant('driver', true);
  feed(E.spec.name);
  return V;
}
function teleport(x, z, yaw = 0) {
  V.sim.reset([x, heightAt(x, z), z], yaw, { running: true });
  V.sim.placeOnGround(env); V.driver.reset(V.sim);
  for (const W of V.sim.wheels) W.spin = 0;
}

// ------------------------------------------------------------------------------------------- input
const keys = new Set(), edge = new Set();
addEventListener('keydown', e => { if (e.repeat) return; keys.add(e.code); edge.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
const IN = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, fwd: false, range: 'H', lock: false, ignition: true, starter: false, horn: false, kit: false };
let override = null, ai = null, paused = Q.has('paused'), camMode = Q.get('cam') || 'chase', sound = false, audio = null;
const ramp = (v, on, up, down, dt) => on ? Math.min(1, v + up * dt) : Math.max(0, v - down * dt);
function readInput(dt) {
  const k = c => keys.has(c);
  IN.throttle = ramp(IN.throttle, k('KeyW') || k('ArrowUp'), 3, 5, dt);
  IN.brake = ramp(IN.brake, k('KeyS') || k('ArrowDown'), 4, 6, dt);
  IN.steer = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  IN.handbrake = k('Space') ? 1 : 0;
  IN.clutch = ramp(IN.clutch, k('KeyC'), 5, 3, dt);
  IN.horn = k('KeyH');
  IN.starter = k('KeyI') && !V.sim.eng.running;
  IN.shiftUp = edge.has('KeyE'); IN.shiftDown = edge.has('KeyQ');
  if (edge.has('KeyF')) { IN.fwd = !IN.fwd; feed('front drive ' + (IN.fwd ? 'ENGAGED (4x4)' : 'off (4x2)')); }
  if (edge.has('KeyL') && V.spec.transfer.low) { IN.range = IN.range === 'H' ? 'L' : 'H'; feed('transfer ' + (IN.range === 'L' ? 'LOW' : 'HIGH') + ' range'); }
  if (edge.has('KeyK')) { IN.lock = !IN.lock; feed('diff lock ' + (IN.lock ? 'on' : 'off') + (V.spec.axles.some(a => a.diff === 'lockable') ? '' : ' (no lockers on this vehicle)')); }
  if (edge.has('KeyG') && V.spec.water.kit) { IN.kit = !IN.kit; feed('deep-water fording kit ' + (IN.kit ? 'fitted' : 'off')); }
  if (edge.has('KeyI') && V.sim.eng.running) { IN.ignition = false; feed('ignition off'); } else if (edge.has('KeyI')) IN.ignition = true;
  if (edge.has('KeyO')) { V.sim.lights = !V.sim.lights; }
  if (edge.has('KeyM')) { const m = ['auto', 'semi', 'manual'], i = (m.indexOf(V.driver.mode) + 1) % 3; V.driver.mode = m[i]; feed('driver: ' + m[i] + (m[i] === 'manual' ? ' (C clutch, Q/E gears)' : m[i] === 'semi' ? ' (Q/E gears)' : '')); }
  if (edge.has('KeyV')) { const m = ['chase', 'cockpit', 'orbit', 'side', 'wheel'], i = (m.indexOf(camMode) + 1) % m.length; camMode = m[i]; feed('camera: ' + camMode); }
  if (edge.has('KeyR')) { teleport(V.sim.pos[0], V.sim.pos[2], -V.sim.heading); V.dmg.repair('all'); feed('reset + repaired'); }
  if (edge.has('KeyP')) paused = !paused;
  if (edge.has('KeyN')) toggleSound();
  if (edge.has('KeyX')) { const p = [(Math.random() - 0.5) * 2, 0.8, -2], d = [Math.random() - 0.5, -0.1, 1]; const h = V.dmg.hit(p, d, Math.random() < 0.5 ? 'rifle' : 'hmg'); feed('hit: ' + (h.join(', ') || 'miss')); }
  if (edge.has('KeyT')) cycleVariant();
  if (edge.has('KeyZ')) { const zs = Object.keys(ZONES), i = (zs.indexOf(curZone) + 1) % zs.length; curZone = zs[i]; const zz = ZONES[curZone]; teleport(zz.x, zz.z, zz.yaw); feed('zone: ' + zz.label); }
  for (let d = 1; d <= 6; d++) if (edge.has('Digit' + d)) setVehicle(WHEELED_IDS[d - 1], {});
  edge.clear();
}
let curZone = Q.get('zone') || 'start';
function cycleVariant() {
  const vs = WHEELED[V.id].variants || {}, keysV = Object.keys(vs); if (!keysV.length) return;
  V._vk = ((V._vk ?? -1) + 1) % keysV.length; const k = keysV[V._vk], opts = vs[k], cur = V.variant[k] ?? opts[0];
  V.variant[k] = opts[(opts.indexOf(cur) + 1) % opts.length]; V.model.setVariant?.(V.variant); feed(`${k}: ${V.variant[k]}`);
}

// ------------------------------------------------------------------------------------------- camera
const cam = { yaw: 2.4, pitch: 0.25, dist: 9, look: new THREE.Vector3(), pos: new THREE.Vector3(), headYaw: 0, headPitch: 0 };
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; if (sound === false && !audio) toggleSound(true); });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (camMode === 'cockpit') { cam.headYaw -= dx * 0.004; cam.headPitch = Math.max(-1.2, Math.min(1.0, cam.headPitch - dy * 0.004)); }
  else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-0.2, Math.min(1.45, cam.pitch + dy * 0.005)); } });
addEventListener('wheel', e => { cam.dist = Math.max(2.5, Math.min(60, cam.dist * Math.exp(e.deltaY * 0.001))); });
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function updateCamera(dt) {
  const S = V.sim, p = _v.set(S.pos[0], S.pos[1], S.pos[2]), q = _q.set(S.q[0], S.q[1], S.q[2], S.q[3]);
  const size = Math.max(3.5, V.spec.dims.L), hy = V.spec.dims.H * 0.55;
  camera.fov = camMode === 'cockpit' ? 72 : 55;
  if (camMode === 'cockpit') {
    const seat = V.spec.seats.find(s => s.role === 'driver'), eye = _w.set(...seat.eye).applyQuaternion(q).add(p);
    camera.position.copy(eye); _e.set(-0.1 + cam.headPitch, cam.headYaw, 0, 'YXZ'); camera.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(_e));
    camera.near = 0.03;
  } else {
    camera.near = 0.1;
    if (camMode === 'chase') {
      const back = _w.set(0, 0, 1).applyQuaternion(q); back.y = 0; back.normalize();
      const want = p.clone().addScaledVector(back, size * 1.7 + 3).add(new THREE.Vector3(0, size * 0.55 + 1.2, 0));
      cam.pos.lerp(want, 1 - Math.exp(-dt * 4)); if (cam.pos.lengthSq() < 1e-6 || cam.pos.distanceTo(p) > 60) cam.pos.copy(want);
      cam.pos.y = Math.max(cam.pos.y, heightAt(cam.pos.x, cam.pos.z) + 0.8);
      camera.position.copy(cam.pos); camera.lookAt(p.x, p.y + hy, p.z);
    } else if (camMode === 'orbit' || camMode === 'wheel') {
      const d = camMode === 'wheel' ? 3.2 : cam.dist, t = camMode === 'wheel' ? _w.set(V.spec.wheels[1].x, 0.4, V.spec.wheels[1].z).applyQuaternion(q).add(p) : _w.set(p.x, p.y + hy, p.z);
      const yaw = cam.yaw + (camMode === 'orbit' ? -S.heading : -S.heading - 2.3);
      camera.position.set(t.x + Math.sin(yaw) * Math.cos(cam.pitch) * d, t.y + Math.sin(camMode === 'wheel' ? 0.12 : cam.pitch) * d, t.z + Math.cos(yaw) * Math.cos(cam.pitch) * d);
      camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.25);
      camera.lookAt(t);
    } else if (camMode === 'side') {
      const right = _w.set(1, 0, 0).applyQuaternion(q); right.y = 0; right.normalize();
      camera.position.copy(p).addScaledVector(right, size * 1.9 + 2).add(new THREE.Vector3(0, 1.4, 0)); camera.lookAt(p.x, p.y + hy * 0.8, p.z);
    }
  }
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------------------------------- HUD
const tele = document.getElementById('tele'), feedEl = document.getElementById('feed'), bar = document.getElementById('bar'), help = document.getElementById('help');
if (Q.get('ui') === '0') { bar.classList.add('hide'); help.classList.add('hide'); }
if (Q.get('hud') === '0') tele.classList.add('hide');
const feedLines = [];
function feed(t) { feedLines.push({ t, at: performance.now() }); while (feedLines.length > 4) feedLines.shift(); }
const fmt = (v, d = 0) => (+v).toFixed(d), pad = (s, n) => String(s).padStart(n);
const bars = v => '█'.repeat(Math.round(Math.max(0, Math.min(1, v)) * 10)).padEnd(10, '·');
let teleT = 0;
function drawTele(dt) {
  teleT -= dt; if (teleT > 0) return; teleT = 0.1;
  const S = V.sim, e = S.eng, c = S.lastCtl || {}, d = V.dmg.state, ws = S.wheels;
  const gear = S.gear < 0 ? 'R' : S.gear === 0 ? 'N' : S.gear;
  const st = e.running ? '<b>running</b>' : e.hydrolock ? '<span class=r>HYDROLOCKED</span>' : e.seized ? '<span class=r>SEIZED</span>' : e.starter ? '<span class=w>cranking</span>' : '<span class=w>stopped</span>';
  const lines = [
    `<b>${V.spec.name}</b>   driver ${V.driver.mode}   cam ${camMode}${paused ? '   <span class=w>PAUSED</span>' : ''}`,
    `speed ${pad(fmt(S.kmh, 1), 6)} km/h   rpm ${pad(fmt(e.rpm), 5)}   gear <b>${gear}</b>${V.spec.transfer.low ? ' ' + S.range : ''}   ${S.fwd || V.spec.transfer.front === 'full' ? '<b>4x4</b>' : V.spec.transfer.front === 'none' ? '4x2' : '4x2'}${S.spragTq > 20 ? ' <span class=w>SPRAG</span>' : ''}${c.lock ? ' LOCK' : ''}`,
    `throttle ${bars(c.throttle)} brake ${bars(c.brake)}`,
    `clutch   ${bars(c.clutch)} steer ${pad(fmt((c.steer || 0) * V.spec.steer.max * 57.3, 1), 5)}°  hb ${c.handbrake ? 'ON' : '-'}`,
    `engine ${st}  ${fmt(e.tqInd - (e.fric || 0))} N m  ${fmt(e.power / 1000, 1)} kW${V.spec.engine.turbo ? '  boost ' + fmt(e.boost * 100) + '%' : ''}${e.smoke > 0.1 ? '  <span class=w>smoke</span>' : ''}`,
    `temp ${fmt(e.temp)} °C  oil ${fmt(e.oilP)} psi  fuel ${fmt(S.fuelL, 1)} L ${fmt(e.fuelFlow * 3600 / (V.spec.engine.diesel ? 0.84 : 0.74), 1)} L/h${V.spec.brakes.air ? `  air ${fmt(S.airPsi)} psi` : ''}  ${S.genOn ? 'GEN' : '<span class=w>BAT</span>'} ${fmt(S.amps)} A`,
    `roll ${pad(fmt(S.roll * 57.3, 1), 5)}°  pitch ${pad(fmt(S.pitch * 57.3, 1), 5)}°  lat ${pad(fmt(S.latG, 2), 5)} g  lon ${pad(fmt(S.lonG, 2), 5)} g  yaw ${pad(fmt(S.yawRate * 57.3), 4)}°/s`,
    `wheel  surface  load kN  slip   sink  travel`,
    ...ws.map(W => `  ${W.id.padEnd(3)}  ${(W.contact ? SURF_NAMES[W.surf] : 'AIR').padEnd(7)} ${pad(fmt(W.Fz / 1000, 1), 6)}  ${pad(fmt(W.ts.kappa, 2), 5)} ${pad(fmt(W.ts.sink * 100), 4)}cm ${pad(fmt((V.spec._prep.wk[W.i].travel - W.s) * 100), 4)}cm${d.tyres[W.i].pressure < 0.95 ? `  <span class=r>tyre ${fmt(d.tyres[W.i].pressure * 100)}%</span>` : ''}`),
    `${S.inWater > 0 ? `<span class=w>wading ${fmt(S.depth, 2)} m${IN.kit ? ' (kit)' : ''}</span>  ` : ''}${d.fire > 0 ? '<span class=r>FIRE</span>  ' : ''}engine ${fmt(d.engine * 100)}%  oil ${fmt(d.oil * 100)}%  coolant ${fmt(d.coolant * 100)}%${d.fuelLeak ? '  <span class=r>FUEL LEAK</span>' : ''}${d.wrecked ? '  <span class=r>WRECKED</span>' : ''}`,
    `odometer ${fmt(S.odometer / 1000, 2)} km   trip fuel ${fmt(S.tripFuel, 2)} L`,
  ];
  tele.innerHTML = lines.join('\n');
  const now = performance.now(); feedEl.textContent = feedLines.filter(f => now - f.at < 4000).map(f => f.t).join('\n');
}
function buildBar() {
  bar.innerHTML = '';
  const sel = document.createElement('select'); WHEELED_IDS.forEach((id, i) => { const o = document.createElement('option'); o.value = id; o.textContent = `${i + 1} ${WHEELED[id].spec.name}`; sel.appendChild(o); });
  sel.value = V.id; sel.onchange = () => setVehicle(sel.value, {}).then(buildBar); bar.appendChild(sel);
  const zs = document.createElement('select'); Object.entries(ZONES).forEach(([k, z]) => { const o = document.createElement('option'); o.value = k; o.textContent = z.label; zs.appendChild(o); });
  zs.value = curZone; zs.onchange = () => { curZone = zs.value; const z = ZONES[curZone]; teleport(z.x, z.z, z.yaw); }; bar.appendChild(zs);
  for (const m of ['chase', 'cockpit', 'orbit', 'side', 'wheel']) { const b = document.createElement('button'); b.textContent = m; b.className = camMode === m ? 'on' : ''; b.onclick = () => { camMode = m; buildBar(); }; bar.appendChild(b); }
  const sb = document.createElement('button'); sb.textContent = 'sound'; sb.className = sound ? 'on' : ''; sb.onclick = () => { toggleSound(); buildBar(); }; bar.appendChild(sb);
}
async function toggleSound(force) {
  sound = force ?? !sound;
  if (sound && !audio) {
    try { const { WheeledAudio } = await import('../js/units/wheeled/wheeledaudio.js'); const ctx = new (window.AudioContext || window.webkitAudioContext)(); audio = new WheeledAudio(ctx, ctx.destination); }
    catch (err) { console.warn('audio', err.message); }
  }
  if (audio) audio.setEnabled(sound);
}

// ------------------------------------------------------------------------------------------- loop
let last = performance.now(), frames = 0, allEvents = [];
function size() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', size); size();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++;
  if (V.sim) {
    readInput(dt);
    let inp = override || IN;
    if (ai) { const a = aiInput(V.sim, ai.target, ai.speed); inp = { ...IN, ...a, ...(ai.extra || {}) }; }
    if (!paused) {
      const ctl = V.driver.update(V.sim, inp, dt);
      for (const k of ['fwd', 'range', 'lock', 'ignition', 'starter', 'horn', 'kit']) if (inp[k] !== undefined) ctl[k] = inp[k];
      const evs = V.sim.step(dt, ctl, env);
      for (const e of evs) { allEvents.push({ ...e, t: now }); if (!['scrape', 'impact', 'grind', 'lowAir'].includes(e.e)) feed(e.e + (e.wheel !== undefined ? ' ' + V.spec.wheels[e.wheel].id : '') + (e.seat ? ' ' + e.seat : '')); }
      if (allEvents.length > 300) allEvents.splice(0, 100);
      // dust, spray, exhaust
      const S = V.sim;
      for (const W of S.wheels) {
        if (!W.contact) continue;
        const sp = Math.abs(W.omega * W.r), su = W.surf, dust = [0, 0, 0.8, 0.15, 1, 0, 0, 0.3, 0][su] || 0;
        if (W.depthW > 0.1 && Math.abs(S.speed) > 1 && Math.random() < 0.6) emit(W.cx, W.cy + W.depthW, W.cz, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 0xd8e8f0, 0.8);
        else if (dust > 0 && (sp > 3 || W.ts.slipV > 1) && Math.random() < dust * Math.min(1, (sp + W.ts.slipV * 2) / 15)) emit(W.cx, W.cy + 0.2, W.cz, (Math.random() - 0.5) * 1.5 - S.vel[0] * 0.2, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5 - S.vel[2] * 0.2, su === 4 ? 0xd8c08a : su === 5 ? 0x5a4632 : 0xb09a74, 2.2);
        else if (su === 5 && W.ts.slipV > 2 && Math.random() < 0.5) emit(W.cx, W.cy + 0.15, W.cz, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, 0x3a2a1a, 0.9);
      }
      if (S.eng.running && (S.eng.smoke > 0.15 || V.spec.engine.diesel && Math.random() < 0.15)) { const ex = S.worldPoint(V.spec.id === 'm35' ? [0.95, 2.45, -0.62] : [0.35, 0.3, V.spec.dims.L / 2], [0, 0, 0]); emit(ex[0], ex[1], ex[2], (Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3, S.eng.smoke > 0.15 ? 0x222222 : 0x8a8a8a, 1.8); }
      stepParticles(dt);
    }
    // model pose + animation
    const S = V.sim, g = V.model.group;
    g.position.set(S.pos[0], S.pos[1], S.pos[2]); g.quaternion.set(S.q[0], S.q[1], S.q[2], S.q[3]);
    V.look = lookFrom(S, S.lastCtl || {});
    V.model.animate(V.look, dt);
    const inside = camMode === 'cockpit';
    if (V.interior) V.interior.update(V.look, dt, inside);
    for (const s of V.model.shell || []) s.visible = !inside;
    shadowBlob.position.set(S.pos[0], heightAt(S.pos[0], S.pos[2]) + 0.04, S.pos[2]); shadowBlob.scale.set(V.spec.dims.W * 1.3, 1, V.spec.dims.L * 1.15); shadowBlob.rotation.y = -S.heading;
    if (audio) audio.update(V.look, V.sim, dt, inside);
    updateCamera(dt); drawTele(dt);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------------------------------- start + debug bridge
const startId = Q.get('v') || 'm151';
let variant0 = {}; try { if (Q.get('s')) variant0 = JSON.parse(Q.get('s')); } catch { /* ignore */ }
await setVehicle(startId, variant0, Q.get('zone') || 'start');
buildBar();
requestAnimationFrame(frame);
if (DEBUG) {
  window.__V = {
    THREE, scene, camera, renderer, env, ZONES, heightAt, groundAt, waterAt,
    get sim() { return V.sim; }, get driver() { return V.driver; }, get model() { return V.model; }, get interior() { return V.interior; }, get dmg() { return V.dmg; }, get id() { return V.id; }, get look() { return V.look; },
    get events() { return allEvents; }, get frames() { return frames; }, get input() { return IN; },
    setVehicle: (id, v, zone) => setVehicle(id, v || {}, zone || null), teleport: (x, z, yaw) => { teleport(x, z, yaw); return true; }, zone: k => { const z = ZONES[k]; curZone = k; teleport(z.x, z.z, z.yaw); return true; },
    drive: o => { override = o ? { ...IN, ...o } : null; return true; }, ai: (target, speed, extra) => { ai = target ? { target, speed, extra } : null; return true; },
    cam: (m, o = {}) => { camMode = m; Object.assign(cam, o); return true; }, pause: p => { paused = p; return true; }, variant: v => { Object.assign(V.variant, v); V.model.setVariant?.(V.variant); return true; },
    render: () => renderer.render(scene, camera),
  };
}
