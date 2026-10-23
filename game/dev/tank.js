// Armour test ground (dev page): drive the M60A3 TTS (or ?veh=m113 the M113A2) over the obstacle lanes, ford and swim,
// use the turret, the sights (M35E1 day, AN/VSG-2 thermal) and shoot the targets on the range.
// Query: ?veh=m113  ?view=chase|driver|gunner|commander|free|model  ?ui=0  ?res=0.6  ?debug (window.__T bridge)
//        ?at=x,z,yaw (start pose)  ?cam=yaw,pitch,dist (chase / model camera)
import * as THREE from 'three';
import { createM60A3 } from '../js/units/armor/m60a3.js';
import { createM113 } from '../js/units/armor/m113.js';
import { buildM60A3Mesh, TANK } from '../js/units/armor/tankmodel.js';
import { buildM113Mesh } from '../js/units/armor/m113model.js';
import { buildTankInterior, buildM113Interior, M113_EYES } from '../js/units/armor/tankinterior.js';
import { ArmorAudio } from '../js/units/armor/armoraudio.js';
import * as TG from '../js/units/armor/testground.js';
import { newShot, stepShot, ROUNDS, shotSpeed } from '../js/units/armor/armorballistics.js';
import { SOILS } from '../js/units/armor/trackfm.js';

const Q = new URLSearchParams(location.search);
const VEH = Q.get('veh') === 'm113' ? 'm113' : 'm60';
const RES = +(Q.get('res') || 1);
const DEBUG = Q.has('debug');

// ------------------------------------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: RES >= 0.8 });
renderer.setPixelRatio(devicePixelRatio * RES); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9db3c4); scene.background = SKY; scene.fog = new THREE.Fog(SKY, 400, 2600);
const hemi = new THREE.HemisphereLight(0xdce8f0, 0x6a6448, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dc, 1.7); sun.position.set(-0.45, 1, 0.35); scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 6000);
const overlay = document.getElementById('overlay'), octx = overlay.getContext('2d');
const hud = document.getElementById('hud'), logEl = document.getElementById('log');
if (Q.get('ui') === '0') for (const id of ['hud', 'help', 'log']) document.getElementById(id).classList.add('hide');
const logs = [];
const say = (m) => { logs.push(m); if (logs.length > 9) logs.shift(); logEl.textContent = logs.join('\n'); };

// ------------------------------------------------------------------------------------------------ terrain
const SURF_COL = { paved: 0x7b7a74, rock: 0x77736a, dirt: 0x7d6b4c, grass: 0x5d7340, sand: 0xb4a272, mud: 0x4c3d2a, bog: 0x3e3e26, snow: 0xe8ecef };
function terrainMesh(x0, x1, z0, z1, step) {
  const xs = TG.gridLines(x0, x1, step, 'x'), zs = TG.gridLines(z0, z1, step, 'z');
  const pos = [], col = [], c = new THREE.Color(), nx = xs.length, nz = zs.length;
  const H = []; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H.push(TG.height(xs[i], zs[j]));
  const quad = (i, j) => {
    const a = [xs[i], H[j * nx + i], zs[j]], b = [xs[i + 1], H[j * nx + i + 1], zs[j]], cc = [xs[i + 1], H[(j + 1) * nx + i + 1], zs[j + 1]], d = [xs[i], H[(j + 1) * nx + i], zs[j + 1]];
    for (const tri of [[a, d, cc], [a, cc, b]]) {
      const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, mz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3, my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const s = TG.surface(mx, mz); c.setHex(SURF_COL[s] || 0x666666);
      const n = Math.sin(mx * 1.7) * Math.sin(mz * 1.3) * 0.5 + Math.sin(mx * 0.31 + mz * 0.43) * 0.5;
      c.offsetHSL(0, 0, n * 0.035);
      // steep faces (walls, banks) darker; underwater darker / bluer
      const ny = Math.abs((tri[1][2] - tri[0][2]) * (tri[2][0] - tri[0][0]) - (tri[1][0] - tri[0][0]) * (tri[2][2] - tri[0][2]));
      if (my < -0.2) c.lerp(new THREE.Color(0x3a4a48), Math.min(0.6, -my * 0.15));
      for (const p of tri) { pos.push(...p); col.push(c.r, c.g, c.b); }
    }
  };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) quad(i, j);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); m.userData.heat = 0.32; m.userData.terrain = true; return m;
}
scene.add(terrainMesh(-200, 250, -160, 160, 2));
scene.add(terrainMesh(-80, 80, -2260, -160, 20));
// water
const waterM = new THREE.Mesh(new THREE.PlaneGeometry(130, 140).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3e5e66, transparent: true, opacity: 0.72, depthWrite: false }));
waterM.position.set(-125, 0.0, 0); waterM.userData.heat = 0.2; scene.add(waterM);
// trees
{
  const tr = new THREE.CylinderGeometry(0.18, 0.26, 1, 6), cr = new THREE.ConeGeometry(2.4, 1, 8);
  const tm = new THREE.MeshLambertMaterial({ color: 0x4a3c2a, flatShading: true }), cm = new THREE.MeshLambertMaterial({ color: 0x2f4a26, flatShading: true });
  for (const t of TG.TREES) { const g = new THREE.Group(); g.position.set(t.x, TG.height(t.x, t.z), t.z); const a = new THREE.Mesh(tr, tm); a.scale.y = t.h * 0.4; a.position.y = t.h * 0.2; const b = new THREE.Mesh(cr, cm); b.scale.y = t.h * 0.75; b.position.y = t.h * 0.62; g.add(a, b); g.userData.heat = 0.36; g.userData.id = t.id; scene.add(g); t.mesh = g; }
}
// lane signs
function sign(text, x, z) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const k = c.getContext('2d'); k.fillStyle = '#e8e2c8'; k.fillRect(0, 0, 256, 96); k.fillStyle = '#222'; k.font = 'bold 34px Arial'; k.textAlign = 'center'; k.fillText(text, 128, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(); g.position.set(x, TG.height(x, z), z);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshLambertMaterial({ map: t })); p.position.y = 1.9; p.rotation.y = 0; g.add(p);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08).translate(0, 0.8, 0.02), new THREE.MeshLambertMaterial({ color: 0x5a4a32 })));
  scene.add(g);
}
const F = TG.FEATURES;
sign('STEP 0.91 m', 26, -30); sign('TRENCH 2.6 m', 42, -30); sign('60 % SLOPE', 58, -30); sign('30 % SIDE SLOPE', 76, -5); sign('STEP 1.2 m', 94, -30); sign('TRENCH 3.4 m', 110, -30);
sign('MUD', -45, 4); sign('BOG', -45, -46); sign('SAND', -45, 54); sign('FORD 1.2 m', -76, 64); sign('DEEP WATER', -112, 64); sign('ROUGH', 128, 0);
for (const t of TG.TARGETS) if (t.kind === 'panel') sign(t.range + ' m', t.x, t.z + 3);
// targets: plywood panels with a tank silhouette, old hulks
const targetMeshes = {};
for (const t of TG.TARGETS) {
  const g = new THREE.Group(); g.position.set(t.x, TG.height(t.x, t.z), t.z);
  if (t.kind === 'panel') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 180; const k = c.getContext('2d');
    k.fillStyle = '#a69466'; k.fillRect(0, 0, 256, 180); k.fillStyle = '#2b2a22';
    k.fillRect(20, 110, 216, 50); k.fillRect(70, 70, 120, 42); k.fillRect(10, 84, 64, 8);   // a tank silhouette
    k.strokeStyle = '#2b2a22'; k.lineWidth = 3; k.strokeRect(2, 2, 252, 176);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, 0.1).translate(0, t.h / 2, 0), [0, 0, 0, 0, 0, 0].map((_, i) => i === 4 ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ color: 0x7a6a48 })));
    g.add(p); for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12).translate(s * t.w * 0.4, 0.3, 0.2), new THREE.MeshLambertMaterial({ color: 0x5a4a32 })));
    g.userData.heat = 0.55;
  } else {
    const m = new THREE.MeshLambertMaterial({ color: 0x5a4636, flatShading: true });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h * 0.55, t.l).translate(0, t.h * 0.42, 0), m));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, t.h * 0.4, 10).translate(0, t.h * 0.88, 0.4), m));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4, 6).rotateX(Math.PI / 2 + 0.08).translate(0, t.h * 0.95, -2.2), m));
    g.userData.heat = 0.7;   // hot hulks (the range crew keeps a heater in them for the thermal sights)
  }
  scene.add(g); targetMeshes[t.id] = g;
}

// ------------------------------------------------------------------------------------------------ the vehicle
const env = { ...TG.ENV };
const V = VEH === 'm113' ? createM113() : createM60A3();
const fm = V.fm;
const model = VEH === 'm113' ? buildM113Mesh() : buildM60A3Mesh();
scene.add(model.group);
const interior = VEH === 'm60' ? buildTankInterior() : buildM113Interior();
if (VEH === 'm60') { model.hull.add(interior.group); model.turret.add(interior.gunner); model.cupola.add(interior.commander); }
else { model.hull.add(interior.group); model.ramp.add(interior.rampIn); model.hatches.cargo.add(interior.cargoIn); }
let gunLook = false;   // gunner: E looks up from the sight into the station
const at = (Q.get('at') || '0,40,0').split(',').map(Number);
V.reset(at[0], at[1], at[2] || 0, env, { range: 'N' });
const audio = new ArmorAudio();

// ------------------------------------------------------------------------------------------------ input
const keys = new Set(), once = new Set();
addEventListener('keydown', e => { if (e.repeat) return; keys.add(e.code); once.add(e.code); if (e.code === 'Tab') e.preventDefault(); audio.init(); });
addEventListener('keyup', e => keys.delete(e.code));
const IN = { throttle: 0, brake: 0, steer: 0, range: 'N', park: true, trav: 0, elev: 0, fire: false, coax: false, lase: false, dump: false, ammo: 'M735', stab: true, sight: 'day', ttsMag: 8, ttsPolarity: 'wh', fire50: false, cupTrav: 0, cupElev: 0, mgTrav: 0, mgElev: 0, light: 0, starter: false };
let ext = null;   // input override from the debug bridge
let view = Q.get('view') || 'chase';
const VIEWS = VEH === 'm113' ? ['chase', 'driver', 'troops', 'commander', 'free'] : ['chase', 'driver', 'gunner', 'commander', 'free'];
const cam = { yaw: 2.6, pitch: 0.28, dist: 14, look: [0, 0] };
if (Q.get('cam')) { const [y, p, d] = Q.get('cam').split(',').map(Number); Object.assign(cam, { yaw: y, pitch: p, dist: d }); }
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; audio.init(); });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (view === 'chase' || view === 'free' || view === 'model') { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-0.4, Math.min(1.4, cam.pitch + dy * 0.006)); }
  else { cam.look[0] -= dx * 0.004; cam.look[1] = Math.max(-1.2, Math.min(1.2, cam.look[1] - dy * 0.004)); }
});
addEventListener('wheel', e => { cam.dist = Math.max(4, Math.min(120, cam.dist * Math.exp(e.deltaY * 0.001))); });
const hatches = { driver: 0, loader: 0, cupola: 0 };
function readInput(dt) {
  const k = c => keys.has(c), o = c => once.has(c);
  const sm = (v, t, r) => v + Math.max(-r * dt, Math.min(r * dt, t - v));
  IN.throttle = sm(IN.throttle, k('KeyW') ? 1 : 0, 2.5); IN.brake = k('KeyS') ? 1 : 0;
  IN.steer = sm(IN.steer, (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), 3);
  if (VEH === 'm113') { if (o('KeyZ')) IN.range = 'R'; if (o('KeyX')) IN.range = 'N'; if (o('KeyC')) IN.range = '1-2'; if (o('KeyV')) IN.range = '1-3'; }
  else { if (o('KeyZ')) IN.range = 'R'; if (o('KeyX')) IN.range = 'N'; if (o('KeyC')) IN.range = 'L'; if (o('KeyV')) IN.range = 'H'; }
  if (IN.throttle > 0.05 && IN.range !== 'N') IN.park = false;
  if (o('KeyP')) IN.park = !IN.park;
  IN.starter = k('KeyI') && !fm.eng.running; if (o('KeyI') && fm.eng.running) fm.ctl.fuelOn = false; else if (o('KeyI')) fm.ctl.fuelOn = true;
  const gunnerKeys = view === 'gunner' || view === 'chase';
  IN.trav = gunnerKeys ? (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0) : 0; IN.elev = gunnerKeys ? (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0) : 0;
  if (k('ShiftLeft')) { IN.trav *= 0.25; IN.elev *= 0.25; }
  IN.fire = k('Space') && view !== 'commander'; IN.coax = k('KeyF'); IN.lase = o('KeyT'); IN.dump = o('KeyG');
  if (o('Digit1')) IN.ammo = 'M735'; if (o('Digit2')) IN.ammo = 'M456'; if (o('Digit3')) IN.ammo = 'M393';
  if (o('KeyB')) { IN.stab = !IN.stab; say('stabiliser ' + (IN.stab ? 'ON' : 'OFF')); }
  if (o('KeyO')) IN.sight = IN.sight === 'day' ? 'tts' : 'day';
  if (o('BracketLeft')) IN.ttsMag = 3; if (o('BracketRight')) IN.ttsMag = 8;
  if (o('KeyU')) IN.ttsPolarity = IN.ttsPolarity === 'wh' ? 'bh' : 'wh';
  if (o('KeyK')) IN.light = IN.light ? 0 : 1;
  IN.fire50 = (view === 'commander' && k('Space')) || k('KeyM');
  IN.cupTrav = view === 'commander' ? (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0) : 0; IN.cupElev = view === 'commander' ? (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0) : 0;
  IN.mgTrav = IN.cupTrav; IN.mgElev = IN.cupElev;
  if (o('KeyH')) { const open = hatches.cupola < 0.5; hatches.cupola = hatches.loader = hatches.driver = open ? 1 : 0; }
  if (VEH === 'm113') { if (o('KeyR')) IN.ramp = !(IN.ramp); if (o('KeyY')) IN.vane = !(IN.vane); if (o('KeyJ')) IN.pumps = !(IN.pumps); }
  if (o('KeyE') && view === 'gunner') { gunLook = !gunLook; cam.look = [0, 0]; }
  if (o('Tab')) { view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]; cam.look = [0, 0]; }
  once.clear();
}

// ------------------------------------------------------------------------------------------------ shells and effects
const shots = [];
const tracerGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 4).rotateX(Math.PI / 2);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffc070 }), mgTracerMat = new THREE.MeshBasicMaterial({ color: 0xff6040 });
const puffs = [];
const puffGeo = new THREE.SphereGeometry(1, 8, 6);
function puff(p, size, color, life = 1.2, rise = 0.6) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  m.position.set(...p); m.scale.setScalar(size * 0.3); scene.add(m); m.userData.heat = color === 0xffd080 ? 1 : 0.5;
  puffs.push({ m, t: 0, life, size, rise });
}
const holes = new THREE.Group(); scene.add(holes);
const stats = { shots: 0, hits: 0, last: null, impacts: [] };
function fireShot(e) {
  const s = newShot(e.round, e.p, e.dir, e.vel || [0, 0, 0], (Math.random() - 0.5) * 0.002);
  // dispersion: ~0.25 mil for the main gun, 1 mil for machine guns (game)
  const sp = e.weapon === 'main' ? 0.00025 : 0.001; s.v[0] += (Math.random() - 0.5) * 2 * sp * s.round.mv; s.v[1] += (Math.random() - 0.5) * 2 * sp * s.round.mv; s.v[2] += (Math.random() - 0.5) * 2 * sp * s.round.mv;
  s.weapon = e.weapon; s.origin = e.p.slice();
  if (e.weapon === 'main' || e.tracer) { s.mesh = new THREE.Mesh(tracerGeo, e.weapon === 'main' ? tracerMat : mgTracerMat); s.mesh.userData.heat = 1; scene.add(s.mesh); }
  shots.push(s);
  if (e.weapon === 'main') {
    stats.shots++;
    puff(e.p, 3.5, 0xffd080, 0.15, 0); for (let i = 0; i < 4; i++) puff([e.p[0] + e.dir[0] * i * 1.5, e.p[1] + 0.2, e.p[2] + e.dir[2] * i * 1.5], 2.5 + i, 0xb8b0a0, 2.5, 0.4);
    // muzzle blast raises dust in front of the tank
    const o = fm.origin(); for (let i = 0; i < 5; i++) puff([o[0] + e.dir[0] * (6 + i * 1.5) + (Math.random() - 0.5) * 4, TG.height(o[0], o[2]) + 0.6, o[2] + e.dir[2] * (6 + i * 1.5)], 2.5, 0x9a8a6a, 3, 0.3);
    audio.mainGun(); say(`FIRE  ${ROUNDS[e.round].name}`);
  } else audio.mg(e.weapon);
}
function stepShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; let done = false;
    for (let k = 0; k < 4 && !done; k++) {
      stepShot(s, dt / 4);
      const seg = [s.p[0] - s.prev[0], s.p[1] - s.prev[1], s.p[2] - s.prev[2]], L = Math.hypot(...seg), d = seg.map(v => v / L);
      // targets
      for (const t of TG.TARGETS) { const h = TG.rayTarget(t, s.prev, d); if (h != null && h <= L) { impact(s, [s.prev[0] + d[0] * h, s.prev[1] + d[1] * h, s.prev[2] + d[2] * h], t); done = true; break; } }
      if (!done && s.p[1] < TG.height(s.p[0], s.p[2])) { impact(s, s.p.slice(), null); done = true; }
      if (s.t > 8) done = true;
    }
    if (s.mesh) { const v = shotSpeed(s); s.mesh.position.set(...s.p); s.mesh.lookAt(s.p[0] + s.v[0], s.p[1] + s.v[1], s.p[2] + s.v[2]); s.mesh.scale.set(1, 1, Math.min(14, v * 0.012)); }
    if (done) { if (s.mesh) scene.remove(s.mesh); shots.splice(i, 1); }
  }
}
function impact(s, p, target) {
  const big = s.round.cal >= 100, range = Math.hypot(p[0] - s.origin[0], p[2] - s.origin[2]);
  if (target) {
    stats.hits += big ? 1 : 0;
    const g = targetMeshes[target.id], hole = new THREE.Mesh(new THREE.CircleGeometry(big ? 0.09 : 0.03, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    hole.position.set(p[0], p[1], p[2] + 0.06); holes.add(hole);
    if (big) { puff(p, 2, s.round.kind === 'KE' ? 0xd0c8b0 : 0xffb050, 0.6, 0.2); say(`HIT ${target.id} at ${range.toFixed(0)} m  (${s.round.short})`); stats.last = { target: target.id, range, round: s.round.id, p }; }
  } else {
    if (big) { puff(p, s.round.kind === 'KE' ? 2 : 4, 0x8a7a5a, 3, 0.5); if (s.weapon === 'main') say(`miss: ground at ${range.toFixed(0)} m`); stats.impacts.push(p); }
    else if (Math.random() < 0.3) puff(p, 0.4, 0x8a7a5a, 0.8, 0.2);
  }
  audio.impact(big, Math.hypot(p[0] - camera.position.x, p[2] - camera.position.z));
}

// ------------------------------------------------------------------------------------------------ cameras
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
function hullPoint(b, out = new THREE.Vector3()) { const w = fm.toWorld(b); return out.set(w[0], w[1], w[2]); }
function turretPoint(p, out = new THREE.Vector3()) { const w = V.turretPoint(p); return out.set(w[0], w[1], w[2]); }
let sightActive = false, thermal = false, fovWanted = 55;
function updateCamera(dt) {
  const o = fm.origin(); sightActive = false; thermal = false;
  let inside = false;
  if (view === 'chase' || view === 'free' || view === 'model') {
    const tgt = new THREE.Vector3(o[0], o[1] + 1.6, o[2]);
    const yaw = cam.yaw + (view === 'chase' ? fm.out.heading : 0);
    camera.position.set(tgt.x + Math.sin(yaw) * Math.cos(cam.pitch) * cam.dist, tgt.y + Math.sin(cam.pitch) * cam.dist, tgt.z + Math.cos(yaw) * Math.cos(cam.pitch) * cam.dist);
    camera.position.y = Math.max(camera.position.y, TG.height(camera.position.x, camera.position.z) + 0.6);
    camera.lookAt(tgt); fovWanted = 50;
  } else if (view === 'driver' || view === 'troops') {
    const eye = VEH === 'm113' ? M113_EYES[view === 'driver' ? 'driver' : 'troops'] : TANK.DRIVER_EYE;
    // hatch open (H): the driver puts his head out (eye 0.55 m up, out of the hull)
    const headOut = view === 'driver' && hatches.driver > 0.5;
    hullPoint(headOut ? [eye[0], eye[1] + 0.55, eye[2] + 0.05] : eye, camera.position); inside = !headOut;
    _q.set(fm.q.x, fm.q.y, fm.q.z, fm.q.w);
    _e.set(cam.look[1] - (view === 'driver' ? 0.12 : 0.1), cam.look[0] + (view === 'troops' ? 0 : 0), 0, 'YXZ');
    camera.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromEuler(_e)); fovWanted = 70;
  } else if (view === 'gunner' && gunLook && VEH === 'm60') {
    turretPoint(TANK.GUNNER_EYE_T, camera.position); inside = true;
    _e.set(cam.look[1] - 0.1, fm.out.heading + V.az + cam.look[0], 0, 'YXZ'); camera.quaternion.setFromEuler(_e); fovWanted = 75;
  } else if (view === 'gunner') {
    // the sight picture: along the sight line from the sight head; magnification by FOV
    turretPoint([0.55, 0.85, -0.9], camera.position);
    const d = V.sightDir(); camera.up.copy(hullUp()); camera.lookAt(camera.position.x + d[0], camera.position.y + d[1], camera.position.z + d[2]);
    sightActive = true; thermal = V.sight === 'tts' && V.ttsCool > 0.95;
    fovWanted = V.sight === 'tts' ? (V.ttsMag === 3 ? 13.5 : 5.0) : 6.0;   // game FOVs: day 8x, TTS 3x / 8x
  } else if (view === 'commander') {
    turretPoint([TANK.COMMANDER_EYE_T[0], 1.09 + (hatches.cupola > 0.5 ? 0.55 : 0), TANK.COMMANDER_EYE_T[2]], camera.position);
    const az = fm.out.heading + V.az + (V.mg50 ? V.mg50.az : 0) + cam.look[0];
    _e.set(cam.look[1] + (V.mg50 ? V.mg50.el : 0) * 0.5, az, 0, 'YXZ'); camera.quaternion.setFromEuler(_e); fovWanted = 60;
    inside = hatches.cupola < 0.5;
  }
  if (Math.abs(camera.fov - fovWanted) > 0.01) { camera.fov = fovWanted; camera.updateProjectionMatrix(); }
  return inside;
}
function hullUp() { const R = fm.R; return _v.set(R[1], R[4], R[7]); }

// ------------------------------------------------------------------------------------------------ thermal view
// TTS: every object renders with a flat "heat" grey (userData.heat, inherited down the tree; vehicles hot at the engine
// deck, exhaust and running gear), then a post pass adds the green phosphor, scan lines, noise and polarity.
const heatMats = new Map();
const heatMat = h => { const k = Math.round(h * 40); if (!heatMats.has(k)) heatMats.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k / 40) })); return heatMats.get(k); };
function heatOf(o) { for (let p = o; p; p = p.parent) if (p.userData.heat != null) return p.userData.heat; return 0.35; }
const swapped = [];
function thermalSwap(on) {
  if (on) scene.traverse(o => { if (o.isMesh || o.isInstancedMesh) { swapped.push([o, o.material]); o.material = heatMat(heatOf(o)); } });
  else { for (const [o, m] of swapped) o.material = m; swapped.length = 0; }
}
// vehicle heat: engine deck / exhaust hot, running gear warm, hull cooler
function tagHeat() {
  model.group.userData.heat = 0.48;
  model.group.traverse(o => { if (o.name && /runningGear/.test(o.name)) o.userData.heat = 0.72; });
}
tagHeat();
const rt = new THREE.WebGLRenderTarget(16, 16);
const post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { tex: { value: rt.texture }, time: { value: 0 }, pol: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `uniform sampler2D tex; uniform float time; uniform float pol; uniform vec2 res; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.) * 43758.5453); }
    void main(){
      vec2 uv = vUv; float g = texture2D(tex, uv).r;
      g = mix(g, 1. - g, pol);
      float lines = 0.86 + 0.14 * step(0.5, fract(uv.y * res.y / 3.));
      g = clamp((g - 0.18) * 1.6, 0., 1.) * lines + (h(floor(uv * res / 2.)) - 0.5) * 0.12;
      gl_FragColor = vec4(g * 0.35, g * 1.0, g * 0.32, 1.);
    }`,
  depthTest: false, depthWrite: false,
}));
const postScene = new THREE.Scene(); postScene.add(post); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ------------------------------------------------------------------------------------------------ reticles (2D overlay)
function drawSight() {
  const W = overlay.width, H = overlay.height, c = octx; c.clearRect(0, 0, W, H);
  overlay.style.visibility = sightActive ? 'visible' : 'hidden';   // (a cleared 2D canvas layer is not always re-composited in headless Chrome)
  if (!sightActive) return;
  const R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
  // eyepiece vignette
  c.save(); c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, R, 0, Math.PI * 2, true); c.fill(); c.restore();
  const tts = V.sight === 'tts', col = tts ? (V.ttsCool > 0.95 ? 'rgba(170,255,150,0.95)' : 'rgba(170,255,150,0.6)') : 'rgba(20,20,20,0.9)';
  const pxPerRad = (H / 2) / Math.tan(camera.fov * Math.PI / 360);
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(1, H / 500);
  // the aiming cross with a central gap and mil ticks (1 mil = 1/1000 rad, game)
  const gap = 0.6e-3 * pxPerRad;
  c.beginPath(); c.moveTo(cx - R * 0.9, cy); c.lineTo(cx - gap, cy); c.moveTo(cx + gap, cy); c.lineTo(cx + R * 0.9, cy); c.moveTo(cx, cy + gap); c.lineTo(cx, cy + R * 0.6); c.stroke();
  for (let m = -10; m <= 10; m++) { if (!m) continue; const x = cx + m * 1e-3 * pxPerRad * 2, t = m % 5 ? 4 : 9; if (Math.abs(x - cx) < R * 0.9) { c.beginPath(); c.moveTo(x, cy - t); c.lineTo(x, cy + t); c.stroke(); } }
  c.beginPath(); c.arc(cx, cy, gap * 0.3, 0, Math.PI * 2); c.fill();
  // readouts at the bottom of the field: range, ammunition, ready, stab, mode
  c.font = `bold ${Math.round(H / 38)}px "Courier New", monospace`; c.textAlign = 'center';
  const rng = V.laser.range != null ? String(V.laser.range).padStart(4, '0') : '----';
  const g = V.gun;
  const txt = `${rng}  ${ROUNDS[g.round || V.next].short}  ${g.state === 'ready' ? 'READY' : g.state === 'loading' ? 'LOAD ' : 'EMPTY'}`;
  c.fillStyle = tts ? 'rgba(170,255,150,0.95)' : 'rgba(255,90,40,0.95)';
  c.fillText(txt, cx, cy + R * 0.82);
  c.font = `${Math.round(H / 48)}px "Courier New", monospace`;
  c.fillText(`${tts ? 'TTS ' + V.ttsMag + 'X ' + (V.ttsPolarity === 'wh' ? 'WH' : 'BH') : 'DAY 8X'}   ${V.stab && V.hydP > 0.5 ? 'STAB' : 'POWER'}${V.fc.solved ? '   COMP ' + V.fc.range : '   BS 1200'}`, cx, cy - R * 0.85);
  if (tts && V.ttsCool <= 0.95) c.fillText(`COOLING ${Math.round(V.ttsCool * 100)} %`, cx, cy - R * 0.2);
}

// ------------------------------------------------------------------------------------------------ HUD
function hudText() {
  const e = fm.eng, a = fm.attitude(), s = fm.out;
  const lines = [
    `${VEH === 'm113' ? 'M113A2' : 'M60A3 TTS'}  view ${view.toUpperCase()}   ${(s.fwd * 3.6).toFixed(1)} km/h   range ${fm.range}${fm.lockup ? ' LU' : ''}${IN.park ? ' PARK' : ''}`,
    `engine ${e.running ? 'RUN' : e.flooded ? 'FLOODED' : 'OFF'} ${(e.w * 9.549).toFixed(0)} rpm  load ${(e.load * 100).toFixed(0)} %  fuel ${e.fuel.toFixed(0)} L   conv SR ${s.conv.sr.toFixed(2)}`,
    `pitch ${(a.pitch * 57.3).toFixed(1)}°  roll ${(a.roll * 57.3).toFixed(1)}°   soil ${fm.soil.join('/')}  sink ${(fm.sink[0] * 100).toFixed(0)} cm  slip ${fm.slip.map(v => (v * 100).toFixed(0)).join('/')} %`,
    `water ${fm.water.depth.toFixed(2)} m${fm.water.afloat ? ' AFLOAT' : ''}  inside ${fm.water.inside.toFixed(2)} m3${fm.dmg.thrown[0] || fm.dmg.thrown[1] ? '  TRACK THROWN' : ''}${fm.state.bellied ? '  BELLIED' : ''}`,
  ];
  if (VEH === 'm60') lines.push(`turret ${(V.az * 57.3).toFixed(1)}° gun ${(V.el * 57.3).toFixed(2)}°  ${V.stab ? 'STAB' : 'POWER'}  gun ${V.gun.state} ${V.gun.round || ''}  next ${V.next}  rounds ${V.ammoTotal()}  coax ${V.coax.ammo}  .50 ${V.mg50.ammo}`);
  else lines.push(`ramp ${(V.ramp * 100).toFixed(0)} %  vane ${(V.vane * 100).toFixed(0)} %  pumps ${fm.water.pumps ? 'ON' : 'off'}  troops ${V.seats.filter(Boolean).length}/11  .50 ${V.mg.ammo}`);
  hud.textContent = lines.join('\n');
}

// ------------------------------------------------------------------------------------------------ loop
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); overlay.width = w; overlay.height = h; rt.setSize(w * devicePixelRatio * RES, h * devicePixelRatio * RES); post.material.uniforms.res.value.set(rt.width, rt.height); }
addEventListener('resize', size); size();
let last = performance.now(), time = 0, paused = false;
function simStep(dt) {
  readInput(dt);
  const inp = ext ? { ...IN, ...ext } : IN;
  const evs = V.step(dt, env, inp);
  for (const e of evs) {
    if (e.type === 'shot') fireShot(e);
    if (e.type === 'loaded') audio.loaded();
    else if (['stall', 'flooded', 'thrown', 'bellied', 'rollover', 'swimming', 'sinking', 'knockdown', 'lase', 'loaded', 'halon', 'bailout', 'start'].includes(e.type)) say(e.type.toUpperCase() + ' ' + (e.range ?? e.where ?? e.why ?? (e.on != null ? (e.on ? 'on' : 'off') : '') ?? ''));
    if (e.type === 'knockdown') { const t = TG.TREES.find(t => t.id === e.id); if (t && t.mesh) { t.mesh.rotation.z = 1.4; t.top = -1e9; } }
  }
  stepShots(dt);
  for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; const f = p.t / p.life; p.m.scale.setScalar(p.size * (0.3 + f)); p.m.position.y += p.rise * dt; p.m.material.opacity = 0.8 * (1 - f); if (f >= 1) { scene.remove(p.m); puffs.splice(i, 1); } }
  time += dt;
}
function syncModel() {
  const o = fm.origin(); model.group.position.set(o[0], o[1], o[2]); model.group.quaternion.set(fm.q.x, fm.q.y, fm.q.z, fm.q.w);
  const travel = fm.wheels.map(side => side.map(w => w.on ? w.s : Math.min(w.s, -0.0)));
  if (VEH === 'm60') {
    for (const k of Object.keys(hatches)) hatches[k] = hatches[k];
    model.animate({ travel, trackPos: fm.trackPos, thrown: fm.dmg.thrown, az: V.az, el: V.el, recoil: V.gun.recoil, cupAz: V.mg50.az, mgEl: V.mg50.el, hatches, tts: 1, light: IN.light, inside: false });
  } else model.animate({ travel, trackPos: fm.trackPos, thrown: fm.dmg.thrown, mgAz: V.mg.az, mgEl: V.mg.el, ramp: V.ramp, vane: V.vane, hatches, inside: false });
}
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // (the first rAF time can be earlier than the load time)
  if (!paused) simStep(dt);
  syncModel();
  const inside = updateCamera(dt);
  if (model.setInside) model.setInside(inside); else for (const m of model.shell) m.visible = !inside;
  updateInterior(inside, dt);
  render();
  hudText(); drawSight();
  audio.update(V, VEH, { inside, view, dt, cam: camera.position });
  requestAnimationFrame(frame);
}
function updateInterior(inside, dt) {
  if (VEH === 'm60') {
    interior.group.visible = inside && view === 'driver'; interior.gunner.visible = view === 'gunner' && gunLook; interior.commander.visible = view === 'commander' && hatches.cupola < 0.5;
    if (interior.group.visible || interior.gunner.visible || interior.commander.visible) interior.update(V, IN, dt);
  } else {
    interior.driver.visible = inside && view === 'driver'; interior.troops.visible = view === 'troops' || (inside && view === 'driver');
    interior.update(V, IN, dt);
  }
}
function render() {
  if (thermal) {
    thermalSwap(true); scene.background = new THREE.Color(0x3a3a3a); scene.fog.color.setScalar(0.23);
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
    thermalSwap(false); scene.background = SKY; scene.fog.color.copy(SKY);
    post.material.uniforms.time.value = time; post.material.uniforms.pol.value = V.ttsPolarity === 'bh' ? 1 : 0;
    renderer.render(postScene, postCam);
  } else renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------------------------------------ debug bridge
if (DEBUG) window.__T = {
  V, fm, model, scene, camera, renderer, env, TG, IN, THREE, stats, interior, audio, hatches,
  get keys() { return [...keys]; }, get sightActive() { return sightActive; }, get gunLook() { return gunLook; }, set gunLook(v) { gunLook = v; },
  get view() { return view; }, set view(v) { view = v; cam.look = [0, 0]; }, cam,
  input(o) { ext = o ? { ...(ext || {}), ...o } : null; },               // override inputs (persisting) / null to release
  reset(x, z, yaw, o) { V.reset(x, z, yaw, env, o); },
  pause(p) { paused = p; }, step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) simStep(dt); syncModel(); },
  render() { syncModel(); const inside = updateCamera(0); if (model.setInside) model.setInside(inside); updateInterior(inside, 0); render(); drawSight(); },
  aimAt(x, y, z) {   // lay the sight line on a world point (relative to the hull)
    const R = fm.R, p = V.turretPoint([0.55, 0.85, -0.9]), d = [x - p[0], y - p[1], z - p[2]], l = Math.hypot(...d);
    const b = [R[0] * d[0] + R[3] * d[1] + R[6] * d[2], R[1] * d[0] + R[4] * d[1] + R[7] * d[2], R[2] * d[0] + R[5] * d[1] + R[8] * d[2]].map(v => v / l);
    V.losAz = Math.atan2(-b[0], -b[2]); V.losEl = Math.asin(b[1]);
  },
};
